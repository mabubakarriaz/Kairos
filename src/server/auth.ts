import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getSupabase } from "@/lib/supabase";
import { SESSION_TTL_MS, signSession } from "@/lib/auth-session";

/**
 * Single-user password gate. APP_PASSWORD is the literal password (kept in
 * runtime env, never in git). Failed attempts are tracked per-IP in the
 * `auth_lockout` table; after MAX_ATTEMPTS the IP is locked for LOCKOUT_MS.
 *
 * Always reached through the server-only service-role client; the browser
 * never touches the lockout table.
 */

export const MAX_ATTEMPTS = 3;
export const LOCKOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface LockoutState {
  locked: boolean;
  lockedUntil: Date | null;
  attempts: number;
}

const NO_LOCKOUT: LockoutState = { locked: false, lockedUntil: null, attempts: 0 };

export async function getLockoutState(ip: string): Promise<LockoutState> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("auth_lockout")
    .select("attempts, locked_until")
    .eq("ip", ip)
    .maybeSingle();
  if (error || !data) return NO_LOCKOUT;

  const lockedUntil = data.locked_until ? new Date(data.locked_until) : null;
  const locked = lockedUntil ? lockedUntil.getTime() > Date.now() : false;
  return { locked, lockedUntil, attempts: data.attempts ?? 0 };
}

export async function recordFailedAttempt(ip: string): Promise<LockoutState> {
  const supabase = getSupabase();
  const current = await getLockoutState(ip);

  // Slate clears once the previous lockout has expired in wall-clock terms.
  const expired = current.lockedUntil !== null && current.lockedUntil.getTime() <= Date.now();
  const base = expired ? 0 : current.attempts;

  const attempts = base + 1;
  const shouldLock = attempts >= MAX_ATTEMPTS;
  const lockedUntil = shouldLock ? new Date(Date.now() + LOCKOUT_MS) : null;

  const { error } = await supabase
    .from("auth_lockout")
    .upsert({
      ip,
      attempts,
      locked_until: lockedUntil ? lockedUntil.toISOString() : null,
      updated_at: new Date().toISOString(),
    });
  if (error) {
    // Fail open on the bookkeeping write — never block a legitimate user from
    // trying again because the lockout table is briefly unreachable. The
    // password check itself still has to pass.
    return { locked: false, lockedUntil: null, attempts };
  }
  return { locked: shouldLock, lockedUntil, attempts };
}

export async function resetLockout(ip: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("auth_lockout").delete().eq("ip", ip);
}

/** Constant-time compare against APP_PASSWORD. Returns false if env var unset. */
export function verifyPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;

  const a = Buffer.from(input, "utf8");
  const b = Buffer.from(expected, "utf8");
  // timingSafeEqual demands equal-length buffers; pad the comparison to keep
  // the timing similar when lengths differ.
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function newSessionCookie(): Promise<{ value: string; expiresAt: Date } | null> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const value = await signSession(expiresAt.getTime());
  if (!value) return null;
  return { value, expiresAt };
}

/** True when both required env vars are present and usable. */
export function authConfigured(): boolean {
  const password = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  return !!password && !!secret && secret.length >= 16;
}
