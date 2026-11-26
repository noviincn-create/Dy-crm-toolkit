/**
 * DY Easy Close Opportunity / opportunity tools (content script, world MAIN: needs Xrm).
 * - floating buttons on the opportunity form: بستن به عنوان برنده, تغییر مرحله, افزودن محصول
 * - "فرصت جدید" on the list page (assigns the monthly number)
 * - session side panel
 */
import { QUICK_CRM_ATTR } from "../shared/config";
import { REPORT_OPEN_EVT } from "../report/constants";
import { clientUrl, getFC } from "../shared/xrm";
import { BTN_ID } from "./constants";
import { openCreateDialog } from "./create-dialog";
import { oppNumberApi } from "./opp-number";
import { installTaxDefault, openProductSearch, warmProductCache } from "./products";
import { sessionPanel } from "./session";
import { hasProcess } from "./stages";
import { openStageDialog } from "./stage-dialog";
import { syncButton } from "./ui/fab";
import { openDialog } from "./win-dialog";

const isOpenOpp = (): boolean => {
  const fc = getFC();
  if (!fc) return false;
  try {
    // statecode is usually not on the form, so don't depend on it; the open/closed check happens on click
    return fc.data.entity.getEntityName() === "opportunity" && !!fc.data.entity.getId();
  } catch {
    return false;
  }
};

const isOppList = (): boolean => /etn=opportunity/i.test(location.search) && !/pagetype=entityrecord/i.test(location.search);

/** Publishes the CRM address so the quick-session script (isolated world, any tab) can remember it. */
function publishCrmUrl(): void {
  if (location.pathname.toLowerCase().indexOf("main.aspx") === -1 || document.documentElement.hasAttribute(QUICK_CRM_ATTR)) return;
  try { document.documentElement.setAttribute(QUICK_CRM_ATTR, clientUrl()); } catch { /* Xrm not ready yet */ }
}

function ensureButtons(): void {
  publishCrmUrl();
  if (window.Xrm && document.body && location.pathname.toLowerCase().indexOf("main.aspx") !== -1) sessionPanel();
  const opp = isOpenOpp();
  syncButton(BTN_ID, opp, { cls: "win", icon: "check", label: "بستن به عنوان برنده", handler: () => void openDialog() });
  syncButton("dy-stage-btn", opp && hasProcess(), { cls: "tonal", icon: "swap", label: "تغییر مرحله", handler: () => void openStageDialog() });
  syncButton("dy-prod-btn", opp, { cls: "tonal", icon: "box", label: "افزودن محصول", handler: () => void openProductSearch() });
  if (opp) warmProductCache();
  syncButton("dy-new-btn", !opp && isOppList() && !!window.Xrm, { cls: "pri", icon: "add", label: "فرصت جدید", handler: openCreateDialog });
  // the sales dashboard lives in its own content script (report/index.ts); this only asks it to open
  syncButton("dy-report-btn", !opp && isOppList() && !!window.Xrm, {
    cls: "tonal", icon: "chart", label: "گزارش فروش", handler: () => document.dispatchEvent(new CustomEvent(REPORT_OPEN_EVT)),
  });
}

if (!window.__dyEasyClose) {
  window.__dyEasyClose = true;
  console.info(`DY CRM Toolkit ${__VERSION__}: opportunity tools loaded`);
  window.__dyOppNumber = oppNumberApi;
  installTaxDefault();
  // UCI is a single-page app, so poll for navigation between records
  setInterval(ensureButtons, 1000);
  setTimeout(ensureButtons, 0);
}
