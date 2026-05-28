"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  authConfigured,
  getLockoutState,
  newSessionCookie,
  recordFailedAttempt,
  resetLockout,
  verifyPassword,
} from "@/server/auth";
import { AUTH_COOKIE } from "@/lib/auth-session";

async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = h.get("x-real-ip")?.trim();
  if (xri) return xri;
  return "unknown";
}

export interface LoginResult {
  ok: boolean;
  error?: string;
  lockedUntilMs?: number;
  attempts?: number;
}

export async function loginAction(formData: FormData): Promise<LoginResult> {
  if (!authConfigured()) {
    return { ok: false, error: "auth not configured" };
  }

  const password = String(formData.get("password") ?? "");
  if (!password) return { ok: false, error: "password required" };

  const ip = await clientIp();

  const lockout = await getLockoutState(ip);
  if (lockout.locked && lockout.lockedUntil) {
    return {
      ok: false,
      error: "locked",
      lockedUntilMs: lockout.lockedUntil.getTime(),
      attempts: lockout.attempts,
    };
  }

  if (!verifyPassword(password)) {
    const updated = await recordFailedAttempt(ip);
    if (updated.locked && updated.lockedUntil) {
      return {
        ok: false,
        error: "locked",
        lockedUntilMs: updated.lockedUntil.getTime(),
        attempts: updated.attempts,
      };
    }
    return { ok: false, error: "wrong password", attempts: updated.attempts };
  }

  await resetLockout(ip);
  const session = await newSessionCookie();
  if (!session) {
    return { ok: false, error: "auth not configured" };
  }
  const jar = await cookies();
  jar.set(AUTH_COOKIE, session.value, {
    httpOnly: true,
    // Secure cookies are silently dropped over HTTP, so opt out for local dev
    // (HTTP) while keeping the flag on for production (Vercel, always HTTPS).
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE);
  redirect("/login");
}
