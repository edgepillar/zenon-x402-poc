/*
 * Selected current-source checkpoint cases only. Fixed existing public bytes
 * and a literal zero-difficulty nonce; no nonce search, key generation,
 * signature, SQL, SDK, network, actual PREPARE or old test registration graph.
 * The reviewed managed caller pins this complete source graph before launch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  encodeZenonUnsignedOriginalQuoteCheckpoint as encodeCheckpoint,
  validateZenonUnsignedOriginalQuoteCheckpoint as readCheckpoint,
} from '../src/zenon/dynamic-plasma-unsigned-original-checkpoint.js';
import { BoundedDynamicPlasmaStrategy } from '../src/zenon/bounded-dynamic-plasma-strategy.js';
import { assembleZenonUnsignedUserSend } from '../src/zenon/dynamic-plasma-user-send-assembly.js';
import { computeZenonUnsignedUserSendHash } from '../src/zenon/transaction-planner.js';
import { paymentIntentDigest } from '../src/canonical.js';
import { snapshotDynamicPlasmaQuoteRequestContext } from '../src/zenon/dynamic-plasma-observation-normalizer.js';

assert.equal(process.argv.length, 2);
const OPTIONS = { timeout: 5000, concurrency: false };
const clone = value => JSON.parse(JSON.stringify(value)); // Owned valid fixture DATA only.
const ZERO = '0'.repeat(64), H = '33'.repeat(32), PREVIOUS = '66'.repeat(32);
const ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx';
const PUBLIC = Buffer.alloc(32, 7).toString('base64'); // Existing fixed public-byte DATA.
const OTHER_PUBLIC = Buffer.alloc(32, 9).toString('base64');
let encodes = 0, validations = 0, hooks = 0;
const encode = (...args) => { assert.ok(++encodes <= 64); return encodeCheckpoint(...args); };
const read = (...args) => { assert.ok(++validations <= 128); return readCheckpoint(...args); };
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
function rejected(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_unsigned_original_checkpoint_input_rejected');
  assert.equal(error.message, error.code); assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}
function address(core) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', words = [];
  let accumulator = 0, bits = 0, checksum = 1;
  for (const byte of core) {
    accumulator = (accumulator << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; words.push((accumulator >>> bits) & 31); }
  }
  assert.equal(bits, 0);
  for (const word of [3, 0, 26, ...words, 0, 0, 0, 0, 0, 0]) {
    const top = checksum >>> 25; checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [index, generator] of [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3].entries())
      if ((top >>> index) & 1) checksum ^= generator;
  }
  checksum = (checksum ^ 1) >>> 0;
  return 'z1' + words.map(word => alphabet[word]).join('')
    + Array.from({ length: 6 }, (_, index) => alphabet[(checksum >>> (5 * (5 - index))) & 31]).join('');
}
const keyDigest = createHash('sha3-256').update(Buffer.from(PUBLIC, 'base64')).digest();
const PAYER = address([0, ...keyDigest.subarray(0, 19)]);
const PAYEE = address([0, ...Array(19).fill(34)]);
function context() {
  const accepted = { scheme: 'exact', network: 'zenon:testnet', asset: ASSET, amount: '5', payTo: PAYEE,
    maxTimeoutSeconds: 60, extra: { poc: true, settlement: 'account-block', paymentFlow: 'upfront',
      zenonChain: { version: 1, chainIdentifier: '73404', genesisMomentumHash: '11'.repeat(32) } } };
  const paymentRequired = { x402Version: 2, resource: { url: 'https://resource.invalid/paid',
    description: 'Synthetic resource.', mimeType: 'application/json', tags: ['synthetic'] }, accepts: [clone(accepted)] };
  const subject = { subjectVersion: 1, version: 1, chainIdentifier: 73404, blockType: 2,
    previousHash: PREVIOUS, height: 7, momentumAcknowledged: { hash: H, height: 100 },
    address: PAYER, toAddress: PAYEE, amount: '5', tokenStandard: ASSET, fromBlockHash: ZERO,
    data: Buffer.from(paymentIntentDigest(paymentRequired, accepted), 'hex').toString('base64') };
  const compiledSporkIds = { dynamicPlasmaId: '02'.repeat(32), libp2pId: '01'.repeat(32) };
  const frontier = { chainIdentifier: '73404', height: 100, hash: H, version: 2,
    nextFusionPrice: 1000, nextWorkPrice: 1000 };
  const endpoint = { beforeFrontier: { ...frontier }, profileEvidence: { heightTwo: {
    chainIdentifier: '73404', height: 2, hash: '22'.repeat(32), previousHash: '11'.repeat(32), version: 1 } },
    sporks: { count: 2, list: [
      { id: compiledSporkIds.libp2pId, name: 'libp2p', activated: false, enforcementHeight: 0 },
      { id: compiledSporkIds.dynamicPlasmaId, name: 'dynamic-plasma', activated: true, enforcementHeight: 10 } ] },
    plasmaVariables: { MaxBasePlasmaInMomentum: 4200000, FusedPlasmaTarget: 1050000,
      PowPlasmaTarget: 1050000, MaxPriceChangePercent: 10, PriceChangeDenominator: 20 },
    rpcObservation: { availablePlasma: 30000, basePlasma: 21000, requiredDifficulty: 0, requiredFusedPlasma: 21000 },
    afterFrontier: { ...frontier } };
  const observation = { expectedChainProfile: clone(accepted.extra.zenonChain),
    compiledSporkIds: clone(compiledSporkIds), endpointObservations: [clone(endpoint), clone(endpoint)],
    requiredFusedObservationVersion: 1, quoteRequestContextVersion: 1, quoteRequestContext: null };
  observation.quoteRequestContext = snapshotDynamicPlasmaQuoteRequestContext({ requestContextVersion: 1,
    expectedChainProfile: observation.expectedChainProfile, compiledSporkIds,
    quoteRequest: { address: PAYER, blockType: 2, toAddress: PAYEE, data: subject.data } });
  return { phase: 'UNSIGNED', subject, paymentRequired, accepted, payerAddress: PAYER, compiledSporkIds, observation,
    policy: { policyVersion: 1, maxPriceChangePercent: 10, maxMomentumAdvances: 2,
      maxFusedPlasma: 30000, maxDifficulty: 0 }, runtimeContextDigest: 'sha256:' + 'b'.repeat(64) };
}
function advanced(original, age, price) {
  const current = clone(original);
  for (const endpoint of current.observation.endpointObservations) {
    for (const side of ['beforeFrontier', 'afterFrontier']) {
      Object.assign(endpoint[side], { height: 100 + age, hash: ['33', '44', '55', '66'][age].repeat(32),
        nextFusionPrice: price, nextWorkPrice: price });
    }
    endpoint.rpcObservation.requiredFusedPlasma = Math.ceil(21000 * price / 1000);
  }
  return current;
}
function frozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) frozen(child);
}
const originalContext = context();
const originalQuote = await new BoundedDynamicPlasmaStrategy().quoteUserSend(originalContext);
const assembly = await assembleZenonUnsignedUserSend(originalContext, originalQuote,
  { materialVersion: 1, publicKey: PUBLIC, nonce: '0102030405060708' });
assert.equal(assembly.accountBlock.difficulty, 0);
assert.equal(assembly.accountBlock.fusedPlasma, 25410);
const fixture = () => ({ context: clone(originalContext), quote: clone(originalQuote), block: clone(assembly.accountBlock) });
const checkpoint = f => canonical({ accountBlock: f.block, checkpointVersion: 1, phase: 'UNSIGNED', quote: f.quote });

test('original quote checkpoint roundtrips the same unsigned block and quote through the actual shared consumer', OPTIONS, async () => {
  const f = fixture(), text = await encode(f.context, f.quote, f.block);
  assert.equal(text, checkpoint(f)); assert.ok(Buffer.byteLength(text) <= 32768);
  const result = await read(f.context, text);
  assert.deepEqual(result.accountBlock, f.block); assert.deepEqual(result.quote, f.quote);
  assert.equal(result.validation.workBinding.work.validation, 'NOT_REQUIRED_BY_DECLARED_ZERO_DIFFICULTY');
});
test('original quote checkpoint has deterministic sorted encoding independent of caller key insertion order', OPTIONS, async () => {
  const f = fixture(), reversed = value => value === null || typeof value !== 'object' ? value
    : Object.fromEntries(Object.keys(value).reverse().map(key => [key, reversed(value[key])]));
  assert.equal(await encode(f.context, reversed(f.quote), reversed(f.block)), checkpoint(f));
});
test('original quote checkpoint retains the same block at both permitted post-work price frontiers', OPTIONS, async () => {
  const f = fixture(), text = await encode(f.context, f.quote, f.block);
  for (const [age, price] of [[1, 1100], [2, 1210]]) {
    const result = await read(advanced(f.context, age, price), text);
    assert.equal(result.accountBlock.hash, f.block.hash); assert.equal(result.accountBlock.nonce, f.block.nonce);
    assert.equal(result.accountBlock.momentumAcknowledged.height, 100); assert.deepEqual(result.quote, f.quote);
  }
});
test('original quote checkpoint refuses expiry without refreshing its quote block nonce or hash', OPTIONS, async () => {
  const f = fixture(), text = await encode(f.context, f.quote, f.block);
  await assert.rejects(read(advanced(f.context, 3, 1331), text), rejected);
  assert.equal(checkpoint(f), text);
});
test('original quote checkpoint refuses changed runtime p in the independent current observation', OPTIONS, async () => {
  const f = fixture(), current = advanced(f.context, 1, 1100);
  for (const endpoint of current.observation.endpointObservations) endpoint.plasmaVariables.MaxPriceChangePercent = 11;
  await assert.rejects(read(current, checkpoint(f)), rejected);
});
test('original quote checkpoint refuses a changed independently supplied runtime context digest', OPTIONS, async () => {
  const f = fixture(), current = clone(f.context); current.runtimeContextDigest = 'sha256:' + 'c'.repeat(64);
  await assert.rejects(read(current, checkpoint(f)), rejected);
});
test('original quote checkpoint cannot replace the independent original intent or account subject', OPTIONS, async () => {
  for (const edit of [c => { c.subject.amount = '6'; }, c => { c.subject.previousHash = '77'.repeat(32); },
    c => { c.paymentRequired.resource.url = 'https://resource.invalid/other'; }]) {
    const f = fixture(), current = clone(f.context); edit(current);
    await assert.rejects(read(current, checkpoint(f)), rejected);
  }
});
test('original quote checkpoint refuses a rehashed different transfer instead of accepting hash validity alone', OPTIONS, async () => {
  const f = fixture(); f.block.amount = '6'; f.block.hash = computeZenonUnsignedUserSendHash(f.block);
  await assert.rejects(read(f.context, checkpoint(f)), rejected);
  await assert.rejects(encode(f.context, f.quote, f.block), rejected);
});
test('original quote checkpoint rechecks public bytes not covered by the original account block hash', OPTIONS, async () => {
  const f = fixture(), hash = f.block.hash; f.block.publicKey = OTHER_PUBLIC;
  assert.equal(computeZenonUnsignedUserSendHash(f.block), hash);
  await assert.rejects(read(f.context, checkpoint(f)), rejected);
});
test('original quote checkpoint refuses signed metadata and an altered nonce or hash without repairing them', OPTIONS, async () => {
  for (const edit of [b => { b.signature = 'not-a-signature'; }, b => { b.nonce = '0000000000000000'; },
    b => { b.hash = ZERO; }]) {
    const f = fixture(); edit(f.block);
    await assert.rejects(read(f.context, checkpoint(f)), rejected);
  }
});
test('original quote checkpoint refuses a rehashed resource selection different from the original quote', OPTIONS, async () => {
  const f = fixture(); f.block.fusedPlasma--;
  f.block.hash = computeZenonUnsignedUserSendHash(f.block);
  await assert.rejects(read(f.context, checkpoint(f)), rejected);
});
test('original quote checkpoint rechecks the complete original quote instead of trusting its version or digest labels', OPTIONS, async () => {
  const f = fixture(); f.quote.sourceQuote.pricePolicyQuote.policy.maxMomentumAdvances = 3;
  await assert.rejects(read(f.context, checkpoint(f)), rejected);
});
test('original quote checkpoint refuses noncanonical ambiguous oversized or foreign-version wire encodings', OPTIONS, async () => {
  const f = fixture(), text = checkpoint(f), value = JSON.parse(text);
  const extra = { ...value, authority: 'APPROVED' }, missing = { ...value }; delete missing.quote;
  for (const bad of [text + '\n', ' ' + text, JSON.stringify(value, null, 2),
    text.replace('"checkpointVersion":1', '"checkpointVersion":1,"checkpointVersion":1'),
    canonical({ ...value, checkpointVersion: 2 }), canonical({ ...value, phase: 'SIGNED' }),
    canonical(extra), canonical(missing), 'null', '[]', '{}', '', '"' + 'x'.repeat(32769) + '"',
    JSON.stringify('\ud83d\ude00'.repeat(11000)), { toString() { hooks++; throw Error('PRIVATE'); } }]) {
    await assert.rejects(read(f.context, bad), rejected);
  }
  assert.equal(hooks, 0);
});
test('original quote checkpoint refuses getters proxies coercion toJSON and cyclic or decorated data without hooks', OPTIONS, async () => {
  const hook = () => { hooks++; throw Error('PRIVATE'); };
  const f = fixture(), getter = clone(f.block), nested = clone(f.block), quote = clone(f.quote);
  Object.defineProperty(getter, 'hash', { enumerable: true, get: hook });
  Object.defineProperty(nested.momentumAcknowledged, 'height', { enumerable: true, get: hook });
  Object.defineProperty(quote, 'sourceQuote', { enumerable: true, get: hook });
  const proxy = new Proxy(f.block, { get: hook, ownKeys: hook, getPrototypeOf: hook });
  const cycle = clone(f.block); cycle.cycle = cycle;
  for (const bad of [getter, nested, proxy, cycle, { ...f.block, toJSON: hook },
    { ...f.block, nonce: { toString: hook } }, { ...f.block, ['x'.repeat(8193)]: 0 },
    { ...f.block, extra: 'x'.repeat(8193) }, Object.assign(Object.create(null), f.block),
    Object.assign(clone(f.block), { [Symbol('extra')]: true })]) {
    await assert.rejects(encode(f.context, f.quote, bad), rejected);
  }
  await assert.rejects(encode(f.context, quote, f.block), rejected);
  const current = clone(f.context); Object.defineProperty(current, 'subject', { enumerable: true, get: hook });
  await assert.rejects(read(current, checkpoint(f)), rejected); assert.equal(hooks, 0);
});
test('original quote checkpoint detaches all selected input data synchronously before awaiting validation', OPTIONS, async () => {
  const f = fixture(), before = checkpoint(f), expectedContext = clone(f.context);
  const pending = encode(f.context, f.quote, f.block);
  assert.equal(Object.getPrototypeOf(pending), Promise.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(pending, 'constructor').value, Promise);
  f.block.amount = '6'; f.block.momentumAcknowledged.height = 999;
  f.quote.sourceQuote.pricePolicyQuote.policy.maxMomentumAdvances = 0;
  f.context.subject.amount = '6'; f.context.observation.endpointObservations[0].beforeFrontier.height = 999;
  assert.equal(await pending, before);
  const result = await read(expectedContext, before);
  assert.equal(result.accountBlock.amount, '5'); assert.equal(result.accountBlock.momentumAcknowledged.height, 100);
  assert.equal(Object.isFrozen(f.block), false); assert.equal(Object.isFrozen(f.quote), false);
});
test('original quote checkpoint returns powerless frozen data and cause-free exact-arity refusals within a finite budget', OPTIONS, async t => {
  const f = fixture(), result = await read(f.context, checkpoint(f));
  assert.equal(Object.getPrototypeOf(result), null); frozen(result);
  assert.equal(result.authority, 'NONE'); assert.equal(result.afterSigningAction, 'NONE');
  assert.equal(result.signingAuthorization, 'NOT_ESTABLISHED'); assert.equal(result.persistence, 'NOT_PERFORMED');
  assert.equal(result.chainAuthentication, 'NOT_ESTABLISHED'); assert.equal(result.currentAccountAndBalance, 'NOT_CHECKED');
  assert.equal(result.validation.keyPossession, 'NOT_ESTABLISHED');
  assert.equal(result.validation.signatureValidation, 'NOT_PERFORMED');
  for (const args of [[], [f.context], [f.context, f.quote], [f.context, f.quote, f.block, null]])
    await assert.rejects(encode(...args), rejected);
  for (const args of [[], [f.context], [f.context, checkpoint(f), null]])
    await assert.rejects(read(...args), rejected);
  assert.ok(encodes <= 64 && validations <= 128); assert.equal(hooks, 0);
  t.diagnostic(JSON.stringify({ kind: 'P1A_UNSIGNED_ORIGINAL_QUOTE_CHECKPOINT', encodes, validations,
    hooks, candidateSearchCalls: 0, candidateEvaluations: 0, keyGeneration: 0, signatures: 0,
    persistentWrites: 0, originalQuoteAndBlockPreserved: true,
    qualification: 'DECLARED_FIXED_DATA_ONLY_NOT_LIVE_DP' }));
});
