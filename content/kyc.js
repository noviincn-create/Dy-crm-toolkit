"use strict";
(() => {
  if (window.__kycLoaded) return;
  window.__kycLoaded = true;
  // KYC runs in the page (MAIN) world and talks to Dynamics ONLY through the Xrm API
  // (Xrm.WebApi / Xrm.Navigation). It never reads, scans or clicks the CRM page DOM.
  // The extension worker (Zohal / IPPanel) is reached through content/kyc-bridge.js via CustomEvents.

  // src/shared/config.ts
  var OTP_LENGTH = 6;
  var CONTACT_NATIONAL_FIELD = "systan_nationalcode";
  var CONTACT_BIRTHDATE_FIELD = "systan_birthdatefa";
  var CONTACT_FATHERNAME_FIELD = "systan_fathername";
  var FORM_NATIONAL_FIELD = "systan_nationalidbase";
  var FORM_FATHER_FIELD = "systan_fathersname";
  var FORM_BIRTHDATE_FIELD = "birthdate";
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

  // src/shared/text.ts
  var toLatinDigits = (s) => String(s ?? "").replace(/[۰-۹٠-٩]/g, (d) => String(d.charCodeAt(0) & 15));
  var pad = (n, width = 2) => String(n).padStart(width, "0");
  var errorMessage = (e) => e instanceof Error ? e.message : e && typeof e === "object" && "message" in e ? String(e.message) : String(e);

  // src/kyc/helpers.ts
  var digits = (s) => toLatinDigits(s).replace(/\D/g, "");
  var clean = (v) => {
    if (typeof v !== "string") return v;
    const t = v.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " ").trim();
    return t === "" || t.toLowerCase() === "null" ? void 0 : t;
  };
  var compact = (o) => {
    const out = {};
    for (const [k, raw] of Object.entries(o)) {
      const v = clean(raw);
      if (v != null && v !== "") out[k] = String(v);
    }
    return out;
  };
  function validNationalCode(c) {
    if (!/^\d{10}$/.test(c) || /^(\d)\1{9}$/.test(c)) return false;
    const r = [...c].slice(0, 9).reduce((s, d, i) => s + Number(d) * (10 - i), 0) % 11;
    return Number(c[9]) === (r < 2 ? r : 11 - r);
  }
  function parseMobile(raw) {
    let d = digits(raw);
    if (d.startsWith("0098")) d = d.slice(4);
    else if (d.length === 12 && d.startsWith("98")) d = d.slice(2);
    if (d.startsWith("0")) d = d.slice(1);
    return /^9\d{9}$/.test(d) ? d : null;
  }
  var oq = (v) => v.replace(/'/g, "''");
  var arabic = (v) => v.replace(/ی/g, "ي").replace(/ک/g, "ك");


  // ───────────── extension bridge (page world ⇄ content script ⇄ service worker) ─────────────
  var KYC_REQ_EVT = "dy-kyc-req";
  var KYC_RES_EVT = "dy-kyc-res";
  var kycCalls = new Map();
  var kycSeq = 0;
  document.addEventListener(KYC_RES_EVT, (e) => {
    let r = null;
    try {
      r = JSON.parse(String(e.detail));
    } catch {
      return;
    }
    const call = r && kycCalls.get(r.id);
    if (!call) return;
    kycCalls.delete(r.id);
    clearTimeout(call.timer);
    if (r.error) call.reject(new Error(r.error));
    else call.resolve(r.result);
  });
  function send(message) {
    return new Promise((resolve, reject) => {
      const id = "k" + ++kycSeq + "-" + Date.now();
      const timer = setTimeout(() => {
        kycCalls.delete(id);
        reject(new Error("ارتباط افزونه با Background برقرار نیست. افزونه را در chrome://extensions Reload کنید و صفحه Dynamics را کامل Refresh کنید."));
      }, 6e4);
      kycCalls.set(id, { resolve, reject, timer });
      document.dispatchEvent(new CustomEvent(KYC_REQ_EVT, { detail: JSON.stringify({ id, message }) }));
    });
  }
  async function getConfig() {
    const res = await send({ type: "getConfig" });
    return res?.config ?? {};
  }
  async function zohal(endpoint, body) {
    const { json, status } = await send({ type: "zohal", endpoint, body });
    if (json?.result !== 1) throw new Error(json?.response_body?.message || `خطا در استعلام زحل (${status})`);
    return Object.fromEntries(Object.entries(json.response_body?.data ?? {}).map(([k, v]) => [k, clean(v)]));
  }

  // src/kyc/dynamics.ts  (Xrm API only)
  var cleanId = (id) => String(id ?? "").replace(/[{}]/g, "").toLowerCase();
  function xrm() {
    const x = window.Xrm;
    if (!x || !x.WebApi) throw new Error("Xrm.WebApi در این صفحه در دسترس نیست؛ صفحه Dynamics را کامل Refresh کنید.");
    return x;
  }
  var DuplicateError = class extends Error {
    constructor(message, dup, dupField) {
      super(message);
      this.dup = dup;
      this.dupField = dupField;
      this.name = "DuplicateError";
    }
  };
  async function getList(entity, query) {
    return (await xrm().WebApi.retrieveMultipleRecords(entity, query)).entities;
  }
  var updateRecord = (entity, id, patch) => xrm().WebApi.updateRecord(entity, cleanId(id), patch);
  function openRecord(entityName, id) {
    const x = xrm();
    try {
      x.Navigation.openForm({ entityName, entityId: cleanId(id) }, { openInNewWindow: true });
    } catch {
      x.Navigation.openForm({ entityName, entityId: cleanId(id) });
    }
  }
  /**
   * Runs the action behind the ribbon button «بروزرسانی تلگرام» through Xrm.WebApi.
   * Its Web API (SDK message) name is systan_SyncTelegramSingleContact (bound to contact, input Target, output ResultMessage).
   */
  var TELEGRAM_ACTION = "systan_SyncTelegramSingleContact";
  async function syncTelegram(contactId) {
    const id = cleanId(contactId);
    const bound = {
      entity: { entityType: "contact", id },
      getMetadata: () => ({
        boundParameter: "entity",
        operationType: 0,
        operationName: TELEGRAM_ACTION,
        parameterTypes: { entity: { typeName: "mscrm.contact", structuralProperty: 5 } }
      })
    };
    const unbound = {
      Target: { "@odata.type": "Microsoft.Dynamics.CRM.contact", contactid: id },
      getMetadata: () => ({
        boundParameter: null,
        operationType: 0,
        operationName: TELEGRAM_ACTION,
        parameterTypes: { Target: { typeName: "mscrm.contact", structuralProperty: 5 } }
      })
    };
    let res = null;
    let firstError = null;
    for (const req of [bound, unbound]) {
      try {
        res = await xrm().WebApi.online.execute(req);
        if (res.ok) break;
        firstError ??= new Error(`${res.status} ${res.statusText}`);
      } catch (e) {
        firstError ??= e;
        res = null;
      }
    }
    if (!res || !res.ok) throw firstError ?? new Error("پاسخی از سرور دریافت نشد.");
    try {
      return String((await res.json())?.ResultMessage ?? "");
    } catch {
      return "";
    }
  }
  var TELEGRAM_LOOKUP = "systan_defaulttelegramaccount";
  var TELEGRAM_BLOCK_FIELD = "systan_donotallowtelegrammessage";
  /** Reads the contact's «حساب تلگرام پیش‌فرض» lookup through Xrm.WebApi; polls a few times because the action may fill it asynchronously. */
  async function waitTelegramAccount(contactId, tries = 6, everyMs = 2e3) {
    const col = `_${TELEGRAM_LOOKUP}_value`;
    for (let i = 0; i < tries; i++) {
      if (i) await new Promise((r) => setTimeout(r, everyMs));
      try {
        const row = await xrm().WebApi.retrieveRecord("contact", cleanId(contactId), `?$select=${col}`);
        if (row && row[col]) return String(row[`${col}@OData.Community.Display.V1.FormattedValue`] ?? "") || "ok";
      } catch (e) {
        console.warn("KYC telegram account check:", e);
      }
    }
    return "";
  }
  async function syncTelegramToast(contactId) {
    try {
      await syncTelegram(contactId);
    } catch (e) {
      toast(`بروزرسانی تلگرام ناموفق بود: ${errorMessage(e)}`, "err");
      return false;
    }
    const account = await waitTelegramAccount(contactId);
    // «عدم اجازه به پیام تلگرام»: account found -> messages allowed (false); not found -> not allowed (true)
    let flagNote = "";
    try {
      await updateRecord("contact", contactId, { [TELEGRAM_BLOCK_FIELD]: !account });
    } catch (e) {
      flagNote = ` (ثبت «عدم اجازه به پیام تلگرام» ناموفق بود: ${errorMessage(e)})`;
    }
    if (!account) {
      toast("حساب تلگرام برای این مخاطب پیدا نشد؛ «عدم اجازه به پیام تلگرام» روی بله (غیرمجاز) تنظیم شد." + flagNote, "err");
      return false;
    }
    toast("بروزرسانی تلگرام انجام شد." + (account !== "ok" ? ` حساب: ${account}` : "") + " «عدم اجازه به پیام تلگرام» روی خیر (مجاز) تنظیم شد." + flagNote);
    return true;
  }
  async function findByCode(k, field, code) {
    const rows = await getList(k.etn, `?$select=${k.idAttr},${k.nameAttr}&$filter=${field} eq '${code}'&$top=1`);
    const row = rows[0];
    return row && { id: row[k.idAttr], name: row[k.nameAttr] };
  }
  /**
   * Creates the record with every field. If the server rejects the full payload, the record is created with the
   * core fields only and the remaining fields are written one by one (so one bad field cannot lose the record).
   */
  async function createWithFallback(entity, core, extra) {
    try {
      const r = await xrm().WebApi.createRecord(entity, { ...core, ...extra });
      return { id: cleanId(r.id), failed: [] };
    } catch (firstError) {
      console.warn("KYC combined create failed, retrying with core fields:", firstError);
      let r;
      try {
        r = await xrm().WebApi.createRecord(entity, core);
      } catch {
        throw new Error(errorMessage(firstError));
      }
      const id = cleanId(r.id);
      const failed = [];
      for (const [attr, value] of Object.entries(extra)) {
        try {
          await updateRecord(entity, id, { [attr]: value });
        } catch (e) {
          failed.push(`${attr.replace("@odata.bind", "")} (${errorMessage(e)})`);
        }
      }
      return { id, failed };
    }
  }
  var DUP_SELECT = ["contactid", "fullname", "mobilephone", CONTACT_NATIONAL_FIELD, CONTACT_BIRTHDATE_FIELD, CONTACT_FATHERNAME_FIELD, FORM_NATIONAL_FIELD, FORM_FATHER_FIELD, FORM_BIRTHDATE_FIELD, "_systan_issuedfrombase_value"].join(",");
  async function queryContact(filter) {
    return (await getList("contact", `?$select=${DUP_SELECT}&$filter=${encodeURIComponent(filter)}&$top=1`))[0] ?? null;
  }
  function findMobileOwner(mobile) {
    const forms = [`0${mobile}`, mobile, `+98${mobile}`, `98${mobile}`];
    return queryContact(forms.map((m) => `mobilephone eq '${m}'`).join(" or "));
  }
  async function assertNameFree(first, last) {
    if (!first || !last) return;
    const pair = (f, l) => `(firstname eq '${oq(f)}' and lastname eq '${oq(l)}')`;
    const row = await queryContact(`${pair(first, last)} or ${pair(arabic(first), arabic(last))}`);
    if (row) throw new DuplicateError("مخاطبی با همین نام و نام خانوادگی قبلاً ثبت شده است.", row, "code");
  }
  function toast(text, type = "ok") {
    document.getElementById("kyc-toast")?.remove();
    const t = Object.assign(document.createElement("div"), { id: "kyc-toast", textContent: text, role: "status" });
    t.style.cssText = `position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2147483002;padding:11px 18px;border-radius:12px;
      color:#fff;background:${type === "err" ? "#b3261e" : "#1f2937"};font:14px Vazirmatn,"Segoe UI",Tahoma,sans-serif;direction:rtl;
      box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:90vw`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 5e3);
  }

  // src/kyc/panel-template.ts
  var panelHtml = (otpLength) => `
    <style>
      :host { all: initial; position: fixed; inset: 0; z-index: 2147483001; display: block; font: 14px/1.65 Vazirmatn, "Segoe UI", Tahoma, sans-serif;
        --bg:#fff; --s2:#f5f6f9; --s3:#eceff4; --tx:#141922; --mu:#667085; --ln:#e4e7ec; --pr:#4f46e5; --pr-h:#4338ca; --on-pr:#fff; --pr-s:#eef0ff;
        --ok:#059669; --ok-s:#e6f6ef; --er:#d92d20; --er-s:#fdeceb; color-scheme: light; }
      @media (prefers-color-scheme: dark) { :host { --bg:#181b24; --s2:#1f2330; --s3:#282d3d; --tx:#eceff5; --mu:#98a2b3; --ln:#2e3445; --pr:#8b93ff;
        --pr-h:#a5abff; --on-pr:#10123a; --pr-s:#262a52; --ok:#34d399; --ok-s:#173a2e; --er:#f97066; --er-s:#40201f; color-scheme: dark; } }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      svg { width: 20px; height: 20px; fill: currentColor; flex: none; }
      section { direction: rtl; padding: 18px; border: 1px solid var(--ln); border-radius: 20px; background: var(--bg); color: var(--tx);
        box-shadow: 0 1px 3px rgba(16,24,40,.08), 0 12px 28px -12px rgba(16,24,40,.18); }
      header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
      .badge { width: 40px; height: 40px; border-radius: 13px; display: grid; place-items: center; color: var(--pr);
        background: linear-gradient(145deg, var(--pr-s), color-mix(in srgb, var(--pr) 22%, var(--pr-s))); }
      h3 { margin: 0; font-size: 15.5px; font-weight: 800; }
      .steps { display: flex; margin: 0 0 18px; padding: 0; list-style: none; counter-reset: s; }
      .steps li { flex: 1; position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 11.5px; color: var(--mu); font-weight: 600; transition: .2s; }
      .steps li::before { counter-reset: none; content: attr(data-n); width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; z-index: 1;
        background: var(--s3); color: var(--mu); font-size: 12px; font-weight: 800; transition: .2s; }
      .steps li:not(:last-child)::after { content: ""; position: absolute; top: 13px; right: calc(50% + 18px); left: calc(-50% + 18px); height: 2px; background: var(--ln); }
      .steps li:not(:first-child)::after { }
      .steps li.on { color: var(--pr); }
      .steps li.on::before { background: var(--pr); color: var(--on-pr); box-shadow: 0 0 0 4px color-mix(in srgb, var(--pr) 22%, transparent); }
      .steps li.done { color: var(--ok); }
      .steps li.done::before { content: "✓"; background: var(--ok); color: #fff; }
      label { display: block; margin-bottom: 14px; }
      label span { display: block; margin-bottom: 6px; font-size: 12.5px; font-weight: 700; color: var(--mu); }
      input { width: 100%; min-height: 46px; padding: 10px 14px; border: 1px solid var(--ln); border-radius: 12px; background: var(--bg); color: var(--tx);
              font: inherit; font-size: 15px; direction: ltr; text-align: center; letter-spacing: 1px; font-variant-numeric: tabular-nums;
              box-shadow: 0 1px 2px rgba(16,24,40,.06); transition: border-color .15s, box-shadow .15s; }
      input::placeholder { color: var(--mu); opacity: .5; letter-spacing: 0; }
      input:focus { outline: none; border-color: var(--pr); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pr) 28%, transparent); }
      input[aria-invalid="true"] { border-color: var(--er); box-shadow: 0 0 0 3px color-mix(in srgb, var(--er) 18%, transparent); }
      #otp { font-size: 22px; letter-spacing: 10px; font-weight: 800; }
      #msg { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 14px; padding: 10px 13px; border-radius: 12px; background: var(--s2);
             color: var(--mu); font-size: 13px; }
      #msg:empty { display: none; }
      #msg.err { background: var(--er-s); color: var(--er); }
      #msg.ok { background: var(--ok-s); color: var(--ok); }
      button { width: 100%; min-height: 46px; border: 0; border-radius: 12px; padding: 0 12px; background: var(--pr); color: var(--on-pr);
               font: inherit; font-weight: 800; cursor: pointer; transition: background .15s, transform .1s;
               display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
      button:hover:not(:disabled) { background: var(--pr-h); }
      button:active:not(:disabled) { transform: scale(.99); }
      button:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--pr) 35%, transparent); }
      button.link { margin-top: 6px; min-height: 38px; background: none; color: var(--pr); font-weight: 700; }
      button.link:hover:not(:disabled) { background: var(--pr-s); }
      button:disabled { opacity: .55; cursor: default; }
      button.loading { cursor: progress; }
      button.loading::before { content: ""; width: 16px; height: 16px; border-radius: 50%; border: 2.5px solid color-mix(in srgb, currentColor 35%, transparent);
               border-top-color: currentColor; animation: spin .7s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .scrim { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; background: rgba(15,18,30,.5); }
      section { width: min(440px, 100%); max-height: calc(100vh - 32px); overflow: auto; }
      h3 { flex: 1; }
      button.x { width: 36px; min-height: 36px; padding: 0; background: none; color: var(--mu); border-radius: 10px; }
      button.x:hover:not(:disabled) { background: var(--s2); color: var(--tx); }
      .seg { display: flex; gap: 4px; padding: 4px; margin: 0 0 16px; background: var(--s2); border-radius: 14px; }
      .seg button { min-height: 38px; background: none; color: var(--mu); font-weight: 700; font-size: 13px; }
      .seg button.on, .seg button.on:hover:not(:disabled) { background: var(--bg); color: var(--pr); box-shadow: 0 1px 3px rgba(16,24,40,.12); }
      .seg button:hover:not(:disabled):not(.on) { background: var(--s3); }
      #msg a { color: inherit; font-weight: 700; text-decoration: underline; white-space: nowrap; cursor: pointer; margin-inline-start: 6px; }
      @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
    </style>
    <div class="scrim"><section role="dialog" aria-modal="true" aria-labelledby="title">
      <header>
        <span class="badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5zm-2 16-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9z"/></svg></span>
        <h3 id="title"></h3>
        <button type="button" class="x" id="close" aria-label="بستن"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
      </header>
      <div class="seg" id="seg"><button type="button" data-k="person" class="on">مخاطب حقیقی</button><button type="button" data-k="company">شرکت (حقوقی)</button></div>
      <ol class="steps" id="steps" aria-hidden="true"><li data-s="check" data-n="۱">جستجو</li><li data-s="details" data-n="۲">احراز هویت</li><li data-s="otp" data-n="۳">تایید موبایل</li></ol>
      <label><span id="codeLabel"></span><input id="code" inputmode="numeric" autocomplete="off" placeholder="----------"></label>
      <label id="birthRow" hidden><span>تاریخ تولد (شمسی)</span>
        <input id="birth" inputmode="numeric" autocomplete="off" placeholder="1377/06/30"></label>
      <label id="mobileRow" hidden><span>شماره موبایل</span>
        <input id="mobile" inputmode="tel" autocomplete="off" placeholder="09121234567"></label>
      <label id="otpRow" hidden><span>کد تایید پیامکی</span>
        <input id="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="${otpLength}" placeholder="••••••"></label>
      <p id="msg" role="status" aria-live="polite"></p>
      <button type="button" id="go">بررسی</button>
      <button type="button" id="resend" class="link" hidden>ارسال مجدد کد</button>
    </section></div>`;

  // src/kyc/person-map.ts
  var titleFieldName = (configured) => configured && /^[a-z_0-9]+$/i.test(configured) ? configured : DEFAULTS.titleField;
  function mapPerson(p, cfg, code, jalali) {
    const optionValue = (v, fallback) => /^\d+$/.test(String(v).trim()) ? String(v).trim() : fallback;
    const raw = p.gender;
    const rawStr = raw === null || raw === void 0 ? "" : String(raw).trim().toLowerCase();
    let title;
    if (rawStr === "1" || rawStr === "true" || rawStr === "male") title = optionValue(cfg.titleMale, DEFAULTS.titleMale);
    else if (rawStr === "0" || rawStr === "false" || rawStr === "female") title = optionValue(cfg.titleFemale, DEFAULTS.titleFemale);
    else throw new Error(`جنسیت نامعتبر یا نامشخص از زحل دریافت شد (${String(raw)}). عنوان مخاطب را بررسی کنید.`);
    return compact({
      [titleFieldName(cfg.titleField)]: title,
      firstname: p.first_name,
      lastname: p.last_name,
      [CONTACT_FATHERNAME_FIELD]: p.father_name,
      [CONTACT_NATIONAL_FIELD]: code,
      [CONTACT_BIRTHDATE_FIELD]: jalali
    });
  }

  // src/shared/jalali.ts
  function parseJalali(raw) {
    const t = toLatinDigits(raw).trim();
    const parts = /\D/.test(t) ? t.split(/\D+/) : [t.slice(0, 4), t.slice(4, 6), t.slice(6)];
    if (parts.length !== 3) return null;
    const [jy, jm, jd] = parts.map(Number);
    const ok = jy >= 1200 && jy <= 1500 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= (jm <= 6 ? 31 : 30);
    return ok ? { jy, jm, jd } : null;
  }
  function jalaliToIso(jy, jm, jd) {
    let y = jy + 1595;
    let days = -355668 + 365 * y + Math.floor(y / 33) * 8 + Math.floor((y % 33 + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
    let gy = 400 * Math.floor(days / 146097);
    days %= 146097;
    if (days > 36524) {
      gy += 100 * Math.floor(--days / 36524);
      days %= 36524;
      if (days >= 365) days++;
    }
    gy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
      gy += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }
    let gd = days + 1;
    const leap = gy % 4 === 0 && gy % 100 !== 0 || gy % 400 === 0;
    const md = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let gm = 0;
    while (gm < 13 && gd > md[gm]) gd -= md[gm++];
    return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
  }
  // The values the Contact form really shows (National ID / Father's Name / Birthday). Written via Web API
  // in addition to the legacy fields, so both stay in sync.
  function formFieldValues(nationalCode, pending) {
    const out = {};
    if (nationalCode) out[FORM_NATIONAL_FIELD] = String(nationalCode);
    const father = pending?.[CONTACT_FATHERNAME_FIELD];
    if (father) out[FORM_FATHER_FIELD] = father;
    const b = parseJalali(pending?.[CONTACT_BIRTHDATE_FIELD] ?? "");
    if (b) out[FORM_BIRTHDATE_FIELD] = jalaliToIso(b.jy, b.jm, b.jd);
    return out;
  }

  // src/kyc/payloads.ts
  var str = (v) => typeof v === "string" ? v : void 0;
  var zohalIssuePlace = "";
  var zohalKeys = [];
  function pickIssuePlace(p) {
    for (const [k, v] of Object.entries(p ?? {})) {
      if (typeof v === "string" && v.trim() && /issu|صدور/i.test(k)) return v.trim();
    }
    return "";
  }
  async function personPayload(code, birthRaw) {
    const cfg = await getConfig();
    const b = parseJalali(birthRaw);
    if (!b) throw new Error("تاریخ تولد معتبر نیست (مثال: 1377/06/30).");
    const jalali = `${b.jy}/${pad(b.jm)}/${pad(b.jd)}`;
    const p = await zohal("national_identity_inquiry", { national_code: code, birth_date: jalali, gender: true });
    if (!p.matched) throw new Error("کد ملی و تاریخ تولد با هم مطابقت ندارند.");
    zohalKeys = Object.keys(p);
    zohalIssuePlace = pickIssuePlace(p);
    return mapPerson(p, cfg, code, jalali);
  }
  async function companyPayload(code, field) {
    const c = await zohal("company_inquiry", { national_id: code });
    if (!c.name) throw new Error("نام شرکت در پاسخ زحل وجود ندارد.");
    const notes = [
      ["نوع شرکت", c.company_type],
      ["شماره ثبت", c.register_number],
      ["تاریخ ثبت", c.register_date],
      ["تاریخ پایان فعالیت", c.activity_end_date]
    ];
    return compact({
      name: c.name,
      [field]: code,
      address1_line1: str(c.address)?.slice(0, 250),
      address1_postalcode: c.postal_code,
      telephone1: c.phone_number,
      fax: c.fax_number,
      emailaddress1: c.email_address,
      description: notes.filter(([, v]) => v).map(([k, v]) => `${k}: ${String(v)}`).join("\n")
    });
  }


  // src/kyc/panel.ts
  var KINDS = {
    person: { etn: "contact", idAttr: "contactid", nameAttr: "fullname", label: "کد ملی", title: "احراز هویت مخاطب حقیقی", length: 10 },
    company: { etn: "account", idAttr: "accountid", nameAttr: "name", label: "شناسه ملی", title: "احراز هویت شرکت (حقوقی)", length: 11 }
  };
  var GO_LABEL = { check: "بررسی", details: "احراز هویت و ارسال کد", otp: "تایید و ایجاد" };
  var MSG_ICON = {
    err: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m1 15h-2v-2h2zm0-4h-2V7h2z"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z"/></svg>'
  };
  var RESEND_LABEL = "ارسال مجدد کد";
  var INPUT_IDS = ["code", "birth", "mobile", "otp"];
  var ISSUED_FROM_BIND = "systan_IssuedFrombase@odata.bind";
  var locCache = null;
  var normName = (v) => String(v ?? "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[‌‎‏\s]+/g, " ").trim().toLowerCase();
  async function loadLocations() {
    if (locCache) return locCache;
    const rows = await getList("systan_locationbase", "?$select=systan_name&$orderby=systan_name&$top=5000");
    const byName = /* @__PURE__ */ new Map();
    for (const r of rows) {
      const k = normName(r.systan_name);
      if (k && !byName.has(k)) byName.set(k, { id: r.systan_locationbaseid, name: r.systan_name });
    }
    return locCache = byName;
  }
  var pickKeys = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
  var omitKeys = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
  var KycPanel = class {
    host = Object.assign(document.createElement("div"), { id: "kyc-root" });
    shadow = this.host.attachShadow({ mode: "open" });
    kind = "person";
    step = "check";
    // check → details (birth date + mobile) → otp
    pending = null;
    // Zohal-verified contact payload
    pendingKey = "";
    // code|birth the payload was verified for
    otpMobile = "";
    // mobile the OTP was sent to
    existing = null;
    // contact found by mobile → update flow
    cooldownLeft = 0;
    cooldownTimer = 0;
    constructor() {
      this.shadow.innerHTML = panelHtml(OTP_LENGTH);
      this.wire();
      this.setKind("person");
    }
    // ───────────── open / close (own UI only) ─────────────
    openAs(kind) {
      if (!this.host.isConnected) document.documentElement.appendChild(this.host);
      if (kind && kind !== this.kind) this.setKind(kind);
      setTimeout(() => this.input(this.step === "otp" ? "otp" : "code").focus(), 30);
    }
    close() {
      this.host.remove();
    }
    // ───────────── tiny helpers for the panel's own shadow DOM ─────────────
    $(id) {
      const el = this.shadow.getElementById(id);
      if (!el) throw new Error(`KYC panel element #${id} is missing`);
      return el;
    }
    input = (id) => this.$(id);
    invalid(id, on = true) {
      this.$(id).setAttribute("aria-invalid", on ? "true" : "false");
    }
    /** link = { label, entity, id } adds an "open record" link that uses Xrm.Navigation.openForm. */
    say(text, type = "", link = null) {
      const m = this.$("msg");
      m.className = type;
      m.textContent = "";
      if (!text) return;
      if (type) m.insertAdjacentHTML("afterbegin", MSG_ICON[type]);
      const span = Object.assign(document.createElement("span"), { textContent: text });
      if (link) {
        const a = Object.assign(document.createElement("a"), { textContent: link.label, role: "button", tabIndex: 0 });
        const go = (e) => {
          e.preventDefault();
          try {
            openRecord(link.entity, link.id);
          } catch (err) {
            this.say(errorMessage(err), "err");
          }
        };
        a.addEventListener("click", go);
        a.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") go(e);
        });
        span.append(a);
      }
      m.append(span);
    }
    // resend button: the background worker enforces a 60 s cooldown, so show it instead of failing on click
    paintResend() {
      const btn = this.$("resend");
      btn.textContent = this.cooldownLeft > 0 ? `${RESEND_LABEL} (${this.cooldownLeft} ثانیه)` : RESEND_LABEL;
      btn.disabled = this.cooldownLeft > 0 || this.$("go").classList.contains("loading");
    }
    startCooldown(sec = 60) {
      clearInterval(this.cooldownTimer);
      this.cooldownLeft = sec;
      this.paintResend();
      this.cooldownTimer = window.setInterval(() => {
        this.cooldownLeft = Math.max(0, this.cooldownLeft - 1);
        if (!this.cooldownLeft) clearInterval(this.cooldownTimer);
        this.paintResend();
      }, 1e3);
    }
    busy(on) {
      const go = this.$("go");
      go.disabled = on;
      go.classList.toggle("loading", on);
      this.shadow.querySelectorAll("#seg button").forEach((b) => {
        b.disabled = on;
      });
      this.paintResend();
    }
    go(next) {
      this.step = next;
      this.$("birthRow").hidden = this.$("mobileRow").hidden = next === "check";
      this.$("steps").hidden = this.kind === "company";
      this.$("otpRow").hidden = this.$("resend").hidden = next !== "otp";
      this.$("go").textContent = GO_LABEL[next];
      const order = ["check", "details", "otp"];
      this.shadow.querySelectorAll("#steps li").forEach((li) => {
        const i = order.indexOf(li.dataset.s);
        li.className = i < order.indexOf(next) ? "done" : i === order.indexOf(next) ? "on" : "";
      });
    }
    /** "Issued From" comes only from the Zohal response: resolve that place name to a systan_locationbase record. */
    async issueLookup() {
      const text = String(this.pendingIssue ?? "").trim();
      if (!text) {
        console.info("KYC: Zohal did not return a place of issue. Response keys:", this.pendingKeys);
        return {};
      }
      try {
        const hit = (await loadLocations()).get(normName(text));
        if (hit) return { [ISSUED_FROM_BIND]: `/systan_locationbases(${cleanId(hit.id)})` };
      } catch (e) {
        console.warn("KYC issue lookup:", e);
      }
      toast(`محل صدور «${text}» از زحل در جدول مکان‌ها پیدا نشد؛ ثبت نشد.`, "err");
      return {};
    }
    setKind(next) {
      this.kind = next;
      this.$("title").textContent = KINDS[next].title;
      this.$("codeLabel").textContent = KINDS[next].label;
      this.shadow.querySelectorAll("#seg button").forEach((b) => b.classList.toggle("on", b.dataset.k === next));
      this.resetFlow();
    }
    resetFlow() {
      for (const id of INPUT_IDS) {
        this.input(id).value = "";
        this.invalid(id, false);
      }
      this.existing = null;
      clearInterval(this.cooldownTimer);
      this.cooldownLeft = 0;
      this.paintResend();
      this.pending = null;
      this.pendingKey = "";
      this.go("check");
      this.say("");
    }
    // ───────────── flow ─────────────
    /** Company: Zohal data → account created through Xrm.WebApi. */
    async createCompany(field, code) {
      const payload = await companyPayload(code, field);
      this.say("در حال ایجاد شرکت در داینامیکس…");
      const core = pickKeys(payload, ["name"]);
      const { id, failed } = await createWithFallback("account", core, omitKeys(payload, ["name"]));
      if (failed.length) toast(`شرکت ایجاد شد اما این فیلدها ثبت نشد: ${failed.join("؛ ")}`, "err");
      this.resetFlow();
      this.say(`شرکت «${payload.name}» ایجاد شد.`, "ok", { label: "باز کردن شرکت", entity: "account", id });
    }
    async check(k, field, code) {
      this.say("در حال جستجو در داینامیکس…");
      const found = await findByCode(k, field, code);
      if (found) return this.say(`این ${this.kind === "person" ? "مخاطب" : "شرکت"} از قبل وجود دارد: ${found.name ?? ""}`, "ok", { label: "باز کردن", entity: k.etn, id: found[k.idAttr] ?? found.id });
      if (this.kind === "company") {
        this.say("در حال استعلام از زحل…");
        return await this.createCompany(field, code);
      }
      this.go("details");
      this.input("birth").focus();
      this.say("مخاطبی با این کد ملی یافت نشد. تاریخ تولد و شماره موبایل را وارد کنید.");
    }
    sayDuplicate(e) {
      const r = e.dup;
      const national = r[CONTACT_NATIONAL_FIELD];
      this.say(`${e.message} ${r.fullname ?? ""}${r.mobilephone ? ` • ${r.mobilephone}` : ""}${national ? ` • کد ملی ${String(national)}` : ""}`, "err", { label: "باز کردن مخاطب", entity: "contact", id: r.contactid });
    }
    async sendOtp(code, birthRaw) {
      const mobile = parseMobile(this.input("mobile").value);
      if (!mobile) throw new Error("شماره موبایل معتبر نیست (مثال: 09121234567).");
      this.say("در حال بررسی موبایل در داینامیکس…");
      const owner = await findMobileOwner(mobile);
      this.existing = null;
      if (owner) {
        const saved = owner[CONTACT_NATIONAL_FIELD];
        if (saved && String(saved) !== code) throw new DuplicateError("این موبایل متعلق به مخاطبی با کد ملی دیگری است.", owner, "mobile");
        this.existing = { id: owner.contactid, name: owner.fullname, row: owner };
      }
      const key = `${code}|${digits(birthRaw)}`;
      if (this.pendingKey !== key || !this.pending) {
        this.say("در حال استعلام از زحل…");
        this.pending = await personPayload(code, birthRaw);
        this.pendingIssue = zohalIssuePlace;
        this.pendingKeys = zohalKeys;
        this.pendingKey = key;
      }
      if (!this.existing) await assertNameFree(this.pending.firstname, this.pending.lastname);
      this.say("در حال ارسال کد تایید…");
      await send({ type: "otpSend", mobile });
      this.otpMobile = mobile;
      this.startCooldown();
      this.go("otp");
      this.input("otp").focus();
      if (this.existing) {
        this.$("go").textContent = "تایید و بروزرسانی مخاطب";
        this.say(`کد تایید به 0${mobile} ارسال شد. این موبایل متعلق به «${this.existing.name ?? ""}» است؛ پس از تایید، نام، کد ملی و تاریخ تولد او بروزرسانی می‌شود.`, "ok");
      } else this.say(`کد تایید به 0${mobile} ارسال شد.`, "ok");
    }
    /** Zohal payload → Dynamics field values (title option set as a number). */
    async contactRecord(pending, nationalCode, lookups) {
      const titleKey = titleFieldName((await getConfig()).titleField);
      const record = {};
      for (const [k, v] of Object.entries(pending)) record[k] = k === titleKey && /^\d+$/.test(v) ? Number(v) : v;
      Object.assign(record, formFieldValues(nationalCode, pending), lookups);
      return { record, titleKey };
    }
    async verifyAndFill(nationalCode) {
      const code = digits(this.input("otp").value);
      if (code.length !== OTP_LENGTH) throw new Error(`کد تایید ${OTP_LENGTH} رقمی را وارد کنید.`);
      this.say("در حال بررسی کد…");
      await send({ type: "otpVerify", mobile: this.otpMobile, code });
      const pending = this.pending;
      if (!pending) throw new Error("اطلاعات احراز هویت موجود نیست؛ دوباره از ابتدا شروع کنید.");
      const lookups = await this.issueLookup();
      if (this.existing) return this.updateExistingContact(pending, nationalCode, lookups);
      const { record, titleKey } = await this.contactRecord(pending, nationalCode, lookups);
      record.mobilephone = `0${this.otpMobile}`;
      const coreKeys = ["firstname", "lastname", "mobilephone", titleKey];
      this.say("در حال ایجاد مخاطب در داینامیکس…");
      const { id, failed } = await createWithFallback("contact", pickKeys(record, coreKeys), omitKeys(record, coreKeys));
      if (failed.length) toast(`مخاطب ایجاد شد اما این فیلدها ثبت نشد: ${failed.join("؛ ")}`, "err");
      const name = [pending.firstname, pending.lastname].filter(Boolean).join(" ");
      try {
        await send({ type: "welcome", mobile: this.otpMobile, firstname: pending.firstname ?? "", lastname: pending.lastname ?? "" });
        toast("پیامک خوش‌آمدگویی ارسال شد.");
      } catch (e) {
        toast(`ارسال پیامک خوش‌آمدگویی ناموفق بود: ${errorMessage(e)}`, "err");
      }
      await syncTelegramToast(id);
      this.resetFlow();
      this.say(`مخاطب «${name}» ایجاد شد.`, "ok", { label: "باز کردن مخاطب", entity: "contact", id });
    }
    /**
     * Existing contact (found by mobile): after the OTP is confirmed, write the Zohal-verified data onto that record
     * through Xrm.WebApi (no welcome SMS).
     */
    async updateExistingContact(payload, nationalCode, lookups = {}) {
      const existing = this.existing;
      const { record: patch } = await this.contactRecord(payload, nationalCode, lookups);
      if (existing.row._systan_issuedfrombase_value) delete patch[ISSUED_FROM_BIND];
      for (const f of [CONTACT_NATIONAL_FIELD, CONTACT_BIRTHDATE_FIELD, CONTACT_FATHERNAME_FIELD, FORM_NATIONAL_FIELD, FORM_FATHER_FIELD, FORM_BIRTHDATE_FIELD]) {
        if (String(existing.row[f] ?? "").trim()) delete patch[f];
      }
      this.say("در حال بروزرسانی مخاطب…");
      await updateRecord("contact", existing.id, patch);
      const name = [patch.firstname, patch.lastname].filter(Boolean).join(" ") || existing.name || "";
      toast(`مخاطب بروزرسانی شد: ${name}`);
      const id = existing.id;
      await syncTelegramToast(id);
      this.resetFlow();
      this.say(`مخاطب «${name}» با اطلاعات زحل (نام، کد ملی، تاریخ تولد، …) بروزرسانی شد.`, "ok", { label: "باز کردن مخاطب", entity: "contact", id });
    }
    async submit() {
      if (this.$("go").disabled) return;
      const k = KINDS[this.kind];
      const code = digits(this.input("code").value);
      if (code.length !== k.length || this.kind === "person" && !validNationalCode(code)) {
        this.invalid("code");
        this.input("code").focus();
        return this.say(`${k.label} معتبر نیست.`, "err");
      }
      this.busy(true);
      try {
        const cfg = await getConfig();
        const field = this.kind === "person" ? CONTACT_NATIONAL_FIELD : cfg.accountNationalField;
        if (this.step === "check") await this.check(k, field, code);
        else if (this.step === "details") await this.sendOtp(code, this.input("birth").value);
        else await this.verifyAndFill(code);
      } catch (e) {
        if (e instanceof DuplicateError) {
          this.sayDuplicate(e);
          this.invalid(e.dupField === "mobile" ? "mobile" : "code");
        } else {
          const msg = errorMessage(e);
          this.say(msg, "err");
          if (/موبایل/.test(msg)) this.invalid("mobile");
          else if (/تاریخ تولد/.test(msg)) this.invalid("birth");
          else if (/کد تایید/.test(msg) && this.step === "otp") this.invalid("otp");
        }
      } finally {
        this.busy(false);
      }
    }
    // ───────────── events ─────────────
    wire() {
      this.$("go").onclick = () => void this.submit();
      this.$("close").onclick = () => this.close();
      this.shadow.querySelectorAll("#seg button").forEach((b) => {
        b.onclick = () => {
          if (!b.disabled && b.dataset.k !== this.kind) this.setKind(b.dataset.k);
          this.input("code").focus();
        };
      });
      this.$("resend").onclick = async () => {
        this.busy(true);
        try {
          await send({ type: "otpSend", mobile: this.otpMobile });
          this.startCooldown();
          this.say("کد جدید ارسال شد.", "ok");
        } catch (e) {
          this.say(errorMessage(e), "err");
        } finally {
          this.busy(false);
        }
      };
      for (const id of INPUT_IDS) {
        this.input(id).addEventListener("input", () => {
          const el = this.input(id);
          if (/[۰-۹٠-٩]/.test(el.value)) el.value = toLatinDigits(el.value);
          this.invalid(id, false);
        });
      }
      this.input("code").addEventListener("input", () => {
        this.go("check");
        this.say("");
      });
      for (const id of ["birth", "mobile"]) {
        this.input(id).addEventListener("input", () => {
          if (this.step === "otp") {
            this.go("details");
            this.say("");
          }
        });
      }
      // keep every key inside the dialog (CRM / quick-session shortcuts must not see them)
      for (const type of ["keydown", "keyup", "keypress"]) {
        this.shadow.addEventListener(type, (e) => {
          e.stopPropagation();
          if (type !== "keydown") return;
          if (e.key === "Enter") void this.submit();
          else if (e.key === "Escape") this.close();
        });
      }
    }
  };

  // src/kyc/index.ts: opened from the "احراز هویت" button in the DY floating action dock (content/close.js)
  var panel = new KycPanel();
  window.__dyKyc = { open: (kind) => panel.openAs(kind) };
  console.info("DY CRM Toolkit: KYC ready (Xrm API only)");
})();
