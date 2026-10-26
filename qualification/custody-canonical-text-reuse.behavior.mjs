import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';

const phase=process.env.X402_CUSTODY_CANONICAL_PHASE;
assert.ok(phase==='baseline'||phase==='optimized');
const apply=Reflect.apply, nativeHash=crypto.createHash, parse=JSON.parse, stringify=JSON.stringify;
const parseDescriptor=Object.getOwnPropertyDescriptor(JSON,'parse');
const stringifyDescriptor=Object.getOwnPropertyDescriptor(JSON,'stringify');
const hashDescriptor=Object.getOwnPropertyDescriptor(crypto,'createHash');
let active=null, C;
try {
  Object.defineProperty(JSON,'parse',{...parseDescriptor,value:function(...args){
    if(active!==null)active.jsonParses++;
    return apply(parse,JSON,args);
  }});
  Object.defineProperty(JSON,'stringify',{...stringifyDescriptor,value:function(...args){
    if(active!==null)active.jsonStringifies++;
    return apply(stringify,JSON,args);
  }});
  Object.defineProperty(crypto,'createHash',{...hashDescriptor,value:function(...args){
    if(active!==null)active.hashCalls++;
    return apply(nativeHash,crypto,args);
  }});
  syncBuiltinESMExports();
  C=await import('../src/service-credit-original-request-custody-contract.js');
} finally {
  Object.defineProperty(JSON,'parse',parseDescriptor);
  Object.defineProperty(JSON,'stringify',stringifyDescriptor);
  Object.defineProperty(crypto,'createHash',hashDescriptor);
  syncBuiltinESMExports();
}
assert.deepEqual(Object.getOwnPropertyDescriptor(JSON,'parse'),parseDescriptor);
assert.deepEqual(Object.getOwnPropertyDescriptor(JSON,'stringify'),stringifyDescriptor);
assert.deepEqual(Object.getOwnPropertyDescriptor(crypto,'createHash'),hashDescriptor);

const {createServiceCreditCustodiedRecoveryCollectionCore:COLLECT}=
  await import('../src/service-credit-custodied-recovery-collection-core.js');
const F=Object.freeze, rows=[];
const GRANT='grant.canonical.reuse', FUNDING='https://reuse.invalid/funding';
const SERVICE='https://reuse.invalid/service-credit/v1/execute', HASH='a'.repeat(64);
const EMPTY='sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const originalCode='service_credit_original_request_custody_rejected';
const intentCode='service_credit_original_dispatch_intent_rejected';
const copy=value=>parse(stringify(value));
const digest=text=>apply(nativeHash,crypto,['sha256']).update(text,'utf8').digest('hex');
const known=code=>error=>error instanceof TypeError&&error.code===code&&Object.isFrozen(error);
function original(id='request.a',cost=7,network='zenon:declared'){
  return C.captureOriginalServiceRequestCustody({
    originalRequestJson:stringify({modelVersion:1,grantId:GRANT,requestId:id,method:'POST',
      routeId:'service-credit.execute.v1',canonicalBodyDigest:EMPTY,selectedContentType:'application/json',maxCostUnits:cost}),
    originalBodyBase64:'',serviceResourceUrl:SERVICE,
  },{fundingResourceUrl:FUNDING,paymentHash:HASH,network});
}
function intent(value,revision=3){
  return C.captureOriginalServiceDispatchIntent(value,{
    fundingRevision:revision,challengeDigest:'sha256:'+'b'.repeat(64),paymentDigest:'sha256:'+'c'.repeat(64),
    custodyPolicy:{policyVersion:1,maxRequests:8,serviceResourceUrl:SERVICE},
  });
}
function observe(label,mode,fn,count=16){
  assert.equal(active,null);
  const facts={hashCalls:0,jsonParses:0,jsonStringifies:0};
  let output=null;active=facts;
  try {for(let i=0;i<count;i++)output=fn();}
  finally {active=null;}
  assert.equal(typeof output,'string');
  if(mode==='owned'&&phase==='optimized')assert.deepEqual(facts,{hashCalls:0,jsonParses:0,jsonStringifies:0});
  else assert.ok(facts.hashCalls>=count);
  rows.push({label,mode,iterations:count,...facts,outputUnits:output.length,outputSha256:digest(output)});
  return output;
}
// A real factory call proves this process captured the counting delegates;
// a preloaded ordinary module cannot silently report zero observed work.
active={hashCalls:0,jsonParses:0,jsonStringifies:0};
try {original('request.instrument');assert.equal(active.hashCalls,1);}
finally {active=null;}

test('Canonical custody reuse / captured original preserves every canonical byte',()=>{
  const value=original();const text=stringify(value);
  assert.equal(observe('captured-original','owned',()=>C.serializeOriginalServiceRequestCustody(value)),text);
  assert.ok(Object.isFrozen(value));
});
test('Canonical custody reuse / captured intent preserves its sorted canonical bytes',()=>{
  const value=intent(original());const text=stringify(value,Object.keys(value).sort());
  assert.equal(observe('captured-intent','owned',()=>C.serializeOriginalServiceDispatchIntent(value)),text);
});
test('Canonical custody reuse / parsed original remains a fresh frozen record',()=>{
  const first=original(),text=C.serializeOriginalServiceRequestCustody(first);
  const value=C.parseOriginalServiceRequestCustody(text);assert.notEqual(value,first);assert.deepEqual(value,first);
  assert.equal(observe('parsed-original','owned',()=>C.serializeOriginalServiceRequestCustody(value)),text);
});
test('Canonical custody reuse / parsed intent remains a fresh frozen record',()=>{
  const first=intent(original()),text=C.serializeOriginalServiceDispatchIntent(first);
  const value=C.parseOriginalServiceDispatchIntent(text);assert.notEqual(value,first);assert.deepEqual(value,first);
  assert.equal(observe('parsed-intent','owned',()=>C.serializeOriginalServiceDispatchIntent(value)),text);
});
test('Canonical custody reuse / explicit validation still produces a distinct fully validated original',()=>{
  const first=original(),value=C.validateOriginalServiceRequestCustody(first);
  assert.notEqual(value,first);assert.deepEqual(value,first);
  assert.equal(observe('validated-original','owned',()=>C.serializeOriginalServiceRequestCustody(value)),stringify(first));
});
test('Canonical custody reuse / borrowed mutable originals are fully checked on every call',()=>{
  const value=copy(original());
  assert.equal(observe('borrowed-original','borrowed',()=>C.serializeOriginalServiceRequestCustody(value)),stringify(value));
});
test('Canonical custody reuse / borrowed mutable intents are fully checked on every call',()=>{
  const value=copy(intent(original()));
  assert.equal(observe('borrowed-intent','borrowed',()=>C.serializeOriginalServiceDispatchIntent(value)),stringify(value,Object.keys(value).sort()));
});
test('Canonical custody reuse / original text parsing still validates every checksum',()=>{
  const text=C.serializeOriginalServiceRequestCustody(original());
  assert.equal(observe('parse-original','parse',()=>C.serializeOriginalServiceRequestCustody(C.parseOriginalServiceRequestCustody(text))),text);
});
test('Canonical custody reuse / intent text parsing still validates every checksum',()=>{
  const text=C.serializeOriginalServiceDispatchIntent(intent(original()));
  assert.equal(observe('parse-intent','parse',()=>C.serializeOriginalServiceDispatchIntent(C.parseOriginalServiceDispatchIntent(text))),text);
});
test('Canonical custody reuse / one borrowed identity cannot retain stale text after a rewrite',()=>{
  const value=copy(original()),first=C.serializeOriginalServiceRequestCustody(value);
  value.checksum='sha256:'+'0'.repeat(64);
  assert.throws(()=>C.serializeOriginalServiceRequestCustody(value),known(originalCode));
  Object.assign(value,original('request.a',8));
  const next=C.serializeOriginalServiceRequestCustody(value);
  assert.notEqual(next,first);assert.equal(next,stringify(value));
});
test('Canonical custody reuse / frozen external lookalikes are still validated on every call',()=>{
  const value=F(copy(original()));
  assert.equal(observe('frozen-borrowed-original','borrowed',()=>C.serializeOriginalServiceRequestCustody(value)),stringify(value));
});
test('Canonical custody reuse / proxy and accessor lookalikes cannot acquire factory provenance',()=>{
  const value=original();let entered=0;
  const proxy=new Proxy(value,{getPrototypeOf(){entered++;throw Error('NO_PROXY_TRAP');},ownKeys(){entered++;throw Error('NO_PROXY_TRAP');}});
  const getter={...value};Object.defineProperty(getter,'checksum',{enumerable:true,get(){entered++;throw Error('NO_GETTER');}});
  assert.throws(()=>C.serializeOriginalServiceRequestCustody(proxy),known(originalCode));
  assert.throws(()=>C.serializeOriginalServiceRequestCustody(getter),known(originalCode));
  assert.equal(entered,0);
  assert.throws(()=>C.serializeOriginalServiceRequestCustody(intent(value)),known(originalCode));
  assert.throws(()=>C.serializeOriginalServiceDispatchIntent(value),known(originalCode));
});
test('Canonical custody reuse / cached values never relax exact serializer arity',()=>{
  const value=original(),claim=intent(value);
  for(const [fn,record,code]of [[C.serializeOriginalServiceRequestCustody,value,originalCode],
      [C.serializeOriginalServiceDispatchIntent,claim,intentCode]]){
    assert.throws(()=>fn(),known(code));assert.throws(()=>fn(record,undefined),known(code));
    assert.throws(()=>fn(record,record),known(code));
  }
});
function collection(){
  const values=[original('request.a'),original('request.b')],claims=[intent(values[0]),null];
  const keys=F(values.map(value=>F({grantId:value.grantId,requestId:value.requestId})));
  const funding=F({revision:3,status:'BOUND',ambiguityLatched:false,fundingResourceUrl:FUNDING,paymentHash:HASH,network:'zenon:declared'});
  const uncertainty=F({custody:false,submission:false,undrained:false,declaredFundingAmbiguitySeen:false});
  const calls={catalog:0,children:0,closes:0};let index=0;
  const readCatalog=F(function(){calls.catalog++;return F({grantId:GRANT,keys,funding,uncertainty});});
  const createStatePlan=F(function(key){
    const i=index++;assert.deepEqual(key,keys[i]);let closed=false;
    return F({observe:F(function(){throw Error('NOT_OBSERVED');}),getSnapshot:F(function(){
      assert.equal(closed,false);calls.children++;
      return F({closed:false,recoveryState:F({original:values[i],dispatchIntent:claims[i],
        dispatchStatus:claims[i]===null?'NO_INTENT_RECORDED':'POSSIBLY_ATTEMPTED',funding,uncertainty}),
        currentFundingUncertain:false,observedFundingUncertain:false});
    }),close:F(function(){assert.equal(closed,false);closed=true;calls.closes++;})});
  });
  const initial=stringify(keys.map(key=>({...key,observationJson:'{}'})));
  const core=COLLECT({readCatalog,createStatePlan,selectedGrantId:GRANT},initial);
  return {core,calls,values,claims};
}
const prefix='SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
test('Canonical custody reuse / complete recovery refresh preserves every catalog and child read',()=>{
  const f=collection(),before={...f.calls};let snapshot;
  observe('whole-recovery-collection','owned',()=>{snapshot=f.core.getSnapshot();return stringify(snapshot);},8);
  assert.equal(f.calls.catalog-before.catalog,16);assert.equal(f.calls.children-before.children,16);
  assert.equal(snapshot.nextStep,'RECONCILIATION_REQUIRED');assert.equal(snapshot.authority,'NONE');
  assert.equal(snapshot.mayDispatchService,false);assert.equal(snapshot.deliveryConfirmed,false);
  const closed=f.core.close();assert.equal(f.calls.closes,2);assert.equal(closed.snapshotKind,'DETACHED_HISTORICAL');
  assert.equal(f.core.close(),closed);assert.equal(f.core.getSnapshot(),closed);
  rows.at(-1).catalogReads=16;rows.at(-1).childReads=16;rows.at(-1).diagnosticChildrenClosed=2;
});
test('Canonical custody reuse / a new valid original still latches whole-history mismatch',()=>{
  const f=collection(),history=f.core.getSnapshot();
  f.values[0]=original('request.a',8);
  assert.throws(()=>f.core.getSnapshot(),known(prefix+'ORIGINAL_BINDING_CHANGED'));
  assert.throws(()=>f.core.getSnapshot(),known(prefix+'RECOVERY_COLLECTION_UNAVAILABLE'));
  const closed=f.core.close();assert.equal(closed.entries,history.entries);assert.equal(f.calls.closes,2);
});
test('Canonical custody reuse / a new valid intent still latches whole-history mismatch',()=>{
  const f=collection(),history=f.core.getSnapshot();
  f.claims[0]=intent(f.values[0],4);
  assert.throws(()=>f.core.getSnapshot(),known(prefix+'DISPATCH_INTENT_BINDING_CHANGED'));
  const closed=f.core.close();assert.equal(closed.entries,history.entries);assert.equal(closed.unavailable,true);
});
test('Canonical custody reuse / captured weak-map methods survive later prototype replacement',()=>{
  const value=original(),first=C.serializeOriginalServiceRequestCustody(value),gd=Object.getOwnPropertyDescriptor(WeakMap.prototype,'get');
  const sd=Object.getOwnPropertyDescriptor(WeakMap.prototype,'set');let text,created,entered=0;
  try{
    Object.defineProperty(WeakMap.prototype,'get',{...gd,value(){entered++;throw Error('NO_WEAK_GET_HOOK');}});
    Object.defineProperty(WeakMap.prototype,'set',{...sd,value(){entered++;throw Error('NO_WEAK_SET_HOOK');}});
    text=C.serializeOriginalServiceRequestCustody(value);
    created=C.serializeOriginalServiceRequestCustody(original('request.new'));
  }finally{Object.defineProperty(WeakMap.prototype,'get',gd);Object.defineProperty(WeakMap.prototype,'set',sd);}
  assert.equal(text,first);assert.equal(typeof created,'string');assert.equal(entered,0);
});
test('Canonical custody reuse / prior valid text never makes a noncanonical parse acceptable',()=>{
  for(const [value,encode,decode,code]of [[original(),C.serializeOriginalServiceRequestCustody,C.parseOriginalServiceRequestCustody,originalCode],
      [intent(original()),C.serializeOriginalServiceDispatchIntent,C.parseOriginalServiceDispatchIntent,intentCode]]){
    const text=encode(value);assert.deepEqual(decode(text),value);
    for(const raw of [' '+text,text+'\n',text.replace('"grantId"','"\\u0067rantId"')])
      assert.throws(()=>decode(raw),known(code));
  }
});
after(()=>{
  assert.equal(rows.length,11);
  process.stdout.write('# CUSTODY_CANONICAL_REUSE_OBSERVATIONS '+stringify({phase,rows})+'\n');
});
