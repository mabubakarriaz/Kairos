// Grid math + day-window for Kairos. Storage is UTC end-to-end; the values
// flowing through these functions are TZ-aware because the *day* boundary is
// taken at local midnight in the active zone (see src/lib/timezone.ts).
// As long as `dayStartUtc` is the UTC instant of local midnight, "minutes
// from day start" linearly maps to local wall-clock minutes, and the renderer
// stays zone-agnostic.

import { todayInZone, zonedDayStartUtc, zonedWallClockToUtc } from "@/lib/timezone";

/** Minutes per grid slot — the schedule snaps drags/free-slots to this. */
export const SLOT_MINUTES = 15;

/** Pixels per minute. 96px/hour ⇒ 1.6px/min; a 15-min slot ≈ 24px. Matches globals.css. */
export const PX_PER_MIN = 1.6;

export const DAY_MINUTES = 24 * 60;

/** Today's calendar date (YYYY-MM-DD) as the active zone reads the clock now. */
export function todayInTz(timeZone: string): string {
  return todayInZone(timeZone);
}

/** Validate a yyyy-mm-dd string, falling back to today (in zone) if missing/invalid. */
export function normalizeDate(input: string | undefined | null, timeZone: string): string {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input) && !Number.isNaN(Date.parse(`${input}T00:00:00Z`))) {
    return input;
  }
  return todayInTz(timeZone);
}

/** Half-open UTC window [local-midnight, next-local-midnight) for a date in zone. */
export function dayWindow(date: string, timeZone: string): { startUtc: string; endUtc: string } {
  const startUtc = zonedDayStartUtc(date, timeZone);
  const endUtc = zonedDayStartUtc(addDays(date, 1), timeZone);
  return { startUtc, endUtc };
}

/** Number of columns rendered side-by-side in the week view. */
export const WEEK_DAYS = 7;

/** YYYY-MM-DD of the Monday in the calendar week containing `date`. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const dow = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const back = (dow + 6) % 7; // Sun→6, Mon→0, Tue→1, ..., Sat→5
  return addDays(date, -back);
}

/** Half-open UTC window covering the Monday-anchored week containing `date`, in zone. */
export function weekWindow(date: string, timeZone: string): { startUtc: string; endUtc: string } {
  const monday = mondayOf(date);
  const startUtc = zonedDayStartUtc(monday, timeZone);
  const endUtc = zonedDayStartUtc(addDays(monday, WEEK_DAYS), timeZone);
  return { startUtc, endUtc };
}

/** The seven YYYY-MM-DDs rendered in week view (Mon..Sun) for the week containing `date`. */
export function weekDates(date: string): string[] {
  const monday = mondayOf(date);
  return Array.from({ length: WEEK_DAYS }, (_, i) => addDays(monday, i));
}

/** Shift a yyyy-mm-dd date by n days. Calendar math — TZ-agnostic. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Build a UTC ISO timestamp from a date (yyyy-mm-dd) and a wall-clock time (HH:MM) in zone. */
export function isoAt(date: string, time: string, timeZone: string): string {
  return zonedWallClockToUtc(date, time, timeZone);
}

/** Minutes since the given day start for an ISO timestamp. */
export function minutesFromDayStart(iso: string, dayStartUtc: string): number {
  return (new Date(iso).getTime() - new Date(dayStartUtc).getTime()) / 60_000;
}

/** Round a minute value to the nearest grid slot, clamped to [0, DAY_MINUTES]. */
export function snapMinutes(minutes: number): number {
  const snapped = Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
  return Math.max(0, Math.min(DAY_MINUTES, snapped));
}

/** "HH:MM" from minutes-since-local-midnight. The renderer-side formatter. */
export function fmtHHMM(minutes: number): string {
  // Allow values outside [0, DAY_MINUTES] for blocks that cross local midnight.
  const norm = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function fmtRange(startMin: number, endMin: number): string {
  return `${fmtHHMM(startMin)}–${fmtHHMM(endMin)}`;
}

/** Humanize a slot duration, e.g. "1h 30m", "45m". */
export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/**
 * Time-meta for a block: the time range, plus either the full duration or
 * "X left" when the now-line is crossing the block (active === true).
 * Caller passes `nowMin = null` when the now-line is irrelevant (not today).
 */
export function blockTimeMeta(args: {
  startMin: number;
  endMin: number;
  nowMin: number | null;
}): { range: string; tail: string; active: boolean } {
  const range = fmtRange(args.startMin, args.endMin);
  const active =
    args.nowMin != null && args.nowMin >= args.startMin && args.nowMin < args.endMin;
  if (active) {
    // Round UP so a block with 30s remaining reads "1m left", not "0m left".
    const remaining = Math.max(1, Math.ceil(args.endMin - (args.nowMin as number)));
    return { range, tail: `${fmtDuration(remaining)} left`, active: true };
  }
  const dur = Math.max(0, args.endMin - args.startMin);
  return { range, tail: fmtDuration(dur), active: false };
}
