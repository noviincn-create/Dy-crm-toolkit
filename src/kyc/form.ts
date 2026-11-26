/** Fills the Dynamics Quick Create form by driving its real inputs (the page is not React-aware of our writes otherwise). */

let formRoot: ParentNode = document;
/** Set when the KYC block is mounted: all lookups are scoped to the Quick Create panel. */
export const setFormRoot = (root: ParentNode): void => {
  formRoot = root;
};

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

// Title field located by its visible label (English "Title" / Persian "عنوان") when no schema name is configured
export const TITLE_KEY = "__title";
const TITLE_LABELS: ReadonlySet<string> = new Set(["title", "عنوان"]);

function titleInput(): FormControl | null {
  for (const el of formRoot.querySelectorAll("label, span, div")) {
    if (el.children.length || !TITLE_LABELS.has((el.textContent ?? "").trim().toLowerCase())) continue;
    let row: Element | null = el.parentElement;
    while (row && row !== formRoot && !row.querySelector("input, textarea")) row = row.parentElement;
    const input = row?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    if (input) return input;
  }
  return null;
}

function fieldInput(attr: string): FormControl | null {
  if (attr === TITLE_KEY) return titleInput();
  const el = formRoot.querySelector(`[data-id^="${attr}."]`);
  if (!el) return null;
  return el.matches("input, textarea, select") ? (el as FormControl) : el.querySelector<FormControl>("input, textarea, select");
}

function setSelect(select: HTMLSelectElement, value: string): boolean {
  const idx = [...select.options].findIndex((o) => o.value === value || (o.textContent ?? "").trim() === value);
  if (idx < 0) return false;
  select.focus();
  select.selectedIndex = idx;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  select.blur();
  // Dynamics may re-render the control; make sure the choice sticks
  setTimeout(() => {
    if (select.isConnected && select.selectedIndex !== idx) {
      select.selectedIndex = idx;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, 400);
  return true;
}

/** Some Dynamics forms render option sets as radio buttons: select the one whose CRM value matches. */
function setRadio(input: HTMLInputElement, value: string): boolean {
  let group: Element | null = input.closest("[data-id]");
  if (!group) {
    for (let node = input.parentElement; node && node !== formRoot; node = node.parentElement) {
      if (node.querySelectorAll('input[type="radio"]').length > 1) { group = node; break; }
    }
  }
  const radios = [...(group ?? input.parentElement!).querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  const target = radios.find((radio) => String(radio.value) === String(value));
  if (!target) return false;
  target.focus();
  target.click();
  target.checked = true;
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
  target.blur();
  return true;
}

/** Returns false when the value could not be applied (e.g. no such option). */
function setValue(input: FormControl, value: string): boolean {
  if (input instanceof HTMLSelectElement) return setSelect(input, value);
  if (input instanceof HTMLInputElement && input.type === "radio") return setRadio(input, value);
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  input.focus();
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value); // bypasses React's value tracker
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.blur(); // Dynamics commits the value on blur
  return true;
}

/** Returns the attributes that have no input on the form. */
export function fillForm(payload: Record<string, string>): string[] {
  const missing: string[] = [];
  for (const [attr, value] of Object.entries(payload)) {
    const input = fieldInput(attr);
    if (!input || !setValue(input, String(value))) missing.push(attr);
  }
  return missing;
}

// Clicks "Save and Close" of the Quick Create flyout (stays on the current page, no navigation)
const SAVE_TEXT = /^(save\s*(and|&)\s*close|ذخیره\s*(کردن)?\s*و\s*بستن)$/i;
export function saveAndClose(): boolean {
  const btn =
    document.querySelector<HTMLElement>('[data-id*="quickCreateSaveAndCloseBtn"]') ||
    [...document.querySelectorAll("button")].find((b) => SAVE_TEXT.test((b.textContent ?? "").trim()));
  if (!btn) return false;
  btn.click();
  return true;
}

/** Small page-level toast: the panel itself disappears once Quick Create closes. */
export function toast(text: string, type: "ok" | "err" = "ok"): void {
  document.getElementById("kyc-toast")?.remove();
  const t = Object.assign(document.createElement("div"), { id: "kyc-toast", textContent: text, role: "status" });
  t.style.cssText = `position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2147483002;padding:11px 18px;border-radius:12px;
      color:#fff;background:${type === "err" ? "#b3261e" : "#1f2937"};font:14px Vazirmatn,"Segoe UI",Tahoma,sans-serif;direction:rtl;
      box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:90vw`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

// ───────────── Locating the Quick Create panel ─────────────
// Heading is "Quick Create: Contact" in English and "ایجاد سریع: شخص" in Persian, so the
// entity is taken from the form fields instead of the heading text.
const HEADING = '//*[not(*)][contains(., "Quick Create") or contains(., "ایجاد سریع")]';

export function findMount(): { body: Element; kind: "person" | "company" } | null {
  const heading = document.evaluate(HEADING, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as Element | null;
  if (!heading) return null;

  // panel = closest ancestor of the heading that also holds the form fields
  let panel: Element | null = heading;
  while (panel && !panel.querySelector("input")) panel = panel.parentElement;
  const firstInput = panel?.querySelector("input");
  if (!panel || !firstInput) return null;

  const isContact = !!panel.querySelector('[data-id^="firstname."], [data-id^="lastname."]');
  const isAccount = !isContact && !!panel.querySelector('[data-id^="telephone1."], [data-id^="websiteurl."]');
  if (!isContact && !isAccount) return null;

  // body = the panel child that contains the fields (header stays above it)
  let body: Element = firstInput;
  while (body.parentElement !== panel) body = body.parentElement!;
  return { body: body === firstInput ? panel : body, kind: isContact ? "person" : "company" };
}
