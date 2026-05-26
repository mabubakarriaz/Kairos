# Kairos — Technology Stack

> _"The right & opportune time to do a task."_

This document lists the technologies used across the Kairos project, grouped by concern. It is the canonical reference for the stack; update it whenever a dependency or platform decision changes. Version floors and key decisions are derived from [`research.md`](research.md) — read that for the rationale, benchmarks, and rejected alternatives behind each choice.

---

## Platform & Runtime

| Technology | Purpose | Notes |
|---|---|---|
| **.NET 10 (LTS)** | Core runtime for all backend services | LTS release; long support window |
| **C#** | Primary language | Latest language version shipped with .NET 10 |
| **.NET Aspire** | Cloud-native app orchestration | App host, service discovery, resource wiring, local dev dashboard |

**Runtime tuning (no AOT for v1):**
- **ReadyToRun + Tiered Compilation** — on by default in the .NET 10 SDK; keep them. Gets ~80% of the cold-start win at zero complexity cost.
- **Server GC** — set `<ServerGarbageCollection>true</ServerGarbageCollection>` explicitly; containers historically misdetect core count, and Workstation GC is wrong for a server process.
- **System.Text.Json source generators** — `[JsonSerializable(typeof(TaskDto))]` for the small set of API/MCP DTOs; trims first-call latency.
- **Native AOT is deliberately _not_ used** — EF Core and Razor compilation aren't cleanly AOT-compatible in .NET 10, and cold-start gains don't matter for an always-on local container. See _Deliberately Excluded_.

## Backend

| Technology | Purpose | Notes |
|---|---|---|
| **ASP.NET Core** | Web framework | Hosts Razor Pages app + API/MCP endpoints; Kestrel on loopback (HTTP/2 `h2c` behind the reverse proxy) |
| **Razor Pages** | Server-rendered UI pages | Page-focused, server-side rendering model; source of truth for HTML |
| **Minimal APIs** | Lightweight HTTP endpoints | `/api/*` (tasks, slots, reschedule) and `/mcp`; benchmark faster than controllers and coexist with Razor Pages |
| **Entity Framework Core 10** | ORM / data access | Code-first migrations, LINQ; `AsNoTracking` on read paths, `AsSplitQuery` on block+task projections, compiled queries for hot paths |
| **Npgsql** | PostgreSQL ADO.NET + EF Core provider | First-class Postgres driver; maps `tstzrange` → `NpgsqlRange<DateTime>` natively; `MaxAutoPrepare=20`, `AutoPrepareMinUsages=2` so the GiST-overlap query gets a prepared plan |
| **IHostedService — `GoogleCalendarSyncWorker`** | Background Google Calendar sync | Polls `events.list` with `syncToken` on a 5-min ±25% jittered cadence |
| **ASP.NET Core Data Protection** | Encrypt OAuth tokens at rest | Protects `access_token`/`refresh_token`; keys persisted to a mounted volume (not env vars / appsettings — refresh tokens rotate) |
| **Ical.Net (4.x)** | RRULE expansion for recurring Kairos blocks | Expand on read for the requested window only; cache via `IMemoryCache` (30 s TTL, keyed by `(rrule_hash, window)`). Never pre-expand into the DB. Test across DST boundaries |
| **FluentValidation** | Request/model validation | Clean separation of validation rules |
| **MediatR** _(optional)_ | In-process messaging / CQRS | Useful if vertical-slice / handler style is adopted |

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

## Database

| Technology | Purpose | Notes |
|---|---|---|
| **PostgreSQL 17** | Primary relational database | Runs as a container (`postgres:17-alpine`), provisioned via Aspire. **PG 14+ is a hard floor** — multiranges are non-negotiable |
| **`btree_gist` extension** | GiST index + exclusion constraints | Powers the `EXCLUDE USING GIST (during WITH &&)` no-overlap constraint on Kairos blocks and the `during && tstzrange(...)` window query |
| **Range / multirange types** | First-class temporal modeling | `tstzrange` (stored, GiST-indexed) for blocks; `tstzmultirange` + `range_agg` make free-slot detection a one-line SQL expression (working-hours multirange − busy multirange) |
| **`auto_explain` extension** | Slow-query plan capture | `log_min_duration = 50ms` logs the full plan; piped to logs/Loki |
| **`pg_stat_statements` extension** | Query-level latency insight | Watch the GiST-overlap and free-slots queries against the NFR budgets |
| **EF Core Migrations** | Schema management | Versioned, applied at startup or via migration bundles |
| **pgAdmin** _(optional, dev)_ | DB administration UI | Convenience container for local development |

> **Free slots = SQL, not C#.** `unnest(work_mr - range_agg(busy))` returns gaps directly; ranking the top-N "best" slots happens in C# on the handful of returned rows (sub-ms). The pre-PG14 gaps-and-islands fallback exists but is deliberately avoided by mandating PG 14+.

## External Integrations

| Technology | Purpose | Notes |
|---|---|---|
| **Google Calendar API v3** | Read-only busy-event source | Renders alongside Kairos tasks; `singleEvents=true` so Google expands recurrence/cancellations server-side |
| **`Google.Apis.Calendar.v3`** (`google-api-dotnet-client`) | Official .NET client | Fully async (`ExecuteAsync()`); transparent refresh-token handling via `IDataStore` |
| **OAuth 2.0 — installed-app flow** | Account authorization | Loopback redirect (`http://127.0.0.1:5000/oauth/callback`); scope `calendar.events.readonly` only (minimum privilege) |
| **`syncToken` incremental sync** | Bandwidth-efficient polling | State machine: full sync → store `nextSyncToken` → incremental; on `410 Gone`, drop local gcal rows and re-sync. ~288 calls/day, far under quota |

> **Push webhooks (`events.watch`) are deferred,** not adopted: they need a public HTTPS endpoint with a valid cert, channels expire weekly with no auto-renewal, and the payload carries no event data anyway. Polling wins for a localhost app. Never mix `timeMin`/`timeMax` with `syncToken` in one request — it's a 400.

## AI Integration (MCP)

| Technology | Purpose | Notes |
|---|---|---|
| **Model Context Protocol (MCP)** | Expose Kairos to AI agents | Lets AI clients read tasks and add/remove/update/reschedule items, and query free slots |
| **`ModelContextProtocol`** (C# SDK, 1.x) | Build the MCP server in .NET | Official SDK (Microsoft + Anthropic); handles JSON-RPC framing & tool discovery. **Pin the version** — spec & SDK are still moving |
| **`ModelContextProtocol.AspNetCore`** | Hosting transport for MCP | `AddMcpServer().WithHttpTransport().WithToolsFromAssembly()` + `app.MapMcp("/mcp")`; Streamable HTTP / SSE |

> The MCP server publishes **tools** (`create_task`, `delete_task`, `list_tasks`, `reschedule_task`, `list_free_slots`) and **resources** so an AI assistant can manage Kairos content conversationally — including "what free slots do I have tomorrow?" and "schedule X for 1 h tomorrow morning."

## Observability

| Technology | Purpose | Notes |
|---|---|---|
| **OpenTelemetry** | Traces, metrics, and logs instrumentation | Vendor-neutral; built into Aspire service defaults. Custom spans: `schedule.render`, `freeslots.compute`, `gcal.sync.cycle`, `task.reschedule` |
| **OpenTelemetry Collector** | Telemetry pipeline / export | Receives OTLP and fans out to backends |
| **Grafana** | Dashboards & visualization | Single pane of glass; alerts on the NFR budgets |
| **Prometheus** | Metrics storage & querying | Custom metrics: `kairos_htmx_partial_swap_seconds`, `kairos_postgres_query_seconds`, `kairos_gcal_sync_lag_seconds`, `kairos_active_tasks`, `kairos_gcal_rate_limited_total` |
| **Grafana Loki** | Log aggregation | Centralized structured logs (incl. Postgres `auto_explain` output) |
| **Grafana Tempo** | Distributed tracing backend | Stores OTLP traces |
| **postgres-exporter** _(sidecar)_ | Postgres metrics → Prometheus | Surfaces `pg_stat_statements` and slow-query data |
| **`dotnet-counters`** | Runtime metric inspection | Steady-state RSS / GC; the "minimum viable observability" runbook for a one-user app |
| **web-vitals.js** | Client-side INP / interaction latency | Feeds the drag/input-latency budgets back as an OTel custom metric |
| **.NET Aspire Dashboard** | Local-dev telemetry view | **Dev-only** — guard with `if (builder.ExecutionContext.IsRunMode)`; never run it in the single-user prod compose |

> **Dev vs prod split:** dev runs the full Prom/Loki/Tempo/Grafana + Aspire Dashboard stack; prod runs a pared-down OTel Collector to local Prometheus + file logs, because a full obs stack can out-consume the app itself on one machine.

## Containerization & Orchestration

| Technology | Purpose | Notes |
|---|---|---|
| **Docker** | Containerize every service | App, database, observability stack, MCP (same process as app) |
| **Docker Compose** | Spin up the full stack locally | Two files: `compose.dev.yml` (full obs + dashboard) and `compose.prod.yml` (app + Postgres + minimal OTel) |
| **.NET Aspire AppHost** | Dev-time orchestration & service discovery | `aspire publish` emits the `docker-compose.yml` + `.env`; `aspire deploy` runs it **locally only** (not a remote-deploy tool) |
| **Reverse proxy (Caddy or YARP)** | HTTPS termination on loopback | Browser sees HTTPS; app speaks HTTP/2 `h2c` behind it. HTTP/3/QUIC is irrelevant on loopback |
| **Named volumes** | Durable state | `kairos_pgdata` (Postgres), `dpkeys` (Data Protection keys), `kairos_files` (future attachments) — bind-mount under `%USERPROFILE%\KairosData\` on Windows for visibility |

## Backup & Durability

| Technology | Purpose | Notes |
|---|---|---|
| **`pg_dump` (`-Fc` custom format)** | Nightly logical backups | Run via a `kairos-backup` sidecar container or Windows Task Scheduler |
| **PowerShell retention script** | Backup rotation | 14 daily / 8 weekly / 12 monthly |
| **`pg_restore` restore drill** | Verify backups actually work | Rehearsed in the bootstrap checklist (Slice 0) — "if you don't do this once, you don't have backups" |

## Testing & Quality

| Technology | Purpose | Notes |
|---|---|---|
| **xUnit** | Unit & integration testing | Primary test framework |
| **Testcontainers for .NET** | Real Postgres in integration tests | Ephemeral containerized dependencies; the only way to test multirange SQL faithfully |
| **FluentAssertions** | Expressive test assertions | Readable assertion syntax |
| **Aspire.Hosting.Testing** | Test against the Aspire app model | End-to-end orchestration tests |
| **Playwright** | E2E browser tests + perf traces | Drives drag→drop→persist; enforces TTI and drop-to-DB budgets via traces in CI |
| **k6** | Load testing | Enforces htmx-partial-swap and Postgres query p95/p99 budgets as CI gates |

## Tooling & DevOps

| Technology | Purpose | Notes |
|---|---|---|
| **Git / GitHub** | Source control & collaboration | GitFlow — one feature branch per vertical slice; tag `v0.N` on merge to `main` |
| **GitHub Actions** | CI/CD pipelines | Build, test, container publish; gates on the performance budgets (k6 + Playwright) and bundle size |
| **EditorConfig** | Consistent code style | Shared formatting rules |
| **dotnet format / analyzers** | Linting & style enforcement | Build-time code quality gates |
| **Feature flags** (`appsettings.json` booleans) | Independently demoable slices | Each build-order slice ships behind its own flag |

## Deliberately Excluded

These were evaluated in [`research.md`](research.md) and rejected for v1 — listed here so they don't creep back in:

| Excluded | Reason |
|---|---|
| **Blazor (Server / Auto / WASM)** | Server mode = per-pixel SignalR for drag (anti-pattern); Auto-mode hydration is flaky in .NET 10; WASM = multi-MB download for a localhost app |
| **React + Vite SPA** | Second build pipeline, second state model, zero capability gain at <700 DOM nodes |
| **Native AOT (`PublishAot`)** | Loses EF Core + Razor compilation tooling; cold-start gains irrelevant for an always-on container |
| **SignalR / WebSockets** | Not needed; the "now" line uses a stateless 30 s `hx-trigger`, and last-write-wins is fine for one user |
| **Service worker / IndexedDB / CRDTs** | Local-first is overkill for a single-user localhost app |
| **Output/response caching** | Single-digit-ms indexed queries on loopback; caching only adds invalidation pain |
| **Auth / multi-user (for now)** | Single-user behind `127.0.0.1`; schema leaves room (`user_id`) but no UI affordances |

---

## Architecture at a Glance

```
                              ┌─────────────────────────┐
                   AI Client ─▶│  MCP endpoint (/mcp)    │
                              └────────────┬────────────┘
                                           │
   Browser ──HTTPS──▶ Reverse Proxy ──h2c──▶ ASP.NET Core App (.NET 10)
   (Razor + htmx 2.x                         │  ├─ Razor Pages (HTML)
    + Tailwind + Alpine                      │  ├─ Minimal APIs (/api/*, /mcp)
    + SortableJS drag island)                │  ├─ GoogleCalendarSyncWorker (IHostedService)
        │  drag visuals stay client-side;    │  └─ EF Core 10 ──▶ PostgreSQL 17
        │  POST only on drop (onEnd)         │           (btree_gist, multiranges,
        ▼                                    │            auto_explain, pg_stat_statements)
   hx-swap-oob: slot + panel                 │
                                             │  syncToken poll (5 min ±25%)
                                             ▼
                                   Google Calendar API v3  (OAuth, read-only)

   OpenTelemetry (OTLP) ──▶ Collector ──▶ Prometheus / Loki / Tempo ──▶ Grafana
   (+ postgres-exporter, dotnet-counters, web-vitals.js)        Aspire Dashboard = dev only

   Orchestrated by .NET Aspire  •  Packaged with Docker  •  Run via Docker Compose (dev/prod split)
   State in named volumes (kairos_pgdata, dpkeys)  •  Nightly pg_dump backups
```

---

_Last updated: 2026-05-27_
