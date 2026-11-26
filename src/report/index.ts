/**
 * Sales dashboard entry (content script, world MAIN, document_start, top frame of CRM pages).
 * Opens the dashboard when
 *  - the page URL carries `#novinvn=report` (what novinvn://report becomes; see tools/protocol),
 *  - the extension asks for it (omnibox "nv report", through report-bridge),
 *  - a link to novinvn://report is clicked inside the page, or the floating button is pressed.
 */
import { parseNovinvn, routeFromLocation, withoutRoute } from "../shared/novinvn";
import { REPORT_OPEN_EVT, REPORT_READY_ATTR } from "./constants";
import { closeReport, openReport } from "./view";

type Route = () => void;
const ROUTES: Record<string, Route> = { report: openReport };

declare global {
  interface Window { __dyReport?: { open: Route; close: Route; routes: string[] } }
}

if (!window.__dyReport) {
  window.__dyReport = { open: openReport, close: closeReport, routes: Object.keys(ROUTES) };

  document.addEventListener(REPORT_OPEN_EVT, () => whenBody(openReport));
  document.documentElement.setAttribute(REPORT_READY_ATTR, "1");

  // <a href="novinvn://report"> inside the CRM (dashboards, custom nav links, notes)
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.("a[href]");
    const route = a ? parseNovinvn(a.getAttribute("href") ?? "") : null;
    const run = route ? ROUTES[route] : undefined;
    if (run) { e.preventDefault(); run(); }
  }, true);

  // URL trigger: act once, then drop the parameter so a refresh does not reopen it
  const route = routeFromLocation(location);
  const run = route ? ROUTES[route] : undefined;
  if (run) {
    try { history.replaceState(history.state, "", withoutRoute(location.href)); } catch { /* keep the URL */ }
    whenBody(run);
  }
}

function whenBody(fn: () => void): void {
  if (document.body) fn();
  else document.addEventListener("DOMContentLoaded", fn, { once: true });
}
