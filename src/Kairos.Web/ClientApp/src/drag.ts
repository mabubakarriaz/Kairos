import Sortable from "sortablejs";

// The ONE bespoke JS island. SortableJS handles the drag visuals entirely client-side; htmx fires
// a SINGLE request on drop (onEnd) to persist + re-render. No per-pixel server round-trips.

const SNAP_MIN = 15;
const MINUTES_IN_DAY = 24 * 60;

// Offset of the pointer within the grabbed block, captured on pointerdown so the drop lands where
// the user expects rather than snapping the block's top to the cursor.
let grabOffsetY = 0;
document.addEventListener("pointerdown", (e) => {
  const block = (e.target as HTMLElement)?.closest<HTMLElement>(".block");
  if (block) grabOffsetY = e.clientY - block.getBoundingClientRect().top;
});

function pxPerMin(col: HTMLElement): number {
  const raw = getComputedStyle(col).getPropertyValue("--pxmin");
  return parseFloat(raw) || 1.6;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

const htmx = () => (window as unknown as { htmx: any }).htmx;

htmx().onLoad((root: HTMLElement) => {
  root.querySelectorAll<HTMLElement>(".sortable-day").forEach((col) => {
    if ((col as any)._sortable) return; // don't double-bind after swaps
    (col as any)._sortable = new Sortable(col, {
      animation: 120,
      draggable: ".block-kairos",   // gcal busy blocks are read-only
      ghostClass: "drag-ghost",
      onEnd: (evt) => {
        const item = evt.item;
        const durationMin = Number(item.dataset.durationMin ?? "30");
        const pointer = evt.originalEvent as PointerEvent;
        const rect = col.getBoundingClientRect();
        const topPx = pointer.clientY - rect.top - grabOffsetY;

        let startMin = Math.round(topPx / pxPerMin(col) / SNAP_MIN) * SNAP_MIN;
        startMin = clamp(startMin, 0, MINUTES_IN_DAY - durationMin);

        // Single POST on drop → server reschedules and returns the rebuilt column (+ oob panel).
        htmx().ajax("POST", `?handler=Reschedule`, {
          target: `#${col.id}`,
          swap: "outerHTML",
          values: {
            blockId: item.dataset.blockId,
            date: col.dataset.date,
            startMin,
            durationMin,
            tz: "UTC", // the v1 UI is UTC; the service layer supports real time zones
          },
        });
      },
    });
  });
});
