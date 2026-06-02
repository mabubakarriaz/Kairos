"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";

export interface MonthEvent {
  time: string;
  title: string;
  gcal: boolean;
  muted: boolean;
}

export interface MonthCellView {
  date: string;
  dayNum: string;
  dateLabel: string;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  dots: { gcal: boolean; muted: boolean }[];
  dotOverflow: number;
  events: MonthEvent[];
  eventOverflow: number;
  blockCount: number;
  bookedLabel: string | null;
  openLabel: string | null;
  sharePct: number;
  href: string;
  ariaLabel: string;
}

interface PopPos {
  top: number;
  left: number;
  above: boolean;
}

const POP_WIDTH = 248;
const GAP = 8;

/**
 * One day in the month grid. A `<Link>` to that day at rest (dots + share bar),
 * with a quiet detail popover on hover or keyboard focus. The popover is fixed
 * to the viewport so it escapes the grid's `overflow: hidden`, and is
 * `pointer-events: none` so it never intercepts the cell's click. Empty days
 * carry no popover — there's nothing to name.
 */
export function MonthCell({ view }: { view: MonthCellView }) {
  const [pos, setPos] = useState<PopPos | null>(null);
  const ref = useRef<HTMLAnchorElement>(null);
  const popId = useId();
  const hasDetail = view.blockCount > 0;

  function open() {
    if (!hasDetail || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.left;
    if (left + POP_WIDTH > vw - GAP) left = rect.right - POP_WIDTH;
    left = Math.max(GAP, left);

    const visibleRows = view.events.length + (view.eventOverflow > 0 ? 1 : 0);
    const estHeight = 38 + visibleRows * 20 + 14;
    let top = rect.bottom + GAP;
    let above = false;
    if (top + estHeight > vh - GAP) {
      top = rect.top - GAP - estHeight;
      above = true;
    }
    top = Math.max(GAP, top);
    setPos({ top, left, above });
  }

  function close() {
    setPos(null);
  }

  return (
    <Link
      ref={ref}
      className="month-cell"
      href={view.href}
      data-today={view.isToday || undefined}
      data-past={view.isPast || undefined}
      data-other-month={!view.inMonth || undefined}
      aria-label={view.ariaLabel}
      aria-describedby={pos ? popId : undefined}
      onPointerEnter={open}
      onPointerLeave={close}
      onFocus={open}
      onBlur={close}
    >
      <span className="month-cell-num num">{view.dayNum}</span>

      {view.dots.length > 0 && (
        <span className="month-cell-dots" aria-hidden="true">
          {view.dots.map((dot, i) => (
            <span
              key={i}
              className="month-cell-dot"
              data-muted={dot.muted || undefined}
              data-gcal={dot.gcal || undefined}
            />
          ))}
          {view.dotOverflow > 0 && (
            <span className="month-cell-dots-more num">+{view.dotOverflow}</span>
          )}
        </span>
      )}

      <span className="month-cell-bar" aria-hidden="true">
        <span className="month-cell-bar-booked" style={{ width: `${view.sharePct}%` }} />
      </span>

      {pos && (
        <div
          id={popId}
          role="tooltip"
          className="month-pop"
          data-above={pos.above || undefined}
          style={{ top: pos.top, left: pos.left, width: POP_WIDTH }}
        >
          <div className="month-pop-head">
            <span className="month-pop-date">{view.dateLabel}</span>
            <span className="month-pop-stat num">
              {view.bookedLabel ? `${view.bookedLabel} booked` : `${view.blockCount} on`}
            </span>
          </div>
          <ul className="month-pop-list">
            {view.events.map((ev, i) => (
              <li
                key={i}
                className="month-pop-row"
                data-gcal={ev.gcal || undefined}
                data-muted={ev.muted || undefined}
              >
                <span className="month-pop-dot" />
                <span className="month-pop-time num">{ev.time}</span>
                <span className="month-pop-title">{ev.title}</span>
              </li>
            ))}
            {view.eventOverflow > 0 && (
              <li className="month-pop-more num">+{view.eventOverflow} more</li>
            )}
          </ul>
        </div>
      )}
    </Link>
  );
}
