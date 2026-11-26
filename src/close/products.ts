/** Smart, fast product search → Quick Create "محصول فرصت تجاری"; plus the "manual tax = yes" default on the product form. */
import { api, type ODataList } from "../shared/odata";
import { errorMessage, faNum } from "../shared/text";
import { clientUrl, cleanId, getFC, requireXrm } from "../shared/xrm";
import { primaryName } from "./win-dialog";
import { esc, modal, toast } from "./ui/dom";
import { ICONS } from "./ui/icons";

interface Product {
  id: string;
  name: string;
  num: string;
  price: number | null | undefined;
  uom: string | null;
  uomName: string;
  key: string;
  nameKey: string;
}

const FA = "۰۱۲۳۴۵۶۷۸۹";
const AR = "٠١٢٣٤٥٦٧٨٩";
const fmt = (n: number): string => Number(n || 0).toLocaleString("en-US");

/** Normalises Persian/Arabic letter variants, digits, ZWNJ, diacritics so "كارت" == "کارت", "۱۲۰" == "120". */
const normQ = (s: unknown): string => String(s || "").toLowerCase()
  .replace(/[يىئ]/g, "ی").replace(/ك/g, "ک").replace(/[ۀة]/g, "ه").replace(/[أإآ]/g, "ا")
  .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
  .replace(/[\u200c\u200b\u0640\u064b-\u065f]/g, "")
  .replace(/\s+/g, " ").trim();

let productCache: Product[] | null = null;
let productLoading: Promise<Product[]> | null = null;

export function loadProducts(): Promise<Product[]> {
  if (productCache) return Promise.resolve(productCache);
  if (productLoading) return productLoading;
  productLoading = (async () => {
    const hdr = {
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Accept: "application/json",
      Prefer: 'odata.maxpagesize=5000, odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
    };
    let url: string | null = clientUrl() + "/api/data/v9.1/products?$select=productid,name,productnumber,price,_defaultuomid_value&$filter=statecode eq 0&$orderby=name asc";
    const out: Product[] = [];
    while (url) {
      const res: Response = await fetch(url, { credentials: "same-origin", headers: hdr });
      if (!res.ok) throw new Error(res.status + " " + res.statusText);
      const j = (await res.json()) as ODataList<Record<string, any>>;
      for (const p of j.value || []) {
        out.push({
          id: p.productid,
          name: p.name || "",
          num: p.productnumber || "",
          price: p.price,
          uom: p._defaultuomid_value || null,
          uomName: p["_defaultuomid_value@OData.Community.Display.V1.FormattedValue"] || "",
          key: normQ(p.name + " " + (p.productnumber || "")),
          nameKey: normQ(p.name),
        });
      }
      url = j["@odata.nextLink"] || null;
    }
    productCache = out;
    return out;
  })();
  productLoading.catch(() => { productLoading = null; });
  return productLoading;
}

/** Starts loading the catalogue in the background (no-op when loaded or loading). */
export function warmProductCache(): void {
  if (!productCache && !productLoading) loadProducts().catch(() => undefined);
}

export function searchProducts(list: Product[], q: string): Product[] {
  const toks = normQ(q).split(" ").filter(Boolean);
  if (!toks.length) return list.slice(0, 40);
  const res: Array<{ p: Product; score: number }> = [];
  for (const p of list) {
    let score = 0;
    let ok = true;
    for (const t of toks) {
      const i = p.key.indexOf(t);
      if (i < 0) { ok = false; break; }
      score += i === 0 || p.key[i - 1] === " " ? 3 : 1; // word-start matches rank higher
    }
    if (!ok) continue;
    if (p.nameKey.startsWith(toks[0]!)) score += 5;
    if (p.nameKey === toks.join(" ")) score += 10;
    res.push({ p, score: score - p.nameKey.length / 1000 });
  }
  res.sort((a, b) => b.score - a.score);
  return res.slice(0, 40).map((r) => r.p);
}

export async function openProductSearch(): Promise<void> {
  const fc = getFC();
  if (!fc) return;
  const oppId = cleanId(fc.data.entity.getId());
  const oppName = primaryName(fc);

  const m = modal({ title: "افزودن محصول به فرصت", sub: oppName, icon: "box", wide: true });
  m.body.innerHTML = `
      <div class="dy-sbox">${ICONS.search}<input id="dy-ps-q" type="text" role="combobox" aria-controls="dy-plist" aria-expanded="true"
        placeholder="نام یا کد محصول؛ چند کلمه را با فاصله بنویسید..." autocomplete="off"></div>
      <div class="dy-meta"><span id="dy-ps-n"></span><span id="dy-ps-msg"></span></div>
      <div id="dy-plist" role="listbox"><div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>`;
  m.foot.innerHTML = '<span class="dy-hint"><span><kbd>↑</kbd> <kbd>↓</kbd> انتخاب</span><span><kbd>Enter</kbd> افزودن</span><span><kbd>Esc</kbd> بستن</span></span><span class="grow"></span><button type="button" class="dy-btn" id="dy-ps-cancel">بستن</button>';
  const $ = m.$;
  $("#dy-ps-cancel").onclick = m.close;
  const input = $<HTMLInputElement>("#dy-ps-q");
  setTimeout(() => input.focus(), 30);

  let items: Product[] = [];
  let sel = 0;
  const listEl = $("#dy-plist");
  const countEl = $("#dy-ps-n");
  const note = (t?: string): void => { $("#dy-ps-msg").textContent = t || ""; };

  const render = (): void => {
    if (!items.length) {
      listEl.innerHTML = '<div class="empty">محصولی پیدا نشد.<br><small>املا را بررسی کنید یا عبارت کوتاه‌تری بنویسید.</small></div>';
      countEl.textContent = "";
      return;
    }
    countEl.textContent = items.length >= 40 ? "۴۰ نتیجهٔ اول؛ برای محدودتر شدن بیشتر تایپ کنید" : faNum(items.length) + " نتیجه";
    listEl.innerHTML = items.map((p, i) =>
      `<div class="it${i === sel ? " sel" : ""}" role="option" aria-selected="${i === sel}" data-i="${i}"><span class="nm">${esc(p.name)}</span>` +
      `${p.num ? `<span class="cd">${esc(p.num)}</span>` : ""}` +
      `<span class="pr">${p.price ? fmt(p.price) : ""}</span></div>`).join("");
    listEl.querySelector(".it.sel")?.scrollIntoView({ block: "nearest" });
  };

  const update = (): void => {
    if (!productCache) return;
    items = searchProducts(productCache, input.value);
    sel = 0;
    render();
  };

  // price: price list item of the opportunity's price list first, then the product's list price
  async function resolvePrice(p: Product): Promise<number | null | undefined> {
    try {
      const o = await api("opportunities(" + oppId + ")?$select=_pricelevelid_value");
      const pl = o._pricelevelid_value;
      if (pl) {
        const r = await api<ODataList<{ amount: number | null }>>("productpricelevels?$select=amount&$top=1&$filter=_productid_value eq " + p.id +
          " and _pricelevelid_value eq " + pl + (p.uom ? " and _uomid_value eq " + p.uom : ""));
        if (r.value.length && r.value[0]!.amount != null) return r.value[0]!.amount;
      }
    } catch (e) { console.warn("price lookup:", e); }
    return p.price;
  }

  let picking = false;
  const pick = async (p: Product | undefined): Promise<void> => {
    if (!p || picking) return;
    picking = true;
    listEl.classList.add("busy");
    note("در حال دریافت قیمت...");
    const price = await resolvePrice(p);
    m.close();
    const params: Record<string, unknown> = {
      productid: p.id, productidname: p.name, productidtype: "product",
      opportunityid: oppId, opportunityidname: oppName || "", opportunityidtype: "opportunity",
      quantity: 1,
    };
    if (price != null) params.priceperunit = price;
    if (p.uom) { params.uomid = p.uom; params.uomidname = p.uomName; params.uomidtype = "uom"; }
    requireXrm().Navigation.openForm({
      entityName: "opportunityproduct",
      useQuickCreateForm: true,
      createFromEntity: { entityType: "opportunity", id: oppId, name: oppName || "" },
    }, params).then(() => {
      try { if (!fc.data.getIsDirty()) void fc.data.refresh(false); } catch { /* form gone */ }
    }, (e: unknown) => { console.warn("quick create:", e); toast("باز کردن فرم محصول ناموفق بود.", "err"); });
  };

  listEl.addEventListener("mousedown", (e) => {
    const it = (e.target as HTMLElement).closest<HTMLElement>(".it");
    if (it) { e.preventDefault(); void pick(items[Number(it.dataset.i)]); }
  });
  input.addEventListener("input", update);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
    else if (e.key === "Enter") { e.preventDefault(); void pick(items[sel]); }
  });

  try {
    await loadProducts();
    update();
  } catch (e) {
    listEl.innerHTML = '<div class="empty">بارگذاری محصولات ناموفق بود:<br>' + esc(errorMessage(e)) + "</div>";
  }
}

// ───────────── opportunity product form: "مالیات دستی" (bmsd_istaxmanualyset) → بله ─────────────
const TAX_YES = '[role="radio"][data-id^="bmsd_istaxmanualyset."][data-id$="inner-second"]';
let taxTimer = 0;

function ensureTaxYes(): void {
  try {
    document.querySelectorAll<HTMLElement>(TAX_YES).forEach((el) => {
      if (el.getAttribute("aria-checked") !== "true") el.click();
    });
  } catch { /* DOM changed under us */ }
}

/** Runs whenever the quick create panel (or any form) renders; the user can still switch it to "No" afterwards. */
export function installTaxDefault(): void {
  new MutationObserver(() => {
    clearTimeout(taxTimer);
    taxTimer = window.setTimeout(ensureTaxYes, 200);
  }).observe(document.body, { childList: true, subtree: true });
}
