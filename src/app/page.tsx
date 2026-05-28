import { cookies } from "next/headers";
import { DateToolbar } from "@/components/DateToolbar";
import { DayColumn } from "@/components/DayColumn";
import { WeekColumns, type WeekDay } from "@/components/WeekColumns";
import { getBlocksInRange } from "@/server/schedule";
import { getFreeSlots } from "@/server/freeslots";
import {
  addDays,
  dayWindow,
  mondayOf,
  normalizeDate,
  todayInTz,
  weekDates,
  weekWindow,
} from "@/lib/time";
import {
  DEFAULT_TZ,
  TZ_COOKIE,
  isValidTimeZone,
  zonedDayStartUtc,
} from "@/lib/timezone";
import type { FreeSlot, ScheduledBlock } from "@/lib/types";

// Always render on request — the page reads ?date / ?view + cookie + live DB data.
export const dynamic = "force-dynamic";

type View = "day" | "week";

function parseView(input: string | undefined | null): View {
  return input === "week" ? "week" : "day";
}

async function resolveTz(): Promise<string> {
  const jar = await cookies();
  const raw = jar.get(TZ_COOKIE)?.value;
  // Decode defensively — historical cookies may carry the URL-encoded form
  // (e.g. "Asia%2FKarachi") from an earlier build that called encodeURIComponent.
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

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const { date: dateParam, view: viewParam } = await searchParams;
  const tz = await resolveTz();
  const date = normalizeDate(dateParam, tz);
  const view = parseView(viewParam);
  const today = todayInTz(tz);
  // Day mode: "today" means this date is today. Week mode: "today" means this week contains today.
  const isToday = view === "day" ? date === today : mondayOf(date) === mondayOf(today);

  return (
    <div className={view === "week" ? "mx-auto max-w-7xl" : "mx-auto max-w-3xl"}>
      <DateToolbar date={date} isToday={isToday} view={view} tz={tz} />
      {view === "week" ? <WeekView date={date} tz={tz} /> : <DayView date={date} tz={tz} />}
    </div>
  );
}

async function DayView({ date, tz }: { date: string; tz: string }) {
  const today = todayInTz(tz);
  const isToday = date === today;
  const isPast = date < today;
  const { startUtc, endUtc } = dayWindow(date, tz);

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

async function WeekView({ date, tz }: { date: string; tz: string }) {
  const today = todayInTz(tz);
  const dates = weekDates(date);
  const { startUtc, endUtc } = weekWindow(date, tz);

  // One ranged blocks query + WEEK_DAYS parallel per-day free-slot queries.
  const dayWindows = dates.map((d) => {
    const start = zonedDayStartUtc(d, tz);
    const end = zonedDayStartUtc(addDays(d, 1), tz);
    return { date: d, startUtc: start, endUtc: end };
  });

  const [blocksRes, freeResults] = await Promise.all([
    Promise.allSettled([getBlocksInRange(startUtc, endUtc)]).then((r) => r[0]),
    Promise.allSettled(dayWindows.map((w) => getFreeSlots(w.startUtc, w.endUtc, 5))),
  ]);

  const allBlocks: ScheduledBlock[] = blocksRes.status === "fulfilled" ? blocksRes.value : [];

  const days: WeekDay[] = dayWindows.map((w, i) => {
    const wStartMs = new Date(w.startUtc).getTime();
    const wEndMs = new Date(w.endUtc).getTime();
    const dayBlocks = allBlocks.filter((b) => {
      const bs = new Date(b.startUtc).getTime();
      return bs >= wStartMs && bs < wEndMs;
    });
    const freeRes = freeResults[i];
    const freeSlots: FreeSlot[] = freeRes && freeRes.status === "fulfilled" ? freeRes.value : [];
    return {
      date: w.date,
      dayStartUtc: w.startUtc,
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
      <WeekColumns days={days} today={today} />
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
