"use client";

import { useEffect, useState } from "react";
import {
  THEME_EVENT,
  THEME_LABEL,
  applyThemePref,
  readThemePref,
  type ThemePref,
} from "@/lib/theme";

const OPTIONS: ThemePref[] = ["light", "dark", "system"];

/**
 * Light / Dark / System selector for /settings. Reads and writes the same
 * localStorage-backed preference as the corner ThemeToggle glyph (via lib/theme),
 * so the two surfaces never disagree; choosing Dark here is what "default dark
 * mode" means. Theme applies instantly (no reload) since it's a class on <html>.
 *
 * SSR-stable: renders "system" as active until mounted, then reflects the real
 * stored pref the flash-free init script seeded onto the dataset. Mirrors the
 * glyph's own hydration guard so the two can't flicker out of sync.
 */
export function AppearanceControl() {
  const [pref, setPref] = useState<ThemePref>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPref(readThemePref());
    setMounted(true);

    // Stay in sync when the corner glyph (or OS, via the glyph) changes the pref.
    const onThemeChange = (e: Event) => setPref((e as CustomEvent<ThemePref>).detail);
    window.addEventListener(THEME_EVENT, onThemeChange);
    return () => window.removeEventListener(THEME_EVENT, onThemeChange);
  }, []);

  function choose(next: ThemePref) {
    setPref(next);
    applyThemePref(next);
  }

  const shown: ThemePref = mounted ? pref : "system";

  return (
    <div className="defaults-control">
      <span className="defaults-control-label">Appearance</span>
      <div className="seg" role="group" aria-label="Appearance">
        {OPTIONS.map((opt) => {
          const isActive = opt === shown;
          return (
            <button
              key={opt}
              type="button"
              className="range-chip"
              aria-pressed={isActive}
              aria-current={isActive || undefined}
              onClick={() => choose(opt)}
            >
              {THEME_LABEL[opt]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
