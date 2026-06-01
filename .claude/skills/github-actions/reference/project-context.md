# Project context — Kairos pipelines today

What's in `.github/workflows/` right now, what the secrets are, and what the stack constraints mean for any change. Read this once per session before touching a workflow.

Cross-references the in-repo memory files:
- [CLAUDE.md](../../../../CLAUDE.md) — repo-wide guidance
- [.claude/memory/deployment-live.md](../../../memory/deployment-live.md) — live deploy facts
- [.claude/memory/stack-migration-2026-05-27.md](../../../memory/stack-migration-2026-05-27.md) — what was dropped, do not reintroduce
- [.claude/memory/build-vs-typecheck-windows.md](../../../memory/build-vs-typecheck-windows.md) — local-build hygiene

## The stack the pipelines support

- **Next.js (App Router) + React 19 + TypeScript** — UI and Server Actions in one Next.js app.
- **Tailwind CSS v3** — design tokens in `src/app/globals.css`.
- **Supabase (Postgres)** — schema is checked into `supabase/migrations/`. CI doesn't talk to the DB; CD applies migrations via `supabase db push`.
- **Vercel** — production hosting, single project, `vercel build` + `vercel deploy --prebuilt --prod`.
- **Minimal infra; a single-password gate.** A single-password login (`APP_PASSWORD` + `AUTH_SECRET`) fronts the app at runtime, but there's still no Docker Compose, no .NET, no OTel, no MCP, no Google Calendar sync. **Do not reintroduce those via pipelines.** See `stack-migration-2026-05-27.md` for the full do-not-touch list.

`next build` does not prerender `/` (`export const dynamic = "force-dynamic"`), so CI builds **do not require any env vars**. The Supabase client is created lazily via `getSupabase()` and only triggers on a runtime request, never at build time.

## Current workflows

### `.github/workflows/ci.yml` — Quality gate

**Triggers:** `pull_request`, `push` to any branch except `main`.

**Shape:** single job, ubuntu-latest, four steps: checkout → setup-node@v4 (`cache: 'npm'`) → `npm ci` → `npm run lint` → `npm run build` (which type-checks the whole app).

**Known gaps (as of this catalog write):**
- No `permissions:` block → inherits repo default.
- No `concurrency:` → stale runs aren't cancelled.
- No `timeout-minutes:` → unbounded.
- Doesn't run tests (`tests/tz-craft.spec.ts` is a Playwright spec; `test:e2e` script exists in `package.json` but isn't wired into CI).
- Doesn't run `npm run typecheck` separately. `next build` does typecheck, but a dedicated step gives clearer failure attribution.

### `.github/workflows/deploy.yml` — Production deploy

**Triggers:** `push` to `main` (with `paths-ignore` for docs/`.claude/`/`docs/`/`LICENSE`/issue templates), and `workflow_dispatch`.

**Shape:** two jobs.
1. **`migrate`** — applies Supabase migrations. Guards against destructive SQL via a bash scanner that fails the build unless the file opts in with a `-- SAFETY: destructive (reason: …)` annotation. Uses `supabase/setup-cli@v1` pinned to `version: 2.101.0` (the `@latest` rate-limit gotcha was paid for during the first deploy).
2. **`deploy`** — `needs: migrate`. Pulls Vercel project settings, builds, and deploys with `vercel deploy --prebuilt --prod`.

**Concurrency:** `deploy-production`, `cancel-in-progress: false` — correct.

**Known gaps:**
- No top-level `permissions:` block.
- No `timeout-minutes:` on either job.
- `npm install -g vercel@latest` — the same drift/rate-limit class of bug as `supabase/setup-cli@latest` had. Should pin.
- Vercel token passed as `--token="${{ secrets.VERCEL_TOKEN }}"` on the command line. Should pass via `env: VERCEL_TOKEN` so it doesn't appear in the "Run" line of the log (it's still masked, but env-passing is the documented pattern).

### `.github/dependabot.yml`

Two ecosystems: `npm` (weekly, max 5 open PRs) and `github-actions` (weekly). Correct shape. Don't disable.

## Secrets the deploy depends on

All set in **Repo settings → Secrets and variables → Actions** (not in `.env`, never committed):

| Secret                   | Owner   | Used by             | Notes                                                  |
| ------------------------ | ------- | ------------------- | ------------------------------------------------------ |
| `SUPABASE_ACCESS_TOKEN`  | User    | `migrate` job       | Personal access token from Supabase dashboard.         |
| `SUPABASE_DB_PASSWORD`   | User    | `migrate` job       | The project's database password.                       |
| `SUPABASE_PROJECT_REF`   | User    | `migrate` job       | Currently `wbqsoygunqyxviplgakx`.                      |
| `VERCEL_TOKEN`           | User    | `deploy` job        | Vercel personal token. Rotate every ~90 days.          |
| `VERCEL_ORG_ID`          | User    | `deploy` job        | Vercel org/team ID. Not strictly secret but kept here. |
| `VERCEL_PROJECT_ID`      | User    | `deploy` job        | Vercel project ID.                                     |

**Runtime secrets** (used by the live app, not by Actions) live in **Vercel** env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The browser never sees these; they're server-only.

## Deploy constraints — non-negotiable

These come from `deployment-live.md` and `CLAUDE.md`:

1. **GitHub Actions is the sole deployer.** Never `vercel deploy` from a developer machine for production. The deploy workflow's behavior — `paths-ignore` for docs, `workflow_dispatch` to force, migrate-before-deploy ordering — is the contract.
2. **Migrations are forward-only and non-destructive by default.** The SQL guard in `deploy.yml` enforces this. Any pipeline change that touches migrations must preserve the guard.
3. **The repo is public.** Never log a secret, never commit one, never write one to a path that gets cached by `actions/cache` or uploaded by `actions/upload-artifact`.
4. **Postgres 14+ is required** (multirange, EXCLUDE/GIST). Supabase is fine. Don't introduce a workflow that targets a different Postgres version.
5. **The `SUPABASE_URL` normalization rule** is in `src/lib/supabase.ts` — strips `/rest/v1` if pasted. If you wire a new workflow that constructs a Supabase URL itself, apply the same normalization.

## What pipelines should NOT do

- **Do not run `vercel pull` / `vercel deploy` in CI** (the quality-gate workflow). CI's job is to fail fast on lint/type/build/test, not to run a full Vercel build. Vercel has its own preview deploy if you wire the GitHub integration — that's separate from this repo's CI.
- **Do not run real Supabase migrations in CI.** The `migrate` job is production-only. A CI dry-run on a hosted shadow DB is possible but out of scope; document the trade-off before adding one.
- **Do not add Docker, Compose, or container-based runners.** Removed deliberately.
- **Do not add OTel, Prometheus, or any observability collector to CI.** Out of scope.
- **Do not add Google Calendar sync or MCP-server jobs.** Deferred deliberately. (Recurrence shipped in-app as fixed presets; it needs no pipeline.)

## What pipelines could do (proposed, not yet built)

These are reasonable additions when there's a concrete need:

- **Playwright E2E job** — `test:e2e` script and `tests/tz-craft.spec.ts` already exist. The job is ready to be wired (see `patterns.md` Pattern B).
- **PR labeling** — auto-label by changed paths (`pattern D`).
- **Weekly security audit** — `npm audit --audit-level=high` on a schedule (`pattern F`).
- **Dependency review** — `actions/dependency-review-action@v4` on PRs that touch `package*.json`. Catches new vulnerable transitives at PR time.
- **`size-label`** — automatic XS/S/M/L/XL labels from PR additions+deletions.

Each of these is opt-in by user request — don't preemptively add them as part of an audit.

## How to verify a pipeline change

After editing any workflow file:

1. **Validate YAML** — `gh workflow view <name>` will reject malformed YAML. Locally, any YAML linter works.
2. **Read the diff with the checklist** ([checklists.md](checklists.md)) — every item still Y?
3. **For CI:** open a draft PR and watch the run. The cost is a few minutes of runner time.
4. **For CD:** use `workflow_dispatch` from the Actions tab to dry-run a deploy after the merge. The migrate `--dry-run` step prints pending migrations without applying.
5. **Roll-back plan:** `git revert <commit>` on `main` triggers another deploy that undoes the change. Migrations don't auto-roll-back — write the down-migration as a forward migration if needed.
