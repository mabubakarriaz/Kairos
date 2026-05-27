import "server-only";
import { getSupabase } from "@/lib/supabase";

type Result = { ok: true } | { ok: false; error: string };

interface CreateTaskInput {
  title: string;
  estimateMinutes: number | null;
  startUtc: string;
  endUtc: string;
}

/**
 * Create a task and schedule it in one step (the "add a task with a time range"
 * use case). If the block can't be placed (e.g. it overlaps another), the orphan
 * task is rolled back so we don't leave dangling rows.
 */
export async function createTaskWithBlock(input: CreateTaskInput): Promise<Result> {
  const supabase = getSupabase();

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .insert({ title: input.title, estimate_minutes: input.estimateMinutes ?? 30 })
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
