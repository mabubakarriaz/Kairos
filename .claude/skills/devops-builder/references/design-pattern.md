# devops-builder — Design Patterns

> Patterns for the automation slice: **EditorConfig** + **analyzers**, **`Directory.Build.props`**, **feature flags**, **GitHub Actions CI/CD** with the **Playwright + k6 budget gates**, and the **`pg_dump` backup + restore drill**.
> Companion to [`.claude/skills/devops-builder/SKILL.md`](../SKILL.md). Canonical stack: [technology-stack.md](technology-stack.md). Legend & cross-cutting patterns: [design-pattern.md](../../../../docs/design-pattern.md).

The guiding rule — **"the pipeline is the single automated source of truth for 'is this mergeable?'"** — is itself a pattern statement: a **Chain of Responsibility** of gates, fed by a **single source of truth** for build rules, with backups as **Mementos** and slices behind **Feature Toggles**.

## Architectural backbone — Pipeline as a Chain of Responsibility

The CI workflow is a **Chain of Responsibility** [GoF]: `format → build (warnings-as-errors) → test → bundle-size → Playwright → k6`. Each gate either passes the PR to the next link or **short-circuits** the build. Ordering **cheap → expensive** is the design intent — fail fast on a formatting slip before spending minutes on k6. (Viewed as data flow, it's also **Pipes & Filters** [non-GoF · POSA]; the Chain framing emphasizes the *fail-fast gate* behavior that matters here.)

## Pattern catalogue

| Pattern | Category | Where in Kairos | Why |
|---|---|---|---|
| **Chain of Responsibility** | [GoF · Behavioral] | `ci.yml` gate sequence (format→build→test→bundle→Playwright→k6) | Each gate handles or stops the PR; cheap gates first. |
| **Memento** | [GoF · Behavioral] | `pg_dump -Fc` dumps + `pg_restore` restore drill | Capture/restore DB state without exposing its internals. |
| **Feature Toggle** | [non-GoF · Fowler] | `appsettings.json` booleans (`Features:ScheduleView`, `Features:GoogleSync`, `Features:Mcp`) | Ship/demo each vertical slice independently behind a flag. |
| **Strategy** | [GoF · Behavioral] | the toggle-driven registration; retention rotation (14/8/12); env-specific compose | Swap behavior by flag / environment / age. |
| **Template Method** | [GoF · Behavioral] | `Directory.Build.props` inherited by every project; the GitFlow release skeleton | A fixed shared skeleton; projects/releases fill specifics. |
| **Singleton (single source of truth)** | [GoF · Creational] | `.editorconfig` + `Directory.Build.props`; the one `Kairos.Web` image | One authoritative definition of style/build/image. |
| **Observer** | [non-GoF] | Dependabot watching NuGet/npm/Actions/Docker; branch-protection required checks | React to upstream changes / required-check status. |

---

### Chain of Responsibility — the CI gates

**Intent (GoF):** Avoid coupling sender to receiver by giving multiple objects a chance to handle a request, chained until one handles (or stops) it.

**Where it lives:** `.github/workflows/ci.yml`, in deliberate cheap→expensive order:

```yaml
- run: dotnet format --verify-no-changes          # style/analyzer gate (cheapest)
- run: dotnet build --no-restore -c Release        # warnings-as-errors
- run: dotnet test --no-build -c Release --collect:"XPlat Code Coverage"
- run: node scripts/check-bundle-size.mjs          # ≤ 80 KB gzipped initial JS
- run: npx playwright test                         # TTI, drop→DB ≤ 100 ms (traces)
- run: k6 run tests/load/schedule_swap.js          # htmx swap p95≤50ms, PG query p95≤5ms (most expensive)
```

**Why it fits:** a failed link stops the chain — green pipeline *is* the merge contract. The Playwright/k6 links are **gates, not advice**; they enforce the research report's NFR table. Branch protection on `develop`/`main` makes the chain's verdict binding (required checks + one review, no direct pushes).

**Pitfalls:** must run on a **Docker-enabled** runner (Testcontainers + Aspire.Hosting.Testing) with Node (Vite/Playwright) and k6. Don't reorder expensive-first — that defeats fail-fast.

### Memento — backups & the restore drill

**Intent (GoF):** Capture and externalize an object's internal state so it can be restored later, without violating encapsulation.

**Where it lives:** `scripts/backup.ps1` takes a `pg_dump -Fc` snapshot (the Memento — an opaque custom-format capture of `kairosdb`); `scripts/restore-drill.ps1` restores it into a throwaway compose and asserts tasks reappear. Retention is a **Strategy** over the set of Mementos: **14 daily / 8 weekly / 12 monthly**.

**Why it fits:** the dump is a self-contained state capture the app doesn't need to understand to restore — textbook Memento. And the skill's mandate makes the pattern's *caretaker* responsibility explicit: **"a backup you've never restored isn't a backup"** — rehearse the restore in **Slice 0**.

**Pitfalls:** coordinate the volume path (`kairos_pgdata`, bind-mounted under `%USERPROFILE%\KairosData\pg`) and the db name with [database-builder.md](../../database-builder/references/design-pattern.md) / [orchestration-builder.md](../../orchestration-builder/references/design-pattern.md). An untested Memento is not a backup.

### Feature Toggle — slices behind flags

**Intent (Fowler):** Decouple deploy from release; ship code dark behind a runtime flag.

**Where it lives:** each vertical slice registers its endpoints/UI behind an `appsettings.json` boolean read via `IConfiguration`/`IOptions` — so a half-finished slice can merge to `develop` without being exposed. This is what makes "one feature branch per slice → `develop`" safe.

```csharp
if (config.GetValue<bool>("Features:GoogleSync"))
    builder.Services.AddHostedService<GoogleCalendarSyncWorker>();
```

**Pitfalls:** document every flag in the README; a toggle nobody knows about is a landmine. Toggles are a **Strategy** for *what's registered*, not an excuse to leave dead branches forever — retire a flag once its slice is permanent.

### Template Method & single-source-of-truth Singleton

- **Template Method / Singleton:** `Directory.Build.props` at the root is the one inherited skeleton — `net10.0`, `Nullable`, `ImplicitUsings`, `TreatWarningsAsErrors`, analyzers — every project fills only its specifics. `.editorconfig` is the single style authority `dotnet format` enforces locally *and* in CI. **One set of rules.** (Runtime tuning — `ServerGarbageCollection`, ReadyToRun — lives in the **host** csproj, not here.)
- **Singleton (image):** because MCP is in-process, there is exactly **one** `Kairos.Web` image; `publish.yml` builds and pushes it to GHCR on a `v*` tag, reusing the **same** Dockerfile `orchestration-builder` defines — CI builds the exact image that runs locally.

### Observer — Dependabot & required checks

Dependabot observes upstream (NuGet, npm `ClientApp`, GitHub Actions, Docker base images) and opens PRs on change; branch protection observes the CI chain's status as **required checks**. **Pin `ModelContextProtocol`** — the spec/SDK still move, so review its bumps manually rather than auto-merging.

## Anti-patterns to avoid

- **Gates as aspirations.** Playwright/k6/bundle-size are merge gates; a budget that doesn't block merge isn't a budget.
- **Reordering the chain expensive-first.** Kills fail-fast feedback.
- **Suppressing an analyzer without inline justification.** Warnings are errors; one rule set, no quiet exceptions.
- **An unrehearsed backup.** The restore drill is part of Slice 0 — a Memento you've never restored is not a backup.
- **A second build path for "the MCP image."** There's one image (MCP is in-process); publishing reuses the `Kairos.Web` Dockerfile.
- **Secrets in the repo.** GitHub Actions secrets / OIDC, least-privilege `permissions:` per workflow — never committed.

## How this maps to the build workflow

Establish the single-source-of-truth rules (`.editorconfig` + `Directory.Build.props`) so they apply locally, wrap them in the CI **Chain of Responsibility**, add the budget-gate links, then publish the one image on a `v0.N` tag and stand up the **Memento** backups with a rehearsed restore. Each slice rides in behind its **Feature Toggle**; local `format`/`build`/`test`/Vite/Playwright/k6 mirror the chain so what fails in CI is reproducible at the desk.
