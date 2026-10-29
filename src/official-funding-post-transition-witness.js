import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson,sha256Hex } from './canonical.js';
import { createOriginalFundingJournalObservation } from './official-funding-post-original-journal-observation.js';
import { captureIssuedFundingGrantRecoveryExpectation,captureIssuedFundingGrantRecoveryRows } from './x402-issued-funding-grant-recovery.js';
import { captureIssuedFundingPostServiceSelection } from './x402-issued-funding-post-application-binding.js';
import { captureOfficialFundingPostHttpsRoute } from './x402-official-funding-post-https-request-binding.js';
import { captureOfficialFundingPostCustodyContext,requireOfficialFundingPostCustodyContext,
 inspectOfficialFundingPostCustodyRecord,officialFundingPostCustodyRecordDigest,
 requireOfficialFundingPostCustodyTransition,projectOfficialFundingPostCustodyRecord } from './official-funding-post-custody-record.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply,K=Reflect.ownKeys,NP=Promise,PP=NP.prototype;
const TD=D(PP,'then'),CD=D(PP,'constructor'),SD=D(NP,Symbol.species),THEN=TD.value,HELD=new Set();
const REJECTION_SPECIES=F({[Symbol.species]:NP});
const KEYS=['version','boundRowDigest','anchorOutcomeDigest','expectedOutcomeDigest','proposedOutcomeDigest','contextDigest','transactionHash',
 'maximumPendingReconciliations','beforePhase','beforeObservations','afterPhase','afterObservations','authority'];
function fail(){throw new TypeError('ORIGINAL_FUNDING_TRANSITION_WITNESS');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||K(v).length!==names.length)fail();
 const out={};for(const k of names){const d=D(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function pin(v){if(typeof v!=='string'||/^sha256:[0-9a-f]{64}$/.exec(v)?.[0]!==v)fail();}
function integer(v,max){if(!Number.isSafeInteger(v)||Object.is(v,-0)||v<0||v>max)fail();}
function contextDigest(r){const v={};for(const key of ['version','resourceUrl','issuedFrameJson','serviceSelectionJson','originalHeader','transactionHash','boundJson','maximumPendingReconciliations'])v[key]=r[key];
 return 'sha256:'+sha256Hex(['zenon-x402:funding-witness-context:v1',v]);}
function same(a,b){return !!a&&!!b&&K(a).length===K(b).length&&K(b).every(k=>Object.hasOwn(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&D(Object.prototype,'toJSON')===undefined&&same(D(PP,'then'),TD)&&same(D(PP,'constructor'),CD)&&same(D(NP,Symbol.species),SD);}
function safeDiscard(v){try{if(invariant()&&types.isPromise(v)&&!types.isProxy(v)&&Object.getPrototypeOf(v)===PP&&D(v,'then')===undefined&&D(v,'constructor')===undefined)A(THEN,v,[()=>{},()=>{}]);}catch{}}
function reject(){const p=new NP((yes,no)=>no(new TypeError('ORIGINAL_FUNDING_TRANSITION_WITNESS')));Object.defineProperty(p,'constructor',{value:REJECTION_SPECIES});A(THEN,p,[()=>{},()=>{}]);return p;}

/** Bounded candidate intent, never a receipt that the SQL transition committed. */
export function inspectOfficialFundingTransitionWitness(raw){
 if(arguments.length!==1||typeof raw!=='string'||Buffer.byteLength(raw)>4096||Buffer.from(raw).toString('utf8')!==raw)fail();
 let value;try{value=JSON.parse(raw);}catch{fail();}const r=fields(value,KEYS);
 if(r.version!==1||r.authority!=='NONE')fail();
 for(const k of ['boundRowDigest','anchorOutcomeDigest','expectedOutcomeDigest','proposedOutcomeDigest','contextDigest'])pin(r[k]);
 if(r.expectedOutcomeDigest===r.proposedOutcomeDigest||typeof r.transactionHash!=='string'||/^[0-9a-f]{64}$/.exec(r.transactionHash)?.[0]!==r.transactionHash)fail();
 integer(r.maximumPendingReconciliations,16);integer(r.beforeObservations,r.maximumPendingReconciliations);integer(r.afterObservations,r.maximumPendingReconciliations);
 if(r.beforePhase==='PENDING'){
  if(r.beforeObservations>=r.maximumPendingReconciliations||r.afterPhase!=='OBSERVATION_IN_FLIGHT'||r.afterObservations!==r.beforeObservations+1)fail();
 }else if(r.beforePhase==='FIRST_IN_FLIGHT'){
  // The original first attempt was already durably entered. Recovering its
  // existing journal result consumes no continuation observation.
  if(r.beforeObservations!==0||r.afterObservations!==0||!['PENDING','SETTLED'].includes(r.afterPhase))fail();
 }else if(r.beforePhase==='OBSERVATION_IN_FLIGHT'){
  if(r.beforeObservations<1||r.afterObservations!==r.beforeObservations||!['PENDING','SETTLED','EXHAUSTED'].includes(r.afterPhase)
      ||r.afterPhase==='PENDING'&&r.afterObservations>=r.maximumPendingReconciliations
      ||r.afterPhase==='EXHAUSTED'&&r.afterObservations!==r.maximumPendingReconciliations)fail();
 }else fail();
 if(canonicalJson(r)!==raw)fail();return F(r);
}
export function createOfficialFundingTransitionWitness(expectation,expected,proposed){
 if(arguments.length!==3)fail();const anchor=captureIssuedFundingGrantRecoveryExpectation(expectation),before=inspectOfficialFundingPostCustodyRecord(expected),after=requireOfficialFundingPostCustodyTransition(expected,proposed);
 const raw=canonicalJson({version:1,boundRowDigest:anchor.boundRowDigest,anchorOutcomeDigest:anchor.outcomeRecordDigest,
  expectedOutcomeDigest:officialFundingPostCustodyRecordDigest(expected),proposedOutcomeDigest:officialFundingPostCustodyRecordDigest(proposed),contextDigest:contextDigest(before),
  transactionHash:before.transactionHash,maximumPendingReconciliations:before.maximumPendingReconciliations,beforePhase:before.phase,beforeObservations:before.observations,
  afterPhase:after.phase,afterObservations:after.observations,authority:'NONE'});
 inspectOfficialFundingTransitionWitness(raw);return raw;
}
/** Anchor is selected independently; file contents cannot select a new anchor.
 * The latest intent permits matching only its BEFORE or PROPOSED digest.
 * A checksum match is recorded history, not owner transfer or commit authority. */
export function captureOfficialFundingTransitionWitnessChain(values,expectation){
 if(arguments.length!==2)fail();const anchor=captureIssuedFundingGrantRecoveryExpectation(expectation);
 if(values===null||typeof values!=='object'||types.isProxy(values)||Object.getPrototypeOf(values)!==Array.prototype)fail();
 const length=D(values,'length')?.value;if(!Number.isSafeInteger(length)||length<1||length>33||K(values).length!==length+1)fail();
 const pending=new Map();let original=null;
 for(let i=0;i<length;i++){const d=D(values,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();const r=inspectOfficialFundingTransitionWitness(d.value);
  if(r.boundRowDigest!==anchor.boundRowDigest||r.anchorOutcomeDigest!==anchor.outcomeRecordDigest||pending.has(r.expectedOutcomeDigest))fail();
  if(original===null)original=r;else for(const k of ['transactionHash','contextDigest','maximumPendingReconciliations'])if(original[k]!==r[k])fail();
  pending.set(r.expectedOutcomeDigest,F({raw:d.value,record:r}));}
 let at=anchor.outcomeRecordDigest,prior=null;const chain=[],visited=new Set([at]);
 while(pending.has(at)){const item=pending.get(at),r=item.record;pending.delete(at);
  if(prior!==null&&(r.beforePhase!==prior.afterPhase||r.beforeObservations!==prior.afterObservations))fail();
  if(visited.has(r.proposedOutcomeDigest))fail();visited.add(r.proposedOutcomeDigest);
  chain.push(item);prior=r;at=r.proposedOutcomeDigest;}
 if(pending.size!==0||chain.length!==length)fail();return F(chain);
}
export function projectWitnessedOfficialFundingHistory(expectation,witnesses,actualRecord){
 if(arguments.length!==3)fail();const anchor=captureIssuedFundingGrantRecoveryExpectation(expectation),chain=captureOfficialFundingTransitionWitnessChain(witnesses,anchor),last=chain.at(-1).record;
 const actualDigest=officialFundingPostCustodyRecordDigest(actualRecord);
 const position=actualDigest===last.expectedOutcomeDigest?'BEFORE_LAST_TRANSITION':actualDigest===last.proposedOutcomeDigest?'PROPOSED_VALUE_OBSERVED':null;
 if(position===null)fail();const history=projectOfficialFundingPostCustodyRecord(actualRecord,actualDigest),r=inspectOfficialFundingPostCustodyRecord(actualRecord);
 if(contextDigest(r)!==last.contextDigest||r.transactionHash!==last.transactionHash||r.maximumPendingReconciliations!==last.maximumPendingReconciliations
    ||r.phase!==(position==='BEFORE_LAST_TRANSITION'?last.beforePhase:last.afterPhase)
    ||r.observations!==(position==='BEFORE_LAST_TRANSITION'?last.beforeObservations:last.afterObservations))fail();
 return F({history,recoveryExpectation:F({boundRowDigest:anchor.boundRowDigest,outcomeRecordDigest:actualDigest}),position,witnessCount:chain.length,
  authority:'NONE',originalOperationRepaired:false,commitReceiptRecovered:false,mayResumeObservation:false,mayActivateGrant:false,mayDispatchService:false,
  externalOwnerFencing:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED'});
}

/** Actual original observation owner; a separately retained intent precedes
 * EVERY custody CAS. This adapter does not close its borrowed witness owner. */
export function createWitnessedOriginalFundingJournalObservation(options){
 if(arguments.length!==1||HELD.size>=32||!invariant())fail();
 const c=fields(options,['expectation','serviceSelection','resourceUrl','maximumPendingReconciliations','port','witness']);
 const anchor=captureIssuedFundingGrantRecoveryExpectation(c.expectation),p=fields(c.port,['closeProvider','inspectProvider','loadBound','readOfficialOutcome','compareAndSwap','readJournal']);
 const w=fields(c.witness,['retain','read','readAll']);for(const fn of Object.values(w))if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();
 if(new Set([...Object.values(p),...Object.values(w)]).size!==9)fail();
 const selection=captureIssuedFundingPostServiceSelection(c.serviceSelection),resourceUrl=captureOfficialFundingPostHttpsRoute(c.resourceUrl).resourceUrl;
 let held=false,closed=false,reading=false,writes=0,witnessWrites=0,witnessReads=0,lastWitness=null;const attempted=[];
 const retained=F(()=>[p,w,anchor,lastWitness,attempted]);
 function hold(v){held=true;HELD.add(retained);if(v!==undefined){attempted.push(v);safeDiscard(v);}fail();}
 function current(){if(closed||held||reading||!invariant())hold();}
 function readWitness(raw){witnessReads++;let seen;try{seen=A(w.read,undefined,[raw]);}catch{hold();}if(seen!==raw)hold(seen);return seen;}
 const compareAndSwap=F(function compareAndSwap(expected,proposed){
  if(arguments.length!==2)fail();current();lastWitness=createOfficialFundingTransitionWitness(anchor,expected,proposed);witnessWrites++;
  let ack;try{ack=A(w.retain,undefined,[lastWitness]);}catch{hold();}if(ack!==lastWitness)hold(ack);current();readWitness(lastWitness);current();
  writes++;try{ack=A(p.compareAndSwap,undefined,[expected,proposed]);}catch{hold();}if(ack!==proposed)hold(ack);current();readWitness(lastWitness);current();return ack;
 });
 const owner=createOriginalFundingJournalObservation(F({expectation:anchor,serviceSelection:selection,resourceUrl,maximumPendingReconciliations:c.maximumPendingReconciliations,
  port:F({...p,compareAndSwap})}));
 const observe=F(function observe(){if(arguments.length!==0||reading||closed||held||!invariant())return reject();return owner.observe();});
 const recoverFirstResult=F(function recoverFirstResult(){if(arguments.length!==0||reading||closed||held||!invariant())return reject();return owner.recoverFirstResult();});
 const inspectRecordedHistory=F(function inspectRecordedHistory(){
  if(arguments.length!==0||reading||closed)fail();const before=owner.snapshot();if(before.active||!before.providerClosed)fail();reading=true;
  const scoped=fn=>F(()=>{if(closed)hold();const value=A(fn,undefined,[]);if(closed)hold(value);return value;});
  try{const result=inspectWitnessedOfficialFundingStoreHistory(F({expectation:anchor,serviceSelection:selection,resourceUrl,maximumPendingReconciliations:c.maximumPendingReconciliations,
    port:F({loadBound:scoped(p.loadBound),readOfficialOutcome:scoped(p.readOfficialOutcome),readWitnesses:scoped(w.readAll)})}));if(closed)hold();return result;}
  finally{reading=false;}
 });
 const close=F(function close(){if(arguments.length!==0)return reject();closed=true;const duringRead=reading;if(duringRead){held=true;HELD.add(retained);}
  const receipt=owner.close();if(held){safeDiscard(receipt);return reject();}return receipt;});
 const snapshot=F(function snapshot(){if(arguments.length!==0)fail();return F({...owner.snapshot(),transitionWitness:F({held,closed,reading,writes,witnessWrites,witnessReads,
  witnessRetained:lastWitness!==null,borrowedWitnessClosed:false,authority:'NONE'})});});
 return F({...owner,observe,recoverFirstResult,close,snapshot,inspectRecordedHistory});
}
/** Synchronous read-only bridge. No provider opening, owner acquisition or CAS.
 * Full BOUND rows surround both outcome and witness reads. Caller owns lifetime. */
export function inspectWitnessedOfficialFundingStoreHistory(options){
 if(arguments.length!==1)fail();const c=fields(options,['expectation','serviceSelection','resourceUrl','maximumPendingReconciliations','port']);
 const anchor=captureIssuedFundingGrantRecoveryExpectation(c.expectation),selection=captureIssuedFundingPostServiceSelection(c.serviceSelection),route=captureOfficialFundingPostHttpsRoute(c.resourceUrl);
 integer(c.maximumPendingReconciliations,16);
 const p=fields(c.port,['loadBound','readOfficialOutcome','readWitnesses']);for(const fn of Object.values(p))if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();
 if(new Set(Object.values(p)).size!==3)fail();
 const read=fn=>{let v;try{v=A(fn,undefined,[]);}catch{fail();}if(types.isPromise(v)){safeDiscard(v);fail();}return v;};
 const before=captureIssuedFundingGrantRecoveryRows(read(p.loadBound),selection,route.resourceUrl,anchor),raw=read(p.readOfficialOutcome),values=read(p.readWitnesses);
 const firstChain=captureOfficialFundingTransitionWitnessChain(values,anchor),chainJson=canonicalJson(firstChain);
 const result=projectWitnessedOfficialFundingHistory(anchor,values,raw),context=captureOfficialFundingPostCustodyContext({issuedFrame:before.row.issue.frame,resourceUrl:route.resourceUrl,
  serviceSelection:selection,maximumPendingReconciliations:c.maximumPendingReconciliations});
 const r=requireOfficialFundingPostCustodyContext(raw,context),b=before.row.binding;
 if(r.boundJson!==canonicalJson({status:'BOUND',transactionHash:b.transactionHash,observerRecordKey:b.observerRecordKey,observerFileName:b.observerFileName})
    ||canonicalJson(JSON.parse(Buffer.from(r.originalHeader,'base64').toString('utf8')))!==canonicalJson(b.publication?.paymentPayload))fail();
 const again=read(p.readOfficialOutcome),witnessAgain=read(p.readWitnesses),last=captureIssuedFundingGrantRecoveryRows(read(p.loadBound),selection,route.resourceUrl,anchor);
 if(again!==raw||last.rowJson!==before.rowJson||canonicalJson(captureOfficialFundingTransitionWitnessChain(witnessAgain,anchor))!==chainJson)fail();
 return result;
}
