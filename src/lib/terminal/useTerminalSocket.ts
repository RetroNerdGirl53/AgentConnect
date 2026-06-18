"use client";

/**
 * Bridges a fancy-term <Terminal> to the server PTY over WebSocket.
 *
 * - incoming PTY bytes -> terminal.write()  (buffered until the ref is ready)
 * - terminal onData (keystrokes) -> ws
 * - terminal onResize -> ws (so the PTY matches the visible grid)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { TerminalHandle } from "@particle-academy/fancy-term";

export type SocketStatus = "connecting" | "open" | "closed";

export function useTerminalSocket(termId: string) {
  const terminalRef = useRef<TerminalHandle | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pending = useRef<string[]>([]);
  const lastSize = useRef<{ cols: number; rows: number } | null>(null);
  // Starts "connecting"; the effect's ws callbacks move it to open/closed.
  const [status, setStatus] = useState<SocketStatus>("connecting");

  const flushPending = useCallback(() => {
    const handle = terminalRef.current;
    if (!handle || pending.current.length === 0) return;
    for (const chunk of pending.current) handle.write(chunk);
    pending.current = [];
  }, []);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/api/terminal/ws?term=${encodeURIComponent(termId)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("open");
      // PTY spawns at 80x24; sync it to whatever the terminal fitted to.
      if (lastSize.current) {
        ws.send(JSON.stringify({ type: "resize", ...lastSize.current }));
      }
    };
    ws.onclose = () => setStatus("closed");
    ws.onerror = () => setStatus("closed");
    ws.onmessage = (ev) => {
      let msg: { type?: string; data?: string };
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        return;
      }
      if (msg.type === "data" && typeof msg.data === "string") {
        const handle = terminalRef.current;
        if (handle) handle.write(msg.data);
        else pending.current.push(msg.data);
      }
    };

    return () => {
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      ws.close();
      wsRef.current = null;
    };
  }, [termId]);

  const setTerminalRef = useCallback(
    (handle: TerminalHandle | null) => {
      terminalRef.current = handle;
      if (handle) flushPending();
    },
    [flushPending],
  );

  const onData = useCallback((data: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "data", data }));
    }
  }, []);

  const onResize = useCallback((size: { cols: number; rows: number }) => {
    lastSize.current = size;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "resize", cols: size.cols, rows: size.rows }));
    }
  }, []);

  /** Type text into the shell (e.g. the "Launch Claude" button). */
  const sendText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "data", data: text }));
    }
  }, []);

  const clear = useCallback(() => terminalRef.current?.clear(), []);

  return { setTerminalRef, onData, onResize, sendText, clear, status };
}
