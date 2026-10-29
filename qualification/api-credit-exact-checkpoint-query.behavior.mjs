// Actual combined read core and owner. File/SQL/proof ports are declared DATA;
// read counts do not qualify native latency, physical I/O or process restart.
import assert from 'node:assert/strict';
import { resultInspectionFixture as fixture } from './api-credit-recorded-result-inspection.fixture.mjs';
import { createServiceCreditCustodiedBackendRecoveryCore as core,readServiceCreditExactOriginalBackendRecoveryState as read } from '../src/service-credit-custodied-backend-recovery-core.js';
import { captureApiCreditRecordedResultInspection as project } from '../src/api-credit-recorded-result-inspection.js';
import { runServiceCreditRecoveryInspectionOwner as legacyOwner } from '../src/service-credit-recovery-inspection-owner.js';

const F=Object.freeze,checks=[];function check(id,run){checks.push({id,run});}
async function opened(options){const r=await fixture(options);r.expected=r.manifest();r.store=r.ports.openBackend(r.expected);r.connection=await r.ports.openPayer(r.expected,r.store);return r;}
async function stopped(r){await r.connection.close();r.ports.closeBackend(r.store);}
function query(r,bytes=r.packet.serializedCheckpoint,pins=r.packet.expectedPins){return read(r.connection,r.key,r.input.authorizationHeader,pins,bytes);}
function unchanged(r,before){assert.equal(JSON.stringify(r.model.exportState()),before);assert.equal(r.originalCounts.funding,1);assert.equal(r.originalCounts.grants,1);}

check('exact-checkpoint-branded-read-keeps-the-existing-frozen-client-facade-and-three-argument-method',async()=>{
 const r=await opened(),keys=Reflect.ownKeys(r.connection),before=JSON.stringify(r.model.exportState());
 assert.deepEqual(keys,['readOriginal','readOriginalRecoveryState','readOriginalRecoveryKeys','readOriginalBackendRecoveryState','readOriginalPaymentCheckpoint','snapshot','close']);
 assert.equal(Object.isFrozen(r.connection),true);assert.equal(Object.hasOwn(r.connection,'readExactCheckpoint'),false);
 const ordinary=r.connection.readOriginalBackendRecoveryState(r.key,r.input.authorizationHeader,r.packet.expectedPins);assert.equal(r.checkpointReads,2);
 const exact=query(r);assert.deepEqual(exact,ordinary);assert.equal(r.checkpointReads,4);assert.equal(r.backendReads,2);assert.deepEqual(Reflect.ownKeys(r.connection),keys);
 assert.throws(()=>r.connection.readOriginalBackendRecoveryState(r.key,r.input.authorizationHeader,r.packet.expectedPins,r.packet.serializedCheckpoint));
 unchanged(r,before);await stopped(r);
});
check('exact-checkpoint-product-owner-returns-the-identical-projection-with-two-witness-reads',async()=>{
 const r=await fixture(),golden=project(r.observation(),r.manifest()),before=JSON.stringify(r.model.exportState()),result=await r.run();
 assert.deepEqual(result,golden);assert.equal(r.checkpointReads,2);assert.equal(r.localReads,2);assert.equal(r.backendReads,1);
 assert.equal(r.payerCloseCalls,1);assert.equal(r.backendCloseCalls,1);unchanged(r,before);
});
check('exact-checkpoint-legacy-redacted-owner-retains-its-independent-outer-byte-checks',async()=>{
 const r=await fixture(),result=await legacyOwner({manifest:r.manifest(),authorizationHeader:r.input.authorizationHeader,
  serializedCheckpoint:r.packet.serializedCheckpoint,ports:r.ports,requireOpening:r.guard});
 assert.equal(r.checkpointReads,4);assert.equal(r.backendReads,1);assert.equal(Object.hasOwn(result,'cachedResult'),false);assert.equal(Object.hasOwn(result,'responseJson'),false);
});
check('exact-checkpoint-wrong-independent-bytes-refuse-before-any-original-or-backend-query',async()=>{
 const r=await opened(),before=JSON.stringify(r.model.exportState());assert.throws(()=>query(r,' '+r.packet.serializedCheckpoint));
 assert.equal(r.checkpointReads,1);assert.equal(r.localReads,0);assert.equal(r.backendReads,0);assert.equal(r.connection.snapshot().unavailable,true);
 assert.throws(()=>query(r));assert.equal(r.backendReads,0);unchanged(r,before);await stopped(r);
});
check('exact-checkpoint-malformed-arity-type-empty-and-oversized-input-never-enter-the-reader',async()=>{
 const r=await opened();
 for(const bytes of [null,undefined,1,'','a'.repeat(32769),'x'.repeat(16385)+'\u00e9'.repeat(8192)]){
  if(typeof bytes==='string'&&Buffer.byteLength(bytes)<=32768)continue;
  assert.throws(()=>read(r.connection,r.key,r.input.authorizationHeader,r.packet.expectedPins,bytes));
 }
 assert.throws(()=>read(r.connection,r.key,r.input.authorizationHeader,r.packet.expectedPins));assert.equal(r.checkpointReads+r.backendReads,0);
 assert.equal(query(r).backend.status,'CACHED_SUCCESS');await stopped(r);
});
check('exact-checkpoint-lookalike-and-proxy-connections-cannot-select-or-enter-a-reader',async()=>{
 const r=await opened();let entered=0;const proxy=new Proxy(r.connection,{get(){entered++;throw Error('not entered');},getPrototypeOf(){entered++;throw Error('not entered');}});
 for(const value of [F({...r.connection}),proxy,null,{}])assert.throws(()=>read(value,r.key,r.input.authorizationHeader,r.packet.expectedPins,r.packet.serializedCheckpoint));
 assert.equal(entered+r.checkpointReads+r.backendReads,0);await stopped(r);
});
check('exact-checkpoint-dispatch-enabled-and-pre-v6-cores-have-no-exact-read-brand',async()=>{
 const r=await opened();let dispatches=0;
 const client=F({...r.localClient,submitOriginal:F(()=>{dispatches++;throw Error('not selected');})});
 for(const connection of [core(client,r.backendReader,r.key.grantId,'PAYER_OWNED_BACKEND_BORROWED',true,true,true),
  core(r.localClient,r.backendReader,r.key.grantId,'PAYER_OWNED_BACKEND_BORROWED',false,true,false)])
  assert.throws(()=>read(connection,r.key,r.input.authorizationHeader,r.packet.expectedPins,r.packet.serializedCheckpoint));
 assert.equal(dispatches+r.checkpointReads+r.backendReads,0);await stopped(r);
});
check('exact-checkpoint-closed-connection-cannot-revive-a-branded-reader',async()=>{
 const r=await opened();await r.connection.close();assert.throws(()=>query(r));assert.equal(r.checkpointReads+r.backendReads,0);r.ports.closeBackend(r.store);
});
check('exact-checkpoint-absent-original-still-has-before-and-after-byte-witnesses-with-no-backend-read',async()=>{
 const r=await fixture({absentOriginal:true}),before=JSON.stringify(r.model.exportState()),result=await r.run();
 assert.equal(result.resultAvailable,false);assert.equal(result.status,'CLIENT_ORIGINAL_NOT_RECORDED');assert.equal(r.checkpointReads,2);assert.equal(r.backendReads,0);unchanged(r,before);
});
check('exact-checkpoint-drift-during-an-absent-original-observation-cannot-claim-matched-pins',async()=>{
 const r=await fixture({absentOriginal:true,changedCheckpoint:true});await assert.rejects(r.run());assert.equal(r.checkpointReads,2);assert.equal(r.backendReads,0);
 assert.equal(r.payerCloseCalls,1);assert.equal(r.backendCloseCalls,1);
});
check('exact-checkpoint-post-query-checkpoint-drift-refuses-result-without-repeating-the-query',async()=>{
 const r=await fixture({changedCheckpoint:true});await assert.rejects(r.run());assert.equal(r.checkpointReads,2);assert.equal(r.backendReads,1);assert.equal(r.payerCloseCalls,1);
});
check('exact-checkpoint-mutating-caller-pins-cannot-replace-the-first-frozen-witness',async()=>{
 let pins;const r=await opened({outcome:(value)=>{for(const key of Object.keys(pins))delete pins[key];return value;}});pins=JSON.parse(JSON.stringify(r.packet.expectedPins));
 const result=query(r,r.packet.serializedCheckpoint,pins);assert.equal(result.backend.status,'CACHED_SUCCESS');assert.equal(r.checkpointReads,2);assert.equal(r.backendReads,1);assert.deepEqual(pins,{});await stopped(r);
});
check('exact-checkpoint-reentrant-exact-read-is-busy-and-cannot-replace-the-outer-byte-witness',async()=>{
 let nested=0;const r=await opened({outcome:(value,state)=>{assert.throws(()=>read(state.payer,state.key,state.input.authorizationHeader,state.packet.expectedPins,'different'),/BUSY/);nested++;return value;}});
 const value=query(r);assert.equal(value.backend.status,'CACHED_SUCCESS');assert.equal(nested,1);assert.equal(r.checkpointReads,2);assert.equal(r.backendReads,1);await stopped(r);
});
check('exact-checkpoint-backend-only-cache-keeps-response-null-and-client-uncertainty-with-two-reads',async()=>{
 const r=await fixture({missingResponse:true}),before=JSON.stringify(r.model.exportState()),value=await r.run();assert.equal(value.source,'BACKEND_CACHE');
 assert.equal(value.responseJson,null);assert.equal(value.localReconciliationRequired,true);assert.equal(r.local.uncertainty.submission,true);assert.equal(r.checkpointReads,2);unchanged(r,before);
});
check('exact-checkpoint-known-cache-query-after-100-unit-reconstruction-never-reopens-spending-authority',async()=>{
 const r=await fixture({fullGrant:true}),before=JSON.stringify(r.model.exportState()),result=await r.run(),grant=r.model.getGrant(r.key.grantId);
 assert.equal(result.resultAvailable,true);assert.deepEqual([grant.availableUnits,grant.heldUnits,grant.consumedUnits],[0,0,100]);assert.equal(result.authority,'NONE');
 assert.equal(result.mayDispatchService,false);assert.equal(r.checkpointReads,2);assert.equal(r.backendReads,1);unchanged(r,before);
});

const cases=[];for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
const failed=cases.filter(c=>c.status!=='PASS').length;
console.log(JSON.stringify({qualification:'G1_G2_EXACT_CHECKPOINT_QUERY_DATA',passed:cases.length-failed,failed,cases,
 actualCombinedCoreAndProductOwner:true,declaredSQLProofFileEpochAndChannelPortsOnly:true,inMemoryReferenceReconstructionOnly:true,
 previousRecordedOwnerCheckpointReads:4,currentRecordedOwnerCheckpointReads:2,legacyRedactedOwnerCheckpointReads:4,backendReadsPerExactQuery:1,frozenFacadeMethodsChanged:false,
 nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
 nativeLatencyImprovement:'NOT_ESTABLISHED',nativeIOImprovement:'NOT_ESTABLISHED',nativeContention:'NOT_EXECUTED',nativeReopenAcceptance:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));
if(failed)process.exitCode=1;
