/** Product matching shared by the CRM-page product dialog and the quick-session popup (pure: no DOM, no Xrm). */

const FA = "۰۱۲۳۴۵۶۷۸۹";
const AR = "٠١٢٣٤٥٦٧٨٩";

/** Normalises Persian/Arabic letter variants, digits, ZWNJ, diacritics so "كارت" == "کارت", "۱۲۰" == "120". */
export const normQ = (s: unknown): string => String(s || "").toLowerCase()
  .replace(/[يىئ]/g, "ی").replace(/ك/g, "ک").replace(/[ۀة]/g, "ه").replace(/[أإآ]/g, "ا")
  .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
  .replace(/[‌​ـً-ٟ]/g, "")
  .replace(/\s+/g, " ").trim();

export interface Searchable {
  key: string;
  nameKey: string;
}

/** The pre-normalised keys `searchProducts` matches against. */
export const searchKeys = (name: string, num: string | null | undefined): Searchable => ({
  key: normQ(name + " " + (num || "")),
  nameKey: normQ(name),
});

export function searchProducts<T extends Searchable>(list: T[], q: string, limit = 40): T[] {
  const toks = normQ(q).split(" ").filter(Boolean);
  if (!toks.length) return list.slice(0, limit);
  const res: Array<{ p: T; score: number }> = [];
  for (const p of list) {
    let score = 0;
    let ok = true;
    for (const t of toks) {
      const i = p.key.indexOf(t);
      if (i < 0) { ok = false; break; }
      score += i === 0 || p.key[i - 1] === " " ? 3 : 1; // word-start matches rank higher
    }
    if (!ok) continue;
    if (p.nameKey.startsWith(toks[0]!)) score += 5;
    if (p.nameKey === toks.join(" ")) score += 10;
    res.push({ p, score: score - p.nameKey.length / 1000 });
  }
  res.sort((a, b) => b.score - a.score);
  return res.slice(0, limit).map((r) => r.p);
}
