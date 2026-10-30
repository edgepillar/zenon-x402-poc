import { requireIssuedProviderClosedAuxiliary, requireIssuedProviderClosedOwners } from './issued-provider-close-observation.js';
import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { captureBuyerOriginalFundingCommandLimits } from './buyer-original-funding-command.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply,NP=Promise,PP=NP.prototype;
const THEN=D(PP,'then'),CTOR=D(PP,'constructor'),SPECIES=D(NP,Symbol.species),HELD=new Set();
const OPS=F({FRESH:F(['STATUS','RESUME','ACTIVATE','CLOSE']),RECORDED:F(['STATUS','READ_ORIGINAL_GRANT','ADMIT_ORIGINAL_RESULTS','ADMIT_ORIGINAL','CLOSE']),
 JOURNAL:F(['STATUS','READ_ORIGINAL_GRANT','ADMIT_ORIGINAL_RESULTS','ADMIT_ORIGINAL','RECONCILE','RECOVER_FIRST','CLOSE']),WITNESSED:F(['STATUS','READ_ORIGINAL_GRANT','ADMIT_ORIGINAL_RESULTS','ADMIT_ORIGINAL','RECONCILE','RECOVER_FIRST','HISTORY','CLOSE'])});
const PORTS=F(['startProvider','inspectProvider','closeProvider','resumeOriginalSettlement','activateOriginalCommittedFunding','admitOriginalCommittedServiceGrant','admitOriginalCommittedServiceGrantResults',
 'inspectOriginalCommittedServiceGrant','reconcileOriginalFunding','recoverOriginalFundingFirstResult','inspectOriginalFundingHistory','readCommand','writeResult','closeChannel','inspectChannel','closeAuxiliary','inspectAuxiliary','clock','armTimer','cancelTimer']);
function fail(){throw new TypeError('ISSUED_PROVIDER_OPERATOR_CONTROL');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length)fail();
 const out={};for(const k of names){const d=D(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function same(a,b){return !!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(b).every(k=>Object.hasOwn(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&D(Object.prototype,'toJSON')===undefined&&same(D(PP,'then'),THEN)&&same(D(PP,'constructor'),CTOR)&&same(D(NP,Symbol.species),SPECIES);}
function safe(v){if(v===null||typeof v!=='object'||types.isProxy(v)||!types.isPromise(v)||Object.getPrototypeOf(v)!==PP||D(v,'then')!==undefined||!invariant())return false;
 const d=D(v,'constructor');return d===undefined||Object.hasOwn(d,'value')&&d.value===NP&&!d.enumerable&&!d.configurable&&!d.writable;}
function cap(){let resolve,reject;const promise=new NP((yes,no)=>{resolve=yes;reject=no;});Object.defineProperty(promise,'constructor',{value:NP});A(THEN.value,promise,[()=>{},()=>{}]);return {promise,resolve,reject};}
function data(v,depth=0,b={nodes:4096,bytes:65536}){
 if(--b.nodes<0||depth>20)fail();if(v===undefined||v===null||typeof v==='boolean')return v;
 if(typeof v==='string'){b.bytes-=Buffer.byteLength(v);if(b.bytes<0||Buffer.from(v).toString('utf8')!==v)fail();return v;}
 if(typeof v==='number'){if(!Number.isSafeInteger(v)||Object.is(v,-0))fail();return v;}
 if(typeof v!=='object'||types.isProxy(v))fail();const array=Array.isArray(v),keys=Reflect.ownKeys(v);if(Object.getPrototypeOf(v)!==(array?Array.prototype:Object.prototype))fail();
 if(array){const n=D(v,'length')?.value;if(!Number.isSafeInteger(n)||n>1024||keys.length!==n+1)fail();const out=[];for(let i=0;i<n;i++){const d=D(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();out.push(data(d.value,depth+1,b));}return F(out);}
 if(keys.length>64)fail();const out={};for(const k of keys){if(typeof k!=='string'||['then','toJSON','__proto__','constructor','prototype'].includes(k))fail();const d=D(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,k,{value:data(d.value,depth+1,b),enumerable:true});}return F(out);
}

export function decodeIssuedProviderControlCommand(line,mode,maximumBytes){
 if(arguments.length!==3||!Object.hasOwn(OPS,mode)||typeof line!=='string'||Buffer.byteLength(line)>maximumBytes)fail();
 const c=fields(data(JSON.parse(line)),['version','id','operation','argument']);
 if(c.version!==1||typeof c.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(c.id)||['startup','shutdown'].includes(c.id)||!OPS[mode].includes(c.operation)||canonicalJson(c)!==line)fail();
 if(c.operation==='ACTIVATE'){const v=fields(c.argument,['observerFileName','recordKey']);if(typeof v.observerFileName!=='string'||!/^funding-observer-[0-9a-f]{64}\.sqlite$/.test(v.observerFileName)
   ||typeof v.recordKey!=='string'||!/^sha256:[0-9a-f]{64}$/.test(v.recordKey))fail();}
 else if(c.argument!==null)fail();return F(c);
}

/** The same actual provider/channel are supplied by the fixed native launcher.
 * No HTTP operation chooses an operator capability. No command signs, submits,
 * replaces, activates from ACK/history, clears HELD or resets a budget. Pending
 * reads and activation stay the existing explicit original-owner operations.
 * Idle control input has no automatic polling or wall-time claim. Each entered
 * operation/write and the whole shutdown have explicit observation budgets.
 */
export function createIssuedProviderOperatorControl(options){
 if(arguments.length!==1||!invariant()||HELD.size>=32)fail();const c=fields(options,['mode','limits','operationBudgetMs','ports']);
 if(!Object.hasOwn(OPS,c.mode)||!Number.isSafeInteger(c.operationBudgetMs)||c.operationBudgetMs<1||c.operationBudgetMs>60000)fail();
 const limits=captureBuyerOriginalFundingCommandLimits(c.limits),p=fields(c.ports,PORTS);for(const v of Object.values(p))if(typeof v!=='function'||types.isProxy(v)||!Object.isFrozen(v))fail();
 let running=null,stopping=null,closed=false,held=false,phase='NEW',commands=0,providerClosed=false,channelClosed=false,auxiliaryClosed=false,writeUnknown=false,faults=0,closeReply=null;
 const ids=new Set(),pending=new Set(),opaque=[],retained=F(()=>[c,p,ids,pending,opaque]);
 function hold(v){held=true;faults++;phase='HELD';HELD.add(retained);if(v!==undefined)opaque.push(v);}
 function inspect(fn){const v=A(fn,undefined,[]);if(types.isPromise(v))fail();return data(v);}
 function clock(){const n=A(p.clock,undefined,[]);if(typeof n!=='bigint'||n<0n)fail();return n;}
 function bounded(fn,args,budget,allowSync=false){
  const out=cap();let settled=false,armed=false,token=null,start;const before=faults;
  function finish(ok,value){if(settled)return;settled=true;try{if(token!==null&&A(p.cancelTimer,undefined,[token])!==undefined)fail();if(clock()>start+BigInt(budget)*1000000n)fail();if(!ok)fail();out.resolve(F({ok:true,value}));}
   catch{hold();out.resolve(F({ok:false}));}}
  try{start=clock();token=A(p.armTimer,undefined,[budget,F(()=>{if(!armed)hold();finish(false);})]);armed=true;
   if(token===null||token===undefined||types.isProxy(token)||types.isPromise(token)||settled||faults!==before)fail();
   const v=A(fn,undefined,args);
   if(safe(v)){pending.add(v);A(THEN.value,v,[value=>{pending.delete(v);if(settled)return;try{finish(true,data(value));}catch{finish(false);}},()=>{pending.delete(v);finish(false);}]);}
   else if(allowSync&&!types.isPromise(v)){finish(true,data(v));}else{hold(v);finish(false);}
  }catch{finish(false);}return out.promise;
 }
 async function requireCall(fn,args,budget,allowSync=false){const r=await bounded(fn,args,budget,allowSync);if(!r.ok)fail();return r.value;}
 async function write(command,result,budget=c.operationBudgetMs){const line=canonicalJson({version:1,id:command.id,operation:command.operation,outcome:'RETURNED',result:result===undefined?null:result})+'\n';
  if(Buffer.byteLength(line)-1>limits.maxLineBytes)fail();try{if(await requireCall(p.writeResult,[line],budget)!==undefined)fail();}catch{writeUnknown=true;hold();fail();}}
 function cleanProvider(){const v=inspect(p.inspectProvider);if(v.phase!=='CLOSED'||v.held!==false||v.released!==true||v.activeOperations!==0)fail();}
 function cleanChannel(){const v=inspect(p.inspectChannel);if(v.lifecycle!=='CLOSED'||v.held!==false||v.reading!==false||v.writing!==false||v.writeCallbackPending!==false
  ||v.inputClosed!==true||v.outputClosed!==true||v.historicalClose!=='FULFILLED_UNDEFINED')fail();}
 function cleanReturnedOwners(includeChannel=false){
  const provider=inspect(p.inspectProvider),auxiliary=inspect(p.inspectAuxiliary);
  if(includeChannel)requireIssuedProviderClosedOwners(provider,auxiliary,inspect(p.inspectChannel));
  else requireIssuedProviderClosedAuxiliary(provider,auxiliary);
 }
 const close=F(function close(){
  if(arguments.length!==0)fail();closed=true;if(stopping!==null)return stopping.promise;stopping=cap();if(!held)phase='CLOSING';
  async function stop(){let ok=true,deadline;try{deadline=clock()+BigInt(limits.closeWaitMs)*1000000n;}catch{ok=false;hold();}
   const remaining=(stopOnly=false)=>{const n=deadline===undefined?0n:deadline-clock();if(n<=0n){hold();if(stopOnly)return 1;fail();}return Math.min(limits.closeWaitMs,Number((n+999999n)/1000000n));};
   // Request the original stops once even when the observation clock failed.
   // Failure to observe them within the one deadline still remains HELD.
   let providerReceipt=null;try{providerReceipt=A(p.closeProvider,undefined,[]);if(safe(providerReceipt))A(THEN.value,providerReceipt,[()=>{},()=>{}]);}catch{hold();}
   try{if(await requireCall(F(()=>providerReceipt),[],remaining())!==undefined)fail();cleanProvider();providerClosed=true;
    if(await requireCall(p.closeAuxiliary,[],remaining())!==undefined)fail();cleanReturnedOwners();auxiliaryClosed=true;
    if(closeReply!==null&&!held){await write(closeReply,F({status:'CLOSED'}),remaining());cleanReturnedOwners();}
   }catch{ok=false;hold();}
   let channelReceipt=null;try{channelReceipt=A(p.closeChannel,undefined,[]);if(safe(channelReceipt))A(THEN.value,channelReceipt,[()=>{},()=>{}]);}catch{hold();}
   try{if(await requireCall(F(()=>channelReceipt),[],remaining(true))!==undefined)fail();cleanChannel();channelClosed=true;cleanReturnedOwners(true);if(clock()>deadline)fail();}catch{ok=false;hold();}
   if(ok&&!held){phase='CLOSED';stopping.resolve(undefined);}else stopping.reject(new TypeError('ISSUED_PROVIDER_CONTROL_CLOSE_HELD'));
  }A(THEN.value,stop(),[()=>{},()=>{hold();stopping.reject(new TypeError('ISSUED_PROVIDER_CONTROL_CLOSE_HELD'));}]);return stopping.promise;
 });
 const run=F(function run(){if(arguments.length!==0||running!==null||closed||held)fail();running=cap();phase='STARTING';
  async function work(){let refused=false;
   try{const started=await requireCall(p.startProvider,[],c.operationBudgetMs),view=inspect(p.inspectProvider);if(closed||started?.status!=='LISTENING'||view.phase!=='OPEN'||view.held!==false)fail();phase='OPEN';
    await write({id:'startup',operation:'START'},F({status:'LISTENING'}));
    while(!closed){const raw=A(p.readCommand,undefined,[]);if(!safe(raw))fail();pending.add(raw);let line;
     try{line=await raw;}finally{pending.delete(raw);}if(closed)break;if(line===null)break;
     let command;try{if(commands>=limits.maxCommands)fail();command=decodeIssuedProviderControlCommand(line,c.mode,limits.maxLineBytes);if(ids.has(command.id))fail();}catch{refused=true;break;}
     ids.add(command.id);commands++;let result;
     if(command.operation==='CLOSE'){closeReply=command;break;}
     if(command.operation==='STATUS')result=inspect(p.inspectProvider);
     else{const name={RESUME:'resumeOriginalSettlement',ACTIVATE:'activateOriginalCommittedFunding',READ_ORIGINAL_GRANT:'inspectOriginalCommittedServiceGrant',ADMIT_ORIGINAL_RESULTS:'admitOriginalCommittedServiceGrantResults',ADMIT_ORIGINAL:'admitOriginalCommittedServiceGrant',RECONCILE:'reconcileOriginalFunding',RECOVER_FIRST:'recoverOriginalFundingFirstResult',HISTORY:'inspectOriginalFundingHistory'}[command.operation];
      result=await requireCall(p[name],command.operation==='ACTIVATE'?[command.argument]:[],c.operationBudgetMs,['READ_ORIGINAL_GRANT','ADMIT_ORIGINAL_RESULTS','ADMIT_ORIGINAL','HISTORY'].includes(command.operation));}
     if(closed||held)fail();await write(command,result);
    }
   }catch{hold();}finally{try{await close();}catch{hold();}}
   const status=held?'HELD':refused?'INPUT_REFUSED':'CLOSED';running.resolve(F({providerControlResultVersion:1,status,exitCode:held?4:refused?1:0,commands,providerClosedObserved:providerClosed,
    channelClosedObserved:channelClosed,auxiliaryClosedObserved:auxiliaryClosed,outputOutcomeUnknown:writeUnknown,physicalRelease:'NOT_ESTABLISHED',nativeAcceptance:'NOT_ESTABLISHED'}));
  }A(THEN.value,work(),[()=>{},()=>{hold();running.resolve(F({providerControlResultVersion:1,status:'HELD',exitCode:4,physicalRelease:'NOT_ESTABLISHED'}));}]);return running.promise;
 });
 return F({run,close,inspect:F(function inspectControl(){if(arguments.length!==0)fail();return F({phase,closed,held,commands,writeUnknown,providerClosed,channelClosed,auxiliaryClosed});})});
}
