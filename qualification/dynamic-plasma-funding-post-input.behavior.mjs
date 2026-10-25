// Actual fixed-POST capture and real generic/checkpoint DATA components only.
// No native client/SDK/SQL import, candidate assembly, wallet, signer or search.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

assert.equal(process.version, 'v24.19.0'); assert.equal(process.argv.length, 2);
assert.equal(process.env.X402_DP_FUNDING_POST_INPUT_DATA, 'fixed-post-preparation-only');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE'])
  assert.equal(process.env[key], undefined);
const { captureZenonDynamicPlasmaFundingPostPreparationInput: CAPTURE } =
  await import('../src/zenon/dynamic-plasma-funding-post-preparation-input.js');
const { captureZenonDynamicPlasmaOriginalFundingInput: GENERIC_V1,
  captureZenonDynamicPlasmaOriginalFundingInputV2: GENERIC_V2 } =
  await import('../src/zenon/dynamic-plasma-original-funding-data.js');
const { createFundingPostOriginalPaymentCheckpointClient: POST } =
  await import('../src/x402-original-payment-checkpoint-client.js');
const { fundingPostPreparationInputFixture: FIXTURE } = await import('./dynamic-plasma-funding-post-input.fixture.mjs');
const copy = value => JSON.parse(JSON.stringify(value)); // Owned valid fixture DATA only.
const names = [], OPTIONS = { concurrency: false, timeout: 2000 };
let entered = 0, completed = 0, refusals = 0, hooks = 0, checkpointReads = 0;
function rejected(error) {
  const code = 'zenon_dynamic_plasma_funding_post_preparation_input_rejected';
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, code); assert.equal(error.message, code); assert.equal(error.stack, 'TypeError: ' + code);
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}
function refuse(action) { refusals++; assert.throws(action, rejected); }
function frozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) frozen(child);
}
async function selected(name, run) {
  let passed = false;
  await test(name, OPTIONS, () => { entered++; run(); completed++; passed = true; });
  if (!passed) throw new Error('FUNDING_POST_INPUT_DATA_CASE_FAILED');
  names.push(name);
}
const NEVER_READ = Object.freeze(function neverReadCheckpoint() {
  checkpointReads++; throw new Error('NO_CHECKPOINT_READ_ALLOWED');
});
await selected('matching contextv7 fixed empty-body input is detached frozen DATA', () => {
  const f = FIXTURE(), before = copy(f.input), captured = CAPTURE(f.input, f.resourceUrl);
  assert.deepEqual(captured, before); assert.notEqual(captured, f.input); frozen(captured);
  assert.equal(Object.isFrozen(f.input), false); assert.equal(captured.originalRequest.requestBodyBase64, '');
});
await selected('caller mutation cannot alter selected original header context or body', () => {
  const f = FIXTURE(), captured = CAPTURE(f.input, f.resourceUrl), before = copy(captured);
  f.input.originalRequest.requestBodyBase64 = 'YQ=='; f.input.originalRequest.contextBase64 = 'eA==';
  f.input.originalRequest.requestId = 'replacement'; f.input.challenge.paymentRequiredHeader = 'changed';
  f.input.plannerContext.readInput.policy.maxDifficulty = 1;
  assert.deepEqual(captured, before);
});
await selected('matching DATA is accepted by the later actual POST checkpoint constructor', () => {
  const f = FIXTURE(); CAPTURE(f.input, f.resourceUrl);
  const post = POST({ ...f.checkpoint(), readOriginalPaymentCheckpoint: NEVER_READ });
  const profile = post.selection().requestProfile;
  assert.equal(profile.profile, 'FUNDING_POST_V1_EMPTY_BODY'); assert.equal(profile.method, 'POST');
  assert.equal(profile.originalBodyBase64, ''); assert.equal(post.snapshot().checkpointReads, 0);
  assert.equal(post.close().storeClosed, false);
});
await selected('the generic v1 contract still preserves nonempty original bodies', () => {
  const f = FIXTURE({ bodyBase64: 'YQ==', contextVersion: 6 });
  assert.equal(GENERIC_V1(f.input, f.resourceUrl).originalRequest.requestBodyBase64, 'YQ==');
});
await selected('the generic v2 contract still preserves nonempty original bodies', () => {
  const f = FIXTURE({ bodyBase64: 'AP8RIg==' });
  assert.equal(GENERIC_V2(f.input, f.resourceUrl).originalRequest.requestBodyBase64, 'AP8RIg==');
  refuse(() => CAPTURE(f.input, f.resourceUrl));
});
await selected('canonical explicit HTTPS port preserves the same route and originals', () => {
  const f = FIXTURE({ resourceUrl: 'https://funding-input.invalid:8443/funding' });
  assert.deepEqual(CAPTURE(f.input, f.resourceUrl), GENERIC_V2(f.input, f.resourceUrl));
});
await selected('repeated DATA checks do not create a one-use operation or new authority', () => {
  const f = FIXTURE(), a = CAPTURE(f.input, f.resourceUrl), b = CAPTURE(f.input, f.resourceUrl);
  assert.deepEqual(a, b); assert.notEqual(a, b);
  assert.deepEqual(Object.keys(a).sort(), ['challenge', 'originalRequest', 'plannerContext']);
  assert.equal(Object.hasOwn(a, 'sign'), false); assert.equal(Object.hasOwn(a, 'prepare'), false);
});
await selected('valid identifiers context bytes and exact original header are unchanged', () => {
  const f = FIXTURE(); f.input.originalRequest.requestId = 'request:original.42';
  f.input.originalRequest.contextId = 'context:original.42';
  f.input.originalRequest.contextBase64 = Buffer.from([0, 255, 17, 34]).toString('base64');
  const a = CAPTURE(f.input, f.resourceUrl);
  assert.deepEqual(a.originalRequest, f.input.originalRequest);
  assert.equal(a.challenge.paymentRequiredHeader, f.input.challenge.paymentRequiredHeader);
});
for (const [label, body] of [
  ['one byte', 'YQ=='], ['zero byte', 'AA=='], ['binary bytes', 'AP8RIg=='],
  ['maximum generic body', Buffer.alloc(4096, 2).toString('base64')],
  ['oversized generic body', Buffer.alloc(4097, 2).toString('base64')],
  ['noncanonical base64', 'YQ==='], ['whitespace body', ' '], ['null body', null], ['numeric body', 0],
]) await selected('fixed POST refuses ' + label + ' without stripping or rewriting it', () => {
  const f = FIXTURE({ bodyBase64: body }), before = JSON.stringify(f.input);
  refuse(() => CAPTURE(f.input, f.resourceUrl)); assert.equal(JSON.stringify(f.input), before);
});
for (const [label, url] of [
  ['paid route', 'https://funding-input.invalid/paid'], ['other route', 'https://funding-input.invalid/other'],
  ['subroute', 'https://funding-input.invalid/funding/sub'], ['trailing slash', 'https://funding-input.invalid/funding/'],
  ['query', 'https://funding-input.invalid/funding?a=1'], ['fragment', 'https://funding-input.invalid/funding#x'],
  ['credentials', 'https://user@funding-input.invalid/funding'], ['plain HTTP', 'http://funding-input.invalid/funding'],
  ['port zero', 'https://funding-input.invalid:0/funding'], ['noncanonical default port', 'https://funding-input.invalid:443/funding'],
]) await selected('fixed POST rejects ' + label + ' instead of changing the target', () => {
  const f = FIXTURE(); refuse(() => CAPTURE(f.input, url));
});
await selected('a coherent different route remains generic DATA but is not fixed POST admission', () => {
  const f = FIXTURE({ resourceUrl: 'https://funding-input.invalid/paid' });
  assert.equal(GENERIC_V2(f.input, f.resourceUrl).challenge.resourceUrl, f.resourceUrl);
  refuse(() => CAPTURE(f.input, f.resourceUrl));
});
await selected('a different selected origin cannot replace the retained challenge resource', () => {
  const f = FIXTURE(); refuse(() => CAPTURE(f.input, 'https://other.invalid/funding'));
});
for (const version of [6, 8]) await selected('context version ' + version + ' is not silently upgraded to v7', () => {
  const f = FIXTURE({ contextVersion: version }); refuse(() => CAPTURE(f.input, f.resourceUrl));
});
for (const phase of ['SIGNED', 'UNKNOWN', 'ACKNOWLEDGED']) await selected('phase ' + phase + ' cannot enter pre-sign POST admission', () => {
  const f = FIXTURE(); f.input.plannerContext.readInput.phase = phase;
  refuse(() => CAPTURE(f.input, f.resourceUrl));
});
await selected('challenge header drift cannot be normalized into a different original', () => {
  const f = FIXTURE(); f.input.challenge.paymentRequiredHeader += ' ';
  refuse(() => CAPTURE(f.input, f.resourceUrl));
});
await selected('a caller method or transport field cannot override the fixed profile', () => {
  const f = FIXTURE(); f.input.originalRequest.method = 'GET'; refuse(() => CAPTURE(f.input, f.resourceUrl));
  delete f.input.originalRequest.method; f.input.fetchImpl = () => { hooks++; };
  refuse(() => CAPTURE(f.input, f.resourceUrl)); assert.equal(hooks, 0);
});
await selected('missing body is rejected rather than inferred as zero bytes', () => {
  const f = FIXTURE(); delete f.input.originalRequest.requestBodyBase64;
  refuse(() => CAPTURE(f.input, f.resourceUrl));
});
await selected('invalid arities do not inspect or coerce input', () => {
  const f = FIXTURE(); refuse(() => CAPTURE()); refuse(() => CAPTURE(f.input));
  refuse(() => CAPTURE(f.input, f.resourceUrl, true));
});
await selected('proxy and own getters remain unread at original input boundaries', () => {
  const trap = () => { hooks++; throw new Error('HOOK_MUST_STAY_UNENTERED'); };
  const proxy = new Proxy({}, { get: trap, ownKeys: trap, getPrototypeOf: trap });
  const f = FIXTURE(); refuse(() => CAPTURE(proxy, f.resourceUrl));
  refuse(() => CAPTURE({ ...f.input, originalRequest: proxy }, f.resourceUrl));
  refuse(() => CAPTURE({ ...f.input, get originalRequest() { return trap(); } }, f.resourceUrl));
  refuse(() => CAPTURE({ ...f.input, originalRequest: {
    ...f.input.originalRequest, get requestBodyBase64() { return trap(); } } }, f.resourceUrl));
  assert.equal(hooks, 0);
});
await selected('URL objects and coercion hooks are not treated as a canonical route string', () => {
  const f = FIXTURE(), url = { toString() { hooks++; return f.resourceUrl; } };
  refuse(() => CAPTURE(f.input, url)); assert.equal(hooks, 0);
});
await selected('callback-like or thenable input fields never invoke operational code', () => {
  const f = FIXTURE(); f.input.originalRequest = { then() { hooks++; } };
  refuse(() => CAPTURE(f.input, f.resourceUrl)); assert.equal(hooks, 0);
});
await selected('incoming records are not frozen or modified on refusal', () => {
  const f = FIXTURE({ bodyBase64: 'YQ==' }), before = JSON.stringify(f.input);
  refuse(() => CAPTURE(f.input, f.resourceUrl));
  assert.equal(JSON.stringify(f.input), before); assert.equal(Object.isFrozen(f.input), false);
  assert.equal(Object.isFrozen(f.input.originalRequest), false);
});
assert.equal(entered, completed); assert.equal(entered, names.length); assert.ok(entered >= 40 && entered <= 64);
assert.equal(new Set(names).size, names.length); assert.equal(hooks, 0); assert.equal(checkpointReads, 0);
console.log('# dp-funding-post-input-data ' + JSON.stringify({ entered, completed, names, expectedRefusals: refusals,
  hooks, checkpointReads, genericV1AndV2PreserveBodies: true, fixedPostRequiresExactEmptyBody: true,
  nativeClientImported: false, nativePrepareOrHandoffExecuted: false, SDK: false, SQLite: false,
  walletCalls: 0, signerCalls: 0, nonceSearches: 0, applicationSockets: 0, applicationTimers: 0,
  sourceTransforms: 0, nativeBuiltinAliases: 0, authority: 'NONE' }));
