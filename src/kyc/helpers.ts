import { toLatinDigits } from "../shared/text";

/** Digits only, after converting Persian/Arabic digits. */
export const digits = (s: string): string => toLatinDigits(s).replace(/\D/g, "");

/** Zohal returns the string "null" for empty values and Arabic ي/ك in names/addresses. */
export const clean = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  const t = v.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " ").trim();
  return t === "" || t.toLowerCase() === "null" ? undefined : t;
};

export type Payload = Record<string, string>;

/** Cleans every value and drops the empty ones. */
export const compact = (o: Record<string, unknown>): Payload => {
  const out: Payload = {};
  for (const [k, raw] of Object.entries(o)) {
    const v = clean(raw);
    if (v != null && v !== "") out[k] = String(v);
  }
  return out;
};

/** Iranian national code checksum. */
export function validNationalCode(c: string): boolean {
  if (!/^\d{10}$/.test(c) || /^(\d)\1{9}$/.test(c)) return false;
  const r = [...c].slice(0, 9).reduce((s, d, i) => s + Number(d) * (10 - i), 0) % 11;
  return Number(c[9]) === (r < 2 ? r : 11 - r);
}

/** "09121234567" | "+98 912 123 4567" | "9121234567" → "9121234567" (null when invalid). */
export function parseMobile(raw: string): string | null {
  let d = digits(raw);
  if (d.startsWith("0098")) d = d.slice(4);
  else if (d.length === 12 && d.startsWith("98")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return /^9\d{9}$/.test(d) ? d : null;
}

/** OData string-literal escape. */
export const oq = (v: string): string => v.replace(/'/g, "''");

/** Older records may hold Arabic ي/ك. */
export const arabic = (v: string): string => v.replace(/ی/g, "ي").replace(/ک/g, "ك");
