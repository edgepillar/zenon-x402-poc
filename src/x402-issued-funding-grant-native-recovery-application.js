// SOURCE/PARSER ONLY. Explicit recorded restore on one shared listener.
// No funding SDK server is constructed or imported by this entry.
import { types } from 'node:util';
import { hrtime } from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { restoreIssuedFundingGrantApplicationCore } from './x402-issued-funding-grant-application-core.js';
import { restoreIssuedFundingGrantRecordedBackend,captureIssuedFundingGrantRecoveryExpectation } from './x402-issued-funding-grant-recovery.js';
import { createIssuedOriginalGrantAdmissionOwner } from './issued-original-grant-admission-owner.js';
import { createServiceCreditBoundedHttpsIngressOwnerForIssuedFundingGrant } from './service-credit-bounded-https-ingress-owner.js';
import { createDurableServiceCreditHttpSession } from './service-credit-durable-http-session.js';
import { createOriginalFundingGrantNativeHttpDownstream } from './service-credit-original-grant-native-http-downstream.js';
import { ZenonFundingIntakeSqliteStore } from './service-credit-zenon-funding-intake-sqlite-store.js';
import { ServiceCreditSqliteStore } from './service-credit-sqlite-store.js';
import { createServiceCreditBoundedNodeHttpsServerFactory } from './service-credit-bounded-node-https-server-factory.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply;
const INTAKE=ZenonFundingIntakeSqliteStore.prototype,SERVICE=ServiceCreditSqliteStore.prototype;
const LOAD=D(INTAKE,'loadBound').value,GET=D(SERVICE,'getGrant').value;
const ORIGINAL=D(SERVICE,'readOriginalFundingGrant').value;
const CUSTODY=D(INTAKE,'officialOutcomeCustody').value;
const CLOCK=hrtime.bigint,SCHEDULE=setTimeout,CANCEL=clearTimeout;
function historyRows(store){return F(()=>A(LOAD,store,[]));}
function exact(value,keys){
  if(value===null||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)
    throw new TypeError('ISSUED_FUNDING_GRANT_NATIVE_RECOVERY_CONFIGURATION');
  const out={};for(const key of keys){const d=D(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))throw new TypeError('ISSUED_FUNDING_GRANT_NATIVE_RECOVERY_CONFIGURATION');out[key]=d.value;}return out;
}
function brand(value,prototype,name,method){
  if(value===null||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==prototype
      ||Object.hasOwn(value,name)||D(prototype,name)?.value!==method)throw new TypeError('ISSUED_FUNDING_GRANT_NATIVE_STORE');
}
/** Fixed native factories only. Explicit pinned history restore. Both SQL stores are borrowed; activation stays
 * external and explicit. Never reopen, replace or force-close a held owner. */
export async function restoreIssuedFundingGrantNativeApplication(options){
  if(arguments.length!==1)throw new TypeError('ISSUED_FUNDING_GRANT_NATIVE_RECOVERY_CONFIGURATION');
  const c=exact(options,['funding','service','transport','recovery']);
  const recovery=captureIssuedFundingGrantRecoveryExpectation(c.recovery),f=exact(c.funding,['intake','official','maxIntakeAttempts','closeBudgetMs']);
  const i=exact(f.intake,['store','serviceCreditStore','authorityRecord','deriveFundingTerms','now','observerRoot','observerCatchUp','selection','resourceUrl']);
  const selection=F(exact(i.selection,['offerId','offerVersion','holderId','capabilityCommitment']));
  const official=F(exact(f.official,['localFacilitator','validateChallenge','reconcilePendingSettlement','maxPendingReconciliations']));
  const funding=F({...f,official,intake:F({...i,selection,observerCatchUp:F(exact(i.observerCatchUp,['maximumPageEntries','maximumBackfillSpan','maximumMembersPerMomentum']))})});
  const t=exact(c.transport,['origin','generation','limits','bind','tlsMaterial']),s=exact(c.service,['store','execute','selectedDurationMs']);
  const bind=F(exact(t.bind,['host','port','exclusive'])),tlsMaterial=F(exact(t.tlsMaterial,['key','cert']));
  const schedule=F((callback,delay)=>SCHEDULE(callback,delay)),cancel=F(token=>{CANCEL(token);});
  // Material is copied by the real factory only when the owned start enters
  // server construction. A refused core constructor acquires no TLS copy.
  const nativeServerFactory=F((settings,callbacks)=>createServiceCreditBoundedNodeHttpsServerFactory(F({bind,tlsMaterial}))(settings,callbacks));
  const transport=F({origin:t.origin,generation:t.generation,limits:t.limits,deadlineRuntime:F({schedule,cancel}),httpsServerFactory:nativeServerFactory});
  const service=F({...s,deadlineRuntime:F({monotonicNowNs:F(()=>A(CLOCK,hrtime,[])),schedule,cancel})});
  let originalRead=null;
  const root=await restoreIssuedFundingGrantApplicationCore(F({funding,service,transport,recovery}),F({
    createFunding:F(async c=>{
      const i=c.funding.intake;brand(i.store,INTAKE,'loadBound',LOAD);brand(i.store,INTAKE,'officialOutcomeCustody',CUSTODY);
      const store=i.store,port=A(CUSTODY,store,[i.selection]),read=D(port,'read')?.value;
      if(typeof read!=='function'||types.isProxy(read)||!Object.isFrozen(read))throw new TypeError('ISSUED_FUNDING_GRANT_NATIVE_HISTORY');
      originalRead=read;
      // Capture ONLY the fixed store's reader. No CAS, intake, issuer, SDK,
      // continuation, observer opener or borrowed-store closer is retained.
      return restoreIssuedFundingGrantRecordedBackend(F({expectation:c.recovery,serviceSelection:i.selection,
        resourceUrl:i.resourceUrl,maximumPendingReconciliations:c.funding.official.maxPendingReconciliations,
        port:F({loadBound:historyRows(store),readOfficialOutcome:read})}));
    }),
    createIngress:F((c,route)=>createServiceCreditBoundedHttpsIngressOwnerForIssuedFundingGrant({...c,httpsServerFactory:nativeServerFactory},route)),
    createServiceSession:F(c=>createDurableServiceCreditHttpSession(c)),
    createQueryDownstream:F((store,route)=>createOriginalFundingGrantNativeHttpDownstream(store,route)),
    validateStores:F((intake,service)=>{brand(intake,INTAKE,'loadBound',LOAD);brand(intake,INTAKE,'officialOutcomeCustody',CUSTODY);brand(service,SERVICE,'getGrant',GET);brand(service,SERVICE,'readOriginalFundingGrant',ORIGINAL);}),
    loadBound:F(store=>{brand(store,INTAKE,'loadBound',LOAD);return A(LOAD,store,[]);}),
    readCommittedGrant:F((store,id)=>{brand(store,SERVICE,'getGrant',GET);return A(GET,store,[id]);}),
  }));
  let admission;
  try{if(typeof originalRead!=='function')throw new TypeError('ISSUED_FUNDING_GRANT_NATIVE_HISTORY');
    admission=createIssuedOriginalGrantAdmissionOwner(F({expectation:recovery,selection,resourceUrl:i.resourceUrl,maximumPendingReconciliations:official.maxPendingReconciliations,
      port:F({providerSnapshot:root.snapshot,providerClose:root.close,loadBound:historyRows(i.store),readOfficialOutcome:originalRead,
        readOriginalFundingGrant:F(identity=>{brand(s.store,SERVICE,'readOriginalFundingGrant',ORIGINAL);return A(ORIGINAL,s.store,[identity]);}),
        admitCommittedServiceGrant:root.admitCommittedServiceGrant})}));}
  catch{try{await root.close();}catch{throw new TypeError('ISSUED_ORIGINAL_GRANT_ADMISSION_CLOSE_HELD');}throw new TypeError('ISSUED_FUNDING_GRANT_NATIVE_RECOVERY_CONFIGURATION');}
  return F({...root,close:admission.close,admitCommittedServiceGrant:admission.admitCommittedServiceGrant,admitOriginalCommittedServiceGrant:admission.admitOriginalCommittedServiceGrant,
    snapshot:F(function snapshot(){if(arguments.length!==0)throw new TypeError('ISSUED_FUNDING_GRANT_NATIVE_RECOVERY_CONFIGURATION');return F({...root.snapshot(),originalGrantAdmission:admission.snapshot()});})});
}
