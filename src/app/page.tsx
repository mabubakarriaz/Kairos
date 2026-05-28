import { DateToolbar } from "@/components/DateToolbar";
import { DayColumn } from "@/components/DayColumn";
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
  const isPast = date < todayUtc();
  const { startUtc, endUtc } = dayWindowUtc(date);

  let blocks: ScheduledBlock[] = [];
  let freeSlots: FreeSlot[] = [];

  // Fetch independently so a failure in one doesn't blank the whole page, and so
  // the error notice can name exactly which call failed.
  const [blocksRes, freeRes] = await Promise.allSettled([
    getBlocksInRange(startUtc, endUtc),
    getFreeSlots(startUtc, endUtc, 5),
  ]);
  if (blocksRes.status === "fulfilled") blocks = blocksRes.value;
  if (freeRes.status === "fulfilled") freeSlots = freeRes.value;

  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const errors: string[] = [];
  if (blocksRes.status === "rejected") errors.push(`schedule · ${msg(blocksRes.reason)}`);
  if (freeRes.status === "rejected") errors.push(`free slots · ${msg(freeRes.reason)}`);
  const loadError = errors.length ? errors.join(" · ") : null;

  return (
    <>
      <DateToolbar date={date} isToday={isToday} />

      {loadError && (
        <div
          role="alert"
          className="mb-5 rounded-md border border-now/40 bg-now/[0.06] px-4 py-3 text-sm text-ink"
        >
          <p className="font-medium text-now">Couldn&rsquo;t load the schedule.</p>
          <p className="mt-1 text-xs text-ink-muted">{loadError}</p>
          <p className="mt-1.5 text-[11px] text-ink-faint">
            Set <span className="num">SUPABASE_URL</span> and{" "}
            <span className="num">SUPABASE_SERVICE_ROLE_KEY</span>, apply the migration.
          </p>
        </div>
      )}

      <DayColumn
        date={date}
        dayStartUtc={startUtc}
        blocks={blocks}
        freeSlots={freeSlots}
        isToday={isToday}
        isPast={isPast}
      />
    </>
  );
}
