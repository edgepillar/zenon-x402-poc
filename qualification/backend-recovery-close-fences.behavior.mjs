// Actual shared recovery core; declared private child capabilities only.
// No native factory, SDK, SQL, proof/signature production, transport or nonce.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceCreditCustodiedBackendRecoveryCore as CREATE } from '../src/service-credit-custodied-backend-recovery-core.js';
import { captureOriginalServiceRequestCustody as CAPTURE, captureOriginalServiceDispatchIntent as INTENT } from '../src/service-credit-original-request-custody-contract.js';
import { captureOriginalPaymentCheckpoint as CHECKPOINT, encodeOriginalPaymentCheckpoint as ENCODE, restoreOriginalPaymentCheckpoint as RESTORE } from '../src/service-credit-pilot-original-payment-checkpoint.js';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_BACKEND_RECOVERY_CLOSE_FENCES, 'builtin-only-captured-capabilities');
const PREFIX = 'SERVICE_CREDIT_CUSTODIED_BACKEND_RECOVERY_';
const HEADER = 'ServiceCredit declared-proof-no-cryptography';
const URL = 'https://recovery-close.invalid';
const KEY = Object.freeze({ grantId: 'grant:one', requestId: 'request:one' });
const REQUIRE = Object.freeze({ ...KEY, requestId: 'payment:one', paymentHash: 'a'.repeat(64), origin: URL, contextId: 'context:one' });
const b64 = x => Buffer.from(x).toString('base64');
function freeze(x) {
  if (x && typeof x === 'object') { for (const v of Object.values(x)) freeze(v); Object.freeze(x); }
  return x;
}
function fixture({ submit = false, response = false, checkpoint = false } = {}) {
  const request = { modelVersion: 1, ...KEY, method: 'POST', routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    selectedContentType: 'application/json', maxCostUnits: 1 };
  const original = CAPTURE({ originalRequestJson: JSON.stringify(request), originalBodyBase64: '',
    serviceResourceUrl: URL + '/service-credit/v1/execute' },
    { fundingResourceUrl: URL + '/funding', paymentHash: 'a'.repeat(64), network: 'zenon:mock' });
  const captured = CHECKPOINT({ binding: { requestId: REQUIRE.requestId, paymentHash: REQUIRE.paymentHash, origin: URL, contextId: REQUIRE.contextId },
    originalBytes: { requestBody: '', paymentPayload: b64('declared payment bytes'),
      paymentRequirements: b64('declared requirement bytes'), context: b64('declared context bytes') } });
  const f = { localReads: 0, backendReads: 0, checkpointReads: 0, submits: 0, localCloses: 0, backendCloses: 0,
    readHook: null, backendHook: null, checkpointHook: null, snapshotHook: null, active: false, state: null, observed: null };
  f.serialized = ENCODE(captured.checkpoint); f.pins = captured.pins; f.originalCheckpoint = captured.checkpoint;
  f.state = freeze({ original, funding: { revision: 1, status: 'BOUND', ambiguityLatched: false },
    uncertainty: { custody: false, submission: false, undrained: false, declaredFundingAmbiguitySeen: false },
    dispatchIntent: null, responseObservation: null, responseStatus: 'NOT_RECORDED' });
  f.observed = freeze({ status: 'CACHED_SUCCESS', cachedResult: { resultCode: 'declared-result' } });
  f.closePromise = Promise.resolve(undefined);
  f.client = {
    readOriginalRecoveryState(key) { f.localReads++; assert.deepEqual(key, KEY); if (f.readHook) f.readHook(f.localReads); return f.state; },
    close(...args) { f.localCloses++; if (args.length) throw new TypeError('CHILD_BAD_CLOSE_ARITY'); return f.closePromise; },
    snapshot() { if (f.snapshotHook) f.snapshotHook(); return { client: { owner: { active: f.active } } }; },
    readOriginal: Object.freeze(() => original),
    readOriginalRecoveryKeys: Object.freeze(() => Object.freeze([KEY])),
    submitOriginal(input) { f.submits++; return Promise.resolve(input); },
    readOriginalPaymentCheckpoint(pins) {
      f.checkpointReads++; const restored = RESTORE(f.serialized, pins);
      if (f.checkpointHook) f.checkpointHook(f.checkpointReads);
      return restored;
    },
  };
  f.backend = {
    readExactOriginal(envelope, expected) {
      f.backendReads++; assert.deepEqual(envelope, { url: '/service-credit/v1/execute', method: 'POST',
        rawHeaders: ['Authorization', HEADER] }); assert.ok(Object.isFrozen(envelope.rawHeaders)); assert.deepEqual(expected, request);
      if (f.backendHook) f.backendHook(); return f.observed;
    },
    close() { f.backendCloses++; },
  };
  f.connection = CREATE(f.client, f.backend, KEY.grantId, 'BOTH_BORROWED', submit, response, checkpoint);
  f.read = () => checkpoint ? f.connection.readOriginalBackendRecoveryState(KEY, HEADER, f.pins)
    : f.connection.readOriginalBackendRecoveryState(KEY, HEADER);
  f.change = change => { f.state = freeze({ ...f.state, ...change }); };
  return f;
}
function noAuthority(view) {
  assert.equal(view.authority, 'NONE'); assert.equal(view.currentAuthority, 'NOT_ESTABLISHED');
  assert.equal(view.serviceDelivery, 'NOT_ESTABLISHED'); assert.equal(view.nextStep, 'RECONCILIATION_REQUIRED');
  for (const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed']) assert.equal(view[k], false);
  assert.ok(!JSON.stringify(view).includes(HEADER)); assert.ok(Object.isFrozen(view));
}
function errorCode(code) { return { code: PREFIX + code }; }

test('V3 matched recovery keeps two fresh local reads and one exact backend query', () => {
  const f = fixture(), v = f.read(); assert.equal(v.status, 'CACHED_SUCCESS'); noAuthority(v);
  assert.equal(f.localReads, 2); assert.equal(f.backendReads, 1); assert.equal(f.checkpointReads, 0); assert.equal(f.submits, 0);
});
test('V5 matched recovery retains the complete response observation', () => {
  const f = fixture({ response: true }); f.change({ responseObservation: { status: 'DECLARED', httpStatus: 200 }, responseStatus: 'RESPONSE_RECORDED' });
  const v = f.read(); assert.equal(v.local.responseStatus, 'RESPONSE_RECORDED'); assert.equal(v.local.responseObservation.httpStatus, 200); noAuthority(v);
});
test('V6 matched recovery performs two independent checkpoint reads', () => {
  const f = fixture({ response: true, checkpoint: true }), v = f.read(); noAuthority(v);
  assert.equal(f.checkpointReads, 2); assert.equal(f.localReads, 2); assert.equal(f.backendReads, 1);
});
test('missing local original never invokes the backend', () => {
  const f = fixture(); f.state = null; assert.equal(f.read().status, 'CLIENT_ORIGINAL_NOT_RECORDED');
  assert.equal(f.localReads, 1); assert.equal(f.backendReads, 0);
});
test('foreign selected grant is rejected before child reads', () => {
  const f = fixture(); assert.throws(() => f.connection.readOriginalBackendRecoveryState({ ...KEY, grantId: 'foreign' }, HEADER), errorCode('FOREIGN_GRANT'));
  assert.equal(f.localReads + f.backendReads, 0);
});
test('empty oversized and non-string proof values never enter child reads', () => {
  const f = fixture(); for (const header of ['', 'x'.repeat(1025), null, 5, '\u20ac'.repeat(400)])
    assert.throws(() => f.connection.readOriginalBackendRecoveryState(KEY, header), errorCode('INVALID_INPUT'));
  assert.equal(f.localReads + f.backendReads, 0);
});
test('wrong read arities and missing independent V6 pins are refused', () => {
  const f = fixture({ checkpoint: true });
  for (const args of [[KEY, HEADER], [KEY, HEADER, undefined], [KEY, HEADER, f.pins, 1]])
    assert.throws(() => f.connection.readOriginalBackendRecoveryState(...args), errorCode('INVALID_INPUT'));
  assert.equal(f.checkpointReads + f.localReads + f.backendReads, 0);
});
test('changed independent V6 pins are refused without backend lookup', () => {
  const f = fixture({ checkpoint: true });
  assert.throws(() => f.connection.readOriginalBackendRecoveryState(KEY, HEADER, { ...f.pins, binding: { ...f.pins.binding, contextId: 'other' } }));
  assert.equal(f.localReads + f.backendReads, 0); assert.equal(f.connection.snapshot().unavailable, true);
});
test('changing local funding revision latches the connection unavailable', () => {
  const f = fixture(); f.backendHook = () => f.change({ funding: { ...f.state.funding, revision: 2 } });
  assert.throws(f.read, errorCode('CLIENT_BINDING_CHANGED')); assert.throws(f.read, errorCode('UNAVAILABLE'));
  assert.equal(f.backendReads, 1);
});
test('changing original request bytes cannot pass the reread fence', () => {
  const f = fixture(); f.backendHook = () => f.change({ original: CAPTURE({
    originalRequestJson: f.state.original.originalRequestJson.replace('"maxCostUnits":1', '"maxCostUnits":2'),
    originalBodyBase64: '', serviceResourceUrl: URL+'/service-credit/v1/execute' },
    { fundingResourceUrl: URL+'/funding', paymentHash: 'a'.repeat(64), network: 'zenon:mock' }) });
  assert.throws(f.read, errorCode('CLIENT_BINDING_CHANGED'));
});
test('changing uncertainty during backend lookup preserves refusal', () => {
  const f = fixture(); f.backendHook = () => f.change({ uncertainty: { ...f.state.uncertainty, submission: true } });
  assert.throws(f.read, errorCode('CLIENT_BINDING_CHANGED'));
});
test('changing response observations during V5 lookup preserves refusal', () => {
  const f = fixture({ response: true }); f.backendHook = () => f.change({ responseObservation: { httpStatus: 200 } });
  assert.throws(f.read, errorCode('CLIENT_BINDING_CHANGED'));
});
test('changing response status during V5 lookup preserves refusal', () => {
  const f = fixture({ response: true }); f.backendHook = () => f.change({ responseStatus: 'OTHER' });
  assert.throws(f.read, errorCode('CLIENT_BINDING_CHANGED'));
});
test('an original dispatch intent keeps cached backend success under reconciliation', () => {
  const f = fixture(); f.change({ dispatchIntent: INTENT(f.state.original, { fundingRevision: 1,
    challengeDigest: 'sha256:'+'1'.repeat(64), paymentDigest: 'sha256:'+'2'.repeat(64),
    custodyPolicy: { policyVersion: 1, maxRequests: 8, serviceResourceUrl: URL+'/service-credit/v1/execute' } }) });
  const v = f.read(); assert.equal(v.status, 'CLIENT_RECONCILIATION_REQUIRED'); assert.equal(v.backend.status, 'CACHED_SUCCESS'); noAuthority(v);
});
test('each retained uncertainty flag keeps backend success powerless', () => {
  for (const field of ['custody','submission','undrained','declaredFundingAmbiguitySeen']) {
    const f = fixture(); f.change({ uncertainty: { ...f.state.uncertainty, [field]: true } });
    const v = f.read(); assert.equal(v.status, 'CLIENT_RECONCILIATION_REQUIRED'); noAuthority(v);
  }
});
test('unbound and ambiguity-latched funding require reconciliation', () => {
  for (const funding of [{ revision: 1, status: 'SUBMISSION_OUTCOME_UNKNOWN', ambiguityLatched: false },
    { revision: 1, status: 'BOUND', ambiguityLatched: true }]) {
    const f = fixture(); f.change({ funding }); assert.equal(f.read().status, 'CLIENT_RECONCILIATION_REQUIRED');
  }
});
test('backend absent and uncertain statuses are retained as declared observations', () => {
  for (const status of ['NOT_RECORDED','OUTCOME_UNKNOWN','NOT_INVOKED','RECONCILIATION_REQUIRED','ORIGINAL_BINDING_MISMATCH']) {
    const f = fixture(); f.observed = freeze({ status }); const v = f.read(); assert.equal(v.status, status); noAuthority(v);
  }
});
test('backend UNAVAILABLE and CLOSED latch this connection without replay', () => {
  for (const status of ['UNAVAILABLE','CLOSED']) {
    const f = fixture(); f.observed = freeze({ status }); assert.equal(f.read().status, status);
    assert.throws(f.read, errorCode('UNAVAILABLE')); assert.equal(f.backendReads, 1);
  }
});
test('a local read exception remains the original error and is never retried', () => {
  const f = fixture(), failure = new Error('declared-local-fault'); f.readHook = () => { throw failure; };
  assert.throws(f.read, e => e === failure); assert.throws(f.read, errorCode('UNAVAILABLE'));
  assert.equal(f.localReads, 1); assert.equal(f.backendReads, 0);
});
test('a backend exception latches refusal without exposing a new dispatch right', () => {
  const f = fixture(), failure = new Error('declared-backend-fault'); f.backendHook = () => { throw failure; };
  assert.throws(f.read, e => e === failure); assert.throws(f.read, errorCode('UNAVAILABLE')); assert.equal(f.submits, 0);
});
test('active submission returns BUSY without poisoning a later idle read', () => {
  const f = fixture({ submit: true }); f.active = true; assert.throws(f.read, errorCode('BUSY')); f.active = false;
  assert.equal(f.read().status, 'CACHED_SUCCESS'); assert.equal(f.connection.snapshot().unavailable, false);
});
test('an unobservable active state latches unavailable before local reads', () => {
  const f = fixture({ submit: true }); f.active = undefined; assert.throws(f.read, errorCode('UNAVAILABLE')); assert.equal(f.localReads, 0);
});
test('nested recovery reads are BUSY without poisoning the outer query', () => {
  const f = fixture(); f.backendHook = () => assert.throws(f.read, errorCode('BUSY'));
  assert.equal(f.read().status, 'CACHED_SUCCESS'); assert.equal(f.backendReads, 1); assert.equal(f.connection.snapshot().unavailable, false);
});
test('closing during the first local read prevents backend entry', () => {
  const f = fixture(); f.readHook = () => f.connection.close();
  assert.throws(f.read, errorCode('CLOSED')); assert.equal(f.backendReads, 0);
});
test('closing during backend lookup prevents the second local read', () => {
  const f = fixture(); f.backendHook = () => f.connection.close();
  assert.throws(f.read, errorCode('CLOSED')); assert.equal(f.localReads, 1);
});
test('closed connection fences future reads and exact close promise identity remains', async () => {
  const f = fixture(); const p = f.connection.close(); assert.equal(p, f.closePromise); assert.equal(f.connection.close(), p);
  assert.throws(f.read, errorCode('CLOSED')); assert.equal(f.backendCloses, 1); assert.equal(f.localCloses, 2); await p;
});
test('the borrowed child methods are captured once before mutation', () => {
  const f = fixture(); f.client.readOriginalRecoveryState = () => { throw Error('MUTATED'); }; f.backend.readExactOriginal = () => { throw Error('MUTATED'); };
  assert.equal(f.read().status, 'CACHED_SUCCESS');
});
test('no-dispatch connection exposes no submit escape hatch', () => {
  const f = fixture(); assert.equal(Object.hasOwn(f.connection, 'submitOriginal'), false); assert.equal(f.submits, 0);
});
test('explicit submit returns the captured child promise without a new payment', async () => {
  const f = fixture({ submit: true }), payload = { declared: true }; assert.equal(await f.connection.submitOriginal(payload), payload);
  assert.equal(f.submits, 1); assert.equal(f.backendReads, 0);
});
test('backend read failure fences the separate explicit submit capability', async () => {
  const f = fixture({ submit: true }); f.observed = freeze({ status: 'UNAVAILABLE' }); f.read();
  await assert.rejects(f.connection.submitOriginal({}), errorCode('UNAVAILABLE')); assert.equal(f.submits, 0);
});
test('standalone checkpoint input arity and absence on older selections remain', () => {
  const old = fixture(); assert.equal(Object.hasOwn(old.connection, 'readOriginalPaymentCheckpoint'), false);
  const f = fixture({ checkpoint: true }); assert.throws(() => f.connection.readOriginalPaymentCheckpoint(), errorCode('INVALID_INPUT'));
});
test('closing inside the first V6 checkpoint must fence the first local read', () => {
  const f = fixture({ checkpoint: true }); f.checkpointHook = () => f.connection.close();
  assert.throws(f.read, errorCode('CLOSED')); assert.equal(f.localReads, 0); assert.equal(f.backendReads, 0);
});
test('closing inside the active-state snapshot must fence later recovery reads', () => {
  const f = fixture({ submit: true }); f.snapshotHook = () => f.connection.close();
  assert.throws(f.read, errorCode('CLOSED')); assert.equal(f.localReads, 0); assert.equal(f.backendReads, 0);
});
test('standalone checkpoint must not escape when its child closes the connection', () => {
  const f = fixture({ checkpoint: true }); f.checkpointHook = () => f.connection.close();
  assert.throws(() => f.connection.readOriginalPaymentCheckpoint(f.pins), errorCode('CLOSED')); assert.equal(f.backendReads, 0);
});
test('standalone checkpoint holds the recovery-read lock during child entry', () => {
  const f = fixture({ checkpoint: true }); f.checkpointHook = () => {
    f.checkpointHook = null; assert.throws(f.read, errorCode('BUSY'));
  };
  const p = f.connection.readOriginalPaymentCheckpoint(f.pins); assert.deepEqual(p, f.originalCheckpoint);
  assert.equal(f.localReads + f.backendReads, 0); assert.equal(f.connection.snapshot().unavailable, false);
});
