import { Buffer } from 'node:buffer';
import { canonicalJson } from './canonical.js';
import { decodeB64Json, encodeB64Json, validatePaymentRequiredForOfferSelection } from './x402-wire.js';
import { createFixedZenonFundingPolicy } from './service-credit-zenon-fixed-funding-policy.js';
import { captureZenonFundingResourceConfiguration } from './service-credit-zenon-funding-evidence.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn;
function fail(){const e=new TypeError('API_CREDIT_PURCHASE_EXPECTATION');Object.defineProperty(e,'stack',{value:e.message});throw F(e);}
function fields(value,names){
 if(value===null||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype
  ||Reflect.ownKeys(value).length!==names.length)fail();
 const out={};for(const name of names){const d=D(value,name);if(!d?.enumerable||!O(d,'value'))fail();out[name]=d.value;}return out;
}
/** Operator-selected public terms, compared before credential/key acquisition.
 * Reuse the provider's existing fixed-term and funding-commitment contracts.
 * The temporary policy callable is used only to calculate public metadata;
 * it is not returned, retained, supplied to a store or used for activation.
 * No clock, price default, funding proof, signature or grant is produced. */
export function captureApiCreditPurchaseExpectation(json,paymentRequiredHeader,resourceUrl){
 try{
  if(arguments.length!==3||new.target!==undefined||typeof json!=='string'||Buffer.byteLength(json)>16384
   ||Buffer.from(json).toString('utf8')!==json||typeof paymentRequiredHeader!=='string'||typeof resourceUrl!=='string')fail();
  const parsed=JSON.parse(json),c=fields(parsed,['purchaseExpectationVersion','offer','selection','terms','authorityProfile']);
  if(c.purchaseExpectationVersion!==1)fail();
  // JSON input has no callable/accessor ports. The existing closed validators
  // bound every term before canonical serialization of the parsed object.
  const calculate=createFixedZenonFundingPolicy({offer:c.offer,selection:c.selection,terms:c.terms});
  const expected=captureZenonFundingResourceConfiguration({offer:c.offer,selection:c.selection,
   resourceUrl,deriveFundingTerms:calculate,authorityProfile:c.authorityProfile});
  if(canonicalJson(parsed)!==json)fail();
  const required=decodeB64Json(paymentRequiredHeader,{maxEncodedBytes:5464,maxDecodedBytes:4096});
  validatePaymentRequiredForOfferSelection(required);
  if(encodeB64Json(required,{maxEncodedBytes:5464})!==paymentRequiredHeader
   ||canonicalJson(required)!==canonicalJson(expected.challenge.paymentRequired))fail();
  const intent=expected.challenge.activationIntent;
  // A necessary bound for the fixed 100-call correctness scenario. This does
  // not authenticate a cost policy, ensure delivery or promise availability.
  if(intent.totalUnits<100)fail();
  return F({purchaseExpectationVersion:1,providerId:intent.providerId,serviceId:intent.serviceId,
   resourceId:intent.resourceId,offerId:intent.offerId,offerVersion:intent.offerVersion,
   costPolicyId:expected.offer.costPolicyId,fundingPolicyId:expected.offer.fundingPolicyId,
   fundingPolicyVersion:expected.offer.fundingPolicyVersion,holderId:intent.holderId,
   capabilityCommitment:intent.capabilityCommitment,totalUnits:intent.totalUnits,expiresAt:intent.expiresAt,
   fundingCommitment:expected.challenge.fundingCommitment,authorityRecordDigest:expected.authorityRecordDigest,
   termsSource:'OPERATOR_SELECTED_DECLARED_DATA',providerAuthentication:'NOT_ESTABLISHED',
   fundingVerification:'NOT_PERFORMED',serviceDelivery:'NOT_ESTABLISHED',authority:'NONE'});
 }catch{fail();}
}
