import "server-only";
import { getSupabase } from "@/lib/supabase";
import { sanitizeLabels } from "@/lib/labels";
import type { RecurrenceSpec } from "@/lib/types";

type Result =
  | { ok: true; insertedCount?: number }
  | { ok: false; error: string };

interface CreateTaskInput {
  title: string;
  estimateMinutes: number | null;
  startUtc: string;
  endUtc: string;
  tags: string[];
  recurrence: RecurrenceSpec | null;
}

/** How far ahead to materialise occurrences. Past this, the schedule "doesn't
 * exist yet" — the user can extend by editing or recreating. */
const RECURRENCE_LOOKAHEAD = 60;

/**
 * Create a task and schedule it in one step (the "add a task with a time range"
 * use case). For a recurring task, delegates to the SQL RPC so the loop runs
 * in one transaction. Overlap conflicts on later occurrences are silently
 * skipped — the first occurrence must succeed.
 */
export async function createTaskWithBlock(input: CreateTaskInput): Promise<Result> {
  const supabase = getSupabase();
  const tags = sanitizeLabels(input.tags);
  const estimate = input.estimateMinutes ?? 30;

  if (input.recurrence) {
    const { data, error } = await supabase.rpc("create_task_series", {
      p_title: input.title,
      p_tags: tags,
      p_estimate_minutes: estimate,
      p_start_utc: input.startUtc,
      p_end_utc: input.endUtc,
      p_recurrence_kind: input.recurrence.kind,
      p_interval_days:
        input.recurrence.kind === "interval" ? input.recurrence.intervalDays ?? null : null,
      p_max_occurrences: RECURRENCE_LOOKAHEAD,
    });

    if (error) {
      const overlap = error.code === "23P01" || /overlap|exclusion/i.test(error.message);
      return {
        ok: false,
        error: overlap ? "That time overlaps another block." : error.message,
      };
    }
    // The RPC returns a setof; the first row has the meaningful counts.
    const row = Array.isArray(data) ? data[0] : data;
    const insertedCount: number = row?.inserted_count ?? 0;
    if (insertedCount === 0) return { ok: false, error: "No occurrences could be scheduled." };
    return { ok: true, insertedCount };
  }

  // Single, non-recurring task: keep the original two-insert path so the
  // happy case stays simple and avoids an RPC round-trip.
  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .insert({ title: input.title, estimate_minutes: estimate, tags })
    .select("id")
    .single();

  if (taskErr || !task) return { ok: false, error: taskErr?.message ?? "Could not create the task." };

  const { error: blockErr } = await supabase
    .from("scheduled_blocks")
    .insert({ task_id: task.id, source: "kairos", start_utc: input.startUtc, end_utc: input.endUtc });

  if (blockErr) {
    await supabase.from("tasks").delete().eq("id", task.id); // roll back the orphan
    const overlap = blockErr.code === "23P01" || /overlap|exclusion/i.test(blockErr.message);
    return { ok: false, error: overlap ? "That time overlaps another block." : blockErr.message };
  }

  return { ok: true };
}

/** Most-recently-used label slugs across recent tasks, deduped and capped. */
export async function getRecentTags(limit = 6): Promise<string[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select("tags, created_at")
    .order("created_at", { ascending: false })
    .limit(80);
  if (error || !data) return [];

  const firstSeen = new Map<string, number>();
  for (const row of data as { tags: string[] | null; created_at: string }[]) {
    const ts = new Date(row.created_at).getTime();
    for (const raw of row.tags ?? []) {
      const norm = String(raw).toLowerCase();
      if (norm && !firstSeen.has(norm)) firstSeen.set(norm, ts);
    }
  }
  return Array.from(firstSeen.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => t);
}
