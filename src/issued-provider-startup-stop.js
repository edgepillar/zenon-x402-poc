import { types } from 'node:util';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply,NP=Promise,PP=NP.prototype;
const THEN=D(PP,'then'),CTOR=D(PP,'constructor'),SPECIES=D(NP,Symbol.species),HELD=new Set();
function fail(){throw new TypeError('ISSUED_PROVIDER_STARTUP_STOP');}
function same(a,b){return !!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(b).every(k=>Object.hasOwn(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&same(D(PP,'then'),THEN)&&same(D(PP,'constructor'),CTOR)&&same(D(NP,Symbol.species),SPECIES);}
function callable(fn){if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();return fn;}
function safe(v){if(v===null||typeof v!=='object'||types.isProxy(v)||!types.isPromise(v)||Object.getPrototypeOf(v)!==PP||D(v,'then')!==undefined||!invariant())return false;
 const d=D(v,'constructor');return d===undefined||Object.hasOwn(d,'value')&&d.value===NP&&!d.enumerable&&!d.configurable&&!d.writable;}
function cap(){let resolve,reject;const promise=new NP((yes,no)=>{resolve=yes;reject=no;});Object.defineProperty(promise,'constructor',{value:NP});A(THEN.value,promise,[()=>{},()=>{}]);return {promise,resolve,reject};}

/** Signal selection is separate from physical release. The fixed launcher
 * installs its handlers before acquisition. Before handoff only the original
 * bootstrap stop is selected; afterwards only the original control close is.
 * A stop is sticky, cached before callback entry and never grants a restart.
 * This owner supplies no clock, I/O, signal subscription or close deadline.
 */
export function createIssuedProviderStartupStop(stopBootstrap){
 if(arguments.length!==1||!invariant()||HELD.size>=32)fail();callable(stopBootstrap);
 const requested=cap();let control=null,stopping=null,stopped=false,held=false,settlement='NOT_REQUESTED',selected='NONE',pending=null;
 const retained=F(()=>[stopBootstrap,control,stopping,requested,pending]);
 function hold(){held=true;HELD.add(retained);}
 const check=F(function check(){if(arguments.length!==0||stopped||held||!invariant())fail();});
 const attachControl=F(function attachControl(closeControl){
  if(arguments.length!==1)fail();check();if(control!==null)fail();control=callable(closeControl);
 });
 const requestStop=F(function requestStop(){
  if(arguments.length!==0)fail();if(stopping!==null)return stopping.promise;
  stopping=cap();stopped=true;settlement='PENDING';selected=control===null?'BOOTSTRAP':'CONTROL';requested.resolve(undefined);
  function refuse(){settlement='REJECTED';hold();stopping.reject(new TypeError('ISSUED_PROVIDER_STARTUP_STOP_HELD'));}
  try{
   if(!invariant())fail();pending=A(control??stopBootstrap,undefined,[]);if(!safe(pending))fail();
   A(THEN.value,pending,[value=>{pending=null;if(value!==undefined||!invariant()){refuse();return;}settlement='FULFILLED_UNDEFINED';stopping.resolve(undefined);},()=>{pending=null;refuse();}]);
  }catch{refuse();}return stopping.promise;
 });
 return F({check,attachControl,requestStop,whenRequested:requested.promise,inspect:F(function inspect(){
  if(arguments.length!==0)fail();return F({stopped,held,controlAttached:control!==null,selected,settlement,physicalRelease:'NOT_ESTABLISHED',authority:'NONE'});
 })});
}
