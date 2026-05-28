import "server-only";
import { getSupabase } from "@/lib/supabase";
import type { Checkpoint } from "@/lib/types";

type Result = { ok: true; id?: string } | { ok: false; error: string };

interface ForDateRow {
  id: string;
  label: string;
  at: string; // "HH:MM:SS" from Postgres time
}

/** All visible checkpoints on a calendar date, resolved through their effective-dated rules. */
export async function getCheckpointsForDate(date: string): Promise<Checkpoint[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("checkpoints_for_date", { d: date });
  if (error) throw new Error(`Failed to load checkpoints: ${error.message}`);
  return (data as ForDateRow[] | null ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    at: row.at.slice(0, 5), // "HH:MM:SS" → "HH:MM"
  }));
}

/**
 * Create a new checkpoint with its first rule. The rule's effective_from is the
 * date the user added it on, so the checkpoint appears from that day forward
 * (and only that day forward — earlier days don't see it).
 */
export async function createCheckpoint(input: {
  label: string;
  at: string;            // "HH:MM"
  effectiveFrom: string; // "YYYY-MM-DD"
}): Promise<Result> {
  const supabase = getSupabase();

  const { data: cp, error: cpErr } = await supabase
    .from("checkpoints")
    .insert({ label: input.label })
    .select("id")
    .single();

  if (cpErr || !cp) return { ok: false, error: cpErr?.message ?? "Could not create checkpoint." };

  const { error: ruleErr } = await supabase
    .from("checkpoint_rules")
    .insert({
      checkpoint_id: cp.id,
      at: `${input.at}:00`,
      effective_from: input.effectiveFrom,
    });

  if (ruleErr) {
    await supabase.from("checkpoints").delete().eq("id", cp.id); // roll back the orphan
    return { ok: false, error: ruleErr.message };
  }

  return { ok: true, id: cp.id };
}

/**
 * Edit a checkpoint with "this and future" semantics: insert a new rule
 * effective from the edit date. Past days keep their previous rule because
 * they resolve to the most-recent rule with effective_from <= D. The label
 * is updated globally (renames don't fork history; if you want a per-date
 * rename, delete this checkpoint and create a new one).
 *
 * If a rule already exists for this checkpoint on the same effective_from
 * date, upsert it (re-editing today simply replaces today's rule).
 */
export async function updateCheckpoint(input: {
  id: string;
  label: string;
  at: string;            // "HH:MM"
  effectiveFrom: string; // "YYYY-MM-DD"
}): Promise<Result> {
  const supabase = getSupabase();

  const { error: labelErr } = await supabase
    .from("checkpoints")
    .update({ label: input.label })
    .eq("id", input.id);
  if (labelErr) return { ok: false, error: labelErr.message };

  const { error: ruleErr } = await supabase
    .from("checkpoint_rules")
    .upsert(
      {
        checkpoint_id: input.id,
        at: `${input.at}:00`,
        effective_from: input.effectiveFrom,
      },
      { onConflict: "checkpoint_id,effective_from" },
    );
  if (ruleErr) return { ok: false, error: ruleErr.message };

  return { ok: true };
}

/**
 * Hide a checkpoint from a date forward. Insert a tombstone rule (`at` is null).
 * Earlier days continue to resolve to their last-known time, preserving history.
 */
export async function deleteCheckpoint(input: {
  id: string;
  effectiveFrom: string;
}): Promise<Result> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("checkpoint_rules")
    .upsert(
      {
        checkpoint_id: input.id,
        at: null,
        effective_from: input.effectiveFrom,
      },
      { onConflict: "checkpoint_id,effective_from" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
