/** "فرصت جدید" on the opportunity list: create + save immediately, then assign the monthly number. */
import { formatJalali } from "../shared/jalali";
import { api } from "../shared/odata";
import { errorMessage } from "../shared/text";
import { cleanId, requireXrm } from "../shared/xrm";
import { assignOpportunityNumber, type NumberAssignment } from "./opp-number";
import { modal, setStatus, toast, type Modal } from "./ui/dom";
import { ICONS } from "./ui/icons";

export async function getCurrencyId(): Promise<string | null> {
  try {
    const us = requireXrm().Utility.getGlobalContext().userSettings;
    if (us.transactionCurrency?.id) return cleanId(us.transactionCurrency.id);
    const u = await api("systemusers(" + cleanId(us.userId) + ")?$select=_transactioncurrencyid_value");
    return u._transactioncurrencyid_value || null;
  } catch {
    return null;
  }
}

/** The request body of a new opportunity: subject, optional description, the user's currency. */
export async function newOpportunityBody(name: string, description?: string): Promise<Record<string, string>> {
  const body: Record<string, string> = { name };
  if (description) body.description = description;
  const cur = await getCurrencyId();
  if (cur) body["transactioncurrencyid@odata.bind"] = "/transactioncurrencies(" + cur + ")";
  return body;
}

const isolate = (s: string): string => "\u2066" + s + "\u2069"; // keep LTR digits/GUIDs readable inside RTL text

/** The opportunity exists but its number could not be confirmed: keep it, show the GUID and offer a retry of the number assignment only. */
function showNumberFailure(m: Modal, oppId: string, err: unknown, onDone: (r: NumberAssignment) => void): void {
  m.locked = false;
  m.box.querySelector("h3")!.textContent = "فرصت ایجاد شد، اما شماره‌گذاری ناموفق بود";
  const sub = m.box.querySelector(".dy-sub");
  if (sub) sub.textContent = "فرصت حذف نشده است";
  m.body.innerHTML = '<div class="dy-st err" id="dy-num-err" role="alert"></div>' +
    '<label class="dy-f"><span>شناسه فرصت (GUID)</span><input id="dy-num-id" type="text" readonly style="direction:ltr;text-align:left"></label>' +
    '<div class="dy-st" id="dy-num-msg" role="status" aria-live="polite" hidden></div>';
  m.body.querySelector<HTMLInputElement>("#dy-num-id")!.value = oppId;
  m.foot.innerHTML = '<button type="button" class="dy-btn pri" id="dy-num-retry"><span>تلاش مجدد برای ثبت شماره</span></button>' +
    '<button type="button" class="dy-btn" id="dy-num-open"><span>باز کردن فرصت</span></button>' +
    '<span class="grow"></span><button type="button" class="dy-btn" id="dy-num-close">بستن</button>';
  const $ = m.$;
  const paint = (e: unknown): void => setStatus($("#dy-num-err"),
    "فرصت ایجاد شد، اما شماره‌ی ماهانه‌ی آن ثبت نشد.\nشناسه فرصت: " + isolate(oppId) + "\nعلت: " + errorMessage(e) +
    "\nبرای ثبت شماره، روی «تلاش مجدد» کلیک کنید.", "err");
  paint(err);
  console.warn("opportunity number assignment failed:", oppId, err);
  $("#dy-num-close").onclick = m.close;
  $("#dy-num-open").onclick = () => { m.close(); void requireXrm().Navigation.openForm({ entityName: "opportunity", entityId: oppId }); };
  $<HTMLButtonElement>("#dy-num-retry").onclick = async () => {
    const b = $<HTMLButtonElement>("#dy-num-retry");
    b.disabled = true;
    m.locked = true;
    setStatus($("#dy-num-msg"), "در حال ثبت شماره‌ی فرصت...", "busy");
    let res: NumberAssignment;
    try { res = await assignOpportunityNumber(oppId); } // retries ONLY the number assignment on the same record
    catch (e) { m.locked = false; b.disabled = false; setStatus($("#dy-num-msg"), ""); paint(e); console.warn("retry failed:", e); return; }
    onDone(res);
  };
  setTimeout(() => m.bg.querySelector<HTMLButtonElement>("#dy-num-retry")?.focus(), 30);
}

export function openCreateDialog(): void {
  const m = modal({ title: "فرصت تجاری جدید", sub: "ایجاد و ذخیرهٔ فوری، بدون نیاز به زدن Save", icon: "add" });
  m.body.innerHTML = `
      <label class="dy-f"><span>موضوع</span><input id="dy-new-name" type="text" autocomplete="off"></label>
      <label class="dy-f"><span>شرح (اختیاری)</span><input id="dy-new-desc" type="text" autocomplete="off"></label>
      <div class="dy-st" id="dy-new-msg" role="status" aria-live="polite" hidden></div>`;
  m.foot.innerHTML = `<button type="button" class="dy-btn pri" id="dy-new-ok">${ICONS.add}<span>ایجاد</span></button><button type="button" class="dy-btn" id="dy-new-cancel">لغو</button>`;
  const $ = m.$;
  const nameInput = $<HTMLInputElement>("#dy-new-name");
  nameInput.value = "فرصت تجاری در تاریخ " + formatJalali(new Date());
  $("#dy-new-cancel").onclick = m.close;
  setTimeout(() => { nameInput.focus(); nameInput.select(); }, 30);
  m.box.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); $("#dy-new-ok").click(); }
  });
  $<HTMLButtonElement>("#dy-new-ok").onclick = async () => {
    const btn = $<HTMLButtonElement>("#dy-new-ok");
    const name = nameInput.value.trim();
    if (!name) { setStatus($("#dy-new-msg"), "موضوع فرصت را وارد کنید.", "err"); nameInput.focus(); return; }
    btn.disabled = true;
    m.locked = true;
    setStatus($("#dy-new-msg"), "در حال ایجاد فرصت...", "busy");
    try {
      const body = await newOpportunityBody(name, $<HTMLInputElement>("#dy-new-desc").value);
      // create and save right away; no need to press Save on the form
      const rec = await api("opportunities", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
      // the opportunity now exists in CRM. Step 2: assign the monthly number as a separate PATCH.
      const oppId = cleanId(rec.opportunityid);
      const done = (r: NumberAssignment): void => {
        m.locked = false;
        m.close();
        toast("فرصت با موفقیت ایجاد شد\nشماره فرصت: " + isolate(r.number), "ok", 7000);
        void requireXrm().Navigation.openForm({ entityName: "opportunity", entityId: oppId });
      };
      setStatus($("#dy-new-msg"), "فرصت ایجاد شد. در حال ثبت شماره‌ی فرصت...", "busy");
      let res: NumberAssignment;
      try { res = await assignOpportunityNumber(oppId); } catch (ne) { showNumberFailure(m, oppId, ne, done); return; }
      done(res);
    } catch (e) {
      m.locked = false;
      btn.disabled = false;
      setStatus($("#dy-new-msg"), "ایجاد فرصت ناموفق بود: " + errorMessage(e), "err");
    }
  };
}
