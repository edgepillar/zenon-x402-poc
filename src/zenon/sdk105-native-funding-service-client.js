import { createSdk105PreparedHashWalletOwner } from './sdk105-prepared-hash-wallet-owner.js';
import { captureSdk105FundingServiceConfiguration, createSdk105FundingServiceLifecycle }
  from './sdk105-funding-service-lifecycle.js';
import { openZenonDynamicPlasmaNativeFundingServiceClient }
  from './dynamic-plasma-native-funding-service-client.js';
import { types as utilTypes } from 'node:util';

const CAPTURE=captureSdk105FundingServiceConfiguration,WALLET=createSdk105PreparedHashWalletOwner;
const OPEN=openZenonDynamicPlasmaNativeFundingServiceClient,JOIN=createSdk105FundingServiceLifecycle;
const NativePromise=Promise,THEN=NativePromise.prototype.then,APPLY=Reflect.apply,F=Object.freeze;
const PROMISE=NativePromise.prototype,PROXY=utilTypes.isProxy,IS_PROMISE=utilTypes.isPromise;
const DESC=Object.getOwnPropertyDescriptor,PROTO=Object.getPrototypeOf,OWN=Object.hasOwn;
// Preserve an unpublished acquired client/key and actual stop receipts if a
// later facade construction fails. Never reset this hold from late completion.
let failedAcquisition=null;

/**
 * SOURCE ONLY. The existing actual native funding/service client now receives
 * the SDK105 synchronous wallet owner, and service handoff must first join its
 * clear receipt and the same retained signed original. No supplied native,
 * wallet, store, SDK, transport or close factory; no default buyer cutover.
 * KeyPair must already exist and be exclusively transferred on success.
 *
 * The existing native client owns its actual read/POST/SQLite/service lifecycle.
 * Before it returns, its construction refusal retains that original client's
 * close/quarantine rules; the caller retains the existing-key cleanup duty.
 * If it returned but the outer join fails, retain both owners privately and
 * request their stops independently, with no retry or clean-upgrade assertion.
 * This wider graph has not been evaluated by the builtin component controls.
 */
export async function openSdk105NativeFundingServiceClient(configuration) {
  if(arguments.length!==1||failedAcquisition!==null)fail();
  const selected=CAPTURE(configuration),wallet=WALLET(selected.walletOptions);
  let client=null;
  try{
    client=await OPEN({storeOptions:selected.storeOptions,
      fundingOptions:{...selected.fundingOptions,wallet},serviceOptions:selected.serviceOptions});
    return JOIN({client,walletOwner:wallet,fundingResourceUrl:selected.storeOptions.resourceUrl});
  }catch{
    if(client!==null){
      const held={client,wallet,walletStop:null,clientStop:null,walletStopEntered:false,clientStopEntered:false};
      failedAcquisition=held;
      // Both actual stops are attempted even if the first throws.
      try{held.walletStopEntered=true;held.walletStop=wallet.close();consume(held.walletStop);}catch{}
      try{held.clientStopEntered=true;held.clientStop=client.close();consume(held.clientStop);}catch{}
    }
    fail();
  }
}
function consume(value){
  if(PROXY(value)||!IS_PROMISE(value)||PROTO(value)!==PROMISE)return;
  const d=DESC(value,'constructor');if(d!==undefined&&(!OWN(d,'value')||d.value!==NativePromise))return;
  try{APPLY(THEN,value,[discard,discard]);}catch{}
}
function discard(){}
function fail(){const code='zenon_sdk105_native_funding_service_open_refused',e=new TypeError(code);
  Object.defineProperty(e,'code',{value:code,enumerable:true});Object.defineProperty(e,'stack',{value:'TypeError: '+code});throw F(e);}
