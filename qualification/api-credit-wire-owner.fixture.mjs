// Actual outer application/spending source; declared file/CAS/child/wire ports.
import assert from 'node:assert/strict';
import { apiCreditCommandDataFixtures as commands } from './api-credit-command.behavior.mjs';
import { createSdk105ApiCreditApplicationLifecycle } from '../src/zenon/sdk105-api-credit-application-lifecycle.js';

const F=Object.freeze;
export function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
export function wireOwnerFileFixture(options={}){
 const s={current:true,closed:false,revoked:false,held:false,busy:false,now:0n,currentCalls:0,viewCalls:0,clockCalls:0,wireCalls:0,trace:[]};
 s.owner=F({inspect:F(function inspect(){s.viewCalls++;if(options.view)return options.view(s);return F({spendingFileOwnerVersion:1,lifecycle:s.held?'HELD':s.closed?'CLOSED':s.revoked?'REVOKED':'OPEN',
  held:s.held,busy:s.busy,backendClosed:s.revoked||s.closed,databaseOpen:!s.closed,physicalCloseEntered:s.closed,physicalCloseReturned:s.closed});}),
  assertCurrent:F(function assertCurrent(){assert.equal(this,s.owner);assert.equal(arguments.length,0);s.currentCalls++;s.trace.push('current');
   if(options.current)return options.current(s);if(!s.current||s.closed||s.revoked||s.held){s.held=true;throw Error('declared stale file owner');}})});
 s.clock=F(()=>{s.clockCalls++;s.trace.push('clock');return options.clock?options.clock(s):s.now;});return s;
}
export function wireOwnerApplicationFixture({guardFactory=null,admit=null,onCurrent=null}={}){
 let s;
 const h=commands.fixture({createLifecycle(c){
  const base=c.spending.backend,ready=deferred(),gate=deferred();
  s={current:true,databaseOpen:true,held:false,revoked:false,physicalCloseReturned:false,now:0n,currentCalls:0,wireCalls:0,wireBudgets:[],ready,gate,trace:[]};
  function open(){if(s.revoked||s.held||!s.databaseOpen)throw Error('declared file unavailable');}
  const backend=F({load(account){open();return base.load(account);},compareAndSwap(...args){open();return base.compareAndSwap(...args);}});
  const owner=F({backend,assertCurrent:F(function assertCurrent(){s.currentCalls++;open();if(!s.current){s.held=true;throw Error('declared stale epoch');}base.load(c.spending.policy.accountId);if(onCurrent)return onCurrent(s);}),
   inspect:F(()=>F({spendingFileOwnerVersion:1,lifecycle:s.held?'HELD':s.physicalCloseReturned?'CLOSED':s.revoked?'REVOKED':'OPEN',held:s.held,busy:false,
    backendClosed:s.revoked,databaseOpen:s.databaseOpen,physicalCloseEntered:s.physicalCloseReturned,physicalCloseReturned:s.physicalCloseReturned})),
   revoke:F(()=>{s.revoked=true;}),close:F(()=>{s.databaseOpen=false;s.physicalCloseReturned=true;})});
  s.owner=owner;s.guard=guardFactory?guardFactory({fileOwner:owner,clock:F(()=>s.now)}):null;
  const child={};for(const name of ['prepareOriginalFunding','commitOriginalFunding','submitOriginalFunding','handoffToService','submitOriginal'])child[name]=F(async input=>{
   if(name==='prepareOriginalFunding'){ready.resolve();await gate.promise;if(s.guard!==null)s.wireBudgets.push(admit(s.guard,250));s.wireCalls++;s.trace.push('declared-wire-entry');}
   return Reflect.apply(c.client[name],c.client,[input]);
  });child.inspect=c.client.inspect;child.close=c.client.close;
  return createSdk105ApiCreditApplicationLifecycle({client:F(child),walletOwner:c.walletOwner,fileOwner:owner,fundingResourceUrl:c.fundingResourceUrl,
   spending:{policy:c.spending.policy,paymentId:c.spending.paymentId,readDay:c.spending.readDay}});
 }});
 s.h=h;s.run=()=>h.root.prepareOriginalFunding(h.f.input);s.close=()=>h.root.close();s.raw=h.raw;return s;
}
