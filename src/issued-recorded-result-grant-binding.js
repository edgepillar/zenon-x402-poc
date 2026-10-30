import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson, paymentIntentDigest } from './canonical.js';
import { createIssuedFundingPostSdkResourceBinding } from './x402-issued-funding-post-sdk-resource.js';
import { captureIssuedFundingPostServiceSelection } from './x402-issued-funding-post-application-binding.js';
import { captureServiceCreditOriginalFundingIdentity, createServiceCreditOriginalFundingGrantResult } from './service-credit-original-funding-grant.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor;
function fail() { throw new TypeError('ISSUED_RECORDED_RESULT_GRANT_BINDING'); }
function own(value, key, frozen = false) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype || frozen && !Object.isFrozen(value)) fail();
  const d = D(value, key); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); return d.value;
}
function fields(value, keys) {
  const out = {}; for (const key of keys) out[key] = own(value, key);
  if (Reflect.ownKeys(value).length !== keys.length) fail(); return out;
}
function digest(domain, value) {
  return 'sha256:' + createHash('sha256').update(domain + '\0', 'ascii').update(canonicalJson(value)).digest('hex');
}
function matches(expression, value) { return typeof value === 'string' && expression.exec(value)?.[0] === value; }

/** Compare an actual retained INACTIVE grant with the original issued resource.
 * This result selects a reader only. It never substitutes for fresh grant
 * admission, reactivates credit, refreshes expiry, or authorizes execution.
 * The real application supplies its settled bound hash and fixed store read. */
export function createIssuedRecordedResultGrantBinding(options) {
  if (arguments.length !== 1) fail();
  return createBinding(options, false);
}

/** Explicit recorded-result admission can also narrow an ACTIVE original to a
 * reader. It never turns historical lifecycle into fresh execution authority. */
export function createIssuedOriginalResultGrantBinding(options) {
  if (arguments.length !== 1) fail();
  return createBinding(options, true);
}

function createBinding(options, activeOriginal) {
  const c = fields(options, ['issuedFrame', 'resourceUrl', 'selection']);
  const selected = createIssuedFundingPostSdkResourceBinding(c.issuedFrame, c.resourceUrl).selection();
  const service = captureIssuedFundingPostServiceSelection(c.selection), requirement = selected.requirement;
  const expected = F({ network: requirement.network, chainProfile: requirement.extra.zenonChain,
    asset: requirement.asset, amount: requirement.amount, payee: requirement.payTo, ...service,
    paymentResourceDigest: digest('zenon-x402-service-credit-payment-resource-v1', selected.resource),
    paymentRequirementDigest: digest('zenon-x402-service-credit-payment-requirement-v1', requirement),
    paymentIntentDigest: 'sha256:' + paymentIntentDigest(selected.paymentRequired, requirement),
    grantFundingCommitment: 'sha256:' + selected.resource.tags[1] + selected.resource.tags[2] });
  const scheme = requirement.scheme; let pinned = false;
  const captureCommittedGrant = F(function captureCommittedGrant(grant, grantId, transactionHash) {
    if (arguments.length !== 3 || pinned || !matches(/^grant_[0-9a-f]{64}$/, grantId)
        || !matches(/^[0-9a-f]{64}$/, transactionHash)) fail();
    const lifecycle = own(grant, 'lifecycle', true);
    if (!(activeOriginal ? ['ACTIVE', 'EXPIRED', 'REVOKED'] : ['EXPIRED', 'REVOKED']).includes(lifecycle)
        || own(grant, 'grantId', true) !== grantId) fail();
    const identity = captureServiceCreditOriginalFundingIdentity({ transactionId: 'zenontx:' + transactionHash, ...expected });
    const history = createServiceCreditOriginalFundingGrantResult(identity, grant), activation = own(grant, 'activation', true);
    const intent = fields(own(grant, 'paymentIntent', true), ['intentId', 'requirementId']);
    if (history.record.storedLifecycle !== lifecycle || own(activation, 'scheme', true) !== scheme
        || own(activation, 'paymentFlow', true) !== 'upfront' || own(activation, 'payer', true) !== service.holderId
        || intent.intentId !== expected.paymentIntentDigest || intent.requirementId !== expected.paymentRequirementDigest) fail();
    pinned = true;
    return F({ admittedGrantId: grantId, transactionHash, capabilityCommitment: service.capabilityCommitment,
      serviceMode: 'RECORDED_RESULT_ONLY', grantActivation: 'NONE', authority: 'NONE' });
  });
  return F({ captureCommittedGrant });
}
