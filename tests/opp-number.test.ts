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
async function uiCreate(w, name) {
  const btn = await waitFor(() => w.document.getElementById('dy-new-btn')); btn.click();
  const ok_ = await waitFor(() => w.document.getElementById('dy-new-ok'));
  if (name) w.document.getElementById('dy-new-name').value = name;
  ok_.click();
  return waitFor(() => w.document.getElementById('dy-toast') || w.document.getElementById('dy-num-retry'), 8000);
}
const toastText = (w) => { const t = w.document.querySelector('#dy-toast span'); return t ? t.textContent.replace(/[⁦⁩]/g, '') : null; };
const T = (iso_) => Date.parse(iso_);

(async () => {
  // ---------------- 1. calendar ----------------
  console.log('\n[1] Persian calendar conversion');
  { const w = boot(makeCrm()); const A = w.__dyOppNumber;
    const fmt = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { timeZone: 'Asia/Tehran', year: 'numeric', month: 'numeric', day: 'numeric' });
    let bad = 0, n = 0;
    for (let t = Date.UTC(1921, 0, 1, 8); t < Date.UTC(2121, 0, 1); t += 86400000) { // 1300..1500 AP, 08:00Z = noon Tehran
      const d = new Date(t); const g = { gy: d.getUTCFullYear(), gm: d.getUTCMonth() + 1, gd: d.getUTCDate() };
      const j = A.PC.d2j(A.PC.g2d(g.gy, g.gm, g.gd)); const parts = fmt.formatToParts(d); const p: any = {}; parts.forEach((x) => p[x.type] = +x.value);
      n++; if (j.jy !== p.year || j.jm !== p.month || j.jd !== p.day) { bad++; if (bad < 4) console.log('   mismatch', d.toISOString(), j, p); }
      const back = A.PC.d2g(A.PC.j2d(j.jy, j.jm, j.jd)); if (back.gy !== g.gy || back.gm !== g.gm || back.gd !== g.gd) bad++;
    }
    eq(bad, 0, `d2j/j2d agree with ICU Persian calendar + round-trip on ${n} days (1300-1500 AP)`);
    eq(JSON.stringify(A.persianMonthOf(new Date('2026-11-05T08:00:00Z'))), '{"jy":1405,"jm":8}', '2026-11-05 = 1405/08');
    // leap years / Esfand length
    const esf = (y) => { const b = A.persianMonthBounds(y, 12); return Math.round((b.end - b.start) / 86400000); };
    eq([esf(1403), esf(1404), esf(1405), esf(1408)].join(','), '30,29,29,30', 'Esfand length: 1403 leap(30), 1404/1405 (29), 1408 leap (30)');
    // month bounds tile the timeline with no gap/overlap, start = Tehran midnight of day 1, for 1400-1425
    let tile = true, edge = true;
    for (let y = 1400; y <= 1425; y++) for (let m = 1; m <= 12; m++) {
      const b = A.persianMonthBounds(y, m); const nx = m === 12 ? A.persianMonthBounds(y + 1, 1) : A.persianMonthBounds(y, m + 1);
      if (+b.end !== +nx.start) tile = false;
      const first = A.persianMonthOf(b.start), last = A.persianMonthOf(new Date(b.end - 1)), before = A.persianMonthOf(new Date(b.start - 1));
      const ip: any = {}; new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { timeZone: 'Asia/Tehran', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(b.start).forEach((x) => ip[x.type] = +x.value);
      const dd = (ip.hour === 0 && ip.minute === 0 && ip.second === 0 && ip.month === m && ip.year === y) ? ip.day : -1;
      if (first.jy !== y || first.jm !== m || last.jy !== y || last.jm !== m || (before.jm === m && before.jy === y) || dd !== 1) edge = false;
    }
    ok(tile, 'month [start,end) intervals are contiguous (end of month N == start of N+1), 1400-1425');
    ok(edge, 'start instant is in the month, end-1ms is in the month, start-1ms is in the previous month');
    eq(A.persianMonthBounds(1405, 8).start.toISOString(), '2026-10-22T20:30:00.000Z', '1405/08 starts 2026-10-22T20:30:00Z (= 1405/08/01 00:00 Tehran)');
    eq(A.persianMonthBounds(1405, 9).start.toISOString(), '2026-11-21T20:30:00.000Z', '1405/09 starts 2026-11-21T20:30:00Z');
    eq(A.persianMonthBounds(1406, 1).start.toISOString(), '2027-03-20T20:30:00.000Z', '1406/01 starts 2027-03-20T20:30:00Z (Nowruz 1406)');
    const fm: any[][] = [[1405, 8, 1, '5080001'], [1405, 8, 2, '5080002'], [1405, 8, 3, '5080003'], [1405, 8, 15, '5080015'], [1405, 8, 125, '5080125'], [1405, 9, 1, '5090001'], [1405, 9, 2, '5090002'], [1406, 1, 1, '6010001'], [1406, 1, 2, '6010002'], [1405, 10, 1, '5100001'], [1410, 1, 1, '0010001']];
    ok(fm.every(([y, m, q, e]) => A.numFormat(y, m, q) === e && e.length === 7), 'format table from the spec (all exactly 7 digits)');
  }

  // ---------------- 2. E2E through the real New Opp dialog ----------------
  console.log('\n[2] New Opp button -> create -> number (fake CRM Web API)');
  { const crm = makeCrm({ pageSize: 3 }); const w = boot(crm);
    const monthStart = w.__dyOppNumber.persianMonthBounds(1405, 8).start.getTime();
    crm.now = monthStart + 3600e3;
    await uiCreate(w, 'تست اول');
    eq(crm.posts, 1, 'exactly one POST (existing creation logic ran once)');
    eq(JSON.stringify(Object.keys(crm.lastPost).sort()), '["name","transactioncurrencyid@odata.bind"]', 'creation payload unchanged (name + currency)');
    const r1 = [...crm.recs.values()][0];
    eq(r1.new_opportunitynumbertext, '5080001', 'first opp of 1405/08 -> 5080001 saved in CRM record');
    ok(/فرصت با موفقیت ایجاد شد/.test(toastText(w)) && /شماره فرصت: 5080001/.test(toastText(w)), 'success toast shows the number: ' + JSON.stringify(toastText(w)));
    eq(w.opened.length, 1, 'form opened as before'); eq(w.opened[0].entityId, r1.opportunityid, 'form opened for the created GUID');
    eq(crm.patches.length, 1, 'one PATCH'); eq(Object.keys(crm.patches[0].body).join(), 'new_opportunitynumbertext', 'PATCH body only contains new_opportunitynumbertext');
    eq(typeof crm.patches[0].body.new_opportunitynumbertext, 'string', 'payload is a string for a text field');
    ok(crm.patches[0].ifMatch && /^W\//.test(crm.patches[0].ifMatch), 'PATCH sent with If-Match ETag');
    // second via UI
    await sleep(50); w.document.getElementById('dy-toast').remove(); await uiCreate(w, 'تست دوم');
    eq([...crm.recs.values()][1].new_opportunitynumbertext, '5080002', 'second opp -> 5080002');
    // opps created outside the toolkit (no number) count; 4 native + 2 ours -> next = 7
    for (let i = 0; i < 4; i++) crm.seed({ createdon: crm.now - 100e3 + i * 1000 }); // native opps created before the next one, not numbered
    w.document.getElementById('dy-toast').remove(); await uiCreate(w, 'سوم');
    eq([...crm.recs.values()].find((r) => r.name === 'سوم').new_opportunitynumbertext, '5080007', 'native (unnumbered) opps are counted: 2 + 4 + 1 = 5080007');
    ok(crm.monthQueries >= 3 && crm.urls.some((u) => /nextLink|skiptoken/.test(u) || /skiptoken/.test(u)), 'pagination via @odata.nextLink was followed (page size 3)');
    eq(crm.badUrls.length, 0, 'no unencoded spaces in any request URL (filters are percent-encoded)');
    const q = crm.urls.find((u) => /createdon%20ge/.test(u)); ok(/createdon%20ge%202026-10-22T20%3A30%3A00Z%20and%20createdon%20lt%202026-11-21T20%3A30%3A00Z/.test(q), 'month query is server-side filtered with encoded UTC bounds: ' + q.split('$filter=')[1]);
  }

  // 15th, other months, boundaries
  console.log('\n[3] Sequence numbers, month reset, boundaries');
  { const crm = makeCrm(); const w = boot(crm); const A = w.__dyOppNumber;
    const b8 = A.persianMonthBounds(1405, 8), b9 = A.persianMonthBounds(1405, 9), b1 = A.persianMonthBounds(1406, 1);
    for (let i = 1; i <= 14; i++) crm.seed({ createdon: +b8.start + i * 60e3, num: '508' + String(i).padStart(4, '0') });
    crm.now = +b8.start + 20 * 86400e3; await uiCreate(w, 'p15'); eq([...crm.recs.values()].find((r) => r.name === 'p15').new_opportunitynumbertext, '5080015', '15th opportunity of 1405/08 -> 5080015');
    // last instant of 1405/08 vs first instant of 1405/09
    const last = crm.seed({ createdon: +b9.start - 1000 }); // 23:59:59 on 1405/08/30 (counted in 08)
    const c1 = new Date(+b9.start - 1000); crm.now = +b9.start - 1000; w.document.getElementById('dy-toast').remove(); await uiCreate(w, 'last-of-08');
    eq([...crm.recs.values()].find((r) => r.name === 'last-of-08').new_opportunitynumbertext, '5080017', 'created 1 s before month end still belongs to 1405/08 (15 + native + 1 = 5080017)');
    crm.now = +b9.start; w.document.getElementById('dy-toast').remove(); await uiCreate(w, 'first-of-09');
    eq([...crm.recs.values()].find((r) => r.name === 'first-of-09').new_opportunitynumbertext, '5090001', 'created exactly at 1405/09 start -> sequence resets: 5090001');
    crm.now += 1000; w.document.getElementById('dy-toast').remove(); await uiCreate(w, 'second-of-09');
    eq([...crm.recs.values()].find((r) => r.name === 'second-of-09').new_opportunitynumbertext, '5090002', 'second of 1405/09 -> 5090002');
    crm.now = +b1.start; w.document.getElementById('dy-toast').remove(); await uiCreate(w, 'nowruz');
    eq([...crm.recs.values()].find((r) => r.name === 'nowruz').new_opportunitynumbertext, '6010001', 'first of 1406/01 (new Persian year) -> 6010001');
    crm.now += 1000; w.document.getElementById('dy-toast').remove(); await uiCreate(w, 'nowruz2');
    eq([...crm.recs.values()].find((r) => r.name === 'nowruz2').new_opportunitynumbertext, '6010002', 'second of 1406/01 -> 6010002');
    // Gregorian month != Persian month: 2026-11-05 and 2026-11-25 are in different Persian months (08 vs 09)
    eq(A.persianMonthOf(new Date('2026-11-25T08:00:00Z')).jm, 9, '2026-11-25 is 1405/09 even though same Gregorian month as 2026-11-05 (1405/08)');
  }

  // ---------------- 4. existing UID ----------------
  console.log('\n[4] Never overwrite a populated number');
  { const crm = makeCrm(); crm.createDefaultNumber = '9990001'; const w = boot(crm);
    await uiCreate(w, 'x'); eq(crm.patches.length, 0, 'no PATCH when the record already has a number'); eq([...crm.recs.values()][0].new_opportunitynumbertext, '9990001', 'existing number untouched');
  }

  // ---------------- 5. failure + retry ----------------
  console.log('\n[5] Failure handling and Retry');
  { const crm = makeCrm(); const w = boot(crm); crm.failPatch = () => true;
    await uiCreate(w, 'fails');
    const retry = await waitFor(() => w.document.getElementById('dy-num-retry'));
    ok(!!retry, 'Retry button shown'); const id = [...crm.recs.keys()][0];
    eq(crm.recs.size, 1, 'opportunity preserved (not deleted)'); eq(crm.recs.get(id).new_opportunitynumbertext, null, 'number empty after failure');
    const errTxt = w.document.getElementById('dy-num-err').textContent; ok(errTxt.includes(id) && errTxt.includes('simulated CRM failure'), 'error shows GUID + CRM reason');
    ok(!w.document.getElementById('dy-toast'), 'no success toast on failure'); eq(w.opened.length, 0, 'no success navigation');
    crm.failPatch = null; retry.click();
    await waitFor(() => w.document.getElementById('dy-toast'));
    eq(crm.posts, 1, 'retry did NOT create another opportunity'); eq(crm.recs.size, 1, 'still one record');
    eq(crm.recs.get(id).new_opportunitynumbertext, '5080001', 'retry updated the SAME opportunity: ' + crm.recs.get(id).new_opportunitynumbertext);
    ok(/5080001|50800/.test(toastText(w) || ''), 'success after retry');
    // retry when someone already filled the number meanwhile
    const crm2 = makeCrm(); const w2 = boot(crm2); crm2.failPatch = () => true; await uiCreate(w2, 'f2'); const r2 = await waitFor(() => w2.document.getElementById('dy-num-retry'));
    const id2 = [...crm2.recs.keys()][0]; crm2.recs.get(id2).new_opportunitynumbertext = 'MANUAL1'; crm2.recs.get(id2).v++; crm2.failPatch = null; const pb = crm2.patches.length; r2.click(); await waitFor(() => w2.document.getElementById('dy-toast'));
    eq(crm2.patches.length, pb, 'retry checks the field first: no PATCH when already populated'); eq(crm2.recs.get(id2).new_opportunitynumbertext, 'MANUAL1', 'manual value preserved');
  }

  // ---------------- 6. metadata ----------------
  console.log('\n[6] Field metadata verification');
  { for (const [label, mut, expect] of ([
    ['field missing (404)', (c) => c.attr404 = true, /پیدا نشد/], ['not writable', (c) => c.attr = { AttributeType: 'String', MaxLength: 100, IsValidForUpdate: false }, /قابل ویرایش نیست/],
    ['unsupported type (Lookup)', (c) => c.attr = { AttributeType: 'Lookup', IsValidForUpdate: true }, /پشتیبانی نمی/], ['MaxLength 5', (c) => c.attr = { AttributeType: 'String', MaxLength: 5, IsValidForUpdate: true }, /کمتر از ۷/]] as any[][])) {
    const crm = makeCrm(); mut(crm); const w = boot(crm); await uiCreate(w, 'm'); await waitFor(() => w.document.getElementById('dy-num-err'));
    ok(expect.test(w.document.getElementById('dy-num-err').textContent) && crm.patches.length === 0 && crm.recs.size === 1, label + ': clear error, opportunity kept, no PATCH');
  }
    const crm = makeCrm(); crm.attr = { AttributeType: 'Integer', IsValidForUpdate: true }; const w = boot(crm); await uiCreate(w, 'int');
    eq(typeof crm.patches[0].body.new_opportunitynumbertext, 'number', 'numeric field -> payload is a JSON number'); eq(crm.patches[0].body.new_opportunitynumbertext, 5080001, 'value 5080001');
  }

  // ---------------- 7. concurrency ----------------
  console.log('\n[7] Concurrency / duplicate prevention');
  { // 7a: forced collision. Both writers get a stale month view (each misses the other), both pass the pre-check, both write the same number
    const crm = makeCrm(); const w = boot(crm); const A = w.__dyOppNumber; const st = A.persianMonthBounds(1405, 8).start.getTime(); crm.now = st + 1000e3;
    const a = crm.seed({ createdon: st + 1000e3 }), b = crm.seed({ createdon: st + 1001e3 });
    crm.hideFirst = { n: 2, ids: new Set([a, b]) };
    let arrived = 0, release; const gate = new Promise((r) => release = r); crm.barrier = () => { if (++arrived === 2) release(); return gate; };
    const [ra, rb] = await Promise.all([A.assign(a), A.assign(b)]); crm.barrier = null;
    const na = crm.recs.get(a).new_opportunitynumbertext, nb = crm.recs.get(b).new_opportunitynumbertext;
    ok(na !== nb && /^508000[12]$/.test(na) && /^508000[12]$/.test(nb), `forced simultaneous write: collision detected and resolved -> ${na} / ${nb}`);
    ok(ra.collisions + rb.collisions >= 1, 'collision counter reported (' + (ra.collisions + rb.collisions) + ')');
    eq(crm.recs.get(a).new_opportunitynumbertext, ra.number, 'returned number == CRM value (A)'); eq(crm.recs.get(b).new_opportunitynumbertext, rb.number, 'returned number == CRM value (B)');
  }
  { // 7b: randomized latency, 8 users at once, many rounds
    let dupRounds = 0, missing = 0, rounds = 40, totalCollisions = 0;
    for (let k = 0; k < rounds; k++) {
      const crm = makeCrm({ jitter: 6 }); const w = boot(crm); const A = w.__dyOppNumber; const st = A.persianMonthBounds(1405, 8).start.getTime(); crm.now = st + 5e6;
      for (let i = 0; i < 3; i++) crm.seed({ createdon: st + i * 1000, num: i === 0 ? '5080001' : null }); // mixed history
      const ids: any[] = []; for (let i = 0; i < 8; i++) { ids.push(crm.seed({ createdon: crm.now + (k % 2 ? 0 : i) * 1000 })); }  // odd rounds: identical createdon
      const res = await Promise.all(ids.map((id) => A.assign(id))); res.forEach((r) => totalCollisions += r.collisions);
      const nums = ids.map((id) => crm.recs.get(id).new_opportunitynumbertext); if (nums.some((n) => !/^508\d{4}$/.test(n))) missing++;
      const all = [...crm.recs.values()].map((r) => r.new_opportunitynumbertext).filter(Boolean); if (new Set(all).size !== all.length) dupRounds++;
    }
    eq(dupRounds, 0, `${rounds} randomized rounds x 8 simultaneous creators: zero duplicate numbers (collisions handled: ${totalCollisions})`); eq(missing, 0, 'every record received a valid number');
  }
  { // 7c: number already used by a record from another decade/source -> skipped by exact-value check
    const crm = makeCrm(); const w = boot(crm); const A = w.__dyOppNumber; const st = A.persianMonthBounds(1405, 8).start.getTime();
    crm.seed({ createdon: Date.parse('2016-11-05T00:00:00Z'), num: '5080001' }); // 1395/08 shares the digit pattern
    const id = crm.seed({ createdon: st + 1000e3 }); const r = await A.assign(id); eq(r.number, '5080002', 'exact-value pre-check skips a number held outside the month window');
    // If-Match 412: record changes between read and write
    const crm3 = makeCrm(); const w3 = boot(crm3); const id3 = crm3.seed({ createdon: w3.__dyOppNumber.persianMonthBounds(1405, 8).start.getTime() + 5e5 });
    const orig = crm3.fetch; let bumped = false; crm3.fetch = async (u, o: any = {}) => { if ((o.method || '') === 'PATCH' && !bumped) { bumped = true; crm3.recs.get(id3).v++; } return orig(u, o); };
    const r3 = await w3.__dyOppNumber.assign(id3); eq(r3.number, '5080001', 'ETag mismatch (412) is retried after re-reading'); ok(r3.attempts === 2, 'second attempt used');
  }
  { // 7d: persistent PATCH failure after some attempts leaves no duplicate; exhaustion path
    const crm = makeCrm(); const w = boot(crm); const A = w.__dyOppNumber; const st = A.persianMonthBounds(1405, 8).start.getTime();
    const id = crm.seed({ createdon: st + 1e6 });
    const orig = crm.fetch; crm.fetch = async (u, o: any = {}) => { const r = await orig(u, o); // another writer grabs every number we verify
      if (/new_opportunitynumbertext%20eq/.test(u) && !/opportunityid%20ne/.test(u)) { const m = decodeURIComponent(u).match(/eq '(\d+)'/); if (m) { const x = crm.seed({ createdon: st + 5e5, num: m[1] }); const rec = crm.recs.get(x); rec.modifiedon = iso(st); } const rr = await orig(u, o); return rr; } return r; };
    let err: any = null; try { await A.assign(id); } catch (e) { err = e; }
    ok(err && err.code === 'COLLISION', 'unresolvable collisions end in an explicit error (not a false success)'); eq(crm.recs.get(id).new_opportunitynumbertext, null, 'no known duplicate left on the record');
  }

  console.log('\n[8] Legacy whole-number field');
  { const crm = makeCrm(); const w = boot(crm); const A = w.__dyOppNumber; const st = A.persianMonthBounds(1405, 8).start.getTime();
    crm.seed({ createdon: st + 1e3, legacy: 5080002 }); crm.seed({ createdon: st + 2e3, legacy: 5080001 });
    const id = crm.seed({ createdon: st + 1e6 }); const r = await A.assign(id);
    eq(r.number, '5080003', 'rank 3 -> 5080003 (legacy numbers 1-2 already used, no clash)');
    const id2 = crm.seed({ createdon: st + 1e6 + 500 }); crm.recs.get(id).new_opportunitynumbertext = null; crm.seed({ createdon: st + 1e3, legacy: 5080004 });
    const r2 = await A.assign(id2); ok(r2.number !== '5080004' && r2.number !== '5080001' && r2.number !== '5080002', 'legacy numbers are treated as used: got ' + r2.number);
    eq(crm.patches.every((p) => Object.keys(p.body).join() === 'new_opportunitynumbertext'), true, 'legacy field is never written');
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`); if (fail) console.log(failures.join('\n')); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
