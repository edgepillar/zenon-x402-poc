// Pure codecs/ownership/coordinator with declared ports; no native inspection.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { apiCreditSingleOriginalDataCases } from './api-credit-single-original.behavior.mjs';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as assemble } from '../src/zenon/dynamic-plasma-original-funding-data.js';
import { restoreOriginalPaymentCheckpoint } from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { canonicalJson } from '../src/canonical.js';
import { captureApiCreditCliArguments as args } from '../src/api-credit-cli-arguments.js';
import { captureBuyerOriginalFundingCommandLimits as limits } from '../src/buyer-original-funding-command.js';
import { decodeApiCreditRecoveryInspectionProfile as decode, consumeApiCreditRecoveryInspectionProfile as consume,
  releaseApiCreditRecoveryInspectionProfile as release } from '../src/api-credit-recovery-inspection-profile.js';
import { runServiceCreditRecoveryInspectionOwner as owner, captureServiceCreditRecoveryInspectionResult as redact,
  captureServiceCreditRecoveryInspectionOutput as output } from '../src/service-credit-recovery-inspection-owner.js';
import { runApiCreditRecoveryInspectionCoordinator as coordinate } from '../src/api-credit-recovery-inspection-coordinator.js';

const F = Object.freeze, checks = [...apiCreditSingleOriginalDataCases];
function check(id, run) { checks.push({ id, run }); }
function pending() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function flush() { for (let i = 0; i < 32; i++) await Promise.resolve(); }
function envelope() {
  const f = retainedOriginalInputFixture(), packet = assemble(f.input, f.candidate, f.resourceUrl);
  return JSON.parse(canonicalJson({ recoveryInspectionVersion: 1, selection: { originalPayment: { resourceUrl: f.resourceUrl,
    serializedCheckpoint: packet.serializedCheckpoint, expectedPins: packet.expectedPins }, selectedGrantId: 'grant.synthetic', paymentRequiredHeader: f.input.challenge.paymentRequiredHeader },
    payerOptions: { databasePath: '/synthetic/recovery/payer.sqlite', allowedRoot: '/synthetic/recovery', fundingResourceUrl: f.resourceUrl,
      custodyPolicy: { policyVersion: 1, serviceResourceUrl: new URL(f.resourceUrl).origin + '/service-credit/v1/execute', maxRequests: 128 }, selectedGrantId: 'grant.synthetic', deadlineMs: 500 },
    backendOptions: { databasePath: '/synthetic/recovery/backend.sqlite', limits: { busyTimeoutMs: 20, maxStateBytes: 65536, maxOffers: 8, maxGrants: 8, maxRequests: 128 } },
    requestKey: { grantId: 'grant.synthetic', requestId: 'request.original' }, authorizationHeader: 'ServiceCredit declared-original-proof' }));
}
function observed(status = 'CACHED_SUCCESS') { return F({ status, backend: F({ status }), authority: 'NONE', mayDispatchService: false,
  mayStartPayment: false, maySignPayment: false, deliveryConfirmed: false, serviceDelivery: 'NOT_ESTABLISHED' }); }
function owned(options = {}) {
  const profile = decode(canonicalJson(envelope())), captured = consume(profile); release(profile);
  const r = { trace: [], backend: {}, closed: false, closeCalls: 0, backendCloseCalls: 0, reads: 0, checkpointReads: 0,
    captured, guard: F(() => { if (r.expired) throw Error('declared expiry'); }), expired: false };
  const cp = restoreOriginalPaymentCheckpoint(captured.serializedCheckpoint, captured.manifest.expectedCheckpointPins);
  r.payer = F({ readOriginalPaymentCheckpoint: F(pins => { assert.deepEqual(pins, captured.manifest.expectedCheckpointPins); r.checkpointReads++;
    if (options.changedCheckpoint && r.checkpointReads === 2) return F({ ...cp, authorization: 'CHANGED' }); return cp; }),
    readOriginalBackendRecoveryState: F((key, proof, pins) => { r.trace.push('read'); r.reads++;
      assert.deepEqual(key, captured.manifest.requestKey); assert.equal(proof, captured.authorizationHeader); assert.deepEqual(pins, captured.manifest.expectedCheckpointPins);
      if (options.readThrow) throw Error('private declared read detail'); return options.result ?? observed(); }),
    close: F(() => { r.trace.push('payer-close'); r.closeCalls++; if (options.closeThrow) throw Error('declared close failure');
      if (options.closePromise) return options.closePromise; r.closed = true; return Promise.resolve(options.nonvoidClose ? true : undefined); }),
    snapshot: F(() => { if (options.snapshotThrow) throw Error('declared snapshot failure'); return F({ closed: r.closed, reading: false, unavailable: options.readThrow ?? false,
      storeOwnership: 'PAYER_OWNED_BACKEND_BORROWED', client: F({ resource: F({ phase: r.closed ? 'RELEASED' : 'OPEN', slotHeld: !r.closed,
        admissionClosed: r.closed, storeCloseAttempts: r.closed ? 1 : 0, storeCloseOutcome: r.closed ? 'RETURNED' : 'NOT_ATTEMPTED' }),
      close: F({ requested: r.closeCalls === 1, outcome: r.closed && !options.badView ? 'DRAINED' : 'WAITING', childUncertainty: false, unknownUndrained: false }) }) }); }) });
  r.ports = F({ openBackend: F(() => { r.trace.push('backend-open'); if (options.backendThrow) throw Error('declared backend open'); return r.backend; }),
    openPayer: F((m, b) => { r.trace.push('payer-open'); assert.equal(m, captured.manifest); assert.equal(b, r.backend);
      if (options.openThrow) throw Error('declared unreturned payer'); if (options.openPromise) return options.openPromise;
      if (options.expireOnOpen) r.expired = true; return Promise.resolve(r.payer); }),
    closeBackend: F(b => { assert.equal(b, r.backend); r.trace.push('backend-close'); r.backendCloseCalls++;
      if (options.backendCloseThrow) throw Error('declared backend close'); return options.backendCloseNonvoid ? true : undefined; }) });
  r.run = () => owner({ manifest: captured.manifest, authorizationHeader: captured.authorizationHeader,
    serializedCheckpoint: captured.serializedCheckpoint, ports: r.ports, requireOpening: r.guard }); return r;
}
function coordinator(options = {}) {
  const r = { text: canonicalJson(envelope()), now: 0n, timers: [], writes: [], inspectionCalls: 0, closes: 0, closed: false, profile: null };
  r.ports = F({ readProfile: F(g => { g(); return options.input ? options.input(r) : Promise.resolve(r.text); }),
    inspectOriginal: F((p, g) => { g(); r.profile = p; r.inspectionCalls++;
      if (options.inspect) return options.inspect(r); consume(p); release(p); return Promise.resolve(redact(observed())); }),
    writeResult: F((line, g) => { g(); r.writes.push(line); return options.write ? options.write(r) : Promise.resolve(undefined); }),
    close: F(() => { r.closes++; r.closed = true; return options.close ? options.close(r) : Promise.resolve(undefined); }),
    inspect: F(() => F({ lifecycle: r.closed ? 'CLOSED' : 'OPEN', held: false, reading: false, writing: false })), clock: F(() => r.now),
    armTimer: F((budget, callback) => { const token = { budget, callback, cancelled: false }; r.timers.push(token); return token; }),
    cancelTimer: F(token => { token.cancelled = true; }) });
  r.run = () => coordinate({ arguments: args(['--inspect-fd', '3', '--output-fd', '6', '--bootstrap-ms', '1000']), ports: r.ports }); return r;
}
check('inspection-argv-has-two-explicit-distinct-pipes-and-no-wallet-key-slot', () => {
  assert.deepEqual(args(['--inspect-fd', '3', '--output-fd', '6', '--bootstrap-ms', '1000']), { mode: 'INSPECT', inspectionFd: 3, outputFd: 6, bootstrapMs: 1000 });
  for (const a of [['--inspect-fd','3','--output-fd','3','--bootstrap-ms','1'],['--inspect-fd','03','--output-fd','6','--bootstrap-ms','1'],
    ['--inspect-fd','3','--key-fd','4','--output-fd','6','--bootstrap-ms','1']]) assert.throws(() => args(a));
  assert.equal(limits({ maxCommands: 2, maxLineBytes: 65536, maxInputBytes: 65537, maxOutputBytes: 65536, closeWaitMs: 1000 }).maxCommands, 2);
});
check('inspection-profile-captures-independent-exact-original-before-native-entry', () => {
  const raw = envelope(), p = decode(canonicalJson(raw)), c = consume(p); assert.ok(Object.isFrozen(c));
  assert.equal(c.serializedCheckpoint, raw.selection.originalPayment.serializedCheckpoint); assert.equal(c.manifest.requestKey.requestId, 'request.original');
  assert.throws(() => consume(p)); assert.ok(!JSON.stringify(p).includes(raw.authorizationHeader)); release(p); release(p);
});
check('inspection-profile-has-no-key-loader-transport-module-or-dispatch-selector', () => {
  for (const key of ['keyPair', 'keyFile', 'module', 'transportOptions', 'submitOriginal']) { const e = envelope(); e[key] = 'unselected'; assert.throws(() => decode(canonicalJson(e))); }
});
check('inspection-profile-rejects-noncanonical-wire-altered-pins-and-foreign-grant', () => {
  const text = canonicalJson(envelope()); assert.throws(() => decode(text + '\n')); assert.throws(() => decode(' ' + text));
  for (const edit of [e => { e.selection.originalPayment.expectedPins.digests.context = '0'.repeat(64); },
    e => { e.requestKey.grantId = 'foreign'; }, e => { e.payerOptions.selectedGrantId = 'foreign'; },
    e => { e.selection.originalPayment.serializedCheckpoint += ' '; }]) { const e = envelope(); edit(e); assert.throws(() => decode(canonicalJson(e))); }
});
check('inspection-profile-rejects-path-sidecar-aliases-and-oversized-or-missing-proof', () => {
  for (const edit of [e => { e.backendOptions.databasePath = e.payerOptions.databasePath; }, e => { e.backendOptions.databasePath = e.payerOptions.databasePath + '-journal'; },
    e => { e.payerOptions.allowedRoot = '/foreign'; }, e => { e.payerOptions.databasePath = '/synthetic/recovery/nested/payer.sqlite'; },
    e => { e.backendOptions.databasePath = '/synthetic/recovery/nested/backend.sqlite'; },
    e => { e.authorizationHeader = ''; }, e => { e.authorizationHeader = 'ServiceCredit ' + 'x'.repeat(1024); },
    e => { e.authorizationHeader += '\n'; }, e => { e.authorizationHeader += '\ud800'; },
    e => { e.backendOptions.databasePath += '\ud800'; }]) { const e = envelope(); edit(e); assert.throws(() => decode(canonicalJson(e))); }
});
check('inspection-profile-release-and-lookalikes-cannot-restore-native-authority', () => {
  const p = decode(canonicalJson(envelope())); assert.throws(() => consume(F({ ...p }))); assert.throws(() => release(F({ ...p })));
  release(p); assert.throws(() => consume(p));
});
check('inspection-owner-reuses-exact-checkpoint-and-closes-payer-before-backend-once', async () => {
  const r = owned(), result = await r.run(); assert.equal(result.status, 'CACHED_SUCCESS'); assert.equal(result.authority, 'NONE');
  assert.deepEqual(r.trace, ['backend-open','payer-open','read','payer-close','backend-close']); assert.equal(r.checkpointReads, 2);
  assert.equal(r.closeCalls, 1); assert.equal(r.backendCloseCalls, 1); assert.ok(!JSON.stringify(result).includes(r.captured.authorizationHeader));
});
check('inspection-redaction-keeps-cache-and-absence-powerless-and-excludes-extra-payloads', () => {
  for (const status of ['CACHED_SUCCESS', 'NOT_RECORDED', 'CLIENT_RECONCILIATION_REQUIRED', 'UNAUTHORIZED']) {
    const r = output(redact(observed(status))); assert.equal(r.mayStartPayment, false); assert.equal(r.maySignPayment, false); assert.equal(r.mayDispatchService, false);
    assert.equal(r.deliveryConfirmed, false); assert.throws(() => output(F({ ...r, authorizationHeader: 'private' })));
  }
  assert.throws(() => redact(F({ ...observed(), mayDispatchService: true })));
});
check('inspection-owner-read-failure-still-closes-proven-quiescent-owners-without-output', async () => {
  const r = owned({ readThrow: true }); await assert.rejects(r.run()); assert.equal(r.closeCalls, 1); assert.equal(r.backendCloseCalls, 1);
});
check('inspection-owner-different-checkpoint-after-query-refuses-history-result', async () => {
  const r = owned({ changedCheckpoint: true }); await assert.rejects(r.run()); assert.equal(r.reads, 1); assert.equal(r.backendCloseCalls, 1);
});
check('inspection-owner-unreturned-payer-does-not-close-its-borrowed-backend', async () => {
  const r = owned({ openThrow: true }); await assert.rejects(r.run()); assert.equal(r.closeCalls, 0); assert.equal(r.backendCloseCalls, 0);
});
check('inspection-owner-invalid-opening-promise-does-not-assimilate-a-foreign-thenable', async () => {
  let entered = 0; const fake = {}; Object.defineProperty(fake, 'then', { get() { entered++; throw Error('do not enter'); } });
  const r = owned({ openPromise: fake }); await assert.rejects(r.run()); assert.equal(entered, 0); assert.equal(r.backendCloseCalls, 0);
});
check('inspection-owner-failed-or-nonvoid-payer-close-retains-the-backend', async () => {
  for (const option of [{ closeThrow: true }, { nonvoidClose: true }, { badView: true }, { snapshotThrow: true }]) {
    const r = owned(option); await assert.rejects(r.run()); assert.equal(r.closeCalls, 1); assert.equal(r.backendCloseCalls, 0);
  }
});
check('inspection-owner-backend-close-failure-is-never-retried', async () => {
  const r = owned({ backendCloseThrow: true }); await assert.rejects(r.run()); assert.equal(r.closeCalls, 1); assert.equal(r.backendCloseCalls, 1);
});
check('inspection-owner-late-known-payer-is-cleaned-but-expired-scope-never-emits-history', async () => {
  const late = pending(), r = owned({ openPromise: late.promise }), result = r.run(); await flush(); r.expired = true; late.resolve(r.payer);
  await assert.rejects(result); assert.equal(r.reads, 0); assert.equal(r.closeCalls, 1); assert.equal(r.backendCloseCalls, 1);
});
check('inspection-coordinator-decodes-before-native-and-writes-one-redacted-record', async () => {
  const r = coordinator(), result = await r.run(); assert.equal(result.exitCode, 0); assert.equal(r.inspectionCalls, 1); assert.equal(r.closes, 1); assert.equal(r.writes.length, 1);
  const history = JSON.parse(r.writes[0]); assert.equal(history.status, 'CACHED_SUCCESS'); assert.equal(history.deliveryConfirmed, false);
  assert.ok(!r.writes[0].includes('declared-original-proof')); assert.equal(result.nativeResourceRelease, 'NOT_ESTABLISHED');
});
check('inspection-coordinator-invalid-profile-closes-input-without-native-entry', async () => {
  const r = coordinator(); r.text = '{}'; const result = await r.run(); assert.equal(result.status, 'BOOTSTRAP_REFUSED');
  assert.equal(r.inspectionCalls, 0); assert.equal(r.writes.length, 0); assert.equal(r.closes, 1);
});
check('inspection-coordinator-read-deadline-cannot-later-open-a-store', async () => {
  const late = pending(), r = coordinator({ input: () => late.promise }), result = r.run(); await flush();
  r.now = 1000000000n; r.timers[0].callback(); const closed = await result; late.resolve(r.text); await flush();
  assert.equal(closed.status, 'CLOSE_UNKNOWN'); assert.equal(r.inspectionCalls, 0); assert.equal(r.writes.length, 0); assert.equal(r.closes, 1);
});
check('inspection-coordinator-late-native-result-never-writes-or-upgrades-unknown', async () => {
  const late = pending(), r = coordinator({ inspect: () => late.promise }), result = r.run(); await flush();
  r.now = 1000000000n; r.timers[0].callback(); const closed = await result; consume(r.profile); release(r.profile); late.resolve(redact(observed())); await flush();
  assert.equal(closed.status, 'CLOSE_UNKNOWN'); assert.equal(r.inspectionCalls, 1); assert.equal(r.writes.length, 0); assert.equal(r.closes, 1);
});
check('inspection-coordinator-rejects-result-authority-and-does-not-write-partial-history', async () => {
  const r = coordinator({ inspect: r => { consume(r.profile); release(r.profile); return Promise.resolve(F({ ...redact(observed()), mayStartPayment: true })); } });
  const result = await r.run(); assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(r.writes.length, 0); assert.equal(r.closes, 1);
});
check('inspection-coordinator-write-loss-or-close-failure-never-retries-the-read', async () => {
  for (const options of [{ write: () => Promise.reject(Error('declared write loss')) }, { close: () => Promise.reject(Error('declared close loss')) }]) {
    const r = coordinator(options), result = await r.run(); assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(r.inspectionCalls, 1); assert.equal(r.writes.length, 1); assert.equal(r.closes, 1);
  }
});

export const apiCreditRecoveryInspectionDataCases = F([...checks]);
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
const cases = [];
for (const { id, run } of checks) { try { await run(); cases.push({ id, status: 'PASS' }); } catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); } }
await closeApiCreditOperatorDataFixtures(); const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'G2_KEYLESS_ORIGINAL_INSPECTION_DATA', passed: cases.length - failed, failed, cases,
  priorCases: apiCreditSingleOriginalDataCases.length, declaredPortsOnly: true, nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0,
  nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0, nativeReopen: 'NOT_ESTABLISHED', nativeRelease: 'NOT_ESTABLISHED', fullG2: 'NOT_ESTABLISHED' }));
if (failed) process.exitCode = 1;
}
