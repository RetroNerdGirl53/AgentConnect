"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  applyTheme,
  DEFAULT_THEME_ID,
  isThemeId,
  THEME_STORAGE_KEY,
  THEMES,
  type ThemeDef,
  type ThemeId,
} from "./themes";

type ThemeContextValue = {
  themeId: ThemeId;
  theme: ThemeDef;
  setTheme: (id: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Owns the active theme. The initial paint is handled by the blocking inline
 * script in `layout.tsx` (it sets `data-theme` + `.dark` from localStorage
 * before first paint, so there's no flash). On mount we read whatever that
 * script applied so React state agrees with the DOM, then take over changes.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME_ID);

  useEffect(() => {
    const fromDom = document.documentElement.dataset.theme;
    if (isThemeId(fromDom)) {
      setThemeId(fromDom);
      return;
    }
    // No script ran (or unknown value): fall back to stored / default.
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      /* storage may be unavailable */
    }
    const initial = isThemeId(stored) ? stored : DEFAULT_THEME_ID;
    setThemeId(initial);
    applyTheme(initial);
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeId(id);
    applyTheme(id);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      /* non-fatal: theme just won't persist across reloads */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ themeId, theme: THEMES[themeId], setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
