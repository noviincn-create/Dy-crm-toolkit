"use strict";
(() => {
  // src/shared/config.ts
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
  var INVOICE_ATTR = "data-dy-invoice";

  // src/shared/text.ts
  var FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
  var toFaDigits = (s) => String(s ?? "").replace(/[0-9]/g, (d) => FA_DIGITS.charAt(Number(d)));
  var HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  var esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => HTML_ESCAPES[c] ?? c);
  var errorMessage = (e) => e instanceof Error ? e.message : String(e);

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

  // src/invoice/data.ts
  var ANN = "OData.Community.Display.V1.FormattedValue";
  var LOOK = "Microsoft.Dynamics.CRM.lookuplogicalname";
  var PREFER = { Prefer: `odata.include-annotations="${ANN},${LOOK}"` };
  var num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  var money = (v) => toFaDigits(Math.round(num(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));
  var qty = (v) => toFaDigits(String(Math.round(num(v) * 100) / 100));
  function invoiceDate(d) {
    try {
      return new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tehran" }).format(d).replace(/[٠-٩]/g, (x) => String.fromCharCode(x.charCodeAt(0) - 1632 + 1776));
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }
  async function loadParty(type, id) {
    const r = await api(`${type === "contact" ? "contacts" : "accounts"}(${id})`, { headers: PREFER });
    const addr = String(r.address1_composite || [r.address1_line1, r.address1_line2, r.address1_line3].filter(Boolean).join("، ") || "").replace(/\s*[\r\n]+\s*/g, "، ");
    const common = {
      province: r.address1_stateorprovince || "",
      county: r.address1_county || "",
      city: r.address1_city || "",
      postal: r.address1_postalcode || "",
      address: addr
    };
    return type === "contact" ? { name: r.fullname || "", nid: r.systan_nationalcode || "", phone: r.mobilephone || r.telephone1 || "", ...common } : { name: r.name || "", nid: r.systan_nationalidbase || "", phone: r.telephone1 || "", ...common };
  }
  async function loadBuyer(opp) {
    const candidates = [
      ["_customerid_value", opp["_customerid_value@" + LOOK]],
      ["_parentaccountid_value", "account"],
      ["_parentcontactid_value", "contact"]
    ];
    for (const [field2, type] of candidates) {
      const id = opp[field2];
      if (!id || type !== "account" && type !== "contact") continue;
      try {
        return await loadParty(type, id);
      } catch (e) {
        console.warn("invoice buyer:", e);
        return { name: opp[field2 + "@" + ANN] || "", nid: "", phone: "", province: "", county: "", city: "", postal: "", address: "" };
      }
    }
    return null;
  }
  async function loadLines(id) {
    const rows = await apiAll("opportunityproducts?$filter=_opportunityid_value eq " + id, { headers: PREFER });
    rows.sort((a, b) => num(a.lineitemnumber) - num(b.lineitemnumber) || String(a.createdon).localeCompare(String(b.createdon)));
    const ids = [...new Set(rows.map((r) => r._productid_value).filter(Boolean))];
    const codes = {};
    for (let i = 0; i < ids.length; i += 40) {
      const part = ids.slice(i, i + 40);
      try {
        const ps = await apiAll("products?$select=productid,productnumber&$filter=" + part.map((p) => "productid eq " + p).join(" or "), { headers: PREFER });
        ps.forEach((p) => {
          codes[p.productid] = p.productnumber || "";
        });
      } catch (e) {
        console.warn("invoice product codes:", e);
      }
    }
    return rows.map((r) => {
      const base = r.baseamount != null ? num(r.baseamount) : num(r.priceperunit) * num(r.quantity);
      const disc = num(r.manualdiscountamount) + num(r.volumediscountamount);
      const name = r["_productid_value@" + ANN] || r.productname || r.productdescription || "";
      return {
        code: codes[r._productid_value] || "",
        name,
        note: r.productdescription && r.productdescription !== name ? r.productdescription : "",
        unit: r["_uomid_value@" + ANN] || "",
        qty: num(r.quantity),
        price: num(r.priceperunit),
        base,
        disc,
        after: base - disc,
        tax: num(r.tax)
      };
    });
  }
  async function loadData(id, cfg) {
    const opp = await api("opportunities(" + id + ")", { headers: PREFER });
    const [lines, buyer] = await Promise.all([loadLines(id), cfg.showBuyer ? loadBuyer(opp) : Promise.resolve(null)]);
    const sum = (k) => lines.reduce((s, l) => s + l[k], 0);
    const oppDisc = num(opp.discountamount);
    const freight = num(opp.freightamount);
    const totalBase = sum("base");
    const totalDisc = sum("disc") + oppDisc;
    const tax = sum("tax");
    const when = opp.actualclosedate ? new Date(opp.actualclosedate) : /* @__PURE__ */ new Date();
    const configured = opp[cfg.numberField];
    return {
      number: String(configured != null && configured !== "" ? configured : opp.new_opportunitynumbertext || opp.new_opportunitynumber || ""),
      date: invoiceDate(when),
      lines,
      buyer,
      totals: { base: totalBase, disc: totalDisc, oppDisc, tax, freight, payable: totalBase - totalDisc + tax + freight }
    };
  }

  // src/invoice/render.ts
  var MIN_ROWS = 7;
  var EMPTY_PARTY = { name: "", economic: "", reg: "", province: "", county: "", city: "", postal: "", phone: "", address: "" };
  var field = (label, value, cls = "") => `<div class="f${cls ? " " + cls : ""}"><span class="l">${label} :</span><span class="v">${value}</span></div>`;
  function partyBox(title, p) {
    const d = (v) => esc(toFaDigits(v));
    return `<div class="band">${esc(title)}</div><div class="pbox">` + field("نام شخص حقیقی / حقوقی", esc(p.name), "name") + field("شماره اقتصادی", d(p.economic), "eco") + field("شماره ثبت / شماره ملی", d(p.reg), "reg") + field("نشانی کامل : استان", esc(p.province), "prov") + field("شهرستان", esc(p.county), "county") + field("کد پستی ۱۰ رقمی", d(p.postal), "post") + field("شهر", esc(p.city), "city") + field("نشانی", esc(p.address), "addr") + field("شماره تلفن / نمابر", d(p.phone), "tel") + `</div>`;
  }
  var COLUMNS = [
    "ردیف",
    "کد کالا",
    "شرح کالا یا خدمات",
    "تعداد / مقدار",
    "واحد اندازه‌گیری",
    "مبلغ واحد<br>(ریال)",
    "مبلغ کل<br>(ریال)",
    "مبلغ تخفیف",
    "مبلغ کل<br>پس از تخفیف<br>(ریال)",
    "جمع مالیات<br>و عوارض<br>(ریال)",
    "جمع مبلغ کل بعلاوه<br>جمع مالیات و عوارض<br>(ریال)"
  ];
  var WIDTHS = [3.5, 7.5, 21, 5.5, 6.5, 9.5, 10.5, 8, 10.5, 7.5, 10];
  function renderInvoice(data, cfg) {
    const s = cfg.seller;
    const t = data.totals;
    const seller = {
      name: s.name,
      economic: s.economicCode,
      reg: s.regNo || s.guild,
      province: s.province,
      county: s.county || s.city,
      city: s.city,
      postal: s.postal,
      phone: s.phone,
      address: s.address
    };
    const b = data.buyer;
    const buyer = b ? { name: b.name, economic: "", reg: b.nid, province: b.province, county: b.county || b.city, city: b.city, postal: b.postal, phone: b.phone, address: b.address } : EMPTY_PARTY;
    const lineRows = data.lines.map(
      (l, i) => `<tr><td>${toFaDigits(i + 1)}</td><td>${esc(toFaDigits(l.code))}</td><td class="desc">${esc(l.name)}${l.note ? `<small>${esc(l.note)}</small>` : ""}</td><td>${qty(l.qty)}</td><td>${esc(l.unit)}</td><td>${money(l.price)}</td><td>${money(l.base)}</td><td>${money(l.disc)}</td><td>${money(l.after)}</td><td>${money(l.tax)}</td><td>${money(l.after + l.tax)}</td></tr>`
    );
    const blank = `<tr class="blank">${"<td></td>".repeat(COLUMNS.length)}</tr>`;
    while (lineRows.length < MIN_ROWS) lineRows.push(blank);
    const sum = (f) => data.lines.reduce((a, l) => a + f(l), 0);
    const totalRow = `<tr class="tot"><td colspan="6" class="tl">جمع کل</td><td>${money(sum((l) => l.base))}</td><td>${money(sum((l) => l.disc))}</td><td>${money(sum((l) => l.after))}</td><td>${money(sum((l) => l.tax))}</td><td>${money(sum((l) => l.after + l.tax))}</td></tr>`;
    const adj = [];
    if (t.oppDisc) adj.push(`تخفیف کلی: ${money(t.oppDisc)} ریال`);
    if (t.freight) adj.push(`هزینه حمل: ${money(t.freight)} ریال`);
    const payRow = adj.length ? `<tr class="tot pay"><td colspan="10" class="tl">${adj.join("  ـ  ")}  ـ  مبلغ قابل پرداخت (ریال)</td><td>${money(t.payable)}</td></tr>` : "";
    return `<div class="inv"><header class="hd"><div></div><h1>${esc(cfg.title)}</h1><div class="meta"><div class="m"><span class="l">شماره سریال :</span><i>${esc(toFaDigits(data.number))}</i></div><div class="m"><span class="l">تاریخ :</span><i>${esc(data.date)}</i></div></div></header>` + partyBox("مشخصات فروشنده", seller) + partyBox("مشخصات خریدار", buyer) + `<div class="band">مشخصات کالا یا خدمات مورد معامله</div><table><colgroup>${WIDTHS.map((w) => `<col style="width:${w}%">`).join("")}</colgroup><thead><tr class="nums">${COLUMNS.map((_, i) => `<th>${toFaDigits(i + 1)}</th>`).join("")}</tr><tr class="ttl">${COLUMNS.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${lineRows.join("")}</tbody><tfoot>${totalRow}${payRow}</tfoot></table><div class="foot"><div class="fr"><div class="box terms"><span class="tt">شرایط و نحوه فروش :</span><span class="ck"><u></u>نقدی</span><span class="ck"><u></u>غیرنقدی</span></div><div class="box notes"><span class="tt">توضیحات :</span><span class="dots"></span></div></div><div class="fl"></div><div class="box sign">مهر و امضاء فروشنده</div><div class="box sign">مهر و امضاء خریدار</div></div></div>`;
  }

  // src/invoice/fonts.ts
  var EMBEDDED_FONTS_CSS = '@font-face{font-family:"DY Yekan Emb";src:url(data:font/woff2;base64,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) format("woff2");font-weight:100 900;font-style:normal;font-display:block}\n@font-face{font-family:"DY Titr Emb";src:url(data:font/woff2;base64,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) format("woff2");font-weight:100 900;font-style:normal;font-display:block}';

  // src/invoice/styles.ts
  var INVOICE_PAGE_CSS = "@page{size:A4 landscape;margin:7mm 8mm 13mm}";
  var YEKAN = '"DY Yekan","DY Yekan Emb","DY Vazir",Tahoma,sans-serif';
  var TITR = '"DY Titr","DY Titr Emb","DY Yekan","DY Yekan Emb","DY Vazir",Tahoma,sans-serif';
  var INVOICE_CSS = `
    @media screen{#dy-inv-root{display:none!important}}
    #dy-inv-root{--bd:#000;--g:#555;--tt:${TITR};
      font:9.5pt/1.5 ${YEKAN};font-weight:400;color:#000;direction:rtl;text-align:right;
      -webkit-print-color-adjust:exact;print-color-adjust:exact}
    #dy-inv-root *{box-sizing:border-box;font-weight:400}
    #dy-inv-root .inv{width:100%}
    #dy-inv-root .l,#dy-inv-root .band,#dy-inv-root h1,#dy-inv-root th,#dy-inv-root .tl,#dy-inv-root .tt,#dy-inv-root .sign{font-family:var(--tt);font-weight:700}

    #dy-inv-root .hd{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;margin:0 0 2.2mm}
    #dy-inv-root h1{margin:0;font-size:17pt;line-height:1.3;text-align:center;white-space:nowrap}
    #dy-inv-root .meta{justify-self:end;display:grid;gap:1.4mm}
    #dy-inv-root .m{display:flex;align-items:center;gap:2.5mm}
    #dy-inv-root .m .l{font-size:9pt;min-width:21mm;text-align:left}
    #dy-inv-root .m i{display:flex;align-items:center;justify-content:center;font-style:normal;font-size:11pt;width:44mm;height:7.2mm;border:.3mm solid var(--bd);padding:0 2mm;direction:rtl;white-space:nowrap}

    #dy-inv-root .band{margin-top:1.4mm;height:5.6mm;display:flex;align-items:center;justify-content:center;border:.3mm solid var(--bd);border-radius:1.6mm;font-size:9.5pt;break-after:avoid}
    #dy-inv-root .pbox{margin-top:.8mm;border:.3mm solid var(--bd);border-radius:1.6mm;padding:1.2mm 3mm;display:grid;
      grid-template-columns:1.25fr .9fr 1.15fr 1.1fr;gap:.7mm 4mm;break-inside:avoid}
    #dy-inv-root .f{display:flex;gap:1.6mm;align-items:baseline;min-height:5.6mm;min-width:0}
    #dy-inv-root .f .l{font-size:8.6pt;white-space:nowrap}
    #dy-inv-root .f .v{flex:1;min-width:0;padding:0 1mm;font-size:9.5pt;border-bottom:.2mm dotted var(--g);overflow-wrap:anywhere}
    #dy-inv-root .f.name{grid-column:1/3}
    #dy-inv-root .f.addr{grid-column:1/4}

    #dy-inv-root table{width:100%;table-layout:fixed;border-collapse:collapse;margin-top:.8mm;border:.45mm solid var(--bd)}
    #dy-inv-root thead{display:table-header-group}
    #dy-inv-root tfoot{display:table-row-group}
    #dy-inv-root th,#dy-inv-root td{border:.25mm solid var(--bd);text-align:center;vertical-align:middle;padding:0 1mm}
    #dy-inv-root th:not(:first-child),#dy-inv-root td:not(:first-child){border-right-width:.25mm}
    #dy-inv-root tr.nums th{height:4.8mm;font-size:8.5pt;border-bottom:.25mm solid var(--bd);padding:0}
    #dy-inv-root tr.ttl th{height:11.5mm;font-size:8.4pt;line-height:1.45;border-bottom:.45mm solid var(--bd)}
    #dy-inv-root tbody td{height:6.3mm;font-size:9.3pt;line-height:1.35;padding:.4mm 1mm;border-color:var(--g)}
    #dy-inv-root tbody tr{break-inside:avoid}
    #dy-inv-root td.desc{text-align:right;padding-inline:1.6mm}
    #dy-inv-root td.desc small{display:block;font-size:7.6pt;color:var(--g);line-height:1.3}
    #dy-inv-root tfoot td{height:7.4mm;font-size:10pt;border-color:var(--bd)}
    #dy-inv-root tfoot tr:first-child td{border-top:.45mm solid var(--bd)}
    #dy-inv-root td.tl{font-size:10pt}
    #dy-inv-root tr.pay td.tl{text-align:right;padding-inline:3mm}
    #dy-inv-root tr{break-inside:avoid}

    #dy-inv-root .foot{display:grid;grid-template-columns:1fr 1fr;gap:1mm;margin-top:1.4mm;break-inside:avoid}
    #dy-inv-root .box{border:.3mm solid var(--bd);border-radius:1.6mm}
    #dy-inv-root .fr{display:grid;gap:1mm;align-content:start}
    #dy-inv-root .terms,#dy-inv-root .notes{display:flex;align-items:center;gap:6mm;height:6.8mm;padding:0 3mm;font-size:9.5pt}
    #dy-inv-root .tt{font-size:10pt}
    #dy-inv-root .ck{display:inline-flex;align-items:center;gap:2mm}
    #dy-inv-root .ck u{display:inline-block;width:4.6mm;height:4.6mm;border:.3mm solid var(--bd);text-decoration:none}
    #dy-inv-root .dots{flex:1;border-bottom:.35mm dotted var(--g);height:3mm}
    #dy-inv-root .sign{height:15mm;padding:2mm 3mm;font-size:9.5pt;font-weight:700}

    @media print{
      html.dy-inv-on,html.dy-inv-on body{height:auto!important;min-height:0!important;overflow:visible!important;position:static!important;
        margin:0!important;padding:0!important;background:#fff!important}
      html.dy-inv-on body>*:not(#dy-inv-root){display:none!important}
      html.dy-inv-on #dy-inv-root{display:block!important;position:static!important}
    }`;

  // src/invoice/content.ts
  var IS_TOP = window.top === window;
  var isCtrlP = (e) => (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.code === "KeyP" || String(e.key || "").toLowerCase() === "p");
  function readCfg() {
    let raw = {};
    let font = "";
    try {
      const j = JSON.parse(document.documentElement.getAttribute(INVOICE_ATTR) || "{}");
      raw = j.cfg || {};
      font = j.font || "";
    } catch {
    }
    return { cfg: mergeInvoiceConfig(raw), font };
  }
  function currentOppId() {
    const fc = getFC();
    if (!fc) return null;
    try {
      if (fc.data.entity.getEntityName() !== "opportunity") return null;
      const id = fc.data.entity.getId();
      return id ? cleanId(id) : null;
    } catch {
      return null;
    }
  }
  var root = null;
  var pageStyle = null;
  function ensureStyles() {
    if (document.getElementById("dy-inv-css")) return;
    const s = document.createElement("style");
    s.id = "dy-inv-css";
    s.textContent = EMBEDDED_FONTS_CSS + "\n" + INVOICE_CSS;
    document.head.appendChild(s);
  }
  function activate(data) {
    const { cfg } = readCfg();
    ensureStyles();
    if (!root || !root.isConnected) {
      root = document.createElement("div");
      root.id = "dy-inv-root";
      root.setAttribute("dir", "rtl");
      root.lang = "fa";
      document.body.appendChild(root);
    }
    root.innerHTML = renderInvoice(data, cfg);
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.textContent = INVOICE_PAGE_CSS;
    }
    if (!pageStyle.isConnected) document.head.appendChild(pageStyle);
    document.documentElement.classList.add("dy-inv-on");
  }
  function deactivate() {
    document.documentElement.classList.remove("dy-inv-on");
    pageStyle?.remove();
    if (root) root.innerHTML = "";
  }
  var toastEl = null;
  var toastTimer = 0;
  function hideToast() {
    clearTimeout(toastTimer);
    toastEl?.remove();
    toastEl = null;
  }
  function toast(text, err = false, ms = 0) {
    hideToast();
    toastEl = document.createElement("div");
    toastEl.setAttribute("role", "status");
    toastEl.style.cssText = `position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2147483002;padding:12px 18px;border-radius:12px;font:600 13.5px Vazirmatn,"Segoe UI",Tahoma,sans-serif;direction:rtl;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.35);background:${err ? "#b3261e" : "#1f2937"}`;
    toastEl.textContent = text;
    document.body.appendChild(toastEl);
    if (ms) toastTimer = window.setTimeout(hideToast, ms);
  }
  var emptyState = (id = null) => ({ id, data: null, at: 0, tryAt: 0 });
  var state = emptyState();
  var loading = false;
  var busy = false;
  var forceUntil = 0;
  async function fetchFor(id) {
    const { cfg } = readCfg();
    loading = true;
    state.tryAt = Date.now();
    try {
      const data = await loadData(id, cfg);
      if (currentOppId() === id) state = { id, data, at: Date.now(), tryAt: state.tryAt };
      return data;
    } finally {
      loading = false;
    }
  }
  async function printInvoice(force) {
    if (busy) return;
    const id = currentOppId();
    if (!id) return;
    busy = true;
    try {
      toast("در حال آماده‌سازی فاکتور…");
      let dirty = false;
      try {
        dirty = !!getFC()?.data.getIsDirty();
      } catch {
      }
      while (loading) await new Promise((r) => setTimeout(r, 50));
      await fetchFor(id);
      if (force) forceUntil = Date.now() + 12e4;
      hideToast();
      if (dirty) toast("تغییرات ذخیره‌نشدهٔ فرم در فاکتور نیست.", false, 3500);
      await new Promise((r) => setTimeout(r, 50));
      window.print();
    } catch (e) {
      console.warn("invoice:", e);
      toast("آماده‌سازی فاکتور ناموفق بود: " + errorMessage(e), true, 6e3);
    } finally {
      busy = false;
    }
  }
  var BTN_ID = "dy-inv-btn";
  var PRINT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3m-3 11H8v-5h8zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1m-1-9H6v4h12z"/></svg>';
  function ensureButton(isOpp) {
    let btn = document.getElementById(BTN_ID);
    const fab = document.getElementById("dy-fab");
    if (!isOpp) {
      btn?.remove();
      return;
    }
    if (!fab) return;
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = BTN_ID;
      btn.className = "dy-fb tonal";
      btn.title = "چاپ فاکتور";
      btn.setAttribute("aria-label", "چاپ فاکتور");
      btn.innerHTML = `<span class="ic">${PRINT_SVG}</span><span class="lbl">چاپ فاکتور</span>`;
      btn.onclick = () => void printInvoice(true);
    }
    if (btn.parentNode !== fab) fab.insertBefore(btn, fab.querySelector(".dy-fh"));
  }
  function tick() {
    const id = currentOppId();
    ensureButton(!!id);
    if (!id) {
      if (state.id) state = emptyState();
      return;
    }
    if (state.id !== id) state = emptyState(id);
    const age = Date.now() - (state.data ? state.at : state.tryAt);
    if (!loading && !busy && age > (state.data ? 45e3 : 15e3)) {
      fetchFor(id).catch((e) => console.warn("invoice prefetch:", e));
    }
  }
  function startTop() {
    console.info(`DY Invoice Print ${"1.17.3"} loaded`);
    window.__dyInvoiceKey = (e) => {
      if (!isCtrlP(e) || !currentOppId() || !readCfg().cfg.ctrlP) return false;
      e.preventDefault();
      e.stopImmediatePropagation();
      void printInvoice(false);
      return true;
    };
    window.addEventListener("keydown", (e) => {
      window.__dyInvoiceKey?.(e);
    }, true);
    window.addEventListener("beforeprint", () => {
      const id = currentOppId();
      if (!id || !state.data || state.id !== id) return;
      if (!(readCfg().cfg.ctrlP || Date.now() < forceUntil)) return;
      activate(state.data);
    });
    window.addEventListener("afterprint", deactivate);
    setInterval(tick, 1e3);
    setTimeout(tick, 0);
    window.__dyInvoice = { renderInvoice, loadData, readCfg, activate, deactivate };
  }
  function startChild() {
    window.addEventListener("keydown", (e) => {
      if (!isCtrlP(e)) return;
      try {
        if (window.top?.__dyInvoiceKey?.(e)) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      } catch {
      }
    }, true);
  }
  if (!window.__dyInvoicePrint) {
    window.__dyInvoicePrint = true;
    if (IS_TOP) startTop();
    else startChild();
  }
})();
