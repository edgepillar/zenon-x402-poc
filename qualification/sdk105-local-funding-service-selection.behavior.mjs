// Actual inert SDK105 selection; CA DATA is deliberately not a certificate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as API from '../src/zenon/sdk105-local-funding-service-selection.js';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
assert.equal(process.env.X402_SDK105_LOCAL_FUNDING_SELECTION, 'builtin-shared-ca-selection');
for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE'])
  assert.equal(process.env[name], undefined);
assert.ok(process.permission && !process.permission.has('child') && !process.permission.has('worker')
  && !process.permission.has('fs.write'));
const PINS = JSON.parse(process.env.X402_SDK105_LOCAL_FUNDING_SOURCE_PINS);
const EXPECTED_PATHS = ["package.json","qualification/sdk105-local-funding-service-selection.behavior.mjs","scripts/run-current-sdk105-local-funding-selection.mjs","src/canonical.js","src/service-credit-original-request-custody-contract.js","src/service-credit-pilot-original-payment-checkpoint.js","src/x402-funding-post-checkpoint-route.js","src/x402-official-https-request-binding.js","src/x402-original-payment-checkpoint-client.js","src/x402-wire.js","src/zenon/dynamic-plasma-original-funding-service-handoff-request.js","src/zenon/native-funding-service-loopback-read-selection.js","src/zenon/native-read-loopback-qualification-configuration.js","src/zenon/sdk105-funding-service-lifecycle.js","src/zenon/sdk105-local-funding-service-selection.js"];
assert.deepEqual(PINS.map(row => row.path).sort(), EXPECTED_PATHS);
const identity = s => [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeNs, s.ctimeNs].map(String);
function verify() {
  for (const row of PINS) {
    const path = fileURLToPath(new URL('../' + row.path, import.meta.url));
    const before = lstatSync(path, { bigint: true });
    assert.ok(before.isFile() && !before.isSymbolicLink()); assert.equal(before.nlink, 1n);
    assert.deepEqual(identity(before), row.identity);
    const raw = readFileSync(path); assert.equal(raw.length, row.bytes);
    assert.equal(createHash('sha256').update(raw).digest('hex'), row.sha256);
    assert.deepEqual(identity(lstatSync(path, { bigint: true })), row.identity);
  }
}
verify();
const CAPTURE = API.captureSdk105LocalFundingServiceSelection, F = Object.freeze;
const CA = Buffer.from('SDK105_SYNTHETIC_TRUST_DATA_NOT_A_CERTIFICATE', 'ascii');
let keyCalls = 0, hooks = 0;
const trap = () => { hooks++; throw Error('PRIVATE_HOOK_DETAIL'); };
const key = { getPublicKey() { keyCalls++; throw Error('NOT_A_TEST_KEY'); },
  getAddress() { keyCalls++; throw Error('NOT_A_TEST_KEY'); },
  sign() { keyCalls++; throw Error('NOT_A_TEST_KEY'); }, clear() { keyCalls++; } };
function fixture() {
  return { storeOptions: { databasePath: 'NOT_OPENED.sqlite', allowedRoot: 'NOT_OPENED',
    resourceUrl: 'https://127.0.0.1:49152/funding', custodyPolicy: F({}) },
    fundingOptions: { readSessionOptions: F({}),
      materialOptions: { publicKey: 'PUBLIC_DATA_ONLY', startNonce: '0000000000000000',
        limits: { maxAttempts: 4096, maxDifficulty: 0 } },
      materialWaitMs: 250, keyPair: key, expectedAddress: 'EXPECTED_ADDRESS_DATA_ONLY', deadlineMs: 1000,
      fundingTransportOptions: { resourceUrl: 'https://127.0.0.1:49152/funding', ca: Buffer.from(CA),
        maxRequestStarts: 1, requestDeadlineMs: 1000, handshakeDeadlineMs: 250, closeGraceMs: 100 } },
    serviceOptions: { official: F({}), deadlineMs: 1000,
      transportOptions: { origin: 'https://127.0.0.1:49152', ca: Buffer.from(CA), maxRequestStarts: 4,
        maxConcurrentRequests: 1, requestDeadlineMs: 1000, handshakeDeadlineMs: 250, closeGraceMs: 100 } } };
}
function local(port = 49152, ca = Buffer.from(CA)) { return F({ port, ca }); }
function refusal(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'sdk105_local_funding_service_selection_rejected');
  assert.equal(error.stack, 'TypeError: ' + error.code); assert.equal(Object.hasOwn(error, 'cause'), false);
  return true;
}
function denied(c, o = local()) { assert.throws(() => CAPTURE(c, o), refusal); }
function release(value) { value.localReadOptions.ca.fill(0); }
function sameBorrowed(c, o) {
  assert.deepEqual(c.fundingOptions.fundingTransportOptions.ca, CA);
  assert.deepEqual(c.serviceOptions.transportOptions.ca, CA); assert.deepEqual(o.ca, CA);
}

test('one explicit inert export and exact two-argument contract', () => {
  assert.deepEqual(Object.keys(API), ['captureSdk105LocalFundingServiceSelection']);
  assert.equal(CAPTURE.length, 2); assert.throws(() => CAPTURE(), refusal);
  assert.throws(() => CAPTURE(fixture()), refusal); assert.throws(() => CAPTURE(fixture(), local(), true), refusal);
});
test('all three equal trust domains use one owned copy before any key callback', () => {
  const c = fixture(), o = local(), value = CAPTURE(c, o), owned = value.localReadOptions.ca;
  assert.ok(Object.isFrozen(value) && Object.isFrozen(value.configuration));
  assert.deepEqual(Object.keys(value), ['configuration', 'localReadOptions']);
  assert.equal(value.configuration.fundingOptions.keyPair, key);
  assert.equal(value.configuration.fundingOptions.fundingTransportOptions.ca, owned);
  assert.equal(value.configuration.serviceOptions.transportOptions.ca, owned);
  assert.notEqual(owned, o.ca); assert.notEqual(owned, c.fundingOptions.fundingTransportOptions.ca);
  assert.notEqual(owned, c.serviceOptions.transportOptions.ca); assert.deepEqual(owned, CA);
  release(value); sameBorrowed(c, o); assert.equal(keyCalls, 0);
});
test('funding CA mismatch refuses without altering any borrowed bytes', () => {
  const c = fixture(), o = local(); c.fundingOptions.fundingTransportOptions.ca[2] ^= 1;
  const before = Buffer.from(c.fundingOptions.fundingTransportOptions.ca); denied(c, o);
  assert.deepEqual(c.fundingOptions.fundingTransportOptions.ca, before);
  assert.deepEqual(c.serviceOptions.transportOptions.ca, CA); assert.deepEqual(o.ca, CA);
});
test('service CA mismatch is checked independently of matching RPC and funding', () => {
  const c = fixture(), o = local(); c.serviceOptions.transportOptions.ca[3] ^= 1;
  const before = Buffer.from(c.serviceOptions.transportOptions.ca); denied(c, o);
  assert.deepEqual(c.serviceOptions.transportOptions.ca, before);
  assert.deepEqual(c.fundingOptions.fundingTransportOptions.ca, CA); assert.deepEqual(o.ca, CA);
});
test('different RPC trust refuses even when funding and service agree', () => {
  const c = fixture(), ca = Buffer.from(CA); ca[0] ^= 1; const before = Buffer.from(ca);
  denied(c, local(49152, ca)); assert.deepEqual(ca, before);
  assert.deepEqual(c.fundingOptions.fundingTransportOptions.ca, CA);
});
test('a prefix-equivalent shorter or longer service CA does not match', () => {
  for (const ca of [CA.subarray(0, CA.length - 1), Buffer.concat([CA, Buffer.from('!')])]) {
    const c = fixture(); c.serviceOptions.transportOptions.ca = ca; denied(c);
    assert.deepEqual(ca.subarray(0, CA.length - 1), CA.subarray(0, CA.length - 1));
  }
});
test('explicit RPC port bounds do not coerce caller values', () => {
  for (const port of [1024, 65535]) { const value = CAPTURE(fixture(), local(port));
    assert.equal(value.localReadOptions.port, port); release(value); }
  for (const port of [0, -0, 443, 1023, 65536, 1.5, NaN, Infinity, '49152', F({ valueOf: trap })]) denied(fixture(), local(port));
  assert.equal(hooks, 0);
});
test('CA size limits apply equally to funding service and RPC data', () => {
  for (const length of [1, 65536]) {
    const c = fixture(), ca = Buffer.alloc(length, 57);
    c.fundingOptions.fundingTransportOptions.ca = Buffer.from(ca);
    c.serviceOptions.transportOptions.ca = Buffer.from(ca);
    const value = CAPTURE(c, local(49152, ca)); assert.deepEqual(value.localReadOptions.ca, ca); release(value);
    assert.equal(ca[0], 57);
  }
  for (const length of [0, 65537]) {
    const c = fixture(); c.serviceOptions.transportOptions.ca = Buffer.alloc(length); denied(c);
    denied(fixture(), local(49152, Buffer.alloc(length)));
  }
});
test('non-Buffer and shared storage cannot become local trust', () => {
  for (const ca of [null, 'CA', new Uint8Array(3), Buffer.from(new SharedArrayBuffer(4)), F({ toString: trap })]) {
    const c = fixture(); c.fundingOptions.fundingTransportOptions.ca = ca; denied(c);
    c.fundingOptions.fundingTransportOptions.ca = Buffer.from(CA); c.serviceOptions.transportOptions.ca = ca; denied(c);
    denied(fixture(), local(49152, ca));
  }
  assert.equal(hooks, 0);
});
test('CA proxies and extra accessors are refused before caller hooks', () => {
  const proxy = new Proxy(CA, { get: trap, ownKeys: trap, getPrototypeOf: trap });
  const decorated = Buffer.from(CA); Object.defineProperty(decorated, 'extra', { get: trap });
  for (const ca of [proxy, decorated]) {
    const c = fixture(); c.serviceOptions.transportOptions.ca = ca; denied(c); denied(fixture(), local(49152, ca));
  }
  assert.equal(hooks, 0);
});
test('root configuration accessors are not invoked', () => {
  for (const name of ['storeOptions', 'fundingOptions', 'serviceOptions']) {
    const c = fixture(); Object.defineProperty(c, name, { get: trap, enumerable: true }); denied(c);
  }
  assert.equal(hooks, 0);
});
test('funding and service transport accessors are not invoked', () => {
  for (const which of ['funding', 'service']) for (const name of ['ca', 'requestDeadlineMs']) {
    const c = fixture(), transport = which === 'funding' ? c.fundingOptions.fundingTransportOptions : c.serviceOptions.transportOptions;
    Object.defineProperty(transport, name, { get: trap, enumerable: true }); denied(c);
  }
  assert.equal(hooks, 0);
});
test('proxy or revoked transport records do not execute reflection hooks', () => {
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  for (const transport of [new Proxy({}, { ownKeys: trap, getPrototypeOf: trap }), revoked.proxy]) {
    const c = fixture(); c.fundingOptions.fundingTransportOptions = transport; denied(c);
    c.fundingOptions.fundingTransportOptions = fixture().fundingOptions.fundingTransportOptions;
    c.serviceOptions.transportOptions = transport; denied(c);
  }
  assert.equal(hooks, 0);
});
test('extra factories flags symbols and hidden transport fields cannot widen selection', () => {
  for (const extra of ['owner', 'fetchImpl', 'rejectUnauthorized', Symbol('factory')]) {
    const c = fixture(); Object.defineProperty(c.fundingOptions.fundingTransportOptions, extra, { value: trap }); denied(c);
  }
  const c = fixture(); Object.defineProperty(c.serviceOptions.transportOptions, 'ca', { value: CA, enumerable: false }); denied(c);
  assert.equal(hooks, 0);
});
test('later mutation of every borrowed CA cannot change captured trust', () => {
  const c = fixture(), o = local(), value = CAPTURE(c, o);
  c.fundingOptions.fundingTransportOptions.ca.fill(1); c.serviceOptions.transportOptions.ca.fill(2); o.ca.fill(3);
  assert.deepEqual(value.localReadOptions.ca, CA); release(value); assert.equal(o.ca[0], 3);
});
test('deferred opening retains the selected key address budget and transport fields', () => {
  const c = fixture(), value = CAPTURE(c, local()), captured = value.configuration;
  c.fundingOptions.keyPair = {}; c.fundingOptions.expectedAddress = 'OTHER'; c.fundingOptions.deadlineMs = 1;
  c.storeOptions.databasePath = 'OTHER.sqlite'; c.fundingOptions.fundingTransportOptions.requestDeadlineMs = 1;
  c.serviceOptions.transportOptions.origin = 'https://external.invalid';
  assert.equal(captured.fundingOptions.keyPair, key); assert.equal(captured.fundingOptions.expectedAddress, 'EXPECTED_ADDRESS_DATA_ONLY');
  assert.equal(captured.fundingOptions.deadlineMs, 1000); assert.equal(captured.storeOptions.databasePath, 'NOT_OPENED.sqlite');
  assert.equal(captured.fundingOptions.fundingTransportOptions.requestDeadlineMs, 1000);
  assert.equal(captured.serviceOptions.transportOptions.origin, 'https://127.0.0.1:49152'); release(value);
});
test('material selection and nonce limits are copied without evaluating nonce work', () => {
  const c = fixture(), value = CAPTURE(c, local());
  c.fundingOptions.materialOptions.publicKey = 'OTHER'; c.fundingOptions.materialOptions.limits.maxAttempts = 1;
  assert.equal(value.configuration.fundingOptions.materialOptions.publicKey, 'PUBLIC_DATA_ONLY');
  assert.equal(value.configuration.fundingOptions.materialOptions.limits.maxAttempts, 4096); release(value);
});
test('independent captures own independent CA storage', () => {
  const c = fixture(), o = local(), first = CAPTURE(c, o), second = CAPTURE(c, o);
  release(first); assert.deepEqual(second.localReadOptions.ca, CA); sameBorrowed(c, o); release(second);
});
test('local options require an exact frozen record with no implicit authority', () => {
  for (const o of [{ port: 49152, ca: CA }, F({ port: 49152, ca: CA, authority: 'APPROVED' }),
    F({ port: 49152, ca: CA, hostname: 'external.invalid' }), F({ port: 49152, ca: CA, key })]) denied(fixture(), o);
  const value = CAPTURE(fixture(), F(Object.assign(Object.create(null), local()))); release(value);
});
test('refusal diagnostics contain neither private markers nor caller errors', () => {
  const c = fixture(), marker = Buffer.from('PRIVATE_TRUST_DETAIL'); c.serviceOptions.transportOptions.ca = marker;
  assert.throws(() => CAPTURE(c, local()), error => { refusal(error);
    assert.equal(JSON.stringify(error).includes(marker.toString()), false);
    assert.equal(error.stack.includes('PRIVATE_HOOK_DETAIL'), false); return true; });
  assert.equal(marker.toString(), 'PRIVATE_TRUST_DETAIL');
});
test('inert capture neither validates nor touches a caller key capability', () => {
  const c = fixture(), proxy = new Proxy({}, { get: trap, ownKeys: trap, getPrototypeOf: trap });
  c.fundingOptions.keyPair = proxy; const value = CAPTURE(c, local());
  assert.equal(value.configuration.fundingOptions.keyPair, proxy); release(value);
  assert.equal(keyCalls, 0); assert.equal(hooks, 0);
});
test('releasing the one owned trust copy leaves every borrowed input intact', () => {
  const c = fixture(), o = local(), value = CAPTURE(c, o); release(value);
  assert.ok(value.configuration.fundingOptions.fundingTransportOptions.ca.every(byte => byte === 0));
  assert.ok(value.configuration.serviceOptions.transportOptions.ca.every(byte => byte === 0));
  sameBorrowed(c, o); assert.equal(keyCalls, 0); assert.equal(hooks, 0); verify();
});
