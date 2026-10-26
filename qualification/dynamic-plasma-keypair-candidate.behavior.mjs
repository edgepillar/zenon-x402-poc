// Actual context-v7 quote/read/candidate/signer-adapter/revalidation and DATA
// checkpoint connection. Declared exchanges, fixed material, invalid bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keyPairCandidateFixture as fixture } from './dynamic-plasma-keypair-candidate.fixture.mjs';
import { captureDynamicPlasmaKeyPairFundingConfiguration as CAPTURE } from '../src/zenon/dynamic-plasma-keypair-funding-configuration.js';
import { createDynamicPlasmaPreparedHashWalletOptions as OPTIONS } from '../src/zenon/dynamic-plasma-prepared-hash-wallet-options.js';
import { captureZenonDynamicPlasmaBoundedOriginalFundingConfiguration as LEGACY_CAPTURE } from '../src/zenon/dynamic-plasma-bounded-original-funding-configuration.js';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as ASSEMBLE } from '../src/zenon/dynamic-plasma-original-funding-data.js';
import { restoreOriginalPaymentCheckpoint as RESTORE } from '../src/service-credit-pilot-original-payment-checkpoint.js';

assert.equal(process.version,'v24.19.0');
assert.equal(process.env.X402_DP_KEYPAIR_CANDIDATE,'builtin-only-declared-read-material-keypair');
const error=kind=>e=>(kind==='busy'?e instanceof Error:e instanceof TypeError)&&e.message==='zenon_observed_balance_deferred_material_dp_planner_'+kind;
const packet=(f,result)=>ASSEMBLE(f.input,{originalUnsignedBlock:result.originalUnsignedBlock,accountBlock:result.accountBlock},f.resourceUrl);
const retained=f=>f.preparer.getSignedOriginalData().candidate;

test('actual contextv7 preparation and sixth validation keep one hash-only result through checkpoint DATA',async()=>{
  const f=fixture(),result=await f.prepare(),before=packet(f,result);
  assert.equal(f.accountCalls.length,15);assert.deepEqual(f.positions,[30,30]);assert.equal(f.keyCalls,1);assert.equal(f.addressCalls,2);
  const checked=await f.preparer.revalidateSignedOriginal(),after=packet(f,checked);
  assert.equal(checked.validationPurpose,'BEFORE_ORIGINAL_SIGNED_CUSTODY');assert.equal(checked.signing,'NOT_INVOKED');
  assert.equal(f.accountCalls.length,18);assert.deepEqual(f.positions,[36,36]);assert.equal(f.materialCalls,1);assert.equal(f.keyCalls,1);
  assert.equal(checked.accountBlock.hash,f.hash);assert.deepEqual(checked.accountBlock,result.accountBlock);
  assert.equal(after.pair.paymentSignatureHeader,before.pair.paymentSignatureHeader);
  assert.equal(after.serializedCheckpoint,before.serializedCheckpoint);assert.deepEqual(after.expectedPins,before.expectedPins);
  assert.equal(RESTORE(after.serializedCheckpoint,before.expectedPins).originalBytes.paymentPayload,before.pair.paymentSignatureHeader);
  assert.equal(before.signatureValidation,'NOT_PERFORMED');assert.equal(f.fetchCalls,0);
});
test('both allowed post-signer price advances retain original ACK nonce hash and signature',async()=>{
  const f=fixture({ages:[0,0,0,0,1,2]}),result=await f.prepare(),checked=await f.preparer.revalidateSignedOriginal();
  assert.deepEqual(checked.accountBlock,result.accountBlock);assert.equal(checked.accountBlock.momentumAcknowledged.height,100);
  assert.equal(checked.accountBlock.nonce,'0000000000000000');assert.equal(checked.accountBlock.hash,f.hash);assert.equal(f.keyCalls,1);
});
test('a fifth-cycle horizon expiry keeps signed DATA without another signer or material entry',async()=>{
  const f=fixture({ages:[0,0,0,0,3,3]});await assert.rejects(f.prepare(),error('operation_rejected'));
  assert.equal(f.keyCalls,1);assert.equal(f.materialCalls,1);assert.equal(f.options.wallet.inspect().phase,'SIGNED_DATA_RETURNED');
  assert.equal(retained(f).accountBlock.hash,f.hash);await assert.rejects(f.prepare());assert.equal(f.keyCalls,1);
});
test('sixth-cycle expiry refuses pre-custody validation while preserving the original encoded packet',async()=>{
  const f=fixture({ages:[0,0,0,0,0,3]}),result=await f.prepare(),before=packet(f,result);
  await assert.rejects(f.preparer.revalidateSignedOriginal(),error('signed_original_revalidation_unknown_or_refused'));
  assert.equal(retained(f).accountBlock.hash,f.hash);assert.equal(packet(f,result).serializedCheckpoint,before.serializedCheckpoint);
  await assert.rejects(f.preparer.revalidateSignedOriginal());assert.equal(f.keyCalls,1);assert.equal(f.materialCalls,1);assert.equal(f.fetchCalls,0);
});
test('a moved sixth-cycle account frontier refuses without rebuilding or resigning',async()=>{
  const f=fixture({movedSixth:true}),result=await f.prepare();await assert.rejects(f.preparer.revalidateSignedOriginal());
  assert.deepEqual(retained(f).accountBlock,result.accountBlock);assert.equal(f.keyCalls,1);assert.equal(f.materialCalls,1);
});
test('insufficient sixth-cycle balance refuses before a second material or key operation',async()=>{
  const f=fixture({insufficientSixth:true}),result=await f.prepare();await assert.rejects(f.preparer.revalidateSignedOriginal());
  assert.deepEqual(retained(f).accountBlock,result.accountBlock);assert.equal(f.keyCalls,1);assert.equal(f.materialCalls,1);
});
test('changed sixth-cycle runtime pricing parameters cannot refresh the original candidate',async()=>{
  const f=fixture({changedSixthRuntime:true}),result=await f.prepare();await assert.rejects(f.preparer.revalidateSignedOriginal());
  assert.deepEqual(retained(f).accountBlock,result.accountBlock);assert.equal(f.keyCalls,1);assert.equal(f.materialCalls,1);
});
test('a pending hash-only callback holds original ownership without fifth-cycle reads or reentry',async()=>{
  const f=fixture({deferKey:true}),pending=f.prepare();await f.keyReady.promise;
  assert.equal(f.accountCalls.length,12);assert.deepEqual(f.positions,[24,24]);assert.equal(f.options.wallet.inspect().phase,'SIGNING');
  await assert.rejects(f.prepare(),error('busy'));assert.equal(f.keyCalls,1);f.keyGate.resolve(f.signature);
  const result=await pending;assert.equal(result.accountBlock.hash,f.hash);assert.equal(f.accountCalls.length,15);
});
test('a pending sixth current read retains one original and refuses competing operations',async()=>{
  const f=fixture({deferSixth:true}),result=await f.prepare(),pending=f.preparer.revalidateSignedOriginal();await f.readReady.promise;
  assert.deepEqual(retained(f).accountBlock,result.accountBlock);assert.equal(f.accountCalls.length,16);
  await assert.rejects(f.prepare(),error('busy'));await assert.rejects(f.preparer.revalidateSignedOriginal(),error('busy'));
  f.releaseRead();const checked=await pending;assert.deepEqual(checked.accountBlock,result.accountBlock);assert.equal(f.keyCalls,1);
});
test('a mismatching borrowed owner address stops before any account quote material or signer work',async()=>{
  const f=fixture({wrongAddress:true});await assert.rejects(f.prepare(),error('operation_rejected'));
  assert.equal(f.accountCalls.length,0);assert.deepEqual(f.positions,[0,0]);assert.equal(f.materialCalls+f.keyCalls,0);
});
test('a rejected borrowed callback leaves the retained adapter original unknown without automatic retry',async()=>{
  const f=fixture({rejectKey:true});await assert.rejects(f.prepare(),error('operation_rejected'));
  const view=f.options.wallet.inspect();assert.equal(view.phase,'SIGNING_OUTCOME_UNKNOWN');assert.equal(view.originalUnsignedBlock.hash,f.hash);
  assert.equal(view.signedOriginal,null);assert.equal(f.accountCalls.length,12);await assert.rejects(f.prepare());assert.equal(f.keyCalls,1);
});
test('captured configuration detaches work bounds and public selection while retaining borrowed identities',()=>{
  const f=fixture(),selected=CAPTURE(f.configuration),publicKey=selected.materialOptions.publicKey;
  f.configuration.materialOptions.publicKey='changed';f.configuration.materialOptions.limits.maxAttempts=1;
  assert.equal(selected.materialOptions.publicKey,publicKey);assert.equal(selected.materialOptions.limits.maxAttempts,4096);
  assert.equal(selected.keyPair,f.keyPair);assert.equal(selected.readOptions,f.readOptions);assert.equal(selected.store,f.configuration.store);
  assert.equal(f.options.readOptions,f.readOptions);assert.equal(f.options.materialExchange,f.material);assert.ok(Object.isFrozen(f.options.wallet));
  assert.equal(f.accountCalls.length+f.materialCalls+f.keyCalls+f.addressCalls,0);
});
test('new and legacy configuration grammars stay distinct and reject extra factories or accessor callbacks',()=>{
  const f=fixture();let hooks=0;const hook=()=>{hooks++;throw Error('HOOK');};
  for(const extra of ['wallet','preparerFactory','storeWriter','materialExchange'])assert.throws(()=>CAPTURE({...f.configuration,[extra]:{}}));
  assert.throws(()=>CAPTURE({...f.configuration,materialOptions:{...f.configuration.materialOptions,limits:{maxAttempts:4097,maxDifficulty:0}}}));
  const config=Object.defineProperty({...f.configuration},'keyPair',{get:hook,enumerable:true});assert.throws(()=>CAPTURE(config));
  const keyPair=Object.defineProperty({sign:f.keyPair.sign},'getAddress',{get:hook});
  assert.throws(()=>OPTIONS({readOptions:f.readOptions,materialExchange:f.material,materialWaitMs:250,
    keyPair,expectedAddress:f.payer,expectedPublicKey:f.selected.materialOptions.publicKey}));
  const {keyPair:ignored,expectedAddress:unused,...old}=f.configuration;const legacy=LEGACY_CAPTURE({...old,wallet:f.options.wallet});
  assert.equal(legacy.wallet,f.options.wallet);assert.throws(()=>LEGACY_CAPTURE(f.configuration));assert.equal(hooks,0);
});
test('a material deadline cannot resume preparation or signer entry on late fulfillment',async()=>{
  const f=fixture({deferMaterial:true,waitMs:20}),pending=f.prepare();await f.materialReady.promise;
  await assert.rejects(pending,error('material_wait_unknown'));assert.equal(f.accountCalls.length,6);assert.equal(f.keyCalls,0);
  f.materialGate.resolve(f.materialData);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.keyCalls,0);assert.equal(f.materialCalls,1);assert.equal(f.accountCalls.length,6);
});
