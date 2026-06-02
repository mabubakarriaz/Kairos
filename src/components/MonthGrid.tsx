import { computeDayStats, DAY_MINUTES, fmtDuration } from "@/lib/time";
import { matchesLabelFilter } from "@/lib/labels";
import type { ScheduledBlock } from "@/lib/types";
import { MonthCell, type MonthCellView, type MonthEvent } from "./MonthCell";

const weekdayShortFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: "UTC",
});
const popoverDateFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** A pre-bucketed day in the month grid — what `page.tsx` resolves before
 *  rendering, so the grid stays a pure layout function. */
export interface MonthCellData {
  date: string;
  dayStartUtc: string;
  blocks: ScheduledBlock[];
}

/** Dots per day are capped so a packed day stays a row of marks, not a smear;
 *  the popover carries the full list. */
const MAX_DOTS = 10;
/** The popover lists every block but caps the visible rows, with a "+N more". */
const MAX_POPOVER = 8;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  cells: MonthCellData[];
  /** YYYY-MM-DD anchor inside the currently-rendered month (any day works). */
  anchorDate: string;
  /** YYYY-MM-DD for "today" in the active zone. */
  today: string;
  tz: string;
  labelsQuery: string;
  filterLabels: string[];
}

/** Compact wall-clock for a popover row: "9a", "2p", "9:30a", "2:15p". */
function fmtChipTime(minutes: number): string {
  const norm = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h24 = Math.floor(norm / 60);
  const m = norm % 60;
  const period = h24 < 12 ? "a" : "p";
  const h12 = ((h24 + 11) % 12) + 1;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

/**
 * Month view — a calm 6×7 calendar that trades the day grid's time precision
 * for shape-at-a-glance. At rest each cell is a date numeral, a wrapped row of
 * small ochre dots (one per block, capped with "+N"), and a 3px booked-share
 * bar pinned to the cell's bottom edge. Hovering (or focusing) a day raises a
 * quiet popover that names what's on it — mono start-time + title per block,
 * gcal events in graphite. Today carries a single Burnt-Ochre tint; other-month
 * days fade. Clicking a cell switches to the day view — the month is a
 * navigator, never an editor.
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

  const views: MonthCellView[] = cells.map((cell) => {
    const d = new Date(`${cell.date}T00:00:00.000Z`);
    const cellMonth = d.getUTCMonth();
    const cellYear = d.getUTCFullYear();
    const inMonth = cellMonth === anchorMonth && cellYear === anchorYear;
    const isToday = cell.date === today;
    const isPast = cell.date < today;

    const dayStartMs = new Date(cell.dayStartUtc).getTime();
    const sorted = [...cell.blocks].sort(
      (a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime(),
    );

    // Dots: one per block, in time order, capped with "+N".
    const dots = sorted.slice(0, MAX_DOTS).map((b) => ({
      gcal: b.source === "gcal",
      muted: !matchesLabelFilter(b.tags, filterLabels),
    }));
    const dotOverflow = Math.max(0, sorted.length - MAX_DOTS);

    // Popover rows: time + title for the day's blocks, capped with "+N".
    const events: MonthEvent[] = sorted.slice(0, MAX_POPOVER).map((b) => {
      const startMin = Math.max(
        0,
        Math.round((new Date(b.startUtc).getTime() - dayStartMs) / 60_000),
      );
      return {
        time: fmtChipTime(startMin),
        title: b.title || (b.source === "gcal" ? "Busy" : "Untitled"),
        gcal: b.source === "gcal",
        muted: !matchesLabelFilter(b.tags, filterLabels),
      };
    });
    const eventOverflow = Math.max(0, sorted.length - MAX_POPOVER);

    const stats = computeDayStats(cell.blocks, cell.dayStartUtc);
    const sharePct = Math.min(100, Math.round((stats.bookedMin / DAY_MINUTES) * 100));
    const blockCount = sorted.length;

    return {
      date: cell.date,
      dayNum: String(d.getUTCDate()).padStart(2, "0"),
      dateLabel: popoverDateFmt.format(d),
      inMonth,
      isToday,
      isPast,
      dots,
      dotOverflow,
      events,
      eventOverflow,
      blockCount,
      bookedLabel: stats.bookedMin > 0 ? fmtDuration(stats.bookedMin) : null,
      openLabel: stats.openMin > 0 ? fmtDuration(stats.openMin) : null,
      sharePct,
      href: buildDayHref(cell.date, tz, labelsQuery),
      ariaLabel: `${weekdayShortFmt.format(d)} ${d.getUTCDate()}${isToday ? " · today" : ""}${
        blockCount > 0 ? `, ${blockCount} block${blockCount === 1 ? "" : "s"}` : ""
      }`,
    };
  });

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
        {views.map((view) => (
          <MonthCell key={view.date} view={view} />
        ))}
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
