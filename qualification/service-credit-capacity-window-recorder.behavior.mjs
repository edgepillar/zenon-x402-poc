import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceCreditCapacityWindowRecorder as create } from '../src/service-credit-capacity-window-recorder.js';

if (process.version !== 'v24.19.0'
    || process.env.X402_CAPACITY_WINDOW_DATA_SELECTION !== 'thirty-six-boundary-data-cases')
  throw new TypeError('CAPACITY_WINDOW_DATA_SELECTION_REQUIRED');
console.log('# capacity-window-data-runtime ' + JSON.stringify({ Node: process.version,
  platform: process.platform, arch: process.arch, eventsDeclared: true, nativeEffects: false }));

const make = (samples = 8, inFlight = 4) => create({ maxSamplesPerPhase: samples, maxInFlightPerPhase: inFlight });
const plain = value => JSON.parse(JSON.stringify(value));
const lane = summary => summary.phases.FUNDED_CALL;
const equalBalance = { observed: { availableUnits: 8n, heldUnits: 0n, consumedUnits: 2n },
  expected: { availableUnits: 8n, heldUnits: 0n, consumedUnits: 2n } };
let hooks = 0;

test('window separates warmup carry-in from measurement completions', () => {
  const r = make(); r.startWarmup(0n);
  const warm = r.begin('FUNDED_CALL', 1n); r.startMeasurement(10n);
  const measured = r.begin('FUNDED_CALL', 11n);
  warm.finish('SUCCEEDED', 20n); measured.finish('SUCCEEDED', 30n);
  r.stopMeasurement(40n); const s = r.finalize(50n);
  assert.equal(s.recordingState, 'COMPLETE');
  assert.equal(s.warmupNanoseconds, '10'); assert.equal(s.measurementNanoseconds, '30');
  assert.equal(s.drainNanoseconds, '10'); assert.equal(s.runNanoseconds, '50');
  assert.equal(lane(s).warmupInFlightAtStart, 1);
  assert.equal(lane(s).warmupTerminalsDuringMeasurement.succeeded, 1);
  assert.equal(lane(s).measurementTerminalsDuringMeasurement.succeeded, 1);
  assert.equal(lane(s).successfulWindowCompletionRatio.numerator, '1000000000');
  assert.equal(lane(s).successfulWindowCompletionRatio.denominator, '30');
  assert.equal(s.cohorts.WARMUP.phases.FUNDED_CALL.successfulLatencyNanoseconds.p50, '19');
});

test('window retains spill-out latency but never counts it in the closed-window numerator', () => {
  const r = make(); r.startMeasurement(0n);
  const h = r.begin('FUNDED_CALL', 5n); r.stopMeasurement(10n);
  h.finish('SUCCEEDED', 100n); const s = r.finalize(110n);
  assert.equal(s.recordingState, 'COMPLETE');
  assert.equal(lane(s).measurementInFlightAtStop, 1);
  assert.equal(lane(s).measurementTerminalsAfterMeasurement.succeeded, 1);
  assert.equal(lane(s).successfulWindowCompletionRatio.numerator, '0');
  assert.equal(s.cohorts.MEASUREMENT.phases.FUNDED_CALL.successfulLatencyNanoseconds.max, '95');
  assert.equal(s.drainNanoseconds, '100');
});

test('window measures overlapping completions against the explicit wall window', () => {
  const r = make(); r.startMeasurement(0n);
  const a = r.begin('FUNDED_CALL', 1n), b = r.begin('FUNDED_CALL', 2n);
  a.finish('SUCCEEDED', 9n); b.finish('SUCCEEDED', 10n);
  r.stopMeasurement(20n); const s = r.finalize(20n);
  assert.equal(lane(s).successfulWindowCompletionRatio.numerator, '2000000000');
  assert.equal(lane(s).successfulWindowCompletionRatio.denominator, '20');
  assert.equal(lane(s).peakInFlightDuringMeasurement, 2);
  assert.equal(lane(s).peakInFlightAcrossCohorts, 2);
});

test('window keeps rejection in terminal latency and error denominators', () => {
  const r = make(); r.startMeasurement(0n);
  r.begin('FUNDED_CALL', 0n).finish('REJECTED', 5n);
  r.begin('FUNDED_CALL', 6n).finish('SUCCEEDED', 7n);
  r.stopMeasurement(10n); const s = r.finalize(10n);
  assert.deepEqual(plain(s.cohorts.MEASUREMENT.phases.FUNDED_CALL.nonSuccessFraction), { numerator: 1, denominator: 2 });
  assert.equal(s.cohorts.MEASUREMENT.phases.FUNDED_CALL.terminalLatencyNanoseconds.samples, 2);
  assert.equal(lane(s).measurementTerminalsDuringMeasurement.rejected, 1);
  assert.equal(lane(s).successfulWindowCompletionRatio.numerator, '1000000000');
});

test('window UNKNOWN stops new recording and withholds an otherwise complete ratio', () => {
  const r = make(); r.startMeasurement(0n);
  r.begin('FUNDED_CALL', 1n).finish('UNKNOWN', 2n);
  r.stopMeasurement(5n); const s = r.finalize(6n);
  assert.equal(s.recordingState, 'COMPLETE'); assert.equal(s.stopReason, 'outcome_unknown');
  assert.equal(lane(s).successfulWindowCompletionRatio, null);
  assert.equal(lane(s).rateStatus, 'WITHHELD_STOPPED_RECORDING');
  assert.equal(s.cohorts.MEASUREMENT.phases.FUNDED_CALL.unknown, 1);
});

test('window refusal after UNKNOWN cannot omit the attempted observation', () => {
  const r = make(); r.startMeasurement(0n);
  r.begin('FUNDED_CALL', 1n).finish('UNKNOWN', 2n);
  assert.throws(() => r.begin('FUNDED_CALL', 3n));
  r.stopMeasurement(5n); const s = r.finalize(6n);
  assert.equal(s.recordingState, 'INCOMPLETE'); assert.equal(s.refusedStarts, 1);
  assert.equal(s.stopReason, 'outcome_unknown');
});

test('window in-flight limit spans warmup and measurement rather than resetting', () => {
  const r = make(4, 1); r.startWarmup(0n);
  const w = r.begin('FUNDED_CALL', 1n); r.startMeasurement(2n);
  assert.throws(() => r.begin('FUNDED_CALL', 3n));
  w.finish('SUCCEEDED', 4n); r.stopMeasurement(5n); const s = r.finalize(6n);
  assert.equal(s.recordingIssue, 'in_flight_limit');
  assert.equal(lane(s).peakInFlightAcrossCohorts, 1);
  assert.equal(lane(s).warmupTerminalsDuringMeasurement.succeeded, 1);
});

test('window sample limit spans both cohorts and never evicts warmup errors', () => {
  const r = make(2, 1); r.startWarmup(0n);
  r.begin('FUNDED_CALL', 1n).finish('REJECTED', 2n); r.startMeasurement(3n);
  const h = r.begin('FUNDED_CALL', 4n);
  assert.throws(() => r.begin('FUNDED_CALL', 5n));
  h.finish('SUCCEEDED', 6n); r.stopMeasurement(7n); const s = r.finalize(8n);
  assert.equal(s.recordingIssue, 'sample_limit'); assert.equal(lane(s).enteredAcrossCohorts, 2);
  assert.equal(s.cohorts.WARMUP.phases.FUNDED_CALL.rejected, 1);
});

test('window phases retain independent limits and no implied ledger transaction', () => {
  const r = make(1, 1); r.startMeasurement(0n);
  const f = r.begin('FUNDING', 1n), c = r.begin('FUNDED_CALL', 2n);
  f.finish('SUCCEEDED', 3n); c.finish('SUCCEEDED', 4n);
  r.stopMeasurement(5n); const s = r.finalize(6n);
  assert.equal(s.phases.FUNDING.enteredAcrossCohorts, 1);
  assert.equal(s.phases.LEDGER_TRANSACTION.enteredAcrossCohorts, 0);
  assert.equal(s.phases.LEDGER_TRANSACTION.successfulWindowCompletionRatio, null);
});

test('window explicit ledger observations use their own measured boundaries', () => {
  const r = make(); r.startMeasurement(0n);
  const call = r.begin('FUNDED_CALL', 1n), ledger = r.begin('LEDGER_TRANSACTION', 2n);
  ledger.finish('SUCCEEDED', 3n); call.finish('SUCCEEDED', 5n);
  r.stopMeasurement(10n); const s = r.finalize(11n);
  assert.equal(s.cohorts.MEASUREMENT.phases.LEDGER_TRANSACTION.successfulLatencyNanoseconds.p50, '1');
  assert.equal(s.cohorts.MEASUREMENT.phases.FUNDED_CALL.successfulLatencyNanoseconds.p50, '4');
});

test('window balance checks distinguish warmup measurement and drain', () => {
  const r = make(); r.startWarmup(0n); assert.equal(r.recordLedgerBalanceCheck(equalBalance, 1n), true);
  r.startMeasurement(2n); r.recordLedgerBalanceCheck(equalBalance, 3n);
  r.stopMeasurement(5n); r.recordLedgerBalanceCheck(equalBalance, 6n);
  const s = r.finalize(7n);
  assert.equal(s.ledgerBalanceChecks.samples, 3);
  for (const stage of ['WARMUP', 'MEASURING', 'DRAINING'])
    assert.equal(s.ledgerBalanceChecks.stages[stage].samples, 1);
  assert.equal(s.ledgerBalanceChecks.expectedBalances, 'CALLER_DECLARED_NOT_AUTHENTICATED');
});

test('window drain balance mismatch withholds a previously observed success ratio', () => {
  const r = make(); r.startMeasurement(0n);
  r.begin('FUNDED_CALL', 1n).finish('SUCCEEDED', 2n); r.stopMeasurement(3n);
  const bad = { observed: { availableUnits: 9n, heldUnits: 0n, consumedUnits: 1n }, expected: equalBalance.expected };
  assert.equal(r.recordLedgerBalanceCheck(bad, 4n), false); const s = r.finalize(5n);
  assert.equal(s.ledgerBalanceChecks.stages.DRAINING.mismatches, 1);
  assert.equal(s.stopReason, 'balance_mismatch'); assert.equal(lane(s).successfulWindowCompletionRatio, null);
  assert.equal(lane(s).measurementTerminalsDuringMeasurement.succeeded, 1);
});

test('window balance sample bound also spans all stages', () => {
  const r = make(2, 1); r.startWarmup(0n); r.recordLedgerBalanceCheck(equalBalance, 1n);
  r.startMeasurement(2n); r.recordLedgerBalanceCheck(equalBalance, 3n); r.stopMeasurement(4n);
  assert.throws(() => r.recordLedgerBalanceCheck(equalBalance, 5n));
  const s = r.finalize(6n);
  assert.equal(s.ledgerBalanceChecks.samples, 2); assert.equal(s.recordingIssue, 'balance_sample_limit');
});

test('window unfinished measurement handle stays visible after finalization', () => {
  const r = make(); r.startMeasurement(0n); const h = r.begin('FUNDED_CALL', 1n);
  r.stopMeasurement(5n); const s = r.finalize(6n);
  assert.equal(s.pendingObservations, 1); assert.equal(s.recordingState, 'INCOMPLETE');
  assert.equal(lane(s).measurementInFlightAtStop, 1); assert.equal(lane(s).successfulWindowCompletionRatio, null);
  assert.throws(() => h.finish('SUCCEEDED', 7n)); assert.equal(r.finalize(6n), s);
});

test('window pending warmup carry-in withholds ratios from other completed work', () => {
  const r = make(); r.startWarmup(0n); r.begin('FUNDING', 1n); r.startMeasurement(2n);
  r.begin('FUNDED_CALL', 3n).finish('SUCCEEDED', 4n);
  r.stopMeasurement(5n); const s = r.finalize(6n);
  assert.equal(s.phases.FUNDING.warmupInFlightAtStop, 1); assert.equal(s.pendingObservations, 1);
  assert.equal(lane(s).successfulWindowCompletionRatio, null);
});

test('window does not invent a stop boundary during finalize', () => {
  const r = make(); r.startMeasurement(0n); r.begin('FUNDED_CALL', 1n).finish('SUCCEEDED', 2n);
  const s = r.finalize(5n);
  assert.equal(s.recordingIssue, 'measurement_not_stopped'); assert.equal(s.measurementNanoseconds, null);
  assert.equal(lane(s).successfulWindowCompletionRatio, null);
});

test('window warmup-only run is not mislabeled as measured capacity', () => {
  const r = make(); r.startWarmup(0n); r.begin('FUNDED_CALL', 1n).finish('SUCCEEDED', 2n);
  const s = r.finalize(5n);
  assert.equal(s.recordingState, 'INCOMPLETE'); assert.equal(s.recordingIssue, 'measurement_not_started');
});

test('window supports an explicit measurement with no warmup', () => {
  const r = make(); r.startMeasurement(10n); r.begin('FUNDED_CALL', 11n).finish('SUCCEEDED', 12n);
  r.stopMeasurement(13n); const s = r.finalize(14n);
  assert.equal(s.warmupNanoseconds, null); assert.equal(s.runNanoseconds, '4');
  assert.equal(s.cohorts.WARMUP.recordingState, 'EMPTY'); assert.equal(s.recordingState, 'COMPLETE');
});

test('window empty lane has no fabricated rate and empty run stays EMPTY', () => {
  const r = make(); r.startMeasurement(0n); r.stopMeasurement(10n); const s = r.finalize(20n);
  assert.equal(s.recordingState, 'EMPTY'); assert.equal(lane(s).rateStatus, 'NO_MEASUREMENT_STARTS');
  assert.equal(lane(s).successfulWindowCompletionRatio, null);
  const untouched = make().finalize(0n); assert.equal(untouched.recordingState, 'EMPTY');
  assert.equal(untouched.runNanoseconds, null);
});

test('window equal timestamps use explicit before-stop call order', () => {
  const r = make(); r.startMeasurement(0n); r.begin('FUNDED_CALL', 1n).finish('SUCCEEDED', 10n);
  r.stopMeasurement(10n); const s = r.finalize(10n);
  assert.equal(lane(s).measurementTerminalsDuringMeasurement.succeeded, 1);
  assert.equal(lane(s).successfulWindowCompletionRatio.denominator, '10');
});

test('window equal timestamp completion after stop remains spill-out', () => {
  const r = make(); r.startMeasurement(0n); const h = r.begin('FUNDED_CALL', 1n);
  r.stopMeasurement(10n); h.finish('SUCCEEDED', 10n); const s = r.finalize(10n);
  assert.equal(lane(s).measurementTerminalsAfterMeasurement.succeeded, 1);
  assert.equal(lane(s).measurementTerminalsDuringMeasurement.succeeded, 0);
});

test('window zero-duration stop refuses without repairing coverage on later valid stop', () => {
  const r = make(); r.startMeasurement(10n); assert.throws(() => r.stopMeasurement(10n));
  r.stopMeasurement(11n); const s = r.finalize(12n);
  assert.equal(s.recordingIssue, 'empty_measurement_window'); assert.equal(s.recordingState, 'INCOMPLETE');
});

test('window monotonic clock failure still permits honest draining of valid handles', () => {
  const r = make(); r.startMeasurement(10n); const h = r.begin('FUNDED_CALL', 20n);
  assert.throws(() => h.finish('SUCCEEDED', 19n)); h.finish('SUCCEEDED', 30n);
  r.stopMeasurement(40n); const s = r.finalize(50n);
  assert.equal(s.recordingIssue, 'clock_rejected'); assert.equal(s.pendingObservations, 0);
  assert.equal(s.cohorts.MEASUREMENT.phases.FUNDED_CALL.succeeded, 1);
});

test('window bigint time bounds and exact rates avoid floating-point conversion', () => {
  const max = (1n << 128n) - 1n, r = make(); r.startMeasurement(max - 100n);
  r.begin('FUNDED_CALL', max - 90n).finish('SUCCEEDED', max - 80n);
  r.stopMeasurement(max - 10n); const s = r.finalize(max);
  assert.equal(s.measurementNanoseconds, '90'); assert.equal(s.runNanoseconds, '100');
  assert.equal(lane(s).successfulWindowCompletionRatio.denominator, '90');
  for (const bad of [-1n, max + 1n, 0, NaN, '0']) assert.throws(() => make().startMeasurement(bad));
});

test('window duplicate finish is sticky and cannot rewrite a terminal result', () => {
  const r = make(); r.startMeasurement(0n); const h = r.begin('FUNDED_CALL', 1n);
  h.finish('REJECTED', 2n); assert.throws(() => h.finish('SUCCEEDED', 3n));
  r.stopMeasurement(4n); const s = r.finalize(5n);
  assert.equal(s.recordingIssue, 'duplicate_finish');
  assert.equal(s.cohorts.MEASUREMENT.phases.FUNDED_CALL.rejected, 1);
  assert.equal(s.cohorts.MEASUREMENT.phases.FUNDED_CALL.succeeded, 0);
});

test('window refuses new observations after stop while allowing existing drain', () => {
  const r = make(); r.startMeasurement(0n); const h = r.begin('FUNDED_CALL', 1n); r.stopMeasurement(2n);
  assert.throws(() => r.begin('FUNDED_CALL', 3n)); h.finish('SUCCEEDED', 4n); const s = r.finalize(5n);
  assert.equal(s.refusedStarts, 1); assert.equal(s.recordingState, 'INCOMPLETE');
  assert.equal(lane(s).measurementTerminalsAfterMeasurement.succeeded, 1);
});

test('window boundary order errors never auto-reset the measurement generation', () => {
  for (const action of [r => r.stopMeasurement(1n), r => { r.startWarmup(0n); r.startWarmup(1n); },
    r => { r.startMeasurement(0n); r.startMeasurement(1n); }]) {
    const r = make(); assert.throws(() => action(r)); assert.equal(r.finalize(2n).recordingState, 'INCOMPLETE');
  }
});

test('window finalize caches one exact boundary and releases only recorder-owned collections', () => {
  const r = make(); r.startMeasurement(0n); r.begin('FUNDED_CALL', 1n).finish('SUCCEEDED', 2n);
  assert.equal(r.inspect().retainedDurationReferences, 2); r.stopMeasurement(3n);
  const s = r.finalize(4n); assert.equal(r.finalize(4n), s); assert.throws(() => r.finalize(5n));
  assert.equal(r.inspect().retainedDurationReferences, 0); assert.equal(r.inspect().retainedHandleReferences, 0);
  assert.equal(r.finalize(4n), s);
});

test('window report is deeply frozen and JSON safe without raw balances or authority', () => {
  const r = make(); r.startMeasurement(0n); r.recordLedgerBalanceCheck(equalBalance, 0n);
  r.begin('FUNDED_CALL', 1n).finish('SUCCEEDED', 2n); r.stopMeasurement(3n); const s = r.finalize(4n);
  function frozen(v) { if (v && typeof v === 'object') { assert.equal(Object.isFrozen(v), true); for (const k of Reflect.ownKeys(v)) frozen(v[k]); } }
  frozen(s); const text = JSON.stringify(s);
  assert.equal(text.includes('availableUnits'), false); assert.equal(s.authority, 'NONE');
  assert.equal(s.sustainableThroughput, 'NOT_ESTABLISHED'); assert.equal(s.physicalDrainQualified, false);
});

test('window configuration getters proxies and unknown fields cannot invoke hooks', () => {
  const getter = { maxInFlightPerPhase: 1 };
  Object.defineProperty(getter, 'maxSamplesPerPhase', { enumerable: true, get() { hooks++; return 1; } });
  const proxy = new Proxy({}, { ownKeys() { hooks++; return []; }, getPrototypeOf() { hooks++; return Object.prototype; } });
  for (const value of [getter, proxy, null, Object.create(null),
    { maxSamplesPerPhase: 1, maxInFlightPerPhase: 1, label: 'private' }]) assert.throws(() => create(value));
  assert.equal(hooks, 0);
});

test('window configuration limits are detached and bounded across cohorts', () => {
  const input = { maxSamplesPerPhase: 2, maxInFlightPerPhase: 1 }, r = create(input); input.maxSamplesPerPhase = 99;
  r.startMeasurement(0n); r.stopMeasurement(1n); assert.equal(r.finalize(2n).limits.maxSamplesPerPhase, 2);
  for (const pair of [[0, 1], [4097, 1], [1, 2], [100, 65], [true, 1], [1, -0]])
    assert.throws(() => create({ maxSamplesPerPhase: pair[0], maxInFlightPerPhase: pair[1] }));
});

test('window clock and outcome objects are never coerced or assimilated', () => {
  const value = { valueOf() { hooks++; return 1n; }, get then() { hooks++; return () => {}; } };
  assert.throws(() => make().startMeasurement(value));
  const r = make(); r.startMeasurement(0n); const h = r.begin('FUNDED_CALL', 1n);
  assert.throws(() => h.finish(value, 2n)); h.finish('SUCCEEDED', 3n); r.stopMeasurement(4n);
  assert.equal(r.finalize(5n).recordingState, 'INCOMPLETE'); assert.equal(hooks, 0);
});

test('window malformed balance data is refused without getter evaluation', () => {
  const r = make(); r.startMeasurement(0n);
  const input = { expected: equalBalance.expected };
  Object.defineProperty(input, 'observed', { enumerable: true, get() { hooks++; return equalBalance.observed; } });
  assert.throws(() => r.recordLedgerBalanceCheck(input, 1n)); r.stopMeasurement(2n);
  const s = r.finalize(3n); assert.equal(s.ledgerBalanceChecks.samples, 0);
  assert.equal(s.recordingIssue, 'balance_input_rejected'); assert.equal(hooks, 0);
});

test('window wrong arity cannot create implicit boundaries or overwrite a cached result', () => {
  const r = make(); assert.throws(() => r.startWarmup(0n, 1n)); assert.throws(() => r.finalize());
  const s = r.finalize(1n); assert.equal(s.recordingState, 'INCOMPLETE');
  assert.throws(() => r.inspect('private')); assert.throws(() => r.finalize(1n, 2n));
  assert.equal(r.finalize(1n), s);
});

test('window warmup UNKNOWN cannot be discarded by starting a fresh measurement', () => {
  const r = make(); r.startWarmup(0n); r.begin('FUNDING', 1n).finish('UNKNOWN', 2n);
  assert.throws(() => r.startMeasurement(3n)); const s = r.finalize(4n);
  assert.equal(s.stopReason, 'outcome_unknown'); assert.equal(s.measurementNanoseconds, null);
  assert.equal(s.cohorts.WARMUP.phases.FUNDING.unknown, 1); assert.equal(s.authority, 'NONE');
});

test('window refused start with invalid time stays in the refusal denominator', () => {
  const r = make(); r.startMeasurement(10n);
  assert.throws(() => r.begin('FUNDED_CALL', 9n));
  r.stopMeasurement(20n); const s = r.finalize(30n);
  assert.equal(s.refusedStarts, 1); assert.equal(s.recordingIssue, 'clock_rejected');
  assert.equal(lane(s).enteredAcrossCohorts, 0);
});
