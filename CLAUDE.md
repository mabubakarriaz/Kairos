# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What Kairos is

A time-blocking todo app: tasks live on a Google-Calendar-style **day schedule**, not
a flat list. The signature loop is **add a task with a time range → it renders as a
block → drag to reschedule → see the best free slots**. Single-user, **no login**.

This repo was rebuilt from a former .NET/Aspire stack into a simpler one — don't
reintroduce .NET, Docker Compose, observability stacks, an MCP server, or Google
Calendar sync. They were deliberately removed.

## Stack (the whole thing)

- **Next.js (App Router) + React 19 + TypeScript** — UI **and** backend in one app.
  Backend logic is **Server Actions** (`src/app/actions.ts`), not REST routes.
- **Tailwind CSS v3** — design tokens as CSS variables in `src/app/globals.css`
  (`:root` + `.dark`); `tailwind.config.ts` colors resolve to them. Re-theme by
  toggling `.dark` on `<html>`.
- **Supabase (PostgreSQL)** — accessed only from server code via the service-role key.
- **Vercel** — single project, frontend + backend together.
- **GitHub Actions** — the only deployer (`.github/workflows/deploy.yml`).

## Architecture & layout

```
src/
  app/
    layout.tsx        # root layout, flash-free theme init, next/font, ThemeToggle
    page.tsx          # the day view (Server Component): reads ?date, fetches, renders
    actions.ts        # "use server" — addTask / reschedule / deleteBlock + validation
    globals.css       # design tokens (two themes) + component classes
  components/          # client components: DayColumn (single canvas: grid, blocks,
                       #   free-slot ghosts, status line, drag island), InlineComposer
                       #   (click-to-create editor), DateToolbar, ThemeToggle
  lib/
    supabase.ts        # server-only, lazy service-role client (getSupabase())
    time.ts            # UTC day-window + grid math (PX_PER_MIN, snapMinutes, …)
    types.ts           # ScheduledBlock, FreeSlot, DaySchedule
  server/              # server-only data access (DB lives behind these)
    schedule.ts        # getBlocksInRange, rescheduleBlock, deleteBlock
    tasks.ts           # createTaskWithBlock (task + block in one step, rolls back)
    freeslots.ts       # getFreeSlots → free_slots() RPC, ranks top-N in TS
supabase/
  migrations/          # checked-in schema; idempotent; CI runs `supabase db push`
  seed.sql             # optional demo data
docs/                  # SUPABASE_SETUP, VERCEL_SETUP, DEPLOYMENT
```

**Data flow:** `page.tsx` / client components → Server Actions → `src/server/*` →
`getSupabase()`. Client components never import from `src/server/*` or `src/lib/supabase.ts`
(the `import "server-only"` guard makes that a build error).

## Contracts — get these right

- **The service-role key is server-only.** It bypasses RLS. Never put it in a client
  component, never expose it as `NEXT_PUBLIC_*`, never commit it. The browser never
  talks to Supabase directly — all DB access is server-side.
- **Secrets never enter git (the repo is public).** Runtime secrets live in Vercel
  env vars; deploy credentials live in GitHub Actions secrets. `.env.local` is
  gitignored. See `docs/DEPLOYMENT.md` for the split.
- **Schema is code.** Change the DB only via a new file in `supabase/migrations/`.
  Keep migrations idempotent (guard with `if not exists` / `create or replace`) so
  they're safe to re-run and to paste into the SQL editor. RLS stays **on** with no
  policies.
- **No-overlap is a DB constraint, not app logic.** The `scheduled_blocks_no_overlap`
  EXCLUDE constraint enforces it; `23P01` surfaces as "that time overlaps another
  block." Don't re-check overlap in TS.
- **Free slots are SQL.** `free_slots(from, to)` does multirange subtraction in
  Postgres. TS only ranks/takes top-N — don't reimplement gap-finding in JS.
- **UTC everywhere (MVP).** All times stored and displayed in UTC; the day window is
  `[date 00:00Z, +24h)`. Localized timezones are a future upgrade (schema is `timestamptz`).
- **Validate in the Server Action** before touching the DB (title present, end >
  start, estimate positive). Actions return `{ ok, error? }`; never throw across to
  the client.

## Commands

```bash
npm install
npm run dev        # http://localhost:3000 (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local)
npm run build      # production build — also type-checks; succeeds without env (lazy client)
npm run lint
npm run typecheck

# Database (Supabase CLI)
supabase link --project-ref <ref>
supabase db push   # apply supabase/migrations/*
```

`next build` does **not** prerender `/` (`export const dynamic = "force-dynamic"`),
so it never hits the DB at build time and needs no secrets.

### Build & dev hygiene (Windows)

- **`npm run typecheck` is the fast, reliable verification.** It catches the same
  TypeScript errors as `next build` in seconds. Prefer it for routine checks.
- **`npm run build` can hang on `.next/trace` (EPERM).** Windows holds file locks
  on `.next/` when a previous dev server, build, or Vercel CLI is still bound to
  the directory. Symptom: `uncaughtException [Error: EPERM: operation not permitted,
  open '.next\trace']`, or the build sits silent forever.
- **Reset before retrying a local build/dev:**

  ```powershell
  # Kill anything bound to :3000 (lingering dev server)
  Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force }

  # Clear the stale build dir
  Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
  ```

  Then re-run `npm run build` or `npm run dev`. **Don't wait on a stuck build —
  kill it, clear, and retry.** Type-check coverage is what verifies the diff;
  build verifies the bundle pipeline, not the diff.

## Gotchas

- **PostgreSQL 14+ required** for multiranges (`tstzmultirange`) and the EXCLUDE/GIST
  constraint. Supabase is 15+, so fine. `btree_gist` is enabled by the migration.
- **Drag island is bespoke + zero-dep.** `DayColumn.tsx` uses pointer events, snaps
  to 15-min slots, and calls `rescheduleAction` on drop. No SortableJS/dnd-kit.
- **`searchParams` is async** in Next 15 — `await` it in `page.tsx`.
- **Don't gate the build on ESLint** — `next.config.ts` sets `eslint.ignoreDuringBuilds`;
  lint runs as its own CI step. TypeScript errors still fail the build (keep types sound).

## Project memory

Durable project context (decisions, live-deployment facts, UI design language) lives
in `.claude/memory/` and is committed to the repo. These are imported below so they
load every session — keep them short and update them when you learn something durable.

@.claude/memory/deployment-live.md
@.claude/memory/stack-migration-2026-05-27.md
@.claude/memory/ui-redesign-direction.md
@.claude/memory/build-vs-typecheck-windows.md
