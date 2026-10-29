// Actual pure CLI invocation admission. No native CLI/loader, package, key,
// descriptor, stream, store, clock or network is entered by this DATA entry.
import assert from 'node:assert/strict';
import { captureApiCreditCliInvocation as admit } from '../src/api-credit-cli-invocation.js';
import { captureApiCreditCliArguments as args } from '../src/api-credit-cli-arguments.js';

const F=Object.freeze,checks=[];function check(id,run){checks.push({id,run});}
const runArgs=()=>['--profile-fd','3','--key-fd','4','--input-fd','5','--output-fd','6','--bootstrap-ms','1000'];
const runtime=F(['24.19.0','node','linux','x64']);
function refused(value){assert.deepEqual(value,{mode:'RUNTIME_REFUSED'});assert.equal(Object.isFrozen(value),true);assert.deepEqual(Reflect.ownKeys(value),['mode']);}

check('runtime-admission-preserves-the-frozen-run-arguments-for-the-four-selected-posix-cpu-pairs',()=>{
 for(const platform of ['linux','darwin'])for(const cpu of ['x64','arm64']){
  const argv=runArgs(),v=admit(argv,'24.19.0','node',platform,cpu);assert.deepEqual(v,args(argv));assert.equal(v.mode,'RUN');assert.equal(Object.isFrozen(v),true);
 }
});
check('runtime-admission-preserves-all-three-keyless-original-inspection-modes-on-the-selected-runtime',()=>{
 for(const flag of ['--inspect-fd','--recorded-result-fd','--signer-inspect-fd']){
  const argv=[flag,'3','--output-fd','6','--bootstrap-ms','1000'];assert.deepEqual(admit(argv,...runtime),args(argv));
 }
});
check('runtime-admission-refuses-unselected-patches-minors-majors-prefixes-and-prereleases',()=>{
 for(const node of ['24.18.0','24.19.1','24.20.0','25.0.0','22.19.0','v24.19.0','>=24','24.19','24.19.0-rc.1','24.19.0+build','24.19.0\n',''])
  refused(admit(runArgs(),node,'node','linux','x64'));
});
check('runtime-admission-refuses-a-different-runtime-release-even-when-the-version-string-matches',()=>{
 for(const release of ['bun','deno','io.js','Node','node\0',''])refused(admit(runArgs(),'24.19.0',release,'linux','x64'));
});
check('runtime-admission-refuses-unselected-host-platform-and-cpu-shapes',()=>{
 for(const platform of ['win32','freebsd','aix','android','Linux',''])refused(admit(runArgs(),'24.19.0','node',platform,'x64'));
 for(const cpu of ['ia32','ppc64','s390x','ARM64','x86_64',''])refused(admit(runArgs(),'24.19.0','node','linux',cpu));
});
check('runtime-admission-opaque-runtime-values-are-not-coerced-or-used-as-callbacks',()=>{
 let entered=0;const opaque=F({toString(){entered++;throw Error('not selected');},valueOf(){entered++;throw Error('not selected');},[Symbol.toPrimitive](){entered++;throw Error('not selected');}});
 const proxy=new Proxy({}, {get(){entered++;throw Error('not selected');},getPrototypeOf(){entered++;throw Error('not selected');}});
 for(const value of [opaque,proxy,null,undefined,24,Symbol('private-runtime-data'),F(['24.19.0'])])for(let i=0;i<4;i++){
  const selected=[...runtime];selected[i]=value;refused(admit(runArgs(),...selected));
 }
 assert.equal(entered,0);
});
check('runtime-admission-help-remains-static-without-supported-or-coercible-runtime-data',()=>{
 let entered=0;const opaque=new Proxy({}, {get(){entered++;throw Error('not selected');}});
 assert.deepEqual(admit(['--help'],opaque,opaque,opaque,opaque),{mode:'HELP'});
 assert.throws(()=>admit([],opaque,opaque,opaque,opaque));
 assert.equal(entered,0);
});
check('runtime-admission-invalid-argv-stays-refused-before-a-runtime-can-make-it-valid',()=>{
 for(const argv of [['--profile-fd','3'],['--recorded-result-fd','3','--output-fd','3','--bootstrap-ms','1000'],
  [...runArgs(),'--help'],['--inspect-fd','03','--output-fd','6','--bootstrap-ms','1000']]){
  assert.throws(()=>admit(argv,...runtime));assert.throws(()=>admit(argv,'25.0.0','node','linux','x64'));
 }
 assert.throws(()=>admit(runArgs(),...runtime,'extra'));assert.throws(()=>admit(runArgs()));
});
check('runtime-admission-snapshots-the-original-descriptors-before-any-later-caller-mutation',()=>{
 const argv=runArgs(),v=admit(argv,...runtime);argv[1]='99';argv[3]='98';argv.splice(0,argv.length,'--help');
 assert.equal(v.profileFd,3);assert.equal(v.keyFd,4);assert.equal(v.mode,'RUN');assert.equal(Object.isFrozen(v),true);
 const rejected=admit(runArgs(),'25.0.0','node','linux','x64');assert.equal(JSON.stringify(rejected),'{'+'"mode":"RUNTIME_REFUSED"}');
});
check('runtime-admission-policy-cannot-be-selected-through-argv-or-a-new-user-mode',()=>{
 for(const flag of ['--node-version','--runtime','--platform','--architecture','--runtime-profile'])assert.throws(()=>admit([...runArgs(),flag,'24.19.0'],...runtime));
 assert.throws(()=>admit(['--mode','RUNTIME_REFUSED'],...runtime));
});

const cases=[];for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
const failed=cases.filter(c=>c.status!=='PASS').length;
console.log(JSON.stringify({qualification:'G0_API_CREDIT_RUNTIME_ADMISSION_DATA',passed:cases.length-failed,failed,cases,actualPureInvocationAdmission:true,
 selectedNode:'24.19.0',selectedRelease:'node',selectedPlatforms:['linux','darwin'],selectedArchitectures:['x64','arm64'],runtimePolicyFromArgv:false,
 nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
 nativeCliExecuted:false,installedPackageBytes:'NOT_ADMITTED',binaryIdentity:'NOT_ESTABLISHED',nativeAcceptance:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));
if(failed)process.exitCode=1;
