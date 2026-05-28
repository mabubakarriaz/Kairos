"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteBlockAction, rescheduleAction } from "@/app/actions";
import { DAY_MINUTES, PX_PER_MIN, fmtRange, fmtDuration, minutesFromDayStart, snapMinutes } from "@/lib/time";
import type { FreeSlot, ScheduledBlock } from "@/lib/types";

const HOUR_PX = 60 * PX_PER_MIN; // 96
const GRID_HEIGHT = DAY_MINUTES * PX_PER_MIN; // 2304
const HOURS = Array.from({ length: 24 }, (_, h) => h);

interface Props {
  dayStartUtc: string;
  blocks: ScheduledBlock[];
  freeSlots: FreeSlot[];
  isToday: boolean;
}

type DragState = { id: string; topMin: number; durMin: number } | null;

export function DayColumn({ dayStartUtc, blocks, freeSlots, isToday }: Props) {
  const router = useRouter();
  const dayStartMs = new Date(dayStartUtc).getTime();

  const [drag, setDrag] = useState<DragState>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMin, setNowMin] = useState<number | null>(null);

  // Live current-time line — minutes since the day start (UTC), refreshed every 30s.
  useEffect(() => {
    if (!isToday) {
      setNowMin(null);
      return;
    }
    const tick = () => setNowMin((Date.now() - dayStartMs) / 60_000);
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [isToday, dayStartMs]);

  const durationMin = (b: ScheduledBlock) =>
    (new Date(b.endUtc).getTime() - new Date(b.startUtc).getTime()) / 60_000;

  function startDrag(e: React.PointerEvent, block: ScheduledBlock) {
    if (block.source !== "kairos" || pendingId) return;
    e.preventDefault();

    const origTop = minutesFromDayStart(block.startUtc, dayStartUtc);
    const durMin = durationMin(block);
    const startY = e.clientY;
    let liveTop = origTop;
    let moved = false;

    setError(null);
    setDrag({ id: block.id, topMin: origTop, durMin });

    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientY - startY) > 3) moved = true;
      const deltaMin = (ev.clientY - startY) / PX_PER_MIN;
      liveTop = Math.max(0, Math.min(snapMinutes(origTop + deltaMin), DAY_MINUTES - durMin));
      setDrag({ id: block.id, topMin: liveTop, durMin });
    };

    const onUp = async () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      if (!moved || liveTop === origTop) {
        setDrag(null);
        return;
      }

      const newStart = new Date(dayStartMs + liveTop * 60_000).toISOString();
      const newEnd = new Date(dayStartMs + (liveTop + durMin) * 60_000).toISOString();

      setPendingId(block.id);
      const res = await rescheduleAction(block.id, newStart, newEnd);
      setPendingId(null);
      setDrag(null);

      if (!res.ok) setError(res.error ?? "Could not reschedule.");
      else {
        setError(null);
        router.refresh();
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  async function remove(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setPendingId(id);
    const res = await deleteBlockAction(id);
    setPendingId(null);
    if (!res.ok) setError(res.error ?? "Could not delete.");
    else {
      setError(null);
      router.refresh();
    }
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-2 rounded-lg border border-now/40 bg-now/10 px-3 py-2 text-xs font-medium text-now">
          {error}
        </p>
      )}

      <div className="day-grid" style={{ height: GRID_HEIGHT }}>
        {HOURS.map((h) => (
          <div key={h} className="hour-label" style={{ top: h * HOUR_PX }}>
            {String(h).padStart(2, "0")}:00
          </div>
        ))}

        {freeSlots.map((s, i) => {
          const top = minutesFromDayStart(s.startUtc, dayStartUtc);
          const height = s.minutes * PX_PER_MIN;
          if (height < 12) return null;
          return (
            <div key={`free-${i}`} className="freeslot" style={{ top, height }}>
              {height > 28 ? `${fmtDuration(s.minutes)} free` : ""}
            </div>
          );
        })}

        {blocks.map((b) => {
          const isDragging = drag?.id === b.id;
          const top = isDragging ? drag!.topMin : minutesFromDayStart(b.startUtc, dayStartUtc);
          const dur = isDragging ? drag!.durMin : durationMin(b);
          const height = Math.max(dur * PX_PER_MIN, 18);
          const movable = b.source === "kairos";

          const startIso = new Date(dayStartMs + top * 60_000).toISOString();
          const endIso = new Date(dayStartMs + (top + dur) * 60_000).toISOString();

          const cls = [
            "block",
            movable ? "block-kairos" : "block-gcal",
            isDragging ? "block-dragging" : "",
            pendingId === b.id ? "block-pending" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={b.id} className={cls} style={{ top, height }} onPointerDown={(e) => startDrag(e, b)}>
              {movable && (
                <button
                  type="button"
                  className="block-del"
                  aria-label="Remove block"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => remove(e, b.id)}
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
              <div className="block-title">{b.title}</div>
              <div className="block-time">
                {isDragging ? fmtRange(startIso, endIso) : fmtRange(b.startUtc, b.endUtc)}
              </div>
            </div>
          );
        })}

        {nowMin !== null && nowMin >= 0 && nowMin <= DAY_MINUTES && (
          <div className="now-line" style={{ top: nowMin * PX_PER_MIN }} />
        )}
      </div>
    </div>
  );
}
