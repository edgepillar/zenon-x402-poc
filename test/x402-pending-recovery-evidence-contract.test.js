import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Unexecuted draft. Module evaluation would read JSON data and register tests.
// Synthetic examples exercise declared-data consistency only, not SDK recovery.
const plan = JSON.parse(readFileSync(
  new URL('./fixtures/x402-pending-recovery-evidence-v1.json', import.meta.url), 'utf8',
));
const identityFields = [
  'signedPaymentBytes', 'signedPaymentHash', 'payloadBytes', 'requirementsBytes', 'contextBinding',
];
const zeroCounters = [
  'publicationAttempts', 'signatures', 'replacementCharges', 'replacementChallenges', 'contextResets',
];
const boundary = 'AFTER_UNACKNOWLEDGED_ORIGINAL_PUBLICATION_RESPONSE';

function syntheticTrace(terminal = 'success') {
  const original = {
    signedPaymentBytes: 'SYNTHETIC_SIGNED_BYTES_A',
    signedPaymentHash: 'SYNTHETIC_PAYMENT_HASH_A',
    payloadBytes: 'SYNTHETIC_PAYLOAD_BYTES_A',
    requirementsBytes: 'SYNTHETIC_REQUIREMENTS_BYTES_A',
    contextBinding: 'SYNTHETIC_CONTEXT_A',
  };
  const events = [
    { kind: 'SETTLEMENT_RESULT', call: 1, input: { ...original }, result: 'settlement_pending' },
    { kind: 'SETTLEMENT_RESULT', call: 2, input: { ...original }, result: terminal },
  ];
  if (terminal === 'success') {
    events.push({ kind: 'RESOURCE_DELIVERY', paymentHash: original.signedPaymentHash });
  }
  return {
    evidenceClass: 'SYNTHETIC_CONTRACT_EXAMPLE',
    actualQualification: 'NOT_RUN',
    independentlyCaptured: false,
    boundary,
    original,
    events,
    declaredCounters: {
      settlementCalls: 2, publicationAttempts: 0, signatures: 0, replacementCharges: 0,
      replacementChallenges: 0, contextResets: 0, resourceDeliveries: terminal === 'success' ? 1 : 0,
    },
  };
}

// No operational helper/export. This checker accepts ONLY synthetic test data.
// Agreement of these declared fields cannot prove original-byte custody,
// complete observation, native durability, cryptography or real effect counts.
function assertSyntheticConsistency(trace) {
  assert.equal(trace.evidenceClass, 'SYNTHETIC_CONTRACT_EXAMPLE');
  assert.equal(trace.actualQualification, 'NOT_RUN');
  assert.equal(trace.independentlyCaptured, false);
  assert.equal(trace.boundary, boundary);
  assert.deepEqual(Object.keys(trace.original).sort(), [...identityFields].sort());
  for (const value of Object.values(trace.original)) {
    assert.equal(typeof value, 'string');
    assert.ok(value.startsWith('SYNTHETIC_'));
  }
  assert.ok(Array.isArray(trace.events));
  const settlements = trace.events.filter(event => event.kind === 'SETTLEMENT_RESULT');
  const deliveries = trace.events.filter(event => event.kind === 'RESOURCE_DELIVERY');
  assert.equal(trace.events.length, settlements.length + deliveries.length);
  assert.equal(settlements.length, 2);
  assert.deepEqual(settlements.map(event => event.call), [1, 2]);
  assert.equal(settlements[0].result, 'settlement_pending');
  assert.ok(['success', 'settlement_pending'].includes(settlements[1].result));
  for (const event of settlements) assert.deepEqual(event.input, trace.original);
  const counts = trace.declaredCounters;
  assert.deepEqual(Object.keys(counts).sort(),
    ['settlementCalls', ...zeroCounters, 'resourceDeliveries'].sort());
  for (const count of Object.values(counts)) {
    assert.ok(Number.isSafeInteger(count) && count >= 0);
  }
  assert.equal(counts.settlementCalls, settlements.length);
  for (const counter of zeroCounters) assert.equal(counts[counter], 0);
  assert.equal(counts.resourceDeliveries, deliveries.length);
  assert.ok(deliveries.length <= 1);
  if (settlements[1].result !== 'success') assert.equal(deliveries.length, 0);
  for (const delivery of deliveries) {
    assert.equal(delivery.paymentHash, trace.original.signedPaymentHash);
    assert.ok(trace.events.indexOf(delivery) > trace.events.indexOf(settlements[1]));
  }
  return Object.freeze({ consistency: 'SYNTHETIC_ONLY', qualification: 'NOT_RUN' });
}

test('pending evidence requirements stay unexecuted and preserve unresolved authority', () => {
  assert.deepEqual(Object.keys(plan).sort(), [
    'schemaVersion', 'artifactKind', 'status', 'evidenceLevel', 'sourceBaseline', 'contractScope',
    'requiredIndependentEvidence', 'scenarios', 'negativeContractExamples', 'limitations',
  ].sort());
  assert.deepEqual(plan.negativeContractExamples, [
    'same-hash-different-signed-bytes', 'changed-payload-or-requirements', 'changed-context-binding',
    'extra-effect-after-unacknowledged-response', 'delivery-while-still-pending',
    'delivery-before-success', 'duplicate-delivery', 'missing-or-contradictory-counter',
    'incomplete-call-sequence', 'synthetic-example-promoted-to-observed-evidence',
  ]);
  assert.deepEqual(plan.limitations, [
    'This unexecuted packet defines synthetic metadata checks, not payment, SDK, bridge recovery or service execution.',
    'Synthetic consistency examples are not captured integration evidence.',
    'Declared bytes, hashes, context labels and counters do not authenticate their provenance or completeness.',
    'At most one declared delivery does not establish actual effect absence, transport receipt or spendability.',
    'The zero-additional-publication bound is scoped to unacknowledged response loss, not all PR193 recovery.',
    'No reset, replacement payment, new challenge, re-signing, refund or additional charge is authorized.',
    'Process restart, antirollback, native durability, real provider READY and live pilot acceptance remain unqualified.',
  ]);
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.artifactKind, 'X402_PENDING_RECOVERY_EVIDENCE_REQUIREMENTS');
  assert.equal(plan.status, 'NOT_RUN');
  assert.equal(plan.evidenceLevel, 'STATIC_DRAFT_ONLY');
  assert.deepEqual(plan.sourceBaseline, {
    repository: 'x402-foundation/x402', commit: '7f2b2f1f77fa5317615735e3378a6fad41cccb4e',
    manifestPath: 'typescript/packages/core/package.json', sourceManifestName: '@x402/core',
    sourceManifestVersion: '2.28.0', manifestOnlyReviewed: true, retryImplementationReviewed: false,
    installedArtifactDigest: null, canonicalPublisher: null, runtimeCallsiteCustody: null,
  });
  assert.deepEqual(plan.contractScope, {
    scenarioBasis: 'ROADMAP_PROPOSAL_NOT_EXECUTED_SDK_BEHAVIOR',
    syntheticChecker: 'TEST_ONLY_NOT_A_BRIDGE_OR_RECOVERY_API',
    boundary, proposedSettlementCallCount: 2, originalIdentityFields: identityFields,
    requiredZeroAdditionalCounters: zeroCounters, maxResourceDeliveries: 1,
    pr193ValidatedSameBlockResendBoundary: 'SEPARATE_PR193_VALIDATED_BOUNDARY_NOT_QUALIFIED_HERE',
    unknownIsNotAcknowledged: true,
  });
  assert.deepEqual(Object.keys(plan.requiredIndependentEvidence), [
    'originalBytesAndRequestCustody', 'sdkArtifactAndActualCallsite', 'bridgeContextAndRecoveryAuthority',
    'independentlyOwnedNetworkAndEpoch', 'payerAndPolicyAuthority',
    'publicationResponseAndReconciliationReceipts', 'captureCompletenessAndEffectCounters',
    'resourceDeliverySinkAndClientReceipt', 'commitUncertaintyAndDurableHistory',
  ]);
  for (const evidence of Object.values(plan.requiredIndependentEvidence)) assert.equal(evidence, null);
  assert.deepEqual(plan.scenarios, [
    { id: 'pending-original-success', requiredResults: ['settlement_pending', 'success'],
      requiredMaxDeliveries: 1, status: 'NOT_RUN', actualReceipt: null, observedCounters: null },
    { id: 'pending-still-pending', requiredResults: ['settlement_pending', 'settlement_pending'],
      requiredMaxDeliveries: 0, status: 'NOT_RUN', actualReceipt: null, observedCounters: null },
  ]);
});

test('only two roadmap synthetic scenario shapes have declared consistency, not qualification', () => {
  for (const terminal of ['success', 'settlement_pending']) {
    assert.deepEqual(assertSyntheticConsistency(syntheticTrace(terminal)),
      { consistency: 'SYNTHETIC_ONLY', qualification: 'NOT_RUN' });
  }
});

test('every original identity field is retained, including bytes when a hash label stays equal', () => {
  for (const field of identityFields) {
    const trace = syntheticTrace();
    trace.events[1].input[field] += '_CHANGED';
    assert.throws(() => assertSyntheticConsistency(trace));
  }
});

test('unknown-response recovery examples cannot declare extra effects or reset authority', () => {
  for (const counter of zeroCounters) {
    const trace = syntheticTrace();
    trace.declaredCounters[counter] = 1;
    assert.throws(() => assertSyntheticConsistency(trace));
  }
});

test('pending, premature or duplicate delivery and extra settlement are rejected as declared data', () => {
  const pending = syntheticTrace('settlement_pending');
  pending.events.push({ kind: 'RESOURCE_DELIVERY', paymentHash: pending.original.signedPaymentHash });
  pending.declaredCounters.resourceDeliveries = 1;
  assert.throws(() => assertSyntheticConsistency(pending));
  const early = syntheticTrace();
  early.events = [early.events[0], early.events[2], early.events[1]];
  assert.throws(() => assertSyntheticConsistency(early));
  const duplicate = syntheticTrace();
  duplicate.events.push({ ...duplicate.events[2] });
  duplicate.declaredCounters.resourceDeliveries = 2;
  assert.throws(() => assertSyntheticConsistency(duplicate));
  const extra = syntheticTrace();
  extra.events.push({ ...extra.events[1], call: 3 });
  extra.declaredCounters.settlementCalls = 3;
  assert.throws(() => assertSyntheticConsistency(extra));
  const wrongDeliveryHash = syntheticTrace();
  wrongDeliveryHash.events[2].paymentHash = 'SYNTHETIC_DIFFERENT_PAYMENT_HASH';
  assert.throws(() => assertSyntheticConsistency(wrongDeliveryHash));
});

test('missing or contradictory counters, incomplete calls and promoted evidence are rejected', () => {
  const missing = syntheticTrace();
  delete missing.declaredCounters.signatures;
  assert.throws(() => assertSyntheticConsistency(missing));
  const contradiction = syntheticTrace();
  contradiction.declaredCounters.resourceDeliveries = 0;
  assert.throws(() => assertSyntheticConsistency(contradiction));
  const incomplete = syntheticTrace();
  incomplete.events.splice(1, 1);
  incomplete.declaredCounters.settlementCalls = 1;
  assert.throws(() => assertSyntheticConsistency(incomplete));
  for (const [field, value] of [
    ['evidenceClass', 'OBSERVED_INTEGRATION_EVIDENCE'],
    ['actualQualification', 'PASSED'],
    ['independentlyCaptured', true],
  ]) {
    const promoted = syntheticTrace();
    promoted[field] = value;
    assert.throws(() => assertSyntheticConsistency(promoted));
  }
  const omittedEffect = syntheticTrace();
  omittedEffect.events.push({ kind: 'UNRECOGNIZED_EFFECT_EVENT' });
  assert.throws(() => assertSyntheticConsistency(omittedEffect));
});
