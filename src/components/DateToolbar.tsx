import Link from "next/link";
import { addDays } from "@/lib/time";

const weekdayFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });
const monthDayFmt = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const yearFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" });

export function DateToolbar({ date, isToday }: { date: string; isToday: boolean }) {
  const d = new Date(`${date}T00:00:00.000Z`);
  const prevHref = `/?date=${addDays(date, -1)}`;
  const nextHref = `/?date=${addDays(date, 1)}`;

  return (
    <header className="mb-6 flex items-end justify-between gap-6">
      <div className="min-w-0">
        <h1 className="flex items-baseline gap-3 truncate text-3xl font-semibold leading-none tracking-[-0.02em] text-ink">
          {weekdayFmt.format(d)}
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
          <span className="num ml-2 text-[10px] uppercase tracking-[0.18em] text-ink-faint">UTC</span>
        </p>
      </div>

      <nav aria-label="Day navigation" className="flex items-center gap-0.5 pb-1">
        <Link className="glyph-btn" href={prevHref} aria-label="Previous day">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 6l-6 6 6 6" />
          </svg>
        </Link>
        <Link
          className="glyph-btn px-1.5 text-[11px] font-medium"
          href="/"
          aria-label="Go to today"
          aria-current={isToday ? "true" : undefined}
          style={{ width: "auto" }}
        >
          Today
        </Link>
        <Link className="glyph-btn" href={nextHref} aria-label="Next day">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 6l6 6-6 6" />
          </svg>
        </Link>
      </nav>
    </header>
  );
}
