// Actual checkpoint/context/query codecs and custody controller, with declared
// memory/file-owner/client ports. Existing signature-shaped DATA is invalid;
// no key/signature, SQL, SDK, socket, nonce search or native entry is run.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { canonicalJson,paymentIntentDigest } from '../src/canonical.js';
import { encodeB64Json } from '../src/x402-wire.js';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { computeZenonUnsignedUserSendHash } from '../src/zenon/transaction-planner.js';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as assemble } from '../src/zenon/dynamic-plasma-original-funding-data.js';
import { captureOriginalFundingSignerPreparation as prepareContext,captureOriginalFundingSignerPreSignContext as preSign,
  createOriginalFundingSignerContextIntent as intent,completeOriginalFundingSignerContextRecord as signed } from '../src/original-funding-signer-context-custody.js';
import { captureServiceCreditOriginalFundingGrantQuery as query } from '../src/service-credit-original-funding-grant.js';
import { captureApiCreditFundingGrantRecoveryProfile as capture,createApiCreditFundingGrantRecoveryRecord as create,
  inspectApiCreditFundingGrantRecoveryRecord as inspect,projectApiCreditFundingGrantRecoveryRecord as project } from '../src/api-credit-funding-grant-recovery-record.js';
import { createApiCreditFundingGrantRecoveryApplication as application } from '../src/api-credit-funding-grant-recovery-application.js';
import { encodeBuyerApiCreditCommand as encode,decodeBuyerApiCreditCommand as decode,encodeBuyerApiCreditCommandResult as resultLine,
  encodeBuyerOriginalFundingCommand as legacy } from '../src/buyer-original-funding-command.js';

const F=Object.freeze,checks=[],clone=v=>JSON.parse(JSON.stringify(v));
function check(id,run){checks.push({id,run});}
function digest(domain,value){return 'sha256:'+createHash('sha256').update(domain+'\0','ascii').update(canonicalJson(value)).digest('hex');}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
export function fundingGrantCustodyDataFixture(){
  const f=retainedOriginalInputFixture(),r=f.input.plannerContext.readInput;
  r.paymentRequired.resource={url:f.resourceUrl,tags:['x402-service-credit-funding-v1','c'.repeat(32),'c'.repeat(32)]};
  f.input.challenge.paymentRequired=clone(r.paymentRequired);f.input.challenge.paymentRequiredHeader=encodeB64Json(r.paymentRequired);
  const unsigned={...f.candidate.originalUnsignedBlock,data:Buffer.from(paymentIntentDigest(r.paymentRequired,r.accepted),'hex').toString('base64')};
  unsigned.hash=computeZenonUnsignedUserSendHash(unsigned);
  const block={...unsigned,signature:f.candidate.accountBlock.signature},prepared=prepareContext(f.input,f.resourceUrl);
  const subject={subjectVersion:1};for(const key of ['version','chainIdentifier','blockType','previousHash','height','momentumAcknowledged','address','toAddress','amount','tokenStandard','fromBlockHash','data'])subject[key]=unsigned[key];
  const plan={observedUserSendPlanVersion:1,subject,quote:{declaredQuoteVersion:1,label:'fixed-original-data'}};
  const context=preSign(prepared,{originalUnsignedBlock:unsigned,originalPlan:plan,preSignCheckpointJson:canonicalJson({accountBlock:unsigned,checkpointVersion:1,phase:'UNSIGNED',quote:plan.quote})});
  const row={paymentId:'payment.original',originalDigest:prepared.originalDigest,network:r.accepted.network,asset:unsigned.tokenStandard,recipient:unsigned.toAddress,amount:unsigned.amount,reservedDay:1,status:'RESERVED',spentDay:null};
  const initial=intent(row,unsigned,context),signer=signed(initial,block,row),packet=assemble(f.input,{originalUnsignedBlock:unsigned,accountBlock:block},f.resourceUrl);
  const identity={transactionId:'zenontx:'+block.hash,network:r.accepted.network,chainProfile:r.accepted.extra.zenonChain,asset:r.accepted.asset,amount:r.accepted.amount,payee:r.accepted.payTo,
    offerId:'offer-1',offerVersion:1,holderId:block.address,capabilityCommitment:'sha256:'+'d'.repeat(64),paymentResourceDigest:digest('zenon-x402-service-credit-payment-resource-v1',r.paymentRequired.resource),
    paymentRequirementDigest:digest('zenon-x402-service-credit-payment-requirement-v1',r.accepted),paymentIntentDigest:'sha256:'+paymentIntentDigest(r.paymentRequired,r.accepted),grantFundingCommitment:'sha256:'+'c'.repeat(64)};
  const q=query({queryVersion:1,requestId:'retained-read-1',originalFunding:identity});
  const profile={originalGrantQueryVersion:1,originalPayment:{resourceUrl:f.resourceUrl,serializedCheckpoint:packet.serializedCheckpoint,expectedPins:clone(packet.expectedPins)},originalFunding:identity,
    query:{requestId:q.query.requestId,expectedQueryDigest:q.request.canonicalBodyDigest,proof:{proofVersion:1,grantId:q.request.grantId,requestId:q.query.requestId,publicKey:'declared-key-data',maxCostUnits:1,signature:'declared-proof-data'}},
    transport:{caBase64:Buffer.from('declared-test-ca-data').toString('base64'),requestDeadlineMs:100,handshakeDeadlineMs:50,closeGraceMs:100}};
  const text=canonicalJson(profile),captured=capture(text,profile.originalPayment);
  return {f,row,initial,signer,packet,profile,text,captured,expected:{paymentId:row.paymentId,originalDigest:row.originalDigest,checkpointDigest:captured.checkpointDigest,queryDigest:captured.queryDigest}};
}
function fixture(options={}){
  const d=fundingGrantCustodyDataFixture(),s={trace:[],raw:null,retains:0,reads:0,current:0,prepares:0,commits:0,submits:0,handoffs:0,services:0,closes:0,closed:false},pending=deferred();
  const client=F({prepareOriginalFunding:F(input=>{s.prepares++;s.trace.push('prepare');assert.equal(input,d.f.input);return options.prepare?options.prepare(s,pending):Promise.resolve(F({phase:'AWAITING_INDEPENDENT_PINS',packet:d.packet}));}),
    commitOriginalFunding:F(input=>{s.commits++;s.trace.push('commit');assert.deepEqual(Object.keys(input),['expectedPins']);assert.deepEqual(input.expectedPins,d.packet.expectedPins);return options.commit?options.commit(s,pending):Promise.resolve(F({phase:'LOCAL_STORE_READBACK_MATCHED',transactionHash:d.packet.transactionHash}));}),
    submitOriginalFunding:F(input=>{s.submits++;s.trace.push('submit');assert.deepEqual(input.expectedPins,d.packet.expectedPins);return options.submit?options.submit(s,pending):Promise.resolve(F({phase:'FUNDING_INTAKE_BOUND',fundingIntakeStatus:'BOUND'}));}),
    handoffToService:F(input=>{s.handoffs++;return Promise.resolve(F({phase:'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED'}));}),
    submitOriginal:F(input=>{s.services++;return Promise.resolve(undefined);}),
    inspect:F(()=>options.view?options.view(s):F({sdk105FundingServiceLifecycleVersion:1,phase:'FUNDING',lifecycle:s.closed?'CLOSED':'OPEN',held:false,publicOperationActive:false})),
    close:F(()=>{s.closes++;s.closed=true;return options.close?options.close(s,pending):Promise.resolve(undefined);})});
  const ports=F({retain:F((id,text)=>{s.retains++;s.trace.push('retain');assert.equal(id,d.row.paymentId);if(options.retain)return options.retain(s,d,text);
    assert.equal(s.raw,null);s.raw=create(d.row,d.signer,text);return s.raw;}),
    read:F(id=>{s.reads++;s.trace.push('read');assert.equal(id,d.row.paymentId);return options.read?options.read(s,d):s.raw;}),
    assertCurrent:F(()=>{s.current++;s.trace.push('current');if(options.current)return options.current(s,d);})});
  const root=application(F({application:client,custody:ports,paymentId:d.row.paymentId,fundingResourceUrl:d.f.resourceUrl}));
  return {d,s,pending,root,ports,client,prepare:()=>root.prepareOriginalFunding(d.f.input),commit:()=>root.commitOriginalFunding(F({expectedPins:d.packet.expectedPins,originalGrantQueryProfile:d.text})),submit:()=>root.submitOriginalFunding(F({expectedPins:d.packet.expectedPins}))};
}
async function committed(options={}){const f=fixture(options);await f.prepare();await f.commit();return f;}

check('grant-custody-record-binds-existing-proof-to-the-exact-signed-context',()=>{const d=fundingGrantCustodyDataFixture(),raw=create(d.row,d.signer,d.text),r=inspect(raw,d.row,d.signer);assert.equal(r.transactionHash,d.packet.transactionHash);assert.equal(r.profileJson,d.text);assert.equal(r.originalDigest,d.row.originalDigest);});
check('grant-custody-record-keeps-proof-bytes-without-verifying-or-replacing-them',()=>{const d=fundingGrantCustodyDataFixture(),p=clone(d.profile);p.query.proof.signature='other-unauthenticated-data';const raw=create(d.row,d.signer,canonicalJson(p));assert.equal(JSON.parse(JSON.parse(raw).profileJson).query.proof.signature,p.query.proof.signature);});
check('grant-custody-capture-requires-independently-matching-original-pins',()=>{const d=fundingGrantCustodyDataFixture(),p=clone(d.profile.originalPayment);p.expectedPins.binding.paymentHash='a'.repeat(64);assert.throws(()=>capture(d.text,p));});
check('grant-custody-capture-rejects-another-checkpoint-or-funding-origin',()=>{const d=fundingGrantCustodyDataFixture();assert.throws(()=>capture(d.text,{...d.profile.originalPayment,serializedCheckpoint:d.packet.serializedCheckpoint+'\n'}));assert.throws(()=>capture(d.text,{...d.profile.originalPayment,resourceUrl:'https://foreign.invalid/funding'}));});
check('grant-custody-record-requires-reserved-exposure-and-a-signed-context',()=>{const d=fundingGrantCustodyDataFixture();assert.throws(()=>create({...d.row,status:'UNKNOWN'},d.signer,d.text));assert.throws(()=>create({...d.row,status:'SPENT',spentDay:1},d.signer,d.text));assert.throws(()=>create(d.row,d.initial,d.text));});
check('grant-custody-record-rejects-a-foreign-payment-or-reservation-digest',()=>{const d=fundingGrantCustodyDataFixture();assert.throws(()=>create({...d.row,paymentId:'foreign.payment'},d.signer,d.text));assert.throws(()=>create({...d.row,originalDigest:'sha256:'+'f'.repeat(64)},d.signer,d.text));});
check('grant-custody-inspection-preserves-records-after-unknown-and-spent-status',()=>{const d=fundingGrantCustodyDataFixture(),raw=create(d.row,d.signer,d.text);assert.equal(inspect(raw,{...d.row,status:'UNKNOWN'},d.signer).profileJson,d.text);assert.equal(inspect(raw,{...d.row,status:'SPENT',spentDay:1},d.signer).profileJson,d.text);});
check('grant-custody-inspection-rejects-noncanonical-extra-and-tampered-records',()=>{const d=fundingGrantCustodyDataFixture(),raw=create(d.row,d.signer,d.text);for(const changed of [raw+'\n',canonicalJson({...JSON.parse(raw),extra:true}),canonicalJson({...JSON.parse(raw),queryDigest:'f'.repeat(64)})])assert.throws(()=>inspect(changed,d.row,d.signer));});
check('grant-custody-projection-is-keyless-and-leaves-reservation-authority-unchanged',()=>{const d=fundingGrantCustodyDataFixture(),r=project(create(d.row,d.signer,d.text),d.expected);assert.equal(r.profileJson,d.text);assert.equal(r.spendingReservation,'UNCHANGED');for(const k of ['maySignPayment','mayDispatchFunding','mayDispatchService','mayActivateGrant'])assert.equal(r[k],false);assert.equal(r.authority,'NONE');});
check('grant-custody-projection-requires-all-four-independent-pins',()=>{const d=fundingGrantCustodyDataFixture(),raw=create(d.row,d.signer,d.text);for(const k of Object.keys(d.expected))assert.throws(()=>project(raw,{...d.expected,[k]:k==='paymentId'?'foreign':'f'.repeat(64)}));assert.throws(()=>project(raw,{paymentId:d.row.paymentId}));});
check('grant-custody-capture-refuses-getter-and-proxy-input-without-running-hooks',()=>{const d=fundingGrantCustodyDataFixture();let hooks=0;const p={...d.profile.originalPayment};Object.defineProperty(p,'expectedPins',{enumerable:true,get(){hooks++;throw Error();}});assert.throws(()=>capture(d.text,p));assert.throws(()=>capture(d.text,new Proxy({}, {getOwnPropertyDescriptor(){hooks++;throw Error();}})));assert.equal(hooks,0);});
check('grant-custody-profile-byte-bound-and-query-namespace-remain-closed',()=>{const d=fundingGrantCustodyDataFixture();assert.throws(()=>capture('x'.repeat(65537),d.profile.originalPayment));const p=clone(d.profile);p.query.proof.grantId='grant_'+'a'.repeat(64);assert.throws(()=>capture(canonicalJson(p),p.originalPayment));});
check('grant-custody-write-readback-precedes-local-commit-and-first-send',async()=>{const f=await committed();assert.ok(f.s.trace.indexOf('retain')<f.s.trace.indexOf('read'));assert.ok(f.s.trace.indexOf('read')<f.s.trace.indexOf('commit'));assert.equal(f.s.submits,0);await f.submit();assert.ok(f.s.trace.lastIndexOf('read')<f.s.trace.indexOf('submit'));assert.equal(f.s.retains,1);assert.equal(f.s.reads,2);await f.root.close();});
check('grant-custody-fixed-product-commit-without-profile-never-enters-store-or-child',async()=>{const f=fixture();await f.prepare();await assert.rejects(f.root.commitOriginalFunding({expectedPins:f.d.packet.expectedPins}));assert.equal(f.s.retains+f.s.commits+f.s.submits,0);await f.commit();await f.root.close();});
check('grant-custody-invalid-profile-is-refused-before-one-use-write-is-claimed',async()=>{const f=fixture();await f.prepare();await assert.rejects(f.root.commitOriginalFunding({expectedPins:f.d.packet.expectedPins,originalGrantQueryProfile:f.d.text+'\n'}));assert.equal(f.s.retains,0);await f.commit();assert.equal(f.s.retains,1);await f.root.close();});
check('grant-custody-no-local-commit-or-send-is-possible-before-preparation',async()=>{const f=fixture();await assert.rejects(f.commit());await assert.rejects(f.submit());assert.equal(f.s.retains+f.s.commits+f.s.submits,0);await f.root.close();});
check('grant-custody-retention-and-funding-submission-are-each-one-use',async()=>{const f=await committed();await assert.rejects(f.commit());await f.submit();await assert.rejects(f.submit());assert.equal(f.s.retains,1);assert.equal(f.s.commits,1);assert.equal(f.s.submits,1);await f.root.close();});
check('grant-custody-lost-retain-ack-preserves-stored-profile-and-blocks-commit',async()=>{const f=fixture({retain(s,d,text){s.raw=create(d.row,d.signer,text);throw Error('declared lost acknowledgement');}});await f.prepare();await assert.rejects(f.commit());assert.equal(f.s.commits+f.s.submits,0);assert.equal(project(f.s.raw,f.d.expected).profileJson,f.d.text);await assert.rejects(f.submit());await assert.rejects(f.root.close());});
check('grant-custody-promise-retain-is-not-a-synchronous-write-receipt',async()=>{const f=fixture({retain(s,d,text){return Promise.resolve(create(d.row,d.signer,text));}});await f.prepare();await assert.rejects(f.commit());assert.equal(f.s.commits+f.s.submits,0);assert.equal(f.root.inspect().held,true);await assert.rejects(f.root.close());});
check('grant-custody-opaque-thenable-receipts-never-run-then-hooks',async()=>{let hooks=0;const f=fixture({retain(){return F({get then(){hooks++;throw Error();}});}});await f.prepare();await assert.rejects(f.commit());assert.equal(hooks,0);assert.equal(f.s.commits,0);await assert.rejects(f.root.close());});
check('grant-custody-readback-mismatch-blocks-local-commit',async()=>{const f=fixture({read(){return null;}});await f.prepare();await assert.rejects(f.commit());assert.equal(f.s.commits+f.s.submits,0);await assert.rejects(f.root.close());});
check('grant-custody-changed-history-before-send-blocks-wire-entry',async()=>{let changed=false;const f=await committed({read(s){return changed?'{}':s.raw;}});changed=true;await assert.rejects(f.submit());assert.equal(f.s.submits,0);assert.equal(f.root.inspect().held,true);await assert.rejects(f.root.close());});
check('grant-custody-stale-owner-after-read-prevents-child-send',async()=>{let stale=false;const f=await committed({current(){if(stale)throw Error('declared stale owner');},read(s){if(s.commits)stale=true;return s.raw;}});await assert.rejects(f.submit());assert.equal(f.s.submits,0);await assert.rejects(f.root.close());});
check('grant-custody-nonvoid-owner-check-cannot-be-a-current-epoch-receipt',async()=>{const f=fixture({current(){return true;}});await f.prepare();await assert.rejects(f.commit());assert.equal(f.s.retains+f.s.commits+f.s.submits,0);await assert.rejects(f.root.close());});
check('grant-custody-commit-rejection-does-not-rewrite-custody-or-retry',async()=>{const f=fixture({commit(){return Promise.reject(Error('declared commit ambiguity'));}});await f.prepare();await assert.rejects(f.commit());const raw=f.s.raw;await assert.rejects(f.commit());await assert.rejects(f.submit());assert.equal(f.s.raw,raw);assert.equal(f.s.retains,1);assert.equal(f.s.commits,1);assert.equal(f.s.submits,0);await assert.rejects(f.root.close());});
check('grant-custody-funding-response-loss-keeps-proof-and-one-original-send',async()=>{const f=await committed({submit(){return Promise.reject(Error('declared funding ACK loss'));}});await assert.rejects(f.submit());assert.equal(project(f.s.raw,f.d.expected).profileJson,f.d.text);await assert.rejects(f.submit());assert.equal(f.s.submits,1);assert.equal(f.root.inspect().held,true);await assert.rejects(f.root.close());});
check('grant-custody-returned-unknown-funding-cannot-open-another-operation',async()=>{const f=await committed({submit(){return Promise.resolve(F({phase:'OUTCOME_UNKNOWN',fundingIntakeStatus:'UNKNOWN'}));}});await assert.rejects(f.submit());await assert.rejects(f.root.handoffToService({}));assert.equal(f.s.handoffs,0);assert.equal(f.s.retains,1);await assert.rejects(f.root.close());});
check('grant-custody-healthy-service-and-handoff-preserve-existing-child-results',async()=>{const f=await committed();await f.submit();assert.equal((await f.root.handoffToService({declared:true})).phase,'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED');assert.equal(await f.root.submitOriginal({declared:true}),undefined);assert.equal(f.s.handoffs,1);assert.equal(f.s.services,1);await f.root.close();});
check('grant-custody-inspection-does-not-export-proof-or-private-profile-text',async()=>{const f=await committed(),view=f.root.inspect();assert.equal(view.grantQueryRecovery.phase,'CAPTURED');const text=canonicalJson(view);assert.equal(text.includes('declared-proof-data'),false);assert.equal(text.includes('profileJson'),false);await f.root.close();});
check('grant-custody-close-is-cached-and-only-delegates-the-original-owner',async()=>{const f=await committed(),a=f.root.close(),b=f.root.close();assert.equal(a,b);await a;assert.equal(f.s.closes,1);await assert.rejects(f.submit());assert.equal(f.s.submits,0);});
check('grant-custody-close-during-prepare-retains-late-original-without-commit',async()=>{const f=fixture({prepare(s,p){return p.promise;}}),pending=f.prepare(),closing=f.root.close();await assert.rejects(closing);f.pending.resolve(F({phase:'AWAITING_INDEPENDENT_PINS',packet:f.d.packet}));await assert.rejects(pending);await assert.rejects(f.commit());assert.equal(f.s.commits+f.s.retains,0);assert.equal(f.s.closes,1);});
check('grant-custody-nonvoid-close-does-not-repair-a-clean-looking-child-view',async()=>{const f=fixture({close(){return Promise.resolve(true);}});await assert.rejects(f.root.close());assert.equal(f.root.inspect().held,true);});
check('grant-custody-active-retain-reentry-cannot-start-a-competing-send',async()=>{let rejected;const f=fixture({current(s){if(s.current===1){rejected=f.submit();rejected.catch(()=>{});}}});await f.prepare();await f.commit();await assert.rejects(rejected);assert.equal(f.s.submits,0);await f.root.close();});
check('grant-custody-API-command-codec-carries-profile-without-widening-legacy',()=>{const d=fundingGrantCustodyDataFixture(),command={version:1,id:'commit-1',operation:'commit',input:{expectedPins:d.packet.expectedPins,originalGrantQueryProfile:d.text}},line=encode(command);assert.equal(decode(line.slice(0,-1)).input.originalGrantQueryProfile,d.text);assert.throws(()=>legacy(command));});
check('grant-custody-API-command-result-does-not-echo-proof-or-query-profile',()=>{const d=fundingGrantCustodyDataFixture(),command={version:1,id:'commit-1',operation:'commit',input:{expectedPins:d.packet.expectedPins,originalGrantQueryProfile:d.text}},line=resultLine(command,F({phase:'LOCAL_STORE_READBACK_MATCHED',transactionHash:d.packet.transactionHash}));assert.equal(line.includes('declared-proof-data'),false);assert.equal(line.includes('originalGrantQueryProfile'),false);assert.equal(JSON.parse(line).result.publication,'NOT_PERFORMED');});
check('grant-custody-profile-cannot-be-smuggled-on-submit-or-recovery-commands',()=>{const d=fundingGrantCustodyDataFixture();assert.throws(()=>encode({version:1,id:'submit-1',operation:'submitFunding',input:{expectedPins:d.packet.expectedPins,originalGrantQueryProfile:d.text}}));assert.throws(()=>encode({version:1,id:'read-1',operation:'readRecoveryState',input:{}}));});
check('grant-custody-legacy-API-commit-codec-remains-readable-for-component-clients',()=>{const d=fundingGrantCustodyDataFixture(),line=encode({version:1,id:'commit-1',operation:'commit',input:{expectedPins:d.packet.expectedPins}});assert.deepEqual(decode(line.slice(0,-1)).input.expectedPins,d.packet.expectedPins);});

check('grant-custody-unobservable-borrower-prevents-competing-parent-close',async()=>{const pending=deferred(),f=fixture({retain(){return pending.promise;}});await f.prepare();await assert.rejects(f.commit());await assert.rejects(f.root.close());assert.equal(f.s.closes,0);assert.equal(f.root.inspect().grantQueryRecovery.custodyUnknown,true);pending.resolve('late-unobserved-data');await flush();assert.equal(f.s.closes,0);assert.equal(f.root.inspect().held,true);});
check('grant-custody-reentrant-close-waits-for-synchronous-borrower-return',async()=>{let closing,inside=-1;const f=fixture({current(s){if(s.current===1){closing=f.root.close();closing.catch(()=>{});inside=s.closes;}}});await f.prepare();await assert.rejects(f.commit());await assert.rejects(closing);assert.equal(inside,0);assert.equal(f.s.closes,1);assert.equal(f.s.retains+f.s.commits+f.s.submits,0);assert.equal(f.root.inspect().grantQueryRecovery.custodyActive,false);});

check('grant-custody-reentrant-close-with-unobservable-return-rejects-without-parent-close',async()=>{let closing;const p=deferred(),f=fixture({retain(){closing=f.root.close();closing.catch(()=>{});return p.promise;}});await f.prepare();await assert.rejects(f.commit());await assert.rejects(closing);assert.equal(f.s.closes,0);p.resolve('late');await flush();assert.equal(f.s.closes,0);assert.equal(f.root.inspect().grantQueryRecovery.custodyUnknown,true);});

export const apiCreditFundingGrantCustodyDataCases=F([...checks]);
if(process.argv[1]!==undefined&&fileURLToPath(import.meta.url)===process.argv[1]){
  const cases=[];let current=null,reported=false;
  function report(){if(reported)return;reported=true;const failed=cases.filter(r=>r.status!=='PASS').length;
    console.log(JSON.stringify({qualification:'G2_API_CREDIT_FUNDING_GRANT_CUSTODY_DATA',passed:cases.length-failed,failed,cases,
      actualRecordProjectionAndApplication:true,storageAndOwnerClientPorts:'DECLARED_MEMORY_ONLY',signatureData:'UNAUTHENTICATED_EXISTING_FIELDS',
      nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
      durablePersistence:'NOT_ESTABLISHED',freshProcess:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;}
  function unsettled(){if(current!==null){cases.push({id:current,status:'FAIL',error:'UNSETTLED_DECLARED_DATA_PROMISE'});report();}}
  process.once('beforeExit',unsettled);
  for(const {id,run}of checks){current=id;try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});}current=null;}
  process.off('beforeExit',unsettled);report();
}
