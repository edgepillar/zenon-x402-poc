// Declared file/clock/pipe method ports; no native file, SQLite, key or signer.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { apiCreditSignerContextDataCases, signerContextDataFixture } from './api-credit-signer-context.behavior.mjs';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { canonicalJson } from '../src/canonical.js';
import { captureOriginalFundingSpendingFileProfile } from '../src/original-funding-spending-file-profile.js';
import { createOriginalFundingSignerContextIntent as intent, completeOriginalFundingSignerContextRecord as complete } from '../src/original-funding-signer-context-custody.js';
import { captureApiCreditCliArguments as argv } from '../src/api-credit-cli-arguments.js';
import { decodeApiCreditSignerInspectionProfile as decode, consumeApiCreditSignerInspectionProfile as consume,
  releaseApiCreditSignerInspectionProfile as release } from '../src/api-credit-signer-inspection-profile.js';
import { runApiCreditSignerInspectionOwner as inspectOwner, captureApiCreditSignerInspectionResult as capture,
  captureApiCreditSignerInspectionOutput as output } from '../src/original-funding-signer-inspection-owner.js';
import { runApiCreditSignerInspectionCoordinator as coordinate } from '../src/api-credit-recovery-inspection-coordinator.js';

const F = Object.freeze, checks = [...apiCreditSignerContextDataCases];
function check(id, run) { checks.push({ id, run }); }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function flush() { for (let i = 0; i < 32; i++) await Promise.resolve(); }
function fixture() {
  const d = signerContextDataFixture(), policy = { version: 1, policyId: 'synthetic.policy', accountId: d.unsigned.address,
    network: d.row.network, asset: d.row.asset, recipients: [d.row.recipient], maxPayment: d.row.amount, maxTotal: d.row.amount, maxDaily: d.row.amount, maxRecords: 4 };
  const envelope = { signerInspectionVersion: 1, spendingFile: { storageProfile: { version: 1, mode: 'OPEN_EXISTING', databasePath: '/synthetic/signer/ledger.sqlite', policy,
    ownerToken: { version: 1, storeId: 'synthetic.store', accountId: policy.accountId, ownerId: 'synthetic.owner', epoch: 1, minimumRevision: 0 } },
    allowedRoot: '/synthetic/signer', filePolicy: { expectedDevice: '1', reservedBytes: '0', maxDatabaseBytes: 4194304 } },
    expectedOriginal: { paymentId: d.row.paymentId, originalDigest: d.row.originalDigest, fundingResourceUrl: d.f.resourceUrl } };
  const rawIntent = intent(d.row, d.unsigned, d.context), rawSigned = complete(rawIntent, d.signed, d.row);
  return { ...d, envelope, rawIntent, rawSigned, expected: envelope.expectedOriginal };
}
function validCreatingMode(envelope) {
  const p = envelope.spendingFile.storageProfile; p.mode = 'CREATE_NEW'; delete p.ownerToken; p.storeId = 'synthetic.new'; p.ownerId = 'synthetic.new.owner';
  assert.equal(captureOriginalFundingSpendingFileProfile(envelope.spendingFile).storageProfile.mode, 'CREATE_NEW');
}
function owner(options = {}) {
  const d = fixture(), r = { ...d, calls: { open: 0, read: 0, revoke: 0, close: 0 }, trace: [], phase: 'OPEN', held: false, expired: false, owner: null };
  r.owner = F({ signerCustody: F({ requirePreparationContext: true, readSignerRecord: F(id => {
    assert.equal(id, d.row.paymentId); r.calls.read++; r.trace.push('read'); if (options.expireAfterRead) r.expired = true;
    if (options.readHeld) { r.held = true; throw Error('declared held read'); } if (options.readThrow) throw Error('declared read loss');
    return options.raw !== undefined ? options.raw : d.rawSigned;
  }) }), revoke: F(() => { r.calls.revoke++; r.trace.push('revoke'); if (options.revokeThrow || r.held) throw Error('declared revoke loss');
    r.phase = 'REVOKED'; return options.nonvoidRevoke ? true : undefined; }), close: F(() => {
    r.calls.close++; r.trace.push('close'); if (options.closeThrow) throw Error('declared close loss');
    if (options.closePromise) return options.closePromise; r.phase = 'CLOSED'; return undefined;
  }), inspect: F(() => F({ spendingFileOwnerVersion: 1, lifecycle: options.badClosedView && r.phase === 'CLOSED' ? 'HELD' : r.phase, held: r.held, busy: false,
    backendClosed: r.phase !== 'OPEN', databaseOpen: r.phase !== 'CLOSED', physicalCloseEntered: r.phase === 'CLOSED', physicalCloseReturned: r.phase === 'CLOSED' })) });
  r.guard = F(() => { if (r.expired) throw Error('declared expired'); });
  r.ports = F({ openFile: F(c => { r.calls.open++; r.trace.push('open'); assert.equal(c.storageProfile.mode, 'OPEN_EXISTING');
    if (options.openThrow || options.staleEpoch && c.storageProfile.ownerToken.epoch !== 2) throw Error('declared open refusal');
    if (options.expireAfterOpen) r.expired = true; return options.malformedOwner ? F({}) : r.owner;
  }) });
  r.run = (expected = d.expected) => inspectOwner({ fileConfiguration: decodeConfiguration(d.envelope).fileConfiguration, expectedOriginal: expected, ports: r.ports, requireOpening: r.guard }); return r;
}
function decodeConfiguration(envelope) { const p = decode(canonicalJson(envelope)), c = consume(p); release(p); return c; }
function coordinator(options = {}) {
  const d = fixture(), r = { ...d, text: canonicalJson(d.envelope), now: 0n, timers: [], calls: { read: 0, inspect: 0, write: 0, close: 0 }, writes: [], closed: false, profile: null };
  r.ports = F({ readProfile: F(g => { g(); r.calls.read++; return options.input ? options.input(r) : Promise.resolve(r.text); }),
    inspectOriginal: F((profile, g) => { g(); r.calls.inspect++; r.profile = profile; if (options.inspect) return options.inspect(r);
      const c = consume(profile); release(profile); return Promise.resolve(capture(d.rawSigned, c.expectedOriginal)); }),
    writeResult: F((line, g) => { g(); r.calls.write++; r.writes.push(line); return options.write ? options.write(r) : Promise.resolve(undefined); }),
    close: F(() => { r.calls.close++; r.closed = true; return options.close ? options.close(r) : Promise.resolve(undefined); }),
    inspect: F(() => F({ lifecycle: r.closed ? 'CLOSED' : 'OPEN', held: false, reading: false, writing: false })), clock: F(() => r.now),
    armTimer: F((budget, callback) => { const t = { budget, callback, cancelled: false }; r.timers.push(t); return t; }), cancelTimer: F(t => { t.cancelled = true; }) });
  r.run = () => coordinate({ arguments: argv(['--signer-inspect-fd','3','--output-fd','6','--bootstrap-ms','1000']), ports: r.ports }); return r;
}
check('signer-inspection-argv-has-two-explicit-distinct-fds-and-no-key-slot', () => {
  assert.deepEqual(argv(['--signer-inspect-fd','3','--output-fd','6','--bootstrap-ms','1000']), { mode: 'SIGNER_INSPECT', signerInspectionFd: 3, outputFd: 6, bootstrapMs: 1000 });
  for (const a of [['--signer-inspect-fd','3','--output-fd','3','--bootstrap-ms','1'],['--signer-inspect-fd','03','--output-fd','6','--bootstrap-ms','1'],['--signer-inspect-fd','3','--key-fd','4','--output-fd','6','--bootstrap-ms','1']]) assert.throws(() => argv(a));
});
check('signer-inspection-profile-captures-one-existing-owner-token-and-independent-original', () => {
  const d = fixture(), p = decode(canonicalJson(d.envelope)), c = consume(p); assert.equal(c.fileConfiguration.storageProfile.mode, 'OPEN_EXISTING'); assert.equal(c.fileConfiguration.storageProfile.ownerToken.epoch, 1);
  assert.equal(c.expectedOriginal.originalDigest, d.row.originalDigest); assert.ok(!JSON.stringify(p).includes('/synthetic/')); assert.throws(() => consume(p)); release(p); assert.throws(() => consume(p));
});
check('signer-inspection-profile-has-no-create-adoption-or-owner-discovery-fallback', () => {
  for (const edit of [validCreatingMode, e => { delete e.spendingFile.storageProfile.ownerToken; }, e => { e.spendingFile.storageProfile.ownerToken.epoch = 0; }]) {
    const d = fixture(); edit(d.envelope); assert.throws(() => decode(canonicalJson(d.envelope)));
  }
});
check('signer-inspection-profile-cannot-select-a-key-sdk-module-or-callback', () => {
  for (const key of ['keyPair','module','openFile','transport','sign']) { const d = fixture(); d.envelope[key] = 'unselected'; assert.throws(() => decode(canonicalJson(d.envelope))); }
});
check('signer-inspection-profile-refuses-invalid-independent-pins-and-multiple-recipients', () => {
  for (const edit of [e => { e.expectedOriginal.originalDigest = 'unknown'; }, e => { e.expectedOriginal.paymentId = ''; }, e => { e.expectedOriginal.fundingResourceUrl = 'https://foreign.invalid/other'; },
    e => { e.spendingFile.storageProfile.policy.recipients.push('another.recipient'); }]) { const d = fixture(); edit(d.envelope); assert.throws(() => decode(canonicalJson(d.envelope))); }
});
check('signer-inspection-profile-refuses-noncanonical-or-oversized-input', () => {
  const d = fixture(), raw = canonicalJson(d.envelope); assert.throws(() => decode(raw + '\n')); assert.throws(() => decode(' ' + raw)); assert.throws(() => decode(' '.repeat(16385)));
});
check('signer-inspection-owner-reads-once-and-closes-before-returning-exact-history', () => {
  const r = owner(), result = r.run(); assert.equal(result.status, 'SIGNED_DATA'); assert.equal(result.authority, 'NONE'); assert.equal(result.serializedCheckpoint, capture(r.rawSigned, r.expected).serializedCheckpoint);
  assert.deepEqual(r.trace, ['open','read','revoke','close']); assert.deepEqual(r.calls, { open: 1, read: 1, revoke: 1, close: 1 });
});
check('signer-inspection-intent-only-history-never-invents-a-signature-or-packet', () => {
  const d = fixture(), r = owner({ raw: d.rawIntent }), result = r.run(); assert.equal(result.status, 'INTENT_ONLY'); assert.equal(result.serializedCheckpoint, null); assert.equal(result.maySignPayment, false); assert.equal(result.automaticRetry, false);
});
check('signer-inspection-absence-is-historical-and-cannot-release-reservation-authority', () => {
  const r = owner({ raw: null }), result = r.run(); assert.equal(result.status, 'NOT_RECORDED'); assert.equal(result.inputDigestMatched, false); assert.equal(result.transactionHash, null); assert.equal(result.mayStartPayment, false);
});
check('signer-inspection-foreign-original-is-refused-and-known-file-is-closed-once', () => {
  const r = owner(); assert.throws(() => r.run({ ...r.expected, originalDigest: 'sha256:' + 'ff'.repeat(32) })); assert.equal(r.calls.close, 1);
  const d = fixture(); assert.throws(() => capture(d.rawSigned, { ...d.expected, paymentId: 'foreign' })); assert.throws(() => capture(d.rawSigned, { ...d.expected, fundingResourceUrl: 'https://foreign.invalid/funding' }));
});
check('signer-inspection-clean-read-failure-still-revokes-and-closes-known-owner', () => {
  const r = owner({ readThrow: true }); assert.throws(r.run); assert.equal(r.calls.revoke, 1); assert.equal(r.calls.close, 1);
});
check('signer-inspection-held-read-does-not-force-a-physical-close', () => {
  const r = owner({ readHeld: true }); assert.throws(r.run); assert.equal(r.calls.revoke, 1); assert.equal(r.calls.close, 0);
});
check('signer-inspection-unreturned-or-malformed-open-has-no-competing-stop', () => {
  for (const option of [{ openThrow: true }, { malformedOwner: true }]) { const r = owner(option); assert.throws(r.run); assert.equal(r.calls.read, 0); assert.equal(r.calls.revoke, 0); assert.equal(r.calls.close, 0); }
});
check('signer-inspection-failed-or-nonvoid-revoke-never-enters-physical-close', () => {
  for (const option of [{ revokeThrow: true }, { nonvoidRevoke: true }]) { const r = owner(option); assert.throws(r.run); assert.equal(r.calls.revoke, 1); assert.equal(r.calls.close, 0); }
});
check('signer-inspection-close-failure-or-false-closed-view-is-never-retried', () => {
  for (const option of [{ closeThrow: true }, { badClosedView: true }]) { const r = owner(option); assert.throws(r.run); assert.equal(r.calls.close, 1); }
});
check('signer-inspection-output-grammar-excludes-extra-fields-and-action-authority', () => {
  const d = fixture(), result = capture(d.rawSigned, d.expected); for (const edit of [{ mayDispatchFunding: true }, { maySignPayment: true }, { automaticRetry: true }, { rawContext: 'unselected' }]) assert.throws(() => output(F({ ...result, ...edit })));
});
check('signer-inspection-output-keeps-checkpoint-pins-hash-and-origin-consistent', () => {
  const d = fixture(), result = capture(d.rawSigned, d.expected);
  for (const edit of [{ transactionHash: '0'.repeat(64) }, { serializedCheckpoint: result.serializedCheckpoint + ' ' }, { fundingResourceUrl: 'https://foreign.invalid/funding' }]) assert.throws(() => output(F({ ...result, ...edit })));
});
check('signer-inspection-expired-open-is-cleaned-without-reading-or-returning-history', () => {
  const r = owner({ expireAfterOpen: true }); assert.throws(r.run); assert.equal(r.calls.read, 0); assert.equal(r.calls.close, 1);
});
check('signer-inspection-expired-read-is-cleaned-without-renewing-observation', () => {
  const r = owner({ expireAfterRead: true }); assert.throws(r.run); assert.equal(r.calls.read, 1); assert.equal(r.calls.close, 1);
});
check('signer-inspection-late-sync-protocol-close-cannot-upgrade-unknown', async () => {
  const late = deferred(), r = owner({ closePromise: late.promise }); assert.throws(r.run); late.resolve(undefined); await flush(); assert.equal(r.calls.close, 1); assert.equal(r.phase, 'REVOKED');
});
check('signer-inspection-an-already-returned-owner-cannot-be-read-or-closed-again', () => {
  const r = owner(); r.run(); assert.throws(r.run); assert.equal(r.calls.read, 1); assert.equal(r.calls.revoke, 1); assert.equal(r.calls.close, 1);
});
check('signer-inspection-coordinator-writes-one-private-original-data-record', async () => {
  const r = coordinator(), result = await r.run(); assert.equal(result.exitCode, 0); assert.equal(r.calls.inspect, 1); assert.equal(r.calls.write, 1); assert.equal(r.calls.close, 1);
  const value = JSON.parse(r.writes[0]); assert.equal(value.status, 'SIGNED_DATA'); assert.equal(value.serializedCheckpoint, capture(r.rawSigned, r.expected).serializedCheckpoint); assert.equal(value.mayDispatchFunding, false);
});
check('signer-inspection-invalid-profile-closes-pipes-without-native-entry', async () => {
  const r = coordinator(); r.text = '{}'; const result = await r.run(); assert.equal(result.status, 'BOOTSTRAP_REFUSED'); assert.equal(r.calls.inspect, 0); assert.equal(r.calls.close, 1);
});
check('signer-inspection-create-mode-is-refused-before-owned-store-entry', async () => {
  const r = coordinator(); validCreatingMode(r.envelope); r.text = canonicalJson(r.envelope); const result = await r.run(); assert.equal(result.status, 'BOOTSTRAP_REFUSED'); assert.equal(r.calls.inspect, 0);
});
check('signer-inspection-profile-deadline-cannot-later-open-a-file', async () => {
  const late = deferred(), r = coordinator({ input: () => late.promise }), running = r.run(); await flush(); r.now = 1000000000n; r.timers[0].callback(); const result = await running;
  late.resolve(r.text); await flush(); assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(r.calls.inspect, 0); assert.equal(r.calls.write, 0);
});
check('signer-inspection-late-native-history-result-never-writes-after-expiry', async () => {
  const late = deferred(), r = coordinator({ inspect: () => late.promise }), running = r.run(); await flush(); r.now = 1000000000n; r.timers[0].callback(); const result = await running;
  consume(r.profile); release(r.profile); late.resolve(capture(r.rawSigned, r.expected)); await flush(); assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(r.calls.write, 0); assert.equal(r.calls.close, 1);
});
check('signer-inspection-coordinator-compares-the-result-to-its-original-profile', async () => {
  const r = coordinator({ inspect: r => { consume(r.profile); release(r.profile); return Promise.resolve(F({ ...capture(r.rawSigned, r.expected), paymentId: 'foreign' })); } });
  const result = await r.run(); assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(r.calls.write, 0);
});
check('signer-inspection-coordinator-refuses-injected-authority-before-output', async () => {
  const r = coordinator({ inspect: r => { consume(r.profile); release(r.profile); return Promise.resolve(F({ ...capture(r.rawSigned, r.expected), mayStartPayment: true })); } });
  const result = await r.run(); assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(r.calls.write, 0);
});
check('signer-inspection-output-loss-does-not-reopen-reread-or-retry', async () => {
  const r = coordinator({ write: () => Promise.reject(Error('declared output loss')) }), result = await r.run(); assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.deepEqual(r.calls, { read: 1, inspect: 1, write: 1, close: 1 });
});
check('signer-inspection-late-channel-close-never-upgrades-the-first-unknown', async () => {
  const late = deferred(), r = coordinator({ close: () => late.promise }), running = r.run(); await flush(); assert.equal(r.timers.length, 2);
  r.timers[1].callback(); const result = await running; late.resolve(undefined); await flush(); assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(r.calls.close, 1);
});
check('signer-inspection-nontext-profile-refuses-before-native-entry', async () => {
  const r = coordinator({ input: () => Promise.resolve(42) }), result = await r.run(); assert.equal(result.status, 'BOOTSTRAP_REFUSED'); assert.equal(r.calls.inspect, 0);
});
check('signer-inspection-declared-stale-token-is-not-discovered-or-rebound', () => {
  const r = owner({ staleEpoch: true }); assert.throws(r.run); assert.equal(r.calls.open, 1); assert.equal(r.calls.read, 0); assert.equal(r.calls.close, 0);
});

export const apiCreditSignerInspectionDataCases = F([...checks]);
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
const cases = [];
for (const { id, run } of checks) { try { await run(); cases.push({ id, status: 'PASS' }); } catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); } }
await closeApiCreditOperatorDataFixtures(); const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'G2_KEYLESS_SIGNER_INSPECTION_DATA', passed: cases.length - failed, failed, cases, priorCases: apiCreditSignerContextDataCases.length,
  declaredFileClockAndPipePortsOnly: true, nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
  nativeReopen: 'NOT_ESTABLISHED', physicalRelease: 'NOT_ESTABLISHED', actualSignerLoss: 'NOT_ESTABLISHED', Linux: 'NOT_ESTABLISHED', fullG2: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;
}
