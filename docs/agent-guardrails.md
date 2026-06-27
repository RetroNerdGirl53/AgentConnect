# Agent guardrails

WhisperChat launches two `claude` agents (in `agents/agent-a` / `agents/agent-b`),
optionally in **YOLO mode** (`--permission-mode bypassPermissions`) via the Launch
Claude split button. These guardrails keep an agent from modifying the app it runs
inside — its MCP server, the `whisper_*` protocol, the skills, or app source — while
leaving it free to work on anything else (other projects, its own scratch).

There are three layers, weakest→strongest:

## 1. Prompt boundary (`agents/*/CLAUDE.md`)

A top-priority "Boundaries — do not cross" section tells each agent never to edit the
WhisperChat app and that a `whisper_wait` timeout is normal (don't try to "fix" the
server/relay/app). Soft, but it's the primary lever under YOLO.

## 2. PreToolUse hook (hard block) — `.claude/hooks/protect-app.mjs`

The real enforcement. A `PreToolUse` hook that **fires even under
`bypassPermissions`** (ordinary allow/deny rules are skipped in that mode; hooks are
not) and returns a hard `deny` for `Edit`/`Write`/`MultiEdit`/`NotebookEdit` (and
write-style `Bash`) whose target is a WhisperChat app path:

```
src/**, server.ts, .claude/skills/**, .claude/hooks/**,
agents/*/CLAUDE.md, whisper.config.json, *.config.* , tsconfig.json,
package.json, package-lock.json
```

Reads are never blocked; paths **outside the repo** (e.g. other projects) and the
agent's own non-protected files are always allowed.

Wired from each agent's committed **`agents/<id>/.claude/settings.json`** (matcher
`Edit|Write|MultiEdit|NotebookEdit|Bash`). It must live in each agent dir — that's
the agent session's cwd, and hook config has no parent-dir fallback. It's
`settings.json` (not `settings.local.json`) on purpose: `/api/session` rewrites
`settings.local.json` on every tab load, but never touches `settings.json`.

Test the script directly (no agent needed):

```bash
echo '{"tool_name":"Edit","cwd":"'"$PWD"'/agents/agent-a","tool_input":{"file_path":"'"$PWD"'/src/app/page.tsx"}}' \
  | node .claude/hooks/protect-app.mjs
# → {"hookSpecificOutput":{...,"permissionDecision":"deny",...}}
```

**Residual risk:** a session in `bypassPermissions` *could* edit its own
`agents/<id>/.claude/settings.json` to disable the hook (the prompt boundary forbids
this, and the protected list includes `.claude/`, so the hook blocks edits to itself).
For hard, unbypassable enforcement against an adversarial agent, move the hook into
**user settings** (`~/.claude/settings.json`) or **managed settings**
(`/etc/claude-code/managed-settings.json`), which a session cannot override. The
in-repo version here is sized for the real threat: a confused agent on a timeout, not
an adversary.

## 3. git pre-commit guard — `.githooks/pre-commit`

Stops app-file changes from being *committed* by an agent. It blocks a commit that
stages any protected app path **when run from an agent dir** (git sets
`GIT_PREFIX=agents/agent-a/`). Commits from the repo root (you, the maintainer) pass
untouched.

**Activation (per clone — `core.hooksPath` is local git config, not committed):**

```bash
git config core.hooksPath .githooks
```

Maintainer override for a one-off:

```bash
WHISPERCHAT_ALLOW_APP_COMMIT=1 git commit ...
```

## Note on permission modes

`bypassPermissions` (YOLO) skips the permission allow/deny system entirely, so
`settings.json` `permissions.deny` rules do **not** constrain a YOLO agent — which is
why layer 2 is a hook (runs regardless of mode), not a deny rule. The Launch Claude
button defaults to **Default** mode and styles YOLO red.
