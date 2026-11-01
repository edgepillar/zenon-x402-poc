import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { apiCreditStoreOwnerDataCases } from './api-credit-store-owner.behavior.mjs';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { recordedResultFixture as fixture,deferred } from './api-credit-recorded-result.fixture.mjs';
import { captureServiceCreditHttpExecuteOriginalInput as capture } from '../src/service-credit-http-execute-dispatch.js';
import { captureApiCreditRecordedServiceResult as result } from '../src/api-credit-recorded-service-result.js';
import { encodeBuyerOriginalFundingCommandResult as legacy,encodeBuyerApiCreditCommandResult as encode,
 encodeBuyerOriginalFundingCommand as commandLine } from '../src/buyer-original-funding-command.js';
import { createBuyerApiCreditFundingCommandSession as session } from '../src/buyer-original-funding-command-session.js';
import { createBuyerApiCreditCommandLineChannel as channel } from '../src/buyer-command-line-channel.js';
import { runBuyerOriginalCommandHost as host } from '../src/buyer-original-command-host.js';
import { recordedResultWireFixture } from './api-credit-recorded-result-wire.fixture.mjs';

const F=Object.freeze,checks=[...apiCreditStoreOwnerDataCases];function check(id,run){checks.push({id,run});}
const command=(id,operation,input={})=>({version:1,id,operation,input});
async function ready(options){const r=fixture(options);await r.start();return r;}
async function corrupt(edit){const r=await ready();const input=r.request();await r.root.submitOriginal(input);
 r.records.set(input.requestId,edit(r.records.get(input.requestId)));await assert.rejects(r.root.submitOriginal(input));assert.equal(r.submissions,1);assert.equal(r.root.inspect().recordedServiceResults.held,true);await r.cleanup();}
check('recorded-result-baseline-void-command-output-cannot-deliver-a-stored-api-response',async()=>{
 const r=await ready(),c=command('service','submitService',r.request()),out=JSON.parse(legacy(c,undefined));assert.equal(out.result.callbackCompleted,true);assert.equal(Object.hasOwn(out.result,'responseJson'),false);await r.cleanup();
});
check('recorded-result-preflight-reuses-the-real-request-auth-grammar-without-dispatch',async()=>{
 const r=await ready(),input=r.request(),v=capture({resourceUrl:input.serviceResourceUrl,originalRequestJson:input.originalRequestJson,authorizationHeader:input.authorizationHeader});
 assert.equal(v.grantId,input.grantId);assert.equal(v.requestId,input.requestId);assert.equal(Object.hasOwn(v,'authorizationHeader'),false);assert.equal(r.submissions+r.reads,0);await r.cleanup();
});
check('recorded-result-plain-data-cannot-select-a-factory-or-enter-getters',async()=>{
 const r=await ready();let hooks=0;const c={...r.request()};Object.defineProperty(c,'authorizationHeader',{enumerable:true,get(){hooks++;throw Error('unselected');}});
 await assert.rejects(r.root.submitOriginal(c));await assert.rejects(r.root.submitOriginal(new Proxy({},{ownKeys(){hooks++;return[];},getPrototypeOf(){hooks++;return Object.prototype;}})));
 assert.equal(hooks+r.reads+r.submissions,0);await r.cleanup();
});
check('recorded-result-first-call-returns-the-exact-current-recorded-response',async()=>{
 const r=await ready(),input=r.request(),v=await r.root.submitOriginal(input);assert.equal(v.responseJson,r.records.get(input.requestId).responseObservation.responseJson);
 assert.equal(v.resultCode,'api.request.1');assert.equal(v.replayed,false);assert.equal(v.newDispatchRequested,true);assert.equal(v.authority,'NONE');assert.equal(v.serviceDelivery,'NOT_ESTABLISHED');assert.equal(r.submissions,1);await r.cleanup();
});
check('recorded-result-exact-replay-never-enters-submission-reservation-or-execution-again',async()=>{
 const r=await ready(),input=r.request(),first=await r.root.submitOriginal(input),state=JSON.stringify(r.h.model.exportState()),raw=r.h.raw();
 const replay=await r.root.submitOriginal({...input});assert.equal(replay.responseJson,first.responseJson);assert.equal(replay.replayed,true);assert.equal(replay.newDispatchRequested,false);
 assert.deepEqual([r.submissions,r.reserves,r.begins,r.completes],[1,1,1,1]);assert.equal(JSON.stringify(r.h.model.exportState()),state);assert.equal(r.h.raw(),raw);await r.cleanup();
});
check('recorded-result-100-distinct-calls-and-replay-exhaust-one-reference-grant-once',async()=>{
 const r=await ready();for(let i=0;i<100;i++){const v=await r.root.submitOriginal(r.request('item.'+i));assert.equal(v.replayed,false);}
 const before=JSON.stringify(r.h.model.exportState()),v=await r.root.submitOriginal(r.request('item.0')),grant=r.h.model.getGrant(r.h.grant.grantId);
 assert.equal(v.replayed,true);assert.equal(grant.availableUnits,0);assert.equal(grant.heldUnits,0);assert.equal(grant.consumedUnits,100);
 assert.deepEqual([r.h.counts.funding,r.h.counts.grants,r.h.counts.handoffs,r.submissions,r.reserves,r.begins,r.completes],[1,1,1,100,100,100,100]);
 assert.equal(JSON.stringify(r.h.model.exportState()),before);await r.cleanup();
});
check('recorded-result-in-memory-reconstruction-keeps-an-exhausted-grant-replay-read-only',async()=>{
 const r=await ready();for(let i=0;i<100;i++)await r.root.submitOriginal(r.request('item.'+i));r.hydrate();const before=JSON.stringify(r.h.model.exportState());
 const rebuilt=r.bind(),v=await rebuilt.submitOriginal(r.request('item.99'));assert.equal(v.replayed,true);assert.equal(r.submissions,100);assert.equal(JSON.stringify(r.h.model.exportState()),before);await rebuilt.close();await r.cleanup();
});
check('recorded-result-101st-new-request-cannot-spend-more-reference-units',async()=>{
 const r=await ready();for(let i=0;i<100;i++)await r.root.submitOriginal(r.request('item.'+i));await assert.rejects(r.root.submitOriginal(r.request('item.100')));
 const grant=r.h.model.getGrant(r.h.grant.grantId);assert.equal(grant.consumedUnits,100);assert.equal(grant.availableUnits,0);assert.equal(r.completes,100);assert.equal(r.h.counts.grants,1);await r.cleanup();
});
check('recorded-result-actual-command-session-returns-100-results-and-the-original-replay',async()=>{
 const s=recordedResultWireFixture();try{
  const out=await s.start(),r=s.r,h=s.h;
  assert.equal(out.status,'CLOSED');assert.equal(out.exitCode,0);assert.equal(s.consumerError,null);
  assert.equal(s.rawReplies.length,101);assert.equal(s.decoded.length,101);assert.equal(s.serviceCommands.length,101);
  assert.equal(h.replies.length,105);assert.equal(h.owner.inspect().commands,106);assert.equal(s.closeSent,true);
  assert.equal(s.decoded[0].responseJson,s.decoded[100].responseJson);assert.equal(s.decoded[100].replayed,true);
  assert.equal(s.decoded[100].newDispatchRequested,false);assert.equal(s.serviceCommands[100].command.input,s.first.command.input);
  assert.equal(JSON.stringify(h.model.exportState()),s.beforeReplay);assert.equal(h.raw(),s.paymentBeforeReplay);
  assert.deepEqual([h.counts.funding,h.counts.grants,h.counts.handoffs,r.submissions,r.reserves,r.begins,r.completes],[1,1,1,100,100,100,100]);
  const grant=h.model.getGrant(h.grant.grantId);assert.deepEqual([grant.availableUnits,grant.heldUnits,grant.consumedUnits],[0,0,100]);
  assert.deepEqual([h.counts.stops,h.counts.walletStops],[1,1]);assert.equal(out.authority,'NONE');assert.equal(out.nativeResourceCleanup,'NOT_QUALIFIED');
 }finally{await s.cleanup();}
});
check('recorded-result-api-credit-codec-accepts-bounded-recorded-data-while-legacy-stays-void',async()=>{
 const r=await ready(),input=r.request(),v=await r.root.submitOriginal(input),c=command('service','submitService',input);
 assert.throws(()=>legacy(c,v));const out=JSON.parse(encode(c,v));assert.equal(out.result.responseJson,v.responseJson);assert.equal(out.result.authority,'NONE');await r.cleanup();
});
check('recorded-result-command-output-must-match-the-command-grant-and-request-key',async()=>{
 const r=await ready(),v=await r.root.submitOriginal(r.request());
 for(const input of [r.request('other'),r.request('request.1',{grantId:'grant.foreign'})])assert.throws(()=>encode(command('foreign-result','submitService',input),v));
 assert.equal(JSON.parse(encode(command('same-result','submitService',r.request()),v)).result.responseJson,v.responseJson);assert.equal(r.submissions,1);await r.cleanup();
});
check('recorded-result-a-foreign-grant-never-enters-the-submission-callback',async()=>{
 const r=await ready();await assert.rejects(r.root.submitOriginal(r.request('foreign',{grantId:'grant.foreign'})));assert.equal(r.submissions,0);await r.cleanup();
});
check('recorded-result-a-changed-original-cannot-reuse-or-poison-the-valid-result',async()=>{
 const r=await ready(),input=r.request();await r.root.submitOriginal(input);await assert.rejects(r.root.submitOriginal(r.request('request.1',{maxCostUnits:2})));
 assert.equal(r.root.inspect().recordedServiceResults.held,false);assert.equal((await r.root.submitOriginal(input)).replayed,true);assert.equal(r.submissions,1);await r.cleanup();
});
check('recorded-result-auth-metadata-must-match-before-history-is-read',async()=>{
 const r=await ready(),input=r.request();input.authorizationHeader=r.request('other').authorizationHeader;await assert.rejects(r.root.submitOriginal(input));assert.equal(r.reads+r.submissions,0);await r.cleanup();
});
check('recorded-result-authorization-is-never-in-the-result-or-recorded-controller-snapshot',async()=>{
 const r=await ready(),input=r.request(),v=await r.root.submitOriginal(input),text=JSON.stringify({v,view:r.root.inspect().recordedServiceResults});
 for(const word of [input.authorizationHeader,'DECLARED_INVALID_SIGNATURE_BYTES','DECLARED_PUBLIC_BYTES'])assert.equal(text.includes(word),false);await r.cleanup();
});
check('recorded-result-missing-observation-does-not-authorize-resend',async()=>{
 await corrupt(v=>F({...v,responseObservation:null,responseStatus:'NOT_OBSERVED'}));
});
check('recorded-result-missing-intent-does-not-authorize-resend',async()=>{
 await corrupt(v=>F({...v,dispatchIntent:null,dispatchStatus:'NO_INTENT_RECORDED'}));
});
check('recorded-result-unknown-custody-submission-or-drain-never-becomes-history-success',async()=>{
 for(const key of ['custody','submission','undrained','declaredFundingAmbiguitySeen'])await corrupt(v=>F({...v,uncertainty:F({...v.uncertainty,[key]:true})}));
});
check('recorded-result-foreign-funding-network-payment-or-revision-is-refused',async()=>{
 for(const [key,value]of [['network','zenon:foreign'],['fundingResourceUrl','https://foreign.example.test/funding'],['paymentHash','f'.repeat(64)],['fundingRevision',4]])
  await corrupt(v=>F({...v,responseObservation:F({...v.responseObservation,[key]:value})}));
});
check('recorded-result-noncanonical-or-conflicting-response-code-is-refused',async()=>{
 for(const edit of [v=>F({...v,responseJson:' {"ok":true,"resultCode":"x"}'}),v=>F({...v,resultCode:'different'}),v=>F({...v,responseJson:'{"ok":false,"resultCode":"x"}'})])
  await corrupt(v=>F({...v,responseObservation:edit(v.responseObservation)}));
});
check('recorded-result-a-lost-submission-callback-is-never-upgraded-by-a-later-history-read',async()=>{
 const r=await ready({onSubmit:()=>{throw Error('declared callback lost');}});await assert.rejects(r.root.submitOriginal(r.request()));const reads=r.reads;
 await assert.rejects(r.root.submitOriginal(r.request()));assert.equal(r.reads,reads);assert.equal(r.submissions,1);assert.equal(r.h.model.getGrant(r.h.grant.grantId).heldUnits,1);await r.cleanup();
});
check('recorded-result-async-reader-is-not-awaited-or-later-upgraded',async()=>{
 const late=deferred(),r=await ready({onRead:()=>late.promise});await assert.rejects(r.root.submitOriginal(r.request()));late.resolve(null);await Promise.resolve();
 await assert.rejects(r.root.submitOriginal(r.request()));assert.equal(r.submissions,0);assert.equal(r.reads,1);await r.cleanup();
});
check('recorded-result-rejected-reader-promise-is-drained-without-another-dispatch',async()=>{
 const r=await ready({onRead:()=>Promise.reject(Error('declared read refusal'))});await assert.rejects(r.root.submitOriginal(r.request()));await Promise.resolve();assert.equal(r.submissions,0);await r.cleanup();
});
check('recorded-result-reader-thenable-and-proxy-hooks-are-never-entered',async()=>{
 for(const proxy of [false,true]){let hooks=0;const v={};Object.defineProperty(v,'then',{get(){hooks++;throw Error('not selected');}});
  const value=proxy?new Proxy(v,{get(){hooks++;throw Error('not selected');},getPrototypeOf(){hooks++;throw Error('not selected');}}):v;
  const r=await ready({onRead:()=>value});await assert.rejects(r.root.submitOriginal(r.request()));assert.equal(hooks+r.submissions,0);await r.cleanup();}
});
check('recorded-result-close-during-history-read-prevents-a-late-replay-result',async()=>{
 const r=await ready(),input=r.request();await r.root.submitOriginal(input);let stop;r.onRead=v=>{stop=r.root.close();stop.catch(()=>{});return v;};
 await assert.rejects(r.root.submitOriginal(input));await stop.catch(()=>{});assert.equal(r.submissions,1);assert.equal(r.root.inspect().recordedServiceResults.held,true);await r.cleanup();
});
check('recorded-result-pending-submission-cannot-admit-a-concurrent-request',async()=>{
 const gate=deferred(),r=await ready({onSubmit:()=>gate.promise}),run=r.root.submitOriginal(r.request());run.catch(()=>{});
 await Promise.resolve();await assert.rejects(r.root.submitOriginal(r.request('other')));assert.equal(r.submissions,1);gate.resolve();await run;await r.cleanup();
});
check('recorded-result-close-joins-one-original-stop-and-does-not-publish-a-late-success',async()=>{
 const gate=deferred(),r=await ready({onSubmit:()=>gate.promise}),run=r.root.submitOriginal(r.request());run.catch(()=>{});await Promise.resolve();
 const stop=r.root.close();stop.catch(()=>{});assert.equal(r.root.close(),stop);gate.resolve();await assert.rejects(run);await assert.rejects(stop);assert.equal(r.h.counts.stops,1);await r.cleanup();
});
check('recorded-result-input-mutation-after-entry-cannot-change-the-retained-request',async()=>{
 const gate=deferred(),r=await ready({onSubmit:()=>gate.promise}),input=r.request(),run=r.root.submitOriginal(input);await Promise.resolve();input.requestId='other';input.originalRequestJson='invalid';gate.resolve();
 const v=await run;assert.equal(v.requestId,'request.1');assert.equal(r.records.has('other'),false);await r.cleanup();
});
check('recorded-result-validation-refuses-unfrozen-extra-authority-or-version-data',async()=>{
 const r=await ready(),v=await r.root.submitOriginal(r.request());assert.throws(()=>result({...v}));
 for(const changed of [{...v,apiCreditServiceResultVersion:2},{...v,authority:'EXECUTE'},{...v,newDispatchRequested:false},{...v,serviceDelivery:'CONFIRMED'},{...v,signature:'unselected'}])assert.throws(()=>result(F(changed)));
 await r.cleanup();
});
export const apiCreditRecordedResultDataCases=F(checks.map(c=>F(c)));
if(typeof process.argv[1]==='string'&&fileURLToPath(import.meta.url)===process.argv[1]){
const cases=[];for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
await closeApiCreditOperatorDataFixtures();const failed=cases.filter(c=>c.status!=='PASS').length;
console.log(JSON.stringify({qualification:'G1_RECORDED_SERVICE_RESULT_DATA',passed:cases.length-failed,failed,cases,priorCases:apiCreditStoreOwnerDataCases.length,
 actualApplicationCommandAndReferenceModel:true,declaredFileHistoryFundingGrantAndNativeChildPortsOnly:true,referenceRequestsInHundredCallScenario:100,referenceExecutionsInHundredCallScenario:100,
 nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
 nativeAdaptersExecuted:false,freshProcessAcceptance:'NOT_ESTABLISHED',nativeHundredCallAcceptance:'NOT_ESTABLISHED',authenticatedGrantAcceptance:'NOT_ESTABLISHED',fullG1:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;
}
