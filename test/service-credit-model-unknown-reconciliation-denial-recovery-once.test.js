/*
 * Source-pinned actual in-memory model behavior regression.
 *
 * Twelve independent declared zenon:mock fixtures exercise malformed UNKNOWN
 * reconciliation, preserved holds/blockers and one explicit terminal recovery.
 * Privileged reconciliation is a caller-responsibility contract here. These
 * fixtures authenticate no actor/evidence and establish no real recovery,
 * payment, signing, SQL, SDK, durability, live or pilot authority.
 *
 * Existing source remains unchanged. No base test/helper import, fake model,
 * production monkeypatch, module reset, network/client route or automatic
 * completion/refund/payment is introduced. Both callbacks stay armed after
 * the UNKNOWN baseline. exportState/getRequest inspect without refreshing time.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

assert.equal(process.versions.node, '24.19.0');
const pins = [
  [
    '../src/service-credit-model.js',
    55461,
    '7ff7e3d88ab8c3b38a0073541533fbdb7a0d9f2be42f337ac35f6a3b05615c3a',
  ],
  [
    '../package.json',
    1413,
    '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5',
  ],
];
let packageText;
for (const [relative, bytes, sha256] of pins) {
  const raw = readFileSync(new URL(relative, import.meta.url));
  assert.equal(raw.length, bytes, 'complete source byte guard');
  assert.equal(createHash('sha256').update(raw).digest('hex'), sha256,
    'complete source SHA-256 guard');
  const text = raw.toString('utf8');
  assert.equal(/[^\x00-\x7f]/.test(text), false);
  assert.equal(text.includes('\0'), false);
  assert.ok(text.endsWith('\n'));
  if (relative === '../package.json') packageText = text;
}
const packageData = JSON.parse(packageText);
assert.equal(packageData.type, 'module');
assert.equal(packageData.engines.node, '>=24');
// Package declarations are DATA, not an SDK/runtime qualification.
const {
  GRANT_LIFECYCLE,
  InMemoryServiceCreditModel,
  REQUEST_STATE,
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
  ServiceCreditModelError,
} = await import('../src/service-credit-model.js');

const NOW = 2_000_000_000_000;
const SENSITIVE = 'declared-sensitive-callback-or-input-sentinel';
const MODES = Object.freeze(['NaN', 'throw']);

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function offer(overrides = {}) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.alpha',
    serviceId: 'service.lookup',
    resourceId: 'resource.lookup',
    resourceBinding: digest('e'),
    offerId: 'offer.standard',
    offerVersion: 1,
    costPolicyId: 'policy.fixed',
    fundingPolicyId: 'funding.fixed',
    fundingPolicyVersion: 1,
    ...overrides,
  };
}

function grant(overrides = {}) {
  const paymentIntent = overrides.paymentIntent ?? {};
  const transactionLabel = overrides.transactionId ?? 'transaction.public.1';
  const holderId = overrides.holderId ?? 'holder.public.1';
  const payer = overrides.payer ?? holderId;
  const {
    modelVersion: ignoredModelVersion,
    paymentIntent: ignoredPaymentIntent,
    holderId: ignoredHolderId,
    payer: ignoredPayer,
    ...rest
  } = overrides;

  return {
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    authorityProfileId: 'authority.mock.reference',
    authorityProfileVersion: 1,
    verifierVersion: 1,
    authorityRecordDigest: digest('d'),
    fundingPolicyId: 'funding.fixed',
    fundingPolicyVersion: 1,
    sourceSettlementId: 'settlement.public.1',
    transactionId: `mocktx:${createHash('sha256').update(transactionLabel).digest('hex')}`,
    providerId: 'provider.alpha',
    serviceId: 'service.lookup',
    resourceId: 'resource.lookup',
    resourceBinding: digest('e'),
    offerId: 'offer.standard',
    offerVersion: 1,
    holderId,
    capabilityCommitment: digest('a'),
    totalUnits: 10,
    expiresAt: NOW + 10_000,
    scheme: 'exact',
    paymentFlow: 'upfront',
    network: 'zenon:mock',
    chainProfile: {
      version: 1,
      chainIdentifier: Number.MAX_SAFE_INTEGER.toString(),
      genesisMomentumHash: '0'.repeat(64),
    },
    asset: 'zts1mockasset',
    amount: '1',
    payee: 'payee.mock.1',
    payer,
    paymentResourceDigest: digest('4'),
    paymentRequirementDigest: paymentIntent.requirementId
      ? `sha256:${createHash('sha256').update(paymentIntent.requirementId).digest('hex')}`
      : digest('2'),
    paymentIntentDigest: paymentIntent.intentId
      ? `sha256:${createHash('sha256').update(paymentIntent.intentId).digest('hex')}`
      : digest('1'),
    grantFundingCommitment: digest('3'),
    evidenceState: 'MOMENTUM_INCLUDED',
    confirmationPolicy: {
      policyId: 'mock.momentum-included',
      policyVersion: 1,
      minimumConfirmations: 1,
    },
    ...rest,
    transactionId: `mocktx:${createHash('sha256').update(transactionLabel).digest('hex')}`,
  };
}

function request(grantId, overrides = {}) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId,
    requestId: 'request.1',
    method: 'POST',
    routeId: 'lookup.v1',
    canonicalBodyDigest: digest('b'),
    selectedContentType: 'application/json',
    maxCostUnits: Number.MAX_SAFE_INTEGER,
    ...overrides,
  };
}

function result(overrides = {}) {
  return {
    statusCode: 200,
    contentType: 'application/json',
    resultCode: 'lookup.completed',
    ...overrides,
  };
}

// Never hand an unexpected callback/input exception to the test reporter.
function safely(operation) {
  let returned = false;
  let value;
  try {
    value = operation();
    returned = true;
  } catch {}
  assert.ok(returned, 'unexpected model/read rejection');
  return value;
}

function expectCode(operation, code) {
  let caught;
  try { operation(); }
  catch (error) { caught = error; }
  // Boolean assertions keep even a regressed sensitive error message private.
  assert.ok(caught instanceof ServiceCreditModelError, 'fixed model error type');
  assert.ok(caught.name === 'ServiceCreditModelError', 'fixed model error name');
  assert.ok(caught.code === code, 'fixed model error code');
  assert.ok(caught.message === code, 'fixed model error message');
  assert.ok(!Object.hasOwn(caught, 'cause'), 'no propagated sensitive cause');
}

function frozenData(value) {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value), 'returned model data must be frozen');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(descriptor && Object.hasOwn(descriptor, 'value'),
      'returned data descriptor required');
    frozenData(descriptor.value);
  }
}

function json(value) {
  return safely(() => JSON.stringify(value));
}

function sameData(actual, expected, label) {
  assert.ok(json(actual) === json(expected), label);
}

function noCallbacks(f) {
  assert.ok(f.control.armed, 'both callbacks must remain armed');
  assert.equal(f.control.nowCalls, f.callsBefore.now);
  assert.equal(f.control.costCalls, f.callsBefore.cost);
}

function inspect(f) {
  const state = safely(() => f.model.exportState());
  const original = safely(() => f.model.getRequest(f.originalRef));
  const sibling = safely(() => f.model.getRequest(f.siblingRef));
  frozenData(state);
  frozenData(original);
  frozenData(sibling);
  assert.ok(state.offers.length === 1, 'one unchanged offer');
  assert.ok(state.grants.length === 1, 'one unchanged grant');
  assert.ok(state.requests.length === 2, 'no new request admission');
  const exportedOriginal = state.requests.find(entry =>
    entry.requestId === f.originalRef.requestId);
  const exportedSibling = state.requests.find(entry =>
    entry.requestId === f.siblingRef.requestId);
  assert.ok(original !== exportedOriginal, 'original read must be detached');
  assert.ok(sibling !== exportedSibling, 'sibling read must be detached');
  sameData(original, exportedOriginal, 'original read/export mismatch');
  sameData(sibling, exportedSibling, 'sibling read/export mismatch');
  assert.ok(state.requests.every(entry => entry.state !== REQUEST_STATE.EXECUTING),
    'no execution opened');
  const text = json(state);
  assert.ok(!text.includes(SENSITIVE), 'sensitive fixture data must stay private');
  if (f.control.armed) noCallbacks(f);
  return { state, original, sibling, bytes: Buffer.from(text, 'utf8') };
}

function assertState(f, expected) {
  const observed = inspect(f);
  const expectedBytes = Buffer.from(json(expected), 'utf8');
  assert.ok(observed.bytes.equals(expectedBytes), 'exact model bytes changed');
  const grantRecord = observed.state.grants[0];
  const expectedGrant = expected.grants[0];
  assert.ok(grantRecord.totalUnits === 11, 'total must remain eleven');
  assert.ok(grantRecord.lifecycle === GRANT_LIFECYCLE.ACTIVE,
    'grant lifecycle must not refresh/change');
  for (const field of ['availableUnits', 'heldUnits', 'consumedUnits']) {
    assert.ok(grantRecord[field] === expectedGrant[field],
      'exact accounting counter changed');
  }
  assert.ok(grantRecord.availableUnits + grantRecord.heldUnits
    + grantRecord.consumedUnits === 11, 'units must conserve');
  assert.ok(observed.original.costUnits === 3, 'original cost stays pinned');
  assert.ok(observed.sibling.costUnits === 3, 'sibling cost stays pinned');
  assert.ok(observed.sibling.state === REQUEST_STATE.RESERVED,
    'sibling remains RESERVED');
  assert.ok(observed.sibling.cachedResult === null, 'sibling has no cache');
  sameData(observed.sibling, f.siblingReserved, 'sibling record changed');
  const expectedUnknown = expected.requests.filter(entry =>
    entry.state === REQUEST_STATE.OUTCOME_UNKNOWN).length;
  assert.ok(observed.state.requests.filter(entry =>
    entry.state === REQUEST_STATE.OUTCOME_UNKNOWN).length === expectedUnknown,
  'unknown record count changed');
  noCallbacks(f);
  return observed;
}

function fixture(mode) {
  const control = { armed: false, nowCalls: 0, costCalls: 0 };
  function callback(kind) {
    if (kind === 'now') control.nowCalls++;
    else control.costCalls++;
    if (control.armed) {
      if (mode === 'NaN') return NaN;
      throw new Error(SENSITIVE);
    }
    return kind === 'now' ? NOW : 3;
  }
  const model = safely(() => new InMemoryServiceCreditModel({
    now: () => callback('now'),
    deriveCost: () => callback('cost'),
  }));
  const registered = safely(() => model.registerOffer(offer()));
  const activationInput = grant({ totalUnits: 11 });
  const activeGrant = safely(() =>
    model.activateGrantFromTrustedRecord(activationInput));
  frozenData(registered);
  frozenData(activeGrant);
  assert.ok(activeGrant.activation.network === 'zenon:mock',
    'only declared mock activation data');
  assert.ok(activeGrant.activation !== activationInput,
    'activation input must be detached');

  const originalInput = Object.freeze(request(activeGrant.grantId, {
    requestId: 'request.original',
    maxCostUnits: 3,
  }));
  const siblingInput = Object.freeze(request(activeGrant.grantId, {
    requestId: 'request.sibling',
    maxCostUnits: 3,
  }));
  const originalRef = Object.freeze({
    grantId: activeGrant.grantId, requestId: originalInput.requestId,
  });
  const siblingRef = Object.freeze({
    grantId: activeGrant.grantId, requestId: siblingInput.requestId,
  });
  const originalReservation = safely(() => model.reserveRequest(originalInput));
  const siblingReservation = safely(() => model.reserveRequest(siblingInput));
  for (const reserved of [originalReservation, siblingReservation]) {
    frozenData(reserved);
    assert.ok(reserved.replayed === false, 'fresh reservation required');
    assert.ok(reserved.executionAuthorized === false,
      'reservation cannot authorize execution');
    assert.ok(reserved.request.state === REQUEST_STATE.RESERVED,
      'both requests reserve before original begin');
  }
  assert.ok(originalReservation.request !== originalInput,
    'original input must be detached');
  assert.ok(siblingReservation.request !== siblingInput,
    'sibling input must be detached');
  const begun = safely(() => model.beginExecution(originalRef));
  frozenData(begun);
  assert.ok(begun.executionAuthorized === true, 'initial original begin');
  assert.ok(begun.request.state === REQUEST_STATE.EXECUTING,
    'original must initially execute');
  const unknown = safely(() => model.markOutcomeUnknown(originalRef));
  frozenData(unknown);
  assert.ok(unknown.transitioned === true, 'one initial UNKNOWN transition');
  assert.ok(unknown.request.state === REQUEST_STATE.OUTCOME_UNKNOWN,
    'original must remain unresolved');
  assert.ok(unknown.request.cachedResult === null, 'unknown has no cache');

  const f = {
    model, control, originalInput, siblingInput, originalRef, siblingRef,
    siblingReserved: siblingReservation.request,
    callsBefore: null,
    baseline: null,
  };
  const beforeArm = inspect(f);
  const counters = beforeArm.state.grants[0];
  assert.ok(counters.availableUnits === 5 && counters.heldUnits === 6
    && counters.consumedUnits === 0, 'UNKNOWN baseline 5/6/0');
  sameData(beforeArm.original, unknown.request, 'exact unknown original');
  sameData(beforeArm.sibling, siblingReservation.request, 'exact reserved sibling');
  assert.ok(control.nowCalls > 0, 'setup used the declared clock');
  assert.equal(control.costCalls, 2);
  // Capture counters BEFORE arming BOTH existing injected callbacks.
  f.callsBefore = Object.freeze({ now: control.nowCalls, cost: control.costCalls });
  f.baseline = beforeArm.state;
  control.armed = true;
  assertState(f, f.baseline);
  return f;
}

function resolution(f, outcome) {
  const input = { ...f.originalRef, outcome };
  if (outcome === REQUEST_STATE.SUCCEEDED) {
    input.cachedResult = Object.freeze(result());
  }
  return Object.freeze(input);
}

function exactReplays(f, expected) {
  const wanted = expected.requests.find(entry =>
    entry.requestId === f.originalRef.requestId);
  const reserved = safely(() => f.model.reserveRequest(f.originalInput));
  frozenData(reserved);
  assert.ok(reserved.replayed === true, 'original reservation is an exact replay');
  assert.ok(reserved.executionAuthorized === false, 'replay cannot authorize');
  sameData(reserved.request, wanted, 'original reserve replay changed record');
  assertState(f, expected);
  const begun = safely(() => f.model.beginExecution(f.originalRef));
  frozenData(begun);
  assert.ok(begun.executionAuthorized === false, 'original begin cannot reauthorize');
  sameData(begun.request, wanted, 'original begin replay changed record');
  assertState(f, expected);
}

function unknownBlockers(f) {
  expectCode(() => f.model.reserveRequest(request(f.originalRef.grantId, {
    requestId: 'request.blocked',
    maxCostUnits: 3,
  })), 'UNRESOLVED_EXECUTION');
  assertState(f, f.baseline);
  assert.ok(safely(() => f.model.getRequest({
    grantId: f.originalRef.grantId, requestId: 'request.blocked',
  })) === null, 'denied request must not exist');
  noCallbacks(f);
  expectCode(() => f.model.beginExecution(f.siblingRef), 'UNRESOLVED_EXECUTION');
  assertState(f, f.baseline);
  exactReplays(f, f.baseline);
}

function terminalState(f, outcome) {
  // A detached expected-state copy changes only the admitted terminal fields.
  // It is never hydrated, imported or written into the actual model.
  const expected = JSON.parse(json(f.baseline));
  const original = expected.requests.find(entry =>
    entry.requestId === f.originalRef.requestId);
  original.state = outcome;
  original.cachedResult = outcome === REQUEST_STATE.SUCCEEDED ? result() : null;
  const record = expected.grants[0];
  record.availableUnits = outcome === REQUEST_STATE.SUCCEEDED ? 5 : 8;
  record.heldUnits = 3;
  record.consumedUnits = outcome === REQUEST_STATE.SUCCEEDED ? 3 : 0;
  return expected;
}

function recoverOnce(f, outcome) {
  const expected = terminalState(f, outcome);
  const valid = resolution(f, outcome);
  // Explicit declared privileged call only; this is not external evidence or
  // authenticated recovery authority, and no automatic completion/refund runs.
  const reconciled = safely(() => f.model.reconcileRequest(valid));
  frozenData(reconciled);
  assert.ok(reconciled.transitioned === true, 'exactly one recovery transition');
  const original = expected.requests.find(entry =>
    entry.requestId === f.originalRef.requestId);
  sameData(reconciled.request, original, 'explicit recovery record mismatch');
  if (outcome === REQUEST_STATE.SUCCEEDED) {
    assert.ok(reconciled.request.cachedResult !== valid.cachedResult,
      'successful cache must be detached from caller data');
    frozenData(reconciled.request.cachedResult);
    sameData(reconciled.request.cachedResult, result(), 'canonical success cache');
  } else {
    assert.ok(reconciled.request.cachedResult === null, 'release has no cache');
  }
  assertState(f, expected);
  const replay = safely(() => f.model.reconcileRequest(valid));
  frozenData(replay);
  assert.ok(replay.transitioned === false, 'reconcile replay must not transition');
  sameData(replay.request, reconciled.request, 'exact recovery replay mismatch');
  assertState(f, expected);
  exactReplays(f, expected);
  const opposite = outcome === REQUEST_STATE.SUCCEEDED
    ? REQUEST_STATE.FAILED_RELEASED : REQUEST_STATE.SUCCEEDED;
  expectCode(() => f.model.reconcileRequest(resolution(f, opposite)),
    'RECONCILIATION_CONFLICT');
  assertState(f, expected);
}

function malformedSuccess(f, kind, touches) {
  let cachedResult;
  if (kind === 'invalid cached status') {
    cachedResult = result({ statusCode: 600 });
  } else if (kind === 'incompatible content type') {
    cachedResult = result({ contentType: 'text/plain' });
  } else {
    assert.ok(kind === 'cached-result accessor', 'known denial case');
    cachedResult = result();
    Object.defineProperty(cachedResult, 'statusCode', {
      enumerable: true,
      get() {
        touches.getter++;
        throw new Error(SENSITIVE);
      },
    });
  }
  return Object.freeze({
    ...f.originalRef,
    outcome: REQUEST_STATE.SUCCEEDED,
    cachedResult: Object.freeze(cachedResult),
  });
}

function malformedRelease(f, kind, touches) {
  const input = { ...f.originalRef, outcome: REQUEST_STATE.FAILED_RELEASED };
  if (kind === 'forbidden cachedResult key') {
    input.cachedResult = Object.freeze(result());
  } else if (kind === 'invalid non-coercible outcome') {
    const coercion = () => {
      touches.coercion++;
      throw new Error(SENSITIVE);
    };
    const outcome = Object.create(null);
    Object.defineProperties(outcome, {
      [Symbol.toPrimitive]: { value: coercion },
      valueOf: { value: coercion },
      toString: { value: coercion },
    });
    input.outcome = Object.freeze(outcome);
  } else {
    assert.ok(kind === 'outer outcome accessor', 'known denial case');
    Object.defineProperty(input, 'outcome', {
      enumerable: true,
      get() {
        touches.getter++;
        throw new Error(SENSITIVE);
      },
    });
  }
  return Object.freeze(input);
}

function denialThenRecovery(mode, kind, outcome) {
  const f = fixture(mode);
  const touches = { getter: 0, coercion: 0 };
  const malformed = outcome === REQUEST_STATE.SUCCEEDED
    ? malformedSuccess(f, kind, touches) : malformedRelease(f, kind, touches);
  expectCode(() => f.model.reconcileRequest(malformed), 'INVALID_INPUT');
  assert.equal(touches.getter, 0);
  assert.equal(touches.coercion, 0);
  const unchanged = assertState(f, f.baseline);
  assert.ok(unchanged.original.state === REQUEST_STATE.OUTCOME_UNKNOWN,
    'denial must preserve the original UNKNOWN state');
  assert.ok(unchanged.original.cachedResult === null,
    'denial must preserve a null original cache');
  unknownBlockers(f);
  recoverOnce(f, outcome);
  assert.equal(touches.getter, 0);
  assert.equal(touches.coercion, 0);
  noCallbacks(f);
}

test('malformed success reconciliation preserves unknown hold before one explicit consume',
  { timeout: 5000 }, () => {
    let fixtures = 0;
    for (const mode of MODES) {
      for (const kind of [
        'invalid cached status',
        'incompatible content type',
        'cached-result accessor',
      ]) {
        denialThenRecovery(mode, kind, REQUEST_STATE.SUCCEEDED);
        fixtures++;
      }
    }
    assert.equal(fixtures, 6);
  });

test('malformed release reconciliation preserves unknown hold before one explicit release',
  { timeout: 5000 }, () => {
    let fixtures = 0;
    for (const mode of MODES) {
      for (const kind of [
        'forbidden cachedResult key',
        'invalid non-coercible outcome',
        'outer outcome accessor',
      ]) {
        denialThenRecovery(mode, kind, REQUEST_STATE.FAILED_RELEASED);
        fixtures++;
      }
    }
    assert.equal(fixtures, 6);
  });
