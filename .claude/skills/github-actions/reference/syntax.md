# Workflow syntax — the keys you'll actually use

Authoritative reference for `.github/workflows/*.yml` keys and trigger events, with the gotchas this repo has paid for. Source: GitHub's "Workflow syntax for GitHub Actions" docs.

## Top-level keys

### `name`
Human-readable name shown in the Actions tab. Optional; defaults to the file path. Keep it short and noun-y (`CI`, `Deploy`, `E2E`, not `Run the tests when somebody opens a PR`).

```yaml
name: CI
```

### `on`
What triggers the workflow. See the trigger reference further down.

### `permissions`
Restricts the `GITHUB_TOKEN`. **Always set this**, default to `contents: read`, elevate per-job only where needed.

```yaml
permissions:
  contents: read
```

Per-job override:

```yaml
jobs:
  release:
    permissions:
      contents: write   # needed to push a tag
      pull-requests: write
    runs-on: ubuntu-latest
```

Common scopes: `contents`, `pull-requests`, `issues`, `checks`, `id-token` (for OIDC), `packages`, `deployments`, `actions`.

### `concurrency`
Controls how multiple runs of the same workflow interact. Two canonical shapes:

**CI on a branch — cancel stale runs:**
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

**Production deploy — serialize, never cancel:**
```yaml
concurrency:
  group: deploy-production
  cancel-in-progress: false
```

Workflow-level applies to the whole run; job-level can scope to one job. Use workflow-level for the common cases.

### `defaults`
Workflow-wide defaults for `run:` steps. Useful for cross-platform consistency.

```yaml
defaults:
  run:
    shell: bash
    working-directory: ./packages/app
```

This repo is single-package — `defaults.run.shell: bash` is rarely needed.

### `env`
Workflow-wide environment variables (visible in every job/step).

```yaml
env:
  NODE_OPTIONS: --max-old-space-size=4096
```

Prefer step-level `env:` when the value is only needed by one step.

## Job-level keys

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15        # always set this
    needs: lint                # gate this job on another
    if: github.event_name == 'push'
    permissions:
      contents: read
    env:
      CI: true
    outputs:
      version: ${{ steps.bump.outputs.version }}
    steps:
      - ...
```

- **`runs-on`** — `ubuntu-latest` for everything in this repo. `windows-latest` and `macos-latest` are more expensive and slower; only matrix into them when the change actually depends on OS.
- **`timeout-minutes`** — non-negotiable. Default 15 for CI, 30 for builds, 60 for E2E.
- **`needs`** — string or array. Creates a DAG. Failed `needs` skip the dependent unless `if: always()` is set.
- **`if`** — Conditional. The expression syntax is GitHub-specific (`${{ }}` is optional inside `if:` for booleans).
- **`outputs`** — Map of name → `${{ steps.<id>.outputs.<key> }}`. Downstream jobs read with `${{ needs.<job>.outputs.<name> }}`.

### `strategy`
Matrix runs and parallelization.

```yaml
strategy:
  fail-fast: false           # don't kill siblings on first failure
  max-parallel: 2            # cap concurrent matrix legs
  matrix:
    node-version: [20, 22]
    os: [ubuntu-latest, windows-latest]
    include:
      - node-version: 20
        os: ubuntu-latest
        coverage: true       # extra field for one combination
    exclude:
      - node-version: 22
        os: windows-latest
```

`fail-fast: false` is the right default for cross-platform matrices — you want to see all failures, not the first one. For single-axis matrices on a stable target, the default `true` is fine.

## Step-level keys

```yaml
steps:
  - name: Install dependencies
    id: install
    uses: actions/setup-node@v4
    with:
      node-version: 20
      cache: 'npm'
    env:
      FOO: bar
    if: runner.os == 'Linux'
    continue-on-error: false
    timeout-minutes: 5
```

- **`uses`** — Reference to an action. Pin per [security.md](security.md) § Pinning.
- **`run`** — Shell command(s). Multi-line OK; defaults to `bash` on Linux, `pwsh` on Windows.
- **`with`** — Inputs to the action. Keys depend on the action.
- **`env`** — Step-scoped env vars. The right place to launder untrusted input before referencing it in `run:`.
- **`id`** — Required if a later step references this step's outputs (`${{ steps.<id>.outputs.<key> }}`).
- **`continue-on-error`** — Useful for "nice to have" steps (e.g., posting a Slack notification) that shouldn't fail the job.

## Trigger events

### `push`
Pushes and tag creations.

```yaml
on:
  push:
    branches: [main]                # whitelist
    branches-ignore: [draft/**]     # blacklist (mutually exclusive with `branches`)
    paths:
      - 'src/**'                    # only run when these paths change
      - '!src/**/*.md'              # negation
    paths-ignore:                   # alternative form (mutually exclusive with `paths`)
      - '**.md'
      - '.claude/**'
    tags: ['v*']
```

Branch and path filters are AND'd together. The existing `deploy.yml` uses `paths-ignore` to skip doc-only pushes — that pattern is correct.

### `pull_request`
PR activity. Defaults to `[opened, synchronize, reopened]`.

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
    branches: [main]
    paths:
      - 'src/**'
```

Gotchas:
- PRs from forks **do not get secrets** and `GITHUB_TOKEN` is read-only. This is intentional.
- `GITHUB_REF` is the **merge ref** (`refs/pull/123/merge`), not the head commit. `actions/checkout@v4` handles this correctly.

### `pull_request_target` — handle with care
Runs in the context of the **base** repo with the base repo's secrets and a writable `GITHUB_TOKEN`. **Never check out and run PR head code under this trigger** — it's the canonical privilege-escalation hole for public repos.

Safe uses: labeling, commenting, size-checking the diff. Anything else: use `pull_request` instead.

### `workflow_dispatch`
Manual trigger from the Actions UI (and `gh workflow run`). Supports typed inputs.

```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        type: environment        # or string, boolean, choice
        required: true
      dry_run:
        type: boolean
        default: false
```

Always include `workflow_dispatch` on production-deploy workflows. The user needs a "redeploy now" button.

### `workflow_call`
Makes this workflow reusable from another. Pair with caller's `uses: ./.github/workflows/_foo.yml`.

```yaml
on:
  workflow_call:
    inputs:
      env:
        type: string
        required: true
    secrets:
      DEPLOY_TOKEN:
        required: true
```

Convention in this repo: reusable workflow filenames start with `_` to signal "not directly triggered."

### `schedule`
Cron. Minimum interval is 5 minutes; the cron always runs against the **default branch**.

```yaml
on:
  schedule:
    - cron: '30 5 * * 1-5'      # weekdays at 05:30 UTC
```

Times are UTC. Be conservative — scheduled runs without `concurrency:` can pile up.

### `release`, `issues`, `issue_comment`, `deployment_status`
Less common in this repo. Use only when you have a clear reason — a PR comment that triggers a workflow is a vector if not gated tightly with `if:` on the actor / association.

## Expression quick-reference

- `${{ github.event_name }}` — `push`, `pull_request`, etc.
- `${{ github.ref }}` — `refs/heads/main`, `refs/pull/123/merge`, `refs/tags/v1`.
- `${{ github.ref_name }}` — `main`, not `refs/heads/main`.
- `${{ github.sha }}` — commit SHA.
- `${{ github.actor }}` — username that triggered the run.
- `${{ secrets.NAME }}` — secret value (auto-redacted in logs).
- `${{ env.NAME }}` — env var.
- `${{ steps.<id>.outputs.<key> }}` — previous step's output.
- `${{ needs.<job>.outputs.<key> }}` — upstream job's output.
- `${{ runner.os }}` — `Linux`, `Windows`, `macOS`.

Functions: `contains()`, `startsWith()`, `endsWith()`, `format()`, `hashFiles()`, `fromJSON()`, `toJSON()`, `success()`, `failure()`, `cancelled()`, `always()`.

```yaml
if: github.event_name == 'pull_request' && !contains(github.event.pull_request.labels.*.name, 'skip-ci')
```

## What this file does NOT cover
- Action authoring (composite actions, JavaScript actions, Docker actions). Out of scope for this repo so far.
- Self-hosted runners. Not used.
- Larger-runner labels. Not used.
- GitHub Enterprise differences. Not relevant.
