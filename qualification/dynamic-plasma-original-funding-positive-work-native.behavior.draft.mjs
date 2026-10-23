/*
 * Three selected actual bounded-material/V3/SDK/V6 scenarios. Synthetic in-process
 * read/fetch callbacks are not authenticated native RPC/HTTPS. One ephemeral key,
 * two tx signatures, three fresh DBs and two independent pin files per run.
 * No replacement/re-signing, real PREPARE, reopening, socket, install or pilot.
 * Candidate ceilings are not CPU-time, process, cancellation or sandbox promises.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
if (process.argv.length !== 3 || process.argv[2] !== process.env.SPV_TASK_SCRATCH
    || process.env.X402_DP_POSITIVE_WORK_SELECTION !== 'three-selected-positive-work-cases-only'
    || process.env.X402_DP_POSITIVE_WORK_NATIVE_MODE !== 'reviewed-native-fchmod'
    || !/^[0-9a-f]{64}$/.test(process.env.X402_DP_POSITIVE_WORK_PROFILE_SHA256 || '')) {
  throw new TypeError('X402_POSITIVE_WORK_BODY_REJECTED_BEFORE_EFFECT_IMPORTS');
}
const [
  { createOriginalFundingPositiveWorkFixtureHarness: FIXTURE },
  { createZenonDynamicPlasmaOriginalFundingSubmissionV3: APP },
  { createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6: CREATE_V6 },
  { createRetainedDynamicPlasmaReadSessionCore: READ_SESSION },
  { selectBoundedJsonRpcReadAdmissionProfile: PROFILE, createBoundedJsonRpcReadAdmission: ADMIT },
  { createRetainedAccountStateExchangeGate: ACCOUNT_GATE },
  { encodeOriginalPaymentCheckpoint: ENCODE },
] = await Promise.all([
  import('./dynamic-plasma-original-funding-positive-work.fixture.draft.mjs'),
  import('../src/zenon/dynamic-plasma-original-funding-submission.js'),
  import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js'),
  import('../src/zenon/dynamic-plasma-retained-read-session-core.js'),
  import('../src/zenon/bounded-json-rpc-read-admission.js'),
  import('../src/zenon/dynamic-plasma-retained-account-exchange-gate.js'),
  import('../src/service-credit-pilot-original-payment-checkpoint.js'),
]);
const h = FIXTURE(process.argv[2]), OPTIONS = { timeout: 15000, concurrency: false };
const frozen = Object.freeze, APPLY = Reflect.apply;
const HELD_STORES = []; // Preserve deliberate/failed HELD fixtures until process exit.
const counters = { createAttempts:0, addressEntries:0, signatureEntries:0, materialEntries:0,
  dpForwardEntries:0, accountForwardEntries:0, fetchEntries:0, readOwnerCloses:0,
  casesEntered:0, casesCompleted:0, heldStores:0, secondaryCleanupFailures:0,recoveryCloseHooks:0 };
const LIMITS = frozen({ createAttempts:3,addressEntries:3,signatureEntries:2,materialEntries:3,
  dpForwardEntries:168,accountForwardEntries:42,fetchEntries:1,readOwnerCloses:9,recoveryCloseHooks:0 });
function count(name){assert.ok(Object.hasOwn(LIMITS,name));assert.ok(++counters[name]<=LIMITS[name]);}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});promise.catch(()=>undefined);return{promise,resolve,reject};}
function refusedRead(){const p=Promise.reject(new Error('SYNTHETIC_READ_CLOSED_OR_EXHAUSTED'));p.catch(()=>undefined);return p;}
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
  assert.equal(mode,'clean');
  const baseReads=f.options.readOptions,owners=[],admissions=[ADMIT('dynamic_plasma_retained_candidate'),
    ADMIT('dynamic_plasma_retained_candidate'),ADMIT('zenon_account_state_retained_candidate')];
  const closeCounts=[0,0,0],closing=[deferred(),deferred(),deferred()];
  for(let index=0;index<3;index++){
    let closed=false;
    const read=frozen(function read(request){
      if(closed||!admissions[index].claim())return refusedRead();
      if(index<2){count('dpForwardEntries');return APPLY(baseReads.transports[index].callRead,undefined,[request]);}
      count('accountForwardEntries');
      return APPLY(baseReads.accountExchange,undefined,[request]);
    });
    const close=frozen(function close(){
      if(!closed){
        closed=true;closeCounts[index]++;count('readOwnerCloses');
        closing[index].resolve(undefined);
      }
      return closing[index].promise;
    });
    if(index<2)owners.push(frozen({transport:frozen({callRead:read}),close,requestBudget:PROFILE('dynamic_plasma_retained_candidate')}));
    else owners.push(frozen({...ACCOUNT_GATE(frozen({exchange:read,close})),requestBudget:PROFILE('zenon_account_state_retained_candidate')}));
  }
  return {session:READ_SESSION(frozen({firstOwner:owners[0],secondOwner:owners[1],accountOwner:owners[2]})),closeCounts};
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
async function withFixture(label,mode,run){
  counters.casesEntered++;const f=h.fixture(label);f.label=label;instrumentWalletAndMaterial(f);
  const reads=bindReadSession(f,mode);f.options.readOptions=reads.session.readOptions;
  count('createAttempts');const store=CREATE_V6(f.storeOptions);
  let owner=null,primary=null,fetchStage='NOT_ENTERED',fetchFailure=null;
  const fetchImpl=function fetchImpl(url,options){
    count('fetchEntries');h.note('fetchCalls');fetchStage='ENTERED';
    try{
      assert.equal(label,'bound');assert.equal(this,undefined);assert.equal(arguments.length,2);
      fetchStage='CALL_SHAPE_VALIDATED';
      assert.equal(url,f.storeOptions.resourceUrl);assert.equal(options.method,'POST');
      assert.equal(options.headers['PAYMENT-SIGNATURE'],f.packet.pair.paymentSignatureHeader);
      fetchStage='ORIGINAL_TRANSPORT_VALIDATED';
      assert.equal(store.load().status,'ATTEMPT_FENCED');fetchStage='FENCE_VALIDATED';
      const response=ack(f);fetchStage='ACK_CONSTRUCTED';return Promise.resolve(response);
    }catch(error){fetchFailure=error;throw error;}
  };
  const ctx={f,reads,store,fetchImpl,get owner(){return owner;},
    fetchDiagnostic(){return {fetchStage,fetchFailure};},
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
          if(!primary)primary=error;
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
try {
await test('actual bounded positive work survives two price advances through V3 signing V6 custody and one original submission',OPTIONS,async()=>{
 await withFixture('bound','clean',async c=>{
  c.create(c.f.ownerOptions(c.store,c.fetchImpl,2000));await prepared(c);
  assert.equal(c.f.unsigned.difficulty,3000);assert.equal(c.f.unsigned.fusedPlasma,25409);
  assert.equal(c.f.unsigned.nonce,c.f.reference.nonce);
  assert.equal(c.f.unsigned.hash,c.f.packet.transactionHash);
  const original=JSON.stringify(c.f.unsigned),packet=JSON.stringify(c.f.packet);
  await committed(c);
  assert.deepEqual(c.f.observedAges.slice(0,24),Array(24).fill(0));
  assert.deepEqual(c.f.observedAges.slice(24),Array(48).fill(2));
  const before=captureCounters(c.f);let result;
  try{result=await c.owner.submitOriginalFunding({expectedPins:c.f.pins});}
  catch(error){
    const {fetchStage,fetchFailure}=c.fetchDiagnostic(),row=c.store.load();
    console.log('# positive-work-bound-diagnostic '+JSON.stringify({fetchStage,
      fixtureFailure:fetchFailure===null?null:fetchFailure.name,submissionCode:error.code,
      storeStatus:row?.status,revision:row?.revision,selectedDeadlineMs:2000}));
    throw fetchFailure===null?error:fetchFailure;
  }
  assert.equal(result.originalFundingSubmissionVersion,3);assert.equal(result.phase,'FUNDING_INTAKE_BOUND');
  storeOriginal(c.store,c.f,'BOUND',3);
  assert.equal(JSON.stringify(c.f.unsigned),original);assert.equal(JSON.stringify(c.f.packet),packet);
  assert.deepEqual(captureCounters(c.f),before);await closed(c);
  assert.equal(packetSame(c.owner,c.f,'FUNDING_INTAKE_BOUND').lifecycle,'CLOSED');
 });
});
await test('actual positive-work original is held before V6 custody when the sixth read expires its two-Momentum horizon',OPTIONS,async()=>{
 await withFixture('expired-horizon','clean',async c=>{
  c.create(c.f.ownerOptions(c.store,c.fetchImpl,2000));await prepared(c);
  assert.equal(c.f.unsigned.difficulty,3000);assert.equal(c.f.unsigned.nonce,c.f.reference.nonce);
  const original=JSON.stringify(c.f.unsigned),packet=JSON.stringify(c.f.packet);
  await assert.rejects(c.owner.commitOriginalFunding({expectedPins:c.f.pins}),appError('commit_unknown_or_refused'));
  const held=packetSame(c.owner,c.f,'COMMIT_OUTCOME_UNKNOWN_OR_REFUSED');
  assert.equal(held.preparation.storeEntered,false);
  assert.equal(held.preparation.preCustodyRevalidationPassed,false);
  assert.equal(c.store.load(),null);assert.deepEqual(captureCounters(c.f),[1,1,18,36,36,1]);
  assert.deepEqual(c.f.observedAges.slice(0,24),Array(24).fill(0));
  assert.deepEqual(c.f.observedAges.slice(24,60),Array(36).fill(2));
  assert.deepEqual(c.f.observedAges.slice(60),Array(12).fill(3));
  assert.equal(JSON.stringify(c.f.packet),packet);assert.equal(JSON.stringify(c.f.unsigned),original);
  assert.equal(counters.fetchEntries,1);await closed(c);
  packetSame(c.owner,c.f,'COMMIT_OUTCOME_UNKNOWN_OR_REFUSED');
 });
});
await test('actual bounded producer exhausts its reviewed 4096-candidate prefix before signing custody or submission',OPTIONS,async()=>{
 await withFixture('budget-exhausted','clean',async c=>{
  c.create(c.f.ownerOptions(c.store,c.fetchImpl,2000));
  await assert.rejects(c.owner.prepareOriginalFunding(c.f.input),appError('prepare_refused'));
  assert.equal(c.owner.inspectOriginalFunding().phase,'PREPARATION_REFUSED');
  assert.equal(c.f.unsigned,null);assert.equal(c.f.reference.nonce,null);
  assert.deepEqual(captureCounters(c.f),[1,0,6,12,12,1]);
  assert.equal(c.f.material[0].workRequest.accountBlock.difficulty,38115000);
  assert.equal(c.f.material[0].workRequest.accountBlock.fusedPlasma,0);
  assert.deepEqual(c.f.observedAges,Array(24).fill(0));assert.equal(c.store.load(),null);
  assert.equal(counters.fetchEntries,1);await closed(c);
 });
});
const fixture=h.counts();
assert.equal(counters.casesEntered,3);assert.equal(counters.casesCompleted,3);
assert.equal(counters.createAttempts,3);assert.equal(counters.signatureEntries,2);assert.equal(counters.addressEntries,3);
assert.equal(counters.materialEntries,3);assert.equal(counters.dpForwardEntries,168);assert.equal(counters.accountForwardEntries,42);
assert.equal(counters.fetchEntries,1);assert.equal(counters.readOwnerCloses,9);assert.equal(counters.heldStores,0);
assert.equal(counters.secondaryCleanupFailures,0);assert.equal(counters.recoveryCloseHooks,0);
assert.equal(fixture.fixtures,3);assert.equal(fixture.signatures,2);assert.equal(fixture.uniqueSignedHashes,2);
assert.equal(fixture.producerInvocations,3);assert.equal(fixture.producerCandidateReservation,12288);
assert.equal(fixture.pinFilesWritten,2);assert.equal(fixture.fetchCalls,1);
assert.ok(fixture.referenceWindows<=9);assert.ok(fixture.positiveReferenceWindows<=8);
assert.ok(fixture.referenceEvaluations<=36864);
console.log('# original-funding-positive-work-native-fixture '+JSON.stringify({cases:3,...counters,fixture,
 syntheticKeys:1,maximumSignatures:2,newV6Databases:3,newPinFiles:2,
 maximumCandidatesPerWindow:4096,maximumReferenceCandidateReservation:36864,
 maximumProducerCandidateReservation:12288,fixedVerificationCandidateReservation:16384,
 maximumAggregateCandidateReservation:65536,
 producerActualCandidateCount:'NOT_INSTRUMENTED',fixedVerificationActualCount:'NOT_INSTRUMENTED',
 independentPositiveReferenceSetup:true,referenceFailureDoesNotAuthorizeAnotherKeyOrWindow:true,
 declaredReadCallbacksOnly:true,nativeHTTPS:0,normalReopens:0,
 actualFullBoundedHttpsFactoryImported:false,liveOrProduction:false,heldStoreNotForceClosed:true}));
} finally { h.destroy(); } // Best effort only, not secure erasure or crash proof.

