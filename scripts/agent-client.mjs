// Minimal relay MCP client for testing. Usage:
//   node scripts/agent-client.mjs <url> <toolName> '<jsonArgs>'
import { EventSource } from "eventsource";

const [, , url, toolName, argsJson] = process.argv;
const u = new URL(url);
const token = u.searchParams.get("token");
const segs = u.pathname.split("/").filter(Boolean);
const session = segs[segs.length - 1];
const base = u.origin + segs.slice(0, -1).map((s) => "/" + s).join("");
const inbox = `${base}/${session}/inbox?token=${token}`;
const events = `${base}/${session}/events?token=${token}&direction=outbound`;

const post = (frame) =>
  fetch(inbox, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(frame) });

const waiters = new Map();
const es = new EventSource(events);
es.addEventListener("mcp", (e) => {
  let m;
  try { m = JSON.parse(e.data); } catch { return; }
  if (m.id != null && waiters.has(m.id)) {
    waiters.get(m.id)(m);
    waiters.delete(m.id);
  }
});
const await_ = (id, ms = 5000) =>
  new Promise((res, rej) => {
    waiters.set(id, res);
    setTimeout(() => { if (waiters.delete(id)) rej(new Error(`timeout id=${id}`)); }, ms);
  });

await new Promise((r) => es.addEventListener("open", r, { once: true }));
await new Promise((r) => setTimeout(r, 300)); // let outbound sub register

await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "agent-client", version: "1" } } });
const init = await await_(1);
console.error("[init ok]", init.result?.serverInfo?.name);
await post({ jsonrpc: "2.0", method: "notifications/initialized" });

await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: toolName, arguments: JSON.parse(argsJson || "{}") } });
const r = await await_(3);
const text = r.result?.content?.[0]?.text;
console.log(text ?? JSON.stringify(r));
es.close();
process.exit(0);
