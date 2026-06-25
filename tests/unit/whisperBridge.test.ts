/**
 * Unit tests — whisper MCP bridge (src/lib/mcp/whisperBridge.ts)
 *
 * The bridge is the validation + tool-registration layer between MCP tool
 * calls and the WhisperStore. We test it against a tiny FakeHost that captures
 * the registered handlers, then invoke those handlers directly — no MCP server,
 * no transport. This isolates the bridge's own logic: required-field checks,
 * the "register before send" guard, the body-size limit, default `max`, the
 * onMutate notifications, and the exact response payloads.
 *
 * Run: node --import tsx --test tests/unit/whisperBridge.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { CallToolResult, ToolDefinition, ToolHandler } from "@particle-academy/agent-integrations/mcp";
import { registerWhisperBridge } from "../../src/lib/mcp/whisperBridge";
import { WhisperStore } from "../../src/lib/mcp/whisperState";

/** Minimal ToolHost stand-in that records definitions + handlers. */
class FakeHost {
  defs = new Map<string, ToolDefinition>();
  handlers = new Map<string, ToolHandler>();
  registerTool(def: ToolDefinition, handler: ToolHandler): () => void {
    this.defs.set(def.name, def);
    this.handlers.set(def.name, handler);
    return () => {
      this.defs.delete(def.name);
      this.handlers.delete(def.name);
    };
  }
  async call(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
    const h = this.handlers.get(name);
    assert.ok(h, `tool '${name}' is not registered`);
    return h(args as never);
  }
}

/** Parse the JSON body a whisper tool returns in content[0].text. */
function payload(res: CallToolResult): any {
  const block = res.content?.[0];
  assert.ok(block && block.type === "text", "tool result must carry a text block");
  return JSON.parse(block.text);
}

/** Wire a fresh bridge + store + mutation counter. */
function setup() {
  const store = new WhisperStore();
  let mutations = 0;
  const host = new FakeHost();
  const dispose = registerWhisperBridge(host, { getState: () => store, onMutate: () => (mutations += 1) });
  return { store, host, dispose, mutations: () => mutations };
}

test("registers exactly the five whisper_* tools", () => {
  const { host } = setup();
  assert.deepEqual(
    [...host.defs.keys()].sort(),
    ["whisper_peers", "whisper_poll", "whisper_register", "whisper_send", "whisper_wait"],
  );
});

test("tool schemas declare their required fields", () => {
  const { host } = setup();
  const req = (n: string) => (host.defs.get(n)!.inputSchema as any).required ?? [];
  assert.deepEqual(req("whisper_register"), ["id"]);
  assert.deepEqual(req("whisper_send"), ["from", "to", "body"]);
  assert.deepEqual(req("whisper_poll"), ["for"]);
  assert.deepEqual(req("whisper_wait"), ["for"]);
});

test("whisper_register adds a peer and notifies onMutate", async () => {
  const { host, store, mutations } = setup();
  const res = payload(await host.call("whisper_register", { id: "agent-a", name: "Researcher" }));
  assert.deepEqual(res, { ok: true, id: "agent-a" });
  assert.equal(store.hasPeer("agent-a"), true);
  assert.equal(mutations(), 1);
});

test("whisper_register rejects a missing/blank id", async () => {
  const { host, store } = setup();
  const res = payload(await host.call("whisper_register", { id: "   " }));
  assert.equal(res.ok, false);
  assert.match(res.error, /id required/);
  assert.equal(store.listPeers().length, 0);
});

test("whisper_peers lists peers with pending counts", async () => {
  const { host } = setup();
  await host.call("whisper_register", { id: "agent-a" });
  await host.call("whisper_register", { id: "agent-b" });
  await host.call("whisper_send", { from: "agent-a", to: "agent-b", body: "hi" });

  const res = payload(await host.call("whisper_peers"));
  const byId = Object.fromEntries(res.peers.map((p: any) => [p.id, p]));
  assert.equal(res.peers.length, 2);
  assert.equal(byId["agent-b"].pending, 1);
  assert.equal(byId["agent-a"].pending, 0);
  assert.equal(byId["agent-a"].online, true);
});

test("whisper_send succeeds for a registered sender and reports recipientOnline", async () => {
  const { host, store, mutations } = setup();
  await host.call("whisper_register", { id: "agent-a" });
  await host.call("whisper_register", { id: "agent-b" });
  const before = mutations();
  const res = payload(await host.call("whisper_send", { from: "agent-a", to: "agent-b", body: "hello" }));
  assert.equal(res.ok, true);
  assert.ok(res.messageId);
  assert.equal(res.recipientOnline, true);
  assert.equal(store.pendingFor("agent-b"), 1);
  assert.equal(mutations(), before + 1);
});

test("whisper_send queues for an unregistered recipient (recipientOnline=false)", async () => {
  const { host, store } = setup();
  await host.call("whisper_register", { id: "agent-a" });
  const res = payload(await host.call("whisper_send", { from: "agent-a", to: "agent-b", body: "early" }));
  assert.equal(res.ok, true);
  assert.equal(res.recipientOnline, false);
  assert.equal(store.pendingFor("agent-b"), 1, "message waits until the recipient comes online");
});

test("whisper_send rejects an unregistered sender", async () => {
  const { host, store } = setup();
  const res = payload(await host.call("whisper_send", { from: "ghost", to: "agent-b", body: "hi" }));
  assert.equal(res.ok, false);
  assert.match(res.error, /unknown sender/);
  assert.equal(store.pendingFor("agent-b"), 0, "nothing is queued on rejection");
});

test("whisper_send rejects missing fields", async () => {
  const { host } = setup();
  await host.call("whisper_register", { id: "agent-a" });
  for (const args of [
    { from: "agent-a", to: "agent-b" }, // no body
    { from: "agent-a", body: "x" }, // no to
    { to: "agent-b", body: "x" }, // no from
  ]) {
    const res = payload(await host.call("whisper_send", args));
    assert.equal(res.ok, false, `expected rejection for ${JSON.stringify(args)}`);
  }
});

test("whisper_send rejects a body over the 8 KiB limit", async () => {
  const { host } = setup();
  await host.call("whisper_register", { id: "agent-a" });
  const big = "x".repeat(8 * 1024 + 1);
  const res = payload(await host.call("whisper_send", { from: "agent-a", to: "agent-b", body: big }));
  assert.equal(res.ok, false);
  assert.match(res.error, /exceeds/);
});

test("whisper_poll consumes messages and exposes from/body but not the internal 'to'", async () => {
  const { host, store } = setup();
  await host.call("whisper_register", { id: "agent-a" });
  await host.call("whisper_register", { id: "agent-b" });
  await host.call("whisper_send", { from: "agent-a", to: "agent-b", body: "m1", correlationId: "c1" });

  const res = payload(await host.call("whisper_poll", { for: "agent-b" }));
  assert.equal(res.messages.length, 1);
  const m = res.messages[0];
  assert.equal(m.from, "agent-a");
  assert.equal(m.body, "m1");
  assert.equal(m.correlationId, "c1");
  assert.equal("to" in m, false, "recipient field is not echoed back to the poller");
  assert.equal(store.pendingFor("agent-b"), 0, "poll consumes");

  const empty = payload(await host.call("whisper_poll", { for: "agent-b" }));
  assert.deepEqual(empty.messages, []);
});

test("whisper_poll requires a 'for' id", async () => {
  const { host } = setup();
  const res = payload(await host.call("whisper_poll", {}));
  assert.deepEqual(res.messages, []);
  assert.match(res.error, /for required/);
});

test("whisper_wait returns immediately when a message is already waiting", async () => {
  const { host } = setup();
  await host.call("whisper_register", { id: "agent-a" });
  await host.call("whisper_register", { id: "agent-b" });
  await host.call("whisper_send", { from: "agent-a", to: "agent-b", body: "ready" });

  const res = payload(await host.call("whisper_wait", { for: "agent-b", timeoutSeconds: 25 }));
  assert.equal(res.timedOut, false);
  assert.deepEqual(res.messages.map((m: any) => m.body), ["ready"]);
});

test("whisper_wait wakes when a message arrives mid-wait", async () => {
  const { host } = setup();
  await host.call("whisper_register", { id: "agent-a" });
  await host.call("whisper_register", { id: "agent-b" });

  const waiting = host.call("whisper_wait", { for: "agent-b", timeoutSeconds: 25 });
  setTimeout(() => host.call("whisper_send", { from: "agent-a", to: "agent-b", body: "late" }), 40);
  const res = payload(await waiting);
  assert.equal(res.timedOut, false);
  assert.deepEqual(res.messages.map((m: any) => m.body), ["late"]);
});

test("the disposer unregisters every tool", () => {
  const { host, dispose } = setup();
  assert.equal(host.defs.size, 5);
  dispose();
  assert.equal(host.defs.size, 0);
});
