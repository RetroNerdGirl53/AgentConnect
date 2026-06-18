/**
 * WhisperChat custom server.
 *
 * One Node process serves three things on the same origin:
 *   1. The Next.js app (UI + /api routes)
 *   2. The agent-integrations relay broker, mounted at /relay
 *   3. A WebSocket endpoint at /api/terminal/ws streaming PTY I/O
 *
 * Same-origin keeps the relay CORS-free and means agents connect to the very
 * URL the browser is already serving.
 *
 * Run with: tsx server.ts  (see package.json "dev"/"start").
 */
import { createServer } from "node:http";
import { parse } from "node:url";
import path from "node:path";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import * as pty from "node-pty";
import { createNodeRelay } from "@particle-academy/agent-integrations/relay-server";
import { serverConfig } from "./src/lib/serverConfig";

const dev = process.env.NODE_ENV !== "production";
const { host: hostname, port, agentsRoot: AGENTS_ROOT } = serverConfig;

/** term id -> agent folder name. Each panel runs a shell in its own directory. */
const TERM_DIRS: Record<string, string> = {
  "term-a": "agent-a",
  "term-b": "agent-b",
};

const TERMINAL_WS_PATH = "/api/terminal/ws";
const RELAY_PREFIX = "/relay";

type TermEntry = {
  proc: pty.IPty;
  dataSub: pty.IDisposable | null;
  socket: WebSocket | null;
};

const terminals = new Map<string, TermEntry>();
const defaultShell = process.env.SHELL || (process.platform === "win32" ? "powershell.exe" : "bash");

function ensurePty(termId: string): TermEntry {
  const existing = terminals.get(termId);
  if (existing) return existing;
  const cwd = path.join(AGENTS_ROOT, TERM_DIRS[termId] ?? ".");
  const proc = pty.spawn(defaultShell, [], {
    name: "xterm-color",
    cols: 80,
    rows: 24,
    cwd,
    env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
  });
  const entry: TermEntry = { proc, dataSub: null, socket: null };
  proc.onExit(() => {
    entry.socket?.close();
    terminals.delete(termId);
  });
  terminals.set(termId, entry);
  return entry;
}

function attachSocket(termId: string, socket: WebSocket) {
  const entry = ensurePty(termId);
  // Re-point the PTY at the freshly connected socket (supports reconnects).
  entry.dataSub?.dispose();
  entry.socket = socket;
  entry.dataSub = entry.proc.onData((data) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: "data", data }));
    }
  });

  socket.on("message", (raw) => {
    let msg: { type?: string; data?: string; cols?: number; rows?: number };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === "data" && typeof msg.data === "string") {
      entry.proc.write(msg.data);
    } else if (msg.type === "resize" && msg.cols && msg.rows) {
      try {
        entry.proc.resize(msg.cols, msg.rows);
      } catch {
        /* resize can race a closing pty */
      }
    }
  });

  socket.on("close", () => {
    if (entry.socket === socket) {
      entry.dataSub?.dispose();
      entry.dataSub = null;
      entry.socket = null;
      // Keep the shell alive so a reconnect resumes the same session.
    }
  });
}

async function main() {
  const app = next({ dev, hostname, port });
  await app.prepare();
  const handle = app.getRequestHandler();
  const upgrade = app.getUpgradeHandler();

  const relay = createNodeRelay({ pathPrefix: RELAY_PREFIX, corsAllowOrigin: "*" });

  const server = createServer((req, res) => {
    const pathname = parse(req.url || "/").pathname || "/";
    if (pathname === RELAY_PREFIX || pathname.startsWith(`${RELAY_PREFIX}/`)) {
      relay.handler(req, res);
      return;
    }
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const pathname = parse(req.url || "/").pathname || "/";
    if (pathname === TERMINAL_WS_PATH) {
      const query = parse(req.url || "/", true).query;
      const termId = String(query.term || "");
      if (!TERM_DIRS[termId]) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => attachSocket(termId, ws));
    } else {
      // Hand HMR / other upgrades back to Next.
      upgrade(req, socket, head);
    }
  });

  server.listen(port, hostname, () => {
    console.log(`> WhisperChat ready on http://${hostname}:${port}`);
    console.log(`> relay mounted at  http://${hostname}:${port}${RELAY_PREFIX}`);
    console.log(`> agent shells root ${AGENTS_ROOT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
