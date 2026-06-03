import Link from "next/link";
import { cookies } from "next/headers";
import { LabelManager } from "@/components/LabelManager";
import { CalendarManager } from "@/components/CalendarManager";
import { WeekStartToggle } from "@/components/WeekStartToggle";
import { AppearanceControl } from "@/components/AppearanceControl";
import { listLabels, listUnregisteredLabels } from "@/server/labels";
import { listCalendars } from "@/server/calendars";
import { syncCalendarsIfStale } from "@/server/calendar-sync";
import { DEFAULT_TZ, TZ_COOKIE, isValidTimeZone } from "@/lib/timezone";
import { WEEK_START_COOKIE, parseWeekStart } from "@/lib/prefs";
import type { WeekStart } from "@/lib/time";
import type { Calendar, Label } from "@/lib/types";

// Reads cookies + live DB. Never prerendered.
export const dynamic = "force-dynamic";

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

export default async function SettingsPage() {
  const tz = await resolveTz();
  const weekStart = await resolveWeekStart();

  // Refresh external events if any calendar has gone stale; the listing below
  // then reflects the fresh "synced" times. Best-effort — never blocks the page.
  await syncCalendarsIfStale(tz);

  let labels: Label[] = [];
  let untracked: string[] = [];
  let calendars: Calendar[] = [];
  let loadError: string | null = null;

  try {
    labels = await listLabels();
    const known = new Set(labels.map((l) => l.slug));
    [untracked, calendars] = await Promise.all([
      listUnregisteredLabels(known),
      listCalendars(),
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

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
        <p className="defaults-intro">
          Set a budget on a label here; track it against the calendar in{" "}
          <Link href="/reports" className="settings-inline-link">Reports</Link>.
        </p>
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
