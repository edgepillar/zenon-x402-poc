/* Selected pure DATA cases, not a wallet/signature/SDK/custody experiment.
 * Fixed public bytes, literal nonce, zero difficulty and deliberately INVALID
 * signature-shaped bytes. No private key, signature operation or nonce search.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createZenonDynamicPlasmaSignedOriginalHandoff as createHandoff } from '../src/zenon/dynamic-plasma-signed-original-handoff.js';
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
const PUBLIC = Buffer.alloc(32, 7).toString('base64');
const SIGNATURE = Buffer.alloc(64, 42).toString('base64'); // NOT a cryptographic signature.
let captures = 0, accepts = 0, hooks = 0;
const capture = (...args) => { assert.ok(++captures <= 96); return createHandoff(...args); };
const accept = (handoff, ...args) => { assert.ok(++accepts <= 128); return handoff.acceptSigned(...args); };
function rejected(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_dynamic_plasma_signed_original_handoff_rejected');
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
const digest = createHash('sha3-256').update(Buffer.from(PUBLIC, 'base64')).digest();
const PAYER = address([0, ...digest.subarray(0, 19)]);
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
const candidate = f => ({ ...clone(f.block), signature: SIGNATURE });
const owned = f => capture(f.context, f.quote, f.block);

test('signed original handoff preserves every original field and only attaches signature-shaped DATA', OPTIONS, async () => {
  const f = fixture(), before = clone(f), handoff = await owned(f);
  const result = await accept(handoff, candidate(f), clone(f.context));
  assert.deepEqual(result.accountBlock, candidate(f));
  assert.deepEqual(result.originalUnsignedBlock, f.block); assert.deepEqual(result.originalQuote, f.quote);
  assert.equal(result.fieldPreservation, 'ALL_ORIGINAL_FIELDS_EXCEPT_SIGNATURE_MATCH');
  assert.equal(result.signatureValidation, 'NOT_PERFORMED'); assert.equal(result.persistence, 'NOT_PERFORMED');
  assert.equal(result.authority, 'NONE'); assert.deepEqual(f, before); frozen(handoff); frozen(result);
});
test('signed original handoff revalidates the same hash nonce and ACK at both allowed later price frontiers', OPTIONS, async () => {
  for (const [age, price] of [[1, 1100], [2, 1210]]) {
    const f = fixture(), result = await accept(await owned(f), candidate(f), advanced(f.context, age, price));
    assert.equal(result.accountBlock.hash, f.block.hash); assert.equal(result.accountBlock.nonce, f.block.nonce);
    assert.deepEqual(result.accountBlock.momentumAcknowledged, f.block.momentumAcknowledged);
    assert.deepEqual(result.originalQuote, f.quote);
  }
});
test('signed original handoff rejects expiry without refresh replacement or a second candidate', OPTIONS, async () => {
  const f = fixture(), handoff = await owned(f), signed = candidate(f), before = clone(signed);
  await assert.rejects(accept(handoff, signed, advanced(f.context, 3, 1331)), rejected);
  await assert.rejects(accept(handoff, signed, f.context), rejected);
  assert.deepEqual(signed, before); assert.deepEqual(handoff.originalUnsignedBlock, f.block);
});
test('signed original handoff rechecks runtime p context and independently selected intent', OPTIONS, async () => {
  for (const edit of [c => { for (const e of c.observation.endpointObservations) e.plasmaVariables.MaxPriceChangePercent = 11; },
    c => { c.runtimeContextDigest = 'sha256:' + 'c'.repeat(64); }, c => { c.subject.amount = '6'; },
    c => { c.paymentRequired.resource.url = 'https://resource.invalid/other'; }]) {
    const f = fixture(), current = advanced(f.context, 1, 1100); edit(current);
    await assert.rejects(accept(await owned(f), candidate(f), current), rejected);
  }
});
test('signed original handoff rejects mutation of each scalar field and both nested ACK fields', OPTIONS, async () => {
  const edits = { version: 2, chainIdentifier: 73405, blockType: 3, hash: ZERO, previousHash: ZERO, height: 8,
    address: PAYEE, toAddress: PAYER, amount: '6', tokenStandard: 'zts1qsrxxxxxxxxxxxxxmrhjll', fromBlockHash: H,
    data: '', fusedPlasma: 25409, difficulty: 1, nonce: '0000000000000000',
    publicKey: Buffer.alloc(32, 9).toString('base64') };
  for (const [field, value] of Object.entries(edits)) {
    const f = fixture(), signed = candidate(f); signed[field] = value;
    await assert.rejects(accept(await owned(f), signed, f.context), rejected);
  }
  for (const [field, value] of [['height', 101], ['hash', ZERO]]) {
    const f = fixture(), signed = candidate(f); signed.momentumAcknowledged[field] = value;
    await assert.rejects(accept(await owned(f), signed, f.context), rejected);
  }
});
test('signed original handoff rejects changed public bytes even when the block hash is unchanged', OPTIONS, async () => {
  const f = fixture(), signed = candidate(f), projection = clone(f.block);
  signed.publicKey = projection.publicKey = Buffer.alloc(32, 9).toString('base64');
  assert.equal(computeZenonUnsignedUserSendHash(projection), f.block.hash);
  await assert.rejects(accept(await owned(f), signed, f.context), rejected);
});
test('signed original handoff rejects a coherently rehashed replacement rather than accepting hash validity alone', OPTIONS, async () => {
  for (const edit of [b => { b.amount = '6'; }, b => { b.nonce = '0807060504030201'; },
    b => { b.fusedPlasma--; }]) {
    const f = fixture(), replacement = clone(f.block); edit(replacement);
    replacement.hash = computeZenonUnsignedUserSendHash(replacement);
    await assert.rejects(accept(await owned(f), { ...replacement, signature: SIGNATURE }, f.context), rejected);
  }
});
test('signed original handoff refuses empty noncanonical oversized and nonstring signature fields', OPTIONS, async () => {
  const hook = () => { hooks++; throw Error('PRIVATE'); };
  for (const signature of ['', SIGNATURE.slice(0, -1), SIGNATURE + '\n', 'A'.repeat(89),
    SIGNATURE.slice(0, -3) + 'p==', Buffer.alloc(63).toString('base64'), null, { toString: hook }]) {
    const f = fixture(); await assert.rejects(accept(await owned(f), { ...candidate(f), signature }, f.context), rejected);
  }
  assert.equal(hooks, 0);
});
test('signed original handoff refuses extra missing symbol and exotic candidate fields', OPTIONS, async () => {
  const f = fixture(), missing = candidate(f); delete missing.publicKey;
  for (const bad of [{ ...candidate(f), extra: true }, missing, { ...candidate(f), [Symbol('extra')]: true },
    Object.assign(Object.create(null), candidate(f)), [], null]) {
    await assert.rejects(accept(await owned(f), bad, f.context), rejected);
  }
});
test('signed original handoff refuses candidate getters nested getters and proxies without invoking hooks', OPTIONS, async () => {
  const f = fixture(), hook = () => { hooks++; throw Error('PRIVATE'); };
  const getter = candidate(f), nested = candidate(f), signature = candidate(f);
  Object.defineProperty(getter, 'hash', { enumerable: true, get: hook });
  Object.defineProperty(nested.momentumAcknowledged, 'height', { enumerable: true, get: hook });
  Object.defineProperty(signature, 'signature', { enumerable: true, get: hook });
  const proxy = new Proxy(candidate(f), { get: hook, getPrototypeOf: hook, ownKeys: hook });
  for (const bad of [getter, nested, signature, proxy]) await assert.rejects(accept(await owned(f), bad, f.context), rejected);
  assert.equal(hooks, 0);
});
test('signed original handoff refuses original quote block and context hooks before returning a facade', OPTIONS, async () => {
  const hook = () => { hooks++; throw Error('PRIVATE'); };
  for (const field of ['block', 'quote', 'context']) {
    const f = fixture(), key = field === 'block' ? 'hash' : field === 'quote' ? 'sourceQuote' : 'subject';
    Object.defineProperty(f[field], key, { enumerable: true, get: hook });
    await assert.rejects(owned(f), rejected);
  }
  const f = fixture(); f.quote = new Proxy(f.quote, { get: hook, getPrototypeOf: hook, ownKeys: hook });
  await assert.rejects(owned(f), rejected); assert.equal(hooks, 0);
});
test('signed original handoff rejects an already signed or invalid original without producing a facade', OPTIONS, async () => {
  for (const edit of [b => { b.signature = SIGNATURE; }, b => { b.hash = ZERO; }, b => { b.publicKey = ''; }]) {
    const f = fixture(); edit(f.block); await assert.rejects(owned(f), rejected);
  }
});
test('signed original handoff captures original block quote and context before its first await', OPTIONS, async () => {
  const f = fixture(), expected = clone(f), pending = owned(f);
  f.block.amount = '6'; f.block.momentumAcknowledged.height = 999;
  f.quote.sourceQuote.pricePolicyQuote.policy.maxMomentumAdvances = 0;
  f.context.subject.amount = '6';
  const handoff = await pending;
  assert.deepEqual(handoff.originalUnsignedBlock, expected.block);
  const result = await accept(handoff, candidate(expected), expected.context);
  assert.deepEqual(result.originalQuote, expected.quote);
});
test('signed original handoff captures signed candidate and current context before its first await', OPTIONS, async () => {
  const f = fixture(), handoff = await owned(f), signed = candidate(f), current = advanced(f.context, 1, 1100);
  const expected = clone(signed), pending = accept(handoff, signed, current);
  signed.amount = '6'; signed.signature = ''; signed.momentumAcknowledged.height = 999;
  current.subject.amount = '6'; current.observation.endpointObservations[0].beforeFrontier.height = 999;
  const result = await pending; assert.deepEqual(result.accountBlock, expected);
});
test('signed original handoff admits only one candidate even during concurrent current-context validation', OPTIONS, async () => {
  const f = fixture(), handoff = await owned(f), first = accept(handoff, candidate(f), f.context);
  const second = accept(handoff, candidate(f), f.context);
  await assert.rejects(second, rejected); assert.deepEqual((await first).accountBlock, candidate(f));
  await assert.rejects(accept(handoff, candidate(f), f.context), rejected);
});
test('signed original handoff consumes a malformed acceptance attempt and sanitizes the terminal error', OPTIONS, async () => {
  const f = fixture(), handoff = await owned(f);
  await assert.rejects(accept(handoff, { private: 'DO_NOT_DISCLOSE' }, f.context), rejected);
  await assert.rejects(accept(handoff, candidate(f), f.context), rejected);
  assert.deepEqual(handoff.originalUnsignedBlock, f.block);
});
test('signed original handoff enforces exact arity without inspecting extra or missing values', OPTIONS, async () => {
  const f = fixture(); await assert.rejects(capture(f.context, f.quote), rejected);
  await assert.rejects(capture(f.context, f.quote, f.block, true), rejected);
  await assert.rejects(accept(await owned(f), candidate(f)), rejected);
  await assert.rejects(accept(await owned(f), candidate(f), f.context, true), rejected);
});
test('signed original handoff retains native Promise and frozen detached DATA contracts', OPTIONS, async () => {
  const f = fixture(), pending = owned(f);
  assert.equal(Object.getPrototypeOf(pending), Promise.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(pending, 'constructor').value, Promise);
  const handoff = await pending, signed = candidate(f), resultPending = accept(handoff, signed, f.context);
  assert.equal(Object.getPrototypeOf(resultPending), Promise.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(resultPending, 'constructor').value, Promise);
  const result = await resultPending; frozen(result); assert.notEqual(result.accountBlock, signed);
  assert.equal(hooks, 0); assert.ok(captures <= 96); assert.ok(accepts <= 128);
});
