---
name: observability-builder
description: "Build Kairos observability — OpenTelemetry instrumentation (traces, metrics, logs) exported via an OTel Collector to Prometheus, Loki, and Tempo, visualized in Grafana, with the .NET Aspire dashboard in dev. Use when the user asks to add or wire up telemetry, instrumentation, the OTel Collector, Prometheus/Loki/Tempo, Grafana dashboards/datasources, OTLP exporters, or the observability containers for Kairos."
---

# observability-builder

Build the Kairos observability stack exactly as specified in [docs/technology-stack.md](../../../docs/technology-stack.md). This skill is the procedural companion to that document for the telemetry layer: the tech-stack doc decides *what* the observability stack is, this skill decides *how* to assemble it consistently. It is the sibling of `backend-builder` and `frontend-builder` — those produce the services that emit telemetry; this one collects, stores, and visualizes it.

**Read [docs/technology-stack.md](../../../docs/technology-stack.md) first** — it is the source of truth. If anything here conflicts with it, the tech-stack doc wins; update this skill to match.

## Canonical observability stack (from the tech-stack doc)

- **Instrumentation:** **OpenTelemetry** — traces, metrics, logs; vendor-neutral, built into Aspire service defaults
- **Pipeline:** **OpenTelemetry Collector** — receives OTLP, processes, fans out to backends
- **Metrics:** **Prometheus**
- **Logs:** **Grafana Loki**
- **Traces:** **Grafana Tempo**
- **Visualization:** **Grafana** — single pane of glass for all three signals
- **Dev:** **.NET Aspire Dashboard** — built-in OTLP view of traces/metrics/logs while developing

> **Guiding principle:** every service exports OTLP and knows nothing about the backends. The Collector is the only thing that fans signals out to Prometheus / Loki / Tempo, so backends can change without touching app code.

## Telemetry flow

```
Kairos.Web / Kairos.Mcp  ──OTLP──▶  OTel Collector  ──▶  Prometheus (metrics)
   (ServiceDefaults: OTel)                            ──▶  Loki       (logs)
                                                      ──▶  Tempo      (traces)
                                                                        │
                                                                  Grafana (dashboards)
   In dev: services also export OTLP ──▶ Aspire Dashboard
```

## Target layout

```
src/Kairos.ServiceDefaults/
  Extensions.cs               # AddServiceDefaults / ConfigureOpenTelemetry — central instrumentation
observability/
  otel-collector/
    config.yaml               # receivers (OTLP) → processors → exporters (prom/loki/tempo)
  prometheus/
    prometheus.yml
  loki/
    loki-config.yaml
  tempo/
    tempo.yaml
  grafana/
    provisioning/
      datasources/datasources.yaml   # Prometheus, Loki, Tempo (+ trace↔log correlation)
      dashboards/dashboards.yaml      # dashboard provider
    dashboards/                       # *.json dashboards (ASP.NET, runtime, EF/Npgsql, MCP)
docker-compose.yml            # otel-collector, prometheus, loki, tempo, grafana services
```

## Build workflow

Wire instrumentation first and confirm signals reach the **Aspire dashboard** before standing up the Grafana stack — that isolates app-side problems from collector/backend ones. Don't batch failures.

### 1. Centralize instrumentation in ServiceDefaults
All telemetry lives in `Kairos.ServiceDefaults` so every host (`Web`, `Mcp`) inherits it via `builder.AddServiceDefaults()`. Configure the OpenTelemetry SDK with the OTLP exporter for all three signals:
```csharp
builder.Logging.AddOpenTelemetry(o => { o.IncludeFormattedMessage = true; o.IncludeScopes = true; });

builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService(builder.Environment.ApplicationName))
    .WithMetrics(m => m
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddRuntimeInstrumentation())
    .WithTracing(t => t
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddEntityFrameworkCoreInstrumentation()
        .AddNpgsql());

// Export everything via OTLP when the endpoint is configured (Aspire sets it automatically)
builder.Services.AddOpenTelemetry().UseOtlpExporter();
```
Set resource attributes (`service.name`, `service.namespace=kairos`, `service.version`, `deployment.environment`) so signals are attributable in Grafana.

### 2. Instrumentation coverage
- **HTTP server/client:** ASP.NET Core + HttpClient instrumentation (covers Razor Pages, Minimal APIs, and the MCP HTTP transport).
- **Data:** EF Core + Npgsql instrumentation for query traces/metrics.
- **Runtime:** GC, thread pool, allocation metrics.
- **Custom:** add a `Meter` and `ActivitySource` for Kairos domain events (e.g. `task.created`, `task.rescheduled`, MCP tool invocations) and register their names with the SDK.

### 3. OTLP endpoint configuration
- In **dev**, Aspire injects `OTEL_EXPORTER_OTLP_ENDPOINT` pointing at the Aspire dashboard — nothing else to do.
- For the **container stack**, point services at the Collector: `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317` (gRPC) set in `docker-compose.yml`.

### 4. OTel Collector — `observability/otel-collector/config.yaml`
Receive OTLP, batch, and fan out one signal per backend:
```yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  batch: {}
  memory_limiter:
    check_interval: 1s
    limit_percentage: 80

exporters:
  otlp/tempo:
    endpoint: tempo:4317
    tls: { insecure: true }
  prometheus:
    endpoint: 0.0.0.0:8889        # scraped by Prometheus
  otlphttp/loki:
    endpoint: http://loki:3100/otlp

service:
  pipelines:
    traces:  { receivers: [otlp], processors: [memory_limiter, batch], exporters: [otlp/tempo] }
    metrics: { receivers: [otlp], processors: [memory_limiter, batch], exporters: [prometheus] }
    logs:    { receivers: [otlp], processors: [memory_limiter, batch], exporters: [otlphttp/loki] }
```

### 5. Prometheus — `observability/prometheus/prometheus.yml`
Scrape the Collector's Prometheus exporter:
```yaml
global: { scrape_interval: 15s }
scrape_configs:
  - job_name: otel-collector
    static_configs:
      - targets: ["otel-collector:8889"]
```

### 6. Loki & Tempo
- **Loki** (`loki-config.yaml`): single-binary/filesystem config is fine for local; it ingests logs over OTLP (`/otlp/v1/logs`) from the Collector.
- **Tempo** (`tempo.yaml`): enable the OTLP receiver on `4317` so the Collector can push traces; local block storage backend.

### 7. Grafana provisioning
- `provisioning/datasources/datasources.yaml`: register **Prometheus**, **Loki**, and **Tempo**. Wire **correlation**: Tempo `tracesToLogs`/`tracesToMetrics` and Loki `derivedFields` for `trace_id`, so you can jump trace ↔ logs ↔ metrics.
- `provisioning/dashboards/dashboards.yaml`: a file provider loading `observability/grafana/dashboards/*.json`.
- Provide starter dashboards: ASP.NET Core request rate/latency/errors (RED), .NET runtime, EF Core/Npgsql query latency, and Kairos custom metrics + MCP tool usage.

### 8. Aspire dashboard (dev)
No extra config — running the AppHost shows live traces/metrics/logs. Use it as the fast feedback loop; the Grafana stack is for the container/prod-like environment. Optionally add the observability containers as Aspire resources for a unified dev experience.

### 9. Docker Compose wiring
Add to `docker-compose.yml`: `otel-collector` (mount its config, expose 4317/4318/8889), `prometheus` (mount config, 9090), `loki` (3100), `tempo` (3200 + 4317), `grafana` (3000, mount provisioning, depends_on the three backends). Use named volumes for Prometheus, Loki, Tempo, and Grafana data; one shared network with the app services. Keep service names matching the Collector exporter endpoints above.

## Conventions

- **Apps emit OTLP only.** No service references Prometheus/Loki/Tempo directly — the Collector owns fan-out.
- **One source of truth for instrumentation:** `Kairos.ServiceDefaults`. Never configure OTel per-host ad hoc.
- **Consistent resource attributes** across services so signals correlate; always set `service.name` and `deployment.environment`.
- **Propagate `trace_id`/`span_id` into logs** (structured logging + OTel log correlation) so trace↔log linking works in Grafana.
- **Config is provisioned as files** (collector, datasources, dashboards) — version-controlled, never click-configured in the Grafana UI.
- After wiring: confirm all three signals in the Aspire dashboard, then confirm the same in Grafana before declaring done.

## Definition of done

Observability is complete when: services build and export OTLP; the Aspire dashboard shows traces, metrics, and logs in dev; `docker compose up` brings up Collector + Prometheus + Loki + Tempo + Grafana; Grafana's provisioned datasources are healthy; dashboards render request/runtime/DB/MCP metrics; and trace↔log↔metric correlation works end to end. Anything skipped is called out explicitly.
