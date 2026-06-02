"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteBlockAction, editBlockAction, rescheduleAction } from "@/app/actions";
import {
  DAY_MINUTES,
  PX_PER_MIN,
  SLOT_MINUTES,
  blockTimeMeta,
  fmtClock,
  fmtCountdown,
  fmtDuration,
  fmtHourLabel,
  minutesFromDayStart,
  snapMinutes,
} from "@/lib/time";
import { matchesLabelFilter } from "@/lib/labels";
import type { Checkpoint, FreeSlot, ScheduledBlock } from "@/lib/types";
import { InlineComposer } from "./InlineComposer";
import { CheckpointEditor } from "./CheckpointEditor";
import { LabelFilter } from "./LabelFilter";

const HOUR_PX = 60 * PX_PER_MIN; // 96
const GRID_HEIGHT = DAY_MINUTES * PX_PER_MIN; // 2304
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DEFAULT_NEW_DURATION = 60;

interface Props {
  date: string;
  dayStartUtc: string;
  blocks: ScheduledBlock[];
  freeSlots: FreeSlot[];
  checkpoints: Checkpoint[];
  isToday: boolean;
  isPast: boolean;
  filterLabels: string[];
  labelsQuery: string;
  recentTags: string[];
}

type DragState = {
  id: string;
  mode: "move" | "resize";
  topMin: number;
  durMin: number;
} | null;
type ComposerState = { topMin: number; durMin: number } | null;

/**
 * Checkpoint editor state — either creating a new one at `topMin`, or editing
 * an existing checkpoint at its current resolved time. `null` = closed.
 */
type CheckpointEditState =
  | { mode: "new"; topMin: number }
  | { mode: "edit"; id: string; label: string; at: string; topMin: number }
  | null;

function checkpointTopMin(c: Checkpoint): number {
  const [hh, mm] = c.at.split(":").map(Number);
  return hh * 60 + mm;
}

export function DayColumn({
  date,
  dayStartUtc,
  blocks,
  freeSlots,
  checkpoints,
  isToday,
  isPast,
  filterLabels,
  recentTags,
}: Props) {
  const router = useRouter();
  const dayStartMs = new Date(dayStartUtc).getTime();

  const [drag, setDrag] = useState<DragState>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMin, setNowMin] = useState<number | null>(null);
  const [composer, setComposer] = useState<ComposerState>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cpEdit, setCpEdit] = useState<CheckpointEditState>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Keyboard move/resize: an uncommitted local adjustment shown immediately,
  // committed on a short debounce so a burst of arrow presses fires one save.
  const [keyAdjust, setKeyAdjust] = useState<
    { id: string; mode: "move" | "resize"; topMin: number; durMin: number } | null
  >(null);
  const keyAdjustRef = useRef<typeof keyAdjust>(null);
  const keyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Pointer-down origin on the empty-grid catcher, used to tell a tap (create a
  // block here) from a scroll/drag (move the day). Without it, on touch every
  // attempt to scroll by dragging empty space would drop a composer.
  const catcherTap = useRef<{ x: number; y: number } | null>(null);

  // Current-time line. "The position is the time" — so we re-arm to the next
  // minute boundary (rather than a fixed interval) so the displayed HH:MM flips
  // exactly on the minute instead of drifting. The app is opened many times a
  // day, so a tab returning from the background (laptop wake, tab switch) also
  // re-syncs immediately rather than showing a stale now-mark for up to a minute.
  useEffect(() => {
    if (!isToday) {
      setNowMin(null);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      clearTimeout(timer);
      setNowMin((Date.now() - dayStartMs) / 60_000);
      const msToNextMinute = 60_000 - (Date.now() % 60_000);
      timer = setTimeout(tick, msToNextMinute + 50);
    };
    tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isToday, dayStartMs]);

  // First-paint scroll. On today, if a block is currently in flight, center the
  // viewport on it — the user lands on the task that's happening right now.
  // Otherwise anchor 60 minutes above the current minute. Past/future days fall
  // back to a neutral 6am anchor.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const viewport = el.clientHeight;
    let targetMin: number;
    if (isToday) {
      const synchronousNow = (Date.now() - dayStartMs) / 60_000;
      const active = blocks.find((b) => {
        const s = minutesFromDayStart(b.startUtc, dayStartUtc);
        const e = minutesFromDayStart(b.endUtc, dayStartUtc);
        return synchronousNow >= s && synchronousNow < e;
      });
      if (active) {
        const s = minutesFromDayStart(active.startUtc, dayStartUtc);
        const e = minutesFromDayStart(active.endUtc, dayStartUtc);
        const centerPx = ((s + e) / 2) * PX_PER_MIN;
        el.scrollTop = Math.max(0, centerPx - viewport / 2);
        return;
      }
      targetMin = Math.max(0, synchronousNow - 60);
    } else {
      targetMin = 6 * 60;
    }
    el.scrollTop = targetMin * PX_PER_MIN;
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blocksByStart = useMemo(
    () =>
      [...blocks].sort(
        (a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime(),
      ),
    [blocks],
  );

  // Largest duration we can fit starting at `topMin`, capped at DEFAULT_NEW_DURATION.
  const availableDuration = useCallback(
    (topMin: number): number => {
      let nextStart = DAY_MINUTES;
      for (const b of blocksByStart) {
        const s = minutesFromDayStart(b.startUtc, dayStartUtc);
        if (s > topMin) {
          nextStart = s;
          break;
        }
      }
      const gap = nextStart - topMin;
      return Math.max(15, Math.min(DEFAULT_NEW_DURATION, gap));
    },
    [blocksByStart, dayStartUtc],
  );

  // Snap-and-clamp the clicked minute to a valid starting position (not inside a block).
  const spawnComposerAt = useCallback(
    (clickedMin: number) => {
      if (isPast) return;
      const snapped = snapMinutes(clickedMin);
      // If the snap lands inside an existing block, push to the block's end.
      let topMin = snapped;
      for (const b of blocksByStart) {
        const s = minutesFromDayStart(b.startUtc, dayStartUtc);
        const e = minutesFromDayStart(b.endUtc, dayStartUtc);
        if (snapped >= s && snapped < e) {
          topMin = e;
          break;
        }
      }
      topMin = Math.min(topMin, DAY_MINUTES - 15);
      setComposer({ topMin, durMin: availableDuration(topMin) });
    },
    [blocksByStart, dayStartUtc, availableDuration, isPast],
  );

  function onCatcherPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || isPast) return;
    catcherTap.current = { x: e.clientX, y: e.clientY };
  }

  // Spawn only when the pointer barely moved between down and up: a tap creates,
  // a drag (touch scroll, or an errant mouse drag) does not. Mouse clicks land
  // here with zero movement, so desktop click-to-create is unchanged.
  function onCatcherPointerUp(e: React.PointerEvent) {
    const start = catcherTap.current;
    catcherTap.current = null;
    if (!start || isPast || !gridRef.current) return;
    if (Math.abs(e.clientX - start.x) > 10 || Math.abs(e.clientY - start.y) > 10) return;
    const rect = gridRef.current.getBoundingClientRect();
    const clickedMin = (e.clientY - rect.top) / PX_PER_MIN;
    spawnComposerAt(clickedMin);
  }

  // 'n' = next-free task composer · 'c' = new checkpoint editor.
  // Both Esc-close, and both ignore key events while the user is typing.
  useEffect(() => {
    if (isPast) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setCpEdit(null);
        const target = pickComposerTarget();
        setComposer(target);
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        setComposer(null);
        const seed = isToday && nowMin != null ? Math.max(0, nowMin) : 9 * 60;
        setCpEdit({ mode: "new", topMin: snapMinutes(seed) });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freeSlots, blocksByStart, dayStartUtc, nowMin, isPast, isToday]);

  function pickComposerTarget(): ComposerState {
    // Today: first free slot ending after now. Else: first free slot of the day.
    const cursor = isToday && nowMin != null ? Math.max(0, nowMin) : 0;
    const slot =
      freeSlots
        .map((s) => ({
          start: minutesFromDayStart(s.startUtc, dayStartUtc),
          end: minutesFromDayStart(s.endUtc, dayStartUtc),
          minutes: s.minutes,
        }))
        .find((s) => s.end > cursor) ?? null;
    if (!slot) return { topMin: snapMinutes(cursor), durMin: availableDuration(cursor) };
    const topMin = snapMinutes(Math.max(slot.start, cursor));
    const durMin = Math.max(15, Math.min(DEFAULT_NEW_DURATION, slot.end - topMin));
    return { topMin, durMin };
  }

  const durationMin = (b: ScheduledBlock) =>
    (new Date(b.endUtc).getTime() - new Date(b.startUtc).getTime()) / 60_000;

  function startDrag(e: React.PointerEvent, block: ScheduledBlock) {
    if (block.source !== "kairos" || pendingId || isPast) return;
    if (editingId === block.id) return;
    e.preventDefault();
    setComposer(null);

    const origTop = minutesFromDayStart(block.startUtc, dayStartUtc);
    const durMin = durationMin(block);
    const startY = e.clientY;
    let liveTop = origTop;
    let moved = false;

    setError(null);
    setDrag({ id: block.id, mode: "move", topMin: origTop, durMin });

    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientY - startY) > 3) moved = true;
      const deltaMin = (ev.clientY - startY) / PX_PER_MIN;
      liveTop = Math.max(0, Math.min(snapMinutes(origTop + deltaMin), DAY_MINUTES - durMin));
      setDrag({ id: block.id, mode: "move", topMin: liveTop, durMin });
    };

    const teardown = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };

    // Interrupted gesture (touch taken over, tab hidden) → abandon the drag
    // without committing, so the block never gets stuck in drag state.
    const onCancel = () => {
      teardown();
      setDrag(null);
    };

    const onUp = async () => {
      teardown();

      if (!moved) {
        // No drag → open the title editor on this block.
        setDrag(null);
        setEditingId(block.id);
        return;
      }
      if (liveTop === origTop) {
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
    window.addEventListener("pointercancel", onCancel);
  }

  // Largest duration this block can grow to, given the next neighbor.
  const maxDurAt = useCallback(
    (topMin: number, excludeId: string): number => {
      let nextStart = DAY_MINUTES;
      for (const b of blocksByStart) {
        if (b.id === excludeId) continue;
        const s = minutesFromDayStart(b.startUtc, dayStartUtc);
        if (s > topMin) {
          nextStart = s;
          break;
        }
      }
      return Math.max(15, nextStart - topMin);
    },
    [blocksByStart, dayStartUtc],
  );

  function startResize(e: React.PointerEvent, block: ScheduledBlock) {
    if (block.source !== "kairos" || pendingId || isPast) return;
    e.preventDefault();
    e.stopPropagation();
    setComposer(null);
    setEditingId(null);

    const topMin = minutesFromDayStart(block.startUtc, dayStartUtc);
    const origDur = durationMin(block);
    const startY = e.clientY;
    const cap = maxDurAt(topMin, block.id);
    let liveDur = origDur;
    let moved = false;

    setError(null);
    setDrag({ id: block.id, mode: "resize", topMin, durMin: origDur });

    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientY - startY) > 3) moved = true;
      const deltaMin = (ev.clientY - startY) / PX_PER_MIN;
      liveDur = Math.max(15, Math.min(snapMinutes(origDur + deltaMin), cap));
      setDrag({ id: block.id, mode: "resize", topMin, durMin: liveDur });
    };

    const teardown = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };

    const onCancel = () => {
      teardown();
      setDrag(null);
    };

    const onUp = async () => {
      teardown();

      if (!moved || liveDur === origDur) {
        setDrag(null);
        return;
      }

      const newStart = new Date(dayStartMs + topMin * 60_000).toISOString();
      const newEnd = new Date(dayStartMs + (topMin + liveDur) * 60_000).toISOString();

      setPendingId(block.id);
      const res = await rescheduleAction(block.id, newStart, newEnd);
      setPendingId(null);
      setDrag(null);

      if (!res.ok) setError(res.error ?? "Could not resize.");
      else {
        setError(null);
        router.refresh();
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  async function commitEdit(
    block: ScheduledBlock,
    nextTitle: string,
    nextLabelsRaw: string,
  ) {
    setEditingId(null);
    const trimmed = nextTitle.trim();
    if (!trimmed) return;
    const originalLabelsRaw = block.tags.join(", ");
    if (trimmed === block.title.trim() && nextLabelsRaw.trim() === originalLabelsRaw) return;

    setPendingId(block.id);
    const res = await editBlockAction(block.id, trimmed, nextLabelsRaw);
    setPendingId(null);

    if (!res.ok) setError(res.error ?? "Could not save.");
    else {
      setError(null);
      router.refresh();
    }
  }

  function beginRemove(block: ScheduledBlock) {
    if (pendingId) return; // a reschedule/resize is in flight — don't race it
    // Recurring blocks open the inline confirm strip; one-shot blocks delete
    // immediately (the existing immediate-and-final behaviour).
    if (block.seriesId) {
      setConfirmDeleteId(block.id);
      return;
    }
    void commitRemove(block.id, "occurrence");
  }

  function requestRemove(e: React.MouseEvent, block: ScheduledBlock) {
    e.stopPropagation();
    beginRemove(block);
  }

  async function commitRemove(id: string, scope: "occurrence" | "future") {
    setConfirmDeleteId(null);
    setPendingId(id);
    const res = await deleteBlockAction(id, scope);
    setPendingId(null);
    if (!res.ok) setError(res.error ?? "Could not delete.");
    else {
      setError(null);
      router.refresh();
    }
  }

  function cancelKeyAdjust() {
    if (keyTimer.current) {
      clearTimeout(keyTimer.current);
      keyTimer.current = null;
    }
    keyAdjustRef.current = null;
    setKeyAdjust(null);
  }

  async function commitKeyAdjust(block: ScheduledBlock) {
    keyTimer.current = null;
    const adj = keyAdjustRef.current;
    if (!adj || adj.id !== block.id) return;
    const origTop = minutesFromDayStart(block.startUtc, dayStartUtc);
    const origDur = durationMin(block);
    if (adj.topMin === origTop && adj.durMin === origDur) {
      cancelKeyAdjust();
      return;
    }
    const newStart = new Date(dayStartMs + adj.topMin * 60_000).toISOString();
    const newEnd = new Date(dayStartMs + (adj.topMin + adj.durMin) * 60_000).toISOString();
    setPendingId(block.id);
    const res = await rescheduleAction(block.id, newStart, newEnd);
    setPendingId(null);
    keyAdjustRef.current = null;
    setKeyAdjust(null);
    if (!res.ok) setError(res.error ?? "Could not reschedule.");
    else {
      setError(null);
      router.refresh();
    }
  }

  // Keyboard parity for the bespoke drag engine: arrows move (±15m), Shift+arrows
  // resize, Enter/Space edits the title, Delete/Backspace removes, Escape reverts
  // an uncommitted nudge. Saves are debounced so a burst of presses is one write.
  function onBlockKeyDown(e: React.KeyboardEvent, block: ScheduledBlock) {
    if (block.source !== "kairos" || isPast || pendingId) return;
    if (editingId === block.id) return; // the title input owns keys while editing

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      cancelKeyAdjust();
      setComposer(null);
      setEditingId(block.id);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      cancelKeyAdjust();
      beginRemove(block);
      return;
    }
    if (e.key === "Escape") {
      if (keyAdjustRef.current?.id === block.id) {
        e.preventDefault();
        cancelKeyAdjust();
      }
      return;
    }
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

    e.preventDefault();
    const base =
      keyAdjustRef.current?.id === block.id
        ? keyAdjustRef.current
        : {
            id: block.id,
            mode: "move" as const,
            topMin: minutesFromDayStart(block.startUtc, dayStartUtc),
            durMin: durationMin(block),
          };
    const dir = e.key === "ArrowUp" ? -1 : 1;
    let next: typeof base;
    if (e.shiftKey) {
      const cap = maxDurAt(base.topMin, block.id);
      const durMin = Math.max(SLOT_MINUTES, Math.min(cap, base.durMin + dir * SLOT_MINUTES));
      next = { ...base, mode: "resize", durMin };
    } else {
      const topMin = Math.max(
        0,
        Math.min(DAY_MINUTES - base.durMin, base.topMin + dir * SLOT_MINUTES),
      );
      next = { ...base, mode: "move", topMin };
    }
    keyAdjustRef.current = next;
    setKeyAdjust(next);
    if (keyTimer.current) clearTimeout(keyTimer.current);
    keyTimer.current = setTimeout(() => void commitKeyAdjust(block), 450);
  }

  // Flush any pending keyboard commit if the component unmounts mid-nudge.
  useEffect(() => {
    return () => {
      if (keyTimer.current) clearTimeout(keyTimer.current);
    };
  }, []);

  // Hide the very last free slot if it's the post-day filler past 23:45ish.
  const visibleFreeSlots = freeSlots.filter((s) => s.minutes >= 15);
  const nextFree = pickComposerTarget();
  const fullyBooked = visibleFreeSlots.length === 0 && blocks.length > 0;
  const empty = blocks.length === 0;
  const inViewLabels = useMemo(
    () => Array.from(new Set(blocks.flatMap((b) => b.tags))).sort(),
    [blocks],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <p
          role="alert"
          className="mb-3 px-1 text-xs font-medium text-now"
        >
          {error}
        </p>
      )}

      <div
        ref={scrollRef}
        className="scroll-area min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-md border border-hairline bg-surface"
      >
        <div
          ref={gridRef}
          className={`day-grid ${drag ? "grid-dragging" : ""}`}
          style={{ height: GRID_HEIGHT }}
        >
          {/* Hour labels — 12h compact form: "12a", "9a", "12p", "11p". */}
          {HOURS.map((h) => (
            <div key={h} className="hour-label" style={{ top: h * HOUR_PX }}>
              {fmtHourLabel(h)}
            </div>
          ))}

          {/* Click-to-create catcher (below blocks; pointer-events captured here) */}
          {!isPast && (
            <div
              className="grid-catcher"
              onPointerDown={onCatcherPointerDown}
              onPointerUp={onCatcherPointerUp}
              role="presentation"
            />
          )}

          {/* Checkpoints — scalar day-dividers. Past days are display-only.
              On today, a future checkpoint carries a faint "in Xh Ym" trailer
              that disappears the moment now ≥ time. */}
          {checkpoints.map((c) => {
            if (cpEdit?.mode === "edit" && cpEdit.id === c.id) return null;
            const topMin = checkpointTopMin(c);
            const countdown =
              isToday && nowMin != null ? fmtCountdown(topMin - nowMin) : null;
            return (
              <div
                key={c.id}
                className="checkpoint"
                data-past={isPast || undefined}
                style={{ top: topMin * PX_PER_MIN }}
              >
                <span className="checkpoint-tick" aria-hidden="true" />
                <button
                  type="button"
                  className="checkpoint-tag"
                  onClick={() => {
                    if (isPast) return;
                    setComposer(null);
                    setCpEdit({
                      mode: "edit",
                      id: c.id,
                      label: c.label,
                      at: c.at,
                      topMin,
                    });
                  }}
                  aria-label={`Edit checkpoint ${c.label} at ${fmtClock(topMin)}`}
                  disabled={isPast}
                >
                  <span className="checkpoint-tag-time num">{fmtClock(topMin)}</span>
                  <span className="checkpoint-tag-sep" aria-hidden="true">·</span>
                  <span className="checkpoint-tag-label">{c.label}</span>
                  {countdown && (
                    <>
                      <span className="checkpoint-tag-sep" aria-hidden="true">·</span>
                      <span className="checkpoint-tag-time num">{countdown}</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}

          {/* Free-slot ghosts: top hairline + tiny timestamp at top-left */}
          {visibleFreeSlots.map((s, i) => {
            const topMin = minutesFromDayStart(s.startUtc, dayStartUtc);
            const height = s.minutes * PX_PER_MIN;
            if (topMin === 0 && height >= DAY_MINUTES * PX_PER_MIN - 1) {
              // Full-day ghost — skip to avoid a single hairline at the very top.
              return null;
            }
            return (
              <div
                key={`free-${i}`}
                className="freeslot"
                style={{ top: topMin * PX_PER_MIN, height }}
              >
                {height >= 22 && (
                  <span className="freeslot-label">
                    {fmtClock(topMin)} · {fmtDuration(s.minutes)} free
                  </span>
                )}
              </div>
            );
          })}

          {/* Empty-day prompt */}
          {empty && !composer && !isPast && (
            <div
              className="empty-line"
              style={{
                top: 9 * HOUR_PX,
                height: 4 * HOUR_PX,
              }}
            >
              <p className="empty-headline">An empty page.</p>
              <p className="empty-sub">
                Click anywhere to drop a block · press <kbd>n</kbd> for next free ·{" "}
                <kbd>c</kbd> for a checkpoint
              </p>
            </div>
          )}
          {empty && isPast && (
            <div className="empty-line" style={{ top: 9 * HOUR_PX, height: 4 * HOUR_PX }}>
              <p className="empty-headline text-ink-muted">Nothing was on this day.</p>
            </div>
          )}

          {/* Blocks */}
          {blocks.map((b) => {
            const isDragging = drag?.id === b.id;
            const isResizing = isDragging && drag!.mode === "resize";
            const isKeyAdjusting = !isDragging && keyAdjust?.id === b.id;
            const topMin = isDragging
              ? drag!.topMin
              : isKeyAdjusting
                ? keyAdjust!.topMin
                : minutesFromDayStart(b.startUtc, dayStartUtc);
            const dur = isDragging
              ? drag!.durMin
              : isKeyAdjusting
                ? keyAdjust!.durMin
                : durationMin(b);
            const height = Math.max(dur * PX_PER_MIN, 22);
            const movable = b.source === "kairos" && !isPast;
            const isEditing = editingId === b.id;
            const filteredOut = !matchesLabelFilter(b.tags, filterLabels);
            const isActive =
              isToday && nowMin != null && nowMin >= topMin && nowMin < topMin + dur;

            const cls = [
              "block",
              movable ? "block-kairos" : "",
              isDragging && !isResizing ? "block-dragging" : "",
              isResizing ? "block-resizing" : "",
              isEditing ? "block-editing" : "",
              pendingId === b.id ? "block-pending" : "",
              filteredOut ? "block-filtered-out" : "",
              isActive ? "block-active" : "",
              isPast ? "opacity-75" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div
                key={b.id}
                className={cls}
                style={{ top: topMin * PX_PER_MIN, height }}
                onPointerDown={(e) => startDrag(e, b)}
                onKeyDown={movable ? (e) => onBlockKeyDown(e, b) : undefined}
                tabIndex={movable ? 0 : undefined}
                aria-label={
                  movable
                    ? `${b.title || "Untitled"}, ${fmtClock(topMin)} to ${fmtClock(topMin + dur)}`
                    : undefined
                }
                aria-keyshortcuts={movable ? "ArrowUp ArrowDown Shift+ArrowUp Enter Delete" : undefined}
              >
                {isActive && !isEditing && (
                  <span className="block-now-glyph" aria-label="Now">
                    now
                  </span>
                )}
                {movable && !isEditing && confirmDeleteId !== b.id && (
                  <button
                    type="button"
                    className="block-del"
                    aria-label={b.seriesId ? "Remove block (recurring)" : "Remove block"}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => requestRemove(e, b)}
                  >
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
                {movable && !isEditing && confirmDeleteId === b.id && (
                  <SeriesDeleteConfirm
                    onJustThis={() => void commitRemove(b.id, "occurrence")}
                    onFuture={() => void commitRemove(b.id, "future")}
                    onCancel={() => setConfirmDeleteId(null)}
                  />
                )}
                {isEditing ? (
                  <BlockEditor
                    initialTitle={b.title}
                    initialLabels={b.tags.join(", ")}
                    onCommit={(nextTitle, nextLabels) => commitEdit(b, nextTitle, nextLabels)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div className="block-title">{b.title}</div>
                )}
                {!isEditing && (
                  <BlockTimeLine
                    startMin={topMin}
                    endMin={topMin + dur}
                    nowMin={isToday ? nowMin : null}
                  />
                )}
                {!isEditing && b.tags.length > 0 && <BlockTags tags={b.tags} />}
                {movable && !isEditing && (
                  <div
                    className="block-resize"
                    onPointerDown={(e) => startResize(e, b)}
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Resize block duration"
                  />
                )}
              </div>
            );
          })}

          {/* Inline composer at the clicked slot */}
          {composer && (
            <InlineComposer
              date={date}
              topMin={composer.topMin}
              durMin={composer.durMin}
              recentTags={recentTags}
              onClose={() => setComposer(null)}
              onSubmitted={() => setComposer(null)}
            />
          )}

          {/* Checkpoint editor (new or edit). Overlays the line at its y. */}
          {cpEdit && cpEdit.mode === "new" && (
            <CheckpointEditor
              mode="new"
              date={date}
              topMin={cpEdit.topMin}
              onClose={() => setCpEdit(null)}
              onCommitted={() => setCpEdit(null)}
            />
          )}
          {cpEdit && cpEdit.mode === "edit" && (
            <CheckpointEditor
              mode="edit"
              date={date}
              id={cpEdit.id}
              label={cpEdit.label}
              at={cpEdit.at}
              topMin={cpEdit.topMin}
              onClose={() => setCpEdit(null)}
              onCommitted={() => setCpEdit(null)}
            />
          )}

          {/* Now-mark — a full-width Ember hairline across the grid body plus a
              tabular-mono `now · HH:MM` label pinned to the right edge. The label
              sits outside the hour gutter so it never collides with the 9a / 10a
              hour-of-day labels. The active block still carries its own ember
              tells (block-active fill + NOW glyph + "X left" tail). */}
          {nowMin !== null && nowMin >= 0 && nowMin <= DAY_MINUTES && (
            <>
              <div
                className="now-line"
                style={{ top: nowMin * PX_PER_MIN }}
                aria-hidden="true"
              />
              <div className="now-label" style={{ top: nowMin * PX_PER_MIN }}>
                <span className="now-label-tag">now</span>
                <span className="now-label-time num">{fmtClock(nowMin)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom status line */}
      <div className="status-line">
        <div className="status-line-left">
          <LabelFilter filterLabels={filterLabels} inViewLabels={inViewLabels} />
          <span className="status-line-sep" aria-hidden="true" />
          <StatusLeft
            isPast={isPast}
            fullyBooked={fullyBooked}
            empty={empty}
            nextFree={nextFree}
            hasComposer={composer !== null}
            onClaim={() => setComposer(nextFree)}
          />
        </div>
        <StatusRight isPast={isPast} blockCount={blocks.length} hasComposer={composer !== null} />
      </div>
    </div>
  );
}

function SeriesDeleteConfirm({
  onJustThis,
  onFuture,
  onCancel,
}: {
  onJustThis: () => void;
  onFuture: () => void;
  onCancel: () => void;
}) {
  // Esc closes — match the rest of the inline-editor vocabulary.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div
      className="block-confirm num"
      role="group"
      aria-label="Remove recurring block"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="block-confirm-btn"
        onClick={(e) => {
          e.stopPropagation();
          onJustThis();
        }}
      >
        just this
      </button>
      <span className="block-confirm-sep" aria-hidden="true">·</span>
      <button
        type="button"
        className="block-confirm-btn block-confirm-btn-danger"
        onClick={(e) => {
          e.stopPropagation();
          onFuture();
        }}
      >
        + future
      </button>
      <button
        type="button"
        className="block-confirm-cancel"
        aria-label="Cancel remove"
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
      >
        <svg
          className="h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function BlockTags({ tags }: { tags: string[] }) {
  return (
    <div className="block-tags" aria-label={`Labels: ${tags.map((t) => `#${t}`).join(", ")}`}>
      {tags.map((t) => (
        <span key={t} className="block-tag num">
          #{t}
        </span>
      ))}
    </div>
  );
}

function StatusLeft({
  isPast,
  fullyBooked,
  empty,
  nextFree,
  hasComposer,
  onClaim,
}: {
  isPast: boolean;
  fullyBooked: boolean;
  empty: boolean;
  nextFree: ComposerState;
  hasComposer: boolean;
  onClaim: () => void;
}) {
  if (isPast) return <span className="num">past · read-only</span>;
  if (fullyBooked) return <span>fully booked</span>;
  if (empty) {
    return (
      <span>
        an empty page <span className="num text-ink-faint">·</span> click anywhere or press{" "}
        <kbd className="num rounded border border-hairline-strong px-1 text-[10px] text-ink-muted">
          n
        </kbd>
      </span>
    );
  }
  if (!nextFree) return null;
  return (
    <button type="button" onClick={onClaim} aria-label="Add task in next free slot">
      <span className="free-mark" aria-hidden="true" />
      <span className="text-ink-muted">next free</span>
      <span className="num text-ink">
        {fmtClock(nextFree.topMin)}
        <span className="text-ink-faint"> · </span>
        {fmtDuration(nextFree.durMin)}
      </span>
      {!hasComposer && (
        <span className="num text-[10px] text-ink-faint">
          ↵
        </span>
      )}
    </button>
  );
}

function BlockTimeLine({
  startMin,
  endMin,
  nowMin,
}: {
  startMin: number;
  endMin: number;
  nowMin: number | null;
}) {
  const meta = blockTimeMeta({ startMin, endMin, nowMin });
  return (
    <div className="block-time">
      {meta.range}
      <span className="block-time-sep">{" · "}</span>
      <span className="block-time-tail" data-active={meta.state === "active" || undefined}>
        {meta.tail}
      </span>
    </div>
  );
}

function BlockEditor({
  initialTitle,
  initialLabels,
  onCommit,
  onCancel,
}: {
  initialTitle: string;
  initialLabels: string;
  onCommit: (nextTitle: string, nextLabels: string) => void;
  onCancel: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const labelsRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(initialTitle);
  const [labels, setLabels] = useState(initialLabels);
  const committedRef = useRef(false);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  function commit() {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(title, labels);
  }

  function cancel() {
    if (committedRef.current) return;
    committedRef.current = true;
    onCancel();
  }

  // Blur of the wrapper (focus left the editor entirely) = commit. Focus
  // crossing between the title and labels inputs stays inside the wrapper,
  // so the next-tick check is what distinguishes "moved fields" from "left".
  function onWrapBlur(e: React.FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null;
    if (next && wrapRef.current && wrapRef.current.contains(next)) return;
    commit();
  }

  return (
    <div
      ref={wrapRef}
      className="block-editor"
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={onWrapBlur}
    >
      <input
        ref={titleRef}
        className="block-title-input"
        value={title}
        maxLength={140}
        spellCheck={false}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            labelsRef.current?.focus();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        aria-label="Block title"
      />
      <div className="block-labels-row">
        <span className="block-labels-sigil num" aria-hidden="true">#</span>
        <input
          ref={labelsRef}
          className="block-labels-input"
          value={labels}
          maxLength={140}
          spellCheck={false}
          placeholder="labels"
          onChange={(e) => setLabels(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          aria-label="Labels"
        />
      </div>
    </div>
  );
}

function StatusRight({
  isPast,
  blockCount,
  hasComposer,
}: {
  isPast: boolean;
  blockCount: number;
  hasComposer: boolean;
}) {
  if (hasComposer) {
    return (
      <span className="num text-[10px] uppercase tracking-[0.18em] text-ink-faint">
        composing
      </span>
    );
  }
  if (isPast) {
    return (
      <span className="num text-[10px] uppercase tracking-[0.18em] text-ink-faint">
        {blockCount} {blockCount === 1 ? "block" : "blocks"}
      </span>
    );
  }
  return (
    <span className="status-hints num">
      <span className="status-hint">
        <kbd>n</kbd>task
      </span>
      <span className="status-hint">
        <kbd>c</kbd>mark
      </span>
      <span className="status-line-sep" aria-hidden="true" />
      <span>
        {blockCount} {blockCount === 1 ? "block" : "blocks"}
      </span>
    </span>
  );
}
