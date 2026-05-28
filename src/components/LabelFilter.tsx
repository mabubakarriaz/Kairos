"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface Props {
  /** Labels currently driving the filter (lowercase slugs). */
  filterLabels: string[];
  /** All labels present in the currently rendered view (lowercase slugs). */
  inViewLabels: string[];
}

export function LabelFilter({ filterLabels, inViewLabels }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const universe = useMemo(() => {
    const u = new Set<string>(inViewLabels);
    for (const l of filterLabels) u.add(l);
    return Array.from(u).sort();
  }, [inViewLabels, filterLabels]);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pushLabels(next: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.length === 0) params.delete("labels");
    else params.set("labels", next.join(","));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function toggle(label: string) {
    const isActive = filterLabels.includes(label);
    pushLabels(isActive ? filterLabels.filter((l) => l !== label) : [...filterLabels, label]);
  }

  const hasFilter = filterLabels.length > 0;
  const summary = hasFilter
    ? filterLabels.length === 1
      ? `#${filterLabels[0]}`
      : `${filterLabels.length} active`
    : "all";

  return (
    <div className="label-filter" ref={rootRef}>
      <button
        type="button"
        className="filter-pill"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        data-active={hasFilter || undefined}
      >
        <span className="filter-pill-mark" aria-hidden="true" />
        <span className="text-ink-muted">labels</span>
        <span className="num text-ink">{summary}</span>
      </button>
      {hasFilter && (
        <button
          type="button"
          className="filter-pill-clear"
          onClick={() => pushLabels([])}
          aria-label="Clear label filter"
        >
          <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
      {open && (
        <div className="filter-popover" role="menu">
          {universe.length === 0 ? (
            <p className="filter-popover-empty">No labels here yet. Add one when you create a task.</p>
          ) : (
            <ul className="filter-popover-list">
              {universe.map((label) => {
                const active = filterLabels.includes(label);
                return (
                  <li key={label}>
                    <button
                      type="button"
                      className="filter-popover-item"
                      onClick={() => toggle(label)}
                      role="menuitemcheckbox"
                      aria-checked={active}
                      data-active={active || undefined}
                    >
                      <span className="filter-popover-mark" aria-hidden="true" />
                      <span className="num">#{label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {hasFilter && (
            <button
              type="button"
              className="filter-popover-clear num"
              onClick={() => pushLabels([])}
            >
              clear filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}
