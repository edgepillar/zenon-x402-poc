import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';

const freeze = Object.freeze;
const ownKeys = Reflect.ownKeys;
const getDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const hasOwn = Object.hasOwn;
const defineProperty = Object.defineProperty;
const sameValue = Object.is;
const objectPrototype = Object.prototype;
const isProxy = utilTypes.isProxy;
const isSafeInteger = Number.isSafeInteger;
const apply = Reflect.apply;
const regexpTest = RegExp.prototype.test;
const includes = String.prototype.includes;
const byteLength = Buffer.byteLength;
const stringify = JSON.stringify;
const parse = JSON.parse;
const URLConstructor = URL;
const TypeErrorConstructor = TypeError;
const CREATE_HASH = createHash;

const PROFILE = 'service-credit.execute.v1.empty-body';
const EMPTY_DIGEST = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const DOMAIN = 'zenon-x402:original-service-request-custody-v1';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^[0-9a-f]{64}$/;
const REQUEST_TARGET = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+(?:\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+)*$/;
const DOT_SEGMENT = /(?:^|\/)\.{1,2}(?:\/|$)/;
const POLICY_FIELDS = freeze(['policyVersion', 'maxRequests', 'serviceResourceUrl']);
const INPUT_FIELDS = freeze([
  'originalRequestJson', 'originalBodyBase64', 'serviceResourceUrl',
]);
const BINDING_FIELDS = freeze(['fundingResourceUrl', 'paymentHash', 'network']);
const KEY_FIELDS = freeze(['grantId', 'requestId']);
const REQUEST_FIELDS = freeze([
  'modelVersion', 'grantId', 'requestId', 'method', 'routeId',
  'canonicalBodyDigest', 'selectedContentType', 'maxCostUnits',
]);
const RECORD_FIELDS = freeze([
  'custodyVersion', 'profile', 'originalRequestJson', 'originalBodyBase64',
  'serviceResourceUrl', 'fundingResourceUrl', 'paymentHash', 'network',
  'grantId', 'requestId', 'checksum',
]);

/**
 * Fixed business-metadata contract only.
 *
 * The sole supported body is the literal empty base64 string. This does not
 * establish that arbitrary bodies are credential-free. Proof, signature,
 * authorization and header inputs are not accepted.
 *
 * Checksums detect declared-data corruption, not same-user rewriting,
 * signature authenticity, authenticated identity, durable custody or authority.
 * No request is dispatched, authorized, funded, debited or executed here.
 * Existing ServiceCredit authorization remains external and must not be
 * regenerated or re-signed as a consequence of reading this metadata.
 *
 * Policy: exactly POLICY_FIELDS; explicit capacity 1..1024, no default.
 * Capture: exactly INPUT_FIELDS plus a separate BINDING_FIELDS record.
 * Envelope: exactly RECORD_FIELDS in that order, at most 16384 UTF8 bytes
 * and UTF16 units. Its original request is canonical JSON in REQUEST_FIELDS
 * order, at most 4096 bytes/units. All accepted original strings are retained.
 */

export function snapshotOriginalServiceRequestCustodyPolicy(input, fundingResourceUrl) {
  if (arguments.length !== 2) reject();
  const p = record(input, POLICY_FIELDS);
  if (p.policyVersion !== 1) reject();
  positive(p.maxRequests);
  if (p.maxRequests > 1024) reject();
  const service = canonicalUrl(p.serviceResourceUrl, true);
  const funding = canonicalUrl(fundingResourceUrl, false);
  if (service.origin !== funding.origin) reject();
  return freeze({
    policyVersion: 1,
    maxRequests: p.maxRequests,
    serviceResourceUrl: service.href,
  });
}

export function snapshotOriginalServiceRequestCustodyKey(input) {
  if (arguments.length !== 1) reject();
  const k = record(input, KEY_FIELDS);
  identifier(k.grantId);
  identifier(k.requestId);
  return freeze({ grantId: k.grantId, requestId: k.requestId });
}

export function captureOriginalServiceRequestCustody(input, binding) {
  if (arguments.length !== 2) reject();
  return capture(input, binding);
}

export function validateOriginalServiceRequestCustody(input) {
  if (arguments.length !== 1) reject();
  return validateRecord(input);
}

export function serializeOriginalServiceRequestCustody(input) {
  if (arguments.length !== 1) reject();
  const text = stringify(validateRecord(input));
  bounded(text, 16384);
  return text;
}

export function parseOriginalServiceRequestCustody(text) {
  if (arguments.length !== 1) reject();
  bounded(text, 16384);
  let decoded;
  try { decoded = parse(text); } catch { reject(); }
  const result = validateRecord(decoded);
  if (stringify(result) !== text) reject();
  return result;
}

function record(value, fields) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || getPrototypeOf(value) !== objectPrototype) reject();
  const keys = ownKeys(value);
  if (keys.length !== fields.length) reject();
  const result = {};
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    const descriptor = getDescriptor(value, field);
    if (descriptor === undefined || descriptor.enumerable !== true
        || !hasOwn(descriptor, 'value')) reject();
    result[field] = descriptor.value;
  }
  return result;
}

function bounded(value, limit) {
  if (typeof value !== 'string' || value.length === 0 || value.length > limit
      || apply(byteLength, Buffer, [value, 'utf8']) > limit) reject();
}

function test(pattern, value) {
  return apply(regexpTest, pattern, [value]);
}

function contains(value, fragment) {
  return apply(includes, value, [fragment]);
}

function positive(value) {
  if (!isSafeInteger(value) || value <= 0 || sameValue(value, -0)) reject();
}

function identifier(value) {
  bounded(value, 128);
  if (!test(IDENTIFIER, value) || contains(value, '://')) reject();
}

function canonicalUrl(value, service) {
  bounded(value, 4096);
  if (contains(value, '\r') || contains(value, '\n')
      || contains(value, '#') || contains(value, '?')) reject();
  let parsed;
  try { parsed = new URLConstructor(value); } catch { reject(); }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== ''
      || parsed.hostname === '' || parsed.search !== '' || parsed.hash !== ''
      || parsed.href !== value || parsed.pathname === '/'
      || parsed.pathname.length > 4096
      || apply(byteLength, Buffer, [parsed.pathname, 'utf8']) > 4096
      || !test(REQUEST_TARGET, parsed.pathname) || test(DOT_SEGMENT, parsed.pathname)
      || (service && parsed.pathname !== '/service-credit/v1/execute')) reject();
  return freeze({ href: value, origin: parsed.origin });
}

function requestFromJson(text) {
  bounded(text, 4096);
  let decoded;
  try { decoded = parse(text); } catch { reject(); }
  const r = record(decoded, REQUEST_FIELDS);
  identifier(r.grantId);
  identifier(r.requestId);
  positive(r.maxCostUnits);
  if (r.modelVersion !== 1 || r.method !== 'POST'
      || r.routeId !== 'service-credit.execute.v1'
      || r.canonicalBodyDigest !== EMPTY_DIGEST
      || r.selectedContentType !== 'application/json') reject();
  const canonical = {
    modelVersion: 1,
    grantId: r.grantId,
    requestId: r.requestId,
    method: 'POST',
    routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: EMPTY_DIGEST,
    selectedContentType: 'application/json',
    maxCostUnits: r.maxCostUnits,
  };
  if (stringify(canonical) !== text) reject();
  return freeze(canonical);
}

function snapshotBinding(input) {
  const b = record(input, BINDING_FIELDS);
  const funding = canonicalUrl(b.fundingResourceUrl, false);
  bounded(b.paymentHash, 64);
  bounded(b.network, 256);
  if (b.paymentHash.length !== 64 || !test(HASH, b.paymentHash)) reject();
  return freeze({
    fundingResourceUrl: funding.href,
    paymentHash: b.paymentHash,
    network: b.network,
    origin: funding.origin,
  });
}

function checksum(core) {
  return 'sha256:' + CREATE_HASH('sha256')
    .update(DOMAIN).update('\0').update(stringify(core), 'utf8').digest('hex');
}

function capture(input, bindingInput) {
  const v = record(input, INPUT_FIELDS);
  const b = snapshotBinding(bindingInput);
  if (v.originalBodyBase64 !== '') reject();
  const request = requestFromJson(v.originalRequestJson);
  const service = canonicalUrl(v.serviceResourceUrl, true);
  if (service.origin !== b.origin) reject();
  const core = {
    custodyVersion: 1,
    profile: PROFILE,
    originalRequestJson: v.originalRequestJson,
    originalBodyBase64: '',
    serviceResourceUrl: service.href,
    fundingResourceUrl: b.fundingResourceUrl,
    paymentHash: b.paymentHash,
    network: b.network,
    grantId: request.grantId,
    requestId: request.requestId,
  };
  const result = { ...core, checksum: checksum(core) };
  bounded(stringify(result), 16384);
  return freeze(result);
}

function validateRecord(input) {
  const r = record(input, RECORD_FIELDS);
  if (r.custodyVersion !== 1 || r.profile !== PROFILE) reject();
  const expected = capture({
    originalRequestJson: r.originalRequestJson,
    originalBodyBase64: r.originalBodyBase64,
    serviceResourceUrl: r.serviceResourceUrl,
  }, {
    fundingResourceUrl: r.fundingResourceUrl,
    paymentHash: r.paymentHash,
    network: r.network,
  });
  if (r.grantId !== expected.grantId || r.requestId !== expected.requestId
      || r.checksum !== expected.checksum) reject();
  return expected;
}

function reject() {
  const error = new TypeErrorConstructor('Service credit original request custody rejected');
  defineProperty(error, 'code', {
    value: 'service_credit_original_request_custody_rejected',
    enumerable: true,
  });
  defineProperty(error, 'stack', {
    value: 'TypeError: Service credit original request custody rejected',
    enumerable: false,
    writable: false,
    configurable: false,
  });
  throw freeze(error);
}

/**
 * V3 dispatch-intent metadata only. A committed intent means possibly attempted,
 * including the case where no service callback ever ran. No authority follows.
 * Canonical checksums detect corruption, not valid same-user database rewriting.
 */
const INTENT_FIELDS = freeze([
  'intentVersion', 'profile', 'state', 'grantId', 'requestId',
  'originalChecksum', 'originalEnvelopeDigest', 'fundingResourceUrl',
  'paymentHash', 'network', 'fundingRevision', 'challengeDigest',
  'paymentDigest', 'custodyPolicyDigest', 'checksum',
]);
const INTENT_BINDING_FIELDS = freeze([
  'fundingRevision', 'challengeDigest', 'paymentDigest', 'custodyPolicy',
]);
const INTENT_DIGEST = /^sha256:[0-9a-f]{64}$/;
const INTENT_DOMAIN = 'zenon-x402:original-dispatch-intent-v1';
function intentCanonical(value) {
  if (value === null || typeof value !== 'object') return stringify(value);
  return '{' + Object.keys(value).sort().map(key =>
    stringify(key) + ':' + intentCanonical(value[key])).join(',') + '}';
}
function intentDigest(domain, value) {
  return 'sha256:' + CREATE_HASH('sha256').update(domain).update('\0')
    .update(typeof value === 'string' ? value : intentCanonical(value), 'utf8').digest('hex');
}
function requireIntentDigest(value) {
  bounded(value, 71);
  if (!test(INTENT_DIGEST, value)) rejectIntent();
}
function validateIntent(input) {
  const r = record(input, INTENT_FIELDS);
  if (r.intentVersion !== 1 || r.profile !== PROFILE || r.state !== 'INTENT_RECORDED') rejectIntent();
  identifier(r.grantId); identifier(r.requestId);
  canonicalUrl(r.fundingResourceUrl, false);
  bounded(r.paymentHash, 64); bounded(r.network, 256); positive(r.fundingRevision);
  if (!test(HASH, r.paymentHash)) rejectIntent();
  for (const key of ['originalChecksum','originalEnvelopeDigest','challengeDigest',
    'paymentDigest','custodyPolicyDigest','checksum']) requireIntentDigest(r[key]);
  const core = {};
  for (const key of INTENT_FIELDS) if (key !== 'checksum') core[key] = r[key];
  if (r.checksum !== intentDigest(INTENT_DOMAIN, core)) rejectIntent();
  const result = { ...core, checksum: r.checksum };
  bounded(intentCanonical(result), 16384);
  return freeze(result);
}
export function captureOriginalServiceDispatchIntent(original, binding) {
  if (arguments.length !== 2) rejectIntent();
  const o = validateRecord(original), b = record(binding, INTENT_BINDING_FIELDS);
  positive(b.fundingRevision); requireIntentDigest(b.challengeDigest); requireIntentDigest(b.paymentDigest);
  const policy = snapshotOriginalServiceRequestCustodyPolicy(b.custodyPolicy, o.fundingResourceUrl);
  if (policy.serviceResourceUrl !== o.serviceResourceUrl) rejectIntent();
  const core = {
    intentVersion: 1, profile: PROFILE, state: 'INTENT_RECORDED',
    grantId: o.grantId, requestId: o.requestId, originalChecksum: o.checksum,
    originalEnvelopeDigest: 'sha256:' + CREATE_HASH('sha256').update(stringify(o), 'utf8').digest('hex'),
    fundingResourceUrl: o.fundingResourceUrl, paymentHash: o.paymentHash, network: o.network,
    fundingRevision: b.fundingRevision, challengeDigest: b.challengeDigest, paymentDigest: b.paymentDigest,
    custodyPolicyDigest: intentDigest('zenon-x402:dispatch-intent-policy-v1', policy),
  };
  return validateIntent({ ...core, checksum: intentDigest(INTENT_DOMAIN, core) });
}
export function serializeOriginalServiceDispatchIntent(input) {
  if (arguments.length !== 1) rejectIntent();
  return intentCanonical(validateIntent(input));
}
export function parseOriginalServiceDispatchIntent(text) {
  if (arguments.length !== 1) rejectIntent();
  bounded(text, 16384);
  let decoded;
  try { decoded = parse(text); } catch { rejectIntent(); }
  const result = validateIntent(decoded);
  if (intentCanonical(result) !== text) rejectIntent();
  return result;
}
function rejectIntent() {
  const error = new TypeErrorConstructor('Service credit original dispatch intent rejected');
  defineProperty(error, 'code', { value: 'service_credit_original_dispatch_intent_rejected', enumerable: true });
  defineProperty(error, 'stack', {
    value: 'TypeError: Service credit original dispatch intent rejected',
    enumerable: false, writable: false, configurable: false,
  });
  throw freeze(error);
}
