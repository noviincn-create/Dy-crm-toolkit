/** "تغییر مرحله": jump straight to any stage of the current BPF instance. Never closes the opportunity. */
import { api } from "../shared/odata";
import { errorMessage, faNum } from "../shared/text";
import { cleanId, getFC, requireXrm } from "../shared/xrm";
import { hasProcess, loadStageContext, moveToStageDirect, type StageContext } from "./stages";
import { modal, setStatus, toast, type StatusKind } from "./ui/dom";
import { ICONS } from "./ui/icons";
import { primaryName } from "./win-dialog";

// Independent of Close as Won: it never calls fillAndAdvanceStages / moveNext / finishProcess / winOpportunity
// and never closes the opportunity.
export async function openStageDialog(): Promise<void> {
  const fc = getFC();
  if (!fc || !hasProcess()) return;
  const id = cleanId(fc.data.entity.getId());
  const oppName = primaryName(fc);
  let ctx: StageContext;
  try {
    const o = await api("opportunities(" + id + ")?$select=statecode");
    if (o.statecode !== 0) { toast("این فرصت بسته شده است و مرحله‌ی آن قابل تغییر نیست.", "err"); return; }
    ctx = await loadStageContext(fc, id);
  } catch (e) { toast("خواندن مراحل ناموفق بود: " + errorMessage(e), "err"); return; }

  const m = modal({ title: "تغییر مرحله", sub: oppName, icon: "swap" });
  m.body.innerHTML = `
      <div class="dy-note">${ICONS.swap}<span>انتخاب مستقیم هر مرحله؛ مراحل میانی تکمیل نمی‌شوند و فرصت بسته (برنده) نمی‌شود.</span></div>
      <label class="dy-f"><span>مرحله</span><select id="dy-stage-sel"></select></label>
      <div class="dy-st" id="dy-stage-msg" role="status" aria-live="polite" hidden></div>`;
  m.foot.innerHTML = '<button type="button" class="dy-btn pri" id="dy-stage-ok"><span>ادامه</span></button><button type="button" class="dy-btn" id="dy-stage-cancel">لغو</button>';
  const $ = m.$;
  const sel = $<HTMLSelectElement>("#dy-stage-sel");
  ctx.stages.forEach((st, i) => {
    const o = document.createElement("option");
    o.value = st.id;
    o.textContent = faNum(i + 1) + ". " + st.name + (st.id === ctx.activeId ? "  (مرحله‌ی فعلی)" : "");
    if (st.id === ctx.activeId) o.selected = true;
    sel.appendChild(o);
  });
  const msg = (t: string, kind?: StatusKind): void => setStatus($("#dy-stage-msg"), t, kind);
  const okLabel = (): HTMLElement => $("#dy-stage-ok").querySelector("span")!;
  $("#dy-stage-cancel").onclick = m.close;
  setTimeout(() => sel.focus(), 30);
  let confirming = false;
  sel.addEventListener("change", () => { confirming = false; okLabel().textContent = "ادامه"; msg(""); });
  $("#dy-stage-ok").onclick = async () => {
    const target = sel.value;
    if (target === ctx.activeId) return msg("این مرحله هم‌اکنون فعال است.", "warn");
    const tname = ctx.stages.find((x) => x.id === target)!.name;
    if (!confirming) { // step 1: ask for confirmation
      confirming = true;
      okLabel().textContent = "بله، منتقل کن";
      return msg("آیا می‌خواهید فرصت فروش مستقیماً به این مرحله منتقل شود؟\n«" + tname + "»", "warn");
    }
    m.locked = true;
    m.box.querySelectorAll<HTMLSelectElement | HTMLButtonElement>("select,button").forEach((x) => { x.disabled = true; });
    msg("در حال انتقال به مرحله «" + tname + "»...", "busy");
    try {
      if (fc.data.getIsDirty?.()) await fc.data.save(); // keep the user's unsaved edits
      const how = await moveToStageDirect(fc, ctx, target);
      console.info("DY stage change -> " + tname + " via " + how);
      m.locked = false;
      m.close();
      toast("فرصت به مرحله «" + tname + "» منتقل شد.");
      void requireXrm().Navigation.openForm({ entityName: "opportunity", entityId: id }); // reload so the process bar shows the new stage
    } catch (e) {
      m.locked = false;
      m.box.querySelectorAll<HTMLSelectElement | HTMLButtonElement>("select,button").forEach((x) => { x.disabled = false; });
      confirming = false;
      okLabel().textContent = "ادامه";
      msg(errorMessage(e), "err");
    }
  };
}
