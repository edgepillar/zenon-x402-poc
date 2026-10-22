/*
 * Six isolated observed-original checkpoint integration cases. Reuse only
 * selected fixed fixture declarations, never the old test entry. Existing
 * public bytes and literal zero-difficulty nonces only. No search, keys,
 * signatures, SDK, SQL, network, actual PREPARE or live/runtime qualification.
 * The reviewed managed caller pins the exact source closure before launch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  encodeObservedZenonUnsignedOriginalQuoteCheckpoint as encodeObserved,
  validateObservedZenonUnsignedOriginalQuoteCheckpoint as validateObserved,
} from '../src/zenon/dynamic-plasma-observed-original-checkpoint.js';
import {
  encodeZenonUnsignedOriginalQuoteCheckpoint as encodeCodec,
  validateZenonUnsignedOriginalQuoteCheckpoint as validateCodec,
} from '../src/zenon/dynamic-plasma-unsigned-original-checkpoint.js';
import { ObservedDynamicPlasmaUserSendAdapter } from '../src/zenon/dynamic-plasma-observed-user-send-adapter.js';
import { computeZenonUnsignedUserSendHash } from '../src/zenon/transaction-planner.js';
import { paymentIntentDigest } from '../src/canonical.js';
import { snapshotDynamicPlasmaQuoteRequestContext } from '../src/zenon/dynamic-plasma-observation-normalizer.js';

assert.equal(process.argv.length, 2);
const OPTIONS = { timeout: 5000, concurrency: false };
const clone = value => JSON.parse(JSON.stringify(value)); // Owned valid fixture DATA.
const ZERO = '0'.repeat(64), H = '33'.repeat(32), PREVIOUS = '66'.repeat(32);
const ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx';
const PUBLIC = Buffer.alloc(32, 7).toString('base64'); // Existing public-byte DATA.
let applicationEncodes = 0, applicationValidations = 0, hooks = 0;
const encode = (...args) => { assert.ok(++applicationEncodes <= 64); return encodeObserved(...args); };
const validate = (...args) => { assert.ok(++applicationValidations <= 64); return validateObserved(...args); };
function rejected(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, 'zenon_observed_original_checkpoint_input_rejected');
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
const frontier = {
  version: 1, chainIdentifier: 73404, blockType: 3, hash: PREVIOUS,
  previousHash: '77'.repeat(32), height: 6, momentumAcknowledged: { hash: H, height: 100 },
  address: PAYER, toAddress: PAYEE, amount: '5', tokenStandard: ASSET,
  fromBlockHash: '88'.repeat(32), descendantBlocks: [], data: null,
  fusedPlasma: 0, difficulty: 0, nonce: '0000000000000000',
  basePlasma: 21000, usedPlasma: 21000, changesHash: ZERO, publicKey: '', signature: '',
  token: null, confirmationDetail: null, pairedAccountBlock: null,
};
const originalView = {
  observedUserSendViewVersion: 1, phase: 'UNSIGNED',
  paymentRequired: originalContext.paymentRequired, accepted: originalContext.accepted,
  payerAddress: PAYER, compiledSporkIds: originalContext.compiledSporkIds,
  accountFrontierResultJson: JSON.stringify(frontier),
  observation: originalContext.observation, policy: originalContext.policy,
  runtimeContextDigest: originalContext.runtimeContextDigest,
};
const adapter = new ObservedDynamicPlasmaUserSendAdapter();
const originalPlan = await adapter.quote(originalView);
assert.deepEqual(originalPlan.subject, originalContext.subject);
const assembled = await adapter.assemble(originalView, originalPlan,
  { materialVersion: 1, publicKey: PUBLIC, nonce: '0102030405060708' });
assert.equal(assembled.accountBlock.difficulty, 0);
assert.equal(assembled.accountBlock.fusedPlasma, 25410);
const fixture = () => ({ view: clone(originalView), plan: clone(originalPlan), block: clone(assembled.accountBlock) });
function bindingContext(view, plan) {
  return { phase: view.phase, subject: plan.subject, paymentRequired: view.paymentRequired,
    accepted: view.accepted, payerAddress: view.payerAddress, compiledSporkIds: view.compiledSporkIds,
    observation: view.observation, policy: view.policy, runtimeContextDigest: view.runtimeContextDigest };
}

test('observed checkpoint carries the actual original observed plan and block across both admitted price advances', OPTIONS, async () => {
  const f = fixture(), text = await encode(f.view, f.plan, f.block);
  for (const [age, price] of [[0, 1000], [1, 1100], [2, 1210]]) {
    const view = advanced(f.view, age, price);
    assert.equal(await encode(view, f.plan, f.block), text);
    const checked = await validate(view, f.plan, f.block, text);
    assert.equal(checked.checkpointJson, text); assert.deepEqual(checked.accountBlock, f.block);
    assert.deepEqual(checked.quote, f.plan.quote); assert.equal(checked.accountBlock.momentumAcknowledged.height, 100);
    assert.equal(checked.validation.workBinding.work.validation, 'NOT_REQUIRED_BY_DECLARED_ZERO_DIFFICULTY');
  }
});
test('observed checkpoint rejects a coherent alternative that the standalone codec accepts under the same intent and quote', OPTIONS, async () => {
  const f = fixture(), ctx = bindingContext(f.view, f.plan), originalText = await encode(f.view, f.plan, f.block);
  const alternative = clone(f.block); alternative.nonce = '0000000000000000';
  alternative.hash = computeZenonUnsignedUserSendHash(alternative);
  assert.notEqual(alternative.hash, f.block.hash);
  const alternativeText = await encodeCodec(ctx, f.plan.quote, alternative);
  assert.notEqual(alternativeText, originalText);
  const coherent = await validateCodec(ctx, alternativeText);
  assert.deepEqual(coherent.accountBlock, alternative);
  await assert.rejects(validate(f.view, f.plan, f.block, alternativeText), rejected);
  assert.equal(await encode(f.view, f.plan, f.block), originalText);
  assert.equal(f.block.nonce, '0102030405060708');
});
test('observed checkpoint rejects a changed or unavailable account projection rather than trusting checkpoint consistency', OPTIONS, async () => {
  const f = fixture(), text = await encode(f.view, f.plan, f.block);
  for (const edit of [b => { b.height = 7; }, b => { b.hash = '77'.repeat(32); },
    b => { b.chainIdentifier = 1; }, b => { b.address = PAYEE; }]) {
    const current = clone(f.view), b = JSON.parse(current.accountFrontierResultJson); edit(b);
    current.accountFrontierResultJson = JSON.stringify(b);
    await assert.rejects(encode(current, f.plan, f.block), rejected);
    await assert.rejects(validate(current, f.plan, f.block, text), rejected);
  }
  const unavailable = { ...f.view, accountFrontierResultJson: 'null' };
  await assert.rejects(validate(unavailable, f.plan, f.block, text), rejected);
  assert.equal(await encode(f.view, f.plan, f.block), text);
});
test('observed checkpoint retains the original quote after expiry runtime drift or changed independently retained originals', OPTIONS, async () => {
  const f = fixture(), text = await encode(f.view, f.plan, f.block);
  const expired = advanced(f.view, 3, 1331), changedP = clone(f.view), changedRuntime = clone(f.view);
  for (const e of changedP.observation.endpointObservations) e.plasmaVariables.MaxPriceChangePercent = 11;
  changedRuntime.runtimeContextDigest = 'sha256:' + 'c'.repeat(64);
  for (const current of [expired, changedP, changedRuntime]) {
    await assert.rejects(encode(current, f.plan, f.block), rejected);
    await assert.rejects(validate(current, f.plan, f.block, text), rejected);
  }
  const changedPlan = clone(f.plan);
  changedPlan.quote.sourceQuote.pricePolicyQuote.policy.maxMomentumAdvances = 1;
  await assert.rejects(validate(f.view, changedPlan, f.block, text), rejected);
  const changedBlock = clone(f.block); changedBlock.amount = '6';
  changedBlock.hash = computeZenonUnsignedUserSendHash(changedBlock);
  await assert.rejects(validate(f.view, f.plan, changedBlock, text), rejected);
  assert.equal(await encode(f.view, f.plan, f.block), text);
});
test('observed checkpoint snapshots the complete view original plan and block before yielding without freezing callers', OPTIONS, async () => {
  const f = fixture(), saved = clone(f), expected = await encode(f.view, f.plan, f.block);
  const pending = encode(f.view, f.plan, f.block);
  assert.equal(Object.getPrototypeOf(pending), Promise.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(pending, 'constructor').value, Promise);
  f.view.accountFrontierResultJson = 'null';
  f.view.observation.endpointObservations[0].beforeFrontier.height = 999;
  f.plan.subject.amount = '6'; f.block.nonce = '0000000000000000';
  assert.equal(await pending, expected);
  const reading = validate(saved.view, saved.plan, saved.block, expected);
  saved.view.observation = null; saved.plan.quote = null; saved.block.hash = ZERO;
  const result = await reading;
  assert.equal(result.checkpointJson, expected); assert.equal(result.accountBlock.nonce, '0102030405060708');
  assert.equal(Object.isFrozen(f.view), false); assert.equal(Object.isFrozen(f.plan), false);
  assert.equal(Object.isFrozen(f.block), false);
});
test('observed checkpoint fences hostile data ambiguous text and wrong arity and returns only powerless frozen evidence', OPTIONS, async t => {
  const f = fixture(), text = await encode(f.view, f.plan, f.block), hook = () => { hooks++; throw Error('PRIVATE'); };
  const viewGetter = clone(f.view), planGetter = clone(f.plan), blockGetter = clone(f.block);
  Object.defineProperty(viewGetter, 'accountFrontierResultJson', { enumerable: true, get: hook });
  Object.defineProperty(planGetter, 'quote', { enumerable: true, get: hook });
  Object.defineProperty(blockGetter, 'publicKey', { enumerable: true, get: hook });
  for (const args of [[viewGetter, f.plan, f.block], [f.view, planGetter, f.block], [f.view, f.plan, blockGetter],
    [new Proxy(f.view, { get: hook, ownKeys: hook, getPrototypeOf: hook }), f.plan, f.block]]) {
    await assert.rejects(encode(...args), rejected);
    await assert.rejects(validate(...args, text), rejected);
  }
  for (const bad of [' ' + text, text + '\n', '{}', 'not-json', 'x'.repeat(32769),
    { toString: hook }, JSON.stringify('\ud83d\ude00'.repeat(11000))]) {
    await assert.rejects(validate(f.view, f.plan, f.block, bad), rejected);
  }
  for (const args of [[], [f.view], [f.view, f.plan], [f.view, f.plan, f.block, null]])
    await assert.rejects(encode(...args), rejected);
  for (const args of [[], [f.view, f.plan, f.block], [f.view, f.plan, f.block, text, null]])
    await assert.rejects(validate(...args), rejected);
  const result = await validate(f.view, f.plan, f.block, text);
  assert.equal(Object.getPrototypeOf(result), null); frozen(result);
  assert.equal(result.originalPacketBinding, 'EXACT_CANONICAL_BYTES_FOR_INDEPENDENT_PLAN_AND_BLOCK');
  assert.equal(result.accountFrontierProjection, 'MATCHES_DECLARED_ORIGINAL_ACCOUNT_FRONTIER');
  assert.equal(result.currentAccountBalance, 'NOT_CHECKED'); assert.equal(result.persistence, 'NOT_PERFORMED');
  assert.equal(result.signingAuthorization, 'NOT_ESTABLISHED'); assert.equal(result.chainAuthentication, 'NOT_ESTABLISHED');
  assert.equal(result.authority, 'NONE'); assert.equal(result.afterSigningAction, 'NONE');
  assert.equal(result.validation.keyPossession, 'NOT_ESTABLISHED'); assert.equal(hooks, 0);
  assert.deepEqual(Object.getOwnPropertyNames(ObservedDynamicPlasmaUserSendAdapter.prototype),
    ['constructor', 'createObservationInput', 'quote', 'createWorkRequest', 'assemble', 'validateUnsigned']);
  t.diagnostic(JSON.stringify({ kind: 'P1A_OBSERVED_ORIGINAL_CHECKPOINT', applicationEncodes, applicationValidations,
    hooks, originalObservedQuotes: 1, originalObservedAssemblies: 1,
    standaloneCoherentAlternativeEncodeAndValidateCalls: 2, nonceSearchCalls: 0, candidateEvaluations: 0,
    keyGeneration: 0, signatures: 0, persistentWrites: 0, incomingTextParsedByNewAdapter: false,
    originalPlanAndBlockPreserved: true, priorCheckpointCasesRegistered: 0,
    qualification: 'DECLARED_FIXED_DATA_ONLY_NOT_LIVE_DP' }));
});
