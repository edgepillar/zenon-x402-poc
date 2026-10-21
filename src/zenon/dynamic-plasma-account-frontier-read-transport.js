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
const INVALID = Symbol('invalid payer frontier read request');
const METHOD = 'ledger.getFrontierAccountBlock';
const EMPTY_INTENT = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const MAX_REQUESTS = 32;

/**
 * Default-off static adapter for ONE closed UserSend-payer read grammar.
 * Accept frozen exact {method,params:[canonicalUserPayer]} DATA; no other
 * ledger, funding, Plasma, signing or publication method is admitted here.
 * Existing adapters and their allowlists are unchanged. Reuse the captured
 * bounded core for IDs, serialization, busy/exhausted/error settlement and
 * actual envelope correlation. Each explicit handoff consumes one of32 slots;
 * there is no retry, refresh, reset, timer or background call.
 *
 * The caller-provided exchange remains a caller-owned capability, not a
 * sandboxed/read-only implementation. It owns endpoint identity, connection,
 * authentication, deadlines/cancellation and terminal cleanup, including the
 * existing TRANSPORT_MUST_PREHANDLE_REJECTION obligation for unsafe Promises.
 * No endpoint, host, native owner or operational helper is created. The caller
 * must retain its separate phase/context/authority gates. This grants no
 * current-state, genesis, funds, signing, publication or payment authority.
 * Result is raw JSON text, not a frontier DTO or authenticated chain evidence.
 */
export function createZenonAccountFrontierReadTransport(options) {
  return CORE(options, arguments.length, encodeRequest, MAX_REQUESTS, 'dynamic_plasma');
}

function encodeRequest(request) {
  if (typeof request !== 'object' || request === null || isProxy(request)
      || prototype(request) !== objectPrototype || !isFrozen(request)
      || ownKeys(request).length !== 2) invalid();
  const method = data(request, 'method'), params = data(request, 'params');
  if (method !== METHOD || typeof params !== 'object' || params === null || isProxy(params)
      || !isArray(params) || prototype(params) !== arrayPrototype || !isFrozen(params)
      || ownKeys(params).length !== 2) invalid();
  const length = descriptor(params, 'length');
  if (length === undefined || !hasOwn(length, 'value') || length.value !== 1
      || length.enumerable !== false) invalid();
  const address = data(params, '0');
  const payer = PAYER_REQUEST({ address, blockType: 2, toAddress: address, data: EMPTY_INTENT });
  const encoded = create(null);
  put(encoded, 'method', METHOD);
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
