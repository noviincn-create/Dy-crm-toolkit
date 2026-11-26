import { toLatinDigits } from "./text";

/**
 * Persian (Jalali) calendar and Tehran-time helpers.
 * Calendar maths: jalaali-js algorithm (MIT, Behrang Noruzi Niya), valid for 1178-3177 AP, handles leap years exactly.
 */

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
const div = (a: number, b: number): number => ~~(a / b);
const mod = (a: number, b: number): number => a - ~~(a / b) * b;

interface JalCal {
  leap: number;
  gy: number;
  march: number;
}

function jalCal(jy: number): JalCal {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0]!;
  let jump = 0;
  if (jy < jp || jy >= BREAKS[bl - 1]!) throw new Error("Invalid Persian year " + jy);
  for (let i = 1; i < bl; i += 1) {
    const jm = BREAKS[i]!;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

export interface GregorianDate { gy: number; gm: number; gd: number }
export interface JalaliDate { jy: number; jm: number; jd: number }

/** Gregorian date → Julian day number. */
function g2d(gy: number, gm: number, gd: number): number {
  const d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

/** Julian day number → Gregorian date. */
function d2g(jdn: number): GregorianDate {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  return { gy: div(j, 1461) - 100100 + div(8 - gm, 6), gm, gd };
}

/** Jalali date → Julian day number. */
function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

/** Julian day number → Jalali date. */
function d2j(jdn: number): JalaliDate {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

/** The calendar primitives, exposed as one object (also handed to tests through `window.__dyOppNumber.PC`). */
export const PC = { g2d, d2g, j2d, d2j };

// ───────────── Tehran time ─────────────
// Month boundaries are Tehran midnight (UTC+03:30, no DST since 2022), independent of the browser timezone.
export const TEHRAN_TZ = "Asia/Tehran";
const TEHRAN_FALLBACK_OFFSET_MS = 12_600_000; // +03:30 if the browser has no tz database

/** Offset (ms) of Tehran wall-clock time from UTC at a given instant. */
export function tehranOffsetMs(date: Date): number {
  try {
    const p: Record<string, string> = {};
    new Intl.DateTimeFormat("en-US", {
      timeZone: TEHRAN_TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
    }).formatToParts(date).forEach((x) => { p[x.type] = x.value; });
    return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) - Math.floor(date.getTime() / 1000) * 1000;
  } catch {
    return TEHRAN_FALLBACK_OFFSET_MS;
  }
}

/** Gregorian y-m-d of an instant as seen in Tehran. */
export function tehranYmd(date: Date): GregorianDate {
  const t = new Date(date.getTime() + tehranOffsetMs(date));
  return { gy: t.getUTCFullYear(), gm: t.getUTCMonth() + 1, gd: t.getUTCDate() };
}

/** The UTC instant of 00:00 Tehran time on a Gregorian date. */
export function tehranMidnightUtc(gy: number, gm: number, gd: number): Date {
  const wall = Date.UTC(gy, gm - 1, gd);
  let t = wall - TEHRAN_FALLBACK_OFFSET_MS;
  t = wall - tehranOffsetMs(new Date(t));
  t = wall - tehranOffsetMs(new Date(t));
  return new Date(t);
}

/** Persian year/month in which a UTC instant falls (Tehran time). */
export function persianMonthOf(date: Date): { jy: number; jm: number } {
  const g = tehranYmd(date);
  const j = PC.d2j(PC.g2d(g.gy, g.gm, g.gd));
  return { jy: j.jy, jm: j.jm };
}

/** [start, end) of a Persian month as UTC instants. */
export function persianMonthBounds(jy: number, jm: number): { start: Date; end: Date } {
  const at = (y: number, m: number): Date => {
    const g = PC.d2g(PC.j2d(y, m, 1));
    return tehranMidnightUtc(g.gy, g.gm, g.gd);
  };
  return { start: at(jy, jm), end: jm === 12 ? at(jy + 1, 1) : at(jy, jm + 1) };
}

/** `YYYY-MM-DDTHH:mm:ssZ` (no milliseconds), the form OData filters expect. */
export const isoUtc = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/** Persian date for display, e.g. ۱۴۰۵/۰۸/۱۹ (browser default digits). */
export function formatJalali(d: Date): string {
  try {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Parses "1377/06/30" | "13770630" | "1377-6-30" (any digit script) into a validated Jalali date. */
export function parseJalali(raw: string): JalaliDate | null {
  const t = toLatinDigits(raw).trim();
  const parts = /\D/.test(t) ? t.split(/\D+/) : [t.slice(0, 4), t.slice(4, 6), t.slice(6)];
  if (parts.length !== 3) return null;
  const [jy, jm, jd] = parts.map(Number) as [number, number, number];
  const ok = jy >= 1200 && jy <= 1500 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= (jm <= 6 ? 31 : 30);
  return ok ? { jy, jm, jd } : null;
}
