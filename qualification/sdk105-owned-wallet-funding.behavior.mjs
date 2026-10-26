// Actual owners/adapter/DP code; SDK-shaped synchronous callbacks only.
// Fixed public bytes and invalid signature DATA, no real key or SDK execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createSdk105PreparedHashWalletOwner as OWN } from '../src/zenon/sdk105-prepared-hash-wallet-owner.js';
import { createSdk105OriginalFundingOwner as JOIN } from '../src/zenon/sdk105-original-funding-owner.js';
import { createPreparedHashWalletAdapter as GENERIC } from '../src/zenon/prepared-hash-wallet-adapter.js';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { keyPairCandidateFixture } from './dynamic-plasma-keypair-candidate.fixture.mjs';
import { createObservedBalanceDeadlineBoundMaterialRetainedCandidatePreparer as PREPARER } from '../src/zenon/dynamic-plasma-observed-balance-deferred-material-planner.js';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as ASSEMBLE } from '../src/zenon/dynamic-plasma-original-funding-data.js';

assert.equal(process.version,'v24.19.0');
assert.equal(process.env.X402_SDK105_OWNED_WALLET,'builtin-only-sync-sdk-shaped-data');
const F=Object.freeze,tick=()=>new Promise(resolve=>setImmediate(resolve));
const code=tail=>e=>e instanceof TypeError&&e.message==='zenon_sdk105_wallet_owner_'+tail;
const joinCode=tail=>e=>e instanceof TypeError&&e.message==='zenon_sdk105_original_funding_owner_'+tail;
function gate(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function rawFixture(create=true){
  const original=structuredClone(retainedOriginalInputFixture().candidate.originalUnsignedBlock);
  const f={original,publicData:Buffer.from(original.publicKey,'base64'),signature:Buffer.alloc(64,42),
    publicCalls:0,addressCalls:0,signCalls:0,clearCalls:0,privateReads:0,signActive:false,addressActive:false,trace:[]};
  f.keyPair={getPublicKey(){assert.equal(this,f.keyPair);f.publicCalls++;return f.onPublic?f.onPublic():f.publicData;},
    getAddress(){assert.equal(this,f.keyPair);f.addressCalls++;f.addressActive=true;
      try{return f.onAddress?f.onAddress():original.address;}finally{f.addressActive=false;}},
    sign(bytes){assert.equal(this,f.keyPair);assert.equal(++f.signCalls,1);assert.ok(Buffer.isBuffer(bytes));assert.equal(bytes.length,32);
      f.hash=bytes.toString('hex');f.signActive=true;f.trace.push('sign:enter');
      try{return f.onSign?f.onSign(bytes):f.signature;}finally{f.signActive=false;f.trace.push('sign:exit');}},
    clear(){assert.equal(this,f.keyPair);f.clearCalls++;assert.equal(f.signActive||f.addressActive,false);f.trace.push('clear');
      if(f.onClear)return f.onClear();f.publicData.fill(0);},
    getPrivateKey(){f.privateReads++;throw Error('NO_PRIVATE_KEY_READ');}};
  f.configuration={keyPair:f.keyPair,expectedAddress:original.address,expectedPublicKey:original.publicKey};
  if(create)f.owner=OWN(f.configuration);return f;
}
function fundingFixture(wallet,mode={}){
  const f={prepares:0,commits:0,submits:0,closes:0,operation:Promise.resolve(F({declared:true}))};
  f.child=F({prepareOriginalFunding:F(function prepare(input){f.prepares++;f.input=input;return mode.operation??f.operation;}),
    commitOriginalFunding:F(function commit(input){f.commits++;f.input=input;return f.operation;}),
    submitOriginalFunding:F(function submit(input){f.submits++;f.input=input;return f.operation;}),
    inspectOriginalFunding:F(function inspect(){return F({phase:'DECLARED_CHILD',closes:f.closes});}),
    close:F(function close(){f.closes++;if(mode.throwClose)throw Error('PRIVATE_CLOSE');
      return Object.hasOwn(mode,'closeResult')?mode.closeResult:Promise.resolve(undefined);})});
  f.owner=JOIN({funding:f.child,walletOwner:wallet});return f;
}
function integrated(mode={}){
  const f=keyPairCandidateFixture(mode);f.publicData=Buffer.from(f.selected.materialOptions.publicKey,'base64');
  f.publicCalls=0;f.clearCalls=0;
  f.keyPair.getPublicKey=function getPublicKey(){f.publicCalls++;return f.publicData;};
  f.keyPair.clear=function clear(){f.clearCalls++;f.publicData.fill(0);};
  f.keyPair.sign=function sign(bytes){assert.equal(this,f.keyPair);assert.equal(++f.keyCalls,1);
    assert.equal(f.accountCalls.length,12);assert.deepEqual(f.positions,[24,24]);assert.equal(f.materialCalls,1);
    f.hash=bytes.toString('hex');f.originalUnsigned=f.walletOwner.inspect().wallet.originalUnsignedBlock;
    assert.equal(f.hash,f.originalUnsigned.hash);return Buffer.from(f.signature);};
  f.walletOwner=OWN({keyPair:f.keyPair,expectedAddress:f.payer,expectedPublicKey:f.selected.materialOptions.publicKey});
  // Reuse the existing read-script fixture without running its original unused
  // preparer. Only this actual retained preparer enters its borrowed callbacks.
  f.options=F({readOptions:f.readOptions,materialExchange:f.material,materialWaitMs:250,wallet:f.walletOwner});
  f.preparer=PREPARER(f.options);return f;
}

test('the pinned SDK synchronous-result mismatch is reproduced without importing the SDK',async()=>{
  const old=rawFixture(false),generic=GENERIC(old.configuration);
  await assert.rejects(generic.sign(old.original),/signer_outcome_unknown/);assert.equal(old.signCalls,1);old.keyPair.clear();
  const f=rawFixture(),signed=await f.owner.sign(f.original);assert.equal(signed.hash,f.original.hash);
  assert.equal(f.signCalls,1);await f.owner.close();assert.equal(f.clearCalls,1);
});
test('construction reads no key method or private bytes and public identity is checked before use',async()=>{
  const f=rawFixture();assert.equal(f.publicCalls+f.addressCalls+f.signCalls+f.clearCalls+f.privateReads,0);
  assert.equal(await f.owner.getAddress(),f.original.address);assert.equal(f.publicCalls,1);assert.equal(f.addressCalls,1);
  await f.owner.close();assert.equal(f.clearCalls,1);assert.equal(f.privateReads,0);
});
test('synchronous Buffer capture bypasses its then getter and detaches signature bytes',async()=>{
  const f=rawFixture();let hooks=0;Object.defineProperty(f.signature,'then',{get(){hooks++;throw Error('NO_THEN');}});
  const signed=await f.owner.sign(f.original);f.signature.fill(9);
  assert.equal(signed.signature,Buffer.alloc(64,42).toString('base64'));assert.equal(hooks,0);await f.owner.close();
});
test('synchronous byte output preserves every original block field',async()=>{
  const f=rawFixture();f.signature=new Uint8Array(64).fill(42);const signed=await f.owner.sign(f.original);
  for(const name of Object.keys(f.original))if(name!=='signature')assert.deepEqual(signed[name],f.original[name]);
  assert.equal(f.hash,f.original.hash);await f.owner.close();
});
test('changed SDK public bytes refuse before address work or signing',async()=>{
  const f=rawFixture();f.publicData.fill(8);await assert.rejects(f.owner.getAddress(),code('operation_refused_or_unknown'));
  assert.equal(f.addressCalls+f.signCalls,0);await f.owner.close();assert.equal(f.clearCalls,1);
});
test('close reentry during synchronous signing waits for copied retained DATA before clear',async()=>{
  const f=rawFixture();let close;f.onSign=()=>{close=f.owner.close();assert.equal(f.clearCalls,0);return f.signature;};
  const operation=f.owner.sign(f.original);await assert.rejects(operation,code('closed_with_retained_result'));await close;
  assert.equal(f.owner.close(),close);assert.deepEqual(f.trace,['sign:enter','sign:exit','clear']);
  const view=f.owner.inspect();assert.equal(view.lifecycle,'CLOSED');assert.equal(view.signingOutcome,'RETURNED_DATA');
  assert.equal(view.wallet.signedOriginal.hash,f.original.hash);assert.equal(f.signCalls,1);assert.equal(f.clearCalls,1);
});
test('close during the initial address callback cannot clear it early or admit a signer',async()=>{
  const f=rawFixture();let close;f.onAddress=()=>{close=f.owner.close();assert.equal(f.clearCalls,0);return f.original.address;};
  await assert.rejects(f.owner.getAddress());await close;assert.equal(f.signCalls,0);assert.equal(f.clearCalls,1);
});
test('clear reentry sees the same close Promise and cannot reopen signing',async()=>{
  const f=rawFixture();let nested,reentry;f.onClear=()=>{nested=f.owner.close();reentry=assert.rejects(f.owner.sign(f.original),code('operation_unavailable'));};
  const close=f.owner.close();await close;await reentry;assert.equal(nested,close);assert.equal(f.clearCalls,1);assert.equal(f.signCalls,0);
});
test('a synchronous SDK-shaped throw stays signing-unknown even after clear returned',async()=>{
  const f=rawFixture();f.onSign=()=>{throw Error('PRIVATE_SIGNATURE_REASON');};
  await assert.rejects(f.owner.sign(f.original),code('operation_refused_or_unknown'));await f.owner.close();
  const view=f.owner.inspect();assert.equal(view.signingOutcome,'UNKNOWN');assert.equal(view.clearOutcome,'CLEAR_RETURNED');
  assert.equal(view.wallet.originalUnsignedBlock.hash,f.original.hash);assert.equal(f.clearCalls,1);
});
test('an unsupported async SDK result is held without then access or unsafe key clear',async()=>{
  const f=rawFixture();let hooks=0;const result=Promise.resolve(f.signature);
  Object.defineProperty(result,'then',{get(){hooks++;throw Error('NO_THEN');}});f.onSign=()=>result;
  await assert.rejects(f.owner.sign(f.original));const close=f.owner.close();await assert.rejects(close,code('clear_unknown'));
  assert.equal(f.owner.close(),close);assert.equal(f.clearCalls,0);assert.equal(hooks,0);assert.equal(f.owner.inspect().held,true);
});
test('a clear exception is cached UNKNOWN and never automatically retried',async()=>{
  const f=rawFixture();f.onClear=()=>{throw Error('PRIVATE_CLEAR_REASON');};const close=f.owner.close();
  await assert.rejects(close,e=>code('clear_unknown')(e)&&!String(e.stack).includes('PRIVATE_CLEAR_REASON'));
  assert.equal(f.owner.close(),close);assert.equal(f.clearCalls,1);assert.equal(f.owner.inspect().lifecycle,'HELD');
});
test('a non-undefined clear result is not assimilated or accepted as cleanup',async()=>{
  let hooks=0;const thenable=Object.defineProperty({},'then',{get(){hooks++;throw Error('NO_THEN');}});
  for(const result of ['bad',Promise.resolve(undefined),thenable]){
    const f=rawFixture();f.onClear=()=>result;const close=f.owner.close();await assert.rejects(close,code('clear_unknown'));
    assert.equal(f.owner.close(),close);assert.equal(f.clearCalls,1);assert.equal(f.owner.inspect().clearOutcome,'UNKNOWN');
  }
  assert.equal(hooks,0);
});
test('a second pending sign call cannot poison the original native-Promise result',async()=>{
  const f=rawFixture(),first=f.owner.sign(f.original);await assert.rejects(f.owner.sign(f.original),code('operation_unavailable'));
  const signed=await first;assert.equal(signed.hash,f.original.hash);assert.equal(f.signCalls,1);await f.owner.close();
});
test('an opaque synchronous result is retained without proxy hooks and keeps the key held',async()=>{
  const f=rawFixture();let hooks=0;f.onSign=()=>new Proxy(f.signature,{get(){hooks++;throw Error('HOOK');},getPrototypeOf(){hooks++;throw Error('HOOK');}});
  await assert.rejects(f.owner.sign(f.original));await assert.rejects(f.owner.close(),code('clear_unknown'));
  assert.equal(hooks,0);assert.equal(f.clearCalls,0);assert.equal(f.owner.inspect().unobservableSdkResultHeld,true);
});
test('the funding coordinator preserves each actual child operation Promise identity',async()=>{
  const f=rawFixture(),funding=fundingFixture(f.owner),input=F({declared:true});
  assert.equal(funding.owner.prepareOriginalFunding(input),funding.operation);
  assert.equal(funding.owner.commitOriginalFunding(input),funding.operation);
  assert.equal(funding.owner.submitOriginalFunding(input),funding.operation);await funding.operation;
  await funding.owner.close();assert.equal(funding.closes,1);assert.equal(f.clearCalls,1);
});
test('funding close throwing cannot suppress the independent key stop',async()=>{
  const f=rawFixture(),funding=fundingFixture(f.owner,{throwClose:true}),close=funding.owner.close();
  await assert.rejects(close,joinCode('close_unknown'));assert.equal(funding.owner.close(),close);
  assert.equal(funding.closes,1);assert.equal(f.clearCalls,1);assert.equal(funding.owner.inspectOriginalFunding().held,true);
  await assert.rejects(funding.owner.prepareOriginalFunding({}),joinCode('operation_unavailable'));assert.equal(funding.prepares,0);
});
test('unknown key clear cannot suppress funding close or become a clean joined result',async()=>{
  const f=rawFixture();f.onClear=()=>{throw Error('PRIVATE_CLEAR');};const funding=fundingFixture(f.owner);
  await assert.rejects(funding.owner.close(),joinCode('close_unknown'));await tick();
  assert.equal(funding.closes,1);assert.equal(f.clearCalls,1);
  assert.deepEqual(funding.owner.inspectOriginalFunding().closeLegs,{funding:'CLOSED',wallet:'UNKNOWN'});
});
test('joined close waits for funding completion after the active signer copy is retained',async()=>{
  const f=rawFixture(),stop=gate(),funding=fundingFixture(f.owner,{closeResult:stop.promise});
  const operation=f.owner.sign(f.original),operationRefusal=assert.rejects(operation,code('closed_with_retained_result'));
  const close=funding.owner.close();assert.equal(f.clearCalls,0);assert.equal(funding.closes,1);let settled=false;close.then(()=>{settled=true;});
  await operationRefusal;await tick();assert.equal(f.clearCalls,1);assert.equal(settled,false);
  stop.resolve(undefined);await close;assert.equal(funding.owner.inspectOriginalFunding().lifecycle,'CLOSED');
  assert.equal(f.owner.inspect().wallet.signedOriginal.hash,f.original.hash);
});
test('an unobservable SDK result keeps joined cleanup HELD despite funding close success',async()=>{
  const f=rawFixture();f.onSign=()=>Promise.resolve(f.signature);await assert.rejects(f.owner.sign(f.original));
  const funding=fundingFixture(f.owner);await assert.rejects(funding.owner.close(),joinCode('close_unknown'));await tick();
  assert.equal(funding.closes,1);assert.equal(f.clearCalls,0);assert.equal(funding.owner.inspectOriginalFunding().held,true);
});
test('an invalid child operation never upgrades after both later close receipts return',async()=>{
  const f=rawFixture();let hooks=0;const thenable=Object.defineProperty({},'then',{get(){hooks++;throw Error('HOOK');}});
  const funding=fundingFixture(f.owner,{operation:thenable});await assert.rejects(funding.owner.prepareOriginalFunding({}),joinCode('operation_unknown'));
  await assert.rejects(funding.owner.close(),joinCode('close_unknown'));await tick();
  assert.equal(hooks,0);assert.equal(f.clearCalls,1);assert.equal(funding.closes,1);assert.equal(funding.owner.inspectOriginalFunding().lifecycle,'HELD');
});
test('a non-undefined funding close completion remains UNKNOWN after key clear',async()=>{
  const f=rawFixture(),funding=fundingFixture(f.owner,{closeResult:Promise.resolve('not-undefined')});
  await assert.rejects(funding.owner.close(),joinCode('close_unknown'));
  assert.equal(funding.closes,1);assert.equal(f.clearCalls,1);assert.equal(funding.owner.inspectOriginalFunding().closeLegs.funding,'UNKNOWN');
});
test('coordinator construction rejects child getters and proxy records before invocation',async()=>{
  const f=rawFixture(),funding=fundingFixture(f.owner);let hooks=0;const hook=()=>{hooks++;throw Error('HOOK');};
  const child=F(Object.defineProperty({...funding.child},'close',{get:hook,enumerable:true}));
  assert.throws(()=>JOIN({funding:child,walletOwner:f.owner}),joinCode('configuration_rejected'));
  assert.throws(()=>JOIN(new Proxy({funding:funding.child,walletOwner:f.owner},{get:hook,ownKeys:hook,getPrototypeOf:hook})),joinCode('configuration_rejected'));
  assert.equal(hooks,0);assert.equal(funding.closes+f.clearCalls,0);await f.owner.close();
});
test('the actual six-cycle DP preparer accepts synchronous SDK-shaped bytes without another key operation',async()=>{
  const f=integrated({ages:[0,0,0,0,1,2]}),first=await f.prepare();
  const before=ASSEMBLE(f.input,{originalUnsignedBlock:first.originalUnsignedBlock,accountBlock:first.accountBlock},f.resourceUrl);
  const checked=await f.preparer.revalidateSignedOriginal();
  const after=ASSEMBLE(f.input,{originalUnsignedBlock:checked.originalUnsignedBlock,accountBlock:checked.accountBlock},f.resourceUrl);
  assert.equal(checked.signing,'NOT_INVOKED');assert.equal(f.keyCalls,1);assert.equal(f.publicCalls,3);assert.equal(f.addressCalls,2);
  assert.equal(f.accountCalls.length,18);assert.deepEqual(f.positions,[36,36]);assert.equal(after.serializedCheckpoint,before.serializedCheckpoint);
  await f.walletOwner.close();assert.equal(f.clearCalls,1);assert.equal(f.walletOwner.inspect().signingOutcome,'RETURNED_DATA');assert.equal(f.fetchCalls,0);
});
test('key cleanup cannot change a refused sixth current read into funding or resign authority',async()=>{
  const f=integrated({ages:[0,0,0,0,0,3]}),first=await f.prepare();await assert.rejects(f.preparer.revalidateSignedOriginal());
  const retained=f.preparer.getSignedOriginalData().candidate.accountBlock;assert.deepEqual(retained,first.accountBlock);
  await f.walletOwner.close();await assert.rejects(f.prepare());assert.equal(f.keyCalls,1);assert.equal(f.clearCalls,1);
  assert.equal(f.walletOwner.inspect().wallet.signedOriginal.hash,first.accountBlock.hash);assert.equal(f.fetchCalls,0);
});
test('an invalid prepared hash cannot enter the SDK-shaped signer or renew its attempt',async()=>{
  const f=rawFixture(),bad={...f.original,hash:'a'.repeat(64)};
  await assert.rejects(f.owner.sign(bad),code('operation_refused_or_unknown'));
  assert.equal(f.signCalls,0);assert.equal(f.owner.inspect().sdkSignerEntered,false);
  await assert.rejects(f.owner.sign(f.original),code('operation_unavailable'));await f.owner.close();assert.equal(f.clearCalls,1);
});
test('owner construction refuses key/configuration accessors without invoking or clearing them',()=>{
  const f=rawFixture(false);let hooks=0;const hook=()=>{hooks++;throw Error('NO_HOOK');};
  const keyPair=Object.defineProperty({...f.keyPair},'clear',{get:hook,enumerable:true});
  assert.throws(()=>OWN({...f.configuration,keyPair}),code('configuration_rejected'));
  const config=Object.defineProperty({...f.configuration},'expectedPublicKey',{get:hook,enumerable:true});
  assert.throws(()=>OWN(config),code('configuration_rejected'));
  assert.throws(()=>OWN({...f.configuration,keyPair:new Proxy(f.keyPair,{get:hook,ownKeys:hook,getPrototypeOf:hook})}),code('configuration_rejected'));
  assert.equal(hooks+f.publicCalls+f.addressCalls+f.signCalls+f.clearCalls+f.privateReads,0);
});
test('late native rejection is consumed while the unsupported SDK result stays HELD',async()=>{
  const f=rawFixture(),result=gate();f.onSign=()=>result.promise;
  await assert.rejects(f.owner.sign(f.original));const close=f.owner.close();await assert.rejects(close,code('clear_unknown'));
  result.reject(Error('PRIVATE_LATE_SIGNATURE_FAILURE'));await tick();
  const view=f.owner.inspect();assert.equal(view.held,true);assert.equal(view.signingOutcome,'UNKNOWN');
  assert.equal(view.unobservableSdkResultHeld,true);assert.equal(f.clearCalls,0);assert.equal(f.owner.close(),close);
});
