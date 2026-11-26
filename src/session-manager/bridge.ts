/**
 * ISOLATED-world bridge: relays Session Manager requests from the page (MAIN world, no chrome.* APIs) to the service worker
 * and tells the page when stored sessions changed (any tab). Carries no logic and no secrets; the service worker validates
 * every request strictly.
 */
import { SM_ATTR, SM_CHG_EVT, SM_REQ_EVT, SM_RES_EVT } from "./client";
import { KEY } from "./storage";

const respond = (payload: unknown): void => { document.dispatchEvent(new CustomEvent(SM_RES_EVT, { detail: JSON.stringify(payload) })); };

document.documentElement.setAttribute(SM_ATTR, "1");

document.addEventListener(SM_REQ_EVT, (e) => {
  let req: { correlationId?: unknown } | null = null;
  try { req = JSON.parse(String((e as CustomEvent).detail)) as { correlationId?: unknown }; } catch { return; }
  if (!req || typeof req !== "object") return;
  const correlationId = typeof req.correlationId === "string" ? req.correlationId : undefined;
  try {
    chrome.runtime.sendMessage({ type: "sm", req }).then(
      (res: unknown) => respond(res && typeof res === "object" && !("error" in (res as object)) ? { ...(res as object), correlationId } : { ok: false, code: "UNAVAILABLE", message: String((res as { error?: string } | undefined)?.error ?? "no response"), correlationId }),
      (err: unknown) => respond({ ok: false, code: "UNAVAILABLE", message: err instanceof Error ? err.message : String(err), correlationId }),
    );
  } catch (err) { // extension context invalidated (reload/update)
    respond({ ok: false, code: "UNAVAILABLE", message: err instanceof Error ? err.message : String(err), correlationId });
  }
});

let timer: ReturnType<typeof setTimeout> | undefined;
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !Object.keys(changes).some((k) => k === KEY.idx || k.startsWith(KEY.sessionPrefix))) return;
    clearTimeout(timer);
    timer = setTimeout(() => document.dispatchEvent(new CustomEvent(SM_CHG_EVT)), 40);
  });
} catch { /* extension reloaded */ }
