# Security — the non-negotiables

Pipelines run with credentials. A sloppy workflow exfiltrates secrets, ships compromised code, or grants write access to attackers. This file is the floor: every workflow this skill writes or touches must pass every rule below.

Source: GitHub's "Security hardening for GitHub Actions" guide. The rules are paraphrased; the rationale is theirs.

## 1. Pin every action

### Why
An action reference like `actions/checkout@v4` is a moving target — the maintainer can repoint the tag at any commit. If that account is compromised, your workflow runs attacker code with all your secrets.

### Rule
- **First-party actions** (`actions/*`, `github/*`, `supabase/*`, `vercel/*` — orgs you trust with your codebase): major-tag pinning is acceptable (`@v4`). Dependabot will update them.
- **Third-party actions** (anything else): pin to the full 40-character commit SHA, with the human-readable tag as a comment.
  ```yaml
  uses: third-party/action@a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0  # v1.2.3
  ```
- **Never** use `@main`, `@master`, `@latest`, or a partial SHA.

### How to find the SHA
```bash
gh api repos/<owner>/<repo>/git/refs/tags/<tag> --jq '.object.sha'
# or
git ls-remote https://github.com/<owner>/<repo> refs/tags/<tag>
```

### Exception
If the action is published by a tag-pinned organization (e.g., `actions/cache@v4`), the tag itself is the integrity boundary GitHub maintains. Dependabot's `package-ecosystem: github-actions` keeps these current — that's the safety net.

## 2. Least-privilege `permissions:`

### Why
The `GITHUB_TOKEN` is provisioned automatically with the repo's default permissions. For older repos and many enterprise defaults, this is `write` on `contents` — far more than most jobs need.

### Rule
Every workflow has a top-level `permissions:` block that defaults to read-only. Elevate per-job, with a comment explaining why.

```yaml
# Workflow default — most jobs only need to read the repo.
permissions:
  contents: read

jobs:
  lint:
    permissions:
      contents: read       # explicit even when same as default — easier to audit
    runs-on: ubuntu-latest
    steps: [...]

  release:
    permissions:
      contents: write      # needed to push a tag back to the repo
      pull-requests: write # needed to update the release PR description
    runs-on: ubuntu-latest
    steps: [...]
```

### Scopes you'll actually use
| Scope            | When to elevate                                       |
| ---------------- | ----------------------------------------------------- |
| `contents`       | Pushing commits/tags, creating releases               |
| `pull-requests`  | Commenting on, labeling, or merging PRs               |
| `issues`         | Commenting on or closing issues                       |
| `checks`         | Posting check runs (most actions do this on their own)|
| `id-token`       | OIDC auth to a cloud provider                         |
| `deployments`    | Creating GitHub deployment records                    |
| `packages`       | Publishing to GitHub Packages                         |
| `actions`        | Cancelling other workflow runs                        |

Everything you don't name is `none`. That's the goal.

## 3. Script injection — pass through `env:`, never interpolate

### Why
`${{ ... }}` is evaluated by the runner **before** the shell runs. If you write:

```yaml
- run: echo "Title is ${{ github.event.pull_request.title }}"
```

…and the PR title is `"; rm -rf /; echo "`, the runner expands the expression first and the shell sees:

```bash
echo "Title is "; rm -rf /; echo ""
```

The runner just helped the attacker pwn your CI.

### Rule
Any value sourced from `github.event.*`, `github.head_ref`, branch names, PR titles, commit messages, or anything else a contributor controls must be passed through `env:` first. Then reference it as a shell variable.

**Unsafe:**
```yaml
- run: |
    if [[ "${{ github.event.pull_request.title }}" == *"WIP"* ]]; then
      echo "skipping"
    fi
```

**Safe:**
```yaml
- env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: |
    if [[ "$PR_TITLE" == *"WIP"* ]]; then
      echo "skipping"
    fi
```

The `$PR_TITLE` expansion happens inside the shell, which quotes it properly.

### Values that need this treatment
- `github.event.pull_request.title`, `.body`, `.head.ref`, `.head.repo.full_name`
- `github.event.issue.title`, `.body`
- `github.event.comment.body`
- `github.event.head_commit.message`
- `github.head_ref` (for fork PRs)
- `github.actor` (only if used in a command — for logging it's fine)

Anything in `secrets.*`, `vars.*`, `runner.*`, `github.workflow`, `github.run_id`, `github.sha`, `github.repository` is safe to interpolate — they're either trusted or not contributor-controlled.

## 4. `pull_request_target` — read-only checkout, no PR code execution

### Why
`pull_request_target` runs in the **base** repo's context with secrets and a writable `GITHUB_TOKEN`. If you `actions/checkout` the PR head and then run `npm ci` (or any script the PR can modify), you've just executed attacker code with your production credentials.

### Rule
- Use `pull_request` for anything that builds, tests, or otherwise runs PR code.
- Use `pull_request_target` only for labeling, commenting, size-checking the diff via the API, or other operations that never execute PR source.
- If you must check out the PR head under `pull_request_target` (very rare), gate it with `if: github.event.pull_request.head.repo.full_name == github.repository` so only same-repo branches qualify — fork PRs are blocked.

```yaml
# Safe: labels a PR by size. Never executes PR code.
on:
  pull_request_target:
    types: [opened, synchronize]
permissions:
  pull-requests: write
jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/labeler@v5  # uses the GitHub API, no checkout
```

## 5. Secrets — separate, never logged, rotate

### Rules
- One secret per value. **Never** stuff JSON/YAML/env-file blobs into a single secret — partial extraction by a malicious step becomes much harder to detect.
- Re-register transformed secrets. If you base64-encode a secret, add the encoded form as a new secret too — otherwise it won't get auto-redacted in logs.
- Don't pass secrets as command-line arguments where they appear in `set -x` output. Use `env:`.
  ```yaml
  # Bad — token appears in the step's "Run" output
  - run: vercel --token=${{ secrets.VERCEL_TOKEN }} deploy

  # Good — token is masked
  - env:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
    run: vercel deploy
  ```
- Don't echo secrets, even base64'd. The auto-redaction is best-effort.
- Rotate on a schedule that matches the secret's blast radius. Deploy tokens: every 90 days minimum. Database passwords: as required by your policy.

### This repo's secrets
See `reference/project-context.md` for the full list. Anything in `${{ secrets.* }}` should appear there with a one-line note on rotation cadence and who owns it.

## 6. OIDC over long-lived secrets — when feasible

### Why
A static cloud token in `secrets.AWS_ACCESS_KEY_ID` is a credential someone could exfiltrate. An OIDC-issued token is short-lived (minutes), scoped to the workflow run, and impossible to reuse.

### Rule
If the cloud provider supports OIDC for GitHub Actions, prefer it over long-lived secrets for new workflows. Existing workflows can migrate on the next rotation cycle.

```yaml
permissions:
  id-token: write     # required for OIDC
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-deploy
          aws-region: us-east-1
      # No AWS_ACCESS_KEY_ID secret involved.
```

### Current state in this repo
Supabase CLI and Vercel CLI both authenticate with long-lived tokens (`SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`). Neither has a documented OIDC path for the deploy flow as of the last audit. This is acceptable; revisit if Vercel/Supabase ships OIDC support.

## 7. Don't trust ephemeral runners with persistent data

- Don't `aws s3 cp ~/.kube/config s3://...`. Don't write anything sensitive to a path that gets cached by `actions/cache`.
- The cache is readable by anyone who can open a PR against the repo (a PR can craft a workflow that restores the cache). Anything you cache becomes effectively public.
- `actions/upload-artifact` is similar — artifacts are downloadable by anyone with read access to the repo.

## 8. Forks and `pull_request` token

PRs from forks get a **read-only** `GITHUB_TOKEN` and **no secrets**. This is correct and intentional — don't try to work around it. If your CI needs secrets to run, gate the relevant steps with `if: github.event.pull_request.head.repo.full_name == github.repository` so they only run on same-repo PRs, and document that fork PRs will skip those checks.

## 9. The audit-trail discipline

When you change anything in a workflow that affects security (add a secret, change permissions, add a new third-party action, switch a trigger), include in the commit message:
- What changed
- Why
- What the rollback looks like

The audit log is in `git log`. Help your future self read it.

## 10. The escalation rule

If you see something in a pipeline that smells wrong but you can't tell whether it's a real vulnerability, **do not delete it silently and do not "fix it" quietly**. Surface it to the user with the concrete attack model before changing anything. Removing a guard that the user added on purpose is worse than leaving a smell in place.
