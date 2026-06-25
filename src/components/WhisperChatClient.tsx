"use client";

import dynamic from "next/dynamic";

/**
 * WhisperChat is wholly interactive — xterm terminals (fancy-term) and an
 * in-browser MCP server, both DOM-only. There's nothing meaningful to
 * server-render, and SSR-ing xterm produces hydration mismatches. So we load
 * it client-only behind a matching full-screen placeholder.
 */
const WhisperChat = dynamic(() => import("./WhisperChat").then((m) => m.WhisperChat), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-canvas text-sm text-faint">
      Starting WhisperChat…
    </div>
  ),
});

export function WhisperChatClient() {
  return <WhisperChat />;
}
