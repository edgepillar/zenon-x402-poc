import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeCapacityPacedWorkloadAdapter as create } from './capacity-native-paced-workload-adapter-v1.draft.mjs';

if (process.version !== 'v24.19.0'
    || process.env.X402_CAPACITY_PACED_BINDING_DATA_SELECTION !== 'paced-binding-construction-data-v1')
  throw new TypeError('PACED_BINDING_CONSTRUCTION_DATA_SELECTION_REQUIRED');

// Only construction, inspect, pre-final capture refusal and WRONG-arity calls.
// No valid run/stop, source pair, namespace stub, profile read, timer or child.
const F = Object.freeze;
function config(count = 2) {
  return {
    context: { runId: 'a'.repeat(64) },
    plan: { warmupCallsPerLane: 1, measurementCallsPerLane: 2, setupBudgetMs: 500,
      measurementWindowMs: 100, drainGraceMs: 10, maxLedgerTransactionsPerOperation: 3 },
    recordingLimits: { maxSamplesPerPhase: 4096, maxInFlightPerPhase: 16 },
    laneProfiles: F(Array.from({ length: count }, (_, i) => ({
      laneId: 'synthetic-lane-' + i,
      payerProfile: { path: '/synthetic/never-opened/' + i + '/payer.json', sha256: String(2 * i + 1).padStart(64, '0') },
      serviceProfile: { path: '/synthetic/never-opened/' + i + '/service.json', sha256: String(2 * i + 2).padStart(64, '0') },
    }))),
    payeeAddress: 'z1' + 'q'.repeat(38), commandBudgetMs: 1000, closeBudgetMs: 6000,
    pacing: { minimumStartGapMs: 5 },
  };
}
const bindingError = { name: 'TypeError', message: 'NATIVE_CAPACITY_PACED_WORKLOAD_BINDING_UNAVAILABLE' };

test('actual adapter constructs the genuine paced owner without acquiring a pair', () => {
  const adapter = create(config()), snapshot = adapter.inspect();
  assert.deepEqual(Object.keys(adapter), ['run', 'stop', 'inspect', 'privateEvidence',
    'privateParentTimingEvidence', 'privatePacedTimingEvidence']);
  assert.equal(Object.isFrozen(adapter), true);
  for (const method of Object.values(adapter)) assert.equal(Object.isFrozen(method), true);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(snapshot.runRequested, false);
  assert.equal(snapshot.minimumStartGapMs, 5);
  assert.equal(snapshot.pairAcquisitionsEntered, 0);
  assert.equal(snapshot.pairHandlesCaptured, 0);
  assert.equal(snapshot.paced.core.phase, 'CREATED');
  assert.equal(snapshot.paced.requestedMeasuredCalls, 0);
  assert.equal(snapshot.paced.pacingTimerPending, false);
  assert.equal(snapshot.nativeResourcesQualified, false);
  assert.equal(snapshot.authority, 'NONE');
});

test('construction captures pacing and lane identities rather than retaining mutable inputs', () => {
  const c = config(), adapter = create(c);
  c.pacing.minimumStartGapMs = 0;
  c.context.runId = 'changed';
  c.laneProfiles[0].laneId = 'changed';
  c.laneProfiles[0].payerProfile.path = '/changed';
  assert.equal(adapter.inspect().minimumStartGapMs, 5);
  assert.equal(adapter.privateEvidence()[0].laneId, 'synthetic-lane-0');
  assert.equal(adapter.inspect().pairHandlesCaptured, 0);
});

test('sixteen real source bindings can be reserved inertly', () => {
  const adapter = create(config(16)), evidence = adapter.privateEvidence();
  assert.equal(evidence.length, 16);
  assert.equal(new Set(evidence.map(row => row.laneId)).size, 16);
  for (const row of evidence) {
    assert.equal(Object.isFrozen(row), true);
    assert.equal(row.pairSnapshot, null);
    assert.equal(row.serviceMeasurementWindow, null);
    assert.deepEqual(row.payerOperationTimings, []);
    assert.deepEqual(row.privateStreams, []);
  }
  assert.equal(adapter.inspect().pairAcquisitionsEntered, 0);
});

for (const minimumStartGapMs of [1, 1000]) test('accept exact finite pacing boundary ' + minimumStartGapMs, () => {
  const c = config(); c.pacing.minimumStartGapMs = minimumStartGapMs;
  assert.equal(create(c).inspect().minimumStartGapMs, minimumStartGapMs);
});

test('total 256 call profile is captured without opening it or running it', () => {
  const c = config(1); c.plan.warmupCallsPerLane = 0; c.plan.measurementCallsPerLane = 256;
  assert.equal(create(c).inspect().paced.core.phase, 'CREATED');
});

test('repeated inspection is stable and excludes private profile paths and identifiers', () => {
  const adapter = create(config()), one = adapter.inspect(), two = adapter.inspect();
  assert.deepEqual(one, two);
  const text = JSON.stringify(one);
  assert.equal(text.includes('/synthetic/'), false);
  assert.equal(text.includes('a'.repeat(64)), false);
  assert.equal(text.includes('synthetic-lane-'), false);
});

test('both private timing capabilities refuse evidence before finalization', () => {
  const adapter = create(config());
  assert.throws(() => adapter.privateParentTimingEvidence());
  assert.throws(() => adapter.privatePacedTimingEvidence());
  assert.equal(adapter.inspect().runRequested, false);
  assert.equal(adapter.inspect().pairHandlesCaptured, 0);
});

for (const method of ['run', 'stop']) test('wrong-arity ' + method + ' never requests native entry', async () => {
  const adapter = create(config());
  await assert.rejects(adapter[method](undefined), bindingError);
  assert.equal(adapter.inspect().runRequested, false);
  assert.equal(adapter.inspect().pairAcquisitionsEntered, 0);
});

for (const method of ['inspect', 'privateEvidence', 'privateParentTimingEvidence', 'privatePacedTimingEvidence'])
  test('wrong-arity ' + method + ' refuses without acquisition', () => {
    const adapter = create(config());
    assert.throws(() => adapter[method](undefined), bindingError);
    assert.equal(adapter.inspect().runRequested, false);
  });

test('constructor arity is exact', () => {
  assert.throws(() => create(), bindingError);
  assert.throws(() => create(config(), undefined), bindingError);
});

const mutations = [
  ['missing pacing', c => { delete c.pacing; }],
  ['extra pacing key', c => { c.pacing.extra = 1; }],
  ['zero gap', c => { c.pacing.minimumStartGapMs = 0; }],
  ['negative-zero gap', c => { c.pacing.minimumStartGapMs = -0; }],
  ['fractional gap', c => { c.pacing.minimumStartGapMs = 1.5; }],
  ['over-limit gap', c => { c.pacing.minimumStartGapMs = 1001; }],
  ['nonfinite gap', c => { c.pacing.minimumStartGapMs = Infinity; }],
  ['string gap', c => { c.pacing.minimumStartGapMs = '5'; }],
  ['unknown top-level key', c => { c.extra = true; }],
  ['invalid run identity', c => { c.context.runId = 'not-a-run'; }],
  ['duplicate lane', c => { c.laneProfiles[1].laneId = c.laneProfiles[0].laneId; }],
  ['duplicate path', c => { c.laneProfiles[1].payerProfile.path = c.laneProfiles[0].payerProfile.path; }],
  ['duplicate digest', c => { c.laneProfiles[1].payerProfile.sha256 = c.laneProfiles[0].payerProfile.sha256; }],
  ['relative path', c => { c.laneProfiles[0].payerProfile.path = 'relative.json'; }],
  ['noncanonical path', c => { c.laneProfiles[0].payerProfile.path = '/synthetic/../payer.json'; }],
  ['path newline', c => { c.laneProfiles[0].payerProfile.path = '/synthetic/\n/payer.json'; }],
  ['invalid digest', c => { c.laneProfiles[0].payerProfile.sha256 = 'G'.repeat(64); }],
  ['invalid payee syntax', c => { c.payeeAddress = 'not-a-payee'; }],
  ['too few command milliseconds', c => { c.commandBudgetMs = 999; }],
  ['too many command milliseconds', c => { c.commandBudgetMs = 60001; }],
  ['too few close milliseconds', c => { c.closeBudgetMs = 5999; }],
  ['too many close milliseconds', c => { c.closeBudgetMs = 15001; }],
  ['over-limit combined calls', c => { c.plan.warmupCallsPerLane = 255; c.plan.measurementCallsPerLane = 2; }],
  ['empty lanes', c => { c.laneProfiles = F([]); }],
  ['too many lanes', c => { c.laneProfiles = config(17).laneProfiles; }],
  ['unfrozen lane list', c => { c.laneProfiles = [...c.laneProfiles]; }],
];
for (const [name, mutate] of mutations) test('reject configuration: ' + name, () => {
  const c = config(); mutate(c); assert.throws(() => create(c), bindingError);
});

test('configuration, pacing and profile getters are not evaluated', () => {
  for (const location of ['top', 'pacing', 'profile']) {
    const c = config(); let reads = 0;
    const target = location === 'top' ? c : location === 'pacing' ? c.pacing : c.laneProfiles[0].payerProfile;
    const key = location === 'top' ? 'pacing' : location === 'pacing' ? 'minimumStartGapMs' : 'path';
    Object.defineProperty(target, key, { enumerable: true, get() { reads++; throw new Error('not evaluated'); } });
    assert.throws(() => create(c), bindingError);
    assert.equal(reads, 0);
  }
});

test('configuration, pacing and lane-list proxies refuse without invoking traps', () => {
  for (const location of ['top', 'pacing', 'lanes']) {
    const c = config(); let traps = 0;
    const target = location === 'top' ? c : location === 'pacing' ? c.pacing : c.laneProfiles;
    const proxy = new Proxy(target, { ownKeys() { traps++; throw new Error('not evaluated'); } });
    const input = location === 'top' ? proxy : c;
    if (location === 'pacing') c.pacing = proxy;
    if (location === 'lanes') c.laneProfiles = proxy;
    assert.throws(() => create(input), bindingError);
    assert.equal(traps, 0);
  }
});
