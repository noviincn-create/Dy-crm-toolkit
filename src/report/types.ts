export type Basis = "close" | "created";
export type PeriodKey = "today" | "last30" | "thisMonth" | "lastMonth" | "thisYear" | "lastYear" | "all" | "custom";
export type DimKey = "product" | "customer" | "owner" | "opportunity";
export type TrendMode = "month" | "day";
export type TrendMetric = "revenue" | "quantity" | "opps";
export type Currency = "ریال" | "تومان";

/** One opportunity product line (a row of `opportunityproducts`). */
export interface Row {
  id: string;
  oppId: string;
  oppName: string;
  product: string;
  productKey: string;
  customer: string;
  owner: string;
  quantity: number;
  unitPrice: number;
  base: number;
  revenue: number;
  discount: number;
  date: Date | null;
}

export interface Group {
  key: string;
  name: string;
  quantity: number;
  base: number;
  revenue: number;
  discount: number;
  lines: number;
  opps: Set<string>;
  oppCount: number;
  unitPrice: number;
  discountPct: number;
  share: number;
}

export interface Totals {
  revenue: number;
  base: number;
  discount: number;
  quantity: number;
  opps: number;
  products: number;
  customers: number;
  avgDeal: number;
  discountPct: number;
}

export interface Settings {
  basis: Basis;
  period: PeriodKey;
  dim: DimKey;
  pageSizeKey: string;
  currency: Currency;
  trendMode: TrendMode;
  trendMetric: TrendMetric;
  theme: "light" | "dark";
  autoRefresh: number;
}
