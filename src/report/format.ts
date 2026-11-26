import { state } from "./state";

const nf = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 });

export const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const format = (v: unknown): string => nf.format(num(v));
/** Amounts are stored in rial; the toggle only changes the display. */
export const convert = (v: number): number => (state.currency === "تومان" ? num(v) / 10 : num(v));
export const money = (v: number): string => `${format(convert(v))} ${state.currency}`;

export function compact(v: number): string {
  const x = convert(v);
  const a = Math.abs(x);
  if (a >= 1e9) return `${format(x / 1e9)} میلیارد`;
  if (a >= 1e6) return `${format(x / 1e6)} میلیون`;
  if (a >= 1e3) return `${format(x / 1e3)} هزار`;
  return format(x);
}
