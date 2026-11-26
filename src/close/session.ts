/**
 * Session side panel. "شروع جلسه" creates ONE opportunity with the typed title (same create as فرصت جدید, incl. currency and the
 * monthly number). Several sessions can run at the same time (one card each). "پایان جلسه" adds the END_PRODUCT line
 * (quantity = session minutes) to that session's opportunity and removes the card. It never closes or wins.
 * The END_PRODUCT is NOT added when every product on the opportunity is a print product (name contains پرینت / print).
 */
import { QUICK_ATTR, QUICK_OPEN_EVT } from "../shared/config";
import { api, apiAll, ApiError, type ODataList } from "../shared/odata";
import { errorMessage, faNum } from "../shared/text";
import { cleanId, getFC, requireXrm } from "../shared/xrm";
import { END_PRODUCT, SES_KEY, SES_OPENFORM_KEY, SES_OPEN_KEY } from "./constants";
import { newOpportunityBody } from "./create-dialog";
import { assignOpportunityNumber } from "./opp-number";
import { smBeginEnd, smDecorate, smEndDone } from "./session-sm";
import { lsGet, lsSet } from "./storage";
import { h, injectCss, setStatus, toast, type StatusKind } from "./ui/dom";
import { ICONS } from "./ui/icons";

export interface Session {
  oppId: string;
  name: string;
  number: string | null;
  startedAt: number;
}

interface PanelMessage {
  kind: StatusKind;
  text: string;
}

const isSession = (o: unknown): o is Session => !!o && typeof o === "object" && !!(o as Session).oppId && !!(o as Session).startedAt;

/** All running sessions (oldest first). Tolerates the legacy single-object format of 1.7.0. */
export const loadSessions = (): Session[] => {
  try {
    const o = JSON.parse(lsGet(SES_KEY) || "null") as unknown;
    return (Array.isArray(o) ? o : [o]).filter(isSession);
  } catch {
    return [];
  }
};
export const saveSessions = (list: Session[]): void => lsSet(SES_KEY, list.length ? JSON.stringify(list) : null);
/** Read-modify-write against the freshest stored list (another tab may have changed it). */
const updateSessions = (fn: (list: Session[]) => Session[]): void => saveSessions(fn(loadSessions()));

/** Print products are billed per page, so session time is not added when every line is one. */
export const isPrintName = (name: string | null | undefined): boolean => /پرینت|print/i.test(name ?? "");

const clockFa = (d: Date): string => {
  try {
    return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return d.toTimeString().slice(0, 5);
  }
};

/** Creates the opportunity (same POST as New Opp) and assigns the monthly number; the number step failing never loses the record. */
async function createOpportunityRecord(name: string): Promise<{ oppId: string; number: string | null; numErr: unknown }> {
  const body = await newOpportunityBody(name);
  const rec = await api("opportunities", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
  const oppId = cleanId(rec.opportunityid);
  let number: string | null = null;
  let numErr: unknown = null;
  try { number = (await assignOpportunityNumber(oppId)).number; } catch (e) { numErr = e; }
  return { oppId, number, numErr };
}

/** Adds the END_PRODUCT line item to the opportunity (once; safe to retry). */
async function addEndProduct(oppId: string, minutes: number): Promise<{ name: string; already?: boolean; skippedPrint?: boolean }> {
  const pr = await api<ODataList<{ productid: string; name: string; price: number | null; _defaultuomid_value: string | null }>>(
    "products?$select=productid,name,price,_defaultuomid_value&$top=1&$filter=" + encodeURIComponent("productnumber eq '" + END_PRODUCT + "'"));
  if (!pr.value.length) throw new Error("محصول با شناسه " + END_PRODUCT + " پیدا نشد.");
  const p = pr.value[0]!;
  const uom = p._defaultuomid_value;
  const dup = await api<ODataList<unknown>>(
    "opportunityproducts?$select=opportunityproductid&$top=1&$filter=" + encodeURIComponent("_opportunityid_value eq " + oppId + " and _productid_value eq " + p.productid));
  if (dup.value.length) return { name: p.name, already: true };
  // only print products on the opportunity -> no session time (no products at all -> add)
  const lines = await apiAll<{ productname: string | null; "_productid_value@OData.Community.Display.V1.FormattedValue"?: string }>(
    "opportunityproducts?$select=productname,_productid_value&$filter=" + encodeURIComponent("_opportunityid_value eq " + oppId),
    { headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' } });
  if (lines.length && lines.every((l) => isPrintName(l["_productid_value@OData.Community.Display.V1.FormattedValue"]) || isPrintName(l.productname))) {
    return { name: p.name, skippedPrint: true };
  }
  let price = p.price;
  try {
    const o = await api("opportunities(" + oppId + ")?$select=_pricelevelid_value");
    if (o._pricelevelid_value) {
      const r = await api<ODataList<{ amount: number | null }>>(
        "productpricelevels?$select=amount&$top=1&$filter=" +
        encodeURIComponent("_productid_value eq " + p.productid + " and _pricelevelid_value eq " + o._pricelevelid_value + (uom ? " and _uomid_value eq " + uom : "")));
      if (r.value.length && r.value[0]!.amount != null) price = r.value[0]!.amount;
    }
  } catch (e) { console.warn("price lookup:", e); }
  const body: Record<string, unknown> = {
    "opportunityid@odata.bind": "/opportunities(" + oppId + ")",
    "productid@odata.bind": "/products(" + p.productid + ")",
    quantity: minutes,
  };
  if (uom) body["uomid@odata.bind"] = "/uoms(" + uom + ")";
  if (price != null) { body.priceperunit = price; body.ispriceoverridden = true; }
  const post = (b: Record<string, unknown>): Promise<unknown> => api("opportunityproducts", { method: "POST", body: JSON.stringify(b) });
  try { await post({ bmsd_istaxmanualyset: true, ...body }); } // same "manual tax = yes" the product form gets
  catch (e) { if (e instanceof ApiError && e.status === 400) await post(body); else throw e; }
  return { name: p.name };
}

export function sessionPanel(): HTMLElement {
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
  const setOpen = (v: boolean): void => {
    panel.classList.toggle("open", v);
    lsSet(SES_OPEN_KEY, v ? "1" : "0");
    if (v) setTimeout(() => panel.querySelector<HTMLInputElement>("#dy-sp-title")?.focus(), 240);
  };
  panel.querySelector<HTMLElement>(".dy-sp-tab")!.onclick = () => setOpen(true);
  panel.querySelector<HTMLElement>(".dy-x")!.onclick = () => setOpen(false);
  for (const ev of ["keydown", "keyup", "keypress"] as const) {
    panel.addEventListener(ev, (e) => {
      e.stopPropagation(); // typing must not trigger Dynamics hotkeys
      if (ev === "keydown" && (e as KeyboardEvent).key === "Escape") setOpen(false);
    });
  }
  if (lsGet(SES_OPEN_KEY) === "1") panel.classList.add("open");

  // the start form is built once (so a re-render never wipes what is being typed)
  const $ = <T extends HTMLElement = HTMLElement>(s: string): T => panel.querySelector(s) as T;
  $<HTMLInputElement>("#dy-sp-openform").checked = lsGet(SES_OPENFORM_KEY) !== "0";
  $<HTMLInputElement>("#dy-sp-openform").onchange = (e) => lsSet(SES_OPENFORM_KEY, (e.target as HTMLInputElement).checked ? "1" : "0");
  // the quick-session popup lives in the extension's content script (any site); its buttons appear once that script marks the page
  const quickBox = $("#dy-sp-quick");
  const showQuick = (): boolean => { quickBox.hidden = !document.documentElement.hasAttribute(QUICK_ATTR); return !quickBox.hidden; };
  if (!showQuick()) { let n = 0; const t = setInterval(() => { if (showQuick() || ++n > 30) clearInterval(t); }, 1000); }
  const quick = (which: "start" | "end"): void => { document.dispatchEvent(new CustomEvent(QUICK_OPEN_EVT, { detail: which })); };
  $("#dy-sp-qstart").onclick = () => quick("start");
  $("#dy-sp-qend").onclick = () => quick("end");
  const start = async (): Promise<void> => {
    const btn = $<HTMLButtonElement>("#dy-sp-start");
    const titleInput = $<HTMLInputElement>("#dy-sp-title");
    const name = titleInput.value.trim();
    if (!name) { setStatus($("#dy-sp-msg"), "عنوان جلسه را وارد کنید.", "err"); titleInput.focus(); return; }
    if (btn.disabled) return;
    btn.disabled = true;
    titleInput.disabled = true;
    setStatus($("#dy-sp-msg"), "در حال ساخت فرصت تجاری...", "busy");
    let r: Awaited<ReturnType<typeof createOpportunityRecord>>;
    try { r = await createOpportunityRecord(name); }
    catch (e) {
      btn.disabled = false;
      titleInput.disabled = false;
      setStatus($("#dy-sp-msg"), "ساخت فرصت ناموفق بود: " + errorMessage(e), "err");
      return;
    }
    // the opportunity exists: the session starts even if only the number step failed
    updateSessions((l) => [...l, { oppId: r.oppId, name, number: r.number, startedAt: Date.now() }]);
    btn.disabled = false;
    titleInput.disabled = false;
    titleInput.value = "";
    setStatus($("#dy-sp-msg"), r.numErr ? "فرصت ساخته شد اما شماره‌گذاری ناموفق بود: " + errorMessage(r.numErr) : "", r.numErr ? "warn" : "");
    renderSession(panel);
    toast("جلسه شروع شد" + (r.number ? "\nشماره فرصت: \u2066" + r.number + "\u2069" : ""), "ok", 5000);
    if ($<HTMLInputElement>("#dy-sp-openform").checked) void requireXrm().Navigation.openForm({ entityName: "opportunity", entityId: r.oppId });
  };
  $("#dy-sp-start").onclick = () => void start();
  $("#dy-sp-title").addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") { e.preventDefault(); void start(); } });
  // another tab started / ended a session
  window.addEventListener("storage", (e) => { if (e.key === SES_KEY) renderSession(panel); });

  document.body.appendChild(panel);
  renderSession(panel);
  return panel;
}

const messages = new Map<string, PanelMessage>(); // per-session status (survives re-renders)
const busy = new Set<string>(); // sessions whose end is running

/** Re-draws the session cards and the tab badge. `msg` (optional) is shown on the card of `msgFor`. */
export function renderSession(rootEl?: HTMLElement | null, msgFor?: string, msg?: PanelMessage | null): void {
  const root = rootEl ?? document.getElementById("dy-sp");
  if (!root) return;
  if (msgFor) { if (msg) messages.set(msgFor, msg); else messages.delete(msgFor); }
  const list = root.querySelector<HTMLElement>("#dy-sp-list")!;
  const sub = root.querySelector<HTMLElement>(".dy-sub")!;
  const tab = root.querySelector<HTMLElement>(".dy-sp-tab")!;
  const sessions = loadSessions();
  tab.querySelector(".ic")!.innerHTML = sessions.length ? '<span class="dot"></span><span class="cnt">' + faNum(sessions.length) + "</span>" : ICONS.timer;
  tab.setAttribute("aria-label", sessions.length ? "باز کردن پنل جلسه، " + faNum(sessions.length) + " جلسه در جریان" : "باز کردن پنل جلسه");
  sub.textContent = sessions.length ? faNum(sessions.length) + " جلسه در جریان" : "شروع جلسه یک فرصت می‌سازد و پایان جلسه محصول را اضافه می‌کند";
  for (const k of [...messages.keys()]) if (!sessions.some((s) => s.oppId === k)) messages.delete(k);
  list.textContent = "";
  for (const ses of sessions) list.appendChild(sessionCard(root, ses));
  // Session Manager layer (pause / resume / cancel / details); a no-op when its bridge is not present
  void smDecorate(root, sessions, { rerender: () => renderSession(root), notify: (oppId, kind, text) => renderSession(root, oppId, { kind, text }), removeSession: (oppId) => updateSessions((l) => l.filter((x) => x.oppId !== oppId)) });
}

function sessionCard(root: HTMLElement, ses: Session): HTMLElement {
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
  const $ = <T extends HTMLElement = HTMLElement>(s: string): T => card.querySelector(s) as T;
  card.dataset.opp = ses.oppId;
  $(".n").textContent = ses.name;
  $(".num").textContent = ses.number || "—";
  $(".st").textContent = clockFa(new Date(ses.startedAt));
  const status = $(".dy-st");
  const m = messages.get(ses.oppId);
  if (m) setStatus(status, m.text, m.kind);
  const endBtn = $<HTMLButtonElement>(".dy-sp-end");
  if (busy.has(ses.oppId)) endBtn.disabled = true;

  if (!ses.number) { // number step failed at start: offer a retry
    const b = h<HTMLButtonElement>('<button type="button" class="dy-btn dy-sp-renum"><span>تلاش مجدد برای ثبت شماره</span></button>');
    $(".dy-sp-acts").prepend(b);
    b.onclick = async () => {
      b.disabled = true;
      try {
        const r = await assignOpportunityNumber(ses.oppId);
        updateSessions((l) => l.map((x) => (x.oppId === ses.oppId ? { ...x, number: r.number } : x)));
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
    const cur = loadSessions().find((x) => x.oppId === ses.oppId) || ses; // fresh copy (may have been ended in another tab)
    // Session Manager: a paused session cannot be ended; billable minutes exclude paused time (null = legacy wall-clock)
    const gate = await smBeginEnd(cur);
    if (!gate.ok) {
      busy.delete(ses.oppId);
      renderSession(root, ses.oppId, { kind: "warn", text: gate.message }); // via the per-session message map: survives re-renders
      return;
    }
    const minutes = gate.minutes ?? Math.max(1, Math.ceil((Date.now() - cur.startedAt) / 60000));
    let r: Awaited<ReturnType<typeof addEndProduct>>;
    try { r = await addEndProduct(ses.oppId, minutes); }
    catch (e) {
      await smEndDone(cur, false, errorMessage(e));
      busy.delete(ses.oppId);
      endBtn.disabled = false;
      setStatus(status, "افزودن محصول ناموفق بود: " + errorMessage(e) + "\nجلسه هنوز باز است؛ دوباره تلاش کنید.", "err");
      return;
    }
    await smEndDone(cur, true);
    busy.delete(ses.oppId);
    updateSessions((l) => l.filter((x) => x.oppId !== ses.oppId));
    const text = r.skippedPrint
      ? "جلسه پایان یافت. چون همهٔ محصولات فرصت «پرینت» هستند، زمان جلسه اضافه نشد."
      : "جلسه پایان یافت و محصول «" + r.name + "» " + (r.already ? "از قبل روی فرصت بود." : "به تعداد " + faNum(minutes) + " (دقیقه) به فرصت اضافه شد.");
    renderSession(root, undefined, null);
    const note = document.getElementById("dy-sp-msg");
    if (note) setStatus(note, "«" + ses.name + "»: " + text, "ok");
    toast(r.skippedPrint ? "جلسه پایان یافت (بدون افزودن زمان)" : "جلسه پایان یافت", "ok", 4000);
    try {
      const fc = getFC();
      if (fc && fc.data.entity.getId() && cleanId(fc.data.entity.getId()) === ses.oppId && !fc.data.getIsDirty()) void fc.data.refresh(false);
    } catch { /* the form is not an opportunity form */ }
  };
  return card;
}
