---
name: orchestration-builder
description: "Build the Kairos orchestration & container layer — the .NET Aspire AppHost that wires every service together for dev, the per-service Dockerfiles, and the docker-compose.yml that brings the whole stack up with `docker compose up`. Use when the user asks to create or change the Aspire AppHost, ServiceDefaults, service discovery/resource wiring, Dockerfiles, docker-compose, container networking/volumes, or deployment manifests for Kairos."
---

# orchestration-builder

Build the Kairos orchestration layer exactly as specified in [docs/technology-stack.md](../../../docs/technology-stack.md). This skill is the procedural companion to that document for *tying everything together*: the tech-stack doc decides *what* runs, this skill decides *how* the pieces are orchestrated, containerized, and launched as one stack. It is the integrator over its siblings — `backend-builder`, `frontend-builder`, `database-builder`, `observability-builder`, and `mcp-builder` each own a slice; this skill assembles them into a runnable whole.

**Read [docs/technology-stack.md](../../../docs/technology-stack.md) first** — it is the source of truth. If anything here conflicts with it, the tech-stack doc wins; update this skill to match.

## Canonical orchestration stack (from the tech-stack doc)

- **Dev orchestration:** **.NET Aspire AppHost** — service discovery, resource wiring, connection-string injection, OTLP endpoint injection, the dev dashboard; can emit deployment manifests
- **Shared defaults:** **`Kairos.ServiceDefaults`** — OTel, health checks, resilience, service discovery applied to every host
- **Containers:** **Docker** — every service is containerized (web, mcp, postgres, observability stack)
- **Local stack:** **Docker Compose** — a single `docker compose up` brings up all services

> **Guiding principle:** two front doors, one truth. The **Aspire AppHost** is the inner-loop dev orchestrator; **Docker Compose** is the full containerized stack. Service names, ports, database names, and the OTLP endpoint must stay identical across both so behavior is consistent. Each service owns its own Dockerfile; this skill owns how they connect.

## What lives where

```
Kairos.sln
src/
  Kairos.AppHost/            # Aspire orchestrator — declares resources + references (dev inner loop)
  Kairos.ServiceDefaults/    # shared OTel/health/resilience/discovery (referenced by every host)
  Kairos.Web/Dockerfile      # owned by frontend/backend builders; wired here
  Kairos.Mcp/Dockerfile      # owned by mcp-builder; wired here
observability/               # collector/prometheus/loki/tempo/grafana configs (observability-builder)
docker-compose.yml           # the full local stack (this skill)
.dockerignore
```

## Build workflow

Get the Aspire AppHost running the full graph first (fastest feedback), then mirror it in Docker Compose. Run `dotnet build` after AppHost changes and `docker compose config` to validate compose before `up`. Don't batch failures.

### 1. ServiceDefaults (shared host wiring)
Every executable host references `Kairos.ServiceDefaults` and calls `builder.AddServiceDefaults()` + `app.MapDefaultEndpoints()`. It centralizes:
- OpenTelemetry (delegated to `observability-builder`),
- **health checks** (`/health` liveness, `/alive` readiness),
- **HTTP resilience** (`AddStandardResilienceHandler`),
- **service discovery** for inter-service calls by logical name.

### 2. Aspire AppHost — the dev orchestrator (`Kairos.AppHost/AppHost.cs`)
Declare every resource and wire references so connection strings + endpoints are injected automatically:
```csharp
var builder = DistributedApplication.CreateBuilder(args);

// Data (database-builder owns the details)
var postgres = builder.AddPostgres("postgres").WithDataVolume().WithPgAdmin();
var kairosdb = postgres.AddDatabase("kairosdb");

// Services
var web = builder.AddProject<Projects.Kairos_Web>("web")
                 .WithReference(kairosdb).WaitFor(kairosdb)
                 .WithExternalHttpEndpoints();

var mcp = builder.AddProject<Projects.Kairos_Mcp>("mcp")
                 .WithReference(kairosdb).WaitFor(kairosdb);

// (Optional) run the observability stack as Aspire containers for a unified dev loop,
// or keep it in docker-compose only — pick one source of truth and note it here.

builder.Build().Run();
```
Resource names (`postgres`, `kairosdb`, `web`, `mcp`) are the contract — they must match the connection-string keys used in `Kairos.Infrastructure` and the service names in `docker-compose.yml`.

### 3. Per-service Dockerfiles (multi-stage)
Each service owns a `Dockerfile` (authored by its builder); this skill ensures they follow one pattern: restore → build → publish → slim runtime image.
- **`Kairos.Web`**: includes a Node stage to build front-end assets (`npm ci && npm run build`) feeding the published `wwwroot` (see `frontend-builder`), then the .NET runtime stage.
- **`Kairos.Mcp`**: pure .NET multi-stage (see `mcp-builder`).
Use the `mcr.microsoft.com/dotnet/sdk:10.0` build image and `aspnet:10.0` runtime image, run as a non-root user, and expose only the needed port. Add a thorough `.dockerignore` (bin/obj, node_modules, .git, etc.).

### 4. docker-compose.yml — the full local stack
Bring up every service on a shared network with named volumes. Mirror the AppHost contract exactly:
```yaml
services:
  postgres:
    image: postgres:17
    environment: { POSTGRES_DB: kairosdb, POSTGRES_USER: kairos, POSTGRES_PASSWORD: kairos }
    volumes: ["pgdata:/var/lib/postgresql/data"]
    networks: [kairos]

  web:
    build: { context: ., dockerfile: src/Kairos.Web/Dockerfile }
    environment:
      ConnectionStrings__kairosdb: "Host=postgres;Database=kairosdb;Username=kairos;Password=kairos"
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4317"
    depends_on: [postgres, otel-collector]
    ports: ["8080:8080"]
    networks: [kairos]

  mcp:
    build: { context: ., dockerfile: src/Kairos.Mcp/Dockerfile }
    environment:
      ConnectionStrings__kairosdb: "Host=postgres;Database=kairosdb;Username=kairos;Password=kairos"
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector:4317"
    depends_on: [postgres, otel-collector]
    ports: ["8081:8080"]
    networks: [kairos]

  # otel-collector, prometheus, loki, tempo, grafana — defined per observability-builder
  # (mount their observability/* configs; same `kairos` network; named volumes)

volumes: { pgdata: {}, grafana: {}, prometheus: {}, loki: {}, tempo: {} }
networks: { kairos: {} }
```
- Connection-string env keys use the `ConnectionStrings__<name>` convention so config binding matches the Aspire resource name.
- `depends_on` enforces start ordering; pair with health checks for readiness.
- Keep ports, service names, db name, and the OTLP endpoint **identical** to the AppHost contract.

### 5. Launch & verify
- **Dev inner loop:** run `Kairos.AppHost` → the Aspire dashboard shows every resource, logs, and telemetry; service discovery wires web↔mcp↔db.
- **Full stack:** `docker compose config` (validate) → `docker compose up --build` → confirm web is reachable, mcp serves MCP, Postgres persists, and Grafana shows signals.

### 6. Deployment manifest (optional)
Aspire can emit a deployment manifest (`aspire manifest` / publish) for environments beyond local. Treat it as generated output; keep the AppHost as the source of truth.

### 7. Health & startup ordering
- Expose `/health` and `/alive` from ServiceDefaults; add health checks to compose services so dependents wait for *ready*, not just *started*.
- Migrations: run at startup in dev (guarded) or as a one-shot migrator step (see `database-builder`) — don't race app startup against an unready database.

## Conventions

- **One contract, two runtimes.** Resource/service names, ports, `kairosdb` name, and the OTLP endpoint are identical in the AppHost and `docker-compose.yml`.
- **Every service is containerized** and joins the shared `kairos` network; stateful services use named volumes.
- **Config via environment**, never baked into images; secrets come from the environment/Aspire, never committed.
- **Multi-stage, non-root, minimal** images; `.dockerignore` keeps build context lean.
- **AppHost is the source of truth** for the resource graph; compose mirrors it; deployment manifests are generated.
- After changes: `dotnet build` clean, `docker compose config` valid, `docker compose up --build` brings up the whole stack, AppHost runs the full graph.

## Definition of done

The orchestration layer is complete when: every host uses `ServiceDefaults`; the Aspire AppHost runs the full resource graph (postgres + web + mcp, with the dashboard showing telemetry) in dev; each service has a multi-stage, non-root Dockerfile; `docker compose up --build` brings up web, mcp, postgres, and the observability stack on one network with persistent volumes; names/ports/db/OTLP endpoint match across AppHost and compose; and health checks gate startup ordering. Anything skipped is called out explicitly.
