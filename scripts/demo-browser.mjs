// End-to-end demo against the REAL browser-hosted MCP server:
//  1. open WhisperChat in headless Chromium (the tab hosts MicroMcpServer)
//  2. read the per-agent session URLs the tab wrote into agents/*/.mcp.json
//  3. drive a whisper exchange through the relay as two external agents
//  4. screenshot the activity log + dump the on-screen transcript
import { chromium } from "playwright";
import { EventSource } from "eventsource";
import { readFileSync } from "node:fs";

let cfg = {};
try { cfg = JSON.parse(readFileSync("whisper.config.json", "utf8")); } catch {}
const base = `http://${cfg.host || "localhost"}:${cfg.port || 3000}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("text=Launch Claude", { timeout: 15000 });
await page.waitForTimeout(2000); // let it register sessions + write .mcp.json

const urlOf = (dir) =>
  JSON.parse(readFileSync(`agents/${dir}/.mcp.json`, "utf8")).mcpServers["whisper-chat"].args.at(-1);
const A = urlOf("agent-a");
const B = urlOf("agent-b");

// minimal relay MCP client (same protocol as mcp-relay-client)
async function call(url, tool, args) {
  const u = new URL(url);
  const token = u.searchParams.get("token");
  const segs = u.pathname.split("/").filter(Boolean);
  const session = segs.at(-1);
  const b = u.origin + segs.slice(0, -1).map((s) => "/" + s).join("");
  const inbox = `${b}/${session}/inbox?token=${token}`;
  const events = `${b}/${session}/events?token=${token}&direction=outbound`;
  const es = new EventSource(events);
  const waiters = new Map();
  es.addEventListener("mcp", (e) => {
    const m = JSON.parse(e.data);
    if (m.id != null && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
  });
  const wait = (id) => new Promise((res, rej) => { waiters.set(id, res); setTimeout(() => rej(new Error("timeout")), 5000); });
  const post = (f) => fetch(inbox, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
  await new Promise((r) => es.addEventListener("open", r, { once: true }));
  await new Promise((r) => setTimeout(r, 250));
  await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "demo", version: "1" } } });
  await wait(1);
  await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: tool, arguments: args } });
  const r = await wait(3);
  es.close();
  return r.result?.content?.[0]?.text;
}

console.log("register a:", await call(A, "whisper_register", { id: "agent-a", name: "Research Agent" }));
console.log("register b:", await call(B, "whisper_register", { id: "agent-b", name: "Coder Agent" }));
console.log("A → B     :", await call(A, "whisper_send", { from: "agent-a", to: "agent-b", body: "Can you write fib(n) in Python?" }));
console.log("B polls   :", await call(B, "whisper_poll", { for: "agent-b" }));
console.log("B → A     :", await call(B, "whisper_send", { from: "agent-b", to: "agent-a", body: "def fib(n): return n if n<2 else fib(n-1)+fib(n-2)" }));
console.log("A polls   :", await call(A, "whisper_poll", { for: "agent-a" }));

await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/whisperchat-demo.png", fullPage: true });

const peers = await page.locator("text=/peers \\d\\/2/").first().textContent();
const log = await page.locator("section[aria-label='Whisper activity'] li").allTextContents();
console.log("\nUI peers badge:", peers);
console.log("UI activity log:");
for (const l of log) console.log("  " + l.replace(/\s+/g, " ").trim());

await browser.close();
