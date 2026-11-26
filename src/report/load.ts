/** Loading flow: current period + previous period (for the comparison), then render. */
import { errorMessage } from "../shared/text";
import { installTransport, normalizeRecord, retrieveAll } from "./data";
import { format } from "./format";
import { jtextFromIso, previousRange } from "./dates";
import { env } from "./env";
import { state } from "./state";
import type { Basis } from "./types";

let installed = false;
export const INSTALL_TRANSPORT_ONCE = (): void => { if (!installed && !env.managed) { installed = true; installTransport(); } };

export interface LoadUi {
  setLoading(show: boolean, title?: string, detail?: string): void;
  setStatus(message: string): void;
  showError(message: string): void;
  renderAll(): void;
}

const value = (id: string): string => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "";

export async function loadData(ui: LoadUi): Promise<void> {
  if (state.loading) return;
  state.loading = true;
  ui.showError("");
  ui.setLoading(true);
  ui.setStatus("در حال اتصال به Dynamics 365...");

  try {
    state.startDate = value("rp-start");
    state.endDate = value("rp-end");
    state.basis = (value("rp-basis") || state.basis) as Basis;
    const basis = state.basis;

    const progress = (label: string) => (page: number, count: number): void =>
      ui.setLoading(true, label, `صفحه ${format(page)} · تعداد رکوردها ${format(count)}`);

    const current = await retrieveAll(basis, state.startDate, state.endDate, progress("در حال دریافت اطلاعات فروش"));
    state.records = current.map((r) => normalizeRecord(r, basis));

    // previous period (bounded ranges only); a failure here is not fatal
    state.prev = null;
    state.prevRange = null;
    const prevRange = previousRange(state.startDate, state.endDate);
    if (prevRange) {
      try {
        const prev = await retrieveAll(basis, prevRange[0], prevRange[1], progress("در حال دریافت دوره قبل برای مقایسه"));
        state.prev = prev.map((r) => normalizeRecord(r, basis));
        state.prevRange = prevRange;
      } catch (e) {
        console.warn("DY report: previous period failed", e);
      }
    }

    state.lastUpdate = new Date();
    state.page = 1;
    ui.renderAll();

    ui.setStatus(
      `آخرین بروزرسانی: ${state.lastUpdate.toLocaleString("fa-IR")} · ${format(state.records.length)} ردیف فروش` +
      (state.prevRange ? ` · مقایسه با ${jtextFromIso(state.prevRange[0])} تا ${jtextFromIso(state.prevRange[1])}` : ""),
    );
    if (!state.records.length) ui.showError("هیچ رکوردی پیدا نشد. بازه زمانی، مبنای تاریخ، دسترسی کاربر و فیلتر Closed Won را بررسی کنید.");
  } catch (e) {
    console.error("DY report:", e);
    // an unreachable CRM / sign-in redirect shows up as a network TypeError
    ui.showError((e as { name?: string } | null)?.name === "TypeError" && env.crmUrl
      ? `ارتباط با CRM برقرار نشد. ابتدا در همین Chrome وارد CRM شوید (${env.crmUrl}) و دوباره بروزرسانی کنید.`
      : errorMessage(e));
    ui.setStatus("خطا در دریافت اطلاعات");
  } finally {
    state.loading = false;
    ui.setLoading(false);
  }
}
