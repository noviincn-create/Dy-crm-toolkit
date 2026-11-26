// Invoice data mapping / totals / rendering without a browser (jsdom). The Playwright test (invoice.test.ts) additionally checks print media + PDF.
// Usage: tsx tests/invoice-render.test.ts dist/content/invoice.js
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const CODE = fs.readFileSync(process.argv[2] || 'dist/content/invoice.js', 'utf8');
const ORIGIN = 'https://test.crm.systan.com';
const OPP = '11111111-2222-3333-4444-555555555555';
const ANN = 'OData.Community.Display.V1.FormattedValue';
let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const data: Record<string, any> = {
  ['opportunities(' + OPP + ')']: { new_opportunitynumbertext: '5080293', _customerid_value: 'acc1', ['_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname']: 'account', discountamount: 0, freightamount: 0 },
  'accounts(acc1)': { name: 'شرکت نمونه پارس', systan_nationalidbase: '10101234567', telephone1: '05138000000', address1_composite: 'مشهد\nبلوار وکیل‌آباد', address1_city: 'مشهد', address1_stateorprovince: 'خراسان رضوی', address1_postalcode: '9187654321' },
  'opportunityproducts': { value: [
    { lineitemnumber: 1, _productid_value: 'p1', ['_productid_value@' + ANN]: 'پرینت لیزری تا A4 سیاه وسفید تک رو', ['_uomid_value@' + ANN]: 'عدد', quantity: 3, priceperunit: 150000, baseamount: 450000, manualdiscountamount: 0, tax: 0, createdon: '2026-11-01' },
    { lineitemnumber: 2, _productid_value: 'p2', ['_productid_value@' + ANN]: 'بازیابی رمز', ['_uomid_value@' + ANN]: 'عدد', quantity: 1, priceperunit: 510000, baseamount: 510000, manualdiscountamount: 10000, tax: 0, createdon: '2026-11-01' },
    { lineitemnumber: 3, productname: 'هر ابلاغیه', ['_uomid_value@' + ANN]: 'عدد', quantity: 1, priceperunit: 510000, baseamount: 510000, manualdiscountamount: 0, tax: 0, createdon: '2026-11-01' },
  ] },
  'products': { value: [{ productid: 'p1', productnumber: '015' }, { productid: 'p2', productnumber: '010' }] },
};

const dom = new JSDOM('<!doctype html><html><body><div id="dy-fab"><button class="dy-fh"></button></div><div id="app">CRM</div></body></html>', { url: ORIGIN + '/main.aspx', runScripts: 'outside-only', pretendToBeVisual: true });
const w: any = dom.window;
let prints = 0;
w.print = () => { prints++; };
w.fetch = async (url: string) => {
  const m = new URL(url).pathname.match(/\/api\/data\/v9\.1\/(.*)$/);
  const key = m ? decodeURIComponent(m[1]!) : '';
  const body = data[key] || data[key.split('?')[0]!];
  return { ok: !!body, status: body ? 200 : 404, statusText: '', json: async () => body || { error: { message: 'nf' } } };
};
w.Xrm = { Page: { data: { getIsDirty: () => false, entity: { getEntityName: () => 'opportunity', getId: () => '{' + OPP.toUpperCase() + '}' } } }, Utility: { getGlobalContext: () => ({ getClientUrl: () => ORIGIN }) } };
w.document.documentElement.setAttribute('data-dy-invoice', JSON.stringify({ cfg: {}, font: '' }));
w.eval(CODE);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (f: () => any, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = f(); if (v) return v; await sleep(20); } return null; };

(async () => {
  ok(!!(await waitFor(() => w.document.getElementById('dy-inv-btn'))), 'print button added to the fab');

  const ev = new w.KeyboardEvent('keydown', { key: 'p', code: 'KeyP', ctrlKey: true, cancelable: true, bubbles: true });
  w.dispatchEvent(ev);
  ok(ev.defaultPrevented, 'Ctrl+P intercepted on an opportunity form');
  ok(!!(await waitFor(() => prints > 0)), 'window.print() called after the data was fetched');

  w.dispatchEvent(new w.Event('beforeprint'));
  const html: string = w.document.getElementById('dy-inv-root').textContent;
  ok(html.includes('۵۰۸۰۲۹۳'), 'invoice number (Persian digits)');
  ok(html.includes('پرینت لیزری تا A4 سیاه وسفید تک رو') && html.includes('هر ابلاغیه'), 'product names incl. write-in product');
  ok(html.includes('۰۱۵') && html.includes('۰۱۰'), 'product codes');
  ok(html.includes('۱,۴۶۰,۰۰۰'), 'payable = 450000+500000+510000 = 1,460,000');
  ok(html.includes('۱۰,۰۰۰'), 'discount shown');
  ok(html.includes('شماره سریال') && html.includes('مهر و امضاء خریدار') && html.includes('شرایط و نحوه فروش'), 'standard form labels');
  ok(html.includes('شرکت نمونه پارس') && html.includes('۱۰۱۰۱۲۳۴۵۶۷') && html.includes('مشهد، بلوار وکیل‌آباد'), 'buyer block (account, composite address flattened)');
  ok(html.includes('کافی نت نوین') && html.includes('۱۴۰۴۳۵۲۰۰۲'), 'seller defaults');
  ok(w.document.documentElement.classList.contains('dy-inv-on'), 'beforeprint activates the invoice');
  w.dispatchEvent(new w.Event('afterprint'));
  ok(!w.document.documentElement.classList.contains('dy-inv-on'), 'afterprint restores the CRM screen');

  w.Xrm.Page.data.entity.getEntityName = () => 'account';
  ok(!!(await waitFor(() => !w.document.getElementById('dy-inv-btn'), 3000)), 'button removed on non-opportunity forms');
  const ev2 = new w.KeyboardEvent('keydown', { key: 'p', code: 'KeyP', ctrlKey: true, cancelable: true });
  w.dispatchEvent(ev2);
  ok(!ev2.defaultPrevented, 'Ctrl+P not intercepted on other entities');

  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
