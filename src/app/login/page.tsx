import { headers } from "next/headers";
import { LoginForm } from "./login-form";
import { authConfigured, getLockoutState } from "@/server/auth";

export const dynamic = "force-dynamic";

async function getIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() ?? "unknown";
}

export default async function LoginPage() {
  const configured = authConfigured();
  // Skip the DB read when auth env vars are absent — the row would be
  // unreachable from any subsequent action anyway.
  const lockout = configured
    ? await getLockoutState(await getIp())
    : { locked: false, lockedUntil: null, attempts: 0 };

  return (
    <div className="login-stage">
      <header className="login-header">
        <h1 className="login-title">Kairos</h1>
        <p className="login-sublabel">private day</p>
      </header>
      <LoginForm
        configured={configured}
        initialLockedUntilMs={lockout.lockedUntil?.getTime() ?? null}
        initialAttempts={lockout.attempts}
      />
    </div>
  );
}
