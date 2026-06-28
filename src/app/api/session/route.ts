/**
 * POST /api/session
 * Writes a project-local .mcp.json into each agent folder pointing
 * mcp-relay-client at that agent's live session URL, so a `claude` started in
 * the panel automatically gets the whisper tools.
 *
 * Body: { agents: [{ dir: "agent-a", url: "http://localhost:3000/relay/<id>?token=<t>" }, ...] }
 */
import { NextResponse } from "next/server";
import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { serverConfig } from "@/lib/serverConfig";

const AGENTS_ROOT = serverConfig.agentsRoot;

type AgentSpec = { dir: string; url: string };

function isSafeDir(dir: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(dir) && dir !== "." && dir !== "..";
}

export async function POST(req: Request) {
  let body: { agents?: AgentSpec[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const agents = body.agents ?? [];
  if (!Array.isArray(agents) || agents.length === 0) {
    return NextResponse.json({ ok: false, error: "no_agents" }, { status: 400 });
  }

  const written: string[] = [];
  for (const agent of agents) {
    if (!agent || !isSafeDir(agent.dir) || typeof agent.url !== "string") {
      return NextResponse.json({ ok: false, error: "bad_agent_spec" }, { status: 400 });
    }
    const dir = path.join(AGENTS_ROOT, agent.dir);
    const config = {
      mcpServers: {
        "whisper-chat": {
          command: "npx",
          args: ["-y", "mcp-relay-client", agent.url],
        },
      },
    };
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, ".mcp.json");
    await writeFile(file, JSON.stringify(config, null, 2) + "\n", "utf8");
    written.push(file);

    // Pre-approve the project MCP server AND auto-allow the whisper tools so the
    // agent runs autonomously: without this, every whisper_register/whisper_send
    // stops at a "Do you want to proceed?" prompt in default permission mode and
    // the agent never gets going (peers stays 0/2). These are the app's own safe
    // messaging tools; `Bash(date:*)` lets the agent read the time of day for its
    // greeting without a prompt. (App-file edits are still blocked by the
    // PreToolUse guard hook regardless.)
    const claudeDir = path.join(dir, ".claude");
    await mkdir(claudeDir, { recursive: true });
    const settings = {
      enabledMcpjsonServers: ["whisper-chat"],
      permissions: {
        allow: [
          "mcp__whisper-chat__whisper_register",
          "mcp__whisper-chat__whisper_send",
          "mcp__whisper-chat__whisper_poll",
          "mcp__whisper-chat__whisper_wait",
          "mcp__whisper-chat__whisper_peers",
          "Bash(date:*)",
        ],
      },
    };
    const settingsFile = path.join(claudeDir, "settings.local.json");
    await writeFile(settingsFile, JSON.stringify(settings, null, 2) + "\n", "utf8");
    written.push(settingsFile);
  }

  return NextResponse.json({ ok: true, written });
}
