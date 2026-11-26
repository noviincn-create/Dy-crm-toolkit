/** The dashboard UI: mount / close, events, rendering (KPIs, trend, ranking, donut, table, drill-down). */
import { esc, pad, toFaDigits } from "../shared/text";
import { MONTHS, PALETTE, REPORT_CSS_ID, REPORT_ID } from "./constants";
import { INSTALL_TRANSPORT_ONCE, loadData } from "./load";
import { jtext, jtextFromIso, periodRange, persianParts } from "./dates";
import { DIMS } from "./dims";
import { compact, format, money, num } from "./format";
import { exportCSV, exportExcel } from "./export";
import { deltaPct, groupRecords, totalsOf } from "./data";
import { pageSize, persist, state } from "./state";
import { REPORT_CSS } from "./styles";
import { reportHtml } from "./template";
import type { DimKey, Group, PeriodKey, TrendMetric, TrendMode, Basis, Currency } from "./types";

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const $$ = (selector: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(selector)];
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isOpen = (): boolean => !!document.getElementById(REPORT_ID);

// ───────────── status / error / loading ─────────────
export function setLoading(show: boolean, title?: string, detail?: string): void {
  const el = document.getElementById("rp-loading");
  if (!el) return;
  el.style.display = show ? "grid" : "none";
  if (title) $("#rp-loading-title").textContent = title;
  if (detail) $("#rp-loading-detail").textContent = detail;
}

export function showError(message: string): void {
  const el = document.getElementById("rp-error");
  if (el) el.innerHTML = message ? `<div class="error">${esc(message)}</div>` : "";
}

export function setStatus(message: string): void {
  const el = document.getElementById("rp-status");
  if (el) el.textContent = message;
}

// ───────────── KPI cards ─────────────
function deltaHtml(value: number | null): string {
  if (!state.prev) return "";
  if (value === null) return `<div class="delta">دوره قبل: بدون داده</div>`;
  const up = value >= 0;
  return `<div class="delta ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${format(Math.abs(value))}٪ نسبت به دوره قبل</div>`;
}

interface Kpi { title: string; value: string; sub?: string; delta?: number | null }

function renderKpis(): void {
  const t = totalsOf(state.records);
  const p = state.prev ? totalsOf(state.prev) : null;
  const best = groupRecords(state.records, "product").sort((a, b) => b.revenue - a.revenue)[0];
  const d = (cur: number, prev: number | undefined): number | null => (p ? deltaPct(cur, prev ?? 0) : null);

  const cards: Kpi[] = [
    { title: "مجموع فروش نهایی", value: money(t.revenue), delta: d(t.revenue, p?.revenue) },
    { title: "تعداد فرصت‌های موفق", value: format(t.opps), delta: d(t.opps, p?.opps) },
    { title: "میانگین ارزش هر فرصت", value: money(t.avgDeal), delta: d(t.avgDeal, p?.avgDeal) },
    { title: "تعداد کل فروش", value: format(t.quantity), delta: d(t.quantity, p?.quantity) },
    { title: "مجموع تخفیف", value: money(t.discount), sub: `${format(t.discountPct)}٪ از مبلغ پایه` },
    { title: "محصولات فروخته‌شده", value: format(t.products) },
    { title: "مشتریان خریدار", value: format(t.customers) },
    { title: "پرفروش‌ترین محصول", value: best ? esc(best.name) : "—", sub: best ? `${money(best.revenue)} · ${format(best.share)}٪ سهم` : "" },
  ];

  $("#rp-kpis").innerHTML = cards.map((c) => `
    <div class="kpi">
      <div class="kpi-title">${c.title}</div>
      <div class="kpi-value">${c.value}</div>
      ${c.sub ? `<div class="kpi-sub">${c.sub}</div>` : ""}
      ${"delta" in c ? deltaHtml(c.delta ?? null) : ""}
    </div>`).join("");
}

// ───────────── trend ─────────────
function renderTrend(): void {
  const { trendMode: mode, trendMetric: metric } = state;
  const map = new Map<string, { label: string; revenue: number; quantity: number; opps: Set<string> }>();

  for (const row of state.records) {
    let key = "نامشخص";
    let label = "نامشخص";
    if (row.date && !isNaN(row.date.getTime())) {
      const j = persianParts(row.date);
      if (mode === "day") {
        key = `${j.y}-${pad(j.m)}-${pad(j.d)}`;
        label = toFaDigits(`${pad(j.m)}/${pad(j.d)}`);
      } else {
        key = `${j.y}-${pad(j.m)}`;
        label = `${MONTHS[j.m - 1]} ${toFaDigits(String(j.y).slice(2))}`;
      }
    }
    let b = map.get(key);
    if (!b) { b = { label, revenue: 0, quantity: 0, opps: new Set() }; map.set(key, b); }
    b.revenue += row.revenue;
    b.quantity += row.quantity;
    if (row.oppId) b.opps.add(row.oppId);
  }

  const data = [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(mode === "day" ? -40 : -24)
    .map(([, b]) => ({ label: b.label, value: metric === "opps" ? b.opps.size : b[metric] }));

  const host = $("#rp-trend");
  if (!data.length) { host.innerHTML = `<div class="empty">داده‌ای برای نمایش وجود ندارد</div>`; return; }

  const max = Math.max(...data.map((d) => d.value), 1);
  const show = (v: number): string => (metric === "revenue" ? compact(v) : format(v));

  host.innerHTML = data.map((d) => `
    <div class="bar-column" title="${esc(d.label)} : ${esc(metric === "revenue" ? money(d.value) : format(d.value))}">
      <span class="bar-value">${esc(show(d.value))}</span>
      <div class="bar" style="height:${Math.max(3, (d.value / max) * 140)}px"></div>
      <span class="bar-label">${esc(d.label)}</span>
    </div>`).join("");
}

// ───────────── ranking + donut ─────────────
function renderRanking(): void {
  $("#rp-rank-title").textContent = `ده ${DIMS[state.dim].label} برتر`;
  const top = [...state.groups].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const host = $("#rp-ranking");
  if (!top.length) { host.innerHTML = `<div class="empty">اطلاعاتی وجود ندارد</div>`; return; }
  const max = Math.max(...top.map((i) => i.revenue), 1);
  host.innerHTML = top.map((item, i) => `
    <div class="rank-row">
      <div class="rank-name" title="${esc(item.name)}">${toFaDigits(i + 1)}. ${esc(item.name)}</div>
      <div class="track"><span style="width:${Math.max(1, (item.revenue / max) * 100)}%"></span></div>
      <div class="rank-value">${esc(compact(item.revenue))}</div>
    </div>`).join("");
}

function renderDonut(): void {
  const host = $("#rp-donut");
  const sorted = state.groups.filter((g) => g.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  const total = sorted.reduce((s, g) => s + g.revenue, 0);
  if (!sorted.length || !total) { host.innerHTML = `<div class="empty">اطلاعاتی وجود ندارد</div>`; return; }

  const top = sorted.slice(0, 5).map((g) => ({ name: g.name, value: g.revenue }));
  const rest = sorted.slice(5).reduce((s, g) => s + g.revenue, 0);
  if (rest > 0) top.push({ name: "سایر", value: rest });

  let acc = 0;
  const stops = top.map((item, i) => {
    const from = (acc / total) * 100;
    acc += item.value;
    return `${PALETTE[i]} ${from}% ${(acc / total) * 100}%`;
  }).join(",");

  host.innerHTML = `
    <div class="donut" style="background:conic-gradient(${stops})"></div>
    <div class="legend">${top.map((item, i) => `
      <div class="legend-row"><i style="background:${PALETTE[i]}"></i>
        <span title="${esc(item.name)}">${esc(item.name)}</span><span>${format((item.value / total) * 100)}٪</span></div>`).join("")}
    </div>`;
}

// ───────────── table ─────────────
function filteredGroups(): Group[] {
  const rows = state.groups.filter((g) => !state.search || g.name.toLocaleLowerCase().includes(state.search));
  const key = state.sort as keyof Group;
  const dir = state.direction === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (typeof x === "string" && typeof y === "string") return x.localeCompare(y, "fa") * dir;
    return (num(x) - num(y)) * dir;
  });
  return rows;
}

function renderTable(): void {
  const rows = filteredGroups();
  state.filtered = rows;
  const size = pageSize();
  const pages = Math.max(1, Math.ceil(rows.length / size));
  state.page = Math.min(state.page, pages);
  const offset = (state.page - 1) * size;
  const current = rows.slice(offset, offset + size);
  state.pageRows = current;

  $("#rp-tbody").innerHTML = current.length
    ? current.map((g, i) => `
      <tr data-i="${i}">
        <td class="product-name">${esc(g.name)}</td>
        <td>${format(g.oppCount)}</td>
        <td>${format(g.quantity)}</td>
        <td>${money(g.unitPrice)}</td>
        <td>${money(g.base)}</td>
        <td>${money(g.discount)}</td>
        <td>${format(g.discountPct)}٪</td>
        <td><strong>${money(g.revenue)}</strong></td>
        <td><div class="share-cell"><div class="track"><span style="width:${Math.min(100, g.share)}%"></span></div><span>${format(g.share)}٪</span></div></td>
      </tr>`).join("")
    : `<tr><td colspan="9" class="empty">موردی پیدا نشد.</td></tr>`;

  $("#rp-table-info").textContent =
    `نمایش ${format(rows.length ? offset + 1 : 0)} تا ${format(Math.min(offset + current.length, rows.length))} از ${format(rows.length)} مورد`;
  $("#rp-page-label").textContent = `صفحه ${format(state.page)} از ${format(pages)}`;
  $<HTMLButtonElement>("#rp-prev").disabled = state.page <= 1;
  $<HTMLButtonElement>("#rp-next").disabled = state.page >= pages;
}

// ───────────── drill-down ─────────────
function closeModal(): void {
  const modal = document.getElementById("rp-modal");
  if (!modal) return;
  modal.style.display = "none";
  modal.innerHTML = "";
}

function openDrill(group: Group): void {
  const dim = DIMS[state.dim];
  const lines = state.records.filter((r) => dim.key(r) === group.key).sort((a, b) => b.revenue - a.revenue);

  const link = (oppId: string, oppName: string): string => {
    const name = esc(oppName || "فرصت بدون عنوان");
    if (!GUID_RE.test(oppId)) return name;
    const href = `${location.origin}/main.aspx?etn=opportunity&pagetype=entityrecord&id=${encodeURIComponent(oppId)}`;
    return `<a href="${href}" target="_blank" rel="noopener">${name}</a>`;
  };

  const modal = $("#rp-modal");
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <div>
          <h2 class="panel-title">${esc(group.name)}</h2>
          <div class="subtitle">${format(group.lines)} ردیف · ${format(group.oppCount)} فرصت · مبلغ نهایی ${money(group.revenue)}</div>
        </div>
        <button class="btn" id="rp-modal-close">بستن</button>
      </div>
      <div class="modal-body"><table>
        <thead><tr><th>تاریخ</th><th>فرصت</th><th>محصول</th><th>مشتری</th><th>مالک</th><th>تعداد</th><th>مبلغ نهایی</th></tr></thead>
        <tbody>${lines.map((r) => `
          <tr style="cursor:default">
            <td>${jtext(r.date)}</td><td>${link(r.oppId, r.oppName)}</td><td>${esc(r.product)}</td>
            <td>${esc(r.customer || "—")}</td><td>${esc(r.owner || "—")}</td><td>${format(r.quantity)}</td>
            <td><strong>${money(r.revenue)}</strong></td>
          </tr>`).join("")}
        </tbody>
      </table></div>
    </div>`;
  modal.style.display = "grid";
  $("#rp-modal-close").onclick = closeModal;
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };
}

// ───────────── render entry points ─────────────
export function renderGroupViews(): void {
  state.groups = groupRecords(state.records, state.dim);
  renderRanking();
  renderDonut();
  renderTable();
}

export function renderAll(): void {
  renderKpis();
  renderTrend();
  renderGroupViews();
}

// ───────────── mount ─────────────
const updateJalaliHints = (): void => {
  $("#rp-start-j").textContent = jtextFromIso($<HTMLInputElement>("#rp-start").value);
  $("#rp-end-j").textContent = jtextFromIso($<HTMLInputElement>("#rp-end").value);
};

function applyPeriod(): void {
  const period = $<HTMLSelectElement>("#rp-period").value as PeriodKey;
  const range = periodRange(period);
  state.period = period;
  if (range) { $<HTMLInputElement>("#rp-start").value = range[0]; $<HTMLInputElement>("#rp-end").value = range[1]; }
  updateJalaliHints();
  persist();
}

const updateTabs = (): void => {
  $$("#rp-tabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.dim === state.dim));
  $("#rp-th-name").textContent = `${DIMS[state.dim].label} ↕`;
};

const updateThemeButton = (): void => { $("#rp-theme").textContent = state.theme === "dark" ? "حالت روشن" : "حالت تیره"; };

function setupAutoRefresh(): void {
  clearInterval(state.timer);
  state.timer = undefined;
  if (state.autoRefresh > 0) {
    state.timer = setInterval(() => {
      const modal = document.getElementById("rp-modal");
      if (!modal || modal.style.display === "none") void load();
    }, state.autoRefresh * 60_000);
  }
}

/** Fetches (current + previous period) and renders; errors land in the error box. */
export function load(): Promise<void> {
  return loadData({ setLoading, setStatus, showError, renderAll });
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== "Escape") return;
  const modal = document.getElementById("rp-modal");
  if (modal && modal.style.display !== "none") closeModal();
}

export function closeReport(): void {
  clearInterval(state.timer);
  state.timer = undefined;
  document.removeEventListener("keydown", onKeyDown);
  document.getElementById(REPORT_ID)?.remove();
  document.getElementById(REPORT_CSS_ID)?.remove();
}

function applyFilters(): void {
  const start = $<HTMLInputElement>("#rp-start").value;
  const end = $<HTMLInputElement>("#rp-end").value;
  if (start && end && start > end) { showError("تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد."); return; }
  void load();
}

function bindEvents(): void {
  document.addEventListener("keydown", onKeyDown);

  $("#rp-close").onclick = closeReport;
  $("#rp-refresh").onclick = () => void load();
  $("#rp-apply").onclick = applyFilters;
  $("#rp-print").onclick = () => window.print();
  $("#rp-export").onclick = () => { if (!exportExcel()) showError("داده‌ای برای خروجی وجود ندارد."); };
  $("#rp-csv").onclick = () => { if (!exportCSV()) showError("داده‌ای برای خروجی وجود ندارد."); };

  $("#rp-theme").onclick = () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    $("#" + REPORT_ID).classList.toggle("dark", state.theme === "dark");
    updateThemeButton();
    persist();
  };

  $("#rp-period").onchange = () => { applyPeriod(); if (state.period !== "custom") void load(); };

  const markCustom = (): void => {
    $<HTMLSelectElement>("#rp-period").value = "custom";
    state.period = "custom";
    updateJalaliHints();
    persist();
  };
  $("#rp-start").onchange = markCustom;
  $("#rp-end").onchange = markCustom;

  $("#rp-basis").onchange = () => { state.basis = $<HTMLSelectElement>("#rp-basis").value as Basis; persist(); void load(); };
  $("#rp-auto").onchange = (e) => { state.autoRefresh = Number((e.target as HTMLSelectElement).value); persist(); setupAutoRefresh(); };

  $("#rp-search").oninput = (e) => {
    state.search = (e.target as HTMLInputElement).value.trim().toLocaleLowerCase();
    state.page = 1;
    renderTable();
  };

  $("#rp-page-size").onchange = (e) => {
    state.pageSizeKey = (e.target as HTMLSelectElement).value;
    state.page = 1;
    persist();
    renderTable();
  };

  $("#rp-currency").onchange = (e) => { state.currency = (e.target as HTMLSelectElement).value as Currency; persist(); renderAll(); };
  $("#rp-trend-mode").onchange = (e) => { state.trendMode = (e.target as HTMLSelectElement).value as TrendMode; persist(); renderTrend(); };
  $("#rp-trend-metric").onchange = (e) => { state.trendMetric = (e.target as HTMLSelectElement).value as TrendMetric; persist(); renderTrend(); };

  $("#rp-prev").onclick = () => { state.page = Math.max(1, state.page - 1); renderTable(); };
  $("#rp-next").onclick = () => { state.page++; renderTable(); };

  $$("#rp-tabs .tab").forEach((btn) => {
    btn.onclick = () => {
      state.dim = btn.dataset.dim as DimKey;
      state.page = 1;
      state.sort = "revenue";
      state.direction = "desc";
      persist();
      updateTabs();
      renderGroupViews();
    };
  });

  $$("th[data-sort]").forEach((th) => {
    th.onclick = () => {
      const key = th.dataset.sort!;
      if (state.sort === key) state.direction = state.direction === "asc" ? "desc" : "asc";
      else { state.sort = key; state.direction = key === "name" ? "asc" : "desc"; }
      renderTable();
    };
  });

  $("#rp-tbody").onclick = (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("tr[data-i]");
    if (!row || (e.target as HTMLElement).closest("a")) return;
    const group = state.pageRows[Number(row.dataset.i)];
    if (group) openDrill(group);
  };
}

/** Opens the dashboard (or refreshes it when it is already open). */
export function openReport(): void {
  INSTALL_TRANSPORT_ONCE();
  if (isOpen()) { void load(); return; }

  const style = document.createElement("style");
  style.id = REPORT_CSS_ID;
  style.textContent = REPORT_CSS;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = REPORT_ID;
  if (state.theme === "dark") root.classList.add("dark");
  root.innerHTML = reportHtml();
  document.body.appendChild(root);

  $<HTMLSelectElement>("#rp-period").value = state.period;
  $<HTMLSelectElement>("#rp-basis").value = state.basis;
  $<HTMLSelectElement>("#rp-currency").value = state.currency;
  $<HTMLSelectElement>("#rp-auto").value = String(state.autoRefresh);
  $<HTMLSelectElement>("#rp-trend-metric").value = state.trendMetric;
  $<HTMLSelectElement>("#rp-trend-mode").value = state.trendMode;
  $<HTMLSelectElement>("#rp-page-size").value = state.pageSizeKey;

  // a saved "custom" period has no saved dates: show this month instead
  if (state.period === "custom") {
    const range = periodRange("thisMonth")!;
    $<HTMLInputElement>("#rp-start").value = range[0];
    $<HTMLInputElement>("#rp-end").value = range[1];
    updateJalaliHints();
  } else {
    applyPeriod();
  }

  updateTabs();
  updateThemeButton();
  bindEvents();
  setupAutoRefresh();
  void load();
}
