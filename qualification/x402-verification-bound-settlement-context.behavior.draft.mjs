import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// New verification-to-settlement composition,10 retained owner assertions +20
// new assertions. No official/Zenon SDK or interop bridge is read/imported.
// All inputs, verifier Booleans, packets and callbacks are synthetic declared
// DATA. No network, keys/signing, SQL, payment or actual verification is run.
assert.equal(process.argv.length, 2);
assert.equal(process.versions.node, '24.19.0');
const pins = [
  ['../src/x402-verification-bound-settlement-context.js', 11311, 'b3ad2fd33dae7e77a77f069cbc1259bf77e18a2bf383aa30f41bcc19221656f5'],
  ['../test/x402-selected-settlement-context-owner.test.js', 27236, '861e41ce25894a24ffcaa14f76a219382feef37a75f66bf8c4302ad000d87264'],
];
let source;
for (const [path, bytes, hash] of pins) {
  const raw = readFileSync(new URL(path, import.meta.url));
  assert.equal(raw.length, bytes);
  assert.equal(createHash('sha256').update(raw).digest('hex'), hash);
  assert.equal(/[^\x00-\x7f]/.test(raw.toString('utf8')) || raw.includes(0), false);
  if (source === undefined) source = raw.toString('ascii');
}
await import('../test/x402-selected-settlement-context-owner.test.js');
const { createVerificationBoundSelectedSettlementContext: CREATE }
  = await import('../src/x402-verification-bound-settlement-context.js');
const NativePromise = Promise, nativeThen = Promise.prototype.then, apply = Reflect.apply;
const OPTIONS = { timeout: 5000, concurrency: false };
const ORIGINAL = Object.freeze({
  payloadJson: '{"opaque":"declared-payload"}\n', requirementsJson: '{"requirement":"declared"}',
  challengeJson: '{"challenge":"declared"}', paymentHash: 'a'.repeat(64), network: 'zenon:declared',
});
function cap() {
  let resolve, reject; const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function packet(binding, disposition = 'SUCCEEDED', publicationStatus = 'NOT_ESTABLISHED') {
  const reason = disposition === 'PENDING' ? 'settlement_pending'
    : disposition === 'UNKNOWN' ? 'settlement_outcome_unknown' : 'settlement_failed';
  const response = disposition === 'SUCCEEDED' ? {
    success: true, payer: 'declared-payer', transaction: binding.paymentHash, network: binding.network,
  } : {
    success: false, transaction: binding.paymentHash, network: binding.network,
    errorReason: reason, errorMessage: reason,
  };
  return { disposition, publicationStatus, responseJson: JSON.stringify(response) };
}
function outcome(pending) {
  return apply(nativeThen, pending, [value => ({ value }), error => ({ error })]);
}
function fixture(mode = {}, original = { ...ORIGINAL }) {
  const calls = { verify: 0, first: 0, observer: 0 }, seen = [], verifyReady = cap(), firstReady = cap();
  const f = { mode, original, calls, seen, verifyReady, firstReady };
  function entry(role, receiver, count, binding) {
    calls[role]++; seen.push({ role, binding });
    assert.equal(receiver, undefined); assert.equal(count, 1);
    assert.ok(Object.isFrozen(binding)); assert.deepEqual(binding, ORIGINAL);
  }
  f.options = {
    original, verifyOriginal: function verifyOriginal(binding) {
      entry('verify', this, arguments.length, binding); verifyReady.resolve(undefined);
      return mode.onVerify ? mode.onVerify(binding, f) : { isValid: true };
    },
    settleFirst: function settleFirst(binding) {
      entry('first', this, arguments.length, binding); firstReady.resolve(undefined);
      return mode.onFirst ? mode.onFirst(binding, f) : packet(binding);
    },
    reconcilePending: function reconcilePending(binding) {
      entry('observer', this, arguments.length, binding);
      return mode.onObserver ? mode.onObserver(binding, f) : packet(binding, 'SUCCEEDED', 'ACKNOWLEDGED');
    },
    maxPendingReconciliations: mode.budget ?? 2,
  };
  if (mode.observer === false) f.options.reconcilePending = null;
  f.owner = CREATE(f.options); return f;
}
function rejected(kind = 'operation_rejected') {
  return error => {
    assert.ok(error instanceof (kind === 'busy' ? Error : TypeError));
    assert.equal(error.code, 'verification_bound_settlement_' + kind);
    assert.equal(error.message, error.code);
    assert.equal(error.stack, (kind === 'busy' ? 'Error: ' : 'TypeError: ') + error.code);
    assert.ok(Object.isFrozen(error)); assert.equal(Object.hasOwn(error, 'cause'), false); return true;
  };
}
const snapshot = f => f.owner.getSnapshot();

test('verification bound settlement exposes three frozen methods with captured distinct roles and zero constructor handoffs', OPTIONS, () => {
  const f = fixture(); assert.deepEqual(Object.keys(f.owner), ['verifyOriginal', 'attempt', 'getSnapshot']);
  assert.ok(Object.isFrozen(f.owner)); for (const fn of Object.values(f.owner)) assert.ok(Object.isFrozen(fn));
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_CONFIG'); };
  const accessor = { ...f.options }; Object.defineProperty(accessor, 'verifyOriginal', { enumerable: true, get: hook });
  for (const bad of [null, {}, { ...f.options, extra: true }, accessor,
    { ...f.options, verifyOriginal: f.options.settleFirst }, { ...f.options, verifyOriginal: f.options.reconcilePending },
    { ...f.options, reconcilePending: f.options.settleFirst },
    { ...f.options, verifyOriginal: new Proxy(function () {}, { apply: hook }) },
    { ...f.options, maxPendingReconciliations: 17 },
    new Proxy(f.options, { ownKeys: hook, getPrototypeOf: hook })])
    assert.throws(() => CREATE(bad), rejected('configuration_rejected'));
  assert.throws(() => CREATE(), rejected('configuration_rejected'));
  assert.throws(() => CREATE(f.options, undefined), rejected('configuration_rejected'));
  assert.equal(hooks, 0); assert.deepEqual(f.calls, { verify: 0, first: 0, observer: 0 });
  assert.equal(snapshot(f).verification, 'NEW'); assert.equal(snapshot(f).settlement.firstAuthorityConsumed, false);
});

test('verification bound settlement refuses settlement before verification and preserves original first authority', OPTIONS, async () => {
  const f = fixture(); let hooks = 0;
  const hostile = new Proxy({}, { getPrototypeOf() { hooks++; throw Error('PRIVATE_STAGE'); } });
  await assert.rejects(f.owner.attempt(hostile), rejected('stage_rejected'));
  await assert.rejects(f.owner.attempt(), rejected('stage_rejected'));
  assert.equal(hooks, 0); assert.deepEqual(f.calls, { verify: 0, first: 0, observer: 0 });
  assert.equal(snapshot(f).settlement.firstAuthorityConsumed, false);
  assert.equal(await f.owner.verifyOriginal(f.original), true);
  assert.equal(JSON.parse(await f.owner.attempt(f.original)).success, true);
});

test('verification bound settlement snapshots the original before verification and returns only primitive verification and existing response strings', OPTIONS, async () => {
  const f = fixture(), saved = { ...f.original };
  const verification = f.owner.verifyOriginal(saved);
  assert.equal(Object.getOwnPropertyDescriptor(verification, 'constructor').value, NativePromise);
  assert.equal(f.calls.verify, 0); saved.payloadJson = 'changed after call';
  assert.equal(await verification, true);
  assert.equal(snapshot(f).verification, 'MATCHED_DECLARED_VALID');
  assert.equal(snapshot(f).verificationCalls, 1); assert.equal(snapshot(f).settlement.firstAttempts, 0);
  const result = await f.owner.attempt({ ...ORIGINAL });
  assert.equal(typeof result, 'string'); assert.equal(result, packet(ORIGINAL).responseJson);
  assert.equal(f.seen[0].binding.payloadJson, ORIGINAL.payloadJson);
  assert.deepEqual(f.calls, { verify: 1, first: 1, observer: 0 });
});

test('verification bound settlement keeps one original payment through pending to one success without another first call', OPTIONS, async () => {
  const f = fixture({ onFirst: b => packet(b, 'PENDING') });
  assert.equal(await f.owner.verifyOriginal(f.original), true);
  assert.equal(JSON.parse(await f.owner.attempt(f.original)).errorReason, 'settlement_pending');
  assert.equal(snapshot(f).settlement.state, 'PENDING');
  assert.equal(JSON.parse(await f.owner.attempt({ ...f.original })).success, true);
  assert.deepEqual(f.calls, { verify: 1, first: 1, observer: 1 });
  assert.deepEqual(f.seen.map(x => x.role), ['verify', 'first', 'observer']);
  assert.notEqual(f.seen[0].binding, f.seen[1].binding); assert.notEqual(f.seen[1].binding, f.seen[2].binding);
  for (const value of f.seen) assert.deepEqual(value.binding, ORIGINAL);
  await assert.rejects(f.owner.attempt(f.original), rejected());
  await assert.rejects(f.owner.verifyOriginal(f.original), rejected('stage_rejected'));
  assert.deepEqual(f.calls, { verify: 1, first: 1, observer: 1 });
});

test('verification bound settlement preserves pending budgets and absence of an observer without recreating the owner', OPTIONS, async () => {
  for (const mode of [{ budget: 2 }, { budget: 0 }, { budget: 16, observer: false }]) {
    const f = fixture({ ...mode, onFirst: b => packet(b, 'PENDING'), onObserver: b => packet(b, 'PENDING') });
    await f.owner.verifyOriginal(f.original);
    await f.owner.attempt(f.original);
    const count = mode.observer === false ? 0 : mode.budget;
    for (let i = 0; i < count; i++) await f.owner.attempt(f.original);
    const before = snapshot(f); await assert.rejects(f.owner.attempt(f.original), rejected());
    assert.equal(snapshot(f).settlement.state, 'PENDING'); assert.deepEqual(snapshot(f).settlement, before.settlement);
    assert.deepEqual(f.calls, { verify: 1, first: 1, observer: count });
  }
});

test('verification bound settlement refuses every changed or missing binding before verification first settlement and pending observation', OPTIONS, async () => {
  const f = fixture({ onFirst: b => packet(b, 'PENDING') }), variants = [null, {}, []];
  for (const field of Object.keys(ORIGINAL)) {
    variants.push({ ...ORIGINAL, [field]: ORIGINAL[field] + ' ' });
    const missing = { ...ORIGINAL }; delete missing[field]; variants.push(missing);
  }
  for (const input of variants) await assert.rejects(f.owner.verifyOriginal(input), rejected('input_rejected'));
  assert.deepEqual(f.calls, { verify: 0, first: 0, observer: 0 });
  await f.owner.verifyOriginal(f.original);
  for (const input of variants) await assert.rejects(f.owner.attempt(input), rejected('input_rejected'));
  assert.equal(snapshot(f).settlement.firstAuthorityConsumed, false);
  await f.owner.attempt(f.original);
  const before = snapshot(f).settlement;
  for (const input of variants) await assert.rejects(f.owner.attempt(input), rejected('input_rejected'));
  assert.deepEqual(snapshot(f).settlement, before); assert.deepEqual(f.calls, { verify: 1, first: 1, observer: 0 });
  assert.equal(JSON.parse(await f.owner.attempt(f.original)).success, true);
});

test('verification bound settlement permanently rejects a declared false verification without first or observer authority', OPTIONS, async () => {
  const f = fixture({ onVerify: () => ({ isValid: false }) });
  assert.equal(await f.owner.verifyOriginal(f.original), false);
  assert.equal(snapshot(f).verification, 'DECLARED_INVALID');
  await assert.rejects(f.owner.attempt(f.original), rejected('stage_rejected'));
  await assert.rejects(f.owner.verifyOriginal(f.original), rejected('stage_rejected'));
  assert.deepEqual(f.calls, { verify: 1, first: 0, observer: 0 });
  assert.equal(snapshot(f).settlement.firstAuthorityConsumed, false);
});

test('verification bound settlement holds throwing rejected or malformed verification without reading raw private reasons', OPTIONS, async () => {
  let hooks = 0; const raw = new Proxy({}, { get() { hooks++; throw Error('PRIVATE_REASON'); } });
  for (const kind of ['throw', 'reject', 'empty', 'extra', 'truthy', 'boolean']) {
    const f = fixture({ onVerify() {
      if (kind === 'throw') throw raw;
      if (kind === 'reject') return NativePromise.reject(raw);
      if (kind === 'empty') return {};
      if (kind === 'extra') return { isValid: true, payer: 'unadmitted' };
      if (kind === 'truthy') return { isValid: 1 };
      return true;
    } });
    await assert.rejects(f.owner.verifyOriginal(f.original), rejected());
    assert.equal(snapshot(f).verification, 'UNKNOWN');
    await assert.rejects(f.owner.attempt(f.original), rejected('stage_rejected'));
    await assert.rejects(f.owner.verifyOriginal(f.original), rejected('stage_rejected'));
    assert.deepEqual(f.calls, { verify: 1, first: 0, observer: 0 });
  }
  assert.equal(hooks, 0);
});

test('verification bound settlement stays busy before hostile input while the original verifier Promise is pending', OPTIONS, async () => {
  const gate = cap(), f = fixture({ onVerify: () => gate.promise });
  const pending = f.owner.verifyOriginal(f.original); await f.verifyReady.promise;
  let hooks = 0; const hostile = new Proxy({}, { getPrototypeOf() { hooks++; throw Error('PRIVATE_BUSY'); } });
  try {
    assert.equal(snapshot(f).verification, 'VERIFYING');
    await assert.rejects(f.owner.verifyOriginal(hostile), rejected('busy'));
    await assert.rejects(f.owner.attempt(hostile), rejected('busy'));
    assert.deepEqual(f.calls, { verify: 1, first: 0, observer: 0 }); assert.equal(hooks, 0);
  } finally { gate.resolve({ isValid: true }); }
  assert.equal(await pending, true); assert.equal(JSON.parse(await f.owner.attempt(f.original)).success, true);
});

test('verification bound settlement leaves wrong arity and hostile preflight input unconsumed without trap or coercion hooks', OPTIONS, async () => {
  const f = fixture(); let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_INPUT'); };
  const getter = { ...ORIGINAL }; Object.defineProperty(getter, 'payloadJson', { enumerable: true, get: hook });
  for (const value of [getter, new Proxy({ ...ORIGINAL }, { ownKeys: hook, getPrototypeOf: hook }),
    { ...ORIGINAL, network: { toString: hook, [Symbol.toPrimitive]: hook } }, { ...ORIGINAL, [Symbol('x')]: true }])
    await assert.rejects(f.owner.verifyOriginal(value), rejected('input_rejected'));
  await assert.rejects(f.owner.verifyOriginal(), rejected('input_rejected'));
  await assert.rejects(f.owner.verifyOriginal(ORIGINAL, null), rejected('input_rejected'));
  assert.equal(snapshot(f).verificationCalls, 0); assert.equal(hooks, 0);
  await f.owner.verifyOriginal(ORIGINAL);
  await assert.rejects(f.owner.attempt(), rejected('input_rejected'));
  await assert.rejects(f.owner.attempt(ORIGINAL, null), rejected('input_rejected'));
  assert.equal(snapshot(f).settlement.firstAttempts, 0);
  assert.throws(() => f.owner.getSnapshot(null), rejected('input_rejected'));
  assert.equal(JSON.parse(await f.owner.attempt(ORIGINAL)).success, true);
});

test('verification bound settlement observes native verification promises without an own then lookup and rejects unsupported mechanics', OPTIONS, async () => {
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_PROMISE'); };
  const safe = NativePromise.resolve({ isValid: true });
  Object.defineProperty(safe, 'then', { get: hook }); Object.freeze(safe);
  const f = fixture({ onVerify: () => safe });
  assert.equal(await f.owner.verifyOriginal(f.original), true);
  assert.equal(Object.hasOwn(safe, 'constructor'), false);
  const accessor = NativePromise.resolve({ isValid: true }); Object.defineProperty(accessor, 'constructor', { get: hook });
  const foreign = NativePromise.resolve({ isValid: true }); Object.setPrototypeOf(foreign, {});
  class SubPromise extends NativePromise {}
  const thenable = Object.defineProperty({}, 'then', { get: hook });
  for (const value of [accessor, foreign, SubPromise.resolve({ isValid: true }), thenable,
    new Proxy(NativePromise.resolve({ isValid: true }), { get: hook, getPrototypeOf: hook })]) {
    const g = fixture({ onVerify: () => value });
    await assert.rejects(g.owner.verifyOriginal(g.original), rejected()); assert.equal(snapshot(g).verification, 'UNKNOWN');
    assert.deepEqual(g.calls, { verify: 1, first: 0, observer: 0 });
  }
  assert.equal(hooks, 0);
});

test('verification bound settlement snapshots fulfilled verification before any hostile result then or field getter assimilation', OPTIONS, async () => {
  let hooks = 0;
  for (const field of ['then', 'isValid']) {
    const result = { isValid: true }, pending = NativePromise.resolve(result);
    Object.defineProperty(result, field, { enumerable: true, get() { hooks++; throw Error('PRIVATE_RESULT'); } });
    const f = fixture({ onVerify: () => pending });
    await assert.rejects(f.owner.verifyOriginal(f.original), rejected());
    assert.equal(snapshot(f).verification, 'UNKNOWN'); assert.equal(f.calls.first, 0);
  }
  assert.equal(hooks, 0);
});

test('verification bound settlement rejects reentrant calls and its own verification receipt without resetting the original', OPTIONS, async () => {
  let pending, nestedVerify, nestedAttempt, hooks = 0;
  const hostile = new Proxy({}, { getPrototypeOf() { hooks++; throw Error('PRIVATE_REENTRY'); } });
  const f = fixture({ onVerify(binding, self) {
    nestedVerify = outcome(self.owner.verifyOriginal(hostile));
    nestedAttempt = outcome(self.owner.attempt(hostile));
    return pending;
  } });
  pending = f.owner.verifyOriginal(f.original); await assert.rejects(pending, rejected());
  assert.ok(rejected('busy')((await nestedVerify).error)); assert.ok(rejected('busy')((await nestedAttempt).error));
  assert.equal(hooks, 0); assert.equal(snapshot(f).verification, 'UNKNOWN');
  assert.deepEqual(f.calls, { verify: 1, first: 0, observer: 0 });
});

test('verification bound settlement captures all role and original references before later option mutation', OPTIONS, async () => {
  const f = fixture({ onFirst: b => packet(b, 'PENDING') }); let replacements = 0;
  const saved = { ...f.original }, pending = f.owner.verifyOriginal(saved);
  for (const field of ['verifyOriginal', 'settleFirst', 'reconcilePending'])
    f.options[field] = () => { replacements++; throw Error('PRIVATE_REPLACEMENT'); };
  f.options.maxPendingReconciliations = 0; f.original.payloadJson = 'replacement';
  assert.equal(await pending, true);
  assert.equal(JSON.parse(await f.owner.attempt(saved)).success, false);
  assert.equal(JSON.parse(await f.owner.attempt(saved)).success, true);
  assert.equal(replacements, 0); assert.deepEqual(f.calls, { verify: 1, first: 1, observer: 1 });
  for (const value of f.seen) assert.deepEqual(value.binding, ORIGINAL);
});

test('verification bound settlement retains busy and one positive response limits while first settlement is pending', OPTIONS, async () => {
  const gate = cap(), f = fixture({ onFirst: () => gate.promise });
  await f.owner.verifyOriginal(f.original); const pending = f.owner.attempt(f.original); await f.firstReady.promise;
  try {
    assert.equal(snapshot(f).settlement.state, 'FIRST_IN_FLIGHT'); assert.equal(snapshot(f).inFlight, true);
    await assert.rejects(f.owner.attempt(f.original), rejected('busy'));
    await assert.rejects(f.owner.verifyOriginal(f.original), rejected('busy'));
  } finally { gate.resolve(packet(ORIGINAL, 'SUCCEEDED', 'ACKNOWLEDGED')); }
  assert.equal(JSON.parse(await pending).success, true);
  await assert.rejects(f.owner.attempt(f.original), rejected());
  assert.deepEqual(f.calls, { verify: 1, first: 1, observer: 0 });
});

test('verification bound settlement preserves unknown versus acknowledged declarations and terminal recovery boundaries', OPTIONS, async () => {
  const f = fixture({ onFirst: b => packet(b, 'PENDING', 'UNKNOWN') });
  await f.owner.verifyOriginal(f.original); await f.owner.attempt(f.original);
  assert.equal(snapshot(f).settlement.publication.uncertaintyRetained, true);
  await f.owner.attempt(f.original);
  const a = snapshot(f); assert.equal(a.settlement.state, 'SUCCEEDED');
  assert.equal(a.settlement.publication.status, 'ACKNOWLEDGED'); assert.equal(a.settlement.publication.uncertaintyRetained, true);
  const g = fixture({ onFirst: b => packet(b, 'UNKNOWN', 'UNKNOWN') });
  await g.owner.verifyOriginal(g.original); await g.owner.attempt(g.original);
  assert.equal(snapshot(g).settlement.state, 'UNKNOWN');
  await assert.rejects(g.owner.attempt(g.original), rejected());
  assert.deepEqual(g.calls, { verify: 1, first: 1, observer: 0 });
  assert.equal(snapshot(g).settlement.publication.acknowledgementDeclared, false);
});

test('verification bound settlement shields public receipts and rejects preflight native mutation before any borrowed callback', OPTIONS, async () => {
  for (const mode of ['constructor', 'species', 'inherited-then']) {
    const f = fixture(), target = mode === 'constructor' ? NativePromise.prototype : mode === 'species' ? NativePromise : Object.prototype;
    const key = mode === 'constructor' ? 'constructor' : mode === 'species' ? Symbol.species : 'then';
    const saved = Object.getOwnPropertyDescriptor(target, key); let hooks = 0, pending;
    try {
      Object.defineProperty(target, key, { configurable: true, get() { hooks++; throw Error('PRIVATE_NATIVE'); } });
      pending = f.owner.verifyOriginal(f.original);
    } finally { if (saved) Object.defineProperty(target, key, saved); else delete target[key]; }
    assert.equal(Object.getOwnPropertyDescriptor(pending, 'constructor').value, NativePromise);
    await assert.rejects(pending, rejected()); assert.equal(hooks, 0);
    assert.equal(snapshot(f).verificationCalls, 0); assert.deepEqual(f.calls, { verify: 0, first: 0, observer: 0 });
    assert.equal(await f.owner.verifyOriginal(f.original), true);
  }
});

test('verification bound settlement delegates finite original bounds and treats opaque declared strings as neither wire custody nor authentication', OPTIONS, async () => {
  const f = fixture();
  for (const changes of [{ payloadJson: 'x'.repeat(131073) }, { requirementsJson: '\u00e9'.repeat(65537) },
    { challengeJson: '' }, { paymentHash: 'A'.repeat(64) }, { network: 'x'.repeat(257) }])
    assert.throws(() => CREATE({ ...f.options, original: { ...ORIGINAL, ...changes } }), rejected('configuration_rejected'));
  const opaque = { ...ORIGINAL, payloadJson: 'opaque declared text, NOT parsed or authenticated wire' };
  const seen = [];
  const owner = CREATE({ original: opaque, verifyOriginal(b) { seen.push(b); return { isValid: true }; },
    settleFirst: b => packet(b), reconcilePending: null, maxPendingReconciliations: 0 });
  assert.equal(await owner.verifyOriginal({ ...opaque }), true); await owner.attempt({ ...opaque });
  assert.equal(seen[0].payloadJson, opaque.payloadJson);
  const s = owner.getSnapshot(); assert.equal(s.bindingScope, 'EXACT_DECLARED_SERIALIZED_CONTEXT_ONLY');
  assert.equal(s.verificationEvidence, 'DECLARED_CALLBACK_BOOLEAN_ONLY');
  assert.equal(s.persistence, 'MEMORY_ONLY'); assert.equal(s.recoveryAuthority, 'NONE');
  assert.equal(s.settlement.bindings.custody, 'NOT_ESTABLISHED');
  assert.equal(JSON.stringify(s).includes(opaque.payloadJson), false);
});

test('verification bound settlement independent instances preserve local scopes without granting global replay or restart authority', OPTIONS, async () => {
  const a = fixture(), b = fixture();
  for (const f of [a, b]) {
    assert.equal(await f.owner.verifyOriginal(f.original), true); await f.owner.attempt(f.original);
    await assert.rejects(f.owner.attempt(f.original), rejected());
    assert.deepEqual(f.calls, { verify: 1, first: 1, observer: 0 });
    for (const key of ['reset', 'restore', 'resume', 'close', 'resend']) assert.equal(Object.hasOwn(f.owner, key), false);
  }
  assert.equal(snapshot(a).settlement.totalAttempts, 1); assert.equal(snapshot(b).settlement.totalAttempts, 1);
});

test('verification bound settlement source captures one existing owner without SDK bridge signer work native owner or default cutover', OPTIONS, () => {
  assert.equal((source.match(/^export /gm) ?? []).length, 1);
  assert.match(source, /const CREATE_OWNER = createSelectedSettlementContextOwner/);
  assert.equal((source.match(/owner = CREATE_OWNER\(/g) ?? []).length, 1);
  assert.match(source, /await undefined/); assert.match(source, /value === originalVerification/);
  assert.match(source, /verification !== 'MATCHED_DECLARED_VALID'/);
  assert.match(source, /verification = 'UNKNOWN'/); assert.match(source, /captureVerification/);
  assert.doesNotMatch(source, /@x402|znn-typescript-sdk|node:(?:fs|https?|tls|dns|crypto|child_process|worker_threads)|fetch\s*\(|setTimeout|JSON\.(?:parse|stringify)/);
  assert.doesNotMatch(source, /generateKeyPair|crypto\.sign|prepareBlock|publishRawTransaction|searchZenon/);
  assert.match(source, /UNKNOWN\/ACKNOWLEDGED/); assert.match(source, /indirect/);
  assert.match(source, /MEMORY_ONLY/); assert.match(source, /DECLARED_CALLBACK_BOOLEAN_ONLY/);
});
