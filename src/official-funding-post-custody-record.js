import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { decodeB64Json,validatePaymentPayloadEnvelope,sameResource,sameRequirements } from './x402-wire.js';
import { createIssuedFundingPostSdkResourceBinding } from './x402-issued-funding-post-sdk-resource.js';
import { captureIssuedFundingPostServiceSelection,createIssuedFundingPostApplicationBinding } from './x402-issued-funding-post-application-binding.js';
import { captureIssuedExpiredFundingResult } from './issued-expired-funding-receipt.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn,K=Reflect.ownKeys;
const KEYS=['version','resourceUrl','issuedFrameJson','serviceSelectionJson','originalHeader','transactionHash','boundJson','maximumPendingReconciliations','observations','phase','outcomeJson'];
const IMMUTABLE=KEYS.filter(k=>!['observations','phase','outcomeJson'].includes(k));
const BOUND=['status','transactionHash','observerRecordKey','observerFileName'];
const OUTCOME=['phase','intake','official','transactionHash','acknowledgementDomainsIndependent','authority','grantActivation','serviceDelivery'];
function fail(){throw new TypeError('OFFICIAL_FUNDING_POST_CUSTODY_RECORD');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||K(v).length!==names.length)fail();
 const out={};for(const name of names){const d=D(v,name);if(!d?.enumerable||!O(d,'value'))fail();Object.defineProperty(out,name,{value:d.value,enumerable:true});}return out;}
function text(v,max){if(typeof v!=='string'||!v.length||Buffer.byteLength(v)>max||Buffer.from(v).toString('utf8')!==v)fail();return v;}
function hash(v){return typeof v==='string'&&/^[0-9a-f]{64}$/.exec(v)?.[0]===v;}
function integer(v,max){if(!Number.isSafeInteger(v)||Object.is(v,-0)||v<0||v>max)fail();return v;}
function snapshot(v,depth=0,budget={nodes:4096,bytes:32768}){
 if(--budget.nodes<0||depth>16)fail();if(v===null||typeof v==='boolean')return v;
 if(typeof v==='string'){budget.bytes-=Buffer.byteLength(v);if(budget.bytes<0)fail();return v;}
 if(typeof v==='number'){if(!Number.isSafeInteger(v)||Object.is(v,-0))fail();return v;}
 if(typeof v!=='object'||types.isProxy(v))fail();const array=Array.isArray(v),proto=Object.getPrototypeOf(v),keys=K(v);
 if(array){if(proto!==Array.prototype)fail();const n=D(v,'length')?.value;if(!Number.isSafeInteger(n)||n>256||keys.length!==n+1)fail();
  const out=[];for(let i=0;i<n;i++){const d=D(v,String(i));if(!d?.enumerable||!O(d,'value'))fail();out.push(snapshot(d.value,depth+1,budget));}return F(out);}
 if((proto!==Object.prototype&&proto!==null)||keys.length>128)fail();const out={};
 for(const key of keys){if(typeof key!=='string'||['toJSON','__proto__','constructor','prototype'].includes(key))fail();const d=D(v,key);if(!d?.enumerable||!O(d,'value'))fail();
  budget.bytes-=Buffer.byteLength(key);if(budget.bytes<0)fail();Object.defineProperty(out,key,{value:snapshot(d.value,depth+1,budget),enumerable:true});}return F(out);
}
function parse(raw,max){text(raw,max);let value;try{value=JSON.parse(raw);}catch{fail();}const v=snapshot(value,0,{nodes:4096,bytes:max});if(canonicalJson(v)!==raw)fail();return v;}
function bound(value){
 const v=snapshot(value),b=fields(v,BOUND);
 if(b.status!=='BOUND'||!hash(b.transactionHash)||typeof b.observerRecordKey!=='string'||/^sha256:[0-9a-f]{64}$/.exec(b.observerRecordKey)?.[0]!==b.observerRecordKey
   ||b.observerFileName!=='funding-observer-'+b.transactionHash+'.sqlite')fail();
 return F(b);
}
function nullBound(v){const out=Object.create(null);for(const k of BOUND)Object.defineProperty(out,k,{value:v[k],enumerable:true});return F(out);}
/** Fixed issued context and policy, with no key, signer, SDK or store entry. */
export function captureOfficialFundingPostCustodyContext(input){
 if(arguments.length!==1)fail();const c=fields(input,['issuedFrame','resourceUrl','serviceSelection','maximumPendingReconciliations']);
 integer(c.maximumPendingReconciliations,16);const issued=createIssuedFundingPostSdkResourceBinding(c.issuedFrame,c.resourceUrl).selection();
 const service=captureIssuedFundingPostServiceSelection(c.serviceSelection);
 return F({resourceUrl:c.resourceUrl,issuedFrameJson:canonicalJson(issued.frame),serviceSelectionJson:canonicalJson(service),maximumPendingReconciliations:c.maximumPendingReconciliations});
}
function context(value){
 const c=fields(value,['resourceUrl','issuedFrameJson','serviceSelectionJson','maximumPendingReconciliations']);
 const selected=captureOfficialFundingPostCustodyContext({resourceUrl:c.resourceUrl,issuedFrame:parse(c.issuedFrameJson,8192),serviceSelection:parse(c.serviceSelectionJson,4096),maximumPendingReconciliations:c.maximumPendingReconciliations});
 if(canonicalJson(selected)!==canonicalJson(c))fail();return selected;
}
function original(header,c,b){
 text(header,5464);const payload=decodeB64Json(header,{maxEncodedBytes:5464,maxDecodedBytes:4096});validatePaymentPayloadEnvelope(payload);
 const selected=createIssuedFundingPostSdkResourceBinding(parse(c.issuedFrameJson,8192),c.resourceUrl).selection();
 if(!sameResource(payload.resource,selected.resource)||!sameRequirements(payload.accepted,selected.requirement)||payload.payload.transaction.hash!==b.transactionHash
  ||payload.payload.transaction.address!==parse(c.serviceSelectionJson,4096).holderId)fail();
 return payload;
}
function output(value,c,b){
 const out=fields(snapshot(value),OUTCOME),intake=bound(out.intake);
 if(canonicalJson(intake)!==canonicalJson(b)||out.transactionHash!==b.transactionHash)fail();
 const captured=F({...out,intake:nullBound(intake)}),binding=createIssuedFundingPostApplicationBinding({issuedFrame:parse(c.issuedFrameJson,8192),resourceUrl:c.resourceUrl,serviceSelection:parse(c.serviceSelectionJson,4096)});
 binding.captureBoundOutcome(captured);const raw=canonicalJson(captured);text(raw,32768);return raw;
}
function phaseOf(raw){return {INTAKE_BOUND_OFFICIAL_PENDING:'PENDING',INTAKE_BOUND_OFFICIAL_SETTLED:'SETTLED',INTAKE_BOUND_OFFICIAL_EXHAUSTED:'EXHAUSTED'}[parse(raw,32768).phase]??null;}
function encode(v){const raw=canonicalJson(v);text(raw,65536);return raw;}
/** Durable first-attempt intent; persist and read back BEFORE SDK entry. */
export function createOfficialFundingPostEnteredRecord(selected,originalHeader,intakeBound){
 if(arguments.length!==3)fail();const c=context(selected),b=bound(intakeBound);original(originalHeader,c,b);
 return encode({version:1,...c,originalHeader,transactionHash:b.transactionHash,boundJson:canonicalJson(b),observations:0,phase:'FIRST_IN_FLIGHT',outcomeJson:null});
}
/** Historical DATA only. A checksum or BOUND never manufactures settlement. */
function inspectVersionOne(raw){
 if(arguments.length!==1)fail();const r=fields(parse(raw,65536),KEYS);
 if(r.version!==1||!hash(r.transactionHash)||!['FIRST_IN_FLIGHT','OBSERVATION_IN_FLIGHT','PENDING','SETTLED','EXHAUSTED'].includes(r.phase))fail();
 const c=context({resourceUrl:r.resourceUrl,issuedFrameJson:r.issuedFrameJson,serviceSelectionJson:r.serviceSelectionJson,maximumPendingReconciliations:r.maximumPendingReconciliations});
 integer(r.observations,r.maximumPendingReconciliations);const b=bound(parse(r.boundJson,1024));
 if(b.transactionHash!==r.transactionHash||canonicalJson(b)!==r.boundJson)fail();original(r.originalHeader,c,b);
 if(r.phase==='FIRST_IN_FLIGHT'){if(r.observations!==0||r.outcomeJson!==null)fail();}
 else{
  if(r.phase==='OBSERVATION_IN_FLIGHT'&&r.observations<1)fail();
  const o=parse(r.outcomeJson,32768);if(output(o,c,b)!==r.outcomeJson)fail();const p=phaseOf(r.outcomeJson);
  if(p!==(r.phase==='OBSERVATION_IN_FLIGHT'?'PENDING':r.phase))fail();
  if(r.phase==='EXHAUSTED'&&(r.observations===0||r.observations!==r.maximumPendingReconciliations))fail();
  if(r.phase==='PENDING'&&r.observations>0&&r.observations>=r.maximumPendingReconciliations)fail();
 }
 return F(r);
}
function expiryPins(value,record){
 const selected=fields(value,['transactionHash','fundingCommitment','expiresAt']);
 if(!hash(selected.transactionHash)||typeof selected.fundingCommitment!=='string'
   ||/^sha256:[0-9a-f]{64}$/.exec(selected.fundingCommitment)?.[0]!==selected.fundingCommitment
   ||!Number.isSafeInteger(selected.expiresAt)||selected.expiresAt<1)fail();
 const issued=createIssuedFundingPostSdkResourceBinding(parse(record.issuedFrameJson,8192),record.resourceUrl).selection();
 if(selected.transactionHash!==record.transactionHash
   ||selected.fundingCommitment!=='sha256:'+issued.resource.tags[1]+issued.resource.tags[2])fail();
 return F(selected);
}
function expiredEnvelope(raw){
 const envelope=fields(parse(raw,65536),['version','officialRecord','expiredFunding']);
 if(envelope.version!==2)fail();const record=inspectVersionOne(canonicalJson(envelope.officialRecord));
 if(record.phase!=='SETTLED')fail();const value=parse(canonicalJson(envelope.expiredFunding),4096);
 const issued=createIssuedFundingPostSdkResourceBinding(parse(record.issuedFrameJson,8192),record.resourceUrl).selection();
 const pins=expiryPins({transactionHash:record.transactionHash,
  fundingCommitment:'sha256:'+issued.resource.tags[1]+issued.resource.tags[2],
  expiresAt:value.expiresAt},record);
 const receipt=captureIssuedExpiredFundingResult(value,pins);
 if(canonicalJson(receipt)!==canonicalJson(envelope.expiredFunding))fail();return F({envelope,record,receipt});
}
/** V2 preserves the canonical terminal V1 object without string-encoding it
 * again. Canonical reconstruction recovers the exact original bytes. Existing
 * readers still see the same closed official outcome; no SDK state is invented.
 * A stored receipt is historical metadata, never fresh funding authentication. */
export function inspectOfficialFundingPostCustodyRecord(raw){
 if(arguments.length!==1)fail();const parsed=parse(raw,65536);
 return parsed.version===2?expiredEnvelope(raw).record:inspectVersionOne(raw);
}
export function createOfficialFundingPostExpiredRecord(raw,receipt,selected){
 if(arguments.length!==3)fail();const record=inspectVersionOne(raw);if(record.phase!=='SETTLED')fail();
 const captured=captureIssuedExpiredFundingResult(receipt,expiryPins(selected,record));
 const next=encode({version:2,officialRecord:record,expiredFunding:captured});
 expiredEnvelope(next);return next;
}
/** The SQL adapter additionally binds selected expiry to the original issued
 * challenge. Resource/transaction commitments alone do not decode its terms. */
export function inspectOfficialFundingPostExpiredReceipt(raw,selected){
 if(arguments.length!==2)fail();const record=inspectOfficialFundingPostCustodyRecord(raw),pins=expiryPins(selected,record);
 if(parse(raw,65536).version===1)return null;
 return captureIssuedExpiredFundingResult(expiredEnvelope(raw).receipt,pins);
}
export function requireOfficialFundingPostRetainedExtension(expected,proposed){
 if(arguments.length!==2)fail();const before=inspectVersionOne(expected),next=expiredEnvelope(proposed);
 if(before.phase!=='SETTLED'||canonicalJson(next.envelope.officialRecord)!==expected)fail();return next.record;
}
export function requireOfficialFundingPostCustodyContext(raw,selected){
 if(arguments.length!==2)fail();const r=inspectOfficialFundingPostCustodyRecord(raw),c=context(selected);
 for(const k of K(c))if(r[k]!==c[k])fail();return r;
}
/** Reserve one existing continuation observation BEFORE calling resume(). */
export function createOfficialFundingPostObservationRecord(raw){
 if(arguments.length!==1)fail();const r=inspectOfficialFundingPostCustodyRecord(raw);
 if(r.phase!=='PENDING'||r.observations>=r.maximumPendingReconciliations)fail();
 return encode({...r,observations:r.observations+1,phase:'OBSERVATION_IN_FLIGHT'});
}
/** Exact original result. Never serialize or restore a live continuation. */
export function createOfficialFundingPostOutcomeRecord(raw,outcome){
 if(arguments.length!==2)fail();const r=inspectOfficialFundingPostCustodyRecord(raw);
 if(r.phase!=='FIRST_IN_FLIGHT'&&r.phase!=='OBSERVATION_IN_FLIGHT')fail();
 const c={resourceUrl:r.resourceUrl,issuedFrameJson:r.issuedFrameJson,serviceSelectionJson:r.serviceSelectionJson,maximumPendingReconciliations:r.maximumPendingReconciliations};
 const out=output(outcome,c,bound(parse(r.boundJson,1024))),phase=phaseOf(out);
 if(phase===null||r.phase==='FIRST_IN_FLIGHT'&&phase==='EXHAUSTED'||phase==='EXHAUSTED'&&r.observations!==r.maximumPendingReconciliations
  ||phase==='PENDING'&&r.observations>0&&r.observations>=r.maximumPendingReconciliations)fail();
 return encode({...r,phase,outcomeJson:out});
}
/** Strict compare-and-swap transition. Equal proposed bytes are NOT a claim. */
export function requireOfficialFundingPostCustodyTransition(expected,proposed){
 if(arguments.length!==2)fail();const next=inspectOfficialFundingPostCustodyRecord(proposed);
 if(parse(proposed,65536).version===2)return requireOfficialFundingPostRetainedExtension(expected,proposed);
 if(expected===null){if(next.phase!=='FIRST_IN_FLIGHT')fail();return next;}
 const before=inspectOfficialFundingPostCustodyRecord(expected);for(const key of IMMUTABLE)if(before[key]!==next[key])fail();
 const legal=before.phase==='PENDING'?createOfficialFundingPostObservationRecord(expected)
  :before.phase==='FIRST_IN_FLIGHT'||before.phase==='OBSERVATION_IN_FLIGHT'?createOfficialFundingPostOutcomeRecord(expected,parse(next.outcomeJson,32768)):null;
 if(legal!==proposed)fail();return next;
}
export function officialFundingPostCustodyRecordDigest(raw){
 if(arguments.length!==1)fail();text(raw,65536);return 'sha256:'+createHash('sha256').update('zenon-x402:official-funding-post-custody:v1\0','ascii').update(raw).digest('hex');
}
/** Check the separately retained checksum BEFORE parsing. Read projection has
 * no SDK/funding/observation/service/payout authority, including SETTLED. */
export function projectOfficialFundingPostCustodyRecord(raw,selectedDigest){
 if(arguments.length!==2||officialFundingPostCustodyRecordDigest(raw)!==selectedDigest)fail();const r=inspectOfficialFundingPostCustodyRecord(raw);
 return F({recordJson:raw,recordDigest:selectedDigest,phase:r.phase,transactionHash:r.transactionHash,originalHeader:r.originalHeader,outcomeJson:r.outcomeJson,
  observations:r.observations,maximumPendingReconciliations:r.maximumPendingReconciliations,historicalObservation:true,authority:'NONE',mayEnterSdk:false,mayStartFunding:false,
  mayResumeObservation:false,mayActivateGrant:false,mayDispatchService:false,physicalRelease:'NOT_ESTABLISHED'});
}
export function projectOfficialFundingPostExpiredReceipt(raw,selectedDigest,selected){
 if(arguments.length!==3||officialFundingPostCustodyRecordDigest(raw)!==selectedDigest)fail();
 const receipt=inspectOfficialFundingPostExpiredReceipt(raw,selected);if(receipt===null)return null;
 return F({expiredFundingHistoryVersion:1,recordDigest:selectedDigest,receipt,
  verification:'STORED_HISTORY_NOT_REVALIDATED',authority:'NONE',mayEnterSdk:false,mayStartFunding:false,
  mayReverifyFunding:false,mayActivateGrant:false,mayDispatchService:false,mayStartCompensation:false,
  physicalRelease:'NOT_ESTABLISHED'});
}
