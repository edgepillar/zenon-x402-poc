import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';

const F = Object.freeze, CREATE = Object.create, DEFINE = Object.defineProperty;
const DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf, KEYS = Reflect.ownKeys;
const HAS = Object.hasOwn, APPLY = Reflect.apply, FROZEN = Object.isFrozen, INTEGER = Number.isSafeInteger;
const IS_PROXY = utilTypes.isProxy, IS_SHARED = utilTypes.isSharedArrayBuffer, IS_BUFFER = Buffer.isBuffer;
const OBJECT = Object.prototype, BUFFER = Buffer.prototype, ALLOC = Buffer.alloc, COPY = BUFFER.copy, FILL = BUFFER.fill;
const TYPED = PROTO(Uint8Array.prototype), LENGTH = DESC(TYPED, 'byteLength').get, STORAGE = DESC(TYPED, 'buffer').get;
const ERROR = TypeError;

/**
 * Internal, named local-qualification selection, NOT a production route.
 * No socket, TLS parser, SDK, SQL, key, signer, filesystem or global CA mutation.
 * A fixed localhost/127.0.0.1 route, unprivileged fixed port, closed role/path and
 * explicit owned copy of <=64 KiB CA DATA are the only added policy. Syntax is
 * not certificate validation; the actual TLS core must still authenticate it.
 * The caller owns the returned CA copy and its release; borrowed bytes are never
 * retained or cleared here. A selection/result is not human execution authority.
 */
export function captureNativeReadLoopbackQualificationRoute(route, options, profileName) {
  let copy = null;
  try {
    if (arguments.length !== 3) refuse();
    const r = exact(route, ['hostname', 'path', 'ipv4Address']), o = optionsValue(options);
    const account = profileName === 'zenon_account_state_retained_candidate';
    if (!account && profileName !== 'dynamic_plasma_retained_candidate') refuse();
    if (r.hostname !== 'localhost' || r.ipv4Address !== '127.0.0.1'
        || (account ? r.path !== '/rpc/account' : r.path !== '/rpc/first' && r.path !== '/rpc/second')) refuse();
    const length = caLength(o.ca);
    copy = APPLY(ALLOC, Buffer, [length]);
    if (APPLY(COPY, o.ca, [copy, 0, 0, length]) !== length) refuse();
    return record({ hostname: 'localhost', path: r.path, ipv4Address: '127.0.0.1',
      port: o.port, ca: copy, qualificationOnly: true, trustMode: 'explicit-ca-loopback-qualification',
      productionRouteQualified: false, authority: 'NONE' });
  } catch {
    if (copy !== null) { try { APPLY(FILL, copy, [0]); } catch {} }
    refuse();
  }
}
export function nativeReadLoopbackQualificationFundingResourceUrl(options) {
  if (arguments.length !== 1) refuse();
  const o = optionsValue(options); caLength(o.ca);
  return 'https://127.0.0.1:' + o.port + '/funding';
}
function optionsValue(options) {
  const o = exact(options, ['port', 'ca']);
  if (!INTEGER(o.port) || o.port < 1024 || o.port > 65535) refuse();
  return o;
}
function caLength(value) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value) || !APPLY(IS_BUFFER, Buffer, [value])
      || PROTO(value) !== BUFFER || IS_SHARED(APPLY(STORAGE, value, []))) refuse();
  const length = APPLY(LENGTH, value, []);
  if (!INTEGER(length) || length < 1 || length > 65536 || KEYS(value).length !== length) refuse();
  return length;
}
function exact(value, fields) {
  if (typeof value !== 'object' || value === null || IS_PROXY(value)
      || (PROTO(value) !== OBJECT && PROTO(value) !== null) || !FROZEN(value) || KEYS(value).length !== fields.length) refuse();
  const out = CREATE(null);
  for (const name of fields) {
    const d = DESC(value, name);
    if (!d || !HAS(d, 'value') || d.enumerable !== true) refuse();
    put(out, name, d.value);
  }
  return F(out);
}
function record(fields) {
  const out = CREATE(null);
  for (const name of KEYS(fields)) put(out, name, fields[name]);
  return F(out);
}
function put(target, name, value, enumerable = true) {
  const d = CREATE(null); d.value = value; d.enumerable = enumerable; DEFINE(target, name, d);
}
function refuse() {
  const code = 'native_read_loopback_qualification_configuration_rejected', error = new ERROR(code);
  put(error, 'code', code); put(error, 'stack', 'TypeError: ' + code, false); throw F(error);
}
