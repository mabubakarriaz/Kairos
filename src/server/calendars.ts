import "server-only";
import { getSupabase } from "@/lib/supabase";
import { registerLabel } from "@/server/labels";
import type { Calendar } from "@/lib/types";

type Result = { ok: true; id?: string } | { ok: false; error: string };

interface CalendarRow {
  id: string;
  name: string;
  ics_url: string;
  label: string;
  enabled: boolean;
  show_on_grid: boolean;
  position: number;
  last_synced_at: string | null;
  last_sync_error: string | null;
}

function toCalendar(row: CalendarRow): Calendar {
  return {
    id: row.id,
    name: row.name,
    icsUrl: row.ics_url,
    label: row.label,
    enabled: row.enabled,
    showOnGrid: row.show_on_grid,
    position: row.position,
    lastSyncedAt: row.last_synced_at,
    lastSyncError: row.last_sync_error,
  };
}

const SELECT =
  "id, name, ics_url, label, enabled, show_on_grid, position, last_synced_at, last_sync_error";

/** Every attached calendar, ordered by position then creation. */
export async function listCalendars(): Promise<Calendar[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("calendars")
    .select(SELECT)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load calendars: ${error.message}`);
  return (data as CalendarRow[] | null ?? []).map(toCalendar);
}

/** Just the enabled calendars (the ones sync actually fetches). */
export async function listEnabledCalendars(): Promise<Calendar[]> {
  return (await listCalendars()).filter((c) => c.enabled);
}

/** Attach a new calendar. Registers its label so it shows in settings + can take a budget. */
export async function createCalendar(input: {
  name: string;
  icsUrl: string;
  label: string;
}): Promise<Result> {
  const supabase = getSupabase();
  await registerLabel(input.label); // best-effort; label is the point of the calendar

  // Append to the end of the list.
  const { data: last } = await supabase
    .from("calendars")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((last as { position: number } | null)?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("calendars")
    .insert({ name: input.name, ics_url: input.icsUrl, label: input.label, position })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not attach the calendar." };
  return { ok: true, id: (data as { id: string }).id };
}

/** Edit a calendar's name, URL, and/or label. Re-registers the label if it changed. */
export async function updateCalendar(
  id: string,
  patch: { name: string; icsUrl: string; label: string },
): Promise<Result> {
  const supabase = getSupabase();
  await registerLabel(patch.label);
  // A changed URL or label invalidates the synced events; let the next sync rebuild.
  const { error } = await supabase
    .from("calendars")
    .update({ name: patch.name, ics_url: patch.icsUrl, label: patch.label, last_synced_at: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Enable/disable a calendar. Disabling stops sync; its events are cleared. */
export async function setCalendarEnabled(id: string, enabled: boolean): Promise<Result> {
  const supabase = getSupabase();
  const { error } = await supabase.from("calendars").update({ enabled }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (!enabled) {
    // Drop its events from the grid; re-enabling re-syncs them.
    await supabase.from("scheduled_blocks").delete().eq("calendar_id", id).eq("source", "gcal");
  }
  return { ok: true };
}

/** Show or hide a calendar's events on the grid. Unlike disabling, the calendar
 *  stays synced and its meetings still count as busy for free-slots; only the
 *  rendered blocks are suppressed (the filtering happens in getBlocksInRange). */
export async function setCalendarVisibility(id: string, showOnGrid: boolean): Promise<Result> {
  const supabase = getSupabase();
  const { error } = await supabase.from("calendars").update({ show_on_grid: showOnGrid }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Detach a calendar. The FK cascade removes its events. */
export async function deleteCalendar(id: string): Promise<Result> {
  const supabase = getSupabase();
  const { error } = await supabase.from("calendars").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
