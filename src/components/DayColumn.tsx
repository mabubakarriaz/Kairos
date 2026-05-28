"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteBlockAction, renameBlockAction, rescheduleAction } from "@/app/actions";
import {
  DAY_MINUTES,
  PX_PER_MIN,
  blockTimeMeta,
  fmtDuration,
  fmtHHMM,
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Current-time line — refresh every 30s while viewing today.
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

  // First-paint scroll: on today, anchor so the now-line sits 60 minutes below
  // the scroll top (1 hour of context above, the rest of the day below).
  // Compute "now" synchronously — the tick's setState hasn't run yet on mount.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let targetMin: number;
    if (isToday) {
      const synchronousNow = (Date.now() - dayStartMs) / 60_000;
      targetMin = Math.max(0, synchronousNow - 60);
    } else {
      targetMin = 6 * 60; // neutral pre-dawn anchor for past/future days
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
    if (!gridRef.current) return;
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

    const onUp = async () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

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

    const onUp = async () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

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
  }

  async function commitRename(blockId: string, nextTitle: string, originalTitle: string) {
    const trimmed = nextTitle.trim();
    setEditingId(null);
    if (!trimmed || trimmed === originalTitle.trim()) return;

    setPendingId(blockId);
    const res = await renameBlockAction(blockId, trimmed);
    setPendingId(null);

    if (!res.ok) setError(res.error ?? "Could not rename.");
    else {
      setError(null);
      router.refresh();
    }
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
    <div>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-md border border-now/40 bg-now/[0.07] px-3 py-2 text-xs font-medium text-now"
        >
          {error}
        </p>
      )}

      <div
        ref={scrollRef}
        className="scroll-area max-h-[78vh] overflow-y-auto overflow-x-hidden rounded-md border border-hairline bg-surface"
      >
        <div
          ref={gridRef}
          className={`day-grid ${drag ? "grid-dragging" : ""}`}
          style={{ height: GRID_HEIGHT }}
        >
          {/* Hour labels */}
          {HOURS.map((h) => (
            <div key={h} className="hour-label" style={{ top: h * HOUR_PX }}>
              {String(h).padStart(2, "0")}
            </div>
          ))}

          {/* Click-to-create catcher (below blocks; pointer-events captured here) */}
          {!isPast && (
            <div
              className="grid-catcher"
              onPointerDown={onCatcherPointerDown}
              role="presentation"
            />
          )}

          {/* Checkpoints — scalar day-dividers. The line + tag sit at z-18 so
              they stay visible (and clickable) over blocks at rest; block drag
              (z-30) and the now-line (z-20) still draw over them. Past days
              are display-only. */}
          {checkpoints.map((c) => {
            if (cpEdit?.mode === "edit" && cpEdit.id === c.id) return null;
            const topMin = checkpointTopMin(c);
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
                  aria-label={`Edit checkpoint ${c.label} at ${c.at}`}
                  disabled={isPast}
                >
                  <span className="checkpoint-tag-time num">{c.at}</span>
                  <span className="checkpoint-tag-sep" aria-hidden="true">·</span>
                  <span className="checkpoint-tag-label">{c.label}</span>
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
                    {fmtHHMM(topMin)} · {fmtDuration(s.minutes)} free
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
            const topMin = isDragging ? drag!.topMin : minutesFromDayStart(b.startUtc, dayStartUtc);
            const dur = isDragging ? drag!.durMin : durationMin(b);
            const height = Math.max(dur * PX_PER_MIN, 22);
            const movable = b.source === "kairos" && !isPast;
            const isEditing = editingId === b.id;
            const filteredOut = !matchesLabelFilter(b.tags, filterLabels);

            const cls = [
              "block",
              movable ? "block-kairos" : "",
              isDragging && !isResizing ? "block-dragging" : "",
              isResizing ? "block-resizing" : "",
              isEditing ? "block-editing" : "",
              pendingId === b.id ? "block-pending" : "",
              filteredOut ? "block-filtered-out" : "",
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
              >
                {movable && !isEditing && (
                  <button
                    type="button"
                    className="block-del"
                    aria-label="Remove block"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => remove(e, b.id)}
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
                {isEditing ? (
                  <BlockTitleInput
                    initial={b.title}
                    onCommit={(next) => commitRename(b.id, next, b.title)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div className="block-title">{b.title}</div>
                )}
                <BlockTimeLine
                  startMin={topMin}
                  endMin={topMin + dur}
                  nowMin={isToday ? nowMin : null}
                />
                {b.tags.length > 0 && <BlockTags tags={b.tags} />}
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

          {/* Now-line + gutter label */}
          {nowMin !== null && nowMin >= 0 && nowMin <= DAY_MINUTES && (
            <>
              <div className="now-label" style={{ top: nowMin * PX_PER_MIN }}>
                {fmtHHMM(nowMin)}
              </div>
              <div className="now-line" style={{ top: nowMin * PX_PER_MIN }} />
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
        {fmtHHMM(nextFree.topMin)}
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
      <span className="block-time-tail" data-active={meta.active || undefined}>
        {meta.tail}
      </span>
    </div>
  );
}

function BlockTitleInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  return (
    <input
      ref={ref}
      className="block-title-input"
      value={value}
      maxLength={140}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => onCommit(value)}
      aria-label="Block title"
    />
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
  if (isPast) return null;
  return (
    <span className="num text-[10px] uppercase tracking-[0.18em] text-ink-faint">
      {blockCount} {blockCount === 1 ? "block" : "blocks"}
    </span>
  );
}
