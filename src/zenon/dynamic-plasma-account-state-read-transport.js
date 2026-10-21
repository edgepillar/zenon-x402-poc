import { types as utilTypes } from 'node:util';
import { createBoundedJsonRpcReadTransportCore } from './bounded-json-rpc-read-core.js';
import { snapshotDynamicPlasmaQuoteRequest } from './dynamic-plasma-json-rpc-read-transport.js';

const CORE = createBoundedJsonRpcReadTransportCore;
const PAYER_REQUEST = snapshotDynamicPlasmaQuoteRequest;
const freeze = Object.freeze;
const create = Object.create;
const define = Object.defineProperty;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys;
const hasOwn = Object.hasOwn;
const isFrozen = Object.isFrozen;
const isArray = Array.isArray;
const isProxy = utilTypes.isProxy;
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const INVALID = Symbol('invalid payer account-state read request');
const FRONTIER = 'ledger.getFrontierAccountBlock';
const INFO = 'ledger.getAccountInfoByAddress';
const EMPTY_INTENT = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

/**
 * Explicit, default-off two-method account-state grammar. Source:
 * go-zenon e58d8e80eabd9fd5630ed62e0707424d96b5303c rpc/api/ledger.go,
 * GetFrontierAccountBlock/GetAccountInfoByAddress, each with ONE address.
 * No legacy transport allowlist is changed. Reuse the existing bounded core
 * for one shared32-handoff/ID budget, serialization, error settlement and
 * actual envelope correlation across both methods. No wire recreation,
 * retry, reset, background call or user-supplied encoder is exposed.
 *
 * Only frozen exact {method,params:[canonicalUserPayer]} DATA is accepted.
 * The fixed empty intent is address-codec reuse, NOT a payment declaration.
 * Raw result text is not authentication, funds, freshness or an account DTO.
 * This creates no native endpoint/owner/host. The borrowed exchange owns
 * identity, authentication, deadlines, terminal cleanup and unsafe-Promise
 * rejection prehandling. It is an operational capability, NOT a sandbox or
 * permission for SDK/preparation, work, signing, payment or publication.
 */
export function createZenonAccountStateReadTransport(options) {
  return CORE(options, arguments.length, encodeRequest, 32, 'dynamic_plasma');
}

function encodeRequest(request) {
  if (typeof request !== 'object' || request === null || isProxy(request)
      || prototype(request) !== objectPrototype || !isFrozen(request)
      || ownKeys(request).length !== 2) invalid();
  const method = data(request, 'method'), params = data(request, 'params');
  if ((method !== FRONTIER && method !== INFO) || typeof params !== 'object'
      || params === null || isProxy(params) || !isArray(params)
      || prototype(params) !== arrayPrototype || !isFrozen(params)
      || ownKeys(params).length !== 2) invalid();
  const length = descriptor(params, 'length');
  if (length === undefined || !hasOwn(length, 'value') || length.value !== 1
      || length.enumerable !== false) invalid();
  const address = data(params, '0');
  const payer = PAYER_REQUEST({ address, blockType: 2, toAddress: address, data: EMPTY_INTENT });
  const encoded = create(null);
  put(encoded, 'method', method);
  put(encoded, 'params', '["' + payer.quoteRequest.address + '"]');
  return freeze(encoded);
}
function data(value, field) {
  const d = descriptor(value, field);
  if (d === undefined || d.enumerable !== true || !hasOwn(d, 'value')) invalid();
  return d.value;
}
function put(value, field, content) {
  const d = create(null);
  d.value = content; d.enumerable = true; d.writable = false; d.configurable = false;
  define(value, field, d);
}
function invalid() { throw INVALID; }
