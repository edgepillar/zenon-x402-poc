// Actual shared HTTPS core, but constructor/admission/empty-close calls ONLY.
// No valid exchange before close, native request, socket, TLS parser, SDK,
// SQLite, key, signature, nonce work or source/native substitution is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createBoundedJsonRpcHttpsExchangeOwner as createOwner } from '../src/zenon/bounded-json-rpc-https-exchange-owner.js';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.argv.length, 2);
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
assert.equal(process.env.X402_RPC_INERT_SELECTION, 'twelve-constructor-admission-cases');
assert.ok(process.permission && !process.permission.has('fs.write')
  && !process.permission.has('child') && !process.permission.has('worker'));

const freeze = Object.freeze, options = { concurrency: false, timeout: 1000 };
const DP = 'dynamic_plasma', FUNDING = 'zenon_funding';
const RETAINED = 'dynamic_plasma_retained_candidate';
const ACCOUNT = 'zenon_account_state_retained_candidate';
const totals = { entered: 0, completed: 0, snapshotCalls: 0, inspectorReceipts: 0,
  emptyCloseReturns: 0, getterCalls: 0, proxyTraps: 0, invalidExchangeCalls: 0,
  postCloseExchangeCalls: 0 };
const data = fields => freeze(Object.assign(Object.create(null), fields));
const publicRoute = () => data({ hostname: 'rpc.qualification.io', path: '/rpc', ipv4Address: '8.8.8.8' });
const localRoute = path => data({ hostname: 'localhost', path, ipv4Address: '127.0.0.1' });
const configuration = (route = publicRoute()) => data({ route, timeoutMs: 1000, closeGraceMs: 1000 });
const snapshot = freeze(function snapshot(value) { totals.snapshotCalls++; return value; });
function refused(error) {
  assert.ok(error instanceof TypeError); assert.ok(Object.isFrozen(error));
  assert.match(error.code, /_configuration_rejected$/);
  assert.ok(!error.stack.includes('\n')); return true;
}
function unavailable(error) {
  assert.ok(error instanceof Error); assert.ok(Object.isFrozen(error));
  assert.match(error.code, /_unavailable$/); return true;
}
function retained(profile = RETAINED, input = configuration(), local = null) {
  let inspect = null;
  const receive = freeze(function receive(value) {
    assert.equal(arguments.length, 1); totals.inspectorReceipts++; inspect = value;
  });
  const owner = local === null
    ? createOwner(input, 1, snapshot, profile, undefined, receive)
    : createOwner(input, 1, snapshot, profile, undefined, receive, local);
  assert.equal(typeof inspect, 'function'); assert.ok(Object.isFrozen(inspect));
  return { owner, inspect };
}
function empty(view, closed) {
  assert.equal(view.nativeReadCustodyVersion, 1);
  assert.equal(view.activeGeneration, false); assert.equal(view.uncertaintyLatched, false);
  assert.equal(view.closeRequested, closed); assert.equal(view.closePromiseSettled, closed);
  assert.equal(view.closeObserved, closed); assert.equal(view.retiredErrorObserved, false);
  for (const key of ['trackedRequests', 'trackedResponses', 'trackedSockets', 'trackedAgents', 'ownedTimers'])
    assert.equal(view[key], 0);
  assert.equal(view.nativePhysicalDrain, 'NOT_QUALIFIED'); assert.equal(view.authority, 'NONE');
}
async function closeEmpty(owner) {
  const first = owner.close(); assert.equal(owner.close(), first);
  assert.equal(await first, undefined); totals.emptyCloseReturns++;
  return first;
}
async function selected(name, callback) {
  let complete = false;
  await test(name, options, async () => {
    totals.entered++; await callback(); totals.completed++; complete = true;
  });
  if (!complete) throw Error('RPC_INERT_CASE_FAILED_STOP');
}

await selected('legacy four-argument selections preserve frozen methods and cached empty close', async () => {
  for (const profile of [DP, FUNDING]) {
    const owner = createOwner(configuration(), 1, snapshot, profile);
    assert.deepEqual(Object.keys(owner), ['exchange', 'close']);
    assert.ok(Object.isFrozen(owner) && Object.isFrozen(owner.exchange) && Object.isFrozen(owner.close));
    await closeEmpty(owner);
  }
});
await selected('legacy funding policy stays version one port 443 and runtime default PKI', async () => {
  let policy = null;
  const receive = freeze(function receive(value) { assert.equal(arguments.length, 1); policy = value; });
  const owner = createOwner(configuration(), 1, snapshot, FUNDING, receive);
  assert.ok(Object.isFrozen(policy)); assert.equal(policy.version, 1);
  assert.deepEqual(Object.keys(policy), ['connection', 'endpoint', 'lookup', 'request', 'timing', 'tls', 'version']);
  assert.deepEqual({ ...policy.endpoint }, { hostname: 'rpc.qualification.io', path: '/rpc',
    pinnedIpv4Address: '8.8.8.8', port: 443 });
  assert.equal(policy.tls.trustMode, 'runtime-default-pki');
  assert.equal(policy.tls.exactCaTrustAnchorsPinned, false);
  assert.equal(policy.tls.zenonChainIdentityAuthenticated, false);
  assert.equal(policy.request.retryMode, 'none'); assert.equal(policy.request.redirectMode, 'none');
  assert.equal(policy.admission, undefined); assert.equal(policy.qualification, undefined);
  await closeEmpty(owner);
});
await selected('legacy and public retained selections cannot acquire loopback routes', () => {
  for (const profile of [DP, FUNDING, RETAINED, ACCOUNT]) {
    for (const route of [localRoute('/rpc/first'), data({ ...publicRoute(), ipv4Address: '127.0.0.1' }),
      data({ ...publicRoute(), ipv4Address: '192.168.1.2' }), data({ ...publicRoute(), hostname: 'localhost' })])
      assert.throws(() => createOwner(configuration(route), 1, snapshot, profile), refused);
  }
});
await selected('retained six-argument constructors expose only actual empty custody inspection', async () => {
  for (const profile of [RETAINED, ACCOUNT]) {
    const fixture = retained(profile); empty(fixture.inspect(), false);
    assert.deepEqual(Object.keys(fixture.owner), ['exchange', 'close']);
    await closeEmpty(fixture.owner); empty(fixture.inspect(), true);
  }
});
await selected('native custody callbacks cannot silently widen either legacy selection', () => {
  const receive = freeze(function receive() { throw Error('MUST_NOT_ENTER'); });
  for (const profile of [DP, FUNDING])
    assert.throws(() => createOwner(configuration(), 1, snapshot, profile, undefined, receive), refused);
  assert.throws(() => createOwner(configuration(), 1, snapshot, DP, receive), refused);
  assert.throws(() => createOwner(configuration(), 1, snapshot, FUNDING, function receive() {}), refused);
});
await selected('named local selection releases its private CA copy once without touching borrowed bytes', async () => {
  for (const [profile, path] of [[RETAINED, '/rpc/first'], [ACCOUNT, '/rpc/account']]) {
    // Four DATA bytes, deliberately not a TLS certificate; no parser/request runs.
    const ca = Buffer.from([17, 33, 54, 89]), before = Buffer.from(ca);
    const fixture = retained(profile, configuration(localRoute(path)), freeze({ port: 18443, ca }));
    empty(fixture.inspect(), false);
    assert.equal(fixture.inspect().loopbackQualification.ownedCaBytesRetained, true);
    await closeEmpty(fixture.owner); empty(fixture.inspect(), true);
    const local = fixture.inspect().loopbackQualification;
    assert.equal(local.ownedCaBytesRetained, false); assert.equal(local.localCaReleaseAttempts, 1);
    assert.equal(local.localCaReleaseOutcome, 'RETURNED'); assert.equal(local.productionRouteQualified, false);
    assert.deepEqual(ca, before);
  }
});
await selected('local qualification refuses wrong role routes ports CA shapes and public profiles', () => {
  const ca = Buffer.from([1]), receive = freeze(function receive() {}), valid = freeze({ port: 18443, ca });
  const attempt = (profile, route, local) => createOwner(configuration(route), 1, snapshot,
    profile, undefined, receive, local);
  for (const profile of [DP, FUNDING]) assert.throws(() => attempt(profile, localRoute('/rpc/first'), valid), refused);
  for (const path of ['/rpc/account', '/rpc/first?x=1', '/rpc/first/', '/rpc/other'])
    assert.throws(() => attempt(RETAINED, localRoute(path), valid), refused);
  for (const port of [0, 443, 1023, 65536, '18443'])
    assert.throws(() => attempt(RETAINED, localRoute('/rpc/first'), freeze({ port, ca })), refused);
  for (const local of [null, freeze({ port: 18443 }), freeze({ port: 18443, ca: new Uint8Array([1]) }),
    freeze({ port: 18443, ca, extra: true })])
    assert.throws(() => attempt(RETAINED, localRoute('/rpc/first'), local), refused);
});
await selected('constructor rejects extra arity source-policy collisions and non-undefined inspector returns', () => {
  const input = configuration(), receive = freeze(function receive() {});
  assert.throws(() => createOwner(input, 1, snapshot, RETAINED, undefined, receive, null, null), refused);
  assert.throws(() => createOwner(input, 1, snapshot, RETAINED, receive, receive), refused);
  assert.throws(() => createOwner(input, 1, snapshot, RETAINED, undefined,
    freeze(function receive() { return true; })), refused);
  assert.throws(() => createOwner(input, 2, snapshot, DP), refused);
});
await selected('normalized accessor proxy and nonexact configuration is refused without hooks', () => {
  const withAccessor = Object.create(null);
  Object.defineProperties(withAccessor, { route: { enumerable: true, get() { totals.getterCalls++; return publicRoute(); } },
    timeoutMs: { enumerable: true, value: 1000 }, closeGraceMs: { enumerable: true, value: 1000 } });
  const proxy = new Proxy(configuration(), { ownKeys() { totals.proxyTraps++; throw Error('TRAP'); },
    getPrototypeOf() { totals.proxyTraps++; throw Error('TRAP'); } });
  for (const input of [freeze(withAccessor), proxy, data({ ...configuration(), extra: true }),
    data({ ...configuration(), timeoutMs: -0 }), freeze({ ...configuration() })])
    assert.throws(() => createOwner(input, 1, snapshot, DP), refused);
  assert.equal(totals.getterCalls, 0); assert.equal(totals.proxyTraps, 0);
});
await selected('invalid empty exchange is refused before generation creation and never renews admission', async () => {
  const fixture = retained(); empty(fixture.inspect(), false);
  totals.invalidExchangeCalls++; const rejected = fixture.owner.exchange('');
  await assert.rejects(rejected, unavailable); empty(fixture.inspect(), false);
  totals.invalidExchangeCalls++; assert.equal(fixture.owner.exchange(''), rejected);
  await closeEmpty(fixture.owner); empty(fixture.inspect(), true);
});
await selected('invalid close arity does not consume the genuine empty close operation', async () => {
  const fixture = retained(); await assert.rejects(fixture.owner.close(null), refused);
  empty(fixture.inspect(), false); const first = fixture.owner.close(); await closeEmpty(fixture.owner);
  assert.equal(fixture.owner.close(), first); empty(fixture.inspect(), true);
});
await selected('all exchange input after genuine empty close stays refused without creating a generation', async () => {
  const fixture = retained(); await closeEmpty(fixture.owner);
  totals.postCloseExchangeCalls++; const first = fixture.owner.exchange('{}');
  await assert.rejects(first, unavailable);
  for (const input of ['{}', '', null]) {
    totals.postCloseExchangeCalls++; assert.equal(fixture.owner.exchange(input), first);
  }
  empty(fixture.inspect(), true);
});

assert.equal(totals.entered, 12); assert.equal(totals.completed, 12);
assert.equal(totals.getterCalls, 0); assert.equal(totals.proxyTraps, 0);
console.log('# rpc-inert-construction ' + JSON.stringify({ ...totals,
  scope: 'ACTUAL_CORE_CONSTRUCTION_ADMISSION_EMPTY_CLOSE_ONLY',
  nativeRequestEntry: 'EXCLUDED_BY_SELECTED_CALL_PATHS_NOT_INSTRUMENTED',
  nativeEventsAuthenticated: false, sourceTransforms: 0, nativeAliases: 0,
  completeDpGraphQualified: false, issuedGrantNativeQualified: false, authority: 'NONE' }));
