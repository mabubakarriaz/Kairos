# Kairos — Technical Design Research Report

**Audience:** Senior .NET/Azure engineer building a single-user, self-hosted, time-blocked todo app with a vertical schedule view and first-class empty-slot detection.
**Tone:** Senior-to-senior. Opinionated. No hand-holding.
**Date:** May 2026.

## TL;DR

- **Stick with the locked stack (Razor Pages + htmx + Alpine + Postgres + Aspire), but carve out the day-column drag layer as a SortableJS-driven JS island.** A pure-htmx month-grid calendar is well-precedented (Jonathan Lahijani's Geffen Playhouse calendar, `ewrogers/hyper-calendar`), but drag-to-reschedule universally requires a small JS layer; htmx.org's own canonical recipe uses Sortable.js, and there is no public case study of a pure-htmx time-blocked drag-and-drop calendar. Blazor United (Server+Auto) and React+API both lose: Blazor's Auto mode has documented hydration hiccups (`dotnet/aspnetcore#53799`, `#64637`), and a circuit-over-WebSocket for every drag-pixel is the textbook anti-pattern for low-latency drag. React+Vite buys you nothing your htmx+Sortable island can't do for a single-user app and bloats the build.
- **Ship one MVP feature, end-to-end: vertical schedule view (15-min slots, 96/day) with computed empty slots as first-class draggable targets, and a "drop task into slot" persistence path.** Hard budgets: TTI cold ≤ 800 ms on loopback; htmx partial swap p95 ≤ 50 ms server + ≤ 30 ms network on loopback; Postgres "events in [start,end]" query p95 ≤ 5 ms via GiST on `tstzrange`; drag at 60 fps (16.67 ms frame budget) using CSS transforms client-side, server roundtrip only on drop. Defer everything else (auth, multi-user, sharing, mobile, notifications, real-time push).
- **Free slots = SQL, not C#.** Use Postgres 14+ `tstzmultirange` with `range_agg(busy_events)` subtracted from a working-hours multirange — this is the cleanest, fastest implementation and avoids N+1 expansion of recurring events into the app tier. Google Calendar sync is polling-with-`syncToken` on a 5-minute jittered cadence (~288 requests/day, roughly 3,500× under the 1,000,000 requests/day per-project threshold per Google's published quota); **do not** use `events.watch` webhooks for v1 (NAT, HTTPS cert requirements, 1-week channel expiration, and `X-Goog-Resource-State` payloads that don't include the change anyway). Adopt the minimum scope `https://www.googleapis.com/auth/calendar.events.readonly`.

---

## Key Findings

1. **The schedule-view market converges on the same primitives** (15-min snap, 60–80 px hour height, drag-and-drop, keyboard-driven command bar, "now" line), but only Reclaim/Motion/Sunsama treat empty time as a first-class object. That's your differentiator.
2. **htmx + Postgres comfortably handles 96 slots × 7 days (≤700 DOM nodes) without virtualization.** Virtualization becomes relevant only when you implement infinite vertical scroll across months — use `hx-trigger="revealed"` with a server-side cursor.
3. **Postgres 14+ multiranges (`tstzmultirange` + `range_agg`) make free-slot detection a one-line SQL expression.** No need for gaps-and-islands gymnastics; the older `LAG`/`LEAD` recipe is the pre-PG14 fallback.
4. **Google Calendar API v3 with `syncToken` polling at 5 minutes ± 25% jitter uses ~288 requests/day** — well under the published per-user quota of 600 requests/minute per project, and orders of magnitude under the 1,000,000 requests/day per-project billing threshold.
5. **Native AOT is not viable for Kairos v1.** EF Core is not AOT-compatible without significant friction; you lose Razor view compilation tooling; tiered compilation + ReadyToRun gives you ~80% of the cold-start win at zero complexity cost.
6. **Aspire's `aspire publish` → Docker Compose flow is production-ready as of late 2025.** Use it as your build system; the Aspire Dashboard is dev-only — do not run it in your single-user prod compose.
7. **MCP server endpoint piggybacks for free on ASP.NET Core** via the official `ModelContextProtocol.AspNetCore` package (NuGet `ModelContextProtocol` 1.x, maintained by Microsoft + Anthropic); tools like `create_task`, `reschedule_task`, `list_free_slots` are trivial to expose over Streamable HTTP / SSE.

---

## Part 1 — UX Research: Schedule-View Paradigm

### Google Calendar "Schedule view" specifically (vs Day/Week/Month)

- Vertical agenda-style list: each day is a horizontal section with chronological event chips; **gaps between events are rendered as raw whitespace** (no first-class empty-slot affordance — Google leaves that as your opportunity).
- All-day events float in a pinned strip at the top of each day; cancelled instances are hidden; recurring instances are expanded server-side when you pass `singleEvents=true`.
- Search-as-jump: typing `/` opens a search field that scrolls the agenda to a result rather than filtering.

### Competitive teardown — what each does with empty slots and drag-to-schedule

| App | Empty-slot rendering | Drag UX | Snap interval | Keyboard |
|---|---|---|---|---|
| **Notion Calendar (ex-Cron)** | Whitespace only | HTML5 DnD, instant; "S" key activates availability marking → scheduling link | 15-min default; resize with mouse | `T` today, `J/K` next/prev period, `1–9` change day-count, `?` shortcut sheet, `S` share availability, `⌘K` command menu |
| **Akiflow** | "Time Slots" — explicit pre-allocated empty containers for batched tasks | Drag from inbox to calendar; "Replan Undone Tasks" auto-suggests next slot | 15-min; `Cmd =` to edit duration; `P` to plan from natural language | Command Bar, `!` priority, ⌘= duration, hover-shows-totals on slots |
| **Sunsama** | None — manual drag from kanban into calendar; workload-realism warnings if you overcommit hours | Drag-and-drop; planned-vs-actual minute tracking | 5/15-min | Shortcuts for create/switch/complete; not as deep as Akiflow |
| **Motion** | **Auto-scheduled** — tasks placed by AI into open slots given priority/deadline/duration/dependencies; recomputes on every change | Drag overrides AI; locking pins blocks | 15-min | Light — Motion's whole pitch is "don't think about scheduling" |
| **Reclaim.ai** | "Defrag" mechanic — tasks and habits are *flexible holds* that resolve into Google Calendar events; reshuffles when meetings appear | Drag in Google Calendar (Reclaim is a layer on top, not its own canvas) | Configurable; minimum block lengths (e.g., never <90 min focus) | Browser keyboard shortcuts via Reclaim web app |
| **Fantastical** | None | Drag-to-resize; natural-language input (`task Pick up car 3PM [15m]`) | 5-min increments | Strong NL parsing, command palette via ⌘N |
| **TickTick Timeline** | Whitespace | Standard DnD | 15/30-min | Average; not a power-user tool |
| **Amie** | Whitespace; "auto-time-blocked" tasks similar to Motion-lite | Smooth DnD | 15-min | Solid but not Cron-level |
| **Outlook Board / Schedule** | None — table-grid only | Standard DnD | 30-min default | Improving; not power-user-grade |

### UX primitives — your defaults

- **Minimum block height:** 24 px = 15 minutes at a 96 px/hour zoom. Below that, density harms legibility.
- **Snapping interval:** 15-min default, hold `Alt` to drop to 5-min. Never expose 1-min precision in the UI (it's a tasteless rounding error generator).
- **Overlap rendering:** side-by-side columns with proportional width (Cal/Notion Calendar); never stack vertically inside a single column — it breaks the spatial-time mapping.
- **"Now" indicator:** 2 px red line spanning the day column, updated every 30 seconds via `hx-trigger="every 30s"` on an oob-swapped element.
- **Working-hours masking:** dim 22:00–06:00 to 40% opacity; don't hide — sometimes you do schedule there.
- **Focus mode:** keyboard `F` collapses sidebar, hides past, fades non-current-block events to 30%.

### The headline differentiator: empty slots as first-class entities

Concretely, Kairos should render each gap ≥ a user-configurable minimum (default 15 min) as a dashed-border ghost block with hover affordance and a click/drag drop-target. Algorithm to rank a slot's "schedulability" for surfacing in a "best free slots" panel:

```
score(slot) =
    (slot.duration_minutes >= task.estimated_minutes ? 1 : 0)                       -- hard filter
  * w_tod * time_of_day_preference(slot.start, task.energy_profile)                  -- 0..1
  * w_buf * min(1, slot.start - prev_event.end) / desired_buffer_minutes             -- pre-buffer
  * w_buf * min(1, next_event.start - slot.end) / desired_buffer_minutes             -- post-buffer
  * w_wh  * (slot inside working_hours ? 1 : 0.2)                                    -- working-hours
  * w_dnd * (slot intersects DND ? 0 : 1)                                            -- DND windows
```

`time_of_day_preference` is a per-task or per-tag bias function (morning ∈ [0.6, 1.0] for "deep work" tags, afternoon for "shallow" tags). Reclaim's defrag does effectively this with proprietary weights; Motion adds a global re-solve every time the calendar changes. For v1, compute the score in C# after pulling the free-slot rows from Postgres — it's a handful of rows on a single day, the cost is sub-ms.

---

## Part 2 — 1-Feature MVP Spec

### The single MVP feature

> **Vertical schedule view rendering a single day at 15-min granularity, showing real Google Calendar busy events alongside Kairos tasks. Free slots ≥ 15 min are rendered as draggable, droppable targets. A task in the sidebar can be dragged into any free slot and persists to Postgres on drop.**

That's it. No multi-day view yet (slice 2). No recurring tasks yet (slice 5). No notifications.

### Performance budgets (NFRs)

| Budget | Target | Measurement | Enforced where |
|---|---|---|---|
| TTI cold (first visit, empty caches) | ≤ 800 ms | Chrome DevTools Performance / Lighthouse on loopback | k6 + Playwright in CI; OTel histogram on `page_load` event |
| TTI warm (cached assets) | ≤ 150 ms | Same | Same |
| Schedule view first paint | ≤ 200 ms | OTel custom span `schedule.render` from request to last byte | Prod monitor (Grafana alert >300 ms p95) |
| htmx partial swap (server time) | p95 ≤ 50 ms, p99 ≤ 120 ms | OTel ASP.NET Core instrumentation; trace per `hx-request` | Both: load test (k6) + Prom alert |
| Postgres "events in [t1,t2]" | p95 ≤ 5 ms, p99 ≤ 15 ms | `pg_stat_statements` + `auto_explain` (>50 ms logs full plan) | Prom histogram from Npgsql `command.duration` |
| Free-slots query (single day) | p95 ≤ 10 ms | Same | Same |
| Drag frame budget | ≤ 16.67 ms (60 fps) | Chrome DevTools Performance recording; `requestAnimationFrame` self-instrumentation | Manual benchmark, not CI |
| Input latency drag start → ghost | ≤ 50 ms | Chrome DevTools Interaction-to-Next-Paint | Manual benchmark |
| Drop → persisted DB row | ≤ 100 ms end-to-end on loopback | E2E Playwright trace; OTel span `task.reschedule` | CI Playwright budget; Prom alert |
| Google sync lag (event change → visible in Kairos) | ≤ 5 min + 25% jitter | Custom metric `gcal_sync_lag_seconds` | Grafana alert >7 min |
| Memory steady-state (ASP.NET worker) | ≤ 300 MB RSS | `dotnet-counters`; container memory metric | Compose `mem_limit: 512m`; alert if hit |

### Offline behavior

On a single-machine self-hosted compose, "offline" means three distinct failure modes:

1. **Google Calendar API down or token-expired.** Schedule view continues to render last-synced data; show a non-blocking banner "Last synced X min ago — Google unreachable." Tasks created locally persist normally.
2. **Browser ↔ local server (loopback) fails.** This only happens when Docker Desktop is down. There's nothing useful to do — show the standard browser offline screen.
3. **Postgres down.** Schedule view returns 503; ASP.NET should fail fast (no in-memory fallback — confusing and lossy).

No service worker, no IndexedDB cache, no CRDTs. **Local-first is overkill for a localhost-only app.**

### Backup & durability

- Postgres data lives in a named Docker volume (`kairos_pgdata`). Bind-mount it under `%USERPROFILE%\KairosData\pg` on Windows for visibility.
- Cron job (Windows Task Scheduler or a sidecar `kairos-backup` container) runs `pg_dump -Fc kairos > %BACKUP_DIR%\kairos-$(Get-Date -Format yyyyMMdd-HHmm).dump` nightly.
- Retention: 14 daily, 8 weekly, 12 monthly via a small PowerShell script.
- **Restore drill in your bootstrapping checklist.** Spin a throwaway compose, `pg_restore -d kairos backup.dump`, confirm tasks reappear. If you don't do this once, you don't have backups.
- For attachments (slice N+1): bind-mount a `kairos_files` volume; tar+gzip nightly.

### Keyboard-first interaction (Vim/Notion/Linear-flavored)

| Key | Action | Convention source |
|---|---|---|
| `j` / `↓` | Next day (in single-day view, scroll down 1h) | Vim |
| `k` / `↑` | Previous day (scroll up 1h) | Vim |
| `h` / `l` | Previous / next hour | Vim |
| `T` | Jump to today | Notion Calendar |
| `G` | Open "Go to date" picker | Vim line-jump |
| `N` | New task at cursor time | Linear "create" |
| `E` | Edit selected event/task | Linear |
| `X` / `Backspace` | Delete selected | Linear "X" |
| `/` | Focus search | Vim/Slack/GitHub |
| `?` | Show keyboard cheatsheet overlay | Notion Calendar / GitHub |
| `1`–`9` | Switch to N-day view (1=today, 7=week) | Notion Calendar |
| `Cmd/Ctrl + K` | Command palette | Linear/Notion |
| `Shift + drag` | Resize without snapping | Standard |
| `Alt + drag` | 5-min snap (vs default 15) | Common CAD convention |
| `F` | Focus mode toggle | Akiflow |

Implementation: Alpine.js `x-on:keydown.window` at the page root dispatches to handlers; modifier-key state for Shift/Alt drag is held in `Alpine.store('drag')`.

### Observability minimum

**Worth it (single-user, but you'll thank yourself):**
- OTel ASP.NET Core auto-instrumentation → Tempo for traces.
- Custom span `schedule.render`, `freeslots.compute`, `gcal.sync.cycle`.
- Metrics: `kairos_htmx_partial_swap_seconds` (histogram), `kairos_postgres_query_seconds`, `kairos_gcal_sync_lag_seconds`, `kairos_active_tasks`.
- `auto_explain.log_min_duration = 50ms` on Postgres → Loki via the postgres-exporter sidecar.
- Aspire Dashboard in dev only (`ASPNETCORE_ENVIRONMENT=Development`).

**Overkill:**
- RED metrics per endpoint (you have ~12 endpoints).
- Distributed tracing fan-out (it's two processes).
- Log aggregation across services (use Postgres logs directly; Loki is nice-to-have, not need-to-have).

### Explicit deferrals (with reasoning)

| Deferred | Why |
|---|---|
| Auth | Single-user behind `127.0.0.1`. If you ever expose beyond loopback, add OIDC via Keycloak in compose. |
| Multi-user / sharing | The schema can support it later (add `user_id`), but every UI affordance gets simpler without it. |
| Mobile / responsive | The schedule view is a workstation tool; mobile is a *different* UX (agenda list, not vertical grid). Build it as a separate Razor Page in a later slice. |
| Notifications | Browser notifications require HTTPS and user gesture; system notifications require platform glue. Email notifications require SMTP secrets. Defer until v1.1. |
| Push-based Google sync (`events.watch`) | Requires public HTTPS endpoint with valid (non-self-signed) cert; channels expire weekly; payload carries no event data anyway. Polling wins. |
| AOT compilation | EF Core's AOT story is incomplete in .NET 10; Razor compilation has its own AOT quirks. ReadyToRun + tiered compilation gets you 80% of the win. |
| Real-time multi-tab sync | If you have two tabs open, last-write-wins is fine. SignalR for one user is overkill. |
| CRDTs | Single-machine single-user. Confirmed overkill. |

---

## Part 3 — Architecture (within the locked stack, with rejected alternatives)

### Component diagram

```mermaid
flowchart LR
    subgraph Browser["Browser (Chrome on Windows 11)"]
        UI[Razor-rendered HTML]
        HTMX[htmx 2.x]
        Alpine[Alpine.js<br/>keybindings, modal state]
        Sortable[SortableJS<br/>drag layer / island]
    end

    subgraph Compose["Docker Compose (loopback)"]
        subgraph App["ASP.NET Core (.NET 10)"]
            Razor[Razor Pages]
            MinAPI[Minimal APIs<br/>/api/tasks, /api/slots]
            MCP[MCP server endpoint<br/>/mcp via Streamable HTTP]
            Sync[Hosted service:<br/>GoogleCalendarSyncWorker]
            EF[EF Core 10 + Npgsql]
        end
        PG[(Postgres 17<br/>+ btree_gist + auto_explain)]
        Otel[OTel Collector]
        subgraph Obs["Observability (dev/optional)"]
            Prom[Prometheus]
            Loki[Loki]
            Tempo[Tempo]
            Graf[Grafana]
        end
    end

    External[(Google Calendar API v3)]

    UI -->|hx-get/hx-post| Razor
    HTMX -.->|swap-oob events| UI
    Sortable -->|hx-post /api/tasks/{id}/reschedule on drop| MinAPI
    Alpine -.->|keyboard intents| HTMX
    Razor --> EF
    MinAPI --> EF
    MCP --> EF
    EF --> PG
    Sync -->|events.list<br/>+ syncToken poll 5min ±25%| External
    Sync --> EF
    App -->|OTLP| Otel
    Otel --> Prom & Loki & Tempo
    Prom & Loki & Tempo --> Graf
```

### Rendering approach — verdict & rejected alternatives

**Chosen: htmx + Razor Pages + small SortableJS island for the day column.**

- 96 slots × 7 days = 672 DOM nodes per week view. No virtualization needed.
- Server-driven swap latency on loopback measured for similar workloads: ~5–15 ms for the Razor render + ~5 ms network = well under your 50 ms p95 target.
- Drag interactions never round-trip per-pixel. Sortable.js handles the visual transform; htmx fires *only* on `end` event with a single POST.
- `hx-swap-oob` updates both the source slot (empty) and target slot (filled) atomically in one response. The free-slots panel is also oob-refreshed.

**Rejected: Blazor United (Server interactive + WASM auto).**

- Auto-mode hydration switching is fragile in .NET 10: `dotnet/aspnetcore#53799` (Auto fails to switch from Server to WASM when navigating) and `#64637` (with prerendering off, never switches at all) are open.
- For a drag-heavy UI, you'd run with `@rendermode InteractiveServer`, meaning **every drag-pixel is a SignalR message** over a WebSocket. This is the textbook anti-pattern for low-latency drag.
- WASM-only avoids the WebSocket fan-out but introduces a multi-MB initial download for a localhost app where you control everything anyway.
- Adds Blazor's JS interop layer for the drag library you still need — net-net more complex than htmx + Sortable.

**Rejected: React + Vite + Minimal API (or @tanstack/virtual + react-window).**

- For 672 DOM nodes, virtualization buys nothing.
- Adds a second build pipeline, two languages, two state models, and zero capability you didn't already have.
- Valid only if your design system required heavy reusable React components — Kairos doesn't.

**Rejected: Full WebAssembly client (Blazor WASM standalone).**

- Same as Blazor WASM above. Plus, MCP and EF must live server-side, so you'd be shuttling everything over fetch anyway.

### Drag-and-drop with htmx specifically

Code sketch (Razor view fragment for a day column):

```html
<div id="day-2026-06-01"
     class="sortable-day"
     data-date="2026-06-01"
     hx-post="/api/days/2026-06-01/reschedule"
     hx-trigger="kairos:dropped"
     hx-include="this"
     hx-swap="outerHTML">
  @foreach (var slot in Model.Slots)
  {
    @if (slot.IsBusy)
    {
      <div class="event filled" data-id="@slot.Id" style="top:@(slot.TopPx)px; height:@(slot.HeightPx)px">
        @slot.Title
      </div>
    }
    else
    {
      <div class="event empty draggable-target"
           data-start="@slot.Start.ToString("O")"
           data-end="@slot.End.ToString("O")"
           style="top:@(slot.TopPx)px; height:@(slot.HeightPx)px"></div>
    }
  }
</div>

<script>
  htmx.onLoad(c => {
    c.querySelectorAll('.sortable-day').forEach(el => {
      new Sortable(el, {
        animation: 120,
        ghostClass: 'drag-ghost',
        onEnd: e => htmx.trigger(e.to, 'kairos:dropped', { taskId: e.item.dataset.id })
      });
    });
  });
</script>
```

Server response uses `hx-swap-oob` to refresh both the source column (if cross-day drag) and the free-slots side panel:

```html
<!-- main target -->
<div id="day-2026-06-01" class="sortable-day">…rebuilt…</div>

<!-- oob updates -->
<div id="day-2026-05-31" hx-swap-oob="true" class="sortable-day">…rebuilt…</div>
<aside id="freeslots-panel" hx-swap-oob="true">…top-3 slots…</aside>
```

**Anti-patterns to avoid (called out explicitly):**

- ❌ Round-tripping every drag pixel via SSE/SignalR. You're not building Figma.
- ❌ Full-page htmx swap on drop. Use targeted `hx-target` + `hx-swap-oob`.
- ❌ N+1 EF queries when rebuilding the day column (use `AsSplitQuery` + projection).
- ❌ Loading "all events ever" on schedule open — always bound by the current view window.
- ❌ Letting the Aspire Dashboard run in your single-user prod compose. Strip it.

### Postgres schema and queries

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text,
  estimate_min int  NOT NULL DEFAULT 30,
  tags         text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE scheduled_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid REFERENCES tasks(id) ON DELETE CASCADE,
  source      text NOT NULL CHECK (source IN ('kairos','gcal')),
  external_id text,                       -- gcal event id when source='gcal'
  start_ts    timestamptz NOT NULL,
  end_ts      timestamptz NOT NULL,
  during      tstzrange GENERATED ALWAYS AS (tstzrange(start_ts, end_ts, '[)')) STORED,
  rrule       text,                       -- icalendar RRULE for recurring kairos blocks
  CHECK (end_ts > start_ts)
);

CREATE INDEX idx_blocks_during_gist ON scheduled_blocks USING GIST (during);
CREATE INDEX idx_blocks_source ON scheduled_blocks (source);
CREATE INDEX idx_blocks_external ON scheduled_blocks (source, external_id) WHERE external_id IS NOT NULL;

-- Enforce no overlapping Kairos blocks (gcal can overlap; your own should not)
ALTER TABLE scheduled_blocks
  ADD CONSTRAINT no_overlap_kairos
  EXCLUDE USING GIST (during WITH &&) WHERE (source = 'kairos');
```

**Events overlapping a window** (the hot query):

```sql
SELECT * FROM scheduled_blocks
WHERE during && tstzrange($1, $2, '[)')
ORDER BY start_ts;
```

GiST index lookup at 10k–100k rows is sub-millisecond; a 10M-row containment demo dropped from ~6 s to ~10 ms with a GiST bitmap index scan, so at your scale this is comfortably within budget.

**Free slots for a single day in a working window — Postgres 14+ multirange version (the right answer):**

```sql
WITH busy AS (
  SELECT range_agg(during)::tstzmultirange AS busy_mr
  FROM scheduled_blocks
  WHERE during && tstzrange($day_start, $day_end, '[)')
),
working AS (
  SELECT multirange(tstzrange($work_start, $work_end, '[)')) AS work_mr
)
SELECT unnest(work_mr - COALESCE(busy_mr, '{}'::tstzmultirange)) AS free_slot
FROM busy, working;
```

That's the entire free-slot detection. Multirange difference is the conceptually right operator and is endorsed by `range_agg`'s original author, Paul A. Jungwirth.

**Pre-PG14 fallback** — overlap-tolerant gaps-and-islands (use the `MAX(end) OVER (... 1 PRECEDING)` form per Bert Wagner, not naive `LAG()`, so overlapping events don't produce phantom gaps), with the working-window sentinel-padding trick per Aijaz Ansari:

```sql
WITH ordered AS (
  SELECT start_ts, end_ts,
         MAX(end_ts) OVER (
           ORDER BY start_ts, end_ts
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ) AS prev_end
  FROM scheduled_blocks
  WHERE during && tstzrange($day_start, $day_end, '[)')
  UNION ALL SELECT $work_start, $work_start, NULL  -- sentinel lower
  UNION ALL SELECT $work_end,   $work_end,   NULL  -- sentinel upper
)
SELECT prev_end AS gap_start, start_ts AS gap_end
FROM ordered
WHERE prev_end IS NOT NULL
  AND start_ts > prev_end
  AND start_ts - prev_end >= interval '15 minutes';
```

**Recurring events (Kairos-internal):** store `rrule` as text on `scheduled_blocks`, do **not** pre-expand into rows. Expand on read for the requested window using a tiny in-process iCal library (`Ical.Net` 4.x). For Google-sourced events, request with `singleEvents=true` so Google does the expansion server-side — much simpler than handling EXDATE/RDATE yourself, and avoids the 410-Gone pitfalls of mixing `syncToken` with custom expansion.

**Timezone:** always UTC `timestamptz` in storage; render in the user's IANA zone in the Razor layer. Npgsql maps `tstzrange` to `NpgsqlRange<DateTime>` natively, so the EF Core entity can carry the range without raw SQL gymnastics.

**Planner pitfall to watch:** there is a documented planner cardinality underestimate on EXCLUDE-implicit GiST indexes when bulk-joining busy ranges; if you ever see a regression, the multirange `range_agg` approach sidesteps it, and `SET LOCAL enable_nestloop = off` is the surgical mitigation for the affected query.

### State, sync, persistence

- **EF Core 10 patterns:** `AsNoTracking` by default on read paths (`builder.Services.AddDbContext<KairosDb>(o => o.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking))`); explicit `.AsSplitQuery()` only when projecting blocks+tasks together; compiled queries (`EF.CompileAsyncQuery`) for the two or three hot queries (day-window fetch, free-slots, single-task-by-id).
- **Npgsql connection pooling:** default min/max pool of 0/100 is fine for single user; set `MaxAutoPrepare=20` and `AutoPrepareMinUsages=2` so the GiST-overlap query gets a prepared plan.
- **Caching:** none. You're querying single-digit milliseconds against an indexed table on the same loopback. Output caching is a net negative because it complicates invalidation on every drop.

### Hosting & latency

- **Kestrel on loopback** with HTTP/2 over plaintext (`h2c`) inside compose; the browser sees HTTPS via the front-end reverse proxy (Caddy or YARP, both fine).
- **HTTP/3 / QUIC**: irrelevant on loopback. Don't bother.
- **Response compression**: enable Brotli for static, gzip for HTML. ASP.NET Core 10's `MapStaticAssets` does build-time Brotli for JS/CSS automatically — published Syncfusion benchmarks show the default Razor Pages template dropping from 331.1 KB to 65.5 KB (–80.20%); component libraries see more (Fluent UI Blazor 478 KB → 84 KB, –82.43%; MudBlazor 588.4 KB → 46.7 KB, –92.07%).
- **Vite asset pipeline**: hash-fingerprinted output to `wwwroot/dist/`, `Cache-Control: public, max-age=31536000, immutable` for hashed bundles. Reference via `vite-manifest.json` from Razor.
- **Aspire `aspire publish`** generates the `docker-compose.yml` + `.env` from your AppHost.

### .NET 10 / Aspire-specific perf

- **AOT publishing (`PublishAot`)**: **don't** for v1. EF Core isn't AOT-compatible without significant friction; cold-start gains (Microsoft-reported AOT app startup 5–30 ms vs JIT 250–500 ms; ~20–40 MB binaries vs ~200 MB containerized runtime) don't matter for an always-on local container that you start once a week.
- **ReadyToRun + tiered compilation**: enabled by default in .NET 10 SDK; keep them.
- **Server GC** in container: explicit `<ServerGarbageCollection>true</ServerGarbageCollection>` because Docker containers historically misdetect core count. Workstation GC is wrong for a server process.
- **System.Text.Json source generators**: use `[JsonSerializable(typeof(TaskDto))]` for the small set of API DTOs; saves ~5 ms first-call latency.
- **Minimal APIs vs MVC controllers**: Minimal APIs benchmark faster than controllers on identical workloads in .NET 10 (Microsoft's TechEmpower-class Stage1 app handles ~800–900 K req/s on Linux 28-core hardware; you'll never approach this, but the per-request overhead delta still helps p99). Use them for `/api/*` and `/mcp`. Use Razor Pages for HTML responses (they coexist peacefully).
- **`IAsyncEnumerable<T>` streaming**: relevant only for the (not-MVP) "all tasks export" endpoint.
- **Aspire dashboard**: dev-only. In prod compose, remove the `WithDashboard()` call or guard with `if (builder.ExecutionContext.IsRunMode)`.

### Google Calendar integration (the locked override)

- **OAuth flow:** installed-app flow (loopback redirect to `http://127.0.0.1:5000/oauth/callback`). Web-app flow is wrong — there's no public URL.
- **Token storage:** EF-managed `oauth_tokens` table, `access_token` and `refresh_token` encrypted at rest with ASP.NET Data Protection keys persisted to a mounted volume (`%USERPROFILE%\KairosData\dpkeys`). **Do not** stash in env vars or `appsettings.json` — refresh tokens rotate.
- **Scope:** `https://www.googleapis.com/auth/calendar.events.readonly` only. Minimum-privilege; you can request `calendar.events` later if you add write-back.
- **`google-api-dotnet-client` / `Google.Apis.Calendar.v3`:** mature, fully async via `ExecuteAsync()`. The client transparently handles refresh-token refresh via `IDataStore`. Gotcha: `Events.List(...).SyncToken` and `TimeMin`/`TimeMax` are mutually exclusive — picking one for the initial bound and the other for incremental sync is **a 400 Bad Request the first time you try it**. Google's docs explicitly note this restriction.
- **Sync state machine:**
  ```
  No token  → events.list(timeMin=-30d, timeMax=+90d, singleEvents=true, pageToken loop)
            → store nextSyncToken
  Has token → events.list(syncToken, pageToken loop)
            → store nextSyncToken
            → on 410 Gone → drop local rows, fall back to no-token path
  ```
  `nextSyncToken` only appears on the last page of results; pagination must complete before the token is valid.
- **Cadence:** 5 minutes ± 25% jitter (~288 calls/day). Google's published quota is **600 requests/minute per user per project** and **1,000,000 requests/day per project** (as of the May 1, 2026 quota refresh), so you're roughly 3,500× under the daily threshold and not even within shouting distance of the per-minute cap.
- **Webhooks (`events.watch`):** explicitly deferred. Requirements that kill it for v1:
  - HTTPS endpoint with a valid (not self-signed) certificate.
  - Channels expire (Google's docs cap them in the days-to-week range and there's no auto-renewal — you must replace them by calling `watch` again before expiration).
  - Notification payload contains no event data — you still call `events.list` with a `syncToken` after the ping. The benefit is latency (~seconds vs ~minutes), not bandwidth.
  - Behind home NAT, you need a tunnel (ngrok / cloudflared) or port-forwarding. Not worth it for v1.
- **Recurring / all-day / cancelled / exception instances:** request with `singleEvents=true` and Google expands the recurrence server-side, including cancellations (which arrive with `status: "cancelled"` so you can soft-delete locally). All-day events come with `start.date`/`end.date` (no time) — store as a separate row type or expand to `[00:00, 24:00)` of the day in user TZ.
- **Rate-limit handling:** treat 403 with `Reason: rateLimitExceeded` and 429 the same — exponential backoff (1 s, 2 s, 4 s, 8 s, cap 64 s) with full jitter; OTel counter `kairos_gcal_rate_limited_total`. Google's guidance explicitly recommends spreading load (random offsets per client, ±25% interval variance) to avoid the "everyone polls at midnight" anti-pattern.

### MCP server endpoint

```csharp
// Program.cs
builder.Services.AddMcpServer()
    .WithHttpTransport()                       // Streamable HTTP + SSE
    .WithToolsFromAssembly();

app.MapMcp("/mcp");
```

```csharp
[McpServerToolType]
public static class TaskTools
{
    [McpServerTool, Description("Create a task in Kairos.")]
    public static async Task<TaskDto> CreateTask(
        KairosDb db, string title, int estimateMin = 30, string[]? tags = null)
    { /* … */ }

    [McpServerTool, Description("Return free slots ≥ minMinutes between t1 and t2.")]
    public static async Task<FreeSlot[]> ListFreeSlots(
        KairosDb db, DateTimeOffset t1, DateTimeOffset t2, int minMinutes = 15)
    { /* run the multirange SQL */ }

    [McpServerTool, Description("Schedule an existing task into a slot.")]
    public static async Task<ScheduledBlockDto> RescheduleTask(
        KairosDb db, Guid taskId, DateTimeOffset start, DateTimeOffset end)
    { /* … */ }
}
```

That's the entire MCP surface for v1. The official C# SDK (NuGet `ModelContextProtocol` 1.x, maintained by Microsoft + Anthropic) handles JSON-RPC framing, tool discovery, and Streamable HTTP transport via `ModelContextProtocol.AspNetCore`.

---

## Part 4 — Reference Architectures & Prior Art

- **Open-source self-hosted task managers built on similar shapes:**
  - **Vikunja** (Go + Vue, AGPLv3) — closest analog for self-hosted task management; exposes a REST API and CalDAV. Worth studying its REST API surface; UI is kanban-first, not time-blocked.
  - **Cal.com** (Next.js, AGPL) — different domain (booking links) but excellent open-source patterns for OAuth, recurrence, timezone handling.
  - **Rallly** (Next.js) — simpler scheduling; useful as a "what minimum looks like" reference.

- **htmx-on-calendar production references:**
  - Jonathan Lahijani's **HTMX Event Calendar** (Geffen Playhouse, ProcessWire/PHP backend) — pure htmx + CSS Grid replacing a FullCalendar v4 setup; the author calls out FullCalendar's anti-pattern of "passing HTML so each date would be rendered according to Geffen Playhouse's calendar guidelines… while this felt like a hack and went against the way FullCalendar was 'expected' to receive event content, it worked nevertheless." Proves the architecture works *without* a JS island for navigation/render.
  - **`ewrogers/hyper-calendar`** (Hono+Bun) — open-source htmx calendar; advertises "No additional JavaScript or 'SPA' frontend is required! All interactivity is handled by the server and HTMX + Hyperscript."
  - **Bryntum + htmx integration blog** — commercial scheduler used alongside htmx for ancillary CRUD panels. Confirms that **drag-heavy** calendar UIs typically keep a JS scheduling layer; useful for setting expectations.

- **htmx production case studies (htmx.org/essays/):**
  - **"A Real World React → htmx Port"** (Contexte, presented at DjangoCon 2022 by David Guillot): 21 K LOC React → 7.2 K LOC htmx — htmx.org reports they "reduced the code base size by 67% (21,500 LOC to 7200 LOC)", "reduced their total JS dependencies by 96% (255 to 9)", "reduced their web build time by 88% (40 seconds to 5)", "First load time-to-interactive was reduced by 50–60% (from 2 to 6 seconds to 1 to 2 seconds)", and "Web application memory usage was reduced by 46% (75MB to 45MB)". **The single most credible production datapoint.**
  - "Another Real World React → htmx Port" (OpenUnited).
  - "Next.js to htmx — A Real World Example" (Pouria Ezzati).

- **htmx + ASP.NET Core authoritative voices:**
  - **Khalid Abuhakmeh** (JetBrains DA) — `Htmx.Net` NuGet + JetBrains Guide. Canonical pattern: `return Request.IsHtmx() ? Partial("_Form", this) : Page();` plus an HX-Trigger header pattern. Explicit warning on chatty triggers: "each triggered event results in a request back to the server, which could come at a cost."
  - **`aspnet-htmx.com`** book — chapter on hx-swap-oob and scoped updates is the best reference for the partial-swap patterns Kairos needs.

- **Carson Gross's "when not to use htmx" position** ("When Should You Use Hypermedia?", htmx.org/essays/when-to-use-hypermedia/): htmx is wrong when (a) your UI is genuinely an offline-first canvas (Figma, Photoshop web), (b) state is heavily client-derived and not URL-shaped (large graphs, real-time multi-cursor), (c) you need rich client component libraries you can't reimplement. **Kairos doesn't trip any of these.**

- **htmx + drag-and-drop specifically:**
  - The htmx.org/examples/sortable example pairs htmx with **Sortable.js** triggered on `onEnd` — this *is* the official recipe. (See the Drag-and-Drop with htmx section above for the Razor adaptation.)
  - The third-party **`AjaniBilby/hx-drag`** extension notes that htmx's native sorting "relies on client side execution, plus does not allow for more rich interactions like dragging an item from one group to another triggering a server side update" and offers a sync-hash pattern (`hx-include` + `hx-swap-oob`) for detecting stale client state and forcing a reload via the `hx-location` header.

- **Postgres temporal patterns (named sources):**
  - **PostgreSQL official docs §8.17** — `tstzrange`/`tstzmultirange`, the operators GiST accelerates (`=, &&, <@, @>, <<, >>, -|-, &<, &>`), and the canonical `EXCLUDE USING GIST (... WITH &&)` exclusion-constraint pattern.
  - **boringSQL (Radim Marek), "Beyond Start and End: PostgreSQL Range Types"** — multirange and `range_agg` patterns Kairos uses; verdict: "Most applications should just use GiST and move on. The performance difference rarely matters until you're dealing with millions of rows and very specific query patterns. Don't prematurely optimize - GiST is the safe, versatile default."
  - **Oxilor, "How best to store date ranges in PostgreSQL"** — 1 M-row benchmark comparing B-tree on start/end vs GiST on `tstzrange` vs SP-GiST.
  - **Paul A. Jungwirth** (`range_agg` extension author, predecessor to PG14's builtin) — explicitly endorses the LEAD-window approach and the merge-with-gaps approach now built in.
  - **Bert Wagner, "Gaps and Islands Across Overlapping Date Ranges"** — the `MAX(end) OVER (... 1 PRECEDING)` formulation used in our pre-PG14 fallback.
  - **Aijaz Ansari, "Finding gaps in time intervals in SQL"** — sentinel-padding-the-working-window technique used above.
  - **End Point Dev, Josh Tolley, "Detecting gaps in time-series data in PostgreSQL"** — gaps-and-islands LATERAL antijoin recipe.
  - **Better Stack, "Temporal Constraints in PostgreSQL 18"** — documents the new `WITHOUT OVERLAPS` clause for primary keys and the `PERIOD` clause for temporal foreign keys, a cleaner future migration than today's EXCLUDE pattern.

- **Known anti-patterns to avoid (sourced):**
  - **Polling every minute per calendar.** Google's quota docs: "if your application has 5,000 users and polls each user's calendar once a minute, then this requires a per-minute quota of at least 5,000, even before any work is done."
  - **Bursty midnight sync.** Google docs: "a common bad practice for a Calendar client is to perform a full sync at midnight. This would almost certainly lead to exceeding your per-minute quota… vary the interval +/- 25%."
  - **Stacking events vertically inside one column** (breaks spatial-time mapping).
  - **SignalR per drag-pixel** (Blazor Server anti-pattern).
  - **Full-page htmx swaps on drop** (lose scroll position, defeat the point of partial swap).
  - **N+1 EF queries on event load** (use `.Include().AsSplitQuery()` or projection).
  - **Premature `PublishAot`** (loses EF Core).
  - **Fetching all events on schedule open** (always bound to current view window).
  - **Storing OAuth refresh tokens in env vars** (rotation breaks them).
  - **Mixing `timeMin` and `syncToken` in the same Google Calendar request** (400 Bad Request).
  - **Running the Aspire Dashboard in prod compose** (dev-only tool).

---

## Part 5 — Deliverables

### 1. Recommended MVP feature spec

**The single feature:** Vertical schedule view, single day, 15-min slots, rendering Google Calendar busy events + Kairos tasks. Free slots ≥ 15 min are first-class draggable drop targets. Tasks from a sidebar can be dragged into any free slot; on drop, the slot fills, the source clears, the free-slots panel re-ranks. All keyboard-driven: `N` creates a task at cursor time, `T` jumps to today, `/` searches.

**Concrete NFRs** — see the Performance Budgets table in §2 and the consolidated table below.

### 2. Recommended architecture

See the Mermaid diagram in §3. Stack: Razor Pages (HTML) + Minimal APIs (`/api/*`, `/mcp`) + htmx 2.x + Alpine.js (keybindings) + SortableJS (drag island) + Tailwind + Vite + EF Core 10 + Npgsql + Postgres 17 (multiranges) + Aspire orchestration + OTel → Prom/Loki/Tempo/Grafana (dev), pared-down OTel-to-disk (prod).

**Rejected alternatives:**

- **Blazor United (Server interactive + WASM auto).** Drag-heavy UI under Server mode means per-pixel SignalR; under Auto mode hydration switching is flaky (`#53799`, `#64637`); WASM-only adds multi-MB download for a localhost app. Loss: complexity + WebSocket-per-drag latency.
- **React + Vite + Minimal API.** Second build pipeline, second state model, no virtualization need at <700 nodes. Loss: zero unique capability at +1 language and +1 ecosystem.
- **Full WebAssembly client (Blazor WASM standalone).** Same as above. Loss: MCP/EF stay server-side anyway; you're inventing an unnecessary boundary.

### 3. Performance budget table (consolidated)

| # | Budget | Target | Measurement (tool/metric) | Enforcement |
|---|---|---|---|---|
| 1 | TTI cold | ≤ 800 ms | Lighthouse + Playwright on `chrome --headless` | CI gate |
| 2 | TTI warm | ≤ 150 ms | Same | CI gate |
| 3 | Schedule first paint | ≤ 200 ms | OTel `schedule.render` span | Prod monitor (Grafana alert) |
| 4 | htmx partial swap (server) | p95 ≤ 50 ms / p99 ≤ 120 ms | OTel `http.server.duration{route=…}` | k6 load test in CI + Prom alert |
| 5 | Postgres "events in window" | p95 ≤ 5 ms / p99 ≤ 15 ms | `pg_stat_statements`, Npgsql duration histogram | Prom alert; `auto_explain` >50 ms |
| 6 | Free-slots query | p95 ≤ 10 ms | Same | Same |
| 7 | Drag frame budget | ≤ 16.67 ms | Chrome DevTools Performance | Manual benchmark per release |
| 8 | Input latency (drag start) | ≤ 50 ms | INP via web-vitals.js | OTel custom metric, manual gate |
| 9 | Drop → DB persisted | ≤ 100 ms loopback | Playwright trace + OTel `task.reschedule` span | CI Playwright gate |
| 10 | Google sync lag | ≤ 5 min + 25% jitter | `gcal_sync_lag_seconds` gauge | Grafana alert >7 min |
| 11 | Memory steady-state | ≤ 300 MB RSS | `dotnet-counters process-memory`; container mem stat | Compose `mem_limit:512m` |
| 12 | DOM nodes per view | ≤ 1500 | Chrome DevTools Memory | Manual review |
| 13 | Initial JS payload (gzipped) | ≤ 80 KB | Vite build report | CI gate on bundle size |
| 14 | Static asset Cache-Control | `immutable, max-age=31536000` on hashed | Curl headers test | Smoke test |
| 15 | OAuth token refresh failure rate | < 0.1% | Counter `kairos_gcal_token_refresh_failed_total` | Grafana alert |

### 4. Risk list — top 5 + mitigations

1. **Drag latency feels janky.**
   - Cause: doing anything on the server during drag.
   - Mitigation: SortableJS handles all drag visuals (CSS transforms), no htmx events fire until `onEnd`. Pre-load 7 days of data so dropping into off-screen days doesn't roundtrip for context. Use `will-change: transform` on draggable elements. Profile with Chrome DevTools and confirm <16.67 ms frame.

2. **Recurring event expansion blows up.**
   - Cause: a single "daily forever" RRULE expanded for a year = 365 rows; a year of weekly meetings × 5 calendars = thousands.
   - Mitigation: never pre-expand into the database. For Google events, request `singleEvents=true` and let Google expand server-side (within their windows). For Kairos-native recurring blocks, expand on read via `Ical.Net` *only for the requested window*, cache the expansion in memory (`IMemoryCache` 30 s TTL keyed by `(rrule_hash, window)`).

3. **Google sync lag / token expiry / 410-Gone cascades.**
   - Cause: sync tokens expire, `singleEvents` mismatch between full and incremental sync, rate-limit bursts at fixed cron times.
   - Mitigation: state machine in §3 with explicit 410 handler that drops local gcal rows and re-syncs. Jitter the poll interval ±25%. OTel counter for 410s and 429s with Grafana alert on >5 in 10 min. Keep the OAuth refresh token persisted to a mounted volume, not bind-only-to-container-disk.

4. **Postgres GiST query plan flips to nested-loop at scale.**
   - Cause: documented planner cardinality underestimate on exclusion-implicit GiST indexes when joining busy ranges against working windows.
   - Mitigation: ANALYZE the table after bulk inserts (sync ingest); for the free-slots query, use the multirange `range_agg` approach which sidesteps this issue. If you see degradation, `SET LOCAL enable_nestloop = off` for that query. Add `pg_stat_statements` and watch the GiST query's mean time.

5. **Aspire Dashboard / OTel collector noise dominates resource use in single-user prod compose.**
   - Cause: a full Prom+Loki+Tempo+Grafana+Dashboard stack can use more RAM than the app itself.
   - Mitigation: two compose files — `compose.dev.yml` (full obs stack + Aspire Dashboard) and `compose.prod.yml` (just OTel collector writing to local Prom + file-based logs). Use `aspire publish` profile flag to switch. Document a "minimum viable observability" runbook: `dotnet-counters monitor` + Postgres slow log = 90% of what a one-user app ever needs.

### 5. Build order — vertical slices (each demoable end-to-end)

**Slice 0 — Hello, Compose** (½ day)
- Aspire AppHost with web + Postgres.
- `aspire publish` → `compose.prod.yml`.
- "/" returns "Kairos v0" Razor page.
- Demo: `docker compose up`, browse to localhost, see the page. Backup script + restore drill rehearsed *now*.

**Slice 1 — Schedule view with hardcoded events** (2 days)
- Single day, 15-min slot grid, 96 rows.
- Hardcoded 3–4 events render as colored chips at correct positions.
- "Now" red line, refreshes every 30 s via `hx-trigger`.
- Working hours dimmed.
- Demo: scroll, see slot grid, hardcoded events line up.

**Slice 2 — Task CRUD + drop into slot** (3 days)
- `tasks` and `scheduled_blocks` tables.
- Sidebar lists unscheduled tasks; "N" creates a new task (Alpine modal).
- SortableJS island; drag task → drop on empty slot → POST → server inserts `scheduled_blocks` row → `hx-swap-oob` updates the day column and sidebar.
- Demo: create a task, drag onto a slot, refresh, task is still there.

**Slice 3 — Empty-slot detection + ranked free-slots panel** (2 days)
- Multirange SQL `free_slots(day, work_start, work_end, min_min)` function.
- Free slots rendered as dashed-border ghost blocks (drop targets).
- Side panel "Best 3 free slots" with the scoring algorithm in C#.
- "/" key surfaces panel; arrow keys select; Enter drops the focused task into the focused slot.
- Demo: a busy day, see the gaps highlighted; the side panel shows the top 3; keyboard-drop a task into one.

**Slice 4 — Google Calendar read-only sync** (3 days)
- OAuth installed-app flow; loopback redirect; encrypted token storage.
- `GoogleCalendarSyncWorker` `IHostedService` polling every 5 min ±25% with `syncToken` state machine.
- Gcal events render alongside Kairos blocks with distinct styling.
- Soft-delete on `status:cancelled`; 410-Gone recovery.
- Demo: connect a Google account, add an event in google.com/calendar, ~5 min later it appears in Kairos.

**Slice 5 — Recurring Kairos tasks** (2 days)
- RRULE on `scheduled_blocks`; `Ical.Net` expansion in the day-window query.
- Edit-this-instance vs edit-all-future (Notion convention).
- Demo: create a daily 8 AM block; see it for the next 30 days.

**Slice 6 — MCP endpoint** (1 day)
- `MapMcp("/mcp")` with the three tools above.
- Connect Claude/VS Code MCP client; ask "what free slots do I have tomorrow?" and "schedule 'Write report' for 1 h tomorrow morning."
- Demo: prove an AI agent can drive Kairos.

**Slice 7 — Observability hardening + week view** (2 days)
- 7-day view; `1`–`9` switch day count.
- OTel custom spans, metrics, Grafana dashboards.
- Performance test pass against the budgets table.
- Demo: open Grafana, see all 15 NFRs green.

Each slice ships behind a feature flag (`appsettings.json` boolean) so you can demo each independently. Use GitFlow with one feature branch per slice; merge to `develop`, tag a `v0.N` release on merge to `main` per slice.

---

## Recommendations (decision-ready)

- **Start today.** Build Slice 0 + Slice 1 in week one — these prove the Aspire→Compose flow and the htmx-rendered grid, the two highest-risk shape choices.
- **Confirm the stack at Slice 3.** If, after Slice 3, htmx swap p95 is > 80 ms on loopback or drag frames drop below 60 fps, that's your benchmark to seriously reconsider Blazor Server. Until then, don't.
- **Defer everything that doesn't make the day-column-with-empty-slots better.** Notifications, mobile, multi-user, shared calendars, AI auto-scheduling — every one of them is a Slice 8+ feature.
- **Adopt the multirange SQL approach. Make Postgres 14+ a hard floor.** If for any reason you have to run on PG13, the pre-PG14 fallback works but you'll regret it on every code review.
- **Pin `ModelContextProtocol` to a specific version in `csproj`.** The MCP spec and the C# SDK are both still moving.
- **Hold the Aspire Dashboard out of prod compose** from the very first commit. Easier than removing it later.

## Caveats

- **Latency numbers in §2 assume loopback.** If you ever expose Kairos beyond `127.0.0.1` (Tailscale, Cloudflare Tunnel), the htmx swap target is closer to p95 ≤ 80 ms because you eat real network — adjust your alert thresholds.
- **Multirange `range_agg` requires Postgres 14+.** The image you pull in compose should be `postgres:17-alpine` (current). Don't get clever and use older versions; the pre-14 gaps-and-islands query is dramatically uglier.
- **`Ical.Net` 4.x has known edge-case bugs around DST transitions and EXDATE handling.** Test recurring blocks across a daylight-saving boundary explicitly.
- **Notion Calendar / Cron is a Google-only client today** — they declined Outlook/Apple support deliberately. Don't read their absence of Microsoft Graph as a signal Graph is bad; it's just their product choice.
- **The Contexte React→htmx case-study numbers (67% LOC reduction, 46% memory reduction, 50–60% TTI reduction, 88% build-time reduction, 96% JS-dep reduction) are a single project published on htmx.org's marketing-adjacent essays page.** Treat as directional evidence htmx is *plausible*, not proof you'll see the same ratios.
- **Reclaim's defrag and Motion's auto-scheduling algorithms are proprietary.** The scoring formula in §1 is a reconstruction, not theirs; pick weights empirically.
- **Postgres 18 introduces `WITHOUT OVERLAPS` temporal primary keys and `PERIOD` foreign keys.** If you ever upgrade and want stricter enforcement, migrate the EXCLUDE constraint then; until then, EXCLUDE on PG17 is the right call.
- **MCP spec is still moving.** The C# SDK was 1.x at time of writing; minor version bumps may introduce small breaking changes on the Streamable HTTP transport — pin your version.
- **Avoid the temptation to add SignalR "just for the now-line."** A 30-second `hx-trigger="every 30s"` interval is good enough and stateless.
- **Aspire's `aspire deploy` command launches Docker Compose locally for you, but is *not* a remote-deployment tool.** Treat it as a CI build step that emits a Compose artifact; deploy the artifact to your workstation/VM with plain `docker compose up`.