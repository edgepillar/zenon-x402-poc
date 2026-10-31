// Actual recovery/product/custody controllers and reference recorded-result
// application over declared memory ports. The component close monitors use
// cooperative Node timers. No native launcher, SDK, SQL, key or socket runs.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { purchasedGrantHandoffFixture, deferred, flush } from './purchased-grant-handoff.fixture.mjs';

const F = Object.freeze, checks = [], owned = [];
const operations = ['prepareOriginalFunding', 'commitOriginalFunding', 'submitOriginalFunding', 'handoffToService', 'submitOriginal'];
function check(id, run) { checks.push(F({ id, run })); }
export function recoveryAdmissionFixture(options = {}) {
  const f = purchasedGrantHandoffFixture({ legacy: options.legacy === true,
    wrapDeclaredApplication(s, original) {
      s.entries = []; s.viewAction = null; s.viewEntries = 0; s.stop = null;
      s.serviceWait = null; s.closeCalls = 0;
      const selected = { ...original,
        inspect: F(() => {
          s.viewEntries++; const snapshot = original.inspect(), action = s.viewAction; s.viewAction = null;
          if (action) action(s); return snapshot;
        }),
        close: F(() => {
          s.closeCalls++; const receipt = original.close();
          return options.nonvoidClose ? receipt.then(() => true) : receipt;
        })
      };
      for (const name of operations) selected[name] = F(input => {
        s.entries.push(name);
        if (name === 'submitOriginal' && s.serviceWait !== null) return s.serviceWait.promise;
        return original[name](input);
      });
      return F(selected);
    }
  });
  owned.push(f); return f;
}
function stopInView(s) {
  s.stop = s.root.close(); s.closeCallsInsideView = s.closeCalls; s.stop.then(() => {}, () => {});
}
async function ready(f, operation) {
  if (operation !== 'prepareOriginalFunding') await f.prepare();
  if (!['prepareOriginalFunding', 'commitOriginalFunding'].includes(operation)) await f.commit();
  if (['handoffToService', 'submitOriginal'].includes(operation)) await f.submit();
  if (operation === 'submitOriginal') await f.handoff();
}
function input(f, operation) {
  if (operation === 'prepareOriginalFunding') return f.h.f.input;
  if (operation === 'commitOriginalFunding') return F({ expectedPins: f.h.packet.expectedPins, originalGrantQueryProfile: f.d.text });
  if (operation === 'submitOriginalFunding') return F({ expectedPins: f.h.packet.expectedPins });
  if (operation === 'handoffToService') return f.h.handoff();
  return f.r.request('request.outer');
}
export async function observeRecoveryCloseAdmission(operation = 'submitOriginal') {
  const f = recoveryAdmissionFixture(); await ready(f, operation);
  const before = { entries: f.entries.length, raw: f.raw, queries: f.queries,
    checkpoint: f.h.packet.serializedCheckpoint, claims: f.root.inspect().grantQueryRecovery };
  f.viewAction = stopInView;
  const result = await Promise.allSettled([f.root[operation](input(f, operation))]);
  const stopResult = await Promise.allSettled([f.stop]); await flush();
  return { f, before, result: result[0], stopResult: stopResult[0], postCloseEntries: f.entries.length - before.entries };
}
export async function observeRecoveryInspectionReentry(legacy = false) {
  const f = recoveryAdmissionFixture({ legacy }); await f.fund(); await f.handoff();
  let nested, nestedResult;
  const before = f.entries.length;
  f.viewAction = s => {
    nested = s.root.submitOriginal(s.r.request('request.nested'));
    nestedResult = nested.then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }));
  };
  const outer = await Promise.allSettled([f.root.submitOriginal(f.r.request('request.outer'))]);
  const inner = await nestedResult; await flush();
  return { f, outer: outer[0], inner, methodEntries: f.entries.length - before };
}
export async function closeRecoveryAdmissionFixtures() {
  for (const f of owned) await f.cleanup();
}

for (const operation of operations) {
  check('recovery-admission-close-in-inspect-fences-' + operation, async () => {
    const r = await observeRecoveryCloseAdmission(operation), { f, before } = r;
    assert.equal(r.result.status, 'rejected'); assert.equal(r.postCloseEntries, 0);
    assert.equal(r.stopResult.status, 'fulfilled'); assert.equal(r.stopResult.value, undefined);
    assert.equal(f.closeCallsInsideView, 0); assert.equal(f.closeCalls, 1); assert.equal(f.raw, before.raw); assert.equal(f.queries, before.queries);
    assert.equal(f.h.packet.serializedCheckpoint, before.checkpoint);
    const after = f.root.inspect().grantQueryRecovery;
    for (const key of ['prepareClaimed', 'commitClaimed', 'submissionClaimed', 'retains', 'reads']) assert.equal(after[key], before.claims[key]);
    await assert.rejects(f.root.submitOriginal({})); assert.equal(f.closeCalls, 1);
  });
}
for (const legacy of [false, true]) {
  check('recovery-admission-reserves-inspection-before-' + (legacy ? 'generic' : 'purchased') + '-reentry', async () => {
    const r = await observeRecoveryInspectionReentry(legacy);
    assert.equal(r.inner.status, 'rejected'); assert.equal(r.outer.status, 'fulfilled'); assert.equal(r.methodEntries, 1);
    assert.equal(r.f.h.counts.funding, 1); assert.equal(r.f.h.counts.executions, 1);
    assert.equal(r.f.root.inspect().held, false);
  });
}
check('recovery-admission-preserves-normal-original-replay-without-another-execution', async () => {
  const f = recoveryAdmissionFixture(); await f.fund(); await f.handoff(); const request = f.r.request('request.replay');
  const first = await f.root.submitOriginal(request), model = JSON.stringify(f.h.model.exportState());
  const spending = f.h.raw(), custody = f.raw, replay = await f.root.submitOriginal(request);
  assert.equal(first.replayed, false); assert.equal(first.newDispatchRequested, true);
  assert.equal(replay.replayed, true); assert.equal(replay.newDispatchRequested, false);
  assert.equal(typeof first.responseJson, 'string'); assert.equal(replay.responseJson, first.responseJson);
  assert.equal(replay.resultCode, first.resultCode); assert.equal(replay.grantId, first.grantId); assert.equal(replay.requestId, first.requestId);
  assert.equal(replay.authority, 'NONE'); assert.equal(JSON.stringify(f.h.model.exportState()), model);
  assert.equal(f.h.raw(), spending); assert.equal(f.raw, custody);
  assert.equal(f.h.counts.funding, 1); assert.equal(f.h.counts.executions, 1);
  assert.equal(f.entries.filter(name => name === 'submitOriginal').length, 2); assert.equal(f.queries, 1);
});
check('recovery-admission-releases-only-a-refused-preparation-claim', async () => {
  const f = recoveryAdmissionFixture(); await assert.rejects(f.root.prepareOriginalFunding({}));
  assert.equal(f.entries.length, 0); assert.equal(f.root.inspect().grantQueryRecovery.prepareClaimed, false);
  await f.prepare(); assert.equal(f.entries.filter(name => name === 'prepareOriginalFunding').length, 1);
  assert.equal(f.root.inspect().held, false);
});
check('recovery-admission-invalid-arity-does-not-borrow-child-inspection', async () => {
  const f = recoveryAdmissionFixture(), before = f.viewEntries;
  await assert.rejects(f.root.prepareOriginalFunding()); await assert.rejects(f.root.submitOriginal({}, {}));
  assert.equal(f.viewEntries, before); assert.equal(f.entries.length, 0); await f.prepare();
});
check('recovery-admission-inspection-refusal-stays-held-without-child-work', async () => {
  const f = recoveryAdmissionFixture(); f.viewAction = () => { throw Error('declared inspection refusal'); };
  await assert.rejects(f.prepare()); assert.equal(f.entries.length, 0); assert.equal(f.root.inspect().held, true);
  await assert.rejects(f.prepare()); await assert.rejects(f.root.close()); assert.equal(f.closeCalls, 1);
});
check('recovery-admission-late-entered-result-cannot-repair-stop-or-original-custody', async () => {
  const f = recoveryAdmissionFixture(); await f.fund(); await f.handoff();
  const original = f.raw, checkpoint = f.h.packet.serializedCheckpoint; f.serviceWait = deferred();
  const request = f.r.request('request.pending'), out = f.root.submitOriginal(request); out.then(() => {}, () => {});
  await flush(); const entered = f.entries.length; await assert.rejects(f.root.close());
  f.serviceWait.resolve(undefined); await assert.rejects(out); await assert.rejects(f.root.submitOriginal(request));
  assert.equal(f.entries.length, entered); assert.equal(f.raw, original); assert.equal(f.h.packet.serializedCheckpoint, checkpoint);
  assert.equal(f.root.inspect().held, true); assert.equal(f.closeCalls, 1); assert.equal(f.h.counts.executions, 0);
});
check('recovery-admission-nonvoid-close-remains-unknown-and-never-repeats-stop', async () => {
  const f = recoveryAdmissionFixture({ nonvoidClose: true }); await f.fund(); await f.handoff();
  const before = f.entries.length, raw = f.raw; f.viewAction = stopInView;
  await assert.rejects(f.root.submitOriginal(f.r.request('request.closed'))); await assert.rejects(f.stop);
  await assert.rejects(f.root.close()); assert.equal(f.entries.length, before); assert.equal(f.closeCalls, 1);
  assert.equal(f.raw, raw); assert.equal(f.root.inspect().held, true);
});

check('recovery-public-inspection-fences-reentrant-work-and-defers-child-close', async () => {
  const f = recoveryAdmissionFixture(); await f.fund(); await f.handoff();
  const before = f.entries.length; let nested;
  f.viewAction = s => {
    nested = s.root.submitOriginal(s.r.request('request.from-inspect')); nested.then(() => {}, () => {});
    stopInView(s); assert.equal(s.closeCallsInsideView, 0);
  };
  const view = f.root.inspect(); await assert.rejects(nested); await f.stop;
  assert.equal(f.entries.length, before); assert.equal(f.closeCalls, 1); assert.equal(view.held, false);
  assert.equal(f.root.inspect().lifecycle, 'CLOSED'); assert.equal(f.h.counts.executions, 0);
});

check('recovery-admission-latches-inspection-intrinsic-drift-before-child-entry', async () => {
  const f = recoveryAdmissionFixture(); await f.fund(); await f.handoff();
  const before = f.entries.length, descriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
  assert.equal(descriptor, undefined); let pending;
  f.viewAction = () => { Object.defineProperty(Object.prototype, 'toJSON', { value: F(() => { throw Error('must not enter'); }), configurable: true }); };
  try { pending = f.root.submitOriginal(f.r.request('request.intrinsic')); }
  finally { delete Object.prototype.toJSON; }
  await assert.rejects(pending); assert.equal(f.entries.length, before); assert.equal(f.root.inspect().held, true);
  await assert.rejects(f.root.submitOriginal(f.r.request('request.after-restore'))); await assert.rejects(f.root.close());
  assert.equal(f.entries.length, before); assert.equal(f.closeCalls, 1);
});

export const recoveryApplicationAdmissionDataCases = F([...checks]);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = []; let current = null, reported = false;
  function report() {
    if (reported) return; reported = true; const failed = cases.filter(c => c.status === 'FAIL').length;
    console.log(JSON.stringify({ qualification: 'G2_RECOVERY_APPLICATION_ADMISSION_DATA', passed: cases.length - failed, failed, cases,
      actualRecoveryProductCustodyAndReferenceResult: true, declaredMemoryInspectionReentry: true, componentCooperativeTimers: true,
      nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0,
      actualPrepare: 0, payouts: 0, nativePersistence: 'NOT_ESTABLISHED', physicalRelease: 'NOT_ESTABLISHED', G0G5Acceptance: 'OPEN' }));
    if (failed) process.exitCode = 1;
  }
  process.once('beforeExit', () => { if (cases.length !== checks.length) { cases.push({ id: current ?? 'incomplete', status: 'FAIL', error: 'UNSETTLED_DATA_PROMISE' }); report(); process.exitCode = 1; } });
  for (const c of checks) { current = c.id; try { await c.run(); cases.push({ id: c.id, status: 'PASS' }); } catch { cases.push({ id: c.id, status: 'FAIL', error: 'DATA_ASSERTION' }); } }
  await closeRecoveryAdmissionFixtures(); report();
}
