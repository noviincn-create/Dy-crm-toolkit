/** UI kit shared by every button / dialog / toast of the opportunity tools. */
import { esc, toLatinDigits } from "../../shared/text";
import { CSS_ID, DLG_ID } from "../constants";
import { ICONS, type IconName } from "./icons";
import { CLOSE_CSS } from "./styles";

export { esc };

/** Builds one element from an HTML string. */
export const h = <T extends HTMLElement = HTMLElement>(html: string): T => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
};

/** Live thousands separator: "1234567.891" → "1,234,567.89". */
export const groupDigits = (str: string): string => {
  const c = toLatinDigits(str).replace(/[^\d.]/g, "");
  const parts = c.split(".");
  const i = parts[0]!.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.length > 1 ? i + "." + parts[1]!.slice(0, 2) : i;
};

export const parseAmount = (str: string): number => {
  const c = toLatinDigits(str).replace(/[^\d.]/g, "");
  return c === "" ? 0 : Number(c);
};

export function injectCss(): void {
  if (document.getElementById(CSS_ID)) return;
  const s = document.createElement("style");
  s.id = CSS_ID;
  s.textContent = CLOSE_CSS;
  document.head.appendChild(s);
}

// ───────────── toast ─────────────
let toastTimer = 0;
export function toast(text: string, type?: "ok" | "err", ms?: number): void {
  injectCss();
  document.getElementById("dy-toast")?.remove();
  const t = h<HTMLDivElement>(`<div id="dy-toast" class="dyx${type === "err" ? " err" : ""}" role="status"></div>`);
  t.innerHTML = (type === "err" ? ICONS.error : ICONS.check) + "<span></span>";
  (t.lastChild as HTMLElement).textContent = text;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.remove(), ms || 4200);
}

// ───────────── modal ─────────────
export interface ModalOptions {
  title: string;
  sub?: string;
  icon?: IconName;
  tone?: string;
  wide?: boolean;
  onClose?: () => void;
}

export interface Modal {
  bg: HTMLElement;
  box: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
  /** While locked, Esc / backdrop / X do not close the dialog (an operation is running). */
  locked: boolean;
  $<T extends Element = HTMLElement>(selector: string): T;
  close(): void;
}

/** Generic modal: header (icon + title + subtitle), scrollable body, footer. Esc / backdrop / X close it unless locked. */
export function modal(o: ModalOptions): Modal {
  injectCss();
  document.getElementById(DLG_ID + "-bg")?.remove();
  const prev = document.activeElement as HTMLElement | null;
  const bg = h(`<div id="${DLG_ID}-bg" class="dyx"><div id="${DLG_ID}" class="${o.wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="dy-t" tabindex="-1">
      <div class="dy-hd"><span class="dy-badge ${o.tone || ""}">${o.icon ? ICONS[o.icon] : ""}</span>
        <div><h3 id="dy-t"></h3><p class="dy-sub"></p></div>
        <button type="button" class="dy-x" aria-label="بستن">${ICONS.close}</button></div>
      <div class="dy-bd"></div><div class="dy-ft"></div></div></div>`);
  const box = bg.firstElementChild as HTMLElement;
  bg.querySelector("h3")!.textContent = o.title;
  const sub = bg.querySelector(".dy-sub")!;
  if (o.sub) sub.textContent = o.sub;
  else sub.remove();

  const m: Modal = {
    bg,
    box,
    body: box.querySelector<HTMLElement>(".dy-bd")!,
    foot: box.querySelector<HTMLElement>(".dy-ft")!,
    locked: false,
    $: <T extends Element = HTMLElement>(selector: string) => bg.querySelector(selector) as T,
    close() {
      if (m.locked) return;
      bg.remove();
      try { prev?.focus?.(); } catch { /* element is gone */ }
      o.onClose?.();
    },
  };

  bg.querySelector<HTMLElement>(".dy-x")!.onclick = m.close;
  bg.addEventListener("mousedown", (e) => { if (e.target === bg) m.close(); });
  bg.addEventListener("keydown", (e) => {
    e.stopPropagation(); // keep typing away from Dynamics hotkeys
    if (e.key === "Escape") { e.preventDefault(); m.close(); return; }
    if (e.key === "Tab") { // keep focus inside the dialog
      const f = [...box.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea,summary,[tabindex="0"]')].filter((x) => x.offsetParent);
      if (!f.length) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  bg.addEventListener("keyup", (e) => e.stopPropagation());
  bg.addEventListener("keypress", (e) => e.stopPropagation());
  document.body.appendChild(bg);
  return m;
}

export type StatusKind = "" | "busy" | "ok" | "err" | "warn";

/** Status line inside a dialog. */
export function setStatus(el: HTMLElement, text: string, kind: StatusKind = ""): void {
  if (!text) { el.hidden = true; el.textContent = ""; return; }
  el.hidden = false;
  el.className = "dy-st" + (kind === "err" || kind === "ok" || kind === "warn" ? " " + kind : "");
  el.innerHTML = (kind === "busy" ? '<span class="dy-spin"></span>' : kind === "err" ? ICONS.error : kind === "ok" ? ICONS.check : "") + "<span></span>";
  (el.lastChild as HTMLElement).textContent = text;
}
