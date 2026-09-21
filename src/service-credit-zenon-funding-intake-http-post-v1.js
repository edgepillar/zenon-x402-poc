import { types as utilTypes } from 'node:util';

import { paymentIntentDigest } from './canonical.js';
import {
  createZenonFundingIntake,
} from './service-credit-zenon-funding-intake.js';
import {
  deriveZenonFundingIntakeSelectionKey,
  snapshotZenonFundingIntakeJson,
  ZenonFundingIntakeSqliteStore,
} from './service-credit-zenon-funding-intake-sqlite-store.js';
import {
  decodeB64Json,
  MAX_X402_HEADER_ENCODED_BYTES,
  sameRequirements,
  sameResource,
  validatePaymentPayloadEnvelope,
  validatePaymentRequired,
} from './x402-wire.js';

const ZENON_FUNDING_INTAKE_HTTP_POST_V1_MAX_PAYMENT_SIGNATURE_BYTES =
  MAX_X402_HEADER_ENCODED_BYTES;
const ZENON_FUNDING_INTAKE_HTTP_POST_V1_MAX_RAW_HEADER_BYTES = 16 * 1024;
const ZENON_FUNDING_INTAKE_HTTP_POST_V1_MAX_RAW_HEADER_PAIRS = 64;

const NATIVE_ARRAY = Array;
const ARRAY_IS_ARRAY = NATIVE_ARRAY.isArray;
const ARRAY_PROTOTYPE = NATIVE_ARRAY.prototype;
const NATIVE_BUFFER = Buffer;
const BUFFER_BYTE_LENGTH = NATIVE_BUFFER.byteLength;
const BUFFER_FROM = NATIVE_BUFFER.from;
const BUFFER_TO_STRING = NATIVE_BUFFER.prototype.toString;
const NATIVE_JSON = JSON;
const JSON_STRINGIFY = NATIVE_JSON.stringify;
const NATIVE_NUMBER = Number;
const NUMBER_IS_FINITE = NATIVE_NUMBER.isFinite;
const NUMBER_IS_SAFE_INTEGER = NATIVE_NUMBER.isSafeInteger;
const NATIVE_OBJECT = Object;
const OBJECT_CREATE = NATIVE_OBJECT.create;
const OBJECT_DEFINE_PROPERTY = NATIVE_OBJECT.defineProperty;
const OBJECT_FREEZE = NATIVE_OBJECT.freeze;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = NATIVE_OBJECT.getOwnPropertyDescriptor;
const OBJECT_GET_OWN_PROPERTY_NAMES = NATIVE_OBJECT.getOwnPropertyNames;
const OBJECT_HAS_OWN = NATIVE_OBJECT.hasOwn;
const OBJECT_IS_EXTENSIBLE = NATIVE_OBJECT.isExtensible;
const OBJECT_IS = NATIVE_OBJECT.is;
const OBJECT_IS_FROZEN = NATIVE_OBJECT.isFrozen;
const OBJECT_PROTOTYPE = NATIVE_OBJECT.prototype;
const NATIVE_PROMISE = Promise;
const PROMISE_PROTOTYPE = NATIVE_PROMISE.prototype;
const PROMISE_THEN = PROMISE_PROTOTYPE.then;
const PROMISE_THEN_DESCRIPTOR = OBJECT_FREEZE(
  OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(PROMISE_PROTOTYPE, 'then'),
);
const PROMISE_CONSTRUCTOR_DESCRIPTOR = OBJECT_FREEZE(
  OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(PROMISE_PROTOTYPE, 'constructor'),
);
const PROMISE_SPECIES = Symbol.species;
const PROMISE_SPECIES_DESCRIPTOR = OBJECT_FREEZE(
  OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_PROMISE, PROMISE_SPECIES),
);
const NATIVE_REFLECT = Reflect;
const REFLECT_APPLY = NATIVE_REFLECT.apply;
const REFLECT_DELETE_PROPERTY = NATIVE_REFLECT.deleteProperty;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = NATIVE_REFLECT.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = NATIVE_REFLECT.getPrototypeOf;
const REFLECT_OWN_KEYS = NATIVE_REFLECT.ownKeys;
const NATIVE_REGEXP = RegExp;
const REGEXP_EXEC = NATIVE_REGEXP.prototype.exec;
const NATIVE_STRING = String;
const STRING_FROM = NATIVE_STRING;
const STRING_INCLUDES = NATIVE_STRING.prototype.includes;
const STRING_STARTS_WITH = NATIVE_STRING.prototype.startsWith;
const STRING_TO_LOWER_CASE = NATIVE_STRING.prototype.toLowerCase;
const NATIVE_TYPE_ERROR = TypeError;
const NATIVE_URL = URL;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE_PROTOTYPE = REFLECT_GET_PROTOTYPE_OF(OBJECT_PROTOTYPE);
const OBJECT_PROTOTYPE_BASELINE = snapshotObjectPrototype();

const CONFIGURATION_KEYS = OBJECT_FREEZE([
  'store',
  'serviceCreditStore',
  'authorityRecord',
  'deriveFundingTerms',
  'now',
  'observerRoot',
  'observerCatchUp',
  'selection',
  'resourceUrl',
]);
const INTAKE_KEYS = OBJECT_FREEZE([
  'store',
  'serviceCreditStore',
  'authorityRecord',
  'deriveFundingTerms',
  'now',
  'observerRoot',
  'observerCatchUp',
]);
const SELECTION_KEYS = OBJECT_FREEZE([
  'offerId',
  'offerVersion',
  'holderId',
  'capabilityCommitment',
]);
const OWNER_KEYS = OBJECT_FREEZE(['issue', 'bind', 'recoverBound', 'close']);
const FRAME_KEYS = OBJECT_FREEZE(['status', 'paymentRequiredHeader', 'body']);
const BOUND_KEYS = OBJECT_FREEZE([
  'status',
  'transactionHash',
  'observerRecordKey',
  'observerFileName',
]);
const ROW_KEYS = OBJECT_FREEZE(['issue', 'binding', 'status']);
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const COMMITMENT = /^sha256:[0-9a-f]{64}$/;
const REQUEST_TARGET = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+(?:\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+)*$/;
const DOT_SEGMENT = /(?:^|\/)\.{1,2}(?:\/|$)/;
const BODY_HEADER_PREFIX = 'content-';
const PAYMENT_SIGNATURE = 'payment-signature';
const PAYMENT_REQUIRED = 'PAYMENT-REQUIRED';
const METHOD = 'POST';
const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

const CODE = OBJECT_FREEZE({
  invalidConfiguration: 'ZENON_FUNDING_INTAKE_HTTP_POST_V1_INVALID_CONFIGURATION',
  invalidInput: 'ZENON_FUNDING_INTAKE_HTTP_POST_V1_INVALID_INPUT',
  closed: 'ZENON_FUNDING_INTAKE_HTTP_POST_V1_CLOSED',
  recoveryRequired: 'ZENON_FUNDING_INTAKE_HTTP_POST_V1_RECOVERY_REQUIRED',
  closeFailed: 'ZENON_FUNDING_INTAKE_HTTP_POST_V1_CLOSE_FAILED',
});

const PHASE = OBJECT_FREEZE({
  NEW: 'NEW',
  RECOVERED: 'RECOVERED',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
  CLOSING: 'CLOSING',
  CLOSED: 'CLOSED',
});

const RECOVERED = OBJECT_FREEZE({ status: 'RECOVERED' });

function dataDescriptor(value, enumerable, writable, configurable) {
  const result = OBJECT_CREATE(null);
  result.value = value;
  result.enumerable = enumerable;
  result.writable = writable;
  result.configurable = configurable;
  return result;
}

function put(target, key, value, enumerable = true) {
  OBJECT_DEFINE_PROPERTY(target, key, dataDescriptor(value, enumerable, false, false));
}

function record(fields) {
  const result = OBJECT_CREATE(null);
  const keys = REFLECT_OWN_KEYS(fields);
  for (let index = 0; index < keys.length; index += 1) {
    put(result, keys[index], fields[keys[index]]);
  }
  return OBJECT_FREEZE(result);
}

function sameDescriptor(left, right) {
  if (left === undefined || right === undefined) return left === right;
  if (
    left.configurable !== right.configurable
    || left.enumerable !== right.enumerable
  ) return false;
  const leftData = OBJECT_HAS_OWN(left, 'value');
  if (leftData !== OBJECT_HAS_OWN(right, 'value')) return false;
  return leftData
    ? left.value === right.value && left.writable === right.writable
    : left.get === right.get && left.set === right.set;
}

function snapshotObjectPrototype() {
  const result = OBJECT_CREATE(null);
  const keys = REFLECT_OWN_KEYS(OBJECT_PROTOTYPE);
  for (let index = 0; index < keys.length; index += 1) {
    put(result, keys[index], OBJECT_FREEZE(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(OBJECT_PROTOTYPE, keys[index]),
    ));
  }
  return OBJECT_FREEZE(result);
}

function sameObjectPrototype() {
  try {
    if (
      OBJECT_PROTOTYPE_PROTOTYPE !== null
      || REFLECT_GET_PROTOTYPE_OF(OBJECT_PROTOTYPE) !== OBJECT_PROTOTYPE_PROTOTYPE
    ) return false;
    const keys = REFLECT_OWN_KEYS(OBJECT_PROTOTYPE);
    const baselineKeys = REFLECT_OWN_KEYS(OBJECT_PROTOTYPE_BASELINE);
    if (keys.length !== baselineKeys.length) return false;
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (
        !OBJECT_HAS_OWN(OBJECT_PROTOTYPE_BASELINE, key)
        || !sameDescriptor(
          OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(OBJECT_PROTOTYPE, key),
          OBJECT_PROTOTYPE_BASELINE[key],
        )
      ) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function runtimeInvariant() {
  try {
    return OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(OBJECT_PROTOTYPE, 'then') === undefined
      && sameObjectPrototype()
      && sameDescriptor(
        OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(PROMISE_PROTOTYPE, 'then'),
        PROMISE_THEN_DESCRIPTOR,
      )
      && sameDescriptor(
        OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(PROMISE_PROTOTYPE, 'constructor'),
        PROMISE_CONSTRUCTOR_DESCRIPTOR,
      )
      && sameDescriptor(
        OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_PROMISE, PROMISE_SPECIES),
        PROMISE_SPECIES_DESCRIPTOR,
      );
  } catch {
    return false;
  }
}

function failure(code) {
  const error = new NATIVE_TYPE_ERROR(code);
  OBJECT_DEFINE_PROPERTY(error, 'code', dataDescriptor(code, true, false, false));
  OBJECT_DEFINE_PROPERTY(
    error,
    'stack',
    dataDescriptor(`TypeError: ${code}`, false, false, false),
  );
  return OBJECT_FREEZE(error);
}

function nativePromiseCapability() {
  let resolve;
  let reject;
  const promise = new NATIVE_PROMISE((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  OBJECT_DEFINE_PROPERTY(
    promise,
    'constructor',
    dataDescriptor(undefined, false, false, false),
  );
  REFLECT_APPLY(PROMISE_THEN, promise, [() => {}, () => {}]);
  return record({ promise: OBJECT_FREEZE(promise), resolve, reject });
}

function nativeRejected(error) {
  const capability = nativePromiseCapability();
  capability.reject(error);
  return capability.promise;
}

function exactNativePromise(value) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || IS_PROXY(value)
      || !IS_PROMISE(value)
      || REFLECT_GET_PROTOTYPE_OF(value) !== PROMISE_PROTOTYPE
    ) return false;
    const names = OBJECT_GET_OWN_PROPERTY_NAMES(value);
    if (names.length > 1 || (names.length === 1 && names[0] !== 'constructor')) return false;
    const ownConstructor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, 'constructor');
    return ownConstructor === undefined || (
      OBJECT_HAS_OWN(ownConstructor, 'value')
      && ownConstructor.value === undefined
      && ownConstructor.enumerable === false
      && ownConstructor.writable === false
    );
  } catch {
    return false;
  }
}

function observeNativePromise(value, onFulfilled, onRejected) {
  if (!exactNativePromise(value)) return false;
  let original;
  try { original = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, 'constructor'); }
  catch { return false; }
  let temporary = false;
  if (original === undefined && !runtimeInvariant()) {
    try {
      if (!OBJECT_IS_EXTENSIBLE(value)) return false;
      OBJECT_DEFINE_PROPERTY(
        value,
        'constructor',
        dataDescriptor(undefined, false, false, true),
      );
      temporary = true;
    } catch {
      return false;
    }
  }
  const fulfilled = result => { try { onFulfilled(result); } catch {} };
  const rejectedValue = error => { try { onRejected(error); } catch {} };
  let bridge;
  try {
    bridge = REFLECT_APPLY(PROMISE_THEN, value, [fulfilled, rejectedValue]);
    if (
      bridge === null
      || typeof bridge !== 'object'
      || IS_PROXY(bridge)
      || !IS_PROMISE(bridge)
      || REFLECT_GET_PROTOTYPE_OF(bridge) !== PROMISE_PROTOTYPE
      || OBJECT_GET_OWN_PROPERTY_NAMES(bridge).length !== 0
    ) return false;
    OBJECT_DEFINE_PROPERTY(
      bridge,
      'constructor',
      dataDescriptor(undefined, false, false, false),
    );
    REFLECT_APPLY(PROMISE_THEN, bridge, [() => {}, () => {}]);
  } catch {
    return false;
  } finally {
    if (temporary) {
      try { REFLECT_APPLY(REFLECT_DELETE_PROPERTY, NATIVE_REFLECT, [value, 'constructor']); }
      catch { return false; }
    }
  }
  return true;
}

function keyAllowed(key, expectedKeys) {
  for (let index = 0; index < expectedKeys.length; index += 1) {
    if (expectedKeys[index] === key) return true;
  }
  return false;
}

function exactDataObject(value, expectedKeys, requireFrozen = false) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || IS_PROXY(value)
      || REFLECT_GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE
      || (requireFrozen && !OBJECT_IS_FROZEN(value))
    ) return null;
    const keys = REFLECT_OWN_KEYS(value);
    if (keys.length !== expectedKeys.length) return null;
    const copy = OBJECT_CREATE(null);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== 'string' || !keyAllowed(key, expectedKeys)) return null;
      const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (!descriptor?.enumerable || !OBJECT_HAS_OWN(descriptor, 'value')) return null;
      copy[key] = descriptor.value;
    }
    return copy;
  } catch {
    return null;
  }
}

function exactFrozenNullRecord(value, expectedKeys) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || IS_PROXY(value)
      || REFLECT_GET_PROTOTYPE_OF(value) !== null
      || !OBJECT_IS_FROZEN(value)
    ) return null;
    const keys = REFLECT_OWN_KEYS(value);
    if (keys.length !== expectedKeys.length) return null;
    const copy = OBJECT_CREATE(null);
    for (let index = 0; index < expectedKeys.length; index += 1) {
      const key = expectedKeys[index];
      if (keys[index] !== key) return null;
      const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (
        descriptor === undefined
        || !OBJECT_HAS_OWN(descriptor, 'value')
        || descriptor.enumerable !== true
        || descriptor.writable !== false
        || descriptor.configurable !== false
      ) return null;
      put(copy, key, descriptor.value);
    }
    return OBJECT_FREEZE(copy);
  } catch {
    return null;
  }
}

function ownDataValue(value, key) {
  try {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return undefined;
    }
    const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    return descriptor?.enumerable === true && OBJECT_HAS_OWN(descriptor, 'value')
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function errorCode(error) {
  const code = ownDataValue(error, 'code');
  return typeof code === 'string' ? code : null;
}

function regexpMatches(expression, value) {
  return REFLECT_APPLY(REGEXP_EXEC, expression, [value]) !== null;
}

function byteLength(value) {
  return REFLECT_APPLY(BUFFER_BYTE_LENGTH, NATIVE_BUFFER, [value, 'utf8']);
}

function prototypeMethod(prototype, name) {
  const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(prototype, name);
  if (
    descriptor === undefined
    || !OBJECT_HAS_OWN(descriptor, 'value')
    || typeof descriptor.value !== 'function'
    || IS_PROXY(descriptor.value)
  ) throw failure(CODE.invalidConfiguration);
  return descriptor.value;
}

const INTAKE_STORE_LOAD_BY_SELECTION_KEY = prototypeMethod(
  ZenonFundingIntakeSqliteStore.prototype,
  'loadBySelectionKey',
);

function exactJsonText(value) {
  const state = { nodes: 0 };
  function visit(input, depth) {
    state.nodes += 1;
    if (state.nodes > 4096 || depth > 32) throw failure(CODE.invalidInput);
    if (input === null) return 'null';
    if (typeof input === 'boolean') return input ? 'true' : 'false';
    if (typeof input === 'string') {
      return REFLECT_APPLY(JSON_STRINGIFY, NATIVE_JSON, [input]);
    }
    if (typeof input === 'number' && NUMBER_IS_FINITE(input)) {
      return REFLECT_APPLY(JSON_STRINGIFY, NATIVE_JSON, [input]);
    }
    if (typeof input !== 'object' || IS_PROXY(input)) throw failure(CODE.invalidInput);
    const array = ARRAY_IS_ARRAY(input);
    if (
      REFLECT_GET_PROTOTYPE_OF(input) !== (array ? ARRAY_PROTOTYPE : OBJECT_PROTOTYPE)
    ) throw failure(CODE.invalidInput);
    const keys = REFLECT_OWN_KEYS(input);
    if (array) {
      const lengthDescriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(input, 'length');
      if (
        lengthDescriptor === undefined
        || !OBJECT_HAS_OWN(lengthDescriptor, 'value')
        || !NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value)
        || lengthDescriptor.value < 0
        || keys.length !== lengthDescriptor.value + 1
      ) throw failure(CODE.invalidInput);
      let output = '[';
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(input, STRING_FROM(index));
        if (
          descriptor === undefined
          || !descriptor.enumerable
          || !OBJECT_HAS_OWN(descriptor, 'value')
        ) throw failure(CODE.invalidInput);
        if (index !== 0) output += ',';
        output += visit(descriptor.value, depth + 1);
      }
      return `${output}]`;
    }
    let output = '{';
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== 'string') throw failure(CODE.invalidInput);
      const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(input, key);
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !OBJECT_HAS_OWN(descriptor, 'value')
      ) throw failure(CODE.invalidInput);
      if (index !== 0) output += ',';
      output += `${REFLECT_APPLY(JSON_STRINGIFY, NATIVE_JSON, [key])}:${visit(
        descriptor.value,
        depth + 1,
      )}`;
    }
    return `${output}}`;
  }
  return visit(value, 0);
}

function captureSelection(value) {
  const selected = exactDataObject(value, SELECTION_KEYS);
  if (
    selected === null
    || typeof selected.offerId !== 'string'
    || !regexpMatches(IDENTIFIER, selected.offerId)
    || REFLECT_APPLY(STRING_INCLUDES, selected.offerId, ['://'])
    || !NUMBER_IS_SAFE_INTEGER(selected.offerVersion)
    || selected.offerVersion <= 0
    || typeof selected.holderId !== 'string'
    || !regexpMatches(IDENTIFIER, selected.holderId)
    || REFLECT_APPLY(STRING_INCLUDES, selected.holderId, ['://'])
    || typeof selected.capabilityCommitment !== 'string'
    || !regexpMatches(COMMITMENT, selected.capabilityCommitment)
  ) throw failure(CODE.invalidConfiguration);
  return OBJECT_FREEZE({
    offerId: selected.offerId,
    offerVersion: selected.offerVersion,
    holderId: selected.holderId,
    capabilityCommitment: selected.capabilityCommitment,
  });
}

function captureResourceUrl(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 4096
    || byteLength(value) > 4096
    || REFLECT_APPLY(STRING_INCLUDES, value, ['#'])
    || REFLECT_APPLY(STRING_INCLUDES, value, ['\r'])
    || REFLECT_APPLY(STRING_INCLUDES, value, ['\n'])
  ) throw failure(CODE.invalidConfiguration);
  let parsed;
  try {
    parsed = new NATIVE_URL(value);
  } catch {
    throw failure(CODE.invalidConfiguration);
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.hostname === ''
    || parsed.search !== ''
    || parsed.hash !== ''
    || parsed.href !== value
  ) throw failure(CODE.invalidConfiguration);
  const requestTarget = `${parsed.pathname}${parsed.search}`;
  if (
    requestTarget === '/'
    || requestTarget.length > 4096
    || byteLength(requestTarget) > 4096
    || !regexpMatches(REQUEST_TARGET, requestTarget)
    || regexpMatches(DOT_SEGMENT, requestTarget)
  ) throw failure(CODE.invalidConfiguration);
  return OBJECT_FREEZE({ resourceUrl: value, requestTarget });
}

function captureOwner(value) {
  const owner = exactDataObject(value, OWNER_KEYS, true);
  if (owner === null) throw failure(CODE.invalidConfiguration);
  for (let index = 0; index < OWNER_KEYS.length; index += 1) {
    const operation = owner[OWNER_KEYS[index]];
    if (typeof operation !== 'function' || IS_PROXY(operation)) {
      throw failure(CODE.invalidConfiguration);
    }
  }
  return owner;
}

function hasBodySlot(value) {
  try {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return true;
    let current = value;
    for (let depth = 0; depth < 16 && current !== null; depth += 1) {
      if (IS_PROXY(current)) return true;
      if (REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(current, 'body') !== undefined) return true;
      current = REFLECT_GET_PROTOTYPE_OF(current);
    }
    return current !== null;
  } catch {
    return true;
  }
}

function headerScan(request) {
  try {
    if (hasBodySlot(request)) return null;
    const rawHeaders = ownDataValue(request, 'rawHeaders');
    if (
      !ARRAY_IS_ARRAY(rawHeaders)
      || IS_PROXY(rawHeaders)
      || REFLECT_GET_PROTOTYPE_OF(rawHeaders) !== ARRAY_PROTOTYPE
    ) return null;
    const lengthDescriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(rawHeaders, 'length');
    if (
      lengthDescriptor === undefined
      || !OBJECT_HAS_OWN(lengthDescriptor, 'value')
      || !NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.value % 2 !== 0
      || lengthDescriptor.value > ZENON_FUNDING_INTAKE_HTTP_POST_V1_MAX_RAW_HEADER_PAIRS * 2
    ) return null;

    let totalBytes = 0;
    let paymentHeader = null;
    let paymentHeaders = 0;
    let framed = false;
    let contentLengthHeaders = 0;
    for (let index = 0; index < lengthDescriptor.value; index += 2) {
      const nameDescriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(rawHeaders, STRING_FROM(index));
      const valueDescriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(rawHeaders, STRING_FROM(index + 1));
      if (
        nameDescriptor === undefined
        || valueDescriptor === undefined
        || !nameDescriptor.enumerable
        || !valueDescriptor.enumerable
        || !OBJECT_HAS_OWN(nameDescriptor, 'value')
        || !OBJECT_HAS_OWN(valueDescriptor, 'value')
      ) return null;
      const name = nameDescriptor.value;
      const headerValue = valueDescriptor.value;
      if (
        typeof name !== 'string'
        || typeof headerValue !== 'string'
        || name.length === 0
        || name.length > ZENON_FUNDING_INTAKE_HTTP_POST_V1_MAX_RAW_HEADER_BYTES
        || headerValue.length > ZENON_FUNDING_INTAKE_HTTP_POST_V1_MAX_RAW_HEADER_BYTES
        || !regexpMatches(TOKEN, name)
        || REFLECT_APPLY(STRING_INCLUDES, headerValue, ['\0'])
        || REFLECT_APPLY(STRING_INCLUDES, headerValue, ['\r'])
        || REFLECT_APPLY(STRING_INCLUDES, headerValue, ['\n'])
      ) return null;
      totalBytes += byteLength(name) + byteLength(headerValue) + 4;
      if (totalBytes > ZENON_FUNDING_INTAKE_HTTP_POST_V1_MAX_RAW_HEADER_BYTES) return null;
      const lowerName = REFLECT_APPLY(STRING_TO_LOWER_CASE, name, []);
      if (lowerName === 'content-length') {
        contentLengthHeaders += 1;
        if (headerValue !== '0') framed = true;
      } else if (
        REFLECT_APPLY(STRING_STARTS_WITH, lowerName, [BODY_HEADER_PREFIX])
        || lowerName === 'transfer-encoding'
        || lowerName === 'trailer'
        || lowerName === 'expect'
        || lowerName === 'te'
        || lowerName === 'upgrade'
      ) framed = true;
      if (lowerName === PAYMENT_SIGNATURE) {
        paymentHeaders += 1;
        paymentHeader = headerValue;
      }
    }
    if (framed || contentLengthHeaders !== 1 || paymentHeaders > 1) return null;
    return OBJECT_FREEZE({ paymentHeader });
  } catch {
    return null;
  }
}

function parsePaymentHeader(value) {
  try {
    if (
      typeof value !== 'string'
      || value.length === 0
      || value.length > ZENON_FUNDING_INTAKE_HTTP_POST_V1_MAX_PAYMENT_SIGNATURE_BYTES
      || byteLength(value) > ZENON_FUNDING_INTAKE_HTTP_POST_V1_MAX_PAYMENT_SIGNATURE_BYTES
      || !regexpMatches(BASE64, value)
    ) return null;
    const payment = decodeB64Json(value, {
      maxDecodedBytes: ZENON_FUNDING_INTAKE_HTTP_POST_V1_MAX_PAYMENT_SIGNATURE_BYTES,
      maxEncodedBytes: ZENON_FUNDING_INTAKE_HTTP_POST_V1_MAX_PAYMENT_SIGNATURE_BYTES,
    });
    validatePaymentPayloadEnvelope(payment);
    const exactText = exactJsonText(payment);
    if (byteLength(exactText) > ZENON_FUNDING_INTAKE_HTTP_POST_V1_MAX_PAYMENT_SIGNATURE_BYTES) {
      return null;
    }
    const encoded = REFLECT_APPLY(BUFFER_TO_STRING,
      REFLECT_APPLY(BUFFER_FROM, NATIVE_BUFFER, [
        exactText,
        'utf8',
      ]), ['base64']);
    return encoded === value ? snapshotZenonFundingIntakeJson(payment) : null;
  } catch {
    return null;
  }
}

function responseDescriptor(statusCode, body, extraName = null, extraValue = null) {
  return record({ statusCode, body, extraName, extraValue });
}

const RESPONSE = OBJECT_FREEZE({
  badRequest: responseDescriptor(400, 'Bad Request'),
  notFound: responseDescriptor(404, 'Not Found'),
  methodNotAllowed: responseDescriptor(405, 'Method Not Allowed', 'Allow', METHOD),
  conflict: responseDescriptor(409, 'Conflict'),
  unavailable: responseDescriptor(503, 'Service Unavailable'),
  bound: responseDescriptor(202, 'BOUND'),
});

function send(response, descriptor) {
  try {
    if (response.destroyed || response.writableEnded) return;
    const body = REFLECT_APPLY(BUFFER_FROM, NATIVE_BUFFER, [descriptor.body, 'utf8']);
    response.statusCode = descriptor.statusCode;
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('Content-Type', TEXT_CONTENT_TYPE);
    response.setHeader('Vary', 'PAYMENT-SIGNATURE');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (descriptor.extraName !== null) {
      response.setHeader(descriptor.extraName, descriptor.extraValue);
    }
    response.setHeader('Content-Length', body.length);
    response.end(body);
  } catch {
    try { response.destroy(); } catch {}
  }
}

function paymentRequiredFrame(value, resourceUrl) {
  try {
    const frame = exactDataObject(value, FRAME_KEYS);
    if (
      frame === null
      || frame.status !== 402
      || frame.body !== 'Payment Required'
      || typeof frame.paymentRequiredHeader !== 'string'
      || frame.paymentRequiredHeader.length === 0
      || frame.paymentRequiredHeader.length > MAX_X402_HEADER_ENCODED_BYTES
      || byteLength(frame.paymentRequiredHeader) > MAX_X402_HEADER_ENCODED_BYTES
      || !regexpMatches(BASE64, frame.paymentRequiredHeader)
    ) return null;
    const paymentRequired = decodeB64Json(frame.paymentRequiredHeader, {
      maxDecodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
      maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES,
    });
    validatePaymentRequired(paymentRequired);
    if (
      paymentRequired.resource.url !== resourceUrl
      || !ARRAY_IS_ARRAY(paymentRequired.accepts)
      || paymentRequired.accepts.length !== 1
    ) return null;
    return OBJECT_FREEZE({
      response: responseDescriptor(402, frame.body, PAYMENT_REQUIRED, frame.paymentRequiredHeader),
      paymentRequired,
    });
  } catch {
    return null;
  }
}

function paymentMatchesFrame(payment, paymentRequired) {
  try {
    return sameResource(payment.resource, paymentRequired.resource)
      && sameRequirements(payment.accepted, paymentRequired.accepts[0])
      && payment.payload.intentDigest === paymentIntentDigest(
        paymentRequired,
        paymentRequired.accepts[0],
      );
  } catch {
    return false;
  }
}

function validBound(value) {
  const result = exactFrozenNullRecord(value, BOUND_KEYS);
  return result !== null
    && result.status === 'BOUND'
    && typeof result.transactionHash === 'string'
    && typeof result.observerRecordKey === 'string'
    && typeof result.observerFileName === 'string';
}

function validRecoveredBoundList(value) {
  try {
    if (
      !ARRAY_IS_ARRAY(value)
      || IS_PROXY(value)
      || REFLECT_GET_PROTOTYPE_OF(value) !== ARRAY_PROTOTYPE
      || !OBJECT_IS_FROZEN(value)
    ) return false;
    const lengthDescriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(value, 'length');
    if (
      lengthDescriptor === undefined
      || !OBJECT_HAS_OWN(lengthDescriptor, 'value')
      || !NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.writable !== false
      || lengthDescriptor.configurable !== false
    ) return false;
    const keys = REFLECT_OWN_KEYS(value);
    if (keys.length !== lengthDescriptor.value + 1 || keys[keys.length - 1] !== 'length') {
      return false;
    }
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const key = STRING_FROM(index);
      if (keys[index] !== key) return false;
      const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (
        descriptor === undefined
        || !OBJECT_HAS_OWN(descriptor, 'value')
        || descriptor.enumerable !== true
        || descriptor.writable !== false
        || descriptor.configurable !== false
        || !validBound(descriptor.value)
      ) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function terminalIntakeFailure(code) {
  return code === 'ZENON_FUNDING_INTAKE_OUTCOME_UNKNOWN'
    || code === 'ZENON_FUNDING_INTAKE_OBSERVER_UNCERTAIN'
    || code === 'ZENON_FUNDING_INTAKE_QUARANTINED'
    || code === 'ZENON_FUNDING_INTAKE_AUTHORITY_MISMATCH';
}

function issueFailureResponse(code) {
  if (
    code === 'ZENON_FUNDING_INTAKE_CONFLICT'
    || code === 'ZENON_FUNDING_INTAKE_ALREADY_BOUND'
    || code === 'ZENON_FUNDING_INTAKE_EXPIRED'
  ) return RESPONSE.conflict;
  return RESPONSE.unavailable;
}

function bindFailureResponse(code) {
  if (
    code === 'ZENON_FUNDING_INTAKE_CONFLICT'
    || code === 'ZENON_FUNDING_INTAKE_EXPIRED'
  ) return RESPONSE.conflict;
  if (code === 'ZENON_FUNDING_INTAKE_REJECTED') return RESPONSE.badRequest;
  return RESPONSE.unavailable;
}

/**
 * Creates an opt-in, listenerless fixed-POST HTTP adapter for one privileged funding
 * selection and one canonical HTTPS resource URL. The caller owns the actual
 * HTTP/TLS parser, both SQLite stores, startup recovery, and all live gates.
 */
export function createZenonFundingIntakeHttpPostV1Adapter(options) {
  if (arguments.length !== 1 || !runtimeInvariant()) {
    throw failure(CODE.invalidConfiguration);
  }
  const configuration = exactDataObject(options, CONFIGURATION_KEYS);
  if (configuration === null) throw failure(CODE.invalidConfiguration);
  const selection = captureSelection(configuration.selection);
  const target = captureResourceUrl(configuration.resourceUrl);

  const intakeOptions = OBJECT_CREATE(null);
  for (let index = 0; index < INTAKE_KEYS.length; index += 1) {
    const key = INTAKE_KEYS[index];
    intakeOptions[key] = configuration[key];
  }
  let owner;
  try {
    if (!runtimeInvariant()) throw failure(CODE.invalidConfiguration);
    owner = captureOwner(createZenonFundingIntake({ ...intakeOptions }));
    if (!runtimeInvariant()) throw failure(CODE.invalidConfiguration);
  } catch {
    throw failure(CODE.invalidConfiguration);
  }
  const ownerIssue = owner.issue;
  const ownerBind = owner.bind;
  const ownerRecoverBound = owner.recoverBound;
  const ownerClose = owner.close;
  let fixedSelectionKey;
  try {
    if (!runtimeInvariant()) throw failure(CODE.invalidConfiguration);
    fixedSelectionKey = deriveZenonFundingIntakeSelectionKey({
      ledgerDomain: configuration.store.ledgerDomain,
      selection,
    });
    if (!runtimeInvariant()) throw failure(CODE.invalidConfiguration);
  } catch {
    throw failure(CODE.invalidConfiguration);
  }

  let phase = PHASE.NEW;
  let activeHandlers = 0;
  let bindingOperation = null;
  let closeCapability = null;
  let closePromise = null;
  let recoveryRequired = false;

  function requireRecovery() {
    recoveryRequired = true;
    if (phase !== PHASE.CLOSING) phase = PHASE.RECOVERY_REQUIRED;
  }

  function latchIfTerminal(code) {
    if (terminalIntakeFailure(code)) requireRecovery();
  }

  const recover = OBJECT_FREEZE((...args) => {
    if (args.length !== 0) throw failure(CODE.invalidInput);
    if (phase === PHASE.RECOVERED) return RECOVERED;
    if (phase === PHASE.CLOSING || phase === PHASE.CLOSED) throw failure(CODE.closed);
    if (phase === PHASE.RECOVERY_REQUIRED) throw failure(CODE.recoveryRequired);
    try {
      if (!runtimeInvariant()) throw failure(CODE.recoveryRequired);
      const recovered = REFLECT_APPLY(ownerRecoverBound, undefined, []);
      if (!runtimeInvariant() || !validRecoveredBoundList(recovered)) {
        requireRecovery();
        throw failure(CODE.recoveryRequired);
      }
      phase = PHASE.RECOVERED;
      return RECOVERED;
    } catch {
      requireRecovery();
      throw failure(CODE.recoveryRequired);
    }
  });

  function loadFixedBoundFrame() {
    try {
      if (!runtimeInvariant()) {
        requireRecovery();
        return null;
      }
      const row = exactDataObject(REFLECT_APPLY(
        INTAKE_STORE_LOAD_BY_SELECTION_KEY,
        configuration.store,
        [fixedSelectionKey],
      ), ROW_KEYS);
      if (!runtimeInvariant()) {
        requireRecovery();
        return null;
      }
      const issue = row === null ? null : ownDataValue(row.issue, 'frame');
      const selectionKey = row === null ? null : ownDataValue(row.issue, 'selectionKey');
      const resourceUrl = row === null ? null : ownDataValue(row.issue, 'resourceUrl');
      if (
        row === null
        || row.status !== 'BOUND'
        || row.binding === null
        || selectionKey !== fixedSelectionKey
        || resourceUrl !== target.resourceUrl
      ) return null;
      return paymentRequiredFrame(issue, target.resourceUrl);
    } catch {
      return null;
    }
  }

  function issueFixed() {
    try {
      if (!runtimeInvariant()) {
        requireRecovery();
        return OBJECT_FREEZE({
          response: RESPONSE.unavailable,
          paymentRequired: null,
          bindable: false,
        });
      }
      const frame = REFLECT_APPLY(ownerIssue, undefined, [{
        selection,
        resourceUrl: target.resourceUrl,
      }]);
      if (!runtimeInvariant()) {
        requireRecovery();
        return OBJECT_FREEZE({
          response: RESPONSE.unavailable,
          paymentRequired: null,
          bindable: false,
        });
      }
      const persisted = paymentRequiredFrame(frame, target.resourceUrl);
      if (persisted === null) {
        requireRecovery();
        return OBJECT_FREEZE({
          response: RESPONSE.unavailable,
          paymentRequired: null,
          bindable: false,
        });
      }
      return OBJECT_FREEZE({
        response: persisted.response,
        paymentRequired: persisted.paymentRequired,
        bindable: true,
      });
    } catch (error) {
      const code = errorCode(error);
      latchIfTerminal(code);
      if (code === 'ZENON_FUNDING_INTAKE_ALREADY_BOUND') {
        const persisted = loadFixedBoundFrame();
        if (persisted !== null) {
          return OBJECT_FREEZE({
            response: RESPONSE.conflict,
            paymentRequired: persisted.paymentRequired,
            bindable: true,
          });
        }
        requireRecovery();
        return OBJECT_FREEZE({
          response: RESPONSE.unavailable,
          paymentRequired: null,
          bindable: false,
        });
      }
      return OBJECT_FREEZE({
        response: issueFailureResponse(code),
        paymentRequired: null,
        bindable: false,
      });
    }
  }

  function settleBinding(record, descriptor) {
    if (bindingOperation === record) bindingOperation = null;
    if (recoveryRequired || !runtimeInvariant()) {
      requireRecovery();
      descriptor = RESPONSE.unavailable;
    }
    record.capability.resolve(descriptor);
  }

  function beginBinding(paymentHeader, payment) {
    if (bindingOperation !== null) {
      return bindingOperation.paymentHeader === paymentHeader
        ? bindingOperation.capability.promise
        : null;
    }
    const capability = nativePromiseCapability();
    const record = { paymentHeader, capability };
    bindingOperation = record;

    let issuance;
    try { issuance = issueFixed(); } catch { issuance = null; }
    if (issuance === null || !issuance.bindable || issuance.paymentRequired === null) {
      settleBinding(record, issuance?.response ?? RESPONSE.unavailable);
      return capability.promise;
    }
    if (!paymentMatchesFrame(payment, issuance.paymentRequired)) {
      settleBinding(record, RESPONSE.badRequest);
      return capability.promise;
    }

    if (!runtimeInvariant()) {
      requireRecovery();
      settleBinding(record, RESPONSE.unavailable);
      return capability.promise;
    }

    let bindPromise;
    try {
      bindPromise = REFLECT_APPLY(ownerBind, undefined, [payment]);
      const observed = observeNativePromise(bindPromise,
        value => {
          if (!validBound(value)) {
            requireRecovery();
            settleBinding(record, RESPONSE.unavailable);
            return;
          }
          settleBinding(record, RESPONSE.bound);
        },
        error => {
          const code = errorCode(error);
          latchIfTerminal(code);
          settleBinding(record, bindFailureResponse(code));
        });
      bindPromise = null;
      if (!observed) {
        requireRecovery();
        settleBinding(record, RESPONSE.unavailable);
        return capability.promise;
      }
      if (!runtimeInvariant()) requireRecovery();
    } catch {
      bindPromise = null;
      requireRecovery();
      settleBinding(record, RESPONSE.unavailable);
    }
    return capability.promise;
  }

  function finishClose() {
    if (closeCapability === null || activeHandlers !== 0 || bindingOperation !== null) return;
    const capability = closeCapability;
    closeCapability = null;
    try {
      if (!runtimeInvariant()) requireRecovery();
      const closeResult = REFLECT_APPLY(ownerClose, undefined, []);
      if (closeResult !== undefined || !runtimeInvariant()) requireRecovery();
      if (recoveryRequired) {
        phase = PHASE.RECOVERY_REQUIRED;
        capability.reject(failure(CODE.recoveryRequired));
      } else {
        if (!runtimeInvariant()) throw failure(CODE.closeFailed);
        phase = PHASE.CLOSED;
        capability.resolve(undefined);
      }
    } catch {
      requireRecovery();
      phase = PHASE.RECOVERY_REQUIRED;
      closePromise = null;
      capability.reject(failure(CODE.closeFailed));
    }
  }

  const handle = OBJECT_FREEZE(function zenonFundingIntakeHttpPostV1Handle(
    request,
    response,
    ...extra
  ) {
    const capability = nativePromiseCapability();
    function finish(descriptor) {
      if (recoveryRequired || !runtimeInvariant()) {
        requireRecovery();
        descriptor = RESPONSE.unavailable;
      }
      send(response, descriptor);
      if (!runtimeInvariant()) requireRecovery();
      activeHandlers -= 1;
      finishClose();
      capability.resolve(undefined);
    }
    if (extra.length !== 0 || phase !== PHASE.RECOVERED || !runtimeInvariant()) {
      if (phase === PHASE.RECOVERED && !runtimeInvariant()) requireRecovery();
      send(response, RESPONSE.unavailable);
      capability.resolve(undefined);
      return capability.promise;
    }
    activeHandlers += 1;
    let descriptor = RESPONSE.unavailable;
    try {
      const method = ownDataValue(request, 'method');
      const requestTarget = ownDataValue(request, 'url');
      const headers = headerScan(request);
      if (
        typeof method !== 'string'
        || typeof requestTarget !== 'string'
        || requestTarget.length > 4096
        || byteLength(requestTarget) > 4096
        || headers === null
      ) {
        descriptor = RESPONSE.badRequest;
      } else if (requestTarget !== target.requestTarget) {
        descriptor = RESPONSE.notFound;
      } else if (method !== METHOD) {
        descriptor = RESPONSE.methodNotAllowed;
      } else if (headers.paymentHeader === null) {
        descriptor = bindingOperation === null ? issueFixed().response : RESPONSE.conflict;
      } else {
        const payment = parsePaymentHeader(headers.paymentHeader);
        if (payment === null) {
          descriptor = RESPONSE.badRequest;
        } else {
          const pending = beginBinding(headers.paymentHeader, payment);
          if (pending === null) {
            descriptor = RESPONSE.conflict;
          } else {
            try {
              REFLECT_APPLY(PROMISE_THEN, pending, [
                value => finish(value),
                () => finish(RESPONSE.unavailable),
              ]);
              return capability.promise;
            } catch {
              descriptor = RESPONSE.unavailable;
            }
          }
        }
      }
    } catch {
      descriptor = RESPONSE.unavailable;
    }
    finish(descriptor);
    return capability.promise;
  });

  const close = OBJECT_FREEZE((...args) => {
    if (args.length !== 0) return nativeRejected(failure(CODE.invalidInput));
    if (phase === PHASE.CLOSED) return closePromise;
    if (closePromise !== null) return closePromise;
    if (phase === PHASE.RECOVERY_REQUIRED) recoveryRequired = true;
    closeCapability = nativePromiseCapability();
    closePromise = closeCapability.promise;
    phase = PHASE.CLOSING;
    finishClose();
    return closePromise;
  });

  return OBJECT_FREEZE({ recover, handle, close });
}
