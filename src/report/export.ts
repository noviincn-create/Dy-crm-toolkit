import { esc } from "../shared/text";
import { todayIso } from "./dates";
import { DIMS } from "./dims";
import { convert } from "./format";
import { state } from "./state";

function table(): { headers: string[]; data: (string | number)[][] } {
  const headers = [
    DIMS[state.dim].label, "تعداد فرصت", "تعداد فروش", "میانگین قیمت واحد", "مبلغ پایه", "مجموع تخفیف",
    "درصد تخفیف", "مبلغ نهایی فروش", "سهم از فروش (٪)", "تعداد ردیف",
  ];
  const data = state.filtered.map((g) => [
    g.name, g.oppCount, g.quantity, convert(g.unitPrice), convert(g.base), convert(g.discount),
    Number(g.discountPct.toFixed(2)), convert(g.revenue), Number(g.share.toFixed(2)), g.lines,
  ]);
  return { headers, data };
}

function download(content: string, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileName = (ext: string): string => `Novin-Sales-${state.dim}-${todayIso()}.${ext}`;

export const csvText = (): string => {
  const { headers, data } = table();
  return "﻿" + [headers, ...data].map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
};

export const excelHtml = (): string => {
  const { headers, data } = table();
  return `﻿<html dir="rtl" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"></head><body><table border="1">
<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${data.map((row) => `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody>
</table></body></html>`;
};

/** Returns false when there is nothing to export. */
export function exportCSV(): boolean {
  if (!state.filtered.length) return false;
  download(csvText(), "text/csv;charset=utf-8;", fileName("csv"));
  return true;
}

export function exportExcel(): boolean {
  if (!state.filtered.length) return false;
  download(excelHtml(), "application/vnd.ms-excel;charset=utf-8;", fileName("xls"));
  return true;
}
