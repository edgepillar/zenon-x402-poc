import { types as utilTypes } from 'node:util';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, P = Object.getPrototypeOf;
const K = Reflect.ownKeys, O = Object.hasOwn, PROXY = utilTypes.isProxy;
const BARRIERS = F(['AFTER_FUNDING', 'AFTER_WARMUP', 'AFTER_DRAIN']);
const CLOCK = 'PARENT_BALANCE_BARRIER_INCLUDING_FINAL_WRITER_TRACE_NOT_SQL_OR_L1';
const MAX_NS = (1n << 128n) - 1n, HASH = /^[0-9a-f]{64}$/, LANE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/**
 * Bounded P4 parent-side balance BARRIER observations, not balance-RPC/SQL time.
 * The final bracket may include writer-trace paging and validation. All times,
 * outcomes and context are caller-declared DATA. No clock/store/socket is read,
 * no operation/timer/child starts and no native or retry authority is granted.
 * Three ordered, nonoverlapping barriers per source lane; different lanes may
 * overlap. At most 48 observations/96 private events. Never evict or renew.
 * An invalid/unknown/rejected observation permanently prevents clean recording;
 * existing handles may finish before finalization. Late input cannot repair a
 * cached final snapshot. Recorder closure is not native cancellation or drain.
 */
export function createServiceCreditCapacityBalanceBarrierTrace(configuration) {
  if (arguments.length !== 1) fail();
  const context = contextData(configuration), lanes = context.laneIds.map(() => ({ next: 0, pending: null }));
  let last = null, issue = null, entered = 0, settled = 0, succeeded = 0, rejected = 0, unknown = 0;
  let final = null, evidence = null;
  const events = [], series = BARRIERS.map(() => []);
  function taint(code) { if (issue === null) issue = code; fail(); }
  function tick(at) {
    if (typeof at !== 'bigint' || at < 0n || at > MAX_NS || last !== null && at < last) taint('CLOCK_UNKNOWN');
    last = at;
  }
  const begin = F(function begin(laneId, barrier, atNs) {
    if (final !== null) fail();
    if (issue !== null) fail();
    if (arguments.length !== 3 || typeof laneId !== 'string' || typeof barrier !== 'string') taint('INVALID_INPUT');
    const index = context.laneIds.indexOf(laneId), stage = BARRIERS.indexOf(barrier);
    if (index < 0 || stage < 0 || lanes[index].next !== stage || lanes[index].pending !== null) taint('BARRIER_ORDER_UNKNOWN');
    tick(atNs);
    const row = { start: atNs, finished: false };
    lanes[index].pending = row; entered++;
    events.push(F({ kind: 'BEGIN', lane: index, barrier, atNs: String(atNs) }));
    return F(function finish(outcome, endedNs) {
      if (final !== null) fail();
      if (row.finished) taint('DUPLICATE_TERMINAL');
      if (arguments.length !== 2 || !['SUCCEEDED', 'REJECTED', 'UNKNOWN'].includes(outcome)) taint('INVALID_INPUT');
      tick(endedNs);
      row.finished = true; lanes[index].pending = null; lanes[index].next++; settled++;
      series[stage].push(endedNs - row.start);
      events.push(F({ kind: 'END', lane: index, barrier, outcome, atNs: String(endedNs) }));
      if (outcome === 'SUCCEEDED') succeeded++;
      else if (outcome === 'REJECTED') { rejected++; if (issue === null) issue = 'SOURCE_REJECTED'; }
      else { unknown++; if (issue === null) issue = 'SOURCE_UNKNOWN'; }
    });
  });
  const finalize = F(function finalize() {
    if (arguments.length !== 0) { if (final === null) taint('INVALID_INPUT'); fail(); }
    if (final !== null) return final;
    const complete = issue === null && lanes.every(row => row.next === 3 && row.pending === null);
    const metrics = {};
    for (let i = 0; i < BARRIERS.length; i++) metrics[BARRIERS[i]] = summarize(series[i]);
    final = F({ balanceBarrierTraceVersion: 1,
      status: complete ? 'COMPLETE_DECLARED_BALANCE_BARRIER_DATA' : 'INCOMPLETE_DECLARED_BALANCE_BARRIER_DATA',
      laneCount: lanes.length, expectedBarriers: 3 * lanes.length, entered, settled, pending: entered - settled,
      succeeded, rejected, unknown, issue, clockDomain: CLOCK, metrics: F(metrics),
      physicalEventsAuthenticated: false, nativeResourcesQualified: false, sustainableCapacityQualified: false,
      productionQualified: false, authority: 'NONE' });
    evidence = F({ balanceBarrierEvidenceVersion: 1, context, clockDomain: CLOCK, issue, events: F([...events]) });
    for (const values of series) values.length = 0;
    events.length = 0;
    return final;
  });
  const captureEvidence = F(function captureEvidence() {
    if (arguments.length !== 0 || final === null) fail();
    return evidence;
  });
  return F({ begin, finalize, captureEvidence });
}

/**
 * Reconstruct COMPLETE declared recorder input, independently of its owner.
 * Does not replay a recorder/source call, open private input, read a clock or
 * authenticate native events. Context must be independently captured by caller.
 */
export function validateServiceCreditCapacityBalanceBarrierTraceData(configuration) {
  if (arguments.length !== 1) fail();
  const top = exact(configuration, ['evidence', 'report', 'expected']);
  const expected = contextData(top.expected);
  const capsule = exact(top.evidence, ['balanceBarrierEvidenceVersion', 'context', 'clockDomain', 'issue', 'events']);
  const actual = contextData(capsule.context);
  if (capsule.balanceBarrierEvidenceVersion !== 1 || capsule.clockDomain !== CLOCK || capsule.issue !== null
      || actual.runId !== expected.runId || actual.sourceRowsSha256 !== expected.sourceRowsSha256
      || actual.laneIds.length !== expected.laneIds.length || actual.laneIds.some((v, i) => v !== expected.laneIds[i])) fail();
  const events = dense(capsule.events, 6 * expected.laneIds.length, 6 * expected.laneIds.length);
  const lanes = expected.laneIds.map(() => ({ next: 0, start: null })), series = BARRIERS.map(() => []);
  let last = null;
  for (const raw of events) {
    const tag = exactTag(raw);
    const row = exact(raw, tag === 'BEGIN' ? ['kind', 'lane', 'barrier', 'atNs'] : ['kind', 'lane', 'barrier', 'outcome', 'atNs']);
    if (!Number.isSafeInteger(row.lane) || Object.is(row.lane, -0) || row.lane < 0 || row.lane >= lanes.length) fail();
    const lane = lanes[row.lane], stage = BARRIERS.indexOf(row.barrier), at = nanoseconds(row.atNs);
    if (stage < 0 || stage !== lane.next || last !== null && at < last) fail();
    last = at;
    if (tag === 'BEGIN') {
      if (lane.start !== null) fail();
      lane.start = at;
    } else {
      if (row.outcome !== 'SUCCEEDED' || lane.start === null || at < lane.start) fail();
      series[stage].push(at - lane.start); lane.start = null; lane.next++;
    }
  }
  if (!lanes.every(row => row.next === 3 && row.start === null)) fail();
  const report = exact(top.report, ['balanceBarrierTraceVersion', 'status', 'laneCount', 'expectedBarriers',
    'entered', 'settled', 'pending', 'succeeded', 'rejected', 'unknown', 'issue', 'clockDomain', 'metrics',
    'physicalEventsAuthenticated', 'nativeResourcesQualified', 'sustainableCapacityQualified', 'productionQualified', 'authority']);
  const total = 3 * lanes.length;
  const fixed = { balanceBarrierTraceVersion: 1, status: 'COMPLETE_DECLARED_BALANCE_BARRIER_DATA',
    laneCount: lanes.length, expectedBarriers: total, entered: total, settled: total, pending: 0,
    succeeded: total, rejected: 0, unknown: 0, issue: null, clockDomain: CLOCK,
    physicalEventsAuthenticated: false, nativeResourcesQualified: false, sustainableCapacityQualified: false,
    productionQualified: false, authority: 'NONE' };
  for (const [key, value] of Object.entries(fixed)) if (!Object.is(report[key], value)) fail();
  const metrics = exact(report.metrics, BARRIERS);
  for (let i = 0; i < BARRIERS.length; i++) {
    const value = exact(metrics[BARRIERS[i]], ['samples', 'min', 'p50', 'p95', 'p99', 'max']);
    const expectedMetric = summarize(series[i]);
    for (const key of Object.keys(expectedMetric)) if (value[key] !== expectedMetric[key]) fail();
  }
  return F({ balanceBarrierTraceDataVersion: 1, status: 'MATCHING_DECLARED_BALANCE_BARRIER_TRACE_DATA',
    lanes: lanes.length, barriers: total, eventsChecked: events.length, rawSeriesRecomputed: true,
    nativeEventsAuthenticated: false, parentClockAuthenticated: false, sqlLatencyQualified: false,
    nativeResourcesQualified: false, sustainableCapacityQualified: false, productionQualified: false, authority: 'NONE' });
}
function contextData(value) {
  const c = exact(value, ['runId', 'sourceRowsSha256', 'laneIds']), ids = dense(c.laneIds, 1, 16);
  if (typeof c.runId !== 'string' || !HASH.test(c.runId) || typeof c.sourceRowsSha256 !== 'string' || !HASH.test(c.sourceRowsSha256)
      || ids.some(v => typeof v !== 'string' || !LANE.test(v)) || new Set(ids).size !== ids.length) fail();
  return F({ runId: c.runId, sourceRowsSha256: c.sourceRowsSha256, laneIds: F(ids) });
}
function exact(value, names) {
  if (value === null || typeof value !== 'object' || PROXY(value) || P(value) !== Object.prototype || K(value).length !== names.length) fail();
  const out = {};
  for (const name of names) {
    const d = D(value, name); if (!d || !O(d, 'value') || !d.enumerable) fail();
    Object.defineProperty(out, name, { value: d.value, enumerable: true });
  }
  return out;
}
function exactTag(value) {
  if (value === null || typeof value !== 'object' || PROXY(value) || P(value) !== Object.prototype) fail();
  const d = D(value, 'kind');
  if (!d || !O(d, 'value') || !d.enumerable || !['BEGIN', 'END'].includes(d.value)) fail();
  return d.value;
}
function dense(value, min, max) {
  if (value === null || typeof value !== 'object' || PROXY(value) || P(value) !== Array.prototype) fail();
  const d = D(value, 'length');
  if (!d || !Number.isSafeInteger(d.value) || d.value < min || d.value > max || K(value).length !== d.value + 1) fail();
  const out = [];
  for (let i = 0; i < d.value; i++) {
    const row = D(value, String(i)); if (!row || !O(row, 'value') || !row.enumerable) fail(); out.push(row.value);
  }
  return out;
}
function nanoseconds(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,38})$/.test(value)) fail();
  const result = BigInt(value); if (result > MAX_NS) fail(); return result;
}
function summarize(values) {
  const sorted = [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0), count = sorted.length;
  const at = percent => count === 0 ? null : String(sorted[Math.ceil(count * percent / 100) - 1]);
  return F({ samples: count, min: count === 0 ? null : String(sorted[0]), p50: at(50), p95: at(95), p99: at(99),
    max: count === 0 ? null : String(sorted[count - 1]) });
}
function fail() {
  const e = new TypeError('BALANCE_BARRIER_TRACE_DATA_UNAVAILABLE');
  Object.defineProperty(e, 'stack', { value: 'TypeError: BALANCE_BARRIER_TRACE_DATA_UNAVAILABLE' });
  throw F(e);
}
