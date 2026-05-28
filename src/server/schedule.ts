import "server-only";
import { getSupabase } from "@/lib/supabase";
import type { RecurrenceKind, ScheduledBlock } from "@/lib/types";

type TaskJoin = {
  title: string;
  tags: string[] | null;
  series_id: string | null;
  recurrence_kind: RecurrenceKind | null;
};

interface BlockRow {
  id: string;
  task_id: string | null;
  source: "kairos" | "gcal";
  start_utc: string;
  end_utc: string;
  tasks: TaskJoin | TaskJoin[] | null;
}

function taskOf(row: BlockRow): TaskJoin | null {
  return Array.isArray(row.tasks) ? row.tasks[0] ?? null : row.tasks;
}

function titleOf(row: BlockRow): string {
  if (row.source === "gcal") return "(busy)";
  return taskOf(row)?.title ?? "Task";
}

function tagsOf(row: BlockRow): string[] {
  if (row.source === "gcal") return [];
  return taskOf(row)?.tags ?? [];
}

/** Blocks overlapping the half-open window [startUtc, endUtc), ordered by start. */
export async function getBlocksInRange(startUtc: string, endUtc: string): Promise<ScheduledBlock[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("scheduled_blocks")
    .select(
      "id, task_id, source, start_utc, end_utc, tasks(title, tags, series_id, recurrence_kind)",
    )
    .lt("start_utc", endUtc)
    .gt("end_utc", startUtc)
    .order("start_utc", { ascending: true });

  if (error) throw new Error(`Failed to load schedule: ${error.message}`);

  return (data as BlockRow[] | null ?? []).map((row) => {
    const t = taskOf(row);
    return {
      id: row.id,
      taskId: row.task_id,
      source: row.source,
      startUtc: row.start_utc,
      endUtc: row.end_utc,
      title: titleOf(row),
      tags: tagsOf(row),
      seriesId: row.source === "kairos" ? t?.series_id ?? null : null,
      recurrenceKind: row.source === "kairos" ? t?.recurrence_kind ?? null : null,
    };
  });
}

type Result = { ok: true } | { ok: false; error: string };

const isOverlap = (code: string | undefined, message: string): boolean =>
  code === "23P01" || /overlap|exclusion/i.test(message);

/** Move a Kairos block to a new UTC range. Gcal blocks are read-only. */
export async function rescheduleBlock(blockId: string, startUtc: string, endUtc: string): Promise<Result> {
  const supabase = getSupabase();

  const { data: existing, error: fetchErr } = await supabase
    .from("scheduled_blocks")
    .select("id, source")
    .eq("id", blockId)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!existing) return { ok: false, error: "That block no longer exists." };
  if (existing.source !== "kairos") return { ok: false, error: "Google Calendar blocks are read-only." };

  const { error } = await supabase
    .from("scheduled_blocks")
    .update({ start_utc: startUtc, end_utc: endUtc })
    .eq("id", blockId);

  if (error) {
    return { ok: false, error: isOverlap(error.code, error.message) ? "That time overlaps another block." : error.message };
  }
  return { ok: true };
}

/** Remove a Kairos block from the schedule (leaves the underlying task). */
export async function deleteBlock(blockId: string): Promise<Result> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("scheduled_blocks")
    .delete()
    .eq("id", blockId)
    .eq("source", "kairos");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Remove a block and all later occurrences in its recurring series. Delegated
 * to the SQL RPC so the cascade + matching happen in one transaction. For a
 * non-series block this falls back to deleting only that block.
 */
export async function deleteBlockSeriesFrom(blockId: string): Promise<Result> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("delete_block_series_from", { p_block_id: blockId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Edit the task behind a Kairos block — title and/or tags in one statement.
 *  Gcal blocks are read-only. */
export async function editBlock(
  blockId: string,
  patch: { title: string; tags: string[] },
): Promise<Result> {
  const supabase = getSupabase();

  const { data: existing, error: fetchErr } = await supabase
    .from("scheduled_blocks")
    .select("task_id, source")
    .eq("id", blockId)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!existing) return { ok: false, error: "That block no longer exists." };
  if (existing.source !== "kairos" || !existing.task_id) {
    return { ok: false, error: "That block is read-only." };
  }

  const { error } = await supabase
    .from("tasks")
    .update({ title: patch.title, tags: patch.tags })
    .eq("id", existing.task_id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
