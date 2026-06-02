// The light/dark/system theme preference, shared by the corner ThemeToggle glyph
// and the Appearance control in /settings so the two surfaces read and write one
// value. Persisted to localStorage (key below) and mirrored on
// `document.documentElement.dataset.themePref` by the flash-free init script in
// layout.tsx, so a control can recover the current pref on mount without state.
//
// Client-only by intent: every function touches window/document. Guarded so an
// accidental server import is a no-op rather than a crash.

export type ThemePref = "light" | "dark" | "system";

export const THEME_KEY = "kairos-theme";

/** Fired on `window` whenever the preference changes, so co-visible controls
 *  (the corner glyph + the settings selector) stay in lockstep without shared
 *  state. `storage` events don't fire in the same document, hence a custom one. */
export const THEME_EVENT = "kairos:themechange";

/** Cycle order for the corner glyph: light → dark → system → light. */
export const NEXT_THEME: Record<ThemePref, ThemePref> = {
  light: "dark",
  dark: "system",
  system: "light",
};

export const THEME_LABEL: Record<ThemePref, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/** The current preference, read from the DOM dataset the init script seeds. */
export function readThemePref(): ThemePref {
  if (typeof document === "undefined") return "system";
  const raw = document.documentElement.dataset.themePref;
  return raw === "light" || raw === "dark" ? raw : "system";
}

/** Apply a preference: toggle `.dark`, record the dataset, persist the choice. */
export function applyThemePref(pref: ThemePref) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = pref === "dark" || (pref === "system" && systemDark);
  root.classList.toggle("dark", dark);
  root.dataset.themePref = pref;
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // private mode, storage disabled, etc. The dataset + class still applied.
  }
  window.dispatchEvent(new CustomEvent<ThemePref>(THEME_EVENT, { detail: pref }));
}
