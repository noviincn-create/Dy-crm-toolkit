/** Business-process-flow (BPF) stage handling: filling steps, direct stage jumps, finishing the process. */
import { api, type ODataList } from "../shared/odata";
import { errorMessage, sleep } from "../shared/text";
import { cleanId, getFC } from "../shared/xrm";

/** Saved default values for stage step fields: logical name → value. */
export type StageDefaults = Record<string, unknown>;
export type StatusFn = (text: string) => void;

export interface BpfInstance {
  businessprocessflowinstanceid: string;
  _activestageid_value?: string;
  _processid_value?: string;
  traversedpath?: string;
}

export interface StageInfo {
  id: string;
  name: string;
}

export interface StageContext {
  inst: BpfInstance;
  stages: StageInfo[];
  activeId: string;
}

const isEmpty = (v: unknown): boolean => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** True when the opportunity form currently shows a business process flow. */
export const hasProcess = (): boolean => {
  const fc = getFC();
  try { return !!fc?.data.process?.getActiveStage?.(); } catch { return false; }
};

const activeProcess = (fc: XrmFormContext): XrmProcess | null => {
  const p = fc.data.process;
  return p?.getActiveStage?.() ? p : null;
};

const oppUrl = (id: string): string => "opportunities(" + id + ")";
const patchOpp = (id: string, body: object): Promise<unknown> => api(oppUrl(id), { method: "PATCH", body: JSON.stringify(body) });

/**
 * Fills every step field of one stage (saved defaults first, tick boxes → checked).
 * Fields that are not on the form are collected in `patch` (saved through the API); optional steps that stay empty go to `leftover`.
 * Throws when a REQUIRED step stays empty.
 */
export function fillStage(fc: XrmFormContext, stage: XrmProcessStage, defaults: StageDefaults, patch: Record<string, unknown>, leftover: string[]): void {
  const stageName = stage.getName();
  const missing: string[] = [];
  (stage.getSteps() || []).forEach((step) => {
    const name = step.getAttribute?.();
    if (!name) return;
    const label = step.getName ? step.getName() : name;
    const required = typeof step.isRequired === "function" ? step.isRequired() : !!step.required;
    const hasDefault = defaults && defaults[name] !== undefined;
    const attr = fc.getAttribute(name);
    if (attr) {
      const isBool = attr.getAttributeType() === "boolean";
      let val: unknown;
      if (isBool) {
        val = hasDefault ? defaults[name] : true;
        if (attr.getValue() === val) return; // already ticked
      } else if (!isEmpty(attr.getValue())) {
        return;
      } else if (hasDefault) {
        val = defaults[name];
      }
      if (val !== undefined) {
        attr.setValue(val);
        attr.fireOnChange?.();
        return;
      }
    } else if (hasDefault) {
      patch[name] = defaults[name];
      return;
    }
    if (required) missing.push(label);
    else leftover.push(label + " (" + name + ")");
  });
  if (missing.length) {
    throw new Error("فیلدهای اجباری مرحله «" + stageName + "» خالی است: " + missing.join("، ") +
      "\nمی‌توانید مقدار پیش‌فرض آن‌ها را در بخش تنظیمات مراحل وارد کنید.");
  }
}

const logLeftover = (leftover: string[]): void => {
  if (leftover.length) console.info("DY Easy Close: steps left empty (add them to the stage settings JSON by logical name):", leftover);
};

/** Old behaviour (opt-in): walks every stage one by one with `moveNext`. */
export async function fillAndAdvanceStages(fc: XrmFormContext, defaults: StageDefaults, setStatus: StatusFn): Promise<void> {
  const process = activeProcess(fc);
  if (!process) return; // no BPF on form

  const oppId = (): string => cleanId(fc.data.entity.getId());
  const patch: Record<string, unknown> = {}; // step fields that are not on the form -> saved through the API
  const leftover: string[] = []; // optional steps we could not fill

  for (let guard = 0; guard < 15; guard++) {
    const stage = process.getActiveStage!()!;
    const stageName = stage.getName();
    setStatus("مرحله: " + stageName);

    fillStage(fc, stage, defaults, patch, leftover);

    // last stage?
    const path = process.getActivePath();
    const last = path.get(path.getLength() - 1);
    if (stage.getId() === last.getId()) break;

    // the stage can't advance while the form has unsaved changes ("dirtyForm"), so flush and save first
    if (Object.keys(patch).length) {
      await patchOpp(oppId(), patch);
      Object.keys(patch).forEach((k) => delete patch[k]);
    }
    if (fc.data.getIsDirty()) {
      try { await fc.data.save(); }
      catch (e) { throw new Error("ذخیره فرم قبل از رفتن به مرحله بعد ناموفق بود: " + errorMessage(e)); }
      await sleep(300);
    }
    const stageIdBefore = stage.getId();
    const result = await new Promise<string>((res) => process.moveNext((r) => res(r)));
    if (result !== "success" && result !== "end") {
      throw new Error("رفتن به مرحله بعد ناموفق بود (" + result + ") در مرحله «" + stageName + "»");
    }
    await sleep(600); // let the BPF re-render
    // verify that the active stage really changed (otherwise the loop would silently end and the opportunity would be won too early)
    const after = process.getActiveStage!();
    if (!after || after.getId() === stageIdBefore) {
      throw new Error("مرحله‌ی فعال تغییر نکرد؛ فرایند در مرحله «" + stageName + "» متوقف شد.");
    }
  }

  if (Object.keys(patch).length) await patchOpp(oppId(), patch);
  await fc.data.save().then(() => undefined, () => undefined);
  logLeftover(leftover);
}

/**
 * Close as Won, default mode: ONE direct stage change to the last stage (so a "stage changed" workflow, e.g. SMS, fires once),
 * instead of walking every stage. The old stage-by-stage walk stays available (checkbox in the dialog) → fillAndAdvanceStages.
 */
export async function closeDirect(fc: XrmFormContext, id: string, defaults: StageDefaults, setStatus: StatusFn): Promise<void> {
  const proc = activeProcess(fc);
  if (!proc) return; // no BPF on the form
  const path = proc.getActivePath();
  const lastStage = path.get(path.getLength() - 1);
  const lastId = cleanId(lastStage.getId());
  setStatus("مرحله‌ی نهایی: " + lastStage.getName());
  const patch: Record<string, unknown> = {};
  const leftover: string[] = [];
  fillStage(fc, lastStage, defaults, patch, leftover);
  if (Object.keys(patch).length) await patchOpp(id, patch);
  if (fc.data.getIsDirty()) {
    try { await fc.data.save(); }
    catch (e) { throw new Error("ذخیره فرم ناموفق بود: " + errorMessage(e)); }
    await sleep(300);
  }
  const ctx = await loadStageContext(fc, id);
  if (ctx.activeId !== lastId) {
    setStatus("انتقال مستقیم به مرحله «" + lastStage.getName() + "»...");
    await moveToStageDirect(fc, ctx, lastId);
  }
  logLeftover(leftover);
}

// ───────────── finish the BPF instance ─────────────
// Winning an opportunity does not finish its business process flow, so the bar keeps showing
// "Active for N minutes" and the timer never stops. Finish the process before closing.
export async function finishProcess(fc: XrmFormContext, id: string, apiOnly: boolean): Promise<void> {
  try {
    const process = fc.data.process;
    if (!apiOnly && process?.setStatus) {
      await new Promise<void>((res) => process.setStatus!("finished", res));
    }
  } catch (e) { console.warn("process.setStatus:", e); }
  // safety net through the API (also covers the case where setStatus did nothing)
  try {
    const r = await api<ODataList<{ businessprocessflowinstanceid: string }>>(
      "opportunitysalesprocesses?$select=businessprocessflowinstanceid&$filter=_opportunityid_value eq " + id + " and statecode eq 0");
    for (const x of r.value) {
      await api("opportunitysalesprocesses(" + x.businessprocessflowinstanceid + ")", {
        method: "PATCH",
        body: JSON.stringify({ statecode: 1, statuscode: 2 }), // Finished
      });
    }
  } catch (e) { console.warn("finish BPF via API:", e); }
}

/** The opportunity must not be won while its BPF instance is still active. */
export async function assertProcessFinished(id: string): Promise<void> {
  const r = await api<ODataList<unknown>>(
    "opportunitysalesprocesses?$select=businessprocessflowinstanceid&$filter=" + encodeURIComponent("_opportunityid_value eq " + id + " and statecode eq 0"));
  if (r.value && r.value.length) throw new Error("فرایند کسب‌وکار هنوز فعال است؛ فرصت برنده نشد.");
}

// ───────────── direct stage change ─────────────
export async function loadStageContext(fc: XrmFormContext, oppId: string): Promise<StageContext> {
  const proc = fc.data.process!;
  let activeProc = "";
  try {
    const ap = proc.getActiveProcess?.();
    if (ap) activeProc = cleanId(ap.getId());
  } catch { /* no active process object */ }
  const r = await api<ODataList<BpfInstance>>(
    "opportunitysalesprocesses?$select=businessprocessflowinstanceid,_activestageid_value,_processid_value,traversedpath&$filter=" +
    encodeURIComponent("_opportunityid_value eq " + oppId + " and statecode eq 0"));
  const list = r.value || [];
  if (!list.length) throw new Error("نمونه‌ی فعال فرایند کسب‌وکار برای این فرصت پیدا نشد.");
  const inst = list.find((x) => cleanId(x._processid_value || "") === activeProc) || list[0]!;
  const procId = cleanId(inst._processid_value || "");
  // stages that really belong to THIS process definition (ids differ between definitions)
  const defs = (await api<ODataList<{ processstageid: string; stagename: string }>>(
    "processstages?$select=processstageid,stagename&$filter=" + encodeURIComponent("_processid_value eq " + procId))).value || [];
  const defIds = new Set(defs.map((d) => cleanId(d.processstageid)));
  const stages: StageInfo[] = [];
  const path = proc.getActivePath(); // ordered as in the BPF definition
  for (let i = 0; i < path.getLength(); i++) {
    const st = path.get(i);
    const sid = cleanId(st.getId());
    if (defIds.size && !defIds.has(sid)) continue;
    stages.push({ id: sid, name: st.getName() });
  }
  if (!stages.length) throw new Error("مراحل فرایند کسب‌وکار پیدا نشد.");
  return { inst, stages, activeId: cleanId(inst._activestageid_value || "") };
}

async function readActiveStage(instId: string): Promise<string> {
  const r = await api<{ _activestageid_value?: string }>("opportunitysalesprocesses(" + instId + ")?$select=_activestageid_value");
  return cleanId(r._activestageid_value || "");
}

/** Jumps straight to a stage of the current BPF instance. Returns which mechanism did the move. */
export async function moveToStageDirect(fc: XrmFormContext, ctx: StageContext, targetId: string): Promise<"api" | "client"> {
  const instId = ctx.inst.businessprocessflowinstanceid;
  const traversed = String(ctx.inst.traversedpath || "").split(",").map(cleanId).filter(Boolean);
  const at = traversed.indexOf(targetId);
  // back to a visited stage: cut the path there; forward: add only the target (intermediate stages are NOT traversed)
  const newPath = (at >= 0 ? traversed.slice(0, at + 1) : traversed.concat(targetId)).join(",");
  let method: "api" | "client" = "api";
  let apiErr: Error | null = null;
  try {
    await api("opportunitysalesprocesses(" + instId + ")", {
      method: "PATCH",
      body: JSON.stringify({ "activestageid@odata.bind": "/processstages(" + targetId + ")", traversedpath: newPath }),
    });
  } catch (e) { apiErr = e instanceof Error ? e : new Error(String(e)); }
  let now = apiErr ? "" : await readActiveStage(instId);
  if (apiErr || now !== targetId) {
    // fallback: the supported client navigation API (stage must be on the active path)
    method = "client";
    const res = await new Promise<string>((r) => fc.data.process!.setActiveStage("{" + targetId + "}", (x) => r(x)));
    if (res !== "success") throw new Error("انتقال به مرحله ناموفق بود (" + res + ")" + (apiErr ? "\n" + apiErr.message : ""));
    now = await readActiveStage(instId);
  }
  if (now !== targetId) throw new Error("بعد از انتقال، مرحله‌ی فعال در CRM تغییر نکرده است.");
  return method;
}
