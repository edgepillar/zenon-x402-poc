import { getServiceCreditPilotStatusView as viewOf } from './service-credit-pilot-status-view.js';
const BAD='INVALID_CLIENT_PLAN_INPUT';
/**
 * Declared diagnostics under the DTO's bounds and native-intrinsic premises.
 * No dispatch, durability or restart assurance; original bytes/context stay external.
 * Recreating an owner grants no reset or recovery authority.
 */
export function createServiceCreditPilotClientPlan(originalIdentityJson,initialObservationJson) {
 if(arguments.length!==2) throw new Error(BAD);
 let state;
 function accept(o) {
  const view=viewOf(originalIdentityJson,o);
  if(view.paymentHash===null||view.requestId===null) throw new Error(BAD);
  const {fundingStatus:f,serviceStatus:s}=JSON.parse(o);
  if(state&&state.terminal!==null&&state.terminal!==s) throw new Error('CLIENT_PLAN_REGRESSION');
  const F=state?.fundingUncertain===true||f==='UNKNOWN';
  const U=state?.serviceUncertain===true||s==='OUTCOME_UNKNOWN';
  const nextStep=F&&U?'RECONCILE_FUNDING_AND_REQUEST':F?'RECONCILE_FUNDING'
   :U?'RECONCILE_REQUEST':f==='PENDING'?'OBSERVE_FUNDING'
   :f==='FAILED'?'REVIEW_FUNDING':s==='CLOSED'?'DECLARED_CLOSED'
   :f==='NOT_STARTED'?'REVIEW_FUNDING':s==='EXECUTING'?'OBSERVE_REQUEST'
   :s==='SUCCEEDED'?'READ_ORIGINAL_RESULT_ONLY'
   :s==='UNAVAILABLE'?'REVIEW_AVAILABILITY':'REVIEW_IDENTITY_ADMISSION';
  state=Object.freeze({
   originalIdentityJson,observationJson:o,paymentHash:view.paymentHash,requestId:view.requestId,
   view,fundingUncertain:F,serviceUncertain:U,
   terminal:state?.terminal??(s==='SUCCEEDED'||s==='CLOSED'?s:null),closed:false,nextStep,
   qualification:'UNQUALIFIED',authorization:'NONE',mayStartPayment:false,
   maySignPayment:false,mayDispatchService:false,deliveryConfirmed:false
  });
  return state;
 }
 accept(initialObservationJson);
 return Object.freeze({
  observe(o) {
   if(arguments.length!==1) throw new Error(BAD);
   if(state.closed) throw new Error('CLIENT_PLAN_CLOSED');
   return accept(o);
  },
  getSnapshot() {
   if(arguments.length) throw new Error(BAD);
   return state;
  },
  close() {
   if(arguments.length) throw new Error(BAD);
   if(!state.closed) state=Object.freeze({...state,closed:true,nextStep:'LOCALLY_CLOSED'});
   return state;
  }
 });
}

// Strict full-string declared-DTO subset, preserving :// exclusion; not model equivalence.
// Coherent fields authenticate no hashes, bytes, funding, custody or effects.
// Pristine native intrinsics are premises; bounds are not process/resource guarantees.
export function createServiceCreditPilotClientModelSnapshotPlan(
originalIdentityJson,originalRequestIdentityJson,fundingStatus,initialRequestSnapshotJson
){
function bad(){throw new Error('INVALID_MODEL_SNAPSHOT_PLAN_INPUT');}
function regression(){throw new Error('MODEL_SNAPSHOT_PLAN_REGRESSION');}
if(arguments.length!==4)bad();
const identityKeys=[
'modelVersion','grantId','requestId','requestDigest','offerId','offerVersion',
'method','routeId','canonicalBodyDigest','selectedContentType','maxCostUnits'
];
const snapshotKeys=[...identityKeys,'costUnits','state','cachedResult'];
const cacheKeys=['statusCode','contentType','resultCode'];
const services=Object.freeze({
RESERVED:'IDLE',EXECUTING:'EXECUTING',OUTCOME_UNKNOWN:'OUTCOME_UNKNOWN',
SUCCEEDED:'SUCCEEDED',FAILED_RELEASED:'UNAVAILABLE'
});
const identifier=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}(?![\s\S])/;
const method=/^[A-Z][A-Z0-9_-]{0,15}(?![\s\S])/;
const contentType=/^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}(?![\s\S])/;
const commitment=/^sha256:[0-9a-f]{64}(?![\s\S])/;
function bounded(text){
if(typeof text!=='string'||text.length>4096)bad();
}
function shape(value,keys){
return value!==null&&typeof value==='object'&&
Object.getPrototypeOf(value)===Object.prototype&&
JSON.stringify(Object.keys(value))===JSON.stringify(keys);
}
function parse(text,keys){
bounded(text);
let value;
try{value=JSON.parse(text);}catch{bad();}
if(!shape(value,keys)||JSON.stringify(value)!==text)bad();
return value;
}
function matches(value,expression){
return typeof value==='string'&&expression.test(value);
}
function id(value){return matches(value,identifier)&&!value.includes('://');}
function positive(value){return Number.isSafeInteger(value)&&value>0;}
function validateIdentity(value){
if(value.modelVersion!==1||
!id(value.grantId)||!id(value.requestId)||
!matches(value.requestDigest,commitment)||!id(value.offerId)||
!positive(value.offerVersion)||!matches(value.method,method)||
!id(value.routeId)||!matches(value.canonicalBodyDigest,commitment)||
!matches(value.selectedContentType,contentType)||!positive(value.maxCostUnits))bad();
}
const original=parse(originalIdentityJson,['viewVersion','paymentHash','requestId']);
const expected=parse(originalRequestIdentityJson,identityKeys);
validateIdentity(expected);
if(original.requestId!==expected.requestId)bad();
let legacy=null;
let last=null;
let state;
function snapshotOf(base,requestSnapshotJson,requestState){
return Object.freeze({
...base,originalRequestIdentityJson,requestSnapshotJson,requestState,
evidence:'DECLARED_MODEL_SNAPSHOT_ONLY',
backendAuthenticated:false,originalRequestCustodyConfirmed:false,
recoveryQualified:false,qualification:'UNQUALIFIED',
authorization:'NONE',authority:'NONE',
mayStartPayment:false,maySignPayment:false,
mayDispatchService:false,deliveryConfirmed:false
});
}
function accept(funding,text){
bounded(funding);
const request=parse(text,snapshotKeys);
for(const key of identityKeys){
if(request[key]!==expected[key])bad();
}
if(!positive(request.costUnits)||request.costUnits>request.maxCostUnits||
typeof request.state!=='string'||!Object.hasOwn(services,request.state))bad();
let cacheJson=null;
if(request.state==='SUCCEEDED'){
const cache=request.cachedResult;
if(!shape(cache,cacheKeys)||!Number.isSafeInteger(cache.statusCode)||
cache.statusCode<100||cache.statusCode>599||
!matches(cache.contentType,contentType)||
cache.contentType!==expected.selectedContentType||!id(cache.resultCode))bad();
cacheJson=JSON.stringify(cache);
}else if(request.cachedResult!==null){bad();}
if(last!==null){
if(request.costUnits!==last.costUnits)regression();
if((last.state==='SUCCEEDED'||last.state==='FAILED_RELEASED')&&
request.state!==last.state)regression();
if((last.state==='EXECUTING'||last.state==='OUTCOME_UNKNOWN')&&
request.state==='RESERVED')regression();
if(last.state==='OUTCOME_UNKNOWN'&&request.state==='EXECUTING')regression();
if(last.state==='SUCCEEDED'&&cacheJson!==last.cacheJson)regression();
}
const nextRecord=Object.freeze({
state:request.state,costUnits:request.costUnits,cacheJson
});
const observationJson=JSON.stringify({
...original,fundingStatus:funding,serviceStatus:services[request.state]
});
const nextLegacy=legacy||
createServiceCreditPilotClientPlan(originalIdentityJson,observationJson);
const base=legacy?nextLegacy.observe(observationJson):nextLegacy.getSnapshot();
const next=snapshotOf(base,text,request.state);
legacy=nextLegacy;
last=nextRecord;
state=next;
return state;
}
accept(fundingStatus,initialRequestSnapshotJson);
return Object.freeze({
observeRequest(funding,requestSnapshotJson){
if(arguments.length!==2)bad();
if(state.closed)throw new Error('CLIENT_PLAN_CLOSED');
return accept(funding,requestSnapshotJson);
},
getSnapshot(){
if(arguments.length!==0)bad();
return state;
},
close(){
if(arguments.length!==0)bad();
if(!state.closed){
state=snapshotOf(legacy.close(),state.requestSnapshotJson,state.requestState);
}
return state;
}
});
}
