// Selected DATA-only recorder controls. No demo/benchmark runner, SDK, SQLite,
// native transport, clock read, key, signature, nonce, process child or file write.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceCreditCapacityRecorder as create } from '../src/service-credit-capacity-recorder.js';

const OPTIONS = Object.freeze({ concurrency: false, timeout: 3000 });
const PHASES = ['FUNDING', 'FUNDED_CALL', 'LEDGER_TRANSACTION'];
const make = (samples = 8, concurrent = Math.min(samples, 2)) =>
  create({ maxSamplesPerPhase: samples, maxInFlightPerPhase: concurrent });
const plain = value => JSON.parse(JSON.stringify(value));
const fixed = kind => error => {
  const code = 'service_credit_capacity_recorder_' + kind;
  assert.equal(error.code, code); assert.equal(error.message, code);
  assert.equal(error.stack, 'TypeError: ' + code);
  assert.equal(Object.hasOwn(error, 'cause'), false);
  assert.equal(Object.isFrozen(error), true);
  return true;
};
const units = (available = 8n, held = 2n, consumed = 0n) =>
  ({ availableUnits: available, heldUnits: held, consumedUnits: consumed });

test('capacity recorder rejects nonexact configuration and bounded-limit violations', OPTIONS, () => {
  for (const value of [null, [], {}, { maxSamplesPerPhase: 1 }, Object.create(null),
    { maxSamplesPerPhase: 0, maxInFlightPerPhase: 1 },
    { maxSamplesPerPhase: 4097, maxInFlightPerPhase: 1 },
    { maxSamplesPerPhase: 1, maxInFlightPerPhase: 2 },
    { maxSamplesPerPhase: 100, maxInFlightPerPhase: 65 },
    { maxSamplesPerPhase: 1.5, maxInFlightPerPhase: 1 },
    { maxSamplesPerPhase: 1, maxInFlightPerPhase: -0 },
    { maxSamplesPerPhase: 1, maxInFlightPerPhase: 1, extra: true }])
    assert.throws(() => create(value), fixed('configuration_rejected'));
  assert.throws(() => create(), fixed('configuration_rejected'));
  assert.throws(() => create({ maxSamplesPerPhase: 1, maxInFlightPerPhase: 1 }, 1),
    fixed('configuration_rejected'));
});

test('capacity recorder snapshots config without invoking getter or proxy hooks', OPTIONS, () => {
  let hooks = 0;
  const accessor = { get maxSamplesPerPhase() { hooks++; return 1; }, maxInFlightPerPhase: 1 };
  const proxy = new Proxy({ maxSamplesPerPhase: 1, maxInFlightPerPhase: 1 }, {
    get() { hooks++; }, getPrototypeOf() { hooks++; }, ownKeys() { hooks++; },
    getOwnPropertyDescriptor() { hooks++; },
  });
  for (const value of [accessor, proxy]) assert.throws(() => create(value), fixed('configuration_rejected'));
  const configuration = { maxSamplesPerPhase: 1, maxInFlightPerPhase: 1 };
  const recorder = create(configuration);
  configuration.maxSamplesPerPhase = 999;
  assert.equal(recorder.finalize().limits.maxSamplesPerPhase, 1);
  assert.equal(hooks, 0);
});

test('capacity recorder keeps funding funded-call and ledger observations separate', OPTIONS, () => {
  const recorder = make();
  const funding = recorder.begin('FUNDING', 0n);
  funding.finish('SUCCEEDED', 1000n);
  const call = recorder.begin('FUNDED_CALL', 2000n);
  const ledger = recorder.begin('LEDGER_TRANSACTION', 2010n);
  ledger.finish('SUCCEEDED', 2020n);
  call.finish('SUCCEEDED', 2100n);
  const report = recorder.finalize();
  for (const name of PHASES) assert.equal(report.phases[name].entered, 1);
  assert.equal(report.phases.FUNDING.terminalLatencyNanoseconds.p50, '1000');
  assert.equal(report.phases.FUNDED_CALL.terminalLatencyNanoseconds.p50, '100');
  assert.equal(report.phases.LEDGER_TRANSACTION.terminalLatencyNanoseconds.p50, '10');
  assert.equal(report.observedSpanNanoseconds, '2100');
  assert.equal(report.capacityQualification, 'NOT_ESTABLISHED');
  assert.equal(report.ledgerCorrectness, 'NOT_ESTABLISHED');
  assert.equal(report.authenticatedExecution, false);
});

test('capacity recorder computes exact nearest-rank p50 p95 p99 without timing conversion', OPTIONS, () => {
  const recorder = make(100, 1);
  let cursor = 0n;
  for (let i = 1; i <= 100; i++) {
    const observation = recorder.begin('FUNDED_CALL', cursor);
    cursor += BigInt(i) * 1000n;
    observation.finish('SUCCEEDED', cursor); cursor += 1n;
  }
  assert.deepEqual(plain(recorder.finalize().phases.FUNDED_CALL.terminalLatencyNanoseconds),
    { samples: 100, min: '1000', p50: '50000', p95: '95000', p99: '99000', max: '100000' });
});

test('capacity recorder preserves zero nanoseconds odd ranks and integers above Number precision', OPTIONS, () => {
  const recorder = make(3, 1), huge = 9007199254740993n;
  recorder.begin('FUNDING', 0n).finish('SUCCEEDED', 0n);
  recorder.begin('FUNDING', 1n).finish('SUCCEEDED', 2n);
  recorder.begin('FUNDING', 3n).finish('SUCCEEDED', 3n + huge);
  const stats = recorder.finalize().phases.FUNDING.terminalLatencyNanoseconds;
  assert.equal(stats.min, '0'); assert.equal(stats.p50, '1');
  assert.equal(stats.p95, String(huge)); assert.equal(stats.p99, String(huge));
});

test('capacity recorder includes refused outcomes in terminal counts and not success latency', OPTIONS, () => {
  const recorder = make();
  recorder.begin('FUNDED_CALL', 0n).finish('REJECTED', 1000n);
  recorder.begin('FUNDED_CALL', 1001n).finish('SUCCEEDED', 1011n);
  const lane = recorder.finalize().phases.FUNDED_CALL;
  assert.equal(lane.terminalLatencyNanoseconds.samples, 2);
  assert.equal(lane.terminalLatencyNanoseconds.max, '1000');
  assert.equal(lane.successfulLatencyNanoseconds.samples, 1);
  assert.equal(lane.successfulLatencyNanoseconds.max, '10');
  assert.deepEqual(plain(lane.nonSuccessFraction), { numerator: 1, denominator: 2 });
  assert.equal(lane.rejected, 1);
});

test('capacity recorder latches UNKNOWN while allowing already entered observations to finish', OPTIONS, () => {
  const recorder = make();
  const first = recorder.begin('FUNDED_CALL', 0n), second = recorder.begin('FUNDED_CALL', 1n);
  first.finish('UNKNOWN', 2n); second.finish('SUCCEEDED', 3n);
  assert.equal(recorder.inspect().stopReason, 'outcome_unknown');
  const report = recorder.finalize();
  assert.equal(report.phases.FUNDED_CALL.unknown, 1);
  assert.equal(report.phases.FUNDED_CALL.succeeded, 1);
  // COMPLETE is recorder coverage, not operational success.
  assert.equal(report.recordingState, 'COMPLETE');
  assert.equal(report.capacityQualification, 'NOT_ESTABLISHED');
});

test('capacity recorder refuses new starts after UNKNOWN and cannot hide attempted observations', OPTIONS, () => {
  const recorder = make();
  recorder.begin('FUNDING', 0n).finish('UNKNOWN', 1n);
  assert.throws(() => recorder.begin('FUNDING', 2n), fixed('recording_stopped'));
  const report = recorder.finalize();
  assert.equal(report.refusedStarts, 1); assert.equal(report.recordingState, 'INCOMPLETE');
  assert.equal(report.phases.FUNDING.unknown, 1);
  assert.equal(report.phases.FUNDING.succeeded, 0);
});

test('capacity recorder never evicts a slow result when its sample budget is full', OPTIONS, () => {
  const recorder = make(1, 1);
  recorder.begin('FUNDED_CALL', 0n).finish('REJECTED', 999n);
  assert.throws(() => recorder.begin('FUNDED_CALL', 1000n), fixed('sample_limit'));
  const report = recorder.finalize();
  assert.equal(report.phases.FUNDED_CALL.entered, 1);
  assert.equal(report.phases.FUNDED_CALL.terminalLatencyNanoseconds.max, '999');
  assert.equal(report.phases.FUNDED_CALL.rejected, 1);
  assert.equal(report.recordingState, 'INCOMPLETE');
});

test('capacity recorder caps in-flight observations without losing the original pending handle', OPTIONS, () => {
  const recorder = make(3, 1), first = recorder.begin('FUNDED_CALL', 0n);
  assert.throws(() => recorder.begin('FUNDED_CALL', 1n), fixed('in_flight_limit'));
  first.finish('SUCCEEDED', 2n);
  const report = recorder.finalize();
  assert.equal(report.phases.FUNDED_CALL.entered, 1);
  assert.equal(report.phases.FUNDED_CALL.peakInFlight, 1);
  assert.equal(report.phases.FUNDED_CALL.pending, 0);
  assert.equal(report.recordingState, 'INCOMPLETE');
});

test('capacity recorder counts per-lane concurrency without inferring ledger concurrency from calls', OPTIONS, () => {
  const recorder = make(2, 2);
  const a = recorder.begin('FUNDED_CALL', 0n), b = recorder.begin('FUNDED_CALL', 1n);
  recorder.begin('LEDGER_TRANSACTION', 2n).finish('SUCCEEDED', 3n);
  recorder.begin('LEDGER_TRANSACTION', 4n).finish('SUCCEEDED', 5n);
  a.finish('SUCCEEDED', 6n); b.finish('SUCCEEDED', 7n);
  const report = recorder.finalize();
  assert.equal(report.phases.FUNDED_CALL.peakInFlight, 2);
  assert.equal(report.phases.LEDGER_TRANSACTION.peakInFlight, 1);
  assert.equal(report.phases.FUNDING.peakInFlight, 0);
});

test('capacity recorder keeps independent in-flight budgets for all three lanes', OPTIONS, () => {
  const recorder = make(2, 2), handles = [];
  for (const name of PHASES) {
    handles.push(recorder.begin(name, 0n)); handles.push(recorder.begin(name, 0n));
  }
  handles.forEach((handle, i) => handle.finish('SUCCEEDED', BigInt(i + 1)));
  const report = recorder.finalize();
  for (const name of PHASES) {
    assert.equal(report.phases[name].peakInFlight, 2);
    assert.equal(report.phases[name].settled, 2);
  }
});

test('capacity recorder rejects duplicate finish without double counting or changing UNKNOWN', OPTIONS, () => {
  const recorder = make(), first = recorder.begin('FUNDED_CALL', 0n);
  first.finish('UNKNOWN', 1n);
  assert.throws(() => first.finish('SUCCEEDED', 2n), fixed('duplicate_finish'));
  const report = recorder.finalize();
  assert.equal(report.phases.FUNDED_CALL.settled, 1);
  assert.equal(report.phases.FUNDED_CALL.unknown, 1);
  assert.equal(report.phases.FUNDED_CALL.succeeded, 0);
  assert.equal(report.recordingState, 'INCOMPLETE');
});

test('capacity recorder refuses clock regression and retains incomplete status after a later finish', OPTIONS, () => {
  const recorder = make(), first = recorder.begin('FUNDED_CALL', 10n);
  assert.throws(() => first.finish('SUCCEEDED', 9n), fixed('clock_rejected'));
  assert.equal(recorder.inspect().pendingObservations, 1);
  first.finish('SUCCEEDED', 11n);
  const report = recorder.finalize();
  assert.equal(report.phases.FUNDED_CALL.settled, 1);
  assert.equal(report.recordingIssue, 'clock_rejected');
  assert.equal(report.recordingState, 'INCOMPLETE');
});

test('capacity recorder rejects nonprimitive out-of-range time and unknown phase without coercion', OPTIONS, () => {
  let hooks = 0;
  const value = { valueOf() { hooks++; return 1n; }, toString() { hooks++; return 'private'; } };
  for (const at of [value, -1n, 1, NaN, Infinity, 1n << 128n])
    assert.throws(() => make().begin('FUNDING', at), fixed('clock_rejected'));
  for (const phase of ['__proto__', 'constructor', 'L1_TPS', value, Symbol('private')])
    assert.throws(() => make().begin(phase, 0n), fixed('input_rejected'));
  assert.equal(hooks, 0);
});

test('capacity recorder validates outcome before committing a finish and never reads exception objects', OPTIONS, () => {
  let hooks = 0;
  const value = new Proxy({}, { get() { hooks++; throw new Error('private diagnostic'); } });
  const recorder = make(), first = recorder.begin('FUNDED_CALL', 0n);
  assert.throws(() => first.finish(value, 1n), fixed('input_rejected'));
  first.finish('REJECTED', 2n);
  const report = recorder.finalize();
  assert.equal(report.phases.FUNDED_CALL.settled, 1);
  assert.equal(report.phases.FUNDED_CALL.rejected, 1);
  assert.equal(report.recordingState, 'INCOMPLETE'); assert.equal(hooks, 0);
});

test('capacity recorder checks exact declared balances rather than conservation alone', OPTIONS, () => {
  const recorder = make();
  assert.equal(recorder.recordLedgerBalanceCheck({ observed: units(), expected: units() }), true);
  assert.equal(recorder.recordLedgerBalanceCheck({ observed: units(7n, 3n), expected: units() }), false);
  const report = recorder.finalize();
  assert.equal(report.ledgerBalanceChecks.samples, 2);
  assert.equal(report.ledgerBalanceChecks.mismatches, 1);
  assert.equal(report.ledgerBalanceChecks.result, 'MISMATCH');
  assert.equal(report.stopReason, 'balance_mismatch');
  assert.equal(report.ledgerCorrectness, 'NOT_ESTABLISHED');
});

test('capacity recorder rejects unsafe balance shapes types and overflow without getter hooks', OPTIONS, () => {
  let hooks = 0;
  const accessor = { get availableUnits() { hooks++; return 8n; }, heldUnits: 2n, consumedUnits: 0n };
  for (const observed of [accessor, units(-1n), units(1), units(1n << 128n),
    units((1n << 128n) - 1n, 1n), { ...units(), secret: 'private' }, Object.create(null)])
    assert.throws(() => make().recordLedgerBalanceCheck({ observed, expected: units() }),
      fixed('balance_input_rejected'));
  assert.equal(hooks, 0);
});

test('capacity recorder bounds balance comparisons without retaining raw balances', OPTIONS, () => {
  const recorder = make(1, 1);
  assert.equal(recorder.recordLedgerBalanceCheck({ observed: units(), expected: units() }), true);
  assert.throws(() => recorder.recordLedgerBalanceCheck({ observed: units(), expected: units() }),
    fixed('balance_sample_limit'));
  const report = recorder.finalize();
  assert.equal(report.ledgerBalanceChecks.samples, 1);
  assert.equal(report.ledgerBalanceChecks.result, 'MATCHES_CALLER_DECLARED_EXPECTATIONS');
  assert.equal(report.recordingState, 'INCOMPLETE');
  assert.doesNotMatch(JSON.stringify(report), /availableUnits|consumedUnits|heldUnits/);
});

test('capacity recorder marks unresolved observations incomplete and never promotes a finalized result', OPTIONS, () => {
  const recorder = make(), first = recorder.begin('FUNDED_CALL', 0n);
  const report = recorder.finalize();
  assert.equal(report.pendingObservations, 1);
  assert.equal(report.recordingState, 'INCOMPLETE');
  assert.equal(report.phases.FUNDED_CALL.terminalLatencyNanoseconds.samples, 0);
  assert.throws(() => first.finish('SUCCEEDED', 1n), fixed('finalized'));
  assert.strictEqual(recorder.finalize(), report);
  assert.equal(report.phases.FUNDED_CALL.succeeded, 0);
});

test('capacity recorder returns frozen cached JSON-safe summaries and no empty success claim', OPTIONS, () => {
  const recorder = make(), report = recorder.finalize();
  assert.equal(report.recordingState, 'EMPTY');
  assert.equal(report.observedSpanNanoseconds, null);
  assert.equal(report.ledgerBalanceChecks.result, 'NOT_RECORDED');
  assert.deepEqual(plain(report.phases.FUNDING.terminalLatencyNanoseconds),
    { samples: 0, min: null, p50: null, p95: null, p99: null, max: null });
  assert.strictEqual(recorder.finalize(), report);
  assert.equal(report.phases.FUNDING.nonSuccessFraction, null);
  for (const value of [recorder, report, report.limits, report.phases, report.phases.FUNDING,
    report.phases.FUNDING.terminalLatencyNanoseconds, report.ledgerBalanceChecks])
    assert.equal(Object.isFrozen(value), true);
  assert.throws(() => { report.phases.FUNDING.entered = 999; }, TypeError);
  assert.throws(() => recorder.begin('FUNDING', 0n), fixed('finalized'));
  assert.equal(report.liveOrProduction, false);
  assert.equal(report.authority, 'NONE');
});

test('capacity recorder bounds full-budget duration storage and releases it only after scalar finalization', OPTIONS, () => {
  const recorder = make(4096, 1);
  let cursor = 0n;
  for (const name of PHASES) {
    for (let i = 0; i < 4096; i++) {
      const observation = recorder.begin(name, cursor++);
      observation.finish('SUCCEEDED', cursor++);
    }
  }
  assert.equal(recorder.inspect().retainedDurationReferences, 3 * 4096 * 2);
  const report = recorder.finalize();
  for (const name of PHASES) {
    assert.equal(report.phases[name].terminalLatencyNanoseconds.samples, 4096);
    assert.equal(report.phases[name].terminalLatencyNanoseconds.p99, '1');
  }
  assert.equal(recorder.inspect().retainedDurationReferences, 0);
  assert.equal(recorder.inspect().pendingObservations, 0);
  assert.equal(report.recordingState, 'COMPLETE');
});

test('capacity recorder rejects method arity without fabricating successful observations', OPTIONS, () => {
  const recorder = make(), first = recorder.begin('FUNDED_CALL', 0n);
  assert.throws(() => first.finish('SUCCEEDED'), fixed('input_rejected'));
  assert.throws(() => recorder.inspect(1), fixed('input_rejected'));
  first.finish('REJECTED', 1n);
  assert.throws(() => recorder.finalize(1), fixed('input_rejected'));
  const report = recorder.finalize();
  assert.equal(report.phases.FUNDED_CALL.succeeded, 0);
  assert.equal(report.recordingState, 'INCOMPLETE');
  assert.throws(() => recorder.finalize(1), fixed('input_rejected'));
  assert.strictEqual(recorder.finalize(), report);
});
