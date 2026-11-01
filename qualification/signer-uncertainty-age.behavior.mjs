// Actual journal/profile/inspection/coordinator; declared memory file/day/pipe ports.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { signerContextDataFixture } from './api-credit-signer-context.behavior.mjs';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { createOriginalFundingSignerContextIntent, completeOriginalFundingSignerContextRecord } from '../src/original-funding-signer-context-custody.js';
import { createOriginalFundingSpendingReservations } from '../src/original-funding-spending-reservations.js';
import { captureOriginalFundingUncertaintyAgeLimits } from '../src/original-funding-uncertainty-age.js';
import { decodeApiCreditSignerInspectionProfile as decode, consumeApiCreditSignerInspectionProfile as consume,
  releaseApiCreditSignerInspectionProfile as release } from '../src/api-credit-signer-inspection-profile.js';
import { runApiCreditSignerInspectionOwner as legacyOwner, runApiCreditSignerInspectionWithUncertaintyAgeOwner as ageOwner,
  captureApiCreditSignerInspectionOutput as captureOutput, captureApiCreditSignerInspectionResult } from '../src/original-funding-signer-inspection-owner.js';
import { runApiCreditSignerInspectionCoordinator } from '../src/api-credit-recovery-inspection-coordinator.js';
import { captureApiCreditCliArguments } from '../src/api-credit-cli-arguments.js';

const F = Object.freeze, checks = [], check = (id, run) => checks.push({ id, run });
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
async function flush() { for (let i = 0; i < 32; i++) await Promise.resolve(); }
function fixture(options = {}, data = signerContextDataFixture()) {
  const d = data, policy = { version: 1, policyId: options.policyId ?? 'synthetic.age.inspection', accountId: d.unsigned.address,
    network: d.row.network, asset: d.row.asset, recipients: [d.row.recipient], maxPayment: d.row.amount,
    maxTotal: d.row.amount, maxDaily: d.row.amount, maxRecords: 4 };
  const r = { d, policy, raw: null, expired: false, phase: 'OPEN', trace: [], days: options.days ?? [12, 12],
    calls: { open: 0, spending: 0, current: 0, signer: 0, revoke: 0, close: 0, day: 0, ownerCAS: 0 } };
  r.database = F({ load() { return r.raw; }, compareAndSwap(account, before, after) {
    assert.equal(account, policy.accountId); if (before !== r.raw) return null; r.raw = after; return after;
  } });
  if (!options.absent) {
    const j = createOriginalFundingSpendingReservations(policy, r.database);
    const row = { ...Object.fromEntries(['paymentId', 'originalDigest', 'network', 'asset', 'recipient', 'amount'].map(k => [k, d.row[k]])),
      ...(options.foreignDigest ? { originalDigest: 'sha256:' + 'f'.repeat(64) } : {}) };
    j.reserve(row, 10); if (options.status !== 'RESERVED') j.observe(row.paymentId, row.originalDigest, options.status ?? 'UNKNOWN', 10); j.close();
  }
  const unsigned = createOriginalFundingSignerContextIntent(d.row, d.unsigned, d.context);
  r.signer = options.signer === 'ABSENT' ? null : options.signer === 'INTENT' ? unsigned : completeOriginalFundingSignerContextRecord(unsigned, d.signed, d.row);
  r.envelope = { signerInspectionVersion: 2, spendingFile: { storageProfile: { version: 1, mode: 'OPEN_EXISTING',
    databasePath: '/synthetic/signer-age/ledger.sqlite', policy,
    ownerToken: { version: 1, storeId: 'synthetic.store', accountId: policy.accountId, ownerId: 'synthetic.owner', epoch: 1, minimumRevision: 0 } },
    allowedRoot: '/synthetic/signer-age', filePolicy: { expectedDevice: '1', reservedBytes: '0', maxDatabaseBytes: 4194304 } },
    expectedOriginal: { paymentId: d.row.paymentId, originalDigest: d.row.originalDigest, fundingResourceUrl: d.f.resourceUrl },
    uncertaintyAgeLimits: { version: 1, maximumUnresolvedAgeDays: options.maximum ?? 1 } };
  // Match the actual native file owner's ordinary, non-frozen backend methods.
  const backend = F({ load(account) { assert.equal(account, policy.accountId); r.calls.spending++; r.trace.push('spending');
    if (options.onSpending) return options.onSpending(r); return r.raw;
  }, compareAndSwap() { r.calls.ownerCAS++; throw Error('inspection must not enter CAS'); } });
  r.owner = F({ backend: options.malformedBackend ? F({}) : backend,
    assertCurrent: F(() => { r.calls.current++; r.trace.push('current'); if (options.onCurrent) return options.onCurrent(r); r.database.load(policy.accountId); }),
    signerCustody: F({ requirePreparationContext: true, readSignerRecord: F(id => {
      assert.equal(id, d.row.paymentId); r.calls.signer++; r.trace.push('signer');
      if (options.onSigner) return options.onSigner(r); return r.signer;
    }) }),
    revoke: F(() => { r.calls.revoke++; r.trace.push('revoke'); r.phase = 'REVOKED'; }),
    close: F(() => { r.calls.close++; r.trace.push('close'); if (options.closeResult) return options.closeResult; r.phase = 'CLOSED'; }),
    inspect: F(() => F({ spendingFileOwnerVersion: 1, lifecycle: r.phase, held: false, busy: false,
      backendClosed: r.phase !== 'OPEN', databaseOpen: r.phase !== 'CLOSED', physicalCloseEntered: r.phase === 'CLOSED', physicalCloseReturned: r.phase === 'CLOSED' })) });
  r.guard = F(() => { if (r.expired) throw Error('declared expired observation'); });
  r.ports = F({ openFile: F(c => { r.calls.open++; r.trace.push('open'); assert.equal(c.storageProfile.mode, 'OPEN_EXISTING'); return r.owner; }) });
  r.day = F(() => { r.calls.day++; r.trace.push('day'); return r.days[Math.min(r.calls.day - 1, r.days.length - 1)]; });
  r.configuration = () => { const p = decode(canonicalJson(r.envelope)); try { return consume(p); } finally { release(p); } };
  r.run = () => ageOwner({ ...r.configuration(), ports: r.ports, requireOpening: r.guard, readDay: r.day });
  return r;
}
function coordinator(r, options = {}) {
  const s = { now: 0n, timers: [], closed: false, writes: [], calls: { inspect: 0, write: 0, close: 0 } };
  const ports = F({ readProfile: F(g => { g(); return Promise.resolve(canonicalJson(r.envelope)); }),
    inspectOriginal: F((profile, g) => { g(); s.calls.inspect++;
      if (options.inspect) return options.inspect(profile, g);
      try { const c = consume(profile); return Promise.resolve(ageOwner({ ...c, ports: r.ports, requireOpening: g, readDay: r.day })); }
      finally { release(profile); }
    }),
    writeResult: F((line, g) => { g(); s.calls.write++; assert.equal(r.phase, 'CLOSED'); s.writes.push(line);
      return options.writeLoss ? Promise.reject(Error('declared output loss')) : Promise.resolve(undefined); }),
    close: F(() => { s.calls.close++; s.closed = true; return Promise.resolve(undefined); }),
    inspect: F(() => F({ lifecycle: s.closed ? 'CLOSED' : 'OPEN', held: false, reading: false, writing: false })),
    clock: F(() => s.now), armTimer: F((budget, callback) => { const t = { budget, callback }; s.timers.push(t); return t; }), cancelTimer: F(() => {}) });
  s.run = () => runApiCreditSignerInspectionCoordinator({ arguments: captureApiCreditCliArguments(
    ['--signer-inspect-fd', '3', '--output-fd', '6', '--bootstrap-ms', '1000']), ports }); return s;
}
function noAuthority(v) {
  assert.equal(v.authority, 'NONE'); assert.equal(v.currentAuthority, 'NOT_ESTABLISHED');
  for (const name of ['mayStartPayment', 'maySignPayment', 'mayDispatchFunding', 'mayDispatchService', 'automaticRetry']) assert.equal(v[name], false);
  if (v.signerInspectionVersion === 2) {
    assert.equal(v.uncertaintyAge.authority, 'NONE'); assert.equal(v.uncertaintyAge.mayReleaseReservation, false);
    assert.equal(v.uncertaintyAge.spendingReservation, 'UNCHANGED');
  }
}
check('signer-age-limits-reuse-the-explicit-closed-threshold-contract', () => {
  assert.deepEqual(captureOriginalFundingUncertaintyAgeLimits({ version: 1, maximumUnresolvedAgeDays: 0 }), { version: 1, maximumUnresolvedAgeDays: 0 });
  assert.throws(() => captureOriginalFundingUncertaintyAgeLimits()); assert.throws(() => captureOriginalFundingUncertaintyAgeLimits({ version: 1, maximumUnresolvedAgeDays: 1 }, true));
});
check('signer-age-v2-profile-captures-threshold-policy-and-original-once', () => {
  const r = fixture(), p = decode(canonicalJson(r.envelope)), c = consume(p);
  assert.equal(p.signerInspectionVersion, 2); assert.equal(p.spendingPolicyId, r.policy.policyId);
  assert.ok(Object.isFrozen(p.uncertaintyAgeLimits)); assert.equal(c.uncertaintyAgeLimits.maximumUnresolvedAgeDays, 1);
  assert.equal(c.expectedOriginal.originalDigest, r.d.row.originalDigest); assert.throws(() => consume(p)); release(p); assert.throws(() => consume(p));
  assert.equal(r.calls.open, 0); assert.equal(JSON.stringify(p).includes('/synthetic/'), false);
});
check('signer-age-v2-profile-has-no-default-threshold-or-clock-selector', () => {
  for (const edit of [e => { delete e.uncertaintyAgeLimits; }, e => { e.uncertaintyAgeLimits.maximumUnresolvedAgeDays = -1; },
    e => { e.uncertaintyAgeLimits.extra = true; }, e => { e.readDay = 'unselected'; }, e => { e.observedDay = 12; }, e => { e.signerInspectionVersion = 3; }]) {
    const r = fixture(); edit(r.envelope); assert.throws(() => decode(canonicalJson(r.envelope))); assert.equal(r.calls.open, 0);
  }
});
check('signer-age-v2-profile-does-not-create-or-discover-a-store-owner', () => {
  const r = fixture(), p = r.envelope.spendingFile.storageProfile;
  p.mode = 'CREATE_NEW'; delete p.ownerToken; p.storeId = 'new'; p.ownerId = 'new'; assert.throws(() => decode(canonicalJson(r.envelope)));
  assert.equal(r.calls.open, 0);
});
check('signer-age-legacy-profile-and-owner-do-not-read-age-or-spending', () => {
  const r = fixture(); r.envelope.signerInspectionVersion = 1; delete r.envelope.uncertaintyAgeLimits;
  const result = legacyOwner({ ...r.configuration(), ports: r.ports, requireOpening: r.guard });
  assert.equal(result.signerInspectionVersion, 1); assert.equal(Object.hasOwn(result, 'uncertaintyAge'), false);
  assert.deepEqual(r.trace, ['open', 'signer', 'revoke', 'close']); assert.equal(r.calls.day, 0); assert.equal(r.calls.spending, 0); noAuthority(result);
});
check('signer-age-signed-unknown-history-uses-the-same-owned-reader-and-closes-first', () => {
  const r = fixture(), raw = r.raw, result = r.run(); noAuthority(result);
  assert.equal(result.status, 'SIGNED_DATA'); assert.equal(result.spendingOriginalStatus, 'UNKNOWN'); assert.equal(result.spendingOriginalAgeDays, 2);
  assert.equal(result.serializedCheckpoint, captureApiCreditSignerInspectionResult(r.signer, r.envelope.expectedOriginal).serializedCheckpoint);
  assert.equal(result.uncertaintyAge.operatorEscalationRequired, true); assert.equal(r.phase, 'CLOSED'); assert.equal(r.raw, raw);
  assert.deepEqual(r.calls, { open: 1, spending: 2, current: 4, signer: 1, revoke: 1, close: 1, day: 2, ownerCAS: 0 });
});
check('signer-age-ordinary-unfrozen-native-load-method-is-admitted', () => {
  const r = fixture(); assert.equal(Object.isFrozen(r.owner.backend), true); assert.equal(Object.isFrozen(r.owner.backend.load), false);
  assert.equal(r.run().signerInspectionVersion, 2); assert.equal(r.calls.ownerCAS, 0);
});
check('signer-age-intent-only-retains-reserved-exposure-without-inventing-signed-data', () => {
  const r = fixture({ signer: 'INTENT', status: 'RESERVED' }), result = r.run(); noAuthority(result);
  assert.equal(result.status, 'INTENT_ONLY'); assert.equal(result.spendingOriginalStatus, 'RESERVED'); assert.equal(result.serializedCheckpoint, null);
  assert.equal(result.uncertaintyAge.operatorEscalationRequired, true); assert.equal(result.uncertaintyAge.unknownCount, 0);
});
check('signer-age-complete-absence-is-history-without-new-work-authority', () => {
  const r = fixture({ absent: true, signer: 'ABSENT' }), result = r.run(); noAuthority(result);
  assert.equal(result.status, 'NOT_RECORDED'); assert.equal(result.spendingOriginalStatus, 'NOT_RECORDED');
  assert.equal(result.spendingOriginalReservedDay, null); assert.equal(result.spendingOriginalAgeDays, null);
  assert.equal(result.uncertaintyAge.operatorEscalationRequired, false); assert.equal(r.calls.close, 1);
});
check('signer-age-spent-history-retains-lifetime-exposure-and-original-packet', () => {
  const r = fixture({ status: 'SPENT', maximum: 0 }), before = r.raw, result = r.run(); noAuthority(result);
  assert.equal(result.spendingOriginalStatus, 'SPENT'); assert.equal(result.spendingOriginalAgeDays, null);
  assert.equal(result.uncertaintyAge.spentCount, 1); assert.equal(result.uncertaintyAge.operatorEscalationRequired, false); assert.equal(r.raw, before);
  const j = createOriginalFundingSpendingReservations(r.policy, r.database); assert.equal(j.inspect(12).totalExposure, r.d.row.amount); j.close();
});
check('signer-age-final-day-observation-does-not-renew-the-original-day', () => {
  const r = fixture({ days: [12, 13], maximum: 2 }), result = r.run();
  assert.equal(result.uncertaintyAge.observedDay, 13); assert.equal(result.spendingOriginalReservedDay, 10);
  assert.equal(result.spendingOriginalAgeDays, 3); assert.equal(result.uncertaintyAge.operatorEscalationRequired, true);
});
check('signer-age-refuses-a-spending-row-for-another-original-digest', () => {
  const r = fixture({ foreignDigest: true }); assert.throws(r.run); assert.equal(r.calls.close, 1); assert.equal(r.calls.ownerCAS, 0);
});
check('signer-age-refuses-signed-history-without-its-spending-reservation', () => {
  const r = fixture({ absent: true }); assert.throws(r.run); assert.equal(r.calls.close, 1); assert.equal(r.calls.ownerCAS, 0);
});
check('signer-age-changed-history-between-reads-withholds-the-report', () => {
  const r = fixture({ onSigner(s) { const j = createOriginalFundingSpendingReservations(s.policy, s.database);
    j.observe(s.d.row.paymentId, s.d.row.originalDigest, 'SPENT', 11); j.close(); return s.signer; } });
  assert.throws(r.run); assert.equal(r.calls.spending, 2); assert.equal(r.calls.close, 1); assert.equal(r.calls.ownerCAS, 0);
});
check('signer-age-first-clock-rollback-cannot-be-repaired-later-in-the-run', () => {
  const r = fixture({ days: [9, 14] }); assert.throws(r.run); assert.equal(r.calls.day, 1);
  assert.equal(r.calls.signer, 0); assert.equal(r.calls.close, 1);
});
check('signer-age-clock-rollback-after-the-read-withholds-original-output', () => {
  const r = fixture({ days: [12, 11] }); assert.throws(r.run); assert.equal(r.calls.day, 2); assert.equal(r.calls.close, 1);
});
check('signer-age-expired-returned-read-closes-once-without-reading-the-signer', () => {
  const r = fixture({ onSpending(s) { s.expired = true; return s.raw; } }); assert.throws(r.run);
  assert.equal(r.calls.spending, 1); assert.equal(r.calls.signer, 0); assert.equal(r.calls.revoke, 1); assert.equal(r.calls.close, 1);
});
check('signer-age-nonvoid-current-owner-check-retains-unknown-without-physical-close', async () => {
  const late = deferred(), r = fixture({ onCurrent: () => late.promise }); assert.throws(r.run);
  assert.equal(r.calls.spending, 0); assert.equal(r.calls.signer, 0); assert.equal(r.calls.revoke, 1); assert.equal(r.calls.close, 0);
  late.resolve(undefined); await flush(); assert.equal(r.calls.close, 0);
});
check('signer-age-unexpected-spending-promise-cannot-be-closed-or-upgraded-later', async () => {
  const late = deferred(), r = fixture({ onSpending: () => late.promise }); assert.throws(r.run);
  assert.equal(r.calls.signer, 0); assert.equal(r.calls.revoke, 1); assert.equal(r.calls.close, 0);
  late.resolve(r.raw); await flush(); assert.equal(r.calls.close, 0); assert.equal(r.phase, 'REVOKED');
});
check('signer-age-unexpected-signer-promise-retains-the-same-original-owner', async () => {
  const late = deferred(), r = fixture({ onSigner: () => late.promise }); assert.throws(r.run);
  assert.equal(r.calls.signer, 1); assert.equal(r.calls.spending, 1); assert.equal(r.calls.close, 0);
  late.resolve(r.signer); await flush(); assert.equal(r.calls.close, 0);
});
check('signer-age-unknown-physical-close-is-not-retried-after-a-late-return', async () => {
  const late = deferred(), r = fixture({ closeResult: late.promise }); assert.throws(r.run);
  assert.equal(r.calls.close, 1); late.resolve(undefined); await flush(); assert.equal(r.calls.close, 1);
});
check('signer-age-malformed-backend-is-not-treated-as-an-adopted-owner', () => {
  const r = fixture({ malformedBackend: true }); assert.throws(r.run);
  assert.equal(r.calls.signer, 0); assert.equal(r.calls.revoke, 0); assert.equal(r.calls.close, 0);
});
check('signer-age-invalid-clock-is-refused-before-file-entry', () => {
  const r = fixture({ days: [-0] }); assert.throws(r.run); assert.equal(r.calls.open, 0); assert.equal(r.calls.signer, 0);
});
check('signer-age-genuine-v2-output-cannot-be-rebuilt-with-injected-values', () => {
  const r = fixture(), result = r.run(); assert.equal(captureOutput(result), result);
  for (const edit of [{}, { mayStartPayment: true }, { uncertaintyAge: { ...result.uncertaintyAge, operatorEscalationRequired: false } }, { spendingOriginalStatus: 'SPENT' }])
    assert.throws(() => captureOutput(F({ ...result, ...edit })));
});
check('signer-age-returned-owner-cannot-be-read-or-closed-a-second-time', () => {
  const r = fixture(); r.run(); assert.throws(r.run); assert.equal(r.calls.signer, 1); assert.equal(r.calls.revoke, 1); assert.equal(r.calls.close, 1);
});
check('signer-age-coordinator-emits-v2-only-after-the-owned-close', async () => {
  const r = fixture(), s = coordinator(r), result = await s.run(); assert.equal(result.exitCode, 0); assert.equal(s.calls.write, 1);
  const body = JSON.parse(s.writes[0]); assert.equal(body.signerInspectionVersion, 2); assert.equal(body.uncertaintyAge.maximumUnresolvedAgeDays, 1);
  assert.equal(body.spendingOriginalStatus, 'UNKNOWN'); noAuthority(body); assert.equal(s.calls.close, 1); assert.equal(r.calls.close, 1);
});
check('signer-age-coordinator-refuses-a-v1-result-for-a-v2-profile', async () => {
  const r = fixture(), s = coordinator(r, { inspect(p) { const c = consume(p); release(p); return Promise.resolve(captureApiCreditSignerInspectionResult(r.signer, c.expectedOriginal)); } });
  assert.equal((await s.run()).status, 'CLOSE_UNKNOWN'); assert.equal(s.calls.write, 0); assert.equal(r.calls.open, 0);
});
check('signer-age-coordinator-refuses-a-v2-result-for-a-v1-profile', async () => {
  const r = fixture(), output = r.run(); r.envelope.signerInspectionVersion = 1; delete r.envelope.uncertaintyAgeLimits;
  const s = coordinator(r, { inspect(p) { consume(p); release(p); return Promise.resolve(output); } });
  assert.equal((await s.run()).status, 'CLOSE_UNKNOWN'); assert.equal(s.calls.write, 0); assert.equal(r.calls.close, 1);
});
check('signer-age-coordinator-binds-the-explicit-threshold-to-the-result', async () => {
  const r = fixture(), output = r.run(); r.envelope.uncertaintyAgeLimits.maximumUnresolvedAgeDays = 7;
  const s = coordinator(r, { inspect(p) { consume(p); release(p); return Promise.resolve(output); } });
  assert.equal((await s.run()).status, 'CLOSE_UNKNOWN'); assert.equal(s.calls.write, 0);
});
check('signer-age-coordinator-binds-the-spending-policy-to-the-result', async () => {
  const r = fixture(), other = fixture({ policyId: 'another.synthetic.policy' }, r.d), output = other.run();
  const s = coordinator(r, { inspect(p) { consume(p); release(p); return Promise.resolve(output); } });
  assert.equal((await s.run()).status, 'CLOSE_UNKNOWN'); assert.equal(s.calls.write, 0);
});
check('signer-age-late-coordinator-result-cannot-write-after-the-original-deadline', async () => {
  const r = fixture(), output = r.run(), late = deferred();
  const s = coordinator(r, { inspect(p) { consume(p); release(p); return late.promise; } }), running = s.run(); await flush();
  s.now = 1000000000n; s.timers[0].callback(); assert.equal((await running).status, 'CLOSE_UNKNOWN');
  late.resolve(output); await flush(); assert.equal(s.calls.write, 0); assert.equal(s.calls.close, 1); assert.equal(r.calls.close, 1);
});
check('signer-age-output-loss-does-not-reopen-reread-or-retry', async () => {
  const r = fixture(), s = coordinator(r, { writeLoss: true }); assert.equal((await s.run()).status, 'CLOSE_UNKNOWN');
  assert.deepEqual(s.calls, { inspect: 1, write: 1, close: 1 }); assert.equal(r.calls.open, 1); assert.equal(r.calls.spending, 2);
  assert.equal(r.calls.signer, 1); assert.equal(r.calls.close, 1); assert.equal(r.calls.ownerCAS, 0);
});
check('signer-age-invalid-v2-profile-never-enters-the-owned-inspector', async () => {
  const r = fixture(); delete r.envelope.uncertaintyAgeLimits; const s = coordinator(r), result = await s.run();
  assert.equal(result.status, 'BOOTSTRAP_REFUSED'); assert.equal(s.calls.inspect, 0); assert.equal(r.calls.open, 0); assert.equal(s.calls.close, 1);
});

export const signerUncertaintyAgeDataCases = F(checks.map(c => F(c)));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const { id, run } of checks) {
    try { await run(); cases.push({ id, status: 'PASS' }); }
    catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); }
  }
  await closeApiCreditOperatorDataFixtures(); const failed = cases.filter(c => c.status !== 'PASS').length;
  console.log(JSON.stringify({ qualification: 'G2_SIGNER_INSPECTION_UNCERTAINTY_AGE_DATA', passed: cases.length - failed, failed, cases,
    actualJournalProfileOwnerAndCoordinator: true, declaredMemoryFileDayAndPipePortsOnly: true,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
    nativeReopen: 'NOT_ESTABLISHED', physicalRelease: 'NOT_ESTABLISHED', actualSignerLoss: 'NOT_ESTABLISHED', LinuxAcceptance: 'NOT_ESTABLISHED', G0G5Acceptance: 'OPEN' }));
  if (failed) process.exitCode = 1;
}
