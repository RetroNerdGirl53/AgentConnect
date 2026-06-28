/**
 * In-memory whisper state — the heart of the cross-agent channel.
 *
 * Lives in the browser tab (owned by the WhisperChat React component) and is
 * mutated by the `whisper_*` MCP tools. No filesystem, no server persistence:
 * messages exist here until polled, then they're gone. Closing the tab ends
 * the session.
 *
 * Think of this as a small dataclass store: peers + per-recipient inboxes +
 * a capped transcript for the UI activity log.
 */

export type WhisperMessage = {
  id: string;
  from: string;
  to: string;
  body: string;
  correlationId?: string;
  ts: number;
};

export type PeerRecord = {
  id: string;
  name?: string;
  meta?: Record<string, unknown>;
  connectedAt: number;
  lastSeen: number;
};

/** A transcript entry mirrors a delivered/queued message for the activity feed. */
export type TranscriptEntry = WhisperMessage & { kind: "send" | "deliver" };

const TRANSCRIPT_CAP = 200;

export class WhisperStore {
  private peers = new Map<string, PeerRecord>();
  private inboxes = new Map<string, WhisperMessage[]>();
  /** Resolvers parked by whisper_wait, keyed by recipient id (FIFO). */
  private waiters = new Map<string, Array<() => void>>();
  /**
   * Push delivery: a per-recipient sink that hands a message straight to that
   * agent (we wire it to writing into the agent's terminal). When a recipient
   * has a deliverer, send() PUSHES to it instead of queuing — so the agent never
   * has to poll/whisper_wait. Without one, messages queue as before (fallback).
   */
  private deliverers = new Map<string, (msg: WhisperMessage) => void>();
  transcript: TranscriptEntry[] = [];
  private seq = 0;

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${Date.now().toString(36)}_${this.seq.toString(36)}`;
  }

  registerPeer(id: string, name?: string, meta?: Record<string, unknown>): PeerRecord {
    const now = Date.now();
    const existing = this.peers.get(id);
    const record: PeerRecord = existing
      ? { ...existing, name: name ?? existing.name, meta: meta ?? existing.meta, lastSeen: now }
      : { id, name, meta, connectedAt: now, lastSeen: now };
    this.peers.set(id, record);
    return record;
  }

  listPeers(): PeerRecord[] {
    return [...this.peers.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  pendingFor(id: string): number {
    return this.inboxes.get(id)?.length ?? 0;
  }

  /**
   * Send a message to a recipient. If the recipient has a registered deliverer,
   * the message is PUSHED to it immediately (no queue, no polling); otherwise it
   * is queued for whisper_poll/whisper_wait (fallback). Returns the message.
   */
  send(from: string, to: string, body: string, correlationId?: string): WhisperMessage {
    const msg: WhisperMessage = {
      id: this.nextId("msg"),
      from,
      to,
      body,
      correlationId,
      ts: Date.now(),
    };
    this.pushTranscript({ ...msg, kind: "send" });
    const peer = this.peers.get(from);
    if (peer) peer.lastSeen = Date.now();

    const deliver = this.deliverers.get(to);
    if (deliver) {
      // Push path: hand it straight to the recipient (their terminal).
      this.pushTranscript({ ...msg, kind: "deliver" });
      deliver(msg);
    } else {
      // Fallback path: queue until the recipient polls / waits.
      const box = this.inboxes.get(to) ?? [];
      box.push(msg);
      this.inboxes.set(to, box);
      this.wakeWaiter(to);
    }
    return msg;
  }

  /**
   * Register (or clear, with null) the push sink for a recipient. On register we
   * immediately drain anything already queued for them, so messages that arrived
   * before their terminal was ready still get delivered.
   */
  setDeliverer(id: string, fn: ((msg: WhisperMessage) => void) | null): void {
    if (!fn) {
      this.deliverers.delete(id);
      return;
    }
    this.deliverers.set(id, fn);
    const box = this.inboxes.get(id);
    if (box && box.length > 0) {
      const taken = box.splice(0);
      this.inboxes.set(id, box);
      for (const m of taken) {
        this.pushTranscript({ ...m, kind: "deliver" });
        fn(m);
      }
    }
  }

  /**
   * Blocking receive: resolve as soon as a message is waiting for `id`, else
   * resolve empty after `timeoutMs`. Lets an agent "wait for a reply" with a
   * single in-flight tool call instead of a polling loop.
   */
  waitFor(id: string, max: number, timeoutMs: number): Promise<{ messages: WhisperMessage[]; timedOut: boolean }> {
    const ready = this.poll(id, max);
    if (ready.length > 0) return Promise.resolve({ messages: ready, timedOut: false });

    return new Promise((resolve) => {
      const onArrive = () => {
        clearTimeout(timer);
        remove();
        resolve({ messages: this.poll(id, max), timedOut: false });
      };
      const remove = () => {
        const arr = this.waiters.get(id);
        if (!arr) return;
        const i = arr.indexOf(onArrive);
        if (i >= 0) arr.splice(i, 1);
      };
      const timer = setTimeout(() => {
        remove();
        resolve({ messages: [], timedOut: true });
      }, timeoutMs);
      const arr = this.waiters.get(id) ?? [];
      arr.push(onArrive);
      this.waiters.set(id, arr);
    });
  }

  private wakeWaiter(id: string): void {
    const arr = this.waiters.get(id);
    if (arr && arr.length > 0) arr[0]();
  }

  /** Consume up to `max` messages destined for `id` (exactly-once for MVP). */
  poll(id: string, max: number): WhisperMessage[] {
    const box = this.inboxes.get(id) ?? [];
    const taken = box.splice(0, Math.max(0, max));
    this.inboxes.set(id, box);
    for (const msg of taken) this.pushTranscript({ ...msg, kind: "deliver" });
    const peer = this.peers.get(id);
    if (peer) peer.lastSeen = Date.now();
    return taken;
  }

  hasPeer(id: string): boolean {
    return this.peers.has(id);
  }

  reset(): void {
    this.peers.clear();
    this.inboxes.clear();
    this.waiters.clear(); // parked waitFor() calls fall through to their timeout
    this.transcript = [];
  }

  private pushTranscript(entry: TranscriptEntry): void {
    this.transcript.push(entry);
    if (this.transcript.length > TRANSCRIPT_CAP) {
      this.transcript.splice(0, this.transcript.length - TRANSCRIPT_CAP);
    }
  }
}
