import test from 'node:test';
import { strictEqual as eq, deepStrictEqual as same } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
InMemoryServiceCreditModel as ServiceCreditModel,
SERVICE_CREDIT_ACTIVATION_VERSION,
SERVICE_CREDIT_MODEL_VERSION,
} from '../src/service-credit-model.js';
// MOCK only. These seeds provide no live funding or authority evidence.
const O=Object,K=Reflect.ownKeys;
const NOW=2_000_000_000_000;
const digest=fill=>'sha256:'+fill.repeat(64);
const KEYS=[
'modelVersion','grantId','requestId','method','routeId',
'canonicalBodyDigest','selectedContentType','maxCostUnits',
];
const copy=value=>JSON.parse(JSON.stringify(value));
function offer(){
return {
modelVersion:SERVICE_CREDIT_MODEL_VERSION,
providerId:'provider.alpha',serviceId:'service.lookup',
resourceId:'resource.lookup',resourceBinding:digest('e'),
offerId:'offer.standard',offerVersion:1,costPolicyId:'policy.fixed',
fundingPolicyId:'funding.fixed',fundingPolicyVersion:1,
};
}
function activation(){
return {
activationVersion:SERVICE_CREDIT_ACTIVATION_VERSION,
authorityProfileId:'authority.mock.reference',
authorityProfileVersion:1,verifierVersion:1,authorityRecordDigest:digest('d'),
fundingPolicyId:'funding.fixed',fundingPolicyVersion:1,
sourceSettlementId:'settlement.public.1',
transactionId:'mocktx:'+createHash('sha256').update('transaction.public.1').digest('hex'),
providerId:'provider.alpha',serviceId:'service.lookup',
resourceId:'resource.lookup',resourceBinding:digest('e'),
offerId:'offer.standard',offerVersion:1,
holderId:'holder.public.1',capabilityCommitment:digest('a'),
totalUnits:8,expiresAt:NOW+10_000,
scheme:'exact',paymentFlow:'upfront',network:'zenon:mock',
chainProfile:{
version:1,chainIdentifier:Number.MAX_SAFE_INTEGER.toString(),
genesisMomentumHash:'0'.repeat(64),
},
asset:'zts1mockasset',amount:'1',payee:'payee.mock.1',payer:'holder.public.1',
paymentResourceDigest:digest('4'),paymentRequirementDigest:digest('2'),
paymentIntentDigest:digest('1'),grantFundingCommitment:digest('3'),
evidenceState:'MOMENTUM_INCLUDED',
confirmationPolicy:{
policyId:'mock.momentum-included',policyVersion:1,minimumConfirmations:1,
},
};
}
function freezeSeed(v){
eq(O.getPrototypeOf(v),O.prototype);
for(const x of O.values(v)){
if(x!==null&&typeof x==='object') freezeSeed(x);
}
return O.freeze(v);
}
function canonical(v){
if(v===null||typeof v!=='object') return JSON.stringify(v);
if(Array.isArray(v)) return '['+v.map(canonical).join(',')+']';
return '{'+O.keys(v).sort().map(
key=>JSON.stringify(key)+':'+canonical(v[key]),
).join(',')+'}';
}
function save(v,data=true){
const keys=K(v);
const children=[];
const entries=keys.map(key=>{
const d=O.getOwnPropertyDescriptor(v,key);
if(data) eq(O.hasOwn(d,'value'),true);
if(O.hasOwn(d,'value')){
const child=d.value;
if(child!==null&&(typeof child==='object'||typeof child==='function')){
children.push(save(child,data));
}
}
return [key,d];
});
return {
v,keys,entries,children,proto:O.getPrototypeOf(v),
open:O.isExtensible(v),frozen:O.isFrozen(v),
};
}
function verify(s){
eq(O.getPrototypeOf(s.v),s.proto);
eq(O.isExtensible(s.v),s.open);
eq(O.isFrozen(s.v),s.frozen);
same(K(s.v),s.keys);
for(const [key,before] of s.entries){
const d=O.getOwnPropertyDescriptor(s.v,key);
same(K(d),K(before));
for(const field of K(before)) eq(d[field],before[field]);
}
for(const child of s.children) verify(child);
}
function hash(q){
const fields={
modelVersion:q.modelVersion,grantId:q.grantId,
offerId:'offer.standard',offerVersion:1,
method:q.method,routeId:q.routeId,
canonicalBodyDigest:q.canonicalBodyDigest,
selectedContentType:q.selectedContentType,
maxCostUnits:q.maxCostUnits,costUnits:3,
};
return 'sha256:'+createHash('sha256').update(canonical(fields)).digest('hex');
}
function envelope(initial,request,a,h,n){
const state=copy(initial);
O.assign(state.grants[0],{
lifecycle:'ACTIVE',totalUnits:8,availableUnits:a,heldUnits:h,consumedUnits:n,
});
state.requests=request===null?[]:[copy(request)];
return state;
}
function exercise(){
// ce/cr/cf and pe/pr/pf: callback entries/returns/errors.
// ra/ro/rx, ba/bo/bx, ca/co/cx: reserve, BEGIN, complete attempts/returns/errors.
const c={
ce:0,cr:0,cf:0,pe:0,pr:0,pf:0,
ra:0,ro:0,rx:0,ba:0,bo:0,bx:0,ca:0,co:0,cx:0,
};
let armed=false;
const inputs=[];
const copies=[];
function keep(v){
copies.push([v,copy(v)]);
return v;
}
function own(v,json=true,data=true){
eq(O.getPrototypeOf(v),O.prototype);
eq(O.isFrozen(v),true);
eq(O.isExtensible(v),false);
inputs.push(save(v,data));
if(json) keep(v);
return v;
}
function operations(){
return [c.ra,c.ro,c.rx,c.ba,c.bo,c.bx,c.ca,c.co,c.cx];
}
function check(want=O.freeze({...c}),mode=false){
same(c,want);
eq(armed,mode);
same([c.cf,c.pf,c.rx,c.bx,c.cx],[0,0,0,0,0]);
eq(c.ce,c.cr);
eq(c.pe,c.pr);
for(const [v,b] of copies) same(v,b);
for(const input of inputs) verify(input);
same(c,want);
eq(armed,mode);
}
const spec=own(freezeSeed(offer()));
const seed=own(freezeSeed(activation()));
const cache=own(O.freeze({
statusCode:200,contentType:'application/json',resultCode:'result.ok',
}));
const clockFault=O.freeze(new Error('mock armed clock'));
const priceFault=O.freeze(new Error('mock armed pricing'));
eq(clockFault===priceFault,false);
for(const fault of [clockFault,priceFault]){
eq(fault instanceof Error,true);
eq(O.getPrototypeOf(fault),Error.prototype);
eq(O.isFrozen(fault),true);
eq(O.isExtensible(fault),false);
inputs.push(save(fault,false));
}
check();
const options={
now(){
c.ce+=1;
if(armed){
c.cf+=1;
throw clockFault;
}
c.cr+=1;
return NOW;
},
deriveCost(){
c.pe+=1;
if(armed){
c.pf+=1;
throw priceFault;
}
c.pr+=1;
return 3;
},
};
O.freeze(options.now);
O.freeze(options.deriveCost);
O.freeze(options);
own(options,false);
check();
const model=new ServiceCreditModel(options);
check();
model.registerOffer(spec);
check();
const active=model.activateGrantFromTrustedRecord(seed);
const start=O.freeze({...c});
check(start);
eq(start.ce>0,true);
same([start.pe,start.pr],[0,0]);
same(operations(),[0,0,0,0,0,0,0,0,0]);
const q=own(O.freeze({
modelVersion:SERVICE_CREDIT_MODEL_VERSION,
grantId:active.grantId,requestId:'request.1',method:'POST',
routeId:'lookup.v1',canonicalBodyDigest:digest('b'),
selectedContentType:'application/json',
maxCostUnits:Number.MAX_SAFE_INTEGER,
}));
const ref=own(O.freeze({grantId:q.grantId,requestId:q.requestId}));
const good=own(O.freeze({
grantId:q.grantId,requestId:q.requestId,cachedResult:cache,
}));
same(K(q),KEYS);
same(K(ref),['grantId','requestId']);
same(K(good),['grantId','requestId','cachedResult']);
same(K(cache),['statusCode','contentType','resultCode']);
eq(q.modelVersion,1);
eq(typeof q.grantId,'string');
function readState(want,expected,mode=false){
check(want,mode);
const state=copy(model.exportState());
check(want,mode);
if(expected!==undefined) same(state,expected);
return state;
}
const initial=keep(readState(start));
same([
initial.schemaVersion,initial.modelVersion,
initial.offers.length,initial.grants.length,initial.requests.length,
],[2,1,1,1,0]);
eq(initial.grants[0].grantId,q.grantId);
const initialWant=keep(envelope(initial,null,8,0,0));
same(initial,initialWant);
const held=O.freeze({
...q,requestDigest:hash(q),
offerId:'offer.standard',offerVersion:1,
costUnits:3,state:'RESERVED',cachedResult:null,
});
const executing=O.freeze({...held,state:'EXECUTING'});
const done=O.freeze({...held,state:'SUCCEEDED',cachedResult:cache});
const heldState=keep(envelope(initial,held,5,3,0));
const execState=keep(envelope(initial,executing,5,3,0));
const doneState=keep(envelope(initial,done,5,0,3));
function reserve(){
c.ra+=1;
let result;
let error;
try {
result=model.reserveRequest(q);
c.ro+=1;
}catch(caught){
c.rx+=1;
error=caught;
}
return O.freeze({result,error});
}
function begin(){
c.ba+=1;
let result;
let error;
try {
result=model.beginExecution(ref);
c.bo+=1;
}catch(caught){
c.bx+=1;
error=caught;
}
return O.freeze({result,error});
}
function complete(){
c.ca+=1;
let result;
let error;
try {
result=model.completeExecution(good);
c.co+=1;
}catch(caught){
c.cx+=1;
error=caught;
}
return O.freeze({result,error});
}
function expectReserve(out,replayed,request){
eq(out.error,undefined);
same(K(out.result),['replayed','executionAuthorized','request']);
same(out.result,{replayed,executionAuthorized:false,request});
eq(K(out.result.request).length,14);
}
check(start);
const reservation=reserve();
const reservedCounts=O.freeze({...c});
check(reservedCounts);
eq(reservedCounts.ce>start.ce,true);
same([reservedCounts.pe,reservedCounts.pr],[1,1]);
same(operations(),[1,1,0,0,0,0,0,0,0]);
keep(readState(reservedCounts,heldState));
expectReserve(reservation,false,held);
check(reservedCounts);
const begun=begin();
const executingCounts=O.freeze({...c});
check(executingCounts);
eq(executingCounts.ce>reservedCounts.ce,true);
same([executingCounts.pe,executingCounts.pr],[1,1]);
same(operations(),[1,1,0,1,1,0,0,0,0]);
keep(readState(executingCounts,execState));
eq(begun.error,undefined);
same(K(begun.result),['executionAuthorized','request']);
same(begun.result,{executionAuthorized:true,request:executing});
eq(K(begun.result.request).length,14);
check(executingCounts);
const success=complete();
const completeCounts=O.freeze({...executingCounts,ca:1,co:1});
check(completeCounts);
same(operations(),[1,1,0,1,1,0,1,1,0]);
const afterSuccess=keep(readState(completeCounts,doneState));
eq(success.error,undefined);
same(K(success.result),['transitioned','request']);
same(success.result,{transitioned:true,request:done});
eq(K(success.result.request).length,14);
const baseline=O.freeze({...c});
same(baseline,completeCounts);
check(baseline);
armed=true;
check(baseline,true);
const beforeReplay=keep(readState(baseline,doneState,true));
same(beforeReplay,afterSuccess);
check(baseline,true);
const replay=reserve();
const replayCounts=O.freeze({...baseline,ra:2,ro:2});
const afterReplay=readState(replayCounts,doneState,true);
same(afterReplay,beforeReplay);
same(afterReplay,afterSuccess);
expectReserve(replay,true,done);
same(operations(),[2,2,0,1,1,0,1,1,0]);
check(replayCounts,true);
}
test('succeeded original reserve replay bypasses armed callbacks without authorizing execution',
{ timeout: 5000 }, exercise);
