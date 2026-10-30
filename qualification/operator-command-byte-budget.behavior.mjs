import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { apiCreditOperatorDataFixtures as operators, closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { recordedResultFixture } from './api-credit-recorded-result.fixture.mjs';
import { canonicalJson } from '../src/canonical.js';
import { captureApiCreditOperatorCommandByteFloor as floor, decodeApiCreditOperatorBootstrap as decode } from '../src/api-credit-operator-bootstrap.js';
import { captureBuyerOriginalFundingCommandLimits as legacyLimits, encodeBuyerApiCreditCommand as encode } from '../src/buyer-original-funding-command.js';
import { createBuyerApiCreditFundingCommandSession as session } from '../src/buyer-original-funding-command-session.js';
import { createBuyerApiCreditCommandLineChannel as channel } from '../src/buyer-command-line-channel.js';

// Actual bootstrap/coordinator, codecs, channel/session, product and reference
// ledger. Key, funding, grant, history, file and native ports are declared DATA.
const F=Object.freeze,checks=[];
const check=(id,run)=>checks.push({id,run});
const selectedFloor=d=>floor(d.paymentRequiredHeader,d.configuration.storeOptions.custodyPolicy.serviceResourceUrl);
function floorLimits(d){const b=selectedFloor(d);return{maxCommands:b.minimumCommands,maxLineBytes:b.minimumLineBytes,
 maxInputBytes:b.minimumInputBytes,maxOutputBytes:b.minimumOutputBytes,closeWaitMs:250};}
async function refused(edit){
 const r=operators.declaredOperator({edit:d=>{d.limits=floorLimits(d);edit(d.limits,selectedFloor(d));}}),v=await r.start();
 assert.equal(v.status,'BOOTSTRAP_REFUSED');assert.deepEqual(r.trace,['profile','inputs-close']);
 assert.equal(r.calls.key+r.calls.session+r.calls.host,0);assert.equal(r.calls.inputs,1);assert.ok(r.profile.every(b=>b===0));return{r,v};
}
check('operator-byte-budget-default-command-and-byte-caps-are-unchanged',()=>{
 const p=decode(canonicalJson(operators.publicData()));assert.deepEqual(p.limits,
  {maxCommands:128,maxLineBytes:262144,maxInputBytes:1048576,maxOutputBytes:1048576,closeWaitMs:250});p.release();
});
check('operator-byte-budget-floor-is-numeric-detached-and-does-not-expose-command-frames',()=>{
 const d=operators.publicData(),b=selectedFloor(d);assert.ok(Object.isFrozen(b));
 assert.equal(b.minimumCommands,106);assert.equal(b.distinctServiceRequests,100);assert.equal(b.exactReplays,1);assert.equal(b.lowerBoundOnly,true);
 for(const k of ['minimumLineBytes','minimumInputBytes','minimumOutputBytes'])assert.ok(Number.isSafeInteger(b[k])&&b[k]>256);
 for(const value of Object.values(b))assert.ok(typeof value==='number'||typeof value==='boolean');
 assert.equal(JSON.stringify(b).includes(d.paymentRequiredHeader),false);
});
check('operator-byte-budget-command-count-shortfall-is-refused-before-credentials',async()=>{await refused(l=>{l.maxCommands=105;});});
check('operator-byte-budget-line-shortfall-is-refused-before-credentials',async()=>{await refused((l,b)=>{l.maxLineBytes=b.minimumLineBytes-1;});});
check('operator-byte-budget-input-shortfall-is-refused-before-credentials',async()=>{await refused((l,b)=>{l.maxInputBytes=b.minimumInputBytes-1;});});
check('operator-byte-budget-output-shortfall-is-refused-before-credentials',async()=>{await refused((l,b)=>{l.maxOutputBytes=b.minimumOutputBytes-1;});});
check('operator-byte-budget-exact-floors-pass-keyless-admission-only',()=>{
 const d=operators.publicData();d.limits=floorLimits(d);const p=decode(canonicalJson(d));
 assert.deepEqual(p.limits,d.limits);assert.equal(p.product.nativeAcceptance,'NOT_ESTABLISHED');p.release();
});
check('operator-byte-budget-explicit-larger-caps-are-preserved-without-padding',()=>{
 const d=operators.publicData();d.limits={maxCommands:120,maxLineBytes:262144,maxInputBytes:2097152,maxOutputBytes:2097152,closeWaitMs:500};
 const p=decode(canonicalJson(d));assert.deepEqual(p.limits,d.limits);p.release();
});
check('operator-byte-budget-does-not-change-small-generic-command-selections',()=>{
 const l={maxCommands:1,maxLineBytes:256,maxInputBytes:256,maxOutputBytes:256,closeWaitMs:1};assert.deepEqual(legacyLimits(l),l);
});
check('operator-byte-budget-valid-coordinator-keeps-the-existing-acquisition-order',async()=>{
 const r=operators.declaredOperator(),v=await r.start();assert.equal(v.status,'CLOSED');
 assert.deepEqual(r.trace,['profile','credential','key','session','host','inputs-close']);
 assert.equal(r.selectedLimits.maxInputBytes,1048576);assert.equal(r.selectedLimits.maxOutputBytes,1048576);
 assert.equal(r.calls.key,1);assert.equal(r.calls.session,1);assert.equal(r.calls.host,1);
});
check('operator-byte-budget-selected-limits-drive-the-actual-100-call-and-replay-data-session',async()=>{
 const r=recordedResultFixture(),h=r.h;let actualLimits;
 const operator=operators.declaredOperator({
  edit:d=>{d.limits={maxCommands:106};},
  openSession:o=>{
   assert.equal(o.data.paymentRequiredHeader,h.f.input.challenge.paymentRequiredHeader);actualLimits=o.selectedLimits;
   o.selection.release();o.session=session({client:r.root,channel:channel({input:h.input,output:h.output,limits:actualLimits}),limits:actualLimits});
   h.owner=o.session;return Promise.resolve(o.session);
  },
  host:()=>h.startFunding(()=>{
   const c=[];for(let i=0;i<100;i++)c.push({version:1,id:'service.'+i,operation:'submitService',input:r.request('item.'+i)});
   c.push({version:1,id:'replay',operation:'submitService',input:r.request('item.0')},{version:1,id:'close',operation:'close',input:{}});
   h.input.write(c.map(v=>encode(v,actualLimits.maxLineBytes)).join(''));
  }),
 });
 try{
  const result=await operator.start();assert.equal(result.status,'CLOSED');assert.equal(result.exitCode,0);
  const values=h.replies.filter(v=>v.operation==='submitService');assert.equal(values.length,101);assert.equal(h.replies.length,105);
  assert.equal(values[0].result.responseJson,values[100].result.responseJson);assert.equal(values[100].result.replayed,true);
  assert.deepEqual([h.counts.funding,h.counts.grants,r.submissions,r.reserves,r.begins,r.completes],[1,1,100,100,100,100]);
  assert.equal(h.model.getGrant(h.grant.grantId).consumedUnits,100);assert.equal(operator.calls.key,1);assert.equal(operator.calls.session,1);
  assert.deepEqual(actualLimits,{maxCommands:106,maxLineBytes:262144,maxInputBytes:1048576,maxOutputBytes:1048576,closeWaitMs:250});
 }finally{await r.cleanup();}
});
check('operator-byte-budget-longer-fixed-header-is-charged-to-handoff-input-and-prepare-output',()=>{
 const d=operators.publicData(),a=selectedFloor(d),header=d.paymentRequiredHeader+'AAAA';
 const b=floor(header,d.configuration.storeOptions.custodyPolicy.serviceResourceUrl);
 assert.equal(b.minimumInputBytes-a.minimumInputBytes,4);assert.equal(b.minimumOutputBytes-a.minimumOutputBytes,4);
});
check('operator-byte-budget-service-resource-growth-is-charged-to-all-101-service-inputs',()=>{
 const d=operators.publicData(),u=d.configuration.storeOptions.custodyPolicy.serviceResourceUrl,a=floor(d.paymentRequiredHeader,u),b=floor(d.paymentRequiredHeader,u+'/abcd');
 assert.equal(b.minimumInputBytes-a.minimumInputBytes,101*5);assert.equal(b.minimumOutputBytes,a.minimumOutputBytes);
});
check('operator-byte-budget-refusal-exposes-only-sanitized-status',async()=>{
 const {r,v}=await refused((l,b)=>{l.maxOutputBytes=b.minimumOutputBytes-1;});const text=JSON.stringify(v);
 assert.equal(text.includes(r.data.paymentRequiredHeader),false);assert.equal(text.includes(r.data.configuration.storeOptions.databasePath),false);
 assert.equal(v.automaticRetry,false);assert.equal(v.sessionAccepted,false);
});
check('operator-byte-budget-wrong-arity-and-proxy-string-inputs-have-no-hooks',()=>{
 const d=operators.publicData(),u=d.configuration.storeOptions.custodyPolicy.serviceResourceUrl;let hooks=0;
 const p=new Proxy({},{get(){hooks++;throw Error('unselected');},getPrototypeOf(){hooks++;throw Error('unselected');}});
 for(const run of [()=>floor(),()=>floor(d.paymentRequiredHeader),()=>floor(d.paymentRequiredHeader,u,'extra'),()=>floor(p,u),()=>floor(d.paymentRequiredHeader,p)])assert.throws(run);
 assert.equal(hooks,0);
});
check('operator-byte-budget-invalid-utf8-is-refused-without-a-wire-plan',()=>{
 const d=operators.publicData(),u=d.configuration.storeOptions.custodyPolicy.serviceResourceUrl;
 assert.throws(()=>floor('\ud800',u));assert.throws(()=>floor(d.paymentRequiredHeader,'\ud800'));
});
check('operator-byte-budget-existing-header-hard-bound-is-not-enlarged',()=>{
 const d=operators.publicData(),u=d.configuration.storeOptions.custodyPolicy.serviceResourceUrl;
 assert.equal(floor('A'.repeat(5464),u).lowerBoundOnly,true);assert.throws(()=>floor('A'.repeat(5465),u));
});
check('operator-byte-budget-a-larger-command-count-cannot-compensate-for-insufficient-bytes',async()=>{
 await refused((l,b)=>{l.maxCommands=128;l.maxInputBytes=b.minimumInputBytes-1;});
});

export const operatorCommandByteBudgetDataCases=F(checks.map(c=>F(c)));
if(typeof process.argv[1]==='string'&&fileURLToPath(import.meta.url)===process.argv[1]){
 const cases=[];for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
 await closeApiCreditOperatorDataFixtures();const failed=cases.filter(c=>c.status!=='PASS').length;
 console.log(JSON.stringify({qualification:'G1_OPERATOR_COMMAND_BYTE_BUDGET_DATA',passed:cases.length-failed,failed,cases,
  actualBootstrapCoordinatorCodecChannelAndReferenceProduct:true,declaredCredentialFundingGrantHistoryAndNativePortsOnly:true,
  floorIsNecessaryNotSufficientForAcceptance:true,referenceServiceRequests:100,
  nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
  nativeAdaptersExecuted:false,nativeHundredCallAcceptance:'NOT_ESTABLISHED',fullG1:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;
}
