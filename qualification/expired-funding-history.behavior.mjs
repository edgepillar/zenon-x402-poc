// Actual existing recovery/admission/command owners; declared memory ports only.
// No native store, real authentication, socket, signature or process restart.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { createIssuedFundingPostSdkResourceBinding } from '../src/x402-issued-funding-post-sdk-resource.js';
import { createOfficialFundingPostExpiredRecord, officialFundingPostCustodyRecordDigest } from '../src/official-funding-post-custody-record.js';
import { issuedFundingGrantBoundRowDigest } from '../src/x402-issued-funding-grant-recovery.js';
import { issuedOriginalGrantAdmissionDataFixture as original } from './issued-original-grant-admission.behavior.mjs';
import { issuedProviderCliDataFixture as control } from './issued-provider-cli.behavior.mjs';

const F=Object.freeze,checks=[],clone=v=>JSON.parse(JSON.stringify(v));
function check(id,run){checks.push(F({id,run}));}
function receipt(pins){return F({expiredFundingVersion:1,status:'FUNDED_NO_NEW_GRANT',...pins,
 sourceSettlementId:'settlement_'+'6'.repeat(64),eligibilityObservedAt:pins.expiresAt+1,paymentAt:null,
 grantActivation:'NOT_ENTERED_THIS_OPERATION',grantExistence:'NOT_QUERIED',deliveryLiability:'RECONCILIATION_REQUIRED',
 serviceDelivery:'NOT_ESTABLISHED',compensation:'NOT_ESTABLISHED',verification:'SELECTED_ORIGINAL_VERIFIER',
 mayStartPayment:false,maySignPayment:false,mayDispatchService:false,mayActivateGrant:false,mayStartCompensation:false,authority:'NONE'});}
async function fixture(options={}){
 let value=null,oldRecord=null;
 const configure=(config,s,x)=>{
  const selected=createIssuedFundingPostSdkResourceBinding(x.d.config.issuedFrame,x.d.config.resourceUrl).selection();
  const pins=F({transactionHash:x.d.bound.transactionHash,fundingCommitment:'sha256:'+selected.resource.tags[1]+selected.resource.tags[2],expiresAt:20000});
  value=receipt(pins);oldRecord=s.raw;
  x.row.issue.challenge={fundingCommitment:pins.fundingCommitment,activationIntent:{expiresAt:pins.expiresAt}};
  s.raw=createOfficialFundingPostExpiredRecord(s.raw,value,pins);x.raw=s.raw;
  if(options.challenge)options.challenge(x.row.issue);
  x.expected={boundRowDigest:issuedFundingGrantBoundRowDigest(x.row),outcomeRecordDigest:officialFundingPostCustodyRecordDigest(s.raw)};
  config.expectation=x.expected;
 };
 const f=await original({...options,provider:{...(options.provider??{}),configure},
  ...(options.configure?{configure:c=>options.configure(c,{oldRecord,value})}:{})});
 return {...f,value,oldRecord};
}
function noAuthority(result){
 assert.equal(result.originalFundingHistoryVersion,1);assert.equal(result.historicalObservation,true);
 assert.equal(result.verification,'STORED_HISTORY_NOT_REVALIDATED');assert.equal(result.authority,'NONE');
 for(const k of ['mayStartPayment','maySignPayment','mayActivateGrant','mayDispatchService','mayStartCompensation'])assert.equal(result[k],false);
 assert.equal(result.grantHistory.authority,'NONE');assert.equal(result.expiredFundingHistory.authority,'NONE');
 assert.equal(result.expiredFundingHistory.verification,'STORED_HISTORY_NOT_REVALIDATED');
 assert.equal(result.expiredFundingHistory.receipt.deliveryLiability,'RECONCILIATION_REQUIRED');
 assert.equal(result.expiredFundingHistory.receipt.compensation,'NOT_ESTABLISHED');
}
function noEffects(f,before){assert.equal(canonicalJson(f.ledger.m.exportState()),before);assert.equal(f.t.admissions+f.t.resultAdmissions+f.s.sessions+f.s.replaySessions+f.s.debits+f.s.executions+f.f.s.SDK+f.f.s.writes,0);}
async function refused(f){assert.throws(()=>f.owner.inspectOriginalCommittedServiceGrant());assert.equal(f.owner.snapshot().held,true);assert.equal(f.t.admissions+f.t.resultAdmissions,0);await assert.rejects(f.owner.close());}
function line(operation,id=operation){return canonicalJson({version:1,id,operation,argument:null});}

check('expired-funding-history-preserves-obligation-when-no-grant-was-recorded',async()=>{
 const f=await fixture(),before=canonicalJson(f.ledger.m.exportState()),r=f.owner.inspectOriginalCommittedServiceGrant();noAuthority(r);
 assert.equal(r.grantHistory.status,'NOT_RECORDED');assert.equal(r.grantHistory.record,null);assert.deepEqual(r.expiredFundingHistory.receipt,f.value);
 assert.equal(r.expiredFundingHistory.recordDigest,f.configuration.expectation.outcomeRecordDigest);noEffects(f,before);await f.owner.close();
});
check('expired-funding-history-keeps-existing-grant-counters-separate-from-liability',async()=>{
 const f=await fixture();f.ledger.activate();const before=canonicalJson(f.ledger.m.exportState()),r=f.owner.inspectOriginalCommittedServiceGrant();noAuthority(r);
 assert.equal(r.grantHistory.status,'RECORDED');assert.equal(r.grantHistory.record.totalUnits,100);assert.equal(r.grantHistory.record.availableUnits,100);
 assert.equal(r.expiredFundingHistory.receipt.grantExistence,'NOT_QUERIED');noEffects(f,before);await f.owner.close();
});
check('expired-funding-history-preserves-revocation-and-original-absolute-expiries',async()=>{
 const f=await fixture();f.ledger.activate();const g=f.ledger.m.exportState().grants[0];f.ledger.m.revokeGrant({grantId:g.grantId});
 const before=canonicalJson(f.ledger.m.exportState()),r=f.owner.inspectOriginalCommittedServiceGrant();noAuthority(r);
 assert.equal(r.grantHistory.record.storedLifecycle,'REVOKED');assert.equal(r.grantHistory.record.expiresAt,g.expiresAt);
 assert.equal(r.expiredFundingHistory.receipt.expiresAt,20000);assert.equal(r.expiredFundingHistory.receipt.eligibilityObservedAt,20001);noEffects(f,before);await f.owner.close();
});
check('expired-funding-history-v1-original-keeps-the-existing-closed-grant-history-bytes',async()=>{
 const f=await original(),r=f.owner.inspectOriginalCommittedServiceGrant();assert.equal(r.status,'NOT_RECORDED');
 assert.equal(Object.hasOwn(r,'originalFundingHistoryVersion'),false);assert.equal(Object.hasOwn(r,'expiredFundingHistory'),false);
 assert.equal(canonicalJson(r),canonicalJson(f.ledger.m.readOriginalFundingGrant(f.t.identity)));await f.owner.close();
});
check('expired-funding-history-requires-the-pinned-original-challenge-before-lookup',async()=>{
 const f=await fixture({challenge(issue){delete issue.challenge;}});await refused(f);assert.equal(f.t.lookups,0);
});
check('expired-funding-history-rejects-receipt-expiry-that-differs-from-the-original-challenge',async()=>{
 const f=await fixture({challenge(issue){issue.challenge.activationIntent.expiresAt++;}});await refused(f);assert.equal(f.t.lookups,0);
});
check('expired-funding-history-requires-the-original-challenge-funding-commitment',async()=>{
 const f=await fixture({challenge(issue){issue.challenge.fundingCommitment='sha256:'+'f'.repeat(64);}});await refused(f);assert.equal(f.t.lookups,0);
});
check('expired-funding-history-old-v1-digest-cannot-silently-select-the-new-record',async()=>{
 let old=null;const f=await fixture({configure(c,s){old=c.expectation.outcomeRecordDigest;c.expectation={...c.expectation,outcomeRecordDigest:officialFundingPostCustodyRecordDigest(s.oldRecord)};}});
 assert.notEqual(old,f.configuration.expectation.outcomeRecordDigest);await refused(f);assert.equal(f.t.lookups,0);
});
check('expired-funding-history-after-lookup-row-drift-is-withheld',async()=>{
 const f=await fixture({lookup(base,owner,s,id){const r=base.ledger.m.readOriginalFundingGrant(id);base.f.s.rows=[];return r;}});await refused(f);assert.equal(f.t.lookups,1);
});
check('expired-funding-history-after-lookup-record-drift-is-withheld',async()=>{
 const f=await fixture({lookup(base,owner,s,id){const r=base.ledger.m.readOriginalFundingGrant(id);base.f.s.raw+='\n';return r;}});await refused(f);assert.equal(f.t.lookups,1);
});
check('expired-funding-history-close-during-lookup-cannot-publish-a-late-obligation',async()=>{
 let closing;const f=await fixture({lookup(base,owner,s,id){closing=owner.close();return base.ledger.m.readOriginalFundingGrant(id);}});await refused(f);await assert.rejects(closing);
});
check('expired-funding-history-thenable-lookup-does-not-run-hooks-or-retry',async()=>{
 let hooks=0;const opaque=Object.defineProperty({},'then',{get(){hooks++;throw Error();}});
 const f=await fixture({lookup(){return opaque;}});await refused(f);assert.equal(hooks,0);assert.equal(f.t.lookups,1);
});
check('expired-funding-history-remains-detached-and-deeply-frozen',async()=>{
 const f=await fixture(),r=f.owner.inspectOriginalCommittedServiceGrant();noAuthority(r);
 assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.grantHistory)&&Object.isFrozen(r.expiredFundingHistory)&&Object.isFrozen(r.expiredFundingHistory.receipt));
 assert.throws(()=>{r.expiredFundingHistory.receipt.expiresAt++;});assert.throws(()=>{r.mayStartCompensation=true;});await f.owner.close();
});
check('expired-funding-history-shares-the-existing-sixteen-attempt-budget',async()=>{
 const f=await fixture();for(let i=0;i<16;i++)noAuthority(f.owner.inspectOriginalCommittedServiceGrant());assert.throws(()=>f.owner.inspectOriginalCommittedServiceGrant());
 assert.equal(f.owner.snapshot().attempts,16);assert.equal(f.t.lookups,16);assert.equal(f.owner.snapshot().held,false);assert.equal(f.t.admissions,0);await f.owner.close();
});
check('expired-funding-history-existing-control-operation-returns-the-closed-history',async()=>{
 const f=await fixture(),c=control({mode:'RECORDED',input:[line('READ_ORIGINAL_GRANT'),line('CLOSE')],inspectOriginal:()=>f.owner.inspectOriginalCommittedServiceGrant()});
 const r=await c.owner.run();assert.equal(r.exitCode,0);assert.deepEqual(c.s.operations,['READ_ORIGINAL_GRANT']);noAuthority(c.s.writes[1].result);
 assert.equal(f.t.admissions+f.t.resultAdmissions,0);await f.owner.close();
});
check('expired-funding-history-lost-command-output-does-not-read-or-admit-again',async()=>{
 const f=await fixture(),c=control({mode:'RECORDED',input:[line('READ_ORIGINAL_GRANT'),line('ADMIT_ORIGINAL')],inspectOriginal:()=>f.owner.inspectOriginalCommittedServiceGrant(),
  write(s){return s.writes.at(-1).operation==='READ_ORIGINAL_GRANT'?Promise.reject(Error('declared output loss')):Promise.resolve(undefined);}});
 const r=await c.owner.run();assert.equal(r.exitCode,4);assert.equal(r.outputOutcomeUnknown,true);assert.deepEqual(c.s.operations,['READ_ORIGINAL_GRANT']);
 assert.equal(f.t.lookups,1);assert.equal(f.t.admissions,0);await f.owner.close();
});
check('expired-funding-history-memory-reconstruction-retains-identical-obligation-and-balances',async()=>{
 const first=await fixture();first.ledger.activate();const state=clone(first.ledger.m.exportState()),r=first.owner.inspectOriginalCommittedServiceGrant();await first.owner.close();
 const next=await fixture({provider:{state}}),before=canonicalJson(next.ledger.m.exportState()),again=next.owner.inspectOriginalCommittedServiceGrant();
 assert.equal(canonicalJson(again),canonicalJson(r));noEffects(next,before);await next.owner.close();
});

export const expiredFundingHistoryDataCases=F([...checks]);
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];let current=null,reported=false;
 function report(){if(reported)return;reported=true;const failed=cases.filter(c=>c.status!=='PASS').length;
  console.log(JSON.stringify({qualification:'G1_G2_EXPIRED_FUNDING_HISTORY_DATA',passed:cases.length-failed,failed,cases,ports:'DECLARED_MEMORY_ONLY',
   nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
   nativePersistence:'NOT_ESTABLISHED',nativeFreshProcess:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED',G1G2:'OPEN'}));if(failed)process.exitCode=1;}
 function unsettled(){if(current!==null){cases.push({id:current,status:'FAIL',error:'UNSETTLED_DECLARED_DATA_PROMISE'});report();}}
 process.once('beforeExit',unsettled);for(const {id,run}of checks){current=id;try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});}current=null;}
 process.off('beforeExit',unsettled);report();
}
