import type { TerminalTheme } from "@particle-academy/fancy-term";

/**
 * WhisperChat theming.
 *
 * The visual system is token-driven: `globals.css` declares semantic CSS
 * variables (`--bg`, `--surface`, `--accent`, …) per `[data-theme="<id>"]`
 * block, and Tailwind v4 `@theme inline` exposes them as utilities
 * (`bg-canvas`, `text-ink`, `border-line`, `text-accent`, …). Swapping the
 * `data-theme` attribute on <html> re-skins the whole app live.
 *
 * This module is the TypeScript side of that contract: the ordered registry
 * the switcher renders, the light/dark flag that toggles react-fancy's `.dark`
 * class, the picker swatches, and the matching xterm.js terminal palettes
 * (canvas-rendered colors that can't come from CSS vars, so they live here).
 */

export type ThemeId =
  | "midnight"
  | "terminal-green"
  | "terminal-amber"
  | "progress"
  | "trans"
  | "pink-green"
  | "synthwave"
  | "clouds"
  | "xp"
  | "pastel";

export type ThemeMode = "dark" | "light";

export type ThemeDef = {
  id: ThemeId;
  label: string;
  hint: string;
  /** Drives react-fancy's `.dark` ancestor class on <html>. */
  mode: ThemeMode;
  /** 3–4 representative colors for the switcher swatch. */
  swatch: string[];
  /** xterm.js color theme for both agent terminals. */
  terminal: TerminalTheme;
  /** xterm font-family (DOM renderer resolves CSS vars). */
  terminalFont: string;
};

const MONO_DEFAULT = "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace";
const MONO_TERMINAL = "var(--font-jetbrains), ui-monospace, SFMono-Regular, monospace";

/** Shared ANSI 16-color base; per-theme terminals override the surface trio. */
const ANSI = {
  black: "#1a1a1a",
  red: "#f43f5e",
  green: "#10b981",
  yellow: "#f59e0b",
  blue: "#3b82f6",
  magenta: "#a855f7",
  cyan: "#22d3ee",
  white: "#e4e4e7",
  brightBlack: "#52525b",
  brightRed: "#fb7185",
  brightGreen: "#34d399",
  brightYellow: "#fbbf24",
  brightBlue: "#60a5fa",
  brightMagenta: "#c084fc",
  brightCyan: "#67e8f9",
  brightWhite: "#fafafa",
} as const;

/** ANSI base tuned for light terminal surfaces (darker primaries for contrast). */
const ANSI_LIGHT = {
  ...ANSI,
  black: "#3f3f46",
  red: "#dc2626",
  green: "#059669",
  yellow: "#b45309",
  blue: "#2563eb",
  magenta: "#7c3aed",
  cyan: "#0891b2",
  white: "#fafafa",
  brightBlack: "#71717a",
} as const;

export const THEMES: Record<ThemeId, ThemeDef> = {
  midnight: {
    id: "midnight",
    label: "Midnight",
    hint: "The original — neutral dark + violet glow",
    mode: "dark",
    swatch: ["#0a0a0a", "#a855f7", "#38bdf8"],
    terminalFont: MONO_DEFAULT,
    terminal: {
      ...ANSI,
      background: "#0a0a0a",
      foreground: "#e5e5e5",
      cursor: "#a855f7",
      cursorAccent: "#0a0a0a",
      selectionBackground: "#3f3f46",
    },
  },

  "terminal-green": {
    id: "terminal-green",
    label: "Terminal Green",
    hint: "Glowing CRT phosphor green",
    mode: "dark",
    swatch: ["#001100", "#39ff14", "#7dffb0"],
    terminalFont: MONO_TERMINAL,
    terminal: {
      ...ANSI,
      background: "#000d00",
      foreground: "#39ff14",
      cursor: "#39ff14",
      cursorAccent: "#000d00",
      selectionBackground: "#0a5a0a",
      green: "#39ff14",
      brightGreen: "#7dffb0",
    },
  },

  "terminal-amber": {
    id: "terminal-amber",
    label: "Terminal Amber",
    hint: "Glowing CRT amber monochrome",
    mode: "dark",
    swatch: ["#0a0600", "#ffb000", "#ffd27d"],
    terminalFont: MONO_TERMINAL,
    terminal: {
      ...ANSI,
      background: "#0a0600",
      foreground: "#ffb000",
      cursor: "#ffb000",
      cursorAccent: "#0a0600",
      selectionBackground: "#5a3a0a",
      yellow: "#ffb000",
      brightYellow: "#ffd27d",
    },
  },

  progress: {
    id: "progress",
    label: "Progress Pride",
    hint: "Dark slate under the progress pride flag",
    mode: "dark",
    swatch: ["#14121a", "#ff3b6b", "#4d9fff"],
    terminalFont: MONO_DEFAULT,
    terminal: {
      ...ANSI,
      background: "#14121a",
      foreground: "#f5f3f7",
      cursor: "#ff3b6b",
      cursorAccent: "#14121a",
      selectionBackground: "#3a3346",
    },
  },

  trans: {
    id: "trans",
    label: "Trans Pride",
    hint: "Soft sky-blue, pink & white",
    mode: "light",
    swatch: ["#5bcefa", "#f5a9b8", "#ffffff"],
    terminalFont: MONO_DEFAULT,
    terminal: {
      ...ANSI_LIGHT,
      background: "#f3fbff",
      foreground: "#2a3b47",
      cursor: "#5bcefa",
      cursorAccent: "#f3fbff",
      selectionBackground: "#cfe7f5",
    },
  },

  "pink-green": {
    id: "pink-green",
    label: "Watermelon",
    hint: "Bright pink with fresh green",
    mode: "light",
    swatch: ["#fff0f6", "#ec4899", "#22c55e"],
    terminalFont: MONO_DEFAULT,
    terminal: {
      ...ANSI_LIGHT,
      background: "#fff5f9",
      foreground: "#3d2230",
      cursor: "#ec4899",
      cursorAccent: "#fff5f9",
      selectionBackground: "#f9c6dd",
      green: "#16a34a",
      magenta: "#db2777",
    },
  },

  synthwave: {
    id: "synthwave",
    label: "Synthwave",
    hint: "Neon magenta & cyan over deep indigo",
    mode: "dark",
    swatch: ["#150d2e", "#ff2bd6", "#2de2e6"],
    terminalFont: MONO_DEFAULT,
    terminal: {
      ...ANSI,
      background: "#150d2e",
      foreground: "#f7e6ff",
      cursor: "#ff2bd6",
      cursorAccent: "#150d2e",
      selectionBackground: "#4a2d8f",
      magenta: "#ff2bd6",
      cyan: "#2de2e6",
      brightMagenta: "#ff7bff",
      brightCyan: "#7df9ff",
    },
  },

  clouds: {
    id: "clouds",
    label: "Clouds",
    hint: "Airy sky blues and soft white",
    mode: "light",
    swatch: ["#dff1fb", "#60a5fa", "#a78bfa"],
    terminalFont: MONO_DEFAULT,
    terminal: {
      ...ANSI_LIGHT,
      background: "#f3f9fe",
      foreground: "#2b3d4a",
      cursor: "#60a5fa",
      cursorAccent: "#f3f9fe",
      selectionBackground: "#cfe6f4",
    },
  },

  xp: {
    id: "xp",
    label: "Windows XP",
    hint: "Luna blue, beige chrome & start-menu green",
    mode: "light",
    swatch: ["#245edc", "#ece9d8", "#3c9311"],
    terminalFont: MONO_DEFAULT,
    terminal: {
      ...ANSI_LIGHT,
      background: "#1d1d1d",
      foreground: "#dcdccc",
      cursor: "#3c9311",
      cursorAccent: "#1d1d1d",
      selectionBackground: "#245edc",
      blue: "#245edc",
      green: "#3c9311",
    },
  },

  pastel: {
    id: "pastel",
    label: "Pastel",
    hint: "Soft muted lavender, mint & pink",
    mode: "light",
    swatch: ["#faf7fd", "#c4a7e7", "#a8e6cf"],
    terminalFont: MONO_DEFAULT,
    terminal: {
      ...ANSI_LIGHT,
      background: "#fbf9fe",
      foreground: "#4a4458",
      cursor: "#c4a7e7",
      cursorAccent: "#fbf9fe",
      selectionBackground: "#e7def3",
      magenta: "#a78bdb",
      green: "#5fcf9f",
    },
  },
};

/** Switcher display order. */
export const THEME_ORDER: ThemeId[] = [
  "midnight",
  "terminal-green",
  "terminal-amber",
  "synthwave",
  "progress",
  "trans",
  "pink-green",
  "pastel",
  "clouds",
  "xp",
];

export const DEFAULT_THEME_ID: ThemeId = "midnight";

export const THEME_STORAGE_KEY = "whisperchat-theme";

/** Theme ids that are *light* (react-fancy `.dark` removed). Kept in sync with
 *  the inline no-flash script in `layout.tsx`. */
export const LIGHT_THEME_IDS: ThemeId[] = THEME_ORDER.filter(
  (id) => THEMES[id].mode === "light",
);

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && value in THEMES;
}

/** Apply a theme to <html>: set `data-theme` and toggle the `.dark` class. */
export function applyTheme(id: ThemeId): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.dataset.theme = id;
  el.classList.toggle("dark", THEMES[id].mode === "dark");
}
