// CURRENT OFFERED PARENT V2: real current V4 children; old R4/V1 files remain unchanged.
/* SOURCE DRAFT, NOT EXECUTED. Own two REAL Node children for one full P1 lane:
 * actual payer + actual application/RPC/grant/store service. No injected child,
 * wallet, SDK, store, transport or smaller compatibility application.
 * Parent/service preloaders and managed private-profile builder are still
 * required; missing admission rejects BEFORE fork. Native approval is separate.
 */
import { captureNativePrivateDirectoryStatIdentity as DIRECTORY_ID } from '../src/native-private-directory-identity.js';
import { fork } from 'node:child_process';
import { captureNativeCapacityServiceWindowData as WINDOW_DATA } from '../src/service-credit-capacity-window-writer-trace-data.js';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { lstatSync, fstatSync, openSync, closeSync, readSync, constants as C } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,P=Object.getPrototypeOf,K=Reflect.ownKeys,O=Object.hasOwn;
const NS='getPinnedNativeCapacityCurrentOfferedSupervisorNamespaceSnapshotV2',instances=new Set();
const PAYER_ENTRY=fileURLToPath(new URL('./capacity-native-current-payer-v4.worker.draft.mjs',import.meta.url));
const PAYER_PRELOAD=fileURLToPath(new URL('./capacity-native-current-payer-v4.namespace.preload.draft.mjs',import.meta.url));
const SERVICE_ENTRY=fileURLToPath(new URL('./capacity-native-current-service-v4.worker.draft.mjs',import.meta.url));
const SERVICE_PRELOAD=fileURLToPath(new URL('./capacity-native-current-service-v4.namespace.preload.draft.mjs',import.meta.url));

export function createNativeCapacityCurrentOfferedPairV2(options){
  if(arguments.length!==1)fail();const c=exact(options,['context','plan','payerProfile','serviceProfile','payeeAddress','commandBudgetMs','closeBudgetMs']);
  const ctx=F(exact(c.context,['runId','laneId'])),plan=F(exact(c.plan,['warmupCallsPerLane','measurementCallsPerLane']));
  if(typeof ctx.runId!=='string'||typeof ctx.laneId!=='string'
      ||!/^[0-9a-f]{64}$/.test(ctx.runId)||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(ctx.laneId)
      ||typeof c.payeeAddress!=='string'||!/^z1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/.test(c.payeeAddress))fail();
  integer(plan.warmupCallsPerLane,0,255);integer(plan.measurementCallsPerLane,1,256);
  const total=plan.warmupCallsPerLane+plan.measurementCallsPerLane;if(total>256)fail();
  integer(c.commandBudgetMs,1000,60000);integer(c.closeBudgetMs,6000,15000);
  const admission=namespace(),namespaceFunction=D(globalThis,NS).value,id=ctx.runId+'\0'+ctx.laneId;
  if(instances.has(id)||instances.size>=16)fail();
  const payerConfig=profile(c.payerProfile,'PAYER',PAYER_ENTRY,PAYER_PRELOAD);
  const serviceConfig=profile(c.serviceProfile,'SERVICE',SERVICE_ENTRY,SERVICE_PRELOAD);
  if(payerConfig.root===serviceConfig.root)fail();instances.add(id); // Never reset after uncertainty or close.
  let held=false,phase='CREATED',active=null,funding=null,closing=null,finalClose=null,payer=null,service=null,grant=null;
  let warmupReserved=0,measuredReserved=0,completed=0,referenceCandidates=0,referenceWindows=0;
  let balance=null,freshBalanceReads=0,windowOpenEntered=false,windowStopEntered=false,windowOpenAck=null,windowStopAck=null,measurementUnknown=false;
  const serviceWindowContext=F({...ctx,sourceRowsSha256:serviceConfig.sourceRowsSha256});
  let launchAttempts=0,launchUnknown=false;
  function current(){if(D(globalThis,NS)?.value!==namespaceFunction||namespace().sourceRowsSha256!==admission.sourceRowsSha256)fail();}
  function live(){current();if(held||closing!==null)fail();}
  function hold(){held=true;phase='HELD';}
  function capabilities(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});promise.catch(()=>undefined);return{promise,resolve,reject};}
  function launch(work){live();if(active!==null)fail();const cap=capabilities();active=cap.promise;
    // Enter the original ARM send before returning its reserved operation.
    // A later parent STOP cannot overtake a deferred not-yet-entered ARM.
    let actual;try{actual=work();}catch{hold();active=null;cap.reject(problem());return cap.promise;}
    actual.then(value=>{if(active===cap.promise)active=null;if(closing!==null||held){hold();cap.reject(problem());}else cap.resolve(value);},
      ()=>{hold();if(active===cap.promise)active=null;cap.reject(problem());close();});return cap.promise;}

  function startChild(selected){
    current();const base={PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC',NODE_DISABLE_COMPILE_CACHE:'1',WS_NO_BUFFER_UTIL:'1',WS_NO_UTF_8_VALIDATE:'1',
      SPV_TASK_SCRATCH:selected.root,X402_NATIVE_CAPACITY_RUN_ID:ctx.runId,X402_NATIVE_CAPACITY_LANE_ID:ctx.laneId,
      X402_NATIVE_CAPACITY_RUN_SCOPE:'one-reviewed-native-capacity-current-roles-v4'};
    const env=selected.role==='PAYER'?{...base,X402_NATIVE_CAPACITY_LANE_SELECTION:'native-capacity-current-payer-source-draft-v4',
      X402_NATIVE_CAPACITY_RUN_SCOPE:'one-reviewed-native-capacity-current-roles-v4',X402_NATIVE_CAPACITY_PROFILE_PATH:selected.path,
      X402_NATIVE_CAPACITY_PROFILE_SHA256:selected.sha256}:{...base,X402_NATIVE_CAPACITY_SERVICE_SELECTION:'native-capacity-current-service-source-draft-v4',
      X402_ISSUED_NATIVE_VERTICAL_SELECTION:'current-native-issued-post-source-draft-v1',X402_NATIVE_CAPACITY_SERVICE_PROFILE_PATH:selected.path,
      X402_NATIVE_CAPACITY_SERVICE_PROFILE_SHA256:selected.sha256};
    let child;launchAttempts++;
    try{child=fork(selected.entry,[selected.root],{execPath:process.execPath,cwd:selected.root,env,serialization:'json',detached:false,
      execArgv:['--no-addons','--disallow-code-generation-from-strings','--disable-proto=throw','--unhandled-rejections=strict','--import='+selected.preloader],
      stdio:['ignore','pipe','pipe','ipc']});}catch{launchUnknown=true;hold();throw problem();}
    const context=F({...ctx,sourceRowsSha256:selected.sourceRowsSha256}),pending=new Map(),operationTimings=[];
    let seq=0,exited=false,closed=false,disconnected=false,exitCode=null,signal=null,fault=false;
    const exit=capabilities(),out=stream(1024),err=stream(8192);
    child.stdout.on('data',bytes=>out.add(bytes));child.stderr.on('data',bytes=>err.add(bytes));
    child.stdout.once('end',()=>{out.eof=true;});child.stderr.once('end',()=>{err.eof=true;});
    child.stdout.on('error',()=>bad());child.stderr.on('error',()=>bad());
    function bad(){fault=true;hold();for(const ticket of pending.values()){
      if(ticket.timer!==null){clearTimeout(ticket.timer);ticket.timer=null;}
      if(!ticket.settled){ticket.settled=true;ticket.reject(problem());}
    }close();}
    child.on('error',bad);child.once('disconnect',()=>{disconnected=true;});
    child.once('exit',(code,sig)=>{exited=true;exitCode=code;signal=sig;if(code!==0||sig!==null)bad();});
    child.once('close',(code,sig)=>{closed=true;
      // EOF cannot produce a missing acknowledgement. Stop only these owned
      // timers; retain the unobserved tickets/counts and UNKNOWN evidence.
      for(const ticket of pending.values()){
        if(ticket.timer!==null){clearTimeout(ticket.timer);ticket.timer=null;}
        if(!ticket.settled){ticket.settled=true;ticket.reject(problem());}
        if(ticket.marker)measurementUnknown=true;else fault=true;
      }
      if(!exited||code!==0||sig!==null||signal!==null||exitCode!==0||!disconnected||fault||!out.eof||!err.eof)exit.reject(problem());
      else exit.resolve(undefined);});
    child.on('message',(message,handle)=>{
      let ticket;
      try{if(handle!==undefined&&handle!==null)fail();const m=capture(message),keys=selected.role==='PAYER'?
          ['protocolVersion','context','sequence','kind','status','value','timing']:['protocolVersion','context','sequence','kind','status','value'];exact(m,keys);
        const actualContext=exact(m.context,['runId','laneId','sourceRowsSha256']);
        if(m.protocolVersion!==1||Object.keys(context).some(k=>context[k]!==actualContext[k]))fail();
        ticket=pending.get(m.sequence);if(!ticket||ticket.kind!==m.kind||ticket.observed)fail();ticket.observed=true;
        if(selected.role==='PAYER'){
          const t=exact(m.timing,['source','startNs','endNs']);
          if(t.source!=='CHILD_LOCAL_MONOTONIC_OPERATION_NOT_SQL_LATENCY'||typeof t.startNs!=='string'||typeof t.endNs!=='string'
              ||!/^(?:0|[1-9][0-9]{0,38})$/.test(t.startNs)||!/^(?:0|[1-9][0-9]{0,38})$/.test(t.endNs)
              ||BigInt(t.endNs)<BigInt(t.startNs)||BigInt(t.endNs)>=(1n<<128n)||operationTimings.length>=264)fail();
          operationTimings.push(F({sequence:m.sequence,kind:m.kind,status:m.status,startNs:t.startNs,endNs:t.endNs,
            lateAfterTimeout:ticket.settled,clockDomain:'PAYER_CHILD_LOCAL',timingKind:t.source}));
        }
        if(ticket.timer!==null){clearTimeout(ticket.timer);ticket.timer=null;}
        if(ticket.settled){pending.delete(m.sequence);return;}
        if(ticket.marker&&m.status==='UNKNOWN'){
          if(m.value!==null)fail();measurementUnknown=true;
          ticket.settled=true;pending.delete(m.sequence);ticket.reject(problem());return;
        }
        const expected=m.kind==='CLOSE'?'OBSERVED_RETURNED_CLOSE':m.kind==='RELEASE_IPC'?'RELEASING_IPC':'OBSERVED';
        if(m.status!==expected||m.kind==='CLOSE'&&(m.value?.held!==false||selected.role==='SERVICE'&&m.value.status!=='CLOSED'))fail();
        ticket.settled=true;pending.delete(m.sequence);
        ticket.resolve(m.value);
      }catch{if(ticket&&!ticket.settled){ticket.settled=true;ticket.reject(problem());}bad();}
    });
    function command(kind,payload,control=false){
      const marker=kind==='WINDOW_OPEN'||kind==='WINDOW_STOP';
      if(!control&&kind!=='WINDOW_STOP')live();
      else if(control&&kind!=='CLOSE'&&kind!=='RELEASE_IPC')fail(); // Owned stops survive namespace refusal.
      if(marker&&selected.role!=='SERVICE')fail();
      const markerCount=[...pending.values()].filter(t=>t.marker).length;
      const ordinaryCount=[...pending.values()].filter(t=>!t.marker&&t.kind!=='CLOSE'&&t.kind!=='RELEASE_IPC').length;
      if(closed||!child.connected||pending.size>=5||marker&&markerCount>=2||!control&&!marker&&ordinaryCount>=1)
        return Promise.reject(problem());
      const cap=capabilities(),ticket={kind,marker,resolve:cap.resolve,reject:cap.reject,timer:null,settled:false,observed:false};
      const ordinal=++seq;pending.set(ordinal,ticket); // Before native send or timer callback.
      ticket.timer=setTimeout(()=>{ticket.timer=null;if(!ticket.settled){ticket.settled=true;
        if(marker)measurementUnknown=true;else bad();ticket.reject(problem());}},
        control?c.closeBudgetMs:c.commandBudgetMs);
      try{const message={protocolVersion:1,context,sequence:ordinal,kind,payload};if(Buffer.byteLength(JSON.stringify(message))>65536)fail();
        child.send(message,undefined,{keepOpen:false},error=>{if(error)bad();});}catch{bad();}
      return cap.promise;
    }
    function stream(cap){const pieces=[];let size=0,retained=0,overflow=false;const digest=createHash('sha256');
      return{eof:false,add(bytes){size+=bytes.length;if(overflow)return;const part=Buffer.from(bytes.subarray(0,Math.max(0,cap-retained)));
        retained+=part.length;pieces.push(part);digest.update(part);if(size>cap){overflow=true;bad();}},
      facts(){return F({observedBytes:size,retainedBytes:retained,overflow,eof:this.eof,prefixSha256:digest.copy().digest('hex')});},
      privateBytes(){return Buffer.concat(pieces,retained);}};}
    return F({command,exit:exit.promise,snapshot:F(()=>F({role:selected.role,exited,closed,disconnected,exitCode,signal,fault,
      pending:pending.size,stdout:out.facts(),stderr:err.facts()})),
      operationTimings:F(()=>F([...operationTimings])),
      privateStreams:F(()=>F({role:selected.role,stdout:out.privateBytes(),stderr:err.privateBytes()}))});
  }
  const fund=F(function fund(){
    if(arguments.length!==0)fail();if(funding!==null)return funding;
    funding=launch(async()=>{
      phase='STARTING';payer=startChild(payerConfig);service=startChild(serviceConfig);
      const identity=await payer.command('INIT',plan);live();
      const challenge=await service.command('START',{payerAddress:identity.payerAddress,capabilityCommitment:identity.capabilityCommitment,
        payeeAddress:c.payeeAddress,totalCalls:total});live();
      const {deriveZenonUserSendWorkInput}=await import('../src/zenon/dynamic-plasma-user-send-work-input.js');live();
      const startNonce=reference(challenge.unsignedSubject,deriveZenonUserSendWorkInput);
      const url=new URL(challenge.origin);if(url.protocol!=='https:'||url.hostname!=='127.0.0.1'||url.origin!==challenge.origin)fail();
      await payer.command('OPEN',{appPort:Number(url.port),rpcPort:challenge.rpcPort,payeeAddress:c.payeeAddress,startNonce});live();
      const prepared=await payer.command('PREPARE',{plannerContext:{plannerContextVersion:7,readInput:challenge.plannerReadInput},
        challenge:challenge.challenge,originalRequest:{requestId:'capacity.'+hash(ctx.runId+'\0'+ctx.laneId).slice(0,32),
          contextId:'capacity.'+hash(ctx.runId+'\0'+ctx.laneId).slice(0,32),requestBodyBase64:'',
          contextBase64:Buffer.from(JSON.stringify({profile:'native-capacity',runId:ctx.runId,laneId:ctx.laneId})).toString('base64')}});live();
      await service.command('RETAIN',prepared.retainedOriginal);live();
      await payer.command('COMMIT',{});live();await payer.command('SUBMIT',{});live();
      grant=await service.command('ACTIVATE',{});live();
      if(grant.capabilityCommitment!==identity.capabilityCommitment||grant.totalUnits!==2*total)fail();
      await payer.command('BIND',{grantId:grant.grantId,capabilityCommitment:grant.capabilityCommitment});live();
      balance=await service.command('BALANCES',{});checkBalance(balance,0);phase='FUNDED';return F({status:'FUNDED',authority:'NONE'});
    });return funding;
  });
  const execute=F(function execute(input){
    if(arguments.length!==1)fail();const p=exact(input,['cohort','ordinal']);
    if(grant===null||phase!=='FUNDED')fail();const expected=warmupReserved<plan.warmupCallsPerLane?'WARMUP':'MEASUREMENT';
    const ordinal=expected==='WARMUP'?warmupReserved:measuredReserved,limit=expected==='WARMUP'?plan.warmupCallsPerLane:plan.measurementCallsPerLane;
    if(p.cohort!==expected||p.ordinal!==ordinal||Object.is(p.ordinal,-0)||ordinal>=limit
        ||expected==='MEASUREMENT'&&(windowOpenAck===null||windowStopEntered||measurementUnknown)
        ||expected==='WARMUP'&&windowOpenEntered)fail();
    return launch(async()=>{
      if(expected==='WARMUP')warmupReserved++;else measuredReserved++;
      const requestId=hash('native-capacity-original-v1\0'+ctx.runId+'\0'+ctx.laneId+'\0'+expected+'\0'+ordinal);
      await service.command('ARM',{cohort:expected,ordinal,requestId});live();
      await payer.command('EXECUTE',{cohort:expected,ordinal});live();const real=await service.command('FINISH',{});live();
      if(real.requestId!==requestId||real.state!=='SUCCEEDED')fail();checkBalance(real.balances,completed+1);completed++;balance=real.balances;
      return F({status:'SUCCEEDED',cohort:expected,ordinal,ledgerSource:'ACTUAL_SERVICE_STORE',authority:'NONE'});
    });
  });
  function checkBalance(actual,expected){if(actual.source!=='ACTUAL_SERVICE_STORE_READ_NOT_CLIENT_DECLARATION'||actual.totalUnits!==2*total
      ||actual.finished!==expected||actual.availableUnits!==2*(total-expected)||actual.heldUnits!==0||actual.consumedUnits!==2*expected)fail();}
  const readBalances=F(function readBalances(){if(arguments.length!==0)fail();return launch(async()=>{
    if(grant===null||freshBalanceReads>=3)fail();freshBalanceReads++;
    const actual=await service.command('BALANCES',{});live();checkBalance(actual,completed);balance=actual;return actual;});});
  const openMeasurementWindow=F(async function openMeasurementWindow(){
    if(arguments.length!==0)fail();live();
    if(grant===null||phase!=='FUNDED'||active!==null||windowOpenEntered||windowStopEntered
        ||completed!==plan.warmupCallsPerLane||freshBalanceReads!==2)fail();
    windowOpenEntered=true;
    try{windowOpenAck=WINDOW_DATA(await service.command('WINDOW_OPEN',{}),F({context:serviceWindowContext,phase:'OPEN',totalCalls:total}));
      return windowOpenAck;
    }catch{measurementUnknown=true;throw problem();}
  });
  const stopMeasurementWindow=F(async function stopMeasurementWindow(){
    if(arguments.length!==0||!windowOpenEntered||windowStopEntered||service===null)fail();
    windowStopEntered=true;
    try{const value=WINDOW_DATA(await service.command('WINDOW_STOP',{}),F({context:serviceWindowContext,phase:'STOPPED',totalCalls:total}));
      if(windowOpenAck!==null&&(value.startNs!==windowOpenAck.startNs||value.clockReads<=windowOpenAck.clockReads))fail();
      windowStopAck=value;return value;
    }catch{measurementUnknown=true;throw problem();}
  });
  const ledgerPage=F(function ledgerPage(input){if(arguments.length!==1)fail();return launch(async()=>{
    if(windowStopAck===null||measurementUnknown)fail();
    const page=await service.command('TIMINGS',input);live();if(page.clockDomain!=='SERVICE_CHILD_LOCAL'||page.unknown)fail();return page;});});
  const close=F(function close(){
    if(arguments.length!==0)fail();if(closing!==null)return closing;
    const cap=capabilities();closing=cap.promise;phase='CLOSING';const entered=active;
    const timer=setTimeout(()=>{hold();finish(false);},c.closeBudgetMs);let resolved=false;
    function finish(clean){if(resolved)return;resolved=true;clearTimeout(timer);
      finalClose=F({status:clean&&!held?'CLOSED':'UNKNOWN',held,activeOperation:active!==null,
        children:F([payer,service].filter(Boolean).map(ch=>ch.snapshot())),nativeQualified:false,authority:'NONE'});
      phase=finalClose.status==='CLOSED'?'CLOSED':'HELD';cap.resolve(finalClose);}
    (async()=>{try{
      const children=[payer,service].filter(Boolean),stops=[];
      for(const child of children)try{stops.push(child.command('CLOSE',{},true));}catch{stops.push(Promise.reject(problem()));}
      const receipts=await Promise.allSettled(stops);if(entered!==null)await entered.catch(()=>undefined);
      const releases=await Promise.allSettled(children.map((child,i)=>receipts[i].status==='fulfilled'?
        child.command('RELEASE_IPC',{},true).then(()=>child.exit):Promise.reject(problem())));
      if(receipts.some(v=>v.status!=='fulfilled')||releases.some(v=>v.status!=='fulfilled')||held||launchUnknown)fail();finish(true);
    }catch{hold();finish(false);}})();return closing;
  });
  function reference(subject,derive){
    const s=exact(subject,['subjectVersion','version','chainIdentifier','blockType','previousHash','height','momentumAcknowledged','address','toAddress','amount','tokenStandard','fromBlockHash','data']);
    if(s.subjectVersion!==1||referenceCandidates!==0)fail();const{subjectVersion,...block}=s;
    const work=derive({...block,hash:'0'.repeat(64),fusedPlasma:25409,difficulty:3000,nonce:'0000000000000000',publicKey:'',signature:''});
    const bytes=Buffer.alloc(40);Buffer.from(work.dataHash,'hex').copy(bytes,8);const target=(1n<<64n)-(1n<<64n)/3000n;
    for(let window=0n;window<8n;window++){referenceWindows++;for(let offset=0n;offset<4096n;offset++){
      if(++referenceCandidates>32768||referenceCandidates+4096+16384>65536)fail();bytes.writeBigUInt64LE(window*4096n+offset);
      if(createHash('sha3-256').update(bytes).digest().readBigUInt64LE(0)>=target){const start=Buffer.alloc(8);start.writeBigUInt64LE(window*4096n);return start.toString('hex');}
    }}fail(); // Never rekey, renew the range or silently choose another original.
  }
  function profile(value,role,entry,preloader){
    const p=exact(value,['path','sha256']);if(typeof p.sha256!=='string'||!/^[0-9a-f]{64}$/.test(p.sha256))fail();
    const raw=readOwned(p.path,524288,true);if(hash(raw)!==p.sha256)fail();const data=JSON.parse(raw.toString('utf8'));
    if(data.profileVersion!==4||data.profileKind!==(role==='PAYER'?'NATIVE_CAPACITY_CURRENT_PAYER_NODE24_V4':'NATIVE_CAPACITY_CURRENT_SERVICE_NODE24_V4')
        ||data.currentManifestSha256!=='8339b2a8e04e7e3c573b1c26d8162f1c821df91182738409693d188121a21893'
        ||data.runId!==ctx.runId||data.laneId!==ctx.laneId||data.entryURL!==pathToFileURL(entry).href||typeof data.rootPath!=='string'
        ||!Array.isArray(data.rootIdentity)||data.rootIdentity.length!==5
        ||data.sourceRowsSha256!==admission.childSourceRowsSha256)fail();
    const admitted=admission.childProfiles?.find(row=>row.path===p.path&&row.sha256===p.sha256&&row.role===role);
    if(!admitted||admitted.entryURL!==data.entryURL||admitted.preloaderURL!==pathToFileURL(preloader).href||admitted.rootPath!==data.rootPath
        ||JSON.stringify(admitted.rootIdentity)!==JSON.stringify(data.rootIdentity)||admitted.laneId!==ctx.laneId)fail();
    root(data.rootPath,data.rootIdentity);readOwned(preloader,131072);
    return F({role,root:data.rootPath,path:p.path,sha256:p.sha256,entry,preloader,sourceRowsSha256:data.sourceRowsSha256});
  }
  return F({fund,execute,readBalances,ledgerPage,openMeasurementWindow,stopMeasurementWindow,
    serviceWindowContext:F(function serviceWindowContextData(){if(arguments.length!==0)fail();return serviceWindowContext;}),
    measurementWindowSnapshot:F(function measurementWindowSnapshot(){if(arguments.length!==0)fail();return windowStopAck??windowOpenAck;}),
    close,inspect:F(()=>F({phase,held,completed,warmupReserved,measuredReserved,
    freshBalanceReads,windowOpenEntered,windowStopEntered,windowOpenAcknowledged:windowOpenAck!==null,
    windowStopAcknowledged:windowStopAck!==null,measurementUnknown,
    activeOperation:active!==null,referenceCandidates,referenceWindows,balancesObserved:balance!==null,launchAttempts,launchUnknown,
    historicalCloseStatus:finalClose?.status??'NOT_RETURNED',
    children:F([payer,service].filter(Boolean).map(ch=>ch.snapshot())),nativeQualified:false,capacityQualified:false,authority:'NONE'})),
    payerOperationTimings:F(()=>payer===null?F([]):payer.operationTimings()),
    privateStreams:F(()=>F([payer,service].filter(Boolean).map(ch=>ch.privateStreams())))});
}
function namespace(){const d=D(globalThis,NS);if(!d||!O(d,'value')||d.writable||d.configurable||d.enumerable||typeof d.value!=='function'||!Object.isFrozen(d.value))fail();
  const s=d.value();if(s.profileKind!=='NATIVE_CAPACITY_CURRENT_OFFERED_SUPERVISOR_NODE24_V2'
      ||s.applicationFiles!==160||s.packageFiles!==404||s.childApplicationFiles!==153||s.childPackageFiles!==404
      ||s.childSourceRowsSha256!=='db33115ac37137f5b0212cb33d748154b498ec1b15ca106dfb757575da692a6e'
      ||s.currentBaseApplication123Preserved!==true
      ||s.baselinePackages404Preserved!==true||s.sourceTransforms!==0||s.nativeBuiltinAliases!==0
      ||s.rootIndependenceVerifiedAtAdmission!==true||s.rootIdentityFields!==5
      ||!/^[0-9a-f]{64}$/.test(s.sourceRowsSha256||'')||!Array.isArray(s.childProfiles)||s.childProfiles.length>32
      ||s.nodeSha256!=='dbedff294bab84a0a86c04e15fbcbeb1c97ca10bef1b32b0634cd24b36f62100'
      ||process.version!=='v24.19.0'||process.platform!=='darwin'||process.arch!=='arm64')fail();return s;}
function capture(v,b={nodes:32768,bytes:131072},depth=0){if(--b.nodes<0||depth>16)fail();if(v===null||typeof v==='boolean')return v;
  if(typeof v==='string'){b.bytes-=Buffer.byteLength(v);if(b.bytes<0)fail();return v;}if(typeof v==='number'){if(!Number.isSafeInteger(v)||Object.is(v,-0))fail();return v;}
  if(typeof v!=='object'||utilTypes.isProxy(v))fail();const array=Array.isArray(v);if(P(v)!==(array?Array.prototype:Object.prototype)||K(v).length>1024)fail();const out=array?[]:{};
  for(const k of K(v)){if(array&&k==='length')continue;if(typeof k!=='string')fail();b.bytes-=Buffer.byteLength(k);if(b.bytes<0)fail();const d=D(v,k);if(!d||!O(d,'value')||!d.enumerable)fail();
    Object.defineProperty(out,k,{value:capture(d.value,b,depth+1),enumerable:true});}if(array&&out.length!==v.length)fail();return F(out);}
function exact(v,names){if(v===null||typeof v!=='object'||utilTypes.isProxy(v)||P(v)!==Object.prototype||K(v).length!==names.length)fail();const out={};
  for(const name of names){const d=D(v,name);if(!d||!O(d,'value')||!d.enumerable)fail();Object.defineProperty(out,name,{value:d.value,enumerable:true});}return out;}
function readOwned(path,maximum,privateFile=false){if(typeof path!=='string'||!path.startsWith('/')||resolve(path)!==path)fail();
  for(let at=path;;at=dirname(at)){if(lstatSync(at).isSymbolicLink())fail();if(dirname(at)===at)break;}const s=lstatSync(path,{bigint:true});
  if(!s.isFile()||s.nlink!==1n||s.uid!==BigInt(process.getuid())||s.size<1n||s.size>BigInt(maximum)
      ||privateFile&&![0o400n,0o600n].includes(s.mode&0o7777n))fail();
  const id=v=>[v.dev,v.ino,v.uid,v.gid,v.mode,v.nlink,v.size,v.mtimeNs,v.ctimeNs].map(String).join(':'),before=id(s),fd=openSync(path,C.O_RDONLY|C.O_NOFOLLOW);
  try{if(id(fstatSync(fd,{bigint:true}))!==before)fail();const out=Buffer.alloc(Number(s.size)+1);let used=0;while(used<out.length){const n=readSync(fd,out,used,out.length-used,null);if(!n)break;used+=n;}
    if(used!==Number(s.size)||id(fstatSync(fd,{bigint:true}))!==before||id(lstatSync(path,{bigint:true}))!==before)fail();return out.subarray(0,used);}finally{closeSync(fd);}}
function root(path,expected){if(typeof path!=='string'||resolve(path)!==path||!path.startsWith('/'))fail();const s=lstatSync(path,{bigint:true});
  for(let at=path;;at=dirname(at)){if(lstatSync(at).isSymbolicLink())fail();if(dirname(at)===at)break;}
  if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==BigInt(process.getuid())||(s.mode&0o7777n)!==0o700n
      ||!Array.isArray(expected)||expected.length!==5
      ||DIRECTORY_ID({dev:s.dev,ino:s.ino,uid:s.uid,gid:s.gid,mode:s.mode},BigInt(process.getuid())).some((v,i)=>v!==expected[i]))fail();}
function integer(n,a,b){if(!Number.isSafeInteger(n)||Object.is(n,-0)||n<a||n>b)fail();}
function hash(v){return createHash('sha256').update(v).digest('hex');}
function problem(){const e=new TypeError('NATIVE_CAPACITY_CURRENT_OFFERED_PAIR_V2_UNAVAILABLE');Object.defineProperty(e,'stack',{value:'TypeError: NATIVE_CAPACITY_CURRENT_OFFERED_PAIR_V2_UNAVAILABLE'});return F(e);}
function fail(){throw problem();}
