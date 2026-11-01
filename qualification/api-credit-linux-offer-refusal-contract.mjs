// Pure V7 selection for an actual CLI public-offer refusal BEFORE credential.
// Native launcher, key/signature operations, SQLite and transport stay unexecuted.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson } from '../src/canonical.js';
import { decodeNonDpApiCreditOperatorBootstrap } from '../src/api-credit-operator-bootstrap.js';
import { API_CREDIT_PUBLIC_PROFILE_REFUSAL_STDERR } from '../src/api-credit-operator-result.js';
import { captureApiCreditNegativeAcceptanceSelection } from './api-credit-linux-negative-contract.mjs';
const F=Object.freeze,STATES=new WeakMap();
const BASE=['runProfile','commands','runReplies','recoveryProfile','recoveryReply','ledgerProfile','signerProfile','providerProfile','providerJournalProfile','providerActivation','negativeProfile'];
function fail(){throw new TypeError('API_CREDIT_LINUX_OFFER_REFUSAL_SELECTION');}
function fields(v,names){
 if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length)fail();
 const c={};for(const name of names){const d=Object.getOwnPropertyDescriptor(v,name);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();c[name]=d.value;}return c;
}
function pin(text){return F({bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')});}
/** Keep the same whole V6 scenario. Only the independently selected purchase
 * offer version changes in this extra public-profile attempt; challenge,
 * payment preparation, original pins and every credential remain untouched. */
export function captureApiCreditOfferRefusalAcceptanceSelection(input){
 if(arguments.length!==1)fail();
 try{
  const c=fields(input,[...BASE,'offerRefusalProfile']),base={};for(const k of BASE)base[k]=c[k];
  const negative=captureApiCreditNegativeAcceptanceSelection(base),run=JSON.parse(c.runProfile),purchase=JSON.parse(run.purchaseExpectationJson);
  if(typeof c.offerRefusalProfile!=='string'||Buffer.byteLength(c.offerRefusalProfile)>8192||Buffer.from(c.offerRefusalProfile).toString('utf8')!==c.offerRefusalProfile)fail();
  const selected=fields(JSON.parse(c.offerRefusalProfile),['offerRefusalVersion','offerVersion']);
  if(canonicalJson(selected)!==c.offerRefusalProfile||selected.offerRefusalVersion!==1||!Number.isSafeInteger(selected.offerVersion)
   ||selected.offerVersion<1||Object.is(selected.offerVersion,-0)||selected.offerVersion===purchase.offer.offerVersion)fail();
  purchase.offer.offerVersion=selected.offerVersion;run.purchaseExpectationJson=canonicalJson(purchase);
  const rejectedProfile=canonicalJson(run);if(Buffer.byteLength(rejectedProfile)>262144)fail();
  // A source DATA rejection is not the future CLI observation. Require that
  // the actual product decoder refuses, not an EOF caused by an absent key.
  let refused=false,prepared=null;
  try{prepared=decodeNonDpApiCreditOperatorBootstrap(rejectedProfile);}catch{refused=true;}
  finally{if(prepared!==null)prepared.release();}
  if(!refused)fail();
  const plan=F({profile:rejectedProfile,profilePin:pin(rejectedProfile),expectedExitCode:1,
   expectedStderr:API_CREDIT_PUBLIC_PROFILE_REFUSAL_STDERR,expectedStderrPin:pin(API_CREDIT_PUBLIC_PROFILE_REFUSAL_STDERR),
   credentialBytesProvided:0,commandFrames:0,expectedReplyFrames:0,credentialEOFIsNotAProfileRefusal:true});
  const inputPins=F({...negative.summary.inputPins,offerRefusalProfile:pin(c.offerRefusalProfile)});
  const selectionDigest=pin(canonicalJson({negativeSelectionDigest:negative.summary.selectionDigest,inputPins,profilePin:plan.profilePin,expectedStderrPin:plan.expectedStderrPin})).sha256;
  const summary=F({...negative.summary,version:7,inputPins,selectionDigest,negativeSelectionDigest:negative.summary.selectionDigest,
   offerRefusalProcesses:1,offerRefusalBeforeProviderOrCredential:true,offerRefusalProfilePin:plan.profilePin,
   offerRefusalMarkerPin:plan.expectedStderrPin,offerRefusalCredentialBytes:0,offerRefusalCommands:0,
   publicOfferRefusalAcceptance:'NOT_EXECUTED',differentPaymentIdentityAcceptance:'NOT_ESTABLISHED'});
  const token=F({offerRefusalAcceptanceVersion:1,summary});STATES.set(token,{plan,negative});return token;
 }catch{fail();}
}
function state(token){if(token===null||typeof token!=='object'||types.isProxy(token)||!STATES.has(token))fail();return STATES.get(token);}
export function apiCreditOfferRefusalAcceptancePlan(token){if(arguments.length!==1)fail();return state(token).plan;}
export function apiCreditOfferRefusalNegativeSelection(token){if(arguments.length!==1)fail();return state(token).negative;}
