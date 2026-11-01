// Pure fixed negative scenario. SHA-256 DATA pins; no transport, signing or resource.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson } from '../src/canonical.js';
import { captureServiceCreditHttpExecuteOriginalInput } from '../src/service-credit-http-execute-dispatch.js';
import { captureApiCreditProviderAcceptanceSelection } from './api-credit-linux-provider-contract.mjs';

const F=Object.freeze, STATES=new WeakMap();
const BASE=['runProfile','commands','runReplies','recoveryProfile','recoveryReply','ledgerProfile','signerProfile','providerProfile','providerJournalProfile','providerActivation'];
const EXPECTED='{"error":"unauthorized"}';
function fail(stage='INPUT'){const e=new TypeError('API_CREDIT_LINUX_NEGATIVE_ACCEPTANCE');Object.defineProperty(e,'stage',{value:stage});throw e;}
function fields(v,names){
 if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length)fail();
 const c={};for(const name of names){const d=Object.getOwnPropertyDescriptor(v,name);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();c[name]=d.value;}return c;
}
function hash(v){return createHash('sha256').update(v).digest('hex');}
function pin(v){return F({bytes:Buffer.byteLength(v),sha256:hash(v)});}
function state(token){if(token===null||typeof token!=='object'||types.isProxy(token)||!STATES.has(token))fail();return STATES.get(token);}
function profile(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>8192||Buffer.from(text).toString('utf8')!==text)fail();
 const p=fields(JSON.parse(text),['negativeAcceptanceVersion','foreignGrantId','changedRequestId','changedMaxCostUnits']);
 if(canonicalJson(p)!==text||p.negativeAcceptanceVersion!==1)fail();return p;
}
/** V6 retains the whole independent V5 selection. The selected mutations alter
 * only proof-bound identity/cost DATA and preserve the original public key and
 * signature string. They create no key/signature, grant or funding request. */
export function captureApiCreditNegativeAcceptanceSelection(input){
 if(arguments.length!==1)fail();let stage='SELECTION';
 try{
  const c=fields(input,[...BASE,'negativeProfile']),base={};for(const k of BASE)base[k]=c[k];
  const provider=captureApiCreditProviderAcceptanceSelection(base),run=JSON.parse(c.runProfile),selected=profile(c.negativeProfile);
  stage='LOCAL_PROFILE';
  if(run.operatorBootstrapVersion!==3||run.productProfileVersion!==3||run.loopbackRead.profile!=='LOOPBACK_QUALIFICATION_V1')fail();
  const commands=c.commands.trimEnd().split('\n').map(JSON.parse),original=commands[4].input;
  const captured=captureServiceCreditHttpExecuteOriginalInput({resourceUrl:original.serviceResourceUrl,originalRequestJson:original.originalRequestJson,authorizationHeader:original.authorizationHeader});
  const request=JSON.parse(original.originalRequestJson),proof=JSON.parse(Buffer.from(original.authorizationHeader.slice('ServiceCredit '.length),'base64url').toString('utf8'));
  stage='MUTATIONS';
  const ids=new Set(commands.slice(4,104).map(v=>v.input.requestId));
  if(selected.foreignGrantId===request.grantId||ids.has(selected.changedRequestId)||!Number.isSafeInteger(selected.changedMaxCostUnits)||Object.is(selected.changedMaxCostUnits,-0)
      ||selected.changedMaxCostUnits<1||selected.changedMaxCostUnits>1000000||selected.changedMaxCostUnits===request.maxCostUnits)fail();
  const specs=[['FOREIGN_GRANT','grantId',selected.foreignGrantId],['CHANGED_REQUEST_ID','requestId',selected.changedRequestId],['CHANGED_COST_CEILING','maxCostUnits',selected.changedMaxCostUnits]];
  const cases=specs.map(([kind,key,value])=>{
   const changedProof={...proof,[key]:value},changedRequest={...request,[key]:value};
   const authorizationHeader='ServiceCredit '+Buffer.from(canonicalJson(changedProof)).toString('base64url');
   const originalRequestJson=JSON.stringify(changedRequest);
   const wire=captureServiceCreditHttpExecuteOriginalInput({resourceUrl:captured.resourceUrl,originalRequestJson,authorizationHeader});
   if(changedProof.publicKey!==proof.publicKey||changedProof.signature!==proof.signature||authorizationHeader===original.authorizationHeader)fail();
   return F({kind,resourceUrl:wire.resourceUrl,originalRequestJson:wire.originalRequestJson,authorizationHeader,
     expectedStatusCode:401,expectedBody:EXPECTED,requestPin:pin(originalRequestJson),authorizationPin:pin(authorizationHeader)});
  });
  const origin=new URL(captured.resourceUrl).origin,transport=run.configuration.serviceOptions.transportOptions;
  if(new URL(origin).hostname!=='127.0.0.1'||Number(new URL(origin).port||443)<1024||origin!==JSON.parse(c.providerProfile).transport.origin)fail();
  for(const k of ['requestDeadlineMs','handshakeDeadlineMs','closeGraceMs'])if(!Number.isSafeInteger(transport[k])||transport[k]<1||transport[k]>30000)fail();
  if(transport.handshakeDeadlineMs>transport.requestDeadlineMs)fail();
  const serviceLimits=JSON.parse(c.providerProfile).transport.limits;
  if(serviceLimits.maxRequestStarts<109||serviceLimits.maxConnectionStarts<109)fail();
  const plan=F({origin,publicCaPem:run.publicCaPem,requestDeadlineMs:transport.requestDeadlineMs,
    handshakeDeadlineMs:transport.handshakeDeadlineMs,closeGraceMs:transport.closeGraceMs,cases:F(cases)});
  const inputPins=F({...provider.summary.inputPins,negativeProfile:pin(c.negativeProfile)});
  const selectionDigest=hash(canonicalJson({providerSelectionDigest:provider.summary.selectionDigest,inputPins,cases:cases.map(v=>({kind:v.kind,requestPin:v.requestPin,authorizationPin:v.authorizationPin}))}));
  const summary=F({...provider.summary,version:6,inputPins,selectionDigest,providerSelectionDigest:provider.summary.selectionDigest,
    negativeProbeProcesses:1,negativeServiceRequests:3,negativeRequestKinds:F(cases.map(c=>c.kind)),negativeRequestsAfterBuyerClose:true,
    negativeRequestsBeforeProviderClose:true,negativeRequestsCreateGrantOrFunding:false,ledgerExpectedRequestsAfterNegatives:100,
    negativeServiceAcceptance:'NOT_EXECUTED',changedOfferAcceptance:'NOT_ESTABLISHED',differentPaymentIdentityAcceptance:'NOT_ESTABLISHED'});
  const token=F({negativeAcceptanceVersion:1,summary});STATES.set(token,{provider,plan,entered:false,status:'READY'});return token;
 }catch{fail(stage);}
}
export function apiCreditNegativeAcceptancePlan(token){if(arguments.length!==1)fail();return state(token).plan;}
export function apiCreditNegativeAcceptanceProviderSelection(token){if(arguments.length!==1)fail();return state(token).provider;}
/** The native caller supplies its fixed HTTPS exchange with known client close.
 * DATA controls supply declared memory replies. An unknown/refused exchange
 * terminates the sequence; a token cannot repeat it or continue later. */
export async function runApiCreditNegativeAcceptance(token,ports){
 if(arguments.length!==2)fail();const s=state(token),p=fields(ports,['exchange']);
 if(typeof p.exchange!=='function'||types.isProxy(p.exchange)||!Object.isFrozen(p.exchange)||s.entered)fail();
 s.entered=true;s.status='ENTERED';const observations=[];
 try{
  for(const selected of s.plan.cases){
   const r=fields(await Reflect.apply(p.exchange,undefined,[selected]),['statusCode','body','requestClosed','responseClosed','responseComplete','clientCloseReturned']);
   if(r.statusCode!==selected.expectedStatusCode||r.body!==selected.expectedBody||r.requestClosed!==true||r.responseClosed!==true||r.responseComplete!==true||r.clientCloseReturned!==true)fail('REPLY');
   observations.push(F({kind:selected.kind,statusCode:401,bodyPin:pin(r.body),requestPin:selected.requestPin,authorizationPin:selected.authorizationPin}));
  }
  s.status='OBSERVED';return F({version:6,status:'SERVICE_NEGATIVE_REPLIES_MATCHED',selectionDigest:token.summary.selectionDigest,negativeRequests:3,
   observations:F(observations),authority:'NONE',mayDispatchFunding:false,additionalGrant:false,mayRetry:false,
   physicalRelease:'NOT_ESTABLISHED',negativeServiceAcceptance:'NOT_ESTABLISHED',changedOfferAcceptance:'NOT_ESTABLISHED',differentPaymentIdentityAcceptance:'NOT_ESTABLISHED',G1Acceptance:'NOT_ESTABLISHED',G2Acceptance:'NOT_ESTABLISHED'});
 }catch{s.status='UNKNOWN';fail('EXCHANGE_UNKNOWN');}
}
