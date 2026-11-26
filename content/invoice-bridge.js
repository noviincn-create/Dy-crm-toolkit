"use strict";
(() => {
  // src/shared/config.ts
  var INVOICE_STORAGE_KEY = "invoiceCfg";
  var INVOICE_ATTR = "data-dy-invoice";

  // src/invoice/bridge.ts
  var push = (cfg) => {
    try {
      const payload = { cfg: cfg || {}, font: chrome.runtime.getURL("invoice/Vazirmatn.woff2") };
      document.documentElement.setAttribute(INVOICE_ATTR, JSON.stringify(payload));
    } catch {
    }
  };
  chrome.storage.local.get({ [INVOICE_STORAGE_KEY]: {} }).then(
    (r) => push(r[INVOICE_STORAGE_KEY]),
    () => push({})
  );
  chrome.storage.onChanged.addListener((changes, area) => {
    const change = changes[INVOICE_STORAGE_KEY];
    if (area === "local" && change) push(change.newValue);
  });
})();
