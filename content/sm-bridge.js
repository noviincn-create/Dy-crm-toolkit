"use strict";
(() => {
  // src/session-manager/client.ts
  var SM_ATTR = "data-dy-sm";
  var SM_REQ_EVT = "dy-sm-req";
  var SM_RES_EVT = "dy-sm-res";
  var SM_CHG_EVT = "dy-sm-changed";

  // src/session-manager/storage.ts
  var P = "sm.v1.";
  var KEY = {
    meta: P + "meta",
    idx: P + "idx",
    hb: P + "hb",
    session: (id) => P + "s." + id,
    quarantine: (id) => P + "q." + id,
    prefix: P,
    sessionPrefix: P + "s."
  };

  // src/session-manager/bridge.ts
  var respond = (payload) => {
    document.dispatchEvent(new CustomEvent(SM_RES_EVT, { detail: JSON.stringify(payload) }));
  };
  document.documentElement.setAttribute(SM_ATTR, "1");
  document.addEventListener(SM_REQ_EVT, (e) => {
    let req = null;
    try {
      req = JSON.parse(String(e.detail));
    } catch {
      return;
    }
    if (!req || typeof req !== "object") return;
    const correlationId = typeof req.correlationId === "string" ? req.correlationId : void 0;
    try {
      chrome.runtime.sendMessage({ type: "sm", req }).then(
        (res) => respond(res && typeof res === "object" && !("error" in res) ? { ...res, correlationId } : { ok: false, code: "UNAVAILABLE", message: String(res?.error ?? "no response"), correlationId }),
        (err) => respond({ ok: false, code: "UNAVAILABLE", message: err instanceof Error ? err.message : String(err), correlationId })
      );
    } catch (err) {
      respond({ ok: false, code: "UNAVAILABLE", message: err instanceof Error ? err.message : String(err), correlationId });
    }
  });
  var timer;
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !Object.keys(changes).some((k) => k === KEY.idx || k.startsWith(KEY.sessionPrefix))) return;
      clearTimeout(timer);
      timer = setTimeout(() => document.dispatchEvent(new CustomEvent(SM_CHG_EVT)), 40);
    });
  } catch {
  }
})();
