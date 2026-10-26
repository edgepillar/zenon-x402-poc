// Actual SDK105 owner, signed-original DATA assembly and handoff-input codec.
// Declared native-client capabilities; no SDK, SQL, TLS, keys or signatures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createSdk105PreparedHashWalletOwner as WALLET } from '../src/zenon/sdk105-prepared-hash-wallet-owner.js';
import { createSdk105FundingServiceLifecycle as JOIN,captureSdk105FundingServiceConfiguration as CAPTURE }
  from '../src/zenon/sdk105-funding-service-lifecycle.js';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as ASSEMBLE } from '../src/zenon/dynamic-plasma-original-funding-data.js';
import { computeZenonUnsignedUserSendHash } from '../src/zenon/transaction-planner.js';

assert.equal(process.version,'v24.19.0');
assert.equal(process.env.X402_SDK105_SERVICE_LIFETIME,'builtin-only-original-key-close-handoff');
const F=Object.freeze,tick=()=>new Promise(resolve=>setImmediate(resolve));
const copy=value=>structuredClone(value);
function gate(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function fixture(mode={}){
  const base=retainedOriginalInputFixture(),original=base.candidate.originalUnsignedBlock;
  const f={base,original,publicBytes:Buffer.from(original.publicKey,'base64'),signature:Buffer.alloc(64,42),
    signs:0,clears:0,prepares:0,commits:0,submits:0,handoffs:0,services:0,closes:0,trace:[],childHeld:false,childLifecycle:'OPEN'};
  f.keyPair={getPublicKey(){return f.publicBytes;},getAddress(){return original.address;},
    sign(bytes){f.signs++;assert.equal(bytes.toString('hex'),original.hash);f.trace.push('sign');
      return f.onSign?f.onSign():f.signature;},
    clear(){f.clears++;f.trace.push('clear');if(f.onClear)return f.onClear();f.publicBytes.fill(0);}};
  f.wallet=WALLET({keyPair:f.keyPair,expectedAddress:original.address,expectedPublicKey:original.publicKey});
  f.child=F({
    prepareOriginalFunding:F(async function prepare(input){
      f.prepares++;f.input=input;const signed=await f.wallet.sign(original);
      f.packet=ASSEMBLE(base.input,{originalUnsignedBlock:original,accountBlock:signed},base.resourceUrl);
      if(f.prepareGate)await f.prepareGate.promise;
      return F({phase:'AWAITING_INDEPENDENT_PINS',packet:f.packet});
    }),
    commitOriginalFunding:F(function commit(input){f.commits++;f.commitInput=input;
      return Promise.resolve(Object.hasOwn(mode,'commitResult')?mode.commitResult:F({phase:'COMMITTED_DECLARED'}));}),
    submitOriginalFunding:F(function submit(input){f.submits++;f.submitInput=input;
      return Promise.resolve(F({phase:mode.unbound?'SUBMISSION_OUTCOME_UNKNOWN':'FUNDING_INTAKE_BOUND',fundingIntakeStatus:mode.unbound?'UNKNOWN':'BOUND'}));}),
    handoffToService:F(function handoff(input){
      f.handoffs++;f.handoffInput=input;f.trace.push('handoff');
      if(f.onHandoff)return f.onHandoff(input);
      return Promise.resolve(F({phase:'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED',authority:'NONE'}));
    }),
    submitOriginal:F(function service(input){f.services++;f.serviceInput=input;
      if(f.onService)return f.onService(input);
      return Promise.resolve(Object.hasOwn(mode,'serviceResult')?mode.serviceResult:undefined);}),
    inspect:F(function inspect(){return F({lifecycle:f.childLifecycle,held:f.childHeld,declared:true});}),
    close:F(function close(){f.closes++;f.trace.push('client-close');
      if(f.onClose)return f.onClose();f.childLifecycle='CLOSED';return Promise.resolve(undefined);}),
  });
  f.owner=JOIN({client:f.child,walletOwner:f.wallet,fundingResourceUrl:base.resourceUrl});
  f.request=()=>({originalPayment:{resourceUrl:base.resourceUrl,serializedCheckpoint:f.packet.serializedCheckpoint,
    expectedPins:copy(f.packet.expectedPins)},selectedGrantId:'grant.sdk105.1',paymentRequiredHeader:base.input.challenge.paymentRequiredHeader});
  f.ready=async()=>{
    const prepared=await f.owner.prepareOriginalFunding(base.input);assert.equal(prepared.packet,f.packet);
    await f.owner.commitOriginalFunding({expectedPins:copy(f.packet.expectedPins)});
    await f.owner.submitOriginalFunding({expectedPins:copy(f.packet.expectedPins)});return f;
  };
  return f;
}
test('real signed DATA and independent original pins reach handoff only after key clear',async()=>{
  const f=fixture();assert.equal(f.signs+f.clears+f.prepares+f.closes,0);await f.ready();
  const original=f.packet.serializedCheckpoint,request=f.request();const result=await f.owner.handoffToService(request);
  assert.equal(result.phase,'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED');assert.deepEqual(f.trace,['sign','clear','handoff']);
  assert.equal(f.handoffInput.originalPayment.serializedCheckpoint,original);
  assert.deepEqual(f.handoffInput.originalPayment.expectedPins,request.originalPayment.expectedPins);
  assert.equal(f.handoffInput.paymentRequiredHeader,request.paymentRequiredHeader);
  assert.equal(f.handoffInput.selectedGrantId,'grant.sdk105.1');assert.equal(f.signs,1);
  await f.owner.close();assert.equal(f.clears,1);assert.equal(f.closes,1);assert.equal(f.owner.inspect().lifecycle,'CLOSED');
});
test('service operations are unavailable before explicit key-closed handoff',async()=>{
  const f=fixture();await f.ready();await assert.rejects(f.owner.submitOriginal({proof:'declared'}));assert.equal(f.services,0);
  await f.owner.handoffToService(f.request());const input=F({proof:'declared'});
  const r=await f.owner.submitOriginal(input);assert.equal(r,undefined);assert.equal(f.serviceInput,input);await f.owner.close();
});
test('wrong independent pins refuse without consuming key close or handoff',async()=>{
  const f=fixture();await f.ready();const bad=f.request();bad.originalPayment.expectedPins.binding.paymentHash='e'.repeat(64);
  await assert.rejects(f.owner.handoffToService(bad));assert.equal(f.clears+f.handoffs,0);assert.equal(f.owner.inspect().handoffAttempts,0);
  await f.owner.handoffToService(f.request());assert.equal(f.handoffs,1);await f.owner.close();
});
test('changed original bytes challenge or invalid grant refuse before cleanup',async()=>{
  const f=fixture();await f.ready();
  for(const change of [r=>r.originalPayment.serializedCheckpoint+=' ',r=>r.paymentRequiredHeader+='A',r=>r.selectedGrantId='bad grant']){
    const request=f.request();change(request);await assert.rejects(f.owner.handoffToService(request));
  }
  assert.equal(f.clears+f.handoffs,0);await f.owner.close();
});
test('unknown funding intake cannot close key as service admission',async()=>{
  const f=fixture({unbound:true});await f.ready();await assert.rejects(f.owner.handoffToService(f.request()));
  assert.equal(f.clears+f.handoffs,0);await f.owner.close();assert.equal(f.clears,1);
});
test('an unknown clear prevents service acquisition but cannot suppress client stop',async()=>{
  const f=fixture();await f.ready();f.onClear=()=>{throw Error('PRIVATE_CLEAR');};
  await assert.rejects(f.owner.handoffToService(f.request()));assert.equal(f.handoffs,0);
  const close=f.owner.close();await assert.rejects(close);await tick();assert.equal(f.closes,1);assert.equal(f.clears,1);
  assert.equal(f.owner.close(),close);assert.equal(f.owner.inspect().held,true);
});
test('synchronous client-close failure still requests the independent key stop once',async()=>{
  const f=fixture();f.onClose=()=>{throw Error('PRIVATE_CLOSE');};
  const close=f.owner.close();await assert.rejects(close);assert.equal(f.clears,1);assert.equal(f.closes,1);
  assert.equal(f.owner.close(),close);assert.equal(f.owner.inspect().historicalClose,'REJECTED');
});
test('outer close during signing retains signed DATA and refuses preparation escape',async()=>{
  const f=fixture();let close;f.onSign=()=>{close=f.owner.close();assert.equal(f.clears,0);return f.signature;};
  await assert.rejects(f.owner.prepareOriginalFunding(f.base.input));await close;
  assert.deepEqual(f.trace,['sign','client-close','clear']);assert.equal(f.wallet.inspect().wallet.signedOriginal.hash,f.original.hash);
  assert.equal(f.clears,1);assert.equal(f.handoffs,0);assert.equal(f.signs,1);
});
test('close while preparation is pending waits for the original child operation',async()=>{
  const f=fixture();f.prepareGate=gate();const operation=f.owner.prepareOriginalFunding(f.base.input);
  await tick();const close=f.owner.close();let done=false;close.then(()=>{done=true;});
  await tick();assert.equal(done,false);assert.equal(f.closes,1);assert.equal(f.clears,1);
  f.prepareGate.resolve();await assert.rejects(operation);await close;assert.equal(f.owner.inspect().lifecycle,'CLOSED');
});
test('clear reentry closes the parent before any child service acquisition',async()=>{
  const f=fixture();await f.ready();let close;
  f.onClear=()=>{close=f.owner.close();};
  await assert.rejects(f.owner.handoffToService(f.request()));await close;
  assert.equal(f.handoffs,0);assert.equal(f.closes,1);assert.equal(f.clears,1);
});
test('a handed-off input is detached before asynchronous key-close observation',async()=>{
  const f=fixture();await f.ready();const request=f.request(),expected=copy(request);
  const operation=f.owner.handoffToService(request);request.selectedGrantId='changed';
  request.originalPayment.expectedPins.digests.context='c'.repeat(64);request.paymentRequiredHeader='changed';
  await operation;assert.deepEqual(f.handoffInput,expected);await f.owner.close();
});
test('handoff failure is sticky and cannot trigger another handoff or signing',async()=>{
  const f=fixture();await f.ready();f.onHandoff=()=>Promise.reject(Error('PRIVATE_HANDOFF'));
  await assert.rejects(f.owner.handoffToService(f.request()));await assert.rejects(f.owner.handoffToService(f.request()));
  assert.equal(f.handoffs,1);assert.equal(f.signs,1);await assert.rejects(f.owner.close());assert.equal(f.closes,1);assert.equal(f.clears,1);
});
test('a late child handoff after outer close cannot admit service or upgrade HELD',async()=>{
  const f=fixture();await f.ready();const late=gate();f.onHandoff=()=>late.promise;
  const operation=f.owner.handoffToService(f.request());await tick();assert.equal(f.handoffs,1);
  const close=f.owner.close();late.resolve(F({phase:'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED'}));
  await assert.rejects(operation);await assert.rejects(close);assert.equal(f.owner.inspect().held,true);
  await assert.rejects(f.owner.submitOriginal({proof:'declared'}));assert.equal(f.services,0);assert.equal(f.closes,1);
});
test('client closure must return undefined and retain a current clean child view',async()=>{
  for(const kind of ['nonundefined','held']){
    const f=fixture();f.onClose=()=>{f.childLifecycle='CLOSED';f.childHeld=kind==='held';return Promise.resolve(kind==='nonundefined'?'bad':undefined);};
    await assert.rejects(f.owner.close());assert.equal(f.clears,1);assert.equal(f.closes,1);assert.equal(f.owner.inspect().lifecycle,'HELD');
  }
});
test('post-close view drift is retained without rewriting the historical close receipt',async()=>{
  const f=fixture();const close=f.owner.close();await close;f.childHeld=true;
  const view=f.owner.inspect();assert.equal(view.lifecycle,'HELD');assert.equal(view.historicalClose,'FULFILLED_UNDEFINED');
  assert.equal(f.owner.close(),close);await close;assert.equal(f.closes,1);assert.equal(f.clears,1);
});
test('unsupported signer completion keeps the actual key HELD despite client close',async()=>{
  const f=fixture();f.onSign=()=>Promise.resolve(f.signature);await assert.rejects(f.owner.prepareOriginalFunding(f.base.input));
  const close=f.owner.close();await assert.rejects(close);assert.equal(f.clears,0);assert.equal(f.closes,1);assert.equal(f.handoffs,0);
});
test('a second handoff or funding operation cannot reopen the successful service phase',async()=>{
  const f=fixture();await f.ready();await f.owner.handoffToService(f.request());
  await assert.rejects(f.owner.handoffToService(f.request()));await assert.rejects(f.owner.prepareOriginalFunding(f.base.input));
  await assert.rejects(f.owner.commitOriginalFunding({}));assert.equal(f.handoffs,1);assert.equal(f.signs,1);await f.owner.close();
});
test('constructor rejects proxy or accessor child methods without entering them',()=>{
  let hooks=0;const f=fixture();
  const bad=Object.freeze({...f.child,get close(){hooks++;throw Error('HOOK');}});
  assert.throws(()=>JOIN({client:bad,walletOwner:f.wallet,fundingResourceUrl:f.base.resourceUrl}));
  const proxy=new Proxy(f.child,{get(){hooks++;throw Error('HOOK');},getPrototypeOf(){hooks++;throw Error('HOOK');}});
  assert.throws(()=>JOIN({client:proxy,walletOwner:f.wallet,fundingResourceUrl:f.base.resourceUrl}));
  assert.equal(hooks,0);assert.equal(f.clears+f.prepares+f.closes,0);
});
test('closed native configuration captures the same public selection without key callbacks',()=>{
  const f=fixture(),material={publicKey:f.original.publicKey,startNonce:'0000000000000000',limits:{maxAttempts:4096,maxDifficulty:0}};
  const c={storeOptions:{databasePath:'declared.sqlite',allowedRoot:'declared-root',resourceUrl:f.base.resourceUrl,custodyPolicy:{}},
    fundingOptions:{readSessionOptions:{},materialOptions:material,materialWaitMs:250,keyPair:f.keyPair,
      expectedAddress:f.original.address,deadlineMs:1000,fundingTransportOptions:{}},
    serviceOptions:{official:{},transportOptions:{},deadlineMs:1000}};
  const selected=CAPTURE(c);material.publicKey='changed';material.limits.maxAttempts=1;
  assert.equal(selected.walletOptions.expectedPublicKey,f.original.publicKey);
  assert.equal(selected.fundingOptions.materialOptions.publicKey,f.original.publicKey);
  assert.equal(selected.fundingOptions.materialOptions.limits.maxAttempts,4096);
  assert.equal(selected.walletOptions.keyPair,f.keyPair);assert.equal(f.signs+f.clears,0);
  let hooks=0;Object.defineProperty(c.fundingOptions,'keyPair',{get(){hooks++;throw Error('HOOK');}});
  assert.throws(()=>CAPTURE(c));assert.equal(hooks,0);
});
test('active operation reservation rejects reentry without replacing the original',async()=>{
  const f=fixture();f.prepareGate=gate();const original=f.owner.prepareOriginalFunding(f.base.input);
  await assert.rejects(f.owner.prepareOriginalFunding(f.base.input));await tick();assert.equal(f.signs,1);assert.equal(f.prepares,1);
  f.prepareGate.resolve();await original;await f.owner.close();
});

test('a coherent foreign hash or signature packet cannot replace this wallet result',async()=>{
  for(const kind of ['hash','signature']){
    const f=fixture();f.prepareGate=gate();const operation=f.owner.prepareOriginalFunding(f.base.input);await tick();
    const other=retainedOriginalInputFixture();
    if(kind==='hash'){
      other.candidate.originalUnsignedBlock.height++;
      other.candidate.originalUnsignedBlock.hash=computeZenonUnsignedUserSendHash(other.candidate.originalUnsignedBlock);
    }
    other.candidate.accountBlock={...other.candidate.originalUnsignedBlock,
      signature:Buffer.alloc(64,kind==='signature'?17:42).toString('base64')};
    f.packet=ASSEMBLE(other.input,other.candidate,f.base.resourceUrl);
    f.prepareGate.resolve();await operation;
    await f.owner.commitOriginalFunding({expectedPins:copy(f.packet.expectedPins)});
    await f.owner.submitOriginalFunding({expectedPins:copy(f.packet.expectedPins)});
    await assert.rejects(f.owner.handoffToService(f.request()));
    assert.equal(f.handoffs,0);assert.equal(f.clears,0);assert.equal(f.owner.inspect().handoffAttempts,0);
    await f.owner.close();assert.equal(f.clears,1);assert.equal(f.signs,1);
  }
});

test('the actual native service void success is accepted without inventing a result',async()=>{
  const f=fixture({serviceResult:undefined});await f.ready();await f.owner.handoffToService(f.request());
  try{
    assert.equal(await f.owner.submitOriginal(F({proof:'declared-original'})),undefined);
    assert.equal(f.services,1);assert.equal(f.owner.inspect().held,false);
  }finally{try{await f.owner.close();}catch{}}
});

test('a manufactured service result record is refused and retained HELD',async()=>{
  const f=fixture({serviceResult:F({phase:'DECLARED_SERVICE_RESULT'})});await f.ready();await f.owner.handoffToService(f.request());
  await assert.rejects(f.owner.submitOriginal(F({proof:'declared-original'})),/operation_unknown/);
  assert.equal(f.services,1);assert.equal(f.owner.inspect().held,true);
  await assert.rejects(f.owner.close());assert.equal(f.closes,1);assert.equal(f.clears,1);
});

test('undefined remains invalid for a funding commit record',async()=>{
  const f=fixture({commitResult:undefined});await f.owner.prepareOriginalFunding(f.base.input);
  await assert.rejects(f.owner.commitOriginalFunding({expectedPins:copy(f.packet.expectedPins)}),/operation_refused_or_unknown/);
  assert.equal(f.owner.inspect().held,true);assert.equal(f.commits,1);assert.equal(f.submits+f.handoffs+f.services,0);
  await assert.rejects(f.owner.close());assert.equal(f.closes,1);assert.equal(f.clears,1);
});

test('a late void service completion joins close without escaping or replaying',async()=>{
  const f=fixture();await f.ready();await f.owner.handoffToService(f.request());
  const late=gate();f.onService=()=>late.promise;
  const operation=f.owner.submitOriginal(F({proof:'declared-original'})),refusal=assert.rejects(operation,/operation_unavailable/);
  const close=f.owner.close();let done=false;close.then(()=>{done=true;});
  await tick();assert.equal(done,false);assert.equal(f.services,1);assert.equal(f.closes,1);
  late.resolve(undefined);await refusal;await close;
  assert.equal(f.owner.close(),close);assert.equal(f.owner.inspect().lifecycle,'CLOSED');
  assert.equal(f.owner.inspect().publicOperationActive,false);assert.equal(f.signs,1);assert.equal(f.clears,1);assert.equal(f.services,1);
});
