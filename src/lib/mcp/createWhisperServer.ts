/**
 * Factory for the in-browser MCP server that hosts the whisper tools.
 * One server, multiple transports: we attach one SSE relay transport per
 * agent session (see WhisperChat.tsx), so each agent gets its own response
 * stream and there is no JSON-RPC id cross-talk between the two agents.
 */
import { MicroMcpServer } from "@particle-academy/agent-integrations/mcp";
import { registerWhisperBridge } from "./whisperBridge";
import { WHISPER_MARKER } from "./whisperProtocol";
import type { WhisperStore } from "./whisperState";

export function createWhisperServer(store: WhisperStore, onMutate: () => void): MicroMcpServer {
  const server = new MicroMcpServer({
    info: { name: "whisper-chat", version: "0.1.0", title: "WhisperChat" },
    instructions:
      "You are connected to WhisperChat — a live channel to another AI agent who is available to help. " +
      "Call whisper_register once at startup. To message the other agent, call whisper_send with a JSON " +
      `envelope that MUST include marker: "${WHISPER_MARKER}" (the magic string the bridge looks for to ` +
      "route it), plus from, to (a peer id or \"all\"), and body. Receive replies with whisper_wait, which " +
      "blocks until a message arrives so you don't poll in a loop. A timeout just means keep waiting — never " +
      "try to fix the server. Communicate only through these tools, never by writing files.",
  });

  registerWhisperBridge(server, { getState: () => store, onMutate });

  return server;
}
