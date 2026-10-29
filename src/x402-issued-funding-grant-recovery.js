import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { captureOfficialFundingPostCustodyContext,requireOfficialFundingPostCustodyContext,
 projectOfficialFundingPostCustodyRecord } from './official-funding-post-custody-record.js';
import { captureOfficialFundingPostHttpsRoute,captureOfficialFundingPostHttpsRequest } from './x402-official-funding-post-https-request-binding.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn,A=Reflect.apply,K=Reflect.ownKeys,NP=Promise,PP=NP.prototype;
const THEN=D(PP,'then'),CTOR=D(PP,'constructor'),SPECIES=D(NP,Symbol.species),HELD=new Set();
function fail(){throw new TypeError('ISSUED_FUNDING_GRANT_RECOVERY');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||K(v).length!==names.length)fail();
 const out={};for(const k of names){const d=D(v,k);if(!d?.enumerable||!O(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function pin(v){if(typeof v!=='string'||/^sha256:[0-9a-f]{64}$/.exec(v)?.[0]!==v)fail();return v;}
function snapshot(v,depth=0,budget={nodes:8192,bytes:131072}){
 if(--budget.nodes<0||depth>24)fail();if(v===null||typeof v==='boolean')return v;
 if(typeof v==='string'){budget.bytes-=Buffer.byteLength(v);if(budget.bytes<0||Buffer.from(v).toString('utf8')!==v)fail();return v;}
 if(typeof v==='number'){if(!Number.isSafeInteger(v)||Object.is(v,-0))fail();return v;}
 if(typeof v!=='object'||types.isProxy(v))fail();const keys=K(v),array=Array.isArray(v),proto=Object.getPrototypeOf(v);
 if(array){if(proto!==Array.prototype)fail();const count=D(v,'length')?.value;if(!Number.isSafeInteger(count)||count>4096||keys.length!==count+1)fail();
  const out=[];for(let i=0;i<count;i++){const d=D(v,String(i));if(!d?.enumerable||!O(d,'value'))fail();out.push(snapshot(d.value,depth+1,budget));}return F(out);}
 if((proto!==Object.prototype&&proto!==null)||keys.length>128)fail();const out={};
 for(const k of keys){if(typeof k!=='string'||['then','toJSON','__proto__','constructor','prototype'].includes(k))fail();const d=D(v,k);if(!d?.enumerable||!O(d,'value'))fail();
  budget.bytes-=Buffer.byteLength(k);if(budget.bytes<0)fail();Object.defineProperty(out,k,{value:snapshot(d.value,depth+1,budget),enumerable:true});}return F(out);
}
function encodeRow(value){const row=fields(snapshot(value),['issue','binding','status']),raw=canonicalJson(row);if(Buffer.byteLength(raw)>131072)fail();return {row,raw};}
/** Pin candidate only. A separately selected digest is required on restore. */
export function issuedFundingGrantBoundRowDigest(value){
 if(arguments.length!==1)fail();return 'sha256:'+createHash('sha256').update('zenon-x402:issued-provider-bound-row:v1\0','ascii').update(encodeRow(value).raw).digest('hex');
}
export function captureIssuedFundingGrantRecoveryExpectation(value){
 if(arguments.length!==1)fail();const r=fields(value,['boundRowDigest','outcomeRecordDigest']);pin(r.boundRowDigest);pin(r.outcomeRecordDigest);return F(r);
}
/** Exact historical startup row, independent of an official result. */
export function captureIssuedFundingGrantRecoveryRows(rows,selection,resourceUrl,expectation){
 if(arguments.length!==4)fail();const expected=captureIssuedFundingGrantRecoveryExpectation(expectation);
 if(rows===null||typeof rows!=='object'||types.isProxy(rows)||Object.getPrototypeOf(rows)!==Array.prototype||K(rows).length!==2
     ||D(rows,'length')?.value!==1||!D(rows,'0')?.enumerable||!O(D(rows,'0'),'value'))fail();
 const candidate=D(rows,'0').value;
 if(issuedFundingGrantBoundRowDigest(candidate)!==expected.boundRowDigest)fail();
 const {row,raw}=encodeRow(candidate);
 if(row.status!=='BOUND'||row.binding===null||row.issue===null||canonicalJson(row.issue.selection)!==canonicalJson(selection)
     ||row.issue.resourceUrl!==resourceUrl)fail();
 return F({row,rowJson:raw});
}
function same(a,b){return !!a&&!!b&&K(a).length===K(b).length&&K(b).every(k=>O(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&D(Object.prototype,'toJSON')===undefined&&same(D(PP,'then'),THEN)&&same(D(PP,'constructor'),CTOR)&&same(D(NP,Symbol.species),SPECIES);}
function discard(value){try{if(!invariant()||!types.isPromise(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==PP||D(value,'then')!==undefined)return;
 const c=D(value,'constructor');if(c!==undefined&&(!O(c,'value')||c.value!==NP))return;const p=A(THEN.value,value,[()=>{},()=>{}]);A(THEN.value,p,[()=>{},()=>{}]);}catch{}}
function receipt(value,reject=false){const p=new NP((yes,no)=>{(reject?no:yes)(value);});A(THEN.value,p,[()=>{},()=>{}]);return p;}

/** Historical backend for the existing provider controller. It captures only
 * read capabilities, never intake issuance/binding, SDK or continuation methods.
 * Store validation/authentication and physical lifetime remain the host's.
 * Reopening is not atomic external owner fencing or native release evidence. */
export function restoreIssuedFundingGrantRecordedBackend(options){
 if(arguments.length!==1||!invariant()||HELD.size>=64)fail();
 const c=fields(options,['expectation','serviceSelection','resourceUrl','maximumPendingReconciliations','port']);
 const expected=captureIssuedFundingGrantRecoveryExpectation(c.expectation),port=fields(c.port,['loadBound','readOfficialOutcome']);
 for(const fn of Object.values(port))if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();
 const route=captureOfficialFundingPostHttpsRoute(c.resourceUrl),opaque=[];let closed=false,held=false,busy=false,reads=0,raw=null,selected=null,record=null,outcome=null,header=null,attempted=[];
 const retained=F(()=>[port,opaque,raw,selected,record,outcome,header,attempted]);
 function hold(value){held=true;HELD.add(retained);if(value!==undefined){opaque.push(value);discard(value);}fail();}
 function live(){if(closed||held||busy||!invariant())fail();}
 function read(fn){let v;reads++;try{v=A(fn,undefined,[]);attempted.push(v);}catch{hold();}if(types.isPromise(v)){hold(v);}if(closed||held||!invariant())hold();return v;}
 function current(){live();busy=true;attempted=[];try{
  const first=read(port.loadBound);if(first===null||typeof first!=='object'||types.isProxy(first))hold(first);
  const chosen=captureIssuedFundingGrantRecoveryRows(first,c.serviceSelection,c.resourceUrl,expected);
  const value=read(port.readOfficialOutcome);if(typeof value!=='string')hold(value);
  projectOfficialFundingPostCustodyRecord(value,expected.outcomeRecordDigest); // Digest before record parsing.
  const context=captureOfficialFundingPostCustodyContext({issuedFrame:chosen.row.issue.frame,resourceUrl:c.resourceUrl,
    serviceSelection:c.serviceSelection,maximumPendingReconciliations:c.maximumPendingReconciliations});
  const parsed=requireOfficialFundingPostCustodyContext(value,context),b=chosen.row.binding;
  if(parsed.transactionHash!==b.transactionHash||parsed.boundJson!==canonicalJson({status:'BOUND',transactionHash:b.transactionHash,
      observerRecordKey:b.observerRecordKey,observerFileName:b.observerFileName})
      ||canonicalJson(JSON.parse(Buffer.from(parsed.originalHeader,'base64').toString('utf8')))!==canonicalJson(b.publication?.paymentPayload))hold();
  const last=captureIssuedFundingGrantRecoveryRows(read(port.loadBound),c.serviceSelection,c.resourceUrl,expected);
  if(last.rowJson!==chosen.rowJson||raw!==null&&value!==raw)hold();
  raw=value;selected=chosen;record=parsed;header=parsed.originalHeader;
  if(parsed.outcomeJson===null||parsed.phase==='FIRST_IN_FLIGHT'||parsed.phase==='OBSERVATION_IN_FLIGHT')outcome=null;
  else {const result=JSON.parse(parsed.outcomeJson),bound=Object.create(null);for(const [k,v]of Object.entries(result.intake))Object.defineProperty(bound,k,{value:v,enumerable:true});
    outcome=F({...snapshot(result),intake:F(bound)});}
  attempted=[];return undefined;
 }catch{hold();}finally{busy=false;}}
 current();
 const getIssuedChallenge=F(function getIssuedChallenge(){if(arguments.length!==0)fail();current();return selected.row.issue.frame;});
 const getRecordedOutcome=F(function getRecordedOutcome(){if(arguments.length!==0)fail();current();return outcome;});
 const processHttpRequest=F(function processHttpRequest(request){
  if(arguments.length!==1)return receipt(new TypeError('RECOVERY_INPUT'),true);
  try{live();const captured=captureOfficialFundingPostHttpsRequest(request,route);if(captured.paymentSignature!==header)fail();current();
    if(outcome===null)return receipt(new TypeError('RECORDED_OFFICIAL_OUTCOME_UNKNOWN'),true);return receipt(outcome);
  }catch{return receipt(new TypeError('RECOVERY_UNAVAILABLE'),true);}
 });
 const resumeOriginalSettlement=F(function resumeOriginalSettlement(){return receipt(new TypeError('RECOVERY_HAS_NO_LIVE_CONTINUATION'),true);});
 const close=F(function close(){if(arguments.length!==0)return receipt(new TypeError('RECOVERY_INPUT'),true);closed=true;if(busy){held=true;HELD.add(retained);}
  return held?receipt(new TypeError('RECOVERY_CLOSE_HELD'),true):receipt(undefined);});
 const snapshotView=F(function snapshotView(){if(arguments.length!==0)fail();return F({officialFundingPostRecoveryVersion:1,held,active:busy,closed,reads,
   intakeBound:record!==null,officialOutcome:outcome?.phase??null,recoveryHeld:outcome===null,recordedPhase:record?.phase??null,
   observations:record?.observations??0,maximumPendingReconciliations:c.maximumPendingReconciliations,originalRetained:header!==null,
   firstSDKEntries:0,newObservations:0,custodyWrites:0,stores:'BORROWED_NOT_CLOSED',authority:'NONE',physicalRelease:'NOT_ESTABLISHED'});});
 return F({getIssuedChallenge,getRecordedOutcome,processHttpRequest,resumeOriginalSettlement,close,snapshot:snapshotView});
}
