/**
 * E2E — the MVP claim, over the real relay wire.
 *
 * This is the headline proof: two agents, each a separate relay MCP client,
 * exchange a message through the embedded relay broker — no files, no shared
 * memory between the clients. It exercises the genuine SSE + POST relay
 * transport, the JSON-RPC framing, and the whisper bridge together.
 *
 * What it stands up:
 *   - Host side (stands in for the browser tab): the IDENTICAL code the React
 *     app runs — createWhisperServer + one attachSseRelay transport per agent
 *     session — with only the EventSource/window browser shims a tab provides.
 *   - Client side (stands in for `claude` + mcp-relay-client): two relay
 *     clients connecting to the two session URLs.
 *
 * PREREQUISITE: the app must be running so the relay broker is mounted:
 *     npm run dev
 * Then:
 *     npm run test:e2e        (or: tsx tests/e2e/whisper-roundtrip.ts)
 *
 * Exit code 0 = pass, 1 = fail. This script is NOT run by the unit/integration
 * suite because it needs a live server.
 */
import { EventSource } from "eventsource";
// Browser shims: SseRelayTransport guards on `window` and a global EventSource,
// both of which a real browser tab provides natively.
const g = globalThis as unknown as { EventSource: typeof EventSource; window: unknown };
g.EventSource = EventSource;
g.window = globalThis;

import { readFileSync } from "node:fs";
import { attachSseRelay, createSessionDescriptor } from "@particle-academy/agent-integrations/sharing";
import { createWhisperServer } from "../../src/lib/mcp/createWhisperServer";
import { WhisperStore } from "../../src/lib/mcp/whisperState";
import { makeRelayClient } from "./helpers/relayClient.mjs";

function baseUrl(): string {
  let cfg: { host?: string; port?: number } = {};
  try {
    cfg = JSON.parse(readFileSync("whisper.config.json", "utf8"));
  } catch {
    /* defaults below */
  }
  const host = process.env.HOST || cfg.host || "localhost";
  const port = process.env.PORT || cfg.port || 3000;
  return `http://${host}:${port}`;
}

const RELAY_BASE = `${baseUrl()}/relay`;
const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function registerSession(id: string, token: string) {
  const res = await fetch(`${RELAY_BASE}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session: id, token }),
  });
  if (!res.ok) throw new Error(`relay register failed for ${id}: ${res.status} ${await res.text()}`);
}

async function main() {
  // Sanity: is the relay reachable at all?
  try {
    const probe = await registerSession(createSessionDescriptor().id, "probe-token-1234567890");
    void probe;
  } catch (e) {
    console.error(
      `\nCannot reach the relay at ${RELAY_BASE}.\n` +
        `Start the app first:  npm run dev\n\n${(e as Error).message}`,
    );
    process.exit(1);
  }

  // ---- Host side: the browser-tab code path ----
  const store = new WhisperStore();
  const server = createWhisperServer(store, () => {});
  const urls: Record<string, string> = {};
  for (const id of ["agent-a", "agent-b"]) {
    const d = createSessionDescriptor();
    await registerSession(d.id, d.token);
    attachSseRelay(server, { baseUrl: RELAY_BASE, sessionId: d.id, token: d.token });
    urls[id] = `${RELAY_BASE}/${d.id}?token=${encodeURIComponent(d.token)}`;
  }

  // ---- Client side: two independent relay agents ----
  const a = makeRelayClient(urls["agent-a"]);
  const b = makeRelayClient(urls["agent-b"]);

  const [aInfo, bInfo] = await Promise.all([a.init(), b.init()]);
  check("both agents complete the MCP initialize handshake", aInfo?.serverInfo?.name === "whisper-chat" && bInfo?.serverInfo?.name === "whisper-chat", aInfo?.serverInfo?.name);

  const reg = await a.call("whisper_register", { id: "agent-a", name: "Researcher" });
  await b.call("whisper_register", { id: "agent-b", name: "Coder" });
  check("agent-a registers over the relay", reg.ok === true);

  const peers = await a.call("whisper_peers");
  check("both peers are visible in the shared session", Array.isArray(peers.peers) && peers.peers.length === 2, `${peers.peers?.length} peers`);

  // A → B via poll. The envelope's `marker` magic string is what the bridge
  // routes on (see WHISPER_MARKER in src/lib/mcp/whisperProtocol.ts).
  const MARKER = "Chl0e 1$ a g0dd3$$ 1533$7&9p";
  const sent = await a.call("whisper_send", { marker: MARKER, from: "agent-a", to: "agent-b", body: "ping from A" });
  check("agent-a sends a whisper to agent-b", sent.ok === true && sent.recipients?.[0]?.online === true);

  const got = await b.call("whisper_poll", { for: "agent-b" });
  check(
    "agent-b receives the whisper (cross-agent, no files)",
    got.messages?.length === 1 && got.messages[0].from === "agent-a" && got.messages[0].body === "ping from A",
    got.messages?.[0]?.body,
  );

  // B → A via blocking wait (the autonomous back-and-forth path)
  const t0 = Date.now();
  const waitP = a.call("whisper_wait", { for: "agent-a", timeoutSeconds: 25 });
  await new Promise((r) => setTimeout(r, 300));
  await b.call("whisper_send", { marker: MARKER, from: "agent-b", to: "agent-a", body: "pong from B" });
  const woke = await waitP;
  const elapsed = Date.now() - t0;
  check(
    "agent-a's whisper_wait wakes on B's reply (well under the timeout)",
    woke.timedOut === false && woke.messages?.[0]?.body === "pong from B" && elapsed < 10000,
    `${elapsed}ms`,
  );

  a.close();
  b.close();

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
