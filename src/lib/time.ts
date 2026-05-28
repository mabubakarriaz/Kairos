// Grid math + day-window for Kairos. Storage is UTC end-to-end; the values
// flowing through these functions are TZ-aware because the *day* boundary is
// taken at local midnight in the active zone (see src/lib/timezone.ts).
// As long as `dayStartUtc` is the UTC instant of local midnight, "minutes
// from day start" linearly maps to local wall-clock minutes, and the renderer
// stays zone-agnostic.

import { todayInZone, zonedDayStartUtc, zonedWallClockToUtc } from "@/lib/timezone";
import type { ScheduledBlock } from "@/lib/types";

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

/** Number of days rendered in the rolling 5-day view. */
export const FIVE_DAYS = 5;

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

/** The five YYYY-MM-DDs starting at `date` (a rolling 5-day window, not Mon-anchored). */
export function fiveDayDates(date: string): string[] {
  return Array.from({ length: FIVE_DAYS }, (_, i) => addDays(date, i));
}

/** Half-open UTC window covering the rolling 5-day span starting at `date`, in zone. */
export function fiveDayWindow(date: string, timeZone: string): { startUtc: string; endUtc: string } {
  const startUtc = zonedDayStartUtc(date, timeZone);
  const endUtc = zonedDayStartUtc(addDays(date, FIVE_DAYS), timeZone);
  return { startUtc, endUtc };
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

/** "HH:MM" (24h) from minutes-since-local-midnight. Used as the storage/wire format. */
export function fmtHHMM(minutes: number): string {
  // Allow values outside [0, DAY_MINUTES] for blocks that cross local midnight.
  const norm = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * 12-hour wall-clock — "9:00 am", "12:30 pm", "12:00 am" (midnight).
 * The user-facing time format. Period is lowercased and preceded by a thin
 * space so it rides JetBrains Mono cleanly when wrapped in .num. Minutes are
 * always two digits so columns of times line up.
 */
export function fmtClock(minutes: number): string {
  const norm = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h24 = Math.floor(norm / 60);
  const m = norm % 60;
  const period = h24 < 12 ? "am" : "pm";
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Compact hour-gutter label — "12a", "1a", "9a", "12p", "1p", "11p".
 * Two chars + period letter. Reads as a printed timetable, fits the 48px gutter.
 */
export function fmtHourLabel(hour24: number): string {
  const period = hour24 < 12 ? "a" : "p";
  const h12 = ((hour24 + 11) % 12) + 1;
  return `${h12}${period}`;
}

/**
 * Time range, AM/PM-aware. When both ends share a period, collapse the suffix:
 *   "9:00 – 9:45 am"
 *   "11:30 am – 1:00 pm"
 * The en-dash carries normal weight; callers wrap it in a faint span if they want.
 */
export function fmtClockRange(startMin: number, endMin: number): string {
  const startPeriod = periodOf(startMin);
  const endPeriod = periodOf(endMin);
  const start = fmtClock(startMin);
  const end = fmtClock(endMin);
  if (startPeriod === endPeriod) {
    // Drop the period from the first end.
    const startNoPeriod = start.replace(/\s(?:am|pm)$/, "");
    return `${startNoPeriod} – ${end}`;
  }
  return `${start} – ${end}`;
}

function periodOf(minutes: number): "am" | "pm" {
  const norm = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return norm < 12 * 60 ? "am" : "pm";
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
 * "in 2h 15m" / "in 45m" / "in 1h". Used for future countdowns on blocks and
 * checkpoints. Returns null when `deltaMin <= 0` so the caller can drop the
 * trailer the moment time has passed.
 */
export function fmtCountdown(deltaMin: number): string | null {
  if (deltaMin <= 0) return null;
  // Round UP so 30s reads "in 1m", never "in 0m".
  const total = Math.max(1, Math.ceil(deltaMin));
  return `in ${fmtDuration(total)}`;
}

export type BlockTimeState = "past" | "active" | "future";

/**
 * Time-meta for a block: the time range, plus a single tail that names the
 * block's relationship to *now*:
 *   - past:   "45m"            (duration, ink-faint)
 *   - active: "30m left"       (Ember tail — the now-line lives inside this block)
 *   - future: "in 2h 15m"      (countdown, ink-faint)
 * Caller passes `nowMin = null` when the now-line is irrelevant (not today);
 * the block then reads as past (duration only) — fine for past/future days.
 */
export function blockTimeMeta(args: {
  startMin: number;
  endMin: number;
  nowMin: number | null;
}): { range: string; tail: string; state: BlockTimeState } {
  const range = fmtClockRange(args.startMin, args.endMin);
  if (args.nowMin == null) {
    const dur = Math.max(0, args.endMin - args.startMin);
    return { range, tail: fmtDuration(dur), state: "past" };
  }
  if (args.nowMin >= args.endMin) {
    const dur = Math.max(0, args.endMin - args.startMin);
    return { range, tail: fmtDuration(dur), state: "past" };
  }
  if (args.nowMin >= args.startMin) {
    const remaining = Math.max(1, Math.ceil(args.endMin - args.nowMin));
    return { range, tail: `${fmtDuration(remaining)} left`, state: "active" };
  }
  // future
  const countdown = fmtCountdown(args.startMin - args.nowMin) ?? fmtDuration(0);
  return { range, tail: countdown, state: "future" };
}

/**
 * Allocations across a day — totals + per-label breakdown for the day analytics
 * line. Labels can overlap (one block may carry several tags), so per-label
 * totals can exceed booked total; that's the right reading because the user
 * thinks of labels as orthogonal dimensions on the same time.
 *
 * `bookedMin` is the union of block durations; `openMin` is `DAY_MINUTES - bookedMin`.
 * `byLabel` is sorted by descending minutes, then label asc for stable ordering.
 */
export interface DayStats {
  bookedMin: number;
  openMin: number;
  byLabel: { label: string; minutes: number }[];
}

export function computeDayStats(blocks: ScheduledBlock[], dayStartUtc: string): DayStats {
  let bookedMin = 0;
  const labelMin = new Map<string, number>();
  const dayStartMs = new Date(dayStartUtc).getTime();
  const dayEndMs = dayStartMs + DAY_MINUTES * 60_000;
  for (const b of blocks) {
    const s = Math.max(dayStartMs, new Date(b.startUtc).getTime());
    const e = Math.min(dayEndMs, new Date(b.endUtc).getTime());
    if (e <= s) continue;
    const dur = (e - s) / 60_000;
    bookedMin += dur;
    for (const t of b.tags) {
      labelMin.set(t, (labelMin.get(t) ?? 0) + dur);
    }
  }
  const byLabel = Array.from(labelMin, ([label, minutes]) => ({ label, minutes })).sort(
    (a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label),
  );
  const booked = Math.round(bookedMin);
  return {
    bookedMin: booked,
    openMin: Math.max(0, DAY_MINUTES - booked),
    byLabel,
  };
}
