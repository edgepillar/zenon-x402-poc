/* Actual bounded join + actual old join + actual drain observer/real Node timers.
 * Read/funding/operation callbacks are declared in-memory data, not native TLS,
 * real payer/store close, SDK, signatures, nonce or a full V4 application graph.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as pause } from 'node:timers/promises';
import { createOriginalFundingBoundedReadCloseCoordinator as JOIN } from '../src/zenon/dynamic-plasma-original-funding-bounded-read-close.js';

assert.equal(process.argv.length, 2); assert.equal(process.version, 'v24.19.0');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
assert.equal(process.env.X402_BOUNDED_READ_CLOSE_SELECTION, 'eighteen-sdk-free-real-timer-cases');
assert.ok(process.permission && !process.permission.has('child') && !process.permission.has('worker')
  && !process.permission.has('fs.write'));
const F = Object.freeze, OPTIONS = { concurrency: false, timeout: 3000 }, CLOSED = F({ status: 'CLOSED' });
const totals = { entered: 0, completed: 0, hooks: 0, readCloses: 0, fundingCloses: 0 };
function deferred() {
  let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => undefined); return { promise, resolve, reject };
}
const ticks = async () => { for (let i = 0; i < 8; i++) await undefined; };
function invalid(kind) { return error => {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'original_funding_bounded_read_close_' + kind);
  assert.equal(error.stack, 'TypeError: ' + error.code); assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}; }
function fixture({ read, operation = null, funding, guard, readCallback, snapshotCallback, fundingCallback, budget = 500 } = {}) {
  const counts = { read: 0, snapshot: 0, funding: 0, guard: 0 };
  const readPromise = read === undefined ? Promise.resolve(undefined) : read;
  const fundingPromise = funding === undefined ? Promise.resolve(CLOSED) : funding;
  const options = F({
    startReadClose: F(function startReadClose() { totals.readCloses++; counts.read++; return readCallback ? readCallback() : readPromise; }),
    snapshotOperation: F(function snapshotOperation() { counts.snapshot++; return snapshotCallback ? snapshotCallback() : operation; }),
    closeFunding: F(function closeFunding() { totals.fundingCloses++; counts.funding++; return fundingCallback ? fundingCallback() : fundingPromise; }),
    canCloseFunding: F(function canCloseFunding() { counts.guard++; return guard ? guard() : true; }),
  });
  return { api: JOIN(options, budget), options, counts };
}
async function selected(name, callback) {
  let completed = false;
  await test(name, OPTIONS, async () => { totals.entered++; await callback(); totals.completed++; completed = true; });
  if (!completed) throw new Error('BOUNDED_READ_CLOSE_CASE_FAILED_STOP');
}
await selected('construction is inert and reserves one cached close before clocks probes or callbacks', () => {
  const f = fixture(), state = f.api.inspect();
  assert.deepEqual(f.counts, { read: 0, snapshot: 0, funding: 0, guard: 0 });
  assert.ok(Object.isFrozen(f.api) && Object.isFrozen(f.api.promise));
  assert.equal(state.lifecycle, 'OPEN'); assert.equal(state.completionProbeEntries, 0);
  assert.equal(f.api.canCloseFunding(), false);
});
await selected('invalid shape callbacks budgets and arity refuse without caller getters or coercion', () => {
  const f = fixture(); const trap = () => { totals.hooks++; throw new Error('HOOK'); };
  const proxy = new Proxy({}, { get: trap, getPrototypeOf: trap, ownKeys: trap });
  for (const value of [null, {}, [], proxy, { ...f.options }, F({ ...f.options, extra: true }),
    F({ ...f.options, get startReadClose() { return trap(); } })])
    assert.throws(() => JOIN(value, 500), invalid('configuration_rejected'));
  for (const budget of [0, -1, 1001, 1.5, NaN, Infinity, '20', true, proxy])
    assert.throws(() => JOIN(f.options, budget), invalid('configuration_rejected'));
  assert.throws(() => JOIN(f.options), invalid('configuration_rejected'));
  assert.equal(totals.hooks, 0); assert.equal(f.counts.read, 0);
});
await selected('clean actual join completes once and does not reinterpret close as payment success', async () => {
  const f = fixture(), promise = f.api.start(); assert.equal(promise, f.api.promise); assert.equal(f.api.start(), promise);
  const value = await promise;
  assert.equal(value.lifecycle, 'CLOSED'); assert.equal(value.operationOutcome, 'NOT_ESTABLISHED');
  assert.equal(value.nativeResourceCleanup, 'NOT_QUALIFIED'); assert.equal(value.authority, 'NONE');
  assert.equal(f.counts.funding, 1); assert.equal(f.api.inspect().completionProbeEntries, 1);
  assert.equal(f.api.inspect().observationOutcome, 'DRAINED'); assert.equal(f.api.canCloseFunding(), false);
});
await selected('pending read close and pending operation are both joined before one funding entry', async () => {
  const read = deferred(), op = deferred(), f = fixture({ read: read.promise, operation: op.promise });
  const promise = f.api.start(); op.resolve(undefined); await ticks(); assert.equal(f.counts.funding, 0);
  read.resolve(undefined); await promise; assert.equal(f.counts.funding, 1); assert.equal(f.counts.guard, 2);
});
await selected('a rejected active operation is joined without reading raw failure properties', async () => {
  const op = deferred(), f = fixture({ operation: op.promise });
  const reason = new Proxy({}, { get() { totals.hooks++; throw new Error('RAW_REASON'); } });
  const promise = f.api.start(); op.reject(reason); const result = await promise;
  assert.equal(result.operationOutcome, 'NOT_ESTABLISHED'); assert.equal(f.counts.funding, 1); assert.equal(totals.hooks, 0);
});
await selected('never-settling read close yields permanent unknown without entering funding', async () => {
  const read = deferred(), f = fixture({ read: read.promise, budget: 30 }), promise = f.api.start();
  await assert.rejects(promise, invalid('close_unknown'));
  assert.equal(f.api.inspect().held, true); assert.equal(f.counts.funding, 0); assert.equal(f.api.canCloseFunding(), false);
  read.resolve(undefined); await ticks(); await assert.rejects(f.api.start(), invalid('close_unknown'));
  assert.equal(f.counts.funding, 0); assert.equal(f.api.inspect().completionProbeEntries, 1);
});
await selected('never-settling operation cannot retain an unbounded public close or authorize late funding', async () => {
  const op = deferred(), f = fixture({ operation: op.promise, budget: 30 }), promise = f.api.start();
  await assert.rejects(promise, invalid('close_unknown')); assert.equal(f.counts.funding, 0);
  op.resolve(undefined); await ticks(); assert.equal(f.counts.funding, 0);
  assert.equal(f.api.start(), promise); await assert.rejects(promise, invalid('close_unknown'));
});
await selected('funding close already entered but never settled is unknown not an assertion that a store remains open', async () => {
  const funding = deferred(), f = fixture({ funding: funding.promise, budget: 30 }), promise = f.api.start();
  await assert.rejects(promise, invalid('close_unknown'));
  assert.equal(f.counts.funding, 1); assert.equal(f.api.inspect().fundingCallbackEntries, 1);
  assert.equal(f.api.inspect().storeCloseState, 'SEE_ACTUAL_PAYER_INSPECTION');
  funding.resolve(CLOSED); await ticks(); await assert.rejects(f.api.start(), invalid('close_unknown'));
  assert.equal(f.api.canCloseFunding(), false); assert.equal(f.counts.funding, 1);
});
await selected('the same live permit vetoes a deferred source close boundary after the budget has ended', async () => {
  const funding = deferred(); let f, entered = false;
  f = fixture({ budget: 30, fundingCallback: () => { entered = true; assert.equal(f.api.canCloseFunding(), true); return funding.promise; } });
  const promise = f.api.start(); await ticks(); assert.equal(entered, true);
  await assert.rejects(promise, invalid('close_unknown'));
  assert.equal(f.api.canCloseFunding(), false); // The actual payer rechecks this after its own awaits.
  funding.resolve(CLOSED); await ticks(); assert.equal(f.api.inspect().held, true); assert.equal(f.counts.funding, 1);
});
await selected('rejected or non-undefined read close refuses funding without awaiting its budget', async () => {
  const reads = [Promise.resolve(F({ status: 'CLOSED' })), Promise.reject('declared-refusal')];
  for (const read of reads) read.catch(() => undefined);
  for (const read of reads) {
    const f = fixture({ read });
    await assert.rejects(f.api.start(), invalid('close_unknown')); assert.equal(f.counts.funding, 0);
  }
});
await selected('false throwing and thenable resource guards never grant funding close or invoke a then getter', async () => {
  const thenable = F({ get then() { totals.hooks++; throw new Error('THEN'); } });
  for (const guard of [() => false, () => { throw new Error('DECLARED'); }, () => thenable]) {
    const f = fixture({ guard }); await assert.rejects(f.api.start(), invalid('close_unknown'));
    assert.equal(f.counts.funding, 0); assert.equal(f.api.inspect().held, true);
  }
  assert.equal(totals.hooks, 0);
});
await selected('a public close dependency in read close is rejected instead of waiting on itself', async () => {
  let f; f = fixture({ readCallback: () => f.api.promise });
  await assert.rejects(f.api.start(), invalid('close_unknown')); assert.equal(f.counts.funding, 0);
  assert.equal(f.api.inspect().holdReason, 'PUBLIC_CLOSE_CYCLE');
});
await selected('a public close dependency in the active operation is rejected without a second read close', async () => {
  let f; f = fixture({ snapshotCallback: () => f.api.promise });
  await assert.rejects(f.api.start(), invalid('close_unknown')); assert.equal(f.counts.read, 1); assert.equal(f.counts.funding, 0);
});
await selected('a public close dependency returned by funding is permanent unknown after one callback entry', async () => {
  let f; f = fixture({ fundingCallback: () => f.api.promise });
  await assert.rejects(f.api.start(), invalid('close_unknown')); assert.equal(f.counts.funding, 1);
  assert.equal(f.api.inspect().fundingCallbackEntries, 1);
});
await selected('reentrant read stop sees the already reserved identical public close', async () => {
  let f, nested; f = fixture({ readCallback: () => { nested = f.api.start(); return Promise.resolve(undefined); } });
  const promise = f.api.start(); await promise; assert.equal(nested, promise); assert.equal(f.counts.read, 1); assert.equal(f.counts.funding, 1);
});
await selected('wrong start arity remains inert and cannot consume the genuine single close', async () => {
  const f = fixture(); await assert.rejects(f.api.start(true), invalid('input_rejected'));
  assert.equal(f.counts.read, 0); assert.equal(f.api.inspect().started, false); assert.equal(f.api.canCloseFunding(true), false);
  await f.api.start(); assert.equal(f.counts.funding, 1);
  assert.throws(() => f.api.inspect(true), invalid('input_rejected'));
});
await selected('intrinsic drift still requests owned read stop while refusing unsafe reactions or funding entry', async () => {
  const f = fixture(); let promise;
  try { Object.defineProperty(Object.prototype, 'then', { configurable: true, get() { totals.hooks++; throw new Error('THEN_HOOK'); } }); promise = f.api.start(); }
  finally { delete Object.prototype.then; }
  await assert.rejects(promise, invalid('close_unknown')); assert.equal(f.counts.read, 1); assert.equal(f.counts.funding, 0);
  assert.equal(totals.hooks, 0);
});
await selected('settled clean close remains cached after its budget while no future funding authority is exposed', async () => {
  const f = fixture({ budget: 100 }), promise = f.api.start(); await promise; await pause(110);
  assert.equal(f.api.start(), promise); assert.equal(f.api.inspect().lifecycle, 'CLOSED'); assert.equal(f.api.inspect().held, false);
  assert.equal(f.api.canCloseFunding(), false); assert.equal(f.counts.funding, 1);
});
assert.equal(totals.entered, 18); assert.equal(totals.completed, 18); assert.equal(totals.hooks, 0);
console.log('# bounded-original-funding-read-close ' + JSON.stringify({ ...totals, actualTimers: true,
  resourceCallbacks: 'DECLARED_DATA_NOT_NATIVE_HANDLES', actualV4Imported: false, actualPayerImported: false,
  SDK: 0, SQLite: 0, sockets: 0, keys: 0, signatures: 0, nonceEvaluations: 0,
  hardOsDeadline: false, nativeResourceCleanup: 'NOT_QUALIFIED', authority: 'NONE' }));
