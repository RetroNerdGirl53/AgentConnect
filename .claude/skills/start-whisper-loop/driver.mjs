// start-whisper-loop driver — listen, and keep listening. Nothing else.
//
// This is the LISTENING half of run-whisper-chat's driver, on its own:
//   - does NOT build, open a browser, research, or whisper_register
//     (run /run-whisper-chat first — it registers the agents and writes the
//      session URLs into agents/<id>/.mcp.json that this script reads)
//   - connects to the existing relay session(s) and loops `whisper_wait`,
//     printing whatever arrives and re-arming the wait on each timeout.
//
// Note: whisper_wait CONSUMES the messages it returns, so this listener drains
// the inbox(es) it watches — run it AS an agent's ear, not alongside a real
// `claude` already waiting on the same session.
//
// Usage (from repo root):
//   node .claude/skills/start-whisper-loop/driver.mjs            # both agents, forever
//   node .claude/skills/start-whisper-loop/driver.mjs --for agent-b
//   node .claude/skills/start-whisper-loop/driver.mjs --timeout 25 --max 3
import { EventSource } from "eventsource";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../../.."); // .claude/skills/start-whisper-loop -> repo root

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};

const which = arg("--for", "both");
const timeoutSeconds = Number(arg("--timeout", "25"));
const maxRounds = Number(arg("--max", "0")); // 0 = loop forever (until Ctrl-C)
const agents = which === "both" ? ["agent-a", "agent-b"] : [which];

// Minimal relay MCP client — same wire protocol as mcp-relay-client. We perform
// the MCP `initialize` handshake (required to call any tool) but deliberately
// do NOT call whisper_register.
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
  const rpc = async (method, params, timeoutMs = 60000) => {
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
        clientInfo: { name: "whisper-listener", version: "1" },
      });
      await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    },
    async wait(id, secs) {
      const r = await rpc("tools/call", { name: "whisper_wait", arguments: { for: id, timeoutSeconds: secs } }, (secs + 10) * 1000);
      return JSON.parse(r.content[0].text);
    },
    close() {
      es.close();
    },
  };
}

const urlOf = (dir) =>
  JSON.parse(readFileSync(path.join(REPO, "agents", dir, ".mcp.json"), "utf8")).mcpServers["whisper-chat"].args.at(-1);

const stamp = () => new Date().toLocaleTimeString([], { hour12: false });

// One independent listening loop per agent, all running concurrently.
async function listen(id) {
  let url;
  try {
    url = urlOf(id);
  } catch {
    console.error(`✗ no session URL for ${id} — run /run-whisper-chat first.`);
    return;
  }
  const client = relayClient(url);
  await client.init();
  console.log(`👂 ${id} listening (whisper_wait, ${timeoutSeconds}s) — ${url}`);

  let round = 0;
  while (maxRounds === 0 || round < maxRounds) {
    round++;
    const res = await client.wait(id, timeoutSeconds);
    if (res.messages?.length) {
      for (const m of res.messages) {
        console.log(`[${stamp()}] ${m.from} → ${id}: ${m.body}`);
      }
    } else {
      console.log(`[${stamp()}] ${id}: … (timed out, listening again)`);
    }
  }
  client.close();
  console.log(`✓ ${id} finished after ${round} round(s).`);
}

let stopping = false;
process.on("SIGINT", () => {
  if (stopping) process.exit(130);
  stopping = true;
  console.log("\n↩ stopping listener…");
  process.exit(0);
});

await Promise.all(agents.map(listen));
