import { captureDynamicPlasmaKeyPairFundingConfiguration } from './dynamic-plasma-keypair-funding-configuration.js';
import { createDynamicPlasmaPreparedHashWalletOptions } from './dynamic-plasma-prepared-hash-wallet-options.js';
import { captureZenonDynamicPlasmaBoundedOriginalFundingConfiguration } from './dynamic-plasma-bounded-original-funding-configuration.js';
import { createBoundedNonceDynamicPlasmaMaterialExchange } from './dynamic-plasma-bounded-material-exchange.js';
import { createZenonDynamicPlasmaOriginalFundingSubmissionV2 } from './dynamic-plasma-original-funding-submission.js';

const CAPTURE = captureZenonDynamicPlasmaBoundedOriginalFundingConfiguration;
const MATERIAL = createBoundedNonceDynamicPlasmaMaterialExchange;
const SUBMISSION = createZenonDynamicPlasmaOriginalFundingSubmissionV2;
const KEYPAIR_CONFIGURATION = captureDynamicPlasmaKeyPairFundingConfiguration;
const KEYPAIR_OPTIONS = createDynamicPlasmaPreparedHashWalletOptions;
const FREEZE = Object.freeze, CREATE = Object.create, DEFINE = Object.defineProperty;
const ErrorType = TypeError;

/**
 * SOURCE-ONLY opt-in binding of the real bounded nonce producer to the actual
 * contextv7 original-funding V2 application owner. This effectful composition
 * has NOT been imported or executed by the separate DATA configuration tests.
 * Importing it loads the nonce producer, real SDK/preflight and native store;
 * DATA/fixed-material scope is not authority to import or operate that graph.
 *
 * Exact options are readOptions, materialOptions, materialWaitMs, wallet,
 * store, fundingResourceUrl, deadlineMs and fetchImpl. There is no supplied
 * materialExchange, preparer/owner factory, preflight, encoder or store writer.
 * Bind ONE actual producer to ONE actual V2 owner at construction, without
 * invoking search, signer, SQL or transport. Return that actual owner DIRECTLY,
 * preserving its public pending/close identities, counters, claims and errors.
 * Successful construction transfers the already-opened store's lifetime under
 * that owner's unchanged exclusive-custody contract; failure leaves close or
 * quarantine with the caller and may have consumed a local store-object claim.
 *
 * Explicit prepare: original quote/work request -> bounded search of at most
 * 4096 candidates (independent verification may recheck a found nonce) ->
 * same unsigned assembly/current read -> one borrowed wallet
 * sign -> fifth current read -> actual cryptographic payment preflight.
 * Explicit commit: independently retained pins -> one sixth current read of
 * that SAME signed candidate -> atomic V6 original custody/readback, without
 * quote refresh, material reentry, reassembly or signing in that final step.
 * Explicit submit retains the same V2 pins/state checks and one funding-intake
 * fetch. A BOUND intake is not chain publication, inclusion, grant or service.
 *
 * maxAttempts, maxDifficulty and startNonce are explicit, not resettable work
 * authority. Synchronous candidate work cannot be interrupted by materialWaitMs;
 * that timer still bounds only material-Promise waiting, not CPU/whole-operation
 * lifetime or cleanup. Exhaustion/refusal/unknown outcome grants no fallback,
 * new quote, new owner, automatic replay, replacement or re-signing. Late drain
 * cannot upgrade a failed close or release a still-owned store. Independent
 * recovery/operational custody, actual runtime/chain qualification and any live
 * pilot remain separate. The legacy buyer/default and earlier factories stay
 * untouched. Recreating this adapter never renews consumed payment authority.
 */
export function createZenonDynamicPlasmaBoundedOriginalFundingSubmission(configuration) {
  try {
    if (arguments.length !== 1) reject();
    const selected = CAPTURE(configuration);
    const materialExchange = MATERIAL(selected.materialOptions);
    return SUBMISSION({
      preparerOptions: { readOptions: selected.readOptions, materialExchange,
        materialWaitMs: selected.materialWaitMs, wallet: selected.wallet },
      store: selected.store, fundingResourceUrl: selected.fundingResourceUrl,
      deadlineMs: selected.deadlineMs, fetchImpl: selected.fetchImpl,
    });
  } catch { reject(); }
}

/**
 * Explicit SOURCE-ONLY KeyPair selection for the ACTUAL bounded material ->
 * retained contextv7 candidate -> hash-only signer -> real preflight -> V6
 * custody/readback -> original funding POST owner. No supplied wallet/preparer,
 * material producer, preflight or store-writer factory is substituted.
 *
 * Expected public bytes are the same captured materialOptions.publicKey.
 * Return the actual V2 owner directly: independent pins, explicit prepare/
 * commit/submit, one-shot attempts, close and retained uncertainty stay owned
 * there. No legacy fallback, quote refresh, replacement, resign or send occurs
 * on construction or after a refusal. The caller still owns key consent and
 * cleanup. A BOUND intake is not inclusion, grant activation or delivery.
 *
 * The separate builtin component result exercises the actual options/adapter
 * and retained candidate with declared read/material/key callbacks. It does
 * NOT execute this SDK/SQLite binding or qualify a real KeyPair implementation.
 * No default buyer/Phase 2C cutover or old native-result rebinding is made.
 */
export function createZenonDynamicPlasmaBoundedKeyPairOriginalFundingSubmission(configuration) {
  try {
    if (arguments.length !== 1) reject();
    const selected = KEYPAIR_CONFIGURATION(configuration);
    const materialExchange = MATERIAL(selected.materialOptions);
    const preparerOptions = KEYPAIR_OPTIONS({ readOptions: selected.readOptions,
      materialExchange, materialWaitMs: selected.materialWaitMs,
      keyPair: selected.keyPair, expectedAddress: selected.expectedAddress,
      expectedPublicKey: selected.materialOptions.publicKey });
    return SUBMISSION({ preparerOptions, store: selected.store,
      fundingResourceUrl: selected.fundingResourceUrl, deadlineMs: selected.deadlineMs, fetchImpl: selected.fetchImpl });
  } catch { reject(); }
}
function reject() {
  const code = 'zenon_bounded_original_funding_submission_configuration_rejected';
  const error = new ErrorType(code), d = CREATE(null); d.value = code; d.enumerable = true;
  DEFINE(error, 'code', d);
  const stack = CREATE(null); stack.value = 'TypeError: ' + code;
  DEFINE(error, 'stack', stack); throw FREEZE(error);
}
