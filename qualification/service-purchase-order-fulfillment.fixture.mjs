import { paymentIntentDigest } from '../src/canonical.js';
import { captureOriginalPaymentCheckpoint, encodeOriginalPaymentCheckpoint } from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';
import { purchasedTermsStorageDigest } from '../src/service-purchase-storage-contract.js';
import { purchasedFulfillmentPolicyDigest } from '../src/service-purchase-fulfillment.js';
import { encodeB64Json } from '../src/x402-wire.js';
import {
  deriveZenonFundingObserverTarget, prepareZenonFundingResource,
} from '../src/service-credit-zenon-funding-evidence.js';

export const NOW = 2_000_000_000_000, EXPIRES = NOW + 10000;
const clone = x => JSON.parse(JSON.stringify(x));
const hash = letter => 'sha256:' + letter.repeat(64);
export const orderFundingProof = (id = 'proof.one') => JSON.stringify({ evidenceVersion: 1, artifact: { format: 'synthetic-selected-verifier', id } });
export function orderLiabilityFixture({ orderId = 'order.liability.1', quantity = 10, priceAmount = '100', maximumDeliveries = 16 } = {}) {
  const resourceUrl = 'https://order-funding.invalid/funding';
  const authorityProfile = { profileId: 'authority.synthetic', profileVersion: 1, verifierVersion: 1, recordDigest: hash('d'),
    network: 'zenon:testnet', chainProfile: { version: 1, chainIdentifier: '12345', genesisMomentumHash: '1'.repeat(64) },
    confirmationPolicy: { policyId: 'zenon.authenticated-momentum-inclusion', policyVersion: 1, minimumConfirmations: 2 } };
  const offer = { modelVersion: 1, providerId: 'provider.synthetic', serviceId: 'metered-api.v1', resourceId: 'resource.funding',
    resourceBinding: deriveServiceCreditResourceBinding({ resourceId: 'resource.funding', resourceUrl }),
    offerId: 'offer.synthetic', offerVersion: 1, costPolicyId: 'cost.fixed', fundingPolicyId: 'funding.exact', fundingPolicyVersion: 1 };
  const selection = { offerId: offer.offerId, offerVersion: 1, holderId: 'z1syntheticpayer', capabilityCommitment: hash('a') };
  const issued = prepareZenonFundingResource({ offer, selection, resourceUrl, authorityProfile, now: () => NOW,
    deriveFundingTerms: () => ({ fundingPolicyId: offer.fundingPolicyId, fundingPolicyVersion: 1, totalUnits: 27, expiresAt: EXPIRES,
      requirement: { scheme: 'exact', network: 'zenon:testnet', asset: 'zts1syntheticasset', amount: priceAmount, payTo: 'z1syntheticpayee',
        maxTimeoutSeconds: 30, extra: { paymentFlow: 'upfront', poc: true, settlement: 'account-block',
          zenonChain: clone(authorityProfile.chainProfile), minimumMomentumConfirmations: 2 } } }) });
  const required = issued.challenge.paymentRequired;
  const payload = { x402Version: 2, resource: clone(required.resource), accepted: clone(required.accepts[0]),
    payload: { transaction: { hash: 'c'.repeat(64), address: selection.holderId }, intentDigest: paymentIntentDigest(required, required.accepts[0]) } };
  const policyJson = JSON.stringify({ version: 1, quantityUnit: 'api-call', offerExpiresAtMs: EXPIRES,
    reservationExpiresAtMs: EXPIRES + 10000, maximumDeliveries, compensationRule: 'PRO_RATA_CEILING_ATOMIC_V1' });
  const terms = { termsVersion: 1, orderId, productId: offer.serviceId, beneficiary: 'beneficiary.synthetic', holder: selection.holderId,
    price: { asset: payload.accepted.asset, unit: 'zenon-atomic', amount: priceAmount }, quantity,
    network: 'zenon:testnet', conditionsDigest: purchasedFulfillmentPolicyDigest(policyJson) };
  const termsJson = JSON.stringify(terms), termsDigest = purchasedTermsStorageDigest(termsJson);
  const captured = captureOriginalPaymentCheckpoint({ binding: { requestId: 'funding.original', paymentHash: payload.payload.transaction.hash,
    origin: new URL(resourceUrl).origin, contextId: 'context.original' }, originalBytes: { requestBody: '', paymentPayload: encodeB64Json(payload),
    paymentRequirements: encodeB64Json(required), context: Buffer.from('{}').toString('base64') } });
  const paymentCheckpointJson = encodeOriginalPaymentCheckpoint(captured.checkpoint), paymentPinsJson = JSON.stringify(captured.pins);
  const context = { version: 1, orderId, acceptedTermsDigest: termsDigest, policyJson,
    offer: issued.offer, challenge: issued.challenge, authorityProfile };
  const fundingContextJson = JSON.stringify(context), verifierContext = { offer: issued.offer, challenge: issued.challenge, authorityProfile,
    transactionHash: payload.payload.transaction.hash, payer: terms.holder, resourceUrl };
  const target = deriveZenonFundingObserverTarget(verifierContext);
  const verifiedRecord = { evidenceVersion: 1, evidenceType: 'zenon-authenticated-funding-evidence',
    authorityProfileId: authorityProfile.profileId, authorityProfileVersion: 1, verifierVersion: 1,
    authorityRecordDigest: authorityProfile.recordDigest, network: target.network, chainProfile: clone(authorityProfile.chainProfile),
    transactionId: target.transactionId, payer: target.payer, payee: target.payee, asset: target.asset, amount: target.amount,
    paymentResourceDigest: target.paymentResourceDigest, paymentRequirementDigest: target.paymentRequirementDigest,
    paymentIntentDigest: target.paymentIntentDigest, resourceBinding: target.resourceBinding,
    offerId: target.offerId, offerVersion: target.offerVersion, fundingPolicyId: target.fundingPolicyId,
    fundingPolicyVersion: target.fundingPolicyVersion, capabilityCommitment: target.capabilityCommitment,
    totalUnits: target.totalUnits, expiresAt: target.expiresAt, grantFundingCommitment: target.grantFundingCommitment,
    inclusionEvidence: { state: 'MOMENTUM_INCLUDED', transactionHash: payload.payload.transaction.hash,
      momentumHeight: 100, momentumHash: 'e'.repeat(64), observedConfirmations: 2 }, confirmationPolicy: clone(authorityProfile.confirmationPolicy) };
  return { terms, termsJson, termsDigest, paymentCheckpointJson, paymentPinsJson, fundingContextJson,
    verifierContext, verifiedRecord, payload, required, context };
}
export function orderFundingOwnerInputs(f) { return [f.termsJson, f.termsDigest, f.paymentCheckpointJson, f.paymentPinsJson, f.fundingContextJson]; }
