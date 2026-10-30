// Actual product/operator/command gates; history, funding, grant and native
// children are declared memory ports. No native transport or crypto execution.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { apiCreditRecordedResultDataCases } from './api-credit-recorded-result.behavior.mjs';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { apiCreditApplicationDataFixtures as applications } from './api-credit-application.behavior.mjs';
import { recordedResultFixture as fixture } from './api-credit-recorded-result.fixture.mjs';
import { captureSdk105ApiCreditProductOperatorData as operatorData,
  captureSdk105ApiCreditProductSelection as select,
  consumeSdk105ApiCreditProductSelection as consume } from '../src/zenon/sdk105-api-credit-product-profile.js';
import { decodeApiCreditOperatorBootstrap as bootstrap } from '../src/api-credit-operator-bootstrap.js';
import { canonicalJson } from '../src/canonical.js';
import { encodeBuyerOriginalFundingCommand as commandLine } from '../src/buyer-original-funding-command.js';
import { createBuyerApiCreditCommandLineChannel as channel } from '../src/buyer-command-line-channel.js';
import { createBuyerApiCreditFundingCommandSession as session } from '../src/buyer-original-funding-command-session.js';

const F=Object.freeze,checks=[...apiCreditRecordedResultDataCases];
function check(id,run){checks.push({id,run});}
function selectedInput(){
 const r=applications.capturedConfiguration(),c=r.input.configuration,{official,...service}=c.serviceOptions;
 c.serviceOptions={...service,assetInfo:official.assetInfo,contextLimit:official.contextLimit};
 r.input.productProfileVersion=2;r.input.paymentRequiredHeader=r.h.f.input.challenge.paymentRequiredHeader;
 r.input.purchaseExpectationJson=r.h.f.purchaseExpectationJson;
 c.storeOptions.custodyPolicy.maxRequests=100;c.serviceOptions.transportOptions.maxRequestStarts=100;
 return r;
}
function publicInput(r){
 const c=r.input.configuration,{keyPair,...funding}=c.fundingOptions;
 return{...r.input,configuration:{...c,fundingOptions:funding},spending:{paymentId:r.input.spending.paymentId}};
}
async function close(r){await r.h.root.close();r.h.input.destroy();r.h.output.destroy();}
const command=(id,operation,input={})=>({version:1,id,operation,input});

check('exact-budget-keyed-product-captures-100-custody-and-service-starts-with-a-separate-single-funding-post',async()=>{
 const r=selectedInput(),s=select(r.input),picked=consume(s),c=picked.selection.configuration;
 assert.equal(c.storeOptions.custodyPolicy.maxRequests,100);assert.equal(c.serviceOptions.transportOptions.maxRequestStarts,100);
 assert.equal(c.fundingOptions.fundingTransportOptions.maxRequestStarts,1);assert.equal(c.serviceOptions.transportOptions.maxConcurrentRequests,1);
 assert.equal(r.keyCalls+r.clockCalls,0);s.release();await close(r);
});
check('exact-budget-keyless-operator-admission-preserves-the-same-independent-request-budgets',async()=>{
 const r=selectedInput(),v=operatorData(publicInput(r));
 assert.equal(v.configuration.storeOptions.custodyPolicy.maxRequests,100);assert.equal(v.configuration.serviceOptions.transportOptions.maxRequestStarts,100);
 assert.equal(v.configuration.fundingOptions.fundingTransportOptions.maxRequestStarts,1);assert.equal(r.keyCalls+r.clockCalls,0);await close(r);
});
check('exact-budget-real-keyless-bootstrap-admits-100-starts-and-the-106-command-stream',async()=>{
 const r=selectedInput(),p=publicInput(r),{ca:fc,...funding}=p.configuration.fundingOptions.fundingTransportOptions;
 const {ca:sc,...service}=p.configuration.serviceOptions.transportOptions;
 const raw={operatorBootstrapVersion:2,...p,publicCaPem:'-----BEGIN CERTIFICATE-----\nU1lOVEhFVElDLURBVEE=\n-----END CERTIFICATE-----\n',
  configuration:{...p.configuration,fundingOptions:{...p.configuration.fundingOptions,fundingTransportOptions:funding},
   serviceOptions:{...p.configuration.serviceOptions,transportOptions:service}},limits:{maxCommands:106}};
 const admitted=bootstrap(canonicalJson(raw));assert.equal(admitted.limits.maxCommands,106);assert.equal(admitted.product.nativeAcceptance,'NOT_ESTABLISHED');
 assert.equal(r.keyCalls+r.clockCalls,0);admitted.release();await close(r);
});
check('exact-budget-below-100-and-all-existing-upper-coupling-funding-and-concurrency-bounds-still-refuse',async()=>{
 const edits=[c=>{c.serviceOptions.transportOptions.maxRequestStarts=99;},c=>{c.storeOptions.custodyPolicy.maxRequests=99;c.serviceOptions.transportOptions.maxRequestStarts=99;},
  c=>{c.serviceOptions.transportOptions.maxRequestStarts=101;},c=>{c.storeOptions.custodyPolicy.maxRequests=1024;c.serviceOptions.transportOptions.maxRequestStarts=257;},
  c=>{c.fundingOptions.fundingTransportOptions.maxRequestStarts=2;},c=>{c.serviceOptions.transportOptions.maxConcurrentRequests=2;}];
 for(const edit of edits){const r=selectedInput();edit(r.input.configuration);assert.throws(()=>operatorData(publicInput(r)));assert.equal(r.keyCalls+r.clockCalls,0);await close(r);}
});
check('exact-budget-selection-detaches-the-100-limits-from-later-operator-input-mutation',async()=>{
 const r=selectedInput(),s=select(r.input);r.input.configuration.storeOptions.custodyPolicy.maxRequests=1024;r.input.configuration.serviceOptions.transportOptions.maxRequestStarts=256;
 assert.equal(s.configuration.storeOptions.custodyPolicy.maxRequests,100);assert.equal(s.configuration.serviceOptions.transportOptions.maxRequestStarts,100);
 assert.equal(s.configuration.fundingOptions.fundingTransportOptions.maxRequestStarts,1);assert.equal(r.keyCalls+r.clockCalls,0);s.release();await close(r);
});
check('exact-budget-100-distinct-results-exhaust-one-model-grant-and-replay-never-reenters-the-declared-native-child',async()=>{
 const r=fixture({requestBudget:100});await r.start();
 assert.equal(r.selection.configuration.storeOptions.custodyPolicy.maxRequests,100);assert.equal(r.selection.configuration.serviceOptions.transportOptions.maxRequestStarts,100);
 for(let i=0;i<100;i++){const v=await r.root.submitOriginal(r.request('item.'+i));assert.equal(v.replayed,false);assert.equal(v.resultCode,'api.item.'+i);}
 const before=JSON.stringify(r.h.model.exportState()),first=r.records.get('item.0').responseObservation.responseJson;
 r.onSubmit=()=>{throw Error('exhausted declared child must not be entered by replay');};
 const replay=await r.root.submitOriginal(r.request('item.0'));assert.equal(replay.replayed,true);assert.equal(replay.responseJson,first);
 assert.equal(JSON.stringify(r.h.model.exportState()),before);assert.deepEqual([r.submissions,r.reserves,r.begins,r.completes],[100,100,100,100]);
 const grant=r.h.model.getGrant(r.h.grant.grantId);assert.deepEqual([grant.availableUnits,grant.heldUnits,grant.consumedUnits],[0,0,100]);
 assert.equal(r.h.counts.funding,1);assert.equal(r.h.counts.grants,1);await r.cleanup();
});
check('exact-budget-actual-command-host-returns-100-results-and-one-replay-in-106-commands',async()=>{
 const r=fixture({requestBudget:100}),h=r.h;h.owner=session({client:r.root,channel:channel({input:h.input,output:h.output,limits:{maxCommands:106}}),limits:{maxCommands:106}});
 const run=h.startFunding(()=>{const rows=[];for(let i=0;i<100;i++)rows.push(command('service.'+i,'submitService',r.request('item.'+i)));
  rows.push(command('replay','submitService',r.request('item.0')),command('close','close'));h.input.write(rows.map(c=>commandLine(c)).join(''));});
 const outcome=await run;assert.equal(outcome.status,'CLOSED');assert.equal(outcome.exitCode,0);assert.equal(h.owner.inspect().commands,106);
 const values=h.replies.filter(v=>v.operation==='submitService');assert.equal(values.length,101);assert.equal(values[100].result.replayed,true);
 assert.equal(values[0].result.responseJson,values[100].result.responseJson);assert.equal(r.submissions,100);assert.equal(h.counts.funding,1);assert.equal(h.counts.grants,1);await r.cleanup();
});
check('exact-budget-lost-100th-callback-keeps-the-last-unit-held-and-blocks-even-a-previous-replay',async()=>{
 const r=fixture({requestBudget:100});await r.start();for(let i=0;i<99;i++)await r.root.submitOriginal(r.request('item.'+i));
 r.onSubmit=()=>{throw Error('declared last response lost');};await assert.rejects(r.root.submitOriginal(r.request('item.99')));
 const counts=[r.reads,r.submissions,r.reserves,r.begins,r.completes];await assert.rejects(r.root.submitOriginal(r.request('item.0')));
 assert.deepEqual([r.reads,r.submissions,r.reserves,r.begins,r.completes],counts);assert.equal(r.root.inspect().recordedServiceResults.held,true);
 const grant=r.h.model.getGrant(r.h.grant.grantId);assert.deepEqual([grant.availableUnits,grant.heldUnits,grant.consumedUnits],[0,1,99]);
 assert.equal(r.h.counts.funding,1);assert.equal(r.h.counts.grants,1);await r.cleanup();
});
check('exact-budget-a-101st-distinct-model-request-cannot-consume-more-or-start-another-funding',async()=>{
 const r=fixture({requestBudget:100});await r.start();for(let i=0;i<100;i++)await r.root.submitOriginal(r.request('item.'+i));
 const before=JSON.stringify(r.h.model.exportState());await assert.rejects(r.root.submitOriginal(r.request('item.100')));
 assert.equal(JSON.stringify(r.h.model.exportState()),before);assert.equal(r.completes,100);assert.equal(r.h.counts.funding,1);assert.equal(r.h.counts.grants,1);await r.cleanup();
});

const cases=[];for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
await closeApiCreditOperatorDataFixtures();const failed=cases.filter(c=>c.status!=='PASS').length;
console.log(JSON.stringify({qualification:'G1_EXACT_REQUEST_BUDGET_DATA',passed:cases.length-failed,failed,cases,priorCases:apiCreditRecordedResultDataCases.length,
 actualApplicationCommandAndReferenceModel:true,declaredFileHistoryFundingGrantAndNativeChildPortsOnly:true,referenceRequestsInHundredCallScenario:100,referenceExecutionsInHundredCallScenario:100,
 fundingPostBudget:1,serviceRequestBudget:100,serviceCustodyBudget:100,commandBudget:106,referenceMockGrantActivationOnly:true,
 nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
 nativeAdaptersExecuted:false,freshProcessAcceptance:'NOT_ESTABLISHED',nativeHundredCallAcceptance:'NOT_ESTABLISHED',authenticatedGrantAcceptance:'NOT_ESTABLISHED',fullG1:'NOT_ESTABLISHED'}));
if(failed)process.exitCode=1;
