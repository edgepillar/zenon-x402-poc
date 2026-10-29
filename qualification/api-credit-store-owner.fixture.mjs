// Actual outer application/CAS source; declared store/clock/child effects only.
import { apiCreditCommandDataFixtures as commands } from './api-credit-command.behavior.mjs';
import { createSdk105ApiCreditApplicationLifecycle } from '../src/zenon/sdk105-api-credit-application-lifecycle.js';
import { deferred } from './api-credit-wire-owner.fixture.mjs';
import { createApiCreditWireOwnerGuard, validateApiCreditWireOwnerGuard,
 createApiCreditStoreOwnerAdmission, requireApiCreditStoreOwnerStage } from '../src/api-credit-wire-owner-guard.js';

const F=Object.freeze;
export function storeOwnerApplicationFixture({guarded=true,afterStage=null,beforeStage=null,waitForReturn=false,onCurrent=null}={}){
 let s;
 const h=commands.fixture({createLifecycle(c){
  const base=c.spending.backend,ready=deferred(),gate=deferred(),storeReady=deferred(),returnGate=deferred();
  s={current:true,databaseOpen:true,held:false,revoked:false,physicalCloseReturned:false,now:0n,currentCalls:0,
   storeOpens:0,epochWrites:0,commits:0,storesReturned:0,facadesPublished:0,closeCalls:0,trace:[],ready,gate,storeReady,returnGate};
  function open(){if(s.revoked||s.held||!s.databaseOpen)throw Error('declared file unavailable');}
  const backend=F({load(account){open();return base.load(account);},compareAndSwap(...args){open();return base.compareAndSwap(...args);}});
  const owner=F({backend,assertCurrent:F(function assertCurrent(){s.currentCalls++;open();if(!s.current){s.held=true;throw Error('declared stale epoch');}base.load(c.spending.policy.accountId);if(onCurrent)return onCurrent(s);}),
   inspect:F(()=>F({spendingFileOwnerVersion:1,lifecycle:s.held?'HELD':s.physicalCloseReturned?'CLOSED':s.revoked?'REVOKED':'OPEN',held:s.held,busy:false,
    backendClosed:s.revoked,databaseOpen:s.databaseOpen,physicalCloseEntered:s.physicalCloseReturned,physicalCloseReturned:s.physicalCloseReturned})),
   revoke:F(()=>{s.revoked=true;}),close:F(()=>{s.databaseOpen=false;s.physicalCloseReturned=true;})});
  s.owner=owner;s.guard=createApiCreditWireOwnerGuard({fileOwner:owner,clock:F(()=>s.now)});
  const child={};for(const name of ['prepareOriginalFunding','commitOriginalFunding','submitOriginalFunding','handoffToService','submitOriginal'])child[name]=F(async input=>{
   if(name==='prepareOriginalFunding'){
    validateApiCreditWireOwnerGuard(s.guard); // Current-main brand-only construction control.
    ready.resolve();await gate.promise;
    s.admission=guarded?createApiCreditStoreOwnerAdmission(s.guard,1000):null;
    for(const [stage,effect]of [['DATABASE_ENTRY','storeOpens'],['EPOCH_ENTRY','epochWrites'],['COMMIT_ENTRY','commits'],['STORE_RETURN','storesReturned']]){
     if(beforeStage)beforeStage(s,stage);if(s.admission!==null)requireApiCreditStoreOwnerStage(s.admission,stage);
     s[effect]++;s.trace.push(stage);if(afterStage)afterStage(s,stage);
    }
    s.retainedStore=F({declaredStoreIdentity:'same-original-store'});storeReady.resolve();
    if(waitForReturn)await returnGate.promise;
    if(s.admission!==null)requireApiCreditStoreOwnerStage(s.admission,'CLIENT_RETURN');
    s.facadesPublished++;s.trace.push('CLIENT_RETURN');
   }
   return Reflect.apply(c.client[name],c.client,[input]);
  });child.inspect=c.client.inspect;child.close=F(()=>{s.closeCalls++;return c.client.close();});
  return createSdk105ApiCreditApplicationLifecycle({client:F(child),walletOwner:c.walletOwner,fileOwner:owner,fundingResourceUrl:c.fundingResourceUrl,
   spending:{policy:c.spending.policy,paymentId:c.spending.paymentId,readDay:c.spending.readDay}});
 }});
 s.h=h;s.run=()=>h.root.prepareOriginalFunding(h.f.input);s.close=()=>h.root.close();s.raw=h.raw;return s;
}
