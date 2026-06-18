/**
 * Client-side session helpers: register a session with the embedded relay and
 * build the URL an external agent (mcp-relay-client) connects to.
 */
import type { SessionDescriptor } from "@particle-academy/agent-integrations/sharing";

/** Same-origin relay mount point (see server.ts createNodeRelay pathPrefix). */
export const RELAY_PATH = "/relay";

export function relayBaseUrl(): string {
  return `${window.location.origin}${RELAY_PATH}`;
}

/**
 * Register the session id + token with the relay broker. Must succeed before
 * the browser opens its SSE channel or any agent connects.
 */
export async function registerSession(descriptor: SessionDescriptor): Promise<void> {
  const res = await fetch(`${relayBaseUrl()}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session: descriptor.id, token: descriptor.token }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`relay register failed (${res.status}): ${detail}`);
  }
}

/**
 * The connection URL handed to mcp-relay-client. Path form
 * `<origin>/relay/<sessionId>?token=<token>` — verified compatible with both
 * the bash and npm relay clients' URL parsing.
 */
export function buildAgentRelayUrl(descriptor: SessionDescriptor): string {
  return `${relayBaseUrl()}/${descriptor.id}?token=${encodeURIComponent(descriptor.token)}`;
}
