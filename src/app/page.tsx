import { DateToolbar } from "@/components/DateToolbar";
import { DayColumn } from "@/components/DayColumn";
import { WeekColumns, type WeekDay } from "@/components/WeekColumns";
import { getBlocksInRange } from "@/server/schedule";
import { getFreeSlots } from "@/server/freeslots";
import {
  dayWindowUtc,
  normalizeDate,
  todayUtc,
  weekDates,
  weekWindowUtc,
} from "@/lib/time";
import type { FreeSlot, ScheduledBlock } from "@/lib/types";

// Always render on request — the page reads ?date / ?view and live DB data.
export const dynamic = "force-dynamic";

type View = "day" | "week";

function parseView(input: string | undefined | null): View {
  return input === "week" ? "week" : "day";
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const { date: dateParam, view: viewParam } = await searchParams;
  const date = normalizeDate(dateParam);
  const view = parseView(viewParam);
  const isToday = date === todayUtc();

  return (
    <div className={view === "week" ? "mx-auto max-w-7xl" : "mx-auto max-w-3xl"}>
      <DateToolbar date={date} isToday={isToday} view={view} />
      {view === "week" ? <WeekView date={date} /> : <DayView date={date} />}
    </div>
  );
}

async function DayView({ date }: { date: string }) {
  const today = todayUtc();
  const isToday = date === today;
  const isPast = date < today;
  const { startUtc, endUtc } = dayWindowUtc(date);

  let blocks: ScheduledBlock[] = [];
  let freeSlots: FreeSlot[] = [];

  const [blocksRes, freeRes] = await Promise.allSettled([
    getBlocksInRange(startUtc, endUtc),
    getFreeSlots(startUtc, endUtc, 5),
  ]);
  if (blocksRes.status === "fulfilled") blocks = blocksRes.value;
  if (freeRes.status === "fulfilled") freeSlots = freeRes.value;

  const errors: string[] = [];
  if (blocksRes.status === "rejected") errors.push(`schedule · ${errMsg(blocksRes.reason)}`);
  if (freeRes.status === "rejected") errors.push(`free slots · ${errMsg(freeRes.reason)}`);

  return (
    <>
      <LoadErrorNotice errors={errors} />
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

async function WeekView({ date }: { date: string }) {
  const dates = weekDates(date);
  const { startUtc, endUtc } = weekWindowUtc(date);

  // One ranged blocks query + WEEK_DAYS parallel per-day free-slot queries.
  const [blocksRes, freeResults] = await Promise.all([
    Promise.allSettled([getBlocksInRange(startUtc, endUtc)]).then((r) => r[0]),
    Promise.allSettled(
      dates.map((d) => {
        const window = dayWindowUtc(d);
        return getFreeSlots(window.startUtc, window.endUtc, 5);
      }),
    ),
  ]);

  const allBlocks: ScheduledBlock[] = blocksRes.status === "fulfilled" ? blocksRes.value : [];

  const days: WeekDay[] = dates.map((d, i) => {
    const window = dayWindowUtc(d);
    const dayBlocks = allBlocks.filter((b) => b.startUtc.slice(0, 10) === d);
    const freeRes = freeResults[i];
    const freeSlots: FreeSlot[] = freeRes && freeRes.status === "fulfilled" ? freeRes.value : [];
    return {
      date: d,
      dayStartUtc: window.startUtc,
      blocks: dayBlocks,
      freeSlots,
    };
  });

  const errors: string[] = [];
  if (blocksRes.status === "rejected") errors.push(`schedule · ${errMsg(blocksRes.reason)}`);
  freeResults.forEach((r, i) => {
    if (r.status === "rejected") errors.push(`free slots ${dates[i]} · ${errMsg(r.reason)}`);
  });

  return (
    <>
      <LoadErrorNotice errors={errors} />
      <WeekColumns days={days} />
    </>
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function LoadErrorNotice({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div
      role="alert"
      className="mb-5 rounded-md border border-now/40 bg-now/[0.06] px-4 py-3 text-sm text-ink"
    >
      <p className="font-medium text-now">Couldn&rsquo;t load the schedule.</p>
      <p className="mt-1 text-xs text-ink-muted">{errors.join(" · ")}</p>
      <p className="mt-1.5 text-[11px] text-ink-faint">
        Set <span className="num">SUPABASE_URL</span> and{" "}
        <span className="num">SUPABASE_SERVICE_ROLE_KEY</span>, apply the migration.
      </p>
    </div>
  );
}

