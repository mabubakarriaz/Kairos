"use server";

import { revalidatePath } from "next/cache";
import { createTaskWithBlock } from "@/server/tasks";
import { deleteBlock, renameBlock, rescheduleBlock } from "@/server/schedule";
import { isoAt } from "@/lib/time";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const TIME = /^\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Create a task and place it on the schedule. Used by the add-task form (useActionState). */
export async function addTaskAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const estimateRaw = String(formData.get("estimateMinutes") ?? "").trim();

  if (!title) return { ok: false, error: "Title is required." };
  if (!DATE.test(date)) return { ok: false, error: "Invalid date." };
  if (!TIME.test(startTime) || !TIME.test(endTime)) return { ok: false, error: "Start and end times are required." };

  const startUtc = isoAt(date, startTime);
  const endUtc = isoAt(date, endTime);
  if (new Date(endUtc) <= new Date(startUtc)) return { ok: false, error: "End time must be after the start time." };

  let estimate: number | null = null;
  if (estimateRaw) {
    estimate = Number(estimateRaw);
    if (!Number.isFinite(estimate) || estimate < 1) return { ok: false, error: "Estimate must be a positive number." };
  }

  const result = await createTaskWithBlock({ title, estimateMinutes: estimate, startUtc, endUtc });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/");
  return { ok: true };
}

/** Move a block (drag-to-reschedule). Called imperatively from the drag island. */
export async function rescheduleAction(blockId: string, startUtc: string, endUtc: string): Promise<ActionResult> {
  if (!blockId) return { ok: false, error: "Missing block id." };
  if (new Date(endUtc) <= new Date(startUtc)) return { ok: false, error: "End must be after start." };

  const result = await rescheduleBlock(blockId, startUtc, endUtc);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/");
  return { ok: true };
}

/** Remove a block from the schedule. */
export async function deleteBlockAction(blockId: string): Promise<ActionResult> {
  if (!blockId) return { ok: false, error: "Missing block id." };

  const result = await deleteBlock(blockId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/");
  return { ok: true };
}

/** Rename the task attached to a Kairos block. */
export async function renameBlockAction(blockId: string, title: string): Promise<ActionResult> {
  if (!blockId) return { ok: false, error: "Missing block id." };
  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "Title is required." };
  if (trimmed.length > 140) return { ok: false, error: "Title is too long." };

  const result = await renameBlock(blockId, trimmed);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/");
  return { ok: true };
}
