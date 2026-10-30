// SOURCE/PARSER ONLY. Linux filesystem, pipe and signal execution is unqualified.
import process,{hrtime} from 'node:process';
import { Buffer } from 'node:buffer';
import { constants,lstatSync,fstatSync,statSync,realpathSync,openSync,mkdirSync,writeSync,readSync,fsyncSync,closeSync,opendirSync,Dir } from 'node:fs';
import { basename } from 'node:path';
import { types,TextDecoder } from 'node:util';
import { setTimeout,clearTimeout } from 'node:timers';
import { canonicalJson } from './canonical.js';
import { decodeIssuedProviderJournalSetup,createIssuedProviderJournalSetup } from './issued-provider-journal-setup.js';
import { createIssuedProviderStartupStop } from './issued-provider-startup-stop.js';
import { createNativeIssuedProviderOperatorPipes } from './issued-provider-native-pipes.js';
import { createSettlementJournalInitialization } from './settlement-journal.js';

const F=Object.freeze,A=Reflect.apply,CLOCK=hrtime.bigint,THEN=Promise.prototype.then,GETUID=process.getuid,DIRREAD=Dir.prototype.readSync,DIRCLOSE=Dir.prototype.closeSync,FAILED=new Set();let entered=false;
function fail(){throw new TypeError('ISSUED_PROVIDER_NATIVE_JOURNAL_SETUP_HELD');}
function equal(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.uid===b.uid&&a.gid===b.gid&&a.mode===b.mode;}
function view(s){return F({device:String(s.dev),inode:String(s.ino),uid:String(s.uid),mode:Number(s.mode&0o7777n)});}

/** The fixed adapter owns every descriptor before another callback can use it.
 * Linux /proc/self/fd paths anchor mutations to those actual directory handles.
 * Selected path identity is rechecked; this is not cross-process fencing.
 * No legacy journal load, rename, overwrite, adoption, unlink or rmdir is used.
 */
function filesystemPorts(c,guard,clock,hold){
 if(process.platform!=='linux'||typeof GETUID!=='function'||!constants.O_DIRECTORY||!constants.O_NOFOLLOW)fail();
 const uid=BigInt(A(GETUID,process,[])),initial=createSettlementJournalInitialization(c.journal.maxRecords,c.journal.maxFileBytes);
 if(initial.fileName!=='settlement-journal.json'||initial.markerFileName!=='.settlement-journal.initialized'||typeof initial.serialized!=='string'||Buffer.byteLength(initial.serialized)>1024)fail();
 const frame={root:{fd:null,opening:false,closeEntered:false},directory:{fd:null,opening:false,closeEntered:false},state:{fd:null,opening:false,closeEntered:false},marker:{fd:null,opening:false,closeEntered:false},rootIdentity:null,directoryIdentity:null,stateIdentity:null,markerIdentity:null,listing:{handle:null,opening:false,closeEntered:false},mkdirEntered:false,mkdirReturned:false,closing:null,held:false,closed:false};
 function fdPath(role){if(frame[role].fd===null)fail();return '/proc/self/fd/'+frame[role].fd;}
 function openRole(role,path,flags,mode){const r=frame[role];if(r.fd!==null||r.opening||r.closeEntered)fail();r.opening=true;r.fd=openSync(path,flags,mode);r.opening=false;return fstatSync(r.fd,{bigint:true});}
 function directory(s){if(!s.isDirectory()||s.uid!==uid||(s.mode&0o7777n)!==0o700n||String(s.dev)!==c.expectedDevice)fail();}
 function root(){
  const s=fstatSync(frame.root.fd,{bigint:true});directory(s);
  if(!equal(s,frame.rootIdentity)||!equal(s,lstatSync(c.journal.allowedRoot,{bigint:true}))||realpathSync(c.journal.allowedRoot)!==c.journal.allowedRoot||!equal(s,statSync(fdPath('root'),{bigint:true})))fail();
  return s;
 }
 function leaf(){root();const s=fstatSync(frame.directory.fd,{bigint:true});directory(s);
  if(!equal(s,frame.directoryIdentity)||!equal(s,lstatSync(c.journal.directory,{bigint:true}))||!equal(s,lstatSync(fdPath('root')+'/'+basename(c.journal.directory),{bigint:true})))fail();return s;
 }
 function file(role,name){const s=fstatSync(frame[role].fd,{bigint:true});if(!s.isFile()||s.nlink!==1n||s.uid!==uid||(s.mode&0o7777n)!==0o600n||String(s.dev)!==c.expectedDevice
  ||!equal(s,frame[role+'Identity'])||!equal(s,lstatSync(fdPath('directory')+'/'+name,{bigint:true})))fail();return s;}
 function write(role,name,text){guard();leaf();const path=fdPath('directory')+'/'+name;
  const s=openRole(role,path,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);frame[role+'Identity']=s;file(role,name);
  const bytes=Buffer.from(text,'utf8');try{let offset=0;while(offset<bytes.length){guard();const n=writeSync(frame[role].fd,bytes,offset,bytes.length-offset,offset);if(!Number.isSafeInteger(n)||n<1)fail();offset+=n;}
   guard();fsyncSync(frame[role].fd);file(role,name);leaf();fsyncSync(frame.directory.fd);
  }finally{bytes.fill(0);}
 }
 const close=F(function close(){if(arguments.length!==0)fail();if(frame.closing!==null)return frame.closing;
  let resolve,reject;frame.closing=new Promise((yes,no)=>{resolve=yes;reject=no;});A(THEN,frame.closing,[()=>{},()=>{}]);
  const listing=frame.listing;if(listing.opening)frame.held=true;if(listing.handle!==null&&!listing.closeEntered){listing.closeEntered=true;try{if(A(DIRCLOSE,listing.handle,[])!==undefined)fail();listing.handle=null;}catch{frame.held=true;}}
  for(const role of ['marker','state','directory','root']){const r=frame[role];if(r.opening)frame.held=true;if(r.fd===null||r.closeEntered)continue;r.closeEntered=true;try{closeSync(r.fd);r.fd=null;}catch{frame.held=true;}}
  if(frame.held){hold();reject(new TypeError('ISSUED_PROVIDER_JOURNAL_HANDLES_HELD'));}else{frame.closed=true;resolve(undefined);}return frame.closing;
 });
 const inspectClose=F(()=>F({closed:frame.closed,held:frame.held,openHandles:['root','directory','state','marker'].filter(k=>frame[k].fd!==null||frame[k].opening).length+Number(frame.listing.handle!==null||frame.listing.opening)}));
 const protect=fn=>F(async()=>{try{return fn();}catch{frame.held=true;hold();fail();}});
 return F({check:guard,clock,armTimer:F((ms,fn)=>setTimeout(fn,ms)),cancelTimer:F(token=>{clearTimeout(token);}),close,inspectClose,
  inspectRoot:protect(()=>{guard();if(realpathSync(c.journal.allowedRoot)!==c.journal.allowedRoot)fail();const before=lstatSync(c.journal.allowedRoot,{bigint:true});directory(before);
   frame.rootIdentity=openRole('root',c.journal.allowedRoot,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);if(!equal(before,frame.rootIdentity))fail();return view(root());}),
  createDirectory:protect(()=>{guard();root();frame.mkdirEntered=true;mkdirSync(fdPath('root')+'/'+basename(c.journal.directory),{mode:0o700,recursive:false});frame.mkdirReturned=true;guard();root();
   frame.directoryIdentity=openRole('directory',fdPath('root')+'/'+basename(c.journal.directory),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);leaf();fsyncSync(frame.root.fd);return view(leaf());}),
  writeState:protect(()=>{if(!frame.mkdirReturned)fail();write('state',initial.fileName,initial.serialized);}),
  writeMarker:protect(()=>{guard();if(file('state',initial.fileName).size!==BigInt(Buffer.byteLength(initial.serialized)))fail();write('marker',initial.markerFileName,'');}),
  verifyCreated:protect(()=>{guard();leaf();const s=file('state',initial.fileName),m=file('marker',initial.markerFileName),expected=Buffer.from(initial.serialized,'utf8'),bytes=Buffer.alloc(expected.length+1),one=Buffer.alloc(1);
   try{
    frame.listing.opening=true;frame.listing.handle=opendirSync(fdPath('directory'),{bufferSize:3,encoding:'utf8'});frame.listing.opening=false;
    const names=[];for(let i=0;i<3;i++){guard();const item=A(DIRREAD,frame.listing.handle,[]);if(item===null)break;if(i===2||typeof item.name!=='string'||Buffer.byteLength(item.name)>255)fail();names.push(item.name);}names.sort();if(canonicalJson(names)!==canonicalJson([initial.markerFileName,initial.fileName].sort())||s.size!==BigInt(expected.length)||m.size!==0n)fail();
    let count=0;while(count<bytes.length){guard();const n=readSync(frame.state.fd,bytes,count,bytes.length-count,count);if(n===0)break;if(!Number.isSafeInteger(n)||n<0)fail();count+=n;}
    if(count!==expected.length||Buffer.compare(bytes.subarray(0,count),expected)!==0||readSync(frame.marker.fd,one,0,1,0)!==0)fail();
    guard();file('state',initial.fileName);file('marker',initial.markerFileName);const d=leaf();return F({revision:0,records:0,markerBytes:0,exactState:true,directoryIdentity:view(d)});
   }finally{expected.fill(0);bytes.fill(0);one.fill(0);}
  })});
}

export async function runNativeIssuedProviderJournalSetup(args,readPackageState){
 if(arguments.length!==2||entered||process.platform!=='linux'||args===null||typeof args!=='object'||types.isProxy(args)||Object.getPrototypeOf(args)!==Object.prototype||!Object.isFrozen(args)
  ||Reflect.ownKeys(args).length!==4||typeof readPackageState!=='function'||types.isProxy(readPackageState))fail();
 for(const name of ['mode','profileFd','outputFd','bootstrapMs']){const d=Object.getOwnPropertyDescriptor(args,name);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();}
 if(args.mode!=='INITIALIZE_JOURNAL'||!Number.isSafeInteger(args.profileFd)||args.profileFd<3||args.profileFd>1023||!Number.isSafeInteger(args.outputFd)||args.outputFd<3||args.outputFd>1023
  ||args.profileFd===args.outputFd||!Number.isSafeInteger(args.bootstrapMs)||args.bootstrapMs<1||args.bootstrapMs>60000)fail();entered=true;
 const frame={pipes:null,pipesEntered:false,owner:null,ports:null,held:false,deadline:null},clock=F(()=>A(CLOCK,hrtime,[])),signals=[];
 function hold(){frame.held=true;FAILED.add(frame);}
 const stopping=createIssuedProviderStartupStop(F(()=>frame.pipes===null?Promise.resolve():frame.pipes.close()));
 const guard=F(()=>{stopping.check();if(readPackageState()!=='READY'||frame.deadline===null||clock()>frame.deadline)fail();stopping.check();});
 function remaining(){const n=frame.deadline===null?0n:frame.deadline-clock();return n>0n?Math.max(1,Number((n+999999n)/1000000n)):1;}
 function closed(promise){return new Promise(resolve=>{let settled=false;const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);try{resolve(ok&&frame.deadline!==null&&clock()<=frame.deadline);}catch{resolve(false);}};
  const timer=setTimeout(()=>finish(false),remaining());if(!types.isPromise(promise)||types.isProxy(promise)){finish(false);return;}A(THEN,promise,[value=>finish(value===undefined),()=>finish(false)]);
 });}
 const onSignal=F(()=>{try{A(THEN,stopping.requestStop(),[()=>{},()=>hold()]);}catch{hold();}});let result=F({status:'HELD',exitCode:4});
 try{
  for(const signal of ['SIGINT','SIGTERM']){signals.push(signal);process.on(signal,onSignal);}frame.deadline=clock()+BigInt(args.bootstrapMs)*1000000n;
  guard();frame.pipesEntered=true;frame.pipes=createNativeIssuedProviderOperatorPipes(args);guard();
  const bytes=await frame.pipes.readProfile(guard,remaining());let profile;try{guard();profile=decodeIssuedProviderJournalSetup(new TextDecoder('utf8',{fatal:true,ignoreBOM:true}).decode(bytes));}finally{bytes.fill(0);}guard();
  frame.ports=filesystemPorts(profile,guard,clock,hold);frame.owner=createIssuedProviderJournalSetup(profile,frame.ports);stopping.attachControl(frame.owner.close);guard();result=await frame.owner.run();guard();
  if(result.exitCode!==0)hold();await frame.pipes.writeSetupResult(canonicalJson(result)+'\n',guard,remaining());guard();
 }catch{hold();}finally{
  try{if(frame.owner!==null)await frame.owner.close();}catch{hold();}
  try{if(frame.pipes!==null&&!await closed(frame.pipes.close()))fail();else if(frame.pipesEntered&&frame.pipes===null)fail();}catch{hold();}
  for(const signal of signals){try{process.off(signal,onSignal);}catch{hold();}}
  if(stopping.inspect().held)hold();
 }
 return F({providerJournalSetupResultVersion:1,status:frame.held?'HELD':result.status,exitCode:frame.held?4:result.exitCode,authority:'NONE',physicalRelease:'NOT_ESTABLISHED',nativeAcceptance:'NOT_ESTABLISHED'});
}
