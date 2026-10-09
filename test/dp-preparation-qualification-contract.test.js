import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Draft metadata checks only. Do not infer SDK, signing or recovery execution.
const plan = JSON.parse(readFileSync(
  new URL('./fixtures/dp-preparation-qualification-oct03-v1.json', import.meta.url),
  'utf8',
));

test('DP qualification plan is versioned, unexecuted and has unresolved authority', () => {
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.artifactKind, 'DP_PREPARATION_QUALIFICATION_PLAN');
  assert.equal(plan.status, 'NOT_RUN');
  assert.equal(plan.evidenceLevel, 'STATIC_DRAFT_ONLY');
  assert.equal(plan.candidate.candidateVersion, 1);
  assert.equal(plan.candidate.candidateName,
    'public-testnet-dynamic-plasma-epoch-candidate-2026-10-03-v1');
  assert.equal(plan.candidate.authoritativeEpoch, false);
  assert.equal(plan.candidate.exportName,
    'PUBLIC_TESTNET_DYNAMIC_PLASMA_OCT03_EPOCH_CANDIDATE_V1');
  assert.deepEqual(plan.candidate.suppliedMetadata, {
    epochDate: '2026-10-03',
    nodeSourceCommit: 'e58d8e80eabd9fd5630ed62e0707424d96b5303c',
    genesisTimestampSec: 1791025200,
    chainIdentifier: '73404',
  });
  assert.equal(plan.canonicalSuite.repository,
    'https://github.com/0x3639/zenon-sdk-spec');
  assert.equal(plan.canonicalSuite.sourceCommit,
    '69f2ecf955bafa4037c73f4b858619ef834e738b');
  assert.equal(plan.preparationPath.proposedSdkFamily,
    'znn-typescript-sdk@1.0.5 composite prepareBlock');
  assert.equal(plan.preparationPath.phaseInjectionOrObservationAvailability,
    'UNQUALIFIED_REQUIRES_SEPARATE_ADMISSION');
  assert.equal(plan.preparationPath.stagedApiAssumed, false);
  assert.equal(plan.preparationPath.installedArtifactIdentity, null);
  assert.equal(plan.preparationPath.runtimeCallsiteCustody, null);
  assert.equal(plan.canonicalSuite.relationship,
    'EXTEND_EXISTING_SUITE_NOT_REIMPLEMENT_SDK');
  assert.equal(plan.canonicalSuite.sourceAndRuntimeQualifiedByThisPacket, false);
  assert.deepEqual(Object.keys(plan.requiredEvidence), [
    'independentlyOwnedContext', 'deployedBinarySourceAndDigestBinding',
    'actualGenesisMomentumHash', 'activeSporkState', 'enforcementTimePricing',
    'sdkArtifactAndRuntimeBinding', 'originalRequestAndPaymentCustody',
    'payerPolicyAndRecoveryAuthority', 'crashRestartAndUncertaintyPolicy',
  ]);
  for (const value of Object.values(plan.requiredEvidence)) {
    assert.equal(value, null);
  }
});

test('DP qualification plan covers four lifecycle boundaries without run receipts', () => {
  assert.deepEqual(plan.scenarios.map(({ id }) => id), [
    'frontier-quote-movement',
    'work-preparation-price-movement',
    'signing-to-inclusion-price-movement',
    'lost-publication-response-original-payment-recovery',
  ]);
  assert.deepEqual(plan.scenarios.map(({ observationBoundary }) => observationBoundary), [
    'BEFORE_PREPARATION', 'DURING_WORK_PREPARATION',
    'AFTER_SIGNING_BEFORE_INCLUSION', 'AFTER_UNACKNOWLEDGED_PUBLICATION',
  ]);
  const expectedRequirements = [
    {
      "requiredEvidence": [
        "original_request_context",
        "original_frontier_and_quote",
        "changed_frontier_and_quote",
        "prepared_parent_and_cost_binding"
      ],
      "requiredAssertions": [
        "bind_the_selected_frontier_and_quote_to_the_original_request",
        "detect_frontier_or_quote_movement_without_borrowing_an_old_quote",
        "apply_only_an_independently_admitted_cost_policy"
      ]
    },
    {
      "requiredEvidence": [
        "original_quote",
        "qualified_work_phase_observation_boundary",
        "post_work_quote",
        "actual_execution_price"
      ],
      "requiredAssertions": [
        "do_not_assume_a_shipped_staged_sdk_api",
        "detect_price_movement_at_an_admitted_phase_boundary",
        "a_last_check_or_buffer_is_not_an_inclusion_guarantee",
        "do_not_replace_or_resign_the_original_payment"
      ]
    },
    {
      "requiredEvidence": [
        "retained_original_signed_bytes_and_hash",
        "signing_quote_and_context",
        "inclusion_or_rejection_evidence",
        "enforcement_time_price"
      ],
      "requiredAssertions": [
        "retain_the_original_signed_identity",
        "distinguish_inclusion_rejection_and_unknown_outcomes",
        "quote_ttl_and_headroom_are_not_inclusion_guarantees",
        "a_failure_label_does_not_authorize_a_new_signature_or_charge"
      ]
    },
    {
      "requiredEvidence": [
        "durable_original_signed_bytes_and_hash",
        "original_payload_requirements_and_context",
        "unknown_not_acknowledged_publication_record",
        "same_original_hash_reconciliation_evidence"
      ],
      "requiredAssertions": [
        "reconcile_the_same_original_payment",
        "pending_or_unknown_does_not_authorize_resource_delivery",
        "no_consumed_context_reset_or_replacement_challenge",
        "delivery_requires_independent_settlement_and_receive_policy_acceptance"
      ]
    }
  ];
  for (const [index, scenario] of plan.scenarios.entries()) {
    assert.deepEqual(scenario.requiredEvidence, expectedRequirements[index].requiredEvidence);
    assert.deepEqual(scenario.requiredAssertions, expectedRequirements[index].requiredAssertions);
    assert.deepEqual(scenario.result, {
      status: 'NOT_RUN', evidenceReceipt: null, observedCounters: null,
    });
  }
});

test('DP plan retains original identity and separates required limits from observations', () => {
  const policy = plan.identityPolicy;
  for (const key of [
    'preserveOriginalPaymentBytes', 'preserveOriginalSignedHash',
    'preserveOriginalPayloadRequirementsContext',
  ]) assert.equal(policy[key], true);
  for (const key of [
    'replacePayment', 'resignPayment', 'mintReplacementChallenge',
    'resetConsumedAuthority',
  ]) assert.equal(policy[key], false);
  assert.deepEqual(policy.publicationStatesRemainDistinct, ['UNKNOWN', 'ACKNOWLEDGED']);
  assert.equal(policy.exceptionBoundary,
    'PR193_VALIDATED_EXACT_SAME_SIGNED_BLOCK_RESEND_IS_SEPARATE_NOT_QUALIFIED_HERE');
  const recovery = plan.scenarios[3];
  assert.equal(recovery.observationBoundary, 'AFTER_UNACKNOWLEDGED_PUBLICATION');
  assert.deepEqual(recovery.requiredLimits, {
    newPublicationAttemptsAfterAmbiguity: 0,
    newSignaturesAfterAmbiguity: 0,
    replacementCharges: 0,
    maxResourceDeliveries: 1,
  });
  assert.equal(recovery.result.observedCounters, null);
});
