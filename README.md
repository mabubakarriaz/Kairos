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

🚧 **Early development.** The design is complete (see [`docs/`](docs/)) and the application is being scaffolded slice by slice. The instructions below describe how the project is intended to be built and run.

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

## Documentation

- [docs/technology-stack.md](docs/technology-stack.md) — the canonical technology stack and architecture.
- [docs/research.md](docs/research.md) — the rationale, benchmarks, MVP spec, performance budgets, and rejected alternatives behind the stack.

## License

See [LICENSE](LICENSE).
