// Actual recorded-response/product/reference owners over declared memory
// application and record-reader ports. Component close timers are cooperative.
// No SDK, SQL, socket, key, signature, nonce search or native entry is executed.
import assert from 'node:assert/strict';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { recordedResultFixture, deferred } from './api-credit-recorded-result.fixture.mjs';

const F = Object.freeze, checks = [], owned = [];
function check(id, run) { checks.push(F({ id, run })); }
async function flush() { for (let i = 0; i < 48; i++) await Promise.resolve(); }
export function recordedBorrowFixture(options = {}) {
  let probe;
  const r = recordedResultFixture({ onSubmit: options.onSubmit ?? null,
    wrapDeclaredApplication(s, original) {
      probe = { r: s, viewAction: null, readAction: null, readOverride: null, viewOverride: null,
        views: 0, reads: 0, closes: 0, stop: null, opaque: [], native: original };
      return F({ ...original,
        inspect: F(() => {
          probe.views++; const snapshot = original.inspect(), action = probe.viewAction; probe.viewAction = null;
          if (action) action(probe);
          return probe.viewOverride ? probe.viewOverride() : snapshot;
        }),
        close: F(() => { probe.closes++; const receipt = original.close(); return options.nonvoidClose ? receipt.then(() => true) : receipt; })
      });
    },
    wrapDeclaredReadState(s, read) {
      return F(key => {
        probe.reads++; const action = probe.readAction; probe.readAction = null;
        if (action) action(probe);
        return probe.readOverride ? probe.readOverride(key) : read(key);
      });
    }
  });
  probe.r = r; owned.push(probe); return probe;
}
function stop(p) {
  p.stop = p.r.root.close(); p.stop.then(() => {}, () => {}); p.closeEntriesInsideCallback = p.closes;
}
async function ready(options = {}) { const p = recordedBorrowFixture(options); await p.r.start(); return p; }
async function rejected(promise) { const out = await Promise.allSettled([promise]); assert.equal(out[0].status, 'rejected'); return out[0]; }
export async function observeRecordedPostCloseLookup() {
  const p = await ready(), before = p.reads; p.viewAction = stop;
  await rejected(p.r.root.submitOriginal(p.r.request())); await rejected(p.stop); await flush();
  return { p, postCloseReads: p.reads - before, closeEntriesInsideCallback: p.closeEntriesInsideCallback };
}
export async function observeRecordedInspectionReentry() {
  const p = await ready(), request = p.r.request('request.seed'); await p.r.root.submitOriginal(request);
  const before = p.reads; let nested;
  p.viewAction = q => { nested = q.r.root.submitOriginal(request); nested.then(() => {}, () => {}); };
  const outer = await Promise.allSettled([p.r.root.submitOriginal(request)]), inner = await Promise.allSettled([nested]);
  return { p, reads: p.reads - before, outer: outer[0], inner: inner[0] };
}
export async function observeRecordedReadClose() {
  const p = await ready(); p.readAction = stop;
  await rejected(p.r.root.submitOriginal(p.r.request())); await rejected(p.stop); await flush();
  return { p, closeEntriesInsideCallback: p.closeEntriesInsideCallback };
}
export async function observeRecordedOpaqueRead() {
  const p = await ready(), pending = deferred(); p.opaque.push(pending); p.readOverride = () => pending.promise;
  await rejected(p.r.root.submitOriginal(p.r.request())); await rejected(p.r.root.close());
  return { p, pending, closeEntries: p.closes };
}
export async function closeRecordedBorrowFixtures() {
  for (const p of owned) {
    for (const opaque of p.opaque) opaque.resolve(null);
    await flush(); await p.r.cleanup();
    // This fixture owns only declared memory ports. No production owner is
    // force-closed, reopened or repaired by this test-resource disposal.
    await p.native.close().catch(() => {});
  }
}

check('recorded-inspection-close-denies-the-first-record-lookup', async () => {
  const p = await ready(), before = p.reads; p.viewAction = stop;
  await rejected(p.r.root.submitOriginal(p.r.request())); await p.stop;
  assert.equal(p.reads, before); assert.equal(p.closeEntriesInsideCallback, 0); assert.equal(p.closes, 1);
  assert.equal(p.r.root.inspect().held, false); await rejected(p.r.root.submitOriginal(p.r.request()));
});
check('recorded-inspection-reentry-denies-a-second-cached-lookup', async () => {
  const r = await observeRecordedInspectionReentry();
  assert.equal(r.inner.status, 'rejected'); assert.equal(r.outer.status, 'fulfilled'); assert.equal(r.reads, 1);
  assert.equal(r.p.r.h.counts.executions, 1); assert.equal(r.p.r.root.inspect().held, false);
});
check('recorded-read-close-waits-for-the-synchronous-borrower', async () => {
  const r = await observeRecordedReadClose(); assert.equal(r.closeEntriesInsideCallback, 0); assert.equal(r.p.closes, 1);
  assert.equal(r.p.r.root.inspect().held, true); assert.equal(r.p.r.h.counts.executions, 0);
});
check('recorded-public-inspection-cannot-admit-work-or-close-the-child-inline', async () => {
  const p = await ready(), before = p.reads; let nested;
  p.viewAction = q => { nested = q.r.root.submitOriginal(q.r.request()); nested.then(() => {}, () => {}); stop(q); assert.equal(q.closes, 0); };
  const view = p.r.root.inspect(); await rejected(nested); await p.stop;
  assert.equal(view.lifecycle, 'CLOSING'); assert.equal(view.held, false); assert.equal(p.reads, before); assert.equal(p.closes, 1);
});
check('recorded-opaque-read-keeps-the-original-owner-held-without-stop', async () => {
  const r = await observeRecordedOpaqueRead(); assert.equal(r.closeEntries, 0); assert.equal(r.p.r.root.inspect().held, true);
  r.pending.resolve(null); await flush(); await rejected(r.p.r.root.close()); assert.equal(r.p.closes, 0);
  await rejected(r.p.r.root.submitOriginal(r.p.r.request())); assert.equal(r.p.closes, 0);
});
check('recorded-throwing-read-keeps-unknown-ownership-without-a-competing-stop', async () => {
  const p = await ready(); p.readOverride = () => { throw Error('declared missing read receipt'); };
  await rejected(p.r.root.submitOriginal(p.r.request())); await rejected(p.r.root.close()); assert.equal(p.closes, 0);
  assert.equal(p.r.root.inspect().held, true);
});
check('recorded-opaque-inspection-does-not-open-a-record-reader-or-stop', async () => {
  const p = await ready(), pending = deferred(), before = p.reads; p.opaque.push(pending); p.viewOverride = () => pending.promise;
  await rejected(p.r.root.submitOriginal(p.r.request())); p.viewOverride = null; await rejected(p.r.root.close());
  assert.equal(p.reads, before); assert.equal(p.closes, 0); assert.equal(p.r.root.inspect().held, true);
});
check('recorded-throwing-inspection-is-sticky-unknown-without-stop', async () => {
  const p = await ready(), before = p.reads; p.viewAction = () => { throw Error('declared missing inspection receipt'); };
  await rejected(p.r.root.submitOriginal(p.r.request())); await rejected(p.r.root.close());
  assert.equal(p.reads, before); assert.equal(p.closes, 0); assert.equal(p.r.root.inspect().held, true);
});
check('recorded-thenable-read-is-not-assimilated-or-used-as-close-evidence', async () => {
  const p = await ready(); let hooks = 0; const opaque = {};
  Object.defineProperty(opaque, 'then', { enumerable: true, get() { hooks++; throw Error('must not enter'); } });
  F(opaque); p.readOverride = () => opaque;
  await rejected(p.r.root.submitOriginal(p.r.request())); await rejected(p.r.root.close());
  assert.equal(hooks, 0); assert.equal(p.closes, 0); assert.equal(p.r.root.inspect().held, true);
});
check('recorded-normal-first-response-and-replay-preserve-original-state', async () => {
  const p = await ready(), input = p.r.request(), first = await p.r.root.submitOriginal(input);
  const model = JSON.stringify(p.r.h.model.exportState()), spending = p.r.h.raw(), replay = await p.r.root.submitOriginal({ ...input });
  assert.equal(first.replayed, false); assert.equal(first.newDispatchRequested, true); assert.equal(replay.replayed, true);
  assert.equal(replay.newDispatchRequested, false); assert.equal(replay.responseJson, first.responseJson);
  assert.equal(JSON.stringify(p.r.h.model.exportState()), model); assert.equal(p.r.h.raw(), spending);
  assert.equal(p.r.h.counts.funding, 1); assert.equal(p.r.h.counts.executions, 1);
});
check('recorded-original-conflict-keeps-the-unchanged-replay-available', async () => {
  const p = await ready(), input = p.r.request(), first = await p.r.root.submitOriginal(input);
  await rejected(p.r.root.submitOriginal(p.r.request('request.1', { maxCostUnits: 2 })));
  assert.equal(p.r.root.inspect().held, false); assert.equal((await p.r.root.submitOriginal(input)).responseJson, first.responseJson);
  assert.equal(p.r.h.counts.executions, 1);
});
check('recorded-close-during-post-dispatch-read-retains-the-one-entered-execution', async () => {
  const p = await ready(); let calls = 0; p.readOverride = key => {
    calls++; if (calls === 2) stop(p); return p.r.records.get(key.requestId) ?? null;
  };
  await rejected(p.r.root.submitOriginal(p.r.request())); await rejected(p.stop);
  assert.equal(p.closeEntriesInsideCallback, 0); assert.equal(p.closes, 1); assert.equal(p.r.h.counts.executions, 1);
  assert.equal(p.r.root.inspect().held, true); await rejected(p.r.root.submitOriginal(p.r.request()));
});
check('recorded-entered-dispatch-late-completion-cannot-repair-stop', async () => {
  const pending = deferred(), p = await ready({ onSubmit: () => pending.promise });
  const out = p.r.root.submitOriginal(p.r.request()); out.then(() => {}, () => {}); await flush();
  const closing = p.r.root.close(); closing.then(() => {}, () => {}); pending.resolve(undefined);
  await rejected(out); await rejected(closing); assert.equal(p.r.h.counts.executions, 1); assert.equal(p.closes, 1);
  assert.equal(p.r.root.inspect().held, true); await rejected(p.r.root.submitOriginal(p.r.request()));
});
check('recorded-nonvoid-child-close-remains-unknown-and-is-not-retried', async () => {
  const p = await ready({ nonvoidClose: true }); await rejected(p.r.root.close()); await rejected(p.r.root.close());
  assert.equal(p.closes, 1); assert.equal(p.r.root.inspect().held, true);
});
check('recorded-invalid-input-or-arity-does-not-borrow-state', async () => {
  const p = await ready(), before = { reads: p.reads, views: p.views };
  await rejected(p.r.root.submitOriginal()); await rejected(p.r.root.submitOriginal({}));
  assert.deepEqual({ reads: p.reads, views: p.views }, before); await p.r.root.submitOriginal(p.r.request());
});

export const recordedResultBorrowDataCases = F([...checks]);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = []; let current = null, reported = false;
  function report() {
    if (reported) return; reported = true; const failed = cases.filter(c => c.status === 'FAIL').length;
    console.log(JSON.stringify({ qualification: 'G2_RECORDED_RESULT_BORROWS_DATA', passed: cases.length - failed, failed, cases,
      actualRecordedResponseProductAndReferenceOwners: true, declaredMemoryBorrowPorts: true, componentCooperativeTimers: true,
      nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0,
      actualPrepare: 0, payouts: 0, physicalRelease: 'NOT_ESTABLISHED', nativeReopen: 'NOT_ESTABLISHED', G0G5Acceptance: 'OPEN' }));
    if (failed) process.exitCode = 1;
  }
  process.once('beforeExit', () => { if (cases.length !== checks.length) { cases.push({ id: current ?? 'incomplete', status: 'FAIL', error: 'UNSETTLED_DATA_PROMISE' }); report(); process.exitCode = 1; } });
  for (const c of checks) { current = c.id; try { await c.run(); cases.push({ id: c.id, status: 'PASS' }); } catch { cases.push({ id: c.id, status: 'FAIL', error: 'DATA_ASSERTION' }); } }
  await closeRecordedBorrowFixtures(); report();
}
