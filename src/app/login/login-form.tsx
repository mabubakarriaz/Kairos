"use client";

import { useEffect, useRef, useState } from "react";
import { loginAction, type LoginResult } from "./actions";

interface Props {
  configured: boolean;
  initialLockedUntilMs: number | null;
  initialAttempts: number;
  /** Fired the instant the password verifies. The scene owns the reveal + nav. */
  onUnlock: () => void;
}

const MAX_ATTEMPTS = 3;

function fmtRemaining(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export function LoginForm({
  configured,
  initialLockedUntilMs,
  initialAttempts,
  onUnlock,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [lockedUntilMs, setLockedUntilMs] = useState<number | null>(initialLockedUntilMs);
  const [attempts, setAttempts] = useState(initialAttempts);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Latched true on success so the field stays calm and disabled while the
  // reveal plays out, instead of flickering back to an editable state.
  const [unlocked, setUnlocked] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const isLocked = lockedUntilMs !== null && lockedUntilMs > now;
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attempts);
  const disabled = isLocked || pending || unlocked || !configured;

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  // Tick the clock once a second only while a lockout is active. The interval
  // lets the countdown render fresh and naturally re-enables the form when
  // the wall-clock crosses lockedUntilMs.
  useEffect(() => {
    if (!isLocked) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isLocked]);

  // When the lockout window passes client-side, reset the visible state so the
  // input becomes usable again without a manual reload.
  useEffect(() => {
    if (lockedUntilMs !== null && lockedUntilMs <= now) {
      setLockedUntilMs(null);
      setAttempts(0);
      setError(null);
    }
  }, [lockedUntilMs, now]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || !password) return;
    setError(null);
    setPending(true);
    let result: LoginResult | undefined;
    try {
      const fd = new FormData();
      fd.set("password", password);
      result = await loginAction(fd);
    } finally {
      setPending(false);
    }
    if (!result) return; // defensive: should always resolve now
    if (result.ok) {
      setUnlocked(true);
      onUnlock();
      return;
    }
    if (!result.ok) {
      if (typeof result.attempts === "number") setAttempts(result.attempts);
      if (result.lockedUntilMs) {
        setLockedUntilMs(result.lockedUntilMs);
        setNow(Date.now());
      }
      setError(result.error ?? "wrong password");
      setPassword("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  return (
    <form className="login-form" onSubmit={submit} noValidate>
      <div className="login-field" data-locked={isLocked || undefined}>
        <input
          ref={inputRef}
          type="password"
          name="password"
          className="login-input"
          placeholder={isLocked ? "" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={disabled}
          autoComplete="current-password"
          spellCheck={false}
          autoFocus
          aria-label="Password"
          aria-invalid={error ? true : undefined}
        />
        <span className="login-enter num" aria-hidden="true">
          {unlocked ? "✓" : pending ? "…" : "↵"}
        </span>
      </div>
      <p
        className={`login-meta num ${error || isLocked ? "login-meta-alert" : ""}`}
        role={error || isLocked ? "alert" : undefined}
      >
        {renderMeta({
          configured,
          isLocked,
          lockedUntilMs,
          now,
          error,
          attemptsLeft,
          attempts,
          pending,
          unlocked,
        })}
      </p>
      {/* Lets Enter on the input commit even without a separate button. */}
      <button type="submit" className="sr-only" disabled={disabled} tabIndex={-1}>
        Unlock
      </button>
    </form>
  );
}

interface MetaArgs {
  configured: boolean;
  isLocked: boolean;
  lockedUntilMs: number | null;
  now: number;
  error: string | null;
  attempts: number;
  attemptsLeft: number;
  pending: boolean;
  unlocked: boolean;
}

function renderMeta(args: MetaArgs): string {
  const { configured, isLocked, lockedUntilMs, now, error, attempts, attemptsLeft, pending, unlocked } = args;
  if (unlocked) return "opening your day…";
  if (!configured) return "set APP_PASSWORD and AUTH_SECRET to enable login";
  if (isLocked && lockedUntilMs) return `locked · ${fmtRemaining(lockedUntilMs - now)} left`;
  if (pending) return "checking…";
  if (error === "wrong password") {
    return attemptsLeft === 1
      ? "wrong password · 1 try left before lock"
      : `wrong password · ${attemptsLeft} tries left`;
  }
  if (error) return error;
  if (attempts > 0) return `${attemptsLeft} of ${MAX_ATTEMPTS} tries left`;
  return "enter to unlock";
}
