"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteBlockAction, editBlockAction, rescheduleAction } from "@/app/actions";
import {
  DAY_MINUTES,
  PX_PER_MIN,
  SLOT_MINUTES,
  blockTimeMeta,
  computeDayStats,
  fmtClock,
  fmtCountdown,
  fmtDuration,
  fmtHourLabel,
  minutesFromDayStart,
  snapMinutes,
} from "@/lib/time";
import { matchesLabelFilter } from "@/lib/labels";
import { setCheckpointsHiddenCookie } from "@/lib/prefs";
import type { Checkpoint, FreeSlot, ScheduledBlock } from "@/lib/types";
import { InlineComposer } from "./InlineComposer";
import { CheckpointEditor } from "./CheckpointEditor";
import { CheckpointToggle } from "./CheckpointToggle";
import { LabelFilter } from "./LabelFilter";
import { useBlockTooltip } from "./BlockTooltip";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

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
  checkpoints: Checkpoint[];
}

function checkpointTopMin(c: Checkpoint): number {
  const [hh, mm] = c.at.split(":").map(Number);
  return hh * 60 + mm;
}

interface Props {
  days: WeekDay[];
  /** YYYY-MM-DD for "today" in the active zone — passed in from the server. */
  today: string;
  filterLabels: string[];
  labelsQuery: string;
  checkpointsHidden: boolean;
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

type CheckpointEditState =
  | { mode: "new"; dateIdx: number; topMin: number }
  | { mode: "edit"; dateIdx: number; id: string; label: string; at: string; topMin: number }
  | null;

export function WeekColumns({
  days,
  today,
  filterLabels,
  checkpointsHidden,
  recentTags,
  view,
}: Props) {
  const router = useRouter();
  const tip = useBlockTooltip();
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
  const [cpEdit, setCpEdit] = useState<CheckpointEditState>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Keyboard move/resize — mirrors the day view; the column index travels with
  // the adjustment because each day is its own positioning context.
  const [keyAdjust, setKeyAdjust] = useState<
    { id: string; colIdx: number; mode: "move" | "resize"; topMin: number; durMin: number } | null
  >(null);
  const keyAdjustRef = useRef<typeof keyAdjust>(null);
  const keyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Pointer-down origin on a column's empty-grid catcher, tagged with the column
  // it began in, so a tap creates a block while a touch scroll (vertical) or a
  // cross-column drag does not.
  const catcherTap = useRef<{ x: number; y: number; col: number } | null>(null);

  useEffect(() => {
    if (todayIdx < 0) {
      setNowMin(null);
      return;
    }
    const dayStart = new Date(days[todayIdx].dayStartUtc).getTime();
    // Re-arm to the next minute boundary so the displayed HH:MM flips exactly on
    // the minute, and re-sync when the tab returns from the background. Mirrors
    // the day-view now-mark.
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      clearTimeout(timer);
      setNowMin((Date.now() - dayStart) / 60_000);
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
  }, [todayIdx, days]);

  // Center today's now-line in the viewport — driven by the "Today" control.
  const scrollToNowLine = useCallback(
    (behavior: ScrollBehavior): boolean => {
      const el = scrollRef.current;
      if (!el || todayIdx < 0) return false;
      const dayStartMs = new Date(days[todayIdx].dayStartUtc).getTime();
      const now = (Date.now() - dayStartMs) / 60_000;
      if (now < 0 || now > DAY_MINUTES) return false;
      const top = now * PX_PER_MIN - el.clientHeight / 2;
      el.scrollTo({ top: Math.max(0, top), behavior });
      return true;
    },
    [todayIdx, days],
  );

  // Only clear the one-shot flag if we actually scrolled — see the day-view note.
  useEffect(() => {
    const onGoto = () => {
      if (scrollToNowLine(prefersReducedMotion() ? "auto" : "smooth")) {
        try {
          sessionStorage.removeItem("kairos:goto-now");
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("kairos:goto-now", onGoto);
    return () => window.removeEventListener("kairos:goto-now", onGoto);
  }, [scrollToNowLine]);

  // Consume the one-shot "Today" flag: if set and today is in range, jump (instant)
  // to the now-line and clear it. Returns whether it owned this paint; leaves the
  // flag when today isn't in range so the incoming range can claim it.
  const consumeGotoNow = useCallback((): boolean => {
    let pending = false;
    try {
      pending = sessionStorage.getItem("kairos:goto-now") === "1";
    } catch {
      // ignore
    }
    if (!pending) return false;
    if (!scrollToNowLine("auto")) return false;
    try {
      sessionStorage.removeItem("kairos:goto-now");
    } catch {
      // ignore
    }
    return true;
  }, [scrollToNowLine]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (consumeGotoNow()) return;
    const viewport = el.clientHeight;

    let targetMin: number;
    if (todayIdx >= 0) {
      const dayStartMs = new Date(days[todayIdx].dayStartUtc).getTime();
      const synchronousNow = (Date.now() - dayStartMs) / 60_000;
      const todayBlocks = days[todayIdx].blocks;
      const dayStartUtc = days[todayIdx].dayStartUtc;
      const active = todayBlocks.find((b) => {
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
    // mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The displayed range changed in place (no remount), e.g. clicking "Today" from
  // another week. The mount effect won't re-run, so consume the flag here too. On
  // the initial mount this runs after the mount effect, which already cleared it.
  const leadDate = days[0]?.date;
  useEffect(() => {
    consumeGotoNow();
  }, [leadDate, consumeGotoNow]);

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
    catcherTap.current = { x: e.clientX, y: e.clientY, col: colIdx };
  }

  // Tap-to-create vs. scroll/drag: spawn only when the pointer stayed put between
  // down and up, in the same column it started in. Mouse clicks register zero
  // movement, so desktop click-to-create is unchanged.
  function onCatcherPointerUp(colIdx: number, e: React.PointerEvent) {
    const start = catcherTap.current;
    catcherTap.current = null;
    if (!start || start.col !== colIdx || isPastByCol[colIdx]) return;
    const col = colRefs.current[colIdx];
    if (!col) return;
    if (Math.abs(e.clientX - start.x) > 10 || Math.abs(e.clientY - start.y) > 10) return;
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
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setCpEdit(null);
        const target = pickComposerTarget();
        if (target) setComposer(target);
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        setComposer(null);
        // Pick today if in range; else the first non-past column.
        let colIdx = todayIdx;
        if (colIdx < 0) {
          colIdx = isPastByCol.findIndex((p) => !p);
          if (colIdx < 0) return;
        }
        // Placing a checkpoint while the layer is hidden would drop it out of
        // sight. Reveal the layer first so the new one — and the rest — show.
        if (checkpointsHidden) {
          setCheckpointsHiddenCookie(false);
          router.refresh();
        }
        const seed =
          colIdx === todayIdx && nowMin != null ? Math.max(0, nowMin) : 9 * 60;
        setCpEdit({ mode: "new", dateIdx: colIdx, topMin: snapMinutes(seed) });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickComposerTarget, todayIdx, nowMin, isPastByCol, checkpointsHidden, router]);

  const durationMin = (b: ScheduledBlock) =>
    (new Date(b.endUtc).getTime() - new Date(b.startUtc).getTime()) / 60_000;

  function startDrag(e: React.PointerEvent, block: ScheduledBlock, srcColIdx: number) {
    if (block.source !== "kairos" || pendingId || isPastByCol[srcColIdx]) return;
    if (editingId === block.id) return;
    e.preventDefault();
    setComposer(null);
    tip.hide();

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

    const teardown = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };

    // Interrupted gesture → abandon without committing so the block, and the
    // cross-column drop ghost, never get stuck.
    const onCancel = () => {
      teardown();
      setDrag(null);
    };

    const onUp = async () => {
      teardown();

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
    window.addEventListener("pointercancel", onCancel);
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
    tip.hide();

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

  async function commitKeyAdjust(block: ScheduledBlock, colIdx: number) {
    keyTimer.current = null;
    const adj = keyAdjustRef.current;
    if (!adj || adj.id !== block.id) return;
    const dayStartUtc = days[colIdx].dayStartUtc;
    const origTop = minutesFromDayStart(block.startUtc, dayStartUtc);
    const origDur = durationMin(block);
    if (adj.topMin === origTop && adj.durMin === origDur) {
      cancelKeyAdjust();
      return;
    }
    const dayStartMs = new Date(dayStartUtc).getTime();
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

  // Keyboard parity for the drag engine. Arrows move (±15m) and Shift+arrows
  // resize within the day; Enter/Space edits, Delete/Backspace removes, Escape
  // reverts. Cross-day moves stay a pointer affordance. Saves are debounced.
  function onBlockKeyDown(e: React.KeyboardEvent, block: ScheduledBlock, colIdx: number) {
    if (block.source !== "kairos" || isPastByCol[colIdx] || pendingId) return;
    if (editingId === block.id) return;
    tip.hide(); // a moving/edited block shouldn't keep a tooltip at a stale spot

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
    const dayStartUtc = days[colIdx].dayStartUtc;
    const base =
      keyAdjustRef.current?.id === block.id
        ? keyAdjustRef.current
        : {
            id: block.id,
            colIdx,
            mode: "move" as const,
            topMin: minutesFromDayStart(block.startUtc, dayStartUtc),
            durMin: durationMin(block),
          };
    const dir = e.key === "ArrowUp" ? -1 : 1;
    let next: typeof base;
    if (e.shiftKey) {
      const cap = maxDurAt(colIdx, base.topMin, block.id);
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
    keyTimer.current = setTimeout(() => void commitKeyAdjust(block, colIdx), 450);
  }

  useEffect(() => {
    return () => {
      if (keyTimer.current) clearTimeout(keyTimer.current);
    };
  }, []);

  const totalBlocks = days.reduce((n, d) => n + d.blocks.length, 0);
  const nextFree = pickComposerTarget();

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
        className="scroll-area min-h-0 flex-1 overflow-auto rounded-md border border-hairline bg-surface"
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
              const stats = computeDayStats(d.blocks, d.dayStartUtc);
              return (
                <div
                  key={d.date}
                  className="week-col-header"
                  data-today={isTodayCol || undefined}
                  data-past={isPastByCol[i] || undefined}
                >
                  <div className="week-col-header-row">
                    <span className="week-col-day">{weekdayShortFmt.format(dt)}</span>
                    <span className="week-col-date num">
                      {String(dt.getUTCDate()).padStart(2, "0")}
                    </span>
                  </div>
                  {stats.bookedMin > 0 ? (
                    <span className="week-col-stat-block num">
                      <span className="week-col-stat">
                        {fmtDuration(stats.bookedMin)} booked
                      </span>
                      {!isPastByCol[i] && (
                        <span className="week-col-stat week-col-stat-open">
                          {fmtDuration(stats.openMin)} open
                        </span>
                      )}
                    </span>
                  ) : isPastByCol[i] ? (
                    <span className="week-col-stat week-col-stat-empty" aria-hidden="true">
                      ·
                    </span>
                  ) : (
                    <span className="week-col-stat-block num">
                      <span className="week-col-stat week-col-stat-empty" aria-hidden="true">
                        ·
                      </span>
                      <span className="week-col-stat week-col-stat-open">
                        {fmtDuration(stats.openMin)} open
                      </span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="week-canvas" style={{ height: GRID_HEIGHT }}>
            {HOURS.map((h) => (
              <div key={h} className="hour-label" style={{ top: h * HOUR_PX }}>
                {fmtHourLabel(h)}
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
                        onPointerUp={(e) => onCatcherPointerUp(i, e)}
                        role="presentation"
                      />
                    )}

                    {/* Checkpoints — editable in week view too. Tag shows the time;
                        click opens the inline editor on this column. Past days are
                        display-only (data-past + disabled). */}
                    {d.checkpoints.map((cp) => {
                      if (
                        cpEdit?.mode === "edit" &&
                        cpEdit.dateIdx === i &&
                        cpEdit.id === cp.id
                      ) {
                        return null;
                      }
                      const cpTop = checkpointTopMin(cp);
                      const cpClock = fmtClock(cpTop);
                      return (
                        <div
                          key={cp.id}
                          className="checkpoint"
                          data-past={past || undefined}
                          style={{ top: cpTop * PX_PER_MIN }}
                          title={`${cp.label} · ${cpClock}`}
                        >
                          <button
                            type="button"
                            className="checkpoint-tag"
                            onClick={() => {
                              if (past) return;
                              setComposer(null);
                              setCpEdit({
                                mode: "edit",
                                dateIdx: i,
                                id: cp.id,
                                label: cp.label,
                                at: cp.at,
                                topMin: cpTop,
                              });
                            }}
                            aria-label={`Edit checkpoint ${cp.label} at ${cpClock}`}
                            disabled={past}
                          >
                            <span className="checkpoint-tag-time num">{cpClock}</span>
                          </button>
                        </div>
                      );
                    })}

                    {/* Checkpoint editor — new or edit — lives inside this column. */}
                    {cpEdit && cpEdit.dateIdx === i && cpEdit.mode === "new" && (
                      <CheckpointEditor
                        mode="new"
                        date={d.date}
                        topMin={cpEdit.topMin}
                        onClose={() => setCpEdit(null)}
                        onCommitted={() => setCpEdit(null)}
                      />
                    )}
                    {cpEdit && cpEdit.dateIdx === i && cpEdit.mode === "edit" && (
                      <CheckpointEditor
                        mode="edit"
                        date={d.date}
                        id={cpEdit.id}
                        label={cpEdit.label}
                        at={cpEdit.at}
                        topMin={cpEdit.topMin}
                        onClose={() => setCpEdit(null)}
                        onCommitted={() => setCpEdit(null)}
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
                              {fmtClock(topMin)} · {fmtDuration(s.minutes)}
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
                      const isKeyAdjusting =
                        !isDragging && keyAdjust?.id === b.id && keyAdjust.colIdx === i;
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
                      const movable = b.source === "kairos" && !past;
                      const isGcal = b.source === "gcal";
                      const isEditing = editingId === b.id;
                      const filteredOut = !matchesLabelFilter(b.tags, filterLabels);
                      const isActive =
                        !isGcal &&
                        isTodayCol &&
                        nowMin != null &&
                        nowMin >= topMin &&
                        nowMin < topMin + dur;

                      const cls = [
                        "block",
                        movable ? "block-kairos" : "",
                        isGcal ? "block-gcal" : "",
                        isDragging && !isResizing ? "block-dragging" : "",
                        isResizing ? "block-resizing" : "",
                        isEditing ? "block-editing" : "",
                        pendingId === b.id ? "block-pending" : "",
                        filteredOut ? "block-filtered-out" : "",
                        isActive ? "block-active" : "",
                        past ? "opacity-75" : "",
                      ]
                        .filter(Boolean)
                        .join(" ");

                      const tipHandlers =
                        !isEditing && !drag
                          ? tip.anchorProps({
                              block: b,
                              startMin: topMin,
                              endMin: topMin + dur,
                              nowMin: isTodayCol ? nowMin : null,
                            })
                          : undefined;

                      return (
                        <div
                          key={b.id}
                          className={cls}
                          style={{ top: topMin * PX_PER_MIN, height }}
                          {...tipHandlers}
                          onPointerDown={(e) => startDrag(e, b, i)}
                          onKeyDown={movable ? (e) => onBlockKeyDown(e, b, i) : undefined}
                          tabIndex={movable ? 0 : undefined}
                          aria-label={
                            movable
                              ? `${b.title || "Untitled"}, ${fmtClock(topMin)} to ${fmtClock(topMin + dur)}`
                              : isGcal
                                ? `${b.title || "Busy"}, ${fmtClock(topMin)} to ${fmtClock(topMin + dur)}, from calendar (read-only)`
                                : undefined
                          }
                          aria-keyshortcuts={
                            movable ? "ArrowUp ArrowDown Shift+ArrowUp Enter Delete" : undefined
                          }
                        >
                          {isGcal && (
                            <span className="block-gcal-glyph" aria-hidden="true">
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4.5" width="18" height="16" rx="2" />
                                <path d="M3 9h18M8 2.5v4M16 2.5v4" />
                              </svg>
                            </span>
                          )}
                          {isActive && !isEditing && (
                            <span className="block-now-glyph" aria-label="Now">
                              now
                            </span>
                          )}
                          {!isGcal && b.tags.length > 0 && !isEditing && !isActive && (
                            <BlockTagDots tags={b.tags} />
                          )}
                          {movable && !isEditing && confirmDeleteId !== b.id && (
                            <button
                              type="button"
                              className="block-del"
                              aria-label={
                                b.seriesId ? "Remove block (recurring)" : "Remove block"
                              }
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
                              onCommit={(nt, nl) => commitEdit(b, nt, nl)}
                              onCancel={() => setEditingId(null)}
                            />
                          ) : (
                            <div className="block-title">{b.title}</div>
                          )}
                          {!isEditing && (
                            <BlockTimeLine
                              startMin={topMin}
                              endMin={topMin + dur}
                              nowMin={isTodayCol ? nowMin : null}
                            />
                          )}
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

                    {/* Now-mark — scoped to today's column so the hairline lives
                        inside today's vertical lane, not stretched across the
                        whole week (which would imply now is everywhere at once). */}
                    {isTodayCol && nowMin !== null && nowMin >= 0 && nowMin <= DAY_MINUTES && (
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
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {tip.tooltipNode}

      <div className="status-line">
        <div className="status-line-left">
          <LabelFilter filterLabels={filterLabels} inViewLabels={inViewLabels} />
          <span className="status-line-sep" aria-hidden="true" />
          <CheckpointToggle hidden={checkpointsHidden} />
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

function SeriesDeleteConfirm({
  onJustThis,
  onFuture,
  onCancel,
}: {
  onJustThis: () => void;
  onFuture: () => void;
  onCancel: () => void;
}) {
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

function BlockTagDots({ tags }: { tags: string[] }) {
  const visible = tags.slice(0, 3);
  const overflow = Math.max(0, tags.length - visible.length);
  return (
    <div
      className="block-tag-dots"
      aria-label={`Labels: ${tags.map((t) => `#${t}`).join(", ")}`}
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
        {fmtClock(nextFree.topMin)}
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
    <span className="status-hints num">
      <span className="status-hint">
        <kbd>n</kbd>task
      </span>
      <span className="status-hint">
        <kbd>c</kbd>mark
      </span>
      <span className="status-line-sep" aria-hidden="true" />
      <span>
        {totalBlocks} {totalBlocks === 1 ? "block" : "blocks"}
      </span>
    </span>
  );
}
