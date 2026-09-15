import { TextDecoder as NodeTextDecoder, types as utilTypes } from 'node:util';

import {
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION,
  createServiceCreditExternalHolderGrantDescriptorHandoff,
} from './service-credit-external-holder-grant-descriptor-handoff.js';

export const SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_PAIRS =
  8;
export const SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES =
  8 * 1024;
export const SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_REDEMPTION_BYTES =
  1_024;

const NATIVE_ARRAY = Array;
const ARRAY_IS_ARRAY = NATIVE_ARRAY.isArray;
const ARRAY_PROTOTYPE = NATIVE_ARRAY.prototype;
const NATIVE_BUFFER = Buffer;
const BUFFER_ALLOC = NATIVE_BUFFER.alloc;
const BUFFER_BYTE_LENGTH = NATIVE_BUFFER.byteLength;
const BUFFER_COPY = NATIVE_BUFFER.prototype.copy;
const BUFFER_FILL = NATIVE_BUFFER.prototype.fill;
const BUFFER_FROM = NATIVE_BUFFER.from;
const BUFFER_IS_BUFFER = NATIVE_BUFFER.isBuffer;
const NATIVE_JSON = JSON;
const JSON_PARSE = NATIVE_JSON.parse;
const JSON_STRINGIFY = NATIVE_JSON.stringify;
const NATIVE_NUMBER = Number;
const NUMBER_IS_SAFE_INTEGER = NATIVE_NUMBER.isSafeInteger;
const NATIVE_OBJECT = Object;
const OBJECT_CREATE = NATIVE_OBJECT.create;
const OBJECT_DEFINE_PROPERTY = NATIVE_OBJECT.defineProperty;
const OBJECT_FREEZE = NATIVE_OBJECT.freeze;
const OBJECT_HAS_OWN = NATIVE_OBJECT.hasOwn;
const OBJECT_IS_FROZEN = NATIVE_OBJECT.isFrozen;
const OBJECT_PROTOTYPE = NATIVE_OBJECT.prototype;
const NATIVE_PROMISE = Promise;
const NATIVE_REFLECT = Reflect;
const REFLECT_APPLY = NATIVE_REFLECT.apply;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = NATIVE_REFLECT.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = NATIVE_REFLECT.getPrototypeOf;
const REFLECT_OWN_KEYS = NATIVE_REFLECT.ownKeys;
const NATIVE_REGEXP = RegExp;
const REGEXP_EXEC = NATIVE_REGEXP.prototype.exec;
const NATIVE_STRING = String;
const STRING_FROM = NATIVE_STRING;
const STRING_TO_LOWER_CASE = NATIVE_STRING.prototype.toLowerCase;
const ASYNC_ITERATOR = Symbol.asyncIterator;
const NATIVE_TYPE_ERROR = TypeError;
const TEXT_DECODER_DECODE = NodeTextDecoder.prototype.decode;
const IS_PROXY = utilTypes.isProxy;

const CONFIGURATION_KEYS = OBJECT_FREEZE([
  'origin',
  'selection',
  'challengeLifetimeMs',
  'now',
  'getActiveGrantDescriptorForSelection',
  'challengeRequestTarget',
  'redemptionRequestTarget',
  'admitRequest',
]);
const HANDOFF_KEYS = OBJECT_FREEZE(['issueChallenge', 'redeem', 'close']);
const CHALLENGE_KEYS = OBJECT_FREEZE(['handoffVersion', 'challenge', 'expiresAtMs']);
const REDEMPTION_KEYS = OBJECT_FREEZE(['challenge', 'publicKey', 'signature']);
const DESCRIPTOR_KEYS = OBJECT_FREEZE(['grantId', 'capabilityCommitment']);
const MAX_REQUEST_TARGET_BYTES = 2_048;
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const VISIBLE_ASCII = /^[\x20-\x7e]*$/;
const ORIGIN_FORM_PATH = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+(?:\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+)*$/;
const DOT_SEGMENT = /(?:^|\/)\.{1,2}(?:\/|$)/;
const CANONICAL_CONTENT_LENGTH = /^(?:0|[1-9][0-9]*)$/;
const RAW_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const RAW_PUBLIC_KEY = /^[A-Za-z0-9_-]{43}$/;
const RAW_SIGNATURE = /^[A-Za-z0-9_-]{86}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const COMMITMENT = /^sha256:[0-9a-f]{64}$/;
const FAILURE_TEXT = '{"error":"unavailable"}';
const JSON_CONTENT_TYPE = 'application/json';
const METHOD = 'POST';

const OPERATION = OBJECT_FREEZE({
  CHALLENGE: 'CHALLENGE',
  REDEMPTION: 'REDEMPTION',
});

const CODE = OBJECT_FREEZE({
  invalidConfiguration:
    'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_INVALID_CONFIGURATION',
  invalidInput: 'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_INVALID_INPUT',
  closeFailed: 'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_CLOSE_FAILED',
});

function failure(code) {
  const error = new NATIVE_TYPE_ERROR(code);
  OBJECT_DEFINE_PROPERTY(error, 'code', {
    value: code,
    enumerable: true,
    writable: false,
    configurable: false,
  });
  OBJECT_DEFINE_PROPERTY(error, 'stack', {
    value: `TypeError: ${code}`,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return OBJECT_FREEZE(error);
}

function nativePromiseCapability() {
  let resolve;
  let reject;
  const promise = new NATIVE_PROMISE((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return OBJECT_FREEZE({ promise, resolve, reject });
}

function nativeRejected(error) {
  const capability = nativePromiseCapability();
  capability.reject(error);
  return capability.promise;
}

function allowedKey(expectedKeys, candidate) {
  for (let index = 0; index < expectedKeys.length; index += 1) {
    if (expectedKeys[index] === candidate) return true;
  }
  return false;
}

function exactDataObject(value, expectedKeys, requireFrozen = false) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [value])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [value]) !== OBJECT_PROTOTYPE
      || (requireFrozen && !REFLECT_APPLY(OBJECT_IS_FROZEN, NATIVE_OBJECT, [value]))
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

function ownDataValue(value, key) {
  try {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return undefined;
    }
    const descriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [value, key],
    );
    return descriptor?.enumerable === true && OBJECT_HAS_OWN(descriptor, 'value')
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function regexpMatches(expression, value) {
  return REFLECT_APPLY(REGEXP_EXEC, expression, [value]) !== null;
}

function byteLength(value) {
  return REFLECT_APPLY(BUFFER_BYTE_LENGTH, NATIVE_BUFFER, [value, 'utf8']);
}

function safeCallable(value) {
  try {
    return typeof value === 'function' && !REFLECT_APPLY(IS_PROXY, undefined, [value]);
  } catch {
    return false;
  }
}

function captureRequestTarget(value) {
  try {
    if (
      typeof value !== 'string'
      || value.length < 2
      || value.length > MAX_REQUEST_TARGET_BYTES
      || byteLength(value) > MAX_REQUEST_TARGET_BYTES
      || !regexpMatches(ORIGIN_FORM_PATH, value)
      || regexpMatches(DOT_SEGMENT, value)
    ) return null;
    return value;
  } catch {
    return null;
  }
}

function captureHandoff(value) {
  const handoff = exactDataObject(value, HANDOFF_KEYS, true);
  if (handoff === null) return null;
  for (let index = 0; index < HANDOFF_KEYS.length; index += 1) {
    if (!safeCallable(handoff[HANDOFF_KEYS[index]])) return null;
  }
  return handoff;
}

function headerScan(request, operation) {
  try {
    const rawHeaders = ownDataValue(request, 'rawHeaders');
    if (
      !REFLECT_APPLY(ARRAY_IS_ARRAY, NATIVE_ARRAY, [rawHeaders])
      || REFLECT_APPLY(IS_PROXY, undefined, [rawHeaders])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, NATIVE_REFLECT, [rawHeaders])
        !== ARRAY_PROTOTYPE
    ) return null;
    const lengthDescriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_REFLECT,
      [rawHeaders, 'length'],
    );
    if (
      lengthDescriptor === undefined
      || !OBJECT_HAS_OWN(lengthDescriptor, 'value')
      || !NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.value % 2 !== 0
      || lengthDescriptor.value
        > SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_PAIRS * 2
    ) return null;

    let totalBytes = 0;
    let declaredBodyBytes = null;
    let contentLengthCount = 0;
    let contentTypeCount = 0;
    let connectionCount = 0;
    for (let index = 0; index < lengthDescriptor.value; index += 2) {
      const nameDescriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [rawHeaders, STRING_FROM(index)],
      );
      const valueDescriptor = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_REFLECT,
        [rawHeaders, STRING_FROM(index + 1)],
      );
      if (
        nameDescriptor === undefined
        || valueDescriptor === undefined
        || !nameDescriptor.enumerable
        || !valueDescriptor.enumerable
        || !OBJECT_HAS_OWN(nameDescriptor, 'value')
        || !OBJECT_HAS_OWN(valueDescriptor, 'value')
      ) return null;
      const name = nameDescriptor.value;
      const value = valueDescriptor.value;
      if (
        typeof name !== 'string'
        || typeof value !== 'string'
        || name.length === 0
        || name.length > SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES
        || value.length > SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES
        || !regexpMatches(TOKEN, name)
        || !regexpMatches(VISIBLE_ASCII, value)
      ) return null;
      totalBytes += byteLength(name) + byteLength(value) + 4;
      if (
        totalBytes
          > SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES
      ) return null;

      const lowerName = REFLECT_APPLY(STRING_TO_LOWER_CASE, name, []);
      if (
        lowerName === 'transfer-encoding'
        || lowerName === 'trailer'
        || lowerName === 'expect'
        || lowerName === 'upgrade'
        || lowerName === 'content-encoding'
        || lowerName === 'content-transfer-encoding'
        || lowerName === 'te'
        || lowerName === 'proxy-connection'
        || lowerName === 'keep-alive'
      ) return null;
      if (lowerName === 'connection') {
        connectionCount += 1;
        if (connectionCount !== 1 || name !== 'Connection' || value !== 'close') return null;
      }
      if (lowerName === 'content-length') {
        contentLengthCount += 1;
        if (
          contentLengthCount !== 1
          || name !== 'Content-Length'
          || !regexpMatches(CANONICAL_CONTENT_LENGTH, value)
        ) return null;
        const parsed = NATIVE_NUMBER(value);
        if (!NUMBER_IS_SAFE_INTEGER(parsed) || parsed < 0) return null;
        declaredBodyBytes = parsed;
      }
      if (lowerName === 'content-type') {
        contentTypeCount += 1;
        if (
          contentTypeCount !== 1
          || name !== 'Content-Type'
          || value !== JSON_CONTENT_TYPE
        ) return null;
      }
    }
    if (contentLengthCount !== 1 || declaredBodyBytes === null) return null;
    if (operation === OPERATION.CHALLENGE) {
      return declaredBodyBytes === 0 && contentTypeCount === 0
        ? OBJECT_FREEZE({ declaredBodyBytes })
        : null;
    }
    return declaredBodyBytes >= 1
      && declaredBodyBytes
        <= SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_REDEMPTION_BYTES
      && contentTypeCount === 1
      ? OBJECT_FREEZE({ declaredBodyBytes })
      : null;
  } catch {
    return null;
  }
}

function clearBuffer(value) {
  try {
    if (REFLECT_APPLY(BUFFER_IS_BUFFER, NATIVE_BUFFER, [value])) {
      REFLECT_APPLY(BUFFER_FILL, value, [0]);
    }
  } catch {}
}

async function materializeBody(request, declaredBodyBytes) {
  let body = null;
  try {
    body = REFLECT_APPLY(BUFFER_ALLOC, NATIVE_BUFFER, [declaredBodyBytes]);
    const iteratorMethod = request?.[ASYNC_ITERATOR];
    if (!safeCallable(iteratorMethod)) throw failure(CODE.invalidInput);
    const iterator = REFLECT_APPLY(iteratorMethod, request, []);
    if (
      iterator === null
      || typeof iterator !== 'object'
      || REFLECT_APPLY(IS_PROXY, undefined, [iterator])
    ) throw failure(CODE.invalidInput);
    const next = iterator.next;
    if (!safeCallable(next)) throw failure(CODE.invalidInput);
    let received = 0;
    for (;;) {
      const step = await REFLECT_APPLY(next, iterator, []);
      const done = ownDataValue(step, 'done');
      if (done === true) break;
      if (done !== false) throw failure(CODE.invalidInput);
      const chunk = ownDataValue(step, 'value');
      if (
        !REFLECT_APPLY(BUFFER_IS_BUFFER, NATIVE_BUFFER, [chunk])
        || REFLECT_APPLY(IS_PROXY, undefined, [chunk])
      ) throw failure(CODE.invalidInput);
      const chunkBytes = chunk.length;
      if (
        !NUMBER_IS_SAFE_INTEGER(chunkBytes)
        || chunkBytes < 0
        || chunkBytes > declaredBodyBytes - received
      ) throw failure(CODE.invalidInput);
      REFLECT_APPLY(BUFFER_COPY, chunk, [body, received, 0, chunkBytes]);
      received += chunkBytes;
    }
    if (
      received !== declaredBodyBytes
      || ownDataValue(request, 'complete') !== true
      || ownDataValue(request, 'aborted') !== false
    ) throw failure(CODE.invalidInput);
    return body;
  } catch {
    clearBuffer(body);
    return null;
  }
}

function parseRedemption(body) {
  try {
    const text = REFLECT_APPLY(TEXT_DECODER_DECODE, new NodeTextDecoder(
      'utf-8',
      { fatal: true, ignoreBOM: true },
    ), [body]);
    const parsed = REFLECT_APPLY(JSON_PARSE, NATIVE_JSON, [text]);
    const redemption = exactDataObject(parsed, REDEMPTION_KEYS);
    if (redemption === null) return null;
    const challenge = exactDataObject(redemption.challenge, CHALLENGE_KEYS);
    if (
      challenge === null
      || challenge.handoffVersion
        !== SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION
      || typeof challenge.challenge !== 'string'
      || !regexpMatches(RAW_CHALLENGE, challenge.challenge)
      || !NUMBER_IS_SAFE_INTEGER(challenge.expiresAtMs)
      || challenge.expiresAtMs < 1
      || typeof redemption.publicKey !== 'string'
      || !regexpMatches(RAW_PUBLIC_KEY, redemption.publicKey)
      || typeof redemption.signature !== 'string'
      || !regexpMatches(RAW_SIGNATURE, redemption.signature)
    ) return null;
    const capturedChallenge = OBJECT_FREEZE({
      handoffVersion: SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION,
      challenge: challenge.challenge,
      expiresAtMs: challenge.expiresAtMs,
    });
    const captured = OBJECT_FREEZE({
      challenge: capturedChallenge,
      publicKey: redemption.publicKey,
      signature: redemption.signature,
    });
    const canonical = `{"challenge":{"challenge":${REFLECT_APPLY(
      JSON_STRINGIFY,
      NATIVE_JSON,
      [capturedChallenge.challenge],
    )},"expiresAtMs":${capturedChallenge.expiresAtMs},"handoffVersion":${
      SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION
    }},"publicKey":${REFLECT_APPLY(
      JSON_STRINGIFY,
      NATIVE_JSON,
      [captured.publicKey],
    )},"signature":${REFLECT_APPLY(JSON_STRINGIFY, NATIVE_JSON, [captured.signature])}}`;
    return canonical === text ? captured : null;
  } catch {
    return null;
  }
}

function challengeResponse(value) {
  const challenge = exactDataObject(value, CHALLENGE_KEYS, true);
  if (
    challenge === null
    || challenge.handoffVersion
      !== SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION
    || typeof challenge.challenge !== 'string'
    || !regexpMatches(RAW_CHALLENGE, challenge.challenge)
    || !NUMBER_IS_SAFE_INTEGER(challenge.expiresAtMs)
    || challenge.expiresAtMs < 1
  ) return null;
  return `{"challenge":${REFLECT_APPLY(
    JSON_STRINGIFY,
    NATIVE_JSON,
    [challenge.challenge],
  )},"expiresAtMs":${challenge.expiresAtMs},"handoffVersion":${
    SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION
  }}`;
}

function descriptorResponse(value) {
  const descriptor = exactDataObject(value, DESCRIPTOR_KEYS, true);
  if (
    descriptor === null
    || typeof descriptor.grantId !== 'string'
    || !regexpMatches(IDENTIFIER, descriptor.grantId)
    || typeof descriptor.capabilityCommitment !== 'string'
    || !regexpMatches(COMMITMENT, descriptor.capabilityCommitment)
  ) return null;
  return `{"capabilityCommitment":${REFLECT_APPLY(
    JSON_STRINGIFY,
    NATIVE_JSON,
    [descriptor.capabilityCommitment],
  )},"grantId":${REFLECT_APPLY(JSON_STRINGIFY, NATIVE_JSON, [descriptor.grantId])}}`;
}

function sendJson(response, statusCode, text) {
  const body = REFLECT_APPLY(BUFFER_FROM, NATIVE_BUFFER, [text, 'utf8']);
  try {
    if (
      body.length
        > SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_REDEMPTION_BYTES
    ) return;
    response.statusCode = statusCode;
    response.setHeader('Content-Type', JSON_CONTENT_TYPE);
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Length', STRING_FROM(body.length));
    response.setHeader('Connection', 'close');
    response.end(body);
  } catch {}
}

function sendUnavailable(response) {
  sendJson(response, 503, FAILURE_TEXT);
}

/**
 * Creates an explicit opt-in HTTP/1.1 request adapter for one fixed origin,
 * holder selection, and pair of request targets. It owns only the in-memory
 * handoff protocol. The caller retains transport, parser, connection, TLS,
 * deadline, and peer-aware admission ownership.
 */
export function createServiceCreditExternalHolderGrantDescriptorHandoffHttpAdapter(options) {
  if (arguments.length !== 1) throw failure(CODE.invalidConfiguration);
  const configuration = exactDataObject(options, CONFIGURATION_KEYS);
  if (configuration === null) throw failure(CODE.invalidConfiguration);
  const challengeRequestTarget = captureRequestTarget(configuration.challengeRequestTarget);
  const redemptionRequestTarget = captureRequestTarget(configuration.redemptionRequestTarget);
  if (
    challengeRequestTarget === null
    || redemptionRequestTarget === null
    || challengeRequestTarget === redemptionRequestTarget
    || !safeCallable(configuration.admitRequest)
  ) throw failure(CODE.invalidConfiguration);

  let handoff;
  try {
    handoff = captureHandoff(createServiceCreditExternalHolderGrantDescriptorHandoff({
      origin: configuration.origin,
      selection: configuration.selection,
      challengeLifetimeMs: configuration.challengeLifetimeMs,
      now: configuration.now,
      getActiveGrantDescriptorForSelection:
        configuration.getActiveGrantDescriptorForSelection,
    }));
  } catch {
    handoff = null;
  }
  if (handoff === null) throw failure(CODE.invalidConfiguration);
  const issueChallenge = handoff.issueChallenge;
  const redeem = handoff.redeem;
  const closeHandoff = handoff.close;
  const admitRequest = configuration.admitRequest;

  let closed = false;
  let active = false;
  let closeCapability = null;
  let closePromise = null;
  let closeFailed = false;

  function finishClose() {
    if (active || closeCapability === null) return;
    const capability = closeCapability;
    closeCapability = null;
    if (closeFailed) capability.reject(failure(CODE.closeFailed));
    else capability.resolve(undefined);
  }

  const handle = OBJECT_FREEZE(async function serviceCreditExternalHolderHandoffHttpHandle(
    request,
    response,
    ...extra
  ) {
    if (extra.length !== 0 || closed) {
      sendUnavailable(response);
      return;
    }

    let operation = null;
    let framing = null;
    try {
      const method = ownDataValue(request, 'method');
      const requestTarget = ownDataValue(request, 'url');
      if (requestTarget === challengeRequestTarget) operation = OPERATION.CHALLENGE;
      else if (requestTarget === redemptionRequestTarget) operation = OPERATION.REDEMPTION;
      if (method === METHOD && operation !== null) framing = headerScan(request, operation);
    } catch {
      framing = null;
    }
    if (operation === null || framing === null || active || closed) {
      sendUnavailable(response);
      return;
    }

    active = true;
    let body = null;
    let responseText = null;
    try {
      const admission = OBJECT_FREEZE({
        operation,
        declaredBodyBytes: framing.declaredBodyBytes,
      });
      const admitted = REFLECT_APPLY(admitRequest, undefined, [admission]);
      if (admitted !== true || closed) throw failure(CODE.invalidInput);
      body = await materializeBody(request, framing.declaredBodyBytes);
      if (body === null || closed) throw failure(CODE.invalidInput);
      if (operation === OPERATION.CHALLENGE) {
        responseText = challengeResponse(REFLECT_APPLY(issueChallenge, undefined, []));
      } else {
        const redemption = parseRedemption(body);
        if (redemption === null) throw failure(CODE.invalidInput);
        responseText = descriptorResponse(REFLECT_APPLY(redeem, undefined, [redemption]));
      }
      if (responseText === null || closed) throw failure(CODE.invalidInput);
    } catch {
      responseText = null;
    }
    clearBuffer(body);
    if (responseText === null) sendUnavailable(response);
    else sendJson(response, 200, responseText);
    active = false;
    finishClose();
  });

  const close = OBJECT_FREEZE((...args) => {
    if (args.length !== 0) return nativeRejected(failure(CODE.invalidInput));
    if (closePromise !== null) return closePromise;
    closeCapability = nativePromiseCapability();
    closePromise = closeCapability.promise;
    closed = true;
    try {
      REFLECT_APPLY(closeHandoff, undefined, []);
    } catch {
      closeFailed = true;
    }
    finishClose();
    return closePromise;
  });

  return OBJECT_FREEZE({ handle, close });
}
