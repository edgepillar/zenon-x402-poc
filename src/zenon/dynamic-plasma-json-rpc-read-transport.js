import { types as utilTypes } from 'node:util';

// Default-off protocol boundary for the observation collector. Use only while
// UNSIGNED: the collector/caller owns that gate because its exact read-request
// schema has no phase field. This adapter grants no signing authorization.
// The injected exchange owns endpoint choice, authentication, connection
// lifecycle, bounded timeout/cancellation, and terminal cleanup.
//
// TRANSPORT_MUST_PREHANDLE_REJECTION when a returned value has unsafe promise
// mechanics (proxy, foreign/subclass prototype, constructor or species). Only
// an exact native promise with an absent or native-data own constructor can be
// drained safely. Decoration still rejects the call after safe drainage.
// Inherited-then-only drift blocks acceptance, not an otherwise safe drain.
// Adapter-owned outward promises are prehandled before exchange execution.
// Intrinsics are trusted at module evaluation: canonical initial structure and
// later descriptor/function-identity drift are checked without accessor reads.
// A same-shape replacement made before evaluation is outside this boundary.

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
const isArray = Array.isArray;
const isSafeInteger = Number.isSafeInteger;
const sameValue = Object.is;
const toString = String;
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
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
const indexOf = Function.call.bind(String.prototype.indexOf);
const fromCharCode = String.fromCharCode;
const initialCanonicalStructure = canonicalPromiseStructure();

const INVALID = Symbol('invalid read protocol');
const MAX_REQUEST_ID = 4294967295;
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
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = freeze([0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]);
const OPTION_FIELDS = freeze(['exchange']);
const REQUEST_FIELDS = freeze(['method', 'params']);
const QUOTE_FIELDS = freeze(['address', 'blockType', 'toAddress', 'data']);
const FRONTIER = 'ledger.getFrontierMomentum';
const HEIGHT = 'ledger.getMomentumsByHeight';
const SPORK = 'embedded.spork.getAll';
const VARIABLES = 'embedded.plasma.getVariables';
const QUOTE = 'embedded.plasma.getRequiredPoWForAccountBlock';

export function createDynamicPlasmaJsonRpcReadTransport(options) {
  let exchange;
  try {
    assertInvariant();
    if (arguments.length !== 1) invalid();
    const fields = exactObject(options, OPTION_FIELDS, false);
    exchange = fields.exchange;
    if (typeof exchange !== 'function' || isProxy(exchange)) invalid();
  } catch {
    throw fixedError('configuration_rejected');
  }

  // Immutable, prehandled failures remain safe to return even when a later
  // runtime drift prevents attaching any new native reaction. Callers cannot
  // decorate a cached promise and contaminate a subsequent admission failure.
  const busy = prehandledFailure('busy');
  const exhausted = prehandledFailure('exhausted');
  const inputRejected = prehandledFailure('input_rejected');
  const unavailable = prehandledFailure('unavailable');
  let nextId = 1;
  let active = false;
  const callRead = freeze(function callRead(request) {
    if (active) return busy;
    if (nextId > MAX_REQUEST_ID) return exhausted;
    if (!invariantHolds()) return unavailable;
    let snapshot;
    try {
      if (arguments.length !== 1) invalid();
      snapshot = snapshotRequest(request);
    } catch {
      return inputRejected;
    }
    const id = toString(nextId);
    // All interpolated strings were reduced to fixed ASCII grammars. No
    // caller serialization hooks or ordinary result-number conversions run.
    const body = `{"jsonrpc":"2.0","id":${id},"method":"${snapshot.method}","params":${snapshot.params}}`;
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
        outward.reject(fixedError('unavailable'));
      } finally {
        active = false;
      }
      // Every internal reaction returns only a primitive or a null-prototype
      // settlement; no ordinary result object can undergo then assimilation.
    }

    function fail() {
      active = false;
      outward.reject(fixedError('unavailable'));
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

function prehandledFailure(kind) {
  const pending = prehandledPending();
  pending.reject(fixedError(kind));
  return freeze(pending.promise);
}

function snapshotRequest(request) {
  const fields = exactObject(request, REQUEST_FIELDS);
  const method = fields.method;
  let params;
  if (method === FRONTIER || method === VARIABLES) {
    exactArray(fields.params, 0);
    params = '[]';
  } else if (method === HEIGHT) {
    const items = exactArray(fields.params, 2);
    if (items[0] !== 2 || items[1] !== 1) invalid();
    params = '[2,1]';
  } else if (method === SPORK) {
    const items = exactArray(fields.params, 2);
    if (!isSafeInteger(items[0]) || sameValue(items[0], -0) || items[0] < 0 || items[0] > 7 || items[1] !== 128) invalid();
    params = `[${toString(items[0])},128]`;
  } else if (method === QUOTE) {
    const items = exactArray(fields.params, 1);
    const quote = exactObject(items[0], QUOTE_FIELDS);
    address(quote.address);
    address(quote.toAddress);
    if (quote.blockType !== 2) invalid();
    base64Data(quote.data);
    params = `[{"address":"${quote.address}","blockType":2,"toAddress":"${quote.toAddress}","data":"${quote.data}"}]`;
  } else invalid();
  const result = create(null);
  put(result, 'method', method);
  put(result, 'params', params);
  return freeze(result);
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
  if (typeof value !== 'object' || value === null || isProxy(value) || !isPromise(value) ||
      getPrototypeOf(value) !== promisePrototype) invalid();
  const constructor = getOwnPropertyDescriptor(value, 'constructor');
  if (constructor !== undefined && (!hasOwn(constructor, 'value') || constructor.value !== NativePromise)) invalid();
}

function canonicalData(descriptor, value, writable) {
  return descriptor !== undefined && ownKeys(descriptor).length === 4 &&
    hasOwn(descriptor, 'value') && descriptor.value === value &&
    descriptor.writable === writable && descriptor.enumerable === false && descriptor.configurable === true;
}

function canonicalPromiseStructure() {
  const constructor = getOwnPropertyDescriptor(promisePrototype, 'constructor');
  const species = getOwnPropertyDescriptor(NativePromise, promiseSpecies);
  if (!canonicalData(constructor, NativePromise, true) || species === undefined ||
      ownKeys(species).length !== 4 || !hasOwn(species, 'get') || !hasOwn(species, 'set') ||
      species.set !== undefined || species.enumerable !== false || species.configurable !== true) return false;
  const getter = species.get;
  if (typeof getter !== 'function' || isProxy(getter) || getPrototypeOf(getter) !== functionPrototype ||
      ownKeys(getter).length !== 2) return false;
  return canonicalData(getOwnPropertyDescriptor(getter, 'name'), 'get [Symbol.species]', false) &&
    canonicalData(getOwnPropertyDescriptor(getter, 'length'), 0, false);
}

function promiseMechanicsHold() {
  return initialCanonicalStructure && canonicalPromiseStructure() &&
    sameDescriptor(getOwnPropertyDescriptor(promisePrototype, 'constructor'), constructorDescriptor) &&
    sameDescriptor(getOwnPropertyDescriptor(NativePromise, promiseSpecies), speciesDescriptor);
}

function invariantHolds() {
  return initialObjectThenDescriptor === undefined &&
    getOwnPropertyDescriptor(objectPrototype, 'then') === undefined && promiseMechanicsHold();
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
  if (typeof value !== 'object' || value === null || isProxy(value) ||
      getPrototypeOf(value) !== objectPrototype || ownKeys(value).length !== fields.length ||
      (requireFrozen && !isFrozen(value))) invalid();
  const result = create(null);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const descriptor = getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined || descriptor.enumerable !== true || !hasOwn(descriptor, 'value')) invalid();
    put(result, field, descriptor.value);
  }
  return result;
}

function exactArray(value, length) {
  if (typeof value !== 'object' || value === null || isProxy(value) || !isArray(value) ||
      getPrototypeOf(value) !== arrayPrototype || !isFrozen(value)) invalid();
  const descriptor = getOwnPropertyDescriptor(value, 'length');
  if (descriptor === undefined || !hasOwn(descriptor, 'value') || descriptor.value !== length ||
      descriptor.enumerable !== false || ownKeys(value).length !== length + 1) invalid();
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const item = getOwnPropertyDescriptor(value, toString(index));
    if (item === undefined || item.enumerable !== true || !hasOwn(item, 'value')) invalid();
    put(result, toString(index), item.value);
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

function append(array, value) {
  put(array, toString(array.length), value);
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

function base64Data(value) {
  if (typeof value !== 'string' || value.length !== 44 || value[43] !== '=') invalid();
  const bytes = [];
  let accumulator = 0;
  let bits = 0;
  for (let index = 0; index < 43; index += 1) {
    const word = indexOf(BASE64, value[index]);
    if (word < 0) invalid();
    accumulator = (accumulator << 6) | word;
    bits += 6;
    if (bits >= 8) { bits -= 8; append(bytes, (accumulator >>> bits) & 255); }
  }
  if (bytes.length !== 32 || bits !== 2 || (accumulator & 3) !== 0) invalid();
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    encoded += BASE64[first >>> 2] + BASE64[((first & 3) << 4) | (second >>> 4)];
    encoded += BASE64[((second & 15) << 2) | (third >>> 6)];
    encoded += index + 2 < bytes.length ? BASE64[third & 63] : '=';
  }
  if (encoded !== value) invalid();
}

function polymodStep(checksum, word) {
  const top = checksum >>> 25;
  let result = ((checksum & 0x1ffffff) << 5) ^ word;
  for (let index = 0; index < 5; index += 1) {
    if ((top >>> index) & 1) result ^= BECH32_GENERATORS[index];
  }
  return result >>> 0;
}

function address(value) {
  if (typeof value !== 'string' || value.length !== 40 || value[0] !== 'z' || value[1] !== '1') invalid();
  let checksum = polymodStep(polymodStep(polymodStep(1, 3), 0), 26);
  const words = [];
  for (let index = 2; index < 40; index += 1) {
    const word = indexOf(BECH32, value[index]);
    if (word < 0) invalid();
    append(words, word);
    checksum = polymodStep(checksum, word);
  }
  if (checksum !== 1) invalid();
  let accumulator = 0;
  let bits = 0;
  let nonzero = false;
  const bytes = [];
  for (let index = 0; index < 32; index += 1) {
    accumulator = (accumulator << 5) | words[index];
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      const byte = (accumulator >>> bits) & 255;
      append(bytes, byte);
      if (byte !== 0) nonzero = true;
    }
  }
  if (bytes.length !== 20 || bits !== 0 || bytes[0] !== 0 || !nonzero) invalid();
  let encoded = 'z1';
  accumulator = 0;
  bits = 0;
  checksum = polymodStep(polymodStep(polymodStep(1, 3), 0), 26);
  for (let index = 0; index < bytes.length; index += 1) {
    accumulator = (accumulator << 8) | bytes[index];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      const word = (accumulator >>> bits) & 31;
      encoded += BECH32[word];
      checksum = polymodStep(checksum, word);
    }
  }
  if (bits !== 0) invalid();
  for (let index = 0; index < 6; index += 1) checksum = polymodStep(checksum, 0);
  checksum = (checksum ^ 1) >>> 0;
  for (let index = 5; index >= 0; index -= 1) encoded += BECH32[(checksum >>> (5 * index)) & 31];
  if (encoded !== value) invalid();
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

  function string(capture, maximum = MAX_STRING_BYTES) {
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
    if (character === '"') { string(false); return 'string'; }
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
        key = string(true, MAX_KEY_BYTES);
        if (key === '__proto__' || key === 'constructor' || key === 'prototype' || hasOwn(seen, key)) invalid();
        put(seen, key, true);
        if (envelope && key !== 'jsonrpc' && key !== 'id' && key !== 'result') invalid();
        whitespace();
        if (text[cursor++] !== ':') invalid();
      }
      whitespace();
      const start = cursor;
      if (envelope && key === 'jsonrpc') {
        countValue();
        if (string(true) !== '2.0') invalid();
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

function fixedError(kind) {
  const typed = kind === 'configuration_rejected' || kind === 'input_rejected';
  let suffix;
  if (kind === 'configuration_rejected') suffix = 'configuration rejected';
  else if (kind === 'input_rejected') suffix = 'input rejected';
  else if (kind === 'busy') suffix = 'busy';
  else if (kind === 'exhausted') suffix = 'exhausted';
  else suffix = 'unavailable';
  const message = `Dynamic Plasma JSON-RPC read transport ${suffix}`;
  const error = typed ? new TypeErrorConstructor(message) : new ErrorConstructor(message);
  const descriptor = create(null);
  descriptor.value = `${typed ? 'TypeError' : 'Error'}: ${message}`;
  descriptor.enumerable = false;
  descriptor.writable = false;
  descriptor.configurable = false;
  defineProperty(error, 'stack', descriptor);
  put(error, 'code', `dynamic_plasma_json_rpc_read_transport_${kind}`);
  return freeze(error);
}

function invalid() {
  throw INVALID;
}
