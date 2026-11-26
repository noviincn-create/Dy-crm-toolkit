/** Helpers for scripts that run in the page's MAIN world and talk to the Dynamics client API (`Xrm`). */

/** The form context (`Xrm.Page`) when a form is loaded, otherwise `null`. */
export function getFC(): XrmFormContext | null {
  try {
    const page = window.Xrm?.Page;
    return page?.data ? page : null;
  } catch {
    return null;
  }
}

export function requireXrm(): XrmStatic {
  const xrm = window.Xrm;
  if (!xrm) throw new Error("Xrm در دسترس نیست.");
  return xrm;
}

/** `{ABC-…}` → `abc-…` */
export const cleanId = (id: string): string => id.replace(/[{}]/g, "").toLowerCase();

export const clientUrl = (): string => requireXrm().Utility.getGlobalContext().getClientUrl();
