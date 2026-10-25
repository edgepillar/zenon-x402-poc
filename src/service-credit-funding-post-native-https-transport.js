import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { request as nativeRequest } from 'node:https';
import { OutgoingMessage } from 'node:http';
import { Socket, isIP } from 'node:net';
import { types as utilTypes } from 'node:util';
import { createFundingPostNativeResponseCustody } from './service-credit-funding-post-native-response.js';
import { createNativeHttpsClientCloseOwner } from './service-credit-native-client-close-owner.js';
import { createNativeHttpsClientRequestStopOwner } from './service-credit-native-client-request-stop-owner.js';
import { startFundingPostReadableFlow } from './service-credit-funding-post-readable-flow.js';

const REQUEST = nativeRequest, ON = EventEmitter.prototype.on, ONCE = EventEmitter.prototype.once;
const DESTROY_REQUEST = OutgoingMessage.prototype.destroy, DESTROY_SOCKET = Socket.prototype.destroy;
const FREEZE = Object.freeze, DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, OWN = Object.hasOwn, APPLY = Reflect.apply, IS_PROXY = utilTypes.isProxy;
const TIMER = setTimeout, CANCEL = clearTimeout, FILL = Buffer.prototype.fill;
const NativePromise = Promise, THEN = NativePromise.prototype.then, RESPONSE = Response, HEADERS = Headers;
const IS_BUFFER = Buffer.isBuffer, ARRAY_BUFFER = DESC(PROTO(Uint8Array.prototype), 'buffer').get;
const START_RESPONSE_FLOW = startFundingPostReadableFlow;
const REQUEST_STOP = createNativeHttpsClientRequestStopOwner;
const STOP_REQUEST = FREEZE(request => APPLY(DESTROY_REQUEST, request, [error('outcome_unknown')]));
const STOP_SOCKET = FREEZE(socket => APPLY(DESTROY_SOCKET, socket, []));
const BYTE_LENGTH = DESC(PROTO(Uint8Array.prototype), 'byteLength').get;
const SIGNAL = AbortSignal.prototype, SIGNAL_ABORTED = DESC(SIGNAL, 'aborted').get;
const ADD_EVENT = EventTarget.prototype.addEventListener, REMOVE_EVENT = EventTarget.prototype.removeEventListener;
const SAFE_NATIVE_CODES = new Set(['ERR_ACCESS_DENIED', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'EPROTO', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE',
  'EAI_AGAIN', 'ENOTFOUND', 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR']);

/**
 * Default-off actual native TLS transport for one fixed funding POST-v1 URL.
 * Exposes the existing fetchImpl contract but never calls global fetch.
 * No redirects, installer, SDK, signer, SQLite, proxy, retry or custom verifier.
 * One request at a time; at most two starts (challenge then original payment).
 *
 * Exact POST/no-body/header/AbortSignal input precedes native request entry.
 * Actual TLS 1.3/certificate/hostname/HTTP-1.1 checks precede response custody.
 * The shared custody owns at most 64 body bytes and exposes them only after
 * exact end AND the actual request/socket close observations. Do not equate
 * fetch-Promise settlement with funding success or store-close authority.
 *
 * Timeout, abort, malformed response or native error permanently vetoes new
 * starts and clean owner close. Late native drain may release the local CA
 * copy once; it cannot repair UNKNOWN or authorize a payment retry.
 * No operation starts at construction. This native graph is SOURCE ONLY until
 * a separately reviewed actual TLS qualification, not merely its component test.
 */
export function createFundingPostNativeHttpsTransport(configuration) {
  let c, resource, ca, hostname, authority;
  try {
    if (arguments.length !== 1) fail('configuration_rejected');
    c = record(configuration, ['resourceUrl', 'ca', 'maxRequestStarts',
      'requestDeadlineMs', 'handshakeDeadlineMs', 'closeGraceMs']);
    resource = resourceUrl(c.resourceUrl);
    const url = new URL(resource); authority = url.host;
    hostname = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
    ca = copyCa(c.ca);
    integer(c.maxRequestStarts, 1, 2); integer(c.requestDeadlineMs, 1, 60000);
    integer(c.handshakeDeadlineMs, 1, c.requestDeadlineMs); integer(c.closeGraceMs, 1, 30000);
  } catch { fail('configuration_rejected'); }
  const URL_VALUE = resource, AUTHORITY = authority, HOSTNAME = hostname;
  const MAX_STARTS = c.maxRequestStarts, DEADLINE = c.requestDeadlineMs;
  const HANDSHAKE = c.handshakeDeadlineMs, GRACE = c.closeGraceMs;
  configuration = null; c = null; resource = null; hostname = null; authority = null;
  const entries = new Set(), sockets = new Set(), timers = new Set();
  let starts = 0, handshakes = 0, closing = null, closeTimer = null, unknown = false;
  let responseHeadersAccepted = 0, responseBodyBytesObserved = 0, responseEndsObserved = 0;
  let responseFlowsStarted = 0;
  // Bounded event/entry counters, not evidence of unobserved native paths.
  let socketAssignmentsObserved = 0, stoppedSocketAssignmentsObserved = 0;
  let handshakeTimerStartAttempts = 0, requestClosesWithoutSocketObserved = 0;
  // Bounded stage/code observations only. Never retain an Error/message/stack,
  // URL, header, certificate, response body or caller-provided diagnostic text.
  // Authored after the first native failure; these diagnostics are SOURCE ONLY.
  let lastObservedStage = 'CONSTRUCTED', firstUnknown = null;
  const closeOwner = createNativeHttpsClientCloseOwner({
    readObservedCounts: FREEZE(() => FREEZE({ requests: entries.size, sockets: sockets.size,
      timers: timers.size - (closeTimer !== null && timers.has(closeTimer) ? 1 : 0) })),
    releaseLocalMaterial: FREEZE(() => {
      cancel(closeTimer); closeTimer = null;
      if (ca !== null) { APPLY(FILL, ca, [0]); ca = null; }
    }),
  });
  function cancel(token) { if (token !== null && timers.delete(token)) CANCEL(token); }
  function timer(fn, delay) {
    let token;
    token = TIMER(() => { timers.delete(token); try { fn(); } finally { closeOwner.observe(); } }, delay);
    timers.add(token); return token;
  }
  function markUnknown(reason, cause = null) {
    if (firstUnknown === null) {
      let nativeCode = null;
      try {
        if (cause !== null && typeof cause === 'object' && !IS_PROXY(cause)) {
          const descriptor = DESC(cause, 'code');
          if (descriptor && OWN(descriptor, 'value') && typeof descriptor.value === 'string')
            nativeCode = SAFE_NATIVE_CODES.has(descriptor.value) ? descriptor.value : 'OTHER';
        }
      } catch { nativeCode = 'UNAVAILABLE'; }
      firstUnknown = FREEZE({ reason, lastObservedStage, nativeCode });
    }
    unknown = true; closeOwner.markUnknown();
  }
  function settle(entry) {
    // A synchronous callback during resume must not publish a response before
    // that flow-start entry has returned successfully and its guard survives.
    if (entry.responseFlowStarting) return;
    if (!entry.requestClosed) return;
    // A closed request without an observed socket is uncertain, not a live
    // request reference. A later socket is still tracked by its own close
    // listener below and never obtains a handshake capability.
    if (!entry.socketSeen) stop(entry, 'REQUEST_CLOSE_WITHOUT_SOCKET');
    else if (!entry.socketClosed) return;
    cancel(entry.deadline); entry.deadline = null;
    cancel(entry.handshake); entry.handshake = null;
    if (entry.signalAttached) {
      try { APPLY(REMOVE_EVENT, entry.signal, ['abort', entry.onAbort]); }
      catch (cause) { markUnknown('ABORT_LISTENER_RELEASE_FAILED', cause); entry.custody.fail(); }
      entry.signalAttached = false;
    }
    entries.delete(entry); closeOwner.observe();
    if (entry.done) return;
    entry.done = true;
    try {
      if (unknown || closing !== null) fail('outcome_unknown');
      const data = entry.custody.takeResponse();
      try {
        // Copy into response-owned bytes before clearing the detached handoff.
        const body = new Uint8Array(data.body);
        const headers = new HEADERS(data.headerPairs);
        const response = new RESPONSE(body, { status: data.statusCode, headers });
        entry.resolve(FREEZE({ url: URL_VALUE, redirected: false, status: data.statusCode,
          headers: response.headers, body: response.body }));
      } finally { APPLY(FILL, data.body, [0]); }
    } catch (cause) { markUnknown('RESPONSE_HANDOFF_FAILED', cause); entry.reject(error('outcome_unknown')); }
  }
  function stop(entry, reason, cause = null) {
    markUnknown(reason, cause); entry.custody.fail();
    if (!entry.done) { entry.done = true; entry.reject(error('outcome_unknown')); }
    entry.stopping = true;
    // Claim each destroy before native entry. Reentry, throws and repeated
    // reasons cannot destroy an already closed handle or acquire a new claim.
    entry.stop.stop('funding_transport_unknown');
  }
  function event(entry, stage, operation) {
    try { if (entry.stopping) return; operation(); lastObservedStage = stage; }
    catch (cause) { stop(entry, stage + '_REJECTED', cause); }
  }
  const fetchImpl = FREEZE(function fetchImpl(url, options) {
    let headers, signal;
    try {
      if (arguments.length !== 2 || unknown || closing !== null || entries.size !== 0 || starts >= MAX_STARTS
          || url !== URL_VALUE) fail('input_rejected');
      const o = record(options, ['method', 'redirect', 'cache', 'credentials', 'headers', 'signal']);
      if (o.method !== 'POST' || o.redirect !== 'manual' || o.cache !== 'no-store' || o.credentials !== 'omit')
        fail('input_rejected');
      if (typeof o.headers !== 'object' || o.headers === null || IS_PROXY(o.headers)
          || PROTO(o.headers) !== Object.prototype) fail('input_rejected');
      const keys = KEYS(o.headers);
      const h = record(o.headers, keys.length === 1 ? ['Content-Length'] : ['Content-Length', 'PAYMENT-SIGNATURE']);
      if (h['Content-Length'] !== '0') fail('input_rejected');
      headers = { 'Content-Length': '0' };
      if (keys.length === 2) {
        const payment = h['PAYMENT-SIGNATURE'];
        if (typeof payment !== 'string' || payment.length < 1 || payment.length > 8192
            || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payment))
          fail('input_rejected');
        headers['PAYMENT-SIGNATURE'] = payment;
      }
      signal = o.signal;
      if (typeof signal !== 'object' || signal === null || IS_PROXY(signal) || PROTO(signal) !== SIGNAL
          || APPLY(SIGNAL_ABORTED, signal, []) !== false) fail('input_rejected');
    } catch { return rejected('input_rejected'); }
    starts++;
    let resolve, reject;
    const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
    Object.defineProperty(promise, 'constructor', { value: NativePromise });
    APPLY(THEN, promise, [() => undefined, () => undefined]);
    const entry = { resolve, reject, done: false, stopping: false, request: null, socket: null,
      socketSeen: false, requestClosed: false, socketClosed: false, signal, signalAttached: false,
      deadline: null, handshake: null, custody: createFundingPostNativeResponseCustody(), onAbort: null,
      responseFlowStarted: false, responseFlowStarting: false,
      stop: REQUEST_STOP({ destroyRequest: STOP_REQUEST, destroySocket: STOP_SOCKET }) };
    entries.add(entry); // Retain ownership before the native constructor can reenter.
    entry.onAbort = () => stop(entry, 'REQUEST_ABORT');
    try {
      APPLY(ADD_EVENT, signal, ['abort', entry.onAbort, { once: true }]); entry.signalAttached = true;
      if (APPLY(SIGNAL_ABORTED, signal, []) !== false) throw error('outcome_unknown');
      entry.request = REQUEST(URL_VALUE, {
        method: 'POST', headers: { ...headers, Host: AUTHORITY, Connection: 'close' },
        agent: false, rejectUnauthorized: true, ca, servername: isIP(HOSTNAME) ? '' : HOSTNAME,
        minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', ALPNProtocols: ['http/1.1'],
        maxHeaderSize: 16384, insecureHTTPParser: false,
      }, response => {
        APPLY(ON, response, ['error', cause => stop(entry, 'RESPONSE_ERROR', cause)]);
        APPLY(ON, response, ['aborted', () => stop(entry, 'RESPONSE_ABORTED')]);
        event(entry, 'RESPONSE_HEADERS', () => {
          entry.custody.acceptHeaders({ statusCode: response.statusCode, rawHeaders: response.rawHeaders });
          responseHeadersAccepted++;
        });
        APPLY(ON, response, ['data', chunk => event(entry, 'RESPONSE_BODY', () => {
          const before = entry.custody.snapshot().receivedBytes;
          entry.custody.acceptChunk(chunk);
          responseBodyBytesObserved += entry.custody.snapshot().receivedBytes - before;
        })]);
        APPLY(ONCE, response, ['end', () => event(entry, 'RESPONSE_END', () => {
          if (response.complete !== true || response.rawTrailers.length !== 0) throw error('outcome_unknown');
          entry.custody.acceptEnd();
          responseEndsObserved++;
        })]);
        APPLY(ONCE, response, ['close', () => {
          if (!entry.custody.snapshot().ended) stop(entry, 'INCOMPLETE_RESPONSE_CLOSE');
        }]);
        // Captured EventEmitter.on does not start Readable data flow. Install
        // ALL response guards first, then enter the captured real resume once.
        // A refused/aborted response never receives a fresh flow capability.
        event(entry, 'RESPONSE_FLOW_STARTED', () => {
          if (entry.done || entry.responseFlowStarted) throw error('outcome_unknown');
          entry.responseFlowStarted = true; entry.responseFlowStarting = true;
          try { START_RESPONSE_FLOW(response); }
          finally { entry.responseFlowStarting = false; }
          if (entry.stopping || closing !== null) throw error('outcome_unknown');
          responseFlowsStarted++;
        });
        settle(entry);
      });
      APPLY(ON, entry.request, ['error', cause => stop(entry, 'REQUEST_ERROR', cause)]);
      APPLY(ONCE, entry.request, ['close', () => {
        if (!entry.socketSeen) requestClosesWithoutSocketObserved++;
        entry.requestClosed = true;
        entry.stop.markRequestClosed(); entry.request = null;
        event(entry, 'REQUEST_CLOSE', () => entry.custody.acceptRequestClose()); settle(entry);
      }]);
      APPLY(ONCE, entry.request, ['socket', socket => {
        if (entry.socketSeen) {
          stop(entry, 'SOCKET_ASSIGNMENT_REJECTED'); try { APPLY(DESTROY_SOCKET, socket, []); } catch {} return;
        }
        entry.socketSeen = true; entry.socket = socket; sockets.add(socket);
        socketAssignmentsObserved++;
        lastObservedStage = 'SOCKET_ASSIGNED';
        APPLY(ON, socket, ['error', cause => stop(entry, 'SOCKET_ERROR', cause)]);
        // Track the genuine close BEFORE attach/stop may destroy this handle.
        // A socket assigned after request close/abort still belongs to us.
        APPLY(ONCE, socket, ['close', hadError => {
          entry.stop.markSocketClosed(); entry.socket = null;
          entry.socketClosed = true; sockets.delete(socket);
          cancel(entry.handshake); entry.handshake = null;
          event(entry, 'SOCKET_CLOSE', () => entry.custody.acceptSocketClose({ hadError })); settle(entry);
        }]);
        if (entry.requestClosed || closing !== null || entry.stopping) {
          stoppedSocketAssignmentsObserved++; stop(entry, 'LATE_SOCKET_STOP');
        }
        if (!entry.stop.attachSocket(socket)) { stop(entry, 'SOCKET_ASSOCIATION_REJECTED'); return; }
        if (!entry.stop.canStartHandshake()) { closeOwner.observe(); return; }
        handshakeTimerStartAttempts++;
        entry.handshake = timer(() => stop(entry, 'TLS_DEADLINE'), HANDSHAKE);
        APPLY(ONCE, socket, ['secureConnect', () => {
          cancel(entry.handshake); entry.handshake = null;
          event(entry, 'TLS_AUTHENTICATED', () => {
            if (!entry.stop.canStartHandshake() || closing !== null
                || socket.authorized !== true || socket.getProtocol() !== 'TLSv1.3'
                || socket.alpnProtocol !== 'http/1.1') throw error('outcome_unknown');
            entry.custody.acceptTls(); handshakes++;
          });
        }]);
      }]);
      // Association may stop a request whose abort happened during creation;
      // all owned error/close/socket listeners are installed before that entry.
      if (!entry.stop.attachRequest(entry.request) || entry.stopping || entry.requestClosed || closing !== null)
        throw error('outcome_unknown');
      entry.deadline = timer(() => stop(entry, 'REQUEST_DEADLINE'), DEADLINE);
      if (entry.stopping || closing !== null) throw error('outcome_unknown');
      entry.request.end(); // The only end entry: fixed POST with zero body.
      lastObservedStage = 'REQUEST_ENDED';
    } catch (cause) { stop(entry, 'REQUEST_CREATE_OR_END_FAILED', cause); }
    finally { url = null; options = null; headers = null; signal = null; }
    return promise;
  });
  const close = FREEZE(function close() {
    if (arguments.length !== 0) return rejected('input_rejected');
    if (closing !== null) return closing;
    closing = closeOwner.beginClose();
    APPLY(THEN, closing, [() => undefined, () => undefined]);
    try { closeTimer = timer(() => { closeTimer = null; closeOwner.deadlineExpired(); }, GRACE); }
    catch (cause) { markUnknown('CLOSE_TIMER_FAILED', cause); closeOwner.deadlineExpired(); }
    for (const entry of entries) stop(entry, 'OWNER_CLOSE_WITH_ACTIVE_REQUEST');
    closeOwner.observe(); return closing;
  });
  const snapshot = FREEZE(function snapshot() {
    if (arguments.length !== 0) fail('input_rejected');
    const state = closeOwner.snapshot();
    return FREEZE({ phase: state.phase, unknown: unknown || state.unknown,
      requestStarts: starts, authenticatedTlsHandshakes: handshakes,
      responseHeadersAccepted, responseBodyBytesObserved, responseEndsObserved, responseFlowsStarted,
      socketAssignmentsObserved, stoppedSocketAssignmentsObserved,
      handshakeTimerStartAttempts, requestClosesWithoutSocketObserved,
      lastObservedStage, firstUnknown,
      trackedRequests: entries.size, trackedSockets: sockets.size, ownedTimers: timers.size,
      close: state, defaultEnabled: false,
      nativeImplementation: true, nativeRuntimeQualified: false, authority: 'NONE' });
  });
  return FREEZE({ fetchImpl, close, snapshot });
}
function record(value, fields) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value)
      || PROTO(value) !== Object.prototype || KEYS(value).length !== fields.length) fail('input_rejected');
  const out = {};
  for (const field of fields) {
    const d = DESC(value, field);
    if (!d || !d.enumerable || !OWN(d, 'value')) fail('input_rejected');
    Object.defineProperty(out, field, { value: d.value, enumerable: true });
  }
  return out;
}
function resourceUrl(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[^\x21-\x7e]/.test(value)) fail('input_rejected');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.href !== value || url.username || url.password || url.search || url.hash
      || url.pathname === '/' || !/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+(?:\/[A-Za-z0-9\-._~!$&'()*+,;=:@]+)*$/.test(url.pathname)
      || /(?:^|\/)\.{1,2}(?:\/|$)/.test(url.pathname)) fail('input_rejected');
  return value;
}
function copyCa(value) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value) || !IS_BUFFER(value)
      || PROTO(value) !== Buffer.prototype || utilTypes.isSharedArrayBuffer(APPLY(ARRAY_BUFFER, value, [])))
    fail('configuration_rejected');
  const size = APPLY(BYTE_LENGTH, value, []);
  if (size < 1 || size > 65536) fail('configuration_rejected');
  const keys = KEYS(value);
  if (keys.length !== size) fail('configuration_rejected');
  const copy = Buffer.alloc(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const d = DESC(value, String(i));
    if (!d || !OWN(d, 'value') || !d.enumerable || !Number.isInteger(d.value) || d.value < 0 || d.value > 255)
      fail('configuration_rejected');
    copy[i] = d.value;
  }
  return copy;
}
function integer(value, low, high) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < low || value > high) fail('input_rejected');
}
function error(kind) {
  const code = 'FUNDING_POST_NATIVE_HTTPS_' + kind.toUpperCase(), e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code });
  return FREEZE(e);
}
function fail(kind) { throw error(kind); }
function rejected(kind) { const p = NativePromise.reject(error(kind)); APPLY(THEN, p, [() => undefined, () => undefined]); return p; }
