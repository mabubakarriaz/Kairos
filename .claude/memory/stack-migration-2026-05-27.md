---
name: stack-migration-2026-05-27
description: Kairos rebuilt from .NET/Aspire to Next.js + Supabase + Vercel on 2026-05-27; scope & auth decisions
type: project
---

On 2026-05-27 the user scrapped the **entire** former .NET 10 / Aspire / EF / MCP / observability stack (they were "not happy with outcome") and rebuilt Kairos as a **Next.js 15 App Router** app (TypeScript, Tailwind v3, Server Actions) backed by **Supabase (Postgres)** and deployed to **Vercel**, with **GitHub Actions as the sole deployer** (all Supabase/Vercel credentials live in GitHub Actions secrets; app runtime secrets live in Vercel env). The repo is **PUBLIC** — never commit secrets.

Scope chosen: **Core schedule MVP only** — tasks + time-blocked day view + free-slot suggestions + drag-to-reschedule. Auth chosen: **NO login** — but the DB is hardened (RLS on with zero policies; all access via the **server-only service-role key**, never shipped to the browser, no `NEXT_PUBLIC_*` Supabase vars).

Deliberately dropped / deferred (do **not** reintroduce without asking): Google Calendar read-only sync, recurring blocks (RRULE), the MCP server, the OpenTelemetry/Grafana observability stack, Docker Compose/reverse proxy, and multi-user auth. The Postgres-native design carried over: generated `during` tstzrange, `EXCLUDE USING gist` no-overlap constraint, and the `free_slots()` multirange SQL function.

**Why:** user wanted it simple, public, and cheap to run on one Vercel project.
**How to apply:** see [UI redesign direction](ui-redesign-direction.md) for the look; treat the dropped features as future opt-ins and confirm before adding any back; CLAUDE.md is the authoritative in-repo guide. The app is now [deployed & live](deployment-live.md).
