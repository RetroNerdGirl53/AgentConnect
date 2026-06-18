/**
 * Server-side runtime config for WhisperChat.
 *
 * Source of truth is `whisper.config.json` at the project root. Environment
 * variables (HOST / PORT / AGENTS_ROOT) override the file so you can tweak a
 * single run without editing it. Read by server.ts, next.config.ts and the
 * /api/session route.
 *
 * Client code never imports this — the browser derives its origin from
 * window.location, so changing the host here is all that's needed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

type FileConfig = {
  host?: string;
  port?: number;
  agentsRoot?: string;
  allowedDevOrigins?: string[];
};

function readFileConfig(): FileConfig {
  const file = path.join(process.cwd(), "whisper.config.json");
  try {
    return JSON.parse(readFileSync(file, "utf8")) as FileConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[config] ignoring invalid ${file}: ${(err as Error).message}`);
    }
    return {};
  }
}

const file = readFileConfig();

const host = process.env.HOST ?? file.host ?? "localhost";
const port = Number(process.env.PORT ?? file.port ?? 3000);
const agentsRoot = path.resolve(process.env.AGENTS_ROOT ?? file.agentsRoot ?? "./agents");

// Next blocks cross-origin dev requests unless the origin is allowlisted.
// Always trust the host we're bound to, plus any extras from the file.
// (localhost / wildcard binds need no entry.)
const extraOrigins = file.allowedDevOrigins ?? [];
const allowedDevOrigins = Array.from(
  new Set([...extraOrigins, ...(host === "localhost" || host === "0.0.0.0" ? [] : [host])]),
);

export const serverConfig = { host, port, agentsRoot, allowedDevOrigins };
