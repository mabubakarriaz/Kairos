---
name: ui-redesign-direction
description: Kairos's current UI design language — amber/graphite, single canvas, click-to-create, mono numerals (Next.js/Tailwind)
type: project
---

Kairos's UI was **rebuilt from scratch on 2026-05-28** after the user rejected the previous Notion-Calendar-flavored design as generic SaaS-template. The redesign was shaped via `/impeccable shape`. The strategic positioning lives in [PRODUCT.md](../../PRODUCT.md) at the repo root; the visual system lives in `src/app/globals.css` and the new component set.

**What changed and stayed:**
- **Composition.** The old two-pane layout (top `AddTaskForm` + right `FreeSlotsPanel` + main `DayColumn`) collapsed into a **single canvas**. Both side components are deleted from the repo. Free slots live inline as 1px dashed top hairlines + tiny mono timestamps inside the grid, plus a single bottom status line: `next free 14:00 · 90m ↵`.
- **Adding tasks.** Click any empty time in the grid → an inline composer appears at that slot. Press `n` to focus a composer pre-positioned at the next free slot. The composer is `src/components/InlineComposer.tsx`; it posts directly to `addTaskAction`.
- **Drag-to-reschedule** is preserved as bespoke zero-dep pointer events in `DayColumn.tsx` (snap to 15min, calls `rescheduleAction`).

**Visual system:**
- **Palette is amber + graphite, never blue + emerald.** `--accent` is a deep low-chroma amber/ochre (oklch ~0.62 0.10 70 in light, ~0.74 0.13 75 in dark). `--free` is a cool low-chroma graphite (refused: emerald). `--now` is a desaturated red-ochre. Blocks have a dedicated `--block` solid-fill token; **no side-stripe borders** anywhere (banned pattern).
- **Type carries the weight color used to.** UI text is **Inter** via `next/font/google`; all numerals (hours, times, durations, dates, kbd hints) ride on **JetBrains Mono** + `tabular-nums` via a `.num` / `time` / `.block-time` / `.hour-label` selector. The mono-numeral choice is what gives the app its Soulver/Raycast tell.
- **Both themes are first-class.** Light scene = "morning at a wood desk, late-spring light, paper feel"; dark scene = "11:30pm planning, dim room, candle warmth." Neither is tint-inverted. Tokens live as space-separated RGB triplets in `src/app/globals.css` (`:root` + `.dark`); Tailwind colors resolve via `rgb(var(--x) / <alpha-value>)`. `ThemeToggle.tsx` cycles **light → dark → system** as a fixed top-right corner glyph, persisting only explicit choices to `localStorage.kairos-theme`.
- **No app header bar.** Page chrome is gone. Layout is `mx-auto max-w-3xl` with `DateToolbar` (weekday large, date faint, prev/today/next as `.glyph-btn`s) at top and the day grid below. Theme glyph floats in the viewport's top-right corner.

**How to apply:**
- Stay in Next.js + React + Tailwind v3 (per [CLAUDE.md](../../CLAUDE.md)).
- Reuse the component classes in `globals.css` (`.block`, `.freeslot`, `.composer`, `.status-line`, `.now-line`, `.glyph-btn`, `.empty-line`, `.hour-label`, `.grid-catcher`) rather than inventing parallel styles. Same for utilities: `bg-canvas`, `bg-surface`, `text-ink`, `text-ink-muted`, `text-ink-faint`, `accent`, `block`, `free`, `now`, `border-hairline`, `ease-snap`.
- Any rendered time, duration, count, or date goes inside an element with `.num` (or `time`, `.tabular`, `.block-time`, `.hour-label`) so the JetBrains-Mono-tabular-nums treatment applies.
- Motion: ease-out-quart (`ease-snap` / `cubic-bezier(0.22, 1, 0.36, 1)`). No bounce, no elastic, never animate layout properties. Reduced-motion is wired globally in `globals.css`.
- The `kairos:prefill` window event from the old free-slots panel is **gone** with that panel. Seeding the composer programmatically is internal to `DayColumn.tsx` via `pickComposerTarget`.
- Keyboard model: `n` opens the composer at the next free slot; Esc closes it; drag with pointer.

**Deferred for a future pass (craft moves, not blockers):** ⌘K-style quick-add palette, an inline undo for delete (brief specified it; currently delete is immediate-and-final), shortcuts cheatsheet, arrow-key block nudging without drag.
