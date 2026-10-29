// SOURCE/PARSER ONLY. No native file or crash durability acceptance is claimed.
import { constants,lstatSync,readdirSync,openSync,fstatSync,readSync,writeSync,fsyncSync,closeSync } from 'node:fs';
import { dirname,isAbsolute,join,resolve } from 'node:path';
import { getuid } from 'node:process';
import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { captureNativePrivateDirectoryStatIdentity } from './native-private-directory-identity.js';
import { captureIssuedFundingGrantRecoveryExpectation } from './x402-issued-funding-grant-recovery.js';
import { inspectOfficialFundingTransitionWitness,captureOfficialFundingTransitionWitnessChain } from './official-funding-post-transition-witness.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,OWNERS=new Map(),HELD=new Set(),TOKEN=F({});
const ANCHOR='funding-witness-anchor.json',FILE=/^funding-transition-[0-9a-f]{64}-[0-9a-f]{64}\.json$/;
function fail(){throw new TypeError('NATIVE_FUNDING_TRANSITION_WITNESS');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length)fail();
 const out={};for(const k of names){const d=D(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function identity(s){return [s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');}
function nameOf(raw){const r=inspectOfficialFundingTransitionWitness(raw);return 'funding-transition-'+r.expectedOutcomeDigest.slice(7)+'-'+r.proposedOutcomeDigest.slice(7)+'.json';}

/** A separate private directory, 33 write-once intents and one fixed anchor.
 * CREATE_NEW requires an empty existing directory and never adopts old files.
 * READ_EXISTING refuses retain. No rename, unlink, migration, retry,
 * journal/SQL access, economic callback or automatic ownership handover. */
export class NativeFundingTransitionWitness {
 #s;
 constructor(token,state){if(token!==TOKEN)fail();this.#s=state;F(this);}
 anchor(){if(arguments.length!==0)fail();return this.#s.anchor;}
 retain(raw){if(arguments.length!==1)fail();return this.#s.retain(raw);}
 read(raw){if(arguments.length!==1)fail();return this.#s.read(raw);}
 readAll(){if(arguments.length!==0)fail();return this.#s.readAll();}
 close(){if(arguments.length!==0)fail();return this.#s.close();}
 snapshot(){if(arguments.length!==0)fail();return this.#s.snapshot();}
}
export function openNativeFundingTransitionWitness(configuration){
 if(arguments.length!==1||HELD.size>=16)fail();const c=fields(configuration,['directory','expectedDevice','mode','expectation']);
 if(typeof c.directory!=='string'||!isAbsolute(c.directory)||resolve(c.directory)!==c.directory||dirname(c.directory)===c.directory
    ||typeof c.expectedDevice!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(c.expectedDevice)||!['CREATE_NEW','READ_EXISTING'].includes(c.mode))fail();
 const anchor=captureIssuedFundingGrantRecoveryExpectation(c.expectation),anchorRaw=canonicalJson({version:1,...anchor,authority:'NONE'}),uid=BigInt(getuid());
 let rootIdentity=null,slot=null,closed=false,held=false,busy=false;const pins=new Map(),handles=new Set(),attempts=[];
 const retained=F(()=>[c,anchor,rootIdentity,pins,handles,attempts,slot]);
 function hold(){held=true;HELD.add(retained);fail();}
 function root(){let at=c.directory;
  while(true){const s=lstatSync(at,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink())fail();
   if(at===c.directory){if(String(s.dev)!==c.expectedDevice)fail();const id=canonicalJson(captureNativePrivateDirectoryStatIdentity({dev:s.dev,ino:s.ino,uid:s.uid,gid:s.gid,mode:s.mode},uid));
    if(rootIdentity!==null&&rootIdentity!==id)fail();rootIdentity??=id;}
   const parent=dirname(at);if(parent===at)break;at=parent;}}
 function regular(s){if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||s.uid!==uid||(s.mode&0o7777n)!==0o600n||String(s.dev)!==c.expectedDevice||s.size<1n||s.size>4096n)fail();return identity(s);}
 function names(){root();const list=readdirSync(c.directory);if(list.length>34||!list.includes(ANCHOR)||list.some(n=>n!==ANCHOR&&!FILE.test(n)))fail();return list.sort();}
 function closeHandle(fd){if(!handles.has(fd))fail();const returned=closeSync(fd);if(returned!==undefined)fail();handles.delete(fd);}
 function readFile(name){root();const path=join(c.directory,name),before=lstatSync(path,{bigint:true}),id=regular(before);
  if(pins.has(name)&&pins.get(name)!==id)fail();
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);handles.add(fd);const bytes=Buffer.alloc(4097);attempts.push(bytes);
  if(regular(fstatSync(fd,{bigint:true}))!==id)fail();let used=0;
  while(used<bytes.length){const n=readSync(fd,bytes,used,bytes.length-used,used);if(n===0)break;if(!Number.isSafeInteger(n)||n<0)fail();used+=n;}
  if(used>4096||BigInt(used)!==before.size||regular(fstatSync(fd,{bigint:true}))!==id||regular(lstatSync(path,{bigint:true}))!==id)fail();
  const raw=bytes.subarray(0,used).toString('utf8');if(!Buffer.from(raw).equals(bytes.subarray(0,used)))fail();closeHandle(fd);pins.set(name,id);root();return raw;
 }
 function syncDirectory(){root();const fd=openSync(c.directory,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_DIRECTORY);handles.add(fd);
  const s=fstatSync(fd,{bigint:true}),id=canonicalJson(captureNativePrivateDirectoryStatIdentity({dev:s.dev,ino:s.ino,uid:s.uid,gid:s.gid,mode:s.mode},uid));
  if(id!==rootIdentity)fail();fsyncSync(fd);closeHandle(fd);root();}
 function writeNew(name,raw){root();const b=Buffer.from(raw);if(b.length<1||b.length>4096)fail();attempts.push(b);
  const fd=openSync(join(c.directory,name),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);handles.add(fd);let used=0;
  while(used<b.length){const n=writeSync(fd,b,used,b.length-used,used);if(!Number.isSafeInteger(n)||n<1)fail();used+=n;}
  fsyncSync(fd);const id=regular(fstatSync(fd,{bigint:true}));closeHandle(fd);pins.set(name,id);syncDirectory();if(readFile(name)!==raw)fail();
 }
 function all(){const first=names();if(readFile(ANCHOR)!==anchorRaw)fail();const values=[];
  for(const name of first){if(name===ANCHOR)continue;const raw=readFile(name);if(nameOf(raw)!==name)fail();values.push(raw);}
  if(canonicalJson(names())!==canonicalJson(first))fail();
  if(values.length===0)return F([]);return F(captureOfficialFundingTransitionWitnessChain(values,anchor).map(r=>r.raw));
 }
 try{root();if(c.mode==='CREATE_NEW'){
   if(readdirSync(c.directory).length!==0||OWNERS.has(rootIdentity)||OWNERS.size>=16)fail();slot={phase:'OPENING'};OWNERS.set(rootIdentity,slot);writeNew(ANCHOR,anchorRaw);slot.phase='OPEN';
  }else all();
 }catch{hold();}
 function available(){if(closed||held||busy)fail();}
 function operation(run){available();busy=true;attempts.length=0;try{return run();}catch{hold();}finally{busy=false;}}
 const state={anchor,
  retain(raw){if(c.mode!=='CREATE_NEW')fail();return operation(()=>{const r=inspectOfficialFundingTransitionWitness(raw),values=all();
   if(values.length>=33||r.boundRowDigest!==anchor.boundRowDigest||r.anchorOutcomeDigest!==anchor.outcomeRecordDigest)fail();
   const expected=values.length?inspectOfficialFundingTransitionWitness(values.at(-1)).proposedOutcomeDigest:anchor.outcomeRecordDigest;
   if(r.expectedOutcomeDigest!==expected)fail();captureOfficialFundingTransitionWitnessChain([...values,raw],anchor);
   writeNew(nameOf(raw),raw);const seen=all();if(seen.length!==values.length+1||seen.at(-1)!==raw)fail();return raw;});},
  read(raw){return operation(()=>{const record=inspectOfficialFundingTransitionWitness(raw);if(record.boundRowDigest!==anchor.boundRowDigest||record.anchorOutcomeDigest!==anchor.outcomeRecordDigest)fail();
   const values=all();if(!values.includes(raw))fail();return raw;});},
  readAll(){return operation(all);},
  close(){if(closed){if(held)fail();return;}closed=true;if(held||busy||handles.size!==0)hold();if(slot!==null){slot.phase='CLOSED';OWNERS.delete(rootIdentity);}return undefined;},
  snapshot(){return F({version:1,mode:c.mode,closed,held,busy,openHandles:handles.size,maximumWitnesses:33,maximumFileBytes:4096,authority:'NONE',physicalRelease:'NOT_ESTABLISHED'});},
 };
 return new NativeFundingTransitionWitness(TOKEN,state);
}
