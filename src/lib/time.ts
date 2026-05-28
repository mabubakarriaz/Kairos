// Kairos MVP runs the schedule in UTC — every time shown and stored is UTC. This
// keeps the day-window math trivial and bug-free; localized timezones are a future
// upgrade (the schema already stores timestamptz).

/** Minutes per grid slot — the schedule snaps drags/free-slots to this. */
export const SLOT_MINUTES = 15;

/** Pixels per minute. 96px/hour ⇒ 1.6px/min; a 15-min slot ≈ 24px. Matches globals.css. */
export const PX_PER_MIN = 1.6;

export const DAY_MINUTES = 24 * 60;

/** Today as yyyy-mm-dd (UTC). */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Validate a yyyy-mm-dd string, falling back to today (UTC) if missing/invalid. */
export function normalizeDate(input: string | undefined | null): string {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input) && !Number.isNaN(Date.parse(`${input}T00:00:00Z`))) {
    return input;
  }
  return todayUtc();
}

/** Half-open UTC window [00:00, next 00:00) for a yyyy-mm-dd date. */
export function dayWindowUtc(date: string): { startUtc: string; endUtc: string } {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + DAY_MINUTES * 60_000);
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

/** Number of columns rendered side-by-side in the week view. */
export const WEEK_DAYS = 5;

/** Half-open UTC window covering WEEK_DAYS consecutive days starting at `date`. */
export function weekWindowUtc(date: string): { startUtc: string; endUtc: string } {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + WEEK_DAYS * DAY_MINUTES * 60_000);
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

/** The list of yyyy-mm-dd dates rendered in the week view, anchored at `date`. */
export function weekDates(date: string): string[] {
  return Array.from({ length: WEEK_DAYS }, (_, i) => addDays(date, i));
}

/** Shift a yyyy-mm-dd date by n days (UTC). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Build a UTC ISO timestamp from a date (yyyy-mm-dd) and a time (HH:MM). */
export function isoAt(date: string, time: string): string {
  return new Date(`${date}T${time}:00.000Z`).toISOString();
}

/** Minutes since the given day start (UTC) for an ISO timestamp. */
export function minutesFromDayStart(iso: string, dayStartUtc: string): number {
  return (new Date(iso).getTime() - new Date(dayStartUtc).getTime()) / 60_000;
}

/** Round a minute value to the nearest grid slot, clamped to [0, DAY_MINUTES]. */
export function snapMinutes(minutes: number): number {
  const snapped = Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
  return Math.max(0, Math.min(DAY_MINUTES, snapped));
}

/** "HH:MM" (UTC) for an ISO timestamp. */
export function fmtTime(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}

export function fmtRange(startIso: string, endIso: string): string {
  return `${fmtTime(startIso)}–${fmtTime(endIso)}`;
}

/** Humanize a slot duration, e.g. "1h 30m", "45m". */
export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
