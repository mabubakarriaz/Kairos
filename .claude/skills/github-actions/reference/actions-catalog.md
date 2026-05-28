# Actions catalog — the canonical pinned versions

The actions this repo's pipelines should use, with the current major-tag pin and the rationale. Update this file when Dependabot opens a major-version PR.

## First-party (`actions/*`, `github/*`) — major-tag pinning OK

These are owned by GitHub. Major tags are stable references that get patched in place for security; Dependabot bumps majors.

| Action                              | Pin    | Used for                                                                |
| ----------------------------------- | ------ | ----------------------------------------------------------------------- |
| `actions/checkout@v4`               | `@v4`  | Cloning the repo. Always step 1.                                        |
| `actions/setup-node@v4`             | `@v4`  | Installing Node + npm cache. Pin `node-version: 20` to match `engines`. |
| `actions/cache@v4`                  | `@v4`  | Generic caching when `setup-node` isn't enough.                         |
| `actions/upload-artifact@v4`        | `@v4`  | Saving build outputs, test reports, logs.                               |
| `actions/download-artifact@v4`      | `@v4`  | Pulling artifacts in a later job.                                       |
| `actions/github-script@v7`          | `@v7`  | Inline JS that hits the GitHub API (commenting, labeling, etc.).        |
| `actions/labeler@v5`                | `@v5`  | Auto-labeling PRs based on changed paths.                               |
| `actions/dependency-review-action@v4` | `@v4` | Scans PR-introduced deps for known vulns. PR-only.                      |

### Notes

- `actions/checkout@v4` defaults to a shallow clone (`fetch-depth: 1`). If you need history (changelog generation, `git describe`), set `fetch-depth: 0`.
- `actions/setup-node@v4` is what this repo uses. `v5` and `v6` exist; the upgrade is straightforward but unnecessary right now. Don't change unless a Dependabot PR opens.
- `actions/upload-artifact@v3` and `download-artifact@v3` are **deprecated**. If you see them anywhere in this repo, replace with `@v4` — `@v3` has a hard EOL.

## Trusted third-party — pin to a SHA

These are not GitHub-owned. Pin to the full 40-character commit SHA and put the human-readable tag in a trailing comment. Dependabot's `github-actions` ecosystem tracks them.

| Action                              | Use                                            | Notes                                              |
| ----------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| `supabase/setup-cli@<SHA> # v2.x`   | Installs the Supabase CLI for `db push`.       | **Always pin a real version, never `latest`** — the resolve step API-rate-limits on busy days. Current pin in `deploy.yml`: `2.101.0`. |
| `pnpm/action-setup@<SHA> # v4.x`    | If this repo ever switches to pnpm.            | Not currently used.                                |
| `peter-evans/create-pull-request@<SHA> # v6.x` | Creates a PR from workflow changes. | E.g., automated lockfile updates.                  |
| `dawidd6/action-download-artifact@<SHA> # v6.x` | Download artifacts across workflows. | Use only if first-party download-artifact can't.   |

### How to look up a SHA for a third-party tag

```bash
gh api repos/supabase/setup-cli/git/refs/tags/v1.4.6 --jq '.object.sha'
# or
git ls-remote https://github.com/supabase/setup-cli refs/tags/v1.4.6
```

## CLI versions (not actions, but pinned the same way)

Tools installed via `npm install -g` or `curl`. These bypass the actions catalog but need the same pinning discipline.

| Tool        | Recommended install                              | Notes                                                  |
| ----------- | ------------------------------------------------ | ------------------------------------------------------ |
| `vercel`    | `npm install -g vercel@<version>`                | **Don't use `@latest`** — same rate-limit / drift class of bug as `supabase` had. Pin to a known-good version. |
| `supabase`  | Use `supabase/setup-cli@v1` with `version: <X.Y.Z>` instead of npm/curl install. |                                                        |

## Actions to avoid in this repo

- `actions/setup-node` with no `cache:` input — wastes a free win. Always set `cache: 'npm'` unless you're using `actions/cache` directly for `~/.npm`.
- `actions/cache@v3` — deprecated.
- `actions/upload-artifact@v3` / `download-artifact@v3` — deprecated, EOL.
- `actions/checkout@v3` and earlier — works, but the v4 upgrade is trivial.
- Anything pinned to `@main` or `@latest` — see security.md § Pinning.
- Action mirrors with very low star counts and no commit activity in the last year. The cost-of-compromise math is bad.

## Dependabot config

This repo has `.github/dependabot.yml` set up for both `npm` and `github-actions` ecosystems, on a weekly schedule. **Don't disable this.** When Dependabot opens a PR:

1. Read the changelog link in the PR body.
2. If the change is a patch/minor with no breaking notes: merge.
3. If it's a major: walk the existing usage, decide whether to take the upgrade. Update the relevant section of this catalog.

## When to add a new action

Before importing a new third-party action:

1. **Is there a first-party alternative?** Most "I need to do X with GitHub" tasks have an `actions/github-script` one-liner.
2. **Is the maintainer trustworthy?** Stars, recent commits, security advisories.
3. **What permissions does it want?** If it asks for more than the task needs, that's a flag.
4. **Pin to SHA.** Comment with the tag and the date you reviewed it.

Document the addition in this catalog before merging.
