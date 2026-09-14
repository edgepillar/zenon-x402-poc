import {
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify,
} from 'node:crypto';
import { types as utilTypes } from 'node:util';

import {
  deriveServiceCreditCapabilityCommitment,
} from './service-credit-capability.js';

export const SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION = 1;
export const SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_MAX_CHALLENGE_LIFETIME_MS =
  60_000;

const NATIVE_BUFFER = Buffer;
const ARRAY_SORT = Array.prototype.sort;
const BUFFER_BYTE_LENGTH = NATIVE_BUFFER.byteLength;
const BUFFER_CONCAT = NATIVE_BUFFER.concat;
const BUFFER_FROM = NATIVE_BUFFER.from;
const BUFFER_IS_BUFFER = NATIVE_BUFFER.isBuffer;
const BUFFER_TO_STRING = NATIVE_BUFFER.prototype.toString;
const NATIVE_JSON = JSON;
const JSON_STRINGIFY = NATIVE_JSON.stringify;
const NATIVE_NUMBER = Number;
const NUMBER_IS_SAFE_INTEGER = NATIVE_NUMBER.isSafeInteger;
const NUMBER_MAX_SAFE_INTEGER = NATIVE_NUMBER.MAX_SAFE_INTEGER;
const NATIVE_OBJECT = Object;
const OBJECT_CREATE = NATIVE_OBJECT.create;
const OBJECT_DEFINE_PROPERTY = NATIVE_OBJECT.defineProperty;
const OBJECT_FREEZE = NATIVE_OBJECT.freeze;
const OBJECT_HAS_OWN = NATIVE_OBJECT.hasOwn;
const OBJECT_PROTOTYPE = NATIVE_OBJECT.prototype;
const NATIVE_REFLECT = Reflect;
const REFLECT_APPLY = NATIVE_REFLECT.apply;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = NATIVE_REFLECT.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = NATIVE_REFLECT.getPrototypeOf;
const REFLECT_OWN_KEYS = NATIVE_REFLECT.ownKeys;
const NATIVE_REGEXP = RegExp;
const REGEXP_EXEC = NATIVE_REGEXP.prototype.exec;
const STRING_INCLUDES = String.prototype.includes;
const NATIVE_URL = URL;
const IS_PROXY = utilTypes.isProxy;

const CREATE_PUBLIC_KEY = createPublicKey;
const DERIVE_CAPABILITY_COMMITMENT = deriveServiceCreditCapabilityCommitment;
const RANDOM_BYTES = randomBytes;
const TIMING_SAFE_EQUAL = timingSafeEqual;
const VERIFY = verify;

const CONFIGURATION_KEYS = OBJECT_FREEZE([
  'origin',
  'selection',
  'challengeLifetimeMs',
  'now',
  'getActiveGrantDescriptorForSelection',
]);
const SELECTION_KEYS = OBJECT_FREEZE([
  'offerId',
  'offerVersion',
  'holderId',
  'capabilityCommitment',
]);
const PUBLIC_CHALLENGE_KEYS = OBJECT_FREEZE([
  'handoffVersion',
  'challenge',
  'expiresAtMs',
]);
const SIGNING_MESSAGE_KEYS = OBJECT_FREEZE([
  'handoffVersion',
  'origin',
  'selection',
  'challenge',
  'expiresAtMs',
]);
const REDEMPTION_KEYS = OBJECT_FREEZE(['challenge', 'publicKey', 'signature']);
const DESCRIPTOR_KEYS = OBJECT_FREEZE(['grantId', 'capabilityCommitment']);

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const COMMITMENT = /^sha256:[0-9a-f]{64}$/;
const RAW_PUBLIC_KEY = /^[A-Za-z0-9_-]{43}$/;
const RAW_SIGNATURE = /^[A-Za-z0-9_-]{86}$/;
const RAW_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const MAX_ORIGIN_BYTES = 2_048;
const CHALLENGE_BYTES = 32;
const PUBLIC_KEY_BYTES = 32;
const SIGNATURE_BYTES = 64;
const ED25519_SPKI_PREFIX = BUFFER_FROM('302a300506032b6570032100', 'hex');
const SIGNATURE_DOMAIN = BUFFER_FROM(
  'zenon-x402-service-credit-external-holder-grant-descriptor-handoff-v1\0',
  'ascii',
);

const CODE = OBJECT_FREEZE({
  invalidConfiguration:
    'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_INVALID_CONFIGURATION',
  invalidInput: 'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_INVALID_INPUT',
  unavailable: 'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_UNAVAILABLE',
});

export class ServiceCreditExternalHolderGrantDescriptorHandoffError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ServiceCreditExternalHolderGrantDescriptorHandoffError';
    this.code = code;
    OBJECT_DEFINE_PROPERTY(this, 'stack', {
      configurable: false,
      enumerable: false,
      value: `ServiceCreditExternalHolderGrantDescriptorHandoffError: ${code}`,
      writable: false,
    });
  }
}

function failure(code) {
  return OBJECT_FREEZE(new ServiceCreditExternalHolderGrantDescriptorHandoffError(code));
}

function fail(code) {
  throw failure(code);
}

function allowedKey(expectedKeys, candidate) {
  for (let index = 0; index < expectedKeys.length; index += 1) {
    if (expectedKeys[index] === candidate) return true;
  }
  return false;
}

function exactDataObject(value, expectedKeys) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [value]) !== OBJECT_PROTOTYPE
    ) return null;
    const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, NATIVE_REFLECT, [value]);
    if (keys.length !== expectedKeys.length) return null;
    const captured = REFLECT_APPLY(OBJECT_CREATE, NATIVE_OBJECT, [null]);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== 'string' || !allowedKey(expectedKeys, key)) return null;
      const descriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [value, key],
      );
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) return null;
      captured[key] = descriptor.value;
    }
    return captured;
  } catch {
    return null;
  }
}

function regexpMatches(expression, value) {
  return REFLECT_APPLY(REGEXP_EXEC, expression, [value]) !== null;
}

function safeCallable(value) {
  try {
    return typeof value === 'function' && !REFLECT_APPLY(IS_PROXY, undefined, [value]);
  } catch {
    return false;
  }
}

function validIdentifier(value) {
  return typeof value === 'string'
    && regexpMatches(IDENTIFIER, value)
    && !REFLECT_APPLY(STRING_INCLUDES, value, ['://']);
}

function captureSelection(value) {
  const selected = exactDataObject(value, SELECTION_KEYS);
  if (
    selected === null
    || !validIdentifier(selected.offerId)
    || !NUMBER_IS_SAFE_INTEGER(selected.offerVersion)
    || selected.offerVersion <= 0
    || !validIdentifier(selected.holderId)
    || typeof selected.capabilityCommitment !== 'string'
    || !regexpMatches(COMMITMENT, selected.capabilityCommitment)
  ) return null;
  return OBJECT_FREEZE({
    offerId: selected.offerId,
    offerVersion: selected.offerVersion,
    holderId: selected.holderId,
    capabilityCommitment: selected.capabilityCommitment,
  });
}

function captureCanonicalHttpsOrigin(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_ORIGIN_BYTES
    || REFLECT_APPLY(BUFFER_BYTE_LENGTH, NATIVE_BUFFER, [value, 'utf8']) > MAX_ORIGIN_BYTES
  ) return null;
  try {
    const parsed = new NATIVE_URL(value);
    if (
      parsed.protocol !== 'https:'
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.hostname === ''
      || parsed.pathname !== '/'
      || parsed.search !== ''
      || parsed.hash !== ''
      || parsed.origin !== value
    ) return null;
    return value;
  } catch {
    return null;
  }
}

function decodeCanonicalBase64url(value, expression, expectedBytes) {
  if (typeof value !== 'string' || !regexpMatches(expression, value)) return null;
  try {
    const decoded = REFLECT_APPLY(BUFFER_FROM, NATIVE_BUFFER, [value, 'base64url']);
    return decoded.length === expectedBytes
      && REFLECT_APPLY(BUFFER_TO_STRING, decoded, ['base64url']) === value
      ? decoded
      : null;
  } catch {
    return null;
  }
}

function capturePublicChallenge(value) {
  const captured = exactDataObject(value, PUBLIC_CHALLENGE_KEYS);
  if (
    captured === null
    || captured.handoffVersion
      !== SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION
    || decodeCanonicalBase64url(captured.challenge, RAW_CHALLENGE, CHALLENGE_BYTES) === null
    || !NUMBER_IS_SAFE_INTEGER(captured.expiresAtMs)
    || captured.expiresAtMs < 1
  ) return null;
  return OBJECT_FREEZE({
    handoffVersion: SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION,
    challenge: captured.challenge,
    expiresAtMs: captured.expiresAtMs,
  });
}

function bindPublicChallenge(publicChallenge, origin, selection) {
  return OBJECT_FREEZE({
    handoffVersion: publicChallenge.handoffVersion,
    origin,
    selection,
    challenge: publicChallenge.challenge,
    expiresAtMs: publicChallenge.expiresAtMs,
  });
}

function captureSigningMessage(value) {
  const captured = exactDataObject(value, SIGNING_MESSAGE_KEYS);
  if (captured === null) return null;
  const origin = captureCanonicalHttpsOrigin(captured.origin);
  const selection = captureSelection(captured.selection);
  if (
    captured.handoffVersion
      !== SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION
    || origin === null
    || selection === null
    || decodeCanonicalBase64url(captured.challenge, RAW_CHALLENGE, CHALLENGE_BYTES) === null
    || !NUMBER_IS_SAFE_INTEGER(captured.expiresAtMs)
    || captured.expiresAtMs < 1
  ) return null;
  return OBJECT_FREEZE({
    handoffVersion: SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION,
    origin,
    selection,
    challenge: captured.challenge,
    expiresAtMs: captured.expiresAtMs,
  });
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return REFLECT_APPLY(JSON_STRINGIFY, NATIVE_JSON, [value]);
  }
  const keys = REFLECT_APPLY(REFLECT_OWN_KEYS, NATIVE_REFLECT, [value]);
  REFLECT_APPLY(ARRAY_SORT, keys, []);
  let output = '{';
  for (let index = 0; index < keys.length; index += 1) {
    if (index !== 0) output += ',';
    const key = keys[index];
    output += `${REFLECT_APPLY(JSON_STRINGIFY, NATIVE_JSON, [key])}:${canonicalJson(value[key])}`;
  }
  return `${output}}`;
}

function signingBytes(challenge) {
  return REFLECT_APPLY(BUFFER_CONCAT, NATIVE_BUFFER, [[
    SIGNATURE_DOMAIN,
    REFLECT_APPLY(BUFFER_FROM, NATIVE_BUFFER, [canonicalJson(challenge), 'utf8']),
  ]]);
}

function samePublicChallenge(left, right) {
  return left.handoffVersion === right.handoffVersion
    && left.challenge === right.challenge
    && left.expiresAtMs === right.expiresAtMs;
}

function sameCommitment(left, right) {
  try {
    const leftBytes = REFLECT_APPLY(BUFFER_FROM, NATIVE_BUFFER, [left, 'ascii']);
    const rightBytes = REFLECT_APPLY(BUFFER_FROM, NATIVE_BUFFER, [right, 'ascii']);
    return leftBytes.length === rightBytes.length
      && REFLECT_APPLY(TIMING_SAFE_EQUAL, undefined, [leftBytes, rightBytes]);
  } catch {
    return false;
  }
}

/**
 * Returns detached domain-separated bytes for the exact fixed-origin and
 * selection-bound challenge message. The holder must combine its known payment
 * context with the minimal public challenge before calling this helper. A holder
 * process may sign the result with its own Ed25519 capability key. No secret-key
 * input or signing operation is accepted here.
 */
export function createServiceCreditExternalHolderGrantDescriptorSigningBytes(input) {
  try {
    if (arguments.length !== 1) fail(CODE.invalidInput);
    const message = captureSigningMessage(input);
    if (message === null) fail(CODE.invalidInput);
    return signingBytes(message);
  } catch {
    throw failure(CODE.invalidInput);
  }
}

/**
 * Creates an explicit opt-in, in-memory grant-descriptor handoff. The module is
 * not wired to any public route, package export, or listener. It neither starts
 * nor activates the privileged owner. This pure listenerless protocol alone
 * does not provide authenticated HTTPS ingress or evidence of live activation.
 * A future unauthenticated public challenge route still needs rate limits and
 * TLS. The supplied getActiveGrantDescriptorForSelection callback is a
 * selection-aware trusted privileged owner dependency, not independent proof
 * of committed-store state. It must compare the complete selection with the
 * owner-validated committed ACTIVE grant binding before returning a descriptor.
 */
export function createServiceCreditExternalHolderGrantDescriptorHandoff(options) {
  if (arguments.length !== 1) fail(CODE.invalidConfiguration);
  const configuration = exactDataObject(options, CONFIGURATION_KEYS);
  if (configuration === null) fail(CODE.invalidConfiguration);
  const origin = captureCanonicalHttpsOrigin(configuration.origin);
  const selection = captureSelection(configuration.selection);
  if (
    origin === null
    || selection === null
    || !NUMBER_IS_SAFE_INTEGER(configuration.challengeLifetimeMs)
    || configuration.challengeLifetimeMs < 1
    || configuration.challengeLifetimeMs
      > SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_MAX_CHALLENGE_LIFETIME_MS
    || !safeCallable(configuration.now)
    || !safeCallable(configuration.getActiveGrantDescriptorForSelection)
  ) fail(CODE.invalidConfiguration);

  const challengeLifetimeMs = configuration.challengeLifetimeMs;
  const now = configuration.now;
  const getActiveGrantDescriptorForSelection =
    configuration.getActiveGrantDescriptorForSelection;
  let closed = false;
  let operationActive = false;
  let pending = null;

  function unavailable() {
    fail(CODE.unavailable);
  }

  function readNow() {
    const value = REFLECT_APPLY(now, undefined, []);
    if (!NUMBER_IS_SAFE_INTEGER(value) || value < 0) unavailable();
    return value;
  }

  function live(record, currentTime) {
    return currentTime >= record.issuedAtMs && currentTime < record.expiresAtMs;
  }

  const issueChallenge = OBJECT_FREEZE(function issueChallenge(...args) {
    if (args.length !== 0 || closed || operationActive) unavailable();
    operationActive = true;
    try {
      const issuedAtMs = readNow();
      if (closed) unavailable();
      if (pending !== null) {
        if (live(pending, issuedAtMs)) unavailable();
        pending = null;
      }
      if (issuedAtMs > NUMBER_MAX_SAFE_INTEGER - challengeLifetimeMs) unavailable();
      const random = REFLECT_APPLY(RANDOM_BYTES, undefined, [CHALLENGE_BYTES]);
      if (!REFLECT_APPLY(BUFFER_IS_BUFFER, NATIVE_BUFFER, [random]) || random.length !== CHALLENGE_BYTES) {
        unavailable();
      }
      const encoded = REFLECT_APPLY(BUFFER_TO_STRING, random, ['base64url']);
      if (
        closed
        || decodeCanonicalBase64url(encoded, RAW_CHALLENGE, CHALLENGE_BYTES) === null
      ) unavailable();
      const expiresAtMs = issuedAtMs + challengeLifetimeMs;
      const descriptor = OBJECT_FREEZE({
        handoffVersion: SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION,
        challenge: encoded,
        expiresAtMs,
      });
      pending = OBJECT_FREEZE({
        descriptor,
        issuedAtMs,
        expiresAtMs,
      });
      return descriptor;
    } catch {
      throw failure(CODE.unavailable);
    } finally {
      operationActive = false;
    }
  });

  const redeem = OBJECT_FREEZE(function redeem(input, ...extra) {
    if (closed || operationActive || pending === null) unavailable();
    const expected = pending;
    pending = null;
    operationActive = true;
    try {
      if (extra.length !== 0) unavailable();
      const redemption = exactDataObject(input, REDEMPTION_KEYS);
      const submitted = redemption === null
        ? null
        : capturePublicChallenge(redemption.challenge);
      if (
        submitted === null
        || !samePublicChallenge(submitted, expected.descriptor)
      ) unavailable();
      const publicKey = decodeCanonicalBase64url(
        redemption.publicKey,
        RAW_PUBLIC_KEY,
        PUBLIC_KEY_BYTES,
      );
      const signature = decodeCanonicalBase64url(
        redemption.signature,
        RAW_SIGNATURE,
        SIGNATURE_BYTES,
      );
      if (publicKey === null || signature === null) unavailable();

      const currentTime = readNow();
      if (closed || !live(expected, currentTime)) unavailable();
      const derivedCommitment = REFLECT_APPLY(DERIVE_CAPABILITY_COMMITMENT, undefined, [{
        publicKey: redemption.publicKey,
      }]);
      if (!sameCommitment(derivedCommitment, selection.capabilityCommitment)) unavailable();
      const key = REFLECT_APPLY(CREATE_PUBLIC_KEY, undefined, [{
        key: REFLECT_APPLY(BUFFER_CONCAT, NATIVE_BUFFER, [[ED25519_SPKI_PREFIX, publicKey]]),
        format: 'der',
        type: 'spki',
      }]);
      if (!REFLECT_APPLY(VERIFY, undefined, [
        null,
        signingBytes(bindPublicChallenge(submitted, origin, selection)),
        key,
        signature,
      ])) unavailable();
      if (closed || !live(expected, readNow())) unavailable();

      const descriptor = exactDataObject(
        REFLECT_APPLY(getActiveGrantDescriptorForSelection, undefined, [selection]),
        DESCRIPTOR_KEYS,
      );
      if (
        closed
        || descriptor === null
        || !validIdentifier(descriptor.grantId)
        || typeof descriptor.capabilityCommitment !== 'string'
        || !regexpMatches(COMMITMENT, descriptor.capabilityCommitment)
        || !sameCommitment(descriptor.capabilityCommitment, selection.capabilityCommitment)
        || !live(expected, readNow())
      ) unavailable();
      return OBJECT_FREEZE({
        grantId: descriptor.grantId,
        capabilityCommitment: descriptor.capabilityCommitment,
      });
    } catch {
      throw failure(CODE.unavailable);
    } finally {
      operationActive = false;
    }
  });

  const close = OBJECT_FREEZE(function close(...args) {
    if (args.length !== 0) unavailable();
    closed = true;
    pending = null;
  });

  return OBJECT_FREEZE({ issueChallenge, redeem, close });
}
