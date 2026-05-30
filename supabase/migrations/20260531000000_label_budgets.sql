-- ─────────────────────────────────────────────────────────────────────────────
-- Label registry + time-allocation budgets.
--
-- Labels already exist as free-text slugs in `tasks.tags text[]`; they're born
-- by typing them on a task. This migration adds a *registry* on top of that so a
-- label can be promoted to a managed thing with a time budget. A budget is a
-- target amount of work-hours per base period (day/week/month/quarter); the app
-- pro-rates it to whatever range the user is viewing and compares it against
-- actual scheduled time. A label may run over budget — nothing here enforces a
-- ceiling, it only measures.
--
-- Two pieces:
--   • public.labels       — the registry. slug PK, optional (budget_hours,
--                           budget_period) pair. No FK to tasks: tags stay
--                           free-text, so registering/removing a label never
--                           touches a task row.
--   • public.label_usage  — per-label used-minutes in a window, computed in
--                           Postgres (same "aggregation lives in SQL" stance as
--                           free_slots). A block contributes its FULL duration
--                           to every one of its labels (no splitting), so the
--                           per-label totals intentionally overlap.
--
-- Idempotent: safe to re-run via `supabase db push` or the SQL editor.
-- Non-destructive: only adds a table, a constraint, an index, and a function.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.labels (
  slug          text primary key
                check (slug ~ '^[a-z0-9][a-z0-9_-]*$' and length(slug) <= 24),
  -- A budget is all-or-nothing: both columns null (registered, untracked) or
  -- both set (tracked). The pair check below enforces that.
  budget_hours  numeric check (budget_hours is null or budget_hours > 0),
  budget_period text   check (budget_period is null
                              or budget_period in ('day','week','month','quarter')),
  created_at    timestamptz not null default now(),
  constraint labels_budget_pair check (
    (budget_hours is null and budget_period is null) or
    (budget_hours is not null and budget_period is not null)
  )
);

-- Tracked labels (those carrying a budget) are the budget view's working set;
-- index the partial so that lookup stays cheap as the registry grows.
create index if not exists labels_budgeted_idx
  on public.labels (slug)
  where budget_hours is not null;

-- ── Per-label usage in a window ───────────────────────────────────────────────
-- Returns (label, used_minutes) for every label that has any scheduled time
-- overlapping [from_utc, to_utc). Each block's duration is clipped to the window
-- and counted once per label it carries — a 60-minute block tagged #a #b adds 60
-- to both, by design (labels are orthogonal dimensions on the same time, the
-- same reading the day-stats line uses). Gcal blocks (no task, no tags) are
-- excluded. TS joins this against the registry to build the budget meters.
create or replace function public.label_usage(from_utc timestamptz, to_utc timestamptz)
returns table (label text, used_minutes numeric)
language sql
stable
security invoker
as $$
  select
    tag as label,
    sum(
      extract(epoch from (least(b.end_utc, to_utc) - greatest(b.start_utc, from_utc))) / 60.0
    ) as used_minutes
  from public.scheduled_blocks b
  join public.tasks t on t.id = b.task_id
  cross join lateral unnest(t.tags) as tag
  where b.source = 'kairos'
    and b.during && tstzrange(from_utc, to_utc, '[)')
  group by tag;
$$;

-- ── Row-level security ───────────────────────────────────────────────────────
-- Same posture as tasks/scheduled_blocks: RLS on, zero policies. The app reaches
-- this table only via the server-side service-role key (which bypasses RLS), so
-- even a leaked anon key reads nothing.
alter table public.labels enable row level security;
