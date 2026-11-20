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
const RECORD_PINS=['paymentId','originalDigest','checkpointDigest','queryDigest'];
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
function profile(textInput,expectedDigest){
  text(textInput,65536);
  if(expectedDigest!==undefined&&profileDigest(textInput)!==expectedDigest)fail();
  let token;
  try{token=decodeApiCreditOriginalGrantQueryProfile(textInput);if(token.originalGrantQueryVersion!==1)fail();const captured=consumeApiCreditOriginalGrantQueryProfile(token);
    return F({original:JSON.parse(textInput).originalPayment,captured,transactionHash:token.paymentHash});}
  finally{if(token!==undefined)releaseApiCreditOriginalGrantQueryProfile(token);}
}
function captureExpectedOriginal(expectedOriginal){
  const expected=fields(expectedOriginal,['resourceUrl','serializedCheckpoint','expectedPins']);
  const pins=snapshot(expected.expectedPins);restoreOriginalPaymentCheckpoint(expected.serializedCheckpoint,pins);
  return { ...expected, expectedPins: pins };
}
function requireOriginalMatch(selected,expected){
  if(selected.original.resourceUrl!==expected.resourceUrl||selected.original.serializedCheckpoint!==expected.serializedCheckpoint
      ||canonicalJson(selected.original.expectedPins)!==canonicalJson(expected.expectedPins))fail();
}
function captureMatchedProfile(textInput,expectedOriginal){
  const expected=captureExpectedOriginal(expectedOriginal);
  const selected=profile(textInput);
  requireOriginalMatch(selected,expected);
  return { selected, pins: expected.expectedPins };
}
function readyProfile(selected){
  return F({ profile: selected.captured, transactionHash: selected.transactionHash });
}
/** Existing proof DATA is detached and bound to the independently selected
 * original checkpoint/pins before custody. No key, proof/signature verification,
 * provider read, store, SDK or new payment authority is entered. */
export function captureApiCreditFundingGrantRecoveryProfile(textInput,expectedOriginal){
  if(arguments.length!==2)fail();
  const { selected, pins } = captureMatchedProfile(textInput,expectedOriginal);
  return F({profileJson:textInput,expectedPins:pins,transactionHash:selected.transactionHash,
    checkpointDigest:selected.captured.checkpointDigest,queryDigest:selected.captured.queryDigest,authority:'NONE'});
}
/** Return the ready query from the same independent-original comparison. */
export function captureApiCreditFundingGrantRecoveryReadyProfile(textInput,expectedOriginal){
  if(arguments.length!==2)fail();
  const { selected } = captureMatchedProfile(textInput,expectedOriginal);
  return readyProfile(selected);
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
function pinnedRecord(raw,pins){
  text(raw,131072);
  let value;try{value=fields(JSON.parse(raw),KEYS);}catch{fail();}
  if(value.grantQueryCustodyVersion!==1||canonicalJson(value)!==raw||!/^sha256:[0-9a-f]{64}$/.test(value.originalDigest)
      ||typeof value.paymentId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(value.paymentId))fail();
  for(const key of RECORD_PINS)if(value[key]!==pins[key])fail();
  return value;
}
function selectRecordProfile(value,expectedDigest){
  const selected=profile(value.profileJson,expectedDigest);
  if(value.transactionHash!==selected.transactionHash||value.checkpointDigest!==selected.captured.checkpointDigest||value.queryDigest!==selected.captured.queryDigest)fail();
  return selected;
}
function profileDigest(textInput){
  return createHash('sha256').update(textInput).digest('hex');
}
/** Keyless, independently pinned read projection. The caller's store owner
 * validates reservation/signer history. Missing history never permits send. */
export function projectApiCreditFundingGrantRecoveryRecord(raw,expected){
  if(arguments.length!==2)fail();
  const value=pinnedRecord(raw,fields(expected,RECORD_PINS));
  selectRecordProfile(value);
  return F({grantQueryRecoveryVersion:1,profileJson:value.profileJson,profileDigest:profileDigest(value.profileJson),
    paymentId:value.paymentId,originalDigest:value.originalDigest,checkpointDigest:value.checkpointDigest,queryDigest:value.queryDigest,
    authority:'NONE',spendingReservation:'UNCHANGED',maySignPayment:false,mayDispatchFunding:false,mayDispatchService:false,mayActivateGrant:false});
}
/** Bind the full retained profile digest before decoding its ready query.
 * Purchased recovery also supplies independently pinned original bytes. */
export function captureApiCreditFundingGrantRecoveryReadyRecord(raw,expected,expectedOriginal){
  if(arguments.length!==3)fail();
  const pins=fields(expected,[...RECORD_PINS,'profileDigest']);
  if(typeof pins.profileDigest!=='string')fail();
  const value=pinnedRecord(raw,pins);
  const selected=selectRecordProfile(value,pins.profileDigest);
  if(expectedOriginal!==null)requireOriginalMatch(selected,captureExpectedOriginal(expectedOriginal));
  return readyProfile(selected);
}
