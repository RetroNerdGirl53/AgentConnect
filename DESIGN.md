# WhisperChat — Design Strategy

**Status:** MVP built & verified — see [`README.md`](./README.md) to run it.  
**Stack:** Next.js · TypeScript · react-fancy · fancy-term · agent-integrations · mcp-relay-client

> **Implementation note:** the build uses **one relay session per agent**
> (not the "one session, two peers" sketched in `docs/02`). A shared session
> would fan the same outbound SSE stream to both agents, colliding their
> JSON-RPC response ids. See `README.md` → "Two sessions, not one".

## Problem statement

AI agents running in separate terminal sessions are isolated. Common workarounds — shared files, copy-paste between terminals, or a human relay — don't scale and pollute the workspace.

WhisperChat demonstrates a **first-class agent channel**: two Claude Code sessions, each in its own folder with its own `CLAUDE.md`, communicating through **MCP tools** hosted by a shared web session — **no filesystem writes for coordination**.

## Strategic choices

### 1. Browser-hosted MCP, not a Python sidecar

The MCP server runs **in the browser tab** via `MicroMcpServer`. This matches Fancy UI's Human+ UX model: the UI *is* the tool surface. External agents (Claude in PTY) reach it through the **session relay** (`mcp-relay-client`).

**Why not Python:** Fancy UI's bridges, relay protocol, and terminal integration are TypeScript-native. A Python FastAPI MCP server would duplicate relay logic and miss terminal bridge integration.

### 2. One session, two peers

Both agents connect to the **same session URL**. They differentiate via `whisper_register({ id: "agent-a" })`. One server, one inbox map, simpler demo.

### 3. Whisper tools as the MVP channel

`registerTerminalBridge` can already let agents read/write each other's terminals — but that's easy to confuse with "communication." Custom **`whisper_*` tools** make intent explicit and prove messages flow outside terminal stdin/stdout.

Terminal bridge: Phase 5 optional add-on.

### 4. fancy-term + fancy-term-host split

Keep rendering (browser) and shell spawning (Node) separate — Fancy UI's intentional architecture. Next.js server (or adjacent WS server) owns PTYs; client owns xterm.

### 5. Next.js as the shell

Next.js provides:

- React UI (client components)
- API routes for relay + session bootstrap
- (With custom server) WebSocket for terminal I/O

For a Python developer: treat Next as **FastAPI + Jinja/React**, one repo.

## Architecture summary

```
┌─────────────────────────────────────────────────────────┐
│                    WhisperChat (Browser)                 │
│  react-fancy layout │ fancy-term × 2 │ MicroMcpServer   │
│                     │                │ + whisper bridge  │
└──────────────┬──────────────────────┬───────────────────┘
               │ WebSocket              │ SSE relay
               ▼                        ▼
┌──────────────────────────┐  ┌─────────────────────────┐
│ Next.js + fancy-term-host│  │ MCP Relay (HTTP+SSE)    │
│ PTY: agent-a / agent-b   │  │ JSON-RPC frame bus      │
└──────────────┬───────────┘  └───────────┬─────────────┘
               │                            │
               ▼                            ▼
        claude (agent-a)              mcp-relay-client
        claude (agent-b)              (stdio ↔ relay)
```

## MVP scope

| In scope | Out of scope |
|----------|--------------|
| Two-panel terminal UI | Multi-user / auth |
| Separate agent folders + CLAUDE.md | Persistent whisper history across reloads |
| Session MCP relay | Production hardening |
| whisper_register/send/poll/peers | File-based fallback |
| Activity log in UI | Whiteboard / other Fancy surfaces |
| Local dev (`localhost`) | Deployed relay infra |

## Success metrics

1. **Technical:** Two `mcp-relay-client` peers exchange messages through the browser MCP server.
2. **Product:** Two Claude Code sessions complete a scripted whisper conversation (A asks, B answers).
3. **Educational:** A Python developer can read the docs and understand which piece lives where before writing code.

## Documentation index

Detailed docs live in [`docs/`](./docs/README.md):

- [Concepts for Python developers](./docs/01-concepts-for-python-devs.md)
- [Architecture](./docs/02-architecture.md)
- [Whisper MCP bridge](./docs/03-whisper-bridge.md)
- [UI & UX layout](./docs/04-ui-layout.md)
- [MVP implementation plan](./docs/05-mvp-plan.md)

## Next step

Execute [Phase 0](./docs/05-mvp-plan.md#phase-0--scaffold-nextjs-app) in `05-mvp-plan.md` — scaffold the Next.js app and install Fancy packages. Design docs are complete; implementation has not started.
