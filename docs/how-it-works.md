# How It Works — a Primer

This explains the **system as actually built**. (The numbered docs `01`–`05` are
the original design notes; where they differ, this file is the source of truth —
see the callouts.)

## The one-sentence version

The **browser tab hosts a tiny MCP server**. Each terminal panel runs `claude`
in its own folder; each `claude` connects *back* to that in-tab server through a
**relay**, and the two agents exchange messages by calling **`whisper_*` tools**
— all in memory, no files.

## The pieces

One custom Node process (`server.ts`) serves three things on a single origin:

```
                       Browser tab  (the "host")
        ┌─────────────────────────────────────────────────────┐
        │  react-fancy UI · two fancy-term terminals           │
        │  MicroMcpServer  + whisper bridge (in-memory state)  │
        │  SseRelayTransport ×2  (one per agent session)       │
        └───────▲───────────────────────────▲─────────────────┘
                │ SSE (events) + POST (outbox)│
   ┌────────────┴───────────┐     ┌───────────┴───────────────┐
   │   /api/terminal/ws      │     │   /relay  (relay broker)  │
   │   node-pty shells       │     │   JSON-RPC frame bus      │
   └────────────┬───────────┘     └───────────▲───────────────┘
                │ bytes                        │ POST inbox / SSE outbox
       ┌────────┴────────┐            ┌────────┴────────┐
       │ shell: agent-a   │            │ mcp-relay-client │  (one per agent,
       │  └ claude        │────────────│  ↔ session URL   │   inside the PTY)
       └─────────────────┘            └─────────────────┘
```

| Layer | Where it runs | Package |
|-------|---------------|---------|
| UI, terminals, whisper state, MCP server | **browser** | `react-fancy`, `fancy-term`, `agent-integrations` |
| Relay broker (`/relay`) | Node (`server.ts`) | `agent-integrations/relay-server` |
| PTY shells (`/api/terminal/ws`) | Node (`server.ts`) | `node-pty` |
| Writes per-agent config (`/api/session`) | Node (Next route) | — |
| The agents | inside the PTYs | `claude` + `mcp-relay-client` |

Why the MCP server lives in the **browser**: Fancy UI's model is "the UI *is* the
tool surface." The same `MicroMcpServer` that an in-page button could call is
exposed to external agents over the relay. No Python sidecar, no separate
service.

## The data path of one message

1. `claude` (agent-a) calls the `whisper_send` tool. Its `mcp-relay-client`
   POSTs a JSON-RPC frame to `…/relay/<sessionA>/inbox`.
2. The relay fans that frame to the browser over agent-a's **inbound** SSE
   stream.
3. The browser's `MicroMcpServer` runs the `whisper_send` handler, which pushes
   the message into the in-memory inbox for `agent-b` and updates the activity
   log. It returns a result.
4. The result is POSTed to `…/relay/<sessionA>/outbox`; the relay delivers it on
   agent-a's **outbound** SSE stream; `mcp-relay-client` hands it back to
   `claude`.
5. Agent-b, meanwhile, is parked inside a `whisper_wait` call (steps 1–4 in
   reverse for *its* session). The moment step 3 queues a message for `agent-b`,
   that parked call wakes and returns the message.

Nothing touches the filesystem for coordination. Close the tab and the whole
session — peers, inboxes, transcript — is gone.

## Two sessions, not one

> **Supersedes `docs/02`'s "one session, two peers."**

The browser mints **one relay session per agent** and attaches **one
`SseRelayTransport` per session** to a *single shared* `MicroMcpServer`. The
whisper state is shared (one set of inboxes); only the transports are separate.

Why: with a single shared session, both agents subscribe to the *same* outbound
SSE stream and would each receive the other's JSON-RPC responses — colliding on
request `id`s. Per-agent sessions give each its own response stream. Identity is
explicit (`from` / `to` / `for` fields), which is fine for a local 2-agent demo.

## The whisper tools

Registered by `src/lib/mcp/whisperBridge.ts` onto the in-tab server:

| Tool | Purpose |
|------|---------|
| `whisper_register` | Announce your peer id (`agent-a` / `agent-b`). Call once. |
| `whisper_peers` | List peers and how many messages are pending for each. |
| `whisper_send` | Queue a message for another peer. Queues even if they haven't registered yet. |
| `whisper_poll` | Non-blocking: take any waiting messages, or return empty now. |
| `whisper_wait` | **Blocking**: return the instant a message arrives, or empty after ~25s. |

### Why `whisper_wait` is the important one

An LLM agent runs a turn and stops — it won't sit in a polling loop on its own.
With only `whisper_poll`, you'd have to keep prompting "check again." With
`whisper_wait`, "wait for the reply" is a **single in-flight tool call** that
hangs until the peer actually sends something. Server-side it's a promise parked
on a waiter list that `whisper_send` wakes (see `WhisperStore.waitFor`). The
relay sends SSE heartbeats every 15s, so the agent's connection stays alive
across the wait, well within Claude Code's MCP timeout.

This — plus pre-approving the MCP server so there's no trust prompt — is what
turns "I have to babysit every message" into "agents converse on their own."

## Terminals and PTYs

Each panel's `<Terminal>` (xterm via fancy-term) opens a WebSocket to
`/api/terminal/ws?term=term-a|term-b`. `server.ts` spawns one `node-pty` shell
per term id, `cwd` set to that agent's folder, and pipes bytes both ways
(`data` / `resize`). The shell survives a socket reconnect. The terminal tree is
rendered **client-only** (`next/dynamic` `ssr: false`) because xterm is
DOM-bound — that's why there's no hydration mismatch.

## Session bootstrap (what happens on page load)

1. `WhisperChat` mounts (client-only) and creates the shared `MicroMcpServer`
   with the whisper bridge.
2. For each agent it: mints a `SessionDescriptor`, `POST`s it to
   `/relay/register`, and attaches an `SseRelayTransport`.
3. It `POST`s `/api/session`, which writes each agent's `.mcp.json` (pointing
   `mcp-relay-client` at that agent's session URL) and a
   `.claude/settings.local.json` that pre-approves the `whisper-chat` server.
4. The header shows **relay connected**; as agents register, **peers** climbs to
   2/2.

## Where to look in the code

```
server.ts                       custom server: Next + relay + PTY WS
src/lib/serverConfig.ts          reads whisper.config.json (+ env overrides)
src/lib/mcp/whisperState.ts      in-memory inboxes, transcript, waitFor()
src/lib/mcp/whisperBridge.ts     the whisper_* tools
src/lib/mcp/createWhisperServer.ts  MicroMcpServer factory
src/components/WhisperChat.tsx   session bootstrap + layout
src/components/AgentPanel.tsx    one terminal panel
src/lib/terminal/useTerminalSocket.ts  xterm ↔ WS glue
src/app/api/session/route.ts     writes .mcp.json + settings.local.json
agents/agent-a|b/CLAUDE.md       each agent's persona + conversation loop
```
