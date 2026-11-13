// Actual inspection coordinator/codecs with declared memory-only ports.
// Existing transaction-shaped fixture bytes are not authenticated or signed.
import assert from 'node:assert/strict';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as assemble } from '../src/zenon/dynamic-plasma-original-funding-data.js';
import { canonicalJson } from '../src/canonical.js';
import { consumeApiCreditRecoveryInspectionProfile as consume, releaseApiCreditRecoveryInspectionProfile as release } from '../src/api-credit-recovery-inspection-profile.js';
import { captureServiceCreditRecoveryInspectionResult as redact } from '../src/service-credit-recovery-inspection-owner.js';
import { createApiCreditRecoveryInspectionCoordinator as recovery,
  createApiCreditSignerInspectionCoordinator as signer,
  createApiCreditRecordedResultInspectionCoordinator as recorded,
  createApiCreditFundingInspectionCoordinator as funding,
  createApiCreditOriginalGrantQueryCoordinator as grant } from '../src/api-credit-recovery-inspection-coordinator.js';

const F = Object.freeze, cases = [], MODES = F([
  F({ mode: 'INSPECT', fd: 'inspectionFd', create: recovery }),
  F({ mode: 'SIGNER_INSPECT', fd: 'signerInspectionFd', create: signer }),
  F({ mode: 'RECORDED_RESULT', fd: 'recordedResultFd', create: recorded }),
  F({ mode: 'FUNDING_INSPECT', fd: 'fundingInspectionFd', create: funding }),
  F({ mode: 'ORIGINAL_GRANT_QUERY', fd: 'originalGrantQueryFd', create: grant }),
]);
function check(id, run) { cases.push({ id, run }); }
// Same valid recovery DATA profile used by the existing stop controls.
function profileText() {
  const f = retainedOriginalInputFixture(), packet = assemble(f.input, f.candidate, f.resourceUrl);
  return canonicalJson({ recoveryInspectionVersion: 1,
    selection: { originalPayment: { resourceUrl: f.resourceUrl, serializedCheckpoint: packet.serializedCheckpoint,
      expectedPins: packet.expectedPins }, selectedGrantId: 'grant.synthetic', paymentRequiredHeader: f.input.challenge.paymentRequiredHeader },
    payerOptions: { databasePath: '/synthetic/recovery-stop/payer.sqlite', allowedRoot: '/synthetic/recovery-stop',
      fundingResourceUrl: f.resourceUrl, custodyPolicy: { policyVersion: 1,
        serviceResourceUrl: new URL(f.resourceUrl).origin + '/service-credit/v1/execute', maxRequests: 128 },
      selectedGrantId: 'grant.synthetic', deadlineMs: 500 },
    backendOptions: { databasePath: '/synthetic/recovery-stop/backend.sqlite',
      limits: { busyTimeoutMs: 20, maxStateBytes: 65536, maxOffers: 8, maxGrants: 8, maxRequests: 128 } },
    requestKey: { grantId: 'grant.synthetic', requestId: 'request.original' },
    authorizationHeader: 'ServiceCredit declared-original-proof' });
}
function observed() {
  return redact(F({ status: 'CACHED_SUCCESS', backend: F({ status: 'CACHED_SUCCESS' }), authority: 'NONE',
    mayDispatchService: false, mayStartPayment: false, maySignPayment: false,
    deliveryConfirmed: false, serviceDelivery: 'NOT_ESTABLISHED' }));
}
function fixture(selected = MODES[0], options = {}) {
  const s = { clocks: 0, reads: 0, inspections: 0, writes: [], closes: 0, closed: false,
    faultEntered: false, joined: null, events: [], timers: [] };
  let controller;
  function entry(name) { s.events.push({ kind: 'PORT', name }); }
  const ports = F({
    readProfile: F(g => { entry('PROFILE'); s.reads++; g(); return Promise.resolve(profileText()); }),
    inspectOriginal: F((profile, g) => {
      entry('INSPECTION'); s.inspections++; g(); consume(profile);
      try { return Promise.resolve(observed()); } finally { release(profile); }
    }),
    writeResult: F((line, g) => { entry('OUTPUT'); s.writes.push(line); g(); return Promise.resolve(undefined); }),
    close: F(() => { s.closes++; s.closed = true; return Promise.resolve(undefined); }),
    inspect: F(() => F({ lifecycle: s.closed ? 'CLOSED' : 'OPEN', held: false, reading: false, writing: false })),
    clock: F(() => {
      s.clocks++; s.events.push({ kind: 'CLOCK', ordinal: s.clocks });
      if (options.joinRun && s.joined === null) s.joined = controller.run();
      if (!s.faultEntered && s.clocks === options.clockOrdinal) {
        s.faultEntered = true;
        if (options.fault === 'STOP') controller.requestStop();
        else if (options.fault === 'EXPIRE') {
          const timer = s.timers.find(t => !t.afterClose); assert.notEqual(timer, undefined); timer.callback();
        } else assert.fail('UNREVIEWED_DECLARED_CLOCK_FAULT');
      }
      return 0n;
    }),
    armTimer: F((budget, callback) => {
      const token = F({ id: s.timers.length + 1 });
      s.timers.push({ token, budget, callback, cancels: 0, afterClose: s.closes !== 0 }); return token;
    }),
    cancelTimer: F(token => { const timer = s.timers.find(t => t.token === token); assert.notEqual(timer, undefined); timer.cancels++; }),
  });
  controller = selected.create(F({ arguments: F({ mode: selected.mode, [selected.fd]: 3, outputFd: 6, bootstrapMs: 1000 }), ports }));
  return { controller, s };
}
function noAuthority(value) {
  assert.equal(value.authority, 'NONE'); assert.equal(value.mayDispatchService, false);
  assert.equal(value.mayStartPayment, false); assert.equal(value.maySignPayment, false);
  assert.equal(value.automaticRetry, false); assert.equal(value.nativeResourceRelease, 'NOT_ESTABLISHED');
}
function closedOnce(f) {
  assert.equal(f.s.closes, 1); assert.ok(f.s.timers.length > 0);
  assert.ok(f.s.timers.every(t => t.cancels === 1));
}
// Derive semantic admission cutpoints from observed successful port entries.
// No fixed clock-call number, sleep, source rewrite or injected product hook.
let admission = null;
check('inspection-clock-clean-control-records-all-three-admission-boundaries', async () => {
  const f = fixture(), run = f.controller.run(), value = await run;
  assert.equal(value.status, 'CLOSED'); assert.equal(value.exitCode, 0); noAuthority(value); closedOnce(f);
  assert.deepEqual([f.s.reads, f.s.inspections, f.s.writes.length], [1, 1, 1]);
  const found = {};
  for (let i = 0; i < f.s.events.length; i++) {
    const event = f.s.events[i]; if (event.kind !== 'PORT') continue;
    assert.equal(f.s.events[i - 1]?.kind, 'CLOCK'); found[event.name] = f.s.events[i - 1].ordinal;
  }
  assert.deepEqual(Object.keys(found), ['PROFILE', 'INSPECTION', 'OUTPUT']);
  assert.ok(found.PROFILE < found.INSPECTION && found.INSPECTION < found.OUTPUT);
  admission = F(found); assert.equal(f.controller.run(), run);
});
check('inspection-clock-reentrant-run-keeps-the-original-receipt-and-entries', async () => {
  const f = fixture(MODES[0], { joinRun: true }), run = f.controller.run();
  assert.equal(f.s.joined, run); const value = await run;
  assert.equal(value.status, 'CLOSED'); noAuthority(value); closedOnce(f);
  assert.deepEqual([f.s.reads, f.s.inspections, f.s.writes.length], [1, 1, 1]);
});
async function refused(selected, stage, fault) {
  assert.notEqual(admission, null);
  const f = fixture(selected, { clockOrdinal: admission[stage], fault }), run = f.controller.run();
  const value = await run; assert.equal(f.s.faultEntered, true);
  assert.equal(value.status, 'CLOSE_UNKNOWN'); assert.equal(value.exitCode, 4); noAuthority(value); closedOnce(f);
  const expected = stage === 'PROFILE' ? [0, 0, 0] : stage === 'INSPECTION' ? [1, 0, 0] : [1, 1, 0];
  assert.deepEqual([f.s.reads, f.s.inspections, f.s.writes.length], expected);
  assert.equal(value.outputWriteObserved, false);
  const counts = [f.s.reads, f.s.inspections, f.s.writes.length, f.s.closes, f.s.timers.length];
  f.controller.requestStop(); assert.equal(f.controller.run(), run); assert.equal(await run, value);
  assert.deepEqual([f.s.reads, f.s.inspections, f.s.writes.length, f.s.closes, f.s.timers.length], counts);
}
for (const selected of MODES) {
  check('inspection-clock-stop-prevents-profile-port-entry-' + selected.mode.toLowerCase(), () => refused(selected, 'PROFILE', 'STOP'));
}
for (const stage of ['INSPECTION', 'OUTPUT']) {
  check('inspection-clock-stop-prevents-' + stage.toLowerCase() + '-port-entry', () => refused(MODES[0], stage, 'STOP'));
}
for (const stage of ['PROFILE', 'INSPECTION', 'OUTPUT']) {
  check('inspection-clock-expiry-prevents-' + stage.toLowerCase() + '-port-entry', () => refused(MODES[0], stage, 'EXPIRE'));
}

const results = []; let active = null, reported = false;
function report() {
  if (reported) return; reported = true;
  const failed = results.filter(row => row.status !== 'PASS').length;
  process.stdout.write(JSON.stringify({ qualification: 'G2_INSPECTION_CLOCK_ADMISSION_DATA',
    passed: results.length - failed, failed, cases: results, admissionCutpoints: admission,
    channelInspectionAndTimers: 'DECLARED_MEMORY_ONLY', actualSignals: 0,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0,
    nonceSearches: 0, nodeChildren: 0, actualPrepare: 0,
    freshProcess: 'NOT_ESTABLISHED', physicalRelease: 'NOT_ESTABLISHED', G0G5Acceptance: 'OPEN' }) + '\n');
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
