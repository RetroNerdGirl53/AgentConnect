"use client";

import { useState } from "react";
import { Badge, Button } from "@particle-academy/react-fancy";

export type SessionBarProps = {
  relayReady: boolean;
  peerCount: number;
  agentUrls: { id: string; label: string; url: string }[];
  onReset: () => void;
};

export function SessionBar({ relayReady, peerCount, agentUrls, onReset }: SessionBarProps) {
  const [copied, setCopied] = useState<string | null>(null);

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
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 bg-neutral-900/60 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight text-neutral-100">WhisperChat</span>
        <span className="text-xs text-neutral-500">cross-agent MCP bridge</span>
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
      </div>
    </header>
  );
}
