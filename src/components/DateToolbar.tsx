import Link from "next/link";
import {
  FIVE_DAYS,
  WEEK_DAYS,
  addDays,
  addMonths,
  fiveDayDates,
  monthStart,
  mondayOf,
  todayInTz,
  weekDates,
} from "@/lib/time";
import { zoneFor } from "@/lib/timezone";

type View = "day" | "5d" | "week" | "month";

const STEP: Record<Exclude<View, "month">, number> = {
  day: 1,
  "5d": FIVE_DAYS,
  week: WEEK_DAYS,
};
const VIEW_LABEL: Record<View, string> = {
  day: "Day",
  "5d": "5d",
  week: "Week",
  month: "Month",
};

const weekdayLongFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });
const weekdayShortFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const monthLongFmt = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });
const monthShortFmt = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const dayNumFmt = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" });
const monthDayFmt = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", timeZone: "UTC" });
const yearFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" });

function utc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function buildHref(date: string, view: View, tz: string, labelsQuery: string): string {
  const params = new URLSearchParams();
  if (view !== "day") params.set("view", view);
  if (date !== todayInTz(tz)) params.set("date", date);
  if (labelsQuery) params.set("labels", labelsQuery);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export function DateToolbar({
  date,
  isToday,
  view,
  tz,
  labelsQuery,
}: {
  date: string;
  isToday: boolean;
  view: View;
  tz: string;
  labelsQuery: string;
}) {
  const prevHref =
    view === "month"
      ? buildHref(addMonths(monthStart(date), -1), view, tz, labelsQuery)
      : buildHref(addDays(date, -STEP[view]), view, tz, labelsQuery);
  const nextHref =
    view === "month"
      ? buildHref(addMonths(monthStart(date), 1), view, tz, labelsQuery)
      : buildHref(addDays(date, STEP[view]), view, tz, labelsQuery);
  const todayHref = buildHref(todayInTz(tz), view, tz, labelsQuery);

  const tzShort = zoneFor(tz).short;

  return (
    <header className="mb-6 flex items-end justify-between gap-6">
      <div className="min-w-0">
        {view === "day" ? (
          <DayTitle date={date} isToday={isToday} tzShort={tzShort} />
        ) : view === "month" ? (
          <MonthTitle date={date} isToday={isToday} tzShort={tzShort} />
        ) : (
          <MultiDayTitle
            dates={view === "5d" ? fiveDayDates(date) : weekDates(date)}
            tzShort={tzShort}
          />
        )}
      </div>

      <div className="flex items-center gap-3 pb-1">
        <nav aria-label="View" className="flex items-center gap-0.5" role="group">
          {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
            <ViewToggleLink
              key={v}
              label={VIEW_LABEL[v]}
              href={v === view ? undefined : buildHref(date, v, tz, labelsQuery)}
              current={v === view}
              numeric={v === "5d"}
            />
          ))}
        </nav>
        <span className="h-4 w-px bg-hairline" aria-hidden="true" />
        <nav
          aria-label={view === "day" ? "Day navigation" : `${VIEW_LABEL[view]} navigation`}
          className="flex items-center gap-0.5"
        >
          <Link className="glyph-btn" href={prevHref} aria-label={`Previous ${VIEW_LABEL[view].toLowerCase()}`}>
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 6l-6 6 6 6" />
            </svg>
          </Link>
          <Link
            className="glyph-btn px-1.5 text-[11px] font-medium"
            href={todayHref}
            aria-label="Go to today"
            aria-current={isToday ? "true" : undefined}
            style={{ width: "auto" }}
          >
            Today
          </Link>
          <Link className="glyph-btn" href={nextHref} aria-label={`Next ${VIEW_LABEL[view].toLowerCase()}`}>
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 6l6 6-6 6" />
            </svg>
          </Link>
        </nav>
      </div>
    </header>
  );
}

function ViewToggleLink({
  label,
  href,
  current,
  numeric,
}: {
  label: string;
  href: string | undefined;
  current: boolean;
  numeric: boolean;
}) {
  const className = `glyph-btn px-1.5 text-[11px] font-medium${numeric ? " num" : ""}`;
  if (current || !href) {
    return (
      <span className={className} aria-current="true" style={{ width: "auto" }}>
        {label}
      </span>
    );
  }
  return (
    <Link className={className} href={href} aria-label={`Switch to ${label.toLowerCase()} view`} style={{ width: "auto" }}>
      {label}
    </Link>
  );
}

function DayTitle({ date, isToday, tzShort }: { date: string; isToday: boolean; tzShort: string }) {
  const d = utc(date);
  return (
    <>
      <h1 className="flex items-baseline gap-3 truncate text-3xl font-semibold leading-none tracking-[-0.02em] text-ink">
        {weekdayLongFmt.format(d)}
        {isToday && (
          <span
            className="num text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-strong"
            aria-label="Today"
          >
            · today
          </span>
        )}
      </h1>
      <p className="mt-2 flex items-baseline gap-1.5 text-sm text-ink-muted">
        <span>{monthDayFmt.format(d)}</span>
        <span className="num text-ink-faint" aria-hidden="true">·</span>
        <span className="num text-ink-faint">{yearFmt.format(d)}</span>
        <span className="num ml-2 text-[10px] uppercase tracking-[0.18em] text-ink-faint">{tzShort}</span>
      </p>
    </>
  );
}

function MonthTitle({
  date,
  isToday,
  tzShort,
}: {
  date: string;
  isToday: boolean;
  tzShort: string;
}) {
  const d = utc(date);
  return (
    <>
      <h1 className="flex items-baseline gap-3 truncate text-3xl font-semibold leading-none tracking-[-0.02em] text-ink">
        {monthLongFmt.format(d)}
        {isToday && (
          <span
            className="num text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-strong"
            aria-label="This month"
          >
            · this month
          </span>
        )}
      </h1>
      <p className="mt-2 flex items-baseline gap-1.5 text-sm text-ink-muted">
        <span className="num">{yearFmt.format(d)}</span>
        <span className="num ml-2 text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          {tzShort}
        </span>
      </p>
    </>
  );
}

function MultiDayTitle({ dates, tzShort }: { dates: string[]; tzShort: string }) {
  const first = utc(dates[0]);
  const last = utc(dates[dates.length - 1]);
  const sameMonth = first.getUTCMonth() === last.getUTCMonth();
  const sameYear = first.getUTCFullYear() === last.getUTCFullYear();
  const monthH1 = sameMonth
    ? monthLongFmt.format(first)
    : `${monthShortFmt.format(first)} – ${monthShortFmt.format(last)}`;

  const firstLabel = `${weekdayShortFmt.format(first)} ${dayNumFmt.format(first).padStart(2, "0")}`;
  const lastLabel = `${weekdayShortFmt.format(last)} ${dayNumFmt.format(last).padStart(2, "0")}`;
  const yearLabel = sameYear ? yearFmt.format(last) : `${yearFmt.format(first)}–${yearFmt.format(last)}`;

  return (
    <>
      <h1 className="flex items-baseline gap-3 truncate text-3xl font-semibold leading-none tracking-[-0.02em] text-ink">
        {monthH1}
      </h1>
      <p className="mt-2 flex items-baseline gap-1.5 text-sm text-ink-muted">
        <span className="num">{firstLabel}</span>
        <span className="num text-ink-faint" aria-hidden="true">→</span>
        <span className="num">{lastLabel}</span>
        <span className="num text-ink-faint" aria-hidden="true">·</span>
        <span className="num text-ink-faint">{yearLabel}</span>
        <span className="num ml-2 text-[10px] uppercase tracking-[0.18em] text-ink-faint">{tzShort}</span>
      </p>
    </>
  );
}
