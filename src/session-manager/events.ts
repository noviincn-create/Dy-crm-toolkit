import type { SessionRecord, SmEvent, SmEventType, SmListener } from "./types";

/** Tiny emitter with duplicate protection (same eventId is delivered once). */
export class SmEmitter {
  private listeners = new Set<SmListener>();
  private seen: string[] = [];

  subscribe(fn: SmListener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  emit(type: SmEventType, rec: SessionRecord, ts: number, reason?: string, correlationId?: string): void {
    const eventId = `${rec.id}:${rec.rev}:${type}`;
    if (this.seen.includes(eventId)) return;
    this.seen.push(eventId);
    if (this.seen.length > 200) this.seen.shift();
    const e: SmEvent = { type, sessionId: rec.id, ts, eventId, payload: { state: rec.state, rev: rec.rev, ...(reason ? { reason } : {}) }, ...(correlationId ? { correlationId } : {}) };
    for (const fn of [...this.listeners]) {
      try { fn(e); } catch (err) { console.warn("session-manager listener failed:", err); }
    }
  }
}
