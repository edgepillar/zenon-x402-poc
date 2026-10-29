// Real wallet/planner source with declared clock/store/key-method/wire ports.
// No SDK, SQL, socket, real keys/signatures, work search or native PREPARE.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { apiCreditSignerInspectionDataCases } from './api-credit-signer-inspection.behavior.mjs';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { signerEntryUnitFixture as unit, signerEntryCompositionFixture as composition } from './api-credit-signer-entry-age.fixture.mjs';
import { createSdk105AgeBoundSignerContextWalletOwner as create } from '../src/zenon/sdk105-prepared-hash-wallet-owner.js';
import { beginWalletOriginalFundingPreSignObservation as begin } from '../src/zenon/original-funding-signer-context-bridge.js';
import { decodeOriginalFundingSignerContextRecord as decode } from '../src/original-funding-signer-context-custody.js';
import { canonicalJson } from '../src/canonical.js';
const F = Object.freeze, checks = [...apiCreditSignerInspectionDataCases];
function check(id, run) { checks.push({ id, run }); }
async function drain() { for (let i = 0; i < 16; i++) await Promise.resolve(); }
async function refused(r) { await assert.rejects(r.sign()); assert.equal(r.signs, 0); await assert.rejects(r.sign()); assert.equal(r.signs, 0); }
check('signer-age-construction-enters-no-clock-key-or-store-method', async () => {
  const r = unit(); assert.equal(r.clockCalls, 0); assert.equal(r.keyCalls, 0); assert.equal(r.begins, 0); assert.equal(r.raw, null); await r.owner.close();
});
check('signer-age-configuration-requires-context-marker-frozen-clock-and-bounded-limit', () => {
  const r = unit(); for (const limit of [0,-1,60001,1.5,'1000']) assert.throws(() => create(r.configuration,r.custody,{...r.entry,maxReadToSignerMs:limit}));
  assert.throws(() => create(r.configuration,r.custody,{...r.entry,clock:()=>0n}));
  assert.throws(() => create(r.configuration,{...r.custody,backend:F({beginSignerAttempt:r.backend.beginSignerAttempt,retainSignerResult:r.backend.retainSignerResult})},r.entry));
  assert.equal(r.keyCalls,0); assert.equal(r.clockCalls,0);
});
check('signer-age-observation-requires-an-original-preparation-before-clock-entry', () => {
  const r = unit(); assert.throws(r.begin); assert.equal(r.clockCalls,0); assert.equal(r.begins,0);
});
check('signer-age-context-cannot-bind-without-the-pre-read-observation', async () => {
  const r=unit();r.prepare();assert.throws(r.bind);await refused(r);assert.equal(r.begins,0);assert.equal(r.raw,null);
});
check('signer-age-observation-is-one-shot-and-cannot-renew-its-deadline', async () => {
  const r=unit();r.prepare();r.begin();r.now=999000000n;assert.throws(r.begin);r.bind();r.now=1000000000n;await refused(r);assert.equal(r.begins,0);
});
check('signer-age-under-budget-custody-and-exact-result-follow-the-original-order', async () => {
  const r=unit({intent:r=>{r.now=999999999n;}});r.admit();const signed=await r.sign();assert.equal(signed.hash,r.unsigned.hash);assert.equal(r.signs,1);assert.equal(r.retains,1);
  const at=r.trace.indexOf('sdk-entry');assert.equal(r.trace[at-1],'clock');assert.ok(r.trace.indexOf('intent-commit')<at);assert.ok(at<r.trace.indexOf('result-commit'));await r.owner.close();
});
check('signer-age-exact-boundary-after-intent-retains-intent-with-zero-sdk-entry', async () => {
  const r=unit({intent:r=>{r.now=1000000000n;}});r.admit();await refused(r);assert.equal(r.begins,1);assert.equal(r.retains,0);assert.equal(decode(r.raw).phase,'INTENT');assert.equal(r.owner.inspect().held,true);
});
check('signer-age-long-intent-latency-cannot-become-a-second-economic-attempt', async () => {
  const r=unit({intent:r=>{r.now=60000000000n;}});r.admit();await refused(r);const original=r.raw;r.now=0n;assert.throws(r.begin);await refused(r);assert.equal(r.raw,original);assert.equal(r.begins,1);
});
check('signer-age-expiry-before-intent-does-not-write-a-signer-record', async () => {
  const r=unit();r.admit();r.now=1000000000n;await refused(r);assert.equal(r.begins,0);assert.equal(r.raw,null);assert.equal(r.row.status,'RESERVED');
});
check('signer-age-last-read-latency-is-counted-before-context-binding', () => {
  const r=unit();r.prepare();r.begin();r.now=1000000000n;assert.throws(r.bind);assert.equal(r.begins,0);assert.equal(r.signs,0);assert.equal(r.owner.inspect().signerCustody.signerEntryAge.refused,true);
});
check('signer-age-negative-initial-clock-cannot-open-a-window', () => {
  const r=unit({start:-1n});r.prepare();assert.throws(r.begin);assert.equal(r.begins,0);assert.equal(r.signs,0);
});
check('signer-age-backward-clock-after-intent-keeps-original-data-and-refuses', async () => {
  const r=unit({start:100n,intent:r=>{r.now=99n;}});r.admit();await refused(r);assert.equal(decode(r.raw).phase,'INTENT');assert.equal(r.owner.inspect().held,true);
});
check('signer-age-non-bigint-clock-values-are-refused-without-coercion', () => {
  for(const value of [0,'0',null,undefined]){const r=unit({clock:()=>value});r.prepare();assert.throws(r.begin);assert.equal(r.begins,0);}
});
check('signer-age-throwing-clock-is-terminal-for-the-original-window', () => {
  const r=unit({clock:()=>{throw Error('declared clock loss');}});r.prepare();assert.throws(r.begin);assert.throws(r.begin);assert.equal(r.clockCalls,1);
});
check('signer-age-unexpected-native-promise-clock-is-drained-without-awaiting', async () => {
  const r=unit({clock:()=>Promise.reject(Error('declared async clock'))});r.prepare();assert.throws(r.begin);await drain();assert.equal(r.signs,0);assert.equal(r.begins,0);
});
check('signer-age-thenable-clock-getter-is-never-entered', () => {
  let entered=0;const value={};Object.defineProperty(value,'then',{get(){entered++;throw Error('must not assimilate');}});
  const r=unit({clock:()=>value});r.prepare();assert.throws(r.begin);assert.equal(entered,0);
});
check('signer-age-closed-owner-cannot-start-or-renew-an-observation', async () => {
  const r=unit();r.prepare();await r.owner.close();assert.throws(r.begin);assert.equal(r.clockCalls,0);assert.equal(r.clears,1);
});
check('signer-age-lost-intent-reply-preserves-original-capsule-without-sdk-entry', async () => {
  const r=unit({intent:()=>{throw Error('declared acknowledgement loss');}});r.admit();await refused(r);assert.equal(decode(r.raw).preSignContextJson,r.context.preSignContextJson);assert.equal(r.owner.inspect().held,true);
});
check('signer-age-expiry-after-sdk-entry-never-drops-or-regenerates-the-original-result', async () => {
  const r=unit({sign:r=>{r.now=2000000000n;}});r.admit();const signed=await r.sign();assert.equal(signed.hash,r.unsigned.hash);assert.equal(decode(r.raw).phase,'SIGNED');await assert.rejects(r.sign());assert.equal(r.signs,1);await r.owner.close();
});
check('signer-age-clock-loss-after-intent-preserves-committed-unknown', async () => {
  const r=unit({clock:r=>{if(r.begins)throw Error('declared clock loss');return r.now;}});r.admit();await refused(r);assert.equal(decode(r.raw).phase,'INTENT');assert.equal(r.retains,0);
});
check('signer-age-close-during-intent-cannot-enter-sdk-or-compete-with-stop', async () => {
  const r=unit({intent:r=>{r.stop=r.owner.close();r.stop.catch(()=>{});}});r.admit();await refused(r);await assert.rejects(r.stop);assert.equal(decode(r.raw).phase,'INTENT');assert.equal(r.clears,0);
});
check('signer-age-inspection-exposes-only-bounded-historical-observations', async () => {
  const r=unit();r.admit();await r.sign();const v=r.owner.inspect().signerCustody.signerEntryAge;assert.equal(v.maxReadToSignerMs,1000);assert.equal(v.authority,'NONE');assert.equal(v.chainFreshness,'NOT_ESTABLISHED');
  for(const k of ['clock','deadline','last','reset'])assert.equal(Object.hasOwn(v,k),false);await r.owner.close();
});
check('signer-age-runtime-clock-is-not-serialized-into-durable-original-context', async () => {
  const r=unit({start:987654321987654321n});r.admit();await r.sign();assert.equal(r.raw.includes('987654321987654321'),false);assert.equal(decode(r.raw).preSignContextJson,r.context.preSignContextJson);await r.owner.close();
});
check('signer-age-legacy-wallet-and-optional-bridge-retain-their-old-surface', async () => {
  begin(F({}));const r=unit({legacy:true,intent:r=>{r.now=60000000000n;}});r.admit();await r.sign();assert.equal(r.clockCalls,0);assert.equal(Object.hasOwn(r.owner,'beginPreSignObservation'),false);await r.owner.close();
});
check('signer-age-observation-bridge-rejects-getters-proxies-and-nonvoid-receipts', async () => {
  let entered=0;const bad={};Object.defineProperty(bad,'beginPreSignObservation',{get(){entered++;throw Error('unselected');}});assert.throws(()=>begin(bad));
  assert.throws(()=>begin(new Proxy({},{getPrototypeOf(){entered++;throw Error('unselected');}})));
  for(const value of [true,Promise.reject(Error('declared async begin'))])assert.throws(()=>begin(F({beginPreSignObservation:F(()=>value)})));
  await drain();assert.equal(entered,0);
});
check('signer-age-real-planner-starts-window-before-its-final-read-and-retains-result', async () => {
  const r=composition({read:r=>{r.now=500000000n;},intent:r=>{r.now=999999999n;}});const result=await r.run();assert.equal(result.accountBlock.hash,r.signedHash);assert.equal(r.signs,1);assert.equal(r.begins,1);
  assert.equal(r.accountReads,15);assert.deepEqual(r.dpReads,[30,30]);assert.equal(r.materialCalls,1);assert.equal(decode(r.raw).phase,'SIGNED');
  const wait=r.planner.getMaterialWaitSnapshot();assert.equal(wait.timersStarted,1);assert.equal(wait.timersCleared,1);
  const again=await r.planner.revalidateSignedOriginal();assert.equal(again.accountBlock.hash,result.accountBlock.hash);assert.equal(r.accountReads,18);assert.deepEqual(r.dpReads,[36,36]);await r.owner.close();
});
check('signer-age-real-planner-refuses-an-expired-final-read-before-intent-or-sdk', async () => {
  const r=composition({read:r=>{r.now=1000000000n;}});await assert.rejects(r.run());assert.equal(r.accountReads,12);assert.equal(r.begins,0);assert.equal(r.signs,0);assert.equal(r.raw,null);assert.equal(r.row.status,'RESERVED');
});
check('signer-age-real-planner-keeps-intent-when-store-latency-expires-window', async () => {
  const r=composition({intent:r=>{r.now=1000000000n;}});await assert.rejects(r.run());assert.equal(r.accountReads,12);assert.equal(r.signs,0);assert.equal(r.begins,1);assert.equal(decode(r.raw).phase,'INTENT');assert.equal(r.owner.inspect().held,true);
});
check('signer-age-real-planner-refuses-clock-regression-after-intent-without-another-read', async () => {
  const r=composition({start:1n,intent:r=>{r.now=0n;}});await assert.rejects(r.run());assert.equal(r.signs,0);assert.equal(r.accountReads,12);assert.equal(decode(r.raw).phase,'INTENT');
});
check('signer-age-real-planner-preserves-original-signed-bytes-after-signer-latency', async () => {
  const r=composition({sign:r=>{r.now=5000000000n;}});const result=await r.run();const record=decode(r.raw);assert.equal(record.signedBlockJson,canonicalJson(result.accountBlock));
  assert.equal(JSON.parse(record.signedBlockJson).hash,result.accountBlock.hash);assert.equal(r.signs,1);assert.equal(r.materialCalls,1);await assert.rejects(r.run());assert.equal(r.signs,1);await r.owner.close();
});

export const apiCreditSignerEntryAgeDataCases = F([...checks]);
if(process.argv[1]!==undefined&&fileURLToPath(import.meta.url)===process.argv[1]){
const cases=[];for(const {id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
await closeApiCreditOperatorDataFixtures();const failed=cases.filter(r=>r.status!=='PASS').length;
console.log(JSON.stringify({qualification:'G2_SIGNER_ENTRY_AGE_DATA',passed:cases.length-failed,failed,cases,priorCases:apiCreditSignerInspectionDataCases.length,
  declaredClockStoreKeyMethodAndWirePortsOnly:true,actualPlannerDataCompositions:5,existingMaterialTimersEachStartedAndCleared:1,
  nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
  localElapsedTimeOnly:true,chainFreshness:'NOT_ESTABLISHED',nativeDurability:'NOT_ESTABLISHED',Linux:'NOT_ESTABLISHED',fullG2:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;
}
