/* Actual DATA-only loopback policy, not TLS/native/SDK/SQLite execution. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import * as API from '../src/zenon/native-read-loopback-qualification-configuration.js';

assert.equal(process.argv.length, 2); assert.equal(process.version, 'v24.19.0');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
assert.equal(process.env.X402_NATIVE_READ_LOOPBACK_ROUTE_SELECTION, 'sixteen-data-only-route-cases');
assert.ok(process.permission && !process.permission.has('child') && !process.permission.has('worker')
  && !process.permission.has('fs.write'));
const F = Object.freeze, DP = 'dynamic_plasma_retained_candidate', ACCOUNT = 'zenon_account_state_retained_candidate';
const CAPTURE = API.captureNativeReadLoopbackQualificationRoute, URL = API.nativeReadLoopbackQualificationFundingResourceUrl;
const CA = Buffer.from('SYNTHETIC_CA_DATA_NOT_A_CERTIFICATE', 'ascii'), OPTIONS = { timeout: 1000, concurrency: false };
let entered = 0, completed = 0, hooks = 0;
const route = (path = '/rpc/first') => F({ hostname: 'localhost', path, ipv4Address: '127.0.0.1' });
const options = (port = 49152, ca = CA) => F({ port, ca });
const trap = () => { hooks++; throw new Error('CALLER_HOOK'); };
function refused(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'native_read_loopback_qualification_configuration_rejected');
  assert.equal(error.stack, 'TypeError: ' + error.code); assert.equal(Object.hasOwn(error, 'cause'), false);
  return true;
}
async function selected(name, callback) {
  let done = false;
  await test(name, OPTIONS, async () => { entered++; await callback(); completed++; done = true; });
  if (!done) throw new Error('LOOPBACK_ROUTE_CASE_FAILED_STOP');
}
function dispose(value) { value.ca.fill(0); } // Only the newly owned synthetic copy.
await selected('exact namespace is the closed capture and funding-resource grammar only', () => {
  assert.deepEqual(Object.keys(API).sort(), ['captureNativeReadLoopbackQualificationRoute',
    'nativeReadLoopbackQualificationFundingResourceUrl']);
});
await selected('both retained DP paths bind exact localhost IPv4 port and owned CA bytes', () => {
  for (const path of ['/rpc/first', '/rpc/second']) {
    const value = CAPTURE(route(path), options(), DP);
    assert.ok(Object.isFrozen(value)); assert.equal(Object.getPrototypeOf(value), null);
    assert.equal(value.hostname, 'localhost'); assert.equal(value.ipv4Address, '127.0.0.1');
    assert.equal(value.path, path); assert.equal(value.port, 49152);
    assert.ok(Buffer.isBuffer(value.ca) && value.ca !== CA); assert.deepEqual(value.ca, CA); dispose(value);
  }
});
await selected('account and DP role paths are not interchangeable or caller-extendable', () => {
  const account = CAPTURE(route('/rpc/account'), options(), ACCOUNT); dispose(account);
  for (const [path, profile] of [['/rpc/first', ACCOUNT], ['/rpc/second', ACCOUNT], ['/rpc/account', DP],
    ['/rpc', DP], ['/rpc/first/', DP], ['/rpc/first?x=1', DP], ['/rpc/../account', DP],
    ['/rpc/first', 'dynamic_plasma'], ['/rpc/first', 'zenon_funding']])
    assert.throws(() => CAPTURE(route(path), options(), profile), refused);
});
await selected('only integer unprivileged ports in 1024 through 65535 are admitted', () => {
  for (const port of [1024, 65535]) { const value = CAPTURE(route(), options(port), DP); dispose(value); }
  const coercible = F({ valueOf: trap, toString: trap, [Symbol.toPrimitive]: trap });
  for (const port of [0, -0, -1, 443, 1023, 65536, 1.1, NaN, Infinity, '49152', true, null, coercible])
    assert.throws(() => CAPTURE(route(), options(port), DP), refused);
  assert.equal(hooks, 0);
});
await selected('no external host alternative loopback address IPv6 or textual alias is admitted', () => {
  for (const delta of [{ hostname: 'rpc.zenon.network' }, { hostname: 'LOCALHOST' },
    { hostname: 'localhost.' }, { hostname: '127.0.0.1' }, { hostname: 'local.invalid' },
    { ipv4Address: '127.0.0.2' }, { ipv4Address: '::1' }, { ipv4Address: '0.0.0.0' },
    { ipv4Address: '10.0.0.1' }, { ipv4Address: '1.1.1.1' }, { ipv4Address: '127.000.0.1' }])
    assert.throws(() => CAPTURE(F({ ...route(), ...delta }), options(), DP), refused);
});
await selected('unknown source flags request factories and global trust knobs are rejected as extra fields', () => {
  for (const extra of [{ request: trap }, { lookup: trap }, { rejectUnauthorized: false },
    { production: true }, { authority: 'APPROVED' }, { caFile: 'not-read' }])
    assert.throws(() => CAPTURE(route(), F({ ...options(), ...extra }), DP), refused);
  assert.throws(() => CAPTURE(F({ ...route(), port: 49152 }), options(), DP), refused);
  assert.equal(hooks, 0);
});
await selected('own frozen records including private null-prototype source snapshots are accepted', () => {
  const r = F(Object.assign(Object.create(null), route())), o = F(Object.assign(Object.create(null), options()));
  const value = CAPTURE(r, o, DP); dispose(value);
  assert.throws(() => CAPTURE({ ...route() }, options(), DP), refused);
  assert.throws(() => CAPTURE(route(), { ...options() }, DP), refused);
  assert.throws(() => CAPTURE(F(Object.assign(Object.create({}), route())), options(), DP), refused);
});
await selected('configuration accessors never invoke caller getters or start callbacks', () => {
  for (const key of ['hostname', 'path', 'ipv4Address']) {
    const raw = { ...route() }; Object.defineProperty(raw, key, { enumerable: true, get: trap });
    assert.throws(() => CAPTURE(F(raw), options(), DP), refused);
  }
  for (const key of ['port', 'ca']) {
    const raw = { ...options() }; Object.defineProperty(raw, key, { enumerable: true, get: trap });
    assert.throws(() => CAPTURE(route(), F(raw), DP), refused);
  }
  assert.equal(hooks, 0);
});
await selected('proxies at route options or CA boundaries are refused before reflection hooks', () => {
  const proxy = new Proxy({}, { get: trap, getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap });
  assert.throws(() => CAPTURE(proxy, options(), DP), refused);
  assert.throws(() => CAPTURE(route(), proxy, DP), refused);
  assert.throws(() => CAPTURE(route(), options(49152, new Proxy(CA, { get: trap })), DP), refused);
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  assert.throws(() => CAPTURE(revoked.proxy, options(), DP), refused); assert.equal(hooks, 0);
});
await selected('CA is bounded genuine nonshared Buffer data not a string view or mutable protocol object', () => {
  const shared = Buffer.from(new SharedArrayBuffer(16));
  for (const ca of ['', 'not-a-certificate', null, [], {}, new Uint8Array(16), Buffer.alloc(0), Buffer.alloc(65537), shared,
    Object.create(Buffer.prototype)])
    assert.throws(() => CAPTURE(route(), options(49152, ca), DP), refused);
});
await selected('one byte and 65536 byte synthetic CA bounds are copied completely', () => {
  for (const length of [1, 65536]) {
    const ca = Buffer.alloc(length, 37), value = CAPTURE(route(), options(49152, ca), DP);
    assert.equal(value.ca.length, length); assert.deepEqual(value.ca, ca); dispose(value);
    assert.equal(ca[0], 37); assert.equal(ca[length - 1], 37);
  }
});
await selected('each owner receives an independent CA copy and never changes caller-owned bytes', () => {
  const source = Buffer.from(CA), first = CAPTURE(route(), options(49152, source), DP);
  const second = CAPTURE(route('/rpc/second'), options(49152, source), DP);
  source.fill(3); assert.deepEqual(first.ca, CA); assert.deepEqual(second.ca, CA);
  first.ca.fill(5); assert.deepEqual(second.ca, CA); assert.equal(source[0], 3);
  dispose(first); dispose(second);
});
await selected('string or symbol adornments and fake Buffer prototypes are never assimilated', () => {
  const ca = Buffer.from(CA); Object.defineProperty(ca, 'extra', { get: trap });
  assert.throws(() => CAPTURE(route(), options(49152, ca), DP), refused);
  const tagged = Buffer.from(CA); Object.defineProperty(tagged, Symbol('extra'), { get: trap });
  assert.throws(() => CAPTURE(route(), options(49152, tagged), DP), refused);
  const changed = Buffer.from(CA); Object.setPrototypeOf(changed, Object.create(Buffer.prototype));
  assert.throws(() => CAPTURE(route(), options(49152, changed), DP), refused); assert.equal(hooks, 0);
});
await selected('funding resource is the exact same-port IPv4 HTTPS funding URL with no discovery', () => {
  const before = Buffer.from(CA);
  assert.equal(URL(options()), 'https://127.0.0.1:49152/funding');
  assert.equal(URL(options(1024)), 'https://127.0.0.1:1024/funding');
  assert.deepEqual(CA, before);
  assert.throws(() => URL(F({ port: 443, ca: CA })), refused);
  assert.throws(() => URL(F({ port: 49152, ca: Buffer.alloc(0) })), refused);
});
await selected('all exported entry arities and nonstring profile values fail without coercion', () => {
  assert.throws(() => CAPTURE(route(), options()), refused);
  assert.throws(() => CAPTURE(route(), options(), DP, true), refused);
  assert.throws(() => URL(), refused); assert.throws(() => URL(options(), true), refused);
  const coercible = F({ toString: trap, valueOf: trap, [Symbol.toPrimitive]: trap });
  assert.throws(() => CAPTURE(route(), options(), coercible), refused); assert.equal(hooks, 0);
});
await selected('a valid policy is only configuration and never certificate or native graph qualification', () => {
  const value = CAPTURE(route(), options(), DP);
  assert.equal(value.qualificationOnly, true); assert.equal(value.productionRouteQualified, false);
  assert.equal(value.trustMode, 'explicit-ca-loopback-qualification'); assert.equal(value.authority, 'NONE');
  assert.equal(Object.hasOwn(value, 'request'), false); assert.equal(Object.hasOwn(value, 'key'), false);
  dispose(value); assert.equal(hooks, 0);
});
assert.equal(entered, 16); assert.equal(completed, 16);
console.log('# native-read-loopback-route ' + JSON.stringify({ entered, completed, hooks,
 actualProductionModules: 1, CAData: 'SYNTHETIC_BYTES_NOT_CERTIFICATE_VALIDATION',
 nativeCoreImported: false, fullFactoryImported: false, SDK: 0, SQLite: 0, sockets: 0,
 keys: 0, signatures: 0, nonceEvaluations: 0, authority: 'NONE', productionQualified: false }));
