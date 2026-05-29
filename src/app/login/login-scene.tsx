"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginBackdrop } from "./login-backdrop";
import { LoginForm } from "./login-form";

interface Props {
  configured: boolean;
  initialLockedUntilMs: number | null;
  initialAttempts: number;
}

// How long the "day rises" reveal plays before the route hands off. Kept just
// under the backdrop's opacity transition so the schedule mounts as the light
// finishes coming up, not after a dead beat.
const REVEAL_MS = 620;

export function LoginScene({ configured, initialLockedUntilMs, initialAttempts }: Props) {
  const router = useRouter();
  const [revealing, setRevealing] = useState(false);
  const navigated = useRef(false);

  const handleUnlock = useCallback(() => {
    const go = () => {
      if (navigated.current) return;
      navigated.current = true;
      router.replace("/");
    };

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    setRevealing(true);
    if (reduced) {
      go();
      return;
    }
    // Prefetch so the schedule is warm when the reveal lands.
    router.prefetch("/");
    window.setTimeout(go, REVEAL_MS);
  }, [router]);

  return (
    <div className="login-stage" data-revealing={revealing || undefined}>
      <LoginBackdrop revealing={revealing} />
      <div className="login-foreground">
        <header className="login-header">
          <h1 className="login-title">Kairos</h1>
          <p className="login-sublabel">private day</p>
        </header>
        <LoginForm
          configured={configured}
          initialLockedUntilMs={initialLockedUntilMs}
          initialAttempts={initialAttempts}
          onUnlock={handleUnlock}
        />
      </div>
    </div>
  );
}
