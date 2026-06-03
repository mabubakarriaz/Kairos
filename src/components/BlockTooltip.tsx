"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { blockTimeMeta } from "@/lib/time";
import type { RecurrenceKind, ScheduledBlock } from "@/lib/types";

/**
 * Block detail tooltip — the full title / time / labels that a short block
 * clips, surfaced on hover (after a short delay) or keyboard focus. Bespoke and
 * zero-dep, in the same spirit as the drag engine: the native `title` attribute
 * is slow, OS-styled, and breaks the JetBrains-mono numeral language. Shared by
 * the day and week/5-day grids.
 *
 * `useBlockTooltip()` returns:
 *  - `anchorProps(payload)` → the mouse/focus handlers to spread onto a block,
 *  - `tooltipNode` → the floating panel (render once per grid; it's `fixed`, so
 *    placement is independent of where it sits in the tree),
 *  - `hide()` → dismiss immediately (call it when a drag / resize / nudge starts
 *    so the panel never lingers over a moving block).
 */

const TIP_WIDTH = 240;
const GAP = 10;
const HOVER_DELAY = 300;

interface TipPayload {
  block: ScheduledBlock;
  startMin: number;
  endMin: number;
  nowMin: number | null;
}

interface TipState extends TipPayload {
  top: number;
  left: number;
}

const RECUR_LABEL: Record<RecurrenceKind, string> = {
  daily: "Repeats daily",
  weekdays: "Repeats on weekdays",
  weekly: "Repeats weekly",
  interval: "Repeats on an interval",
};

// Prefer the right of the block (calendar convention); flip left when it would
// overflow, and pin to the wider edge on a viewport too narrow for either side.
function place(rect: DOMRect): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = rect.right + GAP;
  if (left + TIP_WIDTH > vw - GAP) left = rect.left - GAP - TIP_WIDTH;
  if (left < GAP) left = Math.max(GAP, Math.min(rect.left, vw - GAP - TIP_WIDTH));

  // Final vertical clamp happens after measure; start aligned to the block top.
  const top = Math.max(GAP, Math.min(rect.top, vh - GAP - 96));
  return { top, left };
}

export function useBlockTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setTip(null);
  }, [clearTimer]);

  // Hover reveals after a beat so a glance across the grid doesn't flash panels;
  // focus reveals at once so keyboard users get parity without the wait.
  const showFor = useCallback(
    (el: HTMLElement, payload: TipPayload, delay: number) => {
      clearTimer();
      const open = () => setTip({ ...payload, ...place(el.getBoundingClientRect()) });
      if (delay > 0) timer.current = setTimeout(open, delay);
      else open();
    },
    [clearTimer],
  );

  // Drop a pending hover timer if the grid unmounts mid-wait.
  useEffect(() => clearTimer, [clearTimer]);

  // A scroll or resize moves the anchor out from under a fixed panel — dismiss
  // rather than let it drift. Capture-phase catches the grid's inner scroller.
  useEffect(() => {
    if (!tip) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [tip, hide]);

  const anchorProps = useCallback(
    (payload: TipPayload) => ({
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) =>
        showFor(e.currentTarget, payload, HOVER_DELAY),
      onMouseLeave: hide,
      // Keyboard focus only (`:focus-visible`) — a mouse click focuses the block
      // too, but there the hover path already governs the tooltip, and showing on
      // pointer-focus would flash it open on every click and linger through a drag.
      onFocus: (e: React.FocusEvent<HTMLElement>) => {
        if (e.currentTarget.matches(":focus-visible")) showFor(e.currentTarget, payload, 0);
      },
      onBlur: hide,
    }),
    [showFor, hide],
  );

  return { anchorProps, hide, tooltipNode: tip ? <TooltipPanel tip={tip} /> : null };
}

function TooltipPanel({ tip }: { tip: TipState }) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(tip.top);

  // Correct the vertical position against the panel's real height once rendered,
  // so a tall tooltip near the bottom edge lifts to stay fully on-screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const max = window.innerHeight - GAP - h;
    setTop(Math.max(GAP, Math.min(tip.top, max)));
  }, [tip]);

  const meta = blockTimeMeta({ startMin: tip.startMin, endMin: tip.endMin, nowMin: tip.nowMin });
  const isGcal = tip.block.source === "gcal";
  const calName = isGcal ? tip.block.tags[0] ?? null : null;
  const tags = isGcal ? [] : tip.block.tags;
  const recur = isGcal ? null : tip.block.recurrenceKind;

  return (
    <div
      ref={ref}
      role="tooltip"
      className="block-tip"
      data-gcal={isGcal || undefined}
      style={{ top, left: tip.left, width: TIP_WIDTH }}
    >
      <div className="block-tip-title">
        {tip.block.title || (isGcal ? "(busy)" : "Untitled")}
      </div>
      <div className="block-tip-time num">
        <span>{meta.range}</span>
        <span className="block-tip-sep" aria-hidden="true">{" · "}</span>
        <span className="block-tip-tail" data-active={meta.state === "active" || undefined}>
          {meta.tail}
        </span>
      </div>

      {isGcal ? (
        <div className="block-tip-meta">
          {calName && <span className="block-tip-cal">{calName}</span>}
          <span className="block-tip-ro num">from calendar · read-only</span>
        </div>
      ) : (
        (tags.length > 0 || recur) && (
          <div className="block-tip-meta">
            {tags.length > 0 && (
              <span className="block-tip-tags num">{tags.map((t) => `#${t}`).join(" ")}</span>
            )}
            {recur && <span className="block-tip-recur num">{RECUR_LABEL[recur]}</span>}
          </div>
        )
      )}
    </div>
  );
}
