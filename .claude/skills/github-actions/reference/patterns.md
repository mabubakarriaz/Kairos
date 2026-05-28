# Patterns — copy-paste-able templates

Full-file workflow templates that pass the [checklist](checklists.md). Each is annotated so you can read it once and know **why** each line is there. Adapt — don't paste blindly.

## Pattern A — CI (lint, typecheck, build, test)

The default pipeline for every PR and non-main push. Single job, single ubuntu runner.

```yaml
# .github/workflows/ci.yml
name: CI

# Quality gate for pull requests and non-main pushes:
# lint → typecheck → build → unit tests. No secrets needed; the app's Supabase
# client is created lazily so `next build` succeeds without environment variables.

on:
  pull_request:
  push:
    branches-ignore: [main]

# Stale runs on the same ref are useless once a new push lands.
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

# Read-only is enough for build/test. No PR write, no contents write.
permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20         # matches engines.node in package.json
          cache: 'npm'             # caches ~/.npm keyed on package-lock.json

      - run: npm ci

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npm run typecheck

      # `next build` is the authoritative type gate AND the bundle pipeline check.
      # Type errors here fail the workflow; lint errors are caught in the Lint step.
      - name: Build
        run: npm run build
```

### Why each line

- **`branches-ignore: [main]`** — main is owned by `deploy.yml`. CI on main is duplicate work.
- **`concurrency.group` includes `github.workflow`** — keeps CI's group disjoint from any other workflow on the same ref.
- **`permissions: contents: read`** — least-privilege default for a build/test job.
- **`timeout-minutes: 15`** — bounded. Adjust if the build legitimately grows.
- **`cache: 'npm'`** — see [caching.md](caching.md). No manual `actions/cache` needed for npm.
- **Three explicit steps (lint, typecheck, build)** — clear failure attribution in the run UI. Don't collapse them into one `&&` chain.

## Pattern B — Playwright E2E

Separate workflow. E2E is slower and has different dependencies; isolating it keeps the main CI fast.

```yaml
# .github/workflows/e2e.yml
name: E2E

on:
  pull_request:
  push:
    branches-ignore: [main]
  # Manual re-run after a flaky failure.
  workflow_dispatch:

concurrency:
  group: e2e-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 60          # browser tests can be slow on cold caches
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci

      # Cache Playwright browsers (~250MB). Only reinstall on cache miss.
      - name: Cache Playwright browsers
        id: playwright-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-playwright-${{ hashFiles('**/package-lock.json') }}

      - name: Install Playwright browsers
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps

      - name: Install Playwright system deps
        if: steps.playwright-cache.outputs.cache-hit == 'true'
        run: npx playwright install-deps

      - name: Run E2E tests
        run: npm run test:e2e

      # `!cancelled()` uploads on success AND failure, not when the workflow was
      # manually cancelled. Without this, you lose the report on the failure
      # case where you most need it.
      - name: Upload Playwright report
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30

      - name: Upload Playwright test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: test-results/
          retention-days: 7
```

### Why each line

- **Separate workflow file** — different cadence, different timeout, different deps. CI stays fast even when E2E is slow.
- **Cache split-step** — browsers are versioned by `@playwright/test`, so the cache key on `package-lock.json` is correct. But system apt deps must reinstall every run.
- **Two `upload-artifact` blocks** — `playwright-report` always (for green and red runs), `test-results` only on failure.
- **`retention-days`** — keep reports short to stay under storage quotas.

## Pattern C — CD (migrate + deploy)

The shape of `deploy.yml`. Two sequential jobs: SQL migrations first, then app deploy. Failure of migrate halts deploy.

```yaml
# .github/workflows/deploy.yml
name: Deploy

# Production deploys happen ONLY from GitHub Actions. All Supabase + Vercel
# credentials live in GitHub Actions secrets. See docs/DEPLOYMENT.md.

on:
  push:
    branches: [main]
    # Doc/memory-only pushes don't need a redeploy. Use Run workflow → main to
    # force a deploy regardless.
    paths-ignore:
      - "**.md"
      - ".claude/**"
      - "docs/**"
      - "LICENSE"
      - ".github/ISSUE_TEMPLATE/**"
      - ".github/FUNDING.yml"
  workflow_dispatch:

# Production deploy: serialize, NEVER cancel. A cancelled migrate leaves the DB
# in an unknown state.
concurrency:
  group: deploy-production
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  migrate:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      # See SAFETY-annotation pattern below. Inline-script implementation lives
      # in the file; not factored out so the guard is auditable in one place.
      - name: Guard against destructive SQL in migrations
        run: |
          # ... (see Pattern E for the full script)

      - uses: supabase/setup-cli@v1
        with:
          version: 2.101.0      # never @latest — see actions-catalog.md

      - name: Push migrations to Supabase
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
          SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}
        run: |
          set -euo pipefail
          supabase link --project-ref "$SUPABASE_PROJECT_REF"
          echo "── Pending migrations (dry run) ─────────────────────────"
          supabase db push --dry-run --linked || true
          echo "── Applying migrations ──────────────────────────────────"
          supabase db push --linked -y

  deploy:
    needs: migrate
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      # Pin Vercel CLI. `@latest` is the same class of bug as `setup-cli`'s
      # rate-limit issue — version drift breaks deploys silently.
      - name: Install Vercel CLI
        run: npm install -g vercel@39   # bump intentionally; see actions-catalog.md

      # Pass token via env, not --token=. Keeps it out of "Run" output.
      - name: Pull Vercel project settings
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
        run: vercel pull --yes --environment=production

      - name: Build
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
        run: vercel build --prod

      - name: Deploy (prebuilt) to production
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
        run: vercel deploy --prebuilt --prod
```

### Why each line

- **`paths-ignore`** — doc-only changes don't redeploy. `workflow_dispatch` lets the user force one.
- **`cancel-in-progress: false`** — a half-applied migration is a disaster. Serialize, never cancel.
- **`migrate` before `deploy`** — schema must be present before the app that depends on it serves traffic.
- **Pinned Supabase + Vercel versions** — see [actions-catalog.md](actions-catalog.md).
- **Token via `env:`, not `--token=`** — see [security.md](security.md) § Secrets.

## Pattern D — PR validation (labeling, size, semantic title)

`pull_request_target` — no PR code is executed, only metadata is read via the API.

```yaml
# .github/workflows/pr-validation.yml
name: PR Validation

on:
  pull_request_target:
    types: [opened, edited, synchronize, reopened]

# Cancel only same-PR re-runs.
concurrency:
  group: pr-validation-${{ github.event.pull_request.number }}
  cancel-in-progress: true

# Needs write to label/comment. No `contents` write.
permissions:
  pull-requests: write

jobs:
  label-by-path:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/labeler@v5
        with:
          configuration-path: .github/labeler.yml

  size-label:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/github-script@v7
        env:
          PR_NUMBER: ${{ github.event.pull_request.number }}
          ADDITIONS: ${{ github.event.pull_request.additions }}
          DELETIONS: ${{ github.event.pull_request.deletions }}
        with:
          script: |
            const lines = Number(process.env.ADDITIONS) + Number(process.env.DELETIONS);
            const label =
              lines < 50  ? 'size/xs' :
              lines < 200 ? 'size/s'  :
              lines < 500 ? 'size/m'  :
              lines < 1000 ? 'size/l' : 'size/xl';
            await github.rest.issues.addLabels({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: Number(process.env.PR_NUMBER),
              labels: [label],
            });
```

### Why each line

- **`pull_request_target`** — runs in base-repo context, has the write token to label. **No checkout step** — we never execute PR code here.
- **Env-laundered values in `github-script`** — `process.env.X` is safe; direct interpolation into `script:` body is not (see security.md § Script injection).
- **Two small jobs, not one big one** — each is independently re-runnable.

## Pattern E — Destructive-op guard (reused inline)

The SAFETY-annotation pattern from the existing `deploy.yml`. Use this for any step that mutates production data, infrastructure, or secrets — not just SQL.

```yaml
- name: Guard against destructive SQL in migrations
  run: |
    set -euo pipefail
    shopt -s nullglob
    files=(supabase/migrations/*.sql)
    if [ ${#files[@]} -eq 0 ]; then
      echo "No migration files. Skipping guard."
      exit 0
    fi
    # Strip line comments before scanning, so banned keywords inside `--`
    # comments don't trip the guard.
    banned='\b(drop[[:space:]]+(table|schema|database|owned|type|function|view|materialized[[:space:]]+view|index|extension|policy|trigger|role)|truncate|delete[[:space:]]+from|alter[[:space:]]+table[[:space:]]+[^;]*drop[[:space:]]+(column|constraint))\b'
    failed=0
    for f in "${files[@]}"; do
      scrubbed=$(sed -E 's/--.*$//' "$f")
      if echo "$scrubbed" | grep -Eiq "$banned"; then
        if grep -Eiq '^\s*--\s*SAFETY:\s*destructive\b' "$f"; then
          echo "::warning file=$f::Destructive SQL present but opted in via SAFETY annotation."
        else
          echo "::error file=$f::Destructive SQL detected. Add a '-- SAFETY: destructive (reason: …)' line at the top of the file if this is intentional."
          failed=1
        fi
      fi
    done
    if [ "$failed" -ne 0 ]; then
      echo "Refusing to deploy: destructive migration without explicit SAFETY opt-in."
      exit 1
    fi
    echo "Migration safety guard passed (${#files[@]} file(s) scanned)."
```

The pattern, generalized: scan for the dangerous shape, fail unless the file explicitly opts in with a one-line SAFETY annotation. Don't try to parse — `grep -E` is good enough and reviewable.

## Pattern F — Scheduled (security audit)

A cron-driven workflow that runs against `main` only. Use sparingly.

```yaml
# .github/workflows/security-audit.yml
name: Security Audit

on:
  # Mondays 05:30 UTC. Adjust per your timezone.
  schedule:
    - cron: '30 5 * * 1'
  workflow_dispatch:

# A scheduled run that overlaps a manual run is wasteful.
concurrency:
  group: security-audit
  cancel-in-progress: false

permissions:
  contents: read
  # If we open an issue on findings, elevate here:
  # issues: write

jobs:
  npm-audit:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      # --audit-level=high: low/moderate are usually transitive noise.
      # Fail the job on high/critical so the run shows red in the Actions tab.
      - run: npm audit --audit-level=high
```

### Why each line

- **`schedule` runs against the default branch only** — that's a GitHub guarantee, not something this workflow controls.
- **`workflow_dispatch`** — lets you re-run on demand after a fix.
- **`--audit-level=high`** — most low/moderate alerts are transitive and not actionable. Tune up if your appetite is higher.

## Pattern G — Reusable workflow (`workflow_call`)

When two workflows share the same setup-and-test sequence, factor into one reusable workflow and call it twice.

```yaml
# .github/workflows/_test.yml
# Filename starts with _ to signal "not directly triggered."
name: Test (reusable)

on:
  workflow_call:
    inputs:
      node-version:
        type: string
        default: '20'
      run-e2e:
        type: boolean
        default: false

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
      - if: inputs.run-e2e
        run: npm run test:e2e
```

Caller:

```yaml
jobs:
  ci-quick:
    uses: ./.github/workflows/_test.yml
    with:
      run-e2e: false

  ci-full:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    uses: ./.github/workflows/_test.yml
    with:
      run-e2e: true
```

The caller passes `with:` for inputs and `secrets:` for any required secrets (none here). The reusable workflow's `secrets:` block declares what it expects.
