"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PREF_COOKIE_MAX_AGE, WEEK_START_COOKIE } from "@/lib/prefs";
import type { WeekStart } from "@/lib/time";

interface Props {
  /** Server-resolved cookie value, so SSR and first paint agree. */
  current: WeekStart;
}

const OPTIONS: { value: WeekStart; label: string }[] = [
  { value: "mon", label: "Mon" },
  { value: "sun", label: "Sun" },
];

/**
 * Two-chip selector for which day the week (and month grid) begins on. Writes a
 * cookie and refreshes, the same pattern as the timezone chip, because the week
 * window is resolved on the server during render. Reuses the `range-chip`
 * vocabulary so it matches the budget range selector.
 */
export function WeekStartToggle({ current }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<WeekStart>(current);

  // Re-sync if a server refresh changes the cookie under us.
  useEffect(() => setActive(current), [current]);

  function choose(value: WeekStart) {
    if (value === active) return;
    document.cookie = `${WEEK_START_COOKIE}=${value}; path=/; max-age=${PREF_COOKIE_MAX_AGE}; SameSite=Lax`;
    setActive(value);
    router.refresh();
  }

  return (
    <div className="defaults-control">
      <span className="defaults-control-label">Week starts</span>
      <div className="seg" role="group" aria-label="Week starts on">
        {OPTIONS.map((opt) => {
          const isActive = opt.value === active;
          return (
            <button
              key={opt.value}
              type="button"
              className="range-chip"
              aria-pressed={isActive}
              aria-current={isActive || undefined}
              onClick={() => choose(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
