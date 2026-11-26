/**
 * Standalone sales dashboard page (public/report.html, an extension page: no Dynamics UI around it).
 * Data comes straight from the CRM Web API with the browser's CRM cookies (host permission), like the quick-session popup.
 */
import { crmBase } from "../shared/crm-url";
import { setApiTransport } from "../shared/odata";
import { errorMessage } from "../shared/text";
import { env } from "./env";
import { openReport } from "./view";

/** Closes this tab (window.close() is refused for tabs the user opened by a link). */
async function closeTab(): Promise<void> {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id !== undefined) { await chrome.tabs.remove(tab.id); return; }
  } catch { /* fall through */ }
  window.close();
}

async function main(): Promise<void> {
  document.title = "داشبورد فروش نوین";
  const url = await crmBase();
  env.crmUrl = url;
  env.managed = true;
  env.onClose = () => { void closeTab(); };
  setApiTransport({ base: () => url, credentials: "include" });
  openReport();
}

main().catch((e: unknown) => {
  document.body.textContent = `خطا در راه‌اندازی داشبورد: ${errorMessage(e)}`;
});
