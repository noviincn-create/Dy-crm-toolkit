/**
 * Print footer (پاورقی چاپی): page X of Y, date/time, title and address in the bottom margin of every printed page.
 * ISOLATED world, top frame only. The stylesheet is rebuilt on `beforeprint` so title / address / time are the current ones.
 */
import { FOOTER_STORAGE_KEY, mergeFooterConfig, type FooterConfig, type FooterConfigInput } from "../shared/config";
import { buildFooterCss } from "./css";

const STYLE_ID = "dy-footer-css";
let cfg: FooterConfig = mergeFooterConfig(null);

const whenNow = (): string => {
  const d = new Date();
  try {
    const date = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Tehran" }).format(d);
    const time = new Intl.DateTimeFormat("fa-IR-u-nu-latn", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tehran" }).format(d);
    return `${date}  ${time}`;
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
};

export function applyFooter(): void {
  const css = buildFooterCss(cfg, { title: document.title, href: location.href, when: whenNow() });
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!css) { el?.remove(); return; }
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    el.media = "print";
    (document.head || document.documentElement).appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

if (!window.top || window.top === window) {
  const load = (raw: FooterConfigInput | undefined): void => { cfg = mergeFooterConfig(raw); applyFooter(); };
  chrome.storage.local.get({ [FOOTER_STORAGE_KEY]: {} }).then((r) => load(r[FOOTER_STORAGE_KEY] as FooterConfigInput), () => load({}));
  chrome.storage.onChanged.addListener((ch, area) => {
    const c = ch[FOOTER_STORAGE_KEY];
    if (area === "local" && c) load(c.newValue as FooterConfigInput | undefined);
  });
  window.addEventListener("beforeprint", applyFooter);
}
