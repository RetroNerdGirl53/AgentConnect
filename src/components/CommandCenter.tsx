"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Command, Modal, cn } from "@particle-academy/react-fancy";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { THEME_ORDER, THEMES } from "@/lib/theme/themes";

/**
 * Keyboard shortcuts + command palette + a discoverable help sheet.
 *
 * The app is dominated by two xterm terminals that greedily consume keystrokes,
 * so every shortcut is modifier-based and intercepted on `window` in the
 * **capture** phase: when one matches we `preventDefault` + `stopPropagation`,
 * which halts the event before it can descend to the focused terminal. Plain
 * keys are never touched, so normal typing flows through untouched.
 */

const isMac =
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

export const MOD = isMac ? "⌘" : "Ctrl";

/** Single source of truth — drives both the help sheet and the palette hints. */
export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: [MOD, "K"], label: "Open command palette" },
  { keys: [MOD, "/"], label: "Show keyboard shortcuts" },
  { keys: ["Alt", "]"], label: "Next theme" },
  { keys: ["Alt", "["], label: "Previous theme" },
];

type ShortcutsContextValue = {
  openPalette: () => void;
  openHelp: () => void;
  nextTheme: () => void;
  prevTheme: () => void;
};

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

export function useShortcuts(): ShortcutsContextValue {
  const ctx = useContext(ShortcutsContext);
  if (!ctx) throw new Error("useShortcuts must be used within <ShortcutsProvider>");
  return ctx;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.6rem] items-center justify-center rounded border border-line bg-raised px-1.5 py-0.5 font-sans text-[11px] font-medium leading-none text-muted">
      {children}
    </kbd>
  );
}

function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k, i) => (
        <Kbd key={i}>{k}</Kbd>
      ))}
    </span>
  );
}

export function ShortcutsProvider({
  onReset,
  children,
}: {
  onReset: () => void;
  children: React.ReactNode;
}) {
  const { themeId, setTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const cycle = useCallback(
    (dir: 1 | -1) => {
      const i = THEME_ORDER.indexOf(themeId);
      const next = THEME_ORDER[(i + dir + THEME_ORDER.length) % THEME_ORDER.length];
      setTheme(next);
    },
    [themeId, setTheme],
  );

  const nextTheme = useCallback(() => cycle(1), [cycle]);
  const prevTheme = useCallback(() => cycle(-1), [cycle]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      let handled = true;

      if (mod && !e.altKey && e.key.toLowerCase() === "k") {
        setPaletteOpen((o) => !o);
      } else if (mod && !e.altKey && e.key === "/") {
        setHelpOpen((o) => !o);
      } else if (e.altKey && !mod && e.code === "BracketRight") {
        nextTheme();
      } else if (e.altKey && !mod && e.code === "BracketLeft") {
        prevTheme();
      } else {
        handled = false;
      }

      if (handled) {
        // Capture phase: stop the event before it reaches a focused terminal.
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [nextTheme, prevTheme]);

  const value = useMemo<ShortcutsContextValue>(
    () => ({
      openPalette: () => setPaletteOpen(true),
      openHelp: () => setHelpOpen(true),
      nextTheme,
      prevTheme,
    }),
    [nextTheme, prevTheme],
  );

  return (
    <ShortcutsContext.Provider value={value}>
      {children}

      <Command open={paletteOpen} onClose={() => setPaletteOpen(false)}>
        <Command.Input placeholder="Search themes & actions…" />
        <Command.List>
          <Command.Group heading="Theme">
            {THEME_ORDER.map((id) => {
              const t = THEMES[id];
              return (
                <Command.Item
                  key={id}
                  value={`${t.label} ${t.hint} theme`}
                  onSelect={() => {
                    setTheme(id);
                    setPaletteOpen(false);
                  }}
                >
                  <span className="flex w-full items-center gap-2.5">
                    <span
                      aria-hidden
                      className="inline-flex h-3.5 w-6 shrink-0 overflow-hidden rounded-full ring-1 ring-black/15"
                    >
                      {t.swatch.map((c, i) => (
                        <span key={i} className="h-full flex-1" style={{ backgroundColor: c }} />
                      ))}
                    </span>
                    <span className="flex-1">{t.label}</span>
                    {id === themeId && <span className="text-accent">●</span>}
                  </span>
                </Command.Item>
              );
            })}
          </Command.Group>

          <Command.Group heading="Actions">
            <Command.Item
              value="next theme cycle"
              onSelect={() => {
                nextTheme();
                setPaletteOpen(false);
              }}
            >
              Next theme
            </Command.Item>
            <Command.Item
              value="previous theme cycle"
              onSelect={() => {
                prevTheme();
                setPaletteOpen(false);
              }}
            >
              Previous theme
            </Command.Item>
            <Command.Item
              value="keyboard shortcuts help"
              onSelect={() => {
                setPaletteOpen(false);
                setHelpOpen(true);
              }}
            >
              Keyboard shortcuts…
            </Command.Item>
            <Command.Item
              value="reset session whisper transcript"
              onSelect={() => {
                onReset();
                setPaletteOpen(false);
              }}
            >
              Reset session
            </Command.Item>
          </Command.Group>

          <Command.Empty>No matches.</Command.Empty>
        </Command.List>
      </Command>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} size="sm">
        <Modal.Header>Keyboard shortcuts</Modal.Header>
        <Modal.Body>
          <ul className="flex flex-col gap-2.5">
            {SHORTCUTS.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-4">
                <span className="text-sm text-ink">{s.label}</span>
                <KeyCombo keys={s.keys} />
              </li>
            ))}
          </ul>
          <p className={cn("mt-4 text-xs text-faint")}>
            Press <Kbd>{MOD}</Kbd> <Kbd>K</Kbd> any time to search themes and actions.
          </p>
        </Modal.Body>
      </Modal>
    </ShortcutsContext.Provider>
  );
}
