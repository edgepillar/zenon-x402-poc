/*
 * SOURCE-ONLY, NOT PARSED OR EXECUTED. This is a NEW native scope, not the
 * earlier two-case preparation fixture or consumed local HTTPS approval.
 * Intended: real SDK preflight, actual preparation/payer/client, eight new
 * private SQLite files, seven independent pin files, one in-memory synthetic
 * key and seven signatures. Three fetch callbacks are synthetic, NOT sockets,
 * real HTTP/HTTPS, payment publication, a provider, grant or delivered service.
 * Exact source/dependency/launcher, capacity and matching scope review required.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createOriginalFundingSubmissionFixtureHarness } from './dynamic-plasma-original-funding-submission.fixture.draft.mjs';
import { createZenonDynamicPlasmaOriginalFundingSubmission as APP } from '../src/zenon/dynamic-plasma-original-funding-submission.js';
import {
  createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6 as CREATE_V6,
  openZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6 as OPEN_V6,
  createZenonFundingPayerRecoveryResponseObservationSqliteStoreV5 as CREATE_V5,
} from '../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js';
import {
  encodeOriginalPaymentCheckpoint, restoreOriginalPaymentCheckpoint,
} from '../src/service-credit-pilot-original-payment-checkpoint.js';

assert.equal(process.argv.length, 3);
const h = createOriginalFundingSubmissionFixtureHarness(process.argv[2]);
const OPTIONS = { timeout: 5000, concurrency: false };
const copy = value => JSON.parse(JSON.stringify(value));
const turn = () => new Promise(resolve => setImmediate(resolve));
function rejected(kind) {
  return problem => {
    const code = 'zenon_dynamic_plasma_original_funding_submission_' + kind;
    assert.ok(problem instanceof TypeError && Object.isFrozen(problem));
    assert.equal(problem.code, code); assert.equal(problem.message, code);
    assert.equal(problem.stack, 'TypeError: ' + code); return true;
  };
}
function assertOriginal(store, pins, packet, status, revision, ambiguous = false) {
  const row = store.load();
  assert.equal(row.status, status); assert.equal(row.revision, revision);
  assert.equal(row.ambiguityLatched, ambiguous);
  assert.equal(row.challengeHeader, packet.pair.challenge.paymentRequiredHeader);
  assert.equal(row.paymentHeader, packet.pair.paymentSignatureHeader);
  assert.equal(encodeOriginalPaymentCheckpoint(store.getOriginalPaymentCheckpoint(pins)), packet.serializedCheckpoint);
}
function ack(f) {
  const text = 'BOUND';
  const headers = new Headers({ 'content-type': 'text/plain; charset=utf-8',
    'content-length': String(Buffer.byteLength(text)), 'cache-control': 'private, no-store, max-age=0',
    vary: 'PAYMENT-SIGNATURE', 'x-content-type-options': 'nosniff' });
  const body = new Response(text, { status: 202, headers }).body;
  return { url: f.storeOptions.resourceUrl, redirected: false, status: 202, headers, body };
}
function transport(f, store, mode) {
  assert.ok(['bound', 'loss', 'hold'].includes(mode));
  let calls = 0, failure = null, releaseResponse = null, released = false;
  const fetchImpl = function fetchImpl(url, options) {
    h.note('fetchCalls');
    try {
      assert.equal(this, undefined); assert.equal(arguments.length, 2); assert.equal(++calls, 1);
      assert.equal(url, f.storeOptions.resourceUrl); assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'manual'); assert.equal(options.credentials, 'omit');
      assert.equal(options.cache, 'no-store'); assert.equal(Object.hasOwn(options, 'body'), false);
      assert.ok(Object.isFrozen(options) && Object.isFrozen(options.headers));
      assert.equal(options.headers['Content-Length'], '0');
      assert.equal(options.headers['PAYMENT-SIGNATURE'], f.packet.pair.paymentSignatureHeader);
      assert.deepEqual(Object.keys(options.headers).sort(), ['Content-Length', 'PAYMENT-SIGNATURE']);
      assertOriginal(store, f.pins, f.packet, 'ATTEMPT_FENCED', 2);
    } catch (problem) { failure = problem; throw problem; }
    if (mode === 'loss') return Promise.reject(new Error('Synthetic response loss'));
    if (mode === 'hold') return new Promise(resolve => { releaseResponse = resolve; });
    return Promise.resolve(ack(f));
  };
  return { fetchImpl, calls: () => calls, failure: () => failure,
    release() {
      if (releaseResponse !== null && !released) {
        released = true; h.note('transportReleases'); releaseResponse(ack(f));
      }
    } };
}
async function prepared(owner, f, store, mutateAfterCall = false) {
  const original = copy(f.input), pending = owner.prepareOriginalFunding(f.input);
  if (mutateAfterCall) {
    f.input.originalRequest.contextBase64 = Buffer.from('mutated-after-call').toString('base64');
    f.input.originalRequest.requestId = 'mutated-after-call';
  }
  await assert.rejects(owner.prepareOriginalFunding(f.input), rejected('operation_unavailable'));
  const result = await pending;
  assert.equal(result.phase, 'AWAITING_INDEPENDENT_PINS'); assert.equal(store.load(), null);
  assert.equal(result.preflight, 'ACTUAL_LOCAL_PREFLIGHT_RETURNED');
  f.packet = result.packet;
  const restored = restoreOriginalPaymentCheckpoint(f.packet.serializedCheckpoint, f.packet.expectedPins);
  assert.equal(restored.binding.requestId, original.originalRequest.requestId);
  assert.equal(restored.originalBytes.context, original.originalRequest.contextBase64);
  assert.equal(restored.originalBytes.paymentRequirements, original.challenge.paymentRequiredHeader);
  assert.equal(f.packet.transactionHash, f.unsigned.hash); assert.equal(f.signatures, 1);
  assert.deepEqual(h.snapshot(f), [1, 1, 15, 30, 30, 1]);
  f.pins = h.retainPins(f.label, f.packet.expectedPins);
  return f.packet;
}
async function committed(owner, f, store) {
  const result = await owner.commitOriginalFunding({ expectedPins: f.pins });
  assert.equal(result.phase, 'LOCAL_STORE_READBACK_MATCHED');
  assert.equal(result.publication, 'NOT_PERFORMED');
  assertOriginal(store, f.pins, f.packet, 'PREPARED', 1);
}
function inspection(owner, f, phase) {
  const value = owner.inspectOriginalFunding();
  assert.equal(value.phase, phase); assert.equal(value.preparation.packet, f.packet);
  assert.equal(value.preparation.candidate.candidate.accountBlock.hash, f.packet.transactionHash);
  assert.equal(value.preparation.candidate.signatureValidation, 'NOT_PERFORMED');
  assert.equal(value.authority, 'NONE'); assert.equal(value.automaticReplay, false);
  assert.equal(value.transportDrain, 'NOT_EXPOSED_BY_THIS_VIEW');
  return value;
}
function reopenedOriginal(f, status, revision, ambiguous = false) {
  const { testHooks, ...options } = f.storeOptions;
  const store = OPEN_V6(options); // Normal reopen advances owner_epoch; not read-only/crash proof.
  try { assertOriginal(store, h.readPins(f.label), f.packet, status, revision, ambiguous); }
  finally { store.close(); }
}
async function finish(owner, store, wire) {
  wire?.release(); // Never leave the deliberately held synthetic Promise unresolved on assertion failure.
  if (owner !== undefined) await owner.close(); else store.close();
}

try {
await test('actual funding composition captures originals synchronously and posts once only after V6 and independent pins', OPTIONS, async () => {
  const f = h.fixture('bound'); f.label = 'bound';
  const store = CREATE_V6(f.storeOptions), wire = transport(f, store, 'bound'); let owner;
  try {
    owner = APP(f.ownerOptions(store, wire.fetchImpl));
    assert.equal(Object.hasOwn(owner, 'replayUnknown'), false);
    assert.throws(() => APP(f.ownerOptions(store, wire.fetchImpl)), rejected('configuration_rejected'));
    await prepared(owner, f, store, true); assert.equal(wire.calls(), 0);
    await committed(owner, f, store); assert.equal(wire.calls(), 0);
    const wrong = copy(f.pins); wrong.binding.contextId = 'foreign-context';
    const before = h.snapshot(f);
    await assert.rejects(owner.submitOriginalFunding({ expectedPins: wrong }), problem => {
      assert.ok(problem instanceof TypeError && Object.isFrozen(problem));
      assert.equal(problem.code, 'zenon_dynamic_plasma_original_funding_data_rejected'); return true;
    });
    assert.equal(owner.inspectOriginalFunding().submissionAttempts, 0);
    assertOriginal(store, f.pins, f.packet, 'PREPARED', 1); assert.equal(wire.calls(), 0);
    const result = await owner.submitOriginalFunding({ expectedPins: h.readPins('bound') });
    assert.equal(result.phase, 'FUNDING_INTAKE_BOUND'); assert.equal(result.fundingIntakeStatus, 'BOUND');
    for (const field of ['chainPublication', 'inclusion', 'grant', 'serviceDelivery'])
      assert.equal(result[field], 'NOT_ESTABLISHED');
    assert.equal(wire.calls(), 1); assert.equal(wire.failure(), null);
    assertOriginal(store, f.pins, f.packet, 'BOUND', 3); assert.deepEqual(h.snapshot(f), before);
    await assert.rejects(owner.submitOriginalFunding({ expectedPins: f.pins }), rejected('submission_unavailable'));
    await assert.rejects(owner.commitOriginalFunding({ expectedPins: f.pins }), rejected('commit_unavailable'));
    const closed = owner.close(); assert.equal(closed, owner.close()); await closed;
    assert.equal(inspection(owner, f, 'FUNDING_INTAKE_BOUND').lifecycle, 'CLOSED');
    reopenedOriginal(f, 'BOUND', 3);
  } finally { await finish(owner, store, wire); }
});
await test('a lost funding response preserves one original unknown outcome and no replay after normal close/reopen', OPTIONS, async () => {
  const f = h.fixture('response-loss'); f.label = 'response-loss';
  const store = CREATE_V6(f.storeOptions), wire = transport(f, store, 'loss'); let owner;
  try {
    owner = APP(f.ownerOptions(store, wire.fetchImpl)); await prepared(owner, f, store); await committed(owner, f, store);
    const before = h.snapshot(f), result = await owner.submitOriginalFunding({ expectedPins: f.pins });
    assert.equal(result.phase, 'SUBMISSION_OUTCOME_UNKNOWN');
    assert.equal(wire.calls(), 1); assert.equal(wire.failure(), null);
    assertOriginal(store, f.pins, f.packet, 'OUTCOME_UNKNOWN', 3, true);
    await assert.rejects(owner.submitOriginalFunding({ expectedPins: f.pins }), rejected('submission_unavailable'));
    await assert.rejects(owner.prepareOriginalFunding(f.input), rejected('prepare_unavailable'));
    assert.deepEqual(h.snapshot(f), before); await owner.close();
    inspection(owner, f, 'SUBMISSION_OUTCOME_UNKNOWN'); reopenedOriginal(f, 'OUTCOME_UNKNOWN', 3, true);
  } finally { await finish(owner, store, wire); }
});
await test('a real V6 commit-before-return loss blocks funding submission and retains the original signed packet', OPTIONS, async () => {
  const f = h.fixture('commit-loss'); f.label = 'commit-loss';
  f.storeOptions.testHooks = { afterCommit(name) {
    if (name === 'prepareWithOriginalPaymentCheckpoint') { h.note('commitLossHooks'); throw new Error('Synthetic committed return loss'); }
  } };
  const store = CREATE_V6(f.storeOptions), wire = transport(f, store, 'bound'); let owner;
  try {
    owner = APP(f.ownerOptions(store, wire.fetchImpl)); await prepared(owner, f, store);
    const before = h.snapshot(f);
    await assert.rejects(owner.commitOriginalFunding({ expectedPins: f.pins }), rejected('commit_unknown_or_refused'));
    const held = inspection(owner, f, 'COMMIT_OUTCOME_UNKNOWN_OR_REFUSED');
    assert.equal(held.preparation.phase, 'COMMIT_OUTCOME_UNKNOWN');
    await assert.rejects(owner.submitOriginalFunding({ expectedPins: f.pins }), rejected('submission_unavailable'));
    assert.equal(wire.calls(), 0); assert.deepEqual(h.snapshot(f), before);
    await owner.close(); reopenedOriginal(f, 'PREPARED', 1);
    inspection(owner, f, 'COMMIT_OUTCOME_UNKNOWN_OR_REFUSED');
  } finally { await finish(owner, store, wire); }
});
await test('a genuine pre-existing attempt fence refuses submission before transport and does not learn new originals', OPTIONS, async () => {
  const f = h.fixture('state-conflict'); f.label = 'state-conflict';
  const store = CREATE_V6(f.storeOptions), wire = transport(f, store, 'bound'); let owner;
  try {
    owner = APP(f.ownerOptions(store, wire.fetchImpl)); await prepared(owner, f, store); await committed(owner, f, store);
    store.fenceAttempt('PREPARED'); // Deliberate native state conflict in this NEW fixture only.
    const before = h.snapshot(f);
    await assert.rejects(owner.submitOriginalFunding({ expectedPins: f.pins }), rejected('submission_held'));
    const held = inspection(owner, f, 'HELD_BEFORE_SUBMISSION'); assert.equal(held.submissionEntered, false);
    assert.equal(wire.calls(), 0); assert.deepEqual(h.snapshot(f), before);
    assertOriginal(store, f.pins, f.packet, 'ATTEMPT_FENCED', 2);
    await owner.close(); reopenedOriginal(f, 'ATTEMPT_FENCED', 2);
  } finally { await finish(owner, store, wire); }
});
await test('reentrant close during the actual recovery transaction sees the pending owner and prevents submission entry', OPTIONS, async () => {
  const f = h.fixture('reentrant-close'); f.label = 'reentrant-close';
  let owner, closing, hookFailure = null;
  f.storeOptions.testHooks = { beforeCommit(name) {
    if (name === 'recoverAfterRestart') {
      h.note('recoveryCloseHooks');
      try {
        assert.equal(owner.inspectOriginalFunding().publicOperationActive, true);
        closing = owner.close(); assert.equal(closing, owner.close());
        assert.equal(owner.inspectOriginalFunding().lifecycle, 'CLOSING');
      } catch (problem) { hookFailure = problem; throw problem; }
    }
  } };
  const store = CREATE_V6(f.storeOptions), wire = transport(f, store, 'bound');
  try {
    owner = APP(f.ownerOptions(store, wire.fetchImpl)); await prepared(owner, f, store); await committed(owner, f, store);
    await assert.rejects(owner.submitOriginalFunding({ expectedPins: f.pins }), rejected('submission_held'));
    assert.equal(hookFailure, null); assert.ok(closing instanceof Promise); await closing;
    const held = inspection(owner, f, 'HELD_BEFORE_SUBMISSION');
    assert.equal(held.submissionEntered, false); assert.equal(held.lifecycle, 'CLOSED');
    assert.equal(wire.calls(), 0); reopenedOriginal(f, 'PREPARED', 1);
  } finally { await finish(owner, store, wire); }
});
await test('deadline uncertainty remains unknown while the synthetic transport holds close and after a late BOUND result', OPTIONS, async () => {
  const f = h.fixture('undrained'); f.label = 'undrained';
  const store = CREATE_V6(f.storeOptions), wire = transport(f, store, 'hold'); let owner;
  try {
    owner = APP(f.ownerOptions(store, wire.fetchImpl, 25)); await prepared(owner, f, store); await committed(owner, f, store);
    const result = await owner.submitOriginalFunding({ expectedPins: f.pins });
    assert.equal(result.phase, 'SUBMISSION_OUTCOME_UNKNOWN');
    assert.equal(wire.calls(), 1); assert.equal(wire.failure(), null);
    assertOriginal(store, f.pins, f.packet, 'OUTCOME_UNKNOWN', 3, true);
    let settled = false; const closing = owner.close();
    closing.then(() => { settled = true; }, () => { settled = true; });
    await turn(); assert.equal(settled, false);
    assert.equal(inspection(owner, f, 'SUBMISSION_OUTCOME_UNKNOWN').publicOperationActive, false);
    wire.release(); await closing;
    inspection(owner, f, 'SUBMISSION_OUTCOME_UNKNOWN'); reopenedOriginal(f, 'OUTCOME_UNKNOWN', 3, true);
  } finally { await finish(owner, store, wire); }
});
await test('a genuine non-V6 store refuses checkpoint commit before any POST without discarding or replacing its signed candidate', OPTIONS, async () => {
  const f = h.fixture('non-v6'); f.label = 'non-v6';
  const store = CREATE_V5(f.storeOptions), wire = transport(f, store, 'bound'); let owner;
  try {
    owner = APP(f.ownerOptions(store, wire.fetchImpl)); await prepared(owner, f, store);
    await assert.rejects(owner.commitOriginalFunding({ expectedPins: f.pins }), rejected('commit_unknown_or_refused'));
    inspection(owner, f, 'COMMIT_OUTCOME_UNKNOWN_OR_REFUSED'); assert.equal(store.load(), null);
    await assert.rejects(owner.submitOriginalFunding({ expectedPins: f.pins }), rejected('submission_unavailable'));
    assert.equal(f.signatures, 1); assert.equal(wire.calls(), 0); await owner.close();
  } finally { await finish(owner, store, wire); }
});
await test('configuration refuses proxy, wrong-brand and shadowed stores or missing/proxy fetch without wallet or transport effects', OPTIONS, async () => {
  const f = h.fixture('configuration'), store = CREATE_V6(f.storeOptions), wire = transport(f, store, 'bound');
  try {
    const before = h.snapshot(f), base = f.ownerOptions(store, wire.fetchImpl); let traps = 0;
    const trapped = () => { traps++; throw new Error('Unexpected proxy inspection'); };
    const proxyStore = new Proxy(store, { get: trapped, getPrototypeOf: trapped,
      ownKeys: trapped, getOwnPropertyDescriptor: trapped });
    const proxyFetch = new Proxy(wire.fetchImpl, { apply() { traps++; throw new Error('Unexpected proxy call'); } });
    for (const changed of [{ ...base, fetchImpl: undefined }, { ...base, fetchImpl: proxyFetch },
      { ...base, store: proxyStore }, { ...base, store: Object.create(Object.getPrototypeOf(store)) }])
      assert.throws(() => APP(changed), rejected('configuration_rejected'));
    assert.equal(traps, 0); assert.equal(store.load(), null);
    Object.defineProperty(store, 'load', { value() { throw new Error('Shadow must never run'); } });
    assert.throws(() => APP(base), rejected('configuration_rejected'));
    assert.equal(wire.calls(), 0); assert.deepEqual(h.snapshot(f), before);
    assert.deepEqual(h.counts(), { fixtures: 8, addressCallbacks: 7, signatures: 7, accountReadCallbacks: 105,
      dpReadCallbacks: 420, materialHandoffs: 7, pinFilesWritten: 7, fetchCalls: 3,
      commitLossHooks: 1, recoveryCloseHooks: 1, transportReleases: 1, uniqueSignedHashes: 7 });
    process.stdout.write('# original-funding-submission-native-fixture ' + JSON.stringify(h.counts()) + '\n');
  } finally { store.close(); }
});
} finally { h.destroy(); } // Normal-exit best effort; not secure erasure or crash cleanup.
