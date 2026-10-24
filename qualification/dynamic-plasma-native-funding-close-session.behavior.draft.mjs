/* Actual SDK/SQL/network-free close code. Native views and store boundaries are
 * declared DATA; no socket/native HTTPS, actual V4/payer/store or signer runs.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeOriginalFundingCloseSession as JOIN } from '../src/zenon/dynamic-plasma-native-funding-close-session.js';
import { createRetainedDynamicPlasmaReadSessionCore as READ_CORE } from '../src/zenon/dynamic-plasma-retained-read-session-core.js';
import { selectBoundedJsonRpcReadAdmissionProfile as PROFILE } from '../src/zenon/bounded-json-rpc-read-admission.js';
import { createNativeHttpsClientCloseOwner as FUND_CORE } from '../src/service-credit-native-client-close-owner.js';
import { createOriginalFundingBoundedReadCloseCoordinator as BOUND } from '../src/zenon/dynamic-plasma-original-funding-bounded-read-close.js';

assert.equal(process.argv.length, 2); assert.equal(process.version, 'v24.19.0');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
assert.equal(process.env.X402_NATIVE_FUNDING_CLOSE_SELECTION, 'twenty-sdk-free-close-composition-cases');
assert.ok(process.permission && !process.permission.has('child') && !process.permission.has('worker')
  && !process.permission.has('fs.write'));
const F = Object.freeze, CLOSED = F({ phase: 'CLOSED' }), STORE_CLOSED = F({ status: 'CLOSED' });
const OPTIONS = { concurrency: false, timeout: 3000 };
const totals = { entered: 0, completed: 0, hooks: 0, reads: 0, fundingEntries: 0,
  actualReadCoreConstructions: 0, actualFundingCoreConstructions: 0, declaredStoreEntries: 0 };
function deferred() {
  let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => undefined); return { promise, resolve, reject };
}
const ticks = async () => { for (let index = 0; index < 12; index++) await undefined; };
const cleanRead = () => F({ retainedReadSessionVersion: 1, lifecycle: 'CLOSED', closeUncertaintyLatched: false,
  closeRequested: 3, closeSettled: 3, closeFulfilledUndefined: 3 });
const cleanOwner = () => F({ nativeReadCustodyVersion: 1, closeRequested: true, closePromiseSettled: true,
  uncertaintyLatched: false, retiredErrorObserved: false, activeGeneration: false, closeObserved: true,
  trackedRequests: 0, trackedResponses: 0, trackedSockets: 0, trackedAgents: 0, ownedTimers: 0 });
const cleanNative = () => F({ nativeReadSessionCustodyVersion: 2, owners: F([cleanOwner(), cleanOwner(), cleanOwner()]) });
const cleanFunding = () => F({ phase: 'CLOSED', unknown: false, trackedRequests: 0, trackedSockets: 0, ownedTimers: 0,
  close: F({ phase: 'CLOSED', unknown: false, closeRequested: true, closePromiseOutcome: 'CLOSED',
    observing: false, quiescenceObserved: true, lastObservedCounts: F({ requests: 0, sockets: 0, timers: 0 }),
    localMaterialRelease: F({ attempts: 1, outcome: 'RETURNED' }) }) });
function invalid(kind = 'close_unknown') { return error => {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'native_original_funding_close_session_' + kind);
  assert.equal(error.stack, 'TypeError: ' + error.code); assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}; }
const boundedUnknown = error => error?.code === 'original_funding_bounded_read_close_close_unknown';
function declared(options = {}) {
  const count = { reads: 0, posts: 0, readViews: 0, nativeViews: 0, postViews: 0 };
  let read = cleanRead(), native = cleanNative(), funding = cleanFunding();
  const rp = options.readPromise ?? Promise.resolve(undefined), fp = options.fundingPromise ?? Promise.resolve(CLOSED);
  if (rp instanceof Promise) rp.catch(() => undefined);
  if (fp instanceof Promise) fp.catch(() => undefined);
  let api;
  const reads = F({ readOptions: F({ declaredReadOptions: true }),
    close: F(function close() { totals.reads++; count.reads++; return options.readClose ? options.readClose(api) : rp; }),
    inspect: F(function inspect() { count.readViews++; return options.readView ? options.readView(api) : read; }),
    inspectNativeCustody: F(function inspectNativeCustody() { count.nativeViews++; return options.nativeView ? options.nativeView(api) : native; }) });
  const post = F({ fetchImpl: F(function fetchImpl() { totals.hooks++; throw new Error('NO_FETCH'); }),
    close: F(function close() { totals.fundingEntries++; count.posts++; return options.fundingClose ? options.fundingClose(api) : fp; }),
    snapshot: F(function snapshot() { count.postViews++; return options.fundingView ? options.fundingView(api) : funding; }) });
  api = JOIN(reads, post);
  return { api, reads, post, count, setRead: value => { read = value; },
    setNative: value => { native = value; }, setFunding: value => { funding = value; } };
}
function composed({ firstRead = null, operation = null, storeWork = null, budget = 500 } = {}) {
  totals.actualReadCoreConstructions++; totals.actualFundingCoreConstructions++;
  const count = { readCloses: [0, 0, 0], postCloses: 0, releases: 0, storeCallbacks: 0, storeEntries: 0 };
  const promises = [firstRead ?? Promise.resolve(undefined), Promise.resolve(undefined), Promise.resolve(undefined)];
  for (const p of promises) p.catch(() => undefined);
  const closes = promises.map((p, index) => F(function close() { count.readCloses[index]++; return p; }));
  const reads = promises.map(() => F(function read() { totals.hooks++; throw new Error('NO_READ'); }));
  const dp = PROFILE('dynamic_plasma_retained_candidate'), account = PROFILE('zenon_account_state_retained_candidate');
  const core = READ_CORE(F({
    firstOwner: F({ transport: F({ callRead: reads[0] }), close: closes[0], requestBudget: dp }),
    secondOwner: F({ transport: F({ callRead: reads[1] }), close: closes[1], requestBudget: dp }),
    accountOwner: F({ exchange: reads[2], close: closes[2], requestBudget: account }),
  }));
  let native = cleanNative();
  const fundCore = FUND_CORE({
    readObservedCounts: F(function readObservedCounts() { return F({ requests: 0, sockets: 0, timers: 0 }); }),
    releaseLocalMaterial: F(function releaseLocalMaterial() { count.releases++; }),
  });
  const funding = F({
    fetchImpl: F(function fetchImpl() { totals.hooks++; throw new Error('NO_FETCH'); }),
    close: F(function close() {
      count.postCloses++; const p = fundCore.beginClose(); p.catch(() => undefined); fundCore.observe(); return p;
    }),
    snapshot: F(function snapshot() {
      const state = fundCore.snapshot();
      return F({ phase: state.phase, unknown: state.unknown, trackedRequests: 0, trackedSockets: 0, ownedTimers: 0, close: state });
    }),
  });
  const retained = F({ readOptions: core.readOptions, close: core.close, inspect: core.inspect,
    inspectNativeCustody: F(function inspectNativeCustody() { return native; }) });
  const nativeJoin = JOIN(retained, funding);
  const bounded = BOUND(F({
    startReadClose: nativeJoin.readSession.close,
    snapshotOperation: F(function snapshotOperation() { return operation; }),
    canCloseFunding: nativeJoin.canCloseFunding,
    closeFunding: F(function closeFunding() {
      count.storeCallbacks++;
      if (storeWork) return storeWork({ nativeJoin, count });
      count.storeEntries++; totals.declaredStoreEntries++; return Promise.resolve(STORE_CLOSED);
    }),
  }), budget);
  return { nativeJoin, bounded, count, core, fundCore,
    setNative: value => { native = value; }, readOptions: retained.readOptions };
}
async function selected(name, callback) {
  let completed = false;
  await test(name, OPTIONS, async () => { totals.entered++; await callback(); totals.completed++; completed = true; });
  if (!completed) throw new Error('NATIVE_FUNDING_CLOSE_CASE_FAILED_STOP');
}

await selected('inert construction preserves read options and cached inspection never probes owners', async () => {
  const f = declared(); assert.equal(f.api.readSession.readOptions, f.reads.readOptions);
  assert.equal(f.api.readSession.inspect().inspectionIsCached, true);
  assert.equal(f.api.canCloseFunding(), false);
  assert.deepEqual(f.count, { reads: 0, posts: 0, readViews: 0, nativeViews: 0, postViews: 0 });
  const p = f.api.readSession.close(); assert.equal(f.api.readSession.close(), p); await p;
});
await selected('exact frozen owner capture refuses proxies accessors and unfrozen methods without hooks', () => {
  const f = declared(), trap = () => { totals.hooks++; throw new Error('HOOK'); };
  const proxy = new Proxy({}, { get: trap, getPrototypeOf: trap, ownKeys: trap });
  const badReads = [null, {}, [], proxy, { ...f.reads }, F({ ...f.reads, extra: true }),
    F({ ...f.reads, get close() { return trap(); } }), F({ ...f.reads, readOptions: proxy }),
    F({ ...f.reads, close() {} })];
  for (const reads of badReads) assert.throws(() => JOIN(reads, f.post), invalid('configuration_rejected'));
  assert.throws(() => JOIN(f.reads, F({ ...f.post, get snapshot() { return trap(); } })), invalid('configuration_rejected'));
  assert.throws(() => JOIN(f.reads), invalid('configuration_rejected'));
  assert.equal(totals.hooks, 0); assert.equal(f.count.reads, 0);
});
await selected('both independent close requests start before either pending Promise settles', async () => {
  const read = deferred(), funding = deferred(), f = declared({ readPromise: read.promise, fundingPromise: funding.promise });
  const p = f.api.readSession.close(); assert.equal(f.count.reads, 1); assert.equal(f.count.posts, 1);
  assert.equal(f.api.canCloseFunding(), false); funding.resolve(CLOSED); await ticks();
  assert.equal(f.api.readSession.inspect().closePromiseOutcome, 'PENDING');
  read.resolve(undefined); await p; assert.equal(f.api.canCloseFunding(), true);
  assert.equal(f.count.reads, 1); assert.equal(f.count.posts, 1);
});
await selected('a throwing read close cannot suppress the independent funding close attempt', async () => {
  const funding = deferred(), f = declared({ readClose: () => { throw new Error('DECLARED'); }, fundingPromise: funding.promise });
  const p = f.api.readSession.close(); await assert.rejects(p, invalid());
  assert.equal(f.count.posts, 1); funding.resolve(CLOSED); await ticks();
  assert.equal(f.api.canCloseFunding(), false); assert.equal(f.api.readSession.close(), p);
});
await selected('a throwing funding close preserves the already requested read close and permanent unknown', async () => {
  const f = declared({ fundingClose: () => { throw new Error('DECLARED'); } });
  await assert.rejects(f.api.readSession.close(), invalid()); assert.equal(f.count.reads, 1);
  assert.equal(f.api.readSession.inspect().fundingOutcome, 'THREW');
});
await selected('child rejection reasons remain opaque and no late successful peer repairs unknown', async () => {
  const reason = new Proxy({}, { get() { totals.hooks++; throw new Error('RAW_REASON'); } });
  for (const side of ['read', 'funding']) {
    const failed = deferred(), pending = deferred();
    const f = side === 'read' ? declared({ readPromise: failed.promise, fundingPromise: pending.promise })
      : declared({ readPromise: pending.promise, fundingPromise: failed.promise });
    const p = f.api.readSession.close(); failed.reject(reason); await assert.rejects(p, invalid());
    pending.resolve(side === 'read' ? CLOSED : undefined); await ticks();
    assert.equal(f.api.canCloseFunding(), false);
  }
  assert.equal(totals.hooks, 0);
});
await selected('arbitrary thenables and direct public close dependencies are refused without then hooks', async () => {
  const thenable = F({ get then() { totals.hooks++; throw new Error('THEN'); } });
  for (const readClose of [() => thenable, api => api.readSession.close()]) {
    const f = declared({ readClose }); await assert.rejects(f.api.readSession.close(), invalid());
    assert.equal(f.count.posts, 1);
  }
  const f = declared({ fundingClose: api => api.readSession.close() });
  await assert.rejects(f.api.readSession.close(), invalid()); assert.equal(totals.hooks, 0);
});
await selected('aliased child promises and accessor funding close results never establish a clean pair', async () => {
  const shared = Promise.resolve(undefined), alias = declared({ readPromise: shared, fundingPromise: shared });
  await assert.rejects(alias.api.readSession.close(), invalid());
  assert.equal(alias.api.readSession.inspect().fundingOutcome, 'ALIASED_PROMISE');
  const value = F({ get phase() { totals.hooks++; throw new Error('PHASE'); } });
  const f = declared({ fundingPromise: Promise.resolve(value) });
  await assert.rejects(f.api.readSession.close(), invalid()); assert.equal(totals.hooks, 0);
});
await selected('aggregate read version counts and close uncertainty are current mandatory data', async () => {
  for (const delta of [{ retainedReadSessionVersion: 0 }, { closeRequested: 2 }, { closeSettled: 2 },
    { closeFulfilledUndefined: 2 }, { closeUncertaintyLatched: true }, { lifecycle: 'OPEN' }]) {
    const f = declared(); f.setRead(F({ ...cleanRead(), ...delta }));
    await assert.rejects(f.api.readSession.close(), invalid());
    f.setRead(cleanRead()); assert.equal(f.api.canCloseFunding(), false);
  }
});
await selected('every native read owner must have current clean zero-count and late-error data', async () => {
  for (let index = 0; index < 3; index++) {
    for (const delta of [{ nativeReadCustodyVersion: 0 }, { closeRequested: false }, { closePromiseSettled: false },
      { uncertaintyLatched: true }, { retiredErrorObserved: true }, { activeGeneration: true }, { closeObserved: false },
      { trackedRequests: 1 }, { trackedResponses: null }, { trackedSockets: 1 }, { trackedAgents: 1 }, { ownedTimers: 1 }]) {
      const f = declared(), owners = [cleanOwner(), cleanOwner(), cleanOwner()];
      owners[index] = F({ ...owners[index], ...delta }); f.setNative(F({ nativeReadSessionCustodyVersion: 2, owners: F(owners) }));
      await assert.rejects(f.api.readSession.close(), invalid()); assert.equal(f.api.canCloseFunding(), false);
    }
  }
});
await selected('late funding uncertainty vetoes permits without rewriting an already fulfilled close', async () => {
  const f = declared(), p = f.api.readSession.close(); await p;
  f.setFunding(F({ ...cleanFunding(), unknown: true })); assert.equal(f.api.canCloseFunding(), false);
  assert.equal(f.api.readSession.inspect().lifecycle, 'CLOSE_OUTCOME_UNKNOWN');
  assert.equal(f.api.readSession.inspect().closePromiseOutcome, 'CLOSED');
  f.setFunding(cleanFunding()); assert.equal(f.api.canCloseFunding(), false); assert.equal(await p, undefined);
  assert.equal(f.count.posts, 1);
});
await selected('snapshot proxies accessors owner-array hooks and negative zero are refused without getters', async () => {
  const trap = () => { totals.hooks++; throw new Error('VIEW_HOOK'); };
  const proxy = new Proxy({}, { get: trap, getPrototypeOf: trap, ownKeys: trap });
  const mutations = [
    f => f.setRead(proxy),
    f => f.setRead(F({ ...cleanRead(), get lifecycle() { return trap(); } })),
    f => f.setNative(F({ nativeReadSessionCustodyVersion: 2, owners: proxy })),
    f => { const owners = [cleanOwner(), cleanOwner(), cleanOwner()]; Object.defineProperty(owners, '1', { get: trap, enumerable: true }); f.setNative(F({ nativeReadSessionCustodyVersion: 2, owners: F(owners) })); },
    f => f.setFunding(F({ ...cleanFunding(), trackedSockets: -0 })),
    f => f.setFunding(F({ ...cleanFunding(), close: F({ ...cleanFunding().close, get localMaterialRelease() { return trap(); } }) })),
    f => f.setFunding(F({ ...cleanFunding(), close: F({ ...cleanFunding().close, localMaterialRelease: F({ attempts: 0, outcome: 'NOT_ATTEMPTED' }) }) })),
    f => f.setFunding(F({ ...cleanFunding(), close: F({ ...cleanFunding().close, lastObservedCounts: F({ requests: 0, sockets: 1, timers: 0 }) }) })),
  ];
  for (const mutate of mutations) {
    const f = declared(); mutate(f); await assert.rejects(f.api.readSession.close(), invalid());
  }
  assert.equal(totals.hooks, 0);
});
await selected('reentrant current-view inspection permanently refuses instead of recursing into authority', async () => {
  const f = declared({ readView: api => { assert.equal(api.canCloseFunding(), false); return cleanRead(); } });
  await assert.rejects(f.api.readSession.close(), invalid());
  assert.equal(f.api.readSession.inspect().firstRefusal, 'REENTRANT_INSPECTION');
  assert.equal(f.count.reads, 1); assert.equal(f.count.posts, 1);
});
await selected('wrong close guard and inspection arity cannot consume the genuine cached close', async () => {
  const f = declared(), invalidClose = f.api.readSession.close(true);
  await assert.rejects(invalidClose, invalid('input_rejected'));
  assert.equal(f.api.readSession.close(null), invalidClose); assert.equal(f.api.canCloseFunding(true), false);
  assert.throws(() => f.api.readSession.inspect(true), invalid('input_rejected'));
  assert.equal(f.count.reads, 0); await f.api.readSession.close(); assert.equal(f.count.posts, 1);
});
await selected('intrinsic drift still requests both prehandled declared closes without unsafe reactions', async () => {
  const f = declared(); let p;
  try {
    Object.defineProperty(Object.prototype, 'then', { configurable: true, get() { totals.hooks++; throw new Error('THEN'); } });
    p = f.api.readSession.close();
  } finally { delete Object.prototype.then; }
  await assert.rejects(p, invalid()); assert.equal(f.count.reads, 1); assert.equal(f.count.posts, 1);
  assert.equal(f.api.canCloseFunding(), false); assert.equal(totals.hooks, 0);
});
await selected('actual read core funding close owner and bounded join compose cleanly without native I/O', async () => {
  const f = composed(), p = f.bounded.start(); const result = await p;
  assert.equal(result.lifecycle, 'CLOSED'); assert.equal(result.operationOutcome, 'NOT_ESTABLISHED');
  assert.equal(result.nativeResourceCleanup, 'NOT_QUALIFIED');
  assert.deepEqual(f.count.readCloses, [1, 1, 1]); assert.equal(f.count.postCloses, 1); assert.equal(f.count.releases, 1);
  assert.equal(f.count.storeEntries, 1); assert.equal(f.bounded.canCloseFunding(), false);
  assert.equal(f.nativeJoin.readSession.readOptions, f.readOptions);
  assert.equal(f.core.inspect().lifecycle, 'CLOSED'); assert.equal(f.fundCore.snapshot().phase, 'CLOSED');
});
await selected('one never-settling actual read-core close cannot hold the enclosing public close forever', async () => {
  const read = deferred(), f = composed({ firstRead: read.promise, budget: 30 }), p = f.bounded.start();
  await assert.rejects(p, boundedUnknown); assert.deepEqual(f.count.readCloses, [1, 1, 1]);
  assert.equal(f.count.postCloses, 1); assert.equal(f.count.storeCallbacks, 0);
  read.resolve(undefined); await f.nativeJoin.readSession.close(); await ticks();
  assert.equal(f.nativeJoin.canCloseFunding(), true); // Resource DATA only; outer UNKNOWN remains permanent.
  assert.equal(f.bounded.canCloseFunding(), false); assert.equal(f.count.storeEntries, 0);
  await assert.rejects(f.bounded.start(), boundedUnknown);
});
await selected('pending original operation stays joined and expiry cannot be repaired by later operation settlement', async () => {
  const operation = deferred(), f = composed({ operation: operation.promise, budget: 30 }), p = f.bounded.start();
  await f.nativeJoin.readSession.close(); await assert.rejects(p, boundedUnknown);
  assert.equal(f.count.storeCallbacks, 0); operation.resolve(undefined); await ticks();
  assert.equal(f.count.storeEntries, 0); assert.equal(f.bounded.canCloseFunding(), false);
});
await selected('actual funding close-owner late error vetoes a declared post-await store boundary', async () => {
  const gate = deferred(), entered = deferred();
  const f = composed({ storeWork: ({ nativeJoin, count }) => {
    const work = (async () => {
      entered.resolve(undefined); await gate.promise;
      if (!nativeJoin.canCloseFunding()) throw new Error('DECLARED_STORE_BOUNDARY_REFUSED');
      count.storeEntries++; totals.declaredStoreEntries++; return STORE_CLOSED;
    })(); work.catch(() => undefined); return work;
  } });
  const p = f.bounded.start(); await entered.promise;
  assert.equal(f.nativeJoin.readSession.inspect().closePromiseOutcome, 'CLOSED');
  f.fundCore.markUnknown(); gate.resolve(undefined); await assert.rejects(p, boundedUnknown);
  assert.equal(f.count.storeCallbacks, 1); assert.equal(f.count.storeEntries, 0);
  assert.equal(f.fundCore.snapshot().closePromiseOutcome, 'CLOSED');
  assert.equal(f.fundCore.snapshot().phase, 'CLOSE_UNKNOWN');
  assert.equal(f.nativeJoin.readSession.inspect().closePromiseOutcome, 'CLOSED');
  assert.equal(f.nativeJoin.readSession.inspect().unknown, true);
});
await selected('a late declared retired-read error overrides historical aggregate close before store entry', async () => {
  const operation = deferred(), f = composed({ operation: operation.promise }), p = f.bounded.start();
  await f.nativeJoin.readSession.close();
  const native = cleanNative(), owners = [...native.owners]; owners[2] = F({ ...owners[2], retiredErrorObserved: true });
  f.setNative(F({ nativeReadSessionCustodyVersion: 2, owners: F(owners) }));
  operation.resolve(undefined); await assert.rejects(p, boundedUnknown);
  assert.equal(f.count.storeCallbacks, 0); assert.equal(f.count.storeEntries, 0);
  assert.equal(f.nativeJoin.readSession.inspect().closePromiseOutcome, 'CLOSED');
  assert.equal(f.nativeJoin.canCloseFunding(), false);
});
assert.equal(totals.entered, 20); assert.equal(totals.completed, 20); assert.equal(totals.hooks, 0);
console.log('# native-funding-close-session ' + JSON.stringify({ ...totals,
  actualProductionModules: 7, nativeViews: 'DECLARED_DATA_NOT_NATIVE_HANDLES',
  storeBoundary: 'DECLARED_CALLBACK_NOT_ACTUAL_PAYER_OR_STORE', realBoundedTimers: true,
  actualNativeFactoryImported: false, actualV4Imported: false, actualPayerImported: false,
  SDK: 0, SQLite: 0, sockets: 0, keys: 0, signatures: 0, nonceEvaluations: 0,
  nativeResourceCleanup: 'NOT_QUALIFIED', authority: 'NONE' }));
