// Exact current DATA module; no native/SDK/SQL import or signature/search call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

assert.equal(process.version, 'v24.19.0'); assert.equal(process.argv.length, 2);
assert.equal(process.env.X402_DP_RETAINED_INPUT_DATA, 'module-owned-contextv7-only');
assert.equal(process.env.X402_DP_FUNDING_POST_INPUT_DATA, 'fixed-post-preparation-only');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE'])
  assert.equal(process.env[key], undefined);
const { captureZenonDynamicPlasmaOriginalFundingInput: V1,
  captureZenonDynamicPlasmaOriginalFundingInputV2: V2,
  retainCapturedZenonDynamicPlasmaOriginalFundingInputV2: RETAIN,
  assembleZenonDynamicPlasmaOriginalFundingData: ASSEMBLE_V1,
  assembleZenonDynamicPlasmaOriginalFundingDataV2: ASSEMBLE_V2,
  snapshotZenonDynamicPlasmaOriginalFundingPins: PINS } =
  await import('../src/zenon/dynamic-plasma-original-funding-data.js');
const { captureZenonDynamicPlasmaFundingPostPreparationInput: POST_INPUT } =
  await import('../src/zenon/dynamic-plasma-funding-post-preparation-input.js');
const { restoreOriginalPaymentCheckpoint: RESTORE, encodeOriginalPaymentCheckpoint: ENCODE } =
  await import('../src/service-credit-pilot-original-payment-checkpoint.js');
const { createFundingPostOriginalPaymentCheckpointClient: POST } =
  await import('../src/x402-original-payment-checkpoint-client.js');
const { retainedOriginalInputFixture: FIXTURE } = await import('./dynamic-plasma-retained-input.fixture.mjs');
const copy = value => JSON.parse(JSON.stringify(value));
const names = [], OPTIONS = { concurrency: false, timeout: 2000 };
let entered = 0, completed = 0, refusals = 0, hooks = 0, checkpointReads = 0, assemblies = 0;
let measurements = null;
function frozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) frozen(child);
}
function refused(error) {
  const code = 'zenon_dynamic_plasma_original_funding_data_rejected';
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, code); assert.equal(error.message, code); assert.equal(error.stack, 'TypeError: ' + code);
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}
function refuse(action) { refusals++; assert.throws(action, refused); }
async function selected(name, run) {
  let passed = false;
  await test(name, OPTIONS, () => { entered++; run(); completed++; passed = true; });
  if (!passed) throw new Error('RETAINED_INPUT_DATA_CASE_FAILED');
  names.push(name);
}
function fixtureAndCapture(options) {
  const f = FIXTURE(options); return { ...f, captured: V2(f.input, f.resourceUrl) };
}
function assemble(input, f, v1 = false) {
  assemblies++; return (v1 ? ASSEMBLE_V1 : ASSEMBLE_V2)(input, f.candidate, f.resourceUrl);
}
await selected('raw v7 input still receives a complete detached capture', () => {
  const f = FIXTURE(), value = RETAIN(f.input, f.resourceUrl);
  assert.deepEqual(value, f.input); assert.notEqual(value, f.input); frozen(value);
});
await selected('the exact module-owned v7 capture is reused with all nested identities', () => {
  const f = fixtureAndCapture(), value = RETAIN(f.captured, f.resourceUrl);
  assert.equal(value, f.captured); assert.equal(value.plannerContext, f.captured.plannerContext);
  assert.equal(value.originalRequest, f.captured.originalRequest); frozen(value);
});
await selected('public v2 capture stays fresh even for an owned immutable capture', () => {
  const f = fixtureAndCapture(), value = V2(f.captured, f.resourceUrl);
  assert.notEqual(value, f.captured); assert.notEqual(value.originalRequest, f.captured.originalRequest);
  assert.deepEqual(value, f.captured); assert.equal(RETAIN(value, f.resourceUrl), value);
});
await selected('public v1 capture retains its existing fresh-copy contract', () => {
  const f = FIXTURE({ contextVersion: 6 }), a = V1(f.input, f.resourceUrl), b = V1(a, f.resourceUrl);
  assert.notEqual(a, b); assert.deepEqual(a, b); refuse(() => RETAIN(a, f.resourceUrl));
});
await selected('an equal deeply frozen clone is not accepted as a retained identity', () => {
  const f = fixtureAndCapture(), clone = copy(f.captured);
  const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } };
  freeze(clone); const retained = RETAIN(clone, f.resourceUrl);
  assert.deepEqual(retained, clone); assert.notEqual(retained, clone); assert.equal(RETAIN(retained, f.resourceUrl), retained);
});
await selected('frozen caller input receives a fresh capture rather than a forged brand', () => {
  const f = FIXTURE(); Object.freeze(f.input);
  assert.notEqual(RETAIN(f.input, f.resourceUrl), f.input);
});
await selected('later caller mutation cannot modify or invalidate retained original bytes', () => {
  const f = fixtureAndCapture(), before = copy(f.captured);
  f.input.originalRequest.contextBase64 = 'eA=='; f.input.originalRequest.requestId = 'different';
  f.input.plannerContext.readInput.policy.maxDifficulty = 1;
  assert.equal(RETAIN(f.captured, f.resourceUrl), f.captured); assert.deepEqual(f.captured, before);
});
await selected('separate equal captures are never globally deduplicated by content', () => {
  const f = FIXTURE(), a = V2(f.input, f.resourceUrl), b = V2(f.input, f.resourceUrl);
  assert.notEqual(a, b); assert.equal(RETAIN(a, f.resourceUrl), a); assert.equal(RETAIN(b, f.resourceUrl), b);
});
await selected('generic nonempty binary body data remains exact and immutable', () => {
  const f = fixtureAndCapture({ bodyBase64: 'AP8RIg==' });
  assert.equal(RETAIN(f.captured, f.resourceUrl).originalRequest.requestBodyBase64, 'AP8RIg==');
});
await selected('fixed-POST input capture can be retained without changing the POST contract', () => {
  const f = FIXTURE(), captured = POST_INPUT(f.input, f.resourceUrl);
  assert.equal(RETAIN(captured, f.resourceUrl), captured); assert.equal(captured.originalRequest.requestBodyBase64, '');
});
await selected('retention cannot convert a generic nonempty body into a valid fixed POST', () => {
  const f = fixtureAndCapture({ bodyBase64: 'YQ==' });
  assert.equal(RETAIN(f.captured, f.resourceUrl), f.captured);
  assert.throws(() => POST_INPUT(f.captured, f.resourceUrl), { code: 'zenon_dynamic_plasma_funding_post_preparation_input_rejected' });
});
await selected('a v1 caller flag cannot upgrade frozen contextv6 into contextv7', () => {
  const f = FIXTURE({ contextVersion: 6 }); Object.freeze(f.input); refuse(() => RETAIN(f.input, f.resourceUrl));
});
for (const [label, url] of [['path', 'https://funding-input.invalid/other'],
  ['origin', 'https://other.invalid/funding'], ['port', 'https://funding-input.invalid:8443/funding']]) {
  await selected('retained resource binding rejects a changed ' + label, () => {
    const f = fixtureAndCapture(); refuse(() => RETAIN(f.captured, url));
    assert.equal(RETAIN(f.captured, f.resourceUrl), f.captured);
  });
}
await selected('noncanonical or credential-bearing resource URLs do not reach a cache hit', () => {
  const f = fixtureAndCapture();
  for (const url of ['https://funding-input.invalid:443/funding', 'https://x@funding-input.invalid/funding',
    'https://funding-input.invalid/funding?x=1', 'https://funding-input.invalid/funding#x']) refuse(() => RETAIN(f.captured, url));
});
await selected('wrong arity rejects before reading caller data', () => {
  const f = fixtureAndCapture(); refuse(() => RETAIN()); refuse(() => RETAIN(f.captured));
  refuse(() => RETAIN(f.captured, f.resourceUrl, 'extra'));
});
await selected('primitive and array inputs cannot obtain a retained brand', () => {
  const f = FIXTURE(); for (const input of [null, undefined, true, 1, 1n, 'x', Symbol('x'), [], () => {}])
    refuse(() => RETAIN(input, f.resourceUrl));
});
await selected('proxy input rejects without invoking any caller trap', () => {
  const f = FIXTURE(), trap = () => { hooks++; throw Error('PRIVATE'); };
  refuse(() => RETAIN(new Proxy({}, { get: trap, ownKeys: trap, getPrototypeOf: trap }), f.resourceUrl)); assert.equal(hooks, 0);
});
await selected('a getter on an unbranded record is rejected without invocation', () => {
  const f = FIXTURE(); Object.defineProperty(f.input, 'challenge', { enumerable: true, get() { hooks++; throw Error('PRIVATE'); } });
  refuse(() => RETAIN(f.input, f.resourceUrl)); assert.equal(hooks, 0);
});
await selected('a frozen clone with modified original challenge takes full validation and refuses', () => {
  const f = fixtureAndCapture(), changed = copy(f.captured); changed.challenge.paymentRequiredHeader = 'eA==';
  Object.freeze(changed); refuse(() => RETAIN(changed, f.resourceUrl));
});
await selected('a caller version change cannot forge a successfully captured context', () => {
  const f = fixtureAndCapture(), changed = copy(f.captured); changed.plannerContext.plannerContextVersion = 6;
  refuse(() => RETAIN(changed, f.resourceUrl));
});
for (const [prototype, field] of [[Object.prototype, 'then'], [Object.prototype, 'toJSON'], [Array.prototype, 'toJSON']]) {
  await selected('an owned capture still rejects intrinsic drift at ' + (prototype === Array.prototype ? 'Array.' : 'Object.') + field, () => {
    const f = fixtureAndCapture(); assert.equal(Object.getOwnPropertyDescriptor(prototype, field), undefined);
    Object.defineProperty(prototype, field, { configurable: true, value() { hooks++; throw Error('PRIVATE'); } });
    try { refuse(() => RETAIN(f.captured, f.resourceUrl)); } finally { delete prototype[field]; }
    assert.equal(hooks, 0); assert.equal(RETAIN(f.captured, f.resourceUrl), f.captured);
  });
}
await selected('captured WeakMap intrinsics avoid later get and set substitutions', () => {
  const f = fixtureAndCapture(), get = Object.getOwnPropertyDescriptor(WeakMap.prototype, 'get'), set = Object.getOwnPropertyDescriptor(WeakMap.prototype, 'set');
  let first, second;
  try {
    Object.defineProperty(WeakMap.prototype, 'get', { ...get, value() { hooks++; throw Error('PRIVATE'); } });
    Object.defineProperty(WeakMap.prototype, 'set', { ...set, value() { hooks++; throw Error('PRIVATE'); } });
    first = RETAIN(f.captured, f.resourceUrl); second = V2(f.input, f.resourceUrl);
  } finally { Object.defineProperty(WeakMap.prototype, 'get', get); Object.defineProperty(WeakMap.prototype, 'set', set); }
  assert.equal(first, f.captured); assert.notEqual(second, first); assert.equal(hooks, 0);
});
await selected('returned DATA grants no operation signer read or persistence capability', () => {
  const f = fixtureAndCapture(), value = RETAIN(f.captured, f.resourceUrl);
  assert.deepEqual(Object.keys(value).sort(), ['challenge', 'originalRequest', 'plannerContext']);
  for (const name of ['sign', 'prepare', 'read', 'commit', 'retry', 'authority', 'cacheBrand']) assert.equal(Object.hasOwn(value, name), false);
});
await selected('actual v2 assembly preserves identical checkpoint wire transaction and pin bytes', () => {
  const f = fixtureAndCapture(), owned = assemble(f.captured, f), fresh = assemble(copy(f.captured), f);
  assert.deepEqual(owned, fresh); assert.equal(owned.signatureValidation, 'NOT_PERFORMED'); assert.equal(owned.authority, 'NONE');
  const restored = RESTORE(owned.serializedCheckpoint, owned.expectedPins);
  assert.equal(ENCODE(restored), owned.serializedCheckpoint); assert.equal(restored.originalBytes.requestBody, '');
  assert.equal(restored.originalBytes.paymentRequirements, f.captured.challenge.paymentRequiredHeader);
});
await selected('repeat initial DATA assembly preserves the exact originals but grants no signing or retry right', () => {
  const f = fixtureAndCapture(), first = assemble(f.captured, f), second = assemble(f.captured, f);
  assert.deepEqual(first, second); assert.equal(RETAIN(f.captured, f.resourceUrl), f.captured);
});
await selected('assembly still rejects a modified candidate transfer despite a retained input', () => {
  const f = fixtureAndCapture(); f.candidate.accountBlock.amount = '6'; refuse(() => assemble(f.captured, f));
});
await selected('assembly still rejects a changed unsigned hash and nonce rather than replacing them', () => {
  const f = fixtureAndCapture(); f.candidate.originalUnsignedBlock.nonce = '0000000000000001';
  refuse(() => assemble(f.captured, f));
});
await selected('assembly still enforces supplied public-key and payer consistency', () => {
  const f = fixtureAndCapture(); f.candidate.originalUnsignedBlock.publicKey = Buffer.alloc(32, 9).toString('base64');
  f.candidate.accountBlock.publicKey = f.candidate.originalUnsignedBlock.publicKey; refuse(() => assemble(f.captured, f));
});
await selected('retention does not relax independent checkpoint pin verification', () => {
  const f = fixtureAndCapture(), packet = assemble(f.captured, f), pins = copy(packet.expectedPins);
  pins.digests.context = 'sha256:' + 'f'.repeat(64); refuse(() => PINS(packet.serializedCheckpoint, pins));
});
await selected('contextv6 assembly remains compatible and never passes the v7 retainer', () => {
  const f = FIXTURE({ contextVersion: 6 }), captured = V1(f.input, f.resourceUrl), packet = assemble(captured, f, true);
  assert.equal(packet.originalFundingDataVersion, 1); assert.equal(packet.authority, 'NONE'); refuse(() => RETAIN(captured, f.resourceUrl));
});
await selected('actual POST checkpoint DATA constructor still receives the identical original bytes', () => {
  const f = fixtureAndCapture(), packet = assemble(f.captured, f);
  const reader = Object.freeze(function unexpectedRead() { checkpointReads++; throw Error('UNREACHABLE_READER'); });
  const client = POST({ resourceUrl: f.resourceUrl, serializedCheckpoint: packet.serializedCheckpoint,
    expectedPins: packet.expectedPins, readOriginalPaymentCheckpoint: reader });
  assert.equal(client.selection().requestProfile.originalBodyBase64, ''); assert.equal(client.snapshot().checkpointReads, 0); client.close();
});
await selected('128 retained handoffs avoid new snapshots while generic capture stays fresh', () => {
  const f = fixtureAndCapture(); let identityReuses = 0, genericIdentityReuses = 0;
  let started = process.hrtime.bigint();
  for (let i = 0; i < 128; i++) if (V2(f.captured, f.resourceUrl) === f.captured) genericIdentityReuses++;
  const freshNanoseconds = String(process.hrtime.bigint() - started); started = process.hrtime.bigint();
  for (let i = 0; i < 128; i++) if (RETAIN(f.captured, f.resourceUrl) === f.captured) identityReuses++;
  const retainedNanoseconds = String(process.hrtime.bigint() - started);
  assert.equal(genericIdentityReuses, 0); assert.equal(identityReuses, 128);
  measurements = { iterations: 128, genericIdentityReuses, identityReuses, freshNanoseconds, retainedNanoseconds,
    scope: 'single-process pure DATA micro-observation; not application latency or a performance guarantee' };
});
assert.equal(entered, completed); assert.equal(entered, names.length); assert.equal(new Set(names).size, names.length);
assert.ok(entered >= 32 && entered <= 48); assert.equal(hooks, 0); assert.equal(checkpointReads, 0);
console.log('# dp-retained-input-data ' + JSON.stringify({ entered, completed, names, expectedRefusals: refusals,
  hooks, checkpointReads, assemblies, measurements, freshPublicCapturePreserved: true,
  exactOwnedV7Only: true, actualInitialDataAssembly: true, cryptographicSignatureValidation: false,
  nativeClientImported: false, nativePreparationImported: false, SDK: false, SQLite: false,
  walletCalls: 0, signatureOperations: 0, nonceSearches: 0, applicationSockets: 0, applicationTimers: 0,
  sourceTransforms: 0, nativeBuiltinAliases: 0, authority: 'NONE' }));
// Regression is relevant because its real generic dependency changed this turn.
// Exact existing bytes; no source-copy, alias, test selection rewrite or new native graph.
await import('./dynamic-plasma-funding-post-input.behavior.mjs');
