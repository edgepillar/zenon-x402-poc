// Actual SDK-free selected bridge + actual HTTPS-router close composition.
// Existing official SDK wrappers are source-reviewed, not imported or replaced.
// Verifier/settlement replies and request/response objects remain declared DATA.
// No SDK, SQLite, TLS/socket, key, signature, nonce search or payment is run.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { createOfficialUpfrontServiceCreditHttpsRouter as ROUTER }
  from '../src/x402-official-upfront-https-router.js';
import { createSelectedSettlementServerBridgeForOfficialX402Core223 as BRIDGE }
  from '../src/x402-selected-settlement-server-bridge.js';
import { makePaymentRequired, validatePaymentRequired } from '../src/x402-wire.js';

const NativePromise = Promise, PROMISE = NativePromise.prototype;
const species = Symbol.species;
const constructorBefore = Object.getOwnPropertyDescriptor(PROMISE, 'constructor');
const speciesBefore = Object.getOwnPropertyDescriptor(NativePromise, species);
const thenBefore = Object.getOwnPropertyDescriptor(PROMISE, 'then');
const freeze = Object.freeze, OPTIONS = { timeout: 5000, concurrency: false };
const ORIGIN = 'https://router-bridge-close.invalid:8443', HASH = 'a'.repeat(64);
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.argv.length, 2);
assert.equal(process.argv[1], fileURLToPath(
  new URL('./official-x402-upfront-https-router.behavior.draft.mjs', import.meta.url)));
assert.equal(process.env.X402_ROUTER_NATIVE_PROMISE_CLOSE_OPT_IN,
  'actual-sdk-free-bridge-and-native-promise-only');

let completed = 0, actualBridgeFixtures = 0;
const routers = [];
function cap() {
  let resolve, reject;
  const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function completion() {
  const d = cap(), counts = { success: 0, failure: 0 };
  return { promise: d.promise, counts, value: freeze({
    success: freeze(() => { counts.success++; d.resolve(true); }),
    failure: freeze(() => { counts.failure++; d.resolve(false); }),
  }) };
}
function request(header) {
  return { method: 'GET', url: '/paid', httpVersion: '1.1',
    socket: { encrypted: true }, rawHeaders: ['Host', 'router-bridge-close.invalid:8443',
      'Payment-Signature', header] };
}
function response() {
  return { destroyed: false, writableEnded: false, statusCode: 200, writes: 0,
    headers: Object.create(null),
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body) { this.writes++; this.body = body; this.writableEnded = true; } };
}
function mount(process, closeResult) {
  const f = { serviceCloses: 0, serviceCalls: 0, closed: false };
  const official = freeze({ processRequest: freeze(() => { throw Error('NO_SCALAR_ENTRY'); }),
    processHttpRequest: freeze(process), getSnapshot: freeze(() => freeze({ declaredHost: true })) });
  const service = freeze({ handle: freeze(async () => { f.serviceCalls++; throw Error('NO_SERVICE'); }),
    close: freeze(() => { f.serviceCloses++; return closeResult(); }) });
  f.router = ROUTER({ resourceUrl: ORIGIN + '/paid', officialServer: official,
    serviceSession: service, maxFundingPayments: 4 });
  routers.push(f); return f;
}
function dispatch(f, header) {
  const done = completion(), res = response();
  assert.equal(f.router.handle(request(header), res, freeze({ declaredHost: true }), done.value), undefined);
  return { done, res };
}
function startClose(f, done = completion()) {
  assert.equal(f.router.close(done.value), undefined); return done;
}
async function closed(f, done, expected = true) {
  assert.equal(await done.promise, expected);
  f.closed = true;
  assert.deepEqual(done.counts, { success: Number(expected), failure: Number(!expected) });
  const s = f.router.snapshot();
  assert.equal(s.phase, expected ? 'CLOSED' : 'CLOSE_UNCERTAIN');
  assert.equal(s.pendingCloses, 0); assert.equal(s.activeOperations, 0);
  assert.equal(s.retainedPayments, 0); assert.equal(f.serviceCloses, 1);
  assert.equal(f.serviceCalls, 0); return s;
}
function settlement(payload, req, success) {
  return { success, ...(success ? { payer: 'declared-payer' } : { errorReason: 'settlement_pending' }),
    transaction: payload.payload.transaction.hash, network: req.network,
    publicationStatus: success ? 'ACKNOWLEDGED' : 'UNKNOWN' };
}
async function bridgeFixture(observerSuccess = true, held = false) {
  actualBridgeFixtures++;
  const requirement = { scheme: 'exact', network: 'zenon:mock', asset: 'zts1declaredasset',
    amount: '1', payTo: 'z1declaredrecipient', maxTimeoutSeconds: 60,
    extra: { paymentFlow: 'upfront', poc: true, settlement: 'account-block',
      zenonChain: { version: 1, chainIdentifier: String(Number.MAX_SAFE_INTEGER),
        genesisMomentumHash: '0'.repeat(64) } } };
  let f = { calls: { verify: 0, first: 0, observer: 0, continuation: 0 },
    entered: cap(), release: cap(), httpCalls: 0 };
  f.challenge = makePaymentRequired({ resourceUrl: ORIGIN + '/paid', description: 'Declared bridge close',
    mimeType: 'application/json', serviceName: 'declared', tags: ['test'], requirement });
  f.view = f.challenge.accepts[0];
  const copy = value => JSON.parse(JSON.stringify(value));
  f.payload = { x402Version: 2, resource: copy(f.challenge.resource), accepted: copy(requirement),
    payload: { transaction: { hash: HASH, signature: 'DECLARED_NOT_A_WALLET_SIGNATURE',
      nonce: '0000000000000000' }, intentDigest: 'b'.repeat(64) } };
  const facilitator = {
    verify() { f.calls.verify++; return { isValid: true, payer: 'declared-payer' }; },
    settle(p, r) { f.calls.first++; return settlement(p, r, false); },
  };
  f.bridge = BRIDGE({ requirement, localFacilitator: facilitator,
    validateChallenge(data) { validatePaymentRequired(data); },
    reconcilePendingSettlement(p, r) { f.calls.observer++; return settlement(p, r, observerSuccess); },
    maxPendingReconciliations: 1, contextLimit: 4 });
  await f.bridge.schemeServer.enrichPaymentRequiredResponse({
    paymentRequiredResponse: f.challenge, requirements: f.challenge.accepts });
  const initial = await f.bridge.facilitatorClient.settle(f.payload, f.view);
  assert.equal(initial.success, false); assert.equal(initial.errorReason, 'settlement_pending');
  f.header = Buffer.from(JSON.stringify(f.payload)).toString('base64');
  f.context = { request: freeze({ adapter: freeze({ declaredHost: true }),
    method: 'GET', path: '/paid', paymentHeader: f.header }) };
  f.pending = f.bridge.createPendingContinuation({ paymentPayload: f.payload,
    requirements: f.view, transportContext: f.context,
    processSettlement: async function processSettlement(p, r, a, ctx, b, c, phase) {
      assert.equal(arguments.length, 7); assert.equal(p, f.payload); assert.equal(r, f.view);
      assert.equal(ctx, f.context); assert.equal(a, undefined); assert.equal(b, undefined);
      assert.equal(c, undefined); assert.equal(phase, 'before-handler');
      f.calls.continuation++; f.entered.resolve();
      if (held) await f.release.promise;
      const result = await f.bridge.facilitatorClient.settle(p, r);
      return { ...result, headers: { 'PAYMENT-RESPONSE': Buffer.from(JSON.stringify(result)).toString('base64') } };
    } });
  const root = mount(async () => {
    f.httpCalls++;
    return { type: 'payment-error', response: { status: 402,
      headers: { 'PAYMENT-RESPONSE': Buffer.from(JSON.stringify(initial)).toString('base64') },
      body: {} }, pending: f.pending };
  }, () => NativePromise.resolve());
  f = Object.assign(root, f);
  const first = dispatch(f, f.header);
  assert.equal(await first.done.promise, true); assert.equal(first.res.statusCode, 402);
  assert.deepEqual(f.calls, { verify: 1, first: 1, observer: 0, continuation: 0 });
  return f;
}
function checkDetached(f) {
  const p = f.pending.close(), descriptor = Object.getOwnPropertyDescriptor(p, 'constructor');
  assert.equal(descriptor.value, NativePromise);
  assert.deepEqual([descriptor.enumerable, descriptor.writable, descriptor.configurable], [false, false, false]);
  assert.equal(f.pending.close(), p);
  const pending = f.pending.getSnapshot();
  assert.equal(pending.closeOutcome, 'DETACHED'); assert.equal(pending.referencesReleased, true);
  assert.equal(pending.firstAuthorityConsumed, true);
  const owner = f.bridge.getSnapshot().contexts[0].boundOwner.settlement;
  assert.equal(owner.firstAttempts, 1); assert.equal(owner.firstAuthorityConsumed, true);
  assert.equal(f.httpCalls, 1); return p;
}
function scenario(name, run) {
  test(name, OPTIONS, async () => { await run(); completed++; });
}

scenario('actual bridge shielded pending-close receipt allows a clean router close', async () => {
  const f = await bridgeFixture();
  await closed(f, startClose(f)); await checkDetached(f);
  assert.deepEqual(f.calls, { verify: 1, first: 1, observer: 0, continuation: 0 });
});

scenario('actual bridge pending-success replay closes without a second first settlement', async () => {
  const f = await bridgeFixture();
  const next = dispatch(f, f.header);
  assert.equal(await next.done.promise, true); assert.equal(next.res.statusCode, 200);
  await closed(f, startClose(f)); await checkDetached(f);
  assert.deepEqual(f.calls, { verify: 1, first: 1, observer: 1, continuation: 1 });
});

scenario('actual bridge pending exhaustion closes without renewing observer authority', async () => {
  const f = await bridgeFixture(false);
  const next = dispatch(f, f.header);
  assert.equal(await next.done.promise, true); assert.equal(next.res.statusCode, 402);
  await closed(f, startClose(f)); await checkDetached(f);
  assert.equal(f.pending.getSnapshot().phase, 'PENDING_EXHAUSTED');
  assert.deepEqual(f.calls, { verify: 1, first: 1, observer: 1, continuation: 1 });
});

scenario('router observes the actual bridge close receipt until an active continuation drains', async () => {
  const f = await bridgeFixture(true, true), next = dispatch(f, f.header);
  await f.entered.promise;
  const closing = startClose(f);
  assert.equal(await next.done.promise, false);
  assert.equal(f.router.snapshot().phase, 'CLOSING');
  assert.equal(f.router.snapshot().pendingCloses, 1);
  assert.equal(f.pending.getSnapshot().closeOutcome, 'DRAINING');
  f.release.resolve();
  await closed(f, closing, false); await checkDetached(f);
  assert.equal(next.res.writes, 0);
  assert.deepEqual(f.calls, { verify: 1, first: 1, observer: 1, continuation: 1 });
});

scenario('plain native service-close Promise remains supported', async () => {
  const f = mount(async () => { throw Error('NO_HTTP'); }, () => NativePromise.resolve());
  await closed(f, startClose(f));
});

scenario('exact locked native constructor service-close receipt is supported', async () => {
  const promise = NativePromise.resolve();
  Object.defineProperty(promise, 'constructor', { value: NativePromise,
    enumerable: false, writable: false, configurable: false });
  const f = mount(async () => { throw Error('NO_HTTP'); }, () => promise);
  await closed(f, startClose(f));
});

scenario('a rejected exact locked native receipt remains uncertain', async () => {
  const promise = NativePromise.reject(Error('DECLARED_CLOSE_FAILURE'));
  promise.catch(() => {});
  Object.defineProperty(promise, 'constructor', { value: NativePromise,
    enumerable: false, writable: false, configurable: false });
  const f = mount(async () => { throw Error('NO_HTTP'); }, () => promise);
  await closed(f, startClose(f), false);
});

scenario('native receipt constructor accessors are rejected without executing the getter', async () => {
  let reads = 0;
  const promise = NativePromise.resolve();
  Object.defineProperty(promise, 'constructor', { get() { reads++; throw Error('FORBIDDEN'); } });
  const f = mount(async () => { throw Error('NO_HTTP'); }, () => promise);
  await closed(f, startClose(f), false); assert.equal(reads, 0);
});

scenario('foreign constructor functions and proxies receive no species or invocation authority', async () => {
  let effects = 0;
  const foreign = function foreign() { effects++; throw Error('FORBIDDEN'); };
  Object.defineProperty(foreign, species, { get() { effects++; throw Error('FORBIDDEN'); } });
  const proxy = new Proxy(foreign, { get() { effects++; throw Error('FORBIDDEN'); } });
  for (const constructor of [foreign, proxy]) {
    const promise = NativePromise.resolve();
    Object.defineProperty(promise, 'constructor', { value: constructor });
    const f = mount(async () => { throw Error('NO_HTTP'); }, () => promise);
    await closed(f, startClose(f), false);
  }
  assert.equal(effects, 0);
});

scenario('mutable shields subclasses proxies and thenables remain rejected', async () => {
  let effects = 0;
  const invalid = [];
  for (const flag of ['enumerable', 'writable', 'configurable']) {
    const promise = NativePromise.resolve();
    Object.defineProperty(promise, 'constructor', { value: NativePromise,
      enumerable: flag === 'enumerable', writable: flag === 'writable', configurable: flag === 'configurable' });
    invalid.push(promise);
  }
  class Subclass extends NativePromise {}
  invalid.push(Subclass.resolve());
  invalid.push(new Proxy(NativePromise.resolve(), { get() { effects++; throw Error('FORBIDDEN'); } }));
  invalid.push(Object.defineProperty({}, 'then', { get() { effects++; throw Error('FORBIDDEN'); } }));
  for (const value of invalid) {
    const f = mount(async () => { throw Error('NO_HTTP'); }, () => value);
    await closed(f, startClose(f), false);
  }
  assert.equal(effects, 0);
});

scenario('changed native species is refused before its getter can execute', async () => {
  let reads = 0;
  const promise = NativePromise.resolve(), done = completion();
  const f = mount(async () => { throw Error('NO_HTTP'); }, () => promise);
  try {
    Object.defineProperty(NativePromise, species, { configurable: true,
      get() { reads++; throw Error('FORBIDDEN_SPECIES'); } });
    startClose(f, done);
  } finally { Object.defineProperty(NativePromise, species, speciesBefore); }
  await closed(f, done, false); assert.equal(reads, 0);
});

scenario('changed prototype constructor is refused before its getter can execute', async () => {
  let reads = 0;
  const promise = NativePromise.resolve(), done = completion();
  const f = mount(async () => { throw Error('NO_HTTP'); }, () => promise);
  try {
    Object.defineProperty(PROMISE, 'constructor', { configurable: true,
      get() { reads++; throw Error('FORBIDDEN_CONSTRUCTOR'); } });
    startClose(f, done);
  } finally { Object.defineProperty(PROMISE, 'constructor', constructorBefore); }
  await closed(f, done, false); assert.equal(reads, 0);
});

after(() => {
  assert.equal(completed, 12); assert.equal(actualBridgeFixtures, 4);
  // Every mounted router must reach its one terminal close verdict.
  assert.ok(routers.every(f => ['CLOSED', 'CLOSE_UNCERTAIN'].includes(f.router.snapshot().phase)));
  assert.deepEqual(Object.getOwnPropertyDescriptor(PROMISE, 'constructor'), constructorBefore);
  assert.deepEqual(Object.getOwnPropertyDescriptor(NativePromise, species), speciesBefore);
  assert.deepEqual(Object.getOwnPropertyDescriptor(PROMISE, 'then'), thenBefore);
  console.log('# router-native-promise-close ' + JSON.stringify({
    kind: 'ACTUAL_SELECTED_BRIDGE_ROUTER_NATIVE_PROMISE_CLOSE', version: 1,
    completedCases: completed, actualBridgeFixtures, actualRouter: true,
    actualSdkFreeBridge: true, actualOfficialSdkWrapper: false,
    declaredVerifierSettlementAndTransportData: true,
    node: process.versions.node, platform: process.platform, arch: process.arch,
    SDK: 0, SQL: 0, nativeHttps: 0, sockets: 0, keys: 0, signatures: 0,
    nonceSearch: 0, payments: 0, physicalResourceRelease: false, fullP1: 'NOT_ESTABLISHED',
  }));
});
