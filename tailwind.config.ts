import type { Config } from "tailwindcss";

/**
 * One semantic color set, two first-class themes. Every color resolves to a CSS
 * variable defined in `src/app/globals.css` (`:root` + `.dark`). RGB triplets
 * keep `<alpha-value>` working (`bg-accent/20`, `ring-accent/50`).
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
        block: "rgb(var(--block) / <alpha-value>)",
        "block-strong": "rgb(var(--block-strong) / <alpha-value>)",
        free: "rgb(var(--free) / <alpha-value>)",
        "free-strong": "rgb(var(--free-strong) / <alpha-value>)",
        now: "rgb(var(--now) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "JetBrains Mono", "Consolas", "monospace"],
      },
      transitionTimingFunction: {
        // Ease-out-quart. Mechanical, no bounce, no elastic.
        snap: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
