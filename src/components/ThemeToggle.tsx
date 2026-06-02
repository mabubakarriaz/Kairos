"use client";

import { useEffect, useState } from "react";
import {
  NEXT_THEME,
  THEME_EVENT,
  THEME_LABEL,
  applyThemePref,
  readThemePref,
  type ThemePref,
} from "@/lib/theme";

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPref(readThemePref());
    setMounted(true);

    // If preference is "system", follow OS changes live.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (readThemePref() === "system") applyThemePref("system");
    };
    mq.addEventListener("change", handler);

    // Stay in sync when the settings Appearance control changes the pref.
    const onThemeChange = (e: Event) => setPref((e as CustomEvent<ThemePref>).detail);
    window.addEventListener(THEME_EVENT, onThemeChange);

    return () => {
      mq.removeEventListener("change", handler);
      window.removeEventListener(THEME_EVENT, onThemeChange);
    };
  }, []);

  function cycle() {
    const next = NEXT_THEME[pref];
    setPref(next);
    applyThemePref(next);
  }

  // SSR-stable icon (system) until mounted, then real state.
  const shown: ThemePref = mounted ? pref : "system";

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${THEME_LABEL[shown]} (click to change)`}
      title={`Theme · ${THEME_LABEL[shown]}`}
      className="glyph-btn"
    >
      {shown === "light" && (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3.6" />
          <path d="M12 3v2M12 19v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M3 12h2M19 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
        </svg>
      )}
      {shown === "dark" && (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7Z" />
        </svg>
      )}
      {shown === "system" && (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5v17" />
          <path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none" />
        </svg>
      )}
    </button>
  );
}
