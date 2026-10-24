import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServiceCreditCapacityCohortWriterTraceData as create } from '../src/service-credit-capacity-cohort-writer-trace-data.js';

const F = Object.freeze, RUN = '1'.repeat(64), LANE = 'lane.one';
const VECTORS = F({
  W0: '446350fe79ca7a61da324335e2e6087ec89f148e9c72846b3405aa0523a40d74',
  M0: '4733b3787d4c374dc760f91def308946993b212b4283cbfb5e8ecd4257400fe4',
  M1: 'fbda0ed2392e7704e86c4144bd51f1290a909a0a1fd24a264afca999da3acf8b',
  OTHER_LANE_M0: '8278f7c8f523c1109015e1f39882f0d692b9a068111cf63976f8cff8ab1b6cf0',
});
function options({ warmup = 1, measured = 2, warmupCompleted = warmup, measuredCompleted = measured,
  runId = RUN, laneId = LANE } = {}) {
  return F({ context: F({ runId, laneId }),
    plan: F({ warmupCallsPerLane: warmup, measurementCallsPerLane: measured }),
    completion: F({ warmupCompleted, measuredCompleted }) });
}
// Independent public DATA vectors above were computed with Python hashlib;
// the concatenating reference below differs from the production update chain.
function original(cohort, ordinal, run = RUN, lane = LANE) {
  return createHash('sha256').update(['native-capacity-original-v1', run, lane, cohort, String(ordinal)].join('\0')).digest('hex');
}
function row(command, ordinal, bracket = 3n) {
  const start = BigInt(ordinal - 1) * 1000n + 100n;
  return F({ ordinal, operation: 'service.private-operation', command, beforeBeginNs: String(start),
    afterBeginNs: String(start + 1n), beforeCommitNs: String(start + 2n), afterCommitNs: String(start + bracket),
    changed: true, timingKind: 'ACTUAL_STORE_WRITER_BRACKET_INCLUDES_JS_AND_IDENTITY_CHECKS' });
}
function page(records, total = records.length, from = 0, extra = {}) {
  return F({ records: F(records), next: from + records.length, total, started: total,
    active: false, unknown: false, clockDomain: 'SERVICE_CHILD_LOCAL', ...extra });
}
function allPages(owner, records) {
  if (records.length === 0) return [owner.append(page([]))];
  const out = [];
  for (let from = 0; from < records.length; from += 64) out.push(owner.append(page(records.slice(from, from + 64), records.length, from)));
  return out;
}
function records() {
  return [row('CONTROL', 1, 40n), row(VECTORS.W0, 2, 2n), row(VECTORS.W0, 3, 4n),
    row(VECTORS.M0, 4, 10n), row(VECTORS.M0, 5, 20n), row(VECTORS.M1, 6, 30n), row('CONTROL', 7, 50n)];
}
function deepFrozen(value) {
  if (value !== null && typeof value === 'object') {
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) deepFrozen(child);
  }
}

test('real source binding accepts independent literal run lane cohort ordinal vectors', () => {
  assert.equal(original('WARMUP', 0), VECTORS.W0); assert.equal(original('MEASUREMENT', 0), VECTORS.M0);
  assert.equal(original('MEASUREMENT', 1), VECTORS.M1); assert.equal(original('MEASUREMENT', 0, RUN, 'lane.two'), VECTORS.OTHER_LANE_M0);
  const owner = create(options()); allPages(owner, records());
  assert.equal(owner.finalize().matchedCompletedOriginals, 3);
});

test('genuine raw page capture yields separate control warmup and measurement distributions', () => {
  const owner = create(options()), p = owner.append(page(records())), result = owner.finalize();
  assert.equal(p.snapshotComplete, true); assert.equal(result.status, 'COMPLETE_DECLARED_TRACE_DATA');
  assert.equal(result.cohorts.CONTROL.writerIntervals, 2);
  assert.equal(result.cohorts.WARMUP.writerIntervals, 2); assert.equal(result.cohorts.WARMUP.originalsObserved, 1);
  assert.deepEqual(result.cohorts.WARMUP.writerBracketNs, { samples: 2, min: '2', p50: '2', p95: '4', p99: '4', max: '4' });
  assert.equal(result.cohorts.MEASUREMENT.originalsObserved, 2);
  assert.deepEqual(result.cohorts.MEASUREMENT.writerBracketNs, { samples: 3, min: '10', p50: '20', p95: '30', p99: '30', max: '30' });
  assert.equal(result.cohorts.MEASUREMENT.insideWriterTransactionNs.p50, '1');
  assert.equal(result.missingCompletedOriginals, 0);
});

test('returned DATA redacts raw identities operations and caller context while retaining call ordinal', () => {
  const owner = create(options()), p = owner.append(page(records())), result = owner.finalize();
  const text = JSON.stringify({ p, result, inspect: owner.inspect() });
  for (const secret of [RUN, LANE, VECTORS.W0, VECTORS.M0, VECTORS.M1, 'service.private-operation']) assert.equal(text.includes(secret), false);
  assert.equal(p.intervals[1].cohort, 'WARMUP'); assert.equal(p.intervals[1].originalOrdinal, 0);
  assert.equal(p.intervals[0].cohort, 'CONTROL'); assert.equal(p.intervals[0].originalOrdinal, null);
  assert.equal(p.intervals[1].command, undefined); assert.equal(p.intervals[1].operation, undefined);
  assert.equal(p.rawIdentifiersIncluded, false); assert.equal(result.rawIdentifiersIncluded, false);
});

test('all owner methods pages summaries and distributions are frozen DATA capabilities', () => {
  const owner = create(options()); assert.equal(Object.isFrozen(owner), true);
  for (const fn of Object.values(owner)) assert.equal(Object.isFrozen(fn), true);
  deepFrozen(owner.append(page(records()))); deepFrozen(owner.inspect()); deepFrozen(owner.finalize());
});

test('cohort matching cannot upgrade caller DATA to SQL latency time-window or native proof', () => {
  const owner = create(options()); owner.append(page(records())); const r = owner.finalize();
  for (const name of ['nativeEventsAuthenticated', 'nativeResourcesQualified', 'pureSqlLatencyQualified',
    'measurementWindowIsolationQualified', 'sustainableCapacityQualified', 'liveOrProduction']) assert.equal(r[name], false);
  assert.equal(r.attribution, 'CALL_COHORT_NOT_MEASUREMENT_TIME_WINDOW'); assert.equal(r.authority, 'NONE');
  assert.equal(r.clockDomain, 'SERVICE_CHILD_LOCAL');
});

test('finalization releases command lookup and duration references without retaining raw page timelines', () => {
  const owner = create(options()); assert.equal(owner.inspect().retainedCommandReferences, 3);
  owner.append(page(records())); assert.equal(owner.inspect().retainedDurationReferences, 14);
  owner.finalize(); assert.equal(owner.inspect().retainedCommandReferences, 0); assert.equal(owner.inspect().retainedDurationReferences, 0);
});

test('finalization is one-shot and preserves the same historical DATA despite rejected late input', () => {
  const owner = create(options()); owner.append(page(records())); const r = owner.finalize();
  assert.equal(owner.finalize(), r); assert.throws(() => owner.append(page(records())));
  assert.throws(() => owner.finalize('extra')); assert.equal(owner.finalize(), r); assert.equal(r.status, 'COMPLETE_DECLARED_TRACE_DATA');
});

test('zero warmup uses measurement ordinal zero rather than a different request binding', () => {
  const owner = create(options({ warmup: 0, measured: 1 })); owner.append(page([row(VECTORS.M0, 1)]));
  assert.equal(owner.finalize().cohorts.MEASUREMENT.originalsObserved, 1);
});

test('partial measurement completion is explicit and never expands the completed-original set', () => {
  const owner = create(options({ measured: 2, measuredCompleted: 1 }));
  owner.append(page([row(VECTORS.W0, 1), row(VECTORS.M0, 2)]));
  const r = owner.finalize(); assert.equal(r.status, 'COMPLETE_DECLARED_TRACE_DATA');
  assert.equal(r.independentlyDeclaredCompletedOriginals.MEASUREMENT, 1); assert.equal(r.cohorts.MEASUREMENT.originalsObserved, 1);
});

test('completed warmup without a measurement call retains an empty measurement cohort', () => {
  const owner = create(options({ measuredCompleted: 0 })); owner.append(page([row(VECTORS.W0, 1)]));
  const r = owner.finalize(); assert.equal(r.status, 'COMPLETE_DECLARED_TRACE_DATA');
  assert.equal(r.cohorts.MEASUREMENT.writerBracketNs.samples, 0); assert.equal(r.cohorts.MEASUREMENT.writerBracketNs.p50, null);
});

test('an explicit empty snapshot with zero completed originals is EMPTY rather than benchmark success', () => {
  const owner = create(options({ warmupCompleted: 0, measuredCompleted: 0 })); owner.append(page([]));
  const r = owner.finalize(); assert.equal(r.status, 'EMPTY_DECLARED_TRACE_DATA'); assert.equal(r.acceptedIntervals, 0);
  assert.equal(r.sustainableCapacityQualified, false);
});

test('no declared page or missing completed-original writer rows withholds the final report', () => {
  const a = create(options()); assert.equal(a.finalize().status, 'INCOMPLETE_DECLARED_TRACE_DATA');
  assert.equal(a.inspect().retainedCommandReferences, 0);
  const b = create(options()); b.append(page([row(VECTORS.W0, 1)]));
  assert.equal(b.finalize().reason, 'COMPLETED_ORIGINAL_TRACE_MISSING');
});

test('64-row pages preserve a repeated original across the genuine page boundary', () => {
  const owner = create(options()), input = Array.from({ length: 62 }, (_, i) => row('CONTROL', i + 1));
  input.push(row(VECTORS.W0, 63), row(VECTORS.W0, 64), row(VECTORS.W0, 65), row(VECTORS.M0, 66), row(VECTORS.M1, 67));
  const pages = allPages(owner, input);
  assert.equal(pages.length, 2); assert.equal(pages[0].next, 64);
  assert.equal(owner.finalize().cohorts.WARMUP.writerIntervals, 3); assert.equal(owner.inspect().retainedDurationReferences, 0);
});

test('the full source-bound 256-original 3136-row 49-page limit is retained without source copies', () => {
  const owner = create(options({ warmup: 0, measured: 256 })), input = [];
  for (let i = 0; i < 64; i++) input.push(row('CONTROL', input.length + 1));
  for (let ordinal = 0; ordinal < 256; ordinal++) for (let i = 0; i < 12; i++) input.push(row(original('MEASUREMENT', ordinal), input.length + 1));
  const pages = allPages(owner, input);
  assert.equal(input.length, 3136); assert.equal(pages.length, 49); assert.equal(owner.inspect().retainedDurationReferences, 6272);
  const r = owner.finalize(); assert.equal(r.status, 'COMPLETE_DECLARED_TRACE_DATA');
  assert.equal(r.matchedCompletedOriginals, 256); assert.equal(r.cohorts.MEASUREMENT.writerIntervals, 3072);
  assert.equal(owner.inspect().retainedDurationReferences, 0); assert.equal(owner.inspect().retainedCommandReferences, 0);
});

test('page staging does not partially commit an earlier valid row before a later binding failure', () => {
  const owner = create(options()), input = Array.from({ length: 63 }, (_, i) => row('CONTROL', i + 1));
  input.push(row(VECTORS.W0, 64)); owner.append(page(input, 66));
  const before = owner.inspect();
  assert.throws(() => owner.append(page([row(VECTORS.M0, 65), row('0'.repeat(64), 66)], 66, 64)));
  const after = owner.inspect(); assert.equal(after.phase, 'HELD');
  assert.equal(after.acceptedIntervals, before.acceptedIntervals); assert.equal(after.retainedDurationReferences, before.retainedDurationReferences);
  assert.equal(after.matchedCompletedOriginals, 1);
  const r = owner.finalize(); assert.equal(r.status, 'INCOMPLETE_DECLARED_TRACE_DATA'); assert.equal(r.cohorts.MEASUREMENT.writerIntervals, 0);
});

test('source unknown is sticky and a late plausible page cannot restore qualification', () => {
  const owner = create(options());
  assert.throws(() => owner.append(page(records(), 7, 0, { unknown: true })));
  assert.throws(() => owner.append(page(records()))); assert.equal(owner.inspect().acceptedIntervals, 0);
  assert.equal(owner.finalize().status, 'INCOMPLETE_DECLARED_TRACE_DATA');
});

test('a changed snapshot total or replayed page cannot silently restart a trace', () => {
  for (const change of ['total', 'replay']) {
    const owner = create(options({ warmupCompleted: 0, measuredCompleted: 0 }));
    const first = Array.from({ length: 64 }, (_, i) => row('CONTROL', i + 1)); owner.append(page(first, 65));
    assert.throws(() => owner.append(change === 'replay' ? page(first, 65) : page([row('CONTROL', 65)], 66, 64)));
    assert.equal(owner.inspect().acceptedIntervals, 64); assert.equal(owner.finalize().status, 'INCOMPLETE_DECLARED_TRACE_DATA');
  }
});

test('incomplete page consumption withholds the report even when observed originals are complete', () => {
  const owner = create(options()), input = [row(VECTORS.W0, 1), row(VECTORS.M0, 2), row(VECTORS.M1, 3)];
  while (input.length < 64) input.push(row('CONTROL', input.length + 1));
  owner.append(page(input, 65)); const r = owner.finalize();
  assert.equal(r.matchedCompletedOriginals, 3); assert.equal(r.reason, 'DECLARED_SNAPSHOT_INCOMPLETE');
});

test('incomplete traces retain accepted sample counts but withhold all partial latency distributions', () => {
  const owner = create(options()), input = [row(VECTORS.W0, 1)];
  while (input.length < 64) input.push(row(VECTORS.M0, input.length + 1, 99n));
  owner.append(page(input, 65)); const r = owner.finalize();
  assert.equal(r.status, 'INCOMPLETE_DECLARED_TRACE_DATA'); assert.equal(r.cohorts.MEASUREMENT.writerIntervals, 63);
  for (const name of ['CONTROL', 'WARMUP', 'MEASUREMENT']) {
    const c = r.cohorts[name]; assert.equal(c.metricsStatus, 'WITHHELD_INCOMPLETE_TRACE_DATA');
    for (const statistic of [c.writerBracketNs, c.insideWriterTransactionNs])
      for (const field of ['min', 'p50', 'p95', 'p99', 'max']) assert.equal(statistic[field], null);
  }
  assert.equal(r.cohorts.MEASUREMENT.writerBracketNs.samples, 63); assert.equal(owner.inspect().retainedDurationReferences, 0);
});

test('complete and empty cohorts expose explicit non-native DATA statistic status', () => {
  const owner = create(options({ warmup: 0, measured: 1 })); owner.append(page([row(VECTORS.M0, 1)]));
  const r = owner.finalize(); assert.equal(r.cohorts.WARMUP.metricsStatus, 'NO_MATCHED_SAMPLES');
  assert.equal(r.cohorts.MEASUREMENT.metricsStatus, 'OBSERVED_DECLARED_COHORT_SPANS_NOT_NATIVE_LATENCY');
});

test('foreign run lane or unknown original cannot be fuzzily matched', () => {
  for (const command of [VECTORS.OTHER_LANE_M0, original('WARMUP', 0, '2'.repeat(64)), '0'.repeat(64)]) {
    const owner = create(options()); assert.throws(() => owner.append(page([row(command, 1)])));
    assert.equal(owner.inspect().reason, 'UNMATCHED_ORIGINAL_BINDING'); assert.equal(owner.inspect().acceptedIntervals, 0);
  }
});

test('a planned but independently uncompleted original never proves its own completion from a writer row', () => {
  const owner = create(options({ measuredCompleted: 1 }));
  assert.throws(() => owner.append(page([row(VECTORS.W0, 1), row(VECTORS.M0, 2), row(VECTORS.M1, 3)])));
  assert.equal(owner.inspect().reason, 'ORIGINAL_COMPLETION_UNOBSERVED'); assert.equal(owner.inspect().acceptedIntervals, 0);
});

test('missing prefixes backwards cohorts and originals reopened after CONTROL are refused', () => {
  for (const commands of [[VECTORS.M0], [VECTORS.W0, VECTORS.M0, VECTORS.W0], [VECTORS.W0, 'CONTROL', VECTORS.W0],
    [VECTORS.W0, VECTORS.M1]]) {
    const owner = create(options());
    assert.throws(() => owner.append(page(commands.map((command, i) => row(command, i + 1)))));
    assert.equal(owner.inspect().acceptedIntervals, 0); assert.equal(owner.finalize().status, 'INCOMPLETE_DECLARED_TRACE_DATA');
  }
});

test('CONTROL between different originals is retained as its own cohort without merging them', () => {
  const owner = create(options()); const input = [VECTORS.W0, 'CONTROL', VECTORS.M0, 'CONTROL', VECTORS.M1];
  owner.append(page(input.map((command, i) => row(command, i + 1))));
  const r = owner.finalize(); assert.equal(r.status, 'COMPLETE_DECLARED_TRACE_DATA'); assert.equal(r.cohorts.CONTROL.writerIntervals, 2);
});

test('128-bit child-local timestamps stay exact and are never compared with another process clock', () => {
  const owner = create(options({ warmup: 0, measured: 1 })), n = (1n << 120n);
  const r = F({ ...row(VECTORS.M0, 1), beforeBeginNs: String(n), afterBeginNs: String(n + 1n),
    beforeCommitNs: String(n + 3n), afterCommitNs: String(n + 7n) });
  owner.append(page([r])); const report = owner.finalize();
  assert.equal(report.cohorts.MEASUREMENT.writerBracketNs.p50, '7');
  assert.equal(report.cohorts.MEASUREMENT.insideWriterTransactionNs.p50, '2');
});

test('equal nondecreasing writer timestamps produce exact zero spans without a fabricated rate', () => {
  const owner = create(options({ warmup: 0, measured: 1 }));
  owner.append(page([F({ ...row(VECTORS.M0, 1), beforeBeginNs: '0', afterBeginNs: '0', beforeCommitNs: '0', afterCommitNs: '0' })]));
  assert.equal(owner.finalize().cohorts.MEASUREMENT.writerBracketNs.p50, '0');
});

test('caller-owned frozen input rows remain unchanged by capture and final sorting', () => {
  const config = options(), input = records(), before = JSON.stringify({ config, input }), owner = create(config);
  owner.append(page(input)); owner.finalize(); assert.equal(JSON.stringify({ config, input }), before);
});

test('invalid append and finalize arity are sticky while inspect remains read-only', () => {
  const a = create(options()); assert.throws(() => a.append(page(records()), 'extra'));
  assert.equal(a.inspect().reason, 'APPEND_ARITY');
  const b = create(options()); assert.throws(() => b.finalize('extra'));
  assert.equal(b.finalize().status, 'INCOMPLETE_DECLARED_TRACE_DATA');
  const c = create(options()), before = c.inspect(); assert.throws(() => c.inspect('extra'));
  assert.deepEqual(c.inspect(), before); assert.throws(() => create(options(), 'extra'));
});

test('constructor rejects getters and proxies without invoking caller hooks', () => {
  let calls = 0;
  const c = { ...options() }; Object.defineProperty(c, 'context', { enumerable: true, get() { calls++; throw Error('unreachable'); } });
  assert.throws(() => create(F(c)));
  assert.throws(() => create(new Proxy(options(), { getPrototypeOf() { calls++; return Object.prototype; }, ownKeys() { calls++; return []; } })));
  const p = F({ ...options(), plan: new Proxy(options().plan, { get() { calls++; throw Error('unreachable'); } }) });
  assert.throws(() => create(p)); assert.equal(calls, 0);
});

for (const [label, edit] of [
  ['non-frozen root', c => ({ ...c })],
  ['non-frozen plan', c => F({ ...c, plan: { ...c.plan } })],
  ['extra injection option', c => F({ ...c, createHash: () => '0'.repeat(64) })],
  ['extra context field', c => F({ ...c, context: F({ ...c.context, retry: true }) })],
  ['bad run id', () => options({ runId: 'A'.repeat(64) })],
  ['bad lane path', () => options({ laneId: 'lane/other' })],
  ['zero measurement plan', () => options({ measured: 0 })],
  ['too many originals', () => options({ warmup: 255, measured: 2 })],
  ['warmup negative zero', () => options({ warmup: -0 })],
  ['boolean completion', () => options({ warmupCompleted: true })],
  ['completion exceeds plan', () => options({ measuredCompleted: 3 })],
  ['measurement before all warmup completed', () => options({ warmup: 2, warmupCompleted: 1, measuredCompleted: 1 })],
]) {
  test('closed configuration rejects ' + label, () => { assert.throws(() => create(edit(options()))); });
}

for (const [label, edit] of [
  ['active writer', p => F({ ...p, active: true })],
  ['started count mismatch', p => F({ ...p, started: p.total + 1 })],
  ['wrong child clock domain', p => F({ ...p, clockDomain: 'PARENT' })],
  ['parent declaration field', p => F({ ...p, nativeQualified: true })],
  ['row ordinal mismatch', p => F({ ...p, records: F([F({ ...p.records[0], ordinal: 2 })]) })],
  ['backwards clock', p => F({ ...p, records: F([F({ ...p.records[0], afterCommitNs: '0' })]) })],
  ['timestamp overflow', p => F({ ...p, records: F([F({ ...p.records[0], afterCommitNs: String(1n << 128n) })]) })],
  ['row limit overflow', p => F({ ...p, total: 77, started: 77 })],
  ['non-frozen row', p => F({ ...p, records: F([{ ...p.records[0] }]) })],
]) {
  test('existing strict raw page contract rejects ' + label, () => {
    const owner = create(options({ warmup: 0, measured: 1 }));
    assert.throws(() => owner.append(edit(page([row(VECTORS.M0, 1)]))));
    assert.equal(owner.inspect().acceptedIntervals, 0); assert.equal(owner.inspect().held, true);
  });
}

test('raw page record proxies and accessors are rejected without executing them', () => {
  let calls = 0;
  const a = create(options({ warmup: 0, measured: 1 })), r = { ...row(VECTORS.M0, 1) };
  Object.defineProperty(r, 'command', { enumerable: true, get() { calls++; throw Error('unreachable'); } });
  assert.throws(() => a.append(page([F(r)])));
  const b = create(options({ warmup: 0, measured: 1 })), p = page([row(VECTORS.M0, 1)]);
  const proxied = F({ ...p, records: new Proxy(p.records, { getPrototypeOf() { calls++; return Array.prototype; } }) });
  assert.throws(() => b.append(proxied)); assert.equal(calls, 0);
});
