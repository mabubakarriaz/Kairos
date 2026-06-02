import "server-only";
import { getSupabase } from "@/lib/supabase";
import { listEnabledCalendars } from "@/server/calendars";
import { parseIcsEvents } from "@/lib/ics";
import { addDays, todayInTz } from "@/lib/time";
import { zonedDayStartUtc } from "@/lib/timezone";
import type { Calendar } from "@/lib/types";

// How far back / ahead we materialise external events. Navigating within this
// window is instant; beyond it the grid simply shows nothing from Google.
const WINDOW_BACK_DAYS = 7;
const WINDOW_AHEAD_DAYS = 60;

// Treat a calendar as needing a refresh once its last successful sync is older
// than this. A normal page load inside the window does zero network.
const STALE_MS = 10 * 60_000;

// Per-feed fetch ceiling — a hung calendar host can't stall a page render.
const FETCH_TIMEOUT_MS = 8_000;

// Rows per insert batch (Postgres/PostgREST stay happy well under this).
const INSERT_CHUNK = 500;

interface SyncSummary {
  ran: boolean;
  synced: number;
  failed: number;
}

/** The [start, end) UTC window we sync, anchored to today in the view zone. */
function syncWindow(tz: string): { startUtc: string; endUtc: string } {
  const today = todayInTz(tz);
  return {
    startUtc: zonedDayStartUtc(addDays(today, -WINDOW_BACK_DAYS), tz),
    endUtc: zonedDayStartUtc(addDays(today, WINDOW_AHEAD_DAYS), tz),
  };
}

async function fetchIcs(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "text/calendar, text/plain, */*" },
    });
    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? "Feed not found (404) — check the secret iCal URL."
          : `Feed responded ${res.status}.`,
      );
    }
    const text = await res.text();
    // A private feed behind a login wall returns HTML, not iCalendar.
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      throw new Error("That URL didn't return an iCalendar feed. Use the secret iCal address.");
    }
    return text;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Feed timed out.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch, parse, and reconcile one calendar's events into the window. */
async function syncOne(cal: Calendar, tz: string): Promise<void> {
  const supabase = getSupabase();
  const { startUtc, endUtc } = syncWindow(tz);

  let events;
  try {
    const ics = await fetchIcs(cal.icsUrl);
    events = parseIcsEvents(ics, { windowStartUtc: startUtc, windowEndUtc: endUtc, tz });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from("calendars").update({ last_sync_error: message }).eq("id", cal.id);
    throw e;
  }

  // Reconcile by replacing this calendar's events within the window. The window
  // is bounded, so a clean delete-then-insert is simpler and more robust than a
  // diff, and stays correct when Google drops or moves an event.
  const { error: delErr } = await supabase
    .from("scheduled_blocks")
    .delete()
    .eq("calendar_id", cal.id)
    .eq("source", "gcal")
    .lt("start_utc", endUtc)
    .gt("end_utc", startUtc);
  if (delErr) {
    await supabase.from("calendars").update({ last_sync_error: delErr.message }).eq("id", cal.id);
    throw new Error(delErr.message);
  }

  const rows = events.map((e) => ({
    source: "gcal" as const,
    calendar_id: cal.id,
    external_id: e.uid,
    title: e.title,
    start_utc: e.startUtc,
    end_utc: e.endUtc,
  }));

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const { error: insErr } = await supabase
      .from("scheduled_blocks")
      .insert(rows.slice(i, i + INSERT_CHUNK));
    if (insErr) {
      await supabase.from("calendars").update({ last_sync_error: insErr.message }).eq("id", cal.id);
      throw new Error(insErr.message);
    }
  }

  await supabase
    .from("calendars")
    .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
    .eq("id", cal.id);
}

/** Sync every enabled calendar. Failures are isolated per calendar. */
export async function syncAllCalendars(tz: string): Promise<SyncSummary> {
  const calendars = await listEnabledCalendars();
  if (calendars.length === 0) return { ran: false, synced: 0, failed: 0 };

  const results = await Promise.allSettled(calendars.map((c) => syncOne(c, tz)));
  let synced = 0;
  let failed = 0;
  for (const r of results) (r.status === "fulfilled" ? synced++ : failed++);
  return { ran: true, synced, failed };
}

// In-memory throttle so repeated triggers within one warm server instance (e.g.
// several view components rendering in one request) collapse to a single sync,
// and a permanently-broken feed isn't re-fetched on every single page load.
let lastAttemptMs = 0;
let inFlight: Promise<SyncSummary> | null = null;

/**
 * Sync only when something is actually stale: any enabled calendar never synced,
 * synced over STALE_MS ago, or currently in error. Concurrent callers share one
 * in-flight sync. Never throws — sync is best-effort background work behind a read.
 */
export async function syncCalendarsIfStale(tz: string): Promise<SyncSummary> {
  const now = Date.now();
  if (inFlight) return inFlight;
  if (now - lastAttemptMs < STALE_MS) return { ran: false, synced: 0, failed: 0 };

  const promise = (async (): Promise<SyncSummary> => {
    // Stamp the attempt up front so a warm instance only re-checks once per
    // window — even when feeds are fresh or permanently failing.
    lastAttemptMs = now;
    try {
      const calendars = await listEnabledCalendars();
      if (calendars.length === 0) return { ran: false, synced: 0, failed: 0 };
      const stale = calendars.some(
        (c) =>
          c.lastSyncError != null ||
          c.lastSyncedAt == null ||
          now - new Date(c.lastSyncedAt).getTime() > STALE_MS,
      );
      if (!stale) return { ran: false, synced: 0, failed: 0 };
      return await syncAllCalendars(tz);
    } catch {
      return { ran: false, synced: 0, failed: 0 };
    } finally {
      inFlight = null;
    }
  })();

  inFlight = promise;
  return promise;
}
