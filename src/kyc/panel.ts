/** The KYC block: national code → birth date + mobile → SMS OTP → fill / update the contact. */
import {
  CONTACT_BIRTHDATE_FIELD, CONTACT_FATHERNAME_FIELD, CONTACT_NATIONAL_FIELD, OTP_LENGTH,
} from "../shared/config";
import { errorMessage, toLatinDigits } from "../shared/text";
import { getConfig, send } from "./background-client";
import {
  assertNameFree, contactUrl, DuplicateError, findByCode, findMobileOwner, findNewContact, syncContactFields, updateContact,
  type ContactRow, type KindInfo,
} from "./dynamics";
import { fillForm, saveAndClose, toast, TITLE_KEY } from "./form";
import { digits, parseMobile, validNationalCode, type Payload } from "./helpers";
import { panelHtml } from "./panel-template";
import { companyPayload, personPayload, titleFieldName } from "./payloads";

export type Kind = "person" | "company";
type Step = "check" | "details" | "otp";
type Tone = "" | "err" | "ok";

const KINDS: Record<Kind, KindInfo> = {
  person: { etn: "contact", set: "contacts", idAttr: "contactid", nameAttr: "fullname", label: "کد ملی", title: "احراز هویت مخاطب حقیقی", length: 10 },
  company: { etn: "account", set: "accounts", idAttr: "accountid", nameAttr: "name", label: "شناسه ملی", title: "احراز هویت شرکت (حقوقی)", length: 11 },
};

const GO_LABEL: Record<Step, string> = { check: "بررسی", details: "احراز هویت و ارسال کد", otp: "تایید و ایجاد" };
const MSG_ICON: Record<"err" | "ok", string> = {
  err: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m1 15h-2v-2h2zm0-4h-2V7h2z"/></svg>',
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z"/></svg>',
};
const RESEND_LABEL = "ارسال مجدد کد";
const INPUT_IDS = ["code", "birth", "mobile", "otp"] as const;
const API_ONLY_FIELDS: ReadonlySet<string> = new Set([CONTACT_NATIONAL_FIELD, CONTACT_BIRTHDATE_FIELD, CONTACT_FATHERNAME_FIELD]);

interface ExistingContact { id: string; name?: string; row: ContactRow }

/** What must be done after the new contact has been saved (national code / birth date sync + welcome SMS). */
interface AfterCreate {
  code: string;
  mobile: string;
  names: { firstname?: string; lastname?: string };
  wanted: Payload;
}

/** Waits until the contact really exists, then (1) makes sure national code / birth date are saved, (2) sends the welcome SMS once. */
async function afterCreate({ code, mobile, names, wanted }: AfterCreate, tries: number, everyMs: number): Promise<void> {
  const sinceIso = new Date(Date.now() - 15 * 60_000).toISOString();
  let row: ContactRow | null = null;
  for (let i = 0; i < tries && !row; i++) {
    await new Promise((r) => setTimeout(r, everyMs));
    try { row = await findNewContact(code, mobile, sinceIso, Object.keys(wanted)); } catch (e) { console.warn("KYC find contact:", e); }
  }
  if (!row) return toast("مخاطب پس از ذخیره پیدا نشد؛ کد ملی و تاریخ تولد ثبت نشد.", "err");

  try {
    const written = await syncContactFields(row, wanted);
    if (written.length) toast(`ثبت شد از طریق API: ${written.join("، ")}`);
  } catch (e) {
    toast(`ثبت کد ملی/تاریخ تولد روی مخاطب ناموفق بود: ${errorMessage(e)}`, "err");
    console.error("KYC sync fields:", e);
  }

  try {
    await send<"welcome">({ type: "welcome", mobile, firstname: names.firstname ?? "", lastname: names.lastname ?? "" });
    toast("پیامک خوش‌آمدگویی ارسال شد.");
  } catch (e) {
    toast(`ارسال پیامک خوش‌آمدگویی ناموفق بود: ${errorMessage(e)}`, "err");
  }
}

export class KycPanel {
  readonly host: HTMLDivElement = Object.assign(document.createElement("div"), { id: "kyc-root" });
  private readonly shadow: ShadowRoot = this.host.attachShadow({ mode: "open" });

  private kind: Kind = "person";
  private step: Step = "check"; // check → details (birth date + mobile) → otp
  private pending: Payload | null = null; // Zohal-verified contact payload
  private pendingKey = ""; // code|birth the payload was verified for
  private otpMobile = ""; // mobile the OTP was sent to
  private existing: ExistingContact | null = null; // contact found by mobile → update flow
  private cooldownLeft = 0;
  private cooldownTimer = 0;

  constructor() {
    this.shadow.innerHTML = panelHtml(OTP_LENGTH);
    this.wire();
  }

  // ───────────── tiny DOM helpers ─────────────
  private $<T extends HTMLElement = HTMLElement>(id: string): T {
    const el = this.shadow.getElementById(id);
    if (!el) throw new Error(`KYC panel element #${id} is missing`);
    return el as T;
  }
  private input = (id: string): HTMLInputElement => this.$<HTMLInputElement>(id);
  private invalid(id: string, on = true): void {
    this.$(id).setAttribute("aria-invalid", on ? "true" : "false");
  }
  private say(text: string, type: Tone = ""): void {
    const m = this.$("msg");
    m.className = type;
    m.textContent = "";
    if (!text) return;
    if (type) m.insertAdjacentHTML("afterbegin", MSG_ICON[type]);
    m.append(Object.assign(document.createElement("span"), { textContent: text }));
  }

  // resend button: the background worker enforces a 60 s cooldown, so show it instead of failing on click
  private paintResend(): void {
    const btn = this.$<HTMLButtonElement>("resend");
    btn.textContent = this.cooldownLeft > 0 ? `${RESEND_LABEL} (${this.cooldownLeft} ثانیه)` : RESEND_LABEL;
    btn.disabled = this.cooldownLeft > 0 || this.$("go").classList.contains("loading");
  }
  private startCooldown(sec = 60): void {
    clearInterval(this.cooldownTimer);
    this.cooldownLeft = sec;
    this.paintResend();
    this.cooldownTimer = window.setInterval(() => {
      this.cooldownLeft = Math.max(0, this.cooldownLeft - 1);
      if (!this.cooldownLeft) clearInterval(this.cooldownTimer);
      this.paintResend();
    }, 1000);
  }
  private busy(on: boolean): void {
    const go = this.$<HTMLButtonElement>("go");
    go.disabled = on;
    go.classList.toggle("loading", on);
    this.paintResend();
  }

  private go(next: Step): void {
    this.step = next;
    this.$("birthRow").hidden = this.$("mobileRow").hidden = next === "check";
    this.$("steps").hidden = this.kind === "company";
    this.$("otpRow").hidden = this.$("resend").hidden = next !== "otp";
    this.$("go").textContent = GO_LABEL[next];
    const order: Step[] = ["check", "details", "otp"];
    this.shadow.querySelectorAll<HTMLElement>("#steps li").forEach((li) => {
      const i = order.indexOf(li.dataset.s as Step);
      li.className = i < order.indexOf(next) ? "done" : i === order.indexOf(next) ? "on" : "";
    });
  }

  /** Called by the mounter when the panel is placed into a Quick Create form of the given entity. */
  setKind(next: Kind): void {
    this.kind = next;
    this.$("title").textContent = KINDS[next].title;
    this.$("codeLabel").textContent = KINDS[next].label;
    for (const id of INPUT_IDS) { this.input(id).value = ""; this.invalid(id, false); }
    this.existing = null;
    clearInterval(this.cooldownTimer);
    this.cooldownLeft = 0;
    this.paintResend();
    this.pending = null;
    this.pendingKey = "";
    this.go("check");
    this.say("");
  }

  // ───────────── flow ─────────────
  private async finish(payload: Payload, after?: AfterCreate): Promise<void> {
    const missing = fillForm(payload).filter((m) => !(after && API_ONLY_FIELDS.has(m))); // API covers these fields
    const { autoSave } = await getConfig();
    const watch = (): void => {
      if (!after) return;
      // auto save: contact appears within seconds; manual save: wait up to 2 minutes
      afterCreate(after, autoSave ? 15 : 60, autoSave ? 1500 : 2000).catch((e) => console.warn("KYC after create:", e));
    };
    if (autoSave && !missing.length) {
      await new Promise((r) => setTimeout(r, 500)); // let Dynamics commit the field values
      if (saveAndClose()) { watch(); return this.say("مخاطب ایجاد شد.", "ok"); }
    }
    watch();
    this.go("check");
    for (const id of ["birth", "mobile", "otp"]) this.input(id).value = "";
    if (missing.length === Object.keys(payload).length) return this.say("فیلدهای فرم Quick Create پیدا نشد.", "err");
    this.say(
      missing.length
        ? `فرم پر شد؛ Save را بزنید. این فیلدها در فرم Quick Create نیستند و ذخیره نمی‌شوند: ${missing.map((m) => (m === TITLE_KEY ? "title" : m)).join("، ")}`
        : "فرم پر شد؛ بقیه فیلدها را کامل کنید و Save بزنید. کد ملی و تاریخ تولد پس از ذخیره ثبت می‌شوند.",
      "ok",
    );
  }

  private async check(k: KindInfo, field: string, code: string): Promise<void> {
    this.say("در حال جستجو در داینامیکس…");
    const found = await findByCode(k, field, code);
    if (found) return this.say(`این ${this.kind === "person" ? "مخاطب" : "شرکت"} از قبل وجود دارد: ${found.name ?? ""}`, "ok");
    if (this.kind === "company") {
      this.say("در حال استعلام از زحل…");
      return await this.finish(await companyPayload(code, field));
    }
    this.go("details");
    this.input("birth").focus();
    this.say("مخاطبی با این کد ملی یافت نشد. تاریخ تولد و شماره موبایل را وارد کنید.");
  }

  /** Shows the duplicate contact with a link that opens it in a new tab (this page is not navigated). */
  private sayDuplicate(e: DuplicateError): void {
    const r = e.dup;
    const national = r[CONTACT_NATIONAL_FIELD];
    this.say(`${e.message} ${r.fullname ?? ""}${r.mobilephone ? ` • ${r.mobilephone}` : ""}${national ? ` • کد ملی ${String(national)}` : ""}`, "err");
    const a = Object.assign(document.createElement("a"), { href: contactUrl(r.contactid), target: "_blank", rel: "noopener", textContent: " باز کردن مخاطب" });
    a.style.cssText = "color:inherit;font-weight:700;text-decoration:underline;white-space:nowrap";
    this.$("msg").lastElementChild?.append(a);
  }

  private async sendOtp(code: string, birthRaw: string): Promise<void> {
    const mobile = parseMobile(this.input("mobile").value);
    if (!mobile) throw new Error("شماره موبایل معتبر نیست (مثال: 09121234567).");

    this.say("در حال بررسی موبایل در داینامیکس…");
    const owner = await findMobileOwner(mobile);
    this.existing = null;
    if (owner) {
      // The mobile already belongs to a contact: it is updated after OTP + Zohal instead of creating a duplicate,
      // unless that contact already has a DIFFERENT national code (then it is another person).
      const saved = owner[CONTACT_NATIONAL_FIELD];
      if (saved && String(saved) !== code) throw new DuplicateError("این موبایل متعلق به مخاطبی با کد ملی دیگری است.", owner, "mobile");
      this.existing = { id: owner.contactid, name: owner.fullname, row: owner };
    }

    const key = `${code}|${digits(birthRaw)}`;
    if (this.pendingKey !== key || !this.pending) { // don't pay for Zohal twice if only the SMS failed
      this.say("در حال استعلام از زحل…");
      this.pending = await personPayload(code, birthRaw);
      this.pendingKey = key;
    }

    if (!this.existing) await assertNameFree(this.pending.firstname, this.pending.lastname);

    this.say("در حال ارسال کد تایید…");
    await send<"otpSend">({ type: "otpSend", mobile });
    this.otpMobile = mobile;
    this.startCooldown();
    this.go("otp");
    this.input("otp").focus();
    if (this.existing) {
      this.$("go").textContent = "تایید و بروزرسانی مخاطب";
      this.say(`کد تایید به 0${mobile} ارسال شد. این موبایل متعلق به «${this.existing.name ?? ""}» است؛ پس از تایید، نام، کد ملی و تاریخ تولد او بروزرسانی می‌شود.`, "ok");
    } else this.say(`کد تایید به 0${mobile} ارسال شد.`, "ok");
  }

  private async verifyAndFill(nationalCode: string): Promise<void> {
    const code = digits(this.input("otp").value);
    if (code.length !== OTP_LENGTH) throw new Error(`کد تایید ${OTP_LENGTH} رقمی را وارد کنید.`);

    this.say("در حال بررسی کد…");
    await send<"otpVerify">({ type: "otpVerify", mobile: this.otpMobile, code });
    const pending = this.pending;
    if (!pending) throw new Error("اطلاعات احراز هویت موجود نیست؛ دوباره از ابتدا شروع کنید.");
    if (this.existing) return this.updateExistingContact(pending);

    const wanted: Payload = {};
    for (const [field, value] of [
      [CONTACT_NATIONAL_FIELD, nationalCode],
      [CONTACT_BIRTHDATE_FIELD, pending[CONTACT_BIRTHDATE_FIELD]],
      [CONTACT_FATHERNAME_FIELD, pending[CONTACT_FATHERNAME_FIELD]],
    ] as const) if (value) wanted[field] = value;

    await this.finish(
      { ...pending, mobilephone: `0${this.otpMobile}` },
      { code: nationalCode, mobile: this.otpMobile, names: { firstname: pending.firstname, lastname: pending.lastname }, wanted },
    );
  }

  /**
   * Existing contact (found by mobile): after the OTP is confirmed, write the Zohal-verified data onto that record
   * through the Web API (no form, no welcome SMS).
   */
  private async updateExistingContact(payload: Payload): Promise<void> {
    const existing = this.existing!;
    const cfg = await getConfig();
    const titleKey = titleFieldName(cfg.titleField);
    const patch: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(payload)) patch[k] = k === titleKey && /^\d+$/.test(v) ? Number(v) : v;
    // national code, Jalali birth date and father name that are already filled on the contact are kept as they are
    for (const f of [CONTACT_NATIONAL_FIELD, CONTACT_BIRTHDATE_FIELD, CONTACT_FATHERNAME_FIELD]) {
      if (String(existing.row[f] ?? "").trim()) delete patch[f];
    }
    this.say("در حال بروزرسانی مخاطب…");
    await updateContact(existing.id, patch);
    const name = [patch.firstname, patch.lastname].filter(Boolean).join(" ") || existing.name || "";
    toast(`مخاطب بروزرسانی شد: ${name}`);
    this.existing = null;
    for (const id of INPUT_IDS) this.input(id).value = "";
    this.go("check");
    this.say(`مخاطب «${name}» با اطلاعات زحل (نام، کد ملی، تاریخ تولد، …) بروزرسانی شد.`, "ok");
  }

  private async submit(): Promise<void> {
    if (this.$<HTMLButtonElement>("go").disabled) return;
    const k = KINDS[this.kind];
    const code = digits(this.input("code").value);
    if (code.length !== k.length || (this.kind === "person" && !validNationalCode(code))) {
      this.invalid("code");
      this.input("code").focus();
      return this.say(`${k.label} معتبر نیست.`, "err");
    }

    this.busy(true);
    try {
      const cfg = await getConfig();
      // Contact National ID is fixed to the verified CRM logical name;
      // old saved extension settings must not redirect Contact lookups.
      const field = this.kind === "person" ? CONTACT_NATIONAL_FIELD : cfg.accountNationalField;
      if (this.step === "check") await this.check(k, field, code);
      else if (this.step === "details") await this.sendOtp(code, this.input("birth").value);
      else await this.verifyAndFill(code);
    } catch (e) {
      if (e instanceof DuplicateError) {
        this.sayDuplicate(e);
        this.invalid(e.dupField === "mobile" ? "mobile" : "code");
      } else {
        const msg = errorMessage(e);
        this.say(msg, "err");
        if (/موبایل/.test(msg)) this.invalid("mobile");
        else if (/تاریخ تولد/.test(msg)) this.invalid("birth");
        else if (/کد تایید/.test(msg) && this.step === "otp") this.invalid("otp");
      }
    } finally {
      this.busy(false);
    }
  }

  // ───────────── events ─────────────
  private wire(): void {
    this.$("go").onclick = () => void this.submit();
    this.$("resend").onclick = async () => {
      this.busy(true);
      try {
        await send<"otpSend">({ type: "otpSend", mobile: this.otpMobile });
        this.startCooldown();
        this.say("کد جدید ارسال شد.", "ok");
      } catch (e) {
        this.say(errorMessage(e), "err");
      } finally {
        this.busy(false);
      }
    };

    // Persian/Arabic digits are converted as you type, and the red "invalid" outline clears on edit
    for (const id of INPUT_IDS) {
      this.input(id).addEventListener("input", () => {
        const el = this.input(id);
        if (/[۰-۹٠-٩]/.test(el.value)) el.value = toLatinDigits(el.value);
        this.invalid(id, false);
      });
    }
    // editing earlier fields sends the user back to the matching step
    this.input("code").addEventListener("input", () => { this.go("check"); this.say(""); });
    for (const id of ["birth", "mobile"]) {
      this.input(id).addEventListener("input", () => { if (this.step === "otp") { this.go("details"); this.say(""); } });
    }

    for (const type of ["keydown", "keyup", "keypress"] as const) {
      // keep typing away from Dynamics hotkeys / the panel's own handlers
      this.shadow.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type === "keydown" && (e as KeyboardEvent).key === "Enter") void this.submit();
      });
    }
  }
}
