/**
 * Unit tests — client session helpers (src/lib/session.ts)
 *
 * These helpers build the relay URLs the browser hands to the agents and
 * register a session with the relay broker. They depend on two browser
 * globals — `window.location` and `fetch` — which we stub here so the pure
 * URL-shaping and request-shaping logic can be tested in plain Node.
 *
 * Run: node --import tsx --test tests/unit/session.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
// Side-effect import: stubs `window` before src/lib/session (and its sharing
// dependency) is evaluated. Must precede the module-under-test import below.
import { TEST_ORIGIN as ORIGIN } from "./_setup-window";
import { relayBaseUrl, buildAgentRelayUrl, registerSession, RELAY_PATH } from "../../src/lib/session";

test("RELAY_PATH is the same-origin relay mount point", () => {
  assert.equal(RELAY_PATH, "/relay");
});

test("relayBaseUrl is the window origin + /relay", () => {
  assert.equal(relayBaseUrl(), `${ORIGIN}/relay`);
});

test("buildAgentRelayUrl produces <origin>/relay/<id>?token=<encoded>", () => {
  const url = buildAgentRelayUrl({ id: "sess-123", token: "abc" } as any);
  assert.equal(url, `${ORIGIN}/relay/sess-123?token=abc`);
});

test("buildAgentRelayUrl URL-encodes tokens with reserved characters", () => {
  const url = buildAgentRelayUrl({ id: "s", token: "a b/c+d=e&f" } as any);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("token"), "a b/c+d=e&f", "token round-trips through encoding");
  assert.ok(!url.includes("a b/c"), "raw reserved characters must be percent-encoded in the string");
});

test("registerSession POSTs the descriptor to /relay/register", async () => {
  const calls: Array<{ url: string; init: any }> = [];
  (globalThis as any).fetch = async (url: string, init: any) => {
    calls.push({ url, init });
    return { ok: true, status: 200, text: async () => "" };
  };

  await registerSession({ id: "sess-9", token: "tok-9" } as any);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${ORIGIN}/relay/register`);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), { session: "sess-9", token: "tok-9" });
});

test("registerSession tolerates a non-OK relay response (warns, does not throw)", async () => {
  // Idempotent re-register on reload must not wedge setup, so a non-OK response
  // is warned-and-continued, not thrown.
  (globalThis as any).fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => "invalid_token",
  });

  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...a: unknown[]) => {
    warnings.push(a.map(String).join(" "));
  };
  try {
    await registerSession({ id: "sess-9", token: "bad" } as any); // resolves, no throw
  } finally {
    console.warn = origWarn;
  }

  assert.equal(warnings.length, 1, "a non-OK register should emit one warning");
  assert.match(warnings[0], /401/);
  assert.match(warnings[0], /invalid_token/);
});
