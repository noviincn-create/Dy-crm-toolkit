import fs from 'node:fs';
import { JSDOM } from 'jsdom';

// Usage: tsx tests/quick.test.ts dist/content/quick.js — the quick-session content script (hotkeys + popups) on a NON-CRM page.
const CODE = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const eq = (a, b, m) => ok(a === b, m + (a === b ? '' : ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(f, ms = 3000) { const t = Date.now(); while (Date.now() - t < ms) { const v = f(); if (v) return v; await sleep(10); } return null; }

const MAIN = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const P1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const P2 = 'aaaaaaaa-0000-4000-8000-000000000002';

function boot(cfg: any = {}, bgOver: any = {}) {
  const dom = new JSDOM('<!doctype html><html><body><input id="page-input"></body></html>', { url: 'https://example.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w: any = dom.window;
  w.Element.prototype.scrollIntoView = function () {}; // not implemented by jsdom
  w.__dyQuickTest = true; // lets the test send untrusted key events and inspect the (normally closed) shadow tree
  const calls: any[] = [];
  const bg = {
    bootstrap: () => ({ crmUrl: 'https://novincn.crm.systan.com', priceLevels: [{ id: OTHER, name: 'لیست عمده' }, { id: MAIN, name: 'قیمت اصلی' }], mainPriceLevelId: MAIN,
      products: [{ id: P1, name: 'پرینت A4 رنگی', num: 'PR-001', price: 1000, uom: null, uomName: '' }, { id: P2, name: 'ساعت بازی', num: 'INT-001', price: 5000, uom: null, uomName: '' }], productsAt: Date.now() }),
    prices: (r) => (r.priceLevelId === MAIN ? { [P1]: 1500, [P2]: 6000 } : {}),
    start: () => ({ oppId: 'o1', number: '5080123', sessionId: 's1', added: 2, lineErrors: [] }),
    sessions: () => ({ sessions: [
      { id: 'sm-1', oppId: 'o1', name: 'مشتری اول', number: '5080123', state: 'RUNNING', startedAt: Date.now() - 600000, activeMs: 600000 },
      { id: 'sm-2', oppId: 'o2', name: 'مشتری دوم', number: null, state: 'PAUSED', startedAt: Date.now() - 900000, activeMs: 300000 } ] }),
    end: () => ({ minutes: 10, productName: 'اینترنت', already: false, skippedPrint: false }),
    ...bgOver,
  };
  w.chrome = {
    storage: { local: { get: async (d) => ({ ...d, quickCfg: cfg }) }, onChanged: { addListener() {} } },
    runtime: { sendMessage: async (m) => { calls.push(m); if (m.type === 'quick') { try { return { ok: true, data: bg[m.req.op](m.req) }; } catch (e) { return { ok: false, message: (e as Error).message }; } } return {}; }, onMessage: { addListener(f) { w.__onMsg = f; } } },
  };
  w.eval(CODE);
  return { w, d: w.document, calls };
}

const key = (w, type, k, init: any = {}, target?) => (target ?? w).dispatchEvent(new w.KeyboardEvent(type, { key: k, bubbles: true, cancelable: true, composed: true, ...init }));
const tap = async (w, k) => { key(w, 'keydown', k); key(w, 'keyup', k); await sleep(30); };
const dlgRoot = (d) => { const hosts = [...d.documentElement.children].filter((e) => e.shadowRoot); return hosts.length ? hosts[hosts.length - 1].shadowRoot : null; };
const q = (d, s) => dlgRoot(d)?.querySelector(s);

(async () => {
  console.log('[quick: hotkeys]');
  let { w, d, calls } = boot();
  await sleep(30); // config load
  await tap(w, 'Shift');
  ok(!dlgRoot(d), 'a single Shift tap opens nothing');
  await sleep(500); // the first tap must expire
  // spaced taps
  await tap(w, 'Shift'); await sleep(500); await tap(w, 'Shift');
  ok(!dlgRoot(d), 'two taps more than 400ms apart do not open the popup');
  await sleep(500);
  // Shift + letter + Shift: not a double tap
  key(w, 'keydown', 'Shift'); key(w, 'keydown', 'A', { shiftKey: true }); key(w, 'keyup', 'A', { shiftKey: true }); key(w, 'keyup', 'Shift');
  key(w, 'keydown', 'Shift'); key(w, 'keyup', 'Shift'); await sleep(30);
  ok(!dlgRoot(d), 'Shift+letter then Shift does not open the popup');
  await sleep(500);
  // Ctrl+C then Ctrl: no popup
  key(w, 'keydown', 'Control', { ctrlKey: true }); key(w, 'keydown', 'c', { ctrlKey: true }); key(w, 'keyup', 'c', { ctrlKey: true }); key(w, 'keyup', 'Control');
  key(w, 'keydown', 'Control', { ctrlKey: true }); key(w, 'keyup', 'Control'); await sleep(30);
  ok(!dlgRoot(d), 'Ctrl+C then Ctrl does not open the end popup');
  await sleep(500);
  // mouse between taps cancels
  await tap(w, 'Shift'); d.body.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true })); await tap(w, 'Shift');
  ok(!dlgRoot(d), 'a click between the taps cancels the double tap');
  w.close();

  console.log('[quick: start popup]');
  ({ w, d, calls } = boot()); await sleep(30);
  let pageKeys = 0; d.addEventListener('keydown', () => { pageKeys++; });
  await tap(w, 'Shift'); await tap(w, 'Shift');
  ok(!!dlgRoot(d), 'double Shift on a normal website opens the popup');
  ok(/شروع جلسه/.test(q(d, 'h3').textContent), 'start popup title');
  const pl = await waitFor(() => { const s = q(d, '#qk-pl'); return s && !s.disabled ? s : null; });
  ok(!!pl, 'price list select loads');
  eq(pl.value, MAIN, 'price list defaults to the main list');
  eq(pl.options[pl.selectedIndex].textContent, 'قیمت اصلی', '...which is «قیمت اصلی»');
  const items = await waitFor(() => q(d, '#dy-plist .it') && q(d, '#dy-plist').querySelectorAll('.it'));
  eq(items && items.length, 2, 'product list shows all products');
  await waitFor(() => /1,500/.test(q(d, '#dy-plist').textContent));
  ok(/1,500/.test(q(d, '#dy-plist').textContent), 'prices come from the selected price list (1,500 not the list price 1,000)');
  // search
  const input = q(d, '#qk-q');
  input.value = 'ساعت'; input.dispatchEvent(new w.Event('input', { bubbles: true }));
  eq(q(d, '#dy-plist').querySelectorAll('.it').length, 1, 'search narrows the list');
  key(w, 'keydown', 'Enter', {}, input); // adds the highlighted product
  eq(q(d, '#qk-sel').querySelectorAll('.qk-row').length, 1, 'Enter adds the product to the selection');
  q(d, '#qk-sel [data-a="inc"]').click();
  eq(q(d, '#qk-sel .qk-step input').value, '2', 'quantity stepper works');
  input.value = ''; input.dispatchEvent(new w.Event('input', { bubbles: true }));
  q(d, '#dy-plist .it').dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  eq(q(d, '#qk-sel').querySelectorAll('.qk-row').length, 2, 'clicking a product adds it');
  ok(pageKeys === 0, 'the page never saw the keys typed into the popup');
  // start with Ctrl+Enter
  const title = q(d, '#qk-title'); title.value = 'مشتری تست';
  key(w, 'keydown', 'Enter', { ctrlKey: true }, title);
  const done = await waitFor(() => q(d, '.qk-done'));
  ok(!!done, 'Ctrl+Enter starts the session and shows the result');
  const start = calls.find((c) => c.type === 'quick' && c.req.op === 'start');
  eq(start && start.req.name, 'مشتری تست', 'start: title sent');
  eq(start && start.req.priceLevelId, MAIN, 'start: main price list sent');
  eq(JSON.stringify(start && start.req.items), JSON.stringify([{ productId: P2, qty: 2 }, { productId: P1, qty: 1 }]), 'start: chosen products + quantities sent');
  ok(/5080123/.test(done.textContent), 'result shows the opportunity number');
  key(w, 'keydown', 'Escape', {}, q(d, '#qk-close'));
  ok(!dlgRoot(d), 'Esc closes the popup');

  console.log('[quick: Esc]');
  await tap(w, 'Shift'); await tap(w, 'Shift');
  await waitFor(() => q(d, '#qk-q') && !q(d, '#qk-q').disabled);
  key(w, 'keydown', 'Escape', {}, q(d, '#qk-q'));
  ok(!dlgRoot(d), 'Esc closes the popup even while typing in the search box');
  eq(d.documentElement.querySelectorAll('div[style*="2147483647"]').length, 0, 'no leftover host element');
  // reopen via the CRM panel event
  d.dispatchEvent(new w.CustomEvent('dy-quick-open', { detail: 'start' }));
  ok(!!dlgRoot(d), 'the CRM panel button (DOM event) opens the same popup');
  key(w, 'keydown', 'Escape', {}, q(d, '#qk-title'));
  // locked while the session is being created
  let release; const gate = new Promise((r) => { release = r; });
  w.close();
  ({ w, d, calls } = boot({}, { start: () => gate.then(() => ({ oppId: 'o1', number: '1', sessionId: 's1', added: 0, lineErrors: [] })) }));
  w.chrome.runtime.sendMessage = ((orig) => async (m) => (m.type === 'quick' && m.req.op === 'start' ? (await gate, { ok: true, data: { oppId: 'o1', number: '5080124', sessionId: 's1', added: 0, lineErrors: [] } }) : orig(m)))(w.chrome.runtime.sendMessage);
  await sleep(30);
  await tap(w, 'Shift'); await tap(w, 'Shift');
  await waitFor(() => q(d, '#qk-go') && !q(d, '#qk-go').disabled);
  key(w, 'keydown', 'Enter', {}, q(d, '#qk-title'));
  await sleep(30);
  key(w, 'keydown', 'Escape', {}, q(d, '#qk-title'));
  ok(!!dlgRoot(d), 'Esc is ignored while the session is being created (no half-finished state)');
  release();
  await waitFor(() => q(d, '.qk-done'));
  ok(!!q(d, '.qk-done'), '...and the result shows when it finishes');
  w.close();

  console.log('[quick: end popup]');
  ({ w, d, calls } = boot()); await sleep(30);
  await tap(w, 'Control'); await tap(w, 'Control');
  ok(/پایان جلسه/.test(q(d, 'h3').textContent), 'double Ctrl opens the end popup');
  await waitFor(() => q(d, '#dy-slist .it'));
  const rows = q(d, '#dy-slist').querySelectorAll('.it');
  eq(rows.length, 2, 'running sessions are listed');
  ok(rows[0].classList.contains('sel'), 'the running session is preselected');
  ok(rows[1].classList.contains('off'), 'the paused session cannot be ended from the popup');
  key(w, 'keydown', 'ArrowDown', {}, q(d, '#dy-slist'));
  ok(q(d, '#qk-end').disabled, 'a paused session disables the End button');
  key(w, 'keydown', 'ArrowUp', {}, q(d, '#dy-slist'));
  key(w, 'keydown', 'Enter', {}, q(d, '#dy-slist'));
  const fin = await waitFor(() => q(d, '.qk-done'));
  ok(!!fin, 'Enter ends the selected session');
  const end = calls.find((c) => c.type === 'quick' && c.req.op === 'end');
  eq(end && end.req.sessionId, 'sm-1', 'end: the selected session id was sent');
  ok(/10/.test(fin.textContent) || /۱۰/.test(fin.textContent), 'result shows the added minutes');
  w.close();

  console.log('[quick: settings]');
  ({ w, d, calls } = boot({ enabled: false })); await sleep(30);
  await tap(w, 'Shift'); await tap(w, 'Shift');
  ok(!dlgRoot(d), 'disabled in settings: double Shift does nothing');
  d.dispatchEvent(new w.CustomEvent('dy-quick-open', { detail: 'start' }));
  ok(!!dlgRoot(d), '...but the CRM panel button still works');
  w.close();
  ({ w, d, calls } = boot({ startKey: 'Alt', endKey: 'Shift' })); await sleep(30);
  await tap(w, 'Shift'); await tap(w, 'Shift');
  ok(/پایان جلسه/.test(q(d, 'h3')?.textContent ?? ''), 'keys are configurable (Shift now ends a session)');
  w.close();
  ({ w, d, calls } = boot()); await sleep(30);
  w.document.documentElement.setAttribute('data-dy-crm', 'https://novincn.crm.systan.com');
  ok(w.document.documentElement.hasAttribute('data-dy-quick'), 'the page is marked so the CRM panel shows its popup buttons');
  w.close();

  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
