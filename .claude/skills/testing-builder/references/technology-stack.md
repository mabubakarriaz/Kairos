# Testing & Quality — Technology Stack (Kairos)

> The **Testing & Quality** slice of the canonical Kairos stack, owned by the `testing-builder` skill.
> Indexed in [docs/technology-stack.md](../../../../docs/technology-stack.md); rationale, benchmarks & rejected alternatives in [docs/research.md](../../../../docs/research.md). Cross-cutting decisions — the architecture diagram and the [_Deliberately Excluded_](../../../../docs/technology-stack.md#deliberately-excluded) list — live in the index. Patterns for this slice: [design-pattern.md](design-pattern.md).

## Testing & Quality

| Technology | Purpose | Notes |
|---|---|---|
| **xUnit** | Unit & integration testing | Primary test framework |
| **Testcontainers for .NET** | Real Postgres in integration tests | Ephemeral containerized dependencies; the only way to test multirange SQL faithfully |
| **FluentAssertions** | Expressive test assertions | Readable assertion syntax |
| **Aspire.Hosting.Testing** | Test against the Aspire app model | End-to-end orchestration tests |
| **Playwright** | E2E browser tests + perf traces | Drives drag→drop→persist; enforces TTI and drop-to-DB budgets via traces in CI |
| **k6** | Load testing | Enforces htmx-partial-swap and Postgres query p95/p99 budgets as CI gates |

> The consolidated **NFR performance-budget table** these gates enforce lives in [docs/research.md](../../../../docs/research.md) (e.g. htmx swap p95 ≤ 50 ms, Postgres window query p95 ≤ 5 ms, drop→DB ≤ 100 ms). Integration tests run against **real** Postgres via Testcontainers — never the EF in-memory provider, which hides multirange / GiST / `timestamptz` behavior.

---

_Derived from the canonical Kairos stack. If anything here conflicts with [docs/technology-stack.md](../../../../docs/technology-stack.md), the index wins; update this slice to match._
