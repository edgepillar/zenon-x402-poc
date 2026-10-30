import { decodeApiCreditStoredGrantQueryProfile,consumeApiCreditStoredGrantQueryProfile,releaseApiCreditStoredGrantQueryProfile } from './api-credit-stored-grant-query-profile.js';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson, paymentIntentDigest } from './canonical.js';
import { restoreOriginalPaymentCheckpoint } from './service-credit-pilot-original-payment-checkpoint.js';
import { createFundingPostOriginalPaymentCheckpointClient } from './x402-original-payment-checkpoint-client.js';
import { decodeB64Json } from './x402-wire.js';
import { captureServiceCreditOriginalFundingIdentity, captureServiceCreditOriginalFundingGrantQuery } from './service-credit-original-funding-grant.js';
import { captureOriginalFundingGrantRoute, createOriginalFundingGrantWireRequest } from './service-credit-original-grant-http-binding.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, PROFILES = new WeakMap();
function fail() { throw new TypeError('API_CREDIT_ORIGINAL_GRANT_QUERY_PROFILE'); }
function fields(v, names) {
  if (v === null || typeof v !== 'object' || types.isProxy(v) || Object.getPrototypeOf(v) !== Object.prototype
      || Reflect.ownKeys(v).length !== names.length) fail();
  const out = {}; for (const k of names) { const d = D(v, k); if (!d?.enumerable || !OWN(d, 'value')) fail(); out[k] = d.value; } return out;
}
function freezeJson(v, depth = 0, budget = { nodes: 4096 }) {
  if (--budget.nodes < 0 || depth > 16) fail();
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
  if (typeof v === 'number') { if (!Number.isSafeInteger(v) || Object.is(v, -0)) fail(); return; }
  if (typeof v !== 'object') fail(); for (const member of Object.values(v)) freezeJson(member, depth + 1, budget); F(v);
}
function digest(domain, value) { return 'sha256:' + createHash('sha256').update(domain + '\0', 'ascii').update(canonicalJson(value)).digest('hex'); }
function positive(n, high) { if (!Number.isSafeInteger(n) || Object.is(n, -0) || n < 1 || n > high) fail(); }

/** Ready version one retains one original payment, grant-selection DATA and
 * an existing read proof. Version two selects existing custody and independent
 * pins; version three also binds independent purchase terms/original bytes.
 * Neither admits a wallet, key pipe or signer. These
 * comparisons do not authenticate signatures, chain state or funding. */
export function decodeApiCreditOriginalGrantQueryProfile(text) {
  if (arguments.length !== 1 || typeof text !== 'string' || Buffer.byteLength(text) > 65536
      || Buffer.from(text).toString('utf8') !== text) fail();
  let raw; try { raw = JSON.parse(text); freezeJson(raw); } catch { fail(); }
  if (canonicalJson(raw) !== text) fail();
  if (raw.originalGrantQueryVersion === 2 || raw.originalGrantQueryVersion === 3) return decodeApiCreditStoredGrantQueryProfile(text);
  const c = fields(raw, ['originalGrantQueryVersion', 'originalPayment', 'originalFunding', 'query', 'transport']);
  if (c.originalGrantQueryVersion !== 1) fail();
  const original = F(fields(c.originalPayment, ['resourceUrl', 'serializedCheckpoint', 'expectedPins']));
  const checkpoint = restoreOriginalPaymentCheckpoint(original.serializedCheckpoint, original.expectedPins);
  let probe;
  try {
    probe = createFundingPostOriginalPaymentCheckpointClient({ ...original, readOriginalPaymentCheckpoint: F(() => { fail(); }) });
    probe.selection();
  } finally { if (probe !== undefined) probe.close(); }
  const identity = captureServiceCreditOriginalFundingIdentity(c.originalFunding);
  const q = fields(c.query, ['requestId', 'proof', 'expectedQueryDigest']);
  const selected = captureServiceCreditOriginalFundingGrantQuery({ queryVersion: 1, requestId: q.requestId, originalFunding: identity });
  if (q.expectedQueryDigest !== selected.request.canonicalBodyDigest) fail();
  const route = captureOriginalFundingGrantRoute(original.resourceUrl, identity.paymentResourceDigest);
  createOriginalFundingGrantWireRequest(route, selected.query, q.proof);
  const options = { maxEncodedBytes: 5464, maxDecodedBytes: 4096 };
  const required = decodeB64Json(checkpoint.originalBytes.paymentRequirements, options);
  const payload = decodeB64Json(checkpoint.originalBytes.paymentPayload, options), accepted = payload.accepted, tx = payload.payload.transaction;
  const tags = required.resource.tags, chain = accepted.extra.zenonChain;
  if (identity.transactionId !== 'zenontx:' + checkpoint.binding.paymentHash || tx.hash !== checkpoint.binding.paymentHash
      || identity.network !== accepted.network || canonicalJson(identity.chainProfile) !== canonicalJson(chain)
      || !Number.isSafeInteger(tx.chainIdentifier) || String(tx.chainIdentifier) !== identity.chainProfile.chainIdentifier
      || identity.asset !== accepted.asset || identity.asset !== tx.tokenStandard
      || identity.amount !== accepted.amount || identity.amount !== tx.amount
      || identity.payee !== accepted.payTo || identity.payee !== tx.toAddress || identity.holderId !== tx.address
      || identity.paymentResourceDigest !== digest('zenon-x402-service-credit-payment-resource-v1', required.resource)
      || identity.paymentRequirementDigest !== digest('zenon-x402-service-credit-payment-requirement-v1', accepted)
      || identity.paymentIntentDigest !== 'sha256:' + paymentIntentDigest(required, accepted)
      || payload.payload.intentDigest !== identity.paymentIntentDigest.slice(7)
      || tx.data !== Buffer.from(identity.paymentIntentDigest.slice(7), 'hex').toString('base64')
      || !Array.isArray(tags) || tags.length !== 3 || tags[0] !== 'x402-service-credit-funding-v1'
      || tags[1] !== identity.grantFundingCommitment.slice(7, 39) || tags[2] !== identity.grantFundingCommitment.slice(39)) fail();
  const t = fields(c.transport, ['caBase64', 'requestDeadlineMs', 'handshakeDeadlineMs', 'closeGraceMs']);
  positive(t.requestDeadlineMs, 60000); positive(t.handshakeDeadlineMs, t.requestDeadlineMs); positive(t.closeGraceMs, 30000);
  if (t.requestDeadlineMs + t.closeGraceMs > 60000 || typeof t.caBase64 !== 'string' || t.caBase64.length < 4 || t.caBase64.length > 8192
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(t.caBase64)
      || Buffer.from(t.caBase64, 'base64').toString('base64') !== t.caBase64) fail();
  const captured = F({ route, query: selected.query, proof: q.proof, transport: F(t),
    checkpointDigest: createHash('sha256').update(original.serializedCheckpoint).digest('hex'), queryDigest: selected.request.canonicalBodyDigest });
  const state = { captured, used: false, released: false };
  const release = F(function release() { if (arguments.length !== 0) fail(); state.captured = null; state.released = true; });
  const token = F({ originalGrantQueryVersion: 1, fundingResourceUrl: route.fundingResourceUrl,
    paymentHash: checkpoint.binding.paymentHash, requestId: q.requestId, checkpointDigest: captured.checkpointDigest,
    queryDigest: captured.queryDigest, release }); PROFILES.set(token, state); return token;
}
export function consumeApiCreditOriginalGrantQueryProfile(token) {
  if (arguments.length !== 1 || token === null || typeof token !== 'object' || types.isProxy(token)) fail();
  if (!PROFILES.has(token)) return consumeApiCreditStoredGrantQueryProfile(token);
  const state = PROFILES.get(token); if (!state || state.used || state.released) fail(); state.used = true; return state.captured;
}
export function releaseApiCreditOriginalGrantQueryProfile(token) {
  if (arguments.length !== 1 || token === null || typeof token !== 'object' || types.isProxy(token)) fail();
  if (!PROFILES.has(token)) return releaseApiCreditStoredGrantQueryProfile(token);
  token.release();
}
