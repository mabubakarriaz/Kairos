"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addCheckpointAction,
  deleteCheckpointAction,
  updateCheckpointAction,
} from "@/app/actions";
import { PX_PER_MIN, fmtHHMM } from "@/lib/time";
import { parseHHMM } from "./InlineComposer";

interface BaseProps {
  date: string;
  topMin: number;
  onClose: () => void;
  onCommitted: () => void;
}

interface NewProps extends BaseProps {
  mode: "new";
}

interface EditProps extends BaseProps {
  mode: "edit";
  id: string;
  label: string;
  at: string; // "HH:MM"
}

type Props = NewProps | EditProps;

/**
 * Inline editor for checkpoints — used for both creating and editing. A single
 * horizontal row that overlays the line at its y position, matching the
 * composer's accent-ring "focused edit zone" vocabulary but compressed because
 * a checkpoint has no duration. Enter commits; Escape cancels.
 */
export function CheckpointEditor(props: Props) {
  const labelRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState(props.mode === "edit" ? props.label : "");
  const [time, setTime] = useState(() =>
    props.mode === "edit" ? props.at : fmtHHMM(props.topMin),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    labelRef.current?.focus();
    labelRef.current?.select();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        props.onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  async function commit() {
    setError(null);
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Need a label.");
      labelRef.current?.focus();
      return;
    }
    if (parseHHMM(time) == null) {
      setError("Use HH:MM.");
      return;
    }

    setPending(true);
    const res =
      props.mode === "new"
        ? await addCheckpointAction({ label: trimmed, at: time, date: props.date })
        : await updateCheckpointAction({
            id: props.id,
            label: trimmed,
            at: time,
            date: props.date,
          });
    setPending(false);

    if (!res.ok) {
      setError(res.error ?? "Couldn't save.");
      return;
    }
    props.onCommitted();
    router.refresh();
  }

  async function remove() {
    if (props.mode !== "edit") return;
    setPending(true);
    const res = await deleteCheckpointAction({ id: props.id, date: props.date });
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't delete.");
      return;
    }
    props.onCommitted();
    router.refresh();
  }

  const verb = props.mode === "new" ? "add" : "save";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void commit();
      }}
      className="checkpoint-editor"
      style={{ top: props.topMin * PX_PER_MIN }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        ref={labelRef}
        className="checkpoint-editor-label"
        placeholder={props.mode === "new" ? "checkpoint label" : "label"}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        spellCheck={false}
        disabled={pending}
        maxLength={60}
        aria-label="Checkpoint label"
      />
      <input
        className="checkpoint-editor-time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        onBlur={() => {
          const v = parseHHMM(time);
          if (v != null) setTime(fmtHHMM(v));
        }}
        aria-label="Checkpoint time"
        disabled={pending}
      />
      {error ? (
        <span className="checkpoint-editor-meta checkpoint-editor-error" role="alert">
          {error}
        </span>
      ) : (
        <span className="checkpoint-editor-meta" aria-hidden="true">
          {pending ? "saving" : `↵ ${verb}`}
        </span>
      )}
      {props.mode === "edit" && (
        <button
          type="button"
          onClick={() => void remove()}
          className="checkpoint-editor-meta"
          style={{ cursor: "pointer", padding: 0 }}
          aria-label="Remove checkpoint from this date forward"
          disabled={pending}
        >
          remove
        </button>
      )}
      <button type="submit" className="sr-only" tabIndex={-1} disabled={pending}>
        {verb}
      </button>
    </form>
  );
}
