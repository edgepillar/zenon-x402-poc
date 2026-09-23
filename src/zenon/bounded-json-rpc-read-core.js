import { types as utilTypes } from 'node:util';

// Internal protocol core for separately closed read grammars. Callers of this
// module are trusted static adapters: each supplies its own exact request
// encoder, while this core alone owns request IDs, Promise settlement and the
// bounded JSON-RPC result-envelope scanner. It owns no endpoint, timer, socket,
// retry, persistence, wallet, signer, publication or authorization capability.

const freeze = Object.freeze;
const create = Object.create;
const defineProperty = Object.defineProperty;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const getOwnPropertyNames = Object.getOwnPropertyNames;
const getPrototypeOf = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys;
const apply = Reflect.apply;
const hasOwn = Object.hasOwn;
const isFrozen = Object.isFrozen;
const isSafeInteger = Number.isSafeInteger;
const toString = String;
const objectPrototype = Object.prototype;
const functionPrototype = Function.prototype;
const isProxy = utilTypes.isProxy;
const isPromise = utilTypes.isPromise;
const NativePromise = Promise;
const promisePrototype = Promise.prototype;
const promiseThen = Promise.prototype.then;
const promiseSpecies = Symbol.species;
const constructorDescriptor = getOwnPropertyDescriptor(promisePrototype, 'constructor');
const speciesDescriptor = getOwnPropertyDescriptor(NativePromise, promiseSpecies);
const initialObjectThenDescriptor = getOwnPropertyDescriptor(objectPrototype, 'then');
const TypeErrorConstructor = TypeError;
const ErrorConstructor = Error;
const charCodeAt = Function.call.bind(String.prototype.charCodeAt);
const slice = Function.call.bind(String.prototype.slice);
const fromCharCode = String.fromCharCode;
const initialCanonicalStructure = canonicalPromiseStructure();

const INVALID = Symbol('invalid bounded JSON-RPC read core');
const MAX_REQUEST_ID = 4294967295;
const MAX_REQUEST_BYTES = 1024;
const MAX_METHOD_BYTES = 128;
// Enforce the 1 MiB raw result limit here as well as downstream. Separately
// bounded envelope overhead cannot enlarge a returned result slice.
const MAX_RESULT_BYTES = 1048576;
const MAX_RESPONSE_BYTES = MAX_RESULT_BYTES + 4096;
const MAX_DEPTH = 17;
const MAX_VALUES = 16384 + 3;
const MAX_CONTAINERS = 4096 + 1;
const MAX_MEMBERS = 4096 + 3;
const MAX_STRING_BYTES = 65536;
const MAX_KEY_BYTES = 128;
const OPTION_FIELDS = freeze(['exchange']);
const ENCODED_FIELDS = freeze(['method', 'params']);
const DYNAMIC_PLASMA = 'dynamic_plasma';
const ZENON_FUNDING = 'zenon_funding';

/**
 * Internal constructor used only by closed static adapters. adapterOptions is
 * the adapter's public one-field { exchange } input; publicArgumentCount is
 * captured before this handoff. encodeRequest must return one frozen
 * null-prototype { method, params } where params is already reduced to an
 * exact ASCII JSON-array grammar. No public caller supplies that encoder.
 */
export function createBoundedJsonRpcReadTransportCore(
  adapterOptions,
  publicArgumentCount,
  encodeRequest,
  maximumRequests,
  profileName,
) {
  let exchange;
  let profile;
  try {
    profile = selectProfile(profileName);
    assertInvariant();
    if (arguments.length !== 5 || publicArgumentCount !== 1) invalid();
    const fields = exactObject(adapterOptions, OPTION_FIELDS, false);
    exchange = fields.exchange;
    if (typeof exchange !== 'function' || isProxy(exchange)) invalid();
    if (typeof encodeRequest !== 'function' || isProxy(encodeRequest)
        || getPrototypeOf(encodeRequest) !== functionPrototype) invalid();
    if (!isSafeInteger(maximumRequests) || maximumRequests < 1
        || maximumRequests > MAX_REQUEST_ID) invalid();
  } catch {
    throw fixedError(profile ?? internalProfile(), 'configuration_rejected');
  }

  // Immutable, prehandled failures remain safe to return even when a later
  // runtime drift prevents attaching any new native reaction. Callers cannot
  // decorate a cached promise and contaminate a subsequent admission failure.
  const busy = prehandledFailure(profile, 'busy');
  const exhausted = prehandledFailure(profile, 'exhausted');
  const inputRejected = prehandledFailure(profile, 'input_rejected');
  const unavailable = prehandledFailure(profile, 'unavailable');
  let nextId = 1;
  let active = false;
  const callRead = freeze(function callRead(request) {
    if (active) return busy;
    if (nextId > maximumRequests) return exhausted;
    if (!invariantHolds()) return unavailable;
    let snapshot;
    try {
      if (arguments.length !== 1) invalid();
      snapshot = encodedRequest(apply(encodeRequest, undefined, [request]));
    } catch {
      return inputRejected;
    }
    const id = toString(nextId);
    // The trusted closed adapter reduced every interpolated string to a fixed
    // ASCII grammar. No caller serialization hook or result-number conversion
    // runs here.
    const body = `{"jsonrpc":"2.0","id":${id},"method":"${snapshot.method}","params":${snapshot.params}}`;
    if (body.length > MAX_REQUEST_BYTES) return inputRejected;
    const outward = prehandledPending();
    active = true;

    function complete(settled) {
      try {
        assertInvariant();
        if (!settled.accepted) invalid();
        const result = resultSlice(settled.text, id);
        assertInvariant();
        outward.resolve(result);
      } catch {
        outward.reject(fixedError(profile, 'unavailable'));
      } finally {
        active = false;
      }
      // Every internal reaction returns only a primitive or a null-prototype
      // settlement; no ordinary result object can undergo then assimilation.
    }

    function fail() {
      active = false;
      outward.reject(fixedError(profile, 'unavailable'));
    }

    try {
      nextId += 1;
      const pending = apply(exchange, undefined, [body]);
      // Validate Promise mechanics and drain first. Acceptance-only drift
      // must not strand a rejection whose native mechanics remain trusted.
      const bridge = settle(pending);
      apply(promiseThen, bridge, [complete, fail]);
    } catch {
      fail();
    }
    return outward.promise;
  });
  return freeze({ callRead });
}

function selectProfile(value) {
  if (value === DYNAMIC_PLASMA) {
    return freeze({
      label: 'Dynamic Plasma JSON-RPC read transport',
      prefix: 'dynamic_plasma_json_rpc_read_transport_',
    });
  }
  if (value === ZENON_FUNDING) {
    return freeze({
      label: 'Zenon funding JSON-RPC read transport',
      prefix: 'zenon_funding_json_rpc_read_transport_',
    });
  }
  invalid();
}

function internalProfile() {
  return freeze({
    label: 'Bounded JSON-RPC read transport core',
    prefix: 'bounded_json_rpc_read_transport_core_',
  });
}

function encodedRequest(value) {
  if (value === null || typeof value !== 'object' || isProxy(value)
      || getPrototypeOf(value) !== null || !isFrozen(value)
      || ownKeys(value).length !== ENCODED_FIELDS.length) invalid();
  const result = create(null);
  for (let index = 0; index < ENCODED_FIELDS.length; index += 1) {
    const key = ENCODED_FIELDS[index];
    const item = getOwnPropertyDescriptor(value, key);
    if (item === undefined || !hasOwn(item, 'value') || item.enumerable !== true
        || item.writable !== false || item.configurable !== false) invalid();
    put(result, key, item.value);
  }
  if (typeof result.method !== 'string' || result.method.length < 1
      || result.method.length > MAX_METHOD_BYTES) invalid();
  for (let index = 0; index < result.method.length; index += 1) {
    const code = charCodeAt(result.method, index);
    if (!((code >= 48 && code <= 57) || (code >= 65 && code <= 90)
        || (code >= 97 && code <= 122) || code === 46 || code === 95)) invalid();
  }
  if (typeof result.params !== 'string' || result.params.length < 2
      || result.params.length > MAX_REQUEST_BYTES || result.params[0] !== '['
      || result.params[result.params.length - 1] !== ']') invalid();
  for (let index = 0; index < result.params.length; index += 1) {
    const code = charCodeAt(result.params, index);
    if (code < 32 || code > 126) invalid();
  }
  return freeze(result);
}

function discard() {}

function prehandledPending() {
  let resolve;
  let reject;
  const promise = new NativePromise((accept, fail) => { resolve = accept; reject = fail; });
  // This handler is attached while invariants are trusted, before any exchange
  // capability can run. Its derived promise always fulfills with undefined.
  apply(promiseThen, promise, [discard, discard]);
  const result = create(null);
  put(result, 'promise', promise);
  put(result, 'resolve', resolve);
  put(result, 'reject', reject);
  return freeze(result);
}

function prehandledFailure(profile, kind) {
  const pending = prehandledPending();
  pending.reject(fixedError(profile, kind));
  return freeze(pending.promise);
}

function settle(pending) {
  assertDrainablePromise(pending);
  // Native reactions inspect constructor, never an instance then getter or
  // own symbols. Attach before rejecting other string decoration so a rejected
  // nonconforming promise cannot become an unhandled rejection we could drain.
  const bridge = apply(promiseThen, pending, [fulfilled, rejected]);
  assertDrainablePromise(bridge);
  assertInvariant();
  if (getOwnPropertyNames(pending).length !== 0 || getOwnPropertyNames(bridge).length !== 0) invalid();
  return bridge;
}

function fulfilled(value) {
  const result = create(null);
  const accepted = typeof value === 'string';
  put(result, 'accepted', accepted);
  put(result, 'text', accepted ? value : null);
  return freeze(result);
}

function rejected() {
  return fulfilled(null);
}

function assertDrainablePromise(value) {
  // Object.prototype.then does not participate in this captured native then
  // path: both reactions return owned null-prototype records. Constructor and
  // species drift still prevents draining and remains exchange-owner handled.
  if (!promiseMechanicsHold()) invalid();
  if (typeof value !== 'object' || value === null || isProxy(value) || !isPromise(value)
      || getPrototypeOf(value) !== promisePrototype) invalid();
  const constructor = getOwnPropertyDescriptor(value, 'constructor');
  if (constructor !== undefined
      && (!hasOwn(constructor, 'value') || constructor.value !== NativePromise)) invalid();
}

function canonicalData(descriptor, value, writable) {
  return descriptor !== undefined && ownKeys(descriptor).length === 4
    && hasOwn(descriptor, 'value') && descriptor.value === value
    && descriptor.writable === writable && descriptor.enumerable === false
    && descriptor.configurable === true;
}

function canonicalPromiseStructure() {
  const constructor = getOwnPropertyDescriptor(promisePrototype, 'constructor');
  const species = getOwnPropertyDescriptor(NativePromise, promiseSpecies);
  if (!canonicalData(constructor, NativePromise, true) || species === undefined
      || ownKeys(species).length !== 4 || !hasOwn(species, 'get') || !hasOwn(species, 'set')
      || species.set !== undefined || species.enumerable !== false
      || species.configurable !== true) return false;
  const getter = species.get;
  if (typeof getter !== 'function' || isProxy(getter)
      || getPrototypeOf(getter) !== functionPrototype || ownKeys(getter).length !== 2) return false;
  return canonicalData(getOwnPropertyDescriptor(getter, 'name'), 'get [Symbol.species]', false)
    && canonicalData(getOwnPropertyDescriptor(getter, 'length'), 0, false);
}

function promiseMechanicsHold() {
  return initialCanonicalStructure && canonicalPromiseStructure()
    && sameDescriptor(getOwnPropertyDescriptor(promisePrototype, 'constructor'), constructorDescriptor)
    && sameDescriptor(getOwnPropertyDescriptor(NativePromise, promiseSpecies), speciesDescriptor);
}

function invariantHolds() {
  return initialObjectThenDescriptor === undefined
    && getOwnPropertyDescriptor(objectPrototype, 'then') === undefined
    && promiseMechanicsHold();
}

function assertInvariant() {
  if (!invariantHolds()) invalid();
}

function sameDescriptor(actual, expected) {
  if (actual === undefined || expected === undefined) return false;
  const keys = ownKeys(expected);
  if (ownKeys(actual).length !== keys.length) return false;
  for (let index = 0; index < keys.length; index += 1) {
    if (!hasOwn(actual, keys[index]) || actual[keys[index]] !== expected[keys[index]]) return false;
  }
  return true;
}

function exactObject(value, fields, requireFrozen = true) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || getPrototypeOf(value) !== objectPrototype || ownKeys(value).length !== fields.length
      || (requireFrozen && !isFrozen(value))) invalid();
  const result = create(null);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const descriptor = getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined || descriptor.enumerable !== true
        || !hasOwn(descriptor, 'value')) invalid();
    put(result, field, descriptor.value);
  }
  return result;
}

function put(object, key, value, enumerable = true) {
  const descriptor = create(null);
  descriptor.value = value;
  descriptor.enumerable = enumerable;
  descriptor.writable = false;
  descriptor.configurable = false;
  defineProperty(object, key, descriptor);
}

function utf8Length(text, maximum) {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = charCodeAt(text, index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const low = charCodeAt(text, index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) invalid();
      index += 1;
      bytes += 4;
    } else {
      if (code >= 0xdc00 && code <= 0xdfff) invalid();
      bytes += 3;
    }
    if (bytes > maximum) invalid();
  }
  return bytes;
}

function resultSlice(text, expectedId) {
  utf8Length(text, MAX_RESPONSE_BYTES);
  let cursor = 0;
  let values = 0;
  let containers = 0;
  let members = 0;
  let resultStart = -1;
  let resultEnd = -1;
  let versionSeen = false;
  let idSeen = false;

  function whitespace() {
    while (cursor < text.length && isWhitespace(charCodeAt(text, cursor))) cursor += 1;
  }

  function countValue() {
    values += 1;
    if (values > MAX_VALUES) invalid();
  }

  function countMember() {
    members += 1;
    if (members > MAX_MEMBERS) invalid();
  }

  function unicodeUnit() {
    let value = 0;
    for (let index = 0; index < 4; index += 1) {
      const code = charCodeAt(text, cursor++);
      let digit;
      if (code >= 48 && code <= 57) digit = code - 48;
      else if (code >= 65 && code <= 70) digit = code - 55;
      else if (code >= 97 && code <= 102) digit = code - 87;
      else invalid();
      value = value * 16 + digit;
    }
    return value;
  }

  function stringValue(capture, maximum = MAX_STRING_BYTES) {
    if (text[cursor++] !== '"') invalid();
    let decoded = '';
    let bytes = 0;
    while (cursor < text.length) {
      let code = charCodeAt(text, cursor++);
      if (code === 34) return decoded;
      let escaped = false;
      if (code === 92) {
        escaped = true;
        const escape = text[cursor++];
        if (escape === 'u') code = unicodeUnit();
        else if (escape === '"') code = 34;
        else if (escape === '\\') code = 92;
        else if (escape === '/') code = 47;
        else if (escape === 'b') code = 8;
        else if (escape === 'f') code = 12;
        else if (escape === 'n') code = 10;
        else if (escape === 'r') code = 13;
        else if (escape === 't') code = 9;
        else invalid();
      } else if (code < 32) invalid();
      if (code >= 0xd800 && code <= 0xdbff) {
        let low;
        if (escaped) {
          if (text[cursor++] !== '\\' || text[cursor++] !== 'u') invalid();
          low = unicodeUnit();
        } else low = charCodeAt(text, cursor++);
        if (!(low >= 0xdc00 && low <= 0xdfff)) invalid();
        bytes += 4;
        if (capture) decoded += fromCharCode(code, low);
      } else {
        if (code >= 0xdc00 && code <= 0xdfff) invalid();
        bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
        if (capture) decoded += fromCharCode(code);
      }
      if (bytes > maximum) invalid();
    }
    invalid();
  }

  function digits() {
    const start = cursor;
    while (isDigit(charCodeAt(text, cursor))) cursor += 1;
    if (cursor === start) invalid();
  }

  function number() {
    if (text[cursor] === '-') cursor += 1;
    if (text[cursor] === '0') {
      cursor += 1;
      if (isDigit(charCodeAt(text, cursor))) invalid();
    } else {
      if (!(charCodeAt(text, cursor) >= 49 && charCodeAt(text, cursor) <= 57)) invalid();
      digits();
    }
    if (text[cursor] === '.') { cursor += 1; digits(); }
    if (text[cursor] === 'e' || text[cursor] === 'E') {
      cursor += 1;
      if (text[cursor] === '+' || text[cursor] === '-') cursor += 1;
      digits();
    }
    if (cursor < text.length && !isDelimiter(charCodeAt(text, cursor))) invalid();
  }

  function value(depth) {
    whitespace();
    countValue();
    const character = text[cursor];
    if (character === '"') { stringValue(false); return 'string'; }
    if (character === '-' || isDigit(charCodeAt(text, cursor))) { number(); return 'number'; }
    if (character === 't' && slice(text, cursor, cursor + 4) === 'true') { cursor += 4; return 'boolean'; }
    if (character === 'f' && slice(text, cursor, cursor + 5) === 'false') { cursor += 5; return 'boolean'; }
    if (character === 'n' && slice(text, cursor, cursor + 4) === 'null') { cursor += 4; return 'null'; }
    if (character !== '{' && character !== '[') invalid();
    container(depth, false);
    return character === '{' ? 'object' : 'array';
  }

  function container(depth, envelope) {
    containers += 1;
    if (depth >= MAX_DEPTH || containers > MAX_CONTAINERS) invalid();
    const object = text[cursor++] === '{';
    if (envelope && !object) invalid();
    const seen = object ? create(null) : null;
    const closing = object ? '}' : ']';
    whitespace();
    if (text[cursor] === closing) { cursor += 1; return; }
    while (cursor < text.length) {
      countMember();
      whitespace();
      let key;
      if (object) {
        key = stringValue(true, MAX_KEY_BYTES);
        if (key === '__proto__' || key === 'constructor' || key === 'prototype'
            || hasOwn(seen, key)) invalid();
        put(seen, key, true);
        if (envelope && key !== 'jsonrpc' && key !== 'id' && key !== 'result') invalid();
        whitespace();
        if (text[cursor++] !== ':') invalid();
      }
      whitespace();
      const start = cursor;
      if (envelope && key === 'jsonrpc') {
        countValue();
        if (stringValue(true) !== '2.0') invalid();
        versionSeen = true;
      } else {
        const kind = value(depth + 1);
        if (envelope && key === 'id') {
          if (kind !== 'number' || slice(text, start, cursor) !== expectedId) invalid();
          idSeen = true;
        } else if (envelope && key === 'result') {
          resultStart = start;
          resultEnd = cursor;
        }
      }
      whitespace();
      if (text[cursor] === closing) { cursor += 1; return; }
      if (text[cursor++] !== ',') invalid();
    }
    invalid();
  }

  whitespace();
  if (text[cursor] !== '{') invalid();
  countValue();
  container(0, true);
  whitespace();
  if (cursor !== text.length || !versionSeen || !idSeen || resultStart === -1) invalid();
  const result = slice(text, resultStart, resultEnd);
  utf8Length(result, MAX_RESULT_BYTES);
  return result;
}

function isWhitespace(code) {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

function isDigit(code) {
  return code >= 48 && code <= 57;
}

function isDelimiter(code) {
  return isWhitespace(code) || code === 44 || code === 93 || code === 125;
}

function fixedError(profile, kind) {
  const typed = kind === 'configuration_rejected' || kind === 'input_rejected';
  let suffix;
  if (kind === 'configuration_rejected') suffix = 'configuration rejected';
  else if (kind === 'input_rejected') suffix = 'input rejected';
  else if (kind === 'busy') suffix = 'busy';
  else if (kind === 'exhausted') suffix = 'exhausted';
  else suffix = 'unavailable';
  const message = `${profile.label} ${suffix}`;
  const error = typed ? new TypeErrorConstructor(message) : new ErrorConstructor(message);
  const descriptor = create(null);
  descriptor.value = `${typed ? 'TypeError' : 'Error'}: ${message}`;
  descriptor.enumerable = false;
  descriptor.writable = false;
  descriptor.configurable = false;
  defineProperty(error, 'stack', descriptor);
  put(error, 'code', `${profile.prefix}${kind}`);
  return freeze(error);
}

function invalid() {
  throw INVALID;
}
