/**
 * Integration test — the real in-browser MCP server (no network)
 *
 * This exercises the exact object the browser tab builds: a real
 * `MicroMcpServer` from @particle-academy/agent-integrations with the whisper
 * bridge registered (via createWhisperServer). It proves two things end-to-end
 * through the genuine MCP machinery, but without a relay or browser:
 *
 *   1. The JSON-RPC wire works: an in-process MCP client can `initialize` and
 *      `tools/list`, seeing all five whisper tools (this is what mcp-relay-client
 *      drives over SSE in the real app).
 *   2. The cross-agent flow works: two "agents" sharing the one server register,
 *      send, and receive a message — the MVP claim ("two agents communicate
 *      without files"), reduced to its essence.
 *
 * `MicroMcpServer` extends ToolRegistry, so `server.callTool(name, args)` invokes
 * the real registered handlers directly (the in-process path the docs describe).
 *
 * Run: node --import tsx --test tests/integration/whisperServer.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  attachInProcess,
  type JsonRpcMessage,
} from "@particle-academy/agent-integrations/mcp";
import { createWhisperServer } from "../../src/lib/mcp/createWhisperServer";
import { WhisperStore } from "../../src/lib/mcp/whisperState";
import { WHISPER_MARKER } from "../../src/lib/mcp/whisperProtocol";

const WHISPER_TOOLS = ["whisper_peers", "whisper_poll", "whisper_register", "whisper_send", "whisper_wait"];

function parse(res: any): any {
  return JSON.parse(res.content[0].text);
}

test("createWhisperServer registers all five whisper tools", () => {
  const server = createWhisperServer(new WhisperStore(), () => {});
  const names = server.listTools().map((t) => t.name).sort();
  for (const tool of WHISPER_TOOLS) {
    assert.ok(names.includes(tool), `missing tool: ${tool}`);
  }
});

test("an in-process MCP client can initialize and list tools over JSON-RPC", async () => {
  const server = createWhisperServer(new WhisperStore(), () => {});
  const transport = attachInProcess(server);

  const inbox: JsonRpcMessage[] = [];
  transport.onServerMessage((m) => inbox.push(m));
  const reply = (id: number) =>
    new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no reply for id=${id}`)), 2000);
      const off = transport.onServerMessage((m: any) => {
        if (m.id === id) {
          clearTimeout(timer);
          off();
          resolve(m);
        }
      });
    });

  const initP = reply(1);
  await transport.deliver({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
  });
  const init = await initP;
  assert.equal(init.result.serverInfo.name, "whisper-chat");

  await transport.deliver({ jsonrpc: "2.0", method: "notifications/initialized" });

  const listP = reply(2);
  await transport.deliver({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const list = await listP;
  const names = list.result.tools.map((t: any) => t.name).sort();
  assert.deepEqual(names, WHISPER_TOOLS);

  transport.close();
});

test("two agents sharing one server exchange a message (register → send → poll)", async () => {
  let mutations = 0;
  const server = createWhisperServer(new WhisperStore(), () => (mutations += 1));

  parse(await server.callTool("whisper_register", { id: "agent-a", name: "Researcher" }));
  parse(await server.callTool("whisper_register", { id: "agent-b", name: "Coder" }));

  const peers = parse(await server.callTool("whisper_peers"));
  assert.equal(peers.peers.length, 2);

  const sent = parse(await server.callTool("whisper_send", {
    marker: WHISPER_MARKER,
    from: "agent-a",
    to: "agent-b",
    body: "Please write fibonacci in Python",
  }));
  assert.equal(sent.ok, true);
  assert.equal(sent.recipients[0].online, true);

  const got = parse(await server.callTool("whisper_poll", { for: "agent-b" }));
  assert.equal(got.messages.length, 1);
  assert.equal(got.messages[0].from, "agent-a");
  assert.match(got.messages[0].body, /fibonacci/);

  // Inbox is drained after the poll.
  const again = parse(await server.callTool("whisper_poll", { for: "agent-b" }));
  assert.deepEqual(again.messages, []);

  assert.ok(mutations > 0, "tool calls notify the UI via onMutate");
});

test("whisper_wait delivers a reply that arrives mid-wait (the back-and-forth path)", async () => {
  const server = createWhisperServer(new WhisperStore(), () => {});
  parse(await server.callTool("whisper_register", { id: "agent-a" }));
  parse(await server.callTool("whisper_register", { id: "agent-b" }));

  // agent-a blocks waiting for a reply; agent-b answers shortly after.
  const waiting = server.callTool("whisper_wait", { for: "agent-a", timeoutSeconds: 25 });
  setTimeout(() => {
    void server.callTool("whisper_send", { marker: WHISPER_MARKER, from: "agent-b", to: "agent-a", body: "def fib(n): ..." });
  }, 50);

  const res = parse(await waiting);
  assert.equal(res.timedOut, false);
  assert.equal(res.messages[0].from, "agent-b");
  assert.match(res.messages[0].body, /def fib/);
});
