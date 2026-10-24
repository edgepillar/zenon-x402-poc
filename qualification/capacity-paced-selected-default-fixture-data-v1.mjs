// Genuine paced source owner + recorders; synthetic DATA callbacks only.
// No native namespace, managed task, application/SDK, SQL, key, signature,
// nonce, host timer, socket or worker is constructed by this fixture producer.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServiceCreditCapacityWindowWriterTraceData as windowTrace } from '../src/service-credit-capacity-window-writer-trace-data.js';
import { createServiceCreditCapacityPacedWorkloadOwnerCoreWithPrivateTimingTrace as create } from '../src/service-credit-capacity-paced-workload-owner-core.js';
import { captureServiceCreditCapacityPacedTimingEnvelopeData as capture } from '../src/service-credit-capacity-paced-timing-trace-data.js';
import { createServiceCreditCapacityBalanceBarrierTrace as createBalance, validateServiceCreditCapacityBalanceBarrierTraceData as checkBalance } from '../src/service-credit-capacity-balance-barrier-trace-data.js';

if (process.version !== 'v24.19.0' || process.env.X402_PACED_SELECTED_DEFAULT_DATA !== 'paced-parent-v2-selected-default-fixture-data-v1')
  throw new TypeError('EXPLICIT_SELECTED_DEFAULT_SOURCE_DATA_REQUIRED');
const F = Object.freeze, M = 1000000n;
const PLAN_SHA = 'cbbf3b62215473ea614867461eb27ceefc3c5478f6a70eeac781982ad5689a2f';
const planRaw = process.env.X402_SELECTED_DEFAULT_PLAN_JSON;
assert.equal(typeof planRaw, 'string'); assert.equal(planRaw.length, 434);
assert.ok([...planRaw].every(character => character.codePointAt(0) <= 127));
assert.equal(createHash('sha256').update(planRaw, 'ascii').digest('hex'), PLAN_SHA);
const SELECTED = freeze(JSON.parse(planRaw)), RUN_ID = '2'.repeat(64);
assert.deepEqual(SELECTED.laneIds, ['lane.one', 'lane.two']);
assert.equal(SELECTED.plan.warmupCallsPerLane, 1); assert.equal(SELECTED.plan.measurementCallsPerLane, 4);
function freeze(value) { if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); F(value); } return value; }
async function ticks() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
const units = F({ availableUnits: 8n, heldUnits: 0n, consumedUnits: 2n }), balances = F({ observed: units, expected: units });
function fixture() {
  const laneIds = SELECTED.laneIds;
  const balanceContext = freeze({ runId: RUN_ID, sourceRowsSha256: "38bb4557357dd42bcd7dedacb4b7ec2fc750d474e7f9c14045376b73b0739160", laneIds });
  const h = { time: 100n, timers: [], calls: 0, clocks: 0, owner: null,
    balanceContext, balanceTrace: createBalance(balanceContext), balanceStages: laneIds.map(() => 0), balanceDurations: laneIds.map(() => []) };
  const config = {
    plan: SELECTED.plan,
    recordingLimits: SELECTED.recordingLimits,
    pacing: SELECTED.pacing,
    runtime: {
      monotonicNowNs: F(function now() { h.clocks++; return ++h.time; }),
      schedule: F(function schedule(callback, milliseconds) {
        const timer = { callback, milliseconds, kind: callback.name === 'pacingTick' ? 'pacing' : 'core',
          due: h.time + BigInt(milliseconds) * M, token: F({ n: h.timers.length + 1 }), cancelled: false, fired: false };
        h.timers.push(timer); return timer.token;
      }),
      cancel: F(function cancel(token) { const timer = h.timers.find(t => t.token === token); assert.ok(timer); timer.cancelled = true; return undefined; }),
    },
    lanes: F(laneIds.map((laneId, lane) => F({
      fund: F(function fund(command) {
        const observed = command.beginLedgerTransaction(); h.time += 3n; observed.finish('SUCCEEDED');
        return Promise.resolve('SUCCEEDED');
      }),
      execute: F(function execute(command) {
        h.calls++;
        const observed = command.beginLedgerTransaction(); h.time += 3n; observed.finish('SUCCEEDED');
        return Promise.resolve('SUCCEEDED');
      }),
      checkBalances: F(function checkBalances() {
        // The real recorder observes this synthetic callback bracket. These
        // are caller-declared DATA clock values, never host/native timing.
        const stage = h.balanceStages[lane]++, start = ++h.time;
        const done = h.balanceTrace.begin(laneIds[lane], ["AFTER_FUNDING", "AFTER_WARMUP", "AFTER_DRAIN"][stage], start);
        return Promise.resolve().then(() => {
          h.time += BigInt(stage + lane + 2); const end = h.time;
          done("SUCCEEDED", end); h.balanceDurations[lane].push(end - start);
          return balances;
        });
      }),
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
    laneIds: SELECTED.laneIds, minimumStartGapMs: h.config.pacing.minimumStartGapMs,
    runId: RUN_ID, parentSourceRowsSha256: '38bb4557357dd42bcd7dedacb4b7ec2fc750d474e7f9c14045376b73b0739160', childSourceRowsSha256: 'd756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027' });
}
function packed(h, report, expected) {
  const clocks = h.clocks, calls = h.calls;
  const jsExpected = F({ plan: expected.plan, recordingLimits: expected.recordingLimits,
    laneCount: expected.laneIds.length, minimumStartGapMs: expected.minimumStartGapMs });
  const capsule = capture(F({ context: F({ runId: expected.runId, sourceRowsSha256: expected.parentSourceRowsSha256,
    childSourceRowsSha256: expected.childSourceRowsSha256, laneIds: expected.laneIds }),
    trace: h.owner.captureTimingEvidence(), report, expected: jsExpected }));
  assert.equal(h.clocks, clocks); assert.equal(h.calls, calls);
  const recording = h.balanceTrace.finalize(), trace = h.balanceTrace.captureEvidence();
  let checked = null;
  if (recording.status === "COMPLETE_DECLARED_BALANCE_BARRIER_DATA")
    checked = checkBalance(F({ evidence: trace, report: recording, expected: h.balanceContext }));
  assert.equal(h.clocks, clocks); assert.equal(h.calls, calls);
  return F({ capsule, report, expected, balanceBarrierRecording: recording,
    balanceBarrierData: F({ balanceBarrierCaptureVersion: 1, trace, check: checked }),
    balanceLaneMetrics: F(h.balanceDurations.map(summary)) });
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
      balanceObservationBarrierNs: sample.balanceLaneMetrics[laneIndex], timingPages: 1, serviceWriterTraceBeforeCloseObserved: true,
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
  const workload = SELECTED;
  const result = F({ nativePacedCapacityWorkloadAdapterVersion: 2, balanceBarrierRecording: sample.balanceBarrierRecording, status: 'OBSERVED_COMPONENT_ONLY', core: sample.report,
    pacing: F({ minimumStartGapMs: expected.minimumStartGapMs, appliesTo: 'MEASUREMENT_ONLY',
      model: 'CLOSED_LOOP_MINIMUM_GAP_NO_CATCHUP_NOT_FIXED_OFFERED_RATE', coreLatencyIncludesPacingWait: true, sourceLatencyExcludesPacingWait: true }),
    lanes: F(rows), parentClockDomain: 'PARENT_BALANCE_BARRIER_INCLUDING_FINAL_WRITER_TRACE_NOT_SQL_OR_L1', payerClockDomain: 'PAYER_CHILD_LOCAL',
    ledgerClockDomain: 'SERVICE_CHILD_LOCAL', childClockDomainsMerged: false, ledgerTimeInferredFromPromise: false,
    writerTraceCovers: 'WHOLE_RUN_BRACKETS_CLASSIFIED_AGAINST_SEPARATE_SERVICE_CHILD_WINDOW', parentAndServiceWindowsAligned: false,
    writerBracketsClipped: false, measurementWindowIsolationQualified: false, sustainedCapacityQualified: false,
    nativeEventsAuthenticated: false, nativeResourcesQualified: false, nativeOsNetworkSandbox: false, productionQualified: false, authority: 'NONE' });
  const frame = F({ pacedCaptureVersion: 3, kind: 'PRIVATE_PACED_NATIVE_CAPACITY_COMPONENT_CAPTURE_NOT_PRODUCTION',
    sourceRowsSha256: expected.parentSourceRowsSha256, childSourceRowsSha256: expected.childSourceRowsSha256,
    result, pacedTimingData: sample.capsule, balanceBarrierData: sample.balanceBarrierData, evidence: F(evidence), nativeResourcesQualified: false,
    sustainableCapacityQualified: false, chainAuthenticated: false, productionQualified: false, authority: 'NONE' });
  return F({ workload, runId: expected.runId, frame });
}
const h = fixture(), expected = expectations(h), report = await complete(h);
const clocks = h.clocks, calls = h.calls, sample = packed(h, report, expected), selected = outer(sample);
assert.equal(sample.capsule.status, 'MATCHING_DECLARED_PACED_TRACE');
assert.equal(report.outcome, 'OBSERVED_OWNERS_RETURNED');
assert.equal(calls, 10); // Two warmup originals plus eight measured originals.
assert.equal(selected.workload, SELECTED);
assert.deepEqual(selected.frame.result.lanes.map(row => row.laneId), SELECTED.laneIds);
assert.deepEqual(selected.frame.evidence.map(row => row.pairSnapshot.completed), [5, 5]);
assert.equal(sample.balanceBarrierData.check.rawSeriesRecomputed, true);
assert.equal(h.clocks, clocks); assert.equal(h.calls, calls);
process.stdout.write(JSON.stringify(F({ fixtureVersion: 1,
  kind: 'SYNTHETIC_EXACT_SELECTED_DEFAULT_OUTER_V3_SOURCE_DATA_NOT_NATIVE_CAPTURE',
  workloadPlanSha256: PLAN_SHA, selected,
  sourceOwnerWriterAndBalanceHelpersGenuine: true, fullSelectedDefaultPlanPreserved: true,
  pairChildAndReceiptFactsSynthetic: true, nativeAdapterExecuted: false,
  SDK: false, SQLite: false, keys: false, signatures: false, nonceSearch: false,
  sockets: false, hostTimers: false, nativeChildren: false, authority: 'NONE' })) + '\n');
