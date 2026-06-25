"use client";

import { Dropdown, cn } from "@particle-academy/react-fancy";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { THEME_ORDER, THEMES, type ThemeDef } from "@/lib/theme/themes";

function Swatch({ colors, className }: { colors: string[]; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 w-7 shrink-0 overflow-hidden rounded-full ring-1 ring-black/15",
        className,
      )}
      aria-hidden
    >
      {colors.map((c, i) => (
        <span key={i} className="h-full flex-1" style={{ backgroundColor: c }} />
      ))}
    </span>
  );
}

export function ThemeSwitcher() {
  const { themeId, theme, setTheme } = useTheme();

  return (
    <Dropdown placement="bottom-end" offset={6}>
      <Dropdown.Trigger>
        <button
          type="button"
          title="Change theme"
          className={cn(
            "flex items-center gap-2 rounded-md border border-line bg-raised/70 px-2.5 py-1.5",
            "text-xs font-medium text-ink transition-colors hover:bg-raised",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
          )}
        >
          <Swatch colors={theme.swatch} />
          <span className="hidden sm:inline">{theme.label}</span>
          <span aria-hidden className="text-faint">▾</span>
        </button>
      </Dropdown.Trigger>
      <Dropdown.Items className="max-h-[70vh] w-60 overflow-y-auto">
        {THEME_ORDER.map((id) => {
          const t: ThemeDef = THEMES[id];
          const active = id === themeId;
          return (
            <Dropdown.Item key={id} onClick={() => setTheme(id)}>
              <span className="flex w-full items-center gap-2.5">
                <Swatch colors={t.swatch} />
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {t.label}
                    {active && <span className="text-accent">●</span>}
                  </span>
                  <span className="truncate text-xs opacity-60">{t.hint}</span>
                </span>
              </span>
            </Dropdown.Item>
          );
        })}
      </Dropdown.Items>
    </Dropdown>
  );
}
