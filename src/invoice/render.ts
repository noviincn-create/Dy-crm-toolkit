/**
 * Renders the standard Iranian «صورت‌حساب فروش کالا و خدمات» form (A4 landscape, RTL) as HTML.
 * Shown only in print via #dy-inv-root. The serial number («شماره سریال») is the opportunity number.
 */
import type { InvoiceConfig } from "../shared/config";
import { esc, toFaDigits } from "../shared/text";
import { money, qty, type InvoiceData } from "./data";

/** Rows the form always has (blank rows are printed so the sheet looks like the standard form). */
export const MIN_ROWS = 7;

interface PartyView {
  name: string;
  economic: string;
  reg: string;
  province: string;
  county: string;
  city: string;
  postal: string;
  phone: string;
  address: string;
}

const EMPTY_PARTY: PartyView = { name: "", economic: "", reg: "", province: "", county: "", city: "", postal: "", phone: "", address: "" };

const field = (label: string, value: string, cls = ""): string =>
  `<div class="f${cls ? " " + cls : ""}"><span class="l">${label} :</span><span class="v">${value}</span></div>`;

function partyBox(title: string, p: PartyView): string {
  const d = (v: string): string => esc(toFaDigits(v));
  return `<div class="band">${esc(title)}</div><div class="pbox">` +
    field("نام شخص حقیقی / حقوقی", esc(p.name), "name") +
    field("شماره اقتصادی", d(p.economic), "eco") +
    field("شماره ثبت / شماره ملی", d(p.reg), "reg") +
    field("نشانی کامل : استان", esc(p.province), "prov") +
    field("شهرستان", esc(p.county), "county") +
    field("کد پستی ۱۰ رقمی", d(p.postal), "post") +
    field("شهر", esc(p.city), "city") +
    field("نشانی", esc(p.address), "addr") +
    field("شماره تلفن / نمابر", d(p.phone), "tel") +
    `</div>`;
}

const COLUMNS = [
  "ردیف",
  "کد کالا",
  "شرح کالا یا خدمات",
  "تعداد / مقدار",
  "واحد اندازه‌گیری",
  "مبلغ واحد<br>(ریال)",
  "مبلغ کل<br>(ریال)",
  "مبلغ تخفیف",
  "مبلغ کل<br>پس از تخفیف<br>(ریال)",
  "جمع مالیات<br>و عوارض<br>(ریال)",
  "جمع مبلغ کل بعلاوه<br>جمع مالیات و عوارض<br>(ریال)",
];

const WIDTHS = [3.5, 7.5, 21, 5.5, 6.5, 9.5, 10.5, 8, 10.5, 7.5, 10]; // % of the table, column 1 = ردیف (rightmost)

export function renderInvoice(data: InvoiceData, cfg: InvoiceConfig): string {
  const s = cfg.seller;
  const t = data.totals;
  const seller: PartyView = {
    name: s.name, economic: s.economicCode, reg: s.regNo || s.guild, province: s.province, county: s.county || s.city,
    city: s.city, postal: s.postal, phone: s.phone, address: s.address,
  };
  const b = data.buyer;
  const buyer: PartyView = b
    ? { name: b.name, economic: "", reg: b.nid, province: b.province, county: b.county || b.city, city: b.city, postal: b.postal, phone: b.phone, address: b.address }
    : EMPTY_PARTY;

  const lineRows = data.lines.map((l, i) =>
    `<tr><td>${toFaDigits(i + 1)}</td><td>${esc(toFaDigits(l.code))}</td><td class="desc">${esc(l.name)}` +
    `${l.note ? `<small>${esc(l.note)}</small>` : ""}</td><td>${qty(l.qty)}</td><td>${esc(l.unit)}</td><td>${money(l.price)}` +
    `</td><td>${money(l.base)}</td><td>${money(l.disc)}</td><td>${money(l.after)}</td><td>${money(l.tax)}</td><td>${money(l.after + l.tax)}</td></tr>`,
  );
  const blank = `<tr class="blank">${"<td></td>".repeat(COLUMNS.length)}</tr>`;
  while (lineRows.length < MIN_ROWS) lineRows.push(blank);

  const sum = (f: (l: InvoiceData["lines"][number]) => number): number => data.lines.reduce((a, l) => a + f(l), 0);
  const totalRow =
    `<tr class="tot"><td colspan="6" class="tl">جمع کل</td><td>${money(sum((l) => l.base))}</td><td>${money(sum((l) => l.disc))}</td>` +
    `<td>${money(sum((l) => l.after))}</td><td>${money(sum((l) => l.tax))}</td><td>${money(sum((l) => l.after + l.tax))}</td></tr>`;

  // opportunity-level discount / freight do not belong to any row: show them with the amount payable
  const adj: string[] = [];
  if (t.oppDisc) adj.push(`تخفیف کلی: ${money(t.oppDisc)} ریال`);
  if (t.freight) adj.push(`هزینه حمل: ${money(t.freight)} ریال`);
  const payRow = adj.length
    ? `<tr class="tot pay"><td colspan="10" class="tl">${adj.join("  ـ  ")}  ـ  مبلغ قابل پرداخت (ریال)</td><td>${money(t.payable)}</td></tr>`
    : "";

  return `<div class="inv">` +
    `<header class="hd"><div></div><h1>${esc(cfg.title)}</h1>` +
    `<div class="meta"><div class="m"><span class="l">شماره سریال :</span><i>${esc(toFaDigits(data.number))}</i></div>` +
    `<div class="m"><span class="l">تاریخ :</span><i>${esc(data.date)}</i></div></div></header>` +
    partyBox("مشخصات فروشنده", seller) +
    partyBox("مشخصات خریدار", buyer) +
    `<div class="band">مشخصات کالا یا خدمات مورد معامله</div>` +
    `<table><colgroup>${WIDTHS.map((w) => `<col style="width:${w}%">`).join("")}</colgroup>` +
    `<thead><tr class="nums">${COLUMNS.map((_, i) => `<th>${toFaDigits(i + 1)}</th>`).join("")}</tr>` +
    `<tr class="ttl">${COLUMNS.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` +
    `<tbody>${lineRows.join("")}</tbody><tfoot>${totalRow}${payRow}</tfoot></table>` +
    `<div class="foot"><div class="fr">` +
    `<div class="box terms"><span class="tt">شرایط و نحوه فروش :</span><span class="ck"><u></u>نقدی</span><span class="ck"><u></u>غیرنقدی</span></div>` +
    `<div class="box notes"><span class="tt">توضیحات :</span><span class="dots"></span></div></div><div class="fl"></div>` +
    `<div class="box sign">مهر و امضاء فروشنده</div><div class="box sign">مهر و امضاء خریدار</div></div></div>`;
}
