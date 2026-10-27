// Actual OS pipes, whole startup budget and partial/late owner shutdown.
// Native payer/backend acquisitions and store closes remain declared callbacks.
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fstatSync } from 'node:fs';
import { recoveryFixture } from './buyer-original-recovery.fixture.mjs';
import { createBuyerOwnedBackendRecoveryResource as OWN_BACKEND } from '../src/buyer-owned-backend-recovery-resource.js';
import { runBuyerOriginalRecoveryPipeHost as RUN } from '../src/buyer-original-recovery-pipe-host.js';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_ORIGINAL_RECOVERY_PIPE_CONTROL, 'explicit-whole-acquisition-declared-native-only');
assert.equal(process.argv.length, 5);
const [scenario, readFd, writeFd] = process.argv.slice(2);
const scenarios = ['LOCAL_OPEN_PENDING', 'LOCAL_OPEN_LATE', 'LOCAL_LATE_CLOSE_REJECTS', 'LOCAL_LATE_CLOSE_PENDING',
  'LOCAL_LATE_CLOSE_THENABLE', 'LOCAL_LATE_OWNER_SHAPE', 'LOCAL_SYNC_OPEN_EXPIRES', 'BACKEND_OPEN_PENDING',
  'BACKEND_OPEN_LATE', 'BACKEND_LATE_STORE_CLOSE_REJECTS', 'BACKEND_SYNC_OPEN_EXPIRES',
  'BACKEND_PREFIX_PAYER_PENDING', 'BACKEND_PREFIX_PAYER_LATE', 'BACKEND_SHARED_BUDGET',
  'CLIENT_SETUP_BUDGET_EXPIRES', 'STARTUP_TIMER_CANCELLED'];
assert.ok(scenarios.includes(scenario));
assert.match(readFd, /^[1-9][0-9]{0,3}$/); assert.match(writeFd, /^[1-9][0-9]{0,3}$/);
const inputFd = Number(readFd), outputFd = Number(writeFd), F = Object.freeze, f = recoveryFixture(), order = [];
const withBackend = scenario.startsWith('BACKEND_') || scenario === 'STARTUP_TIMER_CANCELLED';
const backendOnly = ['BACKEND_OPEN_PENDING', 'BACKEND_OPEN_LATE', 'BACKEND_LATE_STORE_CLOSE_REJECTS', 'BACKEND_SYNC_OPEN_EXPIRES'].includes(scenario);
const budgetMs = ['BACKEND_SHARED_BUDGET', 'STARTUP_TIMER_CANCELLED'].includes(scenario) ? 80 : 30;
const id = fd => { const s = fstatSync(fd, { bigint: true }); return [s.dev, s.ino, s.uid, s.gid, s.mode].map(String); };
const standard = [0, 1, 2].map(id), activeTimeouts = () => process.getActiveResourcesInfo().filter(name => name === 'Timeout').length;
const beforeTimeouts = activeTimeouts();
const tick = () => new Promise(resolve => setImmediate(resolve));
const block = () => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80); };
function pending() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
const payerStopped = pending(), storeStopped = pending();
let payerOpens = 0, backendOpens = 0, storeCloses = 0, hooks = 0, late = null, resource = null;
f.onBackendClose = () => { order.push('READER_CLOSE'); return f.backendOutcome('CLOSED'); };
f.onClose = () => {
  order.push('PAYER_CLOSE'); payerStopped.resolve();
  if (scenario === 'LOCAL_LATE_CLOSE_REJECTS') return Promise.reject(Error('PRIVATE_LATE_CLOSE'));
  if (scenario === 'LOCAL_LATE_CLOSE_PENDING') return new Promise(() => {});
  if (scenario === 'LOCAL_LATE_CLOSE_THENABLE') return F({ get then() { hooks++; throw Error('PRIVATE_THEN_GETTER'); } });
  f.phase = 'CLOSED'; return Promise.resolve(undefined);
};
if (scenario === 'CLIENT_SETUP_BUDGET_EXPIRES') {
  let views = 0; f.onSnapshot = () => { if (++views === 1) block(); };
}
const CLOSE_STORE = F(function declaredStoreStop() {
  storeCloses++; order.push('STORE_CLOSE'); storeStopped.resolve();
  assert.equal(storeCloses, 1); assert.equal(f.backendCloses, 1);
  if (scenario === 'BACKEND_LATE_STORE_CLOSE_REJECTS') throw Error('PRIVATE_LATE_STORE_CLOSE');
  return undefined;
});
const OPEN_BACKEND = F(function declaredBackendOpen(bootstrap) {
  backendOpens++; assert.equal(backendOpens, 1); assert.equal(payerOpens, 0);
  assert.equal(bootstrap.recoveryPipeBootstrapVersion, 2); assert.equal(bootstrap.payerOptions.deadlineMs, budgetMs);
  resource = OWN_BACKEND({ reader: f.backend, closeStore: CLOSE_STORE });
  if (scenario === 'BACKEND_OPEN_PENDING') return new Promise(() => {});
  if (['BACKEND_OPEN_LATE', 'BACKEND_LATE_STORE_CLOSE_REJECTS'].includes(scenario)) {
    const value = pending(); late = () => value.resolve(resource); return value.promise;
  }
  if (scenario === 'BACKEND_SYNC_OPEN_EXPIRES') block();
  if (scenario === 'BACKEND_SHARED_BUDGET') return new Promise(resolve => setTimeout(() => resolve(resource), 50));
  return Promise.resolve(resource);
});
const OPEN_PAYER = F(function declaredPayerOpen(bootstrap) {
  payerOpens++; assert.equal(payerOpens, 1); assert.equal(bootstrap.payerOptions.deadlineMs, budgetMs);
  assert.equal(backendOpens, withBackend ? 1 : 0);
  if (['LOCAL_OPEN_PENDING', 'BACKEND_PREFIX_PAYER_PENDING'].includes(scenario)) return new Promise(() => {});
  if (['LOCAL_OPEN_LATE', 'LOCAL_LATE_CLOSE_REJECTS', 'LOCAL_LATE_CLOSE_PENDING', 'LOCAL_LATE_CLOSE_THENABLE',
    'LOCAL_LATE_OWNER_SHAPE', 'BACKEND_PREFIX_PAYER_LATE'].includes(scenario)) {
    const value = pending();
    late = () => value.resolve(scenario === 'LOCAL_LATE_OWNER_SHAPE'
      ? F({ ...f.native, get close() { hooks++; throw Error('PRIVATE_CLOSE_GETTER'); } }) : f.native);
    return value.promise;
  }
  if (scenario === 'LOCAL_SYNC_OPEN_EXPIRES') block();
  if (scenario === 'BACKEND_SHARED_BUDGET') return new Promise(resolve => setTimeout(() => resolve(f.native), 50));
  return Promise.resolve(f.native);
});
const started = process.hrtime.bigint();
const result = await new AsyncLocalStorage().run(F({ startupTrace: true }), () => RUN({
  inputFd, outputFd, allowedRoot: '/synthetic-recovery', openNativeClient: OPEN_PAYER, openBackend: OPEN_BACKEND,
}));
const elapsedMs = Number(process.hrtime.bigint() - started) / 1000000;
const beforeLate = JSON.stringify(result), observedBeforeLate = F({ payerCloses: f.closes, readerCloses: f.backendCloses, storeCloses });
assert.equal(Object.isFrozen(result), true); assert.equal(result.authority, 'NONE');
assert.equal(result.serviceDelivery, 'NOT_ESTABLISHED'); assert.equal(result.acquisitionBudgetMs, budgetMs);
assert.equal(result.acquisitionObservationOnly, true); assert.equal(result.nativeCancellationOrTermination, 'NOT_ESTABLISHED');
assert.equal(backendOpens, withBackend ? 1 : 0); assert.equal(payerOpens, backendOnly ? 0 : 1);
if (scenario === 'STARTUP_TIMER_CANCELLED') {
  assert.equal(result.status, 'CLOSED'); assert.equal(result.exitCode, 0);
  assert.equal(result.acquisitionOutcome, 'TRANSFERRED'); assert.equal(result.acquisitionRefusal, null);
  assert.equal(f.closes, 1); assert.equal(f.backendCloses, 1); assert.equal(storeCloses, 1);
} else {
  assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(result.exitCode, 4);
  assert.equal(result.acquisitionOutcome, 'UNKNOWN'); assert.equal(result.acquisitionRefusal, 'DEADLINE_UNKNOWN');
  assert.equal(result.nativeResourceRelease, 'NOT_ESTABLISHED');
}
if (scenario === 'CLIENT_SETUP_BUDGET_EXPIRES') {
  assert.equal(result.returnedSession, true); assert.equal(f.closes, 1);
}
if (scenario === 'BACKEND_PREFIX_PAYER_PENDING' || scenario === 'BACKEND_PREFIX_PAYER_LATE') {
  assert.equal(observedBeforeLate.payerCloses, 0); assert.equal(observedBeforeLate.readerCloses, 1);
  assert.equal(observedBeforeLate.storeCloses, 1); assert.equal(result.ownedBackendStoreClose, 'RETURNED_UNDEFINED');
}
if (scenario === 'BACKEND_OPEN_PENDING') assert.equal(f.backendCloses + storeCloses, 0);
if (scenario === 'LOCAL_OPEN_PENDING') assert.equal(f.closes, 0);
for (const fd of [inputFd, outputFd]) assert.throws(() => fstatSync(fd), { code: 'EBADF' });
assert.deepEqual([0, 1, 2].map(id), standard);
if (late !== null) {
  assert.equal(observedBeforeLate.payerCloses, 0);
  late();
  if (['BACKEND_OPEN_LATE', 'BACKEND_LATE_STORE_CLOSE_REJECTS'].includes(scenario)) await storeStopped.promise;
  else if (scenario !== 'LOCAL_LATE_OWNER_SHAPE') await payerStopped.promise;
}
if (scenario === 'BACKEND_SHARED_BUDGET') await payerStopped.promise;
await tick(); await tick();
assert.equal(JSON.stringify(result), beforeLate); assert.equal(hooks, 0);
assert.equal(f.services + f.restores + f.stateReads + f.checkpointReads + f.backendReads, 0);
const noReturnedPayer = backendOnly || ['LOCAL_OPEN_PENDING', 'BACKEND_PREFIX_PAYER_PENDING', 'LOCAL_LATE_OWNER_SHAPE'].includes(scenario);
assert.equal(f.closes, noReturnedPayer ? 0 : 1);
assert.equal(f.backendCloses, withBackend && scenario !== 'BACKEND_OPEN_PENDING' ? 1 : 0);
assert.equal(storeCloses, withBackend && scenario !== 'BACKEND_OPEN_PENDING' ? 1 : 0);
if (scenario === 'BACKEND_PREFIX_PAYER_LATE' || scenario === 'BACKEND_SHARED_BUDGET') {
  assert.ok(order.indexOf('STORE_CLOSE') < order.indexOf('PAYER_CLOSE'));
}
if (scenario === 'BACKEND_LATE_STORE_CLOSE_REJECTS') { assert.throws(() => resource.closeStore()); assert.equal(storeCloses, 1); }
assert.equal(activeTimeouts(), beforeTimeouts);
const text = JSON.stringify(result);
for (const secret of ['PRIVATE_', 'ServiceCredit ', '/synthetic-recovery', f.checkpoint.originalBytes.paymentPayload])
  assert.equal(text.includes(secret), false);
process.stdout.write(JSON.stringify({ scenario, passed: true, result, budgetMs, elapsedMs, payerOpens, backendOpens,
  payerCloses: f.closes, readerCloses: f.backendCloses, storeCloses, closeOrder: order, observedBeforeLate,
  activeTimeoutsBefore: beforeTimeouts, activeTimeoutsAfter: activeTimeouts(),
  ownedDescriptorsClosed: true, standardDescriptorsPreserved: true, lateResultStayedUnknown: scenario !== 'STARTUP_TIMER_CANCELLED',
  serviceCalls: f.services, ipConnections: 0, nativeCallbacks: 'DECLARED', physicalRelease: 'NOT_QUALIFIED' }) + '\n');
