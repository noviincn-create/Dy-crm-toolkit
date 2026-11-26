/** Dynamics Web API access for the KYC panel (isolated world: same-origin fetch with the user's session cookie). */
import { CONTACT_BIRTHDATE_FIELD, CONTACT_FATHERNAME_FIELD, CONTACT_NATIONAL_FIELD } from "../shared/config";
import { arabic, oq } from "./helpers";

const orgPath = location.pathname.replace(/\/main\.aspx.*$/i, "");
export const orgBase = `${location.origin}${orgPath}`;
const api = `${orgBase}/api/data/v9.1`;

const jsonHeaders: Record<string, string> = {
  Accept: "application/json",
  "Content-Type": "application/json; charset=utf-8",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
};

export interface KindInfo {
  etn: "contact" | "account";
  set: "contacts" | "accounts";
  idAttr: "contactid" | "accountid";
  nameAttr: "fullname" | "name";
  label: string;
  title: string;
  length: number;
}

export interface ContactRow {
  contactid: string;
  fullname?: string;
  mobilephone?: string;
  [field: string]: unknown;
}

export class DuplicateError extends Error {
  constructor(message: string, readonly dup: ContactRow, readonly dupField: "code" | "mobile") {
    super(message);
    this.name = "DuplicateError";
  }
}

async function apiError(res: Response): Promise<Error> {
  const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return new Error(err?.error?.message || `خطای داینامیکس (${res.status})`);
}

async function getList<T>(url: string): Promise<T[]> {
  const res = await fetch(url, { credentials: "include", headers: jsonHeaders });
  if (!res.ok) throw await apiError(res);
  return ((await res.json()) as { value: T[] }).value;
}

async function patchContact(id: string, patch: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${api}/contacts(${id})`, {
    method: "PATCH", credentials: "include", headers: { ...jsonHeaders, "If-Match": "*" }, body: JSON.stringify(patch),
  });
  if (!res.ok) throw await apiError(res);
}

/** Looks a contact/account up by national code / company ID. */
export async function findByCode(k: KindInfo, field: string, code: string): Promise<{ id: string; name?: string } | undefined> {
  const rows = await getList<Record<string, string>>(`${api}/${k.set}?$select=${k.idAttr},${k.nameAttr}&$filter=${field} eq '${code}'&$top=1`);
  const row = rows[0];
  return row && { id: row[k.idAttr]!, name: row[k.nameAttr] };
}

export const contactUrl = (id: string): string => `${orgBase}/main.aspx?etn=contact&pagetype=entityrecord&id=${id}`;

// ───────────── Post-save sync (national code + birth date go through the Web API, not the form) ─────────────
// The Quick Create form is only a convenience: the national code input may be missing from it and the birth-date
// control parses locale-formatted text, so a value typed in as 2002-09-21 is silently dropped.
// After the contact is saved we find it and PATCH any of these fields that did not land.

/** Finds the contact that was just created: by national code if it was saved, otherwise by mobile + recent createdon. */
export async function findNewContact(code: string, mobile: string, sinceIso: string, selectFields: string[]): Promise<ContactRow | null> {
  const sel = ["contactid", ...selectFields].join(",");
  const get = async (filter: string, order = ""): Promise<ContactRow | null> =>
    (await getList<ContactRow>(`${api}/contacts?$select=${sel}&$filter=${encodeURIComponent(filter)}${order}&$top=1`))[0] ?? null;
  return (
    (await get(`${CONTACT_NATIONAL_FIELD} eq '${code}'`)) ||
    (await get(`mobilephone eq '0${mobile}' and createdon ge ${sinceIso}`, "&$orderby=createdon desc"))
  );
}

/** Writes the wanted fields that differ; returns the names of the fields that had to be written through the API. */
export async function syncContactFields(row: ContactRow, wanted: Record<string, string>): Promise<string[]> {
  const patch: Record<string, string> = {};
  for (const [attr, value] of Object.entries(wanted)) {
    if (String(row[attr] ?? "") !== String(value)) patch[attr] = value;
  }
  if (!Object.keys(patch).length) return [];
  await patchContact(row.contactid, patch);
  return Object.keys(patch);
}

/** Updates an existing contact with Zohal-verified data (no form, no welcome SMS). */
export const updateContact = patchContact;

// ───────────── Duplicate guards (run BEFORE any SMS is sent / contact is created) ─────────────
const DUP_SELECT = ["contactid", "fullname", "mobilephone", CONTACT_NATIONAL_FIELD, CONTACT_BIRTHDATE_FIELD, CONTACT_FATHERNAME_FIELD].join(",");

async function queryContact(filter: string): Promise<ContactRow | null> {
  return (await getList<ContactRow>(`${api}/contacts?$select=${DUP_SELECT}&$filter=${encodeURIComponent(filter)}&$top=1`))[0] ?? null;
}

/** The mobile may be stored as 0912…, 912…, +98912… or 98912…. */
export function findMobileOwner(mobile: string): Promise<ContactRow | null> {
  const forms = [`0${mobile}`, mobile, `+98${mobile}`, `98${mobile}`];
  return queryContact(forms.map((m) => `mobilephone eq '${m}'`).join(" or "));
}

/** First name AND last name must match together (never each one alone). Throws a DuplicateError on a match. */
export async function assertNameFree(first?: string, last?: string): Promise<void> {
  if (!first || !last) return;
  const pair = (f: string, l: string): string => `(firstname eq '${oq(f)}' and lastname eq '${oq(l)}')`;
  const row = await queryContact(`${pair(first, last)} or ${pair(arabic(first), arabic(last))}`);
  if (row) throw new DuplicateError("مخاطبی با همین نام و نام خانوادگی قبلاً ثبت شده است.", row, "code");
}
