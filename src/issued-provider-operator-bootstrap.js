import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { dirname,isAbsolute,resolve } from 'node:path';
import { canonicalJson,sha256Hex } from './canonical.js';
import { InMemoryServiceCreditModel } from './service-credit-model.js';
import { createFixedZenonFundingPolicy } from './service-credit-zenon-fixed-funding-policy.js';
import { captureIssuedProviderChainSelection } from './issued-provider-chain-selection.js';
import { captureIssuedFundingPostServiceSelection } from './x402-issued-funding-post-application-binding.js';
import { captureIssuedFundingGrantRecoveryExpectation } from './x402-issued-funding-grant-recovery.js';
import { captureServiceCreditBoundedHttpsIngressLimits,SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_LIMIT_FIELDS } from './service-credit-bounded-https-ingress-limits.js';
import { captureBuyerOriginalFundingCommandLimits } from './buyer-original-funding-command.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,PREPARED=new WeakMap(),REGISTER=InMemoryServiceCreditModel.prototype.registerOffer;
const ABORTED=D(AbortSignal.prototype,'aborted').get,EMPTY='sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const TP=Object.getPrototypeOf(Uint8Array.prototype),LENGTH=D(TP,'byteLength').get,AB=D(TP,'buffer').get,READ32=Buffer.prototype.readUInt32BE,SUBARRAY=Buffer.prototype.subarray,FILL=Buffer.prototype.fill;
function fail(){throw new TypeError('ISSUED_PROVIDER_OPERATOR_BOOTSTRAP');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length)fail();
 const out={};for(const k of names){const d=D(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function integer(v,min,max){if(!Number.isSafeInteger(v)||Object.is(v,-0)||v<min||v>max)fail();return v;}
function text(v,max){if(typeof v!=='string'||!v.length||Buffer.byteLength(v)>max||Buffer.from(v).toString('utf8')!==v)fail();return v;}
function path(v){text(v,4096);if(v.includes('\0')||!isAbsolute(v)||resolve(v)!==v)fail();return v;}
function child(file,root){path(file);path(root);if(dirname(file)!==root)fail();}
function json(v,depth=0,budget={nodes:8192,bytes:262144}){
 if(--budget.nodes<0||depth>24)fail();if(v===null||typeof v==='boolean')return v;
 if(typeof v==='string'){budget.bytes-=Buffer.byteLength(v);if(budget.bytes<0||Buffer.from(v).toString('utf8')!==v)fail();return v;}
 if(typeof v==='number'){if(!Number.isSafeInteger(v)||Object.is(v,-0))fail();return v;}
 if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype)fail();
 const names=Reflect.ownKeys(v);if(names.length>64)fail();const out={};
 for(const k of names){if(typeof k!=='string'||['then','toJSON','__proto__','constructor','prototype'].includes(k))fail();const d=D(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,k,{value:json(d.value,depth+1,budget),enumerable:true});}return F(out);
}

/** Canonical public configuration; no file, key, clock, native store or user
 * callback is entered. Economics are explicit fixed terms, never defaults.
 * The receipt product hashes the durable execution identity; it performs no
 * external business effect and is not a provider signature or delivery proof.
 */
export function decodeIssuedProviderOperatorBootstrap(raw){
 if(arguments.length!==1)fail();text(raw,262144);let c;try{c=json(JSON.parse(raw));if(canonicalJson(c)!==raw)fail();}catch{fail();}
 c=fields(c,['providerBootstrapVersion','applicationMode','serviceStore','intakeStore','offer','funding','service','transport','journal','chain','recovery','witness','control']);
 if(![1,2].includes(c.providerBootstrapVersion)||!['FRESH','RECORDED','JOURNAL','WITNESSED'].includes(c.applicationMode))fail();
 const s=fields(c.serviceStore,['databasePath','allowedRoot','busyTimeoutMs','maxStateBytes','maxOffers','maxGrants','maxRequests']);child(s.databasePath,s.allowedRoot);
 integer(s.busyTimeoutMs,1,60000);integer(s.maxStateBytes,512,16777216);integer(s.maxRequests,100,10000);if(s.maxOffers!==1||s.maxGrants!==1)fail();
 const i=fields(c.intakeStore,['databasePath','allowedRoot','ledgerDomain','maxChallenges']);child(i.databasePath,i.allowedRoot);text(i.ledgerDomain,128);integer(i.maxChallenges,1,16);if(s.databasePath===i.databasePath)fail();
 const model=new InMemoryServiceCreditModel({deriveCost:F(()=>1),now:F(()=>0)}),offer=Reflect.apply(REGISTER,model,[c.offer]);
 if(offer.costPolicyId!=='execution-receipt-unit-v1')fail();
 const fundingFields=['authorityRecord','terms','observerRoot','observerCatchUp','selection','resourceUrl','maxPendingReconciliations','maxIntakeAttempts','closeBudgetMs'];
 const f=fields(c.funding,c.providerBootstrapVersion===1?fundingFields:[...fundingFields,'pendingObservationMode']);
 if(c.providerBootstrapVersion===2&&(!['JOURNAL_ONLY','ORIGINAL_RPC'].includes(f.pendingObservationMode)||f.pendingObservationMode==='ORIGINAL_RPC'&&c.applicationMode!=='FRESH'))fail();
 text(f.authorityRecord,65536);path(f.observerRoot);const selection=captureIssuedFundingPostServiceSelection(f.selection);
 const deriveFundingTerms=createFixedZenonFundingPolicy({offer,selection,terms:f.terms});if(f.terms.totalUnits<100)fail();
 const chain=captureIssuedProviderChainSelection(c.chain,f.terms.requirement);integer(f.maxPendingReconciliations,0,16);integer(f.maxIntakeAttempts,1,16);integer(f.closeBudgetMs,1,1000);
 const catchup=fields(f.observerCatchUp,['maximumPageEntries','maximumBackfillSpan','maximumMembersPerMomentum']);for(const v of Object.values(catchup))integer(v,1,65536);
 const service=fields(c.service,['productId','selectedDurationMs']);if(service.productId!=='execution-receipt-v1')fail();integer(service.selectedDurationMs,1,60000);
 const transport=fields(c.transport,['origin','generation','limits','bind']),u=new URL(transport.origin);
 if(u.protocol!=='https:'||u.origin!==transport.origin||f.resourceUrl!==transport.origin+'/funding')fail();
 const generation=fields(transport.generation,['generationId','generationVersion']);text(generation.generationId,128);if(!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(generation.generationId))fail();integer(generation.generationVersion,1,Number.MAX_SAFE_INTEGER);
 const limits=captureServiceCreditBoundedHttpsIngressLimits(F(fields(transport.limits,SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_LIMIT_FIELDS)));if(limits===null)fail();
 if(limits.maxRequestStarts<106||limits.maxConnectionStarts<106)fail();
 const bind=fields(transport.bind,['host','port','exclusive']);text(bind.host,255);if(!/^[A-Za-z0-9.:[\]-]+$/.test(bind.host)||bind.exclusive!==true)fail();integer(bind.port,1,65535);if(bind.port!==Number(u.port||443))fail();
 const j=fields(c.journal,['directory','allowedRoot','maxRecords','maxFileBytes']);child(j.directory,j.allowedRoot);integer(j.maxRecords,1,10000);integer(j.maxFileBytes,1024,16777216);
 const recovery=c.applicationMode==='FRESH'?null:captureIssuedFundingGrantRecoveryExpectation(c.recovery);if(c.applicationMode==='FRESH'&&c.recovery!==null)fail();
 let witness=null;if(c.applicationMode==='WITNESSED'){witness=fields(c.witness,['directory','expectedDevice','mode']);path(witness.directory);if(!['CREATE_NEW','READ_EXISTING'].includes(witness.mode)||typeof witness.expectedDevice!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(witness.expectedDevice))fail();witness=F(witness);}else if(c.witness!==null)fail();
 const control=fields(c.control,['maxCommands','maxLineBytes','maxInputBytes','maxOutputBytes','closeWaitMs','operationBudgetMs']);integer(control.operationBudgetMs,1,60000);
 const channelLimits=captureBuyerOriginalFundingCommandLimits(F({maxCommands:control.maxCommands,maxLineBytes:control.maxLineBytes,maxInputBytes:control.maxInputBytes,maxOutputBytes:control.maxOutputBytes,closeWaitMs:control.closeWaitMs}));
 const state={configuration:F({...c,serviceStore:F(s),intakeStore:F(i),offer,funding:F({...f,selection,observerCatchUp:F(catchup)}),service:F(service),transport:F({...transport,generation:F(generation),limits,bind:F(bind)}),journal:F(j),recovery,witness,control:F(control)}),deriveFundingTerms,chain,channelLimits,consumed:false};
 const prepared=F({providerBootstrapVersion:c.providerBootstrapVersion,applicationMode:c.applicationMode,productId:service.productId,channelLimits,operationBudgetMs:control.operationBudgetMs});PREPARED.set(prepared,state);return prepared;
}

/** One explicit attachment of fixed native roles and TLS copies. Operational
 * capabilities cannot be supplied by public JSON or an arbitrary module path.
 * The actual owned provider repeats its original configuration admission.
 */
export function bindIssuedProviderOperatorBootstrap(prepared,official,tlsMaterial,now,observation){
 if(arguments.length!==5||prepared===null||typeof prepared!=='object'||types.isProxy(prepared))fail();const state=PREPARED.get(prepared);
 if(!state||state.consumed||typeof now!=='function'||types.isProxy(now)||!Object.isFrozen(now))fail();state.consumed=true;const c=state.configuration,f=c.funding;
 const deriveCost=F(function deriveCost(input){const v=fields(input,['modelVersion','offer','grant','request']),o=fields(v.offer,['providerId','serviceId','offerId','offerVersion','costPolicyId']),g=fields(v.grant,['grantId','offerId','offerVersion']),r=fields(v.request,['modelVersion','grantId','requestId','method','routeId','canonicalBodyDigest','selectedContentType']);
  if(v.modelVersion!==1||r.modelVersion!==1||r.grantId!==g.grantId||g.offerId!==c.offer.offerId||g.offerVersion!==c.offer.offerVersion||Object.keys(o).some(k=>o[k]!==c.offer[k])
   ||r.method!=='POST'||r.routeId!=='execution-receipt.v1'||r.canonicalBodyDigest!==EMPTY||r.selectedContentType!=='application/json')fail();return 1;});
 const execute=F(function execute(input){if(arguments.length!==1)fail();const v=fields(input,['executionId','signal']);
  if(typeof v.executionId!=='string'||!/^sha256:[0-9a-f]{64}$/.test(v.executionId)||types.isProxy(v.signal)||Reflect.apply(ABORTED,v.signal,[]))fail();
  return F({resultCode:'sha256:'+sha256Hex({domain:'zenon-x402-execution-receipt-v1',executionId:v.executionId})});});
 return F({applicationMode:c.applicationMode,serviceStore:F({...c.serviceStore,deriveCost,now}),intakeStore:c.intakeStore,offer:c.offer,
  funding:F({intake:F({authorityRecord:f.authorityRecord,deriveFundingTerms:state.deriveFundingTerms,now,observerRoot:f.observerRoot,observerCatchUp:f.observerCatchUp,selection:f.selection,resourceUrl:f.resourceUrl}),
   official,maxIntakeAttempts:f.maxIntakeAttempts,closeBudgetMs:f.closeBudgetMs}),service:F({execute,selectedDurationMs:c.service.selectedDurationMs}),
  transport:F({...c.transport,tlsMaterial}),recovery:c.recovery,observation});
}

/** Native bootstrap reads this admitted public DATA before binding. No handles,
 * credentials, executor or loader authority is exposed by this accessor. */
export function readIssuedProviderOperatorBootstrap(prepared){if(arguments.length!==1||prepared===null||typeof prepared!=='object'||types.isProxy(prepared))fail();const state=PREPARED.get(prepared);if(!state||state.consumed)fail();return state.configuration;}

/** Binary TLS frame: two uint32-be lengths, then existing key and certificate
 * bytes. No private PEM string, generated key, file path or secret in argv. */
export function captureIssuedProviderTlsFrame(bytes){
 if(arguments.length!==1||types.isProxy(bytes)||!Buffer.isBuffer(bytes)||Object.getPrototypeOf(bytes)!==Buffer.prototype||D(bytes,'length')!==undefined||D(bytes,'buffer')!==undefined||D(bytes,'byteOffset')!==undefined)fail();
 const size=Reflect.apply(LENGTH,bytes,[]);if(size<10||size>131080||Object.getPrototypeOf(Reflect.apply(AB,bytes,[]))!==ArrayBuffer.prototype)fail();
 const keyBytes=Reflect.apply(READ32,bytes,[0]),certBytes=Reflect.apply(READ32,bytes,[4]);
 if(keyBytes<1||keyBytes>65536||certBytes<1||certBytes>65536||8+keyBytes+certBytes!==size)fail();
 const copies=[];try{const key=Buffer.from(Reflect.apply(SUBARRAY,bytes,[8,8+keyBytes]));copies.push(key);const cert=Buffer.from(Reflect.apply(SUBARRAY,bytes,[8+keyBytes]));copies.push(cert);let released=false;
  return F({material:F({key,cert}),release:F(function release(){if(arguments.length!==0)fail();if(!released){released=true;for(const b of copies)Reflect.apply(FILL,b,[0]);}})});
 }catch{for(const b of copies)Reflect.apply(FILL,b,[0]);fail();}
}
