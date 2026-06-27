---
name: run-whisper-chat
description: >
  Build, launch, and drive the WhisperChat app — start the server, open it in a
  headless browser, register the two agents (agent-a / agent-b), and run the
  cross-agent whisper conversation loop end-to-end, with a screenshot of the
  live UI. Use when asked to run / start / launch / smoke-test / screenshot
  WhisperChat, register the agents, or kick off the whisper loop.
---

# Run WhisperChat

WhisperChat is a Next.js 16 app where two Claude Code sessions, each in a
side-by-side `fancy-term` terminal, talk through `whisper_*` MCP tools hosted
**in the browser tab**. The tab runs a `MicroMcpServer` + whisper bridge and
exposes one relay session per agent; external agents connect to those session
URLs via `mcp-relay-client`.

You drive it with **`.claude/skills/run-whisper-chat/driver.mjs`** — a headless
Chromium (Playwright) script that opens the app (which hosts the MCP server and
writes `agents/*/.mcp.json`), then connects to the relay as `agent-a` and
`agent-b` and runs a `send → whisper_wait → reply` loop. It's the deterministic
stand-in for two real Claude agents, and it's how you verify the whole pipe
(UI + relay + whisper bridge) in one shot.

> Paths below are relative to the repo root (the unit). The driver lives at
> `.claude/skills/run-whisper-chat/driver.mjs`.

## Prerequisites

- Node 20+ and dependencies installed: `npm install`
- Playwright's Chromium (used by the driver): `npx playwright install chromium`
  — already present in this repo's setup; the driver uses it directly.

## Build (optional sanity check)

```bash
npm run build
```

Compiles + type-checks. (One Turbopack warning about `next.config.ts` NFT
tracing is pre-existing and harmless.)

## Run — agent path (this is the one to use)

**1. Start the server** (in its own shell; it's long-running):

```bash
npm run dev
```

It binds to the host/port in `whisper.config.json` — **committed as
`192.168.1.104:3000`**. Override per-run with env vars:

```bash
HOST=127.0.0.1 PORT=3000 npm run dev
```

Wait for `> WhisperChat ready on http://<host>:<port>`.

**2. Register the agents and run the whisper loop** (separate shell, repo root):

```bash
node .claude/skills/run-whisper-chat/driver.mjs --rounds 3 \
  --shot /tmp/whisperchat-loop.png \
  --base http://192.168.1.104:3000
```

`--base` must match where the server is actually listening (see Gotchas).
Flags: `--rounds N` (default 3), `--shot PATH` (default `/tmp/whisperchat-loop.png`),
`--base URL` (default `http://${HOST:-127.0.0.1}:${PORT:-3000}`).

The agents exchange a short time-of-day greeting (Good morning/afternoon/evening)
— just enough to confirm the channel works end to end. Verified output (2 rounds,
run in the afternoon):

```
→ opening http://192.168.1.104:3000/ (tab hosts the whisper MCP server)
→ session URLs written:
   agent-a http://192.168.1.104:3000/relay/<id>?token=…
   agent-b http://192.168.1.104:3000/relay/<id>?token=…
→ registering agents
→ running 2-round whisper loop (greeting: "Good afternoon")
   round 1: b heard "Good afternoon, agent-b! 👋"  |  a heard "Good afternoon, agent-a! 👋"
   round 2: b heard "Good afternoon, agent-b! 👋"  |  a heard "Good afternoon, agent-a! 👋"
{ "rounds": 2, "relayBadge": "relay connected", "peersBadge": "peers 2/2",
  "activityEvents": 8, "pageErrors": [], "screenshot": "/tmp/whisperchat-loop.png" }
✓ agents registered and the whisper loop ran end-to-end.
```

The driver exits non-zero (with a clear message) if it can't reach the server,
if the tab never wrote `agents/*/.mcp.json`, if the UI had a page error, or if
the peers badge never reaches `2/2`. The screenshot at `--shot` shows both
agents `registered`, `peers 2/2`, and the conversation in the activity log.

## Run — real Claude agents (the actual product loop)

The driver simulates the agents; to run the *real* loop, launch `claude` in each
agent folder once the tab is open (the tab writes each folder's `.mcp.json` so
the `whisper-chat` MCP server is pre-configured and pre-approved):

```bash
# tab open (npm run dev + load http://<host>:<port>/ in a browser), then:
cd agents/agent-a && claude    # reads agents/agent-a/CLAUDE.md — initiates
cd agents/agent-b && claude    # reads agents/agent-b/CLAUDE.md — responds
```

Each `CLAUDE.md` drives a self-running `whisper_register → send → whisper_wait`
loop (a greets b with a time-of-day greeting, b greets back). Requires a
logged-in `claude` CLI; nondeterministic, so the driver above is the path to
verify *plumbing*.

## Gotchas

- **The server does not bind `localhost` by default.** `whisper.config.json`
  pins `192.168.1.104:3000`. The driver defaults `--base` to `127.0.0.1:3000`,
  so on a default `npm run dev` you **must** pass `--base http://192.168.1.104:3000`
  (or start the server with `HOST=127.0.0.1`). Mismatch → "could not reach".
- **Opening the tab rewrites `agents/*/.mcp.json`.** The committed file holds a
  placeholder/stale session URL; `POST /api/session` overwrites it with the live
  session on load. Expected runtime churn — don't commit the rewrite.
- **`whisper_wait` drains the existing queue first**, so the driver's
  `send → wait` ping-pong is race-free (no need to start the wait before the
  send). See `src/lib/mcp/whisperState.ts` `waitFor`.
- **One relay session per agent**, not one shared session — a shared outbound
  SSE stream would collide the two agents' JSON-RPC response ids.
- **Sandboxed / CI shells may not be able to bind a port** (the listen syscall
  gets killed → exit 144) or reach a server running in another network
  namespace. Run the driver from the same environment/netns as the server. From
  a Claude Code session whose shell is sandboxed, have the user run the driver
  with the `!` prefix instead.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `could not reach http://…` | Server not up there. `ss -ltnp \| grep :3000` to find the real port; pass a matching `--base`. |
| `the tab never wrote agents/*/.mcp.json` | `/api/session` failed — check the server log and the page console; ensure `agents/agent-a` and `agents/agent-b` exist and are writable. |
| `peers badge never reached 2/2` | Relay didn't connect both sessions; confirm `--base` origin equals the server origin (the relay URL is derived from the page origin). |
| Driver can't find `playwright` | Run it from the repo root so bare imports resolve from `./node_modules`; `npx playwright install chromium` if Chromium is missing. |
| Server start exits `144` immediately | You're in a sandbox that blocks binding a listening socket. Start the server in an unsandboxed shell. |
