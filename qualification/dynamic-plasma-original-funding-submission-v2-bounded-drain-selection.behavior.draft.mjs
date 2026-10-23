/*
 * NOT EXECUTED: all twelve cases with corrected bounded-drain expectations.
 * The earlier native fixture/result remains immutable. This driver and body
 * are NOT in that executed profile and MUST NOT be run with its stale pins.
 * A fresh reviewed profile/launcher and matching bounded native authority are
 * required. No easier subset, alternate store or transport is substituted.
 */
if (process.argv.length !== 3
    || process.argv[2] !== process.env.SPV_TASK_SCRATCH
    || process.env.X402_DP_SUBMISSION_V2_SELECTION !== 'twelve-synthetic-v2-cases-only'
    || process.env.X402_DP_SUBMISSION_V2_BOUNDED_DRAIN_SELECTION !== 'twelve-cases-corrected-drain-only') {
  throw new TypeError('X402_V2_CORRECTED_DRAIN_SELECTION_REJECTED');
}
await import('./dynamic-plasma-original-funding-submission-v2-bounded-drain.behavior.draft.mjs');
await import('./service-credit-payer-owner-reentrant-recovery-close-v2.behavior.draft.mjs');
console.log('# twelve-case-original-funding-v2-bounded-drain-selection ' + JSON.stringify({
  selectionVersion: 1, expectedTotalCases: 12, fundingV2Cases: 11, directPayerCases: 1,
  changedExpectation: 'EXHAUSTED_DRAIN_MUST_REJECT_CLOSE_AND_RETAIN_UNKNOWN_CUSTODY',
  selectionIsNotHumanAuthorization: true, sourceTransforms: 0, authority: 'NONE',
}));
