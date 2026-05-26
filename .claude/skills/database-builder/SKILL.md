---
name: database-builder
description: "Build the Kairos data layer — PostgreSQL 17 (btree_gist, range/multirange types) accessed via EF Core 10 + Npgsql with code-first migrations, provisioned through .NET Aspire and run as a container (with optional pgAdmin). Use when the user asks to create or change entities, the DbContext, entity configurations, the tstzrange/exclusion-constraint schema, free-slot SQL, EF Core migrations, seed data, repositories, the OAuth token store, the Postgres container/volume, or connection-string wiring for Kairos."
---

# database-builder

Build the Kairos data layer exactly as specified in [docs/technology-stack.md](../../../docs/technology-stack.md). This skill is the procedural companion to that document for persistence: the tech-stack doc decides *what* the database stack is, this skill decides *how* to model, migrate, and provision it consistently. The data layer lives in `Kairos.Infrastructure` and is consumed by the application services the other builders call.

**Read [docs/technology-stack.md](../../../docs/technology-stack.md) first** — it is the source of truth. [docs/report-technical-design-research.md](../../../docs/report-technical-design-research.md) holds the canonical schema, the free-slot SQL, the GiST/planner rationale, and the temporal-modeling sources. If anything here conflicts with the tech-stack doc, the doc wins; update this skill to match.

## Canonical data stack (from the tech-stack doc)

- **Database:** **PostgreSQL 17** — runs as `postgres:17-alpine`, provisioned via Aspire. **PG 14+ is a hard floor** — multiranges are non-negotiable
- **ORM / access:** **Entity Framework Core 10** — code-first, LINQ; `AsNoTracking` reads, `AsSplitQuery` on block+task projections, compiled queries for hot paths
- **Driver/provider:** **Npgsql** (`Npgsql.EntityFrameworkCore.PostgreSQL`) — maps `tstzrange` → `NpgsqlRange<DateTime>` natively; set `MaxAutoPrepare=20`, `AutoPrepareMinUsages=2`
- **Extensions:** **`btree_gist`** (GiST index + exclusion constraint), **range/multirange types**, **`auto_explain`** (`log_min_duration=50ms`), **`pg_stat_statements`** (query latency)
- **Schema management:** **EF Core Migrations** — versioned, applied at startup (dev, guarded) or via migration bundles
- **Dev admin (optional):** **pgAdmin** container (guarded by `IsRunMode` in the AppHost)
- **Aspire integration:** `Aspire.Npgsql.EntityFrameworkCore.PostgreSQL` wires connection strings + health checks + telemetry

> **Guiding principle:** schema is code. Every change is a reviewed migration in source control — never hand-edited in the running DB. And **free slots are computed in SQL, not C#** — `unnest(work_mr - range_agg(busy))` returns gaps directly; only top-N ranking of those rows happens in C#.

## Target layout (inside `src/Kairos.Infrastructure`)

```
src/Kairos.Infrastructure/
  KairosDbContext.cs                # the DbContext; ApplyConfigurationsFromAssembly; HasPostgresExtension("btree_gist")
  Configurations/                   # one IEntityTypeConfiguration<T> per entity
    TaskItemConfiguration.cs
    ScheduledBlockConfiguration.cs
    OAuthTokenConfiguration.cs
  Migrations/                       # EF-generated migrations (committed; raw SQL for generated col + EXCLUDE)
  Queries/
    FreeSlotQueries.cs              # the multirange free-slot SQL (FromSqlInterpolated / compiled)
  Repositories/                     # repository implementations (if used)
  Google/                           # Google Calendar client + OAuth token store (backend-builder)
  Seed/DbSeeder.cs                  # idempotent dev/reference seed data
  DependencyInjection.cs            # AddInfrastructure(): registers DbContext via Aspire
src/Kairos.Domain/                  # TaskItem, ScheduledBlock entities (persistence-ignorant)
src/Kairos.AppHost/AppHost.cs       # provisions Postgres + database resource
```

Entities live in `Kairos.Domain` and stay free of EF attributes; mapping is done in `Configurations/` via the Fluent API.

## The schema (canonical — from the research report)

Two core tables plus the OAuth token store. `during` is a **stored generated** `tstzrange`; Kairos blocks may not overlap (gcal blocks may).

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE tasks (                       -- maps to TaskItem (the core aggregate)
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text,
  estimate_min int  NOT NULL DEFAULT 30,
  tags         text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
  -- user_id seam left for the future; no UI/auth in v1
);

CREATE TABLE scheduled_blocks (            -- maps to ScheduledBlock
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid REFERENCES tasks(id) ON DELETE CASCADE,
  source      text NOT NULL CHECK (source IN ('kairos','gcal')),  -- stored as string
  external_id text,                        -- gcal event id when source='gcal'
  start_ts    timestamptz NOT NULL,
  end_ts      timestamptz NOT NULL,
  during      tstzrange GENERATED ALWAYS AS (tstzrange(start_ts, end_ts, '[)')) STORED,
  rrule       text,                        -- iCal RRULE for recurring Kairos blocks (expand on read)
  CHECK (end_ts > start_ts)
);

CREATE INDEX idx_blocks_during_gist ON scheduled_blocks USING GIST (during);
CREATE INDEX idx_blocks_source      ON scheduled_blocks (source);
CREATE INDEX idx_blocks_external    ON scheduled_blocks (source, external_id) WHERE external_id IS NOT NULL;

-- No overlapping Kairos blocks (gcal can overlap; your own should not)
ALTER TABLE scheduled_blocks
  ADD CONSTRAINT no_overlap_kairos
  EXCLUDE USING GIST (during WITH &&) WHERE (source = 'kairos');
```

The generated `during` column and the `EXCLUDE` constraint can't be expressed in EF fluent mapping — emit them with `migrationBuilder.Sql(...)` in the migration (map `during` as a computed `NpgsqlRange<DateTime>` column / `.HasComputedColumnSql(..., stored: true)` and add the extension via `HasPostgresExtension("btree_gist")`).

## Build workflow

Model the domain, configure mapping, generate a migration, apply it — one entity/aggregate at a time. Run `dotnet build` and verify the migration applies cleanly before moving on. Don't batch failures.

### 1. Packages
```powershell
dotnet add src/Kairos.Infrastructure package Npgsql.EntityFrameworkCore.PostgreSQL
dotnet add src/Kairos.Infrastructure package Microsoft.EntityFrameworkCore.Design
dotnet add src/Kairos.Infrastructure package Aspire.Npgsql.EntityFrameworkCore.PostgreSQL
```
Install the EF CLI if needed: `dotnet tool install --global dotnet-ef`.

### 2. Entities (Domain)
- **`TaskItem`** (core aggregate): id, title, description, `EstimateMinutes`, `Tags` (string[]), `CreatedAt`, `CompletedAt`.
- **`ScheduledBlock`**: id, `TaskId`, `Source` (enum {Kairos, Gcal}), `ExternalId?`, `Start`/`End` (`DateTimeOffset` UTC), `During` (`NpgsqlRange<DateTime>`, computed), `Rrule?`.
- **`OAuthToken`** (Google Calendar): provider, encrypted `access_token`/`refresh_token`, expiry, `nextSyncToken`. Encryption is done in `Infrastructure` via Data Protection (see `backend-builder`); the column stores ciphertext.
- Use `DateTimeOffset` (UTC) for times, enums for `Source`/status, `Guid` keys. No EF dependencies in the domain.

### 3. DbContext & configurations
```csharp
public class KairosDbContext(DbContextOptions<KairosDbContext> options) : DbContext(options)
{
    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<ScheduledBlock> ScheduledBlocks => Set<ScheduledBlock>();
    public DbSet<OAuthToken> OAuthTokens => Set<OAuthToken>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasPostgresExtension("btree_gist");
        b.ApplyConfigurationsFromAssembly(typeof(KairosDbContext).Assembly);
    }
}
```
- One `IEntityTypeConfiguration<T>` per entity. Set keys, `MaxLength`, required columns, indexes, **enum-to-string** conversions (`HasConversion<string>()`), the computed `during` column (`HasComputedColumnSql("tstzrange(start_ts, end_ts, '[)')", stored: true)`), and concurrency tokens (`xmin` via `UseXminAsConcurrencyToken()`). No inline mapping in `OnModelCreating` beyond the extension + assembly scan.
- Default the context to **no-tracking** for reads: `optionsBuilder.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking)`.

### 4. Free-slot query (SQL, not C#)
Put the canonical multirange query in `Queries/FreeSlotQueries.cs` and surface it via `FromSqlInterpolated` (or a compiled raw query):
```sql
WITH busy AS (
  SELECT range_agg(during)::tstzmultirange AS busy_mr
  FROM scheduled_blocks
  WHERE during && tstzrange({day_start}, {day_end}, '[)')
),
working AS (
  SELECT multirange(tstzrange({work_start}, {work_end}, '[)')) AS work_mr
)
SELECT unnest(work_mr - COALESCE(busy_mr, '{}'::tstzmultirange)) AS free_slot
FROM busy, working;
```
That's the entire free-slot detection. The **top-N ranking** of returned slots happens in C# (the scoring formula in the research report §1). The hot window query is `WHERE during && tstzrange($1,$2,'[)') ORDER BY start_ts` — GiST-indexed, sub-millisecond at this scale. Don't reintroduce the pre-PG14 gaps-and-islands fallback — PG 14+ is mandated precisely to avoid it.

### 5. Register via Aspire integration
```csharp
builder.AddNpgsqlDbContext<KairosDbContext>("kairosdb");   // connection string + health + OTel from AppHost
```
Append Npgsql tuning to the connection string / data-source builder (`MaxAutoPrepare=20;AutoPrepareMinUsages=2`). The name `kairosdb` must match the AppHost resource. Hosts call `AddInfrastructure()`; never hard-code connection strings.

### 6. Provision Postgres in the AppHost
```csharp
var postgres = builder.AddPostgres("postgres").WithDataVolume("kairos_pgdata");
if (builder.ExecutionContext.IsRunMode) postgres = postgres.WithPgAdmin();  // dev-only
var kairosdb = postgres.AddDatabase("kairosdb");
builder.AddProject<Projects.Kairos_Web>("web").WithReference(kairosdb).WaitFor(kairosdb);
// MCP runs in-process on `web` (/mcp) — no separate `mcp` resource.
```
Enable diagnostics extensions on the Postgres image/config: `pg_stat_statements` (shared_preload_libraries) and `auto_explain` with `log_min_duration = 50ms` — their output feeds Loki/postgres-exporter (see `observability-builder`).

### 7. Migrations
- Create: `dotnet ef migrations add <Name> --project src/Kairos.Infrastructure --startup-project src/Kairos.Web`.
- **Inspect the generated migration** before committing — and add the raw `migrationBuilder.Sql(...)` for the `btree_gist` extension, the generated `during` column (if EF didn't emit it), and the `EXCLUDE USING GIST (during WITH &&) WHERE (source='kairos')` constraint.
- Apply: in **dev**, migrate at startup behind a guard (`if (app.Environment.IsDevelopment()) await db.Database.MigrateAsync();`). For **deploys**, use a **migration bundle** (`dotnet ef migrations bundle`) or a one-shot migrator step — not migrate-on-startup in prod.
- Never `EnsureCreated()` alongside migrations; never edit an applied migration — add a new one. After bulk sync inserts, `ANALYZE` the table so the GiST planner doesn't flip to nested-loop.

### 8. Seeding
- Idempotent seed logic in `Seed/DbSeeder.cs` (check-then-insert, or `HasData` for static reference data). Run dev seeding after `MigrateAsync()`.

### 9. Repositories / data access (optional)
- If using the repository pattern, define interfaces in `Kairos.Application`, implement in `Repositories/`. Otherwise inject `KairosDbContext` into application services. Keep query logic out of `Web`/`Mcp` — they call application services.

### 10. Containers, volumes & backup
- The AppHost runs Postgres as a container for dev; both `compose.dev.yml` and `compose.prod.yml` define a `postgres` service with the `kairos_pgdata` named volume (bind-mounted under `%USERPROFILE%\KairosData\pg`), matching credentials/db name, on the shared `kairos` network. Keep the service name and db name aligned with the Aspire resource and the connection-string key.
- Nightly `pg_dump -Fc` backups + a rehearsed `pg_restore` restore drill are owned by `devops-builder` — coordinate the volume path and db name.

### 11. Tests — see `testing-builder`
- Integration tests use **Testcontainers** (`postgres:17`) to spin a real ephemeral Postgres, apply migrations, and assert real query behavior — including the multirange free-slot SQL and the exclusion constraint. **Never** test against the EF in-memory provider — it hides multirange/GiST/`timestamptz` behavior.

## Conventions

- **Schema is code.** Every change is a migration in source control; the live DB is never hand-altered. Never edit an applied migration.
- **Domain is persistence-ignorant.** Entities carry no EF attributes; all mapping is Fluent API in `Configurations/`.
- **PG 14+ is a hard floor**; target `postgres:17-alpine`. Multiranges + `btree_gist` + the `EXCLUDE` no-overlap constraint are core to the schedule model.
- **Free slots = SQL.** `unnest(work_mr - range_agg(busy))`; C# only ranks the returned rows.
- **UTC everywhere** (`DateTimeOffset`/`timestamptz`); **enums as strings**; explicit `MaxLength`; indexes on lookup/filter/FK columns; `xmin` concurrency token.
- **Recurrence is stored as `rrule`, never pre-expanded** into rows — expand on read (`Ical.Net`, owned by `backend-builder`).
- **Connection strings / token plaintext never committed.** Tokens are stored encrypted (Data Protection); connection strings come from Aspire/environment.
- **One `kairosdb` name** across Domain mapping, Infrastructure registration, AppHost resource, and both compose services.
- After changes: `dotnet build` clean, migration applies cleanly on real Postgres, integration tests pass.

## Definition of done

The data layer is complete when: `TaskItem`/`ScheduledBlock`/`OAuthToken` are modeled in `Kairos.Domain` and mapped via configurations; the `tasks`/`scheduled_blocks` schema exists with the stored `during` range, GiST index, and the `no_overlap_kairos` exclusion constraint; `btree_gist`/`auto_explain`/`pg_stat_statements` are enabled; the multirange free-slot query runs in SQL; `KairosDbContext` is registered through Aspire with Npgsql auto-prepare tuning and no-tracking reads; the AppHost provisions PG 17 (volume, optional dev pgAdmin); migrations are committed and apply cleanly; dev seeding is idempotent; both compose files bring up Postgres; and Testcontainers integration tests pass against real Postgres (including multirange SQL and the exclusion constraint). Anything skipped is called out explicitly.
