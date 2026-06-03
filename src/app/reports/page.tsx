import Link from "next/link";
import { cookies } from "next/headers";
import { getLabelUsage, listLabels } from "@/server/labels";
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
import type { BudgetPeriod, Label } from "@/lib/types";

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
  return qs ? `/reports?${qs}` : "/reports";
}

/** A used-but-unbudgeted label: time logged against a tag that carries no budget. */
interface UntrackedUsage {
  slug: string;
  minutes: number;
}

export default async function ReportsPage({
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

  let labels: Label[] = [];
  let usage = new Map<string, number>();
  let loadError: string | null = null;

  try {
    [labels, usage] = await Promise.all([listLabels(), getLabelUsage(startUtc, endUtc)]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  // Budgeted labels become meters (consumed vs allowed for this range), heaviest
  // and over-budget first. Everything else with logged time is "no budget set".
  const budgeted = new Set<string>();
  const meters: BudgetMeter[] = labels
    .filter((l) => l.budgetHours != null && l.budgetPeriod != null)
    .map((l) => {
      budgeted.add(l.slug);
      return buildMeter({
        slug: l.slug,
        budgetHours: l.budgetHours as number,
        period: l.budgetPeriod as BudgetPeriod,
        rangeUnit: range,
        rangeDays,
        usedMinutes: usage.get(l.slug) ?? 0,
      });
    })
    .sort((a, b) => b.ratio - a.ratio || a.slug.localeCompare(b.slug));

  const untracked: UntrackedUsage[] = Array.from(usage.entries())
    .filter(([slug, min]) => min > 0 && !budgeted.has(slug))
    .map(([slug, minutes]) => ({ slug, minutes }))
    .sort((a, b) => b.minutes - a.minutes || a.slug.localeCompare(b.slug));

  // Lead-line totals. Labels overlap (a block tagged #a #b counts toward both),
  // so "tagged" is the sum across labels, deliberately not wall-clock booked time.
  const taggedMin = Array.from(usage.values()).reduce((s, m) => s + Math.max(0, m), 0);
  const labelCount = Array.from(usage.values()).filter((m) => m > 0).length;

  return (
    <div className="settings-page mx-auto w-full max-w-3xl">
      <header className="settings-head">
        <Link href="/" className="settings-back">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 6l-6 6 6 6" />
          </svg>
          back to today
        </Link>
        <h1 className="settings-title">Reports</h1>
      </header>

      {loadError && (
        <div role="alert" className="settings-error">
          <p className="font-medium text-now">Couldn&rsquo;t load label usage.</p>
          <p className="mt-1 text-xs text-ink-muted">{loadError}</p>
        </div>
      )}

      <section className="settings-section" aria-labelledby="label-usage-heading">
        <div className="settings-section-bar">
          <h2 id="label-usage-heading" className="settings-section-head">Label usage</h2>
          <RangeNav range={range} date={date} today={today} label={rangeLabel} weekStart={weekStart} />
        </div>
        <LabelUsageReport
          meters={meters}
          untracked={untracked}
          taggedMin={taggedMin}
          labelCount={labelCount}
          rangeUnit={range}
        />
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
      <nav aria-label="Report range unit" className="range-units" role="group">
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
      <nav aria-label="Report range navigation" className="range-steps">
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

function LabelUsageReport({
  meters,
  untracked,
  taggedMin,
  labelCount,
  rangeUnit,
}: {
  meters: BudgetMeter[];
  untracked: UntrackedUsage[];
  taggedMin: number;
  labelCount: number;
  rangeUnit: BudgetPeriod;
}) {
  const unit = PERIOD_LABEL[rangeUnit].toLowerCase();

  // Nothing budgeted and nothing logged: a true blank slate, not a zeroed report.
  if (meters.length === 0 && untracked.length === 0) {
    return (
      <p className="report-empty">
        No tracked time this {unit}. Tag tasks with <span className="num">#labels</span>,
        then set a budget in Settings to watch it fill here.
      </p>
    );
  }

  const maxUntracked = untracked.reduce((m, u) => Math.max(m, u.minutes), 0);

  return (
    <div className="report-usage">
      {labelCount > 0 && (
        <p
          className="report-lead num"
          title="Time summed across labels; a task with two labels counts toward both, so this can exceed booked time."
        >
          <span className="report-lead-strong">{labelCount}</span>{" "}
          {labelCount === 1 ? "label" : "labels"}{" "}
          <span className="report-lead-sep" aria-hidden="true">·</span>{" "}
          <span className="report-lead-strong">{fmtDuration(Math.round(taggedMin))}</span> tagged
        </p>
      )}

      {meters.length > 0 && (
        <div className="report-band">
          <h3 className="report-band-head">
            Budgeted <span className="report-band-count num">{meters.length}</span>
          </h3>
          <ul className="budget-list">
            {meters.map((m) => (
              <BudgetRow key={m.slug} meter={m} />
            ))}
          </ul>
        </div>
      )}

      {untracked.length > 0 && (
        <div className="report-band">
          <h3 className="report-band-head">
            No budget set <span className="report-band-count num">{untracked.length}</span>
          </h3>
          <ul className="usage-list">
            {untracked.map((u) => (
              <UsageRow
                key={u.slug}
                slug={u.slug}
                minutes={u.minutes}
                maxMinutes={maxUntracked}
                taggedMin={taggedMin}
              />
            ))}
          </ul>
          {meters.length === 0 && (
            <p className="report-band-note">
              Set a budget on any of these in Settings to track consumed versus left.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Budgeted label: amber fill against its allowance, ember tail when over. */
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

/** Unbudgeted label: a graphite bar sized against the heaviest peer (relative
    weight, no allowance to consume) plus its share of all tagged time. */
function UsageRow({
  slug,
  minutes,
  maxMinutes,
  taggedMin,
}: {
  slug: string;
  minutes: number;
  maxMinutes: number;
  taggedMin: number;
}) {
  const fillPct = maxMinutes > 0 ? (minutes / maxMinutes) * 100 : 0;
  const sharePct = taggedMin > 0 ? Math.round((minutes / taggedMin) * 100) : 0;
  const amount = fmtDuration(Math.round(minutes));
  return (
    <li className="usage-row">
      <div className="usage-row-head">
        <span className="usage-row-tag num">#{slug}</span>
        <span className="usage-row-figures num">
          <span className="usage-row-amount">{amount}</span>
          <span className="usage-row-share">{sharePct}%</span>
        </span>
      </div>
      <div
        className="usage-bar"
        role="img"
        aria-label={`${slug}: ${amount}, ${sharePct} percent of tagged time, no budget set`}
      >
        <span className="usage-bar-fill" style={{ width: `${fillPct}%` }} />
      </div>
    </li>
  );
}
