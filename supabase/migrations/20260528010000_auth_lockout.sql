-- ─────────────────────────────────────────────────────────────────────────────
-- Auth lockout — tracks failed login attempts per client IP for the single-user
-- password gate. After 3 failed attempts the IP is locked for 2 hours. On a
-- successful login the row is deleted (slate wiped clean).
--
-- All access is via the server-only service-role client. RLS stays on with no
-- policies — the browser never reads or writes this table directly.
--
-- Idempotent: safe to re-run via `supabase db push` or the SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.auth_lockout (
  ip            text primary key,
  attempts      int  not null default 0 check (attempts >= 0),
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);

create index if not exists auth_lockout_locked_until_idx
  on public.auth_lockout (locked_until)
  where locked_until is not null;

alter table public.auth_lockout enable row level security;
