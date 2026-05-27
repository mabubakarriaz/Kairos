<!-- Conventional Commit title, e.g. feat: schedule view drag-to-reschedule -->

## What & why
<!-- What does this change do, and why? -->

## Slice / feature flag
<!-- Which vertical slice? Which appsettings Features:* flag gates it? -->

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests (Testcontainers) where Postgres semantics matter
- [ ] `dotnet format` clean, `dotnet build -c Release` (warnings-as-errors) green
- [ ] `dotnet test` green (unit + integration + app-model)

## Budgets still green?
<!-- Playwright (TTI, drop→DB ≤ 100 ms) + k6 (htmx swap p95 ≤ 50 ms, PG query p95 ≤ 5 ms)
     + initial JS bundle ≤ 80 KB gzipped -->
- [ ] NFR budget gates pass
