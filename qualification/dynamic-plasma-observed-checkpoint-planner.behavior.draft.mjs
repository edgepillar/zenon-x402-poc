/*
 * Six selected current-source integration cases. Fixed public bytes and
 * literal zero-difficulty nonce only; no old qualification entry is imported.
 * No SDK, key/signature operation, nonce search, SQL, socket, real PREPARE,
 * actual payment or live/runtime qualification. The managed caller pins the
 * complete real source closure and retains complete mandatory evidence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  createObservedBalanceDeferredMaterialCheckpointPreparer as CREATE,
  createObservedBalanceDeferredMaterialDynamicPlasmaTransactionPlanner as LEGACY,
} from '../src/zenon/dynamic-plasma-observed-balance-deferred-material-planner.js';
import { createDynamicPlasmaJsonRpcReadTransport as WIRE } from '../src/zenon/dynamic-plasma-json-rpc-read-transport.js';
import { validateObservedZenonUnsignedOriginalQuoteCheckpoint as VALIDATE } from '../src/zenon/dynamic-plasma-observed-original-checkpoint.js';
import { paymentIntentDigest } from '../src/canonical.js';
import { assertZenonTransactionPlanner } from '../src/zenon/transaction-planner.js';
import { snapshotDynamicPlasmaQuoteRequestContext } from '../src/zenon/dynamic-plasma-observation-normalizer.js';

assert.equal(process.argv.length, 2);
const OPTIONS = { timeout: 5000, concurrency: false };
const copy = value => JSON.parse(JSON.stringify(value)); // Owned fixture DATA.
const ZERO = '0'.repeat(64), H = '33'.repeat(32), PREVIOUS = '66'.repeat(32);
const ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx';
const PUBLIC = Buffer.alloc(32, 7).toString('base64'); // Existing public DATA.
const totals = {
  checkpointPlanners: 0, legacyPlanners: 0, admittedRuns: 0,
  materialHandoffs: 0, accountReadCallbacks: 0, dpReadCallbacks: 0,
  checkpointResults: 0, legacyBlockResults: 0, independentCheckpointValidations: 0, hooks: 0,
};
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
function fixture(mode = {}) {
  const value = context(), calls = [], positions = [0, 0], materialCalls = [], finalReady = cap();
  const f = { value, calls, positions, materialCalls, finalReady,
    ages: mode.ages || [0, 0, 0, 0], stage: 0, pending: null };
  const transports = [0, 1].map(endpoint => WIRE({ exchange: function exchange(body) {
    const request = JSON.parse(body), index = positions[endpoint]++ % 6;
    totals.dpReadCallbacks++; assert.ok(totals.dpReadCallbacks <= 400);
    assert.equal(request.id, positions[endpoint]); assert.equal(request.method, METHODS[index]);
    const current = advanced(value, f.ages[f.stage - 1]), e = current.observation.endpointObservations[endpoint];
    const two = { ...e.beforeFrontier, version: 1, height: 2, hash: '22'.repeat(32),
      nextFusionPrice: 0, nextWorkPrice: 0 };
    const script = [momentum(e.beforeFrontier), { count: 200, list: [momentum(two)] },
      { count: e.sporks.count, list: e.sporks.list.map(s => ({ ...s, description: 'Synthetic.' })) },
      copy(e.plasmaVariables), copy(e.rpcObservation), momentum(e.afterFrontier)];
    return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: script[index] }));
  } }));
  f.options = {
    readOptions: { transports, accountExchange: function accountExchange(body) {
      const request = JSON.parse(body); calls.push(request); totals.accountReadCallbacks++;
      assert.ok(totals.accountReadCallbacks <= 120); assert.equal(request.id, calls.length);
      assert.deepEqual(request.params, [PAYER]);
      assert.ok(request.method === 'ledger.getFrontierAccountBlock' || request.method === 'ledger.getAccountInfoByAddress');
      f.stage = Math.floor((calls.length - 1) / 3) + 1; assert.ok(f.stage <= 4);
      const result = request.method === 'ledger.getAccountInfoByAddress'
        ? { address: PAYER, accountHeight: 6, balanceInfoMap: { [ASSET]: {
          token: { tokenStandard: ASSET }, balance: mode.insufficientFinal && f.stage === 4 ? '4' : '5' } } }
        : frontierBlock();
      if (mode.movedFinal && f.stage === 4 && request.method === 'ledger.getFrontierAccountBlock') {
        result.height = 7; result.hash = '99'.repeat(32);
      }
      const text = JSON.stringify({ jsonrpc: '2.0', id: request.id, result });
      if (mode.deferFinal && calls.length === 12) {
        const gate = cap(); f.releaseFinal = () => gate.resolve(text); finalReady.resolve();
        return gate.promise;
      }
      return Promise.resolve(text);
    } },
    materialExchange: function materialExchange(request) {
      totals.materialHandoffs++; assert.ok(totals.materialHandoffs <= 10);
      assert.equal(arguments.length, 1); assert.equal(this, undefined);
      assert.equal(request.materialRequestVersion, 1); assert.equal(request.phase, 'UNSIGNED');
      assert.equal(request.workRequest.accountBlock.momentumAcknowledged.height, 100);
      assert.equal(request.workRequest.accountBlock.difficulty, 0); frozen(request);
      materialCalls.push(request); assert.equal(materialCalls.length, 1);
      assert.equal(calls.length, 6); assert.deepEqual(positions, [12, 12]);
      return mode.selfMaterial ? f.pending : Promise.resolve({
        materialVersion: 1, publicKey: PUBLIC, nonce: '0102030405060708' });
    },
  };
  f.context = { plannerContextVersion: mode.legacy ? 3 : 4, readInput: {
    observedUserSendReadVersion: 3, phase: 'UNSIGNED', paymentRequired: value.paymentRequired,
    accepted: value.accepted, payerAddress: PAYER, compiledSporkIds: value.compiledSporkIds,
    policy: value.policy, runtimeContextDigest: value.runtimeContextDigest } };
  f.planner = (mode.legacy ? LEGACY : CREATE)(f.options);
  totals[mode.legacy ? 'legacyPlanners' : 'checkpointPlanners']++;
  const method = mode.legacy ? 'prepareUnsigned' : 'prepareUnsignedCheckpoint';
  f.prepare = f.planner[method];
  assert.deepEqual(Object.keys(f.planner), [method]); frozen(f.planner);
  if (mode.legacy) assert.equal(assertZenonTransactionPlanner(f.planner), f.planner);
  else assert.throws(() => assertZenonTransactionPlanner(f.planner), TypeError);
  assert.equal(calls.length, 0); assert.deepEqual(positions, [0, 0]); assert.equal(materialCalls.length, 0);
  return f;
}
function start(f) {
  totals.admittedRuns++; assert.ok(totals.admittedRuns <= 10);
  f.pending = f.prepare(f.context);
  assert.equal(Object.getPrototypeOf(f.pending), Promise.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(f.pending, 'constructor').value, Promise);
  return f.pending;
}
function frozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) frozen(child);
}
function rejected(kind = 'operation_rejected') {
  return error => {
    assert.ok(error instanceof (kind === 'busy' ? Error : TypeError)); assert.ok(Object.isFrozen(error));
    const code = 'zenon_observed_balance_deferred_material_dp_planner_' + kind;
    assert.equal(error.code, code); assert.equal(error.message, code);
    assert.equal(error.stack, (kind === 'busy' ? 'Error: ' : 'TypeError: ') + code);
    assert.equal(Object.hasOwn(error, 'cause'), false); return true;
  };
}
function hostile() {
  const hook = () => { totals.hooks++; throw Error('PRIVATE'); };
  return new Proxy({}, { get: hook, ownKeys: hook, getPrototypeOf: hook });
}
async function used(f) {
  const counts = [f.calls.length, ...f.positions, f.materialCalls.length];
  await assert.rejects(f.prepare(hostile()), rejected('used'));
  assert.deepEqual([f.calls.length, ...f.positions, f.materialCalls.length], counts);
}
async function checkPacket(f, packet, original = f.value) {
  totals.checkpointResults++;
  assert.equal(Object.getPrototypeOf(packet), null); frozen(packet);
  assert.equal(packet.observedUnsignedCheckpointVersion, 1); assert.equal(packet.phase, 'UNSIGNED');
  assert.equal(packet.originalPlan.subject.momentumAcknowledged.height, 100);
  assert.equal(packet.originalPlan.subject.momentumAcknowledged.hash, H);
  assert.equal(packet.originalPlan.subject.amount, '5');
  assert.equal(packet.accountBlock.height, 7); assert.equal(packet.accountBlock.previousHash, PREVIOUS);
  assert.equal(packet.accountBlock.momentumAcknowledged.height, 100);
  assert.equal(packet.accountBlock.nonce, '0102030405060708'); assert.equal(packet.accountBlock.difficulty, 0);
  assert.equal(packet.accountBlock.fusedPlasma, 25410); assert.equal(packet.accountBlock.signature, '');
  const text = JSON.parse(packet.checkpointJson);
  assert.deepEqual(text.accountBlock, packet.accountBlock); assert.deepEqual(text.quote, packet.originalPlan.quote);
  assert.equal(text.phase, 'UNSIGNED'); assert.equal(text.checkpointVersion, 1);
  const checked = await VALIDATE(view(original, f.ages[3]), packet.originalPlan, packet.accountBlock, packet.checkpointJson);
  totals.independentCheckpointValidations++;
  assert.deepEqual(checked.accountBlock, packet.accountBlock); assert.equal(checked.authority, 'NONE');
  assert.equal(packet.declaredBalanceRead, 'VALIDATED_IN_THIS_BRACKETED_READ_CYCLE');
  for (const key of ['currentAuthority', 'signingAuthorization', 'chainAuthentication'])
    assert.equal(packet[key], 'NOT_ESTABLISHED');
  assert.equal(packet.persistence, 'NOT_PERFORMED'); assert.equal(packet.authority, 'NONE');
  assert.equal(f.calls.length, 12); assert.deepEqual(f.positions, [24, 24]); assert.equal(f.materialCalls.length, 1);
}
let originalBlock = null;
test('checkpoint planner carries its actual first quote and same block after final fresh balance and two price advances', OPTIONS, async () => {
  const f = fixture({ ages: [0, 0, 1, 2] }), packet = await start(f);
  await checkPacket(f, packet); originalBlock = copy(packet.accountBlock); await used(f);
});
test('checkpoint planner exposes no packet before the final bracket and keeps busy or used ahead of hostile inputs', OPTIONS, async () => {
  const f = fixture({ deferFinal: true }); let settled = false;
  const pending = start(f); pending.then(() => { settled = true; }, () => { settled = true; });
  await f.finalReady.promise;
  assert.equal(settled, false); assert.equal(f.calls.length, 12); assert.deepEqual(f.positions, [24, 24]);
  await assert.rejects(f.prepare(hostile()), rejected('busy'));
  assert.equal(settled, false); assert.equal(f.materialCalls.length, 1);
  f.releaseFinal(); const packet = await pending; await checkPacket(f, packet); await used(f);
});
test('checkpoint planner rejects expired price insufficient final balance and changed final account without replacement', OPTIONS, async () => {
  for (const [mode, accountCalls] of [
    [{ ages: [0, 0, 3, 3] }, 9], [{ insufficientFinal: true }, 11], [{ movedFinal: true }, 10],
  ]) {
    const f = fixture(mode); await assert.rejects(start(f), rejected());
    assert.equal(f.calls.length, accountCalls); assert.deepEqual(f.positions, [18, 18]);
    assert.equal(f.materialCalls.length, 1); await used(f);
  }
});
test('checkpoint planner explicitly selects version4 and snapshots its original context without changing the caller', OPTIONS, async () => {
  const wrong = fixture(); await assert.rejects(wrong.prepare(), rejected('input_rejected'));
  wrong.context.plannerContextVersion = 3; await assert.rejects(start(wrong), rejected()); await used(wrong);
  assert.equal(wrong.calls.length, 0); assert.equal(wrong.materialCalls.length, 0);
  const old = fixture({ legacy: true }); old.context.plannerContextVersion = 4;
  await assert.rejects(start(old), rejected()); await used(old); assert.equal(old.calls.length, 0);
  const f = fixture(), original = copy(f.value), pending = start(f);
  f.context.plannerContextVersion = 99; f.context.readInput.phase = 'SIGNED';
  f.context.readInput.observedUserSendReadVersion = 99;
  f.context.readInput.policy.maxMomentumAdvances = 0; f.context.readInput.runtimeContextDigest = null;
  f.options.materialExchange = () => { totals.hooks++; throw Error('PRIVATE'); };
  const packet = await pending; await checkPacket(f, packet, original);
  assert.equal(Object.isFrozen(f.context), false); assert.equal(Object.isFrozen(f.context.readInput), false);
  await used(f);
});
test('changed-source legacy version3 still returns only its original block through the same four read cycles', OPTIONS, async () => {
  const f = fixture({ legacy: true, ages: [0, 0, 1, 2] }), block = await start(f);
  totals.legacyBlockResults++; frozen(block);
  assert.equal(Object.getPrototypeOf(block), Object.prototype); assert.deepEqual(block, originalBlock);
  for (const key of ['checkpointJson', 'originalPlan', 'accountBlock', 'observedUnsignedCheckpointVersion'])
    assert.equal(Object.hasOwn(block, key), false);
  assert.equal(f.calls.length, 12); assert.deepEqual(f.positions, [24, 24]); assert.equal(f.materialCalls.length, 1);
  await used(f);
});
test('checkpoint planner rejects its own public material promise before assembly without a replacement handoff', OPTIONS, async t => {
  const f = fixture({ selfMaterial: true }); await assert.rejects(start(f), rejected());
  assert.equal(f.calls.length, 6); assert.deepEqual(f.positions, [12, 12]); assert.equal(f.materialCalls.length, 1);
  await used(f);
  assert.deepEqual(totals, { checkpointPlanners: 8, legacyPlanners: 2, admittedRuns: 10,
    materialHandoffs: 8, accountReadCallbacks: 84, dpReadCallbacks: 324,
    checkpointResults: 3, legacyBlockResults: 1, independentCheckpointValidations: 3, hooks: 0 });
  t.diagnostic(JSON.stringify({ kind: 'P1A_CHECKPOINT_PLANNER', ...totals,
    nonceSearchCalls: 0, candidateEvaluations: 0, keyGeneration: 0, signatures: 0,
    persistentWrites: 0, oldQualificationEntriesRegistered: 0, extraReadCyclesForCheckpoint: 0,
    qualification: 'DECLARED_FIXED_DATA_ONLY_NOT_LIVE_DP' }));
});
