// Current SDK/SQL/network-free component cases. No V6 database or official SDK
// is imported. Synthetic checkpoints use hashes only, never keys/signatures.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createOriginalPaymentCheckpointClient as CREATE } from '../src/x402-original-payment-checkpoint-client.js';
import {
  captureOriginalPaymentCheckpoint, encodeOriginalPaymentCheckpoint,
} from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { encodeB64Json } from '../src/x402-wire.js';

assert.equal(process.versions.node, '24.19.0');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PINS = JSON.parse(process.env.X402_CHECKPOINT_CLIENT_SOURCE_PINS);
const names = [
  'package.json', 'src/x402-original-payment-checkpoint-client.js', 'src/canonical.js',
  'src/service-credit-pilot-original-payment-checkpoint.js', 'src/x402-wire.js',
  'src/x402-official-https-request-binding.js',
  'qualification/x402-original-payment-checkpoint-client.behavior.draft.mjs',
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
const URL = 'https://checkpoint.invalid/paid';
const rejected = fn => assert.throws(fn, TypeError);
function fixture(mutate = () => {}) {
  const requirement = { scheme: 'exact', network: 'zenon:mock', asset: 'zts1declaredasset',
    amount: '1', payTo: 'z1declaredrecipient', maxTimeoutSeconds: 60,
    extra: { paymentFlow: 'upfront', poc: true, settlement: 'account-block',
      zenonChain: { version: 1, chainIdentifier: String(Number.MAX_SAFE_INTEGER),
        genesisMomentumHash: '0'.repeat(64) } } };
  const required = { x402Version: 2, resource: { url: URL,
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
  f.config = { resourceUrl: URL, serializedCheckpoint: encodeOriginalPaymentCheckpoint(f.checkpoint),
    expectedPins: copy(f.pins), readOriginalPaymentCheckpoint(pins) {
      f.reads++; assert.deepEqual(pins, f.pins); assert.ok(Object.isFrozen(pins));
      return f.readImpl === null ? f.checkpoint : f.readImpl(pins);
    } };
  f.start = () => { f.client = CREATE(f.config); return f; };
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
after(() => {
  verify();
  process.stdout.write('# checkpoint-original-client-source ' + JSON.stringify({
    node: process.versions.node, platform: process.platform, arch: process.arch,
    sourceInputs: PINS.length, actualOfficialSdk: false, actualV6Store: false,
    sql: 0, network: 0, keys: 0, signatures: 0, nonceSearch: 0, payments: 0,
  }) + '\n');
});

