# Kairos

> _"The right & opportune time to do a task."_

Kairos is a single-user todo app built around **time blocking**. Instead of a flat checklist, your tasks live on a day timeline — a Google-Calendar-style schedule view — so you plan _when_ you'll do something, not just _what_. It pulls your Google Calendar busy events in (read-only) so your tasks and meetings share one view, helps you find open slots, and exposes everything to AI assistants so you can manage your day in plain language.

## Features

- **Time-blocked schedule view** — tasks rendered as blocks on a day timeline, with drag-to-reschedule.
- **Standard todo features** — create, edit, complete, delete, prioritize, and reschedule tasks.
- **No-overlap scheduling** — the database enforces that time blocks can't collide.
- **Free-slot finding** — ask "what open slots do I have tomorrow?" and get real gaps around your busy time.
- **Google Calendar integration** — read-only busy events shown alongside your Kairos tasks.
- **AI assistant integration** — an MCP server lets AI clients list, create, update, delete, reschedule tasks and query free slots conversationally.

## Tech stack

ASP.NET Core (Razor Pages + Minimal APIs) on **.NET 10**, with Tailwind CSS + htmx + Alpine.js on the front end, **PostgreSQL** via EF Core for storage, an **MCP** server for AI access, and OpenTelemetry → Grafana for observability — all orchestrated with **.NET Aspire** and packaged with **Docker Compose**. See [docs/technology-stack.md](docs/technology-stack.md) for the full stack and the rationale behind each choice.

## Status

🟢 **MVP scaffolded.** The full stack is in place — solution, Clean Architecture layers, the PostgreSQL range/multirange schema (with the no-overlap exclusion constraint + SQL free-slot finder), the time-blocked schedule view (add a task with a time range → it renders as a block; drag to reschedule), the in-process MCP server, OpenTelemetry, the dev/prod compose split, and the xUnit + Testcontainers + Aspire test tiers. Google Calendar sync (Slice 4) and recurring blocks (Slice 5) are scaffolded behind feature flags but off by default.

## Getting started

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (PostgreSQL and the observability stack run in containers)
- [Node.js](https://nodejs.org/) LTS (builds the front-end assets)
- A Google Cloud OAuth client with the `calendar.events.readonly` scope (only needed for calendar sync)

### Run it (dev — recommended)

The .NET Aspire AppHost orchestrates everything for local development — it starts PostgreSQL, the web app (which serves the UI, the API, and the MCP endpoint), and a dashboard with live logs and telemetry:

```bash
dotnet run --project src/Kairos.AppHost
```

Open the Aspire dashboard URL printed in the console; from there you can reach the web app and watch every service.

### Run it (full container stack)

To bring up the entire stack — the app (UI + API + MCP), PostgreSQL, a reverse proxy for HTTPS, and the Grafana/Prometheus/Loki/Tempo observability stack — in containers. Dev runs the full observability stack; `compose.prod.yml` runs a pared-down OTel pipeline:

```bash
docker compose -f compose.dev.yml config        # validate
docker compose -f compose.dev.yml up --build
```

### Connecting an AI client

The MCP server runs in-process and is exposed over Streamable HTTP at the `/mcp` endpoint of the Kairos web app. Point an MCP-capable client (e.g. Claude) at that URL to manage your tasks conversationally.

## Feature flags

Each vertical slice ships behind a boolean in `src/Kairos.Web/appsettings.json` (`Features` section) so it's independently demoable:

| Flag | Default | What it gates |
|---|---|---|
| `ScheduleView` | `true` | Schedule view + add tasks with time ranges (the MVP) |
| `FreeSlotSuggestions` | `true` | Top-N free-slot suggestions panel |
| `Mcp` | `true` | In-process MCP server at `/mcp` |
| `GoogleCalendarSync` | `false` | Google Calendar read-only busy import (Slice 4) |
| `RecurringBlocks` | `false` | Recurring Kairos blocks via `rrule` (Slice 5) |

## Develop & test (mirrors CI — run before pushing)

```bash
dotnet tool restore                               # pinned dotnet-ef
dotnet format --verify-no-changes                 # style/analyzer gate
dotnet build -c Release                           # warnings-as-errors
dotnet test                                       # unit + integration (Testcontainers) + app-model (Aspire); needs Docker
node scripts/check-bundle-size.mjs                # ≤ 80 KB gzipped JS gate (after the Vite build)
npx playwright test                               # tests/e2e — TTI + drop→DB budgets
k6 run tests/load/schedule_swap.js                # htmx-swap + Postgres-query p95/p99 budgets
```

`.github/workflows/ci.yml` runs the same gates on every PR; `publish.yml` pushes the `web` image to GHCR on a `v*` tag. GitFlow: feature branch per slice → `develop` → `main`, tag `v0.N` on release.

## Backups (rehearsed, not assumed)

```powershell
pwsh scripts/backup.ps1          # nightly pg_dump -Fc + GFS retention (14 daily / 8 weekly / 12 monthly)
pwsh scripts/restore-drill.ps1   # throwaway container + pg_restore + assert tasks reappear (rehearse in Slice 0)
```

## Documentation

- [docs/technology-stack.md](docs/technology-stack.md) — the canonical technology stack and architecture.
- [docs/research.md](docs/research.md) — the rationale, benchmarks, MVP spec, performance budgets, and rejected alternatives behind the stack.

## License

See [LICENSE](LICENSE).
