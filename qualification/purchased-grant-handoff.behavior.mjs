// Actual fixed-product, custody, query-owner and command controllers. All
// funding/grants/file/history/transport effects are declared memory ports.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { canonicalJson } from '../src/canonical.js';
import { captureServiceCreditOriginalFundingGrantQuery, createServiceCreditOriginalFundingGrantResult } from '../src/service-credit-original-funding-grant.js';
import { decodeApiCreditOriginalGrantQueryProfile, releaseApiCreditOriginalGrantQueryProfile } from '../src/api-credit-original-grant-query-profile.js';
import { captureApiCreditPurchasedGrantQuery, requireApiCreditPurchasedGrantHandoff } from '../src/api-credit-purchased-grant-handoff.js';
import { createApiCreditPurchasedGrantRecoveryApplication } from '../src/api-credit-funding-grant-recovery-application.js';
import { captureSdk105ApiCreditProductSelection } from '../src/zenon/sdk105-api-credit-product-profile.js';
import { apiCreditApplicationDataFixtures as applications } from './api-credit-application.behavior.mjs';
import { purchaseExpectationFixture } from './api-credit-purchase-expectation.fixture.mjs';
import { createBuyerApiCreditFundingCommandSession } from '../src/buyer-original-funding-command-session.js';
import { createBuyerApiCreditCommandLineChannel } from '../src/buyer-command-line-channel.js';
import { encodeBuyerApiCreditCommand } from '../src/buyer-original-funding-command.js';
import { runBuyerOriginalCommandHost } from '../src/buyer-original-command-host.js';
import { purchasedGrantHandoffFixture, frozenData, copy, deferred, flush } from './purchased-grant-handoff.fixture.mjs';

const F=Object.freeze,checks=[],owned=[];
function check(id,run){checks.push({id,run});}
function fixture(options={}){const f=purchasedGrantHandoffFixture(options);owned.push(f);return f;}
function state(f){return f.root.inspect().grantQueryRecovery.purchasedGrantHandoff;}
function profile(f,edit){const p=copy(f.d.profile);edit(p);return canonicalJson(p);}
function coherentIdentity(f,edit){return profile(f,p=>{
 edit(p.originalFunding);const q=captureServiceCreditOriginalFundingGrantQuery({queryVersion:1,requestId:p.query.requestId,originalFunding:p.originalFunding});
 p.query.expectedQueryDigest=q.request.canonicalBodyDigest;
});}
function productInput(){
 const r=applications.capturedConfiguration(),{official,...rest}=r.input.configuration.serviceOptions;
 r.input.configuration.serviceOptions={...rest,assetInfo:official.assetInfo,contextLimit:official.contextLimit};
 r.input.productProfileVersion=2;r.input.paymentRequiredHeader=r.h.f.input.challenge.paymentRequiredHeader;r.input.purchaseExpectationJson=r.h.f.purchaseExpectationJson;return r;
}
async function disposeProduct(r){await r.h.root.close();r.h.input.destroy();r.h.output.destroy();}
async function refusesHistory(edit){
 const f=fixture({history:(s,value)=>frozenData(edit(copy(value)))});await f.fund();const before=f.h.raw();await assert.rejects(f.handoff());
 assert.equal(f.handoffs,0);assert.equal(f.queries,1);assert.equal(f.queryReads,1);assert.equal(f.root.inspect().held,true);assert.equal(f.h.raw(),before);return f;
}

check('purchase-holder-must-match-the-existing-payer-before-key-or-clock-entry',async()=>{
 const r=productInput(),p=purchaseExpectationFixture(e=>{e.selection.holderId='holder.changed';});
 r.input.paymentRequiredHeader=p.paymentRequiredHeader;r.input.purchaseExpectationJson=p.purchaseExpectationJson;
 assert.throws(()=>captureSdk105ApiCreditProductSelection(r.input));assert.equal(r.keyCalls+r.clockCalls,0);await disposeProduct(r);
});
check('fixed-product-ca-must-fit-the-existing-ready-query-wire-bound-before-keys',async()=>{
 for(const bytes of [6144,6145]){const r=productInput(),ca=Buffer.alloc(bytes,80);
  r.input.configuration.fundingOptions.fundingTransportOptions.ca=ca;r.input.configuration.serviceOptions.transportOptions.ca=ca;
  if(bytes===6144)captureSdk105ApiCreditProductSelection(r.input).release();else assert.throws(()=>captureSdk105ApiCreditProductSelection(r.input));
  assert.equal(r.keyCalls+r.clockCalls,0);assert.ok(ca.every(v=>v===80));await disposeProduct(r);
 }
});
check('ready-query-is-purchase-bound-before-custody-checkpoint-commit-or-funding',async()=>{
 const f=fixture();await f.prepare();await f.commit();assert.equal(f.retains,1);assert.equal(f.queries,0);assert.equal(f.h.counts.funding,0);
 await f.submit();assert.equal(f.queries,0);assert.equal(f.h.counts.funding,1);assert.equal(state(f).fundingReturned,true);
});
check('coherent-foreign-offer-query-refuses-before-custody-or-any-funding-send',async()=>{
 const f=fixture(),text=coherentIdentity(f,q=>{q.offerId='offer.changed';});let token=decodeApiCreditOriginalGrantQueryProfile(text);releaseApiCreditOriginalGrantQueryProfile(token);
 await f.prepare();await assert.rejects(f.commit(text));assert.equal(f.retains,0);assert.equal(f.h.counts.funding,0);assert.equal(f.queries,0);
});
check('coherent-foreign-capability-query-refuses-before-custody-or-funding',async()=>{
 const f=fixture(),text=coherentIdentity(f,q=>{q.capabilityCommitment='sha256:'+'b'.repeat(64);});
 const token=decodeApiCreditOriginalGrantQueryProfile(text);releaseApiCreditOriginalGrantQueryProfile(token);
 await f.prepare();await assert.rejects(f.commit(text));assert.equal(f.retains,0);assert.equal(f.queries,0);assert.equal(f.h.counts.funding,0);
});
check('lookup-ca-cannot-differ-from-the-captured-product-trust-input-before-funding',async()=>{
 const f=fixture(),text=profile(f,p=>{p.transport.caBase64=Buffer.from('different public CA DATA').toString('base64');});
 await f.prepare();await assert.rejects(f.commit(text));assert.equal(f.retains,0);assert.equal(f.queries,0);assert.equal(f.h.counts.funding,0);
});
check('lookup-request-plus-close-budget-cannot-exceed-the-existing-product-deadline',async()=>{
 const f=fixture(),text=profile(f,p=>{p.transport.requestDeadlineMs=f.lookupPolicy.maxTotalMs;p.transport.handshakeDeadlineMs=1;p.transport.closeGraceMs=1;});
 await f.prepare();await assert.rejects(f.commit(text));assert.equal(f.retains,0);assert.equal(f.h.counts.funding,0);
});
check('a-prewrite-query-profile-refusal-can-be-corrected-without-another-prepare-or-funding',async()=>{
 const f=fixture();await f.prepare();await assert.rejects(f.commit(profile(f,p=>{p.transport.caBase64='eA==';})));
 await f.commit();await f.submit();assert.equal(f.retains,1);assert.equal(f.h.counts.prepares,1);assert.equal(f.h.counts.funding,1);assert.equal(f.queries,0);
});
check('handoff-before-bound-funding-cannot-open-a-query-or-enter-the-service-child',async()=>{
 const f=fixture();await f.prepare();await f.commit();await assert.rejects(f.handoff({}));assert.equal(f.queries+f.handoffs,0);
});
check('unknown-funding-does-not-become-query-or-grant-authority',async()=>{
 const f=fixture({submit:()=>Promise.resolve(F({phase:'SUBMISSION_OUTCOME_UNKNOWN',fundingIntakeStatus:'UNKNOWN'}))});
 await f.prepare();await f.commit();await assert.rejects(f.submit());await assert.rejects(f.handoff({}));
 assert.equal(f.queries+f.handoffs,0);assert.equal(f.root.inspect().held,true);assert.equal(state(f).fundingReturned,false);
});
check('matching-original-query-closes-once-before-the-existing-selected-grant-handoff',async()=>{
 const f=fixture();await f.fund();const value=await f.handoff();assert.equal(value.selectedGrantId,f.h.grant.grantId);
 assert.deepEqual([f.queries,f.opens,f.queryReads,f.queryCloses,f.handoffs],[1,1,1,1,1]);
 assert.ok(f.trace.indexOf('query-close')<f.trace.indexOf('child-handoff'));assert.equal(state(f).purchaseMatched,true);
 assert.equal(f.lastOutput.authority,'NONE');assert.equal(f.lastOutput.history.grantAuthority,'NOT_REVALIDATED');
 assert.equal(f.h.counts.funding,1);assert.equal(f.h.counts.grants,1);assert.equal(f.lastOutput.mayDispatchService,false);
});
check('100-distinct-results-and-exact-replay-use-one-original-funding-query-and-grant-in-106-commands',async()=>{
 const f=fixture(),h=f.h,limits={maxCommands:106},owner=createBuyerApiCreditFundingCommandSession({client:f.root,
  channel:createBuyerApiCreditCommandLineChannel({input:h.input,output:h.output,limits}),limits});
 const send=(id,operation,input={})=>h.input.write(encodeBuyerApiCreditCommand({version:1,id,operation,input}));
 h.onWrite=(value,done)=>{
  if(value.operation==='prepare')send('commit','commit',{expectedPins:h.packet.expectedPins,originalGrantQueryProfile:f.d.text});
  if(value.operation==='commit')send('fund','submitFunding',{expectedPins:h.packet.expectedPins});
  if(value.operation==='submitFunding')send('handoff','handoff',h.handoff());
  if(value.operation==='handoff'){
   for(let i=0;i<100;i++)send('call.'+i,'submitService',f.r.request('item.'+i));
   send('replay','submitService',f.r.request('item.0'));send('close','close');
  }
  done();
 };
 send('prepare','prepare',h.f.input);const outcome=await runBuyerOriginalCommandHost(owner);
 assert.equal(outcome.status,'CLOSED');assert.equal(owner.inspect().commands,106);
 const replies=h.replies.filter(x=>x.operation==='submitService');assert.equal(replies.length,101);
 assert.equal(replies[100].result.replayed,true);assert.equal(replies[0].result.responseJson,replies[100].result.responseJson);
 assert.deepEqual([f.r.submissions,f.r.reserves,f.r.begins,f.r.completes],[100,100,100,100]);
 assert.deepEqual([f.queries,f.queryReads,f.queryCloses,f.handoffs,h.counts.funding,h.counts.grants],[1,1,1,1,1,1]);
 const grant=h.model.getGrant(h.grant.grantId);assert.deepEqual([grant.availableUnits,grant.heldUnits,grant.consumedUnits],[0,0,100]);
 assert.equal(outcome.serviceDelivery,'NOT_ESTABLISHED');assert.equal(f.r.profileFixture.keyCalls+f.r.profileFixture.clockCalls,0);
});
check('another-selected-grant-cannot-use-the-same-original-query-observation',async()=>{
 const f=await refusesHistory(v=>{v.record.grantId='grant_'+'f'.repeat(64);return v;});assert.equal(f.queryClosed,true);
});
check('coherent-lower-credit-balance-cannot-replace-the-purchased-total',async()=>{
 const f=await refusesHistory(v=>{v.record.totalUnits=99;v.record.availableUnits=99;return v;});assert.equal(f.queryClosed,true);assert.equal(state(f).purchaseMatched,false);
});
check('a-different-absolute-grant-expiry-cannot-pass-purchase-comparison',async()=>{
 await refusesHistory(v=>{v.record.expiresAt++;return v;});
});
check('not-recorded-original-grant-keeps-the-original-liability-and-spending-state-without-handoff',async()=>{
 const f=fixture({history:(s,v)=>createServiceCreditOriginalFundingGrantResult(v.originalFunding,null)});await f.fund();const before=f.h.raw();
 await assert.rejects(f.handoff());assert.equal(f.h.raw(),before);assert.equal(f.handoffs,0);assert.equal(f.queryClosed,true);assert.equal(f.root.inspect().held,true);
});
check('expired-grant-history-does-not-erase-funding-or-create-another-grant',async()=>{
 const f=await refusesHistory(v=>{v.record.storedLifecycle='EXPIRED';return v;});assert.equal(f.h.counts.funding,1);assert.equal(f.h.counts.grants,1);
 await assert.rejects(f.submit());assert.equal(f.h.counts.funding,1);
});
check('revoked-grant-history-cannot-enable-service-handoff-or-a-second-funding',async()=>{
 const f=await refusesHistory(v=>{v.record.storedLifecycle='REVOKED';return v;});await assert.rejects(f.submit());assert.equal(f.h.counts.funding,1);
});
check('foreign-checkpoint-output-is-refused-even-after-a-closed-query-owner',async()=>{
 const f=fixture({output:(s,v)=>frozenData({...copy(v),checkpointDigest:'f'.repeat(64)})});await f.fund();await assert.rejects(f.handoff());
 assert.equal(f.handoffs,0);assert.equal(state(f).queryCloseObserved,true);assert.equal(f.root.inspect().held,true);
});
check('foreign-request-output-is-refused-without-another-lookup',async()=>{
 const f=fixture({output:(s,v)=>frozenData({...copy(v),requestId:'request.changed'})});await f.fund();await assert.rejects(f.handoff());
 assert.equal(f.queries,1);assert.equal(f.handoffs,0);assert.equal(f.root.inspect().held,true);
});
check('missing-close-observation-retains-unknown-query-ownership-and-blocks-child-close',async()=>{
 const f=fixture({output:(s,v)=>frozenData({...copy(v),transportCloseObserved:false})});await f.fund();await assert.rejects(f.handoff());
 await assert.rejects(f.root.close());assert.equal(f.clientCloses,0);assert.equal(state(f).queryUnknown,true);
});
check('opaque-lookup-return-never-assimilates-a-then-accessor-or-starts-another-owner',async()=>{
 let entered=0;const value={};Object.defineProperty(value,'then',{get(){entered++;throw Error('must not enter');}});
 const f=fixture({inspectGrant:()=>value});await f.fund();await assert.rejects(f.handoff());await assert.rejects(f.root.close());
 assert.equal(entered,0);assert.equal(f.opens+f.clientCloses,0);assert.equal(state(f).queryUnknown,true);
});
check('a-throwing-lookup-opener-is-held-without-a-competing-child-or-file-close',async()=>{
 const f=fixture({inspectGrant:()=>{throw Error('declared unreturned lookup');}});await f.fund();await assert.rejects(f.handoff());
 await assert.rejects(f.root.close());assert.equal(f.clientCloses,0);assert.equal(f.root.inspect().held,true);
});
check('pending-lookup-blocks-concurrent-handoff-and-service-with-only-one-query',async()=>{
 const f=fixture({queryRead:s=>s.queryRead.promise});await f.fund();const request=f.h.handoff(),pending=f.handoff(request);await flush();
 await assert.rejects(f.handoff());await assert.rejects(f.root.submitOriginal(f.r.request()));assert.equal(f.queries,1);assert.equal(f.handoffs,0);
 request.selectedGrantId='grant_'+'f'.repeat(64);f.queryRead.resolve(f.history());await pending;
 assert.equal(f.handoffs,1);assert.equal(f.queries,1);assert.equal(f.queryCloses,1);
});
check('close-during-query-retains-held-file-ownership-and-late-results-cannot-start-service',async()=>{
 const f=fixture({queryRead:s=>s.queryRead.promise});await f.fund();const pending=f.handoff();await flush();
 const close=f.root.close();await assert.rejects(close);assert.equal(f.clientCloses,0);assert.equal(f.queryCloses,0);
 f.queryRead.resolve(f.history());await assert.rejects(pending);await flush();assert.equal(f.handoffs,0);assert.equal(f.clientCloses,0);
 assert.equal(f.queryCloses,1);assert.equal(f.root.close(),close);assert.equal(f.root.inspect().held,true);
});
check('query-deadline-never-retries-or-turns-a-late-closed-query-into-authority',async()=>{
 const f=fixture({queryRead:s=>s.queryRead.promise});await f.fund();const pending=f.handoff();await flush();
 f.now=41_000_000n;f.timers[0].callback();await assert.rejects(pending);assert.equal(f.queries,1);assert.equal(f.handoffs,0);
 f.queryRead.resolve(f.history());await flush();assert.equal(f.queryCloses,1);await assert.rejects(f.root.close());
 assert.equal(f.clientCloses,0);assert.equal(f.root.inspect().held,true);
});
check('query-close-rejection-cannot-be-replaced-by-a-child-close-or-new-read',async()=>{
 const f=fixture({queryClose:()=>Promise.reject(Error('declared query close refusal'))});await f.fund();await assert.rejects(f.handoff());
 await assert.rejects(f.root.close());assert.equal(f.queryCloses,1);assert.equal(f.queries,1);assert.equal(f.clientCloses+f.handoffs,0);
});
check('pending-query-close-is-joined-before-any-handoff-and-is-not-repeated',async()=>{
 const f=fixture({queryClose:s=>s.queryClose.promise});await f.fund();const pending=f.handoff();await flush();
 assert.equal(f.queryCloses,1);assert.equal(f.handoffs,0);await assert.rejects(f.handoff());
 f.queryClose.resolve(f.closeReceipt());await pending;assert.equal(f.queryCloses,1);assert.equal(f.handoffs,1);
});
check('outer-close-after-known-query-close-still-withholds-a-late-handoff-result',async()=>{
 const f=fixture({output:(s,v)=>{s.root.close().catch(()=>{});return v;}});await f.fund();await assert.rejects(f.handoff());await flush();
 assert.equal(f.queryClosed,true);assert.equal(f.handoffs,0);assert.equal(f.clientCloses,1);assert.equal(f.root.inspect().held,true);await assert.rejects(f.root.close());
});
check('custody-reentry-after-query-waits-for-the-known-custody-return-before-child-close',async()=>{
 let once=false;const f=fixture({read:s=>{if(s.queryClosed&&!once){once=true;s.root.close().catch(()=>{});assert.equal(s.clientCloses,0);}return s.raw;}});
 await f.fund();await assert.rejects(f.handoff());await flush();assert.equal(once,true);assert.equal(f.handoffs,0);assert.equal(f.clientCloses,1);assert.equal(f.root.inspect().held,true);
});
check('changed-custody-after-query-refuses-handoff-and-keeps-the-same-reservation',async()=>{
 const f=fixture({read:s=>s.queryClosed?' '+s.raw:s.raw});await f.fund();const before=f.h.raw();await assert.rejects(f.handoff());
 assert.equal(f.h.raw(),before);assert.equal(f.handoffs,0);assert.equal(f.root.inspect().held,true);await assert.rejects(f.root.close());
 // A synchronous text receipt returned and the query is already closed. The
 // semantic conflict remains HELD, but the known child can be stopped once.
 assert.equal(f.clientCloses,1);
});
check('throwing-custody-read-after-query-keeps-the-unreturned-borrower-held',async()=>{
 const f=fixture({read:s=>{if(s.queryClosed)throw Error('declared custody read refusal');return s.raw;}});
 await f.fund();const before=f.h.raw();await assert.rejects(f.handoff());await assert.rejects(f.root.close());
 assert.equal(f.h.raw(),before);assert.equal(f.handoffs,0);assert.equal(f.clientCloses,0);
 assert.equal(f.root.inspect().grantQueryRecovery.custodyUnknown,true);assert.equal(f.root.inspect().held,true);
});
check('child-handoff-refusal-after-query-cannot-authorize-another-lookup-or-funding',async()=>{
 const f=fixture({handoff:()=>Promise.reject(Error('declared handoff refusal'))});await f.fund();await assert.rejects(f.handoff());await assert.rejects(f.handoff());
 await assert.rejects(f.submit());assert.equal(f.queries,1);assert.equal(f.handoffs,1);assert.equal(f.h.counts.funding,1);assert.equal(f.root.inspect().held,true);
});
check('child-handoff-must-return-the-same-explicitly-selected-grant-id',async()=>{
 const f=fixture({handoff:()=>Promise.resolve(F({phase:'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED',selectedGrantId:'grant_'+'f'.repeat(64)}))});
 await f.fund();await assert.rejects(f.handoff());assert.equal(f.handoffs,1);assert.equal(f.root.inspect().held,true);
});
check('nonvoid-query-timer-cancel-cannot-be-treated-as-a-clean-close',async()=>{
 const f=fixture({cancel:()=>true});await f.fund();await assert.rejects(f.handoff());await assert.rejects(f.root.close());
 assert.equal(f.queryCloses,1);assert.equal(f.handoffs+f.clientCloses,0);assert.equal(state(f).queryUnknown,true);
});
check('purchase-query-token-is-branded-one-use-and-does-not-return-service-authority',async()=>{
 const f=fixture(),token=captureApiCreditPurchasedGrantQuery(f.purchase,f.d.text,f.d.profile.originalPayment,f.lookupPolicy);
 await f.fund();await f.handoff();assert.equal(requireApiCreditPurchasedGrantHandoff(token,f.h.grant.grantId,f.lastOutput),undefined);
 assert.throws(()=>requireApiCreditPurchasedGrantHandoff(token,f.h.grant.grantId,f.lastOutput));
 assert.throws(()=>requireApiCreditPurchasedGrantHandoff(F({...token}),f.h.grant.grantId,f.lastOutput));assert.equal(token.authority,'NONE');
});
check('purchased-constructor-rejects-accessor-and-unfrozen-native-lookup-ports-without-entry',()=>{
 const f=fixture();let entered=0;const c={...f.configuration};Object.defineProperty(c,'inspectGrant',{enumerable:true,get(){entered++;throw Error('no entry');}});
 assert.throws(()=>createApiCreditPurchasedGrantRecoveryApplication(c));assert.throws(()=>createApiCreditPurchasedGrantRecoveryApplication(F({...f.configuration,inspectGrant:()=>Promise.resolve()})));
 assert.equal(entered,0);assert.equal(f.queries,0);
});
check('legacy-custody-component-keeps-its-explicit-no-lookup-contract',async()=>{
 const f=fixture({legacy:true});await f.fund();await f.handoff();assert.equal(f.queries,0);assert.equal(f.handoffs,1);
 assert.equal(f.root.inspect().grantQueryRecovery.queryDispatch,false);assert.equal(f.root.inspect().grantQueryRecovery.purchasedGrantHandoff,undefined);
});

const cases=[];for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
for(const f of owned)await f.cleanup();const failed=cases.filter(c=>c.status!=='PASS').length;
console.log(JSON.stringify({qualification:'G1_PURCHASED_GRANT_HANDOFF_DATA',passed:cases.length-failed,failed,cases,
 actualProductCustodyQueryOwnerAndCommandControllers:true,declaredMemoryFileFundingGrantHistoryAndTransportPortsOnly:true,
 hundredCallReferenceMockGrantOnly:true,referenceServiceRequests:100,referenceReplays:1,maximumLookupAttemptsPerExplicitHandoff:1,
 nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
 providerGrantAuthentication:'NOT_ESTABLISHED',nativeHundredCall:'NOT_ESTABLISHED',nativePersistence:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',G1:'OPEN',G2:'OPEN'}));
if(failed)process.exitCode=1;
