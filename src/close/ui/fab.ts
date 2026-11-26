/** The stack of floating action buttons (bottom-left of every Dynamics page). */
import { FAB_ID, FAB_KEY } from "../constants";
import { lsGet, lsSet } from "../storage";
import { h, injectCss } from "./dom";
import { ICONS, type IconName } from "./icons";

export function getFab(create: boolean): HTMLElement | null {
  let fab = document.getElementById(FAB_ID);
  if (!fab && create) {
    injectCss();
    fab = h(`<div id="${FAB_ID}" class="dyx"></div>`);
    const hd = h<HTMLButtonElement>('<button type="button" class="dy-fh"></button>');
    const paint = (): void => {
      const min = fab!.classList.contains("min");
      hd.innerHTML = min ? ICONS.right : ICONS.left;
      hd.title = min ? "نمایش متن دکمه‌ها" : "جمع کردن دکمه‌ها";
      hd.setAttribute("aria-label", hd.title);
    };
    hd.onclick = () => {
      fab!.classList.toggle("min");
      lsSet(FAB_KEY, fab!.classList.contains("min") ? "1" : "0");
      paint();
    };
    if (lsGet(FAB_KEY) === "1") fab.classList.add("min");
    fab.appendChild(hd);
    paint();
    document.body.appendChild(fab);
  }
  return fab;
}

export interface ButtonSpec {
  cls: string;
  icon: IconName;
  label: string;
  handler: () => void;
}

/** Adds or removes one floating button so that it is shown exactly when `show` is true. */
export function syncButton(id: string, show: boolean, spec: ButtonSpec): void {
  let btn = document.getElementById(id);
  if (show && !btn) {
    const fab = getFab(true)!;
    btn = h(`<button type="button" class="dy-fb ${spec.cls}"><span class="ic">${ICONS[spec.icon]}</span><span class="lbl"></span></button>`);
    btn.id = id;
    btn.title = spec.label;
    btn.setAttribute("aria-label", spec.label);
    (btn.lastChild as HTMLElement).textContent = spec.label;
    btn.onclick = spec.handler;
    fab.appendChild(btn);
  } else if (!show && btn) {
    btn.remove();
    const fab = getFab(false);
    if (fab && !fab.querySelector(".dy-fb")) fab.remove();
  }
}
