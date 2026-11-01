// Real pure V3 selector, signer owner and budget verifier over declared memory.
import assert from 'node:assert/strict';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { restoreOriginalPaymentCheckpoint } from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { decodeB64Json, MAX_X402_HEADER_ENCODED_BYTES } from '../src/x402-wire.js';
import { captureOriginalFundingSignerPreparation, captureOriginalFundingSignerPreSignContext,
  createOriginalFundingSignerContextIntent, completeOriginalFundingSignerContextRecord } from '../src/original-funding-signer-context-custody.js';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { createApiCreditLinuxBudgetDataFixture } from './api-credit-linux-budget.behavior.mjs';
import { apiCreditBudgetProbeOptions } from './api-credit-linux-budget-contract.mjs';
import { captureApiCreditSignerAcceptanceSelection as select, captureApiCreditSignerProbeEnvelope as envelope,
  readApiCreditAcceptanceSignerSpending as read, apiCreditSignerAcceptanceLedgerOptions as ledgerOptions } from './api-credit-linux-signer-contract.mjs';

const F = Object.freeze, checks = [], copy = value => JSON.parse(JSON.stringify(value));
function check(id, run) { checks.push(F({ id, run })); }
async function fixture(options = {}) {
  const b = await createApiCreditLinuxBudgetDataFixture(), file = apiCreditBudgetProbeOptions(b.token).spending;
  const fundingResourceUrl = b.profile.configuration.storeOptions.resourceUrl;
  const commands = b.input.commands.trimEnd().split('\n').map(JSON.parse), retained = commands[3].input.originalPayment;
  const packet = { transactionHash: commands[1].input.expectedPins.binding.paymentHash, serializedCheckpoint: retained.serializedCheckpoint,
    expectedPins: commands[1].input.expectedPins };
  const checkpoint = restoreOriginalPaymentCheckpoint(packet.serializedCheckpoint, packet.expectedPins);
  const payload = decodeB64Json(checkpoint.originalBytes.paymentPayload, { maxDecodedBytes: 4096, maxEncodedBytes: MAX_X402_HEADER_ENCODED_BYTES });
  const signed = payload.payload.transaction, unsigned = { ...signed, signature: '' };
  const row = JSON.parse(b.reserved).reservations[0], input = JSON.parse(b.input.commands.split('\n')[0]).input;
  const prepared = captureOriginalFundingSignerPreparation(input, fundingResourceUrl); assert.equal(prepared.originalDigest, row.originalDigest);
  const subject = { subjectVersion: 1 };
  for (const k of ['version', 'chainIdentifier', 'blockType', 'previousHash', 'height', 'momentumAcknowledged', 'address', 'toAddress', 'amount', 'tokenStandard', 'fromBlockHash', 'data']) subject[k] = unsigned[k];
  const plan = { observedUserSendPlanVersion: 1, subject, quote: { declaredQuoteVersion: 1, label: 'same-original-memory-data' } };
  const context = captureOriginalFundingSignerPreSignContext(prepared, { originalUnsignedBlock: unsigned, originalPlan: plan,
    preSignCheckpointJson: canonicalJson({ accountBlock: unsigned, checkpointVersion: 1, phase: 'UNSIGNED', quote: plan.quote }) });
  const intent = createOriginalFundingSignerContextIntent(row, unsigned, context);
  const signedRecord = completeOriginalFundingSignerContextRecord(intent, signed, row);
  const profile = { signerInspectionVersion: 3, spendingStoreProfile: 'GRANT_RECOVERY_V1', spendingFile: file,
    expectedOriginal: { paymentId: row.paymentId, originalDigest: row.originalDigest, fundingResourceUrl },
    uncertaintyAgeLimits: { version: 1, maximumUnresolvedAgeDays: 1 } };
  const selectionInput = { ...b.input, signerProfile: canonicalJson(profile) };
  const r = { b, packet, row, intent, signedRecord, profile, input: selectionInput, token: select(selectionInput), raw: b.raw,
    revoked: false, closed: false, expired: false, trace: [],
    calls: { open: 0, legacy: 0, load: 0, current: 0, signer: 0, revoke: 0, close: 0, day: 0 } };
  const owner = F({ backend: F({ load(account) { assert.equal(account, b.storage.policy.accountId);
    r.calls.load++; r.trace.push('load'); return options.load ? options.load(r) : r.raw; } }),
    signerCustody: F({ requirePreparationContext: true, readSignerRecord: F(id => { r.calls.signer++; r.trace.push('signer'); assert.equal(id, row.paymentId);
      return options.signer ? options.signer(r) : signedRecord; }) }),
    assertCurrent: F(() => { r.calls.current++; r.trace.push('current'); if (options.current) return options.current(r); }),
    inspect: F(() => F({ spendingFileOwnerVersion: 1, lifecycle: r.closed ? 'CLOSED' : r.revoked ? 'REVOKED' : 'OPEN', held: false, busy: false,
      backendClosed: r.revoked, databaseOpen: !r.closed, physicalCloseEntered: r.closed, physicalCloseReturned: r.closed })),
    revoke: F(() => { r.calls.revoke++; r.trace.push('revoke'); r.revoked = true; if (options.revoke) return options.revoke(r); }),
    close: F(() => { r.calls.close++; r.trace.push('close'); assert.equal(r.revoked, true); if (options.close) return options.close(r); r.closed = true; }) });
  r.ports = F({ openers: F({ signerContext: F(() => { r.calls.legacy++; throw Error('unselected legacy schema'); }), grantRecovery: F(configuration => {
    r.calls.open++; r.trace.push('open'); assert.deepEqual(configuration, file); return options.open ? options.open(r, owner) : owner;
  }) }), requireOpening: F(() => { if (r.expired) throw Error('declared opening expiry'); }),
  readDay: F(() => { r.calls.day++; return (options.days ?? [12, 12])[Math.min(r.calls.day - 1, 1)]; }) });
  r.run = () => read(r.token, r.ports); return r;
}
async function refused(change) {
  const r = await fixture(), input = { ...r.input }, profile = copy(r.profile); change(profile, input);
  input.signerProfile = canonicalJson(profile); assert.throws(() => select(input), /API_CREDIT_LINUX_SIGNER_ACCEPTANCE/); assert.equal(r.calls.open, 0);
}
check('linux-signer-one-current-owner-binds-the-same-budget-and-original-packet', async () => {
  const r = await fixture(), before = r.raw, v = r.run(); assert.equal(v.signer.status, 'SIGNED_HISTORY_OBSERVATION_MATCHED');
  assert.equal(v.spending.totalExposure, r.row.amount); assert.equal(v.spending.spent, 1); assert.equal(v.spending.unresolved, 0);
  assert.equal(v.spending.selectionDigest, r.token.summary.selectionDigest); assert.equal(v.spending.budgetSelectionDigest, r.b.token.summary.selectionDigest);
  assert.equal(v.signer.sharedExistingFileOwner, true); assert.equal(v.signer.storeCloseReturned, true); assert.equal(r.closed, true); assert.equal(r.raw, before);
  assert.deepEqual(r.calls, { open: 1, legacy: 0, load: 2, current: 4, signer: 1, revoke: 1, close: 1, day: 2 });
});
check('linux-signer-selection-adds-only-one-explicit-profile-with-no-extra-process-or-connection', async () => {
  const r = await fixture(), s = r.token.summary; assert.equal(s.version, 4); assert.equal(Object.keys(s.inputPins).length, 7);
  assert.equal(s.commandFrames, 106); assert.equal(s.distinctRequests, 100); assert.equal(s.ledgerProbeProcesses, 2);
  assert.equal(s.additionalProbeProcesses, 0); assert.equal(s.additionalDatabaseConnections, 0); assert.equal(s.signerReadsPerProbe, 1);
  assert.equal(s.signerHistoryAcceptance, 'NOT_EXECUTED'); assert.equal(s.signerResponseLoss, 'NOT_ESTABLISHED');
});
check('linux-signer-legacy-schema-or-absent-age-selection-cannot-silently-open-current-data', async () => {
  await refused(p => { p.signerInspectionVersion = 2; delete p.spendingStoreProfile; });
  await refused(p => { delete p.uncertaintyAgeLimits; }); await refused(p => { p.spendingStoreProfile = 'AUTO'; });
});
check('linux-signer-different-payment-digest-or-funding-url-is-rejected-before-open', async () => {
  for (const [key, value] of [['paymentId', 'foreign.original'], ['originalDigest', 'sha256:' + 'f'.repeat(64)], ['fundingResourceUrl', 'https://foreign.invalid/funding']]) {
    await refused(p => { p.expectedOriginal[key] = value; });
  }
});
check('linux-signer-owner-policy-path-device-and-reservation-must-match-the-budget-selection', async () => {
  for (const change of [p => { p.spendingFile.storageProfile.ownerToken.epoch++; }, p => { p.spendingFile.storageProfile.ownerToken.ownerId = 'foreign.owner'; },
    p => { p.spendingFile.storageProfile.policy.policyId = 'foreign.policy'; }, p => { p.spendingFile.storageProfile.databasePath = p.spendingFile.allowedRoot + '/other.sqlite'; },
    p => { p.spendingFile.filePolicy.expectedDevice = '999'; }, p => { p.spendingFile.filePolicy.reservedBytes = '1'; }]) await refused(change);
});
check('linux-signer-explicit-age-policy-is-pinned-without-changing-the-original-payment', async () => {
  const r = await fixture(), profile = copy(r.profile); profile.uncertaintyAgeLimits.maximumUnresolvedAgeDays++;
  const other = select({ ...r.input, signerProfile: canonicalJson(profile) }); assert.notEqual(other.summary.selectionDigest, r.token.summary.selectionDigest);
  assert.equal(other.summary.inputPins.commands.sha256, r.token.summary.inputPins.commands.sha256);
});
check('linux-signer-current-budget-and-provider-file-selections-remain-separate', async () => {
  const r = await fixture(); assert.equal(ledgerOptions(r.token).databasePath, JSON.parse(r.input.recoveryProfile).backendOptions.databasePath);
  assert.notEqual(ledgerOptions(r.token).databasePath, r.profile.spendingFile.storageProfile.databasePath);
});
check('linux-signer-selection-refuses-extra-properties-accessors-and-proxies-without-entry', async () => {
  const r = await fixture(); let entered = 0; const input = { ...r.input };
  Object.defineProperty(input, 'signerProfile', { enumerable: true, get() { entered++; return r.input.signerProfile; } });
  assert.throws(() => select(input)); assert.throws(() => select({ ...r.input, key: 'not accepted' }));
  assert.throws(() => select(new Proxy({}, { ownKeys() { entered++; return []; } }))); assert.equal(entered, 0); assert.equal(r.calls.open, 0);
});
check('linux-signer-internal-envelope-bounds-the-parent-selected-opening-allowance', async () => {
  const r = await fixture(); for (const ms of [1, 120000]) { const v = envelope({ version: 1, maximumOpenMs: ms, selection: r.input }); assert.equal(v.maximumOpenMs, ms); assert.equal(v.selection.summary.version, 4); }
  for (const ms of [0, -0, -1, 120001, 1.5, '1000']) assert.throws(() => envelope({ version: 1, maximumOpenMs: ms, selection: r.input }));
  assert.throws(() => envelope({ ...r.input })); assert.throws(() => envelope({ version: 1, maximumOpenMs: 1, selection: r.input, extra: true }));
});
check('linux-signer-same-owned-read-uses-the-actual-four-guard-close-protocol', async () => {
  const r = await fixture(); r.run(); assert.deepEqual(r.trace, ['open', 'current', 'load', 'current', 'signer', 'current', 'load', 'current', 'revoke', 'close']);
});
check('linux-signer-historical-observation-is-stable-across-different-current-days', async () => {
  const a = await fixture({ days: [12, 12] }), b = await fixture({ days: [13, 13] });
  assert.deepEqual(a.run(), b.run()); assert.equal(a.calls.day + b.calls.day, 4);
});
check('linux-signer-output-hashes-do-not-publish-private-originals-signatures-or-paths', async () => {
  const r = await fixture(), text = JSON.stringify(r.run());
  for (const marker of [r.row.paymentId, r.row.originalDigest, r.packet.transactionHash, r.packet.serializedCheckpoint, '/synthetic/', 'ServiceCredit ']) assert.equal(text.includes(marker), false);
});
check('linux-signer-existing-ordinary-unfrozen-backend-reader-is-admitted', async () => {
  const r = await fixture(); assert.equal(r.run().spending.storeCloseReturned, true); assert.equal(r.calls.load, 2);
});
check('linux-signer-intent-only-or-missing-history-cannot-pass-a-clean-signed-scenario', async () => {
  for (const signer of [r => r.intent, () => null]) { const r = await fixture({ signer }); assert.throws(r.run); assert.equal(r.calls.open, 1); assert.equal(r.calls.close, 1); }
});
check('linux-signer-reserved-or-unknown-budget-is-preserved-without-a-clean-verdict', async () => {
  const r = await fixture(); r.raw = r.b.reserved; const before = r.raw; assert.throws(r.run); assert.equal(r.raw, before); assert.equal(r.calls.close, 1);
});
check('linux-signer-changed-journal-between-reads-withholds-the-observation', async () => {
  const r = await fixture({ load(r) { if (r.calls.load === 2) { const v = JSON.parse(r.raw); v.revision++; r.raw = JSON.stringify(v); } return r.raw; } });
  assert.throws(r.run); assert.equal(r.calls.close, 1); assert.equal(r.calls.signer, 1);
});
check('linux-signer-throwing-read-retains-unknown-without-a-physical-close', async () => {
  const r = await fixture({ load() { throw Error('declared read loss'); } }); assert.throws(r.run);
  assert.equal(r.calls.revoke, 1); assert.equal(r.calls.close, 0); assert.throws(r.run); assert.equal(r.calls.open, 1);
});
check('linux-signer-opaque-read-is-forwarded-without-entering-then-getters', async () => {
  let entered = 0; const r = await fixture({ load() { return { get then() { entered++; throw Error(); } }; } });
  assert.throws(r.run); assert.equal(entered, 0); assert.equal(r.calls.close, 0); assert.equal(r.calls.revoke, 1);
});
check('linux-signer-current-owner-fencing-is-not-normalized-by-the-read-tap', async () => {
  const r = await fixture({ current() { throw Error('declared stale owner'); } }); assert.throws(r.run);
  assert.equal(r.calls.load, 0); assert.equal(r.calls.signer, 0); assert.equal(r.calls.close, 0);
});
check('linux-signer-selected-opener-refusal-never-enters-a-schema-fallback', async () => {
  const r = await fixture({ open() { throw Error('declared existing-file refusal'); } }); assert.throws(r.run);
  assert.deepEqual([r.calls.open, r.calls.legacy, r.calls.signer, r.calls.revoke, r.calls.close], [1, 0, 0, 0, 0]);
});
check('linux-signer-opaque-owner-is-retained-by-the-actual-protocol-without-raw-close', async () => {
  const r = await fixture({ open() { return Promise.resolve(F({})); } }); assert.throws(r.run); await Promise.resolve();
  assert.equal(r.calls.close, 0); assert.equal(r.calls.revoke, 0); assert.equal(r.calls.legacy, 0);
});
check('linux-signer-unknown-revoke-or-close-cannot-publish-or-retry', async () => {
  const a = await fixture({ revoke() { return true; } }); assert.throws(a.run); assert.equal(a.calls.close, 0);
  const b = await fixture({ close() { throw Error('declared close loss'); } }); assert.throws(b.run); assert.throws(b.run); assert.equal(b.calls.close, 1);
});
check('linux-signer-expired-opening-and-clock-rollback-withhold-new-reads-or-results', async () => {
  const a = await fixture(); a.expired = true; assert.throws(a.run); assert.equal(a.calls.open, 0);
  const b = await fixture({ days: [9, 9] }); assert.throws(b.run); assert.equal(b.calls.close, 1); assert.equal(b.calls.signer, 0);
});
check('linux-signer-copied-tokens-and-proxy-ports-cannot-acquire-an-owner', async () => {
  const r = await fixture(); let entered = 0; assert.throws(() => read(F({ ...r.token }), r.ports));
  assert.throws(() => read(r.token, new Proxy({}, { ownKeys() { entered++; return []; } })));
  assert.equal(entered, 0); assert.equal(r.calls.open, 0);
});
check('linux-signer-a-completed-phase-cannot-be-reentered-with-another-file', async () => {
  const r = await fixture(); r.run(); assert.throws(() => read(r.token, r.ports)); assert.equal(r.calls.open, 1); assert.equal(r.calls.close, 1);
});
check('linux-signer-normal-history-does-not-become-a-signer-loss-or-release-proof', async () => {
  const r = await fixture(), v = r.run(); assert.equal(v.signer.authority, 'NONE');
  for (const k of ['mayStartPayment', 'maySignPayment', 'mayDispatchFunding', 'mayDispatchService', 'automaticRetry']) assert.equal(v.signer[k], false);
  assert.equal(v.signer.signatureValidation, 'NOT_PERFORMED'); assert.equal(v.signer.physicalRelease, 'NOT_ESTABLISHED');
  assert.equal(v.signer.signerResponseLoss, 'NOT_ESTABLISHED'); assert.equal(v.spending.G1Acceptance, 'NOT_ESTABLISHED'); assert.equal(v.spending.G2Acceptance, 'NOT_ESTABLISHED');
});

export const apiCreditLinuxSignerDataCases = F(checks);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const c of checks) { try { await c.run(); cases.push({ id: c.id, status: 'PASS' }); }
    catch (e) { cases.push({ id: c.id, status: 'FAIL', message: String(e?.message ?? e) + (typeof e?.stage === 'string' ? ':' + e.stage : '') }); break; } }
  await closeApiCreditOperatorDataFixtures(); const failed = cases.filter(c => c.status !== 'PASS').length;
  process.stdout.write(JSON.stringify({ qualification: 'G2_LINUX_SAME_OWNER_SIGNER_HISTORY_DATA', passed: cases.length - failed, failed, cases,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0,
    actualSignerLoss: 'NOT_ESTABLISHED', Linux: 'NOT_ESTABLISHED', G1: 'OPEN', G2: 'OPEN' }) + '\n');
  if (failed) process.exitCode = 1;
}
