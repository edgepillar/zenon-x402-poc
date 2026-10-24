// VERSIONED V3 SOURCE: stable directory identity; old files/evidence remain unchanged.
/* SOURCE DRAFT, NOT EXECUTED. Private IPC entry for the real P1 service lane.
 * A new full service namespace/profile and managed supervisor are required.
 * No wallet material from the payer is accepted, and no original is printed.
 */
import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,P=Object.getPrototypeOf,K=Reflect.ownKeys,O=Object.hasOwn;
const NS='getPinnedNativeCapacityServiceLaneNamespaceSnapshotV3',E=process.env,d=D(globalThis,NS);
if(process.version!=='v24.19.0'||process.platform!=='darwin'||process.arch!=='arm64'
    ||process.argv.length!==3||process.argv[2]!==E.SPV_TASK_SCRATCH||typeof process.send!=='function'||!process.connected
    ||E.X402_NATIVE_CAPACITY_SERVICE_SELECTION!=='native-capacity-service-source-draft-v3'
    ||E.X402_ISSUED_NATIVE_VERTICAL_SELECTION!=='current-native-issued-post-source-draft-v1'
    ||!d||!O(d,'value')||d.writable||d.configurable||d.enumerable||typeof d.value!=='function'||!Object.isFrozen(d.value)
    ||E.NODE_OPTIONS!==undefined||E.NODE_PATH!==undefined||E.NODE_TEST_CONTEXT!==undefined)fail();
const snapshot=d.value();
if(snapshot.profileKind!=='NATIVE_CAPACITY_SERVICE_LANE_NODE24_V3'||!/^[0-9a-f]{64}$/.test(snapshot.sourceRowsSha256||'')
    ||snapshot.baselineApplication117Preserved!==true||snapshot.baselinePackages404Preserved!==true
    ||snapshot.sourceTransforms!==0||snapshot.nativeBuiltinAliases!==0
    ||snapshot.applicationFiles!==138||snapshot.packageFiles!==404||snapshot.ordinaryInstalledNamespaceQualified!==false)fail();
const context=F({runId:E.X402_NATIVE_CAPACITY_RUN_ID,laneId:E.X402_NATIVE_CAPACITY_LANE_ID,sourceRowsSha256:snapshot.sourceRowsSha256});
if(!/^[0-9a-f]{64}$/.test(context.runId||'')||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(context.laneId||''))fail();
let owner=null,opening=false,acquisitionEntered=false,active=null,closing=null,closeRequested=false,held=false,stage='NEW',sequence=0;
let pendingSends=0,release=null,releaseSent=false,measurementUnknown=false;
const SEND=process.send;
process.on('message',onMessage);
process.on('disconnect',()=>{if(closing===null||active!==null||pendingSends!==0||!releaseSent)hold();closeOnce();});
process.on('error',()=>{hold();closeOnce();});
function hold(){held=true;process.exitCode=1;}
function send(seq,kind,status,value){
  try{const message={protocolVersion:1,context,sequence:seq,kind,status,value};
    if(!process.connected||Buffer.byteLength(JSON.stringify(message))>131072)fail();
    pendingSends++;Reflect.apply(SEND,process,[message,undefined,{keepOpen:false},error=>{
      pendingSends--;if(error){hold();closeOnce();}
      else if(kind==='RELEASE_IPC'){if(pendingSends!==0||active!==null||held)hold();else process.disconnect();}
      else maybeRelease();
    }]);
  }catch{hold();closeOnce();}
}
function onMessage(message,handle){
  let m;
  try{
    if(handle!==undefined&&handle!==null)fail();m=exact(capture(message),['protocolVersion','context','sequence','kind','payload']);
    const ctx=exact(m.context,['runId','laneId','sourceRowsSha256']);
    if(m.protocolVersion!==1||Object.keys(context).some(k=>ctx[k]!==context[k])||!Number.isSafeInteger(m.sequence)
        ||Object.is(m.sequence,-0)||m.sequence!==sequence+1||m.sequence>600)fail();sequence=m.sequence;
    if(m.kind==='CLOSE'){exact(m.payload,[]);if(closeRequested)fail();
      closeOnce().then(value=>send(m.sequence,m.kind,value.held?'UNKNOWN':'OBSERVED_RETURNED_CLOSE',value));return;}
    if(m.kind==='RELEASE_IPC'){exact(m.payload,[]);if(release!==null||closing===null||owner===null||active!==null||held||owner.inspect().held)fail();
      release=m;maybeRelease();return;}
    if(m.kind==='TIMINGS'){if(owner===null||active!==null||held||closeRequested)fail();send(m.sequence,m.kind,'OBSERVED',owner.timingPage(m.payload));return;}
    if(m.kind==='WINDOW_OPEN'||m.kind==='WINDOW_STOP'){
      exact(m.payload,[]);
      // Out-of-band instrument messages deliberately precede the ordinary
      // active/stage gate. STOP may cross an armed or pending original.
      if(owner===null||held||closeRequested){measurementUnknown=true;send(m.sequence,m.kind,'UNKNOWN',null);return;}
      try{const value=m.kind==='WINDOW_OPEN'?owner.openMeasurementWindow():owner.stopMeasurementWindow();
        send(m.sequence,m.kind,'OBSERVED',value);
      }catch{measurementUnknown=true;send(m.sequence,m.kind,'UNKNOWN',null);}
      return; // Measurement failure alone never closes/quarantines real work.
    }
    if(held||closeRequested||active!==null)fail();
    const stages={START:'NEW',RETAIN:'STARTED',ACTIVATE:'RETAINED',ARM:'ACTIVE',FINISH:'ARMED',BALANCES:'ACTIVE'};
    if(!O(stages,m.kind)||stage!==stages[m.kind])fail();
  }catch{hold();closeOnce();return;}
  let done;const settled=new Promise(resolve=>{done=resolve;});active={settled};
  perform(m.kind,m.payload).then(value=>{
    if(held||closeRequested){hold();send(m.sequence,m.kind,'UNKNOWN',null);}else send(m.sequence,m.kind,'OBSERVED',value);
    active=null;done();
  },()=>{hold();send(m.sequence,m.kind,'UNKNOWN',null);active=null;done();closeOnce();});
}
function maybeRelease(){
  if(release===null||releaseSent||pendingSends!==0||active!==null)return;
  closing.then(value=>{if(releaseSent)return;if(value.status!=='CLOSED'||held){hold();return;}
    releaseSent=true;send(release.sequence,'RELEASE_IPC','RELEASING_IPC',{status:'IPC_RELEASE_PENDING'});});
}
async function perform(kind,payload){
  if(kind==='START'){
    const c=exact(payload,['payerAddress','capabilityCommitment','payeeAddress','totalCalls']);
    const {openNativeCapacityServiceLane}=await import('./capacity-native-service-lane-v3.owner.draft.mjs');
    if(held||closeRequested)fail();opening=true;acquisitionEntered=true;
    try{owner=await openNativeCapacityServiceLane({root:process.argv[2],context,...c});}finally{opening=false;}
    if(held||closeRequested)fail();stage='STARTED';return owner.challenge();
  }
  if(kind==='RETAIN'){const result=owner.retainOriginal(payload);stage='RETAINED';return result;}
  if(kind==='ACTIVATE'){exact(payload,[]);const result=await owner.activate();stage='ACTIVE';return result;}
  if(kind==='ARM'){const result=owner.arm(payload);stage='ARMED';return result;}
  if(kind==='FINISH'){exact(payload,[]);const result=owner.finish();stage='ACTIVE';return result;}
  if(kind==='BALANCES'){exact(payload,[]);return owner.balances();}
  fail();
}
function closeOnce(){
  if(closing!==null)return closing;closeRequested=true;const entered=active;let complete;closing=new Promise(resolve=>{complete=resolve;});
  (async()=>{let result=null;try{
    let stop=owner===null?null:owner.close();if(entered!==null)await entered.settled;
    if(stop===null&&owner!==null)stop=owner.close();if(stop!==null)result=await stop;
    if(opening||acquisitionEntered&&owner===null||active!==null||result!==null&&result.status!=='CLOSED')fail();
    const view=owner===null?null:owner.inspect();if(view?.held)hold();
    complete(F({status:held?'UNKNOWN':'CLOSED',held,ownerAcquisitionEntered:acquisitionEntered,ownerReturned:owner!==null,
      closeFacts:result,view,measurementUnknown,nativeQualified:false,authority:'NONE'}));
  }catch{hold();complete(F({status:'UNKNOWN',held:true,ownerAcquisitionEntered:acquisitionEntered,ownerReturned:owner!==null,
    closeFacts:result,nativeQualified:false,authority:'NONE'}));}})();return closing;
}
function capture(value,budget={nodes:4096,bytes:65536},depth=0){
  if(--budget.nodes<0||depth>16)fail();
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='string'){budget.bytes-=Buffer.byteLength(value);if(budget.bytes<0)fail();return value;}
  if(typeof value==='number'){if(!Number.isSafeInteger(value)||Object.is(value,-0))fail();return value;}
  if(typeof value!=='object'||utilTypes.isProxy(value))fail();const array=Array.isArray(value);
  if(P(value)!==(array?Array.prototype:Object.prototype)||K(value).length>512)fail();const out=array?[]:{};
  for(const key of K(value)){if(array&&key==='length')continue;
    if(typeof key!=='string'||key.length>128)fail();budget.bytes-=Buffer.byteLength(key);if(budget.bytes<0)fail();
    const d=D(value,key);if(!d||!O(d,'value')||!d.enumerable)fail();Object.defineProperty(out,key,{value:capture(d.value,budget,depth+1),enumerable:true});}
  if(array&&out.length!==value.length)fail();return F(out);
}
function exact(value,names){if(value===null||typeof value!=='object'||utilTypes.isProxy(value)||P(value)!==Object.prototype||K(value).length!==names.length)fail();
  const out={};for(const name of names){const d=D(value,name);if(!d||!O(d,'value')||!d.enumerable)fail();Object.defineProperty(out,name,{value:d.value,enumerable:true});}return out;}
function fail(){const e=new TypeError('NATIVE_CAPACITY_SERVICE_WORKER_UNAVAILABLE');Object.defineProperty(e,'stack',{value:'TypeError: NATIVE_CAPACITY_SERVICE_WORKER_UNAVAILABLE'});throw F(e);}

