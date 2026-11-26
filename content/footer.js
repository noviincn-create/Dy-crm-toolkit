"use strict";
(() => {
  // src/shared/config.ts
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

  // src/shared/text.ts
  var FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
  var toFaDigits = (s) => String(s ?? "").replace(/[0-9]/g, (d) => FA_DIGITS.charAt(Number(d)));

  // src/footer/css.ts
  var cssStr = (s) => '"' + s.replace(/[\\"]/g, "\\$&").replace(/\r?\n/g, "\\A ") + '"';
  var KEEP_PARAMS = ["etn", "id", "pagetype", "appid"];
  function footerUrl(href, trim) {
    try {
      const u = new URL(href);
      u.hash = "";
      if (trim) {
        for (const k of [...u.searchParams.keys()]) if (!KEEP_PARAMS.includes(k)) u.searchParams.delete(k);
      }
      return u.toString().replace(/^https?:\/\//, "");
    } catch {
      return href;
    }
  }
  var STAMP_RATIO = 613 / 940;
  function buildFooterCss(cfg2, ctx) {
    if (!cfg2.enabled) return "";
    const stampSrc = cfg2.stamp ? globalThis.__DY_STAMP : "";
    const sz = stampSrc ? 7.5 : cfg2.size;
    const base = `font:${sz}pt/1.5 "DY Vazir",Vazirmatn,"Segoe UI",Tahoma,sans-serif;color:#555;white-space:pre-line;unicode-bidi:plaintext`;
    const rules = [];
    const lines = [];
    if (cfg2.title && ctx.title.trim()) lines.push(ctx.title.trim().replace(/\s+/g, " "));
    if (cfg2.url) lines.push("\u2066" + footerUrl(ctx.href, cfg2.trimUrl) + "\u2069");
    if (stampSrc) {
      const w = cfg2.stampW, h = Math.round(w * STAMP_RATIO * 10) / 10;
      const mb = Math.ceil(h + 8);
      const box = `${base};vertical-align:middle;padding:0 2mm`;
      rules.push(`margin-bottom:${mb}mm;`);
      rules.push(`@bottom-center{content:" ";width:${w + 4}mm;background:url("${stampSrc}") center/contain no-repeat;-webkit-print-color-adjust:exact;print-color-adjust:exact}`);
      if (cfg2.page) rules.push(`@bottom-right{content:"صفحه " counter(page,persian) " از " counter(pages,persian)${cfg2.date ? ' "\\A ' + toFaDigits(ctx.when) + '"' : ""};${box};text-align:right}`);
      else if (cfg2.date) rules.push(`@bottom-right{content:${cssStr(toFaDigits(ctx.when))};${box};text-align:right}`);
      if (lines.length) rules.push(`@bottom-left{content:${cssStr(lines.join("\n"))};${box};text-align:left;overflow:hidden}`);
      return `@page{${rules.join("")}}`;
    }
    const box = `${base};vertical-align:top;padding-top:3mm`;
    if (cfg2.page) rules.push(`@bottom-right{content:"صفحه " counter(page,persian) " از " counter(pages,persian);${box};text-align:right}`);
    if (cfg2.date) rules.push(`@bottom-left{content:${cssStr(toFaDigits(ctx.when))};${box};text-align:left;direction:rtl}`);
    if (lines.length) rules.push(`@bottom-center{content:${cssStr(lines.join("\n"))};${box};text-align:center;overflow:hidden}`);
    return rules.length ? `@page{${rules.join("")}}` : "";
  }

  // src/footer/content.ts
  var STYLE_ID = "dy-footer-css";
  var cfg = mergeFooterConfig(null);
  var whenNow = () => {
    const d = /* @__PURE__ */ new Date();
    try {
      const date = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tehran" }).format(d);
      const time = new Intl.DateTimeFormat("fa-IR-u-nu-latn", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tehran" }).format(d);
      return `${date}  ${time}`;
    } catch {
      return d.toISOString().slice(0, 16).replace("T", " ");
    }
  };
  function applyFooter() {
    const css = buildFooterCss(cfg, { title: document.title, href: location.href, when: whenNow() });
    let el = document.getElementById(STYLE_ID);
    if (!css) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      el.media = "print";
      (document.head || document.documentElement).appendChild(el);
    }
    if (el.textContent !== css) el.textContent = css;
  }
  if (!window.top || window.top === window) {
    const load = (raw) => {
      cfg = mergeFooterConfig(raw);
      applyFooter();
    };
    chrome.storage.local.get({ [FOOTER_STORAGE_KEY]: {} }).then((r) => load(r[FOOTER_STORAGE_KEY]), () => load({}));
    chrome.storage.onChanged.addListener((ch, area) => {
      const c = ch[FOOTER_STORAGE_KEY];
      if (area === "local" && c) load(c.newValue);
    });
    window.addEventListener("beforeprint", applyFooter);
  }
})();
