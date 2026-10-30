import { types } from 'node:util';
import { captureOfficialFundingPostReservedObservation,captureOfficialFundingPostReservedObservationResult } from './official-funding-post-reserved-observation.js';
import { captureOfficialFundingPostCustodyContext,createOfficialFundingPostEnteredRecord,inspectOfficialFundingPostCustodyRecord,
 requireOfficialFundingPostCustodyContext,createOfficialFundingPostObservationRecord,createOfficialFundingPostOutcomeRecord,
 officialFundingPostCustodyRecordDigest,projectOfficialFundingPostCustodyRecord } from './official-funding-post-custody-record.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn,A=Reflect.apply,NP=Promise,PP=NP.prototype;
const THEN=D(PP,'then'),CTOR=D(PP,'constructor'),SPECIES=D(NP,Symbol.species);
function fail(){throw new TypeError('OFFICIAL_FUNDING_POST_OUTCOME_CUSTODY');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length)fail();
 const out={};for(const k of names){const d=D(v,k);if(!d?.enumerable||!O(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function same(a,b){return !!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(b).every(k=>O(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&same(D(PP,'then'),THEN)&&same(D(PP,'constructor'),CTOR)&&same(D(NP,Symbol.species),SPECIES);}
function discard(value){try{if(!invariant()||!types.isPromise(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==PP)return;
 const c=D(value,'constructor');if(c!==undefined&&(!O(c,'value')||c.value!==NP))return;
 const p=A(THEN.value,value,[()=>{},()=>{}]);A(THEN.value,p,[()=>{},()=>{}]);}catch{}}

/** Same selected durable port, before SDK entry/observation and before a
 * result escapes. Ports are trusted borrowed capabilities; no source checksum
 * authenticates SDK settlement, funding, a grant or a delivery. */
export function createOfficialFundingPostOutcomeCustody(options){
 if(arguments.length!==1||!invariant())fail();const c=fields(options,['context','port']),context=captureOfficialFundingPostCustodyContext(c.context),p=fields(c.port,['read','compareAndSwap']);
 for(const fn of Object.values(p))if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();
 let closed=false,held=false,busy=false,firstClaimed=false,raw=null,proposed=null,reads=0,writes=0,borrowerUnknown=false;
 let observerBound=false,observing=false,observerCalls=0,lastObservationClaimed=0,pendingObservation=null;
 const opaque=[];
 function hold(value){held=true;borrowerUnknown=true;if(value!==undefined){opaque.push(value);discard(value);}fail();}
 function live(){if(closed||held||busy||observing||!invariant())fail();}
 function after(){if(closed||held||!invariant()){held=true;fail();}}
 function operation(work){live();busy=true;try{return work();}finally{busy=false;}}
 function read(){let value;reads++;try{value=A(p.read,undefined,[]);}catch{hold();}
  if(value!==null&&typeof value!=='string')hold(value);after();
  if(value!==null){try{requireOfficialFundingPostCustodyContext(value,context);}catch{held=true;fail();}}return value;
 }
 function current(){const value=read();if(raw===null||value!==raw){held=true;fail();}return value;}
 function persist(expected,next){
  proposed=next;let value;writes++;
  try{value=A(p.compareAndSwap,undefined,[expected,next]);}catch{hold();}
  if(typeof value!=='string'||value!==next)hold(value);after();
  // The same row must be read back. Lost acknowledgement/readback never
  // permits another claim, SDK call, observation or result publication.
  const observed=read();if(observed!==next){held=true;fail();}raw=next;proposed=null;
 }
 const enter=F(function enter(originalHeader,intakeBound){
  if(arguments.length!==2)fail();return operation(()=>{
   if(firstClaimed)fail();const next=createOfficialFundingPostEnteredRecord(context,originalHeader,intakeBound);firstClaimed=true;
   if(read()!==null){held=true;fail();}persist(null,next);after();return undefined;
  });
 });
 const beginObservation=F(function beginObservation(){
  if(arguments.length!==0)fail();return operation(()=>{current();const next=createOfficialFundingPostObservationRecord(raw);persist(raw,next);after();return undefined;});
 });
 const record=F(function record(outcome){
  if(arguments.length!==1)fail();return operation(()=>{current();let next;
   try{next=createOfficialFundingPostOutcomeRecord(raw,outcome);}catch{held=true;if(types.isPromise(outcome)){opaque.push(outcome);discard(outcome);}fail();}
   persist(raw,next);after();return undefined;});
 });
 const assertCurrent=F(function assertCurrent(){if(arguments.length!==0)fail();return operation(()=>{current();return undefined;});});
 const exportRecordedState=F(function exportRecordedState(){
  if(arguments.length!==0)fail();return operation(()=>{current();const digest=officialFundingPostCustodyRecordDigest(raw);
   return F({...projectOfficialFundingPostCustodyRecord(raw,digest),independentPinRequired:true});});
 });
 /** Bind once before the first claim. The callback cannot enter until this
  * same owner has persisted/read back one original observation reservation.
  * Binding itself performs no read, write, callback or SDK operation.
  */
 const bindPendingObserver=F(function bindPendingObserver(callback){
  if(arguments.length!==1||typeof callback!=='function'||types.isProxy(callback)||!Object.isFrozen(callback))fail();
  live();if(firstClaimed||observerBound)fail();observerBound=true;
  return F(function reservedPendingObserver(payload,requirement,challenge){
   const ticket=promiseCapability();let reservation,claimEntered=false;
   try{
    if(arguments.length!==3)fail();operation(()=>{claimEntered=true;const selected=current();
     reservation=captureOfficialFundingPostReservedObservation(selected,payload,requirement,challenge);
     if(reservation.observation!==lastObservationClaimed+1)fail();
     lastObservationClaimed=reservation.observation;observing=true;
    });
   }catch{if(claimEntered)held=true;ticket.reject(new TypeError('OFFICIAL_FUNDING_POST_OBSERVATION_REJECTED'));return ticket.promise;}
   function failed(value){held=true;borrowerUnknown=true;observing=false;if(value!==undefined){opaque.push(value);discard(value);}ticket.reject(new TypeError('OFFICIAL_FUNDING_POST_OBSERVATION_HELD'));}
   function complete(value){
    pendingObservation=null;
    try{after();current();const result=captureOfficialFundingPostReservedObservationResult(value,reservation);after();observing=false;ticket.resolve(result);}
    catch{failed(value);}
   }
   let returned;
   try{
    after();observerCalls++;const value=A(callback,undefined,[payload,requirement,challenge]);returned=value;pendingObservation=types.isPromise(value)?value:null;after();
    if(types.isPromise(value)){
     if(types.isProxy(value)||Object.getPrototypeOf(value)!==PP||D(value,'then')!==undefined)fail();
     const constructor=D(value,'constructor');if(constructor!==undefined&&(!O(constructor,'value')||constructor.value!==NP||constructor.enumerable||constructor.writable||constructor.configurable))fail();
     A(THEN.value,value,[complete,()=>{pendingObservation=null;failed();}]);
    }else complete(value);
   }catch{failed(returned);}
   return ticket.promise;
  });
 });
 const close=F(function close(){if(arguments.length!==0)fail();closed=true;if(busy||observing)held=true;return undefined;});
 const snapshot=F(function snapshot(){if(arguments.length!==0)fail();let selected=null;try{if(raw!==null)selected=inspectOfficialFundingPostCustodyRecord(raw);}catch{held=true;}
  return F({officialFundingPostOutcomeCustodyVersion:1,closed,held,busy,firstClaimed,reads,writes,borrowerUnknown,opaqueReturns:opaque.length,
   phase:selected?.phase??(firstClaimed?'UNKNOWN':'NOT_STARTED'),observations:selected?.observations??0,maximumPendingReconciliations:context.maximumPendingReconciliations,
   proposedWriteRetained:proposed!==null,logicalBackendRetirementEligible:closed&&!busy&&!observing&&!held&&!borrowerUnknown,
   ...(observerBound?{reservedObserverBound:true,observerActive:observing,observerCalls,lastObservationClaimed,pendingObservationRetained:pendingObservation!==null}:{}),
   backend:'BORROWED_NOT_CLOSED',authority:'NONE',mayEnterSdk:false,mayStartFunding:false,mayResumeObservation:false,mayActivateGrant:false,mayDispatchService:false,physicalRelease:'NOT_ESTABLISHED'});
 });
 return F({enter,beginObservation,record,assertCurrent,exportRecordedState,bindPendingObserver,close,snapshot});
}

function promiseCapability(){let resolve,reject;const promise=new NP((yes,no)=>{resolve=yes;reject=no;});Object.defineProperty(promise,'constructor',{value:NP});A(THEN.value,promise,[()=>{},()=>{}]);return {promise,resolve,reject};}
