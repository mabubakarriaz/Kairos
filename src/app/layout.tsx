import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeToggle } from "@/components/ThemeToggle";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-screen antialiased">
        <ThemeToggle />
        <main className="mx-auto max-w-3xl px-6 pb-12 pt-10 sm:px-8">{children}</main>
      </body>
    </html>
  );
}
