import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { deriveZenonFundingObserverTarget, verifyZenonIssuedFundingWithoutActivation } from './service-credit-zenon-funding-evidence.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, A = Reflect.apply;
const NP = Promise, PP = NP.prototype, THEN = PP.then;
const CONTEXT = ['offer', 'challenge', 'authorityProfile', 'transactionHash', 'payer', 'resourceUrl'];
const RECEIPT = ['expiredFundingVersion', 'status', 'transactionHash', 'sourceSettlementId', 'fundingCommitment',
  'expiresAt', 'eligibilityObservedAt', 'paymentAt', 'grantActivation', 'grantExistence', 'deliveryLiability',
  'serviceDelivery', 'compensation', 'verification', 'mayStartPayment', 'maySignPayment', 'mayDispatchService',
  'mayActivateGrant', 'mayStartCompensation', 'authority'];
function fail() { throw new TypeError('ISSUED_EXPIRED_ORIGINAL_FUNDING'); }
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
function discard(value) {
  if (!types.isPromise(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== PP || PP.then !== THEN) return;
  const d = D(value, 'constructor'); if (d && (!Object.hasOwn(d, 'value') || d.value !== NP)) return;
  try { const p = A(THEN, value, [() => {}, () => {}]); A(THEN, p, [() => {}, () => {}]); } catch {}
}
function snapshot(value, depth = 0, budget = { nodes: 4096, bytes: 131072 }) {
  if (depth > 24 || --budget.nodes < 0) fail();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') { integer(value); return value; }
  if (typeof value === 'string') { budget.bytes -= Buffer.byteLength(value); if (budget.bytes < 0 || Buffer.from(value).toString('utf8') !== value) fail(); return value; }
  if (value === null || typeof value !== 'object' || types.isProxy(value)) fail();
  const keys = Reflect.ownKeys(value), array = Array.isArray(value), out = array ? [] : {};
  if (array) {
    if (Object.getPrototypeOf(value) !== Array.prototype) fail(); const n = D(value, 'length')?.value; integer(n);
    if (n > 128 || keys.length !== n + 1) fail();
    for (let i = 0; i < n; i++) { const d = D(value, String(i)); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(); out.push(snapshot(d.value, depth + 1, budget)); }
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype || keys.length > 128) fail();
    for (const key of keys) {
      if (typeof key !== 'string' || ['then', 'toJSON', '__proto__', 'constructor', 'prototype'].includes(key)) fail();
      budget.bytes -= Buffer.byteLength(key); if (budget.bytes < 0) fail();
      Object.defineProperty(out, key, { value: snapshot(own(value, key), depth + 1, budget), enumerable: true });
    }
  }
  return F(out);
}

/** Availability classification only, never funding or grant authority. */
export function captureIssuedFundingActivationTime(expiresAt, readClock) {
  if (arguments.length !== 2 || typeof readClock !== 'function' || types.isProxy(readClock) || !Object.isFrozen(readClock)) fail();
  integer(expiresAt, 1); const value = A(readClock, undefined, []);
  if (types.isPromise(value)) { discard(value); fail(); } const observedAt = integer(value);
  return F({ expired: observedAt >= expiresAt, expiresAt, observedAt, authority: 'NONE' });
}

/** Closed powerless receipt. No claim that a grant never existed or that no
 * delivery/compensation occurred. Those independent obligations need recovery. */
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

/** The fixed native binding supplies its existing committed observer projector
 * and matcher. The existing no-activation verifier authenticates and rebinds the
 * original context. No service-store, mint, signer, sender or clock is retained.
 * Declared verifier DATA is not real authentication or current-chain proof. */
export function createIssuedExpiredFundingPreparation(context, time, ports) {
  if (arguments.length !== 3) fail(); const c = snapshot(fields(context, CONTEXT)), t = fields(time, ['expired', 'expiresAt', 'observedAt', 'authority']);
  if (t.expired !== true || t.authority !== 'NONE' || integer(t.expiresAt, 1) !== c.challenge.activationIntent.expiresAt
      || integer(t.observedAt) < t.expiresAt) fail(); deriveZenonFundingObserverTarget(c);
  const p = fields(ports, ['projectFundingEvidence', 'verifyFundingEvidence']);
  for (const fn of Object.values(p)) if (typeof fn !== 'function' || types.isProxy(fn) || !Object.isFrozen(fn)) fail();
  if (p.projectFundingEvidence === p.verifyFundingEvidence) fail(); let entered = false;
  const verify = F(async function verifyExpiredOriginalFunding() {
    if (arguments.length !== 0 || entered) fail(); entered = true;
    const candidate = A(p.projectFundingEvidence, undefined, []);
    if (types.isPromise(candidate)) { discard(candidate); fail(); }
    const verified = await verifyZenonIssuedFundingWithoutActivation({ ...c, fundingEvidence: candidate, verifyFundingEvidence: p.verifyFundingEvidence });
    return captureIssuedExpiredFundingResult(F({ expiredFundingVersion: 1, status: 'FUNDED_NO_NEW_GRANT', transactionHash: c.transactionHash,
      sourceSettlementId: verified.sourceSettlementId, fundingCommitment: verified.target.grantFundingCommitment,
      expiresAt: t.expiresAt, eligibilityObservedAt: t.observedAt, paymentAt: null,
      grantActivation: 'NOT_ENTERED_THIS_OPERATION', grantExistence: 'NOT_QUERIED', deliveryLiability: 'RECONCILIATION_REQUIRED',
      serviceDelivery: 'NOT_ESTABLISHED', compensation: 'NOT_ESTABLISHED', verification: 'SELECTED_ORIGINAL_VERIFIER',
      mayStartPayment: false, maySignPayment: false, mayDispatchService: false, mayActivateGrant: false, mayStartCompensation: false, authority: 'NONE' }),
    F({ transactionHash: c.transactionHash, fundingCommitment: c.challenge.fundingCommitment, expiresAt: t.expiresAt }));
  });
  return F({ status: 'VERIFY_EXPIRED_FUNDING', verify });
}
