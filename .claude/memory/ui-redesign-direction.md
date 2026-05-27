---
name: ui-redesign-direction
description: Schedule UI design language — light/dark CSS-variable tokens + deferred UX upgrades (Next.js/Tailwind)
type: project
---

Kairos's schedule UI targets a **best-in-class scheduling-app look** (Notion-Calendar / Cron caliber). The chosen design language survived the 2026-05-27 stack rebuild (see [stack migration](stack-migration-2026-05-27.md)) and lives in the Next.js app:

- **A CSS-variable design-token system, two themes.** Tokens (`--bg`, `--surface`, `--accent`, `--free`, `--now`, grid lines, etc.) are defined as space-separated RGB triplets in `src/app/globals.css` (`:root` + `.dark`); `tailwind.config.ts` colors resolve to them via `rgb(var(--x) / <alpha-value>)`. Re-theme the whole app by toggling `.dark` on `<html>`.
- **Theme toggle** is `src/components/ThemeToggle.tsx` (writes `localStorage["kairos-theme"]`); a flash-free inline init script in `src/app/layout.tsx` `<head>` applies the class before paint and respects `prefers-color-scheme`.
- **Blocks** use tinted-fill + saturated left-rail + colored text (`.block` / `.block-kairos`). **Free slots** show as dashed green ghosts in the grid and as clickable chips in the side panel (`.freeslot-chip`) that prefill the add-task form via a `kairos:prefill` window event.

**How to apply:** stay in **Next.js + React + Tailwind** (single Next app per CLAUDE.md). Reuse the token-backed utility classes (`bg-canvas`, `bg-surface`, `text-ink`, `text-ink-muted`, `accent`, `free`, `shadow-card`, `ease-snap`, …) and the component classes in `globals.css` rather than hardcoded slate/blue utilities. The drag-to-reschedule island (`DayColumn.tsx`) is **bespoke zero-dep pointer events** — no SortableJS/dnd-kit.

**Deferred UX upgrades** (good candidates for a next pass): a ⌘K command palette / quick-add, a keyboard-shortcuts cheatsheet, auto-scroll-to-now on load, and richer drag/drop motion.
