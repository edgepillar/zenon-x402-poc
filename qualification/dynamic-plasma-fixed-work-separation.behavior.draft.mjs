/*
 * Ten selected current-source cases for fixed-work separation and legacy API
 * compatibility. All nonces below are preselected literal DATA. No candidate
 * search module or historical qualification entry is imported or evaluated.
 * The reviewed caller must guard the complete source/identity graph first.
 * No SDK, key generation, signatures, SQL, network, actual PREPARE or live DP.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { validateZenonUnsignedUserSendWork as fixedWork } from '../src/zenon/dynamic-plasma-user-send-fixed-work.js';
import * as legacy from '../src/zenon/dynamic-plasma-user-send-work-binding.js';
import { computeZenonUnsignedUserSendHash as hashBlock } from '../src/zenon/transaction-planner.js';
import { BoundedDynamicPlasmaStrategy } from '../src/zenon/bounded-dynamic-plasma-strategy.js';
import { paymentIntentDigest } from '../src/canonical.js';
import { snapshotDynamicPlasmaQuoteRequestContext } from '../src/zenon/dynamic-plasma-observation-normalizer.js';

assert.equal(process.argv.length, 2);
const clone = value => JSON.parse(JSON.stringify(value)); // Owned valid synthetic DATA.
const ZERO = '0'.repeat(64), H = '33'.repeat(32), PREVIOUS = '66'.repeat(32);
const ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx', RANGE = 1n << 64n;
const NONCES = ['0000000000000000', '0102030405060708', 'ffffffffffffffff'];
let fixedCalls = 0, referenceChecks = 0, legacyCalls = 0;
function address(byte) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', words = [];
  let accumulator = 0, bits = 0, checksum = 1;
  for (const value of [0, ...Array(19).fill(byte)]) {
    accumulator = (accumulator << 8) | value; bits += 8;
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
const A = address(17), B = address(34);
function block(difficulty = 0, nonce = NONCES[0]) {
  const value = { version: 1, chainIdentifier: 73404, blockType: 2,
    hash: ZERO, previousHash: PREVIOUS, height: 7,
    momentumAcknowledged: { hash: H, height: 100 }, address: A, toAddress: B,
    amount: '5', tokenStandard: ASSET, fromBlockHash: ZERO,
    data: Buffer.alloc(32, 9).toString('base64'), fusedPlasma: 25410,
    difficulty, nonce, publicKey: '', signature: '' };
  value.hash = hashBlock(value); return value;
}
function checked(value) {
  assert.ok(++fixedCalls <= 100);
  return fixedWork(value);
}
function rejected(error) {
  assert.equal(error instanceof TypeError, true); assert.equal(Object.isFrozen(error), true);
  assert.equal(error.code, 'zenon_user_send_work_input_rejected');
  assert.equal(error.message, error.code); assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.hasOwn(error, 'cause'), false); return true;
}
function frozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) frozen(child);
}
function noAuthority(value) {
  assert.equal(value.authority, 'NONE'); assert.equal(value.afterSigningAction, 'NONE');
  assert.equal(value.keyAddressBinding, 'NOT_PERFORMED');
  assert.equal(value.chainAuthentication, 'NOT_ESTABLISHED');
  assert.equal(value.hashBinding.workValidation, 'NOT_PERFORMED');
}
function oracle(value) {
  assert.ok(++referenceChecks <= 15);
  // Known synthetic address core, not a production decoder or searched seed.
  const preimage = Buffer.concat([Buffer.from([0, ...Array(19).fill(17)]), Buffer.from(PREVIOUS, 'hex')]);
  assert.equal(preimage.length, 52);
  const dataHash = createHash('sha3-256').update(preimage).digest();
  const digest = createHash('sha3-256').update(Buffer.concat([Buffer.from(value.nonce, 'hex'), dataHash])).digest();
  let number = 0n;
  for (let i = 7; i >= 0; i--) number = (number << 8n) | BigInt(digest[i]);
  const threshold = RANGE - RANGE / BigInt(value.difficulty);
  return { accepted: number >= threshold, dataHash: dataHash.toString('hex'),
    nonceDigest: digest.toString('hex'), value: number.toString(), threshold: threshold.toString() };
}
test('fixed-work separation preserves zero-difficulty semantics for all three supplied literal nonces', { timeout: 5000 }, () => {
  for (const nonce of NONCES) {
    const value = block(0, nonce), result = checked(value);
    assert.equal(result.work.validation, 'NOT_REQUIRED_BY_DECLARED_ZERO_DIFFICULTY');
    for (const key of ['dataHash', 'nonceDigest', 'value', 'threshold']) assert.equal(result.work[key], null);
    assert.equal(result.hashBinding.accountBlock.nonce, nonce); noAuthority(result); frozen(result);
  }
});
test('fixed-work separation validates supplied difficulty-one nonces without searching or replacing them', { timeout: 5000 }, () => {
  for (const nonce of NONCES) {
    const value = block(1, nonce), before = JSON.stringify(value), result = checked(value);
    assert.equal(result.work.validation, 'MATCHES_DECLARED_DIFFICULTY');
    assert.equal(result.work.threshold, '0'); assert.equal(result.hashBinding.accountBlock.nonce, nonce);
    assert.equal(JSON.stringify(value), before); assert.equal(Object.isFrozen(value), false); noAuthority(result);
  }
});
test('fixed-work separation agrees with fifteen independent fixed-nonce LE64 predicates', { timeout: 5000 }, () => {
  for (const difficulty of [1, 2, 3, 1500, Number.MAX_SAFE_INTEGER]) {
    for (const nonce of NONCES) {
      const value = block(difficulty, nonce), expected = oracle(value);
      if (!expected.accepted) assert.throws(() => checked(value), rejected);
      else {
        const actual = checked(value).work;
        for (const key of ['dataHash', 'nonceDigest', 'value', 'threshold']) assert.equal(actual[key], expected[key]);
        assert.equal(actual.difficulty, difficulty); assert.equal(actual.validation, 'MATCHES_DECLARED_DIFFICULTY');
      }
    }
  }
  assert.equal(referenceChecks, 15);
});
test('fixed-work separation still rejects wrong hashes signed metadata and unsafe field domains', { timeout: 5000 }, () => {
  const base = block(1);
  for (const change of [{ hash: ZERO }, { signature: 'not-a-signature' }, { nonce: 'ABCDEF0123456789' },
    { difficulty: -1 }, { difficulty: -0 }, { difficulty: Number.MAX_SAFE_INTEGER + 1 },
    { difficulty: 1.5 }, { fusedPlasma: -1 }, { amount: '06' }, { privateKey: 'not-a-key' }]) {
    assert.throws(() => checked({ ...base, ...change }), rejected);
  }
});
test('fixed-work separation rejects getters proxies and coercion without invoking hooks', { timeout: 5000 }, () => {
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE'); };
  const base = block(1), top = clone(base), nested = clone(base);
  Object.defineProperty(top, 'difficulty', { enumerable: true, get: hook });
  Object.defineProperty(nested.momentumAcknowledged, 'height', { enumerable: true, get: hook });
  for (const value of [top, nested, new Proxy(base, { get: hook, ownKeys: hook, getPrototypeOf: hook }),
    { ...base, nonce: { toString: hook, [Symbol.toPrimitive]: hook } }]) {
    assert.throws(() => checked(value), rejected);
  }
  assert.equal(hooks, 0);
});
test('fixed-work separation returns detached frozen receipts without freezing or mutating caller data', { timeout: 5000 }, () => {
  const value = block(1), before = clone(value), result = checked(value);
  assert.deepEqual(value, before); frozen(result);
  assert.equal(Object.isFrozen(value), false); assert.equal(Object.isFrozen(value.momentumAcknowledged), false);
  value.amount = '6'; value.momentumAcknowledged.height = 101;
  assert.equal(result.hashBinding.accountBlock.amount, '5');
  assert.equal(result.hashBinding.accountBlock.momentumAcknowledged.height, 100);
});
test('fixed-work separation does not promote shared payer-frontier work to full payment or key authority', { timeout: 5000 }, () => {
  const first = block(1), other = { ...first, amount: '6', publicKey: Buffer.alloc(32, 7).toString('base64') };
  other.hash = hashBlock(other);
  const a = checked(first), b = checked(other);
  assert.deepEqual(a.work, b.work); assert.notEqual(a.hashBinding.computedHash, b.hashBinding.computedHash);
  assert.notEqual(a.hashBinding.fieldDigest, b.hashBinding.fieldDigest);
  for (const result of [a, b]) noAuthority(result);
});
test('fixed-work separation preserves exact-arity cause-free errors and a finite non-search check budget', { timeout: 5000 }, () => {
  const value = block(1);
  assert.throws(() => fixedWork(), rejected); assert.throws(() => fixedWork(value, null), rejected);
  assert.throws(() => checked(null), rejected); assert.throws(() => checked([]), rejected);
  assert.ok(fixedCalls > 0 && fixedCalls <= 100); assert.equal(referenceChecks, 15);
});

function context() {
  const accepted = { scheme: 'exact', network: 'zenon:testnet', asset: ASSET, amount: '5',
    payTo: B, maxTimeoutSeconds: 60, extra: { poc: true, settlement: 'account-block', paymentFlow: 'upfront',
      zenonChain: { version: 1, chainIdentifier: '73404', genesisMomentumHash: '11'.repeat(32) } } };
  const paymentRequired = { x402Version: 2,
    resource: { url: 'https://resource.invalid/paid', description: 'Synthetic resource.', mimeType: 'application/json', tags: ['synthetic'] },
    accepts: [clone(accepted)] };
  const subject = { subjectVersion: 1, version: 1, chainIdentifier: 73404, blockType: 2,
    previousHash: PREVIOUS, height: 7, momentumAcknowledged: { hash: H, height: 100 },
    address: A, toAddress: B, amount: '5', tokenStandard: ASSET, fromBlockHash: ZERO,
    data: Buffer.from(paymentIntentDigest(paymentRequired, accepted), 'hex').toString('base64') };
  const compiledSporkIds = { dynamicPlasmaId: '02'.repeat(32), libp2pId: '01'.repeat(32) };
  const frontier = { chainIdentifier: '73404', height: 100, hash: H, version: 2, nextFusionPrice: 1000, nextWorkPrice: 1000 };
  const endpoint = { beforeFrontier: { ...frontier },
    profileEvidence: { heightTwo: { chainIdentifier: '73404', height: 2, hash: '22'.repeat(32), previousHash: '11'.repeat(32), version: 1 } },
    sporks: { count: 2, list: [
      { id: compiledSporkIds.libp2pId, name: 'libp2p', activated: false, enforcementHeight: 0 },
      { id: compiledSporkIds.dynamicPlasmaId, name: 'dynamic-plasma', activated: true, enforcementHeight: 10 } ] },
    plasmaVariables: { MaxBasePlasmaInMomentum: 4200000, FusedPlasmaTarget: 1050000, PowPlasmaTarget: 1050000,
      MaxPriceChangePercent: 10, PriceChangeDenominator: 20 },
    rpcObservation: { availablePlasma: 30000, basePlasma: 21000, requiredDifficulty: 0, requiredFusedPlasma: 21000 },
    afterFrontier: { ...frontier } };
  const observation = { expectedChainProfile: clone(accepted.extra.zenonChain),
    compiledSporkIds: clone(compiledSporkIds), endpointObservations: [clone(endpoint), clone(endpoint)],
    requiredFusedObservationVersion: 1, quoteRequestContextVersion: 1, quoteRequestContext: null };
  observation.quoteRequestContext = snapshotDynamicPlasmaQuoteRequestContext({
    requestContextVersion: 1, expectedChainProfile: observation.expectedChainProfile, compiledSporkIds,
    quoteRequest: { address: A, blockType: 2, toAddress: B, data: subject.data } });
  return { phase: 'UNSIGNED', subject, paymentRequired, accepted, payerAddress: A, compiledSporkIds, observation,
    policy: { policyVersion: 1, maxPriceChangePercent: 10, maxMomentumAdvances: 2, maxFusedPlasma: 30000, maxDifficulty: 0 },
    runtimeContextDigest: 'sha256:' + 'b'.repeat(64) };
}
test('fixed-work separation preserves the exact legacy validation function and public export surface', { timeout: 5000 }, () => {
  assert.equal(legacy.validateZenonUnsignedUserSendWork, fixedWork);
  assert.deepEqual(Object.keys(legacy).sort(), ['bindZenonUnsignedUserSendWork', 'validateZenonUnsignedUserSendWork']);
  const value = block(1);
  assert.deepEqual(legacy.validateZenonUnsignedUserSendWork(value), fixedWork(value));
  assert.throws(() => legacy.validateZenonUnsignedUserSendWork(value, null), rejected);
});
test('fixed-work separation retains original-quote async binding and rejects altered or expired declared state', { timeout: 5000 }, async t => {
  const strategy = new BoundedDynamicPlasmaStrategy(), ctx = context();
  const quote = await strategy.quoteUserSend(ctx), quoteBefore = JSON.stringify(quote);
  const draft = await strategy.createUnsignedUserSendDraft(ctx, quote), candidate = { ...draft.accountBlock };
  candidate.hash = hashBlock(candidate);
  const before = JSON.stringify(candidate);
  const pending = legacy.bindZenonUnsignedUserSendWork(ctx, quote, candidate); legacyCalls++;
  candidate.amount = '6'; // The captured price binder snapshotted before its await.
  const result = await pending;
  assert.equal(JSON.stringify(result.hashPriceBinding.accountBlock), before);
  assert.deepEqual(result.work, fixedWork(result.hashPriceBinding.accountBlock).work); frozen(result);
  assert.equal(result.hashPriceBinding.selection.fusedPlasma, 25410);
  assert.equal(result.hashPriceBinding.selection.difficulty, 0);
  const changed = { ...result.hashPriceBinding.accountBlock, fusedPlasma: 25409 };
  changed.hash = hashBlock(changed); legacyCalls++;
  await assert.rejects(legacy.bindZenonUnsignedUserSendWork(ctx, quote, changed), rejected);
  const expired = clone(ctx);
  for (const endpoint of expired.observation.endpointObservations) {
    for (const side of ['beforeFrontier', 'afterFrontier']) {
      endpoint[side].height = 103; endpoint[side].hash = '44'.repeat(32);
    }
  }
  legacyCalls++;
  await assert.rejects(legacy.bindZenonUnsignedUserSendWork(expired, quote, result.hashPriceBinding.accountBlock), rejected);
  assert.equal(JSON.stringify(quote), quoteBefore); assert.equal(legacyCalls, 3);
  t.diagnostic(JSON.stringify({ kind: 'P1A_FIXED_WORK_SEPARATION', guardedDirectCalls: fixedCalls,
    referenceChecks, legacyAsyncCalls: legacyCalls, candidateSearchCalls: 0, signatures: 0,
    originalQuotePreserved: true, qualification: 'DECLARED_DATA_ONLY_NOT_LIVE_DP' }));
});
