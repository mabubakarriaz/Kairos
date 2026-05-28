---
name: Kairos
description: A time-blocked todo app on a single canvas. Quiet, precise, opinionated.
colors:
  canvas: "#faf8f4"
  surface: "#fefdfa"
  raised: "#f4f1eb"
  hairline: "#e6e1d6"
  hairline-strong: "#cfc8b8"
  ink: "#1f1b14"
  ink-muted: "#5c5346"
  ink-faint: "#796e5f"
  accent: "#b07a35"
  accent-strong: "#8a5b1e"
  accent-fg: "#fbf7ee"
  block: "#f4e2bb"
  block-strong: "#ebd19e"
  free: "#6f7989"
  free-strong: "#4d5664"
  now: "#c0543a"
  grid-line: "#e8e0ce"
  shadow-ink: "#18120c"
  canvas-dark: "#14110d"
  surface-dark: "#1c1814"
  raised-dark: "#29231c"
  hairline-dark: "#2f2a23"
  hairline-strong-dark: "#494034"
  ink-dark: "#ece4d2"
  ink-muted-dark: "#b2a690"
  ink-faint-dark: "#827867"
  accent-dark: "#d9a455"
  accent-strong-dark: "#eab76a"
  block-dark: "#382c1b"
  block-strong-dark: "#4c3c24"
  free-dark: "#8a93a2"
  free-strong-dark: "#afb7c4"
  now-dark: "#db7250"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.12em"
  numerals:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Consolas, monospace"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.02em"
    fontFeature: "tnum, ss01"
rounded:
  none: "0px"
  xs: "2px"
  sm: "6px"
  pill: "9999px"
spacing:
  hairline: "1px"
  xs: "2px"
  sm: "6px"
  md: "12px"
  lg: "24px"
  hour: "96px"
  slot: "24px"
components:
  block:
    backgroundColor: "{colors.block}"
    textColor: "{colors.accent-strong}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
    typography: "{typography.title}"
  block-hover:
    backgroundColor: "{colors.block-strong}"
  block-dragging:
    backgroundColor: "{colors.block-strong}"
  composer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
    typography: "{typography.title}"
  glyph-btn:
    backgroundColor: "transparent"
    textColor: "{colors.ink-faint}"
    rounded: "{rounded.sm}"
    height: "28px"
    width: "28px"
  glyph-btn-hover:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  tz-chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-faint}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "28px"
    typography: "{typography.label}"
  hour-label:
    backgroundColor: "transparent"
    textColor: "{colors.ink-faint}"
    typography: "{typography.numerals}"
---

# Design System: Kairos

## 1. Overview

**Creative North Star: "The Wood Desk"**

Kairos is the single object on a writer's desk: a paper day-sheet ruled in faint hour lines, with hand-laid blocks of ochre marking the work, a graphite whisper for what's free, and a single red-ochre mark for now. The whole interface is composed as one canvas, not a SaaS surface. There is no header bar, no sidebar, no nav rail. The day grid is the hero; date label, status line, and corner controls are staff serving it. Personality lives in micro-detail: how a block lifts under the pointer, how a free slot reveals itself as a dashed hairline, how every numeral is set in tabular mono so times line up like a printed timetable.

The system commits to two first-class scenes rather than treating dark as a tint-inverted afterthought. **Light** is morning at a wood desk, late-spring light, paper feel: warm near-white surfaces with deep amber blocks and graphite-cool free slots. **Dark** is 11:30pm planning in a dim room with candle warmth: warm near-black surfaces with brighter ochre blocks and slightly cooler graphite. Neither scene apologizes for its temperature. Both refuse blue.

Color is a scalpel, not a paintbrush. The system uses tinted neutrals plus one accent (ochre amber) under a roughly Restrained strategy, exceeded only inside the time block itself, which is the only surface that wears a saturated wash. Type and position carry the rest.

**Key Characteristics:**
- **Single-canvas composition.** No side panels, no chrome around the grid.
- **Two first-class themes.** Light and dark are scene-composed, not inverted.
- **Amber + graphite + red-ochre.** Three named chromatic roles. Never blue, never emerald.
- **Mono numerals everywhere.** Every time, duration, hour, and date rides JetBrains Mono with tabular-nums.
- **Quiet on rest, expressive on touch.** Static views feel typographic. Personality lives in interaction.
- **No cards.** Time blocks are filled rectangles; the canvas itself is the container.
- **Hairlines for grid and free slots.** 1px lines do the structural work; no boxes, no shadows at rest.

## 2. Colors: The Amber and Graphite Palette

A two-pole palette with one alarm. Amber/ochre is the work being done (accent, block fills, dragging). Graphite is what is not yet committed (free slots, faint type). Red-ochre is what is happening right now. Everything else is warm paper or warm near-black.

### Primary

- **Deep Ochre** (`#b07a35`, oklch ~0.62 0.10 70): the single accent. Used on focus rings, the composer outline, free-slot label accents, and small accent washes (today-column tint in week view at ~6% opacity). Carries the brand's chromatic identity at low surface coverage.
- **Burnt Ochre** (`#8a5b1e`): the deeper sibling. The block's text color. Reads as warm graphite at small sizes; carries the type weight inside the wash.

### Secondary

- **Amber Wash** (`#f4e2bb`): the time block's resting fill. A washed amber that reads as warm paper-with-ink-soaked-in, not as a colored chip. The signature surface of the entire app.
- **Amber Wash Strong** (`#ebd19e`): the block's hover and drag state. Same hue, more saturation. The lift is chromatic, not shadowed.

### Tertiary

- **Graphite Mist** (`#6f7989`): the cool low-chroma blue-grey used exclusively for free-slot signage. Chosen over emerald (which would be the reflexive "available" color in any other tool) because emerald insists on attention; graphite recedes.
- **Graphite Strong** (`#4d5664`): the free-slot label color. Slightly cooler than the surrounding warm neutrals so the eye registers it as a different category of mark.
- **Ember** (`#c0543a`): a desaturated red-ochre used in exactly two places: the now-line hairline + gutter dot, and the "X left" tail on blocks the now-line is currently crossing. Used once per screen, never as a UI accent.

### Neutral

- **Paper** (`#faf8f4`): the canvas. Warm near-white, faintly amber-tinted (chroma ~0.005). Never `#fff`.
- **Page** (`#fefdfa`): elevated surface for composer and sticky week-view headers. One step warmer-and-brighter than canvas.
- **Page Fold** (`#f4f1eb`): the raised surface used on glyph-button hover. The faintest possible chromatic shift from canvas.
- **Walnut Ink** (`#1f1b14`): primary text. Warm near-black, never `#000`.
- **Walnut Muted** (`#5c5346`): muted text. Date subtitle, status line text.
- **Walnut Faint** (`#796e5f`): faint text. Hour labels, secondary labels, tz chip default state.
- **Hairline** (`#e6e1d6`): the standard 1px border. All structural lines.
- **Hairline Strong** (`#cfc8b8`): kbd borders and scroll thumbs.
- **Hour Rule** (`#e8e0ce`): the hairline color used specifically for the day grid's hourly lines. Slightly warmer than the standard hairline so the grid feels like a ruled page, not a UI.

### Dark Scene Pairs

Each role has a dark-scene equivalent, also warm-tinted. Notable shifts: **Deep Ochre** brightens to `#d9a455` and **Burnt Ochre** to `#eab76a` so the block text reads against dark amber fill; **Amber Wash** darkens to `#382c1b` (warm near-black with amber in the chroma); **Graphite Mist** cools to `#8a93a2` and brightens for legibility; **Ember** holds its red-ochre at `#db7250`. The dark scene is composed, not generated.

### Named Rules

**The Ochre-or-Nothing Rule.** The single chromatic accent on any chrome (date, controls, focus, ring, link) is Deep Ochre or Burnt Ochre. Never blue, never emerald, never violet. If a surface needs to feel "active" or "available", use type weight, position, or hairline density. The block is the only surface allowed to wear a saturated wash.

**The Graphite-Not-Emerald Rule.** Free slots and "available time" signage are graphite, never green. Green is the reflexive choice; refusing it is the point. Graphite recedes, which is what a free slot is: an absence of work, not a celebration.

**The One Ember Rule.** Red-ochre `#c0543a` is used twice maximum per screen: once on the now-line, optionally once on the "X left" tail. Never on errors, never on delete, never on warnings. A second Ember mark on screen dilutes the meaning of the first.

**The Warm-Neutral Rule.** Every neutral is tinted toward warm (chroma ~0.005). `#000` and `#fff` are forbidden. Slate, cool grey, and "Tailwind zinc" are forbidden. The palette's temperature is the brand.

## 3. Typography

**Display & Body Font:** Inter (with `ui-sans-serif`, `system-ui`, fallback).
**Numeral Font:** JetBrains Mono (with `ui-monospace`, `SF Mono`, `Consolas`, fallback).

**Character:** Inter for prose, JetBrains Mono for every numeral on the page. The mono-numeral choice is the system's tell, the Soulver/Raycast move: when every hour, time, duration, and date is set in tabular mono, the schedule reads like a printed timetable rather than a UI. Type carries the hierarchy that color would have carried in a less disciplined system.

### Hierarchy

- **Display** (weight 600, 1.875rem / 30px, line-height 1, tracking -0.02em): the date heading at the top of the day view. Sets the page like a magazine masthead. Used once per page.
- **Title** (weight 600, 0.8125rem / 13px, line-height 1.25, tracking -0.005em): the block title inside a time block. Reads as confident inline label rather than card heading. In week view this drops to 12px to fit narrower columns.
- **Body** (weight 400, 0.875rem / 14px): standard prose used in date subtitle, status line, and any inline help. Capped at 65-75ch in any long-form copy (this is enforced by layout, not by media query).
- **Label** (weight 500, 0.6875rem / 11px, tracking 0.12em, uppercase): the weekday strip in week view, tz chip text. The only place uppercase + wide-tracking is used.
- **Numerals** (weight 500, 0.625rem / 10px, tracking 0.02em, `tnum` + `ss01`): hour labels in the left gutter, free-slot timestamps, block-time row, now-line label, the date numeral in week view headers. **Every numeral on the page rides this style** via the `.num`, `time`, `.block-time`, and `.hour-label` selectors. `font-variant-numeric: tabular-nums` is non-negotiable so columns of times align.

### Named Rules

**The Tabular-Numeral Rule.** Any numeral that names a quantity of time (hours, minutes, durations, dates, counts) is set in JetBrains Mono with tabular-nums. Every such element carries `.num` or `time` or `.block-time` or `.hour-label`. Inter is forbidden for numerals. This rule is what makes Kairos feel like Soulver and not like Notion.

**The Tight-Track Rule.** Display and title type are tracked tighter than the Inter default (-0.02em for display, -0.005em for title). Labels and numerals are tracked looser (+0.02 to +0.12em). Never flat-track everything; the contrast in tracking is part of the hierarchy.

**The Single-Display Rule.** Only one element on screen sets in Display size: the date. Headlines do not stack. If a second display-size element appears, demote one. There is no h2-display-on-display escalation.

## 4. Elevation

**Flat by default. Lift only on touch.** At rest, every surface (canvas, blocks, free-slot lines, hour labels, status line) sits on a single visual plane. Depth is conveyed by warmth contrast between canvas and surface, and by hairline borders, not by shadow. The composer carries the only resting shadow, and it is intentionally soft and warm rather than blue-black.

### Shadow Vocabulary

- **Composer Lift** (`box-shadow: 0 0 0 1px rgb(var(--accent) / 0.55), 0 10px 28px -8px rgb(var(--shadow) / 0.25)`): the inline composer's resting elevation. An accent ring at 55% opacity outlines the active edit zone; a soft warm shadow gives it a paper-on-paper lift.
- **Drag Lift** (`box-shadow: 0 1px 0 rgb(var(--shadow) / 0.05), 0 12px 24px -8px rgb(var(--shadow) / 0.30), 0 0 0 1px rgb(var(--accent) / 0.30) inset`): applied to a block while it is being dragged or resized. A warm shadow plus an inset accent ring. Same shape as Composer Lift; explicitly paired so drag feels like "this block has become a composer for a moment."
- **Editing Ring** (`box-shadow: 0 0 0 1px rgb(var(--accent) / 0.55)`): a 1px accent outline applied to a block in edit mode. No drop shadow. Just the ring, signaling "this is now a text field."

All shadow base is **Walnut Ink** at low opacity, never a flat black. The shadow is warm because the scene is warm.

### Named Rules

**The Flat-At-Rest Rule.** Blocks, free slots, hour labels, status lines, and toolbar buttons cast no shadow at rest. The grid is a flat ruled page. Adding a resting shadow to the block ("for depth") is forbidden; it would make the block read as a card, which it isn't.

**The Shadow-Means-State Rule.** Every shadow in the system signifies an interactive state (dragging, resizing, editing, composing). A shadow is never decorative. If a surface needs to read as elevated without state, restate it with warmth contrast or a hairline, not with a shadow.

**The Warm-Shadow Rule.** Shadow ink is `--shadow: 24 18 12` (light) or `0 0 0` (dark, where the canvas is already deep), never a cool grey-blue. Cool-blue drop shadow against warm paper is the SaaS-template tell.

## 5. Components

### Time Block (the signature)

The block is the system's single most important surface. Every other component exists to frame it.

- **Shape:** rectangle with rounded-md corners (6px). Spans the column width minus the left hour-gutter (48px) and a small right inset (4px). Day-view blocks sit between `left: 48px` and `right: 4px`; week-view blocks sit at `left: 3px / right: 3px` of their column.
- **Resting state:** filled with **Amber Wash** (`#f4e2bb`), text in **Burnt Ochre** (`#8a5b1e`). No border, no shadow, no left-stripe. The amber wash IS the affordance.
- **Title** (13px in day view, 12px in week view, weight 600, tracking -0.005em): truncates with ellipsis. Title is the block's identity.
- **Time row** (10px tabular mono, color `accent-strong` at 75% opacity): "09:00 – 09:45 · 45m" with the separator at 45% opacity so the en-dash recedes. The "X left" tail on the active block carries the **Ember** color, never Burnt Ochre.
- **Hover:** background shifts to **Amber Wash Strong** (`#ebd19e`). Z-index raises to 15 so the block lifts over its neighbors without animation. The hover is a chromatic intensification, not a transform.
- **Dragging / Resizing:** Drag Lift shadow applies, background goes to **Amber Wash Strong**, z-index raises to 30. The block "becomes a composer for a moment."
- **Editing:** Editing Ring outline appears. The amber wash stays. A bare transparent input replaces the title with pixel-parity font sizing so the text does not shift between display and edit modes.
- **Delete affordance:** a 20x20 ghost glyph in the top-right corner, invisible until block hover or focus, then 100% visible (mobile always visible). Tinted Burnt Ochre, not red.
- **Resize handle:** invisible until block hover; a 2px-tall capsule line at the bottom edge that brightens to Burnt Ochre @ 35% on hover and Burnt Ochre @ 70% during active resize, growing from 18px to 24px wide.

### Free-Slot Marker

- **Shape:** a single 1px dashed top hairline plus a tiny mono timestamp label in the top-left. No fill. No border. No box.
- **Color:** the hairline is **Graphite Mist** at 42% opacity. The timestamp is **Graphite Strong** at 85% opacity, 10px tabular mono (9px in week view).
- **Behavior:** sits at 70% opacity at rest, rises to 100% during a drag-in-flight to confirm available landing zones. Never fills, never animates layout.

### Composer (inline task editor)

- **Shape:** rectangle with rounded-md corners (6px), occupies the same `left: 48px / right: 4px` footprint as a block.
- **Surface:** **Page** (`#fefdfa`) fill with **Walnut Ink** (`#1f1b14`) text.
- **Elevation:** Composer Lift (accent 1px ring at 55% + warm soft drop shadow).
- **Title input:** 13px weight 600, tracking -0.005em. Pixel-parity with the block title so creation feels continuous with the block that will appear.
- **Time inputs:** 58px wide, 11px tabular mono, `ink-muted` at rest, `ink` on focus. Hidden chrome (no border, no background).
- **Meta row:** 10px tabular mono, `ink-faint`. Carries the duration and any tiny validation hint.
- **Error state:** the meta row's text shifts to **Ember**. No icon, no border change.

### Date Toolbar

- **Composition:** weekday + date as a flex baseline row. Date is set in **Display** (30px, weight 600, tight tracking). Day-of-week is set as a tiny 10px Burnt Ochre uppercase label sitting baseline-aligned next to the date numeral.
- **Subtitle:** "Tuesday · 28 May 2026 · UTC" in 14px Walnut Muted, with the year and tz tag in `ink-faint`.
- **Controls:** day/week toggle on the left of the right cluster, then prev / today / next as three small **glyph-btn**s separated by a 1px x 16px hairline divider.

### Glyph Button

- **Shape:** 28x28 square, rounded-md corners (6px).
- **Resting state:** transparent fill, **Walnut Faint** (`#796e5f`) glyph.
- **Hover:** **Page Fold** (`#f4f1eb`) fill, **Walnut Ink** glyph.
- **Active (e.g. current view):** `aria-current="true"` lifts text to **Walnut Ink**.
- **Focus:** 1px **Deep Ochre** ring at 50% opacity, offset by 2px against the canvas.
- **Iconography:** stroke-only SVG glyphs, 14px (h-3.5 w-3.5), stroke 1.8, round line-caps and joins. No filled icons in chrome.

### TZ Chip / Theme Glyph (corner cluster)

- **Position:** fixed top-right of the viewport with `right: 20px, top: 20px`, gap 6px between chip and glyph. Pointer events on children only, not the container.
- **TZ chip:** text-led button (28px tall, 8px horizontal padding, label set in 11px medium with 6% letter-spacing). Cycles between the user's local tz and UTC on click. Same affordance shape as the theme glyph (advance-on-click, no menu).
- **Theme glyph:** same 28x28 glyph-btn footprint, cycles light → dark → system.

### Hour Gutter

- **Width:** 48px reserved column on the left of the grid (day view) and on the left of the week canvas (week view).
- **Hour labels:** 10px medium tabular mono, **Walnut Faint**, right-aligned with 12px right padding, vertical-centered on the hour line (`translateY(-50%)`).
- **Hour lines:** repeating 1px **Hour Rule** line every 96px (1 hour). No half-hour or quarter-hour ticks. The 15-min snap exists only in the drag engine, not in pixels.

### Now-Line

- **Composition:** 1px **Ember** horizontal line spanning the column body, a 6px **Ember** filled dot in the hour gutter, and a 10px tabular-mono **Ember** timestamp label aligned to the gutter.
- **Behavior:** updates on requestAnimationFrame-tick during the active minute. Never animates position with a transition; the position is the time.

### Status Line

- **Position:** below the day grid. A single typographic row separated from the grid by a 1px **Hairline** top border.
- **Content:** "next free 14:00 · 90m ↵" on the left, secondary affordances on the right, both at 12px `ink-faint`. The free-mark dash before "next free" is a 12px tiled dashed segment in Graphite Mist at 70% opacity.

### Week View

- **Composition:** seven day-columns sharing one hour gutter. Sticky weekday strip at the top of the scroll area.
- **Today column:** receives a 6% Deep Ochre tint on the header and 2.5% on the column body. Day-of-week label and date numeral shift to **Burnt Ochre**.
- **Past column type:** day-of-week and date drop to `ink-faint`. The column body itself does not dim; it remains the same canvas.
- **Empty-future-day whisper:** a single 10px uppercase tracking-0.18em line saying nothing more than a hyphen, centered. The point is that nothing is the point.

## 6. Do's and Don'ts

### Do:

- **Do** use **Deep Ochre** (`#b07a35`) or **Burnt Ochre** (`#8a5b1e`) for every chromatic chrome accent (focus ring, today tint, link color, divider emphasis). The accent is fixed.
- **Do** set every numeral in JetBrains Mono with `font-variant-numeric: tabular-nums` via `.num`, `time`, `.block-time`, or `.hour-label`. Times that wobble across columns are a bug.
- **Do** keep blocks flat at rest. Lift only with hover (chromatic), drag (Drag Lift shadow), or edit (Editing Ring outline).
- **Do** show free time as a 1px dashed Graphite Mist hairline with a tiny mono timestamp. No fill, no box.
- **Do** compose two first-class scenes. Both light and dark have their own resting palette; if dark looks like light with the lightness inverted, redo it.
- **Do** use the warm scene-shadow `--shadow: 24 18 12` for elevation in light mode. Cool grey-blue shadow is the SaaS-template tell.
- **Do** use `ease-snap` (cubic-bezier(0.22, 1, 0.36, 1), ease-out-quart) for all transitions. State transitions only; never animate layout properties.
- **Do** keep the corner cluster (tz chip + theme glyph) fixed at top-right. The app has no header bar; the corner glyph IS the chrome.
- **Do** honor `prefers-reduced-motion`. The reduce-motion query strips all transition durations to 1ms.
- **Do** cap body line length at 65-75ch in any long-form copy region.

### Don't:

- **Don't** reintroduce the **generic SaaS / Next.js-template look** (soft slate + blue accent + rounded cards). PRODUCT.md names this as the explicit thing being rejected; the redesign existed to escape it.
- **Don't** clone **Notion-Calendar or Cron** at the surface level. Borrow the rigor, not the look.
- **Don't** use the **"productivity dashboard" aesthetic**: big number tiles, progress rings, streak counters, dopamine-loop UI. Kairos is not a habit tracker.
- **Don't** add **decorative AI-era flourishes**: gradient text, glassmorphism, neon-on-black, animated mesh gradients, the hero-metric template, side-stripe alert cards. All explicitly banned.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on blocks, lists, or callouts. Side-stripe borders are a hard ban.
- **Don't** use `background-clip: text` on a gradient. Single solid colors only.
- **Don't** use glassmorphism, backdrop-blur, or frosted-glass surfaces as a default. Rare and purposeful, or nothing.
- **Don't** use `#000`, `#fff`, or any neutral that isn't warm-tinted (chroma ~0.005). Slate, cool grey, and Tailwind zinc are forbidden.
- **Don't** introduce blue, teal, emerald, violet, or any color outside the amber + graphite + red-ochre triad. If a state needs to signify, signify by type weight, position, or hairline, not by adding a new hue.
- **Don't** wrap surfaces in cards. The canvas is the container. Nested cards are always wrong; flat cards are usually unnecessary.
- **Don't** add a top app-bar, sidebar, or nav rail. The app's chrome is two corner glyphs and a date heading. That is the whole shell.
- **Don't** animate layout properties (width, height, top, left, margin). Use transform and opacity. Use `ease-snap`. No bounce, no elastic.
- **Don't** add modal dialogs. The composer is inline. Delete is immediate (an inline-undo affordance is a future craft pass, not a modal warning).
- **Don't** add a "productivity dashboard" header zone above the grid. The grid is the page. Anything that competes with it for vertical attention is wrong.
- **Don't** use em dashes in any user-visible copy. Use commas, colons, semicolons, periods, or parentheses. (`--` is also out.)
- **Don't** use the **flat, equal-weight hierarchy** of everything competing for attention at the same scale. The day grid is the hero; everything else is staff.
