# Vercel setup

Kairos is a single Next.js app — frontend **and** backend (Server Actions) deploy as
one Vercel project. No separate API service.

---

## 1. Create the project

1. Go to <https://vercel.com/new> and import this GitHub repository.
2. Framework preset: **Next.js** (auto-detected). Leave build/output settings at
   their defaults.
3. **Before the first deploy finishes**, add the environment variables below, or the
   app will load with a "Couldn't load the schedule" notice.

## 2. Add runtime environment variables

**Project → Settings → Environment Variables** — add both for **Production**
(and Preview/Development if you want preview deploys to work):

| Name | Value | Notes |
|---|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | from Supabase → Data API |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key | **secret** — server-only |

> These stay in Vercel, never in git. The browser never receives them — there are
> no `NEXT_PUBLIC_*` Supabase vars by design.

## 3. Decide how deploys happen

You have two valid setups — pick one:

- **GitHub Actions drives deploys (what this repo is wired for).** Turn **off**
  Vercel's own Git auto-deploys so you don't double-deploy: Project → Settings →
  Git → disconnect Git or disable "Automatically deploy". Then follow
  [DEPLOYMENT.md](DEPLOYMENT.md) to add the GitHub secrets. This matches your goal:
  **only GitHub holds the deploy credentials.**

- **Let Vercel auto-deploy from Git.** Simplest, but then Vercel (not just GitHub)
  is wired to your repo. You can skip the GitHub `deploy.yml` workflow. Migrations
  still need to run separately (run `supabase db push` yourself, or keep the
  `migrate` half of the workflow).

## 4. Values GitHub Actions needs (for option 1)

Get these once with the Vercel CLI, then store them as GitHub secrets
(see [DEPLOYMENT.md](DEPLOYMENT.md)):

```bash
npm i -g vercel
vercel login
vercel link            # creates .vercel/project.json (gitignored)
cat .vercel/project.json   # shows "orgId" and "projectId"
```

| GitHub secret | Value |
|---|---|
| `VERCEL_TOKEN` | create at <https://vercel.com/account/tokens> |
| `VERCEL_ORG_ID` | `orgId` from `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | `projectId` from `.vercel/project.json` |
