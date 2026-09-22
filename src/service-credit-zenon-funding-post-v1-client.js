import { types as utilTypes } from 'node:util';

import { preflightZenonPayment } from './zenon-payment.js';
import {
  decodeB64Json,
  encodeB64Json,
  EXPERIMENTAL_LIVE_NETWORK,
  MAX_X402_HEADER_ENCODED_BYTES,
  sameRequirements,
  sameResource,
  validateActiveUpfrontRequirement,
  validatePaymentPayloadEnvelope,
  validatePaymentRequired,
} from './x402-wire.js';

const NATIVE_ABORT_CONTROLLER = AbortController;
const NATIVE_ARRAY = Array;
const ARRAY_IS_ARRAY = NATIVE_ARRAY.isArray;
const NATIVE_BUFFER = Buffer;
const BUFFER_BYTE_LENGTH = NATIVE_BUFFER.byteLength;
const NATIVE_JSON = JSON;
const JSON_STRINGIFY = NATIVE_JSON.stringify;
const NATIVE_OBJECT = Object;
const OBJECT_CREATE = NATIVE_OBJECT.create;
const OBJECT_DEFINE_PROPERTY = NATIVE_OBJECT.defineProperty;
const OBJECT_FREEZE = NATIVE_OBJECT.freeze;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = NATIVE_OBJECT.getOwnPropertyDescriptor;
const OBJECT_GET_PROTOTYPE_OF = NATIVE_OBJECT.getPrototypeOf;
const OBJECT_HAS_OWN = NATIVE_OBJECT.hasOwn;
const OBJECT_PROTOTYPE = NATIVE_OBJECT.prototype;
const NATIVE_PROMISE = Promise;
const PROMISE_PROTOTYPE = NATIVE_PROMISE.prototype;
const PROMISE_THEN = PROMISE_PROTOTYPE.then;
const NATIVE_REFLECT = Reflect;
const REFLECT_APPLY = NATIVE_REFLECT.apply;
const REFLECT_OWN_KEYS = NATIVE_REFLECT.ownKeys;
const NATIVE_URL = URL;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const DEFAULT_FETCH = globalThis.fetch;
const NATIVE_SET_TIMEOUT = setTimeout;
const NATIVE_CLEAR_TIMEOUT = clearTimeout;
const INTERNAL_FAILURES = new WeakSet();

const CONFIGURATION_REQUIRED_KEYS = OBJECT_FREEZE(['resourceUrl', 'deadlineMs']);
const CONFIGURATION_KEYS = OBJECT_FREEZE([...CONFIGURATION_REQUIRED_KEYS, 'fetchImpl']);
const SUBMISSION_KEYS = OBJECT_FREEZE(['challenge', 'paymentSignatureHeader']);
const CHALLENGE_KEYS = OBJECT_FREEZE([
  'status',
  'resourceUrl',
  'paymentRequiredHeader',
  'paymentRequired',
]);
const MAX_RESOURCE_URL_BYTES = 4096;
const MAX_RESPONSE_HEADER_BYTES = 16 * 1024;
const MAX_RESPONSE_HEADER_PAIRS = 64;
const MAX_RESPONSE_BODY_BYTES = 64;
const MAX_DEADLINE_MS = 60_000;
const REQUEST_TARGET = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+(?:\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+)*$/;
const DOT_SEGMENT = /(?:^|\/)\.{1,2}(?:\/|$)/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

export const ZENON_FUNDING_POST_V1_CLIENT_CODES = OBJECT_FREEZE({
  invalidConfiguration: 'ZENON_FUNDING_POST_V1_CLIENT_INVALID_CONFIGURATION',
  invalidInput: 'ZENON_FUNDING_POST_V1_CLIENT_INVALID_INPUT',
  operationInFlight: 'ZENON_FUNDING_POST_V1_CLIENT_OPERATION_IN_FLIGHT',
  challengeUnavailable: 'ZENON_FUNDING_POST_V1_CLIENT_CHALLENGE_UNAVAILABLE',
  paymentRejected: 'ZENON_FUNDING_POST_V1_CLIENT_PAYMENT_REJECTED',
  paymentConflict: 'ZENON_FUNDING_POST_V1_CLIENT_PAYMENT_CONFLICT',
  outcomeUnknown: 'ZENON_FUNDING_POST_V1_CLIENT_OUTCOME_UNKNOWN',
});

export class ZenonFundingPostV1ClientError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ZenonFundingPostV1ClientError';
    this.code = code;
    this.stack = `ZenonFundingPostV1ClientError: ${code}`;
  }
}

function fail(code) {
  const error = new ZenonFundingPostV1ClientError(code);
  INTERNAL_FAILURES.add(error);
  throw error;
}

function immutableDescriptor(value) {
  const descriptor = OBJECT_CREATE(null);
  descriptor.value = value;
  descriptor.enumerable = true;
  descriptor.writable = false;
  descriptor.configurable = false;
  return descriptor;
}

function exactRecord(entries) {
  const value = OBJECT_CREATE(null);
  for (let index = 0; index < entries.length; index += 1) {
    OBJECT_DEFINE_PROPERTY(value, entries[index][0], immutableDescriptor(entries[index][1]));
  }
  return OBJECT_FREEZE(value);
}

function exactDataObject(value, keys, code) {
  if (
    value === null
    || typeof value !== 'object'
    || ARRAY_IS_ARRAY(value)
    || IS_PROXY(value)
  ) fail(code);
  const prototype = OBJECT_GET_PROTOTYPE_OF(value);
  if (prototype !== OBJECT_PROTOTYPE && prototype !== null) fail(code);
  const observed = REFLECT_OWN_KEYS(value);
  if (
    observed.length !== keys.length
    || observed.some(key => typeof key !== 'string' || !keys.includes(key))
  ) fail(code);
  const result = OBJECT_CREATE(null);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (
      descriptor === undefined
      || !OBJECT_HAS_OWN(descriptor, 'value')
      || descriptor.enumerable !== true
    ) fail(code);
    result[key] = descriptor.value;
  }
  return result;
}

function deepFreezeJson(value, depth = 0) {
  if (depth > 32 || value === null || typeof value !== 'object') return value;
  if (IS_PROXY(value)) fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput);
  const keys = REFLECT_OWN_KEYS(value);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, keys[index]);
    if (descriptor === undefined || !OBJECT_HAS_OWN(descriptor, 'value')) {
      fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput);
    }
    deepFreezeJson(descriptor.value, depth + 1);
  }
  return OBJECT_FREEZE(value);
}

function byteLength(value) {
  return BUFFER_BYTE_LENGTH(value, 'utf8');
}

function canonicalResourceUrl(value, code) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_RESOURCE_URL_BYTES
    || byteLength(value) > MAX_RESOURCE_URL_BYTES
    || value.includes('\r')
    || value.includes('\n')
    || value.includes('#')
  ) fail(code);
  let parsed;
  try { parsed = new NATIVE_URL(value); } catch { fail(code); }
  if (
    parsed.protocol !== 'https:'
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.hostname === ''
    || parsed.search !== ''
    || parsed.hash !== ''
    || parsed.href !== value
  ) fail(code);
  const target = parsed.pathname;
  if (
    target === '/'
    || target.length > MAX_RESOURCE_URL_BYTES
    || byteLength(target) > MAX_RESOURCE_URL_BYTES
    || !REQUEST_TARGET.test(target)
    || DOT_SEGMENT.test(target)
  ) fail(code);
  return value;
}

function captureConfiguration(options) {
  const code = ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidConfiguration;
  if (
    options === null
    || typeof options !== 'object'
    || ARRAY_IS_ARRAY(options)
    || IS_PROXY(options)
    || OBJECT_GET_PROTOTYPE_OF(options) !== OBJECT_PROTOTYPE
  ) fail(code);
  const observed = REFLECT_OWN_KEYS(options);
  if (
    observed.length < CONFIGURATION_REQUIRED_KEYS.length
    || observed.length > CONFIGURATION_KEYS.length
    || observed.some(key => typeof key !== 'string' || !CONFIGURATION_KEYS.includes(key))
  ) fail(code);
  const input = OBJECT_CREATE(null);
  for (let index = 0; index < CONFIGURATION_KEYS.length; index += 1) {
    const key = CONFIGURATION_KEYS[index];
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(options, key);
    if (descriptor === undefined) {
      if (CONFIGURATION_REQUIRED_KEYS.includes(key)) fail(code);
      input[key] = undefined;
      continue;
    }
    if (!OBJECT_HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail(code);
    input[key] = descriptor.value;
  }
  const resourceUrl = canonicalResourceUrl(
    input.resourceUrl,
    ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidConfiguration,
  );
  if (
    !Number.isSafeInteger(input.deadlineMs)
    || input.deadlineMs < 1
    || input.deadlineMs > MAX_DEADLINE_MS
  ) fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidConfiguration);
  const fetchImpl = input.fetchImpl === undefined ? DEFAULT_FETCH : input.fetchImpl;
  if (typeof fetchImpl !== 'function') {
    fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidConfiguration);
  }
  return OBJECT_FREEZE({ resourceUrl, deadlineMs: input.deadlineMs, fetchImpl });
}

function parseCanonicalHeader(value, validator, code) {
  try {
    if (
      typeof value !== 'string'
      || value.length === 0
      || value.length > MAX_X402_HEADER_ENCODED_BYTES
      || byteLength(value) > MAX_X402_HEADER_ENCODED_BYTES
      || !BASE64.test(value)
    ) fail(code);
    const decoded = decodeB64Json(value, {
      maxDecodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
      maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
    });
    validator(decoded);
    if (encodeB64Json(decoded, { maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES }) !== value) {
      fail(code);
    }
    return decoded;
  } catch (error) {
    if (error instanceof ZenonFundingPostV1ClientError) throw error;
    fail(code);
  }
}

function captureChallenge(value, resourceUrl) {
  const input = exactDataObject(
    value,
    CHALLENGE_KEYS,
    ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput,
  );
  if (input.status !== 'PAYMENT_REQUIRED' || input.resourceUrl !== resourceUrl) {
    fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput);
  }
  const paymentRequired = parseCanonicalHeader(
    input.paymentRequiredHeader,
    validatePaymentRequired,
    ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput,
  );
  try { validatePaymentRequired(input.paymentRequired); }
  catch { fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput); }
  let retainedText;
  let suppliedText;
  try {
    retainedText = JSON_STRINGIFY(paymentRequired);
    suppliedText = JSON_STRINGIFY(input.paymentRequired);
  } catch {
    fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput);
  }
  if (retainedText !== suppliedText) fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput);
  if (
    paymentRequired.resource.url !== resourceUrl
    || !ARRAY_IS_ARRAY(paymentRequired.accepts)
    || paymentRequired.accepts.length !== 1
  ) fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput);
  try { validateActiveUpfrontRequirement(paymentRequired.accepts[0]); }
  catch { fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput); }
  if (paymentRequired.accepts[0].network !== EXPERIMENTAL_LIVE_NETWORK) {
    fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput);
  }
  return OBJECT_FREEZE({
    paymentRequiredHeader: input.paymentRequiredHeader,
    paymentRequired,
  });
}

function captureSubmission(input, resourceUrl) {
  const values = exactDataObject(
    input,
    SUBMISSION_KEYS,
    ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput,
  );
  const challenge = captureChallenge(values.challenge, resourceUrl);
  const payment = parseCanonicalHeader(
    values.paymentSignatureHeader,
    validatePaymentPayloadEnvelope,
    ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput,
  );
  const requirement = challenge.paymentRequired.accepts[0];
  if (
    payment.x402Version !== challenge.paymentRequired.x402Version
    || !sameRequirements(payment.accepted, requirement)
    || !sameResource(payment.resource, challenge.paymentRequired.resource)
  ) fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput);
  return OBJECT_FREEZE({
    challengeHeader: challenge.paymentRequiredHeader,
    paymentHeader: values.paymentSignatureHeader,
    payment,
    paymentRequired: challenge.paymentRequired,
    requirement,
  });
}

function readHeader(headers, name) {
  if (headers === null || typeof headers !== 'object' || IS_PROXY(headers)) return null;
  const get = headers.get;
  if (typeof get !== 'function') return null;
  try {
    const value = REFLECT_APPLY(get, headers, [name]);
    return value === null || typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

function headersAreBounded(headers) {
  if (headers === null || typeof headers !== 'object' || IS_PROXY(headers)) return false;
  const entries = headers.entries;
  if (typeof entries !== 'function') return false;
  let iterator;
  try { iterator = REFLECT_APPLY(entries, headers, []); } catch { return false; }
  if (iterator === null || typeof iterator !== 'object') return false;
  let count = 0;
  let bytes = 0;
  try {
    for (const entry of iterator) {
      if (!ARRAY_IS_ARRAY(entry) || entry.length !== 2) return false;
      const [name, value] = entry;
      if (typeof name !== 'string' || typeof value !== 'string') return false;
      count += 1;
      bytes += byteLength(name) + byteLength(value) + 4;
      if (count > MAX_RESPONSE_HEADER_PAIRS || bytes > MAX_RESPONSE_HEADER_BYTES) return false;
    }
  } catch {
    return false;
  }
  return true;
}

async function boundedBody(response) {
  const body = response.body;
  const cancelBody = async () => {
    if (body === null || body === undefined) return;
    if (typeof body !== 'object' || IS_PROXY(body)) await new NATIVE_PROMISE(() => {});
    const cancel = body.cancel;
    if (typeof cancel !== 'function') await new NATIVE_PROMISE(() => {});
    let cancelled;
    try { cancelled = REFLECT_APPLY(cancel, body, []); }
    catch { await new NATIVE_PROMISE(() => {}); }
    if (!nativePromise(cancelled)) await new NATIVE_PROMISE(() => {});
    try { await cancelled; }
    catch { await new NATIVE_PROMISE(() => {}); }
  };
  const lengthText = readHeader(response.headers, 'content-length');
  if (!/^(?:0|[1-9]\d*)$/.test(lengthText ?? '')) {
    await cancelBody();
    fail('BODY_INVALID');
  }
  const expectedLength = Number(lengthText);
  if (!Number.isSafeInteger(expectedLength) || expectedLength > MAX_RESPONSE_BODY_BYTES) {
    await cancelBody();
    fail('BODY_INVALID');
  }
  if (body === null) fail('BODY_INVALID');
  if (typeof body !== 'object' || IS_PROXY(body)) await new NATIVE_PROMISE(() => {});
  const getReader = body.getReader;
  if (typeof getReader !== 'function') fail('BODY_INVALID');
  let reader;
  try { reader = REFLECT_APPLY(getReader, body, []); } catch { fail('BODY_INVALID'); }
  if (reader === null || typeof reader !== 'object' || IS_PROXY(reader)) fail('BODY_INVALID');
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (
        result === null
        || typeof result !== 'object'
        || typeof result.done !== 'boolean'
      ) fail('BODY_INVALID');
      if (result.done) break;
      if (!(result.value instanceof Uint8Array)) fail('BODY_INVALID');
      length += result.value.byteLength;
      if (length > MAX_RESPONSE_BODY_BYTES) fail('BODY_INVALID');
      chunks.push(result.value);
    }
  } catch (error) {
    let cancelled;
    try { cancelled = REFLECT_APPLY(reader.cancel, reader, []); }
    catch { await new NATIVE_PROMISE(() => {}); }
    if (!nativePromise(cancelled)) await new NATIVE_PROMISE(() => {});
    try { await cancelled; }
    catch { await new NATIVE_PROMISE(() => {}); }
    throw error;
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  if (length !== expectedLength) fail('BODY_INVALID');
  const bytes = NATIVE_BUFFER.concat(chunks.map(chunk => NATIVE_BUFFER.from(chunk)), length);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail('BODY_INVALID'); }
}

async function disposeRejectedResponse(response) {
  if (response === null || typeof response !== 'object' || IS_PROXY(response)) {
    await new NATIVE_PROMISE(() => {});
  }
  const body = response.body;
  if (body === null) return;
  if (typeof body !== 'object' || IS_PROXY(body)) await new NATIVE_PROMISE(() => {});
  const cancel = body.cancel;
  if (typeof cancel !== 'function') await new NATIVE_PROMISE(() => {});
  let cancelled;
  try { cancelled = REFLECT_APPLY(cancel, body, []); }
  catch { await new NATIVE_PROMISE(() => {}); }
  if (!nativePromise(cancelled)) await new NATIVE_PROMISE(() => {});
  try { await cancelled; }
  catch { await new NATIVE_PROMISE(() => {}); }
}

async function rejectResponse(response, code) {
  await disposeRejectedResponse(response);
  fail(code);
}

function responseMetadataIsExact(response, resourceUrl) {
  if (
    response === null
    || typeof response !== 'object'
    || IS_PROXY(response)
    || response.url !== resourceUrl
    || response.redirected !== false
    || !Number.isSafeInteger(response.status)
    || !headersAreBounded(response.headers)
  ) return false;
  return readHeader(response.headers, 'cache-control') === 'private, no-store, max-age=0'
    && readHeader(response.headers, 'content-type') === TEXT_CONTENT_TYPE
    && readHeader(response.headers, 'vary') === 'PAYMENT-SIGNATURE'
    && readHeader(response.headers, 'x-content-type-options') === 'nosniff'
    && readHeader(response.headers, 'content-encoding') === null
    && readHeader(response.headers, 'trailer') === null;
}

function nativePromise(value) {
  return IS_PROMISE(value)
    && !IS_PROXY(value)
    && OBJECT_GET_PROTOTYPE_OF(value) === PROMISE_PROTOTYPE;
}

function observe(promise, fulfilled, rejected) {
  return REFLECT_APPLY(PROMISE_THEN, promise, [fulfilled, rejected]);
}

function transportOptions(paymentHeader, signal) {
  const headers = paymentHeader === null
    ? OBJECT_FREEZE({ 'Content-Length': '0' })
    : OBJECT_FREEZE({
      'Content-Length': '0',
      'PAYMENT-SIGNATURE': paymentHeader,
    });
  return OBJECT_FREEZE({
    method: 'POST',
    redirect: 'manual',
    cache: 'no-store',
    credentials: 'omit',
    headers,
    signal,
  });
}

function runAttempt(configuration, paymentHeader, classify) {
  const controller = new NATIVE_ABORT_CONTROLLER();
  const immediateFailure = code => {
    const publicPromise = NATIVE_PROMISE.reject(new ZenonFundingPostV1ClientError(code));
    observe(publicPromise, () => undefined, () => undefined);
    return OBJECT_FREEZE({
      publicPromise,
      drainPromise: NATIVE_PROMISE.resolve(),
      isDrained: () => true,
    });
  };
  let transport;
  try {
    transport = REFLECT_APPLY(configuration.fetchImpl, undefined, [
      configuration.resourceUrl,
      transportOptions(paymentHeader, controller.signal),
    ]);
  } catch {
    return immediateFailure(paymentHeader === null
      ? ZENON_FUNDING_POST_V1_CLIENT_CODES.challengeUnavailable
      : ZENON_FUNDING_POST_V1_CLIENT_CODES.outcomeUnknown);
  }
  if (!nativePromise(transport)) {
    return immediateFailure(paymentHeader === null
      ? ZENON_FUNDING_POST_V1_CLIENT_CODES.challengeUnavailable
      : ZENON_FUNDING_POST_V1_CLIENT_CODES.outcomeUnknown);
  }

  const fallbackCode = paymentHeader === null
    ? ZENON_FUNDING_POST_V1_CLIENT_CODES.challengeUnavailable
    : ZENON_FUNDING_POST_V1_CLIENT_CODES.outcomeUnknown;
  let drained = false;
  const operation = (async () => {
    let response;
    try { response = await transport; }
    catch {
      try { controller.abort(); } catch {}
      throw new ZenonFundingPostV1ClientError(fallbackCode);
    }
    try { return await classify(response); }
    catch (error) {
      try { controller.abort(); } catch {}
      if (
        INTERNAL_FAILURES.has(error)
        && Object.values(ZENON_FUNDING_POST_V1_CLIENT_CODES).includes(error.code)
      ) throw new ZenonFundingPostV1ClientError(error.code);
      throw new ZenonFundingPostV1ClientError(fallbackCode);
    }
  })();
  observe(operation, () => undefined, () => undefined);
  const drainPromise = observe(operation, () => {
    drained = true;
  }, () => {
    drained = true;
  });
  let timer;
  let timedOut = false;
  const timeout = new NATIVE_PROMISE((resolve, reject) => {
    timer = NATIVE_SET_TIMEOUT(() => {
      timedOut = true;
      try { controller.abort(); } catch {}
      reject(new ZenonFundingPostV1ClientError(
        paymentHeader === null
          ? ZENON_FUNDING_POST_V1_CLIENT_CODES.challengeUnavailable
          : ZENON_FUNDING_POST_V1_CLIENT_CODES.outcomeUnknown,
      ));
    }, configuration.deadlineMs);
  });
  observe(timeout, () => undefined, () => undefined);
  const publicPromise = NATIVE_PROMISE.race([operation, timeout]).finally(() => {
    if (!timedOut) NATIVE_CLEAR_TIMEOUT(timer);
  });
  observe(publicPromise, () => undefined, () => undefined);
  return OBJECT_FREEZE({ publicPromise, drainPromise, isDrained: () => drained });
}

async function classifyChallengeResponse(response, resourceUrl) {
  if (!responseMetadataIsExact(response, resourceUrl) || response.status !== 402) {
    await rejectResponse(response, ZENON_FUNDING_POST_V1_CLIENT_CODES.challengeUnavailable);
  }
  const body = await boundedBody(response);
  if (body !== 'Payment Required') {
    fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.challengeUnavailable);
  }
  if (
    readHeader(response.headers, 'payment-signature') !== null
    || readHeader(response.headers, 'payment-response') !== null
  ) fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.challengeUnavailable);
  const header = readHeader(response.headers, 'payment-required');
  const paymentRequired = parseCanonicalHeader(
    header,
    validatePaymentRequired,
    ZENON_FUNDING_POST_V1_CLIENT_CODES.challengeUnavailable,
  );
  if (
    paymentRequired.resource.url !== resourceUrl
    || !ARRAY_IS_ARRAY(paymentRequired.accepts)
    || paymentRequired.accepts.length !== 1
  ) fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.challengeUnavailable);
  try { validateActiveUpfrontRequirement(paymentRequired.accepts[0]); }
  catch { fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.challengeUnavailable); }
  if (paymentRequired.accepts[0].network !== EXPERIMENTAL_LIVE_NETWORK) {
    fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.challengeUnavailable);
  }
  let retained;
  try { retained = structuredClone(paymentRequired); }
  catch { fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.challengeUnavailable); }
  return exactRecord([
    ['status', 'PAYMENT_REQUIRED'],
    ['resourceUrl', resourceUrl],
    ['paymentRequiredHeader', header],
    ['paymentRequired', deepFreezeJson(retained)],
  ]);
}

async function classifyPaymentResponse(response, resourceUrl, ambiguityWasLatched) {
  if (!responseMetadataIsExact(response, resourceUrl)) {
    await rejectResponse(response, ZENON_FUNDING_POST_V1_CLIENT_CODES.outcomeUnknown);
  }
  const body = await boundedBody(response);
  const protocolHeadersAbsent = readHeader(response.headers, 'payment-required') === null
    && readHeader(response.headers, 'payment-response') === null
    && readHeader(response.headers, 'payment-signature') === null;
  if (response.status === 202 && body === 'BOUND') {
    if (!protocolHeadersAbsent) fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.outcomeUnknown);
    return exactRecord([['status', 'BOUND']]);
  }
  if (
    !ambiguityWasLatched
    && protocolHeadersAbsent
    && response.status === 400
    && body === 'Bad Request'
  ) {
    fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.paymentRejected);
  }
  if (
    !ambiguityWasLatched
    && protocolHeadersAbsent
    && response.status === 409
    && body === 'Conflict'
  ) {
    fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.paymentConflict);
  }
  fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.outcomeUnknown);
}

/**
 * Creates a default-off client for one fixed Zenon funding POST-v1 resource.
 * The caller owns signing and durable custody of the returned challenge and
 * authorized payment-header bytes. This client owns no wallet, signer, store,
 * publication, observation, grant, or service authority.
 */
export function createServiceCreditZenonFundingPostV1Client(options) {
  const configuration = captureConfiguration(options);
  let active = null;
  let retainedChallengeHeader = null;
  let retainedPaymentHeader = null;
  let ambiguityLatched = false;

  function claimOperation() {
    if (active !== null) fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.operationInFlight);
  }

  function retainUntilDrain(attempt) {
    active = attempt;
    observe(attempt.drainPromise, () => {
      if (active === attempt) active = null;
    }, () => {
      if (active === attempt) active = null;
    });
    return observe(attempt.publicPromise, value => {
      if (attempt.isDrained() && active === attempt) active = null;
      return value;
    }, error => {
      if (attempt.isDrained() && active === attempt) active = null;
      throw error;
    });
  }

  function requestChallenge() {
    if (arguments.length !== 0) fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput);
    claimOperation();
    if (retainedPaymentHeader !== null) {
      fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.paymentConflict);
    }
    const attempt = runAttempt(configuration, null, response => (
      classifyChallengeResponse(response, configuration.resourceUrl)
    ));
    return retainUntilDrain(attempt);
  }

  async function submitAuthorizedPayment(input) {
    if (arguments.length !== 1) fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput);
    claimOperation();
    const captured = captureSubmission(input, configuration.resourceUrl);
    if (retainedChallengeHeader === null) {
      retainedChallengeHeader = captured.challengeHeader;
      retainedPaymentHeader = captured.paymentHeader;
    } else if (
      retainedChallengeHeader !== captured.challengeHeader
      || retainedPaymentHeader !== captured.paymentHeader
    ) {
      fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.paymentConflict);
    }

    const preflightToken = OBJECT_FREEZE({ phase: 'PREFLIGHT' });
    active = preflightToken;
    try {
      await preflightZenonPayment(
        captured.payment,
        captured.requirement,
        captured.paymentRequired,
      );
    } catch {
      if (active === preflightToken) active = null;
      fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.invalidInput);
    }
    if (active !== preflightToken) {
      fail(ZENON_FUNDING_POST_V1_CLIENT_CODES.operationInFlight);
    }
    active = null;
    const ambiguityBeforeAttempt = ambiguityLatched;
    const attempt = runAttempt(
      configuration,
      retainedPaymentHeader,
      response => classifyPaymentResponse(
        response,
        configuration.resourceUrl,
        ambiguityBeforeAttempt,
      ),
    );
    active = attempt;
    observe(attempt.publicPromise, () => undefined, error => {
      if (error?.code === ZENON_FUNDING_POST_V1_CLIENT_CODES.outcomeUnknown) {
        ambiguityLatched = true;
      }
    });
    return retainUntilDrain(attempt);
  }

  return OBJECT_FREEZE({ requestChallenge, submitAuthorizedPayment });
}
