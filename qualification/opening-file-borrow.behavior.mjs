// Actual opening-failure custody with declared synchronous file/wallet ports.
// No native owner, filesystem, SQLite, key, signature, SDK, socket or timer.
import assert from 'node:assert/strict';
import { createApiCreditOpeningFailureCustody as own } from '../src/api-credit-opening-failure-custody.js';

const F=Object.freeze,checks=[];
function check(id,run){checks.push({id,run});}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function drain(){for(let i=0;i<12;i++)await Promise.resolve();}
function fixture(options={}){
 const stop=deferred(),events=[],state={revoked:false,closed:false,walletClosed:false,walletHeld:false,activeOperation:null,
  clearCalls:0,revokes:0,closes:0,walletStops:0,walletViewUnknown:false,changed:false};
 let cached=null;
 const file=F({
  revoke:F(()=>{events.push('file.revoke');state.revokes++;state.revoked=true;}),
  close:F(()=>{events.push('file.close');state.closes++;state.closed=true;if(options.afterClose)options.afterClose(state);}),
  inspect:F(()=>{events.push('file.view');if(options.fileView)options.fileView(state);
   return F({spendingFileOwnerVersion:1,lifecycle:state.closed?'CLOSED':state.revoked?'REVOKED':'OPEN',held:false,busy:false,
    backendClosed:state.revoked,databaseOpen:!state.closed,physicalCloseEntered:state.closed,physicalCloseReturned:state.closed});}),
 });
 const wallet=F({
  close:F(()=>{events.push('wallet.close');if(cached===null){state.walletStops++;cached=stop.promise;}return cached;}),
  inspect:F(()=>{events.push('wallet.view');if(state.walletViewUnknown)throw Error('declared wallet view unknown');
   return F({sdk105WalletOwnerVersion:1,lifecycle:state.walletClosed?'CLOSED':'CLOSING',held:state.walletHeld,
    activeOperation:state.activeOperation,clearCalls:state.clearCalls,clearOutcome:state.walletClosed?'CLEAR_RETURNED':'NOT_REQUESTED'});}),
 });
 const config=(present=true,entered=true,clientEntered=false)=>F({fileOwner:file,walletOwner:present?wallet:null,
  walletOpeningEntered:entered,clientOpeningEntered:clientEntered});
 function finish(){state.walletClosed=true;state.clearCalls=1;stop.resolve(undefined);}
 return{state,events,file,wallet,config,finish};
}
function retained(controller){const v=controller.inspect();assert.equal(v.lifecycle,'HELD');assert.equal(v.held,true);
 assert.equal(v.fileOwnerRetained,true);assert.equal(v.openingMayResume,false);assert.equal(v.authority,'NONE');return v;}
async function drift(edit){
 const f=fixture({fileView(s){if(!s.changed&&s.closes===0){s.changed=true;edit(s);}}}),c=own(f.config());
 assert.equal(f.state.closes,0);f.finish();await drain();const v=retained(c);
 assert.equal(v.walletStopReturned,true);assert.equal(v.fileCloseEntered,false);assert.equal(v.fileCloseReturned,false);
 assert.equal(f.state.closes,0);assert.equal(f.state.revokes,1);assert.equal(f.state.walletStops,1);return{f,c};
}

check('opening-file-borrow-wallet-held-during-file-view-blocks-physical-close',()=>drift(s=>{s.walletHeld=true;}));
check('opening-file-borrow-wallet-operation-during-file-view-blocks-physical-close',()=>drift(s=>{s.activeOperation='DECLARED_BORROWER';}));
check('opening-file-borrow-clearing-receipt-drift-during-file-view-blocks-physical-close',()=>drift(s=>{s.clearCalls=0;}));
check('opening-file-borrow-wallet-lifecycle-drift-during-file-view-blocks-physical-close',()=>drift(s=>{s.walletClosed=false;}));
check('opening-file-borrow-unknown-wallet-view-after-file-view-retains-both-owners',()=>drift(s=>{s.walletViewUnknown=true;}));
check('opening-file-borrow-late-wallet-repair-cannot-retry-a-refused-close',async()=>{
 const {f,c}=await drift(s=>{s.walletHeld=true;});f.state.walletHeld=false;
 assert.equal(own(f.config()),c);retained(c);await drain();retained(c);
 assert.equal(f.state.closes,0);assert.equal(f.state.walletStops,1);assert.equal(f.state.revokes,1);
});
check('opening-file-borrow-clean-wallet-is-observed-after-file-view-and-before-one-close',async()=>{
 const f=fixture(),c=own(f.config());f.finish();await drain();const v=c.inspect();
 assert.equal(v.lifecycle,'CLOSED');assert.equal(v.fileCloseReturned,true);assert.equal(v.held,false);
 const close=f.events.indexOf('file.close'),before=f.events.slice(0,close);
 assert.ok(before.lastIndexOf('wallet.view')>before.lastIndexOf('file.view'));
 assert.equal(f.state.closes,1);assert.equal(f.state.walletStops,1);assert.equal(f.state.revokes,1);
 assert.equal(own(f.config()),c);assert.equal(f.state.closes,1);
});
check('opening-file-borrow-pre-wallet-file-close-keeps-its-existing-order-and-no-wallet-call',()=>{
 const f=fixture(),c=own(f.config(false,false,false));assert.equal(c.inspect().lifecycle,'CLOSED');
 assert.deepEqual(f.events.slice(0,4),['file.revoke','file.view','file.close','file.view']);
 assert.equal(f.state.walletStops,0);assert.equal(f.events.includes('wallet.view'),false);assert.equal(f.state.closes,1);
});
check('opening-file-borrow-unreturned-client-stays-held-with-no-competing-wallet-stop',async()=>{
 const f=fixture(),c=own(f.config(true,true,true));retained(c);f.finish();await drain();retained(c);
 assert.equal(f.state.walletStops,0);assert.equal(f.state.closes,0);assert.equal(f.state.revokes,1);
});
check('opening-file-borrow-real-void-close-return-is-preserved-when-post-close-wallet-view-drifts',async()=>{
 const f=fixture({afterClose(s){s.walletHeld=true;}}),c=own(f.config());f.finish();await drain();const v=retained(c);
 assert.equal(v.fileCloseEntered,true);assert.equal(v.fileCloseReturned,true);assert.equal(f.state.closes,1);
 assert.equal(own(f.config()),c);assert.equal(f.state.closes,1);assert.equal(f.state.walletStops,1);
});
check('opening-file-borrow-reentrant-same-owner-join-cannot-repeat-any-stop',async()=>{
 let f,joined=null;f=fixture({fileView(s){if(!s.changed&&s.closes===0){s.changed=true;joined=own(f.config());}}});
 const c=own(f.config());f.finish();await drain();assert.equal(joined,c);assert.equal(c.inspect().lifecycle,'CLOSED');
 assert.equal(f.state.revokes,1);assert.equal(f.state.walletStops,1);assert.equal(f.state.closes,1);
});
check('opening-file-borrow-controller-remains-observation-only-after-refusal',async()=>{
 const {c}=await drift(s=>{s.walletHeld=true;});const v=c.inspect();
 assert.deepEqual(Reflect.ownKeys(c),['inspect']);assert.equal(Object.isFrozen(c),true);assert.equal(Object.isFrozen(v),true);
 assert.equal(v.nativeResourceRelease,'NOT_ESTABLISHED');
 for(const key of ['file','wallet','reopen','retry','release','sign','prepare','submit','close'])assert.equal(Object.hasOwn(c,key),false);
});

const cases=[];
for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
const failed=cases.filter(c=>c.status!=='PASS').length;
console.log(JSON.stringify({qualification:'G2_OPENING_FILE_BORROW_CURRENT_WALLET_DATA',passed:cases.length-failed,failed,cases,
 actualOpeningFailureCustodyOwner:true,fileWalletAndStopPorts:'DECLARED_DATA_ONLY',
 nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
 nativePhysicalRelease:'NOT_ESTABLISHED',freshProcessAcceptance:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED',G0G5Acceptance:'OPEN'}));
if(failed)process.exitCode=1;
