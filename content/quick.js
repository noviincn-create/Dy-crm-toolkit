"use strict";
(() => {
  // src/shared/config.ts
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
  var QUICK_ATTR = "data-dy-quick";
  var QUICK_CRM_ATTR = "data-dy-crm";
  var QUICK_OPEN_EVT = "dy-quick-open";

  // src/close/ui/icons.ts
  var ICONS = {
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

  // src/shared/text.ts
  var faNum = (n) => {
    try {
      return Number(n).toLocaleString("fa-IR");
    } catch {
      return String(n);
    }
  };
  var HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  var esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => HTML_ESCAPES[c] ?? c);
  var errorMessage = (e) => e instanceof Error ? e.message : String(e);

  // src/close/constants.ts
  var DLG_ID = "dy-close-dlg";

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

  // src/shared/jalali.ts
  function formatJalali(d) {
    try {
      return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }

  // src/shared/product-search.ts
  var FA = "۰۱۲۳۴۵۶۷۸۹";
  var AR = "٠١٢٣٤٥٦٧٨٩";
  var normQ = (s) => String(s || "").toLowerCase().replace(/[يىئ]/g, "ی").replace(/ك/g, "ک").replace(/[ۀة]/g, "ه").replace(/[أإآ]/g, "ا").replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d))).replace(/[‌​ـً-ٟ]/g, "").replace(/\s+/g, " ").trim();
  var searchKeys = (name, num) => ({
    key: normQ(name + " " + (num || "")),
    nameKey: normQ(name)
  });
  function searchProducts(list, q, limit = 40) {
    const toks = normQ(q).split(" ").filter(Boolean);
    if (!toks.length) return list.slice(0, limit);
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
    return res.slice(0, limit).map((r) => r.p);
  }

  // src/quick/client.ts
  async function quickCall(op, payload) {
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: "quick", req: { op, ...payload } });
    } catch {
      throw new Error("ارتباط با افزونه قطع شد؛ این صفحه را یک بار تازه‌سازی (F5) کنید.");
    }
    if (!res) throw new Error("افزونه پاسخ نداد؛ دوباره تلاش کنید.");
    if ("error" in res) throw new Error(res.error);
    if (!res.ok) throw new Error(res.message);
    return res.data;
  }

  // src/quick/styles.ts
  var QUICK_CSS = `
  .dy-hd,.dy-bd,.dy-ft{direction:rtl}
  .qk-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:12px}
  @media (max-width:560px){.qk-grid{grid-template-columns:1fr}}
  .qk-grid .dy-f{margin-bottom:12px}
  #qk-sel{margin:12px 0 4px;border:1px solid var(--ln);border-radius:var(--r3);background:var(--s2);overflow:hidden}
  #qk-sel:empty{display:none}
  .qk-h{display:flex;justify-content:space-between;padding:8px 12px;font-size:12px;font-weight:800;color:var(--mu);border-bottom:1px solid var(--ln)}
  .qk-row{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--ln)}
  .qk-row:last-child{border-bottom:0}
  .qk-row .nm{flex:1;min-width:0;font-weight:700;overflow-wrap:anywhere}
  .qk-row .pr{color:var(--mu);font-size:12.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
  .qk-step{display:inline-flex;align-items:center;gap:4px;direction:ltr}
  .qk-step button,.qk-rm{width:30px;height:30px;border:1px solid var(--ln);border-radius:var(--r1);background:var(--bg);color:var(--tx);font:800 16px var(--font);cursor:pointer;padding:0;display:grid;place-items:center}
  .qk-step button:hover,.qk-rm:hover{background:var(--s3)}
  .qk-rm{border-color:transparent;background:transparent;color:var(--mu)}.qk-rm:hover{color:var(--er)}
  .qk-rm svg{width:18px;height:18px}
  .qk-step button:focus-visible,.qk-rm:focus-visible,.qk-step input:focus-visible{outline:none;box-shadow:var(--ring)}
  .dyx .qk-step input[type=text]{width:48px;min-height:30px;padding:2px 4px;text-align:center;font-weight:700;border-radius:var(--r1)}
  .qk-total{display:flex;justify-content:space-between;padding:9px 12px;font-weight:800;background:var(--bg)}
  .qk-total span:last-child{font-variant-numeric:tabular-nums}
  #dy-slist{max-height:min(340px,48vh);overflow:auto;border:1px solid var(--ln);border-radius:var(--r3);background:var(--bg);padding:4px}
  #dy-slist .it{display:flex;align-items:center;gap:12px;padding:11px 12px;cursor:pointer;border-radius:var(--r2);transition:background .12s}
  #dy-slist .it:hover{background:var(--s2)}
  #dy-slist .it.sel{background:var(--pr-s);box-shadow:inset -3px 0 0 var(--pr)}
  #dy-slist .it.off{opacity:.55;cursor:not-allowed}
  #dy-slist .nm{flex:1;min-width:0;font-weight:700;overflow-wrap:anywhere}
  #dy-slist .cd{color:var(--mu);font-size:11.5px;direction:ltr;background:var(--s3);border-radius:var(--r1);padding:1px 8px;white-space:nowrap;font-family:Consolas,monospace}
  #dy-slist .tm{color:var(--mu);font-size:12.5px;white-space:nowrap}
  #dy-slist .empty{padding:32px 14px;color:var(--mu);text-align:center}
  .qk-done{display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px 6px 10px;text-align:center}
  .qk-done .big{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:var(--ok-s);color:var(--ok)}
  .qk-done .big svg{width:32px;height:32px}
  .qk-done p{margin:0;white-space:pre-line}
  .qk-done .dy-num{font-size:24px}
  .dy-btn.danger.fill{background:var(--er);border-color:var(--er);color:#fff}.dy-btn.danger.fill:hover{filter:brightness(.92)}
`;

  // src/quick/host.ts
  var current = null;
  var isDialogOpen = () => current !== null;
  var FOCUSABLE = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
  function route(e) {
    const c = current;
    if (!c) return;
    if (e.type === "keydown") {
      const inside = e.target instanceof Node && c.host.contains(e.target);
      if (e.key === "Escape") {
        e.preventDefault();
        if (!c.dlg.locked) c.dlg.close();
      } else if (!inside) {
        c.dlg.box.focus();
      } else if (e.key === "Tab") {
        const f = [...c.dlg.box.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === c.dlg.active());
        if (f.length) {
          const i = f.indexOf(c.dlg.active());
          const next = e.shiftKey ? i <= 0 ? f.length - 1 : i - 1 : i < 0 || i === f.length - 1 ? 0 : i + 1;
          e.preventDefault();
          f[next].focus();
        }
      } else {
        c.opts.onKey?.(e);
      }
    }
    e.stopImmediatePropagation();
  }
  function openDialog(o) {
    current?.dlg.close();
    const host = document.createElement("div");
    host.setAttribute("style", "all:initial;position:fixed;inset:0;z-index:2147483647");
    const shadow = host.attachShadow({ mode: globalThis.__dyQuickTest ? "open" : "closed" });
    const style = document.createElement("style");
    style.textContent = CLOSE_CSS + QUICK_CSS;
    const bg = h(`<div id="${DLG_ID}-bg" class="dyx"><div id="${DLG_ID}" class="${o.wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="dy-t" tabindex="-1">
      <div class="dy-hd"><span class="dy-badge">${o.icon ? ICONS[o.icon] : ""}</span>
        <div><h3 id="dy-t"></h3><p class="dy-sub"></p></div>
        <button type="button" class="dy-x" aria-label="بستن">${ICONS.close}</button></div>
      <div class="dy-bd"></div><div class="dy-ft"></div></div></div>`);
    shadow.append(style, bg);
    const box = bg.firstElementChild;
    const dlg = {
      box,
      body: box.querySelector(".dy-bd"),
      foot: box.querySelector(".dy-ft"),
      locked: false,
      $: (s) => bg.querySelector(s),
      active: () => shadow.activeElement,
      target: (e) => e.composedPath()[0] instanceof Element ? e.composedPath()[0] : shadow.activeElement,
      setTitle(title, sub) {
        bg.querySelector("h3").textContent = title;
        const s = bg.querySelector(".dy-sub");
        s.textContent = sub ?? "";
        s.hidden = !sub;
      },
      close() {
        if (current?.dlg !== dlg) return;
        current = null;
        for (const t of ["keydown", "keyup", "keypress"]) window.removeEventListener(t, route, true);
        host.remove();
        try {
          prev?.focus?.();
        } catch {
        }
        o.onClose?.();
      }
    };
    dlg.setTitle(o.title, o.sub);
    bg.querySelector(".dy-x").onclick = () => {
      if (!dlg.locked) dlg.close();
    };
    bg.addEventListener("mousedown", (e) => {
      if (e.target === bg && !dlg.locked) dlg.close();
    });
    const prev = document.activeElement;
    current = { dlg, host, shadow, prev, opts: o };
    for (const t of ["keydown", "keyup", "keypress"]) window.addEventListener(t, route, true);
    document.documentElement.appendChild(host);
    box.focus();
    return dlg;
  }

  // src/quick/dialogs.ts
  var fmt = (n) => Number(n || 0).toLocaleString("en-US");
  var toNum = (s) => Number(String(s).replace(/[۰-۹٠-٩]/g, (d) => String(d.charCodeAt(0) & 15)).replace(/[^\d.]/g, ""));
  var clockFa = (d) => {
    try {
      return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(d);
    } catch {
      return d.toTimeString().slice(0, 5);
    }
  };
  var durFa = (ms) => {
    const m = Math.floor(Math.max(0, ms) / 6e4);
    const hh = Math.floor(m / 60);
    return hh ? `${faNum(hh)} ساعت و ${faNum(m % 60)} دقیقه` : `${faNum(m)} دقیقه`;
  };
  var kbd = (s) => `<kbd>${s}</kbd>`;
  function showDone(d, o) {
    d.setTitle(o.title, o.sub);
    d.body.innerHTML = `<div class="qk-done"><span class="big">${o.icon ?? ICONS.check}</span>` + o.lines.map((l) => `<p>${esc(l)}</p>`).join("") + (o.number ? `<div class="dy-num">${esc(o.number)}</div>` : "") + `</div>` + (o.warn.length ? `<div class="dy-st warn" role="alert">${esc(o.warn.join("\n"))}</div>` : "");
    d.foot.innerHTML = `<span class="dy-hint"><span>${kbd("Esc")} بستن</span></span><span class="grow"></span><button type="button" class="dy-btn pri" id="qk-close">بستن</button>`;
    d.$("#qk-close").onclick = d.close;
    setTimeout(() => d.$("#qk-close")?.focus(), 0);
    if (!o.warn.length) setTimeout(d.close, 1800);
  }
  function openStartDialog(cfg) {
    let boot = null;
    let prices = {};
    let catalog = [];
    let hits = [];
    let sel = 0;
    let busy = false;
    const chosen = [];
    const d = openDialog({
      title: "شروع جلسهٔ جدید",
      sub: "عنوان، لیست قیمت و محصولات (اختیاری)",
      icon: "timer",
      wide: true,
      onKey(e) {
        const ae = d.target(e);
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void start();
          return;
        }
        if (ae === title) {
          if (e.key === "Enter") {
            e.preventDefault();
            void start();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            q.focus();
          }
        } else if (ae === q) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            sel = Math.min(sel + 1, hits.length - 1);
            renderList();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (sel === 0) title.focus();
            else {
              sel--;
              renderList();
            }
          } else if (e.key === "Enter") {
            e.preventDefault();
            add(hits[sel]);
          }
        }
      }
    });
    d.body.innerHTML = `
    <div class="qk-grid">
      <label class="dy-f"><span>عنوان جلسه / فرصت</span><input id="qk-title" type="text" autocomplete="off"></label>
      <label class="dy-f"><span>لیست قیمت</span><select id="qk-pl" disabled><option>در حال بارگذاری...</option></select></label>
    </div>
    <div class="dy-sbox">${ICONS.search}<input id="qk-q" type="text" role="combobox" aria-controls="dy-plist" aria-expanded="true"
      placeholder="جست‌وجوی محصول (نام یا کد)؛ Enter = افزودن" autocomplete="off" disabled></div>
    <div class="dy-meta"><span id="qk-n"></span><span id="qk-msg"></span></div>
    <div id="dy-plist" role="listbox"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>
    <div id="qk-sel" aria-label="محصولات انتخاب‌شده"></div>
    <label class="dy-sp-chk" style="margin-top:12px"><input id="qk-open" type="checkbox"><span>بعد از شروع، فرصت در یک تب جدید باز شود</span></label>
    <div class="dy-st" id="qk-st" role="status" aria-live="polite" hidden></div>`;
    d.foot.innerHTML = `<span class="dy-hint"><span>${kbd("↑")} ${kbd("↓")} انتخاب</span><span>${kbd("Enter")} افزودن / شروع</span><span>${kbd("Ctrl")}+${kbd("Enter")} شروع</span><span>${kbd("Esc")} بستن</span></span>
    <span class="grow"></span><button type="button" class="dy-btn" id="qk-cancel">لغو</button>
    <button type="button" class="dy-btn ok" id="qk-go" disabled>${ICONS.play}<span>شروع جلسه</span></button>`;
    const $ = d.$;
    const title = $("#qk-title");
    const q = $("#qk-q");
    const pl = $("#qk-pl");
    const go = $("#qk-go");
    const st = $("#qk-st");
    const openChk = $("#qk-open");
    const listEl = $("#dy-plist");
    const selEl = $("#qk-sel");
    openChk.checked = cfg.openForm;
    const now = /* @__PURE__ */ new Date();
    title.value = "جلسه " + formatJalali(now) + " – " + clockFa(now);
    $("#qk-cancel").onclick = d.close;
    go.onclick = () => void start();
    setTimeout(() => {
      title.focus();
      title.select();
    }, 30);
    const priceOf = (p) => prices[p.id + "|" + (p.uom ?? "")] ?? prices[p.id] ?? p.price;
    function renderList() {
      if (!boot) return;
      if (!hits.length) {
        listEl.innerHTML = '<div class="empty">محصولی پیدا نشد.<br><small>املا را بررسی کنید یا عبارت کوتاه‌تری بنویسید.</small></div>';
        $("#qk-n").textContent = "";
        return;
      }
      $("#qk-n").textContent = hits.length >= 40 ? "۴۰ نتیجهٔ اول؛ برای محدودتر شدن بیشتر تایپ کنید" : faNum(hits.length) + " نتیجه";
      listEl.innerHTML = hits.map((p, i) => {
        const pr = priceOf(p);
        return `<div class="it${i === sel ? " sel" : ""}" role="option" aria-selected="${i === sel}" data-i="${i}"><span class="nm">${esc(p.name)}</span>${p.num ? `<span class="cd">${esc(p.num)}</span>` : ""}<span class="pr">${pr ? fmt(pr) : ""}</span></div>`;
      }).join("");
      listEl.querySelector(".it.sel")?.scrollIntoView({ block: "nearest" });
    }
    function renderSel() {
      if (!chosen.length) {
        selEl.innerHTML = "";
        return;
      }
      let total = 0;
      const rows = chosen.map((c, i) => {
        const pr = priceOf(c.p);
        if (pr) total += pr * c.qty;
        return `<div class="qk-row" data-i="${i}"><span class="nm">${esc(c.p.name)}</span><span class="pr">${pr ? fmt(pr) : "—"}</span><span class="qk-step"><button type="button" data-a="dec" aria-label="کم کردن">−</button><input type="text" inputmode="numeric" value="${c.qty}" aria-label="تعداد"><button type="button" data-a="inc" aria-label="زیاد کردن">+</button></span><button type="button" class="qk-rm" data-a="rm" aria-label="حذف">${ICONS.close}</button></div>`;
      }).join("");
      selEl.innerHTML = `<div class="qk-h"><span>محصولات انتخاب‌شده</span><span>${faNum(chosen.length)} مورد</span></div>${rows}` + (total ? `<div class="qk-total"><span>جمع</span><span>${fmt(total)}</span></div>` : "");
    }
    function add(p) {
      if (!p) return;
      const hit = chosen.find((c) => c.p.id === p.id);
      if (hit) hit.qty++;
      else chosen.push({ p, qty: 1 });
      renderSel();
      q.select();
    }
    const update = () => {
      hits = searchProducts(catalog, q.value);
      sel = 0;
      renderList();
    };
    q.addEventListener("input", update);
    listEl.addEventListener("mousedown", (e) => {
      const it = e.target.closest(".it");
      if (it) {
        e.preventDefault();
        add(hits[Number(it.dataset.i)]);
      }
    });
    selEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-a]");
      const row = b?.closest(".qk-row");
      if (!b || !row) return;
      const i = Number(row.dataset.i);
      const c = chosen[i];
      if (!c) return;
      if (b.dataset.a === "inc") c.qty++;
      else if (b.dataset.a === "dec") c.qty = Math.max(1, c.qty - 1);
      else chosen.splice(i, 1);
      renderSel();
    });
    selEl.addEventListener("change", (e) => {
      const inp = e.target;
      const c = chosen[Number(inp.closest(".qk-row")?.dataset.i)];
      if (!c) return;
      const n = toNum(inp.value);
      c.qty = Number.isFinite(n) && n > 0 ? Math.min(1e5, n) : 1;
      renderSel();
    });
    pl.addEventListener("change", () => void loadPrices());
    async function loadPrices() {
      prices = {};
      if (!pl.value) {
        renderList();
        renderSel();
        return;
      }
      $("#qk-msg").textContent = "در حال دریافت قیمت‌ها...";
      const want = pl.value;
      try {
        const r = await quickCall("prices", { priceLevelId: want });
        if (pl.value === want) prices = r;
        $("#qk-msg").textContent = "";
      } catch (e) {
        $("#qk-msg").textContent = "قیمت‌های این لیست دریافت نشد؛ قیمت پایهٔ محصول نمایش داده می‌شود.";
        console.warn("DY quick prices:", e);
      }
      renderList();
      renderSel();
    }
    async function load(refresh = false) {
      setStatus(st, "");
      try {
        boot = await quickCall("bootstrap", { refresh });
      } catch (e) {
        listEl.innerHTML = "";
        setStatus(st, "بارگذاری ناموفق بود: " + errorMessage(e), "err");
        return;
      }
      catalog = boot.products.map((p) => ({ ...p, ...searchKeys(p.name, p.num) }));
      pl.innerHTML = '<option value="">— بدون لیست قیمت —</option>' + boot.priceLevels.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join("");
      pl.value = boot.mainPriceLevelId ?? "";
      pl.disabled = false;
      q.disabled = false;
      go.disabled = false;
      if (!boot.mainPriceLevelId) setStatus(st, "لیست قیمت «قیمت اصلی» پیدا نشد؛ لیست قیمت را خودتان انتخاب کنید (نام آن را می‌توانید در تنظیمات افزونه تغییر دهید).", "warn");
      else if (boot.productsError) setStatus(st, "فهرست محصولات به‌روز نشد (نسخهٔ ذخیره‌شده نمایش داده می‌شود): " + boot.productsError, "warn");
      update();
      void loadPrices();
    }
    async function start() {
      if (busy || !boot) return;
      const name = title.value.trim();
      if (!name) {
        setStatus(st, "عنوان جلسه را وارد کنید.", "err");
        title.focus();
        return;
      }
      busy = true;
      d.locked = true;
      go.disabled = true;
      setStatus(st, "در حال ساخت فرصت و شروع جلسه...", "busy");
      try {
        const r = await quickCall("start", { name, priceLevelId: pl.value || null, items: chosen.map((c) => ({ productId: c.p.id, qty: c.qty })), openForm: openChk.checked });
        d.locked = false;
        const warn = [];
        if (r.numberError) warn.push("شماره‌گذاری فرصت ناموفق بود: " + r.numberError + "\n(در پنل جلسهٔ CRM می‌توانید دوباره تلاش کنید.)");
        if (r.sessionError) warn.push("فرصت ساخته شد اما جلسه ثبت نشد: " + r.sessionError);
        for (const l of r.lineErrors) warn.push("محصول «" + l.name + "» اضافه نشد: " + l.message);
        showDone(d, {
          title: "جلسه شروع شد",
          sub: name,
          lines: ["«" + name + "»", ...chosen.length ? [faNum(r.added) + " از " + faNum(chosen.length) + " محصول به فرصت اضافه شد."] : []],
          number: r.number,
          warn
        });
      } catch (e) {
        d.locked = false;
        busy = false;
        go.disabled = false;
        setStatus(st, "شروع جلسه ناموفق بود: " + errorMessage(e), "err");
      }
    }
    void load();
  }
  var STATE_LABEL = { RUNNING: "در جریان", PAUSED: "متوقف", PAUSING: "در حال توقف", RESUMING: "در حال ازسرگیری", RECOVERY_REQUIRED: "نیازمند بازیابی" };
  var endable = (s) => s.state === "RUNNING" || s.state === "RECOVERY_REQUIRED";
  function openEndDialog() {
    let list = [];
    let sel = -1;
    let busy = false;
    const d = openDialog({
      title: "پایان جلسه",
      sub: "جلسه‌ای را که می‌خواهید پایان دهید انتخاب کنید",
      icon: "stop",
      onKey(e) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (!list.length) return;
          sel = e.key === "ArrowDown" ? Math.min(sel + 1, list.length - 1) : Math.max(sel - 1, 0);
          render();
        } else if (e.key === "Enter" && d.target(e)?.tagName !== "BUTTON") {
          e.preventDefault();
          void end();
        }
      }
    });
    d.body.innerHTML = '<div id="dy-slist" role="listbox"><div class="empty">در حال بارگذاری...</div></div><div class="dy-st" id="qk-st" role="status" aria-live="polite" hidden style="margin-top:12px"></div>';
    d.foot.innerHTML = `<span class="dy-hint"><span>${kbd("↑")} ${kbd("↓")} انتخاب</span><span>${kbd("Enter")} پایان جلسه</span><span>${kbd("Esc")} بستن</span></span>
    <span class="grow"></span><button type="button" class="dy-btn" id="qk-cancel">لغو</button>
    <button type="button" class="dy-btn danger fill" id="qk-end" disabled>${ICONS.stop}<span>پایان جلسه</span></button>`;
    const $ = d.$;
    const listEl = $("#dy-slist");
    const st = $("#qk-st");
    const endBtn = $("#qk-end");
    $("#qk-cancel").onclick = d.close;
    endBtn.onclick = () => void end();
    function render() {
      if (!list.length) {
        listEl.innerHTML = '<div class="empty">جلسهٔ فعالی وجود ندارد.<br><small>برای شروع جلسهٔ جدید، میان‌بُر شروع را بزنید.</small></div>';
        endBtn.disabled = true;
        return;
      }
      listEl.innerHTML = list.map((s, i) => `<div class="it${i === sel ? " sel" : ""}${endable(s) ? "" : " off"}" role="option" aria-selected="${i === sel}" aria-disabled="${!endable(s)}" data-i="${i}"><span class="nm">${esc(s.name)}</span>${s.number ? `<span class="cd">${esc(s.number)}</span>` : ""}<span class="tm">${s.state === "RUNNING" ? "" : esc(STATE_LABEL[s.state] ?? s.state) + " • "}${durFa(s.activeMs)}</span></div>`).join("");
      endBtn.disabled = busy || !(sel >= 0 && list[sel] && endable(list[sel]));
      listEl.querySelector(".it.sel")?.scrollIntoView({ block: "nearest" });
    }
    listEl.addEventListener("mousedown", (e) => {
      const it = e.target.closest(".it");
      if (it) {
        e.preventDefault();
        sel = Number(it.dataset.i);
        render();
      }
    });
    async function end() {
      const s = list[sel];
      if (busy || !s) return;
      if (!endable(s)) {
        setStatus(st, "این جلسه متوقف است؛ برای پایان، ابتدا آن را در پنل جلسهٔ CRM ادامه دهید.", "warn");
        return;
      }
      busy = true;
      d.locked = true;
      endBtn.disabled = true;
      setStatus(st, "در حال افزودن محصول پایان جلسه به فرصت...", "busy");
      try {
        const r = await quickCall("end", { sessionId: s.id });
        d.locked = false;
        showDone(d, {
          title: "جلسه پایان یافت",
          sub: s.name,
          lines: [r.skippedPrint ? "چون همهٔ محصولات فرصت «پرینت» هستند، زمان جلسه اضافه نشد." : "محصول «" + r.productName + "» " + (r.already ? "از قبل روی فرصت بود." : "به تعداد " + faNum(r.minutes) + " (دقیقه) به فرصت اضافه شد.")],
          number: s.number,
          warn: []
        });
      } catch (e) {
        d.locked = false;
        busy = false;
        setStatus(st, errorMessage(e), "err");
        render();
      }
    }
    void (async () => {
      try {
        list = (await quickCall("sessions")).sessions;
      } catch (e) {
        listEl.innerHTML = "";
        setStatus(st, "بارگذاری جلسه‌ها ناموفق بود: " + errorMessage(e), "err");
        return;
      }
      sel = Math.max(0, list.findIndex(endable));
      if (!list.length) sel = -1;
      render();
      if (list.length === 1 && !endable(list[0])) setStatus(st, "تنها جلسهٔ فعال متوقف است؛ ابتدا آن را در پنل جلسهٔ CRM ادامه دهید.", "warn");
      setTimeout(() => endBtn.focus(), 0);
    })();
  }

  // src/quick/tap.ts
  var MODS = ["Shift", "Control", "Alt"];
  var trusted = (e) => e.isTrusted || globalThis.__dyQuickTest === true;
  function installTapDetector(o, target = window) {
    let cur = null;
    let downAt = 0;
    let dirty = false;
    let last = null;
    const reset = () => {
      cur = null;
      dirty = false;
      last = null;
    };
    const onDown = (e) => {
      if (!trusted(e) || e.repeat) return;
      if (!MODS.includes(e.key)) {
        dirty = true;
        last = null;
        return;
      }
      const others = e.key !== "Shift" && e.shiftKey || e.key !== "Control" && e.ctrlKey || e.key !== "Alt" && e.altKey || e.metaKey;
      if (cur !== null || others) {
        dirty = true;
        last = null;
        return;
      }
      cur = e.key;
      downAt = Date.now();
      dirty = false;
    };
    const onUp = (e) => {
      if (!trusted(e)) return;
      if (e.key !== cur) {
        if (!MODS.includes(e.key)) return;
        cur = null;
        dirty = false;
        last = null;
        return;
      }
      const now = Date.now();
      const clean = !dirty && now - downAt <= o.tapMs();
      const key = cur;
      cur = null;
      dirty = false;
      if (!clean) {
        last = null;
        return;
      }
      if (last && last.key === key && now - last.at <= o.tapMs()) {
        last = null;
        const k = o.keys();
        if (!k.enabled || o.blocked()) return;
        if (k.start === key) o.onTap("start");
        else if (k.end === key) o.onTap("end");
        return;
      }
      last = { key, at: now };
    };
    const onMouse = () => {
      dirty = true;
      last = null;
    };
    target.addEventListener("keydown", onDown, true);
    target.addEventListener("keyup", onUp, true);
    target.addEventListener("mousedown", onMouse, true);
    target.addEventListener("wheel", onMouse, { capture: true, passive: true });
    target.addEventListener("blur", reset);
    return () => {
      target.removeEventListener("keydown", onDown, true);
      target.removeEventListener("keyup", onUp, true);
      target.removeEventListener("mousedown", onMouse, true);
      target.removeEventListener("wheel", onMouse, true);
      target.removeEventListener("blur", reset);
    };
  }

  // src/quick/content.ts
  if (!globalThis.__dyQuick) {
    globalThis.__dyQuick = true;
    const isTop = window.top === window;
    let cfg = mergeQuickConfig(null);
    const reload = async () => {
      try {
        cfg = mergeQuickConfig((await chrome.storage.local.get({ [QUICK_STORAGE_KEY]: {} }))[QUICK_STORAGE_KEY]);
      } catch {
      }
    };
    void reload();
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && QUICK_STORAGE_KEY in changes) void reload();
      });
    } catch {
    }
    const open = (which) => {
      if (which === "end") openEndDialog();
      else openStartDialog(cfg);
    };
    installTapDetector({
      tapMs: () => cfg.tapMs,
      keys: () => ({ start: cfg.startKey, end: cfg.endKey, enabled: cfg.enabled }),
      blocked: isDialogOpen,
      onTap(which) {
        if (isTop) {
          open(which);
          return;
        }
        try {
          void chrome.runtime.sendMessage({ type: "quickTrigger", which }).catch(() => void 0);
        } catch {
        }
      }
    });
    if (isTop) {
      document.documentElement.setAttribute(QUICK_ATTR, "1");
      try {
        chrome.runtime.onMessage.addListener((m) => {
          if (m?.type === "quickOpen" && (m.which === "start" || m.which === "end")) open(m.which);
        });
      } catch {
      }
      document.addEventListener(QUICK_OPEN_EVT, (e) => {
        const w = String(e.detail);
        if (w === "start" || w === "end") open(w);
      });
      if (/(^|\.)crm\.systan\.com$/i.test(location.hostname)) {
        const t = setInterval(() => {
          const url = document.documentElement.getAttribute(QUICK_CRM_ATTR);
          if (!url) return;
          clearInterval(t);
          try {
            void chrome.runtime.sendMessage({ type: "quick", req: { op: "setUrl", url } }).catch(() => void 0);
          } catch {
          }
        }, 2500);
      }
    }
  }
})();
