/**
 * Unit tests — WhisperStore (src/lib/mcp/whisperState.ts)
 *
 * The store is the pure, in-memory heart of the cross-agent channel: no
 * network, no filesystem, no MCP framing. That makes it the highest-value
 * unit-test target — every behaviour is deterministic given the inputs
 * (the only ambient dependencies are Date.now and setTimeout, and the
 * timeout paths use small real delays rather than fake timers so the tests
 * stay simple and portable across Node versions).
 *
 * Run: node --import tsx --test tests/unit/whisperState.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { WhisperStore } from "../../src/lib/mcp/whisperState";

test("registerPeer creates a peer and listPeers returns it", () => {
  const s = new WhisperStore();
  const rec = s.registerPeer("agent-a", "Researcher", { role: "asks" });
  assert.equal(rec.id, "agent-a");
  assert.equal(rec.name, "Researcher");
  assert.deepEqual(rec.meta, { role: "asks" });
  assert.equal(s.hasPeer("agent-a"), true);
  assert.equal(s.listPeers().length, 1);
});

test("registerPeer is idempotent and updates lastSeen without clobbering name", () => {
  const s = new WhisperStore();
  const first = s.registerPeer("agent-a", "Researcher");
  const second = s.registerPeer("agent-a"); // no name passed
  assert.equal(s.listPeers().length, 1, "re-register must not duplicate the peer");
  assert.equal(second.name, "Researcher", "missing name should preserve the prior value");
  assert.ok(second.lastSeen >= first.lastSeen);
  assert.equal(second.connectedAt, first.connectedAt, "connectedAt is preserved across re-register");
});

test("listPeers is sorted by id", () => {
  const s = new WhisperStore();
  s.registerPeer("agent-b");
  s.registerPeer("agent-a");
  assert.deepEqual(
    s.listPeers().map((p) => p.id),
    ["agent-a", "agent-b"],
  );
});

test("send queues a message, bumps pendingFor, and logs a 'send' transcript entry", () => {
  const s = new WhisperStore();
  s.registerPeer("agent-a");
  s.registerPeer("agent-b");
  const msg = s.send("agent-a", "agent-b", "hello", "task-1");
  assert.equal(msg.from, "agent-a");
  assert.equal(msg.to, "agent-b");
  assert.equal(msg.body, "hello");
  assert.equal(msg.correlationId, "task-1");
  assert.ok(msg.id.startsWith("msg_"));
  assert.equal(s.pendingFor("agent-b"), 1);
  assert.equal(s.pendingFor("agent-a"), 0);
  const last = s.transcript.at(-1);
  assert.equal(last?.kind, "send");
  assert.equal(last?.body, "hello");
});

test("send to an unregistered recipient still queues (store does not enforce identity)", () => {
  // The bridge enforces that the SENDER is registered; the store deliberately
  // queues for an unregistered recipient so startup order never loses a message.
  const s = new WhisperStore();
  s.send("agent-a", "agent-b", "queued before b joined");
  assert.equal(s.pendingFor("agent-b"), 1);
});

test("poll consumes messages FIFO, respects max, and adds 'deliver' transcript entries", () => {
  const s = new WhisperStore();
  s.send("agent-a", "agent-b", "m1");
  s.send("agent-a", "agent-b", "m2");
  s.send("agent-a", "agent-b", "m3");

  const firstTwo = s.poll("agent-b", 2);
  assert.deepEqual(firstTwo.map((m) => m.body), ["m1", "m2"], "FIFO order, capped at max");
  assert.equal(s.pendingFor("agent-b"), 1, "polled messages are consumed");

  const rest = s.poll("agent-b", 10);
  assert.deepEqual(rest.map((m) => m.body), ["m3"]);
  assert.equal(s.pendingFor("agent-b"), 0);

  const deliverCount = s.transcript.filter((e) => e.kind === "deliver").length;
  assert.equal(deliverCount, 3, "every delivered message is logged");
});

test("poll on an empty inbox returns [] and poll with max<=0 returns nothing", () => {
  const s = new WhisperStore();
  assert.deepEqual(s.poll("nobody", 10), []);
  s.send("agent-a", "agent-b", "m1");
  assert.deepEqual(s.poll("agent-b", 0), [], "max 0 yields nothing");
  assert.deepEqual(s.poll("agent-b", -5), [], "negative max is clamped to 0");
  assert.equal(s.pendingFor("agent-b"), 1, "nothing was consumed");
});

test("waitFor returns immediately when a message is already queued", async () => {
  const s = new WhisperStore();
  s.send("agent-a", "agent-b", "already here");
  const start = Date.now();
  const res = await s.waitFor("agent-b", 10, 5000);
  assert.equal(res.timedOut, false);
  assert.deepEqual(res.messages.map((m) => m.body), ["already here"]);
  assert.ok(Date.now() - start < 200, "should not block when inbox is non-empty");
});

test("waitFor wakes the moment a message arrives (no polling loop)", async () => {
  const s = new WhisperStore();
  const start = Date.now();
  const pending = s.waitFor("agent-b", 10, 5000); // blocks: inbox empty
  setTimeout(() => s.send("agent-a", "agent-b", "ping"), 40);
  const res = await pending;
  const elapsed = Date.now() - start;
  assert.equal(res.timedOut, false);
  assert.deepEqual(res.messages.map((m) => m.body), ["ping"]);
  assert.ok(elapsed < 1000, `should resolve right after arrival, took ${elapsed}ms`);
});

test("waitFor resolves empty + timedOut when nothing arrives", async () => {
  const s = new WhisperStore();
  const res = await s.waitFor("agent-b", 10, 30); // short real timeout
  assert.equal(res.timedOut, true);
  assert.deepEqual(res.messages, []);
});

test("only the first parked waiter is woken per message (FIFO)", async () => {
  const s = new WhisperStore();
  const w1 = s.waitFor("agent-b", 10, 300);
  const w2 = s.waitFor("agent-b", 10, 300);
  setTimeout(() => s.send("agent-a", "agent-b", "single"), 20);
  const [r1, r2] = await Promise.all([w1, w2]);
  assert.equal(r1.timedOut, false);
  assert.deepEqual(r1.messages.map((m) => m.body), ["single"]);
  assert.equal(r2.timedOut, true, "second waiter gets nothing and times out");
  assert.deepEqual(r2.messages, []);
});

test("reset clears peers, inboxes and transcript; parked waiters fall through to timeout", async () => {
  const s = new WhisperStore();
  s.registerPeer("agent-a");
  s.send("agent-a", "agent-b", "m1");
  const parked = s.waitFor("agent-b", 10, 60); // parked before reset

  s.reset();
  assert.equal(s.listPeers().length, 0);
  assert.equal(s.pendingFor("agent-b"), 0);
  assert.equal(s.transcript.length, 0);

  const res = await parked;
  assert.equal(res.timedOut, true, "a waiter parked before reset still resolves (via its timeout)");
});

test("transcript is capped at 200 entries", () => {
  const s = new WhisperStore();
  for (let i = 0; i < 250; i++) s.send("agent-a", "agent-b", `m${i}`);
  assert.equal(s.transcript.length, 200, "oldest entries are dropped past the cap");
  assert.equal(s.transcript.at(-1)?.body, "m249", "newest entry is retained");
});

test("message ids are unique across many sends", () => {
  const s = new WhisperStore();
  const ids = new Set<string>();
  for (let i = 0; i < 100; i++) ids.add(s.send("a", "b", "x").id);
  assert.equal(ids.size, 100);
});
