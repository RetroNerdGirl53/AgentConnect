"use client";

import { useState } from "react";
import { Badge, Button } from "@particle-academy/react-fancy";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { Kbd, MOD, useShortcuts } from "./CommandCenter";

export type SessionBarProps = {
  relayReady: boolean;
  peerCount: number;
  agentUrls: { id: string; label: string; url: string }[];
  onReset: () => void;
};

export function SessionBar({ relayReady, peerCount, agentUrls, onReset }: SessionBarProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const { openPalette, openHelp } = useShortcuts();

  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard may be unavailable over http on some browsers */
    }
  };

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface/80 px-4 py-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight text-ink">WhisperChat</span>
        <span className="text-xs text-faint">cross-agent MCP bridge</span>
      </div>

      <div className="flex items-center gap-2">
        <Badge color={relayReady ? "emerald" : "amber"} variant="soft" size="sm" dot>
          {relayReady ? "relay connected" : "connecting"}
        </Badge>
        <Badge color={peerCount >= 2 ? "emerald" : "neutral"} variant="soft" size="sm">
          peers {peerCount}/2
        </Badge>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {agentUrls.map((a) => (
          <Button
            key={a.id}
            size="sm"
            variant="ghost"
            onClick={() => copy(a.id, a.url)}
            disabled={!a.url}
            title={a.url}
          >
            {copied === a.id ? "✓ copied" : `Copy ${a.label} URL`}
          </Button>
        ))}
        <Button size="sm" variant="ghost" warn onClick={onReset}>
          Reset
        </Button>

        <button
          type="button"
          onClick={openPalette}
          title="Command palette"
          className="flex items-center gap-1.5 rounded-md border border-line bg-raised/70 px-2 py-1.5 text-xs text-muted transition-colors hover:bg-raised hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <span className="hidden sm:inline">Search</span>
          <span className="flex items-center gap-1">
            <Kbd>{MOD}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>

        <button
          type="button"
          onClick={openHelp}
          title={`Keyboard shortcuts (${MOD} /)`}
          aria-label="Keyboard shortcuts"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-raised/70 text-sm text-muted transition-colors hover:bg-raised hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          ?
        </button>

        <ThemeSwitcher />
      </div>
    </header>
  );
}
