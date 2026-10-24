/* Versioned crash-qualification variant of the unchanged issued operator.
 * Preserves real funding/attestation/grant admission and the fixed two-unit
 * cost. The ONLY new owned capability is a synchronous afterServiceCommit
 * observer passed to the actual store's existing testHooks.afterCommit.
 * It does not replace the native store/transaction or weaken its reentry guard.
 * Source-only; separate full-graph native approval and managed launcher required.
 */
/*
 * EFFECTFUL QUALIFICATION SUPPORT, SOURCE-ONLY DRAFT. Do not import/run under a
 * DATA-only selection. Calling the factory generates ONE ephemeral synthetic
 * provider key, creates TWO new private service/intake files and registers TWO
 * actual offers. Later methods open/create at most two synthetic observer
 * SQLite files, sign at most two provider
 * envelopes and commit actual synthetic-ledger grants through the real funding
 * composition. No fake grant record, injected verifier, wallet, SDK PREPARE,
 * nonce search, socket, root creation, migration, deletion or cleanup.
 *
 * After successful construction the caller's separately approved native
 * harness owns the handed-off actual service/intake stores, managed scratch,
 * independent original pins, capability keys, app/client and their lifetimes.
 * This helper owns only its two observer opens
 * and provider key, never closes the handed-off service/intake stores, and
 * never adopts an existing service/intake file. Chain pages and the foreign
 * transaction are DECLARED
 * synthetic evidence, not node/SPV authentication, inclusion or production.
 */
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { types as utilTypes } from 'node:util';
import { canonicalJson } from '../src/canonical.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';
import { SERVICE_CREDIT_MODEL_VERSION } from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import { createZenonFundingIntakeSqliteStore, deriveZenonFundingIntakeSelectionKey } from '../src/service-credit-zenon-funding-intake-sqlite-store.js';
import { createZenonFundingObserverSqliteStore, openZenonFundingObserverSqliteStore,
  deriveZenonFundingObserverSqliteRecordKey } from '../src/service-credit-zenon-funding-observer-sqlite-store.js';
import { createZenonFundingObserverState, ZENON_FUNDING_OBSERVER_STATUS } from '../src/service-credit-zenon-funding-observer-state.js';
import { createZenonFundingComposition } from '../src/service-credit-zenon-funding-composition.js';
import { prepareZenonFundingResource, deriveZenonFundingObserverTarget } from '../src/service-credit-zenon-funding-evidence.js';
import { parseZenonFundingProviderAttestationAuthorityRecord,
  createZenonFundingProviderAttestationSigningBytes } from '../src/service-credit-zenon-funding-provider-attestation.js';
import { captureIssuedFundingPostServiceSelection } from '../src/x402-issued-funding-post-application-binding.js';
import { captureFundingPostCheckpointRoute } from '../src/x402-funding-post-checkpoint-route.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,P=Object.getPrototypeOf,K=Reflect.ownKeys,O=Object.hasOwn,A=Reflect.apply;
const IS_PROXY=utilTypes.isProxy,IS_PROMISE=utilTypes.isPromise,NativePromise=Promise,PP=NativePromise.prototype;
const THEN=D(PP,'then').value,SP=ServiceCreditSqliteStore.prototype;
const REGISTER=D(SP,'registerOffer').value,GET_GRANT=D(SP,'getGrant').value;
const MAX=F({providerKeys:1,providerSignatureCalls:2,activations:2,initialSqliteFiles:2,observerFiles:2,
  pages:2,pageMembers:4,policyCalls:32,confirmationMomentums:3,serviceCommitCallbacks:256});
const CATCH_UP=F({maximumPageEntries:4,maximumBackfillSpan:8,maximumMembersPerMomentum:4});
const ASSET='zts1znnxxxxxxxxxxxxx9z4ulx';
let moduleSlot=null,constructionAttempts=0;

export function createNativeIssuedFundingPostCrashGrantOperatorFixture(options) {
  assert.equal(arguments.length,1);
  assert.equal(process.env.X402_RECOVERY_CRASH_CHILD_SELECTION,'one-owned-committed-intent-source-draft');
  assert.equal(moduleSlot,null);
  assert.equal(constructionAttempts,0);
  const c=exact(options,['root','resourceUrl','ledgerDomain',
    'primarySelection','foreignSelection','payee','chainProfile','bootstrapCheckpoint','nowEpochMs','afterServiceCommit']);
  assert.equal(typeof c.afterServiceCommit,'function');assert.equal(IS_PROXY(c.afterServiceCommit),false);
  assert.equal(Object.isFrozen(c.afterServiceCommit),true);
  const root=privateRoot(c.root);
  captureFundingPostCheckpointRoute(c.resourceUrl);
  assert.equal(typeof c.ledgerDomain,'string');assert.ok(c.ledgerDomain.length>0&&c.ledgerDomain.length<=128);
  const primary=captureIssuedFundingPostServiceSelection(c.primarySelection);
  const foreign=captureIssuedFundingPostServiceSelection(c.foreignSelection);
  assert.notEqual(primary.offerId,foreign.offerId);assert.notEqual(primary.capabilityCommitment,foreign.capabilityCommitment);
  assert.equal(primary.holderId,foreign.holderId);
  assert.equal(typeof c.payee,'string');assert.ok(c.payee.length>0&&c.payee.length<=128);
  assert.ok(Number.isSafeInteger(c.nowEpochMs)&&c.nowEpochMs>0&&c.nowEpochMs<=Number.MAX_SAFE_INTEGER-60000);
  const chain=F(exact(c.chainProfile,['version','chainIdentifier','genesisMomentumHash']));
  assert.equal(chain.version,1);assert.equal(typeof chain.chainIdentifier,'string');assert.match(chain.chainIdentifier,/^[1-9][0-9]*$/);
  assert.ok(BigInt(chain.chainIdentifier)<=BigInt(Number.MAX_SAFE_INTEGER));
  assert.equal(typeof chain.genesisMomentumHash,'string');assert.match(chain.genesisMomentumHash,/^[0-9a-f]{64}$/);
  assert.notEqual(chain.genesisMomentumHash,'0'.repeat(64));
  const checkpoint=F(exact(c.bootstrapCheckpoint,['height','hash']));
  assert.ok(Number.isSafeInteger(checkpoint.height)&&checkpoint.height>=2&&checkpoint.height<=Number.MAX_SAFE_INTEGER-3);
  assert.match(checkpoint.hash,/^[0-9a-f]{64}$/);
  const nowEpochMs=c.nowEpochMs,epoch=Math.floor(nowEpochMs/1000),resourceUrl=c.resourceUrl;
  const ledgerDomain=c.ledgerDomain;
  const servicePath=join(root,'native-issued-service.sqlite'),intakePath=join(root,'native-issued-intake.sqlite');
  for(const path of [servicePath,intakePath])for(const suffix of ['','-journal','-wal','-shm'])
    assert.throws(()=>lstatSync(path+suffix),e=>e.code==='ENOENT');
  const rootIdentity=directoryIdentity(root),publicProfile='native.issued-post.fixture';
  const owners=new Map(),used=new Set(),lastGrants=new Map();
  const counts={providerKeys:0,initialSqliteCreateAttempts:0,initialSqliteFiles:0,providerSignatureCalls:0,activations:0,observerOpenAttempts:0,
    observerCreateAttempts:0,pages:0,inclusions:0,policyCalls:0,observerCloseCalls:0,serviceCommitCallbacks:0};
  let held=false,closing=false,closed=false,pending=null,closePromise=null,privateKey=null,serviceStore=null,intakeStore=null;
  const slot={phase:'CONSTRUCTING',serviceStore:null,intakeStore:null};moduleSlot=slot;constructionAttempts++;
  function live(){assert.ok(!held&&!closing&&!closed);assert.equal(directoryIdentity(root),rootIdentity);}
  try {
    const now=F(function now(){assert.equal(arguments.length,0);return nowEpochMs;});
    assert.ok(++counts.initialSqliteCreateAttempts<=MAX.initialSqliteFiles);
    serviceStore=ServiceCreditSqliteStore.create({databasePath:servicePath,allowedRoot:root,
      deriveCost:F(function deriveCost(){return 2;}),now,
      testHooks:F({afterCommit:F(function afterCommit(observation){
        assert.ok(++counts.serviceCommitCallbacks<=MAX.serviceCommitCallbacks);
        const event=F(exact(observation,['operation','changed']));
        assert.equal(typeof event.operation,'string');assert.equal(typeof event.changed,'boolean');
        assert.equal(c.afterServiceCommit(event),undefined);
      })})});slot.serviceStore=serviceStore;counts.initialSqliteFiles++;
    assert.ok(++counts.initialSqliteCreateAttempts<=MAX.initialSqliteFiles);
    intakeStore=createZenonFundingIntakeSqliteStore({databasePath:intakePath,allowedRoot:root,ledgerDomain,maxChallenges:2});
    slot.intakeStore=intakeStore;counts.initialSqliteFiles++;assert.equal(counts.initialSqliteFiles,MAX.initialSqliteFiles);
    privateFile(servicePath);privateFile(intakePath);
    const loadIntake=D(P(intakeStore),'loadBySelectionKey').value;
    counts.providerKeys++;assert.ok(counts.providerKeys<=MAX.providerKeys);
    const pair=generateKeyPairSync('ed25519');privateKey=pair.privateKey;
    const encoded=pair.publicKey.export({format:'der',type:'spki'});
    const publicKey=encoded.subarray(-32).toString('base64url');
    const authorityRecord=canonicalJson({
      authorityRecordVersion:1,authorityProfileId:'zenon.provider-attestation',authorityProfileVersion:1,verifierVersion:1,
      providerAuthorityId:publicProfile,generationId:publicProfile+'.generation',generationVersion:1,
      keyId:publicProfile+'.key',algorithm:'Ed25519',publicKey,network:'zenon:testnet',chainProfile:chain,
      observerPolicy:{policyId:'zenon.injected-observer',policyVersion:1,verifierVersion:1},
      confirmationPolicy:{policyId:'zenon.authenticated-momentum-inclusion',policyVersion:1,minimumConfirmations:3},
      bootstrapCheckpoint:checkpoint,sourcePolicyCommitment:digest('source-policy'),
      maximumAttestationBytes:4096,maximumCanonicalBytes:524288,maximumInitialAgeSeconds:300,
      maximumFutureSkewSeconds:5,maximumValiditySeconds:300
    });
    const authority=parseZenonFundingProviderAttestationAuthorityRecord(authorityRecord);
    const offers=new Map();
    for(const selection of [primary,foreign]){
      const offer=F({modelVersion:SERVICE_CREDIT_MODEL_VERSION,providerId:publicProfile,serviceId:publicProfile+'.service',
        resourceId:publicProfile+'.resource',resourceBinding:deriveServiceCreditResourceBinding({
          resourceId:publicProfile+'.resource',resourceUrl}),offerId:selection.offerId,offerVersion:selection.offerVersion,
        costPolicyId:'cost.fixed',fundingPolicyId:publicProfile+'.funding',fundingPolicyVersion:1});
      A(REGISTER,serviceStore,[offer]);offers.set(selection.offerId,offer);
    }
    const deriveFundingTerms=F(function deriveFundingTerms(input){
      live();assert.ok(++counts.policyCalls<=MAX.policyCalls);
      const value=exact(input,['offer','holderId','capabilityCommitment']);
      const offer=read(value.offer,'offerId')===primary.offerId?offers.get(primary.offerId):offers.get(foreign.offerId);
      const selected=offer.offerId===primary.offerId?primary:foreign;
      assert.equal(canonicalJson(value.offer),canonicalJson(offer));
      assert.equal(value.holderId,selected.holderId);assert.equal(value.capabilityCommitment,selected.capabilityCommitment);
      return {fundingPolicyId:offer.fundingPolicyId,fundingPolicyVersion:offer.fundingPolicyVersion,
        totalUnits:10,expiresAt:nowEpochMs+60000,requirement:{scheme:'exact',network:'zenon:testnet',asset:ASSET,
          amount:'5',payTo:c.payee,maxTimeoutSeconds:60,extra:{paymentFlow:'upfront',poc:true,settlement:'account-block',
            zenonChain:{...chain},minimumMomentumConfirmations:authority.confirmationPolicy.minimumConfirmations}}};
    });
    function pinObserver(label,observer,path,recordKey){
      // Retain the returned actual owner BEFORE a load or validation can throw.
      const owner={store:observer,path,recordKey,fileIdentity:null,closeEntered:false,closeReturned:false};
      owners.set(label,owner);
      assert.ok(owners.size<=MAX.observerFiles);
      owner.fileIdentity=privateFile(path);
      const loaded=observer.load();assert.equal(loaded.recordKey,recordKey);
      assert.equal(privateFile(path),owner.fileIdentity);
      return loaded;
    }
    function threshold(observer){
      const before=observer.load().state;
      assert.equal(before.status,ZENON_FUNDING_OBSERVER_STATUS.AWAITING_INCLUSION);
      const frontier={height:before.checkpoint.height+3,hash:momentumHash(before.checkpoint.height+3)};
      const planned=observer.planBackfill({expectedRevision:before.revision,frontier});
      assert.ok(planned.plan.throughHeight-planned.plan.fromHeight+1<=MAX.confirmationMomentums);
      let previousHash=planned.plan.startCheckpoint.hash;const momentums=[];
      for(let height=planned.plan.fromHeight;height<=planned.plan.throughHeight;height++){
        const hash=momentumHash(height);momentums.push({height,hash,previousHash,
          members:height===planned.plan.fromHeight?[{transactionId:before.target.transactionId,targetBindingDigest:before.targetBindingDigest}]:[]});
        previousHash=hash;
      }
      assert.ok(++counts.pages<=MAX.pages);
      const advanced=observer.applyPage({expectedRevision:before.revision,plan:planned.plan,momentums});
      const page=advanced.state.catchUp.lastAppliedPage;assert.ok(page.targetMembership!==null);
      counts.inclusions++;
      const observed=observer.applyInclusion({expectedRevision:advanced.state.revision,target:advanced.state.target,observation:{
        status:'FOUND',transactionId:advanced.state.target.transactionId,targetBindingDigest:advanced.state.targetBindingDigest,
        momentumHeight:page.targetMembership.momentumHeight,momentumHash:page.targetMembership.momentumHash,pageDigest:page.pageDigest}});
      assert.equal(observed.state.status,ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED);
      return observed;
    }
    async function activate(label,observer,offer,challenge,hash){
      const observed=threshold(observer),prepared=observer.load();
      assert.equal(prepared.outbox.status,'PREPARED');const request=observer.peekPreparedAttestation();
      const issuedAt=epoch,validUntil=issuedAt+120;
      const signingBytes=createZenonFundingProviderAttestationSigningBytes({request,issuedAt,validUntil});
      assert.ok(++counts.providerSignatureCalls<=MAX.providerSignatureCalls);
      const signature=sign(null,signingBytes,privateKey).toString('base64url');
      const committed=observer.commitAuthenticatedEnvelope({expectedObserverRevision:observed.state.revision,
        expectedOutboxRevision:prepared.outbox.revision,attestationId:request.attestationId,
        envelope:{envelopeVersion:1,attestationId:request.attestationId,keyId:authority.keyId,issuedAt,validUntil,signature},
        nowEpochSeconds:epoch});
      assert.equal(committed.disposition,'READY');
      const verified=observer.matchReadyFundingEvidence(committed.fundingEvidence);
      assert.equal(verified.transactionId,'zenontx:'+hash);
      const ready=canonicalJson(observer.projectCommittedFundingEvidence());
      const composition=createZenonFundingComposition({serviceCreditStore:serviceStore,fundingObserverStore:observer,
        authorityRecord,deriveFundingTerms,now});
      const activated=await composition.activateCommittedFunding({intent:challenge.activationIntent,paymentRequired:challenge.paymentRequired});
      const grant=A(GET_GRANT,serviceStore,[activated.grant.grantId]);
      assert.equal(canonicalJson(grant),canonicalJson(activated.grant));
      assert.equal(grant.lifecycle,'ACTIVE');assert.equal(grant.transactionId,'zenontx:'+hash);
      assert.equal(grant.offerId,offer.offerId);assert.equal(grant.capabilityCommitment,challenge.activationIntent.capabilityCommitment);
      assert.equal(canonicalJson(observer.projectCommittedFundingEvidence()),ready);
      assert.ok(++counts.activations<=MAX.activations);lastGrants.set(label,F({grantId:grant.grantId,transactionHash:hash}));
      return F({grant,activation:activated.activation,syntheticProviderEnvelope:true,chainObservations:'DECLARED_NOT_AUTHENTICATED'});
    }
    function launch(work,label){
      live();assert.equal(pending,null);assert.ok(!used.has(label));used.add(label);
      const cap=capability();pending=cap.promise;slot.phase='OPERATING';
      const clear=()=>{if(pending===cap.promise)pending=null;slot.phase=held?'HELD':closing?'CLOSING':'READY';};
      observe(cap.promise,clear,clear);
      try{observe(work(),value=>cap.resolve(value),()=>{held=true;cap.reject(problem('OPERATION_UNKNOWN'));});}
      catch{held=true;cap.reject(problem('OPERATION_UNKNOWN'));}
      return cap.promise;
    }
    const activateBoundOriginal=F(function activateBoundOriginal(input){
      assert.equal(arguments.length,1);
      const pins=exact(input,['transactionHash','paymentRequiredHeader']);
      assert.equal(typeof pins.transactionHash,'string');assert.match(pins.transactionHash,/^[0-9a-f]{64}$/);
      assert.equal(typeof pins.paymentRequiredHeader,'string');assert.ok(pins.paymentRequiredHeader.length>0&&pins.paymentRequiredHeader.length<=5464);
      return launch(async()=>{
        const selectionKey=deriveZenonFundingIntakeSelectionKey({ledgerDomain,selection:primary});
        const row=A(loadIntake,intakeStore,[selectionKey]);
        assert.equal(read(row,'status'),'BOUND');const issue=read(row,'issue'),binding=read(row,'binding');
        assert.equal(canonicalJson(read(issue,'selection')),canonicalJson(primary));
        assert.equal(read(issue,'authorityRecord'),authorityRecord);
        assert.equal(read(read(issue,'frame'),'paymentRequiredHeader'),pins.paymentRequiredHeader);
        assert.equal(read(binding,'transactionHash'),pins.transactionHash);
        const foreignPin=lastGrants.get('foreign');
        if(foreignPin!==undefined)assert.notEqual(foreignPin.transactionHash,pins.transactionHash);
        const fileName='funding-observer-'+pins.transactionHash+'.sqlite';
        assert.equal(read(binding,'observerFileName'),fileName);
        const path=join(root,fileName);privateFile(path);
        assert.ok(!owners.has('primary')&&owners.size<MAX.observerFiles);
        assert.ok(++counts.observerOpenAttempts<=1);
        const observer=openZenonFundingObserverSqliteStore({databasePath:path,allowedRoot:root,
          expectedRecordKey:read(binding,'observerRecordKey'),authorityRecord});
        const loaded=pinObserver('primary',observer,path,read(binding,'observerRecordKey'));
        assert.equal(canonicalJson(loaded.state.target),canonicalJson(read(binding,'observerTarget')));
        return activate('primary',observer,read(issue,'offer'),read(issue,'challenge'),pins.transactionHash);
      },'primary');
    });
    const activateDeclaredForeign=F(function activateDeclaredForeign(input){
      assert.equal(arguments.length,1);const pins=exact(input,['declaredTransactionHash']);
      assert.equal(typeof pins.declaredTransactionHash,'string');assert.match(pins.declaredTransactionHash,/^[0-9a-f]{64}$/);
      return launch(async()=>{
        const hash=pins.declaredTransactionHash;const primaryPin=lastGrants.get('primary');
        if(primaryPin!==undefined)assert.notEqual(primaryPin.transactionHash,hash);
        const prepared=prepareZenonFundingResource({offer:offers.get(foreign.offerId),selection:foreign,resourceUrl,
          deriveFundingTerms,authorityProfile:authority.authorityProfile,now});
        const target=deriveZenonFundingObserverTarget({offer:prepared.offer,challenge:prepared.challenge,
          authorityProfile:authority.authorityProfile,transactionHash:hash,payer:foreign.holderId,resourceUrl});
        const initialState=createZenonFundingObserverState({observerPolicy:authority.observerPolicy,
          authorityGeneration:authority.authorityGeneration,chainProfile:authority.chainProfile,
          confirmationPolicy:authority.confirmationPolicy,target,checkpoint:authority.bootstrapCheckpoint,catchUp:CATCH_UP});
        const recordKey=deriveZenonFundingObserverSqliteRecordKey(initialState,authorityRecord);
        const path=join(root,'declared-foreign-funding-observer.sqlite');
        assert.throws(()=>lstatSync(path),e=>e.code==='ENOENT');
        assert.ok(!owners.has('foreign')&&owners.size<MAX.observerFiles);
        assert.ok(++counts.observerCreateAttempts<=1);
        const observer=createZenonFundingObserverSqliteStore({databasePath:path,allowedRoot:root,initialState,authorityRecord});
        pinObserver('foreign',observer,path,recordKey);
        return activate('foreign',observer,prepared.offer,prepared.challenge,hash);
      },'foreign');
    });
    function finishClose(cap){
      if(held){slot.phase='HELD';cap.reject(problem('CLOSE_UNKNOWN'));return;}
      try{
        assert.equal(directoryIdentity(root),rootIdentity);
        let anyCloseUnknown=false;
        for(const owner of owners.values()){
          try{
            assert.equal(owner.closeEntered,false);assert.equal(privateFile(owner.path),owner.fileIdentity);
            owner.closeEntered=true;counts.observerCloseCalls++;
            assert.equal(owner.store.close(),undefined);owner.closeReturned=true;
            assert.equal(privateFile(owner.path),owner.fileIdentity);
          }catch{anyCloseUnknown=true;}
        }
        assert.equal(anyCloseUnknown,false);
        privateKey=null;closed=true;slot.phase='CLOSED';if(moduleSlot===slot)moduleSlot=null;cap.resolve(undefined);
      }catch{held=true;slot.phase='HELD';cap.reject(problem('CLOSE_UNKNOWN'));}
    }
    const closeOwnedObservers=F(function closeOwnedObservers(){
      assert.equal(arguments.length,0);if(closePromise!==null)return closePromise;
      const cap=capability();closePromise=cap.promise;closing=true;slot.phase='CLOSING';
      if(pending===null)finishClose(cap);
      else observe(pending,()=>finishClose(cap),()=>{held=true;finishClose(cap);});
      return closePromise;
    });
    const snapshot=F(function snapshot(){
      assert.equal(arguments.length,0);
      return F({nativeIssuedFundingGrantOperatorFixtureVersion:1,nativeIssuedFundingCrashGrantOperatorFixtureVersion:1,phase:slot.phase,held,closing,closed,constructionAttempts,
        operationPending:pending!==null,counts:F({...counts}),maximum:MAX,ownedObserverOpens:owners.size,
        serviceStoreHandedOffToHarness:true,intakeStoreHandedOffToHarness:true,privateKeyPersisted:false,
        privateKeyErasureGuaranteed:false,nativeRuntimeQualified:false,chainObservations:'DECLARED_NOT_AUTHENTICATED'});
    });
    slot.phase='READY';
    return F({authorityRecord,deriveFundingTerms,now,observerCatchUp:CATCH_UP,serviceStore,intakeStore,
      primarySelection:primary,foreignSelection:foreign,activateBoundOriginal,activateDeclaredForeign,closeOwnedObservers,snapshot});
  }catch{
    // Registration/key/SQL acquisition can already have happened. Do not clean,
    // retry, close borrowed stores or pretend an unknown construction released.
    held=true;slot.phase='HELD';throw problem('CONSTRUCTION_UNKNOWN');
  }
}
function privateRoot(value){
  assert.equal(typeof value,'string');assert.ok(isAbsolute(value)&&resolve(value)===value);
  assert.equal(value,process.env.SPV_TASK_SCRATCH);
  for(let at=value;;at=dirname(at)){assert.equal(lstatSync(at).isSymbolicLink(),false);if(dirname(at)===at)break;}
  const s=lstatSync(value);assert.ok(s.isDirectory());assert.equal(s.uid,process.getuid());assert.equal(s.mode&0o777,0o700);assert.equal(s.mode&0o7000,0);
  assert.equal(realpathSync(value),value);return value;
}
function directoryIdentity(path){const s=lstatSync(path,{bigint:true});assert.ok(s.isDirectory()&&!s.isSymbolicLink());
  assert.equal(s.uid,BigInt(process.getuid()));assert.equal(s.mode&0o777n,0o700n);assert.equal(s.mode&0o7000n,0n);
  return [s.dev,s.ino,s.uid,s.mode].map(String).join(':');}
function privateFile(path){const s=lstatSync(path,{bigint:true});assert.ok(s.isFile()&&!s.isSymbolicLink());
  assert.equal(s.uid,BigInt(process.getuid()));assert.equal(s.nlink,1n);assert.equal(s.mode&0o777n,0o600n);assert.equal(s.mode&0o7000n,0n);
  assert.ok(s.size<=4n*1024n*1024n);return [s.dev,s.ino,s.uid,s.mode].map(String).join(':');}
function exact(value,names){assert.ok(value!==null&&typeof value==='object'&&!IS_PROXY(value));assert.equal(P(value),Object.prototype);
  assert.equal(K(value).length,names.length);const out={};for(const name of names)Object.defineProperty(out,name,{value:read(value,name),enumerable:true});return out;}
function read(value,name){assert.ok(value!==null&&typeof value==='object'&&!IS_PROXY(value));
  const d=D(value,name);assert.ok(d&&O(d,'value')&&d.enumerable);return d.value;}
function digest(label){return 'sha256:'+createHash('sha256').update('native-issued-post-fixture:'+label).digest('hex');}
function momentumHash(height){return createHash('sha256').update('native-issued-post-declared-momentum:'+height).digest('hex');}
function observe(value,yes,no){assert.ok(IS_PROMISE(value)&&!IS_PROXY(value));assert.equal(P(value),PP);
  const branch=A(THEN,value,[yes,no]);A(THEN,branch,[discard,discard]);}
function capability(){let resolve,reject;const promise=new NativePromise((yes,no)=>{resolve=yes;reject=no;});
  A(THEN,promise,[discard,discard]);return{promise,resolve,reject};}
function problem(code){const e=new Error('NATIVE_ISSUED_FUNDING_GRANT_FIXTURE_'+code);
  Object.defineProperty(e,'stack',{value:'Error: '+e.message});return F(e);}
function discard(){}
