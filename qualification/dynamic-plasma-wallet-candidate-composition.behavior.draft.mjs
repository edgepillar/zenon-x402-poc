/*
 * Current actual preparer/read/handoff composition with DECLARED wallet test
 * doubles only. Their sign-shaped method returns fixed invalid signature DATA;
 * it does not generate/verify a signature or use a real wallet implementation.
 * Fixed public bytes, literal zero-difficulty material, in-process reply texts.
 * No SDK, keys, nonce search, SQL, network, real PREPARE or payment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  createObservedBalanceDeadlineBoundMaterialCheckpointPreparer as CREATE,
  createObservedBalanceDeadlineBoundMaterialWalletCandidatePreparer as WALLET,
  createObservedBalanceDeferredMaterialCheckpointPreparer as COMPAT,
  createObservedBalanceDeferredMaterialDynamicPlasmaTransactionPlanner as LEGACY,
} from '../src/zenon/dynamic-plasma-observed-balance-deferred-material-planner.js';
import { createDynamicPlasmaJsonRpcReadTransport as WIRE } from '../src/zenon/dynamic-plasma-json-rpc-read-transport.js';
import { validateObservedZenonUnsignedOriginalQuoteCheckpoint as VALIDATE } from '../src/zenon/dynamic-plasma-observed-original-checkpoint.js';
import { paymentIntentDigest } from '../src/canonical.js';
import { assertZenonTransactionPlanner, computeZenonUnsignedUserSendHash } from '../src/zenon/transaction-planner.js';
import { snapshotDynamicPlasmaQuoteRequestContext } from '../src/zenon/dynamic-plasma-observation-normalizer.js';

assert.equal(process.argv.length, 2);
const OPTIONS = { timeout: 5000, concurrency: false };
const copy = value => JSON.parse(JSON.stringify(value)); // Owned fixture DATA.
const ZERO = '0'.repeat(64), H = '33'.repeat(32), PREVIOUS = '66'.repeat(32);
const ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx';
const PUBLIC = Buffer.alloc(32, 7).toString('base64'); // Existing public DATA.
const SIGNATURE = Buffer.alloc(64, 42).toString('base64'); // Invalid signature-shaped DATA.
const totals = { fixtures: 0, runs: 0, dpReadCallbacks: 0, accountReadCallbacks: 0,
  materialHandoffs: 0, declaredAddressCallbacks: 0, declaredResultCallbacks: 0, hooks: 0 };
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
function cap() {
  let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
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

function hostile() {
  const hook = () => { totals.hooks++; throw Error('PRIVATE'); };
  return new Proxy({}, { get: hook, ownKeys: hook, getPrototypeOf: hook });
}
function frozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) frozen(child);
}
function fixture(mode = {}) {
  assert.ok(++totals.fixtures <= 48);
  const value = context(), calls = [], positions = [0, 0], materialCalls = [];
  const f = { value, calls, positions, materialCalls, stage: 0, pending: null,
    ages: mode.ages || [0, 0, 0, 0, 0], addressCalls: 0, resultCalls: 0,
    walletReady: cap(), walletGate: cap(), materialReady: cap(), materialGate: cap(),
    currentReadReady: cap(), currentReadGate: cap(), originalUnsigned: null, expectedCandidate: null };
  const transports = [0, 1].map(endpoint => WIRE({ exchange: function exchange(body) {
    const request = JSON.parse(body), index = positions[endpoint]++ % 6;
    assert.ok(++totals.dpReadCallbacks <= 3000);
    assert.equal(request.id, positions[endpoint]); assert.equal(request.method, METHODS[index]);
    const current = advanced(value, f.ages[f.stage - 1]), e = current.observation.endpointObservations[endpoint];
    if (mode.changedFinalP && f.stage === 5) e.plasmaVariables.MaxPriceChangePercent = 11;
    const two = { ...e.beforeFrontier, version: 1, height: 2, hash: '22'.repeat(32),
      nextFusionPrice: 0, nextWorkPrice: 0 };
    const script = [momentum(e.beforeFrontier), { count: 200, list: [momentum(two)] },
      { count: e.sporks.count, list: e.sporks.list.map(s => ({ ...s, description: 'Synthetic.' })) },
      copy(e.plasmaVariables), copy(e.rpcObservation), momentum(e.afterFrontier)];
    return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: script[index] }));
  } }));
  const wallet = {
    getAddress: function getAddress() {
      assert.equal(this, wallet); assert.equal(arguments.length, 0);
      assert.equal(++f.addressCalls, 1); assert.ok(++totals.declaredAddressCallbacks <= 40);
      assert.equal(calls.length, 0); assert.deepEqual(positions, [0, 0]);
      if (mode.addressMode === 'SELF') return f.pending;
      if (mode.addressMode === 'THENABLE') return { then() { totals.hooks++; throw Error('PRIVATE'); } };
      return Promise.resolve(mode.wrongAddress ? PAYEE : PAYER);
    },
    sign: function returnDeclaredCandidate(block) {
      assert.equal(this, wallet); assert.equal(arguments.length, 1);
      assert.equal(++f.resultCalls, 1); assert.ok(++totals.declaredResultCallbacks <= 32);
      assert.equal(calls.length, 12); assert.deepEqual(positions, [24, 24]);
      assert.equal(materialCalls.length, 1); frozen(block);
      f.originalUnsigned = block;
      f.expectedCandidate = { ...copy(block), signature: SIGNATURE };
      f.walletReady.resolve();
      if (mode.walletMode === 'DEFER') return f.walletGate.promise;
      if (mode.walletMode === 'REJECT') return Promise.reject(hostile());
      if (mode.walletMode === 'SELF') return f.pending;
      if (mode.walletMode === 'THENABLE') return { then() { totals.hooks++; throw Error('PRIVATE'); } };
      const candidate = copy(f.expectedCandidate);
      if (mode.walletMode === 'MUTATE_KEY') candidate.publicKey = Buffer.alloc(32, 9).toString('base64');
      if (mode.walletMode === 'REHASH_NONCE') {
        const projected = { ...candidate, signature: '', nonce: '0807060504030201' };
        candidate.nonce = projected.nonce; candidate.hash = computeZenonUnsignedUserSendHash(projected);
      }
      if (mode.walletMode === 'DATA_GETTER') {
        Object.defineProperty(candidate, 'hash', { enumerable: true,
          get() { totals.hooks++; throw Error('PRIVATE'); } });
        // Construct a fulfilled native Promise without assimilating a hook.
        const pending = Promise.resolve(null);
        return pending.then(() => candidate); // No then hook is present on this candidate.
      }
      const pending = Promise.resolve(candidate);
      if (mode.walletMode === 'LATE_THEN_GETTER') Object.defineProperty(candidate, 'then', {
        enumerable: true, get() { totals.hooks++; throw Error('PRIVATE'); } });
      if (mode.walletMode === 'CONSTRUCTOR_GETTER') Object.defineProperty(pending, 'constructor', {
        get() { totals.hooks++; throw Error('PRIVATE'); } });
      if (mode.walletMode === 'PROXY_PROMISE') return new Proxy(pending, {
        get() { totals.hooks++; throw Error('PRIVATE'); },
        getPrototypeOf() { totals.hooks++; throw Error('PRIVATE'); } });
      return pending;
    },
  };
  f.wallet = wallet;
  f.options = {
    readOptions: { transports, accountExchange: function accountExchange(body) {
      const request = JSON.parse(body); calls.push(request);
      assert.ok(++totals.accountReadCallbacks <= 600);
      assert.equal(request.id, calls.length); assert.deepEqual(request.params, [PAYER]);
      f.stage = Math.floor((calls.length - 1) / 3) + 1; assert.ok(f.stage <= 5);
      const balance = mode.insufficientFinal && f.stage === 5 ? '4' : '5';
      const result = request.method === 'ledger.getAccountInfoByAddress'
        ? { address: PAYER, accountHeight: 6, balanceInfoMap: { [ASSET]: {
          token: { tokenStandard: ASSET }, balance } } } : frontierBlock();
      if (mode.movedFinal && f.stage === 5 && request.method === 'ledger.getFrontierAccountBlock') {
        result.height = 7; result.hash = '99'.repeat(32);
      }
      const text = JSON.stringify({ jsonrpc: '2.0', id: request.id, result });
      if (mode.deferCurrent && calls.length === 13) {
        f.releaseCurrent = () => f.currentReadGate.resolve(text); f.currentReadReady.resolve();
        return f.currentReadGate.promise;
      }
      return Promise.resolve(text);
    } },
    materialExchange: function materialExchange(request) {
      assert.ok(++totals.materialHandoffs <= 40);
      assert.equal(this, undefined); assert.equal(arguments.length, 1); frozen(request);
      assert.equal(request.materialRequestVersion, 1);
      assert.equal(request.workRequest.accountBlock.difficulty, 0);
      assert.equal(request.workRequest.accountBlock.momentumAcknowledged.height, 100);
      materialCalls.push(request); assert.equal(materialCalls.length, 1);
      assert.equal(calls.length, 6); assert.deepEqual(positions, [12, 12]); f.materialReady.resolve();
      if (mode.deferMaterial) return f.materialGate.promise;
      return Promise.resolve({ materialVersion: 1, publicKey: PUBLIC, nonce: '0102030405060708' });
    },
  };
  const old = mode.legacy || mode.compat || mode.deadline;
  f.context = { plannerContextVersion: mode.legacy ? 3 : mode.compat ? 4 : mode.deadline ? 5 : 6,
    readInput: { observedUserSendReadVersion: 3, phase: 'UNSIGNED',
      paymentRequired: value.paymentRequired, accepted: value.accepted, payerAddress: PAYER,
      compiledSporkIds: value.compiledSporkIds, policy: value.policy, runtimeContextDigest: value.runtimeContextDigest } };
  if (!mode.legacy && !mode.compat) f.options.materialWaitMs = mode.waitMs ?? 250;
  if (!old) f.options.wallet = wallet;
  f.planner = (mode.legacy ? LEGACY : mode.compat ? COMPAT : mode.deadline ? CREATE : WALLET)(f.options);
  f.prepare = mode.legacy ? f.planner.prepareUnsigned : old
    ? f.planner.prepareUnsignedCheckpoint : f.planner.prepareSignedCandidate;
  assert.equal(calls.length, 0); assert.equal(f.addressCalls, 0); assert.equal(f.resultCalls, 0); frozen(f.planner);
  if (!old) {
    assert.deepEqual(Object.keys(f.planner), ['prepareSignedCandidate', 'getMaterialWaitSnapshot', 'getSignedOriginalData']);
    assert.throws(() => assertZenonTransactionPlanner(f.planner), TypeError);
  }
  return f;
}
function start(f) {
  assert.ok(++totals.runs <= 40);
  f.pending = f.prepare(f.context);
  assert.equal(Object.getPrototypeOf(f.pending), Promise.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(f.pending, 'constructor').value, Promise);
  return f.pending;
}
function rejected(kind = 'operation_rejected') {
  return error => {
    const type = kind === 'busy' ? Error : TypeError;
    const code = 'zenon_observed_balance_deferred_material_dp_planner_' + kind;
    assert.ok(error instanceof type && Object.isFrozen(error)); assert.equal(error.code, code);
    assert.equal(error.message, code); assert.equal(error.stack, type.name + ': ' + code);
    assert.equal(Object.hasOwn(error, 'cause'), false); return true;
  };
}
async function used(f) {
  const before = [f.calls.length, ...f.positions, f.addressCalls, f.resultCalls, f.materialCalls.length];
  await assert.rejects(f.prepare(hostile()), rejected('used'));
  assert.deepEqual([f.calls.length, ...f.positions, f.addressCalls, f.resultCalls, f.materialCalls.length], before);
}
function signedData(f) {
  const result = f.planner.getSignedOriginalData(); frozen(result);
  assert.equal(result.signatureValidation, 'NOT_PERFORMED'); assert.equal(result.persistence, 'NOT_PERFORMED');
  assert.equal(result.authority, 'NONE'); return result;
}

test('wallet candidate composes actual unsigned preparation one declared wallet response and a fifth current read', OPTIONS, async () => {
  const f = fixture();
  f.wallet.getAddress = f.wallet.sign = () => { throw Error('MUTATED_PUBLIC_METHOD'); }; // Captured methods remain original.
  const result = await start(f); frozen(result);
  assert.equal(result.observedSignedCandidateVersion, 1); assert.deepEqual(result.accountBlock, f.expectedCandidate);
  assert.deepEqual(result.originalUnsignedBlock, f.originalUnsigned);
  assert.equal(result.originalPlan.subject.momentumAcknowledged.height, 100);
  assert.equal(result.signatureValidation, 'NOT_PERFORMED'); assert.equal(result.persistence, 'NOT_PERFORMED');
  assert.equal(result.authority, 'NONE'); assert.equal(f.calls.length, 15); assert.deepEqual(f.positions, [30, 30]);
  assert.equal(f.addressCalls, 1); assert.equal(f.resultCalls, 1); assert.equal(f.materialCalls.length, 1);
  assert.equal(signedData(f).candidate.phase, 'VALIDATED_DECLARED_READS');
  await used(f);
});
test('wallet candidate preserves original hash nonce and ACK across both permitted post-wallet price advances', OPTIONS, async () => {
  for (const age of [1, 2]) {
    const f = fixture({ ages: [0, 0, 0, 0, age] }), result = await start(f);
    assert.deepEqual(result.accountBlock, f.expectedCandidate); assert.equal(f.resultCalls, 1);
    assert.equal(result.accountBlock.hash, f.originalUnsigned.hash);
    assert.equal(result.accountBlock.nonce, '0102030405060708');
    assert.equal(result.accountBlock.momentumAcknowledged.height, 100);
    assert.equal(JSON.parse(result.preSignCheckpointJson).accountBlock.signature, '');
    await used(f);
  }
});
test('wallet candidate retains the same field-bound signed DATA after post-wallet quote expiry without retry', OPTIONS, async () => {
  const f = fixture({ ages: [0, 0, 0, 0, 3] });
  await assert.rejects(start(f), rejected());
  const view = signedData(f); assert.equal(view.candidate.phase, 'UNKNOWN_OR_REJECTED');
  assert.deepEqual(view.candidate.accountBlock, f.expectedCandidate);
  assert.equal(view.candidate.accountBlock.hash, f.originalUnsigned.hash);
  assert.equal(view.walletSignAttempts, 1); assert.equal(f.calls.length, 15);
  await used(f); assert.deepEqual(signedData(f).candidate.accountBlock, f.expectedCandidate);
});
test('wallet candidate rejects a moved account before the fifth balance or DP read and retains the original', OPTIONS, async () => {
  const f = fixture({ movedFinal: true }); await assert.rejects(start(f), rejected());
  assert.equal(f.calls.length, 13); assert.deepEqual(f.positions, [24, 24]);
  assert.deepEqual(signedData(f).candidate.accountBlock, f.expectedCandidate); await used(f);
});
test('wallet candidate rejects insufficient fifth-cycle balance before requesting DP or replacing a payment', OPTIONS, async () => {
  const f = fixture({ insufficientFinal: true }); await assert.rejects(start(f), rejected());
  assert.equal(f.calls.length, 14); assert.deepEqual(f.positions, [24, 24]);
  assert.deepEqual(signedData(f).candidate.accountBlock, f.expectedCandidate); await used(f);
});
test('wallet candidate rejects changed runtime p after the declared wallet response and retains signed originals', OPTIONS, async () => {
  const f = fixture({ changedFinalP: true }); await assert.rejects(start(f), rejected());
  assert.equal(f.calls.length, 15); assert.deepEqual(f.positions, [30, 30]);
  assert.equal(signedData(f).candidate.phase, 'UNKNOWN_OR_REJECTED');
  assert.deepEqual(signedData(f).candidate.accountBlock, f.expectedCandidate); await used(f);
});
test('wallet candidate rejects changed unhashed public bytes before any post-wallet account read', OPTIONS, async () => {
  const f = fixture({ walletMode: 'MUTATE_KEY' }); await assert.rejects(start(f), rejected());
  assert.equal(f.calls.length, 12); assert.deepEqual(f.positions, [24, 24]);
  assert.equal(signedData(f).candidate.phase, 'REJECTED_BEFORE_CURRENT_READS'); await used(f);
});
test('wallet candidate rejects a coherently rehashed replacement nonce before any post-wallet account read', OPTIONS, async () => {
  const f = fixture({ walletMode: 'REHASH_NONCE' }); await assert.rejects(start(f), rejected());
  assert.equal(f.calls.length, 12); assert.equal(f.resultCalls, 1);
  assert.equal(signedData(f).candidate.accountBlock, null); await used(f);
});
test('wallet candidate keeps a rejected declared wallet operation unknown without inspecting its raw reason', OPTIONS, async () => {
  const f = fixture({ walletMode: 'REJECT' }); await assert.rejects(start(f), rejected());
  const view = signedData(f); assert.equal(view.externalWalletOperation, 'UNKNOWN');
  assert.equal(view.walletSignAttempts, 1); assert.equal(view.walletResultObserved, false);
  assert.equal(f.calls.length, 12); assert.equal(totals.hooks, 0); await used(f);
});
test('wallet candidate refuses self-dependent thenable proxy and unsafe native wallet Promises without hooks', OPTIONS, async () => {
  for (const walletMode of ['SELF', 'THENABLE', 'PROXY_PROMISE', 'CONSTRUCTOR_GETTER']) {
    const f = fixture({ walletMode }); await assert.rejects(start(f), rejected());
    assert.equal(f.calls.length, 12); assert.equal(f.resultCalls, 1); await used(f);
  }
  for (const addressMode of ['SELF', 'THENABLE']) {
    const f = fixture({ addressMode }); await assert.rejects(start(f), rejected());
    assert.equal(f.calls.length, 0); assert.equal(f.resultCalls, 0); await used(f);
  }
  assert.equal(totals.hooks, 0);
});
test('wallet candidate snapshots native fulfillment before own then or field getters can be assimilated', OPTIONS, async () => {
  for (const walletMode of ['DATA_GETTER', 'LATE_THEN_GETTER']) {
    const f = fixture({ walletMode }); await assert.rejects(start(f), rejected());
    assert.equal(f.calls.length, 12); assert.equal(f.resultCalls, 1);
    assert.equal(signedData(f).candidate.accountBlock, null); await used(f);
  }
  assert.equal(totals.hooks, 0);
});
test('wallet candidate performs no reads while the declared wallet response is pending and refuses reentry', OPTIONS, async () => {
  const f = fixture({ walletMode: 'DEFER', ages: [0, 0, 0, 0, 2] }), pending = start(f);
  await f.walletReady.promise;
  assert.equal(f.calls.length, 12); assert.deepEqual(f.positions, [24, 24]);
  await assert.rejects(f.prepare(hostile()), rejected('busy'));
  const view = signedData(f); assert.equal(view.walletSignAttempts, 1);
  assert.equal(view.walletResultObserved, false); assert.equal(view.candidate.accountBlock, null);
  f.walletGate.resolve(f.expectedCandidate);
  assert.deepEqual((await pending).accountBlock, f.expectedCandidate); await used(f);
});
test('wallet candidate inspection retains the original during a pending fifth read without creating dispatch authority', OPTIONS, async () => {
  const f = fixture({ deferCurrent: true }), pending = start(f);
  await f.currentReadReady.promise;
  const view = signedData(f); assert.equal(view.candidate.phase, 'VALIDATING_CURRENT_READS');
  assert.deepEqual(view.candidate.accountBlock, f.expectedCandidate);
  assert.equal(view.candidate.currentAuthority, 'NOT_ESTABLISHED');
  await assert.rejects(f.prepare(hostile()), rejected('busy'));
  f.releaseCurrent(); assert.deepEqual((await pending).accountBlock, f.expectedCandidate); await used(f);
});
test('wallet candidate material deadline drains late DATA without invoking the declared wallet or resuming preparation', OPTIONS, async () => {
  const f = fixture({ deferMaterial: true, waitMs: 10 }), pending = start(f);
  await f.materialReady.promise; await assert.rejects(pending, rejected('material_wait_unknown'));
  assert.equal(f.calls.length, 6); assert.equal(f.resultCalls, 0); assert.equal(f.addressCalls, 1);
  const late = { materialVersion: 1, publicKey: PUBLIC, nonce: '0102030405060708' };
  f.materialGate.resolve(late);
  Object.defineProperty(late, 'then', { get() { totals.hooks++; throw Error('PRIVATE'); } });
  await new Promise(resolve => setImmediate(resolve));
  const wait = f.planner.getMaterialWaitSnapshot();
  assert.equal(wait.phase, 'UNKNOWN_DRAINED'); assert.equal(wait.lateOutcomesIgnored, 1);
  assert.equal(signedData(f).externalWalletOperation, 'NOT_ENTERED');
  assert.equal(f.calls.length, 6); assert.equal(totals.hooks, 0); await used(f);
});
test('wallet candidate rejects a mismatching declared wallet address before any material or account work', OPTIONS, async () => {
  const f = fixture({ wrongAddress: true }); await assert.rejects(start(f), rejected());
  assert.equal(f.calls.length, 0); assert.deepEqual(f.positions, [0, 0]);
  assert.equal(f.materialCalls.length, 0); assert.equal(f.resultCalls, 0);
  assert.equal(signedData(f).externalWalletOperation, 'NOT_ENTERED'); await used(f);
});
test('wallet candidate configuration rejects borrowed wallet getters proxies and missing methods without invocation', OPTIONS, () => {
  const f = fixture(), hook = () => { totals.hooks++; throw Error('PRIVATE'); };
  const getter = { sign: f.options.wallet.sign }; Object.defineProperty(getter, 'getAddress', { get: hook });
  const proxy = new Proxy(f.options.wallet, { get: hook, getPrototypeOf: hook, ownKeys: hook });
  for (const wallet of [getter, proxy, {}, { getAddress: f.options.wallet.getAddress },
    { getAddress: f.options.wallet.getAddress, sign: new Proxy(f.options.wallet.sign, { apply: hook }) }]) {
    assert.throws(() => WALLET({ ...f.options, wallet }), rejected('configuration_rejected'));
  }
  const { wallet, ...oldOptions } = f.options;
  assert.throws(() => WALLET(oldOptions), rejected('configuration_rejected'));
  assert.throws(() => CREATE(f.options), rejected('configuration_rejected'));
  assert.equal(f.calls.length, 0); assert.equal(f.addressCalls, 0); assert.equal(totals.hooks, 0);
});
test('wallet candidate leaves actual v3 v4 and v5 surfaces and unsigned checkpoint contracts unchanged', OPTIONS, async () => {
  for (const mode of [{ legacy: true }, { compat: true }, { deadline: true }]) {
    const f = fixture(mode), result = await start(f);
    assert.equal(f.calls.length, 12); assert.deepEqual(f.positions, [24, 24]);
    assert.equal(f.addressCalls, 0); assert.equal(f.resultCalls, 0);
    if (mode.legacy) {
      assert.equal(assertZenonTransactionPlanner(f.planner), f.planner);
      assert.equal(result.signature, ''); assert.equal(result.nonce, '0102030405060708');
    } else {
      assert.equal(result.observedUnsignedCheckpointVersion, 1);
      assert.equal(result.accountBlock.signature, ''); assert.equal(result.authority, 'NONE');
      const checked = await VALIDATE(view(f.value), result.originalPlan, result.accountBlock, result.checkpointJson);
      assert.equal(checked.accountBlock.hash, result.accountBlock.hash);
    }
    await used(f);
  }
});
test('wallet candidate enforces exact arity distinct context version and volatile inspection without opening another operation', OPTIONS, async () => {
  const f = fixture(); assert.equal(signedData(f).candidate, null);
  await assert.rejects(f.prepare(), rejected('input_rejected'));
  await assert.rejects(f.prepare({ ...f.context, plannerContextVersion: 5 }), rejected());
  await used(f); assert.equal(f.addressCalls, 0); assert.equal(f.calls.length, 0);
  assert.throws(() => f.planner.getSignedOriginalData(true), rejected('input_rejected'));
  assert.equal(totals.hooks, 0); assert.ok(totals.fixtures <= 48); assert.ok(totals.runs <= 40);
  assert.ok(totals.accountReadCallbacks <= 600); assert.ok(totals.dpReadCallbacks <= 3000);
  assert.ok(totals.declaredResultCallbacks <= 32); assert.ok(totals.materialHandoffs <= 40);
  process.stdout.write('# wallet-candidate-fixture ' + JSON.stringify(totals) + '\n');
});
