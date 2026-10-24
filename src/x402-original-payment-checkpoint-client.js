import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { canonicalJson } from './canonical.js';
import {
  restoreOriginalPaymentCheckpoint, encodeOriginalPaymentCheckpoint,
} from './service-credit-pilot-original-payment-checkpoint.js';
import {
  decodeB64Json, encodeB64Json, validatePaymentRequired, validatePaymentPayloadEnvelope,
  validateActiveUpfrontRequirement, sameRequirements, sameResource,
} from './x402-wire.js';
import { captureOfficialUpfrontHttpsRoute } from './x402-official-https-request-binding.js';
import { captureFundingPostCheckpointRoute } from './x402-funding-post-checkpoint-route.js';

const FREEZE = Object.freeze, PROTO = Object.getPrototypeOf, DESC = Object.getOwnPropertyDescriptor;
const KEYS = Reflect.ownKeys, OWN = Object.hasOwn, APPLY = Reflect.apply;
const IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const OBJECT = Object.prototype, ARRAY = Array.prototype;
const COPY = JSON.parse, TEXT = JSON.stringify, BYTES = Buffer.byteLength;
const RESTORE = restoreOriginalPaymentCheckpoint, ENCODE_CHECKPOINT = encodeOriginalPaymentCheckpoint;
const DECODE = decodeB64Json, ENCODE = encodeB64Json, CANONICAL = canonicalJson;

/**
 * SDK/SQL-free adapter for ONE externally retained original checkpoint.
 * The effectful composition supplies its actual already-owned V6 read method.
 * This callback is a trusted read capability, not authentication of a DB.
 * No creator/signer, transport, store mutation, retry or grant activation.
 *
 * Every actual checkpoint read uses caller-supplied independent pins again
 * and must reproduce the complete retained canonical checkpoint. Only exact
 * zero-body GET /paid originals are supported. The selected SDK may create
 * its envelope once. Its validated DATA must match the original, including
 * all transaction fields; JSON property order may differ. Return only the
 * exact original header, NEVER the SDK-reencoded comparison value.
 */
export function createOriginalPaymentCheckpointClient(configuration) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createCheckpointClient(configuration, false);
}

/**
 * Separate POST /funding selection for the actual DP funding checkpoint.
 * Reuses all independent-pin/full-byte/one-context fences. Never reinterpret
 * a GET /paid challenge, change a signed payload, sign or submit a payment.
 * The returned selection explicitly carries fixed method/target/body DATA;
 * it is neither a native request binding nor service/dispatch authority.
 */
export function createFundingPostOriginalPaymentCheckpointClient(configuration) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createCheckpointClient(configuration, true);
}

function createCheckpointClient(configuration, fundingPost) {
  let resource, original, fixedRequired, fixedPayload, readCheckpoint;
  let requestProfile = null;
  try {
    if (!invariant()) fail('configuration_rejected');
    const c = record(configuration, [
      'resourceUrl', 'serializedCheckpoint', 'expectedPins', 'readOriginalPaymentCheckpoint',
    ]);
    if (fundingPost) {
      requestProfile = captureFundingPostCheckpointRoute(c.resourceUrl);
      resource = requestProfile.resourceUrl;
    } else resource = captureOfficialUpfrontHttpsRoute(c.resourceUrl).resourceUrl;
    if (typeof c.readOriginalPaymentCheckpoint !== 'function' || IS_PROXY(c.readOriginalPaymentCheckpoint))
      fail('configuration_rejected');
    original = RESTORE(c.serializedCheckpoint, snapshot(c.expectedPins));
    if (original.binding.origin !== new URL(resource).origin || original.originalBytes.requestBody !== '')
      fail('configuration_rejected');
    fixedRequired = DECODE(original.originalBytes.paymentRequirements,
      { maxEncodedBytes: 5464, maxDecodedBytes: 4096 });
    fixedPayload = DECODE(original.originalBytes.paymentPayload,
      { maxEncodedBytes: 5464, maxDecodedBytes: 4096 });
    validatePaymentRequired(fixedRequired); validatePaymentPayloadEnvelope(fixedPayload);
    if (fixedRequired.accepts.length !== 1 || fixedRequired.resource.url !== resource
        || fixedPayload.resource.url !== resource
        || !sameResource(fixedRequired.resource, fixedPayload.resource)
        || !sameRequirements(fixedRequired.accepts[0], fixedPayload.accepted)
        || fixedPayload.payload.transaction.hash !== original.binding.paymentHash
        || ENCODE(fixedRequired) !== original.originalBytes.paymentRequirements
        || ENCODE(fixedPayload) !== original.originalBytes.paymentPayload) fail('configuration_rejected');
    validateActiveUpfrontRequirement(fixedRequired.accepts[0]);
    readCheckpoint = c.readOriginalPaymentCheckpoint;
  } catch { fail('configuration_rejected'); }
  const REQUIRED_TEXT = CANONICAL(fixedRequired), PAYLOAD_TEXT = TEXT(fixedPayload);
  const PAYLOAD_DATA = payloadData(fixedPayload);
  const SERIALIZED = ENCODE_CHECKPOINT(original);
  let originalHeader = original.originalBytes.paymentPayload;
  let challengeHeader = original.originalBytes.paymentRequirements;
  let phase = 'OPEN', reading = false, reads = 0, creationAttempts = 0, created = false, uncertain = false;
  let admittedPins = null;
  let selected = FREEZE({ resourceUrl: resource, requirement: deepFreeze(snapshot(fixedRequired.accepts[0])),
    ...(fundingPost ? { requestProfile } : {}) });
  configuration = null; resource = null; original = null; fixedRequired = null; fixedPayload = null;

  function admitted() {
    if (!invariant() || phase !== 'OPEN' || reading) fail('unavailable');
  }
  function callerPins(pins) {
    admitted();
    const copied = snapshot(pins);
    try { RESTORE(SERIALIZED, copied); } // Expectations are never learned from the reader.
    catch { fail('pins_rejected'); }
    return deepFreeze(copied);
  }
  function retained(pins) {
    admitted();
    const reader = readCheckpoint;
    reading = true; reads++;
    try {
      const result = APPLY(reader, undefined, [pins]);
      if (IS_PROMISE(result) || IS_PROXY(result)) fail('read_rejected');
      const serialized = ENCODE_CHECKPOINT(snapshot(result));
      if (phase !== 'OPEN' || !invariant() || serialized !== SERIALIZED) fail('read_rejected');
      RESTORE(serialized, pins);
    } catch {
      uncertain = true;
      if (phase === 'OPEN') phase = 'HELD';
      fail('read_rejected');
    } finally { reading = false; }
  }
  const captureChallenge = FREEZE(function captureChallenge(input) {
    if (arguments.length !== 1) fail('input_rejected');
    admitted();
    const c = record(input, ['paymentRequiredHeader', 'expectedPins']);
    if (creationAttempts !== 0) fail('original_already_consumed');
    if (c.paymentRequiredHeader !== challengeHeader) fail('challenge_rejected');
    const pins = callerPins(c.expectedPins);
    retained(pins);
    admittedPins = deepFreeze(pins);
    return FREEZE({ paymentRequiredHeader: challengeHeader, expectedPins: admittedPins });
  });
  const createPaymentPayload = FREEZE(function createPaymentPayload(challenge, accepted) {
    if (arguments.length !== 2) fail('input_rejected');
    admitted();
    // Invalid input does not enter the read capability or consume the original.
    try {
      if (CANONICAL(snapshot(challenge)) !== REQUIRED_TEXT
          || !sameRequirements(snapshot(accepted), selected.requirement)) fail('challenge_rejected');
    } catch { fail('challenge_rejected'); }
    if (admittedPins === null) fail('challenge_not_admitted');
    if (creationAttempts !== 0) fail('original_already_consumed');
    // Consume before the reader can reenter. Its failure never resets this.
    creationAttempts = 1;
    const pins = callerPins(admittedPins);
    retained(pins);
    created = true;
    return deepFreeze(COPY(PAYLOAD_TEXT));
  });
  const selectOriginalPaymentHeader = FREEZE(function selectOriginalPaymentHeader(encoded, pins) {
    if (arguments.length !== 2) fail('input_rejected');
    admitted();
    if (!created) fail('header_rejected');
    try {
      const candidate = DECODE(encoded, { maxEncodedBytes: 8192, maxDecodedBytes: 6144 });
      if (ENCODE(candidate) !== encoded || payloadData(candidate) !== PAYLOAD_DATA) fail('header_rejected');
    } catch { fail('header_rejected'); }
    const checked = callerPins(pins);
    retained(checked);
    return originalHeader;
  });
  const selection = FREEZE(function selection() {
    if (arguments.length !== 0) fail('input_rejected');
    admitted();
    return selected;
  });
  const snapshotState = FREEZE(function snapshotState() {
    if (arguments.length !== 0) fail('input_rejected');
    return FREEZE({ phase, uncertain, activeRead: reading, checkpointReads: reads, creationAttempts, created,
      authority: 'NONE', signerCalls: 0, transportCalls: 0, actualV6Persistence: 'NOT_ESTABLISHED' });
  });
  const close = FREEZE(function close() {
    if (arguments.length !== 0) fail('input_rejected');
    phase = 'CLOSED'; readCheckpoint = null; originalHeader = null;
    challengeHeader = null; selected = null; admittedPins = null;
    return FREEZE({ phase: 'CLOSED', uncertain, storeClosed: false, authority: 'NONE' });
  });
  return FREEZE({ captureChallenge, localClient: FREEZE({ createPaymentPayload }),
    selectOriginalPaymentHeader, selection, snapshot: snapshotState, close });
}

function payloadData(value) {
  validatePaymentPayloadEnvelope(value); // Only absent/empty extensions are allowed.
  return CANONICAL({ x402Version: value.x402Version, resource: value.resource,
    accepted: value.accepted, payload: value.payload });
}

function record(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value) !== OBJECT || KEYS(value).length !== fields.length) fail('input_rejected');
  const out = {};
  for (const field of fields) {
    const d = DESC(value, field);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail('input_rejected');
    Object.defineProperty(out, field, { value: d.value, enumerable: true });
  }
  return out;
}
function snapshot(value, depth = 0, budget = { nodes: 4096, bytes: 131072 }) {
  if (depth > 16 || --budget.nodes < 0) fail('input_rejected');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if ((budget.bytes -= BYTES(value)) < 0) fail('input_rejected');
    return value;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return value;
  if (value === null || typeof value !== 'object' || IS_PROXY(value)) fail('input_rejected');
  const keys = KEYS(value), array = Array.isArray(value);
  if (PROTO(value) !== (array ? ARRAY : OBJECT) || keys.length > 1025) fail('input_rejected');
  const out = array ? [] : {};
  if (array) {
    const length = DESC(value, 'length');
    if (!length || !OWN(length, 'value') || !Number.isSafeInteger(length.value)
        || length.value < 0 || length.value > 1024 || keys.length !== length.value + 1) fail('input_rejected');
    for (let i = 0; i < length.value; i++) {
      const d = DESC(value, String(i));
      if (!d || !OWN(d, 'value') || !d.enumerable) fail('input_rejected');
      out.push(snapshot(d.value, depth + 1, budget));
    }
  } else {
    for (const key of keys) {
      const d = DESC(value, key);
      if (typeof key !== 'string' || key === 'then' || key === 'toJSON' || key.length > 128
          || !d || !OWN(d, 'value') || !d.enumerable) fail('input_rejected');
      Object.defineProperty(out, key, { value: snapshot(d.value, depth + 1, budget), enumerable: true });
    }
  }
  return out;
}
function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const key of KEYS(value)) deepFreeze(value[key]);
    FREEZE(value);
  }
  return value;
}
function invariant() {
  return DESC(OBJECT, 'then') === undefined && DESC(OBJECT, 'toJSON') === undefined
    && DESC(ARRAY, 'toJSON') === undefined;
}
function fail(kind) {
  const code = 'x402_original_payment_checkpoint_client_' + kind, error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code, enumerable: false });
  throw FREEZE(error);
}

