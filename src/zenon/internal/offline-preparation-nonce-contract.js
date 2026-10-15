import { verifyOfflineZenonNonceProof } from './offline-nonce-proof-verifier.js';
import { composeOfflinePreparationTrace } from './offline-observation-to-preparation-contract.js';
import { prepareUnsignedZenonPaymentBlock } from './pre-sign-account-block-preparation.js';

const TRUST_FIELDS = Object.freeze([
  'sourceAuthentication',
  'chainAuthentication',
  'canonicality',
  'finality',
  'liveFreshness',
  'signingAuthorization',
]);

export function composeOfflinePreparationWithNonceProof(trace) {
  if (arguments.length !== 1) reject();

  try {
    const traceResult = composeOfflinePreparationTrace(trace);
    const preparation = prepareUnsignedZenonPaymentBlock(traceResult.preparationInput);
    const block = preparation.block;
    const nonceProof = verifyOfflineZenonNonceProof({
      payer: block.address,
      previousAccountHash: block.previousHash,
      difficulty: block.difficulty,
      nonce: block.nonce,
    });
    const requiredStatus = block.difficulty === 0 ? 'NOT_REQUIRED' : 'VALID';
    if (nonceProof.status !== requiredStatus) reject();

    return Object.freeze({
      qualification: 'OFFLINE_PREPARATION_NONCE_ONLY',
      preparation,
      nonceProof,
      recordedContext: traceResult.trust.recordedContext,
      recordedTrustLabel: traceResult.trust.recordedTrustLabel,
      trust: snapshotTrust(nonceProof.trust),
    });
  } catch {
    reject();
  }
}

function snapshotTrust(value) {
  if (value === null || typeof value !== 'object' ||
      Reflect.ownKeys(value).length !== TRUST_FIELDS.length) reject();
  const snapshot = {};
  for (const field of TRUST_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined || descriptor.enumerable !== true ||
        !Object.hasOwn(descriptor, 'value') || descriptor.value !== 'NOT_ESTABLISHED') reject();
    snapshot[field] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function reject() {
  const error = new TypeError('Offline preparation nonce contract rejected');
  Object.defineProperty(error, 'code', {
    value: 'offline_preparation_nonce_contract_rejected',
    enumerable: true,
  });
  throw error;
}
