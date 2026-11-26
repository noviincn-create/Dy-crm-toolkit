"use strict";
(() => {
  // Relays KYC requests from the page-world script (content/kyc.js) to the extension service worker.
  // Only the whitelisted message types below are forwarded.
  var KYC_REQ_EVT = "dy-kyc-req";
  var KYC_RES_EVT = "dy-kyc-res";
  var ALLOWED = /* @__PURE__ */ new Set(["getConfig", "zohal", "otpSend", "otpVerify", "welcome"]);
  var respond = (payload) => {
    document.dispatchEvent(new CustomEvent(KYC_RES_EVT, { detail: JSON.stringify(payload) }));
  };
  document.addEventListener(KYC_REQ_EVT, (e) => {
    let req = null;
    try {
      req = JSON.parse(String(e.detail));
    } catch {
      return;
    }
    const id = req && typeof req.id === "string" ? req.id : "";
    const message = req && req.message;
    if (!id || !message || typeof message !== "object" || !ALLOWED.has(message.type)) {
      if (id) respond({ id, error: "درخواست نامعتبر است." });
      return;
    }
    try {
      chrome.runtime.sendMessage(message).then(
        (res) => respond(res && typeof res === "object" && typeof res.error === "string" ? { id, error: res.error } : { id, result: res }),
        (err) => respond({ id, error: String(err instanceof Error ? err.message : err).includes("Extension context invalidated") ? "زمینه اجرای افزونه نامعتبر شده است؛ صفحه Dynamics را کامل Refresh کنید." : err instanceof Error ? err.message : String(err) })
      );
    } catch (err) {
      respond({ id, error: err instanceof Error ? err.message : String(err) });
    }
  });
})();
