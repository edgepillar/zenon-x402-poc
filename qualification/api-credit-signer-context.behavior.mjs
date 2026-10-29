// Exact DATA/declared synchronous methods and memory stores only. Signature
// shaped fixture bytes are deliberately invalid; no signing algorithm is run.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { apiCreditSignerCustodyDataCases } from './api-credit-signer-custody.behavior.mjs';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { canonicalJson } from '../src/canonical.js';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as assemble } from '../src/zenon/dynamic-plasma-original-funding-data.js';
import { createOriginalFundingSignerIntent as oldIntent } from '../src/original-funding-signer-custody.js';
import { captureOriginalFundingSignerPreparation as prepare, captureOriginalFundingSignerPreSignContext as capture,
  createOriginalFundingSignerContextIntent as intent, decodeOriginalFundingSignerContextRecord as decode,
  completeOriginalFundingSignerContextRecord as complete, projectOriginalFundingSignerContextRecord as project } from '../src/original-funding-signer-context-custody.js';
import { bindWalletOriginalFundingPreparation as bindPreparation, bindWalletOriginalFundingPreSignContext as bindPreSign } from '../src/zenon/original-funding-signer-context-bridge.js';
import { createSdk105CustodiedPreparedHashWalletOwner as create } from '../src/zenon/sdk105-prepared-hash-wallet-owner.js';
import { bindSdk105SingleOriginalFundingSpending as bindSpending } from '../src/zenon/sdk105-spending-bounded-client.js';

const F = Object.freeze, checks = [...apiCreditSignerCustodyDataCases];
function check(id, run) { checks.push({ id, run }); }
function data() {
  const f = retainedOriginalInputFixture(), unsigned = f.candidate.originalUnsignedBlock, signed = f.candidate.accountBlock, prepared = prepare(f.input, f.resourceUrl);
  const subject = { subjectVersion: 1 }; for (const name of ['version','chainIdentifier','blockType','previousHash','height','momentumAcknowledged','address','toAddress','amount','tokenStandard','fromBlockHash','data']) subject[name] = unsigned[name];
  // Declared quote metadata only. The custody codec does NOT qualify a price.
  const plan = { observedUserSendPlanVersion: 1, subject, quote: { declaredQuoteVersion: 1, label: 'fixed-original-data' } };
  const handoffData = { originalUnsignedBlock: unsigned, originalPlan: plan,
    preSignCheckpointJson: canonicalJson({ accountBlock: unsigned, checkpointVersion: 1, phase: 'UNSIGNED', quote: plan.quote }) };
  return { f, unsigned, signed, prepared, plan, handoffData, context: capture(prepared, handoffData), row: { paymentId: 'payment.original', originalDigest: prepared.originalDigest,
    network: f.input.plannerContext.readInput.accepted.network, asset: unsigned.tokenStandard, recipient: unsigned.toAddress, amount: unsigned.amount, reservedDay: 1, status: 'RESERVED', spentDay: null } };
}
function memory(options = {}) {
  const d = data(), r = { ...d, raw: null, trace: [], beginCalls: 0, retainCalls: 0, options };
  r.backend = F({ requirePreparationContext: true,
    beginSignerAttempt: F((id, block, context) => { r.trace.push('intent-entry'); r.beginCalls++; if (id !== r.row.paymentId || r.raw !== null) throw Error('declared repeated attempt');
      const raw = intent(r.row, block, context); r.raw = raw; r.trace.push('intent-commit'); if (options.intentLoss) throw Error('declared intent reply loss');
      if (options.oldReply) return oldIntent(r.row, block);
      if (options.swappedContext) { const h = JSON.parse(canonicalJson(d.handoffData)); h.originalPlan.quote.label = 'coherent-different-context'; h.preSignCheckpointJson = canonicalJson({ ...JSON.parse(h.preSignCheckpointJson), quote: h.originalPlan.quote }); return intent(r.row, block, capture(d.prepared, h)); }
      return raw; }),
    retainSignerResult: F((id, expected, signed) => { r.retainCalls++; r.trace.push('result-entry'); if (id !== r.row.paymentId || expected !== r.raw || options.beforeResult) throw Error('declared result refusal');
      r.raw = complete(expected, signed, r.row); r.trace.push('result-commit'); if (options.resultLoss) throw Error('declared result reply loss'); return r.raw; }),
  }); return r;
}
function wallet(store = memory(), options = {}) {
  const r = { store, keyCalls: 0, signCalls: 0, clearCalls: 0, snapshotCalls: 0, stop: null, bytes: Buffer.from(store.signed.signature, 'base64') };
  r.key = { getPublicKey() { r.keyCalls++; return Buffer.from(store.unsigned.publicKey, 'base64'); }, getAddress() { r.keyCalls++; return store.unsigned.address; },
    sign(hash) { r.signCalls++; store.trace.push('sdk-entry'); assert.equal(hash.toString('hex'), store.unsigned.hash); if (options.onSign) options.onSign(r); return r.bytes; }, clear() { r.clearCalls++; r.bytes.fill(0); } };
  r.owner = create({ keyPair: r.key, expectedAddress: store.unsigned.address, expectedPublicKey: store.unsigned.publicKey }, { paymentId: store.row.paymentId, backend: store.backend });
  const snapshot = Object.create(null); Object.assign(snapshot, { originalPlan: store.plan, preSignCheckpointJson: store.handoffData.preSignCheckpointJson }); F(snapshot);
  r.handoff = F({ originalUnsignedBlock: store.unsigned, getSignedOriginalData: F(() => { r.snapshotCalls++; store.trace.push('pre-sign-snapshot'); return snapshot; }) });
  r.bindPreparation = () => { store.trace.push('preparation-bind'); bindPreparation(r.owner, store.f.input, store.f.resourceUrl); };
  r.bindPreSign = () => bindPreSign(r.owner, r.handoff);
  r.admit = () => { r.bindPreparation(); r.bindPreSign(); };
  r.sign = () => r.owner.sign(store.unsigned); return r;
}
check('signer-context-preparation-retains-exact-detached-input-and-reservation-digest', () => {
  const d = data(); assert.equal(JSON.parse(d.prepared.preparationInputJson).plannerContext.readInput.payerAddress, d.unsigned.address);
  d.f.input.plannerContext.readInput.payerAddress = 'changed-after-capture'; assert.equal(JSON.parse(d.prepared.preparationInputJson).plannerContext.readInput.payerAddress, d.unsigned.address);
  assert.ok(Object.isFrozen(d.prepared)); assert.equal(d.prepared.originalDigest, d.row.originalDigest); assert.equal(prepare(JSON.parse(d.prepared.preparationInputJson), d.f.resourceUrl).preparationInputJson, d.prepared.preparationInputJson);
});
check('signer-context-preparation-refuses-foreign-route-body-and-extra-fields', () => {
  const d = data(); assert.throws(() => prepare(d.f.input, 'https://foreign.invalid/other'));
  assert.throws(() => prepare({ ...d.f.input, module: 'unselected' }, d.f.resourceUrl));
  const changed = JSON.parse(JSON.stringify(d.f.input)); changed.originalRequest.requestBodyBase64 = 'eA=='; assert.throws(() => prepare(changed, d.f.resourceUrl));
});
check('signer-context-captures-exact-plan-checkpoint-and-unsigned-block-before-sign', () => {
  const d = data(), h = JSON.parse(d.context.preSignContextJson); assert.equal(h.preSignCheckpointJson, d.handoffData.preSignCheckpointJson);
  assert.equal(canonicalJson(h.originalPlan), canonicalJson(d.plan)); assert.equal(canonicalJson(h.originalUnsignedBlock), canonicalJson(d.unsigned));
});
check('signer-context-checkpoint-quote-cannot-diverge-from-the-original-plan', () => {
  const d = data(), cp = JSON.parse(d.handoffData.preSignCheckpointJson); cp.quote.label = 'different';
  assert.throws(() => capture(d.prepared, { ...d.handoffData, preSignCheckpointJson: canonicalJson(cp) }));
});
check('signer-context-checkpoint-refuses-noncanonical-or-different-block-bytes', () => {
  const d = data(); assert.throws(() => capture(d.prepared, { ...d.handoffData, preSignCheckpointJson: d.handoffData.preSignCheckpointJson + '\n' }));
  const cp = JSON.parse(d.handoffData.preSignCheckpointJson); cp.accountBlock.hash = '0'.repeat(64); assert.throws(() => capture(d.prepared, { ...d.handoffData, preSignCheckpointJson: canonicalJson(cp) }));
});
check('signer-context-original-subject-remains-bound-to-selected-funding-terms', () => {
  const d = data(), plan = JSON.parse(canonicalJson(d.plan)); plan.subject.amount = String(BigInt(plan.subject.amount) + 1n); assert.throws(() => capture(d.prepared, { ...d.handoffData, originalPlan: plan }));
});
check('signer-context-never-feeds-a-signed-block-into-pre-sign-capture', () => {
  const d = data(); assert.throws(() => capture(d.prepared, { ...d.handoffData, originalUnsignedBlock: d.signed }));
});
check('signer-context-intent-atomically-carries-the-full-input-and-pre-sign-text', () => {
  const d = data(), r = decode(intent(d.row, d.unsigned, d.context)); assert.equal(r.signerCustodyVersion, 2);
  assert.equal(r.preparationInputJson, d.prepared.preparationInputJson); assert.equal(r.preSignContextJson, d.context.preSignContextJson); assert.equal(r.authority, 'NONE');
});
check('signer-context-current-profile-cannot-adopt-the-older-incomplete-record', () => {
  const d = data(); assert.throws(() => decode(oldIntent(d.row, d.unsigned))); assert.throws(() => decode(canonicalJson({ ...JSON.parse(intent(d.row, d.unsigned, d.context)), signerCustodyVersion: 1 })));
});
check('signer-context-input-digest-must-match-the-durable-reservation', () => {
  const d = data(); assert.throws(() => intent({ ...d.row, originalDigest: 'sha256:' + 'ff'.repeat(32) }, d.unsigned, d.context));
});
check('signer-context-result-cannot-replace-the-captured-plan-or-checkpoint', () => {
  const d = data(), raw = intent(d.row, d.unsigned, d.context), signed = decode(complete(raw, d.signed, d.row));
  assert.equal(signed.preparationInputJson, d.prepared.preparationInputJson); assert.equal(signed.preSignContextJson, d.context.preSignContextJson); assert.equal(signed.signedBlockJson, canonicalJson(d.signed));
});
check('signer-context-projects-the-exact-original-funding-wire-data-without-signing', () => {
  const d = data(), raw = complete(intent(d.row, d.unsigned, d.context), d.signed, d.row), result = project(raw, { paymentId: d.row.paymentId, originalDigest: d.row.originalDigest });
  const reference = assemble(d.f.input, d.f.candidate, d.f.resourceUrl); assert.equal(result.packet.serializedCheckpoint, reference.serializedCheckpoint);
  assert.deepEqual(result.packet.expectedPins, reference.expectedPins); assert.equal(result.maySignPayment, false); assert.equal(result.mayDispatchFunding, false); assert.equal(result.authority, 'NONE');
});
check('signer-context-projection-requires-independent-id-digest-and-signed-history', () => {
  const d = data(), raw = intent(d.row, d.unsigned, d.context); assert.throws(() => project(raw, { paymentId: d.row.paymentId, originalDigest: d.row.originalDigest }));
  const signed = complete(raw, d.signed, d.row); for (const pin of [{ paymentId: 'foreign', originalDigest: d.row.originalDigest }, { paymentId: d.row.paymentId, originalDigest: 'sha256:' + '00'.repeat(32) }]) assert.throws(() => project(signed, pin));
});
check('signer-context-projection-exposes-no-store-wallet-or-transport-operation', () => {
  const d = data(), raw = complete(intent(d.row, d.unsigned, d.context), d.signed, d.row), result = project(raw, { paymentId: d.row.paymentId, originalDigest: d.row.originalDigest });
  assert.equal(result.signatureValidation, 'NOT_PERFORMED'); assert.equal(result.currentAuthority, 'NOT_ESTABLISHED'); assert.equal(result.mayDispatchService, false);
  for (const value of Object.values(result)) assert.notEqual(typeof value, 'function');
});
check('signer-context-plan-getters-and-proxies-are-not-entered', () => {
  const d = data(); let count = 0; const plan = { ...d.plan }; Object.defineProperty(plan, 'quote', { enumerable: true, get() { count++; return d.plan.quote; } });
  assert.throws(() => capture(d.prepared, { ...d.handoffData, originalPlan: plan })); assert.throws(() => capture(d.prepared, { ...d.handoffData, originalPlan: new Proxy(d.plan, { ownKeys() { count++; return []; } }) })); assert.equal(count, 0);
});
check('signer-context-legacy-wallet-bridge-does-not-observe-a-handoff', () => {
  let calls = 0; const legacy = F({}); bindPreparation(legacy, null, null); bindPreSign(legacy, new Proxy({}, { get() { calls++; throw Error('must not inspect'); } })); assert.equal(calls, 0);
});
check('signer-context-bridge-captures-one-actual-snapshot-before-sdk-entry', async () => {
  const r = wallet(); r.admit(); const signed = await r.sign(); assert.equal(r.snapshotCalls, 1); assert.equal(signed.hash, r.store.unsigned.hash);
  assert.deepEqual(r.store.trace, ['preparation-bind','pre-sign-snapshot','intent-entry','intent-commit','sdk-entry','result-entry','result-commit']); await r.owner.close();
});
check('signer-context-nonvoid-or-async-binding-receipts-are-never-awaited', async () => {
  for (const value of [true, Promise.reject(Error('declared async receipt'))]) {
    const w = F({ bindOriginalPreparation: F(() => value) }); assert.throws(() => bindPreparation(w, null, null));
  } await Promise.resolve();
});
check('signer-context-foreign-snapshot-then-getter-is-never-entered', () => {
  let count = 0; const fake = {}; Object.defineProperty(fake, 'then', { get() { count++; throw Error('do not assimilate'); } }); F(fake);
  const w = F({ bindOriginalPreSignContext: F(() => {}) }), h = F({ originalUnsignedBlock: F({}), getSignedOriginalData: F(() => fake) });
  assert.throws(() => bindPreSign(w, h)); assert.equal(count, 0);
});
check('signer-context-wallet-refuses-sdk-entry-until-both-context-bindings-exist', async () => {
  for (const stage of ['none','preparation']) { const r = wallet(); if (stage === 'preparation') r.bindPreparation(); await assert.rejects(r.sign()); assert.equal(r.signCalls, 0); assert.equal(r.store.beginCalls, 0); }
});
check('signer-context-wallet-never-rebinds-or-uses-history-for-a-second-attempt', async () => {
  const r = wallet(); r.admit(); assert.throws(() => r.bindPreparation()); assert.throws(() => r.bindPreSign()); await r.sign();
  assert.throws(() => r.bindPreparation()); await assert.rejects(r.sign()); assert.equal(r.signCalls, 1); await r.owner.close();
});
check('signer-context-wallet-success-retains-all-original-capsule-bytes', async () => {
  const r = wallet(); r.admit(); const signed = await r.sign(), saved = decode(r.store.raw);
  assert.equal(saved.signedBlockJson, canonicalJson(signed)); assert.equal(saved.preSignContextJson, r.store.context.preSignContextJson); assert.equal(saved.preparationInputJson, r.store.prepared.preparationInputJson); await r.owner.close();
});
check('signer-context-lost-intent-reply-retains-full-context-without-sdk-entry', async () => {
  const r = wallet(memory({ intentLoss: true })); r.admit(); await assert.rejects(r.sign()); assert.equal(r.signCalls, 0);
  const record = decode(r.store.raw); assert.equal(record.phase, 'INTENT'); assert.equal(record.preparationInputJson, r.store.prepared.preparationInputJson); assert.equal(r.owner.inspect().held, true);
});
check('signer-context-lost-result-reply-still-projects-the-same-original-packet', async () => {
  const r = wallet(memory({ resultLoss: true })); r.admit(); await assert.rejects(r.sign()); assert.equal(r.signCalls, 1);
  const result = project(r.store.raw, { paymentId: r.store.row.paymentId, originalDigest: r.store.row.originalDigest }); assert.equal(result.packet.serializedCheckpoint, assemble(r.store.f.input, r.store.f.candidate, r.store.f.resourceUrl).serializedCheckpoint);
  assert.equal(r.owner.inspect().held, true); assert.equal(result.mayDispatchFunding, false);
});
check('signer-context-result-write-refusal-keeps-intent-and-original-volatile-signature', async () => {
  const r = wallet(memory({ beforeResult: true })); r.admit(); await assert.rejects(r.sign()); assert.equal(decode(r.store.raw).phase, 'INTENT');
  assert.equal(canonicalJson(r.owner.inspect().wallet.signedOriginal), canonicalJson(r.store.signed)); assert.equal(r.owner.inspect().held, true);
});
check('signer-context-recreated-owner-cannot-resign-existing-signed-history', async () => {
  const s = memory(), first = wallet(s); first.admit(); await first.sign(); await first.owner.close(); const retained = s.raw;
  const second = wallet(s); second.admit(); await assert.rejects(second.sign()); assert.equal(second.signCalls, 0); assert.equal(s.raw, retained);
});
check('signer-context-close-after-sdk-keeps-context-and-rejects-new-candidate', async () => {
  const r = wallet(memory(), { onSign: r => queueMicrotask(() => { r.stop = r.owner.close(); r.stop.catch(() => {}); }) }); r.admit();
  await assert.rejects(r.sign()); await r.stop; assert.equal(r.clearCalls, 1); assert.equal(decode(r.store.raw).preSignContextJson, r.store.context.preSignContextJson);
  assert.equal(r.owner.inspect().signerCustody.resultReturned, true);
});
check('signer-context-wallet-never-falls-back-to-an-older-port-reply', async () => {
  const r = wallet(memory({ oldReply: true })); r.admit(); await assert.rejects(r.sign()); assert.equal(r.signCalls, 0); assert.equal(r.owner.inspect().held, true);
});
check('signer-context-wallet-refuses-coherent-but-different-pre-sign-context', async () => {
  const r = wallet(memory({ swappedContext: true })); r.admit(); await assert.rejects(r.sign()); assert.equal(r.signCalls, 0); assert.equal(r.owner.inspect().held, true);
});
check('signer-context-inspection-exposes-only-binding-and-custody-facts', async () => {
  const r = wallet(); r.admit(); await r.sign(); const v = r.owner.inspect().signerCustody;
  assert.equal(v.contextRequired, true); assert.equal(v.preparationBound, true); assert.equal(v.preSignContextBound, true); assert.equal(v.authority, 'NONE');
  assert.equal(Object.hasOwn(v, 'preparationInputJson'), false); assert.equal(Object.hasOwn(v, 'preSignContextJson'), false); await r.owner.close();
});
check('signer-context-capability-marker-cannot-be-a-getter-or-false-downgrade', () => {
  const d = data(); let entered = 0; for (const version of ['getter','false']) {
    const backend = { beginSignerAttempt: F(() => {}), retainSignerResult: F(() => {}) };
    if (version === 'getter') Object.defineProperty(backend, 'requirePreparationContext', { enumerable: true, get() { entered++; return true; } }); else backend.requirePreparationContext = false; F(backend);
    const keyPair = { getPublicKey() { entered++; return Buffer.from(d.unsigned.publicKey, 'base64'); }, getAddress() { entered++; return d.unsigned.address; },
      sign() { entered++; return Buffer.from(d.signed.signature, 'base64'); }, clear() { entered++; } };
    assert.throws(() => create({ keyPair, expectedAddress: d.unsigned.address, expectedPublicKey: d.unsigned.publicKey }, { paymentId: d.row.paymentId, backend }));
  } assert.equal(entered, 0);
});
check('signer-context-input-digest-matches-the-actual-application-reservation-codec', async () => {
  const d = data(); let raw = null, entered = 0;
  const backend = { load() { return raw; }, compareAndSwap(account, expected, proposed) { assert.equal(expected, raw); raw = proposed; return proposed; } };
  const prepareChild = F(input => { entered++; const row = JSON.parse(raw).reservations[0], captured = prepare(input, d.f.resourceUrl);
    assert.equal(row.originalDigest, captured.originalDigest); assert.equal(decode(intent(row, d.unsigned, capture(captured, d.handoffData))).originalDigest, row.originalDigest); return Promise.resolve(F({ captured: true })); });
  const client = F({ prepareOriginalFunding: prepareChild, commitOriginalFunding: F(() => Promise.resolve()), submitOriginalFunding: F(() => Promise.resolve()),
    handoffToService: F(() => Promise.resolve()), submitOriginal: F(() => Promise.resolve()), inspect: F(() => F({ held: false, lifecycle: 'OPEN' })), close: F(() => Promise.resolve(undefined)) });
  const policy = { version: 1, policyId: 'synthetic.policy', accountId: d.unsigned.address, network: d.row.network, asset: d.row.asset, recipients: [d.row.recipient],
    maxPayment: d.row.amount, maxTotal: d.row.amount, maxDaily: d.row.amount, maxRecords: 4 };
  const gate = bindSpending(client, d.f.resourceUrl, { policy, backend, paymentId: d.row.paymentId, readDay: F(() => 1) });
  await gate.prepareOriginalFunding(d.f.input); assert.equal(entered, 1); await gate.close(); assert.equal(JSON.parse(raw).reservations[0].status, 'RESERVED');
});

export const apiCreditSignerContextDataCases = F([...checks]);
export const signerContextDataFixture = data;
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
const cases = [];
for (const { id, run } of checks) { try { await run(); cases.push({ id, status: 'PASS' }); } catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); } }
await closeApiCreditOperatorDataFixtures(); const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'G2_ORIGINAL_SIGNER_CONTEXT_DATA', passed: cases.length - failed, failed, cases, priorCases: apiCreditSignerCustodyDataCases.length,
  declaredMethodAndMemoryPortsOnly: true, nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
  nativeReopen: 'NOT_ESTABLISHED', signerLossAcceptance: 'NOT_ESTABLISHED', Linux: 'NOT_ESTABLISHED', fullG2: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;
}
