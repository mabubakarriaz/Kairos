"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_TZ,
  TZ_COOKIE,
  ZONES,
  formatOffset,
  offsetMinutes,
  zoneFor,
} from "@/lib/timezone";

interface Props {
  /** Server-resolved cookie value. Used so SSR and first paint agree. */
  currentTz: string;
}

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function TimezoneToggle({ currentTz }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(currentTz);
  const [now, setNow] = useState<Date | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  // Sync prop into state when SSR changes the cookie under us (e.g. after refresh).
  useEffect(() => setActive(currentTz), [currentTz]);

  // We need a real Date to evaluate current offsets — only after mount to avoid
  // SSR/CSR divergence (different machines may sit on different sides of a minute).
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Detect the visitor's system zone, falling back gracefully.
  const systemTz = useMemo(() => {
    if (typeof Intl === "undefined") return "UTC";
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  // The dropdown rows. System row only appears when its zone isn't already in the curated list.
  const items = useMemo(() => {
    const base = ZONES.map((z) => ({ ...z, isSystem: false as const }));
    const inList = base.some((z) => z.id === systemTz);
    if (inList) return base;
    const sys = zoneFor(systemTz);
    return [...base, { ...sys, isSystem: true as const, long: `System · ${sys.long}` }];
  }, [systemTz]);

  // Close on outside click, Esc, or scroll.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) firstItemRef.current?.focus();
  }, [open]);

  function commit(tzId: string) {
    if (tzId !== active) {
      document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tzId)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
      setActive(tzId);
      router.refresh();
    }
    setOpen(false);
    triggerRef.current?.focus();
  }

  const activeMeta = zoneFor(active);
  const activeOffset = now ? formatOffset(offsetMinutes(now, active)) : null;
  const tooltipSuffix = activeOffset ? ` · ${activeOffset}` : "";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="tz-chip num"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Time zone: ${activeMeta.long}${activeOffset ? ` (${activeOffset})` : ""}. Click to change.`}
        title={`Time zone · ${activeMeta.long}${tooltipSuffix}`}
        onClick={() => setOpen((v) => !v)}
      >
        {activeMeta.short}
      </button>

      {open && (
        <div className="tz-popover" role="listbox" aria-label="Time zone">
          <div className="tz-popover-head">
            <span className="tz-popover-title">Time zone</span>
            <span className="tz-popover-default-hint">
              default <span className="num">{zoneFor(DEFAULT_TZ).short}</span>
            </span>
          </div>
          <ul className="tz-popover-list" role="presentation">
            {items.map((z, i) => {
              const selected = z.id === active;
              const off = now ? formatOffset(offsetMinutes(now, z.id)) : "";
              return (
                <li key={z.id} role="presentation">
                  <button
                    ref={i === 0 ? firstItemRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className="tz-row"
                    data-selected={selected || undefined}
                    onClick={() => commit(z.id)}
                  >
                    <span className="tz-row-short num" aria-hidden="true">
                      {z.short}
                    </span>
                    <span className="tz-row-long">{z.long}</span>
                    <span className="tz-row-offset num" aria-hidden="true">
                      {off}
                    </span>
                    {selected && (
                      <svg
                        className="tz-row-check"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m5 12 5 5 9-11" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
