import { openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { planCurrentApiCreditSourceProfile } from './acceptance/current-source-profile-core.js';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
let references=0;
function read(name, expected=null){
 if(typeof name!=='string'||!/^[-A-Za-z0-9_@.+/]+$/.test(name)||name.startsWith('/')||name.split('/').some(p=>!p||p==='.'||p==='..')||name.startsWith('node_modules/'))throw Error('PROFILE_REFERENCE');
 const fd=openSync(join(root,name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const a=fstatSync(fd,{bigint:true});if(!a.isFile()||a.nlink!==1n||a.size>1048576n||expected!==null&&a.size!==BigInt(expected))throw Error('PROFILE_REFERENCE');
 const size=Number(a.size),b=Buffer.alloc(size);let offset=0;while(offset<size){const n=readSync(fd,b,offset,size-offset,offset);if(!n)throw Error('PROFILE_REFERENCE');offset+=n;}if(readSync(fd,Buffer.alloc(1),0,1,size)!==0)throw Error('PROFILE_REFERENCE');const z=fstatSync(fd,{bigint:true});for(const k of ['dev','ino','mode','nlink','size','mtimeNs','ctimeNs'])if(a[k]!==z[k])throw Error('PROFILE_REFERENCE');references++;return b;
 }finally{closeSync(fd);}
}
if(process.argv.length!==3||!/^[0-9a-f]{64}$/.test(process.argv[2]))throw Error('PROFILE_DIGEST');
const plan=planCurrentApiCreditSourceProfile(read('qualification/acceptance/api-credit-current.source-profile.json'),process.argv[2],Object.freeze((name,size)=>read(name,size)));
if(plan.totalSources!==247||plan.totalSourceBytes!==3419513||plan.sourceBoundControls!==2444||references!==5)throw Error('PROFILE_PLAN');
process.stdout.write(JSON.stringify({qualification:'G0_SPENDING_DAY_EVENTS_CURRENT_PROFILE_PLAN',status:'PLAN_REFERENCES_MATCH',profileSha256:plan.profileSha256,sourceBaseline:plan.sourceBaseline,sourceSetSha256:plan.sourceSetSha256,plannedApplicationSources:plan.totalSources,plannedApplicationSourceBytes:plan.totalSourceBytes,sourceBoundApplicationControls:plan.sourceBoundControls,profileReferenceFilesRead:references,applicationSourceFilesRead:0,installedPackageFilesRead:0,sourceChecksExecuted:0,fullSourceCoverageReexecuted:false,nativeExecutions:0,authority:'NONE',G0G5Acceptance:'OPEN'})+'\n');
