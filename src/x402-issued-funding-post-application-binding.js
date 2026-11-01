import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';
import { Buffer } from 'node:buffer';
import { canonicalJson, paymentIntentDigest } from './canonical.js';
import { createIssuedFundingPostSdkResourceBinding } from './x402-issued-funding-post-sdk-resource.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,P=Object.getPrototypeOf,K=Reflect.ownKeys,O=Object.hasOwn;
const IS_PROXY=utilTypes.isProxy,CANONICAL=canonicalJson;
const SELECT=['offerId','offerVersion','holderId','capabilityCommitment'];
const OUTCOME=['phase','intake','official','transactionHash','acknowledgementDomainsIndependent','authority','grantActivation','serviceDelivery'];
const BOUND=['status','transactionHash','observerRecordKey','observerFileName'];
const TEXT='text/plain; charset=utf-8',HASH=/^[0-9a-f]{64}$/,COMMITMENT=/^sha256:[0-9a-f]{64}$/;
const RESOURCE_DOMAIN='zenon-x402-service-credit-payment-resource-v1';
const REQUIREMENT_DOMAIN='zenon-x402-service-credit-payment-requirement-v1';

/**
 * Actual pure application binding. DATA is NOT authenticated issuance, intake,
 * a grant, SQL/TLS evidence or authority to activate, execute, retry or sign.
 * The native application must hardwire its actual intake/root and store read.
 * Preserve the existing funding POST-v1 wire contract, including NO x402
 * protocol headers on 202 BOUND. Observer filenames/keys never leave in frames.
 * A scoped service session is eligible only after a separate actual committed
 * grant matches the same original transaction, issued resource and selection.
 */
export function captureIssuedFundingPostServiceSelection(value) {
  if(arguments.length!==1)fail();
  const c=exact(value,SELECT);
  if(!identifier(c.offerId)||!identifier(c.holderId)||!Number.isSafeInteger(c.offerVersion)
      ||c.offerVersion<1||typeof c.capabilityCommitment!=='string'||!COMMITMENT.test(c.capabilityCommitment))fail();
  return F(c);
}
export function createIssuedFundingPostApplicationBinding(options) {
  if(arguments.length!==1)fail();
  const c=exact(options,['issuedFrame','resourceUrl','serviceSelection']);
  const selected=createIssuedFundingPostSdkResourceBinding(c.issuedFrame,c.resourceUrl).selection();
  const service=captureIssuedFundingPostServiceSelection(c.serviceSelection);
  const required=selected.paymentRequired,requirement=selected.requirement;
  const expected=F({resource:commitment(RESOURCE_DOMAIN,selected.resource),
    requirement:commitment(REQUIREMENT_DOMAIN,requirement),
    intent:'sha256:'+paymentIntentDigest(required,requirement),
    funding:'sha256:'+selected.resource.tags[1]+selected.resource.tags[2]});
  const challenge=frame(402,'Payment Required',F({'PAYMENT-REQUIRED':selected.frame.paymentRequiredHeader}));
  const accepted=frame(202,'BOUND',F({}));
  let held=false,boundHash=null,boundRecord=null,boundObserver=null,phase=null,serviceGrantPinned=false;
  function live(){if(held)fail();}
  const getChallenge=F(function getChallenge(){if(arguments.length!==0)fail();live();return challenge;});
  const captureBoundOutcome=F(function captureBoundOutcome(input){
    if(arguments.length!==1)fail();live();
    try{
      const r=exact(input,OUTCOME,true),b=exact(r.intake,BOUND,true,true);
      if(r.acknowledgementDomainsIndependent!==true||r.authority!=='NONE'
          ||r.grantActivation!=='NOT_ESTABLISHED'||r.serviceDelivery!=='NOT_ESTABLISHED'
          ||b.status!=='BOUND'||typeof b.transactionHash!=='string'||!HASH.test(b.transactionHash)
          ||r.transactionHash!==b.transactionHash||typeof b.observerRecordKey!=='string'||!COMMITMENT.test(b.observerRecordKey)
          ||b.observerFileName!=='funding-observer-'+b.transactionHash+'.sqlite')fail();
      const official=record(r.official,true),type=own(official,'type');
      let next;
      if(r.phase==='INTAKE_BOUND_OFFICIAL_PENDING'){
        if(type!=='payment-error'&&type!=='observed-settlement')fail();
        if(type==='observed-settlement'&&own(record(own(official,'settlement'),true),'success')!==false)fail();
        if(type==='payment-error')record(own(official,'response'),true);
        next='PENDING';
      }else if(r.phase==='INTAKE_BOUND_OFFICIAL_SETTLED'){
        if(type!=='settled'&&type!=='observed-settlement')fail();
        if(own(record(own(official,'settlement'),true),'success')!==true)fail();next='SETTLED';
      }else if(r.phase==='INTAKE_BOUND_OFFICIAL_EXHAUSTED'){
        if(type!=='observed-settlement'||own(record(own(official,'settlement'),true),'success')!==false)fail();next='EXHAUSTED';
      }else fail();
      const fingerprint=CANONICAL(b);
      if(boundHash!==null&&(boundHash!==b.transactionHash||boundRecord!==fingerprint))fail();
      if(phase!==null&&phase!=='PENDING'&&next!==phase)fail();
      boundHash=b.transactionHash;boundRecord=fingerprint;phase=next;
      boundObserver=F({observerFileName:b.observerFileName,recordKey:b.observerRecordKey});
      return accepted;
    }catch{held=true;fail();}
  });
  // Fixed local-operator pre-opening selection. This only compares the exact
  // original BOUND tuple already retained by this binding. It authenticates
  // neither an observer nor chain evidence, and never activates a grant.
  const captureOriginalActivationObserver=F(function captureOriginalActivationObserver(input){
    if(arguments.length!==1)fail();live();
    if(boundObserver===null||phase!=='SETTLED'||serviceGrantPinned)fail();
    const c=exact(input,['observerFileName','recordKey']);
    if(c.observerFileName!==boundObserver.observerFileName||c.recordKey!==boundObserver.recordKey)fail();
    return F({observerFileName:boundObserver.observerFileName,recordKey:boundObserver.recordKey});
  });
  const captureCommittedGrant=F(function captureCommittedGrant(input,expectedGrantId){
    if(arguments.length!==2||typeof expectedGrantId!=='string'||!/^grant_[0-9a-f]{64}$/.test(expectedGrantId))fail();live();
    // No consumed session/activation authority is reset by a not-ready read.
    // A failed DATA comparison has not acquired an actual session.
    if(boundHash===null||phase!=='SETTLED'||serviceGrantPinned)fail();
    const grant=snapshot(input),a=record(own(grant,'activation'));
    if(own(grant,'grantId')!==expectedGrantId||own(grant,'lifecycle')!=='ACTIVE'
        ||own(grant,'transactionId')!=='zenontx:'+boundHash||own(a,'transactionId')!=='zenontx:'+boundHash)fail();
    for(const name of ['offerId','offerVersion','holderId','capabilityCommitment'])
      if(own(grant,name)!==service[name]||own(a,name)!==service[name])fail();
    if(own(a,'network')!==requirement.network||own(a,'scheme')!==requirement.scheme
        ||own(a,'paymentFlow')!=='upfront'||own(a,'asset')!==requirement.asset
        ||own(a,'amount')!==requirement.amount||own(a,'payee')!==requirement.payTo
        ||own(a,'payer')!==service.holderId||own(a,'paymentResourceDigest')!==expected.resource
        ||own(a,'paymentRequirementDigest')!==expected.requirement||own(a,'paymentIntentDigest')!==expected.intent
        ||own(a,'grantFundingCommitment')!==expected.funding
        ||CANONICAL(own(a,'chainProfile'))!==CANONICAL(requirement.extra.zenonChain))fail();
    const intent=exact(own(grant,'paymentIntent'),['intentId','requirementId']);
    if(intent.intentId!==expected.intent||intent.requirementId!==expected.requirement)fail();
    serviceGrantPinned=true;
    return F({admittedGrantId:expectedGrantId,transactionHash:boundHash,
      capabilityCommitment:service.capabilityCommitment,grantActivation:'EXTERNAL_COMMITTED_RECORD_REQUIRED',authority:'NONE'});
  });
  const inspect=F(function inspect(){if(arguments.length!==0)fail();
    return F({issuedFundingPostApplicationBindingVersion:1,held,boundRetained:boundHash!==null,
      transactionHash:boundHash,officialPhase:phase,serviceGrantPinned,issuanceAuthenticated:false,
      committedRecordAuthenticated:false,grantActivation:'NONE',authority:'NONE'});});
  return F({getChallenge,captureBoundOutcome,captureOriginalActivationObserver,captureCommittedGrant,inspect});
}
function frame(statusCode,body,headers){return F({statusCode,contentType:TEXT,body,headers});}
function identifier(value){return typeof value==='string'&&value.length<=128&&/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)&&!value.includes('://');}
function record(value,frozen=false){if(value===null||typeof value!=='object'||IS_PROXY(value)
  ||(P(value)!==Object.prototype&&P(value)!==null)||frozen&&!Object.isFrozen(value)||K(value).length>128)fail();return value;}
function exact(value,fields,frozen=false,nullOnly=false){record(value,frozen);
  if((nullOnly?P(value)!==null:P(value)!==Object.prototype)||K(value).length!==fields.length)fail();
  const out={};for(const name of fields)Object.defineProperty(out,name,{value:own(value,name),enumerable:true});return out;}
function own(value,name){if(Array.isArray(value)){if(IS_PROXY(value)||P(value)!==Array.prototype)fail();}else record(value);
  const d=D(value,name);if(!d||!O(d,'value')||!d.enumerable)fail();return d.value;}
function snapshot(value,depth=0,budget={nodes:4096,bytes:131072}){
  if(depth>16||--budget.nodes<0)fail();
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='string'){budget.bytes-=Buffer.byteLength(value);if(budget.bytes<0)fail();return value;}
  if(typeof value==='number'&&Number.isSafeInteger(value)&&!Object.is(value,-0))return value;
  if(value===null||typeof value!=='object'||IS_PROXY(value))fail();
  const array=Array.isArray(value),keys=K(value),out=array?[]:{};
  if(array){if(P(value)!==Array.prototype)fail();const d=D(value,'length');
    if(!d||!O(d,'value')||!Number.isSafeInteger(d.value)||d.value<0||d.value>128||keys.length!==d.value+1)fail();
    for(let i=0;i<d.value;i++)out.push(snapshot(own(value,String(i)),depth+1,budget));
  }else{record(value);for(const key of keys){if(typeof key!=='string'||key==='toJSON')fail();
    // Field names and string values share the UTF-8 budget. Unknown extension
    // names must not bypass it before their values are copied or inspected.
    budget.bytes-=Buffer.byteLength(key);if(budget.bytes<0)fail();
    Object.defineProperty(out,key,{value:snapshot(own(value,key),depth+1,budget),enumerable:true});}}
  return F(out);
}
function commitment(domain,value){return 'sha256:'+createHash('sha256').update(domain,'ascii').update(Buffer.from([0])).update(CANONICAL(value),'utf8').digest('hex');}
function fail(){const code='issued_funding_post_application_binding_rejected',e=new TypeError(code);
 Object.defineProperty(e,'code',{value:code,enumerable:true});Object.defineProperty(e,'stack',{value:'TypeError: '+code});throw F(e);}
