// Shared closed receipt DATA. No store, proof, clock or grant authority.
import { types } from 'node:util';
const F=Object.freeze,D=Object.getOwnPropertyDescriptor;
const RECEIPT = ['expiredFundingVersion', 'status', 'transactionHash', 'sourceSettlementId', 'fundingCommitment',
  'expiresAt', 'eligibilityObservedAt', 'paymentAt', 'grantActivation', 'grantExistence', 'deliveryLiability',
  'serviceDelivery', 'compensation', 'verification', 'mayStartPayment', 'maySignPayment', 'mayDispatchService',
  'mayActivateGrant', 'mayStartCompensation', 'authority'];
function fail(){throw new TypeError('ISSUED_EXPIRED_ORIGINAL_FUNDING');}
function own(value, key) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const d = D(value, key); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); return d.value;
}
function fields(value, keys) {
  const out = {}; for (const key of keys) out[key] = own(value, key);
  if (Reflect.ownKeys(value).length !== keys.length) fail(); return out;
}
function integer(value, minimum = 0) { if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < minimum) fail(); return value; }
function matches(re, value) { return typeof value === 'string' && re.exec(value)?.[0] === value; }

export function captureIssuedExpiredFundingResult(input, expected) {
  if (arguments.length !== 2) fail(); const r = fields(input, RECEIPT), e = fields(expected, ['transactionHash', 'fundingCommitment', 'expiresAt']);
  if (r.expiredFundingVersion !== 1 || r.status !== 'FUNDED_NO_NEW_GRANT' || r.transactionHash !== e.transactionHash
      || !matches(/^[0-9a-f]{64}$/, r.transactionHash) || !matches(/^settlement_[0-9a-f]{64}$/, r.sourceSettlementId)
      || r.fundingCommitment !== e.fundingCommitment || !matches(/^sha256:[0-9a-f]{64}$/, r.fundingCommitment)
      || integer(r.expiresAt, 1) !== e.expiresAt || integer(r.eligibilityObservedAt) < r.expiresAt || r.paymentAt !== null
      || r.grantActivation !== 'NOT_ENTERED_THIS_OPERATION' || r.grantExistence !== 'NOT_QUERIED'
      || r.deliveryLiability !== 'RECONCILIATION_REQUIRED' || r.serviceDelivery !== 'NOT_ESTABLISHED'
      || r.compensation !== 'NOT_ESTABLISHED' || r.verification !== 'SELECTED_ORIGINAL_VERIFIER' || r.authority !== 'NONE') fail();
  for (const key of ['mayStartPayment', 'maySignPayment', 'mayDispatchService', 'mayActivateGrant', 'mayStartCompensation']) if (r[key] !== false) fail();
  return F(r);
}
