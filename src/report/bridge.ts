/** ISOLATED-world bridge: the service worker (omnibox) asks the page script (MAIN world) to open the dashboard. */
import { REPORT_OPEN_EVT, REPORT_READY_ATTR } from "./constants";

try {
  chrome.runtime.onMessage.addListener((msg: { type?: string } | undefined, _sender, reply: (r: { ok: boolean }) => void) => {
    if (msg?.type !== "reportOpen") return;
    const ready = document.documentElement.hasAttribute(REPORT_READY_ATTR);
    if (ready) document.dispatchEvent(new CustomEvent(REPORT_OPEN_EVT));
    reply({ ok: ready });
  });
} catch { /* extension reloaded */ }
