"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  attachSseRelay,
  type SessionDescriptor,
  type SseRelayTransport,
} from "@particle-academy/agent-integrations/sharing";
import { registerTerminalBridge } from "@particle-academy/agent-integrations/bridges/terminal";
import { createWhisperServer } from "@/lib/mcp/createWhisperServer";
import { WhisperStore } from "@/lib/mcp/whisperState";
import { buildAgentRelayUrl, getStableSessionDescriptor, registerSession, relayBaseUrl } from "@/lib/session";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { AgentPanel } from "./AgentPanel";
import { ShortcutsProvider } from "./CommandCenter";
import { SessionBar } from "./SessionBar";
import { WhisperLog } from "./WhisperLog";

type Agent = { id: string; termId: string; dir: string; label: string };

const AGENTS: Agent[] = [
  { id: "agent-a", termId: "term-a", dir: "agent-a", label: "Agent A · Researcher" },
  { id: "agent-b", termId: "term-b", dir: "agent-b", label: "Agent B · Coder" },
];

/** Live handle to one agent's terminal, populated by its AgentPanel. */
type TerminalApi = { write: (data: string) => void; getBuffer?: () => string };

/** Render a delivered whisper as one line of agent input, tagged so the receiver
 *  knows it's from a peer agent — not the human operator. */
function formatInject(msg: { from: string; body: string }): string {
  const oneLine = msg.body.replace(/\r?\n+/g, " / ").trim();
  return `[whisper from ${msg.from}] ${oneLine}\r`;
}

export function WhisperChat() {
  // Stable single instance; its internals mutate and we re-render via bump().
  const [store] = useState(() => new WhisperStore());

  // Bump to re-render whenever whisper state mutates (tool calls).
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const [relayReady, setRelayReady] = useState(false);
  const [agentUrls, setAgentUrls] = useState<Record<string, string>>({});

  // Live terminal handles, keyed by agent id; each AgentPanel registers its own.
  // The push deliverer + the terminal bridge both write through these.
  const terminalsRef = useRef<Record<string, TerminalApi>>({});
  const registerTerminal = useCallback((id: string, api: TerminalApi | null) => {
    if (api) terminalsRef.current[id] = api;
    else delete terminalsRef.current[id];
  }, []);

  useEffect(() => {
    // No ref-guard here: React StrictMode (dev) intentionally mounts twice.
    // The `cancelled` flag aborts the first, partially-completed run during
    // its cleanup so only the live mount ends up with attached transports.
    const server = createWhisperServer(store, () => bump());

    // In-spec push delivery: the kit's terminal bridge wraps each terminal's
    // input write (so it broadcasts AgentActivity), and the whisper store
    // delivers messages through these same handles. `write` is wired to the
    // PTY-input channel so it feeds the agent's stdin (not just the display).
    registerTerminalBridge(server, {
      terminals: () =>
        AGENTS.map((a) => ({
          id: a.id,
          label: a.label,
          getBuffer: () => terminalsRef.current[a.id]?.getBuffer?.() ?? "",
          write: (data: string) => terminalsRef.current[a.id]?.write?.(data),
        })),
    });

    const transports: SseRelayTransport[] = [];
    let cancelled = false;

    (async () => {
      const baseUrl = relayBaseUrl();
      const descriptors: Record<string, SessionDescriptor> = {};
      const urls: Record<string, string> = {};

      for (const agent of AGENTS) {
        const descriptor = getStableSessionDescriptor(agent.id);
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
  // Stable signal of which agents are online (registered) — drives the effect below.
  const onlineKey = AGENTS.map((a) => (peerIds.has(a.id) ? a.id : "-")).join(",");

  // Push delivery: register a deliverer for each ONLINE agent so the store pushes
  // straight into its terminal (no whisper_wait polling). Gated on online so we
  // never inject into a shell where claude isn't running yet; messages for an
  // offline agent queue and drain the moment it registers (setDeliverer drains).
  useEffect(() => {
    const online = new Set(store.listPeers().map((p) => p.id));
    for (const a of AGENTS) {
      if (online.has(a.id)) {
        store.setDeliverer(a.id, (msg) => {
          const w = terminalsRef.current[a.id]?.write;
          if (!w) return;
          w(formatInject(msg)); // tagged line + Enter
          // Submit nudge: if the recipient was mid-turn when this landed, the
          // Enter can buffer without submitting. A follow-up Enter once it's idle
          // flushes it; an empty Enter at the prompt is a no-op, so this is safe.
          setTimeout(() => terminalsRef.current[a.id]?.write?.("\r"), 3000);
        });
      } else {
        store.setDeliverer(a.id, null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, onlineKey]);

  return (
    <ThemeProvider>
      <ShortcutsProvider onReset={handleReset}>
        <div className="flex h-dvh flex-col text-ink">
          {/* Theme accent / flag stripe — the showcase for the pride & flag themes. */}
          <div className="h-1 w-full shrink-0" style={{ background: "var(--stripe)" }} />

          <SessionBar
            relayReady={relayReady}
            peerCount={peers.length}
            agentUrls={AGENTS.map((a) => ({ id: a.id, label: a.label.split(" ")[1] ?? a.id, url: agentUrls[a.id] ?? "" }))}
            onReset={handleReset}
          />

          <main className="flex min-h-0 flex-1 divide-x divide-line">
            {AGENTS.map((a) => (
              <AgentPanel
                key={a.id}
                termId={a.termId}
                agentId={a.id}
                label={a.label}
                cwd={`agents/${a.dir}`}
                online={peerIds.has(a.id)}
                registerTerminal={registerTerminal}
              />
            ))}
          </main>

          <WhisperLog entries={store.transcript} />
        </div>
      </ShortcutsProvider>
    </ThemeProvider>
  );
}
