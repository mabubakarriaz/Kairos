// iCalendar (.ics) → flat event instances, windowed and resolved to UTC.
//
// Google's "Secret address in iCal format" feed hands us VEVENTs with TZID-bearing
// times, recurrence rules (RRULE), exceptions (EXDATE), and per-occurrence overrides
// (RECURRENCE-ID). ical.js does the heavy lifting: we register the feed's VTIMEZONEs,
// then walk each event — expanding recurring ones occurrence-by-occurrence across the
// sync window. Hand-rolling that is the classic trap; this module keeps ical.js
// contained behind a plain data shape.

import ICAL from "ical.js";
import { zonedWallClockToUtc } from "@/lib/timezone";

/** One concrete event instance, resolved to UTC. A recurring event yields many. */
export interface IcsEvent {
  /** Stable per-instance id: the VEVENT UID plus this occurrence's start. */
  uid: string;
  title: string;
  startUtc: string; // ISO-8601 UTC
  endUtc: string; // ISO-8601 UTC
  allDay: boolean;
}

/** Runaway backstop on the recurrence walk per event. This counts *iterations*,
 *  not emitted instances: a daily meeting that started years ago must be walked
 *  forward (cheaply) to reach the window, so the guard sits well above any sane
 *  history (≈27 years of daily occurrences) and only trips on pathological rules. */
const MAX_RECUR_ITERATIONS = 10_000;

/** Minimum rendered duration; zero/negative-length events get this floor. */
const MIN_EVENT_MINUTES = 15;

interface ParseOptions {
  /** Window to materialise instances within, half-open [start, end). */
  windowStartUtc: string;
  windowEndUtc: string;
  /** Zone to anchor all-day (date-only) events to local midnight. */
  tz: string;
}

/**
 * Parse an .ics document into UTC-resolved event instances overlapping the window.
 * Throws on malformed input; the caller turns that into a per-calendar sync error.
 */
export function parseIcsEvents(icsText: string, opts: ParseOptions): IcsEvent[] {
  const jcal = ICAL.parse(icsText);
  const root = new ICAL.Component(jcal);

  // Register the feed's own timezones so TZID-bearing times resolve correctly.
  for (const vtz of root.getAllSubcomponents("vtimezone")) {
    const tzid = vtz.getFirstPropertyValue("tzid") as string | null;
    if (tzid && !ICAL.TimezoneService.has(tzid)) {
      ICAL.TimezoneService.register(vtz);
    }
  }

  const windowStartMs = new Date(opts.windowStartUtc).getTime();
  const windowEndMs = new Date(opts.windowEndUtc).getTime();
  const out: IcsEvent[] = [];

  for (const vevent of root.getAllSubcomponents("vevent")) {
    // Skip cancelled events outright.
    const status = vevent.getFirstPropertyValue("status");
    if (typeof status === "string" && status.toUpperCase() === "CANCELLED") continue;

    let event: InstanceType<typeof ICAL.Event>;
    try {
      event = new ICAL.Event(vevent);
    } catch {
      continue; // unreadable VEVENT — skip rather than fail the whole feed
    }
    // Recurrence-override fragments are folded into their parent by ical.js; skip
    // the standalone RECURRENCE-ID shards so we don't double-count.
    if (event.isRecurrenceException()) continue;

    const title = cleanTitle(event.summary);

    if (!event.isRecurring()) {
      const inst = toInstance(event.uid, title, event.startDate, event.endDate, opts.tz);
      if (inst && overlaps(inst, windowStartMs, windowEndMs)) out.push(inst);
      continue;
    }

    // Recurring: walk occurrences forward to the window, emitting those inside it,
    // and stop once we pass its end. Iterating from DTSTART keeps the RRULE anchor
    // correct; pre-window occurrences are skipped (not emitted) below.
    const iterator = event.iterator();
    let iterations = 0;
    let next: InstanceType<typeof ICAL.Time> | null;
    while ((next = iterator.next()) && iterations < MAX_RECUR_ITERATIONS) {
      iterations++;
      const startMs = next.toJSDate().getTime();
      if (startMs >= windowEndMs) break;
      const details = event.getOccurrenceDetails(next);
      // details.endDate already reflects this occurrence's duration / overrides.
      if (details.endDate.toJSDate().getTime() <= windowStartMs) continue;
      const inst = toInstance(
        `${event.uid}::${startMs}`,
        cleanTitle(details.item.summary) || title,
        details.startDate,
        details.endDate,
        opts.tz,
      );
      if (inst) out.push(inst);
    }
  }

  return out;
}

/** Convert an ical.js start/end pair to a UTC instance, flooring tiny durations. */
function toInstance(
  uidBase: string,
  title: string,
  start: InstanceType<typeof ICAL.Time>,
  end: InstanceType<typeof ICAL.Time> | null,
  tz: string,
): IcsEvent | null {
  const allDay = Boolean(start.isDate);
  let startUtc: string;
  let endUtc: string;

  if (allDay) {
    // Date-only values are floating; anchor them to local midnight in the view zone.
    startUtc = zonedWallClockToUtc(isoDate(start), "00:00", tz);
    const endDate = end && !sameDate(start, end) ? end : addDay(start);
    endUtc = zonedWallClockToUtc(isoDate(endDate), "00:00", tz);
  } else {
    const startMs = start.toJSDate().getTime();
    let endMs = end ? end.toJSDate().getTime() : startMs;
    if (endMs <= startMs) endMs = startMs + MIN_EVENT_MINUTES * 60_000;
    startUtc = new Date(startMs).toISOString();
    endUtc = new Date(endMs).toISOString();
  }

  if (new Date(endUtc).getTime() <= new Date(startUtc).getTime()) return null;
  return { uid: uidBase, title: title || "(busy)", startUtc, endUtc, allDay };
}

function overlaps(e: IcsEvent, windowStartMs: number, windowEndMs: number): boolean {
  return new Date(e.startUtc).getTime() < windowEndMs && new Date(e.endUtc).getTime() > windowStartMs;
}

function cleanTitle(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 140) : "";
}

function isoDate(t: InstanceType<typeof ICAL.Time>): string {
  return `${String(t.year).padStart(4, "0")}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
}

function sameDate(a: InstanceType<typeof ICAL.Time>, b: InstanceType<typeof ICAL.Time>): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function addDay(t: InstanceType<typeof ICAL.Time>): InstanceType<typeof ICAL.Time> {
  const next = t.clone();
  next.day += 1;
  return next;
}
