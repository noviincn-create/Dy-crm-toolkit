/**
 * Monthly opportunity number → opportunity.new_opportunitynumbertext
 * Format YMMNNNN: Y = last digit of the Persian year, MM = Persian month, NNNN = sequence inside that Persian month.
 * Assigned AFTER the opportunity exists (POST), as a separate PATCH on the same record.
 */
import { isoUtc, PC, persianMonthBounds, persianMonthOf, tehranMidnightUtc } from "../shared/jalali";
import { api, ApiError, type ODataList, type ODataRow } from "../shared/odata";
import { errorMessage, pad } from "../shared/text";
import { cleanId } from "../shared/xrm";
import { NUM_FIELD, NUM_LEGACY, NUM_MAX_ATTEMPTS, NUM_MAX_SEQ } from "./constants";

const numPrefix = (jy: number, jm: number): string => String(jy % 10) + pad(jm, 2); // "Y" + "MM"
export const numFormat = (jy: number, jm: number, seq: number): string => numPrefix(jy, jm) + pad(seq, 4); // "YMMNNNN"

export interface NumberAssignment {
  number: string;
  /** True when the record already had a number (nothing was written). */
  existing: boolean;
  seq: number | null;
  attempts: number;
  collisions: number;
}

/** Thrown when a unique number could not be confirmed after the bounded retries. */
export class NumberCollisionError extends Error {
  readonly code = "COLLISION";
  constructor(message: string) {
    super(message);
    this.name = "NumberCollisionError";
  }
}

interface FieldMeta {
  numeric: boolean;
  type: string;
}

// verifies (once per page) that the field exists, is writable and what its data type is
let numMetaP: Promise<FieldMeta> | null = null;
function numMeta(): Promise<FieldMeta> {
  if (!numMetaP) {
    numMetaP = (async (): Promise<FieldMeta> => {
      let a: ODataRow;
      try {
        a = await api("EntityDefinitions(LogicalName='opportunity')/Attributes(LogicalName='" + NUM_FIELD + "')");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) throw new Error("فیلد " + NUM_FIELD + " در موجودیت opportunity پیدا نشد.");
        throw new Error("خواندن متادیتای فیلد " + NUM_FIELD + " ناموفق بود: " + errorMessage(e));
      }
      const yes = (v: unknown): boolean => v === true || (typeof v === "object" && v !== null && (v as { Value?: unknown }).Value === true);
      const type = String(a.AttributeType || (a.AttributeTypeName && a.AttributeTypeName.Value) || "").replace(/Type$/, "");
      const isStr = /^(String|Memo)$/i.test(type);
      const isNum = /^(Integer|BigInt|Decimal|Double)$/i.test(type);
      if (!isStr && !isNum) throw new Error("نوع داده‌ی فیلد " + NUM_FIELD + " (" + (type || "؟") + ") برای شماره‌ی عددی پشتیبانی نمی‌شود.");
      if (!yes(a.IsValidForUpdate)) throw new Error("فیلد " + NUM_FIELD + " قابل ویرایش نیست (IsValidForUpdate=false).");
      if (isStr && a.MaxLength != null && a.MaxLength < 7) throw new Error("حداکثر طول فیلد " + NUM_FIELD + " کمتر از ۷ نویسه است.");
      return { numeric: isNum, type };
    })();
    numMetaP.catch(() => { numMetaP = null; });
  }
  return numMetaP;
}

const numValue = (meta: FieldMeta, s: string): string | number => (meta.numeric ? Number(s) : s); // JSON payload value
const numLiteral = (meta: FieldMeta, s: string): string => (meta.numeric ? String(Number(s)) : "'" + String(s).replace(/'/g, "''") + "'"); // OData literal

/** Every opportunity created in [start, end): server-side filter, follows @odata.nextLink. */
async function fetchMonthRows(b: { start: Date; end: Date }): Promise<ODataRow[]> {
  const filter = "createdon ge " + isoUtc(b.start) + " and createdon lt " + isoUtc(b.end);
  let url: string | null = "opportunities?$select=opportunityid," + NUM_FIELD + "," + NUM_LEGACY + ",createdon&$filter=" + encodeURIComponent(filter);
  const rows: ODataRow[] = [];
  for (let guard = 0; url; guard++) {
    if (guard > 400) throw new Error("تعداد صفحه‌های نتیجه بیش از حد مجاز است.");
    const r: ODataList<ODataRow> = await api<ODataList<ODataRow>>(url, { headers: { Prefer: "odata.maxpagesize=5000" } });
    rows.push(...(r.value || []));
    url = r["@odata.nextLink"] || null;
  }
  return rows;
}

/** Records that currently hold a given number (whole table, any month/year/source), optionally excluding one record. */
async function findHolders(meta: FieldMeta, number: string, exceptId: string | null): Promise<ODataRow[]> {
  const filter = NUM_FIELD + " eq " + numLiteral(meta, number) + (exceptId ? " and opportunityid ne " + exceptId : "");
  const r = await api<ODataList<ODataRow>>("opportunities?$select=opportunityid,createdon,modifiedon&$top=50&$filter=" + encodeURIComponent(filter));
  return r.value || [];
}

type SortKey = [number, string];
const sortKey = (r: ODataRow, f: string): SortKey => [Date.parse(r[f]) || 0, cleanId(r.opportunityid)];
const keyLess = (a: SortKey, b: SortKey): boolean => (a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1]);
const asText = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/**
 * Assigns the next monthly number to an EXISTING opportunity (PATCH only, never creates a record).
 * - month = Persian month of the record's own `createdon` (Tehran time)
 * - sequence = rank of the record among all opportunities created that Persian month (createdon, then GUID), skipping numbers already used
 * - a non-empty number is never overwritten; collisions are detected after the write and resolved by re-assigning (bounded retries)
 * Throws when the number could not be confirmed in CRM.
 */
export async function assignOpportunityNumber(oppId: string): Promise<NumberAssignment> {
  const id = cleanId(oppId);
  const meta = await numMeta();
  let own: string | null = null; // the number THIS run wrote (only that value may be replaced by this run)
  const taken = new Set<number>(); // sequences found to be in use by another record
  let collisions = 0;
  for (let attempt = 1; attempt <= NUM_MAX_ATTEMPTS; attempt++) {
    const rec = await api("opportunities(" + id + ")?$select=" + NUM_FIELD + ",createdon,modifiedon");
    const cur = asText(rec[NUM_FIELD]);
    if (cur && cur !== own) return { number: cur, existing: true, seq: null, attempts: attempt, collisions };
    if (!cur) own = null;
    const created = new Date(rec.createdon);
    if (isNaN(created.getTime())) throw new Error("createdon رکورد نامعتبر است.");
    const { jy, jm } = persianMonthOf(created);
    if (jy % 10 === 0 && meta.numeric) throw new Error("فیلد عددی است و رقم سال (۰) صفر پیشین را نگه نمی‌دارد؛ فیلد باید از نوع متن باشد.");
    const prefix = numPrefix(jy, jm);
    const rows = await fetchMonthRows(persianMonthBounds(jy, jm));
    const me = sortKey(rec, "createdon");
    let rank = 1;
    const used = new Set<number>();
    for (const r of rows) {
      if (cleanId(r.opportunityid) === id) continue; // the new record is in the query result: exclude it
      if (keyLess(sortKey(r, "createdon"), me)) rank++;
      for (const f of [NUM_FIELD, NUM_LEGACY]) {
        const s = asText(r[f]);
        if (s.length === 7 && s.indexOf(prefix) === 0) used.add(parseInt(s.slice(3), 10));
      }
    }
    let seq = rank;
    let num: string | null = null;
    for (let probe = 0; probe < 30; probe++) {
      while (used.has(seq) || taken.has(seq)) seq++;
      if (seq > NUM_MAX_SEQ) throw new Error("ظرفیت شماره‌ی این ماه (" + NUM_MAX_SEQ + ") پر شده است.");
      const cand = numFormat(jy, jm, seq);
      const dup = await findHolders(meta, cand, id); // exact-value check across the whole table
      if (!dup.length) { num = cand; break; }
      taken.add(seq);
    }
    if (!num) throw new Error("شماره‌ی آزاد پیدا نشد (برخورد مکرر).");
    const headers: Record<string, string> = rec["@odata.etag"] ? { "If-Match": rec["@odata.etag"] } : {};
    try {
      await api("opportunities(" + id + ")", { method: "PATCH", headers, body: JSON.stringify({ [NUM_FIELD]: numValue(meta, num) }) });
    } catch (e) {
      if (e instanceof ApiError && e.status === 412) continue; // record changed since we read it: re-read and decide again
      throw e;
    }
    own = num;
    // verify: did someone else get the same number at the same time?
    const holders = await findHolders(meta, num, null);
    const mine = holders.find((x) => cleanId(x.opportunityid) === id);
    const others = holders.filter((x) => cleanId(x.opportunityid) !== id);
    if (mine && !others.length) return { number: num, existing: false, seq, attempts: attempt, collisions };
    if (!mine) throw new Error("بعد از ثبت، شماره‌ی " + num + " روی رکورد دیده نشد.");
    const myKey = sortKey(mine, "modifiedon");
    if (others.every((o) => keyLess(myKey, sortKey(o, "modifiedon")))) return { number: num, existing: false, seq, attempts: attempt, collisions: collisions + 1 }; // the other writer yields
    collisions++; // I wrote later: give the number up and pick another
    taken.add(seq);
  }
  // out of attempts: never leave a known duplicate behind
  if (own) {
    try {
      const rec = await api("opportunities(" + id + ")?$select=" + NUM_FIELD);
      if (String(rec[NUM_FIELD]) === own) await api("opportunities(" + id + ")", { method: "PATCH", body: JSON.stringify({ [NUM_FIELD]: null }) });
    } catch (e) { console.warn("release duplicate number failed:", e); }
  }
  throw new NumberCollisionError("به دلیل برخورد مکرر با ایجاد هم‌زمان فرصت‌ها، شماره‌ی یکتا تأیید نشد.");
}

/** Exposed on `window.__dyOppNumber` (used by the development tests and handy in the console). */
export interface OppNumberApi {
  assign: typeof assignOpportunityNumber;
  persianMonthOf: typeof persianMonthOf;
  persianMonthBounds: typeof persianMonthBounds;
  numFormat: typeof numFormat;
  tehranMidnightUtc: typeof tehranMidnightUtc;
  PC: typeof PC;
  NUM_FIELD: string;
}

export const oppNumberApi: OppNumberApi = {
  assign: assignOpportunityNumber, persianMonthOf, persianMonthBounds, numFormat, tehranMidnightUtc, PC, NUM_FIELD,
};
