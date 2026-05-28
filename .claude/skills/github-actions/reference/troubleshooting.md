# Troubleshooting — common pipeline failures and the fix

When a workflow fails or warns, find the symptom below and apply the cited fix. Add new entries here whenever this repo pays for a new one.

## How to read this file

Each entry is structured:

> **Symptom** — what you see in the log.
> **Root cause** — what's actually broken.
> **Fix** — exact change.
> **Why this happens** — a sentence so you don't paper over it later.

## Pipeline-level failures

### `Error: Resource not accessible by integration`
**Root cause:** The job's `GITHUB_TOKEN` doesn't have the permission the step needs.
**Fix:** Add the missing permission at the job (or workflow) level. E.g., commenting on a PR needs `pull-requests: write`.
```yaml
permissions:
  contents: read
  pull-requests: write   # the line that fixes it
```
**Why:** Per-job permissions default to whatever the workflow declares (or repo default, which is now read-only for new repos). Anything that mutates GitHub state needs explicit elevation. See [security.md § Permissions](security.md).

### `The workflow is not valid. .github/workflows/<file>.yml (Line: N, Col: M)`
**Root cause:** YAML syntax error or invalid key. Often a tab vs spaces issue or a misplaced `:`.
**Fix:** Open the file at the cited line. Check indentation (YAML is space-sensitive, 2 spaces per level in this repo). Validate with `gh workflow view <name>` after the fix.
**Why:** GitHub parses workflows before running them. Validation happens on every push.

### `Error: Process completed with exit code 1.` (no other detail)
**Root cause:** The previous step printed nothing useful before exiting. Common when a bash script uses `set -e` and a quiet command fails.
**Fix:** Add `set -euo pipefail` to the script's first line. Echo the command(s) being run.
```yaml
- run: |
    set -euo pipefail
    echo "== Step: install =="
    npm ci
    echo "== Step: build =="
    npm run build
```
**Why:** Without `pipefail`, a failure in the middle of a pipe is masked. Echoes give failure attribution.

### `Error: Cannot find module 'X'` after `npm ci`
**Root cause:** `package-lock.json` is out of date, or `npm ci` cache was poisoned by a previous run.
**Fix:** First, `npm install` locally, commit the updated lockfile, re-push. If that doesn't help, bust the cache by bumping the cache key (see [caching.md § Cache invalidation](caching.md)).
**Why:** `npm ci` fails if lockfile is missing a dep that `package.json` requires; doesn't fail if it has extras. Drift sneaks in via local `npm install` without lockfile commit.

### `Error: Container action is only supported on Linux`
**Root cause:** The step `uses:` a Docker-container action while the job is on `windows-latest` or `macos-latest`.
**Fix:** Either move the job to `ubuntu-latest`, or replace the action with a JavaScript/composite equivalent.
**Why:** Container actions run in Docker; only Linux runners have Docker.

## Action-version failures

### `Error: The action '...' was not found.`
**Root cause:** Tag was deleted/repointed, or you typo'd the action name.
**Fix:** Look up the latest tag with `gh api repos/<owner>/<repo>/releases/latest --jq .tag_name`. Pin to that.
**Why:** Tags are mutable. SHA pinning (per [security.md § Pinning](security.md)) avoids this.

### `Warning: The 'set-output' command is deprecated`
**Root cause:** An old action (or your inline script) writes `::set-output name=foo::bar`.
**Fix:** Update the action to a version that uses `$GITHUB_OUTPUT`. For your own scripts:
```bash
# Old:
echo "::set-output name=version::1.2.3"
# New:
echo "version=1.2.3" >> "$GITHUB_OUTPUT"
```
**Why:** GitHub deprecated the workflow-command form. The new form writes to a file via the `$GITHUB_OUTPUT` env var.

### `Warning: Node.js 16 actions are deprecated`
**Root cause:** A third-party action is still on the Node 16 runner.
**Fix:** Update to a newer major version of that action, or replace it. Track via Dependabot.
**Why:** GitHub bumped the runner Node version and is sunsetting Node 16.

### `Error: actions/upload-artifact@v3 has been deprecated`
**Root cause:** Hard EOL on `v3`. Currently fails the workflow.
**Fix:** Update to `actions/upload-artifact@v4`. Note: v4 artifacts are NOT mergeable across jobs — see migration notes if you upload from multiple matrix legs.
**Why:** GitHub retired v3 to push v4 adoption.

## Caching failures

### `Cache miss every run despite no source changes`
**Root cause:** The cache key includes a dynamic value (e.g., `github.run_id`, `github.sha`).
**Fix:** Inspect the key. It should only reference stable inputs — `runner.os`, `hashFiles('package-lock.json')`, etc. Replace any per-run value.
**Why:** Cache key is "what determines this cache." Per-run values mean "never the same twice."

### `Cache hit but build still says "no cache detected"` (Next.js)
**Root cause:** You cached `.next` instead of `.next/cache`. Next.js writes build output to `.next/` and looks for the cache subfolder specifically.
**Fix:** Use the exact path from [caching.md § Next.js](caching.md): `${{ github.workspace }}/.next/cache`. Not `.next/`.
**Why:** Next.js's build cache is one subfolder. The rest of `.next/` is regenerated.

### `Error: Cache service responded with 429` (rate-limit)
**Root cause:** Repo hit the cache API rate limit. Rare; usually means a runaway matrix.
**Fix:** Reduce matrix size, or coalesce caches across jobs.
**Why:** GitHub rate-limits cache writes per-repo.

## Application code failures (the real fix)

This skill's job is to fix the **code** that makes a pipeline fail, not just the YAML around it. The cases below come up often.

### `Type error: ...` in `next build`
**Root cause:** A TypeScript error somewhere. The CLAUDE.md rule is: don't relax tsconfig to make this go away. Fix the type.
**Fix:** Run `npm run typecheck` locally. Read the error. Fix the actual issue — narrow the type, add the missing field, update the call site. Don't add `// @ts-expect-error` unless there's a real reason.
**Why:** Type errors are usually real bugs. The Windows-build memo explicitly says: "TypeScript errors still fail the build (keep types sound)."

### `ESLint: Parsing error: ...`
**Root cause:** A syntax issue or a rule the file genuinely violates.
**Fix:** Run `npm run lint -- --fix` locally for autofixes. For the rest, fix the code. Don't add file-level disables.
**Why:** The repo policy in `CLAUDE.md` is explicit: lint runs as its own CI step. Disabling a rule because CI failed is the wrong direction.

### `Error: Invalid path specified in request URL` from Supabase
**Root cause:** `SUPABASE_URL` got `/rest/v1` appended (the user already paid for this one). `src/lib/supabase.ts` normalizes it.
**Fix:** If the failure is in CI/CD (rare — neither uses the runtime client), inspect the env block. If it's in Vercel, fix the env var to be the bare project URL. The lib code handles either, but cleanly is better.
**Why:** `supabase-js` appends `/rest/v1` itself.

### `Migration failed: column ... does not exist`
**Root cause:** Either the migration depends on another that wasn't applied, or a destructive change snuck in without the SAFETY annotation.
**Fix:** Check `supabase db push --dry-run --linked` output in the migrate job log to see what's pending. If a destructive change is intended, add `-- SAFETY: destructive (reason: <one line>)` at the top of the migration file (see [patterns.md § Pattern E](patterns.md)).
**Why:** The guard refuses destructive ops without explicit opt-in. This is intentional.

### `Vercel deploy: No Output Directory named "public"`
**Root cause:** Vercel's framework preset isn't set to Next.js.
**Fix:** Verify `vercel.json` contains `{ "framework": "nextjs" }`. The user paid for this one during the first deploy.
**Why:** Without the preset, Vercel falls back to static-site assumptions and looks for `public/`.

### `Playwright: browserType.launch: Executable doesn't exist`
**Root cause:** Playwright browsers weren't installed in the runner, or were installed without the matching version.
**Fix:** Add `npx playwright install --with-deps` before the test step. See [patterns.md § Pattern B](patterns.md) for the cached version.
**Why:** Playwright's browsers are versioned and downloaded on demand. CI runners are ephemeral.

## Deploy-specific failures

### `migrate` job fails on `supabase link`
**Root cause:** `SUPABASE_PROJECT_REF` is wrong, or the access token doesn't have permission on that project.
**Fix:** Confirm the secret value in **Repo Settings → Secrets → Actions**. The ref is the short project ID (currently `wbqsoygunqyxviplgakx`), not a URL.
**Why:** `supabase link` validates the ref + token combination.

### `migrate` job fails on `supabase db push` with `password authentication failed`
**Root cause:** `SUPABASE_DB_PASSWORD` is stale or wrong.
**Fix:** Reset it from the Supabase dashboard (Project Settings → Database → Connection string). Update the GitHub secret.
**Why:** The DB password is separate from the access token.

### `deploy` job fails with `Error: No team found by name "..."`
**Root cause:** `VERCEL_ORG_ID` is the human-readable team slug, not the team ID.
**Fix:** Get the proper ID from `vercel teams ls --token=...` locally or from the Vercel dashboard URL.
**Why:** Vercel CLI wants the internal ID, not the URL slug.

### `vercel build` fails: `Environment Variable "X" references Secret "Y", which does not exist`
**Root cause:** A reference in `vercel.json` or the Vercel dashboard points at a secret that was deleted/renamed.
**Fix:** Sync the Vercel project env vars with what the codebase reads. Currently this repo needs only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
**Why:** Vercel build pulls env vars at build time. A dangling reference fails.

## Pipeline warnings (not failures, but should be fixed)

### `Warning: Job '...' has no timeout-minutes`
**Root cause:** Missing `timeout-minutes:`.
**Fix:** Add one per [SKILL.md § Non-negotiables](../SKILL.md). 15 for CI, 30 for build-heavy, 60 for E2E.

### `Warning: ${{ ... }} in a 'run' step may be a script-injection risk`
**Root cause:** A `${{ github.event.* }}` (or similar) is interpolated directly into a `run:` block.
**Fix:** Pass through `env:`, reference as `$VAR`. See [security.md § Script injection](security.md).

### `Warning: 'pull_request_target' workflow checks out PR head`
**Root cause:** A `pull_request_target` workflow does `actions/checkout` with the PR head — privilege escalation risk.
**Fix:** Either change the trigger to `pull_request`, or remove the checkout step entirely. See [security.md § pull_request_target](security.md).

### `Warning: Action '...' uses a deprecated runner image`
**Root cause:** Third-party action is on an old base image (e.g., `ubuntu-18.04`).
**Fix:** Update to a newer version of the action.

### `Warning: This workflow uses a 'latest' tag for action 'X'`
**Root cause:** `uses: someorg/action@latest` or `@main`.
**Fix:** Pin per [security.md § Pinning](security.md) and [actions-catalog.md](actions-catalog.md).

## When the error isn't in this file

1. Capture the exact error string and the workflow run URL.
2. Search GitHub issues for the action involved.
3. If you find a fix, **add it to this file** with the symptom/root-cause/fix structure above. Future-you will thank you.
