import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeCapacityWorkloadAdapter as create } from './capacity-native-workload-adapter-v2.draft.mjs';

// Inert admission only. Never call run()/stop() with valid arity: those methods
// enter REAL native timers/pairs and require separate finite native approval.
// No fake namespace getter, process factory, SDK or SQL substitute is installed.
const F = Object.freeze;
function config() {
  return { context: { runId: '1'.repeat(64) }, plan: { warmupCallsPerLane: 1, measurementCallsPerLane: 2,
    setupBudgetMs: 500, measurementWindowMs: 100, drainGraceMs: 10, maxLedgerTransactionsPerOperation: 3 },
    recordingLimits: { maxSamplesPerPhase: 128, maxInFlightPerPhase: 4 },
    laneProfiles: F([F({ laneId: 'lane.one', payerProfile: F({ path: '/synthetic-payer-profile.json', sha256: 'a'.repeat(64) }),
      serviceProfile: F({ path: '/synthetic-service-profile.json', sha256: 'b'.repeat(64) }) })]),
    payeeAddress: 'z1' + 'q'.repeat(38), commandBudgetMs: 1000, closeBudgetMs: 6000 };
}

test('actual hardwired adapter constructs without native pair acquisition or runtime entry', () => {
  const owner = create(config()), s = owner.inspect();
  assert.equal(s.runRequested, false); assert.equal(s.core.phase, 'CREATED');
  assert.equal(s.pairAcquisitionsEntered, 0); assert.equal(s.pairHandlesCaptured, 0);
  assert.equal(s.nativeResourcesQualified, false); assert.equal(s.authority, 'NONE'); assert.equal(Object.isFrozen(owner), true);
});

test('inert public metadata and empty private evidence contain no profile paths', () => {
  const owner = create(config()); assert.equal(JSON.stringify(owner.inspect()).includes('synthetic-payer'), false);
  const rows = owner.privateEvidence(); assert.equal(rows.length, 1); assert.equal(rows[0].privateStreams.length, 0);
  assert.equal(rows[0].payerOperationTimings.length, 0); assert.equal(rows[0].serviceWriterIntervals.length, 0);
  assert.equal(JSON.stringify(rows).includes('/synthetic'), false);
});

test('closed adapter configuration cannot inject worker clock SDK SQL or process factories', () => {
  for (const name of ['createPair', 'runtime', 'SDK', 'Sqlite', 'fork']) {
    const c = config(); c[name] = () => { throw new Error('unreachable'); }; assert.throws(() => create(c));
  }
});

test('inert adapter rejects getters and proxies without invoking hooks', () => {
  let calls = 0; const c = config();
  Object.defineProperty(c, 'laneProfiles', { enumerable: true, get() { calls++; throw new Error('unreachable'); } });
  assert.throws(() => create(c)); assert.throws(() => create(new Proxy(config(), { getPrototypeOf() { calls++; return Object.prototype; } })));
  const d = config(); d.laneProfiles = new Proxy(d.laneProfiles, { getPrototypeOf() { calls++; return Array.prototype; } });
  assert.throws(() => create(d)); assert.equal(calls, 0);
});

test('inert adapter rejects aliased lanes and role-profile paths or digests', () => {
  for (const kind of ['lane', 'path', 'digest']) {
    const c = config(), first = c.laneProfiles[0];
    const second = F({ laneId: kind === 'lane' ? first.laneId : 'lane.two',
      payerProfile: F({ path: kind === 'path' ? first.payerProfile.path : '/synthetic-payer-2.json',
        sha256: kind === 'digest' ? first.payerProfile.sha256 : 'c'.repeat(64) }),
      serviceProfile: F({ path: '/synthetic-service-2.json', sha256: 'd'.repeat(64) }) });
    c.laneProfiles = F([first, second]); assert.throws(() => create(c));
  }
});

test('inert native plan remains bounded and core recording capacity cannot be silently expanded', () => {
  for (const edit of [{ warmupCallsPerLane: 255, measurementCallsPerLane: 2 }, { drainGraceMs: 1001 },
    { measurementWindowMs: 0 }, { maxLedgerTransactionsPerOperation: 17 }]) {
    const c = config(); Object.assign(c.plan, edit); assert.throws(() => create(c));
  }
  const c = config(); c.recordingLimits.maxSamplesPerPhase = 1; assert.throws(() => create(c));
});

test('public arity rejection keeps the real native run and stop paths unentered', async () => {
  const owner = create(config());
  await assert.rejects(owner.run('extra')); await assert.rejects(owner.stop('extra'));
  assert.throws(() => owner.inspect('extra')); assert.throws(() => owner.privateEvidence('extra')); assert.throws(() => create(config(), 'extra'));
  assert.equal(owner.inspect().runRequested, false); assert.equal(owner.inspect().pairAcquisitionsEntered, 0);
});
