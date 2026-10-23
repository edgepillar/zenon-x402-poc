import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { URL } from 'node:url';

const PROTO = Object.getPrototypeOf, DESC = Object.getOwnPropertyDescriptor;
const OWN = Object.hasOwn, KEYS = Reflect.ownKeys, FREEZE = Object.freeze;
const IS_PROXY = utilTypes.isProxy, IS_ARRAY = Array.isArray, SAFE = Number.isSafeInteger;
const ARRAY = Array.prototype;
const FROM_URL = URL, BYTES = Buffer.byteLength, APPLY = Reflect.apply;
const LOWER = String.prototype.toLowerCase, HAS = WeakSet.prototype.has, ADD = WeakSet.prototype.add;
const routes = new WeakSet();
const NON_TOKEN = /[^!#$%&'*+\-.^_\x60|~0-9A-Za-z]/;
const NON_ASCII = /[^\x20-\x7e]/;
const MAX_HEADER_BYTES = 16384, MAX_HEADER_PAIRS = 64, MAX_PAYMENT_HEADER_BYTES = 8192;

/**
 * A closed route binding for the existing official single-GET /paid profile.
 * This binds application DATA; it does not authenticate a listener or peer.
 * The physical HTTPS ingress, body drain, socket ownership and response writer
 * remain owned by the host. There is no I/O, decoder, settlement or retry here.
 */
export function captureOfficialUpfrontHttpsRoute(resourceUrl) {
  try {
    if (arguments.length !== 1 || typeof resourceUrl !== 'string'
        || resourceUrl.length > 2048 || NON_ASCII.test(resourceUrl)) fail();
    const parsed = new FROM_URL(resourceUrl);
    if (parsed.protocol !== 'https:' || parsed.href !== resourceUrl
        || parsed.username !== '' || parsed.password !== ''
        || parsed.pathname !== '/paid' || parsed.search !== '' || parsed.hash !== ''
        || parsed.host === '') fail();
    const route = FREEZE({ resourceUrl, authority: parsed.host, requestTarget: '/paid' });
    APPLY(ADD, routes, [route]);
    return route;
  } catch { fail(); }
}

/**
 * Snapshot own native-IncomingMessage-style fields without getters, proxies,
 * joined headers or normalization. Require HTTP/1.1, the exact canonical Host,
 * exact GET target, declared TLS and zero-body framing before any SDK callback.
 * The encrypted flag is a trusted-host premise, not native TLS authentication.
 * No stream is read or retained. A frozen copied header is still untrusted DATA
 * until the existing official application decoder and settlement owner accept it.
 */
export function captureOfficialUpfrontHttpsRequest(request, route) {
  try {
    if (arguments.length !== 2 || !APPLY(HAS, routes, [route])) fail();
    if (own(request, 'method') !== 'GET' || own(request, 'url') !== route.requestTarget
        || own(request, 'httpVersion') !== '1.1' || own(own(request, 'socket'), 'encrypted') !== true)
      fail();
    const raw = own(request, 'rawHeaders');
    if (raw === null || typeof raw !== 'object' || IS_PROXY(raw)
        || !IS_ARRAY(raw) || PROTO(raw) !== ARRAY) fail();
    const length = DESC(raw, 'length');
    if (!length || !OWN(length, 'value') || !SAFE(length.value)
        || length.value < 2 || length.value > MAX_HEADER_PAIRS * 2
        || length.value % 2 !== 0 || KEYS(raw).length !== length.value + 1) fail();
    const headers = Object.create(null);
    let bytes = 0;
    for (let index = 0; index < length.value; index += 2) {
      const name = own(raw, String(index)), value = own(raw, String(index + 1));
      if (typeof name !== 'string' || name.length < 1 || name.length > 256
          || NON_TOKEN.test(name) || typeof value !== 'string' || value.length > 8192
          || NON_ASCII.test(value)) fail();
      bytes += APPLY(BYTES, Buffer, [name]) + APPLY(BYTES, Buffer, [value]) + 4;
      if (bytes > MAX_HEADER_BYTES) fail();
      const key = APPLY(LOWER, name, []);
      if (OWN(headers, key)) fail();
      headers[key] = value;
    }
    if (headers.host !== route.authority
        || OWN(headers, 'content-length') && headers['content-length'] !== '0'
        || ['transfer-encoding', 'expect', 'upgrade', 'trailer'].some(key => OWN(headers, key)))
      fail();
    if (OWN(headers, 'connection')) {
      const connection = APPLY(LOWER, headers.connection, []);
      if (connection !== 'close' && connection !== 'keep-alive') fail();
    }
    const paymentSignature = OWN(headers, 'payment-signature') ? headers['payment-signature'] : null;
    if (paymentSignature !== null && (paymentSignature.length < 1
        || paymentSignature.length > MAX_PAYMENT_HEADER_BYTES || /\s/.test(paymentSignature)))
      fail();
    return FREEZE({ method: 'GET', requestTarget: route.requestTarget,
      resourceUrl: route.resourceUrl, paymentSignature });
  } catch { fail(); }
}

function own(value, key) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)) fail();
  const descriptor = DESC(value, key);
  if (!descriptor || !OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
  return descriptor.value;
}
function fail() {
  const code = 'x402_official_https_request_binding_input_rejected', error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw FREEZE(error);
}
