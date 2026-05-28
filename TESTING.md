# Testing — Kairos

A pragmatic test surface for the time-zone / week / alignment work. Most of these
are codified as Playwright specs in `tests/`; a few are noted as **manual** because
they don't sit cleanly in a script (e.g. visually inspecting drag motion against
the cursor).

## Run the suite

```powershell
# One-time, after `npm install`:
npx playwright install chromium

# Then:
npm run dev               # in one terminal
npm run test:e2e          # in another — points at http://localhost:3000
```

`npm run test:e2e` reuses an already-running dev server (matching the `webServer`
block in `playwright.config.ts`). If port 3000 is free, Playwright will start the
server itself.

If the dev server hangs on Windows (the `.next/trace` lock issue documented in
`CLAUDE.md`), reset before retrying:

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
```

## What the spec covers

Everything below is asserted in [tests/tz-craft.spec.ts](tests/tz-craft.spec.ts).

### Time-zone switching
1. **Default chip is PKT.** First load (no cookie) renders `PKT` in the top-right
   chip and `PKT` as the subtitle suffix under the weekday in the day-view header.
2. **Click cycles PKT ↔ UTC.** Single click flips the chip text; the date header
   suffix flips with it; `router.refresh()` re-renders the day window from the new
   local midnight without a full page reload.
3. **The cookie persists.** After cycling, `kairos-tz` is set on `document.cookie`
   and survives a navigation.

### Block / gutter alignment (the bug)
The original bug: blocks and free-slots received `style={{ top: minutes }}` and
React rendered that as pixels. A 10:00 block (minute 600) painted at 600px while
the hour-gutter "10" sat at 960px. Fix multiplies by `PX_PER_MIN = 1.6` at the
style boundary.

4. **Created block's CSS `top` equals the matching hour-label's CSS `top`.**
   Spec creates a block via the inline composer at the next free slot, reads
   the composer's auto-filled start time, and asserts the rendered block's
   `getComputedStyle(...).top` equals `startMinutes * 1.6` px, which is also
   the position of the corresponding hour label. The block is deleted as a
   cleanup step.

### Week view
5. **Seven columns, Mon → Sun.** `?view=week` renders 7 `.week-col-header`s; the
   first reads `Mon`, the last reads `Sun`.
6. **Today's column is marked.** When the visible week contains today, its
   column header carries `data-today="true"`.

### Initial scroll (24-hour planning)
7. **On today, the now-line sits ~1 hour below the scroll top.** Spec computes
   `nowLineComputedTop - scrollerScrollTop` and asserts it lands in the
   `[80px, 120px]` band (1 hour = 96 px; the band absorbs the small drift between
   load and the assertion firing).
8. **On a past or future date, the view opens around 06:00.** Smoke check: not
   anchored to 08:00 anymore.

## Manual checks (not in the spec)

These need eyes on the screen, not assertions:

- **Drag-to-reschedule follows the cursor 1:1.** Before the pixel-fix, the block
  moved at ~0.625× cursor speed because `style.top` was in minute units but the
  cursor delta was being divided by `PX_PER_MIN` to compute the minute delta —
  the two compounded. Verify visually that the block stays glued to the cursor.
- **Light / dark theme rhythm.** The TZ chip should sit quietly to the left of
  the theme glyph in both themes; same `hover:bg-raised` warmth.
- **PKT ↔ UTC visual diff with a real block.** Add a block at e.g. 10:00 PKT.
  Switch to UTC; the same block should reappear 5 hours up (at 05:00) and its
  label should read `05:00–11:00` if it was a 1h block. Block stays glued to its
  new gutter row.

## What's _not_ tested

- DST transitions in any zone — not relevant for PKT (no DST), and UTC has none.
  If the curated list grows again, add a test that creates a block in NY summer
  and asserts a 4-hour offset.
- Drag-across-days in week view — covered by manual exploration; the spec is for
  positional correctness, not interaction motion.
- The free-slots SQL function — covered by virtue of any DB-touching test passing,
  but no isolated assertion.

## Production DB note

The Playwright spec writes to whichever Supabase project `.env.local` points at.
Each test that creates a block deletes it as a teardown step. If a test fails
mid-flow, the orphan block has a `pw-test-{epoch-ms}` title — search and delete
by hand, or run:

```sql
delete from scheduled_blocks
where task_id in (select id from tasks where title like 'pw-test-%');
delete from tasks where title like 'pw-test-%';
```
