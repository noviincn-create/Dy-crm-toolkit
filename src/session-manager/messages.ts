/**
 * Typed message contract of the Session Manager. Rides on the EXISTING background channel
 * (BgRequest { type: "sm", req }) instead of introducing a second messaging system.
 * Every request: message type (op) + session id + timestamp + validated payload + optional correlation id.
 */
import type { BeginOpResult, BulkResult, RecoveryReport } from "./manager";
import { SmError, type Meta, type SessionRecord, type SmErrorCode } from "./types";

export const SM_OPS = [
  "create", "adopt", "start", "pause", "resume", "cancel", "complete", "fail", "touch", "get", "list", "progress", "checkpoint",
  "beginOp", "endOp", "reconcile", "pauseAll", "resumeAll", "cancelAll", "recover",
] as const;
export type SmOp = (typeof SM_OPS)[number];

export interface SmPayloads {
  create: { type: string; name: string; externalRef?: string | null; meta?: Meta; autoStart?: boolean };
  adopt: { type: string; name: string; externalRef: string; startedAt: number; meta?: Meta };
  start: Record<string, never>;
  pause: { reason?: string };
  resume: Record<string, never>;
  cancel: { reason?: string };
  complete: Record<string, never>;
  fail: { message: string };
  touch: Record<string, never>;
  get: Record<string, never>;
  list: Record<string, never>;
  progress: { progress?: number | null; step?: string | null };
  checkpoint: { step: string; data: Record<string, unknown> };
  beginOp: { key: string; label: string; recordKey?: string };
  endOp: { key: string; ok: boolean; error?: string; finalize?: boolean };
  reconcile: { key: string; outcome: "done" | "failed" };
  pauseAll: Record<string, never>;
  resumeAll: Record<string, never>;
  cancelAll: Record<string, never>;
  recover: Record<string, never>;
}

export interface SmResults {
  create: SessionRecord; adopt: SessionRecord; start: SessionRecord; pause: SessionRecord; resume: SessionRecord; cancel: SessionRecord;
  complete: SessionRecord; fail: SessionRecord; touch: null; get: SessionRecord | null; list: { sessions: SessionRecord[]; quarantined: number };
  progress: SessionRecord; checkpoint: SessionRecord; beginOp: BeginOpResult; endOp: SessionRecord; reconcile: SessionRecord;
  pauseAll: BulkResult[]; resumeAll: BulkResult[]; cancelAll: BulkResult[]; recover: RecoveryReport;
}

export interface SmRequest<K extends SmOp = SmOp> {
  v: 1;
  op: K;
  sessionId: string | null;
  ts: number;
  correlationId?: string;
  payload: SmPayloads[K];
}

/** Discriminated by `op`: narrowing `op` narrows `payload`. */
export type SmAnyRequest = { [K in SmOp]: SmRequest<K> }[SmOp];

export type SmResponse<K extends SmOp = SmOp> =
  | { ok: true; data: SmResults[K]; correlationId?: string }
  | { ok: false; code: SmErrorCode; message: string; correlationId?: string };

/** Ops that act on one existing session (need a session id). */
const NEEDS_ID: ReadonlySet<SmOp> = new Set<SmOp>(["start", "pause", "resume", "cancel", "complete", "fail", "touch", "get", "progress", "checkpoint", "beginOp", "endOp", "reconcile"]);

const bad = (m: string): never => { throw new SmError("INVALID_ARGUMENT", "پیام نامعتبر: " + m); };
const isObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === "object" && !Array.isArray(o);
const str = (o: Record<string, unknown>, k: string, max = 200): string => {
  const v = o[k];
  if (typeof v !== "string" || !v || v.length > max) bad(k);
  return v as string;
};
const optStr = (o: Record<string, unknown>, k: string, max = 200): string | undefined => (o[k] === undefined ? undefined : str(o, k, max));
const optBool = (o: Record<string, unknown>, k: string): boolean | undefined => {
  if (o[k] === undefined) return undefined;
  if (typeof o[k] !== "boolean") bad(k);
  return o[k] as boolean;
};
const meta = (o: Record<string, unknown>): Meta | undefined => {
  const m = o.meta;
  if (m === undefined) return undefined;
  if (!isObj(m) || Object.keys(m).length > 30) bad("meta");
  for (const v of Object.values(m as Record<string, unknown>)) if (!(v === null || ["string", "number", "boolean"].includes(typeof v))) bad("meta");
  return m as Meta;
};

type Validators = { [K in SmOp]: (p: Record<string, unknown>) => SmPayloads[K] };
const VALIDATORS: Validators = {
  create: (p) => ({ type: str(p, "type", 41), name: str(p, "name"), ...(p.externalRef != null ? { externalRef: str(p, "externalRef", 120) } : {}), ...(meta(p) ? { meta: meta(p)! } : {}), ...(optBool(p, "autoStart") !== undefined ? { autoStart: optBool(p, "autoStart")! } : {}) }),
  adopt: (p) => {
    if (typeof p.startedAt !== "number" || !Number.isFinite(p.startedAt)) bad("startedAt");
    return { type: str(p, "type", 41), name: str(p, "name"), externalRef: str(p, "externalRef", 120), startedAt: p.startedAt as number, ...(meta(p) ? { meta: meta(p)! } : {}) };
  },
  start: () => ({}), resume: () => ({}), complete: () => ({}), touch: () => ({}), get: () => ({}), list: () => ({}),
  pauseAll: () => ({}), resumeAll: () => ({}), cancelAll: () => ({}), recover: () => ({}),
  pause: (p) => ({ ...(optStr(p, "reason", 120) ? { reason: optStr(p, "reason", 120)! } : {}) }),
  cancel: (p) => ({ ...(optStr(p, "reason", 120) ? { reason: optStr(p, "reason", 120)! } : {}) }),
  fail: (p) => ({ message: str(p, "message", 500) }),
  progress: (p) => {
    const out: SmPayloads["progress"] = {};
    if (p.progress !== undefined) { if (p.progress !== null && typeof p.progress !== "number") bad("progress"); out.progress = p.progress as number | null; }
    if (p.step !== undefined) out.step = p.step === null ? null : str(p, "step", 120);
    return out;
  },
  checkpoint: (p) => { if (!isObj(p.data)) bad("data"); return { step: str(p, "step", 120), data: p.data as Record<string, unknown> }; },
  beginOp: (p) => ({ key: str(p, "key", 160), label: str(p, "label", 120), ...(optStr(p, "recordKey", 160) ? { recordKey: optStr(p, "recordKey", 160)! } : {}) }),
  endOp: (p) => {
    if (typeof p.ok !== "boolean") bad("ok");
    return { key: str(p, "key", 160), ok: p.ok as boolean, ...(optStr(p, "error", 300) ? { error: optStr(p, "error", 300)! } : {}), ...(optBool(p, "finalize") !== undefined ? { finalize: optBool(p, "finalize")! } : {}) };
  },
  reconcile: (p) => { if (p.outcome !== "done" && p.outcome !== "failed") bad("outcome"); return { key: str(p, "key", 160), outcome: p.outcome as "done" | "failed" }; },
};

/** Strict validation of an untrusted request (throws SmError INVALID_ARGUMENT). */
export function parseRequest(raw: unknown): SmAnyRequest {
  if (!isObj(raw) || raw.v !== 1) return bad("envelope");
  const op = raw.op;
  if (typeof op !== "string" || !(SM_OPS as readonly string[]).includes(op)) return bad("op");
  if (typeof raw.ts !== "number" || !Number.isFinite(raw.ts)) return bad("ts");
  const corr = raw.correlationId;
  if (corr !== undefined && (typeof corr !== "string" || corr.length > 80)) return bad("correlationId");
  const sessionId = raw.sessionId ?? null;
  if (sessionId !== null && (typeof sessionId !== "string" || !sessionId || sessionId.length > 80)) return bad("sessionId");
  if (NEEDS_ID.has(op as SmOp) && sessionId === null) return bad("sessionId");
  const payload = raw.payload === undefined ? {} : raw.payload;
  if (!isObj(payload)) return bad("payload");
  const validated = (VALIDATORS[op as SmOp] as (p: Record<string, unknown>) => unknown)(payload);
  return { v: 1, op, sessionId, ts: raw.ts, ...(corr ? { correlationId: corr } : {}), payload: validated } as SmAnyRequest;
}

export const failure = (e: unknown, correlationId?: string): SmResponse => ({
  ok: false,
  code: e instanceof SmError ? e.code : "UNAVAILABLE",
  message: e instanceof Error ? e.message : String(e),
  ...(correlationId ? { correlationId } : {}),
});
