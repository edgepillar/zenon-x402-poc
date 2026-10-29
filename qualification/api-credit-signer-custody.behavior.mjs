// Declared synchronous SDK-shaped method bytes and memory custody ports only.
// No private key, actual signature algorithm, SQLite, SDK package or socket.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { apiCreditRecoveryInspectionDataCases } from './api-credit-recovery-inspection.behavior.mjs';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { canonicalJson } from '../src/canonical.js';
import { computeZenonUnsignedUserSendHash } from '../src/zenon/transaction-planner.js';
import { createOriginalFundingSignerIntent as intent, decodeOriginalFundingSignerRecord as decode,
  inspectOriginalFundingSignerRecord as inspect, completeOriginalFundingSignerRecord as complete,
  requireOriginalFundingSignerRecordTransition as transition } from '../src/original-funding-signer-custody.js';
import { createSdk105CustodiedPreparedHashWalletOwner as create, createSdk105PreparedHashWalletOwner as legacy } from '../src/zenon/sdk105-prepared-hash-wallet-owner.js';

const F = Object.freeze, checks = [...apiCreditRecoveryInspectionDataCases];
function check(id, run) { checks.push({ id, run }); }
function data() {
  const f = retainedOriginalInputFixture(), unsigned = f.candidate.originalUnsignedBlock, signed = f.candidate.accountBlock;
  return { unsigned, signed, row: { paymentId: 'payment.original', originalDigest: 'sha256:' + '12'.repeat(32),
    network: f.input.plannerContext.readInput.accepted.network, asset: unsigned.tokenStandard, recipient: unsigned.toAddress,
    amount: unsigned.amount, reservedDay: 1, status: 'RESERVED', spentDay: null } };
}
function memory(options = {}) {
  const d = data(), r = { ...d, raw: null, epoch: 1, trace: [], begins: 0, retains: 0, options };
  r.port = (selectedEpoch = r.epoch) => F({
    beginSignerAttempt: F((paymentId, unsigned) => {
      r.begins++; r.trace.push('intent-entry'); if (options.beforeBegin) options.beforeBegin(r);
      if (selectedEpoch !== r.epoch || r.raw !== null || paymentId !== r.row.paymentId) throw Error('declared existing/stale intent');
      const raw = intent(r.row, unsigned); transition(null, raw, r.row); r.raw = raw; r.trace.push('intent-commit');
      if (options.beginLoss) throw Error('declared intent acknowledgement loss');
      if (options.afterBegin) options.afterBegin(r);
      if (options.wrongIntent) return canonicalJson({ ...JSON.parse(raw), paymentId: 'foreign' });
      return options.asyncBegin ? Promise.resolve(raw) : raw;
    }),
    retainSignerResult: F((paymentId, expected, signed) => {
      r.retains++; r.trace.push('result-entry');
      if (selectedEpoch !== r.epoch || r.raw !== expected || paymentId !== r.row.paymentId || options.retainBeforeCommit) throw Error('declared result refusal');
      const raw = complete(expected, signed, r.row); transition(expected, raw, r.row); r.raw = raw; r.trace.push('result-commit');
      if (options.resultLoss) throw Error('declared result acknowledgement loss');
      if (options.wrongResult) return canonicalJson({ ...JSON.parse(raw), signedBlockJson: canonicalJson({ ...signed, signature: Buffer.alloc(64, 9).toString('base64') }) });
      return raw;
    }),
  }); return r;
}
function wallet(store = memory(), options = {}) {
  const r = { store, calls: { address: 0, public: 0, sign: 0, clear: 0 }, bytes: Buffer.from(store.signed.signature, 'base64'), stop: null };
  r.key = { getPublicKey() { r.calls.public++; return Buffer.from(store.unsigned.publicKey, 'base64'); },
    getAddress() { r.calls.address++; return store.unsigned.address; },
    sign(hash) { r.calls.sign++; store.trace.push('sdk-method-entry'); assert.equal(hash.toString('hex'), store.unsigned.hash);
      if (options.onSign) options.onSign(r); if (options.signThrow) throw Error('declared sync method result loss');
      return options.signResult ? options.signResult(r) : r.bytes; },
    clear() { r.calls.clear++; store.trace.push('clear'); r.bytes.fill(0); } };
  r.configuration = { keyPair: r.key, expectedAddress: store.unsigned.address, expectedPublicKey: store.unsigned.publicKey };
  r.owner = options.legacy ? legacy(r.configuration) : create(r.configuration, { paymentId: store.row.paymentId, backend: store.port(options.epoch) });
  r.sign = () => r.owner.sign(store.unsigned); return r;
}
async function flush() { for (let i = 0; i < 24; i++) await Promise.resolve(); }
check('signer-custody-intent-binds-the-actual-original-reservation-and-exact-unsigned-hash', () => {
  const d = data(), raw = intent(d.row, d.unsigned), r = inspect(raw, d.row); assert.equal(r.phase, 'INTENT');
  assert.equal(r.unsignedBlockJson, canonicalJson(d.unsigned)); assert.equal(r.transactionHash, d.unsigned.hash);
  assert.equal(r.authority, 'NONE'); assert.equal(r.signatureValidation, 'NOT_PERFORMED'); assert.equal(r.signedBlockJson, null);
});
check('signer-custody-new-intent-is-refused-after-unknown-or-spent-reservation', () => {
  const d = data(); for (const status of ['UNKNOWN', 'SPENT']) assert.throws(() => intent({ ...d.row, status }, d.unsigned));
});
check('signer-custody-transfer-amount-recipient-and-asset-must-match-the-reservation', () => {
  const d = data(); for (const change of [{ amount: String(BigInt(d.row.amount) + 1n) }, { recipient: 'foreign' }, { asset: 'foreign' }]) assert.throws(() => intent({ ...d.row, ...change }, d.unsigned));
});
check('signer-custody-records-reject-noncanonical-or-expanded-wire-shapes', () => {
  const d = data(), raw = intent(d.row, d.unsigned);
  for (const text of [raw + '\n', ' ' + raw, canonicalJson({ ...JSON.parse(raw), authority: 'SIGN' }), 'null']) assert.throws(() => decode(text));
});
check('signer-custody-result-preserves-the-exact-original-public-signed-bytes', () => {
  const d = data(), raw = intent(d.row, d.unsigned), signed = complete(raw, d.signed, d.row);
  assert.equal(inspect(signed, d.row).signedBlockJson, canonicalJson(d.signed)); assert.equal(transition(raw, signed, d.row).phase, 'SIGNED');
});
check('signer-custody-changed-signed-fields-cannot-be-repaired-or-substituted', () => {
  const d = data(), raw = intent(d.row, d.unsigned);
  for (const change of [{ hash: '0'.repeat(64) }, { amount: '1' }, { previousHash: '0'.repeat(64) }, { publicKey: Buffer.alloc(32, 9).toString('base64') }]) assert.throws(() => complete(raw, { ...d.signed, ...change }, d.row));
});
check('signer-custody-signature-encoding-is-closed-without-claiming-authenticity', () => {
  const d = data(), raw = intent(d.row, d.unsigned);
  for (const signature of ['', 'x', d.signed.signature + '\n', Buffer.alloc(63).toString('base64')]) assert.throws(() => complete(raw, { ...d.signed, signature }, d.row));
});
check('signer-custody-transition-cannot-reset-replace-delete-or-repeat-a-result', () => {
  const d = data(), raw = intent(d.row, d.unsigned), signed = complete(raw, d.signed, d.row);
  for (const pair of [[raw, raw], [signed, raw], [signed, signed], [raw, null]]) assert.throws(() => transition(...pair, d.row));
  const b = { ...d.unsigned, height: d.unsigned.height + 1 }; b.hash = computeZenonUnsignedUserSendHash(b);
  const other = intent(d.row, b), otherSigned = complete(other, { ...b, signature: d.signed.signature }, d.row); assert.throws(() => transition(raw, otherSigned, d.row));
});
check('signer-custody-history-remains-powerless-under-unknown-and-spent', () => {
  const d = data(), raw = intent(d.row, d.unsigned), signed = complete(raw, d.signed, { ...d.row, status: 'UNKNOWN' });
  for (const status of ['UNKNOWN', 'SPENT']) { const r = inspect(signed, { ...d.row, status }); assert.equal(r.authority, 'NONE'); assert.equal(r.signedBlockJson, canonicalJson(d.signed)); }
  assert.throws(() => inspect(raw, { ...d.row, status: 'SPENT' }));
});
check('signer-custody-input-accessors-and-proxies-are-refused-before-user-code', () => {
  const d = data(); let entered = 0; const r = { ...d.row }; Object.defineProperty(r, 'paymentId', { enumerable: true, get() { entered++; return d.row.paymentId; } });
  assert.throws(() => intent(r, d.unsigned)); assert.throws(() => intent(new Proxy(d.row, { ownKeys() { entered++; return []; } }), d.unsigned)); assert.equal(entered, 0);
});
check('custodied-wallet-construction-enters-no-key-or-custody-method', async () => {
  const r = wallet(); assert.equal(Object.values(r.calls).reduce((a, b) => a + b, 0), 0); assert.equal(r.store.begins, 0); assert.equal(r.store.retains, 0); await r.owner.close();
});
check('custodied-wallet-commits-intent-before-sdk-and-result-before-acknowledgement', async () => {
  const r = wallet(), signed = await r.sign(); r.store.trace.push('caller-ack');
  assert.deepEqual(r.store.trace, ['intent-entry','intent-commit','sdk-method-entry','result-entry','result-commit','caller-ack']);
  assert.equal(decode(r.store.raw).signedBlockJson, canonicalJson(signed)); assert.equal(r.calls.sign, 1); await r.owner.close();
});
check('custodied-wallet-lost-intent-acknowledgement-never-enters-the-sdk', async () => {
  const r = wallet(memory({ beginLoss: true })); await assert.rejects(r.sign()); assert.equal(r.calls.sign, 0); assert.equal(decode(r.store.raw).phase, 'INTENT');
  assert.equal(r.owner.inspect().held, true); await assert.rejects(r.owner.close()); assert.equal(r.calls.clear, 0);
});
check('custodied-wallet-recreated-owner-cannot-sign-an-existing-intent', async () => {
  const s = memory({ beginLoss: true }), first = wallet(s); await assert.rejects(first.sign()); s.options.beginLoss = false;
  const second = wallet(s); await assert.rejects(second.sign()); assert.equal(first.calls.sign + second.calls.sign, 0); assert.equal(decode(s.raw).phase, 'INTENT');
});
check('custodied-wallet-result-commit-with-lost-ack-keeps-exact-signed-bytes', async () => {
  const r = wallet(memory({ resultLoss: true })); await assert.rejects(r.sign()); const raw = r.store.raw;
  assert.equal(decode(raw).signedBlockJson, canonicalJson(r.store.signed)); assert.equal(r.calls.sign, 1); assert.equal(r.owner.inspect().held, true);
  const second = wallet(r.store); await assert.rejects(second.sign()); assert.equal(second.calls.sign, 0); assert.equal(r.store.raw, raw);
});
check('custodied-wallet-discarded-caller-reply-does-not-lose-or-reauthorize-the-record', async () => {
  const r = wallet(); await r.sign().then(() => undefined); const retained = r.store.raw; await r.owner.close();
  assert.equal(decode(retained).signedBlockJson, canonicalJson(r.store.signed)); const second = wallet(r.store); await assert.rejects(second.sign()); assert.equal(second.calls.sign, 0);
});
check('custodied-wallet-result-refused-before-commit-retains-intent-and-volatile-original', async () => {
  const r = wallet(memory({ retainBeforeCommit: true })); await assert.rejects(r.sign()); assert.equal(decode(r.store.raw).phase, 'INTENT');
  assert.equal(canonicalJson(r.owner.inspect().wallet.signedOriginal), canonicalJson(r.store.signed)); assert.equal(r.owner.inspect().held, true); assert.equal(r.store.retains, 1);
});
check('custodied-wallet-async-intent-receipt-cannot-enter-sdk-or-upgrade-on-late-settlement', async () => {
  const r = wallet(memory({ asyncBegin: true })); await assert.rejects(r.sign()); await flush(); assert.equal(r.calls.sign, 0); assert.equal(r.owner.inspect().held, true);
});
check('custodied-wallet-wrong-intent-identity-is-refused-before-sdk-entry', async () => {
  const r = wallet(memory({ wrongIntent: true })); await assert.rejects(r.sign()); assert.equal(r.calls.sign, 0); assert.equal(r.store.retains, 0);
});
check('custodied-wallet-different-returned-signed-receipt-cannot-escape-as-candidate', async () => {
  const r = wallet(memory({ wrongResult: true })); await assert.rejects(r.sign()); assert.equal(r.calls.sign, 1); assert.equal(r.owner.inspect().held, true);
  assert.equal(decode(r.store.raw).signedBlockJson, canonicalJson(r.store.signed)); await assert.rejects(r.sign()); assert.equal(r.calls.sign, 1);
});
check('custodied-wallet-sdk-method-throw-retains-intent-and-unknown-key-ownership', async () => {
  const r = wallet(memory(), { signThrow: true }); await assert.rejects(r.sign()); assert.equal(r.calls.sign, 1); assert.equal(decode(r.store.raw).phase, 'INTENT');
  await assert.rejects(r.owner.close()); assert.equal(r.calls.clear, 0); assert.equal(r.owner.inspect().signingOutcome, 'UNKNOWN');
});
check('custodied-wallet-unsupported-async-sdk-result-never-becomes-a-retained-signature', async () => {
  let resolve; const late = new Promise(r => { resolve = r; }), r = wallet(memory(), { signResult: () => late });
  await assert.rejects(r.sign()); resolve(r.bytes); await flush(); assert.equal(r.store.retains, 0); assert.equal(decode(r.store.raw).phase, 'INTENT'); assert.equal(r.owner.inspect().held, true);
});
check('custodied-wallet-close-during-intent-port-blocks-a-not-yet-entered-sdk', async () => {
  let r; const s = memory({ afterBegin: () => { r.stop = r.owner.close(); r.stop.catch(() => {}); } }); r = wallet(s);
  await assert.rejects(r.sign()); await assert.rejects(r.stop); assert.equal(r.calls.sign, 0); assert.equal(decode(s.raw).phase, 'INTENT');
});
check('custodied-wallet-close-after-sdk-retains-exact-bytes-but-rejects-the-candidate', async () => {
  const r = wallet(memory(), { onSign: r => { queueMicrotask(() => { r.stop = r.owner.close(); r.stop.catch(() => {}); }); } });
  await assert.rejects(r.sign()); await r.stop; assert.equal(r.calls.clear, 1); assert.equal(decode(r.store.raw).signedBlockJson, canonicalJson(r.store.signed));
  assert.equal(r.owner.inspect().signerCustody.resultReturned, true); await assert.rejects(r.sign()); assert.equal(r.calls.sign, 1);
});
check('custodied-wallet-declared-stale-owner-loses-before-sign-or-result-write', async () => {
  const before = wallet(memory({ beforeBegin: s => { s.epoch++; } })); await assert.rejects(before.sign()); assert.equal(before.calls.sign, 0);
  const after = wallet(memory(), { onSign: r => { r.store.epoch++; } }); await assert.rejects(after.sign()); assert.equal(after.calls.sign, 1); assert.equal(decode(after.store.raw).phase, 'INTENT');
  const next = wallet(after.store); await assert.rejects(next.sign()); assert.equal(next.calls.sign, 0);
});
check('custodied-wallet-two-declared-live-owners-share-one-intent-admission', async () => {
  const store = memory(), a = wallet(store), b = wallet(store); const results = await Promise.allSettled([a.sign(), b.sign()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(a.calls.sign + b.calls.sign, 1); assert.equal(decode(store.raw).phase, 'SIGNED'); await a.owner.close();
});
check('legacy-wallet-owner-retains-its-original-noncustodied-contract', async () => {
  const r = wallet(memory(), { legacy: true }); const signed = await r.sign(); assert.equal(signed.hash, r.store.unsigned.hash);
  assert.equal(r.store.begins, 0); assert.equal(r.store.retains, 0); assert.equal(Object.hasOwn(r.owner.inspect(), 'signerCustody'), false); await r.owner.close();
});

export const apiCreditSignerCustodyDataCases = F([...checks]);
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
const cases = [];
for (const { id, run } of checks) { try { await run(); cases.push({ id, status: 'PASS' }); } catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); } }
await closeApiCreditOperatorDataFixtures(); const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'G2_SIGNER_RESULT_CUSTODY_DATA', passed: cases.length - failed, failed, cases, priorCases: apiCreditRecoveryInspectionDataCases.length,
  declaredMethodAndMemoryPortsOnly: true, nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
  actualSignerResponseLoss: 'NOT_ESTABLISHED', nativeDurability: 'NOT_ESTABLISHED', freshProcess: 'NOT_ESTABLISHED', fullG2: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;
}
