import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { paymentIntentDigest, sha256Hex } from '../src/canonical.js';
import {
  DELIVERY_STATES,
  EVIDENCE_STATES,
} from '../src/settlement-journal.js';
import * as recoveryPlanModule from '../src/service-credit-zenon-exact-hash-recovery-plan.js';

const { planZenonExactHashRecovery } = recoveryPlanModule;
const ERROR_CODE = 'zenon_exact_hash_recovery_plan_rejected';
const SOURCE_URL = new URL(
  '../src/service-credit-zenon-exact-hash-recovery-plan.js',
  import.meta.url,
);

function attempt() {
  const chainProfile = {
    version: 1,
    chainIdentifier: '7',
    genesisMomentumHash: '4'.repeat(64),
  };
  const resourceIdentity = {
    url: 'http://example.test/paid',
    description: 'deterministic test resource',
    mimeType: 'application/json',
  };
  const acceptedRequirement = {
    scheme: 'exact',
    network: 'zenon:testnet',
    asset: 'zts1qqqqqqqqqqqqtq587y',
    amount: '100',
    payTo: 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f',
    maxTimeoutSeconds: 30,
    extra: {
      paymentFlow: 'upfront',
      poc: true,
      settlement: 'account-block',
      zenonChain: structuredClone(chainProfile),
    },
  };
  const intentDigest = paymentIntentDigest({
    x402Version: 2,
    resource: resourceIdentity,
    accepts: [acceptedRequirement],
  }, acceptedRequirement);
  const transactionHash = '1'.repeat(64);
  const resourceDigest = sha256Hex(resourceIdentity);
  const authorizationKey = sha256Hex({
    domain: 'zenon-x402-authorization-v1',
    chainProfile,
    intentDigest,
    resourceDigest,
    transactionHash,
  });
  const payer = 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f';
  return {
    authorizationKey,
    transactionHash,
    chainProfile,
    intentDigest,
    resourceIdentity,
    resourceDigest,
    payer,
    signedAccountBlock: {
      version: 1,
      chainIdentifier: Number(chainProfile.chainIdentifier),
      blockType: 2,
      hash: transactionHash,
      previousHash: '5'.repeat(64),
      height: 2,
      momentumAcknowledged: { hash: '6'.repeat(64), height: 10 },
      address: payer,
      toAddress: 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f',
      amount: '100',
      tokenStandard: 'zts1qqqqqqqqqqqqtq587y',
      fromBlockHash: '0'.repeat(64),
      data: Buffer.from(intentDigest, 'hex').toString('base64'),
      fusedPlasma: 0,
      difficulty: 0,
      nonce: '0'.repeat(16),
      publicKey: Buffer.alloc(32, 1).toString('base64'),
      signature: Buffer.alloc(64, 2).toString('base64'),
    },
  };
}

function recoverySnapshot(evidenceState = EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN) {
  return {
    revision: 9,
    kind: 'record',
    entry: {
      ...attempt(),
      evidenceState,
      momentumEvidence: null,
      deliveryState: DELIVERY_STATES.NONE,
      cachedResponse: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:01:00.000Z',
    },
  };
}

function unavailableObservation() {
  return { observationVersion: 1, status: 'UNAVAILABLE' };
}

function absentObservation() {
  return { observationVersion: 1, status: 'ABSENT' };
}

function exactObservation(snapshot, confirmationDetail = null) {
  return {
    observationVersion: 1,
    status: 'EXACT_MATCH',
    accountBlock: structuredClone(snapshot.entry.signedAccountBlock),
    confirmationDetail: structuredClone(confirmationDetail),
  };
}

function inclusion(overrides = {}) {
  return {
    numConfirmations: overrides.numConfirmations ?? 2,
    momentumHeight: overrides.momentumHeight ?? 42,
    momentumHash: overrides.momentumHash ?? 'a'.repeat(64),
    momentumTimestamp: overrides.momentumTimestamp ?? 1_700_000_000,
  };
}

function expectedPlan(snapshot, overrides) {
  return {
    planVersion: 1,
    scope: 'SOURCE_ONLY_EXACT_HASH',
    disposition: overrides.disposition,
    reason: overrides.reason,
    identity: {
      authorizationKey: snapshot.entry.authorizationKey,
      transactionHash: snapshot.entry.transactionHash,
    },
    expected: {
      revision: snapshot.revision,
      evidenceState: snapshot.entry.evidenceState,
      deliveryState: DELIVERY_STATES.NONE,
    },
    update: overrides.update,
    assertions: {
      nonpublication: 'NOT_ESTABLISHED',
      canonicality: 'NOT_ESTABLISHED',
      chainFinality: 'NOT_ESTABLISHED',
      independentAuthentication: 'NOT_ESTABLISHED',
    },
    sideEffects: 'NONE',
  };
}

function assertDeeplyFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeeplyFrozen(child, seen);
}

function containsFunction(value, seen = new Set()) {
  if (typeof value === 'function') return true;
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some(child => containsFunction(child, seen));
}

function assertRejected(snapshot, observation) {
  assert.throws(
    () => planZenonExactHashRecovery(snapshot, observation),
    error => {
      assert.equal(error?.name, 'ZenonExactHashRecoveryPlanError');
      assert.equal(error?.code, ERROR_CODE);
      assert.equal(error?.message, ERROR_CODE);
      assert.equal(error?.stack, undefined);
      assert.equal(error?.cause, undefined);
      return true;
    },
  );
}

test('absent and unavailable exact-hash observations preserve ambiguity with no mutation', () => {
  assert.deepEqual(Object.keys(recoveryPlanModule), ['planZenonExactHashRecovery']);

  for (const state of [
    EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
    EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
  ]) {
    for (const [observation, reason] of [
      [unavailableObservation(), 'OBSERVATION_UNAVAILABLE'],
      [absentObservation(), 'EXACT_HASH_ABSENT'],
    ]) {
      const snapshot = recoverySnapshot(state);
      const beforeSnapshot = structuredClone(snapshot);
      const beforeObservation = structuredClone(observation);
      const plan = planZenonExactHashRecovery(snapshot, observation);

      assert.deepEqual(plan, expectedPlan(snapshot, {
        disposition: 'NO_MUTATION',
        reason,
        update: null,
      }));
      assert.deepEqual(snapshot, beforeSnapshot);
      assert.deepEqual(observation, beforeObservation);
      assert.equal(plan.assertions.nonpublication, 'NOT_ESTABLISHED');
      assert.equal(containsFunction(plan), false);
      assertDeeplyFrozen(plan);
    }
  }
});

test('an exact block without inclusion advances only UNKNOWN and no-ops ACKNOWLEDGED', () => {
  const unknown = recoverySnapshot();
  const unknownPlan = planZenonExactHashRecovery(unknown, exactObservation(unknown));
  assert.deepEqual(unknownPlan, expectedPlan(unknown, {
    disposition: 'EVIDENCE_UPDATE',
    reason: 'EXACT_HASH_OBSERVED',
    update: {
      evidenceState: EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      confirmationDetail: null,
    },
  }));

  const acknowledged = recoverySnapshot(EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED);
  const acknowledgedPlan = planZenonExactHashRecovery(
    acknowledged,
    exactObservation(acknowledged),
  );
  assert.deepEqual(acknowledgedPlan, expectedPlan(acknowledged, {
    disposition: 'NO_MUTATION',
    reason: 'ALREADY_ACKNOWLEDGED',
    update: null,
  }));
});

test('exact included blocks plan required Momentum evidence from either allowed initial state', () => {
  for (const state of [
    EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
    EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
  ]) {
    const snapshot = recoverySnapshot(state);
    const confirmationDetail = inclusion();
    const observation = exactObservation(snapshot, confirmationDetail);
    const plan = planZenonExactHashRecovery(snapshot, observation);

    assert.deepEqual(plan, expectedPlan(snapshot, {
      disposition: 'EVIDENCE_UPDATE',
      reason: 'EXACT_HASH_INCLUDED',
      update: {
        evidenceState: EVIDENCE_STATES.MOMENTUM_INCLUDED,
        confirmationDetail,
      },
    }));
    observation.confirmationDetail.numConfirmations = 99;
    snapshot.entry.transactionHash = '2'.repeat(64);
    assert.equal(plan.update.confirmationDetail.numConfirmations, 2);
    assert.equal(plan.identity.transactionHash, '1'.repeat(64));
    assertDeeplyFrozen(plan);
  }
});

test('only initial ambiguous records with delivery NONE are eligible', () => {
  for (const state of [
    EVIDENCE_STATES.VALIDATED,
    EVIDENCE_STATES.MOMENTUM_INCLUDED,
  ]) {
    const snapshot = recoverySnapshot(state);
    assertRejected(snapshot, unavailableObservation());
  }

  for (const deliveryState of [
    DELIVERY_STATES.DELIVERY_PENDING,
    DELIVERY_STATES.DELIVERED,
  ]) {
    const snapshot = recoverySnapshot();
    snapshot.entry.deliveryState = deliveryState;
    assertRejected(snapshot, unavailableObservation());
  }

  for (const kind of [null, 'tombstone', 'candidate']) {
    const snapshot = recoverySnapshot();
    snapshot.kind = kind;
    assertRejected(snapshot, unavailableObservation());
  }
});

test('malformed, foreign, conflicting, and ambiguous observations fail closed', () => {
  const snapshot = recoverySnapshot();
  const foreign = exactObservation(snapshot);
  foreign.accountBlock.hash = '2'.repeat(64);
  const conflicting = exactObservation(snapshot);
  conflicting.accountBlock.amount = '101';
  const malformedInclusion = exactObservation(snapshot, inclusion());
  malformedInclusion.confirmationDetail.numConfirmations = 0;

  for (const observation of [
    undefined,
    null,
    {},
    { observationVersion: 1, status: 'AMBIGUOUS' },
    { ...absentObservation(), accountBlock: null },
    { observationVersion: 2, status: 'ABSENT' },
    foreign,
    conflicting,
    malformedInclusion,
    { ...exactObservation(snapshot), extra: false },
  ]) assertRejected(snapshot, observation);
});

test('plain own data is required and hostile accessors and proxies are not invoked', () => {
  const snapshot = recoverySnapshot();
  const getterObservation = { observationVersion: 1 };
  let getterRead = false;
  Object.defineProperty(getterObservation, 'status', {
    enumerable: true,
    get() {
      getterRead = true;
      throw new Error('must not be read');
    },
  });

  assertRejected(snapshot, getterObservation);
  assert.equal(getterRead, false);
  assertRejected(new Proxy(snapshot, {}), unavailableObservation());
  assertRejected(snapshot, new Proxy(absentObservation(), {}));
  assertRejected(Object.assign(Object.create(null), snapshot), unavailableObservation());
  assertRejected(snapshot, Object.assign(Object.create(null), absentObservation()));

  const nestedGetter = exactObservation(snapshot);
  let nestedRead = false;
  Object.defineProperty(nestedGetter.accountBlock, 'amount', {
    enumerable: true,
    get() {
      nestedRead = true;
      return '100';
    },
  });
  assertRejected(snapshot, nestedGetter);
  assert.equal(nestedRead, false);
});

test('stale or mutated snapshot identity and oversized input are rejected within fixed bounds', () => {
  const changedIdentity = recoverySnapshot();
  changedIdentity.entry.transactionHash = '2'.repeat(64);
  changedIdentity.entry.signedAccountBlock.hash = changedIdentity.entry.transactionHash;
  assertRejected(changedIdentity, exactObservation(changedIdentity));

  const changedResource = recoverySnapshot();
  changedResource.entry.resourceIdentity.description = 'changed after validation';
  assertRejected(changedResource, unavailableObservation());

  const oversized = recoverySnapshot();
  oversized.entry.resourceIdentity.description = 'x'.repeat(300 * 1024);
  assertRejected(oversized, unavailableObservation());
});

test('the source is a synchronous data-only planner with no I/O or mutation owner', () => {
  const source = readFileSync(SOURCE_URL, 'utf8');
  assert.doesNotMatch(source, /from ['"]node:(?:fs|http|https|net|child_process|worker_threads)['"]/);
  assert.doesNotMatch(
    source,
    /\b(?:fetch|WebSocket|publishRawTransaction|prepareBlock|settle|markDeliveryPending|markDelivered|compareAndUpdateEvidence)\b/,
  );
  assert.doesNotMatch(source, /\basync\b/);
});
