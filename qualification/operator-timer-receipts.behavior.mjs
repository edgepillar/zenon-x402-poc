// Actual operator coordinator with declared memory-only ports and timer tokens.
// Profile input refuses before credential, key, session or host entry.
import assert from 'node:assert/strict';
import { createApiCreditOperatorCoordinator as create } from '../src/api-credit-operator-coordinator.js';

const F = Object.freeze, cases = [];
function check(id, run) { cases.push({ id, run }); }
function fixture(options = {}) {
  const s = { now: 0n, reads: 0, inputsClosed: 0, forbiddenEntries: 0, timers: [],
    cancelEntries: 0, faultEntered: false, thenReads: 0, joined: null };
  let controller;
  const forbidden = F(() => { s.forbiddenEntries++; assert.fail('UNEXPECTED_OWNER_OR_CREDENTIAL_ENTRY'); });
  function malformed(kind) {
    if (kind === 'NULL') return null;
    if (kind === 'BOOLEAN') return false;
    if (kind === 'PROMISE') return Promise.resolve(undefined);
    if (kind === 'THENABLE') return F(Object.defineProperty({}, 'then', {
      enumerable: true, get() { s.thenReads++; assert.fail('OPAQUE_THENABLE_WAS_READ'); },
    }));
    assert.fail('UNREVIEWED_DECLARED_TIMER_RECEIPT');
  }
  const ports = F({
    readProfile: F(g => { s.reads++; g(); return Promise.reject(new TypeError('DECLARED_PROFILE_REFUSAL')); }),
    readCredential: forbidden, createKeyLease: forbidden, openSession: forbidden, runHost: forbidden, readDay: forbidden,
    closeInputs: F(() => { s.inputsClosed++; return Promise.resolve(undefined); }),
    clock: F(() => s.now),
    armTimer: F((budget, callback) => {
      const phase = s.inputsClosed === 0 ? 'STARTUP' : 'CLOSE';
      const selected = options.armPhase === phase;
      const token = selected ? malformed(options.armValue) : F({ id: s.timers.length + 1 });
      const timer = { phase, token, callback, budget, cancels: 0, known: !selected };
      s.timers.push(timer);
      if (selected) s.faultEntered = true;
      if (phase === 'CLOSE' && options.expireWhileArming) { s.faultEntered = true; callback(); }
      return token;
    }),
    cancelTimer: F(token => {
      s.cancelEntries++;
      const timer = s.timers.find(t => t.token === token); assert.notEqual(timer, undefined);
      timer.cancels++; assert.equal(timer.cancels, 1);
      const joined = controller.run();
      if (s.joined === null) s.joined = joined; else assert.equal(s.joined, joined);
      if (timer.phase === options.cancelPhase && !s.faultEntered) {
        s.faultEntered = true;
        if (options.cancelValue === 'THROW') throw new TypeError('DECLARED_CANCEL_REFUSAL');
        return malformed(options.cancelValue);
      }
      if (timer.phase === 'CLOSE' && options.expireWhileCancelling) {
        s.faultEntered = true; timer.callback();
      }
      if (timer.phase === 'CLOSE' && options.expireAfterCancellation) {
        s.faultEntered = true; s.now = 1000000001n;
      }
      return undefined;
    }),
  });
  controller = create(F({ arguments: F({ mode: 'RUN', profileFd: 3, keyFd: 4, inputFd: 5,
    outputFd: 6, bootstrapMs: 1000 }), ports }));
  return { controller, s };
}
async function result(options, expected) {
  const f = fixture(options), run = f.controller.run(), value = await run;
  assert.equal(f.controller.run(), run); assert.equal(await run, value);
  assert.equal(value.status, expected); assert.equal(value.exitCode, expected === 'BOOTSTRAP_REFUSED' ? 1 : 4);
  assert.equal(value.authority, 'NONE'); assert.equal(value.automaticRetry, false);
  assert.equal(value.nativeResourceRelease, 'NOT_ESTABLISHED'); assert.equal(value.keyErasure, 'NOT_ESTABLISHED');
  assert.equal(value.sessionAccepted, false); assert.equal(value.keyCreationEntered, false);
  assert.equal(value.credentialReadEntered, false); assert.equal(value.sessionOpeningEntered, false);
  assert.equal(f.s.forbiddenEntries, 0); assert.equal(f.s.inputsClosed, 1); assert.equal(f.s.thenReads, 0);
  for (const timer of f.s.timers) assert.equal(timer.cancels, timer.known ? 1 : 0);
  if (f.s.joined !== null) assert.equal(f.s.joined, run);
  const before = [f.s.reads, f.s.inputsClosed, f.s.cancelEntries, f.s.timers.length];
  f.controller.requestStop(); f.controller.requestStop();
  assert.equal(f.controller.run(), run); assert.equal(await run, value);
  assert.deepEqual([f.s.reads, f.s.inputsClosed, f.s.cancelEntries, f.s.timers.length], before);
  return f;
}
async function unknown(options) {
  const f = await result(options, 'CLOSE_UNKNOWN'); assert.equal(f.s.faultEntered, true); return f;
}

check('operator-timer-valid-void-cancellations-preserve-clean-profile-refusal', async () => {
  const f = await result({}, 'BOOTSTRAP_REFUSED');
  assert.equal(f.s.reads, 1); assert.deepEqual(f.s.timers.map(t => t.phase), ['STARTUP', 'CLOSE']);
});
for (const phase of ['STARTUP', 'CLOSE']) {
  for (const kind of ['BOOLEAN', 'PROMISE', 'THENABLE']) {
    check('operator-timer-' + phase.toLowerCase() + '-cancel-' + kind.toLowerCase() + '-retains-unknown', () =>
      unknown({ cancelPhase: phase, cancelValue: kind }));
  }
}
check('operator-timer-thrown-startup-cancellation-is-not-retried', () =>
  unknown({ cancelPhase: 'STARTUP', cancelValue: 'THROW' }));
check('operator-timer-thrown-close-cancellation-is-not-retried', () =>
  unknown({ cancelPhase: 'CLOSE', cancelValue: 'THROW' }));
check('operator-timer-expiry-during-close-cancellation-cannot-publish-clean', () =>
  unknown({ expireWhileCancelling: true }));
check('operator-timer-close-deadline-is-rechecked-after-cancellation', () =>
  unknown({ expireAfterCancellation: true }));
check('operator-timer-expiry-before-arm-returns-retires-the-known-handle-once', () =>
  unknown({ expireWhileArming: true }));
for (const phase of ['STARTUP', 'CLOSE']) {
  for (const kind of ['NULL', 'PROMISE']) {
    check('operator-timer-' + phase.toLowerCase() + '-arm-' + kind.toLowerCase() + '-is-not-a-cancel-capability', async () => {
      const f = await unknown({ armPhase: phase, armValue: kind });
      assert.equal(f.s.reads, phase === 'STARTUP' ? 0 : 1);
    });
  }
}

const results = []; let active = null, reported = false;
function report() {
  if (reported) return; reported = true;
  const failed = results.filter(row => row.status !== 'PASS').length;
  process.stdout.write(JSON.stringify({ qualification: 'G2_OPERATOR_TIMER_RECEIPTS_DATA',
    passed: results.length - failed, failed, cases: results, timersAndPorts: 'DECLARED_MEMORY_ONLY',
    actualTimers: 0, signalSubscriptions: 0, nativeExecutions: 0, SDK: 0, SQLite: 0,
    credentials: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0,
    actualPrepare: 0, physicalRelease: 'NOT_ESTABLISHED', freshProcess: 'NOT_ESTABLISHED', G0G5Acceptance: 'OPEN' }) + '\n');
  if (failed) process.exitCode = 1;
}
function unsettled() {
  if (active !== null) { results.push({ id: active, status: 'FAIL', error: 'UNSETTLED_DECLARED_PROMISE' }); report(); }
}
process.once('beforeExit', unsettled);
for (const { id, run } of cases) {
  active = id;
  try { await run(); results.push({ id, status: 'PASS' }); }
  catch (error) { results.push({ id, status: 'FAIL', errorType: error?.name ?? 'UNKNOWN' }); }
  active = null;
}
process.off('beforeExit', unsettled); report();
