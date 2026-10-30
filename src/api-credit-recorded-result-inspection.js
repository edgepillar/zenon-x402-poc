import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { snapshotOriginalServiceRequestCustodyKey, validateOriginalServiceRequestCustody } from './service-credit-original-request-custody-contract.js';
import { captureApiCreditRecordedServiceResult } from './api-credit-recorded-service-result.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,OWN=Object.hasOwn;
const OUTPUT=['recordedResultInspectionVersion','grantId','requestId','status','backendStatus','resultAvailable','cachedResult','responseJson','source',
 'originalCheckpointPinsMatched','localReconciliationRequired','authority','mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed',
 'serviceDelivery','currentAuthority','sameProcessObservationOnly','snapshotAtomicAcrossStores'];
const REQUEST=['modelVersion','grantId','requestId','method','routeId','canonicalBodyDigest','selectedContentType','maxCostUnits'];
function fail(){throw new TypeError('API_CREDIT_RECORDED_RESULT_INSPECTION');}
function record(v){if(v===null||typeof v!=='object'||types.isProxy(v)||!Object.isFrozen(v)||Object.getPrototypeOf(v)!==Object.prototype)fail();return v;}
function data(v,key){record(v);const d=D(v,key);if(!d?.enumerable||!OWN(d,'value'))fail();return d.value;}
function exact(v,names){record(v);if(Reflect.ownKeys(v).length!==names.length)fail();const out={};for(const k of names)out[k]=data(v,k);return out;}
function status(v){if(typeof v!=='string'||!/^[A-Z_]{1,64}$/.test(v))fail();return v;}
function cache(v){const c=exact(v,['statusCode','contentType','resultCode']);if(c.statusCode!==200||c.contentType!=='application/json')fail();
 const key=snapshotOriginalServiceRequestCustodyKey({grantId:'cached',requestId:c.resultCode});return F({...c,resultCode:key.requestId});}
function noAuthority(v){
 for(const key of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])if(data(v,key)!==false)fail();
 if(data(v,'authority')!=='NONE'||data(v,'serviceDelivery')!=='NOT_ESTABLISHED')fail();
}
function localResponse(local,key,cached){
 const response=data(local,'responseObservation');if(response===null)return null;
 const original=data(local,'original'),funding=data(local,'funding');
 if(data(local,'responseStatus')!=='LOCAL_DECLARED_SUCCESS_RESPONSE_OBSERVED'||data(response,'responseObservationVersion')!==1
  ||data(response,'scope')!=='LOCAL_DECLARED_HTTP_SUCCESS_RESPONSE'||data(response,'status')!=='DECLARED_SUCCESS_RESPONSE_OBSERVED')fail();
 noAuthority(response);
 for(const name of ['grantId','requestId'])if(data(response,name)!==key[name])fail();
 for(const name of ['paymentHash','fundingResourceUrl','network'])if(data(response,name)!==data(original,name)||data(response,name)!==data(funding,name))fail();
 if(data(response,'fundingRevision')!==data(funding,'revision')||data(response,'resultCode')!==cached.resultCode)fail();
 const text=data(response,'responseJson');
 captureApiCreditRecordedServiceResult(F({apiCreditServiceResultVersion:1,...key,responseJson:text,resultCode:cached.resultCode,replayed:true,
  source:'LOCAL_RECORDED_RESPONSE',newDispatchRequested:false,authority:'NONE',serviceDelivery:'NOT_ESTABLISHED'}));
 return text;
}
/** Product-only projection of the SAME no-dispatch, proof/checkpoint-bound V6
 * query. A backend cache never clears client uncertainty or grants authority.
 * Only an already-observed local response is returned as exact response JSON. */
export function captureApiCreditRecordedResultInspection(observed,manifest){
 if(arguments.length!==2)fail();record(manifest);const key=snapshotOriginalServiceRequestCustodyKey(data(manifest,'requestKey'));
 noAuthority(observed);const current=status(data(observed,'status')),local=data(observed,'local'),backend=data(observed,'backend');
 let cached=null,responseJson=null,backendStatus=null;
 if(local!==null){
  const original=validateOriginalServiceRequestCustody(data(local,'original'));
  if(original.grantId!==key.grantId||original.requestId!==key.requestId||original.fundingResourceUrl!==data(manifest,'fundingResourceUrl'))fail();
 }
 if(backend!==null){
  backendStatus=status(data(backend,'status'));
  for(const name of ['executionAuthorized','paymentAuthorized','signingAuthorized'])if(data(backend,name)!==false)fail();
  if(data(backend,'deliveryStatus')!=='NOT_ESTABLISHED')fail();
  if(backendStatus==='CACHED_SUCCESS'){
   if(local===null||!['CACHED_SUCCESS','CLIENT_RECONCILIATION_REQUIRED'].includes(current))fail();
   const original=data(local,'original'),request=data(backend,'originalRequest'),execution=data(backend,'execution');
   const expected=JSON.parse(data(original,'originalRequestJson'));
   const executedRequest=data(execution,'request');
   // A cached ledger result and a terminal execution must identify the same
   // original request before this product projection releases a result.
   for(const name of REQUEST)if(data(request,name)!==expected[name]||data(executedRequest,name)!==expected[name])fail();
   for(const name of ['requestDigest','costUnits'])if(data(executedRequest,name)!==data(request,name))fail();
   if(data(request,'state')!=='SUCCEEDED'||data(execution,'terminalClassification')!=='SUCCEEDED')fail();
   cached=cache(data(backend,'cachedResult'));const requestCache=cache(data(request,'cachedResult'));
   if(JSON.stringify(cached)!==JSON.stringify(requestCache))fail();
   responseJson=localResponse(local,key,cached);
  }else if(data(backend,'cachedResult')!==null)fail();
 }
 return captureApiCreditRecordedResultInspectionOutput(F({recordedResultInspectionVersion:1,...key,status:current,backendStatus,
  resultAvailable:cached!==null,cachedResult:cached,responseJson,source:cached===null?'NONE':responseJson===null?'BACKEND_CACHE':'LOCAL_RESPONSE_AND_BACKEND_CACHE',
  originalCheckpointPinsMatched:true,localReconciliationRequired:current==='CLIENT_RECONCILIATION_REQUIRED',authority:'NONE',mayStartPayment:false,maySignPayment:false,mayDispatchService:false,
  deliveryConfirmed:false,serviceDelivery:'NOT_ESTABLISHED',currentAuthority:'NOT_ESTABLISHED',sameProcessObservationOnly:true,snapshotAtomicAcrossStores:false}));
}
/** Closed bounded product output. Legacy redacted inspection rejects this shape. */
export function captureApiCreditRecordedResultInspectionOutput(value){
 if(arguments.length!==1)fail();const c=exact(value,OUTPUT),key=snapshotOriginalServiceRequestCustodyKey({grantId:c.grantId,requestId:c.requestId});
 status(c.status);if(c.backendStatus!==null)status(c.backendStatus);noAuthority(value);
 if(c.recordedResultInspectionVersion!==1||c.originalCheckpointPinsMatched!==true||c.currentAuthority!=='NOT_ESTABLISHED'||c.sameProcessObservationOnly!==true
  ||c.snapshotAtomicAcrossStores!==false||c.localReconciliationRequired!==(c.status==='CLIENT_RECONCILIATION_REQUIRED')||typeof c.resultAvailable!=='boolean')fail();
 if(c.resultAvailable){
  if(c.backendStatus!=='CACHED_SUCCESS'||!['CACHED_SUCCESS','CLIENT_RECONCILIATION_REQUIRED'].includes(c.status))fail();
  c.cachedResult=cache(c.cachedResult);
  if(c.responseJson!==null){
   captureApiCreditRecordedServiceResult(F({apiCreditServiceResultVersion:1,...key,responseJson:c.responseJson,resultCode:c.cachedResult.resultCode,replayed:true,
    source:'LOCAL_RECORDED_RESPONSE',newDispatchRequested:false,authority:'NONE',serviceDelivery:'NOT_ESTABLISHED'}));
   if(c.source!=='LOCAL_RESPONSE_AND_BACKEND_CACHE')fail();
  }else if(c.source!=='BACKEND_CACHE')fail();
 }else if(c.cachedResult!==null||c.responseJson!==null||c.source!=='NONE'||c.backendStatus==='CACHED_SUCCESS')fail();
 const out=F({...c,...key});if(Buffer.byteLength(JSON.stringify(out))>4096)fail();return out;
}
