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
import type { FreeSlot, ScheduledBlock } from "@/lib/types";
import { InlineComposer } from "./InlineComposer";
import { LabelFilter } from "./LabelFilter";

const HOUR_PX = 60 * PX_PER_MIN; // 96
const GRID_HEIGHT = DAY_MINUTES * PX_PER_MIN; // 2304
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DEFAULT_NEW_DURATION = 60;

const weekdayShortFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

export interface WeekDay {
  date: string;
  dayStartUtc: string;
  blocks: ScheduledBlock[];
  freeSlots: FreeSlot[];
}

interface Props {
  days: WeekDay[];
  /** YYYY-MM-DD for "today" in the active zone — passed in from the server. */
  today: string;
  filterLabels: string[];
  labelsQuery: string;
  recentTags: string[];
  view: "5d" | "week";
}

type DragState = {
  id: string;
  mode: "move" | "resize";
  srcDateIdx: number;
  dstDateIdx: number;
  topMin: number;
  durMin: number;
} | null;

type ComposerState = { dateIdx: number; topMin: number; durMin: number } | null;

export function WeekColumns({ days, today, filterLabels, recentTags, view }: Props) {
  const router = useRouter();
  const todayIdx = days.findIndex((d) => d.date === today);
  const isPastByCol = useMemo(() => days.map((d) => d.date < today), [days, today]);
  const inViewLabels = useMemo(
    () => Array.from(new Set(days.flatMap((d) => d.blocks.flatMap((b) => b.tags)))).sort(),
    [days],
  );
  const colCount = days.length;
  const gridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${colCount}, 1fr)` as const,
    }),
    [colCount],
  );
  const canvasMinWidth = Math.max(560, colCount * 140);

  const [drag, setDrag] = useState<DragState>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMin, setNowMin] = useState<number | null>(null);
  const [composer, setComposer] = useState<ComposerState>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (todayIdx < 0) {
      setNowMin(null);
      return;
    }
    const dayStart = new Date(days[todayIdx].dayStartUtc).getTime();
    const tick = () => setNowMin((Date.now() - dayStart) / 60_000);
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [todayIdx, days]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let targetMin: number;
    if (todayIdx >= 0) {
      const dayStartMs = new Date(days[todayIdx].dayStartUtc).getTime();
      const synchronousNow = (Date.now() - dayStartMs) / 60_000;
      targetMin = Math.max(0, synchronousNow - 60);
    } else {
      targetMin = 6 * 60;
    }
    el.scrollTop = targetMin * PX_PER_MIN;
    // mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blocksByCol = useMemo(
    () =>
      days.map((d) =>
        [...d.blocks].sort(
          (a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime(),
        ),
      ),
    [days],
  );

  const draggedBlock = useMemo(() => {
    if (!drag) return null;
    for (const list of blocksByCol) {
      const found = list.find((x) => x.id === drag.id);
      if (found) return found;
    }
    return null;
  }, [drag, blocksByCol]);

  const availableDuration = useCallback(
    (colIdx: number, topMin: number): number => {
      let nextStart = DAY_MINUTES;
      for (const b of blocksByCol[colIdx]) {
        const s = minutesFromDayStart(b.startUtc, days[colIdx].dayStartUtc);
        if (s > topMin) {
          nextStart = s;
          break;
        }
      }
      const gap = nextStart - topMin;
      return Math.max(15, Math.min(DEFAULT_NEW_DURATION, gap));
    },
    [blocksByCol, days],
  );

  const spawnComposerAt = useCallback(
    (colIdx: number, clickedMin: number) => {
      if (isPastByCol[colIdx]) return;
      const snapped = snapMinutes(clickedMin);
      let topMin = snapped;
      for (const b of blocksByCol[colIdx]) {
        const s = minutesFromDayStart(b.startUtc, days[colIdx].dayStartUtc);
        const e = minutesFromDayStart(b.endUtc, days[colIdx].dayStartUtc);
        if (snapped >= s && snapped < e) {
          topMin = e;
          break;
        }
      }
      topMin = Math.min(topMin, DAY_MINUTES - 15);
      setComposer({ dateIdx: colIdx, topMin, durMin: availableDuration(colIdx, topMin) });
    },
    [blocksByCol, days, availableDuration, isPastByCol],
  );

  function onCatcherPointerDown(colIdx: number, e: React.PointerEvent) {
    if (e.button !== 0 || isPastByCol[colIdx]) return;
    const col = colRefs.current[colIdx];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const clickedMin = (e.clientY - rect.top) / PX_PER_MIN;
    spawnComposerAt(colIdx, clickedMin);
  }

  const pickComposerTarget = useCallback((): ComposerState => {
    let colIdx = todayIdx;
    if (colIdx < 0) {
      colIdx = isPastByCol.findIndex((p) => !p);
      if (colIdx < 0) return null;
    }
    const cursor = colIdx === todayIdx && nowMin != null ? Math.max(0, nowMin) : 0;
    const slot =
      days[colIdx].freeSlots
        .map((s) => ({
          start: minutesFromDayStart(s.startUtc, days[colIdx].dayStartUtc),
          end: minutesFromDayStart(s.endUtc, days[colIdx].dayStartUtc),
          minutes: s.minutes,
        }))
        .find((s) => s.end > cursor) ?? null;
    if (!slot) {
      return {
        dateIdx: colIdx,
        topMin: snapMinutes(cursor),
        durMin: availableDuration(colIdx, cursor),
      };
    }
    const topMin = snapMinutes(Math.max(slot.start, cursor));
    const durMin = Math.max(15, Math.min(DEFAULT_NEW_DURATION, slot.end - topMin));
    return { dateIdx: colIdx, topMin, durMin };
  }, [todayIdx, nowMin, days, isPastByCol, availableDuration]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "n" && e.key !== "N") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      const target = pickComposerTarget();
      if (target) setComposer(target);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickComposerTarget]);

  const durationMin = (b: ScheduledBlock) =>
    (new Date(b.endUtc).getTime() - new Date(b.startUtc).getTime()) / 60_000;

  function startDrag(e: React.PointerEvent, block: ScheduledBlock, srcColIdx: number) {
    if (block.source !== "kairos" || pendingId || isPastByCol[srcColIdx]) return;
    if (editingId === block.id) return;
    e.preventDefault();
    setComposer(null);

    const dayStartUtc = days[srcColIdx].dayStartUtc;
    const origTop = minutesFromDayStart(block.startUtc, dayStartUtc);
    const durMin = durationMin(block);
    const startY = e.clientY;
    const startX = e.clientX;
    let liveTop = origTop;
    let liveDst = srcColIdx;
    let moved = false;

    setError(null);
    setDrag({
      id: block.id,
      mode: "move",
      srcDateIdx: srcColIdx,
      dstDateIdx: srcColIdx,
      topMin: origTop,
      durMin,
    });

    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientY - startY) > 3 || Math.abs(ev.clientX - startX) > 3) moved = true;
      const deltaMin = (ev.clientY - startY) / PX_PER_MIN;
      liveTop = Math.max(0, Math.min(snapMinutes(origTop + deltaMin), DAY_MINUTES - durMin));

      const cols = colRefs.current;
      let dst = liveDst;
      for (let i = 0; i < cols.length; i++) {
        const el = cols[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX < r.right) {
          dst = i;
          break;
        }
      }
      // Refuse past columns as drop destinations — they are read-only.
      if (isPastByCol[dst]) dst = liveDst;
      liveDst = dst;

      setDrag({
        id: block.id,
        mode: "move",
        srcDateIdx: srcColIdx,
        dstDateIdx: dst,
        topMin: liveTop,
        durMin,
      });
    };

    const onUp = async () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      if (!moved) {
        setDrag(null);
        setEditingId(block.id);
        return;
      }
      if (liveDst === srcColIdx && liveTop === origTop) {
        setDrag(null);
        return;
      }

      const dstDayStartMs = new Date(days[liveDst].dayStartUtc).getTime();
      const newStart = new Date(dstDayStartMs + liveTop * 60_000).toISOString();
      const newEnd = new Date(dstDayStartMs + (liveTop + durMin) * 60_000).toISOString();

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

  const maxDurAt = useCallback(
    (colIdx: number, topMin: number, excludeId: string): number => {
      let nextStart = DAY_MINUTES;
      for (const b of blocksByCol[colIdx]) {
        if (b.id === excludeId) continue;
        const s = minutesFromDayStart(b.startUtc, days[colIdx].dayStartUtc);
        if (s > topMin) {
          nextStart = s;
          break;
        }
      }
      return Math.max(15, nextStart - topMin);
    },
    [blocksByCol, days],
  );

  function startResize(e: React.PointerEvent, block: ScheduledBlock, colIdx: number) {
    if (block.source !== "kairos" || pendingId || isPastByCol[colIdx]) return;
    e.preventDefault();
    e.stopPropagation();
    setComposer(null);
    setEditingId(null);

    const dayStartUtc = days[colIdx].dayStartUtc;
    const topMin = minutesFromDayStart(block.startUtc, dayStartUtc);
    const origDur = durationMin(block);
    const startY = e.clientY;
    const cap = maxDurAt(colIdx, topMin, block.id);
    let liveDur = origDur;
    let moved = false;

    setError(null);
    setDrag({
      id: block.id,
      mode: "resize",
      srcDateIdx: colIdx,
      dstDateIdx: colIdx,
      topMin,
      durMin: origDur,
    });

    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientY - startY) > 3) moved = true;
      const deltaMin = (ev.clientY - startY) / PX_PER_MIN;
      liveDur = Math.max(15, Math.min(snapMinutes(origDur + deltaMin), cap));
      setDrag({
        id: block.id,
        mode: "resize",
        srcDateIdx: colIdx,
        dstDateIdx: colIdx,
        topMin,
        durMin: liveDur,
      });
    };

    const onUp = async () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      if (!moved || liveDur === origDur) {
        setDrag(null);
        return;
      }

      const dayStartMs = new Date(dayStartUtc).getTime();
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

  const totalBlocks = days.reduce((n, d) => n + d.blocks.length, 0);
  const nextFree = pickComposerTarget();

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
        className="scroll-area max-h-[78vh] overflow-auto rounded-md border border-hairline bg-surface"
      >
        <div
          className={`week-grid ${drag ? "grid-dragging" : ""}`}
          data-view={view}
          style={{ minWidth: `${canvasMinWidth}px` }}
        >
          {/* Sticky weekday strip */}
          <div
            className="week-headers"
            style={{ gridTemplateColumns: `48px ${`repeat(${colCount}, 1fr)`}` }}
          >
            <div className="week-header-spacer" aria-hidden="true" />
            {days.map((d, i) => {
              const dt = new Date(`${d.date}T00:00:00.000Z`);
              const isTodayCol = d.date === today;
              return (
                <div
                  key={d.date}
                  className="week-col-header"
                  data-today={isTodayCol || undefined}
                  data-past={isPastByCol[i] || undefined}
                >
                  <span className="week-col-day">{weekdayShortFmt.format(dt)}</span>
                  <span className="week-col-date num">
                    {String(dt.getUTCDate()).padStart(2, "0")}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="week-canvas" style={{ height: GRID_HEIGHT }}>
            {HOURS.map((h) => (
              <div key={h} className="hour-label" style={{ top: h * HOUR_PX }}>
                {String(h).padStart(2, "0")}
              </div>
            ))}

            <div className="week-cols" style={gridStyle}>
              {days.map((d, i) => {
                const dayStartUtc = d.dayStartUtc;
                const past = isPastByCol[i];
                const isTodayCol = d.date === today;
                const blocks = blocksByCol[i];
                const visibleFreeSlots = d.freeSlots.filter((s) => s.minutes >= 15);

                const incomingDrag =
                  drag && draggedBlock && drag.dstDateIdx === i && drag.srcDateIdx !== i
                    ? { block: draggedBlock, dragTop: drag.topMin, durMin: drag.durMin }
                    : null;

                return (
                  <div
                    key={d.date}
                    className="week-col"
                    data-today={isTodayCol || undefined}
                    ref={(el) => {
                      colRefs.current[i] = el;
                    }}
                  >
                    {!past && (
                      <div
                        className="grid-catcher"
                        onPointerDown={(e) => onCatcherPointerDown(i, e)}
                        role="presentation"
                      />
                    )}

                    {visibleFreeSlots.map((s, idx) => {
                      const topMin = minutesFromDayStart(s.startUtc, dayStartUtc);
                      const height = s.minutes * PX_PER_MIN;
                      if (topMin === 0 && height >= GRID_HEIGHT - 1) return null;
                      return (
                        <div
                          key={`free-${idx}`}
                          className="freeslot"
                          style={{ top: topMin * PX_PER_MIN, height }}
                        >
                          {height >= 22 && (
                            <span className="freeslot-label">
                              {fmtHHMM(topMin)} · {fmtDuration(s.minutes)}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {blocks.map((b) => {
                      if (drag && drag.id === b.id && drag.srcDateIdx === i && drag.dstDateIdx !== i) {
                        return null;
                      }
                      const isDragging = drag?.id === b.id && drag.dstDateIdx === i;
                      const isResizing = isDragging && drag!.mode === "resize";
                      const topMin = isDragging
                        ? drag!.topMin
                        : minutesFromDayStart(b.startUtc, dayStartUtc);
                      const dur = isDragging ? drag!.durMin : durationMin(b);
                      const height = Math.max(dur * PX_PER_MIN, 22);
                      const movable = b.source === "kairos" && !past;
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
                        past ? "opacity-75" : "",
                      ]
                        .filter(Boolean)
                        .join(" ");

                      return (
                        <div
                          key={b.id}
                          className={cls}
                          style={{ top: topMin * PX_PER_MIN, height }}
                          onPointerDown={(e) => startDrag(e, b, i)}
                        >
                          {b.tags.length > 0 && !isEditing && <BlockTagDots tags={b.tags} />}
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
                            nowMin={isTodayCol ? nowMin : null}
                          />
                          {movable && !isEditing && (
                            <div
                              className="block-resize"
                              onPointerDown={(e) => startResize(e, b, i)}
                              role="separator"
                              aria-orientation="horizontal"
                              aria-label="Resize block duration"
                            />
                          )}
                        </div>
                      );
                    })}

                    {incomingDrag &&
                      (() => {
                        const b = incomingDrag.block;
                        const topMin = incomingDrag.dragTop;
                        const dur = incomingDrag.durMin;
                        const height = Math.max(dur * PX_PER_MIN, 22);
                        return (
                          <div
                            key={`incoming-${b.id}`}
                            className="block block-kairos block-dragging"
                            style={{ top: topMin * PX_PER_MIN, height }}
                          >
                            <div className="block-title">{b.title}</div>
                            <BlockTimeLine
                              startMin={topMin}
                              endMin={topMin + dur}
                              nowMin={null}
                            />
                          </div>
                        );
                      })()}

                    {composer && composer.dateIdx === i && (
                      <InlineComposer
                        date={d.date}
                        topMin={composer.topMin}
                        durMin={composer.durMin}
                        recentTags={recentTags}
                        onClose={() => setComposer(null)}
                        onSubmitted={() => setComposer(null)}
                      />
                    )}

                    {isTodayCol && nowMin !== null && nowMin >= 0 && nowMin <= DAY_MINUTES && (
                      <div className="now-line" style={{ top: nowMin * PX_PER_MIN }} />
                    )}
                  </div>
                );
              })}
            </div>

            {todayIdx >= 0 && nowMin !== null && nowMin >= 0 && nowMin <= DAY_MINUTES && (
              <div className="now-label" style={{ top: nowMin * PX_PER_MIN }}>
                {fmtHHMM(nowMin)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="status-line">
        <div className="status-line-left">
          <LabelFilter filterLabels={filterLabels} inViewLabels={inViewLabels} />
          <span className="status-line-sep" aria-hidden="true" />
          <StatusLeft
            nextFree={nextFree}
            days={days}
            todayIdx={todayIdx}
            hasComposer={composer !== null}
            onClaim={() => nextFree && setComposer(nextFree)}
          />
        </div>
        <StatusRight totalBlocks={totalBlocks} hasComposer={composer !== null} />
      </div>
    </div>
  );
}

function BlockTagDots({ tags }: { tags: string[] }) {
  const visible = tags.slice(0, 3);
  const overflow = Math.max(0, tags.length - visible.length);
  return (
    <div
      className="block-tag-dots"
      aria-label={`Labels: ${tags.map((t) => `#${t}`).join(", ")}`}
      title={tags.map((t) => `#${t}`).join(" ")}
    >
      {visible.map((t) => (
        <span key={t} className="block-tag-dot" aria-hidden="true" />
      ))}
      {overflow > 0 && (
        <span className="block-tag-dots-more num" aria-hidden="true">
          +{overflow}
        </span>
      )}
    </div>
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

function StatusLeft({
  nextFree,
  days,
  todayIdx,
  hasComposer,
  onClaim,
}: {
  nextFree: ComposerState;
  days: WeekDay[];
  todayIdx: number;
  hasComposer: boolean;
  onClaim: () => void;
}) {
  if (!nextFree) {
    return (
      <span className="num text-[10px] uppercase tracking-[0.18em] text-ink-faint">
        past · read-only
      </span>
    );
  }

  const dt = new Date(`${days[nextFree.dateIdx].date}T00:00:00.000Z`);
  const dateLabel = `${weekdayShortFmt.format(dt)} ${String(dt.getUTCDate()).padStart(2, "0")}`;
  const sameAsToday = nextFree.dateIdx === todayIdx;

  return (
    <button type="button" onClick={onClaim} aria-label="Add task in next free slot">
      <span className="free-mark" aria-hidden="true" />
      <span className="text-ink-muted">next free</span>
      <span className="num text-ink">
        {!sameAsToday && (
          <>
            <span className="text-ink-muted">{dateLabel}</span>
            <span className="text-ink-faint"> · </span>
          </>
        )}
        {fmtHHMM(nextFree.topMin)}
        <span className="text-ink-faint"> · </span>
        {fmtDuration(nextFree.durMin)}
      </span>
      {!hasComposer && <span className="num text-[10px] text-ink-faint">↵</span>}
    </button>
  );
}

function StatusRight({
  totalBlocks,
  hasComposer,
}: {
  totalBlocks: number;
  hasComposer: boolean;
}) {
  if (hasComposer) {
    return (
      <span className="num text-[10px] uppercase tracking-[0.18em] text-ink-faint">
        composing
      </span>
    );
  }
  return (
    <span className="num text-[10px] uppercase tracking-[0.18em] text-ink-faint">
      {totalBlocks} {totalBlocks === 1 ? "block" : "blocks"}
    </span>
  );
}
