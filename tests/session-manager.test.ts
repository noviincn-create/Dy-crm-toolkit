// Core Session Manager tests (pure TypeScript, no browser): lifecycle, pause/resume, independence, persistence, recovery, reliability.
// Usage: tsx tests/session-manager.test.ts
import { SessionManager } from '../src/session-manager/manager';
import { MemoryStorageAdapter, KEY } from '../src/session-manager/storage';
import { TRANSITIONS, canTransition, allowedActions } from '../src/session-manager/state-machine';
import { handleSmMessage } from '../src/session-manager/service';
import { parseRequest } from '../src/session-manager/messages';
import { SessionScheduler } from '../src/session-manager/scheduler';
import { SM_EVENT_TYPES, SESSION_STATES, SmError } from '../src/session-manager/types';

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const eq = (a: any, b: any, m: string) => ok(a === b, m + (a === b ? '' : ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`));
const rejects = async (p: Promise<any>, code: string, m: string) => { try { await p; ok(false, m + ' (did not reject)'); } catch (e: any) { ok(e instanceof SmError && e.code === code, m + (e?.code === code ? '' : ` (got ${e?.code ?? e})`)); } };
const MIN = 60_000, HOUR = 3_600_000;

function rig(opts: any = {}) {
  const storage = opts.storage ?? new MemoryStorageAdapter();
  const clock = { t: opts.t0 ?? 1_800_000_000_000 };
  let n = 0;
  const mk = () => new SessionManager({ storage, now: () => clock.t, newId: () => 'sess-' + String(++n).padStart(3, '0') + (opts.idSuffix ?? ''), ...opts.mgr });
  return { storage, clock, mk, m: mk(), advance: (ms: number) => { clock.t += ms; } };
}
const OPP = 'opportunity-meeting';

(async () => {
  console.log('[state machine]');
  for (const [a, b] of [['IDLE', 'RUNNING'], ['RUNNING', 'PAUSING'], ['PAUSING', 'PAUSED'], ['PAUSED', 'RESUMING'], ['RESUMING', 'RUNNING'], ['RUNNING', 'COMPLETED'], ['RUNNING', 'FAILED'], ['RUNNING', 'CANCELLING'], ['CANCELLING', 'CANCELLED'], ['PAUSED', 'CANCELLED']] as const)
    ok(canTransition(a, b), `${a} -> ${b} allowed`);
  for (const [a, b] of [['IDLE', 'PAUSED'], ['RUNNING', 'PAUSED'], ['PAUSED', 'RUNNING'], ['PAUSED', 'COMPLETED'], ['COMPLETED', 'RUNNING'], ['CANCELLED', 'RUNNING'], ['FAILED', 'RUNNING'], ['RUNNING', 'RESUMING']] as const)
    ok(!canTransition(a, b), `${a} -> ${b} rejected`);
  ok(SESSION_STATES.every((s) => s in TRANSITIONS), 'every state has a transition entry');
  ok(['COMPLETED', 'FAILED', 'CANCELLED'].every((s) => TRANSITIONS[s as 'COMPLETED'].length === 0), 'terminal states have no exits');
  ok(allowedActions('PAUSED').resume && !allowedActions('PAUSED').end && !allowedActions('PAUSED').pause, 'PAUSED: only resume/cancel offered, End blocked');

  console.log('[lifecycle + clock]');
  {
    const { m, advance } = rig();
    const s = await m.create({ type: OPP, name: 'مشتری', externalRef: 'opp-1' });
    eq(s.state, 'IDLE', 'created as IDLE');
    await rejects(m.pause(s.id), 'INVALID_TRANSITION', 'pause from IDLE rejected');
    await rejects(m.complete(s.id), 'INVALID_TRANSITION', 'complete from IDLE rejected');
    let r = await m.start(s.id); eq(r.state, 'RUNNING', 'start -> RUNNING');
    advance(10 * MIN);
    r = await m.pause(s.id, 'lunch'); eq(r.state, 'PAUSED', 'pause with nothing in flight -> PAUSED immediately');
    eq(r.activeMs, 10 * MIN, 'active time = 10 min at pause');
    advance(45 * MIN); // paused: clock must not run
    eq((await m.getStatus(s.id)).activeMs, 10 * MIN, '45 paused minutes are NOT counted');
    r = await m.resume(s.id); eq(r.state, 'RUNNING', 'resume -> RUNNING');
    ok(r.pauses.length === 1 && r.pauses[0]!.resumedAt !== undefined && r.pauses[0]!.pausedAt < r.pauses[0]!.resumedAt!, 'pause history recorded with resume time');
    advance(5 * MIN);
    eq((await m.getStatus(s.id)).activeMs, 15 * MIN, 'after resume the clock continues (10 + 5)');
    await rejects(m.start('nope'), 'NOT_FOUND', 'unknown session -> NOT_FOUND');
    r = await m.complete(s.id); eq(r.state, 'COMPLETED', 'complete');
    eq(r.activeMs, 15 * MIN, 'final active time kept');
    await rejects(m.pause(s.id), 'INVALID_TRANSITION', 'terminal sessions cannot be paused');
    await rejects(m.resume(s.id), 'INVALID_TRANSITION', 'terminal sessions cannot be resumed');
    ok(r.history.map((h) => h.to).join() === 'RUNNING,PAUSING,PAUSED,RESUMING,RUNNING,COMPLETED', 'history lists every transition');
  }

  console.log('[cooperative pause / cancel]');
  {
    const { m, advance } = rig();
    const s = await m.create({ type: OPP, name: 'a', externalRef: 'o', autoStart: true });
    advance(MIN);
    const b = await m.beginOperation(s.id, { key: 'end-product:o', label: 'افزودن محصول' });
    ok(b.ok && b.activeMs === MIN, 'beginOperation returns the active time (1 min)');
    let r = await m.pause(s.id);
    eq(r.state, 'PAUSING', 'pause during in-flight op -> PAUSING (not PAUSED: op still executing)');
    ok(await m.shouldYield(s.id), 'shouldYield() tells the worker to stop starting new units');
    advance(3 * MIN);
    eq(r.activeMs, MIN, 'clock stopped at the pause request');
    const b2 = await m.beginOperation(s.id, { key: 'other', label: 'x' });
    ok(!b2.ok && b2.reason === 'state', 'no new operation may start while pausing');
    r = await m.endOperation(s.id, 'end-product:o', { ok: true });
    eq(r.state, 'PAUSED', 'PAUSED only after the in-flight op reached its safe point');
    // finalising op that finishes while PAUSING completes the session
    await m.resume(s.id);
    await m.beginOperation(s.id, { key: 'fin', label: 'f' });
    await m.pause(s.id);
    r = await m.endOperation(s.id, 'fin', { ok: true, finalize: true });
    eq(r.state, 'COMPLETED', 'a successful finalising op wins over a pending pause');
    // cancel while in flight
    const c = await m.create({ type: OPP, name: 'c', externalRef: 'o2', autoStart: true });
    await m.beginOperation(c.id, { key: 'k', label: 'k' });
    r = await m.cancel(c.id); eq(r.state, 'CANCELLING', 'cancel during in-flight op -> CANCELLING');
    r = await m.endOperation(c.id, 'k', { ok: false, error: 'boom' }); eq(r.state, 'CANCELLED', 'CANCELLED after the op settled');
    ok(r.errors.length === 1, 'failed op recorded in error history');
  }

  console.log('[independence]');
  {
    const { m, advance } = rig();
    const mk = async (n: string) => m.create({ type: OPP, name: n, externalRef: 'ext-' + n, autoStart: true });
    const sa = await mk('A'), sb = await mk('B'), sc = await mk('C'), sd = await mk('D'), se = await mk('E');
    await m.complete(sd.id); await m.fail(se.id, 'x');
    const before = { a: (await m.get(sa.id))!, c: (await m.get(sc.id))!, d: (await m.get(sd.id))!, e: (await m.get(se.id))! };
    advance(5 * MIN);
    await m.pause(sb.id);
    const after = { a: (await m.get(sa.id))!, c: (await m.get(sc.id))!, d: (await m.get(sd.id))!, e: (await m.get(se.id))! };
    ok(before.a.rev === after.a.rev && before.c.rev === after.c.rev && before.d.rev === after.d.rev && before.e.rev === after.e.rev, 'pausing B writes nothing to A, C, D, E');
    ok(after.a.state === 'RUNNING' && after.c.state === 'RUNNING' && after.d.state === 'COMPLETED' && after.e.state === 'FAILED', 'A/C running, D completed, E failed: unchanged');
    // one session failing does not touch the others
    await m.fail(sa.id, 'crm error');
    eq((await m.get(sc.id))!.state, 'RUNNING', 'failure of A does not stop C');
    // global controls respect per-session rules
    const sf = await m.create({ type: OPP, name: 'F', externalRef: 'ext-F', autoStart: true });
    let res = await m.pauseAll();
    ok(res.every((r) => r.ok) && res.length === 2, 'Pause All touches only RUNNING sessions (C, F)');
    eq((await m.get(sb.id))!.pauses.length, 1, 'already-paused B not paused twice');
    res = await m.resumeAll();
    eq(res.length, 3, 'Resume All resumes only PAUSED sessions (B, C, F)');
    ok((await m.get(sd.id))!.state === 'COMPLETED' && (await m.get(se.id))!.state === 'FAILED' && (await m.get(sa.id))!.state === 'FAILED', 'Resume All never revives completed/failed sessions');
    res = await m.cancelAll();
    eq(res.length, 3, 'Cancel All cancels the 3 live sessions only');
    ok((await m.get(sd.id))!.state === 'COMPLETED', 'Cancel All leaves COMPLETED alone');
    void sf;
  }

  console.log('[duplicate commands / races]');
  {
    const { m } = rig();
    const s = await m.create({ type: OPP, name: 'x', externalRef: 'x', autoStart: true });
    const ev: string[] = []; m.subscribe((e) => ev.push(e.type));
    const rs = await Promise.all([m.pause(s.id), m.pause(s.id), m.pause(s.id)]);
    ok(rs.every((r) => r.state === 'PAUSED'), 'three simultaneous Pause commands all succeed');
    const cur = (await m.get(s.id))!;
    eq(cur.pauses.length, 1, '... but only ONE pause is recorded');
    eq(ev.filter((e) => e === 'SESSION_PAUSED').length, 1, '... and only one SESSION_PAUSED event is emitted');
    await Promise.all([m.resume(s.id), m.resume(s.id), m.resume(s.id)]);
    const cur2 = (await m.get(s.id))!;
    ok(cur2.state === 'RUNNING' && cur2.history.filter((h) => h.to === 'RESUMING').length === 1, 'three simultaneous Resume commands -> one resume');
    ok(['SESSION_PAUSING', 'SESSION_PAUSED', 'SESSION_RESUMING', 'SESSION_RESUMED'].every((t) => ev.includes(t)) && !ev.includes('SESSION_STARTED'), 'event stream: PAUSING, PAUSED, RESUMING, RESUMED (no bogus STARTED on resume)');
    const mixed = await Promise.allSettled([m.pause(s.id), m.cancel(s.id)]);
    const fin = (await m.get(s.id))!;
    ok(['CANCELLED'].includes(fin.state) || fin.state === 'PAUSED', 'concurrent pause+cancel end in a consistent state: ' + fin.state);
    void mixed;
    // many creates at once must not lose index entries
    const r2 = rig();
    await Promise.all(Array.from({ length: 25 }, (_, i) => r2.m.create({ type: 'generic', name: 'n' + i })));
    eq((await r2.m.list()).length, 25, '25 concurrent creates -> 25 sessions listed (no lost index entry)');
    ok(new Set((await r2.m.list()).map((x) => x.id)).size === 25, 'all ids unique');
  }

  console.log('[operations: idempotency + record locks]');
  {
    const { m, advance } = rig({ mgr: { opStaleMs: 2 * MIN } });
    const a = await m.create({ type: OPP, name: 'a', externalRef: 'opp-1', autoStart: true });
    const b = await m.create({ type: OPP, name: 'b', externalRef: 'opp-1', autoStart: true });
    let r = await m.beginOperation(a.id, { key: 'k1', label: 'l', recordKey: 'opportunity:opp-1' });
    ok(r.ok, 'first begin ok');
    r = await m.beginOperation(a.id, { key: 'k1', label: 'l' }); ok(!r.ok && r.reason === 'inflight', 'same key while in flight -> refused (no duplicate execution)');
    r = await m.beginOperation(b.id, { key: 'k2', label: 'l', recordKey: 'opportunity:opp-1' });
    ok(!r.ok && r.reason === 'record-locked', 'second session on the same CRM record is blocked');
    await m.endOperation(a.id, 'k1', { ok: true });
    r = await m.beginOperation(a.id, { key: 'k1', label: 'l' }); ok(!r.ok && r.reason === 'already-done', 'completed key is never executed again');
    r = await m.beginOperation(b.id, { key: 'k2', label: 'l', recordKey: 'opportunity:opp-1' }); ok(r.ok, 'after the first op finished the record is free');
    await m.endOperation(b.id, 'k2', { ok: false, error: 'crm 500' });
    r = await m.beginOperation(b.id, { key: 'k2', label: 'l' }); ok(r.ok, 'a FAILED op may be retried');
    // stale lock expires
    const c = await m.create({ type: OPP, name: 'c', externalRef: 'opp-9', autoStart: true });
    const d = await m.create({ type: OPP, name: 'd', externalRef: 'opp-9', autoStart: true });
    await m.beginOperation(c.id, { key: 'x', label: 'l', recordKey: 'opportunity:opp-9' });
    advance(3 * MIN);
    r = await m.beginOperation(d.id, { key: 'y', label: 'l', recordKey: 'opportunity:opp-9' }); ok(r.ok, 'a stale lock (dead holder) does not block forever');
  }

  console.log('[checkpoints]');
  {
    const { m, storage } = rig();
    const s = await m.create({ type: 'generic', name: 'cp', autoStart: true });
    let r = await m.saveCheckpoint(s.id, 'step-2', { done: ['a', 'b'] });
    ok(r.checkpoints.length === 1 && r.step === 'step-2' && r.checkpoints[0]!.checksum.length === 8, 'checkpoint saved with checksum');
    await rejects(m.saveCheckpoint(s.id, 's', { accessToken: 'abc' }), 'INVALID_ARGUMENT', 'credentials in a checkpoint are refused');
    await rejects(m.saveCheckpoint(s.id, 's', { nested: { password: 'x' } }), 'INVALID_ARGUMENT', '... also when nested');
    await rejects(m.saveCheckpoint(s.id, 's', { blob: 'x'.repeat(20000) }), 'INVALID_ARGUMENT', 'oversized checkpoint refused');
    for (let i = 3; i <= 9; i++) r = await m.saveCheckpoint(s.id, 'step-' + i, { i });
    eq(r.checkpoints.length, 5, 'only the last 5 checkpoints are kept');
    await m.pause(s.id); await m.saveCheckpoint(s.id, 'x', {}).catch(() => 0);
    r = await m.resume(s.id); eq(r.step, 'step-9', 'resume restores the latest checkpoint step');
    // tamper with every checkpoint -> resume refuses to continue blindly
    await m.pause(s.id);
    const raw: any = (await storage.get([KEY.session(s.id)]))[KEY.session(s.id)];
    raw.checkpoints.forEach((c: any) => { c.data.tampered = true; });
    await storage.set({ [KEY.session(s.id)]: raw });
    r = await m.resume(s.id);
    eq(r.state, 'RECOVERY_REQUIRED', 'all checkpoints invalid -> RECOVERY_REQUIRED (not a blind resume)');
    ok(r.recovery !== null, 'recovery reason recorded');
  }

  console.log('[persistence + service worker restart + recovery]');
  {
    const R = rig();
    const { m, storage, advance, mk } = R;
    const run = await m.create({ type: OPP, name: 'running', externalRef: 'r', autoStart: true });
    const pau = await m.create({ type: OPP, name: 'paused', externalRef: 'p', autoStart: true });
    advance(4 * MIN);
    await m.pause(pau.id);
    await m.saveCheckpoint(run.id, 'halfway', { n: 1 });
    // ---- worker killed: all in-memory state lost ----
    const m2 = mk();
    const l = await m2.list();
    eq(l.length, 2, 'new manager instance (restarted worker) sees both sessions');
    eq((await m2.get(pau.id))!.activeMs, 4 * MIN, 'paused session keeps its active time');
    advance(2 * MIN);
    const rep = await m2.recover();
    ok(rep.required.length === 0 && (await m2.get(run.id))!.state === 'RUNNING', 'worker restart does NOT disturb a healthy RUNNING session');
    eq((await m2.get(run.id))!.rev, (await m.get(run.id))!.rev, '... and rewrites nothing (no rev churn)');
    eq((await m2.getStatus(run.id)).activeMs, 6 * MIN, 'running clock survived the restart (timestamp based)');
    ok((await m2.get(run.id))!.checkpoints.length === 1, 'checkpoint survived');
    // interrupted operation: page/worker died mid-op
    await m2.beginOperation(run.id, { key: 'end-product:r', label: 'افزودن محصول' });
    advance(10 * MIN);
    const m3 = mk();
    const rep2 = await m3.recover();
    eq(rep2.required[0], run.id, 'stale in-flight op -> RECOVERY_REQUIRED');
    let r = (await m3.get(run.id))!;
    ok(r.operations[0]!.status === 'unknown', 'interrupted op is marked UNKNOWN (not assumed done or failed)');
    ok(r.activeMs < 10 * MIN + 6 * MIN, 'clock frozen at last activity, interruption time not billed: ' + r.activeMs / MIN + ' min');
    const frozen = r.activeMs; advance(HOUR);
    eq((await m3.getStatus(run.id)).activeMs, frozen, 'frozen while RECOVERY_REQUIRED');
    const bo = await m3.beginOperation(run.id, { key: 'end-product:r', label: 'افزودن محصول' });
    ok(bo.ok && bo.hadUnknown, 'reconciliation: op with unknown outcome is re-attempted only on explicit request');
    await m3.endOperation(run.id, 'end-product:r', { ok: true });
    ok(await m3.resumeAll().then((x) => x.every((y) => y.id !== run.id)), 'Resume All skips RECOVERY_REQUIRED sessions');
    r = await m3.resume(run.id); eq(r.state, 'RUNNING', 'explicit resume recovers the session');
    // crash between PAUSING and PAUSED
    const crash = await m3.create({ type: OPP, name: 'crash', externalRef: 'c', autoStart: true });
    const raw: any = (await storage.get([KEY.session(crash.id)]))[KEY.session(crash.id)];
    raw.state = 'PAUSING'; raw.runningSince = null; raw.pauses.push({ pausedAt: R.clock.t });
    await storage.set({ [KEY.session(crash.id)]: raw });
    await mk().recover();
    eq((await m3.get(crash.id))!.state, 'PAUSED', 'crash while PAUSING (nothing in flight) -> PAUSED on recovery');
    // stale activity (browser closed overnight)
    const st = await m3.create({ type: OPP, name: 'stale', externalRef: 's', autoStart: true });
    advance(2 * MIN); await m3.touch(st.id); advance(14 * HOUR);
    const m4 = mk(); const rep4 = await m4.recover();
    ok(rep4.required.includes(st.id), 'no activity for 14h -> RECOVERY_REQUIRED');
    const sr = (await m4.get(st.id))!;
    ok(sr.activeMs >= 2 * MIN && sr.activeMs < 5 * MIN, 'overnight hours are not billed (active ' + sr.activeMs / MIN + ' min)');
    // heartbeat keeps a long-lived session healthy
    const live = await m4.create({ type: OPP, name: 'live', externalRef: 'l', autoStart: true });
    for (let i = 0; i < 30; i++) { advance(HOUR); await m4.touch(live.id); }
    await m4.recover();
    eq((await m4.get(live.id))!.state, 'RUNNING', 'a session with heartbeats stays RUNNING for 30 h');
  }

  console.log('[adopt (legacy sessions)]');
  {
    const { m, clock } = rig();
    const started = clock.t - 7 * MIN;
    const a = await m.adopt({ type: OPP, name: 'قدیمی', externalRef: 'opp-L', startedAt: started });
    const b = await m.adopt({ type: OPP, name: 'قدیمی', externalRef: 'opp-L', startedAt: started });
    ok(a.id === b.id && (await m.list()).length === 1, 'adopt is idempotent per (type, externalRef)');
    eq((await m.getStatus(a.id)).activeMs, 7 * MIN, 'legacy start time kept: active time = wall clock until a pause happens');
    const future = await m.adopt({ type: OPP, name: 'f', externalRef: 'opp-F', startedAt: clock.t + HOUR });
    ok((await m.getStatus(future.id)).activeMs === 0, 'start time in the future is clamped');
    await m.complete(a.id);
    const again = await m.adopt({ type: OPP, name: 'قدیمی', externalRef: 'opp-L', startedAt: started });
    ok(again.id === a.id && again.state === 'COMPLETED', 'a finished session is not resurrected by adopt');
  }

  console.log('[storage integrity]');
  {
    const R = rig();
    const { m, storage } = R;
    await storage.set({ invoiceCfg: { a: 1 }, footerCfg: { b: 2 }, token: 'SECRET', 'dyEasyClose.session': 'legacy' });
    const good = await m.create({ type: OPP, name: 'good', externalRef: 'g', autoStart: true });
    const bad = await m.create({ type: OPP, name: 'bad', externalRef: 'b', autoStart: true });
    await storage.set({ [KEY.session(bad.id)]: { id: bad.id, state: 'NOPE', garbage: true } });
    const l = await m.listDetailed();
    ok(l.sessions.length === 1 && l.sessions[0]!.id === good.id, 'corrupt record excluded, healthy session unaffected');
    ok(l.quarantined.includes(bad.id) && (await storage.get([KEY.quarantine(bad.id)]))[KEY.quarantine(bad.id)] !== undefined, 'corrupt record quarantined (kept for diagnosis), not deleted');
    await storage.remove([KEY.idx]);
    eq((await rig({ storage }).mk().list()).length, 1, 'lost index is rebuilt from the session keys');
    await storage.set({ [KEY.session('future')]: { ...(await storage.get([KEY.session(good.id)]))[KEY.session(good.id)] as any, id: 'future', schema: 99 }, [KEY.idx]: [good.id, 'future'] });
    const l2 = await m.listDetailed();
    ok(l2.skipped.includes('future') && l2.sessions.length === 1, 'record from a NEWER schema is skipped, not destroyed');
    ok((await storage.get([KEY.session('future')]))[KEY.session('future')] !== undefined, '... and still in storage');
    eq((await storage.get(['token'])).token, 'SECRET', 'foreign keys (token) untouched');
    ok(JSON.stringify((await storage.get(['invoiceCfg', 'footerCfg', 'dyEasyClose.session']))) === JSON.stringify({ invoiceCfg: { a: 1 }, footerCfg: { b: 2 }, 'dyEasyClose.session': 'legacy' }), 'existing extension data intact');
    ok(![...storage.data.keys()].some((k) => !k.startsWith('sm.v1.') && !['invoiceCfg', 'footerCfg', 'token', 'dyEasyClose.session'].includes(k)), 'only sm.v1.* keys were created');
    // storage failures
    const f = rig();
    const s = await f.m.create({ type: OPP, name: 'f', externalRef: 'f', autoStart: true });
    f.storage.failSet = new Error('disk error');
    await rejects(f.m.pause(s.id), 'STORAGE_FAILED', 'failed write is reported');
    f.storage.failSet = null;
    eq((await f.m.get(s.id))!.state, 'RUNNING', 'failed write left the session RUNNING (no half state)');
    f.storage.failSet = new Error('QUOTA_BYTES quota exceeded');
    await rejects(f.m.pause(s.id), 'STORAGE_FULL', 'quota error -> STORAGE_FULL');
    f.storage.failSet = null;
    const evs: string[] = []; f.m.subscribe((e) => evs.push(e.type));
    f.storage.failSet = new Error('x'); await f.m.pause(s.id).catch(() => 0); f.storage.failSet = null;
    eq(evs.length, 0, 'no event is emitted for a change that was not persisted');
    // retention
    const p = rig({ mgr: { retentionMs: 1000 } });
    const old = await p.m.create({ type: 'generic', name: 'old', autoStart: true }); await p.m.complete(old.id);
    const keep = await p.m.create({ type: 'generic', name: 'keep', autoStart: true });
    p.advance(5000);
    const rp = await p.m.recover();
    ok(rp.purged.includes(old.id) && (await p.m.get(keep.id)) !== null, 'finished sessions past retention are purged; live ones never');
  }

  console.log('[messages / validation]');
  {
    const { m, clock } = rig();
    const req = (op: string, sessionId: string | null, payload: any = {}, extra: any = {}) => ({ v: 1, op, sessionId, ts: clock.t, correlationId: 'c1', payload, ...extra });
    const cr: any = await handleSmMessage(req('create', null, { type: OPP, name: 'n', externalRef: 'e', autoStart: true }), m);
    ok(cr.ok && cr.data.state === 'RUNNING' && cr.correlationId === 'c1', 'create via message: ok + correlation id echoed');
    const id = cr.data.id;
    ok((await handleSmMessage(req('pause', id, { reason: 'r' }), m) as any).data.state === 'PAUSED', 'pause via message');
    for (const [label, bad] of [
      ['wrong version', { ...req('pause', id), v: 2 }], ['unknown op', req('explode', id)], ['missing session id', req('pause', null)],
      ['bad payload type', req('fail', id, { message: 42 })], ['payload not an object', { ...req('pause', id), payload: 'x' }],
      ['bad timestamp', { ...req('pause', id), ts: 'now' }], ['oversized name', req('create', null, { type: OPP, name: 'x'.repeat(500) })],
      ['meta with object value', req('create', null, { type: OPP, name: 'n', meta: { a: { b: 1 } } })], ['null', null], ['array', []],
    ] as const) {
      const r: any = await handleSmMessage(bad, m);
      ok(r.ok === false && r.code === 'INVALID_ARGUMENT', 'rejected: ' + label);
    }
    const nf: any = await handleSmMessage(req('resume', 'ghost'), m); ok(!nf.ok && nf.code === 'NOT_FOUND', 'unknown session id -> NOT_FOUND');
    const ut: any = await handleSmMessage(req('create', null, { type: 'unregistered', name: 'n' }), m); ok(!ut.ok && ut.code === 'UNKNOWN_TYPE', 'unregistered session type rejected');
    const it: any = await handleSmMessage(req('complete', id), m); ok(!it.ok && it.code === 'INVALID_TRANSITION', 'invalid transition surfaced as a typed error');
    ok(parseRequest(req('list', null)).op === 'list', 'parseRequest accepts a valid request');
    ok(SM_EVENT_TYPES.length === 13, 'all 13 event types defined');
  }

  console.log('[scheduler]');
  {
    const sch = new SessionScheduler(); let a = 0, b = 0;
    sch.every('s1', 't', 10, () => a++); sch.every('s2', 't', 10, () => b++);
    await new Promise((r) => setTimeout(r, 55)); sch.suspend('s1'); const a1 = a;
    await new Promise((r) => setTimeout(r, 55));
    ok(a === a1 && b > a1, 'suspending s1 stops only s1 timers');
    sch.resume('s1'); await new Promise((r) => setTimeout(r, 40)); ok(a > a1, 'resume restarts them');
    sch.clear('s1'); sch.clear('s2'); ok(sch.ids().length === 0, 'clear removes timers');
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL unexpected exception:', e?.stack || e); console.log(`\nRESULT: ${pass} passed, ${fail + 1} failed`); process.exit(1); });
