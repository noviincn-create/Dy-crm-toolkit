/**
 * The novinvn:// scheme. Chrome cannot register this scheme for an extension, so the OS handler (tools/protocol) turns
 * novinvn://<route> into a CRM URL carrying `?novinvn=<route>`; the page script and the omnibox then act on the route.
 */
export const NOVINVN_PARAM = "novinvn";

const ROUTE_RE = /^[a-z][a-z0-9_-]*$/;

/** "novinvn://report", "novinvn:report", "novinvn:///Report/?x=1" → "report". Anything else → null. */
export function parseNovinvn(input: string): string | null {
  const m = /^\s*novinvn:(?:\/\/)?\/*([a-z][a-z0-9_-]*)/i.exec(String(input ?? ""));
  return m ? m[1]!.toLowerCase() : null;
}

/** The route carried by a page URL: `?novinvn=report`, `#novinvn=report` (a full novinvn://report value is accepted too). */
export function routeFromLocation(loc: { search: string; hash: string }): string | null {
  const sources = [loc.search, loc.hash.replace(/^#\/?/, "")];
  for (const s of sources) {
    const raw = new URLSearchParams(s.replace(/^\?/, "")).get(NOVINVN_PARAM);
    if (!raw) continue;
    const route = parseNovinvn(raw) ?? raw.trim().toLowerCase();
    if (ROUTE_RE.test(route)) return route;
  }
  return null;
}

/** The CRM URL that opens a route (used by the omnibox and the OS handler). */
export const routeUrl = (crmBase: string, route: string): string =>
  `${crmBase.replace(/\/+$/, "")}/main.aspx?${NOVINVN_PARAM}=${encodeURIComponent(route)}`;

/** The same URL without the route parameter (so a refresh does not reopen it). */
export function withoutRoute(href: string): string {
  const u = new URL(href);
  u.searchParams.delete(NOVINVN_PARAM);
  if (u.hash) {
    const h = new URLSearchParams(u.hash.replace(/^#\/?/, ""));
    if (h.has(NOVINVN_PARAM)) {
      h.delete(NOVINVN_PARAM);
      const rest = h.toString();
      u.hash = rest ? "#" + rest : "";
    }
  }
  return u.toString();
}
