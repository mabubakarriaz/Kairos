# Frontend — Technology Stack (Kairos)

> The **Frontend** slice of the canonical Kairos stack, owned by the `frontend-builder` skill.
> Indexed in [docs/technology-stack.md](../../../../docs/technology-stack.md); rationale, benchmarks & rejected alternatives in [docs/research.md](../../../../docs/research.md). Cross-cutting decisions — the architecture diagram and the [_Deliberately Excluded_](../../../../docs/technology-stack.md#deliberately-excluded) list — live in the index. Patterns for this slice: [design-pattern.md](design-pattern.md).

## Frontend

| Technology | Purpose | Notes |
|---|---|---|
| **Razor Pages** | Server-rendered markup | Primary view layer |
| **Tailwind CSS** | Utility-first CSS framework | Styling system; compiled via Tailwind CLI / PostCSS |
| **htmx (2.x)** | Dynamic partial updates without SPA complexity | Pairs naturally with Razor Pages; uses `hx-swap-oob` for atomic multi-region updates (source slot + target slot + free-slots panel) and `hx-trigger="every 30s"` for the "now" line |
| **Htmx.Net** _(NuGet)_ | Server-side htmx helpers | `Request.IsHtmx()` to branch `Partial()` vs `Page()`, plus `HX-Trigger` response-header helpers (Khalid Abuhakmeh's canonical pattern) |
| **SortableJS** | Drag-and-drop "island" for the day column | The one required JS layer — handles all drag visuals via CSS transforms client-side; fires htmx **only on `onEnd`** (single POST on drop). This is htmx.org's official drag recipe |
| **Alpine.js** | Lightweight client-side interactivity | Keybindings (`x-on:keydown.window` at page root), modal/dropdown state, modifier-key drag state in `Alpine.store('drag')` |
| **Vite** | Front-end asset bundling & dev server | Hash-fingerprinted output to `wwwroot/dist/` (referenced via `vite-manifest.json`), `Cache-Control: immutable` for hashed bundles, HMR in dev |

> **Why this combo:** Razor Pages stays the source of truth on the server. Tailwind handles styling, htmx handles server-driven interactivity, and Alpine.js covers small client-only behaviors. The **only** bespoke JS is the SortableJS drag island — drag-to-reschedule universally needs a small JS layer, and a per-pixel server round-trip (Blazor Server / SignalR) is the textbook low-latency-drag anti-pattern. This gives a modern UX without a heavy SPA framework.

---

_Derived from the canonical Kairos stack. If anything here conflicts with [docs/technology-stack.md](../../../../docs/technology-stack.md), the index wins; update this slice to match._
