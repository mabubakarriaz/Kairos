# frontend-builder — Design Patterns

> Patterns for the UI slice: **Razor Pages** + **Tailwind**, **htmx 2.x** partial updates, **Alpine.js** client state, the single **SortableJS drag island**, and the **Vite** asset pipeline.
> Companion to [`.claude/skills/frontend-builder/SKILL.md`](../SKILL.md). Canonical stack: [technology-stack.md](technology-stack.md). Legend & cross-cutting patterns: [design-pattern.md](../../../../docs/design-pattern.md).

The frontend's guiding rule is **"server authoritative; one JS island."** In pattern terms that means a passive-view presentation pattern (**MVP / Page Controller**), a tree of server-rendered partials (**Composite**), event-driven updates (**Observer**), and discrete user intents as objects (**Command**) — with no client-side state model competing with the server.

## Architectural backbone — MVP (Passive View) / Page Controller

**[non-GoF]** (Fowler GUI architectures). This file owns the **View** side of the MVP split introduced in [backend-builder.md](../../backend-builder/references/design-pattern.md#architectural-macro--mvp-model-view-presenter-for-the-web-surface):

- **Page Controller** — each Razor Page is the controller for one URL; its **PageModel** handler is the Presenter.
- **Passive View** — the `.cshtml` and partials render exactly what the handler hands them and raise requests (via htmx/forms). They contain **no fetch decisions and no business logic**. That passivity is what keeps the server authoritative and the markup the source of truth.

## Pattern catalogue

| Pattern | Category | Where in Kairos | Why |
|---|---|---|---|
| **Composite** | [GoF · Structural] | `Schedule/Index` → `_DayColumn` → `_SlotBlock`; `_FreeSlotsPanel`; `_TaskRow` | The schedule view is a tree of partials composed and re-rendered uniformly. |
| **Observer** | [GoF · Behavioral] | `htmx.onLoad`, `hx-trigger`, the `kairos:dropped` event, `HX-Trigger` headers, `Alpine.store('drag')`, web-vitals | Components react to events without the emitter knowing the listeners. |
| **Command** | [GoF · Behavioral] | the Alpine keyboard map (`j/k`, `N`, `E`, `X`, `Cmd/Ctrl+K`…); the SortableJS `onEnd` → single POST | Each keystroke / drop is a discrete, named user intent. |
| **Strategy** | [GoF · Behavioral] | `Request.IsHtmx() ? Partial(...) : Page()` | Pick a render algorithm (fragment vs full page) per request. |
| **Mediator** | [GoF · Behavioral] | `hx-swap-oob` updating source slot + target slot + free-slots panel from one response | One server response coordinates several regions that don't reference each other. |
| **Flyweight** | [GoF · Structural] | Tailwind utility classes shared across thousands of elements | Share intrinsic style state instead of per-element custom CSS. |
| **Facade** | [GoF · Structural] | `ClientApp/src/main.ts` wiring htmx + Alpine + Sortable + vitals | One entry point hides library bootstrapping. |

---

### Composite — the schedule view as a partial tree

**Intent (GoF):** Compose objects into part-whole tree structures; let clients treat individual objects and compositions uniformly.

**Where it lives:** `Pages/Shared/Partials/`. The day view is a composite: `Schedule/Index.cshtml` hosts `_DayColumn`, which is a column of `_SlotBlock`s (filled or empty), beside `_FreeSlotsPanel`. The server renders the whole tree or any subtree — and htmx swaps subtrees by id.

**Why it fits:** the same partial is the rendering unit whether it's a leaf (`_SlotBlock`) or a composite (`_DayColumn`). That uniformity is what makes targeted `hx-swap-oob` updates clean.

**Pitfalls:** keep the tree ≤ ~700 DOM nodes/day (1500 budget) — no virtualization needed at this size, and adding it would be premature. Partials are the swap unit; don't swap whole pages.

### Observer — htmx & Alpine events

**Intent (GoF):** Define a one-to-many dependency so that when one object changes state, dependents are notified automatically.

**Where it lives:** htmx is an Observer hub. `htmx.onLoad(...)` re-binds behavior after every swap; `hx-trigger="every 30s"` drives the "now" line; the drag island fires a custom `kairos:dropped` event the day column observes; `HX-Trigger` response headers notify the client of post-action events; Alpine's reactivity and `Alpine.store('drag')` notify views of modifier-key state.

```ts
// drag.ts re-subscribes on every swap, because the DOM was replaced
htmx.onLoad((c) => {
  c.querySelectorAll<HTMLElement>(".sortable-day").forEach((el) => {
    new Sortable(el, { animation: 120, ghostClass: "drag-ghost",
      onEnd: (e) => htmx.trigger(e.to, "kairos:dropped", { taskId: e.item.dataset.id }) });
  });
});
```

**Why it fits:** emitters (a 30 s timer, a drop) don't know their observers (the day column, the panel); they publish events and the right regions react. Classic Observer, and the reason there's no SignalR — the "now" line is a stateless `hx-trigger`, not a pushed stream.

**Pitfalls:** **avoid chatty triggers** — each fires a server request. Re-bind Sortable inside `htmx.onLoad` (the old node is gone after a swap), or drag silently dies after the first update.

### Command — the keymap and the drop

**Intent (GoF):** Encapsulate a request as an object.

**Where it lives:** the Alpine keyboard map registered via `x-on:keydown.window` at the page root — `j/k` (day), `h/l` (hour), `T` (today), `N` (new at cursor), `E`/`X` (edit/delete), `/` (search), `?` (cheatsheet), `Cmd/Ctrl+K` (palette), `F` (focus). Each binding maps a keystroke to one action object. The drag island collapses an entire drag gesture into **one** Command: a single POST on `onEnd`.

**Why it fits:** Command gives a uniform "user intent → action" mapping and a natural place for a command palette (`Cmd/Ctrl+K`) to list/dispatch the same intents. The single-POST-on-drop rule is Command's "invoke once, with all the parameters" discipline.

**Pitfalls:** **never round-trip per drag pixel** — visuals are client-side CSS transforms; only `onEnd` invokes the Command. Target 60 fps (16.67 ms); use `will-change: transform`.

### Strategy — `IsHtmx()` render selection

**Where it lives:** the Presenter selects a render Strategy per request:

```csharp
return Request.IsHtmx() ? Partial("Partials/_DayColumn", model) : Page();
```

A normal navigation gets a full page; an htmx request gets just the fragment. Same handler, two algorithms, chosen at the boundary. (Forms post normally and htmx enhances — progressive enhancement falls out of this Strategy.)

### Mediator — `hx-swap-oob` coordinating regions

**Intent (GoF):** Define an object that encapsulates how a set of objects interact, so they don't refer to each other directly.

**Where it lives:** a reschedule POSTs once and the **server response** mediates a multi-region update — the target day column plus out-of-band swaps for the source slot, the cross-day column, and the free-slots panel — atomically:

```html
<div id="day-2026-06-01" class="sortable-day">…rebuilt…</div>
<div id="day-2026-05-31" hx-swap-oob="true" class="sortable-day">…rebuilt (cross-day)…</div>
<aside id="freeslots-panel" hx-swap-oob="true">…top-3 slots…</aside>
```

**Why it fits:** the slot, the panel, and the columns never reference each other; one response coordinates them. That's the server acting as Mediator — and it's why a single drop keeps three regions consistent without client state.

**Pitfalls:** ❌ full-page swap on drop (loses scroll position) — use targeted `hx-target` + `hx-swap-oob`. ❌ loading "all events ever" — always bound updates to the current view window.

### Flyweight & Facade (lightweight)

- **Flyweight:** Tailwind utility classes are shared style atoms applied across many elements — shared intrinsic state instead of per-element bespoke CSS. Promote genuinely repeated combinations into `@layer components` (buttons, cards, slot/block styles).
- **Facade:** `ClientApp/src/main.ts` is a one-line front door that boots htmx, Alpine, the drag island, and vitals; views don't bootstrap libraries themselves.

## Anti-patterns to avoid

- **A second state model on the client.** Alpine is for *ephemeral* state (menus, modals, modifier keys). Don't rebuild server-rendered data client-side — that's the React/Blazor path the tech-stack doc **excludes**.
- **Per-pixel drag round-trips / SignalR.** The textbook low-latency-drag anti-pattern; the drag island fires **once** on drop, and there's no WebSocket.
- **Smart views.** Partials stay passive (MVP). No fetch decisions or business logic in `.cshtml`.
- **Hand-editing `wwwroot/dist`.** Assets are built by Vite (hashed, immutable). Edit `ClientApp/src`; let the pipeline produce output.
- **Bundle bloat.** Initial JS ≤ 80 KB gzipped is a CI gate (see [testing-builder.md](../../testing-builder/references/design-pattern.md) / [devops-builder.md](../../devops-builder/references/design-pattern.md)) — don't pull in a framework to do what htmx + one island already do.

## How this maps to the build workflow

Per feature, vertically: render the server markup (**Composite** partials) → style with Tailwind (**Flyweight** utilities) → add the htmx partial update (**Strategy** `IsHtmx` + **Mediator** `hx-swap-oob`) → layer Alpine/Sortable only where needed (**Observer** + **Command**). The schedule view is the MVP feature; build it first and keep the view passive throughout.
