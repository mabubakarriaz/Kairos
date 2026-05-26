# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: pre-implementation

Kairos is a single-user todo app whose distinguishing feature is a time-blocked, Google-Calendar-style schedule view ("the right & opportune time to do a task"). **There is no application code yet** — the repository currently contains only the design (`docs/`) and the builder skills (`.claude/skills/`) that will construct it. Most "make a change" requests here mean *scaffold the next slice of the system from the documented design*, not edit existing code.

## Source of truth

- **[docs/technology-stack.md](docs/technology-stack.md) is canonical.** It defines the entire stack, the architecture diagram, and every cross-cutting decision (incl. the "Deliberately Excluded" list). If anything — a skill, this file, your own instinct — conflicts with it, the tech-stack doc wins; update the conflicting thing to match.
- **[docs/research.md](docs/research.md)** holds the rationale, benchmarks, and rejected alternatives behind each choice. Read it for *why*, not *what*.

## How work gets done: the builder skills

Building Kairos is **skill-driven**. Eight skills under `.claude/skills/` each own one section of the tech-stack doc and contain the exact scaffold commands, target layout, and conventions for that slice. When a request maps to one, **invoke that skill** (via the Skill tool) rather than improvising — they encode the project's contracts.

| Skill | Owns |
|---|---|
| `orchestration-builder` | Aspire AppHost, ServiceDefaults, Dockerfiles, docker-compose (the integrator) |
| `backend-builder` | Solution layout, Domain/Application, ASP.NET Core hosts |
| `database-builder` | EF Core, Npgsql, entities, migrations, Postgres resource |
| `mcp-builder` | MCP server, tools, resources, transport |
| `frontend-builder` | Razor Pages, Tailwind, htmx, Alpine, Vite pipeline |
| `observability-builder` | OTel, Collector, Prometheus/Loki/Tempo, Grafana |
| `testing-builder` | xUnit, Testcontainers, Aspire.Hosting.Testing |
| `devops-builder` | EditorConfig, analyzers, GitHub Actions CI/CD |

**Recommended build order** (dependency order — stand up the graph, fill layers bottom-up, then verify/automate): orchestration → backend → database → mcp → frontend → observability → testing → devops. Work in **vertical slices**: get one task feature working end to end before broadening. See [.claude/skills/README.md](.claude/skills/README.md).

## Target architecture (Clean Architecture, .NET 10 + Aspire)

```
Kairos.sln
src/
  Kairos.AppHost/          # Aspire orchestrator — wires postgres, web, mcp, observability (dev inner loop)
  Kairos.ServiceDefaults/  # shared OTel, health checks, resilience, service discovery (every host references it)
  Kairos.Web/              # Razor Pages UI + Minimal APIs; Tailwind/htmx/Alpine via Vite
  Kairos.Mcp/              # MCP server (ModelContextProtocol SDK, Streamable HTTP/SSE)
  Kairos.Domain/           # entities, value objects, domain rules — depends on nothing
  Kairos.Application/      # use cases, DTOs, FluentValidation validators, service interfaces
  Kairos.Infrastructure/   # EF Core (KairosDbContext), Npgsql, migrations, repositories
tests/
  Kairos.UnitTests/        # domain + validators (no I/O)
  Kairos.IntegrationTests/ # Testcontainers Postgres — real EF round-trips, MCP tools → DB
  Kairos.AppTests/         # Aspire.Hosting.Testing — full wired app model
```

**Dependency direction:** `Web`/`Mcp` → `Application` → `Domain`; `Infrastructure` → `Application`/`Domain`; `Domain` depends on nothing. Both hosts also reference `ServiceDefaults`.

## Cross-cutting contracts (these span many files — get them right once)

- **Resource names are a contract.** `postgres`, `kairosdb`, `web`, `mcp` must be **identical** across the Aspire AppHost, the `ConnectionStrings__kairosdb` keys in `Infrastructure`, and the service names in `docker-compose.yml`. The core domain aggregate is `TaskItem`.
- **One contract, two runtimes.** The Aspire AppHost is the source of truth for the resource graph; `docker-compose.yml` mirrors it; deployment manifests are generated. Names, ports, db name, and the OTLP endpoint stay the same in both.
- **Business logic lives only in `Domain`/`Application`.** `Web`, `Mcp`, and `Infrastructure` are thin adapters. The MCP tools and the Razor PageModels call the **same** application services — never duplicate logic or touch `DbContext` from a host.
- **Schema is code.** Every schema change is a reviewed EF migration in source control; the live DB is never hand-edited. Entities stay persistence-ignorant (no EF attributes) — all mapping is Fluent API, one `IEntityTypeConfiguration<T>` per entity, surfaced via `ApplyConfigurationsFromAssembly`.
- **UTC everywhere** (`DateTimeOffset`/`timestamptz`); **enums as strings** (`HasConversion<string>()`); explicit `MaxLength` on text columns.
- **Validation at the boundary** with FluentValidation — one validator per inbound command/DTO, shared by Web and MCP. MCP returns structured errors, never raw exceptions across the protocol.
- **Telemetry is centralized** in `Kairos.ServiceDefaults` — never configure OTel per-host. Apps emit OTLP only; the Collector owns fan-out to Prometheus/Loki/Tempo.
- **Nullable + implicit usings on; warnings-as-errors** (via root `Directory.Build.props`). Don't suppress an analyzer without an inline justification.
- **Connection strings/secrets come from Aspire/environment** — never hard-coded or committed.

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
npm run build                                 # bundles to ../wwwroot (manifest-referenced)

# Run the stack
#   dev inner loop — runs the full resource graph + Aspire dashboard:
dotnet run --project src/Kairos.AppHost
#   full containerized stack:
docker compose config                         # validate before up
docker compose up --build

# Code quality (mirrors CI; run before pushing)
dotnet format --verify-no-changes
dotnet build -c Release                       # warnings-as-errors
```

**CI is the merge contract:** `.github/workflows/ci.yml` runs format → build (`-c Release`) → test on a Docker-enabled runner; merges to `main` require green CI + review. Migrations apply at startup in dev (behind an environment guard); never `EnsureCreated()` alongside migrations, never edit an applied migration.

## Domain gotchas worth knowing up front

- **PostgreSQL 14+ is a hard floor** (target `postgres:17-alpine`). The schedule model depends on range/multirange types and the `btree_gist` extension: a `tstzrange` "during" column with an `EXCLUDE USING GIST (during WITH &&)` exclusion constraint enforces no-overlap on time blocks.
- **Free-slot detection is SQL, not C#.** `unnest(work_mr - range_agg(busy))` returns gaps directly; only the top-N ranking of the handful of returned rows happens in C#. Don't reimplement this in application code.
- **Google Calendar is read-only busy data** via incremental `syncToken` polling (~5 min jittered). Never mix `timeMin`/`timeMax` with `syncToken` in one request (400); on `410 Gone`, drop local gcal rows and re-sync. Push webhooks are deliberately deferred.
- **The only bespoke client JS is the SortableJS drag island**, which fires htmx once on drop (`onEnd`). Per-pixel server round-trips for drag (Blazor Server/SignalR) are an explicit anti-pattern here.
- **Deliberately excluded** (don't reintroduce): Blazor, React/SPA, Native AOT, SignalR/WebSockets, service workers/CRDTs, response caching, and auth/multi-user (schema leaves a `user_id` seam but there's no UI). See the tech-stack doc's exclusion table for reasons.
- **The Aspire dashboard is dev-only** — guard observability stack wiring with `builder.ExecutionContext.IsRunMode` / `IsDevelopment()`; the single-user prod compose runs a pared-down OTel pipeline.
