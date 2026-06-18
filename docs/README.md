# WhisperChat — Design Documentation

WhisperChat is a **Next.js** app that demonstrates **cross-agent communication**: two Claude Code sessions, each in its own terminal panel, talking to each other through an in-browser MCP bridge — **without writing files**.

## Start here (operational guides — current, accurate to the built app)

| Doc | What it's for |
|-----|---------------|
| [Getting Started](./getting-started.md) | Clone → two agents talking, in ~5 minutes |
| [How It Works](./how-it-works.md) | Architecture primer for the system as built |
| [How-To](./how-to.md) | Task recipes (config, remote access, verify, extend) + troubleshooting |

Top-level [`README.md`](../README.md) is the landing page; [`DESIGN.md`](../DESIGN.md)
records the strategy.

## Original design notes (Python-developer oriented)

Written during design, before code. Still useful for concepts, but where they
differ from the build, **[How It Works](./how-it-works.md) is the source of
truth** (notably: one relay session *per agent*, and the blocking `whisper_wait`
tool).

| Doc | What you'll learn |
|-----|-------------------|
| [01 — Concepts for Python developers](./01-concepts-for-python-devs.md) | Translate JS/TS/Next/Fancy terms into Python analogies |
| [02 — Architecture](./02-architecture.md) | Original architecture sketch (diagrams + data flow) |
| [03 — Whisper MCP bridge](./03-whisper-bridge.md) | The custom tools that let agents message each other |
| [04 — UI & UX](./04-ui-layout.md) | Two-panel layout, terminals, agent folders |
| [05 — MVP implementation plan](./05-mvp-plan.md) | Step-by-step build order and acceptance criteria |

## One-sentence summary

The browser hosts a tiny MCP server; each terminal runs `claude` in its own folder; each Claude session connects back to that server via `mcp-relay-client` and uses **`whisper_*` tools** to send messages to the other agent — all in memory, no shared files.

## External references

- Fancy UI showcase: https://ui.particle.academy/
- `@particle-academy/agent-integrations` — in-browser MCP server + relay
- `@particle-academy/fancy-term` — React terminal component (xterm.js)
- `@particle-academy/fancy-term-host` — Node PTY backend (spawns real shells)
- `@particle-academy/react-fancy` — layout primitives (panels, buttons, etc.)
- `mcp-relay-client` — connects Claude Code / Cursor to a browser MCP session
