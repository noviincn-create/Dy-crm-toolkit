/**
 * Persistence: versioned, validated, corruption-tolerant. Uses ONLY keys under the `sm.v1.` prefix of chrome.storage.local
 * (never touches existing keys, never clears anything it does not own). Corrupt records are quarantined, not deleted.
 */
import { KeyedMutex } from "./concurrency";
import { SESSION_STATES, SM_SCHEMA_VERSION, SmError, isTerminal, type Checkpoint, type SessionRecord } from "./types";

export interface StorageAdapter {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  /** All keys (used only to rebuild a lost index). */
  keys(): Promise<string[]>;
}

const P = "sm.v1.";
export const KEY = {
  meta: P + "meta",
  idx: P + "idx",
  hb: P + "hb",
  session: (id: string): string => P + "s." + id,
  quarantine: (id: string): string => P + "q." + id,
  prefix: P,
  sessionPrefix: P + "s.",
};

/** chrome.storage.local adapter (service worker side). */
export class ChromeStorageAdapter implements StorageAdapter {
  private get area(): chrome.storage.LocalStorageArea { return chrome.storage.local; }
  get(keys: string[]): Promise<Record<string, unknown>> { return this.area.get(keys); }
  async set(items: Record<string, unknown>): Promise<void> {
    try { await this.area.set(items); } catch (e) { throw toStorageError(e); }
  }
  remove(keys: string[]): Promise<void> { return this.area.remove(keys); }
  async keys(): Promise<string[]> {
    const a = this.area as unknown as { getKeys?: () => Promise<string[]> };
    if (typeof a.getKeys === "function") return a.getKeys();
    return Object.keys(await this.area.get(null));
  }
}

/** In-memory adapter (tests). `failNextSet` simulates quota / write failures. */
export class MemoryStorageAdapter implements StorageAdapter {
  data = new Map<string, unknown>();
  failSet: Error | null = null;
  async get(keys: string[]): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const k of keys) if (this.data.has(k)) out[k] = structuredClone(this.data.get(k));
    return out;
  }
  async set(items: Record<string, unknown>): Promise<void> {
    if (this.failSet) throw toStorageError(this.failSet);
    for (const [k, v] of Object.entries(items)) this.data.set(k, structuredClone(v));
  }
  async remove(keys: string[]): Promise<void> { for (const k of keys) this.data.delete(k); }
  async keys(): Promise<string[]> { return [...this.data.keys()]; }
}

function toStorageError(e: unknown): SmError {
  const msg = e instanceof Error ? e.message : String(e);
  return new SmError(/quota/i.test(msg) ? "STORAGE_FULL" : "STORAGE_FAILED", "ذخیره‌سازی ناموفق بود: " + msg);
}

// ───────────── validation / migration ─────────────
const LIMITS = { history: 100, errors: 50, pauses: 200, operations: 50, checkpoints: 5 };

const isObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === "object" && !Array.isArray(o);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): v is number | null => v === null || num(v);

export function checksum(step: string, data: unknown): string {
  const s = step + "|" + JSON.stringify(data ?? null);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

export const checkpointValid = (c: Checkpoint): boolean => isObj(c) && typeof c.step === "string" && c.checksum === checksum(c.step, c.data);

/** Returns a clean current-schema record, "newer" for records written by a newer version, or null when corrupt. */
export function validateRecord(raw: unknown): SessionRecord | "newer" | null {
  if (!isObj(raw)) return null;
  const schema = raw.schema === undefined ? 1 : raw.schema;
  if (!num(schema)) return null;
  if (schema > SM_SCHEMA_VERSION) return "newer";
  // (schema < current would be migrated here; v1 is the first version)
  if (typeof raw.id !== "string" || !raw.id || typeof raw.type !== "string" || typeof raw.name !== "string") return null;
  if (!SESSION_STATES.includes(raw.state as never)) return null;
  if (!num(raw.rev) || !num(raw.createdAt) || !num(raw.lastActivityAt) || !num(raw.activeMs) || raw.activeMs < 0) return null;
  if (!numOrNull(raw.startedAt) || !numOrNull(raw.finishedAt) || !numOrNull(raw.runningSince) || !numOrNull(raw.progress)) return null;
  if (raw.externalRef !== null && typeof raw.externalRef !== "string") return null;
  const arr = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null);
  const cps = arr(raw.checkpoints), ops = arr(raw.operations), pauses = arr(raw.pauses), hist = arr(raw.history), errs = arr(raw.errors);
  if (!cps || !ops || !pauses || !hist || !errs || !isObj(raw.meta)) return null;
  if (raw.state === "RUNNING" && raw.runningSince === null) return null; // a running clock needs its start
  return {
    ...(raw as unknown as SessionRecord),
    schema: SM_SCHEMA_VERSION,
    step: typeof raw.step === "string" ? raw.step : null,
    recovery: isObj(raw.recovery) && typeof raw.recovery.reason === "string" ? (raw.recovery as SessionRecord["recovery"]) : null,
    checkpoints: (cps as Checkpoint[]).slice(-LIMITS.checkpoints),
    operations: (ops as SessionRecord["operations"]).slice(-LIMITS.operations),
    pauses: (pauses as SessionRecord["pauses"]).slice(-LIMITS.pauses),
    history: (hist as SessionRecord["history"]).slice(-LIMITS.history),
    errors: (errs as SessionRecord["errors"]).slice(-LIMITS.errors),
  };
}

export interface ListResult { sessions: SessionRecord[]; quarantined: string[]; skipped: string[] }

/** Typed access to session records with index self-healing and stale-write detection. */
export class SessionStore {
  /** All writes (index read-modify-write included) are serialised: two sessions created at once can never lose an index entry. */
  private readonly writes = new KeyedMutex();
  constructor(private readonly adapter: StorageAdapter) {}

  private async readIndex(): Promise<string[]> {
    const r = await this.adapter.get([KEY.idx]);
    const idx = r[KEY.idx];
    if (Array.isArray(idx) && idx.every((x) => typeof x === "string")) return idx as string[];
    // index missing or damaged -> rebuild from the keys this module owns
    const ids = (await this.adapter.keys()).filter((k) => k.startsWith(KEY.sessionPrefix)).map((k) => k.slice(KEY.sessionPrefix.length));
    if (ids.length) await this.adapter.set({ [KEY.idx]: ids });
    return ids;
  }

  async ensureMeta(): Promise<void> {
    const r = await this.adapter.get([KEY.meta]);
    const m = r[KEY.meta];
    if (!isObj(m) || m.schema !== SM_SCHEMA_VERSION) {
      // Only ever written when absent/older; a NEWER schema is left alone (see validateRecord).
      if (!isObj(m) || !num(m.schema) || m.schema < SM_SCHEMA_VERSION) await this.adapter.set({ [KEY.meta]: { schema: SM_SCHEMA_VERSION, at: Date.now() } });
    }
  }

  async get(id: string): Promise<SessionRecord | null> {
    const raw = (await this.adapter.get([KEY.session(id)]))[KEY.session(id)];
    if (raw === undefined) return null;
    const v = validateRecord(raw);
    if (v === null) { await this.quarantine(id, raw); throw new SmError("CORRUPT", "رکورد جلسه آسیب‌دیده است و قرنطینه شد."); }
    if (v === "newer") throw new SmError("CORRUPT", "رکورد جلسه با نسخهٔ جدیدتر افزونه ساخته شده است.");
    return v;
  }

  /** Writes `rec` (rev+1). `expectedRev` = rev read before; a different stored rev means someone else wrote meanwhile. */
  put(rec: SessionRecord, expectedRev: number | null): Promise<SessionRecord> {
    return this.writes.run("w", () => this.putLocked(rec, expectedRev));
  }

  private async putLocked(rec: SessionRecord, expectedRev: number | null): Promise<SessionRecord> {
    if (expectedRev !== null) {
      const cur = (await this.adapter.get([KEY.session(rec.id)]))[KEY.session(rec.id)];
      if (isObj(cur) && num(cur.rev) && cur.rev !== expectedRev) throw new SmError("BUSY", "رکورد جلسه هم‌زمان تغییر کرده است؛ دوباره تلاش کنید.");
    }
    const next: SessionRecord = { ...rec, rev: rec.rev + 1 };
    const idx = await this.readIndex();
    const items: Record<string, unknown> = { [KEY.session(rec.id)]: next };
    if (!idx.includes(rec.id)) items[KEY.idx] = [...idx, rec.id];
    await this.adapter.set(items);
    return next;
  }

  async list(): Promise<ListResult> {
    const ids = await this.readIndex();
    const raws = await this.adapter.get(ids.map(KEY.session));
    const out: ListResult = { sessions: [], quarantined: [], skipped: [] };
    const missing: string[] = [];
    for (const id of ids) {
      const raw = raws[KEY.session(id)];
      if (raw === undefined) { missing.push(id); continue; }
      const v = validateRecord(raw);
      if (v === null) { await this.quarantine(id, raw); out.quarantined.push(id); }
      else if (v === "newer") out.skipped.push(id);
      else out.sessions.push(v);
    }
    if (missing.length) await this.writes.run("w", async () => { const cur = await this.readIndex(); await this.adapter.set({ [KEY.idx]: cur.filter((i) => !missing.includes(i)) }); });
    out.sessions.sort((a, b) => a.createdAt - b.createdAt);
    return out;
  }

  /** Moves a corrupt record aside (kept for diagnosis) and drops it from the index. Never silently destroys data. */
  private quarantine(id: string, raw: unknown): Promise<void> {
    return this.writes.run("w", async () => {
      try {
        const idx = await this.readIndex();
        await this.adapter.set({ [KEY.quarantine(id)]: { at: Date.now(), raw }, [KEY.idx]: idx.filter((i) => i !== id) });
        await this.adapter.remove([KEY.session(id)]);
      } catch (e) { console.warn("session-manager: quarantine failed", e); }
    });
  }

  async heartbeats(): Promise<Record<string, number>> {
    const hb = (await this.adapter.get([KEY.hb]))[KEY.hb];
    return isObj(hb) ? (hb as Record<string, number>) : {};
  }
  beat(id: string, ts: number): Promise<void> {
    return this.writes.run("w", async () => {
      const hb = await this.heartbeats();
      hb[id] = ts;
      await this.adapter.set({ [KEY.hb]: hb });
    });
  }

  /** Removes finished sessions older than `maxAgeMs` (only this module's own keys). Returns removed ids. */
  async purge(now: number, maxAgeMs: number, keepAtMost = 200): Promise<string[]> {
    const { sessions } = await this.list();
    const done = sessions.filter((s) => isTerminal(s.state)).sort((a, b) => (a.finishedAt ?? a.createdAt) - (b.finishedAt ?? b.createdAt));
    const victims = done.filter((s, i) => now - (s.finishedAt ?? s.createdAt) > maxAgeMs || done.length - i > keepAtMost).map((s) => s.id);
    if (!victims.length) return [];
    return this.writes.run("w", async () => {
      const idx = await this.readIndex();
      const hb = await this.heartbeats();
      for (const id of victims) delete hb[id];
      await this.adapter.set({ [KEY.idx]: idx.filter((i) => !victims.includes(i)), [KEY.hb]: hb });
      await this.adapter.remove(victims.map(KEY.session));
      return victims;
    });
  }
}
