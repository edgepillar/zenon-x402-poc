// Declared current-owner/clock/store/key-method/wire ports; no native I/O.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { apiCreditSignerEntryAgeDataCases } from './api-credit-signer-entry-age.behavior.mjs';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { signerEntryUnitFixture as unit, signerEntryCompositionFixture as composition } from './api-credit-signer-entry-age.fixture.mjs';
import { createSdk105AgeBoundSignerContextWalletOwner as create } from '../src/zenon/sdk105-prepared-hash-wallet-owner.js';
import { decodeOriginalFundingSignerContextRecord as decode } from '../src/original-funding-signer-context-custody.js';
import { canonicalJson } from '../src/canonical.js';
const F=Object.freeze,checks=[...apiCreditSignerEntryAgeDataCases];
function check(id,run){checks.push({id,run});}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
async function drain(){for(let i=0;i<16;i++)await Promise.resolve();}
async function refused(r){await assert.rejects(r.sign());assert.equal(r.signs,0);await assert.rejects(r.sign());assert.equal(r.signs,0);}
function retained(r){assert.equal(decode(r.raw).phase,'INTENT');assert.equal(r.row.status,'RESERVED');assert.equal(r.owner.inspect().held,true);}
check('signer-current-owner-construction-enters-no-guard-clock-key-or-store',async()=>{
 const r=unit();assert.equal(r.guardCalls,0);assert.equal(r.clockCalls,0);assert.equal(r.keyCalls,0);assert.equal(r.begins,0);await r.owner.close();
});
check('signer-current-owner-constructor-requires-a-frozen-data-method-without-getters',()=>{
 const r=unit();let hooks=0;for(const kind of ['missing','unfrozen','getter','proxy']){
  const b={requirePreparationContext:true,beginSignerAttempt:r.backend.beginSignerAttempt,retainSignerResult:r.backend.retainSignerResult};
  if(kind==='getter')Object.defineProperty(b,'assertCurrent',{get(){hooks++;throw Error('unselected');}});
  if(kind==='unfrozen')b.assertCurrent=()=>{};
  if(kind==='proxy')b.assertCurrent=new Proxy(()=>{},{get(){hooks++;throw Error('unselected');}});
  assert.throws(()=>create(r.configuration,{...r.custody,backend:F(b)},r.entry));
 }assert.equal(hooks,0);assert.equal(r.keyCalls,0);assert.equal(r.guardCalls,0);
});
check('signer-current-owner-check-follows-intent-and-precedes-final-clock-and-sdk',async()=>{
 const r=unit();r.admit();await r.sign();const g=r.trace.indexOf('owner-check'),s=r.trace.indexOf('sdk-entry');
 assert.ok(r.trace.indexOf('intent-commit')<g);assert.equal(r.trace[g+1],'clock');assert.equal(r.trace[s-1],'clock');assert.equal(r.guardCalls,1);await r.owner.close();
});
check('signer-current-owner-stale-epoch-after-intent-refuses-sdk-and-retains-original',async()=>{
 const r=unit({intent:r=>{r.current=false;}});r.admit();await refused(r);retained(r);assert.equal(r.guardCalls,1);assert.equal(r.retains,0);
});
check('signer-current-owner-closed-file-after-intent-refuses-sdk-and-retains-original',async()=>{
 const r=unit({intent:r=>{r.fileClosed=true;}});r.admit();await refused(r);retained(r);assert.equal(r.guardCalls,1);
});
check('signer-current-owner-throwing-check-is-not-retried-or-replaced',async()=>{
 const r=unit({guard:()=>{throw Error('declared held owner');}});r.admit();await refused(r);retained(r);assert.equal(r.guardCalls,1);
});
check('signer-current-owner-nonvoid-receipts-never-mean-current-or-success',async()=>{
 for(const value of [true,false,0,'CURRENT',F({current:true})]){const r=unit({guard:()=>value});r.admit();await refused(r);retained(r);assert.equal(r.guardCalls,1);}
});
check('signer-current-owner-pending-promise-cannot-later-upgrade-held',async()=>{
 const late=deferred(),r=unit({guard:()=>late.promise});r.admit();await refused(r);const raw=r.raw;late.resolve(undefined);await drain();retained(r);assert.equal(r.raw,raw);assert.equal(r.guardCalls,1);
});
check('signer-current-owner-rejected-native-promise-is-drained-without-awaiting',async()=>{
 const r=unit({guard:()=>Promise.reject(Error('declared async check'))});r.admit();await refused(r);await drain();retained(r);
});
check('signer-current-owner-thenable-result-getter-is-never-entered',async()=>{
 let hooks=0;const value={};Object.defineProperty(value,'then',{get(){hooks++;throw Error('unselected');}});
 const r=unit({guard:()=>value});r.admit();await refused(r);assert.equal(hooks,0);retained(r);
});
check('signer-current-owner-proxy-result-is-never-assimilated',async()=>{
 let hooks=0;const value=new Proxy({},{get(){hooks++;throw Error('unselected');},getPrototypeOf(){hooks++;throw Error('unselected');}});
 const r=unit({guard:()=>value});r.admit();await refused(r);assert.equal(hooks,0);retained(r);
});
check('signer-current-owner-reentrant-sign-cannot-enter-another-guard-or-sdk',async()=>{
 const r=unit({guard:r=>{r.again=r.sign();r.again.catch(()=>{});}});r.admit();await r.sign();await assert.rejects(r.again);assert.equal(r.guardCalls,1);assert.equal(r.signs,1);await r.owner.close();
});
check('signer-current-owner-close-during-check-precedes-sdk-with-no-competing-stop',async()=>{
 const r=unit({guard:r=>{r.stop=r.owner.close();r.stop.catch(()=>{});}});r.admit();await refused(r);await assert.rejects(r.stop);retained(r);assert.equal(r.clears,0);assert.equal(r.guardCalls,1);
});
check('signer-current-owner-check-latency-consumes-the-original-age-window',async()=>{
 const r=unit({guard:r=>{r.now=1000000000n;}});r.admit();await refused(r);retained(r);assert.equal(r.guardCalls,1);assert.equal(r.owner.inspect().signerCustody.currentOwnerCheck.returned,true);
});
check('signer-current-owner-clock-regression-after-check-refuses-without-renewal',async()=>{
 const r=unit({start:10n,guard:r=>{r.now=9n;}});r.admit();await refused(r);retained(r);assert.equal(r.guardCalls,1);
});
check('signer-current-owner-unadmitted-context-or-expired-preintent-run-enters-no-guard',async()=>{
 const r=unit();r.prepare();await refused(r);assert.equal(r.guardCalls,0);assert.equal(r.begins,0);
 const e=unit();e.admit();e.now=1000000000n;await refused(e);assert.equal(e.guardCalls,0);assert.equal(e.begins,0);
 const p=unit({intent:r=>{r.now=1000000000n;}});p.admit();await refused(p);retained(p);assert.equal(p.guardCalls,0);
});
check('signer-current-owner-lost-intent-reply-is-retained-before-check-entry',async()=>{
 const r=unit({intent:()=>{throw Error('declared reply loss');}});r.admit();await refused(r);retained(r);assert.equal(r.guardCalls,0);
});
check('signer-current-owner-final-time-observation-follows-every-successful-check',async()=>{
 const r=unit({guard:r=>{r.now=999999999n;}});r.admit();await r.sign();const at=r.trace.indexOf('owner-check');assert.deepEqual(r.trace.slice(at,at+3),['owner-check','clock','sdk-entry']);await r.owner.close();
});
check('signer-current-owner-inspection-is-historical-and-grants-no-fencing-authority',async()=>{
 const r=unit();assert.equal(r.owner.inspect().signerCustody.currentOwnerCheck.entered,false);r.admit();await r.sign();const v=r.owner.inspect().signerCustody.currentOwnerCheck;
 assert.equal(v.entered,true);assert.equal(v.returned,true);assert.equal(v.authority,'NONE');assert.equal(v.atomicExternalDispatchFencing,'NOT_ESTABLISHED');await r.owner.close();
});
check('signer-current-owner-loss-after-sdk-preserves-volatile-original-and-intent',async()=>{
 const r=unit({sign:r=>{r.current=false;},retain:r=>{if(!r.current)throw Error('declared stale result write');}});r.admit();await assert.rejects(r.sign());retained(r);
 assert.equal(r.signs,1);assert.equal(canonicalJson(r.owner.inspect().wallet.signedOriginal),canonicalJson(r.signed));await assert.rejects(r.sign());assert.equal(r.guardCalls,1);
});
check('signer-current-owner-sdk-entry-is-after-the-declared-guard-transaction-return',async()=>{
 let busy=false;const r=unit({guard:()=>{busy=true;busy=false;},sign:()=>{assert.equal(busy,false);}});r.admit();await r.sign();assert.equal(r.signs,1);await r.owner.close();
});
check('signer-current-owner-legacy-constructor-retains-its-previous-port-contract',async()=>{
 const r=unit({legacy:true,guard:()=>{throw Error('unselected legacy guard');}});r.admit();await r.sign();assert.equal(r.guardCalls,0);assert.equal(r.clockCalls,0);await r.owner.close();
});
check('signer-current-owner-a-second-sign-cannot-rerun-current-check-or-write-intent',async()=>{
 const r=unit();r.admit();await r.sign();const raw=r.raw;await assert.rejects(r.sign());assert.equal(r.raw,raw);assert.equal(r.begins,1);assert.equal(r.guardCalls,1);assert.equal(r.signs,1);await r.owner.close();
});
check('signer-current-owner-close-after-sdk-retains-original-with-one-check',async()=>{
 const r=unit({sign:r=>queueMicrotask(()=>{r.stop=r.owner.close();r.stop.catch(()=>{});})});r.admit();await assert.rejects(r.sign());await r.stop;
 assert.equal(decode(r.raw).phase,'SIGNED');assert.equal(r.guardCalls,1);assert.equal(r.signs,1);assert.equal(r.clears,1);
});
check('signer-current-owner-real-planner-checks-once-and-retains-the-exact-signed-original',async()=>{
 const r=composition();const out=await r.run();assert.equal(r.guardCalls,1);assert.equal(r.signs,1);assert.equal(r.accountReads,15);assert.equal(decode(r.raw).signedBlockJson,canonicalJson(out.accountBlock));
 await r.planner.revalidateSignedOriginal();assert.equal(r.accountReads,18);assert.equal(r.guardCalls,1);await r.owner.close();
});
check('signer-current-owner-real-planner-stale-epoch-after-intent-has-zero-sdk-entry',async()=>{
 const r=composition({intent:r=>{r.current=false;}});await assert.rejects(r.run());retained(r);assert.equal(r.signs,0);assert.equal(r.guardCalls,1);assert.equal(r.accountReads,12);
});
check('signer-current-owner-real-planner-closed-file-after-intent-has-zero-sdk-entry',async()=>{
 const r=composition({intent:r=>{r.fileClosed=true;}});await assert.rejects(r.run());retained(r);assert.equal(r.signs,0);assert.equal(r.guardCalls,1);assert.equal(r.accountReads,12);
});
check('signer-current-owner-real-planner-check-latency-does-not-renew-time-budget',async()=>{
 const r=composition({guard:r=>{r.now=1000000000n;}});await assert.rejects(r.run());retained(r);assert.equal(r.signs,0);assert.equal(r.accountReads,12);
});
check('signer-current-owner-real-planner-close-during-check-cannot-compete-with-owner',async()=>{
 const r=composition({guard:r=>{r.stop=r.owner.close();r.stop.catch(()=>{});}});await assert.rejects(r.run());await assert.rejects(r.stop);retained(r);assert.equal(r.signs,0);assert.equal(r.clears,0);
});
check('signer-current-owner-real-planner-result-write-loss-keeps-one-original-signature',async()=>{
 const r=composition({sign:r=>{r.current=false;},retain:r=>{if(!r.current)throw Error('declared stale result write');}});await assert.rejects(r.run());retained(r);
 assert.equal(r.signs,1);assert.equal(r.guardCalls,1);assert.notEqual(r.owner.inspect().wallet.signedOriginal,null);await assert.rejects(r.run());assert.equal(r.signs,1);
});
export const apiCreditSignerCurrentOwnerDataCases=F([...checks]);
if(process.argv[1]!==undefined&&fileURLToPath(import.meta.url)===process.argv[1]){
const cases=[];for(const {id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
await closeApiCreditOperatorDataFixtures();const failed=cases.filter(c=>c.status!=='PASS').length;
console.log(JSON.stringify({qualification:'G2_SIGNER_CURRENT_OWNER_DATA',passed:cases.length-failed,failed,cases,priorCases:apiCreditSignerEntryAgeDataCases.length,
 declaredGuardClockStoreKeyMethodAndWirePortsOnly:true,actualPlannerDataCompositions:11,existingMaterialTimerEachStartedAndCleared:true,
 nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
 pointInTimeOwnerCheckOnly:true,atomicExternalDispatchFencing:'NOT_ESTABLISHED',nativeDurability:'NOT_ESTABLISHED',Linux:'NOT_ESTABLISHED',fullG2:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;
}
