# 01 — Concepts for Python Developers

This page maps WhisperChat's stack to things you already know from Python.

## The stack at a glance

| WhisperChat piece | Python-ish analogy |
|-------------------|-------------------|
| **Next.js** | Django or FastAPI + a built-in frontend router. One repo serves HTML pages *and* API endpoints. |
| **TypeScript (.ts / .tsx)** | Python with type hints enforced at compile time. `.tsx` = Python module that also contains HTML-like UI (JSX). |
| **React** | Like a UI library where the page is a tree of functions: `function Panel() { return <div>...</div> }`. State changes → re-render. |
| **npm packages** | PyPI packages. `npm install foo` ≈ `pip install foo`. |
| **Client component** (`"use client"`) | Code that runs **in the browser** only — like a JavaScript bundle your Flask template loads. |
| **Server component / API route** | Code that runs **on the Node server** — like a FastAPI route or Django view. |
| **WebSocket** | Persistent two-way socket, like `websockets` in Python. Used to stream terminal bytes. |
| **MCP (Model Context Protocol)** | A standard JSON-RPC protocol so AI agents can call **tools** (functions) exposed by a host. Like OpenAI function-calling, but standardized and bidirectional. |
| **PTY** | Pseudo-terminal — the OS primitive that makes `claude` think it's in a real TTY. `fancy-term-host` wraps `node-pty` (similar role to Python's `pty` module). |

## Next.js in 60 seconds

Think of Next.js as **two programs sharing one folder**:

```
whisper-chat/
├── app/
│   ├── page.tsx          ← the "/" page (UI)
│   └── api/
│       └── terminal/
│           └── route.ts  ← HTTP API (like @app.post("/terminal"))
├── components/           ← reusable UI pieces
└── package.json          ← requirements.txt + scripts
```

- **`page.tsx`** renders what the user sees.
- **`app/api/.../route.ts`** handles HTTP requests from the browser (spawn PTY, relay registration, etc.).
- **`npm run dev`** starts a dev server (like `uvicorn --reload`).

Next.js **App Router** (what we use) maps folders to URLs:

| File | URL |
|------|-----|
| `app/page.tsx` | `/` |
| `app/api/relay/register/route.ts` | `POST /api/relay/register` |

## React state — the `@st.cache_data` of the UI

In Python you might keep session state in a dict or Redis. In React, components hold **state** with hooks:

```tsx
const [messages, setMessages] = useState<string[]>([]);
// messages      ≈ current value
// setMessages   ≈ function to replace it (triggers re-render)
```

When `setMessages` runs, React redraws the parts of the page that depend on `messages`. WhisperChat's in-memory whisper inbox lives in this kind of state (backed by a `MicroMcpServer` tool handler).

## TypeScript vs JavaScript

TypeScript is JavaScript + types. Helpful for catching mistakes early:

```typescript
// Python
def whisper_send(to: str, body: str) -> dict: ...

// TypeScript
function whisperSend(to: string, body: string): WhisperResult { ... }
```

You don't need to be a TS expert. Start with types on function arguments and return values; let the compiler guide you.

## Fancy UI packages (the four we use)

### `@particle-academy/react-fancy`

Generic UI kit: `Button`, `Panel`, `SplitPane`-style layouts, toasts, modals. **Human+ UX contract**: components are **controlled** — parent owns the data via props like `value` / `onChange`, so agents can drive the same props through MCP bridges.

### `@particle-academy/fancy-term`

A React `<Terminal>` wrapping **xterm.js**. Important split:

- **fancy-term** = drawing + keyboard (browser only, no shell spawning)
- **fancy-term-host** = spawns real shells via PTY (Node server only)

You wire them: PTY output → `output` prop; user keystrokes → `onData` → PTY input.

### `@particle-academy/agent-integrations`

The **brain of agent connectivity**:

- `MicroMcpServer` — JSON-RPC MCP server running in the browser tab
- `registerTerminalBridge` — exposes `terminal_read`, `terminal_write`, `terminal_run` tools
- `attachSseRelay` — connects the in-browser server to external agents via HTTP SSE
- `createSessionDescriptor` / `buildShareUrl` — mint session URLs for sharing

### `mcp-relay-client`

A small CLI (also available as Python `connect.py`) that turns a **session URL** into a **stdio MCP server**. Claude Code adds it to `.mcp.json`; Claude then sees all tools registered on the browser's `MicroMcpServer`.

## MCP tools — think "registered API endpoints for the LLM"

In FastAPI:

```python
@app.post("/whisper/send")
def whisper_send(to: str, body: str): ...
```

In MCP (inside the browser):

```typescript
server.registerTool(
  { name: "whisper_send", description: "...", inputSchema: { ... } },
  async (args) => { /* push to in-memory queue */ return textResult("ok"); },
);
```

Claude doesn't HTTP-call these directly — its MCP client sends JSON-RPC frames through the relay. Conceptually it's the same: **named functions with JSON arguments**.

## Why not just write files?

File-based agent coordination (agent A writes `inbox.json`, agent B reads it) works but is fragile: race conditions, cleanup, path leaks, and it mixes "communication" with "filesystem side effects."

WhisperChat's MVP proves **explicit MCP tools** (`whisper_send`, `whisper_poll`) over a **session-scoped relay** — messages live in the browser's React/MCP state until consumed. Terminals stay isolated in separate working directories; agents coordinate through the bridge only.

## Glossary

| Term | Meaning |
|------|---------|
| **Bridge** | Adapter that registers a set of MCP tools against a UI surface (terminal, whiteboard, etc.) |
| **Relay** | Dumb message bus: forwards JSON-RPC frames between browser MCP server and external MCP clients |
| **Session descriptor** | `{ id, token }` pair that authenticates one collab session |
| **Tool host** | Object that holds registered tools; `MicroMcpServer` extends it |
| **CLAUDE.md** | Project instructions file Claude Code reads at session start (like a `.cursorrules` or project README for the agent) |
| **Whisper** | Our name for agent-to-agent messages sent via MCP, not via terminal keystrokes or files |
