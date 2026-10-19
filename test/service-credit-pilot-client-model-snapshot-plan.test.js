import test from 'node:test';
import {strictEqual as eq,deepStrictEqual as same,throws} from 'node:assert/strict';
import {
createServiceCreditPilotClientModelSnapshotPlan as make
} from '../src/service-credit-pilot-client-plan.js';
// Synthetic declarations only; no model/backend/payment/custody fixture.
const I=JSON.stringify({
viewVersion:1,paymentHash:'a'.repeat(64),requestId:'request.1'
});
const R=Object.freeze({
modelVersion:1,grantId:'grant.1',requestId:'request.1',
requestDigest:'sha256:'+'b'.repeat(64),offerId:'offer.1',offerVersion:1,
method:'POST',routeId:'lookup.v1',
canonicalBodyDigest:'sha256:'+'c'.repeat(64),
selectedContentType:'application/json',maxCostUnits:8
});
const RJ=JSON.stringify(R);
const C=Object.freeze({
statusCode:200,contentType:'application/json',resultCode:'result.ok'
});
function dto(state='RESERVED',patch={}){
return JSON.stringify({
...R,costUnits:3,state,cachedResult:state==='SUCCEEDED'?C:null,...patch
});
}
function instance(state='RESERVED',funding='INCLUDED'){
return make(I,RJ,funding,dto(state));
}
function flags(s){
eq(Object.isFrozen(s),true);
eq(Object.isFrozen(s.view),true);
eq(s.evidence,'DECLARED_MODEL_SNAPSHOT_ONLY');
eq(s.qualification,'UNQUALIFIED');
same([s.authorization,s.authority,s.view.authorization],['NONE','NONE','NONE']);
same([
s.backendAuthenticated,s.originalRequestCustodyConfirmed,s.recoveryQualified,
s.mayStartPayment,s.maySignPayment,s.mayDispatchService,s.deliveryConfirmed
],[false,false,false,false,false,false,false]);
same([
s.view.mayStartPayment,s.view.maySignPayment,
s.view.mayDispatchService,s.view.deliveryConfirmed
],[false,false,false,false]);
eq(s.originalIdentityJson,I);
eq(s.originalRequestIdentityJson,RJ);
}
function rejected(p,text,funding='UNKNOWN'){
const before=p.getSnapshot();
const preserved=JSON.stringify(before);
throws(()=>p.observeRequest(funding,text));
eq(p.getSnapshot(),before);
eq(JSON.stringify(before),preserved);
const after=p.observeRequest('INCLUDED',before.requestSnapshotJson);
eq(after.fundingUncertain,before.fundingUncertain);
eq(after.serviceUncertain,before.serviceUncertain);
eq(after.requestState,before.requestState);
eq(after.requestSnapshotJson,before.requestSnapshotJson);
flags(after);
}
test('five declared request states project without granting authority',()=>{
const cases=[
['RESERVED','IDLE','SERVICE_IDLE'],
['EXECUTING','EXECUTING','SERVICE_BUSY'],
['OUTCOME_UNKNOWN','OUTCOME_UNKNOWN','RECOVERY_REQUIRED'],
['SUCCEEDED','SUCCEEDED','RESULT_REPORTED'],
['FAILED_RELEASED','UNAVAILABLE','SERVICE_UNAVAILABLE']
];
for(const [state,service,phase] of cases){
const p=instance(state);
eq(Object.isFrozen(p),true);
const s=p.getSnapshot();
eq(s.requestState,state);
eq(s.requestSnapshotJson,dto(state));
eq(JSON.parse(s.observationJson).serviceStatus,service);
eq(s.view.phase,phase);
eq(s.closed,false);
flags(s);
if(state==='FAILED_RELEASED'){
eq(s.terminal,null);
eq(s.nextStep,'REVIEW_AVAILABILITY');
}
}
for(const statusCode of [100,599]){
const text=dto('SUCCEEDED',{cachedResult:{...C,statusCode}});
const p=make(I,RJ,'INCLUDED',text);
eq(p.getSnapshot().requestSnapshotJson,text);
flags(p.getSnapshot());
}
});
test('all identity fields remain bound and foreign success cannot replace cache',()=>{
const changes={
modelVersion:2,grantId:'grant.foreign',requestId:'request.foreign',
requestDigest:'sha256:'+'d'.repeat(64),offerId:'offer.other',offerVersion:2,
method:'GET',routeId:'lookup.other',
canonicalBodyDigest:'sha256:'+'e'.repeat(64),
selectedContentType:'text/plain',maxCostUnits:9
};
const p=instance();
for(const [key,value] of Object.entries(changes)){
rejected(p,dto('EXECUTING',{[key]:value}));
}
const succeeded=instance('SUCCEEDED');
for(const key of ['grantId','canonicalBodyDigest']){
rejected(succeeded,dto('SUCCEEDED',{[key]:changes[key]}));
}
const otherOriginal=JSON.stringify({
viewVersion:1,paymentHash:'a'.repeat(64),requestId:'request.foreign'
});
throws(()=>make(otherOriginal,RJ,'INCLUDED',dto()));
throws(()=>make(
I,JSON.stringify({...R,grantId:'grant.foreign'}),'INCLUDED',dto()
));
});
test('malformed canonical records, invalid caches and changing cost are refused atomically',()=>{
const p=instance();
const reversed=Object.fromEntries(Object.entries(JSON.parse(dto())).reverse());
const missing=JSON.parse(dto());
delete missing.requestDigest;
const badTexts=[
'{','null','[]',' '+dto(),' '.repeat(4097),
JSON.stringify(reversed),JSON.stringify(missing),
dto('RESERVED',{extra:true}),
dto('RESERVED',{costUnits:0}),
dto('RESERVED',{costUnits:1.5}),
dto('RESERVED',{costUnits:9}),
dto('RESERVED',{costUnits:'3'}),
dto('RESERVED',{costUnits:4}),
dto('RESERVED',{state:'CLOSED'}),
dto('RESERVED',{cachedResult:C}),
dto('SUCCEEDED',{cachedResult:null})
];
for(const text of badTexts)rejected(p,text);
const badCaches=[
{...C,statusCode:99},
{...C,statusCode:600},
{...C,statusCode:200.5},
{...C,contentType:'text/plain'},
{...C,resultCode:'bad result'},
{...C,extra:true},
{resultCode:'result.ok',contentType:'application/json',statusCode:200}
];
for(const cachedResult of badCaches){
rejected(p,dto('SUCCEEDED',{cachedResult}));
}
rejected(p,dto(),'READY');
for(const patch of [{method:'POST\n'},{grantId:'grant://bad'}]){
throws(()=>make(
I,JSON.stringify({...R,...patch}),'INCLUDED',dto('RESERVED',patch)
));
}
throws(()=>make(I,' '+RJ,'INCLUDED',dto()));
throws(()=>make(
JSON.stringify({viewVersion:1,paymentHash:null,requestId:'request.1'}),
RJ,'NOT_STARTED',dto()
));
});
test('declared success cannot clear funding or service uncertainty',()=>{
const p=instance('OUTCOME_UNKNOWN','UNKNOWN');
const before=p.getSnapshot();
eq(before.fundingUncertain,true);
eq(before.serviceUncertain,true);
const text=dto('SUCCEEDED');
const after=p.observeRequest('INCLUDED',text);
eq(after.requestState,'SUCCEEDED');
eq(after.requestSnapshotJson,text);
eq(after.terminal,'SUCCEEDED');
eq(after.view.phase,'RESULT_REPORTED');
eq(after.fundingUncertain,true);
eq(after.serviceUncertain,true);
eq(after.nextStep,'RECONCILE_FUNDING_AND_REQUEST');
flags(before);
flags(after);
});
test('observed states advance monotonically and terminal caches cannot change',()=>{
const p=instance();
p.observeRequest('INCLUDED',dto('EXECUTING'));
rejected(p,dto('RESERVED'));
p.observeRequest('INCLUDED',dto('OUTCOME_UNKNOWN'));
rejected(p,dto('RESERVED'));
rejected(p,dto('EXECUTING'));
p.observeRequest('INCLUDED',dto('SUCCEEDED'));
rejected(p,dto('FAILED_RELEASED'));
rejected(p,dto('EXECUTING'));
rejected(p,dto('SUCCEEDED',{cachedResult:{...C,statusCode:201}}));
rejected(p,dto('SUCCEEDED',{cachedResult:{...C,resultCode:'result.other'}}));
const repeated=p.observeRequest('INCLUDED',dto('SUCCEEDED'));
eq(repeated.serviceUncertain,true);
flags(repeated);
const skipped=instance();
eq(skipped.observeRequest('INCLUDED',dto('SUCCEEDED')).requestState,'SUCCEEDED');
const released=instance();
const unavailable=released.observeRequest('INCLUDED',dto('FAILED_RELEASED'));
eq(JSON.parse(unavailable.observationJson).serviceStatus,'UNAVAILABLE');
eq(unavailable.closed,false);
rejected(released,dto('SUCCEEDED'));
rejected(released,dto('RESERVED'));
});
test('strict primitive arities and local close preserve accepted evidence',()=>{
const args=[I,RJ,'INCLUDED',dto()];
throws(()=>make(...args.slice(0,3)));
throws(()=>make(...args,'extra'));
for(let i=0;i<args.length;i+=1){
const boxed=args.slice();
boxed[i]=new String(args[i]);
throws(()=>make(...boxed));
const oversized=args.slice();
oversized[i]='x'.repeat(4097);
throws(()=>make(...oversized));
}
const p=instance('OUTCOME_UNKNOWN','UNKNOWN');
p.observeRequest('INCLUDED',dto('SUCCEEDED'));
const before=p.getSnapshot();
eq(make.length,4);
eq(p.observeRequest.length,2);
eq(p.getSnapshot.length,0);
eq(p.close.length,0);
const invalidCalls=[
()=>p.observeRequest('INCLUDED'),
()=>p.observeRequest('INCLUDED',dto('SUCCEEDED'),'extra'),
()=>p.observeRequest({},dto('SUCCEEDED')),
()=>p.observeRequest('INCLUDED',{}),
()=>p.getSnapshot(undefined),
()=>p.close(undefined)
];
for(const call of invalidCalls){
throws(call);
eq(p.getSnapshot(),before);
}
const closed=p.close();
same(closed,{...before,closed:true,nextStep:'LOCALLY_CLOSED'});
eq(p.getSnapshot(),closed);
eq(p.close(),closed);
flags(closed);
throws(()=>p.observeRequest('INCLUDED',before.requestSnapshotJson),/CLIENT_PLAN_CLOSED/);
eq(p.getSnapshot(),closed);
eq(closed.fundingUncertain,true);
eq(closed.serviceUncertain,true);
eq(closed.requestSnapshotJson,before.requestSnapshotJson);
});
