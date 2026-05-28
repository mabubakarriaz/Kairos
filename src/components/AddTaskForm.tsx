"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addTaskAction, type ActionResult } from "@/app/actions";

export function AddTaskForm({ date }: { date: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(addTaskAction, null);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Free-slot chips prefill the start/end times via a window event.
  useEffect(() => {
    function onPrefill(e: Event) {
      const detail = (e as CustomEvent<{ start?: string; end?: string }>).detail;
      if (detail?.start) setStartTime(detail.start);
      if (detail?.end) setEndTime(detail.end);
      titleRef.current?.focus();
    }
    window.addEventListener("kairos:prefill", onPrefill);
    return () => window.removeEventListener("kairos:prefill", onPrefill);
  }, []);

  // On success, clear the form and pull fresh server data.
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setStartTime("09:00");
      setEndTime("10:00");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="card space-y-4 p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/[0.12] text-accent-strong">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <h2 className="text-sm font-semibold text-ink">Add a task</h2>
      </div>

      <input type="hidden" name="date" value={date} />

      <div>
        <label className="label" htmlFor="title">Title</label>
        <input id="title" ref={titleRef} name="title" className="field w-full" required placeholder="e.g. Write the design doc" />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="label" htmlFor="startTime">Start</label>
          <input id="startTime" type="time" name="startTime" step={900} value={startTime} onChange={(e) => setStartTime(e.target.value)} className="field w-full" required />
        </div>
        <div className="flex-1">
          <label className="label" htmlFor="endTime">End</label>
          <input id="endTime" type="time" name="endTime" step={900} value={endTime} onChange={(e) => setEndTime(e.target.value)} className="field w-full" required />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="estimateMinutes">
          Estimate <span className="font-normal text-ink-faint">(min, optional)</span>
        </label>
        <input id="estimateMinutes" type="number" min={1} name="estimateMinutes" className="field w-full" placeholder="30" />
      </div>

      {state?.error && <p role="alert" className="text-xs text-now">{state.error}</p>}

      <button type="submit" className="btn w-full" disabled={pending}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {pending ? "Adding…" : "Add to schedule"}
      </button>
    </form>
  );
}
