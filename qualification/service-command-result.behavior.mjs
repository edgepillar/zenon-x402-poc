// Actual command/result codecs and one declared-memory product composition.
// Provider activation, proofs, files, SQL and native children remain DATA ports.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { captureApiCreditServiceCommand as capture, captureApiCreditServiceReplayCommand as replay,
  decodeApiCreditServiceCommandResult as decode } from '../src/api-credit-service-command.js';
import { encodeBuyerApiCreditCommandResult as encode } from '../src/buyer-original-funding-command.js';
import { canonicalJson } from '../src/canonical.js';
import { createProviderWireRouteFixture } from './provider-wire-route.behavior.mjs';
import { recordedResultFixture } from './api-credit-recorded-result.fixture.mjs';

const F=Object.freeze,checks=[];
const check=(id,run)=>checks.push({id,run});
function fixture(){
 const provider=createProviderWireRouteFixture(),wire=provider.wire('request.0');
 const command=capture({id:'command.0',serviceResourceUrl:provider.serviceUrl,...wire,maxLineBytes:262144});
 const result=F({apiCreditServiceResultVersion:1,grantId:command.command.input.grantId,requestId:command.command.input.requestId,
  responseJson:JSON.stringify({ok:true,resultCode:'result.original'}),resultCode:'result.original',replayed:false,
  source:'LOCAL_RECORDED_RESPONSE',newDispatchRequested:true,authority:'NONE',serviceDelivery:'NOT_ESTABLISHED'});
 return{provider,wire,command,result,line:encode(command.command,result,262144)};
}
function edit(r,change){const parsed=JSON.parse(r.line);change(parsed);return canonicalJson(parsed)+'\n';}
function refuse(change){const r=fixture(),before=JSON.stringify(r.provider.model.exportState());assert.throws(()=>decode(r.command,change(r)),/API_CREDIT_SERVICE_COMMAND/);
 assert.equal(JSON.stringify(r.provider.model.exportState()),before);assert.equal(r.provider.executions,0);}
check('command-result-exact-rich-reply-returns-frozen-none-authority-data',()=>{
 const r=fixture(),out=decode(r.command,r.line);assert.deepEqual(out,r.result);assert.equal(Object.isFrozen(out),true);
 assert.equal(out.responseJson,r.result.responseJson);assert.equal(out.authority,'NONE');assert.equal(r.provider.executions,0);
});
check('command-result-other-correlation-id-is-refused',()=>{refuse(r=>edit(r,v=>{v.id='command.other';}));});
check('command-result-other-request-under-the-same-grant-is-refused',()=>{refuse(r=>edit(r,v=>{v.result.requestId='request.other';}));});
check('command-result-other-grant-is-refused',()=>{refuse(r=>edit(r,v=>{v.result.grantId='grant.other';}));});
check('command-result-other-operation-is-refused',()=>{refuse(r=>edit(r,v=>{v.operation='submitFunding';}));});
check('command-result-other-wire-version-is-refused',()=>{refuse(r=>edit(r,v=>{v.version=2;}));});
check('command-result-other-outcome-is-refused',()=>{refuse(r=>edit(r,v=>{v.outcome='DELIVERED';}));});
check('command-result-extra-envelope-authority-is-refused',()=>{refuse(r=>edit(r,v=>{v.authority='DISPATCH';}));});
check('command-result-extra-result-authority-is-refused',()=>{refuse(r=>edit(r,v=>{v.result.mayDispatchService=true;}));});
check('command-result-none-authority-cannot-be-upgraded',()=>{refuse(r=>edit(r,v=>{v.result.authority='CURRENT';}));});
check('command-result-delivery-cannot-be-upgraded',()=>{refuse(r=>edit(r,v=>{v.result.serviceDelivery='CONFIRMED';}));});
check('command-result-replay-and-new-dispatch-flags-must-agree',()=>{refuse(r=>edit(r,v=>{v.result.replayed=true;}));});
check('command-result-missing-result-is-refused',()=>{refuse(r=>edit(r,v=>{delete v.result;}));});
check('command-result-response-and-result-code-must-agree',()=>{refuse(r=>edit(r,v=>{v.result.responseJson='{"ok":true,"resultCode":"other.result"}';}));});
check('command-result-noncanonical-json-is-refused',()=>{refuse(r=>' '+r.line);});
check('command-result-duplicate-envelope-keys-are-refused',()=>{
 refuse(r=>'{"id":"command.other",'+r.line.slice(1));
});
check('command-result-exactly-one-complete-line-is-required',()=>{
 for(const change of[r=>r.line.slice(0,-1),r=>r.line+'\n',r=>r.line.replace(/\n$/,'\r\n'),r=>r.line+r.line])refuse(change);
});
check('command-result-captured-byte-budget-and-utf8-are-enforced',()=>{
 refuse(r=>' '.repeat(262145)+r.line);refuse(r=>'\ud800'+r.line);
});
check('command-result-only-genuine-captures-select-the-original-and-budget',()=>{
 const r=fixture();let hooks=0;
 for(const fake of[{...r.command},JSON.parse(JSON.stringify(r.command)),F({command:r.command.command,line:r.command.line}),
  new Proxy(r.command,{get(){hooks++;throw Error('unselected');},getPrototypeOf(){hooks++;throw Error('unselected');}})]){
  assert.throws(()=>decode(fake,r.line));
 }
 assert.equal(hooks,0);assert.equal(r.provider.executions,0);
});
check('command-result-original-reply-cannot-be-rebound-to-the-replay-command',()=>{
 const r=fixture(),again=replay(r.command,'command.replay');assert.throws(()=>decode(again,r.line));
 const result=F({...r.result,replayed:true,newDispatchRequested:false}),line=encode(again.command,result,262144);
 assert.deepEqual(decode(again,line),result);assert.throws(()=>decode(r.command,line));
 assert.equal(again.command.input,r.command.command.input);
});
check('command-result-capture-input-edits-do-not-change-reply-selection',()=>{
 const r=fixture(),copy={id:'stable',serviceResourceUrl:r.provider.serviceUrl,...r.wire,maxLineBytes:262144},c=capture(copy);
 const line=encode(c.command,r.result,262144);copy.id='other';copy.maxLineBytes=256;copy.authorizationHeader='changed';
 assert.deepEqual(decode(c,line),r.result);assert.equal(c.command.id,'stable');
});
check('command-result-legacy-void-callback-is-not-a-recorded-service-result',()=>{
 const r=fixture();assert.throws(()=>decode(r.command,encode(r.command.command,undefined,262144)));
});
check('command-result-one-funding-100-product-replies-and-exact-replay-preserve-counters',async()=>{
 const r=recordedResultFixture({requestBudget:100});await r.start();let first,firstResult;
 try{
  for(let i=0;i<100;i++){
   const input=r.request('request.'+i),c=capture({id:'command.'+i,serviceResourceUrl:input.serviceResourceUrl,
    originalRequestJson:input.originalRequestJson,authorizationHeader:input.authorizationHeader,maxLineBytes:262144});
   const out=await r.root.submitOriginal(c.command.input),decoded=decode(c,encode(c.command,out,262144));
   assert.deepEqual(decoded,out);assert.equal(decoded.replayed,false);assert.equal(decoded.requestId,input.requestId);
   if(i===0){first=c;firstResult=decoded;}
  }
  const before=JSON.stringify(r.h.model.exportState()),payment=r.h.raw(),again=replay(first,'command.replay');
  const result=await r.root.submitOriginal(again.command.input),decoded=decode(again,encode(again.command,result,262144));
  assert.equal(decoded.responseJson,firstResult.responseJson);assert.equal(decoded.replayed,true);assert.equal(decoded.newDispatchRequested,false);
  assert.equal(JSON.stringify(r.h.model.exportState()),before);assert.equal(r.h.raw(),payment);
  assert.deepEqual([r.h.counts.funding,r.h.counts.grants,r.submissions,r.reserves,r.begins,r.completes],[1,1,100,100,100,100]);
 }finally{await r.cleanup();}
});
check('command-result-unknown-observation-is-not-converted-to-a-service-result',()=>{
 refuse(r=>edit(r,v=>{v.result={status:'OUTCOME_UNKNOWN',authority:'NONE',serviceDelivery:'NOT_ESTABLISHED'};}));
});
check('command-result-json-depth-and-node-budgets-are-bounded',()=>{
 refuse(r=>edit(r,v=>{let nested=null;for(let i=0;i<20;i++)nested=[nested];v.result.extra=nested;}));
 refuse(r=>edit(r,v=>{v.result.extra=Array(5000).fill(null);}));
});
check('command-result-non-string-input-never-enters-serialization-hooks',()=>{
 const r=fixture();let hooks=0;const raw={toString(){hooks++;throw Error('unselected');},toJSON(){hooks++;throw Error('unselected');}};
 assert.throws(()=>decode(r.command,raw));assert.throws(()=>decode(r.command,new Proxy(raw,{get(){hooks++;throw Error('unselected');}})));
 assert.equal(hooks,0);
});
check('command-result-repeated-decoding-never-runs-the-provider-or-mutates-commands',()=>{
 const r=fixture(),before=JSON.stringify(r.provider.model.exportState()),line=r.command.line;
 assert.deepEqual(decode(r.command,r.line),decode(r.command,r.line));assert.equal(r.command.line,line);
 assert.equal(JSON.stringify(r.provider.model.exportState()),before);assert.equal(r.provider.executions,0);
});

export const serviceCommandResultDataCases=F(checks.map(c=>F(c)));
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
 const failed=cases.filter(c=>c.status!=='PASS').length;
 console.log(JSON.stringify({qualification:'G1_API_CREDIT_SERVICE_COMMAND_RESULT_DATA',passed:cases.length-failed,failed,cases,
  actualCommandAndResultCodecs:true,declaredMemoryProductFileSqlFundingProofAndNativePortsOnly:true,
  nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
  nativeReopen:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED',G0G5Acceptance:'OPEN'}));
 if(failed)process.exitCode=1;
}
