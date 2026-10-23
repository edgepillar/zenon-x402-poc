/*
 * Actual SDK/SQL-free funding wire/checkpoint DATA codec cases. One current
 * DP candidate is produced through the actual context-v6 preparer with declared
 * in-process wallet/read doubles, fixed public bytes and invalid signature DATA.
 * No owner module import, SDK, cryptographic signature, SQL, network or payment.
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


import {
  captureZenonDynamicPlasmaOriginalFundingInput as CAPTURE_INPUT,
  assembleZenonDynamicPlasmaOriginalFundingData as ASSEMBLE_DATA,
  snapshotZenonDynamicPlasmaOriginalFundingPins as COPY_PINS,
} from '../src/zenon/dynamic-plasma-original-funding-data.js';
import { encodeB64Json as ENCODE_WIRE, decodeB64Json as DECODE_WIRE } from '../src/x402-wire.js';
import { restoreOriginalPaymentCheckpoint as RESTORE_ORIGINAL,
  encodeOriginalPaymentCheckpoint as ENCODE_ORIGINAL } from '../src/service-credit-pilot-original-payment-checkpoint.js';

const dataCalls = { captures: 0, assemblies: 0, pinReads: 0 };
function captureData(...args) { assert.ok(++dataCalls.captures <= 128); return CAPTURE_INPUT(...args); }
function assembleData(...args) { assert.ok(++dataCalls.assemblies <= 128); return ASSEMBLE_DATA(...args); }
function copyPins(...args) { assert.ok(++dataCalls.pinReads <= 128); return COPY_PINS(...args); }
function dataRejected(error) {
  const code = 'zenon_dynamic_plasma_original_funding_data_rejected';
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, code); assert.equal(error.message, code);
  assert.equal(error.stack, 'TypeError: ' + code); assert.equal(Object.hasOwn(error, 'cause'), false);
  return true;
}
const f = fixture();
const RESOURCE = f.value.paymentRequired.resource.url;
const sourceInput = { plannerContext: copy(f.context), challenge: {
  status: 'PAYMENT_REQUIRED', resourceUrl: RESOURCE,
  paymentRequiredHeader: ENCODE_WIRE(f.value.paymentRequired), paymentRequired: copy(f.value.paymentRequired),
}, originalRequest: { requestId: 'original-request-1', contextId: 'original-context-1',
  requestBodyBase64: '', contextBase64: Buffer.from('independent-original-context\n').toString('base64') } };
const capturedInput = captureData(sourceInput, RESOURCE);
f.context = capturedInput.plannerContext;
const actualCandidate = await start(f);
const sourceCandidate = { originalUnsignedBlock: actualCandidate.originalUnsignedBlock,
  accountBlock: actualCandidate.accountBlock };
const originals = () => copy(sourceInput);
const candidateData = () => copy(sourceCandidate);
const build = (input = originals(), candidate = candidateData(), url = RESOURCE) => assembleData(input, candidate, url);

test('original funding DATA encodes an actual DP candidate into the real wire and V6 checkpoint contracts', OPTIONS, () => {
  const packet = build(); frozen(packet);
  assert.equal(packet.originalFundingDataVersion, 1); assert.equal(packet.transactionHash, actualCandidate.accountBlock.hash);
  assert.equal(packet.signatureValidation, 'NOT_PERFORMED'); assert.equal(packet.persistence, 'NOT_PERFORMED');
  assert.equal(packet.authority, 'NONE');
  const payload = DECODE_WIRE(packet.pair.paymentSignatureHeader);
  assert.deepEqual(payload.payload.transaction, actualCandidate.accountBlock);
  assert.equal(payload.payload.intentDigest, paymentIntentDigest(sourceInput.challenge.paymentRequired, f.value.accepted));
  assert.deepEqual(payload.resource, f.value.paymentRequired.resource);
  const checkpoint = RESTORE_ORIGINAL(packet.serializedCheckpoint, packet.expectedPins);
  assert.equal(ENCODE_ORIGINAL(checkpoint), packet.serializedCheckpoint);
  assert.equal(checkpoint.binding.paymentHash, packet.transactionHash);
  assert.equal(checkpoint.binding.origin, new URL(RESOURCE).origin);
  assert.equal(checkpoint.originalBytes.paymentPayload, packet.pair.paymentSignatureHeader);
  assert.equal(checkpoint.originalBytes.paymentRequirements, sourceInput.challenge.paymentRequiredHeader);
  assert.equal(checkpoint.originalBytes.requestBody, '');
  assert.equal(checkpoint.originalBytes.context, sourceInput.originalRequest.contextBase64);
  assert.equal(f.calls.length, 15); assert.equal(f.resultCalls, 1); assert.equal(f.materialCalls.length, 1);
});
test('original funding DATA retains exact original header body context and IDs rather than reconstructing them', OPTIONS, () => {
  const input = originals();
  const reverse = value => Array.isArray(value) ? value.map(reverse)
    : value === null || typeof value !== 'object' ? value
    : Object.fromEntries(Object.keys(value).reverse().map(k => [k, reverse(value[k])]));
  const reordered = reverse(input.challenge.paymentRequired);
  input.challenge.paymentRequiredHeader = ENCODE_WIRE(reordered);
  input.originalRequest.requestBodyBase64 = Buffer.from([0, 255, 17, 34]).toString('base64');
  input.originalRequest.contextBase64 = Buffer.from([7, 0, 128]).toString('base64');
  input.originalRequest.requestId = 'separate-request';
  input.originalRequest.contextId = 'separate-context';
  const packet = build(input), checkpoint = RESTORE_ORIGINAL(packet.serializedCheckpoint, packet.expectedPins);
  assert.equal(packet.pair.challenge.paymentRequiredHeader, input.challenge.paymentRequiredHeader);
  assert.equal(checkpoint.originalBytes.paymentRequirements, input.challenge.paymentRequiredHeader);
  assert.equal(checkpoint.originalBytes.requestBody, input.originalRequest.requestBodyBase64);
  assert.equal(checkpoint.originalBytes.context, input.originalRequest.contextBase64);
  assert.equal(checkpoint.binding.requestId, 'separate-request'); assert.equal(checkpoint.binding.contextId, 'separate-context');
});
test('original funding DATA has deterministic initial payment encoding regardless of caller field insertion order', OPTIONS, () => {
  const reverse = value => Array.isArray(value) ? value.map(reverse)
    : value === null || typeof value !== 'object' ? value
    : Object.fromEntries(Object.keys(value).reverse().map(k => [k, reverse(value[k])]));
  const expected = build(), result = build(reverse(originals()), reverse(candidateData()));
  assert.equal(result.pair.paymentSignatureHeader, expected.pair.paymentSignatureHeader);
  assert.equal(result.serializedCheckpoint, expected.serializedCheckpoint);
  assert.deepEqual(result.expectedPins, expected.expectedPins);
});
test('original funding DATA rejects changed independent intent resource and selected requirement bindings', OPTIONS, () => {
  for (const edit of [
    x => { x.plannerContext.readInput.accepted.amount = '6'; },
    x => { x.plannerContext.readInput.paymentRequired.resource.url = 'https://resource.invalid/other'; },
    x => { x.challenge.paymentRequired.resource.description = 'Different resource.'; },
    x => { x.challenge.resourceUrl = 'https://resource.invalid/other'; },
    x => { x.plannerContext.readInput.payerAddress = PAYEE; },
  ]) {
    const input = originals(); edit(input); assert.throws(() => build(input), dataRejected);
  }
  const input = originals(), other = 'https://resource.invalid/other';
  input.challenge.resourceUrl = other; input.challenge.paymentRequired.resource.url = other;
  input.plannerContext.readInput.paymentRequired.resource.url = other;
  input.challenge.paymentRequiredHeader = ENCODE_WIRE(input.challenge.paymentRequired);
  assert.throws(() => build(input, candidateData(), other), dataRejected); // Old transaction intent cannot follow a new resource.
});
test('original funding DATA rejects changed complete candidate fields including unhashed public key and rehashed nonce', OPTIONS, () => {
  const edits = [
    b => { b.publicKey = Buffer.alloc(32, 9).toString('base64'); },
    b => { b.amount = '6'; },
    b => { b.momentumAcknowledged.height++; },
    b => { b.fusedPlasma--; },
    b => { b.nonce = '0807060504030201';
      b.hash = computeZenonUnsignedUserSendHash({ ...b, signature: '' }); },
  ];
  for (const edit of edits) {
    const c = candidateData(); edit(c.accountBlock); assert.throws(() => build(originals(), c), dataRejected);
  }
  const c = candidateData(); c.accountBlock.extra = true;
  assert.throws(() => build(originals(), c), dataRejected);
});
test('original funding DATA never presents signature-shaped DATA as cryptographic verification', OPTIONS, () => {
  const first = build(), c = candidateData();
  c.accountBlock.signature = Buffer.alloc(64, 43).toString('base64'); // Also deliberately not a valid signature.
  const second = build(originals(), c);
  assert.equal(second.signatureValidation, 'NOT_PERFORMED'); assert.equal(second.authority, 'NONE');
  assert.notEqual(second.pair.paymentSignatureHeader, first.pair.paymentSignatureHeader);
  assert.notEqual(second.expectedPins.digests.paymentPayload, first.expectedPins.digests.paymentPayload);
  assert.equal(second.transactionHash, first.transactionHash);
});
test('original funding DATA rejects a coherently rehashed transfer that disagrees with independently captured intent', OPTIONS, () => {
  for (const edit of [b => { b.amount = '6'; },
    b => { b.data = Buffer.from('aa'.repeat(32), 'hex').toString('base64'); }]) {
    const c = candidateData(); edit(c.originalUnsignedBlock);
    c.originalUnsignedBlock.hash = computeZenonUnsignedUserSendHash(c.originalUnsignedBlock);
    c.accountBlock = { ...copy(c.originalUnsignedBlock), signature: SIGNATURE };
    assert.throws(() => build(originals(), c), dataRejected);
  }
});
test('original funding DATA rejects empty malformed noncanonical oversized and nonstring signature fields', OPTIONS, () => {
  const hook = () => { totals.hooks++; throw Error('PRIVATE'); };
  for (const signature of ['', SIGNATURE.slice(0, -1), SIGNATURE + '\n', 'A'.repeat(89),
    SIGNATURE.slice(0, -3) + 'p==', Buffer.alloc(63).toString('base64'), null, { toString: hook }]) {
    const c = candidateData(); c.accountBlock.signature = signature;
    assert.throws(() => build(originals(), c), dataRejected);
  }
  assert.equal(totals.hooks, 0);
});
test('original funding DATA requires independently retained pins and refuses canonical bytes with different expectations', OPTIONS, () => {
  const packet = build(), copied = copyPins(packet.serializedCheckpoint, packet.expectedPins);
  assert.deepEqual(copied, packet.expectedPins); frozen(copied);
  for (const edit of [p => { p.binding.requestId = 'other'; }, p => { p.binding.paymentHash = ZERO; },
    p => { p.binding.contextId = 'other'; }, p => { p.digests.context = ZERO; },
    p => { p.digests.paymentPayload = ZERO; }]) {
    const pins = copy(packet.expectedPins); edit(pins);
    assert.throws(() => copyPins(packet.serializedCheckpoint, pins), dataRejected);
  }
  assert.throws(() => copyPins(packet.serializedCheckpoint + '\n', packet.expectedPins), dataRejected);
});
test('original funding DATA keeps raw base64 limits canonical JSON and empty-body semantics distinct', OPTIONS, () => {
  const full = originals();
  full.originalRequest.requestBodyBase64 = Buffer.alloc(4096, 2).toString('base64');
  full.originalRequest.contextBase64 = Buffer.alloc(4096, 3).toString('base64');
  const packet = build(full), checkpoint = RESTORE_ORIGINAL(packet.serializedCheckpoint, packet.expectedPins);
  assert.equal(checkpoint.originalBytes.requestBody, full.originalRequest.requestBodyBase64);
  assert.equal(checkpoint.originalBytes.context, full.originalRequest.contextBase64);
  for (const edit of [
    x => { x.originalRequest.requestBodyBase64 = Buffer.alloc(4097).toString('base64'); },
    x => { x.originalRequest.contextBase64 = ''; },
    x => { x.originalRequest.contextBase64 = 'AB=='; },
    x => { x.challenge.paymentRequiredHeader = Buffer.from(JSON.stringify(x.challenge.paymentRequired, null, 2)).toString('base64'); },
    x => { x.challenge.paymentRequiredHeader += '\n'; },
    x => { x.challenge.paymentRequiredHeader = ENCODE_WIRE({ ...x.challenge.paymentRequired, x402Version: 3 }); },
  ]) {
    const input = originals(); edit(input); assert.throws(() => captureData(input, RESOURCE), dataRejected);
  }
  assert.equal(RESTORE_ORIGINAL(build().serializedCheckpoint, build().expectedPins).originalBytes.requestBody, '');
});
test('original funding DATA rejects unsafe funding URLs invalid identifiers and unknown schemas before any operation', OPTIONS, () => {
  for (const url of ['http://resource.invalid/paid', 'https://resource.invalid/', RESOURCE + '?q=1',
    RESOURCE + '#fragment', 'https://user@resource.invalid/paid', 'https://resource.invalid/%70aid']) {
    assert.throws(() => captureData(originals(), url), dataRejected);
  }
  for (const edit of [
    x => { x.originalRequest.requestId = ''; }, x => { x.originalRequest.contextId = 'x'.repeat(257); },
    x => { x.originalRequest.contextId = '\ud800'; }, x => { x.originalRequest.requestId = 'bad\nid'; },
    x => { x.plannerContext.plannerContextVersion = 5; }, x => { x.plannerContext.readInput.phase = 'SIGNED'; },
    x => { x.plannerContext.readInput.runtimeContextDigest = 'floating'; }, x => { x.extra = true; },
  ]) {
    const input = originals(); edit(input); assert.throws(() => captureData(input, RESOURCE), dataRejected);
  }
});
test('original funding DATA rejects getters proxies coercion cycles and pin hooks without invoking them', OPTIONS, () => {
  const hook = () => { totals.hooks++; throw Error('PRIVATE'); };
  const input = originals(), c = candidateData(), packet = build();
  const nested = originals(); Object.defineProperty(nested.originalRequest, 'contextBase64', { enumerable: true, get: hook });
  const inputProxy = new Proxy(input, { get: hook, getPrototypeOf: hook, ownKeys: hook });
  const candidateProxy = new Proxy(c, { get: hook, getPrototypeOf: hook, ownKeys: hook });
  const getter = candidateData(); Object.defineProperty(getter.accountBlock, 'signature', { enumerable: true, get: hook });
  const pins = copy(packet.expectedPins); Object.defineProperty(pins.binding, 'paymentHash', { enumerable: true, get: hook });
  assert.throws(() => captureData(inputProxy, RESOURCE), dataRejected);
  assert.throws(() => captureData(nested, RESOURCE), dataRejected);
  assert.throws(() => build(input, candidateProxy), dataRejected);
  assert.throws(() => build(input, getter), dataRejected);
  assert.throws(() => copyPins(packet.serializedCheckpoint, pins), dataRejected);
  const cycle = originals(); cycle.originalRequest.cycle = cycle;
  assert.throws(() => captureData(cycle, RESOURCE), dataRejected);
  assert.throws(() => captureData(input, { toString: hook }), dataRejected);
  assert.equal(totals.hooks, 0);
});
test('original funding DATA detaches and freezes retained output without mutating or freezing caller records', OPTIONS, () => {
  const input = originals(), c = candidateData(), before = copy(input), expected = copy(c);
  const captured = captureData(input, RESOURCE), packet = assembleData(captured, c, RESOURCE);
  assert.deepEqual(input, before); assert.deepEqual(c, expected);
  assert.equal(Object.isFrozen(input), false); assert.equal(Object.isFrozen(c.accountBlock), false);
  input.originalRequest.contextBase64 = Buffer.from('changed caller').toString('base64');
  c.accountBlock.signature = ''; c.accountBlock.momentumAcknowledged.height = 999;
  assert.equal(packet.paymentPayload.payload.transaction.signature, SIGNATURE);
  assert.equal(packet.paymentPayload.payload.transaction.momentumAcknowledged.height, 100);
  assert.equal(RESTORE_ORIGINAL(packet.serializedCheckpoint, packet.expectedPins).originalBytes.context,
    before.originalRequest.contextBase64);
  frozen(captured); frozen(packet);
});
test('original funding DATA enforces exact arity and exposes no preflight store signer or dispatch authority', OPTIONS, () => {
  assert.throws(() => captureData(originals()), dataRejected);
  assert.throws(() => captureData(originals(), RESOURCE, true), dataRejected);
  assert.throws(() => assembleData(originals(), candidateData()), dataRejected);
  assert.throws(() => assembleData(originals(), candidateData(), RESOURCE, true), dataRejected);
  assert.throws(() => copyPins(), dataRejected);
  const packet = build();
  for (const key of ['prepare', 'commit', 'dispatch', 'sign', 'preflight', 'retry']) assert.equal(key in packet, false);
  assert.equal(packet.signatureValidation, 'NOT_PERFORMED'); assert.equal(packet.authority, 'NONE');
  assert.equal(totals.fixtures, 1); assert.equal(totals.runs, 1);
  assert.equal(totals.declaredAddressCallbacks, 1); assert.equal(totals.declaredResultCallbacks, 1);
  assert.equal(totals.accountReadCallbacks, 15); assert.equal(totals.dpReadCallbacks, 60);
  assert.equal(totals.materialHandoffs, 1); assert.equal(totals.hooks, 0);
  process.stdout.write('# original-funding-data-fixture ' + JSON.stringify({ ...dataCalls,
    candidatePreparations: totals.runs, declaredAddressCallbacks: totals.declaredAddressCallbacks,
    declaredResultCallbacks: totals.declaredResultCallbacks, accountReadCallbacks: totals.accountReadCallbacks,
    dpReadCallbacks: totals.dpReadCallbacks, materialHandoffs: totals.materialHandoffs, hooks: totals.hooks }) + '\n');
});
