import { DLG_ID } from "../constants";

/**
 * Stylesheet for every toolkit widget (action dock, dialogs, toast, product search, session panel).
 * Design language: soft slate surfaces, one indigo accent, emerald for "win", 12–20px radii, layered shadows, light + dark.
 */
export const CLOSE_CSS = `
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
