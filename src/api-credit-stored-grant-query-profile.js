import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { captureOriginalFundingSpendingFileProfile } from './original-funding-spending-file-profile.js';
import { captureFundingPostCheckpointRoute } from './x402-funding-post-checkpoint-route.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn,PROFILES=new WeakMap();
function fail(){throw new TypeError('API_CREDIT_STORED_GRANT_QUERY_PROFILE');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length)fail();
  const out={};for(const name of names){const d=D(v,name);if(!d?.enumerable||!O(d,'value'))fail();Object.defineProperty(out,name,{value:d.value,enumerable:true});}return out;}
function hash(v){return typeof v==='string'&&/^[0-9a-f]{64}$/.exec(v)?.[0]===v;}
function taggedHash(v){return typeof v==='string'&&/^sha256:[0-9a-f]{64}$/.exec(v)?.[0]===v;}
function identifier(v){return typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.exec(v)?.[0]===v;}
function freezeJson(v,depth=0,budget={nodes:2048}){if(--budget.nodes<0||depth>16)fail();
  if(v===null||typeof v==='string'||typeof v==='boolean')return;
  if(typeof v==='number'){if(!Number.isSafeInteger(v)||Object.is(v,-0))fail();return;}
  if(typeof v!=='object')fail();for(const child of Object.values(v))freezeJson(child,depth+1,budget);F(v);
}
/** Independent operator expectations, never populated from the row being read.
 * The full profile digest binds its existing proof, CA, origin and budgets. */
export function captureApiCreditStoredGrantQueryExpected(input){
  if(arguments.length!==1)fail();const c=fields(input,['paymentId','originalDigest','fundingResourceUrl','paymentHash','requestId','checkpointDigest','queryDigest','profileDigest']);
  if(!identifier(c.paymentId)||!identifier(c.requestId)||!taggedHash(c.originalDigest)||!taggedHash(c.queryDigest)
      ||![c.paymentHash,c.checkpointDigest,c.profileDigest].every(hash))fail();
  captureFundingPostCheckpointRoute(c.fundingResourceUrl);return F(c);
}
/** Same --funding-grant-query-fd entry, explicit stored-profile version. It
 * admits only an existing selected four-table spending file and full-profile
 * expectations. No key, module, opener, transport override or owner discovery. */
export function decodeApiCreditStoredGrantQueryProfile(text){
  if(arguments.length!==1||typeof text!=='string'||Buffer.byteLength(text)>16384||Buffer.from(text).toString('utf8')!==text)fail();
  let raw;try{raw=JSON.parse(text);freezeJson(raw);}catch{fail();}
  if(canonicalJson(raw)!==text)fail();const c=fields(raw,['originalGrantQueryVersion','spendingFile','expectedOriginal']);
  if(c.originalGrantQueryVersion!==2)fail();const file=captureOriginalFundingSpendingFileProfile(c.spendingFile),expected=captureApiCreditStoredGrantQueryExpected(c.expectedOriginal);
  if(file.storageProfile.mode!=='OPEN_EXISTING'||file.storageProfile.policy.recipients.length!==1)fail();
  const state={file,expected,used:false,released:false};
  const release=F(function release(){if(arguments.length!==0)fail();state.released=true;state.file=null;state.expected=null;});
  const token=F({originalGrantQueryVersion:2,fundingResourceUrl:expected.fundingResourceUrl,paymentHash:expected.paymentHash,requestId:expected.requestId,
    checkpointDigest:expected.checkpointDigest,queryDigest:expected.queryDigest,profileDigest:expected.profileDigest,release});
  PROFILES.set(token,state);return token;
}
export function consumeApiCreditStoredGrantQueryProfile(token){
  if(arguments.length!==1||token===null||typeof token!=='object'||types.isProxy(token))fail();const s=PROFILES.get(token);
  if(!s||s.used||s.released)fail();s.used=true;
  return F({storedGrantQueryVersion:2,fileConfiguration:F({storageProfile:s.file.storageProfile,allowedRoot:s.file.allowedRoot,filePolicy:s.file.filePolicy}),expectedOriginal:s.expected});
}
export function releaseApiCreditStoredGrantQueryProfile(token){
  if(arguments.length!==1||token===null||typeof token!=='object'||types.isProxy(token)||!PROFILES.has(token))fail();token.release();
}
