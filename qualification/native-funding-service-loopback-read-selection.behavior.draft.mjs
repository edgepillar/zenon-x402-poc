// Actual DATA-only trust selection. Not a native actor, SDK, SQL or TLS test.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as API from '../src/zenon/native-funding-service-loopback-read-selection.js';
import { captureNativeReadLoopbackQualificationRoute as OWNER_DATA } from '../src/zenon/native-read-loopback-qualification-configuration.js';

assert.equal(process.argv.length, 2); assert.equal(process.version, 'v24.19.0');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
assert.equal(process.env.X402_NATIVE_FUNDING_SERVICE_READ_SELECTION, 'eighteen-shared-ca-data-cases-only');
for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE'])
  assert.equal(process.env[name], undefined);
assert.ok(process.permission && !process.permission.has('child') && !process.permission.has('worker')
  && !process.permission.has('fs.write'));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PINS = JSON.parse(process.env.X402_NATIVE_FUNDING_SERVICE_READ_SOURCE_PINS);
assert.deepEqual(PINS.map(row => row.path), ['package.json',
  'src/zenon/native-read-loopback-qualification-configuration.js',
  'src/zenon/native-funding-service-loopback-read-selection.js',
  'qualification/native-funding-service-loopback-read-selection.behavior.draft.mjs']);
const identity = s => [s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String);
function verify() {
  for (const row of PINS) {
    const path = resolve(ROOT, row.path), before = lstatSync(path, { bigint: true });
    assert.ok(before.isFile() && !before.isSymbolicLink()); assert.equal(before.nlink, 1n);
    assert.deepEqual(identity(before), row.identity);
    const bytes = readFileSync(path); assert.equal(bytes.length, row.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
    assert.deepEqual(identity(lstatSync(path, { bigint: true })), row.identity);
  }
}
verify();
const F = Object.freeze, CAPTURE = API.captureNativeFundingServiceLoopbackReadSelection;
const CA = Buffer.from('SYNTHETIC_CA_DATA_NOT_A_CERTIFICATE', 'ascii'), OPT = { concurrency: false, timeout: 1000 };
function options(port, ca) {
  return F({ port: arguments.length === 0 ? 49152 : port, ca: arguments.length < 2 ? CA : ca });
}
let entered = 0, completed = 0, hooks = 0;
const trap = () => { hooks++; throw new Error('CALLER_HOOK'); };
function refusal(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'native_funding_service_loopback_read_selection_rejected');
  assert.equal(error.stack, 'TypeError: ' + error.code); assert.equal(Object.hasOwn(error, 'cause'), false);
  return true;
}
function denied(value, ca) {
  const expected = arguments.length === 1 ? CA : ca;
  assert.throws(() => CAPTURE(value, expected), refusal);
}
function release(value) { value.ca.fill(0); }
async function scenario(name, work) {
  let done = false;
  await test(name, OPT, async () => { entered++; await work(); completed++; done = true; });
  if (!done) throw new Error('NATIVE_FUNDING_SERVICE_READ_DATA_CASE_FAILED_STOP');
}
await scenario('one closed DATA export and exact two-argument contract', () => {
  assert.deepEqual(Object.keys(API), ['captureNativeFundingServiceLoopbackReadSelection']);
  assert.equal(CAPTURE.length, 2);
  assert.throws(() => CAPTURE(), refusal); assert.throws(() => CAPTURE(options()), refusal);
  assert.throws(() => CAPTURE(options(), CA, true), refusal);
});
await scenario('matching explicit RPC port and CA produce only a frozen detached selection', () => {
  const selected = CAPTURE(options(), CA);
  assert.deepEqual(Object.keys(selected), ['port', 'ca']); assert.ok(Object.isFrozen(selected));
  assert.equal(selected.port, 49152); assert.deepEqual(selected.ca, CA); assert.notEqual(selected.ca, CA);
  release(selected); assert.equal(CA[0], 83);
});
await scenario('trust comparison uses exact bytes rather than Buffer identity', () => {
  const local = Buffer.from(CA), application = Buffer.from(CA), selected = CAPTURE(options(49153, local), application);
  assert.equal(selected.port, 49153); assert.notEqual(selected.ca, local); assert.notEqual(selected.ca, application);
  assert.deepEqual(selected.ca, application); release(selected); assert.deepEqual(local, application);
});
await scenario('one different CA byte refuses without changing either borrowed input', () => {
  const local = Buffer.from(CA), application = Buffer.from(CA); application[application.length - 1] ^= 1;
  const beforeLocal = Buffer.from(local), beforeApplication = Buffer.from(application);
  denied(options(49152, local), application);
  assert.deepEqual(local, beforeLocal); assert.deepEqual(application, beforeApplication);
});
await scenario('prefix-equivalent CAs of different lengths are not the same trust selection', () => {
  for (const [local, application] of [[Buffer.from('CA'), Buffer.from('CA!')], [Buffer.from('CA!'), Buffer.from('CA')]]) {
    denied(options(49152, local), application); assert.equal(local[0], 67); assert.equal(application[0], 67);
  }
});
await scenario('unprivileged integer port bounds match the actual source-owned read policy', () => {
  for (const port of [1024, 65535]) { const selected = CAPTURE(options(port), CA); assert.equal(selected.port, port); release(selected); }
  const coercible = F({ valueOf: trap, toString: trap, [Symbol.toPrimitive]: trap });
  for (const port of [0, -0, 443, 1023, 65536, -1, 1.5, NaN, Infinity, '49152', true, null, coercible]) denied(options(port));
  assert.equal(hooks, 0);
});
await scenario('one-byte and 64 KiB equal synthetic trust buffers are fully copied', () => {
  for (const length of [1, 65536]) {
    const local = Buffer.alloc(length, 37), application = Buffer.from(local), selected = CAPTURE(options(49152, local), application);
    assert.equal(selected.ca.length, length); assert.deepEqual(selected.ca, local); release(selected);
    assert.equal(local[0], 37); assert.equal(application[length - 1], 37);
  }
});
await scenario('only exact frozen own DATA records including null-prototype snapshots are accepted', () => {
  const selected = CAPTURE(F(Object.assign(Object.create(null), options())), CA); release(selected);
  denied({ ...options() }); denied(F(Object.assign(Object.create({}), options())));
  denied(F({ ca: CA })); denied(F({ port: 49152 }));
});
await scenario('option accessors are refused before getter invocation', () => {
  for (const name of ['port', 'ca']) {
    const value = { ...options() }; Object.defineProperty(value, name, { get: trap, enumerable: true }); denied(F(value));
  }
  assert.equal(hooks, 0);
});
await scenario('proxy and revoked option records are refused before reflection hooks', () => {
  denied(new Proxy({}, { get: trap, ownKeys: trap, getOwnPropertyDescriptor: trap, getPrototypeOf: trap }));
  const revoked = Proxy.revocable({}, {}); revoked.revoke(); denied(revoked.proxy); assert.equal(hooks, 0);
});
await scenario('request factories extra flags symbols and hidden fields cannot widen selection', () => {
  for (const extra of [{ fetchImpl: trap }, { owner: trap }, { production: true }, { rejectUnauthorized: false },
    { hostname: 'external.invalid' }, { authority: 'APPROVED' }, { [Symbol('extra')]: trap }]) denied(F({ ...options(), ...extra }));
  const hidden = { ...options() }; Object.defineProperty(hidden, 'extra', { value: true }); denied(F(hidden));
  assert.equal(hooks, 0);
});
await scenario('both CA inputs must be bounded genuine Buffer data without implicit conversions', () => {
  const coercible = F({ valueOf: trap, toString: trap, [Symbol.toPrimitive]: trap });
  for (const ca of [null, undefined, '', 'CA', [], {}, coercible, new Uint8Array(16), Buffer.alloc(0), Buffer.alloc(65537)]) {
    denied(options(49152, ca)); denied(options(), ca);
  }
  assert.equal(hooks, 0);
});
await scenario('shared backing storage and CA proxies are rejected in either trust domain', () => {
  const shared = Buffer.from(new SharedArrayBuffer(16)), proxy = new Proxy(CA, { get: trap, ownKeys: trap, getPrototypeOf: trap });
  for (const ca of [shared, proxy]) { denied(options(49152, ca)); denied(options(), ca); }
  assert.equal(hooks, 0);
});
await scenario('CA adornments fake prototypes and subclass buffers are not assimilated', () => {
  for (const key of ['extra', Symbol('extra')]) {
    const ca = Buffer.from(CA); Object.defineProperty(ca, key, { get: trap }); denied(options(49152, ca)); denied(options(), ca);
  }
  const altered = Buffer.from(CA); Object.setPrototypeOf(altered, Object.create(Buffer.prototype));
  for (const ca of [altered, Object.create(Buffer.prototype)]) { denied(options(49152, ca)); denied(options(), ca); }
  assert.equal(hooks, 0);
});
await scenario('mutation after capture cannot replace the owned read trust bytes', () => {
  const local = Buffer.from(CA), application = Buffer.from(CA), selected = CAPTURE(options(49152, local), application);
  local.fill(3); application.fill(4); assert.deepEqual(selected.ca, CA);
  release(selected); assert.equal(local[0], 3); assert.equal(application[0], 4);
});
await scenario('separate selections and actual role-policy copies have independent CA ownership', () => {
  const first = CAPTURE(options(), CA), second = CAPTURE(options(), CA);
  const owners = ['/rpc/first', '/rpc/second', '/rpc/account'].map(path => OWNER_DATA(
    F({ hostname: 'localhost', ipv4Address: '127.0.0.1', path }), first,
    path === '/rpc/account' ? 'zenon_account_state_retained_candidate' : 'dynamic_plasma_retained_candidate'));
  release(first); assert.deepEqual(second.ca, CA);
  for (const owner of owners) { assert.deepEqual(owner.ca, CA); assert.equal(owner.port, 49152); release(owner); }
  release(second); assert.equal(CA[0], 83);
});
await scenario('refusals reveal neither input CA material nor original reflection failures', () => {
  const secret = Buffer.from('PRIVATE_SYNTHETIC_TRUST_MARKER', 'ascii');
  assert.throws(() => CAPTURE(options(49152, secret), CA), error => {
    refusal(error); assert.equal(JSON.stringify(error).includes(secret.toString('ascii')), false);
    assert.equal(error.stack.includes('CALLER_HOOK'), false); return true;
  });
  assert.equal(secret.toString('ascii'), 'PRIVATE_SYNTHETIC_TRUST_MARKER'); assert.equal(hooks, 0);
});
await scenario('selection carries no constructor callback authority or native qualification claim', () => {
  const selected = CAPTURE(options(), CA);
  for (const key of ['request', 'owner', 'fetchImpl', 'SDK', 'key', 'authority', 'productionQualified'])
    assert.equal(Object.hasOwn(selected, key), false);
  release(selected); assert.equal(hooks, 0);
});
assert.equal(entered, 18); assert.equal(completed, 18); verify();
console.log('# native-funding-service-read-data ' + JSON.stringify({ entered, completed, hooks,
  actualPureModules: 2, nativeActorImported: false, nativeActorCalled: false, actualNativeOwners: 0,
  CAData: 'SYNTHETIC_BYTES_NOT_CERTIFICATE_VALIDATION', SDK: 0, SQLite: 0, TLS: 0, sockets: 0,
  keys: 0, signatures: 0, nonceEvaluations: 0, authority: 'NONE', productionQualified: false }));
