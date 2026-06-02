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
  gcal: "#dee3e9"
  gcal-strong: "#d0d6de"
  gcal-ink: "#4a5566"
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
  gcal-dark: "#272d37"
  gcal-strong-dark: "#343c49"
  gcal-ink-dark: "#aebacb"
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
  block-gcal:
    backgroundColor: "{colors.gcal}"
    textColor: "{colors.gcal-ink}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
    typography: "{typography.title}"
  block-gcal-hover:
    backgroundColor: "{colors.gcal-strong}"
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
  checkpoint-tag:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-faint}"
    typography: "{typography.label}"
  filter-pill:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.xs}"
  budget-meter:
    backgroundColor: "{colors.free}"
    rounded: "{rounded.pill}"
    height: "4px"
  budget-meter-fill:
    backgroundColor: "{colors.accent}"
  login-input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
  cal-eye:
    backgroundColor: "transparent"
    textColor: "{colors.ink-faint}"
    rounded: "{rounded.sm}"
    height: "24px"
    width: "24px"
  defaults-seg:
    backgroundColor: "transparent"
    rounded: "{rounded.sm}"
    padding: "2px"
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
- **Four scales, one grid.** Day, 5-day, week, and month share a single ruled-page language; the day grid is the hero and the others are the same grammar at a different zoom.
- **The day is gated, not walled.** A single-password login renders the schedule you're locked out of as a live, dimmed ghost grid behind the field, time ticking without you, then raises the light on unlock.

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
- **Calendar Graphite** (`#dee3e9` fill, `#4a5566` ink): the cool graphite wash worn by external Google-calendar events (`.block-gcal`). A filled block, distinct from the free-slot hairline, but deliberately *not* amber: borrowed time reads as a different material from the work you blocked yourself. Dark scene pairs to `#272d37` fill / `#aebacb` ink.
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

**The Borrowed-Time Rule.** Amber is reserved for blocks *you* authored. External calendar events (Google) wear Calendar Graphite, never amber, because they are not time you blocked, they are time claimed on you from elsewhere. They render read-only (no drag, no resize, no edit, no delete) with a small calendar mark in the corner, and may overlap your amber blocks freely. The graphite says "not yours to move" without a single word of UI copy.

**The One Ember Rule.** Persistent, filled Ember belongs to one thing only: the now-mark cluster (now-line, gutter label, active-block inset ring, and "X left" tail are all channels of the single fact "now"). No second persistent Ember region may compete with it. Ember is allowed in three narrow, non-competing roles: an inline **error string** (text only, never a filled or bordered alert box, the day/week reschedule-failure line is quiet Ember text for this reason), a **destructive hover** on a delete affordance (transient, pointer-only), and the **budget overrun** tail on the settings surface (legitimate because the now-line never appears there, so the rule still holds per screen). The forbidden move is a resting, boxed, or decorative Ember that reads as a second "now."

**The Warm-Neutral Rule.** Every neutral is tinted toward warm (chroma ~0.005). `#000` and `#fff` are forbidden. Slate, cool grey, and "Tailwind zinc" are forbidden. The palette's temperature is the brand.

**The Labels-Are-Type-Not-Color Rule.** Labels are distinguished by their *name*, never by a per-label color. There is no label palette, no colored chips, no swatch picker. A label renders as a tabular-mono slug (with the `#` sigil where the surface invites it), tinted Burnt Ochre purely to say "this is a label", carrying no per-label meaning. A rainbow of label colors would shatter the amber + graphite + ember triad, so it is refused. Budget consumption reuses the existing roles: amber is the work consumed, graphite is the open allowance, Ember is the overrun.

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

### Calendar Block (external Google event)

A read-only sibling of the Time Block, synced from an attached Google calendar. Same footprint and typography as a time-block so the day reads as one schedule, but a different material so you always know what's yours.

- **Shape & type:** identical to the Time Block (rounded-md, same `left/right` insets per view, same 13px/12px title and 10px tabular-mono time row).
- **Fill:** **Calendar Graphite** (`#dee3e9`), text in Calendar Graphite ink (`#4a5566`); hover intensifies to `#d0d6de`. Never amber (the Borrowed-Time Rule).
- **Calendar mark:** a 12px stroke-only calendar glyph in the top-right corner at 50% ink opacity, where a Kairos block keeps its delete-X. It is the one tell that this time isn't yours to move; the title pads right to clear it.
- **Label:** the block wears its calendar's assigned label (`#tkxel`, `#personal`) as its only tag, graphite-tinted in day view and a graphite dot in week/month view.
- **Read-only:** no grab cursor, not focusable for editing, no delete or resize handle, no `block-active` amber takeover when the now-line crosses it. Interaction is gated on `source === 'kairos'` everywhere. Calendar events may overlap your blocks (the no-overlap constraint exempts them) but still count as busy for free-slots and booked/open day stats.
- **Overlap separation:** a 1px ring in the **canvas** colour (`box-shadow: 0 0 0 1px rgb(var(--bg))`). Invisible against the page, but the moment one external event overlaps another (a "Not Available" busy block with meetings inside it, or double-bookings) it cuts a clean gap so stacked graphite blocks read as distinct cards instead of one mass. Hovering a calendar block lifts it (`z-index`) so its full extent is legible. (Full side-by-side lane-splitting of overlapping events is a deferred follow-up; this keeps them legible without it.)

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
- **Labels row:** a `#` sigil + mono input on its own row. While focused, a quiet strip of **recent-label pills** (low-opacity Burnt Ochre wash) appears for one-tap insertion. Pills, like every interactive control, carry a 1px Deep Ochre `:focus-visible` ring.
- **Recurrence row:** five quiet pills (once / daily / weekdays / weekly / every N d), the active one in a low-opacity accent wash. The "every N d" pill wraps an inline numeric input so the interval reads as part of the same affordance, not a separate field; it rings on `:focus-within`. The meta row spells out the cadence ("repeats weekly · 60 occurrences ahead").
- **Error state:** the meta row's text shifts to **Ember**. No icon, no border change, never a filled alert box (see the One Ember Rule).

### Date Toolbar

- **Composition:** the masthead is set in **Display** (30px, weight 600, tight tracking) and re-phrases per view: day = weekday long (with a tiny Burnt Ochre `· today` tag when current); month = month name (`· this month`); 5-day/week = the month or month-range. Only one Display element per page (the Single-Display Rule holds).
- **Subtitle:** 14px Walnut Muted with the year and tz tag in `ink-faint`. Day view reads "28 May · 2026 · UTC"; multi-day reads a range with a mono `→` ("Mon 26 → Fri 30 · 2026"); the tz tag is always the trailing uppercase mono chip.
- **View toggle:** a labeled `<nav aria-label="View">` of four text **glyph-btn**s, Day / 5d / Week / Month; the active one is a `<span aria-current="true">` (not a link), the `5d` numeral rides `.num`.
- **Navigation:** a 1px × 16px hairline divider, then prev / **Today** / next as **glyph-btn**s in their own labeled `<nav>`. Today carries `aria-current` when the view is already on today. Stepping is view-aware (±1 day, ±5 days, ±1 week, or ±1 month).

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

- **Composition:** 1px **Ember** horizontal line spanning the column body and a small **Ember** `now · HH:MM` label (uppercase mono tag + tabular-mono time) pinned to the right edge of that line, on a faint warm-surface backing so the line doesn't bleed through the text. In week view the line is scoped to today's column only, so it never implies "now is everywhere at once."
- **Behavior:** the clock re-arms to each minute boundary (so the displayed `HH:MM` flips exactly on the minute rather than drifting on a fixed interval) and re-syncs the instant the tab returns from the background. Never animates position with a transition; the position is the time. The active block (the one the current minute sits inside) carries the parallel Ember tells: a faint Ember inset ring, a `now` corner glyph, and the "X left" tail.

### Checkpoint (scalar day-divider)

A user-placed horizontal marker on the grid: a named moment ("standup", "school run") rather than a duration. It deliberately sits in a **third channel**, neither Ember (now) nor graphite-dashed (free), so the three meanings never collide.

- **Composition:** a 1px **solid** hairline in **Hairline Strong** across the column body, a 10px horizontal tick in the hour gutter at the line's center, and a right-anchored label tag whose `surface` background masks the line behind the text (the architectural-drawing convention: dimension lines get interrupted by their label). The tag reads `HH:MM · label` in mono + uppercase Label type. On today, a future checkpoint carries a faint `· in Xh Ym` countdown that vanishes the moment now crosses it.
- **States:** the line and tag warm from `text-faint` toward `ink` on hover/focus. Past days render display-only (dimmed, not editable).
- **Editor:** clicking the tag opens an inline single-row editor (label input + mono time input + `↵ add`/`save` hint) that lifts to the same accent Composer ring as the task composer, compressed because a checkpoint has no duration. The remove affordance is a quiet text action: Ember on hover (the editor's destructive-text convention), accent ring on focus. Enter commits, Escape cancels.
- **Week view:** the tag collapses to just the time (no room for the label); the line spans the column. Created with the `c` key, mirroring `n` for the task composer.

### Recurrence & Series Delete

- **Authoring:** lives entirely in the composer's recurrence row (see Composer). No separate recurrence dialog.
- **Series-delete confirm:** deleting a recurring block swaps the corner delete-X for an inline confirm strip (`just this · + future ✕`) on the same paper-on-paper surface as the composer (accent ring + warm shadow). The "+ future" choice is the only Ember-on-hover in the strip. One-shot (non-recurring) blocks still delete immediately, no confirm. There is no modal.

### Status Line

- **Position:** below the day grid. A single typographic row separated from the grid by a 1px **Hairline** top border.
- **Content:** the label-filter pill on the far left, then "next free 14:00 · 90m ↵" (in week view, prefixed with the day: "Tue 27 · 14:00 · 90m"), both at 12px `ink-faint`. The free-mark dash before "next free" is a 12px tiled dashed segment in Graphite Mist at 70% opacity. The right side carries quiet `kbd` hints (`n task · c mark`) and the block count, or the word `composing` while a composer is open.

### Label Filter

A status-line affordance for narrowing the grid to one or more labels. It is a **disclosure, not a menu** (a multi-select filter is not a command menu, and there is no arrow-key menu model behind it).

- **Trigger:** a `filter-pill` reading `labels all` / `labels #deep-work` / `labels 3 active`, with `aria-expanded` and a `data-active` accent state. A ghost `✕` clears the filter when one is set.
- **Popover:** a flat list of **toggle buttons** (real `<button aria-pressed>`, so Tab/Enter/Space work natively), each a graphite mark + mono `#slug` that fills to accent when active. Outside-click and Escape close it. Non-matching blocks on the grid go to a ghost layer (filter-dim), keeping the schedule spatially intact rather than removing rows.

### Day-Stats Line

- **Position:** a single quiet mono row between the date subtitle and the day grid. Not a dashboard tile, not a header zone.
- **Content:** totals and per-label allocations ("6h 30m booked · 4h open · #deep-work 3h"), amounts in `ink`, labels in `ink-muted`, label slugs tinted Burnt Ochre, separated by faint mid-dots and 1px hairline dividers. Hidden entirely when there's nothing to say.

### Week & 5-Day Views

- **Composition:** seven (or five) day-columns sharing one hour gutter, with a sticky weekday strip at the top of the scroll area. The 5-day view is the same component at a wider column, not a separate layout. The full day grid, drag, resize, composer, and checkpoints all work per-column; a block can be dragged across columns to another day.
- **Column header:** weekday short + 2-digit date numeral, with a stacked two-line mono stat ("3h booked" over a lighter "5h open"). Past columns drop the open line; an empty future day shows a single centered `·`.
- **Today column:** a 6% Deep Ochre tint on the header and 2.5% on the body; day-of-week and date shift to **Burnt Ochre**. The now-line is scoped to this column only.
- **Past column type:** day-of-week and date drop to `ink-faint`; the column body stays the same canvas (no dimming).
- **Block tags:** because columns are narrow, labels render as up to three uniform graphite **dots** (plus a mono `+N`), not the `#slug` text used in day view. The dots are a density signal, never per-label colors (the Labels-Are-Type-Not-Color Rule still holds).

### Month View

A calm 6×7 grid that trades time precision for shape-at-a-glance. It is a **navigator, never an editor**: each cell is a `<Link>` to that day's view, with honest link semantics (no `role="grid"`, since there's no arrow-key grid model behind it).

- **Cell:** a 2-digit date numeral, a wrapped row of small **ochre dots** (one per block, capped with `+N`), and a 3px booked-share bar pinned to the bottom edge.
- **Share bar:** the same **track + fill** vocabulary as the budget meter, a Graphite Mist track (open time) with a Deep Ochre fill (booked share). Empty days show a clean graphite hairline; fully-booked days a solid ochre bar.
- **Cell type:** today tints the cell ~5% accent and turns the numeral Burnt Ochre; other-month days fade to `ink-faint`/0.55; past days drop the numeral and dots to faint. Always 6 rows so paging months never reflows height.

### Settings Surface (calendars, labels, budgets, defaults)

A deliberate second room, not chrome bolted onto the grid. Reached by a **gear glyph-btn** added to the fixed top-right corner cluster (now: tz chip · theme · settings · logout). The route is `/settings`, rendered in the same `mx-auto max-w-3xl` single column as the day view, flat and hairline-separated. No SaaS settings sprawl: no card grid, no sidebar of sections, no nested panels.

- **Header:** a quiet `← back to today` link (10–11px, `ink-faint` → `ink`) above the page title, which is the only **Display** element on the surface (the Single-Display Rule still holds, scoped per page).
- **Sections** stack vertically, separated by a 1px Hairline top border, each titled with a **Label**-style heading (11px, uppercase, tracking-0.12em, `ink-muted`). Order: **Calendars**, then Labels, then Budgets, then **Defaults**. The first three are *data the user owns*; Defaults is the one bounded room of app preferences (see the Defaults region and the Quiet-Defaults Rule).
- **Calendars region:** the Google-sync room. A quiet status bar (`2 synced · 3m ago`) with a **Sync now** button (amber chip; turns Ember when a feed is in error, with a spinning glyph while syncing), above a flat list of attached calendars. Each row is an enable **switch** (graphite track, amber when on), the calendar name + its `#label`, a masked URL (`host/…/basic.ics`, never the full secret), and a status string (`synced 2m ago` / `paused` / `hidden from grid` / a truncated error in Ember). A **grid-visibility eye** (`cal-eye`, a 24px stroke-only glyph beside `edit`, slashed and Burnt-Ochre-tinted when off) hides a calendar's events from the grid *without* unsyncing them: the eye is a lighter sibling of the enable switch (which deletes the synced rows), and a hidden calendar's meetings still count as busy for free-slots and day stats. Hiding declutters the view, it does not free the time (the Borrowed-Time Rule, view-scoped). The eye only appears on enabled rows. Editing or attaching opens an inline paper-lift form (name + `#label` on one row, the secret iCal URL beneath), never a modal. Same composer vocabulary as the label adder; the secret address is server-only and never rendered in full.
- **Labels region:** a one-line composer (`#` sigil + mono input + `↵ add` hint) that lifts to the Composer ring on focus, above a flat list. Each row is a mono `#slug` tag, a budget cell that reads `40h /wk` (or `set budget`), and a ghost remove X that appears on row hover. Editing a budget swaps the cell in place for an inline editor (mono hours input + four period chips Day/Week/Month/Quarter + `↵ save` / `clear`), never a modal. Free-text tags already on tasks but not yet registered appear under a faint `in use, not yet added` row as one-tap promotion pills.
- **Defaults region:** the single bounded room of app preferences, kept per-browser. A quiet intro line, then a flat label-led list. Each control is a name on the left and a **`defaults-seg`** on the right: a 1px-hairline-framed group of `range-chip`s (the active one in the accent wash, `aria-current` / `aria-pressed`), the same segmented vocabulary as the budget range selector. Currently two controls: **Week starts** (`Mon` / `Sun`, which also re-anchors the month grid; written to a cookie since the week window resolves on the server) and **Appearance** (`Light` / `Dark` / `System`, the same stored value the corner theme glyph writes, kept in lockstep so the two never disagree). No switches sprawl, no per-preference cards. The bar for adding a third control here is high.

### Budget Meter (the budgets read)

The answer to "am I over?" without a single ring, tile, or streak. Built on the same **track + fill** vocabulary as the month-cell share bar.

- **Track:** a 4px full-width capsule in **Graphite Mist** (`--free` at ~26%), signifying the open allowance. Refused: an emerald or green "good/bad" bar.
- **Fill:** **Deep Ochre** (`--accent` at ~72%) from the left, width = consumed share. Amber is the work, here too.
- **Over budget:** the bar rescales so its full width is the *used* total; the budget sits as a **tick** (a 1.5px canvas-colored gap) partway along, and the overrun spills past it as an **Ember** (`--now` at ~85%) tail. This is the only place Ember signifies over-budget; it is legitimate because the now-line (Ember's home) never appears on the settings surface, so the One-Ember Rule holds per screen.
- **Figures row:** mono, above the bar. `used 31h 30m · 8h 30m left`, or when over, `used 24h / 20h · 4h over` with the trailing verdict in Ember. No icons.
- **Range:** a unit selector (Day / Week / Month / Quarter chips) plus prev / now / next glyph-btns re-bases every meter; budgets pro-rate by days across units, and read exactly when the range unit matches the budget's base period.
- **Empty:** when no label carries a budget, a single quiet line, `Set a budget on a label to track it here.` No placeholder meters.

### Login Scene (the gate)

The single-password gate, composed as a scene rather than a form on a blank page. It earns its place by making the wait meaningful instead of dead.

- **Backdrop:** a full-bleed, non-interactive **ghost of the day grid** sits behind the field at ~16% opacity under a soft radial mask, hour rules, a few evocative amber blocks (mono time ranges only, never invented task titles, since this is pre-auth), and a **live now-line ticking in real wall-clock time**. You are looking at the day you're locked out of, and time is visibly moving without you.
- **Foreground:** a narrow centered column, the **Kairos** wordmark in Display + a `private day` uppercase Label sublabel, above a single password field styled as a composer-quiet input with a trailing mono affordance glyph (`↵` → `…` while checking → `✓` on success).
- **Meta line:** one mono status string carrying every state (`enter to unlock`, `checking…`, `wrong password · 2 tries left`, `locked · 4m left`, `opening your day…`), Ember only when it's an error/lockout alert (text, no box).
- **Reveal:** on unlock the backdrop rises to ~90% and the foreground lifts and dissolves over ~620ms on `ease-snap`, handing off to the real schedule as the light finishes coming up. `prefers-reduced-motion` skips straight to the schedule.

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
- **Do** give every interactive control a visible focus state (the WCAG floor). Chrome buttons use the offset accent ring (`focus-visible:ring-1 ring-accent/50 ring-offset-2`); inline editor pills and chips use a flush `box-shadow: 0 0 0 1px rgb(var(--accent) / 0.55)`. A keyboard-reachable control with no `:focus-visible` is a bug.
- **Do** keep ARIA honest: a role is a promise of behavior. The label filter is a disclosure of `aria-pressed` toggle buttons, not a `role="menu"`; the month grid is a set of day-links, not a `role="grid"`.
- **Do** render external Google-calendar events in **Calendar Graphite**, read-only, with a corner calendar mark (the Borrowed-Time Rule). Your authored blocks stay amber; the two materials must never be confused.
- **Do** keep app preferences in the one bounded **Defaults** section of `/settings`, as a flat label-led list of `defaults-seg` chip groups. **The Quiet-Defaults Rule:** a default earns its place only when it changes the app's resting state (appearance, week start, which calendars show); the corner glyphs stay the in-the-moment overrides, and Appearance there is the *same* stored value as the corner theme glyph, never a second source of truth.
- **Do** treat "hide calendar from grid" (the `cal-eye`) as a *view* declutter, not a detach: keep hidden calendars synced and still counted as busy for free-slots and day stats. Detaching/pausing (the enable switch) is the only thing that removes a calendar's time.

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
- **Don't** add a top app-bar, sidebar, or nav rail. The app's chrome is the fixed top-right corner cluster (tz chip · theme · settings gear · logout) plus a date heading. `/settings` is a separate room reached by the gear, not a panel docked onto the grid.
- **Don't** grow the **Defaults** section into a SaaS preferences page: no tabs, no sub-pages, no card grid, no per-row toggle wall, no "advanced settings" disclosure. It is a short list of resting-state preferences and stays that way. If a knob can live as an in-the-moment corner control instead, it belongs there, not here.
- **Don't** animate layout properties (width, height, top, left, margin). Use transform and opacity. Use `ease-snap`. No bounce, no elastic.
- **Don't** add modal dialogs. The composer is inline; the budget editor is inline; label removal is immediate (an inline-undo affordance is a future craft pass, not a modal warning).
- **Don't** color-code labels or show budgets as rings, gauges, big-number tiles, or streaks. Labels are type, not color; budgets are hairline meters (graphite track, amber fill, Ember overrun). See the Labels-Are-Type-Not-Color Rule and the Budget Meter spec.
- **Don't** add a "productivity dashboard" header zone above the grid. The grid is the page. Anything that competes with it for vertical attention is wrong.
- **Don't** use em dashes in any user-visible copy. Use commas, colons, semicolons, periods, or parentheses. (`--` is also out.)
- **Don't** use the **flat, equal-weight hierarchy** of everything competing for attention at the same scale. The day grid is the hero; everything else is staff.
- **Don't** wrap a transient error in a filled or bordered alert box. Errors are a quiet Ember **text** line (no fill, no border, no icon), per the One Ember Rule. A boxed red alert is the SaaS reflex this system rejects.
- **Don't** declare a widget role you don't implement: no `role="grid"` without arrow-key cell navigation, no `role="menu"` / `menuitemcheckbox` on a multi-select filter. Over-promised ARIA is worse than none.
- **Don't** color-code the week-view block tags. They are uniform graphite density dots (plus `+N`), never a per-label palette.
- **Don't** paint external Google events in amber or give them edit/drag/delete affordances. Amber is for your own blocks; calendar events are graphite and read-only (the Borrowed-Time Rule). Don't render the full secret iCal URL anywhere in the UI; mask it.
