import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { captureServiceCreditHttpExecuteOriginalInput } from './service-credit-http-execute-dispatch.js';
import { snapshotOriginalServiceRequestCustodyKey } from './service-credit-original-request-custody-contract.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,OWN=Object.hasOwn,APPLY=Reflect.apply;
const NP=Promise,PP=NP.prototype,THEN=PP.then,CTOR=D(PP,'constructor'),SPECIES=D(NP,Symbol.species);
const OPS=['prepareOriginalFunding','commitOriginalFunding','submitOriginalFunding','handoffToService','submitOriginal'];
const INPUT=['grantId','requestId','originalRequestJson','originalBodyBase64','serviceResourceUrl','authorizationHeader'];
const RESULT=['apiCreditServiceResultVersion','grantId','requestId','responseJson','resultCode','replayed','source','newDispatchRequested','authority','serviceDelivery'];
const ERROR_CODES=new WeakMap();
function error(code){const e=new TypeError('API_CREDIT_SERVICE_RESULT_'+code);Object.defineProperty(e,'code',{value:code});Object.defineProperty(e,'stack',{value:e.message});ERROR_CODES.set(e,code);return F(e);}
function fail(code='UNKNOWN'){throw error(code);}
function record(value){
 if(value===null||typeof value!=='object'||types.isProxy(value)||!Object.isFrozen(value)
  ||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();return value;
}
function own(value,key){record(value);const d=D(value,key);if(!d?.enumerable||!OWN(d,'value'))fail();return d.value;}
function fields(value,names,frozen=false){
 if(value===null||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype
  ||Reflect.ownKeys(value).length!==names.length||frozen&&!Object.isFrozen(value))fail('INPUT');
 const out={};for(const key of names){const d=D(value,key);if(!d?.enumerable||!OWN(d,'value'))fail('INPUT');out[key]=d.value;}return out;
}
function method(value,key){const fn=own(value,key);if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail('INPUT');return fn;}
function same(a,b){return !!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(b).every(k=>OWN(a,k)&&a[k]===b[k]);}
function invariant(){return PP.then===THEN&&D(Object.prototype,'then')===undefined&&same(D(PP,'constructor'),CTOR)&&same(D(NP,Symbol.species),SPECIES);}
function safePromise(value){
 if(!invariant()||!types.isPromise(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==PP)return false;
 const d=D(value,'constructor');return (!d||OWN(d,'value')&&d.value===NP)&&Reflect.ownKeys(value).every(k=>k==='constructor');
}
function discard(value){
 if(types.isPromise(value)&&!types.isProxy(value)&&Object.getPrototypeOf(value)===PP&&invariant()){
  const d=D(value,'constructor');if(!d||OWN(d,'value')&&d.value===NP){try{APPLY(THEN,value,[()=>{},()=>{}]);}catch{}}
 }
}
function observe(value,yes,no){if(!safePromise(value)){discard(value);fail();}const bridge=APPLY(THEN,value,[yes,no]);discard(bridge);}
function capability(){let resolve,reject;const promise=new NP((yes,no)=>{resolve=yes;reject=no;});Object.defineProperty(promise,'constructor',{value:NP});discard(promise);return{promise,resolve,reject};}
function responseCode(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>512)fail();
 const parsed=fields(JSON.parse(text),['ok','resultCode']);
 const code=snapshotOriginalServiceRequestCustodyKey({grantId:'result',requestId:parsed.resultCode}).requestId;
 if(parsed.ok!==true||JSON.stringify({ok:true,resultCode:code})!==text)fail();return code;
}
/** A bounded local observation, never provider authentication or authority. */
export function captureApiCreditRecordedServiceResult(value){
 if(arguments.length!==1)fail('INPUT');const c=fields(value,RESULT,true),key=snapshotOriginalServiceRequestCustodyKey({grantId:c.grantId,requestId:c.requestId});
 if(c.apiCreditServiceResultVersion!==1||c.resultCode!==responseCode(c.responseJson)||typeof c.replayed!=='boolean'
  ||c.newDispatchRequested!==!c.replayed||c.source!=='LOCAL_RECORDED_RESPONSE'||c.authority!=='NONE'||c.serviceDelivery!=='NOT_ESTABLISHED')fail();
 return F({...c,grantId:key.grantId,requestId:key.requestId});
}
/** The fixed native product supplies its SAME current V6 reader. DATA controls
 * declare that read/store boundary. No new store, proof, retry or journal. */
export function createApiCreditRecordedServiceResultApplication(configuration){
 if(arguments.length!==1||!invariant())fail('INPUT');
 const c=fields(configuration,['application','readState','fundingResourceUrl','serviceResourceUrl','network']);
 const app=c.application,methods=fields(app,[...OPS,'inspect','close'],true);
 for(const key of [...OPS,'inspect','close'])method(app,key);
 if(typeof c.readState!=='function'||types.isProxy(c.readState)||!Object.isFrozen(c.readState)
  ||typeof c.network!=='string'||c.network.length<1||c.network.length>128
  ||typeof c.fundingResourceUrl!=='string'||typeof c.serviceResourceUrl!=='string')fail('INPUT');
 const READ=c.readState,FUNDING=c.fundingResourceUrl,SERVICE=c.serviceResourceUrl,NETWORK=c.network;
 let active=false,held=false,closed=false,closing=null,baseCloseTerminal=false,baseCloseClean=false;
 let submissionCallbacksEntered=0,recordedResults=0,replaysReturned=0;
 function available(){if(!invariant()||held||closed||active)fail('UNAVAILABLE');}
 function liveService(){
  const view=APPLY(methods.inspect,app,[]);discard(view);
  if(own(view,'lifecycle')!=='OPEN'||own(view,'held')!==false||own(view,'publicOperationActive')!==false
   ||own(view,'closeRequested')!==false||own(view,'phase')!=='SERVICE')fail('UNAVAILABLE');
 }
 function candidate(input){
  const selected=fields(input,INPUT),key=snapshotOriginalServiceRequestCustodyKey({grantId:selected.grantId,requestId:selected.requestId});
  if(selected.originalBodyBase64!==''||selected.serviceResourceUrl!==SERVICE)fail('INPUT');
  const captured=captureServiceCreditHttpExecuteOriginalInput({resourceUrl:selected.serviceResourceUrl,
   originalRequestJson:selected.originalRequestJson,authorizationHeader:selected.authorizationHeader});
  if(captured.grantId!==key.grantId||captured.requestId!==key.requestId)fail('INPUT');
  return{selected:F(selected),expected:F({grantId:key.grantId,requestId:key.requestId,
   originalRequestJson:selected.originalRequestJson,originalBodyBase64:'',serviceResourceUrl:SERVICE})};
 }
 function lookup(expected){
  let view;try{view=APPLY(READ,undefined,[F({grantId:expected.grantId,requestId:expected.requestId})]);discard(view);}catch{fail();}
  if(view===null)return null;
  const original=own(view,'original'),funding=own(view,'funding'),uncertainty=own(view,'uncertainty');
  for(const key of ['grantId','requestId','originalRequestJson','originalBodyBase64','serviceResourceUrl']){
   if(own(original,key)!==expected[key])fail('ORIGINAL_CONFLICT');
  }
  if(own(view,'authority')!=='NONE'||own(view,'evidence')!=='LOCAL_STORE_DECLARED_RECOVERY_STATE'
   ||own(view,'qualification')!=='UNQUALIFIED'||own(view,'serviceOutcome')!=='NOT_ESTABLISHED')fail();
  for(const key of ['custody','submission','undrained','declaredFundingAmbiguitySeen'])if(own(uncertainty,key)!==false)fail();
  if(own(funding,'status')!=='BOUND'||own(funding,'fundingResourceUrl')!==FUNDING||own(funding,'network')!==NETWORK
   ||own(original,'fundingResourceUrl')!==FUNDING||own(original,'network')!==NETWORK
   ||own(original,'paymentHash')!==own(funding,'paymentHash'))fail();
  const response=own(view,'responseObservation'),intent=own(view,'dispatchIntent');
  if(response===null||intent===null)fail('RECONCILIATION_REQUIRED');
  if(own(view,'dispatchStatus')!=='POSSIBLY_ATTEMPTED'||own(view,'responseStatus')!=='LOCAL_DECLARED_SUCCESS_RESPONSE_OBSERVED'
   ||own(response,'responseObservationVersion')!==1||own(response,'scope')!=='LOCAL_DECLARED_HTTP_SUCCESS_RESPONSE'||own(response,'status')!=='DECLARED_SUCCESS_RESPONSE_OBSERVED'
   ||own(response,'authority')!=='NONE'||own(response,'deliveryConfirmed')!==false||own(response,'serviceDelivery')!=='NOT_ESTABLISHED')fail();
  for(const key of ['mayStartPayment','maySignPayment','mayDispatchService'])if(own(response,key)!==false)fail();
  for(const key of ['grantId','requestId'])if(own(response,key)!==expected[key]||own(intent,key)!==expected[key])fail();
  for(const key of ['paymentHash','network','fundingResourceUrl'])if(own(response,key)!==own(funding,key)||own(intent,key)!==own(funding,key))fail();
  if(own(response,'fundingRevision')!==own(funding,'revision')||own(intent,'fundingRevision')!==own(funding,'revision'))fail();
  const text=own(response,'responseJson');if(own(response,'resultCode')!==responseCode(text))fail();return text;
 }
 function finishClose(){
  if(closing===null||!baseCloseTerminal||active)return;
  if(held||!baseCloseClean)closing.reject(error('CLOSE_UNKNOWN'));else closing.resolve(undefined);
 }
 function finish(out,value,caught){
  active=false;
  if(caught!==null){const conflict=ERROR_CODES.get(caught)==='ORIGINAL_CONFLICT';if(!conflict)held=true;out.reject(error(conflict?'ORIGINAL_CONFLICT':'UNKNOWN'));}
  else if(closed||held){held=true;out.reject(error('UNKNOWN'));}
  else{recordedResults++;if(value.replayed)replaysReturned++;out.resolve(value);}
  finishClose();
 }
 function result(expected,text,replayed){return captureApiCreditRecordedServiceResult(F({apiCreditServiceResultVersion:1,
  grantId:expected.grantId,requestId:expected.requestId,responseJson:text,resultCode:responseCode(text),replayed,
  source:'LOCAL_RECORDED_RESPONSE',newDispatchRequested:!replayed,authority:'NONE',serviceDelivery:'NOT_ESTABLISHED'}));}
 const submitOriginal=F(function submitOriginal(input){
  if(arguments.length!==1)return NP.reject(error('INPUT'));let selected,expected;
  try{available();({selected,expected}=candidate(input));liveService();}catch{return NP.reject(error('INPUT_OR_UNAVAILABLE'));}
  active=true;const out=capability();
  try{
   const prior=lookup(expected);if(closed||held)fail();
   if(prior!==null){liveService();finish(out,result(expected,prior,true),null);}
   else{
    submissionCallbacksEntered++;const operation=APPLY(methods.submitOriginal,app,[selected]);
    observe(operation,value=>{
     try{
      if(value!==undefined||closed||held||!invariant())fail();liveService();
      const observed=lookup(expected);if(observed===null||closed||held)fail();liveService();
      finish(out,result(expected,observed,false),null);
     }catch(caught){finish(out,null,caught);}
    },()=>finish(out,null,error('UNKNOWN')));
   }
  }catch(caught){finish(out,null,caught);}finally{selected=null;}
  return out.promise;
 });
 const out={};for(const key of OPS)out[key]=key==='submitOriginal'?submitOriginal:F(function operation(input){
  if(arguments.length!==1)return NP.reject(error('INPUT'));
  try{available();return APPLY(methods[key],app,[input]);}catch{return NP.reject(error('UNAVAILABLE'));}
 });
 out.inspect=F(function inspect(){
  if(arguments.length!==0||!invariant())fail('INPUT');const view=APPLY(methods.inspect,app,[]);record(view);const copy={};
  for(const key of Reflect.ownKeys(view)){if(typeof key!=='string'||key==='recordedServiceResults')fail();Object.defineProperty(copy,key,{value:own(view,key),enumerable:true,configurable:true});}
  if(held){Object.defineProperty(copy,'held',{value:true,enumerable:true});Object.defineProperty(copy,'lifecycle',{value:'HELD',enumerable:true});}
  Object.defineProperty(copy,'recordedServiceResults',{value:F({version:1,active,held,closed,submissionCallbacksEntered,recordedResults,replaysReturned,
   authority:'NONE',nativeAcceptance:'NOT_ESTABLISHED'}),enumerable:true});return F(copy);
 });
 out.close=F(function close(){
  if(arguments.length!==0)return NP.reject(error('INPUT'));if(closing!==null)return closing.promise;
  closing=capability();closed=true;
  try{observe(APPLY(methods.close,app,[]),value=>{baseCloseTerminal=true;baseCloseClean=value===undefined;if(!baseCloseClean)held=true;finishClose();},()=>{baseCloseTerminal=true;held=true;finishClose();});}
  catch{baseCloseTerminal=true;held=true;finishClose();}finishClose();return closing.promise;
 });return F(out);
}
