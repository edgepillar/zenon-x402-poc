import { Buffer } from 'node:buffer';
import { posix } from 'node:path';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply,NP=Promise,PP=NP.prototype;
const THEN=D(PP,'then'),CTOR=D(PP,'constructor'),SPECIES=D(NP,Symbol.species),PROFILES=new WeakSet(),HELD=new Set();
const PORTS=F(['check','inspectRoot','createDirectory','writeState','writeMarker','verifyCreated','close','inspectClose','clock','armTimer','cancelTimer']);
function fail(){throw new TypeError('ISSUED_PROVIDER_JOURNAL_SETUP');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length)fail();const out={};
 for(const k of names){const d=D(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function number(v,a,b){if(!Number.isSafeInteger(v)||Object.is(v,-0)||v<a||v>b)fail();return v;}
function decimal(v){if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(v))fail();return v;}
function same(a,b){return !!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(b).every(k=>Object.hasOwn(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&same(D(PP,'then'),THEN)&&same(D(PP,'constructor'),CTOR)&&same(D(NP,Symbol.species),SPECIES);}
function safe(v){if(v===null||typeof v!=='object'||types.isProxy(v)||!types.isPromise(v)||Object.getPrototypeOf(v)!==PP||D(v,'then')!==undefined||!invariant())return false;
 const d=D(v,'constructor');return d===undefined||Object.hasOwn(d,'value')&&d.value===NP&&!d.enumerable&&!d.configurable&&!d.writable;}
function cap(){let resolve,reject;const promise=new NP((yes,no)=>{resolve=yes;reject=no;});Object.defineProperty(promise,'constructor',{value:NP});A(THEN.value,promise,[()=>{},()=>{}]);return {promise,resolve,reject};}
function identity(v){const x=fields(v,['device','inode','uid','mode']);decimal(x.device);decimal(x.inode);decimal(x.uid);if(x.mode!==0o700)fail();return F(x);}

export function decodeIssuedProviderJournalSetup(text){
 if(arguments.length!==1||typeof text!=='string'||Buffer.byteLength(text)>8192||Buffer.from(text).toString('utf8')!==text)fail();
 const v=fields(JSON.parse(text),['providerJournalSetupVersion','journal','expectedDevice','operationBudgetMs']),j=fields(v.journal,['directory','allowedRoot','maxRecords','maxFileBytes']);
 if(v.providerJournalSetupVersion!==1||canonicalJson(v)!==text)fail();
 for(const path of [j.directory,j.allowedRoot])if(typeof path!=='string'||path.length>4096||!posix.isAbsolute(path)||posix.resolve(path)!==path||path.includes('\0'))fail();
 if(posix.dirname(j.directory)!==j.allowedRoot||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(posix.basename(j.directory)))fail();
 number(j.maxRecords,1,10000);number(j.maxFileBytes,1024,4194304);decimal(v.expectedDevice);number(v.operationBudgetMs,1,60000);
 const out=F({...v,journal:F(j)});PROFILES.add(out);return out;
}

/** One explicit new directory, original state, marker and verification. Ports
 * are fixed by the native adapter; DATA controls use declared memory ports.
 * No existing-path adoption, overwrite, cleanup, payment or startup authority.
 * A timed-out/opaque borrower is retained without a competing close callback.
 */
export function createIssuedProviderJournalSetup(profile,ports){
 if(arguments.length!==2||!PROFILES.has(profile)||!invariant()||HELD.size>=32)fail();PROFILES.delete(profile);
 const p=fields(ports,PORTS);for(const fn of Object.values(p))if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();
 let running=null,stopping=null,stopped=false,held=false,phase='NEW',pending=null,opaque=null,entering=false,deadline=null,closed=false,root=null,directory=null;
 const retained=F(()=>[profile,p,running,stopping,pending,opaque,entering]);function hold(){held=true;HELD.add(retained);}
 function clock(){const n=A(p.clock,undefined,[]);if(typeof n!=='bigint'||n<0n)fail();return n;}
 function guard(){if(stopped||held||!invariant())fail();if(A(p.check,undefined,[])!==undefined)fail();if(stopped||held||!invariant())fail();}
 function begin(){if(deadline===null)deadline=clock()+BigInt(profile.operationBudgetMs)*1000000n;}
 function observe(fn,closing=false){
  const out=cap();let settled=false,token=null,armed=false;const finish=(ok,value)=>{if(settled)return;settled=true;
   try{if(token!==null&&A(p.cancelTimer,undefined,[token])!==undefined)fail();if(!ok||deadline===null||clock()>deadline)fail();out.resolve(value);}
   catch{hold();out.reject(new TypeError('ISSUED_PROVIDER_JOURNAL_SETUP_HELD'));}};
  try{
   if(!closing)guard();let left;try{begin();left=deadline-clock();}catch{if(!closing)throw new TypeError('ISSUED_PROVIDER_JOURNAL_SETUP_CLOCK');hold();left=-1n;}if(left<=0n&&!closing)fail();
   // Request the original close even after an observation clock expires.
   entering=true;const value=A(fn,undefined,[]);if(!safe(value)){opaque=F({receipt:value});fail();}pending=value;entering=false;
   A(THEN.value,value,[v=>{if(pending===value)pending=null;finish(true,v);},()=>{if(pending===value)pending=null;finish(false);}]);
   token=A(p.armTimer,undefined,[left>0n?Math.max(1,Number((left+999999n)/1000000n)):1,F(()=>{if(!armed)hold();finish(false);})]);armed=true;
   if(token===null||token===undefined||types.isProxy(token)||types.isPromise(token)||settled)fail();
  }catch{finish(false);}return out.promise;
 }
 const close=F(function close(){
  if(arguments.length!==0)fail();stopped=true;if(stopping!==null)return stopping.promise;stopping=cap();
  async function stop(){try{
   if(entering||pending!==null||opaque!==null)fail();if(await observe(p.close,true)!==undefined)fail();const v=fields(A(p.inspectClose,undefined,[]),['closed','held','openHandles']);
   if(v.closed!==true||v.held!==false||v.openHandles!==0)fail();closed=true;if(held)fail();stopping.resolve(undefined);
  }catch{hold();stopping.reject(new TypeError('ISSUED_PROVIDER_JOURNAL_SETUP_CLOSE_HELD'));}}
  A(THEN.value,stop(),[()=>{},()=>{hold();stopping.reject(new TypeError('ISSUED_PROVIDER_JOURNAL_SETUP_CLOSE_HELD'));}]);return stopping.promise;
 });
 const run=F(function run(){if(arguments.length!==0||running!==null||stopped||held)fail();running=cap();
  async function work(){try{
   guard();begin();phase='ROOT';root=identity(await observe(p.inspectRoot));guard();if(root.device!==profile.expectedDevice)fail();
   phase='CREATE_DIRECTORY';directory=identity(await observe(p.createDirectory));guard();if(directory.device!==root.device||directory.uid!==root.uid||directory.inode===root.inode)fail();
   phase='WRITE_STATE';if(await observe(p.writeState)!==undefined)fail();guard();
   phase='WRITE_MARKER';if(await observe(p.writeMarker)!==undefined)fail();guard();
   phase='VERIFY';const v=fields(await observe(p.verifyCreated),['revision','records','markerBytes','exactState','directoryIdentity']);guard();
   if(v.revision!==0||v.records!==0||v.markerBytes!==0||v.exactState!==true||!same(identity(v.directoryIdentity),directory))fail();
  }catch{hold();}finally{try{await close();}catch{hold();}}
  phase=held?'HELD':'INITIALIZED';running.resolve(F({providerJournalSetupResultVersion:1,status:phase,exitCode:held?4:0,records:held?null:0,revision:held?null:0,authority:'NONE',physicalRelease:'NOT_ESTABLISHED',nativeAcceptance:'NOT_ESTABLISHED'}));
  }A(THEN.value,work(),[()=>{},()=>{hold();phase='HELD';running.resolve(F({providerJournalSetupResultVersion:1,status:'HELD',exitCode:4,authority:'NONE',physicalRelease:'NOT_ESTABLISHED'}));}]);return running.promise;
 });
 return F({run,close,inspect:F(function inspect(){if(arguments.length!==0)fail();return F({phase,stopped,held,closed,pending:pending!==null,opaque:opaque!==null||entering,authority:'NONE'});})});
}
