---
name: backend-builder
description: "Scaffold and build the Kairos .NET backend — Aspire-orchestrated ASP.NET Core (Razor Pages + Minimal APIs), EF Core 10/PostgreSQL, the GoogleCalendarSyncWorker, an MCP server, OpenTelemetry observability, and the Docker Compose stack. Use when the user asks to create, scaffold, extend, or wire up backend projects, entities, EF Core models/migrations, API or MCP endpoints, the Google Calendar sync worker, OAuth/Data Protection, Aspire resources, or the container stack for Kairos."
---

# backend-builder

Build the Kairos backend exactly as specified in [docs/technology-stack.md](../../../docs/technology-stack.md). This skill is the procedural companion to that document: the tech-stack doc decides *what* the stack is, this skill decides *how* to assemble it consistently.

**Read [docs/technology-stack.md](../../../docs/technology-stack.md) first** — it is the source of truth. [docs/report-technical-design-research.md](../../../docs/report-technical-design-research.md) holds the rationale, the MVP spec, the NFR budgets, and the vertical-slice build order; consult it for *why*. If anything here conflicts with the tech-stack doc, the doc wins; update this skill to match.

## Canonical stack (from the tech-stack doc)

- **Runtime:** .NET 10 (LTS), latest C#. **No Native AOT** for v1 (EF Core + Razor aren't cleanly AOT-compatible; cold-start gains are irrelevant for an always-on local container).
- **Orchestration:** .NET Aspire (AppHost + ServiceDefaults)
- **Web/UI:** ASP.NET Core **Razor Pages** (HTML, source of truth) + **Minimal APIs** for `/api/*` and `/mcp`; Kestrel on loopback over `h2c` behind the reverse proxy. Tailwind + htmx 2.x + Alpine + SortableJS via Vite (see `frontend-builder`)
- **Data:** PostgreSQL 17 via **EF Core 10 + Npgsql**, code-first migrations (see `database-builder`)
- **Background:** `GoogleCalendarSyncWorker` (`IHostedService`) polling Google Calendar read-only with `syncToken`
- **External:** Google Calendar API v3 via `Google.Apis.Calendar.v3`; OAuth installed-app flow; tokens encrypted at rest with **ASP.NET Core Data Protection**
- **Recurrence:** `Ical.Net` 4.x for RRULE expansion of Kairos blocks (expand-on-read, never pre-expand into the DB)
- **Validation:** FluentValidation (one validator per inbound command/DTO, shared by Web + MCP); **MediatR** optional if a vertical-slice/handler style is adopted
- **AI:** **MCP server** using `ModelContextProtocol` (pin the 1.x version) over Streamable HTTP / SSE (see `mcp-builder`)
- **Observability:** OpenTelemetry → OTel Collector → Prometheus / Loki / Tempo → Grafana; Aspire dashboard in dev (see `observability-builder`)
- **Containers:** Docker per service; `compose.dev.yml` / `compose.prod.yml` split (see `orchestration-builder`)
- **Testing:** xUnit, Testcontainers, FluentAssertions, Aspire.Hosting.Testing, plus Playwright + k6 budget gates (see `testing-builder`)

### Runtime tuning (set these explicitly)
- **Keep ReadyToRun + Tiered Compilation** (on by default in the .NET 10 SDK) — ~80% of the cold-start win at zero cost.
- **`<ServerGarbageCollection>true</ServerGarbageCollection>`** in the host csproj — containers misdetect core count; Workstation GC is wrong for a server process.
- **System.Text.Json source generators** — `[JsonSerializable(typeof(TaskDto))]` etc. for the small set of API/MCP DTOs; trims first-call latency.
- **Do not set `PublishAot`.** It's on the Deliberately Excluded list.

## Target solution layout

```
Kairos.sln
src/
  Kairos.AppHost/            # .NET Aspire orchestrator — wires Postgres, web, mcp, observability
  Kairos.ServiceDefaults/    # shared OTel, health checks, resilience, service discovery
  Kairos.Web/                # the single ASP.NET host: Razor Pages UI + Minimal APIs (/api/*) +
                             #   MCP server mapped in-process at /mcp + GoogleCalendarSyncWorker
                             #   Mcp/  -> [McpServerToolType] tool classes (delegate to Application)
  Kairos.Domain/             # TaskItem, ScheduledBlock, value objects, domain rules (no external deps)
  Kairos.Application/        # use cases, DTOs, FluentValidation validators, service interfaces
  Kairos.Infrastructure/     # EF Core 10 (KairosDbContext), Npgsql, migrations, repositories,
                             #   Google Calendar client, OAuth token store, Ical.Net expansion
tests/
  Kairos.UnitTests/
  Kairos.IntegrationTests/   # Testcontainers Postgres — EF round-trips, MCP tools → DB
  Kairos.AppTests/           # Aspire.Hosting.Testing — full wired app model
```

Dependency direction (Clean Architecture): `Web` (Razor Pages + APIs + MCP, one host) → `Application` → `Domain`; `Infrastructure` → `Application`/`Domain`. `Domain` depends on nothing. `Web` references `ServiceDefaults`.

> **MCP topology:** per the tech-stack doc, **MCP runs in the same process as the web app** — `app.MapMcp("/mcp")` inside `Kairos.Web`. There is **no separate `Kairos.Mcp` project, container, or `mcp` Aspire resource** (this supersedes the older separate-host layout).

## Build workflow

Work in **vertical slices** — get one task feature working end to end before broadening (the research report's Slice 0→7 order is the canonical sequence). Each slice ships behind an `appsettings.json` feature-flag boolean so it's independently demoable. Run `dotnet build` after each project is added; don't batch failures.

### 1. Solution & shared projects
```powershell
dotnet new sln -n Kairos
dotnet new aspire-apphost         -n Kairos.AppHost         -o src/Kairos.AppHost
dotnet new aspire-servicedefaults -n Kairos.ServiceDefaults -o src/Kairos.ServiceDefaults
dotnet new classlib -n Kairos.Domain         -o src/Kairos.Domain
dotnet new classlib -n Kairos.Application     -o src/Kairos.Application
dotnet new classlib -n Kairos.Infrastructure  -o src/Kairos.Infrastructure
dotnet new webapp   -n Kairos.Web             -o src/Kairos.Web        # Razor Pages + APIs + /mcp
dotnet sln add (Get-ChildItem -Recurse src,tests -Filter *.csproj)
```
Wire references per the dependency direction. `Kairos.Web` references `Kairos.ServiceDefaults` and calls `builder.AddServiceDefaults()`. (No separate MCP host — MCP is mapped into `Kairos.Web`.)

### 2. Domain & Application
- Put entities in `Kairos.Domain`. The core aggregate is **`TaskItem`** (Kairos = "the right & opportune time to do a task"): id, title, description, `estimate_min`, tags, `created_at`, `completed_at`. Scheduling lives in **`ScheduledBlock`** (start/end as `DateTimeOffset` UTC, `source` ∈ {kairos, gcal}, optional `external_id`, optional `rrule`). Keep both free of EF/ASP.NET types. (`database-builder` owns the mapping + schema.)
- In `Kairos.Application`: DTOs (`TaskDto`, `ScheduledBlockDto`, `FreeSlot`), service interfaces (`ITaskService`, `IScheduleService`, `IFreeSlotService`, `ITaskRepository`), and a `FluentValidation` validator per inbound command/DTO. Register with `AddValidatorsFromAssembly(...)`.
- **Free-slot detection is SQL, not C#** — `IFreeSlotService` runs the multirange query and only ranks the handful of returned rows in C# (the scoring formula in the research report §1). Don't reimplement gap-finding in application code.

### 3. Data (EF Core 10 + PostgreSQL) — see `database-builder`
- Register via the Aspire integration so connection strings come from the AppHost:
  ```csharp
  builder.AddNpgsqlDbContext<KairosDbContext>("kairosdb");
  ```
- **Read-path patterns:** default the context to `QueryTrackingBehavior.NoTracking`; add `.AsSplitQuery()` only when projecting blocks+tasks together; use compiled queries (`EF.CompileAsyncQuery`) for the two or three hot paths (day-window fetch, free-slots, single-task-by-id).
- **Npgsql tuning:** `tstzrange` maps to `NpgsqlRange<DateTime>` natively; set `MaxAutoPrepare=20` and `AutoPrepareMinUsages=2` so the GiST-overlap query gets a prepared plan.
- Migrations: `dotnet ef migrations add <Name> --project src/Kairos.Infrastructure --startup-project src/Kairos.Web`. Apply at startup in dev behind an environment guard; use a migration bundle for deploys. Never `EnsureCreated()` alongside migrations.

### 4. Aspire AppHost — wire the resources
Provision Postgres (PG 17, persistent volume) and reference it; guard dev-only resources with `IsRunMode` (see `orchestration-builder`):
```csharp
var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres").WithDataVolume("kairos_pgdata");
if (builder.ExecutionContext.IsRunMode) postgres = postgres.WithPgAdmin();
var kairosdb = postgres.AddDatabase("kairosdb");

builder.AddProject<Projects.Kairos_Web>("web").WithReference(kairosdb).WaitFor(kairosdb)
       .WithExternalHttpEndpoints();   // serves Razor Pages, /api/*, and /mcp

builder.Build().Run();
```
The observability containers and reverse proxy are wired by `orchestration-builder`/`observability-builder`. Resource names `postgres`/`kairosdb`/`web` are the contract (no separate `mcp` resource — `/mcp` is on `web`).

### 5. Web (Razor Pages + Minimal APIs + frontend toolchain)
- Razor Pages under `Pages/` render HTML; expose task/slot/reschedule operations as **Minimal APIs** under `/api/*` (e.g. `/api/tasks`, `/api/slots`, `/api/days/{date}/reschedule`) for htmx partials. Minimal APIs benchmark faster than controllers — use them for `/api/*` and `/mcp`; Razor Pages for HTML.
- Front-end assets are owned by `frontend-builder` (Tailwind + htmx 2.x + Alpine + the **SortableJS drag island**, bundled by Vite to `wwwroot/dist/`). Keep the server authoritative: htmx drives partial updates via `hx-swap-oob`; the only bespoke JS is the drag island, firing one POST on drop. Branch htmx vs full-page with `Request.IsHtmx()` (Htmx.Net).
- Enable response compression (Brotli for static via `MapStaticAssets`, gzip for HTML).

### 6. Google Calendar integration (read-only) — Slice 4
- **Packages:** `Google.Apis.Calendar.v3` (+ `Microsoft.AspNetCore.DataProtection`).
- **OAuth:** installed-app flow, loopback redirect (`http://127.0.0.1:5000/oauth/callback`); request **only** scope `https://www.googleapis.com/auth/calendar.events.readonly`.
- **Token storage:** an EF-managed `oauth_tokens` table (see `database-builder`); `access_token`/`refresh_token` **encrypted at rest with Data Protection**, keys persisted to the mounted `dpkeys` volume — never env vars / `appsettings.json` (refresh tokens rotate).
- **`GoogleCalendarSyncWorker` (`IHostedService`):** poll `events.list` on a **5-min ± 25% jittered** cadence. State machine:
  ```
  No token  → events.list(timeMin=-30d, timeMax=+90d, singleEvents=true, pageToken loop) → store nextSyncToken
  Has token → events.list(syncToken, pageToken loop) → store nextSyncToken
            → on 410 Gone → drop local gcal rows, fall back to no-token path
  ```
  `nextSyncToken` only appears on the last page — finish pagination before storing it. **Never** mix `timeMin`/`timeMax` with `syncToken` in one request (400). `singleEvents=true` lets Google expand recurrence/cancellations server-side; `status:"cancelled"` → soft-delete locally. Rate-limit handling: treat 403 `rateLimitExceeded` and 429 the same — exponential backoff with full jitter (1→64 s cap), bump the `kairos_gcal_rate_limited_total` counter.
- Gcal events render alongside Kairos blocks but are **read-only busy data**; they may overlap (only Kairos blocks get the no-overlap exclusion constraint).

### 7. Recurring Kairos blocks — Slice 5
- Store `rrule` text on `ScheduledBlock`; **never pre-expand into rows.** Expand on read for the requested window only via `Ical.Net` 4.x, cached in `IMemoryCache` (30 s TTL keyed by `(rrule_hash, window)`). Test across a DST boundary — `Ical.Net` has known DST/EXDATE edge cases.

### 8. MCP server (in-process) — see `mcp-builder`
- In `Kairos.Web`, add `ModelContextProtocol.AspNetCore` (**pin the 1.x version** — spec & SDK are still moving). Register and map alongside the Razor Pages / APIs:
  ```csharp
  builder.Services.AddMcpServer().WithHttpTransport().WithToolsFromAssembly();
  app.MapMcp("/mcp");
  ```
- Tools delegate to the **same** application services as Razor Pages — never duplicate logic or touch `DbContext`. v1 surface: `list_tasks`, `create_task`, `delete_task`, `reschedule_task`, `list_free_slots` (validate with the shared validators; return structured errors, never raw exceptions across the protocol).

### 9. Observability — see `observability-builder`
- Telemetry is centralized in `Kairos.ServiceDefaults` (`AddServiceDefaults`/`ConfigureOpenTelemetry`): OTLP for traces/metrics/logs, plus ASP.NET Core, HttpClient, EF Core, and Npgsql instrumentation. Hosts inherit it. **Never configure OTel per-host.**
- Add custom spans (`schedule.render`, `freeslots.compute`, `gcal.sync.cycle`, `task.reschedule`) and metrics (`kairos_htmx_partial_swap_seconds`, `kairos_postgres_query_seconds`, `kairos_gcal_sync_lag_seconds`, `kairos_active_tasks`).

### 10. Docker & Compose — see `orchestration-builder`
- Multi-stage, non-root Dockerfiles (Server GC on). `compose.dev.yml` (full obs + dashboard) and `compose.prod.yml` (minimal OTel-to-disk) both bring the stack up; a reverse proxy terminates HTTPS on loopback.

### 11. Tests — see `testing-builder`
- Unit: domain + validators (xUnit + FluentAssertions). Integration: real Postgres via Testcontainers (multirange SQL must be tested on real PG). App-model: Aspire.Hosting.Testing. Budget gates: Playwright (drop→DB ≤ 100 ms) + k6 (htmx swap / Postgres query p95/p99).

## Conventions

- **Nullable + implicit usings** on; **warnings-as-errors** via root `Directory.Build.props`. Don't suppress an analyzer without an inline justification.
- **Business logic lives only in `Domain`/`Application`.** `Web`, `Mcp`, and `Infrastructure` are thin adapters — the MCP tools and Razor PageModels call the *same* application services.
- **One `IEntityTypeConfiguration<T>` per entity**; only `ApplyConfigurationsFromAssembly` in `OnModelCreating`. Entities are persistence-ignorant (no EF attributes).
- **UTC everywhere** (`DateTimeOffset`/`timestamptz`); **enums as strings**; explicit `MaxLength`.
- **A FluentValidation validator for every inbound command/DTO**, shared across Web and MCP.
- **Free slots = SQL, not C#.** The app tier only ranks the returned rows.
- **Connection strings / OAuth secrets come from Aspire/environment**, never hard-coded or committed; tokens are encrypted via Data Protection.
- **Each slice ships behind a feature flag.** Don't widen scope before a slice works end to end.
- **Deliberately excluded — don't reintroduce:** Blazor, React/SPA, Native AOT, SignalR/WebSockets, service workers/CRDTs, response caching, auth/multi-user (the schema leaves a `user_id` seam but there's no UI).
- After scaffolding each project: `dotnet build`. Before declaring done: `dotnet build` + `dotnet test` clean, and `docker compose -f compose.dev.yml up` succeeds.

## Definition of done

A change is complete when: the solution builds (warnings-as-errors) with Server GC + ReadyToRun and no AOT; tests pass; `dotnet ef migrations` is current; the Aspire AppHost runs the full graph; Minimal APIs serve `/api/*` and `/mcp`; the `GoogleCalendarSyncWorker` syncs read-only with the `syncToken` state machine and Data-Protection-encrypted tokens; MCP tools (`list_tasks`/`create_task`/`delete_task`/`reschedule_task`/`list_free_slots`) operate against Postgres via application services; telemetry reaches Grafana; and `compose.dev.yml`/`compose.prod.yml` bring up the stack. Anything skipped is called out explicitly.
