# Migrations — the safety contract

Production data must survive every deploy. Every file in this directory is run
by `supabase db push` in [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml),
against the **live** database. There is no staging Supabase, no backup snapshot
on the free tier, and no undo.

Before you add a file here, read this whole document.

---

## 1. The contract every migration must satisfy

1. **Idempotent.** Running the file twice on the same database must be a no-op.
   Use `create table if not exists`, `create index if not exists`,
   `create or replace function`, `alter table … add column if not exists`. The
   CLI tracks applied migrations in `supabase_migrations.schema_migrations`, but
   that tracking can drift (manual SQL editor runs, project restores, branch
   resets) — idempotency is the belt-and-suspenders that keeps a re-run safe.

2. **Non-destructive by default.** A migration must never reach existing rows.
   The CI `Guard against destructive SQL` step refuses to deploy any migration
   that contains `DROP TABLE`, `DROP SCHEMA`, `DROP FUNCTION`, `DROP TYPE`,
   `TRUNCATE`, `DELETE FROM`, or `ALTER TABLE … DROP COLUMN/CONSTRAINT` unless
   the file opts in (see §3).

3. **Forward-only.** No file in `supabase/migrations/` is ever edited or deleted
   after it ships. If you need to change a deployed migration, write a new one
   that performs the change.

4. **Timestamp-ordered filenames.** `YYYYMMDDhhmmss_short_description.sql`. The
   CLI applies them in lexicographic order, so the timestamp prefix matters.

5. **One purpose per file.** A migration that adds a column should not also
   touch unrelated tables. If something goes wrong it is far easier to reason
   about a small file.

---

## 2. The template

Copy this into a new file `supabase/migrations/<timestamp>_<slug>.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- <what this migration does, in one sentence>
--
-- <why — the business reason, the constraint, the bug it fixes — anything a
--  future reader needs to judge whether the change is still load-bearing>
--
-- Idempotent: safe to re-run via `supabase db push` or the SQL editor.
-- Non-destructive: does not touch existing rows.
-- ─────────────────────────────────────────────────────────────────────────────

-- Example: add a new column.
alter table public.tasks
  add column if not exists priority integer not null default 0
  check (priority >= 0);

-- Example: add a new index.
create index if not exists tasks_priority_idx on public.tasks (priority);

-- Example: replace (or first-time create) a function.
create or replace function public.example()
returns void
language sql
stable
security invoker
as $$ select 1; $$;
```

---

## 3. When you genuinely must run destructive SQL

Some changes are unavoidably destructive (a deprecated column has to go, a
mis-typed enum needs to be replaced). To get past the CI guard:

1. Confirm in a Supabase **manual SQL editor dry-run on the live DB** that the
   migration does what you expect on real data.
2. Take a backup first. On a paid plan use the Supabase dashboard's
   point-in-time backup; on free tier, manually `pg_dump` the affected tables
   into a gist or local file.
3. Add this line to the top of the migration (after the header comment):

   ```sql
   -- SAFETY: destructive (reason: <one-line justification, including the backup you took>)
   ```

The guard parses that line literally — the prefix `-- SAFETY: destructive` is
what unlocks the deploy. The reason is required for future readers; the CI does
not check its contents.

---

## 4. Data migrations (changing existing rows, not just schema)

If the migration needs to **rewrite or backfill data** (not just change schema):

1. Make the SQL idempotent: use `update … where <not-already-migrated>` or
   `insert … on conflict do nothing` so re-running is a no-op.
2. Do not include the data change inside a `create table` block — by the time
   the table exists on a fresh DB there is nothing to migrate.
3. For column renames or splits, do it in **two deploys**:
   - **Deploy A:** add the new column, backfill it, leave the old column
     untouched. App code can read either.
   - **Deploy B (later):** drop the old column. This one needs the
     `-- SAFETY: destructive` opt-in.

   The two-step pattern lets you roll back Deploy A without data loss.

---

## 5. Running migrations

You don't run them yourself in normal operation — every push to `main` runs
`supabase db push` from CI. To trigger a deploy without a code change, use the
**Run workflow** button on the **Deploy** action.

To preview locally before pushing:

```bash
supabase link --project-ref <ref>   # one-time
supabase db push --dry-run --linked # prints which files would apply, runs nothing
```

If you need to re-apply a file by hand (e.g. you ran it in the SQL editor and
want the CLI's migration history to reflect that), use:

```bash
supabase migration repair --status applied <timestamp>
```

Never run `supabase db reset` against production. It drops every table.

---

## 6. The currently-applied set

| File | Purpose |
|---|---|
| `20260527000000_initial_schema.sql` | `tasks`, `scheduled_blocks`, the `EXCLUDE` no-overlap constraint, `free_slots()` function, RLS on. |
| `20260528000000_checkpoints.sql` | `checkpoints` + `checkpoint_rules` for effective-dated day-dividers, `checkpoints_for_date()` function. |
| `20260528010000_auth_lockout.sql` | `auth_lockout` table for the password-gate brute-force lockout. |
| `20260528020000_recurrence.sql` | `series_id`/`recurrence_kind`/`recurrence_interval_days` on `tasks`, plus `create_task_series()` and `delete_block_series_from()` RPCs. |
| `20260531000000_label_budgets.sql` | `labels` registry (slug PK + optional `budget_hours`/`budget_period` pair) for time-allocation budgets, plus the `label_usage()` per-label aggregation function. RLS on. |

All five are idempotent and non-destructive.
