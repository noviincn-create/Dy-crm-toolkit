/** Same-origin Dynamics Web API client for MAIN-world scripts (uses the signed-in session, no token). */
import { clientUrl } from "./xrm";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ODataList<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

/** A Web API row. Field names are runtime data (custom schema, annotations), so values stay loosely typed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ODataRow = Record<string, any>;

/**
 * Where the client talks to. Default: the CRM page's own origin (MAIN world, signed-in session). The service worker installs
 * its own transport (CRM address + browser cookies) so the same record helpers work from any tab.
 */
export interface ApiTransport {
  base(): string | Promise<string>;
  credentials: RequestCredentials;
}
let transport: ApiTransport = { base: clientUrl, credentials: "same-origin" };
export const setApiTransport = (t: ApiTransport): void => { transport = t; };

export interface ApiOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * `path` is relative to `/api/data/v9.1/` or a full `@odata.nextLink` URL (same origin only).
 * Headers passed in `opts` are merged over the defaults. Returns `null` for 204 responses.
 */
export async function api<T = ODataRow>(path: string, opts: ApiOptions = {}): Promise<T> {
  const isAbsolute = /^https?:\/\//i.test(path);
  const base = await transport.base();
  const url = isAbsolute ? path : base + "/api/data/v9.1/" + path;
  if (isAbsolute && path.indexOf(base + "/") !== 0) throw new Error("Refusing cross-origin request: " + path);
  const res = await fetch(url, {
    credentials: transport.credentials,
    ...opts,
    headers: {
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      ...opts.headers,
    },
  });
  if (!res.ok) {
    let msg = res.status + " " + res.statusText;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      msg = j.error?.message || msg;
    } catch { /* body is not JSON */ }
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return null as T;
  // an expired CRM session answers 200 with the HTML sign-in page
  if (/text\/html/i.test(res.headers?.get?.("content-type") ?? "")) throw new ApiError("به CRM وارد نشده‌اید؛ یک تب CRM را باز کنید و وارد شوید.", 401);
  return (await res.json()) as T;
}

/** Follows `@odata.nextLink` (bounded) and concatenates the rows. */
export async function apiAll<T = ODataRow>(path: string, opts: ApiOptions = {}, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = path;
  for (let i = 0; next && i < maxPages; i++) {
    const r: ODataList<T> = await api<ODataList<T>>(next, opts);
    out.push(...(r.value ?? []));
    next = r["@odata.nextLink"];
  }
  return out;
}
