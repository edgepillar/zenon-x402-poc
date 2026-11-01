// Actual pure buyer/provider/journal/control codecs. No Python harness,
// process, native module, installed package, key, SQL or RPC is executed.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { createApiCreditLinuxProviderDataFixture } from './api-credit-linux-provider.fixture.mjs';
import { captureApiCreditProviderAcceptanceSelection as capture,apiCreditProviderAcceptancePlan as plan,
  apiCreditProviderAcceptanceSignerSelection as signer } from './api-credit-linux-provider-contract.mjs';

const F=Object.freeze,checks=[];let saved=null;
function check(id,run){checks.push(F({id,run}));}
async function fixture(){if(saved===null)saved=await createApiCreditLinuxProviderDataFixture();return {...saved.input};}
function edit(input,key,change){const value=JSON.parse(input[key]);change(value);input[key]=canonicalJson(value);}
async function refused(key,change){const input=await fixture();edit(input,key,change);assert.throws(()=>capture(input),/API_CREDIT_LINUX_PROVIDER_ACCEPTANCE/);}

check('linux-provider-selection-binds-the-same-ten-independent-text-inputs',async()=>{
  const input=await fixture(),s=capture(input).summary;assert.equal(s.version,5);assert.equal(s.status,'PREFLIGHT_PASS');
  assert.equal(Object.keys(s.inputPins).length,10);assert.equal(s.commandFrames,106);assert.equal(s.distinctRequests,100);
  assert.equal(s.providerProcesses,1);assert.equal(s.journalSetupProcesses,1);assert.equal(s.providerActivationCommands,1);
  assert.equal(s.afterBuyerReply,2);assert.equal(s.providerBeforeCredential,true);assert.equal(s.providerClosedBeforeLedgerProbe,true);
  assert.ok(Buffer.byteLength(JSON.stringify(s)+'\n')<=8192);
});
check('linux-provider-keeps-the-existing-signer-and-budget-observation-bindings',async()=>{
  const token=capture(await fixture());assert.equal(signer(token).summary.version,4);
  assert.equal(token.summary.signerSelectionDigest,signer(token).summary.selectionDigest);
  assert.equal(token.summary.budgetSelectionDigest,signer(token).summary.budgetSelectionDigest);
  assert.notEqual(token.summary.selectionDigest,token.summary.signerSelectionDigest);
});
check('linux-provider-start-and-close-frames-match-the-existing-control-protocol',async()=>{
  const p=plan(capture(await fixture()));assert.deepEqual(JSON.parse(p.startupReply),{version:1,id:'startup',operation:'START',outcome:'RETURNED',result:{status:'LISTENING'}});
  assert.deepEqual(JSON.parse(p.closeCommand),{version:1,id:'acceptance-close',operation:'CLOSE',argument:null});
  assert.deepEqual(JSON.parse(p.closeReply),{version:1,id:'acceptance-close',operation:'CLOSE',outcome:'RETURNED',result:{status:'CLOSED'}});
});
check('linux-provider-explicit-journal-initialization-retains-no-authority-or-release-claim',async()=>{
  const p=plan(capture(await fixture())),v=JSON.parse(p.journalReply);
  assert.equal(v.status,'INITIALIZED');assert.equal(v.exitCode,0);assert.equal(v.records,0);assert.equal(v.revision,0);
  assert.equal(v.authority,'NONE');assert.equal(v.physicalRelease,'NOT_ESTABLISHED');assert.equal(v.nativeAcceptance,'NOT_ESTABLISHED');
});
check('linux-provider-activate-ack-is-selected-before-output-and-matches-the-original-grant',async()=>{
  const input=await fixture(),token=capture(input),p=plan(token),commands=input.commands.trimEnd().split('\n').map(JSON.parse),v=JSON.parse(p.activationReply);
  assert.equal(p.activationCommand,input.providerActivation+'\n');assert.equal(v.operation,'ACTIVATE');assert.equal(v.id,'acceptance-activate');
  assert.equal(v.result.status,'ADMITTED');assert.equal(v.result.grantId,commands[3].input.selectedGrantId);
  assert.equal(v.result.transactionHash,commands[1].input.expectedPins.binding.paymentHash);
  assert.equal(v.result.activation,'EXPLICIT_LOCAL_OPERATOR');assert.equal(v.result.authority,'NONE');
  assert.equal(token.summary.fundingAcknowledgementCreatesGrantAuthority,false);
});
check('linux-provider-declared-observer-key-is-bound-but-not-authenticated-by-data-preflight',async()=>{
  const a=await fixture(),b={...a};edit(b,'providerActivation',v=>v.argument.recordKey='sha256:'+'c'.repeat(64));
  const x=capture(a),y=capture(b);assert.notEqual(x.summary.selectionDigest,y.summary.selectionDigest);
  assert.equal(x.summary.observerAuthentication,'NOT_ESTABLISHED');assert.equal(y.summary.observerAuthentication,'NOT_ESTABLISHED');
  assert.equal(plan(x).activationReply,plan(y).activationReply);
});
check('linux-provider-summary-does-not-expose-private-originals-command-frames-or-paths',async()=>{
  const input=await fixture(),text=JSON.stringify(capture(input).summary),commands=input.commands.trimEnd().split('\n').map(JSON.parse);
  for(const value of ['/synthetic/',commands[3].input.originalPayment.serializedCheckpoint,JSON.parse(input.providerActivation).argument.recordKey,
    JSON.parse(input.providerJournalProfile).journal.directory,'ServiceCredit '])assert.equal(text.includes(value),false);
});
check('linux-provider-frozen-plan-and-internal-token-cannot-be-forged',async()=>{
  const t=capture(await fixture());assert.equal(Object.isFrozen(plan(t)),true);assert.equal(Object.isFrozen(t.summary.providerReplyPins),true);
  assert.throws(()=>plan(F({...t})));assert.throws(()=>signer(F({...t})));assert.throws(()=>plan(t,{}));
});
check('linux-provider-selection-refuses-extra-input-accessors-and-proxies-without-hooks',async()=>{
  const input=await fixture();let hooks=0;const getter={...input};Object.defineProperty(getter,'providerProfile',{enumerable:true,get(){hooks++;return input.providerProfile;}});
  assert.throws(()=>capture(getter));assert.throws(()=>capture({...input,key:'unselected'}));
  assert.throws(()=>capture(new Proxy({},{ownKeys(){hooks++;return [];}})));assert.equal(hooks,0);
});
check('linux-provider-profile-is-explicit-v3-fresh-and-journal-only',async()=>{
  await refused('providerProfile',v=>{v.providerBootstrapVersion=2;delete v.executionSetup;});
  await refused('providerProfile',v=>{v.applicationMode='RECORDED';v.recovery={boundRowDigest:'sha256:'+'b'.repeat(64),outcomeRecordDigest:'sha256:'+'c'.repeat(64)};});
  await refused('providerProfile',v=>v.funding.pendingObservationMode='ORIGINAL_RPC');
});
check('linux-provider-offer-and-funding-terms-must-equal-the-independent-purchase',async()=>{
  await refused('providerProfile',v=>v.offer.providerId='foreign.provider');
  await refused('providerProfile',v=>v.funding.terms.totalUnits=101);
  await refused('providerProfile',v=>v.funding.selection.capabilityCommitment='sha256:'+'f'.repeat(64));
});
check('linux-provider-rejects-a-different-product-or-cost-policy',async()=>{
  await refused('providerProfile',v=>v.service.productId='another-product');
  await refused('providerProfile',v=>v.offer.costPolicyId='fixed.synthetic');
});
check('linux-provider-service-store-file-root-and-all-limits-must-match-the-ledger-probe',async()=>{
  await refused('providerProfile',v=>v.serviceStore.databasePath=v.serviceStore.allowedRoot+'/foreign.sqlite');
  await refused('providerProfile',v=>{v.serviceStore.allowedRoot='/other';v.serviceStore.databasePath='/other/backend.sqlite';});
  await refused('providerProfile',v=>v.serviceStore.maxRequests=101);
});
check('linux-provider-intake-cannot-alias-the-payer-or-spending-database',async()=>{
  const input=await fixture(),run=JSON.parse(input.runProfile);
  for(const [databasePath,allowedRoot]of [[run.configuration.storeOptions.databasePath,run.configuration.storeOptions.allowedRoot],
    [run.spendingFile.storageProfile.databasePath,run.spendingFile.allowedRoot]]){
    const v={...input};edit(v,'providerProfile',p=>{p.intakeStore.databasePath=databasePath;p.intakeStore.allowedRoot=allowedRoot;});assert.throws(()=>capture(v));
  }
});
check('linux-provider-https-origin-bind-port-and-original-funding-url-are-fixed',async()=>{
  await refused('providerProfile',v=>{v.transport.origin='https://other.invalid';v.funding.resourceUrl='https://other.invalid/funding';});
  await refused('providerProfile',v=>v.transport.bind.host='0.0.0.0');await refused('providerProfile',v=>v.transport.bind.port=4444);
});
check('linux-provider-rpc-selection-refuses-external-hosts-credentials-paths-and-query',async()=>{
  for(const rpcUrl of ['wss://other.invalid/','ws://0.0.0.0:35997/','ws://127.0.0.1:35997/path','ws://127.0.0.1:35997/?changed',
    'ws://user@127.0.0.1:35997/'])await refused('providerProfile',v=>v.chain.rpcUrl=rpcUrl);
});
check('linux-provider-journal-selection-cannot-change-directory-or-selected-device',async()=>{
  await refused('providerJournalProfile',v=>v.journal.directory=v.journal.allowedRoot+'/foreign');
  await refused('providerJournalProfile',v=>v.expectedDevice='999');
});
check('linux-provider-activation-rejects-another-command-id-operation-or-observer-file',async()=>{
  await refused('providerActivation',v=>v.id='other');
  await refused('providerActivation',v=>{v.operation='RESUME';v.argument=null;});
  await refused('providerActivation',v=>v.argument.observerFileName='funding-observer-'+'f'.repeat(64)+'.sqlite');
});
check('linux-provider-activation-rejects-traversal-and-incomplete-original-key',async()=>{
  await refused('providerActivation',v=>v.argument.observerFileName='../funding.sqlite');
  await refused('providerActivation',v=>v.argument.recordKey='not-a-record-key');
});
check('linux-provider-added-inputs-refuse-noncanonical-or-oversized-frames',async()=>{
  const input=await fixture();for(const key of ['providerProfile','providerJournalProfile','providerActivation']){
    assert.throws(()=>capture({...input,[key]:input[key]+'\n'}));assert.throws(()=>capture({...input,[key]:' '.repeat(262145)}));
  }
});
check('linux-provider-reply-pins-cover-every-selected-bootstrap-activation-and-close-frame',async()=>{
  const token=capture(await fixture()),p=plan(token);assert.equal(Object.keys(p).length,6);
  for(const [name,text]of Object.entries(p)){assert.equal(token.summary.providerReplyPins[name].bytes,Buffer.byteLength(text));assert.match(token.summary.providerReplyPins[name].sha256,/^[0-9a-f]{64}$/);assert.equal(text.endsWith('\n'),true);}
});
check('linux-provider-data-never-claims-linux-transport-chain-authentication-or-gate-completion',async()=>{
  const s=capture(await fixture()).summary;assert.equal(s.authority,'NONE');assert.equal(s.providerLifecycleAcceptance,'NOT_EXECUTED');
  assert.equal(s.loopbackRPCAuthentication,'NOT_ESTABLISHED');assert.equal(s.G1Acceptance,'NOT_ESTABLISHED');assert.equal(s.G2Acceptance,'NOT_ESTABLISHED');
});

export const apiCreditLinuxProviderDataCases=F(checks);
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const cases=[];for(const {id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,160),stage:typeof e?.stage==='string'?e.stage:null});break;}}
  await closeApiCreditOperatorDataFixtures();const failed=cases.filter(c=>c.status==='FAIL').length;
  process.stdout.write(JSON.stringify({qualification:'G1_LINUX_PROVIDER_LIFECYCLE_SELECTION_DATA',passed:cases.length-failed,failed,cases,
    nativeExecutions:0,pythonHarnessExecutions:0,installedSDKOrCoreEvaluation:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,
    fixtureAuthentication:'NOT_ESTABLISHED',Linux:'NOT_ESTABLISHED',providerProcessLifecycle:'NOT_EXECUTED',G0G5:'OPEN'})+'\n');
  if(failed)process.exitCode=1;
}
