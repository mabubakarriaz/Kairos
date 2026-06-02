-- ─────────────────────────────────────────────────────────────────────────────
-- Google Calendar sync (read-only, multi-calendar via secret iCal URLs).
--
-- Adds a `calendars` registry (one row per attached Google calendar) and extends
-- `scheduled_blocks` so an external 'gcal' block can carry its own title and a
-- back-reference to the calendar it came from. Kairos blocks are untouched: they
-- still borrow their title from the joined task and keep calendar_id null.
--
-- The 'gcal' source + external_id column already exist from the initial schema;
-- the no-overlap EXCLUDE constraint already exempts 'gcal' (where source =
-- 'kairos'), so Google events may overlap each other and your time-blocks freely.
--
-- Non-destructive and idempotent: only CREATE … IF NOT EXISTS and ADD COLUMN IF
-- NOT EXISTS. Safe via `supabase db push` or pasted into the SQL editor, re-runnable.
-- ─────────────────────────────────────────────────────────────────────────────

-- One attached calendar: a secret iCal URL + the label its events wear in Kairos.
create table if not exists public.calendars (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) > 0),
  -- Google's "Secret address in iCal format". Must be https; never anything else.
  ics_url         text not null check (ics_url ~* '^https://'),
  -- The label slug every event from this calendar carries (lowercase a-z0-9_-).
  label           text not null check (label ~ '^[a-z0-9][a-z0-9_-]*$'),
  enabled         boolean not null default true,
  position        integer not null default 0,
  last_synced_at  timestamptz,
  last_sync_error text,
  created_at      timestamptz not null default now()
);

-- gcal blocks reference their calendar; dropping a calendar drops its events.
alter table public.scheduled_blocks
  add column if not exists calendar_id uuid references public.calendars(id) on delete cascade;

-- gcal blocks have no task to borrow a title from, so they store their own.
alter table public.scheduled_blocks
  add column if not exists title text;

-- One row per external event instance. Sync upserts/reconciles by external_id,
-- which encodes the calendar-local UID plus the occurrence start so recurring
-- instances stay distinct.
create unique index if not exists scheduled_blocks_calendar_external_idx
  on public.scheduled_blocks (calendar_id, external_id)
  where calendar_id is not null;

create index if not exists scheduled_blocks_calendar_id_idx
  on public.scheduled_blocks (calendar_id);

-- Shape guard: a 'gcal' row must name a calendar and a title; non-gcal rows must
-- not. Additive check — existing rows are all 'kairos', so validation passes.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scheduled_blocks_gcal_shape') then
    alter table public.scheduled_blocks
      add constraint scheduled_blocks_gcal_shape
      check (
        (source = 'gcal' and calendar_id is not null and title is not null)
        or source <> 'gcal'
      );
  end if;
end $$;

-- RLS on, zero policies — same hardening as every other table. All access is
-- server-side via the service-role key, which bypasses RLS.
alter table public.calendars enable row level security;
