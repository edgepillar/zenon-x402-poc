import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { createSelectedPaymentClientBridge } from './x402-selected-payment-client-bridge.js';
import {
  validateActiveUpfrontRequirement, validatePaymentRequiredForOfferSelection,
  validatePaymentPayloadEnvelope, sameRequirements, decodeB64Json,
  MAX_X402_HEADER_ENCODED_BYTES,
} from './x402-wire.js';

const APPLY = Reflect.apply, KEYS = Reflect.ownKeys, DESC = Object.getOwnPropertyDescriptor;
const PROTO = Object.getPrototypeOf, OWN = Object.hasOwn, FREEZE = Object.freeze;
const OBJECT = Object.prototype, ARRAY = Array.prototype, IS_ARRAY = Array.isArray;
const IS_PROXY = utilTypes.isProxy, SAFE = Number.isSafeInteger, IS = Object.is;
const FROM_JSON = JSON.parse, TO_JSON = JSON.stringify, BYTE_LENGTH = Buffer.byteLength;
const NativePromise = Promise, ErrorType = TypeError;
const CREATE_BRIDGE = createSelectedPaymentClientBridge;
const REQUIREMENT = validateActiveUpfrontRequirement, CHALLENGE = validatePaymentRequiredForOfferSelection;
const PAYLOAD = validatePaymentPayloadEnvelope, SAME = sameRequirements, DECODE = decodeB64Json;
const CoreClient = x402Client, HttpClient = x402HTTPClient;
const REGISTER = CoreClient.prototype.register, SPEND = CoreClient.prototype.setSpendControls;
const CREATE_PAYLOAD = HttpClient.prototype.createPaymentPayload;
const REQUIRED = HttpClient.prototype.getPaymentRequiredResponse;
const ENCODE = HttpClient.prototype.encodePaymentSignatureHeader;
const CONFIG = FREEZE(['requirement', 'localClient', 'validateChallenge', 'assetInfo', 'contextLimit']);

/**
 * Explicit application binding for the reviewed @x402/core 2.23.0 API.
 * Importing this separate opt-in module imports the installed official client;
 * ordinary buyer/server/CLI defaults are unchanged. Exact package/source
 * qualification is an external prerequisite, not established by a version label.
 *
 * Construct one production one-shot bridge, one actual official client and one
 * HTTP adapter. The SDK instances, mutable policies, hooks and registration
 * surfaces never leave this closure. The sole allowed asset/network uses the
 * fixed requirement amount as maxAmountPerPayment. The unrelated SDK USD
 * default is explicitly disabled; no price lookup or default asset is invented.
 * This policy is not aggregate spending consent or permission to attach a signer.
 *
 * Decode only an explicit bounded PAYMENT-REQUIRED value, create only on an
 * explicit call, and encode only a bounded v2 envelope for the fixed requirement.
 * No fetch/transport, SDK recovery hook, automatic retry or new close/lifecycle
 * owner exists. createPaymentPayload returns the actual HTTP client's Promise
 * unchanged; the production bridge still owns consumed contexts and ambiguity.
 * Original challenge identities reach that bridge without a clone or freeze.
 *
 * Codecs and returned SDK payloads are DATA, not provenance, signatures, consent,
 * raw signed-byte custody, current authority, global replay or delivery proof.
 * Callers retain original signed bytes/hash and must not replace after UNKNOWN.
 * Parsing/encoding never enters the borrowed creator. A fresh factory is no
 * authority reset. There is no durable/restart/live/production qualification.
 * Private native/SDK intrinsics and trusted same-UID code remain premises; no
 * hostile-code, memory-erasure, OS, network or cancellation sandbox is claimed.
 */
export function createOfficialSelectedPaymentClient(options) {
  let fixed, bridge, client, http;
  try {
    if (arguments.length !== 1) fail('configuration_rejected');
    const config = record(options, CONFIG);
    bounded(config.requirement); REQUIREMENT(config.requirement);
    fixed = snapshot(config.requirement);
    bridge = CREATE_BRIDGE({ ...config, requirement: fixed });
    client = new CoreClient();
    if (APPLY(REGISTER, client, [fixed.network, bridge.adapter]) !== client) fail('configuration_rejected');
    const controls = FREEZE({
      allowedAssets: FREEZE([FREEZE({ network: fixed.network, asset: fixed.asset, maxAmountPerPayment: fixed.amount })]),
      maxAmountPerPayment: false,
    });
    if (APPLY(SPEND, client, [controls]) !== client) fail('configuration_rejected');
    http = new HttpClient(client);
  } catch { fail('configuration_rejected'); }
  finally { options = null; }
  const HTTP = http, BRIDGE = bridge, FIXED = fixed;
  client = null; http = null; bridge = null; fixed = null;

  const decodePaymentRequiredHeader = FREEZE(function decodePaymentRequiredHeader(encoded) {
    try {
      if (arguments.length !== 1) fail('input_rejected');
      // Strict local base64/UTF-8/size preflight before the actual official decoder.
      DECODE(encoded, { maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES, maxDecodedBytes: 6144 });
      const value = APPLY(REQUIRED, HTTP, [name => name === 'PAYMENT-REQUIRED' ? encoded : undefined]);
      bounded(value); CHALLENGE(value);
      return value;
    } catch { fail('header_rejected'); }
    finally { encoded = null; }
  });
  const createPaymentPayload = FREEZE(function createPaymentPayload(challenge) {
    try {
      if (arguments.length !== 1) fail('input_rejected');
      bounded(challenge); CHALLENGE(challenge);
      // No await/then wrapper: the SDK receives the original identities and
      // the caller observes its actual Promise and the bridge's actual errors.
      return APPLY(CREATE_PAYLOAD, HTTP, [challenge]);
    } catch {
      return new NativePromise((resolve, reject) => { reject(failure('input_rejected')); });
    } finally { challenge = null; }
  });
  const encodePaymentSignatureHeader = FREEZE(function encodePaymentSignatureHeader(payload) {
    try {
      if (arguments.length !== 1) fail('input_rejected');
      const detached = snapshot(payload); PAYLOAD(detached);
      if (!SAME(detached.accepted, FIXED)) fail('input_rejected');
      const headers = record(APPLY(ENCODE, HTTP, [detached]), ['PAYMENT-SIGNATURE']);
      const encoded = headers['PAYMENT-SIGNATURE'];
      DECODE(encoded, { maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES, maxDecodedBytes: 6144 });
      return encoded;
    } catch { fail('payload_rejected'); }
    finally { payload = null; }
  });
  return FREEZE({ decodePaymentRequiredHeader, createPaymentPayload,
    encodePaymentSignatureHeader, getSnapshot: BRIDGE.getSnapshot });
}

function record(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value) !== OBJECT || KEYS(value).length !== fields.length) fail('input_rejected');
  const result = Object.create(null);
  for (const key of fields) {
    const d = DESC(value, key);
    if (!d || !OWN(d, 'value') || d.enumerable !== true) fail('input_rejected');
    result[key] = d.value;
  }
  return result;
}
function snapshot(value) {
  bounded(value);
  const text = TO_JSON(value);
  if (typeof text !== 'string' || APPLY(BYTE_LENGTH, Buffer, [text, 'utf8']) > 131072) fail('input_rejected');
  return FROM_JSON(text);
}
function bounded(value) {
  if (DESC(OBJECT, 'toJSON') !== undefined || DESC(ARRAY, 'toJSON') !== undefined) fail('input_rejected');
  const budget = { nodes: 4096, bytes: 131072 };
  scan(value, 0, budget);
}
function scan(value, depth, budget) {
  if (depth > 16 || --budget.nodes < 0) fail('input_rejected');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!SAFE(value) || IS(value, -0)) fail('input_rejected');
    return;
  }
  if (typeof value === 'string') {
    if (value.length > 131072 || (budget.bytes -= APPLY(BYTE_LENGTH, Buffer, [value, 'utf8'])) < 0) fail('input_rejected');
    return;
  }
  if (typeof value !== 'object' || IS_PROXY(value)) fail('input_rejected');
  const proto = PROTO(value), keys = KEYS(value);
  if (IS_ARRAY(value)) {
    const d = DESC(value, 'length');
    if (proto !== ARRAY || !d || !OWN(d, 'value') || !SAFE(d.value)
        || d.value < 0 || d.value > 1024 || keys.length !== d.value + 1) fail('input_rejected');
    for (let i = 0; i < d.value; i++) {
      const item = DESC(value, String(i));
      if (!item || !OWN(item, 'value') || !item.enumerable) fail('input_rejected');
      scan(item.value, depth + 1, budget);
    }
    return;
  }
  if (proto !== OBJECT && proto !== null || keys.length > 256) fail('input_rejected');
  for (const key of keys) {
    if (typeof key !== 'string' || key.length > 128 || key === 'toJSON') fail('input_rejected');
    scan(key, depth + 1, budget);
    const d = DESC(value, key);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail('input_rejected');
    // Official SDK v2 results may own an absent optional error/extensions field.
    if (depth === 0 && d.value === undefined && (key === 'error' || key === 'extensions')) continue;
    scan(d.value, depth + 1, budget);
  }
}
function failure(kind) {
  const code = 'x402_official_selected_client_' + kind, e = new ErrorType(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code });
  return FREEZE(e);
}
function fail(kind) { throw failure(kind); }
