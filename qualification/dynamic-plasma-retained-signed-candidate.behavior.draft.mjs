/*
 * Actual contextv7 retained-signed revalidation with declared wallet/read DATA.
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
assert.equal(process.env.X402_RETAINED_DP_OPT_IN,'declared-retained-candidate-no-sdk-sql-sign');
const PINS = JSON.parse(process.env.X402_RETAINED_DP_PINS);
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


const revalidationFailure = 'signed_original_revalidation_unknown_or_refused';
function counters(f) { return [f.calls.length,...f.positions,f.addressCalls,f.resultCalls,f.materialCalls.length]; }
function sameOriginal(f, block) {
  assert.deepEqual(block,f.expectedCandidate); assert.equal(block.hash,f.originalUnsigned.hash);
  assert.equal(block.nonce,'0102030405060708'); assert.equal(block.momentumAcknowledged.height,100);
  assert.equal(block.signature,SIGNATURE);
}
async function noMore(f) {
  const n=counters(f);
  await assert.rejects(f.planner.revalidateSignedOriginal(),rejected('signed_original_revalidation_unavailable'));
  await used(f); assert.deepEqual(counters(f),n);
}
async function prepared(mode={}) {
  const f=fixture(mode), result=await start(f); assert.equal(f.calls.length,15);
  assert.deepEqual(f.positions,[30,30]); sameOriginal(f,result.accountBlock); return f;
}
test('contextv7 exposes a frozen explicit retained-candidate operation without construction I/O',OPTIONS,()=>{
  const f=fixture(); assert.equal(f.context.plannerContextVersion,7);
  assert.equal(f.calls.length,0); assert.deepEqual(f.positions,[0,0]);
  assert.equal(signedData(f).retainedValidationAttempts,0);
  assert.equal(signedData(f).candidate,null); assert.equal(f.addressCalls,0); assert.equal(f.resultCalls,0);
});
test('sixth current read returns the exact same signed block without another wallet or material call',OPTIONS,async()=>{
  const f=await prepared(), beforeBlock=JSON.stringify(f.expectedCandidate);
  const r=await f.planner.revalidateSignedOriginal(); frozen(r); sameOriginal(f,r.accountBlock);
  assert.equal(JSON.stringify(r.accountBlock),beforeBlock);
  assert.equal(r.observedSignedCandidateVersion,2);
  assert.equal(r.validationPurpose,'BEFORE_ORIGINAL_SIGNED_CUSTODY'); assert.equal(r.signing,'NOT_INVOKED');
  assert.equal(r.signatureValidation,'NOT_PERFORMED'); assert.equal(r.persistence,'NOT_PERFORMED');
  assert.equal(r.authority,'NONE'); assert.equal(f.calls.length,18); assert.deepEqual(f.positions,[36,36]);
  assert.deepEqual([f.addressCalls,f.resultCalls,f.materialCalls.length],[1,1,1]);
  assert.equal(signedData(f).candidate.phase,'PRE_CUSTODY_VALIDATED_DECLARED_READS');
  assert.equal(signedData(f).retainedValidationAttempts,1); await noMore(f);
});
for(const age of [1,2]) test('sixth price advance '+age+' preserves original hash nonce ACK and signature',OPTIONS,async()=>{
  const f=await prepared({ages:[0,0,0,0,0,age]}),r=await f.planner.revalidateSignedOriginal();
  sameOriginal(f,r.accountBlock); assert.equal(f.calls.length,18); assert.equal(f.resultCalls,1);
  assert.equal(JSON.parse(r.preSignCheckpointJson).accountBlock.signature,''); await noMore(f);
});
test('sixth horizon expiry retains the original candidate and consumes revalidation without resigning',OPTIONS,async()=>{
  const f=await prepared({ages:[0,0,0,0,0,3]});
  await assert.rejects(f.planner.revalidateSignedOriginal(),rejected(revalidationFailure));
  const v=signedData(f); sameOriginal(f,v.candidate.accountBlock);
  assert.equal(v.candidate.phase,'REVALIDATION_REFUSED_OR_UNKNOWN'); assert.equal(v.retainedValidationAttempts,1);
  assert.equal(f.resultCalls,1); await noMore(f);
});
test('sixth runtime price-policy change refuses without discarding the signed original',OPTIONS,async()=>{
  const f=await prepared({changedSixthP:true});
  await assert.rejects(f.planner.revalidateSignedOriginal(),rejected(revalidationFailure));
  sameOriginal(f,signedData(f).candidate.accountBlock); await noMore(f);
});
test('sixth insufficient balance refuses before another DP exchange and preserves the candidate',OPTIONS,async()=>{
  const f=await prepared({insufficientSixth:true});
  await assert.rejects(f.planner.revalidateSignedOriginal(),rejected(revalidationFailure));
  assert.equal(f.calls.length,17); assert.deepEqual(f.positions,[30,30]);
  sameOriginal(f,signedData(f).candidate.accountBlock); await noMore(f);
});
test('sixth changed account frontier refuses before balance or DP and never replaces the original',OPTIONS,async()=>{
  const f=await prepared({movedSixth:true});
  await assert.rejects(f.planner.revalidateSignedOriginal(),rejected(revalidationFailure));
  assert.equal(f.calls.length,16); assert.deepEqual(f.positions,[30,30]);
  sameOriginal(f,signedData(f).candidate.accountBlock); await noMore(f);
});
test('sixth malformed account reply holds the same signed original without retry',OPTIONS,async()=>{
  const f=await prepared({badSixth:true});
  await assert.rejects(f.planner.revalidateSignedOriginal(),rejected(revalidationFailure));
  sameOriginal(f,signedData(f).candidate.accountBlock); assert.equal(f.calls.length,16); await noMore(f);
});
test('pending sixth read rejects overlapping preparation and revalidation before inspecting hostile DATA',OPTIONS,async()=>{
  const f=await prepared({deferSixth:true}), pending=f.planner.revalidateSignedOriginal();
  await f.sixthReady.promise; const n=counters(f);
  await assert.rejects(f.planner.revalidateSignedOriginal(hostile()),rejected('busy'));
  await assert.rejects(f.prepare(hostile()),rejected('busy')); assert.deepEqual(counters(f),n);
  assert.equal(signedData(f).candidate.phase,'REVALIDATING_BEFORE_CUSTODY');
  f.releaseSixth(); sameOriginal(f,(await pending).accountBlock); await noMore(f);
});
test('wrong arity and revalidation before preparation do not issue reads or grant a candidate',OPTIONS,async()=>{
  const f=fixture();
  await assert.rejects(f.planner.revalidateSignedOriginal(hostile()),rejected('input_rejected'));
  await assert.rejects(f.planner.revalidateSignedOriginal(),rejected('signed_original_revalidation_unavailable'));
  assert.deepEqual(counters(f),[0,0,0,0,0,0]);
  await start(f); sameOriginal(f,(await f.planner.revalidateSignedOriginal()).accountBlock); await noMore(f);
});
test('wrong arity after preparation neither consumes the one current read nor observes DATA',OPTIONS,async()=>{
  const f=await prepared(),n=counters(f);
  await assert.rejects(f.planner.revalidateSignedOriginal(hostile()),rejected('input_rejected'));
  assert.deepEqual(counters(f),n); assert.equal(signedData(f).retainedValidationAttempts,0);
  sameOriginal(f,(await f.planner.revalidateSignedOriginal()).accountBlock); await noMore(f);
});
test('a refused fifth read cannot be repaired by the new sixth operation',OPTIONS,async()=>{
  const f=fixture({ages:[0,0,0,0,3,0]}); await assert.rejects(start(f),rejected());
  const n=counters(f); sameOriginal(f,signedData(f).candidate.accountBlock);
  await assert.rejects(f.planner.revalidateSignedOriginal(),rejected('signed_original_revalidation_unavailable'));
  assert.deepEqual(counters(f),n); assert.equal(signedData(f).retainedValidationAttempts,0); await used(f);
});
test('contextv7 refuses an old context version without wallet or read entry',OPTIONS,async()=>{
  const f=fixture(); f.context.plannerContextVersion=6; await assert.rejects(start(f),rejected());
  assert.deepEqual(counters(f),[0,0,0,0,0,0]); await used(f);
});
test('contextv6 keeps its original surface and five-cycle result',OPTIONS,async()=>{
  const f=fixture({v6:true}),r=await start(f); sameOriginal(f,r.accountBlock);
  assert.equal(r.observedSignedCandidateVersion,1); assert.equal(f.calls.length,15);
  assert.equal(Object.hasOwn(f.planner,'revalidateSignedOriginal'),false);
  assert.equal(Object.hasOwn(signedData(f),'retainedValidationAttempts'),false);
  assert.equal(Object.hasOwn(signedData(f).candidate,'retainedValidationAttempts'),false); await used(f);
});
test('v3 v4 and v5 remain pre-sign only with their existing context and method surfaces',OPTIONS,async()=>{
  for(const mode of [{legacy:true},{compat:true},{deadline:true}]) {
    const f=fixture(mode); await start(f); assert.equal(f.calls.length,12); assert.deepEqual(f.positions,[24,24]);
    assert.equal(f.addressCalls,0); assert.equal(f.resultCalls,0);
    assert.equal(Object.hasOwn(f.planner,'revalidateSignedOriginal'),false); await used(f);
  }
});
test('mutating public context after preparation cannot extend the private original horizon',OPTIONS,async()=>{
  const f=await prepared({ages:[0,0,0,0,0,3]});
  f.context.readInput.policy.maxMomentumAdvances=99;
  await assert.rejects(f.planner.revalidateSignedOriginal(),rejected(revalidationFailure));
  sameOriginal(f,signedData(f).candidate.accountBlock); await noMore(f);
});
test('revalidation never calls replaced public wallet or material methods',OPTIONS,async()=>{
  const f=await prepared();
  f.wallet.getAddress=f.wallet.sign=f.options.materialExchange=()=>{throw Error('FORBIDDEN_NEW_OPERATION');};
  sameOriginal(f,(await f.planner.revalidateSignedOriginal()).accountBlock);
  assert.deepEqual([f.addressCalls,f.resultCalls,f.materialCalls.length],[1,1,1]); await noMore(f);
});
test('inspection issues no fresh reads and does not turn DATA into signing or persistence authority',OPTIONS,async()=>{
  const f=await prepared(),n=counters(f); signedData(f); signedData(f);
  const w=f.planner.getMaterialWaitSnapshot(); assert.equal(w.timersStarted,1); assert.equal(w.timersCleared,1);
  assert.deepEqual(counters(f),n); sameOriginal(f,(await f.planner.revalidateSignedOriginal()).accountBlock); await noMore(f);
});
after(()=>{
  assert.deepEqual(sourcePins(),before); assert.equal(totals.hooks,0);
  process.stdout.write('# '+JSON.stringify({kind:'Q73_RETAINED_SIGNED_CANDIDATE_DECLARED_COMPOSITION',
    ...totals,SDK:0,SQLite:0,network:0,keys:0,cryptographicSignatures:0,nonceSearch:0,
    fixedDifficulty:0,materialTimers:'BOUNDED_NATIVE_WAIT_ONLY',newTasks:0,newScratch:0,
    effectfulFundingOwnerImported:false,originalDataOnly:true})+'\n');
});
