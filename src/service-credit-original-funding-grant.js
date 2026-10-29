import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, HASH = /^sha256:[0-9a-f]{64}$/;
const TX = /^zenontx:[0-9a-f]{64}$/, GRANT = /^grant_[0-9a-f]{64}$/, ACTIVATION = /^activation_[0-9a-f]{64}$/;
const IDENTITY = ['transactionId', 'network', 'chainProfile', 'asset', 'amount', 'payee', 'offerId', 'offerVersion',
  'holderId', 'capabilityCommitment', 'paymentResourceDigest', 'paymentRequirementDigest', 'paymentIntentDigest', 'grantFundingCommitment'];
const DIGESTS = ['capabilityCommitment', 'paymentResourceDigest', 'paymentRequirementDigest', 'paymentIntentDigest', 'grantFundingCommitment'];
const RECORD = ['grantId', 'activationId', 'transactionId', 'offerId', 'offerVersion', 'holderId', 'capabilityCommitment',
  'totalUnits', 'expiresAt', 'storedLifecycle', 'availableUnits', 'heldUnits', 'consumedUnits'];
const RESULT = ['originalFundingGrantVersion', 'status', 'originalFunding', 'record', 'historicalObservation', 'reconciliationRequired',
  'mayStartPayment', 'maySignPayment', 'mayDispatchService', 'mayActivateGrant', 'grantAuthority', 'deliveryLiability', 'spendingReservation', 'authority'];
function fail() {
  const code = 'SERVICE_CREDIT_ORIGINAL_FUNDING_GRANT', e = new TypeError(code);
  Object.defineProperties(e, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } }); throw F(e);
}
function data(value, name, frozen = false) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || frozen && !Object.isFrozen(value)) fail();
  const d = D(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail(); return d.value;
}
function fields(value, names, frozen = false) {
  const result = {};
  for (const name of names) result[name] = data(value, name, frozen);
  if (Reflect.ownKeys(value).length !== names.length) fail(); return result;
}
function matches(re, value) { return typeof value === 'string' && re.exec(value)?.[0] === value; }
function integer(value, positive = false) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < (positive ? 1 : 0)) fail(); return value;
}
function equal(a, b) { return canonicalJson(a) === canonicalJson(b); }

/** Independent original-payment identity only. No balance, amount similarity,
 * grant ID, time callback or acknowledgement can replace these exact pins. */
export function captureServiceCreditOriginalFundingIdentity(input) {
  if (arguments.length !== 1) fail();
  const c = fields(input, IDENTITY);
  if (!matches(TX, c.transactionId) || !matches(/^zenon:[A-Za-z0-9._:-]{1,110}$/, c.network)) fail();
  for (const key of ['asset', 'payee', 'offerId', 'holderId']) if (!matches(ID, c[key])) fail();
  for (const key of DIGESTS) if (!matches(HASH, c[key])) fail();
  if (!matches(/^[1-9][0-9]{0,76}$/, c.amount)) fail(); integer(c.offerVersion, true);
  const chain = fields(c.chainProfile, ['version', 'chainIdentifier', 'genesisMomentumHash']);
  if (chain.version !== 1 || !matches(/^[0-9a-f]{64}$/, chain.genesisMomentumHash)
      || !matches(/^[1-9][0-9]{0,15}$/, chain.chainIdentifier)
      || chain.chainIdentifier.length === 16 && chain.chainIdentifier > String(Number.MAX_SAFE_INTEGER)) fail();
  c.chainProfile = F(chain); return F(c);
}

/** The caller supplies an actual stored grant snapshot. This DATA comparison
 * never authenticates a store or issues/refreshes/activates a grant. */
export function matchesServiceCreditOriginalFundingGrant(identity, grant) {
  if (arguments.length !== 2) fail(); const q = captureServiceCreditOriginalFundingIdentity(identity);
  const a = data(grant, 'activation', true);
  for (const key of IDENTITY) {
    const actual = data(a, key, true);
    if (key === 'chainProfile') {
      const chain = fields(actual, ['version', 'chainIdentifier', 'genesisMomentumHash'], true);
      if (!equal(chain, q.chainProfile)) return false;
    } else if (actual !== q[key]) return false;
  }
  for (const key of ['transactionId', 'offerId', 'offerVersion', 'holderId', 'capabilityCommitment'])
    if (data(grant, key, true) !== q[key]) return false;
  return true;
}
function record(value, q) {
  const r = fields(value, RECORD, true);
  if (!matches(GRANT, r.grantId) || !matches(ACTIVATION, r.activationId)
      || !['ACTIVE', 'EXPIRED', 'REVOKED'].includes(r.storedLifecycle)) fail();
  for (const key of ['transactionId', 'offerId', 'offerVersion', 'holderId', 'capabilityCommitment']) if (r[key] !== q[key]) fail();
  integer(r.totalUnits, true); integer(r.expiresAt, true);
  for (const key of ['availableUnits', 'heldUnits', 'consumedUnits']) integer(r[key]);
  const sum = r.availableUnits + r.heldUnits + r.consumedUnits;
  if (!Number.isSafeInteger(sum) || sum !== r.totalUnits) fail(); return F(r);
}
export function createServiceCreditOriginalFundingGrantResult(identity, grant) {
  if (arguments.length !== 2) fail(); const q = captureServiceCreditOriginalFundingIdentity(identity);
  let retained = null;
  if (grant !== null) {
    if (!matchesServiceCreditOriginalFundingGrant(q, grant)) fail();
    const values = {};
    for (const key of RECORD) values[key] = data(grant, key === 'storedLifecycle' ? 'lifecycle' : key, true);
    retained = record(F(values), q);
  }
  return F({ originalFundingGrantVersion: 1, status: retained === null ? 'NOT_RECORDED' : 'RECORDED', originalFunding: q,
    record: retained, historicalObservation: true, reconciliationRequired: true,
    mayStartPayment: false, maySignPayment: false, mayDispatchService: false, mayActivateGrant: false,
    grantAuthority: 'NOT_REVALIDATED', deliveryLiability: 'NOT_QUERIED', spendingReservation: 'UNCHANGED', authority: 'NONE' });
}
export function captureServiceCreditOriginalFundingGrantResult(input, expectedIdentity) {
  if (arguments.length !== 2) fail(); const c = fields(input, RESULT, true), q = captureServiceCreditOriginalFundingIdentity(expectedIdentity);
  if (c.originalFundingGrantVersion !== 1 || !equal(captureServiceCreditOriginalFundingIdentity(c.originalFunding), q)
      || c.historicalObservation !== true || c.reconciliationRequired !== true
      || c.mayStartPayment !== false || c.maySignPayment !== false || c.mayDispatchService !== false || c.mayActivateGrant !== false
      || c.grantAuthority !== 'NOT_REVALIDATED' || c.deliveryLiability !== 'NOT_QUERIED'
      || c.spendingReservation !== 'UNCHANGED' || c.authority !== 'NONE'
      || c.status !== (c.record === null ? 'NOT_RECORDED' : 'RECORDED')) fail();
  c.originalFunding = q; c.record = c.record === null ? null : record(c.record, q); return F(c);
}

/** Bind the existing request-capability verifier to a separate read namespace.
 * This scope cannot be a ledger grant ID or a service execution request. No
 * proof, key or signature is created or checked by this DATA capture. */
export function captureServiceCreditOriginalFundingGrantQuery(input) {
  if (arguments.length !== 1) fail(); const q = fields(input, ['queryVersion', 'requestId', 'originalFunding']);
  if (q.queryVersion !== 1 || !matches(ID, q.requestId)) fail();
  q.originalFunding = captureServiceCreditOriginalFundingIdentity(q.originalFunding); const query = F(q);
  const scopeId = 'funding_lookup_' + q.originalFunding.transactionId.slice('zenontx:'.length);
  const canonicalBodyDigest = 'sha256:' + createHash('sha256').update('zenon-x402:original-funding-grant-query:v1\0', 'ascii')
    .update(canonicalJson(query), 'utf8').digest('hex');
  return F({ query, grant: F({ grantId: scopeId, capabilityCommitment: q.originalFunding.capabilityCommitment }),
    request: F({ modelVersion: 1, grantId: scopeId, requestId: q.requestId, method: 'GET',
      routeId: 'original-funding-grant-read-v1', canonicalBodyDigest, selectedContentType: 'application/json', maxCostUnits: 1 }) });
}
