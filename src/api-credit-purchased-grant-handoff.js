import { types } from 'node:util';
import { captureApiCreditFundingGrantRecoveryProfile } from './api-credit-funding-grant-recovery-record.js';
import { decodeApiCreditOriginalGrantQueryProfile, consumeApiCreditOriginalGrantQueryProfile,
 releaseApiCreditOriginalGrantQueryProfile } from './api-credit-original-grant-query-profile.js';
import { captureApiCreditOriginalGrantQueryOutput } from './api-credit-original-grant-query-owner.js';
import { captureServiceCreditOriginalFundingGrantResult } from './service-credit-original-funding-grant.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn,SELECTED=new WeakMap();
const PURCHASE=['purchaseExpectationVersion','providerId','serviceId','resourceId','offerId','offerVersion','costPolicyId',
 'fundingPolicyId','fundingPolicyVersion','holderId','capabilityCommitment','totalUnits','expiresAt','fundingCommitment',
 'authorityRecordDigest','termsSource','providerAuthentication','fundingVerification','serviceDelivery','authority'];
const ID=/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/,HASH=/^sha256:[0-9a-f]{64}$/,GRANT=/^grant_[0-9a-f]{64}$/;
function fail(){const e=new TypeError('API_CREDIT_PURCHASED_GRANT_HANDOFF');Object.defineProperty(e,'stack',{value:e.message});throw F(e);}
function fields(v,names,frozen=false){
 if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype
  ||Reflect.ownKeys(v).length!==names.length||frozen&&!Object.isFrozen(v))fail();
 const out={};for(const name of names){const d=D(v,name);if(!d?.enumerable||!O(d,'value'))fail();out[name]=d.value;}return out;
}
function matches(re,v){return typeof v==='string'&&re.exec(v)?.[0]===v;}
function positive(v){return Number.isSafeInteger(v)&&v>0;}
function purchase(value){
 const p=fields(value,PURCHASE,true);
 if(p.purchaseExpectationVersion!==1||p.termsSource!=='OPERATOR_SELECTED_DECLARED_DATA'||p.authority!=='NONE'
  ||p.providerAuthentication!=='NOT_ESTABLISHED'||p.fundingVerification!=='NOT_PERFORMED'||p.serviceDelivery!=='NOT_ESTABLISHED')fail();
 for(const key of ['providerId','serviceId','resourceId','offerId','costPolicyId','fundingPolicyId','holderId'])if(!matches(ID,p[key]))fail();
 for(const key of ['offerVersion','fundingPolicyVersion','totalUnits','expiresAt'])if(!positive(p[key]))fail();
 for(const key of ['capabilityCommitment','fundingCommitment','authorityRecordDigest'])if(!matches(HASH,p[key]))fail();
 if(p.totalUnits<100)fail();return F(p);
}
/** Bind the ready query to the purchase BEFORE custody/checkpoint commit and
 * funding. No grant ID is guessed before the provider observation. This is a
 * powerless comparison token, not proof, dispatch or activation authority. */
export function captureApiCreditPurchasedGrantQuery(expectedPurchase,profileJson,expectedOriginal,lookupPolicy){
 if(arguments.length!==4||new.target!==undefined)fail();let token;
 try{
  const p=purchase(expectedPurchase),original=fields(expectedOriginal,['resourceUrl','serializedCheckpoint','expectedPins']);
  const policy=fields(lookupPolicy,['caBase64','maxTotalMs'],true);
  if(typeof policy.caBase64!=='string'||policy.caBase64.length>8192||!positive(policy.maxTotalMs)||policy.maxTotalMs>60000)fail();
  const recovery=captureApiCreditFundingGrantRecoveryProfile(profileJson,original);
  token=decodeApiCreditOriginalGrantQueryProfile(profileJson);if(token.originalGrantQueryVersion!==1)fail();
  const selected=consumeApiCreditOriginalGrantQueryProfile(token),identity=selected.query.originalFunding;
  if(identity.offerId!==p.offerId||identity.offerVersion!==p.offerVersion||identity.holderId!==p.holderId
   ||identity.capabilityCommitment!==p.capabilityCommitment||identity.grantFundingCommitment!==p.fundingCommitment)fail();
  if(selected.transport.caBase64!==policy.caBase64
   ||selected.transport.requestDeadlineMs+selected.transport.closeGraceMs>policy.maxTotalMs)fail();
  if(selected.checkpointDigest!==recovery.checkpointDigest||selected.queryDigest!==recovery.queryDigest)fail();
  const result=F({purchasedGrantQueryVersion:1,authority:'NONE'});
  SELECTED.set(result,{purchase:p,identity,resourceUrl:original.resourceUrl,
   paymentHash:recovery.transactionHash,checkpointDigest:selected.checkpointDigest,
   queryDigest:selected.queryDigest,requestId:selected.query.requestId,consumed:false});
  return result;
 }catch{fail();}finally{if(token!==undefined)releaseApiCreditOriginalGrantQueryProfile(token);}
}
/** Require the same original query and selected grant after its existing owner
 * has observed close. Units/absolute expiry must match the captured purchase.
 * ACTIVE is only a historical necessary condition; existing service owners
 * still validate current grant/capability/expiry. No authority is returned. */
export function requireApiCreditPurchasedGrantHandoff(selection,selectedGrantId,output){
 if(arguments.length!==3||new.target!==undefined||selection===null||typeof selection!=='object'||types.isProxy(selection)
  ||!matches(GRANT,selectedGrantId))fail();
 const s=SELECTED.get(selection);if(!s||s.consumed)fail();s.consumed=true;
 try{
  const value=captureApiCreditOriginalGrantQueryOutput(output);
  const history=captureServiceCreditOriginalFundingGrantResult(value.history,s.identity),p=s.purchase,record=history.record;
  if(value.fundingResourceUrl!==s.resourceUrl||value.paymentHash!==s.paymentHash||value.checkpointDigest!==s.checkpointDigest
   ||value.queryDigest!==s.queryDigest||value.requestId!==s.requestId||history.status!=='RECORDED'||record===null
   ||record.grantId!==selectedGrantId||record.offerId!==p.offerId||record.offerVersion!==p.offerVersion
   ||record.holderId!==p.holderId||record.capabilityCommitment!==p.capabilityCommitment
   ||record.totalUnits!==p.totalUnits||record.expiresAt!==p.expiresAt||record.storedLifecycle!=='ACTIVE')fail();
 }catch{fail();}
}
