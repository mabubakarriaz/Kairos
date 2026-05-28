"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TZ_COOKIE,
  formatOffset,
  nextZone,
  offsetMinutes,
  zoneFor,
} from "@/lib/timezone";

interface Props {
  /** Server-resolved cookie value. Used so SSR and first paint agree. */
  currentTz: string;
}

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function TimezoneToggle({ currentTz }: Props) {
  const router = useRouter();
  const [active, setActive] = useState(currentTz);
  const [now, setNow] = useState<Date | null>(null);

  // Sync prop into state when SSR changes the cookie under us.
  useEffect(() => setActive(currentTz), [currentTz]);

  // Real `now` only after mount, to keep SSR and first client render in lockstep.
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  function cycle() {
    const next = nextZone(active);
    // IANA zone names are RFC-6265-safe (letters, digits, '/', '_', '-'); no encoding needed.
    document.cookie = `${TZ_COOKIE}=${next.id}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    setActive(next.id);
    router.refresh();
  }

  const meta = zoneFor(active);
  const offset = now ? formatOffset(offsetMinutes(now, active)) : null;
  const tooltip = offset ? `${meta.long} · ${offset}` : meta.long;

  return (
    <button
      type="button"
      onClick={cycle}
      className="tz-chip num"
      aria-label={`Time zone: ${tooltip}. Click to switch.`}
      title={`Time zone · ${tooltip}`}
    >
      {meta.short}
    </button>
  );
}
