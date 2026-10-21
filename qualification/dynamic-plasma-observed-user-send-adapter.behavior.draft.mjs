import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Owned synthetic DATA/exchanges only. Register54 retained raw/collection/
// frontier cases and14 new adapter-plan cases, not the previous66-case entry.
// No SDK, native owner, key/nonce producer, signer or real account/RPC runs.
assert.equal(process.argv.length, 2);
const pins = [
  ['../src/zenon/dynamic-plasma-observed-user-send-adapter.js', 8149,
    '8526519aa6bf5006c572447127680d3cc871ee4eee1b9046b4ea09f9ad9e1653'],
  ['../src/zenon/dynamic-plasma-observed-user-send-subject.js', 5105,
    'bbcc1d718bcb1353f46e0650723e35c218db94754328103d4bce1d5765e13cd8'],
];
const sources = new Map();
for (const [path, bytes, sha256] of pins) {
  const raw = readFileSync(new URL(path, import.meta.url));
  assert.equal(raw.length, bytes); assert.equal(createHash('sha256').update(raw).digest('hex'), sha256);
  assert.equal(/[^\x00-\x7f]/.test(raw.toString('utf8')) || raw.includes(0), false);
  sources.set(path, raw.toString('ascii'));
}
const source = sources.get(pins[0][0]);
const { ObservedDynamicPlasmaUserSendAdapter: Adapter }
  = await import('../src/zenon/dynamic-plasma-observed-user-send-adapter.js');
const { createZenonObservedUserSendSubject: derive }
  = await import('../src/zenon/dynamic-plasma-observed-user-send-subject.js');
const { createZenonUserSendObservationInput: initialInput }
  = await import('../src/zenon/transaction-planner.js');
const { BoundedDynamicPlasmaStrategy: Bounded }
  = await import('../src/zenon/bounded-dynamic-plasma-strategy.js');
const { createZenonAccountFrontierReadTransport: createAccountWire }
  = await import('../src/zenon/dynamic-plasma-account-frontier-read-transport.js');
const { normalizeDynamicPlasmaObservation: normalize }
  = await import('../src/zenon/dynamic-plasma-observation-normalizer.js');
// Register32 raw +12 collection, then10 frontier cases in this order.
const { requestBoundCollectionFixture: collection }
  = await import('./dynamic-plasma-request-bound-collection.behavior.draft.mjs');
const { rawAdapterViewFixture: rawView, rawAdapterMaterialFixture: material }
  = await import('./dynamic-plasma-raw-adapter.behavior.draft.mjs');
const { frontierReadBlockFixture: block, frontierReadFrameFixture: frame }
  = await import('./dynamic-plasma-account-frontier-read.behavior.draft.mjs');

const clone = value => JSON.parse(JSON.stringify(value)); // Owned DATA only.
function view(options) {
  const value = rawView(options);
  return { observedUserSendViewVersion: 1, phase: 'UNSIGNED',
    paymentRequired: value.paymentRequired, accepted: value.accepted,
    payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds,
    accountFrontierResultJson: JSON.stringify(block(value)),
    observation: value.observation, policy: value.policy, runtimeContextDigest: value.runtimeContextDigest };
}
function subjectInput(value) {
  return { observedSubjectVersion: 1, phase: value.phase, paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds,
    accountFrontierResultJson: value.accountFrontierResultJson, observation: value.observation };
}
function context(value, subject) {
  return { phase: value.phase, subject, paymentRequired: value.paymentRequired, accepted: value.accepted,
    payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds, observation: value.observation,
    policy: value.policy, runtimeContextDigest: value.runtimeContextDigest };
}
function moved(value, count) {
  const next = clone(value), price = [1000, 1100, 1210, 1331][count];
  for (const e of next.observation.endpointObservations) {
    for (const f of [e.beforeFrontier, e.afterFrontier]) {
      f.height = 100 + count; f.hash = String(count + 3).repeat(64);
      f.nextFusionPrice = price; f.nextWorkPrice = price;
    }
    const q = e.rpcObservation;
    q.requiredFusedPlasma = Math.ceil(q.basePlasma * price / 1000);
    const fused = Math.min(q.availablePlasma, q.requiredFusedPlasma);
    const remaining = Math.max(0, q.basePlasma - Math.floor(fused * 1000 / price));
    q.requiredDifficulty = Math.ceil(remaining * price / 1000) * 1500;
  }
  return next;
}
function rejected(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_observed_dp_adapter_input_rejected');
  assert.equal(error.message, error.code); assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}
function frozen(value) {
  if (value !== null && typeof value === 'object') {
    assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) frozen(child);
  }
}
async function refuseStages(adapter, value, plan, accountBlock) {
  await assert.rejects(adapter.createWorkRequest(value, plan), rejected);
  await assert.rejects(adapter.assemble(value, plan, material()), rejected);
  await assert.rejects(adapter.validateUnsigned(value, plan, accountBlock), rejected);
}

test('observed adapter derives initial read input without manual frontier acknowledgement or price capabilities', { timeout: 5000 }, () => {
  const adapter = new Adapter(), value = view();
  value.accountFrontierResultJson = null; value.observation = null; value.policy = null; value.runtimeContextDigest = null;
  const result = adapter.createObservationInput(value);
  assert.deepEqual(result, initialInput({ observationIntentVersion: 1, phase: 'UNSIGNED',
    paymentRequired: value.paymentRequired, accepted: value.accepted, payerAddress: value.payerAddress,
    compiledSporkIds: value.compiledSporkIds }));
  assert.deepEqual(Object.keys(result), ['phase', 'expectedChainProfile', 'compiledSporkIds', 'quoteRequest',
    'requiredFusedObservationVersion', 'quoteRequestContextVersion']);
  assert.equal(result instanceof Promise, false); assert.equal(Object.isFrozen(value), false); frozen(result);
});

test('observed adapter initial plan retains the exact derived subject acknowledgement and existing quote', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), before = JSON.stringify(value);
  const plan = await adapter.quote(value), subject = derive(subjectInput(value));
  assert.deepEqual(Object.keys(plan), ['observedUserSendPlanVersion', 'subject', 'quote']);
  assert.equal(plan.observedUserSendPlanVersion, 1); assert.deepEqual(plan.subject, subject);
  assert.deepEqual(plan.quote, await new Bounded().quoteUserSend(context(value, subject)));
  assert.equal(plan.quote.authority, 'NONE'); assert.equal(plan.quote.afterSigningAction, 'NONE');
  assert.equal(plan.subject.height, 7); assert.equal(plan.subject.momentumAcknowledged.height, 100);
  assert.equal(JSON.stringify(value), before); assert.equal(Object.isFrozen(value), false); frozen(plan);
});

test('observed adapter composes both closed synthetic read paths through work assembly and same-block validation', { timeout: 5000 }, async () => {
  const value = rawView(), adapter = new Adapter(), f = collection(value), supplied = view();
  const request = adapter.createObservationInput(supplied), calls = [];
  const wire = createAccountWire({ exchange(body) {
    const rpc = JSON.parse(body); calls.push(rpc);
    assert.equal(rpc.method, 'ledger.getFrontierAccountBlock'); assert.deepEqual(rpc.params, [supplied.payerAddress]);
    return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: block(value) }));
  } });
  supplied.accountFrontierResultJson = await wire.callRead(Object.freeze({
    method: 'ledger.getFrontierAccountBlock', params: Object.freeze([supplied.payerAddress]),
  }));
  supplied.observation = (await f.collector.collect(request)).observation;
  const plan = await adapter.quote(supplied), work = await adapter.createWorkRequest(supplied, plan);
  const assembly = await adapter.assemble(supplied, plan, material());
  assert.deepEqual(await adapter.validateUnsigned(supplied, plan, assembly.accountBlock), assembly.validation);
  assert.equal(work.accountBlock.height, 7); assert.equal(work.accountBlock.previousHash, plan.subject.previousHash);
  assert.equal(assembly.accountBlock.signature, ''); assert.equal(assembly.authority, 'NONE');
  assert.deepEqual(f.positions, [6, 6]); assert.equal(calls.length, 1);
});

test('observed adapter keeps the original acknowledgement across two price advances and rejects the third without refresh', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), plan = await adapter.quote(value);
  const assembly = await adapter.assemble(value, plan, material()), retained = JSON.stringify([plan, assembly]);
  for (const count of [1, 2]) {
    const current = moved(value, count), independentlyNewSubject = derive(subjectInput(current));
    assert.equal(independentlyNewSubject.momentumAcknowledged.height, 100 + count);
    const work = await adapter.createWorkRequest(current, plan), same = await adapter.assemble(current, plan, material());
    assert.deepEqual(same.accountBlock, assembly.accountBlock);
    assert.deepEqual(work.accountBlock.momentumAcknowledged, plan.subject.momentumAcknowledged);
    assert.deepEqual(await adapter.validateUnsigned(current, plan, assembly.accountBlock), same.validation);
    const ackRefresh = clone(plan); ackRefresh.subject.momentumAcknowledged = independentlyNewSubject.momentumAcknowledged;
    await refuseStages(adapter, current, ackRefresh, assembly.accountBlock);
  }
  await refuseStages(adapter, moved(value, 3), plan, assembly.accountBlock);
  assert.equal(JSON.stringify([plan, assembly]), retained);
});

test('observed adapter refuses changed unavailable foreign malformed and empty account sequences at every later stage', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), plan = await adapter.quote(value), assembly = await adapter.assemble(value, plan, material());
  const b = JSON.parse(value.accountFrontierResultJson), texts = ['null', '{}', frame(),
    JSON.stringify({ ...b, height: 7 }), JSON.stringify({ ...b, hash: '77'.repeat(32) }),
    JSON.stringify({ ...b, chainIdentifier: 1 }), JSON.stringify({ ...b, address: value.accepted.payTo }),
    JSON.stringify({ ...b, height: 0, hash: '0'.repeat(64) }),
    value.accountFrontierResultJson.replace('"height":6,', '"height":6.0,'),
    value.accountFrontierResultJson.replace('"height":6,', '"height":6,"height":6,')];
  for (const accountFrontierResultJson of texts) {
    await refuseStages(adapter, { ...value, accountFrontierResultJson }, plan, assembly.accountBlock);
  }
  assert.equal(plan.subject.height, 7); assert.equal(assembly.accountBlock.signature, '');
});

test('observed adapter independently binds selected intent and request context instead of trusting the original plan label', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), plan = await adapter.quote(value), assembly = await adapter.assemble(value, plan, material());
  const foreign = view({ amount: '9' }), foreignPlan = await adapter.quote(foreign);
  await refuseStages(adapter, foreign, plan, assembly.accountBlock);
  await refuseStages(adapter, value, foreignPlan, assembly.accountBlock);
  await refuseStages(adapter, { ...value, observation: foreign.observation }, plan, assembly.accountBlock);
  const changed = clone(value); changed.paymentRequired.resource.url = 'https://other.invalid/paid';
  await refuseStages(adapter, changed, plan, assembly.accountBlock);
  const fake = clone(plan); fake.subject.amount = '999';
  await refuseStages(adapter, value, fake, assembly.accountBlock);
});

test('observed adapter preserves the original runtime price policy and selected pair rather than repricing a supplied plan', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), plan = await adapter.quote(value), assembly = await adapter.assemble(value, plan, material());
  for (const current of [{ ...value, runtimeContextDigest: 'sha256:' + 'c'.repeat(64) },
    { ...value, policy: { ...value.policy, maxMomentumAdvances: 1 } },
    { ...value, policy: { ...value.policy, maxFusedPlasma: 29999 } }]) {
    await refuseStages(adapter, current, plan, assembly.accountBlock);
  }
  for (const change of [p => { p.quote.subjectDigest = 'sha256:' + 'a'.repeat(64); },
    p => { p.quote.sourceQuote = null; }, p => { p.quote.authority = 'SIGN'; }]) {
    const supplied = clone(plan); change(supplied);
    await refuseStages(adapter, value, supplied, assembly.accountBlock);
  }
  assert.equal(assembly.accountBlock.fusedPlasma, 25410); assert.equal(assembly.accountBlock.difficulty, 0);
});

test('observed adapter refuses non-active legacy misbound and cached observations at initial quote and later consumption', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), plan = await adapter.quote(value), assembly = await adapter.assemble(value, plan, material());
  const unavailable = clone(value.observation), movedOne = clone(value.observation), legacy = clone(value.observation);
  unavailable.endpointObservations[0] = null; movedOne.endpointObservations[0].afterFrontier.hash = '88'.repeat(32);
  delete legacy.quoteRequestContextVersion; delete legacy.quoteRequestContext;
  for (const observation of [null, unavailable, movedOne, legacy, normalize(value.observation)]) {
    const supplied = { ...value, observation };
    await assert.rejects(adapter.quote(supplied), rejected); await refuseStages(adapter, supplied, plan, assembly.accountBlock);
  }
  await assert.rejects(adapter.quote({ ...value, accountFrontierResultJson: 'null' }), rejected);
});

test('observed adapter validates the same unsigned block and refuses signed modified key hash nonce and selection fields', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), plan = await adapter.quote(value), assembly = await adapter.assemble(value, plan, material());
  const retained = JSON.stringify([plan, assembly.accountBlock]);
  for (const mutate of [b => { b.signature = 'signed'; }, b => { b.hash = '99'.repeat(32); },
    b => { b.nonce = '0202030405060708'; }, b => { b.publicKey = Buffer.alloc(32, 8).toString('base64'); },
    b => { b.fusedPlasma += 1; }, b => { b.difficulty = 1; }, b => { b.amount = '999'; },
    b => { b.momentumAcknowledged.height += 1; }]) {
    const supplied = clone(assembly.accountBlock); mutate(supplied);
    await assert.rejects(adapter.validateUnsigned(value, plan, supplied), rejected);
  }
  await assert.rejects(adapter.validateUnsigned(value, plan, assembly), rejected);
  assert.equal(JSON.stringify([plan, assembly.accountBlock]), retained);
});

test('observed adapter requires exact versions unsigned phase arity and descriptor-only view and plan grammars', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), plan = await adapter.quote(value), assembly = await adapter.assemble(value, plan, material());
  assert.throws(() => new Adapter(null), rejected);
  for (const supplied of [{ ...value, observedUserSendViewVersion: 2 }, { ...value, phase: 'SIGNED' },
    { ...value, phase: 'VALIDATED' }, { ...value, phase: 'UNKNOWN' }, { ...value, momentumAcknowledged: null },
    { ...value, subject: plan.subject }, { ...value, quote: plan.quote }, { ...value, wallet: null }]) {
    assert.throws(() => adapter.createObservationInput(supplied), rejected);
    await assert.rejects(adapter.quote(supplied), rejected); await refuseStages(adapter, supplied, plan, assembly.accountBlock);
  }
  for (const supplied of [{ ...plan, observedUserSendPlanVersion: 2 }, { ...plan, authority: 'NONE' },
    { ...plan, originalPayment: null }, { subject: plan.subject, quote: plan.quote }]) {
    await refuseStages(adapter, value, supplied, assembly.accountBlock);
  }
  assert.throws(() => adapter.createObservationInput(), rejected);
  assert.throws(() => adapter.createObservationInput(value, null), rejected);
  await assert.rejects(adapter.quote(), rejected); await assert.rejects(adapter.quote(value, null), rejected);
  await assert.rejects(adapter.createWorkRequest(value), rejected);
  await assert.rejects(adapter.createWorkRequest(value, plan, null), rejected);
  await assert.rejects(adapter.assemble(value, plan), rejected);
  await assert.rejects(adapter.assemble(value, plan, material(), null), rejected);
  await assert.rejects(adapter.validateUnsigned(value, plan), rejected);
  await assert.rejects(adapter.validateUnsigned(value, plan, assembly.accountBlock, null), rejected);
});

test('observed adapter refuses hostile view plan subject quote and observation descriptors without invoking hooks', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), plan = await adapter.quote(value), assembly = await adapter.assemble(value, plan, material());
  let hooks = 0; const hook = () => { hooks += 1; throw Error('PRIVATE_HOOK'); };
  const top = view(); Object.defineProperty(top, 'observation', { get: hook, enumerable: true });
  const nested = view(); Object.defineProperty(nested.observation, 'endpointObservations', { get: hook, enumerable: true });
  const proxy = new Proxy(view(), { get: hook, getPrototypeOf: hook, ownKeys: hook });
  const p1 = clone(plan); Object.defineProperty(p1, 'subject', { get: hook, enumerable: true });
  const p2 = clone(plan); Object.defineProperty(p2.subject, 'amount', { get: hook, enumerable: true });
  const p3 = clone(plan); Object.defineProperty(p3.quote, 'sourceQuote', { get: hook, enumerable: true });
  const p4 = new Proxy(plan, { get: hook, getPrototypeOf: hook, ownKeys: hook });
  for (const supplied of [top, nested, proxy]) {
    await assert.rejects(adapter.quote(supplied), rejected); await refuseStages(adapter, supplied, plan, assembly.accountBlock);
  }
  for (const supplied of [p1, p2, p3, p4]) await refuseStages(adapter, value, supplied, assembly.accountBlock);
  assert.equal(hooks, 0);
});

test('observed adapter snapshots every consumed input before awaiting and never mutates caller DATA', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), expected = await adapter.quote(value), supplied = clone(value);
  const pending = adapter.quote(supplied);
  supplied.phase = 'SIGNED'; supplied.accepted.amount = '999'; supplied.observation = null; supplied.accountFrontierResultJson = 'null';
  assert.deepEqual(await pending, expected); assert.equal(Object.isFrozen(supplied), false);
  const assembly = await adapter.assemble(value, expected, material());
  for (const name of ['createWorkRequest', 'assemble', 'validateUnsigned']) {
    const current = clone(value), original = clone(expected), bytes = material(), existing = clone(assembly.accountBlock);
    const promise = name === 'createWorkRequest' ? adapter[name](current, original)
      : adapter[name](current, original, name === 'assemble' ? bytes : existing);
    current.phase = 'SIGNED'; current.observation = null; current.accepted.amount = '999';
    original.subject.amount = '999'; original.quote.sourceQuote = null; bytes.publicKey = ''; existing.signature = 'signed';
    const result = await promise;
    if (name === 'createWorkRequest') assert.equal(result.accountBlock.amount, value.accepted.amount);
    else if (name === 'assemble') assert.deepEqual(result.accountBlock, assembly.accountBlock);
    else assert.deepEqual(result, assembly.validation);
    assert.equal(Object.isFrozen(current), false); assert.equal(Object.isFrozen(original), false);
  }
});

test('observed adapter plan remains reproducible DATA and account projection not authority or full block authentication', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), previous = JSON.parse(value.accountFrontierResultJson);
  previous.publicKey = 'unvalidated'; previous.signature = 'unvalidated'; previous.confirmationDetail = { untrusted: true };
  const supplied = { ...value, accountFrontierResultJson: JSON.stringify(previous) }, plan = await adapter.quote(supplied);
  assert.deepEqual(plan, await adapter.quote(value));
  const portable = clone(plan), one = await adapter.assemble(supplied, portable, material());
  assert.deepEqual(await adapter.assemble(supplied, portable, material()), one);
  assert.deepEqual(await adapter.validateUnsigned(supplied, portable, one.accountBlock), one.validation);
  assert.equal(one.preparation, 'NOT_PERFORMED'); assert.equal(one.keyPossession, 'NOT_ESTABLISHED');
  assert.equal(one.signatureValidation, 'NOT_PERFORMED'); assert.equal(one.chainAuthentication, 'NOT_ESTABLISHED');
  assert.equal(one.authority, 'NONE'); assert.equal(one.afterSigningAction, 'NONE');
  assert.equal(Object.hasOwn(plan, 'READY'), false); assert.equal(Object.hasOwn(plan, 'consumed'), false);
});

test('observed adapter captures existing implementations without native owners signing retry or virtual strategy dispatch', { timeout: 5000 }, async () => {
  const adapter = new Adapter(), value = view(), names = ['quoteUserSend', 'createUnsignedUserSendDraft', 'bindHashedUserSend'];
  const saved = names.map(name => Object.getOwnPropertyDescriptor(Bounded.prototype, name)); let calls = 0;
  for (const [i, name] of names.entries()) Object.defineProperty(Bounded.prototype, name, { ...saved[i],
    value() { calls += 1; throw Error('VIRTUAL_OVERRIDE'); } });
  try {
    const plan = await adapter.quote(value), assembly = await adapter.assemble(value, plan, material());
    assert.equal((await adapter.createWorkRequest(value, plan)).accountBlock.height, 7);
    assert.deepEqual(await adapter.validateUnsigned(value, plan, assembly.accountBlock), assembly.validation);
    assert.equal(calls, 0);
  } finally { for (const [i, name] of names.entries()) Object.defineProperty(Bounded.prototype, name, saved[i]); }
  assert.equal((source.match(/^export /gm) ?? []).length, 1); assert.ok(Object.isFrozen(adapter));
  assert.deepEqual(Object.getOwnPropertyNames(Adapter.prototype), ['constructor', 'createObservationInput',
    'quote', 'createWorkRequest', 'assemble', 'validateUnsigned']);
  assert.match(source, /const SUBJECT = createZenonObservedUserSendSubject/);
  assert.match(source, /const BINDING = snapshotZenonUserSendPolicyBinding/);
  assert.match(source, /const FRONTIER = decodeZenonAccountFrontierReadResult/);
  assert.doesNotMatch(source, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|fetch\s*\(|new Promise|generateKeyPair|crypto\.sign|crypto\.verify|prepareBlock|publishRawTransaction|setTimeout|this\./);
});
