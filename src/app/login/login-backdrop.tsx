"use client";

import { useEffect, useState } from "react";
import { DAY_MINUTES, PX_PER_MIN, fmtClock, fmtClockRange, fmtHourLabel } from "@/lib/time";

/**
 * The day behind the gate. A faint, non-interactive silhouette of a day grid —
 * hour rules, a few amber blocks, and a live now-line ticking in real wall-clock
 * time — sits behind the password field. You are looking at the thing you are
 * locked out of, and time is visibly moving without you. On unlock the scene
 * raises this layer to full and hands off to the real schedule.
 *
 * No real data is shown (this is pre-auth): the blocks are evocative texture,
 * carrying only a mono time range, never an invented task title.
 */

const GRID_HEIGHT = DAY_MINUTES * PX_PER_MIN; // 2304
const HOUR_PX = 60 * PX_PER_MIN; // 96
const HOURS = Array.from({ length: 24 }, (_, h) => h);

// A calm, plausible day shape. Minutes from local midnight. Texture only.
const GHOST_BLOCKS: ReadonlyArray<{ start: number; end: number }> = [
  { start: 9 * 60, end: 9 * 60 + 45 },
  { start: 11 * 60, end: 12 * 60 + 30 },
  { start: 14 * 60, end: 15 * 60 },
  { start: 16 * 60 + 30, end: 17 * 60 + 15 },
];

/** Where the now-line sits in the viewport — a touch above center reads best. */
const NOW_VIEWPORT_FRACTION = 0.46;

export function LoginBackdrop({ revealing }: { revealing: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [viewportH, setViewportH] = useState(0);

  // Defer all clock/viewport-dependent rendering to the client so the dimmed
  // grid never causes a hydration mismatch.
  useEffect(() => {
    setMounted(true);
    setViewportH(window.innerHeight);
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener("resize", onResize);
    // Tick once a second: the label reads live, the line creeps imperceptibly.
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearInterval(id);
    };
  }, []);

  if (!mounted) {
    // Same layer, no content — keeps the canvas warm before the grid resolves.
    return <div className="login-backdrop" aria-hidden="true" />;
  }

  const d = new Date(nowMs);
  const nowMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  // Translate the full-height grid so the now-line lands at NOW_VIEWPORT_FRACTION.
  const gridY = viewportH * NOW_VIEWPORT_FRACTION - nowMin * PX_PER_MIN;

  return (
    <div className="login-backdrop" data-revealing={revealing || undefined} aria-hidden="true">
      <div className="login-grid" style={{ height: GRID_HEIGHT, transform: `translateY(${gridY}px)` }}>
        {HOURS.map((h) => (
          <div key={h} className="hour-label" style={{ top: h * HOUR_PX }}>
            {fmtHourLabel(h)}
          </div>
        ))}

        {GHOST_BLOCKS.map((b) => {
          const top = b.start * PX_PER_MIN;
          const height = Math.max((b.end - b.start) * PX_PER_MIN, 22);
          return (
            <div key={b.start} className="block login-ghost-block" style={{ top, height }}>
              <span className="num login-ghost-time">{fmtClockRange(b.start, b.end)}</span>
            </div>
          );
        })}

        <div className="now-line" style={{ top: nowMin * PX_PER_MIN }} />
        <div className="now-label" style={{ top: nowMin * PX_PER_MIN }}>
          <span className="now-label-tag">now</span>
          <span className="now-label-time num">{fmtClock(Math.floor(nowMin))}</span>
        </div>
      </div>
    </div>
  );
}
