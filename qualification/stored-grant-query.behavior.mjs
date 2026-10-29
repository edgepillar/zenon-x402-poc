// Actual stored-profile admission, original record projection, file-owner
// protocol, query owner and coordinator. File/transport/timer/FIFO ports are
// declared memory DATA. No SQL, SDK, socket, key/signature or native entry runs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { fundingGrantCustodyDataFixture } from './funding-grant-custody.behavior.mjs';
import { createApiCreditFundingGrantRecoveryRecord as record } from '../src/api-credit-funding-grant-recovery-record.js';
import { captureApiCreditStoredGrantQueryExpected as expected,decodeApiCreditStoredGrantQueryProfile as decodeStored } from '../src/api-credit-stored-grant-query-profile.js';
import { decodeApiCreditOriginalGrantQueryProfile as decode,consumeApiCreditOriginalGrantQueryProfile as consume,releaseApiCreditOriginalGrantQueryProfile as release } from '../src/api-credit-original-grant-query-profile.js';
import { resolveApiCreditStoredGrantQueryOwner as resolve } from '../src/api-credit-stored-grant-query-owner.js';
import { runApiCreditOriginalGrantQueryOwner as queryOwner } from '../src/api-credit-original-grant-query-owner.js';
import { runApiCreditOriginalGrantQueryCoordinator as coordinate } from '../src/api-credit-recovery-inspection-coordinator.js';
import { captureApiCreditCliArguments as argv } from '../src/api-credit-cli-arguments.js';
import { createServiceCreditOriginalFundingGrantResult as history } from '../src/service-credit-original-funding-grant.js';
import { createNativeHttpsClientCloseOwner as closeOwner } from '../src/service-credit-native-client-close-owner.js';

const F=Object.freeze,checks=[],clone=v=>JSON.parse(JSON.stringify(v)),hash=v=>createHash('sha256').update(v).digest('hex');
function check(id,run){checks.push({id,run});}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
export function storedGrantQueryDataFixture(){
  const d=fundingGrantCustodyDataFixture(),policy={version:1,policyId:'synthetic.policy',accountId:d.profile.originalFunding.holderId,
    network:d.row.network,asset:d.row.asset,recipients:[d.row.recipient],maxPayment:d.row.amount,maxTotal:d.row.amount,maxDaily:d.row.amount,maxRecords:4};
  const envelope={originalGrantQueryVersion:2,spendingFile:{storageProfile:{version:1,mode:'OPEN_EXISTING',databasePath:'/synthetic/grant/ledger.sqlite',policy,
    ownerToken:{version:1,storeId:'synthetic.store',accountId:policy.accountId,ownerId:'synthetic.owner',epoch:1,minimumRevision:0}},allowedRoot:'/synthetic/grant',
    filePolicy:{expectedDevice:'1',reservedBytes:'0',maxDatabaseBytes:4194304}},expectedOriginal:{...d.expected,fundingResourceUrl:d.f.resourceUrl,
      paymentHash:d.packet.transactionHash,requestId:d.profile.query.requestId,profileDigest:hash(d.text)}};
  return {...d,envelope,raw:record(d.row,d.signer,d.text)};
}
function captured(e){const p=decode(canonicalJson(e)),c=consume(p);release(p);return c;}
function fileFixture(options={}){
  const d=storedGrantQueryDataFixture(),s={opens:0,reads:0,current:0,revokes:0,closes:0,views:0,queries:0,networkOpens:0,expired:false,phase:'OPEN',held:false,busy:false,trace:[],unusedWrites:0};
  const read=F(id=>{s.reads++;s.trace.push('read');assert.equal(id,d.row.paymentId);if(options.read)return options.read(s,d);return d.raw;});
  const custody=F(Object.defineProperty({read},'retain',{enumerable:true,get(){s.unusedWrites++;throw Error('write must not be captured');}}));
  const view=()=>F({spendingFileOwnerVersion:1,lifecycle:s.phase,held:s.held,busy:s.busy,backendClosed:s.phase!=='OPEN',databaseOpen:s.phase!=='CLOSED',physicalCloseEntered:s.phase==='CLOSED',physicalCloseReturned:s.phase==='CLOSED'});
  const owner=F({grantQueryCustody:custody,assertCurrent:F(()=>{s.current++;s.trace.push('current');if(options.current)return options.current(s,d);}),
    revoke:F(()=>{s.revokes++;s.trace.push('revoke');if(options.revoke)return options.revoke(s,d);s.phase='REVOKED';}),
    close:F(()=>{s.closes++;s.trace.push('close');if(options.close)return options.close(s,d);s.phase='CLOSED';}),
    inspect:F(()=>{s.views++;s.trace.push('view:'+s.phase);return options.view?options.view(s,view()):view();})});
  const ports=F({openFile:F(config=>{s.opens++;s.trace.push('open');assert.equal(config.storageProfile.mode,'OPEN_EXISTING');if(options.open)return options.open(s,owner,config);return owner;})});
  const guard=F(()=>{if(options.guard)return options.guard(s,d);if(s.expired)throw Error('declared deadline expiry');});
  const profile=captured(d.envelope);return {d,s,owner,ports,guard,profile,run:()=>resolve(F({profile,ports,requireOpening:guard}))};
}
function holder(f,ready){
  const close=closeOwner({readObservedCounts:F(()=>F({requests:0,sockets:0,timers:0})),releaseLocalMaterial:F(()=>{})});
  const token=F({declared:true}),ports=F({openTransport:F(c=>{assert.equal(f.s.phase,'CLOSED');assert.equal(f.s.closes,1);assert.equal(c,ready);f.s.networkOpens++;return token;}),
    read:F(()=>{f.s.queries++;return Promise.resolve(history(ready.query.originalFunding,null));}),
    inspect:F(()=>{const v=close.snapshot();return F({phase:v.phase,unknown:v.unknown,requestStarts:f.s.queries,trackedRequests:0,trackedSockets:0,ownedTimers:0,close:v});}),
    close:F(()=>{const result=close.beginClose();close.observe();return result;}),clock:F(()=>0n),armTimer:F(()=>F({declaredTimer:true})),cancelTimer:F(()=>{})});
  return queryOwner(F({profile:ready,ports,requireOpening:F(()=>{})}));
}
function coordinatorFixture(options={}){
  const f=fileFixture(options.file??{}),s={now:0n,timers:[],writes:[],closed:false,inspections:0,profile:null};
  const ports=F({readProfile:F(g=>{g();return Promise.resolve(options.text??canonicalJson(f.d.envelope));}),
    inspectOriginal:F((profile,g)=>{g();s.inspections++;s.profile=profile;const input=consume(profile);release(profile);const ready=resolve(F({profile:input,ports:f.ports,requireOpening:g}));return holder(f,ready);}),
    writeResult:F((line,g)=>{g();s.writes.push(line);return Promise.resolve(undefined);}),close:F(()=>{s.closed=true;return Promise.resolve(undefined);}),
    inspect:F(()=>F({lifecycle:s.closed?'CLOSED':'OPEN',held:false,reading:false,writing:false})),clock:F(()=>s.now),
    armTimer:F((budget,callback)=>{const t={budget,callback};s.timers.push(t);return t;}),cancelTimer:F(t=>{t.cancelled=true;})});
  return {f,s,run:()=>coordinate({arguments:argv(['--funding-grant-query-fd','3','--output-fd','6','--bootstrap-ms','1000']),ports})};
}

check('stored-grant-profile-uses-the-existing-query-mode-and-closed-version-two',()=>{const d=storedGrantQueryDataFixture(),p=decode(canonicalJson(d.envelope)),c=consume(p);assert.equal(p.originalGrantQueryVersion,2);assert.equal(c.storedGrantQueryVersion,2);assert.equal(c.fileConfiguration.storageProfile.mode,'OPEN_EXISTING');assert.equal(c.expectedOriginal.profileDigest,hash(d.text));assert.equal(JSON.stringify(p).includes('/synthetic/'),false);release(p);});
check('stored-grant-profile-is-one-use-and-release-revokes-future-consumption',()=>{const d=storedGrantQueryDataFixture(),p=decodeStored(canonicalJson(d.envelope));consume(p);assert.throws(()=>consume(p));release(p);assert.throws(()=>consume(p));const q=decode(canonicalJson(d.envelope));release(q);assert.throws(()=>consume(q));});
check('stored-grant-profile-rejects-key-module-transport-and-callback-selection',()=>{for(const key of ['keyPair','module','openFile','transport','sign']){const d=storedGrantQueryDataFixture();d.envelope[key]='unselected';assert.throws(()=>decode(canonicalJson(d.envelope)));}});
check('stored-grant-profile-refuses-creation-without-owner-discovery-or-migration',()=>{for(const edit of [e=>{const p=e.spendingFile.storageProfile;p.mode='CREATE_NEW';delete p.ownerToken;p.storeId='new.store';p.ownerId='new.owner';},e=>delete e.spendingFile.storageProfile.ownerToken,e=>{e.spendingFile.storageProfile.ownerToken.epoch=0;}]){const d=storedGrantQueryDataFixture();edit(d.envelope);assert.throws(()=>decode(canonicalJson(d.envelope)));}});
check('stored-grant-profile-requires-all-independent-original-and-full-profile-pins',()=>{for(const key of ['paymentId','originalDigest','fundingResourceUrl','paymentHash','requestId','checkpointDigest','queryDigest','profileDigest']){const d=storedGrantQueryDataFixture();delete d.envelope.expectedOriginal[key];assert.throws(()=>decode(canonicalJson(d.envelope)));}});
check('stored-grant-profile-refuses-noncanonical-duplicate-oversized-and-invalid-hash-input',()=>{const d=storedGrantQueryDataFixture(),text=canonicalJson(d.envelope);assert.throws(()=>decode(text+'\n'));assert.throws(()=>decode(text.replace('"originalGrantQueryVersion":2','"originalGrantQueryVersion":2,"originalGrantQueryVersion":2')));assert.throws(()=>decode('x'.repeat(16385)));assert.throws(()=>expected({...d.envelope.expectedOriginal,profileDigest:'sha256:'+'a'.repeat(64)}));assert.throws(()=>expected({...d.envelope.expectedOriginal,queryDigest:'a'.repeat(64)}));});
check('stored-grant-profile-detaches-caller-owned-file-and-expected-objects',()=>{const d=storedGrantQueryDataFixture(),p=decode(canonicalJson(d.envelope));d.envelope.spendingFile.storageProfile.databasePath='/synthetic/changed.sqlite';d.envelope.expectedOriginal.profileDigest='f'.repeat(64);const c=consume(p);assert.equal(c.fileConfiguration.storageProfile.databasePath,'/synthetic/grant/ledger.sqlite');assert.equal(c.expectedOriginal.profileDigest,hash(d.text));release(p);});
check('stored-grant-profile-proxy-and-getter-pins-never-run-input-hooks',()=>{const d=storedGrantQueryDataFixture();let hooks=0;const e={...d.envelope.expectedOriginal};Object.defineProperty(e,'profileDigest',{enumerable:true,get(){hooks++;throw Error();}});assert.throws(()=>expected(e));assert.throws(()=>expected(new Proxy({}, {getOwnPropertyDescriptor(){hooks++;throw Error();}})));assert.equal(hooks,0);});
check('stored-grant-read-validates-and-closes-the-same-owner-before-returning-ready-profile',()=>{const f=fileFixture(),r=f.run();assert.equal(r.route.fundingResourceUrl,f.d.f.resourceUrl);assert.equal(r.queryDigest,f.d.captured.queryDigest);assert.equal(r.proof.signature,f.d.profile.query.proof.signature);assert.equal(r.transport.caBase64,f.d.profile.transport.caBase64);assert.equal(f.s.opens,1);assert.equal(f.s.reads,1);assert.equal(f.s.revokes,1);assert.equal(f.s.closes,1);assert.equal(f.s.phase,'CLOSED');assert.equal(f.s.unusedWrites,0);assert.ok(f.s.trace.indexOf('read')<f.s.trace.indexOf('revoke'));assert.ok(f.s.trace.indexOf('revoke')<f.s.trace.indexOf('close'));});
check('stored-grant-ready-profile-enters-the-actual-one-query-owner-after-file-close',async()=>{const f=fileFixture(),r=f.run(),out=await holder(f,r);assert.equal(out.history.status,'NOT_RECORDED');assert.equal(out.spendingReservation,'UNCHANGED');assert.equal(out.authority,'NONE');assert.equal(f.s.networkOpens,1);assert.equal(f.s.queries,1);assert.equal(f.s.unusedWrites,0);});
check('stored-grant-coordinator-keeps-one-input-query-and-redacted-history-output',async()=>{const c=coordinatorFixture(),r=await c.run();assert.equal(r.exitCode,0);assert.equal(c.f.s.opens,1);assert.equal(c.f.s.reads,1);assert.equal(c.f.s.queries,1);assert.equal(c.s.writes.length,1);assert.equal(c.s.writes[0].includes('declared-proof-data'),false);assert.equal(c.s.writes[0].includes('/synthetic/'),false);assert.equal(c.s.writes[0].includes('caBase64'),false);assert.equal(JSON.parse(c.s.writes[0]).history.status,'NOT_RECORDED');assert.equal(c.f.s.phase,'CLOSED');});
check('stored-grant-missing-record-closes-known-owner-without-query-or-payment-authority',()=>{const f=fileFixture({read(){return null;}});assert.throws(()=>f.run());assert.equal(f.s.reads,1);assert.equal(f.s.revokes,1);assert.equal(f.s.closes,1);assert.equal(f.s.networkOpens,0);});
check('stored-grant-foreign-record-digest-is-refused-before-any-transport-opens',()=>{const f=fileFixture();const e={...f.profile.expectedOriginal,originalDigest:'sha256:'+'f'.repeat(64)},p=F({...f.profile,expectedOriginal:F(e)});assert.throws(()=>resolve(F({profile:p,ports:f.ports,requireOpening:f.guard})));assert.equal(f.s.closes,1);assert.equal(f.s.networkOpens,0);});
check('stored-grant-wrong-independent-full-profile-hash-cannot-select-row-transport',()=>{const f=fileFixture(),p=F({...f.profile,expectedOriginal:F({...f.profile.expectedOriginal,profileDigest:'f'.repeat(64)})});assert.throws(()=>resolve(F({profile:p,ports:f.ports,requireOpening:f.guard})));assert.equal(f.s.closes,1);assert.equal(f.s.networkOpens,0);});
check('stored-grant-changed-ca-with-matching-row-digests-still-fails-full-profile-pin',()=>{const f=fileFixture({read(s,d){const p=clone(d.profile);p.transport.caBase64=Buffer.from('other-declared-ca').toString('base64');return record(d.row,d.signer,canonicalJson(p));}});assert.throws(()=>f.run());assert.equal(f.s.closes,1);assert.equal(f.s.networkOpens,0);});
check('stored-grant-changed-row-timer-budgets-cannot-become-new-authority',()=>{const f=fileFixture({read(s,d){const p=clone(d.profile);p.transport.requestDeadlineMs=101;return record(d.row,d.signer,canonicalJson(p));}});assert.throws(()=>f.run());assert.equal(f.s.closes,1);assert.equal(f.s.networkOpens,0);});
check('stored-grant-expected-payment-request-and-route-are-rebound-after-projection',()=>{for(const [key,value]of [['paymentHash','f'.repeat(64)],['requestId','other.request'],['fundingResourceUrl','https://foreign.invalid/funding']]){const f=fileFixture(),p=F({...f.profile,expectedOriginal:F({...f.profile.expectedOriginal,[key]:value})});assert.throws(()=>resolve(F({profile:p,ports:f.ports,requireOpening:f.guard})));assert.equal(f.s.closes,1);assert.equal(f.s.networkOpens,0);}});
check('stored-grant-bad-spending-policy-cannot-be-replaced-by-a-row-policy',()=>{const f=fileFixture(),file=clone(f.profile.fileConfiguration);file.storageProfile.policy.network='zenon:other';const p=F({...f.profile,fileConfiguration:F(file)});assert.throws(()=>resolve(F({profile:p,ports:f.ports,requireOpening:f.guard})));assert.equal(f.s.networkOpens,0);});
check('stored-grant-expired-opening-before-file-entry-acquires-no-owner',()=>{const f=fileFixture({guard(){throw Error('declared expired');}});assert.throws(()=>f.run());assert.equal(f.s.opens,0);assert.equal(f.s.closes,0);});
check('stored-grant-expiry-after-known-read-closes-owner-but-starts-no-query',()=>{const f=fileFixture({read(s,d){s.expired=true;return d.raw;}});assert.throws(()=>f.run());assert.equal(f.s.closes,1);assert.equal(f.s.networkOpens,0);});
check('stored-grant-file-configuration-is-detached-before-opening-guard-callback',()=>{const f=fileFixture(),file=clone(f.profile.fileConfiguration),p=F({...f.profile,fileConfiguration:file});let once=false;const guard=F(()=>{if(!once){once=true;file.storageProfile.databasePath='/synthetic/changed.sqlite';}});const ports=F({openFile:F(c=>{assert.equal(c.storageProfile.databasePath,'/synthetic/grant/ledger.sqlite');return f.ports.openFile(c);})});assert.equal(resolve(F({profile:p,ports,requireOpening:guard})).queryDigest,f.d.captured.queryDigest);});
check('stored-grant-pointer-envelopes-cannot-be-retained-as-recursive-ready-profiles',()=>{const d=storedGrantQueryDataFixture();assert.throws(()=>record(d.row,d.signer,canonicalJson(d.envelope)));});

check('stored-grant-wrong-full-profile-pin-reaches-no-network-or-history-output',async()=>{const d=storedGrantQueryDataFixture();d.envelope.expectedOriginal.profileDigest='f'.repeat(64);const c=coordinatorFixture({text:canonicalJson(d.envelope)}),r=await c.run();assert.equal(r.exitCode,4);assert.equal(c.f.s.closes,1);assert.equal(c.f.s.networkOpens,0);assert.equal(c.s.writes.length,0);});
check('stored-grant-pre-resource-mode-and-pins-are-admitted-before-file-port-entry',()=>{const f=fileFixture(),p=F({...f.profile,storedGrantQueryVersion:3});assert.throws(()=>resolve(F({profile:p,ports:f.ports,requireOpening:f.guard})));assert.equal(f.s.opens,0);});
check('stored-grant-normal-ready-version-one-profile-remains-keyless-and-unchanged',()=>{const d=storedGrantQueryDataFixture(),p=decode(d.text),c=consume(p);assert.equal(p.originalGrantQueryVersion,1);assert.equal(Object.hasOwn(c,'storedGrantQueryVersion'),false);assert.equal(c.proof.signature,d.profile.query.proof.signature);release(p);});
check('stored-grant-file-policy-keeps-the-existing-free-floor-and-allocation-bounds',()=>{const d=storedGrantQueryDataFixture(),c=captured(d.envelope);assert.equal(c.fileConfiguration.filePolicy.maxDatabaseBytes,4194304);assert.equal(c.fileConfiguration.filePolicy.reservedBytes,'0');assert.equal(Object.hasOwn(c.fileConfiguration,'readOnlyFallback'),false);});

// At most fifteen uncertain owned frames are retained in this process. The
// production bound remains sixteen; tests never clear or enlarge that bound.
check('stored-grant-opaque-opener-promise-is-retained-without-a-competing-closer',async()=>{const p=deferred(),f=fileFixture({open(){return p.promise;}});assert.throws(()=>f.run());p.resolve(f.owner);await flush();assert.equal(f.s.reads+f.s.revokes+f.s.closes+f.s.networkOpens,0);});
check('stored-grant-proxy-owner-is-rejected-without-reflection-traps',()=>{let hooks=0;const f=fileFixture({open(s,o){return new Proxy(o,{getOwnPropertyDescriptor(){hooks++;throw Error();},getPrototypeOf(){hooks++;throw Error();},isExtensible(){hooks++;throw Error();}});}});assert.throws(()=>f.run());assert.equal(hooks,0);assert.equal(f.s.reads+f.s.revokes+f.s.closes,0);});
check('stored-grant-pending-read-borrower-never-competes-with-revoke-or-close',async()=>{const p=deferred(),f=fileFixture({read(){return p.promise;}});assert.throws(()=>f.run());assert.equal(f.s.revokes+f.s.closes,0);p.resolve(f.d.raw);await flush();assert.equal(f.s.revokes+f.s.closes+f.s.networkOpens,0);});
check('stored-grant-throwing-read-retains-the-original-owner-without-reopen',()=>{const f=fileFixture({read(){throw Error('declared ambiguous read');}});assert.throws(()=>f.run());assert.equal(f.s.opens,1);assert.equal(f.s.revokes+f.s.closes+f.s.networkOpens,0);});
check('stored-grant-opaque-owner-view-prevents-read-and-cleanup',()=>{const f=fileFixture({view(){return Promise.resolve(F({}));}});assert.throws(()=>f.run());assert.equal(f.s.reads+f.s.revokes+f.s.closes,0);});
check('stored-grant-nonvoid-current-owner-receipt-prevents-read-and-cleanup',()=>{const f=fileFixture({current(){return true;}});assert.throws(()=>f.run());assert.equal(f.s.reads+f.s.revokes+f.s.closes,0);});
check('stored-grant-nonvoid-logical-revoke-prevents-physical-close',()=>{const f=fileFixture({revoke(s){s.phase='REVOKED';return true;}});assert.throws(()=>f.run());assert.equal(f.s.revokes,1);assert.equal(f.s.closes+f.s.networkOpens,0);});
check('stored-grant-throwing-logical-revoke-is-never-retried-or-followed-by-close',()=>{const f=fileFixture({revoke(){throw Error('declared revoke ambiguity');}});assert.throws(()=>f.run());assert.equal(f.s.revokes,1);assert.equal(f.s.closes,0);});
check('stored-grant-promise-physical-close-is-not-a-synchronous-release-receipt',async()=>{const p=deferred(),f=fileFixture({close(){return p.promise;}});assert.throws(()=>f.run());assert.equal(f.s.closes,1);p.resolve(undefined);await flush();assert.equal(f.s.closes,1);assert.equal(f.s.networkOpens,0);});
check('stored-grant-throwing-physical-close-is-not-retried-or-replaced',()=>{const f=fileFixture({close(){throw Error('declared close ambiguity');}});assert.throws(()=>f.run());assert.equal(f.s.closes,1);assert.equal(f.s.opens,1);assert.equal(f.s.networkOpens,0);});
check('stored-grant-bad-closed-view-cannot-publish-a-ready-profile',()=>{const f=fileFixture({view(s,v){return s.phase==='CLOSED'?F({...v,databaseOpen:true}):v;}});assert.throws(()=>f.run());assert.equal(f.s.closes,1);assert.equal(f.s.networkOpens,0);});
check('stored-grant-post-close-guard-mutation-is-caught-by-a-fresh-closed-view',()=>{let changed=false;const f=fileFixture({guard(s){if(s.phase==='CLOSED'&&!changed){changed=true;s.held=true;}}});assert.throws(()=>f.run());assert.equal(f.s.closes,1);assert.equal(f.s.networkOpens,0);});
check('stored-grant-held-owner-view-is-not-raw-closed-by-the-reader',()=>{const f=fileFixture({view(s,v){return F({...v,held:true});}});assert.throws(()=>f.run());assert.equal(f.s.reads+f.s.revokes+f.s.closes,0);});
check('stored-grant-reused-owner-capability-cannot-reopen-or-close-again',()=>{const f=fileFixture();f.run();assert.throws(()=>f.run());assert.equal(f.s.opens,2);assert.equal(f.s.reads,1);assert.equal(f.s.closes,1);});
check('stored-grant-accessor-owner-views-are-rejected-without-calling-getters',()=>{let hooks=0;const f=fileFixture({view(s,v){const x={...v};Object.defineProperty(x,'held',{enumerable:true,get(){hooks++;throw Error();}});return F(x);}});assert.throws(()=>f.run());assert.equal(hooks,0);assert.equal(f.s.reads+f.s.revokes+f.s.closes,0);});

export const apiCreditStoredGrantQueryDataCases=F([...checks]);
if(process.argv[1]!==undefined&&fileURLToPath(import.meta.url)===process.argv[1]){
  const cases=[];let current=null,reported=false;
  function report(){if(reported)return;reported=true;const failed=cases.filter(r=>r.status!=='PASS').length;
    console.log(JSON.stringify({qualification:'G2_API_CREDIT_STORED_GRANT_QUERY_DATA',passed:cases.length-failed,failed,cases,
      actualProfileProjectionFileProtocolQueryOwnerAndCoordinator:true,fileTransportClockTimerAndFifoPorts:'DECLARED_MEMORY_ONLY',signatureData:'UNAUTHENTICATED_EXISTING_FIELDS',
      nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
      nativePersistence:'NOT_ESTABLISHED',freshProcess:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;}
  function unsettled(){if(current!==null){cases.push({id:current,status:'FAIL',error:'UNSETTLED_DECLARED_DATA_PROMISE'});report();}}
  process.once('beforeExit',unsettled);
  for(const {id,run}of checks){current=id;try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});}current=null;}
  process.off('beforeExit',unsettled);report();
}
