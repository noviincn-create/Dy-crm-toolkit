/** Small text / digit helpers shared by every part of the toolkit. */

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits → ASCII 0-9. Both blocks end in the same low nibble. */
export const toLatinDigits = (s: unknown): string =>
  String(s ?? "").replace(/[۰-۹٠-٩]/g, (d) => String(d.charCodeAt(0) & 15));

/** ASCII digits → Persian digits. */
export const toFaDigits = (s: unknown): string =>
  String(s ?? "").replace(/[0-9]/g, (d) => FA_DIGITS.charAt(Number(d)));

/** Locale-formatted number with Persian digits (falls back to plain `String`). */
export const faNum = (n: number): string => {
  try {
    return Number(n).toLocaleString("fa-IR");
  } catch {
    return String(n);
  }
};

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"]/g, (c) => HTML_ESCAPES[c] ?? c);

export const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
