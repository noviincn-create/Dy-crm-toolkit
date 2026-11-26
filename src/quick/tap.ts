/**
 * Double-tap detector for a modifier key (Shift / Ctrl / Alt) on a page. A "tap" is the key going down and up on its own:
 * any other key, mouse click or extra modifier in between cancels it, so Shift+letter, Ctrl+C or Ctrl+click never count.
 * Only the trigger is reported; no typed text is ever read or stored.
 */
import type { QuickKey } from "../shared/config";

export type TapKey = Exclude<QuickKey, "off">;
export interface TapOptions {
  /** Max ms between the two taps (also the longest a single tap may last). */
  tapMs(): number;
  /** Which key triggers what; "off" disables one. Read on every event, so settings changes apply at once. */
  keys(): { start: QuickKey; end: QuickKey; enabled: boolean };
  /** True while a popup is open (taps are ignored). */
  blocked(): boolean;
  onTap(which: "start" | "end"): void;
}

const MODS: readonly string[] = ["Shift", "Control", "Alt"];
/** Only real keystrokes count (a page cannot fake them); the test hook is a variable only this isolated world can set. */
const trusted = (e: Event): boolean => e.isTrusted || (globalThis as { __dyQuickTest?: boolean }).__dyQuickTest === true;

export function installTapDetector(o: TapOptions, target: Window = window): () => void {
  let cur: string | null = null; // the modifier currently held on its own
  let downAt = 0;
  let dirty = false;
  let last: { key: string; at: number } | null = null;

  const reset = (): void => { cur = null; dirty = false; last = null; };

  const onDown = (e: KeyboardEvent): void => {
    if (!trusted(e) || e.repeat) return;
    if (!MODS.includes(e.key)) { dirty = true; last = null; return; } // a real key: not a tap
    const others = (e.key !== "Shift" && e.shiftKey) || (e.key !== "Control" && e.ctrlKey) || (e.key !== "Alt" && e.altKey) || e.metaKey;
    if (cur !== null || others) { dirty = true; last = null; return; } // chord (Ctrl+Shift, AltGr, ...)
    cur = e.key;
    downAt = Date.now();
    dirty = false;
  };

  const onUp = (e: KeyboardEvent): void => {
    if (!trusted(e)) return;
    if (e.key !== cur) { if (!MODS.includes(e.key)) return; cur = null; dirty = false; last = null; return; }
    const now = Date.now();
    const clean = !dirty && now - downAt <= o.tapMs();
    const key = cur;
    cur = null;
    dirty = false;
    if (!clean) { last = null; return; }
    if (last && last.key === key && now - last.at <= o.tapMs()) {
      last = null;
      const k = o.keys();
      if (!k.enabled || o.blocked()) return;
      if (k.start === key) o.onTap("start");
      else if (k.end === key) o.onTap("end");
      return;
    }
    last = { key, at: now };
  };

  const onMouse = (): void => { dirty = true; last = null; };

  target.addEventListener("keydown", onDown, true);
  target.addEventListener("keyup", onUp, true);
  target.addEventListener("mousedown", onMouse, true);
  target.addEventListener("wheel", onMouse, { capture: true, passive: true });
  target.addEventListener("blur", reset);
  return () => {
    target.removeEventListener("keydown", onDown, true);
    target.removeEventListener("keyup", onUp, true);
    target.removeEventListener("mousedown", onMouse, true);
    target.removeEventListener("wheel", onMouse, true);
    target.removeEventListener("blur", reset);
  };
}
