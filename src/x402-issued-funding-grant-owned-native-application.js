// SOURCE/PARSER ONLY. Actual store/core/SDK/TLS acquisition is unexecuted.
import { createIssuedProviderExecutionSetupOwner } from './issued-provider-execution-setup.js';
import { admitRetainedIssuedProviderFundingResource } from './issued-provider-funding-resource-admission.js';
import { parseZenonFundingProviderAttestationAuthorityRecord } from './service-credit-zenon-funding-provider-attestation.js';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { captureIssuedProviderOwnedConfiguration } from './issued-provider-owned-configuration.js';
import { createIssuedProviderStoreOwner } from './issued-provider-store-owner.js';
import { ServiceCreditSqliteStore } from './service-credit-sqlite-store.js';
import { ZenonFundingIntakeSqliteStore,createZenonFundingIntakeOfficialCustodySqliteStore,openZenonFundingIntakeOfficialCustodySqliteStore } from './service-credit-zenon-funding-intake-sqlite-store.js';
import { createIssuedFundingGrantNativeApplication } from './x402-issued-funding-grant-native-application.js';
import { restoreIssuedFundingGrantNativeApplication } from './x402-issued-funding-grant-native-recovery-application.js';
import { restoreIssuedFundingGrantNativeJournalRecovery,restoreIssuedFundingGrantNativeWitnessedJournalRecovery } from './x402-issued-funding-grant-native-journal-recovery.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply;
const SERVICE=ServiceCreditSqliteStore.prototype,INTAKE=ZenonFundingIntakeSqliteStore.prototype;
const CREATE=D(ServiceCreditSqliteStore,'create').value,OPEN=D(ServiceCreditSqliteStore,'openExisting').value;
const REGISTER=D(SERVICE,'registerOffer').value,GET=D(SERVICE,'getOffer').value,SCLOSE=D(SERVICE,'close').value,ICLOSE=D(INTAKE,'close').value;
const SNAPSHOT=D(SERVICE,'getDurableExecutionSnapshot').value,INITIALIZE=D(SERVICE,'initializeDurableExecution').value,LOAD=D(INTAKE,'loadBound').value;
const PATHS=new Map(),ACTIVE=new Set();
function fail(){throw new TypeError('ISSUED_PROVIDER_OWNED_NATIVE_APPLICATION');}
function brand(v,prototype,name,fn){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==prototype||Object.hasOwn(v,name)||D(prototype,name)?.value!==fn)fail();}

/** Inert creation, explicit one-shot start. Fresh creates two NEW files and one
 * selected offer; recorded modes open the two EXISTING files and only compare
 * that offer. Never migrate, adopt, replace or fall back between these modes.
 * The canonical-path lease is process-local, not physical/cross-process fencing.
 * Journal, witness, observer and facilitator capabilities remain borrowed. */
export function createOwnedIssuedFundingGrantNativeApplication(configuration){
 if(arguments.length!==1)fail();const lease=captureIssuedProviderOwnedConfiguration(configuration),c=lease.configuration;
 if(c.executionSetup===null){lease.release();fail();}
 const keys=F([c.serviceStore.databasePath,c.intakeStore.databasePath]),frame={service:null,executionSetup:null,intake:null,root:null,opening:null,claimed:false,released:false};
 const port=F({
  claim:F(()=>{if(frame.claimed||frame.released)fail();if(ACTIVE.size>=16||keys.some(k=>PATHS.has(k)))return 'REFUSED';
   ACTIVE.add(frame);for(const k of keys)PATHS.set(k,frame);frame.claimed=true;return 'CLAIMED';}),
  openServiceStore:F(()=>{
   if(!frame.claimed||frame.released||frame.service!==null||D(ServiceCreditSqliteStore,c.storageMode==='CREATE_NEW'?'create':'openExisting')?.value!==(c.storageMode==='CREATE_NEW'?CREATE:OPEN))fail();
   frame.service=A(c.storageMode==='CREATE_NEW'?CREATE:OPEN,ServiceCreditSqliteStore,[c.serviceStore]);
   brand(frame.service,SERVICE,'registerOffer',REGISTER);brand(frame.service,SERVICE,'getOffer',GET);brand(frame.service,SERVICE,'close',SCLOSE);
   const offer=c.storageMode==='CREATE_NEW'?A(REGISTER,frame.service,[c.offer]):A(GET,frame.service,[F({offerId:c.offer.offerId,offerVersion:c.offer.offerVersion})]);
   if(canonicalJson(offer)!==canonicalJson(c.offer))fail();
   brand(frame.service,SERVICE,'getDurableExecutionSnapshot',SNAPSHOT);brand(frame.service,SERVICE,'initializeDurableExecution',INITIALIZE);
   const read=F(()=>{brand(frame.service,SERVICE,'getDurableExecutionSnapshot',SNAPSHOT);return A(SNAPSHOT,frame.service,[]);});
   const initialize=F(input=>{brand(frame.service,SERVICE,'initializeDurableExecution',INITIALIZE);return A(INITIALIZE,frame.service,[input]);});
   frame.executionSetup=createIssuedProviderExecutionSetupOwner(c.executionSetup,c.storageMode,F({read,...(c.storageMode==='CREATE_NEW'?{initialize}:{})}));
   frame.executionSetup.run();return frame.service;
  }),
  openIntakeStore:F(()=>{if(!frame.claimed||frame.released||frame.service===null||frame.intake!==null)fail();
   frame.intake=(c.storageMode==='CREATE_NEW'?createZenonFundingIntakeOfficialCustodySqliteStore:openZenonFundingIntakeOfficialCustodySqliteStore)(c.intakeStore);
   brand(frame.intake,INTAKE,'close',ICLOSE);return frame.intake;
  }),
  openProvider:F(async(service,intake)=>{
   if(service!==frame.service||intake!==frame.intake||frame.opening!==null||!frame.claimed||frame.released)fail();
   if(c.applicationMode!=='FRESH'){
    brand(intake,INTAKE,'loadBound',LOAD);
    const authority=parseZenonFundingProviderAttestationAuthorityRecord(c.funding.intake.authorityRecord);
    const readRows=F(()=>{brand(intake,INTAKE,'loadBound',LOAD);return A(LOAD,intake,[]);});
    admitRetainedIssuedProviderFundingResource(F({applicationMode:c.applicationMode,offer:c.offer,selection:c.funding.intake.selection,resourceUrl:c.funding.intake.resourceUrl,deriveFundingTerms:c.funding.intake.deriveFundingTerms,authorityProfile:authority.authorityProfile}),c.recovery,c.funding.intake.authorityRecord,readRows);
   }
   const options=F({funding:F({...c.funding,intake:F({...c.funding.intake,store:intake,serviceCreditStore:service})}),service:F({...c.service,store:service}),transport:c.transport,
    ...(c.applicationMode==='FRESH'?{}:{recovery:c.recovery}),...(['JOURNAL','WITNESSED'].includes(c.applicationMode)?{observation:c.observation}:{})});
   frame.opening=c.applicationMode==='FRESH'?createIssuedFundingGrantNativeApplication(options):c.applicationMode==='RECORDED'?restoreIssuedFundingGrantNativeApplication(options)
    :c.applicationMode==='JOURNAL'?restoreIssuedFundingGrantNativeJournalRecovery(options):restoreIssuedFundingGrantNativeWitnessedJournalRecovery(options);
   frame.root=await frame.opening;return frame.root;
  }),
  closeIntakeStore:F(store=>{if(store!==frame.intake||!frame.claimed||frame.released)fail();brand(store,INTAKE,'close',ICLOSE);return A(ICLOSE,store,[]);}),
  closeServiceStore:F(store=>{if(store!==frame.service||!frame.claimed||frame.released)fail();brand(store,SERVICE,'close',SCLOSE);return A(SCLOSE,store,[]);}),
  release:F(()=>{if(frame.released)return;lease.release();if(frame.claimed){if(!ACTIVE.has(frame)||keys.some(k=>PATHS.get(k)!==frame))fail();
    for(const k of keys)PATHS.delete(k);ACTIVE.delete(frame);frame.claimed=false;}frame.released=true;}),
 });
 try{return createIssuedProviderStoreOwner(F({methods:lease.methods,port}));}
 catch{lease.release();fail();}
}
