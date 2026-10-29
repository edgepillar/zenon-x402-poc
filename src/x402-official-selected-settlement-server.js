import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { x402ResourceServer, x402HTTPResourceServer } from '@x402/core/server';
import { createSelectedSettlementServerBridgeForOfficialX402Core223 } from './x402-selected-settlement-server-bridge.js';
import {
  validateActiveUpfrontRequirement, validateResource, validatePaymentPayloadEnvelope,
  sameRequirements, sameResource, decodeB64Json, MAX_X402_HEADER_ENCODED_BYTES,
} from './x402-wire.js';
import {
  captureOfficialUpfrontHttpsRoute,
  captureOfficialUpfrontHttpsRequest,
} from './x402-official-https-request-binding.js';
import { captureOfficialFundingPostHttpsRoute,
  captureOfficialFundingPostHttpsRequest } from './x402-official-funding-post-https-request-binding.js';
import { createIssuedFundingPostSdkResourceBinding } from './x402-issued-funding-post-sdk-resource.js';

const APPLY = Reflect.apply, KEYS = Reflect.ownKeys, DESC = Object.getOwnPropertyDescriptor;
const PROTO = Object.getPrototypeOf, OWN = Object.hasOwn, FREEZE = Object.freeze;
const OBJECT = Object.prototype, ARRAY = Array.prototype, IS_ARRAY = Array.isArray;
const IS_PROXY = utilTypes.isProxy, SAFE = Number.isSafeInteger, IS = Object.is;
const FROM_JSON = JSON.parse, TO_JSON = JSON.stringify, BYTE_LENGTH = Buffer.byteLength;
const NativePromise = Promise, ErrorType = TypeError;
const NATIVE_THEN = NativePromise.prototype.then;
const CoreServer = x402ResourceServer, HttpServer = x402HTTPResourceServer;
const REGISTER = CoreServer.prototype.register, BEFORE = CoreServer.prototype.onBeforeSettle;
const INITIALIZE = HttpServer.prototype.initialize, REQUEST = HttpServer.prototype.processHTTPRequest;
const SETTLEMENT = HttpServer.prototype.processSettlement;
const CREATE_BRIDGE = createSelectedSettlementServerBridgeForOfficialX402Core223;
const REQUIREMENT = validateActiveUpfrontRequirement, RESOURCE = validateResource;
const PAYLOAD = validatePaymentPayloadEnvelope, SAME_REQUIREMENT = sameRequirements, SAME_RESOURCE = sameResource;
const DECODE = decodeB64Json, HEADER_LIMIT = MAX_X402_HEADER_ENCODED_BYTES;
const CAPTURE_HTTP_ROUTE = captureOfficialUpfrontHttpsRoute;
const CAPTURE_HTTP_REQUEST = captureOfficialUpfrontHttpsRequest;
const CONFIG = FREEZE(['requirement', 'resource', 'localFacilitator', 'validateChallenge',
  'reconcilePendingSettlement', 'maxPendingReconciliations', 'contextLimit']);

/**
 * Explicit application binding for the separately reviewed @x402/core 2.23.0
 * single GET /paid upfront profile. Ordinary CLI/server defaults are unchanged.
 * Exact installed source qualification is external, not a version-label claim.
 *
 * Own the actual SDK resource/HTTP servers and their request adapter privately.
 * Accept only null (unpaid) or one bounded PAYMENT-SIGNATURE scalar. This API
 * processRequest does NOT authenticate or route a native HTTP request. A host
 * using that legacy scalar API must bind method/path/resource before calling.
 * The explicit processHttpRequest entry instead snapshots own HTTP/1.1 request
 * fields and exact Host/GET/target/zero-body framing before entering that SAME
 * scalar operation. It requires the canonical HTTPS /paid resource profile;
 * no nonmatching route falls back to synthetic adapter values. The socket's
 * declared encrypted flag remains a trusted-host premise, not TLS attestation.
 * No listener, fetch, socket, handler, cancellation dispatcher or SDK object is
 * exposed. Initialization uses only the existing bridge's support callback.
 *
 * Retain the exact SDK tuple in its own pending continuation, never require the
 * host to reconstruct it. One explicit resume uses the SAME existing owner and
 * bounded observer. No automatic retry, new verifier/first settlement, signing,
 * replacement, refreshed quote or consumed-authority reset is introduced.
 * The private SDK hook checks original tuple identity again on continuation.
 * All application request/resume operations share one synchronous busy fence.
 *
 * HTTP instructions and settlement receipts are detached frozen DATA. Success
 * does not invoke/deliver a service, establish current policy/consent, custody,
 * canonicality, finality, durability, restart, live or production readiness.
 * A pending capability is memory-only; close drains/detaches only its existing
 * continuation, not this application, the SDK, bridge claims or borrowed owners.
 * Trusted callbacks must not depend on request/resume/close receipts; indirect
 * Promise cycles or callbacks that never settle can still keep owners pending.
 * Keep original actual signed bytes/hash and UNKNOWN/ACKNOWLEDGED distinctions;
 * the VALIDATED same-signed-block rule is unchanged.
 *
 * Captured native/SDK behavior and trusted local callbacks remain premises,
 * not a hostile-code, OS, timeout, memory-erasure or transport sandbox.
 */
export async function createOfficialSelectedSettlementServer(options) {
  if (arguments.length !== 1) fail('configuration_rejected');
  return createSelectedServer(options, false);
}

/** SOURCE-ONLY actual issued url/tags resource, not a reconstructed receipt.
 * The intake root supplies its actual original frame. SDK response formation
 * occurs at the real enrichment hook before the existing tuple bridge captures
 * it; signed payload/header/requirements and their identities are untouched.
 */
export async function createOfficialIssuedFundingPostSelectedSettlementServer(options) {
  if (arguments.length !== 1) fail('configuration_rejected');
  const c = record(options, ['issuedFrame','resourceUrl','localFacilitator','validateChallenge',
    'reconcilePendingSettlement','maxPendingReconciliations','contextLimit']);
  if (c.contextLimit !== 1) fail('configuration_rejected');
  const binding = createIssuedFundingPostSdkResourceBinding(c.issuedFrame, c.resourceUrl);
  const selected = binding.selection();
  return createSelectedServer({ requirement: selected.requirement, resource: selected.resource,
    localFacilitator: c.localFacilitator, validateChallenge: c.validateChallenge,
    reconcilePendingSettlement: c.reconcilePendingSettlement,
    maxPendingReconciliations: c.maxPendingReconciliations, contextLimit: c.contextLimit }, true, binding);
}

async function createSelectedServer(options, fundingPost, issuedBinding = null) {
  const HTTP_METHOD = fundingPost ? 'POST' : 'GET', HTTP_TARGET = fundingPost ? '/funding' : '/paid';
  const ROUTE_CAPTURE = fundingPost ? captureOfficialFundingPostHttpsRoute : CAPTURE_HTTP_ROUTE;
  const REQUEST_CAPTURE = fundingPost ? captureOfficialFundingPostHttpsRequest : CAPTURE_HTTP_REQUEST;
  let bridge, http, fixed, resource, requestLimit, observerBudget, httpRoute;
  try {
    const c = record(options, CONFIG);
    bounded(c.requirement); REQUIREMENT(c.requirement); fixed = snapshot(c.requirement);
    record(c.resource, issuedBinding === null ? ['url', 'description', 'mimeType'] : ['url', 'tags']);
    bounded(c.resource); RESOURCE(c.resource); resource = snapshot(c.resource);
    // Keep the original scalar API's resource acceptance unchanged. The new
    // native-request entry refuses a resource outside its exact HTTPS profile.
    try { httpRoute = ROUTE_CAPTURE(resource.url); } catch {
      if (fundingPost) fail('configuration_rejected');
      httpRoute = null;
    }
    requestLimit = c.contextLimit; observerBudget = c.maxPendingReconciliations;
    bridge = CREATE_BRIDGE({ requirement: fixed, localFacilitator: c.localFacilitator,
      validateChallenge: c.validateChallenge, reconcilePendingSettlement: c.reconcilePendingSettlement,
      maxPendingReconciliations: c.maxPendingReconciliations, contextLimit: c.contextLimit });
    const server = new CoreServer(bridge.facilitatorClient);
    const originalScheme = bridge.schemeServer;
    const originalEnrich = originalScheme.enrichPaymentRequiredResponse;
    const scheme = issuedBinding === null ? originalScheme : FREEZE({ ...originalScheme,
      enrichPaymentRequiredResponse: FREEZE(function enrichIssuedFundingResponse(context) {
        if (arguments.length !== 1) fail('input_rejected');
        return APPLY(originalEnrich, originalScheme, [issuedBinding.capture(context)]);
      }) });
    if (APPLY(REGISTER, server, [fixed.network, scheme]) !== server) fail('configuration_rejected');
    APPLY(BEFORE, server, [capture]);
    http = new HttpServer(server, {
      [HTTP_METHOD + ' ' + HTTP_TARGET]: { accepts: { scheme: fixed.scheme, network: fixed.network,
        price: { amount: fixed.amount, asset: fixed.asset }, payTo: fixed.payTo,
        maxTimeoutSeconds: fixed.maxTimeoutSeconds, extra: snapshot(fixed.extra) },
        resource: resource.url, description: resource.description, mimeType: resource.mimeType,
        ...(issuedBinding === null ? {} : { tags: resource.tags }) },
    });
    await APPLY(INITIALIZE, http, []);
  } catch { fail('configuration_rejected'); }
  finally { options = null; }
  const HTTP = http, BRIDGE = bridge, FIXED = fixed, RESOURCE_INFO = resource;
  const REQUEST_LIMIT = requestLimit, OBSERVER_BUDGET = observerBudget;
  const HTTP_ROUTE = httpRoute;
  http = null; bridge = null; fixed = null; resource = null; httpRoute = null;
  let operation = null, requestCalls = 0, resumeAttempts = 0;

  function capture(context) {
    if (operation === null || IS_PROXY(context) || context === null || typeof context !== 'object'
        || data(context, 'phase') !== 'before-handler') fail('operation_rejected');
    const tuple = { paymentPayload: data(context, 'paymentPayload'),
      requirements: data(context, 'requirements'), transportContext: data(context, 'transportContext') };
    if (operation.mode === 'request') {
      if (operation.tuple !== null) fail('operation_rejected');
      operation.tuple = tuple;
    } else {
      const expected = operation.tuple;
      if (expected === null || tuple.paymentPayload !== expected.paymentPayload
          || tuple.requirements !== expected.requirements
          || tuple.transportContext !== expected.transportContext) fail('operation_rejected');
    }
  }
  function continueSettlement(...args) {
    if (operation === null || operation.mode !== 'continuation' || operation.tuple !== null
        || args.length !== 7 || args[2] !== undefined || args[4] !== undefined
        || args[5] !== undefined || args[6] !== 'before-handler') fail('operation_rejected');
    operation.tuple = { paymentPayload: args[0], requirements: args[1], transportContext: args[3] };
    return APPLY(SETTLEMENT, HTTP, args);
  }
  function wrapPending(raw) {
    const resume = FREEZE(function resume() {
      try {
        if (arguments.length !== 0) fail('input_rejected');
        if (operation !== null) fail('busy');
      } catch (error) { return new NativePromise((resolve, reject) => { reject(error); }); }
      operation = { mode: 'continuation', tuple: null }; resumeAttempts++;
      const receipt = raw.resume();
      APPLY(NATIVE_THEN, receipt, [() => { operation = null; }, () => { operation = null; }]);
      return receipt; // Preserve the existing continuation's actual receipt.
    });
    return FREEZE({ resume, close: raw.close, getSnapshot: raw.getSnapshot });
  }
  const processRequest = FREEZE(async function processRequest(header) {
    if (arguments.length !== 1) fail('input_rejected');
    if (operation !== null) fail('busy');
    if (requestCalls >= REQUEST_LIMIT) fail('request_budget_exhausted');
    try {
      if (header !== null) {
        const payload = DECODE(header, { maxEncodedBytes: HEADER_LIMIT, maxDecodedBytes: 6144 });
        bounded(payload); PAYLOAD(payload);
        if (!SAME_REQUIREMENT(payload.accepted, FIXED) || !SAME_RESOURCE(payload.resource, RESOURCE_INFO))
          fail('input_rejected');
      }
    } catch { fail('input_rejected'); }
    operation = { mode: 'request', tuple: null }; requestCalls++;
    try {
      const PAYMENT_HEADER = header; // The private adapter retains the original scalar.
      const adapter = FREEZE({
        getHeader: name => typeof name === 'string' && name.toLowerCase() === 'payment-signature' ? PAYMENT_HEADER : undefined,
        getMethod: () => HTTP_METHOD, getPath: () => HTTP_TARGET, getUrl: () => RESOURCE_INFO.url,
        getAcceptHeader: () => 'application/json', getUserAgent: () => 'selected-upfront-application',
      });
      const result = await APPLY(REQUEST, HTTP, [{ adapter, method: HTTP_METHOD, path: HTTP_TARGET, paymentHeader: PAYMENT_HEADER }]);
      if (result.type === 'payment-error') {
        const response = deepFreeze(snapshot(result.response));
        let pending = null;
        const encoded = response.headers['PAYMENT-RESPONSE'];
        const wire = encoded === undefined ? null : DECODE(encoded, {
          maxEncodedBytes: HEADER_LIMIT, maxDecodedBytes: 6144 });
        if (operation.tuple !== null && OBSERVER_BUDGET > 0
            && wire?.success === false && wire.errorReason === 'settlement_pending') {
          const tuple = operation.tuple;
          // This existing owner checks PENDING, first consumed, same tuple and
          // remaining observer budget; an HTTP status alone never grants resume.
          pending = wrapPending(BRIDGE.createPendingContinuation({ ...tuple,
            processSettlement: continueSettlement }));
        }
        return FREEZE({ type: 'payment-error', response, pending });
      }
      if (result.type !== 'payment-verified' || operation.tuple === null
          || result.beforeHandlerSettlement?.result?.success !== true) fail('operation_rejected');
      // Upfront has already settled. Echo only; never run another first settle.
      const settled = await APPLY(SETTLEMENT, HTTP, [
        result.paymentPayload, result.paymentRequirements, result.declaredExtensions,
        undefined, undefined, result.beforeHandlerSettlement,
      ]);
      if (settled.success !== true) fail('operation_rejected');
      return FREEZE({ type: 'settled', settlement: deepFreeze(snapshot(settled)), pending: null });
    } catch { fail('request_rejected'); }
    finally { operation = null; header = null; }
  });
  const processHttpRequest = FREEZE(function processHttpRequest(request) {
    try {
      if (arguments.length !== 1 || HTTP_ROUTE === null) fail('input_rejected');
      const captured = REQUEST_CAPTURE(request, HTTP_ROUTE);
      // Preserve the actual existing request Promise, busy fence, context and
      // continuation. No extra SDK owner or first-settlement authority exists.
      return processRequest(captured.paymentSignature);
    } catch {
      return new NativePromise((resolve, reject) => { reject(failure('input_rejected')); });
    } finally { request = null; }
  });
  const getSnapshot = FREEZE(function getSnapshot() {
    return FREEZE({ profile: issuedBinding !== null ? 'OFFICIAL_CORE_2_23_0_ISSUED_POST_FUNDING_UPFRONT'
      : fundingPost ? 'OFFICIAL_CORE_2_23_0_SINGLE_POST_FUNDING_UPFRONT'
      : 'OFFICIAL_CORE_2_23_0_SINGLE_GET_PAID_UPFRONT',
      requestCalls, requestLimit: REQUEST_LIMIT, resumeAttempts, active: operation !== null,
      bridge: BRIDGE.getSnapshot(),
      ...(issuedBinding === null ? {} : { issuedResource: issuedBinding.inspect() }),
      persistence: 'MEMORY_ONLY', serviceDelivery: 'NOT_ESTABLISHED', currentAuthority: 'NOT_ESTABLISHED' });
  });
  return FREEZE({ processRequest, processHttpRequest, getSnapshot });
}

function data(value, key) {
  const d = DESC(value, key);
  if (!d || !OWN(d, 'value')) fail('input_rejected');
  return d.value;
}
function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const key of KEYS(value)) deepFreeze(data(value, key));
    FREEZE(value);
  }
  return value;
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
  const code = 'x402_official_selected_server_' + kind, e = new ErrorType(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code });
  return FREEZE(e);
}
function fail(kind) { throw failure(kind); }
