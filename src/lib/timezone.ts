// Time-zone vocabulary for Kairos. Storage stays UTC end-to-end; this module
// only governs what the UI shows. Single-user app, so we ship a small curated
// list of zones instead of an IANA mega-dropdown.

export const TZ_COOKIE = "kairos-tz";
export const DEFAULT_TZ = "Asia/Karachi";

export interface ZoneEntry {
  /** IANA identifier, e.g. "Asia/Karachi". The canonical value. */
  id: string;
  /** Short label shown in the chip: "PKT", "UTC", "NYC". 3-4 chars. */
  short: string;
  /** Long label for the picker row: "Karachi", "New York". */
  long: string;
}

/** Curated list. Order is intentional — Karachi first, then the user's likely orbit. */
export const ZONES: ZoneEntry[] = [
  { id: "Asia/Karachi", short: "PKT", long: "Karachi" },
  { id: "UTC", short: "UTC", long: "Coordinated Universal" },
  { id: "Asia/Dubai", short: "GST", long: "Dubai" },
  { id: "Asia/Kolkata", short: "IST", long: "Mumbai" },
  { id: "Europe/London", short: "LON", long: "London" },
  { id: "America/New_York", short: "NYC", long: "New York" },
  { id: "Asia/Singapore", short: "SGT", long: "Singapore" },
  { id: "Asia/Tokyo", short: "JST", long: "Tokyo" },
];

const ZONE_BY_ID = new Map(ZONES.map((z) => [z.id, z]));

export function zoneFor(id: string): ZoneEntry {
  return ZONE_BY_ID.get(id) ?? { id, short: shortFromId(id), long: longFromId(id) };
}

function shortFromId(id: string): string {
  // Fallback for arbitrary IANA ids (e.g. the System zone): last segment, truncated.
  const tail = id.split("/").pop() ?? id;
  return tail.replace(/_/g, " ").slice(0, 4).toUpperCase();
}

function longFromId(id: string): string {
  const tail = id.split("/").pop() ?? id;
  return tail.replace(/_/g, " ");
}

/** True if the runtime accepts this string as a valid IANA zone. */
export function isValidTimeZone(id: string): boolean {
  if (!id) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: id });
    return true;
  } catch {
    return false;
  }
}

/**
 * Offset in minutes from UTC for `instant` evaluated in `timeZone`.
 * PKT → 300, UTC → 0, NYC in summer → -240. DST-aware (uses formatToParts).
 */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const asUtcMs = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return Math.round((asUtcMs - instant.getTime()) / 60_000);
}

/** "UTC+5", "UTC", "UTC+5:30", "UTC−4". Uses a real minus sign for negative offsets. */
export function formatOffset(minutes: number): string {
  if (minutes === 0) return "UTC";
  const sign = minutes >= 0 ? "+" : "−"; // − is the typographic minus
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, "0")}`;
}

/** Current YYYY-MM-DD as the zone reads the clock right now. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA gives the YYYY-MM-DD shape natively.
  return dtf.format(now);
}

/**
 * UTC instant of local midnight on `date` in `timeZone`, as an ISO string.
 * Iterates twice to handle DST corners: the second pass uses the offset
 * sampled near the wall-clock target, not near the naïve UTC sibling.
 */
export function zonedDayStartUtc(date: string, timeZone: string): string {
  return zonedWallClockToUtc(date, "00:00", timeZone);
}

/** Same idea as zonedDayStartUtc but for an arbitrary HH:MM wall-clock. */
export function zonedWallClockToUtc(date: string, time: string, timeZone: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  let guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  let off = offsetMinutes(guess, timeZone);
  guess = new Date(guess.getTime() - off * 60_000);
  off = offsetMinutes(guess, timeZone);
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - off * 60_000).toISOString();
}
