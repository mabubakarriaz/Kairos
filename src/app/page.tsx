import { DateToolbar } from "@/components/DateToolbar";
import { DayColumn } from "@/components/DayColumn";
import { AddTaskForm } from "@/components/AddTaskForm";
import { FreeSlotsPanel } from "@/components/FreeSlotsPanel";
import { getBlocksInRange } from "@/server/schedule";
import { getFreeSlots } from "@/server/freeslots";
import { dayWindowUtc, normalizeDate, todayUtc } from "@/lib/time";
import type { FreeSlot, ScheduledBlock } from "@/lib/types";

// Always render on request — the page reads ?date and live DB data.
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: dateParam } = await searchParams;
  const date = normalizeDate(dateParam);
  const isToday = date === todayUtc();
  const { startUtc, endUtc } = dayWindowUtc(date);

  let blocks: ScheduledBlock[] = [];
  let freeSlots: FreeSlot[] = [];
  let loadError: string | null = null;

  try {
    [blocks, freeSlots] = await Promise.all([
      getBlocksInRange(startUtc, endUtc),
      getFreeSlots(startUtc, endUtc, 5),
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load the schedule.";
  }

  return (
    <div className="space-y-6">
      <DateToolbar date={date} isToday={isToday} />

      {loadError && (
        <div className="card border-now/40 bg-now/5 p-4 text-sm text-ink">
          <p className="font-semibold text-now">Couldn’t load the schedule.</p>
          <p className="mt-1 text-ink-muted">{loadError}</p>
          <p className="mt-2 text-xs text-ink-faint">
            Set <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> and apply the migration — see{" "}
            <code>docs/SUPABASE_SETUP.md</code>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="scroll-area max-h-[80vh] overflow-y-auto pr-1">
          <DayColumn dayStartUtc={startUtc} blocks={blocks} freeSlots={freeSlots} isToday={isToday} />
        </section>

        <aside className="space-y-5">
          <AddTaskForm date={date} />
          <FreeSlotsPanel slots={freeSlots} />
          <p className="px-1 text-xs leading-relaxed text-ink-faint">
            Drag a blue block to reschedule it; hover to delete. All times are UTC.
          </p>
        </aside>
      </div>
    </div>
  );
}
