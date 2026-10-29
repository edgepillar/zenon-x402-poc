import { types } from 'node:util';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn,K=Reflect.ownKeys,A=Reflect.apply,NP=Promise,PP=NP.prototype;
const THEN=D(PP,'then'),CTOR=D(PP,'constructor'),SPECIES=D(NP,Symbol.species),HELD=new Set();
const ARITY=F({admitCommittedServiceGrant:1,resumeOriginalSettlement:0,activateOriginalCommittedFunding:1,admitOriginalCommittedServiceGrant:0,
 reconcileOriginalFunding:0,recoverOriginalFundingFirstResult:0,inspectOriginalFundingHistory:0});
const ASYNC=new Set(['resumeOriginalSettlement','activateOriginalCommittedFunding','reconcileOriginalFunding','recoverOriginalFundingFirstResult']);
function fail(){throw new TypeError('ISSUED_PROVIDER_STORE_OWNER');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||K(v).length!==names.length)fail();
 const out={};for(const k of names){const d=D(v,k);if(!d?.enumerable||!O(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function own(v,k){if(v===null||typeof v!=='object'||types.isProxy(v)||!Object.isFrozen(v))fail();const d=D(v,k);if(!d?.enumerable||!O(d,'value'))fail();return d.value;}
function same(a,b){return !!a&&!!b&&K(a).length===K(b).length&&K(b).every(k=>O(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&D(Object.prototype,'toJSON')===undefined&&same(D(PP,'then'),THEN)&&same(D(PP,'constructor'),CTOR)&&same(D(NP,Symbol.species),SPECIES);}
function safe(v){if(!invariant()||!types.isPromise(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==PP||D(v,'then')!==undefined)return false;const d=D(v,'constructor');return d===undefined||O(d,'value')&&d.value===NP&&!d.enumerable&&!d.writable&&!d.configurable;}
function discard(v){try{if(safe(v)){const p=A(THEN.value,v,[()=>{},()=>{}]);A(THEN.value,p,[()=>{},()=>{}]);}}catch{}}
function capability(){let resolve,reject;const promise=new NP((yes,no)=>{resolve=yes;reject=no;});Object.defineProperty(promise,'constructor',{value:NP});A(THEN.value,promise,[()=>{},()=>{}]);return {promise,resolve,reject};}
function rejected(){const c=capability();c.reject(new TypeError('ISSUED_PROVIDER_STORE_OWNER'));return c.promise;}
function result(v){if(v===null||typeof v!=='object'||types.isProxy(v)||!Object.isFrozen(v)||Object.getPrototypeOf(v)!==Object.prototype)fail();
 for(const k of K(v)){const d=D(v,k);if(typeof k!=='string'||['then','toJSON','__proto__','constructor','prototype'].includes(k)||!d?.enumerable||!O(d,'value'))fail();}return v;}
function selectedMethods(v){if(!Array.isArray(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==Array.prototype||!Object.isFrozen(v))fail();
 const n=D(v,'length')?.value;if(!Number.isSafeInteger(n)||n<1||n>7||K(v).length!==n+1)fail();const names=[];
 for(let i=0;i<n;i++){const d=D(v,String(i));if(!d?.enumerable||!O(d,'value')||typeof d.value!=='string'||!O(ARITY,d.value)||names.includes(d.value))fail();names.push(d.value);}return F(names);}

/** Own only resources opened through these fixed ports. A provider close receipt
 * is a barrier before SQL close, not evidence of cross-process fencing or
 * physical release. Native binding supplies the real stores/factory/methods. */
export function createIssuedProviderStoreOwner(options){
 if(arguments.length!==1||!invariant()||HELD.size>=32)fail();
 const c=fields(options,['methods','port']),names=selectedMethods(c.methods),p=fields(c.port,['claim','openServiceStore','openIntakeStore','openProvider','closeIntakeStore','closeServiceStore','release']);
 for(const fn of Object.values(p))if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();if(new Set(Object.values(p)).size!==7)fail();
 let phase='NEW',closed=false,held=false,opening=false,started=false,active=0,claimed=false,released=false;
 let service=null,intake=null,root=null,startTicket=null,closing=null,rootClosing=null;
 let claimCalls=0,serviceOpenCalls=0,intakeOpenCalls=0,providerOpenCalls=0,providerStartCalls=0,providerCloseCalls=0,intakeCloseCalls=0,serviceCloseCalls=0,releaseCalls=0,operationCalls=0;
 const opaque=[],pending=new Set(),retained=F(()=>[p,service,intake,root,startTicket,closing,rootClosing,opaque,pending]);
 function hold(value){held=true;phase='HELD';HELD.add(retained);if(value!==undefined){opaque.push(value);discard(value);}}
 function live(){if(closed||held||!invariant())fail();}
 function sync(fn,args){let v;try{v=A(fn,undefined,args);}catch{hold();fail();}if(types.isPromise(v)){hold(v);fail();}return v;}
 function captureRoot(v){const out=fields(v,['start','close','snapshot',...names]);if(!Object.isFrozen(v))fail();
  for(const fn of Object.values(out))if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();if(new Set(Object.values(out)).size!==names.length+3)fail();return F(out);}
 function view(){const v=sync(root.snapshot,[]);return result(v);}
 function cleanRoot(){
  const v=view();if(own(v,'phase')!=='CLOSED'||own(v,'uncertain')!==false||own(v,'admissionRevoked')!==true||own(v,'activeOperations')!==0||own(v,'fundingBusy')!==false||own(v,'serviceOpening')!==false
   ||!['fundingCloseDone','serviceCloseDone','queryCloseDone'].every(k=>own(v,k)===true))fail();
  const i=own(v,'ingress'),f=own(v,'funding');if(own(i,'phase')!=='CLOSED'||own(i,'closeClean')!==1||own(i,'closeUncertain')!==0
   ||!['trackedSockets','trackedRequests','trackedHandlers','ownedTimers'].every(k=>own(i,k)===0)||own(f,'closed')!==true||own(f,'active')!==false||own(f,'held')!==false)fail();
 }
 function release(){if(released)return;releaseCalls++;if(sync(p.release,[])!==undefined)fail();released=true;claimed=false;}
 function requestRootClose(){
  if(rootClosing!==null)return rootClosing.promise;rootClosing=capability();providerCloseCalls++;
  try{const v=A(root.close,undefined,[]);if(!safe(v)||v===rootClosing.promise||v===closing?.promise){hold(v);fail();}
   A(THEN.value,v,[value=>{try{if(value!==undefined)fail();cleanRoot();rootClosing.resolve(undefined);}catch{hold();rootClosing.reject(new TypeError('ISSUED_PROVIDER_CLOSE_UNKNOWN'));}},()=>{hold();rootClosing.reject(new TypeError('ISSUED_PROVIDER_CLOSE_UNKNOWN'));}]);
  }catch{hold();rootClosing.reject(new TypeError('ISSUED_PROVIDER_CLOSE_UNKNOWN'));}return rootClosing.promise;
 }
 function refuse(){phase='REFUSED';closed=true;release();startTicket.reject(new TypeError('ISSUED_PROVIDER_CLAIM_REFUSED'));}
 function observe(v,capture,yes,no){
  if(!safe(v)||v===startTicket?.promise||v===closing?.promise||pending.has(v)){hold(v);fail();}pending.add(v);
  A(THEN.value,v,[value=>{pending.delete(v);try{yes(capture(value));}catch{hold(value);no();}},()=>{pending.delete(v);hold();no();}]);
 }
 function startupFailed(){opening=false;hold();startTicket.reject(new TypeError('ISSUED_PROVIDER_START_UNKNOWN'));if(root!==null)requestRootClose();}
 const start=F(function start(){
  if(arguments.length!==0||closed||held||!invariant())return rejected();if(startTicket!==null)return startTicket.promise;
  startTicket=capability();opening=true;phase='OPENING';
  try{claimCalls++;const claim=sync(p.claim,[]);live();if(claim==='REFUSED'){opening=false;refuse();return startTicket.promise;}if(claim!=='CLAIMED')fail();claimed=true;
   serviceOpenCalls++;service=sync(p.openServiceStore,[]);if(service===null||typeof service!=='object'||types.isProxy(service))fail();live();
   intakeOpenCalls++;intake=sync(p.openIntakeStore,[]);if(intake===null||typeof intake!=='object'||types.isProxy(intake)||intake===service)fail();live();
   providerOpenCalls++;const returned=A(p.openProvider,undefined,[service,intake]);
   observe(returned,captureRoot,selected=>{
    root=selected;if(closed||held){startupFailed();return;}providerStartCalls++;const listening=A(root.start,undefined,[]);
    observe(listening,v=>{const r=fields(v,['status']);if(!Object.isFrozen(v)||r.status!=='LISTENING')fail();return v;},value=>{
     live();const s=view();if(own(s,'phase')!=='OPEN'||own(s,'uncertain')!==false||own(s,'admissionRevoked')!==false||own(own(s,'ingress'),'phase')!=='LISTENING')fail();
     opening=false;started=true;phase='OPEN';startTicket.resolve(value);
    },startupFailed);
   },startupFailed);
  }catch{startupFailed();}return startTicket.promise;
 });
 const close=F(function close(){
  if(arguments.length!==0)return rejected();if(closing!==null)return closing.promise;closing=capability();closed=true;
  if(opening||active!==0)hold();else if(!held)phase='CLOSING';
  function finish(){try{if(held||opening||active!==0)fail();if(root!==null)cleanRoot();
    if(intake!==null){intakeCloseCalls++;if(sync(p.closeIntakeStore,[intake])!==undefined)fail();}
    if(held)fail();if(service!==null){serviceCloseCalls++;if(sync(p.closeServiceStore,[service])!==undefined)fail();}
    if(held)fail();release();phase='CLOSED';closing.resolve(undefined);
   }catch{hold();closing.reject(new TypeError('ISSUED_PROVIDER_STORES_CLOSE_HELD'));}}
  if(root!==null){const receipt=requestRootClose();A(THEN.value,receipt,[finish,()=>closing.reject(new TypeError('ISSUED_PROVIDER_STORES_CLOSE_HELD'))]);}
  else if(opening||held)closing.reject(new TypeError('ISSUED_PROVIDER_STORES_CLOSE_HELD'));else finish();return closing.promise;
 });
 const out={start,close};
 for(const name of names)out[name]=F(function(...args){
  if(args.length!==ARITY[name]||closed||held||!started||opening||active>=64||operationCalls>=128||!invariant()){if(ASYNC.has(name))return rejected();fail();}active++;operationCalls++;
  if(ASYNC.has(name)){const ticket=capability();let running=true;const settle=()=>{if(running){running=false;active--;}};
   try{const returned=A(root[name],undefined,args);observe(returned,result,value=>{settle();live();ticket.resolve(value);},()=>{settle();hold();ticket.reject(new TypeError('ISSUED_PROVIDER_OPERATION_HELD'));requestRootClose();});}
   catch{settle();hold();ticket.reject(new TypeError('ISSUED_PROVIDER_OPERATION_HELD'));requestRootClose();}return ticket.promise;}
  try{const value=result(A(root[name],undefined,args));live();return value;}catch{hold();requestRootClose();fail();}finally{active--;}
 });
 out.snapshot=F(function snapshot(){if(arguments.length!==0)fail();return F({version:1,phase,closed,held,opening,started,activeOperations:active,claimed,released,
  claimCalls,serviceOpenCalls,intakeOpenCalls,providerOpenCalls,providerStartCalls,providerCloseCalls,intakeCloseCalls,serviceCloseCalls,releaseCalls,operationCalls,maximumOperatorCalls:128,storesOwned:true,
  physicalRelease:'NOT_ESTABLISHED',externalOwnerFencing:'NOT_ESTABLISHED',nativeQualified:false});});
 return F(out);
}
