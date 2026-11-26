/** The two quick-session popups: start (title + price list + products) and end (pick a running session). */
import { ICONS } from "../close/ui/icons";
import { esc, setStatus } from "../close/ui/dom";
import { formatJalali } from "../shared/jalali";
import { searchKeys, searchProducts, type Searchable } from "../shared/product-search";
import { errorMessage, faNum } from "../shared/text";
import type { QuickConfig } from "../shared/config";
import { quickCall } from "./client";
import { openDialog, type QDialog } from "./host";
import type { QuickLiveSession, QuickProduct, QuickResults } from "./protocol";

type Row = QuickProduct & Searchable;
const fmt = (n: number): string => Number(n || 0).toLocaleString("en-US");
const toNum = (s: string): number => Number(String(s).replace(/[۰-۹٠-٩]/g, (d) => String(d.charCodeAt(0) & 15)).replace(/[^\d.]/g, ""));

const clockFa = (d: Date): string => {
  try { return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(d); } catch { return d.toTimeString().slice(0, 5); }
};
const durFa = (ms: number): string => {
  const m = Math.floor(Math.max(0, ms) / 60000);
  const hh = Math.floor(m / 60);
  return hh ? `${faNum(hh)} ساعت و ${faNum(m % 60)} دقیقه` : `${faNum(m)} دقیقه`;
};
const kbd = (s: string): string => `<kbd>${s}</kbd>`;

/** A finished-state view (replaces the dialog body). `warn` lines keep the dialog open until the user closes it. */
function showDone(d: QDialog, o: { title: string; sub?: string; lines: string[]; number?: string | null; warn: string[]; icon?: string }): void {
  d.setTitle(o.title, o.sub);
  d.body.innerHTML = `<div class="qk-done"><span class="big">${o.icon ?? ICONS.check}</span>` +
    o.lines.map((l) => `<p>${esc(l)}</p>`).join("") +
    (o.number ? `<div class="dy-num">${esc(o.number)}</div>` : "") + `</div>` +
    (o.warn.length ? `<div class="dy-st warn" role="alert">${esc(o.warn.join("\n"))}</div>` : "");
  d.foot.innerHTML = `<span class="dy-hint"><span>${kbd("Esc")} بستن</span></span><span class="grow"></span><button type="button" class="dy-btn pri" id="qk-close">بستن</button>`;
  d.$<HTMLButtonElement>("#qk-close").onclick = d.close;
  setTimeout(() => d.$<HTMLButtonElement>("#qk-close")?.focus(), 0);
  if (!o.warn.length) setTimeout(d.close, 1800);
}

// ───────────────────────────── start session ─────────────────────────────
export function openStartDialog(cfg: Pick<QuickConfig, "openForm">): void {
  let boot: QuickResults["bootstrap"] | null = null;
  let prices: Record<string, number> = {};
  let catalog: Row[] = [];
  let hits: Row[] = [];
  let sel = 0;
  let busy = false;
  const chosen: Array<{ p: Row; qty: number }> = [];

  const d = openDialog({
    title: "شروع جلسهٔ جدید", sub: "عنوان، لیست قیمت و محصولات (اختیاری)", icon: "timer", wide: true,
    onKey(e) {
      const ae = d.target(e);
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void start(); return; }
      if (ae === title) {
        if (e.key === "Enter") { e.preventDefault(); void start(); }
        else if (e.key === "ArrowDown") { e.preventDefault(); q.focus(); }
      } else if (ae === q) {
        if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, hits.length - 1); renderList(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); if (sel === 0) title.focus(); else { sel--; renderList(); } }
        else if (e.key === "Enter") { e.preventDefault(); add(hits[sel]); }
      }
    },
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
  const title = $<HTMLInputElement>("#qk-title");
  const q = $<HTMLInputElement>("#qk-q");
  const pl = $<HTMLSelectElement>("#qk-pl");
  const go = $<HTMLButtonElement>("#qk-go");
  const st = $("#qk-st");
  const openChk = $<HTMLInputElement>("#qk-open");
  const listEl = $("#dy-plist");
  const selEl = $("#qk-sel");
  openChk.checked = cfg.openForm;
  const now = new Date();
  title.value = "جلسه " + formatJalali(now) + " – " + clockFa(now);
  $("#qk-cancel").onclick = d.close;
  go.onclick = () => void start();
  setTimeout(() => { title.focus(); title.select(); }, 30);

  const priceOf = (p: Row): number | null => prices[p.id + "|" + (p.uom ?? "")] ?? prices[p.id] ?? p.price;

  function renderList(): void {
    if (!boot) return;
    if (!hits.length) {
      listEl.innerHTML = '<div class="empty">محصولی پیدا نشد.<br><small>املا را بررسی کنید یا عبارت کوتاه‌تری بنویسید.</small></div>';
      $("#qk-n").textContent = "";
      return;
    }
    $("#qk-n").textContent = hits.length >= 40 ? "۴۰ نتیجهٔ اول؛ برای محدودتر شدن بیشتر تایپ کنید" : faNum(hits.length) + " نتیجه";
    listEl.innerHTML = hits.map((p, i) => {
      const pr = priceOf(p);
      return `<div class="it${i === sel ? " sel" : ""}" role="option" aria-selected="${i === sel}" data-i="${i}"><span class="nm">${esc(p.name)}</span>` +
        `${p.num ? `<span class="cd">${esc(p.num)}</span>` : ""}<span class="pr">${pr ? fmt(pr) : ""}</span></div>`;
    }).join("");
    listEl.querySelector(".it.sel")?.scrollIntoView({ block: "nearest" });
  }

  function renderSel(): void {
    if (!chosen.length) { selEl.innerHTML = ""; return; }
    let total = 0;
    const rows = chosen.map((c, i) => {
      const pr = priceOf(c.p);
      if (pr) total += pr * c.qty;
      return `<div class="qk-row" data-i="${i}"><span class="nm">${esc(c.p.name)}</span><span class="pr">${pr ? fmt(pr) : "—"}</span>` +
        `<span class="qk-step"><button type="button" data-a="dec" aria-label="کم کردن">−</button><input type="text" inputmode="numeric" value="${c.qty}" aria-label="تعداد">` +
        `<button type="button" data-a="inc" aria-label="زیاد کردن">+</button></span>` +
        `<button type="button" class="qk-rm" data-a="rm" aria-label="حذف">${ICONS.close}</button></div>`;
    }).join("");
    selEl.innerHTML = `<div class="qk-h"><span>محصولات انتخاب‌شده</span><span>${faNum(chosen.length)} مورد</span></div>${rows}` +
      (total ? `<div class="qk-total"><span>جمع</span><span>${fmt(total)}</span></div>` : "");
  }

  function add(p: Row | undefined): void {
    if (!p) return;
    const hit = chosen.find((c) => c.p.id === p.id);
    if (hit) hit.qty++; else chosen.push({ p, qty: 1 });
    renderSel();
    q.select();
  }

  const update = (): void => { hits = searchProducts(catalog, q.value); sel = 0; renderList(); };
  q.addEventListener("input", update);
  listEl.addEventListener("mousedown", (e) => {
    const it = (e.target as HTMLElement).closest<HTMLElement>(".it");
    if (it) { e.preventDefault(); add(hits[Number(it.dataset.i)]); }
  });
  selEl.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-a]");
    const row = b?.closest<HTMLElement>(".qk-row");
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
    const inp = e.target as HTMLInputElement;
    const c = chosen[Number(inp.closest<HTMLElement>(".qk-row")?.dataset.i)];
    if (!c) return;
    const n = toNum(inp.value);
    c.qty = Number.isFinite(n) && n > 0 ? Math.min(100000, n) : 1;
    renderSel();
  });
  pl.addEventListener("change", () => void loadPrices());

  async function loadPrices(): Promise<void> {
    prices = {};
    if (!pl.value) { renderList(); renderSel(); return; }
    $("#qk-msg").textContent = "در حال دریافت قیمت‌ها...";
    const want = pl.value;
    try {
      const r = await quickCall("prices", { priceLevelId: want });
      if (pl.value === want) prices = r;
      $("#qk-msg").textContent = "";
    } catch (e) { $("#qk-msg").textContent = "قیمت‌های این لیست دریافت نشد؛ قیمت پایهٔ محصول نمایش داده می‌شود."; console.warn("DY quick prices:", e); }
    renderList();
    renderSel();
  }

  async function load(refresh = false): Promise<void> {
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

  async function start(): Promise<void> {
    if (busy || !boot) return;
    const name = title.value.trim();
    if (!name) { setStatus(st, "عنوان جلسه را وارد کنید.", "err"); title.focus(); return; }
    busy = true;
    d.locked = true;
    go.disabled = true;
    setStatus(st, "در حال ساخت فرصت و شروع جلسه...", "busy");
    try {
      const r = await quickCall("start", { name, priceLevelId: pl.value || null, items: chosen.map((c) => ({ productId: c.p.id, qty: c.qty })), openForm: openChk.checked });
      d.locked = false;
      const warn: string[] = [];
      if (r.numberError) warn.push("شماره‌گذاری فرصت ناموفق بود: " + r.numberError + "\n(در پنل جلسهٔ CRM می‌توانید دوباره تلاش کنید.)");
      if (r.sessionError) warn.push("فرصت ساخته شد اما جلسه ثبت نشد: " + r.sessionError);
      for (const l of r.lineErrors) warn.push("محصول «" + l.name + "» اضافه نشد: " + l.message);
      showDone(d, {
        title: "جلسه شروع شد", sub: name,
        lines: ["«" + name + "»", ...(chosen.length ? [faNum(r.added) + " از " + faNum(chosen.length) + " محصول به فرصت اضافه شد."] : [])],
        number: r.number, warn,
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

// ───────────────────────────── end session ─────────────────────────────
const STATE_LABEL: Record<string, string> = { RUNNING: "در جریان", PAUSED: "متوقف", PAUSING: "در حال توقف", RESUMING: "در حال ازسرگیری", RECOVERY_REQUIRED: "نیازمند بازیابی" };
const endable = (s: QuickLiveSession): boolean => s.state === "RUNNING" || s.state === "RECOVERY_REQUIRED";

export function openEndDialog(): void {
  let list: QuickLiveSession[] = [];
  let sel = -1;
  let busy = false;
  const d = openDialog({
    title: "پایان جلسه", sub: "جلسه‌ای را که می‌خواهید پایان دهید انتخاب کنید", icon: "stop",
    onKey(e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!list.length) return;
        sel = e.key === "ArrowDown" ? Math.min(sel + 1, list.length - 1) : Math.max(sel - 1, 0);
        render();
      } else if (e.key === "Enter" && d.target(e)?.tagName !== "BUTTON") { e.preventDefault(); void end(); }
    },
  });
  d.body.innerHTML = '<div id="dy-slist" role="listbox"><div class="empty">در حال بارگذاری...</div></div><div class="dy-st" id="qk-st" role="status" aria-live="polite" hidden style="margin-top:12px"></div>';
  d.foot.innerHTML = `<span class="dy-hint"><span>${kbd("↑")} ${kbd("↓")} انتخاب</span><span>${kbd("Enter")} پایان جلسه</span><span>${kbd("Esc")} بستن</span></span>
    <span class="grow"></span><button type="button" class="dy-btn" id="qk-cancel">لغو</button>
    <button type="button" class="dy-btn danger fill" id="qk-end" disabled>${ICONS.stop}<span>پایان جلسه</span></button>`;
  const $ = d.$;
  const listEl = $("#dy-slist");
  const st = $("#qk-st");
  const endBtn = $<HTMLButtonElement>("#qk-end");
  $("#qk-cancel").onclick = d.close;
  endBtn.onclick = () => void end();

  function render(): void {
    if (!list.length) {
      listEl.innerHTML = '<div class="empty">جلسهٔ فعالی وجود ندارد.<br><small>برای شروع جلسهٔ جدید، میان‌بُر شروع را بزنید.</small></div>';
      endBtn.disabled = true;
      return;
    }
    listEl.innerHTML = list.map((s, i) =>
      `<div class="it${i === sel ? " sel" : ""}${endable(s) ? "" : " off"}" role="option" aria-selected="${i === sel}" aria-disabled="${!endable(s)}" data-i="${i}">` +
      `<span class="nm">${esc(s.name)}</span>${s.number ? `<span class="cd">${esc(s.number)}</span>` : ""}` +
      `<span class="tm">${s.state === "RUNNING" ? "" : esc(STATE_LABEL[s.state] ?? s.state) + " • "}${durFa(s.activeMs)}</span></div>`).join("");
    endBtn.disabled = busy || !(sel >= 0 && list[sel] && endable(list[sel]!));
    listEl.querySelector(".it.sel")?.scrollIntoView({ block: "nearest" });
  }

  listEl.addEventListener("mousedown", (e) => {
    const it = (e.target as HTMLElement).closest<HTMLElement>(".it");
    if (it) { e.preventDefault(); sel = Number(it.dataset.i); render(); }
  });

  async function end(): Promise<void> {
    const s = list[sel];
    if (busy || !s) return;
    if (!endable(s)) { setStatus(st, "این جلسه متوقف است؛ برای پایان، ابتدا آن را در پنل جلسهٔ CRM ادامه دهید.", "warn"); return; }
    busy = true;
    d.locked = true;
    endBtn.disabled = true;
    setStatus(st, "در حال افزودن محصول پایان جلسه به فرصت...", "busy");
    try {
      const r = await quickCall("end", { sessionId: s.id });
      d.locked = false;
      showDone(d, {
        title: "جلسه پایان یافت", sub: s.name,
        lines: [r.skippedPrint
          ? "چون همهٔ محصولات فرصت «پرینت» هستند، زمان جلسه اضافه نشد."
          : "محصول «" + r.productName + "» " + (r.already ? "از قبل روی فرصت بود." : "به تعداد " + faNum(r.minutes) + " (دقیقه) به فرصت اضافه شد.")],
        number: s.number, warn: [],
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
    if (list.length === 1 && !endable(list[0]!)) setStatus(st, "تنها جلسهٔ فعال متوقف است؛ ابتدا آن را در پنل جلسهٔ CRM ادامه دهید.", "warn");
    setTimeout(() => endBtn.focus(), 0);
  })();
}
