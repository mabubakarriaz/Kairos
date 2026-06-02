import { cookies } from "next/headers";
import { DateToolbar } from "@/components/DateToolbar";
import { DayColumn } from "@/components/DayColumn";
import { WeekColumns, type WeekDay } from "@/components/WeekColumns";
import { MonthGrid, type MonthCellData } from "@/components/MonthGrid";
import { getBlocksInRange } from "@/server/schedule";
import { syncCalendarsIfStale } from "@/server/calendar-sync";
import { getFreeSlots } from "@/server/freeslots";
import { getCheckpointsForDate } from "@/server/checkpoints";
import { getRecentTags } from "@/server/tasks";
import {
  addDays,
  computeDayStats,
  dayWindow,
  fiveDayDates,
  fiveDayWindow,
  fmtDuration,
  monthGridDates,
  monthGridWindow,
  normalizeDate,
  todayInTz,
  weekDates,
  weekStartOf,
  weekWindow,
  type WeekStart,
} from "@/lib/time";
import { parseLabelsParam } from "@/lib/labels";
import { WEEK_START_COOKIE, parseWeekStart } from "@/lib/prefs";
import {
  DEFAULT_TZ,
  TZ_COOKIE,
  isValidTimeZone,
  zonedDayStartUtc,
} from "@/lib/timezone";
import type { Checkpoint, FreeSlot, ScheduledBlock } from "@/lib/types";

// Always render on request — the page reads ?date / ?view / ?labels + cookie + live DB data.
export const dynamic = "force-dynamic";

type View = "day" | "5d" | "week" | "month";

function parseView(input: string | undefined | null): View {
  if (input === "week") return "week";
  if (input === "5d") return "5d";
  if (input === "month") return "month";
  return "day";
}

async function resolveTz(): Promise<string> {
  const jar = await cookies();
  const raw = jar.get(TZ_COOKIE)?.value;
  // Decode defensively — historical cookies may carry the URL-encoded form
  // (e.g. "Asia%2FKarachi") from an earlier build that called encodeURIComponent.
  const decoded = raw ? safeDecode(raw) : undefined;
  return decoded && isValidTimeZone(decoded) ? decoded : DEFAULT_TZ;
}

async function resolveWeekStart(): Promise<WeekStart> {
  const jar = await cookies();
  return parseWeekStart(jar.get(WEEK_START_COOKIE)?.value);
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function rangeContainsToday(view: View, date: string, today: string, weekStart: WeekStart): boolean {
  if (view === "day") return date === today;
  if (view === "5d") return today >= date && today < addDays(date, 5);
  if (view === "month") {
    const d = new Date(`${date}T00:00:00.000Z`);
    const t = new Date(`${today}T00:00:00.000Z`);
    return d.getUTCFullYear() === t.getUTCFullYear() && d.getUTCMonth() === t.getUTCMonth();
  }
  return weekStartOf(date, weekStart) === weekStartOf(today, weekStart);
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; labels?: string }>;
}) {
  const { date: dateParam, view: viewParam, labels: labelsParam } = await searchParams;
  const tz = await resolveTz();
  const date = normalizeDate(dateParam, tz);
  const view = parseView(viewParam);
  const today = todayInTz(tz);
  const weekStart = await resolveWeekStart();
  const filterLabels = parseLabelsParam(labelsParam);
  const labelsQuery = filterLabels.join(",");
  const isToday = rangeContainsToday(view, date, today, weekStart);

  // Pull fresh Google events before the view fetches blocks, but only when a
  // calendar has gone stale — a normal load does no network and just reads the DB.
  await syncCalendarsIfStale(tz);

  const widthClass =
    view === "day" ? "max-w-3xl" : view === "month" ? "max-w-6xl" : "max-w-7xl";

  return (
    <div className={`mx-auto flex h-full w-full min-h-0 flex-col ${widthClass}`}>
      <DateToolbar
        date={date}
        isToday={isToday}
        view={view}
        tz={tz}
        labelsQuery={labelsQuery}
      />
      {view === "day" ? (
        <DayView date={date} tz={tz} filterLabels={filterLabels} labelsQuery={labelsQuery} />
      ) : view === "month" ? (
        <MonthView
          date={date}
          tz={tz}
          weekStart={weekStart}
          filterLabels={filterLabels}
          labelsQuery={labelsQuery}
        />
      ) : (
        <MultiDayView
          date={date}
          tz={tz}
          view={view}
          weekStart={weekStart}
          filterLabels={filterLabels}
          labelsQuery={labelsQuery}
        />
      )}
    </div>
  );
}

async function DayView({
  date,
  tz,
  filterLabels,
  labelsQuery,
}: {
  date: string;
  tz: string;
  filterLabels: string[];
  labelsQuery: string;
}) {
  const today = todayInTz(tz);
  const isToday = date === today;
  const isPast = date < today;
  const { startUtc, endUtc } = dayWindow(date, tz);

  let blocks: ScheduledBlock[] = [];
  let freeSlots: FreeSlot[] = [];
  let checkpoints: Checkpoint[] = [];
  let recentTags: string[] = [];

  const [blocksRes, freeRes, cpRes, recentRes] = await Promise.allSettled([
    getBlocksInRange(startUtc, endUtc),
    getFreeSlots(startUtc, endUtc, 5),
    getCheckpointsForDate(date),
    getRecentTags(),
  ]);
  if (blocksRes.status === "fulfilled") blocks = blocksRes.value;
  if (freeRes.status === "fulfilled") freeSlots = freeRes.value;
  if (cpRes.status === "fulfilled") checkpoints = cpRes.value;
  if (recentRes.status === "fulfilled") recentTags = recentRes.value;

  const errors: string[] = [];
  if (blocksRes.status === "rejected") errors.push(`schedule · ${errMsg(blocksRes.reason)}`);
  if (freeRes.status === "rejected") errors.push(`free slots · ${errMsg(freeRes.reason)}`);
  if (cpRes.status === "rejected") errors.push(`checkpoints · ${errMsg(cpRes.reason)}`);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LoadErrorNotice errors={errors} />
      <DayStatsLine blocks={blocks} dayStartUtc={startUtc} isPast={isPast} />
      <DayColumn
        date={date}
        dayStartUtc={startUtc}
        blocks={blocks}
        freeSlots={freeSlots}
        checkpoints={checkpoints}
        isToday={isToday}
        isPast={isPast}
        filterLabels={filterLabels}
        labelsQuery={labelsQuery}
        recentTags={recentTags}
      />
    </div>
  );
}

/**
 * A single typographic line sitting between the date subtitle and the day grid:
 *
 *   4h 30m booked · 19h 30m open   work 2h · home 1h 30m · study 1h
 *
 * No box, no border, no tile. The line is suppressed when nothing is booked
 * (an empty day is signalled by the grid itself). Past days omit "open" — the
 * day is closed; open time is no longer actionable. The per-label segment is
 * capped at 4 entries with `+N` overflow so a heavily-tagged day stays one line.
 */
function DayStatsLine({
  blocks,
  dayStartUtc,
  isPast,
}: {
  blocks: ScheduledBlock[];
  dayStartUtc: string;
  isPast: boolean;
}) {
  const stats = computeDayStats(blocks, dayStartUtc);
  if (stats.bookedMin === 0) return null;

  const TOP = 4;
  const topLabels = stats.byLabel.slice(0, TOP);
  const overflow = Math.max(0, stats.byLabel.length - TOP);

  return (
    <p className="day-stats num" aria-label="Day allocation">
      <span>
        <span className="day-stats-amount">{fmtDuration(stats.bookedMin)}</span>{" "}
        <span className="day-stats-label">booked</span>
      </span>
      {!isPast && (
        <>
          <span className="day-stats-sep" aria-hidden="true">·</span>
          <span>
            <span className="day-stats-amount">{fmtDuration(stats.openMin)}</span>{" "}
            <span className="day-stats-label">open</span>
          </span>
        </>
      )}
      {topLabels.length > 0 && (
        <span className="day-stats-divider" aria-hidden="true" />
      )}
      {topLabels.map((entry, i) => (
        <span key={entry.label}>
          {i > 0 && <span className="day-stats-sep mr-2" aria-hidden="true">·</span>}
          <span className="day-stats-tag">#{entry.label}</span>{" "}
          <span className="day-stats-amount">{fmtDuration(entry.minutes)}</span>
        </span>
      ))}
      {overflow > 0 && (
        <>
          <span className="day-stats-sep" aria-hidden="true">·</span>
          <span className="day-stats-label">+{overflow} more</span>
        </>
      )}
    </p>
  );
}

async function MultiDayView({
  date,
  tz,
  view,
  weekStart,
  filterLabels,
  labelsQuery,
}: {
  date: string;
  tz: string;
  view: "5d" | "week";
  weekStart: WeekStart;
  filterLabels: string[];
  labelsQuery: string;
}) {
  const today = todayInTz(tz);
  const dates = view === "5d" ? fiveDayDates(date) : weekDates(date, weekStart);
  const { startUtc, endUtc } =
    view === "5d" ? fiveDayWindow(date, tz) : weekWindow(date, tz, weekStart);

  const dayWindows = dates.map((d) => {
    const start = zonedDayStartUtc(d, tz);
    const end = zonedDayStartUtc(addDays(d, 1), tz);
    return { date: d, startUtc: start, endUtc: end };
  });

  const [blocksRes, freeResults, cpResults, recentRes] = await Promise.all([
    Promise.allSettled([getBlocksInRange(startUtc, endUtc)]).then((r) => r[0]),
    Promise.allSettled(dayWindows.map((w) => getFreeSlots(w.startUtc, w.endUtc, 5))),
    Promise.allSettled(dayWindows.map((w) => getCheckpointsForDate(w.date))),
    Promise.allSettled([getRecentTags()]).then((r) => r[0]),
  ]);

  const allBlocks: ScheduledBlock[] = blocksRes.status === "fulfilled" ? blocksRes.value : [];
  const recentTags: string[] = recentRes.status === "fulfilled" ? recentRes.value : [];

  const days: WeekDay[] = dayWindows.map((w, i) => {
    const wStartMs = new Date(w.startUtc).getTime();
    const wEndMs = new Date(w.endUtc).getTime();
    const dayBlocks = allBlocks.filter((b) => {
      const bs = new Date(b.startUtc).getTime();
      return bs >= wStartMs && bs < wEndMs;
    });
    const freeRes = freeResults[i];
    const freeSlots: FreeSlot[] = freeRes && freeRes.status === "fulfilled" ? freeRes.value : [];
    const cpRes = cpResults[i];
    const checkpoints: Checkpoint[] = cpRes && cpRes.status === "fulfilled" ? cpRes.value : [];
    return {
      date: w.date,
      dayStartUtc: w.startUtc,
      blocks: dayBlocks,
      freeSlots,
      checkpoints,
    };
  });

  const errors: string[] = [];
  if (blocksRes.status === "rejected") errors.push(`schedule · ${errMsg(blocksRes.reason)}`);
  freeResults.forEach((r, i) => {
    if (r.status === "rejected") errors.push(`free slots ${dates[i]} · ${errMsg(r.reason)}`);
  });
  cpResults.forEach((r, i) => {
    if (r.status === "rejected") errors.push(`checkpoints ${dates[i]} · ${errMsg(r.reason)}`);
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LoadErrorNotice errors={errors} />
      <WeekStatsLine days={days} today={today} />
      <WeekColumns
        days={days}
        today={today}
        filterLabels={filterLabels}
        labelsQuery={labelsQuery}
        recentTags={recentTags}
        view={view}
      />
    </div>
  );
}

function WeekStatsLine({ days, today }: { days: WeekDay[]; today: string }) {
  let booked = 0;
  let openMin = 0;
  for (const d of days) {
    const s = computeDayStats(d.blocks, d.dayStartUtc);
    booked += s.bookedMin;
    if (d.date >= today) openMin += s.openMin;
  }
  if (booked === 0 && openMin === 0) return null;
  return (
    <p className="day-stats num" aria-label="Range allocation">
      <span>
        <span className="day-stats-amount">{fmtDuration(booked)}</span>{" "}
        <span className="day-stats-label">booked</span>
      </span>
      {openMin > 0 && (
        <>
          <span className="day-stats-sep" aria-hidden="true">·</span>
          <span>
            <span className="day-stats-amount">{fmtDuration(openMin)}</span>{" "}
            <span className="day-stats-label">open</span>
          </span>
        </>
      )}
    </p>
  );
}

async function MonthView({
  date,
  tz,
  weekStart,
  filterLabels,
  labelsQuery,
}: {
  date: string;
  tz: string;
  weekStart: WeekStart;
  filterLabels: string[];
  labelsQuery: string;
}) {
  const today = todayInTz(tz);
  const gridDates = monthGridDates(date, weekStart);
  const { startUtc, endUtc } = monthGridWindow(date, tz, weekStart);

  const dayWindows = gridDates.map((d) => {
    const start = zonedDayStartUtc(d, tz);
    const end = zonedDayStartUtc(addDays(d, 1), tz);
    return { date: d, startUtc: start, endUtc: end };
  });

  const blocksRes = await Promise.allSettled([getBlocksInRange(startUtc, endUtc)]).then(
    (r) => r[0],
  );
  const allBlocks: ScheduledBlock[] =
    blocksRes.status === "fulfilled" ? blocksRes.value : [];

  const cells: MonthCellData[] = dayWindows.map((w) => {
    const wStartMs = new Date(w.startUtc).getTime();
    const wEndMs = new Date(w.endUtc).getTime();
    const dayBlocks = allBlocks.filter((b) => {
      const bs = new Date(b.startUtc).getTime();
      return bs >= wStartMs && bs < wEndMs;
    });
    return {
      date: w.date,
      dayStartUtc: w.startUtc,
      blocks: dayBlocks,
    };
  });

  const errors: string[] = [];
  if (blocksRes.status === "rejected") errors.push(`schedule · ${errMsg(blocksRes.reason)}`);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LoadErrorNotice errors={errors} />
      <MonthStatsLine cells={cells} anchorDate={date} today={today} />
      <MonthGrid
        cells={cells}
        anchorDate={date}
        today={today}
        tz={tz}
        weekStart={weekStart}
        labelsQuery={labelsQuery}
        filterLabels={filterLabels}
      />
    </div>
  );
}

function MonthStatsLine({
  cells,
  anchorDate,
  today,
}: {
  cells: MonthCellData[];
  anchorDate: string;
  today: string;
}) {
  const monthDate = new Date(`${anchorDate}T00:00:00.000Z`);
  const month = monthDate.getUTCMonth();
  const year = monthDate.getUTCFullYear();
  let booked = 0;
  let openMin = 0;
  for (const c of cells) {
    const d = new Date(`${c.date}T00:00:00.000Z`);
    if (d.getUTCMonth() !== month || d.getUTCFullYear() !== year) continue;
    const s = computeDayStats(c.blocks, c.dayStartUtc);
    booked += s.bookedMin;
    if (c.date >= today) openMin += s.openMin;
  }
  if (booked === 0 && openMin === 0) return null;
  return (
    <p className="day-stats num" aria-label="Month allocation">
      <span>
        <span className="day-stats-amount">{fmtDuration(booked)}</span>{" "}
        <span className="day-stats-label">booked</span>
      </span>
      {openMin > 0 && (
        <>
          <span className="day-stats-sep" aria-hidden="true">·</span>
          <span>
            <span className="day-stats-amount">{fmtDuration(openMin)}</span>{" "}
            <span className="day-stats-label">open</span>
          </span>
        </>
      )}
    </p>
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function LoadErrorNotice({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  // Quiet Ember text, never a boxed alert (the One-Ember Rule): no fill, no
  // border, no icon. A failed load reads as a typographic line above the grid.
  return (
    <div role="alert" className="mb-5 px-1">
      <p className="text-sm font-medium text-now">Couldn&rsquo;t load the schedule.</p>
      <p className="mt-1 text-xs text-ink-muted">{errors.join(" · ")}</p>
      <p className="mt-1.5 text-[11px] text-ink-faint">
        Set <span className="num">SUPABASE_URL</span> and{" "}
        <span className="num">SUPABASE_SERVICE_ROLE_KEY</span>, apply the migration.
      </p>
    </div>
  );
}
