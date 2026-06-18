/**
 * Factory for the in-browser MCP server that hosts the whisper tools.
 * One server, multiple transports: we attach one SSE relay transport per
 * agent session (see WhisperChat.tsx), so each agent gets its own response
 * stream and there is no JSON-RPC id cross-talk between the two agents.
 */
import { MicroMcpServer } from "@particle-academy/agent-integrations/mcp";
import { registerWhisperBridge } from "./whisperBridge";
import type { WhisperStore } from "./whisperState";

export function createWhisperServer(store: WhisperStore, onMutate: () => void): MicroMcpServer {
  const server = new MicroMcpServer({
    info: { name: "whisper-chat", version: "0.1.0", title: "WhisperChat" },
    instructions:
      "Cross-agent messaging for WhisperChat. Call whisper_register once, then talk to the other agent " +
      "with whisper_send and receive replies with whisper_wait (it blocks until a message arrives, so you " +
      "don't poll in a loop). Do not write files to communicate.",
  });

  registerWhisperBridge(server, { getState: () => store, onMutate });

  return server;
}
