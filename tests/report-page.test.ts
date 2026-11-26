// Standalone dashboard page (extension page): data through the CRM address with cookies, record links, close = close tab.
// Usage: tsx tests/report-page.test.ts dist/report/page.js
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const CODE = fs.readFileSync(process.argv[2] || 'dist/report/page.js', 'utf8');
let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٬,\s]/g, '');

const sample = (n: number) => ({
  opportunityproductid: 'p' + n, quantity: 2, baseamount: 1000000 * n, tax: 0, extendedamount: 900000 * n, priceperunit: 500000 * n,
  productid: { name: 'محصول ' + n },
  opportunityid: { opportunityid: '11111111-2222-3333-4444-55555555555' + n, name: 'فرصت ' + n, actualclosedate: new Date().toISOString(), createdon: new Date().toISOString(),
    '_customerid_value@OData.Community.Display.V1.FormattedValue': 'مشتری ' + n, '_ownerid_value@OData.Community.Display.V1.FormattedValue': 'کارشناس' },
});

function boot(opts: { stored?: any; fetchImpl?: (u: string, init: any) => Promise<any> } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'chrome-extension://abc/report.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w: any = dom.window;
  const calls: { url: string; init: any }[] = [];
  const removed: number[] = [];
  w.fetch = opts.fetchImpl ?? (async (url: string, init: any) => {
    calls.push({ url, init });
    const body = calls.length === 1 ? { value: [sample(1), sample(2)] } : { value: [] };
    return { ok: true, status: 200, statusText: 'OK', headers: { get: () => 'application/json' }, json: async () => body };
  });
  w.chrome = {
    storage: { local: { get: async (d: any) => ({ ...d, ...(opts.stored ?? {}) }) } },
    tabs: { getCurrent: async () => ({ id: 42 }), remove: async (id: number) => { removed.push(id); } },
  };
  w.eval(CODE);
  return { w, calls, removed };
}

(async () => {
  const { w, calls, removed } = boot();
  await sleep(200);
  const doc = w.document;
  ok(!!doc.getElementById('dy-report') && doc.title === 'داشبورد فروش نوین', 'the page renders the dashboard');
  ok(calls.length === 2 && calls[0]!.url.startsWith('https://novincn.crm.systan.com/api/data/v9.1/opportunityproducts?'), 'reads the Web API of the default CRM address: ' + calls[0]?.url.slice(0, 60));
  ok(calls.every((c) => c.init.credentials === 'include'), 'requests carry the browser cookies (credentials: include)');
  ok(latin(doc.querySelector('.kpi-value').textContent).startsWith('2700000'), 'KPI total revenue');
  (doc.querySelector('#rp-tbody tr[data-i]') as HTMLElement).click();
  ok((doc.querySelector('#rp-modal a')?.getAttribute('href') ?? '').startsWith('https://novincn.crm.systan.com/main.aspx?etn=opportunity&pagetype=entityrecord&id=1111'), 'drill-down links point to the CRM, not to the extension page');
  doc.getElementById('rp-modal-close').click();
  doc.getElementById('rp-close').click();
  await sleep(30);
  ok(removed.length === 1 && removed[0] === 42, 'Close button closes this tab');

  // a CRM address saved in the settings wins
  const s = boot({ stored: { quickCfg: { crmUrl: 'https://other.crm.systan.com/' } } });
  await sleep(150);
  ok(s.calls[0]?.url.startsWith('https://other.crm.systan.com/api/data/v9.1/'), 'uses the CRM address from the extension settings');

  // not signed in / CRM unreachable → a clear message with the CRM address
  const f = boot({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await sleep(150);
  const err = f.w.document.getElementById('rp-error').textContent;
  ok(/وارد CRM شوید/.test(err) && err.includes('https://novincn.crm.systan.com'), 'network failure → sign-in hint: ' + err.slice(0, 40));
  ok(f.w.document.getElementById('rp-loading').style.display === 'none', 'loading overlay hidden after the error');

  // HTML sign-in page instead of JSON
  const h = boot({ fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, json: async () => ({}) }) });
  await sleep(150);
  ok(/به CRM وارد نشده‌اید/.test(h.w.document.getElementById('rp-error').textContent), 'HTML login page is detected');
  console.log(fails ? 'FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
