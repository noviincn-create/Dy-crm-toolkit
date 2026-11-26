/** Typed message contract between the KYC content script (isolated world) and the background service worker. */
import type { KycSettings } from "./config";
import type { SmResponse } from "../session-manager/messages";
import type { QuickResponse } from "../quick/protocol";

export type ZohalEndpoint = "national_identity_inquiry" | "company_inquiry";

export type BgRequest =
  | { type: "getConfig" }
  | { type: "zohal"; endpoint: ZohalEndpoint; body: Record<string, unknown> }
  | { type: "otpSend"; mobile: string }
  | { type: "welcome"; mobile: string; firstname?: string; lastname?: string }
  | { type: "otpVerify"; mobile: string; code: string }
  /** Session Manager request (validated strictly by the service worker; see src/session-manager/messages.ts). */
  | { type: "sm"; req: unknown }
  /** Quick-session CRM operation from any website (validated strictly by the service worker; see src/quick/protocol.ts). */
  | { type: "quick"; req: unknown }
  /** A frame saw the shortcut; the worker relays it to the top frame of the same tab. */
  | { type: "quickTrigger"; which: "start" | "end" };

export type BgRequestType = BgRequest["type"];

export interface ZohalResponse {
  result?: number;
  response_body?: { message?: string; data?: Record<string, unknown> };
}

export interface BgResponseMap {
  getConfig: { config: KycSettings };
  zohal: { status: number; json: ZohalResponse | null };
  otpSend: Record<string, never>;
  welcome: Record<string, never>;
  otpVerify: Record<string, never>;
  sm: SmResponse;
  quick: QuickResponse;
  quickTrigger: Record<string, never>;
}

export type BgError = { error: string };
