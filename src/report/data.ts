/** Dynamics 365 Web API access and the aggregation maths of the dashboard. */
import { api, setApiTransport, type ODataList, type ODataRow } from "../shared/odata";
import { clientUrl } from "../shared/xrm";
import { PAGE_SIZE, MAX_PAGES } from "./constants";
import { endUtc, startUtc } from "./dates";
import { DIMS } from "./dims";
import { num } from "./format";
import type { Basis, DimKey, Group, Row, Totals } from "./types";

/** The Xrm client URL when the form framework is up, otherwise the page origin (the dashboard may open before Xrm loads). */
export function installTransport(): void {
  setApiTransport({
    base: () => { try { return clientUrl(); } catch { return location.origin; } },
    credentials: "same-origin",
  });
}

const FV = "@OData.Community.Display.V1.FormattedValue";

export function buildQuery(basis: Basis, start: string, end: string): string {
  const field = basis === "close" ? "actualclosedate" : "createdon";
  const filters = ["opportunityid/statecode eq 1"]; // won opportunities
  if (start) filters.push(`opportunityid/${field} ge ${startUtc(start)}`);
  if (end) filters.push(`opportunityid/${field} lt ${endUtc(end)}`);

  const params = new URLSearchParams();
  params.set("$select", [
    "opportunityproductid", "productdescription", "priceperunit", "quantity", "baseamount", "extendedamount", "tax",
    "manualdiscountamount", "volumediscountamount", "_productid_value", "_opportunityid_value",
  ].join(","));
  params.set("$filter", filters.join(" and "));
  params.set("$expand", [
    "opportunityid($select=opportunityid,name,createdon,actualclosedate,actualvalue,_ownerid_value,_customerid_value)",
    "productid($select=name,productnumber)",
  ].join(","));
  // No $top: it would disable @odata.nextLink and cap the result.
  return `opportunityproducts?${params.toString()}`;
}

/** Every page of a range. `onPage` reports progress. */
export async function retrieveAll(
  basis: Basis, start: string, end: string, onPage: (page: number, count: number) => void,
): Promise<ODataRow[]> {
  const headers = { Prefer: `odata.maxpagesize=${PAGE_SIZE},odata.include-annotations="OData.Community.Display.V1.FormattedValue"` };
  const records: ODataRow[] = [];
  let url: string | undefined = buildQuery(basis, start, end);
  for (let page = 1; url && page <= MAX_PAGES; page++) {
    onPage(page, records.length);
    const result: ODataList<ODataRow> = await api<ODataList<ODataRow>>(url, { headers });
    records.push(...(result.value ?? []));
    url = result["@odata.nextLink"];
  }
  return records;
}

export function normalizeRecord(record: ODataRow, basis: Basis): Row {
  const opp: ODataRow = record.opportunityid || {};
  const product: ODataRow = record.productid || {};
  const productName: string = product.name || record.productdescription || "محصول بدون عنوان";

  const base = num(record.baseamount);
  const revenue = num(record.extendedamount);
  const tax = num(record.tax);
  // extended = base - discounts + tax  =>  discount = base + tax - extended
  const discount = Math.max(0, base + tax - revenue);

  const created = opp.createdon ? new Date(opp.createdon) : null;
  const closed = opp.actualclosedate ? new Date(opp.actualclosedate) : null;

  return {
    id: record.opportunityproductid,
    oppId: opp.opportunityid || record._opportunityid_value || "",
    oppName: opp.name || "",
    product: productName,
    productKey: productName.trim().toLocaleLowerCase(),
    customer: opp["_customerid_value" + FV] || "",
    owner: opp["_ownerid_value" + FV] || "",
    quantity: num(record.quantity),
    unitPrice: num(record.priceperunit),
    base,
    revenue,
    discount,
    date: basis === "close" ? closed || created : created || closed,
  };
}

export function groupRecords(records: Row[], dimKey: DimKey): Group[] {
  const dim = DIMS[dimKey];
  const map = new Map<string, Group>();

  for (const row of records) {
    const key = dim.key(row);
    let g = map.get(key);
    if (!g) {
      g = { key, name: dim.name(row), quantity: 0, base: 0, revenue: 0, discount: 0, lines: 0, opps: new Set(), oppCount: 0, unitPrice: 0, discountPct: 0, share: 0 };
      map.set(key, g);
    }
    g.quantity += row.quantity;
    g.base += row.base;
    g.revenue += row.revenue;
    g.discount += row.discount;
    g.lines++;
    if (row.oppId) g.opps.add(row.oppId);
  }

  const groups = [...map.values()];
  const total = groups.reduce((s, g) => s + g.revenue, 0);
  for (const g of groups) {
    g.oppCount = g.opps.size;
    g.unitPrice = g.quantity ? g.base / g.quantity : 0;
    g.discountPct = g.base ? (g.discount / g.base) * 100 : 0;
    g.share = total ? (g.revenue / total) * 100 : 0;
  }
  return groups;
}

export function totalsOf(records: Row[]): Totals {
  const opps = new Set<string>();
  const products = new Set<string>();
  const customers = new Set<string>();
  const t: Totals = { revenue: 0, base: 0, discount: 0, quantity: 0, opps: 0, products: 0, customers: 0, avgDeal: 0, discountPct: 0 };

  for (const r of records) {
    t.revenue += r.revenue;
    t.base += r.base;
    t.discount += r.discount;
    t.quantity += r.quantity;
    if (r.oppId) opps.add(r.oppId);
    products.add(r.productKey);
    if (r.customer) customers.add(r.customer);
  }
  t.opps = opps.size;
  t.products = products.size;
  t.customers = customers.size;
  t.avgDeal = t.opps ? t.revenue / t.opps : 0;
  t.discountPct = t.base ? (t.discount / t.base) * 100 : 0;
  return t;
}

export const deltaPct = (current: number, previous: number): number | null =>
  previous > 0 ? ((current - previous) / previous) * 100 : null;
