/**
 * Client-side session helpers: register a session with the embedded relay and
 * build the URL an external agent (mcp-relay-client) connects to.
 */
import { createSessionDescriptor, type SessionDescriptor } from "@particle-academy/agent-integrations/sharing";

/** Same-origin relay mount point (see server.ts createNodeRelay pathPrefix). */
export const RELAY_PATH = "/relay";

export function relayBaseUrl(): string {
  return `${window.location.origin}${RELAY_PATH}`;
}

const sessionKey = (agentId: string) => `whisperchat-session-${agentId}`;

/**
 * Stable per-agent relay session, persisted in localStorage.
 *
 * Without this, every tab load minted a fresh random session and rewrote
 * `agents/<id>/.mcp.json` — so reloading the tab orphaned any running agent
 * (it stayed bound to the old session) and the peers badge read 0/2. Reusing a
 * persisted descriptor keeps the session id + the agent's `.mcp.json` URL
 * constant across reloads, so a reopened tab re-attaches to the same session the
 * agent is already on. (Per browser profile; use one tab at a time.)
 */
export function getStableSessionDescriptor(agentId: string): SessionDescriptor {
  try {
    const raw = localStorage.getItem(sessionKey(agentId));
    if (raw) {
      const d = JSON.parse(raw) as SessionDescriptor;
      if (d && typeof d.id === "string" && typeof d.token === "string") return d;
    }
  } catch {
    /* storage unavailable or corrupt → fall through and mint a fresh one */
  }
  const fresh = createSessionDescriptor();
  try {
    localStorage.setItem(sessionKey(agentId), JSON.stringify(fresh));
  } catch {
    /* non-fatal: session just won't persist across reloads */
  }
  return fresh;
}

/**
 * Register the session id + token with the relay broker. Idempotent: re-running
 * for an already-registered (stable) session is fine — a non-OK response is
 * warned and tolerated rather than thrown, so a tab reload doesn't wedge setup.
 */
export async function registerSession(descriptor: SessionDescriptor): Promise<void> {
  try {
    const res = await fetch(`${relayBaseUrl()}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session: descriptor.id, token: descriptor.token }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`[whisper] relay register ${descriptor.id} → ${res.status}: ${detail} (continuing — session may already exist)`);
    }
  } catch (err) {
    console.warn(`[whisper] relay register ${descriptor.id} failed: ${(err as Error).message} (continuing)`);
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
