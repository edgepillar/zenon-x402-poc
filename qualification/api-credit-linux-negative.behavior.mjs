// Actual pure selection/sequence/reply code over declared memory handles.
// No native probe/transport, SDK/core/SQL/crypto verification or clock loads.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { createApiCreditLinuxProviderDataFixture } from './api-credit-linux-provider.fixture.mjs';
import { captureApiCreditNegativeAcceptanceSelection as capture,apiCreditNegativeAcceptancePlan as plan,
 apiCreditNegativeAcceptanceProviderSelection as provider,runApiCreditNegativeAcceptance as run } from './api-credit-linux-negative-contract.mjs';
import { collectApiCreditNegativeHttpReply as collect } from './api-credit-linux-negative-reply.mjs';
const F=Object.freeze,checks=[],EXPECTED='{"error":"unauthorized"}';let saved=null;
function check(id,fn){checks.push(F({id,fn}));}
async function fixture(){
 if(saved===null){
  const v=(await createApiCreditLinuxProviderDataFixture()).input,r=JSON.parse(v.runProfile),command=JSON.parse(v.commands.split('\n')[4]);
  r.operatorBootstrapVersion=3;r.productProfileVersion=3;r.loopbackRead={profile:'LOOPBACK_QUALIFICATION_V1',port:4444};
  const endpoint=path=>({route:{hostname:'localhost',ipv4Address:'127.0.0.1',path},timeoutMs:200,closeGraceMs:100});
  r.configuration.fundingOptions.readSessionOptions={endpoints:[endpoint('/rpc/first'),endpoint('/rpc/second')],accountEndpoint:endpoint('/rpc/account')};
  saved={...v,runProfile:canonicalJson(r),negativeProfile:canonicalJson({negativeAcceptanceVersion:1,foreignGrantId:'acceptance.foreign',changedRequestId:'acceptance.tampered',
   changedMaxCostUnits:JSON.parse(command.input.originalRequestJson).maxCostUnits+1})};
 }
 return {...saved};
}
function edit(v,name,fn){const x=JSON.parse(v[name]);fn(x);v[name]=canonicalJson(x);}
function proof(s){return JSON.parse(Buffer.from(s.slice('ServiceCredit '.length),'base64url').toString());}
function good(){return F({statusCode:401,body:EXPECTED,requestClosed:true,responseClosed:true,responseComplete:true,clientCloseReturned:true});}
function rawHeaders(){return ['Cache-Control','private, no-store, max-age=0','Content-Type','application/json','Vary','Authorization',
 'X-Content-Type-Options','nosniff','WWW-Authenticate','ServiceCredit','Content-Length',String(Buffer.byteLength(EXPECTED)),'Connection','close'];}
function memory(change=()=>{},action=null){
 const calls={requests:0,end:0,endArguments:null},request=new EventEmitter(),response=new EventEmitter();
 response.statusCode=401;response.rawHeaders=rawHeaders();response.complete=false;change(response);
 const requestImpl=F((url,options,reply)=>{
  calls.requests++;assert.equal(url,'https://127.0.0.1:4443/service-credit/v1/execute');assert.equal(options.method,'POST');
  assert.equal(options.agent,false);assert.equal(options.rejectUnauthorized,true);assert.deepEqual(Object.keys(options.headers),['Authorization']);
  request.end=F(function(){calls.end++;calls.endArguments=arguments.length;reply(response);
   if(action){action({request,response,reply});return;}
   response.emit('data',Buffer.from(EXPECTED));response.complete=true;response.emit('end');response.emit('close');request.emit('close');
  });return request;
 });
 return {request,response,calls,requestImpl};
}
function collected(m){return collect({resourceUrl:'https://127.0.0.1:4443/service-credit/v1/execute',authorizationHeader:'ServiceCredit ZGF0YQ',requestImpl:m.requestImpl});}

check('linux-negative-selection-retains-the-whole-v5-provider-and-v4-signer-bindings',async()=>{
 const t=capture(await fixture());assert.equal(t.summary.version,6);assert.equal(provider(t).summary.version,5);
 assert.equal(t.summary.providerSelectionDigest,provider(t).summary.selectionDigest);assert.equal(t.summary.signerSelectionDigest,provider(t).summary.signerSelectionDigest);
 assert.equal(t.summary.commandFrames,106);assert.equal(t.summary.distinctRequests,100);assert.equal(t.summary.exactReplays,1);assert.equal(Object.keys(t.summary.inputPins).length,11);
});
check('linux-negative-selection-adds-only-three-keyless-service-mutations-after-buyer-close',async()=>{
 const t=capture(await fixture());assert.deepEqual(t.summary.negativeRequestKinds,['FOREIGN_GRANT','CHANGED_REQUEST_ID','CHANGED_COST_CEILING']);
 assert.equal(t.summary.negativeProbeProcesses,1);assert.equal(t.summary.negativeRequestsAfterBuyerClose,true);assert.equal(t.summary.negativeRequestsBeforeProviderClose,true);
 assert.equal(t.summary.negativeRequestsCreateGrantOrFunding,false);assert.equal(t.summary.ledgerExpectedRequestsAfterNegatives,100);
});
check('linux-negative-mutations-preserve-the-original-signature-key-and-unselected-fields',async()=>{
 const input=await fixture(),original=JSON.parse(input.commands.split('\n')[4]).input,p=proof(original.authorizationHeader),r=JSON.parse(original.originalRequestJson),cases=plan(capture(input)).cases;
 for(let i=0;i<cases.length;i++){const c=cases[i],x=proof(c.authorizationHeader),y=JSON.parse(c.originalRequestJson),key=['grantId','requestId','maxCostUnits'][i];
  assert.deepEqual(Object.keys(x).filter(k=>x[k]!==p[k]),[key]);assert.deepEqual(Object.keys(y).filter(k=>y[k]!==r[k]),[key]);
  assert.equal(x.signature,p.signature);assert.equal(x.publicKey,p.publicKey);assert.equal(c.resourceUrl,original.serviceResourceUrl);assert.equal(c.expectedStatusCode,401);assert.equal(c.expectedBody,EXPECTED);
 }
});
check('linux-negative-plan-retains-the-same-explicit-ca-origin-and-selected-transport-bounds',async()=>{
 const input=await fixture(),r=JSON.parse(input.runProfile),p=plan(capture(input));assert.equal(p.origin,JSON.parse(input.providerProfile).transport.origin);
 assert.equal(p.publicCaPem,r.publicCaPem);for(const k of ['requestDeadlineMs','handshakeDeadlineMs','closeGraceMs'])assert.equal(p[k],r.configuration.serviceOptions.transportOptions[k]);
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.cases)&&p.cases.every(Object.isFrozen));
});
check('linux-negative-summary-binds-mutations-without-logging-proof-or-private-paths',async()=>{
 const t=capture(await fixture()),s=JSON.stringify(t.summary);assert.ok(Buffer.byteLength(s)<8192);for(const c of plan(t).cases)assert.equal(s.includes(c.authorizationHeader),false);
 assert.equal(s.includes('/synthetic/'),false);assert.equal(s.includes(EXPECTED),false);
});
check('linux-negative-profile-cannot-select-the-legacy-public-read-profile',async()=>{
 const input=await fixture();edit(input,'runProfile',r=>{r.operatorBootstrapVersion=2;r.productProfileVersion=2;delete r.loopbackRead;});assert.throws(()=>capture(input));
});
check('linux-negative-profile-is-closed-canonical-and-versioned',async()=>{
 for(const change of [p=>p.negativeAcceptanceVersion=2,p=>p.module='unselected',p=>delete p.changedRequestId]){const input=await fixture();edit(input,'negativeProfile',change);assert.throws(()=>capture(input));}
 const input=await fixture();input.negativeProfile+=' ';assert.throws(()=>capture(input));
});
check('linux-negative-grant-mutation-must-be-different-and-retain-valid-identity-grammar',async()=>{
 const input=await fixture(),grant=JSON.parse(input.commands.split('\n')[4]).input.grantId;
 for(const value of [grant,'','../foreign',null]){const v={...input};edit(v,'negativeProfile',p=>p.foreignGrantId=value);assert.throws(()=>capture(v));}
});
check('linux-negative-request-mutation-cannot-collide-with-any-original-request',async()=>{
 const input=await fixture(),commands=input.commands.trimEnd().split('\n').map(JSON.parse);
 for(const value of [commands[4].input.requestId,commands[103].input.requestId,'',null]){const v={...input};edit(v,'negativeProfile',p=>p.changedRequestId=value);assert.throws(()=>capture(v));}
});
check('linux-negative-cost-mutation-is-explicit-bounded-and-different',async()=>{
 const input=await fixture(),n=JSON.parse(JSON.parse(input.commands.split('\n')[4]).input.originalRequestJson).maxCostUnits;
 for(const value of [n,0,-1,1.5,1000001,'2']){const v={...input};edit(v,'negativeProfile',p=>p.changedMaxCostUnits=value);assert.throws(()=>capture(v));}
});
check('linux-negative-selection-refuses-to-raise-an-insufficient-provider-transport-budget',async()=>{
 for(const k of ['maxRequestStarts','maxConnectionStarts']){const input=await fixture();edit(input,'providerProfile',p=>p.transport.limits[k]=108);assert.throws(()=>capture(input));}
});
check('linux-negative-selection-cannot-replace-the-original-purchase-provider-or-activation',async()=>{
 for(const [name,change]of [['providerProfile',p=>p.offer.offerVersion++],['providerActivation',p=>p.argument.observerFileName='funding-observer-'+ 'f'.repeat(64)+'.sqlite']]){
  const input=await fixture();edit(input,name,change);assert.throws(()=>capture(input));
 }
});
check('linux-negative-selection-rejects-accessors-and-proxies-without-entering-hooks',async()=>{
 const input=await fixture();let hooks=0;Object.defineProperty(input,'negativeProfile',{enumerable:true,get(){hooks++;return '{}';}});assert.throws(()=>capture(input));
 assert.throws(()=>capture(new Proxy({},{ownKeys(){hooks++;return [];}})));assert.equal(hooks,0);
});
check('linux-negative-token-copies-proxies-and-extra-arguments-cannot-acquire-a-plan',async()=>{
 const t=capture(await fixture());assert.throws(()=>plan(F({...t})));assert.throws(()=>provider(F({...t})));assert.throws(()=>plan(new Proxy(t,{})));assert.throws(()=>plan(t,{}));
});
check('linux-negative-input-mutation-does-not-rebind-a-captured-plan',async()=>{
 const input=await fixture(),t=capture(input),old=plan(t);edit(input,'negativeProfile',p=>p.foreignGrantId='changed.foreign');assert.equal(plan(t),old);
 assert.notEqual(capture(input).summary.selectionDigest,t.summary.selectionDigest);
});
check('linux-negative-sequence-observes-three-exact-refusals-and-known-client-closes',async()=>{
 const t=capture(await fixture()),calls=[];const result=await run(t,F({exchange:F(async c=>{calls.push(c.kind);return good();})}));
 assert.deepEqual(calls,t.summary.negativeRequestKinds);assert.equal(result.status,'SERVICE_NEGATIVE_REPLIES_MATCHED');assert.equal(result.negativeRequests,3);
 assert.equal(result.selectionDigest,t.summary.selectionDigest);assert.ok(Buffer.byteLength(JSON.stringify(result))<=4096);
});
check('linux-negative-sequence-has-no-repeat-or-resume-after-success',async()=>{
 const t=capture(await fixture());let calls=0;const ports=F({exchange:F(async()=>{calls++;return good();})});await run(t,ports);await assert.rejects(run(t,ports));assert.equal(calls,3);
});
check('linux-negative-sequence-stops-on-an-opaque-reply-and-cannot-resume',async()=>{
 const t=capture(await fixture());let calls=0;const ports=F({exchange:F(async()=>{calls++;return undefined;})});await assert.rejects(run(t,ports));await assert.rejects(run(t,ports));assert.equal(calls,1);
});
check('linux-negative-sequence-stops-on-a-thrown-or-rejected-exchange',async()=>{
 for(const fn of [()=>{throw Error('declared');},async()=>{throw Error('declared');}]){const t=capture(await fixture());let calls=0;await assert.rejects(run(t,F({exchange:F((...v)=>{calls++;return fn(...v);})})));assert.equal(calls,1);}
});
check('linux-negative-sequence-requires-the-exact-401-and-body-not-any-error-response',async()=>{
 for(const change of [r=>r.statusCode=200,r=>r.statusCode=403,r=>r.statusCode=503,r=>r.body='{"ok":true}',r=>r.body=EXPECTED+' ']){
  const t=capture(await fixture());let calls=0;await assert.rejects(run(t,F({exchange:F(async()=>{calls++;const r={...good()};change(r);return F(r);})})));assert.equal(calls,1);
 }
});
check('linux-negative-sequence-requires-all-interface-close-and-completeness-observations',async()=>{
 for(const k of ['requestClosed','responseClosed','responseComplete','clientCloseReturned']){const t=capture(await fixture());let calls=0;
  await assert.rejects(run(t,F({exchange:F(async()=>{calls++;return F({...good(),[k]:false});})})));assert.equal(calls,1);}
});
check('linux-negative-sequence-refuses-bad-port-shapes-before-spending-the-token',async()=>{
 const t=capture(await fixture());await assert.rejects(run(t,F({exchange:async()=>good()})));let calls=0;
 await run(t,F({exchange:F(async()=>{calls++;return good();})}));assert.equal(calls,3);
});
check('linux-negative-sequence-reentry-cannot-create-a-fourth-request',async()=>{
 const t=capture(await fixture());let calls=0,ports;ports=F({exchange:F(async()=>{calls++;await assert.rejects(run(t,ports));return good();})});await run(t,ports);assert.equal(calls,3);
});
check('linux-negative-result-keeps-authentication-offer-payment-release-and-product-gates-open',async()=>{
 const result=await run(capture(await fixture()),F({exchange:F(async()=>good())}));
 assert.equal(result.authority,'NONE');assert.equal(result.mayDispatchFunding,false);assert.equal(result.additionalGrant,false);assert.equal(result.mayRetry,false);
 for(const k of ['physicalRelease','negativeServiceAcceptance','changedOfferAcceptance','differentPaymentIdentityAcceptance','G1Acceptance','G2Acceptance'])assert.equal(result[k],'NOT_ESTABLISHED');
});
check('linux-negative-http-collector-sends-one-selected-empty-post-and-never-a-body',async()=>{
 const m=memory(),r=await collected(m);assert.equal(m.calls.requests,1);assert.equal(m.calls.end,1);assert.equal(m.calls.endArguments,0);assert.deepEqual(r,{statusCode:401,body:EXPECTED,requestClosed:true,responseClosed:true,responseComplete:true});
});
check('linux-negative-http-collector-waits-for-both-close-events',async()=>{
 let handles;const m=memory(()=>{},h=>{handles=h;h.response.emit('data',Buffer.from(EXPECTED));h.response.complete=true;h.response.emit('end');});
 let returned=false;const p=collected(m).then(v=>{returned=true;return v;});await Promise.resolve();assert.equal(returned,false);
 handles.response.emit('close');await Promise.resolve();assert.equal(returned,false);handles.request.emit('close');await p;assert.equal(returned,true);
});
check('linux-negative-http-collector-accepts-bounded-split-body-and-case-insensitive-header-names',async()=>{
 const m=memory(r=>r.rawHeaders=r.rawHeaders.map((v,i)=>i%2?v:v.toLowerCase()),h=>{for(const b of Buffer.from(EXPECTED))h.response.emit('data',Buffer.from([b]));h.response.complete=true;h.response.emit('end');h.request.emit('close');h.response.emit('close');});await collected(m);
});
check('linux-negative-http-collector-refuses-any-success-or-unexpected-error-status',async()=>{
 for(const status of [200,400,403,404,409,503])await assert.rejects(collected(memory(r=>r.statusCode=status)));
});
check('linux-negative-http-collector-requires-exact-authentication-and-private-header-policy',async()=>{
 for(const name of ['cache-control','content-type','vary','x-content-type-options','www-authenticate','content-length']){
  await assert.rejects(collected(memory(r=>{const i=r.rawHeaders.findIndex((v,j)=>j%2===0&&v.toLowerCase()===name);r.rawHeaders[i+1]='changed';})));
 }
});
check('linux-negative-http-collector-refuses-duplicate-extra-or-non-close-connection-headers',async()=>{
 for(const change of [r=>r.rawHeaders.push('Content-Length',String(Buffer.byteLength(EXPECTED))),r=>r.rawHeaders.push('Set-Cookie','unselected'),r=>r.rawHeaders[r.rawHeaders.length-1]='keep-alive'])await assert.rejects(collected(memory(change)));
});
check('linux-negative-http-collector-refuses-changed-truncated-or-oversized-body',async()=>{
 for(const body of [EXPECTED+' ',EXPECTED.slice(0,-1),'{"ok":true}']){
  await assert.rejects(collected(memory(()=>{},h=>{h.response.emit('data',Buffer.from(body));h.response.complete=true;h.response.emit('end');h.response.emit('close');h.request.emit('close');})));
 }
});
check('linux-negative-http-collector-refuses-incomplete-end-early-close-and-bad-chunk-types',async()=>{
 for(const action of [h=>{h.response.emit('close');},h=>{h.response.emit('data',Buffer.from(EXPECTED));h.response.emit('end');},h=>h.response.emit('data',EXPECTED)])await assert.rejects(collected(memory(()=>{},action)));
});
check('linux-negative-http-collector-refuses-request-response-errors-and-abort',async()=>{
 for(const action of [h=>h.request.emit('error',Error('declared')),h=>h.response.emit('error',Error('declared')),h=>h.response.emit('aborted')])await assert.rejects(collected(memory(()=>{},action)));
});
check('linux-negative-http-collector-refuses-a-duplicate-response-before-completion',async()=>{
 await assert.rejects(collected(memory(()=>{},h=>{h.reply(h.response);h.response.emit('data',Buffer.from(EXPECTED));h.response.complete=true;h.response.emit('end');h.response.emit('close');h.request.emit('close');})));
});
check('linux-negative-http-collector-refuses-nonlocal-query-body-or-credential-bearing-targets',async()=>{
 for(const url of ['https://127.0.0.1/service-credit/v1/execute','https://127.0.0.1:1023/service-credit/v1/execute','https://example.invalid/service-credit/v1/execute','https://127.0.0.1:4443/service-credit/v1/execute?changed','https://user@127.0.0.1:4443/service-credit/v1/execute','https://127.0.0.1:4443/paid']){
  let calls=0;assert.throws(()=>collect({resourceUrl:url,authorizationHeader:'ServiceCredit ZGF0YQ',requestImpl:F(()=>{calls++;})}));assert.equal(calls,0);
 }
});
check('linux-negative-http-collector-refuses-extra-options-and-proxy-port-without-hooks',async()=>{
 let hooks=0;assert.throws(()=>collect(new Proxy({},{ownKeys(){hooks++;return [];}})));assert.equal(hooks,0);
 assert.throws(()=>collect({resourceUrl:'https://127.0.0.1:4443/service-credit/v1/execute',authorizationHeader:'ServiceCredit ZGF0YQ',requestImpl:F(()=>{}),body:'unselected'}));
});

export async function runApiCreditLinuxNegativeBehavior(){
 const cases=[];try{for(const {id,fn}of checks){try{await fn();cases.push({id,status:'PASS'});}catch{cases.push({id,status:'FAIL'});}}}
 finally{closeApiCreditOperatorDataFixtures();}
 return {qualification:'G1_LINUX_SERVICE_NEGATIVE_DATA',passed:cases.filter(c=>c.status==='PASS').length,failed:cases.filter(c=>c.status==='FAIL').length,cases,
  nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const r=await runApiCreditLinuxNegativeBehavior();process.stdout.write(JSON.stringify(r)+'\n');if(r.failed)process.exitCode=1;}
