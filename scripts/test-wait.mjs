// Verify blocking whisper_wait against the live browser-hosted MCP server.
// agent-b waits FIRST; agent-a sends ~1.5s later; b's wait should return the
// message in well under the timeout (proving it wakes on arrival).
import { chromium } from "playwright";
import { EventSource } from "eventsource";
import { readFileSync } from "node:fs";

let cfg = {};
try { cfg = JSON.parse(readFileSync("whisper.config.json", "utf8")); } catch {}
const base = `http://${cfg.host || "localhost"}:${cfg.port || 3000}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("text=Launch Claude", { timeout: 15000 });
await page.waitForTimeout(2000);

const urlOf = (dir) =>
  JSON.parse(readFileSync(`agents/${dir}/.mcp.json`, "utf8")).mcpServers["whisper-chat"].args.at(-1);

function client(url) {
  const u = new URL(url);
  const token = u.searchParams.get("token");
  const segs = u.pathname.split("/").filter(Boolean);
  const session = segs.at(-1);
  const b = u.origin + segs.slice(0, -1).map((s) => "/" + s).join("");
  const inbox = `${b}/${session}/inbox?token=${token}`;
  const events = `${b}/${session}/events?token=${token}&direction=outbound`;
  const es = new EventSource(events);
  const waiters = new Map();
  es.addEventListener("mcp", (e) => { const m = JSON.parse(e.data); if (m.id != null && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } });
  let nextId = 10;
  const ready = new Promise((r) => es.addEventListener("open", r, { once: true }));
  const post = (f) => fetch(inbox, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
  const rpc = async (method, params) => { const id = nextId++; const p = new Promise((res) => waiters.set(id, res)); await post({ jsonrpc: "2.0", id, method, params }); return (await p).result; };
  return {
    async init() { await ready; await new Promise((r) => setTimeout(r, 250)); await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } }); await post({ jsonrpc: "2.0", method: "notifications/initialized" }); },
    async call(name, args) { const r = await rpc("tools/call", { name, arguments: args }); return JSON.parse(r.content[0].text); },
    close() { es.close(); },
  };
}

const a = client(urlOf("agent-a"));
const b = client(urlOf("agent-b"));
await Promise.all([a.init(), b.init()]);
await a.call("whisper_register", { id: "agent-a" });
await b.call("whisper_register", { id: "agent-b" });

const t0 = Date.now();
const waitP = b.call("whisper_wait", { for: "agent-b", timeoutSeconds: 25 }); // blocks
await new Promise((r) => setTimeout(r, 1500));
const sendT = Date.now();
await a.call("whisper_send", { from: "agent-a", to: "agent-b", body: "ping via wait" });
const res = await waitP;
const elapsed = Date.now() - t0;

console.log(JSON.stringify({
  waitReturnedAfterMs: elapsed,
  sentAtMs: sendT - t0,
  wokeOnArrival: !res.timedOut && res.messages.length === 1,
  message: res.messages[0]?.body,
  timedOut: res.timedOut,
}, null, 2));

a.close(); b.close();
await browser.close();
