/**
 * SessionManager: independent lifecycle engine for sessions (pause / resume / cancel / recovery).
 * - every mutation = one serialised, validated, atomic read-modify-write of ONE session record (other sessions are never touched)
 * - the clock (activeMs) only runs in RUNNING, so Pause/Recovery freeze billable time
 * - Pause is cooperative: PAUSED is reached only when no operation is in flight
 * - an operation with an unknown outcome is never repeated automatically (status "unknown" -> reconciliation)
 */
import { assertCheckpointData, latestValidCheckpoint, makeCheckpoint } from "./checkpoint";
import { activeMsAt } from "./clock";
import { KeyedMutex } from "./concurrency";
import { SmEmitter } from "./events";
import { defaultRegistry, type SessionTypeRegistry } from "./registry";
import { assertTransition, allowedActions } from "./state-machine";
import { SessionStore, type ListResult, type StorageAdapter } from "./storage";
import {
  SM_SCHEMA_VERSION, SmError, isTerminal,
  type Meta, type SessionRecord, type SessionState, type SmEventType, type SmListener,
} from "./types";

export interface ManagerOptions {
  storage: StorageAdapter;
  now?: () => number;
  newId?: () => string;
  registry?: SessionTypeRegistry;
  /** A RUNNING session with no heartbeat for this long is frozen at its last activity and needs recovery (default 12 h). */
  staleActivityMs?: number;
  /** An in-flight operation older than this is treated as interrupted (default 2 min). */
  opStaleMs?: number;
  /** Finished sessions older than this are purged (default 30 days). */
  retentionMs?: number;
}

export interface BeginOpInput { key: string; label: string; recordKey?: string }
export type BeginOpResult =
  | { ok: true; activeMs: number; hadUnknown: boolean }
  | { ok: false; reason: "state" | "already-done" | "inflight" | "record-locked"; state: SessionState; holder?: string };
export interface EndOpInput { ok: boolean; error?: string; /** a successful finalising op completes the session */ finalize?: boolean }
export interface BulkResult { id: string; ok: boolean; code?: string; message?: string }
export interface RecoveryReport { recovered: string[]; required: string[]; purged: string[]; quarantined: string[] }

type Pending = { type: SmEventType; reason?: string };
/** Returning "skip" means nothing changed: no write, no rev bump, no events. */
type Mut = (rec: SessionRecord, now: number, ev: Pending[]) => void | "skip";

export { activeMsAt };

const EVENT_FOR_STATE: Partial<Record<SessionState, SmEventType>> = {
  RUNNING: "SESSION_STARTED", PAUSING: "SESSION_PAUSING", PAUSED: "SESSION_PAUSED", RESUMING: "SESSION_RESUMING",
  COMPLETED: "SESSION_COMPLETED", FAILED: "SESSION_FAILED", CANCELLED: "SESSION_CANCELLED", RECOVERY_REQUIRED: "SESSION_RECOVERY_REQUIRED",
};

const nonEmpty = (s: unknown, max: number, what: string): string => {
  if (typeof s !== "string" || !s.trim() || s.length > max) throw new SmError("INVALID_ARGUMENT", `${what} نامعتبر است.`);
  return s.trim();
};

export class SessionManager {
  readonly events = new SmEmitter();
  readonly registry: SessionTypeRegistry;
  private readonly store: SessionStore;
  private readonly mutex = new KeyedMutex();
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly staleActivityMs: number;
  private readonly opStaleMs: number;
  private readonly retentionMs: number;

  constructor(o: ManagerOptions) {
    this.store = new SessionStore(o.storage);
    this.registry = o.registry ?? defaultRegistry();
    this.now = o.now ?? Date.now;
    this.newId = o.newId ?? ((): string => crypto.randomUUID());
    this.staleActivityMs = o.staleActivityMs ?? 12 * 3_600_000;
    this.opStaleMs = o.opStaleMs ?? 2 * 60_000;
    this.retentionMs = o.retentionMs ?? 30 * 86_400_000;
  }

  subscribe(fn: SmListener): () => void { return this.events.subscribe(fn); }

  // ───────────── internals ─────────────
  private blank(id: string, type: string, name: string, externalRef: string | null, meta: Meta, now: number): SessionRecord {
    return {
      schema: SM_SCHEMA_VERSION, id, type, name, externalRef, meta, state: "IDLE", rev: 0, createdAt: now, startedAt: null, finishedAt: null,
      lastActivityAt: now, activeMs: 0, runningSince: null, step: null, progress: null, checkpoints: [], operations: [], pauses: [],
      history: [], errors: [], recovery: null,
    };
  }

  /** The ONLY place that changes `state`: validates the transition and keeps the clock consistent. */
  private go(rec: SessionRecord, to: SessionState, now: number, ev: Pending[], reason?: string, freezeAt?: number): void {
    assertTransition(rec.state, to);
    const from = rec.state;
    if (from === "RUNNING" && rec.runningSince !== null) {
      rec.activeMs += Math.max(0, (freezeAt ?? now) - rec.runningSince);
      rec.runningSince = null;
    }
    if (to === "RUNNING") { rec.runningSince = now; rec.startedAt ??= now; }
    if (from === "RECOVERY_REQUIRED") rec.recovery = null;
    if (to === "RECOVERY_REQUIRED") rec.recovery = { reason: reason ?? "", at: now };
    if (isTerminal(to)) rec.finishedAt = now;
    rec.state = to;
    rec.lastActivityAt = now;
    rec.history.push({ at: now, from, to, ...(reason ? { reason } : {}) });
    const t = EVENT_FOR_STATE[to];
    if (t) ev.push({ type: t, ...(reason ? { reason } : {}) });
  }

  /** Serialised read-modify-write of one session. Events fire only after the record was persisted. */
  private async tx(id: string, fn: Mut, correlationId?: string): Promise<SessionRecord> {
    if (typeof id !== "string" || !id) throw new SmError("INVALID_ARGUMENT", "شناسهٔ جلسه نامعتبر است.");
    return this.mutex.run(id, async () => {
      const cur = await this.store.get(id);
      if (!cur) throw new SmError("NOT_FOUND", "جلسه پیدا نشد.");
      const rec = structuredClone(cur);
      const ev: Pending[] = [];
      const now = this.now();
      if (fn(rec, now, ev) === "skip") return cur;
      const saved = await this.store.put(rec, cur.rev);
      for (const e of ev) this.events.emit(e.type, saved, now, e.reason, correlationId);
      return saved;
    });
  }

  private inflight(rec: SessionRecord): boolean { return rec.operations.some((o) => o.status === "inflight"); }

  // ───────────── creation ─────────────
  async create(input: { type: string; name: string; externalRef?: string | null; meta?: Meta; autoStart?: boolean; id?: string }, correlationId?: string): Promise<SessionRecord> {
    this.registry.get(input.type);
    const name = nonEmpty(input.name, 200, "نام جلسه");
    const ext = input.externalRef == null ? null : nonEmpty(input.externalRef, 120, "شناسهٔ رکورد");
    const now = this.now();
    await this.store.ensureMeta();
    const rec = this.blank(input.id ?? this.newId(), input.type, name, ext, input.meta ?? {}, now);
    const saved = await this.mutex.run(rec.id, async () => {
      if (await this.store.get(rec.id)) throw new SmError("INVALID_ARGUMENT", "شناسهٔ جلسه تکراری است.");
      return this.store.put(rec, null);
    });
    this.events.emit("SESSION_CREATED", saved, now, undefined, correlationId);
    return input.autoStart ? this.start(saved.id, correlationId) : saved;
  }

  /**
   * Registers a session that already exists elsewhere (legacy localStorage session) WITHOUT changing it: idempotent per
   * (type, externalRef); the original start time is kept, so billing is identical to the legacy behaviour until a pause happens.
   */
  async adopt(input: { type: string; name: string; externalRef: string; startedAt: number; meta?: Meta }, correlationId?: string): Promise<SessionRecord> {
    this.registry.get(input.type);
    const ext = nonEmpty(input.externalRef, 120, "شناسهٔ رکورد");
    const name = nonEmpty(input.name, 200, "نام جلسه");
    return this.mutex.run("__adopt__", async () => {
      const { sessions } = await this.store.list();
      const same = sessions.filter((s) => s.type === input.type && s.externalRef === ext);
      const live = same.find((s) => !isTerminal(s.state));
      if (live) return live;
      const finished = same.sort((a, b) => b.createdAt - a.createdAt)[0];
      if (finished) return finished;
      const now = this.now();
      const started = Number.isFinite(input.startedAt) ? Math.min(input.startedAt, now) : now;
      await this.store.ensureMeta();
      const rec = this.blank(this.newId(), input.type, name, ext, input.meta ?? {}, now);
      const ev: Pending[] = [];
      this.go(rec, "RUNNING", started, ev, "adopted");
      rec.lastActivityAt = now;
      const saved = await this.store.put(rec, null);
      this.events.emit("SESSION_CREATED", saved, now, undefined, correlationId);
      this.events.emit("SESSION_STARTED", saved, now, "adopted", correlationId);
      return saved;
    });
  }

  // ───────────── lifecycle ─────────────
  start(id: string, correlationId?: string): Promise<SessionRecord> {
    return this.tx(id, (rec, now, ev) => {
      if (rec.state === "RUNNING") return "skip"; // duplicate command
      this.go(rec, "RUNNING", now, ev);
    }, correlationId);
  }

  /** Cooperative pause: the clock stops immediately; PAUSED is reached only when no operation is in flight. */
  pause(id: string, reason?: string, correlationId?: string): Promise<SessionRecord> {
    return this.tx(id, (rec, now, ev) => {
      if (rec.state === "PAUSING" || rec.state === "PAUSED") return "skip"; // duplicate command
      if (!this.registry.get(rec.type).pausable) throw new SmError("INVALID_TRANSITION", "این نوع جلسه قابل توقف نیست.");
      this.go(rec, "PAUSING", now, ev, reason);
      rec.pauses.push({ pausedAt: now, ...(reason ? { reason } : {}) });
      if (!this.inflight(rec)) this.go(rec, "PAUSED", now, ev);
    }, correlationId);
  }

  resume(id: string, correlationId?: string): Promise<SessionRecord> {
    return this.tx(id, (rec, now, ev) => {
      if (rec.state === "RUNNING" || rec.state === "RESUMING") return "skip"; // duplicate command
      if (rec.state === "RECOVERY_REQUIRED") { // explicit, conscious recovery: continue the clock from now
        this.go(rec, "RUNNING", now, ev, "recovered");
        ev.pop();
        ev.push({ type: "SESSION_RECOVERED" });
        return;
      }
      this.go(rec, "RESUMING", now, ev);
      const cp = latestValidCheckpoint(rec);
      if (cp === "corrupt") { this.go(rec, "RECOVERY_REQUIRED", now, ev, "نقطه‌ی بازیابی معتبر پیدا نشد"); return; }
      if (cp) rec.step = cp.step;
      const open = [...rec.pauses].reverse().find((p) => p.resumedAt === undefined);
      if (open) open.resumedAt = now;
      this.go(rec, "RUNNING", now, ev, "resumed");
      ev.pop(); // SESSION_STARTED is not accurate for a resume
      ev.push({ type: "SESSION_RESUMED" });
    }, correlationId);
  }

  cancel(id: string, reason?: string, correlationId?: string): Promise<SessionRecord> {
    return this.tx(id, (rec, now, ev) => {
      if (rec.state === "CANCELLING" || rec.state === "CANCELLED") return "skip";
      if (rec.state === "RUNNING" || rec.state === "PAUSING") {
        this.go(rec, "CANCELLING", now, ev, reason);
        if (!this.inflight(rec)) this.go(rec, "CANCELLED", now, ev);
      } else this.go(rec, "CANCELLED", now, ev, reason);
    }, correlationId);
  }

  complete(id: string, correlationId?: string): Promise<SessionRecord> {
    return this.tx(id, (rec, now, ev) => {
      if (rec.state === "COMPLETED") return "skip";
      this.go(rec, "COMPLETED", now, ev);
    }, correlationId);
  }

  fail(id: string, message: string, correlationId?: string): Promise<SessionRecord> {
    return this.tx(id, (rec, now, ev) => {
      if (rec.state === "FAILED") return "skip";
      rec.errors.push({ at: now, message: String(message).slice(0, 500), ...(rec.step ? { step: rec.step } : {}) });
      this.go(rec, "FAILED", now, ev, String(message).slice(0, 200));
    }, correlationId);
  }

  // ───────────── progress / checkpoints / heartbeat ─────────────
  updateProgress(id: string, p: { progress?: number | null; step?: string | null }, correlationId?: string): Promise<SessionRecord> {
    return this.tx(id, (rec, now, ev) => {
      if (isTerminal(rec.state)) throw new SmError("INVALID_TRANSITION", "جلسه پایان یافته است.");
      if (p.progress !== undefined) {
        if (p.progress !== null && !(Number.isFinite(p.progress))) throw new SmError("INVALID_ARGUMENT", "درصد پیشرفت نامعتبر است.");
        rec.progress = p.progress === null ? null : Math.min(100, Math.max(0, p.progress));
      }
      if (p.step !== undefined) rec.step = p.step === null ? null : nonEmpty(p.step, 120, "مرحله");
      rec.lastActivityAt = now;
      ev.push({ type: "SESSION_PROGRESS_UPDATED" });
    }, correlationId);
  }

  saveCheckpoint(id: string, step: string, data: Record<string, unknown>, correlationId?: string): Promise<SessionRecord> {
    return this.tx(id, (rec, now, ev) => {
      if (!(["RUNNING", "PAUSING", "RESUMING", "RECOVERY_REQUIRED"] as SessionState[]).includes(rec.state)) throw new SmError("INVALID_TRANSITION", "در این وضعیت نقطه‌ی بازیابی ذخیره نمی‌شود.");
      assertCheckpointData(data);
      const cp = makeCheckpoint(rec, nonEmpty(step, 120, "مرحله"), data, now);
      rec.checkpoints = [...rec.checkpoints, cp].slice(-5);
      rec.step = cp.step;
      rec.lastActivityAt = now;
      ev.push({ type: "SESSION_CHECKPOINT_SAVED" });
    }, correlationId);
  }

  /** Heartbeat: proves the user/panel is alive. Stored apart from the record (no rev bump, no UI churn). */
  async touch(id: string): Promise<void> {
    const rec = await this.store.get(id);
    if (rec && !isTerminal(rec.state)) await this.store.beat(id, this.now());
  }

  // ───────────── operations (idempotency, cooperative pause points, record locks) ─────────────
  /**
   * Declares the start of one execution unit. While it is in flight, Pause/Cancel wait (PAUSING/CANCELLING) instead of
   * interrupting it. The same `key` is never executed twice once done; the same CRM `recordKey` is never touched by two
   * sessions at once.
   */
  async beginOperation(id: string, input: BeginOpInput): Promise<BeginOpResult> {
    const key = nonEmpty(input.key, 160, "کلید عملیات");
    const label = nonEmpty(input.label, 120, "عنوان عملیات");
    const recordKey = input.recordKey ? nonEmpty(input.recordKey, 160, "کلید رکورد") : undefined;
    return this.mutex.run("__ops__", async () => {
      const now = this.now();
      const all = await this.store.list();
      const me = all.sessions.find((s) => s.id === id);
      if (!me) throw new SmError("NOT_FOUND", "جلسه پیدا نشد.");
      if (me.state !== "RUNNING" && me.state !== "RECOVERY_REQUIRED") return { ok: false, reason: "state", state: me.state };
      const prev = me.operations.find((o) => o.key === key);
      if (prev?.status === "done") return { ok: false, reason: "already-done", state: me.state };
      if (prev?.status === "inflight" && now - prev.startedAt < this.opStaleMs) return { ok: false, reason: "inflight", state: me.state };
      if (recordKey) {
        const holder = all.sessions.find((s) => s.id !== id && !isTerminal(s.state) &&
          s.operations.some((o) => o.recordKey === recordKey && o.status === "inflight" && now - o.startedAt < this.opStaleMs));
        if (holder) return { ok: false, reason: "record-locked", state: me.state, holder: holder.id };
      }
      const hadUnknown = prev?.status === "unknown";
      let activeMs = 0;
      await this.tx(id, (rec, n) => {
        rec.operations = rec.operations.filter((o) => o.key !== key);
        rec.operations.push({ key, label, status: "inflight", startedAt: n, ...(recordKey ? { recordKey } : {}) });
        rec.operations = rec.operations.slice(-50);
        rec.lastActivityAt = n;
        activeMs = activeMsAt(rec, n);
      });
      return { ok: true, activeMs, hadUnknown };
    });
  }

  /** Ends one execution unit and settles any pending Pause/Cancel (the safe suspension point). */
  endOperation(id: string, key: string, r: EndOpInput, correlationId?: string): Promise<SessionRecord> {
    return this.tx(id, (rec, now, ev) => {
      const op = rec.operations.find((o) => o.key === key);
      if (!op) throw new SmError("INVALID_ARGUMENT", "عملیات پیدا نشد.");
      op.status = r.ok ? "done" : "failed";
      op.finishedAt = now;
      if (!r.ok) {
        op.error = String(r.error ?? "").slice(0, 300);
        rec.errors.push({ at: now, message: op.error || "عملیات ناموفق بود", step: op.label });
      }
      rec.lastActivityAt = now;
      if (this.inflight(rec)) return;
      if (r.ok && r.finalize && !isTerminal(rec.state)) { this.go(rec, "COMPLETED", now, ev, "finalised"); return; }
      if (rec.state === "PAUSING") this.go(rec, "PAUSED", now, ev);
      else if (rec.state === "CANCELLING") this.go(rec, "CANCELLED", now, ev);
    }, correlationId);
  }

  /** Resolves an operation whose outcome was unknown after an interruption (after checking the CRM). */
  reconcileOperation(id: string, key: string, outcome: "done" | "failed", correlationId?: string): Promise<SessionRecord> {
    return this.tx(id, (rec, now) => {
      const op = rec.operations.find((o) => o.key === key);
      if (!op || op.status !== "unknown") throw new SmError("INVALID_ARGUMENT", "عملیات نیازمند تطبیق نیست.");
      op.status = outcome;
      op.finishedAt = now;
      rec.lastActivityAt = now;
    }, correlationId);
  }

  /** Cooperative check for long-running work: stop starting new units when this is true. */
  async shouldYield(id: string): Promise<boolean> {
    const rec = await this.store.get(id);
    return !rec || ["PAUSING", "PAUSED", "CANCELLING", "CANCELLED", "FAILED", "COMPLETED"].includes(rec.state);
  }

  // ───────────── queries ─────────────
  async get(id: string): Promise<SessionRecord | null> { return this.store.get(id); }
  async listDetailed(): Promise<ListResult> { return this.store.list(); }
  async list(filter?: { state?: SessionState; type?: string }): Promise<SessionRecord[]> {
    const { sessions } = await this.store.list();
    return sessions.filter((s) => (!filter?.state || s.state === filter.state) && (!filter?.type || s.type === filter.type));
  }
  async getStatus(id: string): Promise<{ state: SessionState; activeMs: number; step: string | null; progress: number | null; actions: ReturnType<typeof allowedActions> }> {
    const rec = await this.store.get(id);
    if (!rec) throw new SmError("NOT_FOUND", "جلسه پیدا نشد.");
    return { state: rec.state, activeMs: activeMsAt(rec, this.now()), step: rec.step, progress: rec.progress, actions: allowedActions(rec.state) };
  }

  // ───────────── global controls (always through the per-session rules) ─────────────
  private async bulk(pick: (s: SessionRecord) => boolean, act: (id: string) => Promise<SessionRecord>): Promise<BulkResult[]> {
    const targets = (await this.store.list()).sessions.filter(pick);
    return Promise.all(targets.map(async (s): Promise<BulkResult> => {
      try { await act(s.id); return { id: s.id, ok: true }; }
      catch (e) { return { id: s.id, ok: false, code: e instanceof SmError ? e.code : "STORAGE_FAILED", message: e instanceof Error ? e.message : String(e) }; }
    }));
  }
  pauseAll(): Promise<BulkResult[]> { return this.bulk((s) => s.state === "RUNNING", (id) => this.pause(id, "pause-all")); }
  /** Resumes PAUSED sessions only; sessions needing recovery are resumed consciously, one by one. */
  resumeAll(): Promise<BulkResult[]> { return this.bulk((s) => s.state === "PAUSED", (id) => this.resume(id)); }
  cancelAll(): Promise<BulkResult[]> { return this.bulk((s) => !isTerminal(s.state) && s.state !== "CANCELLING", (id) => this.cancel(id, "cancel-all")); }

  // ───────────── recovery (service worker start, browser start, periodic sweep) ─────────────
  /**
   * Re-establishes a consistent state from persisted data only. RUNNING sessions simply keep running (their clock is a
   * stored timestamp, not a timer); only sessions that cannot be trusted any more are flagged RECOVERY_REQUIRED:
   * interrupted operations (outcome unknown, NOT repeated), and sessions with no activity for `staleActivityMs`.
   */
  async recover(): Promise<RecoveryReport> {
    const report: RecoveryReport = { recovered: [], required: [], purged: [], quarantined: [] };
    const listed = await this.store.list();
    report.quarantined = listed.quarantined;
    const hb = await this.store.heartbeats();
    for (const s of listed.sessions) {
      if (isTerminal(s.state) || s.state === "IDLE" || s.state === "PAUSED" || s.state === "RECOVERY_REQUIRED") continue;
      try {
        await this.tx(s.id, (rec, now, ev) => {
          const stale = (o: { startedAt: number }): boolean => now - o.startedAt >= this.opStaleMs;
          const dead = rec.operations.filter((o) => o.status === "inflight" && stale(o));
          for (const o of dead) o.status = "unknown";
          const last = Math.max(rec.lastActivityAt, hb[rec.id] ?? 0);
          if (rec.state === "CANCELLING" && !this.inflight(rec)) { this.go(rec, "CANCELLED", now, ev, "recovered"); report.recovered.push(rec.id); return; }
          if (rec.state === "PAUSING" && !this.inflight(rec)) { this.go(rec, "PAUSED", now, ev, "recovered"); report.recovered.push(rec.id); return; }
          if (rec.state === "RESUMING" && !this.inflight(rec)) {
            const cp = latestValidCheckpoint(rec);
            if (cp !== "corrupt") {
              const open = [...rec.pauses].reverse().find((p) => p.resumedAt === undefined);
              if (open) open.resumedAt = now;
              this.go(rec, "RUNNING", now, ev, "recovered");
              ev.pop();
              ev.push({ type: "SESSION_RECOVERED" });
              report.recovered.push(rec.id);
              return;
            }
          }
          if (dead.length) { this.go(rec, "RECOVERY_REQUIRED", now, ev, "عملیات نیمه‌تمام ماند؛ نتیجهٔ آن نامشخص است", last); report.required.push(rec.id); return; }
          if (rec.state === "RUNNING" && !this.inflight(rec) && now - last > this.staleActivityMs) {
            this.go(rec, "RECOVERY_REQUIRED", now, ev, "بی‌فعالیتی طولانی؛ زمان تا آخرین فعالیت ثبت شد", last);
            report.required.push(rec.id);
            return;
          }
          if (!dead.length) return "skip";
        });
      } catch (e) { console.warn("session-manager: recovery of", s.id, "failed:", e); }
    }
    try { report.purged = await this.store.purge(this.now(), this.retentionMs); } catch (e) { console.warn("session-manager: purge failed:", e); }
    return report;
  }
}
