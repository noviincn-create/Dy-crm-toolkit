/**
 * Quick session content script (ISOLATED world, every website, all frames).
 * Double-tap Shift  → popup "start session"    (title + price list + products)
 * Double-tap Ctrl   → popup "end session"      (pick a running session)
 * The keys are configurable in the options page. Frames inside a page forward the trigger to the top frame of their tab.
 * The popup talks to the service worker, which calls the CRM with the browser's CRM cookies, so it works on any tab.
 */
import {
  mergeQuickConfig, QUICK_ATTR, QUICK_CRM_ATTR, QUICK_OPEN_EVT, QUICK_STORAGE_KEY, type QuickConfig,
} from "../shared/config";
import type { BgRequest } from "../shared/messages";
import { openEndDialog, openStartDialog } from "./dialogs";
import { isDialogOpen } from "./host";
import { installTapDetector } from "./tap";

type Which = "start" | "end";

if (!(globalThis as { __dyQuick?: boolean }).__dyQuick) {
  (globalThis as { __dyQuick?: boolean }).__dyQuick = true;
  const isTop = window.top === window;
  let cfg: QuickConfig = mergeQuickConfig(null);

  const reload = async (): Promise<void> => {
    try { cfg = mergeQuickConfig((await chrome.storage.local.get({ [QUICK_STORAGE_KEY]: {} }))[QUICK_STORAGE_KEY] as Partial<QuickConfig>); } catch { /* extension reloaded */ }
  };
  void reload();
  try {
    chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && QUICK_STORAGE_KEY in changes) void reload(); });
  } catch { /* extension reloaded */ }

  const open = (which: Which): void => { if (which === "end") openEndDialog(); else openStartDialog(cfg); };

  installTapDetector({
    tapMs: () => cfg.tapMs,
    keys: () => ({ start: cfg.startKey, end: cfg.endKey, enabled: cfg.enabled }),
    blocked: isDialogOpen,
    onTap(which) {
      if (isTop) { open(which); return; }
      try { void chrome.runtime.sendMessage({ type: "quickTrigger", which } satisfies BgRequest).catch(() => undefined); } catch { /* extension reloaded */ }
    },
  });

  if (isTop) {
    document.documentElement.setAttribute(QUICK_ATTR, "1"); // lets the CRM panel show its own "popup" button
    try {
      chrome.runtime.onMessage.addListener((m: { type?: string; which?: string } | undefined) => {
        if (m?.type === "quickOpen" && (m.which === "start" || m.which === "end")) open(m.which);
      });
    } catch { /* extension reloaded */ }
    // the CRM panel (page world) asks for the popup with a DOM event
    document.addEventListener(QUICK_OPEN_EVT, (e) => {
      const w = String((e as CustomEvent).detail);
      if (w === "start" || w === "end") open(w);
    });
    // on a CRM page: remember the CRM address (published by the page-world script) for use from other tabs
    if (/(^|\.)crm\.systan\.com$/i.test(location.hostname)) {
      const t = setInterval(() => {
        const url = document.documentElement.getAttribute(QUICK_CRM_ATTR);
        if (!url) return;
        clearInterval(t);
        try { void chrome.runtime.sendMessage({ type: "quick", req: { op: "setUrl", url } } satisfies BgRequest).catch(() => undefined); } catch { /* extension reloaded */ }
      }, 2500);
    }
  }
}
