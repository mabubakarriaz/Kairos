-- Optional demo data so the schedule isn't empty on first load.
--
-- NOT applied by the deploy. `supabase db push` ignores seed.sql; it only runs on
-- `supabase db reset` (local) or with an explicit `--include-seed` flag, neither
-- of which CI uses. Run this manually in the Supabase SQL editor if you want it.
--
-- Idempotent (fixed ids + ON CONFLICT), so re-running is a no-op against existing rows.

insert into public.tasks (id, title, estimate_minutes)
values ('00000000-0000-0000-0000-000000000001', 'Write the Kairos design doc', 60)
on conflict (id) do nothing;

insert into public.scheduled_blocks (id, task_id, source, start_utc, end_utc)
values (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-000000000001',
  'kairos',
  date_trunc('day', now()) + interval '9 hours',
  date_trunc('day', now()) + interval '10 hours'
)
on conflict (id) do nothing;
