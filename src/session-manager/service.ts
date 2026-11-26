/** Service-worker side: dispatches validated requests to the SessionManager and wires event-driven recovery. */
import { SessionManager } from "./manager";
import { failure, parseRequest, type SmAnyRequest, type SmResponse, type SmResults, type SmOp } from "./messages";
import { ChromeStorageAdapter } from "./storage";
import { SmError } from "./types";

let singleton: SessionManager | null = null;
/** Lazily built: nothing lives only in memory, so a restarted worker simply rebuilds this and reads storage. */
export const getManager = (): SessionManager => (singleton ??= new SessionManager({ storage: new ChromeStorageAdapter() }));

async function run(m: SessionManager, r: SmAnyRequest): Promise<SmResults[SmOp]> {
  const id = r.sessionId as string; // parseRequest guarantees it for every op that needs one
  const c = r.correlationId;
  switch (r.op) {
    case "create": return m.create(r.payload, c);
    case "adopt": return m.adopt(r.payload, c);
    case "start": return m.start(id, c);
    case "pause": return m.pause(id, r.payload.reason, c);
    case "resume": return m.resume(id, c);
    case "cancel": return m.cancel(id, r.payload.reason, c);
    case "complete": return m.complete(id, c);
    case "fail": return m.fail(id, r.payload.message, c);
    case "touch": await m.touch(id); return null;
    case "get": return m.get(id);
    case "list": { const l = await m.listDetailed(); return { sessions: l.sessions, quarantined: l.quarantined.length }; }
    case "progress": return m.updateProgress(id, r.payload, c);
    case "checkpoint": return m.saveCheckpoint(id, r.payload.step, r.payload.data, c);
    case "beginOp": return m.beginOperation(id, r.payload);
    case "endOp": return m.endOperation(id, r.payload.key, r.payload, c);
    case "reconcile": return m.reconcileOperation(id, r.payload.key, r.payload.outcome, c);
    case "pauseAll": return m.pauseAll();
    case "resumeAll": return m.resumeAll();
    case "cancelAll": return m.cancelAll();
    case "recover": return m.recover();
  }
}

/** Entry point used by the background `sm` handler (and the tests). Never throws: errors become `{ ok: false }`. */
export async function handleSmMessage(raw: unknown, manager: SessionManager = getManager()): Promise<SmResponse> {
  let req: SmAnyRequest | undefined;
  try {
    req = parseRequest(raw);
    return { ok: true, data: await run(manager, req), ...(req.correlationId ? { correlationId: req.correlationId } : {}) } as SmResponse;
  } catch (e) {
    if (!(e instanceof SmError)) console.warn("session-manager request failed:", e);
    return failure(e, req?.correlationId);
  }
}

export const SWEEP_ALARM = "dy-sm-sweep";

/**
 * Event-driven initialisation (all listeners registered synchronously at worker start, as MV3 requires):
 * recovery on worker start / browser start / install, plus a periodic sweep through chrome.alarms.
 */
export function installSessionManager(manager: () => SessionManager = getManager): void {
  const sweep = (why: string): void => { manager().recover().catch((e) => console.warn("session-manager recovery (" + why + ") failed:", e)); };
  sweep("worker-start");
  try {
    chrome.runtime.onStartup.addListener(() => sweep("browser-start"));
    chrome.runtime.onInstalled.addListener(() => sweep("installed"));
    if (chrome.alarms) {
      chrome.alarms.onAlarm.addListener((a) => { if (a.name === SWEEP_ALARM) sweep("alarm"); });
      void chrome.alarms.get(SWEEP_ALARM).then((a) => { if (!a) chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 15, delayInMinutes: 15 }); });
    }
  } catch (e) { console.warn("session-manager: could not register recovery hooks:", e); }
}
