"use client";

import Link from "next/link";

/**
 * The toolbar's "Today" control. Beyond navigating to today, it lands the view
 * on the now-line (the red current-time hairline). Two delivery paths cover every
 * case, because a click can leave the grid mounted (same URL, or a search-param
 * only change Next reconciles in place) or remount it (a different day):
 *  - a one-shot `sessionStorage` flag the grid reads on mount (covers remounts),
 *  - a `kairos:goto-now` event a still-mounted grid reacts to in place.
 * The grid clears the flag whichever path wins, so it never lingers to fire later.
 */
export function TodayLink({
  href,
  isToday,
  className,
}: {
  href: string;
  isToday: boolean;
  className: string;
}) {
  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Same URL → the Link is a no-op, so don't navigate; the event drives the scroll.
    if (window.location.pathname + window.location.search === href) e.preventDefault();
    try {
      sessionStorage.setItem("kairos:goto-now", "1");
    } catch {
      // Private-mode / storage disabled — the event path below still works.
    }
    window.dispatchEvent(new Event("kairos:goto-now"));
  }

  return (
    <Link
      className={className}
      href={href}
      aria-label="Go to today and the current time"
      aria-current={isToday ? "true" : undefined}
      style={{ width: "auto" }}
      onClick={onClick}
    >
      Today
    </Link>
  );
}
