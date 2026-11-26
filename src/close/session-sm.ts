/**
 * Session Manager <-> session side panel. The existing panel (session.ts) keeps its own storage and flow untouched; this
 * module ADDS per-session Pause / Resume / Cancel / Details, a status summary and global controls on top of the cards.
 * Without the bridge (older build, extension reloaded) every function is a no-op and the legacy behaviour is unchanged.
 */
import { activeMsAt } from "../session-manager/clock";
import { smAvailable, smCall, smOnChange } from "../session-manager/client";
import { OPPORTUNITY_SESSION_TYPE } from "../session-manager/registry";
import { SessionScheduler } from "../session-manager/scheduler";
import { allowedActions } from "../session-manager/state-machine";
import { isTerminal, type SessionRecord, type SessionState } from "../session-manager/types";
import { errorMessage, faNum } from "../shared/text";
import type { Session } from "./session";
import { esc, h, setStatus, toast } from "./ui/dom";
import { ICONS } from "./ui/icons";

export interface SmPanelDeps {
  /** Re-draw the panel from the legacy list. */
  rerender(): void;
  /** Show a message on one session card (kept across re-renders). */
  notify(oppId: string, kind: "ok" | "err" | "warn", text: string): void;
  /** Remove a session from the legacy list only (the CRM opportunity is never touched). */
  removeSession(oppId: string): void;
}

export const STATE_FA: Record<SessionState, string> = {
  IDLE: "آماده", RUNNING: "جلسه در جریان است", PAUSING: "در حال توقف…", PAUSED: "متوقف شده", RESUMING: "در حال ازسرگیری…",
  COMPLETED: "پایان‌یافته", FAILED: "ناموفق", CANCELLING: "در حال لغو…", CANCELLED: "لغو شده", RECOVERY_REQUIRED: "نیازمند بازیابی",
};

const CSS = `
  .sm-sum{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
  .sm-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:var(--bg);border:1px solid var(--ln);font-size:12px;font-weight:700;color:var(--mu)}
  .sm-chip b{color:var(--tx);font-variant-numeric:tabular-nums}
  .sm-chip.run b{color:var(--ok)}.sm-chip.pau b{color:var(--wn)}.sm-chip.rec b{color:var(--er)}.sm-chip.bad b{color:var(--er)}
  .sm-glob{display:flex;gap:6px;margin:0 0 14px}
  .sm-glob .dy-btn{flex:1;min-height:36px;padding:0 6px;font-size:12px;gap:5px}
  .sm-glob .dy-btn svg,.sm-acts .dy-btn svg{width:16px;height:16px}
  .sm-acts{display:flex;gap:8px;margin:0 0 10px}
  .sm-acts .dy-btn{flex:1;min-height:40px;padding:0 8px;font-size:13px}
  .dy-btn.warn{background:var(--wn-s);border-color:color-mix(in srgb,var(--wn) 45%,var(--ln));color:var(--wn)}
  .dy-btn.warn:hover{background:var(--wn);border-color:var(--wn);color:#fff}
  .dy-btn.sm-confirm{background:var(--er);border-color:var(--er);color:#fff}
  .sm-link{border:0;background:none;color:var(--pr);font:700 12px var(--font);cursor:pointer;padding:2px 0;margin:0 0 10px;text-align:right}
  .sm-det{margin:0 0 12px;border-radius:var(--r2);background:var(--s2);padding:4px 0;font-size:12px}
  .sm-det[hidden]{display:none}
  .sm-det div{display:flex;justify-content:space-between;gap:10px;padding:5px 12px;border-bottom:1px dashed var(--ln)}
  .sm-det div:last-child{border-bottom:0}.sm-det .k{color:var(--mu);flex:none}.sm-det .v{text-align:left;overflow-wrap:anywhere;min-width:0}
  .sm-det .sec{display:block;padding:8px 12px 2px;font-weight:800;color:var(--tx);border:0}
  .dy-sp-card[data-sm="PAUSED"]::before,.dy-sp-card[data-sm="PAUSING"]::before{background:var(--wn)}
  .dy-sp-card[data-sm="RECOVERY_REQUIRED"]::before{background:var(--er)}
  .dy-sp-card[data-sm="COMPLETED"]::before,.dy-sp-card[data-sm="CANCELLED"]::before,.dy-sp-card[data-sm="FAILED"]::before{background:var(--mu)}
  .dy-sp-card[data-sm="PAUSED"] .dy-sp-live,.dy-sp-card[data-sm="PAUSING"] .dy-sp-live{color:var(--wn)}
  .dy-sp-card[data-sm="RECOVERY_REQUIRED"] .dy-sp-live,.dy-sp-card[data-sm="FAILED"] .dy-sp-live{color:var(--er)}
  .dy-sp-card[data-sm="COMPLETED"] .dy-sp-live,.dy-sp-card[data-sm="CANCELLED"] .dy-sp-live{color:var(--mu)}
  .dy-sp-card[data-sm="PAUSED"] .dy-sp-live .dot,.dy-sp-card[data-sm="PAUSING"] .dy-sp-live .dot{background:var(--wn);box-shadow:0 0 0 4px color-mix(in srgb,var(--wn) 22%,transparent);animation:none}
  .dy-sp-card[data-sm="RECOVERY_REQUIRED"] .dy-sp-live .dot,.dy-sp-card[data-sm="FAILED"] .dy-sp-live .dot{background:var(--er);box-shadow:0 0 0 4px color-mix(in srgb,var(--er) 22%,transparent);animation:none}
  .dy-sp-card[data-sm="COMPLETED"] .dy-sp-live .dot,.dy-sp-card[data-sm="CANCELLED"] .dy-sp-live .dot{background:var(--mu);box-shadow:none;animation:none}
`;

// ───────────── module state ─────────────
const sched = new SessionScheduler();
const records = new Map<string, SessionRecord>(); // by CRM record id (externalRef)
let finishedCount = 0;
let gen = 0;
const openDetails = new Set<string>();
const pending = new Set<string>(); // sessions with a command in flight
let initDone = false;

const pickBest = (list: SessionRecord[]): SessionRecord | undefined =>
  list.find((r) => !isTerminal(r.state)) ?? list.sort((a, b) => b.createdAt - a.createdAt)[0];

const faTime = (t: number): string => {
  try { return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(t)); } catch { return new Date(t).toTimeString().slice(0, 8); }
};
export const fmtDur = (ms: number): string => {
  const m = Math.floor(Math.max(0, ms) / 60000);
  const hh = Math.floor(m / 60);
  return hh ? `${faNum(hh)} ساعت و ${faNum(m % 60)} دقیقه` : `${faNum(m)} دقیقه`;
};

// ───────────── data sync ─────────────
async function refresh(sessions: Session[]): Promise<void> {
  const adoptMissing = async (list: SessionRecord[]): Promise<boolean> => {
    const have = new Set(list.filter((r) => !isTerminal(r.state)).map((r) => r.externalRef));
    const todo = sessions.filter((s) => !have.has(s.oppId) && !list.some((r) => r.externalRef === s.oppId));
    await Promise.all(todo.map((s) => smCall("adopt", null, { type: OPPORTUNITY_SESSION_TYPE, name: s.name, externalRef: s.oppId, startedAt: s.startedAt, ...(s.number ? { meta: { number: s.number } } : {}) })));
    return todo.length > 0;
  };
  let { sessions: list } = await smCall("list", null, {});
  if (await adoptMissing(list)) ({ sessions: list } = await smCall("list", null, {}));
  records.clear();
  const byRef = new Map<string, SessionRecord[]>();
  for (const r of list) if (r.type === OPPORTUNITY_SESSION_TYPE && r.externalRef) byRef.set(r.externalRef, [...(byRef.get(r.externalRef) ?? []), r]);
  for (const s of sessions) { const best = pickBest(byRef.get(s.oppId) ?? []); if (best) records.set(s.oppId, best); }
  finishedCount = list.filter((r) => isTerminal(r.state)).length;
}

const setRec = (r: SessionRecord): void => { if (r.externalRef) records.set(r.externalRef, r); };

// ───────────── rendering ─────────────
function detailsHtml(r: SessionRecord): string {
  const row = (k: string, v: string): string => `<div><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`;
  const sec = (t: string): string => `<div class="sec">${esc(t)}</div>`;
  const now = Date.now();
  const ops = r.operations;
  const cnt = (s: string): number => ops.filter((o) => o.status === s).length;
  const cp = r.checkpoints[r.checkpoints.length - 1];
  const out: string[] = [
    sec("مشخصات"),
    row("شناسه جلسه", r.id.slice(0, 8)), row("وضعیت", STATE_FA[r.state]), row("ایجاد", faTime(r.createdAt)),
    row("آخرین فعالیت", faTime(r.lastActivityAt)), row("مرحلهٔ جاری", r.step ?? "—"), row("پیشرفت", r.progress == null ? "—" : faNum(Math.round(r.progress)) + "٪"),
    row("زمان فعال", fmtDur(activeMsAt(r, now))), row("مدت کل", r.startedAt ? fmtDur((r.finishedAt ?? now) - r.startedAt) : "—"),
    sec("توقف و ازسرگیری (" + faNum(r.pauses.length) + ")"),
    ...r.pauses.slice(-5).map((p) => row(faTime(p.pausedAt), p.resumedAt ? "ازسرگیری " + faTime(p.resumedAt) : "هنوز متوقف است")),
    sec("عملیات"),
    row("انجام‌شده / ناموفق / نامشخص / در حال اجرا", [cnt("done"), cnt("failed"), cnt("unknown"), cnt("inflight")].map(faNum).join(" / ")),
    ...ops.slice(-4).map((o) => row(o.label, o.status === "done" ? "انجام شد" : o.status === "failed" ? "ناموفق" : o.status === "unknown" ? "نتیجه نامشخص" : "در حال اجرا")),
  ];
  if (r.errors.length) out.push(sec("خطاها"), ...r.errors.slice(-3).map((e) => row(faTime(e.at), e.message)));
  out.push(sec("بازیابی و نقطه‌ی بازیابی"), row("وضعیت بازیابی", r.recovery ? r.recovery.reason : "نیاز ندارد"), row("آخرین نقطه", cp ? `${cp.step} • ${faTime(cp.at)}` : "—"));
  out.push(sec("تاریخچه"), ...r.history.slice(-6).map((e) => row(faTime(e.at), STATE_FA[e.to] + (e.reason ? " (" + e.reason + ")" : ""))));
  return out.join("");
}

function decorateCard(card: HTMLElement, r: SessionRecord, deps: SmPanelDeps): void {
  const ses = card.dataset.opp!;
  card.dataset.sm = r.state;
  card.querySelector(".dy-sp-live .lb")!.textContent = STATE_FA[r.state];
  const info = card.querySelector<HTMLElement>(".dy-sp-info")!;
  info.querySelector(".sm-row")?.remove();
  const act = h(`<div class="sm-row"><span class="k">زمان فعال</span><span class="v sm-act"></span></div>`);
  info.appendChild(act);
  const paint = (): void => { const cur = records.get(ses); if (cur) act.querySelector(".sm-act")!.textContent = fmtDur(activeMsAt(cur, Date.now())); };
  paint();
  sched.clear(r.id);
  sched.every(r.id, "tick", 15000, paint, r.state === "RUNNING"); // suspended while the session is not running

  const acts = allowedActions(r.state);
  const busyNow = pending.has(r.id) || r.state === "PAUSING" || r.state === "RESUMING" || r.state === "CANCELLING";
  const end = card.querySelector<HTMLButtonElement>(".dy-sp-end")!;
  const status = card.querySelector<HTMLElement>(".dy-st")!;
  if (!acts.end) {
    end.disabled = true;
    end.title = isTerminal(r.state) ? "این جلسه پایان یافته است" : "ابتدا جلسه را ادامه دهید";
  }

  const bar = h(`<div class="sm-acts"></div>`);
  const mk = (cls: string, icon: string, label: string, run: () => Promise<void>, disabled = false): HTMLButtonElement => {
    const b = h<HTMLButtonElement>(`<button type="button" class="dy-btn ${cls}">${icon}<span>${esc(label)}</span></button>`);
    b.disabled = disabled || busyNow;
    b.onclick = async () => {
      if (pending.has(r.id)) return;
      pending.add(r.id); bar.querySelectorAll("button").forEach((x) => { x.disabled = true; });
      let err: string | null = null;
      try { await run(); } catch (e) { err = errorMessage(e); }
      pending.delete(r.id);
      if (err) deps.notify(ses, "err", err); else deps.rerender();
    };
    return b;
  };
  const command = async (op: "pause" | "resume"): Promise<void> => { setRec(await smCall(op, r.id, {})); };
  if (isTerminal(r.state)) {
    bar.appendChild(mk("", ICONS.close, "حذف از لیست", async () => { deps.removeSession(ses); }));
  } else {
    if (acts.pause) bar.appendChild(mk("warn", ICONS.stop, "توقف جلسه", () => command("pause")));
    if (acts.resume) bar.appendChild(mk("ok", ICONS.play, r.state === "RECOVERY_REQUIRED" ? "ادامه (بازیابی)" : "ادامه جلسه", () => command("resume")));
    if (acts.cancel) {
      const c = mk("danger", ICONS.close, "لغو جلسه", async () => { /* replaced below */ });
      let armed = 0;
      c.onclick = (): void => { // destructive: needs a second click
        if (!armed) { armed = window.setTimeout(() => { armed = 0; c.classList.remove("sm-confirm"); c.querySelector("span")!.textContent = "لغو جلسه"; }, 4000); c.classList.add("sm-confirm"); c.querySelector("span")!.textContent = "تأیید لغو؟"; return; }
        clearTimeout(armed); armed = 0; pending.add(r.id); bar.querySelectorAll("button").forEach((x) => { x.disabled = true; });
        void (async () => {
          let err: string | null = null;
          try { await smCall("cancel", r.id, { reason: "user" }); deps.removeSession(ses); } catch (e) { err = errorMessage(e); }
          pending.delete(r.id);
          if (err) { deps.notify(ses, "err", err); return; }
          deps.rerender();
          const note = document.getElementById("dy-sp-msg");
          if (note) setStatus(note, "«" + (card.querySelector(".n")?.textContent ?? "") + "» لغو شد. فرصت و محصولات آن دست‌نخورده ماندند.", "warn");
        })();
      };
      bar.appendChild(c);
    }
  }
  const acts0 = card.querySelector<HTMLElement>(".dy-sp-acts")!;
  card.insertBefore(bar, acts0);
  if (!status.hidden) { /* a message (e.g. an error) is already shown: keep it */ }
  else if (r.state === "RECOVERY_REQUIRED" && r.recovery) setStatus(status, r.recovery.reason + "\nپس از بررسی، «ادامه (بازیابی)» یا «پایان جلسه» را بزنید.", "warn");
  else if (r.state === "PAUSED") setStatus(status, "ساعت جلسه متوقف است؛ «پایان جلسه» تا ادامه‌ی جلسه غیرفعال است.", "warn");

  const det = h(`<div class="sm-det" ${openDetails.has(r.id) ? "" : "hidden"}></div>`);
  det.innerHTML = detailsHtml(r);
  const tog = h<HTMLButtonElement>(`<button type="button" class="sm-link" aria-expanded="${openDetails.has(r.id)}">${openDetails.has(r.id) ? "بستن جزئیات" : "مشاهده جزئیات"}</button>`);
  tog.onclick = () => {
    const open = det.hidden;
    det.hidden = !open; tog.setAttribute("aria-expanded", String(open)); tog.textContent = open ? "بستن جزئیات" : "مشاهده جزئیات";
    if (open) openDetails.add(r.id); else openDetails.delete(r.id);
  };
  card.insertBefore(tog, acts0);
  card.insertBefore(det, acts0);
}

function renderSummary(root: HTMLElement, sessions: Session[], deps: SmPanelDeps): void {
  root.querySelector("#dy-sm-sum")?.remove();
  root.querySelector("#dy-sm-glob")?.remove();
  const live = sessions.map((s) => records.get(s.oppId)).filter((r): r is SessionRecord => !!r && !isTerminal(r.state));
  if (!live.length && !finishedCount) return;
  const n = (st: SessionState): number => live.filter((r) => r.state === st).length;
  const chip = (cls: string, label: string, v: number): string => `<span class="sm-chip ${cls}">${esc(label)} <b>${faNum(v)}</b></span>`;
  const sum = h(`<div id="dy-sm-sum" class="sm-sum" aria-label="خلاصه وضعیت جلسه‌ها">${[
    chip("", "فعال", live.length), chip("run", "در جریان", n("RUNNING")), chip("pau", "متوقف", n("PAUSED") + n("PAUSING")),
    chip("rec", "نیازمند بازیابی", n("RECOVERY_REQUIRED")), chip("", "پایان‌یافته/لغو", finishedCount),
  ].join("")}</div>`);
  const list = root.querySelector("#dy-sp-list")!;
  list.before(sum);
  if (live.length < 1) return;
  const glob = h(`<div id="dy-sm-glob" class="sm-glob"></div>`);
  const g = (cls: string, icon: string, label: string, op: "pauseAll" | "resumeAll" | "cancelAll", disabled: boolean, done: string): HTMLButtonElement => {
    const b = h<HTMLButtonElement>(`<button type="button" class="dy-btn ${cls}">${icon}<span>${esc(label)}</span></button>`);
    b.disabled = disabled;
    let armed = 0;
    b.onclick = async () => {
      if (op === "cancelAll" && !armed) { armed = window.setTimeout(() => { armed = 0; b.classList.remove("sm-confirm"); b.querySelector("span")!.textContent = label; }, 4000); b.classList.add("sm-confirm"); b.querySelector("span")!.textContent = "تأیید لغو همه؟"; return; }
      clearTimeout(armed); armed = 0; glob.querySelectorAll("button").forEach((x) => { x.disabled = true; });
      try {
        const res = await smCall(op, null, {});
        const okIds = res.filter((x) => x.ok).map((x) => x.id);
        if (op === "cancelAll") for (const s of sessions) { const r = records.get(s.oppId); if (r && okIds.includes(r.id)) deps.removeSession(s.oppId); }
        const bad = res.length - okIds.length;
        toast(faNum(okIds.length) + " جلسه " + done + (bad ? "\n" + faNum(bad) + " مورد انجام نشد" : ""), bad ? "err" : "ok");
      } catch (e) { toast(errorMessage(e), "err"); }
      finally { deps.rerender(); }
    };
    return b;
  };
  glob.append(
    g("warn", ICONS.stop, "توقف همه", "pauseAll", n("RUNNING") === 0, "متوقف شد"),
    g("ok", ICONS.play, "ادامه همه", "resumeAll", n("PAUSED") === 0, "ادامه یافت"),
    g("danger", ICONS.close, "لغو همه", "cancelAll", live.length === 0, "لغو شد"),
  );
  list.before(glob);
}

function applyAll(root: HTMLElement, sessions: Session[], deps: SmPanelDeps): void {
  if (!document.getElementById("dy-sm-css")) { const s = document.createElement("style"); s.id = "dy-sm-css"; s.textContent = CSS; document.head.appendChild(s); }
  const ids = new Set<string>();
  for (const card of root.querySelectorAll<HTMLElement>(".dy-sp-card[data-opp]")) {
    const r = records.get(card.dataset.opp!);
    if (!r) continue;
    ids.add(r.id);
    card.querySelectorAll(".sm-acts,.sm-link,.sm-det").forEach((x) => x.remove());
    decorateCard(card, r, deps);
  }
  for (const id of sched.ids()) if (id !== "__panel__" && !ids.has(id)) sched.clear(id);
  renderSummary(root, sessions, deps);
}

/** Called by renderSession after the legacy cards were drawn. Never throws; on any failure the legacy UI stays as is. */
export async function smDecorate(root: HTMLElement, sessions: Session[], deps: SmPanelDeps): Promise<void> {
  if (!smAvailable()) return;
  if (!initDone) {
    initDone = true;
    smOnChange(() => deps.rerender());
    sched.every("__panel__", "heartbeat", 60000, () => { // proves the panel is alive, so an open session is never mistaken for an abandoned one
      for (const r of records.values()) if (!isTerminal(r.state)) void smCall("touch", r.id, {}).catch(() => undefined);
    });
  }
  const my = ++gen;
  if (records.size) applyAll(root, sessions, deps); // instant paint from cache, no flicker
  try {
    await refresh(sessions);
    if (my === gen) applyAll(root, sessions, deps);
  } catch (e) { console.warn("session-manager panel:", e); }
}

// ───────────── End-session gate (billing) ─────────────
export type EndGate = { ok: true; minutes: number | null } | { ok: false; message: string };

/** Before the END_PRODUCT is added: blocks a paused session and returns the ACTIVE minutes (pauses excluded). */
export async function smBeginEnd(ses: Session): Promise<EndGate> {
  if (!smAvailable()) return { ok: true, minutes: null }; // legacy behaviour (wall-clock minutes)
  try {
    let rec = records.get(ses.oppId);
    if (!rec || isTerminal(rec.state)) rec = await smCall("adopt", null, { type: OPPORTUNITY_SESSION_TYPE, name: ses.name, externalRef: ses.oppId, startedAt: ses.startedAt });
    const b = await smCall("beginOp", rec.id, { key: "end-product:" + ses.oppId, label: "افزودن محصول پایان جلسه", recordKey: "opportunity:" + ses.oppId });
    if (b.ok) return { ok: true, minutes: Math.max(1, Math.ceil(b.activeMs / 60000)) };
    if (b.reason === "state") return { ok: false, message: isTerminal(b.state) ? "این جلسه قبلاً پایان یافته است؛ آن را از لیست حذف کنید." : "جلسه «" + STATE_FA[b.state] + "» است؛ برای پایان، ابتدا آن را ادامه دهید." };
    if (b.reason === "inflight") return { ok: false, message: "پایان این جلسه هم‌اکنون در حال انجام است." };
    if (b.reason === "record-locked") return { ok: false, message: "این فرصت هم‌زمان توسط جلسهٔ دیگری به‌روزرسانی می‌شود؛ چند لحظه بعد دوباره تلاش کنید." };
    return { ok: false, message: "پایان جلسه این‌بار ممکن نیست؛ دوباره تلاش کنید." };
  } catch (e) {
    // bridge present but manager not answering: refuse rather than bill paused time by mistake
    return { ok: false, message: "مدیر جلسه پاسخ نمی‌دهد؛ برای جلوگیری از محاسبهٔ نادرست زمان، پایان جلسه انجام نشد. دوباره تلاش کنید.\n" + errorMessage(e) };
  }
}

/** After the END_PRODUCT attempt: completes the managed session (success) or releases the operation (failure). */
export async function smEndDone(ses: Session, ok: boolean, error?: string): Promise<void> {
  if (!smAvailable()) return;
  const id = records.get(ses.oppId)?.id;
  if (!id) return;
  for (let i = 0; i < 2; i++) {
    try { await smCall("endOp", id, { key: "end-product:" + ses.oppId, ok, ...(error ? { error: error.slice(0, 280) } : {}), ...(ok ? { finalize: true } : {}) }); records.delete(ses.oppId); return; }
    catch (e) { if (i) console.warn("session-manager: could not record the end of the session:", e); }
  }
}
