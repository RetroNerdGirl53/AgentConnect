// Verify the PTY WebSocket: open term-a, run `pwd`, assert cwd is agents/agent-a.
import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:3000/api/terminal/ws?term=term-a");
let buf = "";
const timer = setTimeout(() => { console.error("TIMEOUT"); process.exit(1); }, 6000);

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "resize", cols: 100, rows: 30 }));
  setTimeout(() => ws.send(JSON.stringify({ type: "data", data: "pwd\r" })), 400);
});
ws.on("message", (raw) => {
  try {
    const m = JSON.parse(raw.toString());
    if (m.type === "data") {
      buf += m.data;
      if (buf.includes("agents/agent-a")) {
        clearTimeout(timer);
        console.log("PTY OK — shell cwd contains agents/agent-a");
        ws.close();
        process.exit(0);
      }
    }
  } catch { /* ignore */ }
});
ws.on("error", (e) => { console.error("WS ERROR", e.message); process.exit(1); });
