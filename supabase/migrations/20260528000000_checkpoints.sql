-- ─────────────────────────────────────────────────────────────────────────────
-- Checkpoints — scalar day-dividers (single moment + label) rendered as thin
-- hairlines across the day grid. Distinct from time blocks (which have duration).
--
-- Effective-dated daily: each checkpoint has a history of rules (`at`, `from`).
-- For a given day, the active rule is the most recent one with effective_from <= D.
-- Editing a checkpoint inserts a new rule at the edit date → "this and future"
-- semantics for free, past days keep their historical time. A null `at` rule is
-- a tombstone (the checkpoint stops appearing from that date forward).
--
-- Idempotent: safe to re-run via `supabase db push` or the SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.checkpoints (
  id         uuid primary key default gen_random_uuid(),
  label      text not null check (length(btrim(label)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.checkpoint_rules (
  id              uuid primary key default gen_random_uuid(),
  checkpoint_id   uuid not null references public.checkpoints(id) on delete cascade,
  at              time,                          -- null = tombstone
  effective_from  date not null,
  created_at      timestamptz not null default now()
);

create unique index if not exists checkpoint_rules_unique_idx
  on public.checkpoint_rules (checkpoint_id, effective_from);

create index if not exists checkpoint_rules_lookup_idx
  on public.checkpoint_rules (checkpoint_id, effective_from desc);

-- Resolve every checkpoint to its currently-active time on a given calendar date.
-- For each checkpoint, pick the latest rule with effective_from <= D. Tombstones
-- (at is null) hide the checkpoint. Returns one row per visible checkpoint.
create or replace function public.checkpoints_for_date(d date)
returns table (id uuid, label text, at time)
language sql
stable
security invoker
as $$
  select c.id, c.label, r.at
  from public.checkpoints c
  cross join lateral (
    select cr.at
    from public.checkpoint_rules cr
    where cr.checkpoint_id = c.id and cr.effective_from <= d
    order by cr.effective_from desc
    limit 1
  ) r
  where r.at is not null
  order by r.at;
$$;

alter table public.checkpoints       enable row level security;
alter table public.checkpoint_rules  enable row level security;
