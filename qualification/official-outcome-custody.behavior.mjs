// Actual custody record/context/transition codecs and owner with declared
// memory CAS ports. No SDK, SQLite, key/signature, socket or native entry runs.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { fundingGrantCustodyDataFixture } from './funding-grant-custody.behavior.mjs';
import { restoreOriginalPaymentCheckpoint } from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { captureOfficialFundingPostCustodyContext as context,createOfficialFundingPostEnteredRecord as entered,
 inspectOfficialFundingPostCustodyRecord as inspect,requireOfficialFundingPostCustodyContext as match,
 createOfficialFundingPostObservationRecord as observing,createOfficialFundingPostOutcomeRecord as completed,
 requireOfficialFundingPostCustodyTransition as transition,officialFundingPostCustodyRecordDigest as digest,
 projectOfficialFundingPostCustodyRecord as project } from '../src/official-funding-post-custody-record.js';
import { createOfficialFundingPostOutcomeCustody as custody } from '../src/official-funding-post-outcome-custody.js';

const F=Object.freeze,checks=[],clone=v=>JSON.parse(JSON.stringify(v));
function check(id,run){checks.push({id,run});}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<16;i++)await Promise.resolve();}
export function officialOutcomeCustodyDataFixture(maximum=2){
 const d=fundingGrantCustodyDataFixture(),checkpoint=restoreOriginalPaymentCheckpoint(d.packet.serializedCheckpoint,d.packet.expectedPins);
 const selection={offerId:d.profile.originalFunding.offerId,offerVersion:d.profile.originalFunding.offerVersion,holderId:d.profile.originalFunding.holderId,capabilityCommitment:d.profile.originalFunding.capabilityCommitment};
 // The retained-input fixture uses ordinary JSON insertion order. Actual
 // issued frames require canonical challenge bytes; signed payload bytes are
 // preserved exactly and never rewritten by this DATA fixture.
 const required=JSON.parse(Buffer.from(checkpoint.originalBytes.paymentRequirements,'base64').toString('utf8'));
 const issuedHeader=Buffer.from(canonicalJson(required)).toString('base64');
 const config={issuedFrame:{status:402,paymentRequiredHeader:issuedHeader,body:'Payment Required'},resourceUrl:d.f.resourceUrl,serviceSelection:selection,maximumPendingReconciliations:maximum};
 const bound=F(Object.assign(Object.create(null),{status:'BOUND',transactionHash:d.packet.transactionHash,observerRecordKey:'sha256:'+'c'.repeat(64),observerFileName:'funding-observer-'+d.packet.transactionHash+'.sqlite'}));
 function result(kind='SETTLED',label='original-outcome'){
  const phase={SETTLED:'INTAKE_BOUND_OFFICIAL_SETTLED',PENDING:'INTAKE_BOUND_OFFICIAL_PENDING',EXHAUSTED:'INTAKE_BOUND_OFFICIAL_EXHAUSTED'}[kind];
  const official=kind==='SETTLED'?F({type:'settled',settlement:F({success:true,transaction:d.packet.transactionHash,network:d.row.network})})
   :kind==='PENDING'?F({type:'payment-error',response:F({status:402,body:label,headers:F({})})})
   :F({type:'observed-settlement',settlement:F({success:false,errorReason:'declared-pending',transaction:'',network:d.row.network}),headers:F({})});
  return F({phase,intake:bound,official,transactionHash:d.packet.transactionHash,acknowledgementDomainsIndependent:true,authority:'NONE',grantActivation:'NOT_ESTABLISHED',serviceDelivery:'NOT_ESTABLISHED'});
 }
 return {d,config,selected:context(config),header:checkpoint.originalBytes.paymentPayload,bound,result};
}
function fixture(options={}){
 const d=officialOutcomeCustodyDataFixture(options.maximum??2),s={raw:null,reads:0,writes:0,commits:0,trace:[],sdk:0,observations:0,replies:0},pending=deferred();let owner;
 const port=F({read:F(()=>{s.reads++;s.trace.push('read');return options.read?options.read(s,d,pending,owner):s.raw;}),
  compareAndSwap:F((expected,next)=>{s.writes++;s.trace.push('cas');if(options.cas)return options.cas(s,d,pending,owner,expected,next);
   transition(expected,next);assert.equal(s.raw,expected);s.raw=next;s.commits++;return next;})});
 owner=custody({context:d.config,port});
 function first(kind='SETTLED'){owner.enter(d.header,d.bound);owner.assertCurrent();s.sdk++;s.trace.push('sdk');owner.record(d.result(kind));s.trace.push('reply');s.replies++;}
 function observe(kind='SETTLED'){owner.beginObservation();owner.assertCurrent();s.observations++;s.trace.push('observe');owner.record(d.result(kind));}
 return {d,s,port,owner,pending,first,observe};
}
function unknown(f){const s=f.owner.snapshot();assert.equal(s.held,true);assert.equal(s.logicalBackendRetirementEligible,false);assert.equal(s.authority,'NONE');}

check('official-custody-first-intent-retains-exact-header-without-settlement-or-service-authority',()=>{const d=officialOutcomeCustodyDataFixture(),raw=entered(d.selected,d.header,d.bound),r=inspect(raw);assert.equal(r.phase,'FIRST_IN_FLIGHT');assert.equal(r.outcomeJson,null);assert.equal(r.originalHeader,d.header);assert.equal(r.transactionHash,d.d.packet.transactionHash);assert.equal(r.observations,0);});
check('official-custody-record-is-canonical-closed-and-bounded',()=>{const d=officialOutcomeCustodyDataFixture(),raw=entered(d.selected,d.header,d.bound);for(const bad of [raw+'\n',canonicalJson({...JSON.parse(raw),extra:true}),'x'.repeat(65537)])assert.throws(()=>inspect(bad));});
check('official-custody-context-requires-the-selected-frame-origin-selection-and-budget',()=>{const d=officialOutcomeCustodyDataFixture(),raw=entered(d.selected,d.header,d.bound);assert.equal(match(raw,d.selected).originalHeader,d.header);for(const change of [c=>c.maximumPendingReconciliations=3,c=>c.resourceUrl='https://foreign.invalid/funding',c=>c.serviceSelection.holderId='foreign.holder']){const c=clone(d.config);change(c);assert.throws(()=>match(raw,context(c)));}});
check('official-custody-context-and-outcome-getters-or-proxies-never-run-input-hooks',()=>{const d=officialOutcomeCustodyDataFixture();let hooks=0;const c={...d.config};Object.defineProperty(c,'issuedFrame',{enumerable:true,get(){hooks++;throw Error();}});assert.throws(()=>context(c));assert.throws(()=>context(new Proxy({}, {getOwnPropertyDescriptor(){hooks++;throw Error();}})));const o={...d.result()};Object.defineProperty(o,'official',{enumerable:true,get(){hooks++;throw Error();}});assert.throws(()=>completed(entered(d.selected,d.header,d.bound),o));assert.equal(hooks,0);});
check('official-custody-foreign-original-or-bound-transaction-is-refused-before-storage',()=>{const d=officialOutcomeCustodyDataFixture();assert.throws(()=>entered(d.selected,d.header,{...d.bound,transactionHash:'f'.repeat(64)}));assert.throws(()=>entered(d.selected,Buffer.from('{}').toString('base64'),d.bound));});
check('official-custody-settled-record-preserves-complete-exact-official-data',()=>{const d=officialOutcomeCustodyDataFixture(),a=entered(d.selected,d.header,d.bound),b=completed(a,d.result()),r=inspect(b);assert.equal(r.phase,'SETTLED');assert.equal(r.originalHeader,d.header);assert.equal(r.outcomeJson,canonicalJson(d.result()));assert.equal(transition(a,b).phase,'SETTLED');});
check('official-custody-bound-alone-cannot-create-a-settled-outcome',()=>{const d=officialOutcomeCustodyDataFixture(),a=entered(d.selected,d.header,d.bound);assert.throws(()=>completed(a,d.bound));const o={...d.result(),official:F({type:'settled',settlement:F({success:false})})};assert.throws(()=>completed(a,o));});
check('official-custody-reserves-each-observation-before-recording-its-outcome',()=>{const d=officialOutcomeCustodyDataFixture(),a=completed(entered(d.selected,d.header,d.bound),d.result('PENDING')),b=observing(a);assert.equal(inspect(b).phase,'OBSERVATION_IN_FLIGHT');assert.equal(inspect(b).observations,1);assert.equal(transition(a,b).phase,'OBSERVATION_IN_FLIGHT');assert.throws(()=>completed(a,d.result()));const c=completed(b,d.result('PENDING')),e=observing(c),last=completed(e,d.result('EXHAUSTED'));assert.equal(inspect(last).phase,'EXHAUSTED');assert.equal(inspect(last).observations,2);assert.throws(()=>observing(last));});
check('official-custody-no-counter-policy-header-or-terminal-rewrite-is-accepted',()=>{const d=officialOutcomeCustodyDataFixture(),a=entered(d.selected,d.header,d.bound),b=completed(a,d.result());assert.throws(()=>transition(b,a));assert.throws(()=>transition(a,canonicalJson({...JSON.parse(b),maximumPendingReconciliations:3})));assert.throws(()=>completed(b,d.result()));assert.throws(()=>completed(a,d.result('EXHAUSTED')));});
check('official-custody-budget-zero-keeps-pending-without-granting-an-observation',()=>{const d=officialOutcomeCustodyDataFixture(0),a=completed(entered(d.selected,d.header,d.bound),d.result('PENDING'));assert.equal(inspect(a).observations,0);assert.throws(()=>observing(a));});
check('official-custody-projection-checks-independent-digest-before-parsing',()=>{const saved=JSON.parse;let calls=0;JSON.parse=()=>{calls++;throw Error();};try{assert.throws(()=>project('{invalid','sha256:'+'0'.repeat(64)));assert.equal(calls,0);}finally{JSON.parse=saved;}});
check('official-custody-settled-history-never-authorizes-sdk-grant-service-or-payment',()=>{const d=officialOutcomeCustodyDataFixture(),raw=completed(entered(d.selected,d.header,d.bound),d.result()),r=project(raw,digest(raw));assert.equal(r.phase,'SETTLED');assert.equal(r.authority,'NONE');assert.equal(r.originalHeader,d.header);for(const k of ['mayEnterSdk','mayStartFunding','mayResumeObservation','mayActivateGrant','mayDispatchService'])assert.equal(r[k],false);});
check('official-custody-inflight-history-remains-inflight-after-projection',()=>{const d=officialOutcomeCustodyDataFixture(),raw=entered(d.selected,d.header,d.bound);assert.equal(project(raw,digest(raw)).phase,'FIRST_IN_FLIGHT');assert.throws(()=>project(raw,'sha256:'+'0'.repeat(64)));});
check('official-custody-intent-and-readback-precede-one-declared-sdk-entry',()=>{const f=fixture();f.first();assert.equal(f.s.sdk,1);assert.equal(f.s.replies,1);assert.ok(f.s.trace.indexOf('cas')<f.s.trace.indexOf('sdk'));assert.ok(f.s.trace.lastIndexOf('cas')<f.s.trace.indexOf('reply'));assert.equal(inspect(f.s.raw).phase,'SETTLED');assert.equal(f.owner.snapshot().writes,2);});
check('official-custody-existing-record-is-not-another-sdk-claim',()=>{const f=fixture();f.first();const other=custody({context:f.d.config,port:f.port});assert.throws(()=>other.enter(f.d.header,f.d.bound));assert.equal(f.s.sdk,1);assert.equal(f.s.commits,2);});
check('official-custody-strict-cas-refuses-a-second-identical-proposal-after-stale-read',()=>{const d=officialOutcomeCustodyDataFixture();let row=null,commits=0,stale=false;const port=F({read:F(()=>stale?null:row),compareAndSwap:F((old,next)=>{assert.equal(row,old);row=next;commits++;return next;})}),a=custody({context:d.config,port}),b=custody({context:d.config,port});a.enter(d.header,d.bound);stale=true;assert.throws(()=>b.enter(d.header,d.bound));assert.equal(commits,1);assert.equal(inspect(row).phase,'FIRST_IN_FLIGHT');assert.equal(b.snapshot().held,true);});
check('official-custody-lost-intent-ack-preserves-written-intent-with-no-sdk-entry',()=>{const f=fixture({cas(s,d,p,o,expected,next){s.raw=next;s.commits++;throw Error('declared lost ack');}});assert.throws(()=>f.first());unknown(f);assert.equal(f.s.sdk,0);assert.equal(f.s.writes,1);assert.equal(inspect(f.s.raw).phase,'FIRST_IN_FLIGHT');});
check('official-custody-nonvoid-intent-ack-is-not-repaired-by-a-matching-row',()=>{const f=fixture({cas(s,d,p,o,expected,next){s.raw=next;s.commits++;return true;}});assert.throws(()=>f.first());unknown(f);assert.equal(f.s.reads,1);assert.equal(f.s.sdk,0);assert.throws(()=>f.first());assert.equal(f.s.writes,1);});
check('official-custody-pending-ack-is-not-joined-by-a-read-or-late-authority',async()=>{const f=fixture({cas(s,d,p,o,expected,next){s.raw=next;return p.promise;}});assert.throws(()=>f.first());unknown(f);assert.equal(f.s.reads,1);f.pending.resolve(f.s.raw);await flush();assert.throws(()=>f.first());assert.equal(f.s.sdk,0);assert.equal(f.s.writes,1);});
check('official-custody-missing-or-changed-readback-prevents-sdk-entry',()=>{const f=fixture({read(s){return s.reads===1?null:null;},cas(s,d,p,o,e,n){s.raw=n;return n;}});assert.throws(()=>f.first());unknown(f);assert.equal(f.s.sdk,0);assert.equal(f.s.writes,1);});
check('official-custody-opaque-read-never-falls-back-to-empty-state',async()=>{const f=fixture({read(s,d,p){return p.promise;}});assert.throws(()=>f.first());unknown(f);assert.equal(f.s.writes,0);f.pending.resolve(null);await flush();assert.throws(()=>f.first());assert.equal(f.s.writes,0);});
check('official-custody-reentrant-close-during-claim-does-not-grant-sdk-entry',()=>{const f=fixture({cas(s,d,p,o,e,n){s.raw=n;s.commits++;o.close();return n;}});assert.throws(()=>f.first());unknown(f);assert.equal(f.s.sdk,0);assert.equal(f.s.writes,1);assert.equal(f.owner.snapshot().closed,true);});
check('official-custody-result-ack-loss-keeps-original-and-prevents-response-replay',()=>{const f=fixture({cas(s,d,p,o,e,n){s.raw=n;s.commits++;if(s.writes===2)throw Error('declared outcome ack loss');return n;}});assert.throws(()=>f.first());unknown(f);assert.equal(f.s.sdk,1);assert.equal(f.s.replies,0);assert.equal(inspect(f.s.raw).phase,'SETTLED');assert.throws(()=>f.owner.assertCurrent());assert.equal(f.s.sdk,1);});
check('official-custody-malformed-sdk-result-latches-unknown-without-a-replacement-result',()=>{const f=fixture();f.owner.enter(f.d.header,f.d.bound);assert.throws(()=>f.owner.record({phase:'SETTLED'}));unknown(f);assert.throws(()=>f.owner.record(f.d.result()));assert.equal(f.s.writes,1);assert.equal(inspect(f.s.raw).phase,'FIRST_IN_FLIGHT');});
check('official-custody-promise-sdk-result-rejection-is-observed-without-repair',async()=>{const f=fixture();f.owner.enter(f.d.header,f.d.bound);assert.throws(()=>f.owner.record(Promise.reject(Error('declared result'))));await flush();unknown(f);assert.throws(()=>f.owner.record(f.d.result()));assert.equal(f.s.writes,1);});
check('official-custody-current-row-change-refuses-outcome-and-another-first-entry',()=>{const f=fixture();f.owner.enter(f.d.header,f.d.bound);f.s.raw=null;assert.throws(()=>f.owner.record(f.d.result()));unknown(f);assert.throws(()=>f.owner.enter(f.d.header,f.d.bound));assert.equal(f.s.writes,1);});
check('official-custody-observation-reservation-precedes-the-declared-callback',()=>{const f=fixture();f.first('PENDING');f.observe();assert.equal(f.s.sdk,1);assert.equal(f.s.observations,1);assert.equal(inspect(f.s.raw).observations,1);assert.equal(inspect(f.s.raw).phase,'SETTLED');});
check('official-custody-lost-observation-claim-ack-cannot-repeat-the-callback',()=>{const f=fixture({cas(s,d,p,o,e,n){s.raw=n;s.commits++;if(s.writes===3)throw Error('declared observation ack');return n;}});f.first('PENDING');assert.throws(()=>f.observe());unknown(f);assert.equal(f.s.observations,0);assert.equal(inspect(f.s.raw).phase,'OBSERVATION_IN_FLIGHT');assert.throws(()=>f.observe());assert.equal(f.s.writes,3);});
check('official-custody-observation-outcome-loss-retains-the-budget-reservation',()=>{const f=fixture({cas(s,d,p,o,e,n){s.raw=n;s.commits++;if(s.writes===4)throw Error('declared observation result');return n;}});f.first('PENDING');assert.throws(()=>f.observe());unknown(f);assert.equal(f.s.observations,1);assert.equal(inspect(f.s.raw).observations,1);assert.equal(inspect(f.s.raw).phase,'SETTLED');assert.throws(()=>f.observe());});
check('official-custody-exhaustion-does-not-renew-the-first-or-observer-budget',()=>{const f=fixture({maximum:1});f.first('PENDING');f.observe('EXHAUSTED');assert.throws(()=>f.observe());assert.throws(()=>f.first());assert.equal(f.s.sdk,1);assert.equal(f.s.observations,1);assert.equal(inspect(f.s.raw).phase,'EXHAUSTED');});
check('official-custody-exported-checksum-is-explicitly-an-independent-pin-candidate',()=>{const f=fixture();f.first();const r=f.owner.exportRecordedState();assert.equal(r.independentPinRequired,true);assert.equal(r.recordJson,f.s.raw);assert.equal(r.authority,'NONE');assert.equal(r.mayEnterSdk,false);});
check('official-custody-close-revokes-operations-without-closing-borrowed-storage',()=>{const f=fixture();f.first();const count=f.s.reads+f.s.writes;assert.equal(f.owner.close(),undefined);assert.throws(()=>f.owner.assertCurrent());assert.throws(()=>f.owner.exportRecordedState());assert.equal(f.s.reads+f.s.writes,count);assert.equal(f.owner.snapshot().backend,'BORROWED_NOT_CLOSED');assert.equal(f.owner.snapshot().logicalBackendRetirementEligible,true);});

export const officialOutcomeCustodyDataCases=F([...checks]);
if(process.argv[1]!==undefined&&fileURLToPath(import.meta.url)===process.argv[1]){
 const cases=[];let current=null,reported=false;
 function report(){if(reported)return;reported=true;const failed=cases.filter(r=>r.status!=='PASS').length;
  console.log(JSON.stringify({qualification:'G2_OFFICIAL_FUNDING_POST_OUTCOME_CUSTODY_DATA',passed:cases.length-failed,failed,cases,
   actualRecordContextTransitionAndCustody:true,custodyAndSdkCallMarkers:'DECLARED_MEMORY_ONLY',signatureData:'UNAUTHENTICATED_EXISTING_FIELDS',
   nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
   nativeDurability:'NOT_ESTABLISHED',providerRestart:'NOT_IMPLEMENTED_BY_THIS_CUSTODY_PREREQUISITE',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;}
 function unsettled(){if(current!==null){cases.push({id:current,status:'FAIL',error:'UNSETTLED_DECLARED_DATA_PROMISE'});report();}}
 process.once('beforeExit',unsettled);
 for(const {id,run}of checks){current=id;try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});}current=null;}
 process.off('beforeExit',unsettled);report();
}
