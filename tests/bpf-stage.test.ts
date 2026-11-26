import fs from 'node:fs';
import { JSDOM } from 'jsdom';

// Usage: tsx tests/<name>.test.ts dist/content/close.js   (the bundle produced by `npm run build`)
const CODE = fs.readFileSync(process.argv[2], 'utf8'); const BASE = 'https://crm.systan.com';
let pass = 0, fail = 0; const bad: string[] = [];
const ok = (c, m) => { c ? pass++ : (fail++, bad.push(m)); console.log(c ? '  PASS' : '  FAIL', m); };
const eq = (a, b, m?) => ok(JSON.stringify(a) === JSON.stringify(b), m + (JSON.stringify(a) === JSON.stringify(b) ? '' : ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OPP = 'aaaaaaaa-0000-4000-8000-000000000001', INST = 'bbbbbbbb-0000-4000-8000-000000000001', PROC = 'cccccccc-0000-4000-8000-000000000001';
const NAMES = ['ثبت اولیه', 'ارسال مدارک توسط مشتری', 'پرداخت هزینه اولیه', 'در حال انجام', 'در انتظار پرداخت نهایی', 'انجام شده'];
const SID = NAMES.map((_, i) => 'dddddddd-0000-4000-8000-00000000000' + (i + 1));

function world(startIdx) {
  const W: any = { events: [], idx: startIdx, traversed: SID.slice(0, startIdx + 1), instState: 0, oppState: 0, instPosts: 0,
    patchBpfFails: false, moveFail: null, moveNoAdvance: false, finishWorks: true, instCount: 1, dirty: false };
  const R = (st, b) => ({ ok: st < 400, status: st, statusText: String(st), json: async () => b });
  W.fetch = async (url, o: any = {}) => {
    const u = new URL(url), m = (o.method || 'GET').toUpperCase(), p = decodeURIComponent(u.pathname.replace('/api/data/v9.1/', ''));
    const f = u.searchParams.get('$filter') || '';
    if (p === 'opportunities(' + OPP + ')' && m === 'GET') return R(200, { statecode: W.oppState, totalamount: 1000, estimatedclosedate: '2026-11-01', opportunityid: OPP });
    if (p === 'opportunities(' + OPP + ')' && m === 'PATCH') { W.events.push('PATCH_OPP'); return R(204, null); }
    if (p === 'opportunitysalesprocesses' && m === 'GET') {
      if (!/statecode eq 0/.test(f)) return R(400, {});
      return R(200, { value: W.instState === 0 ? [{ businessprocessflowinstanceid: INST, _activestageid_value: SID[W.idx], _processid_value: PROC, traversedpath: W.traversed.join(',') }] : [] });
    }
    if (p === 'opportunitysalesprocesses' && m === 'POST') { W.instPosts++; return R(201, {}); }
    if (p === 'opportunitysalesprocesses(' + INST + ')') {
      if (m === 'GET') return R(200, { _activestageid_value: SID[W.idx] });
      const b = JSON.parse(o.body);
      if (b.statecode === 1) { W.events.push('FINISH_API'); W.instState = 1; return R(204, null); }
      if (W.patchBpfFails) return R(403, { error: { message: 'no write privilege on BPF' } });
      W.events.push('PATCH_BPF'); const t = b['activestageid@odata.bind'].match(/\(([^)]+)\)/)[1]; W.idx = SID.indexOf(t); W.traversed = b.traversedpath.split(','); return R(204, null);
    }
    if (p === 'processstages') return R(200, { value: SID.map((id, i) => ({ processstageid: id, stagename: NAMES[i] })) });
    if (p === 'WinOpportunity') { W.events.push('WIN'); W.winAt = W.idx; W.winInstState = W.instState; W.oppState = 1; return R(204, null); }
    return R(400, { error: { message: 'unhandled ' + m + ' ' + p } });
  };
  const stageObj = (i) => ({ getId: () => '{' + SID[i].toUpperCase() + '}', getName: () => NAMES[i], getSteps: () => [] });
  W.xrm = {
    Page: { data: {
      entity: { getEntityName: () => 'opportunity', getId: () => '{' + OPP.toUpperCase() + '}', getPrimaryAttributeValue: () => 'فرصت تست' },
      getIsDirty: () => W.dirty, save: async () => { W.events.push('FORM_SAVE'); W.dirty = false; }, refresh: async () => {},
      process: {
        getActiveStage: () => stageObj(W.idx), getActiveProcess: () => ({ getId: () => '{' + PROC + '}' }),
        getActivePath: () => ({ getLength: () => SID.length, get: (i) => stageObj(i) }),
        moveNext: (cb) => { W.events.push('MOVE_NEXT@' + W.idx);
          if (W.moveFail === W.idx) return cb('invalid');
          if (!W.moveNoAdvance) { W.idx++; W.traversed.push(SID[W.idx]); } cb('success'); },
        setActiveStage: (id, cb) => { W.events.push('SET_ACTIVE'); W.idx = SID.indexOf(id.replace(/[{}]/g, '').toLowerCase()); cb('success'); },
        setStatus: (s, cb) => { W.events.push('SET_STATUS'); if (W.finishWorks) W.instState = 1; cb && cb(); }
      } },
      getAttribute: () => null },
    Utility: { getGlobalContext: () => ({ getClientUrl: () => BASE, userSettings: { userId: '{u}' } }) },
    Navigation: { openForm: (x) => W.events.push('OPEN_FORM') }
  };
  return W;
}
function boot(W) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: BASE + '/main.aspx?etn=opportunity&pagetype=entityrecord&id=' + OPP, runScripts: 'outside-only', pretendToBeVisual: true });
  const w: any = dom.window; w.fetch = (u, o) => W.fetch(u, o); w.Xrm = W.xrm; w.eval(CODE); return w;
}
const waitFor = async (f, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = f(); if (v) return v; await sleep(10); } return null; };
async function manual(w, targetIdx) {
  (await waitFor(() => w.document.getElementById('dy-stage-btn'))).click();
  const sel = await waitFor(() => w.document.getElementById('dy-stage-sel')); sel.value = SID[targetIdx]; sel.dispatchEvent(new w.Event('change'));
  w.document.getElementById('dy-stage-ok').click();           // step 1: asks for confirmation
  await waitFor(() => /مستقیماً به این مرحله/.test((w.document.getElementById('dy-stage-msg') || {}).textContent || ''));
  const confirmText = w.document.getElementById('dy-stage-msg').textContent;
  w.document.getElementById('dy-stage-ok').click();           // step 2: confirmed
  await waitFor(() => w.document.getElementById('dy-toast') || /ناموفق|تغییر نکرده/.test((w.document.getElementById('dy-stage-msg') || {}).textContent || ''));
  return confirmText;
}
async function win(w, sequential) {
  (await waitFor(() => w.document.getElementById('dy-close-btn'))).click();
  const okb = await waitFor(() => w.document.getElementById('dy-ok'));
  if (sequential) w.document.getElementById('dy-seq').checked = true;
  okb.click();
  await waitFor(() => /با موفقیت به عنوان برنده|فرصت برنده نشد|متوقف|ناموفق|اجباری/.test((w.document.getElementById('dy-msg') || {}).textContent || ''), 15000);
  await sleep(900);
  return (w.document.getElementById('dy-msg') || {}).textContent || '';
}

(async () => {
  console.log('\n[A] Manual stage change');
  { const W = world(0), w = boot(W); const ct = await manual(w, 3);
    ok(/آیا می‌خواهید فرصت فروش مستقیماً به این مرحله منتقل شود؟/.test(ct), 'confirmation text shown: ' + ct.split('\n')[0]);
    eq(W.idx, 3, 'stage 1 -> stage 4 directly: active stage is stage 4');
    eq(W.traversed, [SID[0], SID[3]], 'intermediate stages not traversed (path = 1,4)');
    ok(!W.events.some((e) => /MOVE_NEXT|WIN|FINISH|SET_STATUS/.test(e)), 'no moveNext / finish / win executed: ' + W.events.join(','));
    eq(W.oppState, 0, 'opportunity still open (not closed/won)'); eq(W.instPosts, 0, 'no duplicate BPF instance created');
    eq(W.events.filter((e) => e === 'PATCH_BPF').length, 1, 'existing BPF instance updated through the Web API (activestageid)');
    const opts = [...w.document.querySelectorAll('#dy-stage-sel option')]; }
  { const W = world(4), w = boot(W);
    (await waitFor(() => w.document.getElementById('dy-stage-btn'))).click(); await waitFor(() => w.document.getElementById('dy-stage-sel'));
    const opts = [...w.document.querySelectorAll('#dy-stage-sel option')].map((o) => o.textContent);
    eq(opts.length, 6, 'dropdown lists all 6 stages of the BPF'); ok(NAMES.every((n, i) => opts[i].includes(n)), 'stage names in BPF order'); ok(opts[4].includes('مرحله‌ی فعلی'), 'active stage marked');
    w.document.getElementById('dy-stage-cancel').click(); await sleep(50);
    await manual(w, 1); eq(W.idx, 1, 'stage 5 back to stage 2 works'); eq(W.traversed, [SID[0], SID[1]], 'traversed path cut back to 1,2'); eq(W.oppState, 0, 'still open');
    ok(!W.events.some((e) => /MOVE_NEXT|WIN/.test(e)), 'no sequential logic on backward move'); }
  { const W = world(0), w = boot(W); W.patchBpfFails = true; await manual(w, 4);
    eq(W.idx, 4, 'API write refused -> supported client navigation (setActiveStage) used as fallback'); ok(W.events.includes('SET_ACTIVE') && !W.events.includes('MOVE_NEXT'), 'fallback is setActiveStage, not moveNext'); }
  { const W = world(0), w = boot(W); W.dirty = true; await manual(w, 2); ok(W.events.indexOf('FORM_SAVE') >= 0 && W.events.indexOf('FORM_SAVE') < W.events.indexOf('PATCH_BPF'), 'unsaved form edits are saved first'); }
  { const W = world(0), w = boot(W); W.oppState = 3; await sleep(1200); const b = w.document.getElementById('dy-stage-btn'); b && b.click(); await sleep(150);
    ok(/بسته شده/.test((w.document.getElementById('dy-toast') || {}).textContent || ''), 'closed opportunity: change refused with message'); eq(W.events.length, 0, 'nothing written'); }

  console.log('\n[B] Close as Won - stage-by-stage mode (checkbox ticked)');
  { const W = world(1), w = boot(W); const out = await win(w, true);
    const moves = W.events.filter((e) => e.startsWith('MOVE_NEXT'));
    eq(moves, ['MOVE_NEXT@1', 'MOVE_NEXT@2', 'MOVE_NEXT@3', 'MOVE_NEXT@4'], 'from stage 2: every remaining stage moved one by one (2->3->4->5->6), none skipped');
    eq(W.traversed, SID, 'traversed path contains every stage in order');
    const wi = W.events.indexOf('WIN'); ok(wi > W.events.lastIndexOf('MOVE_NEXT@4'), 'Win executed only after the last moveNext');
    eq(W.winAt, 5, 'Win executed while the final stage was active'); eq(W.winInstState, 1, 'BPF instance already finished when Win ran'); eq(W.oppState, 1, 'opportunity is Won'); eq(W.instPosts, 0, 'no duplicate BPF instance'); }
  { const W = world(0), w = boot(W); W.moveFail = 3; const out = await win(w, true);
    eq(W.oppState, 0, 'stage failure: opportunity NOT won'); ok(!W.events.includes('WIN'), 'no WinOpportunity call'); ok(/ثبت اولیه|در حال انجام/.test(out) && /مرحله/.test(out), 'error names the failing stage: ' + out.split('\n')[0]);
    eq(W.events.filter((e) => e.startsWith('MOVE_NEXT')).length, 4, 'sequence stopped at the failing stage (moveNext 0,1,2,3)'); eq(W.idx, 3, 'active stage stays at the failing stage');
    W.moveFail = null; const before = W.events.length; (w.document.getElementById('dy-ok')).click(); await waitFor(() => W.oppState === 1, 15000); await sleep(800);
    const after = W.events.slice(before).filter((e) => e.startsWith('MOVE_NEXT'));
    eq(after, ['MOVE_NEXT@3', 'MOVE_NEXT@4'], 'retry continues from the current active stage and completes the rest'); eq(W.oppState, 1, 'won after the retry succeeded'); }
  { const W = world(0), w = boot(W); W.moveNoAdvance = true; const out = await win(w, true);
    eq(W.oppState, 0, 'moveNext that does not change the active stage: not won'); ok(/تغییر نکرد/.test(out), 'reported: ' + out.split('\n')[0]); }
  { const W = world(5), w = boot(W); W.finishWorks = false; const origFetch = W.fetch; W.fetch = async (u, o: any = {}) => { if (/opportunitysalesprocesses\(/.test(u) && /statecode/.test(o.body || '')) { return { ok: false, status: 500, statusText: 'x', json: async () => ({ error: { message: 'cannot finish' } }) }; } return origFetch(u, o); };
    const out = await win(w, true); eq(W.oppState, 0, 'BPF could not be finished: opportunity NOT won'); ok(/فرایند کسب‌وکار هنوز فعال/.test(out), 'reported: ' + out.split('\n')[0]); }

  console.log('\n[B2] Close as Won - default mode: one direct stage change');
  { const W = world(0), w = boot(W); const out = await win(w, false);
    eq(W.events.filter((e) => e === 'PATCH_BPF').length, 1, 'exactly ONE stage change (so the stage workflow / SMS fires once)');
    ok(!W.events.some((e) => e.startsWith('MOVE_NEXT')), 'no stage-by-stage walk: ' + W.events.join(','));
    eq(W.traversed, [SID[0], SID[5]], 'jumped from stage 1 straight to the last stage');
    eq(W.winAt, 5, 'Win ran with the last stage active'); eq(W.winInstState, 1, 'BPF instance finished (through the API) before Win'); eq(W.oppState, 1, 'opportunity is Won');
    ok(!W.events.includes('SET_STATUS'), 'stale client process state not used to finish'); eq(W.instPosts, 0, 'no duplicate BPF instance'); }
  { const W = world(5), w = boot(W); await win(w, false); eq(W.events.filter((e) => e === 'PATCH_BPF' || e === 'SET_ACTIVE').length, 0, 'already on the last stage: no stage change at all'); eq(W.oppState, 1, 'won'); }
  { const W = world(0), w = boot(W); W.patchBpfFails = true; await win(w, false); eq(W.events.filter((e) => e === 'SET_ACTIVE').length, 1, 'API refused: one supported client stage change, still no walk'); eq(W.oppState, 1, 'won'); }
  { const W = world(0), w = boot(W); const of = W.fetch; W.fetch = async (u, o: any = {}) => (/opportunitysalesprocesses\(/.test(u) && /statecode/.test(o.body || '')) ? { ok: false, status: 500, statusText: 'x', json: async () => ({ error: { message: 'cannot finish' } }) } : of(u, o);
    const out = await win(w, false); eq(W.oppState, 0, 'direct mode: BPF not finished -> NOT won'); ok(/هنوز فعال/.test(out), 'reported'); }

  console.log('\n[C] Independence');
  { const body = fs.readFileSync(new URL('../src/close/stage-dialog.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    ok(!/fillAndAdvanceStages\(|winOpportunity\(|finishProcess\(|moveNext\(/.test(body), 'manual-change code (stage-dialog.ts) never references the Close-as-Won functions or moveNext'); }
    console.log(`\nRESULT: ${pass} passed, ${fail} failed`); if (fail) console.log(bad.join('\n')); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
