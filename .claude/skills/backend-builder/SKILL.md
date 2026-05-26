---
name: backend-builder
description: "Scaffold and build the Kairos .NET backend — Aspire-orchestrated ASP.NET Core + Razor Pages, EF Core/PostgreSQL, an MCP server, OpenTelemetry/Grafana observability, and Docker Compose. Use when the user asks to create, scaffold, extend, or wire up backend projects, entities, EF Core models/migrations, API or MCP endpoints, Aspire resources, or the container stack for Kairos."
---

# backend-builder

Build the Kairos backend exactly as specified in [docs/technology-stack.md](../../../docs/technology-stack.md). This skill is the procedural companion to that document: the tech-stack doc decides *what* the stack is, this skill decides *how* to assemble it consistently.

**Read [docs/technology-stack.md](../../../docs/technology-stack.md) first** — it is the source of truth. If anything here conflicts with it, the tech-stack doc wins; update this skill to match.

## Canonical stack (from the tech-stack doc)

- **Runtime:** .NET 10 (LTS), C#
- **Orchestration:** .NET Aspire (AppHost + ServiceDefaults)
- **Web/UI:** ASP.NET Core **Razor Pages** + Minimal APIs; Tailwind CSS + htmx + Alpine.js, bundled with Vite
- **Data:** PostgreSQL via **EF Core + Npgsql**, code-first migrations
- **Validation:** FluentValidation
- **AI:** **MCP server** using the `ModelContextProtocol` C# SDK (Streamable HTTP / SSE transport)
- **Observability:** OpenTelemetry → OTel Collector → Prometheus / Loki / Tempo → Grafana; Aspire dashboard in dev
- **Containers:** Docker for every service, `docker compose up` for the full local stack
- **Testing:** xUnit, Testcontainers for .NET, FluentAssertions, Aspire.Hosting.Testing

## Target solution layout

```
Kairos.sln
src/
  Kairos.AppHost/            # .NET Aspire orchestrator — wires Postgres, web, mcp, observability
  Kairos.ServiceDefaults/    # shared OTel, health checks, resilience, service discovery
  Kairos.Web/                # Razor Pages UI + Minimal APIs (Tailwind/htmx/Alpine via Vite)
  Kairos.Mcp/                # MCP server (ASP.NET Core host, ModelContextProtocol SDK)
  Kairos.Domain/             # entities, value objects, domain rules (no external deps)
  Kairos.Application/        # use cases, DTOs, FluentValidation validators, interfaces
  Kairos.Infrastructure/     # EF Core DbContext, Npgsql, migrations, repositories
tests/
  Kairos.UnitTests/
  Kairos.IntegrationTests/   # Testcontainers Postgres + Aspire.Hosting.Testing
```

Dependency direction (Clean Architecture): `Web`/`Mcp` → `Application` → `Domain`; `Infrastructure` → `Application`/`Domain`. `Domain` depends on nothing. Both hosts reference `ServiceDefaults`.

## Build workflow

Work in vertical slices — get one thing running end to end before adding the next. Run `dotnet build` after each project is added; don't batch failures.

### 1. Solution & shared projects
```powershell
dotnet new sln -n Kairos
dotnet new aspire-apphost      -n Kairos.AppHost        -o src/Kairos.AppHost
dotnet new aspire-servicedefaults -n Kairos.ServiceDefaults -o src/Kairos.ServiceDefaults
dotnet new classlib -n Kairos.Domain      -o src/Kairos.Domain
dotnet new classlib -n Kairos.Application -o src/Kairos.Application
dotnet new classlib -n Kairos.Infrastructure -o src/Kairos.Infrastructure
dotnet new webapp   -n Kairos.Web         -o src/Kairos.Web        # Razor Pages
dotnet new web      -n Kairos.Mcp         -o src/Kairos.Mcp        # Minimal host for MCP
# add every project to the solution
dotnet sln add (Get-ChildItem -Recurse src,tests -Filter *.csproj)
```
Wire project references per the dependency direction above. Every executable host references `Kairos.ServiceDefaults` and calls `builder.AddServiceDefaults()`.

### 2. Domain & Application
- Put entities in `Kairos.Domain` (start with the `Task`/scheduling aggregate — Kairos = "the right time to do a task"). Keep it free of EF/ASP.NET types.
- In `Kairos.Application`: DTOs, service interfaces (e.g. `ITaskService`, `ITaskRepository`), and a `FluentValidation` validator per inbound model. Register validators with `AddValidatorsFromAssembly(...)`.

### 3. Data (EF Core + PostgreSQL)
- In `Kairos.Infrastructure`: add `KairosDbContext`, configure entities with `IEntityTypeConfiguration<T>`.
- Add packages: `Npgsql.EntityFrameworkCore.PostgreSQL`, `Microsoft.EntityFrameworkCore.Design`, and `Aspire.Npgsql.EntityFrameworkCore.PostgreSQL`.
- Register in the host with the Aspire integration so connection strings come from the AppHost:
  ```csharp
  builder.AddNpgsqlDbContext<KairosDbContext>("kairosdb");
  ```
- Migrations:
  ```powershell
  dotnet ef migrations add <Name> --project src/Kairos.Infrastructure --startup-project src/Kairos.Web
  ```
- Apply migrations at startup in development (guard with environment check) or via a migration bundle.

### 4. Aspire AppHost — wire the resources
In `Kairos.AppHost/AppHost.cs`, provision Postgres and reference it from the hosts:
```csharp
var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres")
                      .WithDataVolume()
                      .WithPgAdmin();          // optional dev DB UI
var kairosdb = postgres.AddDatabase("kairosdb");

var web = builder.AddProject<Projects.Kairos_Web>("web")
                 .WithReference(kairosdb)
                 .WaitFor(kairosdb);

builder.AddProject<Projects.Kairos_Mcp>("mcp")
       .WithReference(kairosdb)
       .WaitFor(kairosdb);

builder.Build().Run();
```
Add Grafana/Prometheus/Loki/Tempo/OTel-Collector as containers here too (`builder.AddContainer(...)`) or via the Docker Compose stack in step 7 — keep one source of truth and reference it from the doc.

### 5. Web (Razor Pages + frontend toolchain)
- Razor Pages under `Pages/`; expose task operations both as pages and Minimal API endpoints (`app.MapGet/MapPost...`) for htmx partials.
- Front-end assets: set up **Tailwind CSS** (`tailwind.config.js` scanning `Pages/**/*.cshtml`), **htmx** + **Alpine.js**, bundled with **Vite**. Output compiled assets to `wwwroot/`. Add an npm `build`/`dev` script and invoke `npm run build` from the csproj on publish.
- Keep the server authoritative: htmx drives partial updates, Alpine handles small client-only behaviors.

### 6. MCP server
- In `Kairos.Mcp`, add the `ModelContextProtocol` (and ASP.NET Core MCP hosting) packages.
- Register the server and expose **tools** that delegate to `Kairos.Application` services — never duplicate business logic:
  ```csharp
  builder.Services.AddMcpServer()
         .WithHttpTransport()
         .WithToolsFromAssembly();
  ```
- Implement tools so an AI client can manage tasks: `list_tasks`, `create_task`, `update_task`, `delete_task`, `reschedule_task`. Annotate with `[McpServerTool, Description(...)]`. Validate inputs with the same FluentValidation validators.
- Map the MCP endpoint (`app.MapMcp()`), exposed over Streamable HTTP / SSE.

### 7. Observability
- Telemetry is centralized in `Kairos.ServiceDefaults` (`AddServiceDefaults` / `ConfigureOpenTelemetry`): OTLP exporter for traces, metrics, and logs. Hosts inherit it automatically.
- Add EF Core, ASP.NET Core, and HTTP client instrumentation.
- In dev, the Aspire dashboard shows signals. For the Grafana stack, point the OTel Collector at Prometheus (metrics), Loki (logs), and Tempo (traces); provision Grafana dashboards/datasources as files.

### 8. Docker & Compose
- Add a `Dockerfile` for `Kairos.Web` and `Kairos.Mcp` (multi-stage: SDK build → runtime image).
- Author `docker-compose.yml` bringing up: `web`, `mcp`, `postgres`, `otel-collector`, `prometheus`, `loki`, `tempo`, `grafana`. Use a shared network and named volumes for Postgres + Grafana.
- `docker compose up` must bring the entire stack up locally. Keep ports and service names consistent with the architecture diagram in the tech-stack doc.

### 9. Tests
- `Kairos.UnitTests`: domain + validators with xUnit + FluentAssertions.
- `Kairos.IntegrationTests`: spin a real Postgres with **Testcontainers**, and use **Aspire.Hosting.Testing** to test the wired app model end to end (including MCP tools hitting the DB).

## Conventions

- **Nullable + implicit usings** on; treat warnings as errors in CI.
- Business logic lives in `Application`/`Domain`. `Web`, `Mcp`, and `Infrastructure` are thin adapters — the MCP tools and Razor pages call the *same* application services.
- One `IEntityTypeConfiguration<T>` per entity; no fluent config inline in `OnModelCreating` beyond `ApplyConfigurationsFromAssembly`.
- A FluentValidation validator for every inbound command/DTO, shared across Web and MCP.
- Connection strings and secrets come from Aspire / environment — never hard-coded.
- After scaffolding each project: `dotnet build`. Before declaring done: `dotnet build` + `dotnet test` clean, and `docker compose up` succeeds.

## Definition of done

A change is complete when: the solution builds, tests pass, `dotnet ef migrations` is current, the Aspire AppHost runs the full graph, the MCP tools operate against Postgres, telemetry reaches Grafana, and `docker compose up` brings up every service. Anything skipped is called out explicitly.
