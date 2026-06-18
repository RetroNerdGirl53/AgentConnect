# 03 — Whisper MCP Bridge

The Whisper bridge is **custom MCP tooling** we add on top of `@particle-academy/agent-integrations`. It is the core innovation for WhisperChat: agents message each other through **in-memory queues** inside the browser's `MicroMcpServer`, not through the filesystem.

## Design principles

1. **Explicit over implicit** — agents call named tools; no hidden file drops.
2. **Session-scoped** — when the tab closes or share stops, whispers vanish (MVP).
3. **Identity required** — agents must `whisper_register` before send/poll.
4. **Poll-based delivery (MVP)** — simple, debuggable; push notifications can come later.
5. **Human-visible** — optional UI feed shows whisper traffic for demo credibility.

## Tool catalog (MVP)

### `whisper_register`

Declare this agent's peer id for the session.

**Input:**

```json
{
  "id": "agent-a",
  "name": "Research Agent",
  "meta": { "role": "asks questions" }
}
```

**Behavior:**

- Fails if `id` already registered by another live client (same JSON-RPC connection or heartbeat).
- Stores peer record: `{ id, name, meta, connectedAt, clientKey }`.
- Emits MCP notification `notifications/whisper/peer_joined` to all connected clients (optional UI update).

**Returns:** `{ ok: true, id: "agent-a" }`

---

### `whisper_peers`

List registered peers and whether they have pending messages for the caller.

**Input:** `{}` (caller identity inferred from registration on this connection — see *Identity binding* below)

**Returns:**

```json
{
  "peers": [
    { "id": "agent-a", "name": "Research Agent", "online": true },
    { "id": "agent-b", "name": "Coder Agent", "online": true, "pendingForYou": 2 }
  ]
}
```

---

### `whisper_send`

Send a message to another peer.

**Input:**

```json
{
  "from": "agent-a",
  "to": "agent-b",
  "body": "Can you implement a fibonacci function?",
  "correlationId": "task-001"
}
```

**Validation:**

- `from` must match a registered id bound to this MCP client connection.
- `to` must be a registered peer (MVP: fail fast if offline).
- `body` max length (e.g. 8 KiB) for MVP.

**Behavior:**

- Append to in-memory queue: `inbox[to].push({ id, from, body, correlationId, ts })`.
- Append to sent log for UI: `transcript.push({ kind: "send", ... })`.
- Return `{ ok: true, messageId: "msg_..." }`.

---

### `whisper_poll`

Fetch and **consume** pending messages for a peer.

**Input:**

```json
{
  "for": "agent-b",
  "max": 10
}
```

**Behavior:**

- Returns up to `max` messages from `inbox[for]`, then removes them (at-least-once → exactly-once for MVP).
- Empty inbox → `{ messages: [] }`.

**Returns:**

```json
{
  "messages": [
    {
      "id": "msg_abc",
      "from": "agent-a",
      "body": "Can you implement a fibonacci function?",
      "correlationId": "task-001",
      "ts": 1718712345678
    }
  ]
}
```

---

### `whisper_reply` (optional MVP+)

Convenience wrapper: sets `correlationId` from the message being answered. Not required for first demo.

## Identity binding

MVP approach: **explicit `from` / `for` fields** validated against registration table.

Each MCP client connection gets an internal `clientKey` (relay subscriber id or transport instance id). Registration binds:

```
registrations: Map<peerId, { clientKey, name, meta, lastSeen }>
clientToPeer: Map<clientKey, peerId>
```

On `whisper_send`, reject if `from` ≠ peer bound to calling transport.

This prevents agent A from impersonating agent B without sharing their MCP connection (acceptable for local MVP).

## State shape (TypeScript)

Think of this as a Python dataclass store in the React tree:

```typescript
type WhisperMessage = {
  id: string;
  from: string;
  to: string;
  body: string;
  correlationId?: string;
  ts: number;
};

type WhisperState = {
  peers: Map<string, PeerRecord>;
  inboxes: Map<string, WhisperMessage[]>;  // key = recipient peer id
  transcript: WhisperMessage[];            // for UI log (cap at N)
};
```

The `MicroMcpServer` tool handlers close over this state (via React `useRef` or a small module singleton). Mutations trigger React re-render for the whisper activity sidebar.

## Registration code sketch

```typescript
import {
  MicroMcpServer,
  attachInProcess,
  attachSseRelay,
  textResult,
  createSessionDescriptor,
} from "@particle-academy/agent-integrations";
import { registerWhisperBridge } from "./whisperBridge";

export function createWhisperServer(state: WhisperState, relayOpts: RelayOpts) {
  const server = new MicroMcpServer({
    info: { name: "whisper-chat", version: "0.1.0" },
  });

  registerWhisperBridge(server, {
    getState: () => state,
    onMutate: () => notifyReact(),
  });

  attachInProcess(server); // allows UI to call tools directly for testing
  attachSseRelay(server, relayOpts);

  return server;
}
```

## CLAUDE.md instructions (agent-a example)

```markdown
# Agent A — Researcher

You are **agent-a** in a WhisperChat session.

## Cross-agent messaging

You MUST use MCP tools for talking to agent-b. Do NOT write files to communicate.

1. On startup: call `whisper_register` with `{ "id": "agent-a", "name": "Research Agent" }`
2. To message agent-b: `whisper_send` with `{ "from": "agent-a", "to": "agent-b", "body": "..." }`
3. To check replies: `whisper_poll` with `{ "for": "agent-a" }`

Poll every time you send a message and after you finish a thought — agent-b may reply asynchronously.

## Your job

Ask agent-b to write a Python fibonacci function, then verify the approach when they whisper back.
```

(agent-b's `CLAUDE.md` mirrors this with roles reversed and instructs it to respond via whisper tools only.)

## `.mcp.json` per agent folder

Claude Code reads project-local MCP config. Template (session URL filled at runtime or copied from UI):

```json
{
  "mcpServers": {
    "whisper-chat": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-relay-client",
        "http://localhost:3000/api/relay?session=SESSION_ID&token=TOKEN"
      ]
    }
  }
}
```

**Bootstrap problem:** the session URL isn't known until the page loads. MVP options:

| Option | Pros | Cons |
|--------|------|------|
| **A. UI copies URL → user exports env** | Simplest | Manual step |
| **B. API writes `.mcp.json` on session start** | Smooth UX | Server mutates agent dirs |
| **C. Wrapper script reads `WHISPER_SESSION_URL`** | Clean separation | Extra shell script |

**Recommended MVP:** Option B — `POST /api/session/start` writes `.mcp.json` into both agent folders with the live URL. Document that this file is gitignored.

## Demo conversation (acceptance script)

1. User opens WhisperChat → session URL displayed.
2. User starts `claude` in left terminal (cwd `agents/agent-a`).
3. User starts `claude` in right terminal (cwd `agents/agent-b`).
4. In agent-a: *"Register and ask agent-b for a fibonacci function via whisper tools."*
5. Observe whisper activity panel: A → B message logged.
6. In agent-b: poll receives message; agent implements; sends whisper back.
7. Agent-a polls; receives reply.
8. **No new files** appear in either agent folder except what agent-b might create as part of its *coding task* (optional: instruct both agents not to create files for MVP purity).

## Relay wire format (unchanged)

Whisper tools ride the standard Fancy UI relay — no protocol changes:

- Agent POSTs JSON-RPC to `{relay}/{session}/inbox?token=…`
- Browser receives via SSE `{relay}/{session}/events?direction=inbound`
- Browser POSTs responses to `{relay}/{session}/outbox?token=…`
`
Agent receives via SSE `direction=outbound`

See `@particle-academy/agent-integrations` docs: `relay-protocol.md`, `agent-hookable-demos.md`.

## Testing without Claude

Use `mcp-relay-client` from two terminals:

```bash
# Terminal 1
npx -y mcp-relay-client "$SESSION_URL" call whisper_register '{"id":"agent-a"}'
npx -y mcp-relay-client "$SESSION_URL" call whisper_send \
  '{"from":"agent-a","to":"agent-b","body":"ping"}'

# Terminal 2
npx -y mcp-relay-client "$SESSION_URL" call whisper_register '{"id":"agent-b"}'
npx -y mcp-relay-client "$SESSION_URL" call whisper_poll '{"for":"agent-b"}'
```

This validates the bridge before wiring real Claude sessions.
