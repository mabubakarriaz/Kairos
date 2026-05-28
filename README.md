# Kairos

> _"The right & opportune time to do a task."_

Kairos is a todo app built around **time blocking**. Instead of a flat checklist,
your tasks live on a day timeline — a Google-Calendar-style schedule view — so you
plan _when_ you'll do something, not just _what_. It finds the open gaps in your day
and lets you drag tasks around to reschedule them.

## Features

- **Time-blocked day view** — tasks render as blocks on a vertical day timeline.
  Each block shows its time range and duration (e.g. `10:00–11:30 · 1h 30m`),
  and the duration swaps to a live `42m left` countdown when the now-line is
  crossing it.
- **Week view** — five days side-by-side; drag a block between columns to move
  it to another day.
- **Inline composer** — click any empty slot to drop a block right there, or
  press `n` to open one at the next free slot.
- **Drag to reschedule** — grab a block and drop it on a new time (snaps to 15 min);
  drag the bottom edge to resize.
- **Click a title to rename** — in-place edit, no dialog.
- **No-overlap scheduling** — the database itself guarantees blocks can't collide.
- **Free-slot finder** — the best open gaps in your day, computed in SQL; the
  current next-free slot is always one click (or keypress) away.
- **Light / dark** — a polished theme toggle that remembers your choice.

## Tech stack

- **[Next.js](https://nextjs.org) (App Router) + React + TypeScript** — one app for
  both UI and backend (Server Actions), deployed as a single project.
- **[Tailwind CSS](https://tailwindcss.com)** — a small CSS-variable design-token
  system driving both themes.
- **[Supabase](https://supabase.com) (PostgreSQL)** — storage, using Postgres range
  / multirange types for the no-overlap constraint and free-slot SQL.
- **[Vercel](https://vercel.com)** — hosting.
- **GitHub Actions** — the only thing that deploys (migrations → Supabase, app →
  Vercel). All credentials live in GitHub secrets; nothing sensitive is in the repo.

## Quick start (local)

```bash
git clone https://github.com/mabubakarriaz/Kairos.git
cd Kairos
cp .env.example .env.local        # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev                       # http://localhost:3000
```

You need a Supabase project with the schema applied first — see
**[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)**.

## Deploy

1. **[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)** — create the database, apply the schema.
2. **[docs/VERCEL_SETUP.md](docs/VERCEL_SETUP.md)** — create the Vercel project, set runtime env.
3. **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — add GitHub secrets; push to `main` deploys.

## Security note

There's no login — anyone with the URL sees the same schedule. But the database is
**not** publicly writable: Row-Level Security is on with no policies, and the app
only ever talks to Supabase from the server using the service-role key (never sent
to the browser, never committed). Keep that key secret.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint (`next/core-web-vitals`) |
| `npm run typecheck` | `tsc --noEmit` |

## License

See [LICENSE](LICENSE).
