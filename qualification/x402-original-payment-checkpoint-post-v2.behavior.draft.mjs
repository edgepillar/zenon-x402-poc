// Versioned current GET/paid regression plus POST/funding component selection.
// The earlier 24-case file/result stay unchanged historical evidence.
// No V6/official SDK/TLS is imported. Hash-only DATA is not a valid signature.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createOriginalPaymentCheckpointClient as CREATE,
  createFundingPostOriginalPaymentCheckpointClient as CREATE_POST } from '../src/x402-original-payment-checkpoint-client.js';
import { captureFundingPostCheckpointRoute as POST_ROUTE } from '../src/x402-funding-post-checkpoint-route.js';
import {
  captureOriginalPaymentCheckpoint, encodeOriginalPaymentCheckpoint,
} from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { encodeB64Json } from '../src/x402-wire.js';

assert.equal(process.versions.node, '24.19.0');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assert.equal(process.env.X402_CHECKPOINT_POST_V2_SELECTION, 'current-get-and-funding-post-only');
assert.equal(process.env.NODE_OPTIONS, undefined); assert.equal(process.env.NODE_PATH, undefined);
assert.equal(process.env.NODE_TEST_CONTEXT, undefined); assert.equal(process.env.NODE_V8_COVERAGE, undefined);
const PINS = JSON.parse(process.env.X402_CHECKPOINT_CLIENT_POST_V2_SOURCE_PINS);
const names = [
  'package.json', 'src/x402-original-payment-checkpoint-client.js', 'src/canonical.js',
  'src/service-credit-pilot-original-payment-checkpoint.js', 'src/x402-wire.js',
  'src/x402-official-https-request-binding.js', 'src/x402-funding-post-checkpoint-route.js',
  'qualification/x402-original-payment-checkpoint-post-v2.behavior.draft.mjs',
];
assert.deepEqual(PINS.map(p => p.path), names);
const identity = s => [s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String);
function verify() {
  let bytes = 0;
  for (const p of PINS) {
    const path = resolve(ROOT, p.path), state = lstatSync(path, { bigint: true });
    assert.ok(state.isFile() && !state.isSymbolicLink()); assert.equal(state.nlink, 1n);
    assert.deepEqual(identity(state), p.identity);
    const raw = readFileSync(path); bytes += raw.length; assert.ok(bytes < 262144);
    assert.equal(raw.length, p.bytes);
    assert.equal(createHash('sha256').update(raw).digest('hex'), p.sha256);
    assert.deepEqual(identity(lstatSync(path, { bigint: true })), p.identity);
  }
}
verify();
const OPT = { concurrency: false, timeout: 2000 };
const copy = x => JSON.parse(JSON.stringify(x));
const URL = 'https://checkpoint.invalid/paid', FUNDING_URL = 'https://checkpoint.invalid/funding';
const rejected = fn => assert.throws(fn, TypeError);
function fixture(mutate = () => {}, fundingPost = false) {
  const resourceUrl = fundingPost ? FUNDING_URL : URL;
  const requirement = { scheme: 'exact', network: 'zenon:mock', asset: 'zts1declaredasset',
    amount: '1', payTo: 'z1declaredrecipient', maxTimeoutSeconds: 60,
    extra: { paymentFlow: 'upfront', poc: true, settlement: 'account-block',
      zenonChain: { version: 1, chainIdentifier: String(Number.MAX_SAFE_INTEGER),
        genesisMomentumHash: '0'.repeat(64) } } };
  const required = { x402Version: 2, resource: { url: resourceUrl,
    description: 'Retained original fixture', mimeType: 'application/json' }, accepts: [requirement] };
  const payload = { x402Version: 2, resource: copy(required.resource), accepted: copy(requirement),
    payload: { transaction: { hash: 'a'.repeat(64), signature: 'DECLARED_NOT_A_SIGNATURE',
      nonce: '0000000000000000' }, intentDigest: 'b'.repeat(64) } };
  const initial = { required, payload, body: '' }; mutate(initial);
  const requiredHeader = encodeB64Json(initial.required), paymentHeader = encodeB64Json(initial.payload);
  const captured = captureOriginalPaymentCheckpoint({ binding: { requestId: 'original.1',
    paymentHash: 'a'.repeat(64), origin: 'https://checkpoint.invalid', contextId: 'context.1' },
    originalBytes: { requestBody: initial.body, paymentPayload: paymentHeader,
      paymentRequirements: requiredHeader, context: Buffer.from('{}').toString('base64') } });
  const f = { ...initial, requiredHeader, paymentHeader, checkpoint: captured.checkpoint,
    pins: captured.pins, reads: 0, readImpl: null };
  f.config = { resourceUrl, serializedCheckpoint: encodeOriginalPaymentCheckpoint(f.checkpoint),
    expectedPins: copy(f.pins), readOriginalPaymentCheckpoint(pins) {
      f.reads++; assert.deepEqual(pins, f.pins); assert.ok(Object.isFrozen(pins));
      return f.readImpl === null ? f.checkpoint : f.readImpl(pins);
    } };
  f.start = () => { f.client = (fundingPost ? CREATE_POST : CREATE)(f.config); return f; };
  f.admit = () => f.client.captureChallenge({ paymentRequiredHeader: f.requiredHeader, expectedPins: copy(f.pins) });
  f.create = () => f.client.localClient.createPaymentPayload(f.required, f.required.accepts[0]);
  f.sdkHeader = () => encodeB64Json({ x402Version: 2, payload: f.payload.payload,
    resource: f.payload.resource, accepted: f.payload.accepted });
  return f;
}
test('construction performs no read and exposes no checkpoint in its snapshot', OPT, () => {
  const f = fixture().start(); assert.equal(f.reads, 0);
  const selection = f.client.selection(); assert.ok(Object.isFrozen(selection.requirement));
  assert.equal(selection.resourceUrl, URL); assert.equal(f.client.snapshot().authority, 'NONE');
  assert.equal(JSON.stringify(f.client.snapshot()).includes('signature'), false);
});
test('official JSON key reordering returns exact original header after three pinned reads', OPT, () => {
  const f = fixture().start(); f.admit(); assert.deepEqual(f.create(), f.payload);
  assert.notEqual(f.sdkHeader(), f.paymentHeader);
  const result = f.client.selectOriginalPaymentHeader(f.sdkHeader(), copy(f.pins));
  assert.equal(result, f.paymentHeader); assert.equal(f.reads, 3);
  assert.equal(f.client.snapshot().creationAttempts, 1);
  assert.equal(f.client.snapshot().transportCalls, 0); assert.equal(f.client.snapshot().signerCalls, 0);
});
test('constructor refuses wrong independent pins before any read', OPT, () => {
  const f = fixture(); f.config.expectedPins.binding.contextId = 'changed';
  rejected(() => CREATE(f.config)); assert.equal(f.reads, 0);
});
test('constructor refuses another origin path query or insecure resource', OPT, () => {
  for (const url of ['https://other.invalid/paid', 'https://checkpoint.invalid/other',
    URL + '?query=1', URL.replace('https:', 'http:')]) {
    const f = fixture(); f.config.resourceUrl = url;
    rejected(() => CREATE(f.config)); assert.equal(f.reads, 0);
  }
});
test('GET binding refuses nonempty original request body', OPT, () => {
  const f = fixture(f => { f.body = 'YQ=='; });
  rejected(() => f.start()); assert.equal(f.reads, 0);
});
test('constructor binds exact original payment hash as well as checkpoint digests', OPT, () => {
  const f = fixture(f => { f.payload.payload.transaction.hash = 'c'.repeat(64); });
  rejected(() => f.start()); assert.equal(f.reads, 0);
});
test('changed challenge header is refused before read or context consumption', OPT, () => {
  const f = fixture().start(), changed = copy(f.required); changed.resource.description = 'other';
  rejected(() => f.client.captureChallenge({ paymentRequiredHeader: encodeB64Json(changed),
    expectedPins: f.pins })); assert.equal(f.reads, 0);
  f.admit(); assert.deepEqual(f.create(), f.payload);
});
test('per-call foreign binding or digest never enters the reader', OPT, () => {
  for (const mutate of [p => { p.binding.paymentHash = 'c'.repeat(64); },
    p => { p.digests.context = 'd'.repeat(64); }]) {
    const f = fixture().start(), pins = copy(f.pins); mutate(pins);
    rejected(() => f.client.captureChallenge({ paymentRequiredHeader: f.requiredHeader, expectedPins: pins }));
    assert.equal(f.reads, 0);
  }
});
test('creator cannot read or return original before external challenge admission', OPT, () => {
  const f = fixture().start(); rejected(f.create); assert.equal(f.reads, 0);
  assert.equal(f.client.snapshot().creationAttempts, 0);
});
test('changed SDK selected challenge is refused without consuming original', OPT, () => {
  const f = fixture().start(); f.admit();
  const other = copy(f.required); other.resource.description = 'different';
  rejected(() => f.client.localClient.createPaymentPayload(other, other.accepts[0]));
  assert.equal(f.reads, 1); assert.equal(f.client.snapshot().creationAttempts, 0);
  assert.deepEqual(f.create(), f.payload);
});
test('a second creator or context cannot reset consumed original', OPT, () => {
  const f = fixture().start(); f.admit(); f.create();
  rejected(f.create); rejected(f.admit);
  assert.equal(f.reads, 2); assert.equal(f.client.snapshot().creationAttempts, 1);
});
test('read failure remains HELD and uncertainty survives close', OPT, () => {
  const f = fixture().start(); f.readImpl = () => { throw Error('declared read failure'); };
  rejected(f.admit); assert.equal(f.client.snapshot().phase, 'HELD');
  f.readImpl = null; rejected(f.admit); assert.equal(f.reads, 1);
  const closed = f.client.close(); assert.equal(closed.uncertain, true);
  assert.equal(closed.storeClosed, false); assert.equal(f.client.snapshot().uncertain, true);
});
test('changed complete checkpoint latches HELD rather than learning replacement pins', OPT, () => {
  const f = fixture().start();
  f.readImpl = () => { const x = copy(f.checkpoint); x.binding.contextId = 'other'; return x; };
  rejected(f.admit); assert.equal(f.client.snapshot().phase, 'HELD'); assert.equal(f.reads, 1);
});
test('async and getter-bearing checkpoint replies are not assimilated', OPT, () => {
  for (const value of [Promise.resolve({}), Object.defineProperty({}, 'then', {
    enumerable: true, get() { throw Error('getter must not run'); },
  })]) {
    const f = fixture().start(); f.readImpl = () => value;
    rejected(f.admit); assert.equal(f.client.snapshot().phase, 'HELD');
  }
});
test('reentrant read cannot create a second read or consume the context', OPT, () => {
  const f = fixture().start(); let reentries = 0;
  f.readImpl = () => { rejected(f.admit); rejected(f.create); reentries++; return f.checkpoint; };
  f.admit(); assert.equal(f.reads, 1); assert.equal(reentries, 1);
  assert.deepEqual(f.create(), f.payload); assert.equal(f.reads, 2);
});
test('close during read suppresses the returned checkpoint and keeps uncertainty', OPT, () => {
  const f = fixture().start(); f.readImpl = () => { f.client.close(); return f.checkpoint; };
  rejected(f.admit); assert.equal(f.client.snapshot().phase, 'CLOSED');
  assert.equal(f.client.snapshot().uncertain, true); rejected(f.create);
});
test('changed SDK transaction resource or selected amount never releases a header', OPT, () => {
  for (const mutate of [p => { p.payload.transaction.nonce = '1111111111111111'; },
    p => { p.resource.description = 'changed'; }, p => { p.accepted.amount = '2'; }]) {
    const f = fixture().start(); f.admit(); f.create(); const p = copy(f.payload); mutate(p);
    rejected(() => f.client.selectOriginalPaymentHeader(encodeB64Json(p), f.pins));
    assert.equal(f.reads, 2);
  }
});
test('nonempty SDK extensions and noncanonical base64 are refused before read', OPT, () => {
  const f = fixture().start(); f.admit(); f.create();
  const p = copy(f.payload); p.extensions = { unrelated: true };
  rejected(() => f.client.selectOriginalPaymentHeader(encodeB64Json(p), f.pins));
  rejected(() => f.client.selectOriginalPaymentHeader(f.sdkHeader() + '\n', f.pins));
  assert.equal(f.reads, 2);
});
test('absent or empty SDK extensions do not replace the retained header', OPT, () => {
  const f = fixture().start(); f.admit(); f.create();
  const p = copy(f.payload); p.extensions = {};
  assert.equal(f.client.selectOriginalPaymentHeader(encodeB64Json(p), f.pins), f.paymentHeader);
});
test('wire parser errors are bounded local codes without nested diagnostic paths', OPT, () => {
  const f = fixture().start(); f.admit(); f.create();
  const p = copy(f.payload); p.extensions = { unrelated: true };
  assert.throws(() => f.client.selectOriginalPaymentHeader(encodeB64Json(p), f.pins), error => {
    assert.equal(error.code, 'x402_original_payment_checkpoint_client_header_rejected');
    assert.equal(error.stack, 'TypeError: ' + error.code); return true;
  });
  assert.equal(f.reads, 2);
});
test('accessor proxy and extra constructor fields are rejected without invoking hooks', OPT, () => {
  for (const modify of [
    c => Object.defineProperty(c, 'expectedPins', { enumerable: true, get() { throw Error('hook'); } }),
    c => new Proxy(c, { ownKeys() { throw Error('hook'); } }),
    c => ({ ...c, extra: true }),
  ]) {
    const f = fixture(); rejected(() => CREATE(modify({ ...f.config }))); assert.equal(f.reads, 0);
  }
});
test('per-call pins accessor is refused without entering reader', OPT, () => {
  const f = fixture().start(); let calls = 0;
  const pins = { binding: f.pins.binding, get digests() { calls++; return f.pins.digests; } };
  rejected(() => f.client.captureChallenge({ paymentRequiredHeader: f.requiredHeader, expectedPins: pins }));
  assert.equal(calls, 0); assert.equal(f.reads, 0);
});
test('source input and returned original payload mutation cannot replace selected bytes', OPT, () => {
  const f = fixture().start(); const original = f.config.serializedCheckpoint;
  f.config.serializedCheckpoint = '{}'; f.config.expectedPins.binding.contextId = 'other';
  f.admit(); const result = f.create(); assert.ok(Object.isFrozen(result.payload.transaction));
  assert.equal(f.client.selectOriginalPaymentHeader(f.sdkHeader(), f.pins), f.paymentHeader);
  assert.notEqual(original, f.config.serializedCheckpoint);
});
test('closed adapter cannot read create or select a header and does not close borrowed store', OPT, () => {
  const f = fixture().start(); assert.equal(f.client.close().storeClosed, false);
  rejected(f.admit); rejected(f.create);
  rejected(() => f.client.selectOriginalPaymentHeader(f.sdkHeader(), f.pins));
  assert.equal(f.reads, 0); assert.equal(f.client.snapshot().phase, 'CLOSED');
});

test('funding POST construction carries an explicit immutable method target body without reads', OPT, () => {
  const f = fixture(undefined, true).start(), selected = f.client.selection();
  assert.equal(f.reads, 0); assert.equal(selected.resourceUrl, FUNDING_URL);
  assert.deepEqual(selected.requestProfile, { profile: 'FUNDING_POST_V1_EMPTY_BODY',
    resourceUrl: FUNDING_URL, authority: 'checkpoint.invalid', method: 'POST',
    requestTarget: '/funding', originalBodyBase64: '' });
  assert.ok(Object.isFrozen(selected.requestProfile));
  assert.equal(f.client.snapshot().signerCalls, 0); assert.equal(f.client.snapshot().transportCalls, 0);
});
test('funding POST restores exact original header after reordered envelope and three independent reads', OPT, () => {
  const f = fixture(undefined, true).start(); f.admit(); f.create();
  assert.notEqual(f.sdkHeader(), f.paymentHeader);
  assert.equal(f.client.selectOriginalPaymentHeader(f.sdkHeader(), f.pins), f.paymentHeader);
  assert.equal(f.reads, 3); assert.equal(f.client.snapshot().creationAttempts, 1);
  assert.equal(f.client.selection().requestProfile.method, 'POST');
});
test('GET and funding POST named selections reject one another before any reader call', OPT, () => {
  const paid = fixture(), funding = fixture(undefined, true);
  rejected(() => CREATE_POST(paid.config)); rejected(() => CREATE(funding.config));
  assert.equal(paid.reads, 0); assert.equal(funding.reads, 0);
});
test('funding route rejects another path trailing delimiters query userinfo normalization and insecure URLs', OPT, () => {
  for (const route of ['http://checkpoint.invalid/funding', URL, FUNDING_URL + '/',
    FUNDING_URL + '?x=1', FUNDING_URL + '?', FUNDING_URL + '#x', FUNDING_URL + '#',
    'https://user:secret@checkpoint.invalid/funding', 'https://CHECKPOINT.invalid/funding',
    'https://checkpoint.invalid:443/funding', 'https://checkpoint.invalid:0/funding',
    'https://checkpoint.invalid/a/../funding', 'https://checkpoint.invalid/%66unding',
    'https://checkpoint.invalid/funding%2f', ' https://checkpoint.invalid/funding',
    'https://checkpoint.invalid/funding\n', 'https://checkpoint.invalid/other']) {
    rejected(() => POST_ROUTE(route));
    const f = fixture(undefined, true); f.config.resourceUrl = route;
    rejected(() => f.start()); assert.equal(f.reads, 0);
  }
});
test('funding route permits canonical explicit IPv4 port without invoking networking', OPT, () => {
  const route = POST_ROUTE('https://127.0.0.1:9443/funding');
  assert.equal(route.authority, '127.0.0.1:9443'); assert.equal(route.method, 'POST');
  assert.equal(route.originalBodyBase64, '');
});
test('funding selection never reinterprets same-origin GET checkpoint bytes as POST', OPT, () => {
  const f = fixture(); f.config.resourceUrl = FUNDING_URL;
  rejected(() => CREATE_POST(f.config)); assert.equal(f.reads, 0);
  const g = fixture(undefined, true); g.config.resourceUrl = URL;
  rejected(() => CREATE(g.config)); assert.equal(g.reads, 0);
});
test('funding POST refuses a nonempty original body before reading the V6 capability', OPT, () => {
  const f = fixture(value => { value.body = 'YQ=='; }, true);
  rejected(() => f.start()); assert.equal(f.reads, 0);
});
test('funding POST independently pinned context mismatch cannot enter the reader', OPT, () => {
  const f = fixture(undefined, true).start(), bad = copy(f.pins);
  bad.binding.contextId = 'foreign';
  rejected(() => f.client.captureChallenge({ paymentRequiredHeader: f.requiredHeader, expectedPins: bad }));
  assert.equal(f.reads, 0); assert.equal(f.client.snapshot().creationAttempts, 0);
  f.admit(); f.create(); assert.equal(f.reads, 2);
});
test('funding POST changed reader checkpoint stays HELD and close does not repair it', OPT, () => {
  const f = fixture(undefined, true).start();
  f.readImpl = () => { const changed = copy(f.checkpoint); changed.binding.contextId = 'foreign'; return changed; };
  rejected(f.admit); f.readImpl = null; rejected(f.admit);
  assert.equal(f.reads, 1); assert.equal(f.client.snapshot().phase, 'HELD');
  const result = f.client.close(); assert.equal(result.uncertain, true);
  assert.equal(result.storeClosed, false); rejected(f.create);
});
test('funding POST changed SDK nonce or resource cannot return replacement signed bytes', OPT, () => {
  for (const change of [p => { p.payload.transaction.nonce = '1111111111111111'; },
    p => { p.resource.url = URL; }, p => { p.accepted.amount = '2'; }]) {
    const f = fixture(undefined, true).start(); f.admit(); f.create();
    const changed = copy(f.payload); change(changed);
    rejected(() => f.client.selectOriginalPaymentHeader(encodeB64Json(changed), f.pins));
    assert.equal(f.reads, 2);
    assert.equal(f.client.selectOriginalPaymentHeader(f.sdkHeader(), f.pins), f.paymentHeader);
  }
});
test('funding method profile and configuration cannot be changed into a generic request capability', OPT, () => {
  const f = fixture(undefined, true).start(), selected = f.client.selection();
  assert.throws(() => { selected.requestProfile.method = 'GET'; }, TypeError);
  rejected(() => CREATE_POST({ ...f.config, method: 'GET' }));
  rejected(() => CREATE_POST({ ...f.config, requestImpl() { throw Error('UNUSED'); } }));
  rejected(() => POST_ROUTE({ toString() { throw Error('UNREAD'); } }));
  rejected(() => POST_ROUTE(FUNDING_URL, 'extra'));
  f.admit(); f.create();
  assert.equal(f.client.selection().requestProfile.method, 'POST');
  assert.equal(f.client.snapshot().transportCalls, 0);
});
test('legacy GET selection remains exactly the old two-field shape without a POST profile', OPT, () => {
  const f = fixture().start(), selected = f.client.selection();
  assert.deepEqual(Object.keys(selected), ['resourceUrl', 'requirement']);
  assert.equal(Object.hasOwn(selected, 'requestProfile'), false);
  f.admit(); f.create();
  assert.equal(f.client.selectOriginalPaymentHeader(f.sdkHeader(), f.pins), f.paymentHeader);
});

after(() => {
  verify();
  process.stdout.write('# checkpoint-original-post-v2-client-source ' + JSON.stringify({
    node: process.versions.node, platform: process.platform, arch: process.arch,
    sourceInputs: PINS.length, legacyGETCases: 24, fundingPOSTCases: 12,
    actualOfficialSdk: false, actualV6Store: false, namedOfficialV6PostFactoryImported: false,
    sql: 0, network: 0, keys: 0, signatures: 0, nonceSearch: 0, payments: 0,
  }) + '\n');
});
