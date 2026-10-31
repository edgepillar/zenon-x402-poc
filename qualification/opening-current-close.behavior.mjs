// Actual opening-failure custody with declared file/wallet DATA only.
// No native opener, filesystem, SQLite, key, signer, socket or process runs.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createApiCreditOpeningFailureCustody as own } from '../src/api-credit-opening-failure-custody.js';
const F=Object.freeze,checks=[];
function check(id,run){checks.push(F({id,run}));}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function drain(){for(let i=0;i<8;i++)await Promise.resolve();}
function fixture(withWallet=false){
 const stop=deferred(),s={revoked:false,closed:false,walletClosed:false,fileHeld:false,fileBusy:false,databaseOpen:null,backendClosed:null,
  physicalEntered:null,physicalReturned:null,walletHeld:false,walletActive:null,walletClear:null,revokes:0,closes:0,stops:0,fileReads:0,walletReads:0,
  fileThrow:false,walletThrow:false,fileOverride:null,walletOverride:null,onFile:null,onWallet:null};
 const file=F({revoke:F(()=>{s.revokes++;s.revoked=true;}),close:F(()=>{s.closes++;s.closed=true;}),
  inspect:F(()=>{s.fileReads++;s.onFile?.();if(s.fileThrow)throw Error('declared file observation loss');if(s.fileOverride!==null)return s.fileOverride;
   return F({spendingFileOwnerVersion:1,lifecycle:s.fileHeld?'HELD':s.closed?'CLOSED':s.revoked?'REVOKED':'OPEN',held:s.fileHeld,busy:s.fileBusy,
    backendClosed:s.backendClosed??s.revoked,databaseOpen:s.databaseOpen??!s.closed,
    physicalCloseEntered:s.physicalEntered??s.closed,physicalCloseReturned:s.physicalReturned??s.closed});})});
 const wallet=F({close:F(()=>{s.stops++;return stop.promise;}),inspect:F(()=>{s.walletReads++;s.onWallet?.();if(s.walletThrow)throw Error('declared wallet observation loss');if(s.walletOverride!==null)return s.walletOverride;
  return F({sdk105WalletOwnerVersion:1,lifecycle:s.walletClosed?'CLOSED':'CLOSING',held:s.walletHeld,activeOperation:s.walletActive,
   clearCalls:s.walletClosed?1:0,clearOutcome:s.walletClear??(s.walletClosed?'CLEAR_RETURNED':'NOT_REQUESTED')});})});
 const config=F({fileOwner:file,walletOwner:withWallet?wallet:null,walletOpeningEntered:withWallet,clientOpeningEntered:false});
 const controller=own(config);return{s,file,wallet,config,controller,async finish(){s.walletClosed=true;stop.resolve(undefined);await drain();}};
}
function held(f){const v=f.controller.inspect();assert.equal(v.lifecycle,'HELD');assert.equal(v.held,true);assert.equal(v.fileCloseReturned,true);
 assert.equal(v.fileOwnerRetained,true);assert.equal(v.openingMayResume,false);assert.equal(v.authority,'NONE');assert.equal(v.nativeResourceRelease,'NOT_ESTABLISHED');
 assert.equal(f.s.revokes,1);assert.equal(f.s.closes,1);return v;}
let clean,unknown; // Reuse exact existing frames after reaching the unchanged 16-frame cap.
check('opening-current-close-clean-file-rechecks-without-repeating-cleanup',()=>{
 const f=fixture();clean=f;const before=f.s.fileReads,v=f.controller.inspect();assert.equal(v.lifecycle,'CLOSED');assert.equal(v.held,false);
 assert.equal(f.s.fileReads,before+1);assert.equal(f.s.revokes,1);assert.equal(f.s.closes,1);assert.equal(f.s.stops,0);
});
check('opening-current-close-returned-wallet-rechecks-both-original-owners',async()=>{
 const f=fixture(true);assert.equal(f.controller.inspect().lifecycle,'CLOSING');await f.finish();const reads=[f.s.fileReads,f.s.walletReads];
 assert.equal(f.controller.inspect().lifecycle,'CLOSED');assert.deepEqual([f.s.fileReads,f.s.walletReads],[reads[0]+1,reads[1]+1]);
 assert.equal(f.s.stops,1);assert.equal(f.s.closes,1);
});
check('opening-current-close-late-held-file-preserves-historical-void-return',()=>{
 const f=fixture();unknown=f;assert.equal(f.controller.inspect().lifecycle,'CLOSED');f.s.fileHeld=true;const v=held(f);assert.equal(v.historicalObservation,true);
});
check('opening-current-close-late-open-database-is-held',()=>{const f=fixture();f.s.databaseOpen=true;held(f);});
check('opening-current-close-late-busy-file-is-held',()=>{const f=fixture();f.s.fileBusy=true;held(f);});
check('opening-current-close-missing-backend-revocation-is-held',()=>{const f=fixture();f.s.backendClosed=false;held(f);});
check('opening-current-close-missing-physical-close-entry-is-held',()=>{const f=fixture();f.s.physicalEntered=false;held(f);});
check('opening-current-close-missing-current-physical-close-return-is-held',()=>{const f=fixture();f.s.physicalReturned=false;held(f);});
check('opening-current-close-late-held-wallet-is-held',async()=>{const f=fixture(true);await f.finish();f.s.walletHeld=true;held(f);assert.equal(f.s.stops,1);});
check('opening-current-close-late-wallet-operation-is-held',async()=>{const f=fixture(true);await f.finish();f.s.walletActive='DECLARED_LATE_OPERATION';held(f);});
check('opening-current-close-late-wallet-clear-uncertainty-is-held',async()=>{const f=fixture(true);await f.finish();f.s.walletClear='UNKNOWN';held(f);});
check('opening-current-close-file-view-exception-is-held-without-retry',()=>{const f=fixture();f.s.fileThrow=true;held(f);});
check('opening-current-close-wallet-view-exception-is-held-without-retry',async()=>{const f=fixture(true);await f.finish();f.s.walletThrow=true;held(f);});
check('opening-current-close-proxy-file-view-runs-no-proxy-hooks',()=>{
 const f=fixture();let hooks=0;f.s.fileOverride=new Proxy({}, {get(){hooks++;throw Error();},getPrototypeOf(){hooks++;throw Error();},ownKeys(){hooks++;throw Error();}});
 held(f);assert.equal(hooks,0);
});
check('opening-current-close-accessor-wallet-view-runs-no-value-hooks',async()=>{
 const f=fixture(true);await f.finish();let hooks=0;f.s.walletOverride=F({sdk105WalletOwnerVersion:1,lifecycle:'CLOSED',get held(){hooks++;throw Error();}});
 held(f);assert.equal(hooks,0);
});
check('opening-current-close-file-inspection-reentry-latches-held',()=>{
 const f=fixture();let calls=0;f.s.onFile=()=>{calls++;assert.equal(f.controller.inspect().lifecycle,'HELD');};held(f);assert.equal(calls,1);
});
check('opening-current-close-wallet-inspection-reentry-latches-held',async()=>{
 const f=fixture(true);await f.finish();let calls=0;f.s.onWallet=()=>{calls++;assert.equal(f.controller.inspect().lifecycle,'HELD');};held(f);assert.equal(calls,1);
});
check('opening-current-close-opaque-thenable-view-is-not-assimilated',()=>{
 const f=fixture();let hooks=0;f.s.fileOverride=F({get then(){hooks++;throw Error();}});held(f);assert.equal(hooks,0);
});
check('opening-current-close-unchanged-retention-cap-keeps-earlier-clean-claim-identity',()=>{
 assert.equal(own(clean.config),clean.controller);assert.equal(clean.controller.inspect().lifecycle,'CLOSED');assert.equal(clean.s.revokes,1);assert.equal(clean.s.closes,1);
 let calls=0;const file=F({revoke:F(()=>{calls++;}),close:F(()=>{calls++;}),inspect:F(()=>{calls++;})});
 assert.throws(()=>own(F({fileOwner:file,walletOwner:null,walletOpeningEntered:false,clientOpeningEntered:false})));assert.equal(calls,0);
});
check('opening-current-close-held-history-cannot-be-repaired-by-clean-late-views',()=>{
 unknown.s.fileHeld=false;const reads=unknown.s.fileReads;assert.equal(own(unknown.config),unknown.controller);held(unknown);
 assert.equal(unknown.s.fileReads,reads);for(const method of ['close','reopen','retry','sign','submit','prepare'])assert.equal(Object.hasOwn(unknown.controller,method),false);
});

export const openingCurrentCloseDataCases=F([...checks]);
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const cases=[];let current=null,reported=false;
 function report(){if(reported)return;reported=true;const failed=cases.filter(c=>c.status!=='PASS').length;
  console.log(JSON.stringify({qualification:'G2_OPENING_CURRENT_CLOSE_DATA',passed:cases.length-failed,failed,cases,
   actualOpeningFailureCustody:true,ports:'DECLARED_FILE_WALLET_VIEWS_ONLY',nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
   nativeOpeningExecuted:false,nativePhysicalRelease:'NOT_ESTABLISHED',crossProcessFencing:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED',G2:'OPEN'}));if(failed)process.exitCode=1;}
 function unsettled(){if(current!==null){cases.push({id:current,status:'FAIL',error:'UNSETTLED_DECLARED_DATA_PROMISE'});report();}}
 process.once('beforeExit',unsettled);for(const {id,run}of checks){current=id;try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,256)});}current=null;}
 process.off('beforeExit',unsettled);report();
}
