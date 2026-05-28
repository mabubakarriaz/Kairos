"use client";

import { logoutAction } from "@/app/login/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="glyph-btn" aria-label="Log out" title="Log out">
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      </button>
    </form>
  );
}
