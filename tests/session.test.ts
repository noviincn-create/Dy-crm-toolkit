import fs from 'node:fs';
import { JSDOM } from 'jsdom';

// Usage: tsx tests/<name>.test.ts dist/content/close.js   (the bundle produced by `npm run build`)
const CODE = fs.readFileSync(process.argv[2], 'utf8');
const BASE = 'https://crm.systan.com';
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; failures.push(m); console.log('  FAIL', m); } };
const eq = (a, b, m?) => ok(a === b, m + (a === b ? '' : ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
let guidN = 0; const newGuid = () => '00000000-0000-4000-8000-' + String(++guidN).padStart(12, '0');

function makeCrm(opts: any = {}) {
  const s: any = {
    recs: new Map(), now: Date.parse('2026-11-05T08:00:00Z'), ver: 0, posts: 0, patches: [], gets: [], urls: [],
    pageSize: opts.pageSize || 5000, attr: opts.attr || { AttributeType: 'String', MaxLength: 100, IsValidForUpdate: true },
    attr404: false, failPatch: null, createDefaultNumber: null, jitter: opts.jitter || 0, barrier: null, hideFirst: null, monthQueries: 0, badUrls: []
  };
  s.seed = (o) => { const id = o.id || newGuid(); const t = o.createdon; s.recs.set(id, { opportunityid: id, name: o.name || 'seed', createdon: iso(t), modifiedon: iso(t), new_opportunitynumbertext: o.num === undefined ? null : o.num, new_opportunitynumber: o.legacy === undefined ? null : o.legacy, v: ++s.ver }); return id; };
  const R = (status, body?, extra?) => ({ ok: status < 400, status, statusText: String(status), json: async () => body, headers: { get: () => null } });
  const view = (r) => Object.assign({}, r, { '@odata.etag': 'W/"' + r.v + '"' }, { v: undefined });
  s.fetch = async (url, o: any = {}) => {
    if (s.jitter) await sleep(Math.random() * s.jitter);
    if (/ /.test(url)) s.badUrls.push(url);
    s.urls.push(url);
    const u = new URL(url); const method = (o.method || 'GET').toUpperCase(); const path = decodeURIComponent(u.pathname.replace('/api/data/v9.1/', ''));
    if (path.startsWith('EntityDefinitions')) { if (s.attr404) return R(404, { error: { message: 'attr not found' } }); return R(200, Object.assign({ LogicalName: 'new_opportunitynumbertext' }, s.attr)); }
    if (method === 'POST' && path === 'opportunities') {
      s.posts++; s.lastPost = JSON.parse(o.body);
      const id = newGuid(); const t = s.now; s.now += 1000;
      s.recs.set(id, { opportunityid: id, name: s.lastPost.name, createdon: iso(t), modifiedon: iso(t), new_opportunitynumbertext: s.createDefaultNumber, v: ++s.ver });
      return R(201, view(s.recs.get(id)));
    }
    let m = path.match(/^opportunities\(([0-9a-f-]+)\)$/);
    if (m) {
      const r = s.recs.get(m[1]); if (!r) return R(404, { error: { message: 'not found' } });
      if (method === 'GET') { s.gets.push(m[1]); return R(200, view(r)); }
      if (method === 'PATCH') {
        if (s.barrier) await s.barrier();
        if (s.jitter) await sleep(Math.random() * s.jitter);
        if (s.failPatch && s.failPatch(m[1])) return R(500, { error: { message: 'simulated CRM failure' } });
        const ih = (o.headers || {})['If-Match'];
        if (ih && ih !== 'W/"' + r.v + '"') return R(412, { error: { message: 'etag mismatch' } });
        const b = JSON.parse(o.body); s.patches.push({ id: m[1], body: b, ifMatch: ih });
        Object.assign(r, b); s.now += 5; r.modifiedon = iso(s.now); r.v = ++s.ver; return R(204, null);
      }
    }
    if (path === 'opportunities' && method === 'GET') {
      const f = u.searchParams.get('$filter') || ''; let rows = [...s.recs.values()]; let mm;
      if ((mm = f.match(/^createdon ge (\S+) and createdon lt (\S+)$/))) {
        s.monthQueries++; const a = Date.parse(mm[1]), b = Date.parse(mm[2]);
        rows = rows.filter((r) => Date.parse(r.createdon) >= a && Date.parse(r.createdon) < b);
        if (s.hideFirst && s.hideFirst.n-- > 0) rows = rows.filter((r) => !s.hideFirst.ids.has(r.opportunityid));
      } else if ((mm = f.match(/^new_opportunitynumbertext eq ('?)([^' ]+)\1( and opportunityid ne ([0-9a-f-]+))?$/))) {
        rows = rows.filter((r) => String(r.new_opportunitynumbertext) === mm[2] && r.opportunityid !== mm[4]);
      } else return R(400, { error: { message: 'unsupported filter ' + f } });
      const skip = +(u.searchParams.get('$skiptoken') || 0); const page = rows.slice(skip, skip + s.pageSize);
      const body: any = { value: page.map((r) => ({ opportunityid: r.opportunityid, new_opportunitynumbertext: r.new_opportunitynumbertext, new_opportunitynumber: r.new_opportunitynumber, createdon: r.createdon, modifiedon: r.modifiedon })) };
      if (skip + s.pageSize < rows.length) { const n = new URL(url); n.searchParams.set('$skiptoken', String(skip + s.pageSize)); body['@odata.nextLink'] = n.toString().replace(/\+/g, '%20'); }
      return R(200, body);
    }
    return R(400, { error: { message: 'unhandled ' + method + ' ' + path } });
  };
  return s;
}

function boot(crm) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: BASE + '/main.aspx?etn=opportunity&pagetype=entitylist', runScripts: 'outside-only', pretendToBeVisual: true });
  const w: any = dom.window; w.opened = [];
  w.fetch = (u, o) => crm.fetch(u, o);
  w.Xrm = { Page: {}, Utility: { getGlobalContext: () => ({ getClientUrl: () => BASE, userSettings: { userId: '{u}', transactionCurrency: { id: '{AAAAAAAA-0000-4000-8000-000000000001}' } } }) }, Navigation: { openForm: (x) => w.opened.push(x) } };
  w.eval(CODE);
  return w;
}
async function waitFor(f, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { const v = f(); if (v) return v; await sleep(10); } return null; }

(async () => {
  console.log('[session panel]');
  const crm = makeCrm();
  const w = boot(crm);
  const d = w.document;
  await waitFor(() => d.getElementById('dy-sp'));
  ok(!!d.getElementById('dy-sp'), 'panel + tab injected');
  d.querySelector('.dy-sp-tab').click();
  ok(d.getElementById('dy-sp').classList.contains('open'), 'tab opens panel');
  // empty title is refused, nothing created
  d.getElementById('dy-sp-start').click(); await sleep(50);
  eq(crm.posts, 0, 'empty title creates nothing');
  d.getElementById('dy-sp-title').value = 'مشتری حضوری تست';
  d.getElementById('dy-sp-openform').checked = true;
  d.getElementById('dy-sp-start').click();
  await waitFor(() => d.querySelector('.dy-sp-card'));
  eq(crm.posts, 1, 'exactly one opportunity created');
  eq(crm.lastPost.name, 'مشتری حضوری تست', 'title used as opportunity name');
  ok(/^\d{7}$/.test(d.querySelector('.dy-sp-card .num').textContent), 'monthly number assigned: ' + d.querySelector('.dy-sp-card .num').textContent);
  eq(w.opened.length, 1, 'form opened');
  const ses = JSON.parse(w.localStorage.getItem('dyEasyClose.session'));
  ok(ses && ses[0] && ses[0].name === 'مشتری حضوری تست', 'session persisted');
  // product INT-009 mock (existing lines per opportunity are configurable)
  const oppId = ses[0].oppId; const products = [{ productid: 'p-int3', name: 'خدمات جلسه', price: 500000, _defaultuomid_value: 'u1' }]; const lines: any[] = [];
  const existing: Record<string, any[]> = {}; // oppId -> [{name, write}] already on the opportunity
  const ANN = '_productid_value@OData.Community.Display.V1.FormattedValue';
  const base = crm.fetch;
  crm.fetch = async (url, o: any = {}) => {
    const u = new URL(url), path = decodeURIComponent(u.pathname.replace('/api/data/v9.1/', '')), f = u.searchParams.get('$filter') || '';
    const R = (st, b) => ({ ok: st < 400, status: st, statusText: String(st), json: async () => b });
    if (path === 'products') return R(200, { value: /INT-009/.test(f) ? products : [] });
    if (path === 'opportunityproducts' && (o.method || 'GET') === 'GET') {
      if (f.includes('_productid_value eq')) return R(200, { value: lines.filter((l) => f.includes(l.productid) && f.includes(l.opp)).map(() => ({ opportunityproductid: 'x' })) });
      const oid = (f.match(/_opportunityid_value eq (\S+)/) || [])[1];
      return R(200, { value: (existing[oid] || []).map((e) => ({ productname: e.write ? e.name : null, [ANN]: e.write ? undefined : e.name })) });
    }
    if (path === 'opportunityproducts') { const b = JSON.parse(o.body); if (b.bmsd_istaxmanualyset) return R(400, { error: { message: 'unknown field' } }); lines.push({ productid: 'p-int3', opp: b['opportunityid@odata.bind'], b }); return R(204, null); }
    return base(url, o);
  };
  const sesList = () => JSON.parse(w.localStorage.getItem('dyEasyClose.session') || '[]');
  const backdate = (id, ms) => { const l = sesList(); l.find((x) => x.oppId === id).startedAt -= ms; w.localStorage.setItem('dyEasyClose.session', JSON.stringify(l)); };
  const cardOf = (id) => d.querySelector('.dy-sp-card[data-opp="' + id + '"]');
  const startSession = async (title) => {
    const n = sesList().length;
    d.getElementById('dy-sp-title').value = title; d.getElementById('dy-sp-openform').checked = false; d.getElementById('dy-sp-start').click();
    await waitFor(() => sesList().length === n + 1);
    await waitFor(() => d.querySelectorAll('.dy-sp-card').length === n + 1);
    return sesList()[n].oppId;
  };
  ok(Array.isArray(ses) && ses.length === 1, 'sessions stored as a list');
  // several sessions at the same time
  const opp2 = await startSession('مشتری دوم');
  const opp3 = await startSession('مشتری سوم (پرینت)');
  const opp4 = await startSession('مشتری چهارم (بدون محصول)');
  eq(sesList().length, 4, 'four sessions open at once');
  eq(d.querySelectorAll('.dy-sp-card').length, 4, 'four session cards rendered');
  eq(crm.posts, 4, 'one opportunity per session');
  ok(/۴/.test(d.querySelector('.dy-sp-tab .cnt').textContent), 'tab badge shows the session count');
  ok(d.getElementById('dy-sp-title').value === '', 'title cleared for the next session');
  // 1) session 1 has a normal product + print product -> time added
  existing[oppId] = [{ name: 'کارت پرینت' }, { name: 'خدمات تایپ', write: true }];
  backdate(oppId, 192000);
  cardOf(oppId).querySelector('.dy-sp-end').click();
  await waitFor(() => sesList().length === 3);
  eq(lines.length, 1, 'INT-009 added once (fallback without custom tax field)');
  ok(lines[0] && lines[0].b['productid@odata.bind'] === '/products(p-int3)' && lines[0].b['opportunityid@odata.bind'] === '/opportunities(' + oppId + ')' && lines[0].b.quantity === 4 && lines[0].b.priceperunit === 500000, 'line: product, opportunity, qty = minutes (3.2 min -> 4), price');
  ok(!cardOf(oppId) && !!cardOf(opp2) && !!cardOf(opp3), 'only the ended session card is removed');
  // 2) all products are print products -> no time
  existing[opp3] = [{ name: 'پرینت رنگی A4' }, { name: 'Print B/W', write: true }];
  backdate(opp3, 600000);
  cardOf(opp3).querySelector('.dy-sp-end').click();
  await waitFor(() => sesList().length === 2);
  eq(lines.length, 1, 'print-only opportunity: INT-009 NOT added');
  ok(/پرینت/.test(d.getElementById('dy-sp-msg').textContent), 'print-only: explanation shown');
  // 3) no products at all -> added
  backdate(opp4, 61000);
  cardOf(opp4).querySelector('.dy-sp-end').click();
  await waitFor(() => sesList().length === 1);
  eq(lines.length, 2, 'no products: INT-009 added');
  eq(lines[1].b.quantity, 2, 'qty 61s -> 2 minutes');
  eq(sesList()[0].oppId, opp2, 'remaining session is the untouched one');
  eq(crm.posts, 4, 'ending creates no opportunity');
  ok(!d.querySelector('.clk'), 'no timer');
  // legacy single-object storage from 1.7.0 is still read
  w.localStorage.setItem('dyEasyClose.session', JSON.stringify({ oppId: 'legacy-1', name: 'قدیمی', number: '5110001', startedAt: Date.now() }));
  w.dispatchEvent(new w.StorageEvent('storage', { key: 'dyEasyClose.session' }));
  await waitFor(() => cardOf('legacy-1'));
  ok(!!cardOf('legacy-1'), 'legacy single-session storage is migrated into a card');
  w.localStorage.removeItem('dyEasyClose.session');
  // missing product keeps session open
  const w3 = boot(makeCrm()); await waitFor(() => w3.document.getElementById('dy-sp'));
  w3.document.getElementById('dy-sp-title').value = 'y'; w3.document.getElementById('dy-sp-start').click();
  await waitFor(() => w3.document.querySelector('.dy-sp-end'));
  w3.document.querySelector('.dy-sp-end').click(); await sleep(200);
  ok(/ناموفق/.test(w3.document.querySelector('.dy-sp-card .dy-st').textContent) && !!w3.localStorage.getItem('dyEasyClose.session'), 'product missing: error shown, session kept');
  // number failure still starts session
  const crm2 = makeCrm(); crm2.failPatch = () => true;
  const w2 = boot(crm2); await waitFor(() => w2.document.getElementById('dy-sp'));
  w2.document.getElementById('dy-sp-title').value = 'x'; w2.document.getElementById('dy-sp-start').click();
  await waitFor(() => w2.document.querySelector('.dy-sp-end'), 15000);
  eq(crm2.posts, 1, 'number failure: opp kept, session started');
  ok(!!w2.document.querySelector('.dy-sp-renum'), 'retry-number button shown');
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
