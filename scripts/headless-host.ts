/**
 * Headless WhisperChat host — stands in for the browser tab during testing.
 *
 * It runs the IDENTICAL server code path the React app uses: a MicroMcpServer
 * with the whisper bridge, attached to one SSE relay transport per agent
 * session. The only browser shim is a global EventSource polyfill (the browser
 * provides this natively; Node does not).
 *
 * Usage: tsx scripts/headless-host.ts
 * Prints each agent's relay URL, then stays alive hosting the tools.
 */
import { EventSource } from "eventsource";
// Browser shims: SseRelayTransport guards on `window` and uses a global
// `EventSource`. The real app runs in a browser tab where both exist.
const g = globalThis as unknown as { EventSource: typeof EventSource; window: unknown };
g.EventSource = EventSource;
g.window = globalThis;

import { attachSseRelay, createSessionDescriptor } from "@particle-academy/agent-integrations/sharing";
import { createWhisperServer } from "../src/lib/mcp/createWhisperServer";
import { WhisperStore } from "../src/lib/mcp/whisperState";

const RELAY_BASE = process.env.RELAY_BASE || "http://localhost:3000/relay";
const AGENTS = ["agent-a", "agent-b"];

async function registerSession(id: string, token: string) {
  const res = await fetch(`${RELAY_BASE}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session: id, token }),
  });
  if (!res.ok) throw new Error(`register ${id} failed: ${res.status} ${await res.text()}`);
}

async function main() {
  const store = new WhisperStore();
  const server = createWhisperServer(store, () => {
    const last = store.transcript[store.transcript.length - 1];
    if (last) console.log(`[whisper] ${last.kind} ${last.from} → ${last.to}: ${JSON.stringify(last.body)}`);
  });

  for (const id of AGENTS) {
    const d = createSessionDescriptor();
    await registerSession(d.id, d.token);
    const transport = attachSseRelay(server, { baseUrl: RELAY_BASE, sessionId: d.id, token: d.token });
    transport.onStateChange((s) => console.log(`[relay ${id}] state=${s}`));
    const url = `${RELAY_BASE}/${d.id}?token=${encodeURIComponent(d.token)}`;
    console.log(`HOST_URL ${id} ${url}`);
  }

  console.log("HOST_READY hosting whisper tools; waiting for agents…");
  setInterval(() => {}, 1 << 30); // keep alive
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
