/**
 * CRM record operations of the session flow (no DOM): create the opportunity, add product lines, add the END_PRODUCT.
 * Used by the CRM-page panel (MAIN world) and by the service worker (quick sessions from any tab); the Web API transport
 * (shared/odata) decides which address / cookies are used.
 */
import { api, apiAll, ApiError, type ODataList } from "../shared/odata";
import { cleanId } from "../shared/xrm";
import { END_PRODUCT } from "./constants";
import { assignOpportunityNumber } from "./opp-number";

/** Print products are billed per page, so session time is not added when every line is one. */
export const isPrintName = (name: string | null | undefined): boolean => /پرینت|print/i.test(name ?? "");

/** The user's default currency: from the Xrm client when running in a CRM page, otherwise through WhoAmI. */
export async function getCurrencyId(): Promise<string | null> {
  try {
    const xrm = typeof window !== "undefined" ? window.Xrm : undefined;
    if (xrm) {
      const us = xrm.Utility.getGlobalContext().userSettings;
      if (us.transactionCurrency?.id) return cleanId(us.transactionCurrency.id);
      const u = await api("systemusers(" + cleanId(us.userId) + ")?$select=_transactioncurrencyid_value");
      return u._transactioncurrencyid_value || null;
    }
    const me = await api<{ UserId: string }>("WhoAmI");
    const u = await api("systemusers(" + cleanId(me.UserId) + ")?$select=_transactioncurrencyid_value");
    return u._transactioncurrencyid_value || null;
  } catch {
    return null;
  }
}

export interface NewOppOptions {
  /** Price list ("لیست قیمت") of the new opportunity; its currency wins over the user's currency. */
  priceLevelId?: string | null;
}

/** The request body of a new opportunity: subject, optional description, price list and currency. */
export async function newOpportunityBody(name: string, description?: string, opts: NewOppOptions = {}): Promise<Record<string, string>> {
  const body: Record<string, string> = { name };
  if (description) body.description = description;
  let cur: string | null = null;
  if (opts.priceLevelId) {
    const pl = cleanId(opts.priceLevelId);
    body["pricelevelid@odata.bind"] = "/pricelevels(" + pl + ")";
    try { cur = (await api("pricelevels(" + pl + ")?$select=_transactioncurrencyid_value"))._transactioncurrencyid_value || null; } catch { cur = null; }
  }
  cur = cur || (await getCurrencyId());
  if (cur) body["transactioncurrencyid@odata.bind"] = "/transactioncurrencies(" + cur + ")";
  return body;
}

/** Creates the opportunity (same POST as New Opp) and assigns the monthly number; the number step failing never loses the record. */
export async function createOpportunityRecord(name: string, opts: NewOppOptions = {}): Promise<{ oppId: string; number: string | null; numErr: unknown }> {
  const body = await newOpportunityBody(name, undefined, opts);
  const rec = await api("opportunities", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
  const oppId = cleanId(rec.opportunityid);
  let number: string | null = null;
  let numErr: unknown = null;
  try { number = (await assignOpportunityNumber(oppId)).number; } catch (e) { numErr = e; }
  return { oppId, number, numErr };
}

/** Amount of a product in a price list (null when the list has no item for it). */
export async function priceInLevel(productId: string, uom: string | null, levelId: string): Promise<number | null> {
  const r = await api<ODataList<{ amount: number | null }>>(
    "productpricelevels?$select=amount&$top=1&$filter=" +
    encodeURIComponent("_productid_value eq " + productId + " and _pricelevelid_value eq " + levelId + (uom ? " and _uomid_value eq " + uom : "")));
  return r.value.length && r.value[0]!.amount != null ? r.value[0]!.amount : null;
}

/** Adds one product line (direct add: no quick-create form). `price` null = let CRM apply its own default. */
export async function postOpportunityProduct(oppId: string, productId: string, uom: string | null, quantity: number, price: number | null | undefined): Promise<void> {
  const body: Record<string, unknown> = {
    "opportunityid@odata.bind": "/opportunities(" + oppId + ")",
    "productid@odata.bind": "/products(" + productId + ")",
    quantity,
  };
  if (uom) body["uomid@odata.bind"] = "/uoms(" + uom + ")";
  if (price != null) { body.priceperunit = price; body.ispriceoverridden = true; }
  const post = (b: Record<string, unknown>): Promise<unknown> => api("opportunityproducts", { method: "POST", body: JSON.stringify(b) });
  try { await post({ bmsd_istaxmanualyset: true, ...body }); } // same "manual tax = yes" the product form gets
  catch (e) { if (e instanceof ApiError && e.status === 400) await post(body); else throw e; }
}

/** Adds the END_PRODUCT line item to the opportunity (once; safe to retry). */
export async function addEndProduct(oppId: string, minutes: number): Promise<{ name: string; already?: boolean; skippedPrint?: boolean }> {
  const pr = await api<ODataList<{ productid: string; name: string; price: number | null; _defaultuomid_value: string | null }>>(
    "products?$select=productid,name,price,_defaultuomid_value&$top=1&$filter=" + encodeURIComponent("productnumber eq '" + END_PRODUCT + "'"));
  if (!pr.value.length) throw new Error("محصول با شناسه " + END_PRODUCT + " پیدا نشد.");
  const p = pr.value[0]!;
  const uom = p._defaultuomid_value;
  const dup = await api<ODataList<unknown>>(
    "opportunityproducts?$select=opportunityproductid&$top=1&$filter=" + encodeURIComponent("_opportunityid_value eq " + oppId + " and _productid_value eq " + p.productid));
  if (dup.value.length) return { name: p.name, already: true };
  // only print products on the opportunity -> no session time (no products at all -> add)
  const lines = await apiAll<{ productname: string | null; "_productid_value@OData.Community.Display.V1.FormattedValue"?: string }>(
    "opportunityproducts?$select=productname,_productid_value&$filter=" + encodeURIComponent("_opportunityid_value eq " + oppId),
    { headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' } });
  if (lines.length && lines.every((l) => isPrintName(l["_productid_value@OData.Community.Display.V1.FormattedValue"]) || isPrintName(l.productname))) {
    return { name: p.name, skippedPrint: true };
  }
  let price = p.price;
  try {
    const o = await api("opportunities(" + oppId + ")?$select=_pricelevelid_value");
    if (o._pricelevelid_value) {
      const r = await api<ODataList<{ amount: number | null }>>(
        "productpricelevels?$select=amount&$top=1&$filter=" +
        encodeURIComponent("_productid_value eq " + p.productid + " and _pricelevelid_value eq " + o._pricelevelid_value + (uom ? " and _uomid_value eq " + uom : "")));
      if (r.value.length && r.value[0]!.amount != null) price = r.value[0]!.amount;
    }
  } catch (e) { console.warn("price lookup:", e); }
  await postOpportunityProduct(oppId, p.productid, uom, minutes, price);
  return { name: p.name };
}
