import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { captureFundingPostCheckpointRoute } from './x402-funding-post-checkpoint-route.js';

const F = Object.freeze, PROTO = Object.getPrototypeOf, DESC = Object.getOwnPropertyDescriptor;
const KEYS = Reflect.ownKeys, OWN = Object.hasOwn, APPLY = Reflect.apply;
const IS_PROXY = utilTypes.isProxy, IS_ARRAY = Array.isArray, SAFE = Number.isSafeInteger;
const LOWER = String.prototype.toLowerCase, BYTES = Buffer.byteLength;
const HAS = WeakSet.prototype.has, ADD = WeakSet.prototype.add, routes = new WeakSet();
const NON_TOKEN = /[^!#$%&'*+\-.^_\x60|~0-9A-Za-z]/, NON_ASCII = /[^\x20-\x7e]/;

/**
 * Closed POST /funding application-DATA route, separate from GET /paid.
 * A private route identity prevents caller-constructed route substitution. This
 * is not a native handle brand, certificate/method signature or payment permit.
 */
export function captureOfficialFundingPostHttpsRoute(resourceUrl) {
  if (arguments.length !== 1) fail();
  let route;
  try { route = captureFundingPostCheckpointRoute(resourceUrl); } catch { fail(); }
  APPLY(ADD, routes, [route]);
  return route;
}

/**
 * Descriptor-only HTTP/1.1 POST/Host/target/zero-body admission BEFORE SDK entry.
 * No stream, socket, decoder, signer, settlement or funding-intake call exists.
 * The declared encrypted flag is still a trusted native-host premise, not TLS
 * authentication. Only a qualified actual ingress can supply that evidence.
 */
export function captureOfficialFundingPostHttpsRequest(request, route) {
  try {
    if (arguments.length !== 2 || !APPLY(HAS, routes, [route])) fail();
    if (own(request, 'method') !== 'POST' || own(request, 'url') !== '/funding'
        || own(request, 'httpVersion') !== '1.1' || own(own(request, 'socket'), 'encrypted') !== true) fail();
    const raw = own(request, 'rawHeaders');
    if (raw === null || typeof raw !== 'object' || IS_PROXY(raw) || !IS_ARRAY(raw)
        || PROTO(raw) !== Array.prototype) fail();
    const length = DESC(raw, 'length');
    if (!length || !OWN(length, 'value') || !SAFE(length.value) || length.value < 2
        || length.value > 128 || length.value % 2 !== 0 || KEYS(raw).length !== length.value + 1) fail();
    const headers = Object.create(null); let bytes = 0;
    for (let index = 0; index < length.value; index += 2) {
      const name = own(raw, String(index)), value = own(raw, String(index + 1));
      if (typeof name !== 'string' || name.length < 1 || name.length > 256 || NON_TOKEN.test(name)
          || typeof value !== 'string' || value.length > 8192 || NON_ASCII.test(value)) fail();
      bytes += APPLY(BYTES, Buffer, [name]) + APPLY(BYTES, Buffer, [value]) + 4;
      if (bytes > 16384) fail();
      const key = APPLY(LOWER, name, []);
      if (OWN(headers, key)) fail();
      headers[key] = value;
    }
    if (headers.host !== route.authority
        || OWN(headers, 'content-length') && headers['content-length'] !== '0'
        || ['transfer-encoding','expect','upgrade','trailer'].some(name => OWN(headers, name))) fail();
    if (OWN(headers, 'connection')) {
      const connection = APPLY(LOWER, headers.connection, []);
      if (connection !== 'close' && connection !== 'keep-alive') fail();
    }
    const paymentSignature = OWN(headers, 'payment-signature') ? headers['payment-signature'] : null;
    if (paymentSignature !== null && (paymentSignature.length < 1 || paymentSignature.length > 8192
        || /\s/.test(paymentSignature))) fail();
    return F({ method: 'POST', requestTarget: '/funding', resourceUrl: route.resourceUrl, paymentSignature });
  } catch { fail(); }
}
function own(value, key) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)) fail();
  const d = DESC(value, key);
  if (!d || !OWN(d, 'value') || !d.enumerable) fail();
  return d.value;
}
function fail() {
  const code = 'x402_official_funding_post_https_request_binding_rejected', e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code });
  throw F(e);
}

