import { types as utilTypes } from 'node:util';

const F=Object.freeze,APPLY=Reflect.apply,DESC=Object.getOwnPropertyDescriptor,PROTO=Object.getPrototypeOf;
const OWN=Object.hasOwn,KEYS=Reflect.ownKeys,PROXY=utilTypes.isProxy,IS_PROMISE=utilTypes.isPromise;
const NativePromise=Promise,PROMISE=NativePromise.prototype,THEN=PROMISE.then;
const THEN_DESC=DESC(PROMISE,'then'),CTOR=DESC(PROMISE,'constructor'),SPECIES=DESC(NativePromise,Symbol.species);

/**
 * Own an actual funding owner and SDK105 wallet owner as one close admission.
 * The native caller hardwires both real constructors. Component tests may
 * provide declared child capabilities; that is not SDK/SQLite qualification.
 * Operation Promises are returned unchanged. Close blocks new operations,
 * requests BOTH stops independently, and requires both undefined completions.
 * No timeout, retry, replacement or unknown-outcome upgrade is provided here.
 */
export function createSdk105OriginalFundingOwner(configuration) {
  if(arguments.length!==1||!invariant())fail('configuration_rejected');
  const c=record(configuration,['funding','walletOwner']),funding=c.funding,wallet=c.walletOwner;
  const PREPARE=method(funding,'prepareOriginalFunding'),COMMIT=method(funding,'commitOriginalFunding');
  const SUBMIT=method(funding,'submitOriginalFunding'),FUNDING_VIEW=method(funding,'inspectOriginalFunding');
  const FUNDING_CLOSE=method(funding,'close'),WALLET_CLOSE=method(wallet,'close'),WALLET_VIEW=method(wallet,'inspect');
  let closing=null,lifecycle='OPEN',held=false,terminal=false;
  const legs={funding:'NOT_REQUESTED',wallet:'NOT_REQUESTED'};
  function finish(){
    if(closing===null||terminal)return;
    if(held||legs.funding==='UNKNOWN'||legs.wallet==='UNKNOWN'){
      terminal=true;held=true;lifecycle='HELD';closing.reject(error('close_unknown'));return;
    }
    if(legs.funding==='CLOSED'&&legs.wallet==='CLOSED'){
      terminal=true;lifecycle='CLOSED';closing.resolve(undefined);
    }
  }
  function stop(name,receiver,fn){
    legs[name]='PENDING';
    try{
      const promise=APPLY(fn,receiver,[]);
      if(!safe(promise))throw error('close_unknown');
      APPLY(THEN,promise,[value=>{legs[name]=value===undefined?'CLOSED':'UNKNOWN';finish();},()=>{legs[name]='UNKNOWN';finish();}]);
    }catch{legs[name]='UNKNOWN';}
  }
  const close=F(function close(){
    if(arguments.length!==0)return rejected('input_rejected');
    if(closing!==null)return closing.promise;
    closing=capability();lifecycle='CLOSING';
    // Block a not-yet-entered signer, but join a current SDK signature copy.
    // A synchronous failure in one stop cannot suppress the other stop.
    stop('wallet',wallet,WALLET_CLOSE);stop('funding',funding,FUNDING_CLOSE);finish();return closing.promise;
  });
  function launch(fn,count,input){
    if(count!==1||closing!==null||held||!invariant())return rejected('operation_unavailable');
    try{
      const promise=APPLY(fn,funding,[input]);
      if(!safe(promise)){held=true;lifecycle='HELD';return rejected('operation_unknown');}
      return promise;
    }catch{held=true;lifecycle='HELD';return rejected('operation_unknown');}
  }
  const inspect=F(function inspect(){
    if(arguments.length!==0||!invariant())fail('inspection_rejected');
    try{return F({sdk105OriginalFundingOwnerVersion:1,lifecycle,held,closeRequested:closing!==null,
      closeLegs:F({...legs}),funding:APPLY(FUNDING_VIEW,funding,[]),wallet:APPLY(WALLET_VIEW,wallet,[]),authority:'NONE'});}
    catch{fail('inspection_rejected');}
  });
  return F({prepareOriginalFunding:F(function prepareOriginalFunding(input){return launch(PREPARE,arguments.length,input);}),
    commitOriginalFunding:F(function commitOriginalFunding(input){return launch(COMMIT,arguments.length,input);}),
    submitOriginalFunding:F(function submitOriginalFunding(input){return launch(SUBMIT,arguments.length,input);}),
    inspectOriginalFunding:inspect,close});
}
function method(value,name){
  if(value===null||typeof value!=='object'||PROXY(value)||!Object.isFrozen(value))fail('configuration_rejected');
  const d=DESC(value,name);if(!d||!OWN(d,'value')||typeof d.value!=='function'||PROXY(d.value))fail('configuration_rejected');return d.value;
}
function record(value,fields){
  if(value===null||typeof value!=='object'||PROXY(value)||PROTO(value)!==Object.prototype||KEYS(value).length!==fields.length)fail('configuration_rejected');
  const out=Object.create(null);for(const name of fields){const d=DESC(value,name);if(!d||!OWN(d,'value')||!d.enumerable)fail('configuration_rejected');out[name]=d.value;}return out;
}
function safe(value){if(!invariant()||!IS_PROMISE(value)||PROXY(value)||PROTO(value)!==PROMISE)return false;const d=DESC(value,'constructor');return d===undefined||OWN(d,'value')&&d.value===NativePromise;}
function invariant(){return DESC(Object.prototype,'then')===undefined&&same(DESC(PROMISE,'then'),THEN_DESC)&&same(DESC(PROMISE,'constructor'),CTOR)&&same(DESC(NativePromise,Symbol.species),SPECIES);}
function same(a,b){return !!a&&!!b&&KEYS(a).length===KEYS(b).length&&KEYS(b).every(k=>OWN(a,k)&&a[k]===b[k]);}
function capability(){let resolve,reject;const promise=new NativePromise((a,b)=>{resolve=a;reject=b;});Object.defineProperty(promise,'constructor',{value:NativePromise});return{promise,resolve,reject};}
function rejected(kind){const out=capability();out.reject(error(kind));return out.promise;}
function error(kind){const code='zenon_sdk105_original_funding_owner_'+kind,e=new TypeError(code);Object.defineProperty(e,'code',{value:code,enumerable:true});Object.defineProperty(e,'stack',{value:'TypeError: '+code});return F(e);}
function fail(kind){throw error(kind);}
