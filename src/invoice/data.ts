/** Loads the opportunity, its lines and the buyer from the Web API and computes the invoice totals. */
import type { InvoiceConfig } from "../shared/config";
import { api, apiAll, type ODataRow } from "../shared/odata";
import { toFaDigits } from "../shared/text";

export const ANN = "OData.Community.Display.V1.FormattedValue";
export const LOOK = "Microsoft.Dynamics.CRM.lookuplogicalname";
const PREFER = { Prefer: `odata.include-annotations="${ANN},${LOOK}"` };

export interface InvoiceParty {
  name: string;
  nid: string;
  phone: string;
  province: string;
  county: string;
  city: string;
  postal: string;
  address: string;
}

export interface InvoiceLine {
  code: string;
  name: string;
  note: string;
  unit: string;
  qty: number;
  price: number;
  base: number;
  disc: number;
  after: number;
  tax: number;
}

export interface InvoiceTotals {
  base: number;
  /** Total discount = line discounts + opportunity-level discount. */
  disc: number;
  /** Opportunity-level discount (not part of any line). */
  oppDisc: number;
  tax: number;
  freight: number;
  payable: number;
}

export interface InvoiceData {
  number: string;
  date: string;
  lines: InvoiceLine[];
  buyer: InvoiceParty | null;
  totals: InvoiceTotals;
}

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const money = (v: unknown): string => toFaDigits(Math.round(num(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));
export const qty = (v: unknown): string => toFaDigits(String(Math.round(num(v) * 100) / 100));

/** Persian date (Tehran time) with Persian digits. */
export function invoiceDate(d: Date): string {
  try {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tehran" })
      .format(d)
      .replace(/[٠-٩]/g, (x) => String.fromCharCode(x.charCodeAt(0) - 0x0660 + 0x06f0));
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

async function loadParty(type: "contact" | "account", id: string): Promise<InvoiceParty> {
  const r = await api(`${type === "contact" ? "contacts" : "accounts"}(${id})`, { headers: PREFER });
  const addr = String(r.address1_composite || [r.address1_line1, r.address1_line2, r.address1_line3].filter(Boolean).join("، ") || "")
    .replace(/\s*[\r\n]+\s*/g, "، ");
  const common = {
    province: r.address1_stateorprovince || "", county: r.address1_county || "", city: r.address1_city || "", postal: r.address1_postalcode || "", address: addr,
  };
  return type === "contact"
    ? { name: r.fullname || "", nid: r.systan_nationalcode || "", phone: r.mobilephone || r.telephone1 || "", ...common }
    : { name: r.name || "", nid: r.systan_nationalidbase || "", phone: r.telephone1 || "", ...common };
}

async function loadBuyer(opp: ODataRow): Promise<InvoiceParty | null> {
  const candidates: Array<[string, string | undefined]> = [
    ["_customerid_value", opp["_customerid_value@" + LOOK]],
    ["_parentaccountid_value", "account"],
    ["_parentcontactid_value", "contact"],
  ];
  for (const [field, type] of candidates) {
    const id = opp[field] as string | undefined;
    if (!id || (type !== "account" && type !== "contact")) continue;
    try {
      return await loadParty(type, id);
    } catch (e) {
      console.warn("invoice buyer:", e);
      return { name: opp[field + "@" + ANN] || "", nid: "", phone: "", province: "", county: "", city: "", postal: "", address: "" };
    }
  }
  return null;
}

async function loadLines(id: string): Promise<InvoiceLine[]> {
  const rows = await apiAll("opportunityproducts?$filter=_opportunityid_value eq " + id, { headers: PREFER });
  rows.sort((a, b) => num(a.lineitemnumber) - num(b.lineitemnumber) || String(a.createdon).localeCompare(String(b.createdon)));
  // product codes (one extra query per 40 products)
  const ids = [...new Set(rows.map((r) => r._productid_value as string).filter(Boolean))];
  const codes: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 40) {
    const part = ids.slice(i, i + 40);
    try {
      const ps = await apiAll("products?$select=productid,productnumber&$filter=" + part.map((p) => "productid eq " + p).join(" or "), { headers: PREFER });
      ps.forEach((p) => { codes[p.productid] = p.productnumber || ""; });
    } catch (e) {
      console.warn("invoice product codes:", e);
    }
  }
  return rows.map((r) => {
    const base = r.baseamount != null ? num(r.baseamount) : num(r.priceperunit) * num(r.quantity);
    const disc = num(r.manualdiscountamount) + num(r.volumediscountamount);
    const name: string = r["_productid_value@" + ANN] || r.productname || r.productdescription || "";
    return {
      code: codes[r._productid_value] || "",
      name,
      note: r.productdescription && r.productdescription !== name ? r.productdescription : "",
      unit: r["_uomid_value@" + ANN] || "",
      qty: num(r.quantity), price: num(r.priceperunit), base, disc, after: base - disc, tax: num(r.tax),
    };
  });
}

export async function loadData(id: string, cfg: InvoiceConfig): Promise<InvoiceData> {
  const opp = await api("opportunities(" + id + ")", { headers: PREFER });
  const [lines, buyer] = await Promise.all([loadLines(id), cfg.showBuyer ? loadBuyer(opp) : Promise.resolve(null)]);
  const sum = (k: "base" | "disc" | "tax"): number => lines.reduce((s, l) => s + l[k], 0);
  const oppDisc = num(opp.discountamount);
  const freight = num(opp.freightamount);
  const totalBase = sum("base");
  const totalDisc = sum("disc") + oppDisc;
  const tax = sum("tax");
  const when = opp.actualclosedate ? new Date(opp.actualclosedate) : new Date();
  const configured = opp[cfg.numberField];
  return {
    number: String(configured != null && configured !== "" ? configured : opp.new_opportunitynumbertext || opp.new_opportunitynumber || ""),
    date: invoiceDate(when),
    lines,
    buyer,
    totals: { base: totalBase, disc: totalDisc, oppDisc, tax, freight, payable: totalBase - totalDisc + tax + freight },
  };
}
