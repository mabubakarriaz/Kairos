---
name: devops-builder
description: "Build the Kairos DevOps & tooling layer — Git/GitHub conventions, GitHub Actions CI/CD (build, test, container publish), EditorConfig, and code-quality enforcement via analyzers and dotnet format. Use when the user asks to create or change CI/CD workflows, GitHub Actions, the build/test/publish pipeline, EditorConfig, analyzer/warnings-as-errors setup, code-style gates, branch protection, or release/versioning for Kairos."
---

# devops-builder

Build the Kairos DevOps & tooling layer exactly as specified in [docs/technology-stack.md](../../../docs/technology-stack.md). This skill is the procedural companion to that document for automation and code quality: the tech-stack doc decides *what* the tooling is, this skill decides *how* to enforce style and ship the software consistently. It is the gatekeeper across its siblings — `backend-builder`, `frontend-builder`, `database-builder`, `observability-builder`, `mcp-builder`, `orchestration-builder`, and `testing-builder` produce the code and containers; this skill builds, checks, and publishes them automatically.

**Read [docs/technology-stack.md](../../../docs/technology-stack.md) first** — it is the source of truth. If anything here conflicts with it, the tech-stack doc wins; update this skill to match.

## Canonical DevOps stack (from the tech-stack doc)

- **Source control:** **Git / GitHub** — repository hosting & collaboration
- **CI/CD:** **GitHub Actions** — build, test, container publish
- **Code style:** **EditorConfig** — shared, editor-agnostic formatting rules
- **Quality gates:** **dotnet format + .NET analyzers** — build-time linting & style enforcement

> **Guiding principle:** the pipeline is the single, automated source of truth for "is this mergeable?" Everything a reviewer would check — format, analyzers, build with warnings-as-errors, and the full test suite — runs in CI on every PR. Green pipeline is the merge contract; nothing ships that the pipeline didn't verify.

## What this skill owns

```
.editorconfig                       # formatting + analyzer severities (repo root)
Directory.Build.props               # solution-wide build settings (nullable, warnings-as-errors, analyzers)
.github/
  workflows/
    ci.yml                          # PR + main: format check, build, test (Docker for Testcontainers)
    publish.yml                     # on tag/release: build & push container images
  dependabot.yml                    # dependency update automation
  pull_request_template.md
.gitignore / .gitattributes
```

## Build workflow

Establish style/analyzer rules first so they apply locally, then wrap them in CI, then add publish. Validate each workflow with `act` or a draft PR. Don't batch failures.

### 1. EditorConfig & solution build settings
- `.editorconfig` at the repo root: indentation, line endings, `using` ordering, naming conventions, and **analyzer severities** (e.g. promote key rules to `warning`/`error`). This is what `dotnet format` enforces.
- `Directory.Build.props` at the root so every project inherits consistent settings:
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
- `.gitattributes` for consistent line endings (important on Windows): `* text=auto eol=lf`.

### 2. CI workflow — `.github/workflows/ci.yml`
Runs on every PR and push to `main`. **Must run on a runner with Docker** because `testing-builder` uses Testcontainers + Aspire.Hosting.Testing.
```yaml
name: ci
on:
  pull_request:
  push: { branches: [main] }
jobs:
  build-test:
    runs-on: ubuntu-latest          # Docker available for Testcontainers
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with: { dotnet-version: "10.0.x" }
      - uses: actions/setup-node@v4   # Kairos.Web front-end assets (frontend-builder)
        with: { node-version: "lts/*" }
      - run: dotnet restore
      - run: dotnet format --verify-no-changes        # style/analyzer gate
      - run: dotnet build --no-restore -c Release      # warnings-as-errors from Directory.Build.props
      - run: dotnet test --no-build -c Release --collect:"XPlat Code Coverage"
```
Keep the steps ordered cheap→expensive (format → build → test) so failures surface fast.

### 3. Publish workflow — `.github/workflows/publish.yml`
On a version tag / GitHub Release, build and push the `web` and `mcp` images to **GHCR**:
```yaml
name: publish
on:
  push: { tags: ["v*"] }
permissions: { contents: read, packages: write }
jobs:
  images:
    runs-on: ubuntu-latest
    strategy: { matrix: { service: [web, mcp] } }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: src/Kairos.${{ matrix.service }}/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}/${{ matrix.service }}:${{ github.ref_name }}
```
Reuse the same multi-stage Dockerfiles `orchestration-builder` defines — CI builds the exact images that run locally.

### 4. Git/GitHub conventions
- **Branching:** short-lived feature branches off `main`; PRs only — no direct pushes to `main`.
- **Branch protection** on `main`: require the `ci` checks to pass and at least one review before merge.
- **Commits/PRs:** Conventional Commits (`feat:`, `fix:`, `chore:`…) for readable history and future automated changelogs; a `pull_request_template.md` with a what/why/testing checklist.
- **`dependabot.yml`:** weekly updates for NuGet, npm (`ClientApp`), GitHub Actions, and Docker base images.

### 5. Local parity
- Document `dotnet format`, `dotnet build`, and `dotnet test` as the pre-push routine in the README so what fails in CI is reproducible locally.
- Optionally add a pre-commit/pre-push hook (or a `dotnet format` step) — but **CI is authoritative**; local hooks are convenience only.

### 6. Versioning & releases (optional)
- Tag releases `vMAJOR.MINOR.PATCH`; the publish workflow tags images to match. Optionally generate release notes from Conventional Commits.

## Conventions

- **CI is the merge contract.** Format, analyzers, warnings-as-errors build, and all test tiers run on every PR; merges require green + review.
- **One set of rules.** `.editorconfig` + `Directory.Build.props` define style/analysis once for the whole solution; CI enforces the same `dotnet format` locally and remotely.
- **Warnings are errors** in CI; don't suppress an analyzer without an inline justification.
- **CI builds the real images.** Container publish reuses the orchestration Dockerfiles — no separate build path.
- **Docker-enabled runners** for jobs that run integration/app-model tests.
- **Secrets via GitHub Actions secrets / OIDC**, never committed; least-privilege `permissions:` per workflow.
- After changes: `dotnet format --verify-no-changes`, `dotnet build -c Release`, and `dotnet test` pass locally, and the workflows succeed on a PR.

## Definition of done

The DevOps layer is complete when: `.editorconfig` and `Directory.Build.props` enforce style + warnings-as-errors solution-wide; `ci.yml` runs format → build → test (with Docker) green on every PR; `publish.yml` builds and pushes `web` + `mcp` images to GHCR on release; `main` is branch-protected requiring green CI + review; Dependabot keeps dependencies current; and local `dotnet format`/`build`/`test` mirror CI. Anything skipped is called out explicitly.
