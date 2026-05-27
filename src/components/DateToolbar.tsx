import Link from "next/link";
import { addDays } from "@/lib/time";

const weekdayFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });
const fullFmt = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function DateToolbar({ date, isToday }: { date: string; isToday: boolean }) {
  const d = new Date(`${date}T00:00:00.000Z`);

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="seg">
        <Link className="seg-btn" href={`/?date=${addDays(date, -1)}`} aria-label="Previous day">
          ‹
        </Link>
        <Link className="seg-btn" href="/">
          Today
        </Link>
        <Link className="seg-btn" href={`/?date=${addDays(date, 1)}`} aria-label="Next day">
          ›
        </Link>
      </div>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold leading-tight tracking-tight text-ink">
          {weekdayFmt.format(d)}
          {isToday && <span className="pill-today">Today</span>}
        </h1>
        <p className="mt-0.5 flex items-center gap-2 text-sm text-ink-muted">
          {fullFmt.format(d)}
          <span className="pill">UTC</span>
        </p>
      </div>
    </div>
  );
}
