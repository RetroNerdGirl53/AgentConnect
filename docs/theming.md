# Theming

WhisperChat ships a token-driven theme system: one set of semantic CSS variables,
swapped per theme by a `data-theme` attribute on `<html>`. Flipping that attribute
re-skins the whole app — chrome **and** both xterm terminals — live, with no reload.

## How it works

- **Tailwind v4 `@theme inline`** (`src/app/globals.css`) maps semantic tokens to
  live CSS vars, so utilities reference the variable instead of inlining a value:
  `bg-canvas` → `var(--bg)`, `text-ink` → `var(--text)`, `border-line`,
  `text-accent`, `bg-surface`, `bg-raised`, `text-muted`, `text-faint`, etc.
- Each theme is a `[data-theme="<id>"]` block in `globals.css` that sets the runtime
  vars (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`,
  `--text-dim`, `--accent`, `--accent-2`) plus `--app-font`, `--bg-image`, `--stripe`,
  and the FX vars (`--text-glow`, `--fx-overlay`, …).
- react-fancy reads `--fancy-glow` for focus rings; `:root` sets it to `var(--accent)`
  so the glow follows whatever theme is active.
- **Dark vs light**: a theme's `mode` toggles react-fancy's `.dark` class on `<html>`
  (light themes drop it). The list of light themes lives in two places that MUST stay
  in sync: `LIGHT_THEME_IDS` in `themes.ts`, and the inlined array in the no-flash
  script in `src/app/layout.tsx`.
- **No flash on reload**: a blocking inline script in `layout.tsx` reads the saved
  theme from `localStorage` and sets `data-theme` + `.dark` before first paint.
  `<html>` carries `suppressHydrationWarning` because that script intentionally
  diverges from the server-rendered default.

## File map

| File | Role |
|------|------|
| `src/lib/theme/themes.ts` | Theme registry: `THEMES`, `THEME_ORDER`, `DEFAULT_THEME_ID`, `LIGHT_THEME_IDS`; the shared `ANSI` / `ANSI_LIGHT` xterm palettes; per-theme xterm `terminal` objects + `terminalFont`; `applyTheme()`. |
| `src/app/globals.css` | `@theme inline` token map + one `[data-theme]` block per theme + the `.term-stage` background layer. |
| `src/lib/theme/ThemeProvider.tsx` | `ThemeProvider` + `useTheme()`; persists to `localStorage`, syncs with the no-flash script. |
| `src/components/ThemeSwitcher.tsx` | Dropdown switcher with swatches (in the session bar). |
| `src/components/CommandCenter.tsx` | `⌘K` command palette + `⌘/` shortcuts help + global key handler (`Alt+]`/`Alt+[` cycle themes). |
| `src/app/layout.tsx` | Fonts (Geist, Geist Mono, JetBrains Mono) + the no-flash theme script. |

## The themes

Midnight (default), Terminal Green, Terminal Amber, Synthwave, Progress Pride,
Trans Pride, Watermelon, Pastel, Clouds, Lindows XB. Order is `THEME_ORDER`.

## Terminals (fancy-term / xterm)

The terminals are the fancy-ui `Terminal` component (`@particle-academy/fancy-term`),
which uses xterm's **DOM renderer**. Each theme supplies an xterm color theme via the
`terminal` field (xterm `ITheme`) and a `terminalFont`.

- **Menu contrast.** Claude's TUI marks the *selected* autocomplete row with ANSI
  palette **15** and unselected rows with **7**. The shared `ANSI` base deliberately
  spreads them — `7` is a muted gray (`#c4c4cb`), `15` is pure white (`#ffffff`) — so
  the selection is visible (a brightness-only gap, no background/hue).
- **Light themes use dark terminals.** Claude's TUI leans on light/white text, so a
  light terminal background hides its menu + emphasis. The light themes (Trans,
  Watermelon, Pastel, …) therefore pair soft light *chrome* with a **deep, theme-tinted
  terminal** + the dark `ANSI` base, so output stays legible. If you ever want a truly
  light terminal, you must darken the per-theme ANSI 7/15 (and friends) so Claude's
  light text doesn't wash out.

### Background art behind a terminal (the Watermelon pattern)

xterm only supports solid background colors, so to put an image behind the text:

1. Give the terminal container the `term-stage` class (already on the wrapper in
   `AgentPanel.tsx`).
2. Paint the art on `[data-theme="..."] .term-stage` (background-color + tiled
   image; a 50%-ish veil layer dims the art).
3. Make the xterm surface transparent so the container shows through. **Gotcha:** the
   DOM renderer paints `theme.background` onto **`.xterm-scrollable-element`** (not
   `.xterm`/`.xterm-viewport`), so that selector is the key one in the
   `background-color: transparent !important` override.

See the `[data-theme="pink-green"]` rules in `globals.css` and
`public/themes/watermelon/melon-drip.png` (a downscaled, spaced tile).

## Adding a theme

1. Add the id to the `ThemeId` union and a `THEMES[id]` entry in `themes.ts`
   (`label`, `hint`, `mode`, `swatch`, `terminal`, `terminalFont`).
2. Add it to `THEME_ORDER`.
3. Add a `[data-theme="<id>"]` block in `globals.css` with the runtime vars.
4. If it's a **light** theme, `LIGHT_THEME_IDS` derives from `mode` automatically —
   but confirm the no-flash script's inlined light-id array in `layout.tsx` matches.

## Keyboard shortcuts

`⌘/Ctrl+K` command palette · `⌘/Ctrl+/` shortcuts help · `Alt+]` / `Alt+[` cycle
themes. The handler is capture-phase and `stopPropagation`s so the keys never reach a
focused terminal. See `CommandCenter.tsx`.
