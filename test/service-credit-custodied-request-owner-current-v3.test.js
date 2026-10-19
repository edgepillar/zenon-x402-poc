import test from 'node:test';
import a from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const {equal: q,ok}=a;
const specs=[["../src/service-credit-custodied-request-owner.js",35073,938,"6e7493a4859d48530820e68a4a19a513aad014ffc1048b42965a3ad36ae7c5f7"],["../src/service-credit-original-request-custody-contract.js",14051,356,"fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"],["../package.json",1413,40,"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"]];
const pins=specs.map(([relative,bytes,LF,sha])=>{
const url=new URL(relative,import.meta.url);
const raw=readFileSync(url);
q(raw.length,bytes,'SOURCE_BYTES');
q(createHash('sha256').update(raw).digest('hex'),sha,'SOURCE_SHA256');
const text=raw.toString('utf8');
q(/[^\x00-\x7f]/.test(text),false);
q(text.includes('\0'),false);
q(text.split('\n').length - 1,LF);
ok(text.endsWith('\n'));
return Object.freeze({ url: url.href,text});
});
const pkg=JSON.parse(pins[2].text);
q(pkg.type,'module');
q(pkg.engines.node,'>=24');
q(process.versions.node,'24.19.0','EXACT_NODE_VERSION_REQUIRED');
q(process.argv.length,2,'ONE_FILE_PROCESS_REQUIRED');
const {createServiceCreditCustodiedRequestOwnerV3: createOwner}=await import(pins[0].url);
const {captureOriginalServiceRequestCustody: capture,
captureOriginalServiceDispatchIntent: captureIntent}=await import(pins[1].url);
function freeze(v){
if(v && typeof v==='object'){
for(const x of Object.values(v)) freeze(x);
Object.freeze(v);
}
return v;
}
const R=freeze({"custodyVersion":1,"profile":"service-credit.execute.v1.empty-body","originalRequestJson":"{\"modelVersion\":1,\"grantId\":\"grant.owned.recovery.plan\",\"requestId\":\"request.multi.a\",\"method\":\"POST\",\"routeId\":\"service-credit.execute.v1\",\"canonicalBodyDigest\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",\"selectedContentType\":\"application/json\",\"maxCostUnits\":7}","originalBodyBase64":"","serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute","fundingResourceUrl":"https://owned-plan.example.test/funding","paymentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","network":"zenon:testnet","grantId":"grant.owned.recovery.plan","requestId":"request.multi.a","checksum":"sha256:c2f63238a0f23d3170b9610af992ba6c8072da7ab45392ce7378a8fc291e7a71"});
const POLICY=freeze({"policyVersion":1,"maxRequests":2,"serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute"});
const K=freeze({ grantId: R.grantId,requestId: R.requestId});
const P='SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const C='loadReads recordReads retainCalls readbackConfirmations dispatchCalls callbackCompletions intentWrites intentReads intentReadbackConfirmations'.split(' ');
const B={ fundingResourceUrl: R.fundingResourceUrl,paymentHash: R.paymentHash,network: R.network};
const custody=r=>({
originalRequestJson: r.originalRequestJson,originalBodyBase64: r.originalBodyBase64,
serviceResourceUrl: r.serviceResourceUrl,
});
const input=r=>({ grantId: r.grantId,requestId: r.requestId,...custody(r)});
function intent(r=R){
return captureIntent(r,{ fundingRevision: 3,challengeDigest: 'sha256:'+'b'.repeat(64),
paymentDigest: 'sha256:'+'c'.repeat(64),custodyPolicy: POLICY});
}
function fund(status='BOUND',revision=3){
return freeze({ revision,status,ambiguityLatched: status==='OUTCOME_UNKNOWN',
resourceUrl: R.fundingResourceUrl,challengeHeader: 'declared-opaque-header',
paymentHeader: 'declared-opaque-payment',paymentRequired: {},
paymentPayload: {x402Version: 2,resource: {},accepted: {},
payload: {transaction: {hash: R.paymentHash},intentDigest: 'declared'}},
requirement: {scheme: 'exact',network: R.network,asset: 'declared',amount: '1',
payTo: 'declared',maxTimeoutSeconds: 30,extra: {}}});
}
function err(e,suffix){
a.equal(Object.getPrototypeOf(e),TypeError.prototype);
a.equal(e.code,P+suffix);a.equal(e.message,e.code);
a.equal(e.stack,'TypeError: '+e.code);a.equal(Object.isFrozen(e),true);
}
const throws=(fn,suffix)=>a.throws(fn,e=>{ err(e,suffix);return true;});
const rejects=(p,suffix)=>a.rejects(p,e=>{ err(e,suffix);return true;});
function ice(v){
if(v && typeof v==='object'){
a.equal(Object.isFrozen(v),true);
for(const x of Object.values(v)) ice(x);
}
}
function unit(catalog=false){
const f={ funding: fund(),original: null,intent: null,catalog: freeze([]),
trace: [],calls: {load: 0,get: 0,retain: 0,fence: 0,intent: 0,catalog: 0,send: 0,close: 0}};
function note(receiver,name,key){
a.equal(receiver,store);f.calls[name]++;f.trace.push(name);
if(key !== undefined) a.deepEqual(key,K);
}
const store={
load(){note(this,'load');return f.onLoad?f.onLoad(f.calls.load):f.funding;},
getOriginalRequest(key){note(this,'get',key);return f.original;},
retainOriginalRequest(value){
note(this,'retain');a.deepEqual(value,input(R));
f.original=capture(custody(value),B);return f.original;
},
fenceOriginalDispatchIntent(key){
note(this,'fence',key);f.intent=intent(f.original);return f.intent;
},
getOriginalDispatchIntent(key){note(this,'intent',key);return f.intent;},
close(){note(this,'close');throw Error('BORROWED_CLOSE_FORBIDDEN');},
};
if(catalog) store.listOriginalRequestKeys=function (){
note(this,'catalog');return f.onCatalog?f.onCatalog():f.catalog;
};
f.owner=createOwner({ store,fundingResourceUrl: R.fundingResourceUrl,
custodyPolicy: POLICY,selectedGrantId: R.grantId});
return f;
}
function counts(f,exp){
a.deepEqual(C.map(k=>f.owner.snapshot().counts[k]),exp);
a.equal(f.calls.close,0);
}
function inert(f){
a.deepEqual([f.calls.retain,f.calls.fence,f.calls.send],[0,0,0]);
a.equal(f.owner.snapshot().recoveryAuthority,'NONE');
a.equal(f.owner.snapshot().serviceOutcome,'NOT_ESTABLISHED');
}
async function close(f,held){
const u=f.owner.snapshot().uncertainty;
a.deepEqual([u.custody,u.submission,u.undrained],[held,false,false]);
const p=f.owner.close();a.equal(f.owner.close(),p);
const r=await p.then(value=>({ value}),failure=>({ failure}));
a.equal(Object.hasOwn(r,'failure'),held);
if(held) err(r.failure,'CLOSE_FAILED');else a.equal(r.value,undefined);
a.equal(f.owner.close(),p);a.equal(f.owner.snapshot().closed,true);
a.equal(f.owner.snapshot().closeOutcome,held?'UNKNOWN':'DRAINED');
a.equal(f.calls.close,0);
}
async function cleanup(f){await f.owner.close().then(()=>undefined,()=>undefined);}
function state(state,exp,status='BOUND'){
ice(state);a.deepEqual(state.original,R);a.deepEqual(state.dispatchIntent,exp);
a.equal(state.dispatchStatus,exp?'POSSIBLY_ATTEMPTED':'NO_INTENT_RECORDED');
a.equal(state.qualification,'UNQUALIFIED');a.equal(state.authority,'NONE');
a.equal(state.serviceOutcome,'NOT_ESTABLISHED');
a.equal(state.evidence,'LOCAL_STORE_DECLARED_RECOVERY_STATE');
a.deepEqual(state.funding,{ revision: 3,status,ambiguityLatched: status==='OUTCOME_UNKNOWN',
fundingResourceUrl: R.fundingResourceUrl,paymentHash: R.paymentHash,network: R.network});
a.equal(state.uncertainty.custody,false);
}
test('current V3 commits exact original-bound intent before callback and refuses replay',async ()=>{
const f=unit();let release,done;
const gate=new Promise(resolve=>{ release=resolve;});
try{
a.deepEqual(Object.keys(f.owner),['submitOriginal','readOriginal','readOriginalRecoveryState','readOriginalRecoveryKeys','snapshot','close']);
a.deepEqual(Reflect.ownKeys(f.owner),Object.keys(f.owner));
a.equal(Object.isFrozen(f.owner),true);
await rejects(f.owner.submitOriginal({ ...input(R),grantId: 'foreign'},()=>{ f.calls.send++;}),'FOREIGN_GRANT');
throws(()=>f.owner.readOriginalRecoveryState({ ...K,grantId: 'foreign'}),'FOREIGN_GRANT');
a.deepEqual(f.trace,[]);
const pending=f.owner.submitOriginal(input(R),original=>{
f.calls.send++;f.trace.push('callback');
a.deepEqual(original,R);ice(original);
a.deepEqual(f.original,R);a.deepEqual(f.intent,intent());
a.deepEqual(f.trace,['load','get','retain','get','load','fence','intent','load','callback']);
counts(f,[3,2,1,1,1,0,1,1,1]);
return gate;
});
done=pending.then(value=>({ value}),failure=>({ failure}));
a.equal(f.owner.snapshot().active,true);
a.equal(f.owner.snapshot().counts.callbackCompletions,0);
release();const result=await done;
a.equal(Object.hasOwn(result,'failure'),false);a.equal(result.value,undefined);
a.equal(f.owner.snapshot().phase,'CALLBACK_COMPLETED');
a.equal(f.owner.snapshot().serviceOutcome,'NOT_ESTABLISHED');
a.equal(f.owner.snapshot().recoveryAuthority,'NONE');
await rejects(f.owner.submitOriginal(input(R),()=>{ f.calls.send++;}),'RECOVERY_REQUIRED');
a.deepEqual([f.calls.retain,f.calls.fence,f.calls.intent,f.calls.send],[1,1,1,1]);
counts(f,[4,3,1,1,1,1,1,1,1]);
await close(f,false);
} finally {release();if(done) await done;await cleanup(f);}
});
test('current V3 recovery state preserves exact binding ambiguity and no authority',async ()=>{
const f=unit();f.original=R;f.intent=intent();
try{
state(f.owner.readOriginalRecoveryState(K),intent());
f.intent=null;state(f.owner.readOriginalRecoveryState(K),null);
f.funding=fund('OUTCOME_UNKNOWN');
const ambiguous=f.owner.readOriginalRecoveryState(K);state(ambiguous,null,'OUTCOME_UNKNOWN');
a.equal(ambiguous.funding.status,'OUTCOME_UNKNOWN');
a.equal(ambiguous.funding.ambiguityLatched,true);
a.equal(ambiguous.uncertainty.declaredFundingAmbiguitySeen,true);
f.funding=fund();
const current=f.owner.readOriginalRecoveryState(K);state(current,null);
a.equal(current.funding.status,'BOUND');a.equal(current.funding.ambiguityLatched,false);
a.deepEqual(current.uncertainty,{ custody: false,submission: false,undrained: false,
declaredFundingAmbiguitySeen: true});
const changed=capture({ ...custody(R),
originalRequestJson: JSON.stringify({ ...JSON.parse(R.originalRequestJson),maxCostUnits: 8})},B);
f.intent=intent(changed);a.notDeepEqual(f.intent,intent());
throws(()=>f.owner.readOriginalRecoveryState(K),'CUSTODY_OUTCOME_UNKNOWN');
counts(f,[9,5,0,0,0,0,0,5,0]);inert(f);
a.equal(f.owner.snapshot().uncertainty.custody,true);
await rejects(f.owner.submitOriginal(null,()=>{ f.calls.send++;}),'CUSTODY_OUTCOME_UNKNOWN');
counts(f,[9,5,0,0,0,0,0,5,0]);inert(f);await close(f,true);
} finally {await cleanup(f);}
});
test('current V3 validates the full catalog before filtering and preserves funding fences',async ()=>{
const foreign=freeze({ grantId: 'aaa',requestId: 'foreign'});
const good=freeze([foreign,K]);
const f=unit(true);f.catalog=good;
try{
const data=f.owner.readOriginalRecoveryKeys();ice(data);
a.deepEqual(data.keys,[K]);a.equal(data.grantId,K.grantId);
a.equal(data.evidence,'LOCAL_STORE_DECLARED_RECOVERY_KEYS');
a.deepEqual([data.qualification,data.authority,data.serviceOutcome],['UNQUALIFIED','NONE','NOT_ESTABLISHED']);
a.deepEqual([data.mayStartPayment,data.maySignPayment,data.mayDispatchService,data.deliveryConfirmed],[false,false,false,false]);
a.equal(foreign.grantId,'aaa');a.deepEqual(f.catalog,good);
counts(f,[2,1,0,0,0,0,0,0,0]);inert(f);await close(f,false);
} finally {await cleanup(f);}
for(const bad of [
freeze([freeze({ grantId: 'aaa',requestId: 'bad key'}),K]),
freeze([K,foreign]),freeze([K,K]),[K],
freeze([foreign,K,freeze({ grantId: 'zzz',requestId: 'extra'})]),
]){
const f=unit(true);f.catalog=bad;
try{
throws(()=>f.owner.readOriginalRecoveryKeys(),'CUSTODY_OUTCOME_UNKNOWN');
counts(f,[1,1,0,0,0,0,0,0,0]);inert(f);await close(f,true);
} finally {await cleanup(f);}
}
for(const mode of ['initial-null','second-null','drift','close','unavailable']){
const f=unit(mode !== 'unavailable');
try{
if(mode==='unavailable'){
throws(()=>f.owner.readOriginalRecoveryKeys(),'RECOVERY_KEYS_UNAVAILABLE');
counts(f,[0,0,0,0,0,0,0,0,0]);await close(f,false);
} else if(mode==='initial-null'){
f.funding=null;
throws(()=>f.owner.readOriginalRecoveryKeys(),'FUNDING_REQUIRED');
counts(f,[1,0,0,0,0,0,0,0,0]);a.equal(f.owner.snapshot().uncertainty.custody,false);
f.funding=fund();a.deepEqual(f.owner.readOriginalRecoveryKeys().keys,[]);
counts(f,[3,1,0,0,0,0,0,0,0]);await close(f,false);
} else {
if(mode==='second-null') f.onLoad=n=>n===2?null:f.funding;
if(mode==='drift') f.onLoad=n=>n===2?fund('BOUND',4):f.funding;
if(mode==='close') f.onCatalog=()=>{
f.closeResult=f.owner.close().then(value=>({ value}),failure=>({ failure}));
return f.catalog;
};
throws(()=>f.owner.readOriginalRecoveryKeys(),mode==='close'?'CLOSED':'CUSTODY_OUTCOME_UNKNOWN');
counts(f,[2,1,0,0,0,0,0,0,0]);
if(f.closeResult) a.deepEqual(await f.closeResult,{ value: undefined});
await close(f,mode !== 'close');
}
inert(f);
} finally {await cleanup(f);}
}
});
