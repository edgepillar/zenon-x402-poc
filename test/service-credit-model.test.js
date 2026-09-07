import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  GRANT_LIFECYCLE,
  InMemoryServiceCreditModel,
  REQUEST_STATE,
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
  SERVICE_CREDIT_STATE_SCHEMA_VERSION,
} from '../src/service-credit-model.js';

const NOW = 2_000_000_000_000;

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function deterministicGrantId(record) {
  const activationId = `activation_${createHash('sha256').update(canonicalJson({
    domain: 'zenon-x402-service-credit-activation-v1',
    record,
  })).digest('hex')}`;
  const grant = {
    modelVersion: record.modelVersion,
    activationId,
    providerId: record.providerId,
    serviceId: record.serviceId,
    resourceId: record.resourceId,
    offerId: record.offerId,
    offerVersion: record.offerVersion,
    holderId: record.holderId,
    capabilityCommitment: record.capabilityCommitment,
    totalUnits: record.totalUnits,
    expiresAt: record.expiresAt,
  };
  return `grant_${createHash('sha256').update(canonicalJson({
    domain: 'zenon-x402-service-credit-grant-v1',
    grant,
  })).digest('hex')}`;
}

function deterministicRequestDigest(record) {
  const normalized = {
    modelVersion: record.modelVersion,
    grantId: record.grantId,
    offerId: record.offerId,
    offerVersion: record.offerVersion,
    method: record.method,
    routeId: record.routeId,
    canonicalBodyDigest: record.canonicalBodyDigest,
    selectedContentType: record.selectedContentType,
    maxCostUnits: record.maxCostUnits,
    costUnits: record.costUnits,
  };
  return `sha256:${createHash('sha256').update(canonicalJson(normalized)).digest('hex')}`;
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

function setup({ totalUnits = 10, cost = 3, now = NOW } = {}) {
  const clock = { value: now };
  const currentCost = { value: cost };
  const model = new InMemoryServiceCreditModel({
    now: () => clock.value,
    deriveCost: () => currentCost.value,
  });
  model.registerOffer(offer());
  const activeGrant = model.activateGrantFromTrustedRecord(grant({ totalUnits }));
  return { model, activeGrant, clock, currentCost };
}

function expectCode(operation, code) {
  assert.throws(operation, error => {
    assert.equal(error?.code, code);
    assert.equal(error?.message, code);
    return true;
  });
}

function assertConserved(snapshot) {
  assert.equal(
    snapshot.totalUnits,
    snapshot.availableUnits + snapshot.heldUnits + snapshot.consumedUnits,
  );
  assert.ok(snapshot.availableUnits >= 0);
  assert.ok(snapshot.heldUnits >= 0);
  assert.ok(snapshot.consumedUnits >= 0);
}

test('unresolved execution admission blocks new reservations before policy effects', () => {
  const effects = { clock: 0, pricing: 0 };
  const model = new InMemoryServiceCreditModel({
    now: () => {
      effects.clock += 1;
      return NOW;
    },
    deriveCost: () => {
      effects.pricing += 1;
      return 2;
    },
  });
  model.registerOffer(offer());
  const activeGrant = model.activateGrantFromTrustedRecord(grant());
  const crossGrant = model.activateGrantFromTrustedRecord(grant({
    sourceSettlementId: 'settlement.public.cross',
    transactionId: 'transaction.public.cross',
    holderId: 'holder.public.cross',
    payer: 'holder.public.cross',
    capabilityCommitment: digest('c'),
  }));
  model.reserveRequest(request(activeGrant.grantId, { requestId: 'request.blocker' }));
  model.beginExecution({ grantId: activeGrant.grantId, requestId: 'request.blocker' });

  const assertBlockedWithoutEffects = (targetGrantId, requestId) => {
    const before = model.exportState();
    const effectsBefore = { ...effects };
    expectCode(
      () => model.reserveRequest(request(targetGrantId, { requestId })),
      'UNRESOLVED_EXECUTION',
    );
    assert.deepEqual(model.exportState(), before);
    assert.deepEqual(effects, effectsBefore);
  };
  assertBlockedWithoutEffects(activeGrant.grantId, 'request.executing.same-grant');
  assertBlockedWithoutEffects(crossGrant.grantId, 'request.executing.cross-grant');

  model.markOutcomeUnknown({ grantId: activeGrant.grantId, requestId: 'request.blocker' });
  assertBlockedWithoutEffects(activeGrant.grantId, 'request.unknown.same-grant');
  assertBlockedWithoutEffects(crossGrant.grantId, 'request.unknown.cross-grant');
});

test('unresolved execution admission permits only one distinct pre-reserved begin', () => {
  const { model, activeGrant } = setup({ totalUnits: 10, cost: 2 });
  const first = { grantId: activeGrant.grantId, requestId: 'request.first' };
  const second = { grantId: activeGrant.grantId, requestId: 'request.second' };
  model.reserveRequest(request(activeGrant.grantId, { requestId: first.requestId }));
  model.reserveRequest(request(activeGrant.grantId, { requestId: second.requestId }));
  assert.equal(model.beginExecution(first).executionAuthorized, true);

  const before = model.exportState();
  expectCode(() => model.beginExecution(second), 'UNRESOLVED_EXECUTION');
  assert.deepEqual(model.exportState(), before);
  assert.equal(model.getRequest(second).state, REQUEST_STATE.RESERVED);
});

test('unresolved execution admission spans grants and preserves every exact replay state', () => {
  const { model, activeGrant } = setup({ totalUnits: 20, cost: 2 });
  const otherGrant = model.activateGrantFromTrustedRecord(grant({
    sourceSettlementId: 'settlement.public.2',
    transactionId: 'transaction.public.2',
    holderId: 'holder.public.2',
    payer: 'holder.public.2',
    capabilityCommitment: digest('c'),
  }));
  const completedInput = request(otherGrant.grantId, { requestId: 'request.completed' });
  const releasedInput = request(otherGrant.grantId, { requestId: 'request.released' });
  const waitingInput = request(otherGrant.grantId, { requestId: 'request.waiting' });
  const blockerInput = request(activeGrant.grantId, { requestId: 'request.blocker' });

  model.reserveRequest(completedInput);
  model.beginExecution({ grantId: otherGrant.grantId, requestId: completedInput.requestId });
  model.completeExecution({
    grantId: otherGrant.grantId,
    requestId: completedInput.requestId,
    cachedResult: result(),
  });
  model.reserveRequest(releasedInput);
  model.releaseBeforeExecution({ grantId: otherGrant.grantId, requestId: releasedInput.requestId });
  model.reserveRequest(waitingInput);
  model.reserveRequest(blockerInput);
  model.beginExecution({ grantId: activeGrant.grantId, requestId: blockerInput.requestId });

  assert.equal(model.reserveRequest(completedInput).request.state, REQUEST_STATE.SUCCEEDED);
  assert.equal(model.reserveRequest(releasedInput).request.state, REQUEST_STATE.FAILED_RELEASED);
  assert.equal(model.reserveRequest(waitingInput).request.state, REQUEST_STATE.RESERVED);
  assert.equal(model.reserveRequest(blockerInput).request.state, REQUEST_STATE.EXECUTING);
  expectCode(
    () => model.beginExecution({ grantId: otherGrant.grantId, requestId: waitingInput.requestId }),
    'UNRESOLVED_EXECUTION',
  );
  expectCode(
    () => model.reserveRequest(request(otherGrant.grantId, { requestId: 'request.new' })),
    'UNRESOLVED_EXECUTION',
  );

  model.markOutcomeUnknown({ grantId: activeGrant.grantId, requestId: blockerInput.requestId });
  assert.equal(model.reserveRequest(blockerInput).request.state, REQUEST_STATE.OUTCOME_UNKNOWN);
  expectCode(
    () => model.beginExecution({ grantId: otherGrant.grantId, requestId: waitingInput.requestId }),
    'UNRESOLVED_EXECUTION',
  );
  model.reconcileRequest({
    grantId: activeGrant.grantId,
    requestId: blockerInput.requestId,
    outcome: REQUEST_STATE.FAILED_RELEASED,
  });
  assert.equal(
    model.beginExecution({ grantId: otherGrant.grantId, requestId: waitingInput.requestId })
      .executionAuthorized,
    true,
  );
});

test('hydrated schema-v2 blockers remain byte-compatible until every blocker is terminal', () => {
  const { model, activeGrant } = setup({ totalUnits: 12, cost: 2 });
  const first = request(activeGrant.grantId, { requestId: 'request.first' });
  const second = request(activeGrant.grantId, { requestId: 'request.second' });
  model.reserveRequest(first);
  model.reserveRequest(second);
  const legacy = structuredClone(model.exportState());
  legacy.requests.find(entry => entry.requestId === first.requestId).state = REQUEST_STATE.EXECUTING;
  legacy.requests.find(entry => entry.requestId === second.requestId).state = REQUEST_STATE.OUTCOME_UNKNOWN;

  const recovered = InMemoryServiceCreditModel.fromState({
    deriveCost: () => 2,
    now: () => NOW,
  }, legacy);
  assert.equal(recovered.exportState().schemaVersion, SERVICE_CREDIT_STATE_SCHEMA_VERSION);
  assert.deepEqual(recovered.exportState(), legacy);
  expectCode(
    () => recovered.reserveRequest(request(activeGrant.grantId, { requestId: 'request.blocked' })),
    'UNRESOLVED_EXECUTION',
  );

  recovered.completeExecution({
    grantId: activeGrant.grantId,
    requestId: first.requestId,
    cachedResult: result(),
  });
  expectCode(
    () => recovered.reserveRequest(request(activeGrant.grantId, { requestId: 'request.still-blocked' })),
    'UNRESOLVED_EXECUTION',
  );
  const reconciliation = {
    grantId: activeGrant.grantId,
    requestId: second.requestId,
    outcome: REQUEST_STATE.FAILED_RELEASED,
  };
  assert.equal(recovered.reconcileRequest(reconciliation).transitioned, true);
  const afterReconciliation = recovered.getGrant(activeGrant.grantId);
  assert.equal(recovered.reconcileRequest(reconciliation).transitioned, false);
  assert.deepEqual(recovered.getGrant(activeGrant.grantId), afterReconciliation);
  assert.equal(
    recovered.reserveRequest(request(activeGrant.grantId, { requestId: 'request.admitted' }))
      .replayed,
    false,
  );
});

test('request capacity preserves replay precedence and admits no off-by-one reservation', () => {
  const { model, activeGrant } = setup({ totalUnits: 2, cost: 1 });
  const seedInput = request(activeGrant.grantId, { requestId: 'request.capacity.000000' });
  model.reserveRequest(seedInput);
  model.releaseBeforeExecution({
    grantId: activeGrant.grantId,
    requestId: seedInput.requestId,
  });
  const state = structuredClone(model.exportState());
  const terminalTemplate = state.requests[0];
  state.requests = Array.from({ length: 99_999 }, (_, index) => {
    const record = {
      ...terminalTemplate,
      requestId: `request.capacity.${String(index).padStart(6, '0')}`,
    };
    record.requestDigest = deterministicRequestDigest(record);
    return record;
  });

  const effects = { clock: 0, pricing: 0 };
  const recovered = InMemoryServiceCreditModel.fromState({
    deriveCost: () => {
      effects.pricing += 1;
      return 1;
    },
    now: () => {
      effects.clock += 1;
      return NOW;
    },
  }, state);
  assert.deepEqual(effects, { clock: 0, pricing: 0 });

  const finalInput = request(activeGrant.grantId, { requestId: 'request.capacity.999999' });
  const finalReservation = recovered.reserveRequest(finalInput);
  assert.equal(finalReservation.replayed, false);
  assert.equal(finalReservation.request.state, REQUEST_STATE.RESERVED);
  assert.equal(recovered.exportState().requests.length, 100_000);

  assert.equal(recovered.reserveRequest(finalInput).replayed, true);
  expectCode(
    () => recovered.reserveRequest({ ...finalInput, routeId: 'lookup.changed.v1' }),
    'REQUEST_ID_CONFLICT',
  );

  const effectsAtCapacity = { ...effects };
  const stateAtCapacity = recovered.exportState();
  const overflowInput = request(activeGrant.grantId, { requestId: 'request.capacity.overflow' });
  assert.throws(
    () => recovered.reserveRequest(overflowInput),
    error => {
      assert.equal(error?.name, 'ServiceCreditModelError');
      assert.equal(error?.code, 'REQUEST_CAPACITY_EXCEEDED');
      assert.equal(error?.message, 'REQUEST_CAPACITY_EXCEEDED');
      assert.equal(Object.hasOwn(error, 'cause'), false);
      return true;
    },
  );
  assert.deepEqual(effects, effectsAtCapacity);
  assert.equal(recovered.getRequest({
    grantId: activeGrant.grantId,
    requestId: overflowInput.requestId,
  }), null);
  assert.deepEqual(recovered.exportState(), stateAtCapacity);
  assert.equal(
    recovered.beginExecution({
      grantId: activeGrant.grantId,
      requestId: finalInput.requestId,
    }).executionAuthorized,
    true,
  );
});

test('the model version is a named public constant', () => {
  assert.equal(SERVICE_CREDIT_MODEL_VERSION, 1);
  assert.equal(SERVICE_CREDIT_ACTIVATION_VERSION, 1);
  assert.equal(SERVICE_CREDIT_STATE_SCHEMA_VERSION, 2);
});

test('the raw activation-record mint operation is explicitly named as privileged composition', () => {
  const model = new InMemoryServiceCreditModel({ deriveCost: () => 1, now: () => NOW });
  assert.equal(typeof model.activateGrantFromTrustedRecord, 'function');
});

test('selectedContentType identifies and constrains the selected response representation', () => {
  const { model, activeGrant } = setup({ totalUnits: 7, cost: 4 });
  const selectedRequest = request(activeGrant.grantId);
  const reserved = model.reserveRequest(selectedRequest);
  assert.equal(reserved.request.selectedContentType, 'application/json');
  assert.equal(Object.hasOwn(reserved.request, 'contentType'), false);

  model.beginExecution({ grantId: activeGrant.grantId, requestId: 'request.1' });
  const before = model.getGrant(activeGrant.grantId);
  expectCode(
    () => model.completeExecution({
      grantId: activeGrant.grantId,
      requestId: 'request.1',
      cachedResult: result({ contentType: 'text/plain' }),
    }),
    'INVALID_INPUT',
  );
  assert.deepEqual(model.getGrant(activeGrant.grantId), before);
  assert.equal(
    model.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }).state,
    REQUEST_STATE.EXECUTING,
  );

  const completed = model.completeExecution({
    grantId: activeGrant.grantId,
    requestId: 'request.1',
    cachedResult: result(),
  });
  assert.equal(completed.request.cachedResult.contentType, 'application/json');

  expectCode(
    () => {
      const { selectedContentType, ...legacyRequest } = request(activeGrant.grantId, {
        requestId: 'request.legacy',
      });
      model.reserveRequest({ ...legacyRequest, contentType: selectedContentType });
    },
    'INVALID_INPUT',
  );
});

test('offer versions are immutable, detached, and conflict on changed re-registration', () => {
  const model = new InMemoryServiceCreditModel({ deriveCost: () => 1, now: () => NOW });
  const input = offer();
  const first = model.registerOffer(input);
  const replay = model.registerOffer(offer());

  assert.deepEqual(replay, first);
  assert.notEqual(replay, first);
  assert.equal(Object.isFrozen(first), true);
  input.providerId = 'provider.changed';
  assert.equal(model.getOffer({ offerId: 'offer.standard', offerVersion: 1 }).providerId, 'provider.alpha');

  expectCode(
    () => model.registerOffer(offer({ costPolicyId: 'policy.changed' })),
    'OFFER_VERSION_CONFLICT',
  );
  expectCode(
    () => model.registerOffer(offer({ fundingPolicyId: 'funding.changed' })),
    'OFFER_VERSION_CONFLICT',
  );
  const next = model.registerOffer(offer({ offerVersion: 2, costPolicyId: 'policy.next' }));
  assert.equal(next.offerVersion, 2);
});

test('the activation record is immutable, detached, and referenced by exactly one grant', () => {
  const { model, activeGrant } = setup();
  assert.match(activeGrant.activationId, /^activation_[0-9a-f]{64}$/);
  assert.equal(activeGrant.activation.activationId, activeGrant.activationId);
  assert.equal(activeGrant.activation.fundingPolicyId, 'funding.fixed');
  assert.equal(activeGrant.activation.resourceId, activeGrant.resourceId);
  assert.equal(Object.isFrozen(activeGrant.activation), true);
  const activation = model.getActivation(activeGrant.activationId);
  assert.deepEqual(activation, activeGrant.activation);
  assert.notEqual(activation, activeGrant.activation);
  assert.equal(model.getActivation('activation_missing'), null);
});

test('identical grant activation is idempotent and preserves its exact binding', () => {
  const { model, clock } = setup();
  const first = model.getGrant(model.activateGrantFromTrustedRecord(grant()).grantId);
  const replay = model.activateGrantFromTrustedRecord(grant());

  assert.deepEqual(replay, first);
  assert.notEqual(replay, first);
  assert.equal(replay.lifecycle, GRANT_LIFECYCLE.ACTIVE);
  assert.equal(replay.totalUnits, 10);
  assert.equal(replay.availableUnits, 10);
  assert.equal(replay.heldUnits, 0);
  assert.equal(replay.consumedUnits, 0);
  assert.equal(replay.exhausted, false);
  assertConserved(replay);

  clock.value = NOW + 10_000;
  const expiredReplay = model.activateGrantFromTrustedRecord(grant());
  assert.equal(expiredReplay.grantId, first.grantId);
  assert.equal(expiredReplay.lifecycle, GRANT_LIFECYCLE.ACTIVE);
  assert.equal(model.getGrant(first.grantId).lifecycle, GRANT_LIFECYCLE.EXPIRED);
  assertConserved(expiredReplay);
});

test('duplicate settlement, transaction, and capability identities fail closed on changed grant data', async t => {
  const cases = [
    {
      name: 'settlement identity',
      change: {
        transactionId: 'transaction.public.2',
        capabilityCommitment: digest('c'),
      },
    },
    {
      name: 'transaction identity',
      change: {
        sourceSettlementId: 'settlement.public.2',
        capabilityCommitment: digest('c'),
      },
    },
    {
      name: 'capability commitment',
      change: {
        sourceSettlementId: 'settlement.public.2',
        transactionId: 'transaction.public.2',
      },
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, () => {
      const { model, activeGrant } = setup();
      const before = model.getGrant(activeGrant.grantId);
      expectCode(
        () => model.activateGrantFromTrustedRecord(grant({ ...entry.change, totalUnits: 9 })),
        'GRANT_IDENTITY_CONFLICT',
      );
      assert.deepEqual(model.getGrant(activeGrant.grantId), before);
    });
  }
});

test('inputs, internal records, and outputs remain deeply detached and immutable', () => {
  const { model, activeGrant } = setup();
  const input = request(activeGrant.grantId);
  const reserved = model.reserveRequest(input);
  input.routeId = 'lookup.changed';

  assert.equal(reserved.request.routeId, 'lookup.v1');
  assert.equal(Object.isFrozen(reserved), true);
  assert.equal(Object.isFrozen(reserved.request), true);
  assert.throws(() => {
    reserved.request.routeId = 'lookup.changed';
  }, TypeError);

  const execution = model.beginExecution({
    grantId: activeGrant.grantId,
    requestId: 'request.1',
  });
  assert.equal(execution.executionAuthorized, true);
  const cachedResult = result();
  const completed = model.completeExecution({
    grantId: activeGrant.grantId,
    requestId: 'request.1',
    cachedResult,
  });
  cachedResult.resultCode = 'lookup.changed';

  assert.equal(completed.request.cachedResult.resultCode, 'lookup.completed');
  assert.equal(Object.isFrozen(completed.request.cachedResult), true);
  assert.deepEqual(JSON.parse(JSON.stringify(completed)), completed);
  assert.notEqual(
    model.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }),
    completed.request,
  );
});

test('unit and expiry validation is strict and counters conserve exactly', () => {
  for (const totalUnits of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const model = new InMemoryServiceCreditModel({ deriveCost: () => 1, now: () => NOW });
    model.registerOffer(offer());
    expectCode(() => model.activateGrantFromTrustedRecord(grant({ totalUnits })), 'INVALID_INPUT');
  }

  for (const expiresAt of [NOW, NOW - 1, NOW + 0.5]) {
    const model = new InMemoryServiceCreditModel({ deriveCost: () => 1, now: () => NOW });
    model.registerOffer(offer());
    expectCode(() => model.activateGrantFromTrustedRecord(grant({ expiresAt })), 'INVALID_INPUT');
  }

  const { model, activeGrant } = setup({ totalUnits: 3, cost: 3 });
  model.reserveRequest(request(activeGrant.grantId));
  const exhausted = model.getGrant(activeGrant.grantId);
  assertConserved(exhausted);
  assert.equal(exhausted.availableUnits, 0);
  assert.equal(exhausted.exhausted, true);
  assert.equal(exhausted.lifecycle, GRANT_LIFECYCLE.ACTIVE);

  const invalidCostModel = new InMemoryServiceCreditModel({ deriveCost: () => 0, now: () => NOW });
  invalidCostModel.registerOffer(offer());
  const invalidCostGrant = invalidCostModel.activateGrantFromTrustedRecord(grant());
  expectCode(
    () => invalidCostModel.reserveRequest(request(invalidCostGrant.grantId)),
    'INVALID_COST',
  );
  assert.equal(invalidCostModel.getGrant(invalidCostGrant.grantId).availableUnits, 10);
});

test('same request replay is idempotent and never charges twice', () => {
  const { model, activeGrant } = setup({ totalUnits: 8, cost: 3 });
  const first = model.reserveRequest(request(activeGrant.grantId));
  const afterFirst = model.getGrant(activeGrant.grantId);
  const replay = model.reserveRequest(request(activeGrant.grantId));

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.request, first.request);
  assert.deepEqual(model.getGrant(activeGrant.grantId), afterFirst);
  assert.equal(afterFirst.availableUnits, 5);
  assert.equal(afterFirst.heldUnits, 3);
  assertConserved(afterFirst);

  const reactivated = model.activateGrantFromTrustedRecord(grant({ totalUnits: 8 }));
  assert.deepEqual(reactivated, afterFirst);
});

test('requestId conflicts on changed caller-controlled request identity without mutation', async t => {
  const cases = [
    { name: 'method', change: { method: 'GET' } },
    { name: 'body', change: { canonicalBodyDigest: digest('c') } },
    { name: 'route', change: { routeId: 'lookup.v2' } },
    { name: 'selected content type', change: { selectedContentType: 'text/plain' } },
  ];

  for (const entry of cases) {
    await t.test(entry.name, () => {
      const { model, activeGrant } = setup({ totalUnits: 8, cost: 3 });
      model.reserveRequest(request(activeGrant.grantId));
      const grantBefore = model.getGrant(activeGrant.grantId);
      const requestBefore = model.getRequest({
        grantId: activeGrant.grantId,
        requestId: 'request.1',
      });
      expectCode(
        () => model.reserveRequest(request(activeGrant.grantId, entry.change)),
        'REQUEST_ID_CONFLICT',
      );
      assert.deepEqual(model.getGrant(activeGrant.grantId), grantBefore);
      assert.deepEqual(
        model.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }),
        requestBefore,
      );
    });
  }
});

test('every stored request state replays with its first cost pinned and pricing bypassed', async t => {
  const states = [
    REQUEST_STATE.RESERVED,
    REQUEST_STATE.EXECUTING,
    REQUEST_STATE.OUTCOME_UNKNOWN,
    REQUEST_STATE.SUCCEEDED,
    REQUEST_STATE.FAILED_RELEASED,
  ];

  for (const state of states) {
    await t.test(state, () => {
      let pricingMode = 'initial';
      let pricingCalls = 0;
      const model = new InMemoryServiceCreditModel({
        now: () => NOW,
        deriveCost: () => {
          pricingCalls += 1;
          if (pricingMode === 'throw') throw new Error('synthetic-pricing-detail');
          return pricingMode === 'changed' ? 7 : 3;
        },
      });
      model.registerOffer(offer());
      const activeGrant = model.activateGrantFromTrustedRecord(grant());
      const input = request(activeGrant.grantId);
      model.reserveRequest(input);

      if ([
        REQUEST_STATE.EXECUTING,
        REQUEST_STATE.OUTCOME_UNKNOWN,
        REQUEST_STATE.SUCCEEDED,
      ].includes(state)) {
        model.beginExecution({ grantId: activeGrant.grantId, requestId: input.requestId });
      }
      if (state === REQUEST_STATE.OUTCOME_UNKNOWN) {
        model.markOutcomeUnknown({ grantId: activeGrant.grantId, requestId: input.requestId });
      } else if (state === REQUEST_STATE.SUCCEEDED) {
        model.completeExecution({
          grantId: activeGrant.grantId,
          requestId: input.requestId,
          cachedResult: result(),
        });
      } else if (state === REQUEST_STATE.FAILED_RELEASED) {
        model.releaseBeforeExecution({ grantId: activeGrant.grantId, requestId: input.requestId });
      }

      const grantBefore = model.getGrant(activeGrant.grantId);
      const requestBefore = model.getRequest({
        grantId: activeGrant.grantId,
        requestId: input.requestId,
      });
      assert.equal(requestBefore.state, state);
      assert.equal(pricingCalls, 1);

      pricingMode = 'changed';
      const changedPricingReplay = model.reserveRequest(input);
      assert.equal(changedPricingReplay.replayed, true);
      assert.deepEqual(changedPricingReplay.request, requestBefore);
      assert.equal(pricingCalls, 1);

      pricingMode = 'throw';
      const failedPricingReplay = model.reserveRequest(input);
      assert.equal(failedPricingReplay.replayed, true);
      assert.deepEqual(failedPricingReplay.request, requestBefore);
      assert.equal(pricingCalls, 1);
      assert.deepEqual(model.getGrant(activeGrant.grantId), grantBefore);
    });
  }
});

test('concurrent reservations on one instance cannot overspend', async () => {
  const { model, activeGrant } = setup({ totalUnits: 5, cost: 4 });
  const attempts = await Promise.allSettled([
    Promise.resolve().then(() => model.reserveRequest(request(activeGrant.grantId, { requestId: 'request.a' }))),
    Promise.resolve().then(() => model.reserveRequest(request(activeGrant.grantId, { requestId: 'request.b' }))),
  ]);

  assert.equal(attempts.filter(entry => entry.status === 'fulfilled').length, 1);
  const rejection = attempts.find(entry => entry.status === 'rejected');
  assert.equal(rejection.reason.code, 'INSUFFICIENT_UNITS');
  const snapshot = model.getGrant(activeGrant.grantId);
  assert.equal(snapshot.availableUnits, 1);
  assert.equal(snapshot.heldUnits, 4);
  assert.equal(snapshot.consumedUnits, 0);
  assertConserved(snapshot);
});

test('a pre-execution release safely restores held units and is idempotent', () => {
  const { model, activeGrant } = setup({ totalUnits: 7, cost: 4 });
  model.reserveRequest(request(activeGrant.grantId));
  const released = model.releaseBeforeExecution({
    grantId: activeGrant.grantId,
    requestId: 'request.1',
  });
  const replay = model.releaseBeforeExecution({
    grantId: activeGrant.grantId,
    requestId: 'request.1',
  });

  assert.equal(released.transitioned, true);
  assert.equal(released.request.state, REQUEST_STATE.FAILED_RELEASED);
  assert.equal(replay.transitioned, false);
  assert.deepEqual(replay.request, released.request);
  const snapshot = model.getGrant(activeGrant.grantId);
  assert.equal(snapshot.availableUnits, 7);
  assert.equal(snapshot.heldUnits, 0);
  assert.equal(snapshot.consumedUnits, 0);
  assertConserved(snapshot);
  assert.equal(
    model.beginExecution({ grantId: activeGrant.grantId, requestId: 'request.1' }).executionAuthorized,
    false,
  );
});

test('post-execution failure becomes OUTCOME_UNKNOWN without automatic restoration', () => {
  const { model, activeGrant } = setup({ totalUnits: 7, cost: 4 });
  model.reserveRequest(request(activeGrant.grantId));
  model.beginExecution({ grantId: activeGrant.grantId, requestId: 'request.1' });
  const unknown = model.markOutcomeUnknown({
    grantId: activeGrant.grantId,
    requestId: 'request.1',
  });
  const replay = model.markOutcomeUnknown({
    grantId: activeGrant.grantId,
    requestId: 'request.1',
  });

  assert.equal(unknown.transitioned, true);
  assert.equal(unknown.request.state, REQUEST_STATE.OUTCOME_UNKNOWN);
  assert.equal(replay.transitioned, false);
  const snapshot = model.getGrant(activeGrant.grantId);
  assert.equal(snapshot.availableUnits, 3);
  assert.equal(snapshot.heldUnits, 4);
  assert.equal(snapshot.consumedUnits, 0);
  assertConserved(snapshot);
  expectCode(
    () => model.completeExecution({
      grantId: activeGrant.grantId,
      requestId: 'request.1',
      cachedResult: result(),
    }),
    'INVALID_REQUEST_TRANSITION',
  );
});

test('replays of EXECUTING and OUTCOME_UNKNOWN never invoke or reauthorize execution', () => {
  const { model, activeGrant } = setup({ totalUnits: 9, cost: 3 });
  const input = request(activeGrant.grantId);
  model.reserveRequest(input);
  const firstStart = model.beginExecution({
    grantId: activeGrant.grantId,
    requestId: 'request.1',
  });
  assert.equal(firstStart.executionAuthorized, true);

  const executingReplay = model.reserveRequest(input);
  assert.equal(executingReplay.replayed, true);
  assert.equal(executingReplay.request.state, REQUEST_STATE.EXECUTING);
  assert.equal(
    model.beginExecution({ grantId: activeGrant.grantId, requestId: 'request.1' }).executionAuthorized,
    false,
  );

  model.markOutcomeUnknown({ grantId: activeGrant.grantId, requestId: 'request.1' });
  const unknownReplay = model.reserveRequest(input);
  assert.equal(unknownReplay.request.state, REQUEST_STATE.OUTCOME_UNKNOWN);
  assert.equal(
    model.beginExecution({ grantId: activeGrant.grantId, requestId: 'request.1' }).executionAuthorized,
    false,
  );

  let executions = 0;
  expectCode(
    () => model.reserveRequest({ ...input, execute: () => { executions += 1; } }),
    'INVALID_INPUT',
  );
  assert.equal(executions, 0);
});

test('explicit reconciliation can consume or release an unknown hold and is idempotent', () => {
  const { model, activeGrant } = setup({ totalUnits: 10, cost: 3 });
  model.reserveRequest(request(activeGrant.grantId, { requestId: 'request.success' }));
  model.beginExecution({ grantId: activeGrant.grantId, requestId: 'request.success' });
  model.markOutcomeUnknown({ grantId: activeGrant.grantId, requestId: 'request.success' });

  const successInput = {
    grantId: activeGrant.grantId,
    requestId: 'request.success',
    outcome: REQUEST_STATE.SUCCEEDED,
    cachedResult: result(),
  };
  const succeeded = model.reconcileRequest(successInput);
  const successReplay = model.reconcileRequest(successInput);
  assert.equal(succeeded.transitioned, true);
  assert.equal(succeeded.request.state, REQUEST_STATE.SUCCEEDED);
  assert.deepEqual(succeeded.request.cachedResult, result());
  assert.equal(successReplay.transitioned, false);
  assert.deepEqual(successReplay.request, succeeded.request);

  expectCode(
    () => model.reconcileRequest({
      ...successInput,
      cachedResult: result({ resultCode: 'lookup.different' }),
    }),
    'RECONCILIATION_CONFLICT',
  );

  model.reserveRequest(request(activeGrant.grantId, { requestId: 'request.release' }));
  model.beginExecution({ grantId: activeGrant.grantId, requestId: 'request.release' });
  model.markOutcomeUnknown({ grantId: activeGrant.grantId, requestId: 'request.release' });

  const releaseInput = {
    grantId: activeGrant.grantId,
    requestId: 'request.release',
    outcome: REQUEST_STATE.FAILED_RELEASED,
  };
  const released = model.reconcileRequest(releaseInput);
  const releaseReplay = model.reconcileRequest(releaseInput);
  assert.equal(released.transitioned, true);
  assert.equal(released.request.state, REQUEST_STATE.FAILED_RELEASED);
  assert.equal(releaseReplay.transitioned, false);

  const snapshot = model.getGrant(activeGrant.grantId);
  assert.equal(snapshot.availableUnits, 7);
  assert.equal(snapshot.heldUnits, 0);
  assert.equal(snapshot.consumedUnits, 3);
  assertConserved(snapshot);

  const paidReplay = model.reserveRequest(request(activeGrant.grantId, { requestId: 'request.success' }));
  assert.equal(paidReplay.replayed, true);
  assert.equal(paidReplay.request.state, REQUEST_STATE.SUCCEEDED);
  assert.deepEqual(paidReplay.request.cachedResult, result());
  assert.deepEqual(model.getGrant(activeGrant.grantId), snapshot);
});

test('completeExecution replay is idempotent and changed results conflict without a second charge', () => {
  const { model, activeGrant } = setup({ totalUnits: 8, cost: 3 });
  model.reserveRequest(request(activeGrant.grantId));
  model.beginExecution({ grantId: activeGrant.grantId, requestId: 'request.1' });
  const completionInput = {
    grantId: activeGrant.grantId,
    requestId: 'request.1',
    cachedResult: result(),
  };
  const completed = model.completeExecution(completionInput);
  const afterCompletion = model.getGrant(activeGrant.grantId);

  const replay = model.completeExecution(completionInput);
  assert.equal(completed.transitioned, true);
  assert.equal(replay.transitioned, false);
  assert.deepEqual(replay.request, completed.request);
  assert.deepEqual(model.getGrant(activeGrant.grantId), afterCompletion);
  assert.equal(afterCompletion.availableUnits, 5);
  assert.equal(afterCompletion.heldUnits, 0);
  assert.equal(afterCompletion.consumedUnits, 3);
  assertConserved(afterCompletion);

  for (const cachedResult of [
    result({ statusCode: 201 }),
    result({ resultCode: 'lookup.different' }),
  ]) {
    expectCode(
      () => model.completeExecution({ ...completionInput, cachedResult }),
      'RESULT_CONFLICT',
    );
    assert.deepEqual(model.getGrant(activeGrant.grantId), afterCompletion);
    assert.deepEqual(
      model.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }),
      completed.request,
    );
  }
});

test('the same requestId remains isolated across grants and digests stay grant scoped', () => {
  const model = new InMemoryServiceCreditModel({ deriveCost: () => 3, now: () => NOW });
  model.registerOffer(offer());
  const firstGrant = model.activateGrantFromTrustedRecord(grant({ totalUnits: 9 }));
  const secondGrant = model.activateGrantFromTrustedRecord(grant({
    sourceSettlementId: 'settlement.public.2',
    transactionId: 'transaction.public.2',
    holderId: 'holder.public.2',
    capabilityCommitment: digest('c'),
    totalUnits: 9,
    paymentIntent: {
      intentId: 'intent.public.2',
      requirementId: 'requirement.public.2',
    },
  }));

  const first = model.reserveRequest(request(firstGrant.grantId, { requestId: 'request.shared' }));
  const second = model.reserveRequest(request(secondGrant.grantId, { requestId: 'request.shared' }));
  const sameContentDifferentRequest = model.reserveRequest(request(firstGrant.grantId, {
    requestId: 'request.other',
  }));

  assert.notEqual(first.request.requestDigest, second.request.requestDigest);
  assert.equal(first.request.requestDigest, sameContentDifferentRequest.request.requestDigest);

  model.beginExecution({ grantId: firstGrant.grantId, requestId: 'request.shared' });
  model.completeExecution({
    grantId: firstGrant.grantId,
    requestId: 'request.shared',
    cachedResult: result(),
  });
  model.releaseBeforeExecution({ grantId: secondGrant.grantId, requestId: 'request.shared' });

  const firstGrantAfter = model.getGrant(firstGrant.grantId);
  const secondGrantAfter = model.getGrant(secondGrant.grantId);
  assert.deepEqual(
    {
      availableUnits: firstGrantAfter.availableUnits,
      heldUnits: firstGrantAfter.heldUnits,
      consumedUnits: firstGrantAfter.consumedUnits,
    },
    { availableUnits: 3, heldUnits: 3, consumedUnits: 3 },
  );
  assert.deepEqual(
    {
      availableUnits: secondGrantAfter.availableUnits,
      heldUnits: secondGrantAfter.heldUnits,
      consumedUnits: secondGrantAfter.consumedUnits,
    },
    { availableUnits: 9, heldUnits: 0, consumedUnits: 0 },
  );
  assert.equal(
    model.getRequest({ grantId: firstGrant.grantId, requestId: 'request.shared' }).state,
    REQUEST_STATE.SUCCEEDED,
  );
  assert.equal(
    model.getRequest({ grantId: secondGrant.grantId, requestId: 'request.shared' }).state,
    REQUEST_STATE.FAILED_RELEASED,
  );
  assert.equal(
    model.getRequest({ grantId: firstGrant.grantId, requestId: 'request.other' }).state,
    REQUEST_STATE.RESERVED,
  );
  assertConserved(firstGrantAfter);
  assertConserved(secondGrantAfter);
});

test('invalid clock and cost boundaries fail closed without mutation', async t => {
  await t.test('clock boundaries', () => {
    for (const invalidClock of [-1, NOW + 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      const { model, activeGrant, clock } = setup();
      const before = model.getGrant(activeGrant.grantId);
      clock.value = invalidClock;
      expectCode(() => model.getGrant(activeGrant.grantId), 'INVALID_CLOCK');
      clock.value = NOW;
      assert.deepEqual(model.getGrant(activeGrant.grantId), before);
    }
  });

  await t.test('cost boundaries', () => {
    for (const invalidCost of [0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const { model, activeGrant, currentCost } = setup();
      currentCost.value = invalidCost;
      const before = model.getGrant(activeGrant.grantId);
      expectCode(
        () => model.reserveRequest(request(activeGrant.grantId)),
        'INVALID_COST',
      );
      assert.deepEqual(model.getGrant(activeGrant.grantId), before);
      assert.equal(
        model.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }),
        null,
      );
    }
  });
});

test('post-authorization transitions and non-authorizing replays bypass a failed clock', async t => {
  function setupWithFallibleClock({ totalUnits = 7, cost = 4 } = {}) {
    const clock = { calls: 0, failing: false };
    const model = new InMemoryServiceCreditModel({
      now: () => {
        clock.calls += 1;
        if (clock.failing) throw new Error('synthetic-clock-detail');
        return NOW;
      },
      deriveCost: () => cost,
    });
    model.registerOffer(offer());
    const activeGrant = model.activateGrantFromTrustedRecord(grant({ totalUnits }));
    return { model, activeGrant, clock };
  }

  await t.test('pre-execution release and its later-state replay', () => {
    const { model, activeGrant, clock } = setupWithFallibleClock();
    const reference = { grantId: activeGrant.grantId, requestId: 'request.1' };
    model.reserveRequest(request(activeGrant.grantId));
    const callsBefore = clock.calls;
    clock.failing = true;

    const released = model.releaseBeforeExecution(reference);
    const replay = model.releaseBeforeExecution(reference);
    const executionReplay = model.beginExecution(reference);
    assert.equal(model.getRequest(reference).state, REQUEST_STATE.FAILED_RELEASED);

    assert.equal(released.transitioned, true);
    assert.equal(replay.transitioned, false);
    assert.equal(executionReplay.executionAuthorized, false);
    assert.equal(clock.calls, callsBefore);
    clock.failing = false;
    const grantAfter = model.getGrant(activeGrant.grantId);
    assert.deepEqual(
      {
        availableUnits: grantAfter.availableUnits,
        heldUnits: grantAfter.heldUnits,
        consumedUnits: grantAfter.consumedUnits,
      },
      { availableUnits: 7, heldUnits: 0, consumedUnits: 0 },
    );
    assertConserved(grantAfter);
  });

  await t.test('success recording and EXECUTING and SUCCEEDED replays', () => {
    const { model, activeGrant, clock } = setupWithFallibleClock();
    const reference = { grantId: activeGrant.grantId, requestId: 'request.1' };
    model.reserveRequest(request(activeGrant.grantId));
    model.beginExecution(reference);
    const callsBefore = clock.calls;
    clock.failing = true;

    assert.equal(model.beginExecution(reference).executionAuthorized, false);
    const completionInput = { ...reference, cachedResult: result() };
    const completed = model.completeExecution(completionInput);
    const replay = model.completeExecution(completionInput);
    const executionReplay = model.beginExecution(reference);
    assert.equal(model.getRequest(reference).state, REQUEST_STATE.SUCCEEDED);

    assert.equal(completed.transitioned, true);
    assert.equal(replay.transitioned, false);
    assert.equal(executionReplay.executionAuthorized, false);
    assert.equal(clock.calls, callsBefore);
    clock.failing = false;
    const grantAfter = model.getGrant(activeGrant.grantId);
    assert.deepEqual(
      {
        availableUnits: grantAfter.availableUnits,
        heldUnits: grantAfter.heldUnits,
        consumedUnits: grantAfter.consumedUnits,
      },
      { availableUnits: 3, heldUnits: 0, consumedUnits: 4 },
    );
    assertConserved(grantAfter);
  });

  await t.test('unknown recording and successful reconciliation and replays', () => {
    const { model, activeGrant, clock } = setupWithFallibleClock();
    const reference = { grantId: activeGrant.grantId, requestId: 'request.1' };
    model.reserveRequest(request(activeGrant.grantId));
    model.beginExecution(reference);
    const callsBefore = clock.calls;
    clock.failing = true;

    const unknown = model.markOutcomeUnknown(reference);
    const unknownReplay = model.markOutcomeUnknown(reference);
    assert.equal(model.beginExecution(reference).executionAuthorized, false);
    const reconciliationInput = {
      ...reference,
      outcome: REQUEST_STATE.SUCCEEDED,
      cachedResult: result(),
    };
    const reconciled = model.reconcileRequest(reconciliationInput);
    const reconciliationReplay = model.reconcileRequest(reconciliationInput);
    assert.equal(model.beginExecution(reference).executionAuthorized, false);
    assert.equal(model.getRequest(reference).state, REQUEST_STATE.SUCCEEDED);

    assert.equal(unknown.transitioned, true);
    assert.equal(unknownReplay.transitioned, false);
    assert.equal(reconciled.transitioned, true);
    assert.equal(reconciliationReplay.transitioned, false);
    assert.equal(clock.calls, callsBefore);
    clock.failing = false;
    const grantAfter = model.getGrant(activeGrant.grantId);
    assert.deepEqual(
      {
        availableUnits: grantAfter.availableUnits,
        heldUnits: grantAfter.heldUnits,
        consumedUnits: grantAfter.consumedUnits,
      },
      { availableUnits: 3, heldUnits: 0, consumedUnits: 4 },
    );
    assertConserved(grantAfter);
  });

  await t.test('released reconciliation and its later-state replay', () => {
    const { model, activeGrant, clock } = setupWithFallibleClock();
    const reference = { grantId: activeGrant.grantId, requestId: 'request.1' };
    model.reserveRequest(request(activeGrant.grantId));
    model.beginExecution(reference);
    model.markOutcomeUnknown(reference);
    const callsBefore = clock.calls;
    clock.failing = true;

    const reconciliationInput = {
      ...reference,
      outcome: REQUEST_STATE.FAILED_RELEASED,
    };
    const reconciled = model.reconcileRequest(reconciliationInput);
    const replay = model.reconcileRequest(reconciliationInput);
    const executionReplay = model.beginExecution(reference);
    assert.equal(model.getRequest(reference).state, REQUEST_STATE.FAILED_RELEASED);

    assert.equal(reconciled.transitioned, true);
    assert.equal(replay.transitioned, false);
    assert.equal(executionReplay.executionAuthorized, false);
    assert.equal(clock.calls, callsBefore);
    clock.failing = false;
    const grantAfter = model.getGrant(activeGrant.grantId);
    assert.deepEqual(
      {
        availableUnits: grantAfter.availableUnits,
        heldUnits: grantAfter.heldUnits,
        consumedUnits: grantAfter.consumedUnits,
      },
      { availableUnits: 7, heldUnits: 0, consumedUnits: 0 },
    );
    assertConserved(grantAfter);
  });
});

test('expiry blocks new reservations while preserving unresolved and completed records', () => {
  const { model, activeGrant, clock } = setup({ totalUnits: 10, cost: 3 });
  const completedInput = request(activeGrant.grantId, { requestId: 'request.completed' });
  model.reserveRequest(completedInput);
  model.beginExecution({ grantId: activeGrant.grantId, requestId: 'request.completed' });
  model.completeExecution({
    grantId: activeGrant.grantId,
    requestId: 'request.completed',
    cachedResult: result(),
  });
  const unresolvedInput = request(activeGrant.grantId, { requestId: 'request.unresolved' });
  model.reserveRequest(unresolvedInput);
  model.beginExecution({ grantId: activeGrant.grantId, requestId: 'request.unresolved' });
  model.markOutcomeUnknown({ grantId: activeGrant.grantId, requestId: 'request.unresolved' });
  const beforeExpiry = model.getGrant(activeGrant.grantId);

  clock.value = NOW + 10_000;
  assert.equal(model.getGrant(activeGrant.grantId).lifecycle, GRANT_LIFECYCLE.EXPIRED);
  expectCode(
    () => model.reserveRequest(request(activeGrant.grantId, { requestId: 'request.new' })),
    'UNRESOLVED_EXECUTION',
  );
  assert.equal(model.reserveRequest(completedInput).request.state, REQUEST_STATE.SUCCEEDED);
  assert.equal(model.reserveRequest(unresolvedInput).request.state, REQUEST_STATE.OUTCOME_UNKNOWN);
  const afterExpiry = model.getGrant(activeGrant.grantId);
  assert.equal(afterExpiry.lifecycle, GRANT_LIFECYCLE.EXPIRED);
  assert.equal(afterExpiry.availableUnits, beforeExpiry.availableUnits);
  assert.equal(afterExpiry.heldUnits, beforeExpiry.heldUnits);
  assert.equal(afterExpiry.consumedUnits, beforeExpiry.consumedUnits);
  assertConserved(afterExpiry);
  model.reconcileRequest({
    grantId: activeGrant.grantId,
    requestId: unresolvedInput.requestId,
    outcome: REQUEST_STATE.FAILED_RELEASED,
  });
  expectCode(
    () => model.reserveRequest(request(activeGrant.grantId, { requestId: 'request.after-release' })),
    'GRANT_NOT_ACTIVE',
  );
});

test('reservation fails closed when pricing reaches grant expiry before commit', () => {
  const clock = { value: NOW };
  const model = new InMemoryServiceCreditModel({
    now: () => clock.value,
    deriveCost: () => {
      clock.value = NOW + 10_000;
      return 3;
    },
  });
  model.registerOffer(offer());
  const activeGrant = model.activateGrantFromTrustedRecord(grant());
  const before = model.getGrant(activeGrant.grantId);

  assert.equal(before.lifecycle, GRANT_LIFECYCLE.ACTIVE);
  expectCode(
    () => model.reserveRequest(request(activeGrant.grantId)),
    'GRANT_NOT_ACTIVE',
  );

  assert.equal(
    model.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }),
    null,
  );
  const after = model.getGrant(activeGrant.grantId);
  assert.equal(after.lifecycle, GRANT_LIFECYCLE.EXPIRED);
  assert.equal(after.availableUnits, before.availableUnits);
  assert.equal(after.heldUnits, before.heldUnits);
  assert.equal(after.consumedUnits, before.consumedUnits);
  assertConserved(after);
});

test('revocation is monotonic, blocks new reservations, and preserves history', () => {
  const { model, activeGrant, clock } = setup({ totalUnits: 10, cost: 3 });
  const input = request(activeGrant.grantId);
  model.reserveRequest(input);
  model.beginExecution({ grantId: activeGrant.grantId, requestId: 'request.1' });
  const revoked = model.revokeGrant({ grantId: activeGrant.grantId });
  const replay = model.revokeGrant({ grantId: activeGrant.grantId });

  assert.equal(revoked.lifecycle, GRANT_LIFECYCLE.REVOKED);
  assert.deepEqual(replay, revoked);
  expectCode(
    () => model.reserveRequest(request(activeGrant.grantId, { requestId: 'request.new' })),
    'UNRESOLVED_EXECUTION',
  );
  assert.equal(model.reserveRequest(input).request.state, REQUEST_STATE.EXECUTING);
  model.completeExecution({
    grantId: activeGrant.grantId,
    requestId: input.requestId,
    cachedResult: result(),
  });
  expectCode(
    () => model.reserveRequest(request(activeGrant.grantId, {
      requestId: 'request.after-completion',
    })),
    'GRANT_NOT_ACTIVE',
  );
  clock.value = NOW + 20_000;
  assert.equal(model.getGrant(activeGrant.grantId).lifecycle, GRANT_LIFECYCLE.REVOKED);

  const expiring = setup();
  expiring.clock.value = NOW + 10_000;
  assert.equal(expiring.model.getGrant(expiring.activeGrant.grantId).lifecycle, GRANT_LIFECYCLE.EXPIRED);
  expectCode(
    () => expiring.model.revokeGrant({ grantId: expiring.activeGrant.grantId }),
    'INVALID_GRANT_TRANSITION',
  );
});

test('an inactive grant cannot newly authorize a RESERVED request', async t => {
  const cases = [
    {
      name: 'expiry between reservation and execution',
      deactivate({ clock }) {
        clock.value = NOW + 10_000;
      },
      lifecycle: GRANT_LIFECYCLE.EXPIRED,
    },
    {
      name: 'revocation between reservation and execution',
      deactivate({ model, activeGrant }) {
        model.revokeGrant({ grantId: activeGrant.grantId });
      },
      lifecycle: GRANT_LIFECYCLE.REVOKED,
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, () => {
      const { model, activeGrant, clock } = setup({ totalUnits: 7, cost: 4 });
      model.reserveRequest(request(activeGrant.grantId));
      const before = model.getGrant(activeGrant.grantId);
      entry.deactivate({ model, activeGrant, clock });

      expectCode(
        () => model.beginExecution({
          grantId: activeGrant.grantId,
          requestId: 'request.1',
        }),
        'GRANT_NOT_ACTIVE',
      );

      const inactive = model.getGrant(activeGrant.grantId);
      assert.equal(inactive.lifecycle, entry.lifecycle);
      assert.equal(inactive.availableUnits, before.availableUnits);
      assert.equal(inactive.heldUnits, before.heldUnits);
      assert.equal(inactive.consumedUnits, before.consumedUnits);
      assert.equal(
        model.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }).state,
        REQUEST_STATE.RESERVED,
      );
      assertConserved(inactive);

      const released = model.releaseBeforeExecution({
        grantId: activeGrant.grantId,
        requestId: 'request.1',
      });
      assert.equal(released.transitioned, true);
      assert.equal(released.request.state, REQUEST_STATE.FAILED_RELEASED);
      const afterRelease = model.getGrant(activeGrant.grantId);
      assert.equal(afterRelease.availableUnits, 7);
      assert.equal(afterRelease.heldUnits, 0);
      assert.equal(afterRelease.consumedUnits, 0);
      assertConserved(afterRelease);
    });
  }
});

test('strict schema allowlisting rejects unknown fields and non-commitment capability values', () => {
  const model = new InMemoryServiceCreditModel({ deriveCost: () => 3, now: () => NOW });
  model.registerOffer(offer());
  const forbiddenGrantFields = [
    'bearerSecret',
    'walletMaterial',
    'rawPaymentHeader',
    'privateEndpoint',
    'protectedResponseBody',
  ];
  for (const field of forbiddenGrantFields) {
    expectCode(
      () => model.activateGrantFromTrustedRecord({ ...grant(), [field]: 'forbidden-value' }),
      'INVALID_INPUT',
    );
  }
  expectCode(
    () => model.activateGrantFromTrustedRecord(grant({ capabilityCommitment: 'bearer-value' })),
    'INVALID_INPUT',
  );

  const activeGrant = model.activateGrantFromTrustedRecord(grant());
  const baseRequest = request(activeGrant.grantId);
  for (const addition of [
    { bearerSecret: 'forbidden-value' },
    { walletMaterial: 'forbidden-value' },
    { rawPaymentHeader: 'forbidden-value' },
    { url: 'forbidden-value' },
    { costUnits: 1 },
    { body: { protected: true } },
  ]) {
    expectCode(() => model.reserveRequest({ ...baseRequest, ...addition }), 'INVALID_INPUT');
  }

  model.reserveRequest(baseRequest);
  model.beginExecution({ grantId: activeGrant.grantId, requestId: 'request.1' });
  for (const addition of [
    { body: { protected: true } },
    { protectedResponseBody: 'forbidden-value' },
    { headers: { authorization: 'forbidden-value' } },
    { bearerSecret: 'forbidden-value' },
  ]) {
    expectCode(
      () => model.completeExecution({
        grantId: activeGrant.grantId,
        requestId: 'request.1',
        cachedResult: { ...result(), ...addition },
      }),
      'INVALID_INPUT',
    );
  }

  const completed = model.completeExecution({
    grantId: activeGrant.grantId,
    requestId: 'request.1',
    cachedResult: result(),
  });
  const serialized = JSON.stringify({
    grant: model.getGrant(activeGrant.grantId),
    request: completed.request,
  });
  for (const forbidden of [
    'bearerSecret',
    'walletMaterial',
    'rawPaymentHeader',
    'privateEndpoint',
    'protectedResponseBody',
    'forbidden-value',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('deriveCost re-entry cannot reserve the outer request or orphan held units', () => {
  let model;
  let activeGrant;
  let armed = false;
  model = new InMemoryServiceCreditModel({
    now: () => NOW,
    deriveCost: () => {
      if (armed) {
        armed = false;
        model.reserveRequest(request(activeGrant.grantId));
      }
      return 3;
    },
  });
  model.registerOffer(offer());
  activeGrant = model.activateGrantFromTrustedRecord(grant());
  const before = model.getGrant(activeGrant.grantId);

  armed = true;
  expectCode(
    () => model.reserveRequest(request(activeGrant.grantId)),
    'INVALID_COST',
  );

  assert.deepEqual(model.getGrant(activeGrant.grantId), before);
  assert.equal(
    model.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }),
    null,
  );
  assertConserved(model.getGrant(activeGrant.grantId));
});

test('deriveCost re-entry cannot mutate offers, grants, revocation, or expiry', async t => {
  const cases = [
    {
      name: 'offer registration',
      reenter({ model }) {
        model.registerOffer(offer({ offerVersion: 2, costPolicyId: 'policy.next' }));
      },
      verify({ model }) {
        assert.equal(model.getOffer({ offerId: 'offer.standard', offerVersion: 2 }), null);
      },
    },
    {
      name: 'grant activation',
      reenter({ model }) {
        model.activateGrantFromTrustedRecord(grant({
          sourceSettlementId: 'settlement.public.2',
          transactionId: 'transaction.public.2',
          holderId: 'holder.public.2',
          capabilityCommitment: digest('c'),
        }));
      },
    },
    {
      name: 'grant revocation',
      reenter({ model, activeGrant }) {
        model.revokeGrant({ grantId: activeGrant.grantId });
      },
    },
    {
      name: 'grant expiry',
      reenter({ model, activeGrant, clock }) {
        clock.value = NOW + 10_000;
        model.getGrant(activeGrant.grantId);
        clock.value = NOW;
      },
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, () => {
      const clock = { value: NOW };
      let model;
      let activeGrant;
      let armed = false;
      model = new InMemoryServiceCreditModel({
        now: () => clock.value,
        deriveCost: () => {
          if (armed) {
            armed = false;
            try {
              entry.reenter({ model, activeGrant, clock });
            } finally {
              clock.value = NOW;
            }
          }
          return 3;
        },
      });
      model.registerOffer(offer());
      activeGrant = model.activateGrantFromTrustedRecord(grant());
      const before = model.getGrant(activeGrant.grantId);

      armed = true;
      expectCode(
        () => model.reserveRequest(request(activeGrant.grantId)),
        'INVALID_COST',
      );

      assert.deepEqual(model.getGrant(activeGrant.grantId), before);
      assert.equal(
        model.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }),
        null,
      );
      entry.verify?.({ model, activeGrant, clock });
    });
  }
});

test('the callback guard covers every public state operation even when re-entry is caught', () => {
  let model;
  let activeGrant;
  let armed = false;
  const reentryCodes = [];
  model = new InMemoryServiceCreditModel({
    now: () => NOW,
    deriveCost: () => {
      if (armed) {
        armed = false;
        const reference = { grantId: activeGrant.grantId, requestId: 'request.1' };
        const operations = [
          () => model.registerOffer(offer({ offerVersion: 2, costPolicyId: 'policy.next' })),
          () => model.getOffer({ offerId: 'offer.standard', offerVersion: 1 }),
          () => model.activateGrantFromTrustedRecord(grant({
            sourceSettlementId: 'settlement.public.2',
            transactionId: 'transaction.public.2',
            holderId: 'holder.public.2',
            capabilityCommitment: digest('c'),
          })),
          () => model.getGrant(activeGrant.grantId),
          () => model.revokeGrant({ grantId: activeGrant.grantId }),
          () => model.reserveRequest(request(activeGrant.grantId)),
          () => model.getRequest(reference),
          () => model.beginExecution(reference),
          () => model.releaseBeforeExecution(reference),
          () => model.completeExecution({ ...reference, cachedResult: result() }),
          () => model.markOutcomeUnknown(reference),
          () => model.reconcileRequest({
            ...reference,
            outcome: REQUEST_STATE.FAILED_RELEASED,
          }),
          () => model.exportState(),
        ];
        for (const operation of operations) {
          try {
            operation();
          } catch (error) {
            reentryCodes.push(error?.code);
          }
        }
      }
      return 3;
    },
  });
  model.registerOffer(offer());
  activeGrant = model.activateGrantFromTrustedRecord(grant());
  const before = model.getGrant(activeGrant.grantId);

  armed = true;
  expectCode(
    () => model.reserveRequest(request(activeGrant.grantId)),
    'INVALID_COST',
  );

  assert.equal(reentryCodes.length, 13);
  assert.equal(reentryCodes.every(code => code === 'REENTRANT_OPERATION'), true);
  assert.deepEqual(model.getGrant(activeGrant.grantId), before);
  assert.equal(model.getOffer({ offerId: 'offer.standard', offerVersion: 2 }), null);
  assert.equal(model.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }), null);
});

test('now re-entry cannot mutate the model or overwrite a terminal lifecycle', () => {
  let model;
  let activeGrant;
  let armed = false;
  model = new InMemoryServiceCreditModel({
    deriveCost: () => 3,
    now: () => {
      if (armed) {
        armed = false;
        model.revokeGrant({ grantId: activeGrant.grantId });
        return NOW + 10_000;
      }
      return NOW;
    },
  });
  model.registerOffer(offer());
  activeGrant = model.activateGrantFromTrustedRecord(grant());
  const before = model.getGrant(activeGrant.grantId);

  armed = true;
  expectCode(() => model.getGrant(activeGrant.grantId), 'INVALID_CLOCK');

  assert.deepEqual(model.getGrant(activeGrant.grantId), before);
  assert.equal(model.getGrant(activeGrant.grantId).lifecycle, GRANT_LIFECYCLE.ACTIVE);
});

test('callback failures are normalized without leaking callback messages or mutating state', async t => {
  await t.test('clock failure', () => {
    let shouldThrow = false;
    const model = new InMemoryServiceCreditModel({
      deriveCost: () => 1,
      now: () => {
        if (shouldThrow) throw new Error('synthetic-clock-detail');
        return NOW;
      },
    });
    model.registerOffer(offer());
    shouldThrow = true;
    expectCode(() => model.activateGrantFromTrustedRecord(grant()), 'INVALID_CLOCK');
    shouldThrow = false;
    assert.equal(model.activateGrantFromTrustedRecord(grant()).availableUnits, 10);
  });

  await t.test('pricing failure', () => {
    let shouldThrow = false;
    const model = new InMemoryServiceCreditModel({
      now: () => NOW,
      deriveCost: () => {
        if (shouldThrow) throw new Error('synthetic-cost-detail');
        return 3;
      },
    });
    model.registerOffer(offer());
    const activeGrant = model.activateGrantFromTrustedRecord(grant());
    const before = model.getGrant(activeGrant.grantId);
    shouldThrow = true;
    expectCode(
      () => model.reserveRequest(request(activeGrant.grantId)),
      'INVALID_COST',
    );
    shouldThrow = false;
    assert.deepEqual(model.getGrant(activeGrant.grantId), before);
    assert.equal(
      model.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }),
      null,
    );
  });
});

test('injected callbacks are invoked as detached functions', () => {
  let clockThis = 'not-called';
  let costThis = 'not-called';
  const model = new InMemoryServiceCreditModel({
    now: function () {
      clockThis = this;
      return NOW;
    },
    deriveCost: function () {
      costThis = this;
      return 3;
    },
  });
  model.registerOffer(offer());
  const activeGrant = model.activateGrantFromTrustedRecord(grant());
  model.reserveRequest(request(activeGrant.grantId));

  assert.equal(clockThis, undefined);
  assert.equal(costThis, undefined);
});

test('plain-data normalization captures descriptors once and never invokes input get traps', () => {
  const descriptorCalls = new Map();
  const proxiedOffer = new Proxy(offer(), {
    get() {
      throw new Error('synthetic-get-trap-detail');
    },
    getOwnPropertyDescriptor(target, key) {
      descriptorCalls.set(key, (descriptorCalls.get(key) ?? 0) + 1);
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  const model = new InMemoryServiceCreditModel({ deriveCost: () => 1, now: () => NOW });

  const registered = model.registerOffer(proxiedOffer);

  assert.deepEqual(registered, offer());
  assert.equal([...descriptorCalls.values()].every(count => count === 1), true);
});

test('a get trap cannot substitute a synthetic sensitive marker into stored state', () => {
  const replacement = 'synthetic-sensitive-marker';
  const getKeys = [];
  const proxiedOffer = new Proxy(offer(), {
    get(target, key, receiver) {
      getKeys.push(key);
      if (key === 'providerId') return replacement;
      return Reflect.get(target, key, receiver);
    },
  });
  const model = new InMemoryServiceCreditModel({ deriveCost: () => 1, now: () => NOW });

  model.registerOffer(proxiedOffer);
  const stored = model.getOffer({ offerId: 'offer.standard', offerVersion: 1 });

  assert.equal(getKeys.length, 0);
  assert.equal(stored.providerId, 'provider.alpha');
  assert.equal(JSON.stringify(stored).includes(replacement), false);
});

test('invalid descriptor substitution is rejected without storing a request', () => {
  const { model, activeGrant } = setup();
  const before = model.getGrant(activeGrant.grantId);
  const proxiedRequest = new Proxy(request(activeGrant.grantId), {
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (key === 'routeId') {
        return { ...descriptor, value: 'https://synthetic.invalid' };
      }
      return descriptor;
    },
  });

  expectCode(() => model.reserveRequest(proxiedRequest), 'INVALID_INPUT');

  assert.deepEqual(model.getGrant(activeGrant.grantId), before);
  assert.equal(
    model.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }),
    null,
  );
});

test('reflective trap failures map to fixed errors without state mutation', async t => {
  const cases = [
    {
      name: 'prototype trap',
      wrap(input) {
        return new Proxy(input, {
          getPrototypeOf() {
            throw new Error('synthetic-prototype-trap-detail');
          },
        });
      },
    },
    {
      name: 'descriptor trap',
      wrap(input) {
        return new Proxy(input, {
          getOwnPropertyDescriptor(target, key) {
            if (key === 'requestId') throw new Error('synthetic-descriptor-trap-detail');
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        });
      },
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, () => {
      const { model, activeGrant } = setup();
      const before = model.getGrant(activeGrant.grantId);
      expectCode(
        () => model.reserveRequest(entry.wrap(request(activeGrant.grantId))),
        'INVALID_INPUT',
      );
      assert.deepEqual(model.getGrant(activeGrant.grantId), before);
      assert.equal(
        model.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }),
        null,
      );
    });
  }
});

test('request reflection cannot re-enter a mutating operation before validation', async t => {
  const cases = [
    {
      name: 'prototype trap',
      wrap(input, attempt) {
        return new Proxy(input, {
          getPrototypeOf() {
            attempt();
            throw new Error('synthetic-prototype-trap-detail');
          },
        });
      },
    },
    {
      name: 'own-keys trap',
      wrap(input, attempt) {
        return new Proxy(input, {
          ownKeys() {
            attempt();
            throw new Error('synthetic-own-keys-trap-detail');
          },
        });
      },
    },
    {
      name: 'descriptor trap',
      wrap(input, attempt) {
        return new Proxy(input, {
          getOwnPropertyDescriptor() {
            attempt();
            throw new Error('synthetic-descriptor-trap-detail');
          },
        });
      },
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, () => {
      const { model, activeGrant } = setup();
      const before = model.getGrant(activeGrant.grantId);
      const proxiedRequest = entry.wrap(request(activeGrant.grantId), () => {
        model.revokeGrant({ grantId: activeGrant.grantId });
      });

      expectCode(() => model.reserveRequest(proxiedRequest), 'INVALID_INPUT');

      assert.deepEqual(model.getGrant(activeGrant.grantId), before);
      assert.equal(
        model.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }),
        null,
      );
      const laterReservation = model.reserveRequest(request(activeGrant.grantId));
      assert.equal(laterReservation.request.state, REQUEST_STATE.RESERVED);
      const grantAfter = model.getGrant(activeGrant.grantId);
      assert.deepEqual(
        {
          availableUnits: grantAfter.availableUnits,
          heldUnits: grantAfter.heldUnits,
          consumedUnits: grantAfter.consumedUnits,
        },
        { availableUnits: 7, heldUnits: 3, consumedUnits: 0 },
      );
      assertConserved(grantAfter);
    });
  }
});

test('a cached-result descriptor trap can catch fixed re-entry errors without poisoning the outer call', () => {
  const { model, activeGrant } = setup();
  const reference = { grantId: activeGrant.grantId, requestId: 'request.1' };
  model.reserveRequest(request(activeGrant.grantId));
  model.beginExecution(reference);
  const independentModel = new InMemoryServiceCreditModel({
    deriveCost: () => 1,
    now: () => NOW,
  });
  const reentryCodes = [];
  let attempted = false;
  const proxiedResult = new Proxy(result(), {
    getOwnPropertyDescriptor(target, key) {
      if (!attempted) {
        attempted = true;
        const operations = [
          () => model.registerOffer(offer({ offerVersion: 2, costPolicyId: 'policy.next' })),
          () => model.revokeGrant({ grantId: activeGrant.grantId }),
          () => model.markOutcomeUnknown(reference),
          () => model.reconcileRequest({
            ...reference,
            outcome: REQUEST_STATE.FAILED_RELEASED,
          }),
        ];
        for (const operation of operations) {
          try {
            operation();
          } catch (error) {
            reentryCodes.push(error?.code);
          }
        }
        independentModel.registerOffer(offer());
      }
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });

  const completed = model.completeExecution({
    ...reference,
    cachedResult: proxiedResult,
  });

  assert.deepEqual(reentryCodes, Array(4).fill('REENTRANT_OPERATION'));
  assert.equal(completed.transitioned, true);
  assert.equal(completed.request.state, REQUEST_STATE.SUCCEEDED);
  assert.equal(model.getOffer({ offerId: 'offer.standard', offerVersion: 2 }), null);
  assert.equal(
    independentModel.getOffer({ offerId: 'offer.standard', offerVersion: 1 })?.offerVersion,
    1,
  );
  const grantAfter = model.getGrant(activeGrant.grantId);
  assert.equal(grantAfter.lifecycle, GRANT_LIFECYCLE.ACTIVE);
  assert.deepEqual(
    {
      availableUnits: grantAfter.availableUnits,
      heldUnits: grantAfter.heldUnits,
      consumedUnits: grantAfter.consumedUnits,
    },
    { availableUnits: 7, heldUnits: 0, consumedUnits: 3 },
  );
  assertConserved(grantAfter);
});

test('a rejected cached-result Proxy cannot mutate grant lifecycle before validation', () => {
  const { model, activeGrant, clock } = setup();
  model.reserveRequest(request(activeGrant.grantId));
  model.beginExecution({ grantId: activeGrant.grantId, requestId: 'request.1' });
  const before = model.getGrant(activeGrant.grantId);
  const proxiedResult = new Proxy(result(), {
    getPrototypeOf() {
      throw new Error('synthetic-cached-result-trap-detail');
    },
  });

  clock.value = NOW + 10_000;
  expectCode(
    () => model.completeExecution({
      grantId: activeGrant.grantId,
      requestId: 'request.1',
      cachedResult: proxiedResult,
    }),
    'INVALID_INPUT',
  );
  clock.value = NOW;

  assert.deepEqual(model.getGrant(activeGrant.grantId), before);
  assert.equal(
    model.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }).state,
    REQUEST_STATE.EXECUTING,
  );
});

test('exportState is deterministic, deeply frozen, and hydrates without invoking callbacks', () => {
  const { model, activeGrant } = setup({ totalUnits: 9, cost: 3 });
  model.registerOffer(offer({ offerVersion: 2, costPolicyId: 'policy.next' }));
  model.reserveRequest(request(activeGrant.grantId, { requestId: 'request.z' }));
  model.reserveRequest(request(activeGrant.grantId, { requestId: 'request.a' }));
  model.beginExecution({ grantId: activeGrant.grantId, requestId: 'request.a' });

  const exported = model.exportState();
  assert.equal(Object.isFrozen(exported), true);
  assert.equal(Object.isFrozen(exported.offers), true);
  assert.equal(Object.isFrozen(exported.grants), true);
  assert.equal(Object.isFrozen(exported.requests), true);

  const recovered = InMemoryServiceCreditModel.fromState({
    now: () => { throw new Error('hydration-must-not-read-clock'); },
    deriveCost: () => { throw new Error('hydration-must-not-price'); },
  }, JSON.parse(JSON.stringify(exported)));
  assert.deepEqual(recovered.exportState(), exported);
  assert.equal(
    JSON.stringify(recovered.exportState()),
    JSON.stringify(exported),
  );
  assert.equal(
    recovered.beginExecution({ grantId: activeGrant.grantId, requestId: 'request.a' })
      .executionAuthorized,
    false,
  );
});

test('fromState rejects deterministic-identity, accounting, and lifecycle corruption', async t => {
  const { model, activeGrant } = setup({ totalUnits: 10, cost: 3 });
  model.reserveRequest(request(activeGrant.grantId));
  const baseline = model.exportState();
  const corruptions = [
    ['state schema', state => { state.schemaVersion = 1; }],
    ['model version', state => { state.modelVersion = 2; }],
    ['grant id', state => { state.grants[0].grantId = 'grant_forged'; }],
    ['request digest', state => { state.requests[0].requestDigest = digest('f'); }],
    ['request cost', state => { state.requests[0].costUnits = 4; }],
    ['grant counters', state => { state.grants[0].heldUnits = 4; }],
    ['unsafe integer', state => { state.grants[0].totalUnits = Number.MAX_SAFE_INTEGER + 1; }],
    ['orphan request', state => { state.requests[0].grantId = 'grant_missing'; }],
    ['missing offer reference', state => { state.offers = []; }],
    ['duplicate grant identity', state => { state.grants.push(structuredClone(state.grants[0])); }],
    ['duplicate request identity', state => { state.requests.push(structuredClone(state.requests[0])); }],
    ['illegal lifecycle', state => { state.grants[0].lifecycle = 'UNKNOWN'; }],
    ['illegal cached result', state => { state.requests[0].cachedResult = result(); }],
    ['illegal success without result', state => {
      state.requests[0].state = REQUEST_STATE.SUCCEEDED;
      state.grants[0].heldUnits = 0;
      state.grants[0].consumedUnits = 3;
      state.requests[0].cachedResult = null;
    }],
    ['noncanonical offer order', state => {
      state.offers.push({ ...state.offers[0], offerVersion: 2 });
      state.offers.reverse();
    }],
    ['unknown grant key', state => { state.grants[0].extra = true; }],
    ['unknown root key', state => { state.extra = true; }],
  ];

  for (const [name, corrupt] of corruptions) {
    await t.test(name, () => {
      const state = JSON.parse(JSON.stringify(baseline));
      corrupt(state);
      expectCode(
        () => InMemoryServiceCreditModel.fromState({
          now: () => NOW,
          deriveCost: () => 3,
        }, state),
        'INVALID_STATE',
      );
    });
  }
});

test('fromState captures array length descriptors without invoking length get traps', () => {
  const { model } = setup();
  const state = JSON.parse(JSON.stringify(model.exportState()));
  let lengthGets = 0;
  state.offers = new Proxy(state.offers, {
    get(target, key, receiver) {
      if (key === 'length') {
        lengthGets += 1;
        throw new Error('synthetic-length-get-detail');
      }
      return Reflect.get(target, key, receiver);
    },
  });

  const recovered = InMemoryServiceCreditModel.fromState({
    now: () => { throw new Error('unused-clock'); },
    deriveCost: () => { throw new Error('unused-pricing'); },
  }, state);

  assert.equal(lengthGets, 0);
  assert.deepEqual(recovered.exportState(), model.exportState());
});

test('fromState recomputes every durable activation binding and rejects duplicate activation records', async t => {
  const { model } = setup();
  const baseline = model.exportState();
  const mutations = [
    ['activation id', record => { record.activationId = 'activation_forged'; }],
    ['authority profile', record => { record.activation.authorityProfileId = 'authority.changed'; }],
    ['authority profile version', record => { record.activation.authorityProfileVersion = 2; }],
    ['verifier version', record => { record.activation.verifierVersion = 2; }],
    ['authority digest', record => { record.activation.authorityRecordDigest = digest('9'); }],
    ['funding policy', record => { record.activation.fundingPolicyId = 'funding.changed'; }],
    ['funding policy version', record => { record.activation.fundingPolicyVersion = 2; }],
    ['settlement', record => { record.activation.sourceSettlementId = 'settlement.changed'; }],
    ['transaction', record => { record.activation.transactionId = `mocktx:${'9'.repeat(64)}`; }],
    ['provider', record => { record.activation.providerId = 'provider.changed'; }],
    ['service', record => { record.activation.serviceId = 'service.changed'; }],
    ['resource', record => { record.activation.resourceId = 'resource.changed'; }],
    ['resource binding', record => { record.activation.resourceBinding = digest('9'); }],
    ['offer', record => { record.activation.offerId = 'offer.changed'; }],
    ['offer version', record => { record.activation.offerVersion = 2; }],
    ['holder', record => { record.activation.holderId = 'holder.changed'; }],
    ['capability', record => { record.activation.capabilityCommitment = digest('9'); }],
    ['units', record => { record.activation.totalUnits = 11; }],
    ['expiry', record => { record.activation.expiresAt += 1; }],
    ['scheme', record => { record.activation.scheme = 'authorization'; }],
    ['payment flow', record => { record.activation.paymentFlow = 'authorization'; }],
    ['network', record => { record.activation.network = 'zenon:testnet'; }],
    ['chain version', record => { record.activation.chainProfile.version = 2; }],
    ['chain identifier', record => { record.activation.chainProfile.chainIdentifier = '7'; }],
    ['chain genesis', record => { record.activation.chainProfile.genesisMomentumHash = '9'.repeat(64); }],
    ['asset', record => { record.activation.asset = 'zts1changed'; }],
    ['amount', record => { record.activation.amount = '2'; }],
    ['payee', record => { record.activation.payee = 'payee.changed'; }],
    ['payer', record => { record.activation.payer = 'payer.changed'; }],
    ['resource digest', record => { record.activation.paymentResourceDigest = digest('9'); }],
    ['requirement digest', record => { record.activation.paymentRequirementDigest = digest('9'); }],
    ['intent digest', record => { record.activation.paymentIntentDigest = digest('9'); }],
    ['funding commitment', record => { record.activation.grantFundingCommitment = digest('9'); }],
    ['evidence state', record => { record.activation.evidenceState = 'SUBMISSION_ACKNOWLEDGED'; }],
    ['confirmation policy', record => { record.activation.confirmationPolicy.policyVersion = 2; }],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, () => {
      const state = structuredClone(baseline);
      mutate(state.grants[0]);
      expectCode(
        () => InMemoryServiceCreditModel.fromState({
          now: () => { throw new Error('unused'); },
          deriveCost: () => { throw new Error('unused'); },
        }, state),
        'INVALID_STATE',
      );
    });
  }

  const duplicate = structuredClone(baseline);
  duplicate.grants.push(structuredClone(duplicate.grants[0]));
  expectCode(
    () => InMemoryServiceCreditModel.fromState({
      now: () => NOW,
      deriveCost: () => 1,
    }, duplicate),
    'INVALID_STATE',
  );
});

test('fromState independently rejects duplicate settlement, transaction, and capability identities', async t => {
  const model = new InMemoryServiceCreditModel({ deriveCost: () => 1, now: () => NOW });
  model.registerOffer(offer());
  model.activateGrantFromTrustedRecord(grant());
  model.activateGrantFromTrustedRecord(grant({
    sourceSettlementId: 'settlement.public.2',
    transactionId: 'transaction.public.2',
    holderId: 'holder.public.2',
    capabilityCommitment: digest('c'),
    paymentIntent: {
      intentId: 'intent.public.2',
      requirementId: 'requirement.public.2',
    },
  }));
  const baseline = model.exportState();
  const cases = [
    ['source settlement', 'sourceSettlementId'],
    ['transaction', 'transactionId'],
    ['capability commitment', 'capabilityCommitment'],
  ];

  for (const [name, field] of cases) {
    await t.test(name, () => {
      const state = JSON.parse(JSON.stringify(baseline));
      const first = state.grants.find(entry => entry.holderId === 'holder.public.1');
      const second = state.grants.find(entry => entry.holderId === 'holder.public.2');
      second[field] = first[field];
      second.grantId = deterministicGrantId(second);
      state.grants.sort((left, right) => left.grantId < right.grantId ? -1 : 1);
      expectCode(
        () => InMemoryServiceCreditModel.fromState({
          now: () => { throw new Error('unused-clock'); },
          deriveCost: () => { throw new Error('unused-pricing'); },
        }, state),
        'INVALID_STATE',
      );
    });
  }
});

test('maxCostUnits is persisted and enforced before any reservation mutation', () => {
  let pricingCalls = 0;
  let pricingContext;
  const model = new InMemoryServiceCreditModel({
    now: () => NOW,
    deriveCost: context => {
      pricingCalls += 1;
      pricingContext = context;
      return 3;
    },
  });
  model.registerOffer(offer());
  const activeGrant = model.activateGrantFromTrustedRecord(grant());
  const before = model.exportState();

  expectCode(
    () => model.reserveRequest(request(activeGrant.grantId, { maxCostUnits: 2 })),
    'COST_NOT_AUTHORIZED',
  );
  assert.deepEqual(model.exportState(), before);
  assert.equal(
    model.getRequest({ grantId: activeGrant.grantId, requestId: 'request.1' }),
    null,
  );
  assert.equal(Object.hasOwn(pricingContext.request, 'maxCostUnits'), false);

  const reserved = model.reserveRequest(request(activeGrant.grantId, { maxCostUnits: 3 }));
  assert.equal(reserved.request.maxCostUnits, 3);
  assert.equal(reserved.request.costUnits, 3);
  assert.equal(pricingCalls, 2);
});

test('a changed maxCostUnits conflicts before repricing or mutation', () => {
  let pricingCalls = 0;
  const model = new InMemoryServiceCreditModel({
    now: () => NOW,
    deriveCost: () => {
      pricingCalls += 1;
      return 3;
    },
  });
  model.registerOffer(offer());
  const activeGrant = model.activateGrantFromTrustedRecord(grant());
  const first = model.reserveRequest(request(activeGrant.grantId, { maxCostUnits: 3 }));
  const before = model.exportState();

  expectCode(
    () => model.reserveRequest(request(activeGrant.grantId, { maxCostUnits: 4 })),
    'REQUEST_ID_CONFLICT',
  );
  assert.equal(pricingCalls, 1);
  assert.deepEqual(model.exportState(), before);
  assert.equal(
    model.reserveRequest(request(activeGrant.grantId, { maxCostUnits: 3 })).request.requestDigest,
    first.request.requestDigest,
  );
  assert.equal(pricingCalls, 1);
});

test('maxCostUnits accepts only positive safe integers before pricing', () => {
  let pricingCalls = 0;
  const model = new InMemoryServiceCreditModel({
    now: () => NOW,
    deriveCost: () => {
      pricingCalls += 1;
      return 1;
    },
  });
  model.registerOffer(offer());
  const activeGrant = model.activateGrantFromTrustedRecord(grant());

  for (const maxCostUnits of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '3', null]) {
    expectCode(
      () => model.reserveRequest(request(activeGrant.grantId, {
        requestId: `request.invalid.${String(maxCostUnits)}`,
        maxCostUnits,
      })),
      'INVALID_INPUT',
    );
  }
  const missing = request(activeGrant.grantId, { requestId: 'request.missing' });
  delete missing.maxCostUnits;
  expectCode(() => model.reserveRequest(missing), 'INVALID_INPUT');
  assert.equal(pricingCalls, 0);
  assert.equal(model.getGrant(activeGrant.grantId).availableUnits, 10);
});

test('fromState rejects missing, digest-mismatched, and under-ceiling request state', async t => {
  const { model, activeGrant } = setup({ cost: 3 });
  model.reserveRequest(request(activeGrant.grantId, { maxCostUnits: 3 }));
  const baseline = model.exportState();

  const corruptions = [
    ['missing ceiling', record => { delete record.maxCostUnits; }],
    ['changed ceiling without digest', record => { record.maxCostUnits = 4; }],
    ['stored cost above recomputed ceiling', record => {
      record.maxCostUnits = 2;
      record.requestDigest = deterministicRequestDigest(record);
    }],
  ];

  for (const [name, corrupt] of corruptions) {
    await t.test(name, () => {
      const state = JSON.parse(JSON.stringify(baseline));
      corrupt(state.requests[0]);
      expectCode(
        () => InMemoryServiceCreditModel.fromState({
          now: () => { throw new Error('unused-clock'); },
          deriveCost: () => { throw new Error('unused-pricing'); },
        }, state),
        'INVALID_STATE',
      );
    });
  }
});
