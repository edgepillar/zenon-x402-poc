import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Only owned declared DATA and synthetic exchange callbacks. Reuse44 existing
// raw/collection cases and10 frontier cases; add12 subject-composition cases.
// No real account/RPC owner, SDK, work producer, signer or payment is invoked.
assert.equal(process.argv.length, 2);
const raw = readFileSync(new URL('../src/zenon/dynamic-plasma-observed-user-send-subject.js', import.meta.url));
assert.equal(raw.length, 5105);
assert.equal(createHash('sha256').update(raw).digest('hex'),
  'bbcc1d718bcb1353f46e0650723e35c218db94754328103d4bce1d5765e13cd8');
assert.equal(/[^\x00-\x7f]/.test(raw.toString('utf8')) || raw.includes(0), false);
const source = raw.toString('ascii');
const { createZenonObservedUserSendSubject: derive }
  = await import('../src/zenon/dynamic-plasma-observed-user-send-subject.js');
const { createZenonUserSendObservationInput: initialInput, createZenonUserSendSubject: manualSubject }
  = await import('../src/zenon/transaction-planner.js');
const { normalizeDynamicPlasmaObservation: normalize }
  = await import('../src/zenon/dynamic-plasma-observation-normalizer.js');
const { BoundedDynamicPlasmaStrategy: Bounded }
  = await import('../src/zenon/bounded-dynamic-plasma-strategy.js');
const { createZenonUnsignedUserSendWorkRequest: workRequest }
  = await import('../src/zenon/dynamic-plasma-user-send-work-request.js');
const { assembleZenonUnsignedUserSend: assemble }
  = await import('../src/zenon/dynamic-plasma-user-send-assembly.js');
const { bindZenonUnsignedUserSendKeyBinding: validate }
  = await import('../src/zenon/dynamic-plasma-user-send-key-binding.js');
// Registration order is44 raw/collection cases, then10 frontier cases.
const { requestBoundCollectionFixture: fixture }
  = await import('./dynamic-plasma-request-bound-collection.behavior.draft.mjs');
const { rawAdapterViewFixture: view, rawAdapterMaterialFixture: material }
  = await import('./dynamic-plasma-raw-adapter.behavior.draft.mjs');
const { frontierReadBlockFixture: block, frontierReadFrameFixture: frame }
  = await import('./dynamic-plasma-account-frontier-read.behavior.draft.mjs');

const clone = value => JSON.parse(JSON.stringify(value)); // Owned DATA only.
function input(value = view()) {
  return { observedSubjectVersion: 1, phase: 'UNSIGNED', paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds,
    accountFrontierResultJson: JSON.stringify(block(value)), observation: value.observation };
}
function initial(value) {
  return initialInput({ observationIntentVersion: 1, phase: 'UNSIGNED',
    paymentRequired: value.paymentRequired, accepted: value.accepted,
    payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds });
}
function context(value, subject, observation = value.observation) {
  return { phase: 'UNSIGNED', subject, paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: value.payerAddress, compiledSporkIds: value.compiledSporkIds,
    observation, policy: value.policy, runtimeContextDigest: value.runtimeContextDigest };
}
function rejected(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_observed_user_send_subject_input_rejected');
  assert.equal(error.message, error.code); assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}
function frozen(value) {
  if (value !== null && typeof value === 'object') {
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) frozen(child);
  }
}

test('observed subject derives exact existing intent sequence and initial acknowledgement fields', { timeout: 5000 }, () => {
  const value = view(), result = derive(input(value));
  const expected = manualSubject({ subjectInputVersion: 1, phase: 'UNSIGNED',
    paymentRequired: value.paymentRequired, accepted: value.accepted, payerAddress: value.payerAddress,
    compiledSporkIds: value.compiledSporkIds, accountFrontier: value.accountFrontier,
    momentumAcknowledged: value.momentumAcknowledged });
  assert.deepEqual(result, expected); assert.equal(result instanceof Promise, false);
  assert.deepEqual(Object.keys(result), ['subjectVersion', 'version', 'chainIdentifier', 'blockType',
    'previousHash', 'height', 'momentumAcknowledged', 'address', 'toAddress', 'amount',
    'tokenStandard', 'fromBlockHash', 'data']);
  assert.equal(result.height, 7); assert.equal(result.previousHash, value.accountFrontier.hash);
  assert.equal(result.amount, value.accepted.amount); assert.equal(result.toAddress, value.accepted.payTo);
  frozen(result);
});

test('initial request raw account result and collected observations compose into existing unsigned stages without manual sequence or ack', { timeout: 5000 }, async () => {
  const value = view(), f = fixture(value), request = initial(value);
  const supplied = input(value);
  value.accountFrontier = null; value.momentumAcknowledged = null; value.observation = null;
  const collected = await f.collector.collect(request);
  supplied.observation = collected.observation;
  const subject = derive(supplied), ctx = context(value, subject, collected.observation), strategy = new Bounded();
  const quote = await strategy.quoteUserSend(ctx), work = await workRequest(ctx, quote);
  const assembled = await assemble(ctx, quote, material());
  assert.deepEqual(await validate(ctx, quote, assembled.accountBlock), assembled.validation);
  assert.equal(assembled.accountBlock.height, JSON.parse(supplied.accountFrontierResultJson).height + 1);
  assert.equal(work.accountBlock.previousHash, subject.previousHash);
  assert.deepEqual(subject.momentumAcknowledged, { hash: collected.normalization.observation.beforeFrontier.hash,
    height: collected.normalization.observation.beforeFrontier.height });
  assert.equal(assembled.accountBlock.signature, ''); assert.equal(assembled.authority, 'NONE');
  assert.deepEqual(f.positions, [6, 6]);
});

test('changed raw account sequence produces a different subject and cannot reuse the original quote', { timeout: 5000 }, async () => {
  const value = view(), originalInput = input(value), subject = derive(originalInput), ctx = context(value, subject);
  const strategy = new Bounded(), quote = await strategy.quoteUserSend(ctx), retained = JSON.stringify([subject, quote]);
  const rawBlock = JSON.parse(originalInput.accountFrontierResultJson); rawBlock.height = 8; rawBlock.hash = '77'.repeat(32);
  const changed = derive({ ...originalInput, accountFrontierResultJson: JSON.stringify(rawBlock) });
  assert.equal(changed.height, 9); assert.equal(changed.previousHash, rawBlock.hash);
  await assert.rejects(strategy.applyUserSend(context(value, changed), quote));
  assert.equal(JSON.stringify([subject, quote]), retained);
});

test('initial acknowledgement comes from the normalized quote-before frontier not prior block metadata or a manual ack', { timeout: 5000 }, () => {
  const value = view(); value.momentumAcknowledged = { hash: '99'.repeat(32), height: 999 };
  const supplied = input(value), previous = JSON.parse(supplied.accountFrontierResultJson);
  previous.momentumAcknowledged = { hash: '22'.repeat(32), height: 2 };
  supplied.accountFrontierResultJson = JSON.stringify(previous);
  const subject = derive(supplied), before = value.observation.endpointObservations[0].beforeFrontier;
  assert.deepEqual(subject.momentumAcknowledged, { hash: before.hash, height: before.height });
  assert.notDeepEqual(subject.momentumAcknowledged, previous.momentumAcknowledged);
  assert.notDeepEqual(subject.momentumAcknowledged, value.momentumAcknowledged);
});

test('later declared momentum can describe a new initial subject but grants no old quote or acknowledgement refresh', { timeout: 5000 }, async () => {
  const value = view(), supplied = input(value), subject = derive(supplied), strategy = new Bounded();
  const quote = await strategy.quoteUserSend(context(value, subject)), retained = JSON.stringify([subject, quote]);
  const moved = clone(value.observation);
  for (const endpoint of moved.endpointObservations) {
    for (const frontier of [endpoint.beforeFrontier, endpoint.afterFrontier]) {
      frontier.height = 101; frontier.hash = '44'.repeat(32);
    }
  }
  const next = derive({ ...supplied, observation: moved });
  assert.deepEqual(next.momentumAcknowledged, { hash: '44'.repeat(32), height: 101 });
  await assert.rejects(strategy.applyUserSend(context(value, next, moved), quote));
  assert.equal(JSON.stringify([subject, quote]), retained);
});

test('observed subject independently rejects foreign request context and raw payer or chain mismatch', { timeout: 5000 }, () => {
  const supplied = input(), foreign = view({ amount: '9' });
  assert.equal(normalize(foreign.observation).classification, 'DP_ACTIVE');
  assert.throws(() => derive({ ...supplied, observation: foreign.observation }), rejected);
  for (const change of [
    b => { b.address = supplied.accepted.payTo; },
    b => { b.chainIdentifier = 1; },
    b => { b.hash = '0'.repeat(64); },
  ]) {
    const b = JSON.parse(supplied.accountFrontierResultJson); change(b);
    assert.throws(() => derive({ ...supplied, accountFrontierResultJson: JSON.stringify(b) }), rejected);
  }
});

test('observed subject never turns unavailable zero reduced malformed or framed account results into an empty account', { timeout: 5000 }, () => {
  const supplied = input(), zero = JSON.parse(supplied.accountFrontierResultJson); zero.height = 0; zero.hash = '0'.repeat(64);
  for (const text of ['null', '{}', JSON.stringify(zero), frame(), 'not-json',
    supplied.accountFrontierResultJson.replace('"height":6,', '"height":6.0,'),
    supplied.accountFrontierResultJson.replace('"height":6,', '"height":6,"height":6,')]) {
    assert.throws(() => derive({ ...supplied, accountFrontierResultJson: text }), rejected);
  }
});

test('observed subject refuses unavailable pre-DP incoherent legacy and cached-normalization observations', { timeout: 5000 }, () => {
  const supplied = input(), missing = clone(supplied.observation), moved = clone(supplied.observation);
  missing.endpointObservations[0] = null;
  moved.endpointObservations[0].afterFrontier.hash = '88'.repeat(32);
  const legacy = clone(supplied.observation); delete legacy.quoteRequestContextVersion; delete legacy.quoteRequestContext;
  const pre = clone(supplied.observation);
  for (const e of pre.endpointObservations) {
    for (const f of [e.beforeFrontier, e.afterFrontier]) { f.version = 1; f.nextFusionPrice = 0; f.nextWorkPrice = 0; }
    e.sporks.list[1].activated = false; e.sporks.list[1].enforcementHeight = 0;
  }
  for (const observation of [null, missing, moved, legacy, pre, normalize(supplied.observation)]) {
    assert.throws(() => derive({ ...supplied, observation }), rejected);
  }
});

test('observed subject remains a projection not full previous-block authentication or account-state proof', { timeout: 5000 }, () => {
  const supplied = input(), previous = JSON.parse(supplied.accountFrontierResultJson), expected = derive(supplied);
  previous.publicKey = 'unvalidated'; previous.signature = 'unvalidated';
  previous.amount = 'not-a-prior-amount'; previous.confirmationDetail = { notTrusted: true };
  const result = derive({ ...supplied, accountFrontierResultJson: JSON.stringify(previous) });
  assert.deepEqual(result, expected); assert.equal(result.amount, supplied.accepted.amount);
  for (const key of ['chainAuthentication', 'canonicality', 'finality', 'READY', 'signature', 'authority']) {
    assert.equal(Object.hasOwn(result, key), false);
  }
});

test('observed subject requires exact unsigned version arity and rejects caller subject ack quote and operational fields', { timeout: 5000 }, () => {
  const supplied = input();
  for (const value of [{ ...supplied, observedSubjectVersion: 2 }, { ...supplied, phase: 'SIGNED' },
    { ...supplied, phase: 'VALIDATED' }]) assert.throws(() => derive(value), rejected);
  for (const key of ['subject', 'accountFrontier', 'momentumAcknowledged', 'quote', 'signedBlock',
    'expectedRequestContextDigest', 'normalization', 'policy', 'runtimeContextDigest', 'transport', 'wallet']) {
    assert.throws(() => derive({ ...supplied, [key]: null }), rejected);
  }
  assert.throws(() => derive(), rejected); assert.throws(() => derive(supplied, null), rejected);
});

test('observed subject rejects hostile descriptors without hooks and returns detached frozen DATA', { timeout: 5000 }, () => {
  let hooks = 0; const hook = () => { hooks += 1; throw Error('HOOK'); };
  const top = input(); Object.defineProperty(top, 'observation', { get: hook, enumerable: true });
  const nested = input(); Object.defineProperty(nested.observation, 'endpointObservations', { get: hook, enumerable: true });
  const payer = input(); payer.payerAddress = { toString: hook, [Symbol.toPrimitive]: hook };
  const rawResult = input(); rawResult.accountFrontierResultJson = { toString: hook };
  const proxy = new Proxy(input(), { ownKeys: hook, getPrototypeOf: hook, get: hook });
  for (const value of [top, nested, payer, rawResult, proxy]) assert.throws(() => derive(value), rejected);
  assert.equal(hooks, 0);
  const supplied = input(), result = derive(supplied), retained = JSON.stringify(result);
  supplied.accepted.amount = '999'; supplied.observation.endpointObservations[0].beforeFrontier.hash = '99'.repeat(32);
  supplied.accountFrontierResultJson = 'null'; supplied.phase = 'SIGNED';
  assert.equal(JSON.stringify(result), retained); assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.equal(Object.isFrozen(supplied), false); frozen(result);
});

test('observed subject uses captured data stages without quote dispatch or native owner signing and retry capabilities', { timeout: 5000 }, () => {
  const saved = Object.getOwnPropertyDescriptor(Bounded.prototype, 'quoteUserSend'); let calls = 0;
  Object.defineProperty(Bounded.prototype, 'quoteUserSend', { ...saved,
    value() { calls += 1; throw Error('OVERRIDE'); } });
  try { assert.equal(derive(input()).subjectVersion, 1); assert.equal(calls, 0); }
  finally { Object.defineProperty(Bounded.prototype, 'quoteUserSend', saved); }
  assert.equal((source.match(/^export /gm) ?? []).length, 1);
  assert.match(source, /const REQUEST = createZenonUserSendObservationInput/);
  assert.match(source, /const NORMALIZE = normalizeDynamicPlasmaObservation/);
  assert.match(source, /const FRONTIER = decodeZenonAccountFrontierReadResult/);
  assert.match(source, /const SUBJECT = createZenonUserSendSubject/);
  assert.doesNotMatch(source, /node:(?:fs|https?|tls|dns|child_process|worker_threads)|fetch\s*\(|new Promise|await |async |generateKeyPair|crypto\.sign|crypto\.verify|prepareBlock|publishRawTransaction|this\./);
});
