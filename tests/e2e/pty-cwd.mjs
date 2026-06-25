/**
 * E2E — each panel's PTY is rooted in its own agent folder.
 *
 * The "separate folder root per agent" requirement is what keeps the two
 * Claude sessions isolated (each reads only its own CLAUDE.md / .mcp.json).
 * This opens both terminal WebSockets, runs `pwd` in each, and asserts the
 * shell's cwd matches the expected agent directory.
 *
 * PREREQUISITE: the app must be running:  npm run dev
 * Then:                                   node tests/e2e/pty-cwd.mjs
 *
 * Exit code 0 = pass, 1 = fail. Not part of the unit/integration suite
 * (needs a live server + a real PTY).
 */
import WebSocket from "ws";
import { readFileSync } from "node:fs";

let cfg = {};
try {
  cfg = JSON.parse(readFileSync("whisper.config.json", "utf8"));
} catch {
  /* defaults */
}
const host = process.env.HOST || cfg.host || "localhost";
const port = process.env.PORT || cfg.port || 3000;

const CASES = [
  { term: "term-a", expect: "agents/agent-a" },
  { term: "term-b", expect: "agents/agent-b" },
];

function checkTerm({ term, expect }) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${host}:${port}/api/terminal/ws?term=${term}`);
    let buf = "";
    const timer = setTimeout(() => {
      ws.close();
      resolve({ term, ok: false, detail: "timeout (is `npm run dev` running?)" });
    }, 8000);

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "resize", cols: 100, rows: 30 }));
      setTimeout(() => ws.send(JSON.stringify({ type: "data", data: "pwd\r" })), 400);
    });
    ws.on("message", (raw) => {
      try {
        const m = JSON.parse(raw.toString());
        if (m.type === "data") {
          buf += m.data;
          if (buf.includes(expect)) {
            clearTimeout(timer);
            ws.close();
            resolve({ term, ok: true, detail: `cwd contains ${expect}` });
          }
        }
      } catch {
        /* ignore non-JSON frames */
      }
    });
    ws.on("error", (e) => {
      clearTimeout(timer);
      resolve({ term, ok: false, detail: `ws error: ${e.message}` });
    });
  });
}

const results = [];
for (const c of CASES) results.push(await checkTerm(c));

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.term}  — ${r.detail}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} terminals rooted correctly.`);
process.exit(failed === 0 ? 0 : 1);
