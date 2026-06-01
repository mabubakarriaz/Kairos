---
name: stack-migration-2026-05-27
description: Kairos rebuilt from .NET/Aspire to Next.js + Supabase + Vercel on 2026-05-27; scope & auth decisions
type: project
---

On 2026-05-27 the user scrapped the **entire** former .NET 10 / Aspire / EF / MCP / observability stack (they were "not happy with outcome") and rebuilt Kairos as a **Next.js 15 App Router** app (TypeScript, Tailwind v3, Server Actions) backed by **Supabase (Postgres)** and deployed to **Vercel**, with **GitHub Actions as the sole deployer** (all Supabase/Vercel credentials live in GitHub Actions secrets; app runtime secrets live in Vercel env). The repo is **PUBLIC** — never commit secrets.

Initial scope: **core schedule MVP** — tasks + time-blocked day view + free-slot suggestions + drag-to-reschedule. It has since grown (still single-user, still simple): **5-day / week / month** views, **recurrence** (daily / weekdays / weekly / every-N) with a series-delete confirm, **checkpoints** (named moments on the grid), **labels + time budgets** (a `/settings` room), and a **timezone toggle** (Karachi ↔ UTC; storage stays UTC). Auth: a **single-password gate** now fronts the app (`APP_PASSWORD` + `AUTH_SECRET`, lockout after repeated failures) — still **not** multi-user accounts. The DB stays hardened (RLS on with zero policies; all access via the **server-only service-role key**, never shipped to the browser, no `NEXT_PUBLIC_*` Supabase vars).

Still deliberately dropped / deferred (do **not** reintroduce without asking): Google Calendar read-only sync, the MCP server, the OpenTelemetry/Grafana observability stack, Docker Compose/reverse proxy, and **multi-user accounts** (the single-password gate is the only auth). Note: recurrence **shipped** as fixed presets, not open RRULE editing, so don't reach for a full RRULE engine without asking. The Postgres-native design carried over: generated `during` tstzrange, `EXCLUDE USING gist` no-overlap constraint, and the `free_slots()` multirange SQL function.

**Why:** user wanted it simple, public, and cheap to run on one Vercel project.
**How to apply:** see [UI redesign direction](ui-redesign-direction.md) for the look; treat the dropped features as future opt-ins and confirm before adding any back; CLAUDE.md is the authoritative in-repo guide. The app is now [deployed & live](deployment-live.md).
