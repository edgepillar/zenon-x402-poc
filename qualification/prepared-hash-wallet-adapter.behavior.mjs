// Actual adapter/hash/checkpoint DATA code; declared KeyPair callbacks only.
// Constant invalid signature bytes: no SDK, key, signing, SQL, socket or search.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createPreparedHashWalletAdapter as CREATE, assertWalletAdapter, WalletAdapter } from '../src/zenon/wallet-adapter.js';
import { computeZenonUnsignedUserSendHash } from '../src/zenon/transaction-planner.js';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as ASSEMBLE } from '../src/zenon/dynamic-plasma-original-funding-data.js';
import { restoreOriginalPaymentCheckpoint as RESTORE } from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_PREPARED_HASH_WALLET, 'builtin-only-declared-keypair-data');
const copy = value => structuredClone(value);
const matches = kind => e => e instanceof TypeError && e.message === 'zenon_prepared_hash_wallet_' + kind;
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
function fixture(overrides = {}) {
  const source = retainedOriginalInputFixture();
  const f = { source, original: copy(source.candidate.originalUnsignedBlock), calls: 0, addresses: 0, clears: 0,
    bytes: null, hashText: null, address: source.candidate.originalUnsignedBlock.address,
    signature: new Uint8Array(64).fill(42) };
  f.keyPair = {
    getAddress() { assert.equal(this,f.keyPair); assert.equal(arguments.length,0); f.addresses++; return f.address; },
    sign(bytes) { assert.equal(this,f.keyPair); assert.equal(arguments.length,1); f.calls++; f.bytes=bytes;
      assert.ok(Buffer.isBuffer(bytes)); assert.equal(bytes.length,32); f.hashText=bytes.toString('hex');
      return f.onSign ? f.onSign(bytes) : Promise.resolve(f.signature); },
    clear() { f.clears++; }, prepareBlock() { throw Error('NO_COMPOSITE_PREPARATION'); },
  };
  f.config = { keyPair:f.keyPair, expectedAddress:f.address, expectedPublicKey:f.original.publicKey, ...overrides };
  f.wallet = CREATE(f.config); return f;
}

test('the exported concrete adapter satisfies the existing WalletAdapter interface', async () => {
  const f=fixture();assert.equal(assertWalletAdapter(f.wallet),f.wallet);assert.ok(Object.isFrozen(f.wallet));
  assert.equal(await f.wallet.getAddress(),f.address);assert.equal(f.calls,0);
  await assert.rejects(new WalletAdapter().getAddress(),/must be implemented/);
});
test('one declared callback receives only the exact original 32-byte hash', async () => {
  const f=fixture(),before=copy(f.original),signed=await f.wallet.sign(f.original);
  assert.equal(f.calls,1);assert.equal(f.hashText,f.original.hash);assert.deepEqual(f.original,before);
  assert.deepEqual(signed,{...before,signature:Buffer.alloc(64,42).toString('base64')});
  assert.ok(Object.isFrozen(signed));assert.ok(Object.isFrozen(signed.momentumAcknowledged));
});
test('captured KeyPair methods survive replacement without calling composite preparation', async () => {
  const f=fixture();f.keyPair.getAddress=f.keyPair.sign=()=>{throw Error('REPLACEMENT');};
  assert.equal(await f.wallet.getAddress(),f.address);await f.wallet.sign(f.original);assert.equal(f.calls,1);
});
test('a synchronous SDK-style Address value is read through its data method', async () => {
  const f=fixture();class Address { toString(){return f.original.address;} }
  f.address=new Address();assert.equal(await f.wallet.getAddress(),f.original.address);await f.wallet.sign(f.original);
});
test('a Buffer callback result becomes detached canonical signature DATA', async () => {
  const f=fixture();f.signature=Buffer.alloc(64,42);const signed=await f.wallet.sign(f.original);
  f.signature.fill(9);assert.equal(signed.signature,Buffer.alloc(64,42).toString('base64'));
});
test('a Uint8Array callback result retains every original block field', async () => {
  const f=fixture(),signed=await f.wallet.sign(f.original);
  for(const k of Object.keys(f.original)) if(k!=='signature') assert.deepEqual(signed[k],f.original[k]);
});
test('an inconsistent block hash is rejected before entering the borrowed owner', async () => {
  const f=fixture();f.original.hash='a'.repeat(64);
  await assert.rejects(f.wallet.sign(f.original),matches('original_rejected'));assert.equal(f.calls+f.addresses,0);
  assert.equal(f.wallet.inspect().phase,'ORIGINAL_REJECTED');
});
test('already signed input cannot enter the signer', async () => {
  const f=fixture();f.original.signature=Buffer.alloc(64,42).toString('base64');
  await assert.rejects(f.wallet.sign(f.original),matches('original_rejected'));assert.equal(f.calls,0);
});
test('changed public bytes are rejected even though they are outside the block hash', async () => {
  const f=fixture();f.original.publicKey=Buffer.alloc(32,8).toString('base64');
  assert.equal(computeZenonUnsignedUserSendHash(f.original),f.original.hash);
  await assert.rejects(f.wallet.sign(f.original),matches('original_rejected'));assert.equal(f.calls,0);
});
test('a caller-selected different payer cannot substitute for the original block payer', async () => {
  const original=retainedOriginalInputFixture().candidate.originalUnsignedBlock;
  const f=fixture({expectedAddress:original.toAddress});await assert.rejects(f.wallet.sign(f.original),matches('original_rejected'));
  assert.equal(f.calls,0);
});
test('public bytes must derive the payer address even when both selections agree', async () => {
  const key=Buffer.alloc(32,8).toString('base64'),f=fixture({expectedPublicKey:key});f.original.publicKey=key;
  await assert.rejects(f.wallet.sign(f.original),matches('original_rejected'));assert.equal(f.calls+f.addresses,0);
});
test('a mismatching current KeyPair address refuses before hash signing', async () => {
  const f=fixture();f.address=f.original.toAddress;
  await assert.rejects(f.wallet.sign(f.original),matches('original_rejected'));assert.equal(f.calls,0);
});
test('the owner address is rechecked after the initial address query', async () => {
  const f=fixture();await f.wallet.getAddress();f.address=f.original.toAddress;
  await assert.rejects(f.wallet.sign(f.original),matches('original_rejected'));assert.equal(f.addresses,2);assert.equal(f.calls,0);
});
test('pending signing holds a detached unsigned original across caller mutation', async () => {
  const gate=deferred(),f=fixture();f.onSign=()=>gate.promise;const before=copy(f.original),pending=f.wallet.sign(f.original);
  f.original.amount='999';f.original.momentumAcknowledged.height=999;
  assert.deepEqual(f.wallet.inspect().originalUnsignedBlock,before);assert.equal(f.wallet.inspect().phase,'SIGNING');
  gate.resolve(f.signature);const result=await pending;assert.equal(result.amount,before.amount);
  assert.deepEqual(result.momentumAcknowledged,before.momentumAcknowledged);
});
test('a concurrent second call cannot poison the pending original attempt', async () => {
  const gate=deferred(),f=fixture();f.onSign=()=>gate.promise;const pending=f.wallet.sign(f.original);
  await assert.rejects(f.wallet.sign(f.original),matches('sign_unavailable'));assert.equal(f.wallet.inspect().phase,'SIGNING');
  gate.resolve(f.signature);await pending;assert.equal(f.calls,1);assert.equal(f.wallet.inspect().phase,'SIGNED_DATA_RETURNED');
});
test('synchronous signer reentry is refused while the outer candidate completes', async () => {
  const f=fixture();let nested;f.onSign=()=>{nested=assert.rejects(f.wallet.sign(f.original),matches('sign_unavailable'));return Promise.resolve(f.signature);};
  await f.wallet.sign(f.original);await nested;assert.equal(f.calls,1);
});
test('a synchronous throw after signer entry preserves unknown outcome and original', async () => {
  const f=fixture();f.onSign=()=>{throw Error('PRIVATE_REASON');};
  await assert.rejects(f.wallet.sign(f.original),matches('signer_outcome_unknown'));
  const view=f.wallet.inspect();assert.equal(view.phase,'SIGNING_OUTCOME_UNKNOWN');assert.deepEqual(view.originalUnsignedBlock,f.original);
  assert.equal(view.signedOriginal,null);await assert.rejects(f.wallet.sign(f.original),matches('sign_unavailable'));assert.equal(f.calls,1);
});
test('a rejected callback has a fixed public error without arbitrary reason data', async () => {
  const f=fixture();f.onSign=()=>Promise.reject(Error('PRIVATE_REASON'));
  await assert.rejects(f.wallet.sign(f.original),e=>matches('signer_outcome_unknown')(e)&&!String(e.stack).includes('PRIVATE_REASON'));
  assert.equal(f.wallet.inspect().phase,'SIGNING_OUTCOME_UNKNOWN');
});
test('a malformed signature byte count is terminal without repairing the output', async () => {
  const f=fixture();f.signature=new Uint8Array(63);await assert.rejects(f.wallet.sign(f.original),matches('signer_outcome_unknown'));
  assert.equal(f.wallet.inspect().signedOriginal,null);assert.equal(f.calls,1);
});
test('an arbitrary thenable is refused without reading its then accessor', async () => {
  const f=fixture();let hooks=0;f.onSign=()=>Object.defineProperty({},'then',{get(){hooks++;throw Error('HOOK');}});
  await assert.rejects(f.wallet.sign(f.original),matches('signer_outcome_unknown'));assert.equal(hooks,0);
});
test('a proxy native Promise is refused without invoking its traps', async () => {
  const f=fixture();let hooks=0;f.onSign=()=>new Proxy(Promise.resolve(f.signature),{get(){hooks++;throw Error('HOOK');}});
  await assert.rejects(f.wallet.sign(f.original),matches('signer_outcome_unknown'));assert.equal(hooks,0);
});
test('a foreign Promise subclass cannot replace the supported result boundary', async () => {
  const f=fixture();class Foreign extends Promise{}f.onSign=()=>Foreign.resolve(f.signature);
  await assert.rejects(f.wallet.sign(f.original),matches('signer_outcome_unknown'));
});
test('a native Promise constructor getter is refused without invoking it', async () => {
  const f=fixture();let hooks=0;f.onSign=()=>Object.defineProperty(Promise.resolve(f.signature),'constructor',{get(){hooks++;throw Error('HOOK');}});
  await assert.rejects(f.wallet.sign(f.original),matches('signer_outcome_unknown'));assert.equal(hooks,0);
});
test('signature proxies shared bytes and string substitutes are rejected', async () => {
  let hooks=0,nativeThenReads=0;
  const proxy=new Proxy(new Uint8Array(64),{get(_target,name){
    // Promise.resolve inside the DECLARED owner must inspect then once.
    // Other proxy traps would come from an unintended result inspection.
    if(name==='then'){nativeThenReads++;return undefined;}hooks++;throw Error('HOOK');
  }});
  for(const data of [proxy,new Uint8Array(new SharedArrayBuffer(64)),Buffer.alloc(0),'A'.repeat(88)]){
    const f=fixture();f.signature=data;await assert.rejects(f.wallet.sign(f.original),matches('signer_outcome_unknown'));assert.equal(f.calls,1);
  }
  assert.equal(nativeThenReads,1);assert.equal(hooks,0);
});
test('configuration getters proxy owners and accessor methods are rejected without invocation', () => {
  const f=fixture();let hooks=0;const hook=()=>{hooks++;throw Error('HOOK');};
  const owner=Object.defineProperty({sign:f.keyPair.sign},'getAddress',{get:hook});
  const proxy=new Proxy(f.keyPair,{get:hook,getPrototypeOf:hook,ownKeys:hook});
  for(const keyPair of [owner,proxy,{}, {getAddress:f.keyPair.getAddress,sign:new Proxy(f.keyPair.sign,{apply:hook})}])
    assert.throws(()=>CREATE({...f.config,keyPair}),matches('configuration_rejected'));
  const config=Object.defineProperty({...f.config},'expectedAddress',{get:hook,enumerable:true});
  assert.throws(()=>CREATE(config),matches('configuration_rejected'));assert.equal(hooks,0);
});
test('block accessors and proxy blocks are rejected before the owner is called', async () => {
  let hooks=0;const hook=()=>{hooks++;throw Error('HOOK');};
  for(const build of [b=>new Proxy(b,{get:hook,ownKeys:hook,getPrototypeOf:hook}),b=>Object.defineProperty(b,'amount',{get:hook,enumerable:true})]){
    const f=fixture();await assert.rejects(f.wallet.sign(build(f.original)),matches('original_rejected'));assert.equal(f.calls+f.addresses,0);
  }
  assert.equal(hooks,0);
});
test('an Address toString accessor is refused before signing without invoking it', async () => {
  const f=fixture();let hooks=0;f.address=Object.defineProperty({},'toString',{get(){hooks++;throw Error('HOOK');}});
  await assert.rejects(f.wallet.sign(f.original),matches('original_rejected'));assert.equal(f.calls+hooks,0);
});
test('invalid factory options and call arities do not grant another operation', async () => {
  const f=fixture();for(const config of [{...f.config,extra:1},{...f.config,expectedPublicKey:'bad'}])
    assert.throws(()=>CREATE(config),matches('configuration_rejected'));
  assert.throws(()=>CREATE(),matches('configuration_rejected'));
  await assert.rejects(f.wallet.sign(),matches('sign_unavailable'));assert.equal(f.wallet.inspect().used,false);
  await f.wallet.sign(f.original);await assert.rejects(f.wallet.sign(f.original),matches('sign_unavailable'));assert.equal(f.calls,1);
});
test('inspection preserves signed originals without clearing or exporting borrowed private state', async () => {
  const f=fixture();assert.equal(f.wallet.inspect().phase,'IDLE');const signed=await f.wallet.sign(f.original),view=f.wallet.inspect();
  assert.equal(view.signedOriginal,signed);assert.equal(view.signatureValidation,'NOT_PERFORMED');assert.equal(view.authority,'NONE');
  assert.equal(f.clears,0);assert.equal(Object.hasOwn(view,'keyPair'),false);assert.equal(f.bytes.toString('hex'),'00'.repeat(32));
});
test('address callback reentry cannot start signing while address inspection is active', async () => {
  const f=fixture();let nested;class Address {toString(){nested=assert.rejects(f.wallet.sign(f.original),matches('sign_unavailable'));return f.original.address;}}
  f.address=new Address();await f.wallet.getAddress();await nested;assert.equal(f.wallet.inspect().used,false);assert.equal(f.calls,0);
});
test('a changed hash buffer during the callback leaves the signing outcome unknown', async () => {
  const f=fixture();f.onSign=bytes=>{bytes[0]^=1;return Promise.resolve(f.signature);};
  await assert.rejects(f.wallet.sign(f.original),matches('signer_outcome_unknown'));assert.equal(f.wallet.inspect().signedOriginal,null);
});
test('the actual funding DATA codec retains the adapter output and exact independent checkpoint pins', async () => {
  const f=fixture(),signed=await f.wallet.sign(f.original);
  const packet=ASSEMBLE(f.source.input,{originalUnsignedBlock:f.original,accountBlock:signed},f.source.resourceUrl);
  assert.deepEqual(packet.paymentPayload.payload.transaction,signed);assert.equal(packet.transactionHash,f.original.hash);
  const restored=RESTORE(packet.serializedCheckpoint,packet.expectedPins);
  assert.equal(restored.originalBytes.paymentPayload,packet.pair.paymentSignatureHeader);
  assert.equal(packet.signatureValidation,'NOT_PERFORMED');assert.equal(packet.persistence,'NOT_PERFORMED');assert.equal(f.calls,1);
});
