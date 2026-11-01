import { captureIssuedProviderExecutionSetup } from './issued-provider-execution-setup.js';
import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { dirname,isAbsolute,resolve } from 'node:path';
import { InMemoryServiceCreditModel } from './service-credit-model.js';
import { captureIssuedFundingPostServiceSelection } from './x402-issued-funding-post-application-binding.js';
import { captureOfficialFundingPostHttpsRoute } from './x402-official-funding-post-https-request-binding.js';
import { captureIssuedFundingGrantRecoveryExpectation } from './x402-issued-funding-grant-recovery.js';
import { captureServiceCreditBoundedHttpsIngressLimits,SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_LIMIT_FIELDS } from './service-credit-bounded-https-ingress-limits.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn,K=Reflect.ownKeys,A=Reflect.apply;
const TP=Object.getPrototypeOf(Uint8Array.prototype),LENGTH=D(TP,'length').get,ARRAYBUFFER=D(TP,'buffer').get,SET=TP.set,FILL=Buffer.prototype.fill;
const REGISTER=InMemoryServiceCreditModel.prototype.registerOffer;
const METHODS=F({FRESH:F(['admitCommittedServiceGrant','resumeOriginalSettlement','activateOriginalCommittedFunding','selectOriginalActivationObserver']),
 RECORDED:F(['admitCommittedServiceGrant','resumeOriginalSettlement','inspectOriginalCommittedServiceGrant','admitOriginalCommittedServiceGrant','admitOriginalCommittedServiceGrantResults']),
 JOURNAL:F(['admitCommittedServiceGrant','resumeOriginalSettlement','inspectOriginalCommittedServiceGrant','admitOriginalCommittedServiceGrant','admitOriginalCommittedServiceGrantResults','reconcileOriginalFunding','recoverOriginalFundingFirstResult']),
 WITNESSED:F(['admitCommittedServiceGrant','resumeOriginalSettlement','inspectOriginalCommittedServiceGrant','admitOriginalCommittedServiceGrant','admitOriginalCommittedServiceGrantResults','reconcileOriginalFunding','recoverOriginalFundingFirstResult','inspectOriginalFundingHistory'])});
function fail(){throw new TypeError('ISSUED_PROVIDER_OWNED_CONFIGURATION');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||K(v).length!==names.length)fail();
 const out={};for(const k of names){const d=D(v,k);if(!d?.enumerable||!O(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function integer(v,min,max){if(!Number.isSafeInteger(v)||Object.is(v,-0)||v<min||v>max)fail();return v;}
function text(v,max){if(typeof v!=='string'||!v.length||Buffer.byteLength(v)>max||Buffer.from(v).toString('utf8')!==v)fail();return v;}
function callable(v){if(typeof v!=='function'||types.isProxy(v)||!Object.isFrozen(v))fail();return v;}
function path(v){text(v,4096);if(v.includes('\0')||!isAbsolute(v)||resolve(v)!==v)fail();return v;}
function database(v){path(v.databasePath);path(v.allowedRoot);if(dirname(v.databasePath)!==v.allowedRoot||v.databasePath===v.allowedRoot)fail();}
function copyBytes(v,copies){if(v===null||types.isProxy(v)||!Buffer.isBuffer(v)||Object.getPrototypeOf(v)!==Buffer.prototype||D(v,'length')!==undefined||D(v,'buffer')!==undefined)fail();
 const n=A(LENGTH,v,[]),buffer=A(ARRAYBUFFER,v,[]);integer(n,1,65536);if(Object.getPrototypeOf(buffer)!==ArrayBuffer.prototype)fail();
 const bytes=Buffer.alloc(n);copies.push(bytes);if(A(SET,bytes,[v,0])!==undefined)fail();return bytes;}

/** Capture before the first file/store callback. No SQL, clock, authority,
 * facilitator, API executor or supplied function is invoked here. Offer
 * normalization uses the existing pure model with inert local capabilities.
 * This is structural DATA admission, not authority/TLS authentication. */
export function captureIssuedProviderOwnedConfiguration(options){
 if(arguments.length!==1)fail();const names=['applicationMode','serviceStore','intakeStore','offer','funding','service','transport','recovery','observation'];const c=fields(options,options!==null&&typeof options==='object'&&!types.isProxy(options)&&O(options,'executionSetup')?[...names,'executionSetup']:names);
 if(typeof c.applicationMode!=='string'||!O(METHODS,c.applicationMode))fail();
 const s=fields(c.serviceStore,['databasePath','allowedRoot','deriveCost','now','busyTimeoutMs','maxStateBytes','maxOffers','maxGrants','maxRequests']);database(s);callable(s.deriveCost);callable(s.now);
 integer(s.busyTimeoutMs,1,60000);integer(s.maxStateBytes,512,16777216);if(s.maxOffers!==1||s.maxGrants!==1)fail();integer(s.maxRequests,100,10000);
 const i=fields(c.intakeStore,['databasePath','allowedRoot','ledgerDomain','maxChallenges']);database(i);text(i.ledgerDomain,128);integer(i.maxChallenges,1,16);if(s.databasePath===i.databasePath)fail();
 const f=fields(c.funding,['intake','official','maxIntakeAttempts','closeBudgetMs']),fi=fields(f.intake,['authorityRecord','deriveFundingTerms','now','observerRoot','observerCatchUp','selection','resourceUrl']);
 text(fi.authorityRecord,65536);callable(fi.deriveFundingTerms);callable(fi.now);if(fi.now!==s.now)fail();path(fi.observerRoot);
 const selected=captureIssuedFundingPostServiceSelection(fi.selection),route=captureOfficialFundingPostHttpsRoute(fi.resourceUrl);
 const catchup=fields(fi.observerCatchUp,['maximumPageEntries','maximumBackfillSpan','maximumMembersPerMomentum']);for(const v of Object.values(catchup))integer(v,1,65536);
 const official=fields(f.official,['localFacilitator','validateChallenge','reconcilePendingSettlement','maxPendingReconciliations']);
 if(official.localFacilitator===null||typeof official.localFacilitator!=='object'||types.isProxy(official.localFacilitator))fail();callable(official.validateChallenge);callable(official.reconcilePendingSettlement);integer(official.maxPendingReconciliations,0,16);integer(f.maxIntakeAttempts,1,16);integer(f.closeBudgetMs,1,60000);
 const service=fields(c.service,['execute','selectedDurationMs']);callable(service.execute);integer(service.selectedDurationMs,1,60000);
 const executionSetup=O(c,'executionSetup')?captureIssuedProviderExecutionSetup(c.executionSetup,service.selectedDurationMs,s.maxRequests):null;
 const t=fields(c.transport,['origin','generation','limits','bind','tlsMaterial']),generation=fields(t.generation,['generationId','generationVersion']);
 text(generation.generationId,128);if(!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(generation.generationId))fail();integer(generation.generationVersion,1,Number.MAX_SAFE_INTEGER);
 if(t.origin!==new URL(route.resourceUrl).origin||route.resourceUrl!==t.origin+'/funding')fail();
 const limits=captureServiceCreditBoundedHttpsIngressLimits(F(fields(t.limits,SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_LIMIT_FIELDS)));if(limits===null)fail();
 const bind=fields(t.bind,['host','port','exclusive']);text(bind.host,255);if(!/^[A-Za-z0-9.:[\]-]+$/.test(bind.host)||bind.exclusive!==true)fail();integer(bind.port,0,65535);
 const material=fields(t.tlsMaterial,['key','cert']);
 const model=new InMemoryServiceCreditModel({deriveCost:F(()=>1),now:F(()=>0)}),offer=A(REGISTER,model,[c.offer]);
 if(offer.offerId!==selected.offerId||offer.offerVersion!==selected.offerVersion)fail();
 const recovery=c.applicationMode==='FRESH'?null:captureIssuedFundingGrantRecoveryExpectation(c.recovery);if(c.applicationMode==='FRESH'&&c.recovery!==null)fail();
 let observation=null;if(['JOURNAL','WITNESSED'].includes(c.applicationMode)){const v=fields(c.observation,c.applicationMode==='WITNESSED'?['journal','transitionWitness']:['journal']);
  for(const value of Object.values(v))if(value===null||typeof value!=='object'||types.isProxy(value))fail();observation=F(v);
 }else if(c.observation!==null)fail();
 const copies=[];let released=false;
 try{const key=copyBytes(material.key,copies),cert=copyBytes(material.cert,copies);
  const configuration=F({applicationMode:c.applicationMode,executionSetup,storageMode:c.applicationMode==='FRESH'?'CREATE_NEW':'OPEN_EXISTING',serviceStore:F(s),intakeStore:F(i),offer,
   funding:F({...f,intake:F({...fi,selection:selected,observerCatchUp:F(catchup)}),official:F(official)}),service:F(service),
   transport:F({...t,generation:F(generation),limits,bind:F(bind),tlsMaterial:F({key,cert})}),recovery,observation});
  const release=F(function release(){if(arguments.length!==0)fail();if(released)return;for(const v of copies)if(A(FILL,v,[0])!==v)fail();released=true;});
  return F({configuration,methods:METHODS[c.applicationMode],release});
 }catch{for(const v of copies)A(FILL,v,[0]);fail();}
}
