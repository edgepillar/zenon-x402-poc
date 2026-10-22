/*
 * Eight new current-source checkpoint READ/reuse scenarios. Only fixed
 * synthetic declarations are reused, never an earlier test entry. One pure
 * original quote/assembly/checkpoint fixture; no planner/material callback,
 * nonce search, key generation, signature, SDK, SQL, socket, real PREPARE,
 * payment, persistence/reopen or live runtime. Exact source closure is pinned
 * by the reviewed managed caller before the one selected local command.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  createObservedBalanceDynamicPlasmaUnsignedCheckpointReader as CREATE,
  createObservedBalanceDynamicPlasmaUserSendReadAdapter as LEGACY,
  createObservedBalanceDynamicPlasmaUserSendCheckpointReadAdapter as ENCODER,
} from '../src/zenon/dynamic-plasma-observed-balance-user-send-read-adapter.js';
import { createDynamicPlasmaJsonRpcReadTransport as WIRE } from '../src/zenon/dynamic-plasma-json-rpc-read-transport.js';
import { ObservedDynamicPlasmaUserSendAdapter } from '../src/zenon/dynamic-plasma-observed-user-send-adapter.js';
import { encodeObservedZenonUnsignedOriginalQuoteCheckpoint as ENCODE } from '../src/zenon/dynamic-plasma-observed-original-checkpoint.js';
import {
  encodeZenonUnsignedOriginalQuoteCheckpoint as ENCODE_CODEC,
  validateZenonUnsignedOriginalQuoteCheckpoint as VALIDATE_CODEC,
} from '../src/zenon/dynamic-plasma-unsigned-original-checkpoint.js';
import { computeZenonUnsignedUserSendHash, assertZenonTransactionPlanner } from '../src/zenon/transaction-planner.js';
import { paymentIntentDigest } from '../src/canonical.js';
import { snapshotDynamicPlasmaQuoteRequestContext } from '../src/zenon/dynamic-plasma-observation-normalizer.js';

assert.equal(process.argv.length, 2);
const OPTIONS = { timeout: 5000, concurrency: false };
const copy = value => JSON.parse(JSON.stringify(value)); // Owned fixture DATA.
const ZERO = '0'.repeat(64), H = '33'.repeat(32), PREVIOUS = '66'.repeat(32);
const ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx';
const PUBLIC = Buffer.alloc(32, 7).toString('base64'); // Existing fixed public bytes.
const totals = { readers: 0, compatibilityReaders: 0, accountReadCallbacks: 0, dpReadCallbacks: 0,
  readCycles: 0, checkpointResults: 0, compatibilityResults: 0, preReadRejections: 0,
  heldGuardChecks: 0, busyGuardChecks: 0, exhaustedGuardChecks: 0, hooks: 0 };
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
    description: 'Synthetic resource.', mimeType: 'application/json', tags: ['synthetic'] }, accepts: [copy(accepted)] };
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
  const observation = { expectedChainProfile: copy(accepted.extra.zenonChain),
    compiledSporkIds: copy(compiledSporkIds), endpointObservations: [copy(endpoint), copy(endpoint)],
    requiredFusedObservationVersion: 1, quoteRequestContextVersion: 1, quoteRequestContext: null };
  observation.quoteRequestContext = snapshotDynamicPlasmaQuoteRequestContext({ requestContextVersion: 1,
    expectedChainProfile: observation.expectedChainProfile, compiledSporkIds,
    quoteRequest: { address: PAYER, blockType: 2, toAddress: PAYEE, data: subject.data } });
  return { phase: 'UNSIGNED', subject, paymentRequired, accepted, payerAddress: PAYER, compiledSporkIds, observation,
    policy: { policyVersion: 1, maxPriceChangePercent: 10, maxMomentumAdvances: 2,
      maxFusedPlasma: 30000, maxDifficulty: 0 }, runtimeContextDigest: 'sha256:' + 'b'.repeat(64) };
}
function advanced(original, age) {
  const value = copy(original), price = [1000, 1100, 1210, 1331][age];
  for (const endpoint of value.observation.endpointObservations) {
    for (const side of ['beforeFrontier', 'afterFrontier']) {
      Object.assign(endpoint[side], { height: 100 + age, hash: ['33', '44', '55', '66'][age].repeat(32),
        nextFusionPrice: price, nextWorkPrice: price });
    }
    endpoint.rpcObservation.requiredFusedPlasma = Math.ceil(21000 * price / 1000);
  }
  return value;
}
function frontierBlock() {
  return { version: 1, chainIdentifier: 73404, blockType: 3, hash: PREVIOUS,
    previousHash: '77'.repeat(32), height: 6, momentumAcknowledged: { hash: H, height: 100 },
    address: PAYER, toAddress: PAYEE, amount: '5', tokenStandard: ASSET,
    fromBlockHash: '88'.repeat(32), descendantBlocks: [], data: null,
    fusedPlasma: 0, difficulty: 0, nonce: '0000000000000000',
    basePlasma: 21000, usedPlasma: 21000, changesHash: ZERO, publicKey: '', signature: '',
    token: null, confirmationDetail: null, pairedAccountBlock: null };
}
function view(value, age = 0) {
  const current = advanced(value, age);
  return { observedUserSendViewVersion: 1, phase: 'UNSIGNED', paymentRequired: current.paymentRequired,
    accepted: current.accepted, payerAddress: PAYER, compiledSporkIds: current.compiledSporkIds,
    accountFrontierResultJson: JSON.stringify(frontierBlock()), observation: current.observation,
    policy: current.policy, runtimeContextDigest: current.runtimeContextDigest };
}

const originalValue = context(), originalView = view(originalValue);
const originalAdapter = new ObservedDynamicPlasmaUserSendAdapter();
const originalPlan = await originalAdapter.quote(originalView);
const originalAssembly = await originalAdapter.assemble(originalView, originalPlan,
  { materialVersion: 1, publicKey: PUBLIC, nonce: '0102030405060708' });
const originalBlock = originalAssembly.accountBlock;
const originalText = await ENCODE(originalView, originalPlan, originalBlock);
assert.equal(originalBlock.fusedPlasma, 25410);
assert.equal(originalBlock.difficulty, 0);
function cap() {
  let resolve; const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}
const METHODS = ['ledger.getFrontierMomentum', 'ledger.getMomentumsByHeight', 'embedded.spork.getAll',
  'embedded.plasma.getVariables', 'embedded.plasma.getRequiredPoWForAccountBlock', 'ledger.getFrontierMomentum'];
function momentum(frontier) {
  return { version: frontier.version, chainIdentifier: Number(frontier.chainIdentifier),
    hash: frontier.hash, previousHash: '11'.repeat(32), height: frontier.height, timestamp: 1234,
    data: '', content: [], changesHash: '66'.repeat(32), publicKey: Buffer.alloc(32, 6).toString('base64'),
    signature: Buffer.alloc(64, 8).toString('base64'), // Fixed DATA, not signing.
    nextFusionPrice: frontier.nextFusionPrice, nextWorkPrice: frontier.nextWorkPrice, producer: PAYER };
}

function fixture(mode = {}, creator = CREATE) {
  const value = context(), calls = [], positions = [0, 0], finalReady = cap();
  const f = { value, calls, positions, mode, age: mode.age || 0, finalReady, finalRelease: null };
  const transports = [0, 1].map(endpoint => WIRE({ exchange: function exchange(body) {
    const request = JSON.parse(body), index = positions[endpoint]++ % 6;
    totals.dpReadCallbacks++; assert.ok(totals.dpReadCallbacks <= 264);
    assert.equal(request.id, positions[endpoint]); assert.equal(request.method, METHODS[index]);
    const current = advanced(value, f.age), e = current.observation.endpointObservations[endpoint];
    if (mode.changedP) e.plasmaVariables.MaxPriceChangePercent = 11;
    const two = { ...e.beforeFrontier, version: 1, height: 2, hash: '22'.repeat(32),
      nextFusionPrice: 0, nextWorkPrice: 0 };
    const script = [momentum(e.beforeFrontier), { count: 200, list: [momentum(two)] },
      { count: e.sporks.count, list: e.sporks.list.map(s => ({ ...s, description: 'Synthetic.' })) },
      copy(e.plasmaVariables), copy(e.rpcObservation), momentum(e.afterFrontier)];
    return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: script[index] }));
  } }));
  f.options = { transports, accountExchange: function accountExchange(body) {
    const request = JSON.parse(body); calls.push(request); totals.accountReadCallbacks++;
    assert.ok(totals.accountReadCallbacks <= 73); assert.equal(request.id, calls.length);
    assert.deepEqual(request.params, [PAYER]);
    const position = (calls.length - 1) % 3;
    assert.equal(request.method, position === 1 ? 'ledger.getAccountInfoByAddress' : 'ledger.getFrontierAccountBlock');
    if (position === 0) totals.readCycles++;
    if (mode.foreignThenable) {
      const bad = {}; Object.defineProperty(bad, 'then', { get() { totals.hooks++; throw Error('PRIVATE'); } });
      return bad;
    }
    if (mode.rejectedExchange) return Promise.reject(Error('PRIVATE'));
    const result = position === 1
      ? { address: PAYER, accountHeight: 6, balanceInfoMap: mode.missingAsset ? {} : { [ASSET]: {
        token: { tokenStandard: ASSET }, balance: mode.insufficient ? '4' : '5' } } }
      : frontierBlock();
    if ((mode.movedBefore && position === 0) || (mode.movedAfter && position === 2)) {
      result.height = 7; result.hash = '99'.repeat(32);
    }
    const text = JSON.stringify({ jsonrpc: '2.0', id: request.id, result });
    if (mode.deferFinal && position === 2) {
      const gate = cap(); f.finalRelease = () => gate.resolve(text); finalReady.resolve();
      return gate.promise;
    }
    return Promise.resolve(text);
  } };
  f.input = { observedUserSendReadVersion: 3, phase: 'UNSIGNED', paymentRequired: copy(value.paymentRequired),
    accepted: copy(value.accepted), payerAddress: PAYER, compiledSporkIds: copy(value.compiledSporkIds),
    policy: copy(value.policy), runtimeContextDigest: mode.changedRuntime ? 'sha256:' + 'c'.repeat(64) : value.runtimeContextDigest };
  f.plan = copy(originalPlan); f.block = copy(originalBlock); f.text = originalText;
  f.reader = creator(f.options);
  if (creator === CREATE) {
    totals.readers++; assert.deepEqual(Object.keys(f.reader), ['validateUnsignedCheckpoint']);
    assert.throws(() => assertZenonTransactionPlanner(f.reader), TypeError);
  } else {
    totals.compatibilityReaders++;
    assert.deepEqual(Object.keys(f.reader), ['quote', 'createWorkRequest', 'assemble', 'validateUnsigned']);
  }
  frozen(f.reader); assert.equal(calls.length, 0); assert.deepEqual(positions, [0, 0]);
  return f;
}
function run(f, args = [f.input, f.plan, f.block, f.text]) {
  const pending = f.reader.validateUnsignedCheckpoint(...args);
  assert.equal(Object.getPrototypeOf(pending), Promise.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(pending, 'constructor').value, Promise);
  return pending;
}
function frozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) frozen(child);
}
function rejected(kind = 'read_or_stage_rejected') {
  return error => {
    assert.ok(error instanceof (kind === 'busy' ? Error : TypeError)); assert.ok(Object.isFrozen(error));
    const code = 'zenon_observed_balance_dp_read_adapter_' + kind;
    assert.equal(error.code, code); assert.equal(error.message, code);
    assert.equal(error.stack, (kind === 'busy' ? 'Error: ' : 'TypeError: ') + code);
    assert.equal(Object.hasOwn(error, 'cause'), false); return true;
  };
}
function hostile() {
  const hook = () => { totals.hooks++; throw Error('PRIVATE'); };
  return new Proxy({}, { get: hook, ownKeys: hook, getPrototypeOf: hook });
}
async function held(f) {
  const before = [f.calls.length, ...f.positions]; totals.heldGuardChecks++;
  await assert.rejects(run(f, [hostile(), hostile(), hostile(), hostile()]), rejected('held'));
  assert.deepEqual([f.calls.length, ...f.positions], before);
}
function checked(packet) {
  totals.checkpointResults++;
  assert.equal(Object.getPrototypeOf(packet), null); frozen(packet);
  assert.equal(packet.observedBalanceCheckpointReadVersion, 1); assert.equal(packet.phase, 'UNSIGNED');
  assert.deepEqual(packet.originalPlan, originalPlan); assert.deepEqual(packet.accountBlock, originalBlock);
  assert.equal(packet.checkpointJson, originalText); assert.equal(packet.accountBlock.momentumAcknowledged.height, 100);
  assert.equal(packet.accountBlock.nonce, '0102030405060708'); assert.equal(packet.accountBlock.signature, '');
  assert.equal(packet.originalPacketBinding, 'EXACT_CANONICAL_BYTES_FOR_INDEPENDENT_PLAN_AND_BLOCK');
  assert.equal(packet.accountFrontierProjection, 'MATCHES_DECLARED_ORIGINAL_ACCOUNT_FRONTIER');
  assert.equal(packet.declaredBalanceRead, 'VALIDATED_IN_THIS_BRACKETED_READ_CYCLE');
  assert.equal(packet.validation.workBinding.work.validation, 'NOT_REQUIRED_BY_DECLARED_ZERO_DIFFICULTY');
  for (const key of ['currentAuthority', 'signingAuthorization', 'chainAuthentication'])
    assert.equal(packet[key], 'NOT_ESTABLISHED');
  assert.equal(packet.persistence, 'NOT_PERFORMED'); assert.equal(packet.authority, 'NONE');
  assert.equal(packet.afterSigningAction, 'NONE');
}

test('checkpoint reader reuses exact original bytes with fresh balances at both admitted price advances', OPTIONS, async () => {
  const f = fixture();
  for (const age of [0, 1, 2]) { f.age = age; checked(await run(f)); }
  assert.equal(f.calls.length, 9); assert.deepEqual(f.positions, [18, 18]);
  assert.deepEqual(f.plan, originalPlan); assert.deepEqual(f.block, originalBlock); assert.equal(f.text, originalText);
});
test('checkpoint reader rejects a coherent substituted packet against separately retained originals and then holds', OPTIONS, async () => {
  const f = fixture(), alternative = copy(originalBlock); alternative.nonce = '0000000000000000';
  alternative.hash = computeZenonUnsignedUserSendHash(alternative);
  const ctx = { phase: originalView.phase, subject: originalPlan.subject,
    paymentRequired: originalView.paymentRequired, accepted: originalView.accepted,
    payerAddress: originalView.payerAddress, compiledSporkIds: originalView.compiledSporkIds,
    observation: originalView.observation, policy: originalView.policy, runtimeContextDigest: originalView.runtimeContextDigest };
  const alternativeText = await ENCODE_CODEC(ctx, originalPlan.quote, alternative);
  assert.notEqual(alternativeText, originalText);
  assert.deepEqual((await VALIDATE_CODEC(ctx, alternativeText)).accountBlock, alternative);
  await assert.rejects(run(f, [f.input, f.plan, f.block, alternativeText]), rejected());
  assert.equal(f.calls.length, 3); assert.deepEqual(f.positions, [6, 6]); await held(f);
});
test('checkpoint reader refuses missing funds changed account expiry and parameter drift without re-quoting', OPTIONS, async () => {
  for (const [mode, accountCalls, dpCalls] of [
    [{ insufficient: true }, 2, 0], [{ missingAsset: true }, 2, 0], [{ movedBefore: true }, 1, 0],
    [{ movedAfter: true }, 3, 6], [{ age: 3 }, 3, 6], [{ changedP: true }, 3, 6],
    [{ changedRuntime: true }, 3, 6],
  ]) {
    const f = fixture(mode); await assert.rejects(run(f), rejected());
    assert.equal(f.calls.length, accountCalls); assert.deepEqual(f.positions, [dpCalls, dpCalls]);
    assert.deepEqual(f.plan, originalPlan); assert.deepEqual(f.block, originalBlock); await held(f);
  }
});
test('checkpoint reader withholds output until the final bracket and snapshots originals before borrowed callbacks', OPTIONS, async () => {
  const f = fixture({ deferFinal: true }); let settled = false;
  const pending = run(f); pending.then(() => { settled = true; }, () => { settled = true; });
  f.input.phase = 'SIGNED'; f.input.policy.maxMomentumAdvances = 0;
  f.plan.quote = null; f.block.nonce = '0000000000000000'; f.text = '{}';
  f.options.accountExchange = () => { totals.hooks++; throw Error('PRIVATE'); };
  await f.finalReady.promise;
  assert.equal(settled, false); assert.equal(f.calls.length, 3); assert.deepEqual(f.positions, [6, 6]);
  totals.busyGuardChecks++;
  await assert.rejects(run(f, [hostile(), hostile(), hostile(), hostile()]), rejected('busy'));
  assert.equal(settled, false); f.finalRelease(); checked(await pending);
  assert.equal(Object.isFrozen(f.input), false); assert.equal(Object.isFrozen(f.plan), false);
  assert.equal(Object.isFrozen(f.block), false);
});
test('checkpoint reader rejects malformed text accessor proxy and wrong-version inputs before any read cycle', OPTIONS, async () => {
  const f = fixture(), hook = () => { totals.hooks++; throw Error('PRIVATE'); };
  const inputGetter = copy(f.input), planGetter = copy(f.plan), blockGetter = copy(f.block);
  Object.defineProperty(inputGetter, 'payerAddress', { enumerable: true, get: hook });
  Object.defineProperty(planGetter, 'quote', { enumerable: true, get: hook });
  Object.defineProperty(blockGetter, 'publicKey', { enumerable: true, get: hook });
  const invalid = [[], [f.input, f.plan, f.block], [f.input, f.plan, f.block, f.text, null],
    ...['x'.repeat(32769), '\ud83d\ude00'.repeat(11000), { toString: hook }, null]
      .map(text => [f.input, f.plan, f.block, text]),
    [inputGetter, f.plan, f.block, f.text], [f.input, planGetter, f.block, f.text],
    [f.input, f.plan, blockGetter, f.text], [hostile(), f.plan, f.block, f.text],
    [{ ...f.input, observedUserSendReadVersion: 2 }, f.plan, f.block, f.text],
    [{ ...f.input, phase: 'SIGNED' }, f.plan, f.block, f.text]];
  assert.equal(invalid.length, 13);
  for (const args of invalid) { totals.preReadRejections++; await assert.rejects(run(f, args), rejected('input_rejected')); }
  assert.throws(() => CREATE(), rejected('configuration_rejected'));
  assert.throws(() => CREATE(f.options, null), rejected('configuration_rejected'));
  assert.equal(f.calls.length, 0); assert.deepEqual(f.positions, [0, 0]); checked(await run(f));
});
test('checkpoint reader stops before an eleventh cycle without renewing any signing or payment authority', OPTIONS, async () => {
  const f = fixture();
  for (let cycle = 0; cycle < 10; cycle++) checked(await run(f));
  assert.equal(f.calls.length, 30); assert.deepEqual(f.positions, [60, 60]);
  totals.exhaustedGuardChecks++;
  await assert.rejects(run(f, [hostile(), hostile(), hostile(), hostile()]), rejected('exhausted'));
  assert.equal(f.calls.length, 30); assert.deepEqual(f.positions, [60, 60]);
});
test('changed-source legacy validation and checkpoint generation keep their existing surfaces and one-cycle outputs', OPTIONS, async () => {
  const base = fixture({}, LEGACY), checkedBase = await base.reader.validateUnsigned(base.input, base.plan, base.block);
  assert.deepEqual(checkedBase.workBinding.hashPriceBinding.accountBlock, originalBlock); totals.compatibilityResults++;
  assert.equal(Object.hasOwn(checkedBase, 'checkpointJson'), false);
  const generating = fixture({}, ENCODER), generated = await generating.reader.validateUnsigned(
    generating.input, generating.plan, generating.block);
  assert.equal(generated.observedUnsignedCheckpointVersion, 1); assert.equal(generated.checkpointJson, originalText);
  assert.deepEqual(generated.originalPlan, originalPlan); assert.deepEqual(generated.accountBlock, originalBlock);
  totals.compatibilityResults++;
  for (const f of [base, generating]) { assert.equal(f.calls.length, 3); assert.deepEqual(f.positions, [6, 6]); }
});
test('checkpoint reader holds after unsafe or rejected borrowed reads without invoking thenable hooks or new reads', OPTIONS, async t => {
  for (const mode of [{ foreignThenable: true }, { rejectedExchange: true }]) {
    const f = fixture(mode); await assert.rejects(run(f), rejected());
    assert.equal(f.calls.length, 1); assert.deepEqual(f.positions, [0, 0]); await held(f);
  }
  assert.deepEqual(totals, { readers: 14, compatibilityReaders: 2, accountReadCallbacks: 73, dpReadCallbacks: 264,
    readCycles: 27, checkpointResults: 15, compatibilityResults: 2, preReadRejections: 13,
    heldGuardChecks: 10, busyGuardChecks: 1, exhaustedGuardChecks: 1, hooks: 0 });
  t.diagnostic(JSON.stringify({ kind: 'P1A_BALANCE_CHECKPOINT_READER', ...totals,
    originalFixtureQuotes: 1, originalFixtureAssemblies: 1, originalFixtureEncodes: 1,
    coherentAlternativeCodecControlCalls: 2, restorationQuoteOrMaterialCalls: 0,
    incomingCheckpointParsedByReadAdapter: false, nonceSearchCalls: 0, candidateEvaluations: 0,
    keyGeneration: 0, signatures: 0, persistentWrites: 0, oldQualificationEntriesRegistered: 0,
    qualification: 'DECLARED_FIXED_DATA_ONLY_NOT_LIVE_DP_OR_DURABLE_RECOVERY' }));
});
