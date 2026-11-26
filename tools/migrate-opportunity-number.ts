/*
 * One-time migration: copies new_opportunitynumber (Whole Number) -> new_opportunitynumbertext (Text).
 * Build with `npm run build:tools`, then paste dist-tools/migrate-opportunity-number.js in the browser console while logged in to Dynamics.
 * Only fills records whose new field is EMPTY; never overwrites.
 * Run with DRY = true first (default) to see the count, then set DRY = false in the built file and run again.
 */
(async () => {
  const DRY = true;
  const OLD = "new_opportunitynumber";
  const NEW = "new_opportunitynumbertext";
  const base = window.Xrm!.Utility.getGlobalContext().getClientUrl() + "/api/data/v9.1/";
  const H: Record<string, string> = {
    "OData-MaxVersion": "4.0", "OData-Version": "4.0", Accept: "application/json", "Content-Type": "application/json; charset=utf-8",
  };
  interface Row { opportunityid: string; [field: string]: unknown }
  interface Page { value: Row[]; "@odata.nextLink"?: string; error?: { message: string } }

  let url: string | undefined = base + "opportunities?$select=opportunityid," + OLD + "," + NEW + "&$filter=" + encodeURIComponent(OLD + " ne null and " + NEW + " eq null");
  let todo: Row[] = [];
  while (url) {
    const r = (await (await fetch(url, { credentials: "same-origin", headers: { Prefer: "odata.maxpagesize=500", ...H } })).json()) as Page;
    if (r.error) throw new Error(r.error.message);
    todo = todo.concat(r.value);
    url = r["@odata.nextLink"];
  }
  console.log("records to migrate:", todo.length);
  if (DRY) return console.log("DRY run only. Set DRY = false to write.");

  let ok = 0;
  let bad = 0;
  for (const x of todo) {
    const v = String(x[OLD]).padStart(7, "0");
    const res = await fetch(base + "opportunities(" + x.opportunityid + ")", { method: "PATCH", credentials: "same-origin", headers: H, body: JSON.stringify({ [NEW]: v }) });
    if (res.ok) ok++;
    else { bad++; console.warn("failed", x.opportunityid, res.status); }
  }
  console.log("migrated:", ok, "failed:", bad);
})();
