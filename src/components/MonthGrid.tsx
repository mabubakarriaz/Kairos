import Link from "next/link";
import { computeDayStats, DAY_MINUTES } from "@/lib/time";
import { matchesLabelFilter } from "@/lib/labels";
import type { ScheduledBlock } from "@/lib/types";

const weekdayShortFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: "UTC",
});

/** A pre-bucketed day in the month grid — what `page.tsx` resolves before
 *  rendering, so the grid stays a pure layout function. */
export interface MonthCell {
  date: string;
  dayStartUtc: string;
  blocks: ScheduledBlock[];
}

const MAX_DOTS = 6;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  cells: MonthCell[];
  /** YYYY-MM-DD anchor inside the currently-rendered month (any day works). */
  anchorDate: string;
  /** YYYY-MM-DD for "today" in the active zone. */
  today: string;
  tz: string;
  labelsQuery: string;
  filterLabels: string[];
}

/**
 * Month view — a calm 6×7 calendar that trades the day grid's time precision
 * for shape-at-a-glance: each cell is a date numeral, a row of small ochre dots
 * (one per block, capped with "+N"), and a 2px booked-share bar pinned to the
 * cell's bottom edge. Today gets a single Burnt-Ochre tint on the numeral;
 * other-month days fade to ink-faint. Clicking a cell switches to the day view
 * at that date — the month is a navigator, never an editor. (Composing, drag,
 * checkpoints all live on the schedule grid.)
 *
 * Always 6 rows so adjacent months don't reflow height when the user pages
 * prev/next; layout stability is the whole point at this altitude.
 */
export function MonthGrid({
  cells,
  anchorDate,
  today,
  tz,
  labelsQuery,
  filterLabels,
}: Props) {
  const anchor = new Date(`${anchorDate}T00:00:00.000Z`);
  const anchorMonth = anchor.getUTCMonth();
  const anchorYear = anchor.getUTCFullYear();

  return (
    <div className="month-grid">
      <div className="month-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="month-weekday">
            {label}
          </span>
        ))}
      </div>
      {/* A set of day-navigation links, not an interactive grid widget: each cell
          is a labeled <Link> to the day view, with no row/arrow-key grid model to
          back a role="grid" contract. Honest link semantics over a broken grid. */}
      <div className="month-canvas">
        {cells.map((cell) => {
          const d = new Date(`${cell.date}T00:00:00.000Z`);
          const cellMonth = d.getUTCMonth();
          const cellYear = d.getUTCFullYear();
          const inMonth = cellMonth === anchorMonth && cellYear === anchorYear;
          const isToday = cell.date === today;
          const isPast = cell.date < today;

          // Filter blocks the way other views do: non-matching go ghost but
          // still occupy a dot slot. Keeping them counts the schedule's shape
          // honestly, the colour just dims.
          const visibleBlocks = cell.blocks;
          const dotCount = visibleBlocks.length;
          const overflow = Math.max(0, dotCount - MAX_DOTS);
          const dots = visibleBlocks.slice(0, MAX_DOTS);

          const stats = computeDayStats(cell.blocks, cell.dayStartUtc);
          const sharePct = Math.min(100, Math.round((stats.bookedMin / DAY_MINUTES) * 100));

          const href = buildDayHref(cell.date, tz, labelsQuery);
          return (
            <Link
              key={cell.date}
              className="month-cell"
              href={href}
              data-today={isToday || undefined}
              data-past={isPast || undefined}
              data-otherMonth={!inMonth || undefined}
              aria-label={`${weekdayShortFmt.format(d)} ${d.getUTCDate()}${isToday ? " · today" : ""}${
                dotCount > 0 ? `, ${dotCount} block${dotCount === 1 ? "" : "s"}` : ""
              }`}
            >
              <span className="month-cell-num num">
                {String(d.getUTCDate()).padStart(2, "0")}
              </span>
              {dotCount > 0 && (
                <span className="month-cell-dots" aria-hidden="true">
                  {dots.map((b) => {
                    const muted = !matchesLabelFilter(b.tags, filterLabels);
                    return (
                      <span
                        key={b.id}
                        className="month-cell-dot"
                        data-muted={muted || undefined}
                      />
                    );
                  })}
                  {overflow > 0 && (
                    <span className="month-cell-dots-more num">+{overflow}</span>
                  )}
                </span>
              )}
              <span className="month-cell-bar" aria-hidden="true">
                <span
                  className="month-cell-bar-booked"
                  style={{ width: `${sharePct}%` }}
                />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function buildDayHref(date: string, tz: string, labelsQuery: string): string {
  // Month → day: only emit `date` if it differs from today, mirroring DateToolbar.
  const params = new URLSearchParams();
  // The day view is the default (no `view=…`).
  // The host page reads its own `todayInTz`; we don't strip the param even when
  // it matches because the user-perceived round-trip is clearer with the date
  // explicit. Keep `tz` out — that's a cookie, not a URL concern.
  params.set("date", date);
  if (labelsQuery) params.set("labels", labelsQuery);
  void tz;
  return `/?${params.toString()}`;
}
