---
name: database-builder
description: "Build the Kairos data layer — PostgreSQL accessed via EF Core + Npgsql with code-first migrations, provisioned through .NET Aspire and run as a container (with optional pgAdmin). Use when the user asks to create or change entities, the DbContext, entity configurations, EF Core migrations, seed data, repositories, the Postgres container/volume, or connection-string wiring for Kairos."
---

# database-builder

Build the Kairos data layer exactly as specified in [docs/technology-stack.md](../../../docs/technology-stack.md). This skill is the procedural companion to that document for persistence: the tech-stack doc decides *what* the database stack is, this skill decides *how* to model, migrate, and provision it consistently. It is a sibling of `backend-builder`, `frontend-builder`, and `observability-builder` — the data layer lives in `Kairos.Infrastructure` and is consumed by the application services those builders call.

**Read [docs/technology-stack.md](../../../docs/technology-stack.md) first** — it is the source of truth. If anything here conflicts with it, the tech-stack doc wins; update this skill to match.

## Canonical data stack (from the tech-stack doc)

- **Database:** **PostgreSQL** — primary relational store; runs as a container, provisioned via Aspire
- **ORM / access:** **Entity Framework Core** — code-first, LINQ querying
- **Driver/provider:** **Npgsql** (`Npgsql.EntityFrameworkCore.PostgreSQL`) — first-class Postgres provider for .NET
- **Schema management:** **EF Core Migrations** — versioned, applied at startup (dev) or via migration bundles
- **Dev admin (optional):** **pgAdmin** container for local inspection
- **Aspire integration:** `Aspire.Npgsql.EntityFrameworkCore.PostgreSQL` wires connection strings + health checks + telemetry

> **Guiding principle:** the database schema is owned by code. Every schema change is a reviewed migration in source control — never hand-edited in the running database.

## Target layout (inside `src/Kairos.Infrastructure`)

```
src/Kairos.Infrastructure/
  KairosDbContext.cs                # the DbContext; ApplyConfigurationsFromAssembly
  Configurations/                   # one IEntityTypeConfiguration<T> per entity
    TaskConfiguration.cs
  Migrations/                       # EF-generated migrations (committed)
  Repositories/                     # repository implementations (if used)
  Seed/
    DbSeeder.cs                     # idempotent dev/reference seed data
  DependencyInjection.cs            # AddInfrastructure(): registers DbContext via Aspire
src/Kairos.Domain/                  # entities live here (persistence-ignorant)
src/Kairos.AppHost/AppHost.cs       # provisions Postgres + database resource
```

Entities live in `Kairos.Domain` and stay free of EF attributes; mapping is done in `Configurations/` via the Fluent API.

## Build workflow

Model the domain first, configure mapping, then generate a migration and apply it — one entity/aggregate at a time. Run `dotnet build` and verify the migration applies cleanly before moving on. Don't batch failures.

### 1. Packages
In `Kairos.Infrastructure`:
```powershell
dotnet add src/Kairos.Infrastructure package Npgsql.EntityFrameworkCore.PostgreSQL
dotnet add src/Kairos.Infrastructure package Microsoft.EntityFrameworkCore.Design
dotnet add src/Kairos.Infrastructure package Aspire.Npgsql.EntityFrameworkCore.PostgreSQL
```
Install the EF CLI if needed: `dotnet tool install --global dotnet-ef`.

### 2. Entities (Domain)
- Define entities in `Kairos.Domain` — start with the core `TaskItem` aggregate (Kairos = "the right time to do a task"): id, title, description, status, scheduled/window times, priority, timestamps.
- Use proper types: `DateTimeOffset` (UTC) for times, enums for status/priority, `Guid` keys (or identity — pick one and be consistent). No EF dependencies in the domain.

### 3. DbContext & configurations
```csharp
public class KairosDbContext(DbContextOptions<KairosDbContext> options) : DbContext(options)
{
    public DbSet<TaskItem> Tasks => Set<TaskItem>();

    protected override void OnModelCreating(ModelBuilder b)
        => b.ApplyConfigurationsFromAssembly(typeof(KairosDbContext).Assembly);
}
```
- One `IEntityTypeConfiguration<T>` per entity in `Configurations/`. Set keys, max lengths, required columns, indexes, enum-to-string conversions, and concurrency tokens (`xmin` via `IsRowVersion()` for Postgres) there. No inline mapping in `OnModelCreating` beyond the assembly scan.
- Map enums to strings (`HasConversion<string>()`) for readable, stable columns.

### 4. Register via Aspire integration
In `Kairos.Infrastructure/DependencyInjection.cs`, register the context through the Aspire component so the connection string, health checks, retries, and OTel instrumentation come from the AppHost:
```csharp
builder.AddNpgsqlDbContext<KairosDbContext>("kairosdb");
```
The connection-string name (`kairosdb`) must match the database resource declared in the AppHost. Hosts call `AddInfrastructure()`; never hard-code connection strings.

### 5. Provision Postgres in the AppHost
In `Kairos.AppHost/AppHost.cs`:
```csharp
var postgres = builder.AddPostgres("postgres")
                      .WithDataVolume()          // persist data across restarts
                      .WithPgAdmin();            // optional dev admin UI
var kairosdb = postgres.AddDatabase("kairosdb");

builder.AddProject<Projects.Kairos_Web>("web").WithReference(kairosdb).WaitFor(kairosdb);
builder.AddProject<Projects.Kairos_Mcp>("mcp").WithReference(kairosdb).WaitFor(kairosdb);
```

### 6. Migrations
- Create:
  ```powershell
  dotnet ef migrations add <Name> --project src/Kairos.Infrastructure --startup-project src/Kairos.Web
  ```
- Inspect the generated migration before committing — it is a reviewed artifact.
- Apply: in **dev**, run migrations at startup behind an environment guard (`if (app.Environment.IsDevelopment()) await db.Database.MigrateAsync();`). For **deploys**, prefer a **migration bundle** (`dotnet ef migrations bundle`) or a dedicated one-shot migrator step rather than migrating from app startup in production.
- Never use `EnsureCreated()` alongside migrations, and never edit applied migrations — add a new one.

### 7. Seeding
- Put idempotent seed logic in `Seed/DbSeeder.cs` (check-then-insert, or `HasData` for static reference data in configurations). Run dev seeding after `MigrateAsync()`.

### 8. Repositories / data access (optional)
- If using the repository pattern, define interfaces in `Kairos.Application` and implement them in `Repositories/`. Otherwise inject `KairosDbContext` into application services directly. Keep query logic out of `Web`/`Mcp` — they call application services, which own data access.

### 9. Containers & local stack
- The Aspire AppHost runs Postgres as a container for dev. For the full `docker compose up` stack, add a `postgres` service to `docker-compose.yml` with a named volume and matching credentials/db name, on the shared network, with the app services `depends_on` it. Keep the service name and database name aligned with the Aspire resource and the connection-string key.

### 10. Tests
- Integration tests use **Testcontainers for .NET** to spin a real ephemeral Postgres (consistent with `backend-builder`), apply migrations, and assert real query behavior. Don't test against an in-memory provider — it hides Postgres-specific behavior.

## Conventions

- **Schema is code.** Every change is a migration in source control; the live DB is never hand-altered.
- **Domain is persistence-ignorant.** Entities carry no EF attributes; all mapping is Fluent API in `Configurations/`.
- **UTC everywhere.** Store `DateTimeOffset`/`timestamptz`; convert at the edges.
- **Enums as strings**, explicit `MaxLength` on text columns, indexes on lookup/filter/foreign-key columns.
- **Connection strings come from Aspire/environment** — never committed or hard-coded.
- **One `kairosdb` name** consistently across Domain mapping, Infrastructure registration, AppHost resource, and the compose service.
- After changes: `dotnet build` clean, migration applies cleanly, integration tests pass.

## Definition of done

The data layer is complete when: entities are modeled in `Kairos.Domain` and mapped via configurations; `KairosDbContext` is registered through the Aspire Npgsql integration; the AppHost provisions Postgres (with volume, optional pgAdmin); migrations exist, are committed, and apply cleanly; dev seeding is idempotent; `docker compose up` brings up Postgres alongside the app; and Testcontainers-based integration tests pass against real Postgres. Anything skipped is called out explicitly.
