import { captureSdk105OriginalFundingSpendingConfiguration, bindSdk105OriginalFundingSpending,
  bindSdk105SingleOriginalFundingSpending } from './sdk105-spending-bounded-client.js';
import { types as utilTypes } from 'node:util';
import { captureOriginalFundingServiceHandoffRequest } from './dynamic-plasma-original-funding-service-handoff-request.js';
import { captureFundingPostCheckpointRoute } from '../x402-funding-post-checkpoint-route.js';

const HANDOFF=captureOriginalFundingServiceHandoffRequest,ROUTE=captureFundingPostCheckpointRoute,F=Object.freeze;
const APPLY=Reflect.apply,DESC=Object.getOwnPropertyDescriptor,PROTO=Object.getPrototypeOf,KEYS=Reflect.ownKeys;
const OWN=Object.hasOwn,PROXY=utilTypes.isProxy,IS_PROMISE=utilTypes.isPromise;
const NativePromise=Promise,PROMISE=NativePromise.prototype,THEN=PROMISE.then;
const THEN_DESC=DESC(PROMISE,'then'),CTOR=DESC(PROMISE,'constructor'),SPECIES=DESC(NativePromise,Symbol.species);

/** Capture a closed existing-key selection without invoking any key method.
 * The native entry hardwires its actual client and wallet constructors. */
export function captureSdk105FundingServiceConfiguration(configuration) {
  if(arguments.length!==1||!invariant())fail('configuration_rejected');
  return captureFundingConfiguration(configuration,false);
}
/** Same existing-key ownership; explicit non-DP DATA contains no work configuration. */
export function captureSdk105NonDpFundingServiceConfiguration(configuration) {
  if(arguments.length!==1||!invariant())fail('configuration_rejected');
  return captureFundingConfiguration(configuration,true);
}
function captureFundingConfiguration(configuration,nonDp) {
  const c=record(configuration,['storeOptions','fundingOptions','serviceOptions']);
  const store=record(c.storeOptions,['databasePath','allowedRoot','resourceUrl','custodyPolicy']);
  ROUTE(store.resourceUrl);
  const f=record(c.fundingOptions,nonDp
    ?['readSessionOptions','expectedPublicKey','keyPair','expectedAddress','deadlineMs','fundingTransportOptions']
    :['readSessionOptions','materialOptions','materialWaitMs','keyPair','expectedAddress','deadlineMs','fundingTransportOptions']);
  let material=null;
  if(!nonDp){material=record(f.materialOptions,['publicKey','startNonce','limits']);
    material.limits=F(record(material.limits,['maxAttempts','maxDifficulty']));}
  const fundingOptions={readSessionOptions:f.readSessionOptions,deadlineMs:f.deadlineMs,fundingTransportOptions:f.fundingTransportOptions};
  if(nonDp)fundingOptions.expectedPublicKey=f.expectedPublicKey;
  else {fundingOptions.materialOptions=F(material);fundingOptions.materialWaitMs=f.materialWaitMs;}
  const service=record(c.serviceOptions,['official','transportOptions','deadlineMs']);
  return F({storeOptions:F(store),serviceOptions:F(service),
    walletOptions:F({keyPair:f.keyPair,expectedAddress:f.expectedAddress,expectedPublicKey:nonDp?f.expectedPublicKey:material.publicKey}),
    fundingOptions:F(fundingOptions)});
}

/**
 * Join the SDK105 existing-key owner to the ACTUAL funding/service client's
 * public lifecycle. The native entry supplies that real client; builtin tests
 * use declared child capabilities, not native SDK/SQL/HTTPS substitutes.
 *
 * Retain the preparation's original packet. Validate independent original
 * bytes/pins/challenge/grant BEFORE consuming handoff or requesting key close.
 * Match the packet's hash/signature/public bytes to the wallet's retained
 * signed DATA. Close the key and recheck its current receipt BEFORE allowing
 * the actual child to acquire/restore its service client. The child retains
 * the genuine funding-store/native close, same-file reopen and grant checks.
 *
 * Explicit outer close requests BOTH stops even when one is unknown. No
 * timeout, retry, key derivation, resigning, replacement or funding replay.
 * An undefined clear is not private-memory erasure or economic settlement.
 */
export function createSdk105FundingServiceLifecycle(configuration) {
  if(arguments.length!==1||!invariant())fail('configuration_rejected');
  const c=record(configuration,['client','walletOwner','fundingResourceUrl']),client=c.client,wallet=c.walletOwner;
  const url=c.fundingResourceUrl;ROUTE(url);
  const PREPARE=method(client,'prepareOriginalFunding'),COMMIT=method(client,'commitOriginalFunding');
  const SUBMIT=method(client,'submitOriginalFunding'),HANDOFF_CHILD=method(client,'handoffToService');
  const SERVICE=method(client,'submitOriginal'),VIEW=method(client,'inspect'),CLOSE=method(client,'close');
  const WALLET_CLOSE=method(wallet,'close'),WALLET_VIEW=method(wallet,'inspect');
  let retained=null,transaction=null,bound=false,phase='FUNDING',handoffAttempts=0;
  let active=null,closing=null,held=false,lifecycle='OPEN',closeTerminal=false;
  let walletStop=null,walletLeg='NOT_REQUESTED',clientLeg='NOT_REQUESTED',historicalClose='NOT_REQUESTED';
  function hold(){held=true;lifecycle='HELD';}
  function walletReceipt(requireSigned){
    try{
      const v=APPLY(WALLET_VIEW,wallet,[]);
      if(data(v,'sdk105WalletOwnerVersion')!==1||data(v,'held')!==false
          ||data(v,'lifecycle')!=='CLOSED'||data(v,'clearCalls')!==1
          ||data(v,'clearOutcome')!=='CLEAR_RETURNED'||data(v,'closeRequested')!==true
          ||data(v,'activeOperation')!==null)return false;
      return !requireSigned||signedMatches(v);
    }catch{return false;}
  }
  function signedMatches(v){
    if(transaction===null||data(v,'signingOutcome')!=='RETURNED_DATA')return false;
    const signed=data(data(v,'wallet'),'signedOriginal');
    return data(signed,'hash')===transaction.hash&&data(signed,'signature')===transaction.signature
      &&data(signed,'publicKey')===transaction.publicKey;
  }
  function currentClientClosed(){
    try{const v=APPLY(VIEW,client,[]);return data(v,'lifecycle')==='CLOSED'&&data(v,'held')===false;}catch{return false;}
  }
  function finishClose(){
    if(closing===null||closeTerminal)return;
    if(held||walletLeg==='UNKNOWN'||clientLeg==='UNKNOWN'){
      closeTerminal=true;hold();historicalClose='REJECTED';closing.reject(error('close_unknown'));return;
    }
    if(active!==null||walletLeg!=='CLOSED'||clientLeg!=='CLOSED')return;
    if(!walletReceipt(false)||!currentClientClosed()){hold();finishClose();return;}
    closeTerminal=true;lifecycle='CLOSED';historicalClose='FULFILLED_UNDEFINED';closing.resolve(undefined);
  }
  function stopWallet(){
    if(walletStop!==null)return walletStop.promise;
    walletStop=capability();walletLeg='PENDING';
    try{observe(APPLY(WALLET_CLOSE,wallet,[]),value=>{
      if(value!==undefined||!walletReceipt(false)){walletLeg='UNKNOWN';hold();walletStop.reject(error('key_close_unknown'));}
      else{walletLeg='CLOSED';walletStop.resolve(undefined);}
      finishClose();
    },()=>{walletLeg='UNKNOWN';hold();walletStop.reject(error('key_close_unknown'));finishClose();});}
    catch{walletLeg='UNKNOWN';hold();walletStop.reject(error('key_close_unknown'));finishClose();}
    return walletStop.promise;
  }
  function capturePacket(value){
    if(data(value,'phase')!=='AWAITING_INDEPENDENT_PINS')fail('operation_unknown');
    const packet=data(value,'packet'),header=data(data(packet,'pair'),'challenge');
    const serialized=data(packet,'serializedCheckpoint'),required=data(header,'paymentRequiredHeader');
    const tx=data(data(data(packet,'paymentPayload'),'payload'),'transaction');
    const hash=data(tx,'hash'),signature=data(tx,'signature'),publicKey=data(tx,'publicKey');
    if(typeof serialized!=='string'||serialized.length>32768||typeof required!=='string'||required.length>5464
        ||typeof hash!=='string'||!/^[0-9a-f]{64}$/.test(hash)||typeof signature!=='string'||signature.length!==88
        ||typeof publicKey!=='string'||publicKey.length!==44)fail('operation_unknown');
    retained=F({resourceUrl:url,serializedCheckpoint:serialized,paymentRequiredHeader:required});
    transaction=F({hash,signature,publicKey});
  }
  function start(work,count,input,voidResult=false){
    if(count!==1||active!==null||closing!==null||held||!invariant())return rejected('operation_unavailable');
    const out=capability();active=out;let operation;
    try{operation=work(input);}catch{active=null;out.reject(error('operation_refused_or_unknown'));finishClose();return out.promise;}
    try{observe(operation,value=>{
      active=null;
      if(closing!==null||held)out.reject(error('operation_unavailable'));else{try{
        // The actual service owner returns Promise<void>: callback completion
        // only, never a manufactured delivery/settlement receipt. Funding and
        // handoff operations still require their original frozen DATA record.
        if(voidResult){if(value!==undefined)fail('observation_rejected');}else plainResult(value);
        out.resolve(value);
      }catch{hold();out.reject(error('operation_unknown'));}}
      finishClose();
    },()=>{
      active=null;
      // A returned service receipt can reject after dispatch or response loss.
      // Without proof of a pre-dispatch refusal, no further service call may
      // enter this owner. Match synchronous service failure and malformed void
      // completion; closing/late child cleanup cannot clear this uncertainty.
      // Synchronous admission checks before SERVICE remain unconsumed.
      if(voidResult)hold();
      out.reject(error('operation_refused_or_unknown'));finishClose();
    });}
    catch{active=null;hold();out.reject(error('operation_unknown'));finishClose();}
    return out.promise;
  }
  function fundingWork(fn,kind,input){
    if(phase!=='FUNDING'||kind==='submit'&&transaction===null)fail('operation_unavailable');
    const out=capability();
    try{observe(APPLY(fn,client,[input]),value=>{
      try{plainResult(value);if(kind==='prepare')capturePacket(value);
        if(kind==='submit'){
          // The same original must survive the funding receipt boundary. A
          // late or unrelated BOUND cannot promote this owner's observation.
          if(closing!==null||held||!invariant()||transaction===null
              ||data(value,'transactionHash')!==transaction.hash)fail('observation_rejected');
          bound=data(value,'phase')==='FUNDING_INTAKE_BOUND'&&data(value,'fundingIntakeStatus')==='BOUND';
        }
        out.resolve(value);
      }catch{hold();out.reject(error('operation_unknown'));}
    },()=>out.reject(error('operation_refused_or_unknown')));}
    catch{hold();out.reject(error('operation_unknown'));}
    return out.promise;
  }
  function handoff(input){
    if(phase!=='FUNDING'||!bound||retained===null||handoffAttempts!==0)fail('handoff_unavailable');
    // Detached external expectations are never learned from a DB or receipt.
    // Validation refusal leaves handoff/key-close unconsumed.
    const selected=HANDOFF(input,retained);
    const view=APPLY(WALLET_VIEW,wallet,[]);
    if(!signedMatches(view)||data(view,'held')!==false
        ||data(data(data(selected,'originalPayment'),'expectedPins'),'binding').paymentHash!==transaction.hash)
      fail('handoff_unavailable');
    const request=F({originalPayment:selected.originalPayment,selectedGrantId:selected.selectedGrantId,
      paymentRequiredHeader:selected.paymentRequiredHeader});
    handoffAttempts=1;phase='HANDING_OFF';const out=capability();
    observe(stopWallet(),()=>{
      if(closing!==null||held||!walletReceipt(true)){out.reject(error('handoff_unavailable'));return;}
      try{observe(APPLY(HANDOFF_CHILD,client,[request]),value=>{
        try{plainResult(value);
          if(closing!==null||held||!walletReceipt(true)||data(value,'phase')!=='SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED')fail('handoff_unknown');
          phase='SERVICE';out.resolve(value);
        }catch{hold();out.reject(error('handoff_unknown'));}
      },()=>{hold();out.reject(error('handoff_unknown'));});}
      catch{hold();out.reject(error('handoff_unknown'));}
    },()=>{hold();out.reject(error('handoff_unknown'));});
    return out.promise;
  }
  const close=F(function close(){
    if(arguments.length!==0)return rejected('input_rejected');
    if(closing!==null)return closing.promise;
    closing=capability();lifecycle='CLOSING';historicalClose='PENDING';
    stopWallet();
    clientLeg='PENDING';
    try{observe(APPLY(CLOSE,client,[]),value=>{
      clientLeg=value===undefined&&currentClientClosed()?'CLOSED':'UNKNOWN';finishClose();
    },()=>{clientLeg='UNKNOWN';finishClose();});}catch{clientLeg='UNKNOWN';}
    finishClose();return closing.promise;
  });
  const inspect=F(function inspect(){
    if(arguments.length!==0||!invariant())fail('input_rejected');
    if(lifecycle==='CLOSED'&&(!walletReceipt(false)||!currentClientClosed()))hold();
    return F({sdk105FundingServiceLifecycleVersion:1,phase,lifecycle,held,
      publicOperationActive:active!==null,preparedOriginalRetained:retained!==null,fundingBound:bound,
      handoffAttempts,closeRequested:closing!==null,walletClose:walletLeg,clientClose:clientLeg,historicalClose,
      wallet:APPLY(WALLET_VIEW,wallet,[]),client:APPLY(VIEW,client,[]),
      nativeResourceCleanup:'NOT_QUALIFIED',grantActivation:'NOT_ESTABLISHED',serviceDelivery:'NOT_ESTABLISHED',authority:'NONE'});
  });
  return F({prepareOriginalFunding:F(function prepareOriginalFunding(input){return start(x=>fundingWork(PREPARE,'prepare',x),arguments.length,input);}),
    commitOriginalFunding:F(function commitOriginalFunding(input){return start(x=>fundingWork(COMMIT,'commit',x),arguments.length,input);}),
    submitOriginalFunding:F(function submitOriginalFunding(input){return start(x=>fundingWork(SUBMIT,'submit',x),arguments.length,input);}),
    handoffToService:F(function handoffToService(input){return start(handoff,arguments.length,input);}),
    submitOriginal:F(function submitOriginal(input){return start(x=>{
      if(phase!=='SERVICE'||!walletReceipt(true))fail('service_unavailable');try{return APPLY(SERVICE,client,[x]);}catch{hold();fail('operation_unknown');}
    },arguments.length,input,true);}),inspect,close});
}
function plainResult(value){
  if(value===null||typeof value!=='object'||PROXY(value)||PROTO(value)!==Object.prototype||!Object.isFrozen(value))fail('observation_rejected');
  const d=DESC(value,'then');if(d!==undefined&&(!OWN(d,'value')||d.value!==undefined))fail('observation_rejected');
}
function method(value,name){
  if(value===null||typeof value!=='object'||PROXY(value)||!Object.isFrozen(value))fail('configuration_rejected');
  const d=DESC(value,name);if(!d||!OWN(d,'value')||typeof d.value!=='function'||PROXY(d.value))fail('configuration_rejected');return d.value;
}
function record(value,fields){
  if(value===null||typeof value!=='object'||PROXY(value)||PROTO(value)!==Object.prototype||KEYS(value).length!==fields.length)fail('configuration_rejected');
  const out={};for(const name of fields){const d=DESC(value,name);if(!d||!OWN(d,'value')||!d.enumerable)fail('configuration_rejected');
    Object.defineProperty(out,name,{value:d.value,enumerable:true,writable:true,configurable:true});}return out;
}
function data(value,name){
  if(value===null||typeof value!=='object'||PROXY(value)||!Object.isFrozen(value)
      ||(PROTO(value)!==Object.prototype&&PROTO(value)!==null))fail('observation_rejected');
  const d=DESC(value,name);if(!d||!OWN(d,'value')||!d.enumerable)fail('observation_rejected');return d.value;
}
function safe(value){if(!invariant()||!IS_PROMISE(value)||PROXY(value)||PROTO(value)!==PROMISE)return false;
  const d=DESC(value,'constructor');return d===undefined||OWN(d,'value')&&d.value===NativePromise;}
function observe(value,yes,no){
  if(!safe(value))fail('observation_rejected');
  const bridge=APPLY(THEN,value,[yes,no]);APPLY(THEN,bridge,[discard,discard]);
}
function capability(){let resolve,reject;const promise=new NativePromise((a,b)=>{resolve=a;reject=b;});
  Object.defineProperty(promise,'constructor',{value:NativePromise});APPLY(THEN,promise,[discard,discard]);return{promise,resolve,reject};}
function invariant(){return DESC(Object.prototype,'then')===undefined&&same(DESC(PROMISE,'then'),THEN_DESC)
  &&same(DESC(PROMISE,'constructor'),CTOR)&&same(DESC(NativePromise,Symbol.species),SPECIES);}
function same(a,b){return!!a&&!!b&&KEYS(a).length===KEYS(b).length&&KEYS(b).every(k=>OWN(a,k)&&a[k]===b[k]);}
function rejected(kind){const out=capability();out.reject(error(kind));return out.promise;}
function error(kind){const code='zenon_sdk105_funding_service_'+kind,e=new TypeError(code);
  Object.defineProperty(e,'code',{value:code,enumerable:true});Object.defineProperty(e,'stack',{value:'TypeError: '+code});return F(e);}
function fail(kind){throw error(kind);}function discard(){}

/** Opt-in G1 spending gate over this actual lifecycle. Construction reads the
 * explicitly supplied journal; callers retain child cleanup responsibility on
 * construction refusal. No native opening or default-buyer cutover is added. */
export function createSpendingBoundedSdk105FundingServiceLifecycle(configuration) {
  if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
  return spendingLifecycle(configuration, false);
}
/** The API-credit application hardwires this lane; configuration/command DATA
 * cannot choose legacy carry-forward admission for an unresolved original. */
export function createSingleOriginalSpendingBoundedSdk105FundingServiceLifecycle(configuration) {
  if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
  return spendingLifecycle(configuration, true);
}
function spendingLifecycle(configuration, singleOriginal) {
  const c = record(configuration, ['client', 'walletOwner', 'fundingResourceUrl', 'spending']);
  const spending = captureSdk105OriginalFundingSpendingConfiguration(c.spending);
  const lifecycle = createSdk105FundingServiceLifecycle({ client: c.client, walletOwner: c.walletOwner,
    fundingResourceUrl: c.fundingResourceUrl });
  const bind = singleOriginal ? bindSdk105SingleOriginalFundingSpending : bindSdk105OriginalFundingSpending;
  return bind(lifecycle, c.fundingResourceUrl, spending);
}
