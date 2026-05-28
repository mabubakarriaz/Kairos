---
name: github-actions
description: "Use when the user wants to create, modify, audit, harden, debug, or fix any GitHub Actions pipeline in this repo — CI, CD, PR validation, scheduled jobs, reusable workflows, or composite actions. Covers writing new workflows under .github/workflows/, fixing pipeline warnings (deprecated actions, missing permissions, unpinned versions, untrusted input interpolation, missing concurrency/timeouts), tuning caching and matrices, wiring secrets and OIDC, and patching the application code or scripts that show up as failures or warnings in pipeline logs. Trigger phrases include: 'CI', 'CD', 'pipeline', 'workflow', 'GitHub Actions', 'deploy.yml', 'ci.yml', 'pull_request', 'workflow_dispatch', 'dependabot', 'pin actions', 'add tests to CI', 'fix the deploy', 'why did the workflow fail'. Not for non-GitHub CI systems (CircleCI/GitLab/Travis) — for those, only consult the reference patterns as cross-CI documentation, do not migrate."
argument-hint: "[audit|new|fix|harden|review] [target]"
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - WebFetch
---

Designs, audits, and repairs the GitHub Actions pipelines that protect this repo's quality and ship it to production. Real working YAML, pinned versions, least-privilege permissions, no copy-paste cruft.

This skill is the single source of truth for everything under `.github/workflows/` in Kairos. When the user mentions CI, CD, pipelines, workflows, or names a specific file in `.github/workflows/`, load this skill.

## What this skill is for

Four jobs, in priority order:

1. **Audit** the current pipelines for warnings, gaps, and security smells. The default action when the user says "review the pipelines" or "fix the warnings." See `reference/checklists.md`.
2. **Fix** specific failures or warnings — broken steps, deprecated actions, missing permissions, unpinned versions, flaky caches. This includes fixing **the underlying code or script** that the pipeline is complaining about, not just the YAML around it.
3. **Create** new workflows — a tests job, a scheduled security scan, a release pipeline, a reusable workflow. Use `reference/patterns.md` as the template library.
4. **Harden** an existing workflow — add permissions, concurrency, timeouts, pinning, OIDC, environment protection. See `reference/security.md`.

## Setup — every invocation

Before writing or editing any YAML:

1. **Read what's already there.** Always list and read every file under `.github/workflows/` first. Never write a new workflow without knowing what the existing ones do — they share concurrency groups, env vars, and naming conventions.

   ```bash
   ls .github/workflows/
   ```

   Read each `.yml` end-to-end. Don't skim. The current pipelines are short.

2. **Load the project context.** Read `reference/project-context.md` once per session. It is the canonical record of:
   - The stack (Next.js + React 19 + TypeScript + Tailwind + Supabase + Vercel)
   - The deploy mechanism (`migrate` then `deploy` in `deploy.yml`, GitHub Actions is the sole deployer)
   - The secrets that exist in this repo's settings
   - The gotchas the user already paid for (Vercel framework preset, Supabase URL normalization, `setup-cli` rate limit, `.next/trace` Windows lock)

   If the answer to a question is in there, don't re-derive it from a fresh codebase read.

3. **Identify the sub-task.** Match the user's request to one of: `audit`, `new`, `fix`, `harden`, `review` (alias for audit). If they didn't specify, infer from the verb — "review", "look at", "audit" → audit; "add", "create", "wire up" → new; "fix", "broken", "failing" → fix; "secure", "lock down", "pin" → harden.

4. **Load the matching reference.** For every sub-task, `reference/checklists.md` is mandatory — it is the quality gate the work is measured against. Then pull in the others as needed.

Skipping the existing-workflow read produces output that duplicates triggers, breaks concurrency groups, or contradicts the project's deploy model.

## The reference library

Read these as you need them. Don't pre-load all of them — they're for lookup, not memorization.

- [reference/syntax.md](reference/syntax.md) — workflow YAML keys (`on`, `jobs`, `steps`, `permissions`, `concurrency`, `timeout-minutes`, `defaults`, `env`, `runs-on`, `if`, `needs`, `outputs`, `strategy`) and trigger events (`push`, `pull_request`, `pull_request_target`, `workflow_dispatch`, `workflow_call`, `schedule`, `release`) with gotchas.
- [reference/security.md](reference/security.md) — the non-negotiables: pinning to SHA, least-privilege `permissions:`, script-injection prevention via `env:` indirection, `pull_request_target` rules, secret hygiene, OIDC over long-lived secrets.
- [reference/caching.md](reference/caching.md) — `setup-node` built-in cache, `actions/cache@v4` with key + restore-keys, the Next.js `.next/cache` pattern (verbatim from Next.js docs), Playwright browser cache (`~/.cache/ms-playwright`).
- [reference/actions-catalog.md](reference/actions-catalog.md) — the canonical pinned versions of every action this repo should use (checkout, setup-node, cache, upload-artifact, supabase/setup-cli, etc.). Includes the SHA-pin shape vs major-tag shape and when each is acceptable.
- [reference/patterns.md](reference/patterns.md) — copy-paste-able full-file templates for: CI (lint/typecheck/build/test), CD (migrate + deploy, the current shape), PR checks (size/label, semantic title, comment-only), E2E (Playwright with artifacts), scheduled (security audit), and reusable workflow (`workflow_call`). Each template is annotated with **why** each line is there.
- [reference/project-context.md](reference/project-context.md) — Kairos-specific facts: what the existing workflows do, what secrets exist, the Vercel/Supabase deploy contract, what NOT to add back (Docker, OTel, MCP — see `stack-migration-2026-05-27.md`).
- [reference/troubleshooting.md](reference/troubleshooting.md) — common pipeline errors → root cause → fix. Updated whenever a new pitfall is paid for.
- [reference/checklists.md](reference/checklists.md) — the audit checklist. Every pipeline this skill writes or touches must pass it. Run it explicitly on each YAML file before reporting done.

## The non-negotiables (encoded as code review)

These come up in every audit. Memorize them; don't ship a workflow without them:

1. **Pin every third-party action.** `uses: third-party/action@<full-40-char-SHA> # vX.Y.Z` for anything outside `actions/*`, `github/*`, and `supabase/*`. First-party Actions orgs may use `@v4` major-tag pinning. Never use `@main` or `@latest`. See `reference/security.md` § Pinning.

2. **Set `permissions:` at the workflow level, default to read-only.** Then elevate per-job only where needed. A workflow with no `permissions:` block inherits the repo default — for public repos this is often more than the job needs.

   ```yaml
   permissions:
     contents: read
   ```

3. **Set `timeout-minutes:` on every job.** Default to 15 for CI jobs, 30 for build-heavy jobs, 60 for E2E. A runaway job costs minutes you can't get back.

4. **Set `concurrency:` on every workflow.** CI: cancel-in-progress per ref. Production deploy: serialize, do not cancel. See `reference/syntax.md` § Concurrency.

5. **Never interpolate untrusted context into a `run:` block.** Anything from `github.event.*`, `github.head_ref`, PR titles/bodies — pass through `env:` first, reference as `$VAR`. See `reference/security.md` § Script injection.

6. **Pin the Node version.** `node-version: 20` matches `package.json`'s `engines.node: ">=20.9.0"`. Don't drift.

7. **`npm ci` not `npm install` in CI.** `ci` respects the lockfile and fails on drift; `install` mutates it.

8. **Cache aggressively, invalidate correctly.** `actions/setup-node@v4` with `cache: 'npm'` is the floor. For Next.js, layer `.next/cache` with a key that includes both `package-lock.json` hash and a source-file hash so source-only edits get a partial restore.

9. **Don't gate the build on lint, but DO run lint.** The repo policy in `CLAUDE.md` is explicit: `next.config.ts` sets `eslint.ignoreDuringBuilds`. Lint is a separate CI step that can fail the workflow; the build itself doesn't depend on it.

10. **Validate destructive ops behind a guard.** The existing `deploy.yml` already does this for SQL migrations. Any new destructive workflow step needs the same pattern: scan, then refuse unless explicitly opted in.

`reference/checklists.md` operationalizes all ten into a Y/N audit list. Run it on every file before reporting done.

## Sub-task playbooks

### `audit` / `review` — the default

Run this whenever the user asks to "review", "audit", "look at", or "check" the pipelines.

1. List every file under `.github/workflows/`. Read each one end-to-end.
2. For each file, walk the checklist in `reference/checklists.md`. Mark every item Y / N / N/A with a one-line reason.
3. Group findings into three buckets:
   - **Must-fix** — security holes (missing `permissions:`, script injection, unpinned third-party actions) or correctness bugs (wrong `needs:`, broken cache key, no `npm ci`).
   - **Should-fix** — quality smells (no `timeout-minutes:`, no `concurrency:`, missing `npm-audit`, `vercel@latest` instead of pinned).
   - **Nit** — style and consistency (job name casing, step naming, comment hygiene).
4. Report as a table, file by file. Don't fix anything yet — give the user the punch list and ask which buckets to apply. Default offer: "Apply must-fix + should-fix?"

### `new` — creating a workflow

Don't write the YAML first. Decide these in order, then write:

1. **What triggers it?** (`push` to `main`? `pull_request`? `schedule`? `workflow_dispatch`?) Document in a comment at the top of the file.
2. **What is the smallest set of jobs?** Each job is one runner-VM. Don't split jobs unless they parallelize or have different `needs:` shapes.
3. **What permissions does each job actually need?** Default `contents: read`. Add per-job elevation with a one-line comment explaining why.
4. **What's the concurrency rule?** CI: `cancel-in-progress: true` on `${{ github.workflow }}-${{ github.ref }}`. Deploy: serialize on a fixed group, `cancel-in-progress: false`.
5. **What's the timeout?** Look at the slowest expected run, double it, round up to a multiple of 5.
6. **What gets cached?** Always npm via `setup-node`. Sometimes `.next/cache`. Sometimes Playwright browsers.

Then pull the closest template from `reference/patterns.md` and adapt it. Don't write from scratch.

### `fix` — repairing a broken or warning pipeline

When the user says "the deploy is failing" or "I keep seeing this warning":

1. **Get the actual error.** Ask for the workflow run URL or paste of the log. Don't guess. If they don't have it, run `gh run list --workflow=<name> --limit 5` and `gh run view <id> --log-failed` to fetch it.
2. **Match the error to `reference/troubleshooting.md`.** That file is the index of paid-for failures. If the error isn't there, add it once fixed.
3. **Fix the root cause, not the symptom.** "The migration step fails on `latest`" → pin the version, don't catch-and-ignore. "Build fails because of a type error" → fix the type, don't relax tsconfig. The user's project memory in `build-vs-typecheck-windows.md` is the model: diagnose, kill, fix, move on — don't paper over.
4. **If the failure is in the application code** (a test, a type error, a lint rule that turns out to be right) — fix the code. That is in-scope for this skill. The pipeline is the symptom; the code is the disease.
5. **After the fix, harden against recurrence.** If a `@latest` slipped in, audit the rest of the file for other `@latest`s. If a permission was missing, audit `permissions:` across all workflows. One bug usually means a pattern.

### `harden` — locking down an existing workflow

Run the checklist in `reference/checklists.md` against the target file. Apply every item that's currently N where the fix is mechanical (add `permissions:`, add `timeout-minutes:`, replace `@latest` with a pinned tag, replace tag with SHA for third-party). Anything that requires a judgment call (e.g., switching from long-lived secrets to OIDC) — propose it, don't apply silently.

## How this skill writes code

- **Workflow YAML lives in `.github/workflows/`.** One file per logical pipeline. Reusable bits go in `.github/workflows/_reusable-*.yml` and are invoked with `workflow_call`. Composite actions live in `.github/actions/<name>/action.yml`.
- **Every workflow file starts with a 3–5 line top-of-file comment** explaining what the workflow does, what triggers it, and what secrets it needs. The existing `ci.yml` and `deploy.yml` already follow this — match the style.
- **Comment **why**, not what.** `# Pin to 2.101.0: @latest rate-limits on frequent runs` is useful. `# Install supabase CLI` is noise.
- **Stay scoped.** A request to fix `ci.yml` should not refactor `deploy.yml` unless the same root cause is in both. Mention the parallel issue in the report instead of fixing it.
- **Never commit secrets.** This repo is public. Anything that looks like a real token, password, or URL with credentials gets rejected at the edit. Use `${{ secrets.NAME }}` referencing GitHub Actions secrets only.
- **Don't reintroduce dropped infrastructure.** Per `stack-migration-2026-05-27.md`, the user removed .NET / Aspire / Docker Compose / OTel / MCP / Google Calendar sync. Workflows that build, test, or deploy any of those are out of scope. Confirm before writing one.

## Reporting

After any non-trivial change, report exactly three things:

1. **What changed** — file paths and a one-line summary per file.
2. **What the checklist says now** — pass / fail summary by file. If anything is still N, say why (deferred, requires user decision, etc.).
3. **What's next** — the most valuable thing the user could do next (e.g., "Add the Playwright job once the test suite stabilizes," "Migrate the Vercel auth to OIDC when the token's next due to rotate").

Keep it short. The user can read the diff.

## When to ask, when to act

In auto mode, default to acting on a clearly-scoped request:
- "Audit the pipelines" → just audit and report. No questions.
- "Fix the deploy warnings" → fix the must-fix and should-fix, skip nits, report.
- "Add a tests job to CI" → add it using `reference/patterns.md`, integrate with the existing CI shape.

Ask when:
- The user names a change with a real trade-off (e.g., "migrate Vercel auth to OIDC" — has setup cost the user may not want now).
- The fix requires touching a secret (rotating, renaming, splitting).
- The change would reintroduce dropped infrastructure (see above).
- The fix is in application code that's outside the immediate failing path.

Otherwise: make the call, do the work, report.
