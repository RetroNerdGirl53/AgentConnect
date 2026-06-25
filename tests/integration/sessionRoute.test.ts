/**
 * Integration test — POST /api/session (src/app/api/session/route.ts)
 *
 * The route writes each agent's project-local `.mcp.json` (pointing
 * mcp-relay-client at that agent's live relay URL) plus a
 * `.claude/settings.local.json` that pre-approves the server so `claude`
 * starts without a trust prompt. We point it at a throwaway AGENTS_ROOT and
 * assert the files it writes and its input validation.
 *
 * AGENTS_ROOT is set BEFORE importing the route, because serverConfig reads it
 * at module-load time. node:test runs each test file in its own process, so
 * this env override is isolated to this file.
 *
 * Run: node --import tsx --test tests/integration/sessionRoute.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const AGENTS_ROOT = mkdtempSync(path.join(tmpdir(), "whisper-agents-"));
process.env.AGENTS_ROOT = AGENTS_ROOT;

const { POST } = await import("../../src/app/api/session/route");

test.after(() => rmSync(AGENTS_ROOT, { recursive: true, force: true }));

function req(body: unknown): Request {
  return new Request("http://localhost/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("writes .mcp.json and .claude/settings.local.json for each agent", async () => {
  const url = "http://localhost:3000/relay/sess-a?token=tok-a";
  const res = await POST(req({ agents: [{ dir: "agent-a", url }] }));
  const json = await res.json();

  assert.equal(res.status, 200);
  assert.equal(json.ok, true);

  const mcpPath = path.join(AGENTS_ROOT, "agent-a", ".mcp.json");
  const settingsPath = path.join(AGENTS_ROOT, "agent-a", ".claude", "settings.local.json");
  assert.ok(existsSync(mcpPath), ".mcp.json was written");
  assert.ok(existsSync(settingsPath), "settings.local.json was written");

  const mcp = JSON.parse(readFileSync(mcpPath, "utf8"));
  assert.deepEqual(mcp.mcpServers["whisper-chat"], {
    command: "npx",
    args: ["-y", "mcp-relay-client", url],
  });

  const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  assert.deepEqual(settings.enabledMcpjsonServers, ["whisper-chat"]);
});

test("handles multiple agents in one request", async () => {
  const res = await POST(
    req({
      agents: [
        { dir: "agent-a", url: "http://h/relay/a?token=x" },
        { dir: "agent-b", url: "http://h/relay/b?token=y" },
      ],
    }),
  );
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.written.length, 4, "two files per agent");
  assert.ok(existsSync(path.join(AGENTS_ROOT, "agent-b", ".mcp.json")));
});

test("rejects invalid JSON with 400 invalid_json", async () => {
  const res = await POST(req("{ not json"));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "invalid_json");
});

test("rejects an empty/missing agents list with 400 no_agents", async () => {
  const res = await POST(req({ agents: [] }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "no_agents");
});

test("rejects a path-traversal dir and writes nothing for it", async () => {
  const res = await POST(req({ agents: [{ dir: "../escape", url: "http://h/relay/a?token=x" }] }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "bad_agent_spec");
  assert.equal(existsSync(path.join(AGENTS_ROOT, "..", "escape")), false);
});

test("rejects a dir containing a path separator", async () => {
  const res = await POST(req({ agents: [{ dir: "a/b", url: "http://h/relay/a?token=x" }] }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "bad_agent_spec");
});

test("rejects a non-string url", async () => {
  const res = await POST(req({ agents: [{ dir: "agent-a", url: 123 }] }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "bad_agent_spec");
});
