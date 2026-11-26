/** Extra styles of the quick-session popup (added to CLOSE_CSS inside the shadow root). */
export const QUICK_CSS = `
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
