import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TimezoneToggle } from "@/components/TimezoneToggle";
import { LogoutButton } from "@/components/LogoutButton";
import { DEFAULT_TZ, TZ_COOKIE, isValidTimeZone } from "@/lib/timezone";
import { AUTH_COOKIE, verifySession } from "@/lib/auth-session";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Kairos",
  description: "A time-blocked todo app. The right and opportune time to do a task.",
};

// `viewportFit: "cover"` lets the canvas reach under the notch/home indicator
// so the safe-area insets (consumed in globals.css) do the spacing. Scaling is
// left enabled (pinch-zoom is an accessibility floor); the iOS focus-zoom is
// handled by lifting touch inputs to 16px, not by locking the viewport. The
// two theme colors paint the mobile browser chrome to match each scene.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#14110d" },
  ],
};

// Runs before paint so the theme is applied without a flash.
// Three-state: explicit "dark", explicit "light", or system (no key set).
const themeInit = `(function(){try{var t=localStorage.getItem('kairos-theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');document.documentElement.dataset.themePref=t||'system';}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const raw = jar.get(TZ_COOKIE)?.value;
  let decoded: string | undefined;
  try {
    decoded = raw ? decodeURIComponent(raw) : undefined;
  } catch {
    decoded = raw;
  }
  const tz = decoded && isValidTimeZone(decoded) ? decoded : DEFAULT_TZ;

  // The tz/logout chrome only makes sense once a session exists. On the login
  // screen the theme glyph stays so the page still respects the user's scene.
  const authed = await verifySession(jar.get(AUTH_COOKIE)?.value);

  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="flex flex-col overflow-hidden antialiased">
        <div className="corner-controls">
          {authed && <TimezoneToggle currentTz={tz} />}
          <ThemeToggle />
          {authed && (
            <Link className="glyph-btn" href="/reports" aria-label="Reports" title="Reports">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 3v16a2 2 0 0 0 2 2h16" />
                <path d="M7 15l3-4 3 2.5L18 8" />
              </svg>
            </Link>
          )}
          {authed && (
            <Link className="glyph-btn" href="/settings" aria-label="Settings" title="Settings">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </Link>
          )}
          {authed && <LogoutButton />}
        </div>
        <main className="app-main">{children}</main>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
