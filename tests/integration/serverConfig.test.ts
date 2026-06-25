/**
 * Integration test — runtime config precedence (src/lib/serverConfig.ts)
 *
 * serverConfig is evaluated once at module load: it reads whisper.config.json
 * from cwd, then lets HOST / PORT / AGENTS_ROOT environment variables override
 * it. Because the value is frozen at import time, we can't meaningfully re-test
 * precedence inside one process — so each case spawns a fresh child that imports
 * the module under a specific environment and prints the resulting config.
 *
 * This also documents the allowedDevOrigins rule: the bound host is auto-trusted
 * for Next's dev cross-origin guard, except localhost / 0.0.0.0 which need no entry.
 *
 * Run: node --import tsx --test tests/integration/serverConfig.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const modulePath = path.join(repoRoot, "src", "lib", "serverConfig.ts");

/** Import serverConfig in a child process with a given env; return the parsed config. */
function loadConfig(env: Record<string, string | undefined>): any {
  const code =
    `import(${JSON.stringify(modulePath)}).then((m) => ` +
    `process.stdout.write(JSON.stringify(m.serverConfig)));`;
  const out = execFileSync(process.execPath, ["--import", "tsx", "-e", code], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, HOST: undefined, PORT: undefined, AGENTS_ROOT: undefined, ...env },
  });
  return JSON.parse(out.trim());
}

test("environment variables override the config file", () => {
  const cfg = loadConfig({ HOST: "10.0.0.5", PORT: "4567", AGENTS_ROOT: "/tmp/whisper-agents-x" });
  assert.equal(cfg.host, "10.0.0.5");
  assert.equal(cfg.port, 4567);
  assert.equal(cfg.agentsRoot, path.resolve("/tmp/whisper-agents-x"));
});

test("port is coerced to a number", () => {
  const cfg = loadConfig({ PORT: "8080" });
  assert.equal(typeof cfg.port, "number");
  assert.equal(cfg.port, 8080);
});

test("agentsRoot is resolved to an absolute path", () => {
  const cfg = loadConfig({ AGENTS_ROOT: "./some/relative/agents" });
  assert.equal(path.isAbsolute(cfg.agentsRoot), true);
});

test("a non-loopback bound host is auto-added to allowedDevOrigins", () => {
  const cfg = loadConfig({ HOST: "192.168.1.50" });
  assert.ok(cfg.allowedDevOrigins.includes("192.168.1.50"));
});

test("localhost and 0.0.0.0 are NOT added to allowedDevOrigins (they need no entry)", () => {
  assert.equal(loadConfig({ HOST: "localhost" }).allowedDevOrigins.includes("localhost"), false);
  assert.equal(loadConfig({ HOST: "0.0.0.0" }).allowedDevOrigins.includes("0.0.0.0"), false);
});
