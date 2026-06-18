/**
 * Whisper MCP bridge — registers the four `whisper_*` tools on a ToolHost
 * (MicroMcpServer). This is the custom tooling that makes WhisperChat work:
 * agents call named tools to message each other, instead of writing files.
 *
 * Identity (MVP): callers pass explicit `from` / `for` fields. Because both
 * agents reach the browser through the relay, there is no transport-level
 * impersonation guard here — acceptable for a local demo.
 */
import { textResult, type ToolDefinition, type ToolHandler } from "@particle-academy/agent-integrations/mcp";
import type { WhisperStore } from "./whisperState";

/** Minimal surface a bridge needs — MicroMcpServer satisfies it. */
type ToolRegistrar = {
  registerTool(definition: ToolDefinition, handler: ToolHandler): () => void;
};

export type WhisperBridgeOptions = {
  getState: () => WhisperStore;
  /** Called after any state-changing tool so the UI can re-render. */
  onMutate?: () => void;
};

const MAX_BODY = 8 * 1024;

export function registerWhisperBridge(host: ToolRegistrar, opts: WhisperBridgeOptions) {
  const { getState, onMutate } = opts;
  const mutated = () => onMutate?.();
  const disposers: Array<() => void> = [];

  disposers.push(
    host.registerTool(
      {
        name: "whisper_register",
        description:
          "Announce this agent to the session so others can message it. Call once at startup before send/poll.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Your peer id, e.g. 'agent-a'." },
            name: { type: "string", description: "Optional human-readable name." },
            meta: { type: "object", description: "Optional free-form metadata." },
          },
          required: ["id"],
        },
      },
      async (args) => {
        const id = String(args.id ?? "").trim();
        if (!id) return textResult(JSON.stringify({ ok: false, error: "id required" }));
        const name = args.name == null ? undefined : String(args.name);
        const meta = (args.meta as Record<string, unknown> | undefined) ?? undefined;
        getState().registerPeer(id, name, meta);
        mutated();
        return textResult(JSON.stringify({ ok: true, id }), { ok: true, id });
      },
    ),
  );

  disposers.push(
    host.registerTool(
      {
        name: "whisper_peers",
        description: "List registered peers in this session and how many messages are pending for each.",
        inputSchema: { type: "object", properties: {} },
      },
      async () => {
        const state = getState();
        const peers = state.listPeers().map((p) => ({
          id: p.id,
          name: p.name,
          online: true,
          pending: state.pendingFor(p.id),
        }));
        const payload = { peers };
        return textResult(JSON.stringify(payload), payload);
      },
    ),
  );

  disposers.push(
    host.registerTool(
      {
        name: "whisper_send",
        description:
          "Send a message to another peer. The message waits in their inbox until they whisper_poll.",
        inputSchema: {
          type: "object",
          properties: {
            from: { type: "string", description: "Your peer id." },
            to: { type: "string", description: "Recipient peer id." },
            body: { type: "string", description: "Message text (markdown ok)." },
            correlationId: { type: "string", description: "Optional id to thread a reply." },
          },
          required: ["from", "to", "body"],
        },
      },
      async (args) => {
        const from = String(args.from ?? "").trim();
        const to = String(args.to ?? "").trim();
        const body = String(args.body ?? "");
        const correlationId = args.correlationId == null ? undefined : String(args.correlationId);
        const state = getState();
        if (!from || !to || !body) {
          return textResult(JSON.stringify({ ok: false, error: "from, to and body are required" }));
        }
        if (body.length > MAX_BODY) {
          return textResult(JSON.stringify({ ok: false, error: `body exceeds ${MAX_BODY} bytes` }));
        }
        if (!state.hasPeer(from)) {
          return textResult(
            JSON.stringify({ ok: false, error: `unknown sender '${from}' — call whisper_register first` }),
          );
        }
        // Queue even if the recipient hasn't registered yet: it'll be waiting in
        // their inbox when they come online (avoids startup-order races).
        const msg = state.send(from, to, body, correlationId);
        mutated();
        const payload = {
          ok: true,
          messageId: msg.id,
          ts: msg.ts,
          recipientOnline: state.hasPeer(to),
        };
        return textResult(JSON.stringify(payload), payload);
      },
    ),
  );

  disposers.push(
    host.registerTool(
      {
        name: "whisper_poll",
        description:
          "Fetch and consume pending messages addressed to you. Returns an empty list when your inbox is empty.",
        inputSchema: {
          type: "object",
          properties: {
            for: { type: "string", description: "Your peer id." },
            max: { type: "number", description: "Max messages to return (default 10)." },
          },
          required: ["for"],
        },
      },
      async (args) => {
        const id = String(args.for ?? "").trim();
        const max = typeof args.max === "number" && args.max > 0 ? Math.floor(args.max) : 10;
        if (!id) return textResult(JSON.stringify({ messages: [], error: "for required" }));
        const messages = getState().poll(id, max);
        if (messages.length > 0) mutated();
        const payload = {
          messages: messages.map((m) => ({
            id: m.id,
            from: m.from,
            body: m.body,
            correlationId: m.correlationId,
            ts: m.ts,
          })),
        };
        return textResult(JSON.stringify(payload), payload);
      },
    ),
  );

  disposers.push(
    host.registerTool(
      {
        name: "whisper_wait",
        description:
          "Block until a message arrives for you, then return it (consuming it). Returns after ~25s with " +
          "an empty list if nothing came — call it again to keep waiting. Use this to wait for the other " +
          "agent's reply instead of polling in a loop.",
        inputSchema: {
          type: "object",
          properties: {
            for: { type: "string", description: "Your peer id." },
            max: { type: "number", description: "Max messages to return (default 10)." },
            timeoutSeconds: { type: "number", description: "How long to block before returning empty (default 25, max 55)." },
          },
          required: ["for"],
        },
      },
      async (args) => {
        const id = String(args.for ?? "").trim();
        const max = typeof args.max === "number" && args.max > 0 ? Math.floor(args.max) : 10;
        const secs = typeof args.timeoutSeconds === "number" ? args.timeoutSeconds : 25;
        const timeoutMs = Math.min(Math.max(1, secs), 55) * 1000;
        if (!id) return textResult(JSON.stringify({ messages: [], error: "for required" }));
        const { messages, timedOut } = await getState().waitFor(id, max, timeoutMs);
        if (messages.length > 0) mutated();
        const payload = {
          messages: messages.map((m) => ({
            id: m.id,
            from: m.from,
            body: m.body,
            correlationId: m.correlationId,
            ts: m.ts,
          })),
          timedOut,
        };
        return textResult(JSON.stringify(payload), payload);
      },
    ),
  );

  return () => {
    for (const dispose of disposers) dispose();
  };
}
