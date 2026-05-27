-- ─────────────────────────────────────────────────────────────────────────────
-- Kairos initial schema.
--
-- The schedule model is two tables: `tasks` and `scheduled_blocks`. A block has a
-- generated `during` tstzrange; Kairos blocks may not overlap (enforced by an
-- EXCLUDE constraint in Postgres, not application code). Free-slot detection is a
-- SQL multirange operation — see free_slots() below.
--
-- This script is idempotent: safe to run via `supabase db push` OR pasted straight
-- into the Supabase SQL editor, and safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists btree_gist;

-- Block source: 'kairos' = a task's own time block (editable, no-overlap);
-- 'gcal' kept in the enum for a future read-only Google Calendar sync (unused in MVP).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'block_source') then
    create type public.block_source as enum ('kairos', 'gcal');
  end if;
end $$;

create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (length(btrim(title)) > 0),
  description      text,
  estimate_minutes integer not null default 30 check (estimate_minutes > 0),
  tags             text[] not null default '{}',
  created_at       timestamptz not null default now(),
  completed_at     timestamptz
);

create table if not exists public.scheduled_blocks (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid references public.tasks(id) on delete cascade,
  source      public.block_source not null default 'kairos',
  start_utc   timestamptz not null,
  end_utc     timestamptz not null,
  rrule       text,
  external_id text,
  -- Generated half-open range used by the no-overlap constraint and free-slot SQL.
  during      tstzrange generated always as (tstzrange(start_utc, end_utc, '[)')) stored,
  constraint scheduled_blocks_ends_after_start check (end_utc > start_utc),
  constraint scheduled_blocks_kairos_needs_task check (source <> 'kairos' or task_id is not null),
  -- No two Kairos blocks may overlap. Gcal blocks (future) are exempt.
  constraint scheduled_blocks_no_overlap
    exclude using gist (during with &&) where (source = 'kairos')
);

create index if not exists scheduled_blocks_during_idx on public.scheduled_blocks using gist (during);
create index if not exists scheduled_blocks_task_id_idx on public.scheduled_blocks (task_id);

-- ── Free-slot detection ──────────────────────────────────────────────────────
-- Gaps in a window = working multirange MINUS the union of busy ranges. Postgres
-- multiranges return the gaps directly via subtraction + unnest; no gaps-and-islands.
create or replace function public.free_slots(from_utc timestamptz, to_utc timestamptz)
returns table (start_utc timestamptz, end_utc timestamptz)
language sql
stable
security invoker
as $$
  with busy as (
    select range_agg(during)::tstzmultirange as busy_mr
    from public.scheduled_blocks
    where during && tstzrange(from_utc, to_utc, '[)')
  ),
  working as (
    select tstzmultirange(tstzrange(from_utc, to_utc, '[)')) as work_mr
  ),
  gaps as (
    select unnest(work_mr - coalesce(busy_mr, '{}'::tstzmultirange)) as g
    from busy cross join working
  )
  select lower(g) as start_utc, upper(g) as end_utc
  from gaps
  where not lower_inf(g) and not upper_inf(g)
  order by lower(g);
$$;

-- ── Row-level security ───────────────────────────────────────────────────────
-- Lock everything down. The app reaches the DB only through server-side code using
-- the service-role key, which bypasses RLS. With RLS on and zero policies, the
-- anon/authenticated roles (and the public PostgREST API) get nothing — so even a
-- leaked anon key cannot read or write Kairos data.
alter table public.tasks            enable row level security;
alter table public.scheduled_blocks enable row level security;
