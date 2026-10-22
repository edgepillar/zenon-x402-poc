// Seven finite DECLARED-DATA price-floor cases; not runtime DP qualification.
// Compare the retained pre-change policy with this candidate on four NEW
// downward-clamp counterexamples, then exercise actual three-/four-field SPI.
// No old upper-bound or current-main fixture is imported or rerun.
// One foreground Node process, no key/nonce/work producer, SDK, SQL or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants, lstatSync, openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = "qualification/dynamic-plasma-elapsed-price-floor.behavior.draft.mjs";
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
    "src/zenon/dynamic-plasma-observation-normalizer.js",
    28398,
    698,
    "2c3f7d42ded21a5513ff26c23a00a35a53aa334f053d10930f1571a020286897"
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
  ],
  [
    "baseline/dynamic-plasma-price-policy.js",
    15457,
    427,
    "dc935f2d06d518c0ec4cec3f20f9233b931fd8c3f35c2d6733f03f33dcab61d0"
  ]
];
assert.equal(process.argv.length,2);assert.equal(process.argv[1],SELF);
assert.equal(process.versions.node,'24.19.0');assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
assert.equal(process.env.DP_ELAPSED_FLOOR_OPT_IN,'seven-declared-data-cases-only');
assert.equal(ROOT,join(process.env.SPV_TASK_SCRATCH,'source'));
const PINS=JSON.parse(process.env.DP_ELAPSED_FLOOR_PINS);
const ids=s=>['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k=>String(s[k]));
const sha=b=>createHash('sha256').update(b).digest('hex');
function sources(){
  assert.equal(PINS.length,SPECS.length+1);
  assert.deepEqual(PINS.map(p=>p.path),[...SPECS.map(s=>s[0]),ENTRY]);
  let total=0;
  return PINS.map((p,index)=>{
    const path=join(ROOT,p.path),s=lstatSync(path,{bigint:true});
    assert.ok(s.isFile()&&!s.isSymbolicLink());assert.equal(s.nlink,1n);
    assert.equal(s.uid,BigInt(process.getuid()));assert.deepEqual(ids(s),p.identity);
    assert.ok(s.size>0n&&s.size<=65536n);
    const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW),raw=Buffer.alloc(Number(s.size)+1);
    let used=0;
    try{
      assert.deepEqual(ids(fstatSync(fd,{bigint:true})),p.identity);
      while(used<raw.length){const n=readSync(fd,raw,used,raw.length-used,null);if(!n)break;used+=n;}
      assert.deepEqual(ids(fstatSync(fd,{bigint:true})),p.identity);
    }finally{closeSync(fd);}
    const b=raw.subarray(0,used);assert.equal(used,p.bytes);assert.equal(sha(b),p.sha256);
    assert.equal(b.filter(v=>v===10).length,p.LF);assert.equal(b.some(v=>v>127||v===0),false);
    assert.deepEqual(ids(lstatSync(path,{bigint:true})),p.identity);
    total+=used;assert.ok(total<=300000);
    if(index<SPECS.length)assert.deepEqual([p.path,p.bytes,p.LF,p.sha256],SPECS[index]);
    return{path:p.path,bytes:p.bytes,sha256:p.sha256,identity:p.identity};
  });
}
const before=sources();
const baseline=await import('../baseline/dynamic-plasma-price-policy.js');
const candidate=await import('../src/zenon/dynamic-plasma-price-policy.js');
const {BoundedDynamicPlasmaStrategy:Strategy}=await import('../src/zenon/bounded-dynamic-plasma-strategy.js');
const {validateDynamicPlasmaRequiredFusedPolicySelection:validateFour}
  =await import('../src/zenon/dynamic-plasma-required-fused-policy-adapter.js');
const H='1'.repeat(64),H2='2'.repeat(64),SUBJECT='sha256:'+'a'.repeat(64),RUNTIME='sha256:'+'b'.repeat(64);
const CODE='dynamic_plasma_price_policy_input_rejected';
const FOUR='dynamic_plasma_required_fused_policy_input_rejected';
const names=[
  'elapsed floor rejects a one-step fusion drop despite spare full-horizon room',
  'elapsed floor rejects a one-step work drop despite spare full-horizon room',
  'elapsed floor uses two observed advances instead of the full quoted horizon',
  'elapsed floor rejects the integer below the per-step rounded minimum',
  'elapsed floor retains exact selections at coherent downward clamps and the absolute minimum',
  'actual three-field strategy refuses a fast drop and retains a coherent lower edge',
  'actual four-field planner and validator share the downward clamp without changing the original pair',
];
const counts={baselineAcceptedCounterexamples:0,candidateRefusedCounterexampleCalls:0,positiveDeclinePaths:0,
  threeFieldConsumerRefusals:0,fourFieldConsumerRefusals:0,completedCases:0};
function amounts(available,fusion,work){
  const total=Math.ceil(100*fusion/1000),fused=Math.min(available,total);
  const difficulty=available>=total?0:Math.ceil((100-Math.floor(available*1000/fusion))*work/1000)*1500;
  return{total,fused,difficulty,mode:difficulty===0?'FUSION_ONLY':'FUSION_AND_POW'};
}
function instant(available,fusion,work,age=0){
  const a=amounts(available,fusion,work);
  return{classification:'DP_ACTIVE',reason:'NONE',scope:'OBSERVED_FRONTIER_ONLY',chainProfileGuard:'MATCH',
    chainAuthentication:'NOT_ESTABLISHED',afterSigningAction:'NONE',quote:{
      frontier:{height:1000+age,hash:age===0?H:H2,version:2,nextFusionPrice:fusion,nextWorkPrice:work},
      rpcObservation:{availablePlasma:available,basePlasma:100,requiredDifficulty:a.difficulty},
      selectedFusedPlasma:a.fused,requiredDifficulty:a.difficulty,powRequired:a.difficulty!==0,
      pricingMode:a.mode,sdk105BasePlasmaUnderpricingDetected:a.difficulty===0&&a.fused>100}};
}
function policy(percent=10){
  return{policyVersion:1,maxPriceChangePercent:percent,maxMomentumAdvances:3,maxFusedPlasma:10000,maxDifficulty:10000000};
}
function make(module,available,initial=2000,percent=10){
  return module.createDynamicPlasmaPricePolicyQuote({compatibility:instant(available,initial,initial),
    policy:policy(percent),subjectDigest:SUBJECT,runtimeContextDigest:RUNTIME});
}
function input(quote,current){
  return{quote,compatibility:current,policy:quote.policy,subjectDigest:SUBJECT,runtimeContextDigest:RUNTIME};
}
function frozen(v){
  if(v&&typeof v==='object'){assert.ok(Object.isFrozen(v));for(const x of Object.values(v))frozen(x);}
}
function policyError(error){
  return error instanceof TypeError&&error.code===CODE
    &&error.message==='Dynamic Plasma price policy input rejected'
    &&error.stack==='TypeError: Dynamic Plasma price policy input rejected'&&Object.isFrozen(error);
}
function adapterError(error){return error instanceof TypeError&&error.code===FOUR&&Object.isFrozen(error);}
function lowPrice(initial,p,age){
  let value=BigInt(initial);
  for(let i=0;i<age;i++){value=value*BigInt(100-p)/100n;if(value<1000n)value=1000n;}
  return Number(value);
}
function counterexample(available,initial,fusion,work,age,expectedMinimum){
  assert.equal(lowPrice(initial,10,age),expectedMinimum);
  const old=make(baseline,available,initial),updated=make(candidate,available,initial);
  assert.deepEqual(updated,old);frozen(updated);
  const snapshot=JSON.stringify(updated),current=instant(available,fusion,work,age);
  assert.deepEqual(baseline.selectDynamicPlasmaPricePolicyFields(input(old,current)),old.selected);
  assert.deepEqual(baseline.validateDynamicPlasmaPricePolicySelection({
    ...input(old,current),selection:{...old.selected}}),old.selected);
  counts.baselineAcceptedCounterexamples++;
  assert.throws(()=>candidate.selectDynamicPlasmaPricePolicyFields(input(updated,current)),policyError);
  assert.throws(()=>candidate.validateDynamicPlasmaPricePolicySelection({
    ...input(updated,current),selection:{...updated.selected}}),policyError);
  counts.candidateRefusedCounterexampleCalls+=2;
  assert.equal(JSON.stringify(updated),snapshot);
}
function observation(available,fusion,work,age=0,four=false){
  const c=instant(available,fusion,work,age),f=c.quote.frontier;
  const rpc={...c.quote.rpcObservation};
  if(four)rpc.requiredFusedPlasma=amounts(available,fusion,work).total;
  return{chainProfileMatch:{classification:'MATCH'},beforeFrontier:{...f},rpcObservation:rpc,afterFrontier:{...f}};
}
function context(raw,p,four=false){
  return{phase:'UNSIGNED',subjectDigest:SUBJECT,runtimeContextDigest:RUNTIME,observation:raw,policy:p,
    ...(four?{requiredFusedPolicyVersion:1}:{})};
}
async function run(index){
  if(index===0){assert.deepEqual(Object.keys(candidate),Object.keys(baseline));counterexample(10000,2000,1799,2000,1,1800);}
  else if(index===1)counterexample(0,2000,2000,1799,1,1800);
  else if(index===2)counterexample(10000,2000,1619,2000,2,1620);
  else if(index===3)counterexample(10000,2019,1816,2019,1,1817);
  else if(index===4){
    // Explicit expected values include per-step rounding (2002 -> 1801 -> 1620),
    // not a single aggregate multiplication (which would produce 1621).
    const vectors=[[2000,1,1,1980],[2002,10,2,1620],[2400,25,2,1350],[2000,100,1,1000],[1101,10,1,1000]];
    for(const[initial,p,age,price]of vectors)for(const available of[10000,0,50]){
      assert.equal(lowPrice(initial,p,age),price);
      const old=make(baseline,available,initial,p),updated=make(candidate,available,initial,p);
      assert.deepEqual(updated,old);const current=instant(available,price,price,age),serialized=JSON.stringify(updated);
      for(const[module,quote]of[[baseline,old],[candidate,updated]]){
        const selected=module.selectDynamicPlasmaPricePolicyFields(input(quote,current));
        const checked=module.validateDynamicPlasmaPricePolicySelection({...input(quote,current),selection:{...quote.selected}});
        assert.deepEqual(selected,old.selected);assert.deepEqual(checked,old.selected);
        frozen(selected);frozen(checked);assert.equal(quote.chainAuthentication,'NOT_ESTABLISHED');
        assert.equal(quote.afterSigningAction,'NONE');
      }
      assert.equal(JSON.stringify(updated),serialized);counts.positiveDeclinePaths++;
    }
  }else if(index===5){
    const strategy=new Strategy(),p=policy(25),origin=context(observation(10000,2400,2400),p);
    const quote=await strategy.quote(origin),serialized=JSON.stringify(quote);
    assert.deepEqual(quote,make(candidate,10000,2400,25));
    await assert.rejects(strategy.apply(context(observation(10000,1799,2400,1),p),quote),policyError);
    counts.threeFieldConsumerRefusals++;
    const selected=await strategy.apply(context(observation(10000,1800,2400,1),p),quote);
    assert.deepEqual(selected,quote.selected);frozen(selected);assert.equal(JSON.stringify(quote),serialized);
    assert.equal(quote.afterSigningAction,'NONE');
  }else if(index===6){
    const strategy=new Strategy(),p=policy(),origin=context(observation(50,2000,2000,0,true),p,true);
    const quote=await strategy.quote(origin),serialized=JSON.stringify(quote),selected={...quote.pricePolicyQuote.selected};
    assert.deepEqual(selected,make(candidate,50).selected);
    const bad=context(observation(50,2000,1799,1,true),p,true);
    await assert.rejects(strategy.apply(bad,quote),adapterError);counts.fourFieldConsumerRefusals++;
    const request=raw=>({requiredFusedPolicyVersion:1,observation:raw,policy:p,
      subjectDigest:SUBJECT,runtimeContextDigest:RUNTIME,quote,selection:{...selected}});
    assert.throws(()=>validateFour(request(bad.observation)),adapterError);counts.fourFieldConsumerRefusals++;
    const good=context(observation(50,2000,1800,1,true),p,true);
    const plan=await strategy.apply(good,quote),checked=validateFour(request(good.observation));
    assert.deepEqual(plan,selected);assert.deepEqual(checked,selected);frozen(plan);frozen(checked);
    assert.equal(JSON.stringify(quote),serialized);assert.equal(quote.authority,'NONE');
    assert.equal(quote.chainAuthentication,'NOT_ESTABLISHED');assert.equal(quote.activation,'NOT_ESTABLISHED');
    assert.equal(quote.afterSigningAction,'NONE');
  }
}
for(const[index,name]of names.entries())test(name,{timeout:5000,concurrency:false},async t=>{
  assert.equal(counts.completedCases,index);await run(index);counts.completedCases++;
  assert.deepEqual(sources(),before);
  if(index===6){
    assert.deepEqual(counts,{baselineAcceptedCounterexamples:4,candidateRefusedCounterexampleCalls:8,
      positiveDeclinePaths:15,threeFieldConsumerRefusals:1,fourFieldConsumerRefusals:2,completedCases:7});
    t.diagnostic(JSON.stringify({kind:'DP_ELAPSED_PRICE_FLOOR',version:1,...counts,
      unchangedQuoteAllocation:true,unchangedReceiptAndApi:true,exactOriginalSelectedPair:true,
      workOrNonceSearchCalls:0,keyPairs:0,signatures:0,sdkCalls:0,sqliteFiles:0,networkCalls:0,
      chainAuthentication:'NOT_ESTABLISHED',afterSigningAction:'NONE',authority:'NONE'}));
  }
});
