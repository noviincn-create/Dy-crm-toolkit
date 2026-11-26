// Session Manager <-> side panel integration. Runs the REAL bundles (dist/content/close.js + dist/content/sm-bridge.js) in jsdom;
// the chrome.* stub routes bridge messages into the real service-worker handler + a real SessionManager.
// Usage: tsx tests/session-manager-ui.test.ts dist/content/close.js dist/content/sm-bridge.js
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { SessionManager } from '../src/session-manager/manager';
import { MemoryStorageAdapter } from '../src/session-manager/storage';
import { handleSmMessage } from '../src/session-manager/service';

const CLOSE = fs.readFileSync(process.argv[2]!, 'utf8');
const BRIDGE = fs.readFileSync(process.argv[3]!, 'utf8');
const BASE = 'https://crm.systan.com';
const SES = 'dyEasyClose.session';
const MIN = 60_000;
let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const eq = (a: any, b: any, m: string) => ok(a === b, m + (a === b ? '' : ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(f: () => T, ms = 4000): Promise<T | null> { const t = Date.now(); while (Date.now() - t < ms) { const v = f(); if (v) return v; await sleep(10); } return null; }

class NotifyingStorage extends MemoryStorageAdapter {
  listeners: Array<(c: Record<string, unknown>, area: string) => void> = [];
  override async set(items: Record<string, unknown>) { await super.set(items); const ch: Record<string, unknown> = {}; for (const k of Object.keys(items)) ch[k] = {}; for (const l of this.listeners) l(ch, 'local'); }
}

function rig(opts: { bridge?: boolean } = {}) {
  const off = { v: 0 };
  const storage = new NotifyingStorage();
  const mk = () => new SessionManager({ storage, now: () => Date.now() + off.v });
  const state = { mgr: mk(), up: true, sent: [] as any[] };
  const lines: any[] = []; const gates: { end?: Promise<void> } = {};
  let posted = 0;
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: BASE + '/main.aspx?etn=opportunity&pagetype=entitylist', runScripts: 'outside-only', pretendToBeVisual: true });
  const w: any = dom.window;
  w.opened = [];
  if (opts.bridge !== false) {
    w.chrome = {
      runtime: { sendMessage: async (msg: any) => { if (!state.up) throw new Error('Extension context invalidated.'); state.sent.push(msg.req?.op); return handleSmMessage(msg.req, state.mgr); } },
      storage: { onChanged: { addListener: (fn: any) => storage.listeners.push(fn) } },
    };
    w.eval(BRIDGE);
  }
  w.fetch = async (url: string, o: any = {}) => {
    const u = new URL(url), path = decodeURIComponent(u.pathname.replace('/api/data/v9.1/', '')), f = u.searchParams.get('$filter') || '';
    const R = (st: number, b: any) => ({ ok: st < 400, status: st, statusText: String(st), json: async () => b });
    if (path === 'products') return R(200, { value: /INT-009/.test(f) ? [{ productid: 'p-int3', name: 'خدمات جلسه', price: 500000, _defaultuomid_value: 'u1' }] : [] });
    if (path === 'opportunityproducts' && (o.method || 'GET') === 'GET') {
      if (gates.end && f.includes('_productid_value eq')) await gates.end; // hold the End operation in flight
      if (f.includes('_productid_value eq')) return R(200, { value: lines.filter((l) => f.includes(l.opp)).map(() => ({ opportunityproductid: 'x' })) });
      return R(200, { value: [] });
    }
    if (path === 'opportunityproducts') { posted++; const b = JSON.parse(o.body); lines.push({ opp: b['opportunityid@odata.bind'].replace(/\D*([0-9a-z-]+)\)?$/i, '$1'), b }); return R(204, null); }
    if (/^opportunities\(/.test(path)) return R(200, { _pricelevelid_value: null });
    return R(400, { error: { message: 'unhandled ' + path } });
  };
  w.Xrm = { Page: {}, Utility: { getGlobalContext: () => ({ getClientUrl: () => BASE, userSettings: { userId: '{u}', transactionCurrency: { id: '{A}' } } }) }, Navigation: { openForm: (x: any) => w.opened.push(x) } };
  const seed = (list: Array<{ oppId: string; name: string; ageMs: number }>) => w.localStorage.setItem(SES, JSON.stringify(list.map((s) => ({ oppId: s.oppId, name: s.name, number: '5110001', startedAt: Date.now() + off.v - s.ageMs }))));
  const boot = () => { w.eval(CLOSE); };
  const d = w.document;
  const card = (id: string) => d.querySelector(`.dy-sp-card[data-opp="${id}"]`) as HTMLElement;
  const btn = (c: HTMLElement | Document, text: string) => [...c.querySelectorAll('button')].find((b: any) => b.textContent!.includes(text)) as HTMLButtonElement | undefined;
  const rec = async (id: string) => (await state.mgr.list()).find((r) => r.externalRef === id);
  const label = (id: string) => card(id)?.querySelector('.dy-sp-live .lb')?.textContent;
  return { w, d, off, storage, state, lines, gates, posted: () => posted, seed, boot, card, btn, rec, label, mk };
}

(async () => {
  console.log('[no bridge: legacy behaviour unchanged]');
  {
    const R = rig({ bridge: false });
    R.seed([{ oppId: 'opp-a', name: 'قدیمی', ageMs: 192_000 }]); R.boot();
    await waitFor(() => R.card('opp-a')); await sleep(80);
    ok(!R.card('opp-a').querySelector('.sm-acts') && !R.d.getElementById('dy-sm-sum'), 'no Session Manager controls without the bridge');
    eq(R.label('opp-a'), 'جلسه در جریان است', 'legacy label kept');
    R.btn(R.card('opp-a'), 'پایان جلسه')!.click();
    await waitFor(() => R.lines.length === 1);
    eq(R.lines[0]?.b.quantity, 4, 'legacy wall-clock minutes (3.2 min -> 4) exactly as before');
    ok(await waitFor(() => !R.d.querySelector('.dy-sp-card')), 'card removed after end');
  }

  console.log('[with bridge: adoption, state, controls]');
  const R = rig();
  R.seed([{ oppId: 'opp-A', name: 'مشتری الف', ageMs: 30 * MIN + 20_000 }, { oppId: 'opp-B', name: 'مشتری ب', ageMs: 10 * MIN }]);
  R.boot();
  await waitFor(() => R.card('opp-A')?.querySelector('.sm-acts') && R.card('opp-B')?.querySelector('.sm-acts'));
  ok(!!R.card('opp-A').querySelector('.sm-acts') && !!R.card('opp-B').querySelector('.sm-acts'), 'both existing (legacy) sessions were adopted and got controls');
  eq((await R.state.mgr.list()).length, 2, 'two managed sessions created from the two legacy ones (nothing duplicated)');
  const ra = (await R.rec('opp-A'))!;
  ok(ra.state === 'RUNNING' && ra.activeMs === 0 && Math.abs(Date.now() - (ra.runningSince ?? 0) - (30 * MIN + 20_000)) < 3000, 'adoption preserved the original start time (billing continuity)');
  ok(!!R.btn(R.card('opp-A'), 'توقف جلسه') && !R.btn(R.card('opp-A'), 'ادامه جلسه'), 'RUNNING shows Pause only (no Resume)');
  ok(R.d.getElementById('dy-sm-sum')!.textContent!.includes('در جریان') && !!R.d.getElementById('dy-sm-glob'), 'summary chips + global controls shown');
  ok(/شروع|عنوان/.test(R.card('opp-A').textContent!) && R.card('opp-A').querySelector('.sm-act')!.textContent!.includes('۳۰'), 'active time shown (~30 min) beside the legacy fields');

  console.log('[pause is per-session]');
  R.btn(R.card('opp-A'), 'توقف جلسه')!.click();
  await waitFor(() => R.label('opp-A') === 'متوقف شده');
  eq(R.label('opp-A'), 'متوقف شده', 'A: label PAUSED');
  eq(R.card('opp-A').dataset.sm, 'PAUSED', 'A: card state attribute');
  eq(R.label('opp-B'), 'جلسه در جریان است', 'B: still running');
  ok((R.btn(R.card('opp-A'), 'پایان جلسه') as HTMLButtonElement).disabled, 'A: "End session" is blocked while paused');
  ok(!!R.btn(R.card('opp-A'), 'ادامه جلسه') && !R.btn(R.card('opp-A'), 'توقف جلسه'), 'A: only Resume is offered');
  ok(!(R.btn(R.card('opp-B'), 'پایان جلسه') as HTMLButtonElement).disabled, 'B: End still enabled');
  ok(/متوقف/.test(R.card('opp-A').querySelector('.dy-st')!.textContent!), 'A: explanation shown');
  eq((await R.rec('opp-B'))!.state, 'RUNNING', 'manager: B untouched');
  // details
  R.btn(R.card('opp-A'), 'مشاهده جزئیات')!.click();
  ok(!(R.card('opp-A').querySelector('.sm-det') as HTMLElement).hidden && R.card('opp-A').querySelector('.sm-det')!.textContent!.includes('توقف و ازسرگیری (۱)'), 'details view lists the pause');

  console.log('[billing: paused time is excluded]');
  R.off.v += 45 * MIN; // 45 minutes pass while A is paused
  R.btn(R.card('opp-A'), 'ادامه جلسه')!.click();
  await waitFor(() => R.label('opp-A') === 'جلسه در جریان است');
  eq(R.label('opp-A'), 'جلسه در جریان است', 'A resumed');
  R.off.v += 5 * MIN;
  R.btn(R.card('opp-A'), 'پایان جلسه')!.click();
  await waitFor(() => R.lines.length === 1);
  eq(R.lines[0]?.b.quantity, 36, 'INT-009 quantity = ACTIVE minutes (30:20 + 5:00 -> 36), not wall-clock (81)');
  await waitFor(() => !R.card('opp-A'));
  eq((await R.rec('opp-A'))!.state, 'COMPLETED', 'manager: A COMPLETED after the product was added');
  ok(JSON.parse(R.w.localStorage.getItem(SES)).length === 1, 'legacy list updated as before');

  console.log('[cooperative pause while the End operation is in flight]');
  let release!: () => void; R.gates.end = new Promise<void>((r) => { release = r; });
  R.btn(R.card('opp-B'), 'پایان جلسه')!.click();
  await sleep(80);
  eq((await R.rec('opp-B'))!.operations.find((o) => o.status === 'inflight')?.key, 'end-product:opp-B', 'End is registered as an in-flight operation');
  await R.state.mgr.pause((await R.rec('opp-B'))!.id); // second tab / global control asks for a pause
  eq((await R.rec('opp-B'))!.state, 'PAUSING', 'pause requested mid-operation -> PAUSING (not PAUSED while the CRM call is running)');
  release(); delete R.gates.end;
  await waitFor(() => R.lines.length === 2);
  await sleep(100);
  eq(R.lines.length, 2, 'the interrupted-by-pause End still added the product exactly once (no duplicate)');
  eq((await R.rec('opp-B'))!.state, 'COMPLETED', 'finalising op completed the session');

  console.log('[cancel needs confirmation; global controls]');
  R.seed([{ oppId: 'opp-C', name: 'ج', ageMs: 5 * MIN }, { oppId: 'opp-D', name: 'د', ageMs: 5 * MIN }, { oppId: 'opp-E', name: 'ه', ageMs: 5 * MIN }]);
  R.w.dispatchEvent(new R.w.StorageEvent('storage', { key: SES }));
  await waitFor(() => R.card('opp-E')?.querySelector('.sm-acts'));
  R.btn(R.card('opp-C'), 'لغو جلسه')!.click();
  ok(R.btn(R.card('opp-C'), 'تأیید لغو')!.classList.contains('sm-confirm'), 'first click only asks for confirmation');
  eq((await R.rec('opp-C'))!.state, 'RUNNING', '... and cancels nothing');
  R.btn(R.card('opp-C'), 'تأیید لغو')!.click();
  await waitFor(() => !R.card('opp-C'));
  eq((await R.rec('opp-C'))!.state, 'CANCELLED', 'second click cancels');
  ok(!R.card('opp-C') && R.posted() === 2, 'card removed; no product added; opportunity untouched');
  R.btn(R.d, 'توقف همه')!.click();
  await waitFor(() => R.label('opp-D') === 'متوقف شده' && R.label('opp-E') === 'متوقف شده');
  ok(R.label('opp-D') === 'متوقف شده' && R.label('opp-E') === 'متوقف شده', 'Pause All pauses every running session');
  R.btn(R.d, 'ادامه همه')!.click();
  await waitFor(() => R.label('opp-D') === 'جلسه در جریان است' && R.label('opp-E') === 'جلسه در جریان است');
  ok(R.label('opp-D') === 'جلسه در جریان است' && R.label('opp-E') === 'جلسه در جریان است', 'Resume All resumes them');
  R.btn(R.d, 'لغو همه')!.click();
  eq((await R.rec('opp-D'))!.state, 'RUNNING', 'Cancel All asks for confirmation first');
  R.btn(R.d, 'تأیید لغو همه')!.click();
  await waitFor(() => !R.card('opp-D') && !R.card('opp-E'));
  ok((await R.rec('opp-D'))!.state === 'CANCELLED' && (await R.rec('opp-E'))!.state === 'CANCELLED', 'confirmed Cancel All cancels the rest');

  console.log('[other tab / worker restart / manager down]');
  R.seed([{ oppId: 'opp-F', name: 'و', ageMs: 5 * MIN }]);
  R.w.dispatchEvent(new R.w.StorageEvent('storage', { key: SES }));
  await waitFor(() => R.card('opp-F')?.querySelector('.sm-acts'));
  await R.state.mgr.pause((await R.rec('opp-F'))!.id); // done from "another tab" through the manager
  await waitFor(() => R.label('opp-F') === 'متوقف شده');
  eq(R.label('opp-F'), 'متوقف شده', 'a pause made elsewhere appears in this panel live (storage change)');
  R.state.mgr = R.mk(); // service worker killed and restarted: new instance, same storage
  R.btn(R.card('opp-F'), 'ادامه جلسه')!.click();
  await waitFor(() => R.label('opp-F') === 'جلسه در جریان است');
  eq(R.label('opp-F'), 'جلسه در جریان است', 'after a worker restart the paused session resumes normally');
  R.state.up = false; // extension reloaded / worker unreachable while the bridge script still exists
  const before = R.posted();
  R.btn(R.card('opp-F'), 'پایان جلسه')!.click();
  await waitFor(() => /پاسخ نمی/.test(R.card('opp-F').querySelector('.dy-st')?.textContent ?? ''));
  ok(/پاسخ نمی/.test(R.card('opp-F').querySelector('.dy-st')!.textContent!), 'manager unreachable: End refused with an explanation');
  eq(R.posted(), before, '... and nothing was billed (no risk of charging paused time)');
  R.state.up = true;
  R.btn(R.card('opp-F'), 'پایان جلسه')!.click();
  await waitFor(() => R.posted() === before + 1);
  eq(R.posted(), before + 1, 'once the manager is back, End works');

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL unexpected exception:', e?.stack || e); console.log(`\nRESULT: ${pass} passed, ${fail + 1} failed`); process.exit(1); });
