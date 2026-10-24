// Selected actual boundary/join components. Callbacks are declared in-memory
// DATA, never a native TLS handle, SQL store, SDK, signature or payment proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createNativeGuardedStoreCloseBoundary as BOUNDARY } from '../src/service-credit-native-guarded-store-close.js';
import { createOriginalFundingBoundedReadCloseCoordinator as JOIN } from '../src/zenon/dynamic-plasma-original-funding-bounded-read-close.js';

assert.equal(process.version, 'v24.19.0'); assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.argv.length, 2);
assert.equal(process.env.X402_NATIVE_STORE_BOUNDARY_SELECTION, 'eighteen-boundary-three-join-data-cases-only');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
for (const key of ['NODE_OPTIONS','NODE_PATH','NODE_TEST_CONTEXT','NODE_V8_COVERAGE']) assert.equal(process.env[key], undefined);
assert.ok(process.permission && !process.permission.has('child') && !process.permission.has('worker')
  && !process.permission.has('fs.write'));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PINS = JSON.parse(process.env.X402_NATIVE_STORE_BOUNDARY_SOURCE_PINS);
const names = ['package.json', 'src/service-credit-native-guarded-store-close.js',
  'src/zenon/dynamic-plasma-original-funding-bounded-read-close.js',
  'src/zenon/dynamic-plasma-original-funding-read-close.js', 'src/service-credit-bounded-operation-drain.js',
  'qualification/native-guarded-store-close.behavior.draft.mjs'];
assert.deepEqual(PINS.map(p => p.path), names);
const identity = s => [s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String);
function verify() {
  let bytes = 0;
  for (const p of PINS) {
    const path = resolve(ROOT, p.path), state = lstatSync(path, { bigint: true });
    assert.ok(state.isFile() && !state.isSymbolicLink()); assert.equal(state.nlink, 1n);
    assert.deepEqual(identity(state), p.identity);
    const raw = readFileSync(path); bytes += raw.length; assert.ok(bytes < 262144);
    assert.equal(raw.length, p.bytes); assert.equal(createHash('sha256').update(raw).digest('hex'), p.sha256);
    assert.deepEqual(identity(lstatSync(path, { bigint: true })), p.identity);
  }
}
verify();
const F = Object.freeze, OPT = { concurrency: false, timeout: 3000 }, totals = { entered: 0, completed: 0, hooks: 0 };
const ticks = async () => { for (let i = 0; i < 12; i++) await undefined; };
function deferred() {
  let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => undefined); return { promise, resolve, reject };
}
function inputError(e) {
  return e instanceof TypeError && Object.isFrozen(e) && e.code === 'native_guarded_store_close_input_rejected';
}
async function scenario(name, run) {
  let complete = false;
  await test(name, OPT, async () => { totals.entered++; await run(); totals.completed++; complete = true; });
  if (!complete) throw new Error('NATIVE_STORE_BOUNDARY_CASE_FAILED_STOP');
}
function fixture(guard = () => true, close = () => undefined) {
  const log = []; let b;
  const config = F({ nativeGuard: F(function nativeGuard() { log.push('guard'); return guard(b); }),
    closeResource: F(function closeResource() { log.push('close'); return close(b); }) });
  b = BOUNDARY(config); return { b, config, log };
}
await scenario('construction is inert and supplies no native SQL or retry authority', () => {
  const f = fixture(), s = f.b.snapshot(); assert.deepEqual(f.log, []);
  assert.ok(Object.isFrozen(f.b)); assert.equal(s.attempted, false); assert.equal(s.resourceCloseEntered, false);
  assert.equal(s.automaticRetry, false); assert.equal(s.nativeHandleBrandAuthenticated, false);
  assert.equal(s.authority, 'NONE'); assert.equal(s.physicalDrain, 'NOT_ESTABLISHED');
});
await scenario('strict clean guards surround exactly one synchronous void close', () => {
  const f = fixture(); assert.equal(f.b.close(), true); assert.deepEqual(f.log, ['guard','close','guard']);
  const s = f.b.snapshot(); assert.equal(s.clean, true); assert.equal(s.guardChecks, 2);
  assert.equal(s.stage, 'CLOSED'); assert.equal(s.resourceCloseEntered, true); assert.equal(s.resourceCloseReturned, true);
});
await scenario('false or nonboolean before-guard never enters close or assimilates a thenable', () => {
  const thenable = F({ get then() { totals.hooks++; throw new Error('THEN'); } });
  for (const v of [false, undefined, 1, 'true', {}, thenable, Promise.resolve(true)]) {
    const f = fixture(() => v); assert.equal(f.b.close(), false);
    assert.deepEqual(f.log, ['guard']); assert.equal(f.b.snapshot().resourceCloseEntered, false);
    assert.equal(f.b.snapshot().firstRefusal, 'BEFORE_REFUSED');
  }
  assert.equal(totals.hooks, 0);
});
await scenario('throwing before-guard is held before resource entry', () => {
  const f = fixture(() => { throw new Error('DECLARED_GUARD_FAILURE'); });
  assert.equal(f.b.close(), false); assert.equal(f.b.snapshot().firstRefusal, 'BEFORE_THREW');
  assert.equal(f.b.snapshot().stage, 'HELD_BEFORE_CLOSE'); assert.deepEqual(f.log, ['guard']);
});
await scenario('an earlier clean observation is not a cached permit for later close entry', () => {
  let allowed = true; const f = fixture(() => allowed); assert.equal(allowed, true); allowed = false;
  assert.equal(f.b.close(), false); assert.equal(f.b.snapshot().resourceCloseEntered, false);
});
await scenario('post-return refusal truthfully retains returned-close evidence without undo or retry', () => {
  let allowed = true; const f = fixture(() => allowed, () => { allowed = false; });
  assert.equal(f.b.close(), false); const s = f.b.snapshot();
  assert.equal(s.stage, 'HELD_AFTER_CLOSE_RETURN'); assert.equal(s.resourceCloseEntered, true);
  assert.equal(s.resourceCloseReturned, true); assert.equal(s.resourceCloseOutcome, 'VOID_RETURNED');
  assert.equal(s.firstRefusal, 'AFTER_REFUSED'); assert.equal(f.b.close(), false);
  assert.deepEqual(f.log, ['guard','close','guard']);
});
await scenario('throwing post-guard cannot relabel a returned resource close as unentered', () => {
  let checks = 0; const f = fixture(() => { if (++checks === 2) throw new Error('AFTER'); return true; });
  assert.equal(f.b.close(), false); assert.equal(f.b.snapshot().firstRefusal, 'AFTER_THREW');
  assert.equal(f.b.snapshot().resourceCloseReturned, true);
});
await scenario('resource close throw permanently holds one entry with unknown return', () => {
  const f = fixture(undefined, () => { throw new Error('DECLARED_CLOSE_FAILURE'); });
  assert.equal(f.b.close(), false); assert.equal(f.b.close(), false); const s = f.b.snapshot();
  assert.equal(s.resourceCloseEntered, true); assert.equal(s.resourceCloseReturned, false);
  assert.equal(s.resourceCloseOutcome, 'THREW'); assert.deepEqual(f.log, ['guard','close']);
});
await scenario('non-void resource return is invalid and never awaited or assimilated', () => {
  const thenable = F({ get then() { totals.hooks++; throw new Error('THEN'); } });
  for (const v of [null, true, 0, {}, thenable, Promise.resolve(undefined)]) {
    const f = fixture(undefined, () => v); assert.equal(f.b.close(), false);
    assert.equal(f.b.snapshot().resourceCloseOutcome, 'INVALID_RETURN');
    assert.equal(f.b.snapshot().resourceCloseReturned, false); assert.equal(f.b.close(), false);
    assert.deepEqual(f.log, ['guard','close']);
  }
  assert.equal(totals.hooks, 0);
});
await scenario('before-guard reentry is held without claiming resource entry', () => {
  const f = fixture(b => { assert.equal(b.close(), false); return true; });
  assert.equal(f.b.close(), false); assert.equal(f.b.snapshot().firstRefusal, 'REENTRANT_CLOSE');
  assert.equal(f.b.snapshot().resourceCloseEntered, false); assert.deepEqual(f.log, ['guard']);
});
await scenario('resource-close reentry is held after its one void return with no repeat', () => {
  const f = fixture(undefined, b => { assert.equal(b.close(), false); });
  assert.equal(f.b.close(), false); const s = f.b.snapshot();
  assert.equal(s.firstRefusal, 'REENTRANT_CLOSE'); assert.equal(s.stage, 'HELD_AFTER_CLOSE_RETURN');
  assert.equal(s.resourceCloseReturned, true); assert.equal(s.clean, false);
  assert.equal(f.b.close(), false); assert.deepEqual(f.log, ['guard','close','guard']);
});
await scenario('post-guard reentry latches unknown despite a true outer return', () => {
  let checks = 0; const f = fixture(b => { if (++checks === 2) assert.equal(b.close(), false); return true; });
  assert.equal(f.b.close(), false); assert.equal(f.b.snapshot().clean, false);
  assert.equal(f.b.snapshot().stage, 'HELD_AFTER_CLOSE_RETURN'); assert.equal(f.b.snapshot().guardChecks, 2);
});
await scenario('repeated clean close is cached without new callbacks or observations', () => {
  const f = fixture(); assert.equal(f.b.close(), true);
  for (let i = 0; i < 32; i++) assert.equal(f.b.close(), true);
  assert.deepEqual(f.log, ['guard','close','guard']); assert.equal(f.b.snapshot().guardChecks, 2);
});
await scenario('repeated held close never rechecks a later repaired before-guard', () => {
  let allowed = false; const f = fixture(() => allowed); assert.equal(f.b.close(), false); allowed = true;
  assert.equal(f.b.close(), false); assert.deepEqual(f.log, ['guard']); assert.equal(f.b.snapshot().held, true);
});
await scenario('snapshots are immutable DATA without captured callbacks or resource references', () => {
  const f = fixture(), before = f.b.snapshot(); f.b.close(); const after = f.b.snapshot();
  assert.ok(Object.isFrozen(before) && Object.isFrozen(after)); assert.equal(before.attempted, false);
  assert.equal(after.attempted, true);
  for (const s of [before, after]) for (const key of Reflect.ownKeys(s)) {
    const d = Object.getOwnPropertyDescriptor(s, key); assert.ok(Object.hasOwn(d, 'value'));
    assert.notEqual(typeof d.value, 'function'); assert.ok(d.value === null || typeof d.value !== 'object');
  }
});
await scenario('configuration proxies getters extra keys and nonfrozen records refuse with zero hooks', () => {
  const f = fixture(), trap = () => { totals.hooks++; throw new Error('HOOK'); };
  const proxy = new Proxy({}, { get: trap, getPrototypeOf: trap, ownKeys: trap, isExtensible: trap });
  for (const v of [null, {}, [], proxy, { ...f.config }, F({ ...f.config, extra: 1 }),
    F({ ...f.config, get nativeGuard() { return trap(); } })]) assert.throws(() => BOUNDARY(v), inputError);
  assert.equal(totals.hooks, 0); assert.deepEqual(f.log, []);
});
await scenario('callback shapes refuse proxies async functions and mutable functions without hooks', () => {
  const f = fixture(), trap = () => { totals.hooks++; throw new Error('HOOK'); };
  const proxy = new Proxy(function callback() {}, { get: trap, getPrototypeOf: trap, ownKeys: trap });
  for (const value of [null, true, () => true, F(async () => true), proxy])
    for (const key of ['nativeGuard','closeResource'])
      assert.throws(() => BOUNDARY(F({ ...f.config, [key]: value })), inputError);
  assert.equal(totals.hooks, 0);
});
await scenario('invalid constructor close and snapshot arity never enters callbacks', () => {
  const f = fixture(); assert.throws(() => BOUNDARY(), inputError); assert.throws(() => BOUNDARY(f.config, true), inputError);
  assert.throws(() => f.b.close(true), inputError); assert.throws(() => f.b.snapshot(true), inputError);
  assert.equal(f.b.snapshot().attempted, false); assert.deepEqual(f.log, []);
});
function composition({ budget = 500, delay = false } = {}) {
  let nativeClean = false, resourceEntries = 0, coordinator, childContinuation = null;
  const release = deferred(), log = [];
  const boundary = BOUNDARY(F({
    nativeGuard: F(function nativeGuard() {
      log.push('boundary-guard'); return coordinator.canCloseFunding() && nativeClean && coordinator.canCloseFunding();
    }),
    closeResource: F(function closeResource() { resourceEntries++; log.push('declared-resource-close'); }),
  }));
  coordinator = JOIN(F({
    startReadClose: F(function startReadClose() { log.push('declared-native-close'); nativeClean = true; return Promise.resolve(undefined); }),
    snapshotOperation: F(function snapshotOperation() { return null; }),
    closeFunding: F(function closeFunding() {
      log.push('declared-child-close'); assert.equal(coordinator.canCloseFunding(), true);
      const attempt = () => {
        const clean = boundary.close();
        if (!clean) throw new Error('DECLARED_RESOURCE_HELD');
        return F({ status: 'CLOSED' });
      };
      if (!delay) return Promise.resolve(attempt());
      childContinuation = release.promise.then(attempt); childContinuation.catch(() => undefined); return childContinuation;
    }),
    canCloseFunding: F(function canCloseFunding() { return nativeClean; }),
  }), budget);
  return { coordinator, boundary, release, log, entries: () => resourceEntries,
    nativeUnknown: () => { nativeClean = false; }, continuation: () => childContinuation };
}
await scenario('actual bounded join and boundary component order read close child join then one resource close', async () => {
  const f = composition(), p = f.coordinator.start(); const value = await p;
  assert.equal(value.lifecycle, 'CLOSED'); assert.equal(value.operationOutcome, 'NOT_ESTABLISHED');
  assert.equal(value.nativeResourceCleanup, 'NOT_QUALIFIED'); assert.equal(f.entries(), 1);
  assert.deepEqual(f.log, ['declared-native-close','declared-child-close','boundary-guard','declared-resource-close','boundary-guard']);
  assert.equal(f.boundary.snapshot().clean, true); assert.equal(f.coordinator.start(), p);
});
await scenario('native DATA becoming unknown during a child await vetoes actual component resource entry', async () => {
  const f = composition({ delay: true }), p = f.coordinator.start(); await ticks();
  assert.ok(f.continuation() instanceof Promise); f.nativeUnknown(); f.release.resolve(undefined);
  await assert.rejects(p); assert.equal(f.entries(), 0);
  assert.equal(f.boundary.snapshot().resourceCloseEntered, false); assert.equal(f.boundary.snapshot().held, true);
});
await scenario('expired actual join budget vetoes a late child continuation before component resource entry', async () => {
  const f = composition({ delay: true, budget: 30 }), p = f.coordinator.start(); await ticks();
  assert.ok(f.continuation() instanceof Promise); await assert.rejects(p);
  assert.equal(f.coordinator.inspect().held, true); assert.equal(f.coordinator.canCloseFunding(), false);
  f.release.resolve(undefined); await assert.rejects(f.continuation()); await ticks();
  assert.equal(f.entries(), 0); assert.equal(f.boundary.snapshot().resourceCloseEntered, false);
  assert.equal(f.coordinator.start(), p); assert.equal(f.boundary.close(), false);
});
verify();
assert.deepEqual(totals, { entered: 21, completed: 21, hooks: 0 });
console.log('# native-store-boundary-source ' + JSON.stringify({
  tests: 21, boundaryCases: 18, boundedJoinCases: 3, ...totals,
  actualBoundaryComponent: true, actualBoundedJoinComponent: true, realNodeTimers: true,
  actualNativeClient: false, actualOfficialSdk: false, actualV6Store: false,
  physicalDrain: 'NOT_ESTABLISHED', authority: 'NONE',
  inputs: PINS.map(({identity, ...pin}) => pin),
}));

