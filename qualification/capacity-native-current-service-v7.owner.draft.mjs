import { captureNativeCapacityRoleNamespaceDataV7 as CAPTURE_ROLE_DATA } from '../src/native-capacity-role-namespace-contract-v7.js';
// CURRENT ROLE V7 SOURCE ONLY. Historical V3 files and results remain unchanged.
// VERSIONED V3 SOURCE: stable directory identity; old files/evidence remain unchanged.
/* SOURCE DRAFT. Real P1 application/RPC/SQL/grant side for one isolated lane.
 * NOT EXECUTED. Native admission, managed roots and a new finite allowance are
 * required. Declared chain/settlement callbacks are NOT live Zenon evidence.
 * No replacement store, SDK, server factory, provider signer or grant record.
 */
import { captureNativePrivateDirectoryStatIdentity as DIRECTORY_ID } from '../src/native-private-directory-identity.js';
import { Buffer } from 'node:buffer';
import { createNativeCapacityCurrentServiceWindowOwnerV7 as CREATE_WINDOW } from './capacity-native-current-service-window-v7.owner.draft.mjs';
import { lstatSync, fstatSync, openSync, closeSync, readSync, constants as C } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { createServer as createPortReservation } from 'node:net';
import { request as requestHttps } from 'node:https';
import { types as utilTypes } from 'node:util';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,P=Object.getPrototypeOf,K=Reflect.ownKeys,O=Object.hasOwn;
const NS='getPinnedNativeCapacityCurrentServiceNamespaceSnapshotV7',ASSET='zts1znnxxxxxxxxxxxxx9z4ulx';
const CHAIN=F({version:1,chainIdentifier:'73404',genesisMomentumHash:'11'.repeat(32)});
const CHECKPOINT=F({height:100,hash:'33'.repeat(32)}),CATCH_UP=F({maximumPageEntries:4,maximumBackfillSpan:8,maximumMembersPerMomentum:4});
let claimed=false;

export async function openNativeCapacityCurrentServiceV7(options) {
  if(arguments.length!==1||claimed)fail();
  const c=exact(options,['root','context','payerAddress','capabilityCommitment','payeeAddress','totalCalls']);
  integer(c.totalCalls,1,256);address(c.payerAddress);address(c.payeeAddress);
  if(c.payerAddress===c.payeeAddress||typeof c.capabilityCommitment!=='string'||!/^sha256:[0-9a-f]{64}$/.test(c.capabilityCommitment))fail();
  const context=F(exact(c.context,['runId','laneId','sourceRowsSha256']));
  if(!/^[0-9a-f]{64}$/.test(context.runId)||!/^[0-9a-f]{64}$/.test(context.sourceRowsSha256)
      ||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(context.laneId))fail();
  const root=c.root,rootId=rootIdentity(root);namespace(context.sourceRowsSha256);claimed=true;
  const [sql,intakes,observers,composition,evidence,attest,activation,application,nativeFactory,rpcModule,checkpoints,wire,canonical,drainModule]=await Promise.all([
    import('../src/service-credit-sqlite-store.js'),import('../src/service-credit-zenon-funding-intake-sqlite-store.js'),
    import('../src/service-credit-zenon-funding-observer-sqlite-store.js'),import('../src/service-credit-zenon-funding-composition.js'),
    import('../src/service-credit-zenon-funding-evidence.js'),import('../src/service-credit-zenon-funding-provider-attestation.js'),
    import('../src/service-credit-activation.js'),import('../src/x402-official-issued-funding-post-native-application.js'),
    import('../src/service-credit-bounded-node-https-server-factory.js'),import('./issued-current-close-v4-rpc.fixture.mjs'),
    import('../src/service-credit-pilot-original-payment-checkpoint.js'),import('../src/x402-wire.js'),import('../src/canonical.js'),
    import('../src/service-credit-bounded-operation-drain.js'),
  ]);
  const canonicalJson=canonical.canonicalJson,DRAIN=drainModule.observeServiceCreditOperationDrain;
  let app=null,rpc=null,store=null,intake=null,observer=null,providerKey=null,key=null,cert=null;
  let held=false,opening=true,active=null,closing=null,grant=null,witness=null,boundChallenge=null,issuedFrame=null;
  let grantAttempt=false,policyCalls=0,verifyCalls=0,settleCalls=0,pendingCalls=0,executions=0,finished=0,armed=null;
  let appOpening=false,rpcOpening=false,appCloseReturned=false,rpcCloseReturned=false,borrowedStoresClosed=false;
  let portOwner=null;
  const records=[],recordLimit=12*c.totalCalls+64;let tx=null,timingUnknown=false,timingStarts=0,timingOrdinal=0;
  const measurement=CREATE_WINDOW(F({context,totalCalls:c.totalCalls}));
  const totalUnits=2*c.totalCalls,expiresAt=Date.now()+300000;
  const selection=F({offerId:'capacity.'+hash(context.runId+'\0'+context.laneId).slice(0,24),offerVersion:1,
    holderId:c.payerAddress,capabilityCommitment:c.capabilityCommitment});
  const ledgerDomain='capacity.'+hash(context.runId+'\0'+context.laneId).slice(0,24);
  const now=F(function now(){return Date.now();}); // Real wall time: never freeze expiry to make load pass.
  function current(){namespace(context.sourceRowsSha256);if(rootIdentity(root)!==rootId)fail();}
  function live(){current();if(held||closing!==null)fail();}
  function hold(){held=true;}
  function tick(){const n=process.hrtime.bigint();if(typeof n!=='bigint'||n<0n||n>=(1n<<128n))fail();return n;}
  function hook(kind,event){
    // Measurement failure must NOT throw into or quarantine a real transaction.
    try{
      if(timingUnknown)return undefined;
      const e=exact(event,['operation','changed']);if(typeof e.operation!=='string'||e.operation.length>96||typeof e.changed!=='boolean')fail();
      const n=measurement.timestamp();
      if(kind==='beforeBegin'){
        if(tx!==null||timingStarts>=recordLimit)fail();timingStarts++;
        tx={ordinal:++timingOrdinal,operation:e.operation,command:armed===null?'CONTROL':armed.requestId,
          beforeBeginNs:n,afterBeginNs:null,beforeCommitNs:null};
      }else{
        if(tx===null||tx.operation!==e.operation||n<tx.beforeBeginNs)fail();
        if(kind==='afterBegin'){if(tx.afterBeginNs!==null)fail();tx.afterBeginNs=n;}
        else if(kind==='beforeCommit'){if(tx.afterBeginNs===null||tx.beforeCommitNs!==null||n<tx.afterBeginNs)fail();tx.beforeCommitNs=n;}
        else if(kind==='afterCommit'){
          if(tx.beforeCommitNs===null||n<tx.beforeCommitNs)fail();
          records.push(F({...tx,beforeBeginNs:tx.beforeBeginNs.toString(),afterBeginNs:tx.afterBeginNs.toString(),
            beforeCommitNs:tx.beforeCommitNs.toString(),afterCommitNs:n.toString(),changed:e.changed,
            timingKind:'ACTUAL_STORE_WRITER_BRACKET_INCLUDES_JS_AND_IDENTITY_CHECKS'}));tx=null;
        }else fail();
      }
    }catch{timingUnknown=true;}
    return undefined;
  }
  const hooks=F(Object.fromEntries(['beforeBegin','afterBegin','beforeCommit','afterCommit'].map(kind=>
    [kind,F(function actualStoreHook(event){return hook(kind,event);})])));
  let origin,resourceUrl,authorityRecord,authority,offer,deriveFundingTerms,observerId=null;
  try{
    current();key=readPrivate(root,'tls-key.pem',16384);cert=readPrivate(root,'tls-cert.pem',16384);
    const port=await reservePort();origin='https://127.0.0.1:'+port;resourceUrl=origin+'/funding';
    for(const name of ['capacity-service.sqlite','capacity-intake.sqlite'])for(const suffix of ['','-journal','-wal','-shm'])absent(join(root,name)+suffix);
    store=sql.ServiceCreditSqliteStore.create({databasePath:join(root,'capacity-service.sqlite'),allowedRoot:root,
      deriveCost:F(function deriveCost(){return 2;}),now,testHooks:hooks});
    intake=intakes.createZenonFundingIntakeSqliteStore({databasePath:join(root,'capacity-intake.sqlite'),allowedRoot:root,ledgerDomain,maxChallenges:1});
    const pair=generateKeyPairSync('ed25519');providerKey=pair.privateKey;
    const publicKey=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64url');
    authorityRecord=canonicalJson({authorityRecordVersion:1,authorityProfileId:'zenon.provider-attestation',authorityProfileVersion:1,
      verifierVersion:1,providerAuthorityId:ledgerDomain,generationId:ledgerDomain+'.generation',generationVersion:1,
      keyId:ledgerDomain+'.key',algorithm:'Ed25519',publicKey,network:'zenon:testnet',chainProfile:CHAIN,
      observerPolicy:{policyId:'zenon.injected-observer',policyVersion:1,verifierVersion:1},
      confirmationPolicy:{policyId:'zenon.authenticated-momentum-inclusion',policyVersion:1,minimumConfirmations:3},bootstrapCheckpoint:CHECKPOINT,
      sourcePolicyCommitment:'sha256:'+hash('capacity-source-policy-v1'),maximumAttestationBytes:4096,maximumCanonicalBytes:524288,
      maximumInitialAgeSeconds:300,maximumFutureSkewSeconds:5,maximumValiditySeconds:300});
    authority=attest.parseZenonFundingProviderAttestationAuthorityRecord(authorityRecord);
    offer=F({modelVersion:1,providerId:ledgerDomain,serviceId:ledgerDomain+'.service',resourceId:ledgerDomain+'.resource',
      resourceBinding:activation.deriveServiceCreditResourceBinding({resourceId:ledgerDomain+'.resource',resourceUrl}),
      offerId:selection.offerId,offerVersion:1,costPolicyId:'cost.fixed',fundingPolicyId:ledgerDomain+'.funding',fundingPolicyVersion:1});
    store.registerOffer(offer);
    deriveFundingTerms=F(function deriveFundingTerms(input){
      current();if(++policyCalls>32)fail();const p=exact(input,['offer','holderId','capabilityCommitment']);
      if(canonicalJson(p.offer)!==canonicalJson(offer)||p.holderId!==selection.holderId||p.capabilityCommitment!==selection.capabilityCommitment)fail();
      return{fundingPolicyId:offer.fundingPolicyId,fundingPolicyVersion:1,totalUnits,expiresAt,
        requirement:{scheme:'exact',network:'zenon:testnet',asset:ASSET,amount:'5',payTo:c.payeeAddress,maxTimeoutSeconds:60,
          extra:{paymentFlow:'upfront',poc:true,settlement:'account-block',zenonChain:{...CHAIN},minimumMomentumConfirmations:3}}};
    });
    rpcOpening=true;rpc=await rpcModule.createNativeIssuedFundingPostRpcPeerFixture(F({tlsMaterial:F({key,cert}),
      payerAddress:c.payerAddress,payeeAddress:c.payeeAddress}));rpcOpening=false;
    const validateChallenge=F(function validateChallenge(value){wire.validatePaymentRequired(value);
      if(value.accepts.length!==1)fail();wire.validateActiveUpfrontRequirement(value.accepts[0]);
      if(value.accepts[0].payTo!==c.payeeAddress||value.accepts[0].asset!==ASSET)fail();});
    const ingressTimers=new Set(),serviceTimers=new Set();
    const schedule=(set,callback,ms)=>{const token=setTimeout(()=>{set.delete(token);callback();},ms);set.add(token);return token;};
    const ingressRuntime=F({schedule:F((fn,ms)=>schedule(ingressTimers,fn,ms)),cancel:F(token=>{clearTimeout(token);ingressTimers.delete(token);return true;})});
    const serviceRuntime=F({monotonicNowNs:F(()=>tick()),schedule:F((fn,ms)=>schedule(serviceTimers,fn,ms)),
      cancel:F(token=>{clearTimeout(token);serviceTimers.delete(token);return undefined;})});
    function tuple(args){
      if(witness===null||args.length!==3)fail();
      const payload=wire.decodeB64Json(witness.paymentSignatureHeader,{maxDecodedBytes:4096,maxEncodedBytes:5464});
      const required=wire.decodeB64Json(witness.paymentRequiredHeader,{maxDecodedBytes:4096,maxEncodedBytes:5464});
      wire.validatePaymentPayloadStructure(payload);wire.validatePaymentRequired(required);
      if(canonicalJson(args[0])!==canonicalJson(payload)||canonicalJson(args[1])!==canonicalJson(required.accepts[0]))fail();
    }
    function settled(args,success){tuple(args);return{success,...(success?{payer:c.payerAddress}:{errorReason:'settlement_pending'}),
      transaction:witness.transactionHash,network:'zenon:testnet',publicationStatus:success?'ACKNOWLEDGED':'UNKNOWN'};}
    appOpening=true;
    app=await application.createOfficialIssuedFundingPostNativeApplication(F({
      funding:F({intake:F({store:intake,serviceCreditStore:store,authorityRecord,deriveFundingTerms,now,observerRoot:root,
        observerCatchUp:CATCH_UP,selection,resourceUrl}),official:F({
        localFacilitator:{verify(...args){tuple(args);if(++verifyCalls!==1)fail();return{isValid:true,payer:c.payerAddress};},
          settle(...args){if(++settleCalls!==1)fail();return settled(args,false);}},validateChallenge,
        reconcilePendingSettlement:F(function reconcile(...args){if(++pendingCalls>2)fail();return settled(args,pendingCalls===2);}),maxPendingReconciliations:2}),
        maxIntakeAttempts:1,closeBudgetMs:1000}),
      service:F({store,execute:F(function execute(identity){
        if(armed===null||typeof identity.executionId!=='string'||++executions>c.totalCalls)fail();return{resultCode:'capacity.ok'};
      }),deadlineRuntime:serviceRuntime,selectedDurationMs:1000}),
      transport:F({origin,generation:F({generationId:ledgerDomain,generationVersion:1}),
        limits:F({maxHeaderBytes:16384,maxHeaderCount:16,maxConcurrentSockets:2,maxConnectionStarts:c.totalCalls+2,
          maxConcurrentRequests:1,maxRequestStarts:c.totalCalls+2,tlsHandshakeDeadlineMs:1000,headerDeadlineMs:2000,
          requestResponseDeadlineMs:5000,idleSocketDeadlineMs:2000,startDeadlineMs:1000,closeGraceMs:5000,metricsCounterLimit:10000}),
        deadlineRuntime:ingressRuntime,httpsServerFactory:nativeFactory.createServiceCreditBoundedNodeHttpsServerFactory(F({
          bind:F({host:'127.0.0.1',port,exclusive:true}),tlsMaterial:F({key,cert})}))}),
    }));appOpening=false;
    if((await app.start()).status!=='LISTENING')fail();
    issuedFrame=await requestChallenge();boundChallenge=rpc.bindIssuedChallenge(F({resourceUrl,frame:issuedFrame}));
    opening=false;
  }catch{hold();opening=false;await close();fail();}
  function launch(work){live();if(active!==null)fail();let yes,no;const p=new Promise((resolve,reject)=>{yes=resolve;no=reject;});active=p;
    p.then(()=>{if(active===p)active=null;},()=>{hold();if(active===p)active=null;});p.catch(()=>undefined);
    try{const actual=work();if(!utilTypes.isPromise(actual)||utilTypes.isProxy(actual))fail();actual.then(yes,()=>{hold();no(problem());});}
    catch{hold();no(problem());}return p;}
  const retainOriginal=F(function retainOriginal(input){
    if(arguments.length!==1)fail();live();if(witness!==null)fail();
    const p=exact(input,['transactionHash','paymentRequiredHeader','paymentSignatureHeader','serializedCheckpoint','expectedPins']);
    const restored=checkpoints.restoreOriginalPaymentCheckpoint(p.serializedCheckpoint,p.expectedPins);
    if(restored.binding.paymentHash!==p.transactionHash||restored.binding.origin!==origin
        ||restored.originalBytes.paymentRequirements!==p.paymentRequiredHeader||restored.originalBytes.paymentPayload!==p.paymentSignatureHeader
        ||p.paymentRequiredHeader!==issuedFrame.paymentRequiredHeader)fail();
    witness=F(p);return F({status:'ORIGINAL_BOUND',authority:'NONE'});
  });
  const activate=F(function activate(){
    if(arguments.length!==0)fail();return launch(async()=>{
      if(witness===null||grantAttempt)fail();grantAttempt=true;
      if(app.snapshot().binding.officialPhase!=='PENDING')fail();
      const first=await app.resumeOriginalSettlement();live();if(first.phase!=='PENDING')fail();
      const second=await app.resumeOriginalSettlement();live();if(second.phase!=='SETTLED')fail();
      const selectedKey=intakes.deriveZenonFundingIntakeSelectionKey({ledgerDomain,selection}),row=intake.loadBySelectionKey(selectedKey);
      if(row.status!=='BOUND'||row.binding.transactionHash!==witness.transactionHash||row.issue.frame.paymentRequiredHeader!==witness.paymentRequiredHeader
          ||row.issue.authorityRecord!==authorityRecord||canonicalJson(row.issue.selection)!==canonicalJson(selection))fail();
      const path=join(root,row.binding.observerFileName);
      if(row.binding.observerFileName!=='funding-observer-'+witness.transactionHash+'.sqlite')fail();
      observer=observers.openZenonFundingObserverSqliteStore({databasePath:path,allowedRoot:root,
        expectedRecordKey:row.binding.observerRecordKey,authorityRecord});observerId=fileIdentity(path);
      let before=observer.load().state;
      if(before.status!=='AWAITING_INCLUSION'||canonicalJson(before.target)!==canonicalJson(row.binding.observerTarget))fail();
      const planned=observer.planBackfill({expectedRevision:before.revision,frontier:{height:103,hash:momentumHash(103)}});
      if(planned.plan.throughHeight-planned.plan.fromHeight+1>3)fail();
      let previousHash=planned.plan.startCheckpoint.hash;const momentums=[];
      for(let height=planned.plan.fromHeight;height<=planned.plan.throughHeight;height++){
        const hash=momentumHash(height);momentums.push({height,hash,previousHash,members:height===planned.plan.fromHeight?
          [{transactionId:before.target.transactionId,targetBindingDigest:before.targetBindingDigest}]:[]});previousHash=hash;
      }
      const advanced=observer.applyPage({expectedRevision:before.revision,plan:planned.plan,momentums}),page=advanced.state.catchUp.lastAppliedPage;
      if(page.targetMembership===null)fail();
      const observed=observer.applyInclusion({expectedRevision:advanced.state.revision,target:advanced.state.target,observation:{status:'FOUND',
        transactionId:advanced.state.target.transactionId,targetBindingDigest:advanced.state.targetBindingDigest,
        momentumHeight:page.targetMembership.momentumHeight,momentumHash:page.targetMembership.momentumHash,pageDigest:page.pageDigest}});
      if(observed.state.status!=='THRESHOLD_OBSERVED')fail();
      const prepared=observer.load(),request=observer.peekPreparedAttestation(),issuedAt=Math.floor(Date.now()/1000),validUntil=issuedAt+120;
      const signature=sign(null,attest.createZenonFundingProviderAttestationSigningBytes({request,issuedAt,validUntil}),providerKey).toString('base64url');
      const committed=observer.commitAuthenticatedEnvelope({expectedObserverRevision:observed.state.revision,expectedOutboxRevision:prepared.outbox.revision,
        attestationId:request.attestationId,envelope:{envelopeVersion:1,attestationId:request.attestationId,keyId:authority.keyId,issuedAt,validUntil,signature},
        nowEpochSeconds:Math.floor(Date.now()/1000)});
      if(committed.disposition!=='READY')fail();
      const actual=composition.createZenonFundingComposition({serviceCreditStore:store,fundingObserverStore:observer,authorityRecord,deriveFundingTerms,now});
      const activated=await actual.activateCommittedFunding({intent:row.issue.challenge.activationIntent,paymentRequired:row.issue.challenge.paymentRequired});
      live();
      grant=store.getGrant(activated.grant.grantId);
      if(canonicalJson(grant)!==canonicalJson(activated.grant)||grant.transactionId!=='zenontx:'+witness.transactionHash
          ||grant.capabilityCommitment!==selection.capabilityCommitment||grant.totalUnits!==totalUnits)fail();
      if(store.initializeDurableExecution({expectedRevision:store.load().revision,ledgerId:ledgerDomain,
        policy:{policyId:ledgerDomain+'.duration',policyVersion:1,maxDurationMs:1000},capacity:c.totalCalls}).disposition!=='APPLIED')fail();
      if(app.admitCommittedServiceGrant(grant.grantId).status!=='ADMITTED')fail();
      return F({grantId:grant.grantId,capabilityCommitment:grant.capabilityCommitment,totalUnits,grantActivation:'ACTUAL_SYNTHETIC_COMPOSITION',
        chainObservations:'DECLARED_NOT_AUTHENTICATED',authority:'NONE'});
    });
  });
  const arm=F(function arm(input){live();if(arguments.length!==1||grant===null||armed!==null||active!==null)fail();
    const p=exact(input,['cohort','ordinal','requestId']);if(!['WARMUP','MEASUREMENT'].includes(p.cohort)||typeof p.requestId!=='string'||!/^[0-9a-f]{64}$/.test(p.requestId))fail();
    integer(p.ordinal,0,255);if(finished>=c.totalCalls)fail();armed=F(p);return F({status:'ARMED'});});
  const finish=F(function finish(){live();if(arguments.length!==0||armed===null||grant===null||app.snapshot().activeOperations!==0)fail();
    const actual=store.getRequest({grantId:grant.grantId,requestId:armed.requestId});
    if(actual===null||actual.state!=='SUCCEEDED'||actual.costUnits!==2)fail();
    const key=armed;armed=null;finished++;return F({requestId:key.requestId,state:actual.state,balances:balances()});});
  function balances(){live();if(grant===null||armed!==null||app.snapshot().activeOperations!==0)fail();
    const actual=store.getGrant(grant.grantId);if(actual.availableUnits!==totalUnits-2*finished||actual.heldUnits!==0||actual.consumedUnits!==2*finished)fail();
    return F({availableUnits:actual.availableUnits,heldUnits:actual.heldUnits,consumedUnits:actual.consumedUnits,finished,totalUnits,
      source:'ACTUAL_SERVICE_STORE_READ_NOT_CLIENT_DECLARATION'});}
  const openMeasurementWindow=F(function openMeasurementWindow(){
    if(arguments.length!==0)fail();live();
    if(grant===null||armed!==null||active!==null||app.snapshot().activeOperations!==0||timingUnknown)fail();
    try{measurement.open();return measurement.snapshot();}catch{timingUnknown=true;throw problem();}
  });
  const stopMeasurementWindow=F(function stopMeasurementWindow(){
    if(arguments.length!==0)fail();
    // Instrumentation only: do not wait for armed/original HTTP/SQL drain.
    // Do not abort or close that work on a measurement failure.
    try{current();if(grant===null||closing!==null)fail();measurement.stop();
      if(timingUnknown)fail();return measurement.snapshot();
    }catch{timingUnknown=true;throw problem();}
  });
  function close(){
    if(closing!==null)return closing;
    try{measurement.closeFallback();}catch{timingUnknown=true;}
    if(measurement.snapshot().unknown)timingUnknown=true;
    if(armed!==null)hold(); // No cleanup/refund authority for a dispatch whose outcome is still unobserved.
    let resolveClose;closing=new Promise(resolve=>{resolveClose=resolve;});
    (async()=>{try{
      const attempts=[];let synchronousFailure=false;
      if(app!==null)try{attempts.push(app.close().then(value=>{if(value?.status!=='CLOSED')fail();appCloseReturned=true;}));}catch{synchronousFailure=true;}
      if(rpc!==null)try{attempts.push(rpc.close().then(value=>{if(value!==undefined)fail();rpcCloseReturned=true;}));}catch{synchronousFailure=true;}
      if(portOwner!==null)try{attempts.push(portOwner.stop());}catch{synchronousFailure=true;}
      const stopped=await Promise.allSettled(attempts);if(active!==null)await active.catch(()=>undefined);
      if(synchronousFailure||stopped.some(v=>v.status!=='fulfilled')||appOpening||rpcOpening||held
          ||portOwner!==null&&!portOwner.clean()
          ||app!==null&&(!appCloseReturned||app.snapshot().phase!=='CLOSED'||app.snapshot().uncertain)
          ||rpc!==null&&(!rpcCloseReturned||rpc.inspect().phase!=='CLOSED'||rpc.inspect().held))fail();
      current();if(observer!==null){if(fileIdentity(join(root,'funding-observer-'+witness.transactionHash+'.sqlite'))!==observerId||observer.close()!==undefined)fail();}
      if(intake!==null&&intake.close()!==undefined)fail();if(store!==null&&store.close()!==undefined)fail();borrowedStoresClosed=true;
      providerKey=null;if(key!==null)key.fill(0);if(cert!==null)cert.fill(0);resolveClose(F({status:'CLOSED',held:false,borrowedStoresClosed}));
    }catch{hold();resolveClose(F({status:'UNKNOWN',held:true,borrowedStoresClosed}));}})();return closing;
  }
  function timingPage(input){const p=exact(input,['from','maximum']);integer(p.from,0,recordLimit);integer(p.maximum,1,64);
    return F({records:F(records.slice(p.from,p.from+p.maximum)),next:Math.min(records.length,p.from+p.maximum),
      total:records.length,started:timingStarts,active:tx!==null,unknown:timingUnknown,clockDomain:'SERVICE_CHILD_LOCAL'});}
  async function reservePort(){
    let failed=false,closed=false,callback=false,listening=false,stopping=null;
    const server=createPortReservation(socket=>{failed=true;socket.destroy();});
    const stop=F(function stop(){if(stopping!==null)return stopping;
      let yes,no;stopping=new Promise((resolve,reject)=>{yes=resolve;no=reject;});stopping.catch(()=>undefined);
      try{server.close(error=>{if(error)failed=true;callback=true;});}catch{failed=true;}
      DRAIN(F(()=>failed?'UNKNOWN':closed&&callback&&!server.listening?'DRAINED':'BUSY'),1000)
        .then(clean=>clean?yes(undefined):no(problem()),no);return stopping;});
    portOwner={stop,clean:F(()=>!failed&&closed&&callback&&!server.listening)};
    server.on('error',()=>{failed=true;});server.once('close',()=>{closed=true;});server.once('listening',()=>{listening=true;});
    try{server.listen({host:'127.0.0.1',port:0,exclusive:true});
      if(await DRAIN(F(()=>failed?'UNKNOWN':listening?'DRAINED':'BUSY'),1000)!==true)fail();
      const found=server.address();if(found===null||found.address!=='127.0.0.1')fail();integer(found.port,1024,65535);
      await stop();return found.port;
    }catch{stop();throw problem();}
  }
  async function requestChallenge(){
    const u=new URL(resourceUrl),events={authenticated:false,requestClosed:false,responseEnded:false,responseClosed:false,socketClosed:false,failed:false};
    let response=null,request=null,size=0,status=null,header=null,body=null;const chunks=[];
    const bad=()=>{events.failed=true;};
    try{
      request=requestHttps({protocol:'https:',hostname:'127.0.0.1',family:4,port:Number(u.port),path:'/funding',method:'POST',agent:false,
        ca:cert,rejectUnauthorized:true,servername:'',minVersion:'TLSv1.3',maxVersion:'TLSv1.3',ALPNProtocols:['http/1.1'],maxHeaderSize:16384,
        headers:{Host:u.host,Connection:'close',Accept:'application/json','Content-Length':'0'}},incoming=>{
        response=incoming;status=incoming.statusCode;header=incoming.headers['payment-required'];
        incoming.on('error',bad);incoming.once('aborted',bad);incoming.once('close',()=>{events.responseClosed=true;});
        incoming.on('data',chunk=>{size+=chunk.length;if(size>16384){bad();incoming.destroy();}else chunks.push(Buffer.from(chunk));});
        incoming.once('end',()=>{if(!incoming.complete)bad();body=Buffer.concat(chunks,size).toString('utf8');events.responseEnded=true;});
      });request.on('error',bad);request.once('close',()=>{events.requestClosed=true;});
      request.once('socket',socket=>{socket.on('error',bad);socket.once('close',()=>{events.socketClosed=true;});
        socket.once('secureConnect',()=>{if(socket.authorized&&socket.remoteAddress==='127.0.0.1'&&socket.getProtocol()==='TLSv1.3'
          &&socket.alpnProtocol==='http/1.1'&&!socket.isSessionReused())events.authenticated=true;else bad();});});
      request.end();
      if(await DRAIN(F(()=>events.failed?'UNKNOWN':events.authenticated&&events.requestClosed&&events.responseEnded&&events.responseClosed&&events.socketClosed?'DRAINED':'BUSY'),5000)!==true
          ||status!==402||body!=='Payment Required'||typeof header!=='string')fail();
      return F({status,paymentRequiredHeader:header,body});
    }catch{try{request?.destroy();response?.destroy();}catch{}hold();throw problem();}
  }
  return F({challenge:F(()=>{live();return F({origin,rpcPort:rpc.port,payeeAddress:c.payeeAddress,...boundChallenge});}),
    retainOriginal,activate,arm,finish,balances:F(balances),timingPage:F(timingPage),
    openMeasurementWindow,stopMeasurementWindow,measurementWindowSnapshot:measurement.snapshot,close:F(close),
    inspect:F(()=>{try{current();if(portOwner!==null&&!portOwner.clean()||appCloseReturned&&(app.snapshot().phase!=='CLOSED'||app.snapshot().uncertain)
        ||rpcCloseReturned&&(rpc.inspect().phase!=='CLOSED'||rpc.inspect().held))hold();}catch{hold();}
      return F({held,opening,active:active!==null,armed:armed!==null,executions,finished,totalUnits,
        timingUnknown,timingActive:tx!==null,timingRecords:records.length,
        measurementWindowPhase:measurement.snapshot().phase,measurementWindowUnknown:measurement.snapshot().unknown,
        appCloseReturned,rpcCloseReturned,borrowedStoresClosed,
        nativeQualified:false,authority:'NONE'});})});
}
function namespace(seal){const d=D(globalThis,NS);if(!d||!O(d,'value')||d.writable||d.configurable||d.enumerable||typeof d.value!=='function'||!Object.isFrozen(d.value))fail();
  try{CAPTURE_ROLE_DATA(d.value(),'SERVICE',seal);}catch{fail();}}
function exact(v,names){if(v===null||typeof v!=='object'||utilTypes.isProxy(v)||P(v)!==Object.prototype||K(v).length!==names.length)fail();
  const out={};for(const name of names){const d=D(v,name);if(!d||!O(d,'value')||!d.enumerable)fail();Object.defineProperty(out,name,{value:d.value,enumerable:true});}return out;}
function rootIdentity(root){if(typeof root!=='string'||!root.startsWith('/')||resolve(root)!==root||root!==process.env.SPV_TASK_SCRATCH)fail();
  for(let at=root;;at=dirname(at)){if(lstatSync(at).isSymbolicLink())fail();if(dirname(at)===at)break;}const s=lstatSync(root,{bigint:true});
  if(!s.isDirectory()||s.uid!==BigInt(process.getuid())||(s.mode&0o7777n)!==0o700n)fail();return DIRECTORY_ID({dev:s.dev,ino:s.ino,uid:s.uid,gid:s.gid,mode:s.mode},BigInt(process.getuid())).join(':');}
function fileIdentity(path){const s=lstatSync(path,{bigint:true});if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||s.uid!==BigInt(process.getuid())||(s.mode&0o7777n)!==0o600n)fail();
  return[s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink].map(String).join(':');}
function readPrivate(root,name,cap){const path=join(root,name);fileIdentity(path);const s=lstatSync(path,{bigint:true});if(s.size<1n||s.size>BigInt(cap))fail();
  const identity=v=>[v.dev,v.ino,v.uid,v.gid,v.mode,v.nlink,v.size,v.mtimeNs,v.ctimeNs].map(String).join(':'),before=identity(s),fd=openSync(path,C.O_RDONLY|C.O_NOFOLLOW);
  try{if(identity(fstatSync(fd,{bigint:true}))!==before)fail();const out=Buffer.alloc(Number(s.size)+1);let used=0;
    while(used<out.length){const n=readSync(fd,out,used,out.length-used,null);if(!n)break;used+=n;}
    if(used!==Number(s.size)||identity(fstatSync(fd,{bigint:true}))!==before||identity(lstatSync(path,{bigint:true}))!==before)fail();return Buffer.from(out.subarray(0,used));
  }finally{closeSync(fd);}}
function absent(path){try{lstatSync(path);}catch(e){if(e?.code==='ENOENT')return;fail();}fail();}
function integer(n,a,b){if(!Number.isSafeInteger(n)||Object.is(n,-0)||n<a||n>b)fail();}
function address(s){if(typeof s!=='string'||!/^z1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/.test(s))fail();}
function hash(s){return createHash('sha256').update(s).digest('hex');}
function momentumHash(n){return hash('native-issued-post-declared-momentum:'+n);}
function problem(){const e=new TypeError('NATIVE_CAPACITY_SERVICE_LANE_UNAVAILABLE');Object.defineProperty(e,'stack',{value:'TypeError: NATIVE_CAPACITY_SERVICE_LANE_UNAVAILABLE'});return F(e);}
function fail(){throw problem();}
