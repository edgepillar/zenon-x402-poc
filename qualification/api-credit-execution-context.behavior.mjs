// Actual pure invocation/context admission. Process flags and environment
// fields are declared DATA; no actual preload, native entry or package runs.
import assert from 'node:assert/strict';
import { captureApiCreditCliExecutionContext as admit } from '../src/api-credit-cli-execution-context.js';
import { captureApiCreditCliInvocation as invoke } from '../src/api-credit-cli-invocation.js';

const F=Object.freeze,checks=[],runtime=F(['24.19.0','node','linux','x64']);
function check(id,run){checks.push({id,run});}
const run=()=>['--profile-fd','3','--key-fd','4','--input-fd','5','--output-fd','6','--bootstrap-ms','1000'];
const clean=()=>({execArgv:[],nodeOptions:undefined,nodePath:undefined,preserveSymlinks:undefined});
function refused(value){assert.deepEqual(value,{mode:'EXECUTION_CONTEXT_REFUSED'});assert.equal(Object.isFrozen(value),true);assert.deepEqual(Reflect.ownKeys(value),['mode']);}

check('execution-context-plain-process-preserves-the-actual-frozen-operational-invocation',()=>{
 for(const host of ['linux','darwin'])for(const cpu of ['x64','arm64']){const argv=run();assert.deepEqual(admit(argv,'24.19.0','node',host,cpu,clean()),invoke(argv,'24.19.0','node',host,cpu));}
});
check('execution-context-all-three-keyless-inspection-modes-share-the-same-plain-process-gate',()=>{
 for(const flag of ['--inspect-fd','--signer-inspect-fd','--recorded-result-fd']){const argv=[flag,'3','--output-fd','6','--bootstrap-ms','1000'];
  assert.deepEqual(admit(argv,...runtime,clean()),invoke(argv,...runtime));refused(admit(argv,...runtime,{...clean(),nodeOptions:'--require=unselected'}));}
});
check('execution-context-explicit-node-flags-preloads-conditions-symlink-and-config-options-are-unselected',()=>{
 for(const flags of [['--import','unselected'],['--require=unselected'],['-r','unselected'],['--experimental-loader=unselected'],['--loader=unselected'],
  ['--conditions=development'],['-C','development'],['--preserve-symlinks'],['--preserve-symlinks-main'],['--experimental-config-file=unselected'],
  ['--experimental-default-config-file'],['--env-file=unselected'],['--no-addons'],['--permission'],['--max-old-space-size=1024'],['--unknown']])
  refused(admit(run(),...runtime,{...clean(),execArgv:flags}));
});
check('execution-context-node-options-must-be-unset-without-parsing-or-executing-its-value',()=>{
 for(const value of ['',' ','--import unselected','--require unselected','--conditions=development','--max-old-space-size=1024',0,null,{},Symbol('private')])
  refused(admit(run(),...runtime,{...clean(),nodeOptions:value}));
});
check('execution-context-commonjs-search-path-input-must-be-unset',()=>{
 for(const value of ['','/synthetic/unselected','/synthetic/one:/synthetic/two',null,0,{}])refused(admit(run(),...runtime,{...clean(),nodePath:value}));
});
check('execution-context-symlink-environment-input-must-be-unset-for-the-fixed-profile',()=>{
 for(const value of ['','0','1',false,null,{}])refused(admit(run(),...runtime,{...clean(),preserveSymlinks:value}));
});
check('execution-context-invalid-records-proxies-and-accessors-are-refused-without-hooks',()=>{
 let entered=0;const accessor=clean();Object.defineProperty(accessor,'nodeOptions',{enumerable:true,get(){entered++;throw Error('unselected');}});
 const proxy=new Proxy(clean(),{get(){entered++;throw Error('unselected');},ownKeys(){entered++;throw Error('unselected');},getPrototypeOf(){entered++;throw Error('unselected');}});
 const revoked=Proxy.revocable(clean(),{});revoked.revoke();
 for(const value of [null,undefined,[],Object.assign(Object.create(null),clean()),{...clean(),extra:true},accessor,proxy,revoked.proxy])refused(admit(run(),...runtime,value));
 assert.equal(entered,0);
});
check('execution-context-only-a-genuine-empty-dense-flag-array-is-admitted-with-no-element-reads',()=>{
 let entered=0;const accessor=[];Object.defineProperty(accessor,'0',{get(){entered++;throw Error('unselected');}});
 const proxy=new Proxy([],{get(){entered++;throw Error('unselected');},getPrototypeOf(){entered++;throw Error('unselected');}});
 const tagged=[];Object.defineProperty(tagged,Symbol('extra'),{get(){entered++;throw Error('unselected');}});
 class Derived extends Array{}
 for(const flags of [null,undefined,{},'',new Derived(),new Array(1),accessor,proxy,tagged])refused(admit(run(),...runtime,{...clean(),execArgv:flags}));
 assert.equal(entered,0);
});
check('execution-context-help-is-available-without-entering-an-unadmitted-context',()=>{
 let entered=0;const proxy=new Proxy({}, {get(){entered++;throw Error('unselected');},getPrototypeOf(){entered++;throw Error('unselected');}});
 assert.deepEqual(admit(['--help'],...runtime,proxy),{mode:'HELP'});assert.deepEqual(admit(['--help'],'25.0.0','node','win32','ia32',proxy),{mode:'HELP'});assert.equal(entered,0);
});
check('execution-context-an-unselected-runtime-stays-runtime-refused-before-context-inspection',()=>{
 let entered=0;const proxy=new Proxy({}, {get(){entered++;throw Error('unselected');}});
 assert.deepEqual(admit(run(),'25.0.0','node','linux','x64',proxy),{mode:'RUNTIME_REFUSED'});assert.equal(entered,0);
});
check('execution-context-input-and-argv-grammar-cannot-select-a-loader-policy',()=>{
 for(const argv of [[],[...run(),'--node-options','unselected'],['--mode','EXECUTION_CONTEXT_REFUSED']])assert.throws(()=>admit(argv,...runtime,clean()));
 assert.throws(()=>admit(run(),...runtime));assert.throws(()=>admit(run(),...runtime,clean(),'extra'));
});
check('execution-context-refusal-never-echoes-environment-values-or-carries-descriptors-and-authority',()=>{
 const privateText='synthetic-private-loader-value';const value=admit(run(),...runtime,{...clean(),nodeOptions:privateText});refused(value);
 assert.equal(JSON.stringify(value).includes(privateText),false);for(const key of ['profileFd','keyFd','inputFd','outputFd','loader','execution','authority'])assert.equal(Object.hasOwn(value,key),false);
 const execution=clean(),argv=run(),accepted=admit(argv,...runtime,execution);execution.execArgv.push('--require=late');argv[1]='99';assert.equal(accepted.profileFd,3);assert.equal(Object.isFrozen(accepted),true);
});

const cases=[];for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
const failed=cases.filter(c=>c.status!=='PASS').length;
console.log(JSON.stringify({qualification:'G0_API_CREDIT_EXECUTION_CONTEXT_DATA',passed:cases.length-failed,failed,cases,actualPureExecutionContextAdmission:true,
 contextValues:'DECLARED_DATA_ONLY',actualPreloadOrFlagExecution:false,policyFromArgvJsonOrEnvironment:false,
 nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
 nativeCliExecuted:false,installedPackageBytes:'NOT_ADMITTED',closedNamespace:'NOT_ESTABLISHED',binaryIdentity:'NOT_ESTABLISHED',nativeAcceptance:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));
if(failed)process.exitCode=1;
