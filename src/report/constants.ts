/** Ids, events and storage keys of the sales dashboard (report module). */
export const REPORT_ID = "dy-report";
export const REPORT_CSS_ID = "dy-report-css";
/** Document event (any world) that asks the page script to open the dashboard. */
export const REPORT_OPEN_EVT = "dy-report-open";
/** Set on <html> by the page script so the bridge / omnibox know it is listening. */
export const REPORT_READY_ATTR = "data-dy-report";
export const SETTINGS_KEY = "dy.report.settings";
export const PAGE_SIZE = 5000;
export const MAX_PAGES = 2000;

export const MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
] as const;

export const PALETTE = ["#1768a5", "#2da4d7", "#17a589", "#f4b942", "#e67e5a", "#9aa7b8"];
