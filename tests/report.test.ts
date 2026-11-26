// Sales dashboard + novinvn:// routing.
// Usage: tsx tests/report.test.ts dist/content/report.js dist/content/report-bridge.js
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { parseNovinvn, routeFromLocation, routeUrl, withoutRoute } from '../src/shared/novinvn';
import { periodRange, previousRange, startUtc, endUtc, jtextFromIso } from '../src/report/dates';
import { groupRecords, totalsOf, normalizeRecord, buildQuery } from '../src/report/data';

const CODE = fs.readFileSync(process.argv[2] || 'dist/content/report.js', 'utf8');
const BRIDGE = fs.readFileSync(process.argv[3] || 'dist/content/report-bridge.js', 'utf8');
let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٬,\s]/g, '');

// ───────────── routing (pure) ─────────────
ok(parseNovinvn('novinvn://report') === 'report', 'novinvn://report');
ok(parseNovinvn('NOVINVN://Report/') === 'report', 'case-insensitive + trailing slash');
ok(parseNovinvn('novinvn:report?x=1') === 'report', 'novinvn:report?x=1');
ok(parseNovinvn('https://x/report') === null && parseNovinvn('novinvn://') === null && parseNovinvn('') === null, 'other input rejected');
ok(routeFromLocation({ search: '?appid=1&novinvn=report', hash: '' }) === 'report', '?novinvn=report');
ok(routeFromLocation({ search: '', hash: '#novinvn=report' }) === 'report', '#novinvn=report');
ok(routeFromLocation({ search: '?novinvn=novinvn%3A%2F%2Freport', hash: '' }) === 'report', 'full scheme as value');
ok(routeFromLocation({ search: '?novinvn=../x', hash: '' }) === null && routeFromLocation({ search: '?a=1', hash: '' }) === null, 'junk route rejected');
ok(routeUrl('https://a.crm.systan.com/', 'report') === 'https://a.crm.systan.com/#novinvn=report', 'routeUrl');
ok(withoutRoute('https://a/main.aspx?appid=1&novinvn=report#x') === 'https://a/main.aspx?appid=1#x', 'param removed, rest kept');

// ───────────── dates (pure) ─────────────
const now = new Date('2026-11-26T03:00:00Z'); // 1405/09/05 in Tehran
ok(jtextFromIso('2026-11-26') === '۱۴۰۵/۰۹/۰۵', 'Gregorian → Jalali: ' + jtextFromIso('2026-11-26'));
ok(JSON.stringify(periodRange('thisMonth', now)) === '["2026-11-22","2026-11-26"]', 'this Persian month = Azar 1 .. today');
ok(JSON.stringify(periodRange('lastMonth', now)) === '["2026-10-23","2026-11-21"]', 'last Persian month (Aban, 30 days): ' + JSON.stringify(periodRange('lastMonth', now)));
ok(periodRange('thisYear', now)![0] === '2026-03-21', 'this Persian year starts 1405/01/01 = 2026-03-21');
ok(JSON.stringify(periodRange('lastYear', now)) === '["2025-03-21","2026-03-20"]', 'last Persian year');
ok(JSON.stringify(previousRange('2026-11-22', '2026-11-26')) === '["2026-11-17","2026-11-21"]', 'previous range, same length');
ok(previousRange('', '2026-11-26') === null && periodRange('custom', now) === null, 'unbounded / custom → null');
ok(startUtc('2026-11-26') === '2026-11-25T20:30:00Z' && endUtc('2026-11-26') === '2026-11-26T20:30:00Z', 'Tehran midnights (UTC+03:30): ' + startUtc('2026-11-26'));
ok(buildQuery('close', '2026-11-22', '2026-11-26').includes('actualclosedate+ge+2026-11-21T20%3A30%3A00Z') || decodeURIComponent(buildQuery('close', '2026-11-22', '2026-11-26')).includes('opportunityid/actualclosedate ge 2026-11-21T20:30:00Z'), 'query uses the close date and Tehran bounds');
ok(!buildQuery('created', '', '').includes('ge '), 'unbounded period → no date filter');

// ───────────── aggregation (pure) ─────────────
const rec = (id: string, opp: string, prod: string, qty: number, base: number, tax: number, ext: number, cust: string) => normalizeRecord({
  opportunityproductid: id, quantity: qty, baseamount: base, tax, extendedamount: ext, priceperunit: base / qty,
  productid: { name: prod }, opportunityid: { opportunityid: opp, name: 'فرصت ' + opp, actualclosedate: '2026-11-25T10:00:00Z', createdon: '2026-11-01T10:00:00Z', '_customerid_value@OData.Community.Display.V1.FormattedValue': cust },
}, 'close');
const rows = [rec('1', 'o1', 'اینترنت', 2, 1_000_000, 90_000, 990_000, 'علی'), rec('2', 'o1', 'پرینت', 1, 500_000, 0, 500_000, 'علی'), rec('3', 'o2', 'اینترنت', 3, 3_000_000, 0, 3_000_000, 'رضا')];
ok(rows[0]!.discount === 100_000, 'discount = base + tax − extended');
const t = totalsOf(rows);
ok(t.revenue === 4_490_000 && t.opps === 2 && t.products === 2 && t.customers === 2 && t.avgDeal === 2_245_000, 'totals');
const g = groupRecords(rows, 'product').sort((a, b) => b.revenue - a.revenue);
ok(g[0]!.name === 'اینترنت' && g[0]!.oppCount === 2 && Math.round(g[0]!.share) === 89, 'grouping by product');
ok(groupRecords(rows, 'customer').length === 2 && groupRecords(rows, 'opportunity').length === 2, 'grouping by customer / opportunity');

// ───────────── the dashboard in a page ─────────────
const quiet = new VirtualConsole();
const sample = (n: number) => ({
  opportunityproductid: 'p' + n, quantity: 2, baseamount: 1000000 * n, tax: 0, extendedamount: 900000 * n, priceperunit: 500000 * n,
  productid: { name: 'محصول ' + n },
  opportunityid: { opportunityid: '11111111-2222-3333-4444-55555555555' + n, name: 'فرصت ' + n, actualclosedate: new Date().toISOString(), createdon: new Date().toISOString(),
    '_customerid_value@OData.Community.Display.V1.FormattedValue': 'مشتری ' + n, '_ownerid_value@OData.Community.Display.V1.FormattedValue': 'کارشناس' },
});

function boot(url: string, opts: { fail?: boolean } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: quiet });
  const w: any = dom.window;
  const calls: string[] = [];
  w.fetch = async (u: string) => {
    calls.push(u);
    if (opts.fail) return { ok: false, status: 403, statusText: 'Forbidden', headers: { get: () => 'application/json' }, json: async () => ({ error: { message: 'no privilege' } }) };
    const body = calls.length === 1 ? { value: [sample(1), sample(2)], '@odata.nextLink': 'https://novincn.crm.systan.com/api/data/v9.1/opportunityproducts?$skiptoken=2' }
      : calls.length === 2 ? { value: [sample(3)] } : { value: [] };
    return { ok: true, status: 200, statusText: 'OK', headers: { get: () => 'application/json' }, json: async () => body };
  };
  let listener: any = null;
  w.chrome = { runtime: { onMessage: { addListener: (f: any) => { listener = f; } } } };
  w.eval(CODE);
  w.eval(BRIDGE);
  return { w, calls, message: (m: any) => { let r: any; listener(m, {}, (x: any) => { r = x; }); return r; } };
}

(async () => {
  // 1. URL trigger
  const { w, calls } = boot('https://novincn.crm.systan.com/main.aspx?appid=1&novinvn=report');
  await sleep(150);
  const doc = w.document;
  ok(!!doc.getElementById('dy-report'), 'novinvn=report in the URL opens the dashboard');
  ok(!/novinvn/.test(w.location.href) && /appid=1/.test(w.location.href), 'parameter removed from the address bar');
  ok(calls.length === 3 && calls[1].includes('skiptoken=2'), 'follows @odata.nextLink (2 pages) + 1 call for the previous period: ' + calls.length);
  const kpis = [...doc.querySelectorAll('.kpi-value')].map((e: any) => e.textContent);
  ok(latin(kpis[0]).startsWith('5400000'), 'KPI: total revenue 5,400,000 rial → ' + kpis[0]);
  ok(latin(kpis[1]) === '3', 'KPI: 3 opportunities');
  ok(doc.querySelectorAll('#rp-tbody tr[data-i]').length === 3, 'table: one row per product');
  ok(doc.querySelectorAll('#rp-trend .bar').length >= 1 && !!doc.querySelector('.donut'), 'trend chart + donut rendered');
  ok(/دوره قبل/.test(doc.querySelector('.kpi .delta')?.textContent ?? ''), 'previous period comparison shown');
  // drill-down
  (doc.querySelector('#rp-tbody tr[data-i]') as HTMLElement).click();
  ok(doc.getElementById('rp-modal').style.display === 'grid' && /opportunity&pagetype=entityrecord&id=1111/.test(doc.querySelector('#rp-modal a')?.getAttribute('href') ?? ''), 'row click → drill-down with a link to the record');
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  ok(doc.getElementById('rp-modal').style.display === 'none', 'Esc closes the drill-down');
  // group by customer + currency
  (doc.querySelector('[data-dim="customer"]') as HTMLElement).click();
  ok(/مشتری/.test(doc.getElementById('rp-th-name').textContent), 'switch to grouping by customer');
  const cur = doc.getElementById('rp-currency'); cur.value = 'تومان'; cur.dispatchEvent(new w.Event('change'));
  ok(latin(doc.querySelector('.kpi-value').textContent).startsWith('540000') && /تومان/.test(doc.querySelector('.kpi-value').textContent), 'toman = rial / 10');
  // exports
  let blobs = 0; w.URL.createObjectURL = () => { blobs++; return 'blob:x'; }; w.URL.revokeObjectURL = () => {};
  doc.getElementById('rp-csv').click(); doc.getElementById('rp-export').click();
  ok(blobs === 2, 'CSV + Excel export build a file');
  // close + reopen through the event (omnibox path)
  doc.getElementById('rp-close').click();
  ok(!doc.getElementById('dy-report') && !doc.getElementById('dy-report-css'), 'close removes the dashboard and its style');
  doc.defaultView.eval("document.dispatchEvent(new CustomEvent('dy-report-open'))");
  await sleep(100);
  ok(!!doc.getElementById('dy-report'), 'dy-report-open event reopens it');
  ok(doc.getElementById('rp-currency').value === 'تومان', 'settings are remembered (currency)');

  doc.getElementById('rp-close').click();
})().then(async () => {
  const b = boot('https://novincn.crm.systan.com/main.aspx?pagetype=entitylist&etn=opportunity');
  await sleep(50);
  ok(!b.w.document.getElementById('dy-report'), 'a normal CRM page does not open the dashboard');
  ok(b.message({ type: 'other' }) === undefined, 'bridge ignores other messages');
  ok(b.message({ type: 'reportOpen' })?.ok === true, 'bridge acknowledges reportOpen');
  await sleep(100);
  ok(!!b.w.document.getElementById('dy-report'), 'reportOpen message opens the dashboard');
  // link click
  b.w.document.getElementById('rp-close').click();
  const a = b.w.document.createElement('a'); a.setAttribute('href', 'novinvn://report'); a.textContent = 'x'; b.w.document.body.appendChild(a);
  const ev = new b.w.MouseEvent('click', { bubbles: true, cancelable: true }); a.dispatchEvent(ev);
  await sleep(100);
  ok(ev.defaultPrevented && !!b.w.document.getElementById('dy-report'), 'clicking a novinvn://report link opens it');
  // errors are shown
  const f = boot('https://novincn.crm.systan.com/main.aspx?novinvn=report', { fail: true });
  await sleep(150);
  ok(/no privilege/.test(f.w.document.getElementById('rp-error').textContent), 'API errors are shown in the dashboard');
  ok(f.w.document.getElementById('rp-loading').style.display === 'none', 'loading overlay hidden after an error');
  // the form the OS handler / omnibox open: CRM root + #fragment
  const hsh = boot('https://novincn.crm.systan.com/#novinvn=report');
  await sleep(150);
  ok(!!hsh.w.document.getElementById('dy-report') && !/novinvn/.test(hsh.w.location.href), '#novinvn=report opens the dashboard and is removed from the address');
  // unknown routes do nothing
  const u = boot('https://novincn.crm.systan.com/main.aspx?novinvn=nothing');
  await sleep(50);
  ok(!u.w.document.getElementById('dy-report'), 'unknown route ignored');
  console.log(fails ? 'FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
});
