/** Constants and settings shared by the content script, the background worker and the options page. */

export const ZOHAL_URL = "https://service.zohal.io/api/v0/services/inquiry";
export const IPPANEL_URL = "https://edge.ippanel.com/v1/api/send";
export const OTP_LENGTH = 6;
export const OTP_PARAM_NAME = "otp";
export const OTP_PATTERN = "75cpgflgz2q9rxt"; // fixed: only param is "otp"
export const SENDER_NUMBER = "+983000505";
export const WELCOME_PATTERN = "4vegiqdx6umlmn2";

// Confirmed Contact fields: these mappings are fixed to the tested CRM schema.
export const CONTACT_NATIONAL_FIELD = "systan_nationalcode"; // text, 10 digits
export const CONTACT_BIRTHDATE_FIELD = "systan_birthdatefa"; // text, Jalali "1377/06/30", maxlength 10
export const CONTACT_FATHERNAME_FIELD = "systan_fathername";

/** Settings that can be adjusted from the options page (stored in chrome.storage.local). */
export interface KycSettings {
  contactNationalField: string;
  accountNationalField: string;
  titleField: string;
  titleMale: string;
  titleFemale: string;
  autoSave: boolean;
}

export const DEFAULTS: KycSettings = {
  contactNationalField: CONTACT_NATIONAL_FIELD, // fixed Contact National ID field
  accountNationalField: "systan_nationalidbase", // account: company national ID
  titleField: "systan_titlebase", // contact Title (option set <select>)
  titleMale: "728940000", // Zohal gender 1 = Male (option value)
  titleFemale: "728940001", // Zohal gender 0 = Female (option value)
  autoSave: true, // click Save and Close after the form is filled
};

/** Secrets: only ever read inside the background worker (and edited on the options page). */
export interface SecretSettings {
  token: string;
  ippanelApiKey: string;
}

// ───────────── Invoice print settings ─────────────
export interface InvoiceSeller {
  name: string;
  /** شمارهٔ صنفی; printed under «شماره ثبت / شماره ملی» when `regNo` is empty. */
  guild: string;
  /** شمارهٔ اقتصادی. */
  economicCode: string;
  /** شماره ثبت / شماره ملی (empty = `guild`). */
  regNo: string;
  province: string;
  /** شهرستان (empty = `city`). */
  county: string;
  city: string;
  postal: string;
  phone: string;
  address: string;
}

export interface InvoiceConfig {
  /** Any print on an opportunity form prints the invoice. */
  ctrlP: boolean;
  showBuyer: boolean;
  numberField: string;
  title: string;
  seller: InvoiceSeller;
}

export type InvoiceConfigInput = Partial<Omit<InvoiceConfig, "seller">> & { seller?: Partial<InvoiceSeller> };

export const INVOICE_DEFAULTS: InvoiceConfig = {
  ctrlP: true,
  showBuyer: true,
  numberField: "new_opportunitynumbertext",
  title: "صورت‌حساب فروش کالا و خدمات",
  seller: {
    name: "کافی نت نوین",
    guild: "1404352002",
    economicCode: "",
    regNo: "",
    province: "خراسان رضوی",
    county: "",
    city: "مشهد",
    postal: "9189936636",
    phone: "09040201536",
    address: "قاسم‌آباد، بلوار امامیه ۳۳، کافی نت نوین",
  },
};

export const mergeInvoiceConfig = (raw: InvoiceConfigInput | null | undefined): InvoiceConfig => ({
  ...INVOICE_DEFAULTS,
  ...raw,
  seller: { ...INVOICE_DEFAULTS.seller, ...(raw?.seller ?? {}) },
});

/** chrome.storage.local key + DOM attribute used by the isolated-world bridge to hand settings to the MAIN world. */
export const INVOICE_STORAGE_KEY = "invoiceCfg";
export const INVOICE_ATTR = "data-dy-invoice";

export interface InvoiceBridgePayload {
  cfg: InvoiceConfigInput;
  font: string;
}

// ───────────── Print footer (پاورقی چاپی) ─────────────
export interface FooterConfig {
  enabled: boolean;
  /** "صفحه ۱ از ۳" (bottom, right). */
  page: boolean;
  /** Persian date + Tehran time of the print (bottom, left). */
  date: boolean;
  /** Page title (bottom, centre). */
  title: boolean;
  /** Page address (bottom, centre, second line). */
  url: boolean;
  /** Keep only the identifying parameters (etn, id, pagetype, appid) of the address. */
  trimUrl: boolean;
  /** Font size in pt. */
  size: number;
}

export type FooterConfigInput = Partial<FooterConfig>;

export const FOOTER_DEFAULTS: FooterConfig = { enabled: true, page: true, date: true, title: true, url: true, trimUrl: true, size: 8 };

export const mergeFooterConfig = (raw: FooterConfigInput | null | undefined): FooterConfig => {
  const c = { ...FOOTER_DEFAULTS, ...raw };
  const size = Number(c.size);
  c.size = Number.isFinite(size) ? Math.min(14, Math.max(6, size)) : FOOTER_DEFAULTS.size;
  return c;
};

export const FOOTER_STORAGE_KEY = "footerCfg";

// ───────────── Quick session (double-tap Shift / Ctrl on any website) ─────────────
export type QuickKey = "Shift" | "Control" | "Alt" | "off";

export interface QuickConfig {
  /** Master switch for the keyboard shortcuts (the CRM panel's popup buttons keep working). */
  enabled: boolean;
  /** Double-tap this key anywhere → "start session" popup. */
  startKey: QuickKey;
  /** Double-tap this key anywhere → "end session" popup. */
  endKey: QuickKey;
  /** Max milliseconds between the two taps. */
  tapMs: number;
  /** Open the new opportunity in a new tab after the session starts. */
  openForm: boolean;
  /** Name (or part of the name) of the price list that is preselected. */
  mainPriceList: string;
  /** CRM address; empty = learn it from an open CRM tab, then fall back to the default. */
  crmUrl: string;
}

export type QuickConfigInput = Partial<QuickConfig>;

export const DEFAULT_CRM_URL = "https://novincn.crm.systan.com";
export const QUICK_DEFAULTS: QuickConfig = {
  enabled: true, startKey: "Shift", endKey: "Control", tapMs: 400, openForm: false, mainPriceList: "قیمت اصلی", crmUrl: "",
};

const QUICK_KEYS: readonly string[] = ["Shift", "Control", "Alt", "off"];

/** Only an https CRM address (`*.crm.systan.com`, optional organisation path) is accepted; the result has no trailing slash. "" = invalid. */
export function cleanCrmUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || !/(^|\.)crm\.systan\.com$/i.test(u.hostname) || u.username || u.password) return "";
    return (u.origin + u.pathname.replace(/\/+$/, "")).slice(0, 300);
  } catch {
    return "";
  }
}

export const mergeQuickConfig = (raw: QuickConfigInput | null | undefined): QuickConfig => {
  const c = { ...QUICK_DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
  if (!QUICK_KEYS.includes(c.startKey)) c.startKey = QUICK_DEFAULTS.startKey;
  if (!QUICK_KEYS.includes(c.endKey)) c.endKey = QUICK_DEFAULTS.endKey;
  if (c.startKey !== "off" && c.startKey === c.endKey) c.endKey = "off"; // one key cannot do both
  const ms = Number(c.tapMs);
  c.tapMs = Number.isFinite(ms) ? Math.min(800, Math.max(200, Math.round(ms))) : QUICK_DEFAULTS.tapMs;
  c.enabled = c.enabled !== false;
  c.openForm = c.openForm === true;
  c.mainPriceList = typeof c.mainPriceList === "string" && c.mainPriceList.trim() ? c.mainPriceList.trim() : QUICK_DEFAULTS.mainPriceList;
  c.crmUrl = cleanCrmUrl(c.crmUrl);
  return c;
};

export const QUICK_STORAGE_KEY = "quickCfg";
/** CRM address learned from an open CRM tab (chrome.storage.local). */
export const QUICK_URL_KEY = "quickCrmUrl";
/** Set on <html> by the quick content script (any site) so the CRM panel can show its own popup buttons. */
export const QUICK_ATTR = "data-dy-quick";
/** Set on <html> by the CRM page (MAIN world) with the CRM address; read by the quick content script. */
export const QUICK_CRM_ATTR = "data-dy-crm";
/** DOM event (detail "start" | "end") the CRM panel dispatches to open the popup. */
export const QUICK_OPEN_EVT = "dy-quick-open";
