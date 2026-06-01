---
target: day-view canvas (whole app)
total_score: 30
p0_count: 0
p1_count: 1
timestamp: 2026-05-31T19-38-52Z
slug: src-app-page-tsx-day-view-canvas
---
## Critique: Kairos day-view canvas (and surrounding surfaces)

### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Drag/resize write feedback is a far-away banner; composer's inline model is far better |
| 2 | Match System / Real World | 4 | "an empty page", "next free", mono timetable, permissive "9am / 13:00" parsing |
| 3 | User Control and Freedom | 3 | Esc everywhere; recurring delete asks scope; but one-shot delete is immediate-and-final, no undo anywhere |
| 4 | Consistency and Standards | 4 | One reused edit-zone vocabulary across composer/block/checkpoint/label/login |
| 5 | Error Prevention | 3 | Inline + DB-constraint guards are strong; one-shot delete has no confirm |
| 6 | Recognition Rather Than Recall | 2 | Click-to-rename, drag-to-move, hover-reveal resize/delete are all invisible at rest |
| 7 | Flexibility and Efficiency | 3 | Good n/c/Enter/Esc accelerators, but no keyboard path to mutate an existing block |
| 8 | Aesthetic and Minimalist Design | 3 | Stunning at rest; composer + toolbar are drifting dense |
| 9 | Error Recovery | 3 | Plain-language inline errors; top-level load error leaks the raw DB message |
| 10 | Help and Documentation | 2 | No discoverable help for hidden affordances beyond the empty-state prompt |
| **Total** | | **30/40** | **Good — solid foundation, address keyboard a11y + discoverability** |

### Anti-Patterns Verdict

**LLM assessment:** Not AI slop. The opposite. Amber + graphite + ember, mono-numeral discipline, single-canvas composition, the categorical refusal of cards / blue / emerald / shadows-at-rest. This passes both the first-order ("calendar -> blue + white + cards") and the second-order ("anti-SaaS calendar -> editorial dark mode") category-reflex checks. It reads as a single studio's pet project, exactly as positioned.

**Deterministic scan:** The bundled detector engine is not shipped with this skill install (only the wrapper `detect.mjs` is present; `detector/detect-antipatterns.mjs` is absent), so the automated scan was unavailable after a real attempt. A manual ripgrep sweep for the banned patterns came back clean: no `background-clip: text`, no `backdrop-blur`, no >1px colored side-stripe borders (every `border-right`/`border-left` found is a 1px structural grid divider), no gradient text. The only literal-rule break is `#000` inside the login backdrop's `mask-image` (globals.css:1677-78), which is harmless (mask alpha only) but breaks the system's own absolutist Warm-Neutral Rule.

**Visual overlays:** No browser-automation tool is exposed in this environment, so no user-visible overlay was produced. Findings below are from source review plus the manual pattern sweep.

### Overall Impression

This is genuinely high-craft work, well above the line where "does it look AI-made" is even the question. The design system is internally coherent to a degree most shipped products never reach: one edit-zone vocabulary (accent ring + warm shadow) is reused across the composer, the in-block editor, the checkpoint editor, the label-add row, and the login field, so the whole app feels authored by one hand. The single biggest opportunity is not visual: it is that the signature interaction (reschedule) and every block mutation are mouse-only, which contradicts the product's own stated WCAG-AA floor and underserves the keyboard-first power user the tool is built for.

### What's Working

- **The palette + mono-numeral system is the brand.** JetBrains-Mono tabular numerals on every time, duration, and date make the grid read like a printed timetable. This is the Soulver/Raycast tell, and it carries hierarchy that a weaker system would have spent color on.
- **One interaction vocabulary, reused everywhere.** The "this is now an edit zone" treatment (1px accent ring at 55% + warm soft shadow) appears identically on composer, block editor, checkpoint editor, label-add, and login. Same Esc-to-close, same Enter-to-commit. That consistency is the difference between "a system" and "a pile of components."
- **The principles are realized, not just written.** No modals anywhere. No-overlap is a DB EXCLUDE constraint, not a JS check. Free slots are SQL. Errors return `{ok,error}` and render inline. "The DB enforces correctness; the UI enforces calm" is actually true in the code.

### Priority Issues

- **[P1] No keyboard path to reschedule, resize, rename, or delete an existing block.**
  - **Why it matters:** PRODUCT.md's own accessibility section commits to "keyboard reach to every interactive element including the drag handle." Today a block is a bare `<div onPointerDown>` with no `tabIndex`/`role`/key handlers, and the resize handle is a non-focusable `<div role="separator">`. A keyboard user cannot move, resize, retitle, or even open the editor on any block that already exists. The core loop of the app is mouse-only, and this is the exact persona (keyboard-first planner) the tool targets.
  - **Fix:** Make blocks focusable (`tabIndex=0`, `role="button"`, visible focus ring reusing the accent ring); Enter opens the editor; Arrow keys nudge start, Shift+Arrow resizes (this is the "arrow-key block nudging" already on the deferred list); Delete/Backspace triggers the existing remove/confirm flow. Reuse `snapMinutes` and `rescheduleAction` unchanged.
  - **Suggested command:** `harden` (with a `craft` pass for the nudge interaction)

- **[P2] Hidden-affordance overload hurts discoverability (Recognition 2/4, Help 2/4).**
  - **Why it matters:** Click-a-block-to-rename, drag-to-move, hover-to-reveal resize handle and delete X are all invisible at rest. The only teaching surface is the empty-state prompt, which disappears the moment one block exists. The "11:30pm, mildly frustrated, replanning" persona returns to a populated day with no reminder of the model.
  - **Fix:** A `?` shortcuts cheatsheet (already deferred) and/or a quiet persistent affordance (the grab cursor is good; consider a one-time at-rest hint, or surfacing "click to rename" in the status line on first focus). Keep it calm; don't add chrome.
  - **Suggested command:** `onboard`

- **[P2] The inline composer is drifting dense for a "quiet quick-add," and re-introduces a dropped feature.**
  - **Why it matters:** Every create now stacks four rows: title + times, a labels row with up-to-6 suggestion pills, an always-visible 5-option recurrence row, and the meta row. That is 5+ decision points to "drop a one-hour block." Recurrence (RRULE-style: daily / weekdays / weekly / every N days) was explicitly on the stack-migration memory's "deliberately dropped, do not reintroduce without asking" list, and it is now present.
  - **Fix:** Collapse recurrence behind a single "repeat" affordance that expands on demand, so one-off creation stays two rows. Separately, confirm whether recurrence is an intended permanent scope addition and update the project memory if so.
  - **Suggested command:** `distill` (composer)

- **[P2] Async write feedback on drag/resize is thinner than on create.**
  - **Why it matters:** A failed reschedule surfaces as a `role=alert` banner at the top of the scroll area, far from the block, while the block silently snaps back on `router.refresh()`. The composer's inline "saving... / error" model is much clearer. Feedback is weakest at exactly the frustrated-replanning moment.
  - **Fix:** Anchor reschedule/resize feedback to the block (a brief inline state echoing the composer vocabulary), so the failure appears where the eye already is.
  - **Suggested command:** `harden`

- **[P3] Small consistency / fidelity nits.**
  - `#000` literal in the login mask breaks the system's own Warm-Neutral Rule (swap to an intent-named token). The now-line ticks every 30s via `setInterval`, but DESIGN.md claims a "requestAnimationFrame-tick during the active minute" (the active-block ember ring and "X left" tail can lag a boundary by up to 30s). Settings says "Now" where the toolbar says "Today." Truncated block titles have no full-text reveal (`title`/tooltip).
  - **Suggested command:** `polish`

### Persona Red Flags

**Alex (Power User):** Lives on the keyboard, loves `n` / `c` / Enter / Esc, and then hits a wall: cannot move, resize, retitle, or delete a block without reaching for the mouse. No command palette. Arrow-nudge is the natural expectation and it is absent. The persona the tool is literally built for gets dropped to the mouse for its signature action.

**The Author, replanning at night (project persona from PRODUCT.md):** It's 11:30pm, a task overran, they want to slide three blocks later. Drag itself is lovely. But a mis-drop that overlaps throws a banner to the top of the column, the block snaps back, and they re-aim with the feedback nowhere near their pointer. Small friction precisely at the "mildly frustrated" moment the persona names.

**Jordan (First-Timer):** Lands on a populated day, so the teaching empty-state never shows. Sees amber blocks with no visible cue they are draggable or clickable-to-rename; the status line whispers `n task · c mark` but nothing about direct manipulation. Discovery is by experiment. (Softened by the single-user, no-onboarding-for-strangers positioning, but the rusty-returning author is the real-world version of this.)

### Minor Observations

- LoadErrorNotice / settings load error render the raw DB `error.message` to the UI. Acceptable for a dev-owned single-user tool, but it is a jargon leak by the heuristic.
- The recurrence "every N d" control is a `<span onClick>` wrapping the interval input; the preset siblings are real `<button>`s. Keyboard users reach it only via the inner input. Minor focus-model inconsistency.
- Active-block detection and the now glyph recompute on the 30s tick, so the `block-active` ember ring appears/clears up to 30s late.

### Questions to Consider

- The tool is positioned for a keyboard-first planner. Should the signature reschedule loop have a first-class keyboard equivalent, or is drag-only an accepted constraint?
- Is the inline composer trying to do too much? Would a confident version keep one-off creation to two rows and let repeat/labels expand on demand?
- Recurrence was on the "dropped, do not reintroduce without asking" list. Was its return intentional, and should the project memory be updated to match?
