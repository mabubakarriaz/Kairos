/** @type {import('tailwindcss').Config} */
export default {
  // Scan Razor markup + TS so used classes survive purging.
  content: ["../Pages/**/*.cshtml", "./src/**/*.{ts,js}"],
  // Theme is toggled by adding `.dark` to <html> (see _Layout's flash-free init script).
  darkMode: "class",
  theme: {
    extend: {
      // Semantic tokens — all resolve to CSS variables defined per-theme in app.css, so a single
      // class set drives both light and dark. The `<alpha-value>` slot keeps Tailwind opacity mods
      // (e.g. bg-surface/80) working against the variable.
      colors: {
        canvas: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        raised: "rgb(var(--surface-2) / <alpha-value>)",
        hairline: {
          DEFAULT: "rgb(var(--border) / <alpha-value>)",
          strong: "rgb(var(--border-strong) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--text) / <alpha-value>)",
          muted: "rgb(var(--text-muted) / <alpha-value>)",
          faint: "rgb(var(--text-faint) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          strong: "rgb(var(--accent-strong) / <alpha-value>)",
          fg: "rgb(var(--accent-fg) / <alpha-value>)",
        },
        free: "rgb(var(--free) / <alpha-value>)",
        // Kept for back-compat with existing markup; now token-driven.
        kairos: {
          block: "rgb(var(--accent) / <alpha-value>)",
          gcal: "rgb(var(--gcal) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        // Soft, layered elevation that reads well on both light and dark canvases.
        card: "0 1px 2px rgb(var(--shadow) / 0.04), 0 4px 16px -4px rgb(var(--shadow) / 0.10)",
        lift: "0 4px 12px -2px rgb(var(--shadow) / 0.12), 0 12px 32px -8px rgb(var(--shadow) / 0.22)",
        block: "0 1px 2px rgb(var(--shadow) / 0.08)",
      },
      transitionTimingFunction: {
        snap: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      keyframes: {
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "pop-in": "pop-in 0.14s ease-out",
      },
    },
  },
  plugins: [],
};
