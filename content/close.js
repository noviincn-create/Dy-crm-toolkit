"use strict";
(() => {
  // src/shared/config.ts
  var QUICK_ATTR = "data-dy-quick";
  var QUICK_CRM_ATTR = "data-dy-crm";
  var QUICK_OPEN_EVT = "dy-quick-open";

  // src/shared/xrm.ts
  function getFC() {
    try {
      const page = window.Xrm?.Page;
      return page?.data ? page : null;
    } catch {
      return null;
    }
  }
  function requireXrm() {
    const xrm = window.Xrm;
    if (!xrm) throw new Error("Xrm در دسترس نیست.");
    return xrm;
  }
  var cleanId = (id) => id.replace(/[{}]/g, "").toLowerCase();
  var clientUrl = () => requireXrm().Utility.getGlobalContext().getClientUrl();

  // src/close/constants.ts
  var BTN_ID = "dy-close-btn";
  var DLG_ID = "dy-close-dlg";
  var FAB_ID = "dy-fab";
  var CSS_ID = "dy-close-css";
  var LS_KEY = "dyEasyClose.stageDefaults";
  var SEQ_KEY = "dyEasyClose.sequential";
  var FAB_KEY = "dyEasyClose.fabMin";
  var SES_KEY = "dyEasyClose.session";
  var SES_OPEN_KEY = "dyEasyClose.sessionPanelOpen";
  var SES_OPENFORM_KEY = "dyEasyClose.sessionOpenForm";
  var NUM_FIELD = "new_opportunitynumbertext";
  var NUM_LEGACY = "new_opportunitynumber";
  var NUM_MAX_ATTEMPTS = 6;
  var NUM_MAX_SEQ = 9999;
  var END_PRODUCT = "INT-009";

  // src/shared/text.ts
  var toLatinDigits = (s) => String(s ?? "").replace(/[۰-۹٠-٩]/g, (d) => String(d.charCodeAt(0) & 15));
  var faNum = (n) => {
    try {
      return Number(n).toLocaleString("fa-IR");
    } catch {
      return String(n);
    }
  };
  var HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  var esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => HTML_ESCAPES[c] ?? c);
  var pad = (n, width = 2) => String(n).padStart(width, "0");
  var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  var errorMessage = (e) => e instanceof Error ? e.message : String(e);

  // src/shared/jalali.ts
  var BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  var div = (a, b) => ~~(a / b);
  var mod = (a, b) => a - ~~(a / b) * b;
  function jalCal(jy) {
    const bl = BREAKS.length;
    const gy = jy + 621;
    let leapJ = -14;
    let jp = BREAKS[0];
    let jump = 0;
    if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error("Invalid Persian year " + jy);
    for (let i = 1; i < bl; i += 1) {
      const jm = BREAKS[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    let n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    let leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }
  function g2d(gy, gm, gd) {
    const d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  }
  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    return { gy: div(j, 1461) - 100100 + div(8 - gm, 6), gm, gd };
  }
  function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }
  function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy);
    let k = jdn - g2d(gy, 3, r.march);
    if (k >= 0) {
      if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
  }
  var PC = { g2d, d2g, j2d, d2j };
  var TEHRAN_TZ = "Asia/Tehran";
  var TEHRAN_FALLBACK_OFFSET_MS = 126e5;
  function tehranOffsetMs(date) {
    try {
      const p = {};
      new Intl.DateTimeFormat("en-US", {
        timeZone: TEHRAN_TZ,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric"
      }).formatToParts(date).forEach((x) => {
        p[x.type] = x.value;
      });
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(date.getTime() / 1e3) * 1e3;
    } catch {
      return TEHRAN_FALLBACK_OFFSET_MS;
    }
  }
  function tehranYmd(date) {
    const t = new Date(date.getTime() + tehranOffsetMs(date));
    return { gy: t.getUTCFullYear(), gm: t.getUTCMonth() + 1, gd: t.getUTCDate() };
  }
  function tehranMidnightUtc(gy, gm, gd) {
    const wall = Date.UTC(gy, gm - 1, gd);
    let t = wall - TEHRAN_FALLBACK_OFFSET_MS;
    t = wall - tehranOffsetMs(new Date(t));
    t = wall - tehranOffsetMs(new Date(t));
    return new Date(t);
  }
  function persianMonthOf(date) {
    const g = tehranYmd(date);
    const j = PC.d2j(PC.g2d(g.gy, g.gm, g.gd));
    return { jy: j.jy, jm: j.jm };
  }
  function persianMonthBounds(jy, jm) {
    const at = (y, m) => {
      const g = PC.d2g(PC.j2d(y, m, 1));
      return tehranMidnightUtc(g.gy, g.gm, g.gd);
    };
    return { start: at(jy, jm), end: jm === 12 ? at(jy + 1, 1) : at(jy, jm + 1) };
  }
  var isoUtc = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  function formatJalali(d) {
    try {
      return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }

  // src/shared/odata.ts
  var ApiError = class extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
      this.name = "ApiError";
    }
  };
  var transport = { base: clientUrl, credentials: "same-origin" };
  async function api(path, opts = {}) {
    const isAbsolute = /^https?:\/\//i.test(path);
    const base = await transport.base();
    const url = isAbsolute ? path : base + "/api/data/v9.1/" + path;
    if (isAbsolute && path.indexOf(base + "/") !== 0) throw new Error("Refusing cross-origin request: " + path);
    const res = await fetch(url, {
      credentials: transport.credentials,
      ...opts,
      headers: {
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
        ...opts.headers
      }
    });
    if (!res.ok) {
      let msg = res.status + " " + res.statusText;
      try {
        const j = await res.json();
        msg = j.error?.message || msg;
      } catch {
      }
      throw new ApiError(msg, res.status);
    }
    if (res.status === 204) return null;
    if (/text\/html/i.test(res.headers?.get?.("content-type") ?? "")) throw new ApiError("به CRM وارد نشده‌اید؛ یک تب CRM را باز کنید و وارد شوید.", 401);
    return await res.json();
  }
  async function apiAll(path, opts = {}, maxPages = 20) {
    const out = [];
    let next = path;
    for (let i = 0; next && i < maxPages; i++) {
      const r = await api(next, opts);
      out.push(...r.value ?? []);
      next = r["@odata.nextLink"];
    }
    return out;
  }

  // src/close/opp-number.ts
  var numPrefix = (jy, jm) => String(jy % 10) + pad(jm, 2);
  var numFormat = (jy, jm, seq2) => numPrefix(jy, jm) + pad(seq2, 4);
  var NumberCollisionError = class extends Error {
    code = "COLLISION";
    constructor(message) {
      super(message);
      this.name = "NumberCollisionError";
    }
  };
  var numMetaP = null;
  function numMeta() {
    if (!numMetaP) {
      numMetaP = (async () => {
        let a;
        try {
          a = await api("EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='" + NUM_FIELD + "')");
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) throw new Error("فیلد " + NUM_FIELD + " در موجودیت opportunity پیدا نشد.");
          throw new Error("خواندن متادیتای فیلد " + NUM_FIELD + " ناموفق بود: " + errorMessage(e));
        }
        const yes = (v) => v === true || typeof v === "object" && v !== null && v.Value === true;
        const type = String(a.AttributeType || a.AttributeTypeName && a.AttributeTypeName.Value || "").replace(/Type$/, "");
        const isStr = /^(String|Memo)$/i.test(type);
        const isNum = /^(Integer|BigInt|Decimal|Double)$/i.test(type);
        if (!isStr && !isNum) throw new Error("نوع داده‌ی فیلد " + NUM_FIELD + " (" + (type || "؟") + ") برای شماره‌ی عددی پشتیبانی نمی‌شود.");
        if (!yes(a.IsValidForUpdate)) throw new Error("فیلد " + NUM_FIELD + " قابل ویرایش نیست (IsValidForUpdate=false).");
        if (isStr && a.MaxLength != null && a.MaxLength < 7) throw new Error("حداکثر طول فیلد " + NUM_FIELD + " کمتر از ۷ نویسه است.");
        return { numeric: isNum, type };
      })();
      numMetaP.catch(() => {
        numMetaP = null;
      });
    }
    return numMetaP;
  }
  var numValue = (meta, s) => meta.numeric ? Number(s) : s;
  var numLiteral = (meta, s) => meta.numeric ? String(Number(s)) : "'" + String(s).replace(/'/g, "''") + "'";
  async function fetchMonthRows(b) {
    const filter = "createdon ge " + isoUtc(b.start) + " and createdon lt " + isoUtc(b.end);
    let url = "opportunities?$select=opportunityid," + NUM_FIELD + "," + NUM_LEGACY + ",createdon&$filter=" + encodeURIComponent(filter);
    const rows = [];
    for (let guard = 0; url; guard++) {
      if (guard > 400) throw new Error("تعداد صفحه‌های نتیجه بیش از حد مجاز است.");
      const r = await api(url, { headers: { Prefer: "odata.maxpagesize=5000" } });
      rows.push(...r.value || []);
      url = r["@odata.nextLink"] || null;
    }
    return rows;
  }
  async function findHolders(meta, number, exceptId) {
    const filter = NUM_FIELD + " eq " + numLiteral(meta, number) + (exceptId ? " and opportunityid ne " + exceptId : "");
    const r = await api("opportunities?$select=opportunityid,createdon,modifiedon&$top=50&$filter=" + encodeURIComponent(filter));
    return r.value || [];
  }
  var sortKey = (r, f) => [Date.parse(r[f]) || 0, cleanId(r.opportunityid)];
  var keyLess = (a, b) => a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1];
  var asText = (v) => v === null || v === void 0 ? "" : String(v);
  async function assignOpportunityNumber(oppId) {
    const id = cleanId(oppId);
    const meta = await numMeta();
    let own = null;
    const taken = /* @__PURE__ */ new Set();
    let collisions = 0;
    for (let attempt = 1; attempt <= NUM_MAX_ATTEMPTS; attempt++) {
      const rec = await api("opportunities(" + id + ")?$select=" + NUM_FIELD + ",createdon,modifiedon");
      const cur = asText(rec[NUM_FIELD]);
      if (cur && cur !== own) return { number: cur, existing: true, seq: null, attempts: attempt, collisions };
      if (!cur) own = null;
      const created = new Date(rec.createdon);
      if (isNaN(created.getTime())) throw new Error("createdon رکورد نامعتبر است.");
      const { jy, jm } = persianMonthOf(created);
      if (jy % 10 === 0 && meta.numeric) throw new Error("فیلد عددی است و رقم سال (۰) صفر پیشین را نگه نمی‌دارد؛ فیلد باید از نوع متن باشد.");
      const prefix = numPrefix(jy, jm);
      const rows = await fetchMonthRows(persianMonthBounds(jy, jm));
      const me = sortKey(rec, "createdon");
      let rank = 1;
      const used = /* @__PURE__ */ new Set();
      for (const r of rows) {
        if (cleanId(r.opportunityid) === id) continue;
        if (keyLess(sortKey(r, "createdon"), me)) rank++;
        for (const f of [NUM_FIELD, NUM_LEGACY]) {
          const s = asText(r[f]);
          if (s.length === 7 && s.indexOf(prefix) === 0) used.add(parseInt(s.slice(3), 10));
        }
      }
      let seq2 = rank;
      let num = null;
      for (let probe = 0; probe < 30; probe++) {
        while (used.has(seq2) || taken.has(seq2)) seq2++;
        if (seq2 > NUM_MAX_SEQ) throw new Error("ظرفیت شماره‌ی این ماه (" + NUM_MAX_SEQ + ") پر شده است.");
        const cand = numFormat(jy, jm, seq2);
        const dup = await findHolders(meta, cand, id);
        if (!dup.length) {
          num = cand;
          break;
        }
        taken.add(seq2);
      }
      if (!num) throw new Error("شماره‌ی آزاد پیدا نشد (برخورد مکرر).");
      const headers = rec["@odata.etag"] ? { "If-Match": rec["@odata.etag"] } : {};
      try {
        await api("opportunities(" + id + ")", { method: "PATCH", headers, body: JSON.stringify({ [NUM_FIELD]: numValue(meta, num) }) });
      } catch (e) {
        if (e instanceof ApiError && e.status === 412) continue;
        throw e;
      }
      own = num;
      const holders = await findHolders(meta, num, null);
      const mine = holders.find((x) => cleanId(x.opportunityid) === id);
      const others = holders.filter((x) => cleanId(x.opportunityid) !== id);
      if (mine && !others.length) return { number: num, existing: false, seq: seq2, attempts: attempt, collisions };
      if (!mine) throw new Error("بعد از ثبت، شماره‌ی " + num + " روی رکورد دیده نشد.");
      const myKey = sortKey(mine, "modifiedon");
      if (others.every((o) => keyLess(myKey, sortKey(o, "modifiedon")))) return { number: num, existing: false, seq: seq2, attempts: attempt, collisions: collisions + 1 };
      collisions++;
      taken.add(seq2);
    }
    if (own) {
      try {
        const rec = await api("opportunities(" + id + ")?$select=" + NUM_FIELD);
        if (String(rec[NUM_FIELD]) === own) await api("opportunities(" + id + ")", { method: "PATCH", body: JSON.stringify({ [NUM_FIELD]: null }) });
      } catch (e) {
        console.warn("release duplicate number failed:", e);
      }
    }
    throw new NumberCollisionError("به دلیل برخورد مکرر با ایجاد هم‌زمان فرصت‌ها، شماره‌ی یکتا تأیید نشد.");
  }
  var oppNumberApi = {
    assign: assignOpportunityNumber,
    persianMonthOf,
    persianMonthBounds,
    numFormat,
    tehranMidnightUtc,
    PC,
    NUM_FIELD
  };

  // src/close/ui/icons.ts
  var ICONS = {
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5zm-2 16-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z"/></svg>',
    add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14"/></svg>',
    box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2m-5 12H9v-2h6zm5-7H4V4h16z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    error: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m1 15h-2v-2h2zm0-4h-2V7h2z"/></svg>',
    swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.99 11 3 15l3.99 4v-3H14v-2H6.99zM21 9l-3.99-4v3H10v2h7.01v3z"/></svg>',
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>',
    timer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 1H9v2h6zm-4 13h2V8h-2zm8.03-6.61 1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.96 8.96 0 0 0 12 4a9 9 0 1 0 9 9c0-2.12-.74-4.07-1.97-5.61M12 20a7 7 0 1 1 0-14 7 7 0 0 1 0 14"/></svg>',
    open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z"/></svg>'
  };

  // src/close/ui/styles.ts
  var CLOSE_CSS = `
      .dyx{--bg:#fff;--s2:#f5f6f9;--s3:#eceff4;--tx:#141922;--mu:#667085;--ln:#e4e7ec;
        --pr:#4f46e5;--pr-h:#4338ca;--on-pr:#fff;--pr-s:#eef0ff;
        --ok:#059669;--ok-h:#047857;--on-ok:#fff;--ok-s:#e6f6ef;
        --er:#d92d20;--er-s:#fdeceb;--wn:#a15c07;--wn-s:#fff4dc;
        --r1:8px;--r2:12px;--r3:16px;--r4:22px;
        --sh1:0 1px 2px rgba(16,24,40,.08);
        --sh:0 1px 3px rgba(16,24,40,.10),0 12px 28px -6px rgba(16,24,40,.22);
        --sh-lg:0 4px 8px -2px rgba(16,24,40,.10),0 32px 64px -12px rgba(16,24,40,.35);
        --ring:0 0 0 3px color-mix(in srgb,var(--pr) 28%,transparent);
        --font:Vazirmatn,"Segoe UI",Tahoma,sans-serif;
        font:14px/1.65 var(--font);color:var(--tx);direction:rtl;box-sizing:border-box;color-scheme:light}
      .dyx *,.dyx *::before,.dyx *::after{box-sizing:border-box}
      @media (prefers-color-scheme:dark){.dyx{--bg:#181b24;--s2:#1f2330;--s3:#282d3d;--tx:#eceff5;--mu:#98a2b3;--ln:#2e3445;
        --pr:#8b93ff;--pr-h:#a5abff;--on-pr:#10123a;--pr-s:#262a52;--ok:#34d399;--ok-h:#6ee7b7;--on-ok:#04251a;--ok-s:#173a2e;
        --er:#f97066;--er-s:#40201f;--wn:#fdb022;--wn-s:#3d3118;
        --sh:0 1px 3px rgba(0,0,0,.5),0 12px 28px -6px rgba(0,0,0,.6);--sh-lg:0 32px 64px -12px rgba(0,0,0,.7);color-scheme:dark}}
      .dyx svg{width:20px;height:20px;fill:currentColor;flex:none}
      .dyx button{font-family:var(--font)}

      /* ── action dock (bottom-left of every Dynamics page) ── */
      #dy-fab{position:fixed;left:20px;bottom:52px;z-index:2147483000;display:flex;flex-direction:column;align-items:stretch;gap:4px;
        min-width:190px;padding:6px;border:1px solid var(--ln);border-radius:var(--r4);background:var(--bg);box-shadow:var(--sh);animation:dyrise .25s ease}
      .dy-fb{display:flex;align-items:center;gap:10px;height:44px;padding:0 6px 0 14px;border:0;border-radius:var(--r3);background:transparent;color:var(--tx);
        font:600 13px var(--font);cursor:pointer;text-align:right;transition:background .15s,transform .1s}
      .dy-fb .ic{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:var(--s2);color:var(--mu);transition:background .15s,color .15s}
      .dy-fb .lbl{flex:1;white-space:nowrap}
      .dy-fb:hover{background:var(--s2)}.dy-fb:hover .ic{background:var(--s3);color:var(--tx)}
      .dy-fb:active{transform:scale(.98)}
      .dy-fb:focus-visible,.dy-fh:focus-visible,.dy-btn:focus-visible,.dy-x:focus-visible,.dy-sp-tab:focus-visible{outline:none;box-shadow:var(--ring)}
      .dy-fb.win{order:1;background:var(--ok);color:var(--on-ok)}.dy-fb.win .ic{background:rgba(255,255,255,.2);color:inherit}
      .dy-fb.win:hover{background:var(--ok-h)}.dy-fb.win:hover .ic{background:rgba(255,255,255,.28);color:inherit}
      .dy-fb.pri{order:1;background:var(--pr);color:var(--on-pr)}.dy-fb.pri .ic{background:rgba(255,255,255,.2);color:inherit}
      .dy-fb.pri:hover{background:var(--pr-h)}.dy-fb.pri:hover .ic{background:rgba(255,255,255,.28);color:inherit}
      .dy-fb.tonal{order:2}
      .dy-fh{order:9;height:22px;border:0;border-radius:var(--r1);background:transparent;color:var(--mu);cursor:pointer;display:grid;place-items:center;padding:0;opacity:.7}
      .dy-fh:hover{opacity:1;background:var(--s2)}.dy-fh svg{width:18px;height:18px}
      #dy-fab.min{min-width:0}#dy-fab.min .lbl{display:none}#dy-fab.min .dy-fb{width:44px;padding:0;justify-content:center}
      #dy-fab.min .dy-fb .ic{background:transparent}#dy-fab.min .dy-fb.win .ic,#dy-fab.min .dy-fb.pri .ic{background:transparent}

      /* ── dialog ── */
      #${DLG_ID}-bg{position:fixed;inset:0;z-index:2147483001;display:flex;align-items:center;justify-content:center;padding:16px;
        background:rgba(12,16,26,.55);backdrop-filter:blur(3px);animation:dyfade .15s ease}
      #${DLG_ID}{width:480px;max-width:100%;max-height:calc(100vh - 32px);display:flex;flex-direction:column;background:var(--bg);color:var(--tx);
        border:1px solid var(--ln);border-radius:var(--r4);box-shadow:var(--sh-lg);overflow:hidden;animation:dypop .2s cubic-bezier(.2,.8,.2,1);outline:none}
      #${DLG_ID}.wide{width:580px}
      .dy-hd{display:flex;align-items:center;gap:14px;padding:20px 22px 16px}
      .dy-hd>div{flex:1;min-width:0}
      .dy-hd h3{margin:0;font-size:17px;font-weight:800;line-height:1.4;letter-spacing:-.1px}
      .dy-sub{margin:1px 0 0;color:var(--mu);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .dy-badge{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;flex:none;
        background:linear-gradient(145deg,var(--pr-s),color-mix(in srgb,var(--pr) 22%,var(--pr-s)));color:var(--pr)}
      .dy-badge.ok{background:linear-gradient(145deg,var(--ok-s),color-mix(in srgb,var(--ok) 24%,var(--ok-s)));color:var(--ok)}
      .dy-badge svg{width:24px;height:24px}
      .dy-x{width:34px;height:34px;border:0;border-radius:50%;background:transparent;color:var(--mu);cursor:pointer;display:grid;place-items:center;padding:0;transition:background .15s}
      .dy-x:hover{background:var(--s2);color:var(--tx)}
      .dy-bd{padding:4px 22px 8px;overflow:auto}
      .dy-ft{display:flex;align-items:center;gap:10px;padding:14px 22px;margin-top:8px;border-top:1px solid var(--ln);background:var(--s2)}
      .dy-note{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;margin:0 0 16px;border-radius:var(--r2);background:var(--pr-s);
        color:color-mix(in srgb,var(--pr) 70%,var(--tx));font-size:12.5px;line-height:1.7}
      .dy-note svg{margin-top:2px}
      .dy-f{display:block;margin:0 0 16px}
      .dy-f>span{display:block;margin-bottom:6px;font-size:12.5px;font-weight:700;color:var(--mu)}
      .dy-f small{display:block;margin-top:5px;min-height:18px;color:var(--mu);font-size:12px}
      .dy-inp{position:relative;display:flex;align-items:center}
      .dyx input[type=text],.dyx textarea,.dyx select{width:100%;min-height:44px;padding:10px 14px;border:1px solid var(--ln);border-radius:var(--r2);background:var(--bg);color:var(--tx);
        font:inherit;box-shadow:var(--sh1);transition:border-color .15s,box-shadow .15s,background .15s}
      .dyx input:hover:not([disabled]):not(:focus),.dyx textarea:hover:not(:focus),.dyx select:hover:not(:focus){border-color:color-mix(in srgb,var(--mu) 45%,var(--ln))}
      .dyx input:focus,.dyx textarea:focus,.dyx select:focus{outline:none;border-color:var(--pr);box-shadow:var(--ring)}
      .dyx input[disabled]{background:var(--s2);color:var(--mu);box-shadow:none}
      .dyx input[type=checkbox]{accent-color:var(--pr)}
      .dy-inp input{padding-left:56px!important;direction:ltr;text-align:right;font-variant-numeric:tabular-nums;font-size:17px!important;font-weight:700}
      .dy-inp em{position:absolute;left:14px;font-style:normal;color:var(--mu);font-size:12.5px;font-weight:600;pointer-events:none}
      .dyx select{appearance:none;padding-left:38px;cursor:pointer;
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23667085'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
        background-repeat:no-repeat;background-position:left 10px center;background-size:20px}
      .dyx textarea{height:90px;direction:ltr;font-family:Consolas,monospace;font-size:12px;resize:vertical}
      .dy-adv{margin:2px 0 14px;border:1px solid var(--ln);border-radius:var(--r2);padding:0 14px;background:var(--s2)}
      .dy-adv summary{cursor:pointer;padding:10px 0;color:var(--pr);font-size:12.5px;font-weight:700}
      .dy-adv[open]{padding-bottom:12px}.dy-adv[open] summary{padding-bottom:4px}
      .dy-adv .dy-f{margin:10px 0 0}
      .dy-st{display:flex;align-items:flex-start;gap:9px;margin:0 0 14px;padding:11px 13px;border-radius:var(--r2);background:var(--pr-s);color:var(--tx);font-size:13px;white-space:pre-wrap}
      .dy-st[hidden]{display:none}
      .dy-st svg{margin-top:1px}
      .dy-st.err{background:var(--er-s);color:var(--er)}.dy-st.ok{background:var(--ok-s);color:var(--ok)}.dy-st.warn{background:var(--wn-s);color:var(--wn)}
      .dy-spin{width:18px;height:18px;border-radius:50%;border:2.5px solid color-mix(in srgb,var(--pr) 28%,transparent);border-top-color:var(--pr);
        animation:dyspin .7s linear infinite;flex:none;margin-top:1px}
      .dy-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 22px;border-radius:var(--r2);
        border:1px solid var(--ln);background:var(--bg);color:var(--tx);font:700 13.5px var(--font);cursor:pointer;box-shadow:var(--sh1);transition:background .15s,filter .15s,transform .1s}
      .dy-btn:hover{background:var(--s3)}.dy-btn:active{transform:scale(.98)}
      .dy-btn.pri{background:var(--pr);border-color:var(--pr);color:var(--on-pr)}.dy-btn.pri:hover{background:var(--pr-h);border-color:var(--pr-h)}
      .dy-btn.ok{background:var(--ok);border-color:var(--ok);color:var(--on-ok)}.dy-btn.ok:hover{background:var(--ok-h);border-color:var(--ok-h)}
      .dy-btn[disabled]{opacity:.55;cursor:progress;transform:none}
      .dy-ft .grow{flex:1}

      /* ── product search ── */
      .dy-sbox{position:relative}
      .dy-sbox svg{position:absolute;right:14px;top:50%;transform:translateY(-50%);color:var(--mu);pointer-events:none}
      .dy-sbox input{padding-right:44px!important;font-size:14.5px!important;min-height:46px!important}
      .dy-meta{display:flex;justify-content:space-between;margin:10px 4px 8px;color:var(--mu);font-size:12px;min-height:18px}
      #dy-plist{max-height:min(340px,45vh);overflow:auto;border:1px solid var(--ln);border-radius:var(--r3);background:var(--bg);padding:4px}
      #dy-plist .it{display:flex;align-items:center;gap:12px;padding:10px 12px;cursor:pointer;border-radius:var(--r2);transition:background .12s}
      #dy-plist .it:hover{background:var(--s2)}
      #dy-plist .it.sel{background:var(--pr-s);box-shadow:inset -3px 0 0 var(--pr)}
      #dy-plist .nm{flex:1;min-width:0;font-weight:700;overflow-wrap:anywhere}
      #dy-plist .cd{color:var(--mu);font-size:11.5px;direction:ltr;background:var(--s3);border-radius:var(--r1);padding:1px 8px;white-space:nowrap;font-family:Consolas,monospace}
      #dy-plist .pr{color:var(--tx);font-size:12.5px;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums;min-width:84px;text-align:left}
      #dy-plist .empty{padding:32px 14px;color:var(--mu);text-align:center}
      #dy-plist .sk{height:46px;margin:6px;border-radius:var(--r2);background:linear-gradient(90deg,var(--s2),var(--s3),var(--s2));background-size:200% 100%;animation:dyshim 1.2s linear infinite}
      #dy-plist.busy{opacity:.55;pointer-events:none}
      .dy-hint{color:var(--mu);font-size:12px;display:flex;gap:14px;align-items:center}
      .dy-hint kbd{font:11px Consolas,monospace;background:var(--bg);border:1px solid var(--ln);border-bottom-width:2px;border-radius:5px;padding:0 6px}

      /* ── session side panel ── */
      #dy-sp{position:fixed;top:0;right:0;bottom:0;z-index:2147482990;pointer-events:none}
      .dy-sp-tab{pointer-events:auto;position:absolute;right:0;top:42%;display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 8px;
        border:1px solid var(--ln);border-right:0;border-radius:var(--r3) 0 0 var(--r3);background:var(--bg);color:var(--tx);box-shadow:var(--sh);cursor:pointer;
        font:700 11.5px var(--font);transition:transform .2s,background .15s}
      .dy-sp-tab:hover{background:var(--s2)}
      .dy-sp-tab .ic{display:flex;flex-direction:column;align-items:center;gap:4px}
      .dy-sp-tab .dot,.dy-sp-card .dy-sp-live .dot{width:9px;height:9px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 4px color-mix(in srgb,var(--ok) 22%,transparent);animation:dypulse 1.6s ease infinite}
      .dy-sp-tab .cnt{font-size:12px;font-weight:800;color:var(--ok)}
      #dy-sp.open .dy-sp-tab{transform:translateX(100%);visibility:hidden}
      .dy-sp-panel{pointer-events:auto;position:absolute;top:0;right:0;bottom:0;width:360px;max-width:94vw;display:flex;flex-direction:column;background:var(--s2);
        border-left:1px solid var(--ln);box-shadow:-12px 0 40px rgba(16,24,40,.2);transform:translateX(105%);visibility:hidden;
        transition:transform .24s cubic-bezier(.2,.8,.2,1),visibility 0s .24s}
      #dy-sp.open .dy-sp-panel{transform:none;visibility:visible;transition:transform .24s cubic-bezier(.2,.8,.2,1)}
      .dy-sp-panel .dy-hd{background:var(--bg);border-bottom:1px solid var(--ln)}
      .dy-sp-panel .dy-bd{flex:1;padding:16px 18px}
      .dy-sp-panel .dy-btn{width:100%}
      .dy-sp-new{padding:16px;margin-bottom:18px;border:1px solid var(--ln);border-radius:var(--r3);background:var(--bg);box-shadow:var(--sh1)}
      .dy-sp-new .dy-f{margin-bottom:12px}
      .dy-sp-new .dy-st{margin-bottom:12px}
      .dy-sp-chk{display:flex;align-items:center;gap:8px;margin:0 0 14px;color:var(--mu);font-size:12.5px;cursor:pointer}
      .dy-sp-chk input{width:16px;height:16px;margin:0}
      .dy-sp-list{display:flex;flex-direction:column;gap:14px}
      .dy-sp-list:empty::before{content:"جلسهٔ فعالی وجود ندارد";display:block;padding:22px 10px;text-align:center;color:var(--mu);font-size:12.5px;border:1.5px dashed var(--ln);border-radius:var(--r3)}
      .dy-sp-card{position:relative;border:1px solid var(--ln);border-radius:var(--r3);padding:14px;background:var(--bg);box-shadow:var(--sh1);overflow:hidden;animation:dyrise .22s ease}
      .dy-sp-card::before{content:"";position:absolute;top:0;bottom:0;right:0;width:4px;background:var(--ok)}
      .dy-sp-live{display:flex;align-items:center;gap:8px;margin:0 0 12px;color:var(--ok)}
      .dy-sp-live .lb{font-size:12.5px;font-weight:800}
      .dy-sp-info{margin:0 0 12px;border-radius:var(--r2);background:var(--s2);overflow:hidden}
      .dy-sp-info div{display:flex;justify-content:space-between;gap:10px;padding:8px 12px;border-bottom:1px solid var(--ln);font-size:13px}
      .dy-sp-info div:last-child{border-bottom:0}
      .dy-sp-info .k{color:var(--mu);flex:none}
      .dy-sp-info .v{font-weight:700;text-align:left;overflow-wrap:anywhere;min-width:0}
      .dy-sp-info .v.ltr{direction:ltr;font-family:Consolas,monospace}
      .dy-sp-acts{display:flex;flex-direction:column;gap:8px}
      .dy-sp-row{display:flex;gap:8px;margin:0 0 10px}
      .dy-btn.danger{background:var(--bg);border-color:color-mix(in srgb,var(--er) 45%,var(--ln));color:var(--er)}
      .dy-btn.danger:hover{background:var(--er);border-color:var(--er);color:#fff}

      /* ── toast ── */
      #dy-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2147483002;display:flex;align-items:center;gap:10px;
        padding:11px 20px 11px 18px;border-radius:999px;background:#1b2030;color:#fff;box-shadow:var(--sh-lg);animation:dytoast .22s ease;max-width:90vw;font-weight:600}
      #dy-toast svg{color:#34d399}
      #dy-toast.err{background:#9f1c14}#dy-toast.err svg{color:#fff}
      #dy-toast span{white-space:pre-line}
      .dy-num{font:700 22px Consolas,monospace;direction:ltr;text-align:center;letter-spacing:2px}

      @keyframes dyfade{from{opacity:0}}
      @keyframes dypop{from{opacity:0;transform:translateY(10px) scale(.97)}}
      @keyframes dytoast{from{opacity:0;transform:translate(-50%,10px)}}
      @keyframes dyrise{from{opacity:0;transform:translateY(8px)}}
      @keyframes dyspin{to{transform:rotate(360deg)}}@keyframes dyshim{to{background-position:-200% 0}}
      @keyframes dypulse{50%{opacity:.4}}
      @media (prefers-reduced-motion:reduce){.dyx,.dyx *{animation:none!important;transition:none!important}}
    `;

  // src/close/ui/dom.ts
  var h = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  var groupDigits = (str) => {
    const c = toLatinDigits(str).replace(/[^\d.]/g, "");
    const parts = c.split(".");
    const i = parts[0].replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.length > 1 ? i + "." + parts[1].slice(0, 2) : i;
  };
  var parseAmount = (str) => {
    const c = toLatinDigits(str).replace(/[^\d.]/g, "");
    return c === "" ? 0 : Number(c);
  };
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    const s = document.createElement("style");
    s.id = CSS_ID;
    s.textContent = CLOSE_CSS;
    document.head.appendChild(s);
  }
  var toastTimer = 0;
  function toast(text, type, ms) {
    injectCss();
    document.getElementById("dy-toast")?.remove();
    const t = h(`<div id="dy-toast" class="dyx${type === "err" ? " err" : ""}" role="status"></div>`);
    t.innerHTML = (type === "err" ? ICONS.error : ICONS.check) + "<span></span>";
    t.lastChild.textContent = text;
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => t.remove(), ms || 4200);
  }
  function modal(o) {
    injectCss();
    document.getElementById(DLG_ID + "-bg")?.remove();
    const prev = document.activeElement;
    const bg = h(`<div id="${DLG_ID}-bg" class="dyx"><div id="${DLG_ID}" class="${o.wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="dy-t" tabindex="-1">
      <div class="dy-hd"><span class="dy-badge ${o.tone || ""}">${o.icon ? ICONS[o.icon] : ""}</span>
        <div><h3 id="dy-t"></h3><p class="dy-sub"></p></div>
        <button type="button" class="dy-x" aria-label="بستن">${ICONS.close}</button></div>
      <div class="dy-bd"></div><div class="dy-ft"></div></div></div>`);
    const box = bg.firstElementChild;
    bg.querySelector("h3").textContent = o.title;
    const sub = bg.querySelector(".dy-sub");
    if (o.sub) sub.textContent = o.sub;
    else sub.remove();
    const m = {
      bg,
      box,
      body: box.querySelector(".dy-bd"),
      foot: box.querySelector(".dy-ft"),
      locked: false,
      $: (selector) => bg.querySelector(selector),
      close() {
        if (m.locked) return;
        bg.remove();
        try {
          prev?.focus?.();
        } catch {
        }
        o.onClose?.();
      }
    };
    bg.querySelector(".dy-x").onclick = m.close;
    bg.addEventListener("mousedown", (e) => {
      if (e.target === bg) m.close();
    });
    bg.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        m.close();
        return;
      }
      if (e.key === "Tab") {
        const f = [...box.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea,summary,[tabindex="0"]')].filter((x) => x.offsetParent);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
    bg.addEventListener("keyup", (e) => e.stopPropagation());
    bg.addEventListener("keypress", (e) => e.stopPropagation());
    document.body.appendChild(bg);
    return m;
  }
  function setStatus(el, text, kind = "") {
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.className = "dy-st" + (kind === "err" || kind === "ok" || kind === "warn" ? " " + kind : "");
    el.innerHTML = (kind === "busy" ? '<span class="dy-spin"></span>' : kind === "err" ? ICONS.error : kind === "ok" ? ICONS.check : "") + "<span></span>";
    el.lastChild.textContent = text;
  }

  // src/close/create-dialog.ts
  async function getCurrencyId() {
    try {
      const us = requireXrm().Utility.getGlobalContext().userSettings;
      if (us.transactionCurrency?.id) return cleanId(us.transactionCurrency.id);
      const u = await api("systemusers(" + cleanId(us.userId) + ")?$select=_transactioncurrencyid_value");
      return u._transactioncurrencyid_value || null;
    } catch {
      return null;
    }
  }
  async function newOpportunityBody(name, description) {
    const body = { name };
    if (description) body.description = description;
    const cur = await getCurrencyId();
    if (cur) body["transactioncurrencyid@odata.bind"] = "/transactioncurrencies(" + cur + ")";
    return body;
  }
  var isolate = (s) => "⁦" + s + "⁩";
  function showNumberFailure(m, oppId, err, onDone) {
    m.locked = false;
    m.box.querySelector("h3").textContent = "فرصت ایجاد شد، اما شماره‌گذاری ناموفق بود";
    const sub = m.box.querySelector(".dy-sub");
    if (sub) sub.textContent = "فرصت حذف نشده است";
    m.body.innerHTML = '<div class="dy-st err" id="dy-num-err" role="alert"></div><label class="dy-f"><span>شناسه فرصت (GUID)</span><input id="dy-num-id" type="text" readonly style="direction:ltr;text-align:left"></label><div class="dy-st" id="dy-num-msg" role="status" aria-live="polite" hidden></div>';
    m.body.querySelector("#dy-num-id").value = oppId;
    m.foot.innerHTML = '<button type="button" class="dy-btn pri" id="dy-num-retry"><span>تلاش مجدد برای ثبت شماره</span></button><button type="button" class="dy-btn" id="dy-num-open"><span>باز کردن فرصت</span></button><span class="grow"></span><button type="button" class="dy-btn" id="dy-num-close">بستن</button>';
    const $ = m.$;
    const paint = (e) => setStatus(
      $("#dy-num-err"),
      "فرصت ایجاد شد، اما شماره‌ی ماهانه‌ی آن ثبت نشد.\nشناسه فرصت: " + isolate(oppId) + "\nعلت: " + errorMessage(e) + "\nبرای ثبت شماره، روی «تلاش مجدد» کلیک کنید.",
      "err"
    );
    paint(err);
    console.warn("opportunity number assignment failed:", oppId, err);
    $("#dy-num-close").onclick = m.close;
    $("#dy-num-open").onclick = () => {
      m.close();
      void requireXrm().Navigation.openForm({ entityName: "opportunity", entityId: oppId });
    };
    $("#dy-num-retry").onclick = async () => {
      const b = $("#dy-num-retry");
      b.disabled = true;
      m.locked = true;
      setStatus($("#dy-num-msg"), "در حال ثبت شماره‌ی فرصت...", "busy");
      let res;
      try {
        res = await assignOpportunityNumber(oppId);
      } catch (e) {
        m.locked = false;
        b.disabled = false;
        setStatus($("#dy-num-msg"), "");
        paint(e);
        console.warn("retry failed:", e);
        return;
      }
      onDone(res);
    };
    setTimeout(() => m.bg.querySelector("#dy-num-retry")?.focus(), 30);
  }
  function openCreateDialog() {
    const m = modal({ title: "فرصت تجاری جدید", sub: "ایجاد و ذخیرهٔ فوری، بدون نیاز به زدن Save", icon: "add" });
    m.body.innerHTML = `
      <label class="dy-f"><span>موضوع</span><input id="dy-new-name" type="text" autocomplete="off"></label>
      <label class="dy-f"><span>شرح (اختیاری)</span><input id="dy-new-desc" type="text" autocomplete="off"></label>
      <div class="dy-st" id="dy-new-msg" role="status" aria-live="polite" hidden></div>`;
    m.foot.innerHTML = `<button type="button" class="dy-btn pri" id="dy-new-ok">${ICONS.add}<span>ایجاد</span></button><button type="button" class="dy-btn" id="dy-new-cancel">لغو</button>`;
    const $ = m.$;
    const nameInput = $("#dy-new-name");
    nameInput.value = "فرصت تجاری در تاریخ " + formatJalali(/* @__PURE__ */ new Date());
    $("#dy-new-cancel").onclick = m.close;
    setTimeout(() => {
      nameInput.focus();
      nameInput.select();
    }, 30);
    m.box.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.tagName === "INPUT") {
        e.preventDefault();
        $("#dy-new-ok").click();
      }
    });
    $("#dy-new-ok").onclick = async () => {
      const btn = $("#dy-new-ok");
      const name = nameInput.value.trim();
      if (!name) {
        setStatus($("#dy-new-msg"), "موضوع فرصت را وارد کنید.", "err");
        nameInput.focus();
        return;
      }
      btn.disabled = true;
      m.locked = true;
      setStatus($("#dy-new-msg"), "در حال ایجاد فرصت...", "busy");
      try {
        const body = await newOpportunityBody(name, $("#dy-new-desc").value);
        const rec = await api("opportunities", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
        const oppId = cleanId(rec.opportunityid);
        const done = (r) => {
          m.locked = false;
          m.close();
          toast("فرصت با موفقیت ایجاد شد\nشماره فرصت: " + isolate(r.number), "ok", 7e3);
          void requireXrm().Navigation.openForm({ entityName: "opportunity", entityId: oppId });
        };
        setStatus($("#dy-new-msg"), "فرصت ایجاد شد. در حال ثبت شماره‌ی فرصت...", "busy");
        let res;
        try {
          res = await assignOpportunityNumber(oppId);
        } catch (ne) {
          showNumberFailure(m, oppId, ne, done);
          return;
        }
        done(res);
      } catch (e) {
        m.locked = false;
        btn.disabled = false;
        setStatus($("#dy-new-msg"), "ایجاد فرصت ناموفق بود: " + errorMessage(e), "err");
      }
    };
  }

  // src/close/stages.ts
  var isEmpty = (v) => v === null || v === void 0 || v === "" || Array.isArray(v) && v.length === 0;
  var hasProcess = () => {
    const fc = getFC();
    try {
      return !!fc?.data.process?.getActiveStage?.();
    } catch {
      return false;
    }
  };
  var activeProcess = (fc) => {
    const p = fc.data.process;
    return p?.getActiveStage?.() ? p : null;
  };
  var oppUrl = (id) => "opportunities(" + id + ")";
  var patchOpp = (id, body) => api(oppUrl(id), { method: "PATCH", body: JSON.stringify(body) });
  function fillStage(fc, stage, defaults, patch, leftover) {
    const stageName = stage.getName();
    const missing = [];
    (stage.getSteps() || []).forEach((step) => {
      const name = step.getAttribute?.();
      if (!name) return;
      const label = step.getName ? step.getName() : name;
      const required = typeof step.isRequired === "function" ? step.isRequired() : !!step.required;
      const hasDefault = defaults && defaults[name] !== void 0;
      const attr = fc.getAttribute(name);
      if (attr) {
        const isBool = attr.getAttributeType() === "boolean";
        let val;
        if (isBool) {
          val = hasDefault ? defaults[name] : true;
          if (attr.getValue() === val) return;
        } else if (!isEmpty(attr.getValue())) {
          return;
        } else if (hasDefault) {
          val = defaults[name];
        }
        if (val !== void 0) {
          attr.setValue(val);
          attr.fireOnChange?.();
          return;
        }
      } else if (hasDefault) {
        patch[name] = defaults[name];
        return;
      }
      if (required) missing.push(label);
      else leftover.push(label + " (" + name + ")");
    });
    if (missing.length) {
      throw new Error("فیلدهای اجباری مرحله «" + stageName + "» خالی است: " + missing.join("، ") + "\nمی‌توانید مقدار پیش‌فرض آن‌ها را در بخش تنظیمات مراحل وارد کنید.");
    }
  }
  var logLeftover = (leftover) => {
    if (leftover.length) console.info("DY Easy Close: steps left empty (add them to the stage settings JSON by logical name):", leftover);
  };
  async function fillAndAdvanceStages(fc, defaults, setStatus2) {
    const process = activeProcess(fc);
    if (!process) return;
    const oppId = () => cleanId(fc.data.entity.getId());
    const patch = {};
    const leftover = [];
    for (let guard = 0; guard < 15; guard++) {
      const stage = process.getActiveStage();
      const stageName = stage.getName();
      setStatus2("مرحله: " + stageName);
      fillStage(fc, stage, defaults, patch, leftover);
      const path = process.getActivePath();
      const last = path.get(path.getLength() - 1);
      if (stage.getId() === last.getId()) break;
      if (Object.keys(patch).length) {
        await patchOpp(oppId(), patch);
        Object.keys(patch).forEach((k) => delete patch[k]);
      }
      if (fc.data.getIsDirty()) {
        try {
          await fc.data.save();
        } catch (e) {
          throw new Error("ذخیره فرم قبل از رفتن به مرحله بعد ناموفق بود: " + errorMessage(e));
        }
        await sleep(300);
      }
      const stageIdBefore = stage.getId();
      const result = await new Promise((res) => process.moveNext((r) => res(r)));
      if (result !== "success" && result !== "end") {
        throw new Error("رفتن به مرحله بعد ناموفق بود (" + result + ") در مرحله «" + stageName + "»");
      }
      await sleep(600);
      const after = process.getActiveStage();
      if (!after || after.getId() === stageIdBefore) {
        throw new Error("مرحله‌ی فعال تغییر نکرد؛ فرایند در مرحله «" + stageName + "» متوقف شد.");
      }
    }
    if (Object.keys(patch).length) await patchOpp(oppId(), patch);
    await fc.data.save().then(() => void 0, () => void 0);
    logLeftover(leftover);
  }
  async function closeDirect(fc, id, defaults, setStatus2) {
    const proc = activeProcess(fc);
    if (!proc) return;
    const path = proc.getActivePath();
    const lastStage = path.get(path.getLength() - 1);
    const lastId = cleanId(lastStage.getId());
    setStatus2("مرحله‌ی نهایی: " + lastStage.getName());
    const patch = {};
    const leftover = [];
    fillStage(fc, lastStage, defaults, patch, leftover);
    if (Object.keys(patch).length) await patchOpp(id, patch);
    if (fc.data.getIsDirty()) {
      try {
        await fc.data.save();
      } catch (e) {
        throw new Error("ذخیره فرم ناموفق بود: " + errorMessage(e));
      }
      await sleep(300);
    }
    const ctx = await loadStageContext(fc, id);
    if (ctx.activeId !== lastId) {
      setStatus2("انتقال مستقیم به مرحله «" + lastStage.getName() + "»...");
      await moveToStageDirect(fc, ctx, lastId);
    }
    logLeftover(leftover);
  }
  async function finishProcess(fc, id, apiOnly) {
    try {
      const process = fc.data.process;
      if (!apiOnly && process?.setStatus) {
        await new Promise((res) => process.setStatus("finished", res));
      }
    } catch (e) {
      console.warn("process.setStatus:", e);
    }
    try {
      const r = await api(
        "opportunitysalesprocesses?$select=businessprocessflowinstanceid&$filter=_opportunityid_value eq " + id + " and statecode eq 0"
      );
      for (const x of r.value) {
        await api("opportunitysalesprocesses(" + x.businessprocessflowinstanceid + ")", {
          method: "PATCH",
          body: JSON.stringify({ statecode: 1, statuscode: 2 })
          // Finished
        });
      }
    } catch (e) {
      console.warn("finish BPF via API:", e);
    }
  }
  async function assertProcessFinished(id) {
    const r = await api(
      "opportunitysalesprocesses?$select=businessprocessflowinstanceid&$filter=" + encodeURIComponent("_opportunityid_value eq " + id + " and statecode eq 0")
    );
    if (r.value && r.value.length) throw new Error("فرایند کسب‌وکار هنوز فعال است؛ فرصت برنده نشد.");
  }
  async function loadStageContext(fc, oppId) {
    const proc = fc.data.process;
    let activeProc = "";
    try {
      const ap = proc.getActiveProcess?.();
      if (ap) activeProc = cleanId(ap.getId());
    } catch {
    }
    const r = await api(
      "opportunitysalesprocesses?$select=businessprocessflowinstanceid,_activestageid_value,_processid_value,traversedpath&$filter=" + encodeURIComponent("_opportunityid_value eq " + oppId + " and statecode eq 0")
    );
    const list = r.value || [];
    if (!list.length) throw new Error("نمونه‌ی فعال فرایند کسب‌وکار برای این فرصت پیدا نشد.");
    const inst = list.find((x) => cleanId(x._processid_value || "") === activeProc) || list[0];
    const procId = cleanId(inst._processid_value || "");
    const defs = (await api(
      "processstages?$select=processstageid,stagename&$filter=" + encodeURIComponent("_processid_value eq " + procId)
    )).value || [];
    const defIds = new Set(defs.map((d) => cleanId(d.processstageid)));
    const stages = [];
    const path = proc.getActivePath();
    for (let i = 0; i < path.getLength(); i++) {
      const st = path.get(i);
      const sid = cleanId(st.getId());
      if (defIds.size && !defIds.has(sid)) continue;
      stages.push({ id: sid, name: st.getName() });
    }
    if (!stages.length) throw new Error("مراحل فرایند کسب‌وکار پیدا نشد.");
    return { inst, stages, activeId: cleanId(inst._activestageid_value || "") };
  }
  async function readActiveStage(instId) {
    const r = await api("opportunitysalesprocesses(" + instId + ")?$select=_activestageid_value");
    return cleanId(r._activestageid_value || "");
  }
  async function moveToStageDirect(fc, ctx, targetId) {
    const instId = ctx.inst.businessprocessflowinstanceid;
    const traversed = String(ctx.inst.traversedpath || "").split(",").map(cleanId).filter(Boolean);
    const at = traversed.indexOf(targetId);
    const newPath = (at >= 0 ? traversed.slice(0, at + 1) : traversed.concat(targetId)).join(",");
    let method = "api";
    let apiErr = null;
    try {
      await api("opportunitysalesprocesses(" + instId + ")", {
        method: "PATCH",
        body: JSON.stringify({ "activestageid@odata.bind": "/processstages(" + targetId + ")", traversedpath: newPath })
      });
    } catch (e) {
      apiErr = e instanceof Error ? e : new Error(String(e));
    }
    let now = apiErr ? "" : await readActiveStage(instId);
    if (apiErr || now !== targetId) {
      method = "client";
      const res = await new Promise((r) => fc.data.process.setActiveStage("{" + targetId + "}", (x) => r(x)));
      if (res !== "success") throw new Error("انتقال به مرحله ناموفق بود (" + res + ")" + (apiErr ? "\n" + apiErr.message : ""));
      now = await readActiveStage(instId);
    }
    if (now !== targetId) throw new Error("بعد از انتقال، مرحله‌ی فعال در CRM تغییر نکرده است.");
    return method;
  }

  // src/close/storage.ts
  var lsGet = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  var lsSet = (key, value) => {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
    }
  };

  // src/close/win-dialog.ts
  async function winOpportunity(id, revenue, description) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await api("WinOpportunity", {
      method: "POST",
      body: JSON.stringify({
        Status: 3,
        // Won
        OpportunityClose: {
          subject: "Won - " + now.slice(0, 10),
          "opportunityid@odata.bind": "/opportunities(" + id + ")",
          actualrevenue: Number(revenue),
          actualend: now,
          description: description || ""
        }
      })
    });
  }
  var primaryName = (fc) => {
    try {
      return fc.data.entity.getPrimaryAttributeValue ? fc.data.entity.getPrimaryAttributeValue() : "";
    } catch {
      return "";
    }
  };
  async function openDialog() {
    const fc = getFC();
    if (!fc) return;
    const id = cleanId(fc.data.entity.getId());
    const oppName = primaryName(fc);
    let revenue = 0;
    let hasEstClose = false;
    try {
      const o = await api("opportunities(" + id + ")?$select=totalamount,estimatedvalue,statecode,estimatedclosedate");
      if (o.statecode !== 0) {
        toast("این فرصت قبلاً بسته شده است.", "err");
        return;
      }
      revenue = o.totalamount || o.estimatedvalue || 0;
      hasEstClose = !!o.estimatedclosedate;
    } catch {
    }
    const saved = lsGet(LS_KEY) || "{}";
    const m = modal({ title: "بستن فرصت به عنوان برنده", sub: oppName, icon: "check", tone: "ok" });
    m.body.innerHTML = `
      <div class="dy-note">${ICONS.check}<span>با تایید، فرایند مستقیماً به مرحلهٔ آخر می‌رود و تکمیل می‌شود و فرصت با وضعیت «برنده» بسته می‌شود.</span></div>
      <label class="dy-f"><span>درآمد واقعی</span>
        <div class="dy-inp"><input id="dy-rev" type="text" inputmode="numeric" autocomplete="off"><em>ریال</em></div>
        <small id="dy-rev-h"></small></label>
      <label class="dy-f"><span>تاریخ اتمام</span><input id="dy-date" type="text" value="${formatJalali(/* @__PURE__ */ new Date())}" disabled></label>
      <label class="dy-f"><span>شرح (اختیاری)</span><input id="dy-desc" type="text" autocomplete="off"></label>
      <details class="dy-adv"><summary>تنظیمات پیشرفته مراحل</summary>
        <label class="dy-f" style="display:flex;gap:8px;align-items:flex-start;margin-top:8px"><input id="dy-seq" type="checkbox" style="margin-top:4px"><span style="margin:0;font-weight:400">تکمیل مرحله‌به‌مرحله (همهٔ مراحل میانی طی می‌شوند؛ ورک‌فلوی هر مرحله، مثل پیامک، برای هرکدام اجرا می‌شود)</span></label>
        <label class="dy-f"><span>مقدار پیش‌فرض فیلدهای اجباری (JSON: نام منطقی فیلد ← مقدار)</span>
          <textarea id="dy-defaults" placeholder='{"description":"ok"}'></textarea></label>
      </details>
      <div class="dy-st" id="dy-msg" role="status" aria-live="polite" hidden></div>`;
    m.foot.innerHTML = `<button type="button" class="dy-btn ok" id="dy-ok">${ICONS.check}<span>تایید و بستن</span></button><button type="button" class="dy-btn" id="dy-cancel">لغو</button>`;
    const $ = m.$;
    $("#dy-defaults").value = saved;
    $("#dy-seq").checked = lsGet(SEQ_KEY) === "1";
    const rev = $("#dy-rev");
    const msg = (t, kind) => setStatus($("#dy-msg"), t, kind);
    let zeroWarned = false;
    const hint = () => {
      const v = parseAmount(rev.value);
      $("#dy-rev-h").textContent = v ? faNum(v) + " ریال  ·  " + faNum(Math.round(v / 10)) + " تومان" : "مبلغ نهایی فروش را وارد کنید";
    };
    rev.value = groupDigits(String(revenue));
    hint();
    rev.addEventListener("input", () => {
      rev.value = groupDigits(rev.value);
      hint();
      msg("");
      zeroWarned = false;
    });
    $("#dy-cancel").onclick = m.close;
    m.box.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.tagName === "INPUT") {
        e.preventDefault();
        $("#dy-ok").click();
      }
    });
    setTimeout(() => {
      rev.focus();
      rev.select();
    }, 30);
    $("#dy-ok").onclick = async () => {
      let defaults = {};
      const raw = $("#dy-defaults").value.trim();
      if (raw) {
        try {
          defaults = JSON.parse(raw);
        } catch {
          $(".dy-adv").open = true;
          return msg("JSON تنظیمات مراحل معتبر نیست.", "err");
        }
        lsSet(LS_KEY, raw);
      }
      const amount = parseAmount(rev.value);
      if (isNaN(amount) || amount < 0) return msg("درآمد واقعی معتبر نیست.", "err");
      if (amount === 0 && !zeroWarned) {
        zeroWarned = true;
        rev.focus();
        return msg("درآمد واقعی صفر است. اگر درست است، دوباره «تایید و بستن» را بزنید.", "warn");
      }
      m.locked = true;
      m.box.querySelectorAll("input,textarea,button").forEach((x) => {
        x.disabled = true;
      });
      try {
        const seq2 = $("#dy-seq").checked;
        lsSet(SEQ_KEY, seq2 ? "1" : "0");
        const status = (t) => msg(t, "busy");
        if (seq2) await fillAndAdvanceStages(fc, defaults, status);
        else await closeDirect(fc, id, defaults, status);
        msg("در حال پایان دادن به فرایند...", "busy");
        await finishProcess(fc, id, !seq2);
        await assertProcessFinished(id);
        msg("در حال بستن فرصت...", "busy");
        if (!hasEstClose) {
          try {
            await api("opportunities(" + id + ")", { method: "PATCH", body: JSON.stringify({ estimatedclosedate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) }) });
          } catch (e) {
            console.warn("estimatedclosedate not set:", e);
          }
        }
        await winOpportunity(id, amount, $("#dy-desc").value);
        msg("فرصت با موفقیت به عنوان برنده بسته شد.", "ok");
        await sleep(700);
        m.locked = false;
        m.close();
        toast("فرصت به عنوان برنده بسته شد.");
        void requireXrm().Navigation.openForm({ entityName: "opportunity", entityId: id });
      } catch (e) {
        m.locked = false;
        m.box.querySelectorAll("input:not(#dy-date),textarea,button").forEach((x) => {
          x.disabled = false;
        });
        msg(errorMessage(e) + "\nفرصت برنده نشد. برای ادامه دوباره «تایید و بستن» را بزنید؛ فرایند از مرحله‌ی فعال فعلی ادامه می‌یابد.", "err");
      }
    };
  }

  // src/close/products.ts
  var FA = "۰۱۲۳۴۵۶۷۸۹";
  var AR = "٠١٢٣٤٥٦٧٨٩";
  var fmt = (n) => Number(n || 0).toLocaleString("en-US");
  var normQ = (s) => String(s || "").toLowerCase().replace(/[يىئ]/g, "ی").replace(/ك/g, "ک").replace(/[ۀة]/g, "ه").replace(/[أإآ]/g, "ا").replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d))).replace(/[\u200c\u200b\u0640\u064b-\u065f]/g, "").replace(/\s+/g, " ").trim();
  var productCache = null;
  var productLoading = null;
  function loadProducts() {
    if (productCache) return Promise.resolve(productCache);
    if (productLoading) return productLoading;
    productLoading = (async () => {
      const hdr = {
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Accept: "application/json",
        Prefer: 'odata.maxpagesize=5000, odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
      };
      let url = clientUrl() + "/api/data/v9.1/products?$select=productid,name,productnumber,price,_defaultuomid_value&$filter=statecode eq 0&$orderby=name asc";
      const out = [];
      while (url) {
        const res = await fetch(url, { credentials: "same-origin", headers: hdr });
        if (!res.ok) throw new Error(res.status + " " + res.statusText);
        const j = await res.json();
        for (const p of j.value || []) {
          out.push({
            id: p.productid,
            name: p.name || "",
            num: p.productnumber || "",
            price: p.price,
            uom: p._defaultuomid_value || null,
            uomName: p["_defaultuomid_value@OData.Community.Display.V1.FormattedValue"] || "",
            key: normQ(p.name + " " + (p.productnumber || "")),
            nameKey: normQ(p.name)
          });
        }
        url = j["@odata.nextLink"] || null;
      }
      productCache = out;
      return out;
    })();
    productLoading.catch(() => {
      productLoading = null;
    });
    return productLoading;
  }
  function warmProductCache() {
    if (!productCache && !productLoading) loadProducts().catch(() => void 0);
  }
  function searchProducts(list, q) {
    const toks = normQ(q).split(" ").filter(Boolean);
    if (!toks.length) return list.slice(0, 40);
    const res = [];
    for (const p of list) {
      let score = 0;
      let ok = true;
      for (const t of toks) {
        const i = p.key.indexOf(t);
        if (i < 0) {
          ok = false;
          break;
        }
        score += i === 0 || p.key[i - 1] === " " ? 3 : 1;
      }
      if (!ok) continue;
      if (p.nameKey.startsWith(toks[0])) score += 5;
      if (p.nameKey === toks.join(" ")) score += 10;
      res.push({ p, score: score - p.nameKey.length / 1e3 });
    }
    res.sort((a, b) => b.score - a.score);
    return res.slice(0, 40).map((r) => r.p);
  }
  async function openProductSearch() {
    const fc = getFC();
    if (!fc) return;
    const oppId = cleanId(fc.data.entity.getId());
    const oppName = primaryName(fc);
    const m = modal({ title: "افزودن محصول به فرصت", sub: oppName, icon: "box", wide: true });
    m.body.innerHTML = `
      <div class="dy-sbox">${ICONS.search}<input id="dy-ps-q" type="text" role="combobox" aria-controls="dy-plist" aria-expanded="true"
        placeholder="نام یا کد محصول؛ چند کلمه را با فاصله بنویسید..." autocomplete="off"></div>
      <div class="dy-meta"><span id="dy-ps-n"></span><span id="dy-ps-msg"></span></div>
      <div id="dy-plist" role="listbox"><div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>`;
    m.foot.innerHTML = '<span class="dy-hint"><span><kbd>↑</kbd> <kbd>↓</kbd> انتخاب</span><span><kbd>Enter</kbd> افزودن</span><span><kbd>Esc</kbd> بستن</span></span><span class="grow"></span><button type="button" class="dy-btn" id="dy-ps-cancel">بستن</button>';
    const $ = m.$;
    $("#dy-ps-cancel").onclick = m.close;
    const input = $("#dy-ps-q");
    setTimeout(() => input.focus(), 30);
    let items = [];
    let sel = 0;
    const listEl = $("#dy-plist");
    const countEl = $("#dy-ps-n");
    const note = (t) => {
      $("#dy-ps-msg").textContent = t || "";
    };
    const render = () => {
      if (!items.length) {
        listEl.innerHTML = '<div class="empty">محصولی پیدا نشد.<br><small>املا را بررسی کنید یا عبارت کوتاه‌تری بنویسید.</small></div>';
        countEl.textContent = "";
        return;
      }
      countEl.textContent = items.length >= 40 ? "۴۰ نتیجهٔ اول؛ برای محدودتر شدن بیشتر تایپ کنید" : faNum(items.length) + " نتیجه";
      listEl.innerHTML = items.map((p, i) => `<div class="it${i === sel ? " sel" : ""}" role="option" aria-selected="${i === sel}" data-i="${i}"><span class="nm">${esc(p.name)}</span>${p.num ? `<span class="cd">${esc(p.num)}</span>` : ""}<span class="pr">${p.price ? fmt(p.price) : ""}</span></div>`).join("");
      listEl.querySelector(".it.sel")?.scrollIntoView({ block: "nearest" });
    };
    const update = () => {
      if (!productCache) return;
      items = searchProducts(productCache, input.value);
      sel = 0;
      render();
    };
    async function resolvePrice(p) {
      try {
        const o = await api("opportunities(" + oppId + ")?$select=_pricelevelid_value");
        const pl = o._pricelevelid_value;
        if (pl) {
          const r = await api("productpricelevels?$select=amount&$top=1&$filter=_productid_value eq " + p.id + " and _pricelevelid_value eq " + pl + (p.uom ? " and _uomid_value eq " + p.uom : ""));
          if (r.value.length && r.value[0].amount != null) return r.value[0].amount;
        }
      } catch (e) {
        console.warn("price lookup:", e);
      }
      return p.price;
    }
    let picking = false;
    const pick = async (p) => {
      if (!p || picking) return;
      picking = true;
      listEl.classList.add("busy");
      note("در حال دریافت قیمت...");
      const price = await resolvePrice(p);
      m.close();
      const params = {
        productid: p.id,
        productidname: p.name,
        productidtype: "product",
        opportunityid: oppId,
        opportunityidname: oppName || "",
        opportunityidtype: "opportunity",
        quantity: 1
      };
      if (price != null) params.priceperunit = price;
      if (p.uom) {
        params.uomid = p.uom;
        params.uomidname = p.uomName;
        params.uomidtype = "uom";
      }
      requireXrm().Navigation.openForm({
        entityName: "opportunityproduct",
        useQuickCreateForm: true,
        createFromEntity: { entityType: "opportunity", id: oppId, name: oppName || "" }
      }, params).then(() => {
        try {
          if (!fc.data.getIsDirty()) void fc.data.refresh(false);
        } catch {
        }
      }, (e) => {
        console.warn("quick create:", e);
        toast("باز کردن فرم محصول ناموفق بود.", "err");
      });
    };
    listEl.addEventListener("mousedown", (e) => {
      const it = e.target.closest(".it");
      if (it) {
        e.preventDefault();
        void pick(items[Number(it.dataset.i)]);
      }
    });
    input.addEventListener("input", update);
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        sel = Math.min(sel + 1, items.length - 1);
        render();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        sel = Math.max(sel - 1, 0);
        render();
      } else if (e.key === "Enter") {
        e.preventDefault();
        void pick(items[sel]);
      }
    });
    try {
      await loadProducts();
      update();
    } catch (e) {
      listEl.innerHTML = '<div class="empty">بارگذاری محصولات ناموفق بود:<br>' + esc(errorMessage(e)) + "</div>";
    }
  }
  // "Tax manually set" defaults to Yes. Xrm form API only (no DOM query, no click, no MutationObserver).
  function ensureTaxYes() {
    try {
      const attr = getFC()?.getAttribute?.("bmsd_istaxmanualyset");
      if (attr && attr.getValue() !== true) attr.setValue(true);
    } catch {
    }
  }

  // src/session-manager/clock.ts
  var activeMsAt = (rec, now) => rec.activeMs + (rec.state === "RUNNING" && rec.runningSince !== null ? Math.max(0, now - rec.runningSince) : 0);

  // src/session-manager/types.ts
  var TERMINAL_STATES = ["COMPLETED", "FAILED", "CANCELLED"];
  var isTerminal = (s) => TERMINAL_STATES.includes(s);
  var SmError = class extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
      this.name = "SmError";
    }
  };

  // src/session-manager/client.ts
  var SM_ATTR = "data-dy-sm";
  var SM_REQ_EVT = "dy-sm-req";
  var SM_RES_EVT = "dy-sm-res";
  var SM_CHG_EVT = "dy-sm-changed";
  var smAvailable = () => typeof document !== "undefined" && document.documentElement.hasAttribute(SM_ATTR);
  var seq = 0;
  var newCorrelationId = () => `c${Date.now().toString(36)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  function smCall(op, sessionId, payload, timeoutMs = 5e3) {
    if (!smAvailable()) return Promise.reject(new SmError("UNAVAILABLE", "مدیر جلسه در دسترس نیست."));
    const correlationId = newCorrelationId();
    const req = { v: 1, op, sessionId, ts: Date.now(), correlationId, payload };
    return new Promise((resolve, reject) => {
      const done = (fn) => {
        clearTimeout(timer);
        document.removeEventListener(SM_RES_EVT, onRes);
        fn();
      };
      const onRes = (e) => {
        let res;
        try {
          res = JSON.parse(String(e.detail));
        } catch {
          return;
        }
        if (!res || res.correlationId !== correlationId) return;
        done(() => res.ok ? resolve(res.data) : reject(new SmError(res.code, res.message)));
      };
      const timer = setTimeout(() => done(() => reject(new SmError("UNAVAILABLE", "مدیر جلسه پاسخ نمی‌دهد."))), timeoutMs);
      document.addEventListener(SM_RES_EVT, onRes);
      document.dispatchEvent(new CustomEvent(SM_REQ_EVT, { detail: JSON.stringify(req) }));
    });
  }
  function smOnChange(fn) {
    document.addEventListener(SM_CHG_EVT, fn);
    return () => document.removeEventListener(SM_CHG_EVT, fn);
  }

  // src/session-manager/registry.ts
  var OPPORTUNITY_SESSION_TYPE = "opportunity-meeting";

  // src/session-manager/scheduler.ts
  var SessionScheduler = class {
    timers = /* @__PURE__ */ new Map();
    every(sessionId, name, ms, fn, running = true) {
      this.clear(sessionId, name);
      const e = { fn, ms, handle: null };
      if (!this.timers.has(sessionId)) this.timers.set(sessionId, /* @__PURE__ */ new Map());
      this.timers.get(sessionId).set(name, e);
      if (running) e.handle = setInterval(fn, ms);
    }
    suspend(sessionId) {
      for (const e of this.timers.get(sessionId)?.values() ?? []) if (e.handle) {
        clearInterval(e.handle);
        e.handle = null;
      }
    }
    resume(sessionId) {
      for (const e of this.timers.get(sessionId)?.values() ?? []) if (!e.handle) e.handle = setInterval(e.fn, e.ms);
    }
    clear(sessionId, name) {
      const m = this.timers.get(sessionId);
      if (!m) return;
      for (const [n, e] of [...m]) if (!name || n === name) {
        if (e.handle) clearInterval(e.handle);
        m.delete(n);
      }
      if (!m.size) this.timers.delete(sessionId);
    }
    has(sessionId) {
      return this.timers.has(sessionId);
    }
    ids() {
      return [...this.timers.keys()];
    }
    isActive(sessionId) {
      return [...this.timers.get(sessionId)?.values() ?? []].some((e) => e.handle !== null);
    }
  };

  // src/session-manager/state-machine.ts
  var allowedActions = (s) => ({
    pause: s === "RUNNING",
    resume: s === "PAUSED" || s === "RECOVERY_REQUIRED",
    cancel: s === "RUNNING" || s === "PAUSED" || s === "RECOVERY_REQUIRED" || s === "IDLE",
    end: s === "RUNNING" || s === "RECOVERY_REQUIRED"
  });

  // src/close/session-sm.ts
  var STATE_FA = {
    IDLE: "آماده",
    RUNNING: "جلسه در جریان است",
    PAUSING: "در حال توقف…",
    PAUSED: "متوقف شده",
    RESUMING: "در حال ازسرگیری…",
    COMPLETED: "پایان‌یافته",
    FAILED: "ناموفق",
    CANCELLING: "در حال لغو…",
    CANCELLED: "لغو شده",
    RECOVERY_REQUIRED: "نیازمند بازیابی"
  };
  var CSS = `
  .sm-sum{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
  .sm-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:var(--bg);border:1px solid var(--ln);font-size:12px;font-weight:700;color:var(--mu)}
  .sm-chip b{color:var(--tx);font-variant-numeric:tabular-nums}
  .sm-chip.run b{color:var(--ok)}.sm-chip.pau b{color:var(--wn)}.sm-chip.rec b{color:var(--er)}.sm-chip.bad b{color:var(--er)}
  .sm-glob{display:flex;gap:6px;margin:0 0 14px}
  .sm-glob .dy-btn{flex:1;min-height:36px;padding:0 6px;font-size:12px;gap:5px}
  .sm-glob .dy-btn svg,.sm-acts .dy-btn svg{width:16px;height:16px}
  .sm-acts{display:flex;gap:8px;margin:0 0 10px}
  .sm-acts .dy-btn{flex:1;min-height:40px;padding:0 8px;font-size:13px}
  .dy-btn.warn{background:var(--wn-s);border-color:color-mix(in srgb,var(--wn) 45%,var(--ln));color:var(--wn)}
  .dy-btn.warn:hover{background:var(--wn);border-color:var(--wn);color:#fff}
  .dy-btn.sm-confirm{background:var(--er);border-color:var(--er);color:#fff}
  .sm-link{border:0;background:none;color:var(--pr);font:700 12px var(--font);cursor:pointer;padding:2px 0;margin:0 0 10px;text-align:right}
  .sm-det{margin:0 0 12px;border-radius:var(--r2);background:var(--s2);padding:4px 0;font-size:12px}
  .sm-det[hidden]{display:none}
  .sm-det div{display:flex;justify-content:space-between;gap:10px;padding:5px 12px;border-bottom:1px dashed var(--ln)}
  .sm-det div:last-child{border-bottom:0}.sm-det .k{color:var(--mu);flex:none}.sm-det .v{text-align:left;overflow-wrap:anywhere;min-width:0}
  .sm-det .sec{display:block;padding:8px 12px 2px;font-weight:800;color:var(--tx);border:0}
  .dy-sp-card[data-sm="PAUSED"]::before,.dy-sp-card[data-sm="PAUSING"]::before{background:var(--wn)}
  .dy-sp-card[data-sm="RECOVERY_REQUIRED"]::before{background:var(--er)}
  .dy-sp-card[data-sm="COMPLETED"]::before,.dy-sp-card[data-sm="CANCELLED"]::before,.dy-sp-card[data-sm="FAILED"]::before{background:var(--mu)}
  .dy-sp-card[data-sm="PAUSED"] .dy-sp-live,.dy-sp-card[data-sm="PAUSING"] .dy-sp-live{color:var(--wn)}
  .dy-sp-card[data-sm="RECOVERY_REQUIRED"] .dy-sp-live,.dy-sp-card[data-sm="FAILED"] .dy-sp-live{color:var(--er)}
  .dy-sp-card[data-sm="COMPLETED"] .dy-sp-live,.dy-sp-card[data-sm="CANCELLED"] .dy-sp-live{color:var(--mu)}
  .dy-sp-card[data-sm="PAUSED"] .dy-sp-live .dot,.dy-sp-card[data-sm="PAUSING"] .dy-sp-live .dot{background:var(--wn);box-shadow:0 0 0 4px color-mix(in srgb,var(--wn) 22%,transparent);animation:none}
  .dy-sp-card[data-sm="RECOVERY_REQUIRED"] .dy-sp-live .dot,.dy-sp-card[data-sm="FAILED"] .dy-sp-live .dot{background:var(--er);box-shadow:0 0 0 4px color-mix(in srgb,var(--er) 22%,transparent);animation:none}
  .dy-sp-card[data-sm="COMPLETED"] .dy-sp-live .dot,.dy-sp-card[data-sm="CANCELLED"] .dy-sp-live .dot{background:var(--mu);box-shadow:none;animation:none}
`;
  var sched = new SessionScheduler();
  var records = /* @__PURE__ */ new Map();
  var finishedCount = 0;
  var gen = 0;
  var openDetails = /* @__PURE__ */ new Set();
  var pending = /* @__PURE__ */ new Set();
  var initDone = false;
  var pickBest = (list) => list.find((r) => !isTerminal(r.state)) ?? list.sort((a, b) => b.createdAt - a.createdAt)[0];
  var faTime = (t) => {
    try {
      return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(t));
    } catch {
      return new Date(t).toTimeString().slice(0, 8);
    }
  };
  var fmtDur = (ms) => {
    const m = Math.floor(Math.max(0, ms) / 6e4);
    const hh = Math.floor(m / 60);
    return hh ? `${faNum(hh)} ساعت و ${faNum(m % 60)} دقیقه` : `${faNum(m)} دقیقه`;
  };
  async function refresh(sessions) {
    const adoptMissing = async (list2) => {
      const have = new Set(list2.filter((r) => !isTerminal(r.state)).map((r) => r.externalRef));
      const todo = sessions.filter((s) => !have.has(s.oppId) && !list2.some((r) => r.externalRef === s.oppId));
      await Promise.all(todo.map((s) => smCall("adopt", null, { type: OPPORTUNITY_SESSION_TYPE, name: s.name, externalRef: s.oppId, startedAt: s.startedAt, ...s.number ? { meta: { number: s.number } } : {} })));
      return todo.length > 0;
    };
    let { sessions: list } = await smCall("list", null, {});
    if (await adoptMissing(list)) ({ sessions: list } = await smCall("list", null, {}));
    records.clear();
    const byRef = /* @__PURE__ */ new Map();
    for (const r of list) if (r.type === OPPORTUNITY_SESSION_TYPE && r.externalRef) byRef.set(r.externalRef, [...byRef.get(r.externalRef) ?? [], r]);
    for (const s of sessions) {
      const best = pickBest(byRef.get(s.oppId) ?? []);
      if (best) records.set(s.oppId, best);
    }
    finishedCount = list.filter((r) => isTerminal(r.state)).length;
  }
  var setRec = (r) => {
    if (r.externalRef) records.set(r.externalRef, r);
  };
  function detailsHtml(r) {
    const row = (k, v) => `<div><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`;
    const sec = (t) => `<div class="sec">${esc(t)}</div>`;
    const now = Date.now();
    const ops = r.operations;
    const cnt = (s) => ops.filter((o) => o.status === s).length;
    const cp = r.checkpoints[r.checkpoints.length - 1];
    const out = [
      sec("مشخصات"),
      row("شناسه جلسه", r.id.slice(0, 8)),
      row("وضعیت", STATE_FA[r.state]),
      row("ایجاد", faTime(r.createdAt)),
      row("آخرین فعالیت", faTime(r.lastActivityAt)),
      row("مرحلهٔ جاری", r.step ?? "—"),
      row("پیشرفت", r.progress == null ? "—" : faNum(Math.round(r.progress)) + "٪"),
      row("زمان فعال", fmtDur(activeMsAt(r, now))),
      row("مدت کل", r.startedAt ? fmtDur((r.finishedAt ?? now) - r.startedAt) : "—"),
      sec("توقف و ازسرگیری (" + faNum(r.pauses.length) + ")"),
      ...r.pauses.slice(-5).map((p) => row(faTime(p.pausedAt), p.resumedAt ? "ازسرگیری " + faTime(p.resumedAt) : "هنوز متوقف است")),
      sec("عملیات"),
      row("انجام‌شده / ناموفق / نامشخص / در حال اجرا", [cnt("done"), cnt("failed"), cnt("unknown"), cnt("inflight")].map(faNum).join(" / ")),
      ...ops.slice(-4).map((o) => row(o.label, o.status === "done" ? "انجام شد" : o.status === "failed" ? "ناموفق" : o.status === "unknown" ? "نتیجه نامشخص" : "در حال اجرا"))
    ];
    if (r.errors.length) out.push(sec("خطاها"), ...r.errors.slice(-3).map((e) => row(faTime(e.at), e.message)));
    out.push(sec("بازیابی و نقطه‌ی بازیابی"), row("وضعیت بازیابی", r.recovery ? r.recovery.reason : "نیاز ندارد"), row("آخرین نقطه", cp ? `${cp.step} • ${faTime(cp.at)}` : "—"));
    out.push(sec("تاریخچه"), ...r.history.slice(-6).map((e) => row(faTime(e.at), STATE_FA[e.to] + (e.reason ? " (" + e.reason + ")" : ""))));
    return out.join("");
  }
  function decorateCard(card, r, deps) {
    const ses = card.dataset.opp;
    card.dataset.sm = r.state;
    card.querySelector(".dy-sp-live .lb").textContent = STATE_FA[r.state];
    const info = card.querySelector(".dy-sp-info");
    info.querySelector(".sm-row")?.remove();
    const act = h(`<div class="sm-row"><span class="k">زمان فعال</span><span class="v sm-act"></span></div>`);
    info.appendChild(act);
    const paint = () => {
      const cur = records.get(ses);
      if (cur) act.querySelector(".sm-act").textContent = fmtDur(activeMsAt(cur, Date.now()));
    };
    paint();
    sched.clear(r.id);
    sched.every(r.id, "tick", 15e3, paint, r.state === "RUNNING");
    const acts = allowedActions(r.state);
    const busyNow = pending.has(r.id) || r.state === "PAUSING" || r.state === "RESUMING" || r.state === "CANCELLING";
    const end = card.querySelector(".dy-sp-end");
    const status = card.querySelector(".dy-st");
    if (!acts.end) {
      end.disabled = true;
      end.title = isTerminal(r.state) ? "این جلسه پایان یافته است" : "ابتدا جلسه را ادامه دهید";
    }
    const bar = h(`<div class="sm-acts"></div>`);
    const mk = (cls, icon, label, run, disabled = false) => {
      const b = h(`<button type="button" class="dy-btn ${cls}">${icon}<span>${esc(label)}</span></button>`);
      b.disabled = disabled || busyNow;
      b.onclick = async () => {
        if (pending.has(r.id)) return;
        pending.add(r.id);
        bar.querySelectorAll("button").forEach((x) => {
          x.disabled = true;
        });
        let err = null;
        try {
          await run();
        } catch (e) {
          err = errorMessage(e);
        }
        pending.delete(r.id);
        if (err) deps.notify(ses, "err", err);
        else deps.rerender();
      };
      return b;
    };
    const command = async (op) => {
      setRec(await smCall(op, r.id, {}));
    };
    if (isTerminal(r.state)) {
      bar.appendChild(mk("", ICONS.close, "حذف از لیست", async () => {
        deps.removeSession(ses);
      }));
    } else {
      if (acts.pause) bar.appendChild(mk("warn", ICONS.stop, "توقف جلسه", () => command("pause")));
      if (acts.resume) bar.appendChild(mk("ok", ICONS.play, r.state === "RECOVERY_REQUIRED" ? "ادامه (بازیابی)" : "ادامه جلسه", () => command("resume")));
      if (acts.cancel) {
        const c = mk("danger", ICONS.close, "لغو جلسه", async () => {
        });
        let armed = 0;
        c.onclick = () => {
          if (!armed) {
            armed = window.setTimeout(() => {
              armed = 0;
              c.classList.remove("sm-confirm");
              c.querySelector("span").textContent = "لغو جلسه";
            }, 4e3);
            c.classList.add("sm-confirm");
            c.querySelector("span").textContent = "تأیید لغو؟";
            return;
          }
          clearTimeout(armed);
          armed = 0;
          pending.add(r.id);
          bar.querySelectorAll("button").forEach((x) => {
            x.disabled = true;
          });
          void (async () => {
            let err = null;
            try {
              await smCall("cancel", r.id, { reason: "user" });
              deps.removeSession(ses);
            } catch (e) {
              err = errorMessage(e);
            }
            pending.delete(r.id);
            if (err) {
              deps.notify(ses, "err", err);
              return;
            }
            deps.rerender();
            const note = document.getElementById("dy-sp-msg");
            if (note) setStatus(note, "«" + (card.querySelector(".n")?.textContent ?? "") + "» لغو شد. فرصت و محصولات آن دست‌نخورده ماندند.", "warn");
          })();
        };
        bar.appendChild(c);
      }
    }
    const acts0 = card.querySelector(".dy-sp-acts");
    card.insertBefore(bar, acts0);
    if (!status.hidden) {
    } else if (r.state === "RECOVERY_REQUIRED" && r.recovery) setStatus(status, r.recovery.reason + "\nپس از بررسی، «ادامه (بازیابی)» یا «پایان جلسه» را بزنید.", "warn");
    else if (r.state === "PAUSED") setStatus(status, "ساعت جلسه متوقف است؛ «پایان جلسه» تا ادامه‌ی جلسه غیرفعال است.", "warn");
    const det = h(`<div class="sm-det" ${openDetails.has(r.id) ? "" : "hidden"}></div>`);
    det.innerHTML = detailsHtml(r);
    const tog = h(`<button type="button" class="sm-link" aria-expanded="${openDetails.has(r.id)}">${openDetails.has(r.id) ? "بستن جزئیات" : "مشاهده جزئیات"}</button>`);
    tog.onclick = () => {
      const open = det.hidden;
      det.hidden = !open;
      tog.setAttribute("aria-expanded", String(open));
      tog.textContent = open ? "بستن جزئیات" : "مشاهده جزئیات";
      if (open) openDetails.add(r.id);
      else openDetails.delete(r.id);
    };
    card.insertBefore(tog, acts0);
    card.insertBefore(det, acts0);
  }
  function renderSummary(root, sessions, deps) {
    root.querySelector("#dy-sm-sum")?.remove();
    root.querySelector("#dy-sm-glob")?.remove();
    const live = sessions.map((s) => records.get(s.oppId)).filter((r) => !!r && !isTerminal(r.state));
    if (!live.length && !finishedCount) return;
    const n = (st) => live.filter((r) => r.state === st).length;
    const chip = (cls, label, v) => `<span class="sm-chip ${cls}">${esc(label)} <b>${faNum(v)}</b></span>`;
    const sum = h(`<div id="dy-sm-sum" class="sm-sum" aria-label="خلاصه وضعیت جلسه‌ها">${[
      chip("", "فعال", live.length),
      chip("run", "در جریان", n("RUNNING")),
      chip("pau", "متوقف", n("PAUSED") + n("PAUSING")),
      chip("rec", "نیازمند بازیابی", n("RECOVERY_REQUIRED")),
      chip("", "پایان‌یافته/لغو", finishedCount)
    ].join("")}</div>`);
    const list = root.querySelector("#dy-sp-list");
    list.before(sum);
    if (live.length < 1) return;
    const glob = h(`<div id="dy-sm-glob" class="sm-glob"></div>`);
    const g = (cls, icon, label, op, disabled, done) => {
      const b = h(`<button type="button" class="dy-btn ${cls}">${icon}<span>${esc(label)}</span></button>`);
      b.disabled = disabled;
      let armed = 0;
      b.onclick = async () => {
        if (op === "cancelAll" && !armed) {
          armed = window.setTimeout(() => {
            armed = 0;
            b.classList.remove("sm-confirm");
            b.querySelector("span").textContent = label;
          }, 4e3);
          b.classList.add("sm-confirm");
          b.querySelector("span").textContent = "تأیید لغو همه؟";
          return;
        }
        clearTimeout(armed);
        armed = 0;
        glob.querySelectorAll("button").forEach((x) => {
          x.disabled = true;
        });
        try {
          const res = await smCall(op, null, {});
          const okIds = res.filter((x) => x.ok).map((x) => x.id);
          if (op === "cancelAll") for (const s of sessions) {
            const r = records.get(s.oppId);
            if (r && okIds.includes(r.id)) deps.removeSession(s.oppId);
          }
          const bad = res.length - okIds.length;
          toast(faNum(okIds.length) + " جلسه " + done + (bad ? "\n" + faNum(bad) + " مورد انجام نشد" : ""), bad ? "err" : "ok");
        } catch (e) {
          toast(errorMessage(e), "err");
        } finally {
          deps.rerender();
        }
      };
      return b;
    };
    glob.append(
      g("warn", ICONS.stop, "توقف همه", "pauseAll", n("RUNNING") === 0, "متوقف شد"),
      g("ok", ICONS.play, "ادامه همه", "resumeAll", n("PAUSED") === 0, "ادامه یافت"),
      g("danger", ICONS.close, "لغو همه", "cancelAll", live.length === 0, "لغو شد")
    );
    list.before(glob);
  }
  function applyAll(root, sessions, deps) {
    if (!document.getElementById("dy-sm-css")) {
      const s = document.createElement("style");
      s.id = "dy-sm-css";
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    const ids = /* @__PURE__ */ new Set();
    for (const card of root.querySelectorAll(".dy-sp-card[data-opp]")) {
      const r = records.get(card.dataset.opp);
      if (!r) continue;
      ids.add(r.id);
      card.querySelectorAll(".sm-acts,.sm-link,.sm-det").forEach((x) => x.remove());
      decorateCard(card, r, deps);
    }
    for (const id of sched.ids()) if (id !== "__panel__" && !ids.has(id)) sched.clear(id);
    renderSummary(root, sessions, deps);
  }
  async function smDecorate(root, sessions, deps) {
    if (!smAvailable()) return;
    if (!initDone) {
      initDone = true;
      smOnChange(() => deps.rerender());
      sched.every("__panel__", "heartbeat", 6e4, () => {
        for (const r of records.values()) if (!isTerminal(r.state)) void smCall("touch", r.id, {}).catch(() => void 0);
      });
    }
    const my = ++gen;
    if (records.size) applyAll(root, sessions, deps);
    try {
      await refresh(sessions);
      if (my === gen) applyAll(root, sessions, deps);
    } catch (e) {
      console.warn("session-manager panel:", e);
    }
  }
  async function smBeginEnd(ses) {
    if (!smAvailable()) return { ok: true, minutes: null };
    try {
      let rec = records.get(ses.oppId);
      if (!rec || isTerminal(rec.state)) rec = await smCall("adopt", null, { type: OPPORTUNITY_SESSION_TYPE, name: ses.name, externalRef: ses.oppId, startedAt: ses.startedAt });
      const b = await smCall("beginOp", rec.id, { key: "end-product:" + ses.oppId, label: "افزودن محصول پایان جلسه", recordKey: "opportunity:" + ses.oppId });
      if (b.ok) return { ok: true, minutes: Math.max(1, Math.ceil(b.activeMs / 6e4)) };
      if (b.reason === "state") return { ok: false, message: isTerminal(b.state) ? "این جلسه قبلاً پایان یافته است؛ آن را از لیست حذف کنید." : "جلسه «" + STATE_FA[b.state] + "» است؛ برای پایان، ابتدا آن را ادامه دهید." };
      if (b.reason === "inflight") return { ok: false, message: "پایان این جلسه هم‌اکنون در حال انجام است." };
      if (b.reason === "record-locked") return { ok: false, message: "این فرصت هم‌زمان توسط جلسهٔ دیگری به‌روزرسانی می‌شود؛ چند لحظه بعد دوباره تلاش کنید." };
      return { ok: false, message: "پایان جلسه این‌بار ممکن نیست؛ دوباره تلاش کنید." };
    } catch (e) {
      return { ok: false, message: "مدیر جلسه پاسخ نمی‌دهد؛ برای جلوگیری از محاسبهٔ نادرست زمان، پایان جلسه انجام نشد. دوباره تلاش کنید.\n" + errorMessage(e) };
    }
  }
  async function smEndDone(ses, ok, error) {
    if (!smAvailable()) return;
    const id = records.get(ses.oppId)?.id;
    if (!id) return;
    for (let i = 0; i < 2; i++) {
      try {
        await smCall("endOp", id, { key: "end-product:" + ses.oppId, ok, ...error ? { error: error.slice(0, 280) } : {}, ...ok ? { finalize: true } : {} });
        records.delete(ses.oppId);
        return;
      } catch (e) {
        if (i) console.warn("session-manager: could not record the end of the session:", e);
      }
    }
  }

  // src/close/session.ts
  var isSession = (o) => !!o && typeof o === "object" && !!o.oppId && !!o.startedAt;
  var loadSessions = () => {
    try {
      const o = JSON.parse(lsGet(SES_KEY) || "null");
      return (Array.isArray(o) ? o : [o]).filter(isSession);
    } catch {
      return [];
    }
  };
  var saveSessions = (list) => lsSet(SES_KEY, list.length ? JSON.stringify(list) : null);
  var updateSessions = (fn) => saveSessions(fn(loadSessions()));
  var isPrintName = (name) => /پرینت|print/i.test(name ?? "");
  var clockFa = (d) => {
    try {
      return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(d);
    } catch {
      return d.toTimeString().slice(0, 5);
    }
  };
  async function createOpportunityRecord(name) {
    const body = await newOpportunityBody(name);
    const rec = await api("opportunities", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
    const oppId = cleanId(rec.opportunityid);
    let number = null;
    let numErr = null;
    try {
      number = (await assignOpportunityNumber(oppId)).number;
    } catch (e) {
      numErr = e;
    }
    return { oppId, number, numErr };
  }
  async function addEndProduct(oppId, minutes) {
    const pr = await api(
      "products?$select=productid,name,price,_defaultuomid_value&$top=1&$filter=" + encodeURIComponent("productnumber eq '" + END_PRODUCT + "'")
    );
    if (!pr.value.length) throw new Error("محصول با شناسه " + END_PRODUCT + " پیدا نشد.");
    const p = pr.value[0];
    const uom = p._defaultuomid_value;
    const dup = await api(
      "opportunityproducts?$select=opportunityproductid&$top=1&$filter=" + encodeURIComponent("_opportunityid_value eq " + oppId + " and _productid_value eq " + p.productid)
    );
    if (dup.value.length) return { name: p.name, already: true };
    const lines = await apiAll(
      "opportunityproducts?$select=productname,_productid_value&$filter=" + encodeURIComponent("_opportunityid_value eq " + oppId),
      { headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' } }
    );
    if (lines.length && lines.every((l) => isPrintName(l["_productid_value@OData.Community.Display.V1.FormattedValue"]) || isPrintName(l.productname))) {
      return { name: p.name, skippedPrint: true };
    }
    let price = p.price;
    try {
      const o = await api("opportunities(" + oppId + ")?$select=_pricelevelid_value");
      if (o._pricelevelid_value) {
        const r = await api(
          "productpricelevels?$select=amount&$top=1&$filter=" + encodeURIComponent("_productid_value eq " + p.productid + " and _pricelevelid_value eq " + o._pricelevelid_value + (uom ? " and _uomid_value eq " + uom : ""))
        );
        if (r.value.length && r.value[0].amount != null) price = r.value[0].amount;
      }
    } catch (e) {
      console.warn("price lookup:", e);
    }
    const body = {
      "opportunityid@odata.bind": "/opportunities(" + oppId + ")",
      "productid@odata.bind": "/products(" + p.productid + ")",
      quantity: minutes
    };
    if (uom) body["uomid@odata.bind"] = "/uoms(" + uom + ")";
    if (price != null) {
      body.priceperunit = price;
      body.ispriceoverridden = true;
    }
    const post = (b) => api("opportunityproducts", { method: "POST", body: JSON.stringify(b) });
    try {
      await post({ bmsd_istaxmanualyset: true, ...body });
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) await post(body);
      else throw e;
    }
    return { name: p.name };
  }
  function sessionPanel() {
    let root = document.getElementById("dy-sp");
    if (root) return root;
    injectCss();
    const panel = h(`<div id="dy-sp" class="dyx">
      <button type="button" class="dy-sp-tab" aria-label="باز کردن پنل جلسه"><span class="ic"></span><span class="lbl">جلسه</span></button>
      <aside class="dy-sp-panel" role="complementary" aria-label="جلسه کاری">
        <div class="dy-hd"><span class="dy-badge">${ICONS.timer}</span><div><h3>جلسه کاری</h3><p class="dy-sub"></p></div>
          <button type="button" class="dy-x" aria-label="بستن پنل">${ICONS.close}</button></div>
        <div class="dy-bd">
          <div class="dy-sp-new">
            <label class="dy-f"><span>عنوان جلسه / فرصت</span><input id="dy-sp-title" type="text" autocomplete="off" placeholder="مثلاً: مشتری حضوری - ..."></label>
            <label class="dy-sp-chk"><input id="dy-sp-openform" type="checkbox"><span>بعد از ساخت، فرصت باز شود</span></label>
            <div class="dy-st" id="dy-sp-msg" role="status" aria-live="polite" hidden></div>
            <button type="button" class="dy-btn ok" id="dy-sp-start">${ICONS.play}<span>شروع جلسه</span></button>
            <div class="dy-sp-quick" id="dy-sp-quick" hidden>
              <button type="button" class="dy-btn" id="dy-sp-qstart">${ICONS.box}<span>شروع با انتخاب محصول</span></button>
              <button type="button" class="dy-btn danger" id="dy-sp-qend">${ICONS.stop}<span>پایان سریع</span></button>
              <p class="dy-sub">میان‌بُر در هر تب: دو بار پشت‌سرهم <kbd>Shift</kbd> = شروع، <kbd>Ctrl</kbd> = پایان</p>
            </div>
          </div>
          <div class="dy-sp-list" id="dy-sp-list" aria-label="جلسه‌های در جریان"></div>
        </div>
      </aside></div>`);
    root = panel;
    const setOpen = (v) => {
      panel.classList.toggle("open", v);
      lsSet(SES_OPEN_KEY, v ? "1" : "0");
      if (v) setTimeout(() => panel.querySelector("#dy-sp-title")?.focus(), 240);
    };
    panel.querySelector(".dy-sp-tab").onclick = () => setOpen(true);
    panel.querySelector(".dy-x").onclick = () => setOpen(false);
    for (const ev of ["keydown", "keyup", "keypress"]) {
      panel.addEventListener(ev, (e) => {
        e.stopPropagation();
        if (ev === "keydown" && e.key === "Escape") setOpen(false);
      });
    }
    if (lsGet(SES_OPEN_KEY) === "1") panel.classList.add("open");
    const $ = (s) => panel.querySelector(s);
    $("#dy-sp-openform").checked = lsGet(SES_OPENFORM_KEY) !== "0";
    $("#dy-sp-openform").onchange = (e) => lsSet(SES_OPENFORM_KEY, e.target.checked ? "1" : "0");
    const quickBox = $("#dy-sp-quick");
    const showQuick = () => {
      quickBox.hidden = !document.documentElement.hasAttribute(QUICK_ATTR);
      return !quickBox.hidden;
    };
    if (!showQuick()) {
      let n = 0;
      const t = setInterval(() => {
        if (showQuick() || ++n > 30) clearInterval(t);
      }, 1e3);
    }
    const quick = (which) => {
      document.dispatchEvent(new CustomEvent(QUICK_OPEN_EVT, { detail: which }));
    };
    $("#dy-sp-qstart").onclick = () => quick("start");
    $("#dy-sp-qend").onclick = () => quick("end");
    const start = async () => {
      const btn = $("#dy-sp-start");
      const titleInput = $("#dy-sp-title");
      const name = titleInput.value.trim();
      if (!name) {
        setStatus($("#dy-sp-msg"), "عنوان جلسه را وارد کنید.", "err");
        titleInput.focus();
        return;
      }
      if (btn.disabled) return;
      btn.disabled = true;
      titleInput.disabled = true;
      setStatus($("#dy-sp-msg"), "در حال ساخت فرصت تجاری...", "busy");
      let r;
      try {
        r = await createOpportunityRecord(name);
      } catch (e) {
        btn.disabled = false;
        titleInput.disabled = false;
        setStatus($("#dy-sp-msg"), "ساخت فرصت ناموفق بود: " + errorMessage(e), "err");
        return;
      }
      updateSessions((l) => [...l, { oppId: r.oppId, name, number: r.number, startedAt: Date.now() }]);
      btn.disabled = false;
      titleInput.disabled = false;
      titleInput.value = "";
      setStatus($("#dy-sp-msg"), r.numErr ? "فرصت ساخته شد اما شماره‌گذاری ناموفق بود: " + errorMessage(r.numErr) : "", r.numErr ? "warn" : "");
      renderSession(panel);
      toast("جلسه شروع شد" + (r.number ? "\nشماره فرصت: ⁦" + r.number + "⁩" : ""), "ok", 5e3);
      if ($("#dy-sp-openform").checked) void requireXrm().Navigation.openForm({ entityName: "opportunity", entityId: r.oppId });
    };
    $("#dy-sp-start").onclick = () => void start();
    $("#dy-sp-title").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void start();
      }
    });
    window.addEventListener("storage", (e) => {
      if (e.key === SES_KEY) renderSession(panel);
    });
    document.body.appendChild(panel);
    renderSession(panel);
    return panel;
  }
  var messages = /* @__PURE__ */ new Map();
  var busy = /* @__PURE__ */ new Set();
  function renderSession(rootEl, msgFor, msg) {
    const root = rootEl ?? document.getElementById("dy-sp");
    if (!root) return;
    if (msgFor) {
      if (msg) messages.set(msgFor, msg);
      else messages.delete(msgFor);
    }
    const list = root.querySelector("#dy-sp-list");
    const sub = root.querySelector(".dy-sub");
    const tab = root.querySelector(".dy-sp-tab");
    const sessions = loadSessions();
    tab.querySelector(".ic").innerHTML = sessions.length ? '<span class="dot"></span><span class="cnt">' + faNum(sessions.length) + "</span>" : ICONS.timer;
    tab.setAttribute("aria-label", sessions.length ? "باز کردن پنل جلسه، " + faNum(sessions.length) + " جلسه در جریان" : "باز کردن پنل جلسه");
    sub.textContent = sessions.length ? faNum(sessions.length) + " جلسه در جریان" : "شروع جلسه یک فرصت می‌سازد و پایان جلسه محصول را اضافه می‌کند";
    for (const k of [...messages.keys()]) if (!sessions.some((s) => s.oppId === k)) messages.delete(k);
    list.textContent = "";
    for (const ses of sessions) list.appendChild(sessionCard(root, ses));
    void smDecorate(root, sessions, { rerender: () => renderSession(root), notify: (oppId, kind, text) => renderSession(root, oppId, { kind, text }), removeSession: (oppId) => updateSessions((l) => l.filter((x) => x.oppId !== oppId)) });
  }
  function sessionCard(root, ses) {
    const card = h(`<section class="dy-sp-card" data-opp="">
      <div class="dy-sp-live"><span class="dot"></span><span class="lb">جلسه در جریان است</span></div>
      <div class="dy-st" role="status" aria-live="polite" hidden></div>
      <div class="dy-sp-info">
        <div><span class="k">عنوان</span><span class="v n"></span></div>
        <div><span class="k">شماره فرصت</span><span class="v ltr num"></span></div>
        <div><span class="k">شروع</span><span class="v st"></span></div>
      </div>
      <div class="dy-sp-acts">
        <button type="button" class="dy-btn dy-sp-open">${ICONS.open}<span>باز کردن فرصت</span></button>
        <button type="button" class="dy-btn danger dy-sp-end">${ICONS.stop}<span>پایان جلسه</span></button>
      </div></section>`);
    const $ = (s) => card.querySelector(s);
    card.dataset.opp = ses.oppId;
    $(".n").textContent = ses.name;
    $(".num").textContent = ses.number || "—";
    $(".st").textContent = clockFa(new Date(ses.startedAt));
    const status = $(".dy-st");
    const m = messages.get(ses.oppId);
    if (m) setStatus(status, m.text, m.kind);
    const endBtn = $(".dy-sp-end");
    if (busy.has(ses.oppId)) endBtn.disabled = true;
    if (!ses.number) {
      const b = h('<button type="button" class="dy-btn dy-sp-renum"><span>تلاش مجدد برای ثبت شماره</span></button>');
      $(".dy-sp-acts").prepend(b);
      b.onclick = async () => {
        b.disabled = true;
        try {
          const r = await assignOpportunityNumber(ses.oppId);
          updateSessions((l) => l.map((x) => x.oppId === ses.oppId ? { ...x, number: r.number } : x));
          renderSession(root, ses.oppId, { kind: "ok", text: "شماره ثبت شد." });
        } catch (e) {
          b.disabled = false;
          setStatus(status, "ثبت شماره ناموفق بود: " + errorMessage(e), "err");
        }
      };
    }
    $(".dy-sp-open").onclick = () => void requireXrm().Navigation.openForm({ entityName: "opportunity", entityId: ses.oppId });
    endBtn.onclick = async () => {
      if (busy.has(ses.oppId)) return;
      busy.add(ses.oppId);
      endBtn.disabled = true;
      setStatus(status, "در حال افزودن محصول " + END_PRODUCT + " به فرصت...", "busy");
      const cur = loadSessions().find((x) => x.oppId === ses.oppId) || ses;
      const gate = await smBeginEnd(cur);
      if (!gate.ok) {
        busy.delete(ses.oppId);
        renderSession(root, ses.oppId, { kind: "warn", text: gate.message });
        return;
      }
      const minutes = gate.minutes ?? Math.max(1, Math.ceil((Date.now() - cur.startedAt) / 6e4));
      let r;
      try {
        r = await addEndProduct(ses.oppId, minutes);
      } catch (e) {
        await smEndDone(cur, false, errorMessage(e));
        busy.delete(ses.oppId);
        endBtn.disabled = false;
        setStatus(status, "افزودن محصول ناموفق بود: " + errorMessage(e) + "\nجلسه هنوز باز است؛ دوباره تلاش کنید.", "err");
        return;
      }
      await smEndDone(cur, true);
      busy.delete(ses.oppId);
      updateSessions((l) => l.filter((x) => x.oppId !== ses.oppId));
      const text = r.skippedPrint ? "جلسه پایان یافت. چون همهٔ محصولات فرصت «پرینت» هستند، زمان جلسه اضافه نشد." : "جلسه پایان یافت و محصول «" + r.name + "» " + (r.already ? "از قبل روی فرصت بود." : "به تعداد " + faNum(minutes) + " (دقیقه) به فرصت اضافه شد.");
      renderSession(root, void 0, null);
      const note = document.getElementById("dy-sp-msg");
      if (note) setStatus(note, "«" + ses.name + "»: " + text, "ok");
      toast(r.skippedPrint ? "جلسه پایان یافت (بدون افزودن زمان)" : "جلسه پایان یافت", "ok", 4e3);
      try {
        const fc = getFC();
        if (fc && fc.data.entity.getId() && cleanId(fc.data.entity.getId()) === ses.oppId && !fc.data.getIsDirty()) void fc.data.refresh(false);
      } catch {
      }
    };
    return card;
  }

  // src/close/stage-dialog.ts
  async function openStageDialog() {
    const fc = getFC();
    if (!fc || !hasProcess()) return;
    const id = cleanId(fc.data.entity.getId());
    const oppName = primaryName(fc);
    let ctx;
    try {
      const o = await api("opportunities(" + id + ")?$select=statecode");
      if (o.statecode !== 0) {
        toast("این فرصت بسته شده است و مرحله‌ی آن قابل تغییر نیست.", "err");
        return;
      }
      ctx = await loadStageContext(fc, id);
    } catch (e) {
      toast("خواندن مراحل ناموفق بود: " + errorMessage(e), "err");
      return;
    }
    const m = modal({ title: "تغییر مرحله", sub: oppName, icon: "swap" });
    m.body.innerHTML = `
      <div class="dy-note">${ICONS.swap}<span>انتخاب مستقیم هر مرحله؛ مراحل میانی تکمیل نمی‌شوند و فرصت بسته (برنده) نمی‌شود.</span></div>
      <label class="dy-f"><span>مرحله</span><select id="dy-stage-sel"></select></label>
      <div class="dy-st" id="dy-stage-msg" role="status" aria-live="polite" hidden></div>`;
    m.foot.innerHTML = '<button type="button" class="dy-btn pri" id="dy-stage-ok"><span>ادامه</span></button><button type="button" class="dy-btn" id="dy-stage-cancel">لغو</button>';
    const $ = m.$;
    const sel = $("#dy-stage-sel");
    ctx.stages.forEach((st, i) => {
      const o = document.createElement("option");
      o.value = st.id;
      o.textContent = faNum(i + 1) + ". " + st.name + (st.id === ctx.activeId ? "  (مرحله‌ی فعلی)" : "");
      if (st.id === ctx.activeId) o.selected = true;
      sel.appendChild(o);
    });
    const msg = (t, kind) => setStatus($("#dy-stage-msg"), t, kind);
    const okLabel = () => $("#dy-stage-ok").querySelector("span");
    $("#dy-stage-cancel").onclick = m.close;
    setTimeout(() => sel.focus(), 30);
    let confirming = false;
    sel.addEventListener("change", () => {
      confirming = false;
      okLabel().textContent = "ادامه";
      msg("");
    });
    $("#dy-stage-ok").onclick = async () => {
      const target = sel.value;
      if (target === ctx.activeId) return msg("این مرحله هم‌اکنون فعال است.", "warn");
      const tname = ctx.stages.find((x) => x.id === target).name;
      if (!confirming) {
        confirming = true;
        okLabel().textContent = "بله، منتقل کن";
        return msg("آیا می‌خواهید فرصت فروش مستقیماً به این مرحله منتقل شود؟\n«" + tname + "»", "warn");
      }
      m.locked = true;
      m.box.querySelectorAll("select,button").forEach((x) => {
        x.disabled = true;
      });
      msg("در حال انتقال به مرحله «" + tname + "»...", "busy");
      try {
        if (fc.data.getIsDirty?.()) await fc.data.save();
        const how = await moveToStageDirect(fc, ctx, target);
        console.info("DY stage change -> " + tname + " via " + how);
        m.locked = false;
        m.close();
        toast("فرصت به مرحله «" + tname + "» منتقل شد.");
        void requireXrm().Navigation.openForm({ entityName: "opportunity", entityId: id });
      } catch (e) {
        m.locked = false;
        m.box.querySelectorAll("select,button").forEach((x) => {
          x.disabled = false;
        });
        confirming = false;
        okLabel().textContent = "ادامه";
        msg(errorMessage(e), "err");
      }
    };
  }

  // src/close/ui/fab.ts
  function getFab(create) {
    let fab = document.getElementById(FAB_ID);
    if (!fab && create) {
      injectCss();
      fab = h(`<div id="${FAB_ID}" class="dyx"></div>`);
      const hd = h('<button type="button" class="dy-fh"></button>');
      const paint = () => {
        const min = fab.classList.contains("min");
        hd.innerHTML = min ? ICONS.right : ICONS.left;
        hd.title = min ? "نمایش متن دکمه‌ها" : "جمع کردن دکمه‌ها";
        hd.setAttribute("aria-label", hd.title);
      };
      hd.onclick = () => {
        fab.classList.toggle("min");
        lsSet(FAB_KEY, fab.classList.contains("min") ? "1" : "0");
        paint();
      };
      if (lsGet(FAB_KEY) === "1") fab.classList.add("min");
      fab.appendChild(hd);
      paint();
      document.body.appendChild(fab);
    }
    return fab;
  }
  function syncButton(id, show, spec) {
    let btn = document.getElementById(id);
    if (show && !btn) {
      const fab = getFab(true);
      btn = h(`<button type="button" class="dy-fb ${spec.cls}"><span class="ic">${ICONS[spec.icon]}</span><span class="lbl"></span></button>`);
      btn.id = id;
      btn.title = spec.label;
      btn.setAttribute("aria-label", spec.label);
      btn.lastChild.textContent = spec.label;
      btn.onclick = spec.handler;
      fab.appendChild(btn);
    } else if (!show && btn) {
      btn.remove();
      const fab = getFab(false);
      if (fab && !fab.querySelector(".dy-fb")) fab.remove();
    }
  }

  // src/close/index.ts
  var isOpenOpp = () => {
    const fc = getFC();
    if (!fc) return false;
    try {
      return fc.data.entity.getEntityName() === "opportunity" && !!fc.data.entity.getId();
    } catch {
      return false;
    }
  };
  function pageInput() {
    try {
      return window.Xrm?.Utility?.getPageContext?.()?.input ?? null;
    } catch {
      return null;
    }
  }
  var isOppList = () => {
    const x = window.Xrm;
    if (!x) return false;
    if (typeof x.Utility?.getPageContext !== "function") return !getFC();
    const input = pageInput();
    return !!input && input.pageType === "entitylist" && String(input.entityName).toLowerCase() === "opportunity";
  };
  function publishCrmUrl() {
    if (!window.Xrm || document.documentElement.hasAttribute(QUICK_CRM_ATTR)) return;
    try {
      document.documentElement.setAttribute(QUICK_CRM_ATTR, clientUrl());
    } catch {
    }
  }
  function ensureButtons() {
    publishCrmUrl();
    ensureTaxYes();
    if (window.Xrm && document.body) sessionPanel();
    const opp = isOpenOpp();
    syncButton(BTN_ID, opp, { cls: "win", icon: "check", label: "بستن به عنوان برنده", handler: () => void openDialog() });
    syncButton("dy-stage-btn", opp && hasProcess(), { cls: "tonal", icon: "swap", label: "تغییر مرحله", handler: () => void openStageDialog() });
    syncButton("dy-prod-btn", opp, { cls: "tonal", icon: "box", label: "افزودن محصول", handler: () => void openProductSearch() });
    if (opp) warmProductCache();
    syncButton("dy-kyc-btn", !!window.Xrm && !!window.__dyKyc, { cls: "tonal", icon: "shield", label: "احراز هویت", handler: () => window.__dyKyc.open() });
    syncButton("dy-new-btn", !opp && isOppList() && !!window.Xrm, { cls: "pri", icon: "add", label: "فرصت جدید", handler: openCreateDialog });
  }
  if (!window.__dyEasyClose) {
    window.__dyEasyClose = true;
    console.info(`DY CRM Toolkit ${"1.17.3"}: opportunity tools loaded`);
    window.__dyOppNumber = oppNumberApi;
    setInterval(ensureButtons, 1e3);
    setTimeout(ensureButtons, 0);
  }
})();
