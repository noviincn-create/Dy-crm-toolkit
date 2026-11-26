/**
 * DY Invoice Print
 * On the opportunity form, Ctrl+P / browser print / the "چاپ فاکتور" button shows a Persian sales invoice
 * (صورت‌حساب فروش کالا و خدمات) built from Web API data instead of the CRM screen.
 * Runs in world MAIN (needs Xrm). Settings arrive through invoice/bridge.ts (data-dy-invoice attribute).
 */
import { INVOICE_ATTR, mergeInvoiceConfig, type InvoiceBridgePayload, type InvoiceConfig } from "../shared/config";
import { errorMessage } from "../shared/text";
import { cleanId, getFC } from "../shared/xrm";
import { loadData, type InvoiceData } from "./data";
import { renderInvoice } from "./render";
import { EMBEDDED_FONTS_CSS } from "./fonts";
import { INVOICE_CSS, INVOICE_PAGE_CSS } from "./styles";

const IS_TOP = window.top === window;
const isCtrlP = (e: KeyboardEvent): boolean =>
  (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.code === "KeyP" || String(e.key || "").toLowerCase() === "p");

// ───────────── settings ─────────────
function readCfg(): { cfg: InvoiceConfig; font: string } {
  let raw: InvoiceBridgePayload["cfg"] = {};
  let font = "";
  try {
    const j = JSON.parse(document.documentElement.getAttribute(INVOICE_ATTR) || "{}") as Partial<InvoiceBridgePayload>;
    raw = j.cfg || {};
    font = j.font || "";
  } catch { /* attribute not set yet */ }
  return { cfg: mergeInvoiceConfig(raw), font };
}

function currentOppId(): string | null {
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

// ───────────── DOM: styles, activation ─────────────
let root: HTMLDivElement | null = null;
let pageStyle: HTMLStyleElement | null = null;

function ensureStyles(): void {
  if (document.getElementById("dy-inv-css")) return;
  const s = document.createElement("style");
  s.id = "dy-inv-css";
  s.textContent = EMBEDDED_FONTS_CSS + "\n" + INVOICE_CSS;
  document.head.appendChild(s);
}

function activate(data: InvoiceData): void {
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

function deactivate(): void {
  document.documentElement.classList.remove("dy-inv-on");
  pageStyle?.remove();
  if (root) root.innerHTML = "";
}

// ───────────── toast ─────────────
let toastEl: HTMLDivElement | null = null;
let toastTimer = 0;

function hideToast(): void {
  clearTimeout(toastTimer);
  toastEl?.remove();
  toastEl = null;
}

function toast(text: string, err = false, ms = 0): void {
  hideToast();
  toastEl = document.createElement("div");
  toastEl.setAttribute("role", "status");
  toastEl.style.cssText =
    "position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2147483002;padding:12px 18px;border-radius:12px;" +
    `font:600 13.5px Vazirmatn,"Segoe UI",Tahoma,sans-serif;direction:rtl;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.35);background:${err ? "#b3261e" : "#1f2937"}`;
  toastEl.textContent = text;
  document.body.appendChild(toastEl);
  if (ms) toastTimer = window.setTimeout(hideToast, ms);
}

// ───────────── state, prefetch, triggers ─────────────
interface Prefetch {
  id: string | null;
  data: InvoiceData | null;
  at: number;
  tryAt: number;
}
const emptyState = (id: string | null = null): Prefetch => ({ id, data: null, at: 0, tryAt: 0 });

let state: Prefetch = emptyState();
let loading = false;
let busy = false;
let forceUntil = 0;

async function fetchFor(id: string): Promise<InvoiceData> {
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

async function printInvoice(force: boolean): Promise<void> {
  if (busy) return;
  const id = currentOppId();
  if (!id) return;
  busy = true;
  try {
    toast("در حال آماده‌سازی فاکتور…");
    let dirty = false;
    try { dirty = !!getFC()?.data.getIsDirty(); } catch { /* ignore */ }
    while (loading) await new Promise((r) => setTimeout(r, 50));
    await fetchFor(id);
    if (force) forceUntil = Date.now() + 120_000;
    hideToast();
    if (dirty) toast("تغییرات ذخیره‌نشدهٔ فرم در فاکتور نیست.", false, 3500);
    await new Promise((r) => setTimeout(r, 50));
    window.print();
  } catch (e) {
    console.warn("invoice:", e);
    toast("آماده‌سازی فاکتور ناموفق بود: " + errorMessage(e), true, 6000);
  } finally {
    busy = false;
  }
}

// floating button next to the other toolkit buttons
const BTN_ID = "dy-inv-btn";
const PRINT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3m-3 11H8v-5h8zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1m-1-9H6v4h12z"/></svg>';

function ensureButton(isOpp: boolean): void {
  let btn = document.getElementById(BTN_ID) as HTMLButtonElement | null;
  const fab = document.getElementById("dy-fab");
  if (!isOpp) { btn?.remove(); return; }
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

function tick(): void {
  const id = currentOppId();
  ensureButton(!!id);
  if (!id) { if (state.id) state = emptyState(); return; }
  if (state.id !== id) state = emptyState(id);
  const age = Date.now() - (state.data ? state.at : state.tryAt);
  if (!loading && !busy && age > (state.data ? 45_000 : 15_000)) {
    fetchFor(id).catch((e) => console.warn("invoice prefetch:", e));
  }
}

export interface InvoiceDebugApi {
  renderInvoice: typeof renderInvoice;
  loadData: typeof loadData;
  readCfg: typeof readCfg;
  activate: typeof activate;
  deactivate: typeof deactivate;
}

function startTop(): void {
  console.info(`DY Invoice Print ${__VERSION__} loaded`);

  window.__dyInvoiceKey = (e) => {
    if (!isCtrlP(e) || !currentOppId() || !readCfg().cfg.ctrlP) return false;
    e.preventDefault();
    e.stopImmediatePropagation();
    void printInvoice(false);
    return true;
  };
  window.addEventListener("keydown", (e) => { window.__dyInvoiceKey?.(e); }, true);

  // menu / browser print: render synchronously from the prefetched data
  window.addEventListener("beforeprint", () => {
    const id = currentOppId();
    if (!id || !state.data || state.id !== id) return;
    if (!(readCfg().cfg.ctrlP || Date.now() < forceUntil)) return;
    activate(state.data);
  });
  window.addEventListener("afterprint", deactivate);

  setInterval(tick, 1000);
  setTimeout(tick, 0);

  window.__dyInvoice = { renderInvoice, loadData, readCfg, activate, deactivate };
}

/** Forms in child frames: forward Ctrl+P to the top window. */
function startChild(): void {
  window.addEventListener("keydown", (e) => {
    if (!isCtrlP(e)) return;
    try {
      if (window.top?.__dyInvoiceKey?.(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
    } catch { /* cross-origin frame */ }
  }, true);
}

if (!window.__dyInvoicePrint) {
  window.__dyInvoicePrint = true;
  if (IS_TOP) startTop();
  else startChild();
}
