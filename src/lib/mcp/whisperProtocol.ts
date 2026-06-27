/**
 * WhisperChat wire protocol — the standardized message envelope.
 *
 * A whisper message is a structured JSON envelope passed as the arguments to the
 * `whisper_send` MCP tool. The envelope MUST carry the shared `marker` string;
 * the bridge rejects anything without it, so only deliberate, well-formed agent
 * messages route — and nothing meant for an agent is silently dropped.
 *
 * Keeping this in one module means the bridge, the skills, and the tests all
 * agree on the marker and the shape. The `to` field accepts a single id, an
 * array of ids, or "all" (broadcast), so growing past two agents is a config
 * change, not a protocol change.
 */

/** Current envelope version. Bump on a breaking shape change. */
export const WHISPER_PROTOCOL_VERSION = 1 as const;

/**
 * The magic marker every whisper envelope must include. It is the gate: the
 * bridge routes a `whisper_send` only when `marker` equals this exactly.
 * Not a security boundary (it lives in the prompt + source) — it's a deliberate,
 * collision-proof "this JSON is a whisper message" discriminator.
 */
export const WHISPER_MARKER = "Chl0e 1$ a g0dd3$$ 1533$7&9p";

/** Broadcast recipient sentinel. */
export const WHISPER_BROADCAST = "all";

/** The envelope an agent sends (server stamps id/ts and validates from). */
export type WhisperEnvelope = {
  marker: string;
  v?: number;
  from: string;
  /** A peer id, an array of peer ids, or "all" to broadcast. */
  to: string | string[];
  body: string;
  /** Optional id of the message this replies to (threading). */
  replyTo?: string;
};

/** True when the marker matches the protocol's magic string. */
export function hasValidMarker(value: unknown): boolean {
  return value === WHISPER_MARKER;
}

/**
 * Expand a `to` field into concrete recipient ids. "all"/"*" fans out to every
 * registered peer except the sender; an array is de-duplicated; a bare string is
 * a single recipient. Empty/blank entries are dropped.
 */
export function resolveRecipients(
  to: unknown,
  from: string,
  allPeerIds: string[],
): string[] {
  if (to === WHISPER_BROADCAST || to === "*") {
    return allPeerIds.filter((id) => id !== from);
  }
  const list = Array.isArray(to) ? to : [to];
  const cleaned = list
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0);
  return [...new Set(cleaned)];
}
