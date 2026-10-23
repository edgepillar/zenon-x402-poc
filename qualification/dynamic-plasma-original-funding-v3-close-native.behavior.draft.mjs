/*
 * NOT EXECUTED. Six actual V3 + actual SDK/Noble + native V6 SQLite cases.
 * Existing V2 fixture DATA/signing helpers are reused unchanged, never its old
 * application body or old preload/profile. Actual V3 and retained-read session
 * are selected below; read/fetch callbacks are synthetic, not native HTTPS.
 * Per fresh managed task: six new V6 paths, four independent pin files, one
 * ephemeral key, <=four transaction signatures, one in-process fetch callback.
 * No reopening/installer/socket/nonce search, real wallet or chain PREPARE.
 * A rejected close preserves the native store under a strong reference; no
 * direct store.close or success-shaped cleanup overrides the held owner.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
if (process.argv.length !== 3 || process.argv[2] !== process.env.SPV_TASK_SCRATCH
    || process.env.X402_DP_SUBMISSION_V3_CLOSE_SELECTION !== 'six-selected-v3-close-cases-only'
    || process.env.X402_DP_SUBMISSION_V3_CLOSE_NATIVE_MODE !== 'reviewed-native-fchmod'
    || !/^[0-9a-f]{64}$/.test(process.env.X402_DP_SUBMISSION_V3_CLOSE_PROFILE_SHA256 || '')) {
  throw new TypeError('X402_V3_CASE_BODY_REJECTED_BEFORE_EFFECT_IMPORTS');
}
const [
  { createOriginalFundingSubmissionV2FixtureHarness: FIXTURE },
  { createZenonDynamicPlasmaOriginalFundingSubmissionV3: APP },
  { createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6: CREATE_V6 },
  { createRetainedDynamicPlasmaReadSessionCore: READ_SESSION },
  { selectBoundedJsonRpcReadAdmissionProfile: PROFILE, createBoundedJsonRpcReadAdmission: ADMIT },
  { createRetainedAccountStateExchangeGate: ACCOUNT_GATE },
  { encodeOriginalPaymentCheckpoint: ENCODE },
] = await Promise.all([
  import('./dynamic-plasma-original-funding-submission-v2.fixture.draft.mjs'),
  import('../src/zenon/dynamic-plasma-original-funding-submission.js'),
  import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js'),
  import('../src/zenon/dynamic-plasma-retained-read-session-core.js'),
  import('../src/zenon/bounded-json-rpc-read-admission.js'),
  import('../src/zenon/dynamic-plasma-retained-account-exchange-gate.js'),
  import('../src/service-credit-pilot-original-payment-checkpoint.js'),
]);
const h = FIXTURE(process.argv[2]), OPTIONS = { timeout: 5000, concurrency: false };
const frozen = Object.freeze, APPLY = Reflect.apply;
const HELD_STORES = []; // Preserve deliberate/failed HELD fixtures until process exit.
const counters = { createAttempts:0, addressEntries:0, signatureEntries:0, materialEntries:0,
  dpForwardEntries:0, accountForwardEntries:0, fetchEntries:0, readOwnerCloses:0,
  casesEntered:0, casesCompleted:0, heldStores:0, secondaryCleanupFailures:0,recoveryCloseHooks:0 };
const LIMITS = frozen({ createAttempts:6,addressEntries:5,signatureEntries:4,materialEntries:4,
  dpForwardEntries:276,accountForwardEntries:71,fetchEntries:1,readOwnerCloses:18,recoveryCloseHooks:1 });
function count(name){assert.ok(Object.hasOwn(LIMITS,name));assert.ok(++counters[name]<=LIMITS[name]);}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});promise.catch(()=>undefined);return{promise,resolve,reject};}
function refusedRead(){const p=Promise.reject(new Error('SYNTHETIC_READ_CLOSED_OR_EXHAUSTED'));p.catch(()=>undefined);return p;}
async function reachedReadBoundary(reads,operation){
  // An unexpected early rejection must fail this case instead of waiting for
  // a boundary it can no longer reach. Neither path retries the operation.
  await Promise.race([reads.reached,operation.then(()=>{throw new Error('EXPECTED_READ_BOUNDARY_NOT_REACHED');})]);
}
function appError(kind){return problem=>problem instanceof TypeError&&Object.isFrozen(problem)
  &&problem.code==='zenon_dynamic_plasma_original_funding_submission_'+kind;}
function joinError(problem){return problem instanceof TypeError&&Object.isFrozen(problem)&&problem.code==='original_funding_read_close_close_unknown';}
function captureCounters(f){return h.snapshot(f);}
function packetSame(owner,f,phase){
  const i=owner.inspectOriginalFunding();assert.equal(i.originalFundingSubmissionInspectionVersion,3);
  assert.equal(i.phase,phase);assert.equal(i.preparation.packet,f.packet);
  assert.equal(i.preparation.candidate.candidate.accountBlock.hash,f.packet.transactionHash);
  assert.equal(i.authority,'NONE');assert.equal(i.automaticReplay,false);return i;
}
function storeOriginal(store,f,status='PREPARED',revision=1){
  const row=store.load();assert.equal(row.status,status);assert.equal(row.revision,revision);
  assert.equal(row.paymentHeader,f.packet.pair.paymentSignatureHeader);
  assert.equal(row.challengeHeader,f.packet.pair.challenge.paymentRequiredHeader);
  assert.equal(ENCODE(store.getOriginalPaymentCheckpoint(f.pins)),f.packet.serializedCheckpoint);
}
function bindReadSession(f,mode='clean'){
  assert.ok(['clean','uncertain','first-account','sixth-account'].includes(mode));
  const baseReads=f.options.readOptions,owners=[],admissions=[ADMIT('dynamic_plasma_retained_candidate'),
    ADMIT('dynamic_plasma_retained_candidate'),ADMIT('zenon_account_state_retained_candidate')];
  const closeCounts=[0,0,0],closing=[deferred(),deferred(),deferred()],gate=deferred(),reached=deferred();
  let blocked=false;
  for(let index=0;index<3;index++){
    let closed=false;
    const read=frozen(function read(request){
      if(closed||!admissions[index].claim())return refusedRead();
      if(index<2){count('dpForwardEntries');return APPLY(baseReads.transports[index].callRead,undefined,[request]);}
      count('accountForwardEntries');
      const response=APPLY(baseReads.accountExchange,undefined,[request]),packet=JSON.parse(request);
      if(!blocked&&((mode==='first-account'&&packet.id===1)||(mode==='sixth-account'&&packet.id===16))){
        blocked=true;reached.resolve(undefined);return gate.promise;
      }
      return response;
    });
    const close=frozen(function close(){
      if(!closed){
        closed=true;closeCounts[index]++;count('readOwnerCloses');
        if(index===2&&blocked)gate.reject(new Error('SYNTHETIC_ACCOUNT_READ_ABORTED'));
        if(index===0&&mode==='uncertain')closing[index].reject(new Error('SYNTHETIC_READ_CLOSE_UNCERTAIN'));
        else closing[index].resolve(undefined);
      }
      return closing[index].promise;
    });
    if(index<2)owners.push(frozen({transport:frozen({callRead:read}),close,requestBudget:PROFILE('dynamic_plasma_retained_candidate')}));
    else owners.push(frozen({...ACCOUNT_GATE(frozen({exchange:read,close})),requestBudget:PROFILE('zenon_account_state_retained_candidate')}));
  }
  return {session:READ_SESSION(frozen({firstOwner:owners[0],secondOwner:owners[1],accountOwner:owners[2]})),closeCounts,reached:reached.promise};
}
function instrumentWalletAndMaterial(f){
  const wallet=f.options.wallet,material=f.options.materialExchange;
  f.options.wallet={
    getAddress(){count('addressEntries');return APPLY(wallet.getAddress,wallet,[]);},
    sign(block){count('signatureEntries');return APPLY(wallet.sign,wallet,[block]);},
  };
  f.options.materialExchange=function materialExchange(request){count('materialEntries');return APPLY(material,undefined,[request]);};
}
function ack(f){
  const text='BOUND',headers=new Headers({'content-type':'text/plain; charset=utf-8','content-length':String(Buffer.byteLength(text)),
    'cache-control':'private, no-store, max-age=0',vary:'PAYMENT-SIGNATURE','x-content-type-options':'nosniff'});
  return{url:f.storeOptions.resourceUrl,redirected:false,status:202,headers,body:new Response(text,{status:202,headers}).body};
}
async function withFixture(label,mode,run,configureBeforeCreate=null){
  counters.casesEntered++;const f=h.fixture(label);f.label=label;instrumentWalletAndMaterial(f);
  const reads=bindReadSession(f,mode);f.options.readOptions=reads.session.readOptions;
  if(configureBeforeCreate!==null)configureBeforeCreate(f);
  count('createAttempts');const store=CREATE_V6(f.storeOptions);
  let owner=null,primary=null;
  const fetchImpl=function fetchImpl(url,options){
    count('fetchEntries');assert.equal(label,'bound');assert.equal(this,undefined);assert.equal(arguments.length,2);
    assert.equal(url,f.storeOptions.resourceUrl);assert.equal(options.method,'POST');
    assert.equal(options.headers['PAYMENT-SIGNATURE'],f.packet.pair.paymentSignatureHeader);
    assert.equal(store.load().status,'ATTEMPT_FENCED');return Promise.resolve(ack(f));
  };
  const ctx={f,reads,store,fetchImpl,get owner(){return owner;},
    create(options=f.ownerOptions(store,fetchImpl)){owner=APP({...options,readSession:reads.session});return owner;}};
  try{await run(ctx);}
  catch(error){primary=error;}
  finally{
    try{
      if(owner!==null){
        try{await owner.close();}
        catch(error){
          // Do not replace the original failure or force-close an uncertain
          // real owner. No reopen or diagnostic write follows this boundary.
          if(!HELD_STORES.includes(store)){HELD_STORES.push(store);counters.heldStores++;}
          if(!primary&&(!joinError(error)||mode!=='uncertain'))primary=error;
        }
      }else{await reads.session.close();store.close();}
    }catch(error){counters.secondaryCleanupFailures++;if(!primary)primary=error;
      if(!HELD_STORES.includes(store)){HELD_STORES.push(store);counters.heldStores++;}}
  }
  if(primary)throw primary;
  counters.casesCompleted++;
}
async function prepared(ctx){
  const {f,store}=ctx,owner=ctx.owner,result=await owner.prepareOriginalFunding(f.input);
  assert.equal(result.originalFundingPreparationVersion,2);assert.equal(result.phase,'AWAITING_INDEPENDENT_PINS');
  assert.equal(result.preflight,'ACTUAL_LOCAL_PREFLIGHT_RETURNED');assert.equal(store.load(),null);
  f.packet=result.packet;f.pins=h.retainPins(f.label,result.packet.expectedPins);
  assert.deepEqual(captureCounters(f),[1,1,15,30,30,1]);
}
async function committed(ctx){
  const {f,store}=ctx,result=await ctx.owner.commitOriginalFunding({expectedPins:f.pins});
  assert.equal(result.originalFundingCommitVersion,2);assert.equal(result.preCustodyRevalidation,'SAME_ORIGINAL_CURRENT_READ_VALIDATED');
  assert.deepEqual(captureCounters(f),[1,1,18,36,36,1]);storeOriginal(store,f);
}
async function closed(ctx){
  const p=ctx.owner.close();assert.equal(ctx.owner.close(),p);const value=await p;
  assert.equal(value.originalFundingReadCloseVersion,1);assert.equal(value.lifecycle,'CLOSED');
  assert.equal(value.operationOutcome,'NOT_ESTABLISHED');assert.equal(value.authority,'NONE');
  assert.deepEqual(ctx.reads.closeCounts,[1,1,1]);
  assert.throws(()=>ctx.store.load(),{code:'ZENON_FUNDING_PAYER_RECOVERY_STORE_CLOSED'});
}
try{
await test('actual V3 prepares commits submits once and joins three read closes before closing the real V6 store',OPTIONS,async()=>{
 await withFixture('bound','clean',async c=>{
  c.create();await prepared(c);await committed(c);
  const before=captureCounters(c.f),result=await c.owner.submitOriginalFunding({expectedPins:c.f.pins});
  assert.equal(result.originalFundingSubmissionVersion,3);assert.equal(result.phase,'FUNDING_INTAKE_BOUND');
  storeOriginal(c.store,c.f,'BOUND',3);await closed(c);
  assert.equal(packetSame(c.owner,c.f,'FUNDING_INTAKE_BOUND').lifecycle,'CLOSED');
  assert.deepEqual(captureCounters(c.f),before);
 });
});
await test('actual V3 reentrant close during native recovery blocks POST entry while preserving original PREPARED bytes',OPTIONS,async()=>{
 let owner=null,closing=null,hookFailure=null;
 await withFixture('reentrant-close','clean',async c=>{
  owner=c.create();await prepared(c);await committed(c);
  const before=captureCounters(c.f);
  await assert.rejects(owner.submitOriginalFunding({expectedPins:c.f.pins}),appError('submission_held'));
  assert.equal(hookFailure,null);assert.ok(closing instanceof Promise);await closing;
  const held=packetSame(owner,c.f,'HELD_BEFORE_SUBMISSION');
  assert.equal(held.submissionEntered,false);assert.equal(held.lifecycle,'CLOSED');
  assert.deepEqual(captureCounters(c.f),before);assert.equal(counters.fetchEntries,1);await closed(c);
 },f=>{f.storeOptions.testHooks={beforeCommit(name){
  if(name==='recoverAfterRestart'){
   count('recoveryCloseHooks');
   try{assert.equal(owner.inspectOriginalFunding().publicOperationActive,true);
    closing=owner.close();assert.equal(owner.close(),closing);assert.equal(owner.inspectOriginalFunding().lifecycle,'CLOSING');}
   catch(error){hookFailure=error;throw error;}
  }
 }};});
});
await test('actual V3 uncertain read close keeps the idle native PREPARED store held and never promotes after all read settlements',OPTIONS,async()=>{
 await withFixture('undrained','uncertain',async c=>{
  c.create();await prepared(c);await committed(c);
  const before=captureCounters(c.f),packet=JSON.stringify(c.f.packet),closing=c.owner.close();
  await assert.rejects(closing,joinError);assert.equal(c.owner.close(),closing);
  const held=packetSame(c.owner,c.f,'LOCAL_STORE_READBACK_MATCHED');
  assert.equal(held.lifecycle,'CLOSE_OUTCOME_UNKNOWN');assert.equal(held.publicOperationActive,false);
  assert.equal(held.joinedReadClose.fundingCloseStarted,false);assert.deepEqual(c.reads.closeCounts,[1,1,1]);
  // One idle diagnostic read in this test-owned fixture, not a new store owner,
  // recovery, reopening, or production authorization to operate a HELD store.
  storeOriginal(c.store,c.f);await Promise.resolve();await assert.rejects(c.owner.close(),joinError);
  await assert.rejects(c.owner.submitOriginalFunding({expectedPins:c.f.pins}),appError('operation_unavailable'));
  assert.equal(JSON.stringify(c.f.packet),packet);assert.deepEqual(captureCounters(c.f),before);
 });
});
await test('actual V3 close aborts the first pending account read before work or signing and joins empty-store close',OPTIONS,async()=>{
 await withFixture('state-conflict','first-account',async c=>{
  c.create();const preparing=c.owner.prepareOriginalFunding(c.f.input);preparing.catch(()=>undefined);
  await reachedReadBoundary(c.reads,preparing);const closing=c.owner.close();assert.deepEqual(c.reads.closeCounts,[1,1,1]);
  await assert.rejects(preparing,appError('prepare_refused'));await closing;
  assert.equal(c.f.signatures,0);assert.equal(c.f.material.length,0);
  assert.equal(c.owner.inspectOriginalFunding().phase,'PREPARATION_REFUSED');await closed(c);
 });
});
await test('actual V3 close aborts the sixth read after signing without custody entry reassembly or another signature',OPTIONS,async()=>{
 await withFixture('commit-loss','sixth-account',async c=>{
  c.create();await prepared(c);const packet=JSON.stringify(c.f.packet);
  const committing=c.owner.commitOriginalFunding({expectedPins:c.f.pins});committing.catch(()=>undefined);
  await reachedReadBoundary(c.reads,committing);const closing=c.owner.close();
  await assert.rejects(committing,appError('commit_unknown_or_refused'));await closing;
  const value=packetSame(c.owner,c.f,'COMMIT_OUTCOME_UNKNOWN_OR_REFUSED');
  assert.equal(value.preparation.storeEntered,false);assert.equal(value.preparation.preCustodyRevalidationPassed,false);
  assert.equal(c.f.signatures,1);assert.equal(c.f.material.length,1);assert.equal(JSON.stringify(c.f.packet),packet);await closed(c);
 });
});
await test('actual V3 refuses a different readOptions object before wallet or transport and leaves construction ownership with the caller',OPTIONS,async()=>{
 await withFixture('configuration','clean',async c=>{
  const options=c.f.ownerOptions(c.store,c.fetchImpl);
  options.preparerOptions={...options.preparerOptions,readOptions:{...c.reads.session.readOptions}};
  assert.throws(()=>c.create(options),appError('configuration_rejected'));
  assert.equal(c.owner,null);assert.deepEqual(captureCounters(c.f),[0,0,0,0,0,0]);assert.equal(c.store.load(),null);
 });
});
assert.equal(counters.casesEntered,6);assert.equal(counters.casesCompleted,6);
assert.equal(counters.createAttempts,6);assert.equal(counters.signatureEntries,4);assert.equal(counters.addressEntries,5);
assert.equal(counters.materialEntries,4);assert.equal(counters.dpForwardEntries,276);assert.equal(counters.accountForwardEntries,71);
assert.equal(counters.fetchEntries,1);assert.equal(counters.readOwnerCloses,18);assert.equal(counters.heldStores,1);
assert.equal(counters.secondaryCleanupFailures,0);
assert.equal(counters.recoveryCloseHooks,1);
console.log('# original-funding-v3-native-close-fixture '+JSON.stringify({cases:6,...counters,fixture:h.counts(),
 syntheticKeys:1,maximumSignatures:4,newV6Databases:6,newPinFiles:4,
 declaredReadCallbacksOnly:true,nativeHTTPS:0,nonceEvaluations:0,normalReopens:0,
 actualFullBoundedHttpsFactoryImported:false,liveOrProduction:false,heldStoreNotForceClosed:true}));
}finally{h.destroy();} // Best effort only, not secure erasure or crash proof.
