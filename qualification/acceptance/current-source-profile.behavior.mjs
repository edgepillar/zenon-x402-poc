import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  parseCurrentApiCreditSourceProfileArguments as args,
  planCurrentApiCreditSourceProfile as plan,
  checkCurrentApiCreditSourceProfile as check,
  combineCurrentApiCreditSourceProfile as combine,
} from './current-source-profile-core.js';

const hash = b => createHash('sha256').update(b).digest('hex');
const encode = v => Buffer.from(JSON.stringify(v));
const copy = v => JSON.parse(JSON.stringify(v));
const extra = ['src/api-credit-native-package-admission.js','src/issued-provider-native-package-admission.js','src/api-credit-module-source-guard.js'];
const entries = ['src/api-credit-cli.js','src/issued-provider-cli.js'];
const catalogs = ['src/api-credit-module-catalog.json','src/issued-provider-module-catalog.json'];
function fixture() {
  const files = new Map(), reads = [];
  const row = (path, text, format = 'module') => {
    const raw = Buffer.from(text); files.set(path, raw);
    return { path, bytes:raw.length, sha256:hash(raw), format };
  };
  const root = row('package.json','{"type":"module"}','json');
  const shared = row('src/shared.js','export const shared = 1;');
  const dep = row('node_modules/example/index.js','export const unusedPackage = 1;');
  const own = entries.map(p => row(p,'export const entry = 1;'));
  const cats = own.map((r,i) => ({version:1,rows:copy([root,shared,r,dep]),edges:[{parent:entries[i],specifier:'example',path:dep.path}]}));
  const supplementalSources = extra.map(p => row(p,'export const inert = 1;'));
  const ref = (path, value) => {
    const raw=encode(value);files.set(path,raw);return {path,bytes:raw.length,sha256:hash(raw)};
  };
  const profile = {status:'SOURCE_AND_DECLARED_MEMORY_DATA_CANDIDATE',nativeQualification:'NOT_EXECUTED',G0G5Acceptance:'OPEN',currentLocalData:{sourceBoundDistinct:2}};
  const result = {status:'PASS',qualification:'G2_FIXTURE_DATA',passed:1,failed:0,sourceBoundDistinctControls:2,retainedExactControls:1,G0G5Acceptance:'OPEN'};
  for (const k of ['nativeExecutions','SDK','SQLite','keys','signatures','sockets','nonceSearches','nodeChildren','actualPrepare','payouts']) result[k]=0;
  const m = {profileVersion:1,profileId:'API_CREDIT_CURRENT_SOURCE_V1',sourceBaseline:'1'.repeat(40),
    application:{buyerEntry:entries[0],providerEntry:entries[1]},catalogs:[],supplementalSources,
    dataQualification:{sourceProfile:ref('qualification/profile.json',profile),result:ref('qualification/result.json',result),sourceBoundControls:2,executedControls:1,retainedControls:1,expectedResultQualification:'G2_FIXTURE_DATA'},
    runtime:{nodeVersion:'24.19.0',sdkVersion:'1.0.5',x402CoreVersion:'2.23.0'},
    acceptance:{supportedProfileEstablished:false,acceptedEntryCommand:null,nativeQualification:'NOT_EXECUTED',installedNamespace:'NOT_ESTABLISHED',linuxProductAcceptance:'NOT_ESTABLISHED',G0G5:'OPEN'}};
  function sync() { m.catalogs=cats.map((c,i)=>({role:i?'provider':'buyer',...ref(catalogs[i],c),sourceRows:2,packageRows:1,bareEdges:1}));return encode(m); }
  const read=Object.freeze((p,size)=>{reads.push(p);assert.equal(files.get(p)?.length,size);return files.get(p);});
  const start=()=>{const raw=sync();return plan(raw,hash(raw),read);};
  return {files,reads,cats,m,read,ref,sync,start};
}
const cases=[];
async function test(id, fn) { await fn(); cases.push({id,status:'PASS'}); }
function refuses(fn, suffix) { assert.throws(fn, suffix ? new RegExp('API_CREDIT_SOURCE_PROFILE_'+suffix) : /API_CREDIT_SOURCE_PROFILE_/); }
function manifestRefusal(mutator) { const f=fixture();f.sync();mutator(f);const raw=encode(f.m);refuses(()=>plan(raw,hash(raw),f.read)); }

await test('full-source-match-keeps-all-gates-open',()=>{
  const f=fixture(),p=f.start(),r=combine(p,[check(p,f.read)]);
  assert.equal(r.checkedSources,7);assert.equal(r.observedShards,1);assert.equal(r.authority,'NONE');
  assert.equal(r.snapshotAtomic,false);assert.equal(r.productAcceptance,'NOT_ESTABLISHED');
  assert.ok(r.gates.every(g=>g.status==='OPEN'));assert.equal(r.nativeExecutions,0);assert.equal(r.filesWritten,0);
  assert.ok(!f.reads.some(p=>p.startsWith('node_modules/')));
});
await test('shards-combine-in-any-order-with-exact-union',()=>{
  const f=fixture(),p=f.start(),a=check(p,f.read,0,3),b=check(p,f.read,1,3),c=check(p,f.read,2,3);
  assert.equal(combine(p,[c,a,b]).checkedSources,7);assert.equal(a.kind,'API_CREDIT_SOURCE_CHECK_SHARD');
});
await test('manifest-digest-mismatch-before-callback',()=>{const f=fixture();refuses(()=>plan(f.sync(),'0'.repeat(64),f.read),'MANIFEST_IDENTITY');assert.equal(f.reads.length,0);});
await test('manifest-proxy-byte-input-no-hooks',()=>{let n=0;const p=new Proxy(Buffer.from('{}'),{get(){n++;throw Error();}});refuses(()=>plan(p,'0'.repeat(64),Object.freeze(()=>{})));assert.equal(n,0);});
await test('byte-input-own-conversion-hooks-not-entered',()=>{const f=fixture(),b=f.sync();let n=0;Object.defineProperty(b,'toString',{value(){n++;throw Error();}});assert.equal(plan(b,hash(b),f.read).totalSources,7);assert.equal(n,0);});
await test('shared-byte-storage-rejected',()=>refuses(()=>plan(new Uint8Array(new SharedArrayBuffer(8)),'0'.repeat(64),Object.freeze(()=>{}))));
await test('resizable-byte-storage-rejected',()=>refuses(()=>plan(new Uint8Array(new ArrayBuffer(8,{maxByteLength:16})),'0'.repeat(64),Object.freeze(()=>{}))));
await test('malformed-utf8-rejected-after-digest',()=>{const raw=Buffer.from([0xff]);refuses(()=>plan(raw,hash(raw),Object.freeze(()=>{})),'UTF8');});
await test('malformed-json-rejected',()=>{const raw=Buffer.from('{');refuses(()=>plan(raw,hash(raw),Object.freeze(()=>{})),'JSON');});
await test('extra-manifest-fields-rejected',()=>manifestRefusal(f=>f.m.extra=true));
await test('runtime-version-drift-rejected',()=>manifestRefusal(f=>f.m.runtime.nodeVersion='25.0.0'));
await test('supported-profile-claim-rejected',()=>manifestRefusal(f=>f.m.acceptance.supportedProfileEstablished=true));
await test('native-promotion-rejected',()=>manifestRefusal(f=>f.m.acceptance.nativeQualification='PASS'));
await test('catalog-role-swap-rejected',()=>manifestRefusal(f=>f.m.catalogs.reverse()));
await test('supplement-traversal-rejected',()=>manifestRefusal(f=>f.m.supplementalSources[0].path='src/../private.js'));
await test('qualification-count-mismatch-rejected',()=>manifestRefusal(f=>f.m.dataQualification.retainedControls=0));
await test('catalog-byte-drift-rejected',()=>{const f=fixture();f.sync();f.files.set(catalogs[0],Buffer.alloc(f.files.get(catalogs[0]).length,32));const raw=encode(f.m);refuses(()=>plan(raw,hash(raw),f.read),'IDENTITY');});
await test('catalog-row-count-mismatch-rejected',()=>{const f=fixture();f.cats[0].rows.splice(1,1);refuses(()=>f.start(),'CATALOG_COUNT');});
await test('case-alias-catalog-rejected',()=>{const f=fixture();f.cats[0].rows.push({...f.cats[0].rows[1],path:'src/SHARED.js'});refuses(()=>f.start(),'CATALOG_ALIAS');});
await test('conflicting-source-rows-rejected',()=>{const f=fixture();f.cats[1].rows[1].sha256='0'.repeat(64);refuses(()=>f.start(),'SOURCE_CONFLICT');});
await test('cross-catalog-case-alias-rejected',()=>{const f=fixture();f.cats[1].rows[1].path='src/SHARED.js';refuses(()=>f.start(),'SOURCE_ALIAS');});
await test('conflicting-dependency-catalog-rejected',()=>{const f=fixture();f.cats[1].rows[3].sha256='0'.repeat(64);refuses(()=>f.start(),'DEPENDENCY_CONFLICT');});
await test('unknown-bare-edge-target-rejected',()=>{const f=fixture();f.cats[0].edges[0].path='node_modules/missing.js';refuses(()=>f.start(),'EDGE');});
await test('duplicate-bare-edge-rejected',()=>{const f=fixture();f.cats[0].edges.push({...f.cats[0].edges[0]});refuses(()=>f.start());});
await test('native-evidence-flag-rejected',()=>{const f=fixture();const p=JSON.parse(f.files.get('qualification/result.json'));p.SDK=1;f.m.dataQualification.result=f.ref('qualification/result.json',p);refuses(()=>f.start(),'QUALIFICATION');});
await test('callback-must-be-frozen-and-not-proxy',()=>{const f=fixture(),raw=f.sync();refuses(()=>plan(raw,hash(raw),()=>{}),'READER');refuses(()=>plan(raw,hash(raw),new Proxy(f.read,{})),'READER');});
await test('opaque-thenable-is-not-entered',()=>{const f=fixture(),p=f.start();let n=0;const value=Object.defineProperty({},'then',{get(){n++;throw Error();}});refuses(()=>check(p,Object.freeze(()=>value)),'BYTES');assert.equal(n,0);});
await test('promise-rejection-observed-without-byte-admission',async()=>{const f=fixture(),p=f.start();refuses(()=>check(p,Object.freeze(()=>Promise.reject(Error('synthetic')))),'BYTES');await Promise.resolve();});
await test('callback-throw-sanitized-and-attempt-consumed',()=>{const f=fixture(),p=f.start();refuses(()=>check(p,Object.freeze(()=>{throw Error('private');})),'READ');refuses(()=>check(p,f.read),'SHARD');});
await test('source-drift-consumes-failed-shard',()=>{const f=fixture(),p=f.start();f.files.set(entries[0],Buffer.from('export const entry = 2;'));refuses(()=>check(p,f.read),'IDENTITY');refuses(()=>check(p,f.read),'SHARD');});
await test('copied-plan-is-unbranded',()=>{const f=fixture(),p=f.start();refuses(()=>check({...p},f.read),'PLAN');});
await test('invalid-shard-ranges-rejected-before-source-read',()=>{const f=fixture(),p=f.start(),n=f.reads.length;refuses(()=>check(p,f.read,2,2));refuses(()=>check(p,f.read,0,0));assert.equal(f.reads.length,n);});
await test('shard-mode-cannot-change-after-attempt',()=>{const f=fixture(),p=f.start();check(p,f.read,0,2);refuses(()=>check(p,f.read,1,3),'SHARD');});
await test('missing-shard-does-not-promote-full-match',()=>{const f=fixture(),p=f.start();refuses(()=>combine(p,[check(p,f.read,0,2)]),'COVERAGE');});
await test('duplicate-shard-rejected',()=>{const f=fixture(),p=f.start(),a=check(p,f.read,0,2);refuses(()=>combine(p,[a,a]),'COVERAGE');});
await test('foreign-profile-receipt-rejected',()=>{const f=fixture(),p=f.start(),r=copy(check(p,f.read));r.profileSha256='0'.repeat(64);refuses(()=>combine(p,[r]),'RECEIPT');});
await test('foreign-source-set-receipt-rejected',()=>{const f=fixture(),p=f.start(),r=copy(check(p,f.read));r.sourceSetSha256='0'.repeat(64);refuses(()=>combine(p,[r]),'RECEIPT');});
await test('receipt-coverage-edit-rejected',()=>{const f=fixture(),p=f.start(),r=copy(check(p,f.read));r.checkedSources.pop();refuses(()=>combine(p,[r]),'COVERAGE');});
await test('receipt-authority-or-native-claim-rejected',()=>{for(const [k,v] of [['authority','GRANT'],['nativeExecutions',1],['productAcceptance','PASS'],['packageSourceFilesRead',1]]){const f=fixture(),p=f.start(),r=copy(check(p,f.read));r[k]=v;refuses(()=>combine(p,[r]),'RECEIPT');}});
await test('receipt-getters-not-entered',()=>{const f=fixture(),p=f.start(),r=copy(check(p,f.read));let n=0;Object.defineProperty(r,'authority',{enumerable:true,get(){n++;throw Error();}});refuses(()=>combine(p,[r]),'FIELDS');assert.equal(n,0);});
await test('receipt-array-proxy-not-entered',()=>{const f=fixture(),p=f.start();let n=0;refuses(()=>combine(p,new Proxy([],{get(){n++;throw Error();}})));assert.equal(n,0);});
await test('argument-full-and-shard-and-merge-modes',()=>{const d='a'.repeat(64);assert.equal(args(['--profile-sha256',d]).shardCount,1);assert.equal(args(['--profile-sha256',d,'--shard','1/8']).shardIndex,1);assert.equal(args(['--profile-sha256',d,'--merge-receipts','qualification/receipts.json']).receipts,'qualification/receipts.json');assert.equal(args(['--help']).help,true);});
await test('argument-ambiguity-and-traversal-rejected',()=>{for(const v of [[],['--profile-sha256','auto'],['--profile-sha256','a'.repeat(64),'--shard','01/8'],['--profile-sha256','a'.repeat(64),'--shard','8/8'],['--profile-sha256','a'.repeat(64),'--merge-receipts','qualification/../private.json'],['--help','extra']])refuses(()=>args(v));});
await test('prototype-json-hook-prevents-observation',()=>{const f=fixture(),raw=f.sync();let n=0;Object.defineProperty(Object.prototype,'toJSON',{configurable:true,value(){n++;throw Error();}});try{refuses(()=>plan(raw,hash(raw),f.read),'INPUT');assert.equal(n,0);}finally{delete Object.prototype.toJSON;}});

process.stdout.write(JSON.stringify({qualification:'G0_CURRENT_SOURCE_PROFILE_DATA',status:'PASS',passed:cases.length,failed:0,cases,nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,applicationFilesRead:0,G0G5Acceptance:'OPEN'})+'\n');
