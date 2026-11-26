/**
 * Service worker. External calls live here (not in the page) so API keys never reach Dynamics and CORS doesn't apply.
 */
import {
  CONTACT_NATIONAL_FIELD, DEFAULTS, IPPANEL_URL, OTP_LENGTH, OTP_PARAM_NAME, OTP_PATTERN, SENDER_NUMBER, WELCOME_PATTERN, ZOHAL_URL,
  type KycSettings, type SecretSettings,
} from "../shared/config";
import type { BgError, BgRequest, BgRequestType, BgResponseMap, ZohalEndpoint, ZohalResponse } from "../shared/messages";
import { errorMessage } from "../shared/text";
import { handleSmMessage, installSessionManager } from "../session-manager/service";
import { handleQuick, installQuickTransport } from "./quick";
import { installReportOmnibox } from "./report";

const OTP_TTL = 2 * 60_000;
const OTP_COOLDOWN = 60_000;
const OTP_MAX_TRIES = 3;
const ZOHAL_ENDPOINTS: ReadonlySet<string> = new Set<ZohalEndpoint>(["national_identity_inquiry", "company_inquiry"]);

interface PendingOtp {
  mobile: string;
  hash: string;
  expires: number;
  tries: number;
}

const sha256 = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

async function post<T>(url: string, headers: Record<string, string>, body: unknown, failure: string): Promise<{ status: number; json: T | null }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json().catch(() => null)) as T | null };
  } catch (e) {
    throw new Error(`${failure}: ${errorMessage(e)}`);
  }
}

interface IppanelResponse {
  meta?: { status?: boolean; message?: string };
}

/** One IPPanel pattern message. mobile = 10 digits without the leading 0. */
async function sendPattern(apiKey: string, pattern: string, mobile: string, params: Record<string, string>, label: string): Promise<void> {
  const { status, json } = await post<IppanelResponse>(
    IPPANEL_URL,
    { Authorization: apiKey },
    { sending_type: "pattern", from_number: SENDER_NUMBER, code: pattern, recipients: [`+98${mobile}`], params },
    "اتصال به IPPanel ناموفق بود",
  );
  if (json?.meta?.status !== true) throw new Error(`[${label} • ${pattern}] ${json?.meta?.message || `خطای IPPanel (${status})`}`);
}

const isMobile = (m: string): boolean => /^9\d{9}$/.test(m);

type Handlers = { [K in BgRequestType]: (msg: Extract<BgRequest, { type: K }>) => Promise<BgResponseMap[K]> };

const handlers: Handlers = {
  async getConfig() {
    const config = await chrome.storage.local.get<KycSettings>(DEFAULTS as unknown as Record<string, unknown>) as KycSettings;
    // Migrate stale saved Contact field names from older extension versions.
    config.contactNationalField = CONTACT_NATIONAL_FIELD;
    await chrome.storage.local.set({ contactNationalField: CONTACT_NATIONAL_FIELD });
    return { config };
  },

  async zohal({ endpoint, body }) {
    if (!ZOHAL_ENDPOINTS.has(endpoint)) throw new Error("endpoint نامعتبر است.");
    const { token } = await chrome.storage.local.get<Pick<SecretSettings, "token">>({ token: "" });
    if (!token) throw new Error("توکن زحل در تنظیمات افزونه وارد نشده است.");
    return post<ZohalResponse>(`${ZOHAL_URL}/${endpoint}`, { Authorization: `Bearer ${token}` }, body, "اتصال به زحل ناموفق بود");
  },

  // mobile = 10 digits without the leading 0, e.g. 9121234567
  async otpSend({ mobile }) {
    if (!isMobile(mobile)) throw new Error("شماره موبایل نامعتبر است.");

    const { lastSent = 0 } = await chrome.storage.session.get<{ lastSent?: number }>("lastSent");
    const wait = Math.ceil((lastSent + OTP_COOLDOWN - Date.now()) / 1000);
    if (wait > 0) throw new Error(`لطفاً ${wait} ثانیه دیگر دوباره تلاش کنید.`);

    const { ippanelApiKey } = await chrome.storage.local.get<Pick<SecretSettings, "ippanelApiKey">>({ ippanelApiKey: "" });
    if (!ippanelApiKey) throw new Error("کلید API IPPanel در تنظیمات افزونه وارد نشده است.");

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 10 ** OTP_LENGTH).padStart(OTP_LENGTH, "0");
    await sendPattern(ippanelApiKey, OTP_PATTERN, mobile, { [OTP_PARAM_NAME]: code }, "OTP");

    const now = Date.now();
    const otp: PendingOtp = { mobile, hash: await sha256(`${mobile}:${code}`), expires: now + OTP_TTL, tries: 0 };
    await chrome.storage.session.set({ lastSent: now, otp });
    return {};
  },

  // Welcome SMS after the contact was created
  async welcome({ mobile, firstname, lastname }) {
    if (!isMobile(mobile)) throw new Error("شماره موبایل نامعتبر است.");
    const { ippanelApiKey } = await chrome.storage.local.get<Pick<SecretSettings, "ippanelApiKey">>({ ippanelApiKey: "" });
    if (!ippanelApiKey) throw new Error("کلید API IPPanel وارد نشده است.");

    await sendPattern(ippanelApiKey, WELCOME_PATTERN, mobile, { FirstName: firstname || "", LastName: lastname || "" }, "Welcome");
    return {};
  },

  async otpVerify({ mobile, code }) {
    const { otp } = await chrome.storage.session.get<{ otp?: PendingOtp }>("otp");
    if (!otp || otp.mobile !== mobile) throw new Error("ابتدا کد تایید را دریافت کنید.");

    if (Date.now() > otp.expires || otp.tries >= OTP_MAX_TRIES) {
      await chrome.storage.session.remove("otp");
      throw new Error("کد منقضی شده است؛ کد جدید دریافت کنید.");
    }
    if ((await sha256(`${mobile}:${code}`)) !== otp.hash) {
      await chrome.storage.session.set({ otp: { ...otp, tries: otp.tries + 1 } });
      throw new Error("کد تایید اشتباه است.");
    }
    await chrome.storage.session.remove("otp"); // single use
    return {};
  },

  // Session Manager (pause / resume / recovery); never rejects: failures are returned as { ok: false }
  sm({ req }) {
    return handleSmMessage(req);
  },

  // Quick session (popup on any website): CRM calls are made here with the browser's CRM cookies; never rejects
  quick({ req }) {
    return handleQuick(req);
  },

  // A frame (e.g. an iframe) saw the shortcut: the popup always opens in the top frame of that tab. Handled in the listener (needs the sender).
  async quickTrigger() {
    return {};
  },
};

chrome.runtime.onMessage.addListener((msg: BgRequest | undefined, _sender, reply: (r: BgResponseMap[BgRequestType] | BgError) => void) => {
  const handler = msg && (handlers as Record<string, ((m: BgRequest) => Promise<BgResponseMap[BgRequestType]>) | undefined>)[msg.type];
  if (!handler) return;
  if (msg.type === "quickTrigger") {
    const tabId = _sender.tab?.id;
    if ((msg.which === "start" || msg.which === "end") && tabId !== undefined) {
      chrome.tabs.sendMessage(tabId, { type: "quickOpen", which: msg.which }, { frameId: 0 }).catch(() => undefined);
    }
    reply({});
    return;
  }
  handler(msg).then(reply, (e: unknown) => reply({ error: errorMessage(e) }));
  return true; // async reply
});

// Quick session: the shared Web API client talks to the CRM address with the browser's CRM cookies
installQuickTransport();

// Omnibox keyword "nv" opens the sales dashboard
installReportOmnibox();

// Session Manager: recovery on worker/browser start + periodic sweep (listeners registered synchronously, as MV3 requires)
installSessionManager();
