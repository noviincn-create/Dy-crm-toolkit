/**
 * Popup host for any website: a closed shadow root (the page's CSS and scripts cannot reach in), one dialog at a time.
 * While a dialog is open every key event is handled here first (capture on window): Esc closes it, Tab stays inside it, and
 * the page's own keyboard shortcuts never see what is typed.
 */
import { CLOSE_CSS } from "../close/ui/styles";
import { DLG_ID } from "../close/constants";
import { ICONS, type IconName } from "../close/ui/icons";
import { h } from "../close/ui/dom";
import { QUICK_CSS } from "./styles";

export interface DialogOptions {
  title: string;
  sub?: string;
  icon?: IconName;
  wide?: boolean;
  /** Called for every keydown inside the dialog except Esc / Tab. */
  onKey?(e: KeyboardEvent): void;
  onClose?(): void;
}

export interface QDialog {
  box: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
  /** While locked (an operation runs) Esc / backdrop / X do nothing. */
  locked: boolean;
  $<T extends Element = HTMLElement>(selector: string): T;
  /** The focused element inside the dialog. */
  active(): Element | null;
  /** The element a key event was really aimed at (inside the shadow tree). */
  target(e: Event): Element | null;
  setTitle(title: string, sub?: string): void;
  close(): void;
}

interface Current { dlg: QDialog; host: HTMLElement; shadow: ShadowRoot; prev: HTMLElement | null; opts: DialogOptions }
let current: Current | null = null;

export const isDialogOpen = (): boolean => current !== null;

const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';

function route(e: KeyboardEvent): void {
  const c = current;
  if (!c) return;
  if (e.type === "keydown") {
    const inside = e.target instanceof Node && c.host.contains(e.target);
    if (e.key === "Escape") {
      e.preventDefault();
      if (!c.dlg.locked) c.dlg.close();
    } else if (!inside) {
      c.dlg.box.focus(); // focus escaped to the page: bring it back, don't let the page see the key
    } else if (e.key === "Tab") {
      const f = [...c.dlg.box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === c.dlg.active());
      if (f.length) {
        const i = f.indexOf(c.dlg.active() as HTMLElement);
        const next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i === f.length - 1 ? 0 : i + 1);
        e.preventDefault();
        f[next]!.focus();
      }
    } else {
      c.opts.onKey?.(e);
    }
  }
  e.stopImmediatePropagation();
}

export function openDialog(o: DialogOptions): QDialog {
  current?.dlg.close();
  const host = document.createElement("div");
  host.setAttribute("style", "all:initial;position:fixed;inset:0;z-index:2147483647");
  // tests (and only tests: the page cannot set a variable in this isolated world) may inspect the tree
  const shadow = host.attachShadow({ mode: (globalThis as { __dyQuickTest?: boolean }).__dyQuickTest ? "open" : "closed" });
  const style = document.createElement("style");
  style.textContent = CLOSE_CSS + QUICK_CSS;
  const bg = h(`<div id="${DLG_ID}-bg" class="dyx"><div id="${DLG_ID}" class="${o.wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="dy-t" tabindex="-1">
      <div class="dy-hd"><span class="dy-badge">${o.icon ? ICONS[o.icon] : ""}</span>
        <div><h3 id="dy-t"></h3><p class="dy-sub"></p></div>
        <button type="button" class="dy-x" aria-label="بستن">${ICONS.close}</button></div>
      <div class="dy-bd"></div><div class="dy-ft"></div></div></div>`);
  shadow.append(style, bg);
  const box = bg.firstElementChild as HTMLElement;
  const dlg: QDialog = {
    box,
    body: box.querySelector<HTMLElement>(".dy-bd")!,
    foot: box.querySelector<HTMLElement>(".dy-ft")!,
    locked: false,
    $: <T extends Element = HTMLElement>(s: string) => bg.querySelector(s) as T,
    active: () => shadow.activeElement,
    target: (e) => (e.composedPath()[0] instanceof Element ? (e.composedPath()[0] as Element) : shadow.activeElement),
    setTitle(title, sub) {
      bg.querySelector("h3")!.textContent = title;
      const s = bg.querySelector<HTMLElement>(".dy-sub")!;
      s.textContent = sub ?? "";
      s.hidden = !sub;
    },
    close() {
      if (current?.dlg !== dlg) return;
      current = null;
      for (const t of ["keydown", "keyup", "keypress"] as const) window.removeEventListener(t, route, true);
      host.remove();
      try { prev?.focus?.(); } catch { /* element is gone */ }
      o.onClose?.();
    },
  };
  dlg.setTitle(o.title, o.sub);
  bg.querySelector<HTMLElement>(".dy-x")!.onclick = () => { if (!dlg.locked) dlg.close(); };
  bg.addEventListener("mousedown", (e) => { if (e.target === bg && !dlg.locked) dlg.close(); });
  const prev = document.activeElement as HTMLElement | null;
  current = { dlg, host, shadow, prev, opts: o };
  for (const t of ["keydown", "keyup", "keypress"] as const) window.addEventListener(t, route, true);
  document.documentElement.appendChild(host);
  box.focus();
  return dlg;
}

export const closeDialog = (): void => current?.dlg.close();
