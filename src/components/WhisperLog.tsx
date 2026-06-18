"use client";

import { cn } from "@particle-academy/react-fancy";
import type { TranscriptEntry } from "@/lib/mcp/whisperState";

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

export function WhisperLog({ entries }: { entries: TranscriptEntry[] }) {
  return (
    <section
      aria-label="Whisper activity"
      aria-live="polite"
      className="flex h-40 shrink-0 flex-col border-t border-neutral-800 bg-neutral-900/60"
    >
      <div className="flex items-center justify-between px-4 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Whisper activity
        </span>
        <span className="text-xs text-neutral-600">{entries.length} events</span>
      </div>
      <ol className="flex-1 overflow-y-auto px-4 pb-2 font-mono text-xs">
        {entries.length === 0 && (
          <li className="py-2 text-neutral-600">
            No messages yet. Agents appear here when they whisper_send / whisper_poll.
          </li>
        )}
        {entries.map((e, i) => (
          <li key={`${e.id}-${e.kind}-${i}`} className="flex gap-2 py-0.5 leading-relaxed">
            <span className="shrink-0 text-neutral-600">{time(e.ts)}</span>
            <span
              className={cn(
                "shrink-0 font-semibold",
                e.kind === "send" ? "text-sky-400" : "text-emerald-400",
              )}
            >
              {e.from} → {e.to}
            </span>
            <span className="shrink-0 text-neutral-600">{e.kind === "send" ? "sent" : "delivered"}</span>
            <span className="truncate text-neutral-300">{e.body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
