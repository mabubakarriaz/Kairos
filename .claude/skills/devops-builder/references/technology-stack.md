# Tooling & DevOps + Backup & Durability — Technology Stack (Kairos)

> The **Tooling & DevOps** and **Backup & Durability** slice of the canonical Kairos stack, owned by the `devops-builder` skill.
> Indexed in [docs/technology-stack.md](../../../../docs/technology-stack.md); rationale, benchmarks & rejected alternatives in [docs/research.md](../../../../docs/research.md). Cross-cutting decisions — the architecture diagram and the [_Deliberately Excluded_](../../../../docs/technology-stack.md#deliberately-excluded) list — live in the index. Patterns for this slice: [design-pattern.md](design-pattern.md).

## Tooling & DevOps

| Technology | Purpose | Notes |
|---|---|---|
| **Git / GitHub** | Source control & collaboration | GitFlow — one feature branch per vertical slice; tag `v0.N` on merge to `main` |
| **GitHub Actions** | CI/CD pipelines | Build, test, container publish; gates on the performance budgets (k6 + Playwright) and bundle size |
| **EditorConfig** | Consistent code style | Shared formatting rules |
| **dotnet format / analyzers** | Linting & style enforcement | Build-time code quality gates |
| **Feature flags** (`appsettings.json` booleans) | Independently demoable slices | Each build-order slice ships behind its own flag |

## Backup & Durability

| Technology | Purpose | Notes |
|---|---|---|
| **`pg_dump` (`-Fc` custom format)** | Nightly logical backups | Run via a `kairos-backup` sidecar container or Windows Task Scheduler |
| **PowerShell retention script** | Backup rotation | 14 daily / 8 weekly / 12 monthly |
| **`pg_restore` restore drill** | Verify backups actually work | Rehearsed in the bootstrap checklist (Slice 0) — "if you don't do this once, you don't have backups" |

> **CI is the merge contract:** the pipeline runs format → build (`-c Release`) → test → Playwright → k6 → bundle-size on a Docker-enabled runner; the performance budgets are gates, not aspirations. Runtime tuning (`ServerGarbageCollection`, ReadyToRun) lives in the **host** csproj (see the backend slice), not in `Directory.Build.props`.

---

_Derived from the canonical Kairos stack. If anything here conflicts with [docs/technology-stack.md](../../../../docs/technology-stack.md), the index wins; update this slice to match._
