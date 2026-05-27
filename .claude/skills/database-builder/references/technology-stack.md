# Database — Technology Stack (Kairos)

> The **Database** slice of the canonical Kairos stack, owned by the `database-builder` skill.
> Indexed in [docs/technology-stack.md](../../../../docs/technology-stack.md); rationale, benchmarks & rejected alternatives in [docs/research.md](../../../../docs/research.md). Cross-cutting decisions — the architecture diagram and the [_Deliberately Excluded_](../../../../docs/technology-stack.md#deliberately-excluded) list — live in the index. Patterns for this slice: [design-pattern.md](design-pattern.md).

## Database

| Technology | Purpose | Notes |
|---|---|---|
| **PostgreSQL 17** | Primary relational database | Runs as a container (`postgres:17-alpine`), provisioned via Aspire. **PG 14+ is a hard floor** — multiranges are non-negotiable |
| **`btree_gist` extension** | GiST index + exclusion constraints | Powers the `EXCLUDE USING GIST (during WITH &&)` no-overlap constraint on Kairos blocks and the `during && tstzrange(...)` window query |
| **Range / multirange types** | First-class temporal modeling | `tstzrange` (stored, GiST-indexed) for blocks; `tstzmultirange` + `range_agg` make free-slot detection a one-line SQL expression (working-hours multirange − busy multirange) |
| **`auto_explain` extension** | Slow-query plan capture | `log_min_duration = 50ms` logs the full plan; piped to logs/Loki |
| **`pg_stat_statements` extension** | Query-level latency insight | Watch the GiST-overlap and free-slots queries against the NFR budgets |
| **EF Core Migrations** | Schema management | Versioned, applied at startup or via migration bundles |
| **pgAdmin** _(optional, dev)_ | DB administration UI | Convenience container for local development |

> **Free slots = SQL, not C#.** `unnest(work_mr - range_agg(busy))` returns gaps directly; ranking the top-N "best" slots happens in C# on the handful of returned rows (sub-ms). The pre-PG14 gaps-and-islands fallback exists but is deliberately avoided by mandating PG 14+.

> **Aspire integration:** the database is provisioned by the Aspire AppHost (resource names `postgres` / `kairosdb`), and `Aspire.Npgsql.EntityFrameworkCore.PostgreSQL` wires the connection string, health checks, and telemetry into `Kairos.Infrastructure`. The container/volume wiring is shared with the `orchestration-builder` slice.

---

_Derived from the canonical Kairos stack. If anything here conflicts with [docs/technology-stack.md](../../../../docs/technology-stack.md), the index wins; update this slice to match._
