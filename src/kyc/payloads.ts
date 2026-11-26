/** Turns Zohal inquiry results into Dynamics field payloads. */
import { CONTACT_BIRTHDATE_FIELD, CONTACT_FATHERNAME_FIELD, CONTACT_NATIONAL_FIELD, DEFAULTS } from "../shared/config";
import { pad } from "../shared/text";
import { getConfig, zohal } from "./background-client";
import { compact, type Payload } from "./helpers";
import { parseJalali } from "../shared/jalali";

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

export async function personPayload(code: string, birthRaw: string): Promise<Payload> {
  const cfg = await getConfig();
  const b = parseJalali(birthRaw);
  if (!b) throw new Error("تاریخ تولد معتبر نیست (مثال: 1377/06/30).");

  const jalali = `${b.jy}/${pad(b.jm)}/${pad(b.jd)}`;
  const p = await zohal("national_identity_inquiry", { national_code: code, birth_date: jalali, gender: true });
  if (!p.matched) throw new Error("کد ملی و تاریخ تولد با هم مطابقت ندارند.");

  // Zohal gender mapping (verified): 1 = Male (man), 0 = Female (woman).
  // Never guess when the provider returns an unknown or missing value
  // (null/""/undefined must NOT be coerced to 0 = Female).
  // Dynamics option-set values are configurable in the extension settings.
  const optionValue = (v: string | undefined, fallback: string): string => (/^\d+$/.test(String(v).trim()) ? String(v).trim() : fallback);
  const raw = p.gender;
  const rawStr = raw === null || raw === undefined ? "" : String(raw).trim().toLowerCase();
  let title: string;
  if (rawStr === "1" || rawStr === "true" || rawStr === "male") title = optionValue(cfg.titleMale, DEFAULTS.titleMale);
  else if (rawStr === "0" || rawStr === "false" || rawStr === "female") title = optionValue(cfg.titleFemale, DEFAULTS.titleFemale);
  else throw new Error(`جنسیت نامعتبر یا نامشخص از زحل دریافت شد (${String(raw)}). عنوان مخاطب را بررسی کنید.`);

  return compact({
    [titleFieldName(cfg.titleField)]: title,
    firstname: p.first_name,
    lastname: p.last_name,
    [CONTACT_FATHERNAME_FIELD]: p.father_name,
    [CONTACT_NATIONAL_FIELD]: code,
    [CONTACT_BIRTHDATE_FIELD]: jalali,
  });
}

/** The configured title field, or the default when it is empty / not a valid logical name. */
export const titleFieldName = (configured: string | undefined): string =>
  configured && /^[a-z_0-9]+$/i.test(configured) ? configured : DEFAULTS.titleField;

export async function companyPayload(code: string, field: string): Promise<Payload> {
  const c = await zohal("company_inquiry", { national_id: code });
  if (!c.name) throw new Error("نام شرکت در پاسخ زحل وجود ندارد.");

  const notes: Array<[string, unknown]> = [
    ["نوع شرکت", c.company_type],
    ["شماره ثبت", c.register_number],
    ["تاریخ ثبت", c.register_date],
    ["تاریخ پایان فعالیت", c.activity_end_date],
  ];
  return compact({
    name: c.name,
    [field]: code,
    address1_line1: str(c.address)?.slice(0, 250),
    address1_postalcode: c.postal_code,
    telephone1: c.phone_number,
    fax: c.fax_number,
    emailaddress1: c.email_address,
    description: notes.filter(([, v]) => v).map(([k, v]) => `${k}: ${String(v)}`).join("\n"),
  });
}
