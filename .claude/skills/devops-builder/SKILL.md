---
name: devops-builder
description: "Build the Kairos DevOps & tooling layer — GitFlow conventions (feature branch per vertical slice, v0.N tags), feature flags, GitHub Actions CI/CD (format, build, test, Playwright + k6 budget gates, container publish), EditorConfig, analyzers/warnings-as-errors, and the nightly pg_dump backup + restore drill. Use when the user asks to create or change CI/CD workflows, GitHub Actions, the build/test/publish pipeline, performance-budget gates, EditorConfig, analyzer/warnings-as-errors setup, feature flags, branch protection, backups, or release/versioning for Kairos."
---

# devops-builder

Build the Kairos DevOps & tooling layer exactly as specified in [docs/technology-stack.md](../../../docs/technology-stack.md). This skill is the procedural companion to that document for automation, code quality, and durability: the tech-stack doc decides *what* the tooling is, this skill decides *how* to enforce style and ship the software consistently. It is the gatekeeper across its siblings — they produce the code and containers; this skill builds, checks, gates, publishes, and backs them up automatically.

**Read [docs/technology-stack.md](../../../docs/technology-stack.md) first** — it is the source of truth (the Tooling & DevOps and Backup & Durability sections). [docs/report-technical-design-research.md](../../../docs/report-technical-design-research.md) holds the vertical-slice build order, the NFR-budget table the CI gates enforce, and the "restore drill in Slice 0" mandate. If anything here conflicts with the tech-stack doc, the doc wins; update this skill to match.

## Canonical DevOps stack (from the tech-stack doc)

- **Source control:** **Git / GitHub** — **GitFlow**: one feature branch per vertical slice; tag `v0.N` on merge to `main`
- **CI/CD:** **GitHub Actions** — build, test, container publish; **gates on the performance budgets** (k6 + Playwright) and bundle size
- **Code style:** **EditorConfig** — shared, editor-agnostic formatting rules
- **Quality gates:** **dotnet format + .NET analyzers** — build-time linting & style enforcement (warnings-as-errors)
- **Feature flags:** **`appsettings.json` booleans** — each build-order slice ships behind its own flag so it's independently demoable
- **Backup & durability:** nightly **`pg_dump -Fc`**, a **PowerShell retention** script (14 daily / 8 weekly / 12 monthly), and a rehearsed **`pg_restore` restore drill**

> **Guiding principle:** the pipeline is the single, automated source of truth for "is this mergeable?" Everything a reviewer would check — format, analyzers, warnings-as-errors build, the full test suite, **and the performance budgets** — runs in CI on every PR. Green pipeline is the merge contract; nothing ships that the pipeline didn't verify. And **a backup you've never restored isn't a backup** — rehearse the restore in Slice 0.

## What this skill owns

```
.editorconfig                       # formatting + analyzer severities (repo root)
Directory.Build.props               # solution-wide: net10.0, nullable, warnings-as-errors, analyzers
.config/dotnet-tools.json           # pinned local tools (dotnet-ef, etc.)
.github/
  workflows/
    ci.yml                          # PR + develop/main: format, build, test (Docker), Playwright, k6, bundle size
    publish.yml                     # on v* tag: build & push the web image to GHCR
  dependabot.yml                    # NuGet, npm (ClientApp), GitHub Actions, Docker base images
  pull_request_template.md
scripts/
  backup.ps1                        # pg_dump -Fc + retention rotation (14/8/12)
  restore-drill.ps1                 # throwaway compose + pg_restore + assert tasks reappear
.gitignore / .gitattributes
```
Runtime tuning (`ServerGarbageCollection`, ReadyToRun) lives in the **host** csproj (owned by `backend-builder`), not in `Directory.Build.props`.

## Build workflow

Establish style/analyzer rules so they apply locally, wrap them in CI, add the budget gates, then publish and back up. Validate each workflow with `act` or a draft PR. Don't batch failures.

### 1. EditorConfig & solution build settings
- `.editorconfig` at the repo root: indentation, line endings, `using` ordering, naming conventions, and **analyzer severities** (promote key rules to `warning`/`error`). This is what `dotnet format` enforces.
- `Directory.Build.props` at the root so every project inherits:
  ```xml
  <Project>
    <PropertyGroup>
      <TargetFramework>net10.0</TargetFramework>
      <Nullable>enable</Nullable>
      <ImplicitUsings>enable</ImplicitUsings>
      <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
      <EnableNETAnalyzers>true</EnableNETAnalyzers>
      <AnalysisLevel>latest-recommended</AnalysisLevel>
      <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
    </PropertyGroup>
  </Project>
  ```
- `.gitattributes` for consistent line endings on Windows: `* text=auto eol=lf`.

### 2. Feature flags
- Each vertical slice (research report Slice 0→7) ships behind an `appsettings.json` boolean (e.g. `Features:ScheduleView`, `Features:GoogleSync`, `Features:Mcp`), read via `IConfiguration`/`IOptions` and gating endpoint/UI registration. This lets each slice be merged and demoed independently. Document the flags in the README.

### 3. CI workflow — `.github/workflows/ci.yml`
Runs on every PR and push to `develop`/`main`. **Must run on a Docker-enabled runner** (Testcontainers + Aspire.Hosting.Testing) and needs Node (Vite assets + Playwright) and k6. Order cheap→expensive so failures surface fast:
```yaml
name: ci
on:
  pull_request:
  push: { branches: [develop, main] }
jobs:
  build-test:
    runs-on: ubuntu-latest          # Docker available for Testcontainers + Aspire tests
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with: { dotnet-version: "10.0.x" }
      - uses: actions/setup-node@v4   # Kairos.Web front-end assets + Playwright (frontend/testing builders)
        with: { node-version: "lts/*" }
      - run: dotnet restore
      - run: dotnet format --verify-no-changes              # style/analyzer gate
      - run: dotnet build --no-restore -c Release           # warnings-as-errors from Directory.Build.props
      - run: dotnet test --no-build -c Release --collect:"XPlat Code Coverage"
      - run: npm ci --prefix src/Kairos.Web/ClientApp
      - run: npm run build --prefix src/Kairos.Web/ClientApp # produces wwwroot/dist + manifest
      - name: Bundle-size gate (≤ 80 KB gzipped initial JS)
        run: node scripts/check-bundle-size.mjs
      - name: Playwright E2E + perf traces (TTI, drop→DB ≤ 100 ms)
        run: npx playwright test          # in tests/e2e
      - name: k6 budget gates (htmx swap p95≤50ms, PG query p95≤5ms)
        uses: grafana/setup-k6-action@v1
      - run: k6 run tests/load/schedule_swap.js
```
The Playwright and k6 steps are **merge gates**, enforcing the research report's NFR budget table — not advisory.

### 4. Publish workflow — `.github/workflows/publish.yml`
MCP is in-process on `web`, so there is **one** image to publish. On a `v*` tag, build and push the `web` image to **GHCR**:
```yaml
name: publish
on:
  push: { tags: ["v*"] }
permissions: { contents: read, packages: write }
jobs:
  image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: src/Kairos.Web/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}/web:${{ github.ref_name }}
```
Reuse the same multi-stage `Kairos.Web` Dockerfile `orchestration-builder` defines — CI builds the exact image that runs locally. (Postgres, Caddy, and the obs stack use upstream images — nothing to publish.)

### 5. Git/GitHub conventions — GitFlow
- **Branching:** **GitFlow** — a `feature/slice-N-*` branch per vertical slice off `develop`; merge to `develop` via PR; cut releases to `main`.
- **Tagging:** tag `v0.N` on merge to `main` per slice (matches the publish workflow's image tag).
- **Branch protection** on `develop` and `main`: require the `ci` checks (incl. Playwright + k6 gates) and at least one review before merge; no direct pushes.
- **Commits/PRs:** Conventional Commits (`feat:`, `fix:`, `chore:`…) for readable history; a `pull_request_template.md` with what/why/testing + "which feature flag / slice" + "budgets still green?".
- **`dependabot.yml`:** weekly updates for NuGet, npm (`ClientApp`), GitHub Actions, and Docker base images. **Pin `ModelContextProtocol`** (spec/SDK still moving) — review its bumps manually.

### 6. Backup & durability — `scripts/`
- `backup.ps1`: nightly `pg_dump -Fc kairosdb > $BackupDir\kairos-$(Get-Date -Format yyyyMMdd-HHmm).dump` (Windows Task Scheduler or a `kairos-backup` sidecar container against the `kairos_pgdata` volume). Apply retention: **14 daily / 8 weekly / 12 monthly**.
- `restore-drill.ps1`: spin a throwaway compose, `pg_restore -d kairosdb backup.dump`, assert tasks reappear. **Rehearse this once in Slice 0** — document it in the bootstrap checklist.

### 7. Local parity
- Document `dotnet format`, `dotnet build`, `dotnet test`, the Vite build, Playwright, and k6 as the pre-push routine in the README so what fails in CI is reproducible locally.
- Optionally add a pre-push hook — but **CI is authoritative**; local hooks are convenience only.

## Conventions

- **CI is the merge contract.** Format, analyzers, warnings-as-errors build, all test tiers, **and the Playwright/k6/bundle-size budget gates** run on every PR; merges require green + review.
- **GitFlow + `v0.N` tags.** Feature branch per slice → `develop` → `main`; tag `v0.N` on each release to `main`.
- **Slices ship behind feature flags** (`appsettings.json` booleans) so they're independently demoable.
- **One set of rules.** `.editorconfig` + `Directory.Build.props` define style/analysis once solution-wide; CI runs the same `dotnet format`.
- **Warnings are errors;** don't suppress an analyzer without an inline justification.
- **CI builds the real image.** Container publish reuses the `Kairos.Web` Dockerfile — one image (MCP is in-process), no separate build path.
- **Docker-enabled runners** for jobs that run integration/app-model tests; Node + k6 for the budget gates.
- **Backups are rehearsed, not assumed** — the restore drill is part of Slice 0.
- **Secrets via GitHub Actions secrets / OIDC**, never committed; least-privilege `permissions:` per workflow; pin `ModelContextProtocol`.
- After changes: `dotnet format --verify-no-changes`, `dotnet build -c Release`, `dotnet test`, the Vite build, Playwright, and k6 pass locally, and the workflows succeed on a PR.

## Definition of done

The DevOps layer is complete when: `.editorconfig` + `Directory.Build.props` enforce style + warnings-as-errors solution-wide; each slice has its `appsettings.json` feature flag; `ci.yml` runs format → build → test (Docker) → Playwright → k6 → bundle-size green on every PR, gating the NFR budgets; `publish.yml` builds and pushes the `web` image to GHCR on a `v*` tag; GitFlow is in place (feature→develop→main, `v0.N` tags) with `develop`/`main` branch-protected requiring green CI + review; Dependabot keeps dependencies current with `ModelContextProtocol` pinned; the nightly `pg_dump` backup + retention runs and the `pg_restore` restore drill is rehearsed and documented; and local `dotnet format`/`build`/`test`/Vite/Playwright/k6 mirror CI. Anything skipped is called out explicitly.
