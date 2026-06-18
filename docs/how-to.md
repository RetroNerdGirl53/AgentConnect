# How-To

Task-oriented recipes. For the big picture read [how-it-works.md](./how-it-works.md);
to get running read [getting-started.md](./getting-started.md).

## Change the bind host or port

Edit `whisper.config.json`:

```json
{ "host": "0.0.0.0", "port": 4000, "agentsRoot": "./agents", "allowedDevOrigins": [] }
```

Restart `npm run dev`. For a one-off without editing the file, use env vars
(they win over the file):

```bash
HOST=0.0.0.0 PORT=4000 npm run dev
```

- `localhost` → only this machine.
- a specific LAN IP (`192.168.1.104`) → only that interface.
- `0.0.0.0` → all interfaces.

## Access it from another machine

1. Set `host` to this machine's LAN IP (e.g. `192.168.1.104`) in
   `whisper.config.json`, or run `HOST=0.0.0.0 npm run dev`.
2. From the other machine open `http://<that-ip>:<port>`.

Everything else follows automatically: the relay URL, terminal WebSocket, and
the per-agent `.mcp.json` are all derived from the URL you open. The bound host
is auto-added to Next's `allowedDevOrigins` (which otherwise blocks cross-origin
dev assets); add extra origins to the `allowedDevOrigins` array if needed.

> The agents (`claude` + `mcp-relay-client`) run on the **server** machine, in
> the PTYs — they connect to the same origin, which is reachable locally. Only
> the human viewer is remote.

## Reset a session

Click **Reset** in the header. It clears peers, inboxes, and the activity log
(parked `whisper_wait` calls fall through to their timeout). The terminals and
their shells are left running.

## Make two real Claude agents talk

1. `npm run dev`, open the page, click **Launch Claude** in both panels.
2. Prompt **agent-a** once: *"Follow your CLAUDE.md and complete the task with
   agent-b."*
3. Watch the Whisper activity bar. You shouldn't need to prompt again — each
   agent blocks on `whisper_wait` between turns.

If they stall, see [Troubleshooting](#troubleshooting).

## Change what the agents do

Edit the persona/instructions in `agents/agent-a/CLAUDE.md` and
`agents/agent-b/CLAUDE.md`. Keep the **communication loop** section intact
(register → send/wait → respond → wait); just change the **task**. Agent-a is
the initiator, agent-b the responder.

## Verify the channel without a browser (or Claude)

The browser tab normally hosts the MCP server; `scripts/headless-host.ts` stands
in for it using the identical server/bridge/transport code.

```bash
# terminal 1
npm run dev

# terminal 2 — host the MCP server in Node; prints HOST_URL agent-a / agent-b
npm run host:headless

# terminal 3 — drive the two agents through the relay
node scripts/agent-client.mjs "<agent-a-url>" whisper_register '{"id":"agent-a"}'
node scripts/agent-client.mjs "<agent-b-url>" whisper_register '{"id":"agent-b"}'
node scripts/agent-client.mjs "<agent-a-url>" whisper_send '{"from":"agent-a","to":"agent-b","body":"hi"}'
node scripts/agent-client.mjs "<agent-b-url>" whisper_poll '{"for":"agent-b"}'   # -> receives "hi"
```

## Verify in a real browser (headless Chromium)

Requires `./install.sh --with-browser` (or `npx playwright install chromium`).

```bash
node scripts/browser.mjs                 # load app, report console/errors, screenshot
node scripts/demo-browser.mjs            # full A↔B exchange against the live tab
node scripts/test-wait.mjs               # prove whisper_wait wakes on arrival
node scripts/browser.mjs http://host:3000 --shot /tmp/out.png
DUMP_CONSOLE=1 node scripts/browser.mjs  # also print all console messages
```

## Check the PTY backend

```bash
npm run test:pty    # opens term-a, runs `pwd`, asserts cwd is agents/agent-a
```

## Add or rename an agent

This is a 2-agent demo, but to extend it:

1. Add a folder under `agents/` with a `CLAUDE.md`.
2. In `server.ts`, add it to `TERM_DIRS` (`term-c → agent-c`).
3. In `src/components/WhisperChat.tsx`, add it to the `AGENTS` array (`id`,
   `termId`, `dir`, `label`). The layout, sessions, and `.mcp.json` writing all
   key off that array.

Each agent still gets its own relay session and the shared whisper state routes
by peer id, so 3+ agents work without protocol changes.

## Pre-approve / re-trigger the MCP trust prompt

`/api/session` writes `agents/<id>/.claude/settings.local.json` with
`{"enabledMcpjsonServers":["whisper-chat"]}` on every page load, so `claude`
never prompts to trust the server. To force the prompt back, delete that file
before starting `claude`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `claude` asks to trust an MCP server | The page wasn't loaded before you launched `claude` (so `.claude/settings.local.json` wasn't written). Load the page first, then launch. |
| Agent doesn't see `whisper_*` tools | `mcp-relay-client` couldn't reach the relay, or the page (host) isn't open. Confirm the page is loaded and `relay connected` is green. |
| Agents register but never converse | Make sure each is following the loop in its `CLAUDE.md` (`whisper_wait`, not a manual poll). Re-prompt agent-a to "continue the conversation per your CLAUDE.md." |
| `whisper_send` says recipient offline | It no longer fails — messages queue for a peer that hasn't registered. If you see this, you're on an old build; restart `npm run dev`. |
| Browser shows a hydration warning on `<body>`/`<html>` | Usually a browser extension injecting attributes; harmless. The app tree is client-only and won't mismatch. |
| `EADDRNOTAVAIL` on start | `host` in `whisper.config.json` isn't an interface on this machine. Use `localhost`, `0.0.0.0`, or this host's real IP. |
| Playwright fails to launch | Run `npx playwright install chromium`; on bare Linux you may also need system libs (`npx playwright install-deps`, needs sudo). |
| Terminal panel is blank | The parent must have height (it does by default). Check the connection badge in the panel; a `disconnected` chip means the WS dropped — reload. |

## Production note

`npm run build && npm start` runs the same custom server with `NODE_ENV=production`.
This is a local-dev / LAN tool: the relay trusts a token in the URL and has no
auth or rate limiting. Don't expose it to the public internet as-is.
