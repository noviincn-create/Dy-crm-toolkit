/** Builds the `@page` margin-box stylesheet of the print footer (pure: no DOM access, so it can be tested). */
import type { FooterConfig } from "../shared/config";
import { toFaDigits } from "../shared/text";

export interface FooterContext {
  title: string;
  href: string;
  /** Already formatted (Persian digits, Tehran time). */
  when: string;
}

/** CSS string literal: escapes quotes/backslashes and turns line breaks into `\A`. */
export const cssStr = (s: string): string => '"' + s.replace(/[\\"]/g, "\\$&").replace(/\r?\n/g, "\\A ") + '"';

const KEEP_PARAMS = ["etn", "id", "pagetype", "appid"];

/** Address shown in the footer; with `trim` only the parameters that identify the record are kept. */
export function footerUrl(href: string, trim: boolean): string {
  try {
    const u = new URL(href);
    u.hash = "";
    if (trim) for (const k of [...u.searchParams.keys()]) if (!KEEP_PARAMS.includes(k)) u.searchParams.delete(k);
    return u.toString().replace(/^https?:\/\//, "");
  } catch {
    return href;
  }
}

export function buildFooterCss(cfg: FooterConfig, ctx: FooterContext): string {
  if (!cfg.enabled) return "";
  const box = `font:${cfg.size}pt/1.5 "DY Vazir",Vazirmatn,"Segoe UI",Tahoma,sans-serif;color:#555;vertical-align:top;padding-top:3mm;white-space:pre-line;unicode-bidi:plaintext`;
  const rules: string[] = [];
  if (cfg.page) rules.push(`@bottom-right{content:"صفحه " counter(page,persian) " از " counter(pages,persian);${box};text-align:right}`);
  if (cfg.date) rules.push(`@bottom-left{content:${cssStr(toFaDigits(ctx.when))};${box};text-align:left;direction:rtl}`);
  const lines: string[] = [];
  if (cfg.title && ctx.title.trim()) lines.push(ctx.title.trim().replace(/\s+/g, " "));
  if (cfg.url) lines.push("⁦" + footerUrl(ctx.href, cfg.trimUrl) + "⁩");
  if (lines.length) rules.push(`@bottom-center{content:${cssStr(lines.join("\n"))};${box};text-align:center;overflow:hidden}`);
  return rules.length ? `@page{${rules.join("")}}` : "";
}
