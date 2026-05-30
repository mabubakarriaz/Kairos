import "server-only";
import { getSupabase } from "@/lib/supabase";
import { isBudgetPeriod } from "@/lib/budgets";
import type { BudgetPeriod, Label } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };

interface LabelRow {
  slug: string;
  budget_hours: number | string | null;
  budget_period: string | null;
}

function toLabel(row: LabelRow): Label {
  const hours = row.budget_hours == null ? null : Number(row.budget_hours);
  const period =
    row.budget_period && isBudgetPeriod(row.budget_period) ? row.budget_period : null;
  // Defensive: the DB pair-check guarantees both-or-neither, but a stray half
  // shouldn't crash the page — drop a lone value rather than render a bad meter.
  if (hours == null || period == null) {
    return { slug: row.slug, budgetHours: null, budgetPeriod: null };
  }
  return { slug: row.slug, budgetHours: hours, budgetPeriod: period };
}

/** Every registered label, slug-sorted. Tracked (budgeted) ones carry their pair. */
export async function listLabels(): Promise<Label[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("labels")
    .select("slug, budget_hours, budget_period")
    .order("slug", { ascending: true });
  if (error) throw new Error(`Failed to load labels: ${error.message}`);
  return (data as LabelRow[] | null ?? []).map(toLabel);
}

/**
 * Labels that exist on tasks but aren't in the registry yet. These are the
 * free-text tags the user has been typing; settings offers to promote them.
 * Capped and slug-sorted.
 */
export async function listUnregisteredLabels(known: Set<string>, limit = 40): Promise<string[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select("tags")
    .limit(500);
  if (error) throw new Error(`Failed to scan task labels: ${error.message}`);

  const seen = new Set<string>();
  for (const row of (data as { tags: string[] | null }[] | null ?? [])) {
    for (const raw of row.tags ?? []) {
      const slug = String(raw).toLowerCase();
      if (slug && !known.has(slug)) seen.add(slug);
    }
  }
  return Array.from(seen).sort().slice(0, limit);
}

/** Per-label scheduled minutes in [fromUtc, toUtc), via the label_usage() RPC. */
export async function getLabelUsage(fromUtc: string, toUtc: string): Promise<Map<string, number>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("label_usage", { from_utc: fromUtc, to_utc: toUtc });
  if (error) throw new Error(`Failed to compute label usage: ${error.message}`);
  const out = new Map<string, number>();
  for (const r of (data as { label: string; used_minutes: number | string }[] | null ?? [])) {
    out.set(r.label, Number(r.used_minutes) || 0);
  }
  return out;
}

/** Register a label so it can carry a budget. No-op if it already exists. */
export async function registerLabel(slug: string): Promise<Result> {
  const supabase = getSupabase();
  const { error } = await supabase.from("labels").upsert({ slug }, { onConflict: "slug", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Remove a label from the registry. Leaves the free-text tag on tasks intact. */
export async function removeLabel(slug: string): Promise<Result> {
  const supabase = getSupabase();
  const { error } = await supabase.from("labels").delete().eq("slug", slug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Set (or replace) a label's budget. Registers the label first if needed. */
export async function setBudget(
  slug: string,
  hours: number,
  period: BudgetPeriod,
): Promise<Result> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("labels")
    .upsert(
      { slug, budget_hours: hours, budget_period: period },
      { onConflict: "slug" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Clear a label's budget but keep it registered (tracked → untracked). */
export async function clearBudget(slug: string): Promise<Result> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("labels")
    .update({ budget_hours: null, budget_period: null })
    .eq("slug", slug);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
