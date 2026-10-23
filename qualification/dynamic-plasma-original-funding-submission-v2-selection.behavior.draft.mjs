/*
 * Qualification entry for twelve actual application cases.
 * Select all eleven explicit v2 funding cases and the direct payer/V6 close
 * regression. No filtered easier subset, source copy/transform of production,
 * fake SDK/preflight/store/client, network or SDK prepareBlock is selected.
 * One process, no Node children/workers, twelve NEW SQLite files, ten
 * independent pin files, one ephemeral synthetic key, at most ten transaction
 * signatures and three declared in-process fetch callbacks. Difficulty zero;
 * no nonce search, chain PREPARE, wallet/provider/payment or economic pilot.
 * Source/profile/launcher and managed 4 MiB capacity MUST be reviewed before
 * each separately authorized run. Selection strings are NOT human authority.
 */
if (process.argv.length !== 3
    || process.argv[2] !== process.env.SPV_TASK_SCRATCH
    || process.env.X402_DP_SUBMISSION_V2_SELECTION !== 'twelve-synthetic-v2-cases-only') {
  throw new TypeError('X402_V2_ORIGINAL_FUNDING_SELECTION_REJECTED');
}
await import('./dynamic-plasma-original-funding-submission-v2.behavior.draft.mjs');
await import('./service-credit-payer-owner-reentrant-recovery-close-v2.behavior.draft.mjs');
console.log('# twelve-case-original-funding-v2-selection ' + JSON.stringify({
  selectionVersion:1, expectedTotalCases:12, fundingV2Cases:11, directPayerCases:1,
  selectionIsNotHumanAuthorization:true, sourceTransforms:0, authority:'NONE',
}));
