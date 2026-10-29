// Actual activation owner/provider controller/reference ledger. Observer,
// authenticated activation, service, SQL and listener ports are declared DATA.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { createIssuedFundingGrantActivationOwner as create } from '../src/issued-funding-grant-activation-owner.js';
import { issuedProviderDataFixture as provider,issuedProviderFundingRequest as fundingRequest,issuedProviderServiceRequest as serviceRequest,
 issuedProviderRequired as required,issuedProviderSelection as selection,issuedProviderFlush as flush } from './issued-grant-provider.behavior.mjs';

const F=Object.freeze,checks=[],clone=v=>JSON.parse(JSON.stringify(v)),HASH='a'.repeat(64),URL='https://provider.invalid:8443/funding';
function check(id,run){checks.push({id,run});}
function deep(v){if(v!==null&&typeof v==='object'){for(const x of Object.values(v))deep(x);F(v);}return v;}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function row(){return {status:'BOUND',issue:{resourceUrl:URL,selection:selection(),authorityRecord:'declared-authority',
 frame:{status:402,paymentRequiredHeader:Buffer.from(canonicalJson(required())).toString('base64'),body:'Payment Required'},
 challenge:{paymentRequired:required(),activationIntent:{declared:true}}},binding:{transactionHash:HASH,observerRecordKey:'sha256:'+'7'.repeat(64),
 observerTarget:{declared:true},observerInitialState:{declared:true}}};}
async function fixture(options={}){
 let f,owner;const stats={prepares:0,activates:0,admits:0,loads:0,debits:0,executions:0,closeCalls:0,rows:[row()],trace:[]},observer=F({declaredObserver:true});
 const service=(s,d,req,res)=>{const grantId=s.root.snapshot().admittedGrantId,id=req.declaredRequestId??'request.original';
  const input={modelVersion:1,grantId,requestId:id,method:'POST',routeId:'api.fixed',canonicalBodyDigest:'sha256:'+'a'.repeat(64),selectedContentType:'application/json',maxCostUnits:1};
  const reserved=s.model.reserveRequest(input);if(!reserved.replayed){stats.debits++;const b=s.model.beginExecution({grantId,requestId:id});if(b.executionAuthorized){stats.executions++;s.model.completeExecution({grantId,requestId:id,cachedResult:{statusCode:200,contentType:'application/json',resultCode:'result.fixed'}});}}
  res.statusCode=200;res.end('{"result":"fixed"}');return Promise.resolve(undefined);};
 f=await provider({...options.provider,service:options.service??service});
 function result(){const grant=f.m.activate();return F({activation:grant.activation,grant});}
 const port=F({providerSnapshot:F(()=>options.view?options.view(f,owner,stats):f.s.root.snapshot()),
  providerClose:F(()=>{stats.closeCalls++;stats.trace.push('close');return options.close?options.close(f,owner,stats):f.s.root.close();}),
  loadBound:F(()=>{stats.loads++;return options.load?options.load(f,owner,stats):stats.rows;}),
  prepareActivation:F((actual,selected)=>{stats.prepares++;stats.trace.push('prepare');assert.equal(actual,observer);assert.equal(selected.binding.transactionHash,HASH);
   if(options.prepare)return options.prepare(f,owner,stats,actual,selected,result);
   return F({status:'READY',activate:F(()=>{stats.activates++;stats.trace.push('activate');return options.activate?options.activate(f,owner,stats,result):Promise.resolve(result());})});}),
  admitCommittedServiceGrant:F(id=>{stats.admits++;stats.trace.push('admit');return options.admit?options.admit(f,owner,stats,id):f.s.root.admitCommittedServiceGrant(id);}),
 });
 const config={selection:selection(),resourceUrl:URL,port};if(options.configure)options.configure(config);owner=create(config);
 async function fund(){f.send(fundingRequest(true));await flush();}
 return {...f,owner,stats,observer,config,fund,result};
}
async function funded(options={}){const f=await fixture(options);await f.fund();return f;}
async function held(f){await assert.rejects(f.owner.activateOriginalCommittedFunding(f.observer));assert.equal(f.owner.snapshot().held,true);await assert.rejects(f.owner.close());}

check('original-activation-construction-is-inert-and-ports-are-closed',async()=>{const f=await fixture();assert.equal(f.stats.loads+f.stats.prepares+f.stats.activates,0);assert.throws(()=>create({...f.config,extra:true}));assert.throws(()=>create({...f.config,port:{...f.config.port,prepareActivation:f.config.port.providerClose}}));await f.owner.close();});
check('original-activation-unfunded-and-pending-provider-never-enter-preparation',async()=>{for(const options of [{},{provider:{pending:true}}]){const f=await fixture(options);if(options.provider)await f.fund();const r=await f.owner.activateOriginalCommittedFunding(f.observer);assert.equal(r.status,'NOT_READY');assert.equal(f.stats.loads+f.stats.prepares+f.stats.activates,0);assert.equal(f.m.model.exportState().grants.length,0);await f.owner.close();}});
check('original-activation-settled-alone-does-not-create-or-open-a-grant',async()=>{const f=await funded({prepare:()=>F({status:'NOT_READY'})}),r=await f.owner.activateOriginalCommittedFunding(f.observer);assert.equal(r.status,'NOT_READY');assert.equal(f.stats.activates,0);assert.equal(f.m.model.exportState().grants.length,0);assert.equal(f.s.serviceCreates,0);await f.owner.close();});
check('original-activation-ready-target-creates-one-original-grant-then-actual-admission',async()=>{const f=await funded(),r=await f.owner.activateOriginalCommittedFunding(f.observer);assert.equal(r.status,'ADMITTED');assert.equal(r.transactionHash,HASH);assert.equal(f.stats.activates,1);assert.equal(f.stats.admits,1);assert.deepEqual(f.stats.trace,['prepare','activate','admit']);assert.equal(f.m.model.exportState().grants.length,1);assert.equal(f.s.serviceCreates,1);assert.equal(f.s.root.snapshot().admittedGrantId,r.grantId);await f.owner.close();});
check('original-activation-second-call-cannot-repeat-even-after-known-success',async()=>{const f=await funded();await f.owner.activateOriginalCommittedFunding(f.observer);await assert.rejects(f.owner.activateOriginalCommittedFunding(f.observer));assert.equal(f.stats.activates,1);assert.equal(f.stats.admits,1);await f.owner.close();});
check('original-activation-not-ready-is-explicit-and-bounded-to-sixteen-attempts',async()=>{const f=await funded({prepare:()=>F({status:'NOT_READY'})});for(let i=0;i<16;i++)assert.equal((await f.owner.activateOriginalCommittedFunding(f.observer)).status,'NOT_READY');await assert.rejects(f.owner.activateOriginalCommittedFunding(f.observer));assert.equal(f.stats.prepares,16);assert.equal(f.stats.activates,0);assert.equal(f.owner.snapshot().held,false);await f.owner.close();});
check('original-activation-not-ready-then-ready-does-not-renew-funding',async()=>{const f=await funded({prepare(base,owner,s,o,r,result){return s.prepares===1?F({status:'NOT_READY'}):F({status:'READY',activate:F(()=>{s.activates++;return Promise.resolve(result());})});}});assert.equal((await f.owner.activateOriginalCommittedFunding(f.observer)).status,'NOT_READY');assert.equal((await f.owner.activateOriginalCommittedFunding(f.observer)).status,'ADMITTED');assert.equal(f.stats.activates,1);assert.equal(f.s.paid,1);await f.owner.close();});
check('original-activation-foreign-or-extra-bound-row-refuses-before-preparation',async()=>{for(const load of [()=>[],()=>[row(),row()],()=>[{...row(),binding:{...row().binding,transactionHash:'f'.repeat(64)}}]]){const f=await funded({load});await held(f);assert.equal(f.stats.prepares+f.stats.activates,0);}});
check('original-activation-changed-selection-or-issued-challenge-is-refused',async()=>{for(const change of [r=>r.issue.selection.offerVersion=2,r=>r.issue.challenge.paymentRequired.accepts[0].amount='2']){const f=await funded();change(f.stats.rows[0]);await held(f);assert.equal(f.stats.activates,0);}});
check('original-activation-bound-getters-are-never-run',async()=>{let hooks=0;const f=await funded();Object.defineProperty(f.stats.rows[0].binding,'transactionHash',{enumerable:true,get(){hooks++;throw Error();}});await held(f);assert.equal(hooks,0);assert.equal(f.stats.activates,0);});
check('original-activation-preparation-must-be-sync-and-cannot-return-opaque-promise',async()=>{const p=deferred(),f=await funded({prepare:()=>p.promise});await assert.rejects(f.owner.activateOriginalCommittedFunding(f.observer));p.reject(Error('declared prepare'));await flush();assert.equal(f.stats.activates,0);await assert.rejects(f.owner.close());});
check('original-activation-ready-function-is-captured-without-running-accessors',async()=>{let hooks=0;const f=await funded({prepare(){const value={status:'READY'};Object.defineProperty(value,'activate',{enumerable:true,get(){hooks++;throw Error();}});return F(value);}});await held(f);assert.equal(hooks,0);assert.equal(f.stats.activates,0);});
check('original-activation-reentrant-second-call-cannot-enter-a-second-preparer',async()=>{let second;const f=await funded({prepare(base,owner,s,o,r,result){second=owner.activateOriginalCommittedFunding(o);return F({status:'READY',activate:F(()=>{s.activates++;return Promise.resolve(result());})});}});await f.owner.activateOriginalCommittedFunding(f.observer);await assert.rejects(second);assert.equal(f.stats.prepares,1);assert.equal(f.stats.activates,1);await f.owner.close();});
check('original-activation-manual-admission-is-fenced-during-preparation',async()=>{let refused=false;const f=await funded({prepare(base,owner,s,o,r,result){assert.throws(()=>owner.admitCommittedServiceGrant('grant_'+'a'.repeat(64)));refused=true;return F({status:'READY',activate:F(()=>{s.activates++;return Promise.resolve(result());})});}});await f.owner.activateOriginalCommittedFunding(f.observer);assert.equal(refused,true);assert.equal(f.stats.admits,1);await f.owner.close();});
check('original-activation-close-during-preparation-prevents-activation-entry',async()=>{let closing;const f=await funded({prepare(base,owner){closing=owner.close();return F({status:'READY',activate:F(()=>{throw Error('must not enter');})});}});await held(f);await assert.rejects(closing);assert.equal(f.owner.snapshot().activationEntered,false);assert.equal(f.stats.closeCalls,1);});
check('original-activation-row-drift-after-preparation-stops-the-mint-call',async()=>{const f=await funded({prepare(base,owner,s){s.rows=[];return F({status:'READY',activate:F(()=>{s.activates++;throw Error();})});}});await held(f);assert.equal(f.stats.activates,0);});
check('original-activation-thenable-is-held-without-reading-then',async()=>{let hooks=0;const f=await funded({activate(){return Object.defineProperty({},'then',{get(){hooks++;throw Error();}});}});await held(f);assert.equal(hooks,0);assert.equal(f.stats.admits,0);});
check('original-activation-lost-target-result-keeps-created-grant-without-admission-or-retry',async()=>{const f=await funded({activate(base,owner,s,result){result();return Promise.reject(Error('declared result loss'));}});await held(f);assert.equal(f.m.model.exportState().grants.length,1);assert.equal(f.s.serviceCreates,0);await assert.rejects(f.owner.activateOriginalCommittedFunding(f.observer));assert.equal(f.stats.activates,1);assert.equal(f.s.paid,1);});
check('original-activation-foreign-result-grant-is-rejected-before-service-admission',async()=>{const f=await funded({activate(base,owner,s,result){const r=clone(result());r.grant.transactionId='zenontx:'+'f'.repeat(64);return Promise.resolve(r);}});await held(f);assert.equal(f.stats.admits,0);assert.equal(f.s.serviceCreates,0);});
check('original-activation-close-during-target-await-cannot-admit-a-late-grant',async()=>{const p=deferred(),f=await funded({activate:()=>p.promise}),work=f.owner.activateOriginalCommittedFunding(f.observer);await flush();await assert.rejects(f.owner.close());p.resolve(f.result());await assert.rejects(work);assert.equal(f.stats.admits,0);assert.equal(f.s.serviceCreates,0);assert.equal(f.stats.closeCalls,1);assert.equal(f.owner.snapshot().held,true);});
check('original-activation-row-drift-after-grant-commit-preserves-held-and-blocks-admission',async()=>{const f=await funded({activate(base,owner,s,result){const r=result();s.rows=[];return Promise.resolve(r);}});await held(f);assert.equal(f.m.model.exportState().grants.length,1);assert.equal(f.stats.admits,0);});
check('original-activation-lost-admission-receipt-never-repeats-activation',async()=>{const f=await funded({admit(base,owner,s,id){base.s.root.admitCommittedServiceGrant(id);throw Error('declared admit receipt');}});await held(f);assert.equal(f.s.serviceCreates,1);assert.equal(f.s.root.snapshot().phase,'CLOSED');await assert.rejects(f.owner.activateOriginalCommittedFunding(f.observer));assert.equal(f.stats.activates,1);});
check('original-activation-manual-committed-grant-path-keeps-its-existing-contract',async()=>{const f=await funded(),grant=f.m.activate(),r=f.owner.admitCommittedServiceGrant(grant.grantId);assert.equal(r.status,'ADMITTED');assert.equal(f.stats.activates,0);assert.equal((await f.owner.activateOriginalCommittedFunding(f.observer)).status,'NOT_READY');await f.owner.close();});
check('original-activation-normal-close-shares-the-same-provider-close-receipt',async()=>{const f=await funded();await f.owner.activateOriginalCommittedFunding(f.observer);const a=f.owner.close(),b=f.owner.close();assert.equal(a,b);await a;assert.equal(f.stats.closeCalls,1);assert.equal(f.s.storeCloses,0);assert.equal(f.owner.snapshot().observerStore,'BORROWED_NOT_CLOSED');});
check('original-activation-actual-controller-and-ledger-cover-one-funding-one-grant-100-calls-and-exact-replay',async()=>{const f=await funded(),r=await f.owner.activateOriginalCommittedFunding(f.observer);
 for(let i=0;i<100;i++){const req=serviceRequest();req.declaredRequestId='request.'+i;const x=f.send(req);await flush();assert.equal(x.response.statusCode,200);}
 const req=serviceRequest();req.declaredRequestId='request.0';const replay=f.send(req);await flush();assert.equal(replay.response.statusCode,200);
 assert.equal(f.s.paid,1);assert.equal(f.stats.activates,1);assert.equal(f.m.model.exportState().grants.length,1);assert.equal(f.stats.debits,100);assert.equal(f.stats.executions,100);assert.equal(f.m.model.getGrant(r.grantId).availableUnits,0);await f.owner.close();});

export const issuedOriginalActivationDataCases=F([...checks]);
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];let current=null,reported=false;
 function report(){if(reported)return;reported=true;const failed=cases.filter(c=>c.status==='FAIL').length;console.log(JSON.stringify({qualification:'G1_ISSUED_ORIGINAL_FUNDING_ACTIVATION_DATA',passed:cases.length-failed,failed,cases,
  actualActivationOwnerProviderControllerAndReferenceLedger:true,observerActivationStoreListenerAndServicePorts:'DECLARED_DATA_ONLY',activationMetadata:'UNAUTHENTICATED_TRUSTED_RECORD_DATA',model100Calls:true,nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
  nativeActivationAuthentication:'NOT_ESTABLISHED',native100Calls:'NOT_ESTABLISHED',freshProcess:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;}
 function unsettled(){if(current!==null){cases.push({id:current,status:'FAIL',error:'UNSETTLED_DECLARED_DATA_PROMISE'});report();}}
 process.once('beforeExit',unsettled);for(const {id,run}of checks){current=id;try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});}current=null;}
 process.off('beforeExit',unsettled);report();
}
