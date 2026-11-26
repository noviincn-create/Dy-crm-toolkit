/** Thin typed client for the background service worker (Zohal inquiry + SMS OTP). */
import type { KycSettings } from "../shared/config";
import type { BgError, BgRequest, BgResponseMap, ZohalEndpoint } from "../shared/messages";
import { errorMessage } from "../shared/text";
import { clean } from "./helpers";

export async function send<T extends BgRequest["type"]>(message: Extract<BgRequest, { type: T }>): Promise<BgResponseMap[T]> {
  // This file must run as an extension content script in the ISOLATED world.
  // A missing runtime usually means the script was injected into the page MAIN world,
  // or the extension context was invalidated by an update/reload.
  if (typeof chrome === "undefined" || !chrome.runtime || typeof chrome.runtime.sendMessage !== "function") {
    throw new Error("ارتباط افزونه با Background برقرار نیست. افزونه را در chrome://extensions بررسی و Reload کنید؛ سپس صفحه Dynamics را کامل Refresh کنید.");
  }
  try {
    const res = (await chrome.runtime.sendMessage(message)) as BgResponseMap[T] | BgError;
    if (res && typeof res === "object" && "error" in res && typeof res.error === "string") throw new Error(res.error);
    return res as BgResponseMap[T];
  } catch (e) {
    if (errorMessage(e).includes("Extension context invalidated")) {
      throw new Error("زمینه اجرای افزونه پس از به‌روزرسانی نامعتبر شده است؛ صفحه Dynamics را کامل Refresh کنید.");
    }
    throw e;
  }
}

/** Reads extension settings in the service worker, not from the CRM page context. */
export async function getConfig(): Promise<KycSettings> {
  const res = await send<"getConfig">({ type: "getConfig" });
  return res?.config ?? ({} as KycSettings);
}

export type ZohalData = Record<string, unknown>;

export async function zohal(endpoint: ZohalEndpoint, body: Record<string, unknown>): Promise<ZohalData> {
  const { json, status } = await send<"zohal">({ type: "zohal", endpoint, body });
  if (json?.result !== 1) throw new Error(json?.response_body?.message || `خطا در استعلام زحل (${status})`);
  return Object.fromEntries(Object.entries(json.response_body?.data ?? {}).map(([k, v]) => [k, clean(v)]));
}
