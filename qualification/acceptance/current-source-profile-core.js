import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply,K=Reflect.ownKeys;
const T=Object.getPrototypeOf(Uint8Array.prototype),AB=D(T,'buffer').get,OFF=D(T,'byteOffset').get,LEN=D(T,'byteLength').get;
const SIZE=D(ArrayBuffer.prototype,'byteLength').get,RESIZE=D(ArrayBuffer.prototype,'resizable').get;
const NP=Promise,PP=NP.prototype,THEN=D(PP,'then'),CTOR=D(PP,'constructor'),SPECIES=D(NP,Symbol.species),PLANS=new WeakMap();
const GATES=F(['G0','G1','G2','G3a','G3b','G4','G5']);
const ROLES=F(['buyer','provider']),CATALOGS=F(['src/api-credit-module-catalog.json','src/issued-provider-module-catalog.json']);
const EXTRA=F(['src/api-credit-native-package-admission.js','src/issued-provider-native-package-admission.js','src/api-credit-module-source-guard.js']);
const SHA=/^[0-9a-f]{64}$/;
function fail(code){throw new TypeError('API_CREDIT_SOURCE_PROFILE_'+code);}
function same(a,b){return !!a&&!!b&&K(a).length===K(b).length&&K(b).every(k=>Object.hasOwn(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'toJSON')===undefined&&D(Array.prototype,'toJSON')===undefined&&D(Object.prototype,'then')===undefined
 &&same(D(PP,'then'),THEN)&&same(D(PP,'constructor'),CTOR)&&same(D(NP,Symbol.species),SPECIES);}
function plain(v){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype)fail('OBJECT');}
function fields(v,names){plain(v);if(K(v).length!==names.length)fail('FIELDS');const out={};for(const name of names){const d=D(v,name);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail('FIELDS');Object.defineProperty(out,name,{value:d.value,enumerable:true});}return out;}
function dense(v,max){if(!Array.isArray(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==Array.prototype)fail('ARRAY');const size=D(v,'length')?.value;
 if(!Number.isSafeInteger(size)||size<1||size>max||K(v).length!==size+1)fail('ARRAY');const out=[];for(let i=0;i<size;i++){const d=D(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail('ARRAY');out.push(d.value);}return out;}
function count(v,max=1000000){if(!Number.isSafeInteger(v)||Object.is(v,-0)||v<0||v>max)fail('COUNT');return v;}
function path(v){if(typeof v!=='string'||!/^(?:src|qualification)\/[A-Za-z0-9_@.+/-]+\.(?:js|mjs|json)$/.test(v)||v.split('/').some(p=>!p||p==='.'||p==='..'))fail('PATH');return v;}
function reference(v){const r=fields(v,['path','bytes','sha256']);path(r.path);count(r.bytes,1048576);if(!r.bytes||typeof r.sha256!=='string'||!SHA.test(r.sha256))fail('REFERENCE');return F(r);}
function row(v){const r=fields(v,['path','bytes','sha256','format']);
 if(typeof r.path!=='string'||!r.path.length||r.path.length>512||!/^[-A-Za-z0-9_@.+/]+$/.test(r.path)||r.path.startsWith('/')||r.path.split('/').some(p=>!p||p==='.'||p==='..')
  ||!(r.path==='package.json'||r.path.startsWith('src/')||r.path.startsWith('node_modules/')))fail('PATH');
 count(r.bytes,1048576);if(typeof r.sha256!=='string'||!SHA.test(r.sha256)||!['module','commonjs','json'].includes(r.format))fail('ROW');return F(r);}
function opaquePromise(v){try{if(!invariant()||!types.isPromise(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==PP||K(v).some(k=>k!=='constructor'))return;
 const d=D(v,'constructor');if(d&&(!Object.hasOwn(d,'value')||d.value!==NP))return;const q=A(THEN.value,v,[()=>{},()=>{}]);A(THEN.value,q,[()=>{},()=>{}]);}catch{}}
function bytes(v,max){
 try{if(v===null||typeof v!=='object'||types.isProxy(v))fail('BYTES');let storage,offset=0,size;
  if(types.isArrayBuffer(v)){storage=v;size=A(SIZE,v,[]);}else if(types.isUint8Array(v)){storage=A(AB,v,[]);size=A(LEN,v,[]);offset=A(OFF,v,[]);}else fail('BYTES');
  if(types.isSharedArrayBuffer(storage)||A(RESIZE,storage,[])||size>max)fail('BYTES');return Buffer.from(new Uint8Array(storage,offset,size));
 }catch{opaquePromise(v);fail('BYTES');}
}
function sha(v){return createHash('sha256').update(v).digest('hex');}
function json(raw,max){const b=bytes(raw,max),text=Buffer.prototype.toString.call(b,'utf8');if(!Buffer.from(text,'utf8').equals(b))fail('UTF8');let v;
 try{v=JSON.parse(text);}catch{fail('JSON');}if(!invariant())fail('INTRINSICS');return v;}
function reader(fn){if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail('READER');let reads=0,total=0;
 return r=>{if(!invariant()||++reads>2048||(total+=r.bytes)>16777216)fail('READ_BUDGET');let value;try{value=A(fn,undefined,[r.path,r.bytes]);}catch{fail('READ');}
 const b=bytes(value,r.bytes);if(!invariant()||b.length!==r.bytes||sha(b)!==r.sha256)fail('IDENTITY');return b;};}
function qualification(v,q){const p=json(v.sourceProfile,262144),r=json(v.result,262144);
 if(p.status!=='SOURCE_AND_DECLARED_MEMORY_DATA_CANDIDATE'||p.G0G5Acceptance!=='OPEN'||p.nativeQualification!=='NOT_EXECUTED'
  ||r.status!=='PASS'||r.qualification!==q.expectedResultQualification||r.failed!==0||r.passed!==q.executedControls
  ||r.sourceBoundDistinctControls!==q.sourceBoundControls||r.retainedExactControls!==q.retainedControls||r.G0G5Acceptance!=='OPEN'
  ||p.currentLocalData?.sourceBoundDistinct!==q.sourceBoundControls)fail('QUALIFICATION');
 for(const key of ['nativeExecutions','SDK','SQLite','keys','signatures','sockets','nonceSearches','nodeChildren','actualPrepare','payouts'])if(r[key]!==0)fail('QUALIFICATION');
}
export function parseCurrentApiCreditSourceProfileArguments(args){
 const values=dense(args,4);if(values.length===1&&values[0]==='--help')return F({help:true});
 if(![2,4].includes(values.length)||values[0]!=='--profile-sha256'||typeof values[1]!=='string'||!SHA.test(values[1]))fail('ARGUMENTS');
 const out={help:false,profileSha256:values[1],shardIndex:0,shardCount:1,receipts:null};
 if(values.length===4){
  if(values[2]==='--shard'&&typeof values[3]==='string'&&/^(?:0|[1-9][0-9]?)\/(?:[1-9]|1[0-6])$/.test(values[3])){
   const [index,total]=values[3].split('/').map(Number);if(index>=total)fail('ARGUMENTS');out.shardIndex=index;out.shardCount=total;
  }else if(values[2]==='--merge-receipts'&&typeof values[3]==='string'&&values[3].startsWith('qualification/')&&values[3].endsWith('.json'))out.receipts=path(values[3]);
  else fail('ARGUMENTS');
 }
 return F(out);
}
/** Identity checks only. This function never imports or executes an application
 * or installed package. The external manifest digest is a required trust input;
 * matching bytes do not authenticate the Git checkout or accept a product gate. */
export function planCurrentApiCreditSourceProfile(manifestBytes,expectedDigest,readSource){
 if(arguments.length!==3||!invariant()||typeof expectedDigest!=='string'||!SHA.test(expectedDigest))fail('INPUT');const raw=bytes(manifestBytes,262144);
 if(sha(raw)!==expectedDigest)fail('MANIFEST_IDENTITY');const m=fields(json(raw,262144),['profileVersion','profileId','sourceBaseline','application','catalogs','supplementalSources','dataQualification','runtime','acceptance']);
 if(m.profileVersion!==1||m.profileId!=='API_CREDIT_CURRENT_SOURCE_V1'||typeof m.sourceBaseline!=='string'||!/^[0-9a-f]{40}$/.test(m.sourceBaseline))fail('PROFILE');
 const app=fields(m.application,['buyerEntry','providerEntry']);if(app.buyerEntry!=='src/api-credit-cli.js'||app.providerEntry!=='src/issued-provider-cli.js')fail('ENTRY');
 const run=fields(m.runtime,['nodeVersion','sdkVersion','x402CoreVersion']);if(run.nodeVersion!=='24.19.0'||run.sdkVersion!=='1.0.5'||run.x402CoreVersion!=='2.23.0')fail('RUNTIME');
 const accept=fields(m.acceptance,['supportedProfileEstablished','acceptedEntryCommand','nativeQualification','installedNamespace','linuxProductAcceptance','G0G5']);
 if(accept.supportedProfileEstablished!==false||accept.acceptedEntryCommand!==null||accept.nativeQualification!=='NOT_EXECUTED'||accept.installedNamespace!=='NOT_ESTABLISHED'||accept.linuxProductAcceptance!=='NOT_ESTABLISHED'||accept.G0G5!=='OPEN')fail('UNPROVEN_ACCEPTANCE');
 const cats=dense(m.catalogs,2);if(cats.length!==2)fail('CATALOGS');const selected=cats.map((v,i)=>{const c=fields(v,['role','path','bytes','sha256','sourceRows','packageRows','bareEdges']);
  if(c.role!==ROLES[i]||c.path!==CATALOGS[i])fail('CATALOG_ROLE');reference({path:c.path,bytes:c.bytes,sha256:c.sha256});count(c.sourceRows,1024);count(c.packageRows,1024);count(c.bareEdges,32);if(!c.sourceRows||!c.packageRows||!c.bareEdges)fail('COUNT');return c;});
 const extra=dense(m.supplementalSources,3).map(row);if(extra.length!==3||extra.some((r,i)=>r.path!==EXTRA[i]||r.format!=='module'))fail('SUPPLEMENT');
 const q=fields(m.dataQualification,['sourceProfile','result','sourceBoundControls','executedControls','retainedControls','expectedResultQualification']);reference(q.sourceProfile);reference(q.result);
 count(q.sourceBoundControls);count(q.executedControls);count(q.retainedControls);if(!q.executedControls||q.executedControls+q.retainedControls!==q.sourceBoundControls||typeof q.expectedResultQualification!=='string'||!/^G[0-9]_[A-Z0-9_]+$/.test(q.expectedResultQualification))fail('QUALIFICATION');
 const read=reader(readSource),sources=new Map(),aliases=new Map(),packages=[];let byteTotal=0;
 function source(r){const alias=aliases.get(r.path.toLowerCase());if(alias!==undefined&&alias!==r.path)fail('SOURCE_ALIAS');aliases.set(r.path.toLowerCase(),r.path);
  const old=sources.get(r.path);if(old){if(JSON.stringify(old)!==JSON.stringify(r))fail('SOURCE_CONFLICT');return;}byteTotal+=r.bytes;if(byteTotal>8388608)fail('SOURCE_BUDGET');sources.set(r.path,r);}
 for(const c of selected){const cat=fields(json(read(c),262144),['version','rows','edges']);if(cat.version!==1)fail('CATALOG_VERSION');const rows=dense(cat.rows,1024).map(row),map=new Map(),aliases=new Set();
  for(const r of rows){if(aliases.has(r.path.toLowerCase()))fail('CATALOG_ALIAS');aliases.add(r.path.toLowerCase());map.set(r.path,r);if(!r.path.startsWith('node_modules/'))source(r);}
  const dep=rows.filter(r=>r.path.startsWith('node_modules/')).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);packages.push(dep);
  if(rows.filter(r=>r.path.startsWith('src/')).length!==c.sourceRows||dep.length!==c.packageRows||!map.has('package.json')||!map.has(app[c.role+'Entry']))fail('CATALOG_COUNT');
  const bare=dense(cat.edges,32),seen=new Set();if(bare.length!==c.bareEdges)fail('CATALOG_COUNT');
  for(const v of bare){const e=fields(v,['parent','specifier','path']);if(!map.has(e.parent)||!map.has(e.path)||!e.parent.startsWith('src/')||!e.path.startsWith('node_modules/')||typeof e.specifier!=='string'||!e.specifier.length||e.specifier.length>256||/^(?:\.|\/)|[:\\]/.test(e.specifier)||seen.has(e.parent+'\n'+e.specifier))fail('EDGE');seen.add(e.parent+'\n'+e.specifier);}
 }
 if(JSON.stringify(packages[0])!==JSON.stringify(packages[1]))fail('DEPENDENCY_CONFLICT');for(const r of extra)source(r);
 qualification({sourceProfile:read(q.sourceProfile),result:read(q.result)},q);
 const rows=[...sources.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0),sourceSetSha256=sha(JSON.stringify(rows));
 const plan=F({profileVersion:1,profileSha256:expectedDigest,sourceBaseline:m.sourceBaseline,totalSources:rows.length,totalSourceBytes:byteTotal,sourceSetSha256,packageCatalogRows:packages[0].length,sourceBoundControls:q.sourceBoundControls});
 PLANS.set(plan,{rows,mode:null,attempted:new Set()});return plan;
}
function planState(plan){if(plan===null||typeof plan!=='object'||types.isProxy(plan)||!PLANS.has(plan))fail('PLAN');return PLANS.get(plan);}
function result(plan,shard,checked){return F({kind:'API_CREDIT_SOURCE_CHECK_SHARD',status:'SOURCE_MATCH',profileSha256:plan.profileSha256,sourceBaseline:plan.sourceBaseline,sourceSetSha256:plan.sourceSetSha256,
 shard:F(shard),checkedSources:F(checked),totalSources:plan.totalSources,totalSourceBytes:plan.totalSourceBytes,packageCatalogRows:plan.packageCatalogRows,packageSourceFilesRead:0,
 installedNamespace:'NOT_ESTABLISHED',runtimeQualification:'NOT_ESTABLISHED',sourceBoundControls:plan.sourceBoundControls,nativeExecutions:0,applicationProgramsExecuted:0,filesWritten:0,productAcceptance:'NOT_ESTABLISHED',authority:'NONE'});}
/** A shard is consumed before reads. A failed observation cannot be silently
 * retried as part of that same plan. Make a new explicit observation instead. */
export function checkCurrentApiCreditSourceProfile(plan,readSource,shardIndex=0,shardCount=1){
 if(arguments.length<2||arguments.length>4||!invariant())fail('INPUT');const state=planState(plan);count(shardCount,16);count(shardIndex,15);
 if(shardCount<1||shardCount>state.rows.length||shardIndex>=shardCount||state.mode!==null&&state.mode!==shardCount||state.attempted.has(shardIndex))fail('SHARD');state.mode=shardCount;state.attempted.add(shardIndex);
 const read=reader(readSource),checked=[];for(let i=0;i<state.rows.length;i++)if(i%shardCount===shardIndex){const r=state.rows[i];read(r);checked.push(r);}
 return result(plan,{index:shardIndex,count:shardCount},checked);
}
export function combineCurrentApiCreditSourceProfile(plan,observations){
 if(arguments.length!==2||!invariant())fail('INPUT');const state=planState(plan),parts=dense(observations,16),seen=new Set(),all=new Map();let expectedCount=null;
 const shape=['kind','status','profileSha256','sourceBaseline','sourceSetSha256','shard','checkedSources','totalSources','totalSourceBytes','packageCatalogRows','packageSourceFilesRead','installedNamespace','runtimeQualification','sourceBoundControls','nativeExecutions','applicationProgramsExecuted','filesWritten','productAcceptance','authority'];
 for(const raw of parts){const r=fields(raw,shape),s=fields(r.shard,['index','count']);count(s.index,15);count(s.count,16);if(!s.count||s.count>state.rows.length||s.index>=s.count||seen.has(s.index)||expectedCount!==null&&s.count!==expectedCount)fail('COVERAGE');expectedCount=s.count;seen.add(s.index);
  if(r.kind!=='API_CREDIT_SOURCE_CHECK_SHARD'||r.status!=='SOURCE_MATCH'||r.profileSha256!==plan.profileSha256||r.sourceBaseline!==plan.sourceBaseline||r.sourceSetSha256!==plan.sourceSetSha256
   ||r.totalSources!==plan.totalSources||r.totalSourceBytes!==plan.totalSourceBytes||r.packageCatalogRows!==plan.packageCatalogRows||r.sourceBoundControls!==plan.sourceBoundControls
   ||r.packageSourceFilesRead!==0||r.nativeExecutions!==0||r.applicationProgramsExecuted!==0||r.filesWritten!==0||r.installedNamespace!=='NOT_ESTABLISHED'||r.runtimeQualification!=='NOT_ESTABLISHED'||r.productAcceptance!=='NOT_ESTABLISHED'||r.authority!=='NONE')fail('RECEIPT');
  const expected=state.rows.filter((v,i)=>i%s.count===s.index),checked=dense(r.checkedSources,1024).map(row);if(JSON.stringify(checked)!==JSON.stringify(expected))fail('COVERAGE');for(const v of checked){if(all.has(v.path))fail('COVERAGE');all.set(v.path,v);}
 }
 if(parts.length!==expectedCount||all.size!==state.rows.length)fail('COVERAGE');
 return F({kind:'API_CREDIT_CURRENT_SOURCE_CHECK',status:'SOURCE_MATCH',profileSha256:plan.profileSha256,sourceBaseline:plan.sourceBaseline,sourceSetSha256:plan.sourceSetSha256,
  checkedSources:all.size,checkedSourceBytes:plan.totalSourceBytes,observedShards:parts.length,packageCatalogRows:plan.packageCatalogRows,packageSourceFilesRead:0,
  sourceBoundControls:plan.sourceBoundControls,installedNamespace:'NOT_ESTABLISHED',runtimeQualification:'NOT_ESTABLISHED',snapshotAtomic:false,
  productAcceptance:'NOT_ESTABLISHED',gates:F(GATES.map(id=>F({id,status:'OPEN'}))),nativeExecutions:0,applicationProgramsExecuted:0,filesWritten:0,authority:'NONE'});
}
