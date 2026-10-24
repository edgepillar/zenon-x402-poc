/* Actual shared handle-close policy, retired-error latch and close coordinator.
 * All event flags/callbacks below are declared DATA, NOT native HTTPS events,
 * physical drain, a real clock/deadline, SQLite close or a full DP graph.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeReadGenerationHandlesClosed as CLOSED } from '../src/zenon/native-read-generation-handles-closed.js';
import { createNativeReadRetiredErrorLatch as LATCH } from '../src/zenon/native-read-retired-error-latch.js';
import { createOriginalFundingReadCloseCoordinator as JOIN } from '../src/zenon/dynamic-plasma-original-funding-read-close.js';

assert.equal(process.argv.length, 2);
assert.equal(process.version, 'v24.19.0'); assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
assert.equal(process.env.X402_READ_RESPONSE_CLOSE_SELECTION, 'ten-sdk-free-components-only');
assert.ok(process.permission && !process.permission.has('child') && !process.permission.has('worker')
  && !process.permission.has('fs.write'));

const FREEZE = Object.freeze, OPTIONS = { concurrency: false, timeout: 3000 };
const totals = { casesEntered: 0, casesCompleted: 0, booleanRows: 0, proxyTraps: 0,
  declaredReadCloseCalls: 0, declaredFundingCloseCalls: 0, operationSnapshots: 0, guardCalls: 0 };
const tick = async () => { await undefined; await undefined; };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}
async function selected(name, callback) {
  let completed = false;
  await test(name, OPTIONS, async () => {
    totals.casesEntered++; await callback(); totals.casesCompleted++; completed = true;
  });
  if (!completed) throw new Error('READ_RESPONSE_CLOSE_CASE_FAILED_STOP');
}
function fixture(flags, operation = null) {
  const read = deferred(), retired = LATCH();
  const counts = { funding: 0 };
  const join = JOIN(FREEZE({
    startReadClose: FREEZE(function startReadClose() { totals.declaredReadCloseCalls++; return read.promise; }),
    snapshotOperation: FREEZE(function snapshotOperation() { totals.operationSnapshots++; return operation; }),
    closeFunding: FREEZE(function closeFunding() {
      totals.declaredFundingCloseCalls++; counts.funding++;
      return Promise.resolve(FREEZE({ status: 'CLOSED' })); // No store or native resource.
    }),
    canCloseFunding: FREEZE(function canCloseFunding() {
      totals.guardCalls++; return !retired.isLatched() && CLOSED(...flags);
    }),
  }));
  function observeDeclaredClose() {
    if (!CLOSED(...flags)) return false;
    read.resolve(undefined); return true;
  }
  return { join, read, retired, counts, observeDeclaredClose };
}
function held(problem) {
  assert.equal(problem.code, 'original_funding_read_close_close_unknown');
  assert.equal(problem.stack, 'TypeError: ' + problem.code);
  assert.ok(Object.isFrozen(problem)); return true;
}
await selected('an unstarted empty generation needs no close event and grants no native authority', () => {
  assert.equal(CLOSED(false, false, false, false, false, false), true);
});
await selected('all 64 boolean rows accept exactly the four internally consistent closed-handle states', () => {
  const allowed = new Set(['000000', '110000', '111100', '111111']);
  for (let mask = 0; mask < 64; mask++) {
    const bits = Array.from({ length: 6 }, (_, index) => Boolean(mask & (1 << (5 - index))));
    const key = bits.map(bit => bit ? '1' : '0').join('');
    assert.equal(CLOSED(...bits), allowed.has(key), key); totals.booleanRows++;
  }
});
await selected('request and socket close cannot substitute for an assigned response close', () => {
  assert.equal(CLOSED(true, true, true, true, true, false), false);
  assert.equal(CLOSED(true, true, true, true, true, true), true);
});
await selected('a response close cannot substitute for an unclosed request or socket', () => {
  assert.equal(CLOSED(true, false, true, true, true, true), false);
  assert.equal(CLOSED(true, true, true, false, true, true), false);
});
await selected('the no-socket result is handle-state DATA and still leaves grace accounting to the actual caller', () => {
  assert.equal(CLOSED(true, true, false, false, false, false), true);
  assert.equal(CLOSED(true, true, false, true, false, false), false);
  assert.equal(CLOSED(true, true, false, false, true, true), false);
});
await selected('non-boolean values and proxies refuse without invoking any input hook', () => {
  const trap = () => { totals.proxyTraps++; throw new Error('INPUT_HOOK_MUST_NOT_RUN'); };
  const proxy = new Proxy({}, { get: trap, getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap });
  const getter = FREEZE({ get valueOf() { return trap(); }, get then() { return trap(); } });
  for (const invalid of [undefined, null, 0, 1, 'true', 'false', NaN, proxy, getter, () => true]) {
    for (let index = 0; index < 6; index++) {
      const flags = [true, true, true, true, true, true]; flags[index] = invalid;
      assert.equal(CLOSED(...flags), false);
    }
  }
  assert.equal(totals.proxyTraps, 0);
});
await selected('wrong arity is an inert false result rather than a partial close permit', () => {
  assert.equal(CLOSED(), false); assert.equal(CLOSED(true, true, true, true, true), false);
  assert.equal(CLOSED(true, true, true, true, true, true, false), false);
});
await selected('actual coordinator waits for the shared response-close gate before one declared funding close', async () => {
  const flags = [true, true, true, true, true, false], f = fixture(flags);
  const promise = f.join.start(); assert.equal(f.join.start(), promise);
  assert.equal(f.observeDeclaredClose(), false); await tick();
  assert.equal(f.join.inspect().readCloseSettled, false); assert.equal(f.counts.funding, 0);
  flags[5] = true; assert.equal(f.observeDeclaredClose(), true);
  const result = await promise;
  assert.equal(result.lifecycle, 'CLOSED'); assert.equal(result.operationOutcome, 'NOT_ESTABLISHED');
  assert.equal(result.nativeResourceCleanup, 'NOT_QUALIFIED'); assert.equal(result.authority, 'NONE');
  assert.equal(f.counts.funding, 1); assert.equal(f.join.start(), promise);
});
await selected('actual coordinator keeps declared grace refusal permanent after a late response close', async () => {
  const flags = [true, true, true, true, true, false], f = fixture(flags);
  const promise = f.join.start(); assert.equal(f.observeDeclaredClose(), false);
  f.read.reject(FREEZE({ reason: 'DECLARED_GRACE_EXPIRED_NOT_A_CLOCK_TEST' }));
  await assert.rejects(promise, held); flags[5] = true;
  assert.equal(f.observeDeclaredClose(), true); await tick();
  await assert.rejects(f.join.start(), held);
  assert.equal(f.join.inspect().held, true); assert.equal(f.counts.funding, 0);
});
await selected('actual retired-error latch vetoes funding after read settlement and an active-operation join', async () => {
  const operation = deferred(), flags = [true, true, true, true, true, true];
  const f = fixture(flags, operation.promise), promise = f.join.start();
  assert.equal(f.observeDeclaredClose(), true); await tick();
  assert.equal(f.join.inspect().readCloseClean, true); assert.equal(f.counts.funding, 0);
  f.retired.onError(FREEZE({ reason: 'DECLARED_EVENT_NOT_NATIVE_TLS' }));
  operation.resolve(undefined); await assert.rejects(promise, held);
  assert.equal(f.counts.funding, 0); assert.equal(f.retired.isLatched(), true);
  await assert.rejects(f.join.start(), held);
});
assert.deepEqual(totals, { casesEntered: 10, casesCompleted: 10, booleanRows: 64, proxyTraps: 0,
  declaredReadCloseCalls: 3, declaredFundingCloseCalls: 1, operationSnapshots: 3, guardCalls: 3 });
console.log('# read-response-close-components ' + JSON.stringify({ ...totals,
  nativeOwnerImported: false, SDK: 0, SQLite: 0, sockets: 0, keys: 0, signatures: 0,
  nonceEvaluations: 0, nativeResourceCleanup: 'NOT_QUALIFIED', authority: 'NONE' }));
