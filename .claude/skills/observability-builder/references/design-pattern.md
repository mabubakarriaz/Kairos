# observability-builder — Design Patterns

> Patterns for the telemetry slice: **OpenTelemetry** instrumentation centralized in **`ServiceDefaults`**, the **OTel Collector**, **Prometheus / Loki / Tempo**, **Grafana**, the **postgres-exporter**, and the **dev/prod split**.
> Companion to [`.claude/skills/observability-builder/SKILL.md`](../SKILL.md). Canonical stack: [technology-stack.md](technology-stack.md). Legend & cross-cutting patterns: [design-pattern.md](../../../../docs/design-pattern.md).

The whole slice rests on one idea: **apps emit OTLP and know nothing about the backends; the Collector owns fan-out.** That's a **Mediator** decoupling producers from consumers, fed by **Observer**-style instrumentation, configured through a single **Facade**, and shaped by a **Pipes & Filters** pipeline.

## Architectural backbone — Mediator + Pipes & Filters

- **Mediator** [GoF]: the **OTel Collector** sits between every telemetry producer (`Kairos.Web`, postgres-exporter, web-vitals) and every backend (Prometheus, Loki, Tempo). Producers reference *only* the Collector; backends can be added, removed, or swapped without touching app code.
- **Pipes & Filters** [non-GoF · POSA]: inside the Collector, each signal flows `receivers → processors → exporters` — a pipeline of composable filters. This is what makes the dev/prod split a config change, not a code change.

## Pattern catalogue

| Pattern | Category | Where in Kairos | Why |
|---|---|---|---|
| **Mediator** | [GoF · Behavioral] | the OTel Collector between emitters and Prometheus/Loki/Tempo | Decouple telemetry producers from backends; one hub owns routing. |
| **Facade** | [GoF · Structural] | `ServiceDefaults.AddServiceDefaults()` / `ConfigureOpenTelemetry()` | One call configures all instrumentation; never per-host. |
| **Observer** | [GoF · Behavioral] | OTel instrumentation + custom `ActivitySource`/`Meter`; Prometheus scrape | Telemetry observes runtime events and publishes spans/metrics/logs. |
| **Pipes & Filters** | [non-GoF · POSA] | Collector `receivers → processors → exporters` pipelines | Composable, reorderable signal processing per signal type. |
| **Decorator** | [GoF · Structural] | the `.WithMetrics(...).WithTracing(...)` instrumentation chain; custom spans wrapping operations | Add measurement around behavior without changing it. |
| **Strategy** | [GoF · Behavioral] | `config.dev.yaml` (full fan-out) vs `config.prod.yaml` (Prom + file logs) | Swap the export algorithm by environment. |
| **Singleton** | [GoF · Creational] | `KairosTelemetry.ActivitySource` / `Meter` in `Telemetry.cs` | One named source/meter per process; dashboards depend on those names. |

---

### Mediator — the Collector

**Intent (GoF):** Define an object that encapsulates how a set of objects interact; promote loose coupling by keeping them from referring to each other explicitly.

**Where it lives:** every app exports OTLP to the Collector; the Collector fans out to backends. No service references Prometheus/Loki/Tempo directly.

```yaml
service:
  pipelines:
    traces:  { receivers: [otlp], processors: [memory_limiter, batch], exporters: [otlp/tempo] }
    metrics: { receivers: [otlp], processors: [memory_limiter, batch], exporters: [prometheus] }
    logs:    { receivers: [otlp], processors: [memory_limiter, batch], exporters: [otlphttp/loki] }
```

**Why it fits:** swapping Tempo for another trace store, or dropping Loki in prod, is a Collector-config edit — the app never changes. That is precisely Mediator's payoff: change the interaction in one place.

**Pitfalls:** keep service names in the exporter endpoints (`tempo:4317`, `loki:3100`, `postgres-exporter:9187`) matched to the compose services, or fan-out silently drops.

### Facade — `ServiceDefaults`

**Intent (GoF):** A unified interface to a subsystem.

**Where it lives:** `Kairos.ServiceDefaults/Extensions.cs`. `builder.AddServiceDefaults()` wires logging + metrics + tracing + the OTLP exporter once; `Kairos.Web` inherits it. **Never configure OTel per-host** — that's the Facade contract.

```csharp
builder.Services.AddOpenTelemetry()
    .WithMetrics(m => m.AddAspNetCoreInstrumentation().AddHttpClientInstrumentation()
                       .AddRuntimeInstrumentation().AddMeter(KairosTelemetry.MeterName))
    .WithTracing(t => t.AddAspNetCoreInstrumentation().AddHttpClientInstrumentation()
                       .AddEntityFrameworkCoreInstrumentation().AddNpgsql()
                       .AddSource(KairosTelemetry.ActivitySourceName));
builder.Services.AddOpenTelemetry().UseOtlpExporter();   // Aspire sets the endpoint
```

**Pitfalls:** because MCP is in-process, there's **one** emitter — don't add a second OTel setup for `/mcp`; its tool spans ride the same Facade.

### Observer — instrumentation & custom spans/metrics

**Intent (GoF):** A one-to-many dependency where observers are notified of subject state changes.

**Where it lives:** instrumentation observes framework events (ASP.NET Core, HttpClient, EF Core, Npgsql) and publishes signals; Kairos adds **named** custom observations from `Telemetry.cs`:

- **Spans:** `schedule.render`, `freeslots.compute`, `gcal.sync.cycle`, `task.reschedule`.
- **Metrics:** `kairos_htmx_partial_swap_seconds`, `kairos_postgres_query_seconds`, `kairos_gcal_sync_lag_seconds`, `kairos_active_tasks`, `kairos_gcal_rate_limited_total`, `kairos_gcal_token_refresh_failed_total`.

The backend/frontend/mcp slices start/stop these at the right call sites; Prometheus's scrape is a *pull*-style Observer over the Collector's exporter.

**Pitfalls:** the names are a contract — dashboards and NFR alerts depend on them exactly. Don't rename casually. Propagate `trace_id`/`span_id` into logs so trace↔log linking works.

### Pipes & Filters — the Collector pipeline

**Intent (POSA):** Process a stream through a sequence of independent filters connected by pipes.

**Where it lives:** `receivers → [memory_limiter, batch] → exporters`, one pipeline per signal. Filters are reorderable and reusable; `memory_limiter` before `batch` protects the Collector under load.

**Pitfalls:** the **prod** pipeline deliberately drops the Tempo/Loki exporters and writes logs to a file — a full obs stack can out-consume a single-user app. Keep prod pared down; this is a Strategy choice, below.

### Decorator — instrumentation & timed spans

**Intent (GoF):** Attach responsibilities to an object dynamically.

**Where it lives:** each `Add…Instrumentation()` decorates the pipeline with another measurement source; a custom span (`using var act = KairosTelemetry.ActivitySource.StartActivity("freeslots.compute")`) decorates an operation with timing/attributes without altering its logic.

**Pitfalls:** measurement must not change behavior — keep spans thin, sample sensibly, and don't let a `Meter`/span throw into the hot path.

### Strategy — dev vs prod posture

**Where it lives:** `config.dev.yaml` (full fan-out: Prom + Loki + Tempo + Grafana + Aspire dashboard) vs `config.prod.yaml` (local Prometheus + file logs only). Same Collector, two export Strategies, selected by which compose file runs. The Aspire dashboard is `IsRunMode`-guarded in the AppHost (see [orchestration-builder.md](../../orchestration-builder/references/design-pattern.md#abstract-factory--dev-vs-prod-resource-families)).

### Singleton — the `ActivitySource` & `Meter`

One `KairosTelemetry.ActivitySource` and one `Meter` per process, exposed as static, registered by name in the Facade. Their names are the join key between code, dashboards, and alerts.

## Anti-patterns to avoid

- **Per-host OTel config.** One Facade in `ServiceDefaults`; never scatter setup across hosts.
- **Apps talking to backends directly.** Everything goes through the Collector (Mediator); no app references Prometheus/Loki/Tempo.
- **A full obs stack in prod.** Prod is a pared-down Collector → local Prom + file logs; no Grafana/Loki/Tempo/Aspire dashboard. Over-building observability for one user defeats the budget it's meant to protect.
- **Renaming custom spans/metrics ad hoc.** Dashboards and NFR alerts bind to the exact names — treat them as an API.
- **Click-configured Grafana.** Datasources, dashboards, and alerts are provisioned as version-controlled files, never hand-clicked.

## How this maps to the build workflow

Wire the **Facade** first and confirm all three signals in the Aspire dashboard (isolates app-side from collector/backend issues). Then stand up the **Mediator** Collector with its **Pipes & Filters** pipelines, point apps at it, and provision Grafana. Add custom **Observer** spans/metrics at the call sites, and alert on the NFR budgets — the single-user posture means Postgres slow logs + `dotnet-counters` already cover most of it; don't over-instrument.
