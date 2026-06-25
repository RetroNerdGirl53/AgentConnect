/**
 * Shared relay MCP client for the e2e tests.
 *
 * Mirrors how `mcp-relay-client` (the thing each agent's .mcp.json launches)
 * talks to the embedded relay broker: it derives the inbox (POST) and events
 * (SSE) endpoints from a session URL, runs the MCP `initialize` handshake, and
 * correlates tool-call replies by JSON-RPC id.
 *
 * Usage:
 *   import { makeRelayClient } from "./helpers/relayClient.mjs";
 *   const a = makeRelayClient(url);
 *   await a.init();
 *   const res = await a.call("whisper_register", { id: "agent-a" });
 *   a.close();
 */
import { EventSource } from "eventsource";
import { readFileSync } from "node:fs";

export function makeRelayClient(url) {
  const u = new URL(url);
  const token = u.searchParams.get("token");
  const segs = u.pathname.split("/").filter(Boolean);
  const session = segs.at(-1);
  const base = u.origin + segs.slice(0, -1).map((s) => "/" + s).join("");
  const inbox = `${base}/${session}/inbox?token=${token}`;
  const events = `${base}/${session}/events?token=${token}&direction=outbound`;

  const es = new EventSource(events);
  const waiters = new Map();
  let nextId = 10;

  es.addEventListener("mcp", (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (m.id != null && waiters.has(m.id)) {
      waiters.get(m.id)(m);
      waiters.delete(m.id);
    }
  });

  const ready = new Promise((resolve) => es.addEventListener("open", resolve, { once: true }));
  const post = (frame) =>
    fetch(inbox, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(frame),
    });

  const rpc = (method, params, timeoutMs = 30000) => {
    const id = nextId++;
    const reply = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(id);
        reject(new Error(`timeout waiting for reply id=${id} (${method})`));
      }, timeoutMs);
      waiters.set(id, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
    });
    return post({ jsonrpc: "2.0", id, method, params }).then(() => reply);
  };

  return {
    async init() {
      await ready;
      await new Promise((r) => setTimeout(r, 250)); // let the outbound subscription register
      const init = await rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "e2e-client", version: "1" },
      });
      await post({ jsonrpc: "2.0", method: "notifications/initialized" });
      return init.result;
    },
    /** Call a tool and return its parsed JSON payload (content[0].text). */
    async call(name, args = {}, timeoutMs = 30000) {
      const r = await rpc("tools/call", { name, arguments: args }, timeoutMs);
      const text = r.result?.content?.[0]?.text;
      return text ? JSON.parse(text) : r.result;
    },
    close() {
      es.close();
    },
  };
}

/** Resolve the base origin from whisper.config.json (+ env overrides). */
export function configuredBaseUrl() {
  let cfg = {};
  try {
    cfg = JSON.parse(readFileSync("whisper.config.json", "utf8"));
  } catch {
    /* fall back to defaults */
  }
  const host = process.env.HOST || cfg.host || "localhost";
  const port = process.env.PORT || cfg.port || 3000;
  return `http://${host}:${port}`;
}
