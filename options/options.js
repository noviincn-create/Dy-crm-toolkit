"use strict";
(() => {
  // src/shared/config.ts
  var CONTACT_NATIONAL_FIELD = "systan_nationalcode";
  var DEFAULTS = {
    contactNationalField: CONTACT_NATIONAL_FIELD,
    // fixed Contact National ID field
    accountNationalField: "systan_nationalidbase",
    // account: company national ID
    titleField: "systan_titlebase",
    // contact Title (option set <select>)
    titleMale: "728940000",
    // Zohal gender 1 = Male (option value)
    titleFemale: "728940001",
    // Zohal gender 0 = Female (option value)
    autoSave: true
    // click Save and Close after the form is filled
  };
  var INVOICE_DEFAULTS = {
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
      address: "قاسم‌آباد، بلوار امامیه ۳۳، کافی نت نوین"
    }
  };
  var mergeInvoiceConfig = (raw) => ({
    ...INVOICE_DEFAULTS,
    ...raw,
    seller: { ...INVOICE_DEFAULTS.seller, ...raw?.seller ?? {} }
  });
  var INVOICE_STORAGE_KEY = "invoiceCfg";
  var FOOTER_DEFAULTS = { enabled: true, page: true, date: true, title: true, url: true, trimUrl: true, size: 8, stamp: true, stampW: 40 };
  var mergeFooterConfig = (raw) => {
    const c = { ...FOOTER_DEFAULTS, ...raw };
    const size = Number(c.size);
    c.size = Number.isFinite(size) ? Math.min(14, Math.max(6, size)) : FOOTER_DEFAULTS.size;
    const sw = Number(c.stampW);
    c.stampW = Number.isFinite(sw) ? Math.min(80, Math.max(25, Math.round(sw))) : FOOTER_DEFAULTS.stampW;
    c.stamp = c.stamp !== false;
    return c;
  };
  var FOOTER_STORAGE_KEY = "footerCfg";
  var QUICK_DEFAULTS = {
    enabled: true,
    startKey: "Shift",
    endKey: "Control",
    tapMs: 400,
    openForm: false,
    mainPriceList: "قیمت اصلی",
    crmUrl: ""
  };
  var QUICK_KEYS = ["Shift", "Control", "Alt", "off"];
  function cleanCrmUrl(raw) {
    if (typeof raw !== "string") return "";
    try {
      const u = new URL(raw.trim());
      if (u.protocol !== "https:" || !/(^|\.)crm\.systan\.com$/i.test(u.hostname) || u.username || u.password) return "";
      return (u.origin + u.pathname.replace(/\/+$/, "")).slice(0, 300);
    } catch {
      return "";
    }
  }
  var mergeQuickConfig = (raw) => {
    const c = { ...QUICK_DEFAULTS, ...raw && typeof raw === "object" ? raw : {} };
    if (!QUICK_KEYS.includes(c.startKey)) c.startKey = QUICK_DEFAULTS.startKey;
    if (!QUICK_KEYS.includes(c.endKey)) c.endKey = QUICK_DEFAULTS.endKey;
    if (c.startKey !== "off" && c.startKey === c.endKey) c.endKey = "off";
    const ms = Number(c.tapMs);
    c.tapMs = Number.isFinite(ms) ? Math.min(800, Math.max(200, Math.round(ms))) : QUICK_DEFAULTS.tapMs;
    c.enabled = c.enabled !== false;
    c.openForm = c.openForm === true;
    c.mainPriceList = typeof c.mainPriceList === "string" && c.mainPriceList.trim() ? c.mainPriceList.trim() : QUICK_DEFAULTS.mainPriceList;
    c.crmUrl = cleanCrmUrl(c.crmUrl);
    return c;
  };
  var QUICK_STORAGE_KEY = "quickCfg";
  var PORTAL_DEFAULTS = { enabled: true, allowSignup: true, welcomeSms: true, sessionMinutes: 20, notesMode: "marked", currencyLabel: "ریال" };
  var mergePortalConfig = (raw) => {
    const c = { ...PORTAL_DEFAULTS, ...raw && typeof raw === "object" ? raw : {} };
    const m = Number(c.sessionMinutes);
    c.sessionMinutes = Number.isFinite(m) ? Math.min(120, Math.max(2, Math.round(m))) : PORTAL_DEFAULTS.sessionMinutes;
    c.enabled = c.enabled !== false;
    c.allowSignup = c.allowSignup !== false;
    c.welcomeSms = c.welcomeSms !== false;
    c.notesMode = c.notesMode === "all" ? "all" : "marked";
    c.currencyLabel = typeof c.currencyLabel === "string" ? c.currencyLabel.trim().slice(0, 12) : PORTAL_DEFAULTS.currencyLabel;
    return c;
  };
  var PORTAL_STORAGE_KEY = "portalCfg";

  // src/options/options.ts
  var IDS = ["token", "contactNationalField", "accountNationalField", "titleField", "titleMale", "titleFemale", "ippanelApiKey"];
  var FIELD_DEFAULT_IDS = ["contactNationalField", "accountNationalField", "titleField", "titleMale", "titleFemale"];
  var $ = (id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`#${id} is missing from options.html`);
    return el;
  };
  var statusTimer = 0;
  $("ver").textContent = "نسخه " + chrome.runtime.getManifest().version;
  $("contactNationalField").readOnly = true;
  chrome.storage.local.get({ token: "", ippanelApiKey: "", ...DEFAULTS }).then(async (stored) => {
    const cfg = stored;
    cfg.contactNationalField = CONTACT_NATIONAL_FIELD;
    await chrome.storage.local.set({ contactNationalField: CONTACT_NATIONAL_FIELD });
    IDS.forEach((id) => {
      $(id).value = cfg[id];
    });
  });
  var say = (text, ok = false) => {
    const el = $("status");
    el.textContent = text;
    el.className = ok ? "ok" : "";
    clearTimeout(statusTimer);
    if (text) statusTimer = window.setTimeout(() => say(""), 2500);
  };
  var tabs = [["tab-kyc", "p-kyc"], ["tab-close", "p-close"], ["tab-inv", "p-inv"], ["tab-quick", "p-quick"], ["tab-foot", "p-foot"], ["tab-portal", "p-portal"]];
  tabs.forEach(([t, p]) => {
    $(t).onclick = () => tabs.forEach(([t2, p2]) => {
      $(t2).setAttribute("aria-selected", String(t2 === t));
      $(p2).hidden = p2 !== p;
    });
  });
  document.querySelectorAll(".eye").forEach((b) => {
    b.onclick = () => {
      const i = $(b.dataset.for ?? "");
      i.type = i.type === "password" ? "text" : "password";
    };
  });
  async function save() {
    const values = IDS.map((id) => [
      id,
      id === "contactNationalField" ? CONTACT_NATIONAL_FIELD : $(id).value.trim() || String(DEFAULTS[id] ?? "")
    ]);
    await chrome.storage.local.set(Object.fromEntries(values));
    await saveInvoice();
    await saveFooter();
    await saveQuick();
    await savePortal();
    values.forEach(([id, v]) => {
      $(id).value = v;
    });
    say("ذخیره شد ✓", true);
  }
  $("save").onclick = () => void save();
  $("reset").onclick = () => {
    FIELD_DEFAULT_IDS.forEach((id) => {
      $(id).value = id === "contactNationalField" ? CONTACT_NATIONAL_FIELD : DEFAULTS[id];
    });
    say("مقادیر پیش‌فرض جایگزین شد؛ برای اعمال ذخیره کنید.");
  };
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void save();
    }
  });
  var INV_SELLER = {
    name: "inv-sname",
    guild: "inv-sguild",
    economicCode: "inv-seco",
    regNo: "inv-sreg",
    province: "inv-sprov",
    county: "inv-scounty",
    city: "inv-scity",
    postal: "inv-spostal",
    phone: "inv-sphone",
    address: "inv-saddr"
  };
  var sellerKeys = Object.keys(INV_SELLER);
  chrome.storage.local.get({ [INVOICE_STORAGE_KEY]: {} }).then((r) => {
    const c = mergeInvoiceConfig(r[INVOICE_STORAGE_KEY]);
    $("inv-ctrlp").checked = !!c.ctrlP;
    $("inv-buyer").checked = !!c.showBuyer;
    $("inv-title").value = c.title;
    $("inv-numfield").value = c.numberField;
    for (const k of sellerKeys) $(INV_SELLER[k]).value = c.seller[k];
  });
  async function saveInvoice() {
    const seller = {};
    for (const k of sellerKeys) seller[k] = $(INV_SELLER[k]).value.trim();
    const cfg = {
      ctrlP: $("inv-ctrlp").checked,
      showBuyer: $("inv-buyer").checked,
      title: $("inv-title").value.trim() || INVOICE_DEFAULTS.title,
      numberField: $("inv-numfield").value.trim() || INVOICE_DEFAULTS.numberField,
      seller
    };
    await chrome.storage.local.set({ [INVOICE_STORAGE_KEY]: cfg });
  }
  var FT_BOOL = { enabled: "ft-enabled", page: "ft-page", date: "ft-date", title: "ft-title", url: "ft-url", trimUrl: "ft-trim", stamp: "ft-stamp" };
  var ftKeys = Object.keys(FT_BOOL);
  chrome.storage.local.get({ [FOOTER_STORAGE_KEY]: {} }).then((r) => {
    const c = mergeFooterConfig(r[FOOTER_STORAGE_KEY]);
    for (const k of ftKeys) $(FT_BOOL[k]).checked = !!c[k];
    $("ft-size").value = String(c.size);
    $("ft-stampw").value = String(c.stampW);
  });
  async function saveFooter() {
    const raw = { size: Number($("ft-size").value.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))), stampW: Number($("ft-stampw").value.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))) };
    for (const k of ftKeys) raw[k] = $(FT_BOOL[k]).checked;
    const cfg = mergeFooterConfig(raw);
    $("ft-size").value = String(cfg.size);
    $("ft-stampw").value = String(cfg.stampW);
    await chrome.storage.local.set({ [FOOTER_STORAGE_KEY]: cfg });
  }
  chrome.storage.local.get({ [QUICK_STORAGE_KEY]: {} }).then((r) => {
    const c = mergeQuickConfig(r[QUICK_STORAGE_KEY]);
    $("q-enabled").checked = c.enabled;
    $("q-start").value = c.startKey;
    $("q-end").value = c.endKey;
    $("q-tap").value = String(c.tapMs);
    $("q-pl").value = c.mainPriceList;
    $("q-url").value = c.crmUrl;
    $("q-open").checked = c.openForm;
  });
  async function saveQuick() {
    const cfg = mergeQuickConfig({
      enabled: $("q-enabled").checked,
      startKey: $("q-start").value,
      endKey: $("q-end").value,
      tapMs: Number($("q-tap").value.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))),
      mainPriceList: $("q-pl").value,
      crmUrl: $("q-url").value,
      openForm: $("q-open").checked
    });
    $("q-start").value = cfg.startKey;
    $("q-end").value = cfg.endKey;
    $("q-tap").value = String(cfg.tapMs);
    $("q-pl").value = cfg.mainPriceList;
    $("q-url").value = cfg.crmUrl;
    await chrome.storage.local.set({ [QUICK_STORAGE_KEY]: cfg });
  }
  chrome.storage.local.get({ [PORTAL_STORAGE_KEY]: {} }).then((r) => {
    const c = mergePortalConfig(r[PORTAL_STORAGE_KEY]);
    $("pt-enabled").checked = c.enabled;
    $("pt-signup").checked = c.allowSignup;
    $("pt-welcome").checked = c.welcomeSms;
    $("pt-min").value = String(c.sessionMinutes);
    $("pt-cur").value = c.currencyLabel;
    $("pt-notes").value = c.notesMode;
  });
  async function savePortal() {
    const cfg = mergePortalConfig({
      enabled: $("pt-enabled").checked,
      allowSignup: $("pt-signup").checked,
      welcomeSms: $("pt-welcome").checked,
      sessionMinutes: Number($("pt-min").value.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))),
      notesMode: $("pt-notes").value,
      currencyLabel: $("pt-cur").value
    });
    $("pt-min").value = String(cfg.sessionMinutes);
    await chrome.storage.local.set({ [PORTAL_STORAGE_KEY]: cfg });
  }
  $("portal-open").onclick = () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("portal.html") });
  };
})();
