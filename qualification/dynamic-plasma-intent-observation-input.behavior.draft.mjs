import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Initial observation input does not require an invented account sequence/ack.
// The imported owned fixture retains44 selected cases, then12 are added here.
// Synthetic transport response text only: no real endpoint/SDK/work/signing.
assert.equal(process.argv.length, 2);
const raw = readFileSync(new URL('../src/zenon/transaction-planner.js', import.meta.url));
assert.equal(raw.length, 22611);
assert.equal(createHash('sha256').update(raw).digest('hex'),
  '079fe8da938e08e33a20ca1076492a829afa6fce3ae7f9b9f68d3bf4bff94233');
assert.equal(/[^\x00-\x7f]/.test(raw.toString('utf8')) || raw.includes(0), false);
const source = raw.toString('ascii');
const {
  createZenonUserSendObservationInput: createInput,
  createZenonUserSendSubject: subject,
  ZenonTransactionPlanner: Planner,
} = await import('../src/zenon/transaction-planner.js');
const { DeclaredDynamicPlasmaUserSendAdapter: Adapter }
  = await import('../src/zenon/declared-dynamic-plasma-user-send-adapter.js');
const { snapshotDynamicPlasmaObservationCollectionInput: capture }
  = await import('../src/zenon/dynamic-plasma-observation-collector.js');
const { paymentIntentDigest } = await import('../src/canonical.js');
const { requestBoundCollectionFixture: fixture }
  = await import('./dynamic-plasma-request-bound-collection.behavior.draft.mjs');
const { rawAdapterViewFixture: view, rawAdapterMaterialFixture: material }
  = await import('./dynamic-plasma-raw-adapter.behavior.draft.mjs');

const clone = value => JSON.parse(JSON.stringify(value)); // Owned DATA only.
function intent(value = view()) {
  return { observationIntentVersion: 1, phase: 'UNSIGNED',
    paymentRequired: value.paymentRequired, accepted: value.accepted,
    payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds };
}
function rejected(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_user_send_binding_input_rejected');
  assert.equal(error.message, error.code); assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}
function frozen(value) {
  if (value !== null && typeof value === 'object') {
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) frozen(child);
  }
}
function coherentRequirement(change) {
  const value = intent(); change(value.accepted);
  value.paymentRequired.accepts[0] = clone(value.accepted); return value;
}

test('intent-only observation input derives the first schema3 request without any frontier or acknowledgement', { timeout: 5000 }, () => {
  const selected = intent(), result = createInput(selected);
  assert.deepEqual(Object.keys(selected), ['observationIntentVersion', 'phase', 'paymentRequired',
    'accepted', 'payerAddress', 'compiledSporkIds']);
  assert.deepEqual(Object.keys(result), ['phase', 'expectedChainProfile', 'compiledSporkIds',
    'quoteRequest', 'requiredFusedObservationVersion', 'quoteRequestContextVersion']);
  assert.equal(result.phase, 'UNSIGNED'); assert.equal(result.requiredFusedObservationVersion, 1);
  assert.equal(result.quoteRequestContextVersion, 1);
  assert.deepEqual(result.expectedChainProfile, selected.accepted.extra.zenonChain);
  assert.deepEqual(result.compiledSporkIds, selected.compiledSporkIds);
  assert.deepEqual(result.quoteRequest, { address: selected.payerAddress, blockType: 2,
    toAddress: selected.accepted.payTo,
    data: Buffer.from(paymentIntentDigest(selected.paymentRequired, selected.accepted), 'hex').toString('base64') });
  for (const key of ['accountFrontier', 'momentumAcknowledged', 'subject', 'quote', 'authority']) {
    assert.equal(Object.hasOwn(result, key), false);
  }
  frozen(result);
});

test('intent-only input equals the existing complete-view request while sequence and acknowledgement stay independent', { timeout: 5000 }, () => {
  for (const value of [view(), view({ amount: '9' }), view({ available: 0, maxDifficulty: 100000000 })]) {
    const first = createInput(intent(value));
    assert.deepEqual(first, new Adapter().createObservationInput(value).collectionInput);
    value.accountFrontier.height = 8; value.accountFrontier.hash = '77'.repeat(32);
    value.momentumAcknowledged = { height: 101, hash: '44'.repeat(32) };
    assert.deepEqual(first, new Adapter().createObservationInput(value).collectionInput);
  }
});

test('first intent-only input collects observations before sequence admission then feeds the unchanged unsigned pipeline', { timeout: 5000 }, async () => {
  const value = view(), f = fixture(value), selected = intent(value);
  value.accountFrontier = null; value.momentumAcknowledged = null;
  value.observation = null; value.policy = null; value.runtimeContextDigest = null;
  const request = createInput(selected), result = await f.collector.collect(request);
  assert.equal(result.normalization.classification, 'DP_ACTIVE');
  assert.deepEqual(f.positions, [6, 6]);
  value.observation = result.observation;
  await assert.rejects(new Adapter().quote(value)); // Reading is not sequence admission.
  const declared = view(), adapter = new Adapter(); declared.observation = result.observation;
  const quote = await adapter.quote(declared), work = await adapter.createWorkRequest(declared, quote);
  const assembly = await adapter.assemble(declared, quote, material());
  assert.equal(work.accountBlock.height, declared.accountFrontier.height + 1);
  assert.deepEqual(assembly.accountBlock.momentumAcknowledged, declared.momentumAcknowledged);
  assert.deepEqual(await adapter.validateUnsigned(declared, quote, assembly.accountBlock), assembly.validation);
  assert.equal(assembly.accountBlock.signature, ''); assert.equal(assembly.authority, 'NONE');
});

test('intent-only request and expected digest follow selected intent profile payer and compiled IDs', { timeout: 5000 }, () => {
  const original = intent(), baseline = capture(createInput(original));
  const amount = intent(view({ amount: '9' }));
  const resource = intent(); resource.paymentRequired.resource.url = 'https://resource.invalid/another';
  const profile = coherentRequirement(a => { a.extra.zenonChain.genesisMomentumHash = '88'.repeat(32); });
  const compiled = intent(); compiled.compiledSporkIds.dynamicPlasmaId = '77'.repeat(32);
  const payer = intent(); payer.payerAddress = payer.accepted.payTo;
  for (const changed of [amount, resource, profile, compiled, payer]) {
    const next = capture(createInput(changed));
    assert.notEqual(next.expectedRequestContextDigest, baseline.expectedRequestContextDigest);
  }
  assert.equal(createInput(compiled).quoteRequest.data, createInput(original).quoteRequest.data);
  assert.notEqual(createInput(amount).quoteRequest.data, createInput(original).quoteRequest.data);
});

test('intent-only input refuses mismatched offers unsupported networks multi-offer and non-HTTPS challenges', { timeout: 5000 }, () => {
  const mismatch = intent(); mismatch.accepted.amount = '6';
  const multi = intent(); multi.paymentRequired.accepts.push(clone(multi.accepted));
  const http = intent(); http.paymentRequired.resource.url = 'http://resource.invalid/paid';
  const wrongNetwork = coherentRequirement(a => { a.network = 'zenon:mainnet'; });
  const wrongFlow = coherentRequirement(a => { a.extra.paymentFlow = 'deferred'; });
  for (const value of [mismatch, multi, http, wrongNetwork, wrongFlow]) assert.throws(() => createInput(value), rejected);
});

test('intent-only input has exact version phase arity and never accepts block quote or operational fields', { timeout: 5000 }, () => {
  const original = intent();
  for (const value of [{ ...original, observationIntentVersion: 2 }, { ...original, phase: 'SIGNED' },
    { ...original, phase: 'VALIDATED' }]) assert.throws(() => createInput(value), rejected);
  for (const key of ['subject', 'accountFrontier', 'momentumAcknowledged', 'observation', 'quoteRequest',
    'quote', 'policy', 'runtimeContextDigest', 'transport', 'wallet', 'signer', 'payment']) {
    assert.throws(() => createInput({ ...original, [key]: null }), rejected);
  }
  assert.throws(() => createInput(), rejected);
  assert.throws(() => createInput(original, null), rejected);
});

test('intent-only input rejects getters proxies iterators and coercion without invoking caller hooks', { timeout: 5000 }, () => {
  let hooks = 0; const hook = () => { hooks += 1; throw Error('HOOK'); };
  const top = intent(); Object.defineProperty(top, 'accepted', { get: hook, enumerable: true });
  const accepted = intent(); Object.defineProperty(accepted.accepted, 'payTo', { get: hook, enumerable: true });
  const challenge = intent(); Object.defineProperty(challenge.paymentRequired, 'resource', { get: hook, enumerable: true });
  const ids = intent(); Object.defineProperty(ids.compiledSporkIds, 'dynamicPlasmaId', { get: hook, enumerable: true });
  const coercion = intent(); coercion.payerAddress = { toString: hook, [Symbol.toPrimitive]: hook };
  const json = intent(); json.paymentRequired.toJSON = hook;
  const iterator = intent(); iterator.paymentRequired.accepts[Symbol.iterator] = hook;
  const proxy = new Proxy(intent(), { ownKeys: hook, getPrototypeOf: hook, get: hook });
  for (const value of [top, accepted, challenge, ids, coercion, json, iterator, proxy]) {
    assert.throws(() => createInput(value), rejected);
  }
  assert.equal(hooks, 0);
});

test('intent-only input keeps bounded JSON canonical amount payer and compiled-identity refusals', { timeout: 5000 }, () => {
  const long = intent(); long.paymentRequired.resource.description = 'x'.repeat(8193);
  const wide = intent(); wide.paymentRequired.resource.tags = Array(17).fill('x');
  const cyclic = intent(); cyclic.paymentRequired.resource.self = cyclic.paymentRequired;
  const unsafe = intent(); unsafe.paymentRequired.accepts[0].maxTimeoutSeconds = 9007199254740992;
  const amount = coherentRequirement(a => { a.amount = '05'; });
  const alias = intent(); alias.compiledSporkIds.dynamicPlasmaId = alias.compiledSporkIds.libp2pId;
  const hash = intent(); hash.compiledSporkIds.dynamicPlasmaId += '\n';
  const badPayer = intent(); badPayer.payerAddress = 'not-an-address';
  for (const value of [long, wide, cyclic, unsafe, amount, alias, hash, badPayer]) {
    assert.throws(() => createInput(value), rejected);
  }
});

test('intent-only output is detached frozen synchronous DATA without mutating or freezing the caller', { timeout: 5000 }, () => {
  const selected = intent(), result = createInput(selected), before = JSON.stringify(result);
  assert.equal(result instanceof Promise, false); assert.equal(Object.isFrozen(selected), false);
  assert.equal(Object.isFrozen(selected.accepted), false);
  selected.phase = 'SIGNED'; selected.accepted.amount = '999';
  selected.paymentRequired.resource.url = 'https://resource.invalid/changed';
  selected.compiledSporkIds.dynamicPlasmaId = '99'.repeat(32); selected.payerAddress = 'changed';
  assert.equal(JSON.stringify(result), before);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result); frozen(result);
  assert.notEqual(result.compiledSporkIds, selected.compiledSporkIds);
});

test('initial observation input cannot bypass the full subject original-quote or planner preparation gates', { timeout: 5000 }, async () => {
  const selected = createInput(intent()), adapter = new Adapter();
  assert.throws(() => subject(selected), rejected);
  await assert.rejects(adapter.quote(selected));
  await assert.rejects(new Planner().prepareUnsigned(selected), /must be implemented/);
  assert.equal(Object.hasOwn(selected, 'signature'), false);
  assert.equal(Object.hasOwn(selected, 'authority'), false);
});

test('intent-only producer reuses captured pure functions without virtually dispatching adapter stages', { timeout: 5000 }, () => {
  const original = Object.getOwnPropertyDescriptor(Adapter.prototype, 'createObservationInput');
  let calls = 0;
  Object.defineProperty(Adapter.prototype, 'createObservationInput', { ...original,
    value() { calls += 1; throw Error('OVERRIDE'); } });
  try {
    const result = createInput(intent());
    assert.equal(result.quoteRequest.blockType, 2); assert.equal(calls, 0);
  } finally { Object.defineProperty(Adapter.prototype, 'createObservationInput', original); }
});

test('intent-only producer has an exact inverse refactor and no fabricated sequence native owner or signing path', { timeout: 5000 }, () => {
  const marker = source.indexOf('\nconst OBSERVATION_INTENT_FIELDS');
  const oldSelected = [
    '    const challenge = snapshotJson(top.paymentRequired, 0, { nodes: 512, characters: 32768 });',
    '    VALIDATE_CHALLENGE(challenge);',
    "    if (challenge.accepts.length !== 1 || new URL(challenge.resource.url).protocol !== 'https:') rejectBinding();",
    '    const accepted = SNAPSHOT_REQUIREMENT(top.accepted);',
    '    if (accepted.network !== EXPERIMENTAL_LIVE_NETWORK',
    '        || !SAME_REQUIREMENT(accepted, challenge.accepts[0])) rejectBinding();',
  ].join('\n');
  const oldCompiled = [
    '    const compiled = bindingRecord(top.compiledSporkIds, COMPILED_FIELDS);',
    '    requireHash(compiled.dynamicPlasmaId); requireHash(compiled.libp2pId);',
    '    if (compiled.dynamicPlasmaId === compiled.libp2pId) rejectBinding();',
    '    const compiledSporkIds = freeze({',
    '      dynamicPlasmaId: compiled.dynamicPlasmaId, libp2pId: compiled.libp2pId,',
    '    });',
  ].join('\n');
  const inverse = source.slice(0, marker)
    .replaceAll('    const { challenge, accepted } = snapshotSelectedUpfrontIntent(top.paymentRequired, top.accepted);', oldSelected)
    .replace('    const compiledSporkIds = snapshotCompiledSporks(top.compiledSporkIds);', oldCompiled);
  assert.equal(Buffer.byteLength(inverse), 20374);
  assert.equal(createHash('sha256').update(inverse).digest('hex'),
    '4ef2c72a44d5f0f5ce918172a6ff30b13b693fa173bc74cb56565f5402417c2c');
  const added = source.slice(marker);
  assert.doesNotMatch(added, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|fetch\s*\(|new Promise|await |async |\.collect\s*\(|prepareUnsigned\s*\(|publishRawTransaction|generateKeyPair|crypto\.sign|crypto\.verify|accountFrontier:\s*\{|momentumAcknowledged:\s*\{/);
  assert.match(added, /const request = SNAPSHOT_REQUEST\(/);
  assert.equal((source.match(/^import /gm) ?? []).length, 6);
});
