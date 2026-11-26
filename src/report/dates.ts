/** Date helpers: Persian calendar and Tehran midnights (independent of the browser's time zone). */
import { isoUtc, PC, tehranMidnightUtc, tehranYmd, type GregorianDate } from "../shared/jalali";
import { pad, toFaDigits } from "../shared/text";
import type { PeriodKey } from "./types";

const toIso = (g: GregorianDate): string => `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
const fromIso = (s: string): GregorianDate => {
  const [gy, gm, gd] = s.split("-").map(Number) as [number, number, number];
  return { gy, gm, gd };
};
const jdn = (g: GregorianDate): number => PC.g2d(g.gy, g.gm, g.gd);
const addDays = (g: GregorianDate, n: number): GregorianDate => PC.d2g(jdn(g) + n);
const jalaliOf = (g: GregorianDate): { jy: number; jm: number; jd: number } => PC.d2j(jdn(g));
const jalaliStart = (jy: number, jm: number): GregorianDate => PC.d2g(PC.j2d(jy, jm, 1));

/** Today's date in Tehran as YYYY-MM-DD. */
export const todayIso = (now = new Date()): string => toIso(tehranYmd(now));

/** [start, end] (YYYY-MM-DD, inclusive) of a preset; ["", ""] = unbounded; null = custom. */
export function periodRange(period: PeriodKey, now = new Date()): [string, string] | null {
  const t = tehranYmd(now);
  const j = jalaliOf(t);
  switch (period) {
    case "today": return [toIso(t), toIso(t)];
    case "last30": return [toIso(addDays(t, -29)), toIso(t)];
    case "thisMonth": return [toIso(jalaliStart(j.jy, j.jm)), toIso(t)];
    case "lastMonth": {
      const py = j.jm === 1 ? j.jy - 1 : j.jy;
      const pm = j.jm === 1 ? 12 : j.jm - 1;
      return [toIso(jalaliStart(py, pm)), toIso(addDays(jalaliStart(j.jy, j.jm), -1))];
    }
    case "thisYear": return [toIso(jalaliStart(j.jy, 1)), toIso(t)];
    case "lastYear": return [toIso(jalaliStart(j.jy - 1, 1)), toIso(addDays(jalaliStart(j.jy, 1), -1))];
    case "all": return ["", ""];
    default: return null;
  }
}

/** The period of the same length right before [start, end]. */
export function previousRange(start: string, end: string): [string, string] | null {
  if (!start || !end) return null;
  const s = fromIso(start);
  const days = jdn(fromIso(end)) - jdn(s) + 1;
  const prevEnd = addDays(s, -1);
  return [toIso(addDays(prevEnd, -(days - 1))), toIso(prevEnd)];
}

/** OData filter bounds: Tehran midnight of the first day, and of the day after the last. */
export const startUtc = (iso: string): string => { const g = fromIso(iso); return isoUtc(tehranMidnightUtc(g.gy, g.gm, g.gd)); };
export const endUtc = (iso: string): string => { const g = addDays(fromIso(iso), 1); return isoUtc(tehranMidnightUtc(g.gy, g.gm, g.gd)); };

/** Persian date parts of an instant (Tehran time). */
export const persianParts = (d: Date): { y: number; m: number; d: number } => {
  const j = jalaliOf(tehranYmd(d));
  return { y: j.jy, m: j.jm, d: j.jd };
};

export function jtext(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return "—";
  const j = persianParts(d);
  return toFaDigits(`${j.y}/${pad(j.m)}/${pad(j.d)}`);
}

export const jtextFromIso = (iso: string): string => {
  if (!iso) return "—";
  const j = jalaliOf(fromIso(iso));
  return toFaDigits(`${j.jy}/${pad(j.jm)}/${pad(j.jd)}`);
};
