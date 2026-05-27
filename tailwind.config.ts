import type { Config } from "tailwindcss";

/**
 * One semantic color set, two themes. Every color resolves to a CSS variable
 * defined in `src/app/globals.css` (`:root` + `.dark`), so flipping the `.dark`
 * class on <html> re-themes the whole app. RGB triplets keep `<alpha-value>`
 * working (e.g. `bg-accent/20`).
 */
export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        raised: "rgb(var(--surface-2) / <alpha-value>)",
        hairline: "rgb(var(--border) / <alpha-value>)",
        "hairline-strong": "rgb(var(--border-strong) / <alpha-value>)",
        ink: "rgb(var(--text) / <alpha-value>)",
        "ink-muted": "rgb(var(--text-muted) / <alpha-value>)",
        "ink-faint": "rgb(var(--text-faint) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-strong": "rgb(var(--accent-strong) / <alpha-value>)",
        "accent-fg": "rgb(var(--accent-fg) / <alpha-value>)",
        free: "rgb(var(--free) / <alpha-value>)",
        "free-strong": "rgb(var(--free-strong) / <alpha-value>)",
        now: "rgb(var(--now) / <alpha-value>)",
      },
      boxShadow: {
        card: "0 1px 2px rgb(var(--shadow) / 0.06), 0 1px 3px rgb(var(--shadow) / 0.08)",
        block: "0 1px 2px rgb(var(--shadow) / 0.10)",
        lift: "0 10px 30px rgb(var(--shadow) / 0.18)",
      },
      transitionTimingFunction: {
        snap: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
