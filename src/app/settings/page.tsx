import Link from "next/link";
import { cookies } from "next/headers";
import { LabelManager } from "@/components/LabelManager";
import { CalendarManager } from "@/components/CalendarManager";
import { WeekStartToggle } from "@/components/WeekStartToggle";
import { AppearanceControl } from "@/components/AppearanceControl";
import {
  getLabelUsage,
  listLabels,
  listUnregisteredLabels,
} from "@/server/labels";
import { listCalendars } from "@/server/calendars";
import { syncCalendarsIfStale } from "@/server/calendar-sync";
import {
  PERIOD_LABEL,
  buildMeter,
  meterGeometry,
  type BudgetMeter,
} from "@/lib/budgets";
import {
  addDays,
  addMonths,
  addQuarters,
  daysBetweenUtc,
  dayWindow,
  fmtDuration,
  monthStart,
  normalizeDate,
  quarterStart,
  todayInTz,
  weekDates,
  weekStartOf,
  weekWindow,
  type WeekStart,
} from "@/lib/time";
import { DEFAULT_TZ, TZ_COOKIE, isValidTimeZone, zonedDayStartUtc } from "@/lib/timezone";
import { WEEK_START_COOKIE, parseWeekStart } from "@/lib/prefs";
import type { BudgetPeriod, Calendar, Label } from "@/lib/types";

// Reads ?range / ?date + cookie + live DB. Never prerendered.
export const dynamic = "force-dynamic";

const RANGE_UNITS: BudgetPeriod[] = ["day", "week", "month", "quarter"];

function parseRange(input: string | undefined): BudgetPeriod {
  return input && (RANGE_UNITS as string[]).includes(input) ? (input as BudgetPeriod) : "week";
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function resolveTz(): Promise<string> {
  const jar = await cookies();
  const raw = jar.get(TZ_COOKIE)?.value;
  const decoded = raw ? safeDecode(raw) : undefined;
  return decoded && isValidTimeZone(decoded) ? decoded : DEFAULT_TZ;
}

async function resolveWeekStart(): Promise<WeekStart> {
  const jar = await cookies();
  return parseWeekStart(jar.get(WEEK_START_COOKIE)?.value);
}

const weekdayShortFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const dayMonthFmt = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
const monthLongFmt = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });
const yearFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" });

function utc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** The half-open UTC window + a human label for one calendar range of `unit`. */
function rangeWindow(unit: BudgetPeriod, date: string, tz: string, weekStart: WeekStart) {
  if (unit === "day") {
    const { startUtc, endUtc } = dayWindow(date, tz);
    const d = utc(date);
    return { startUtc, endUtc, label: `${weekdayShortFmt.format(d)} · ${dayMonthFmt.format(d)}` };
  }
  if (unit === "week") {
    const { startUtc, endUtc } = weekWindow(date, tz, weekStart);
    const dates = weekDates(date, weekStart);
    const first = utc(dates[0]);
    const last = utc(dates[dates.length - 1]);
    return { startUtc, endUtc, label: `${dayMonthFmt.format(first)} → ${dayMonthFmt.format(last)}` };
  }
  if (unit === "month") {
    const first = monthStart(date);
    const startUtc = zonedDayStartUtc(first, tz);
    const endUtc = zonedDayStartUtc(monthStart(addMonths(first, 1)), tz);
    const d = utc(first);
    return { startUtc, endUtc, label: `${monthLongFmt.format(d)} ${yearFmt.format(d)}` };
  }
  // quarter
  const first = quarterStart(date);
  const startUtc = zonedDayStartUtc(first, tz);
  const endUtc = zonedDayStartUtc(addQuarters(first, 1), tz);
  const d = utc(first);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return { startUtc, endUtc, label: `Q${q} ${yearFmt.format(d)}` };
}

function shiftAnchor(unit: BudgetPeriod, date: string, dir: -1 | 1, weekStart: WeekStart): string {
  if (unit === "day") return addDays(date, dir);
  if (unit === "week") return addDays(weekStartOf(date, weekStart), dir * 7);
  if (unit === "month") return addMonths(monthStart(date), dir);
  return addQuarters(quarterStart(date), dir);
}

function buildHref(range: BudgetPeriod, date: string, today: string): string {
  const params = new URLSearchParams();
  if (range !== "week") params.set("range", range);
  if (date !== today) params.set("date", date);
  const qs = params.toString();
  return qs ? `/settings?${qs}` : "/settings";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; date?: string }>;
}) {
  const { range: rangeParam, date: dateParam } = await searchParams;
  const tz = await resolveTz();
  const weekStart = await resolveWeekStart();
  const range = parseRange(rangeParam);
  const today = todayInTz(tz);
  const date = normalizeDate(dateParam, tz);

  const { startUtc, endUtc, label: rangeLabel } = rangeWindow(range, date, tz, weekStart);
  const rangeDays = daysBetweenUtc(startUtc, endUtc);

  // Refresh external events if any calendar has gone stale; the listing below
  // then reflects the fresh "synced" times. Best-effort — never blocks the page.
  await syncCalendarsIfStale(tz);

  let labels: Label[] = [];
  let untracked: string[] = [];
  let usage = new Map<string, number>();
  let calendars: Calendar[] = [];
  let loadError: string | null = null;

  try {
    labels = await listLabels();
    const known = new Set(labels.map((l) => l.slug));
    [untracked, usage, calendars] = await Promise.all([
      listUnregisteredLabels(known),
      getLabelUsage(startUtc, endUtc),
      listCalendars(),
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const meters: BudgetMeter[] = labels
    .filter((l) => l.budgetHours != null && l.budgetPeriod != null)
    .map((l) =>
      buildMeter({
        slug: l.slug,
        budgetHours: l.budgetHours as number,
        period: l.budgetPeriod as BudgetPeriod,
        rangeUnit: range,
        rangeDays,
        usedMinutes: usage.get(l.slug) ?? 0,
      }),
    )
    .sort((a, b) => b.ratio - a.ratio || a.slug.localeCompare(b.slug));

  return (
    <div className="settings-page mx-auto w-full max-w-3xl">
      <header className="settings-head">
        <Link href="/" className="settings-back">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 6l-6 6 6 6" />
          </svg>
          back to today
        </Link>
        <h1 className="settings-title">Settings</h1>
      </header>

      {loadError && (
        <div role="alert" className="settings-error">
          <p className="font-medium text-now">Couldn&rsquo;t load labels.</p>
          <p className="mt-1 text-xs text-ink-muted">{loadError}</p>
        </div>
      )}

      <section className="settings-section" aria-labelledby="calendars-heading">
        <h2 id="calendars-heading" className="settings-section-head">Calendars</h2>
        <CalendarManager calendars={calendars} />
      </section>

      <section className="settings-section" aria-labelledby="labels-heading">
        <h2 id="labels-heading" className="settings-section-head">Labels</h2>
        <LabelManager labels={labels} untracked={untracked} />
      </section>

      <section className="settings-section" aria-labelledby="budgets-heading">
        <div className="settings-section-bar">
          <h2 id="budgets-heading" className="settings-section-head">Budgets</h2>
          <RangeNav range={range} date={date} today={today} label={rangeLabel} weekStart={weekStart} />
        </div>
        <BudgetMeters meters={meters} rangeUnit={range} />
      </section>

      <section className="settings-section" aria-labelledby="defaults-heading">
        <h2 id="defaults-heading" className="settings-section-head">Defaults</h2>
        <p className="defaults-intro">
          Quiet preferences, kept on this browser. Appearance is the same setting
          as the corner glyph; week start also sets where the month grid begins.
        </p>
        <div className="defaults-grid">
          <WeekStartToggle current={weekStart} />
          <AppearanceControl />
        </div>
      </section>
    </div>
  );
}

function RangeNav({
  range,
  date,
  today,
  label,
  weekStart,
}: {
  range: BudgetPeriod;
  date: string;
  today: string;
  label: string;
  weekStart: WeekStart;
}) {
  return (
    <div className="range-nav">
      <nav aria-label="Budget range unit" className="range-units" role="group">
        {RANGE_UNITS.map((u) => {
          const active = u === range;
          const className = "range-chip";
          return active ? (
            <span key={u} className={className} aria-current="true">
              {PERIOD_LABEL[u]}
            </span>
          ) : (
            <Link key={u} className={className} href={buildHref(u, date, today)}>
              {PERIOD_LABEL[u]}
            </Link>
          );
        })}
      </nav>
      <span className="range-label num" aria-live="polite">{label}</span>
      <nav aria-label="Budget range navigation" className="range-steps">
        <Link className="glyph-btn" href={buildHref(range, shiftAnchor(range, date, -1, weekStart), today)} aria-label="Previous range">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 6l-6 6 6 6" />
          </svg>
        </Link>
        <Link
          className="glyph-btn px-1.5 text-[11px] font-medium"
          href={buildHref(range, today, today)}
          aria-label="Jump to the current range"
          style={{ width: "auto" }}
        >
          Now
        </Link>
        <Link className="glyph-btn" href={buildHref(range, shiftAnchor(range, date, 1, weekStart), today)} aria-label="Next range">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 6l6 6-6 6" />
          </svg>
        </Link>
      </nav>
    </div>
  );
}

function BudgetMeters({ meters, rangeUnit }: { meters: BudgetMeter[]; rangeUnit: BudgetPeriod }) {
  if (meters.length === 0) {
    return (
      <p className="budgets-empty">
        Set a budget on a label to track it here. Budgets read against the
        selected {PERIOD_LABEL[rangeUnit].toLowerCase()}.
      </p>
    );
  }
  return (
    <ul className="budget-list">
      {meters.map((m) => (
        <BudgetRow key={m.slug} meter={m} />
      ))}
    </ul>
  );
}

function BudgetRow({ meter }: { meter: BudgetMeter }) {
  const geo = meterGeometry(meter);
  const used = Math.round(meter.usedMin);
  const budget = Math.round(meter.budgetMin);
  return (
    <li className="budget-row" data-over={meter.over || undefined}>
      <div className="budget-row-head">
        <span className="budget-row-tag num">#{meter.slug}</span>
        <span className="budget-row-figures num">
          <span className="budget-row-used">{fmtDuration(used)}</span>
          <span className="budget-row-of" aria-hidden="true"> / </span>
          <span className="budget-row-budget">{fmtDuration(budget)}</span>
          <span className="budget-row-rest">
            {meter.over
              ? `${fmtDuration(Math.round(meter.overMin))} over`
              : `${fmtDuration(Math.round(meter.remainingMin))} left`}
          </span>
        </span>
      </div>
      <div
        className="budget-meter"
        data-over={meter.over || undefined}
        role="img"
        aria-label={
          meter.over
            ? `${meter.slug}: ${used} minutes used, ${budget} budgeted, over budget`
            : `${meter.slug}: ${used} of ${budget} minutes used`
        }
      >
        <span className="budget-meter-fill" style={{ width: `${geo.fillPct}%` }} />
        {geo.over && (
          <>
            <span
              className="budget-meter-over"
              style={{ left: `${geo.tickPct}%`, width: `${geo.overPct}%` }}
            />
            <span className="budget-meter-tick" style={{ left: `${geo.tickPct}%` }} />
          </>
        )}
      </div>
    </li>
  );
}
