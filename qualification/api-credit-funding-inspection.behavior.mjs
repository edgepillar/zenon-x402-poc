// Actual codecs, funding owner and coordinator; only declared memory ports.
// Existing synthetic transaction-field DATA is not a key or signature test.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as assemble } from '../src/zenon/dynamic-plasma-original-funding-data.js';
import { restoreOriginalPaymentCheckpoint } from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { canonicalJson } from '../src/canonical.js';
import { captureApiCreditCliArguments as args } from '../src/api-credit-cli-arguments.js';
import { captureApiCreditCliExecutionContext as context } from '../src/api-credit-cli-execution-context.js';
import { decodeApiCreditFundingInspectionProfile as decode, consumeApiCreditFundingInspectionProfile as consume,
  releaseApiCreditFundingInspectionProfile as release } from '../src/api-credit-funding-inspection-profile.js';
import { runApiCreditFundingInspectionOwner as own, captureApiCreditFundingInspectionOutput as output } from '../src/api-credit-funding-inspection-owner.js';
import { runApiCreditFundingInspectionCoordinator as coordinate } from '../src/api-credit-recovery-inspection-coordinator.js';

const F = Object.freeze, checks = [], argv = () => ['--funding-inspect-fd', '3', '--output-fd', '6', '--bootstrap-ms', '1000'];
function check(id, run) { checks.push({ id, run }); }
function envelope() {
  const f = retainedOriginalInputFixture(), packet = assemble(f.input, f.candidate, f.resourceUrl);
  return JSON.parse(canonicalJson({ fundingInspectionVersion: 1,
    originalPayment: { resourceUrl: f.resourceUrl, serializedCheckpoint: packet.serializedCheckpoint, expectedPins: packet.expectedPins },
    payerOptions: { databasePath: '/synthetic/funding/payer.sqlite', allowedRoot: '/synthetic/funding', custodyPolicy:
      { policyVersion: 1, serviceResourceUrl: new URL(f.resourceUrl).origin + '/service-credit/v1/execute', maxRequests: 128 } } }));
}
function fixture(options = {}, captured = null) {
  const token = captured === null ? decode(canonicalJson(envelope())) : null, p = captured ?? consume(token);
  if (token !== null) release(token);
  const checkpoint = restoreOriginalPaymentCheckpoint(p.serializedCheckpoint, p.expectedPins);
  const s = { trace: [], opened: 0, stateReads: 0, checkpointReads: 0, closes: 0, closed: false, expired: false, active: false, writes: 0 };
  const store = F({ declaredExistingV6Store: true });
  const state = () => F({ revision: options.revision ?? 3, status: options.status ?? 'OUTCOME_UNKNOWN',
    ambiguityLatched: options.ambiguity ?? true, resourceUrl: p.fundingResourceUrl, challengeHeader: p.challengeHeader, paymentHeader: p.paymentHeader,
    paymentRequired: F({}), paymentPayload: F({}), requirement: F({}) });
  const ports = F({
    openExisting: F(profile => { assert.equal(profile, p); s.trace.push('open-existing'); s.opened++;
      if (options.open) return options.open(s, store); return store; }),
    readState: F(owner => { assert.equal(owner, store); s.trace.push('state'); s.stateReads++; return options.state ? options.state(s, state()) : options.absent ? null : state(); }),
    readCheckpoint: F((owner, pins) => { assert.equal(owner, store); assert.equal(pins, p.expectedPins); s.trace.push('checkpoint'); s.checkpointReads++;
      return options.checkpoint ? options.checkpoint(s, checkpoint) : options.absent ? null : checkpoint; }),
    inspectStore: F(owner => { assert.equal(owner, store); s.trace.push('view'); return options.view ? options.view(s) :
      F({ payerFundingInspectionLifecycleVersion: 1, active: s.active, quarantined: false, closed: s.closed, databaseOpen: !s.closed }); }),
    closeStore: F(owner => { assert.equal(owner, store); s.trace.push('close'); s.closes++; if (options.close) return options.close(s); s.closed = true; }),
  });
  const guard = F(() => { if (s.expired) throw Error('synthetic observation expiry'); });
  const configuration = F({ profile: p, ports, requireOpening: guard });
  return { p, s, store, ports, guard, configuration, run: () => own(configuration) };
}
function powerless(value) {
  assert.equal(value.authority, 'NONE'); assert.equal(value.reconciliationRequired, true); assert.equal(value.spendingReservation, 'UNCHANGED');
  for (const flag of ['mayStartPayment', 'maySignPayment', 'maySubmitFunding', 'mayDispatchService', 'mayActivateGrant']) assert.equal(value[flag], false);
  assert.equal(value.providerFundingStatus, 'NOT_QUERIED'); assert.equal(value.grantActivation, 'NOT_ESTABLISHED'); assert.equal(value.serviceDelivery, 'NOT_ESTABLISHED');
}
function coordinator(options = {}) {
  const r = { text: canonicalJson(envelope()), now: 0n, timers: [], writes: [], reads: 0, closes: 0, channelClosed: false, owned: null };
  const ports = F({
    readProfile: F(g => { g(); return Promise.resolve(r.text); }),
    inspectOriginal: F((profile, guard) => {
      r.reads++; r.profile = profile;
      try { const captured = consume(profile); r.owned = fixture(options.owner ?? {}, captured);
        const result = own(F({ profile: captured, ports: r.owned.ports, requireOpening: guard }));
        return options.result ? Promise.resolve(options.result(result, r)) : Promise.resolve(result);
      } catch (error) { return Promise.reject(error); } finally { release(profile); }
    }),
    writeResult: F((line, guard) => { guard(); assert.equal(r.owned.s.closed, true); r.writes.push(line); return options.write ? options.write(r) : Promise.resolve(undefined); }),
    close: F(() => { r.closes++; r.channelClosed = true; return Promise.resolve(undefined); }),
    inspect: F(() => F({ lifecycle: r.channelClosed ? 'CLOSED' : 'OPEN', held: false, reading: false, writing: false })),
    clock: F(() => r.now), armTimer: F((budget, callback) => { const token = { budget, callback }; r.timers.push(token); return token; }), cancelTimer: F(token => { token.cancelled = true; }),
  });
  return { r, run: () => coordinate({ arguments: args(argv()), ports }) };
}

check('funding-inspection-arguments-have-two-distinct-owned-pipes-and-no-key-grant-or-service-proof', () => {
  assert.deepEqual(args(argv()), { mode: 'FUNDING_INSPECT', fundingInspectionFd: 3, outputFd: 6, bootstrapMs: 1000 });
  for (const values of [['--funding-inspect-fd','3','--output-fd','3','--bootstrap-ms','1000'], [...argv(),'--key-fd','4'],
    ['--funding-inspect-fd','03','--output-fd','6','--bootstrap-ms','1000'], ['--funding-inspect-fd','3','--output-fd','6','--bootstrap-ms','0']]) assert.throws(() => args(values));
});
check('funding-inspection-keeps-the-fixed-runtime-and-visible-plain-process-admission', () => {
  const clean = { execArgv: [], nodeOptions: undefined, nodePath: undefined, preserveSymlinks: undefined };
  assert.equal(context(argv(),'24.19.0','node','linux','x64',clean).mode,'FUNDING_INSPECT');
  assert.deepEqual(context(argv(),'25.0.0','node','linux','x64',clean),{mode:'RUNTIME_REFUSED'});
  assert.deepEqual(context(argv(),'24.19.0','node','linux','x64',{...clean,nodeOptions:'--import=unselected'}),{mode:'EXECUTION_CONTEXT_REFUSED'});
});
check('funding-inspection-profile-admits-one-independent-original-before-any-grant-is-known', () => {
  const e = envelope(), p = decode(canonicalJson(e)), c = consume(p);
  assert.equal(c.serializedCheckpoint, e.originalPayment.serializedCheckpoint); assert.equal(c.paymentHash, e.originalPayment.expectedPins.binding.paymentHash);
  assert.equal(p.checkpointDigest,createHash('sha256').update(c.serializedCheckpoint).digest('hex'));
  assert.ok(Object.isFrozen(c)); assert.ok(Object.isFrozen(c.expectedPins)); assert.throws(()=>consume(p)); release(p); release(p);
});
check('funding-inspection-profile-refuses-db-learned-pins-altered-originals-and-noncanonical-json', () => {
  for (const change of [e=>{e.originalPayment.expectedPins.digests.context='0'.repeat(64);},e=>{e.originalPayment.serializedCheckpoint+=' ';},
    e=>{e.originalPayment.resourceUrl=new URL(e.originalPayment.resourceUrl).origin+'/paid';}]) { const e=envelope();change(e);assert.throws(()=>decode(canonicalJson(e))); }
  const text=canonicalJson(envelope());assert.throws(()=>decode(text+'\n'));assert.throws(()=>decode(' '+text));
});
check('funding-inspection-profile-has-no-grant-proof-loader-or-backend-selector', () => {
  for (const name of ['selectedGrantId','authorizationHeader','backendOptions','keyPair','module','openStore','submitFunding']) {
    const e=envelope();e[name]='unselected';assert.throws(()=>decode(canonicalJson(e)));
  }
});
check('funding-inspection-profile-refuses-nested-foreign-and-malformed-store-paths', () => {
  for (const path of ['/foreign/payer.sqlite','/synthetic/funding/nested/payer.sqlite','/synthetic/funding/../payer.sqlite','/synthetic/funding/payer.sqlite\0']) {
    const e=envelope();e.payerOptions.databasePath=path;assert.throws(()=>decode(canonicalJson(e)));
  }
});
check('funding-inspection-profile-release-and-lookalikes-do-not-restore-ownership', () => {
  const p=decode(canonicalJson(envelope()));assert.throws(()=>consume(F({...p})));assert.throws(()=>release(F({...p})));release(p);assert.throws(()=>consume(p));
});
check('funding-inspection-unknown-original-byte-checkpoints-and-revision-survive-the-read-unchanged', () => {
  const f=fixture(),v=f.run();powerless(v);assert.equal(v.localStatus,'OUTCOME_UNKNOWN');assert.equal(v.ambiguityLatched,true);
  assert.equal(v.serializedCheckpoint,f.p.serializedCheckpoint);assert.equal(v.revision,3);assert.equal(v.originalCheckpointMatched,true);
  assert.equal(f.s.stateReads,2);assert.equal(f.s.checkpointReads,2);assert.equal(f.s.closes,1);assert.equal(f.s.writes,0);
  assert.deepEqual(f.s.trace,['open-existing','view','checkpoint','state','state','checkpoint','view','close','view']);
});
check('funding-inspection-all-existing-local-statuses-stay-historical-without-funding-retry', () => {
  for (const status of ['PREPARED','ATTEMPT_FENCED','OUTCOME_UNKNOWN','BOUND','PAYMENT_REJECTED','PAYMENT_CONFLICT']) {
    const f=fixture({status,ambiguity:['ATTEMPT_FENCED','OUTCOME_UNKNOWN','BOUND'].includes(status)}),v=f.run();
    assert.equal(v.localStatus,status);powerless(v);assert.equal(f.s.writes,0);assert.equal(f.s.closes,1);
  }
});
check('funding-inspection-an-absent-record-does-not-manufacture-a-stored-checkpoint-or-payment-permission', () => {
  const f=fixture({absent:true}),v=f.run();assert.equal(v.localStatus,'ABSENT');assert.equal(v.serializedCheckpoint,null);
  assert.equal(v.originalCheckpointMatched,false);assert.equal(v.recordPresent,false);powerless(v);assert.equal(f.s.closes,1);
});
check('funding-inspection-state-drift-cannot-be-presented-as-one-stable-original', () => {
  const f=fixture({state:(s,v)=>s.stateReads===2?F({...v,revision:v.revision+1}):v});assert.throws(f.run);
  assert.equal(f.s.stateReads,2);assert.equal(f.s.checkpointReads,2);assert.equal(f.s.closes,1);
});
check('funding-inspection-changed-checkpoint-is-refused-without-repeated-reads-or-a-new-original', () => {
  const f=fixture({checkpoint:(s,v)=>s.checkpointReads===2?F({...v,authorization:'CHANGED'}):v});assert.throws(f.run);
  assert.equal(f.s.checkpointReads,2);assert.equal(f.s.stateReads,2);assert.equal(f.s.closes,1);
});
check('funding-inspection-foreign-payment-headers-are-refused-and-the-known-owner-is-stopped', () => {
  const f=fixture({state:(s,v)=>F({...v,paymentHeader:'foreign'})});assert.throws(f.run);assert.equal(f.s.closes,1);
});
check('funding-inspection-query-failure-stops-only-the-known-quiescent-owner', () => {
  const f=fixture({state(){throw Error('synthetic query failure');}});assert.throws(f.run);assert.equal(f.s.closes,1);assert.equal(f.s.closed,true);
});
check('funding-inspection-expiry-after-a-returned-read-closes-the-known-store-and-withholds-output', () => {
  const f=fixture({state:(s,v)=>{s.expired=true;return v;}});assert.throws(f.run);assert.equal(f.s.closes,1);assert.equal(f.s.closed,true);
});
check('funding-inspection-unreturned-open-does-not-guess-a-handle-or-start-a-competing-close', () => {
  const f=fixture({open(){throw Error('synthetic unreturned owner');}});assert.throws(f.run);assert.equal(f.s.opened,1);assert.equal(f.s.closes,0);
});
check('funding-inspection-unobservable-open-promise-is-not-assimilated-or-adopted-late', async () => {
  const f=fixture({open:()=>Promise.reject(Error('synthetic open unknown'))});assert.throws(f.run);await Promise.resolve();assert.equal(f.s.closes,0);
});
check('funding-inspection-unjoined-read-promise-retains-the-store-instead-of-closing-an-active-borrower', async () => {
  const f=fixture({state:()=>Promise.reject(Error('synthetic async read'))});assert.throws(f.run);await Promise.resolve();assert.equal(f.s.closes,0);
});
check('funding-inspection-still-active-store-is-retained-without-a-competing-close', () => {
  const f=fixture({state:(s,v)=>{s.active=true;return v;}});assert.throws(f.run);assert.equal(f.s.closes,0);
});
check('funding-inspection-physical-close-failure-is-one-attempt-and-no-result', () => {
  const f=fixture({close(){throw Error('synthetic close unknown');}});assert.throws(f.run);assert.equal(f.s.closes,1);
  assert.throws(f.run);assert.equal(f.s.closes,1);assert.equal(f.s.opened,1);
});
check('funding-inspection-a-void-close-requires-a-fresh-closed-quiescent-native-view', () => {
  const f=fixture({view:s=>F({payerFundingInspectionLifecycleVersion:1,active:false,quarantined:false,closed:false,databaseOpen:true})});
  assert.throws(f.run);assert.equal(f.s.closes,1);
});
check('funding-inspection-nonvoid-close-is-retained-and-not-retried', async () => {
  const f=fixture({close:()=>Promise.resolve(undefined)});assert.throws(f.run);await Promise.resolve();assert.equal(f.s.closes,1);assert.throws(f.run);assert.equal(f.s.closes,1);
});
check('funding-inspection-checkpoint-proxies-refuse-without-entering-user-hooks', () => {
  let entered=0;const proxy=new Proxy({}, {get(){entered++;throw Error('unselected');},getPrototypeOf(){entered++;throw Error('unselected');}});
  const f=fixture({checkpoint:()=>proxy});assert.throws(f.run);assert.equal(entered,0);assert.equal(f.s.closes,0);
});
check('funding-inspection-result-codec-refuses-economic-authority-and-erased-ambiguity', () => {
  const v=fixture().run();
  for (const change of [{maySubmitFunding:true},{mayActivateGrant:true},{reconciliationRequired:false},{authority:'PAY'},
    {spendingReservation:'RELEASED'},{ambiguityLatched:false},{providerFundingStatus:'BOUND'},{fundingAcknowledgement:'CONFIRMED'},{nativeResourceRelease:'PROVEN'}]) assert.throws(()=>output(F({...v,...change})));
});
check('funding-inspection-result-codec-rejects-unselected-grant-proof-key-and-unbounded-fields', () => {
  const v=fixture().run();for(const key of ['grantId','authorizationHeader','keyPair','backendDatabasePath'])assert.throws(()=>output(F({...v,[key]:'unselected'})));
  assert.throws(()=>output(F({...v,serializedCheckpoint:'x'.repeat(32769)})));assert.throws(()=>output({...v}));
});
check('funding-inspection-owner-is-one-use-and-exposes-no-store-signing-or-dispatch-capability', () => {
  const f=fixture(),v=f.run();assert.throws(f.run);assert.equal(f.s.opened,1);assert.equal(f.s.closes,1);assert.equal(Object.isFrozen(v),true);
  for(const key of ['store','retry','recoverAfterRestart','grantId','sign','submit','prepare'])assert.equal(Object.hasOwn(v,key),false);
});
check('funding-inspection-actual-coordinator-writes-the-original-only-after-the-owned-store-close', async () => {
  const f=coordinator(),r=await f.run();assert.equal(r.apiCreditFundingInspectionVersion,1);assert.equal(r.status,'CLOSED');assert.equal(r.exitCode,0);
  assert.equal(f.r.writes.length,1);assert.equal(f.r.owned.s.closes,1);assert.equal(f.r.closes,1);const v=JSON.parse(f.r.writes[0]);powerless(v);
  assert.equal(v.serializedCheckpoint,JSON.parse(f.r.text).originalPayment.serializedCheckpoint);assert.ok(Buffer.byteLength(f.r.writes[0])<=65536);
});
check('funding-inspection-invalid-coordinator-profile-is-refused-before-store-entry', async () => {
  const f=coordinator();f.r.text='{}';const r=await f.run();assert.equal(r.status,'BOOTSTRAP_REFUSED');assert.equal(f.r.reads,0);assert.equal(f.r.writes.length,0);
});
check('funding-inspection-coordinator-rejects-a-foreign-payment-or-resource-before-output', async () => {
  for (const change of [{paymentHash:'f'.repeat(64)},{fundingResourceUrl:'https://foreign.example.test/funding'}]) {
    const f=coordinator({result:v=>F({...v,...change})}),r=await f.run();assert.equal(r.status,'CLOSE_UNKNOWN');assert.equal(f.r.writes.length,0);assert.equal(f.r.owned.s.closes,1);
  }
});
check('funding-inspection-coordinator-checks-independent-original-byte-digest-again-before-output', async () => {
  const f=coordinator({result:v=>F({...v,serializedCheckpoint:v.serializedCheckpoint+' '})}),r=await f.run();
  assert.equal(r.status,'CLOSE_UNKNOWN');assert.equal(f.r.writes.length,0);assert.equal(f.r.owned.s.closes,1);
});
check('funding-inspection-coordinator-write-loss-never-reopens-the-store-or-retries-the-output', async () => {
  const f=coordinator({write:()=>Promise.reject(Error('synthetic result loss'))}),r=await f.run();assert.equal(r.status,'CLOSE_UNKNOWN');
  assert.equal(f.r.writes.length,1);assert.equal(f.r.owned.s.opened,1);assert.equal(f.r.owned.s.closes,1);assert.equal(f.r.closes,1);
});

const cases=[];for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(error){cases.push({id,status:'FAIL',error:String(error?.message??error)});}}
const failed=cases.filter(row=>row.status!=='PASS').length;
console.log(JSON.stringify({qualification:'G2_API_CREDIT_FUNDING_INSPECTION_DATA',passed:cases.length-failed,failed,cases,
 actualFundingOwnerAndCoordinator:true,storeAndLifecyclePorts:'DECLARED_DATA_ONLY',
 nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
 nativeFundingInspectionExecuted:false,nativePhysicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED'}));
if(failed)process.exitCode=1;
