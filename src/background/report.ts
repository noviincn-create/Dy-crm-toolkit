/**
 * Omnibox entry: type `nv`, press Tab / Space, then Enter (or `nv report`). Focuses a CRM tab and opens the dashboard
 * there; without a CRM tab a new one is opened on the CRM address with `?novinvn=report`.
 */
import { parseNovinvn, routeUrl } from "../shared/novinvn";
import { crmBase } from "./quick";

const CRM_TABS = "https://*.crm.systan.com/*";

export async function openReport(): Promise<void> {
  const tabs = (await chrome.tabs.query({ url: CRM_TABS })).filter((t) => t.id !== undefined);
  tabs.sort((a, b) => Number(b.active && b.highlighted) - Number(a.active && a.highlighted));

  for (const tab of tabs) {
    try {
      const res = (await chrome.tabs.sendMessage(tab.id!, { type: "reportOpen" }, { frameId: 0 })) as { ok?: boolean } | undefined;
      if (!res?.ok) continue;
      await chrome.tabs.update(tab.id!, { active: true });
      if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
      return;
    } catch { /* tab has no listener (still loading / old content script): try the next one */ }
  }
  await chrome.tabs.create({ url: routeUrl(await crmBase(), "report") });
}

const isReport = (text: string): boolean => {
  const t = text.trim().toLowerCase();
  return t === "" || t === "report" || parseNovinvn(t) === "report" || t === "گزارش";
};

export function installReportOmnibox(): void {
  chrome.omnibox.setDefaultSuggestion({ description: "گزارش فروش نوین (Enter)" });
  chrome.omnibox.onInputChanged.addListener((text, suggest) => {
    if (text.trim() === "" || "report".startsWith(text.trim().toLowerCase())) suggest([{ content: "report", description: "report — داشبورد فروش نوین" }]);
    else suggest([]);
  });
  chrome.omnibox.onInputEntered.addListener((text) => { if (isReport(text)) void openReport(); });
}
