-- ─────────────────────────────────────────────────────────────────────────────
-- Per-calendar grid visibility default (`calendars.show_on_grid`).
--
-- A lighter sibling of `enabled`. Disabling a calendar stops sync and deletes its
-- events; this flag keeps the calendar synced and counted as busy (free_slots
-- still subtracts its meetings) but hides its blocks from the rendered day / week
-- / month grid. Lets the user declutter a noisy work calendar by default without
-- detaching it. Defaults to true, so every existing calendar keeps showing.
--
-- Idempotent: safe to re-run via `supabase db push` or the SQL editor.
-- Non-destructive: only adds a column with a default; touches no existing data.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.calendars
  add column if not exists show_on_grid boolean not null default true;
