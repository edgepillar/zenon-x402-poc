/* Actual aggregate-close observer and funding close lifecycle. No native owner,
 * SDK/SQLite/socket/keys/signatures/nonce search runs. Resource facts are DATA.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createServiceCreditBoundedCloseCompletion as CLOSE } from '../src/service-credit-bounded-close-completion.js';
import { createNativeHttpsClientCloseOwner as FUND } from '../src/service-credit-native-client-close-owner.js';

assert.equal(process.argv.length, 2); assert.equal(process.version, 'v24.19.0');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
assert.equal(process.env.X402_BOUNDED_CLOSE_COMPLETION_SELECTION, 'aggregate-budget-source-component-only');
assert.ok(process.permission && !process.permission.has('child') && !process.permission.has('worker')
  && !process.permission.has('fs.write'));
const F = Object.freeze, OPTIONS = { concurrency: false, timeout: 3000 };
const totals = { entered: 0, completed: 0, hooks: 0, actualFundingCoreConstructions: 0,
  declaredMaterialReleases: 0, declaredStoreEntries: 0 };
const names = [];
const ticks = async () => { for (let i = 0; i < 12; i++) await undefined; };
const invalid = (kind = 'close_unknown') => value => {
  assert.ok(value instanceof TypeError && Object.isFrozen(value));
  assert.equal(value.code, 'service_credit_bounded_close_completion_' + kind);
  assert.equal(value.stack, 'TypeError: ' + value.code); assert.equal(Object.hasOwn(value, 'cause'), false);
  return true;
};
async function selected(name, callback) {
  let finished = false;
  await test(name, OPTIONS, async () => {
    totals.entered++; names.push(name); await callback(); totals.completed++; finished = true;
  });
  if (!finished) throw new Error('BOUNDED_CLOSE_COMPLETION_CASE_FAILED_STOP');
}
function fund() {
  totals.actualFundingCoreConstructions++;
  const core = FUND(F({
    readObservedCounts: F(function readObservedCounts() { return F({ requests: 0, sockets: 0, timers: 0 }); }),
    releaseLocalMaterial: F(function releaseLocalMaterial() { totals.declaredMaterialReleases++; }),
  }));
  const promise = core.beginClose(); promise.catch(() => undefined); core.observe();
  return { core, promise };
}

await selected('construction and cached inspection start no close observation', () => {
  const c = CLOSE(1000), first = c.inspect();
  assert.equal(first.started, false); assert.equal(first.observationStarts, 0);
  assert.equal(first.completionProbeEntries, 0); assert.equal(first.outcome, 'NOT_STARTED');
  assert.deepEqual(c.inspect(), first); assert.equal(first.inspectionIsCached, true);
  assert.equal(c.complete(), false); assert.deepEqual(c.inspect(), first);
});
await selected('budget and constructor arity reject without coercion or object hooks', () => {
  const hooked = new Proxy({}, { get() { totals.hooks++; throw new Error('COERCE'); } });
  for (const value of [0, -0, -1, 1001, NaN, Infinity, 1.5, 1n, '1000', null, undefined, hooked])
    assert.throws(() => CLOSE(value), invalid('configuration_rejected'));
  assert.throws(() => CLOSE(), invalid('configuration_rejected'));
  assert.throws(() => CLOSE(1000, true), invalid('configuration_rejected'));
  assert.equal(CLOSE(1).inspect().budgetMs, 1); assert.equal(CLOSE(1000).inspect().budgetMs, 1000);
  assert.equal(totals.hooks, 0);
});
await selected('public methods and reserved prehandled Promise are frozen exact source surfaces', () => {
  const c = CLOSE(1000);
  assert.deepEqual(Reflect.ownKeys(c), ['promise', 'start', 'complete', 'inspect']);
  for (const value of [c, c.promise, c.start, c.complete, c.inspect, c.inspect()]) assert.equal(Object.isFrozen(value), true);
  const ctor = Object.getOwnPropertyDescriptor(c.promise, 'constructor');
  assert.equal(ctor.value, Promise); assert.equal(ctor.enumerable, false);
  assert.equal(ctor.writable, false); assert.equal(ctor.configurable, false);
  assert.equal(c.inspect().resourcesOwned, false); assert.equal(c.inspect().authority, 'NONE');
});
await selected('wrong start arity uses a cached rejection without consuming the genuine start', async () => {
  const c = CLOSE(1000), bad = c.start(true);
  await assert.rejects(bad, invalid('input_rejected')); assert.equal(c.start(null), bad);
  assert.equal(c.inspect().started, false); assert.equal(c.inspect().observationStarts, 0);
  const p = c.start(); assert.equal(p, c.promise); assert.equal(c.complete(), true); await p;
});
await selected('wrong completion or inspection arity does not claim readiness', async () => {
  const c = CLOSE(1000), p = c.start();
  assert.throws(() => c.complete(true), invalid('input_rejected'));
  assert.throws(() => c.inspect(true), invalid('input_rejected'));
  assert.equal(c.inspect().completionOffered, false);
  assert.equal(c.complete(), true); assert.equal(await p, undefined);
});
await selected('start is idempotent and creates exactly one pending completion probe', async () => {
  const c = CLOSE(1000), p = c.start();
  for (let i = 0; i < 8; i++) assert.equal(c.start(), p);
  await ticks();
  assert.equal(c.inspect().observationStarts, 1); assert.equal(c.inspect().completionProbeEntries, 1);
  assert.equal(c.inspect().outcome, 'PENDING'); assert.equal(c.complete(), true); await p;
});
await selected('a readiness notification is not a synchronous clean close result', async () => {
  const c = CLOSE(1000), p = c.start(); let fulfilled = false;
  p.then(() => { fulfilled = true; });
  assert.equal(c.complete(), true); assert.equal(c.inspect().outcome, 'PENDING'); assert.equal(fulfilled, false);
  await p; assert.equal(c.inspect().outcome, 'CLOSED'); assert.equal(fulfilled, true);
});
await selected('duplicate or post-terminal notification cannot renew the budget or repeat observation', async () => {
  const c = CLOSE(1000), p = c.start(); assert.equal(c.complete(), true);
  assert.equal(c.complete(), false); await p;
  const ended = c.inspect(); assert.equal(c.complete(), false); assert.equal(c.start(), p);
  assert.deepEqual(c.inspect(), ended); assert.equal(ended.observationStarts, 1);
});
await selected('pending whole-close completion times out without an active application operation', async () => {
  const c = CLOSE(20), p = c.start(); await assert.rejects(p, invalid());
  const state = c.inspect(); assert.equal(state.outcome, 'UNKNOWN');
  assert.equal(state.completionOffered, false); assert.equal(state.completionProbeEntries, 1);
  assert.equal(state.resourcesOwned, false); assert.equal(state.physicalDrain, 'NOT_ESTABLISHED');
});
await selected('late readiness after expiry never upgrades the cached rejection or allows reopen', async () => {
  const c = CLOSE(20), p = c.start(); await assert.rejects(p, invalid());
  const held = c.inspect(); assert.equal(c.complete(), false);
  await ticks(); assert.equal(c.start(), p); await assert.rejects(p, invalid());
  assert.deepEqual(c.inspect(), held); assert.equal(held.automaticRetry, false);
});
await selected('a pending funding close remains covered even when operation settlement was immediate', async () => {
  const c = CLOSE(20), p = c.start(), facts = { operationSettled: true, fundingClosed: false, serviceClosed: true };
  assert.equal(facts.operationSettled, true);
  if (Object.values(facts).every(Boolean)) c.complete();
  await assert.rejects(p, invalid()); assert.equal(c.inspect().completionOffered, false);
  assert.equal(totals.declaredStoreEntries, 0);
});
await selected('a pending service close remains covered after operation and funding settlement', async () => {
  const c = CLOSE(20), p = c.start(), facts = { operationSettled: true, fundingClosed: true, serviceClosed: false };
  if (Object.values(facts).every(Boolean)) c.complete();
  await assert.rejects(p, invalid()); facts.serviceClosed = true;
  assert.equal(c.complete(), false); assert.equal(c.inspect().outcome, 'UNKNOWN');
});
await selected('completion in a later responsive event-loop turn still uses the original budget', async () => {
  const c = CLOSE(1000), p = c.start(); await delay(0);
  assert.equal(c.inspect().outcome, 'PENDING'); assert.equal(c.complete(), true); await p;
  assert.equal(c.inspect().observationStarts, 1); assert.equal(c.inspect().completionProbeEntries, 1);
});
await selected('an inherited then getter introduced at notification is refused without invoking it', async () => {
  const c = CLOSE(1000), p = c.start();
  try {
    Object.defineProperty(Object.prototype, 'then', { configurable: true, get() { totals.hooks++; throw new Error('THEN'); } });
    assert.equal(c.complete(), false);
  } finally { delete Object.prototype.then; }
  await assert.rejects(p, invalid()); assert.equal(c.inspect().outcome, 'UNKNOWN'); assert.equal(totals.hooks, 0);
});
await selected('Promise then drift at start refuses without a new reaction or timer observer', async () => {
  const c = CLOSE(1000), descriptor = Object.getOwnPropertyDescriptor(Promise.prototype, 'then');
  let p;
  try {
    Object.defineProperty(Promise.prototype, 'then', { configurable: true, get() { totals.hooks++; throw new Error('THEN'); } });
    p = c.start();
  } finally { Object.defineProperty(Promise.prototype, 'then', descriptor); }
  await assert.rejects(p, invalid()); assert.equal(c.inspect().observationStarts, 0); assert.equal(totals.hooks, 0);
});
await selected('Promise constructor drift at notification is refused without a constructor getter', async () => {
  const c = CLOSE(1000), p = c.start(), descriptor = Object.getOwnPropertyDescriptor(Promise.prototype, 'constructor');
  try {
    Object.defineProperty(Promise.prototype, 'constructor', { configurable: true, get() { totals.hooks++; throw new Error('CTOR'); } });
    assert.equal(c.complete(), false);
  } finally { Object.defineProperty(Promise.prototype, 'constructor', descriptor); }
  await assert.rejects(p, invalid()); assert.equal(totals.hooks, 0);
});
await selected('Promise species drift at notification is refused without a species getter', async () => {
  const c = CLOSE(1000), p = c.start(), descriptor = Object.getOwnPropertyDescriptor(Promise, Symbol.species);
  try {
    Object.defineProperty(Promise, Symbol.species, { configurable: true, get() { totals.hooks++; throw new Error('SPECIES'); } });
    assert.equal(c.complete(), false);
  } finally { Object.defineProperty(Promise, Symbol.species, descriptor); }
  await assert.rejects(p, invalid()); assert.equal(totals.hooks, 0);
});
await selected('restoring intrinsics cannot repair an already refused close notification', async () => {
  const c = CLOSE(1000), p = c.start(), descriptor = Object.getOwnPropertyDescriptor(Promise.prototype, 'constructor');
  try { Object.defineProperty(Promise.prototype, 'constructor', { ...descriptor, value: function Changed() {} }); c.complete(); }
  finally { Object.defineProperty(Promise.prototype, 'constructor', descriptor); }
  await assert.rejects(p, invalid()); assert.equal(c.complete(), false); assert.equal(c.inspect().completionOffered, false);
});
await selected('two close components have independent budgets and never borrow a completion signal', async () => {
  const a = CLOSE(1000), b = CLOSE(20), ap = a.start(), bp = b.start();
  a.complete(); await ap; await assert.rejects(bp, invalid());
  assert.equal(a.inspect().outcome, 'CLOSED'); assert.equal(b.inspect().outcome, 'UNKNOWN');
});
await selected('cached inspection cannot turn a pending observation into a close permit', async () => {
  const c = CLOSE(1000), p = c.start();
  for (let i = 0; i < 32; i++) {
    assert.equal(c.inspect().outcome, 'PENDING'); assert.equal(c.inspect().currentResourceGuardsRequired, true);
  }
  assert.equal(c.inspect().completionProbeEntries, 1); c.complete(); await p;
});
await selected('actual funding-close lifecycle joins the actual bounded observer with declared zero counts', async () => {
  const c = CLOSE(1000), p = c.start(), f = fund(); await f.promise;
  assert.equal(f.core.snapshot().phase, 'CLOSED');
  c.complete(); await p;
  assert.equal(c.inspect().outcome, 'CLOSED'); assert.equal(c.inspect().currentResourceGuardsRequired, true);
});
await selected('actual funding late UNKNOWN before readiness leaves the bounded close permanently held', async () => {
  const c = CLOSE(20), p = c.start(), f = fund(); await f.promise; f.core.markUnknown();
  if (f.core.snapshot().phase === 'CLOSED') c.complete();
  await assert.rejects(p, invalid());
  assert.equal(f.core.snapshot().phase, 'CLOSE_UNKNOWN'); assert.equal(c.complete(), false);
});
await selected('actual funding late UNKNOWN after notification still requires the owner post-await guard', async () => {
  const c = CLOSE(1000), p = c.start(), f = fund(); await f.promise;
  c.complete(); f.core.markUnknown(); await p;
  if (f.core.snapshot().phase === 'CLOSED') totals.declaredStoreEntries++;
  assert.equal(c.inspect().outcome, 'CLOSED'); assert.equal(f.core.snapshot().phase, 'CLOSE_UNKNOWN');
  assert.equal(totals.declaredStoreEntries, 0);
});
await selected('input failures and observations expose no callback resource or raw failure payload', async () => {
  const c = CLOSE(1000), p = c.start(); c.complete(); await p;
  const view = c.inspect(); assert.equal(Object.getPrototypeOf(view), null);
  for (const value of Object.values(view)) assert.equal(typeof value === 'function', false);
  assert.equal(view.physicalDrain, 'NOT_ESTABLISHED'); assert.equal(view.automaticRetry, false);
  assert.equal(totals.actualFundingCoreConstructions, 3); assert.equal(totals.declaredMaterialReleases, 3);
  assert.equal(totals.declaredStoreEntries, 0); assert.equal(totals.hooks, 0);
});

assert.equal(totals.entered, 24); assert.equal(totals.completed, 24);
console.log('# bounded-close-completion ' + JSON.stringify({ ...totals, names,
  actualBoundedObserver: true, actualFundingCloseComponent: true, realNodeTimers: true,
  actualNativeApplication: false, SDK: false, SQLite: false, sockets: false, signatures: 0, nonceSearch: false,
  physicalDrain: 'NOT_ESTABLISHED', authority: 'NONE' }));
