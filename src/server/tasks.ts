import "server-only";
import { getSupabase } from "@/lib/supabase";
import { sanitizeLabels } from "@/lib/labels";

type Result = { ok: true } | { ok: false; error: string };

interface CreateTaskInput {
  title: string;
  estimateMinutes: number | null;
  startUtc: string;
  endUtc: string;
  tags: string[];
}

/**
 * Create a task and schedule it in one step (the "add a task with a time range"
 * use case). If the block can't be placed (e.g. it overlaps another), the orphan
 * task is rolled back so we don't leave dangling rows.
 */
export async function createTaskWithBlock(input: CreateTaskInput): Promise<Result> {
  const supabase = getSupabase();
  const tags = sanitizeLabels(input.tags);

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .insert({ title: input.title, estimate_minutes: input.estimateMinutes ?? 30, tags })
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
