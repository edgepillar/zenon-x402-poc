import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import {
  captureOfficialUpfrontHttpsRoute,
  captureOfficialUpfrontHttpsRequest,
} from './x402-official-https-request-binding.js';

const FREEZE = Object.freeze, DESC = Object.getOwnPropertyDescriptor;
const OWN = Object.hasOwn, KEYS = Reflect.ownKeys, PROTO = Object.getPrototypeOf;
const APPLY = Reflect.apply, THEN = Promise.prototype.then, NativePromise = Promise;
const IS_PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const JSON_TEXT = JSON.stringify, BYTE_LENGTH = Buffer.byteLength;
const CREDIT_TARGET = '/service-credit/v1/execute';
const MAX_ACTIVE = 64, MAX_BODY = 16384, MAX_PAYMENT_HEADER = 8192;
const PREFIX = 'OFFICIAL_X402_UPFRONT_HTTPS_ROUTER_';
const HEADER_NAME = /[^!#$%&'*+\-.^_\x60|~0-9A-Za-z]/;
const HEADER_VALUE = /[^\x20-\x7e]/;

function fail(suffix) {
  const code = PREFIX + suffix, error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw FREEZE(error);
}
function own(value, key) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)) fail('INPUT');
  const d = DESC(value, key);
  if (!d || !OWN(d, 'value') || !d.enumerable) fail('INPUT');
  return d.value;
}
function record(value, keys, frozen = false) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value) !== Object.prototype || KEYS(value).length !== keys.length
      || frozen && !Object.isFrozen(value)) fail('CONFIGURATION');
  const out = Object.create(null);
  for (const key of keys) out[key] = own(value, key);
  return out;
}
function callable(value) {
  return typeof value === 'function' && !IS_PROXY(value) && Object.isFrozen(value);
}
function observe(promise, fulfilled, rejected) {
  if (!IS_PROMISE(promise) || IS_PROXY(promise) || PROTO(promise) !== NativePromise.prototype
      || DESC(promise, 'then') !== undefined || DESC(promise, 'constructor') !== undefined)
    return false;
  APPLY(THEN, promise, [fulfilled, rejected]);
  return true;
}
function completion(value) {
  const c = record(value, ['success', 'failure'], true);
  if (!callable(c.success) || !callable(c.failure)) fail('COMPLETION');
  return c;
}
function bodyText(value) {
  // Inspect DATA before serialization; do not invoke getters, toJSON or proxies.
  let nodes = 2048, bytes = MAX_BODY;
  function scan(item, depth) {
    if (--nodes < 0 || depth > 12) fail('RESPONSE');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isSafeInteger(item) && !Object.is(item, -0)) return;
    if (typeof item === 'string' && item.length <= MAX_BODY) {
      bytes -= APPLY(BYTE_LENGTH, Buffer, [item]);
      if (bytes < 0) fail('RESPONSE');
      return;
    }
    if (item === null || typeof item !== 'object' || IS_PROXY(item)) fail('RESPONSE');
    const array = Array.isArray(item), proto = PROTO(item), keys = KEYS(item);
    if (proto !== (array ? Array.prototype : Object.prototype) && !(proto === null && !array))
      fail('RESPONSE');
    if (keys.length > 256 || DESC(item, 'toJSON') !== undefined
        || DESC(Object.prototype, 'toJSON') !== undefined
        || DESC(Array.prototype, 'toJSON') !== undefined) fail('RESPONSE');
    if (array) {
      const length = DESC(item, 'length');
      if (!length || !OWN(length, 'value') || !Number.isSafeInteger(length.value)
          || length.value < 0 || keys.length !== length.value + 1) fail('RESPONSE');
      for (let i = 0; i < length.value; i++) scan(own(item, String(i)), depth + 1);
    } else {
      for (const key of keys) {
        if (typeof key !== 'string' || key.length > 128 || key === 'toJSON') fail('RESPONSE');
        const field = own(item, key);
        // The official SDK owns these absent optional fields in its DATA.
        if (field === undefined && (key === 'error' || key === 'extensions')) continue;
        scan(field, depth + 1);
      }
    }
  }
  scan(value, 0);
  const text = JSON_TEXT(value);
  if (typeof text !== 'string' || APPLY(BYTE_LENGTH, Buffer, [text]) > MAX_BODY) fail('RESPONSE');
  return text;
}
function reply(status, headers, body) {
  if (!Number.isSafeInteger(status) || status < 200 || status > 599
      || headers === null || typeof headers !== 'object' || IS_PROXY(headers)
      || ![Object.prototype, null].includes(PROTO(headers)) || KEYS(headers).length > 16)
    fail('RESPONSE');
  const copied = Object.create(null), observed = new Set();
  for (const name of KEYS(headers)) {
    if (typeof name !== 'string' || !name.length || name.length > 128 || HEADER_NAME.test(name))
      fail('RESPONSE');
    const value = own(headers, name), lower = name.toLowerCase();
    if (typeof value !== 'string' || value.length > MAX_PAYMENT_HEADER || HEADER_VALUE.test(value)
        || observed.has(lower)) fail('RESPONSE');
    observed.add(lower);
    // Forward only x402 receipts, never caller/SDK hop-by-hop or framing headers.
    if (lower === 'payment-required' || lower === 'payment-response') copied[name] = value;
  }
  return FREEZE({ status, headers: FREEZE(copied), body: bodyText(body) });
}
const BAD = reply(400, {}, { error: 'invalid_request' });
const UNAVAILABLE = reply(503, {}, { error: 'service_unavailable' });
function write(response, value) {
  if (response === null || typeof response !== 'object' || IS_PROXY(response)
      || response.destroyed || response.writableEnded) return false;
  try {
    response.statusCode = value.status;
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Vary', 'PAYMENT-SIGNATURE, Authorization');
    response.setHeader('Connection', 'close');
    for (const name of KEYS(value.headers)) response.setHeader(name, value.headers[name]);
    response.setHeader('Content-Length', APPLY(BYTE_LENGTH, Buffer, [value.body]));
    response.end(value.body);
    return true;
  } catch { return false; }
}

/**
 * One explicit native-ingress downstream for the official GET /paid entry and
 * an already scoped durable credit session. The application factory creates
 * the ACTUAL official server and admitted-grant session; borrowed callable
 * seams here are not SDK, SQLite or native-TLS qualification by themselves.
 *
 * An exact incoming original header may observe its OWN existing pending tuple.
 * No request invents another verifier, first-settlement call, payment or grant.
 * Settled/exhausted replies are retained before writing, so a failed response
 * cannot turn the same header into fresh first-settlement authority. This cache
 * is MEMORY_ONLY: close/reconstruction is not durable funding replay authority.
 * A 200 settlement receipt never activates a service grant or invokes a service.
 * The POST session independently owns capability validation/debit/execution.
 *
 * Native ingress owns transport, deadlines and aborts; this owner drains its
 * active callbacks and pending continuations before reporting a clean close.
 * A callback/close that never settles remains pending for that ingress's
 * bounded uncertain-close path. No timeout is called physical resource release.
 */
export function createOfficialUpfrontServiceCreditHttpsRouter(options) {
  if (arguments.length !== 1) fail('CONFIGURATION');
  const c = record(options, ['resourceUrl', 'officialServer', 'serviceSession', 'maxFundingPayments']);
  const route = captureOfficialUpfrontHttpsRoute(c.resourceUrl);
  const official = record(c.officialServer, ['processRequest', 'processHttpRequest', 'getSnapshot'], true);
  const service = record(c.serviceSession, ['handle', 'close'], true);
  if (!callable(official.processHttpRequest) || !callable(official.getSnapshot)
      || !callable(service.handle) || !callable(service.close)
      || !Number.isSafeInteger(c.maxFundingPayments) || c.maxFundingPayments < 1
      || c.maxFundingPayments > 64) fail('CONFIGURATION');
  const processHttpRequest = official.processHttpRequest, serviceHandle = service.handle;
  const serviceClose = service.close, maxFundingPayments = c.maxFundingPayments;
  let closed = false, uncertain = false, fundingBusy = false;
  let active = 0, pendingCloses = 0, sessionClosed = false, closeStarted = false;
  let terminal = null, fundingCalls = 0, resumed = 0, replayed = 0;
  const payments = new Map(), seen = new WeakSet(), closeWaiters = [];
  const operations = new Set();
  options = null;

  function finishCompletion(captured, success) {
    try { APPLY(success ? captured.success : captured.failure, undefined, []); }
    catch { uncertain = true; }
  }
  function finishClose() {
    if (!closeStarted || terminal !== null || active !== 0 || pendingCloses !== 0 || !sessionClosed)
      return;
    terminal = uncertain ? 'CLOSE_UNCERTAIN' : 'CLOSED';
    for (const waiter of closeWaiters.splice(0)) finishCompletion(waiter, !uncertain);
    payments.clear();
  }
  function closePending(entry) {
    if (entry.pending === null || entry.closeStarted) return;
    entry.closeStarted = true; pendingCloses++;
    const settled = clean => {
      if (entry.closeSettled) { uncertain = true; return; }
      entry.closeSettled = true; entry.pending = null; pendingCloses--;
      if (!clean) uncertain = true;
      finishClose();
    };
    try {
      const value = entry.pending.close();
      if (!observe(value, result => settled(result === undefined), () => settled(false))) settled(false);
    } catch { settled(false); }
  }
  async function funding(request, captured) {
    const header = captured.paymentSignature;
    let entry = header === null ? null : payments.get(header);
    if (entry !== undefined && entry !== null) {
      if (entry.pending !== null && entry.state === 'PENDING') {
        const phase = own(entry.pending.getSnapshot(), 'phase');
        if (phase === 'PENDING') {
          resumed++;
          try {
            const continued = await entry.pending.resume();
            entry.reply = reply(continued.settlement.success ? 200 : 402, continued.headers,
              { settlement: continued.settlement, serviceDelivery: 'NOT_ESTABLISHED' });
            entry.state = continued.settlement.success ? 'SETTLED'
              : own(entry.pending.getSnapshot(), 'phase') === 'PENDING' ? 'PENDING' : 'EXHAUSTED';
          } catch { entry.state = 'UNKNOWN'; entry.reply = UNAVAILABLE; throw new TypeError(PREFIX + 'FUNDING_UNAVAILABLE'); }
        } else { entry.state = 'EXHAUSTED'; replayed++; }
      } else { replayed++; }
      return entry.reply;
    }
    if (header !== null) {
      if (payments.size >= maxFundingPayments) return UNAVAILABLE;
      entry = { state: 'UNKNOWN', reply: UNAVAILABLE, pending: null, closeStarted: false, closeSettled: false };
      payments.set(header, entry); // Reserve BEFORE any borrowed operation.
    }
    try {
      fundingCalls++;
      const returned = processHttpRequest(request);
      request = null;
      const result = await returned;
      let value;
      if (result.type === 'payment-error') {
        // Retain a returned continuation BEFORE any response serialization can
        // fail. An unusable reply must not leak its existing owner on close.
        if (entry !== null) { entry.pending = result.pending; entry.state = result.pending === null ? 'REPLIED' : 'PENDING'; }
        else if (result.pending !== null) {
          closePending({ pending: result.pending, closeStarted: false, closeSettled: false });
          fail('RESPONSE');
        }
        value = reply(result.response.status, result.response.headers, result.response.body);
      } else if (result.type === 'settled' && result.settlement.success === true) {
        value = reply(200, result.settlement.headers,
          { settlement: result.settlement, serviceDelivery: 'NOT_ESTABLISHED' });
        if (entry !== null) entry.state = 'SETTLED';
      } else { fail('RESPONSE'); }
      if (entry !== null) {
        entry.reply = value; // Retain before the response writer can lose the reply.
        if (closed) closePending(entry);
      }
      return value;
    } catch (error) {
      const code = error !== null && typeof error === 'object' && !IS_PROXY(error)
        ? DESC(error, 'code') : undefined;
      if (code && OWN(code, 'value') && code.value === 'x402_official_selected_server_input_rejected') {
        // This actual application error is produced BEFORE the SDK operation.
        // It cannot consume/replace the original pending payment's authority.
        if (entry !== null) { entry.state = 'REJECTED'; entry.reply = BAD; }
        return BAD;
      }
      if (entry !== null) { entry.state = 'UNKNOWN'; entry.reply = UNAVAILABLE; }
      throw new TypeError(PREFIX + 'FUNDING_UNAVAILABLE');
    }
  }
  function takeCompletion(value) {
    const captured = completion(value);
    if (seen.has(value)) { uncertain = true; fail('COMPLETION'); }
    seen.add(value);
    return captured;
  }
  const handle = FREEZE(function handle(request, response, transportContext, completionValue) {
    let done;
    try { done = takeCompletion(completionValue); } catch { uncertain = true; return undefined; }
    if (arguments.length !== 4 || closed || active >= MAX_ACTIVE) {
      const sent = write(response, UNAVAILABLE);
      finishCompletion(done, sent); return undefined;
    }
    let method, target, captured = null;
    try {
      method = own(request, 'method'); target = own(request, 'url');
      if (method === 'GET' && target === '/paid') captured = captureOfficialUpfrontHttpsRequest(request, route);
      else if (method !== 'POST' || target !== CREDIT_TARGET) fail('INPUT');
    } catch {
      finishCompletion(done, write(response, BAD)); return undefined;
    }
    if (captured !== null && fundingBusy) {
      finishCompletion(done, write(response, UNAVAILABLE)); return undefined;
    }
    active++; if (captured !== null) fundingBusy = true;
    const cell = { response, completion: done };
    operations.add(cell);
    let finished = false;
    const settle = clean => {
      if (finished) { uncertain = true; return; }
      finished = true; active--;
      if (captured !== null) fundingBusy = false;
      if (!clean) uncertain = true;
      if (cell.completion !== null) finishCompletion(cell.completion, clean);
      cell.completion = null; cell.response = null; operations.delete(cell); finishClose();
    };
    try {
      const operation = captured === null ? serviceHandle(request, response) : funding(request, captured);
      if (!observe(operation, value => {
        // Never write an eventual SDK result after close revoked ingress admission.
        const clean = captured === null ? !closed && value === undefined
          : !closed && cell.response !== null && write(cell.response, value);
        settle(clean);
      }, () => { if (!closed && cell.response !== null) write(cell.response, UNAVAILABLE); settle(false); })) settle(false);
    } catch { if (!closed && cell.response !== null) write(cell.response, UNAVAILABLE); settle(false); }
    request = null; response = null; done = null; transportContext = null;
    return undefined; // Exact native ingress completion contract, not a returned Promise.
  });
  const close = FREEZE(function close(completionValue) {
    let done;
    try { done = takeCompletion(completionValue); } catch { uncertain = true; return undefined; }
    if (arguments.length !== 1) { finishCompletion(done, false); return undefined; }
    if (terminal !== null) { finishCompletion(done, terminal === 'CLOSED'); return undefined; }
    if (closeWaiters.length >= MAX_ACTIVE) { uncertain = true; finishCompletion(done, false); return undefined; }
    closeWaiters.push(done);
    if (closeStarted) return undefined;
    closed = true; closeStarted = true;
    // Drop raw response/completion references while retaining the actual
    // outstanding callback count. A late result cannot turn abort into success.
    for (const cell of operations) {
      uncertain = true;
      if (cell.completion !== null) finishCompletion(cell.completion, false);
      cell.completion = null; cell.response = null;
    }
    for (const entry of payments.values()) closePending(entry);
    try {
      const result = serviceClose();
      if (!observe(result, value => { sessionClosed = true; if (value !== undefined) uncertain = true; finishClose(); },
        () => { sessionClosed = true; uncertain = true; finishClose(); })) {
        sessionClosed = true; uncertain = true;
      }
    } catch { sessionClosed = true; uncertain = true; }
    finishClose(); return undefined;
  });
  const snapshot = FREEZE(function snapshot() {
    if (arguments.length !== 0) fail('INPUT');
    return FREEZE({ phase: terminal ?? (closed ? 'CLOSING' : 'OPEN'),
      activeOperations: active, retainedPayments: payments.size, maxFundingPayments,
      fundingCalls, pendingResumes: resumed, cachedReplies: replayed, pendingCloses,
      serviceSessionClosed: sessionClosed, uncertain, persistence: 'MEMORY_ONLY',
      grantActivation: 'NONE', serviceDelivery: 'NOT_ESTABLISHED' });
  });
  return FREEZE({ handle, close, snapshot });
}
