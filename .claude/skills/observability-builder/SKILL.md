---
name: observability-builder
description: "Build Kairos observability — OpenTelemetry instrumentation (traces, metrics, logs) with Kairos custom spans/metrics, exported via an OTel Collector to Prometheus, Loki, and Tempo and visualized in Grafana (dev), plus a pared-down OTel-to-disk pipeline for prod, the postgres-exporter sidecar, dotnet-counters, web-vitals, and the dev-only Aspire dashboard. Use when the user asks to add or wire up telemetry, instrumentation, custom spans/metrics, the OTel Collector, Prometheus/Loki/Tempo, Grafana dashboards/datasources/alerts, OTLP exporters, postgres-exporter, or the observability containers for Kairos."
---

# observability-builder

Build the Kairos observability stack the way the **Observability** stack slice this skill owns prescribes. This skill is the *procedural companion* to that slice for the telemetry layer: the slice decides **what** the observability stack is, this skill decides **how** to assemble it consistently. The other builders produce the services that emit telemetry; this one collects, stores, visualizes, and alerts on it.

## References — read when you need them

Keep this file lean. The *what* (the stack) and the underlying *patterns* live in two companion files next to this skill; load them when the task calls for it instead of restating them here:

- **[references/technology-stack.md](references/technology-stack.md)** — the **Observability** stack slice this skill owns: OpenTelemetry, the OTel Collector, Prometheus / Loki / Tempo / Grafana, the postgres-exporter sidecar, `dotnet-counters`, web-vitals.js, and the dev-only Aspire Dashboard. Read it before scaffolding, or whenever you need an exact tool, port, or signal mapping.
- **[references/design-pattern.md](references/design-pattern.md)** — the patterns that shape this slice: **Facade** (`ServiceDefaults` as the one instrumentation front door), **Mediator** (the Collector), **Pipes & Filters** (the receive → process → export pipeline), **Observer** (the instrumentation). Read it before designing the instrumentation seam or the collector pipelines.
- The "minimum viable observability" rationale, the NFR budget table the alerts enforce, and the dev/prod-split reasoning are in [docs/research.md](../../../docs/research.md) — consult it for *why*.

If anything here conflicts with the tech-stack slice (or the cross-cutting [index](../../../docs/technology-stack.md)), the slice wins — update this skill to match.

> **Guiding principle:** every service exports OTLP and knows nothing about the backends — the Collector owns fan-out, so backends can change without touching app code. And **dev ≠ prod:** dev runs the full Prom/Loki/Tempo/Grafana + Aspire Dashboard; **prod runs a pared-down Collector to a local Prometheus + file logs**, because a full obs stack can out-consume the app itself on one machine.

## Telemetry flow

```
                              ┌───────────────────────────────── dev (compose.dev.yml) ──┐
Kairos.Web  ──OTLP──▶ OTel Collector ──▶ Prometheus (metrics) ──┐                          │
  (ServiceDefaults: OTel;          ──▶ Loki  (logs + auto_explain)├─▶ Grafana (dashboards   │
   Razor + /api/* + /mcp +         ──▶ Tempo (traces)            ─┘    + NFR-budget alerts) │
   GoogleCalendarSyncWorker)                                          + Aspire Dashboard    │
        + postgres-exporter ──▶ Prometheus (pg_stat_statements)   ─┘                        │
        + web-vitals.js ──OTLP──▶ Collector (INP custom metric)                             │
                              └──────────────────────────────────────────────────────────┘
prod (compose.prod.yml): Kairos.Web ──OTLP──▶ pared-down Collector ──▶ local Prometheus + file logs
```

MCP runs in-process inside `Kairos.Web`, so there's one app emitter (no separate `mcp` service).

## Target layout

```
src/Kairos.ServiceDefaults/
  Extensions.cs               # AddServiceDefaults / ConfigureOpenTelemetry — central instrumentation
  Telemetry.cs                # Kairos ActivitySource + Meter (custom spans + metrics)
observability/
  otel-collector/
    config.dev.yaml           # full fan-out: prom + loki + tempo
    config.prod.yaml          # pared-down: prometheus + file logs only
  prometheus/prometheus.yml
  loki/loki-config.yaml
  tempo/tempo.yaml
  grafana/
    provisioning/
      datasources/datasources.yaml    # Prometheus, Loki, Tempo (+ trace↔log correlation)
      dashboards/dashboards.yaml       # dashboard provider
      alerting/alerts.yaml             # NFR-budget alert rules
    dashboards/                        # *.json (ASP.NET RED, runtime, EF/Npgsql, gcal sync, MCP, Postgres)
compose.dev.yml               # full obs stack + Aspire dashboard
compose.prod.yml              # pared-down OTel-to-disk
```

## Build workflow

Wire instrumentation first and confirm signals reach the **Aspire dashboard** before standing up the Grafana stack — that isolates app-side problems from collector/backend ones. Don't batch failures.

### 1. Centralize instrumentation in ServiceDefaults
All telemetry lives in `Kairos.ServiceDefaults` so `Kairos.Web` inherits it via `builder.AddServiceDefaults()`. **Never configure OTel per-host.**
```csharp
builder.Logging.AddOpenTelemetry(o => { o.IncludeFormattedMessage = true; o.IncludeScopes = true; });

builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService(builder.Environment.ApplicationName))
    .WithMetrics(m => m
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddRuntimeInstrumentation()
        .AddMeter(KairosTelemetry.MeterName))          // custom metrics
    .WithTracing(t => t
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddEntityFrameworkCoreInstrumentation()
        .AddNpgsql()
        .AddSource(KairosTelemetry.ActivitySourceName)); // custom spans

builder.Services.AddOpenTelemetry().UseOtlpExporter();    // Aspire sets the endpoint automatically
```
Set resource attributes (`service.name`, `service.namespace=kairos`, `service.version`, `deployment.environment`) so signals are attributable in Grafana.

### 2. Kairos custom spans & metrics (`Telemetry.cs`)
Add an `ActivitySource` and a `Meter` and register their names (above). Emit the spans/metrics named in the tech-stack doc:
- **Custom spans:** `schedule.render`, `freeslots.compute`, `gcal.sync.cycle`, `task.reschedule`.
- **Custom metrics:** `kairos_htmx_partial_swap_seconds` (histogram), `kairos_postgres_query_seconds` (histogram), `kairos_gcal_sync_lag_seconds` (gauge), `kairos_active_tasks` (gauge), `kairos_gcal_rate_limited_total` (counter), plus a `kairos_gcal_token_refresh_failed_total` counter for the token-refresh budget.
- `backend-builder`/`frontend-builder`/`mcp-builder` start/stop these spans and record these metrics at the right call sites (schedule render, the free-slot SQL, the sync worker cycle, the reschedule POST, MCP tool calls).

### 3. Instrumentation coverage
- **HTTP server/client:** ASP.NET Core + HttpClient (covers Razor Pages, `/api/*`, the in-process MCP transport, and the Google Calendar client).
- **Data:** EF Core + Npgsql for query traces/metrics.
- **Runtime:** GC, thread-pool, allocation metrics; spot-check steady state with `dotnet-counters monitor` (≤ 300 MB RSS budget).
- **Postgres:** the **postgres-exporter** sidecar scrapes `pg_stat_statements` (watch the GiST-overlap and free-slot queries against the p95/p99 budgets); `auto_explain` (`log_min_duration=50ms`) plans flow to Loki.
- **Client:** **web-vitals.js** reports INP as an OTel custom metric for the input-latency budget (see `frontend-builder`).

### 4. OTLP endpoint configuration
- **Dev:** Aspire injects `OTEL_EXPORTER_OTLP_ENDPOINT` pointing at the Aspire dashboard — nothing else to do.
- **Container stack:** point the app at the Collector: `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317` (gRPC) in compose.

### 5. OTel Collector — dev vs prod configs
- **`config.dev.yaml`** — receive OTLP, batch + memory_limiter, fan out one signal per backend:
```yaml
receivers: { otlp: { protocols: { grpc: { endpoint: 0.0.0.0:4317 }, http: { endpoint: 0.0.0.0:4318 } } } }
processors: { batch: {}, memory_limiter: { check_interval: 1s, limit_percentage: 80 } }
exporters:
  otlp/tempo:    { endpoint: tempo:4317, tls: { insecure: true } }
  prometheus:    { endpoint: 0.0.0.0:8889 }
  otlphttp/loki: { endpoint: http://loki:3100/otlp }
service:
  pipelines:
    traces:  { receivers: [otlp], processors: [memory_limiter, batch], exporters: [otlp/tempo] }
    metrics: { receivers: [otlp], processors: [memory_limiter, batch], exporters: [prometheus] }
    logs:    { receivers: [otlp], processors: [memory_limiter, batch], exporters: [otlphttp/loki] }
```
- **`config.prod.yaml`** — pared down: keep the metrics pipeline to a **local Prometheus** and write logs to a **file exporter**; **drop Tempo/Loki** (and no Grafana). This is the deliberate single-user prod posture.

### 6. Prometheus — `observability/prometheus/prometheus.yml`
Scrape the Collector's Prometheus exporter and the postgres-exporter:
```yaml
global: { scrape_interval: 15s }
scrape_configs:
  - { job_name: otel-collector,    static_configs: [ { targets: ["otel-collector:8889"] } ] }
  - { job_name: postgres-exporter, static_configs: [ { targets: ["postgres-exporter:9187"] } ] }
```

### 7. Loki & Tempo (dev)
- **Loki** (`loki-config.yaml`): single-binary/filesystem config; ingests logs over OTLP (`/otlp/v1/logs`) — including Postgres `auto_explain` output.
- **Tempo** (`tempo.yaml`): OTLP receiver on `4317`; local block storage.

### 8. Grafana provisioning + NFR alerts
- `datasources.yaml`: register **Prometheus**, **Loki**, **Tempo**; wire **correlation** (Tempo `tracesToLogs`/`tracesToMetrics`, Loki `derivedFields` for `trace_id`) so you can jump trace ↔ logs ↔ metrics.
- `dashboards.yaml` + `dashboards/*.json`: ASP.NET RED (rate/latency/errors), .NET runtime, EF Core/Npgsql query latency, **gcal sync** (lag + rate-limit counters), **MCP tool usage**, and **Postgres** (postgres-exporter / `pg_stat_statements`).
- `alerting/alerts.yaml` — **alert on the NFR budgets** from the research report:
  - `schedule.render` p95 > 300 ms · htmx swap p95 > 50 ms / p99 > 120 ms · Postgres window query p95 > 5 ms · free-slots query p95 > 10 ms · `kairos_gcal_sync_lag_seconds` > 7 min · steady-state RSS at the 512 MB `mem_limit` · token-refresh failure rate ≥ 0.1% · > 5 gcal 410/429 in 10 min.

### 9. Aspire dashboard (dev only)
No extra config — running the AppHost shows live traces/metrics/logs. **Guard the dashboard and the whole obs stack with `if (builder.ExecutionContext.IsRunMode)`** in the AppHost so they never appear in the published prod compose. Use it as the fast feedback loop; Grafana is the container/prod-like view.

### 10. Docker Compose wiring
- **`compose.dev.yml`:** `otel-collector` (mount `config.dev.yaml`, expose 4317/4318/8889), `prometheus` (9090), `loki` (3100), `tempo` (3200 + 4317), `grafana` (3000, mount provisioning, depends_on the backends), `postgres-exporter` (9187, env `DATA_SOURCE_NAME` → the kairosdb conn). Named volumes for Prometheus/Loki/Tempo/Grafana; shared `kairos` network.
- **`compose.prod.yml`:** only `otel-collector` (mount `config.prod.yaml`) + `prometheus` + `postgres-exporter` + a logs volume. **No Loki/Tempo/Grafana/Aspire Dashboard.**
- Keep service names matching the Collector exporter endpoints above.

## Conventions

- **Apps emit OTLP only.** No service references Prometheus/Loki/Tempo directly — the Collector owns fan-out.
- **One source of truth for instrumentation:** `Kairos.ServiceDefaults`. Never configure OTel per-host.
- **Custom spans/metrics are named exactly** as the tech-stack doc lists them — dashboards and alerts depend on those names.
- **Dev/prod is a deliberate split.** Full Prom/Loki/Tempo/Grafana + Aspire Dashboard in dev; pared-down Collector → local Prom + file logs in prod. The dashboard is `IsRunMode`-guarded and absent from prod compose.
- **Consistent resource attributes** so signals correlate; always set `service.name` and `deployment.environment`.
- **Propagate `trace_id`/`span_id` into logs** so trace↔log linking works in Grafana.
- **Postgres slow logs + `dotnet-counters` are 90% of single-user observability** — don't over-build; alert on the NFR budgets, not RED-per-endpoint noise.
- **Config is provisioned as files** (collector, datasources, dashboards, alerts) — version-controlled, never click-configured.
- After wiring: confirm all three signals in the Aspire dashboard, then the same in Grafana, then confirm at least one NFR alert fires on a synthetic breach before declaring done.

## Definition of done

Observability is complete when: `Kairos.Web` exports OTLP with the Kairos custom spans (`schedule.render`, `freeslots.compute`, `gcal.sync.cycle`, `task.reschedule`) and metrics (`kairos_htmx_partial_swap_seconds`, `kairos_postgres_query_seconds`, `kairos_gcal_sync_lag_seconds`, `kairos_active_tasks`, `kairos_gcal_rate_limited_total`); the Aspire dashboard shows all three signals in dev (guarded by `IsRunMode`); `compose.dev.yml` brings up Collector + Prometheus + Loki + Tempo + Grafana + postgres-exporter, and `compose.prod.yml` brings up the pared-down Collector → local Prometheus + file logs; Grafana datasources are healthy with trace↔log↔metric correlation; dashboards render request/runtime/DB/gcal/MCP metrics; postgres-exporter surfaces `pg_stat_statements`; web-vitals reports INP; and Grafana alerts fire on the NFR budgets. Anything skipped is called out explicitly.
