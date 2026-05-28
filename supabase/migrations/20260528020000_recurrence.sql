-- ─────────────────────────────────────────────────────────────────────────────
-- Recurrence support for tasks.
--
-- Each recurrence is materialised as N independent (task, scheduled_block) rows
-- sharing a `series_id`. This keeps the existing EXCLUDE no-overlap constraint
-- doing all the work — every occurrence is a real row, free-slot SQL still
-- subtracts it, and a single block can be moved/renamed/resized without
-- touching the rest of the series. Only deletion is series-aware (see
-- `delete_block_series_from`).
--
-- Idempotent: safe to re-run via `supabase db push` or the SQL editor.
-- Non-destructive at deploy time: the migration only adds columns, an index,
-- check constraints, and `CREATE OR REPLACE FUNCTION` definitions. No existing
-- row is touched. The SAFETY annotation below is purely to satisfy the CI
-- guard, which can't tell a `delete from` *inside a function body* from a
-- migration that deletes data at deploy time.
--
-- SAFETY: destructive (reason: function bodies contain `delete from public.tasks`
-- and `delete from public.scheduled_blocks` so the CI text-scanner flags them.
-- The migration itself does not run those statements; they only execute when
-- the app invokes `delete_block_series_from()`. No data is removed by `supabase
-- db push`; no backup is required.)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tasks
  add column if not exists series_id uuid;

alter table public.tasks
  add column if not exists recurrence_kind text;

alter table public.tasks
  add column if not exists recurrence_interval_days integer;

-- Constrain `recurrence_kind` and `recurrence_interval_days` only if the checks
-- aren't already present. The DO block keeps the migration safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_recurrence_kind_check'
  ) then
    alter table public.tasks
      add constraint tasks_recurrence_kind_check
      check (recurrence_kind is null
             or recurrence_kind in ('daily','weekdays','weekly','interval'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_recurrence_interval_check'
  ) then
    alter table public.tasks
      add constraint tasks_recurrence_interval_check
      check (recurrence_interval_days is null or recurrence_interval_days >= 2);
  end if;
end $$;

create index if not exists tasks_series_id_idx
  on public.tasks (series_id)
  where series_id is not null;

-- ── RPC: create a task + (optionally) its recurring series in one call ──────
-- Returns the series id (null for one-shot) and the count of inserted blocks.
-- Overlap conflicts (23P01) on any non-first occurrence are silently skipped:
-- the user explicitly chose recurrence, missing dates are expected. The first
-- occurrence must succeed; if it raises, the whole call raises.
create or replace function public.create_task_series(
  p_title text,
  p_tags text[],
  p_estimate_minutes integer,
  p_start_utc timestamptz,
  p_end_utc timestamptz,
  p_recurrence_kind text default null,
  p_interval_days integer default null,
  p_max_occurrences integer default 60
)
returns table (series_id uuid, inserted_count integer, first_block_id uuid)
language plpgsql
security invoker
as $$
declare
  v_series_id uuid := null;
  v_dur_min numeric := extract(epoch from (p_end_utc - p_start_utc)) / 60.0;
  v_count integer := 0;
  v_first_id uuid := null;
  v_idx integer;
  v_max integer;
  v_cur_start timestamptz;
  v_cur_end timestamptz;
  v_step integer;
  v_dow integer;
  v_task_id uuid;
  v_block_id uuid;
begin
  if v_dur_min <= 0 then
    raise exception 'end must be after start';
  end if;

  if p_recurrence_kind is null then
    v_max := 1;
  else
    v_max := least(coalesce(p_max_occurrences, 60), 366);
  end if;

  if p_recurrence_kind is not null then
    v_series_id := gen_random_uuid();
  end if;

  if p_recurrence_kind = 'interval' then
    if p_interval_days is null or p_interval_days < 2 then
      raise exception 'interval days must be >= 2';
    end if;
    v_step := p_interval_days;
  end if;

  for v_idx in 0 .. v_max - 1 loop
    -- Compute this occurrence's window.
    if p_recurrence_kind = 'weekly' then
      v_cur_start := p_start_utc + (v_idx * 7 || ' days')::interval;
    elsif p_recurrence_kind = 'interval' then
      v_cur_start := p_start_utc + (v_idx * v_step || ' days')::interval;
    else
      -- single, daily, weekdays — all step by 1 day
      v_cur_start := p_start_utc + (v_idx || ' days')::interval;
    end if;
    v_cur_end := v_cur_start + (v_dur_min || ' minutes')::interval;

    -- Skip Sat/Sun for 'weekdays'.
    if p_recurrence_kind = 'weekdays' then
      v_dow := extract(dow from v_cur_start);
      if v_dow = 0 or v_dow = 6 then
        continue;
      end if;
    end if;

    begin
      insert into public.tasks (
        title, estimate_minutes, tags,
        series_id, recurrence_kind, recurrence_interval_days
      )
      values (
        p_title,
        coalesce(p_estimate_minutes, 30),
        coalesce(p_tags, '{}'::text[]),
        v_series_id, p_recurrence_kind, p_interval_days
      )
      returning id into v_task_id;

      insert into public.scheduled_blocks (task_id, source, start_utc, end_utc)
      values (v_task_id, 'kairos', v_cur_start, v_cur_end)
      returning id into v_block_id;

      v_count := v_count + 1;
      if v_first_id is null then
        v_first_id := v_block_id;
      end if;
    exception
      when exclusion_violation then
        if v_task_id is not null then
          delete from public.tasks where id = v_task_id;
          v_task_id := null;
        end if;
        if v_idx = 0 then
          raise;
        end if;
        continue;
    end;
  end loop;

  return query select v_series_id, v_count, v_first_id;
end;
$$;

-- ── RPC: delete a block and all later occurrences in its series ─────────────
-- "this and future" deletion. For a non-series block, this falls back to a
-- single-block delete. Returns the number of blocks removed. Tasks are deleted
-- (cascading to their blocks) so no orphan task rows are left behind.
create or replace function public.delete_block_series_from(p_block_id uuid)
returns integer
language plpgsql
security invoker
as $$
declare
  v_series_id uuid;
  v_start timestamptz;
  v_count integer := 0;
begin
  select t.series_id, b.start_utc
    into v_series_id, v_start
  from public.scheduled_blocks b
  left join public.tasks t on t.id = b.task_id
  where b.id = p_block_id;

  if not found then
    return 0;
  end if;

  if v_series_id is null then
    delete from public.scheduled_blocks where id = p_block_id;
    get diagnostics v_count = row_count;
    return v_count;
  end if;

  -- Delete tasks in this series from `v_start` onwards. The on-delete-cascade
  -- on scheduled_blocks.task_id sweeps their blocks with them.
  with victims as (
    select t.id
    from public.tasks t
    join public.scheduled_blocks b on b.task_id = t.id
    where t.series_id = v_series_id
      and b.start_utc >= v_start
  )
  delete from public.tasks where id in (select id from victims);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
