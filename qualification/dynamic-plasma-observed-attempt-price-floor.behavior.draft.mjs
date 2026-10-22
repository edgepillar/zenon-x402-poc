// Three NEW selected DECLARED-DATA consumer cases, not live DP qualification.
// Exercise the real v3 original-quote attempt and its two closed DP wires.
// Do not import old test entries or rerun their registered suites.
// No assembly, nonce search/validation, material/key producer, signature,
// SDK, SQL, network, native host, actual PREPARE or payment is exercised.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { constants, lstatSync, openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = "qualification/dynamic-plasma-observed-attempt-price-floor.behavior.draft.mjs";
const SELF = fileURLToPath(import.meta.url), ROOT = resolve(dirname(SELF),'..');
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
assert.equal(process.argv.length,2); assert.equal(process.argv[1],SELF);
assert.equal(process.versions.node,'24.19.0');
assert.equal(process.platform,'darwin'); assert.equal(process.arch,'arm64');
assert.equal(process.env.DP_ATTEMPT_FLOOR_OPT_IN,'three-new-declared-consumer-cases-only');
assert.equal(ROOT,join(process.env.SPV_TASK_SCRATCH,'source'));
const PINS = JSON.parse(process.env.DP_ATTEMPT_FLOOR_PINS);
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k=>String(s[k]));
const sha = b => createHash('sha256').update(b).digest('hex');
function sources() {
  assert.equal(PINS.length,SPECS.length+1);
  assert.deepEqual(PINS.map(p=>p.path),[...SPECS.map(s=>s[0]),ENTRY]);
  let total=0;
  return PINS.map((p,index)=>{
    const path=join(ROOT,p.path),s=lstatSync(path,{bigint:true});
    assert.ok(s.isFile()&&!s.isSymbolicLink()); assert.equal(s.nlink,1n);
    assert.equal(s.uid,BigInt(process.getuid())); assert.deepEqual(ids(s),p.identity);
    assert.ok(s.size>0n&&s.size<=65536n);
    const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW),raw=Buffer.alloc(Number(s.size)+1);
    let used=0;
    try {
      assert.deepEqual(ids(fstatSync(fd,{bigint:true})),p.identity);
      while(used<raw.length){const n=readSync(fd,raw,used,raw.length-used,null);if(!n)break;used+=n;}
      assert.deepEqual(ids(fstatSync(fd,{bigint:true})),p.identity);
    } finally { closeSync(fd); }
    const b=raw.subarray(0,used); assert.equal(used,p.bytes); assert.equal(sha(b),p.sha256);
    assert.equal(b.filter(v=>v===10).length,p.LF); assert.equal(b.some(v=>v>127||v===0),false);
    assert.deepEqual(ids(lstatSync(path,{bigint:true})),p.identity);
    total+=used; assert.ok(total<=524288);
    if(index<SPECS.length)assert.deepEqual([p.path,p.bytes,p.LF,p.sha256],SPECS[index]);
    return {path:p.path,bytes:p.bytes,sha256:p.sha256,identity:p.identity};
  });
}
const originalSources=sources();
const fetchDescriptor=Object.getOwnPropertyDescriptor(globalThis,'fetch');
assert.equal(typeof fetchDescriptor.value,'function'); assert.equal(fetchDescriptor.configurable,true);
let networkCalls=0;
const denyFetch=()=>{networkCalls++;throw Error('SYNTHETIC_NETWORK_FORBIDDEN');};
Object.defineProperty(globalThis,'fetch',{...fetchDescriptor,value:denyFetch});
const {createObservedBalanceDynamicPlasmaUserSendAttempt:CREATE}
  =await import('../src/zenon/dynamic-plasma-observed-balance-user-send-attempt.js');
const {createDynamicPlasmaJsonRpcReadTransport:WIRE}
  =await import('../src/zenon/dynamic-plasma-json-rpc-read-transport.js');
const OPTIONS={timeout:5000,concurrency:false};
const H='33'.repeat(32),H1='44'.repeat(32),PREVIOUS='66'.repeat(32);
const GENESIS='11'.repeat(32),TWO='22'.repeat(32),ZERO='0'.repeat(64);
const ASSET='zts1znnxxxxxxxxxxxxx9z4ulx',DYNAMIC='02'.repeat(32),LIBP2P='01'.repeat(32);
const METHODS=['ledger.getFrontierMomentum','ledger.getMomentumsByHeight','embedded.spork.getAll',
  'embedded.plasma.getVariables','embedded.plasma.getRequiredPoWForAccountBlock','ledger.getFrontierMomentum'];
const FRONTIER='ledger.getFrontierAccountBlock',INFO='ledger.getAccountInfoByAddress';
const clone=v=>JSON.parse(JSON.stringify(v)); // Test-owned finite literal DATA only.
function address(byte) {
  const alphabet='qpzry9x8gf2tvdw0s3jn54khce6mua7l',words=[];
  let accumulator=0,bits=0,checksum=1;
  for(const value of [0,...Array(19).fill(byte)]) {
    accumulator=(accumulator<<8)|value;bits+=8;
    while(bits>=5){bits-=5;words.push((accumulator>>>bits)&31);}
  }
  assert.equal(bits,0);
  for(const word of [3,0,26,...words,0,0,0,0,0,0]) {
    const top=checksum>>>25;checksum=((checksum&0x1ffffff)<<5)^word;
    for(const[index,generator]of[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3].entries())
      if((top>>>index)&1)checksum^=generator;
  }
  checksum=(checksum^1)>>>0;
  return 'z1'+words.map(w=>alphabet[w]).join('')
    +Array.from({length:6},(_,i)=>alphabet[(checksum>>>(5*(5-i)))&31]).join('');
}
const PAYER=address(17),PAYEE=address(34);
function momentum(age,fusion,work,version=2) {
  return {version,chainIdentifier:73404,hash:version===1?TWO:age===0?H:H1,
    previousHash:GENESIS,height:version===1?2:100+age,timestamp:1234,data:'',content:[],
    changesHash:'66'.repeat(32),publicKey:Buffer.alloc(32,6).toString('base64'),
    signature:Buffer.alloc(64,8).toString('base64'), // Fixed DATA, no signing.
    nextFusionPrice:fusion,nextWorkPrice:work,producer:PAYER};
}
function accountBlock() {
  return {version:1,chainIdentifier:73404,blockType:3,hash:PREVIOUS,previousHash:'77'.repeat(32),height:6,
    momentumAcknowledged:{hash:H,height:100},address:PAYER,toAddress:PAYEE,amount:'5',tokenStandard:ASSET,
    fromBlockHash:'88'.repeat(32),descendantBlocks:[],data:null,fusedPlasma:0,difficulty:0,
    nonce:'0000000000000000',basePlasma:21000,usedPlasma:21000,changesHash:ZERO,
    publicKey:'',signature:'',token:null,confirmationDetail:null,pairedAccountBlock:null};
}
function fixture() {
  const accepted={scheme:'exact',network:'zenon:testnet',asset:ASSET,amount:'5',payTo:PAYEE,maxTimeoutSeconds:60,
    extra:{poc:true,settlement:'account-block',paymentFlow:'upfront',
      zenonChain:{version:1,chainIdentifier:'73404',genesisMomentumHash:GENESIS}}};
  const input={observedUserSendReadVersion:3,phase:'UNSIGNED',
    paymentRequired:{x402Version:2,resource:{url:'https://resource.invalid/paid',description:'Synthetic resource.',
      mimeType:'application/json',tags:['synthetic']},accepts:[clone(accepted)]},
    accepted,payerAddress:PAYER,compiledSporkIds:{dynamicPlasmaId:DYNAMIC,libp2pId:LIBP2P},
    policy:{policyVersion:1,maxPriceChangePercent:10,maxMomentumAdvances:2,maxFusedPlasma:0,maxDifficulty:150000000},
    runtimeContextDigest:'sha256:'+'b'.repeat(64)};
  const f={input,accountCalls:[],dpCalls:[],positions:[0,0],age:0,fusion:2000,work:2000,order:[]};
  const transports=[0,1].map(endpoint=>WIRE({exchange:body=>{
    const request=JSON.parse(body),index=f.positions[endpoint]++%6;
    assert.equal(request.method,METHODS[index]);assert.equal(request.id,f.positions[endpoint]);
    if(index===0||index===5||index===3)assert.deepEqual(request.params,[]);
    else if(index===1)assert.deepEqual(request.params,[2,1]);
    else if(index===2)assert.deepEqual(request.params,[0,128]);
    else assert.deepEqual(request.params,[{address:PAYER,blockType:2,toAddress:PAYEE,
      data:f.originalData}]);
    f.dpCalls.push({endpoint,request});f.order.push('dp:'+endpoint+':'+request.method);
    let result;
    if(index===0||index===5)result=momentum(f.age,f.fusion,f.work);
    else if(index===1)result={count:200,list:[momentum(0,0,0,1)]};
    else if(index===2)result={count:2,list:[
      {id:LIBP2P,name:'libp2p',description:'Synthetic.',activated:false,enforcementHeight:0},
      {id:DYNAMIC,name:'dynamic-plasma',description:'Synthetic.',activated:true,enforcementHeight:10}]};
    else if(index===3)result={MaxBasePlasmaInMomentum:4200000,FusedPlasmaTarget:1050000,
      PowPlasmaTarget:1050000,MaxPriceChangePercent:10,PriceChangeDenominator:20};
    else result={availablePlasma:0,basePlasma:21000,requiredFusedPlasma:Math.ceil(21000*f.fusion/1000),
      requiredDifficulty:Math.ceil(21000*f.work/1000)*1500};
    return Promise.resolve(JSON.stringify({jsonrpc:'2.0',id:request.id,result}));
  }}));
  f.attempt=CREATE({transports,accountExchange:body=>{
    const request=JSON.parse(body);f.accountCalls.push(request);f.order.push('account:'+request.method);
    assert.equal(request.id,f.accountCalls.length);assert.deepEqual(request.params,[PAYER]);
    assert.equal(request.method,request.id%3===2?INFO:FRONTIER);
    const result=request.method===INFO?{address:PAYER,accountHeight:6,
      balanceInfoMap:{[ASSET]:{token:{tokenStandard:ASSET},balance:'5'}}}:accountBlock();
    return Promise.resolve(JSON.stringify({jsonrpc:'2.0',id:request.id,result}));
  }});
  // Independent canonical intent DATA; this hash does not authorize a payment.
  const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value)
    :Array.isArray(value)?'['+value.map(canonical).join(',')+']'
    :'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  const intent=sha(Buffer.from(canonical({x402Version:2,resource:input.paymentRequired.resource,accepted}),'utf8'));
  f.originalData=Buffer.from(intent,'hex').toString('base64');
  return f;
}
function error(kind='operation_rejected') {
  return value=>{
    assert.ok(value instanceof TypeError&&Object.isFrozen(value));
    assert.equal(value.code,'zenon_observed_balance_dp_attempt_'+kind);
    assert.equal(value.message,value.code);assert.equal(value.stack,'TypeError: '+value.code);
    assert.equal(Object.hasOwn(value,'cause'),false);return true;
  };
}
function frozen(value) {
  if(value===null||typeof value!=='object')return;
  assert.equal(Object.isFrozen(value),true);for(const child of Object.values(value))frozen(child);
}
function history(f) {
  assert.equal(f.accountCalls.length,6);assert.deepEqual(f.positions,[12,12]);assert.equal(f.dpCalls.length,24);
  assert.deepEqual(f.accountCalls.map(x=>x.id),[1,2,3,4,5,6]);
  const cycle=['account:'+FRONTIER,'account:'+INFO,
    ...METHODS.map(x=>'dp:0:'+x),...METHODS.map(x=>'dp:1:'+x),'account:'+FRONTIER];
  assert.deepEqual(f.order,[...cycle,...cycle]);assert.equal(networkCalls,0);
}
async function held(f) {
  const before=clone([f.accountCalls,f.dpCalls,f.order]);let hooks=0;
  const hostile=new Proxy({},{getPrototypeOf(){hooks++;throw Error('PRIVATE_HOSTILE_INPUT');}});
  await assert.rejects(f.attempt.quote(hostile),error('held'));
  await assert.rejects(f.attempt.createWorkRequest(hostile),error('held'));
  await assert.rejects(f.attempt.assemble(hostile,hostile),error('held'));
  await assert.rejects(f.attempt.validateUnsigned(hostile),error('held'));
  assert.equal(hooks,0);assert.deepEqual([f.accountCalls,f.dpCalls,f.order],before);
}
const names=["observed attempt holds a too-fast fusion decline before creating any work request","observed attempt holds a too-fast work-price decline before creating any work request","observed attempt accepts the exact lower clamp with the original quote and acknowledgement"];
for(const[index,name]of names.entries())test(name,OPTIONS,async t=>{
  const f=fixture(),inputBefore=JSON.stringify(f.input);
  const plan=await f.attempt.quote(f.input),planBefore=JSON.stringify(plan);
  frozen(plan);assert.equal(plan.subject.momentumAcknowledged.height,100);
  const selected=plan.quote.sourceQuote.pricePolicyQuote.selected;
  assert.deepEqual(selected,{fusedPlasma:0,difficulty:76230000});
  assert.deepEqual(plan.quote.sourceQuote.pricePolicyQuote.boundPrices,{fusionPrice:2420,workPrice:2420});
  f.age=1;f.fusion=index===0?1799:index===2?1800:2000;f.work=index===1?1799:index===2?1800:2000;
  let workRequests=0;
  if(index<2) {
    await assert.rejects(f.attempt.createWorkRequest(f.input),error());
    // Restore the declared observation but never recreate the attempt/wires.
    f.fusion=2000;f.work=2000;await held(f);
  } else {
    const work=await f.attempt.createWorkRequest(f.input);workRequests++;frozen(work);
    assert.deepEqual(work.selection,selected);assert.equal(work.accountBlock.previousHash,PREVIOUS);
    assert.equal(work.accountBlock.height,7);assert.deepEqual(work.accountBlock.momentumAcknowledged,{height:100,hash:H});
    assert.equal(work.accountBlock.fusedPlasma,0);assert.equal(work.accountBlock.difficulty,76230000);
    assert.equal(work.accountBlock.hash,ZERO);assert.equal(work.accountBlock.nonce,'0'.repeat(16));
    assert.equal(work.accountBlock.publicKey,'');assert.equal(work.accountBlock.signature,'');
    assert.equal(work.stage,'BEFORE_NONCE_GENERATION');assert.equal(work.preparation,'NOT_PERFORMED');
    assert.equal(work.workInput.difficulty,76230000);assert.equal(work.workInput.nonceGeneration,'NOT_PERFORMED');
    assert.equal(work.authority,'NONE');assert.equal(work.chainAuthentication,'NOT_ESTABLISHED');
    const calls=JSON.stringify([f.accountCalls,f.dpCalls]);
    await assert.rejects(f.attempt.createWorkRequest(f.input),error('stage_rejected'));
    assert.equal(JSON.stringify([f.accountCalls,f.dpCalls]),calls);
  }
  history(f);assert.equal(JSON.stringify(plan),planBefore);assert.equal(JSON.stringify(f.input),inputBefore);
  t.diagnostic(JSON.stringify({kind:'DP_OBSERVED_ATTEMPT_PRICE_FLOOR',version:1,scenario:index+1,
    accountReads:6,dpReads:24,stageCycles:2,workRequests,held:index<2,originalQuoteStable:true,
    originalAcknowledgementHeight:100,selectedDifficulty:76230000,workProducerCalls:0,
    assemblyCalls:0,keys:0,signatures:0,networkCalls,realPrepare:0,authority:'NONE',
    qualification:'DECLARED_DATA_CONSUMER_ONLY_NOT_LIVE_DP'}));
});
after(()=>{
  try{assert.deepEqual(sources(),originalSources);assert.equal(networkCalls,0);assert.equal(globalThis.fetch,denyFetch);}
  finally{Object.defineProperty(globalThis,'fetch',fetchDescriptor);}
});
