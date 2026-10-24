// Genuine paced source owner + recorders; synthetic DATA callbacks only.
// No native namespace, managed task, application/SDK, SQL, key, signature,
// nonce, host timer, socket or worker is constructed by this fixture producer.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServiceCreditCapacityWindowWriterTraceData as windowTrace } from '../src/service-credit-capacity-window-writer-trace-data.js';
import { createServiceCreditCapacityPacedWorkloadOwnerCoreWithPrivateTimingTrace as create } from '../src/service-credit-capacity-paced-workload-owner-core.js';
import { captureServiceCreditCapacityPacedTimingEnvelopeData as capture } from '../src/service-credit-capacity-paced-timing-trace-data.js';

if (process.version !== 'v24.19.0' || process.env.X402_PACED_OUTER_FIXTURE_DATA !== 'paced-outer-contract-fixture-v1')
  throw new TypeError('PACED_PYTHON_FIXTURE_DATA_SELECTION_REQUIRED');
const F = Object.freeze, M = 1000000n;
function freeze(value) { if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); F(value); } return value; }
async function ticks() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
const units = F({ availableUnits: 8n, heldUnits: 0n, consumedUnits: 2n }), balances = F({ observed: units, expected: units });
function fixture(options = {}) {
  const h = { time: 100n, timers: [], calls: 0, clocks: 0, owner: null };
  const config = {
    plan: { warmupCallsPerLane: 1, measurementCallsPerLane: 2, setupBudgetMs: 500,
      measurementWindowMs: 100, drainGraceMs: 10, maxLedgerTransactionsPerOperation: 3, ...options.plan },
    recordingLimits: { maxSamplesPerPhase: 128, maxInFlightPerPhase: 4, ...options.limits },
    pacing: { minimumStartGapMs: options.gap ?? 5 },
    runtime: {
      monotonicNowNs: F(function now() { h.clocks++; return options.now ? options.now(h) : ++h.time; }),
      schedule: F(function schedule(callback, milliseconds) {
        const timer = { callback, milliseconds, kind: callback.name === 'pacingTick' ? 'pacing' : 'core',
          due: h.time + BigInt(milliseconds) * M, token: F({ n: h.timers.length + 1 }), cancelled: false, fired: false };
        h.timers.push(timer); return timer.token;
      }),
      cancel: F(function cancel(token) { const timer = h.timers.find(t => t.token === token); assert.ok(timer); timer.cancelled = true; return undefined; }),
    },
    lanes: F(Array.from({ length: options.lanes ?? 2 }, (_, lane) => F({
      fund: F(function fund(command) {
        if (options.ledger) { const observed = command.beginLedgerTransaction(); h.time += 3n; observed.finish('SUCCEEDED'); }
        return Promise.resolve('SUCCEEDED');
      }),
      execute: F(function execute(command) {
        h.calls++;
        if (options.execute) return options.execute(lane, command, h);
        const outcome = options.reject && command.cohort === 'MEASUREMENT' && lane === 0 ? 'REJECTED' : 'SUCCEEDED';
        if (options.ledger) { const observed = command.beginLedgerTransaction(); h.time += 3n; observed.finish(outcome); }
        return Promise.resolve(outcome);
      }),
      checkBalances: F(function checkBalances() { return Promise.resolve(balances); }),
      openMeasurementWindow: F(function openMeasurementWindow() { return Promise.resolve(undefined); }),
      stopMeasurementWindow: F(function stopMeasurementWindow() { return Promise.resolve(undefined); }),
      close: F(function close() { return Promise.resolve(undefined); }),
    }))),
  };
  h.fire = timer => { assert.equal(timer.cancelled, false); assert.equal(timer.fired, false);
    h.time = timer.due; timer.fired = true; timer.callback(); };
  h.config = config; h.owner = create(config);
  return h;
}
function expectations(h) {
  return freeze({ plan: { ...h.config.plan }, recordingLimits: { ...h.config.recordingLimits },
    laneIds: h.config.lanes.map((_, n) => 'lane.' + n), minimumStartGapMs: h.config.pacing.minimumStartGapMs,
    runId: 'a'.repeat(64), parentSourceRowsSha256: 'bc27ddefb319c92e1d17858c30d5c0922913bbec7d7547eb73a954e1c4be9a1b', childSourceRowsSha256: 'd756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027' });
}
function packed(h, report, expected) {
  const clocks = h.clocks, calls = h.calls;
  const jsExpected = F({ plan: expected.plan, recordingLimits: expected.recordingLimits,
    laneCount: expected.laneIds.length, minimumStartGapMs: expected.minimumStartGapMs });
  const capsule = capture(F({ context: F({ runId: expected.runId, sourceRowsSha256: expected.parentSourceRowsSha256,
    childSourceRowsSha256: expected.childSourceRowsSha256, laneIds: expected.laneIds }),
    trace: h.owner.captureTimingEvidence(), report, expected: jsExpected }));
  assert.equal(h.clocks, clocks); assert.equal(h.calls, calls);
  return F({ capsule, report, expected });
}
async function complete(h) {
  const promise = h.owner.run();
  for (let i = 0; i < 100; i++) {
    await ticks();
    if (h.owner.inspect().finalCached) return promise;
    const timers = h.timers.filter(t => t.kind === 'pacing' && !t.cancelled && !t.fired);
    assert.ok(timers.length <= 1);
    if (timers.length) h.fire(timers[0]);
  }
  throw new TypeError('BOUNDED_PACED_SOURCE_FIXTURE_NOT_COMPLETE');
}
const cases = {};
for (const [name, options] of [
  ['full', { ledger: true }], ['mixed', { ledger: true, reject: true }],
  ['sixteenLanes', { lanes: 16, limits: { maxInFlightPerPhase: 16 }, gap: 1,
    plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 3, maxLedgerTransactionsPerOperation: 1 } }],
]) {
  const h = fixture(options), expected = expectations(h), report = await complete(h);
  cases[name] = packed(h, report, expected);
}
{
  const h = fixture({ plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1 } }), expected = expectations(h);
  const promise = h.owner.run(); await ticks(); h.owner.stop(); await ticks();
  cases.withdrawal = packed(h, await promise, expected);
}
{
  const h = fixture({ now(host) {
    if (host.owner && !host.clockStopped && host.owner.inspect().pendingQueuedCalls) { host.clockStopped = true; host.owner.stop(); }
    return ++host.time;
  } }), expected = expectations(h), promise = h.owner.run(); await ticks();
  cases.preWaitWithdrawal = packed(h, await promise, expected);
}
{
  let original; const pending = deferred();
  const h = fixture({ lanes: 1, plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1 },
    execute(lane, command) { original = command; return pending.promise; } }), expected = expectations(h);
  const promise = h.owner.run(); await ticks(); h.owner.stop(); await ticks();
  const ledger = original.beginLedgerTransaction(); h.time += 10n; ledger.finish('SUCCEEDED');
  pending.resolve('SUCCEEDED'); await ticks(); cases.postStopLedger = packed(h, await promise, expected);
}
const cleanNames = Object.keys(cases);
for (const name of cleanNames) {
  assert.equal(cases[name].capsule.status, 'MATCHING_DECLARED_PACED_TRACE');
  assert.equal(cases[name].report.outcome, 'OBSERVED_OWNERS_RETURNED');
}
{
  const pending = deferred(), h = fixture({ lanes: 1, plan: { warmupCallsPerLane: 0, measurementCallsPerLane: 1 },
    execute() { return pending.promise; } }), expected = expectations(h);
  const promise = h.owner.run(); await ticks(); h.owner.stop(); await ticks();
  const drain = h.timers.find(t => t.kind === 'core' && t.milliseconds === h.config.plan.drainGraceMs && !t.cancelled && !t.fired);
  assert.ok(drain); h.fire(drain); await ticks();
  const report = await promise, before = packed(h, report, expected);
  assert.equal(before.capsule.status, 'UNKNOWN_OR_MISMATCHED_PACED_TRACE');
  assert.equal(before.capsule.check, null); assert.equal(before.capsule.parentCheck, null);
  const bytes = JSON.stringify(before); pending.resolve('SUCCEEDED'); await ticks();
  assert.equal(JSON.stringify(packed(h, report, expected)), bytes);
  cases.heldAfterLateCompletion = before;
}
// The following pair/EOF/command records are explicitly SYNTHETIC DATA.
// Only the paced source reports and genuine window/cohort helper output above/
// below are produced by real source components. No native adapter/pair runs.
const sha = value => createHash('sha256').update(value).digest('hex'), empty = sha('');
const stream = () => F({ bytes: 0, sha256: empty, base64: '' });
const facts = () => F({ observedBytes: 0, retainedBytes: 0, overflow: false, eof: true, prefixSha256: empty });
function summary(values) {
  if (!values.length) return F({ samples: 0, min: null, p50: null, p95: null, p99: null, max: null });
  const v = [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0), rank = p => String(v[Math.ceil(v.length * p / 100) - 1]);
  return F({ samples: v.length, min: String(v[0]), p50: rank(50), p95: rank(95), p99: rank(99), max: String(v.at(-1)) });
}
function outer(sample) {
  const expected = sample.expected, plan = expected.plan, dispatched = expected.laneIds.map(() => 0), requests = new Map();
  for (const event of sample.capsule.trace.events) {
    if (event.kind === 'REQUEST') requests.set(event.request, event.lane);
    if (event.kind === 'DISPATCH') dispatched[requests.get(event.request)]++;
  }
  const rows = [], evidence = [];
  for (let laneIndex = 0; laneIndex < expected.laneIds.length; laneIndex++) {
    const laneId = expected.laneIds[laneIndex], measured = dispatched[laneIndex], completed = plan.warmupCallsPerLane + measured;
    const specs = [['CONTROL', null, 100n, 3n]];
    for (let i = 0; i < plan.warmupCallsPerLane; i++) specs.push(['WARMUP', i, 200n + 10n * BigInt(i), 3n]);
    for (let i = 0; i < measured; i++) specs.push(['MEASUREMENT', i, 1100n + 100n * BigInt(i), 5n + BigInt(i)]);
    specs.push(['CONTROL', null, 2200n, 3n]);
    const records = specs.map(([cohort, index, before, elapsed], i) => F({
      ordinal: i + 1, operation: 'synthetic.writer', command: cohort === 'CONTROL' ? 'CONTROL'
        : sha('native-capacity-original-v1\0' + expected.runId + '\0' + laneId + '\0' + cohort + '\0' + index),
      beforeBeginNs: String(before), afterBeginNs: String(before + 1n),
      beforeCommitNs: String(before + elapsed - 1n), afterCommitNs: String(before + elapsed),
      changed: true, timingKind: 'ACTUAL_STORE_WRITER_BRACKET_INCLUDES_JS_AND_IDENTITY_CHECKS',
    }));
    const clockReads = 2 + records.reduce((n, row) => n + ['beforeBeginNs', 'afterBeginNs', 'beforeCommitNs', 'afterCommitNs']
      .filter(k => BigInt(row[k]) < 2000n).length, 0);
    const window = F({ windowVersion: 1, context: F({ runId: expected.runId, laneId, sourceRowsSha256: expected.childSourceRowsSha256 }),
      clockDomain: 'SERVICE_CHILD_LOCAL', phase: 'STOPPED', startNs: '1000', stopNs: '2000', stopCause: 'PARENT_STOP', unknown: false, clockReads });
    const helper = windowTrace(F({ context: window.context,
      plan: F({ warmupCallsPerLane: plan.warmupCallsPerLane, measurementCallsPerLane: plan.measurementCallsPerLane }),
      completion: F({ warmupCompleted: plan.warmupCallsPerLane, measuredCompleted: measured }), window }));
    const page = F({ records: F(records), next: records.length, total: records.length, started: records.length,
      active: false, unknown: false, clockDomain: 'SERVICE_CHILD_LOCAL' });
    const attributed = helper.append(page), traced = helper.finalize();
    assert.equal(traced.status, 'COMPLETE_DECLARED_WINDOW_TRACE_DATA');
    const intervals = records.map(row => F({ ordinal: row.ordinal, commandClass: row.command === 'CONTROL' ? 'CONTROL' : 'APPLICATION_ORIGINAL',
      changed: row.changed, beforeBeginNs: row.beforeBeginNs, afterBeginNs: row.afterBeginNs,
      beforeCommitNs: row.beforeCommitNs, afterCommitNs: row.afterCommitNs,
      bracketElapsedNs: String(BigInt(row.afterCommitNs) - BigInt(row.beforeBeginNs)),
      insideTransactionElapsedNs: String(BigInt(row.beforeCommitNs) - BigInt(row.afterBeginNs)) }));
    rows.push(F({ laneId, pairAcquisitionEntered: true, balanceReadsEntered: 3, pendingBalanceReads: 0,
      balanceObservationRoundTripNs: summary([2n, 3n, 4n]), timingPages: 1, serviceWriterTraceBeforeCloseObserved: true,
      serviceWriterIntervals: records.length, writerBracketNs: summary(intervals.map(v => BigInt(v.bracketElapsedNs))),
      insideWriterTransactionNs: summary(intervals.map(v => BigInt(v.insideTransactionElapsedNs))),
      serviceChildWindowWriterTrace: traced, measurementUnknown: false, closeStatus: 'RETURNED', held: false }));
    const kinds = ['INIT', 'OPEN', 'PREPARE', 'COMMIT', 'SUBMIT', 'BIND', ...Array(completed).fill('EXECUTE'), 'CLOSE', 'RELEASE_IPC'];
    const timings = kinds.map((kind, i) => F({ sequence: i + 1, kind,
      status: kind === 'CLOSE' ? 'OBSERVED_RETURNED_CLOSE' : kind === 'RELEASE_IPC' ? 'RELEASING_IPC' : 'OBSERVED',
      startNs: String(10 * (i + 1)), endNs: String(10 * (i + 1) + 1), lateAfterTimeout: false,
      clockDomain: 'PAYER_CHILD_LOCAL', timingKind: 'CHILD_LOCAL_MONOTONIC_OPERATION_NOT_SQL_LATENCY' }));
    evidence.push(F({ laneId, pairSnapshot: F({ phase: 'CLOSED', held: false, completed,
      warmupReserved: plan.warmupCallsPerLane, measuredReserved: measured, activeOperation: false,
      referenceCandidates: 1, referenceWindows: 1, balancesObserved: true, launchAttempts: 2, launchUnknown: false,
      historicalCloseStatus: 'CLOSED', children: F(['PAYER', 'SERVICE'].map(role => F({ role, exited: true, closed: true,
        disconnected: true, exitCode: 0, signal: null, fault: false, pending: 0, stdout: facts(), stderr: facts() }))),
      nativeQualified: false, capacityQualified: false, authority: 'NONE', freshBalanceReads: 3,
      windowOpenEntered: true, windowStopEntered: true, windowOpenAcknowledged: true, windowStopAcknowledged: true, measurementUnknown: false }),
      serviceWriterIntervals: F(intervals),
      serviceWriterAttribution: F(attributed.intervals.map((v, i) => F({ ...v, originalCommandDigest: records[i].command === 'CONTROL' ? null : records[i].command }))),
      serviceMeasurementWindow: window, payerOperationTimings: F(timings),
      privateStreams: F(['PAYER', 'SERVICE'].map(role => F({ role, stdout: stream(), stderr: stream() }))) }));
  }
  const workload = F({ pacedWorkloadVersion: 1, laneIds: expected.laneIds, plan, recordingLimits: expected.recordingLimits,
    payeeAddress: 'z1qq3zyg3zyg3zyg3zyg3zyg3zyg3zyg3z3yw2mk', commandBudgetMs: 1000, closeBudgetMs: 6000,
    pacing: F({ minimumStartGapMs: expected.minimumStartGapMs }) });
  const result = F({ nativePacedCapacityWorkloadAdapterVersion: 1, status: 'OBSERVED_COMPONENT_ONLY', core: sample.report,
    pacing: F({ minimumStartGapMs: expected.minimumStartGapMs, appliesTo: 'MEASUREMENT_ONLY',
      model: 'CLOSED_LOOP_MINIMUM_GAP_NO_CATCHUP_NOT_FIXED_OFFERED_RATE', coreLatencyIncludesPacingWait: true, sourceLatencyExcludesPacingWait: true }),
    lanes: F(rows), parentClockDomain: 'PARENT_MONOTONIC_IPC_ROUNDTRIP_NOT_CHILD_OR_SQL_LATENCY', payerClockDomain: 'PAYER_CHILD_LOCAL',
    ledgerClockDomain: 'SERVICE_CHILD_LOCAL', childClockDomainsMerged: false, ledgerTimeInferredFromPromise: false,
    writerTraceCovers: 'WHOLE_RUN_BRACKETS_CLASSIFIED_AGAINST_SEPARATE_SERVICE_CHILD_WINDOW', parentAndServiceWindowsAligned: false,
    writerBracketsClipped: false, measurementWindowIsolationQualified: false, sustainedCapacityQualified: false,
    nativeEventsAuthenticated: false, nativeResourcesQualified: false, nativeOsNetworkSandbox: false, productionQualified: false, authority: 'NONE' });
  const frame = F({ pacedCaptureVersion: 2, kind: 'PRIVATE_PACED_NATIVE_CAPACITY_COMPONENT_CAPTURE_NOT_PRODUCTION',
    sourceRowsSha256: expected.parentSourceRowsSha256, childSourceRowsSha256: expected.childSourceRowsSha256,
    result, pacedTimingData: sample.capsule, evidence: F(evidence), nativeResourcesQualified: false,
    sustainableCapacityQualified: false, chainAuthenticated: false, productionQualified: false, authority: 'NONE' });
  return F({ workload, runId: expected.runId, frame });
}
const outerCases = F(Object.fromEntries(['full', 'withdrawal', 'preWaitWithdrawal'].map(name => [name, outer(cases[name])])));
process.stdout.write(JSON.stringify(F({ fixtureVersion: 1, kind: 'SYNTHETIC_OUTER_V2_CONTRACT_DATA_NOT_NATIVE_CAPTURE',
  cases: outerCases, sourceOwnerAndWriterHelpersGenuine: true, pairChildAndReceiptFactsSynthetic: true,
  nativeAdapterExecuted: false, SDK: false, SQLite: false, keys: false, signatures: false, nonceSearch: false,
  sockets: false, hostTimers: false, nativeChildren: false, authority: 'NONE' })) + '\n');
