import { SETTINGS_KEY } from "./constants";
import type { Basis, Currency, DimKey, Group, PeriodKey, Row, Settings, TrendMetric, TrendMode } from "./types";

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

function loadSettings(): Settings {
  let raw: Record<string, unknown> = {};
  try { raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") as Record<string, unknown>; } catch { /* blocked or corrupt */ }
  const pageSizeKey = pick(raw.pageSizeKey, ["20", "50", "100", "all"] as const, "20");
  return {
    basis: pick<Basis>(raw.basis, ["close", "created"], "close"),
    period: pick<PeriodKey>(raw.period, ["today", "last30", "thisMonth", "lastMonth", "thisYear", "lastYear", "all", "custom"], "thisMonth"),
    dim: pick<DimKey>(raw.dim, ["product", "customer", "owner", "opportunity"], "product"),
    pageSizeKey,
    currency: pick<Currency>(raw.currency, ["ریال", "تومان"], "ریال"),
    trendMode: pick<TrendMode>(raw.trendMode, ["month", "day"], "month"),
    trendMetric: pick<TrendMetric>(raw.trendMetric, ["revenue", "quantity", "opps"], "revenue"),
    theme: raw.theme === "dark" ? "dark" : "light",
    autoRefresh: [0, 5, 15, 30].includes(Number(raw.autoRefresh)) ? Number(raw.autoRefresh) : 0,
  };
}

export const state = {
  ...loadSettings(),
  records: [] as Row[],
  prev: null as Row[] | null,
  prevRange: null as [string, string] | null,
  groups: [] as Group[],
  filtered: [] as Group[],
  pageRows: [] as Group[],
  loading: false,
  startDate: "",
  endDate: "",
  search: "",
  sort: "revenue" as string,
  direction: "desc" as "asc" | "desc",
  page: 1,
  lastUpdate: null as Date | null,
  timer: undefined as ReturnType<typeof setInterval> | undefined,
};

export const pageSize = (): number => (state.pageSizeKey === "all" ? Number.MAX_SAFE_INTEGER : Number(state.pageSizeKey));

export function persist(): void {
  const s: Settings = {
    basis: state.basis, period: state.period, dim: state.dim, pageSizeKey: state.pageSizeKey, currency: state.currency,
    trendMode: state.trendMode, trendMetric: state.trendMetric, theme: state.theme, autoRefresh: state.autoRefresh,
  };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage may be blocked */ }
}
