# Deployment (GitHub Actions → Supabase + Vercel)

Production deploys run **only** from GitHub Actions. Every credential lives in GitHub
Actions secrets — the public codebase contains no tokens, keys, or passwords.

```
push to main ──▶ .github/workflows/deploy.yml
                    │
                    ├─ job: migrate  →  supabase db push   (applies supabase/migrations/)
                    └─ job: deploy   →  vercel build + deploy --prod
```

Pull requests run [`ci.yml`](../.github/workflows/ci.yml) instead (lint, type-check,
build) — no deploy, no secrets.

---

## One-time: add the GitHub secrets

**Repo → Settings → Secrets and variables → Actions → New repository secret.**

### Supabase (for the `migrate` job)

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → **Access Tokens** → generate |
| `SUPABASE_PROJECT_REF` | the `<ref>` in `https://<ref>.supabase.co` |
| `SUPABASE_DB_PASSWORD` | the database password you set when creating the project |

### Vercel (for the `deploy` job)

| Secret | Where to get it |
|---|---|
| `VERCEL_TOKEN` | <https://vercel.com/account/tokens> |
| `VERCEL_ORG_ID` | `orgId` in `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | `projectId` in `.vercel/project.json` |

> The app's **runtime** Supabase secrets (`SUPABASE_URL`,
> `SUPABASE_SERVICE_ROLE_KEY`) do **not** go in GitHub — they live in **Vercel**
> project env vars (see [VERCEL_SETUP.md](VERCEL_SETUP.md)). GitHub holds only the
> credentials needed to *push migrations* and *trigger a Vercel build*.

### Login gate (also in Vercel)

The single-user password gate lives entirely in app code; there is no third-party
auth provider. Set these alongside the Supabase runtime vars in **Vercel** project
env. The app is locked closed until both are present.

| Vercel env var | What it is |
|---|---|
| `APP_PASSWORD` | The literal password that unlocks the app. Pick something long. |
| `AUTH_SECRET` | HMAC key for the session cookie. Generate with `openssl rand -hex 32`. Rotating this value invalidates every existing session. |

After 3 failed attempts from the same IP the gate locks that IP for 2 hours
(tracked in the `auth_lockout` table — applied by the migration job). A
successful login wipes the IP's lockout row.

## Turn off Vercel's own Git deploys

So you don't deploy twice, disable Vercel's automatic Git deployments (Vercel
Project → Settings → Git). GitHub Actions is the single source of deploys.

## What a deploy does

1. **migrate** — links the Supabase CLI to your project and runs `supabase db push`,
   applying any new files in `supabase/migrations/`. The migration is idempotent, so
   re-running it never breaks anything.
2. **deploy** — `vercel pull` fetches your project settings + env, `vercel build`
   builds the Next.js app with those env vars baked in for the server runtime, and
   `vercel deploy --prebuilt --prod` ships it.

## Manual deploy

Trigger it from the **Actions** tab → **Deploy** → **Run workflow**
(`workflow_dispatch`), or just push to `main`.

## Branching

`main` is production. Open PRs from feature branches → CI runs → merge to `main`
deploys. Keep it that simple.
