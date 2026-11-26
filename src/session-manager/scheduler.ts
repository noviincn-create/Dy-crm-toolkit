/**
 * Per-session timers that are suspended while the session is not running (Pause) and resumed afterwards.
 * Lives in whichever context owns the timers (content script / panel); never relies on the service worker staying alive.
 */
interface Entry { fn: () => void; ms: number; handle: ReturnType<typeof setInterval> | null }

export class SessionScheduler {
  private timers = new Map<string, Map<string, Entry>>();

  every(sessionId: string, name: string, ms: number, fn: () => void, running = true): void {
    this.clear(sessionId, name);
    const e: Entry = { fn, ms, handle: null };
    if (!this.timers.has(sessionId)) this.timers.set(sessionId, new Map());
    this.timers.get(sessionId)!.set(name, e);
    if (running) e.handle = setInterval(fn, ms);
  }
  suspend(sessionId: string): void {
    for (const e of this.timers.get(sessionId)?.values() ?? []) if (e.handle) { clearInterval(e.handle); e.handle = null; }
  }
  resume(sessionId: string): void {
    for (const e of this.timers.get(sessionId)?.values() ?? []) if (!e.handle) e.handle = setInterval(e.fn, e.ms);
  }
  clear(sessionId: string, name?: string): void {
    const m = this.timers.get(sessionId);
    if (!m) return;
    for (const [n, e] of [...m]) if (!name || n === name) { if (e.handle) clearInterval(e.handle); m.delete(n); }
    if (!m.size) this.timers.delete(sessionId);
  }
  has(sessionId: string): boolean { return this.timers.has(sessionId); }
  ids(): string[] { return [...this.timers.keys()]; }
  isActive(sessionId: string): boolean { return [...(this.timers.get(sessionId)?.values() ?? [])].some((e) => e.handle !== null); }
}
