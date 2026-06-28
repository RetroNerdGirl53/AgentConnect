"use client";

import { useEffect } from "react";
import { Badge, Button, cn } from "@particle-academy/react-fancy";
import { Terminal } from "@particle-academy/fancy-term";
import { useTerminalSocket } from "@/lib/terminal/useTerminalSocket";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { LaunchClaudeButton } from "./LaunchClaudeButton";

export type AgentPanelProps = {
  termId: string;
  agentId: string;
  label: string;
  cwd: string;
  /** true once the agent has registered over whisper (peer is present). */
  online: boolean;
  /** Expose this terminal's input/read handle so the store can push to it. */
  registerTerminal: (id: string, api: { write: (data: string) => void; getBuffer?: () => string } | null) => void;
};

export function AgentPanel({ termId, agentId, label, cwd, online, registerTerminal }: AgentPanelProps) {
  const { setTerminalRef, onData, onResize, sendText, getBuffer, clear, status } = useTerminalSocket(termId);
  const { theme } = useTheme();

  // Publish this terminal's write (PTY stdin) + buffer read so WhisperChat's
  // push deliverer and the terminal bridge can reach into it.
  useEffect(() => {
    registerTerminal(agentId, { write: sendText, getBuffer });
    return () => registerTerminal(agentId, null);
  }, [agentId, sendText, getBuffer, registerTerminal]);

  return (
    <section
      aria-label={`${label} terminal`}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas/30"
    >
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface/40 px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">{label}</span>
            <Badge color={online ? "emerald" : "neutral"} variant="soft" size="sm" dot>
              {online ? "registered" : "idle"}
            </Badge>
          </div>
          <p className="truncate font-mono text-xs text-faint">{cwd}</p>
        </div>
        <div className="flex items-center gap-2">
          <LaunchClaudeButton sendText={sendText} />
          <Button size="sm" variant="ghost" onClick={clear}>
            Clear
          </Button>
        </div>
      </header>

      <div className="term-stage relative min-h-0 flex-1 p-2">
        <Terminal
          ref={setTerminalRef}
          onData={onData}
          onResize={onResize}
          fit
          fontSize={13}
          theme={theme.terminal}
          fontFamily={theme.terminalFont}
          initialOutput={`\x1b[2m# ${agentId} — shell in ${cwd}\x1b[0m\r\n`}
          className="h-full w-full"
        />
        {status !== "open" && (
          <span
            className={cn(
              "absolute right-3 top-3 rounded px-2 py-0.5 text-xs",
              status === "connecting" ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-red-300",
            )}
          >
            {status === "connecting" ? "connecting…" : "disconnected"}
          </span>
        )}
      </div>
    </section>
  );
}
