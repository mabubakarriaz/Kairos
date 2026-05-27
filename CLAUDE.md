# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: pre-implementation

Kairos is a single-user todo app whose distinguishing feature is a time-blocked, Google-Calendar-style schedule view ("the right & opportune time to do a task"). **There is no application code yet** — the repository currently contains only the design (`docs/`) and the builder skills (`.claude/skills/`) that will construct it. Most "make a change" requests here mean *scaffold the next slice of the system from the documented design*, not edit existing code.

## Source of truth

- **[docs/technology-stack.md](docs/technology-stack.md) is canonical.** It defines the entire stack, the architecture diagram, and every cross-cutting decision (incl. the "Deliberately Excluded" list). If anything — a skill, this file, your own instinct — conflicts with it, the tech-stack doc wins; update the conflicting thing to match.
- **[docs/research.md](docs/research.md)** holds the rationale, benchmarks, the MVP spec, the NFR performance-budget table, and the rejected alternatives behind each choice. Read it for *why*, not *what*.

## How work gets done: the builder skills

Building Kairos is **skill-driven**. Eight skills under `.claude/skills/` each own one section of the tech-stack doc and contain the exact scaffold commands, target layout, and conventions for that slice. When a request maps to one, **invoke that skill** (via the Skill tool) rather than improvising — they encode the project's contracts.

| Skill | Owns |
|---|---|
| `orchestration-builder` | Aspire AppHost, ServiceDefaults, Dockerfiles, reverse proxy, dev/prod compose (the integrator) |
| `backend-builder` | Solution layout, Domain/Application, the ASP.NET Core host, runtime tuning, Google sync worker |
| `database-builder` | EF Core, Npgsql, entities, the range/multirange schema, migrations, Postgres resource |
| `mcp-builder` | MCP server (mapped in-process at `/mcp` on `Kairos.Web`), tools, resources, transport |
| `frontend-builder` | Razor Pages, Tailwind, htmx, Alpine, the SortableJS drag island, Vite pipeline |
| `observability-builder` | OTel custom spans/metrics, Collector, Prometheus/Loki/Tempo, Grafana, postgres-exporter |
| `testing-builder` | xUnit, Testcontainers, Aspire.Hosting.Testing, Playwright + k6 budget gates |
| `devops-builder` | EditorConfig, analyzers, feature flags, GitHub Actions CI/CD, backups |

**Recommended build order** (dependency order — stand up the graph, fill layers bottom-up, then verify/automate): orchestration → backend → database → mcp → frontend → observability → testing → devops. Work in **vertical slices**: get one task feature working end to end before broadening; each slice ships behind an `appsettings.json` feature flag. See [.claude/skills/README.md](.claude/skills/README.md).

## Target architecture (Clean Architecture, .NET 10 + Aspire)

```
Kairos.sln
src/
  Kairos.AppHost/          # Aspire orchestrator — wires postgres, web, reverse proxy, observability (dev inner loop)
  Kairos.ServiceDefaults/  # shared OTel, health checks, resilience, service discovery (the web host references it)
  Kairos.Web/              # the single ASP.NET host: Razor Pages UI + Minimal APIs (/api/*) + MCP server (/mcp)
                           #   + GoogleCalendarSyncWorker; Tailwind/htmx/Alpine/SortableJS via Vite
  Kairos.Domain/           # TaskItem (core aggregate) + ScheduledBlock, value objects, domain rules — depends on nothing
  Kairos.Application/      # use cases, DTOs, FluentValidation validators, service interfaces
  Kairos.Infrastructure/   # EF Core (KairosDbContext), Npgsql, migrations, repositories,
                           #   Google Calendar client, OAuth token store (Data Protection), Ical.Net expansion
tests/
  Kairos.UnitTests/        # domain + validators + free-slot ranking (no I/O)
  Kairos.IntegrationTests/ # Testcontainers Postgres — real EF round-trips, multirange SQL, MCP tools → DB
  Kairos.AppTests/         # Aspire.Hosting.Testing — full wired app model
```

**Dependency direction:** `Web` → `Application` → `Domain`; `Infrastructure` → `Application`/`Domain`; `Domain` depends on nothing. `Web` references `ServiceDefaults`.

> **MCP topology:** MCP runs **in the same process as the web app** — `app.MapMcp("/mcp")` inside `Kairos.Web`. There is **no separate `Kairos.Mcp` project, container, or `mcp` Aspire resource.** The MCP tool classes live under `Kairos.Web/Mcp/` and delegate to the same `Kairos.Application` services the Razor PageModels use.

## Cross-cutting contracts (these span many files — get them right once)

- **Resource names are a contract.** `postgres`, `kairosdb`, and `web` must be **identical** across the Aspire AppHost, the `ConnectionStrings__kairosdb` keys in `Infrastructure`, and the service names in the compose files. MCP is served at `/mcp` on `web` (no separate `mcp` resource). The core domain aggregate is `TaskItem`.
- **One contract, two runtimes.** The Aspire AppHost is the source of truth for the resource graph; `aspire publish` generates the Compose artifact + `.env`. Maintain two curated files: **`compose.dev.yml`** (app + Postgres + full obs stack + Aspire dashboard) and **`compose.prod.yml`** (app + Postgres + a pared-down OTel pipeline). Names, ports, db name, and the OTLP endpoint stay identical across the AppHost and both files. A **reverse proxy (Caddy or YARP)** terminates HTTPS on loopback; the app speaks HTTP/2 cleartext (`h2c`) behind it (no HTTP/3 on loopback).
- **Business logic lives only in `Domain`/`Application`.** `Web` and `Infrastructure` are thin adapters. The MCP tools and the Razor PageModels call the **same** application services — never duplicate logic or touch `DbContext` from the host.
- **Schema is code.** Every schema change is a reviewed EF migration in source control; the live DB is never hand-edited. Entities stay persistence-ignorant (no EF attributes) — all mapping is Fluent API, one `IEntityTypeConfiguration<T>` per entity, surfaced via `ApplyConfigurationsFromAssembly`. The generated `during` range column and the `EXCLUDE` no-overlap constraint are emitted via raw `migrationBuilder.Sql(...)`.
- **UTC everywhere** (`DateTimeOffset`/`timestamptz`); **enums as strings** (`HasConversion<string>()`); explicit `MaxLength` on text columns.
- **Validation at the boundary** with FluentValidation — one validator per inbound command/DTO, shared by the Razor/API and MCP surfaces. MCP returns structured errors, never raw exceptions across the protocol.
- **Telemetry is centralized** in `Kairos.ServiceDefaults` — never configure OTel per-host. Apps emit OTLP only; the Collector owns fan-out to Prometheus/Loki/Tempo. Custom spans (`schedule.render`, `freeslots.compute`, `gcal.sync.cycle`, `task.reschedule`) and metrics (`kairos_*`) are named exactly as the tech-stack doc lists them.
- **Nullable + implicit usings on; warnings-as-errors** (via root `Directory.Build.props`). Don't suppress an analyzer without an inline justification. Runtime tuning (`ServerGarbageCollection`, ReadyToRun) lives in the **host** csproj; **no Native AOT**.
- **Connection strings/secrets come from Aspire/environment** — never hard-coded or committed. OAuth tokens are encrypted at rest with **ASP.NET Core Data Protection** (keys persisted to a mounted `dpkeys` volume — refresh tokens rotate, so never stash them in env vars / `appsettings.json`).

## Common commands

The solution doesn't exist yet; these are the canonical commands the skills use to scaffold and verify it (PowerShell on Windows).

```powershell
# Build / test (after the solution exists)
dotnet build
dotnet test                                   # all tiers (needs Docker for Testcontainers + Aspire tests)
dotnet test tests/Kairos.UnitTests            # fast inner loop
dotnet test --filter "FullyQualifiedName~SomeTest"   # a single test

# EF Core migrations (Infrastructure holds the model; Web is the startup project)
dotnet tool install --global dotnet-ef        # once
dotnet ef migrations add <Name> --project src/Kairos.Infrastructure --startup-project src/Kairos.Web
dotnet ef migrations bundle                   # for deploys (not migrate-on-startup in prod)

# Frontend assets (from src/Kairos.Web/ClientApp)
npm run dev                                   # Vite dev server + HMR
npm run build                                 # hash-fingerprinted bundles → wwwroot/dist (vite-manifest.json)

# Run the stack
#   dev inner loop — runs the full resource graph + Aspire dashboard:
dotnet run --project src/Kairos.AppHost
#   full containerized stack (dev = full obs + dashboard; prod = pared-down OTel-to-disk):
docker compose -f compose.dev.yml config      # validate before up
docker compose -f compose.dev.yml up --build

# Performance-budget gates (also run as CI merge gates)
npx playwright test                           # E2E + perf traces (TTI, drop→DB ≤ 100 ms)
k6 run tests/load/schedule_swap.js            # htmx-swap + Postgres-query p95/p99 budgets

# Code quality (mirrors CI; run before pushing)
dotnet format --verify-no-changes
dotnet build -c Release                       # warnings-as-errors
```

**CI is the merge contract:** `.github/workflows/ci.yml` runs format → build (`-c Release`) → test → Playwright → k6 → bundle-size on a Docker-enabled runner; the performance budgets are gates, not aspirations. **GitFlow:** one feature branch per vertical slice → `develop` → `main`; tag `v0.N` on merge to `main`. Merges require green CI + review. Migrations apply at startup in dev (behind an environment guard); never `EnsureCreated()` alongside migrations, never edit an applied migration.

## Domain gotchas worth knowing up front

- **PostgreSQL 14+ is a hard floor** (target `postgres:17-alpine`). The schedule model uses two tables (`tasks`, `scheduled_blocks`); a generated `tstzrange` "during" column with an `EXCLUDE USING GIST (during WITH &&) WHERE (source='kairos')` constraint enforces no-overlap on Kairos blocks (gcal blocks may overlap). `btree_gist` + multiranges are non-negotiable.
- **Free-slot detection is SQL, not C#.** `unnest(work_mr - range_agg(busy))` returns gaps directly; only the top-N ranking of the handful of returned rows happens in C#. Don't reimplement this in application code.
- **Google Calendar is read-only busy data** via incremental `syncToken` polling (~5 min ±25% jittered) in the `GoogleCalendarSyncWorker`. OAuth uses the installed-app loopback flow, scope `calendar.events.readonly` only. Never mix `timeMin`/`timeMax` with `syncToken` in one request (400); `nextSyncToken` only appears on the last page; on `410 Gone`, drop local gcal rows and re-sync. Push webhooks are deliberately deferred.
- **Recurring Kairos blocks store an `rrule`, never pre-expanded into rows** — expand on read with `Ical.Net` for the requested window only (cache in `IMemoryCache`); test across a DST boundary.
- **The only bespoke client JS is the SortableJS drag island**, which fires htmx once on drop (`onEnd`); the server replies with `hx-swap-oob` to update the source slot + target slot + free-slots panel atomically. Per-pixel server round-trips for drag (Blazor Server/SignalR) are an explicit anti-pattern here.
- **Performance budgets are real and CI-gated** (Playwright + k6) — see the research report's consolidated NFR table (e.g. htmx swap p95 ≤ 50 ms, Postgres window query p95 ≤ 5 ms, drop→DB ≤ 100 ms).
- **Backups are rehearsed, not assumed:** nightly `pg_dump -Fc`, retention 14 daily / 8 weekly / 12 monthly, and a `pg_restore` restore drill rehearsed in Slice 0.
- **Deliberately excluded** (don't reintroduce): Blazor, React/SPA, Native AOT, SignalR/WebSockets, service workers/CRDTs, response caching, and auth/multi-user (schema leaves a `user_id` seam but there's no UI). See the tech-stack doc's exclusion table for reasons.
- **The Aspire dashboard is dev-only** — guard the dashboard and observability-stack wiring with `builder.ExecutionContext.IsRunMode` / `IsDevelopment()`; the single-user prod compose runs a pared-down OTel pipeline.
