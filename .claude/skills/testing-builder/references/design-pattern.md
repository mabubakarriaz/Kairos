# testing-builder — Design Patterns

> Patterns for the verification slice: **xUnit** + **FluentAssertions**, **Testcontainers** Postgres, **Aspire.Hosting.Testing**, **Playwright** E2E + perf traces, and **k6** budget gates.
> Companion to [`.claude/skills/testing-builder/SKILL.md`](../SKILL.md). Canonical stack: [technology-stack.md](technology-stack.md). Legend & cross-cutting patterns: [design-pattern.md](../../../../docs/design-pattern.md).

Test patterns are their own canon (Meszaros, _xUnit Test Patterns_, **[non-GoF]**), but most map onto GoF. The guiding rule — **"test against reality and against the budgets"** — dictates which patterns are mandatory (real-dependency fixtures) and which are forbidden (in-memory fakes for Postgres semantics).

## Architectural backbone — the test pyramid as a set of fixtures

Each tier is organized by a **Fixture** (a `[non-GoF]` xUnit pattern realized with GoF mechanics): unit (no I/O), integration (real Postgres via Testcontainers), app-model (the wired Aspire graph), and the budget gates (Playwright/k6). A test's tier decides which fixture — and therefore which patterns — it uses.

## Pattern catalogue

| Pattern | Category | Where in Kairos | Why |
|---|---|---|---|
| **Template Method** | [GoF · Behavioral] | `IAsyncLifetime.InitializeAsync/DisposeAsync`; the AAA test body | Fixed setup→exercise→verify→teardown skeleton; tests fill the steps. |
| **Shared Fixture (Singleton-scoped)** | [non-GoF + GoF Creational] | `ICollectionFixture<PostgresFixture>` — one `postgres:17` container for many tests | "One container, many tests": expensive resource created once, shared. |
| **Builder** | [GoF · Creational] | test-data builders (`TaskItem`/block builders); `DistributedApplicationTestingBuilder`; `PostgreSqlBuilder` | Construct arranged objects / the app graph step by step. |
| **Factory Method** | [GoF · Creational] | `app.CreateHttpClient("web")`; `DbContextOptionsBuilder…Options` | Create the right client/context for the wired resource. |
| **Test Double** (Stub/Mock/Fake) | [non-GoF; ~GoF Proxy] | unit-tier mocks of application services | Stand in for collaborators — *only at the edges*. |
| **Strategy** | [GoF · Behavioral] | choosing the tier/gate for a behavior; the budget thresholds | Pick the cheapest test that proves the behavior. |
| **Decorator** | [GoF · Structural] | Playwright tracing around a flow; k6 `thresholds` over requests | Wrap an exercise with measurement/assertions. |

---

### Template Method — fixture lifecycle & AAA

**Intent (GoF):** Define an algorithm's skeleton, deferring steps to overrides.

**Where it lives:** xUnit's `IAsyncLifetime` is a Template Method — the framework calls `InitializeAsync` then the test then `DisposeAsync`; Kairos fills in the steps. Every test body follows the same **Arrange-Act-Assert** skeleton with FluentAssertions and `Method_State_Expected` names.

```csharp
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _db =
        new PostgreSqlBuilder().WithImage("postgres:17-alpine").Build();   // Builder
    public string ConnectionString => _db.GetConnectionString();

    public async Task InitializeAsync()          // template step: set up real PG
    {
        await _db.StartAsync();
        var opts = new DbContextOptionsBuilder<KairosDbContext>().UseNpgsql(ConnectionString).Options;
        await using var ctx = new KairosDbContext(opts);
        await ctx.Database.MigrateAsync();        // also proves migrations apply cleanly
    }
    public Task DisposeAsync() => _db.DisposeAsync().AsTask();   // template step: tear down
}
```

**Pitfalls:** control time via an **injected clock**, never `DateTimeOffset.Now`, or the skeleton becomes non-deterministic. Test recurrence (`Ical.Net`) across a DST boundary explicitly.

### Shared Fixture — one container, many tests

**Intent:** Share an expensive Test Fixture across a group of tests (xUnit `ICollectionFixture<T>` → one instance for the whole collection — a test-scoped Singleton).

**Where it lives:** `PostgresFixture` is shared via a collection so the `postgres:17` container starts **once**, not per test. Tests then keep themselves isolated (respawn/clean tables or a fresh schema per test) so sharing the container doesn't share state.

**Pitfalls:** shared container ≠ shared data. Isolate per test, or order-dependence creeps in. **Never** the EF in-memory provider — it hides multirange / GiST / `timestamptz`, the exact behavior these tests exist to prove.

### Builder — test data & the app graph

**Where it lives:** (1) small data builders construct valid `TaskItem`/`ScheduledBlock` arrangements with intent-revealing overrides; (2) `DistributedApplicationTestingBuilder.CreateAsync<Projects.Kairos_AppHost>()` builds the **wired app model**; (3) `PostgreSqlBuilder` builds the container.

```csharp
var appHost = await DistributedApplicationTestingBuilder.CreateAsync<Projects.Kairos_AppHost>();
await using var app = await appHost.BuildAsync();
await app.StartAsync();

var http = app.CreateHttpClient("web");                       // Factory Method
(await http.GetAsync("/health")).StatusCode.Should().Be(HttpStatusCode.OK);
(await http.GetAsync("/mcp")).StatusCode.Should().NotBe(HttpStatusCode.NotFound);  // /mcp on web
```

**Pitfalls:** keep app-model tests few — they're the slowest tier. Use them for wiring (web reachable, `/mcp` serves, a task created via MCP is visible via web), not for logic better proven in unit tests.

### Test Double — mock only at the edges

**Intent (xUnit Test Patterns; structurally a GoF Proxy):** Replace a real collaborator with a controllable stand-in.

**Where it lives:** the **unit** tier only — e.g. mocking `ITaskService` to unit-test a validator or the free-slot **ranking** function. The database, the multirange SQL, and the framework under test are **never** mocked; they're exercised for real one tier down.

**Pitfalls:** over-mocking produces tests that pass while the system is broken. The integration tier's whole point is to use the real thing.

### Strategy & Decorator — tiers and budget gates

- **Strategy:** "write the cheapest test that proves the behavior" — unit for logic, integration for Postgres semantics, app-model for wiring, Playwright/k6 for budgets. The tier is a Strategy choice.
- **Decorator:** Playwright **traces** wrap the headline flow to assert **TTI cold ≤ 800 ms** and **drop → DB row ≤ 100 ms** (correlated to the `task.reschedule` span); k6 `thresholds` decorate the load script to gate **htmx swap p95 ≤ 50 / p99 ≤ 120 ms**, **PG window query p95 ≤ 5 ms**, **free-slots p95 ≤ 10 ms**. These are CI **gates**, not advisory.

## What's verified where (the patterns in service of reality)

- **Unit (many):** domain invariants (`end > start`, reschedule updates the window), every validator path, the C# ranking — Template Method + Test Doubles, no I/O.
- **Integration (some):** EF round-trips, the **multirange free-slot SQL** (assert exact gaps), the **`no_overlap_kairos` EXCLUDE** (two overlapping `kairos` blocks throw; two `gcal` blocks don't), MCP tools → DB — Shared Fixture on real Postgres.
- **App-model (few):** the wired Aspire graph — web + `/mcp` + Postgres fit together.
- **Budget gates (CI):** Playwright + k6 Decorators enforce the NFR table.

## Anti-patterns to avoid

- **EF in-memory provider.** It fakes away the very Postgres behavior under test — Testcontainers is mandatory.
- **Mocking the database or the SQL.** Mock only at the edges; gap-finding and the exclusion constraint must run on real PG.
- **Treating budgets as advisory.** Playwright/k6 are merge gates (see [devops-builder.md](../../devops-builder/references/design-pattern.md)).
- **Shared mutable state across tests.** Share the container, isolate the data; inject the clock.
- **A fat app-model tier.** Keep it thin; it's the slowest and most fragile.

## How this maps to the build workflow

Each vertical slice isn't done until covered at the right tier and within budget. Add the cheapest proving test first (unit), drop to integration where Postgres semantics matter (the SQL, the constraint), confirm wiring once at the app-model tier, and let the Playwright/k6 Decorators hold the NFR line in CI.
