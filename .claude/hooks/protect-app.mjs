#!/usr/bin/env node
/**
 * PreToolUse guard for the WhisperChat agents.
 *
 * Blocks edits to the WhisperChat application itself — the MCP server, the
 * whisper protocol/tools, the skills, server.ts, src/**, configs, and the agent
 * CLAUDE.md prompts — while leaving every other path (other projects, scratch,
 * the agent's own files) untouched. This fires even under
 * `--permission-mode bypassPermissions` (YOLO), where ordinary allow/deny rules
 * are skipped: PreToolUse hooks run regardless of permission mode and can return
 * a hard `deny` decision.
 *
 * Wired from each agent's committed `.claude/settings.json` (PreToolUse matcher
 * `Edit|Write|MultiEdit|NotebookEdit|Bash`). Read-only ops are always allowed.
 *
 * Fail-open: on any parse error we allow (exit 0) — the CLAUDE.md boundary is
 * the backstop; we don't want a malformed payload to wedge an agent.
 */
import { resolve, relative } from "node:path";

const REPO = "/home/chloe/dev/fancy-ui-mvp";

// Repo-relative paths that make up the WhisperChat app. Editing any of these is
// blocked. (Reads are never blocked — this only triggers on mutating tools.)
const PROTECTED = [
  /^src\//,
  /^server\.ts$/,
  /^\.claude\/skills\//,
  /^\.claude\/hooks\//, // protect the guard itself
  /^agents\/[^/]+\/CLAUDE\.md$/,
  /^whisper\.config\.json$/,
  /^next\.config\.ts$/,
  /^postcss\.config\.mjs$/,
  /^eslint\.config\.mjs$/,
  /^tsconfig\.json$/,
  /^package\.json$/,
  /^package-lock\.json$/,
];

// Bash mutators that, combined with a protected path token, indicate a write.
const BASH_MUTATORS = [
  />>?/, // > or >>
  /\bsed\s+-i\b/,
  /\btee\b/,
  /\b(rm|mv|cp|truncate|install)\b/,
  /\bgit\s+(checkout|restore|reset|clean|apply|stash\s+pop)\b/,
];

function repoRelIfProtected(absPath) {
  const rel = relative(REPO, absPath);
  if (rel.startsWith("..") || rel === "") return null; // outside the repo → allowed
  const posix = rel.split("\\").join("/");
  return PROTECTED.some((re) => re.test(posix)) ? posix : null;
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

function main(input) {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return; // fail-open
  }
  const tool = payload.tool_name;
  const ti = payload.tool_input || {};
  const cwd = typeof payload.cwd === "string" ? payload.cwd : REPO;

  if (tool === "Edit" || tool === "Write" || tool === "MultiEdit" || tool === "NotebookEdit") {
    const fp = ti.file_path || ti.notebook_path;
    if (typeof fp !== "string" || !fp) return;
    const abs = resolve(cwd, fp);
    const hit = repoRelIfProtected(abs);
    if (hit) {
      deny(
        `Blocked: "${hit}" is part of the WhisperChat app (MCP server / whisper protocol / skills / app source). ` +
          `Agents must not modify the app they run inside. Editing files outside this repo is fine.`,
      );
    }
    return;
  }

  if (tool === "Bash") {
    const cmd = typeof ti.command === "string" ? ti.command : "";
    if (!cmd) return;
    const mutates = BASH_MUTATORS.some((re) => re.test(cmd));
    if (!mutates) return; // read-only command → allowed
    // Does the command name any protected app path?
    const touchesApp =
      /\bsrc\//.test(cmd) ||
      /\bserver\.ts\b/.test(cmd) ||
      /\.claude\/(skills|hooks)\b/.test(cmd) ||
      /\bwhisper\.config\.json\b/.test(cmd) ||
      /\bCLAUDE\.md\b/.test(cmd) ||
      /\b(next\.config\.ts|postcss\.config\.mjs|eslint\.config\.mjs|tsconfig\.json|package(-lock)?\.json)\b/.test(cmd);
    if (touchesApp) {
      deny(
        "Blocked: this command appears to modify WhisperChat app files (MCP server / whisper protocol / skills / " +
          "app source / configs). Agents must not modify the app they run inside.",
      );
    }
    return;
  }
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (buf += c));
process.stdin.on("end", () => main(buf));
