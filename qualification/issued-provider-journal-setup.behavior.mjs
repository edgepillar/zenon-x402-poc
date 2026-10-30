// Actual setup protocol and invocation, with declared memory-only filesystem,
// timer and admission ports. No journal codec/native/FS/pipe module is loaded.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { decodeIssuedProviderJournalSetup as decode,createIssuedProviderJournalSetup as create } from '../src/issued-provider-journal-setup.js';
import { captureIssuedProviderCliInvocation as invocation } from '../src/issued-provider-cli-invocation.js';

const F=Object.freeze,checks=[],ROOT=F({device:'1',inode:'11',uid:'10',mode:0o700}),LEAF=F({...ROOT,inode:'12'});
const FLAGS={execArgv:[],nodeOptions:undefined,nodePath:undefined,preserveSymlinks:undefined},ARGV=['--initialize-journal-fd','3','--output-fd','6','--bootstrap-ms','1000'];
function check(id,run){checks.push({id,run});}
function profile(){return {providerJournalSetupVersion:1,journal:{directory:'/synthetic/private/new-journal',allowedRoot:'/synthetic/private',maxRecords:1,maxFileBytes:4194304},expectedDevice:'1',operationBudgetMs:1000};}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<32;i++)await Promise.resolve();}
function fixture(options={}){
 const s={trace:[],ns:0n,tokens:[],created:false,state:false,marker:false,closed:false,invalid:false};let owner;
 const call=(name,defaultValue)=>F(()=>{s.trace.push(name);return options[name]?options[name](s,owner):Promise.resolve(defaultValue);});
 const ports=F({check:F(()=>{if(s.invalid)throw Error('declared admission loss');}),inspectRoot:call('root',ROOT),
  createDirectory:call('create',LEAF),writeState:call('state',undefined),writeMarker:call('marker',undefined),
  verifyCreated:call('verify',F({revision:0,records:0,markerBytes:0,exactState:true,directoryIdentity:LEAF})),
  close:call('close',undefined),inspectClose:F(()=>options.view??F({closed:true,held:false,openHandles:0})),clock:F(()=>options.clock?options.clock(s):s.ns),
  armTimer:F((ms,callback)=>{const t={ms,callback,cancelled:false};s.tokens.push(t);return t;}),cancelTimer:F(t=>{t.cancelled=true;if(options.cancel)return options.cancel(s);})});
 owner=create(decode(canonicalJson(options.profile??profile())),ports);return {owner,s,ports};
}

check('journal-setup-invocation-selects-two-fds-and-no-service-or-secret-channel',()=>{assert.deepEqual(invocation(ARGV,'24.19.0','node','linux','x64',FLAGS),{mode:'INITIALIZE_JOURNAL',profileFd:3,outputFd:6,bootstrapMs:1000});assert.equal(invocation(ARGV,'24.19.0','node','darwin','arm64',FLAGS).mode,'RUNTIME_REFUSED');assert.equal(invocation(ARGV,'24.18.0','node','linux','x64',FLAGS).mode,'RUNTIME_REFUSED');});
check('journal-setup-invocation-rejects-alias-fds-buyer-flags-and-preloads',()=>{assert.throws(()=>invocation(ARGV.map(x=>x==='6'?'3':x),'24.19.0','node','linux','x64',FLAGS));assert.throws(()=>invocation(['--inspect-fd',...ARGV.slice(1)],'24.19.0','node','linux','x64',FLAGS));assert.equal(invocation(ARGV,'24.19.0','node','linux','x64',{...FLAGS,nodeOptions:''}).mode,'EXECUTION_CONTEXT_REFUSED');});
check('journal-setup-profile-is-canonical-keyless-and-frozen',()=>{const p=decode(canonicalJson(profile()));assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.journal));assert.equal(p.expectedDevice,'1');assert.equal(p.journal.maxRecords,1);assert.throws(()=>decode(canonicalJson(profile())+'\n'));assert.throws(()=>decode(' '.repeat(8193)));});
check('journal-setup-profile-refuses-adoption-recursion-and-noncanonical-paths',()=>{for(const change of [p=>p.journal.directory=p.journal.allowedRoot,p=>p.journal.directory='/synthetic/private/deeper/journal',p=>p.journal.directory='/synthetic/private/../foreign',p=>p.journal.existingOnly=false,p=>p.cleanup=true,p=>p.expectedDevice='01',p=>p.operationBudgetMs=0,p=>p.journal.maxFileBytes=4194305]){const p=profile();change(p);assert.throws(()=>decode(canonicalJson(p)));}});
check('journal-setup-construction-does-not-enter-filesystem-timers-or-admission',()=>{const f=fixture();assert.deepEqual(f.s.trace,[]);assert.equal(f.s.tokens.length,0);assert.equal(f.owner.inspect().phase,'NEW');});
check('journal-setup-success-orders-exclusive-state-marker-readback-and-close',async()=>{const f=fixture(),r=await f.owner.run();assert.equal(r.status,'INITIALIZED');assert.equal(r.exitCode,0);assert.equal(r.records,0);assert.equal(r.authority,'NONE');assert.equal(r.physicalRelease,'NOT_ESTABLISHED');assert.deepEqual(f.s.trace,['root','create','state','marker','verify','close']);assert.equal(f.s.tokens.every(t=>t.cancelled),true);});
check('journal-setup-run-and-original-close-are-one-shot',async()=>{const f=fixture();await f.owner.run();assert.throws(()=>f.owner.run());const a=f.owner.close(),b=f.owner.close();assert.equal(a,b);await a;assert.equal(f.s.trace.filter(v=>v==='create').length,1);assert.equal(f.s.trace.filter(v=>v==='close').length,1);});
check('journal-setup-close-before-run-enters-no-root-or-create',async()=>{const f=fixture();await f.owner.close();assert.deepEqual(f.s.trace,['close']);assert.throws(()=>f.owner.run());assert.equal(f.owner.inspect().closed,true);});
check('journal-setup-wrong-root-device-closes-original-and-never-creates',async()=>{const f=fixture({root:()=>Promise.resolve(F({...ROOT,device:'2'}))}),r=await f.owner.run();assert.equal(r.exitCode,4);assert.deepEqual(f.s.trace,['root','close']);});
check('journal-setup-existing-leaf-refusal-does-not-open-write-adopt-or-remove-it',async()=>{const f=fixture({create:()=>Promise.reject(Error('declared EEXIST'))}),r=await f.owner.run();assert.equal(r.exitCode,4);assert.deepEqual(f.s.trace,['root','create','close']);assert.equal(r.authority,'NONE');});
check('journal-setup-wrong-new-directory-identity-stops-before-state',async()=>{const f=fixture({create:()=>Promise.resolve(F({...LEAF,uid:'11'}))}),r=await f.owner.run();assert.equal(r.exitCode,4);assert.equal(f.s.trace.includes('state'),false);assert.equal(f.s.trace.at(-1),'close');});
check('journal-setup-state-write-loss-preserves-prefix-and-never-writes-marker',async()=>{const f=fixture({state:()=>Promise.reject(Error('declared write loss'))}),r=await f.owner.run();assert.equal(r.exitCode,4);assert.deepEqual(f.s.trace,['root','create','state','close']);assert.throws(()=>f.owner.run());});
check('journal-setup-marker-write-loss-never-adopts-partial-files',async()=>{const f=fixture({marker:()=>Promise.reject(Error('declared marker loss'))}),r=await f.owner.run();assert.equal(r.exitCode,4);assert.deepEqual(f.s.trace,['root','create','state','marker','close']);assert.equal(r.records,null);});
check('journal-setup-readback-must-match-empty-original-state-and-directory',async()=>{const f=fixture({verify:()=>Promise.resolve(F({revision:0,records:1,markerBytes:0,exactState:true,directoryIdentity:LEAF}))}),r=await f.owner.run();assert.equal(r.exitCode,4);assert.equal(f.s.trace.at(-1),'close');assert.equal(f.owner.inspect().held,true);});
check('journal-setup-lost-close-cannot-turn-readback-into-success',async()=>{const f=fixture({close:()=>Promise.reject(Error('declared close loss'))}),r=await f.owner.run();assert.equal(r.exitCode,4);assert.equal(f.s.trace.filter(v=>v==='close').length,1);await assert.rejects(f.owner.close());});
check('journal-setup-unclean-release-view-keeps-held-and-no-second-close',async()=>{const f=fixture({view:F({closed:true,held:false,openHandles:1})}),r=await f.owner.run();assert.equal(r.exitCode,4);await assert.rejects(f.owner.close());assert.equal(f.s.trace.filter(v=>v==='close').length,1);});
check('journal-setup-single-deadline-is-not-renewed-for-create-or-close',async()=>{const f=fixture({root:s=>{s.ns=600000000n;return Promise.resolve(ROOT);},create:s=>{s.ns=1200000000n;return Promise.resolve(LEAF);}}),r=await f.owner.run();assert.equal(r.exitCode,4);assert.deepEqual(f.s.trace,['root','create','close']);assert.deepEqual(f.s.tokens.map(t=>t.ms),[1000,400,1]);});
check('journal-setup-timeout-retains-entered-borrower-without-competing-close',async()=>{const late=deferred(),f=fixture({create:()=>late.promise}),work=f.owner.run();await flush();f.s.tokens.findLast(t=>!t.cancelled).callback();const r=await work;assert.equal(r.exitCode,4);assert.equal(f.s.trace.includes('close'),false);late.resolve(LEAF);await flush();assert.deepEqual(f.s.trace,['root','create']);assert.equal(f.owner.inspect().held,true);await assert.rejects(f.owner.close());});
check('journal-setup-reentrant-close-during-port-entry-does-not-compete',async()=>{let stop;const f=fixture({root:(s,owner)=>{stop=owner.close();return Promise.resolve(ROOT);}}),r=await f.owner.run();await assert.rejects(stop);assert.equal(r.exitCode,4);assert.deepEqual(f.s.trace,['root']);});
check('journal-setup-stop-during-write-prevents-marker-and-keeps-same-close',async()=>{const late=deferred(),f=fixture({state:()=>late.promise}),work=f.owner.run();await flush();const stop=f.owner.close();await assert.rejects(stop);late.resolve();const r=await work;assert.equal(r.exitCode,4);assert.deepEqual(f.s.trace,['root','create','state']);assert.equal(f.owner.close(),stop);});
check('journal-setup-admission-loss-after-create-prevents-state-and-preserves-directory',async()=>{const f=fixture({create:s=>{s.invalid=true;return Promise.resolve(LEAF);}}),r=await f.owner.run();assert.equal(r.exitCode,4);assert.deepEqual(f.s.trace,['root','create','close']);});
check('journal-setup-unsafe-thenable-is-retained-without-reading-then',async()=>{let getters=0;const f=fixture({create:()=>({get then(){getters++;throw Error('unentered');}})}),r=await f.owner.run();assert.equal(r.exitCode,4);assert.equal(getters,0);assert.deepEqual(f.s.trace,['root','create']);assert.equal(f.owner.inspect().opaque,true);});
check('journal-setup-synchronous-port-throw-keeps-unreturned-owner-held',async()=>{const f=fixture({create:()=>{throw Error('declared unreturned owner');}}),r=await f.owner.run();assert.equal(r.exitCode,4);assert.deepEqual(f.s.trace,['root','create']);assert.equal(f.owner.inspect().opaque,true);});
check('journal-setup-invalid-cancel-receipt-keeps-held-even-after-owner-close',async()=>{const f=fixture({cancel:()=>true}),r=await f.owner.run();assert.equal(r.exitCode,4);assert.deepEqual(f.s.trace,['root','close']);assert.equal(f.owner.inspect().held,true);});
check('journal-setup-clock-loss-still-requests-original-close-once',async()=>{const f=fixture({clock:()=>{throw Error('declared clock loss');}}),r=await f.owner.run();assert.equal(r.exitCode,4);assert.deepEqual(f.s.trace,['close']);await assert.rejects(f.owner.close());});
check('journal-setup-profile-brand-cannot-be-reused-to-reset-the-owner',()=>{const p=decode(canonicalJson(profile())),f=fixture();create(p,f.ports);assert.throws(()=>create(p,f.ports));assert.deepEqual(f.s.trace,[]);});

export const issuedProviderJournalSetupDataCases=F([...checks]);
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];let current=null,reported=false;
 function report(){if(reported)return;reported=true;const failed=cases.filter(c=>c.status==='FAIL').length;console.log(JSON.stringify({qualification:'G1_ISSUED_PROVIDER_JOURNAL_SETUP_DATA',passed:cases.length-failed,failed,cases,
  declaredPorts:'MEMORY_ONLY_FILESYSTEM_TIMER_ADMISSION',actualCodecExecuted:false,nativeExecutions:0,SDK:0,SQLite:0,sockets:0,signals:0,keys:0,signatures:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,physicalRelease:'NOT_ESTABLISHED',nativeAcceptance:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;}
 process.once('beforeExit',()=>{if(cases.length!==checks.length){cases.push({id:current??'incomplete',status:'FAIL',error:'UNSETTLED_DATA_PROMISE'});report();process.exitCode=1;}});
 for(const c of checks){current=c.id;try{await c.run();cases.push({id:c.id,status:'PASS'});}catch{cases.push({id:c.id,status:'FAIL',error:'DATA_ASSERTION'});}}
 report();
}
