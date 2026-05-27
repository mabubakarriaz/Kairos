"use client";

import type { FreeSlot } from "@/lib/types";
import { fmtDuration, fmtRange, fmtTime } from "@/lib/time";

export function FreeSlotsPanel({ slots }: { slots: FreeSlot[] }) {
  function prefill(slot: FreeSlot) {
    const startMs = new Date(slot.startUtc).getTime();
    // Suggest at most a one-hour block starting at the gap.
    const capEnd = Math.min(new Date(slot.endUtc).getTime(), startMs + 60 * 60_000);
    window.dispatchEvent(
      new CustomEvent("kairos:prefill", {
        detail: { start: fmtTime(slot.startUtc), end: new Date(capEnd).toISOString().slice(11, 16) },
      }),
    );
  }

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-free/[0.14] text-free-strong">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <h2 className="text-sm font-semibold text-ink">Best free slots</h2>
      </div>

      {slots.length === 0 ? (
        <p className="text-xs text-ink-muted">No open gaps today — the day is fully booked.</p>
      ) : (
        <ul className="space-y-2">
          {slots.map((s, i) => (
            <li key={`${s.startUtc}-${i}`}>
              <button type="button" className="freeslot-chip" onClick={() => prefill(s)}>
                <span className="font-semibold tabular-nums">{fmtRange(s.startUtc, s.endUtc)}</span>
                <span className="opacity-80">{fmtDuration(s.minutes)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-ink-faint">Click a slot to prefill the add-task form.</p>
    </div>
  );
}
