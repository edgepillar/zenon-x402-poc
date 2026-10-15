/*
 * Source-pinned regression for rejected native callback Promise results.
 *
 * The model stays synchronous; these tests await only declared fixture
 * rejection settlement and bounded real event-loop turns. Fixtures use only
 * declared zenon:mock activation DATA, with no payment or recovery authority.
 *
 * Default pins require the candidate. Only the explicit environment setting
 * SPV_MODEL_REJECTED_PROMISE_PARENT_CONTROL=1 selects the current parent pin.
 * That control runs the SAME desired behavior and is expected red. It is not
 * historical DP/native BASE or successful qualification. No hash-based fallback.
 *
 * Test listeners filter exact owned fixture Promises, discard reasons and are
 * removed individually in finally. No test rejection sink is attached before
 * the observation measurement. Cleanup sinks only those exact owned Promises.
 * Native test/event-loop behavior and pristine globals remain premises; this
 * establishes neither cancellation nor control of a trusted callback's work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setImmediate as nativeSetImmediate } from 'node:timers';

assert.equal(process.versions.node, '24.19.0');
const parentControl = process.env.SPV_MODEL_REJECTED_PROMISE_PARENT_CONTROL;
if (parentControl !== undefined && parentControl !== '1') {
  throw new Error('INVALID_CURRENT_PARENT_CONTROL_PROFILE');
}
const modelPin = parentControl === '1'
  ? [53422, 'f9a935ba0c3d72bcd547b13c3769e76fe0282245de1d8688dae2ebc361a39ac6']
  : [55461, '7ff7e3d88ab8c3b38a0073541533fbdb7a0d9f2be42f337ac35f6a3b05615c3a'];
const pins = [
  ['../src/service-credit-model.js', ...modelPin],
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
// These declarations do not establish SDK or native-chain qualification.
const {
  InMemoryServiceCreditModel,
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
  ServiceCreditModelError,
} = await import('../src/service-credit-model.js');

const APPLY = Reflect.apply;
const NativePromise = Promise;
const THEN = NativePromise.prototype.then;
const REJECT = NativePromise.reject;
const ALL = NativePromise.all;
const QUEUE_MICROTASK = globalThis.queueMicrotask;
const ADD_LISTENER = process.on;
const REMOVE_LISTENER = process.removeListener;
const MARKER = 'declared-neutral-native-callback-rejection';

const NOW=2_000_000_000_000;
const digest=fill=>'sha256:'+fill.repeat(64);

function offer() {
  return {
    modelVersion:SERVICE_CREDIT_MODEL_VERSION,
    providerId:'provider.alpha',serviceId:'service.lookup',
    resourceId:'resource.lookup',resourceBinding:digest('e'),
    offerId:'offer.standard',offerVersion:1,costPolicyId:'policy.fixed',
    fundingPolicyId:'funding.fixed',fundingPolicyVersion:1,
  };
}

function activation() {
  return {
    activationVersion:SERVICE_CREDIT_ACTIVATION_VERSION,
    authorityProfileId:'authority.mock.reference',
    authorityProfileVersion:1,verifierVersion:1,authorityRecordDigest:digest('d'),
    fundingPolicyId:'funding.fixed',fundingPolicyVersion:1,
    sourceSettlementId:'settlement.public.1',
    transactionId:'mocktx:'+createHash('sha256').update('transaction.public.1').digest('hex'),
    providerId:'provider.alpha',serviceId:'service.lookup',
    resourceId:'resource.lookup',resourceBinding:digest('e'),
    offerId:'offer.standard',offerVersion:1,
    holderId:'holder.public.1',capabilityCommitment:digest('a'),
    totalUnits:8,expiresAt:NOW+10_000,
    scheme:'exact',paymentFlow:'upfront',network:'zenon:mock',
    chainProfile:{
      version:1,chainIdentifier:Number.MAX_SAFE_INTEGER.toString(),
      genesisMomentumHash:'0'.repeat(64),
    },
    asset:'zts1mockasset',amount:'1',payee:'payee.mock.1',payer:'holder.public.1',
    paymentResourceDigest:digest('4'),paymentRequirementDigest:digest('2'),
    paymentIntentDigest:digest('1'),grantFundingCommitment:digest('3'),
    evidenceState:'MOMENTUM_INCLUDED',
    confirmationPolicy:{
      policyId:'mock.momentum-included',policyVersion:1,minimumConfirmations:1,
    },
  };
}

function conserved(grant) {
  assert.equal(grant.totalUnits,
    grant.availableUnits+grant.heldUnits+grant.consumedUnits);
  assert.ok(grant.availableUnits>=0);
  assert.ok(grant.heldUnits>=0);
  assert.ok(grant.consumedUnits>=0);
}

function makeOwnedPromise(owned, timing) {
  let promise;
  if (timing === 'immediate') {
    promise = APPLY(REJECT, NativePromise, [MARKER]);
  } else {
    assert.equal(timing, 'microtask');
    promise = new NativePromise((_resolve, reject) => {
      QUEUE_MICROTASK(() => { reject(MARKER); });
    });
  }
  owned.add(promise);
  assert.equal(Object.getPrototypeOf(promise), NativePromise.prototype);
  return promise;
}

function fixture(field, timing, owned) {
  const calls = { clock: 0, pricing: 0 };
  const returned = { clock: 0, pricing: 0 };
  const control = { rejecting: false };
  function valueFor(kind) {
    calls[kind]++;
    const value = control.rejecting && field === kind
      ? makeOwnedPromise(owned, timing) : kind === 'clock' ? NOW : 3;
    returned[kind]++;
    return value;
  }
  const model = new InMemoryServiceCreditModel({
    now: () => valueFor('clock'),
    deriveCost: () => valueFor('pricing'),
  });
  model.registerOffer(offer());
  const active = model.activateGrantFromTrustedRecord(activation());
  const original=Object.freeze({
    modelVersion:SERVICE_CREDIT_MODEL_VERSION,
    grantId:active.grantId,requestId:'request.1',method:'POST',routeId:'lookup.v1',
    canonicalBodyDigest:digest('b'),selectedContentType:'application/json',
    maxCostUnits:Number.MAX_SAFE_INTEGER,
  });
  const reference=Object.freeze({
    grantId:original.grantId,requestId:original.requestId,
  });
  const before = model.exportState();
  frozenData(active);
  frozenData(before);
  assert.equal(before.offers.length, 1);
  assert.equal(before.grants.length, 1);
  assert.equal(before.requests.length, 0);
  assert.equal(before.grants[0].activation.network, 'zenon:mock');
  assert.equal(before.grants[0].totalUnits, 8);
  assert.equal(before.grants[0].availableUnits, 8);
  assert.equal(before.grants[0].heldUnits, 0);
  assert.equal(before.grants[0].consumedUnits, 0);
  conserved(before.grants[0]);
  assert.ok(calls.clock > 0);
  assert.equal(calls.pricing, 0);
  assert.equal(owned.size, 0, 'normal setup returns only valid scalar values');
  return { model, original, reference, before, calls, returned, control };
}

function frozenData(value) {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(descriptor && Object.hasOwn(descriptor, 'value'));
    frozenData(descriptor.value);
  }
}

function bytes(value) {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function checkState(f, expected, expectedCalls) {
  const state = f.model.exportState();
  frozenData(state);
  assert.ok(bytes(state).equals(bytes(expected)), 'exact model state changed');
  assert.deepEqual(f.calls, expectedCalls, 'unexpected callback invocation');
  assert.deepEqual(f.returned, expectedCalls, 'callback must return, not throw');
  const grant = state.grants[0];
  assert.equal(grant.lifecycle, 'ACTIVE');
  assert.equal(grant.totalUnits, 8);
  assert.equal(grant.consumedUnits, 0);
  conserved(grant);
  assert.equal(JSON.stringify(state).includes(MARKER), false);
  return state;
}

function checkEmpty(f, expectedCalls) {
  checkState(f, f.before, expectedCalls);
  assert.equal(f.model.getRequest(f.reference), null);
  checkState(f, f.before, expectedCalls);
}

function expectSynchronousCode(operation, code) {
  let caught;
  try { operation(); } catch (error) { caught = error; }
  assert.ok(caught instanceof ServiceCreditModelError,
    'callback numeric rejection must be synchronous');
  assert.ok(caught.name === 'ServiceCreditModelError');
  assert.ok(caught.code === code);
  assert.ok(caught.message === code, 'public error must contain only fixed code');
  assert.equal(Object.hasOwn(caught, 'cause'), false);
  assert.equal((JSON.stringify(caught) + caught.message).includes(MARKER), false);
}

async function turns(count) {
  for (let index = 0; index < count; index++) {
    await new NativePromise(resolve => {
      nativeSetImmediate(() => { resolve(undefined); });
    });
  }
}

function reserveOnce(f, beforeCalls) {
  const accepted = f.model.reserveRequest(f.original);
  frozenData(accepted);
  assert.equal(accepted.replayed, false);
  assert.equal(accepted.executionAuthorized, false);
  assert.equal(accepted.request.state, 'RESERVED');
  assert.equal(accepted.request.costUnits, 3);
  assert.equal(accepted.request.cachedResult, null);
  for (const [key, value] of Object.entries(f.original)) {
    assert.equal(accepted.request[key], value);
  }
  const expected = {
    ...f.before,
    grants: [{ ...f.before.grants[0], availableUnits: 5, heldUnits: 3 }],
    requests: [accepted.request],
  };
  const calls = {
    clock: beforeCalls.clock + 2,
    pricing: beforeCalls.pricing + 1,
  };
  checkState(f, expected, calls);
  const replay = f.model.reserveRequest(f.original);
  frozenData(replay);
  assert.equal(replay.replayed, true);
  assert.equal(replay.executionAuthorized, false);
  assert.ok(bytes(replay.request).equals(bytes(accepted.request)));
  checkState(f, expected, calls);
  return { expected, calls };
}

async function rejectedCase(field, timing, code, pricingDelta) {
  const owned = new Set();
  let unhandled = 0;
  const onUnhandled = (_reason, promise) => {
    if (owned.has(promise)) unhandled++;
  };
  const f = fixture(field, timing, owned);
  APPLY(ADD_LISTENER, process, ['unhandledRejection', onUnhandled]);
  try {
    const beforeCalls = { ...f.calls };
    f.control.rejecting = true;
    expectSynchronousCode(() => f.model.reserveRequest(f.original), code);
    const after = {
      clock: beforeCalls.clock + 1,
      pricing: beforeCalls.pricing + pricingDelta,
    };
    assert.equal(owned.size, 1, 'one newly-created native callback Promise');
    checkEmpty(f, after);

    // There is deliberately no test .then/.catch/await on any owned fixture
    // Promise before this measurement. Only the actual model may observe it.
    await turns(4);
    checkEmpty(f, after);
    assert.equal(unhandled, 0, 'owned callback Promise rejection was unhandled');

    f.control.rejecting = false;
    const accepted = reserveOnce(f, after);
    await turns(4);
    checkState(f, accepted.expected, accepted.calls);
    const request = f.model.getRequest(f.reference);
    frozenData(request);
    assert.ok(bytes(request).equals(bytes(accepted.expected.requests[0])));
    assert.equal(request.state, 'RESERVED', 'no automatic execution');
    checkState(f, accepted.expected, accepted.calls);
    assert.equal(owned.size, 1, 'no asynchronous/duplicate reservation callback');
    assert.equal(unhandled, 0, 'no later unhandled owned rejection');
  } finally {
    f.control.rejecting = false;
    try {
      // This cleanup runs AFTER measurement, or after a preceding assertion
      // fails. It may safely sink only these exact created fixture Promises.
      const tails = [...owned].map(promise => APPLY(THEN, promise, [
        () => undefined,
        () => undefined,
      ]));
      await APPLY(ALL, NativePromise, [tails]);
      await turns(2);
    } finally {
      // Never remove other listeners or use removeAllListeners.
      APPLY(REMOVE_LISTENER, process, ['unhandledRejection', onUnhandled]);
    }
  }
}

test('rejected native clock Promises stay synchronous and observed without late admission',
  { timeout: 5000 }, async () => {
    await rejectedCase('clock', 'immediate', 'INVALID_CLOCK', 0);
    await rejectedCase('clock', 'microtask', 'INVALID_CLOCK', 0);
  });

test('rejected native pricing Promises stay synchronous and observed without late admission',
  { timeout: 5000 }, async () => {
    await rejectedCase('pricing', 'immediate', 'INVALID_COST', 1);
    await rejectedCase('pricing', 'microtask', 'INVALID_COST', 1);
  });
