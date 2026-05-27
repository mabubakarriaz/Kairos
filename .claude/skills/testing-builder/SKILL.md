---
name: testing-builder
description: "Build the Kairos test suite — xUnit unit tests with FluentAssertions, integration tests using Testcontainers for real PostgreSQL (incl. multirange free-slot SQL and the no-overlap exclusion constraint), end-to-end tests against the wired app model via Aspire.Hosting.Testing, Playwright E2E + perf traces, and k6 load tests that gate the NFR budgets. Use when the user asks to create or change tests, test projects, fixtures, Testcontainers setup, MCP/EF integration tests, Playwright/k6 perf gates, coverage, or the CI test gate for Kairos."
---

# testing-builder

Build the Kairos test suite the way the **Testing & Quality** stack slice this skill owns prescribes. This skill is the *procedural companion* to that slice for verification: the slice decides **what** the testing tools are, this skill decides **how** to structure and write tests consistently. It is the verifier across its siblings — they produce code; this skill proves it works and stays within the performance budgets.

## References — read when you need them

Keep this file lean. The *what* (the stack) and the underlying *patterns* live in two companion files next to this skill; load them when the task calls for it instead of restating them here:

- **[references/technology-stack.md](references/technology-stack.md)** — the **Testing & Quality** stack slice this skill owns: xUnit, FluentAssertions, Testcontainers for .NET, Aspire.Hosting.Testing, Playwright (E2E + perf traces), and k6 (load/budget gates). Read it before scaffolding a test project, or whenever you need an exact package or tool.
- **[references/design-pattern.md](references/design-pattern.md)** — the patterns that shape this slice: **Template Method** (fixture lifecycle), **Builder** (test-data construction), **Shared-Fixture Singleton** (the one Postgres container), and the **Test Double** family (mocks/stubs/fakes — only at the edges). Read it before designing fixtures or test data.
- The consolidated **performance-budget (NFR) table** the Playwright/k6 gates enforce, plus the multirange/exclusion-constraint SQL these tests exercise, are in [docs/research.md](../../../docs/research.md) — consult it for *why*.

If anything here conflicts with the tech-stack slice (or the cross-cutting [index](../../../docs/technology-stack.md)), the slice wins — update this skill to match.

> **Guiding principle:** test against reality and against the budgets. Postgres-specific behavior (multiranges, the GiST exclusion constraint, `timestamptz`) is verified on real Postgres via Testcontainers; the wired system through the Aspire app model; the UX path through Playwright; and the latency NFRs through k6 + Playwright traces as **CI gates**. In-memory providers and over-mocking hide the bugs that matter.

## The testing pyramid + budget gates

```
        ┌───────────────────────────────┐
        │  Budget gates (CI)             │  Playwright (TTI, drop→DB ≤100ms via traces)
        │                                │  k6 (htmx swap p95≤50/p99≤120ms, PG query p95≤5ms)
        ├───────────────────────────────┤
        │  E2E / app-model (few)         │  Aspire.Hosting.Testing: full graph (web + /mcp +
        │                                │  real Postgres); Playwright UX flows
        ├───────────────────────────────┤
        │  Integration (some)            │  Testcontainers Postgres: EF round-trips, the
        │                                │  multirange free-slot SQL, the EXCLUDE constraint,
        │                                │  MCP tools → DB
        ├───────────────────────────────┤
        │  Unit (many)                   │  xUnit + FluentAssertions: domain rules, the free-
        │                                │  slot ranking, validators, mapping — no I/O
        └───────────────────────────────┘
```

## Target layout

```
tests/
  Kairos.UnitTests/                 # fast, isolated; no containers/I/O
    Domain/                         # TaskItem / ScheduledBlock rules
    Application/                    # FluentValidation validators, free-slot ranking (deps mocked)
  Kairos.IntegrationTests/          # real Postgres via Testcontainers
    Fixtures/PostgresFixture.cs     # spins postgres:17, applies migrations, exposes conn string
    Data/                           # DbContext round-trips, multirange free-slot SQL, EXCLUDE constraint
    Mcp/                            # MCP tools invoked end to end against the DB
  Kairos.AppTests/                  # Aspire.Hosting.Testing — full wired app model (web + /mcp)
    KairosAppFixture.cs
  e2e/                              # Playwright (TS): schedule view, drag→drop→persist, perf traces
    playwright.config.ts
  load/                             # k6 scripts: htmx-swap + Postgres-query budget gates
    schedule_swap.js
```

## Build workflow

Write the cheapest test that proves the behavior: unit first, integration where Postgres semantics matter, app-model for wiring, Playwright/k6 for the budgets. Run `dotnet test` after each project is added. Don't batch failures.

### 1. Create test projects & packages
```powershell
dotnet new xunit -n Kairos.UnitTests        -o tests/Kairos.UnitTests
dotnet new xunit -n Kairos.IntegrationTests -o tests/Kairos.IntegrationTests
dotnet new xunit -n Kairos.AppTests         -o tests/Kairos.AppTests
dotnet sln add (Get-ChildItem -Recurse tests -Filter *.csproj)

dotnet add tests/Kairos.UnitTests        package FluentAssertions
dotnet add tests/Kairos.IntegrationTests package FluentAssertions
dotnet add tests/Kairos.IntegrationTests package Testcontainers.PostgreSql
dotnet add tests/Kairos.AppTests         package Aspire.Hosting.Testing
dotnet add tests/Kairos.AppTests         package FluentAssertions
```
References: UnitTests → `Domain` + `Application`; IntegrationTests → `Infrastructure` (+ `Application`); AppTests → `Kairos.AppHost`. Playwright + k6 live as Node/CLI tooling under `tests/e2e` and `tests/load`.

### 2. Unit tests (`Kairos.UnitTests`)
- **Domain:** `TaskItem`/`ScheduledBlock` invariants — e.g. `end > start`, status transitions, reschedule updates the window.
- **Application:** every **FluentValidation** validator (valid + each failure path); the **free-slot ranking** scoring function (the C# part — the SQL is integration-tested) with deps mocked.
- Style: AAA, FluentAssertions, one behavior per test, `Method_State_Expected` names. No I/O — these must be fast.

### 3. Integration tests (`Kairos.IntegrationTests`)
- **Postgres fixture** with Testcontainers (`postgres:17`); apply migrations once per container so the `btree_gist` extension, generated `during` column, and exclusion constraint are all created:
  ```csharp
  public sealed class PostgresFixture : IAsyncLifetime
  {
      private readonly PostgreSqlContainer _db = new PostgreSqlBuilder()
          .WithImage("postgres:17-alpine").Build();
      public string ConnectionString => _db.GetConnectionString();
      public async Task InitializeAsync()
      {
          await _db.StartAsync();
          var opts = new DbContextOptionsBuilder<KairosDbContext>().UseNpgsql(ConnectionString).Options;
          await using var ctx = new KairosDbContext(opts);
          await ctx.Database.MigrateAsync();   // verifies migrations apply cleanly too
      }
      public Task DisposeAsync() => _db.DisposeAsync().AsTask();
  }
  ```
  Share via `ICollectionFixture<PostgresFixture>` so the container starts once; keep tests isolated (respawn/clean tables or a fresh schema per test).
- **Data tests (the ones that matter most here):**
  - EF round-trips: insert/query/update/delete, enum-as-string columns, indexes, `xmin` concurrency, UTC `timestamptz`.
  - **Multirange free-slot SQL:** seed busy blocks, run the `unnest(work_mr - range_agg(busy))` query, assert the exact gaps returned. This SQL only exists on real PG 14+ — it's the canonical reason Testcontainers is mandatory.
  - **No-overlap exclusion constraint:** inserting two overlapping `source='kairos'` blocks throws; two overlapping `gcal` blocks are allowed.
- **MCP tests:** resolve the in-process MCP tools (or the application services they call) and invoke `create_task` → assert the row → `list_tasks` returns it → `list_free_slots` returns gaps → `delete_task` removes it. Validation failures return structured errors, not exceptions.

### 4. App-model tests (`Kairos.AppTests`)
Boot the wired Aspire graph and exercise it like a client. MCP is in-process on `web`, so there's one host:
```csharp
var appHost = await DistributedApplicationTestingBuilder.CreateAsync<Projects.Kairos_AppHost>();
await using var app = await appHost.BuildAsync();
await app.StartAsync();

var http = app.CreateHttpClient("web");
(await http.GetAsync("/health")).StatusCode.Should().Be(HttpStatusCode.OK);
(await http.GetAsync("/mcp")).StatusCode.Should().NotBe(HttpStatusCode.NotFound);  // /mcp served on web
```
Cover the critical wiring: web is reachable and healthy, `/mcp` serves, and a task created via MCP is visible via the web/API — proving service discovery + Postgres + the app graph fit together. Keep these few; they're the slowest.

### 5. Playwright E2E + perf traces (`tests/e2e`)
- Drive the headline flow: open the schedule view, drag a sidebar task into a free slot, confirm the slot fills, the source clears, the free-slots panel re-ranks, and the row persists (reload).
- Capture **traces** and assert the budgets: **TTI cold ≤ 800 ms**, **drop → persisted DB row ≤ 100 ms** (correlate with the `task.reschedule` OTel span). Run headless (`chromium`) in CI as a **gate**.

### 6. k6 load gates (`tests/load`)
- Script the htmx partial-swap endpoint and the schedule/free-slots queries; assert thresholds as **CI gates**: htmx partial swap server time **p95 ≤ 50 ms / p99 ≤ 120 ms**, Postgres "events in window" **p95 ≤ 5 ms / p99 ≤ 15 ms**, free-slots query **p95 ≤ 10 ms**. Also gate the initial JS bundle ≤ 80 KB gzipped (build-report check, coordinated with `frontend-builder`).
- These are loopback budgets; if Kairos is ever exposed beyond `127.0.0.1`, relax the swap target to p95 ≤ 80 ms.

### 7. Run, isolate, and gate
- `dotnet test` runs the .NET tiers; `tests/Kairos.UnitTests` is the fast inner loop. Collect coverage (`--collect:"XPlat Code Coverage"`).
- **CI gate** (`devops-builder`): restore → format → build (warnings-as-errors) → `dotnet test` (Docker present for Testcontainers + Aspire) → Playwright → k6. Merge requires a clean build, green tests, and budgets within thresholds.

## Conventions

- **Test against reality:** real Postgres via Testcontainers; the real app graph via Aspire.Hosting.Testing; the real browser via Playwright. **No EF in-memory provider** — it hides multirange/GiST/`timestamptz` behavior.
- **The budgets are tests.** Playwright + k6 enforce the NFR table as CI gates, not as aspirations.
- **Mock only at the edges** (unit tier) — never mock the database, the multirange SQL, or the framework under test.
- **Deterministic & isolated:** no shared mutable state; clean/respawn data; control time via an injected clock, never `DateTimeOffset.Now`. Test recurrence (`Ical.Net`) across a DST boundary explicitly.
- **One container, many tests:** share the Postgres container via a collection fixture.
- **FluentAssertions everywhere**, `Method_State_Expected` naming, AAA structure.
- **Tests are first-class code** — same review bar; a slice isn't done until covered at the right tier and within budget.
- After changes: `dotnet test` green across all tiers locally, and Playwright/k6 within budget, before declaring done.

## Definition of done

The test suite is complete when: unit tests cover domain rules, the free-slot ranking, and every validator path; integration tests run against real Testcontainers Postgres (migrations apply; EF round-trips, the multirange free-slot SQL, the no-overlap exclusion constraint, and MCP tools verified end to end); app-model tests boot the Aspire graph and confirm web + `/mcp` + Postgres wiring; Playwright drives drag→drop→persist and gates TTI + drop-to-DB budgets via traces; k6 gates the htmx-swap and Postgres-query p95/p99 budgets; tests are isolated and deterministic; coverage is collected; and CI runs all tiers (with Docker) as a green merge gate. Anything skipped is called out explicitly.
