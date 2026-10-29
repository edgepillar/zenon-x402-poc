import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical.js';
import { restoreOriginalPaymentCheckpoint } from './service-credit-pilot-original-payment-checkpoint.js';
import { decodeApiCreditOriginalGrantQueryProfile, consumeApiCreditOriginalGrantQueryProfile,
  releaseApiCreditOriginalGrantQueryProfile } from './api-credit-original-grant-query-profile.js';
import { inspectOriginalFundingSignerContextRecord, projectOriginalFundingSignerContextRecord } from './original-funding-signer-context-custody.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn,K=Reflect.ownKeys;
const KEYS=['grantQueryCustodyVersion','paymentId','originalDigest','transactionHash','checkpointDigest','queryDigest','profileJson'];
function fail(){throw new TypeError('API_CREDIT_FUNDING_GRANT_RECOVERY_RECORD');}
function fields(value,names){if(value===null||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||K(value).length!==names.length)fail();
  const out={};for(const name of names){const d=D(value,name);if(!d?.enumerable||!O(d,'value'))fail();Object.defineProperty(out,name,{value:d.value,enumerable:true});}return out;}
function text(value,max){if(typeof value!=='string'||Buffer.byteLength(value)>max||Buffer.from(value).toString('utf8')!==value)fail();}
function snapshot(value,depth=0,budget={nodes:8192,bytes:65536}){
  if(--budget.nodes<0||depth>24)fail();
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='string'){budget.bytes-=Buffer.byteLength(value);if(budget.bytes<0)fail();return value;}
  if(typeof value==='number'){if(!Number.isSafeInteger(value)||Object.is(value,-0))fail();return value;}
  if(typeof value!=='object'||types.isProxy(value))fail();
  const array=Array.isArray(value),keys=K(value);if(Object.getPrototypeOf(value)!==(array?Array.prototype:Object.prototype))fail();
  if(array){const length=D(value,'length')?.value;if(!Number.isSafeInteger(length)||length>4096||keys.length!==length+1)fail();
    const out=[];for(let i=0;i<length;i++){const d=D(value,String(i));if(!d?.enumerable||!O(d,'value'))fail();out.push(snapshot(d.value,depth+1,budget));}return F(out);}
  const out={};for(const key of keys){const d=D(value,key);if(typeof key!=='string'||!d?.enumerable||!O(d,'value'))fail();
    budget.bytes-=Buffer.byteLength(key);if(budget.bytes<0)fail();Object.defineProperty(out,key,{value:snapshot(d.value,depth+1,budget),enumerable:true});}return F(out);
}
function profile(textInput){
  text(textInput,65536);let token;
  try{token=decodeApiCreditOriginalGrantQueryProfile(textInput);if(token.originalGrantQueryVersion!==1)fail();const captured=consumeApiCreditOriginalGrantQueryProfile(token);
    return F({original:JSON.parse(textInput).originalPayment,captured,transactionHash:token.paymentHash});}
  finally{if(token!==undefined)releaseApiCreditOriginalGrantQueryProfile(token);}
}
/** Existing proof DATA is detached and bound to the independently selected
 * original checkpoint/pins before custody. No key, proof/signature verification,
 * provider read, store, SDK or new payment authority is entered. */
export function captureApiCreditFundingGrantRecoveryProfile(textInput,expectedOriginal){
  if(arguments.length!==2)fail();const expected=fields(expectedOriginal,['resourceUrl','serializedCheckpoint','expectedPins']);
  const pins=snapshot(expected.expectedPins);restoreOriginalPaymentCheckpoint(expected.serializedCheckpoint,pins);
  const selected=profile(textInput);
  if(selected.original.resourceUrl!==expected.resourceUrl||selected.original.serializedCheckpoint!==expected.serializedCheckpoint
      ||canonicalJson(selected.original.expectedPins)!==canonicalJson(pins))fail();
  return F({profileJson:textInput,expectedPins:pins,transactionHash:selected.transactionHash,
    checkpointDigest:selected.captured.checkpointDigest,queryDigest:selected.captured.queryDigest,authority:'NONE'});
}
function capture(reservation,signerRaw,profileJson){
  const signer=inspectOriginalFundingSignerContextRecord(signerRaw,reservation);if(signer.phase!=='SIGNED')fail();
  const projected=projectOriginalFundingSignerContextRecord(signerRaw,F({paymentId:signer.paymentId,originalDigest:signer.originalDigest}));
  const selected=captureApiCreditFundingGrantRecoveryProfile(profileJson,F({resourceUrl:signer.fundingResourceUrl,
    serializedCheckpoint:projected.packet.serializedCheckpoint,expectedPins:projected.packet.expectedPins}));
  if(selected.transactionHash!==signer.transactionHash)fail();
  return F({grantQueryCustodyVersion:1,paymentId:signer.paymentId,originalDigest:signer.originalDigest,
    transactionHash:selected.transactionHash,checkpointDigest:selected.checkpointDigest,queryDigest:selected.queryDigest,profileJson});
}
/** Write-once custody DATA, backed by the SAME retained SIGNED context and
 * spending reservation. Signature-shaped bytes remain unauthenticated here. */
export function createApiCreditFundingGrantRecoveryRecord(reservation,signerRaw,profileJson){
  if(arguments.length!==3||fields(reservation,['paymentId','originalDigest','network','asset','recipient','amount','reservedDay','status','spentDay']).status!=='RESERVED')fail();
  const raw=canonicalJson(capture(reservation,signerRaw,profileJson));text(raw,131072);return raw;
}
export function inspectApiCreditFundingGrantRecoveryRecord(raw,reservation,signerRaw){
  if(arguments.length!==3)fail();text(raw,131072);let value;try{value=fields(JSON.parse(raw),KEYS);}catch{fail();}
  if(value.grantQueryCustodyVersion!==1||canonicalJson(value)!==raw||canonicalJson(capture(reservation,signerRaw,value.profileJson))!==raw)fail();
  return F(value);
}
/** Keyless, independently pinned read projection. The caller's store owner
 * validates reservation/signer history. Missing history never permits send. */
export function projectApiCreditFundingGrantRecoveryRecord(raw,expected){
  if(arguments.length!==2)fail();text(raw,131072);const pins=fields(expected,['paymentId','originalDigest','checkpointDigest','queryDigest']);
  let value;try{value=fields(JSON.parse(raw),KEYS);}catch{fail();}
  if(value.grantQueryCustodyVersion!==1||canonicalJson(value)!==raw||!/^sha256:[0-9a-f]{64}$/.test(value.originalDigest)
      ||typeof value.paymentId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(value.paymentId))fail();
  for(const key of K(pins))if(value[key]!==pins[key])fail();
  const selected=profile(value.profileJson);
  if(value.transactionHash!==selected.transactionHash||value.checkpointDigest!==selected.captured.checkpointDigest||value.queryDigest!==selected.captured.queryDigest)fail();
  return F({grantQueryRecoveryVersion:1,profileJson:value.profileJson,profileDigest:createHash('sha256').update(value.profileJson).digest('hex'),
    paymentId:value.paymentId,originalDigest:value.originalDigest,checkpointDigest:value.checkpointDigest,queryDigest:value.queryDigest,
    authority:'NONE',spendingReservation:'UNCHANGED',maySignPayment:false,mayDispatchFunding:false,mayDispatchService:false,mayActivateGrant:false});
}
