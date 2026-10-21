import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// New shared server-bridge composition:30 retained owner assertions +20 new.
// SDK-shaped calls execute THIS SDK-FREE bridge, not an official SDK method.
// All verifier results, hash/signature fields, observation replies and delivery
// counters are declared test-owned DATA. No SDK, wallet, key, signing, SQL,
// HTTP/RPC owner, nonce search, payment or real service delivery is run.
assert.equal(process.argv.length, 2); assert.equal(process.versions.node, '24.19.0');
let source;
for (const [path, bytes, sha] of [
  ['../src/x402-selected-settlement-server-bridge.js', 25304, 'f805d0b02379e4812a07ce8fd7ee12167b394dbb328de01d58e5630cf7d385cc'],
  ['./x402-verification-bound-settlement-context.behavior.draft.mjs', 24852, '2efd1b9a34f3e2ffe5aed1b2a30142d3e6a51aca6b0752de11f08c500942c505'],
]) {
  const raw = readFileSync(new URL(path, import.meta.url));
  assert.equal(raw.length, bytes); assert.equal(createHash('sha256').update(raw).digest('hex'), sha);
  assert.equal(/[^\x00-\x7f]/.test(raw.toString('utf8')) || raw.includes(0), false);
  if (source === undefined) source = raw.toString('ascii');
}
await import('./x402-verification-bound-settlement-context.behavior.draft.mjs');
const { createSelectedSettlementServerBridge: CREATE }
  = await import('../src/x402-selected-settlement-server-bridge.js');
const { makePaymentRequired, validatePaymentRequired }
  = await import('../src/x402-wire.js');
const OPTIONS = { timeout: 5000, concurrency: false };
const NativePromise = Promise, nativeThen = Promise.prototype.then, apply = Reflect.apply;
const copy = value => JSON.parse(JSON.stringify(value)); // Owned valid fixture DATA only.
const HASH = 'a'.repeat(64);
function requirement() {
  return { scheme: 'exact', network: 'zenon:mock', asset: 'zts1declaredasset', amount: '1',
    payTo: 'z1declaredrecipient', maxTimeoutSeconds: 60,
    extra: { paymentFlow: 'upfront', poc: true, settlement: 'account-block',
      zenonChain: { version: 1, chainIdentifier: String(Number.MAX_SAFE_INTEGER), genesisMomentumHash: '0'.repeat(64) } } };
}
function cap() {
  let resolve, reject; const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function outcome(pending) {
  return apply(nativeThen, pending, [value => ({ value }), error => ({ error })]);
}
function rawSettlement(payload, req, disposition = 'SUCCEEDED', publicationStatus = 'NOT_ESTABLISHED') {
  return { success: disposition === 'SUCCEEDED',
    ...(disposition === 'SUCCEEDED' ? { payer: 'declared-payer' } : {
      errorReason: disposition === 'PENDING' ? 'settlement_pending' : 'settlement_outcome_unknown',
    }),
    transaction: payload.payload.transaction.hash, network: req.network, publicationStatus };
}
function fixture(mode = {}) {
  const req = requirement(), calls = { schema: 0, verify: 0, first: 0, observer: 0 };
  const f = { req, mode, calls, seen: [], schemaSeen: [], verifyReady: cap(), firstReady: cap() };
  f.challenge = makePaymentRequired({ resourceUrl: 'https://sdk-free.invalid/paid', description: 'declared resource',
    mimeType: 'application/json', serviceName: 'declared', tags: ['test'], requirement: req });
  f.view = f.challenge.accepts[0];
  f.payload = { x402Version: 2, resource: copy(f.challenge.resource), accepted: copy(req),
    payload: { transaction: { hash: HASH, signature: 'declared-not-a-wallet-signature', nonce: '0000000000000000' },
      intentDigest: 'b'.repeat(64) } };
  function entered(role, receiver, args) {
    assert.equal(receiver, role === 'observer' ? undefined : f.facilitator);
    assert.equal(args.length, 3); calls[role]++;
    f.seen.push({ role, args, texts: args.map(v => JSON.stringify(v)) });
  }
  class Facilitator {
    verify(...args) {
      entered('verify', this, args); f.verifyReady.resolve(undefined);
      return mode.onVerify ? mode.onVerify(...args, f) : { isValid: true, payer: 'declared-payer' };
    }
    settle(...args) {
      entered('first', this, args); f.firstReady.resolve(undefined);
      return mode.onFirst ? mode.onFirst(...args, f) : rawSettlement(args[0], args[1]);
    }
  }
  f.facilitator = new Facilitator();
  f.options = {
    requirement: req, localFacilitator: f.facilitator,
    validateChallenge: function validateChallenge(data) {
      assert.equal(this, undefined); assert.equal(arguments.length, 1);
      assert.ok(Object.isFrozen(data)); assert.ok(Object.isFrozen(data.resource)); assert.ok(Object.isFrozen(data.accepts));
      calls.schema++; f.schemaSeen.push(data); validatePaymentRequired(data);
      return mode.onSchema ? mode.onSchema(data, f) : undefined;
    },
    reconcilePendingSettlement: mode.observer === false ? null : function observe(...args) {
      entered('observer', this, args);
      return mode.onObserver ? mode.onObserver(...args, f) : rawSettlement(args[0], args[1], 'SUCCEEDED', 'ACKNOWLEDGED');
    },
    maxPendingReconciliations: mode.budget ?? 2, contextLimit: mode.contextLimit ?? 4,
  };
  f.bridge = CREATE(f.options); f.client = f.bridge.facilitatorClient; f.scheme = f.bridge.schemeServer;
  f.capture = (challenge = f.challenge, views = challenge.accepts) =>
    f.scheme.enrichPaymentRequiredResponse({ paymentRequiredResponse: challenge, requirements: views });
  f.verify = (payload = f.payload, view = f.view) => f.client.verify(payload, view);
  f.settle = (payload = f.payload, view = f.view) => f.client.settle(payload, view);
  return f;
}
const snap = f => f.bridge.getSnapshot();
function rejected(kind) {
  return error => {
    assert.ok(error instanceof TypeError); assert.ok(Object.isFrozen(error));
    assert.equal(error.code, 'x402_selected_server_bridge_' + kind);
    assert.equal(error.message, error.code); assert.equal(error.stack, 'TypeError: ' + error.code);
    assert.equal(Object.hasOwn(error, 'cause'), false); return true;
  };
}
async function verified(f) { await f.capture(); assert.equal((await f.verify()).isValid, true); }
const owner = (f, index = 0) => snap(f).contexts[index].boundOwner;

test('selected server bridge exposes frozen SDK shaped roles and rejects unsafe configuration without construction callbacks', OPTIONS, () => {
  const f = fixture(); assert.deepEqual(Object.keys(f.bridge), ['schemeServer', 'facilitatorClient', 'getSnapshot']);
  for (const value of [f.bridge, f.scheme, f.client, f.scheme.paymentFlows,
    f.scheme.paymentFlows.default, f.scheme.paymentFlows.default.supported]) assert.ok(Object.isFrozen(value));
  for (const fn of [f.scheme.parsePrice, f.scheme.enhancePaymentRequirements, f.scheme.enrichPaymentRequiredResponse,
    f.client.getSupported, f.client.verify, f.client.settle, f.bridge.getSnapshot]) assert.ok(Object.isFrozen(fn));
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_CONFIG'); };
  const getter = { ...f.options }; Object.defineProperty(getter, 'localFacilitator', { enumerable: true, get: hook });
  const methodGetter = {}; Object.defineProperty(methodGetter, 'verify', { get: hook });
  for (const bad of [null, {}, getter, { ...f.options, localFacilitator: methodGetter },
    { ...f.options, extra: true }, { ...f.options, contextLimit: 0 }, { ...f.options, contextLimit: 65 },
    { ...f.options, contextLimit: -0 }, { ...f.options, maxPendingReconciliations: 17 },
    { ...f.options, reconcilePendingSettlement: f.facilitator.settle },
    { ...f.options, validateChallenge: f.facilitator.verify },
    { ...f.options, validateChallenge: new Proxy(function () {}, { apply: hook }) },
    new Proxy(f.options, { getPrototypeOf: hook, ownKeys: hook })])
    assert.throws(() => CREATE(bad), rejected('configuration_rejected'));
  assert.throws(() => CREATE(), rejected('configuration_rejected'));
  assert.throws(() => CREATE(f.options, null), rejected('configuration_rejected'));
  assert.equal(hooks, 0); assert.deepEqual(f.calls, { schema: 0, verify: 0, first: 0, observer: 0 });
  assert.equal(snap(f).capturedContexts, 0);
});

test('selected server bridge returns detached supported upfront price and enhancement DATA without operational role calls', OPTIONS, async () => {
  const f = fixture(), supported = await f.client.getSupported();
  assert.deepEqual(supported, { kinds: [{ x402Version: 2, scheme: 'exact', network: 'zenon:mock' }], extensions: [], signers: {} });
  assert.ok(Object.isFrozen(supported.kinds[0]));
  assert.deepEqual(await f.scheme.parsePrice({ amount: '1', asset: f.req.asset }, f.req.network),
    { amount: '1', asset: f.req.asset });
  const enhanced = await f.scheme.enhancePaymentRequirements(copy(f.req),
    { x402Version: 2, scheme: 'exact', network: f.req.network }, []);
  assert.deepEqual(enhanced, f.req); assert.notEqual(enhanced, f.req); assert.ok(Object.isFrozen(enhanced.extra.zenonChain));
  await assert.rejects(f.scheme.parsePrice({ amount: '2', asset: f.req.asset }, f.req.network), rejected('input_rejected'));
  await assert.rejects(f.scheme.parsePrice({ amount: '1', asset: f.req.asset }, 'zenon:foreign'), rejected('input_rejected'));
  await assert.rejects(f.scheme.enhancePaymentRequirements(copy(f.req),
    { x402Version: 2, scheme: 'exact', network: f.req.network }, ['unsupported']), rejected('input_rejected'));
  await assert.rejects(f.client.getSupported(null), rejected('input_rejected'));
  assert.deepEqual(f.calls, { schema: 0, verify: 0, first: 0, observer: 0 });
});

test('selected server bridge atomically registers only exact ordered unique server view identities after schema validation', OPTIONS, async () => {
  const f = fixture();
  f.challenge.accepts.push({ ...copy(f.req), amount: '2' });
  await assert.rejects(f.capture(), rejected('capture_rejected'));
  assert.equal(snap(f).capturedContexts, 0); assert.equal(f.calls.schema, 0);
  f.challenge.accepts[1] = copy(f.req);
  await f.capture();
  assert.equal(snap(f).capturedContexts, 2); assert.equal(snap(f).captureAttempts, 2); assert.equal(f.calls.schema, 1);
  await assert.rejects(f.capture(), rejected('capture_rejected')); assert.equal(snap(f).capturedContexts, 2);
  const g = fixture(); g.challenge.accepts.push(g.view);
  await assert.rejects(g.capture(), rejected('capture_rejected')); assert.equal(snap(g).capturedContexts, 0);
  const h = fixture(); h.challenge.accepts.push(copy(h.req));
  await assert.rejects(h.capture(h.challenge, [h.challenge.accepts[1], h.view]), rejected('capture_rejected'));
  assert.equal(snap(h).capturedContexts, 0);
  const i = fixture(); await assert.rejects(i.capture(i.challenge, [copy(i.view)]), rejected('capture_rejected'));
  assert.equal(snap(i).capturedContexts, 0);
});

test('selected server bridge preserves one original tuple through pending to one positive response without a second first settlement', OPTIONS, async () => {
  const f = fixture({ onFirst: (p, r) => rawSettlement(p, r, 'PENDING') });
  const original = [JSON.stringify(f.payload), JSON.stringify(f.view), JSON.stringify(f.challenge)];
  await verified(f); let modeledDeliveries = 0;
  async function modeledFinish() { const r = await f.settle(); if (r.success) modeledDeliveries++; return r; }
  const first = await modeledFinish(); assert.equal(first.success, false); assert.equal(first.errorReason, 'settlement_pending');
  assert.equal(modeledDeliveries, 0); assert.equal(owner(f).settlement.state, 'PENDING');
  const last = await modeledFinish(); assert.equal(last.success, true); assert.ok(Object.isFrozen(last));
  assert.equal(last.transaction, HASH); assert.equal(modeledDeliveries, 1);
  await assert.rejects(modeledFinish(), rejected('settle_rejected'));
  assert.equal(modeledDeliveries, 1); assert.deepEqual(f.calls, { schema: 1, verify: 1, first: 1, observer: 1 });
  assert.equal(snap(f).positiveSettlementResponses, 1);
  for (const entry of f.seen) assert.deepEqual(entry.texts, original);
  assert.notEqual(f.seen[0].args[0], f.payload); assert.notEqual(f.seen[1].args[0], f.seen[2].args[0]);
});

test('selected server bridge retains pending budgets and a null observer without second submission or modeled delivery', OPTIONS, async () => {
  for (const mode of [{ budget: 2 }, { budget: 0 }, { budget: 16, observer: false }]) {
    const f = fixture({ ...mode, onFirst: (p, r) => rawSettlement(p, r, 'PENDING'),
      onObserver: (p, r) => rawSettlement(p, r, 'PENDING') });
    await verified(f); assert.equal((await f.settle()).success, false);
    const n = mode.observer === false ? 0 : mode.budget;
    for (let i = 0; i < n; i++) assert.equal((await f.settle()).success, false);
    const before = owner(f); await assert.rejects(f.settle(), rejected('settle_rejected'));
    assert.deepEqual(owner(f), before); assert.equal(snap(f).positiveSettlementResponses, 0);
    assert.deepEqual(f.calls, { schema: 1, verify: 1, first: 1, observer: n });
  }
});

test('selected server bridge rejects changed payload hash signature nonce intent and resource before first or pending callback', OPTIONS, async () => {
  const f = fixture({ onFirst: (p, r) => rawSettlement(p, r, 'PENDING') });
  await verified(f);
  const variants = [];
  for (const field of ['hash', 'signature', 'nonce']) {
    const p = copy(f.payload); p.payload.transaction[field] = field === 'hash' ? 'c'.repeat(64) : 'changed'; variants.push(p);
  }
  const intent = copy(f.payload); intent.payload.intentDigest = 'c'.repeat(64); variants.push(intent);
  const resource = copy(f.payload); resource.resource.url = 'https://foreign.invalid/paid'; variants.push(resource);
  const absent = copy(f.payload); delete absent.payload.intentDigest; variants.push(absent);
  for (const p of variants) await assert.rejects(f.settle(p), rejected('settle_rejected'));
  assert.equal(f.calls.first, 0); assert.equal(owner(f).settlement.firstAuthorityConsumed, false);
  await f.settle(); const before = owner(f).settlement;
  for (const p of variants) await assert.rejects(f.settle(p), rejected('settle_rejected'));
  assert.deepEqual(owner(f).settlement, before); assert.equal(f.calls.observer, 0);
  assert.equal((await f.settle()).success, true);
});

test('selected server bridge denies equal looking client views missing capture and hostile context without hooks or verifier entry', OPTIONS, async () => {
  const f = fixture(); let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_VIEW'); };
  const hostile = new Proxy({}, { getPrototypeOf: hook, ownKeys: hook, get: hook });
  await assert.rejects(f.verify(hostile, f.view), rejected('verify_rejected'));
  await f.capture();
  await assert.rejects(f.verify(f.payload, copy(f.view)), rejected('verify_rejected'));
  await assert.rejects(f.verify(f.payload, hostile), rejected('verify_rejected'));
  await assert.rejects(f.verify(hostile), rejected('verify_rejected'));
  const p = copy(f.payload); Object.defineProperty(p.payload.transaction, 'hash', { enumerable: true, get: hook });
  await assert.rejects(f.verify(p), rejected('verify_rejected'));
  const extension = copy(f.payload); extension.extensions = { challenge: copy(f.challenge) };
  await assert.rejects(f.verify(extension), rejected('verify_rejected'));
  assert.equal(hooks, 0); assert.equal(f.calls.verify, 0);
  assert.equal((await f.verify()).isValid, true); assert.equal((await f.settle()).success, true);
});

test('selected server bridge requires verification before settlement and keeps arity refusals free of callback authority', OPTIONS, async () => {
  const f = fixture(); await f.capture();
  await assert.rejects(f.settle(), rejected('settle_rejected'));
  await assert.rejects(f.client.verify(), rejected('verify_rejected'));
  await assert.rejects(f.client.verify(f.payload, f.view, null), rejected('verify_rejected'));
  await assert.rejects(f.client.settle(), rejected('settle_rejected'));
  await assert.rejects(f.scheme.enrichPaymentRequiredResponse(), rejected('input_rejected'));
  assert.equal(f.calls.verify, 0); assert.equal(f.calls.first, 0);
  await f.verify();
  await assert.rejects(f.verify(), rejected('verify_rejected'));
  assert.equal(f.calls.verify, 1); assert.equal((await f.settle()).success, true);
  assert.throws(() => f.bridge.getSnapshot(null), rejected('input_rejected'));
});

test('selected server bridge rejects schema substitution source mutation asynchronous schema and capture reentry atomically', OPTIONS, async () => {
  const f = fixture({ onSchema(value, self) { self.challenge.resource.url = 'https://mutated.invalid/paid'; } });
  await assert.rejects(f.capture(), rejected('capture_rejected'));
  assert.equal(snap(f).capturedContexts, 0); assert.equal(f.calls.schema, 1);
  for (const result of [true, {}, NativePromise.resolve(undefined)]) {
    const g = fixture({ onSchema: () => result });
    await assert.rejects(g.capture(), rejected('capture_rejected')); assert.equal(snap(g).capturedContexts, 0);
  }
  let nested;
  const h = fixture({ onSchema(value, self) { nested = outcome(self.capture()); } });
  await h.capture(); assert.ok(rejected('busy')((await nested).error));
  assert.equal(snap(h).capturedContexts, 1); assert.equal(snap(h).captureAttempts, 1);
  assert.notEqual(h.schemaSeen[0], h.challenge); assert.ok(Object.isFrozen(h.schemaSeen[0].accepts[0]));
});

test('selected server bridge prevents one declared hash from rebinding to a second otherwise equal selected server context', OPTIONS, async () => {
  const f = fixture({ onFirst: (p, r) => rawSettlement(p, r, 'PENDING') });
  await f.capture(); const second = copy(f.challenge), view = second.accepts[0]; await f.capture(second);
  await f.verify();
  await assert.rejects(f.verify(copy(f.payload), view), rejected('verify_rejected'));
  assert.equal(f.calls.verify, 1); assert.equal(f.calls.first, 0);
  assert.equal((await f.settle()).success, false); assert.equal((await f.settle()).success, true);
  await assert.rejects(f.verify(copy(f.payload), view), rejected('verify_rejected'));
  assert.deepEqual(f.calls, { schema: 2, verify: 1, first: 1, observer: 1 });
  assert.equal(snap(f).positiveSettlementResponses, 1); assert.equal(owner(f, 1), null);
});

test('selected server bridge never releases a refused or uncertain verification hash claim for another context', OPTIONS, async () => {
  let reasonHooks = 0;
  const reason = new Proxy({}, { get() { reasonHooks++; throw Error('PRIVATE_REASON'); } });
  for (const mode of ['false', 'throw', 'reject']) {
    const f = fixture({ onVerify() {
      if (mode === 'false') return { isValid: false, invalidReason: 'declared_refusal', invalidMessage: 'PRIVATE_MESSAGE' };
      if (mode === 'throw') throw reason;
      return NativePromise.reject(reason);
    } });
    await f.capture(); const second = copy(f.challenge); await f.capture(second);
    if (mode === 'false') {
      const r = await f.verify(); assert.deepEqual(r, { isValid: false, invalidReason: 'declared_refusal', invalidMessage: 'declared_refusal' });
      assert.equal(snap(f).contexts[0].verificationPhase, 'REFUSED');
    } else {
      await assert.rejects(f.verify(), rejected('verify_rejected'));
      assert.equal(snap(f).contexts[0].verificationPhase, 'UNKNOWN');
    }
    await assert.rejects(f.settle(), rejected('settle_rejected'));
    await assert.rejects(f.verify(copy(f.payload), second.accepts[0]), rejected('verify_rejected'));
    assert.equal(f.calls.verify, 1); assert.equal(f.calls.first, 0); assert.equal(f.calls.observer, 0);
  }
  assert.equal(reasonHooks, 0);
});

test('selected server bridge observes native promises without own then hooks and snapshots hostile fulfillments before assimilation', OPTIONS, async () => {
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_THEN'); };
  const decorated = value => { const p = NativePromise.resolve(value); Object.defineProperty(p, 'then', { get: hook }); return Object.freeze(p); };
  const f = fixture({ onVerify: () => decorated({ isValid: true }),
    onFirst: (p, r) => decorated(rawSettlement(p, r, 'PENDING')),
    onObserver: (p, r) => decorated(rawSettlement(p, r, 'SUCCEEDED', 'ACKNOWLEDGED')) });
  await verified(f); await f.settle(); assert.equal((await f.settle()).success, true);
  for (const role of ['verify', 'first']) {
    const mode = {}, g = fixture(mode);
    const value = role === 'verify' ? { isValid: true } : rawSettlement(g.payload, g.req);
    const p = NativePromise.resolve(value); Object.defineProperty(value, 'then', { enumerable: true, get: hook });
    if (role === 'verify') mode.onVerify = () => p; else mode.onFirst = () => p;
    await g.capture();
    if (role === 'verify') await assert.rejects(g.verify(), rejected('verify_rejected'));
    else { await g.verify(); await assert.rejects(g.settle(), rejected('settle_rejected')); }
  }
  assert.equal(hooks, 0);
});

test('selected server bridge redacts unsafe promise and packet surfaces without invoking proxy getter or coercion hooks', OPTIONS, async () => {
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_UNSAFE'); };
  const accessor = NativePromise.resolve({ isValid: true }); Object.defineProperty(accessor, 'constructor', { get: hook });
  const foreign = NativePromise.resolve({ isValid: true }); Object.setPrototypeOf(foreign, {});
  class SubPromise extends NativePromise {}
  const thenable = Object.defineProperty({}, 'then', { enumerable: true, get: hook });
  for (const value of [accessor, foreign, SubPromise.resolve({ isValid: true }), thenable,
    new Proxy({ isValid: true }, { ownKeys: hook, getPrototypeOf: hook }),
    new Proxy(NativePromise.resolve({ isValid: true }), { get: hook })]) {
    const f = fixture({ onVerify: () => value }); await f.capture();
    await assert.rejects(f.verify(), rejected('verify_rejected')); assert.equal(f.calls.first, 0);
  }
  const g = fixture({ onFirst() { const v = { success: true }; Object.defineProperty(v, 'transaction', { enumerable: true, get: hook }); return v; } });
  await verified(g); await assert.rejects(g.settle(), rejected('settle_rejected'));
  assert.equal(owner(g).settlement.state, 'UNKNOWN'); assert.equal(hooks, 0);
});

test('selected server bridge rejects reentry before payload inspection while verifier or first settlement remains pending', OPTIONS, async () => {
  const verifyGate = cap(), firstGate = cap();
  const f = fixture({ onVerify: () => verifyGate.promise, onFirst: () => firstGate.promise });
  await f.capture(); const vp = f.verify(), vt = outcome(vp); await f.verifyReady.promise;
  let hooks = 0; const hostile = new Proxy({}, { getPrototypeOf() { hooks++; throw Error('PRIVATE_BUSY'); } });
  try {
    await assert.rejects(f.verify(hostile), rejected('verify_rejected'));
    await assert.rejects(f.settle(hostile), rejected('settle_rejected'));
    assert.equal(f.calls.verify, 1); assert.equal(f.calls.first, 0);
  } finally { verifyGate.resolve({ isValid: true }); await vt; }
  assert.equal((await vp).isValid, true);
  const sp = f.settle(), st = outcome(sp); await f.firstReady.promise;
  try {
    await assert.rejects(f.settle(hostile), rejected('settle_rejected'));
    await assert.rejects(f.verify(hostile), rejected('verify_rejected'));
    assert.equal(f.calls.first, 1); assert.equal(f.calls.observer, 0);
  } finally { firstGate.resolve(rawSettlement(f.payload, f.req)); await st; }
  assert.equal((await sp).success, true); assert.equal(hooks, 0);
});

test('selected server bridge rejects direct public verification and settlement receipt dependencies without retries', OPTIONS, async () => {
  let verification;
  const f = fixture({ onVerify: () => verification }); await f.capture();
  verification = f.verify(); await assert.rejects(verification, rejected('verify_rejected'));
  assert.equal(snap(f).contexts[0].verificationPhase, 'UNKNOWN'); assert.equal(f.calls.first, 0);
  let settlement;
  const g = fixture({ onFirst: () => settlement }); await verified(g);
  settlement = g.settle(); await assert.rejects(settlement, rejected('settle_rejected'));
  assert.equal(owner(g).settlement.state, 'UNKNOWN');
  await assert.rejects(g.settle(), rejected('settle_rejected')); assert.equal(g.calls.first, 1);
});

test('selected server bridge captures method options and original input before later caller mutations or callback clone changes', OPTIONS, async () => {
  const mode = { onFirst: (p, r) => rawSettlement(p, r, 'PENDING') }, f = fixture(mode);
  await f.capture(); const saved = copy(f.payload), originalTexts = [JSON.stringify(saved), JSON.stringify(f.view), JSON.stringify(f.challenge)];
  const pending = f.verify(); f.payload.payload.transaction.signature = 'caller changed after invocation';
  let replacements = 0;
  f.facilitator.verify = f.facilitator.settle = () => { replacements++; throw Error('PRIVATE_NEW_ROLE'); };
  f.options.reconcilePendingSettlement = () => { replacements++; throw Error('PRIVATE_OBSERVER'); };
  f.options.requirement = { ...copy(f.req), amount: '99' }; f.options.maxPendingReconciliations = 0; f.options.contextLimit = 1;
  assert.equal((await pending).isValid, true);
  assert.equal((await f.settle(saved)).success, false); assert.equal((await f.settle(saved)).success, true);
  assert.equal(replacements, 0);
  for (const entry of f.seen) assert.deepEqual(entry.texts, originalTexts);
  assert.equal(snap(f).contextLimit, 4);
});

test('selected server bridge refuses preflight native promise and JSON prototype mutations without caller hooks', OPTIONS, async () => {
  for (const mode of ['constructor', 'species', 'inherited-then', 'object-json', 'array-json']) {
    const f = fixture(); await f.capture();
    const target = mode === 'constructor' ? NativePromise.prototype : mode === 'species' ? NativePromise
      : mode === 'array-json' ? Array.prototype : Object.prototype;
    const key = mode === 'constructor' ? 'constructor' : mode === 'species' ? Symbol.species
      : mode === 'inherited-then' ? 'then' : 'toJSON';
    const before = Object.getOwnPropertyDescriptor(target, key); let hooks = 0, pending;
    try {
      Object.defineProperty(target, key, { configurable: true, get() { hooks++; throw Error('PRIVATE_NATIVE'); } });
      pending = f.verify();
    } finally { if (before) Object.defineProperty(target, key, before); else delete target[key]; }
    assert.equal(Object.getOwnPropertyDescriptor(pending, 'constructor').value, NativePromise);
    await assert.rejects(pending, rejected('verify_rejected')); assert.equal(hooks, 0); assert.equal(f.calls.verify, 0);
    assert.equal((await f.verify()).isValid, true);
  }
});

test('selected server bridge retains foreign outcome refusal and unknown versus acknowledged terminal boundaries', OPTIONS, async () => {
  for (const field of ['transaction', 'network']) {
    const f = fixture({ onFirst(p, r) { return { ...rawSettlement(p, r), [field]: field === 'transaction' ? 'c'.repeat(64) : 'zenon:foreign' }; } });
    await verified(f); await assert.rejects(f.settle(), rejected('settle_rejected'));
    assert.equal(owner(f).settlement.state, 'UNKNOWN'); await assert.rejects(f.settle(), rejected('settle_rejected'));
    assert.equal(f.calls.first, 1); assert.equal(snap(f).positiveSettlementResponses, 0);
  }
  const g = fixture({ onFirst: (p, r) => rawSettlement(p, r, 'UNKNOWN', 'ACKNOWLEDGED') });
  await verified(g); assert.equal((await g.settle()).success, false);
  assert.equal(owner(g).settlement.state, 'UNKNOWN');
  assert.equal(owner(g).settlement.publication.acknowledgementDeclared, true);
  assert.equal(owner(g).settlement.publication.uncertaintyRetained, true);
  await assert.rejects(g.settle(), rejected('settle_rejected')); assert.equal(g.calls.observer, 0);
});

test('selected server bridge bounds capture attempts contexts and descriptor DATA without coercion or callback expansion', OPTIONS, async () => {
  const f = fixture({ contextLimit: 1 }); await f.capture();
  await assert.rejects(f.capture(copy(f.challenge)), rejected('budget_exhausted'));
  assert.equal(snap(f).capturedContexts, 1); assert.equal(snap(f).captureAttempts, 1);
  const g = fixture({ contextLimit: 1 }); g.challenge.accepts.push(copy(g.req));
  await assert.rejects(g.capture(), rejected('capture_rejected'));
  assert.equal(snap(g).capturedContexts, 0); await assert.rejects(g.capture(), rejected('budget_exhausted'));
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_DATA'); };
  for (const mutate of [
    p => { Object.defineProperty(p.payload.transaction, 'hash', { enumerable: true, get: hook }); },
    p => { p.payload.transaction.memo = '\u00e9'.repeat(65536); },
    p => { const cycle = {}; cycle.self = cycle; p.payload.transaction.memo = cycle; },
    p => { p.payload.transaction.toJSON = hook; },
  ]) {
    const h = fixture(); await h.capture(); const p = copy(h.payload); mutate(p);
    await assert.rejects(h.verify(p), rejected('verify_rejected')); assert.equal(h.calls.verify, 0);
  }
  assert.equal(hooks, 0);
});

test('selected server bridge source captures existing owners validators and normalizer without SDK native hosts signing or active cutover', OPTIONS, async () => {
  const f = fixture(); await verified(f); await f.settle();
  const diagnostic = JSON.stringify(snap(f));
  for (const value of [HASH, JSON.stringify(f.payload), JSON.stringify(f.req), f.challenge.resource.url,
    'declared-not-a-wallet-signature']) assert.equal(diagnostic.includes(value), false);
  assert.equal(snap(f).persistence, 'MEMORY_ONLY'); assert.equal(snap(f).recoveryAuthority, 'NONE');
  assert.equal(snap(f).qualification, 'SDK_FREE_CALLBACK_DATA_ONLY');
  assert.equal((source.match(/^export /gm) ?? []).length, 1);
  assert.match(source, /const OWNER = createVerificationBoundSelectedSettlementContext/);
  assert.match(source, /const NORMALIZE = normalizeSelectedSettlementCallbackResult/);
  assert.equal((source.match(/const owner = OWNER\(/g) ?? []).length, 1);
  assert.match(source, /hashClaims/); assert.match(source, /contextLimit/); assert.match(source, /entries\.length \+ views\.length > limit/);
  assert.doesNotMatch(source, /@x402|znn-typescript-sdk|node:(?:fs|https?|tls|dns|crypto|child_process|worker_threads)|fetch\s*\(|setTimeout|new Promise/);
  assert.doesNotMatch(source, /mapDelete|hashClaims\.delete|prepareBlock|publishRawTransaction|generateKeyPair|searchZenon/);
  assert.match(source, /UNKNOWN\/ACKNOWLEDGED/); assert.match(source, /indirect cycles/);
  for (const key of ['reset', 'restore', 'resume', 'close', 'resend']) assert.equal(Object.hasOwn(f.bridge, key), false);
});
