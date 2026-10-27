// Actual owned anonymous pipes/coordinator. Native acquisitions are DECLARED.
import assert from 'node:assert/strict';
import { fstatSync } from 'node:fs';
import { recoveryFixture } from './buyer-original-recovery.fixture.mjs';
import { createBuyerOwnedBackendRecoveryResource as OWN_BACKEND } from '../src/buyer-owned-backend-recovery-resource.js';
import { runBuyerOriginalRecoveryPipeHost as RUN } from '../src/buyer-original-recovery-pipe-host.js';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_ORIGINAL_RECOVERY_PIPE_CONTROL, 'current-opening-guard-declared-native-only');
assert.equal(process.argv.length, 5);
const [scenario, readFd, writeFd] = process.argv.slice(2);
const SCENARIOS = ['PAYER_LOAD_EXPIRES', 'BACKEND_LOAD_EXPIRES', 'PAYER_AFTER_BACKEND_LOAD_EXPIRES',
  'PAYER_SYNC_LOAD_EXPIRES', 'BACKEND_SYNC_LOAD_EXPIRES', 'GUARD_SUCCESS_AND_RETIRED',
  'BACKEND_GUARD_CANNOT_OPEN_PAYER', 'GUARD_ARGUMENTS_REFUSED'];
assert.ok(SCENARIOS.includes(scenario));
for (const value of [readFd, writeFd]) assert.match(value, /^[1-9][0-9]{0,3}$/);
const inputFd = Number(readFd), outputFd = Number(writeFd), F = Object.freeze, f = recoveryFixture();
const withBackend = scenario.startsWith('BACKEND_') || scenario === 'PAYER_AFTER_BACKEND_LOAD_EXPIRES'
  || scenario === 'GUARD_SUCCESS_AND_RETIRED';
const expires = scenario.endsWith('EXPIRES'), budgetMs = expires ? 30 : 1000;
const backendSlow = scenario === 'BACKEND_LOAD_EXPIRES' || scenario === 'BACKEND_SYNC_LOAD_EXPIRES';
const payerSlow = scenario === 'PAYER_LOAD_EXPIRES' || scenario === 'PAYER_AFTER_BACKEND_LOAD_EXPIRES'
  || scenario === 'PAYER_SYNC_LOAD_EXPIRES';
const asyncSlow = scenario.endsWith('LOAD_EXPIRES') && !scenario.includes('_SYNC_');
const id = fd => { const s = fstatSync(fd, { bigint: true }); return [s.dev, s.ino, s.uid, s.gid, s.mode].map(String); };
const standard = [0, 1, 2].map(id), timers = () => process.getActiveResourcesInfo().filter(name => name === 'Timeout').length;
const beforeTimers = timers(), tick = () => new Promise(resolve => setImmediate(resolve));
function pending() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
const releaseModule = pending(), slowDone = pending();
let payerCallbacks = 0, backendCallbacks = 0, payerAcquisitions = 0, backendAcquisitions = 0, storeCloses = 0;
let firstLoads = 0, secondLoads = 0, guardsProvided = 0, staleGuardsRefused = 0, argumentRefusals = 0, crossLegRefusals = 0;
const guards = [];
let backendGuard = null;
f.onClose = () => { f.phase = 'CLOSED'; return Promise.resolve(undefined); };
const CLOSE_STORE = F(function declaredStoreClose() { storeCloses++; assert.equal(storeCloses, 1); return undefined; });
function check(guard) {
  // Conditional only to reproduce the OLD coordinator with the identical test
  // source. Actual native bindings require the new guard unconditionally.
  if (typeof guard === 'function') guard();
}
function capture(guard) {
  if (typeof guard === 'function') { guardsProvided++; assert.ok(Object.isFrozen(guard)); guards.push(guard); }
}
async function loading(slow, guard) {
  check(guard); firstLoads++;
  if (slow) {
    if (asyncSlow) await releaseModule.promise;
    else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80);
  }
  check(guard); secondLoads++; // A second import/constructor must not start late.
  check(guard);
}
const OPEN_BACKEND = F(async function declaredBackendOpen(bootstrap, requireCurrentOpening) {
  backendCallbacks++; assert.equal(backendCallbacks, 1); assert.equal(payerCallbacks, 0);
  assert.equal(bootstrap.recoveryPipeBootstrapVersion, 2); capture(requireCurrentOpening); backendGuard = requireCurrentOpening;
  try {
    await loading(backendSlow, requireCurrentOpening); backendAcquisitions++;
    return OWN_BACKEND({ reader: f.backend, closeStore: CLOSE_STORE });
  } finally { if (backendSlow) slowDone.resolve(); }
});
const OPEN_PAYER = F(async function declaredPayerOpen(bootstrap, requireCurrentOpening) {
  payerCallbacks++; assert.equal(payerCallbacks, 1); capture(requireCurrentOpening);
  assert.equal(bootstrap.payerOptions.deadlineMs, budgetMs);
  if (scenario === 'BACKEND_GUARD_CANNOT_OPEN_PAYER' && typeof backendGuard === 'function') {
    assert.throws(() => backendGuard()); crossLegRefusals++;
  }
  if (scenario === 'GUARD_ARGUMENTS_REFUSED' && typeof requireCurrentOpening === 'function') {
    assert.throws(() => requireCurrentOpening(1)); argumentRefusals++;
  }
  try {
    await loading(payerSlow, requireCurrentOpening); payerAcquisitions++;
    return f.native;
  } finally { if (payerSlow) slowDone.resolve(); }
});
const result = await RUN({ inputFd, outputFd, allowedRoot: '/synthetic-recovery',
  openNativeClient: OPEN_PAYER, openBackend: OPEN_BACKEND });
const beforeLate = JSON.stringify(result), beforeAcquisition = { payerAcquisitions, backendAcquisitions };
if (expires && asyncSlow) releaseModule.resolve();
if (expires) await slowDone.promise;
await tick(); await tick();
for (const guard of guards) { assert.throws(() => guard()); staleGuardsRefused++; }
for (const fd of [inputFd, outputFd]) assert.throws(() => fstatSync(fd), { code: 'EBADF' });
assert.deepEqual([0, 1, 2].map(id), standard);
assert.equal(JSON.stringify(result), beforeLate); assert.equal(result.authority, 'NONE');
assert.equal(result.serviceDelivery, 'NOT_ESTABLISHED'); assert.equal(result.acquisitionBudgetMs, budgetMs);
assert.equal(timers(), beforeTimers); assert.equal(f.services + f.restores + f.stateReads + f.checkpointReads + f.backendReads, 0);
const expectedPayer = expires ? 0 : 1, expectedBackend = withBackend && !backendSlow ? 1 : 0;
const expectedGuards = (withBackend ? 1 : 0) + (backendSlow ? 0 : 1);
const expectedSecondLoads = expires ? (withBackend && !backendSlow ? 1 : 0) : expectedGuards;
const passed = secondLoads === expectedSecondLoads && payerAcquisitions === expectedPayer && backendAcquisitions === expectedBackend
  && guardsProvided === expectedGuards && staleGuardsRefused === expectedGuards
  && (scenario !== 'GUARD_ARGUMENTS_REFUSED' || argumentRefusals === 1)
  && (scenario !== 'BACKEND_GUARD_CANNOT_OPEN_PAYER' || crossLegRefusals === 1)
  && (expires ? result.status === 'CLOSE_UNKNOWN' && result.acquisitionOutcome === 'UNKNOWN'
    : result.status === 'CLOSED' && result.acquisitionOutcome === 'TRANSFERRED');
// Preserve observed counters even when the unchanged-source regression fails.
process.stdout.write(JSON.stringify({ scenario, passed, result, budgetMs, payerCallbacks, backendCallbacks,
  payerAcquisitions, backendAcquisitions, beforeAcquisition, firstLoads, secondLoads, guardsProvided,
  staleGuardsRefused, argumentRefusals, crossLegRefusals, payerCloses: f.closes, readerCloses: f.backendCloses,
  storeCloses, ownedDescriptorsClosed: true, standardDescriptorsPreserved: true,
  activeTimeoutsBefore: beforeTimers, activeTimeoutsAfter: timers(), lateResultStayedUnknown: expires,
  serviceCalls: f.services, ipConnections: 0, nativeCallbacks: 'DECLARED', physicalRelease: 'NOT_QUALIFIED' }) + '\n');
assert.equal(secondLoads, expectedSecondLoads); assert.equal(payerAcquisitions, expectedPayer); assert.equal(backendAcquisitions, expectedBackend);
assert.equal(guardsProvided, expectedGuards); assert.equal(staleGuardsRefused, expectedGuards);
assert.equal(f.closes, expectedPayer); assert.equal(f.backendCloses, expectedBackend); assert.equal(storeCloses, expectedBackend);
assert.equal(passed, true);
