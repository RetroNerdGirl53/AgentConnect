# 05 — MVP Implementation Plan

This is the build order for a developer implementing WhisperChat for the first time. Each phase has **done criteria** you can verify without guessing.

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 20+ | `node --version` |
| npm or pnpm | latest | `npm --version` |
| Claude Code CLI | installed | `claude --version` |
| OS | Linux/macOS | PTY support (WSL2 OK) |

## Phase 0 — Scaffold Next.js app

**Goal:** Empty app boots on `localhost:3000`.

```bash
npx create-next-app@latest whisper-chat --typescript --tailwind --app --eslint
</dev/null
```

Add dependencies:

```bash
npm install \
  @particle-academy/react-fancy \
  @particle-academy/fancy-term \
  @particle-academy/fancy-term-host \
  @particle-academy/agent-integrations \
  @xterm/xterm @xterm/addon-fit \
  node-pty ws

npm install -D @types/ws
```

Configure Tailwind v4 `@source` for react-fancy (see [04-ui-layout.md](./04-ui-layout.md)).

**Done when:** Home page renders with Fancy dark styling.

---

## Phase 1 — Static two-panel UI

**Goal:** Visual layout with mock terminals (no PTY yet).

Tasks:

1. Create `WhisperChatShell` with 50/50 grid.
2. Create two `AgentPanel` components with `<Terminal output="$ " onData={() => {}} />`.
3. Add session bar placeholder.

**Done when:** Two xterm surfaces render side by side; typing locally echoes via local state.

---

## Phase 2 — PTY backend + WebSocket

**Goal:** Real shells in each panel, separate `cwd`.

Tasks:

1. Add `lib/terminal/ptyManager.ts` wrapping `fancy-term-host` `inProcessBackend`.
2. On session start, spawn two PTYs:
   - `term-a` → `cwd: agents/agent-a`
   - `term-b` → `cwd: agents/agent-b`
3. WebSocket route (or custom server) streams `data` / `write` / `resize`.
4. Wire `output` + `onData` in each `AgentPanel`.

**Done when:** You can `ls` in left panel and `pwd` shows `agent-a`; right panel shows `agent-b`.

**Note:** Next.js App Router doesn't natively upgrade WebSockets in all deployments. MVP options:

- **A.** Custom Node server (`server.ts`) wrapping Next — recommended for PTY apps
- **B.** Separate WS port (3001) — simpler but two origins

---

## Phase 3 — MCP relay + session URL

**Goal:** Browser hosts `MicroMcpServer`; external clients can connect.

Tasks:

1. Run relay — either:
   - `npx -p @particle-academy/agent-integrations agent-integrations-relay --port 8787`, or
   - Port relay endpoints into `app/api/relay/...`
2. On mount, `createSessionDescriptor()` + `POST /register`.
3. `attachSseRelay(server, { baseUrl, sessionId, token })`.
4. Display `buildShareUrl(...)` in session bar.

**Done when:**

```bash
SESSION_URL="http://localhost:8787/...?session=...&token=..."
npx -y mcp-relay-client "$SESSION_URL" tools
```

lists registered tools (whisper + terminal).

---

## Phase 4 — Whisper bridge

**Goal:** Agents can register, send, poll.

Tasks:

1. Implement `lib/mcp/whisperBridge.ts` with four tools (see [03-whisper-bridge.md](./03-whisper-bridge.md)).
2. Hook `onMutate` to whisper activity UI.
3. Write agent `CLAUDE.md` files.
4. Session start API writes `.mcp.json` into each agent folder.

**Done when:** Two `mcp-relay-client` shells can register as agent-a / agent-b and exchange a message without Claude.

---

## Phase 5 — Terminal bridge (optional for MVP)

**Goal:** MCP can read both terminal buffers.

Tasks:

1. `registerTerminalBridge(server, { terminals: () => [...] })`.
2. Wire each `TerminalRef` to fancy-term `TerminalHandle` refs.

**Done when:** `terminal_list` returns `term-a`, `term-b`; `terminal_read` returns buffer contents.

Skip if time-constrained — whisper-only demo is sufficient.

---

## Phase 6 — Claude integration

**Goal:** Full end-to-end with real Claude Code sessions.

Tasks:

1. Create `agents/agent-a/CLAUDE.md` and `agents/agent-b/CLAUDE.md`.
2. "Launch Claude" sends `claude\r` into each PTY (or document manual launch).
3. Verify Claude loads whisper MCP tools from `.mcp.json`.
4. Run acceptance script (below).

**Done when:** Agent A whispers Agent B; B replies; activity log shows both; no communication files written.

---

## Acceptance test script

Run this checklist before calling MVP complete:

- [ ] App loads with two live terminals in different directories
- [ ] Session URL copies to clipboard
- [ ] `mcp-relay-client "$URL" tools` shows `whisper_*` tools
- [ ] Claude starts in both panels
- [ ] Each Claude session calls `whisper_register` successfully
- [ ] Prompt to agent-a: *"Ask agent-b what 7×8 is via whisper tools only"*
- [ ] Agent-b receives via poll and replies
- [ ] Agent-a receives reply via poll
- [ ] Whisper activity panel shows both messages with timestamps
- [ ] `git status` in agent folders shows no new `inbox.json` / `message.txt` communication artifacts

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `WHISPER_RELAY_URL` | `http://localhost:8787` | Relay broker origin |
| `WHISPER_PORT` | `3000` | Next.js port |
| `WHISPER_WS_PORT` | `3001` | WebSocket port (if split) |
| `AGENTS_ROOT` | `./agents` | Agent workspace root |

---

## Common pitfalls

| Problem | Fix |
|---------|-----|
| `node-pty` build fails | Install build tools; match Node ABI; on Electron use asar unpack |
| xterm blank / zero height | Parent div must have explicit height |
| Claude doesn't load MCP | Check `.mcp.json` path (project root = cwd); restart Claude after write budget |
| Relay 401 | Token mismatch; re-copy session URL after reset |
| Both agents same inbox | Verify `whisper_poll` uses correct `for` id |

---

## Package version pinning (suggested)

```json
{
  "@particle-academy/agent-integrations": "^0.19.0",
  "@particle-academy/fancy-term": "^0.2.0",
  "@particle-academy/fancy-term-host": "^0.1.0",
  "@particle-academy/react-fancy": "^3.0.0",
  "mcp-relay-client": "latest"
}
```

Install `@particle-academy/docs-mcp` in your editor if you want Claude/Cursor to read Fancy docs from `node_modules` directly.

---

## What "done" looks like for stakeholders

A screen recording showing:

1. Two terminals side by side
2. A user prompt to the left Claude
3. The whisper activity bar lighting up with A→B then B→A
4. Neither agent creating files to coordinate

That is the MVP proof: **cross-agent communication via Fancy UI's session MCP bridge.**
