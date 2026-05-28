"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createTaskWithBlock } from "@/server/tasks";
import {
  deleteBlock,
  deleteBlockSeriesFrom,
  editBlock,
  rescheduleBlock,
} from "@/server/schedule";
import {
  createCheckpoint,
  deleteCheckpoint,
  updateCheckpoint,
} from "@/server/checkpoints";
import { isoAt } from "@/lib/time";
import { parseLabelsInput } from "@/lib/labels";
import type { RecurrenceKind, RecurrenceSpec } from "@/lib/types";
import { DEFAULT_TZ, TZ_COOKIE, isValidTimeZone } from "@/lib/timezone";

async function activeTz(): Promise<string> {
  const jar = await cookies();
  const raw = jar.get(TZ_COOKIE)?.value;
  const decoded = raw ? safeDecode(raw) : undefined;
  return decoded && isValidTimeZone(decoded) ? decoded : DEFAULT_TZ;
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const TIME = /^\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const VALID_RECURRENCE_KINDS: RecurrenceKind[] = ["daily", "weekdays", "weekly", "interval"];

function parseRecurrence(formData: FormData): { spec: RecurrenceSpec | null; error?: string } {
  const raw = String(formData.get("recurrence") ?? "").trim();
  if (!raw || raw === "none") return { spec: null };
  if (!(VALID_RECURRENCE_KINDS as string[]).includes(raw)) {
    return { spec: null, error: "Unknown recurrence." };
  }
  const kind = raw as RecurrenceKind;
  if (kind !== "interval") return { spec: { kind } };

  const intRaw = String(formData.get("recurrenceIntervalDays") ?? "").trim();
  const n = Number(intRaw);
  if (!Number.isFinite(n) || n < 2 || n > 30) {
    return { spec: null, error: "Repeat every 2 to 30 days." };
  }
  return { spec: { kind, intervalDays: Math.floor(n) } };
}

/** Create a task and place it on the schedule. Used by the add-task form (useActionState). */
export async function addTaskAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const estimateRaw = String(formData.get("estimateMinutes") ?? "").trim();
  const labelsRaw = String(formData.get("labels") ?? "");

  if (!title) return { ok: false, error: "Title is required." };
  if (!DATE.test(date)) return { ok: false, error: "Invalid date." };
  if (!TIME.test(startTime) || !TIME.test(endTime)) return { ok: false, error: "Start and end times are required." };

  const tz = await activeTz();
  const startUtc = isoAt(date, startTime, tz);
  const endUtc = isoAt(date, endTime, tz);
  if (new Date(endUtc) <= new Date(startUtc)) return { ok: false, error: "End time must be after the start time." };

  let estimate: number | null = null;
  if (estimateRaw) {
    estimate = Number(estimateRaw);
    if (!Number.isFinite(estimate) || estimate < 1) return { ok: false, error: "Estimate must be a positive number." };
  }

  const tags = parseLabelsInput(labelsRaw);

  const { spec: recurrence, error: recurrenceErr } = parseRecurrence(formData);
  if (recurrenceErr) return { ok: false, error: recurrenceErr };

  const result = await createTaskWithBlock({
    title,
    estimateMinutes: estimate,
    startUtc,
    endUtc,
    tags,
    recurrence,
  });
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

/**
 * Remove a block from the schedule. `scope` is honored only for blocks that
 * belong to a recurring series:
 *   - "occurrence" (default): remove just this one block.
 *   - "future":               remove this block + every later occurrence in
 *                             the series; tasks are deleted so no orphans linger.
 */
export async function deleteBlockAction(
  blockId: string,
  scope: "occurrence" | "future" = "occurrence",
): Promise<ActionResult> {
  if (!blockId) return { ok: false, error: "Missing block id." };

  const result =
    scope === "future" ? await deleteBlockSeriesFrom(blockId) : await deleteBlock(blockId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/");
  return { ok: true };
}

const CHECKPOINT_LABEL_MAX = 60;

function normalizeCheckpointLabel(raw: string): { label: string; error?: string } {
  const label = raw.trim().replace(/\s+/g, " ");
  if (!label) return { label, error: "Label is required." };
  if (label.length > CHECKPOINT_LABEL_MAX) {
    return { label, error: "Label is too long." };
  }
  return { label };
}

/** Create a new checkpoint, effective from the given date forward. */
export async function addCheckpointAction(input: {
  label: string;
  at: string;
  date: string;
}): Promise<ActionResult> {
  const { label, error: labelErr } = normalizeCheckpointLabel(input.label);
  if (labelErr) return { ok: false, error: labelErr };
  if (!TIME.test(input.at)) return { ok: false, error: "Use HH:MM." };
  if (!DATE.test(input.date)) return { ok: false, error: "Invalid date." };

  const res = await createCheckpoint({ label, at: input.at, effectiveFrom: input.date });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/");
  return { ok: true };
}

/** Edit a checkpoint from `date` onwards (this and all future occurrences). */
export async function updateCheckpointAction(input: {
  id: string;
  label: string;
  at: string;
  date: string;
}): Promise<ActionResult> {
  if (!input.id) return { ok: false, error: "Missing checkpoint id." };
  const { label, error: labelErr } = normalizeCheckpointLabel(input.label);
  if (labelErr) return { ok: false, error: labelErr };
  if (!TIME.test(input.at)) return { ok: false, error: "Use HH:MM." };
  if (!DATE.test(input.date)) return { ok: false, error: "Invalid date." };

  const res = await updateCheckpoint({
    id: input.id,
    label,
    at: input.at,
    effectiveFrom: input.date,
  });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/");
  return { ok: true };
}

/** Hide a checkpoint from `date` onwards (earlier days keep the historical line). */
export async function deleteCheckpointAction(input: {
  id: string;
  date: string;
}): Promise<ActionResult> {
  if (!input.id) return { ok: false, error: "Missing checkpoint id." };
  if (!DATE.test(input.date)) return { ok: false, error: "Invalid date." };

  const res = await deleteCheckpoint({ id: input.id, effectiveFrom: input.date });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/");
  return { ok: true };
}

/** Edit the task attached to a Kairos block — title and labels in one shot. */
export async function editBlockAction(
  blockId: string,
  title: string,
  labelsRaw: string,
): Promise<ActionResult> {
  if (!blockId) return { ok: false, error: "Missing block id." };
  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "Title is required." };
  if (trimmed.length > 140) return { ok: false, error: "Title is too long." };

  const tags = parseLabelsInput(labelsRaw);

  const result = await editBlock(blockId, { title: trimmed, tags });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/");
  return { ok: true };
}
