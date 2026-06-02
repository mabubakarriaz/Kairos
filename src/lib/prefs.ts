// App-behavior defaults the single user sets in /settings. Pure + isomorphic:
// the server reads these from cookies (next/headers), the client writes them
// (document.cookie) and refreshes. Storage stays UTC; these only shape the view.
//
// Theme lives separately in src/lib/theme.ts (localStorage + a flash-free init
// script) because it must apply before first paint; week-start is server-driven
// because the week/month grid windows are computed during render.

import type { WeekStart } from "@/lib/time";

export const WEEK_START_COOKIE = "kairos-week-start";
export const DEFAULT_WEEK_START: WeekStart = "mon";

export const CHECKPOINTS_COOKIE = "kairos-checkpoints";

/** A year, matching the tz cookie — these are durable preferences, not sessions. */
export const PREF_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Cookie value → a valid WeekStart, falling back to the default. */
export function parseWeekStart(raw: string | undefined | null): WeekStart {
  return raw === "sun" ? "sun" : raw === "mon" ? "mon" : DEFAULT_WEEK_START;
}

/** Cookie value → whether the checkpoint layer is hidden. Default is shown, so
 *  only the explicit "hidden" value suppresses it. */
export function parseCheckpointsHidden(raw: string | undefined | null): boolean {
  return raw === "hidden";
}

/** Write the checkpoint-visibility cookie from the client. No-op on the server
 *  (guarded so callers don't have to). Caller refreshes to re-resolve the view. */
export function setCheckpointsHiddenCookie(hidden: boolean): void {
  if (typeof document === "undefined") return;
  document.cookie = `${CHECKPOINTS_COOKIE}=${hidden ? "hidden" : "shown"}; path=/; max-age=${PREF_COOKIE_MAX_AGE}; SameSite=Lax`;
}
