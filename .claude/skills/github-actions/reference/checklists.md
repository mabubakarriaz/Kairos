# Checklists — the audit and pre-merge gates

Two checklists. Run **the audit list** when reviewing existing workflows; run **the pre-merge list** before reporting any pipeline change as done. Both are exhaustive — don't skip items. For each, mark Y / N / N/A with a one-line reason.

## Audit list (run on every existing workflow file)

Use this for `audit` / `review` / `harden` sub-tasks (see [SKILL.md](../SKILL.md)). Walk each file end-to-end and answer all 30 items.

### A. Triggers

| #  | Check                                                                                   | Y/N/N-A |
| -- | --------------------------------------------------------------------------------------- | ------- |
| 1  | `on:` matches the intent (push? PR? both? schedule? dispatch?)                         |         |
| 2  | `paths-ignore` / `paths` filters out the things that shouldn't trigger the workflow    |         |
| 3  | If `pull_request_target`: workflow does NOT check out PR head code                     |         |
| 4  | If production-affecting: `workflow_dispatch` is present so the user can force a rerun |         |

### B. Permissions, secrets, concurrency, time

| #  | Check                                                                              | Y/N/N-A |
| -- | ---------------------------------------------------------------------------------- | ------- |
| 5  | Top-level `permissions:` block exists; defaults to `contents: read`                |         |
| 6  | Each job that needs elevation declares it locally, with a comment on why          |         |
| 7  | `concurrency:` set, with correct group and `cancel-in-progress` value             |         |
| 8  | Every job has `timeout-minutes:` (CI ≤ 15, build ≤ 30, E2E ≤ 60)                  |         |
| 9  | All secrets referenced via `${{ secrets.NAME }}` actually exist in repo settings  |         |
| 10 | No secret is passed as a `--flag=value` shell arg; only via `env:`                |         |

### C. Action and tool versions

| #  | Check                                                                              | Y/N/N-A |
| -- | ---------------------------------------------------------------------------------- | ------- |
| 11 | Every `uses:` for first-party (`actions/*`, `github/*`, `supabase/*`) pinned to a major tag |         |
| 12 | Every `uses:` for third-party pinned to a full 40-char SHA + comment with tag     |         |
| 13 | No `@latest`, `@main`, `@master`, or unversioned references anywhere              |         |
| 14 | Any CLI installed via `npm install -g` is pinned to a specific version            |         |
| 15 | Node version matches `engines.node` in `package.json` (currently 20)              |         |

### D. Script safety

| #  | Check                                                                              | Y/N/N-A |
| -- | ---------------------------------------------------------------------------------- | ------- |
| 16 | No untrusted `${{ github.event.* }}` value interpolated into a `run:` block       |         |
| 17 | Bash scripts start with `set -euo pipefail`                                       |         |
| 18 | Destructive operations (DROP/TRUNCATE/DELETE, force-push, etc.) are guarded      |         |
| 19 | Scripts echo their progress so failures can be attributed                         |         |

### E. Caching and artifacts

| #  | Check                                                                              | Y/N/N-A |
| -- | ---------------------------------------------------------------------------------- | ------- |
| 20 | npm cache enabled via `setup-node`'s `cache: 'npm'` (not manual)                  |         |
| 21 | If Next.js is built: `.next/cache` cached per the official key shape              |         |
| 22 | If Playwright tests run: browsers cached, system deps reinstalled                 |         |
| 23 | Nothing sensitive is cached or uploaded as an artifact                            |         |
| 24 | Artifact `retention-days` set (default 90 is usually too long)                    |         |

### F. Operations

| #  | Check                                                                              | Y/N/N-A |
| -- | ---------------------------------------------------------------------------------- | ------- |
| 25 | Top-of-file comment explains what the workflow does and what triggers it          |         |
| 26 | Step names are present and informative (not just the default `Run npm ci`)        |         |
| 27 | `npm ci` (not `npm install`) for installs                                         |         |
| 28 | Failure attribution is clear — separate steps for lint vs typecheck vs build etc. |         |
| 29 | If the workflow runs on PR from forks: behavior on secret-less context is correct |         |
| 30 | The workflow's purpose is still relevant (no dead workflows lying around)         |         |

### Report format

When reporting an audit, produce a table per file:

```
ci.yml audit:
  A. Triggers              4/4 Y
  B. Perms/concurrency     2/6 Y  (missing: permissions, concurrency, timeout)
  C. Versions              5/5 Y
  D. Script safety         3/3 Y  (no scripts in this file)
  E. Caching               5/5 Y
  F. Operations            5/6 Y  (no tests step yet)
Must-fix: permissions, concurrency, timeout-minutes
Should-fix: add tests step
Nit: none
```

## Pre-merge list (run after writing or editing a workflow)

Use this before reporting any pipeline change as done. Shorter than the audit list — it's the diff-level smell check.

| #  | Check                                                                                 | Y/N |
| -- | ------------------------------------------------------------------------------------- | --- |
| 1  | YAML parses (`gh workflow view <name>` doesn't error, or local linter is clean)       |     |
| 2  | All new `uses:` are pinned per [actions-catalog.md](actions-catalog.md)              |     |
| 3  | No new `${{ github.event.* }}` interpolation in `run:` (use `env:`)                  |     |
| 4  | New `permissions:` (if any) are least-privilege                                       |     |
| 5  | New `concurrency:` (if any) has correct `cancel-in-progress` value                    |     |
| 6  | `timeout-minutes:` set on every new/edited job                                        |     |
| 7  | New secrets referenced exist in repo settings (or are documented as required)         |     |
| 8  | Run logs after first execution have no new warnings (`set-output`, deprecated, etc.) |     |
| 9  | Diff doesn't reintroduce dropped infrastructure (Docker, OTel, MCP, etc.)            |     |
| 10 | If the fix was for a failing run: root cause was addressed, not just papered over    |     |

If any of these is N, either:
- Fix it before reporting done, or
- Surface it explicitly to the user with the reason it's still N.

Do not silently ship with an N answer.

## Discipline notes

- **Don't run the audit list mechanically.** Each N answer should have a one-line *why*. "N — workflow doesn't use bash scripts" is fine; "N" with no reason is not.
- **Don't apply every fix at once.** Group by severity (must-fix / should-fix / nit) and let the user decide which bucket to apply. The default offer is "must-fix + should-fix."
- **Don't expand scope silently.** If auditing `ci.yml` reveals the same issue in `deploy.yml`, note it but don't fix it — the user asked about `ci.yml`. Mention the parallel finding in the report.
- **Update this checklist** when you learn a new class of bug. The audit list is the floor, not the ceiling.
