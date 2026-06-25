# WhisperChat Tests

The test suite proves the MVP claim — **two agents communicate across terminals
through the MCP bridge, without writing files** — and guards the pieces that make
it work. Tests are organized as a pyramid: many fast pure tests at the bottom,
fewer slow full-stack tests at the top.

> These tests have been **written but not run yet**. See
> [Running the tests](#running-the-tests) for the commands.

## Why these tools

- **`node:test` + `node:assert`** — Node's built-in runner. No new dependencies;
  matches the project's dependency-light posture (it already ships plain `.mjs`
  verification scripts).
- **`tsx`** — already a dev dependency; lets the runner execute the TypeScript
  source directly (same loader the app's `server.ts` and scripts use).
- **`eventsource`, `ws`, `playwright`** — already dependencies; used only by the
  e2e layer.

No test framework (Jest/Vitest) is added.

## Layout

```
tests/
├── README.md                         ← this file
├── unit/                             ← pure, fast, no network/filesystem
│   ├── whisperState.test.ts          ← the in-memory store (the core)
│   ├── whisperBridge.test.ts         ← the five whisper_* tools + validation
│   └── session.test.ts               ← client relay-URL helpers
├── integration/                      ← real modules wired together, still local
│   ├── whisperServer.test.ts         ← real MicroMcpServer + bridge, in-process
│   ├── sessionRoute.test.ts          ← POST /api/session writes agent config
│   └── serverConfig.test.ts          ← env/file config precedence (child procs)
└── e2e/                              ← needs a running app (`npm run dev`)
    ├── whisper-roundtrip.ts          ← two relay agents exchange a whisper
    ├── pty-cwd.mjs                    ← each panel's shell is in its own folder
    └── helpers/relayClient.mjs       ← shared relay MCP client
```

## What each layer covers

### Unit (`tests/unit/`)

No I/O — runs in milliseconds, fully deterministic.

| File | Covers |
|------|--------|
| `whisperState.test.ts` | Peer registration (idempotent, preserves data), FIFO queue + consuming `poll`, blocking `waitFor` (immediate / wake-on-arrival / timeout / FIFO wake), `reset`, transcript cap, id uniqueness |
| `whisperBridge.test.ts` | All five tools register; required-field validation; "register before send" guard; 8 KiB body limit; queueing to an offline recipient; `onMutate` notifications; response payload shape; disposer cleanup |
| `session.test.ts` | `relayBaseUrl` / `buildAgentRelayUrl` (with token URL-encoding); `registerSession` request shape + error propagation (browser globals stubbed) |

### Integration (`tests/integration/`)

Real modules, real MCP machinery, but no network or browser.

| File | Covers |
|------|--------|
| `whisperServer.test.ts` | A genuine `MicroMcpServer` with the bridge: JSON-RPC `initialize` + `tools/list` over the in-process transport, and the full register → send → poll / wait cross-agent flow via `callTool` |
| `sessionRoute.test.ts` | `POST /api/session` writes correct `.mcp.json` + `.claude/settings.local.json` into a temp `AGENTS_ROOT`; rejects invalid JSON, empty lists, path-traversal dirs, and non-string URLs |
| `serverConfig.test.ts` | Env-over-file precedence, port coercion, absolute `agentsRoot`, and the `allowedDevOrigins` rule (bound host auto-trusted; `localhost` / `0.0.0.0` excluded) — each case in a fresh child process since config is frozen at import |

### End-to-end (`tests/e2e/`)

Exercise the live wire. **Require `npm run dev` running** in another terminal.

| File | Covers | How it stands in for the real thing |
|------|--------|--------------------------------------|
| `whisper-roundtrip.ts` | Two relay agents register and trade messages (poll **and** blocking `whisper_wait`) through the real SSE + POST relay broker | Host side runs the *identical* browser-tab code (`createWhisperServer` + `attachSseRelay`); client side runs two relay clients like `mcp-relay-client` |
| `pty-cwd.mjs` | Each panel's PTY shell is rooted in its own agent folder | Opens both terminal WebSockets and runs `pwd` |

The e2e host side only shims `window` + `EventSource` (a browser provides both),
so it runs the same code path the React app does — see the note in
[`../README.md`](../README.md) about "two sessions, not one".

## Running the tests

> ⚠️ Per the current task these have not been executed yet — the commands below
> are how to run them.

```bash
# Unit + integration (no server needed)
npm test                 # runs unit then integration
npm run test:unit
npm run test:integration

# End-to-end (start the app first, in a separate terminal)
npm run dev              # terminal 1
npm run test:e2e         # terminal 2 — the cross-agent relay roundtrip
node tests/e2e/pty-cwd.mjs   # terminal 2 — the PTY cwd check
```

You can also run a single file:

```bash
node --import tsx --test tests/unit/whisperState.test.ts
```

## Relationship to the existing `scripts/`

The repo already ships manual verification scripts (`scripts/test-pty.mjs`,
`scripts/test-wait.mjs`, `scripts/browser.mjs`, `scripts/agent-client.mjs`,
`scripts/headless-host.ts`). Those remain useful for **interactive, eyeball**
debugging (screenshots, live hosting). This `tests/` tree is the **automated,
assertion-based** counterpart with pass/fail exit codes, suitable for CI.

## Coverage vs. the MVP acceptance checklist

From [`docs/05-mvp-plan.md`](../docs/05-mvp-plan.md):

| Acceptance item | Test |
|-----------------|------|
| Whisper tools exist and are callable | `whisperServer.test.ts`, `whisperBridge.test.ts` |
| Each agent registers; peers 2/2 | `whisper-roundtrip.ts`, `whisperServer.test.ts` |
| A sends → B receives | `whisper-roundtrip.ts`, `whisperServer.test.ts`, `whisperState.test.ts` |
| Reply flows back (blocking wait) | `whisper-roundtrip.ts`, `whisperServer.test.ts`, `whisperState.test.ts` |
| Terminals run in separate directories | `pty-cwd.mjs` |
| `.mcp.json` written per agent | `sessionRoute.test.ts` |
| No files used for messaging | Implicit: the whole channel is the in-memory `WhisperStore` (`whisperState.test.ts`) |

## Known caveats

- **e2e needs a live server.** The scripts exit `1` with a clear hint if the
  relay or terminal WebSocket is unreachable.
- **Timing-based tests use small real delays** (tens of ms) for the
  wake-on-arrival paths rather than fake timers, to stay portable across Node
  versions. They assert generous upper bounds, not exact timings.
- **`sessionRoute.test.ts` imports `next/server`** outside the Next runtime. This
  works for `NextResponse`, but if a future Next version makes that import
  require the full server runtime, switch the test to call the handler via the
  custom `server.ts` instead.
