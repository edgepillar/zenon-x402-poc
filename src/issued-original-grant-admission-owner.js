import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson,paymentIntentDigest } from './canonical.js';
import { decodeB64Json } from './x402-wire.js';
import { captureIssuedFundingGrantRecoveryExpectation,captureIssuedFundingGrantRecoveryRows } from './x402-issued-funding-grant-recovery.js';
import { captureIssuedFundingPostServiceSelection } from './x402-issued-funding-post-application-binding.js';
import { captureOfficialFundingPostHttpsRoute } from './x402-official-funding-post-https-request-binding.js';
import { captureOfficialFundingPostCustodyContext,requireOfficialFundingPostCustodyContext,projectOfficialFundingPostCustodyRecord,
 projectOfficialFundingPostExpiredReceipt } from './official-funding-post-custody-record.js';
import { captureServiceCreditOriginalFundingIdentity,captureServiceCreditOriginalFundingGrantResult } from './service-credit-original-funding-grant.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn,K=Reflect.ownKeys,A=Reflect.apply,NP=Promise,PP=NP.prototype;
const THEN=D(PP,'then'),CTOR=D(PP,'constructor'),SPECIES=D(NP,Symbol.species),HELD=new Set();
function fail(){throw new TypeError('ISSUED_ORIGINAL_GRANT_ADMISSION');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||K(v).length!==names.length)fail();
 const out={};for(const k of names){const d=D(v,k);if(!d?.enumerable||!O(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function own(v,k){if(v===null||typeof v!=='object'||types.isProxy(v)||!Object.isFrozen(v))fail();const d=D(v,k);if(!d?.enumerable||!O(d,'value'))fail();return d.value;}
function same(a,b){return !!a&&!!b&&K(a).length===K(b).length&&K(b).every(k=>O(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&D(Object.prototype,'toJSON')===undefined&&same(D(PP,'then'),THEN)&&same(D(PP,'constructor'),CTOR)&&same(D(NP,Symbol.species),SPECIES);}
function safe(v){if(!invariant()||!types.isPromise(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==PP||D(v,'then')!==undefined)return false;const d=D(v,'constructor');return d===undefined||O(d,'value')&&d.value===NP&&!d.enumerable&&!d.writable&&!d.configurable;}
function discard(v){try{if(safe(v)){const q=A(THEN.value,v,[()=>{},()=>{}]);A(THEN.value,q,[()=>{},()=>{}]);}}catch{}}
function capability(){let resolve,reject;const promise=new NP((yes,no)=>{resolve=yes;reject=no;});Object.defineProperty(promise,'constructor',{value:NP});A(THEN.value,promise,[()=>{},()=>{}]);return {promise,resolve,reject};}
function rejected(){const c=capability();c.reject(new TypeError('ISSUED_ORIGINAL_GRANT_ADMISSION'));return c.promise;}
function digest(domain,value){return 'sha256:'+createHash('sha256').update(domain+'\0','ascii').update(canonicalJson(value)).digest('hex');}
function identity(record,selection){
 const required=decodeB64Json(JSON.parse(record.issuedFrameJson).paymentRequiredHeader,{maxEncodedBytes:5464,maxDecodedBytes:4096});
 const payload=decodeB64Json(record.originalHeader,{maxEncodedBytes:5464,maxDecodedBytes:4096}),accepted=payload.accepted,t=required.resource.tags,tx=payload.payload.transaction;
 const intent=paymentIntentDigest(required,accepted);
 if(tx.hash!==record.transactionHash||!Number.isSafeInteger(tx.chainIdentifier)||String(tx.chainIdentifier)!==accepted.extra.zenonChain.chainIdentifier
    ||tx.tokenStandard!==accepted.asset||tx.amount!==accepted.amount||tx.toAddress!==accepted.payTo||tx.address!==selection.holderId
    ||payload.payload.intentDigest!==intent||tx.data!==Buffer.from(intent,'hex').toString('base64'))fail();
 return captureServiceCreditOriginalFundingIdentity({transactionId:'zenontx:'+record.transactionHash,network:accepted.network,chainProfile:accepted.extra.zenonChain,
  asset:accepted.asset,amount:accepted.amount,payee:accepted.payTo,offerId:selection.offerId,offerVersion:selection.offerVersion,holderId:selection.holderId,capabilityCommitment:selection.capabilityCommitment,
  paymentResourceDigest:digest('zenon-x402-service-credit-payment-resource-v1',required.resource),paymentRequirementDigest:digest('zenon-x402-service-credit-payment-requirement-v1',accepted),
  paymentIntentDigest:'sha256:'+intent,grantFundingCommitment:'sha256:'+t[1]+t[2]});
}

/** Local operator admission of an EXISTING grant. Pin validation precedes the
 * historical lookup. That NONE-authority result never substitutes for the
 * provider's actual getGrant/admission. No activation or payment capability. */
export function createIssuedOriginalGrantAdmissionOwner(options){
 if(arguments.length!==1||!invariant()||HELD.size>=32)fail();
 const c=fields(options,['expectation','selection','resourceUrl','maximumPendingReconciliations','port']);
 const expected=captureIssuedFundingGrantRecoveryExpectation(c.expectation),selection=captureIssuedFundingPostServiceSelection(c.selection),url=captureOfficialFundingPostHttpsRoute(c.resourceUrl).resourceUrl;
 if(!Number.isSafeInteger(c.maximumPendingReconciliations)||Object.is(c.maximumPendingReconciliations,-0)||c.maximumPendingReconciliations<0||c.maximumPendingReconciliations>16)fail();
 const p=fields(c.port,['providerSnapshot','providerClose','loadBound','readOfficialOutcome','readOriginalFundingGrant','admitCommittedServiceGrant','admitCommittedServiceGrantResults']);
 for(const fn of Object.values(p))if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();if(new Set(Object.values(p)).size!==7)fail();
 let closed=false,held=false,active=false,attempts=0,admissionEntered=false,admittedGrantId=null,serviceMode=null,original=null,history=null,providerClose=null,closing=null;
 let lookupCalls=0,inspectionCalls=0,admissionCalls=0,resultAdmissionCalls=0,closeCalls=0;const opaque=[];
 const retained=F(()=>[p,original,history,providerClose,closing,opaque]);
 function hold(v){held=true;HELD.add(retained);if(v!==undefined){opaque.push(v);discard(v);}}
 function live(){if(closed||held||!invariant())fail();}
 function sync(fn,args=[]){let v;try{v=A(fn,undefined,args);}catch{hold();fail();}if(types.isPromise(v)){hold(v);fail();}live();return v;}
 function inspect(){return sync(p.providerSnapshot);}
 function eligible(v){return own(v,'phase')==='OPEN'&&own(v,'uncertain')===false&&own(v,'admissionRevoked')===false&&own(v,'activeOperations')===0&&own(v,'fundingBusy')===false
  &&own(v,'serviceOpening')===false&&own(v,'serviceAdmissionOpen')===false&&own(own(v,'binding'),'boundRetained')===true&&own(own(v,'binding'),'officialPhase')==='SETTLED'
  &&own(own(v,'funding'),'intakeBound')===true&&own(own(v,'funding'),'active')===false&&own(own(v,'funding'),'held')===false;}
 function current(){
  live();const first=captureIssuedFundingGrantRecoveryRows(sync(p.loadBound),selection,url,expected),raw=sync(p.readOfficialOutcome);
  if(typeof raw!=='string')fail();projectOfficialFundingPostCustodyRecord(raw,expected.outcomeRecordDigest);
  const record=requireOfficialFundingPostCustodyContext(raw,captureOfficialFundingPostCustodyContext({issuedFrame:first.row.issue.frame,resourceUrl:url,serviceSelection:selection,maximumPendingReconciliations:c.maximumPendingReconciliations}));
  const b=first.row.binding;if(record.phase!=='SETTLED'||record.transactionHash!==b.transactionHash
    ||record.boundJson!==canonicalJson({status:'BOUND',transactionHash:b.transactionHash,observerRecordKey:b.observerRecordKey,observerFileName:b.observerFileName})
    ||canonicalJson(JSON.parse(Buffer.from(record.originalHeader,'base64').toString('utf8')))!==canonicalJson(b.publication?.paymentPayload))fail();
  const originalIdentity=identity(record,selection);let expiredFundingHistory=null;
  if(JSON.parse(raw).version===2){
   // The digest above precedes parsing. A retained receipt also needs the
   // separately pinned original challenge; its own expiry is not a trust input.
   const challenge=own(first.row.issue,'challenge'),intent=own(challenge,'activationIntent');
   if(own(challenge,'fundingCommitment')!==originalIdentity.grantFundingCommitment)fail();
   expiredFundingHistory=projectOfficialFundingPostExpiredReceipt(raw,expected.outcomeRecordDigest,F({
    transactionHash:record.transactionHash,fundingCommitment:originalIdentity.grantFundingCommitment,expiresAt:own(intent,'expiresAt')}));
   if(expiredFundingHistory===null)fail();
  }
  const last=captureIssuedFundingGrantRecoveryRows(sync(p.loadBound),selection,url,expected);if(last.rowJson!==first.rowJson)fail();
  const selected=F({rowJson:first.rowJson,recordJson:raw,identity:originalIdentity,expiredFundingHistory});if(original!==null&&(original.rowJson!==selected.rowJson||original.recordJson!==raw))fail();
  original=selected;return selected;
 }
 function requestClose(){if(providerClose!==null)return providerClose.promise;providerClose=capability();closeCalls++;
  try{const receipt=A(p.providerClose,undefined,[]);if(!safe(receipt)||receipt===providerClose.promise||receipt===closing?.promise){hold(receipt);fail();}
   A(THEN.value,receipt,[v=>{try{if(v!==undefined)fail();const s=A(p.providerSnapshot,undefined,[]);if(types.isPromise(s)){hold(s);fail();}
     if(own(s,'phase')!=='CLOSED'||own(s,'uncertain')||own(s,'activeOperations')!==0||own(s,'fundingBusy')||own(s,'serviceOpening'))fail();providerClose.resolve(undefined);
    }catch{hold();providerClose.reject(new TypeError('ORIGINAL_GRANT_PROVIDER_CLOSE_UNKNOWN'));}},()=>{hold();providerClose.reject(new TypeError('ORIGINAL_GRANT_PROVIDER_CLOSE_UNKNOWN'));}]);
  }catch{hold();providerClose.reject(new TypeError('ORIGINAL_GRANT_PROVIDER_CLOSE_UNKNOWN'));}return providerClose.promise;
 }
 /** Explicit read of the existing original tuple, not service admission. The
  * same independent pins and provider must survive the synchronous lookup.
  * NOT_RECORDED is an observation, never proof of no payment or no liability. */
 const inspectOriginalCommittedServiceGrant=F(function inspectOriginalCommittedServiceGrant(){
  if(arguments.length!==0||closed||held||active||admissionEntered||attempts>=16||!invariant())fail();active=true;attempts++;inspectionCalls++;
  try{const view=inspect();if(!eligible(view))return F({status:'NOT_READY',authority:'NONE'});
   const selected=current(),hash=selected.identity.transactionId.slice(8);if(own(own(view,'binding'),'transactionHash')!==hash)fail();
   lookupCalls++;history=captureServiceCreditOriginalFundingGrantResult(sync(p.readOriginalFundingGrant,[selected.identity]),selected.identity);
   const again=current(),latest=inspect();if(again.rowJson!==selected.rowJson||again.recordJson!==selected.recordJson||!eligible(latest)
     ||own(own(latest,'binding'),'transactionHash')!==hash)fail();
   // V1 keeps its original closed result. Retained V2 history makes the
   // separate obligation visible without treating a grant lookup as delivery,
   // refund, fresh verification, or authority to perform another operation.
   live();return selected.expiredFundingHistory===null?history:F({originalFundingHistoryVersion:1,
    grantHistory:history,expiredFundingHistory:selected.expiredFundingHistory,
    historicalObservation:true,verification:'STORED_HISTORY_NOT_REVALIDATED',authority:'NONE',
    mayStartPayment:false,maySignPayment:false,mayActivateGrant:false,mayDispatchService:false,mayStartCompensation:false});
  }catch{hold();requestClose();fail();}finally{active=false;}
 });
 function admitOriginal(resultsOnly){
  if(typeof resultsOnly!=='boolean'||closed||held||active||admissionEntered||attempts>=16||!invariant())fail();active=true;attempts++;
  try{const view=inspect();if(!eligible(view))return F({status:'NOT_READY',authority:'NONE'});
   const selected=current();if(own(own(view,'binding'),'transactionHash')!==selected.identity.transactionId.slice(8))fail();
   lookupCalls++;history=captureServiceCreditOriginalFundingGrantResult(sync(p.readOriginalFundingGrant,[selected.identity]),selected.identity);
   const again=current(),latest=inspect();if(again.rowJson!==selected.rowJson||again.recordJson!==selected.recordJson||!eligible(latest)
     ||own(own(latest,'binding'),'transactionHash')!==selected.identity.transactionId.slice(8))fail();
   if(history.status==='NOT_RECORDED')return F({status:'NOT_READY',history,authority:'NONE'});
   live();admissionEntered=true;admissionCalls++;const id=history.record.grantId;
   if(resultsOnly)resultAdmissionCalls++;
   const result=fields(sync(resultsOnly?p.admitCommittedServiceGrantResults:p.admitCommittedServiceGrant,[id]),['status','grantId','authority']);
   if(result.status!=='ADMITTED'||result.grantId!==id||result.authority!=='NONE')fail();
   const after=inspect();if(own(after,'phase')!=='OPEN'||own(after,'uncertain')||own(after,'admissionRevoked')||own(after,'serviceAdmissionOpen')!==true||own(after,'admittedGrantId')!==id)fail();
   const mode=own(after,'serviceAdmissionMode');if(!['DURABLE_EXECUTION','RECORDED_RESULT_ONLY'].includes(mode)
     ||(resultsOnly||history.record.storedLifecycle!=='ACTIVE')&&mode!=='RECORDED_RESULT_ONLY')fail();
   current();live();admittedGrantId=id;serviceMode=mode;return F({status:'ADMITTED',grantId:id,history,serviceMode,admission:'EXPLICIT_LOCAL_OPERATOR',authority:'NONE'});
  }catch{hold();requestClose();fail();}finally{active=false;}
 }
 const admitOriginalCommittedServiceGrant=F(function admitOriginalCommittedServiceGrant(){if(arguments.length!==0)fail();return admitOriginal(false);});
 const admitOriginalCommittedServiceGrantResults=F(function admitOriginalCommittedServiceGrantResults(){if(arguments.length!==0)fail();return admitOriginal(true);});
 const admitCommittedServiceGrant=F(function admitCommittedServiceGrant(id){if(arguments.length!==1||active)fail();live();return A(p.admitCommittedServiceGrant,undefined,[id]);});
 const close=F(function close(){if(arguments.length!==0)return rejected();if(closing!==null)return closing.promise;closing=capability();closed=true;if(active)hold();
  const receipt=requestClose();A(THEN.value,receipt,[()=>{if(active||held)closing.reject(new TypeError('ORIGINAL_GRANT_CLOSE_HELD'));else closing.resolve(undefined);},()=>closing.reject(new TypeError('ORIGINAL_GRANT_CLOSE_HELD'))]);return closing.promise;});
 const view=F(function snapshotView(){if(arguments.length!==0)fail();return F({version:1,closed,held,active,attempts,maximumAttempts:16,lookupCalls,inspectionCalls,admissionCalls,resultAdmissionCalls,admissionEntered,admittedGrantId,providerCloseCalls:closeCalls,
  serviceMode,grantActivations:0,SDKEntries:0,newFunding:0,unitReset:false,storesClosed:false,authority:'EXPLICIT_LOCAL_OPERATOR_REQUIRED',physicalRelease:'NOT_ESTABLISHED'});});
 return F({inspectOriginalCommittedServiceGrant,admitOriginalCommittedServiceGrant,admitOriginalCommittedServiceGrantResults,admitCommittedServiceGrant,close,snapshot:view});
}
