/*
 * Actual original-funding DATA v2 with the contextv7 retained candidate stage.
 * Fixed invalid signature-shaped bytes and zero-difficulty material only.
 * No SDK, signature operation, keys, nonce search, SQL, network or payment.
 * Existing historical fixture/results remain unchanged.
 */
import test, { after } from 'node:test';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  createObservedBalanceDeadlineBoundMaterialCheckpointPreparer as CREATE,
  createObservedBalanceDeadlineBoundMaterialWalletCandidatePreparer as WALLET,
  createObservedBalanceDeadlineBoundMaterialRetainedCandidatePreparer as RETAINED,
  createObservedBalanceDeferredMaterialCheckpointPreparer as COMPAT,
  createObservedBalanceDeferredMaterialDynamicPlasmaTransactionPlanner as LEGACY,
} from '../src/zenon/dynamic-plasma-observed-balance-deferred-material-planner.js';
import { createDynamicPlasmaJsonRpcReadTransport as WIRE } from '../src/zenon/dynamic-plasma-json-rpc-read-transport.js';
import { validateObservedZenonUnsignedOriginalQuoteCheckpoint as VALIDATE } from '../src/zenon/dynamic-plasma-observed-original-checkpoint.js';
import { paymentIntentDigest } from '../src/canonical.js';
import { assertZenonTransactionPlanner, computeZenonUnsignedUserSendHash } from '../src/zenon/transaction-planner.js';
import { snapshotDynamicPlasmaQuoteRequestContext } from '../src/zenon/dynamic-plasma-observation-normalizer.js';

const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF),'..');
assert.equal(process.argv.length,2); assert.equal(process.argv[1],SELF);
assert.equal(process.versions.node,'24.19.0'); assert.equal(process.platform,'darwin'); assert.equal(process.arch,'arm64');
assert.equal(process.env.X402_DP_FUNDING_V2_OPT_IN,'declared-funding-v2-no-sdk-sql-sign');
const PINS = JSON.parse(process.env.X402_DP_FUNDING_V2_PINS);
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
function sourcePins() {
  let total=0;
  return PINS.map(p => {
    const path=join(REPO,p.path),s=lstatSync(path,{bigint:true});
    assert.ok(s.isFile()&&!s.isSymbolicLink()); assert.equal(s.nlink,1n);
    assert.equal(s.uid,BigInt(process.getuid())); assert.deepEqual(ids(s),p.identity);
    const raw=readFileSync(path); assert.equal(raw.length,p.bytes); total+=raw.length; assert.ok(total<=2*1048576);
    assert.equal(createHash('sha256').update(raw).digest('hex'),p.sha256);
    assert.deepEqual(ids(lstatSync(path,{bigint:true})),p.identity);
    return [p.path,p.bytes,p.sha256,p.identity];
  });
}
const before=sourcePins();
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
    ages: mode.ages || [0, 0, 0, 0, 0, 0], addressCalls: 0, resultCalls: 0,
    walletReady: cap(), walletGate: cap(), materialReady: cap(), materialGate: cap(),
    currentReadReady: cap(), currentReadGate: cap(), sixthReady: cap(), sixthGate: cap(), onSixth: null, originalUnsigned: null, expectedCandidate: null };
  const transports = [0, 1].map(endpoint => WIRE({ exchange: function exchange(body) {
    const request = JSON.parse(body), index = positions[endpoint]++ % 6;
    assert.ok(++totals.dpReadCallbacks <= 3000);
    assert.equal(request.id, positions[endpoint]); assert.equal(request.method, METHODS[index]);
    const current = advanced(value, f.ages[f.stage - 1]), e = current.observation.endpointObservations[endpoint];
    if (mode.changedFinalP && f.stage === 5 || mode.changedSixthP && f.stage === 6) e.plasmaVariables.MaxPriceChangePercent = 11;
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
      f.stage = Math.floor((calls.length - 1) / 3) + 1; assert.ok(f.stage <= 6);
      const balance = mode.insufficientFinal && f.stage === 5 || mode.insufficientSixth && f.stage === 6 ? '4' : '5';
      const result = request.method === 'ledger.getAccountInfoByAddress'
        ? { address: PAYER, accountHeight: 6, balanceInfoMap: { [ASSET]: {
          token: { tokenStandard: ASSET }, balance } } } : frontierBlock();
      if ((mode.movedFinal && f.stage === 5 || mode.movedSixth && f.stage === 6) && request.method === 'ledger.getFrontierAccountBlock') {
        result.height = 7; result.hash = '99'.repeat(32);
      }
      const text = JSON.stringify({ jsonrpc: '2.0', id: request.id, result });
      if (calls.length===16) {
        if(f.onSixth!==null) f.onSixth();
        if(mode.badSixth) return Promise.resolve('not-json');
        if(mode.deferSixth) { f.releaseSixth=()=>f.sixthGate.resolve(text); f.sixthReady.resolve(); return f.sixthGate.promise; }
      }
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
  f.context = { plannerContextVersion: mode.legacy ? 3 : mode.compat ? 4 : mode.deadline ? 5 : mode.v6 ? 6 : 7,
    readInput: { observedUserSendReadVersion: 3, phase: 'UNSIGNED',
      paymentRequired: value.paymentRequired, accepted: value.accepted, payerAddress: PAYER,
      compiledSporkIds: value.compiledSporkIds, policy: value.policy, runtimeContextDigest: value.runtimeContextDigest } };
  if (!mode.legacy && !mode.compat) f.options.materialWaitMs = mode.waitMs ?? 250;
  if (!old) f.options.wallet = wallet;
  f.planner = (mode.legacy ? LEGACY : mode.compat ? COMPAT : mode.deadline ? CREATE : mode.v6 ? WALLET : RETAINED)(f.options);
  f.prepare = mode.legacy ? f.planner.prepareUnsigned : old
    ? f.planner.prepareUnsignedCheckpoint : f.planner.prepareSignedCandidate;
  assert.equal(calls.length, 0); assert.equal(f.addressCalls, 0); assert.equal(f.resultCalls, 0); frozen(f.planner);
  if (!old) {
    assert.deepEqual(Object.keys(f.planner), mode.v6 ? ['prepareSignedCandidate','getMaterialWaitSnapshot','getSignedOriginalData'] : ['prepareSignedCandidate','getMaterialWaitSnapshot','getSignedOriginalData','revalidateSignedOriginal']);
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
  captureZenonDynamicPlasmaOriginalFundingInput as CAPTURE_V1,
  assembleZenonDynamicPlasmaOriginalFundingData as ASSEMBLE_V1,
  captureZenonDynamicPlasmaOriginalFundingInputV2 as CAPTURE_V2,
  assembleZenonDynamicPlasmaOriginalFundingDataV2 as ASSEMBLE_V2,
  snapshotZenonDynamicPlasmaOriginalFundingPins as COPY_PINS,
} from '../src/zenon/dynamic-plasma-original-funding-data.js';
import { encodeB64Json as ENCODE_WIRE, decodeB64Json as DECODE_WIRE } from '../src/x402-wire.js';
import {
  restoreOriginalPaymentCheckpoint as RESTORE,
  encodeOriginalPaymentCheckpoint as ENCODE_CHECKPOINT,
} from '../src/service-credit-pilot-original-payment-checkpoint.js';

const dataCalls = { captures: 0, assemblies: 0, pins: 0 };
function captureData(...args) { assert.ok(++dataCalls.captures <= 160); return CAPTURE_V2(...args); }
function assembleData(...args) { assert.ok(++dataCalls.assemblies <= 160); return ASSEMBLE_V2(...args); }
function pinsData(...args) { assert.ok(++dataCalls.pins <= 100); return COPY_PINS(...args); }
function dataRejected(error) {
  const code = 'zenon_dynamic_plasma_original_funding_data_rejected';
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  assert.equal(error.code, code); assert.equal(error.message, code);
  assert.equal(error.stack, 'TypeError: ' + code); assert.equal(Object.hasOwn(error, 'cause'), false);
  return true;
}
function inputFor(f) {
  return { plannerContext: copy(f.context), challenge: {
    status: 'PAYMENT_REQUIRED', resourceUrl: f.value.paymentRequired.resource.url,
    paymentRequiredHeader: ENCODE_WIRE(f.value.paymentRequired), paymentRequired: copy(f.value.paymentRequired),
  }, originalRequest: { requestId: 'retained-original-request', contextId: 'independent-original-context',
    requestBodyBase64: '', contextBase64: Buffer.from('independent-caller-context\n').toString('base64') } };
}
function counters(f) { return [f.calls.length,...f.positions,f.addressCalls,f.resultCalls,f.materialCalls.length]; }
function pairOf(candidate) {
  return { originalUnsignedBlock: candidate.originalUnsignedBlock, accountBlock: candidate.accountBlock };
}
async function funding(mode = {}) {
  const f = fixture(mode), incoming = inputFor(f), url = incoming.challenge.resourceUrl;
  const captured = mode.v6 ? CAPTURE_V1(incoming, url) : captureData(incoming, url);
  f.context = captured.plannerContext;
  const candidate = await start(f), pair = pairOf(candidate);
  const packet = mode.v6 ? ASSEMBLE_V1(captured, pair, url) : assembleData(captured, pair, url);
  return { f, incoming, captured, candidate, pair, packet, url };
}
function unchangedPacket(state, expected) {
  assert.equal(JSON.stringify(state.packet), expected);
  assert.deepEqual(DECODE_WIRE(state.packet.pair.paymentSignatureHeader).payload.transaction,
    state.candidate.accountBlock);
  assert.equal(ENCODE_CHECKPOINT(RESTORE(state.packet.serializedCheckpoint, state.packet.expectedPins)),
    state.packet.serializedCheckpoint);
  assert.equal(state.packet.signatureValidation, 'NOT_PERFORMED');
  assert.equal(state.packet.persistence, 'NOT_PERFORMED'); assert.equal(state.packet.authority, 'NONE');
  frozen(state.packet);
}
const base = await funding();

test('contextv7 DATA capture detaches independent originals before any candidate callback', OPTIONS, () => {
  const f = fixture(), incoming = inputFor(f), captured = captureData(incoming, incoming.challenge.resourceUrl);
  frozen(captured); assert.equal(captured.plannerContext.plannerContextVersion, 7);
  incoming.originalRequest.contextBase64 = Buffer.from('later caller mutation').toString('base64');
  incoming.plannerContext.readInput.policy.maxMomentumAdvances = 0;
  assert.notEqual(captured.originalRequest.contextBase64, incoming.originalRequest.contextBase64);
  assert.equal(captured.plannerContext.readInput.policy.maxMomentumAdvances, 2);
  assert.deepEqual(counters(f), [0,0,0,0,0,0]);
});
test('actual contextv7 candidate encodes DATA v2 with exact original headers and checkpoint pins', OPTIONS, () => {
  const { packet, candidate, incoming, url, f } = base;
  assert.equal(packet.originalFundingDataVersion, 2);
  assert.equal(packet.transactionHash, candidate.accountBlock.hash);
  const checkpoint = RESTORE(packet.serializedCheckpoint, packet.expectedPins);
  assert.equal(checkpoint.originalBytes.paymentPayload, packet.pair.paymentSignatureHeader);
  assert.equal(checkpoint.originalBytes.paymentRequirements, incoming.challenge.paymentRequiredHeader);
  assert.equal(checkpoint.originalBytes.requestBody, '');
  assert.equal(checkpoint.originalBytes.context, incoming.originalRequest.contextBase64);
  assert.equal(checkpoint.binding.origin, new URL(url).origin);
  assert.deepEqual(counters(f), [15,30,30,1,1,1]);
  unchangedPacket(base, JSON.stringify(packet));
});
for (const age of [1,2]) test(
  'initial v2 wire and pins remain byte-identical after pre-custody price advances ' + age,
  OPTIONS, async () => {
    const state = await funding({ ages: [0,0,0,0,0,age] }), original = JSON.stringify(state.packet);
    const pins = pinsData(state.packet.serializedCheckpoint, copy(state.packet.expectedPins));
    const result = await state.f.planner.revalidateSignedOriginal();
    assert.equal(result.observedSignedCandidateVersion, 2);
    assert.equal(result.validationPurpose, 'BEFORE_ORIGINAL_SIGNED_CUSTODY');
    assert.equal(result.signing, 'NOT_INVOKED');
    assert.deepEqual(result.accountBlock, state.candidate.accountBlock);
    assert.equal(result.preSignCheckpointJson, state.candidate.preSignCheckpointJson);
    assert.deepEqual(result.originalUnsignedBlock, state.candidate.originalUnsignedBlock);
    assert.deepEqual(pins, state.packet.expectedPins);
    assert.deepEqual(counters(state.f), [18,36,36,1,1,1]);
    unchangedPacket(state, original);
    await assert.rejects(state.f.planner.revalidateSignedOriginal(),
      rejected('signed_original_revalidation_unavailable'));
    await used(state.f);
  });
for (const [label, mode, reads] of [
  ['expired original horizon', { ages: [0,0,0,0,0,3] }, [18,36,36,1,1,1]],
  ['changed price policy', { changedSixthP: true }, [18,36,36,1,1,1]],
  ['insufficient payer balance', { insufficientSixth: true }, [17,30,30,1,1,1]],
  ['moved original account frontier', { movedSixth: true }, [16,30,30,1,1,1]],
]) test('pre-custody refusal preserves v2 packet for ' + label, OPTIONS, async () => {
  const state = await funding(mode), original = JSON.stringify(state.packet);
  await assert.rejects(state.f.planner.revalidateSignedOriginal(),
    rejected('signed_original_revalidation_unknown_or_refused'));
  unchangedPacket(state, original); assert.deepEqual(counters(state.f), reads);
  assert.equal(signedData(state.f).candidate.phase, 'REVALIDATION_REFUSED_OR_UNKNOWN');
  await assert.rejects(state.f.planner.revalidateSignedOriginal(),
    rejected('signed_original_revalidation_unavailable'));
  await used(state.f); assert.deepEqual(counters(state.f), reads);
});
test('DATA v1 and v2 reject each others context instead of silently upgrading input', OPTIONS, () => {
  const old = copy(base.captured); old.plannerContext.plannerContextVersion = 6;
  assert.throws(() => captureData(old, base.url), dataRejected);
  assert.throws(() => assembleData(old, base.pair, base.url), dataRejected);
  assert.throws(() => CAPTURE_V1(base.captured, base.url), dataRejected);
  assert.throws(() => ASSEMBLE_V1(base.captured, base.pair, base.url), dataRejected);
  for (const version of [3,5,8]) {
    const incoming = copy(base.captured); incoming.plannerContext.plannerContextVersion = version;
    assert.throws(() => captureData(incoming, base.url), dataRejected);
  }
});
test('actual v6 compatibility retains DATA v1 and the same original payment encoding', OPTIONS, async () => {
  const legacy = await funding({ v6: true });
  assert.equal(legacy.packet.originalFundingDataVersion, 1);
  assert.equal(legacy.packet.pair.paymentSignatureHeader, base.packet.pair.paymentSignatureHeader);
  assert.equal(legacy.packet.serializedCheckpoint, base.packet.serializedCheckpoint);
  assert.deepEqual(legacy.packet.expectedPins, base.packet.expectedPins);
  assert.deepEqual(counters(legacy.f), [15,30,30,1,1,1]);
  assert.equal(Object.hasOwn(legacy.f.planner, 'revalidateSignedOriginal'), false);
});
test('v2 packet rejects original field substitution including nonce ACK and unhashed public key', OPTIONS, () => {
  const counts = counters(base.f);
  for (const edit of [
    b => { b.publicKey = Buffer.alloc(32,9).toString('base64'); },
    b => { b.amount = '6'; },
    b => { b.momentumAcknowledged.height++; },
    b => { b.nonce = '0807060504030201';
      b.hash = computeZenonUnsignedUserSendHash({ ...b, signature: '' }); },
  ]) {
    const candidate = copy(base.pair); edit(candidate.accountBlock);
    assert.throws(() => assembleData(base.captured, candidate, base.url), dataRejected);
  }
  assert.deepEqual(counters(base.f), counts);
});
test('independent pin mismatches reject without invoking any candidate read or wallet callback', OPTIONS, () => {
  const counts = counters(base.f);
  assert.deepEqual(pinsData(base.packet.serializedCheckpoint, copy(base.packet.expectedPins)), base.packet.expectedPins);
  for (const edit of [
    p => { p.binding.paymentHash = ZERO; }, p => { p.binding.contextId = 'foreign-context'; },
    p => { p.binding.requestId = 'foreign-request'; }, p => { p.digests.paymentPayload = ZERO; },
    p => { p.digests.context = ZERO; },
  ]) {
    const pins = copy(base.packet.expectedPins); edit(pins);
    assert.throws(() => pinsData(base.packet.serializedCheckpoint,pins), dataRejected);
  }
  assert.deepEqual(counters(base.f), counts);
});
test('canonical signature-shaped DATA is not claimed to be cryptographic verification', OPTIONS, () => {
  const candidate = copy(base.pair);
  candidate.accountBlock.signature = Buffer.alloc(64,43).toString('base64');
  const changed = assembleData(base.captured,candidate,base.url);
  assert.equal(changed.transactionHash,base.packet.transactionHash);
  assert.notEqual(changed.pair.paymentSignatureHeader,base.packet.pair.paymentSignatureHeader);
  assert.notEqual(changed.expectedPins.digests.paymentPayload,base.packet.expectedPins.digests.paymentPayload);
  assert.equal(changed.signatureValidation,'NOT_PERFORMED'); assert.equal(changed.authority,'NONE');
});
test('descriptor and Proxy rejection never invokes caller getters or coercion', OPTIONS, () => {
  const hook = () => { totals.hooks++; throw Error('PRIVATE'); }, counts = counters(base.f);
  const incoming = copy(base.captured);
  Object.defineProperty(incoming,'plannerContext',{enumerable:true,get:hook});
  assert.throws(() => captureData(incoming,base.url),dataRejected);
  assert.throws(() => captureData(hostile(),base.url),dataRejected);
  assert.throws(() => assembleData(base.captured,hostile(),base.url),dataRejected);
  assert.throws(() => pinsData(base.packet.serializedCheckpoint,hostile()),dataRejected);
  assert.equal(totals.hooks,0); assert.deepEqual(counters(base.f),counts);
});
test('original challenge body context and IDs survive caller mutation without renewed authority', OPTIONS, () => {
  const input = copy(base.captured);
  input.originalRequest.requestBodyBase64 = Buffer.from([0,255,17]).toString('base64');
  input.originalRequest.contextBase64 = Buffer.from([128,0,7]).toString('base64');
  input.originalRequest.requestId = 'separate-request'; input.originalRequest.contextId = 'separate-context';
  const captured = captureData(input,base.url), packet = assembleData(captured,base.pair,base.url);
  const original = JSON.stringify(packet);
  input.originalRequest.requestBodyBase64 = ''; input.originalRequest.contextId = 'later';
  const restored = RESTORE(packet.serializedCheckpoint,packet.expectedPins);
  assert.equal(restored.originalBytes.requestBody,Buffer.from([0,255,17]).toString('base64'));
  assert.equal(restored.originalBytes.context,Buffer.from([128,0,7]).toString('base64'));
  assert.equal(restored.binding.requestId,'separate-request'); assert.equal(restored.binding.contextId,'separate-context');
  assert.equal(JSON.stringify(packet),original); frozen(packet);
});
test('repeated stateless v2 encoding is deterministic but performs no current read or custody', OPTIONS, () => {
  const counts = counters(base.f);
  const again = assembleData(copy(base.captured),copy(base.pair),base.url);
  assert.deepEqual(again,base.packet);
  assert.deepEqual(counters(base.f),counts);
  assert.equal(again.persistence,'NOT_PERFORMED'); assert.equal(again.authority,'NONE');
});
test('wrong arity and independent resource or challenge changes reject before callbacks', OPTIONS, () => {
  const counts = counters(base.f);
  for (const args of [[],[base.captured],[base.captured,base.url,true]])
    assert.throws(() => captureData(...args),dataRejected);
  for (const args of [[],[base.captured,base.pair],[base.captured,base.pair,base.url,true]])
    assert.throws(() => assembleData(...args),dataRejected);
  const changed = copy(base.captured); changed.challenge.paymentRequired.resource.description = 'Different original.';
  assert.throws(() => captureData(changed,base.url),dataRejected);
  assert.throws(() => captureData(base.captured,'https://resource.invalid/other'),dataRejected);
  assert.deepEqual(counters(base.f),counts);
});
test('a pending sixth cycle retains exact v2 packet and cannot create a second preparation', OPTIONS, async () => {
  const state = await funding({ deferSixth: true }), original = JSON.stringify(state.packet);
  const pending = state.f.planner.revalidateSignedOriginal();
  await state.f.sixthReady.promise;
  assert.deepEqual(counters(state.f),[16,30,30,1,1,1]);
  unchangedPacket(state,original);
  await assert.rejects(state.f.planner.prepareSignedCandidate(hostile()),rejected('busy'));
  await assert.rejects(state.f.planner.revalidateSignedOriginal(hostile()),rejected('busy'));
  state.f.releaseSixth(); const result = await pending;
  assert.deepEqual(result.accountBlock,state.candidate.accountBlock);
  unchangedPacket(state,original); assert.deepEqual(counters(state.f),[18,36,36,1,1,1]);
});
test('v2 DATA preserves byte bounds and refuses malformed signature shapes without verification', OPTIONS, () => {
  for (const signature of ['',SIGNATURE+'\n',Buffer.alloc(63).toString('base64')]) {
    const candidate = copy(base.pair); candidate.accountBlock.signature = signature;
    assert.throws(() => assembleData(base.captured,candidate,base.url),dataRejected);
  }
  const incoming = copy(base.captured);
  incoming.originalRequest.requestBodyBase64 = Buffer.alloc(4097).toString('base64');
  assert.throws(() => captureData(incoming,base.url),dataRejected);
  incoming.originalRequest.requestBodyBase64 = ''; incoming.originalRequest.contextBase64 = '';
  assert.throws(() => captureData(incoming,base.url),dataRejected);
});
after(() => {
  assert.deepEqual(sourcePins(),before);
  assert.equal(totals.hooks,0);
  assert.ok(totals.fixtures<=20 && totals.runs<=19);
  assert.ok(totals.dpReadCallbacks<=1600 && totals.accountReadCallbacks<=400);
  console.log(JSON.stringify({kind:'Q74_ORIGINAL_FUNDING_V2_DECLARED_DATA',...totals,dataCalls,
    SDK:0,SQLite:0,network:0,keys:0,cryptographicSignatures:0,nonceSearch:0,fixedDifficulty:0,
    materialTimers:'BOUNDED_NATIVE_WAIT_ONLY',newTasks:0,newScratch:0,
    effectfulPreparationImported:false,effectfulSubmissionImported:false,
    effectfulV2Integration:'SOURCE_ONLY_NOT_PARSED_OR_IMPORTED',originalDataOnly:true}));
});

