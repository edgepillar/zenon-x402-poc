import { fileURLToPath } from 'node:url';
// Actual pure admission/selection predicates; no native modules or key calls.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { apiCreditApplicationDataCases, apiCreditApplicationDataFixtures as f } from './api-credit-application.behavior.mjs';
import { captureNativeFundingServiceOperationalConfiguration as operational } from '../src/zenon/native-funding-service-configuration.js';
import { captureNativePublicHttpsReadRoute as route } from '../src/zenon/native-public-https-read-route.js';
import { captureSdk105ApiCreditSelection as select, consumeSdk105ApiCreditSelection as consume } from '../src/zenon/sdk105-api-credit-selection.js';

const F = Object.freeze, checks = [...apiCreditApplicationDataCases];
function check(id, run) { checks.push({ id, run }); }
function operations(r) {
  const { keyPair, expectedAddress, ...fundingOptions } = r.input.configuration.fundingOptions;
  return { storeOptions: r.input.configuration.storeOptions, fundingOptions, serviceOptions: r.input.configuration.serviceOptions };
}
async function rejected(edit) {
  const r = f.capturedConfiguration(); edit(r); const before = Buffer.from(r.ca);
  assert.throws(() => select(r.input)); assert.equal(r.keyCalls + r.clockCalls, 0); assert.deepEqual(r.ca, before); await r.h.root.close();
}
check('the-complete-operational-capture-is-inert-and-retains-the-exact-policy-and-one-post-budget', async () => {
  const r = f.capturedConfiguration(), c = operational(operations(r));
  assert.equal(c.storeOptions.custodyPolicy.policyVersion, 1); assert.equal(c.fundingOptions.fundingTransportOptions.maxRequestStarts, 1);
  assert.equal(c.serviceOptions.transportOptions.maxConcurrentRequests, 1); assert.equal(r.keyCalls + r.clockCalls, 0);
  assert.ok(Object.isFrozen(c.fundingOptions.readSessionOptions.endpoints[0].route)); await r.h.root.close();
});
check('missing-or-changed-custody-policy-is-refused-before-selection-can-escape', async () => {
  for (const edit of [p => { delete p.policyVersion; }, p => { p.policyVersion = 2; }, p => { p.maxRequests = 0; }, p => { p.maxRequests = 1025; },
    p => { p.serviceResourceUrl = 'https://foreign.example.test/service-credit/v1/execute'; }]) await rejected(r => edit(r.input.configuration.storeOptions.custodyPolicy));
});
check('relative-traversing-and-nondirect-checkpoint-paths-refuse-before-any-key-call', async () => {
  for (const value of ['relative.sqlite', '/synthetic/funding/../checkpoint.sqlite', '/synthetic/other/checkpoint.sqlite'])
    await rejected(r => { r.input.configuration.storeOptions.databasePath = value; });
});
check('funding-cannot-select-a-second-post-or-another-resource', async () => {
  for (const edit of [t => { t.maxRequestStarts = 2; }, t => { t.resourceUrl = 'https://foreign.example.test/funding'; },
    t => { t.requestDeadlineMs = 501; }, t => { t.handshakeDeadlineMs = 251; }]) await rejected(r => edit(r.input.configuration.fundingOptions.fundingTransportOptions));
});
check('service-origin-count-concurrency-and-aggregate-deadline-are-bound-before-opening', async () => {
  for (const edit of [t => { t.origin = 'https://foreign.example.test'; }, t => { t.maxConcurrentRequests = 2; },
    t => { t.maxRequestStarts = 129; }, t => { t.requestDeadlineMs = 501; }, t => { t.closeGraceMs = 501; }]) await rejected(r => edit(r.input.configuration.serviceOptions.transportOptions));
});
check('noninteger-negative-zero-and-overlong-budgets-cannot-reach-native-opening', async () => {
  for (const value of [0, -0, -1, 1.5, NaN, Infinity, '500', 60001]) await rejected(r => { r.input.configuration.fundingOptions.deadlineMs = value; });
});
check('official-asset-context-and-challenge-capabilities-are-validated-without-calling-them', async () => {
  for (const edit of [o => { o.assetInfo.decimals = 19; }, o => { o.assetInfo.symbol = 'contains space'; }, o => { o.contextLimit = 65; },
    o => { o.validateChallenge = async function unsupported() { assert.fail('not invoked'); }; }]) await rejected(r => edit(r.input.configuration.serviceOptions.official));
});
check('material-cursor-public-bytes-and-attempt-limits-are-validated-without-a-work-search', async () => {
  for (const edit of [m => { m.publicKey = 'not-base64'; }, m => { m.startNonce = '0'; }, m => { m.limits.maxAttempts = 4097; },
    m => { m.limits.maxDifficulty = -0; }, m => { m.limits.maxAttempts = -1; }]) await rejected(r => edit(r.input.configuration.fundingOptions.materialOptions));
});
check('funding-and-service-ca-bytes-must-match-before-selection-is-registered', async () => {
  await rejected(r => { r.input.configuration.serviceOptions.transportOptions.ca = Buffer.from('OTHER-PUBLIC-CA'); });
});
check('shared-and-extended-ca-buffers-are-refused-without-clearing-borrowed-input', async () => {
  await rejected(r => { const b = Buffer.alloc(16); Object.defineProperty(b, 'extra', { value: true }); r.input.configuration.fundingOptions.fundingTransportOptions.ca = b; });
  await rejected(r => { r.input.configuration.fundingOptions.fundingTransportOptions.ca = Buffer.from(new SharedArrayBuffer(16)); });
});
check('duplicate-read-peers-cannot-be-admitted-as-two-independent-endpoint-owners', async () => {
  await rejected(r => { const a = r.input.configuration.fundingOptions.readSessionOptions.endpoints[0];
    r.input.configuration.fundingOptions.readSessionOptions = F({ endpoints: F([a, a]), accountEndpoint: a }); });
});
check('read-owner-budgets-use-the-same-native-timing-grammar', async () => {
  await rejected(r => { const c = r.input.configuration.fundingOptions.readSessionOptions;
    r.input.configuration.fundingOptions.readSessionOptions = F({ ...c, endpoints: F([F({ ...c.endpoints[0], timeoutMs: 0 }), c.endpoints[1]]) }); });
});
check('public-read-selection-rejects-localhost-private-and-documentation-addresses', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '192.0.2.1', '169.254.1.1', '100.64.0.1', '203.0.113.1'])
    await rejected(r => { const c = r.input.configuration.fundingOptions.readSessionOptions, first = c.endpoints[0];
      r.input.configuration.fundingOptions.readSessionOptions = F({ ...c, endpoints: F([F({ ...first, route: F({ ...first.route, ipv4Address: address }) }), c.endpoints[1]]) }); });
});
check('the-public-route-predicate-preserves-canonical-host-path-and-ipv4-rejection', () => {
  const good = { hostname: 'rpc.zenon.network', path: '/rpc/v1', ipv4Address: '8.8.8.8' };
  assert.deepEqual(route(F(good)), good);
  for (const edit of [{ hostname: 'RPC.zenon.network' }, { hostname: 'rpc.example.test' }, { hostname: '127.0.0.1' }, { path: '/a/../b' },
    { path: '/a%2fb' }, { path: '/a?b' }, { path: '/a//b' }, { ipv4Address: '008.8.8.8' }, { ipv4Address: '224.0.0.1' }]) assert.throws(() => route(F({ ...good, ...edit })));
});
check('local-qualification-is-a-separate-explicit-grammar-and-never-a-public-fallback', async () => {
  const r = f.capturedConfiguration(), c = operations(r), endpoint = role => F({ route: F({ hostname: 'localhost', path: '/rpc/' + role, ipv4Address: '127.0.0.1' }), timeoutMs: 200, closeGraceMs: 100 });
  c.fundingOptions.readSessionOptions = F({ endpoints: F([endpoint('first'), endpoint('second')]), accountEndpoint: endpoint('account') });
  assert.throws(() => operational(c)); assert.equal(operational(c, 'LOCAL_QUALIFICATION').fundingOptions.readSessionOptions.endpoints[0].route.path, '/rpc/first');
  assert.throws(() => operational(c, 'AUTO')); assert.equal(r.keyCalls + r.clockCalls, 0); await r.h.root.close();
});
check('read-route-and-key-proxies-are-refused-without-entering-proxy-traps', async () => {
  let traps = 0; const handler = { ownKeys() { traps++; return []; }, isExtensible() { traps++; return true; }, getPrototypeOf() { traps++; return Object.prototype; } };
  assert.throws(() => route(new Proxy({}, handler)));
  await rejected(r => { r.input.configuration.fundingOptions.readSessionOptions = new Proxy({}, handler); });
  await rejected(r => { r.input.configuration.fundingOptions.keyPair = new Proxy({}, handler); }); assert.equal(traps, 0);
});
check('accessor-key-methods-and-missing-sdk-methods-are-refused-without-key-entry', async () => {
  let calls = 0;
  await rejected(r => { const key = { getAddress() {}, getPublicKey() {}, clear() {} }; Object.defineProperty(key, 'sign', { get() { calls++; return () => {}; } }); r.input.configuration.fundingOptions.keyPair = key; });
  await rejected(r => { r.input.configuration.fundingOptions.keyPair = F({ getPublicKey() {}, getAddress() {} }); }); assert.equal(calls, 0);
});
check('a-proxy-day-capability-is-rejected-before-isFrozen-can-enter-its-traps', async () => {
  let calls = 0; await rejected(r => { r.input.spending.readDay = new Proxy(function day() {}, { isExtensible() { calls++; return true; }, ownKeys() { calls++; return []; } }); }); assert.equal(calls, 0);
});
check('matching-mutation-of-both-owned-ca-buffers-cannot-change-admitted-trust', async () => {
  const r = f.capturedConfiguration(), s = select(r.input); s.configuration.fundingOptions.fundingTransportOptions.ca.fill(1); s.configuration.serviceOptions.transportOptions.ca.fill(1);
  assert.throws(() => consume(s)); assert.throws(() => consume(s)); assert.equal(r.keyCalls + r.clockCalls, 0); assert.ok(r.ca.some(x => x !== 1)); await r.h.root.close();
});
check('one-sided-ca-mutation-is-rechecked-before-a-consumed-selection-can-open-the-file', async () => {
  const r = f.capturedConfiguration(), s = select(r.input); s.configuration.serviceOptions.transportOptions.ca[0] ^= 1;
  assert.throws(() => consume(s)); assert.ok(s.configuration.fundingOptions.fundingTransportOptions.ca.every(x => x === 0)); await r.h.root.close();
});
check('key-method-shape-is-rechecked-at-consumption-without-constructing-an-owner', async () => {
  const r = f.capturedConfiguration(), mutable = { ...r.input.configuration.fundingOptions.keyPair }; r.input.configuration.fundingOptions.keyPair = mutable;
  const s = select(r.input); delete mutable.clear; assert.throws(() => consume(s)); assert.equal(r.keyCalls + r.clockCalls, 0); await r.h.root.close();
});
check('trailing-newlines-cannot-pass-path-or-symbol-full-byte-admission', async () => {
  await rejected(r => { r.input.configuration.storeOptions.databasePath += '\n'; });
  await rejected(r => { r.input.configuration.serviceOptions.official.assetInfo.symbol += '\n'; });
});
export const apiCreditAdmissionDataCases = F(checks.map(c => F(c)));
if (typeof process.argv[1] === 'string' && fileURLToPath(import.meta.url) === process.argv[1]) {
const cases = [];
for (const { id, run } of checks) { try { await run(); cases.push({ id, status: 'PASS' }); } catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); } }
const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'G0_G1_API_CREDIT_INERT_ADMISSION_DATA', passed: cases.length - failed, failed, cases,
  priorApplicationCases: apiCreditApplicationDataCases.length, nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0,
  nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0, nativeAdmissionExecution: 'NOT_ESTABLISHED', nativeProductAcceptance: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;
}
