"use client";

import { useState } from "react";
import { Button, Dropdown, cn } from "@particle-academy/react-fancy";

/**
 * Split button: the main button launches `claude` in the agent's terminal; the
 * caret opens a dropdown of permission modes (the ones you cycle with Shift+Tab).
 * Picking a mode sets it; the main button then launches in that mode via
 * `claude --permission-mode <flag>` (plain `claude` for Default — identical to
 * the old behavior).
 */

type ModeKey = "default" | "acceptEdits" | "plan" | "bypassPermissions";

type Mode = {
  key: ModeKey;
  label: string;
  short: string;
  hint: string;
  /** `--permission-mode` value; null = launch plain `claude`. */
  flag: string | null;
  danger?: boolean;
};

/** Initial prompt sent with `claude` so the agent starts its CLAUDE.md loop
 *  immediately (registers + begins the whisper exchange) instead of idling. */
const KICKOFF = "Begin now: follow your CLAUDE.md instructions and start the whisper exchange.";

const MODES: Mode[] = [
  { key: "default", label: "Default", short: "Default", hint: "Ask for approval (normal)", flag: null },
  { key: "acceptEdits", label: "Auto-Accept Edits", short: "Accept Edits", hint: "Auto-approve file edits", flag: "acceptEdits" },
  { key: "plan", label: "Plan Mode", short: "Plan", hint: "Plan first — no changes", flag: "plan" },
  {
    key: "bypassPermissions",
    label: "YOLO Mode",
    short: "YOLO",
    hint: "Skip all permission checks",
    flag: "bypassPermissions",
    danger: true,
  },
];

export function LaunchClaudeButton({ sendText }: { sendText: (text: string) => void }) {
  const [modeKey, setModeKey] = useState<ModeKey>("default");
  const mode = MODES.find((m) => m.key === modeKey) ?? MODES[0];
  const isDanger = !!mode.danger;

  const launch = () => {
    // Pass an initial prompt so the agent actually STARTS: interactive `claude`
    // loads CLAUDE.md as context but won't act until prompted, so a bare launch
    // sits idle and never registers (peers stays 0/2). The kickoff makes it run
    // its CLAUDE.md loop immediately. JSON.stringify gives a shell-safe quoted arg.
    const flags = mode.flag ? ` --permission-mode ${mode.flag}` : "";
    sendText(`claude${flags} ${JSON.stringify(KICKOFF)}\r`);
  };

  return (
    <div className="inline-flex">
      <Button
        size="sm"
        variant="default"
        warn={isDanger}
        className="rounded-r-none"
        onClick={launch}
        title={`Launch Claude — ${mode.label} (${mode.flag ? `--permission-mode ${mode.flag}` : "default"})`}
      >
        {modeKey === "default" ? "Launch Claude" : `Launch · ${mode.short}`}
      </Button>
      <Dropdown placement="bottom-end" offset={6}>
        <Dropdown.Trigger>
          <Button
            size="sm"
            variant="default"
            warn={isDanger}
            aria-label="Choose permission mode"
            title="Choose permission mode"
            className="-ml-px rounded-l-none border-l border-black/15 px-1.5"
          >
            <span aria-hidden>▾</span>
          </Button>
        </Dropdown.Trigger>
        <Dropdown.Items className="w-60">
          {MODES.map((m) => (
            <Dropdown.Item key={m.key} danger={m.danger} onClick={() => setModeKey(m.key)}>
              <span className="flex w-full items-center gap-2">
                <span className={cn("w-3 shrink-0 text-center", m.key === modeKey ? "opacity-100" : "opacity-0")}>
                  ✓
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{m.label}</span>
                  <span className="truncate text-xs opacity-60">{m.hint}</span>
                </span>
              </span>
            </Dropdown.Item>
          ))}
        </Dropdown.Items>
      </Dropdown>
    </div>
  );
}
