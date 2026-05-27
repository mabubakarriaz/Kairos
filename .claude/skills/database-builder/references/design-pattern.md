# database-builder — Design Patterns

> Patterns for the data layer: **EF Core 10 + Npgsql**, the persistence-ignorant **entities**, the **`KairosDbContext`**, **entity configurations**, the **range/multirange schema**, **migrations**, and the **free-slot SQL**.
> Companion to [`.claude/skills/database-builder/SKILL.md`](../SKILL.md). Canonical stack: [technology-stack.md](technology-stack.md). Legend & cross-cutting patterns: [design-pattern.md](../../../../docs/design-pattern.md).

Persistence patterns are mostly **PoEAA** (Fowler) — EF Core *is* an implementation of several of them — with GoF patterns appearing in the configuration and access machinery. The guiding rule, **"schema is code; free slots are SQL,"** decides which patterns apply and which (e.g. an in-C# query builder) are explicitly rejected.

## Architectural backbone — Data Mapper + Repository + Unit of Work

**[non-GoF]** (Fowler PoEAA). EF Core gives all three out of the box, and Kairos leans on that rather than reinventing them:

- **Data Mapper** — entities in `Kairos.Domain` are **persistence-ignorant** (no EF attributes); all mapping lives in `Configurations/` via the Fluent API. The mapper moves data between objects and the database and keeps them independent — the exact reason the doc forbids EF attributes on entities.
- **Repository** — `DbSet<TaskItem>` already behaves as a Repository; an optional explicit `ITaskRepository` (interface in `Application`, impl in `Infrastructure/Repositories/`) is added only where a hand-tuned query earns it.
- **Unit of Work** — `KairosDbContext.SaveChangesAsync()` is the Unit of Work: it tracks a business transaction's changes and commits them atomically with one round trip.

## Pattern catalogue

| Pattern | Category | Where in Kairos | Why |
|---|---|---|---|
| **Data Mapper** | [non-GoF · PoEAA] | persistence-ignorant `Kairos.Domain` entities ↔ `Configurations/*Configuration.cs` | Keep domain objects free of persistence concerns; mapping is separate and explicit. |
| **Repository** | [non-GoF · PoEAA] | `DbSet<T>`; optional `ITaskRepository` | A collection-like abstraction over query/persist. |
| **Unit of Work** | [non-GoF · PoEAA] | `DbContext` change tracker + `SaveChangesAsync()` | One atomic commit of a tracked set of changes. |
| **Builder** | [GoF · Creational] | `ModelBuilder`, `IEntityTypeConfiguration<T>`, `DbContextOptionsBuilder`, `NpgsqlDataSourceBuilder`, `migrationBuilder` | Assemble the model / options / migration step by step via fluent APIs. |
| **Strategy** | [GoF · Behavioral] | `HasConversion<string>()` value converters; `QueryTrackingBehavior.NoTracking`; `AsSplitQuery()` | Swappable algorithms for value↔column conversion and query shaping. |
| **Factory Method** | [GoF · Creational] | `IDbContextFactory<KairosDbContext>` (sync worker), `IDesignTimeDbContextFactory<>` (migrations) | Create short-lived contexts outside a request scope without `new`-ing them directly. |
| **Singleton** _(per process)_ | [GoF · Creational] | `EF.CompileAsyncQuery(...)` delegates held in `static readonly` fields | One compiled plan reused across calls for the hot paths. |
| **Iterator** | [GoF · Behavioral] | `IAsyncEnumerable<T>` streaming reads; SQL `unnest(...)` over the result multirange | Traverse a sequence without exposing its representation. |

---

### Data Mapper — persistence-ignorant entities

**Intent (PoEAA):** A layer of mappers moves data between objects and a database while keeping them independent of each other.

**Where it lives:** entities (`TaskItem`, `ScheduledBlock`, `OAuthToken`) live in `Kairos.Domain` with **no EF attributes**; one `IEntityTypeConfiguration<T>` per entity in `Infrastructure/Configurations/` does all the mapping, surfaced by a single `ApplyConfigurationsFromAssembly` call:

```csharp
protected override void OnModelCreating(ModelBuilder b)
{
    b.HasPostgresExtension("btree_gist");
    b.ApplyConfigurationsFromAssembly(typeof(KairosDbContext).Assembly);
}
```

**Why it fits:** the Domain stays clean enough to unit-test with no database, and the mapping is one reviewable place. This is *why* the convention is "entities carry no EF attributes."

**Pitfalls:** no inline mapping in `OnModelCreating` beyond the extension + the assembly scan. The generated `during` column and the `EXCLUDE` constraint can't be expressed in Fluent mapping — emit them with raw `migrationBuilder.Sql(...)` (see Builder, below).

### Repository & Unit of Work — collection + atomic commit

**Intent (PoEAA):** Repository mediates between the domain and data mapping using a collection-like interface; Unit of Work tracks changes and coordinates writing them out.

**Where it lives:** application services use `KairosDbContext` directly (the `DbSet` is the Repository, `SaveChangesAsync` the Unit of Work). Add an explicit `ITaskRepository` only when a query is gnarly enough to deserve a named home; define the interface in `Kairos.Application` so the dependency points inward.

**Pitfalls:** don't wrap EF in a generic `IRepository<T>` that just re-exposes `IQueryable` — that adds a layer with no abstraction. Keep query logic out of `Web`/`Mcp`; those call application services.

### Builder — model, options, and migration construction

**Intent (GoF):** Separate construction of a complex object from its representation.

**Where it lives:** four fluent Builders shape the data layer:
- `ModelBuilder` / `IEntityTypeConfiguration<T>` — the schema model.
- `DbContextOptionsBuilder` / `NpgsqlDataSourceBuilder` — the connection + Npgsql tuning (`MaxAutoPrepare=20;AutoPrepareMinUsages=2`).
- `migrationBuilder` — the migration, including the raw SQL the model can't express:

```csharp
// in the generated migration — what Fluent mapping can't do:
migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS btree_gist;");
migrationBuilder.Sql(@"ALTER TABLE scheduled_blocks
  ADD CONSTRAINT no_overlap_kairos
  EXCLUDE USING GIST (during WITH &&) WHERE (source = 'kairos');");
```

```csharp
// in ScheduledBlockConfiguration — the generated range column via the Builder:
builder.Property(b => b.During)
       .HasComputedColumnSql("tstzrange(start_ts, end_ts, '[)')", stored: true);
```

**Pitfalls:** **inspect every generated migration before committing** and hand-add the extension / `EXCLUDE` / generated-column SQL. Never edit an applied migration — add a new one.

### Strategy — value converters & query shaping

**Intent (GoF):** Encapsulate interchangeable algorithms behind a common interface.

**Where it lives:** `HasConversion<string>()` is a value-conversion Strategy (enum `Source` ↔ `'kairos'`/`'gcal'` text — "enums as strings"). The read path picks a Strategy too: default `QueryTrackingBehavior.NoTracking`, opt into `AsSplitQuery()` only when projecting blocks+tasks together.

**Pitfalls:** keep `timestamptz`/`DateTimeOffset` (UTC) end to end; a converter that silently drops the offset reintroduces timezone bugs. Don't make everything split-query — it costs extra round trips when you don't project a collection.

### Factory Method — `IDbContextFactory`

**Intent (GoF):** Define an interface for creating an object, letting implementations decide what to instantiate.

**Where it lives:** the `GoogleCalendarSyncWorker` runs outside a request scope, so it resolves `IDbContextFactory<KairosDbContext>` and calls `CreateDbContext()` per cycle rather than capturing a scoped context (which would be a lifetime bug). `IDesignTimeDbContextFactory<KairosDbContext>` is the design-time Factory the EF CLI uses to build the model for `migrations add`.

**Pitfalls:** never share one `DbContext` across the worker's concurrent/looping work — it's not thread-safe. One context per unit of work, created by the factory.

### Singleton — compiled queries for hot paths

**Intent (GoF):** Ensure one instance with a global access point.

**Where it lives:** the two or three hot paths (day-window fetch, single-task-by-id, free-slots) use `EF.CompileAsyncQuery(...)` stored in `static readonly` fields — compiled once, reused for the life of the process, skipping expression-tree recompilation on every call.

**Pitfalls:** only compile genuinely hot, stable queries; a compiled query with shifting shape just adds rigidity.

### Iterator — streaming results & `unnest`

**Intent (GoF):** Provide sequential access to an aggregate without exposing its representation.

**Where it lives:** EF exposes results as `IAsyncEnumerable<T>`; on the SQL side, `unnest(work_mr - range_agg(busy))` turns the computed free-slot multirange into an iterable row set. The C# ranking Strategy then iterates those rows.

---

### The free-slot query is *deliberately not* a pattern

The single most important design decision here is an **anti-abstraction**: free-slot detection is one SQL expression, not a C# algorithm.

```sql
WITH busy AS (
  SELECT range_agg(during)::tstzmultirange AS busy_mr
  FROM scheduled_blocks
  WHERE during && tstzrange(:day_start, :day_end, '[)')
),
working AS ( SELECT multirange(tstzrange(:work_start, :work_end, '[)')) AS work_mr )
SELECT unnest(work_mr - COALESCE(busy_mr, '{}'::tstzmultirange)) AS free_slot
FROM busy, working;
```

Surface it via `FromSqlInterpolated` (or a compiled raw query) in `Queries/FreeSlotQueries.cs`. **Do not** introduce a Builder/Interpreter/Visitor to assemble gaps in C# — PG 14+ is mandated precisely so this stays in SQL. C# only applies the ranking **Strategy** to the returned rows.

## Anti-patterns to avoid

- **EF attributes on domain entities.** Breaks Data Mapper / persistence ignorance — all mapping is Fluent in `Configurations/`.
- **A C# gaps-and-islands re-implementation.** The pre-PG14 fallback is deliberately avoided; gap-finding is SQL.
- **Generic `IRepository<T>` over `IQueryable`.** Indirection with no abstraction; inject the context or a purposeful repository.
- **`EnsureCreated()` alongside migrations, or editing an applied migration.** Schema is code; every change is a new, reviewed migration. `ANALYZE` after bulk sync inserts so the GiST planner stays on the index.
- **EF in-memory provider in tests.** It hides multirange / GiST / `timestamptz` behavior — integration tests use real Postgres via Testcontainers (see [testing-builder.md](../../testing-builder/references/design-pattern.md)).

## How this maps to the build workflow

Per entity/aggregate: model it (Data Mapper) → configure mapping (Builder + Strategy converters) → generate and hand-finish the migration (Builder raw SQL) → expose hot reads as compiled queries (Singleton) and the free-slot SQL as a raw query. The sync worker and design-time tooling get contexts via the Factory Method.
