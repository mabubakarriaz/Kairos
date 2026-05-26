---
name: testing-builder
description: "Build the Kairos test suite — xUnit unit tests with FluentAssertions, integration tests using Testcontainers for real PostgreSQL, and end-to-end tests against the wired app model via Aspire.Hosting.Testing. Use when the user asks to create or change tests, test projects, fixtures, Testcontainers setup, MCP/EF integration tests, coverage, or the CI test gate for Kairos."
---

# testing-builder

Build the Kairos test suite exactly as specified in [docs/technology-stack.md](../../../docs/technology-stack.md). This skill is the procedural companion to that document for verification: the tech-stack doc decides *what* the testing tools are, this skill decides *how* to structure and write tests consistently. It is the verifier across its siblings — `backend-builder`, `frontend-builder`, `database-builder`, `observability-builder`, `mcp-builder`, and `orchestration-builder` each produce code; this skill proves it works.

**Read [docs/technology-stack.md](../../../docs/technology-stack.md) first** — it is the source of truth. If anything here conflicts with it, the tech-stack doc wins; update this skill to match.

## Canonical testing stack (from the tech-stack doc)

- **Test framework:** **xUnit** — unit & integration tests
- **Assertions:** **FluentAssertions** — expressive, readable assertions
- **Real dependencies:** **Testcontainers for .NET** — ephemeral, containerized PostgreSQL (no in-memory fakes)
- **App-model tests:** **Aspire.Hosting.Testing** — start the wired Aspire app graph and test it end to end
- **Runtime:** .NET 10, `dotnet test`

> **Guiding principle:** test against reality. Postgres-specific behavior is verified on real Postgres via Testcontainers; the wired system is verified through the Aspire app model. In-memory providers and over-mocking are avoided because they hide the bugs that matter.

## The testing pyramid for Kairos

```
        ┌───────────────────────────────┐
        │  E2E / app-model (few)         │  Aspire.Hosting.Testing: full graph,
        │                                │  web + mcp + real Postgres
        ├───────────────────────────────┤
        │  Integration (some)            │  Testcontainers Postgres: EF Core,
        │                                │  repositories, MCP tools → DB
        ├───────────────────────────────┤
        │  Unit (many)                   │  xUnit + FluentAssertions: domain rules,
        │                                │  validators, mapping — no I/O
        └───────────────────────────────┘
```

## Target layout

```
tests/
  Kairos.UnitTests/                 # fast, isolated; no containers/I/O
    Domain/                         # entity/aggregate rules (e.g. TaskItem scheduling)
    Application/                    # FluentValidation validators, service logic (deps mocked)
  Kairos.IntegrationTests/          # real Postgres via Testcontainers
    Fixtures/PostgresFixture.cs     # spins container, applies migrations, exposes conn string
    Data/                           # DbContext + repository round-trips
    Mcp/                            # MCP tools invoked end to end against the DB
  Kairos.AppTests/                  # Aspire.Hosting.Testing — full wired app model
    KairosAppFixture.cs             # DistributedApplicationTestingBuilder
```

## Build workflow

Write the cheapest test that proves the behavior: unit first, integration where Postgres semantics matter, app-model for wiring. Run `dotnet test` after each project is added. Don't batch failures.

### 1. Create test projects & packages
```powershell
dotnet new xunit -n Kairos.UnitTests        -o tests/Kairos.UnitTests
dotnet new xunit -n Kairos.IntegrationTests -o tests/Kairos.IntegrationTests
dotnet new xunit -n Kairos.AppTests         -o tests/Kairos.AppTests
dotnet sln add (Get-ChildItem -Recurse tests -Filter *.csproj)

dotnet add tests/Kairos.UnitTests package FluentAssertions
dotnet add tests/Kairos.IntegrationTests package FluentAssertions
dotnet add tests/Kairos.IntegrationTests package Testcontainers.PostgreSql
dotnet add tests/Kairos.AppTests package Aspire.Hosting.Testing
dotnet add tests/Kairos.AppTests package FluentAssertions
```
Reference the projects under test: UnitTests → `Domain` + `Application`; IntegrationTests → `Infrastructure` (+ `Application`); AppTests → `Kairos.AppHost`.

### 2. Unit tests (`Kairos.UnitTests`)
- **Domain:** assert entity/aggregate invariants — e.g. a `TaskItem` can't be scheduled in the past, status transitions are valid, reschedule updates the window.
- **Application:** test each **FluentValidation** validator (valid + every failure path) and service logic with dependencies mocked.
- Style: Arrange/Act/Assert, FluentAssertions (`result.Should().BeEquivalentTo(...)`), one behavior per test, descriptive `MethodUnderTest_State_Expected` names. No I/O, no containers — these must be fast.

### 3. Integration tests (`Kairos.IntegrationTests`)
- **Postgres fixture** with Testcontainers; apply migrations once per container:
  ```csharp
  public sealed class PostgresFixture : IAsyncLifetime
  {
      private readonly PostgreSqlContainer _db = new PostgreSqlBuilder()
          .WithImage("postgres:17").Build();

      public string ConnectionString => _db.GetConnectionString();

      public async Task InitializeAsync()
      {
          await _db.StartAsync();
          var opts = new DbContextOptionsBuilder<KairosDbContext>()
              .UseNpgsql(ConnectionString).Options;
          await using var ctx = new KairosDbContext(opts);
          await ctx.Database.MigrateAsync();      // verifies migrations apply cleanly too
      }

      public Task DisposeAsync() => _db.DisposeAsync().AsTask();
  }
  ```
  Share it with a `[CollectionDefinition]`/`ICollectionFixture<PostgresFixture>` so the container starts once. Keep tests isolated (respawn/clean tables or use a fresh schema per test).
- **Data tests:** real EF Core round-trips — insert/query/update/delete, enum-as-string columns, indexes, optimistic concurrency (`xmin`), UTC `timestamptz` handling.
- **MCP tests:** resolve the MCP tools (or the application services they call) and invoke `create_task` → assert the row exists → `list_tasks` returns it → `delete_task` removes it. Validation failures return structured errors, not exceptions.

### 4. App-model tests (`Kairos.AppTests`)
- Boot the wired Aspire graph and exercise it like a client:
  ```csharp
  var appHost = await DistributedApplicationTestingBuilder
      .CreateAsync<Projects.Kairos_AppHost>();
  await using var app = await appHost.BuildAsync();
  await app.StartAsync();

  var http = app.CreateHttpClient("web");
  var resp = await http.GetAsync("/healthz");
  resp.StatusCode.Should().Be(HttpStatusCode.OK);
  ```
- Cover the critical wiring: web is reachable and healthy, the MCP endpoint serves, and a task created via MCP is visible via the web/API — proving service discovery + Postgres + the app graph fit together. Keep these few; they're the slowest.

### 5. Run, isolate, and gate
- `dotnet test` runs all tiers. For the fast inner loop, filter: `dotnet test tests/Kairos.UnitTests`.
- Collect coverage (`--collect:"XPlat Code Coverage"` via coverlet).
- **CI gate** (GitHub Actions, per the doc): restore → build (warnings-as-errors) → `dotnet test` across all tiers on a runner with Docker available (Testcontainers + Aspire need it). The merge gate is a clean build + green tests.

## Conventions

- **Test against reality:** real Postgres via Testcontainers; the real app graph via Aspire.Hosting.Testing. No EF in-memory provider.
- **Mock only at the edges** (unit tier) — never mock the database or the framework you're trying to verify.
- **Deterministic & isolated:** no shared mutable state between tests; clean/respawn data; control time via an injected clock rather than `DateTimeOffset.Now`.
- **One container, many tests:** share the Postgres container via a collection fixture; don't start one per test.
- **FluentAssertions everywhere**, `Method_State_Expected` naming, AAA structure.
- **Tests are first-class code** — same review bar; a feature isn't done until covered at the right tier.
- After changes: `dotnet test` green across all tiers locally before declaring done.

## Definition of done

The test suite is complete when: unit tests cover domain rules and every validator path; integration tests run against real Testcontainers Postgres (migrations apply, EF round-trips and MCP tools verified end to end); app-model tests boot the Aspire graph and confirm web + mcp + Postgres wiring; tests are isolated and deterministic; coverage is collected; and CI runs all tiers (with Docker) as a green merge gate. Anything skipped is called out explicitly.
