// Usage: tsx tests/quick-bg.test.ts — service-worker side of the quick session (CRM calls from any tab) against a fake CRM.
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const eq = (a, b, m) => ok(a === b, m + (a === b ? '' : ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`));

// ───────── fake chrome ─────────
const store = new Map<string, any>();
const tabs: any[] = [];
(globalThis as any).chrome = {
  storage: { local: {
    async get(arg) {
      if (arg === null || arg === undefined) return Object.fromEntries(store);
      if (typeof arg === 'string') return store.has(arg) ? { [arg]: structuredClone(store.get(arg)) } : {};
      if (Array.isArray(arg)) return Object.fromEntries(arg.filter((k) => store.has(k)).map((k) => [k, structuredClone(store.get(k))]));
      return Object.fromEntries(Object.entries(arg).map(([k, v]) => [k, store.has(k) ? structuredClone(store.get(k)) : v]));
    },
    async set(o) { for (const [k, v] of Object.entries(o)) store.set(k, structuredClone(v)); },
    async remove(k) { for (const x of [].concat(k)) store.delete(x); },
  } },
  tabs: { create: async (o) => { tabs.push(o); return {}; } },
};

// ───────── fake CRM ─────────
const U = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const CUR_USER = U(900), CUR_PL = U(901), PL_MAIN = U(10), PL_OTHER = U(11);
const P_GAME = U(21), P_PRINT = U(22), P_INT9 = U(23), UOM = U(30);
const crm: any = { reqs: [], opps: new Map(), lines: [], htmlMode: false, ver: 0, now: Date.parse('2026-11-05T08:00:00Z'), n: 100 };
const R = (status, body?, headers = {}) => ({ ok: status < 400, status, statusText: String(status), json: async () => body, headers: { get: (k) => (k.toLowerCase() === 'content-type' ? (headers['content-type'] ?? 'application/json') : null) } });
const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
(globalThis as any).fetch = async (url: string, o: any = {}) => {
  crm.reqs.push({ url, credentials: o.credentials, method: o.method || 'GET', body: o.body });
  if (crm.htmlMode) return R(200, null, { 'content-type': 'text/html' });
  const u = new URL(url); const method = (o.method || 'GET').toUpperCase();
  const path = decodeURIComponent(u.pathname.replace(/^.*\/api\/data\/v9\.1\//, ''));
  const filter = u.searchParams.get('$filter') || '';
  if (path === 'WhoAmI') return R(200, { UserId: CUR_USER });
  if (path.startsWith('systemusers(')) return R(200, { _transactioncurrencyid_value: CUR_USER });
  if (path === 'pricelevels') return R(200, { value: [{ pricelevelid: PL_OTHER, name: 'لیست عمده' }, { pricelevelid: PL_MAIN, name: 'لیست قیمت اصلی' }] });
  if (path.startsWith('pricelevels(')) return R(200, { _transactioncurrencyid_value: CUR_PL });
  if (path === 'products' && /productnumber eq 'INT-009'/.test(filter)) return R(200, { value: [{ productid: P_INT9, name: 'اینترنت', price: 100, _defaultuomid_value: UOM }] });
  if (path === 'products') return R(200, { value: [
    { productid: P_GAME, name: 'ساعت بازی', productnumber: 'INT-001', price: 5000, _defaultuomid_value: UOM, '_defaultuomid_value@OData.Community.Display.V1.FormattedValue': 'ساعت' },
    { productid: P_PRINT, name: 'پرینت A4', productnumber: 'PR-001', price: 1000, _defaultuomid_value: UOM, '_defaultuomid_value@OData.Community.Display.V1.FormattedValue': 'برگ' } ] });
  if (path === 'productpricelevels') {
    const m = filter.match(/_productid_value eq (\S+) and _pricelevelid_value eq (\S+)/);
    const amt = (pid, pl) => (pl === PL_MAIN ? ({ [P_GAME]: 6000, [P_PRINT]: 1500, [P_INT9]: 70 } as any)[pid] : undefined);
    if (m) { const a = amt(m[1], m[2]); return R(200, { value: a == null ? [] : [{ amount: a }] }); }
    const m2 = filter.match(/_pricelevelid_value eq (\S+)/);
    return R(200, { value: m2 && m2[1] === PL_MAIN ? [{ amount: 6000, _productid_value: P_GAME, _uomid_value: UOM }, { amount: 1500, _productid_value: P_PRINT, _uomid_value: UOM }] : [] });
  }
  if (path.startsWith('EntityDefinitions')) return R(200, { LogicalName: 'new_opportunitynumbertext', AttributeType: 'String', MaxLength: 100, IsValidForUpdate: true });
  if (method === 'POST' && path === 'opportunities') {
    const b = JSON.parse(o.body); const id = U(++crm.n); const t = crm.now; crm.now += 1000;
    crm.opps.set(id, { opportunityid: id, name: b.name, createdon: iso(t), modifiedon: iso(t), new_opportunitynumbertext: null, v: ++crm.ver, _pricelevelid_value: (b['pricelevelid@odata.bind'] || '').replace(/.*\((.*)\)/, '$1') || null, post: b });
    return R(201, { opportunityid: id });
  }
  let m = path.match(/^opportunities\(([0-9a-f-]+)\)$/);
  if (m) {
    const r = crm.opps.get(m[1]); if (!r) return R(404, { error: { message: 'nf' } });
    if (method === 'GET') return R(200, { ...r, '@odata.etag': 'W/"' + r.v + '"' });
    if (method === 'PATCH') { Object.assign(r, JSON.parse(o.body)); r.v = ++crm.ver; r.modifiedon = iso(crm.now += 5); return R(204, null); }
  }
  if (path === 'opportunities' && method === 'GET') {
    let rows = [...crm.opps.values()]; let mm;
    if ((mm = filter.match(/^createdon ge (\S+) and createdon lt (\S+)$/))) rows = rows.filter((r) => Date.parse(r.createdon) >= Date.parse(mm[1]) && Date.parse(r.createdon) < Date.parse(mm[2]));
    else if ((mm = filter.match(/^new_opportunitynumbertext eq '?([^' ]+)'?( and opportunityid ne ([0-9a-f-]+))?$/))) rows = rows.filter((r) => String(r.new_opportunitynumbertext) === mm[1] && r.opportunityid !== mm[3]);
    return R(200, { value: rows });
  }
  if (path === 'opportunityproducts' && method === 'GET') {
    const opp = (filter.match(/_opportunityid_value eq (\S+)/) || [])[1]; const prod = (filter.match(/_productid_value eq (\S+)/) || [])[1];
    const rows = crm.lines.filter((l) => l.opp === opp && (!prod || l.productid === prod));
    return R(200, { value: rows.map((l) => ({ opportunityproductid: l.id, productname: l.name, _productid_value: l.productid, '_productid_value@OData.Community.Display.V1.FormattedValue': l.name })) });
  }
  if (path === 'opportunityproducts' && method === 'POST') {
    const b = JSON.parse(o.body);
    if (b.bmsd_istaxmanualyset && crm.rejectTaxField) return R(400, { error: { message: 'unknown field' } });
    const productid = b['productid@odata.bind'].replace(/.*\((.*)\)/, '$1');
    const name = productid === P_GAME ? 'ساعت بازی' : productid === P_PRINT ? 'پرینت A4' : 'اینترنت';
    crm.lines.push({ id: U(++crm.n), opp: b['opportunityid@odata.bind'].replace(/.*\((.*)\)/, '$1'), productid, name, qty: b.quantity, price: b.priceperunit, overridden: b.ispriceoverridden, tax: b.bmsd_istaxmanualyset });
    return R(204, null);
  }
  return R(400, { error: { message: 'unhandled ' + method + ' ' + path } });
};

(async () => {
  const { handleQuick, installQuickTransport, pickMainPriceLevel } = await import('../src/background/quick');
  const { parseQuickRequest } = await import('../src/quick/protocol');
  const { getManager } = await import('../src/session-manager/service');
  installQuickTransport();
  const call = async (op, p: any = {}) => handleQuick({ op, ...p }) as any;

  console.log('[quick bg: price list pick]');
  eq(pickMainPriceLevel([{ id: 'a', name: 'لیست عمده' }, { id: 'b', name: 'قیمت اصلی' }, { id: 'c', name: 'قیمت اصلی ویژه' }], 'قیمت اصلی'), 'b', 'exact name wins');
  eq(pickMainPriceLevel([{ id: 'a', name: 'لیست عمده' }, { id: 'c', name: 'لیست قیمت اصلی' }], 'قیمت اصلی'), 'c', '«لیست قیمت اصلی» matches «قیمت اصلی»');
  eq(pickMainPriceLevel([{ id: 'a', name: 'قیمت اصلی'.replace('ص', 'ص') }, { id: 'k', name: 'كيمت' }], 'قیمت اصلی'), 'a', 'Arabic/Persian letter variants match');
  eq(pickMainPriceLevel([{ id: 'a', name: 'عمده' }], 'قیمت اصلی'), null, 'no match → null');

  console.log('[quick bg: validation]');
  ok(!(await call('prices', { priceLevelId: 'not-a-guid' })).ok, 'bad guid rejected');
  ok(!(await call('start', { name: '', priceLevelId: null, items: [], openForm: false })).ok, 'empty title rejected');
  ok(!(await call('start', { name: 'x', priceLevelId: null, items: [{ productId: P_GAME, qty: -1 }], openForm: false })).ok, 'negative quantity rejected');
  let threw = false; try { parseQuickRequest({ op: 'hack' }); } catch { threw = true; } ok(threw, 'unknown op rejected');
  ok(!(await call('setUrl', { url: 'https://evil.example.com' })).ok, 'a non-CRM address is refused');
  ok(!(await call('setUrl', { url: 'http://novincn.crm.systan.com' })).ok, 'a non-https address is refused');

  console.log('[quick bg: bootstrap]');
  crm.reqs.length = 0;
  const b = await call('bootstrap');
  ok(b.ok, 'bootstrap ok');
  eq(b.data.mainPriceLevelId, PL_MAIN, 'main price list found («لیست قیمت اصلی»)');
  eq(b.data.products.length, 2, 'products loaded');
  ok(crm.reqs.every((r) => r.credentials === 'include'), 'CRM is called with the browser cookies (credentials include)');
  ok(crm.reqs.every((r) => r.url.startsWith('https://novincn.crm.systan.com/api/data/v9.1/')), 'default CRM address used');
  const prices = (await call('prices', { priceLevelId: PL_MAIN })).data;
  eq(prices[P_GAME], 6000, 'price list amounts by product');
  ok((await call('setUrl', { url: 'https://other.crm.systan.com/Org/' })).ok, 'a CRM address with an organisation path is accepted');
  crm.reqs.length = 0; await call('prices', { priceLevelId: PL_MAIN });
  ok(crm.reqs[0].url.startsWith('https://other.crm.systan.com/Org/api/data/v9.1/'), 'learned CRM address is used afterwards');
  await call('setUrl', { url: 'https://novincn.crm.systan.com' });

  console.log('[quick bg: start]');
  const s = await call('start', { name: 'مشتری ۱', priceLevelId: PL_MAIN, items: [{ productId: P_GAME, qty: 2 }, { productId: P_PRINT, qty: 5 }], openForm: true });
  ok(s.ok, 'start ok: ' + (s.message || ''));
  const opp = crm.opps.get(s.data.oppId);
  eq(opp.post['pricelevelid@odata.bind'], '/pricelevels(' + PL_MAIN + ')', 'opportunity created on the main price list');
  eq(opp.post['transactioncurrencyid@odata.bind'], '/transactioncurrencies(' + CUR_PL + ')', 'currency taken from the price list');
  ok(/^\d{7}$/.test(s.data.number || ''), 'monthly number assigned: ' + s.data.number);
  eq(opp.new_opportunitynumbertext, s.data.number, '...and stored on the record');
  eq(s.data.added, 2, 'both product lines added');
  const lg = crm.lines.find((l) => l.productid === P_GAME), lp = crm.lines.find((l) => l.productid === P_PRINT);
  eq(lg && lg.qty, 2, 'quantity sent'); eq(lg && lg.price, 6000, 'price from the price list (6000), not the list price (5000)');
  eq(lp && lp.price, 1500, 'second product priced from the price list');
  ok(lg && lg.tax === true && lg.overridden === true, 'manual tax = yes and price override like the CRM form');
  ok(!!s.data.sessionId, 'session registered');
  eq(tabs.length, 1, 'opening the form creates a tab');
  ok(/main\.aspx\?etn=opportunity&pagetype=entityrecord&id=/.test(tabs[0].url), 'tab URL targets the opportunity');
  const rec = await getManager().get(s.data.sessionId);
  ok(rec && rec.state === 'RUNNING' && rec.externalRef === s.data.oppId && rec.type === 'opportunity-meeting', 'Session Manager: RUNNING opportunity-meeting for this opportunity');
  eq(rec && rec.meta.number, s.data.number, '...with the opportunity number (the CRM panel adopts it from here)');
  const live = (await call('sessions')).data.sessions;
  eq(live.length, 1, 'sessions op lists it');

  console.log('[quick bg: start without price list / failing line]');
  crm.rejectTaxField = true;
  const s2 = await call('start', { name: 'بدون لیست', priceLevelId: null, items: [{ productId: P_PRINT, qty: 3 }], openForm: false });
  ok(s2.ok && s2.data.added === 1, 'works without a price list; falls back when the tax field is unknown');
  eq(crm.opps.get(s2.data.oppId).post['pricelevelid@odata.bind'], undefined, 'no price list bound');
  eq(crm.opps.get(s2.data.oppId).post['transactioncurrencyid@odata.bind'], '/transactioncurrencies(' + CUR_USER + ')', 'user currency used');
  crm.rejectTaxField = false;
  const s3 = await call('start', { name: 'محصول ناشناخته', priceLevelId: PL_MAIN, items: [{ productId: U(999), qty: 1 }], openForm: false });
  ok(s3.ok && s3.data.added === 0 && s3.data.lineErrors.length === 1, 'an unknown product is reported, the session still starts');

  console.log('[quick bg: end]');
  const key = 'sm.v1.s.' + s.data.sessionId; const stored = store.get(key); stored.runningSince -= 25 * 60000 - 1000; store.set(key, stored); // 24.98 active minutes → 25
  const e = await call('end', { sessionId: s.data.sessionId });
  ok(e.ok, 'end ok: ' + (e.message || ''));
  eq(e.data.minutes, 25, 'minutes = active minutes rounded up (25)');
  const int9 = crm.lines.find((l) => l.productid === P_INT9 && l.opp === s.data.oppId);
  eq(int9 && int9.qty, 25, 'INT-009 added with quantity 25');
  eq(int9 && int9.price, 70, 'INT-009 priced from the opportunity price list (70)');
  eq((await getManager().get(s.data.sessionId))!.state, 'COMPLETED', 'session COMPLETED');
  const again = await call('end', { sessionId: s.data.sessionId });
  ok(!again.ok, 'ending twice is refused');
  eq((await call('sessions')).data.sessions.filter((x) => x.oppId === s.data.oppId).length, 0, 'finished session no longer listed');
  // print-only opportunity: no session time
  const e2 = await call('end', { sessionId: s2.data.sessionId });
  ok(e2.ok && e2.data.skippedPrint === true, 'print-only opportunity: time not added');
  eq(crm.lines.filter((l) => l.productid === P_INT9 && l.opp === s2.data.oppId).length, 0, '...no INT-009 line created');
  // paused session cannot end
  await getManager().pause(s3.data.sessionId);
  const e3 = await call('end', { sessionId: s3.data.sessionId });
  ok(!e3.ok && /متوقف/.test(e3.message), 'a paused session cannot be ended');

  console.log('[quick bg: errors]');
  crm.htmlMode = true;
  const bad = await call('bootstrap', { refresh: true });
  ok(!bad.ok && /وارد/.test(bad.message), 'a CRM login page is reported as "sign in to CRM", not a JSON error: ' + (bad.message || '').slice(0, 40));
  crm.htmlMode = false;

  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
