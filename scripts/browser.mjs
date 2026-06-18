// Headless browser driver for WhisperChat verification.
//   node scripts/browser.mjs [url] [--shot path] [--wait selectorText]
// Defaults to the host/port in whisper.config.json. Reports console messages,
// page errors, and writes a screenshot.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const positional = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1]?.startsWith("--") !== true);

let cfg = {};
try { cfg = JSON.parse(readFileSync("whisper.config.json", "utf8")); } catch {}
const host = process.env.HOST || cfg.host || "localhost";
const port = process.env.PORT || cfg.port || 3000;
const url = positional || `http://${host}:${port}/`;
const shot = flag("--shot", "/tmp/whisperchat.png");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const console_ = [];
const errors = [];
page.on("console", (m) => console_.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => errors.push(String(e)));

console.log(`navigating ${url}`);
// networkidle never fires here (HMR + terminal WS + SSE relay stay open).
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
// Wait for the client-only UI to mount.
await page.waitForSelector("text=Launch Claude", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);

await page.screenshot({ path: shot, fullPage: true });

const title = await page.title();
const panels = await page.locator("section[aria-label$='terminal']").count();
const peersText = await page.locator("text=/peers \\d\\/2/").first().textContent().catch(() => null);
const relayText = await page.locator("text=/relay connected|connecting/").first().textContent().catch(() => null);

const hydration = console_.filter((l) => /hydrat|did not match|server rendered HTML/i.test(l));

console.log(JSON.stringify({
  title,
  terminalPanels: panels,
  relay: relayText,
  peers: peersText,
  pageErrors: errors,
  hydrationWarnings: hydration,
  consoleErrorCount: console_.filter((l) => l.startsWith("[error]")).length,
  screenshot: shot,
}, null, 2));

if (process.env.DUMP_CONSOLE) console.log("\n--- console ---\n" + console_.join("\n"));

await browser.close();
