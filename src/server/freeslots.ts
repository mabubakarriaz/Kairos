import "server-only";
import { getSupabase } from "@/lib/supabase";
import type { FreeSlot } from "@/lib/types";

interface GapRow {
  start_utc: string;
  end_utc: string;
}

/**
 * Open gaps in [fromUtc, toUtc), computed entirely in Postgres by the free_slots()
 * multirange function. The only thing C# (now TS) does is rank — longest gaps first —
 * and take the top N.
 */
export async function getFreeSlots(fromUtc: string, toUtc: string, take = 5): Promise<FreeSlot[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("free_slots", { from_utc: fromUtc, to_utc: toUtc });
  if (error) throw new Error(`Failed to compute free slots: ${error.message}`);

  const slots: FreeSlot[] = (data as GapRow[] | null ?? []).map((r) => ({
    startUtc: r.start_utc,
    endUtc: r.end_utc,
    minutes: (new Date(r.end_utc).getTime() - new Date(r.start_utc).getTime()) / 60_000,
  }));

  return slots.sort((a, b) => b.minutes - a.minutes).slice(0, take);
}
