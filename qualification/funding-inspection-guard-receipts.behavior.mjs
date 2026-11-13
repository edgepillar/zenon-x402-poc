// Actual funding inspection owner and codecs with declared memory-only ports.
// No store, SDK, transport, key, signature, nonce or native owner is opened.
import assert from 'node:assert/strict';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as assemble } from '../src/zenon/dynamic-plasma-original-funding-data.js';
import { restoreOriginalPaymentCheckpoint } from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { canonicalJson } from '../src/canonical.js';
import { decodeApiCreditFundingInspectionProfile as decode, consumeApiCreditFundingInspectionProfile as consume,
  releaseApiCreditFundingInspectionProfile as release } from '../src/api-credit-funding-inspection-profile.js';
import { runApiCreditFundingInspectionOwner as runOwner } from '../src/api-credit-funding-inspection-owner.js';

const F = Object.freeze, cases = [], results = [];
const SPECIES = Object.getOwnPropertyDescriptor(Promise, Symbol.species), DEFINE = Object.defineProperty;
const STAGES = F(['before-open', 'after-open', 'before-first-checkpoint', 'after-first-checkpoint',
  'before-first-state', 'after-first-state', 'before-second-state', 'after-second-state',
  'before-last-checkpoint', 'after-last-checkpoint', 'before-close']);
let admission = null;
function check(id, run) { cases.push({ id, run }); }
function profile() {
  const f = retainedOriginalInputFixture(), packet = assemble(f.input, f.candidate, f.resourceUrl);
  const token = decode(canonicalJson({ fundingInspectionVersion: 1,
    originalPayment: { resourceUrl: f.resourceUrl, serializedCheckpoint: packet.serializedCheckpoint, expectedPins: packet.expectedPins },
    payerOptions: { databasePath: '/synthetic/funding-guard/payer.sqlite', allowedRoot: '/synthetic/funding-guard',
      custodyPolicy: { policyVersion: 1, serviceResourceUrl: new URL(f.resourceUrl).origin + '/service-credit/v1/execute', maxRequests: 128 } } }));
  try { return consume(token); } finally { release(token); }
}
function fixture(options = {}) {
  const p = profile(), checkpoint = restoreOriginalPaymentCheckpoint(p.serializedCheckpoint, p.expectedPins);
  const s = { opened: 0, stateReads: 0, checkpointReads: 0, closes: 0, views: 0, closed: false,
    guardCalls: 0, faultEntered: false, thenReads: 0, proxyTraps: 0, speciesReads: 0, trace: [], guards: [] };
  const store = F({ declaredExistingStore: true });
  let settle;
  const receipt = new Promise(resolve => { settle = resolve; });
  function counts() { return [s.opened, s.stateReads, s.checkpointReads, s.views, s.closes]; }
  function port(name) { s.trace.push(name); }
  const ports = F({
    openExisting: F(value => { assert.equal(value, p); port('OPEN'); s.opened++; return store; }),
    readState: F(value => {
      assert.equal(value, store); port('STATE'); s.stateReads++;
      return F({ revision: 3, status: 'OUTCOME_UNKNOWN', ambiguityLatched: true, resourceUrl: p.fundingResourceUrl,
        challengeHeader: p.challengeHeader, paymentHeader: p.paymentHeader,
        paymentRequired: F({}), paymentPayload: F({}), requirement: F({}) });
    }),
    readCheckpoint: F((value, pins) => {
      assert.equal(value, store); assert.equal(pins, p.expectedPins); port('CHECKPOINT'); s.checkpointReads++; return checkpoint;
    }),
    inspectStore: F(value => {
      assert.equal(value, store); port('VIEW'); s.views++;
      return F({ payerFundingInspectionLifecycleVersion: 1, active: false, quarantined: false, closed: s.closed, databaseOpen: !s.closed });
    }),
    closeStore: F(value => { assert.equal(value, store); port('CLOSE'); s.closes++; s.closed = true; }),
  });
  const guard = F(function requireOpening() {
    assert.equal(arguments.length, 0); s.guardCalls++;
    const point = F({ ordinal: s.guardCalls, counts: F(counts()), trace: F([...s.trace]) }); s.guards.push(point);
    if (s.guardCalls !== options.at) return undefined;
    s.faultEntered = true;
    if (options.kind === 'THROW') throw new TypeError('DECLARED_OPENING_REVOKED');
    if (options.kind === 'FALSE') return false;
    if (options.kind === 'NULL') return null;
    if (options.kind === 'THENABLE') return F(DEFINE({}, 'then', { enumerable: true,
      get() { s.thenReads++; throw new Error('OPAQUE_GUARD_THEN_READ'); } }));
    if (options.kind === 'PROXY') return new Proxy({}, {
      get() { s.proxyTraps++; throw new Error('OPAQUE_GUARD_GET'); },
      getPrototypeOf() { s.proxyTraps++; throw new Error('OPAQUE_GUARD_PROTOTYPE'); },
      ownKeys() { s.proxyTraps++; throw new Error('OPAQUE_GUARD_KEYS'); },
    });
    if (options.kind === 'SPECIES') DEFINE(Promise, Symbol.species, { ...SPECIES,
      get: F(() => { s.speciesReads++; return Promise; }) });
    else assert.equal(options.kind, 'PROMISE');
    return receipt;
  });
  const configuration = F({ profile: p, ports, requireOpening: guard });
  return { p, s, run: () => runOwner(configuration), settle, counts };
}
function powerless(value) {
  assert.equal(value.authority, 'NONE'); assert.equal(value.spendingReservation, 'UNCHANGED');
  assert.equal(value.localStatus, 'OUTCOME_UNKNOWN'); assert.equal(value.ambiguityLatched, true);
  assert.equal(value.fundingAcknowledgement, 'NOT_ESTABLISHED'); assert.equal(value.nativeResourceRelease, 'NOT_ESTABLISHED');
  for (const key of ['mayStartPayment', 'maySignPayment', 'maySubmitFunding', 'mayDispatchService', 'mayActivateGrant']) assert.equal(value[key], false);
}
function oneUse(f) {
  const counts = f.counts(), guards = f.s.guardCalls;
  assert.throws(f.run); assert.deepEqual(f.counts(), counts); assert.equal(f.s.guardCalls, guards);
}

check('funding-guard-clean-void-permission-preserves-the-original-and-records-read-boundaries', () => {
  const f = fixture(), value = f.run(); powerless(value);
  assert.equal(value.serializedCheckpoint, f.p.serializedCheckpoint);
  assert.deepEqual(f.counts(), [1, 2, 2, 3, 1]); assert.equal(f.s.closed, true);
  assert.equal(f.s.guards.length, STAGES.length);
  assert.deepEqual(f.s.trace, ['OPEN', 'VIEW', 'CHECKPOINT', 'STATE', 'STATE', 'CHECKPOINT', 'VIEW', 'CLOSE', 'VIEW']);
  admission = F(Object.fromEntries(STAGES.map((name, i) => [name, f.s.guards[i]])));
  oneUse(f);
});
check('funding-guard-synchronous-revocation-before-open-never-enters-the-store', () => {
  const f = fixture({ at: admission['before-open'].ordinal, kind: 'THROW' });
  assert.throws(f.run); assert.equal(f.s.faultEntered, true); assert.deepEqual(f.counts(), [0, 0, 0, 0, 0]); oneUse(f);
});
check('funding-guard-synchronous-revocation-after-a-returned-read-still-closes-the-known-owner-once', () => {
  const f = fixture({ at: admission['after-first-state'].ordinal, kind: 'THROW' });
  assert.throws(f.run); assert.equal(f.s.faultEntered, true);
  assert.deepEqual(f.counts(), [1, 1, 1, 3, 1]); assert.equal(f.s.closed, true); oneUse(f);
});
async function unknown(stage, kind) {
  const point = admission[stage], f = fixture({ at: point.ordinal, kind });
  try { assert.throws(f.run); } finally { if (kind === 'SPECIES') DEFINE(Promise, Symbol.species, SPECIES); }
  assert.equal(f.s.faultEntered, true); assert.equal(f.s.guardCalls, point.ordinal);
  // No opener, read, inspection or competing stop follows the unjoined guard.
  assert.deepEqual(f.counts(), point.counts); assert.deepEqual(f.s.trace, point.trace);
  assert.equal(f.s.closes, 0); assert.equal(f.s.thenReads, 0); assert.equal(f.s.proxyTraps, 0); assert.equal(f.s.speciesReads, 0);
  f.settle(undefined); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(f.counts(), point.counts); assert.deepEqual(f.s.trace, point.trace); oneUse(f);
}
for (const stage of STAGES) check('funding-guard-unjoined-receipt-stops-' + stage, () => unknown(stage, 'PROMISE'));
for (const kind of ['FALSE', 'NULL', 'THENABLE', 'PROXY']) {
  check('funding-guard-nonvoid-' + kind.toLowerCase() + '-does-not-authorize-opening', () => unknown('before-open', kind));
}
// The sixteenth retained unknown frame is last; the existing bound is unchanged.
check('funding-guard-unknown-receipt-does-not-enter-an-altered-promise-species', () => unknown('before-open', 'SPECIES'));

let active = null, reported = false;
function report() {
  if (reported) return; reported = true;
  const failed = results.filter(row => row.status !== 'PASS').length;
  process.stdout.write(JSON.stringify({ qualification: 'G2_FUNDING_INSPECTION_GUARD_RECEIPTS_DATA',
    passed: results.length - failed, failed, cases: results, retainedUnknownFrameLimit: 16,
    storeGuardAndLifecyclePorts: 'DECLARED_MEMORY_ONLY', nativeExecutions: 0, SDK: 0, SQLite: 0,
    keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0,
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
  catch (value) { results.push({ id, status: 'FAIL', errorType: value?.name ?? 'UNKNOWN' }); }
  active = null;
}
process.off('beforeExit', unsettled); report();
