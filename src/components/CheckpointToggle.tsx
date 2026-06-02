"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setCheckpointsHiddenCookie } from "@/lib/prefs";

interface Props {
  /** Server-resolved cookie value, so SSR and first paint agree. */
  hidden: boolean;
}

/**
 * Bottom-status pill that hides or shows the checkpoint layer across every view.
 * A sibling to the label filter, but binary rather than a multi-select: hidden vs
 * shown. Cookie-backed like the timezone / week-start chips (a durable view
 * preference that follows you across days), not a per-date URL filter. The mark
 * echoes the grid's checkpoint tick — a short stroke, not the label dot — so the
 * two status pills stay legibly distinct. When hidden the pill takes the engaged
 * (accent) state, the same way an active label filter does, so it reads as a
 * standing reason the checkpoints aren't on the grid.
 */
export function CheckpointToggle({ hidden }: Props) {
  const router = useRouter();
  const [isHidden, setIsHidden] = useState(hidden);

  // Re-sync if a server refresh changes the cookie under us.
  useEffect(() => setIsHidden(hidden), [hidden]);

  function toggle() {
    const next = !isHidden;
    setCheckpointsHiddenCookie(next);
    setIsHidden(next);
    router.refresh();
  }

  return (
    <div className="checkpoint-toggle">
      <button
        type="button"
        className="filter-pill"
        onClick={toggle}
        data-active={isHidden || undefined}
        aria-pressed={isHidden}
        aria-label={
          isHidden
            ? "Checkpoints hidden. Click to show them."
            : "Checkpoints shown. Click to hide them."
        }
      >
        <span className="filter-pill-tick" aria-hidden="true" />
        <span className="text-ink-muted">checkpoints</span>
        <span className="num text-ink">{isHidden ? "hidden" : "shown"}</span>
      </button>
    </div>
  );
}
