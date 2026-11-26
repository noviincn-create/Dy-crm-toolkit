/**
 * Isolated-world bridge: hands the invoice settings (chrome.storage) and the font URL to the page-world script
 * through a DOM attribute, because the MAIN world cannot use chrome.* APIs.
 */
import { INVOICE_ATTR, INVOICE_STORAGE_KEY, type InvoiceBridgePayload, type InvoiceConfigInput } from "../shared/config";

const push = (cfg: InvoiceConfigInput | undefined): void => {
  try {
    const payload: InvoiceBridgePayload = { cfg: cfg || {}, font: chrome.runtime.getURL("invoice/Vazirmatn.woff2") };
    document.documentElement.setAttribute(INVOICE_ATTR, JSON.stringify(payload));
  } catch { /* extension reloaded: ignore */ }
};

chrome.storage.local.get({ [INVOICE_STORAGE_KEY]: {} }).then(
  (r) => push(r[INVOICE_STORAGE_KEY] as InvoiceConfigInput),
  () => push({}),
);
chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[INVOICE_STORAGE_KEY];
  if (area === "local" && change) push(change.newValue as InvoiceConfigInput | undefined);
});
