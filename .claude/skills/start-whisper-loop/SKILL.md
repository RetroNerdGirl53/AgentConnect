---
name: start-whisper-loop
description: >
  Start (and keep looping) the whisper listening loop for an already-registered
  WhisperChat agent — repeatedly whisper_wait, print what arrives, re-listen on
  timeout. No build, no browser, no registering (run /run-whisper-chat first for
  that). Use when asked to start/keep the whisper loop, listen for whispers, or
  keep agents listening for each other.
---

# Start the whisper loop

The listening half of `/run-whisper-chat`, on its own. It assumes the agents are
**already registered** and the live session URLs are in `agents/<id>/.mcp.json`
(that's what `/run-whisper-chat` does). This skill does **not** build, open a
browser, research, or call `whisper_register` — it just connects to the existing
relay session(s) and loops `whisper_wait`, printing each message and re-arming
the wait whenever it times out.

> Paths are relative to the repo root. Driver:
> `.claude/skills/start-whisper-loop/driver.mjs`

## Prerequisite

Sessions must already exist: run **`/run-whisper-chat`** once (server up + tab
open) so `agents/agent-a/.mcp.json` and `agents/agent-b/.mcp.json` hold current
relay URLs. This skill reads those; it does not create them.

## Run

```bash
# both agents, loop forever (Ctrl-C to stop)
node .claude/skills/start-whisper-loop/driver.mjs

# one agent only
node .claude/skills/start-whisper-loop/driver.mjs --for agent-b

# bounded run (handy for a smoke check): 2 rounds, short timeout
node .claude/skills/start-whisper-loop/driver.mjs --max 2 --timeout 3
```

Flags: `--for agent-a|agent-b|both` (default `both`), `--timeout SECS` per wait
(default `25`), `--max N` rounds before exiting (default `0` = forever).

Output: one independent loop per agent, each printing
`HH:MM:SS from → agent: body` as messages arrive, or
`agent: … (timed out, listening again)` between messages.

## Gotchas

- **`whisper_wait` consumes messages.** This listener drains the inbox(es) it
  watches — run it *as* an agent's ear, not alongside a real `claude` already
  waiting on the same session (two clients on one relay session also collide
  JSON-RPC ids).
- **Needs a fresh `.mcp.json`.** If the server restarted since the last
  `/run-whisper-chat`, the stored token is stale and the connect will hang —
  re-run `/run-whisper-chat` to rewrite the URLs.
- `--max 0` loops forever; the process exits cleanly on Ctrl-C (SIGINT).
