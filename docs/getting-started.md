# Getting Started

Go from a fresh clone to **two Claude agents talking to each other** in about
five minutes.

## 1. Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 20+ | `node -v` |
| npm | recent | `npm -v` |
| Claude Code CLI | installed & logged in | `claude --version` |
| OS | Linux/macOS (WSL2 ok) | needs a real PTY |

You only need `claude` to run the *agents*. The UI itself builds and runs
without it.

## 2. Install

```bash
./install.sh                 # deps only
./install.sh --with-browser  # + Playwright Chromium for the verify scripts
```

This checks your toolchain, runs `npm install`, and ensures
`whisper.config.json` exists.

## 3. Configure the address (optional)

`whisper.config.json` controls where the server binds:

```json
{ "host": "localhost", "port": 3000, "agentsRoot": "./agents", "allowedDevOrigins": [] }
```

- Running and viewing on the **same machine** → leave `host` as `localhost`.
- Viewing from **another machine** → set `host` to this machine's LAN IP
  (e.g. `192.168.1.104`). The browser figures out everything else from the URL
  you open. See [how-to.md](./how-to.md#access-it-from-another-machine).

## 4. Run

```bash
npm run dev
```

You should see:

```
> WhisperChat ready on http://localhost:3000
> relay mounted at  http://localhost:3000/relay
> agent shells root .../agents
```

Open that URL. You'll get a two-panel UI: **Agent A · Researcher** (left) and
**Agent B · Coder** (right), a **relay connected** badge, and **peers 0/2**.

## 5. Launch the two agents

In **each** panel, click **Launch Claude** (or type `claude` and press Enter).
Each terminal is a real shell already `cd`-ed into its own folder
(`agents/agent-a`, `agents/agent-b`), each with its own `CLAUDE.md` and a
pre-approved `.mcp.json` — so Claude starts with the `whisper_*` tools and **no
trust prompt**.

When each agent registers, its badge flips to **registered** and the header
shows **peers 2/2**.

## 6. Kick off the conversation

Give **agent-a** (left) a single prompt, for example:

> Follow your CLAUDE.md: introduce yourself to agent-b and complete the task.

That's it. Agent A sends the opening whisper; Agent B is already waiting on
`whisper_wait`; they trade messages on their own. Watch the **Whisper activity**
bar at the bottom light up `agent-a → agent-b … agent-b → agent-a …`.

You do **not** need to keep prompting either agent — `whisper_wait` blocks until
the other side replies, so each one waits its turn automatically.

## 7. Prove it without files

While they talk, check that no coordination files appeared:

```bash
git -C agents status        # or: ls -la agents/agent-a agents/agent-b
```

The only generated files are the gitignored `.mcp.json` and
`.claude/settings.local.json` (session config) — no `inbox.json`, no
`message.txt`. The messages lived entirely in the browser tab.

## Don't have a browser handy?

You can verify the whole channel headlessly — see
[how-to.md → Verify without a browser](./how-to.md#verify-the-channel-without-a-browser-or-claude).

## Next

- [How it works](./how-it-works.md) — the architecture primer.
- [How-to](./how-to.md) — task recipes and troubleshooting.
