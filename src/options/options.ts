/** Options page: KYC / Zohal / IPPanel secrets, field mappings and invoice print settings. */
import {
  CONTACT_NATIONAL_FIELD, DEFAULTS, FOOTER_STORAGE_KEY, INVOICE_DEFAULTS, INVOICE_STORAGE_KEY, mergeInvoiceConfig,
  mergeFooterConfig, mergeQuickConfig, QUICK_STORAGE_KEY, type QuickConfig, type QuickConfigInput, type FooterConfig, type FooterConfigInput, type InvoiceConfig, type InvoiceConfigInput, type InvoiceSeller, type KycSettings, type SecretSettings,
} from "../shared/config";

type TextSettingId = "token" | "contactNationalField" | "accountNationalField" | "titleField" | "titleMale" | "titleFemale" | "ippanelApiKey";
const IDS: TextSettingId[] = ["token", "contactNationalField", "accountNationalField", "titleField", "titleMale", "titleFemale", "ippanelApiKey"];
const FIELD_DEFAULT_IDS = ["contactNationalField", "accountNationalField", "titleField", "titleMale", "titleFemale"] as const;
type StoredSettings = KycSettings & SecretSettings;

const $ = <T extends HTMLElement = HTMLInputElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from options.html`);
  return el as T;
};
let statusTimer = 0;

$<HTMLElement>("ver").textContent = "نسخه " + chrome.runtime.getManifest().version;
$("contactNationalField").readOnly = true;

chrome.storage.local.get({ token: "", ippanelApiKey: "", ...DEFAULTS }).then(async (stored) => {
  const cfg = stored as StoredSettings;
  cfg.contactNationalField = CONTACT_NATIONAL_FIELD;
  await chrome.storage.local.set({ contactNationalField: CONTACT_NATIONAL_FIELD });
  IDS.forEach((id) => { $(id).value = cfg[id]; });
  $("autoSave").checked = !!cfg.autoSave;
});

const say = (text: string, ok = false): void => {
  const el = $<HTMLElement>("status");
  el.textContent = text;
  el.className = ok ? "ok" : "";
  clearTimeout(statusTimer);
  if (text) statusTimer = window.setTimeout(() => say(""), 2500);
};

// tabs
const tabs = [["tab-kyc", "p-kyc"], ["tab-close", "p-close"], ["tab-inv", "p-inv"], ["tab-quick", "p-quick"], ["tab-foot", "p-foot"]] as const;
tabs.forEach(([t, p]) => {
  $<HTMLElement>(t).onclick = () => tabs.forEach(([t2, p2]) => {
    $<HTMLElement>(t2).setAttribute("aria-selected", String(t2 === t));
    $<HTMLElement>(p2).hidden = p2 !== p;
  });
});

// show / hide secrets
document.querySelectorAll<HTMLElement>(".eye").forEach((b) => {
  b.onclick = () => {
    const i = $(b.dataset.for ?? "");
    i.type = i.type === "password" ? "text" : "password";
  };
});

async function save(): Promise<void> {
  const values = IDS.map((id): [TextSettingId, string] => [
    id,
    id === "contactNationalField" ? CONTACT_NATIONAL_FIELD : $(id).value.trim() || String((DEFAULTS as unknown as Record<string, unknown>)[id] ?? ""),
  ]);
  await chrome.storage.local.set({ ...Object.fromEntries(values), autoSave: $("autoSave").checked });
  await saveInvoice();
  await saveFooter();
  await saveQuick();
  values.forEach(([id, v]) => { $(id).value = v; });
  say("ذخیره شد ✓", true);
}

$<HTMLElement>("save").onclick = () => void save();
$<HTMLElement>("reset").onclick = () => {
  FIELD_DEFAULT_IDS.forEach((id) => { $(id).value = id === "contactNationalField" ? CONTACT_NATIONAL_FIELD : DEFAULTS[id]; });
  say("مقادیر پیش‌فرض جایگزین شد؛ برای اعمال ذخیره کنید.");
};
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
});

// ---- invoice print (read by invoice/bridge.ts; defaults shared with invoice/content.ts) ----
const INV_SELLER: Record<keyof InvoiceSeller, string> = {
  name: "inv-sname", guild: "inv-sguild", economicCode: "inv-seco", regNo: "inv-sreg", province: "inv-sprov", county: "inv-scounty", city: "inv-scity", postal: "inv-spostal", phone: "inv-sphone", address: "inv-saddr",
};
const sellerKeys = Object.keys(INV_SELLER) as Array<keyof InvoiceSeller>;

chrome.storage.local.get({ [INVOICE_STORAGE_KEY]: {} }).then((r) => {
  const c: InvoiceConfig = mergeInvoiceConfig(r[INVOICE_STORAGE_KEY] as InvoiceConfigInput);
  $("inv-ctrlp").checked = !!c.ctrlP;
  $("inv-buyer").checked = !!c.showBuyer;
  $("inv-title").value = c.title;
  $("inv-numfield").value = c.numberField;
  for (const k of sellerKeys) $(INV_SELLER[k]).value = c.seller[k];
});

async function saveInvoice(): Promise<void> {
  const seller = {} as InvoiceSeller;
  for (const k of sellerKeys) seller[k] = $(INV_SELLER[k]).value.trim();
  const cfg: InvoiceConfig = {
    ctrlP: $("inv-ctrlp").checked,
    showBuyer: $("inv-buyer").checked,
    title: $("inv-title").value.trim() || INVOICE_DEFAULTS.title,
    numberField: $("inv-numfield").value.trim() || INVOICE_DEFAULTS.numberField,
    seller,
  };
  await chrome.storage.local.set({ [INVOICE_STORAGE_KEY]: cfg });
}

// ---- print footer (read by footer/content.ts) ----
const FT_BOOL = { enabled: "ft-enabled", page: "ft-page", date: "ft-date", title: "ft-title", url: "ft-url", trimUrl: "ft-trim" } as const;
const ftKeys = Object.keys(FT_BOOL) as Array<keyof typeof FT_BOOL>;

chrome.storage.local.get({ [FOOTER_STORAGE_KEY]: {} }).then((r) => {
  const c = mergeFooterConfig(r[FOOTER_STORAGE_KEY] as FooterConfigInput);
  for (const k of ftKeys) $(FT_BOOL[k]).checked = !!c[k];
  $("ft-size").value = String(c.size);
});

async function saveFooter(): Promise<void> {
  const raw: FooterConfigInput = { size: Number($("ft-size").value.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))) };
  for (const k of ftKeys) raw[k] = $(FT_BOOL[k]).checked;
  const cfg: FooterConfig = mergeFooterConfig(raw);
  $("ft-size").value = String(cfg.size);
  await chrome.storage.local.set({ [FOOTER_STORAGE_KEY]: cfg });
}

// ---- quick session (read by quick/content.ts and background/quick.ts) ----
chrome.storage.local.get({ [QUICK_STORAGE_KEY]: {} }).then((r) => {
  const c = mergeQuickConfig(r[QUICK_STORAGE_KEY] as QuickConfigInput);
  $("q-enabled").checked = c.enabled;
  $<HTMLSelectElement>("q-start").value = c.startKey;
  $<HTMLSelectElement>("q-end").value = c.endKey;
  $("q-tap").value = String(c.tapMs);
  $("q-pl").value = c.mainPriceList;
  $("q-url").value = c.crmUrl;
  $("q-open").checked = c.openForm;
});

async function saveQuick(): Promise<void> {
  const cfg: QuickConfig = mergeQuickConfig({
    enabled: $("q-enabled").checked,
    startKey: $<HTMLSelectElement>("q-start").value as QuickConfig["startKey"],
    endKey: $<HTMLSelectElement>("q-end").value as QuickConfig["endKey"],
    tapMs: Number($("q-tap").value.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))),
    mainPriceList: $("q-pl").value,
    crmUrl: $("q-url").value,
    openForm: $("q-open").checked,
  });
  $<HTMLSelectElement>("q-start").value = cfg.startKey;
  $<HTMLSelectElement>("q-end").value = cfg.endKey; // one key cannot do both: the end key may have been switched off
  $("q-tap").value = String(cfg.tapMs);
  $("q-pl").value = cfg.mainPriceList;
  $("q-url").value = cfg.crmUrl;
  await chrome.storage.local.set({ [QUICK_STORAGE_KEY]: cfg });
}
