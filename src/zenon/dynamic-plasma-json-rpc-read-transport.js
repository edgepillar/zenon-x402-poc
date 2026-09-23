import { types as utilTypes } from 'node:util';

import { createBoundedJsonRpcReadTransportCore } from './bounded-json-rpc-read-core.js';

// Default-off protocol boundary for the observation collector. Use only while
// UNSIGNED: the collector/caller owns that gate because its exact read-request
// schema has no phase field. This adapter grants no signing authorization.
// The injected exchange owns endpoint choice, authentication, connection
// lifecycle, bounded timeout/cancellation, and terminal cleanup.
//
// TRANSPORT_MUST_PREHANDLE_REJECTION remains enforced by the shared bounded
// core. This wrapper owns only the preexisting closed Dynamic Plasma method and
// parameter grammar; no funding method is admitted here.

const freeze = Object.freeze;
const create = Object.create;
const defineProperty = Object.defineProperty;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys;
const hasOwn = Object.hasOwn;
const isFrozen = Object.isFrozen;
const isArray = Array.isArray;
const isSafeInteger = Number.isSafeInteger;
const sameValue = Object.is;
const toString = String;
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const isProxy = utilTypes.isProxy;
const indexOf = Function.call.bind(String.prototype.indexOf);

const INVALID = Symbol('invalid Dynamic Plasma read request');
const MAX_REQUEST_ID = 4294967295;
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = freeze([0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]);
const REQUEST_FIELDS = freeze(['method', 'params']);
const QUOTE_FIELDS = freeze(['address', 'blockType', 'toAddress', 'data']);
const FRONTIER = 'ledger.getFrontierMomentum';
const HEIGHT = 'ledger.getMomentumsByHeight';
const SPORK = 'embedded.spork.getAll';
const VARIABLES = 'embedded.plasma.getVariables';
const QUOTE = 'embedded.plasma.getRequiredPoWForAccountBlock';

export function createDynamicPlasmaJsonRpcReadTransport(options) {
  return createBoundedJsonRpcReadTransportCore(
    options,
    arguments.length,
    snapshotRequest,
    MAX_REQUEST_ID,
    'dynamic_plasma',
  );
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
    if (!isSafeInteger(items[0]) || sameValue(items[0], -0)
        || items[0] < 0 || items[0] > 7 || items[1] !== 128) invalid();
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

function exactArray(value, length) {
  if (typeof value !== 'object' || value === null || isProxy(value) || !isArray(value)
      || getPrototypeOf(value) !== arrayPrototype || !isFrozen(value)) invalid();
  const descriptor = getOwnPropertyDescriptor(value, 'length');
  if (descriptor === undefined || !hasOwn(descriptor, 'value') || descriptor.value !== length
      || descriptor.enumerable !== false || ownKeys(value).length !== length + 1) invalid();
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
  if (typeof value !== 'string' || value.length !== 40
      || value[0] !== 'z' || value[1] !== '1') invalid();
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
  for (let index = 5; index >= 0; index -= 1) {
    encoded += BECH32[(checksum >>> (5 * index)) & 31];
  }
  if (encoded !== value) invalid();
}

function invalid() {
  throw INVALID;
}
