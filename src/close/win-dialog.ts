/** "بستن به عنوان برنده": fill the last stage, finish the BPF, close the opportunity as Won. */
import { api } from "../shared/odata";
import { errorMessage, faNum, sleep } from "../shared/text";
import { formatJalali } from "../shared/jalali";
import { cleanId, getFC, requireXrm } from "../shared/xrm";
import { LS_KEY, SEQ_KEY } from "./constants";
import { assertProcessFinished, closeDirect, fillAndAdvanceStages, finishProcess, type StageDefaults } from "./stages";
import { lsGet, lsSet } from "./storage";
import { groupDigits, modal, parseAmount, setStatus, toast, type StatusKind } from "./ui/dom";
import { ICONS } from "./ui/icons";

async function winOpportunity(id: string, revenue: number, description: string): Promise<void> {
  const now = new Date().toISOString();
  await api("WinOpportunity", {
    method: "POST",
    body: JSON.stringify({
      Status: 3, // Won
      OpportunityClose: {
        subject: "Won - " + now.slice(0, 10),
        "opportunityid@odata.bind": "/opportunities(" + id + ")",
        actualrevenue: Number(revenue),
        actualend: now,
        description: description || "",
      },
    }),
  });
}

export const primaryName = (fc: XrmFormContext): string => {
  try { return fc.data.entity.getPrimaryAttributeValue ? fc.data.entity.getPrimaryAttributeValue() : ""; } catch { return ""; }
};

export async function openDialog(): Promise<void> {
  const fc = getFC();
  if (!fc) return;
  const id = cleanId(fc.data.entity.getId());
  const oppName = primaryName(fc);

  // suggested revenue
  let revenue = 0;
  let hasEstClose = false;
  try {
    const o = await api("opportunities(" + id + ")?$select=totalamount,estimatedvalue,statecode,estimatedclosedate");
    if (o.statecode !== 0) { toast("این فرصت قبلاً بسته شده است.", "err"); return; }
    revenue = o.totalamount || o.estimatedvalue || 0;
    hasEstClose = !!o.estimatedclosedate;
  } catch { /* keep the defaults; the dialog still works */ }

  const saved = lsGet(LS_KEY) || "{}";

  const m = modal({ title: "بستن فرصت به عنوان برنده", sub: oppName, icon: "check", tone: "ok" });
  m.body.innerHTML = `
      <div class="dy-note">${ICONS.check}<span>با تایید، فرایند مستقیماً به مرحلهٔ آخر می‌رود و تکمیل می‌شود و فرصت با وضعیت «برنده» بسته می‌شود.</span></div>
      <label class="dy-f"><span>درآمد واقعی</span>
        <div class="dy-inp"><input id="dy-rev" type="text" inputmode="numeric" autocomplete="off"><em>ریال</em></div>
        <small id="dy-rev-h"></small></label>
      <label class="dy-f"><span>تاریخ اتمام</span><input id="dy-date" type="text" value="${formatJalali(new Date())}" disabled></label>
      <label class="dy-f"><span>شرح (اختیاری)</span><input id="dy-desc" type="text" autocomplete="off"></label>
      <details class="dy-adv"><summary>تنظیمات پیشرفته مراحل</summary>
        <label class="dy-f" style="display:flex;gap:8px;align-items:flex-start;margin-top:8px"><input id="dy-seq" type="checkbox" style="margin-top:4px"><span style="margin:0;font-weight:400">تکمیل مرحله‌به‌مرحله (همهٔ مراحل میانی طی می‌شوند؛ ورک‌فلوی هر مرحله، مثل پیامک، برای هرکدام اجرا می‌شود)</span></label>
        <label class="dy-f"><span>مقدار پیش‌فرض فیلدهای اجباری (JSON: نام منطقی فیلد ← مقدار)</span>
          <textarea id="dy-defaults" placeholder='{"description":"ok"}'></textarea></label>
      </details>
      <div class="dy-st" id="dy-msg" role="status" aria-live="polite" hidden></div>`;
  m.foot.innerHTML = `<button type="button" class="dy-btn ok" id="dy-ok">${ICONS.check}<span>تایید و بستن</span></button><button type="button" class="dy-btn" id="dy-cancel">لغو</button>`;

  const $ = m.$;
  $<HTMLTextAreaElement>("#dy-defaults").value = saved;
  $<HTMLInputElement>("#dy-seq").checked = lsGet(SEQ_KEY) === "1";
  const rev = $<HTMLInputElement>("#dy-rev");
  const msg = (t: string, kind?: StatusKind): void => setStatus($("#dy-msg"), t, kind);
  let zeroWarned = false;
  const hint = (): void => {
    const v = parseAmount(rev.value);
    $("#dy-rev-h").textContent = v ? faNum(v) + " ریال  ·  " + faNum(Math.round(v / 10)) + " تومان" : "مبلغ نهایی فروش را وارد کنید";
  };
  rev.value = groupDigits(String(revenue));
  hint();
  rev.addEventListener("input", () => { rev.value = groupDigits(rev.value); hint(); msg(""); zeroWarned = false; });
  $("#dy-cancel").onclick = m.close;
  m.box.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); $("#dy-ok").click(); }
  });
  setTimeout(() => { rev.focus(); rev.select(); }, 30);

  $("#dy-ok").onclick = async () => {
    let defaults: StageDefaults = {};
    const raw = $<HTMLTextAreaElement>("#dy-defaults").value.trim();
    if (raw) {
      try { defaults = JSON.parse(raw) as StageDefaults; }
      catch { $<HTMLDetailsElement>(".dy-adv").open = true; return msg("JSON تنظیمات مراحل معتبر نیست.", "err"); }
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
    m.box.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement>("input,textarea,button").forEach((x) => { x.disabled = true; });
    try {
      const seq = $<HTMLInputElement>("#dy-seq").checked;
      lsSet(SEQ_KEY, seq ? "1" : "0");
      const status = (t: string): void => msg(t, "busy");
      if (seq) await fillAndAdvanceStages(fc, defaults, status); // every stage, one by one
      else await closeDirect(fc, id, defaults, status); // one direct jump to the last stage
      msg("در حال پایان دادن به فرایند...", "busy");
      await finishProcess(fc, id, !seq); // direct mode: the form's process state is stale, so finish through the API only
      await assertProcessFinished(id);
      msg("در حال بستن فرصت...", "busy");
      if (!hasEstClose) {
        // fill the estimated close date (تاریخ تخمینی بسته شدن) with today before closing
        try {
          await api("opportunities(" + id + ")", { method: "PATCH", body: JSON.stringify({ estimatedclosedate: new Date().toISOString().slice(0, 10) }) });
        } catch (e) { console.warn("estimatedclosedate not set:", e); }
      }
      await winOpportunity(id, amount, $<HTMLInputElement>("#dy-desc").value);
      msg("فرصت با موفقیت به عنوان برنده بسته شد.", "ok");
      await sleep(700);
      m.locked = false;
      m.close();
      toast("فرصت به عنوان برنده بسته شد.");
      void requireXrm().Navigation.openForm({ entityName: "opportunity", entityId: id });
    } catch (e) {
      m.locked = false;
      m.box.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement>("input:not(#dy-date),textarea,button").forEach((x) => { x.disabled = false; });
      msg(errorMessage(e) + "\nفرصت برنده نشد. برای ادامه دوباره «تایید و بستن» را بزنید؛ فرایند از مرحله‌ی فعال فعلی ادامه می‌یابد.", "err");
    }
  };
}
