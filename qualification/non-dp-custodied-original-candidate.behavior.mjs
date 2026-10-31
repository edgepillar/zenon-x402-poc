// Actual source owner/codecs over declared memory ports. Fixed public bytes
// and invalid signature-shaped bytes; no SDK package or signing algorithm.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { nonDpReadDataFixture, nonDpObservedUserSendReadDataCases } from './non-dp-observed-user-send-read.behavior.mjs';
import { createNonDpCustodiedOriginalCandidate as create } from '../src/zenon/non-dp-custodied-original-candidate.js';
import { createSdk105AgeBoundSignerContextWalletOwner as owner } from '../src/zenon/sdk105-prepared-hash-wallet-owner.js';
import { captureOriginalFundingSignerPreparation as preparation, createOriginalFundingSignerContextIntent as intent,
  completeOriginalFundingSignerContextRecord as complete, decodeOriginalFundingSignerContextRecord as decode,
  projectOriginalFundingSignerContextRecord as project } from '../src/original-funding-signer-context-custody.js';
import { encodeB64Json } from '../src/x402-wire.js';
import { canonicalJson } from '../src/canonical.js';

const F = Object.freeze, copy = x => JSON.parse(JSON.stringify(x)), checks = [...nonDpObservedUserSendReadDataCases];
const traces = [], QUOTE = 'embedded.plasma.getRequiredPoWForAccountBlock', ACCOUNT = 'ledger.getFrontierAccountBlock';
function address(publicBytes) {
  const core = [0, ...createHash('sha3-256').update(publicBytes).digest().subarray(0, 19)];
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', words = []; let accumulator = 0, bits = 0, checksum = 1;
  for (const value of core) { accumulator = (accumulator << 8) | value; bits += 8;
    while (bits >= 5) { bits -= 5; words.push((accumulator >>> bits) & 31); } }
  for (const word of [3, 0, 26, ...words, 0, 0, 0, 0, 0, 0]) { const top = checksum >>> 25; checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [i, g] of [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3].entries()) if ((top >>> i) & 1) checksum ^= g; }
  checksum = (checksum ^ 1) >>> 0;
  return 'z1' + words.map(w => alphabet[w]).join('') + Array.from({ length: 6 }, (_, i) => alphabet[(checksum >>> (5 * (5 - i))) & 31]).join('');
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture(options = {}) {
  const base = nonDpReadDataFixture(), c = base.c, publicBytes = Buffer.alloc(32, 9);
  c.payerAddress = address(publicBytes); c.paymentRequired.resource.url = 'https://resource.invalid/funding';
  const r = { trace: [], raw: null, signCalls: 0, clearCalls: 0, keyCalls: 0, current: true, now: 0n, options };
  const f = nonDpReadDataFixture({ input: c, endpoint: options.endpoint, account: options.account,
    accountPending: options.accountPending, guard(count) { if (!r.current) throw Error('declared owner revoked'); if (options.guard) options.guard(count, r); } });
  const readInput = { observedUserSendReadVersion: 3, phase: c.phase, paymentRequired: c.paymentRequired, accepted: c.accepted,
    payerAddress: c.payerAddress, compiledSporkIds: c.compiledSporkIds, policy: c.policy, runtimeContextDigest: c.runtimeContextDigest };
  const input = { plannerContext: { plannerContextVersion: 7, readInput }, challenge: { status: 'PAYMENT_REQUIRED', resourceUrl: c.paymentRequired.resource.url,
    paymentRequiredHeader: encodeB64Json(c.paymentRequired), paymentRequired: c.paymentRequired },
    originalRequest: { requestId: 'request.original.non-dp', contextId: 'context.original.non-dp', requestBodyBase64: '', contextBase64: Buffer.from('declared-original-context').toString('base64') } };
  const prepared = preparation(input, c.paymentRequired.resource.url);
  r.row = { paymentId: 'payment.original.non-dp', originalDigest: prepared.originalDigest, network: c.accepted.network,
    asset: c.accepted.asset, recipient: c.accepted.payTo, amount: c.accepted.amount, reservedDay: 1, status: 'RESERVED', spentDay: null };
  const backend = F({ requirePreparationContext: true,
    beginSignerAttempt: F((id, block, context) => {
      r.trace.push('intent-entry'); assert.equal(id, r.row.paymentId); assert.equal(r.raw, null);
      r.raw = intent(r.row, block, context); r.trace.push('intent-commit');
      if (options.intent) options.intent(r); return r.raw;
    }),
    retainSignerResult: F((id, expected, signed) => {
      r.trace.push('result-entry'); assert.equal(id, r.row.paymentId); assert.equal(expected, r.raw);
      r.raw = complete(expected, signed, r.row); r.trace.push('result-commit');
      if (options.result) options.result(r); return r.raw;
    }),
    assertCurrent: F(() => { r.trace.push('signer-current-owner'); if (options.signerCurrent) return options.signerCurrent(r); }),
  });
  const key = { getPublicKey() { r.keyCalls++; return Buffer.from(publicBytes); }, getAddress() { r.keyCalls++; return c.payerAddress; },
    sign(hash) { r.signCalls++; r.trace.push('declared-sdk-protocol-entry'); r.hashAtEntry = hash.toString('hex');
      return options.signature ? options.signature(r) : Buffer.alloc(64); }, clear() { r.clearCalls++; } };
  r.owner = owner({ keyPair: key, expectedAddress: c.payerAddress, expectedPublicKey: c.publicKey },
    { paymentId: r.row.paymentId, backend }, { clock: F(() => r.now), maxReadToSignerMs: 1000 });
  r.configuration = F({ readOptions: f.options, walletOwner: r.owner, expectedAddress: c.payerAddress, expectedPublicKey: c.publicKey });
  r.preparer = create(r.configuration); r.f = f; r.input = input; r.url = c.paymentRequired.resource.url; traces.push(r); return r;
}
function check(id, run) { checks.push(F({ id, run })); }
async function prepared(options = {}) { const r = fixture(options); r.candidate = await r.preparer.prepareOriginalFunding(r.input, r.url); return r; }

check('non-dp-custody-construction-does-not-enter-wallet-read-clock-or-close-ports', () => {
  const r = fixture(); assert.equal(r.keyCalls + r.signCalls + r.clearCalls, 0); assert.deepEqual(r.f.reads, [0, 0, 0]); assert.deepEqual(r.trace, []);
  assert.deepEqual(Object.keys(r.preparer), ['prepareOriginalFunding', 'revalidateSignedOriginal', 'inspect']);
});
check('non-dp-custody-actual-owner-records-intent-before-one-declared-sign-and-result-before-return', async () => {
  const r = await prepared(); assert.deepEqual(r.f.reads, [20, 20, 12]); assert.equal(r.signCalls, 1);
  assert.deepEqual(r.trace, ['intent-entry', 'intent-commit', 'signer-current-owner', 'declared-sdk-protocol-entry', 'result-entry', 'result-commit']);
  assert.equal(r.preparer.inspect().phase, 'AWAITING_INDEPENDENT_PINS'); assert.equal(decode(r.raw).phase, 'SIGNED');
  assert.equal(r.owner.inspect().signerCustody.resultReturned, true); assert.equal(r.clearCalls, 0);
});
check('non-dp-custody-shared-capsule-retains-actual-non-dp-quote-and-full-original-input', async () => {
  const r = await prepared(), record = decode(r.raw), context = JSON.parse(record.preSignContextJson);
  assert.equal(record.signerCustodyVersion, 2); assert.equal(context.originalPlan.observedUserSendPlanVersion, 1);
  assert.equal(context.originalPlan.quote.nonDpFusedQuoteVersion, 1); assert.equal(context.originalPlan.quote.selected.difficulty, 0);
  assert.equal(canonicalJson(JSON.parse(record.preparationInputJson)), canonicalJson(r.input));
  assert.equal(context.preSignCheckpointJson, r.candidate.preSignCheckpointJson); assert.equal(record.originalDigest, r.row.originalDigest);
});
check('non-dp-custody-final-custody-read-returns-identical-candidate-and-encoded-packet', async () => {
  const r = await prepared(), candidate = await r.preparer.revalidateSignedOriginal();
  assert.equal(candidate, r.candidate); assert.equal(candidate.packet, r.candidate.packet); assert.equal(r.signCalls, 1);
  assert.deepEqual(r.f.reads, [25, 25, 15]); assert.equal(r.preparer.inspect().phase, 'ORIGINAL_READ_RETURNED');
});
check('non-dp-custody-no-second-preparation-read-reset-or-second-sign-entry', async () => {
  const r = await prepared(); await assert.rejects(r.preparer.prepareOriginalFunding(r.input, r.url)); await r.preparer.revalidateSignedOriginal();
  const reads = [...r.f.reads]; await assert.rejects(r.preparer.revalidateSignedOriginal()); assert.deepEqual(r.f.reads, reads); assert.equal(r.signCalls, 1);
  assert.equal(r.preparer.inspect().actualCustodyCommit, 'NOT_PERFORMED');
});
check('non-dp-custody-shared-original-record-projects-identical-recovery-bytes-without-signing', async () => {
  const r = await prepared(), n = r.signCalls, result = project(r.raw, { paymentId: r.row.paymentId, originalDigest: r.row.originalDigest });
  assert.equal(result.packet.serializedCheckpoint, r.candidate.packet.serializedCheckpoint);
  assert.deepEqual(result.packet.expectedPins, r.candidate.packet.expectedPins); assert.equal(r.signCalls, n);
  assert.equal(result.maySignPayment, false); assert.equal(result.mayDispatchFunding, false); assert.equal(result.authority, 'NONE');
});
check('non-dp-custody-revoked-parent-before-entry-refuses-all-borrowed-work', async () => {
  const r = fixture(); r.current = false; await assert.rejects(r.preparer.prepareOriginalFunding(r.input, r.url));
  assert.deepEqual(r.f.reads, [0, 0, 0]); assert.equal(r.signCalls, 0); assert.equal(r.raw, null); assert.equal(r.preparer.inspect().held, true);
});
check('non-dp-custody-invalid-original-route-or-body-consumes-no-owner-attempt', async () => {
  for (const edit of [v => { v.originalRequest.requestBodyBase64 = 'eA=='; }, v => { v.challenge.resourceUrl = 'https://foreign.invalid/funding'; }, v => { v.extra = 1; }]) {
    const r = fixture(), input = copy(r.input); edit(input); await assert.rejects(r.preparer.prepareOriginalFunding(input, r.url));
    assert.deepEqual(r.trace, []); assert.equal(r.preparer.inspect().used, false); assert.equal(r.signCalls, 0);
  }
});
check('non-dp-custody-does-not-silently-downgrade-a-dp-resource-policy', async () => {
  const r = fixture(), input = copy(r.input); input.plannerContext.readInput.policy.maxDifficulty = 100;
  await assert.rejects(r.preparer.prepareOriginalFunding(input, r.url)); assert.equal(r.preparer.inspect().used, false); assert.equal(r.raw, null);
});
check('non-dp-custody-foreign-payer-refuses-before-owner-binding', async () => {
  const r = fixture(), other = nonDpReadDataFixture().c.payerAddress, input = copy(r.input); input.plannerContext.readInput.payerAddress = other;
  await assert.rejects(r.preparer.prepareOriginalFunding(input, r.url)); assert.equal(r.preparer.inspect().used, false); assert.equal(r.raw, null);
});
check('non-dp-custody-proxies-and-getters-are-not-entered-during-original-capture', async () => {
  const r = fixture(); let traps = 0; const input = copy(r.input);
  Object.defineProperty(input.originalRequest, 'contextBase64', { enumerable: true, get() { traps++; } });
  await assert.rejects(r.preparer.prepareOriginalFunding(input, r.url));
  await assert.rejects(r.preparer.prepareOriginalFunding(new Proxy(r.input, { ownKeys() { traps++; } }), r.url));
  assert.equal(traps, 0); assert.deepEqual(r.trace, []);
});
check('non-dp-custody-original-capture-precedes-first-parent-callback', async () => {
  let r; r = fixture({ guard(count) { if (count === 1) r.input.originalRequest.contextBase64 = 'eA=='; } });
  const old = r.input.originalRequest.contextBase64; await r.preparer.prepareOriginalFunding(r.input, r.url);
  assert.equal(JSON.parse(decode(r.raw).preparationInputJson).originalRequest.contextBase64, old);
});
check('non-dp-custody-expired-final-pre-sign-read-never-enters-intent-or-signer', async () => {
  let r; r = fixture({ account(raw, rpc, count) { if (rpc.method === ACCOUNT && count === 7) r.current = false; return raw; } });
  await assert.rejects(r.preparer.prepareOriginalFunding(r.input, r.url)); assert.equal(r.signCalls, 0); assert.equal(r.raw, null);
  assert.equal(r.owner.inspect().signerCustody.signerEntryAge.observationEntered, true);
});
check('non-dp-custody-clock-expiry-after-intent-preserves-intent-and-refuses-before-signer', async () => {
  const r = fixture({ intent(v) { v.now = 1000000000n; } }); await assert.rejects(r.preparer.prepareOriginalFunding(r.input, r.url));
  assert.equal(r.signCalls, 0); assert.equal(decode(r.raw).phase, 'INTENT'); assert.equal(r.owner.inspect().signerCustody.signerEntryAge.refused, true);
});
check('non-dp-custody-current-signer-owner-is-rechecked-after-intent', async () => {
  const r = fixture({ signerCurrent() { throw Error('declared stale owner'); } }); await assert.rejects(r.preparer.prepareOriginalFunding(r.input, r.url));
  assert.equal(r.signCalls, 0); assert.equal(decode(r.raw).phase, 'INTENT');
  assert.equal(r.owner.inspect().signerCustody.currentOwnerCheck.entered, true); assert.equal(r.preparer.inspect().held, true);
});
check('non-dp-custody-lost-intent-ack-retains-original-without-any-sign-retry', async () => {
  const r = fixture({ intent() { throw Error('declared lost intent acknowledgement'); } });
  await assert.rejects(r.preparer.prepareOriginalFunding(r.input, r.url)); await assert.rejects(r.preparer.prepareOriginalFunding(r.input, r.url));
  assert.equal(r.signCalls, 0); assert.equal(decode(r.raw).phase, 'INTENT'); assert.equal(r.owner.inspect().held, true);
});
check('non-dp-custody-opaque-async-sdk-result-remains-held-without-assimilation-or-retry', async () => {
  const gate = deferred(), r = fixture({ signature() { return gate.promise; } });
  await assert.rejects(r.preparer.prepareOriginalFunding(r.input, r.url)); assert.equal(r.signCalls, 1);
  assert.equal(r.owner.inspect().unobservableSdkResultHeld, true); assert.equal(decode(r.raw).phase, 'INTENT');
  gate.resolve(Buffer.alloc(64)); await assert.rejects(r.preparer.prepareOriginalFunding(r.input, r.url)); assert.equal(r.signCalls, 1);
});
check('non-dp-custody-lost-result-ack-retains-exact-signed-record-for-read-only-recovery', async () => {
  const r = fixture({ result() { throw Error('declared lost result acknowledgement'); } });
  await assert.rejects(r.preparer.prepareOriginalFunding(r.input, r.url)); assert.equal(r.signCalls, 1); assert.equal(decode(r.raw).phase, 'SIGNED');
  const result = project(r.raw, { paymentId: r.row.paymentId, originalDigest: r.row.originalDigest });
  assert.equal(result.packet.transactionHash, r.hashAtEntry); assert.equal(result.maySignPayment, false); assert.equal(r.owner.inspect().held, true);
});
check('non-dp-custody-malformed-synchronous-signature-result-retains-uncertainty', async () => {
  const r = fixture({ signature() { return Buffer.alloc(63); } }); await assert.rejects(r.preparer.prepareOriginalFunding(r.input, r.url));
  assert.equal(r.signCalls, 1); assert.equal(decode(r.raw).phase, 'INTENT'); assert.equal(r.owner.inspect().held, true);
});
check('non-dp-custody-post-sign-frontier-change-keeps-signed-record-without-replacement', async () => {
  const r = fixture({ account(raw, rpc, count) { if (rpc.method === ACCOUNT && count === 10) raw.height++; return raw; } });
  await assert.rejects(r.preparer.prepareOriginalFunding(r.input, r.url)); assert.equal(r.signCalls, 1); assert.equal(decode(r.raw).phase, 'SIGNED');
  assert.equal(r.preparer.inspect().signingResultHeld, true); assert.equal(r.preparer.inspect().held, true);
});
check('non-dp-custody-pre-custody-resource-loss-keeps-the-same-candidate-and-record-held', async () => {
  const r = await prepared({ endpoint(raw, rpc, _index, cycle) { if (rpc.method === QUOTE && cycle === 4) raw.availablePlasma = 20999; return raw; } });
  const raw = r.raw; await assert.rejects(r.preparer.revalidateSignedOriginal()); await assert.rejects(r.preparer.revalidateSignedOriginal());
  assert.equal(r.raw, raw); assert.equal(r.signCalls, 1); assert.equal(r.preparer.inspect().originalCandidateRetained, true); assert.equal(r.preparer.inspect().held, true);
});
check('non-dp-custody-pending-post-sign-read-observes-parent-revocation-without-closing-its-owner', async () => {
  const gate = deferred(), entered = deferred(); let r;
  r = fixture({ accountPending(response, count) { if (count === 10) { entered.resolve(response); return gate.promise; } return Promise.resolve(response); } });
  const pending = r.preparer.prepareOriginalFunding(r.input, r.url); pending.catch(() => {}); const response = await entered.promise;
  assert.equal(decode(r.raw).phase, 'SIGNED'); assert.equal(r.preparer.inspect().active, true);
  r.current = false; gate.resolve(response); await assert.rejects(pending); assert.equal(r.clearCalls, 0); assert.equal(r.owner.inspect().closeRequested, false);
});
check('non-dp-custody-overlap-is-rejected-without-another-borrow-or-attempt', async () => {
  const gate = deferred(), entered = deferred();
  const r = fixture({ accountPending(response, count) { if (count === 1) { entered.resolve(response); return gate.promise; } return Promise.resolve(response); } });
  const pending = r.preparer.prepareOriginalFunding(r.input, r.url), response = await entered.promise;
  await assert.rejects(r.preparer.prepareOriginalFunding(r.input, r.url)); await assert.rejects(r.preparer.revalidateSignedOriginal());
  assert.deepEqual(r.f.reads, [0, 0, 1]); gate.resolve(response); await pending; assert.equal(r.signCalls, 1);
});
check('non-dp-custody-candidate-is-immutable-and-no-caller-args-can-replace-the-custody-read', async () => {
  const r = await prepared(); assert.ok(Object.isFrozen(r.candidate)); assert.ok(Object.isFrozen(r.candidate.packet));
  assert.equal(r.candidate.signatureValidation, 'NOT_PERFORMED'); assert.equal(r.candidate.authority, 'NONE');
  const before = [...r.f.reads]; await assert.rejects(r.preparer.revalidateSignedOriginal(r.candidate)); assert.deepEqual(r.f.reads, before);
  assert.equal((await r.preparer.revalidateSignedOriginal()).packet, r.candidate.packet); assert.equal(r.clearCalls, 0);
});

export const nonDpCustodiedOriginalCandidateDataCases = F([...checks]);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const c of checks) { try { await c.run(); cases.push({ id: c.id, status: 'PASS' }); }
    catch (e) { cases.push({ id: c.id, status: 'FAILURE', error: e.code ?? e.message }); break; } }
  const failed = cases.filter(c => c.status !== 'PASS').length;
  console.log(JSON.stringify({ qualification: 'G1_NON_DP_CUSTODIED_ORIGINAL_CANDIDATE_DATA', passed: cases.length - failed, failed, cases,
    newCases: 24, affectedCases: 40, declaredSdkProtocolPortEntries: traces.reduce((n, r) => n + r.signCalls, 0),
    actualSignerOwnerAndRecordCodecs: true, signatureShapedFixturesDeliberatelyInvalid: true, cryptographicSignatureAlgorithms: 0,
    componentCooperativeTimers: false, nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0,
    nodeChildren: 0, actualPrepare: 0, payouts: 0, nativeEntryBinding: 'NOT_IMPLEMENTED', chainAuthentication: 'NOT_ESTABLISHED', physicalRelease: 'NOT_ESTABLISHED' }));
  if (failed || cases.length !== checks.length) process.exitCode = 1;
}
