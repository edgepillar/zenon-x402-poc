import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { canonicalJson } from '../canonical.js';
import {
  decodeB64Json, encodeB64Json, MAX_X402_HEADER_ENCODED_BYTES,
  sameRequirements, validatePaymentRequired, validatePaymentPayloadEnvelope,
} from '../x402-wire.js';
import {
  captureOriginalPaymentCheckpoint, encodeOriginalPaymentCheckpoint,
  restoreOriginalPaymentCheckpoint,
} from '../service-credit-pilot-original-payment-checkpoint.js';
import {
  createZenonUserSendObservationInput, snapshotZenonUnsignedUserSendFields,
  snapshotZenonUserSendPolicyBinding,
} from './transaction-planner.js';
import { validateZenonUnsignedUserSendKeyBinding } from './dynamic-plasma-user-send-key-binding.js';

const CANONICAL = canonicalJson;
const DECODE = decodeB64Json, ENCODE = encodeB64Json;
const CHALLENGE = validatePaymentRequired, PAYLOAD = validatePaymentPayloadEnvelope;
const SAME_REQUIREMENT = sameRequirements, HEADER_CAP = MAX_X402_HEADER_ENCODED_BYTES;
const CAPTURE = captureOriginalPaymentCheckpoint, ENCODE_CHECKPOINT = encodeOriginalPaymentCheckpoint;
const RESTORE = restoreOriginalPaymentCheckpoint;
const REQUEST = createZenonUserSendObservationInput, FIELDS = snapshotZenonUnsignedUserSendFields;
const BINDING = snapshotZenonUserSendPolicyBinding, KEY = validateZenonUnsignedUserSendKeyBinding;
const FREEZE = Object.freeze, CREATE = Object.create, DEFINE = Object.defineProperty;
const DESCRIPTOR = Object.getOwnPropertyDescriptor, PROTOTYPE = Object.getPrototypeOf, HAS = Object.hasOwn;
const KEYS = Reflect.ownKeys, APPLY = Reflect.apply, SORT = Array.prototype.sort;
const IS_PROXY = utilTypes.isProxy, IS_ARRAY = Array.isArray, SAFE = Number.isSafeInteger, IS = Object.is;
const OBJECT = Object.prototype, ARRAY = Array.prototype;
const FROM = Buffer.from, TEXT = Buffer.prototype.toString, BYTE_LENGTH = Buffer.byteLength;
const NativeURL = URL, ErrorType = TypeError;
const TEST = Function.call.bind(RegExp.prototype.test);
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;
const TARGET = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+(?:\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+)*$/;
const DOT = /(?:^|\/)\.{1,2}(?:\/|$)/;
const READ = FREEZE(['observedUserSendReadVersion', 'phase', 'paymentRequired', 'accepted',
  'payerAddress', 'compiledSporkIds', 'policy', 'runtimeContextDigest']);

/**
 * Synchronous SDK/SQL-free capture BEFORE the actual candidate preparer is
 * entered. Retain the independently selected intent, EXACT original challenge
 * header, original request-body/context bytes and their caller-selected IDs.
 * This is bounded declared DATA, not admission, signing or persistence proof.
 * It neither creates a transaction nor derives originals from a database/grant.
 * Assembly rechecks this retained input as DATA; that is not renewed pre-sign
 * state, a checkpoint-reader invocation or permission to sign again.
 */
export function captureZenonDynamicPlasmaOriginalFundingInput(input, fundingResourceUrl) {
  try {
    if (arguments.length !== 2 || !invariant()) reject();
    const url = resourceUrl(fundingResourceUrl);
    const stable = snapshot(input, 0, { nodes: 4096, characters: 131072 });
    const top = record(stable, ['plannerContext', 'challenge', 'originalRequest']);
    const planner = record(top.plannerContext, ['plannerContextVersion', 'readInput']);
    if (planner.plannerContextVersion !== 6) reject();
    const read = record(planner.readInput, READ);
    if (read.observedUserSendReadVersion !== 3 || read.phase !== 'UNSIGNED'
        || typeof read.runtimeContextDigest !== 'string'
        || !TEST(/^sha256:[0-9a-f]{64}$/, read.runtimeContextDigest)) reject();
    const challenge = record(top.challenge, ['status', 'resourceUrl', 'paymentRequiredHeader', 'paymentRequired']);
    if (challenge.status !== 'PAYMENT_REQUIRED' || challenge.resourceUrl !== url) reject();
    base64(challenge.paymentRequiredHeader, false);
    const decoded = DECODE(challenge.paymentRequiredHeader, { maxDecodedBytes: 4096, maxEncodedBytes: HEADER_CAP });
    CHALLENGE(decoded);
    if (ENCODE(decoded, { maxEncodedBytes: HEADER_CAP }) !== challenge.paymentRequiredHeader
        || decoded.resource.url !== url || decoded.accepts.length !== 1
        || CANONICAL(decoded) !== CANONICAL(challenge.paymentRequired)
        || CANONICAL(decoded) !== CANONICAL(read.paymentRequired)
        || !SAME_REQUIREMENT(read.accepted, decoded.accepts[0])) reject();
    REQUEST({ observationIntentVersion: 1, phase: read.phase,
      paymentRequired: read.paymentRequired, accepted: read.accepted,
      payerAddress: read.payerAddress, compiledSporkIds: read.compiledSporkIds });
    const original = record(top.originalRequest, ['requestId', 'contextId', 'requestBodyBase64', 'contextBase64']);
    identifier(original.requestId); identifier(original.contextId);
    base64(original.requestBodyBase64, true); base64(original.contextBase64, false);
    if (!invariant()) reject();
    return stable;
  } catch { reject(); }
}

/**
 * Initial wire/checkpoint encoding of a SAME-field signed candidate. Use the
 * actual closed DTO/hash/fixed-nonce/key-address/intent consumers, wire codec
 * and original-payment checkpoint codec. The received signature is preserved;
 * its canonical64-byte shape is NOT cryptographic verification. No SDK,
 * signature operation, callback, storage, current read or transport is invoked.
 *
 * The candidate/original are supplied DATA. Coherent fabricated DATA can pass;
 * this function does not authenticate their provenance or repeat the upstream
 * current-price cycle. The effectful owner must call the actual candidate
 * preparer and real payment preflight, retain pins OUTSIDE the DB, then invoke
 * the real V6 atomic method before any publication. Repeated encoding grants
 * no new signing/payment/retry authority. Never reconstruct these originals
 * from recovery metadata or re-encode a recovered payment for dispatch.
 */
export function assembleZenonDynamicPlasmaOriginalFundingData(originals, candidate, fundingResourceUrl) {
  try {
    if (arguments.length !== 3 || !invariant()) reject();
    const input = captureZenonDynamicPlasmaOriginalFundingInput(originals, fundingResourceUrl);
    const pair = record(snapshot(candidate, 0, { nodes: 2048, characters: 65536 }),
      ['originalUnsignedBlock', 'accountBlock']);
    const original = FIELDS(pair.originalUnsignedBlock);
    const raw = record(pair.accountBlock, KEYS(original.accountBlock));
    const signature = signatureText(raw.signature), projected = CREATE(OBJECT);
    for (const field of KEYS(original.accountBlock)) put(projected, field, field === 'signature' ? '' : raw[field]);
    const received = FIELDS(projected);
    if (received.fieldDigest !== original.fieldDigest) reject();
    KEY(original.accountBlock);
    const read = input.plannerContext.readInput;
    const binding = BINDING({ bindingVersion: 1, subject: original.subject,
      paymentRequired: read.paymentRequired, accepted: read.accepted,
      payerAddress: read.payerAddress, compiledSporkIds: read.compiledSporkIds });
    const transaction = CREATE(OBJECT);
    for (const field of KEYS(original.accountBlock))
      put(transaction, field, field === 'signature' ? signature : received.accountBlock[field]);
    FREEZE(transaction);
    const paymentPayload = FREEZE({ x402Version: 2, resource: input.challenge.paymentRequired.resource,
      accepted: read.accepted, payload: FREEZE({ transaction, intentDigest: binding.intentDigest }) });
    PAYLOAD(paymentPayload);
    const paymentSignatureHeader = ENCODE(paymentPayload, { maxEncodedBytes: HEADER_CAP });
    base64(paymentSignatureHeader, false); // V6 checkpoint fields are at most4096 decoded bytes.
    const captured = CAPTURE({ binding: { requestId: input.originalRequest.requestId,
      paymentHash: transaction.hash, origin: new NativeURL(fundingResourceUrl).origin,
      contextId: input.originalRequest.contextId }, originalBytes: {
      requestBody: input.originalRequest.requestBodyBase64, paymentPayload: paymentSignatureHeader,
      paymentRequirements: input.challenge.paymentRequiredHeader, context: input.originalRequest.contextBase64,
    } });
    const serializedCheckpoint = ENCODE_CHECKPOINT(captured.checkpoint);
    RESTORE(serializedCheckpoint, captured.pins);
    if (!invariant()) reject();
    return FREEZE({ originalFundingDataVersion: 1,
      pair: FREEZE({ challenge: input.challenge, paymentSignatureHeader }),
      serializedCheckpoint, expectedPins: captured.pins,
      paymentPayload, requirement: read.accepted, paymentRequired: input.challenge.paymentRequired,
      transactionHash: transaction.hash, signatureValidation: 'NOT_PERFORMED',
      persistence: 'NOT_PERFORMED', authority: 'NONE' });
  } catch { reject(); }
}

/**
 * Descriptor-safe copy of INDEPENDENT caller pins, checked against retained
 * canonical bytes. Never learn expectations from a DB/checkpoint binding.
 * Equality proves DATA consistency, not that a caller durably retained pins.
 */
export function snapshotZenonDynamicPlasmaOriginalFundingPins(serializedCheckpoint, expectedPins) {
  try {
    if (arguments.length !== 2 || !invariant() || typeof serializedCheckpoint !== 'string'
        || serializedCheckpoint.length > 32768
        || APPLY(BYTE_LENGTH, Buffer, [serializedCheckpoint, 'utf8']) > 32768) reject();
    const pins = snapshot(expectedPins, 0, { nodes: 64, characters: 8192 });
    record(pins, ['binding', 'digests']);
    RESTORE(serializedCheckpoint, pins);
    if (!invariant()) reject();
    return pins;
  } catch { reject(); }
}

function resourceUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096
      || APPLY(BYTE_LENGTH, Buffer, [value, 'utf8']) > 4096) reject();
  const url = new NativeURL(value);
  if (url.protocol !== 'https:' || url.hostname === '' || url.username !== '' || url.password !== ''
      || url.search !== '' || url.hash !== '' || url.href !== value || url.pathname === '/'
      || !TEST(TARGET, url.pathname) || TEST(DOT, url.pathname)) reject();
  return value;
}
function identifier(value) {
  if (typeof value !== 'string' || !value.length || value.length > 256
      || APPLY(BYTE_LENGTH, Buffer, [value, 'utf8']) > 256
      || TEST(/[\u0000-\u001f\u007f-\u009f]/u, value)
      || APPLY(TEXT, APPLY(FROM, Buffer, [value, 'utf8']), ['utf8']) !== value) reject();
}
function base64(value, empty) {
  if (typeof value !== 'string' || (!empty && value.length === 0)
      || value.length > 5464 || !TEST(BASE64, value)) reject();
  const bytes = APPLY(FROM, Buffer, [value, 'base64']);
  if (bytes.length > 4096 || (!empty && bytes.length === 0)
      || APPLY(TEXT, bytes, ['base64']) !== value) reject();
}
function signatureText(value) {
  if (typeof value !== 'string' || value.length !== 88 || !TEST(SIGNATURE, value)) reject();
  const bytes = APPLY(FROM, Buffer, [value, 'base64']);
  if (bytes.length !== 64 || APPLY(TEXT, bytes, ['base64']) !== value) reject();
  return value;
}
function record(value, fields) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value)
      || PROTOTYPE(value) !== OBJECT || KEYS(value).length !== fields.length) reject();
  const result = CREATE(OBJECT);
  for (const field of fields) {
    const d = DESCRIPTOR(value, field);
    if (d === undefined || !d.enumerable || !HAS(d, 'value')) reject();
    put(result, field, d.value);
  }
  return FREEZE(result);
}
function snapshot(value, depth, budget) {
  if (depth > 16 || --budget.nodes < 0) reject();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    budget.characters -= value.length;
    if (value.length > 8192 || budget.characters < 0) reject();
    return value;
  }
  if (typeof value === 'number') {
    if (!SAFE(value) || value < 0 || IS(value, -0)) reject();
    return value;
  }
  if (typeof value !== 'object' || IS_PROXY(value)) reject();
  const proto = PROTOTYPE(value), keys = KEYS(value);
  if (proto === ARRAY) {
    const length = DESCRIPTOR(value, 'length');
    if (!IS_ARRAY(value) || !length || !HAS(length, 'value') || length.enumerable
        || !SAFE(length.value) || length.value < 0 || length.value > 16
        || keys.length !== length.value + 1) reject();
    const result = [];
    for (let n = 0; n < length.value; n++) {
      const d = DESCRIPTOR(value, String(n));
      if (!d || !d.enumerable || !HAS(d, 'value')) reject();
      put(result, String(n), snapshot(d.value, depth + 1, budget));
    }
    return FREEZE(result);
  }
  if (proto !== OBJECT || keys.length > 64 || keys.length > budget.nodes) reject();
  const result = CREATE(OBJECT);
  APPLY(SORT, keys, []);
  for (const key of keys) {
    if (typeof key !== 'string' || key.length > 128) reject();
    budget.characters -= key.length;
    const d = DESCRIPTOR(value, key);
    if (budget.characters < 0 || !d || !d.enumerable || !HAS(d, 'value')) reject();
    put(result, key, snapshot(d.value, depth + 1, budget));
  }
  return FREEZE(result);
}
function invariant() {
  return DESCRIPTOR(OBJECT, 'then') === undefined && DESCRIPTOR(OBJECT, 'toJSON') === undefined
    && DESCRIPTOR(ARRAY, 'toJSON') === undefined;
}
function put(target, key, value) {
  const d = CREATE(null);
  d.value = value; d.enumerable = true; d.writable = false; d.configurable = false;
  DEFINE(target, key, d);
}
function reject() {
  const code = 'zenon_dynamic_plasma_original_funding_data_rejected';
  const error = new ErrorType(code);
  put(error, 'code', code);
  const d = CREATE(null); d.value = 'TypeError: ' + code; d.enumerable = false;
  d.writable = false; d.configurable = false; DEFINE(error, 'stack', d);
  throw FREEZE(error);
}
