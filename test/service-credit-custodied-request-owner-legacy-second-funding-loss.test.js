import test from 'node:test';
import a from 'node:assert/strict';
import {createServiceCreditCustodiedRequestOwnerV3 as createOwner} from '../src/service-credit-custodied-request-owner.js';
function freeze(v) {
if(v && typeof v === 'object') {for(const x of Object.values(v)) freeze(x);Object.freeze(v);}
return v;
}
const R=freeze({"custodyVersion":1,"profile":"service-credit.execute.v1.empty-body","originalRequestJson":"{\"modelVersion\":1,\"grantId\":\"grant.owned.recovery.plan\",\"requestId\":\"request.multi.a\",\"method\":\"POST\",\"routeId\":\"service-credit.execute.v1\",\"canonicalBodyDigest\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",\"selectedContentType\":\"application/json\",\"maxCostUnits\":7}","originalBodyBase64":"","serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute","fundingResourceUrl":"https://owned-plan.example.test/funding","paymentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","network":"zenon:testnet","grantId":"grant.owned.recovery.plan","requestId":"request.multi.a","checksum":"sha256:c2f63238a0f23d3170b9610af992ba6c8072da7ab45392ce7378a8fc291e7a71"});
const POL=freeze({"policyVersion":1,"maxRequests":2,"serviceResourceUrl":"https://owned-plan.example.test/service-credit/v1/execute"});
const K=freeze({grantId:R.grantId,requestId:R.requestId});
const P='SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const C='loadReads recordReads retainCalls readbackConfirmations dispatchCalls callbackCompletions intentWrites intentReads intentReadbackConfirmations'.split(' ');
const S='load original retain intentRead intentWrite close send'.split(' ');
const v=(l,r)=>[l,r,0,0,0,0,0,0,0];
const caught=fn=>{ try{ fn();} catch (e) {return e;}};
const read=e=>e.o.readOriginal(K);
function err(e,code) {
a.equal(Object.getPrototypeOf(e),TypeError.prototype);a.equal(e.code,P+code);
a.equal(e.message,e.code);a.equal(e.stack,'TypeError: '+e.code);a.equal(Object.isFrozen(e),true);
}
const rejects=(p,code)=>a.rejects(p,e=>{ err(e,code);return true;});
function fund(revision=3) {
return freeze({revision,status:'BOUND',ambiguityLatched:false,resourceUrl:R.fundingResourceUrl,
challengeHeader:'declared-opaque-header',paymentHeader:'declared-opaque-payment',
paymentRequired:{},paymentPayload:{x402Version:2,resource:{},accepted:{},
payload:{transaction:{hash:R.paymentHash},intentDigest:'declared'}},
requirement:{scheme:'exact',network:R.network,asset:'declared',amount:'1',
payTo:'declared',maxTimeoutSeconds:30,extra:{}}});
}
function unit(m) {
const e={m}, c=Object.fromEntries(S.map(k=>[k,0]));
e.c=c;
const store={
load() {
a.equal(this,store);c.load++;
if(e.m==='busy' && c.load===1) {
err(caught(()=>e.o.readOriginal()),'BUSY');
err(caught(()=>e.o.readOriginal({...K,grantId:'foreign'})),'BUSY');
}
if(e.m==='initial-null' && c.load===1 || e.m==='second-null' && c.load===2) return null;
if(e.m==='second-throw' && c.load===2) throw Error('DECLARED_SECOND_LOAD_FAILURE');
return fund(e.m==='drift' && c.load===2 ? 4 : 3);
},
getOriginalRequest(k) {a.equal(this,store);a.deepEqual(k,K);c.original++;return e.m==='missing' ? null : R;},
retainOriginalRequest() {c.retain++;throw Error('RETAIN_FORBIDDEN');},
getOriginalDispatchIntent() {c.intentRead++;return null;},
fenceOriginalDispatchIntent() {c.intentWrite++;throw Error('INTENT_FORBIDDEN');},
close() {c.close++;throw Error('BORROWED_CLOSE_FORBIDDEN');},
};
e.o=createOwner({store,fundingResourceUrl:R.fundingResourceUrl,
custodyPolicy:POL,selectedGrantId:R.grantId});
return e;
}
function ck(e,l,r,h) {
const s=e.o.snapshot();
a.deepEqual(C.map(k=>s.counts[k]),v(l,r));
a.deepEqual([s.active,s.trackedRequests,s.recoveryAuthority,s.serviceOutcome,s.qualification],
[false,0,'NONE','NOT_ESTABLISHED','DECLARED_CALLBACK_LIFECYCLE_ONLY']);
a.deepEqual(s.uncertainty,{custody:h,submission:false,undrained:false,declaredFundingAmbiguitySeen:false});
a.deepEqual(S.map(k=>e.c[k]),[l,r,0,0,0,0,0]);
}
async function close(e,h) {
const o=e.o,p=o.close();a.equal(o.close(),p);
const r=await p.then(value=>({value}),failure=>({failure}));
a.equal(Object.hasOwn(r,'failure'),h);
if(h) err(r.failure,'CLOSE_FAILED');else a.equal(r.value,undefined);
a.equal(o.close(),p);a.equal(o.snapshot().closeOutcome,h?'UNKNOWN':'DRAINED');
a.equal(o.snapshot().closed,true);a.equal(e.c.close,0);
}
async function drain(e) {await e.o.close().then(()=>{},()=>{});a.equal(e.c.close,0);}
test('legacy original second funding loss latches custody and preserves borrowed ownership',async ()=>{
for(const m of ['second-null','second-throw']) {
const e=unit(m);
try{
const failure=caught(()=>read(e));
a.equal(failure?.code,P+'CUSTODY_OUTCOME_UNKNOWN',
'LEGACY_ORIGINAL_SECOND_FUNDING_LOSS_CUSTODY_HOLD');
err(failure,'CUSTODY_OUTCOME_UNKNOWN');ck(e,2,1,true);
e.m='steady';a.deepEqual(read(e),R);ck(e,4,2,true);
const send=()=>{ e.c.send++;return Promise.resolve();};
await rejects(e.o.submitOriginal(null,send),'CUSTODY_OUTCOME_UNKNOWN');
ck(e,4,2,true);await close(e,true);ck(e,4,2,true);
} finally {await drain(e);}
}
});
test('legacy original recovery preserves initial absence drift and admission precedence',async ()=>{
for(const m of ['initial-null','steady','missing','drift','busy']) {
const e=unit(m),o=e.o;
try{
err(caught(()=>o.readOriginal()),'INVALID_INPUT');
err(caught(()=>o.readOriginal(K,K)),'INVALID_INPUT');
err(caught(()=>o.readOriginal({...K,grantId:'foreign'})),'FOREIGN_GRANT');
await rejects(o.close(undefined),'INVALID_INPUT');
ck(e,0,0,false);a.equal(o.snapshot().closed,false);
if(m==='initial-null') {
err(caught(()=>read(e)),'FUNDING_REQUIRED');ck(e,1,0,false);
e.m='steady';a.deepEqual(read(e),R);ck(e,3,1,false);
} else if(m==='missing') {
a.equal(read(e),null);ck(e,1,1,false);
} else if(m==='drift') {
err(caught(()=>read(e)),'CUSTODY_OUTCOME_UNKNOWN');ck(e,2,1,true);
} else {a.deepEqual(read(e),R);ck(e,2,1,false);}
const b=o.snapshot().counts;
await close(e,m==='drift');
err(caught(()=>o.readOriginal()),'CLOSED');
err(caught(()=>o.readOriginal({...K,grantId:'foreign'})),'CLOSED');
a.deepEqual(o.snapshot().counts,b);
} finally {await drain(e);}
}
});
