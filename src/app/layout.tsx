import type { Metadata } from "next";
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
      <body className="min-h-screen antialiased">
        <div className="corner-controls">
          {authed && <TimezoneToggle currentTz={tz} />}
          <ThemeToggle />
          {authed && <LogoutButton />}
        </div>
        <main className="px-6 pb-12 pt-10 sm:px-8">{children}</main>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
