---
name: frontend-builder
description: "Build the Kairos frontend — ASP.NET Core Razor Pages styled with Tailwind CSS, made interactive with htmx 2.x + Alpine.js, with a single SortableJS drag island for the time-blocked schedule view, bundled with Vite. Use when the user asks to create, scaffold, style, or wire up Razor Pages, the schedule/day-column view, layouts/partials, htmx hx-swap-oob partial updates, the SortableJS drag-to-reschedule island, Alpine keybindings/state, the Tailwind/Vite asset pipeline, or wwwroot static assets for Kairos."
---

# frontend-builder

Build the Kairos frontend the way the **Frontend** stack slice this skill owns prescribes. This skill is the *procedural companion* to that slice for the UI layer: the slice decides **what** the frontend stack is, this skill decides **how** to assemble it consistently. The frontend consumes the Razor PageModel handlers and `/api/*` Minimal APIs that `backend-builder` produces.

## References — read when you need them

Keep this file lean. The *what* (the stack) and the underlying *patterns* live in two companion files next to this skill; load them when the task calls for it instead of restating them here:

- **[references/technology-stack.md](references/technology-stack.md)** — the **Frontend** stack slice this skill owns: Razor Pages, Tailwind CSS, htmx 2.x (+ `Htmx.Net`), the SortableJS drag island, Alpine.js, and the Vite asset pipeline. Read it before scaffolding, or whenever you need an exact library, package, or pipeline setting.
- **[references/design-pattern.md](references/design-pattern.md)** — the patterns that shape this slice: **MVP / Page Controller** (the backbone), plus **Composite** (the partial tree), **Observer** (htmx/Alpine events), **Command** (the keymap and the drop). Read it before designing the page/partial structure, the swap targets, or the keybindings.
- The UX research (schedule-view primitives, the keyboard map, the drag recipe) and the frontend NFR budgets are in [docs/research.md](../../../docs/research.md) — consult it for *why*.

If anything here conflicts with the tech-stack slice (or the cross-cutting [index](../../../docs/technology-stack.md)), the slice wins — update this skill to match.

> **Guiding principle:** Razor Pages stays authoritative on the server. Tailwind styles, htmx fetches server-rendered partials, Alpine handles purely client-side state. The **only** bespoke JS is the SortableJS drag island — a per-pixel server round-trip for drag (Blazor Server / SignalR) is the textbook low-latency-drag anti-pattern and is **excluded**. No heavy SPA framework (Blazor / React are on the Deliberately Excluded list).

## Target layout (inside `src/Kairos.Web`)

```
src/Kairos.Web/
  Pages/
    Shared/
      _Layout.cshtml            # base layout; references Vite-built assets via the manifest
      Partials/                 # htmx-returnable partials:
        _DayColumn.cshtml       #   the schedule day column (slots + blocks); SortableJS target
        _SlotBlock.cshtml       #   a single filled/empty slot
        _FreeSlotsPanel.cshtml  #   "best free slots" side panel (oob-swapped)
        _TaskRow.cshtml         #   a sidebar task
    Schedule/
      Index.cshtml(.cs)         # the vertical schedule view (the MVP feature)
    Tasks/
      Index.cshtml(.cs)         # sidebar list + create
    Index.cshtml(.cs)
  ClientApp/                    # front-end source (compiled by Vite → wwwroot/dist)
    src/
      main.ts                   # entry: imports css, registers htmx + Alpine + the Sortable island
      styles/app.css            # Tailwind directives
      drag.ts                   # the SortableJS island (the only bespoke JS)
      keybindings.ts            # Alpine keydown.window handlers
      vitals.ts                 # web-vitals → OTel custom metric (observability-builder)
    package.json
    vite.config.ts
    tailwind.config.js
    postcss.config.js
  wwwroot/dist/                 # Vite build output (git-ignored) + vite-manifest.json
  Kairos.Web.csproj             # hooks npm build into dotnet build/publish
```

## Build workflow

Work one feature at a time, vertically: render server markup → style with Tailwind → add htmx partial update → layer Alpine/Sortable only where needed. The schedule view is the MVP (research report Slice 1→3). Run `npm run build` and `dotnet build` after wiring the pipeline; don't batch failures.

### 1. Scaffold the front-end toolchain
From `src/Kairos.Web/ClientApp`:
```powershell
npm create vite@latest . -- --template vanilla-ts
npm install -D tailwindcss postcss autoprefixer
npm install htmx.org alpinejs sortablejs web-vitals
npx tailwindcss init -p
```
- `tailwind.config.js` — scan Razor markup so classes aren't purged:
  ```js
  content: ["../Pages/**/*.cshtml", "./src/**/*.{ts,js}"]
  ```
- `src/styles/app.css`: `@tailwind base; @tailwind components; @tailwind utilities;`
- `src/main.ts` — wire the libraries:
  ```ts
  import "./styles/app.css";
  import "htmx.org";
  import Alpine from "alpinejs";
  import "./drag";          // SortableJS island, hooks htmx.onLoad
  import "./keybindings";   // Alpine keydown.window handlers
  import "./vitals";        // web-vitals → OTel
  window.Alpine = Alpine;
  Alpine.start();
  ```

### 2. Configure Vite output for ASP.NET
- In `vite.config.ts`, emit a manifest and build into `wwwroot/dist`:
  ```ts
  build: {
    manifest: "vite-manifest.json",
    outDir: "../wwwroot/dist",
    emptyOutDir: true,
    rollupOptions: { input: "src/main.ts" },
  }
  ```
- Reference assets from `_Layout.cshtml` via the manifest. In dev, point at the Vite dev server (HMR); in prod, read hashed filenames from `vite-manifest.json` and serve with `Cache-Control: public, max-age=31536000, immutable`. The `Vite.AspNetCore` package handles dev-server proxying + manifest lookup with a tag helper, or read the manifest in a small helper.
- npm scripts in `ClientApp/package.json`: `"dev": "vite"`, `"build": "vite build"`.
- **Budget:** initial JS payload ≤ 80 KB gzipped (CI bundle-size gate). `MapStaticAssets` does build-time Brotli for the hashed bundles.

### 3. Hook the asset build into dotnet
In `Kairos.Web.csproj`, run the npm build before publish so containers/CI produce assets:
```xml
<Target Name="BuildClientApp" BeforeTargets="Build" Condition="'$(Configuration)' == 'Release'">
  <Exec Command="npm ci" WorkingDirectory="ClientApp" />
  <Exec Command="npm run build" WorkingDirectory="ClientApp" />
</Target>
```
Add `ClientApp/node_modules` and `wwwroot/dist` to `.gitignore`.

### 4. Layout & base markup
- `_Layout.cshtml`: HTML shell; `<head>` references the Vite-built CSS/JS via the manifest; an Alpine `x-data` root that owns keybinding state and the `drag` store; semantic landmarks; `@RenderBody()`.
- Configure the antiforgery token to ride on htmx posts globally (`hx-headers` with `RequestVerificationToken`, or a global `htmx:configRequest` handler).
- Keep a consistent design language with Tailwind; promote repeated patterns into `@layer components` (buttons, cards, slot/block styles).

### 5. The schedule view (the MVP feature)
Build the vertical day column described in the research report:
- **Grid:** one day, 15-min slots → 96 rows; ~96 px/hour zoom (a 15-min slot ≈ 24 px). Render Kairos blocks and Google busy events as positioned chips (`top`/`height` in px); gcal events styled distinctly (read-only).
- **Free slots** ≥ 15 min render as **dashed-border ghost blocks** that are drop targets; the side panel shows the **best-3** ranked free slots (ranking computed server-side in C# over the SQL free-slot rows).
- **"Now" line:** a 2 px line oob-swapped via `hx-trigger="every 30s"` — **not** SignalR.
- **Working-hours masking:** dim 22:00–06:00 (don't hide).
- Keep the view ≤ ~700 DOM nodes for a day (≤ 1500 budget) — no virtualization needed at this size.

### 6. htmx — server-driven partial updates with `hx-swap-oob`
- Reusable fragments live in `Pages/Shared/Partials/`.
- A reschedule (drag drop, or keyboard drop) POSTs once and the server returns the target day column **plus** out-of-band updates so source slot, target slot, and the free-slots panel update atomically:
  ```html
  <div id="day-2026-06-01" class="sortable-day">…rebuilt…</div>
  <div id="day-2026-05-31" hx-swap-oob="true" class="sortable-day">…rebuilt (cross-day)…</div>
  <aside id="freeslots-panel" hx-swap-oob="true">…top-3 slots…</aside>
  ```
- In the PageModel, branch with **`Htmx.Net`** and return only the partial:
  ```csharp
  return Request.IsHtmx() ? Partial("Partials/_DayColumn", model) : Page();
  ```
- Use `HX-Trigger` response headers for post-action client events. **Avoid chatty triggers** — each fires a server request.
- **Anti-patterns:** ❌ full-page swap on drop (loses scroll position — use targeted `hx-target` + `hx-swap-oob`). ❌ loading "all events ever" — always bound to the current view window.

### 7. SortableJS — the drag island (the only bespoke JS)
In `ClientApp/src/drag.ts`, initialize Sortable on each day column inside `htmx.onLoad` so it re-binds after swaps. All visuals are client-side; htmx fires **only on `onEnd`** (single POST on drop):
```ts
import Sortable from "sortablejs";
htmx.onLoad((c) => {
  c.querySelectorAll<HTMLElement>(".sortable-day").forEach((el) => {
    new Sortable(el, {
      animation: 120,
      ghostClass: "drag-ghost",
      onEnd: (e) => htmx.trigger(e.to, "kairos:dropped", { taskId: e.item.dataset.id }),
    });
  });
});
```
The day column carries `hx-post="/api/days/{date}/reschedule" hx-trigger="kairos:dropped" hx-swap="outerHTML"`. Use `will-change: transform` on draggables; target a 60 fps (16.67 ms) frame budget — never round-trip per drag pixel.

### 8. Alpine.js — keybindings & client-only state
- Register the **keyboard map** (research report) via `x-on:keydown.window` at the page root: `j/k` day, `h/l` hour, `T` today, `N` new task at cursor, `E` edit, `X` delete, `/` search, `?` cheatsheet, `1`–`9` day-count, `Cmd/Ctrl+K` palette, `F` focus mode. Modifier-drag state (`Shift` = resize, `Alt` = 5-min snap) lives in `Alpine.store('drag')`, read by `drag.ts`.
- Use Alpine for ephemeral state only (menus, modals, the cheatsheet overlay) — keep markup the source of truth; don't rebuild data the server already rendered.

### 9. Accessibility, responsiveness & progressive enhancement
- Forms post normally; htmx enhances (works without JS where feasible — though the drag island requires JS).
- Semantic HTML, labelled inputs, focus states, keyboard navigation, sensible contrast. Mobile is a *different* UX (agenda list) and a later slice — the schedule grid is a workstation tool.

### 10. Containerization — see `orchestration-builder`
- The `Kairos.Web` Dockerfile builds front-end assets in a Node stage (`npm ci && npm run build` → `wwwroot/dist`) feeding the published image, then the .NET runtime stage.

### 11. Tests — see `testing-builder`
- Razor Page handler tests (xUnit). **Playwright** E2E drives drag→drop→persist and enforces TTI / drop-to-DB (≤ 100 ms) budgets via traces in CI. **web-vitals.js** reports INP as an OTel custom metric for the input-latency budget.

## Conventions

- **Server authoritative.** Markup and data come from Razor Pages; htmx swaps server-rendered partials via `hx-swap-oob`; Alpine is for ephemeral client state only.
- **One JS island.** Drag is the *only* bespoke JS (SortableJS). No SPA framework; no SignalR/WebSockets; no per-pixel server round-trips.
- **No business logic in PageModels** — they call the same application services the APIs/MCP use.
- **Tailwind, not custom CSS.** Compose utilities; promote repeats into `@layer components`.
- **Partials are the swap unit;** the day column, slot block, and free-slots panel are the oob-swap targets.
- **Antiforgery on every mutating htmx request.**
- **Assets are built, never hand-edited in `wwwroot/dist`** — edit `ClientApp/src`, let Vite produce hashed, immutable output.
- **Budgets are real:** ≤ 80 KB gzipped initial JS, 60 fps drag, ≤ 1500 DOM nodes — enforced by `testing-builder`/`devops-builder` gates.
- After wiring the pipeline: `npm run build` + `dotnet build` clean before declaring done.

## Definition of done

A frontend change is complete when: `npm run build` and `dotnet build` succeed; Vite emits hashed assets + `vite-manifest.json` to `wwwroot/dist` referenced with immutable caching; the schedule view renders 15-min slots, positioned Kairos+gcal blocks, dashed free-slot drop targets, the best-3 panel, the 30 s "now" line, and working-hours dimming; the SortableJS island drives drag-to-reschedule with a single POST on drop and `hx-swap-oob` updates source+target+panel atomically; `Request.IsHtmx()` branches partial vs full page; Alpine keybindings and the drag store work; antiforgery is enforced; the initial JS bundle is ≤ 80 KB gzipped; and the `Kairos.Web` container builds with assets included. Anything skipped is called out explicitly.
