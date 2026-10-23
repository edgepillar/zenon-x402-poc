/*
 * SOURCE ONLY. Nine genuine application cases, NOT parsed/imported/executed.
 * The original eight-case entry and shared harness remain byte-for-byte
 * unchanged. This driver selects ALL EIGHT, then adds the direct payer/V6
 * recovery-close regression. It is not an easier one-case replacement.
 *
 * Intended effects: one Node process, zero children, nine NEW SQLite files
 * (eight V6 plus one V5 negative), seven pin files, one in-memory synthetic
 * Ed25519 key, seven synthetic transaction signatures, three synthetic fetch
 * callbacks, two recovery-close hooks and one commit-return-loss hook.
 * No install, real network/wallet/provider/payment, nonce search or PREPARE.
 * A fresh exact graph/profile/launcher, unchanged two-MiB capacity admission
 * and separate direct nine-case authority are required before any launch.
 */
if (process.argv.length !== 3
    || process.argv[2] !== process.env.SPV_TASK_SCRATCH
    || process.env.X402_DP_SUBMISSION_NINE_CASE_SELECTION !== 'nine-synthetic-cases-only') {
  throw new TypeError('X402_NINE_CASE_ORIGINAL_FUNDING_SELECTION_REJECTED');
}
// These are literal imports of actual entries; no alternate owner/SDK/store
// implementation, source transform or filtered subset is supplied.
await import('./dynamic-plasma-original-funding-submission-v1.behavior.draft.mjs');
await import('./service-credit-payer-owner-reentrant-recovery-close-v1.behavior.draft.mjs');
console.log('# nine-case-original-funding-selection ' + JSON.stringify({
  driverVersion: 2, expectedTotalCases: 9, existingCasesSelected: 8, additionalCasesSelected: 1,
  selectionIsNotHumanAuthorization: true, authority: 'NONE',
}));
