// Actual handoff-input component and actual POST checkpoint DATA core only.
// Declared transaction/signature text is NOT a valid signed Zenon transaction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { captureOriginalFundingServiceHandoffRequest as CAPTURE } from '../src/zenon/dynamic-plasma-original-funding-service-handoff-request.js';
import { captureOriginalPaymentCheckpoint, encodeOriginalPaymentCheckpoint } from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { encodeB64Json } from '../src/x402-wire.js';

assert.equal(process.version, 'v24.19.0'); assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.argv.length, 2);
assert.equal(process.env.X402_FUNDING_SERVICE_HANDOFF_SELECTION, 'twelve-external-original-input-cases-only');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
for (const key of ['NODE_OPTIONS','NODE_PATH','NODE_TEST_CONTEXT','NODE_V8_COVERAGE']) assert.equal(process.env[key], undefined);
assert.ok(process.permission && !process.permission.has('child') && !process.permission.has('worker')
  && !process.permission.has('fs.write'));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PINS = JSON.parse(process.env.X402_FUNDING_SERVICE_HANDOFF_SOURCE_PINS);
const names = ['package.json', 'src/zenon/dynamic-plasma-original-funding-service-handoff-request.js',
  'src/x402-original-payment-checkpoint-client.js', 'src/canonical.js',
  'src/service-credit-pilot-original-payment-checkpoint.js', 'src/x402-wire.js',
  'src/x402-official-https-request-binding.js', 'src/x402-funding-post-checkpoint-route.js',
  'src/service-credit-original-request-custody-contract.js',
  'qualification/original-funding-service-handoff-request.behavior.draft.mjs'];
assert.deepEqual(PINS.map(p => p.path), names);
const identity = s => [s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String);
function verify() {
  let bytes = 0;
  for (const p of PINS) {
    const path = resolve(ROOT, p.path), state = lstatSync(path, { bigint: true });
    assert.ok(state.isFile() && !state.isSymbolicLink()); assert.equal(state.nlink, 1n);
    assert.deepEqual(identity(state), p.identity);
    const raw = readFileSync(path); bytes += raw.length; assert.ok(bytes < 262144);
    assert.equal(raw.length, p.bytes); assert.equal(createHash('sha256').update(raw).digest('hex'), p.sha256);
    assert.deepEqual(identity(lstatSync(path, { bigint: true })), p.identity);
  }
}
verify();
const F = Object.freeze, OPT = { concurrency: false, timeout: 2000 }, copy = v => JSON.parse(JSON.stringify(v));
let entered = 0, completed = 0, hooks = 0;
function fixture({ resourceUrl = 'https://handoff.invalid/funding', body = '', requestId = 'original.1' } = {}) {
  const requirement = { scheme: 'exact', network: 'zenon:mock', asset: 'zts1declaredasset',
    amount: '1', payTo: 'z1declaredrecipient', maxTimeoutSeconds: 60,
    extra: { paymentFlow: 'upfront', poc: true, settlement: 'account-block',
      zenonChain: { version: 1, chainIdentifier: String(Number.MAX_SAFE_INTEGER), genesisMomentumHash: '0'.repeat(64) } } };
  const required = { x402Version: 2, resource: { url: resourceUrl, description: 'Declared handoff fixture',
    mimeType: 'application/json' }, accepts: [requirement] };
  const payload = { x402Version: 2, resource: copy(required.resource), accepted: copy(requirement),
    payload: { transaction: { hash: 'a'.repeat(64), signature: 'DECLARED_NOT_A_SIGNATURE', nonce: '0000000000000000' },
      intentDigest: 'b'.repeat(64) } };
  const header = encodeB64Json(required);
  const captured = captureOriginalPaymentCheckpoint({ binding: { requestId, paymentHash: 'a'.repeat(64),
    origin: 'https://handoff.invalid', contextId: 'context.1' }, originalBytes: {
    requestBody: body, paymentPayload: encodeB64Json(payload), paymentRequirements: header,
    context: Buffer.from('{}').toString('base64') } });
  const serializedCheckpoint = encodeOriginalPaymentCheckpoint(captured.checkpoint);
  return { request: { originalPayment: { resourceUrl, serializedCheckpoint, expectedPins: copy(captured.pins) },
    selectedGrantId: 'grant.1', paymentRequiredHeader: header },
    retained: { resourceUrl, serializedCheckpoint, paymentRequiredHeader: header }, required, payload };
}
function refused(fn) { assert.throws(fn, e => e instanceof TypeError && Object.isFrozen(e)
  && e.code === 'original_funding_service_handoff_request_rejected'); }
async function scenario(name, run) {
  let complete = false;
  await test(name, OPT, async () => { entered++; await run(); completed++; complete = true; });
  if (!complete) throw new Error('ORIGINAL_HANDOFF_COMPONENT_FAILED_STOP');
}
await scenario('matching external originals pins challenge and explicit grant are captured without a checkpoint read', () => {
  const f = fixture(), c = CAPTURE(f.request, f.retained);
  assert.deepEqual(c.originalPayment, f.request.originalPayment); assert.equal(c.selectedGrantId, 'grant.1');
  assert.equal(c.paymentRequiredHeader, f.request.paymentRequiredHeader);
  assert.equal(c.requestProfile.method, 'POST'); assert.equal(c.requestProfile.requestTarget, '/funding');
  assert.equal(c.transport, 'NOT_INVOKED'); assert.equal(c.authority, 'NONE');
});
await scenario('nested independent expectations are detached and immutable before any async handoff', () => {
  const f = fixture(), c = CAPTURE(f.request, f.retained), original = copy(c);
  f.request.originalPayment.expectedPins.binding.paymentHash = 'c'.repeat(64);
  f.request.originalPayment.expectedPins.digests.context = 'd'.repeat(64); f.request.selectedGrantId = 'other';
  f.retained.serializedCheckpoint = 'changed';
  assert.deepEqual(c, original); assert.ok(Object.isFrozen(c) && Object.isFrozen(c.originalPayment)
    && Object.isFrozen(c.originalPayment.expectedPins) && Object.isFrozen(c.originalPayment.expectedPins.binding)
    && Object.isFrozen(c.originalPayment.expectedPins.digests) && Object.isFrozen(c.requestProfile));
});
await scenario('coherent but different prepared original cannot replace the source-retained packet', () => {
  const a = fixture(), b = fixture({ requestId: 'replacement.1' });
  refused(() => CAPTURE(b.request, a.retained)); assert.notEqual(a.retained.serializedCheckpoint, b.retained.serializedCheckpoint);
});
await scenario('foreign independent binding or digest is refused instead of learned from checkpoint data', () => {
  for (const mutate of [p => { p.binding.paymentHash = 'c'.repeat(64); }, p => { p.binding.contextId = 'different'; },
    p => { p.digests.context = 'd'.repeat(64); }, p => { p.digests.paymentPayload = 'e'.repeat(64); }]) {
    const f = fixture(); mutate(f.request.originalPayment.expectedPins); refused(() => CAPTURE(f.request, f.retained));
  }
});
await scenario('grant selection is mandatory closed DATA and never inferred from funding or originals', () => {
  for (const value of [undefined, '', null, 1, {}, 'bad grant', 'g'.repeat(257)]) {
    const f = fixture(); f.request.selectedGrantId = value; refused(() => CAPTURE(f.request, f.retained));
  }
  const f = fixture(); delete f.request.selectedGrantId; refused(() => CAPTURE(f.request, f.retained));
});
await scenario('a changed challenge header cannot reset the original context during handoff', () => {
  const f = fixture(); f.required.resource.description = 'changed';
  f.request.paymentRequiredHeader = encodeB64Json(f.required); refused(() => CAPTURE(f.request, f.retained));
  f.retained.paymentRequiredHeader = f.request.paymentRequiredHeader; refused(() => CAPTURE(f.request, f.retained));
});
await scenario('a coherent GET paid original is still refused by the explicit POST funding contract', () => {
  const f = fixture({ resourceUrl: 'https://handoff.invalid/paid' });
  refused(() => CAPTURE(f.request, f.retained));
});
await scenario('same-origin other route and nonempty body are not silently reinterpreted as funding POST', () => {
  for (const f of [fixture({ resourceUrl: 'https://handoff.invalid/other' }), fixture({ body: 'YQ==' })])
    refused(() => CAPTURE(f.request, f.retained));
});
await scenario('malformed or noncanonical checkpoint bytes do not consume a different retained source', () => {
  for (const change of [s => s + ' ', () => '{}', () => 'not-json']) {
    const f = fixture(); f.request.originalPayment.serializedCheckpoint = change(f.request.originalPayment.serializedCheckpoint);
    f.retained.serializedCheckpoint = f.request.originalPayment.serializedCheckpoint;
    refused(() => CAPTURE(f.request, f.retained));
  }
});
await scenario('proxy getters and coercion hooks in request retained or nested pins are never invoked', () => {
  const trap = () => { hooks++; throw new Error('HOOK'); };
  const proxy = new Proxy({}, { get: trap, ownKeys: trap, getPrototypeOf: trap });
  const f = fixture(); refused(() => CAPTURE(proxy, f.retained)); refused(() => CAPTURE(f.request, proxy));
  const variants = [
    { ...f.request, get originalPayment() { return trap(); } },
    { ...f.request, originalPayment: proxy },
    { ...f.request, originalPayment: { ...f.request.originalPayment, expectedPins: proxy } },
    { ...f.request, originalPayment: { ...f.request.originalPayment,
      expectedPins: { ...f.request.originalPayment.expectedPins, binding: proxy } } },
    { ...f.request, selectedGrantId: proxy },
  ];
  for (const request of variants) refused(() => CAPTURE(request, f.retained));
  assert.equal(hooks, 0);
});
await scenario('extra fields and wrong arity refuse without introducing close transport or storage capabilities', () => {
  const f = fixture();
  for (const request of [{ ...f.request, close: () => undefined },
    { ...f.request, originalPayment: { ...f.request.originalPayment, requestImpl: () => undefined } },
    { ...f.request, originalPayment: { ...f.request.originalPayment, expectedPins: {
      ...f.request.originalPayment.expectedPins, grantId: 'grant.1' } } }])
    refused(() => CAPTURE(request, f.retained));
  refused(() => CAPTURE(f.request, { ...f.retained, store: {} }));
  refused(() => CAPTURE(f.request)); refused(() => CAPTURE(f.request, f.retained, true));
});
await scenario('passing declared unsigned evidence never upgrades it to economic native or durable authority', () => {
  const f = fixture(), c = CAPTURE(f.request, f.retained);
  assert.equal(c.fundingAcknowledgement, 'NOT_ESTABLISHED'); assert.equal(c.grantActivation, 'NOT_ESTABLISHED');
  assert.equal(c.independentDurableRetention, 'NOT_ESTABLISHED'); assert.equal(c.nativeResourceCleanup, 'NOT_QUALIFIED');
  assert.equal(Object.hasOwn(c, 'store'), false); assert.equal(Object.hasOwn(c, 'close'), false);
  assert.equal(Object.hasOwn(c, 'submit'), false);
});
verify(); assert.equal(entered, 12); assert.equal(completed, 12); assert.equal(hooks, 0);
console.log('# original-funding-service-handoff-source ' + JSON.stringify({ tests: 12, entered, completed, hooks,
  actualHandoffInputComponent: true, actualPostCheckpointCore: true,
  actualSdk: false, actualV6: false, actualNative: false, actualApplicationActor: false,
  authority: 'NONE', physicalDrain: 'NOT_ESTABLISHED', inputs: PINS.map(({identity, ...pin}) => pin) }));

