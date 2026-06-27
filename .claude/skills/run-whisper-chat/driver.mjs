// run-whisper-chat driver — register both agents and run the whisper loop.
//
// Drives the REAL running app, not a stand-in:
//   1. open WhisperChat in headless Chromium — the tab hosts the MicroMcpServer
//      with the whisper bridge AND writes each agent's session URL into
//      agents/<id>/.mcp.json (via POST /api/session), exactly as a human's tab does.
//   2. connect to the relay as agent-a and agent-b (the same protocol the real
//      `mcp-relay-client` speaks), whisper_register both.
//   3. run an N-round send -> whisper_wait -> reply loop between them — the
//      deterministic stand-in for the two Claude agents' CLAUDE.md loop.
//   4. screenshot the live UI and dump the on-screen transcript.
//
// Usage (from repo root, server already running — see SKILL.md):
//   node .claude/skills/run-whisper-chat/driver.mjs [--rounds N] [--shot PATH] [--base URL]
//
// Bare imports resolve from the repo's node_modules (node walks up from here).
import { chromium } from "playwright";
import { EventSource } from "eventsource";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../../.."); // .claude/skills/run-whisper-chat -> repo root

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};

const rounds = Number(arg("--rounds", "3"));
const shot = arg("--shot", "/tmp/whisperchat-loop.png");
const base =
  arg("--base", null) ||
  `http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || "3000"}`;

const log = (...a) => console.log(...a);
const die = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

// Minimal relay MCP client — same wire protocol as mcp-relay-client / the
// existing scripts/*.mjs. One SSE channel (outbound) + POST inbox per agent.
function relayClient(url) {
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
    if (m.id != null && waiters.has(m.id)) {
      waiters.get(m.id)(m);
      waiters.delete(m.id);
    }
  });
  let nextId = 10;
  const ready = new Promise((r) => es.addEventListener("open", r, { once: true }));
  const post = (f) =>
    fetch(inbox, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
  const rpc = async (method, params, timeoutMs = 30000) => {
    const id = nextId++;
    const p = new Promise((res, rej) => {
      waiters.set(id, res);
      setTimeout(() => waiters.has(id) && (waiters.delete(id), rej(new Error(`rpc timeout: ${method}`))), timeoutMs);
    });
    await post({ jsonrpc: "2.0", id, method, params });
    return (await p).result;
  };
  return {
    async init() {
      await ready;
      await new Promise((r) => setTimeout(r, 250)); // let outbound sub register
      await rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "run-driver", version: "1" },
      });
      await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    },
    async call(name, args) {
      const r = await rpc("tools/call", { name, arguments: args });
      return JSON.parse(r.content[0].text);
    },
    close() {
      es.close();
    },
  };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

log(`→ opening ${base}/ (tab hosts the whisper MCP server)`);
try {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
} catch {
  await browser.close();
  die(`could not reach ${base}. Is the server running?  (HOST=127.0.0.1 PORT=3000 npm run dev)`);
}
await page.waitForSelector("text=Launch Claude", { timeout: 15000 }).catch(() => {});

// Wait until the tab has rewritten .mcp.json with a URL on THIS origin (proves
// the session was registered + the file written for this run, not a stale one).
const mcpPath = (dir) => path.join(REPO, "agents", dir, ".mcp.json");
const urlOf = (dir) => JSON.parse(readFileSync(mcpPath(dir), "utf8")).mcpServers["whisper-chat"].args.at(-1);
const wantHost = new URL(base).host;
let A, B;
for (let i = 0; i < 40; i++) {
  try {
    A = urlOf("agent-a");
    B = urlOf("agent-b");
    if (new URL(A).host === wantHost && new URL(B).host === wantHost) break;
  } catch {
    /* file may be mid-write */
  }
  await new Promise((r) => setTimeout(r, 250));
}
if (!A || !B) {
  await browser.close();
  die("the tab never wrote agents/*/.mcp.json — check the browser console / /api/session");
}
log(`→ session URLs written:\n   agent-a ${A}\n   agent-b ${B}`);

const a = relayClient(A);
const b = relayClient(B);
await Promise.all([a.init(), b.init()]);

log("→ registering agents");
await a.call("whisper_register", { id: "agent-a", name: "Research Agent" });
await b.call("whisper_register", { id: "agent-b", name: "Coder Agent" });

// The whisper envelope's required magic marker (mirrors WHISPER_MARKER in
// src/lib/mcp/whisperProtocol.ts — the bridge rejects sends without it).
const MARKER = "Chl0e 1$ a g0dd3$$ 1533$7&9p";

// Canned exchange — deterministic stand-in for the agents' CLAUDE.md loop.
// Just a friendly time-of-day greeting, enough to prove the round-trip works:
// (a) sends, (b) whisper_wait drains it, (b) greets back, (a) whisper_wait drains it.
const hour = new Date().getHours();
const partOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
const greeting = `Good ${partOfDay}`;

log(`→ running ${rounds}-round whisper loop (greeting: "${greeting}")`);
for (let i = 0; i < rounds; i++) {
  await a.call("whisper_send", { marker: MARKER, from: "agent-a", to: "agent-b", body: `${greeting}, agent-b! 👋` });
  const gotA = await b.call("whisper_wait", { for: "agent-b", timeoutSeconds: 10 });
  await b.call("whisper_send", { marker: MARKER, from: "agent-b", to: "agent-a", body: `${greeting}, agent-a! 👋` });
  const gotB = await a.call("whisper_wait", { for: "agent-a", timeoutSeconds: 10 });
  log(`   round ${i + 1}: b heard "${gotA.messages[0]?.body ?? "∅"}"  |  a heard "${gotB.messages[0]?.body ?? "∅"}"`);
}

// Let the UI re-render the relayed traffic, then capture it.
await page.waitForTimeout(800);
await page.screenshot({ path: shot, fullPage: true });

const peers = await page.locator("text=/peers \\d\\/2/").first().textContent().catch(() => null);
const relay = await page.locator("text=/relay connected|connecting/").first().textContent().catch(() => null);
const activity = await page.locator("section[aria-label='Whisper activity'] li").allTextContents();

a.close();
b.close();
await browser.close();

log("\n── result ─────────────────────────────");
log(JSON.stringify(
  {
    rounds,
    relayBadge: relay,
    peersBadge: peers,
    activityEvents: activity.length,
    pageErrors,
    screenshot: shot,
  },
  null,
  2,
));
log("\nactivity log (from the live UI):");
for (const l of activity) log("  " + l.replace(/\s+/g, " ").trim());

if (pageErrors.length) die(`page had ${pageErrors.length} runtime error(s)`);
if (!/peers 2\/2/.test(peers || "")) die("peers badge never reached 2/2 — agents did not both register");
log("\n✓ agents registered and the whisper loop ran end-to-end.");
