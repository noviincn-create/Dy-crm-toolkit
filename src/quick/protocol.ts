/** Typed contract between the quick-session content script (any website) and the service worker (BgRequest { type: "quick" }). */
import type { SessionState } from "../session-manager/types";

export interface QuickProduct {
  id: string;
  name: string;
  num: string;
  /** List price of the product. */
  price: number | null;
  uom: string | null;
  uomName: string;
}

export interface QuickPriceLevel {
  id: string;
  name: string;
}

export interface QuickLiveSession {
  /** Session Manager id. */
  id: string;
  oppId: string;
  name: string;
  number: string | null;
  state: SessionState;
  startedAt: number | null;
  activeMs: number;
}

export type QuickOp = "bootstrap" | "prices" | "start" | "sessions" | "end" | "setUrl" | "open";

export interface QuickPayloads {
  bootstrap: { refresh?: boolean };
  prices: { priceLevelId: string };
  start: { name: string; priceLevelId: string | null; items: Array<{ productId: string; qty: number }>; openForm: boolean };
  sessions: unknown;
  end: { sessionId: string };
  setUrl: { url: string };
  open: { oppId: string };
}

export interface QuickResults {
  bootstrap: { crmUrl: string; priceLevels: QuickPriceLevel[]; mainPriceLevelId: string | null; products: QuickProduct[]; productsAt: number; productsError?: string };
  /** `productId|uomId` and `productId` → amount in that price list. */
  prices: Record<string, number>;
  start: {
    oppId: string; number: string | null; numberError?: string; sessionId: string | null; sessionError?: string;
    added: number; lineErrors: Array<{ name: string; message: string }>;
  };
  sessions: { sessions: QuickLiveSession[] };
  end: { minutes: number; productName: string; already: boolean; skippedPrint: boolean };
  setUrl: { crmUrl: string };
  open: Record<string, never>;
}

export type QuickRequest = { [K in QuickOp]: { op: K } & QuickPayloads[K] }[QuickOp];
export type QuickResponse<K extends QuickOp = QuickOp> = { ok: true; data: QuickResults[K] } | { ok: false; message: string };

export const GUID_RE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const OPS: readonly string[] = ["bootstrap", "prices", "start", "sessions", "end", "setUrl", "open"];

const bad = (m: string): never => { throw new Error("درخواست نامعتبر: " + m); };
const guid = (v: unknown, k: string): string => {
  const s = typeof v === "string" ? v.replace(/[{}]/g, "").toLowerCase() : "";
  return GUID_RE.test(s) ? s : bad(k);
};

/** Strict validation of an untrusted message (throws). */
export function parseQuickRequest(raw: unknown): QuickRequest {
  if (!raw || typeof raw !== "object") return bad("envelope");
  const r = raw as Record<string, unknown>;
  const op = r.op;
  if (typeof op !== "string" || !OPS.includes(op)) return bad("op");
  switch (op as QuickOp) {
    case "bootstrap": return { op: "bootstrap", refresh: r.refresh === true };
    case "prices": return { op: "prices", priceLevelId: guid(r.priceLevelId, "priceLevelId") };
    case "sessions": return { op: "sessions" };
    case "end": {
      if (typeof r.sessionId !== "string" || !r.sessionId || r.sessionId.length > 80) return bad("sessionId");
      return { op: "end", sessionId: r.sessionId };
    }
    case "setUrl": return { op: "setUrl", url: typeof r.url === "string" ? r.url.slice(0, 300) : "" };
    case "open": return { op: "open", oppId: guid(r.oppId, "oppId") };
    case "start": {
      const name = typeof r.name === "string" ? r.name.trim() : "";
      if (!name || name.length > 200) return bad("name");
      const items = Array.isArray(r.items) ? r.items : bad("items");
      if ((items as unknown[]).length > 100) return bad("items");
      return {
        op: "start", name,
        priceLevelId: r.priceLevelId == null ? null : guid(r.priceLevelId, "priceLevelId"),
        openForm: r.openForm === true,
        items: (items as unknown[]).map((it) => {
          const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
          const qty = Number(o.qty);
          if (!Number.isFinite(qty) || qty <= 0 || qty > 100000) return bad("qty");
          return { productId: guid(o.productId, "productId"), qty };
        }),
      };
    }
  }
}
