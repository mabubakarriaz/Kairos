"use client";

import { useEffect, useState } from "react";

type Pref = "light" | "dark" | "system";

function readPref(): Pref {
  if (typeof window === "undefined") return "system";
  const raw = window.document.documentElement.dataset.themePref;
  return raw === "light" || raw === "dark" ? raw : "system";
}

function applyPref(pref: Pref) {
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = pref === "dark" || (pref === "system" && systemDark);
  root.classList.toggle("dark", dark);
  root.dataset.themePref = pref;
  try {
    if (pref === "system") localStorage.removeItem("kairos-theme");
    else localStorage.setItem("kairos-theme", pref);
  } catch {
    // private mode, etc.
  }
}

const NEXT: Record<Pref, Pref> = { light: "dark", dark: "system", system: "light" };
const LABEL: Record<Pref, string> = { light: "Light", dark: "Dark", system: "System" };

export function ThemeToggle() {
  const [pref, setPref] = useState<Pref>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPref(readPref());
    setMounted(true);

    // If preference is "system", follow OS changes live.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (readPref() === "system") applyPref("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  function cycle() {
    const next = NEXT[pref];
    setPref(next);
    applyPref(next);
  }

  // SSR-stable icon (system) until mounted, then real state.
  const shown: Pref = mounted ? pref : "system";

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${LABEL[shown]} (click to change)`}
      title={`Theme · ${LABEL[shown]}`}
      className="fixed right-5 top-5 z-50 inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors duration-200 ease-snap hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
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
