import { types } from 'node:util';
import { createHash } from 'node:crypto';
import { captureApiCreditPurchaseExpectation } from './api-credit-purchase-expectation.js';
import { restoreOriginalPaymentCheckpoint } from './service-credit-pilot-original-payment-checkpoint.js';
import { captureApiCreditFundingGrantRecoveryProfile } from './api-credit-funding-grant-recovery-record.js';
import { decodeApiCreditOriginalGrantQueryProfile, consumeApiCreditOriginalGrantQueryProfile,
  releaseApiCreditOriginalGrantQueryProfile } from './api-credit-original-grant-query-profile.js';
import { captureApiCreditOriginalGrantQueryOutput } from './api-credit-original-grant-query-owner.js';
import { captureServiceCreditOriginalFundingGrantResult } from './service-credit-original-funding-grant.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn,SELECTIONS=new WeakMap();
function fail(){throw new TypeError('API_CREDIT_PURCHASED_GRANT_RECOVERY');}
function fields(v,names,frozen=false){
  if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype
      ||Reflect.ownKeys(v).length!==names.length||frozen&&!Object.isFrozen(v))fail();
  const out={};for(const name of names){const d=D(v,name);if(!d?.enumerable||!O(d,'value'))fail();out[name]=d.value;}return F(out);
}
function state(selection){
  if(selection===null||typeof selection!=='object'||types.isProxy(selection))fail();
  const s=SELECTIONS.get(selection);if(!s)fail();return s;
}
/** Independent purchase and exact original DATA only. No row, current clock,
 * provider, key or grant supplies replacement terms or dispatch authority. */
export function captureApiCreditPurchasedGrantRecoverySelection(purchaseJson,originalPayment){
  if(arguments.length!==2||new.target!==undefined)fail();
  const c=fields(originalPayment,['resourceUrl','serializedCheckpoint','expectedPins'],true);
  const pins=fields(c.expectedPins,['binding','digests'],true);
  const binding=fields(pins.binding,['requestId','paymentHash','origin','contextId'],true);
  const digests=fields(pins.digests,['requestBody','paymentPayload','paymentRequirements','context'],true);
  const original=F({...c,expectedPins:F({binding,digests})});
  const checkpoint=restoreOriginalPaymentCheckpoint(original.serializedCheckpoint,original.expectedPins);
  const purchase=captureApiCreditPurchaseExpectation(purchaseJson,checkpoint.originalBytes.paymentRequirements,original.resourceUrl);
  const selection=F({purchasedGrantRecoveryVersion:1,fundingResourceUrl:original.resourceUrl,
    paymentHash:checkpoint.binding.paymentHash,checkpointDigest:createHash('sha256').update(original.serializedCheckpoint).digest('hex'),
    holderId:purchase.holderId,authority:'NONE'});
  SELECTIONS.set(selection,{original,purchase,claimed:false,bound:false,observed:false,ready:null});return selection;
}
/** Claim before any opener/guard callback. Reentry cannot borrow the same
 * selection twice. The separately pinned full ready-profile digest remains
 * mandatory at its existing owner and cannot be derived from the read row. */
export function claimApiCreditPurchasedGrantRecoverySelection(selection,expectedOriginal,accountId){
  if(arguments.length!==3||new.target!==undefined)fail();const s=state(selection);if(s.claimed)fail();s.claimed=true;
  const e=fields(expectedOriginal,['paymentId','originalDigest','fundingResourceUrl','paymentHash','requestId','checkpointDigest','queryDigest','profileDigest'],true);
  if(e.fundingResourceUrl!==selection.fundingResourceUrl||e.paymentHash!==selection.paymentHash
      ||e.checkpointDigest!==selection.checkpointDigest||accountId!==s.purchase.holderId)fail();
}
/** Only the existing owner's independently digest-bound ready record can be
 * bound. The SAME file must still close before this profile reaches transport. */
export function bindApiCreditPurchasedGrantRecoveryProfile(selection,profileJson){
  if(arguments.length!==2||new.target!==undefined)fail();const s=state(selection);if(!s.claimed||s.bound)fail();s.bound=true;
  const recovered=captureApiCreditFundingGrantRecoveryProfile(profileJson,s.original);let token;
  try{
    token=decodeApiCreditOriginalGrantQueryProfile(profileJson);if(token.originalGrantQueryVersion!==1)fail();
    const ready=consumeApiCreditOriginalGrantQueryProfile(token),q=ready.query.originalFunding,p=s.purchase;
    if(q.offerId!==p.offerId||q.offerVersion!==p.offerVersion||q.holderId!==p.holderId
        ||q.capabilityCommitment!==p.capabilityCommitment||q.grantFundingCommitment!==p.fundingCommitment
        ||recovered.transactionHash!==selection.paymentHash||ready.checkpointDigest!==selection.checkpointDigest)fail();
    s.ready=ready;return ready;
  }finally{if(token!==undefined)releaseApiCreditOriginalGrantQueryProfile(token);}
}
/** A closed historical query may report ACTIVE, EXPIRED, REVOKED or absence.
 * Recorded units/absolute expiry must remain the purchased terms. Expiry does
 * not erase history or liability, and none of these outcomes authorizes work,
 * activation, payment, compensation or release of the spending reservation. */
export function captureApiCreditPurchasedGrantRecoveryOutput(selection,output){
  if(arguments.length!==2||new.target!==undefined)fail();const s=state(selection);
  if(!s.claimed||!s.bound||s.ready===null||s.observed)fail();s.observed=true;
  const value=captureApiCreditOriginalGrantQueryOutput(output),ready=s.ready,p=s.purchase;
  if(value.fundingResourceUrl!==selection.fundingResourceUrl||value.paymentHash!==selection.paymentHash
      ||value.checkpointDigest!==selection.checkpointDigest||value.requestId!==ready.query.requestId||value.queryDigest!==ready.queryDigest)fail();
  const history=captureServiceCreditOriginalFundingGrantResult(value.history,ready.query.originalFunding),record=history.record;
  if(record!==null&&(record.totalUnits!==p.totalUnits||record.expiresAt!==p.expiresAt))fail();
  return value;
}
