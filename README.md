# WhisperChat

Two Claude Code sessions, each in its own terminal and folder, talking to each
other through **MCP tools hosted in the browser tab** — no files, no copy‑paste,
no human relay. Built with **Next.js + react‑fancy + fancy‑term +
@particle-academy/agent-integrations**.

```bash
./install.sh        # check toolchain + install deps
npm run dev         # serve on the host/port in whisper.config.json
```

Then open the printed URL, click **Launch Claude** in both panels, and prompt
agent-a once. Full walkthrough: **[docs/getting-started.md](./docs/getting-started.md)**.

## Documentation

| Doc | For |
|-----|-----|
| [Getting Started](./docs/getting-started.md) | Clone → two agents talking |
| [How It Works](./docs/how-it-works.md) | Architecture primer (the system as built) |
| [How-To](./docs/how-to.md) | Recipes + troubleshooting |
| [docs/](./docs/README.md) · [DESIGN.md](./DESIGN.md) | Index + original design notes |

## What runs where

One custom Node server (`server.ts`) serves three things on the same origin:

| Concern | Where | Package |
|---|---|---|
| Two-panel UI, terminals, whisper activity log | browser | `react-fancy`, `fancy-term` |
| In-tab MCP server + `whisper_*` tools | browser | `agent-integrations` (`MicroMcpServer`) |
| Relay broker (`/relay`) bridging external agents ↔ the tab | Node | `agent-integrations/relay-server` |
| PTY shells per panel (`/api/terminal/ws`) | Node | `node-pty` |
| Writes each agent's `.mcp.json` (`/api/session`) | Node | Next route handler |

External agents (Claude in a PTY) reach the in-tab tools via `mcp-relay-client`
pointed at a per-agent session URL.

### Two sessions, not one

The browser mints **one relay session per agent** and attaches one
`SseRelayTransport` per session to a single shared `MicroMcpServer`. This
diverges deliberately from the original `docs/02` "one session, two peers"
sketch: with a single shared session both agents subscribe to the *same*
outbound SSE stream and would receive each other's JSON-RPC responses
(id collisions). One session per agent gives each its own response stream and
keeps the shared whisper state in the one server.

## Configuration

Edit `whisper.config.json` at the project root:

```json
{
  "host": "192.168.1.104",   // bind address (use "0.0.0.0" for all interfaces)
  "port": 3000,
  "agentsRoot": "./agents",  // where the two agent shells are spawned
  "allowedDevOrigins": []    // extra LAN origins; the bound host is added automatically
}
```

`HOST`, `PORT`, and `AGENTS_ROOT` environment variables override the file for a
single run. The browser always derives its origin from the URL you open, so
setting `host` here is all that's needed to reach it from another machine —
open `http://<host>:<port>`.

## Run it

```bash
npm install
npm run dev          # serves on the host/port from whisper.config.json
```

1. Open `http://localhost:3000`. The tab mints two sessions, registers them with
   the relay, and writes `agents/agent-a/.mcp.json` + `agents/agent-b/.mcp.json`.
2. In the left panel click **Launch Claude** (or type `claude`); same on the right.
3. Each Claude reads its `CLAUDE.md` + `.mcp.json`, registers over whisper, and
   they converse. Watch the **Whisper activity** bar light up A→B then B→A.

`.mcp.json` files are gitignored (they carry the live session token).

## Verify without a browser / without Claude

The whisper bridge is the MVP. You can prove it end‑to‑end headlessly:

```bash
# terminal 1 — the app (relay + UI)
npm run dev

# terminal 2 — host the in-tab MCP server in Node (browser stand-in)
npm run host:headless          # prints HOST_URL agent-a … and HOST_URL agent-b …

# terminal 3 — drive the two agents through the relay
node scripts/agent-client.mjs "<agent-a-url>" whisper_register '{"id":"agent-a"}'
node scripts/agent-client.mjs "<agent-b-url>" whisper_register '{"id":"agent-b"}'
node scripts/agent-client.mjs "<agent-a-url>" whisper_send '{"from":"agent-a","to":"agent-b","body":"hi"}'
node scripts/agent-client.mjs "<agent-b-url>" whisper_poll '{"for":"agent-b"}'   # -> receives "hi"
```

`scripts/headless-host.ts` runs the *identical* server/bridge/transport code the
browser runs (it only shims `window` + `EventSource`, which a browser provides).
`scripts/agent-client.mjs` mirrors how `mcp-relay-client` connects.

Terminal backend check: `npm run test:pty` opens `term-a`, runs `pwd`, and
asserts the shell is in `agents/agent-a`.

> Note: the bundled `mcp-relay-client` (what `.mcp.json` uses) and the Node test
> client both work. The bash `connect.sh` reference client has an SSE-buffering
> quirk on the `call` path in some shells — prefer the npm client.

## Whisper tools

`whisper_register` · `whisper_peers` · `whisper_send` · `whisper_poll` ·
**`whisper_wait`** (see [`docs/03-whisper-bridge.md`](./docs/03-whisper-bridge.md)).
Messages live in the tab's memory until consumed; closing the tab ends the session.

### Making the agents actually talk

Two things make autonomous agent↔agent conversation work without hand-holding:

- **`whisper_wait` (blocking receive).** It returns the moment a message arrives
  (or empty after ~25s). An agent waits for a reply with one in-flight tool call
  instead of being told to poll in a loop. `whisper_poll` (non-blocking) is still
  there for one-shot checks. `whisper_send` also queues to a peer that hasn't
  registered yet, so startup order doesn't matter.
- **Pre-approved MCP server.** `/api/session` writes
  `agents/<id>/.claude/settings.local.json` with
  `{"enabledMcpjsonServers":["whisper-chat"]}`, so `claude` connects without a
  trust prompt.

The agent `CLAUDE.md` files drive a self-running send → wait → respond loop
(agent-a initiates, agent-b responds), so you only prompt the first agent once.

## License

[GPL-3.0-or-later](./LICENSE). © RetroNerdGirl53.
