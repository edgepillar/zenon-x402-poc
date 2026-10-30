// Actual purchase/original codecs, stored-query file protocol, query owner and
// CLI coordinator with declared memory ports. Not native/reopen acceptance.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { captureApiCreditPurchasedGrantRecoverySelection as select,
  claimApiCreditPurchasedGrantRecoverySelection as claim,
  bindApiCreditPurchasedGrantRecoveryProfile as bind,
  captureApiCreditPurchasedGrantRecoveryOutput as output } from '../src/api-credit-purchased-grant-recovery.js';
import { decodeApiCreditOriginalGrantQueryProfile as decode,consumeApiCreditOriginalGrantQueryProfile as consume,
  releaseApiCreditOriginalGrantQueryProfile as release } from '../src/api-credit-original-grant-query-profile.js';
import { createApiCreditFundingGrantRecoveryRecord as record } from '../src/api-credit-funding-grant-recovery-record.js';
import { captureServiceCreditOriginalFundingGrantQuery as fundingQuery } from '../src/service-credit-original-funding-grant.js';
import { storedGrantQueryDataFixture } from './stored-grant-query.behavior.mjs';
import { purchaseExpectationIndependentVector } from './api-credit-purchase-expectation.fixture.mjs';
import { purchasedGrantRecoveryData as data,purchasedGrantRecoveryFixture as fixture,
  captured,copy,hash,freeze,deferred,flush } from './purchased-grant-recovery.fixture.mjs';

const F=Object.freeze,checks=[];
function check(id,run){checks.push({id,run});}
function noAuthority(v){
  for(const k of ['mayStartPayment','maySignPayment','mayDispatchService','mayActivateGrant'])assert.equal(v[k],false);
  assert.equal(v.authority,'NONE');assert.equal(v.spendingReservation,'UNCHANGED');
  assert.equal(v.history.grantAuthority,'NOT_REVALIDATED');assert.equal(v.history.deliveryLiability,'NOT_QUERIED');
}
check('purchased-recovery-version-three-binds-the-independent-literal-purchase-vector',()=>{
  const d=data(),token=decode(canonicalJson(d.envelope));assert.equal(token.originalGrantQueryVersion,3);
  const p=consume(token);release(token);assert.equal(p.storedGrantQueryVersion,3);
  assert.equal(d.p.fundingCommitment,purchaseExpectationIndependentVector.fundingCommitment);
  assert.equal(d.p.purchaseExpectationJson,purchaseExpectationIndependentVector.purchaseExpectationJson);
  assert.equal(p.purchaseSelection.paymentHash,d.packet.transactionHash);assert.equal(p.purchaseSelection.checkpointDigest,d.expected.checkpointDigest);
  assert.equal(JSON.stringify(token).includes('purchaseExpectationJson'),false);assert.equal(JSON.stringify(token).includes('/synthetic/'),false);
});
check('purchased-recovery-reads-and-closes-one-original-owner-before-the-one-query',async()=>{
  const f=fixture(),raw=f.s.raw,r=await f.run();assert.equal(r.history.status,'RECORDED');assert.equal(r.history.record.totalUnits,100);
  assert.equal(r.history.record.availableUnits,91);assert.equal(r.history.record.heldUnits,2);assert.equal(r.history.record.consumedUnits,7);
  assert.equal(r.history.record.expiresAt,f.d.purchase.expiresAt);noAuthority(r);
  assert.equal(f.s.opens,1);assert.equal(f.s.reads,1);assert.equal(f.s.revokes,1);assert.equal(f.s.closes,1);
  assert.equal(f.s.queryOpens,1);assert.equal(f.s.queries,1);assert.equal(f.s.queryCloses,1);assert.equal(f.s.writes,0);
  assert.ok(f.s.trace.indexOf('file-close')<f.s.trace.indexOf('query-open'));assert.equal(f.s.raw,raw);
});
check('purchased-recovery-expired-history-retains-absolute-terms-and-outstanding-units',async()=>{
  const f=fixture({lifecycle:'EXPIRED'}),r=await f.run();assert.equal(r.history.record.storedLifecycle,'EXPIRED');
  assert.equal(r.history.record.expiresAt,f.d.purchase.expiresAt);assert.equal(r.history.record.availableUnits+r.history.record.heldUnits,93);noAuthority(r);
});
check('purchased-recovery-revoked-history-is-observation-without-restored-authority',async()=>{
  const f=fixture({lifecycle:'REVOKED'}),r=await f.run();assert.equal(r.history.record.storedLifecycle,'REVOKED');
  assert.equal(r.history.record.totalUnits,f.d.purchase.totalUnits);noAuthority(r);
});
check('purchased-recovery-absence-is-not-a-new-payment-or-forgotten-liability',async()=>{
  const f=fixture({absent:true}),r=await f.run();assert.equal(r.history.status,'NOT_RECORDED');assert.equal(r.history.record,null);
  assert.equal(r.reconciliationRequired,true);noAuthority(r);assert.equal(f.s.queries,1);assert.equal(f.s.writes,0);
});
check('purchased-recovery-unit-drift-is-withheld-after-known-owner-and-query-close',async()=>{
  const f=fixture({grant:g=>{g.totalUnits++;g.availableUnits++;}});await assert.rejects(f.run());
  assert.equal(f.s.closes,1);assert.equal(f.s.queryCloses,1);assert.equal(f.s.queries,1);await assert.rejects(f.run());assert.equal(f.s.opens,1);
});
check('purchased-recovery-expiry-refresh-is-refused-even-in-expired-history',async()=>{
  const f=fixture({lifecycle:'EXPIRED',grant:g=>{g.expiresAt++;}});await assert.rejects(f.run());
  assert.equal(f.s.closes,1);assert.equal(f.s.queryCloses,1);assert.equal(f.s.writes,0);
});
check('purchased-recovery-expiry-shortening-cannot-replace-the-purchased-term',async()=>{
  const f=fixture({grant:g=>{g.expiresAt--;}});await assert.rejects(f.run());assert.equal(f.s.queries,1);
});
check('purchased-recovery-original-payment-checkpoint-and-resource-pins-are-pre-open',()=>{
  for(const [key,value]of [['paymentHash','f'.repeat(64)],['checkpointDigest','f'.repeat(64)],['fundingResourceUrl','https://foreign.invalid/funding']]){
    const d=data();d.envelope.expectedOriginal[key]=value;assert.throws(()=>captured(d.envelope));
  }
});
check('purchased-recovery-modified-original-bytes-or-independent-digests-refuse',()=>{
  const d=data(),e=copy(d.envelope);e.originalPayment.serializedCheckpoint+=' ';assert.throws(()=>captured(e));
  const q=copy(d.envelope);q.originalPayment.expectedPins.digests.paymentPayload='f'.repeat(64);assert.throws(()=>captured(q));
});
check('purchased-recovery-mutated-purchase-terms-are-not-rebuilt-from-the-store',()=>{
  for(const edit of [p=>p.terms.totalUnits++,p=>p.terms.expiresAt++,p=>p.offer.offerVersion++,
    p=>p.selection.capabilityCommitment='sha256:'+'f'.repeat(64),p=>p.authorityProfile.recordDigest='sha256:'+'f'.repeat(64)]){
    const d=data(),p=JSON.parse(d.envelope.purchaseExpectationJson);edit(p);d.envelope.purchaseExpectationJson=canonicalJson(p);assert.throws(()=>captured(d.envelope));
  }
});
check('purchased-recovery-purchase-holder-must-match-the-selected-spending-account',()=>{
  const d=data();d.envelope.spendingFile.storageProfile.policy.accountId='other.account';
  d.envelope.spendingFile.storageProfile.ownerToken.accountId='other.account';assert.throws(()=>captured(d.envelope));
});
check('purchased-recovery-v3-cannot-omit-terms-original-or-add-key-and-transport-ports',()=>{
  for(const name of ['purchaseExpectationJson','originalPayment']){const d=data();delete d.envelope[name];assert.throws(()=>captured(d.envelope));}
  for(const name of ['keyPair','openFile','transport','sign','read']){const d=data();d.envelope[name]='unselected';assert.throws(()=>captured(d.envelope));}
});
check('purchased-recovery-version-three-canonical-and-byte-bounds-are-explicit',()=>{
  const d=data(),text=canonicalJson(d.envelope);assert.ok(Buffer.byteLength(text)<=32768);
  assert.throws(()=>decode(text+'\n'));assert.throws(()=>decode('x'.repeat(32769)));
  assert.throws(()=>decode(text.replace('"originalGrantQueryVersion":3','"originalGrantQueryVersion":3,"originalGrantQueryVersion":3')));
});
check('purchased-recovery-consumption-is-one-use-and-release-is-idempotent',()=>{
  const d=data(),p=decode(canonicalJson(d.envelope));consume(p);assert.throws(()=>consume(p));release(p);release(p);
  const q=decode(canonicalJson(d.envelope));release(q);assert.throws(()=>consume(q));
});
check('purchased-recovery-caller-mutation-does-not-replace-captured-independent-terms',async()=>{
  const f=fixture();f.d.envelope.purchaseExpectationJson='{}';f.d.envelope.originalPayment.serializedCheckpoint='{}';
  const r=await f.run();assert.equal(r.history.record.totalUnits,100);assert.equal(r.history.record.expiresAt,f.d.purchase.expiresAt);
});
check('purchased-recovery-forged-selection-is-refused-before-the-file-opener',()=>{
  const f=fixture(),p=F({...f.profile,purchaseSelection:F({...f.profile.purchaseSelection})});
  assert.throws(()=>f.resolve(p));assert.equal(f.s.opens,0);
});
check('purchased-recovery-repeated-selection-does-not-reopen-the-original-owner',()=>{
  const f=fixture();f.resolve();assert.throws(()=>f.resolve());assert.equal(f.s.opens,1);assert.equal(f.s.closes,1);assert.equal(f.s.queryOpens,0);
});
check('purchased-recovery-selection-is-claimed-before-reentrant-opening-callbacks',()=>{
  let f,reentered=false;f=fixture({guard(){if(!reentered){reentered=true;assert.throws(()=>f.resolve());assert.equal(f.s.opens,0);}}});
  f.resolve();assert.equal(f.s.opens,1);assert.equal(f.s.closes,1);
});
check('purchased-recovery-manual-profile-pin-drift-is-refused-before-opening',()=>{
  const f=fixture(),p=F({...f.profile,expectedOriginal:F({...f.profile.expectedOriginal,paymentHash:'f'.repeat(64)})});
  assert.throws(()=>f.resolve(p));assert.equal(f.s.opens,0);
});
check('purchased-recovery-full-profile-ca-pin-still-precedes-any-query',()=>{
  const d=data(),p=copy(d.profile);p.transport.caBase64=Buffer.from('other-declared-ca').toString('base64');
  d.raw=record(d.row,d.signer,canonicalJson(p));const f=fixture({data:d});assert.throws(()=>f.resolve());
  assert.equal(f.s.closes,1);assert.equal(f.s.queryOpens,0);
});
check('purchased-recovery-row-offer-cannot-override-independently-purchased-offer',()=>{
  const d=data(),p=copy(d.profile);p.originalFunding.offerId='other.offer';
  const q=fundingQuery({queryVersion:1,requestId:p.query.requestId,originalFunding:p.originalFunding});p.query.expectedQueryDigest=q.request.canonicalBodyDigest;
  const text=canonicalJson(p);d.raw=record(d.row,d.signer,text);d.envelope.expectedOriginal.profileDigest=hash(text);
  d.envelope.expectedOriginal.queryDigest=q.request.canonicalBodyDigest;
  const f=fixture({data:d});assert.throws(()=>f.resolve());assert.equal(f.s.closes,1);assert.equal(f.s.queryOpens,0);
});
check('purchased-recovery-query-result-original-and-query-digests-must-still-match',async()=>{
  for(const [key,value]of [['checkpointDigest','f'.repeat(64)],['requestId','other.request'],['paymentHash','f'.repeat(64)]]){
    const f=fixture({output:(s,v)=>F({...v,[key]:value})});await assert.rejects(f.run());assert.equal(f.s.queryCloses,1);assert.equal(f.s.queries,1);
  }
});
check('purchased-recovery-foreign-history-does-not-become-the-original-grant',async()=>{
  const f=fixture({output:(s,v)=>F({...v,history:F({...v.history,record:F({...v.history.record,holderId:'foreign.holder'})})})});
  await assert.rejects(f.run());assert.equal(f.s.queryCloses,1);assert.equal(f.s.writes,0);
});
check('purchased-recovery-result-cannot-add-payment-or-service-authority',async()=>{
  const f=fixture({output:(s,v)=>F({...v,mayDispatchService:true})});await assert.rejects(f.run());assert.equal(f.s.queryCloses,1);
});
check('purchased-recovery-result-is-consumed-once-and-late-data-cannot-repair-it',async()=>{
  const f=fixture({grant:g=>{g.expiresAt++;}});await assert.rejects(f.run());
  assert.throws(()=>output(f.s.selection,f.s.output));assert.equal(f.s.queries,1);assert.equal(f.s.queryCloses,1);
});
check('purchased-recovery-output-is-not-observable-before-the-bound-original-query',()=>{
  const d=data(),selection=select(d.p.purchaseExpectationJson,freeze(copy(d.profile.originalPayment)));
  assert.throws(()=>output(selection,F({})));assert.throws(()=>bind(selection,d.text));
  claim(selection,freeze(copy(d.envelope.expectedOriginal)),d.purchase.holderId);
  assert.throws(()=>output(selection,F({})));bind(selection,d.text);assert.throws(()=>bind(selection,d.text));
});
check('purchased-recovery-original-proxy-and-accessor-hooks-never-run',()=>{
  const d=data();let hooks=0;const original=copy(d.profile.originalPayment);
  Object.defineProperty(original,'serializedCheckpoint',{enumerable:true,get(){hooks++;throw Error();}});F(original);
  assert.throws(()=>select(d.p.purchaseExpectationJson,original));
  assert.throws(()=>select(d.p.purchaseExpectationJson,new Proxy({}, {getPrototypeOf(){hooks++;throw Error();}})));assert.equal(hooks,0);
});
check('purchased-recovery-missing-row-closes-the-known-file-without-any-query',()=>{
  const f=fixture({read(){return null;}});assert.throws(()=>f.resolve());assert.equal(f.s.closes,1);assert.equal(f.s.queryOpens,0);
});
check('purchased-recovery-unknown-read-never-competes-with-the-original-file-close',async()=>{
  const pending=deferred(),f=fixture({read(){return pending.promise;}});assert.throws(()=>f.resolve());
  assert.equal(f.s.revokes+f.s.closes,0);pending.resolve(f.d.raw);await flush();assert.equal(f.s.queryOpens+f.s.closes,0);
});
check('purchased-recovery-unknown-file-close-cannot-start-query-or-publish-history',async()=>{
  const pending=deferred(),f=fixture({fileClose(){return pending.promise;}});assert.throws(()=>f.resolve());
  assert.equal(f.s.closes,1);assert.equal(f.s.queryOpens,0);pending.resolve(undefined);await flush();assert.equal(f.s.queryOpens,0);
});
check('purchased-recovery-pending-query-withholds-output-and-late-history-never-repairs-unknown',async()=>{
  const pending=deferred(),f=fixture({queryRead(){return pending.promise;}}),run=f.run();
  await flush();assert.equal(f.s.queries,1);assert.equal(f.s.queryCloses,0);f.s.timers[0].callback();await assert.rejects(run);
  pending.resolve(f.history());await flush();assert.equal(f.s.queryCloses,1);assert.equal(f.s.output,null);assert.equal(f.s.queries,1);
});
check('purchased-recovery-query-close-must-complete-before-purchase-output',async()=>{
  const pending=deferred(),f=fixture({queryClose(){return pending.promise;}}),run=f.run();await flush();
  assert.equal(f.s.queryCloses,1);assert.equal(f.s.output,null);f.s.timers[0].callback();await assert.rejects(run);
  f.s.queryClosed=true;pending.resolve(F({phase:'CLOSED',trackedRequests:0,trackedSockets:0,ownedTimers:0,serviceDelivery:'NOT_ESTABLISHED'}));
  await flush();assert.equal(f.s.output,null);assert.equal(f.s.queryCloses,1);
});
check('purchased-recovery-existing-coordinator-emits-one-redacted-matching-history',async()=>{
  const f=fixture(),c=f.coordinate(),r=await c.run();assert.equal(r.exitCode,0);assert.equal(c.channel.inspections,1);assert.equal(c.channel.writes.length,1);
  const line=c.channel.writes[0];assert.equal(line.includes('/synthetic/'),false);assert.equal(line.includes('declared-proof-data'),false);
  assert.equal(line.includes('caBase64'),false);assert.equal(line.includes('purchaseExpectationJson'),false);noAuthority(JSON.parse(line));
  assert.equal(f.s.opens,1);assert.equal(f.s.queries,1);assert.equal(f.s.writes,0);
});
check('purchased-recovery-coordinator-withholds-mismatched-purchase-history-without-retry',async()=>{
  const f=fixture({grant:g=>{g.totalUnits++;g.availableUnits++;}}),c=f.coordinate(),r=await c.run();
  assert.equal(r.exitCode,4);assert.equal(c.channel.writes.length,0);assert.equal(f.s.queries,1);assert.equal(f.s.queryCloses,1);
});
check('purchased-recovery-independent-invocations-preserve-the-same-original-and-balances',async()=>{
  const d=data(),a=fixture({data:d,lifecycle:'EXPIRED'}),first=await a.run(),b=fixture({data:d,lifecycle:'EXPIRED'}),second=await b.run();
  assert.deepEqual(second,first);assert.equal(a.s.raw,b.s.raw);assert.equal(a.s.writes+b.s.writes,0);
  assert.equal(first.paymentHash,d.packet.transactionHash);noAuthority(second);
});
check('purchased-recovery-generic-version-two-and-ready-version-one-remain-unchanged',()=>{
  const d=storedGrantQueryDataFixture(),p=decode(canonicalJson(d.envelope)),c=consume(p);release(p);
  assert.equal(c.storedGrantQueryVersion,2);assert.equal(Object.hasOwn(c,'purchaseSelection'),false);
  const q=decode(d.text),v=consume(q);release(q);assert.equal(Object.hasOwn(v,'storedGrantQueryVersion'),false);
});

export const apiCreditPurchasedGrantRecoveryDataCases=F([...checks]);
if(process.argv[1]!==undefined&&fileURLToPath(import.meta.url)===process.argv[1]){
  const cases=[];let current=null,reported=false;
  function report(){if(reported)return;reported=true;const failed=cases.filter(v=>v.status!=='PASS').length;
    console.log(JSON.stringify({qualification:'G2_API_CREDIT_PURCHASED_GRANT_RECOVERY_DATA',passed:cases.length-failed,failed,cases,
      actualPurchaseAndOriginalCodecsStoredFileProtocolQueryOwnerAndCoordinator:true,ports:'DECLARED_MEMORY_ONLY',
      nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
      providerAuthentication:'NOT_ESTABLISHED',durableReopen:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));
    if(failed)process.exitCode=1;
  }
  function unsettled(){if(current!==null){cases.push({id:current,status:'FAIL',error:'UNSETTLED_DECLARED_DATA_PROMISE'});report();}}
  process.once('beforeExit',unsettled);
  for(const {id,run}of checks){current=id;try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});}current=null;}
  process.off('beforeExit',unsettled);report();
}
