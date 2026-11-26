/** The CRM address and quick-session settings, read from extension storage (service worker and extension pages). */
import { cleanCrmUrl, DEFAULT_CRM_URL, mergeQuickConfig, QUICK_STORAGE_KEY, QUICK_URL_KEY, type QuickConfig } from "./config";

export const loadQuickConfig = async (): Promise<QuickConfig> => {
  const r = await chrome.storage.local.get({ [QUICK_STORAGE_KEY]: {} });
  return mergeQuickConfig(r[QUICK_STORAGE_KEY] as Partial<QuickConfig>);
};

/** The CRM address: the settings value, else the address learned from a CRM tab, else the default. */
export async function crmBase(): Promise<string> {
  const cfg = await loadQuickConfig();
  const learned = (await chrome.storage.local.get({ [QUICK_URL_KEY]: "" }))[QUICK_URL_KEY];
  return cfg.crmUrl || cleanCrmUrl(learned) || DEFAULT_CRM_URL;
}
