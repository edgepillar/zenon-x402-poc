// SOURCE/PARSER ONLY. The actual composition authenticates committed observer
// evidence before the privileged grant-store method. No native run is claimed.
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { ZenonFundingIntakeSqliteStore } from './service-credit-zenon-funding-intake-sqlite-store.js';
import { ZenonFundingObserverSqliteStore } from './service-credit-zenon-funding-observer-sqlite-store.js';
import { ServiceCreditSqliteStore } from './service-credit-sqlite-store.js';
import { createZenonFundingCompositionWithExpiredFundingOutcome } from './service-credit-zenon-funding-composition.js';
import { parseZenonFundingProviderAttestationAuthorityRecord } from './service-credit-zenon-funding-provider-attestation.js';
import { captureIssuedFundingActivationTime, createIssuedExpiredFundingPreparation } from './issued-expired-funding-preparation.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply;
const INTAKE=ZenonFundingIntakeSqliteStore.prototype,OBSERVER=ZenonFundingObserverSqliteStore.prototype,SERVICE=ServiceCreditSqliteStore.prototype;
const LOAD=D(INTAKE,'loadBound').value,OLOAD=D(OBSERVER,'load').value,PROJECT=D(OBSERVER,'projectCommittedFundingEvidence').value,MATCH=D(OBSERVER,'matchReadyFundingEvidence').value;
const OFFER=D(SERVICE,'getOffer').value,ACTIVATE=D(SERVICE,'activateGrantFromTrustedRecord').value;
function fail(){throw new TypeError('ISSUED_FUNDING_GRANT_NATIVE_ACTIVATION');}
function exact(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length)fail();
 const out={};for(const k of names){const d=D(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function own(v,k){if(v===null||typeof v!=='object'||types.isProxy(v)||!Object.isFrozen(v))fail();const d=D(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();return d.value;}
function brand(v,proto,name,fn){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==proto||Object.hasOwn(v,name)||D(proto,name)?.value!==fn)fail();}
/** No observer file is opened or chosen here; the explicit operator supplies
 * an existing borrowed store. JSON cannot select a verifier or mint function. */
export function createIssuedFundingGrantNativeActivationPreparation(options){
 if(arguments.length!==1)fail();const c=exact(options,['intakeStore','serviceStore','authorityRecord','deriveFundingTerms','now']);
 brand(c.intakeStore,INTAKE,'loadBound',LOAD);brand(c.serviceStore,SERVICE,'getOffer',OFFER);brand(c.serviceStore,SERVICE,'activateGrantFromTrustedRecord',ACTIVATE);
 if(typeof c.authorityRecord!=='string'||typeof c.deriveFundingTerms!=='function'||types.isProxy(c.deriveFundingTerms)||typeof c.now!=='function'||types.isProxy(c.now))fail();
 const loadBound=F(()=>{brand(c.intakeStore,INTAKE,'loadBound',LOAD);return A(LOAD,c.intakeStore,[]);});
 const prepareActivation=F(function prepareActivation(observer,row){
  if(arguments.length!==2)fail();for(const [name,fn]of [['load',OLOAD],['projectCommittedFundingEvidence',PROJECT],['matchReadyFundingEvidence',MATCH]])brand(observer,OBSERVER,name,fn);
  const issue=own(row,'issue'),binding=own(row,'binding');if(own(row,'status')!=='BOUND'||own(issue,'authorityRecord')!==c.authorityRecord)fail();
  const loaded=A(OLOAD,observer,[]),state=own(loaded,'state');
  if(own(loaded,'recordKey')!==own(binding,'observerRecordKey')||own(loaded,'authorityRecordDigest')!==own(issue,'authorityRecordDigest')
     ||canonicalJson(own(state,'target'))!==canonicalJson(own(binding,'observerTarget'))
     ||canonicalJson(own(state,'chainProfile'))!==canonicalJson(own(own(binding,'observerInitialState'),'chainProfile'))
     ||canonicalJson(own(state,'confirmationPolicy'))!==canonicalJson(own(own(binding,'observerInitialState'),'confirmationPolicy')))fail();
  // This is availability only. The actual composition's PROJECT/MATCH verify
  // the READY envelope and authority; a raw READY/SETTLED flag cannot mint.
  if(own(own(loaded,'outbox'),'status')!=='READY')return F({status:'NOT_READY'});
  const challenge=own(issue,'challenge'),intent=own(challenge,'activationIntent'),paymentRequired=own(challenge,'paymentRequired');
  const time=captureIssuedFundingActivationTime(own(intent,'expiresAt'),F(()=>A(c.now,undefined,[])));
  if(time.expired){
   const selected=own(issue,'selection'),offer=A(OFFER,c.serviceStore,[F({offerId:own(selected,'offerId'),offerVersion:own(selected,'offerVersion')})]);
   const authority=parseZenonFundingProviderAttestationAuthorityRecord(c.authorityRecord);
   return createIssuedExpiredFundingPreparation(F({offer,challenge,authorityProfile:authority.authorityProfile,
    transactionHash:own(binding,'transactionHash'),payer:own(selected,'holderId'),resourceUrl:own(issue,'resourceUrl')}),time,F({
     projectFundingEvidence:F(()=>{brand(observer,OBSERVER,'projectCommittedFundingEvidence',PROJECT);return A(PROJECT,observer,[]);}),
     verifyFundingEvidence:F(candidate=>new Promise((resolve,reject)=>{try{brand(observer,OBSERVER,'matchReadyFundingEvidence',MATCH);resolve(A(MATCH,observer,[candidate]));}catch{reject(new TypeError('ISSUED_EXPIRED_FUNDING_VERIFICATION'));}})),
   }));
  }
  const original=canonicalJson(row),composition=createZenonFundingCompositionWithExpiredFundingOutcome({serviceCreditStore:c.serviceStore,fundingObserverStore:observer,
   authorityRecord:c.authorityRecord,deriveFundingTerms:c.deriveFundingTerms,now:c.now});
  const activate=D(composition,'activateCommittedFunding')?.value;if(typeof activate!=='function'||types.isProxy(activate))fail();
  return F({status:'READY_WITH_EXPIRY_OUTCOME',activate:F(function activateOriginal(){if(arguments.length!==0)fail();const rows=loadBound();if(!Array.isArray(rows)||rows.length!==1||canonicalJson(rows[0])!==original)fail();
   return A(activate,composition,[F({intent,paymentRequired})]);})});
 });
 return F({loadBound,prepareActivation});
}
