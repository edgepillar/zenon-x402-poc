import { requireIssuedProviderClosedOwners } from './issued-provider-close-observation.js';
import { enterIssuedProviderOriginalObserver } from './issued-provider-original-observer-admission.js';
// SOURCE/PARSER ONLY: actual journal/SQL/core/SDK/TLS/FIFO use is unexecuted.
import process,{hrtime} from 'node:process';
import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { setTimeout,clearTimeout } from 'node:timers';
import { types,TextDecoder } from 'node:util';
import { canonicalJson } from './canonical.js';
import { decodeIssuedProviderOperatorBootstrap,readIssuedProviderOperatorBootstrap,bindIssuedProviderOperatorBootstrap,captureIssuedProviderTlsFrame } from './issued-provider-operator-bootstrap.js';
import { createIssuedProviderOperatorControl } from './issued-provider-operator-control.js';
import { createIssuedProviderStartupStop } from './issued-provider-startup-stop.js';
import { createNativeIssuedProviderOperatorPipes } from './issued-provider-native-pipes.js';
import { createBuyerCommandLineChannel } from './buyer-command-line-channel.js';
import { createOwnedIssuedFundingGrantNativeApplication } from './x402-issued-funding-grant-owned-native-application.js';
import { createIssuedProviderNativeFundingRoles } from './issued-provider-native-funding-roles.js';
import { SettlementJournal } from './settlement-journal.js';
import { parseZenonFundingProviderAttestationAuthorityRecord } from './service-credit-zenon-funding-provider-attestation.js';
import { captureIssuedProviderFundingResourceAdmission } from './issued-provider-funding-resource-admission.js';
import { createFixedZenonFundingPolicy } from './service-credit-zenon-fixed-funding-policy.js';
import { openNativeFundingTransitionWitness,NativeFundingTransitionWitness } from './native-funding-transition-witness.js';
import { openZenonFundingObserverSqliteStore,ZenonFundingObserverSqliteStore } from './service-credit-zenon-funding-observer-sqlite-store.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply,NOW=Date.now,DATE=Date,CLOCK=hrtime.bigint,THEN=Promise.prototype.then,FAILED=new Set();
const OBSERVER=ZenonFundingObserverSqliteStore.prototype,OCLOSE=D(OBSERVER,'close').value,LOAD=D(SettlementJournal.prototype,'load').value;
const WCLOSE=D(NativeFundingTransitionWitness.prototype,'close').value,WVIEW=D(NativeFundingTransitionWitness.prototype,'snapshot').value;
let entered=false;
function fail(){throw new TypeError('ISSUED_PROVIDER_NATIVE_OPERATOR_HELD');}
function brand(v,proto,name,method){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==proto||Object.hasOwn(v,name)||D(proto,name)?.value!==method)fail();}

/** Fixed source roles only. Existing journal provisioning, authority records,
 * TLS material and independent recovery pins are explicit operator prerequisites.
 * This entry does not generate credentials, initialize/adopt historical journals,
 * choose a wallet/profile, run a pilot or publish a replacement transaction.
 */
export async function runNativeIssuedProviderOperator(args,readPackageState){
 if(arguments.length!==2||entered||FAILED.size!==0||typeof readPackageState!=='function'||types.isProxy(readPackageState))fail();entered=true;
  const frame={pipes:null,pipesEntered:false,prepared:null,config:null,tls:null,journal:null,roles:null,witness:null,witnessEntered:false,app:null,appEntered:false,
  channel:null,channelEntered:false,commandsEntered:false,observer:null,observerEntered:false,observerName:null,observerKey:null,observerClosed:false,auxEntered:false,auxClosed:false,auxHeld:false,control:null,deadline:null,pendingJournal:null};
  const now=F(()=>A(NOW,DATE,[])),clock=F(()=>A(CLOCK,hrtime,[]));
 function hold(){frame.auxHeld=true;FAILED.add(frame);}
  function startDeadline(){if(frame.deadline===null)frame.deadline=clock()+BigInt(frame.prepared?.channelLimits.closeWaitMs??args.bootstrapMs)*1000000n;}
  const stopping=createIssuedProviderStartupStop(F(()=>{try{startDeadline();}catch{hold();}return frame.pipes===null?Promise.resolve():frame.pipes.close();}));
  const guard=F(()=>{stopping.check();if(readPackageState()!=='READY')fail();stopping.check();});
 function remaining(){const n=frame.deadline===null?0n:frame.deadline-clock();return n>0n?Math.max(1,Number((n+999999n)/1000000n)):1;}
 function startupValue(promise,budget){const deadline=clock()+BigInt(budget)*1000000n;return new Promise((resolve,reject)=>{
  let settled=false;const finish=(ok,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(!ok||clock()>deadline){hold();reject(new TypeError('ISSUED_PROVIDER_JOURNAL_STARTUP_HELD'));}else resolve(value);};
  const timer=setTimeout(()=>finish(false),budget);if(!types.isPromise(promise)||types.isProxy(promise)){finish(false);return;}
   A(THEN,promise,[value=>finish(true,value),()=>finish(false)]);
   // Stop observation never cancels or releases the journal's entered read.
   // Its original promise stays in the retained frame after an early stop.
   A(THEN,stopping.whenRequested,[()=>finish(false),()=>finish(false)]);
 });}
 function closeObservation(promise,budget){return new Promise(resolve=>{
  let settled=false;const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);resolve(ok&&frame.deadline!==null&&clock()<=frame.deadline);};
  const timer=setTimeout(()=>finish(false),budget);
  if(!types.isPromise(promise)||types.isProxy(promise)){finish(false);return;}A(THEN,promise,[value=>finish(value===undefined),()=>finish(false)]);
 });}
  function closeProvider(){try{startDeadline();}catch{hold();}
  try{if(frame.roles!==null&&frame.roles.stop()!==undefined)fail();}catch{hold();}
  if(frame.app===null)fail();return frame.app.close();}
 const closeAuxiliary=F(async()=>{
  if(frame.auxEntered){if(frame.auxHeld||!frame.auxClosed)fail();return;}frame.auxEntered=true;
  try{
   const view=frame.app.snapshot();if(view.phase!=='CLOSED'||view.held||!view.released||view.activeOperations!==0)fail();
   if(frame.observerEntered&&frame.observer===null||frame.witnessEntered&&frame.witness===null)fail();
   if(frame.roles!==null){if(frame.roles.close()!==undefined||frame.roles.snapshot().busy||frame.roles.snapshot().held)fail();}
   if(frame.observer!==null&&!frame.observerClosed){brand(frame.observer,OBSERVER,'close',OCLOSE);frame.observerClosed=true;if(A(OCLOSE,frame.observer,[])!==undefined)fail();}
   if(frame.witness!==null){brand(frame.witness,NativeFundingTransitionWitness.prototype,'close',WCLOSE);if(A(WCLOSE,frame.witness,[])!==undefined)fail();const w=A(WVIEW,frame.witness,[]);if(!w.closed||w.held||w.openHandles!==0)fail();}
   frame.auxClosed=true;
  }catch{hold();fail();}
 });
  let exitCode=4,result=null;const signals=[];
  const onSignal=F(()=>{try{A(THEN,stopping.requestStop(),[()=>{},()=>hold()]);}catch{hold();}});
 try{
   // Subscribe before the first descriptor acquisition. Record entry before
   // subscribing so a partial subscription failure still owns its removal.
   for(const name of ['SIGINT','SIGTERM']){signals.push(name);process.on(name,onSignal);}
   guard();frame.pipesEntered=true;frame.pipes=createNativeIssuedProviderOperatorPipes(args);guard();
   const raw=await frame.pipes.readProfile(guard,args.bootstrapMs);try{guard();frame.prepared=decodeIssuedProviderOperatorBootstrap(new TextDecoder('utf8',{fatal:true,ignoreBOM:true}).decode(raw));}finally{raw.fill(0);}guard();
  const c=frame.config=readIssuedProviderOperatorBootstrap(frame.prepared);
  // Older DATA decoders remain inspectable; native product startup needs explicit execution terms.
  if(c.providerBootstrapVersion!==3)throw new TypeError('ISSUED_PROVIDER_EXECUTION_SETUP_REQUIRED');
  const authority=parseZenonFundingProviderAttestationAuthorityRecord(c.funding.authorityRecord);
  if(canonicalJson(authority.chainProfile)!==canonicalJson(c.funding.terms.requirement.extra.zenonChain)
   ||authority.confirmationPolicy.minimumConfirmations!==c.funding.terms.requirement.extra.minimumMomentumConfirmations)fail();
  // FRESH keeps actual issuance expiry admission before TLS. Restored modes
  // capture configuration without a new clock decision; the owned opener
  // compares the pinned original challenge before constructing the provider.
  // Neither candidate persists an issue, transaction, proof or grant.
  captureIssuedProviderFundingResourceAdmission({applicationMode:c.applicationMode,offer:c.offer,selection:c.funding.selection,resourceUrl:c.funding.resourceUrl,
   deriveFundingTerms:createFixedZenonFundingPolicy({offer:c.offer,selection:c.funding.selection,terms:c.funding.terms}),authorityProfile:authority.authorityProfile,...(c.applicationMode==='FRESH'?{now}:{})});
   const secret=await frame.pipes.readTlsMaterial(guard,args.bootstrapMs);try{guard();frame.tls=captureIssuedProviderTlsFrame(secret);}finally{secret.fill(0);}guard();
  frame.journal=new SettlementJournal({...c.journal,clock:F(()=>new DATE(now())),existingOnly:true});
  frame.pendingJournal=A(LOAD,frame.journal,[]);const loaded=await startupValue(frame.pendingJournal,c.control.operationBudgetMs);frame.pendingJournal=null;guard();if(c.applicationMode==='FRESH'&&loaded.records.length!==0)fail();
  frame.roles=createIssuedProviderNativeFundingRoles({chain:c.chain,requirement:c.funding.terms.requirement,serviceSelection:c.funding.selection,journal:frame.journal,maximumPendingReconciliations:c.funding.maxPendingReconciliations,
   pendingObservationMode:c.providerBootstrapVersion===1?'JOURNAL_ONLY':c.funding.pendingObservationMode,currentGuard:guard});
  // Keep the fixed real facilitator, but guard its original methods around any
  // later lazy package import. A post-entry failure remains original UNKNOWN.
  const target=frame.roles.official.localFacilitator,proto=Object.getPrototypeOf(target),VERIFY=D(proto,'verify').value,SETTLE=D(proto,'settle').value;
  const localFacilitator=F({verify:F(async(...a)=>{guard();const v=await A(VERIFY,target,a);guard();return v;}),settle:F(async(...a)=>{guard();const v=await A(SETTLE,target,a);guard();return v;})});
  const official=F({...frame.roles.official,localFacilitator,validateChallenge:F(challenge=>{guard();frame.roles.official.validateChallenge(challenge);guard();}),
   reconcilePendingSettlement:F(async(...a)=>{guard();const v=await frame.roles.official.reconcilePendingSettlement(...a);guard();return v;})});
  let observation=null;
  if(c.applicationMode==='WITNESSED'){frame.witnessEntered=true;frame.witness=openNativeFundingTransitionWitness({...c.witness,expectation:c.recovery});observation=F({journal:frame.journal,transitionWitness:frame.witness});}
  else if(c.applicationMode==='JOURNAL')observation=F({journal:frame.journal});
  const configuration=bindIssuedProviderOperatorBootstrap(frame.prepared,official,frame.tls.material,now,observation);
  frame.appEntered=true;frame.app=createOwnedIssuedFundingGrantNativeApplication(configuration);frame.tls.release();guard();
  frame.commandsEntered=true;const streams=frame.pipes.adoptCommands(guard);frame.channelEntered=true;frame.channel=createBuyerCommandLineChannel({input:streams.input,output:streams.output,limits:frame.prepared.channelLimits});
  const invoke=F((name,a)=>{guard();const value=frame.app[name](...a);return value;});
  const ports=F({startProvider:F(()=>{guard();return frame.app.start();}),inspectProvider:frame.app.snapshot,closeProvider:F(closeProvider),
   resumeOriginalSettlement:F(()=>invoke('resumeOriginalSettlement',[])),inspectOriginalCommittedServiceGrant:F(()=>invoke('inspectOriginalCommittedServiceGrant',[])),admitOriginalCommittedServiceGrant:F(()=>invoke('admitOriginalCommittedServiceGrant',[])),admitOriginalCommittedServiceGrantResults:F(()=>invoke('admitOriginalCommittedServiceGrantResults',[])),
   reconcileOriginalFunding:F(()=>invoke('reconcileOriginalFunding',[])),recoverOriginalFundingFirstResult:F(()=>invoke('recoverOriginalFundingFirstResult',[])),inspectOriginalFundingHistory:F(()=>invoke('inspectOriginalFundingHistory',[])),
   activateOriginalCommittedFunding:F(async argument=>{guard();
    // Resolve only the same retained original's observer tuple before any file
    // entry. ACK, a syntactically valid filename or an operator-supplied key
    // alone cannot choose another observer. Actual activation remains separate.
    const enter=F(selected=>{
     if(frame.observer===null){if(frame.observerEntered)fail();frame.observerEntered=true;frame.observerName=selected.observerFileName;frame.observerKey=selected.recordKey;
      frame.observer=openZenonFundingObserverSqliteStore({databasePath:join(c.funding.observerRoot,selected.observerFileName),allowedRoot:c.funding.observerRoot,
       expectedRecordKey:selected.recordKey,authorityRecord:c.funding.authorityRecord,busyTimeoutMs:c.serviceStore.busyTimeoutMs,maxStateBytes:c.serviceStore.maxStateBytes});}
     if(frame.observerClosed||frame.observerName!==selected.observerFileName||frame.observerKey!==selected.recordKey)fail();return frame.observer;
    });
    enterIssuedProviderOriginalObserver(argument,F({check:guard,select:F(value=>frame.app.selectOriginalActivationObserver(value)),open:enter}));
    const value=await frame.app.activateOriginalCommittedFunding(frame.observer);guard();return value;}),
   readCommand:frame.channel.readCommand,writeResult:frame.channel.writeResult,closeChannel:frame.channel.close,inspectChannel:frame.channel.inspect,
   closeAuxiliary,inspectAuxiliary:F(()=>F({closed:frame.auxClosed,held:frame.auxHeld,active:frame.roles?.snapshot().busy??false})),clock,
   armTimer:F((ms,fn)=>setTimeout(fn,ms)),cancelTimer:F(token=>{clearTimeout(token);})});
  frame.control=createIssuedProviderOperatorControl({mode:c.applicationMode,limits:frame.prepared.channelLimits,operationBudgetMs:frame.prepared.operationBudgetMs,ports});
   stopping.attachControl(frame.control.close);guard();
  result=await frame.control.run();exitCode=result.exitCode;
 }catch{hold();exitCode=4;}
 finally{
  try{if(frame.tls!==null)frame.tls.release();}catch{hold();}
   try{startDeadline();}catch{hold();}
  try{if(frame.control!==null)await frame.control.close();else if(frame.app!==null){if(!await closeObservation(closeProvider(),remaining()))fail();await closeAuxiliary();}
    else if(frame.appEntered||frame.witnessEntered||frame.observerEntered||frame.channelEntered||frame.commandsEntered||frame.pipesEntered&&frame.pipes===null)fail();
   else if(frame.roles!==null)frame.roles.close();
  }catch{hold();}
  try{if(frame.pipes!==null&&!await closeObservation(frame.pipes.close(),remaining()))fail();}catch{hold();}
   for(const name of signals){try{process.off(name,onSignal);}catch{hold();}}
   // The controller result is historical across the final pipe/signal awaits.
   // Re-read the same returned owners before preserving a clean exit. This
   // cannot repair HELD, repeat a stop or establish atomic/physical release.
   try{if(exitCode===0||exitCode===1){
     if(frame.control===null||frame.app===null||frame.channel===null)fail();
     requireIssuedProviderClosedOwners(frame.app.snapshot(),
       F({closed:frame.auxClosed,held:frame.auxHeld,active:frame.roles?.snapshot().busy??false}),frame.channel.inspect());
   }}catch{hold();}
   if(frame.auxHeld||stopping.inspect().held)exitCode=4;
 }
 return F({providerOperatorResultVersion:1,status:exitCode===0?'CLOSED':exitCode===1?'INPUT_REFUSED':'HELD',exitCode,physicalRelease:'NOT_ESTABLISHED',nativeAcceptance:'NOT_ESTABLISHED'});
}
