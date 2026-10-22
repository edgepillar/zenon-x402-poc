// Isolated source-pinned P1-A composition qualification draft.
// Exactly three authored scenarios; no historical test entry is imported.
// A separate human-approved composition exception and reviewed caller are
// required before evaluation. Source authorship alone is NOT a passing run.
// Synthetic unsigned DATA only: no SDK, keys, signatures, SQL, network,
// payment, real PREPARE, native provider or live-pilot acceptance.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { constants, lstatSync, openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = "qualification/dynamic-plasma-owned-nonce-price-composition.behavior.draft.mjs";
const SPECS = [
  [
    "package.json",
    1413,
    40,
    "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
  ],
  [
    "src/canonical.js",
    967,
    26,
    "0d55ddf1727cafb0dcd46df2922305568615552a4d2ae34a5c30e90b9d8d998c"
  ],
  [
    "src/x402-wire.js",
    39886,
    934,
    "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"
  ],
  [
    "src/zenon/bounded-dynamic-plasma-strategy.js",
    15729,
    353,
    "7b82560bdeb25e573912090a2fe8de7b45912500a7a7c4434fe06dcf94e06d62"
  ],
  [
    "src/zenon/bounded-json-rpc-read-core.js",
    21759,
    582,
    "10cc529bfb0676bb03dc4dad56059663f4a578b586c52f6404fc859d27d18f76"
  ],
  [
    "src/zenon/dynamic-plasma-account-frontier-read.js",
    7417,
    152,
    "283209685a41aed5647c87e33d046d1f81b3a6820ea6ea307c11d2f99b91020d"
  ],
  [
    "src/zenon/dynamic-plasma-account-state-read-transport.js",
    3632,
    74,
    "9aa818dabdacf0baec60ca570e854cc8a327e554ba5e5a76c670eb5ed02b29b8"
  ],
  [
    "src/zenon/dynamic-plasma-bounded-material-exchange.js",
    11992,
    213,
    "6773c946991834dfe3b01943bdb9bad7513ef0cbbb15b31e607b095bab42b28b"
  ],
  [
    "src/zenon/dynamic-plasma-bounded-observed-balance-planner.js",
    4777,
    91,
    "3ea2d6bd6210e34fbe7afc8e95d8233240d36c35d8a1e6105a1795c23e998f43"
  ],
  [
    "src/zenon/dynamic-plasma-compatibility.js",
    7732,
    225,
    "b3989ce15e5f2e9d07b0ed035fe96bcce9f22cac93f5e497fdca5c37bf7618dd"
  ],
  [
    "src/zenon/dynamic-plasma-json-rpc-read-transport.js",
    10832,
    283,
    "fd03b2ad87d16660aa61d3961c163d724d5f89cd6d4bb9c4391d739566d5e5ca"
  ],
  [
    "src/zenon/dynamic-plasma-observation-collector.js",
    38492,
    949,
    "6bb665dd97e4b262941ed11fb7a9fb5c6d7a162004a39fcbfbfa8cd7b3f82d98"
  ],
  [
    "src/zenon/dynamic-plasma-observation-normalizer.js",
    28398,
    698,
    "2c3f7d42ded21a5513ff26c23a00a35a53aa334f053d10930f1571a020286897"
  ],
  [
    "src/zenon/dynamic-plasma-observed-balance-deferred-material-planner.js",
    13858,
    278,
    "f6d2d8c364b7ee2206255eb628251dea81b32cdf20e5c7f8437e74cedc13516c"
  ],
  [
    "src/zenon/dynamic-plasma-observed-balance-user-send-attempt.js",
    7377,
    146,
    "5111ef500bf33c19113f7ffabadc8980792bc9b5fa388cf6095a3f89a5f69e7a"
  ],
  [
    "src/zenon/dynamic-plasma-observed-balance-user-send-read-adapter.js",
    15496,
    293,
    "0018c76c0e6bee0d0dbcd771613701162e3609b2dcebc36918c2092e3d6da432"
  ],
  [
    "src/zenon/dynamic-plasma-observed-user-send-adapter.js",
    8149,
    180,
    "8526519aa6bf5006c572447127680d3cc871ee4eee1b9046b4ea09f9ad9e1653"
  ],
  [
    "src/zenon/dynamic-plasma-observed-user-send-subject.js",
    5105,
    104,
    "bbcc1d718bcb1353f46e0650723e35c218db94754328103d4bce1d5765e13cd8"
  ],
  [
    "src/zenon/dynamic-plasma-price-policy.js",
    16224,
    444,
    "eba3225c4d26cbb6e0be575ac4fd5073bc8b0c4454eb51e2bea4d91856d0c65e"
  ],
  [
    "src/zenon/dynamic-plasma-required-fused-policy-adapter.js",
    12024,
    272,
    "e2b693d4df9065d44ba590f4d0c8dffeb8e55187668eedfa396b4026c9905c3e"
  ],
  [
    "src/zenon/dynamic-plasma-required-fused-quote.js",
    5416,
    133,
    "f5e10ff2dbfff3b6b63d87f0abadd0bb52b5d6b8fe0ead6a55fc5ea14207b730"
  ],
  [
    "src/zenon/dynamic-plasma-user-send-assembly.js",
    7772,
    162,
    "05012a2a983ceca018674c4d1f63823f3f7ed53b0970a4b4bd486c4278832b04"
  ],
  [
    "src/zenon/dynamic-plasma-user-send-balance-read.js",
    7542,
    144,
    "ae1f3e5d309be0dc196fb6b35324d4c8287345b50a108d5030c1058645d2ed39"
  ],
  [
    "src/zenon/dynamic-plasma-user-send-fixed-work.js",
    3475,
    77,
    "4ee83870df0b25c34d35c0f0d0ceb894ca9dab8c047f81b34a48dd816f1fbf38"
  ],
  [
    "src/zenon/dynamic-plasma-user-send-key-binding.js",
    4237,
    91,
    "37ad7e74b038801297e4bffb0cb8ba92cbd79009ed32c4ae5b134fe2cb154be2"
  ],
  [
    "src/zenon/dynamic-plasma-user-send-nonce-search.js",
    8437,
    156,
    "8eda71acf12265b65015ad6db20c1c7b357b207874c8e4c8b72e2889bf86f318"
  ],
  [
    "src/zenon/dynamic-plasma-user-send-pre-work-key-binding.js",
    3783,
    73,
    "81c0b84174d045baac9b3cc8915e3a079ecf60590cbe43230bff287ce37d8bd9"
  ],
  [
    "src/zenon/dynamic-plasma-user-send-work-binding.js",
    1940,
    42,
    "79eba29a05427128ae3a12346fd3ee7cbaa526d6f39eb36ed58d388640638266"
  ],
  [
    "src/zenon/dynamic-plasma-user-send-work-input.js",
    2853,
    59,
    "2ff9c089e5903c059746d0a1c38688a2849f94d04d429279811fbbfbb40450a4"
  ],
  [
    "src/zenon/dynamic-plasma-user-send-work-request.js",
    2564,
    50,
    "bc66c7d629eae230c46f62c88fa97960860d94b5d65d3c5611612ccae13fe9ce"
  ],
  [
    "src/zenon/plasma-strategy.js",
    974,
    32,
    "1c597d4e169ba8a5e6d2b7852c4ffa3a8ec9b854332fe354b9b013c36ebae093"
  ],
  [
    "src/zenon/transaction-planner.js",
    22611,
    464,
    "079fe8da938e08e33a20ca1076492a829afa6fce3ae7f9b9f68d3bf4bff94233"
  ]
];

const SELF = fileURLToPath(import.meta.url), ROOT = resolve(dirname(SELF), '..');
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.DP_NONCE_COMPOSITION_OPT_IN, 'three-isolated-original-quote-cases-only');
assert.equal(ROOT, process.env.DP_NONCE_COMPOSITION_SOURCE_ROOT);
const PINS = JSON.parse(process.env.DP_NONCE_COMPOSITION_PINS);
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
const sha256 = b => createHash('sha256').update(b).digest('hex');
function sources() {
  assert.equal(PINS.length, SPECS.length + 1);
  assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p[0]), ENTRY]);
  let total = 0;
  return PINS.map((p, index) => {
    const path = join(ROOT, p.path), s = lstatSync(path, { bigint: true });
    assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.nlink, 1n);
    assert.equal(s.uid, BigInt(process.getuid())); assert.deepEqual(ids(s), p.identity);
    assert.ok(s.size > 0n && s.size <= 65536n);
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const raw = Buffer.alloc(Number(s.size) + 1); let used = 0;
    try {
      assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
      while (used < raw.length) {
        const n = readSync(fd, raw, used, raw.length - used, null); if (!n) break; used += n;
      }
      assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
    } finally { closeSync(fd); }
    const b = raw.subarray(0, used);
    assert.equal(used, p.bytes); assert.equal(sha256(b), p.sha256);
    assert.equal(b.filter(v => v === 10).length, p.LF);
    assert.equal(b.some(v => v > 127 || v === 0), false);
    assert.deepEqual(ids(lstatSync(path, { bigint: true })), p.identity);
    total += used; assert.ok(total <= 524288);
    if (index < SPECS.length) assert.deepEqual([p.path,p.bytes,p.LF,p.sha256], SPECS[index]);
    return { path:p.path, bytes:p.bytes, sha256:p.sha256, identity:p.identity };
  });
}
const originalSources = sources();
const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
assert.equal(typeof fetchDescriptor.value, 'function'); assert.equal(fetchDescriptor.configurable, true);
let networkCalls = 0;
const denyFetch = () => { networkCalls++; throw Error('SYNTHETIC_NETWORK_FORBIDDEN'); };
Object.defineProperty(globalThis, 'fetch', { ...fetchDescriptor, value:denyFetch });
const { createBoundedObservedBalanceDynamicPlasmaTransactionPlanner: CREATE }
  = await import('../src/zenon/dynamic-plasma-bounded-observed-balance-planner.js');
const { createObservedBalanceDynamicPlasmaUserSendAttempt: CREATE_ATTEMPT }
  = await import('../src/zenon/dynamic-plasma-observed-balance-user-send-attempt.js');
const { createDynamicPlasmaJsonRpcReadTransport: WIRE }
  = await import('../src/zenon/dynamic-plasma-json-rpc-read-transport.js');
const { computeZenonUnsignedUserSendHash: computeHash }
  = await import('../src/zenon/transaction-planner.js');
const { validateZenonUnsignedUserSendWork: validateWork }
  = await import('../src/zenon/dynamic-plasma-user-send-fixed-work.js');

const OPTIONS = { timeout:5000, concurrency:false };
const H = '33'.repeat(32), PREVIOUS = '66'.repeat(32), GENESIS = '11'.repeat(32);
const TWO = '22'.repeat(32), ZERO_HASH = '0'.repeat(64), ZERO_NONCE = '0'.repeat(16);
const DYNAMIC = '02'.repeat(32), LIBP2P = '01'.repeat(32);
const ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx', MAX = Number.MAX_SAFE_INTEGER;
const PUBLIC = Buffer.alloc(32, 7).toString('base64'); // Existing fixed public bytes only.
const RANGE = 1n << 64n;
const METHODS = ['ledger.getFrontierMomentum','ledger.getMomentumsByHeight','embedded.spork.getAll',
  'embedded.plasma.getVariables','embedded.plasma.getRequiredPoWForAccountBlock','ledger.getFrontierMomentum'];
const FRONTIER = 'ledger.getFrontierAccountBlock', INFO = 'ledger.getAccountInfoByAddress';
const clone = value => JSON.parse(JSON.stringify(value)); // Finite test-owned valid DATA only.
let producerReservations = 0, referenceEvaluations = 0, referenceWindows = 0, plannerRuns = 0;
let referencePreparations = 0, referenceAccountReads = 0, referenceDpReads = 0;
// Conservative static reservation for every fixed-nonce consumer reachable
// through the three one-admission runs and their explicit postconditions.
// It is NOT an observed validator-call count or a wall-clock guarantee.
const fixedVerificationReservations = 1024;
function budget() {
  assert.ok(producerReservations <= 4098); assert.ok(referenceEvaluations <= 20480);
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
function fixture({ base = 1, advances = 2, postWorkAge = 0, maximum = 1, startNonce = ZERO_NONCE } = {}) {
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
    const age = f.accountCalls.length >= 7 ? f.postWorkAge : 0;
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
  f.context = { plannerContextVersion:3,readInput:input };
  return f;
}
async function referenceWork(options) {
  referencePreparations++; assert.ok(referencePreparations <= 2);
  const f = fixture(options), attempt = CREATE_ATTEMPT(f.readOptions);
  const plan = await attempt.quote(f.input), work = await attempt.createWorkRequest(f.input);
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
  referenceWindows++; assert.ok(referenceWindows <= 5);
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
    for (let window=0;window<4;window++) {
      const found = referenceWindow(original.work,BigInt(window*4096),4096);
      if (found !== null) return {...found,original};
    }
    assert.fail('No positive vector inside the reviewed 16384-candidate reference prefix; do not expand or silently pass.');
  })();
  return vectorPromise;
}
function invoke(f) {
  const maximum = f.options.materialOptions.limits.maxAttempts;
  assert.ok(Number.isSafeInteger(maximum) && maximum >= 0 && maximum <= 4096);
  producerReservations += maximum; plannerRuns++; assert.ok(plannerRuns <= 3); budget();
  f.planner = CREATE(f.options);
  return f.planner.prepareUnsigned(f.context);
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
  await assert.rejects(f.planner.prepareUnsigned(hostile),rejected('used'));
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
function diagnostic(t,scenario,f,returnedUnsignedBlocks,postWorkAge) {
  budget();
  t.diagnostic(JSON.stringify({kind:'P1A_OWNED_NONCE_PRICE_COMPOSITION',version:1,scenario,
    accountReads:f.accountCalls.length,dpReads:f.dpCalls.length,producerReservations,
    referenceEvaluations,referenceWindows,fixedVerificationReservations,plannerRuns,
    referencePreparations,referenceAccountReads,referenceDpReads,
    returnedUnsignedBlocks,postWorkAge,originalAcknowledgementHeight:100,networkCalls,
    approvedPerSearchCeiling:4096,approvedAggregateCeiling:65536,
    staticCombinedCandidateUpperBound:25602,
    keys:0,signatures:0,sdkCalls:0,realPrepare:0,authority:'NONE',
    qualification:'LOCAL_SYNTHETIC_UNSIGNED_COMPOSITION_NOT_NATIVE_PROVIDER_OR_LIVE_DP'}));
}

test('owned nonce planner retains the original unsigned block across two post-work price advances',OPTIONS,async t=>{
  const vector = await positiveVector(), f = fixture({postWorkAge:2,startNonce:vector.nonce});
  const before = JSON.stringify(f.context), result = await invoke(f);
  const expected = {...vector.original.work.accountBlock,nonce:vector.nonce,publicKey:PUBLIC};
  expected.hash = computeHash(expected);
  assert.deepEqual(result,expected); frozen(result); assert.equal(result.signature,'');
  assert.equal(result.hash,computeHash(result)); assert.equal(result.nonce,vector.nonce);
  assert.equal(result.address,PAYER); assert.equal(result.publicKey,PUBLIC);
  assert.equal(result.previousHash,PREVIOUS); assert.equal(result.height,7);
  assert.deepEqual(result.momentumAcknowledged,{hash:H,height:100});
  assert.equal(result.amount,'5'); assert.equal(result.tokenStandard,ASSET);
  assert.equal(result.difficulty,3000); assert.equal(result.fusedPlasma,0);
  assert.equal(result.data,f.originalData);
  const verified = validateWork(result);
  assert.equal(verified.work.validation,'MATCHES_DECLARED_DIFFICULTY');
  assert.equal(verified.work.nonceDigest,vector.digest);
  for(const key of ['paymentPayload','privateKey','sign','publish','reset'])assert.equal(Object.hasOwn(result,key),false);
  assert.equal(JSON.stringify(f.context),before); history(f,4);
  assert.deepEqual(f.dpCalls.map(x=>x.age),[...Array(24).fill(0),...Array(24).fill(2)]);
  await consumed(f); diagnostic(t,'TWO_ADVANCES_SAME_BLOCK',f,1,2);
});

test('owned nonce planner holds the expired original quote after work without replacement material or payment',OPTIONS,async t=>{
  const vector = await positiveVector(), f = fixture({postWorkAge:3,startNonce:vector.nonce});
  const before = JSON.stringify(f.context); let returned=0;
  const pending = invoke(f).then(value=>{returned++;return value;});
  await assert.rejects(pending,rejected()); assert.equal(returned,0);
  assert.equal(JSON.stringify(f.context),before); history(f,3);
  assert.deepEqual(f.dpCalls.map(x=>x.age),[...Array(24).fill(0),...Array(12).fill(3)]);
  await consumed(f); diagnostic(t,'EXPIRED_ORIGINAL_QUOTE_HELD',f,0,3);
});

test('owned nonce planner exhausts one finite budget before assembly without returning a replacement block',OPTIONS,async t=>{
  const original = await referenceWork({base:4200000,advances:0});
  assert.equal(original.work.workInput.difficulty,6300000000);
  assert.equal(referenceWindow(original.work,0n,4096),null,
    'A found vector is a failing reviewed exhaustion premise, never permission to change the input.');
  const f = fixture({base:4200000,advances:0,maximum:4096});
  const before = JSON.stringify(f.context); let returned=0;
  await assert.rejects(invoke(f).then(value=>{returned++;return value;}),rejected());
  assert.equal(returned,0); assert.equal(JSON.stringify(f.context),before); history(f,2);
  assert.equal(f.dpCalls.every(x=>x.age===0),true);
  await consumed(f);
  assert.equal(plannerRuns,3); assert.equal(producerReservations,4098);
  assert.equal(referencePreparations,2); assert.equal(referenceAccountReads,12); assert.equal(referenceDpReads,48);
  assert.ok(referenceEvaluations>4096 && referenceEvaluations<=20480);
  diagnostic(t,'BOUNDED_EXHAUSTION_HELD',f,0,0);
});
after(()=>{
  try {
    assert.deepEqual(sources(),originalSources); assert.equal(networkCalls,0);
    assert.equal(globalThis.fetch,denyFetch); budget();
  } finally {Object.defineProperty(globalThis,'fetch',fetchDescriptor);}
});
