---
name: deployment-live
description: Kairos is deployed & live — production URL, deploy mechanism, and the env/CI gotchas resolved
type: project
---

Kairos is **live in production** (first successful deploy 2026-05-28): **https://kairos-chi-five.vercel.app** (Supabase project ref `wbqsoygunqyxviplgakx`).

**Deploy mechanism:** push to `main` → `.github/workflows/deploy.yml` runs `migrate` (`supabase db push`) then `deploy` (`vercel build` + `vercel deploy --prebuilt --prod`). GitHub Actions is the sole deployer; all creds are GitHub secrets (6) + Vercel env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). `gh` is authed as account `mabubakarriaz`. Doc/memory-only pushes skip the deploy (`paths-ignore` in deploy.yml); use the **Run workflow** button (`workflow_dispatch`) to force a deploy.

**Gotchas resolved during first deploy (now fixed in-repo):**
- Vercel build failed "No Output Directory named public" → framework preset wasn't Next.js → pinned via `vercel.json` `{"framework":"nextjs"}`.
- Every Supabase request returned "Invalid path specified in request URL" → the `SUPABASE_URL` env value had `/rest/v1/` appended (supabase-js appends `/rest/v1` itself). `src/lib/supabase.ts` now normalizes the value (strips whitespace, trailing slashes, and a trailing `/rest/v1`), so the bare project URL is always used regardless of paste.
- `supabase/setup-cli@v1` with `version: latest` hit a GitHub API rate limit → pinned to `2.101.0` in deploy.yml.

**Verified:** the read path (schedule day view + `free_slots` RPC) loads cleanly. **Not yet exercised in a browser:** the write paths (add-task / drag-to-reschedule / delete Server Actions) — they share the same working client + the DB EXCLUDE no-overlap constraint. DB is empty (no seed run), so the day view starts blank with one full-day free slot. See [stack migration](stack-migration-2026-05-27.md) for scope.
