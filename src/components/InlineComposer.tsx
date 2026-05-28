"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addTaskAction } from "@/app/actions";
import { PX_PER_MIN, fmtDuration, fmtHHMM } from "@/lib/time";
import { parseLabelsInput } from "@/lib/labels";

interface Props {
  date: string;
  topMin: number;
  durMin: number;
  recentTags: string[];
  onClose: () => void;
  onSubmitted: () => void;
}

export function parseHHMM(input: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

const MIN_HEIGHT = 86;

export function InlineComposer({ date, topMin, durMin, recentTags, onClose, onSubmitted }: Props) {
  const titleRef = useRef<HTMLInputElement>(null);
  const labelsRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(() => fmtHHMM(topMin));
  const [end, setEnd] = useState(() => fmtHHMM(topMin + durMin));
  const [labelsInput, setLabelsInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Reposition (e.g. user re-clicked the grid). Preserve the title they're typing.
  useEffect(() => {
    setStart(fmtHHMM(topMin));
    setEnd(fmtHHMM(topMin + durMin));
  }, [topMin, durMin]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    setError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Need a title.");
      titleRef.current?.focus();
      return;
    }
    const sMin = parseHHMM(start);
    const eMin = parseHHMM(end);
    if (sMin == null || eMin == null) {
      setError("Use HH:MM.");
      return;
    }
    if (eMin <= sMin) {
      setError("End must be after start.");
      return;
    }

    setPending(true);
    const labels = parseLabelsInput(labelsInput);
    const fd = new FormData();
    fd.set("title", trimmed);
    fd.set("date", date);
    fd.set("startTime", start);
    fd.set("endTime", end);
    fd.set("labels", labels.join(","));
    const res = await addTaskAction(null, fd);
    setPending(false);

    if (!res.ok) {
      setError(res.error ?? "Couldn't add.");
      return;
    }
    onSubmitted();
    router.refresh();
  }

  function appendLabel(tag: string) {
    const current = parseLabelsInput(labelsInput);
    if (current.includes(tag)) return;
    const next = [...current, tag].join(", ");
    setLabelsInput(next);
    labelsRef.current?.focus();
  }

  const sMin = parseHHMM(start) ?? topMin;
  const eMin = parseHHMM(end) ?? topMin + durMin;
  const previewDur = Math.max(15, eMin - sMin);
  const activeTags = parseLabelsInput(labelsInput);
  const suggestable = recentTags.filter((t) => !activeTags.includes(t)).slice(0, 6);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="composer"
      style={{
        top: topMin * PX_PER_MIN,
        height: Math.max(previewDur * PX_PER_MIN, MIN_HEIGHT),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="composer-row">
        <input
          ref={titleRef}
          className="composer-title"
          placeholder="What are you doing?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          spellCheck={false}
          disabled={pending}
          maxLength={140}
        />
        <input
          className="composer-time-input text-right"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          onBlur={() => {
            const v = parseHHMM(start);
            if (v != null) setStart(fmtHHMM(v));
          }}
          aria-label="Start time"
          disabled={pending}
        />
        <span className="num text-[11px] text-ink-faint" aria-hidden="true">–</span>
        <input
          className="composer-time-input"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          onBlur={() => {
            const v = parseHHMM(end);
            if (v != null) setEnd(fmtHHMM(v));
          }}
          aria-label="End time"
          disabled={pending}
        />
      </div>
      <div className="composer-labels-row">
        <span className="composer-labels-sigil num" aria-hidden="true">#</span>
        <input
          ref={labelsRef}
          className="composer-labels"
          placeholder="labels (optional)"
          value={labelsInput}
          onChange={(e) => setLabelsInput(e.target.value)}
          spellCheck={false}
          disabled={pending}
          aria-label="Labels"
          maxLength={140}
        />
        {suggestable.length > 0 && (
          <div className="composer-recent" role="group" aria-label="Recent labels">
            {suggestable.map((t) => (
              <button
                key={t}
                type="button"
                className="composer-recent-pill num"
                onMouseDown={(e) => {
                  // Don't blur the labels input so the row stays visible.
                  e.preventDefault();
                  appendLabel(t);
                }}
                disabled={pending}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="composer-meta">
        {error ? (
          <span className="composer-error" role="alert">{error}</span>
        ) : (
          <>
            <span>{fmtDuration(previewDur)}</span>
            <span aria-hidden="true">·</span>
            <span>{pending ? "saving…" : "enter to add · esc to cancel"}</span>
          </>
        )}
      </div>
      {/* Hidden submit lets Enter on any input commit the form. */}
      <button type="submit" className="sr-only" disabled={pending} tabIndex={-1}>
        Add
      </button>
    </form>
  );
}
