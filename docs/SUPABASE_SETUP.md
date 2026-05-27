# Supabase setup

Kairos stores everything in a single Supabase (PostgreSQL) project. The schema is
checked in as a migration; the app reaches the database **only from server-side
code** using the service-role key.

> **Security model:** there is no end-user login. Row-Level Security is **on** for
> every table with **zero policies**, so the public `anon` key can't read or write
> anything. All access goes through Next.js server code using the **service-role
> key**, which bypasses RLS and must stay server-only (never shipped to the browser,
> never committed — this repo is public).

---

## 1. Create the project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Pick a name (e.g. `kairos`), a strong **database password** (save it — you'll
   need it for migrations), and a region close to you.
3. Wait for it to finish provisioning.

## 2. Apply the schema

You have two options. **Option A** is the one CI uses on every deploy; **Option B**
is the quickest way to get going by hand.

### Option A — Supabase CLI (recommended, same as CI)

```bash
# Install once: https://supabase.com/docs/guides/cli
supabase login                       # opens a browser, creates an access token
supabase link --project-ref <your-project-ref>
supabase db push                     # applies everything in supabase/migrations/
```

`<your-project-ref>` is the value in your project URL
`https://<project-ref>.supabase.co` (also under **Project Settings → General**).

### Option B — paste the SQL

1. Open **SQL Editor** in the dashboard.
2. Copy the contents of [`supabase/migrations/20260527000000_initial_schema.sql`](../supabase/migrations/20260527000000_initial_schema.sql)
   and run it. It's idempotent, so re-running is safe.

> Optional demo data: run [`supabase/seed.sql`](../supabase/seed.sql) the same way
> to get a non-empty schedule on first load.

## 3. Grab the two values the app needs

**Project Settings → API** (and **Data API** for the URL):

| Value | Where | Used as |
|---|---|---|
| Project URL (`https://….supabase.co`) | Data API | `SUPABASE_URL` |
| `service_role` secret key | API Keys | `SUPABASE_SERVICE_ROLE_KEY` |

These are the app's **runtime** secrets — they go into Vercel's project env vars
(see [VERCEL_SETUP.md](VERCEL_SETUP.md)), **not** into git.

## 4. Run locally (optional)

```bash
cp .env.example .env.local
# fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev        # http://localhost:3000
```

---

## What the schema gives you

- **`tasks`** — title, optional description, estimate (min), tags, completion.
- **`scheduled_blocks`** — a task's time block, with a generated `during`
  `tstzrange`. A Postgres `EXCLUDE USING gist` constraint guarantees no two Kairos
  blocks overlap — enforced by the database, not app code.
- **`free_slots(from, to)`** — a SQL function that returns the open gaps in a window
  using multirange subtraction (`work − busy`). Kairos calls this via RPC; ranking
  the top few gaps is the only part done in JavaScript.

## Secrets that live in GitHub (for migrations on deploy)

CI runs `supabase db push` on every deploy, so GitHub needs (see
[DEPLOYMENT.md](DEPLOYMENT.md)):

- `SUPABASE_ACCESS_TOKEN` — a personal access token (**Account → Access Tokens**).
- `SUPABASE_PROJECT_REF` — your project ref.
- `SUPABASE_DB_PASSWORD` — the database password from step 1.
