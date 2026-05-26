# Kairos — Technology Stack

> _"The right & opportune time to do a task."_

This document lists the technologies used across the Kairos project, grouped by concern. It is the canonical reference for the stack; update it whenever a dependency or platform decision changes.

---

## Platform & Runtime

| Technology | Purpose | Notes |
|---|---|---|
| **.NET 10 (LTS)** | Core runtime for all backend services | LTS release; long support window |
| **C#** | Primary language | Latest language version shipped with .NET 10 |
| **.NET Aspire** | Cloud-native app orchestration | App host, service discovery, resource wiring, local dev dashboard |

## Backend

| Technology | Purpose | Notes |
|---|---|---|
| **ASP.NET Core** | Web framework | Hosts Razor Pages app + API/MCP endpoints |
| **Razor Pages** | Server-rendered UI pages | Page-focused, server-side rendering model |
| **Minimal APIs** | Lightweight HTTP endpoints | For internal/service-to-service and MCP transport |
| **Entity Framework Core** | ORM / data access | Code-first migrations, LINQ querying |
| **Npgsql** | PostgreSQL ADO.NET + EF Core provider | First-class Postgres driver for .NET |
| **FluentValidation** | Request/model validation | Clean separation of validation rules |
| **MediatR** _(optional)_ | In-process messaging / CQRS | Useful if vertical-slice / handler style is adopted |

## Frontend

| Technology | Purpose | Notes |
|---|---|---|
| **Razor Pages** | Server-rendered markup | Primary view layer |
| **Tailwind CSS** | Utility-first CSS framework | Styling system; compiled via Tailwind CLI / PostCSS |
| **htmx** | Dynamic partial updates without SPA complexity | Pairs naturally with server-rendered Razor Pages |
| **Alpine.js** | Lightweight client-side interactivity | Small reactive behaviors (dropdowns, toggles, modals) |
| **Vite** | Front-end asset bundling & dev server | Builds/minifies CSS + JS, HMR during development |

> **Why this combo:** Razor Pages stays the source of truth on the server. Tailwind handles styling, htmx handles server-driven interactivity, and Alpine.js covers small client-only behaviors — giving a modern UX without adopting a heavy SPA framework.

## Database

| Technology | Purpose | Notes |
|---|---|---|
| **PostgreSQL** | Primary relational database | Runs as a container; provisioned via Aspire |
| **EF Core Migrations** | Schema management | Versioned, applied at startup or via migration bundles |
| **pgAdmin** _(optional, dev)_ | DB administration UI | Convenience container for local development |

## AI Integration (MCP)

| Technology | Purpose | Notes |
|---|---|---|
| **Model Context Protocol (MCP)** | Expose Kairos to AI agents | Lets AI clients read tasks and add/remove/update items |
| **MCP C# SDK** (`ModelContextProtocol`) | Build the MCP server in .NET | Official C# SDK for implementing MCP tools/resources |
| **ASP.NET Core MCP Server** | Hosting transport for MCP | Streamable HTTP / SSE transport exposed by the app |

> The MCP server publishes **tools** (e.g. `create_task`, `delete_task`, `list_tasks`, `reschedule_task`) and **resources** so an AI assistant can manage Kairos content conversationally.

## Observability

| Technology | Purpose | Notes |
|---|---|---|
| **OpenTelemetry** | Traces, metrics, and logs instrumentation | Vendor-neutral; built into the Aspire service defaults |
| **OpenTelemetry Collector** | Telemetry pipeline / export | Receives OTLP and fans out to backends |
| **Grafana** | Dashboards & visualization | Single pane of glass for all signals |
| **Prometheus** | Metrics storage & querying | Scrapes/receives metrics |
| **Grafana Loki** | Log aggregation | Centralized structured logs |
| **Grafana Tempo** | Distributed tracing backend | Stores OTLP traces |
| **.NET Aspire Dashboard** | Local-dev telemetry view | Built-in OTLP dashboard for traces/metrics/logs during development |

## Containerization & Orchestration

| Technology | Purpose | Notes |
|---|---|---|
| **Docker** | Containerize every service | App, database, observability stack, MCP server |
| **Docker Compose** | Spin up the full stack locally | Single `docker compose up` brings up all services |
| **.NET Aspire AppHost** | Dev-time orchestration & service discovery | Can also emit deployment manifests |

## Testing & Quality

| Technology | Purpose | Notes |
|---|---|---|
| **xUnit** | Unit & integration testing | Primary test framework |
| **Testcontainers for .NET** | Real Postgres in integration tests | Ephemeral containerized dependencies |
| **FluentAssertions** | Expressive test assertions | Readable assertion syntax |
| **Aspire.Hosting.Testing** | Test against the Aspire app model | End-to-end orchestration tests |

## Tooling & DevOps

| Technology | Purpose | Notes |
|---|---|---|
| **Git / GitHub** | Source control & collaboration | Repository hosting |
| **GitHub Actions** | CI/CD pipelines | Build, test, container publish |
| **EditorConfig** | Consistent code style | Shared formatting rules |
| **dotnet format / analyzers** | Linting & style enforcement | Build-time code quality gates |

---

## Architecture at a Glance

```
                         ┌─────────────────────────┐
              AI Client ─▶│   MCP Server (ASP.NET)  │
                         └────────────┬────────────┘
                                      │
   Browser ──▶ Razor Pages + htmx ──▶ │ ASP.NET Core App
              (Tailwind / Alpine)     │      │
                                      │      ▼
                                      │   EF Core ──▶ PostgreSQL
                                      │
              OpenTelemetry (OTLP) ───┘──▶ Collector ──▶ Prometheus / Loki / Tempo ──▶ Grafana

   Orchestrated by .NET Aspire  •  Packaged with Docker  •  Run via Docker Compose
```

---

_Last updated: 2026-05-27_
