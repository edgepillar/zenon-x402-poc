import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson,sha256Hex,paymentIntentDigest } from './canonical.js';
import { decodeB64Json,effectiveMinimumMomentumConfirmations,validatePaymentPayloadEnvelope,validatePaymentRequired,sameResource,sameRequirements,snapshotActiveUpfrontRequirement } from './x402-wire.js';
import { captureIssuedFundingGrantRecoveryExpectation,captureIssuedFundingGrantRecoveryRows } from './x402-issued-funding-grant-recovery.js';
import { captureOfficialFundingPostCustodyContext,requireOfficialFundingPostCustodyContext,
 createOfficialFundingPostObservationRecord,createOfficialFundingPostOutcomeRecord,
 projectOfficialFundingPostCustodyRecord,officialFundingPostCustodyRecordDigest } from './official-funding-post-custody-record.js';
import { captureIssuedFundingPostServiceSelection } from './x402-issued-funding-post-application-binding.js';
import { captureOfficialFundingPostHttpsRoute } from './x402-official-funding-post-https-request-binding.js';
import { normalizeSelectedSettlementCallbackResult } from './x402-selected-settlement-context.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn,K=Reflect.ownKeys,A=Reflect.apply,NP=Promise,PP=NP.prototype;
const THEN=D(PP,'then'),CTOR=D(PP,'constructor'),SPECIES=D(NP,Symbol.species),HELD=new Set();
const ORIGINAL=['authorizationKey','transactionHash','chainProfile','intentDigest','resourceIdentity','resourceDigest','payer','signedAccountBlock'];
const ENTRY=[...ORIGINAL,'evidenceState','momentumEvidence','deliveryState','cachedResponse','createdAt','updatedAt'];
const SELECTED_JOURNAL_BINDINGS=new WeakSet();
function fail(){throw new TypeError('ORIGINAL_FUNDING_JOURNAL_OBSERVATION');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||K(v).length!==names.length)fail();
 const out={};for(const k of names){const d=D(v,k);if(!d?.enumerable||!O(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function own(v,key){if(v===null||typeof v!=='object'||types.isProxy(v)||!Object.isFrozen(v))fail();const d=D(v,key);if(!d?.enumerable||!O(d,'value'))fail();return d.value;}
function snapshot(v,depth=0,budget={nodes:8192,bytes:131072}){
 if(--budget.nodes<0||depth>24)fail();if(v===null||typeof v==='boolean')return v;
 if(typeof v==='string'){budget.bytes-=Buffer.byteLength(v);if(budget.bytes<0||Buffer.from(v).toString('utf8')!==v)fail();return v;}
 if(typeof v==='number'){if(!Number.isSafeInteger(v)||Object.is(v,-0))fail();return v;}
 if(typeof v!=='object'||types.isProxy(v))fail();const keys=K(v),array=Array.isArray(v),proto=Object.getPrototypeOf(v);
 if(array){if(proto!==Array.prototype)fail();const n=D(v,'length')?.value;if(!Number.isSafeInteger(n)||n>4096||keys.length!==n+1)fail();const out=[];
  for(let i=0;i<n;i++){const d=D(v,String(i));if(!d?.enumerable||!O(d,'value'))fail();out.push(snapshot(d.value,depth+1,budget));}return F(out);}
 if((proto!==Object.prototype&&proto!==null)||keys.length>128)fail();const out={};
 for(const k of keys){if(typeof k!=='string'||['then','toJSON','__proto__','constructor','prototype'].includes(k))fail();const d=D(v,k);if(!d?.enumerable||!O(d,'value'))fail();
  budget.bytes-=Buffer.byteLength(k);if(budget.bytes<0)fail();Object.defineProperty(out,k,{value:snapshot(d.value,depth+1,budget),enumerable:true});}return F(out);
}
function same(a,b){return !!a&&!!b&&K(a).length===K(b).length&&K(b).every(k=>O(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&D(Object.prototype,'toJSON')===undefined&&same(D(PP,'then'),THEN)&&same(D(PP,'constructor'),CTOR)&&same(D(NP,Symbol.species),SPECIES);}
function safe(v){if(!invariant()||v===null||typeof v!=='object'||types.isProxy(v)||!types.isPromise(v)||Object.getPrototypeOf(v)!==PP||D(v,'then')!==undefined)return false;
 const c=D(v,'constructor');return c===undefined||O(c,'value')&&c.value===NP&&!c.enumerable&&!c.writable&&!c.configurable;}
function discard(v){try{if(safe(v)){const p=A(THEN.value,v,[()=>{},()=>{}]);A(THEN.value,p,[()=>{},()=>{}]);}}catch{}}
function capability(){let resolve,reject;const promise=new NP((yes,no)=>{resolve=yes;reject=no;});Object.defineProperty(promise,'constructor',{value:NP});A(THEN.value,promise,[()=>{},()=>{}]);return {promise,resolve,reject};}
function rejected(){const c=capability();c.reject(new TypeError('ORIGINAL_FUNDING_JOURNAL_OBSERVATION'));return c.promise;}
function timestamp(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))fail();const n=Date.parse(v);if(!Number.isFinite(n)||new Date(n).toISOString()!==v)fail();return n;}
function journalBinding(row,record){
 const payload=decodeB64Json(record.originalHeader,{maxEncodedBytes:5464,maxDecodedBytes:4096}),frame=JSON.parse(record.issuedFrameJson),required=decodeB64Json(frame.paymentRequiredHeader,{maxEncodedBytes:5464,maxDecodedBytes:4096});
 const resource=payload.resource,requirement=payload.accepted,intent=paymentIntentDigest(required,requirement),resourceDigest=sha256Hex(resource);
 const authorizationKey=sha256Hex({domain:'zenon-x402-authorization-v1',chainProfile:requirement.extra.zenonChain,intentDigest:intent,resourceDigest,transactionHash:record.transactionHash});
 if(row.binding.authorizationKey!==authorizationKey||payload.payload.intentDigest!==intent
    ||canonicalJson(payload)!==canonicalJson(row.binding.publication?.paymentPayload))fail();
 return F({original:snapshot({authorizationKey,transactionHash:record.transactionHash,chainProfile:requirement.extra.zenonChain,
   intentDigest:intent,resourceIdentity:resource,resourceDigest,payer:payload.payload.transaction.address,signedAccountBlock:payload.payload.transaction}),
   requirement:snapshot(requirement),normalizer:F({payloadJson:canonicalJson(payload),requirementsJson:canonicalJson(requirement),challengeJson:canonicalJson(required),paymentHash:record.transactionHash,network:requirement.network})});
}
/** Native callers supply the existing journal's validated detached snapshot.
 * Pure DATA callers supply declared records, not authenticated chain evidence. */
function captureJournal(value,binding){
 const packet=fields(snapshot(value),['revision','kind','entry']);if(!Number.isSafeInteger(packet.revision)||packet.revision<1||packet.kind!=='record')fail();
 const e=fields(packet.entry,ENTRY);for(const k of ORIGINAL)if(canonicalJson(e[k])!==canonicalJson(binding.original[k]))fail();
 const created=timestamp(e.createdAt),updated=timestamp(e.updatedAt);if(updated<created||e.deliveryState!=='NONE'||e.cachedResponse!==null)fail();
 let success=false;
 if(e.evidenceState==='MOMENTUM_INCLUDED'){
  const m=fields(e.momentumEvidence,['observedAt','confirmationDetail']),d=fields(m.confirmationDetail,['numConfirmations','momentumHeight','momentumHash','momentumTimestamp']);
  const at=timestamp(m.observedAt);if(at<created||at>updated||!Number.isSafeInteger(d.numConfirmations)||d.numConfirmations<1
      ||!Number.isSafeInteger(d.momentumHeight)||d.momentumHeight<1||typeof d.momentumHash!=='string'||!/^[0-9a-f]{64}$/.test(d.momentumHash)
      ||!Number.isSafeInteger(d.momentumTimestamp)||d.momentumTimestamp<0)fail();
  success=d.numConfirmations>=effectiveMinimumMomentumConfirmations(binding.requirement);
 }else if(e.evidenceState!=='SUBMISSION_ACKNOWLEDGED'||e.momentumEvidence!==null)fail();
 const response=success?{success:true,payer:binding.original.payer,transaction:binding.original.transactionHash,network:binding.requirement.network,
   disposition:'SUCCEEDED',publicationStatus:'ACKNOWLEDGED'}:{success:false,transaction:binding.original.transactionHash,network:binding.requirement.network,
   errorReason:'settlement_pending',disposition:'PENDING',publicationStatus:'ACKNOWLEDGED'};
 const normalized=normalizeSelectedSettlementCallbackResult(response,binding.normalizer);
 return F({response:snapshot(JSON.parse(normalized.responseJson)),wireHeader:Buffer.from(normalized.responseJson).toString('base64'),success,
   source:F({kind:'EXISTING_FACILITATOR_JOURNAL',revision:packet.revision,recordDigest:'sha256:'+sha256Hex(packet.entry),evidenceState:e.evidenceState,
     publicationStatus:normalized.publicationStatus,SDKReentered:false,currentCanonicality:'NOT_ESTABLISHED',serviceDelivery:'NOT_ESTABLISHED'})});
}

/** Bind the original selected SDK tuple before a journal read. This DATA
 * operation neither verifies its signature nor authenticates a chain. The
 * caller must already own the selected server context and verifier admission.
 * Never derive a replacement transaction or accept a caller authorization key.
 */
export function captureOriginalSelectedFundingJournalBinding(payload,requirements,challenge){
 if(arguments.length!==3)fail();const p=snapshot(payload),r=snapshot(requirements),c=snapshot(challenge);
 validatePaymentPayloadEnvelope(p);validatePaymentRequired(c);snapshotActiveUpfrontRequirement(r);
 if(c.accepts.length!==1||!sameResource(p.resource,c.resource)||!sameRequirements(p.accepted,r)||!sameRequirements(c.accepts[0],r))fail();
 const intent=paymentIntentDigest(c,r),resourceDigest=sha256Hex(p.resource),tx=p.payload.transaction;
 if(p.payload.intentDigest!==intent||typeof tx.hash!=='string'||!/^[0-9a-f]{64}$/.test(tx.hash)
    ||tx.data!==Buffer.from(intent,'hex').toString('base64'))fail();
 const authorizationKey=sha256Hex({domain:'zenon-x402-authorization-v1',chainProfile:r.extra.zenonChain,intentDigest:intent,resourceDigest,transactionHash:tx.hash});
 const binding=F({original:snapshot({authorizationKey,transactionHash:tx.hash,chainProfile:r.extra.zenonChain,intentDigest:intent,
  resourceIdentity:p.resource,resourceDigest,payer:tx.address,signedAccountBlock:tx}),requirement:r,
  normalizer:F({payloadJson:canonicalJson(p),requirementsJson:canonicalJson(r),challengeJson:canonicalJson(c),paymentHash:tx.hash,network:r.network})});
 SELECTED_JOURNAL_BINDINGS.add(binding);return binding;
}

/** Reuse the original recovery projection, including all eight immutable
 * fields, delivery exclusion and the original confirmation threshold. An ACK
 * is PENDING. An included local journal record is historical evidence only;
 * this function does not establish current canonicality or grant authority.
 */
export function projectOriginalSelectedFundingJournalSnapshot(value,binding){
 if(arguments.length!==2||binding===null||typeof binding!=='object'||types.isProxy(binding)||!SELECTED_JOURNAL_BINDINGS.has(binding))fail();
 return captureJournal(value,binding);
}

/** Explicit local operation: close the SAME provider first, claim a durable
 * observation, read only the ORIGINAL journal entry, then persist/read back
 * the outcome. No SDK tuple reconstruction, publish, signer or grant method. */
export function createOriginalFundingJournalObservation(options){
 if(arguments.length!==1||!invariant()||HELD.size>=32)fail();
 const c=fields(options,['expectation','serviceSelection','resourceUrl','maximumPendingReconciliations','port']),expected=captureIssuedFundingGrantRecoveryExpectation(c.expectation);
 const selection=captureIssuedFundingPostServiceSelection(c.serviceSelection),resourceUrl=captureOfficialFundingPostHttpsRoute(c.resourceUrl).resourceUrl;
 const p=fields(c.port,['closeProvider','inspectProvider','loadBound','readOfficialOutcome','compareAndSwap','readJournal']);
 if(new Set(Object.values(p)).size!==6)fail();
 for(const fn of Object.values(p))if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();
 if(!Number.isSafeInteger(c.maximumPendingReconciliations)||Object.is(c.maximumPendingReconciliations,-0)||c.maximumPendingReconciliations<0||c.maximumPendingReconciliations>16)fail();
 let closed=false,held=false,active=false,providerClose=null,closing=null,work=null,providerClosed=false,raw=null,record=null,row=null,proposed=null,readAttempts=[];
 let closeCalls=0,inspections=0,storeReads=0,writes=0,journalReads=0,operations=0,firstResultEntries=0;const opaque=[];
 const retained=F(()=>[p,raw,record,row,proposed,opaque,readAttempts,providerClose,closing,work]);
 function hold(value){held=true;HELD.add(retained);if(value!==undefined){opaque.push(value);discard(value);}fail();}
 function check(){if(closed||held||!invariant())hold();}
 function inspectClosed(){
  inspections++;let v;try{v=A(p.inspectProvider,undefined,[]);}catch{hold();}if(types.isPromise(v))hold(v);
  try{if(own(v,'phase')!=='CLOSED'||own(v,'uncertain')!==false||own(v,'admissionRevoked')!==true||own(v,'activeOperations')!==0||own(v,'fundingBusy')!==false||own(v,'serviceOpening')!==false
      ||!['fundingCloseDone','serviceCloseDone','queryCloseDone'].every(k=>own(v,k)===true))hold(v);
   const i=own(v,'ingress'),f=own(v,'funding');if(own(i,'phase')!=='CLOSED'||own(i,'closeClean')!==1||own(i,'closeUncertain')!==0
      ||!['trackedSockets','trackedRequests','trackedHandlers','ownedTimers'].every(k=>own(i,k)===0)
      ||own(f,'held')!==false||own(f,'active')!==false||own(f,'closed')!==true)hold(v);
  }catch{hold(v);}return undefined;
 }
 function observePromise(value,capture){
  if(!safe(value)||value===work?.promise||value===closing?.promise||value===providerClose?.promise)hold(value);
  const ticket=capability();A(THEN.value,value,[v=>{try{ticket.resolve(F({value:capture(v)}));}catch{ticket.reject(new TypeError('OBSERVATION_RECEIPT_UNKNOWN'));}},()=>ticket.reject(new TypeError('OBSERVATION_RECEIPT_UNKNOWN'))]);return ticket.promise;
 }
 function requestProviderClose(){
  if(providerClose!==null)return providerClose.promise;providerClose=capability();closeCalls++;
  try{const value=A(p.closeProvider,undefined,[]),pending=observePromise(value,v=>{if(v!==undefined)hold(v);inspectClosed();providerClosed=true;return undefined;});
   A(THEN.value,pending,[()=>providerClose.resolve(undefined),()=>{held=true;HELD.add(retained);providerClose.reject(new TypeError('PROVIDER_CLOSE_UNKNOWN'));}]);
  }catch{held=true;HELD.add(retained);providerClose.reject(new TypeError('PROVIDER_CLOSE_UNKNOWN'));}return providerClose.promise;
 }
 function sync(fn,args){let v;storeReads++;try{v=A(fn,undefined,args);readAttempts.push(v);}catch{hold();}if(types.isPromise(v))hold(v);check();return v;}
 function current(){
  check();inspectClosed();readAttempts=[];
  const selected=captureIssuedFundingGrantRecoveryRows(sync(p.loadBound,[]),selection,resourceUrl,expected),value=sync(p.readOfficialOutcome,[]);
  if(typeof value!=='string')hold(value);
  projectOfficialFundingPostCustodyRecord(value,raw===null?expected.outcomeRecordDigest:officialFundingPostCustodyRecordDigest(raw));
  if(raw!==null&&value!==raw)hold();
  const context=captureOfficialFundingPostCustodyContext({issuedFrame:selected.row.issue.frame,resourceUrl,serviceSelection:selection,maximumPendingReconciliations:c.maximumPendingReconciliations});
  const parsed=requireOfficialFundingPostCustodyContext(value,context);
  if(parsed.boundJson!==canonicalJson({status:'BOUND',transactionHash:selected.row.binding.transactionHash,observerRecordKey:selected.row.binding.observerRecordKey,observerFileName:selected.row.binding.observerFileName}))hold();
  const binding=journalBinding(selected.row,parsed),last=captureIssuedFundingGrantRecoveryRows(sync(p.loadBound,[]),selection,resourceUrl,expected);
  if(last.rowJson!==selected.rowJson)hold();raw=value;record=parsed;row=selected.row;readAttempts=[];inspectClosed();check();return binding;
 }
 function persist(next){
  inspectClosed();check();proposed=next;let ack;writes++;try{ack=A(p.compareAndSwap,undefined,[raw,next]);}catch{hold();}
  if(typeof ack!=='string'||ack!==next)hold(ack);check();inspectClosed();const seen=sync(p.readOfficialOutcome,[]);if(seen!==next)hold(seen);
  raw=next;record=requireOfficialFundingPostCustodyContext(raw,captureOfficialFundingPostCustodyContext({issuedFrame:row.issue.frame,resourceUrl,serviceSelection:selection,maximumPendingReconciliations:c.maximumPendingReconciliations}));
  proposed=null;current();return undefined;
 }
 async function run(closeReceipt,ticket,firstResult){
  let benign=false;try{
   await closeReceipt;check();inspectClosed();const binding=current();
   if(firstResult){
    if(record.phase!=='FIRST_IN_FLIGHT'){benign=true;fail();}
    // FIRST_IN_FLIGHT already records the original SDK attempt. Do not reserve
    // another observation, enter SDK or turn this read into a fresh attempt.
    if(firstResultEntries!==0)fail();firstResultEntries++;
   }else{
    if(record.phase!=='PENDING'||record.observations>=record.maximumPendingReconciliations){benign=true;fail();}
    persist(createOfficialFundingPostObservationRecord(raw));
   }
   check();inspectClosed();journalReads++;
   let value;try{value=A(p.readJournal,undefined,[binding.original]);}catch{hold();}
   const observed=(await observePromise(value,v=>{check();return captureJournal(v,binding);})).value;
   check();inspectClosed();current();
   const phase=observed.success?'SETTLED':firstResult||record.observations<record.maximumPendingReconciliations?'PENDING':'EXHAUSTED';
   const bound=Object.create(null);for(const [k,v]of Object.entries(JSON.parse(record.boundJson)))Object.defineProperty(bound,k,{value:v,enumerable:true});
   const outcome=F({phase:'INTAKE_BOUND_OFFICIAL_'+phase,intake:F(bound),official:F({type:'observed-settlement',settlement:observed.response,
      headers:F({'PAYMENT-RESPONSE':observed.wireHeader}),observationSource:observed.source}),transactionHash:record.transactionHash,
      acknowledgementDomainsIndependent:true,authority:'NONE',grantActivation:'NOT_ESTABLISHED',serviceDelivery:'NOT_ESTABLISHED'});
   persist(createOfficialFundingPostOutcomeRecord(raw,outcome));check();inspectClosed();
   const digest=officialFundingPostCustodyRecordDigest(raw);ticket.resolve(F({history:projectOfficialFundingPostCustodyRecord(raw,digest),
      recoveryExpectation:F({boundRowDigest:expected.boundRowDigest,outcomeRecordDigest:digest}),independentPinRetentionRequired:true,providerReopened:false,authority:'NONE'}));
  }catch{if(!benign){held=true;HELD.add(retained);}ticket.reject(new TypeError('ORIGINAL_FUNDING_OBSERVATION_UNAVAILABLE'));}
  finally{active=false;}
 }
 const observe=F(function observe(){
  if(arguments.length!==0||closed||held||active||operations>=32||!invariant())return rejected();
  const ticket=capability();work=ticket;active=true;operations++;
  const receipt=requestProviderClose();A(THEN.value,run(receipt,ticket,false),[()=>{},()=>{}]);return ticket.promise;
 });
 // Separate explicit operator entry. observe() retains its PENDING-only
 // contract; paid replay and ordinary startup never call this method.
 const recoverFirstResult=F(function recoverFirstResult(){
  if(arguments.length!==0||closed||held||active||firstResultEntries!==0||operations>=32||!invariant())return rejected();
  const ticket=capability();work=ticket;active=true;operations++;
  const receipt=requestProviderClose();A(THEN.value,run(receipt,ticket,true),[()=>{},()=>{}]);return ticket.promise;
 });
 const close=F(function close(){
  if(arguments.length!==0)return rejected();if(closing!==null)return closing.promise;
  closing=capability();closed=true;if(active){held=true;HELD.add(retained);}
  const receipt=requestProviderClose();A(THEN.value,receipt,[()=>{try{inspectClosed();if(active||held)fail();closing.resolve(undefined);}catch{held=true;HELD.add(retained);closing.reject(new TypeError('OBSERVATION_CLOSE_HELD'));}},()=>closing.reject(new TypeError('OBSERVATION_CLOSE_HELD'))]);
  return closing.promise;
 });
 const snapshotView=F(function snapshotView(){if(arguments.length!==0)fail();return F({originalJournalObservationVersion:1,closed,held,active,providerClosed,closeCalls,inspections,storeReads,writes,journalReads,operations,firstResultEntries,
   recordedPhase:record?.phase??null,observations:record?.observations??null,maximumPendingReconciliations:c.maximumPendingReconciliations,proposedWriteRetained:proposed!==null,
   SDKEntries:0,newFunding:0,grantActivations:0,serviceDispatches:0,providerReopened:false,borrowedStoresClosed:false,physicalRelease:'NOT_ESTABLISHED',authority:'NONE'});});
 return F({observe,recoverFirstResult,close,snapshot:snapshotView});
}
