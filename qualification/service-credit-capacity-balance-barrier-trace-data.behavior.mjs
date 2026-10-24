import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceCreditCapacityBalanceBarrierTrace as create,
  validateServiceCreditCapacityBalanceBarrierTraceData as validate } from '../src/service-credit-capacity-balance-barrier-trace-data.js';

if (process.env.X402_BALANCE_BARRIER_DATA_SELECTION !== 'balance-barrier-data-v1')
  throw new TypeError('EXPLICIT_BALANCE_BARRIER_DATA_SELECTION_REQUIRED');
const stages = ['AFTER_FUNDING', 'AFTER_WARMUP', 'AFTER_DRAIN'];
const config = (lanes = 2) => ({ runId: 'a'.repeat(64), sourceRowsSha256: 'b'.repeat(64),
  laneIds: Array.from({ length: lanes }, (_, i) => 'lane.' + i) });
const clone = value => JSON.parse(JSON.stringify(value));
function full(lanes = 2, shift = 0n, zero = false) {
  const expected = config(lanes), owner = create(expected);
  for (let phase = 0; phase < 3; phase++) {
    const base = shift + BigInt(phase * 1000);
    const pending = expected.laneIds.map((lane, i) => owner.begin(lane, stages[phase], zero ? shift : base + BigInt(i)));
    pending.forEach((finish, i) => finish('SUCCEEDED', zero ? shift : base + BigInt(100 + 2 * i)));
  }
  const report = owner.finalize(), evidence = owner.captureEvidence();
  return { owner, report, evidence, expected };
}
const check = h => validate({ evidence: h.evidence, report: h.report, expected: h.expected });

test('construction is inert and incomplete finalization grants no resource or retry authority', () => {
  const owner = create(config()), report = owner.finalize();
  assert.deepEqual(Object.keys(owner), ['begin', 'finalize', 'captureEvidence']);
  assert.equal(report.entered, 0); assert.equal(report.pending, 0);
  assert.equal(report.status, 'INCOMPLETE_DECLARED_BALANCE_BARRIER_DATA');
  assert.equal(report.authority, 'NONE');
  assert.throws(() => validate({ evidence: owner.captureEvidence(), report, expected: config() }));
});
test('two overlapping source lanes reconstruct three whole parent barriers with manual nearest ranks', () => {
  const h = full(), result = check(h);
  assert.equal(h.report.status, 'COMPLETE_DECLARED_BALANCE_BARRIER_DATA');
  assert.equal(h.report.entered, 6); assert.equal(h.evidence.events.length, 12);
  for (const stage of stages) assert.deepEqual(h.report.metrics[stage],
    { samples: 2, min: '100', p50: '100', p95: '101', p99: '101', max: '101' });
  assert.equal(result.rawSeriesRecomputed, true); assert.equal(result.eventsChecked, 12);
  for (const key of ['nativeEventsAuthenticated', 'parentClockAuthenticated', 'sqlLatencyQualified',
    'nativeResourcesQualified', 'sustainableCapacityQualified', 'productionQualified']) assert.equal(result[key], false);
});
test('all sixteen source lanes retain exactly forty-eight observations and ninety-six private events', () => {
  const h = full(16); assert.equal(check(h).barriers, 48); assert.equal(h.evidence.events.length, 96);
  for (const stage of stages) assert.deepEqual(h.report.metrics[stage],
    { samples: 16, min: '100', p50: '107', p95: '115', p99: '115', max: '115' });
});
test('same parent-clock offset changes no durations or summaries and is never child-clock alignment proof', () => {
  const a = full(), b = full(2, 1n << 100n);
  assert.deepEqual(a.report, b.report); assert.notDeepEqual(a.evidence.events, b.evidence.events);
  assert.equal(check(b).parentClockAuthenticated, false);
});
test('zero-duration observations and equal parent timestamps remain exact declared DATA', () => {
  const h = full(2, 0n, true); assert.equal(check(h).barriers, 6);
  for (const stage of stages) assert.equal(h.report.metrics[stage].max, '0');
});
test('configuration is detached without raw identifiers or timestamps in the public report', () => {
  const input = config(1), owner = create(input); input.laneIds[0] = 'changed'; input.runId = 'c'.repeat(64);
  for (let i = 0; i < 3; i++) owner.begin('lane.0', stages[i], BigInt(i))('SUCCEEDED', BigInt(i));
  const report = owner.finalize(), ev = owner.captureEvidence();
  assert.equal(ev.context.runId, 'a'.repeat(64)); assert.equal(ev.context.laneIds[0], 'lane.0');
  for (const key of ['runId', 'sourceRowsSha256', 'laneIds', 'events', 'atNs']) assert.equal(key in report, false);
});
test('finalization and private evidence are cached frozen without another observation', () => {
  const h = full();
  assert.equal(h.owner.finalize(), h.report); assert.equal(h.owner.captureEvidence(), h.evidence);
  for (const v of [h.owner, h.report, h.report.metrics, h.report.metrics.AFTER_DRAIN,
    h.evidence, h.evidence.events, h.evidence.events[0], h.evidence.context, h.evidence.context.laneIds]) assert.ok(Object.isFrozen(v));
  assert.throws(() => h.owner.begin('lane.0', stages[0], 20000n));
  assert.equal(h.owner.finalize(), h.report);
});
test('evidence cannot be read before explicit finalization and wrong API arity never starts work', () => {
  const owner = create(config()); assert.throws(() => owner.captureEvidence());
  assert.throws(() => create()); assert.throws(() => create(config(), undefined));
  assert.throws(() => validate()); assert.throws(() => validate({}, undefined));
});
test('rejection is retained in the denominator and permanently stops new observations', () => {
  const owner = create(config());
  const a = owner.begin('lane.0', stages[0], 1n), b = owner.begin('lane.1', stages[0], 2n);
  a('REJECTED', 3n); assert.throws(() => owner.begin('lane.0', stages[1], 4n)); b('SUCCEEDED', 5n);
  const report = owner.finalize(); assert.equal(report.settled, 2); assert.equal(report.rejected, 1);
  assert.equal(report.succeeded, 1); assert.equal(report.pending, 0); assert.equal(report.issue, 'SOURCE_REJECTED');
  assert.throws(() => validate({ evidence: owner.captureEvidence(), report, expected: config() }));
});
test('unknown remains unknown after other admitted work finishes and late input cannot repair its snapshot', () => {
  const owner = create(config()), finish = owner.begin('lane.0', stages[0], 1n);
  finish('UNKNOWN', 2n); const report = owner.finalize();
  assert.equal(report.unknown, 1); assert.equal(report.issue, 'SOURCE_UNKNOWN');
  assert.throws(() => finish('SUCCEEDED', 3n)); assert.equal(owner.finalize(), report);
});
test('missing terminal observation remains pending and cannot be converted into complete raw evidence', () => {
  const owner = create(config()), finish = owner.begin('lane.0', stages[0], 1n), report = owner.finalize();
  assert.equal(report.pending, 1); assert.equal(report.status, 'INCOMPLETE_DECLARED_BALANCE_BARRIER_DATA');
  assert.throws(() => finish('SUCCEEDED', 2n)); assert.equal(owner.finalize(), report);
});
for (const [name, run] of [
  ['wrong lane', h => h.begin('other', stages[0], 0n)],
  ['wrong barrier order', h => h.begin('lane.0', stages[1], 0n)],
  ['number clock', h => h.begin('lane.0', stages[0], 0)],
  ['negative clock', h => h.begin('lane.0', stages[0], -1n)],
  ['clock overflow', h => h.begin('lane.0', stages[0], 1n << 128n)],
  ['wrong begin arity', h => h.begin('lane.0', stages[0], 0n, undefined)],
  ['duplicate outstanding lane', h => { h.begin('lane.0', stages[0], 0n); h.begin('lane.0', stages[0], 1n); }],
  ['backward terminal clock', h => h.begin('lane.0', stages[0], 10n)('SUCCEEDED', 9n)],
  ['backward clock across lanes', h => { h.begin('lane.0', stages[0], 10n); h.begin('lane.1', stages[0], 9n); }],
  ['wrong terminal arity', h => h.begin('lane.0', stages[0], 0n)('SUCCEEDED', 1n, undefined)],
  ['invalid terminal outcome', h => h.begin('lane.0', stages[0], 0n)('OK', 1n)],
  ['duplicate terminal', h => { const end = h.begin('lane.0', stages[0], 0n); end('SUCCEEDED', 1n); end('SUCCEEDED', 2n); }],
]) test('owner refuses ' + name + ' without clean recording', () => {
  const owner = create(config()); assert.throws(() => run(owner));
  const report = owner.finalize(); assert.equal(report.status, 'INCOMPLETE_DECLARED_BALANCE_BARRIER_DATA'); assert.notEqual(report.issue, null);
});
const base = full();
function edit(h, path, value) {
  let row = h; for (const name of path.slice(0, -1)) row = row[name]; row[path.at(-1)] = value;
}
for (const [name, path, replacement] of [
  ['different expected run', ['expected', 'runId'], 'c'.repeat(64)],
  ['different expected source', ['expected', 'sourceRowsSha256'], 'c'.repeat(64)],
  ['different lane order', ['expected', 'laneIds'], ['lane.1', 'lane.0']],
  ['mixed clock domain', ['evidence', 'clockDomain'], 'SERVICE_CHILD_LOCAL'],
  ['raw unknown', ['evidence', 'events', 2, 'outcome'], 'UNKNOWN'],
  ['fractional lane', ['evidence', 'events', 0, 'lane'], 0.5],
  ['negative zero lane', ['evidence', 'events', 0, 'lane'], -0],
  ['foreign lane', ['evidence', 'events', 0, 'lane'], 2],
  ['leading zero timestamp', ['evidence', 'events', 0, 'atNs'], '00'],
  ['negative zero timestamp', ['evidence', 'events', 0, 'atNs'], '-0'],
  ['numeric timestamp', ['evidence', 'events', 0, 'atNs'], 0],
  ['overflow timestamp', ['evidence', 'events', 0, 'atNs'], String(1n << 128n)],
  ['extra event field', ['evidence', 'events', 0, 'unreviewed'], true],
  ['extra capsule field', ['evidence', 'authority'], 'NONE'],
  ['non-null issue', ['evidence', 'issue'], 'SOURCE_UNKNOWN'],
  ['report grants native', ['report', 'nativeResourcesQualified'], true],
  ['report grants production', ['report', 'productionQualified'], true],
  ['report count boolean', ['report', 'entered'], true],
  ['report negative zero', ['report', 'pending'], -0],
  ['wrong percentile', ['report', 'metrics', 'AFTER_DRAIN', 'p50'], '101'],
  ['wrong sample denominator', ['report', 'metrics', 'AFTER_FUNDING', 'samples'], 1],
  ['extra metric field', ['report', 'metrics', 'AFTER_FUNDING', 'mean'], '100'],
]) test('checker refuses ' + name + ' without replaying a recorder', () => {
  const value = { report: clone(base.report), evidence: clone(base.evidence), expected: clone(base.expected) };
  edit(value, path, replacement); assert.throws(() => validate(value));
});

test('maximum uint128 duration is exact without numeric conversion or overflow', () => {
  const expected = config(1), owner = create(expected), max = (1n << 128n) - 1n;
  owner.begin('lane.0', stages[0], 0n)('SUCCEEDED', max);
  owner.begin('lane.0', stages[1], max)('SUCCEEDED', max);
  owner.begin('lane.0', stages[2], max)('SUCCEEDED', max);
  const report = owner.finalize(), evidence = owner.captureEvidence();
  assert.equal(report.metrics.AFTER_FUNDING.max, String(max));
  assert.equal(validate({ report, evidence, expected }).rawSeriesRecomputed, true);
});
test('a fourth barrier is not evicted or silently omitted from clean qualification', () => {
  const owner = create(config(1));
  for (let i = 0; i < 3; i++) owner.begin('lane.0', stages[i], BigInt(i))('SUCCEEDED', BigInt(i));
  assert.throws(() => owner.begin('lane.0', stages[2], 3n));
  assert.equal(owner.finalize().status, 'INCOMPLETE_DECLARED_BALANCE_BARRIER_DATA');
});
test('checker consumes detached mutable JSON DATA without changing its source', () => {
  const input = { evidence: clone(base.evidence), report: clone(base.report), expected: clone(base.expected) };
  const before = JSON.stringify(input); assert.equal(validate(input).eventsChecked, 12);
  assert.equal(JSON.stringify(input), before);
});
for (const [name, change] of [
  ['missing raw event', h => h.evidence.events.pop()],
  ['extra raw event', h => h.evidence.events.push(h.evidence.events[0])],
  ['out-of-order global raw events', h => { [h.evidence.events[0], h.evidence.events[1]] = [h.evidence.events[1], h.evidence.events[0]]; }],
  ['terminal without begin', h => { h.evidence.events[0] = h.evidence.events[2]; }],
]) test('checker refuses ' + name + ' rather than inventing or truncating source evidence', () => {
  const input = { evidence: clone(base.evidence), report: clone(base.report), expected: clone(base.expected) };
  change(input); assert.throws(() => validate(input));
});
for (const [name, change] of [
  ['empty source lanes', c => { c.laneIds = []; }],
  ['seventeen source lanes', c => { c.laneIds = config(17).laneIds; }],
  ['duplicate source lanes', c => { c.laneIds = ['lane.0', 'lane.0']; }],
  ['non-ascii source lane', c => { c.laneIds = ['lane.\u00e9']; }],
  ['invalid run tag', c => { c.runId = 'a'; }],
  ['invalid source tag', c => { c.sourceRowsSha256 = 'B'.repeat(64); }],
  ['extra context field', c => { c.authority = 'NONE'; }],
  ['sparse source array', c => { c.laneIds = new Array(2); }],
  ['extra array property', c => { c.laneIds.extra = true; }],
]) test('configuration refuses ' + name + ' before any observation', () => {
  const c = config(); change(c); assert.throws(() => create(c));
});
test('proxy and accessor configurations execute zero user hooks', () => {
  let hooks = 0;
  const proxy = new Proxy(config(), { get() { hooks++; throw Error('hook'); },
    getPrototypeOf() { hooks++; throw Error('hook'); }, ownKeys() { hooks++; throw Error('hook'); } });
  assert.throws(() => create(proxy));
  const accessor = config(); Object.defineProperty(accessor, 'runId', { enumerable: true, get() { hooks++; return 'a'.repeat(64); } });
  assert.throws(() => create(accessor));
  const c = config(); Object.defineProperty(c.laneIds, '0', { enumerable: true, get() { hooks++; return 'lane.0'; } });
  assert.throws(() => create(c)); assert.equal(hooks, 0);
});
test('proxy or accessor raw evidence and report fields execute zero user hooks', () => {
  let hooks = 0;
  const input = { evidence: clone(base.evidence), report: clone(base.report), expected: clone(base.expected) };
  input.evidence.events[0] = new Proxy(input.evidence.events[0], { get() { hooks++; throw Error('hook'); },
    getPrototypeOf() { hooks++; throw Error('hook'); }, ownKeys() { hooks++; throw Error('hook'); } });
  assert.throws(() => validate(input));
  input.evidence = clone(base.evidence);
  Object.defineProperty(input.report.metrics.AFTER_DRAIN, 'p50', { enumerable: true, get() { hooks++; return '100'; } });
  assert.throws(() => validate(input)); assert.equal(hooks, 0);
});
test('a scalar historical metric without complete raw evidence cannot be upgraded to recomputed DATA', () => {
  assert.throws(() => validate({ evidence: { events: [] }, report: base.report, expected: base.expected }));
  assert.equal(base.report.clockDomain, 'PARENT_BALANCE_BARRIER_INCLUDING_FINAL_WRITER_TRACE_NOT_SQL_OR_L1');
  assert.equal(check(base).sqlLatencyQualified, false);
});
