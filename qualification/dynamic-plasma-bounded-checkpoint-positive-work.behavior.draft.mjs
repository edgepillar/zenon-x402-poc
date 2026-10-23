/*
 * Three selected NEW checkpoint integration scenarios, NOT a replay of the
 * earlier version3 block-only qualification. SOURCE DRAFT until the separate
 * one-command positive-work permission and exact caller/source review pass.
 *
 * Actual bounded producer -> actual version4 original checkpoint preparation;
 * one fresh current checkpoint reader also consumes the positive-work packet.
 * Per search/window <=4096. Producer loop reservations <=12288; independent
 * reference loops <=8192; fixed-verifier reservation 4096: total <=24576,
 * below the proposed aggregate ceiling 65536. The verifier reservation is a
 * conservative source-graph bound, not an observed call count or CPU deadline.
 *
 * Existing fixed public DATA only. No SDK, key generation, signature, SQL,
 * actual network, payment, real PREPARE, signer state or live pilot evidence.
 * No other qualification entry is imported or registered. Never expand a
 * missing vector/range, retry a rejected vector, or replace an expired plan.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createBoundedObservedBalanceDynamicPlasmaCheckpointPreparer as CREATE }
  from '../src/zenon/dynamic-plasma-bounded-observed-balance-planner.js';
import {
  createObservedBalanceDynamicPlasmaUserSendCheckpointReadAdapter as REFERENCE_READS,
  createObservedBalanceDynamicPlasmaUnsignedCheckpointReader as CURRENT_READER,
} from '../src/zenon/dynamic-plasma-observed-balance-user-send-read-adapter.js';
import { createDynamicPlasmaJsonRpcReadTransport as WIRE }
  from '../src/zenon/dynamic-plasma-json-rpc-read-transport.js';
import { computeZenonUnsignedUserSendHash as computeHash } from '../src/zenon/transaction-planner.js';
import { validateZenonUnsignedUserSendWork as validateWork } from '../src/zenon/dynamic-plasma-user-send-fixed-work.js';

assert.equal(process.argv.length, 2);
const OPTIONS = { timeout:5000, concurrency:false };
const networkCalls = 0; // Source-bound no-network path, not OS-wide instrumentation.
const H = '33'.repeat(32), PREVIOUS = '66'.repeat(32), GENESIS = '11'.repeat(32);
const TWO = '22'.repeat(32), ZERO_HASH = '0'.repeat(64), ZERO_NONCE = '0'.repeat(16);
const DYNAMIC = '02'.repeat(32), LIBP2P = '01'.repeat(32);
const ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx', MAX = Number.MAX_SAFE_INTEGER;
const PUBLIC = Buffer.alloc(32, 7).toString('base64'); // Existing fixed public bytes only.
const RANGE = 1n << 64n;
const METHODS = ['ledger.getFrontierMomentum','ledger.getMomentumsByHeight','embedded.spork.getAll',
  'embedded.plasma.getVariables','embedded.plasma.getRequiredPoWForAccountBlock','ledger.getFrontierMomentum'];
const FRONTIER = 'ledger.getFrontierAccountBlock', INFO = 'ledger.getAccountInfoByAddress';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value)); // Finite test-owned valid DATA only.
let producerReservations = 0, referenceEvaluations = 0, referenceWindows = 0, plannerRuns = 0;
let referencePreparations = 0, referenceAccountReads = 0, referenceDpReads = 0;
let checkpointPackets = 0, checkpointReads = 0, checkpointReaderAccountReads = 0, checkpointReaderDpReads = 0;
// Conservative static reservation for every fixed-nonce consumer reachable
// through the three one-admission runs and their explicit postconditions.
// It is NOT an observed validator-call count or a wall-clock guarantee.
const fixedVerificationReservations = 4096;
function budget() {
  assert.ok(producerReservations <= 12288); assert.ok(referenceEvaluations <= 8192);
  assert.ok(producerReservations + referenceEvaluations + fixedVerificationReservations <= 65536);
}
function address(core) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', words = [];
  let accumulator = 0, bits = 0, checksum = 1;
  for (const byte of core) {
    accumulator = (accumulator << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; words.push((accumulator >>> bits) & 31); }
  }
  assert.equal(bits, 0);
  for (const word of [3,0,26,...words,0,0,0,0,0,0]) {
    const top = checksum >>> 25; checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [index,generator] of [0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3].entries())
      if ((top >>> index) & 1) checksum ^= generator;
  }
  checksum = (checksum ^ 1) >>> 0;
  return 'z1' + words.map(word => alphabet[word]).join('')
    + Array.from({length:6},(_,index) => alphabet[(checksum >>> (5*(5-index))) & 31]).join('');
}
const payerDigest = createHash('sha3-256').update(Buffer.from(PUBLIC, 'base64')).digest();
const PAYER = address([0,...payerDigest.subarray(0,19)]), PAYEE = address([0,...Array(19).fill(34)]);
function momentum(age, price, version = 2) {
  return { version, chainIdentifier:73404,
    hash:version === 1 ? TWO : ['33','44','55','66'][age].repeat(32),
    previousHash:GENESIS, height:version === 1 ? 2 : 100 + age,
    timestamp:1234, data:'', content:[], changesHash:'66'.repeat(32),
    publicKey:Buffer.alloc(32,6).toString('base64'),
    signature:Buffer.alloc(64,8).toString('base64'), // Fixed observation DATA, never signing.
    nextFusionPrice:price, nextWorkPrice:price, producer:PAYER };
}
function frontierBlock() {
  return { version:1, chainIdentifier:73404, blockType:3, hash:PREVIOUS,
    previousHash:'77'.repeat(32), height:6, momentumAcknowledged:{ hash:H,height:100 },
    address:PAYER, toAddress:PAYEE, amount:'5', tokenStandard:ASSET, fromBlockHash:'88'.repeat(32),
    descendantBlocks:[], data:null, fusedPlasma:0, difficulty:0, nonce:ZERO_NONCE,
    basePlasma:21000, usedPlasma:21000, changesHash:ZERO_HASH, publicKey:'', signature:'',
    token:null, confirmationDetail:null, pairedAccountBlock:null };
}
function fixture({ base = 1, advances = 2, postWorkAge = 0, maximum = 4096, startNonce = ZERO_NONCE } = {}) {
  const accepted = { scheme:'exact', network:'zenon:testnet', asset:ASSET, amount:'5',
    payTo:PAYEE, maxTimeoutSeconds:60,
    extra:{ poc:true, settlement:'account-block', paymentFlow:'upfront',
      zenonChain:{ version:1, chainIdentifier:'73404', genesisMomentumHash:GENESIS } } };
  const input = { observedUserSendReadVersion:3, phase:'UNSIGNED',
    paymentRequired:{ x402Version:2, resource:{ url:'https://resource.invalid/paid',
      description:'Synthetic resource.', mimeType:'application/json', tags:['synthetic'] },
      accepts:[clone(accepted)] },
    accepted, payerAddress:PAYER, compiledSporkIds:{ dynamicPlasmaId:DYNAMIC, libp2pId:LIBP2P },
    policy:{ policyVersion:1, maxPriceChangePercent:10, maxMomentumAdvances:advances,
      maxFusedPlasma:0, maxDifficulty:MAX }, runtimeContextDigest:'sha256:'+'b'.repeat(64) };
  const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
    : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
  const intent = sha256(Buffer.from(canonical({x402Version:2,resource:input.paymentRequired.resource,accepted}),'utf8'));
  const originalData = Buffer.from(intent,'hex').toString('base64');
  const f = { input, originalData, accountCalls:[], dpCalls:[], positions:[0,0], order:[], postWorkAge };
  const transports = [0,1].map(endpoint => WIRE({ exchange:body => {
    const request = JSON.parse(body), index = f.positions[endpoint]++ % 6;
    assert.equal(request.method, METHODS[index]); assert.equal(request.id, f.positions[endpoint]);
    if (index === 0 || index === 5 || index === 3) assert.deepEqual(request.params, []);
    else if (index === 1) assert.deepEqual(request.params, [2,1]);
    else if (index === 2) assert.deepEqual(request.params, [0,128]);
    else assert.deepEqual(request.params, [{ address:PAYER,blockType:2,toAddress:PAYEE,data:originalData }]);
    const age = f.readOnlyAge ?? (f.accountCalls.length >= 7 ? f.postWorkAge : 0);
    const price = [1000,1100,1210,1331][age];
    f.dpCalls.push({ endpoint, request, age, price });
    f.order.push('dp:'+endpoint+':'+request.method);
    let result;
    if (index === 0 || index === 5) result = momentum(age, price);
    else if (index === 1) result = { count:200, list:[momentum(0,0,1)] };
    else if (index === 2) result = { count:2, list:[
      { id:LIBP2P,name:'libp2p',description:'Synthetic.',activated:false,enforcementHeight:0 },
      { id:DYNAMIC,name:'dynamic-plasma',description:'Synthetic.',activated:true,enforcementHeight:10 }] };
    else if (index === 3) result = { MaxBasePlasmaInMomentum:4200000,FusedPlasmaTarget:1050000,
      PowPlasmaTarget:1050000,MaxPriceChangePercent:10,PriceChangeDenominator:20 };
    else result = { availablePlasma:0,basePlasma:base,requiredFusedPlasma:Math.ceil(base*price/1000),
      requiredDifficulty:Math.ceil(base*price/1000)*1500 };
    return Promise.resolve(JSON.stringify({jsonrpc:'2.0',id:request.id,result}));
  }}));
  const readOptions = { transports, accountExchange:body => {
    const request = JSON.parse(body); f.accountCalls.push(request); f.order.push('account:'+request.method);
    assert.equal(request.id, f.accountCalls.length); assert.deepEqual(request.params,[PAYER]);
    assert.equal(request.method, request.id % 3 === 2 ? INFO : FRONTIER);
    const result = request.method === INFO ? { address:PAYER,accountHeight:6,
      balanceInfoMap:{ [ASSET]:{ token:{tokenStandard:ASSET},balance:'5' } } } : frontierBlock();
    return Promise.resolve(JSON.stringify({jsonrpc:'2.0',id:request.id,result}));
  }};
  f.readOptions = readOptions;
  f.options = { readOptions, materialOptions:{ publicKey:PUBLIC,startNonce,
    limits:{ maxAttempts:maximum,maxDifficulty:MAX } } };
  f.context = { plannerContextVersion:4,readInput:input };
  return f;
}
async function referenceWork(options) {
  referencePreparations++; assert.ok(referencePreparations <= 2);
  const f = fixture(options), attempt = REFERENCE_READS(f.readOptions);
  const plan = await attempt.quote(f.input), work = await attempt.createWorkRequest(f.input, plan);
  assert.equal(f.accountCalls.length,6); assert.deepEqual(f.positions,[12,12]); assert.equal(f.dpCalls.length,24);
  referenceAccountReads += 6; referenceDpReads += 24;
  return { plan,work };
}
function nonceBytes(value) {
  const bytes = Buffer.alloc(8);
  for (let i=0;i<8;i++) { bytes[i]=Number(value & 255n); value >>= 8n; }
  assert.equal(value,0n); return bytes;
}
function readLE(bytes) {
  let value=0n; for(let i=7;i>=0;i--) value=(value<<8n)|BigInt(bytes[i]); return value;
}
function referenceWindow(work, start, maximum) {
  assert.ok(Number.isSafeInteger(maximum) && maximum >= 0 && maximum <= 4096);
  assert.ok(start >= 0n && start + BigInt(maximum) <= RANGE);
  referenceWindows++; assert.ok(referenceWindows <= 2);
  const data = Buffer.from(work.workInput.dataHash,'hex');
  const threshold = RANGE - RANGE / BigInt(work.workInput.difficulty);
  for (let index=0;index<maximum;index++) {
    referenceEvaluations++; budget();
    const nonce = nonceBytes(start+BigInt(index));
    const digest = createHash('sha3-256').update(Buffer.concat([nonce,data])).digest();
    if (readLE(digest) >= threshold)
      return { nonce:nonce.toString('hex'), digest:digest.toString('hex'), difficulty:work.workInput.difficulty };
  }
  return null;
}
let vectorPromise = null;
function positiveVector() {
  // One fixed finite derivation, cached on both fulfillment and rejection.
  // No retry, randomness, larger range or fallback after a missing vector.
  if (vectorPromise === null) vectorPromise = (async () => {
    const original = await referenceWork({base:1,advances:2});
    assert.equal(original.work.selection.fusedPlasma,0);
    assert.equal(original.work.workInput.difficulty,3000);
    assert.deepEqual(original.plan.quote.sourceQuote.pricePolicyQuote.boundPrices,
      {fusionPrice:1210,workPrice:1210});
    const found = referenceWindow(original.work,0n,4096);
    assert.notEqual(found,null,
      'No positive vector in the fixed 4096-candidate prefix; never expand, change inputs or silently pass.');
    return {...found,original};
  })();
  return vectorPromise;
}
function invoke(f) {
  const maximum = f.options.materialOptions.limits.maxAttempts;
  assert.ok(Number.isSafeInteger(maximum) && maximum >= 0 && maximum <= 4096);
  producerReservations += maximum; plannerRuns++; assert.ok(plannerRuns <= 3); budget();
  f.planner = CREATE(f.options);
  return f.planner.prepareUnsignedCheckpoint(f.context);
}
function rejected(kind = 'operation_rejected') {
  return error => {
    assert.ok(error instanceof TypeError && Object.isFrozen(error));
    assert.equal(error.code,'zenon_observed_balance_deferred_material_dp_planner_'+kind);
    assert.equal(error.message,error.code); assert.equal(error.stack,'TypeError: '+error.code);
    assert.equal(Object.hasOwn(error,'cause'),false); return true;
  };
}
async function consumed(f) {
  const before = JSON.stringify([f.accountCalls,f.dpCalls,f.order]); let hooks=0;
  const hostile = new Proxy({}, {getPrototypeOf(){hooks++;throw Error('SYNTHETIC_UNUSED_HOOK');}});
  await assert.rejects(f.planner.prepareUnsignedCheckpoint(hostile),rejected('used'));
  assert.equal(hooks,0); assert.equal(JSON.stringify([f.accountCalls,f.dpCalls,f.order]),before);
}
function frozen(value) {
  if(value===null || typeof value!=='object')return;
  assert.equal(Object.isFrozen(value),true); for(const child of Object.values(value))frozen(child);
}
function history(f, cycles) {
  assert.equal(f.accountCalls.length,cycles*3); assert.deepEqual(f.positions,[cycles*6,cycles*6]);
  assert.equal(f.dpCalls.length,cycles*12);
  const cycle = ['account:'+FRONTIER,'account:'+INFO,...METHODS.map(x=>'dp:0:'+x),
    ...METHODS.map(x=>'dp:1:'+x),'account:'+FRONTIER];
  assert.deepEqual(f.order,Array.from({length:cycles},()=>cycle).flat());
  assert.equal(networkCalls,0);
}
function diagnostic(t,scenario,f,returnedCheckpointPackets,postWorkAge) {
  budget();
  t.diagnostic(JSON.stringify({kind:'P1A_BOUNDED_CHECKPOINT_POSITIVE_WORK',version:1,scenario,
    accountReads:f.accountCalls.length,dpReads:f.dpCalls.length,producerReservations,
    referenceEvaluations,referenceWindows,fixedVerificationReservations,plannerRuns,
    referencePreparations,referenceAccountReads,referenceDpReads,
    returnedCheckpointPackets,postWorkAge,originalAcknowledgementHeight:100,
    checkpointPackets,checkpointReads,checkpointReaderAccountReads,checkpointReaderDpReads,networkCalls,
    configuredPerSearchCeiling:4096,configuredAggregateCeiling:65536,
    staticCombinedCandidateUpperBound:24576,
    keys:0,signatures:0,sdkCalls:0,realPrepare:0,authority:'NONE',
    qualification:'SELECTED_POSITIVE_WORK_CHECKPOINT_COMPOSITION_NOT_NATIVE_PROVIDER_OR_LIVE_DP'}));
}


test('owned bounded checkpoint retains the original positive-work block and exact packet across two price advances',OPTIONS,async t=>{
  const vector = await positiveVector(), f = fixture({postWorkAge:2,startNonce:vector.nonce});
  const before = JSON.stringify(f.context), packet = await invoke(f);
  checkpointPackets++; frozen(packet); assert.equal(Object.getPrototypeOf(packet),null);
  assert.equal(packet.observedUnsignedCheckpointVersion,1); assert.equal(packet.phase,'UNSIGNED');
  assert.deepEqual(packet.originalPlan,vector.original.plan);
  const block = packet.accountBlock;
  const expected = {...vector.original.work.accountBlock,nonce:vector.nonce,publicKey:PUBLIC};
  expected.hash = computeHash(expected);
  assert.deepEqual(block,expected); assert.equal(block.signature,''); assert.equal(block.hash,computeHash(block));
  assert.equal(block.nonce,vector.nonce); assert.equal(block.address,PAYER); assert.equal(block.publicKey,PUBLIC);
  assert.equal(block.previousHash,PREVIOUS); assert.equal(block.height,7);
  assert.deepEqual(block.momentumAcknowledged,{hash:H,height:100});
  assert.equal(block.amount,'5'); assert.equal(block.tokenStandard,ASSET);
  assert.equal(block.difficulty,3000); assert.equal(block.fusedPlasma,0); assert.equal(block.data,f.originalData);
  const verified = validateWork(block);
  assert.equal(verified.work.validation,'MATCHES_DECLARED_DIFFICULTY');
  assert.equal(verified.work.nonceDigest,vector.digest);
  const encoded = JSON.parse(packet.checkpointJson);
  assert.deepEqual(encoded.accountBlock,block); assert.deepEqual(encoded.quote,packet.originalPlan.quote);
  assert.equal(encoded.phase,'UNSIGNED'); assert.equal(encoded.checkpointVersion,1);
  for(const field of ['currentAuthority','signingAuthorization','chainAuthentication'])
    assert.equal(packet[field],'NOT_ESTABLISHED');
  assert.equal(packet.authority,'NONE'); assert.equal(packet.persistence,'NOT_PERFORMED');
  for(const field of ['paymentPayload','privateKey','sign','publish','reset'])
    assert.equal(Object.hasOwn(packet,field),false);
  assert.equal(JSON.stringify(f.context),before); history(f,4);
  assert.deepEqual(f.dpCalls.map(x=>x.age),[...Array(24).fill(0),...Array(24).fill(2)]);
  await consumed(f);

  const current = fixture({postWorkAge:2});
  // A distinct new account wire starts at id1 and performs only one current
  // read cycle, never quote/work/material/preparation or manufactured reads.
  // The shared fixture chooses post-work price after six account reads. For
  // this independent read-only consumer, use its own explicit current-age
  // flag rather than manufacture prior reads or an old wire counter.
  current.readOnlyAge = 2;
  const reader = CURRENT_READER(current.readOptions);
  assert.deepEqual(Object.keys(reader),['validateUnsignedCheckpoint']);
  const checked = await reader.validateUnsignedCheckpoint(f.input,packet.originalPlan,block,packet.checkpointJson);
  checkpointReads++; checkpointReaderAccountReads += current.accountCalls.length;
  checkpointReaderDpReads += current.dpCalls.length;
  assert.equal(checked.observedBalanceCheckpointReadVersion,1); frozen(checked);
  assert.deepEqual(checked.accountBlock,block); assert.equal(checked.checkpointJson,packet.checkpointJson);
  assert.equal(checked.originalPacketBinding,'EXACT_CANONICAL_BYTES_FOR_INDEPENDENT_PLAN_AND_BLOCK');
  assert.equal(checked.signingAuthorization,'NOT_ESTABLISHED'); assert.equal(checked.authority,'NONE');
  assert.equal(checked.persistence,'NOT_PERFORMED'); history(current,1);
  assert.equal(current.dpCalls.every(x=>x.age===2),true);
  diagnostic(t,'TWO_ADVANCES_SAME_POSITIVE_BLOCK_AND_CHECKPOINT',f,1,2);
});
test('owned positive checkpoint keeps the expired original consumed without replacement packet or material',OPTIONS,async t=>{
  const vector = await positiveVector(), f = fixture({postWorkAge:3,startNonce:vector.nonce});
  const before = JSON.stringify(f.context); let returned=0;
  await assert.rejects(invoke(f).then(value=>{returned++;return value;}),rejected());
  assert.equal(returned,0); assert.equal(JSON.stringify(f.context),before); history(f,3);
  assert.deepEqual(f.dpCalls.map(x=>x.age),[...Array(24).fill(0),...Array(12).fill(3)]);
  await consumed(f); diagnostic(t,'EXPIRED_ORIGINAL_NO_REPLACEMENT_CHECKPOINT',f,0,3);
});
test('owned positive checkpoint exhausts exactly one bounded prefix before assembly and returns no packet',OPTIONS,async t=>{
  const original = await referenceWork({base:4200000,advances:0});
  assert.equal(original.work.workInput.difficulty,6300000000);
  assert.equal(referenceWindow(original.work,0n,4096),null,
    'A found vector fails the fixed exhaustion premise; never replace the input or enlarge the range.');
  const f = fixture({base:4200000,advances:0,maximum:4096}), before = JSON.stringify(f.context); let returned=0;
  await assert.rejects(invoke(f).then(value=>{returned++;return value;}),rejected());
  assert.equal(returned,0); assert.equal(JSON.stringify(f.context),before); history(f,2);
  await consumed(f);
  assert.equal(plannerRuns,3); assert.equal(producerReservations,12288);
  assert.equal(referencePreparations,2); assert.equal(referenceAccountReads,12); assert.equal(referenceDpReads,48);
  assert.ok(referenceEvaluations>4096 && referenceEvaluations<=8192);
  assert.equal(checkpointPackets,1); assert.equal(checkpointReads,1);
  assert.equal(checkpointReaderAccountReads,3); assert.equal(checkpointReaderDpReads,12);
  diagnostic(t,'BOUNDED_EXHAUSTION_NO_CHECKPOINT',f,0,0);
});
