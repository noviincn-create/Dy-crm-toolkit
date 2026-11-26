// Invoice print test (development only). Needs Playwright + Chromium:  npx playwright install chromium
// Mocks Xrm and the Dynamics Web API, checks data mapping/totals, Ctrl+P and beforeprint, and writes invoice.pdf / invoice.png.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

// Usage: tsx tests/invoice.test.ts dist/content/invoice.js [out-dir]
const root = path.resolve(import.meta.dirname, '..');
const script = fs.readFileSync(path.resolve(process.argv[2] || path.join(root, 'dist/content/invoice.js')), 'utf8');
const out = path.resolve(process.argv[3] || '.');
const font = path.join(root, 'public/invoice/Vazirmatn.woff2');
const ORIGIN = 'https://test.crm.systan.com';
const OPP = '11111111-2222-3333-4444-555555555555';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const ANN = 'OData.Community.Display.V1.FormattedValue';
const data = {
  ['opportunities(' + OPP + ')']: { new_opportunitynumbertext: '5080293', _customerid_value: 'acc1', ['_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname']: 'account', discountamount: 0, freightamount: 0 },
  'accounts(acc1)': { name: 'شرکت نمونه پارس', systan_nationalidbase: '10101234567', telephone1: '05138000000', address1_composite: 'مشهد\nبلوار وکیل‌آباد', address1_city: 'مشهد', address1_stateorprovince: 'خراسان رضوی', address1_postalcode: '9187654321' },
  'opportunityproducts': { value: [
    { lineitemnumber: 1, _productid_value: 'p1', ['_productid_value@' + ANN]: 'پرینت لیزری تا A4 سیاه وسفید تک رو', ['_uomid_value@' + ANN]: 'عدد', quantity: 3, priceperunit: 150000, baseamount: 450000, manualdiscountamount: 0, tax: 0, createdon: '2026-11-01' },
    { lineitemnumber: 2, _productid_value: 'p2', ['_productid_value@' + ANN]: 'بازیابی رمز', ['_uomid_value@' + ANN]: 'عدد', quantity: 1, priceperunit: 510000, baseamount: 510000, manualdiscountamount: 10000, tax: 0, createdon: '2026-11-01' },
    { lineitemnumber: 3, productname: 'هر ابلاغیه', ['_uomid_value@' + ANN]: 'عدد', quantity: 1, priceperunit: 510000, baseamount: 510000, manualdiscountamount: 0, tax: 0, createdon: '2026-11-01' }
  ] },
  'products': { value: [{ productid: 'p1', productnumber: '015' }, { productid: 'p2', productnumber: '010' }] }
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const requests: string[] = [];
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/main.aspx') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="dy-fab"><button class="dy-fh"></button></div><div id="app">CRM SCREEN</div></body></html>' });
    if (u.pathname === '/font.woff2') return route.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(font) });
    const m = u.pathname.match(/\/api\/data\/v9\.1\/(.*)$/);
    if (m) {
      const key = decodeURIComponent(m[1]);
      requests.push(key + u.search);
      const body = data[key] || data[key.split('?')[0]];
      return body ? route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }) : route.fulfill({ status: 404, body: '{"error":{"message":"nf"}}' });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto(ORIGIN + '/main.aspx');
  await page.evaluate(([opp, origin, fontUrl]) => {
    (window as any).__prints = 0; window.print = () => { (window as any).__prints++; };
    (window as any).Xrm = { Page: { data: { getIsDirty: () => false, entity: { getEntityName: () => 'opportunity', getId: () => '{' + opp.toUpperCase() + '}' } } },
      Utility: { getGlobalContext: () => ({ getClientUrl: () => origin }) } };
    document.documentElement.setAttribute('data-dy-invoice', JSON.stringify({ cfg: {}, font: origin + '/font.woff2' }));
  }, [OPP, ORIGIN, '']);
  await page.addScriptTag({ content: script });
  await page.waitForFunction(() => document.getElementById('dy-inv-btn'), null, { timeout: 5000 });
  ok(true, 'print button added to the fab');

  // Ctrl+P -> fetch + window.print
  await page.keyboard.press('Control+p');
  await page.waitForFunction(() => (window as any).__prints > 0, null, { timeout: 5000 });
  ok(true, 'Ctrl+P intercepted and window.print() called after fetch');

  // beforeprint renders the invoice; print media shows only it
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const html = await page.evaluate(() => document.getElementById('dy-inv-root')!.innerText);
  ok(html.includes('۵۰۸۰۲۹۳'), 'invoice number (Persian digits)');
  ok(html.includes('پرینت لیزری تا A4 سیاه وسفید تک رو') && html.includes('هر ابلاغیه'), 'product names incl. write-in product');
  ok(html.includes('۰۱۵') && html.includes('۰۱۰'), 'product codes');
  ok(html.includes('۱,۴۶۰,۰۰۰'), 'payable = 450000+500000+510000 = 1,460,000');
  ok(html.includes('۱۰,۰۰۰'), 'discount shown');
  ok(html.includes('شماره سریال') && html.includes('مهر و امضاء خریدار') && html.includes('شرایط و نحوه فروش'), 'standard form labels');
  ok(html.includes('شرکت نمونه پارس') && html.includes('۱۰۱۰۱۲۳۴۵۶۷') && html.includes('مشهد، بلوار وکیل‌آباد'), 'buyer block (account, composite address flattened)');
  ok(html.includes('کافی نت نوین') && html.includes('۱۴۰۴۳۵۲۰۰۲'), 'seller defaults');
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const sample = '۱۲۳ صورتحساب';
    const r = await Promise.all([document.fonts.load('12px "DY Yekan Emb"', sample), document.fonts.load('12px "DY Titr Emb"', sample)]);
    return { yekan: r[0].length > 0, titr: r[1].length > 0 };
  });
  ok(fonts.yekan && fonts.titr, 'embedded Yekan + B Titr fonts load (data URI)');
  await page.emulateMedia({ media: 'print' });
  const visible = await page.evaluate(() => ({ app: getComputedStyle(document.getElementById('app')!).display, root: getComputedStyle(document.getElementById('dy-inv-root')!).display }));
  ok(visible.app === 'none' && visible.root === 'block', 'print media: CRM hidden, invoice visible');
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: path.join(out, 'invoice.pdf'), preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  const after = await page.evaluate(() => ({ cls: document.documentElement.classList.contains('dy-inv-on'), app: getComputedStyle(document.getElementById('app')!).display }));
  ok(!after.cls && after.app === 'block', 'afterprint restores the CRM screen');

  // screenshot of the invoice as laid out for print
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  await page.setViewportSize({ width: 1123, height: 794 });
  await page.screenshot({ path: path.join(out, 'invoice.png'), fullPage: true });

  // non-opportunity form: Ctrl+P untouched
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => { window.dispatchEvent(new Event('afterprint')); (window as any).__prints = 0; (window as any).Xrm.Page.data.entity.getEntityName = () => 'account'; });
  await page.waitForFunction(() => !document.getElementById('dy-inv-btn'), null, { timeout: 3000 });
  ok(true, 'button removed on non-opportunity forms');
  const prevented = await page.evaluate(() => { const e = new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', ctrlKey: true, cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  ok(!prevented, 'Ctrl+P not intercepted on other entities');

  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
