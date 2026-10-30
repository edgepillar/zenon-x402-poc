import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { canonicalJson } from '../src/canonical.js';
import { createIssuedProviderOperatorControl } from '../src/issued-provider-operator-control.js';
import { requireIssuedProviderClosedAuxiliary as pair, requireIssuedProviderClosedOwners as all } from '../src/issued-provider-close-observation.js';

// Actual operator controller and shared close contract. Provider, auxiliary,
// channel, clock and timer methods below are explicitly declared memory ports.
// This does not import the native launcher or create native resources.
const F=Object.freeze, checks=[];
const check=(id,run)=>checks.push({id,run});
const provider=()=>({phase:'CLOSED',held:false,released:true,activeOperations:0});
const auxiliary=()=>({closed:true,held:false,active:false});
const channel=()=>({lifecycle:'CLOSED',held:false,reading:false,writing:false,writeCallbackPending:false,
  inputClosed:true,outputClosed:true,historicalClose:'FULFILLED_UNDEFINED'});
function fixture(hooks={},eof=false){
  const r={provider:{phase:'OPEN',held:false,released:false,activeOperations:0},
    auxiliary:{closed:false,held:false,active:false},
    channel:{...channel(),lifecycle:'OPEN',inputClosed:false,outputClosed:false,historicalClose:'NOT_STARTED'},
    trace:[],writes:[],counts:{provider:0,auxiliary:0,channel:0,economic:0},timers:new Set()};
  const commands=eof?[]:[canonicalJson({version:1,id:'finish',operation:'CLOSE',argument:null})];
  const unused=F(()=>{r.counts.economic++;throw new TypeError('UNEXPECTED_ECONOMIC_PORT');});
  const ports=F({
    startProvider:F(async()=>F({status:'LISTENING'})),
    inspectProvider:F(()=>F({...r.provider})),
    closeProvider:F(async()=>{
      r.trace.push('provider-close');r.counts.provider++;await Promise.resolve();r.provider=provider();
      if(hooks.provider)return await hooks.provider(r);
    }),
    resumeOriginalSettlement:unused,activateOriginalCommittedFunding:unused,
    admitOriginalCommittedServiceGrant:unused,admitOriginalCommittedServiceGrantResults:unused,
    inspectOriginalCommittedServiceGrant:unused,reconcileOriginalFunding:unused,
    recoverOriginalFundingFirstResult:unused,inspectOriginalFundingHistory:unused,
    readCommand:F(async()=>commands.length?commands.shift():null),
    writeResult:F(async line=>{
      const value=JSON.parse(line);r.writes.push(value);r.trace.push('write-'+value.operation);
      await Promise.resolve();if(value.operation==='CLOSE'&&hooks.write)await hooks.write(r);
    }),
    closeChannel:F(async()=>{
      r.trace.push('channel-close');r.counts.channel++;await Promise.resolve();r.channel=channel();
      if(hooks.channel)await hooks.channel(r);
    }),
    inspectChannel:F(()=>F({...r.channel})),
    closeAuxiliary:F(async()=>{
      r.trace.push('auxiliary-close');r.counts.auxiliary++;await Promise.resolve();r.auxiliary=auxiliary();
      if(hooks.auxiliary)await hooks.auxiliary(r);
    }),
    inspectAuxiliary:F(()=>F({...r.auxiliary})),
    clock:F(()=>0n),
    armTimer:F((ms,callback)=>{const token=F({ms,callback});r.timers.add(token);return token;}),
    cancelTimer:F(token=>{r.timers.delete(token);})
  });
  r.control=createIssuedProviderOperatorControl({mode:'FRESH',
    limits:{maxCommands:8,maxLineBytes:65536,maxInputBytes:262144,maxOutputBytes:262144,closeWaitMs:250},
    operationBudgetMs:100,ports});
  r.run=()=>r.control.run();return r;
}
function once(r,expectedAuxiliary=1){
  assert.deepEqual(r.counts,{provider:1,auxiliary:expectedAuxiliary,channel:1,economic:0});
  assert.equal(r.timers.size,0);
  assert.equal(r.trace.filter(s=>s==='provider-close').length,1);
  assert.equal(r.trace.filter(s=>s==='channel-close').length,1);
}
async function held(hooks,{eof=false,closeReply=false,expectedAuxiliary=1}={}){
  const r=fixture(hooks,eof),result=await r.run();
  assert.equal(result.status,'HELD');assert.equal(result.exitCode,4);
  assert.equal(result.physicalRelease,'NOT_ESTABLISHED');
  assert.equal(r.control.inspect().held,true);once(r,expectedAuxiliary);
  assert.equal(r.writes.filter(v=>v.operation==='CLOSE').length,closeReply?1:0);
  return {r,result};
}

check('provider-close-observation-clean-views-return-no-authority-or-capability',()=>{
  assert.equal(pair(F(provider()),F(auxiliary())),undefined);
  assert.equal(all(F(provider()),F(auxiliary()),F(channel())),undefined);
});
check('provider-close-observation-rejects-each-current-provider-conflict',()=>{
  for(const edit of [{phase:'CLOSING'},{held:true},{released:false},{activeOperations:1}]){
    assert.throws(()=>all(F({...provider(),...edit}),F(auxiliary()),F(channel())));
  }
});
check('provider-close-observation-rejects-each-current-auxiliary-conflict',()=>{
  for(const edit of [{closed:false},{held:true},{active:true}]){
    assert.throws(()=>pair(F(provider()),F({...auxiliary(),...edit})));
  }
});
check('provider-close-observation-rejects-each-current-channel-conflict',()=>{
  for(const edit of [{lifecycle:'CLOSING'},{held:true},{reading:true},{writing:true},
    {writeCallbackPending:true},{inputClosed:false},{outputClosed:false},{historicalClose:'UNKNOWN'}]){
    assert.throws(()=>all(F(provider()),F(auxiliary()),F({...channel(),...edit})));
  }
});
check('provider-close-observation-proxy-is-refused-without-entering-hooks',()=>{
  let entered=0;const p=new Proxy(F(provider()),{get(){entered++;},getOwnPropertyDescriptor(){entered++;}});
  assert.throws(()=>all(p,F(auxiliary()),F(channel())));assert.equal(entered,0);
});
check('provider-close-observation-accessor-is-refused-without-entering-getter',()=>{
  let entered=0;const p=provider();Object.defineProperty(p,'released',{enumerable:true,get(){entered++;return true;}});
  assert.throws(()=>all(F(p),F(auxiliary()),F(channel())));assert.equal(entered,0);
});
check('provider-close-observation-requires-frozen-records-and-exact-arity',()=>{
  assert.throws(()=>pair(provider(),F(auxiliary())));
  assert.throws(()=>pair(F(provider()),F(auxiliary()),F(channel())));
  assert.throws(()=>all(F(provider()),F(auxiliary())));
  assert.throws(()=>all(F(provider()),F(auxiliary()),F(channel()),null));
});
check('provider-current-close-clean-command-keeps-one-stop-per-owner',async()=>{
  const r=fixture(),result=await r.run();assert.equal(result.status,'CLOSED');assert.equal(result.exitCode,0);once(r);
  assert.deepEqual(r.trace,['write-START','provider-close','auxiliary-close','write-CLOSE','channel-close']);
  assert.equal(r.writes.at(-1).result.status,'CLOSED');
  const a=r.control.close(),b=r.control.close();assert.equal(a,b);assert.equal(await a,undefined);once(r);
});
check('provider-current-close-eof-still-requires-current-returned-owners',async()=>{
  const r=fixture({},true),result=await r.run();assert.equal(result.status,'CLOSED');once(r);
  assert.deepEqual(r.writes.map(v=>v.operation),['START']);
});
check('provider-current-close-provider-held-during-auxiliary-close-withholds-close-reply',async()=>{
  await held({auxiliary:r=>{r.provider.held=true;}});
});
check('provider-current-close-provider-release-revoked-during-auxiliary-close',async()=>{
  await held({auxiliary:r=>{r.provider.released=false;}});
});
check('provider-current-close-provider-active-during-auxiliary-close',async()=>{
  await held({auxiliary:r=>{r.provider.activeOperations=1;}});
});
check('provider-current-close-provider-phase-changed-during-auxiliary-close',async()=>{
  await held({auxiliary:r=>{r.provider.phase='CLOSE_UNCERTAIN';}});
});
check('provider-current-close-auxiliary-held-during-channel-close',async()=>{
  await held({channel:r=>{r.auxiliary.held=true;}},{closeReply:true});
});
check('provider-current-close-auxiliary-reopened-during-channel-close',async()=>{
  await held({channel:r=>{r.auxiliary.closed=false;}},{closeReply:true});
});
check('provider-current-close-auxiliary-active-during-channel-close',async()=>{
  await held({channel:r=>{r.auxiliary.active=true;}},{closeReply:true});
});
check('provider-current-close-provider-held-during-channel-close',async()=>{
  await held({channel:r=>{r.provider.held=true;}},{closeReply:true});
});
check('provider-current-close-provider-release-revoked-during-channel-close',async()=>{
  await held({channel:r=>{r.provider.released=false;}},{closeReply:true});
});
check('provider-current-close-provider-active-during-channel-close',async()=>{
  await held({channel:r=>{r.provider.activeOperations=1;}},{closeReply:true});
});
check('provider-current-close-provider-phase-changed-during-channel-close',async()=>{
  await held({channel:r=>{r.provider.phase='CLOSE_UNCERTAIN';}},{closeReply:true});
});
check('provider-current-close-late-provider-change-after-close-reply-is-not-clean-final-state',async()=>{
  const {r}=await held({write:r=>{r.provider.held=true;}},{closeReply:true});
  assert.equal(r.writes.at(-1).result.status,'CLOSED');assert.equal(r.writes.length,2);
});
check('provider-current-close-late-auxiliary-change-after-close-reply-is-not-clean-final-state',async()=>{
  await held({write:r=>{r.auxiliary.held=true;}},{closeReply:true});
});
check('provider-current-close-eof-owner-change-cannot-escape-final-check',async()=>{
  await held({channel:r=>{r.provider.held=true;}},{eof:true});
});
check('provider-current-close-held-verdict-cannot-be-repaired-or-retry-stops',async()=>{
  const {r,result}=await held({channel:r=>{r.provider.held=true;}},{closeReply:true});
  r.provider=provider();r.auxiliary=auxiliary();r.channel=channel();
  const first=r.control.close(),second=r.control.close();assert.equal(first,second);await assert.rejects(first);
  assert.equal(result.status,'HELD');assert.equal(r.control.inspect().held,true);once(r);
});
check('provider-current-close-nonvoid-provider-stop-remains-held-without-auxiliary-entry',async()=>{
  await held({provider:()=>true},{expectedAuxiliary:0});
});
check('provider-current-close-rejected-auxiliary-stop-still-stops-channel-once',async()=>{
  await held({auxiliary:()=>{throw new TypeError('DECLARED_AUXILIARY_UNKNOWN');}});
});

export const providerCurrentCloseOwnerDataCases=F(checks.map(c=>F(c)));
if(typeof process.argv[1]==='string'&&fileURLToPath(import.meta.url)===process.argv[1]){
  const cases=[];for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
  const failed=cases.filter(c=>c.status!=='PASS').length;
  console.log(JSON.stringify({qualification:'G2_PROVIDER_CURRENT_CLOSE_OWNERS_DATA',passed:cases.length-failed,failed,cases,
    actualControllerAndSharedCloseObservation:true,providerAuxiliaryChannelClockAndTimerPorts:'DECLARED_MEMORY_ONLY',
    noAdditionalStopsOrEconomicOperations:true,atomicOwnershipFencing:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',
    nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
    nativeLauncherExecuted:false,LinuxAcceptance:'NOT_ESTABLISHED',fullG2:'NOT_ESTABLISHED'}));if(failed)process.exitCode=1;
}
