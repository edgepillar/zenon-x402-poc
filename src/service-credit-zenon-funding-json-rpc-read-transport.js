import { types as utilTypes } from 'node:util';

import { createBoundedJsonRpcReadTransportCore } from './zenon/bounded-json-rpc-read-core.js';

// Default-off protocol boundary for one funding-observation transcript. The
// injected exchange owns endpoint identity, authentication, timeout,
// cancellation and physical cleanup. This adapter owns only four exact ledger
// read grammars and six lifetime handoffs; it grants no wallet, signing,
// publication, canonicality, finality, credit or service authority.

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
const charCodeAt = Function.call.bind(String.prototype.charCodeAt);

const INVALID = Symbol('invalid Zenon funding read request');
const MAX_REQUESTS = 6;
const REQUEST_FIELDS = freeze(['method', 'params']);
const FRONTIER = 'ledger.getFrontierMomentum';
const MOMENTUM = 'ledger.getMomentumByHash';
const HEIGHT = 'ledger.getMomentumsByHeight';
const BLOCK = 'ledger.getAccountBlockByHash';

export function createZenonFundingJsonRpcReadTransport(options) {
  return createBoundedJsonRpcReadTransportCore(
    options,
    arguments.length,
    snapshotRequest,
    MAX_REQUESTS,
    'zenon_funding',
  );
}

function snapshotRequest(request) {
  const fields = exactObject(request, REQUEST_FIELDS);
  const method = fields.method;
  let params;
  if (method === FRONTIER) {
    exactArray(fields.params, 0);
    params = '[]';
  } else if (method === MOMENTUM || method === BLOCK) {
    const items = exactArray(fields.params, 1);
    hash(items[0]);
    params = `["${items[0]}"]`;
  } else if (method === HEIGHT) {
    const items = exactArray(fields.params, 2);
    if (!isSafeInteger(items[0]) || sameValue(items[0], -0) || items[0] < 1
        || !isSafeInteger(items[1]) || sameValue(items[1], -0)
        || items[1] < 1 || items[1] > 64) invalid();
    params = `[${toString(items[0])},${toString(items[1])}]`;
  } else invalid();
  const result = create(null);
  put(result, 'method', method);
  put(result, 'params', params);
  return freeze(result);
}

function hash(value) {
  if (typeof value !== 'string' || value.length !== 64) invalid();
  for (let index = 0; index < value.length; index += 1) {
    const code = charCodeAt(value, index);
    if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 102))) invalid();
  }
}

function exactObject(value, fields) {
  if (typeof value !== 'object' || value === null || isProxy(value)
      || getPrototypeOf(value) !== objectPrototype || !isFrozen(value)
      || ownKeys(value).length !== fields.length) invalid();
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

function invalid() {
  throw INVALID;
}
