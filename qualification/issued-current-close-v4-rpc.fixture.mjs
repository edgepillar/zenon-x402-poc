/*
 * EFFECTFUL QUALIFICATION SUPPORT, SOURCE/SYNTAX ONLY. Do not import or call
 * under a DATA-only selection. The factory opens an actual IPv4 TLS listener.
 * It serves only bounded declared account/DP RPC DATA for ONE original issued
 * funding challenge. It has NO funding route, BOUND response, SDK, SQL, key
 * generation, signer, work search, original-payment store or application proxy.
 * The future approved harness owns its task/root, TLS material, actual issued
 * application, wallet/capabilities, original pins and all other lifetimes.
 * This module never creates/adopts/cleans a storage root or writes a file.
 */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:https';
import { types as utilTypes } from 'node:util';
import { canonicalJson, paymentIntentDigest } from '../src/canonical.js';
import { createIssuedFundingPostSdkResourceBinding } from '../src/x402-issued-funding-post-sdk-resource.js';
import { observeServiceCreditOperationDrain } from '../src/service-credit-bounded-operation-drain.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,P=Object.getPrototypeOf,K=Reflect.ownKeys,O=Object.hasOwn;
const PROXY=utilTypes.isProxy,SHARED=utilTypes.isSharedArrayBuffer;
const TYPED=P(Uint8Array.prototype),STORAGE=D(TYPED,'buffer').get,LENGTH=D(TYPED,'byteLength').get;
const DP_METHODS=F(['ledger.getFrontierMomentum','ledger.getMomentumsByHeight','embedded.spork.getAll',
  'embedded.plasma.getVariables','embedded.plasma.getRequiredPoWForAccountBlock','ledger.getFrontierMomentum']);
const ACCOUNT_METHODS=F(['ledger.getFrontierAccountBlock','ledger.getAccountInfoByAddress','ledger.getFrontierAccountBlock']);
const PATHS=F(['/rpc/first','/rpc/second','/rpc/account']);
const MAX=F({tcpConnections:174,tlsConnections:174,requestStarts:174,firstRequests:78,secondRequests:78,
  accountRequests:18,concurrentConnections:3,concurrentRequests:1,bodyBytes:1024,responseBytes:16384,
  headerBytes:8192,headerPairs:8,requestDeadlineMs:2000,handshakeDeadlineMs:1000,closeBudgetMs:1000,tlsMaterialBytes:16384});
const ZERO='0'.repeat(64),H='33'.repeat(32),PREVIOUS='66'.repeat(32),ASSET='zts1znnxxxxxxxxxxxxx9z4ulx';
const CHAIN=F({version:1,chainIdentifier:'73404',genesisMomentumHash:'11'.repeat(32)});
const SPORKS=F({dynamicPlasmaId:'02'.repeat(32),libp2pId:'01'.repeat(32)});
const ADDRESS=/^z1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/;
let moduleSlot=null,constructionAttempts=0;

export async function createNativeIssuedFundingPostRpcPeerFixture(options) {
  assert.equal(arguments.length,1);
  assert.equal(process.env.X402_ISSUED_CLOSE_NATIVE_SELECTION,'current-native-issued-close-source-v4');
  assert.equal(process.version,'v24.19.0');assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
  assert.equal(moduleSlot,null);assert.equal(constructionAttempts,0);
  const c=exact(options,['tlsMaterial','payerAddress','payeeAddress']),tls=exact(c.tlsMaterial,['key','cert']);
  assert.equal(typeof c.payerAddress,'string');assert.match(c.payerAddress,ADDRESS);
  assert.equal(typeof c.payeeAddress,'string');assert.match(c.payeeAddress,ADDRESS);assert.notEqual(c.payerAddress,c.payeeAddress);
  let key=null,certificate=null;
  try{key=copyBytes(tls.key);certificate=copyBytes(tls.cert);}catch{if(key!==null)key.fill(0);throw failure('TLS_DATA_REFUSED');}
  const payer=c.payerAddress,payee=c.payeeAddress,rawSockets=new Set(),tlsSockets=new Set(),requests=new Set();
  const positions=[0,0],cycleStages=[null,null],observedAges=new Set();
  const counts={tcpConnections:0,tlsConnections:0,requestStarts:0,rpcResponses:0,accountCalls:0,bodyBytes:0,
    challengeBindAttempts:0,nativeCloseCalls:0,nativeCloseCallbacks:0,nativeCloseEvents:0,
    refusalSocketStops:0,requestTimerStarts:0,requestTimerCancels:0,errors:0,bufferReleaseCalls:0};
  let server=null,port=null,issued=null,subject=null,readInput=null,stage=0;
  let held=false,firstFailure=null,closing=false,closed=false,closePromise=null,nativeCloseReturned=false;
  let nativeCloseObserved=false,listenEntered=false,listeningObserved=false,startupReject=null,startupTimer=null;
  const slot={phase:'CONSTRUCTING',server:null,key,certificate};moduleSlot=slot;constructionAttempts++;
  function markHeld(code){held=true;slot.phase='HELD';counts.errors++;if(firstFailure===null)firstFailure=code;}
  function snapshot(){return F({nativeIssuedRpcPeerFixtureVersion:1,phase:held?'HELD':closed?'CLOSED':closing?'CLOSING':'OPEN',
    held,firstFailure,listenEntered,listeningObserved,startupTimerActive:startupTimer!==null,challengeBound:issued!==null,
    activeRawSockets:rawSockets.size,activeTlsSockets:tlsSockets.size,activeRequests:requests.size,
    firstRequests:positions[0],secondRequests:positions[1],accountStage:stage,
    observedMomentumAges:F([...observedAges].sort()),counts:F({...counts}),bounds:MAX,
    fundingRoute:false,cannedBoundResponse:false,declaredChainData:true,chainAuthenticated:false,
    nativePhysicalDrain:'NOT_QUALIFIED',productionQualified:false,authority:'NONE'});}
  function live(){assert.ok(!held&&!closing&&!closed&&issued!==null);}
  function stopOnce(){
    if(closePromise!==null)return closePromise;
    let resolveClose,rejectClose;
    closePromise=new Promise((yes,no)=>{resolveClose=yes;rejectClose=no;});
    closePromise.catch(()=>undefined); // Claim the cached result BEFORE any native callback.
    closing=true;if(!held)slot.phase='CLOSING';
    counts.nativeCloseCalls++;
    try{
      assert.ok(server!==null);server.close(error=>{
        counts.nativeCloseCallbacks++;if(error!==undefined&&error!==null)markHeld('NATIVE_CLOSE_CALLBACK_ERROR');
        if(counts.nativeCloseCallbacks!==1)markHeld('DUPLICATE_NATIVE_CLOSE_CALLBACK');
        nativeCloseReturned=true;
      });
    }catch{markHeld('NATIVE_CLOSE_CALL_UNKNOWN');}
    (async()=>{
      try{
        const clean=await observeServiceCreditOperationDrain(F(function probe(){
          if(held)return 'UNKNOWN';
          return nativeCloseReturned&&nativeCloseObserved&&server.listening===false&&startupTimer===null
            &&rawSockets.size===0&&tlsSockets.size===0&&requests.size===0?'DRAINED':'BUSY';
        }),MAX.closeBudgetMs);
        if(!clean)throw failure('NATIVE_CLOSE_UNKNOWN');
        counts.bufferReleaseCalls++;key.fill(0);certificate.fill(0);key=null;certificate=null;
        slot.key=null;slot.certificate=null;closed=true;slot.phase='CLOSED';resolveClose(undefined);
      }catch{markHeld('NATIVE_CLOSE_UNKNOWN');rejectClose(failure('NATIVE_CLOSE_UNKNOWN'));}
    })(); // Every outcome is caught; never reset HELD or retry close.
    return closePromise;
  }
  function refuseSocket(socket,code){
    markHeld(code);
    try{counts.refusalSocketStops++;socket.destroy();}catch{markHeld('REFUSAL_STOP_UNKNOWN');}
    stopOnce(); // Stop accepting once; native uncertainty remains HELD even if sockets later close.
  }
  function answerRpc(path,packet){
    live();assert.deepEqual(Object.keys(packet).sort(),['id','jsonrpc','method','params']);
    assert.equal(packet.jsonrpc,'2.0');assert.ok(Number.isSafeInteger(packet.id));assert.ok(Array.isArray(packet.params));
    if(path==='/rpc/account'){
      const position=counts.accountCalls++;assert.ok(position<MAX.accountRequests);assert.equal(packet.id,position+1);
      assert.equal(packet.method,ACCOUNT_METHODS[position%3]);assert.deepEqual(packet.params,[payer]);
      stage=Math.floor(position/3)+1;
      return packet.method==='ledger.getAccountInfoByAddress'
        ?{address:payer,accountHeight:6,balanceInfoMap:{[ASSET]:{token:{tokenStandard:ASSET},balance:'5'}}}:frontierAccount();
    }
    const endpoint=path==='/rpc/first'?0:1,position=positions[endpoint]++,index=position%6;
    assert.ok(position<(endpoint===0?MAX.firstRequests:MAX.secondRequests));assert.equal(packet.id,position+1);
    assert.equal(packet.method,DP_METHODS[index]);assert.ok(stage>=1&&stage<=6);
    if(index===0)cycleStages[endpoint]=stage;assert.equal(cycleStages[endpoint],stage);
    const params=index===1?[2,1]:index===2?[0,128]:index===4?[{address:payer,blockType:2,toAddress:payee,data:subject.data}]:[];
    assert.deepEqual(packet.params,params);
    const age=stage<=2?0:2,price=age===0?1000:1210;observedAges.add(age);
    const frontier={version:2,chainIdentifier:73404,hash:(age===0?'33':'55').repeat(32),height:100+age,
      nextFusionPrice:price,nextWorkPrice:price};
    if(index===0||index===5)return momentum(frontier,payer);
    if(index===1)return {count:200,list:[momentum({...frontier,version:1,height:2,hash:'22'.repeat(32),nextFusionPrice:0,nextWorkPrice:0},payer)]};
    if(index===2)return {count:2,list:[
      {id:SPORKS.libp2pId,name:'libp2p',description:'Declared synthetic.',activated:false,enforcementHeight:0},
      {id:SPORKS.dynamicPlasmaId,name:'dynamic-plasma',description:'Declared synthetic.',activated:true,enforcementHeight:10}]};
    if(index===3)return {MaxBasePlasmaInMomentum:4200000,FusedPlasmaTarget:1050000,PowPlasmaTarget:1050000,
      MaxPriceChangePercent:10,PriceChangeDenominator:20};
    const required=Math.ceil(21000*price/1000),available=25409;
    return {availablePlasma:available,basePlasma:21000,requiredFusedPlasma:required,
      requiredDifficulty:available>=required?0:Math.ceil((21000-Math.floor(available*1000/price))*price/1000)*1500};
  }
  function frontierAccount(){return {version:1,chainIdentifier:73404,blockType:3,hash:PREVIOUS,previousHash:'77'.repeat(32),
    height:6,momentumAcknowledged:{hash:H,height:100},address:payer,toAddress:payee,amount:'5',tokenStandard:ASSET,
    fromBlockHash:'88'.repeat(32),descendantBlocks:[],data:null,fusedPlasma:0,difficulty:0,nonce:'0000000000000000',
    basePlasma:21000,usedPlasma:21000,changesHash:ZERO,publicKey:'',signature:'',token:null,confirmationDetail:null,pairedAccountBlock:null};}
  function onRequest(request,response){
    let timer=null,finished=false,size=0;const chunks=[];
    function complete(){
      if(finished)return;finished=true;requests.delete(request);
      if(timer!==null){clearTimeout(timer);counts.requestTimerCancels++;timer=null;}
    }
    function refuse(code){complete();refuseSocket(request.socket,code);}
    request.on('error',()=>refuse('RPC_REQUEST_ERROR'));request.on('aborted',()=>refuse('RPC_REQUEST_ABORTED'));
    response.on('error',()=>refuse('RPC_RESPONSE_ERROR'));
    try{
      live();assert.ok(++counts.requestStarts<=MAX.requestStarts);assert.ok(requests.size<MAX.concurrentRequests);
      assert.equal(request.method,'POST');assert.ok(PATHS.includes(request.url));
      assert.ok(tlsSockets.has(request.socket));assert.equal(request.socket.remoteAddress,'127.0.0.1');
      assert.equal(request.headers.host,'localhost:'+port);assert.equal(request.headers.connection,'close');
      assert.equal(request.headers['content-type'],'application/json');assert.equal(request.headers.accept,'application/json');
      assert.equal(request.headers['transfer-encoding'],undefined);assert.equal(request.headers['payment-signature'],undefined);
      assert.ok(request.rawHeaders.length%2===0&&request.rawHeaders.length/2<=MAX.headerPairs);
      const seen=new Set();for(let i=0;i<request.rawHeaders.length;i+=2){
        const name=request.rawHeaders[i].toLowerCase();assert.ok(!seen.has(name));seen.add(name);
        assert.ok(['host','content-type','accept','content-length','connection'].includes(name));
      }
      assert.equal(seen.size,5);assert.equal(typeof request.headers['content-length'],'string');
      assert.match(request.headers['content-length'],/^[1-9][0-9]{0,3}$/);
      const expected=Number(request.headers['content-length']);assert.ok(expected<=MAX.bodyBytes);
      requests.add(request);counts.requestTimerStarts++;
      timer=setTimeout(()=>refuse('RPC_REQUEST_DEADLINE'),MAX.requestDeadlineMs);
      response.once('close',()=>{if(!finished)refuse('RPC_RESPONSE_CLOSE_BEFORE_FINISH');});
      response.once('finish',complete);
      request.on('data',chunk=>{
        try{live();size+=chunk.length;assert.ok(size<=expected&&size<=MAX.bodyBytes);chunks.push(Buffer.from(chunk));}
        catch{refuse('RPC_REQUEST_BODY_REFUSED');}
      });
      request.once('end',()=>{
        try{
          live();assert.equal(finished,false);assert.equal(request.complete,true);assert.equal(size,expected);
          const bytes=Buffer.concat(chunks,size);for(const byte of bytes)assert.ok(byte>=32&&byte<=126);
          counts.bodyBytes+=bytes.length;
          const packet=JSON.parse(bytes.toString('ascii')),result=answerRpc(request.url,packet);
          const text=JSON.stringify({jsonrpc:'2.0',id:packet.id,result});
          assert.ok(Buffer.byteLength(text)<=MAX.responseBytes);counts.rpcResponses++;
          response.sendDate=false;response.writeHead(200,{'content-type':'application/json','content-length':String(Buffer.byteLength(text)),
            'cache-control':'no-store',connection:'close'});response.end(text);
        }catch{refuse('RPC_SEQUENCE_OR_RESPONSE_REFUSED');}
      });
    }catch{refuse('RPC_HTTP_ADMISSION_REFUSED');}
  }
  try{
    server=createServer({key,cert:certificate,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',ALPNProtocols:['http/1.1'],
      handshakeTimeout:MAX.handshakeDeadlineMs,maxHeaderSize:MAX.headerBytes,requireHostHeader:true,
      joinDuplicateHeaders:false,insecureHTTPParser:false,rejectNonStandardBodyWrites:true},onRequest);slot.server=server;
    server.maxConnections=MAX.concurrentConnections;server.maxHeadersCount=MAX.headerPairs;server.maxRequestsPerSocket=1;
    server.requestTimeout=MAX.requestDeadlineMs;server.headersTimeout=MAX.handshakeDeadlineMs;server.keepAliveTimeout=1;
    server.on('error',()=>{markHeld('NATIVE_RPC_SERVER_ERROR');if(startupReject!==null)startupReject(failure('LISTEN_UNKNOWN'));stopOnce();});
    server.on('close',()=>{counts.nativeCloseEvents++;nativeCloseObserved=true;if(counts.nativeCloseEvents!==1)markHeld('DUPLICATE_NATIVE_CLOSE_EVENT');});
    server.on('connection',socket=>{
      rawSockets.add(socket);socket.once('close',()=>rawSockets.delete(socket));
      socket.on('error',()=>{markHeld('NATIVE_RAW_SOCKET_ERROR');stopOnce();});
      if(++counts.tcpConnections>MAX.tcpConnections||socket.remoteAddress!=='127.0.0.1')refuseSocket(socket,'TCP_BOUND_OR_PEER_REFUSED');
    });
    server.on('secureConnection',socket=>{
      tlsSockets.add(socket);socket.once('close',()=>tlsSockets.delete(socket));
      socket.on('error',()=>{markHeld('NATIVE_TLS_SOCKET_ERROR');stopOnce();});
      if(++counts.tlsConnections>MAX.tlsConnections||socket.remoteAddress!=='127.0.0.1'
        ||socket.getProtocol()!=='TLSv1.3'||socket.alpnProtocol!=='http/1.1'||socket.isSessionReused())refuseSocket(socket,'TLS_BOUND_OR_PEER_REFUSED');
    });
    server.on('clientError',(_error,socket)=>refuseSocket(socket,'NATIVE_HTTP_PARSE_ERROR'));
    server.on('tlsClientError',(_error,socket)=>refuseSocket(socket,'NATIVE_TLS_CLIENT_ERROR'));
    for(const name of ['checkContinue','checkExpectation','upgrade','connect'])
      server.on(name,(request)=>refuseSocket(request.socket,'NATIVE_HTTP_EXTRA_MODE_REFUSED'));
    server.on('drop',()=>{markHeld('NATIVE_CONNECTION_DROP');stopOnce();});
    await new Promise((resolve,reject)=>{
      function cancelStartupTimer(){if(startupTimer!==null){clearTimeout(startupTimer);startupTimer=null;}}
      startupReject=reject;startupTimer=setTimeout(()=>{
        startupTimer=null;markHeld('LISTEN_DEADLINE');reject(failure('LISTEN_UNKNOWN'));stopOnce();
      },1000);
      server.once('listening',()=>{cancelStartupTimer();listeningObserved=true;startupReject=null;resolve();});
      server.once('error',()=>{cancelStartupTimer();startupReject=null;});
      try{listenEntered=true;server.listen({host:'127.0.0.1',port:0,exclusive:true});}
      catch{cancelStartupTimer();startupReject=null;reject(failure('LISTEN_UNKNOWN'));}
    });
    assert.equal(held,false);const at=server.address();assert.ok(at!==null&&typeof at==='object');
    assert.equal(at.address,'127.0.0.1');assert.equal(at.family,'IPv4');
    assert.ok(Number.isSafeInteger(at.port)&&at.port>=1024&&at.port<=65535);port=at.port;slot.phase='OPEN';
  }catch{markHeld('CONSTRUCTION_OR_LISTEN_UNKNOWN');if(server!==null)stopOnce();throw failure('CONSTRUCTION_OR_LISTEN_UNKNOWN');}
  function bindIssuedChallenge(input){
    assert.equal(arguments.length,1);assert.ok(!held&&!closing&&!closed&&issued===null);
    assert.equal(counts.challengeBindAttempts++,0);
    try{
      const c=exact(input,['resourceUrl','frame']);assert.equal(typeof c.resourceUrl,'string');
      const url=new URL(c.resourceUrl);assert.equal(url.protocol,'https:');assert.equal(url.hostname,'127.0.0.1');
      assert.equal(url.href,c.resourceUrl);
      assert.equal(url.pathname,'/funding');assert.equal(url.search,'');assert.equal(url.hash,'');assert.equal(url.username,'');assert.equal(url.password,'');
      assert.ok(Number.isSafeInteger(Number(url.port))&&Number(url.port)>=1024&&Number(url.port)<=65535);
      const selection=createIssuedFundingPostSdkResourceBinding(c.frame,c.resourceUrl).selection();
      const required=selection.paymentRequired,accepted=selection.requirement;
      assert.equal(accepted.network,'zenon:testnet');assert.equal(accepted.scheme,'exact');assert.equal(accepted.asset,ASSET);
      assert.equal(accepted.amount,'5');assert.equal(accepted.payTo,payee);assert.equal(accepted.maxTimeoutSeconds,60);
      assert.equal(accepted.extra.paymentFlow,'upfront');assert.equal(canonicalJson(accepted.extra.zenonChain),canonicalJson(CHAIN));
      subject=F({subjectVersion:1,version:1,chainIdentifier:73404,blockType:2,previousHash:PREVIOUS,height:7,
        momentumAcknowledged:F({hash:H,height:100}),address:payer,toAddress:payee,amount:'5',tokenStandard:ASSET,fromBlockHash:ZERO,
        data:Buffer.from(paymentIntentDigest(required,accepted),'hex').toString('base64')});
      readInput=F({observedUserSendReadVersion:3,phase:'UNSIGNED',paymentRequired:required,accepted,payerAddress:payer,compiledSporkIds:SPORKS,
        policy:F({policyVersion:1,maxPriceChangePercent:10,maxMomentumAdvances:2,maxFusedPlasma:25409,maxDifficulty:38115000}),
        runtimeContextDigest:'sha256:'+'b'.repeat(64)});
      issued=selection;
      return F({plannerReadInput:readInput,unsignedSubject:subject,challenge:F({status:'PAYMENT_REQUIRED',resourceUrl:c.resourceUrl,
        paymentRequiredHeader:selection.frame.paymentRequiredHeader,paymentRequired:required}),
        chainObservations:'DECLARED_NOT_AUTHENTICATED',authority:'NONE'});
    }catch{markHeld('ISSUED_CHALLENGE_BIND_REFUSED');stopOnce();throw failure('ISSUED_CHALLENGE_BIND_REFUSED');}
  }
  function readSessionOptions(){
    assert.equal(arguments.length,0);assert.ok(!held&&!closing&&!closed);
    const endpoint=path=>F({route:F({hostname:'localhost',path,ipv4Address:'127.0.0.1'}),timeoutMs:2000,closeGraceMs:500});
    return F({endpoints:F([endpoint('/rpc/first'),endpoint('/rpc/second')]),accountEndpoint:endpoint('/rpc/account')});
  }
  return F({port,bindIssuedChallenge:F(bindIssuedChallenge),readSessionOptions:F(readSessionOptions),
    inspect:F(function inspect(){assert.equal(arguments.length,0);return snapshot();}),
    close:F(function close(){assert.equal(arguments.length,0);return stopOnce();})});
}
function momentum(frontier,payer){return {...frontier,previousHash:'11'.repeat(32),timestamp:1234,data:'',content:[],
  changesHash:'66'.repeat(32),publicKey:Buffer.alloc(32,6).toString('base64'),signature:Buffer.alloc(64,8).toString('base64'),
  producer:payer};} // Fixed signature-shaped DATA, not a generated or authenticated signature.
function exact(value,fields){
  assert.ok(value!==null&&typeof value==='object'&&!PROXY(value)&&P(value)===Object.prototype&&Object.isFrozen(value));
  assert.equal(K(value).length,fields.length);const out={};for(const name of fields){
    const d=D(value,name);assert.ok(d&&O(d,'value')&&d.enumerable);Object.defineProperty(out,name,{value:d.value,enumerable:true});
  }return F(out);
}
function copyBytes(value){
  assert.ok(value!==null&&typeof value==='object'&&!PROXY(value)&&Buffer.isBuffer(value)&&P(value)===Buffer.prototype);
  const length=Reflect.apply(LENGTH,value,[]);
  assert.ok(!SHARED(Reflect.apply(STORAGE,value,[])));assert.ok(length>0&&length<=MAX.tlsMaterialBytes&&K(value).length===length);
  return Buffer.from(value);
}
function failure(kind){const code='NATIVE_ISSUED_RPC_FIXTURE_'+kind,error=new TypeError(code);
  Object.defineProperty(error,'code',{value:code,enumerable:true});Object.defineProperty(error,'stack',{value:'TypeError: '+code});return F(error);}
