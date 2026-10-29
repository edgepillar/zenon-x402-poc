// Guard + actual outer application source; declared file/clock/CAS/child/wire.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { apiCreditSignerCurrentOwnerDataCases } from './api-credit-signer-current-owner.behavior.mjs';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { wireOwnerFileFixture as file,wireOwnerApplicationFixture as app,deferred } from './api-credit-wire-owner.fixture.mjs';
import { createApiCreditWireOwnerGuard as create,validateApiCreditWireOwnerGuard as validate,requireCurrentApiCreditWireOwner as admit,inspectApiCreditWireOwnerGuard as inspect } from '../src/api-credit-wire-owner-guard.js';
const F=Object.freeze,checks=[...apiCreditSignerCurrentOwnerDataCases];
function check(id,run){checks.push({id,run});}
function fixture(options={}){const r=file(options);r.guard=create({fileOwner:r.owner,clock:r.clock});r.send=(ms=250)=>{const remaining=admit(r.guard,ms);r.wireCalls++;return remaining;};return r;}
async function drain(){for(let i=0;i<16;i++)await Promise.resolve();}
function held(r){assert.equal(inspect(r.guard).held,true);assert.equal(r.wireCalls,0);assert.throws(()=>r.send());assert.equal(r.wireCalls,0);}
function composition(options={}){return app({guardFactory:create,admit,...options});}
check('wire-owner-construction-captures-methods-without-entering-file-or-clock',()=>{
 const r=fixture();assert.equal(r.currentCalls+r.viewCalls+r.clockCalls,0);assert.deepEqual(Object.keys(r.guard),['apiCreditWireOwnerVersion']);
});
check('wire-owner-closed-configuration-refuses-getters-proxies-and-unfrozen-methods',()=>{
 const r=file();let hooks=0;const c={fileOwner:r.owner};Object.defineProperty(c,'clock',{get(){hooks++;throw Error('unselected');}});assert.throws(()=>create(c));
 assert.throws(()=>create(new Proxy({},{get(){hooks++;throw Error('unselected');},getPrototypeOf(){hooks++;throw Error('unselected');}})));
 assert.throws(()=>create({fileOwner:r.owner,clock:()=>0n}));assert.throws(()=>create({fileOwner:F({inspect:()=>{},assertCurrent:F(()=>{})}),clock:r.clock}));assert.equal(hooks,0);
});
check('wire-owner-a-json-version-marker-cannot-forge-the-private-guard',()=>{
 const forged=F({apiCreditWireOwnerVersion:1});assert.throws(()=>validate(forged));assert.throws(()=>admit(forged,250));assert.throws(()=>inspect(forged));
});
check('wire-owner-config-mutation-cannot-replace-the-captured-owner-or-clock',()=>{
 const a=file(),b=file(),c={fileOwner:a.owner,clock:a.clock},g=create(c);c.fileOwner=b.owner;c.clock=b.clock;assert.equal(admit(g,250),250);assert.equal(a.currentCalls,1);assert.equal(b.currentCalls,0);
});
check('wire-owner-clean-check-precedes-each-declared-wire-entry-with-one-budget',()=>{
 const r=fixture();assert.equal(r.send(),250);assert.equal(r.wireCalls,1);assert.equal(r.currentCalls,1);assert.deepEqual(r.trace,['clock','current','clock']);assert.equal(inspect(r.guard).admitted,1);
});
check('wire-owner-only-a-synchronous-undefined-current-receipt-is-admitted',()=>{
 for(const value of [true,false,0,'OPEN',F({current:true})]){const r=fixture({current:()=>value});assert.throws(()=>r.send());held(r);assert.equal(r.currentCalls,1);}
});
check('wire-owner-throwing-current-check-is-sticky-and-never-requests-a-wire',()=>{
 const r=fixture({current:()=>{throw Error('declared owner loss');}});assert.throws(()=>r.send());held(r);assert.equal(r.currentCalls,1);
});
check('wire-owner-pending-current-receipt-cannot-later-upgrade-refusal',async()=>{
 const late=deferred(),r=fixture({current:()=>late.promise});assert.throws(()=>r.send());late.resolve(undefined);await drain();held(r);assert.equal(inspect(r.guard).admitted,0);
});
check('wire-owner-rejected-native-promise-is-drained-without-awaiting',async()=>{
 const r=fixture({current:()=>Promise.reject(Error('declared async check'))});assert.throws(()=>r.send());await drain();held(r);
});
check('wire-owner-thenable-and-proxy-receipts-are-never-assimilated',()=>{
 let hooks=0;const value={};Object.defineProperty(value,'then',{get(){hooks++;throw Error('unselected');}});
 for(const v of [value,new Proxy({},{get(){hooks++;throw Error('unselected');},getPrototypeOf(){hooks++;throw Error('unselected');}})]){const r=fixture({current:()=>v});assert.throws(()=>r.send());held(r);}assert.equal(hooks,0);
});
check('wire-owner-held-busy-revoked-or-closed-previews-enter-no-current-method',()=>{
 for(const key of ['held','busy','revoked','closed']){const r=fixture();r[key]=true;assert.throws(()=>r.send());held(r);assert.equal(r.currentCalls,0);}
});
check('wire-owner-a-close-or-hold-during-current-check-vetoes-the-wire',()=>{
 for(const key of ['closed','held','busy','revoked']){const r=fixture({current:r=>{r[key]=true;}});assert.throws(()=>r.send());held(r);assert.equal(r.currentCalls,1);}
});
check('wire-owner-reentry-permanently-vetoes-both-outer-and-nested-admissions',()=>{
 const r=fixture({current:r=>{assert.throws(()=>r.send());}});assert.throws(()=>r.send());held(r);assert.equal(r.currentCalls,1);
});
check('wire-owner-invalid-monotonic-values-are-not-coerced-or-used-for-deadlines',()=>{
 let hooks=0;const v={valueOf(){hooks++;return 0;}};for(const value of [-1n,0,'0',null,v]){const r=fixture({clock:()=>value});assert.throws(()=>r.send());held(r);assert.equal(r.currentCalls,0);}assert.equal(hooks,0);
});
check('wire-owner-clock-regression-after-owner-io-refuses-without-new-budget',()=>{
 const r=fixture({current:r=>{r.now=99n;}});r.now=100n;assert.throws(()=>r.send());held(r);assert.equal(inspect(r.guard).lastRemainingMs,null);
});
check('wire-owner-exact-deadline-after-current-io-enters-no-wire',()=>{
 const r=fixture({current:r=>{r.now=250000000n;}});assert.throws(()=>r.send());held(r);
});
check('wire-owner-guard-latency-is-subtracted-from-the-existing-request-budget',()=>{
 const r=fixture({current:r=>{r.now=70000000n;}});assert.equal(r.send(),180);assert.equal(inspect(r.guard).lastBudgetMs,250);assert.equal(inspect(r.guard).lastRemainingMs,180);
});
check('wire-owner-submillisecond-remainder-uses-at-most-one-timer-quantum',()=>{
 const r=fixture({current:r=>{r.now=249999999n;}});assert.equal(r.send(),1);assert.equal(r.wireCalls,1);
});
check('wire-owner-invalid-deadline-arguments-enter-no-clock-or-owner',()=>{
 const r=fixture();for(const value of [0,-1,60001,1.1,'250',250n])assert.throws(()=>admit(r.guard,value));assert.equal(r.currentCalls+r.clockCalls+r.viewCalls,0);assert.equal(inspect(r.guard).held,false);
});
check('wire-owner-the-same-guard-covers-successive-funding-and-service-entries',()=>{
 const r=fixture();assert.equal(r.send(250),250);r.now=100000000n;assert.equal(r.send(500),500);assert.equal(r.currentCalls,2);assert.equal(r.wireCalls,2);assert.equal(inspect(r.guard).checks,2);
});
check('wire-owner-inspection-is-historical-without-clocks-paths-or-action-authority',()=>{
 const r=fixture();r.send();const calls=r.currentCalls+r.clockCalls+r.viewCalls,v=inspect(r.guard);assert.equal(v.authority,'NONE');assert.equal(v.historicalObservation,true);assert.equal(v.atomicExternalDispatchFencing,'NOT_ESTABLISHED');
 for(const k of ['owner','clock','last','epoch','path','reset','dispatch'])assert.equal(Object.hasOwn(v,k),false);assert.equal(r.currentCalls+r.clockCalls+r.viewCalls,calls);
});
check('wire-owner-brand-validation-cannot-reset-a-held-admission',()=>{
 const r=fixture();r.current=false;assert.throws(()=>r.send());validate(r.guard);held(r);assert.equal(r.currentCalls,1);
});
check('wire-owner-a-prior-admission-never-substitutes-for-a-new-current-check',()=>{
 const r=fixture();r.send();r.current=false;assert.throws(()=>r.send());assert.equal(r.wireCalls,1);assert.equal(r.currentCalls,2);assert.equal(inspect(r.guard).held,true);assert.throws(()=>r.send());assert.equal(r.wireCalls,1);
});
check('wire-owner-clock-loss-after-the-current-receipt-retains-refusal',()=>{
 const r=fixture({clock:r=>{if(r.currentCalls)throw Error('declared clock loss');return r.now;}});assert.throws(()=>r.send());held(r);assert.equal(r.currentCalls,1);
});
check('wire-owner-outer-application-rechecks-after-await-before-declared-wire',async()=>{
 const r=composition(),run=r.run();await r.ready.promise;assert.equal(r.currentCalls,1);r.gate.resolve();await run;assert.equal(r.currentCalls,2);assert.equal(r.wireCalls,1);assert.deepEqual(r.wireBudgets,[250]);await r.close();
});
check('wire-owner-stale-after-outer-admission-refuses-before-declared-wire',async()=>{
 const r=composition(),run=r.run();await r.ready.promise;const raw=r.raw();r.current=false;r.gate.resolve();await assert.rejects(run);assert.equal(r.wireCalls,0);assert.equal(r.currentCalls,2);assert.equal(r.raw(),raw);await r.close().catch(()=>{});
});
check('wire-owner-closed-file-after-outer-admission-refuses-before-declared-wire',async()=>{
 const r=composition(),run=r.run();await r.ready.promise;r.databaseOpen=false;r.gate.resolve();await assert.rejects(run);assert.equal(r.wireCalls,0);assert.equal(r.currentCalls,1);await r.close().catch(()=>{});
});
check('wire-owner-outer-close-while-child-awaits-prevents-a-late-wire',async()=>{
 const r=composition(),run=r.run();await r.ready.promise;const stop=r.close();stop.catch(()=>{});r.gate.resolve();await assert.rejects(run);await stop.catch(()=>{});assert.equal(r.wireCalls,0);assert.equal(inspect(r.guard).held,true);
});
check('wire-owner-outer-child-guard-latency-cannot-renew-request-time',async()=>{
 const r=composition({onCurrent:s=>{if(s.currentCalls===2)s.now=250000000n;}}),run=r.run();await r.ready.promise;r.gate.resolve();await assert.rejects(run);assert.equal(r.wireCalls,0);assert.equal(inspect(r.guard).held,true);assert.equal(JSON.parse(r.raw()).reservations.length,1);await r.close().catch(()=>{});
});
check('wire-owner-outer-child-regressed-clock-preserves-the-original-reservation',async()=>{
 const r=composition({onCurrent:s=>{if(s.currentCalls===2)s.now=99n;}});r.now=100n;const run=r.run();await r.ready.promise;r.gate.resolve();await assert.rejects(run);assert.equal(r.wireCalls,0);assert.equal(JSON.parse(r.raw()).reservations.length,1);await r.close().catch(()=>{});
});
check('wire-owner-outer-child-nonvoid-check-refuses-without-sending',async()=>{
 const r=composition({onCurrent:s=>s.currentCalls===2?true:undefined}),run=r.run();await r.ready.promise;r.gate.resolve();await assert.rejects(run);assert.equal(r.wireCalls,0);assert.equal(inspect(r.guard).held,true);await r.close().catch(()=>{});
});
check('wire-owner-late-owner-recovery-cannot-grant-an-automatic-second-attempt',async()=>{
 const r=composition(),run=r.run();await r.ready.promise;r.current=false;r.gate.resolve();await assert.rejects(run);const raw=r.raw();r.current=true;await assert.rejects(r.run());assert.equal(r.raw(),raw);assert.equal(r.wireCalls,0);assert.equal(inspect(r.guard).held,true);await r.close().catch(()=>{});
});
export const apiCreditWireOwnerDataCases=checks;
if(process.argv[1]===fileURLToPath(import.meta.url)){
const cases=[];for(const {id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
await closeApiCreditOperatorDataFixtures();const failed=cases.filter(c=>c.status!=='PASS').length;
console.log(JSON.stringify({qualification:'G2_WIRE_OWNER_GUARD_DATA',passed:cases.length-failed,failed,cases,priorCases:apiCreditSignerCurrentOwnerDataCases.length,
 declaredFileClockCasChildAndWirePortsOnly:true,actualOuterApplicationDataCompositions:8,nativeHttpAdaptersExecuted:false,
 nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
 atomicExternalDispatchFencing:'NOT_ESTABLISHED',nativeRequestEndTiming:'NOT_ESTABLISHED',nativeDurability:'NOT_ESTABLISHED',Linux:'NOT_ESTABLISHED',fullG2:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;
}
