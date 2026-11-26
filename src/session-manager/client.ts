/**
 * Page-world (MAIN) client. The MAIN world has no chrome.* APIs, so requests travel over DOM CustomEvents (JSON strings)
 * to the isolated-world bridge, which forwards them to the service worker. If the bridge is absent the client reports
 * itself unavailable and callers keep their legacy behaviour.
 */
import type { SmOp, SmPayloads, SmRequest, SmResponse, SmResults } from "./messages";
import { SmError } from "./types";

export const SM_ATTR = "data-dy-sm";
export const SM_REQ_EVT = "dy-sm-req";
export const SM_RES_EVT = "dy-sm-res";
export const SM_CHG_EVT = "dy-sm-changed";

export const smAvailable = (): boolean => typeof document !== "undefined" && document.documentElement.hasAttribute(SM_ATTR);

let seq = 0;
const newCorrelationId = (): string => `c${Date.now().toString(36)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function smCall<K extends SmOp>(op: K, sessionId: string | null, payload: SmPayloads[K], timeoutMs = 5000): Promise<SmResults[K]> {
  if (!smAvailable()) return Promise.reject(new SmError("UNAVAILABLE", "مدیر جلسه در دسترس نیست."));
  const correlationId = newCorrelationId();
  const req: SmRequest<K> = { v: 1, op, sessionId, ts: Date.now(), correlationId, payload };
  return new Promise<SmResults[K]>((resolve, reject) => {
    const done = (fn: () => void): void => { clearTimeout(timer); document.removeEventListener(SM_RES_EVT, onRes); fn(); };
    const onRes = (e: Event): void => {
      let res: SmResponse<K> | undefined;
      try { res = JSON.parse(String((e as CustomEvent).detail)) as SmResponse<K>; } catch { return; }
      if (!res || res.correlationId !== correlationId) return;
      done(() => (res!.ok ? resolve(res!.data) : reject(new SmError(res!.code, res!.message))));
    };
    const timer = setTimeout(() => done(() => reject(new SmError("UNAVAILABLE", "مدیر جلسه پاسخ نمی‌دهد."))), timeoutMs);
    document.addEventListener(SM_RES_EVT, onRes);
    document.dispatchEvent(new CustomEvent(SM_REQ_EVT, { detail: JSON.stringify(req) }));
  });
}

/** Fires when any session changed (in any tab). */
export function smOnChange(fn: () => void): () => void {
  document.addEventListener(SM_CHG_EVT, fn);
  return () => document.removeEventListener(SM_CHG_EVT, fn);
}
