/**
 * Quick session, service-worker side. The popup runs on any website, so every CRM call is made here with the browser's CRM
 * cookies (host permission for the CRM domain), through the same record helpers the CRM-page panel uses.
 * Sessions are registered in the Session Manager (type opportunity-meeting, externalRef = opportunity id); the CRM-page
 * panel adopts them into its list, and "end" bills exactly like the panel (active minutes, print-only rule, INT-009).
 */
import { addEndProduct, createOpportunityRecord, postOpportunityProduct, priceInLevel } from "../close/records";
import { normQ } from "../shared/product-search";
import { activeMsAt } from "../session-manager/clock";
import { OPPORTUNITY_SESSION_TYPE } from "../session-manager/registry";
import { getManager } from "../session-manager/service";
import { isTerminal, SmError } from "../session-manager/types";
import { cleanCrmUrl, QUICK_URL_KEY } from "../shared/config";
import { crmBase, loadQuickConfig } from "../shared/crm-url";
import { api, apiAll, setApiTransport, type ODataRow } from "../shared/odata";
import { errorMessage } from "../shared/text";
import {
  parseQuickRequest, type QuickLiveSession, type QuickOp, type QuickPayloads, type QuickPriceLevel, type QuickProduct, type QuickResponse, type QuickResults,
} from "../quick/protocol";

const PRODUCTS_KEY = "quickProducts";
const PRODUCTS_TTL = 10 * 60_000;

/** Called once at worker start: the shared Web API client now talks to the CRM address with the CRM cookies. */
export function installQuickTransport(): void {
  setApiTransport({ base: crmBase, credentials: "include" });
}

// ───────────── catalogue ─────────────
interface ProductCache { at: number; list: QuickProduct[] }
let memo: ProductCache | null = null;
let loading: Promise<ProductCache> | null = null;

async function fetchProducts(): Promise<ProductCache> {
  const rows = await apiAll<ODataRow>(
    "products?$select=productid,name,productnumber,price,_defaultuomid_value&$filter=statecode eq 0&$orderby=name asc",
    { headers: { Prefer: 'odata.maxpagesize=5000, odata.include-annotations="OData.Community.Display.V1.FormattedValue"' } }, 40);
  const list: QuickProduct[] = rows.map((p) => ({
    id: String(p.productid), name: p.name || "", num: p.productnumber || "", price: p.price ?? null,
    uom: p._defaultuomid_value || null, uomName: p["_defaultuomid_value@OData.Community.Display.V1.FormattedValue"] || "",
  }));
  const c = { at: Date.now(), list };
  memo = c;
  try { await chrome.storage.local.set({ [PRODUCTS_KEY]: c }); } catch { /* quota: the in-memory copy still works */ }
  return c;
}

async function products(refresh: boolean): Promise<{ cache: ProductCache | null; error?: string }> {
  let cache = memo;
  if (!cache) {
    try { cache = ((await chrome.storage.local.get(PRODUCTS_KEY))[PRODUCTS_KEY] as ProductCache | undefined) ?? null; } catch { cache = null; }
    if (cache && !Array.isArray(cache.list)) cache = null;
    memo = cache;
  }
  const reload = (): Promise<ProductCache> => (loading ??= fetchProducts().finally(() => { loading = null; }));
  if (cache && !refresh) { // the popup opens at once with the saved list; an old list is refreshed in the background for next time
    if (Date.now() - cache.at >= PRODUCTS_TTL) reload().catch(() => undefined);
    return { cache };
  }
  try {
    return { cache: await reload() };
  } catch (e) {
    return { cache, error: errorMessage(e) }; // stale list is better than none
  }
}

async function priceLevels(): Promise<QuickPriceLevel[]> {
  const rows = await apiAll<ODataRow>("pricelevels?$select=pricelevelid,name&$filter=statecode eq 0&$orderby=name asc");
  return rows.map((r) => ({ id: String(r.pricelevelid), name: r.name || "" }));
}

/** "قیمت اصلی": exact match first, then a price list whose name contains it. */
export function pickMainPriceLevel(levels: QuickPriceLevel[], wanted: string): string | null {
  const w = normQ(wanted);
  if (!w) return null;
  return (levels.find((l) => normQ(l.name) === w) ?? levels.find((l) => normQ(l.name).includes(w)))?.id ?? null;
}

// ───────────── operations ─────────────
type Ops = { [K in QuickOp]: (p: QuickPayloads[K]) => Promise<QuickResults[K]> };

const liveSessions = async (): Promise<QuickLiveSession[]> => {
  const now = Date.now();
  return (await getManager().list({ type: OPPORTUNITY_SESSION_TYPE }))
    .filter((r) => !isTerminal(r.state) && r.externalRef)
    .sort((a, b) => (a.startedAt ?? a.createdAt) - (b.startedAt ?? b.createdAt))
    .map((r) => ({
      id: r.id, oppId: r.externalRef!, name: r.name, number: typeof r.meta.number === "string" ? r.meta.number : null,
      state: r.state, startedAt: r.startedAt, activeMs: activeMsAt(r, now),
    }));
};

const ops: Ops = {
  async bootstrap({ refresh }) {
    const cfg = await loadQuickConfig();
    const [levels, prod] = await Promise.all([priceLevels(), products(refresh === true)]);
    return {
      crmUrl: await crmBase(), priceLevels: levels, mainPriceLevelId: pickMainPriceLevel(levels, cfg.mainPriceList),
      products: prod.cache?.list ?? [], productsAt: prod.cache?.at ?? 0, ...(prod.error ? { productsError: prod.error } : {}),
    };
  },

  async prices({ priceLevelId }) {
    const rows = await apiAll<ODataRow>(
      "productpricelevels?$select=amount,_productid_value,_uomid_value&$filter=" + encodeURIComponent("_pricelevelid_value eq " + priceLevelId),
      { headers: { Prefer: "odata.maxpagesize=5000" } }, 40);
    const out: Record<string, number> = {};
    for (const r of rows) {
      if (r.amount == null || !r._productid_value) continue;
      out[r._productid_value + "|" + (r._uomid_value || "")] = r.amount;
      out[r._productid_value] ??= r.amount;
    }
    return out;
  },

  async sessions() {
    return { sessions: await liveSessions() };
  },

  async start({ name, priceLevelId, items, openForm }) {
    const opp = await createOpportunityRecord(name, { priceLevelId });
    const res: QuickResults["start"] = {
      oppId: opp.oppId, number: opp.number, sessionId: null, added: 0, lineErrors: [],
      ...(opp.numErr ? { numberError: errorMessage(opp.numErr) } : {}),
    };
    try {
      const rec = await getManager().create({
        type: OPPORTUNITY_SESSION_TYPE, name: name.slice(0, 200), externalRef: opp.oppId, ...(opp.number ? { meta: { number: opp.number } } : {}), autoStart: true,
      });
      res.sessionId = rec.id;
    } catch (e) { res.sessionError = errorMessage(e); } // the opportunity exists; the panel can still adopt it later
    if (items.length) {
      const cache = (await products(false)).cache?.list ?? [];
      for (const it of items) {
        const known = cache.find((p) => p.id.toLowerCase() === it.productId);
        try {
          let p = known;
          if (!p) {
            const r = await api("products(" + it.productId + ")?$select=productid,name,price,_defaultuomid_value");
            p = { id: it.productId, name: r.name || "", num: "", price: r.price ?? null, uom: r._defaultuomid_value || null, uomName: "" };
          }
          let price = p.price;
          if (priceLevelId) { try { price = (await priceInLevel(p.id, p.uom, priceLevelId)) ?? price; } catch (e) { console.warn("price lookup:", e); } }
          try { await postOpportunityProduct(opp.oppId, p.id, p.uom, it.qty, price); res.added++; }
          catch (e) { res.lineErrors.push({ name: p.name || it.productId, message: errorMessage(e) }); }
        } catch (e) { res.lineErrors.push({ name: known?.name || it.productId, message: errorMessage(e) }); }
      }
    }
    if (openForm) await ops.open({ oppId: opp.oppId }).catch(() => undefined);
    return res;
  },

  async end({ sessionId }) {
    const m = getManager();
    const rec = await m.get(sessionId);
    if (!rec || rec.type !== OPPORTUNITY_SESSION_TYPE || !rec.externalRef) throw new Error("جلسه پیدا نشد.");
    const oppId = rec.externalRef;
    const key = "end-product:" + oppId;
    const b = await m.beginOperation(rec.id, { key, label: "افزودن محصول پایان جلسه", recordKey: "opportunity:" + oppId });
    if (!b.ok) {
      if (b.reason === "state") throw new Error(isTerminal(b.state) ? "این جلسه قبلاً پایان یافته است." : "جلسه متوقف است؛ برای پایان، ابتدا آن را ادامه دهید (از پنل جلسه در CRM).");
      if (b.reason === "inflight") throw new Error("پایان این جلسه هم‌اکنون در حال انجام است.");
      if (b.reason === "record-locked") throw new Error("این فرصت هم‌زمان توسط جلسهٔ دیگری به‌روزرسانی می‌شود؛ چند لحظه بعد دوباره تلاش کنید.");
      throw new Error("پایان جلسه این‌بار ممکن نیست؛ دوباره تلاش کنید.");
    }
    const minutes = Math.max(1, Math.ceil(b.activeMs / 60000));
    let r: Awaited<ReturnType<typeof addEndProduct>>;
    try { r = await addEndProduct(oppId, minutes); }
    catch (e) {
      await m.endOperation(rec.id, key, { ok: false, error: errorMessage(e).slice(0, 280) }).catch(() => undefined);
      throw new Error("افزودن محصول ناموفق بود: " + errorMessage(e) + "\nجلسه هنوز باز است؛ دوباره تلاش کنید.");
    }
    await m.endOperation(rec.id, key, { ok: true, finalize: true });
    return { minutes, productName: r.name, already: r.already === true, skippedPrint: r.skippedPrint === true };
  },

  async setUrl({ url }) {
    const crmUrl = cleanCrmUrl(url);
    if (!crmUrl) throw new Error("آدرس CRM نامعتبر است.");
    await chrome.storage.local.set({ [QUICK_URL_KEY]: crmUrl });
    return { crmUrl };
  },

  async open({ oppId }) {
    await chrome.tabs.create({ url: (await crmBase()) + "/main.aspx?etn=opportunity&pagetype=entityrecord&id=" + oppId });
    return {};
  },
};

/** Entry point of the background `quick` handler. Never throws: failures are returned as `{ ok: false }`. */
export async function handleQuick(raw: unknown): Promise<QuickResponse> {
  try {
    const req = parseQuickRequest(raw);
    const { op, ...payload } = req;
    return { ok: true, data: await (ops[op] as (p: unknown) => Promise<QuickResults[QuickOp]>)(payload) } as QuickResponse;
  } catch (e) {
    if (!(e instanceof SmError) && !(e instanceof Error)) console.warn("quick:", e);
    return { ok: false, message: errorMessage(e) };
  }
}
