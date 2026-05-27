# Observability — Technology Stack (Kairos)

> The **Observability** slice of the canonical Kairos stack, owned by the `observability-builder` skill.
> Indexed in [docs/technology-stack.md](../../../../docs/technology-stack.md); rationale, benchmarks & rejected alternatives in [docs/research.md](../../../../docs/research.md). Cross-cutting decisions — the architecture diagram and the [_Deliberately Excluded_](../../../../docs/technology-stack.md#deliberately-excluded) list — live in the index. Patterns for this slice: [design-pattern.md](design-pattern.md).

## Observability

| Technology | Purpose | Notes |
|---|---|---|
| **OpenTelemetry** | Traces, metrics, and logs instrumentation | Vendor-neutral; built into Aspire service defaults. Custom spans: `schedule.render`, `freeslots.compute`, `gcal.sync.cycle`, `task.reschedule` |
| **OpenTelemetry Collector** | Telemetry pipeline / export | Receives OTLP and fans out to backends |
| **Grafana** | Dashboards & visualization | Single pane of glass; alerts on the NFR budgets |
| **Prometheus** | Metrics storage & querying | Custom metrics: `kairos_htmx_partial_swap_seconds`, `kairos_postgres_query_seconds`, `kairos_gcal_sync_lag_seconds`, `kairos_active_tasks`, `kairos_gcal_rate_limited_total` |
| **Grafana Loki** | Log aggregation | Centralized structured logs (incl. Postgres `auto_explain` output) |
| **Grafana Tempo** | Distributed tracing backend | Stores OTLP traces |
| **postgres-exporter** _(sidecar)_ | Postgres metrics → Prometheus | Surfaces `pg_stat_statements` and slow-query data |
| **`dotnet-counters`** | Runtime metric inspection | Steady-state RSS / GC; the "minimum viable observability" runbook for a one-user app |
| **web-vitals.js** | Client-side INP / interaction latency | Feeds the drag/input-latency budgets back as an OTel custom metric |
| **.NET Aspire Dashboard** | Local-dev telemetry view | **Dev-only** — guard with `if (builder.ExecutionContext.IsRunMode)`; never run it in the single-user prod compose |

> **Dev vs prod split:** dev runs the full Prom/Loki/Tempo/Grafana + Aspire Dashboard stack; prod runs a pared-down OTel Collector to local Prometheus + file logs, because a full obs stack can out-consume the app itself on one machine.

---

_Derived from the canonical Kairos stack. If anything here conflicts with [docs/technology-stack.md](../../../../docs/technology-stack.md), the index wins; update this slice to match._
