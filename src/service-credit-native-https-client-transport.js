import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { request as nativeRequest } from 'node:https';
import { OutgoingMessage } from 'node:http';
import { isIP, Socket } from 'node:net';
import { types as utilTypes } from 'node:util';

const REQUEST = nativeRequest, ON = EventEmitter.prototype.on, ONCE = EventEmitter.prototype.once;
const DESTROY_REQUEST = OutgoingMessage.prototype.destroy, DESTROY_SOCKET = Socket.prototype.destroy;
const FREEZE = Object.freeze, DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf;
const KEYS = Reflect.ownKeys, OWN = Object.hasOwn, APPLY = Reflect.apply, IS_PROXY = utilTypes.isProxy;
const NativePromise = Promise, SCHEDULE = setTimeout, CANCEL = clearTimeout;
const BYTE_LENGTH = Buffer.byteLength, IS_BUFFER = Buffer.isBuffer, ALLOC = Buffer.alloc;
const TYPED_ARRAY = PROTO(Uint8Array.prototype);
const ARRAY_BUFFER = DESC(TYPED_ARRAY, 'buffer').get;

/**
 * Explicit native TLS client for the SAME /paid and service-credit origin.
 * Fits the existing (url, options, onResponse) requestImpl contract and returns
 * the ACTUAL ClientRequest, without wrapping its response/body/end interface.
 * No fetch, redirect, request retry, custom hostname verifier, proxy/agent,
 * signer, SDK or store. The caller alone chooses whether to call end().
 *
 * TLS 1.3, certificate/hostname authentication, HTTP/1.1 ALPN, Connection: close
 * and one new native request/socket per call. Source/request limits are
 * cooperative bounds, not an OS network or hostile-code sandbox.
 * This owner observes native handles; it does not claim service delivery.
 */
export function createServiceCreditNativeHttpsClientTransport(configuration) {
  let c, origin, authority, hostname, ca;
  try {
    if (arguments.length !== 1) fail('configuration_rejected');
    c = record(configuration, ['origin', 'ca', 'maxRequestStarts', 'maxConcurrentRequests',
      'requestDeadlineMs', 'handshakeDeadlineMs', 'closeGraceMs']);
    if (typeof c.origin !== 'string' || c.origin.length > 2048 || /[^\x21-\x7e]/.test(c.origin))
      fail('configuration_rejected');
    const url = new URL(c.origin);
    if (url.protocol !== 'https:' || url.origin !== c.origin || url.href !== c.origin + '/'
        || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '')
      fail('configuration_rejected');
    origin = c.origin; authority = url.host;
    hostname = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
    ca = copyCa(c.ca);
    integer(c.maxRequestStarts, 1, 256); integer(c.maxConcurrentRequests, 1, 16);
    if (c.maxConcurrentRequests > c.maxRequestStarts) fail('configuration_rejected');
    integer(c.requestDeadlineMs, 1, 30000); integer(c.handshakeDeadlineMs, 1, c.requestDeadlineMs);
    integer(c.closeGraceMs, 1, 30000);
  } catch { fail('configuration_rejected'); }
  const LIMIT = c.maxRequestStarts, CONCURRENT = c.maxConcurrentRequests;
  const DEADLINE = c.requestDeadlineMs, HANDSHAKE = c.handshakeDeadlineMs, GRACE = c.closeGraceMs;
  const ORIGIN = origin, AUTHORITY = authority, HOSTNAME = hostname;
  configuration = null; c = null; origin = null; authority = null; hostname = null;
  const requests = new Map(), sockets = new Set(), timers = new Set();
  let phase = 'OPEN', unknown = false, starts = 0, authenticated = 0;
  let closing = null, resolveClose, rejectClose, closeTimer = null;

  function timer(callback, milliseconds) {
    let token;
    token = SCHEDULE(() => { timers.delete(token); callback(); }, milliseconds);
    timers.add(token); return token;
  }
  function cancel(token) {
    if (token !== null && timers.delete(token)) CANCEL(token);
  }
  function markUnknown() { unknown = true; }
  function settleClose() {
    if (phase !== 'CLOSING' || requests.size !== 0 || sockets.size !== 0) return;
    cancel(closeTimer); closeTimer = null;
    if (timers.size !== 0) { unknown = true; return; }
    ca.fill(0); ca = null;
    phase = unknown ? 'CLOSE_UNKNOWN' : 'CLOSED';
    if (unknown) rejectClose(error('close_unknown'));
    else resolveClose(FREEZE({ phase: 'CLOSED', trackedRequests: 0, trackedSockets: 0, ownedTimers: 0,
      serviceDelivery: 'NOT_ESTABLISHED' }));
  }
  function destroy(entry, code) {
    markUnknown();
    try { APPLY(DESTROY_REQUEST, entry.request, [error(code)]); } catch {}
  }
  const requestImpl = FREEZE(function requestImpl(resourceUrl, options, onResponse) {
    let target, method, headers;
    try {
      if (arguments.length !== 3 || phase !== 'OPEN' || unknown || starts >= LIMIT
          || requests.size >= CONCURRENT || typeof onResponse !== 'function' || IS_PROXY(onResponse))
        fail('unavailable');
      if (resourceUrl !== ORIGIN + '/paid' && resourceUrl !== ORIGIN + '/service-credit/v1/execute')
        fail('input_rejected');
      const input = record(options, ['method', 'headers', 'agent', 'rejectUnauthorized',
        'maxHeaderSize', 'insecureHTTPParser']);
      target = resourceUrl.slice(ORIGIN.length); method = input.method;
      if (input.agent !== false || input.rejectUnauthorized !== true
          || input.maxHeaderSize !== 16384 || input.insecureHTTPParser !== false
          || method !== (target === '/paid' ? 'GET' : 'POST')) fail('input_rejected');
      // Reject proxies/accessors BEFORE enumerating caller-owned header data.
      if (input.headers === null || typeof input.headers !== 'object' || IS_PROXY(input.headers)
          || PROTO(input.headers) !== Object.prototype) fail('input_rejected');
      const keys = KEYS(input.headers);
      const name = target === '/paid' ? 'Payment-Signature' : 'Authorization';
      if (keys.length === 0 && target === '/paid') headers = {};
      else {
        const found = record(input.headers, [name])[name];
        const limit = target === '/paid' ? 8192 : 1024;
        if (typeof found !== 'string' || found.length < 1 || found.length > limit
            || BYTE_LENGTH(found) > limit || /[^\x20-\x7e]/.test(found)) fail('input_rejected');
        headers = { [name]: found };
      }
    } catch { fail('input_rejected'); }
    // Count before entering native request construction; no automatic retry.
    starts++;
    const entry = { request: null, socket: null, socketSeen: false, peer: false,
      requestClosed: false, deadline: null, handshake: null };
    let request;
    try {
      request = REQUEST(resourceUrl, { method, headers: { ...headers, Host: AUTHORITY, Connection: 'close' },
        agent: false, rejectUnauthorized: true, ca, servername: isIP(HOSTNAME) ? '' : HOSTNAME,
        minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', ALPNProtocols: ['http/1.1'],
        maxHeaderSize: 16384, insecureHTTPParser: false }, response => {
        APPLY(ON, response, ['error', markUnknown]);
        if (phase !== 'OPEN' || !entry.peer) {
          destroy(entry, 'response_unavailable'); response.destroy(); return;
        }
        try { onResponse(response); } catch { destroy(entry, 'response_callback_failed'); response.destroy(); }
      });
      entry.request = request; requests.set(request, entry);
      entry.deadline = timer(() => { entry.deadline = null; destroy(entry, 'deadline'); }, DEADLINE);
      APPLY(ON, request, ['error', markUnknown]);
      APPLY(ONCE, request, ['close', () => {
        entry.requestClosed = true;
        cancel(entry.deadline); entry.deadline = null;
        cancel(entry.handshake); entry.handshake = null;
        if (!entry.socketSeen) markUnknown();
        requests.delete(request); settleClose();
      }]);
      APPLY(ONCE, request, ['socket', socket => {
        if (entry.socketSeen || entry.requestClosed) {
          markUnknown(); try { APPLY(DESTROY_SOCKET, socket, []); } catch {} return;
        }
        entry.socketSeen = true; entry.socket = socket; sockets.add(socket);
        entry.handshake = timer(() => { entry.handshake = null; destroy(entry, 'tls_deadline'); }, HANDSHAKE);
        APPLY(ON, socket, ['error', markUnknown]);
        APPLY(ONCE, socket, ['close', () => {
          cancel(entry.handshake); entry.handshake = null;
          sockets.delete(socket); settleClose();
        }]);
        APPLY(ONCE, socket, ['secureConnect', () => {
          cancel(entry.handshake); entry.handshake = null;
          if (phase !== 'OPEN' || socket.authorized !== true || socket.getProtocol() !== 'TLSv1.3'
              || socket.alpnProtocol !== 'http/1.1') { destroy(entry, 'tls_binding_rejected'); return; }
          entry.peer = true; authenticated++;
        }]);
      }]);
      return request;
    } catch { markUnknown(); if (entry.request !== null) destroy(entry, 'native_request_failed'); fail('native_request_failed'); }
    finally { resourceUrl = null; options = null; headers = null; }
  });
  const close = FREEZE(function close() {
    if (arguments.length !== 0) fail('input_rejected');
    if (closing !== null) return closing;
    closing = new NativePromise((resolve, reject) => { resolveClose = resolve; rejectClose = reject; });
    Object.defineProperty(closing, 'constructor', { value: NativePromise });
    phase = 'CLOSING';
    closeTimer = timer(() => {
      closeTimer = null; unknown = true; phase = 'CLOSE_UNKNOWN';
      rejectClose(error('close_unknown')); // A late close never repairs this verdict.
    }, GRACE);
    for (const entry of requests.values()) destroy(entry, 'close_requested');
    for (const socket of sockets) { try { APPLY(DESTROY_SOCKET, socket, []); } catch { markUnknown(); } }
    settleClose();
    return closing;
  });
  const snapshot = FREEZE(function snapshot() {
    if (arguments.length !== 0) fail('input_rejected');
    return FREEZE({ phase, unknown, requestStarts: starts, authenticatedTlsHandshakes: authenticated,
      trackedRequests: requests.size, trackedSockets: sockets.size, ownedTimers: timers.size,
      defaultEnabled: false, nativeImplementation: true, serviceDelivery: 'NOT_ESTABLISHED' });
  });
  return FREEZE({ requestImpl, close, snapshot });
}
function record(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value) !== Object.prototype || KEYS(value).length !== fields.length) fail('input_rejected');
  const result = {};
  for (const field of fields) {
    const d = DESC(value, field);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail('input_rejected');
    Object.defineProperty(result, field, { value: d.value, enumerable: true });
  }
  return result;
}
function copyCa(value) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value) || !IS_BUFFER(value)
      || PROTO(value) !== Buffer.prototype || utilTypes.isSharedArrayBuffer(APPLY(ARRAY_BUFFER, value, [])))
    fail('configuration_rejected');
  const keys = KEYS(value);
  if (keys.length < 1 || keys.length > 65536) fail('configuration_rejected');
  const bytes = ALLOC(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const d = DESC(value, String(i));
    if (!d || !OWN(d, 'value') || !d.enumerable || !Number.isInteger(d.value)
        || d.value < 0 || d.value > 255) fail('configuration_rejected');
    bytes[i] = d.value;
  }
  return bytes;
}
function integer(value, low, high) {
  if (!Number.isSafeInteger(value) || value < low || value > high || Object.is(value, -0))
    fail('configuration_rejected');
}
function error(kind) {
  const code = 'service_credit_native_https_client_' + kind, e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code });
  return FREEZE(e);
}
function fail(kind) { throw error(kind); }

