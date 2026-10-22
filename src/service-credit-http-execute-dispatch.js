import { Buffer } from 'node:buffer';
import { TextDecoder, types as utilTypes } from 'node:util';
import { setTimeout as nativeSetTimeout, clearTimeout as nativeClearTimeout } from 'node:timers';
import {
  snapshotOriginalServiceRequestCustodyKey,
  parseOriginalServiceRequestCustody,
  serializeOriginalServiceRequestCustody,
} from './service-credit-original-request-custody-contract.js';

const APPLY = Reflect.apply;
const OWN_KEYS = Reflect.ownKeys;
const DESCRIPTOR = Object.getOwnPropertyDescriptor;
const PROTOTYPE = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const DEFINE = Object.defineProperty;
const FREEZE = Object.freeze;
const IS = Object.is;
const IS_SAFE = Number.isSafeInteger;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const OBJECT_PROTOTYPE = Object.prototype;
const IS_PROXY = utilTypes.isProxy;
const IS_PROMISE = utilTypes.isPromise;
const TYPE_ERROR = TypeError;
const NativePromise = Promise;
const PROMISE_PROTOTYPE = NativePromise.prototype;
const THEN = PROMISE_PROTOTYPE.then;
const SPECIES = Symbol.species;
const NATIVE_SPECIES = DESCRIPTOR(NativePromise, SPECIES);
const JSON_PARSE = JSON.parse;
const JSON_STRINGIFY = JSON.stringify;
const URLConstructor = URL;
const BYTE_LENGTH = Buffer.byteLength;
const BUFFER_FROM = Buffer.from;
const BUFFER_ALLOC = Buffer.alloc;
const BUFFER_IS_BUFFER = Buffer.isBuffer;
const BUFFER_PROTOTYPE = Buffer.prototype;
const BUFFER_TO_STRING = Buffer.prototype.toString;
const BUFFER_SUBARRAY = Buffer.prototype.subarray;
const BUFFER_FILL = Buffer.prototype.fill;
const TYPED_ARRAY_PROTOTYPE = PROTOTYPE(Uint8Array.prototype);
const TYPED_BYTES = DESCRIPTOR(TYPED_ARRAY_PROTOTYPE, 'byteLength').get;
const TYPED_SET = Uint8Array.prototype.set;
const REGEXP_TEST = RegExp.prototype.test;
const STARTS_WITH = String.prototype.startsWith;
const SLICE = String.prototype.slice;
const INCLUDES = String.prototype.includes;
const LOWER = String.prototype.toLowerCase;
const NUMBER_FROM = Number;
// Preserve a leading BOM for canonical JSON rejection rather than stripping it.
const DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const DECODE = TextDecoder.prototype.decode;
const KEY = snapshotOriginalServiceRequestCustodyKey;
const PARSE_RECORD = parseOriginalServiceRequestCustody;
const SERIALIZE_RECORD = serializeOriginalServiceRequestCustody;
const PREFIX = 'SERVICE_CREDIT_HTTP_EXECUTE_DISPATCH_';
const AUTH_PREFIX = 'ServiceCredit ';
const EMPTY_DIGEST = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const HEADER_NAME = /^[A-Za-z][A-Za-z0-9-]{0,127}$/;
const HEADER_VALUE = /^[\x20-\x7e]*$/;
const LENGTH = /^[1-9][0-9]{0,2}$/;
const CONFIG_FIELDS = FREEZE([
  'resourceUrl', 'originalRequestJson', 'authorizationHeader', 'deadlineMs', 'requestImpl',
]);
const REQUEST_FIELDS = FREEZE([
  'modelVersion', 'grantId', 'requestId', 'method', 'routeId',
  'canonicalBodyDigest', 'selectedContentType', 'maxCostUnits',
]);
const PROOF_FIELDS = FREEZE([
  'proofVersion', 'grantId', 'requestId', 'publicKey', 'maxCostUnits', 'signature',
]);
const ALLOWED_HEADERS = FREEZE([
  'cache-control', 'content-type', 'vary', 'x-content-type-options',
  'content-length', 'date', 'connection',
]);

/**
 * One-use, opt-in Node HTTPS request-compatible dispatch.
 *
 * No transport implementation is imported or selected automatically.
 * requestImpl is a trusted caller capability, normally node:https.request
 * only after separate qualification. This module cannot prove its behavior.
 *
 * Factory checks are syntax/declared metadata binding, not proof verification,
 * authenticated context, provider readiness or permission to execute.
 * The original Authorization string is forwarded once without reserialization.
 *
 * selectedContentType is the RESPONSE representation. The request has no
 * Content-Type/Transfer-Encoding/body and calls end() with zero arguments.
 *
 * deadlineMs is an explicit local 1..60000 ms abort-initiation bound, not a
 * cancellation, lifetime, inclusion or cleanup guarantee.
 *
 * A resolved Promise means only the bounded reply and required interface
 * events were observed. It is never a service-delivery/settlement receipt.
 * UNKNOWN_UNDRAINED rejects without claiming unobservable resources closed.
 *
 * Credential references held here are released after the request invocation.
 * JavaScript strings, the caller and native libraries may retain other copies;
 * this is not a string-erasure guarantee. No credential is logged or persisted.
 */
export function createServiceCreditHttpExecuteDispatch(options) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return createDispatch(options, false);
}
/**
 * Explicit V2 result contract: resolve the exact bounded canonical successful
 * response JSON only after the same required reply/close interface events.
 * This is caller-supplied transport DATA, not an authenticated server receipt,
 * service delivery, settlement or future/native event/cleanup guarantee.
 * The original V1 contract still resolves undefined. No default transport is
 * selected. The returned string is at most 512 bytes; secure string erasure or
 * removal of caller/native copies is not promised.
 */
export function createServiceCreditHttpExecuteDispatchV2(options) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return createDispatch(options, true);
}
function createDispatch(options, responseObservationEnabled = false) {
  let config, original;
  try {
    config = exact(options, CONFIG_FIELDS);
    canonicalResource(config.resourceUrl);
    original = originalRequest(config.originalRequestJson);
    validateAuthorization(config.authorizationHeader, original);
    if (!IS_SAFE(config.deadlineMs) || config.deadlineMs < 1
        || config.deadlineMs > 60000 || IS(config.deadlineMs, -0)
        || typeof config.requestImpl !== 'function' || IS_PROXY(config.requestImpl)) {
      throw failure('INVALID_CONFIGURATION');
    }
  } catch {
    throw failure('INVALID_CONFIGURATION');
  }

  let resourceUrl = config.resourceUrl;
  let originalJson = config.originalRequestJson;
  let authorization = config.authorizationHeader;
  let requestImpl = config.requestImpl;
  const deadlineMs = config.deadlineMs;
  const grantId = original.grantId;
  const requestId = original.requestId;
  const maxCostUnits = original.maxCostUnits;
  config = null;
  original = null;

  let used = false;
  let settled = false;
  let unknown = false;
  let undrained = false;
  let phase = 'UNUSED';
  let deadlineFired = false;
  let credentialReferenceReleased = false;
  let replyValidated = false;
  let responseObservationJson = null;
  let duplicateResponseCallback = false;
  let lateEventSeen = false;
  let implReturned = false;
  let endCalled = false;
  let setupDepth = 0;
  let pumping = false;
  let timer = null;
  let operation = null;
  let request = null;
  let response = null;
  let extraResponse = null;
  let body = null;
  let declaredLength = 0;
  let received = 0;
  const counts = {
    requestCalls: 0,
    responseHandles: 0,
    listenerRegistrations: 0,
    endCalls: 0,
    destroyCalls: 0,
    dataChunks: 0,
    bodyBytes: 0,
    settlements: 0,
  };

  function releaseConfiguration() {
    authorization = null;
    resourceUrl = null;
    originalJson = null;
    requestImpl = null;
    credentialReferenceReleased = true;
  }

  function clearBody() {
    if (body !== null) {
      APPLY(BUFFER_FILL, body, [0]);
      body = null;
    }
  }

  function clearDeadline() {
    if (timer !== null) {
      nativeClearTimeout(timer);
      timer = null;
    }
  }

  function finish(success) {
    if (settled) return;
    settled = true;
    counts.settlements++;
    clearDeadline();
    const observation = success && responseObservationEnabled ? responseObservationJson : undefined;
    responseObservationJson = null;
    clearBody();
    if (success) {
      phase = 'INTERFACE_COMPLETED';
      operation.resolve(observation);
    } else {
      phase = undrained ? 'UNKNOWN_UNDRAINED' : 'UNKNOWN';
      operation.reject(failure(undrained ? 'UNKNOWN_UNDRAINED' : 'OUTCOME_UNKNOWN'));
    }
  }

  function markUnknown(unobservable = false) {
    unknown = true;
    if (unobservable) undrained = true;
    phase = undrained ? 'UNKNOWN_UNDRAINED' : 'ABORTING_UNKNOWN';
    pump();
  }

  function destroyOnce(handle) {
    if (handle === null || handle.closed || handle.destroyAttempted
        || handle.methods.destroy === null) return;
    handle.destroyAttempted = true;
    counts.destroyCalls++;
    setupDepth++;
    try {
      APPLY(handle.methods.destroy, handle.target, []);
    } catch {
      unknown = true;
      undrained = true;
    } finally {
      setupDepth--;
    }
  }

  function pump() {
    if (setupDepth !== 0 || pumping) return;
    pumping = true;
    try {
      if (unknown) {
        destroyOnce(request);
        destroyOnce(response);
        destroyOnce(extraResponse);
      }
      if (settled) return;
      if (undrained) {
        finish(false);
        return;
      }
      if (!implReturned || request === null || !request.observable) return;
      if (unknown) {
        if (request.closed && (response === null || response.closed)
            && (extraResponse === null || extraResponse.closed)) finish(false);
        return;
      }
      if (endCalled && request.closed && response !== null
          && response.ended && response.closed && response.complete && replyValidated) {
        finish(true);
      }
    } finally {
      pumping = false;
    }
  }

  function register(handle, event, listener) {
    if (handle.methods.on === null) return false;
    counts.listenerRegistrations++;
    try {
      APPLY(handle.methods.on, handle.target, [event, listener]);
      return true;
    } catch {
      markUnknown(true);
      return false;
    }
  }

  function requestClose() {
    if (request === null || request.closed) return;
    request.closed = true;
    if (!settled && response === null && implReturned) markUnknown(false);
    pump();
  }

  function requestError() {
    if (settled) { lateEventSeen = true; return; }
    markUnknown(false);
  }

  function responseClose(handle) {
    if (handle.closed) return;
    handle.closed = true;
    if (!settled && handle === response && !handle.ended) markUnknown(false);
    pump();
  }

  function responseError() {
    if (settled) { lateEventSeen = true; return; }
    markUnknown(false);
  }

  function readComplete(handle) {
    const value = ownData(handle.target, 'complete');
    if (typeof value !== 'boolean') throw failure('INVALID_DATA');
    handle.complete = value;
    return value;
  }

  function responseData(handle, chunk) {
    if (settled) { lateEventSeen = true; return; }
    if (unknown || handle !== response) return;
    if (handle.ended || handle.closed || counts.dataChunks >= 512) {
      markUnknown(false);
      return;
    }
    counts.dataChunks++;
    try {
      if (typeof chunk !== 'object' || chunk === null || IS_PROXY(chunk)
          || PROTOTYPE(chunk) !== BUFFER_PROTOTYPE
          || !APPLY(BUFFER_IS_BUFFER, Buffer, [chunk])) throw failure('INVALID_DATA');
      const length = APPLY(TYPED_BYTES, chunk, []);
      if (!IS_SAFE(length) || length < 0 || length > 512
          || received + length > 512 || received + length > declaredLength) {
        throw failure('INVALID_DATA');
      }
      // Native typed-array set uses internal typed-array lengths, not an
      // untrusted own .length/.constructor/iterator property.
      APPLY(TYPED_SET, body, [chunk, received]);
      received += length;
      counts.bodyBytes = received;
    } catch {
      markUnknown(false);
    }
  }

  function responseEnd(handle) {
    if (handle.ended) return;
    handle.ended = true;
    if (settled) { lateEventSeen = true; return; }
    if (handle !== response) { markUnknown(true); return; }
    try {
      if (!readComplete(handle)) throw failure('INVALID_DATA');
      if (!unknown) {
        if (declaredLength < 1 || received !== declaredLength) throw failure('INVALID_DATA');
        const bytes = APPLY(BUFFER_SUBARRAY, body, [0, received]);
        const text = APPLY(DECODE, DECODER, [bytes]);
        const decoded = exact(JSON_PARSE(text), ['ok', 'resultCode']);
        if (decoded.ok !== true) throw failure('INVALID_DATA');
        KEY({ grantId: 'result', requestId: decoded.resultCode });
        if (JSON_STRINGIFY({ ok: true, resultCode: decoded.resultCode }) !== text) {
          throw failure('INVALID_DATA');
        }
        if (responseObservationEnabled) responseObservationJson = text;
        replyValidated = true;
      }
    } catch {
      markUnknown(false);
    }
    pump();
  }

  function installResponse(handle, primary) {
    setupDepth++;
    try {
      if (!handle.observable) markUnknown(true);
      if (!register(handle, 'close', () => responseClose(handle))) return;
      if (!register(handle, 'error', responseError)) return;
      if (!register(handle, 'aborted', responseError)) return;
      if (!primary) return;
      if (!register(handle, 'data', chunk => responseData(handle, chunk))) return;
      if (!register(handle, 'end', () => responseEnd(handle))) return;
      if (!unknown) {
        try {
          const status = ownData(handle.target, 'statusCode');
          const headers = ownData(handle.target, 'rawHeaders');
          readComplete(handle);
          if (status !== 200) throw failure('INVALID_DATA');
          declaredLength = responseHeaders(headers);
        } catch {
          markUnknown(false);
        }
      }
    } finally {
      setupDepth--;
      pump();
    }
  }

  function onResponse(...args) {
    if (args.length !== 1) { markUnknown(true); return; }
    const target = args[0];
    if (target === response?.target || target === extraResponse?.target) {
      duplicateResponseCallback = true;
      return;
    }
    if (response !== null) {
      markUnknown(true);
      if (extraResponse !== null) {
        lateEventSeen = true;
        return;
      }
      extraResponse = handleState(target, false);
      counts.responseHandles++;
      installResponse(extraResponse, false);
      return;
    }
    if (settled) {
      lateEventSeen = true;
      unknown = true;
      undrained = true;
      phase = 'UNKNOWN_UNDRAINED';
    }
    response = handleState(target, false);
    counts.responseHandles++;
    installResponse(response, true);
  }

  function dispatch(...args) {
    if (args.length !== 1) return rejected('INVALID_INPUT');
    if (used) return rejected('ALREADY_USED');
    try {
      const retained = PARSE_RECORD(SERIALIZE_RECORD(args[0]));
      if (retained.originalRequestJson !== originalJson
          || retained.originalBodyBase64 !== ''
          || retained.serviceResourceUrl !== resourceUrl
          || retained.grantId !== grantId || retained.requestId !== requestId) {
        throw failure('INVALID_INPUT');
      }
      const meta = originalRequest(retained.originalRequestJson);
      if (meta.maxCostUnits !== maxCostUnits) throw failure('INVALID_INPUT');
    } catch {
      return rejected('INVALID_INPUT');
    }

    used = true;
    phase = 'ACTIVE';
    operation = capability();
    body = APPLY(BUFFER_ALLOC, Buffer, [512]);
    setupDepth++;
    try {
      timer = nativeSetTimeout(() => {
        timer = null;
        if (settled) return;
        deadlineFired = true;
        markUnknown(false);
      }, deadlineMs);
      const headers = FREEZE({ Authorization: authorization });
      const requestOptions = FREEZE({
        method: 'POST',
        headers,
        agent: false,
        rejectUnauthorized: true,
        maxHeaderSize: 16384,
        insecureHTTPParser: false,
      });
      counts.requestCalls++;
      const returned = APPLY(requestImpl, undefined, [resourceUrl, requestOptions, onResponse]);
      observeRequestPromise(returned);
      implReturned = true;
      request = handleState(returned, true);
      if (!request.observable) markUnknown(true);
      if (request.methods.on !== null) {
        if (register(request, 'close', requestClose)) register(request, 'error', requestError);
      }
      if (!unknown && request.methods.end !== null) {
        endCalled = true;
        counts.endCalls++;
        APPLY(request.methods.end, request.target, []);
      }
    } catch {
      implReturned = true;
      markUnknown(request === null || !request.observable);
    } finally {
      releaseConfiguration();
      setupDepth--;
      pump();
    }
    return operation.promise;
  }

  function snapshot(...args) {
    if (args.length !== 0) throw failure('INVALID_INPUT');
    return FREEZE({
      phase,
      used,
      settled,
      unknown,
      undrained,
      deadlineFired,
      timerArmed: timer !== null,
      credentialReferenceReleased,
      requestObserved: request?.observable === true,
      responseObserved: response?.observable === true,
      requestClosed: request?.closed === true,
      responseEnded: response?.ended === true,
      responseClosed: response?.closed === true,
      responseComplete: response?.complete === true,
      replyValidated,
      duplicateResponseCallback,
      lateEventSeen,
      counts: FREEZE({ ...counts }),
      qualification: 'SYNTHETIC_INTERFACE_ONLY',
      serviceDelivery: 'NOT_ESTABLISHED',
      realReady: 'NOT_ESTABLISHED',
      restart: 'NOT_ESTABLISHED',
      durability: 'NOT_ESTABLISHED',
    });
  }

  return FREEZE({ dispatch: FREEZE(dispatch), snapshot: FREEZE(snapshot) });
}

function exact(value, fields) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value)
      || PROTOTYPE(value) !== OBJECT_PROTOTYPE) throw failure('INVALID_DATA');
  const keys = OWN_KEYS(value);
  if (keys.length !== fields.length) throw failure('INVALID_DATA');
  const result = {};
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    const descriptor = DESCRIPTOR(value, field);
    if (!descriptor || descriptor.enumerable !== true || !HAS_OWN(descriptor, 'value')) {
      throw failure('INVALID_DATA');
    }
    result[field] = descriptor.value;
  }
  return result;
}

function ownData(value, field) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value)) {
    throw failure('INVALID_DATA');
  }
  const descriptor = DESCRIPTOR(value, field);
  if (!descriptor || !HAS_OWN(descriptor, 'value')) throw failure('INVALID_DATA');
  return descriptor.value;
}

function bounded(value, limit, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)
      || value.length > limit
      || APPLY(BYTE_LENGTH, Buffer, [value, 'utf8']) > limit) throw failure('INVALID_DATA');
}

function canonicalResource(value) {
  bounded(value, 4096);
  if (APPLY(INCLUDES, value, ['?']) || APPLY(INCLUDES, value, ['#'])
      || APPLY(INCLUDES, value, ['\r']) || APPLY(INCLUDES, value, ['\n'])) {
    throw failure('INVALID_DATA');
  }
  const parsed = new URLConstructor(value);
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== ''
      || parsed.hostname === '' || parsed.search !== '' || parsed.hash !== ''
      || parsed.pathname !== '/service-credit/v1/execute' || parsed.href !== value) {
    throw failure('INVALID_DATA');
  }
}

function originalRequest(text) {
  bounded(text, 4096);
  const value = exact(JSON_PARSE(text), REQUEST_FIELDS);
  const key = KEY({ grantId: value.grantId, requestId: value.requestId });
  if (value.modelVersion !== 1 || value.method !== 'POST'
      || value.routeId !== 'service-credit.execute.v1'
      || value.canonicalBodyDigest !== EMPTY_DIGEST
      || value.selectedContentType !== 'application/json'
      || !IS_SAFE(value.maxCostUnits) || value.maxCostUnits <= 0
      || IS(value.maxCostUnits, -0)) throw failure('INVALID_DATA');
  const canonical = {
    modelVersion: 1, grantId: key.grantId, requestId: key.requestId,
    method: 'POST', routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: EMPTY_DIGEST, selectedContentType: 'application/json',
    maxCostUnits: value.maxCostUnits,
  };
  if (JSON_STRINGIFY(canonical) !== text) throw failure('INVALID_DATA');
  return FREEZE({
    grantId: key.grantId, requestId: key.requestId,
    maxCostUnits: value.maxCostUnits,
  });
}

function validateAuthorization(header, original) {
  bounded(header, 1024);
  if (!APPLY(STARTS_WITH, header, [AUTH_PREFIX])) throw failure('INVALID_DATA');
  const encoded = APPLY(SLICE, header, [AUTH_PREFIX.length]);
  if (!APPLY(REGEXP_TEST, BASE64URL, [encoded])) throw failure('INVALID_DATA');
  let bytes = null;
  try {
    bytes = APPLY(BUFFER_FROM, Buffer, [encoded, 'base64url']);
    if (bytes.length === 0
        || APPLY(BUFFER_TO_STRING, bytes, ['base64url']) !== encoded) {
      throw failure('INVALID_DATA');
    }
    const text = APPLY(DECODE, DECODER, [bytes]);
    const proof = exact(JSON_PARSE(text), PROOF_FIELDS);
    const key = KEY({ grantId: proof.grantId, requestId: proof.requestId });
    bounded(proof.publicKey, 256);
    bounded(proof.signature, 256);
    if (proof.proofVersion !== 1 || !IS_SAFE(proof.maxCostUnits)
        || proof.maxCostUnits <= 0 || IS(proof.maxCostUnits, -0)
        || key.grantId !== original.grantId || key.requestId !== original.requestId
        || proof.maxCostUnits !== original.maxCostUnits) throw failure('INVALID_DATA');
    const canonical = {
      grantId: key.grantId,
      maxCostUnits: proof.maxCostUnits,
      proofVersion: 1,
      publicKey: proof.publicKey,
      requestId: key.requestId,
      signature: proof.signature,
    };
    if (JSON_STRINGIFY(canonical) !== text) throw failure('INVALID_DATA');
  } finally {
    if (bytes !== null) APPLY(BUFFER_FILL, bytes, [0]);
  }
}

function captureMethods(target, names) {
  if (typeof target !== 'object' || target === null || IS_PROXY(target)) return null;
  const chain = [];
  let current = target;
  for (let depth = 0; current !== null && depth < 16; depth++) {
    if (IS_PROXY(current)) return null;
    chain[chain.length] = current;
    current = PROTOTYPE(current);
  }
  if (current !== null) return null;
  const methods = { on: null, end: null, destroy: null };
  for (let index = 0; index < names.length; index++) {
    const name = names[index];
    for (let depth = 0; depth < chain.length; depth++) {
      const descriptor = DESCRIPTOR(chain[depth], name);
      if (descriptor === undefined) continue;
      if (HAS_OWN(descriptor, 'value') && typeof descriptor.value === 'function'
          && !IS_PROXY(descriptor.value)) methods[name] = descriptor.value;
      break;
    }
  }
  return methods;
}

function handleState(target, request) {
  let methods;
  try {
    methods = captureMethods(target, request ? ['on', 'end', 'destroy'] : ['on', 'destroy']);
  } catch {
    methods = null;
  }
  const captured = methods ?? { on: null, end: null, destroy: null };
  return {
    target,
    methods: captured,
    observable: captured.on !== null && captured.destroy !== null
      && (!request || captured.end !== null),
    destroyAttempted: false,
    closed: false,
    ended: false,
    complete: false,
  };
}

function rawHeaderArray(value) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value)
      || !ARRAY_IS_ARRAY(value) || PROTOTYPE(value) !== ARRAY_PROTOTYPE) {
    throw failure('INVALID_DATA');
  }
  const length = DESCRIPTOR(value, 'length');
  if (!length || !HAS_OWN(length, 'value') || !IS_SAFE(length.value)
      || length.value < 0 || length.value > 128 || length.value % 2 !== 0) {
    throw failure('INVALID_DATA');
  }
  const keys = OWN_KEYS(value);
  if (keys.length !== length.value + 1) throw failure('INVALID_DATA');
  const result = [];
  for (let index = 0; index < length.value; index++) {
    const field = `${index}`;
    if (keys[index] !== field) throw failure('INVALID_DATA');
    const descriptor = DESCRIPTOR(value, field);
    if (!descriptor || !descriptor.enumerable || !HAS_OWN(descriptor, 'value')) {
      throw failure('INVALID_DATA');
    }
    result[index] = descriptor.value;
  }
  if (keys[keys.length - 1] !== 'length') throw failure('INVALID_DATA');
  return result;
}

function responseHeaders(raw) {
  const headers = rawHeaderArray(raw);
  const values = {};
  let total = 0;
  for (let index = 0; index < headers.length; index += 2) {
    const name = headers[index], value = headers[index + 1];
    bounded(name, 128);
    bounded(value, 4096, true);
    if (!APPLY(REGEXP_TEST, HEADER_NAME, [name])
        || !APPLY(REGEXP_TEST, HEADER_VALUE, [value])) throw failure('INVALID_DATA');
    total += APPLY(BYTE_LENGTH, Buffer, [name, 'utf8'])
      + APPLY(BYTE_LENGTH, Buffer, [value, 'utf8']);
    if (total > 16384) throw failure('INVALID_DATA');
    const lower = APPLY(LOWER, name, []);
    let allowed = false;
    for (let member = 0; member < ALLOWED_HEADERS.length; member++) {
      if (ALLOWED_HEADERS[member] === lower) allowed = true;
    }
    if (!allowed || HAS_OWN(values, lower)) throw failure('INVALID_DATA');
    DEFINE(values, lower, { value, enumerable: true });
  }
  if (values['cache-control'] !== 'private, no-store, max-age=0'
      || values['content-type'] !== 'application/json'
      || values.vary !== 'Authorization'
      || values['x-content-type-options'] !== 'nosniff'
      || typeof values['content-length'] !== 'string'
      || !APPLY(REGEXP_TEST, LENGTH, [values['content-length']])) {
    throw failure('INVALID_DATA');
  }
  const length = NUMBER_FROM(values['content-length']);
  if (length < 1 || length > 512) throw failure('INVALID_DATA');
  if (HAS_OWN(values, 'date')) bounded(values.date, 128);
  if (HAS_OWN(values, 'connection')
      && values.connection !== 'close' && values.connection !== 'keep-alive') {
    throw failure('INVALID_DATA');
  }
  return length;
}

function safelyObservableRequestPromise(value) {
  try {
    if (typeof value !== 'object' || value === null || IS_PROXY(value)
        || !IS_PROMISE(value) || PROTOTYPE(value) !== PROMISE_PROTOTYPE) return false;
    const ownConstructor = DESCRIPTOR(value, 'constructor');
    if (ownConstructor !== undefined
        && (!HAS_OWN(ownConstructor, 'value')
          || ownConstructor.value !== NativePromise)) return false;
    const constructor = DESCRIPTOR(PROMISE_PROTOTYPE, 'constructor');
    if (!constructor || !HAS_OWN(constructor, 'value')
        || constructor.value !== NativePromise) return false;
    const species = DESCRIPTOR(NativePromise, SPECIES);
    if (!species || !NATIVE_SPECIES) return false;
    if (HAS_OWN(NATIVE_SPECIES, 'value')) {
      return HAS_OWN(species, 'value') && species.value === NATIVE_SPECIES.value;
    }
    return !HAS_OWN(species, 'value') && species.get === NATIVE_SPECIES.get
      && species.set === NATIVE_SPECIES.set;
  } catch {
    return false;
  }
}

function observeRequestPromise(value) {
  if (!safelyObservableRequestPromise(value)) return;
  try {
    // Discard both fulfillment values and rejection reasons. The derived
    // native Promise receives only undefined, never a callback-owned object.
    APPLY(THEN, value, [() => undefined, () => undefined]);
  } catch {
    // Native/global observation faults remain unqualified. Observation never
    // authorizes an asynchronous request, resumption, cleanup or retry.
  }
}

function capability() {
  let resolve, reject;
  const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  return FREEZE({ promise, resolve, reject });
}

function rejected(suffix) {
  const result = capability();
  result.reject(failure(suffix));
  return result.promise;
}

function failure(suffix) {
  const code = PREFIX + suffix;
  const error = new TYPE_ERROR(code);
  DEFINE(error, 'code', { value: code, enumerable: true });
  DEFINE(error, 'stack', {
    value: 'TypeError: ' + code,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return FREEZE(error);
}
