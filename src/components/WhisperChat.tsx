"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import {
  attachSseRelay,
  createSessionDescriptor,
  type SessionDescriptor,
  type SseRelayTransport,
} from "@particle-academy/agent-integrations/sharing";
import { createWhisperServer } from "@/lib/mcp/createWhisperServer";
import { WhisperStore } from "@/lib/mcp/whisperState";
import { buildAgentRelayUrl, registerSession, relayBaseUrl } from "@/lib/session";
import { AgentPanel } from "./AgentPanel";
import { SessionBar } from "./SessionBar";
import { WhisperLog } from "./WhisperLog";

type Agent = { id: string; termId: string; dir: string; label: string };

const AGENTS: Agent[] = [
  { id: "agent-a", termId: "term-a", dir: "agent-a", label: "Agent A · Researcher" },
  { id: "agent-b", termId: "term-b", dir: "agent-b", label: "Agent B · Coder" },
];

export function WhisperChat() {
  // Stable single instance; its internals mutate and we re-render via bump().
  const [store] = useState(() => new WhisperStore());

  // Bump to re-render whenever whisper state mutates (tool calls).
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const [relayReady, setRelayReady] = useState(false);
  const [agentUrls, setAgentUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    // No ref-guard here: React StrictMode (dev) intentionally mounts twice.
    // The `cancelled` flag aborts the first, partially-completed run during
    // its cleanup so only the live mount ends up with attached transports.
    const server = createWhisperServer(store, () => bump());
    const transports: SseRelayTransport[] = [];
    let cancelled = false;

    (async () => {
      const baseUrl = relayBaseUrl();
      const descriptors: Record<string, SessionDescriptor> = {};
      const urls: Record<string, string> = {};

      for (const agent of AGENTS) {
        const descriptor = createSessionDescriptor();
        descriptors[agent.id] = descriptor;
        urls[agent.id] = buildAgentRelayUrl(descriptor);
        await registerSession(descriptor);
        if (cancelled) return;
      }
      setAgentUrls(urls);

      // One transport per agent session: separate response streams, no
      // JSON-RPC id cross-talk between the two agents.
      const open = new Array(AGENTS.length).fill(false);
      AGENTS.forEach((agent, i) => {
        const d = descriptors[agent.id];
        const transport = attachSseRelay(server, { baseUrl, sessionId: d.id, token: d.token });
        transport.onStateChange((s) => {
          open[i] = s === "open";
          setRelayReady(open.every(Boolean));
        });
        transports.push(transport);
      });

      // Write each agent's .mcp.json so `claude` in that panel gets the tools.
      try {
        await fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            agents: AGENTS.map((a) => ({ dir: a.dir, url: urls[a.id] })),
          }),
        });
      } catch {
        /* non-fatal: user can still copy URLs manually */
      }
    })();

    return () => {
      cancelled = true;
      for (const t of transports) t.close();
    };
  }, [store]);

  const handleReset = useCallback(() => {
    store.reset();
    bump();
  }, [store]);

  const peers = store.listPeers();
  const peerIds = new Set(peers.map((p) => p.id));

  return (
    <div className="flex h-dvh flex-col bg-neutral-950 text-neutral-200">
      <SessionBar
        relayReady={relayReady}
        peerCount={peers.length}
        agentUrls={AGENTS.map((a) => ({ id: a.id, label: a.label.split(" ")[1] ?? a.id, url: agentUrls[a.id] ?? "" }))}
        onReset={handleReset}
      />

      <main className="flex min-h-0 flex-1 divide-x divide-neutral-800">
        {AGENTS.map((a) => (
          <AgentPanel
            key={a.id}
            termId={a.termId}
            agentId={a.id}
            label={a.label}
            cwd={`agents/${a.dir}`}
            online={peerIds.has(a.id)}
          />
        ))}
      </main>

      <WhisperLog entries={store.transcript} />
    </div>
  );
}
