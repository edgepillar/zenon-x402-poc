// Actual decoder, fixed opener selection, owner and coordinator. Memory only.
import assert from 'node:assert/strict';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as assemble } from '../src/zenon/dynamic-plasma-original-funding-data.js';
import { captureOriginalFundingSpendingFileProfile } from '../src/original-funding-spending-file-profile.js';
import { decodeApiCreditSignerInspectionProfile as decode, consumeApiCreditSignerInspectionProfile as consume,
  releaseApiCreditSignerInspectionProfile as release, createApiCreditSignerInspectionFilePorts as ports } from '../src/api-credit-signer-inspection-profile.js';
import { runApiCreditSignerInspectionOwner as legacyOwner, runApiCreditSignerInspectionWithUncertaintyAgeOwner as ageOwner,
  captureApiCreditSignerInspectionOutput as output } from '../src/original-funding-signer-inspection-owner.js';
import { signerUncertaintyAgeDataFixture as ageFixture,
  signerUncertaintyAgeCoordinatorDataFixture as ageCoordinator } from './signer-uncertainty-age.behavior.mjs';
import { closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';

const F = Object.freeze, checks = [], copy = v => JSON.parse(JSON.stringify(v));
function check(id, run) { checks.push(F({ id, run })); }
function fixture(options = {}) {
  const r = ageFixture(options); r.envelope.signerInspectionVersion = 3; r.envelope.spendingStoreProfile = 'GRANT_RECOVERY_V1';
  r.nativeCalls = []; r.openers = F({ signerContext: F(c => enter('SIGNER_CONTEXT_V1', c)), grantRecovery: F(c => enter('GRANT_RECOVERY_V1', c)) });
  function enter(kind, c) {
    r.nativeCalls.push(kind); assert.deepEqual(Object.keys(c).sort(), ['allowedRoot', 'filePolicy', 'storageProfile']);
    // This is the real constructor's strict pure input codec, not a permissive spy.
    assert.equal(captureOriginalFundingSpendingFileProfile(c).storageProfile.mode, 'OPEN_EXISTING');
    assert.equal(canonicalJson(c), canonicalJson(r.envelope.spendingFile));
    if (options.openThrow) throw Error('declared open refusal');
    if (options.expireAfterOpen) r.expired = true;
    return r.owner;
  }
  r.invoke = (profile, guard = r.guard) => {
    const c = consume(profile), selected = ports(c, guard, r.openers);
    const base = { fileConfiguration: c.fileConfiguration, expectedOriginal: c.expectedOriginal, ports: selected, requireOpening: guard };
    return c.uncertaintyAgeLimits ? ageOwner({ ...base, uncertaintyAgeLimits: c.uncertaintyAgeLimits, readDay: r.day }) : legacyOwner(base);
  };
  r.run = () => { const profile = decode(canonicalJson(r.envelope)); try { return r.invoke(profile); } finally { release(profile); } };
  r.coordinate = (options = {}) => ageCoordinator(r, { inspect(profile, g) {
    try { const result = r.invoke(profile, g); return Promise.resolve(options.result ? options.result(result) : result); }
    finally { release(profile); }
  }, ...options });
  return r;
}
check('signer-store-v3-explicitly-selects-grant-recovery-and-retains-age-limits', () => {
  const r = fixture(), p = decode(canonicalJson(r.envelope)), c = consume(p);
  assert.equal(p.signerInspectionVersion, 3); assert.equal(p.spendingStoreProfile, 'GRANT_RECOVERY_V1');
  assert.equal(p.spendingPolicyId, r.policy.policyId); assert.deepEqual(c.uncertaintyAgeLimits, r.envelope.uncertaintyAgeLimits);
  assert.deepEqual(c.fileConfiguration, r.envelope.spendingFile); release(p); assert.equal(r.nativeCalls.length, 0);
});
check('signer-store-v3-cannot-omit-or-default-its-schema-and-age-policy', () => {
  for (const key of ['spendingStoreProfile', 'uncertaintyAgeLimits']) { const r = fixture(); delete r.envelope[key]; assert.throws(() => decode(canonicalJson(r.envelope))); assert.deepEqual(r.nativeCalls, []); }
});
check('signer-store-v3-refuses-discovery-alternate-schema-modules-and-version-drift', () => {
  for (const value of ['SIGNER_CONTEXT_V1', 'AUTO', 'GRANT_RECOVERY_V2', '../module.js', null]) {
    const r = fixture(); r.envelope.spendingStoreProfile = value; assert.throws(() => decode(canonicalJson(r.envelope)));
  }
  for (const value of [0, 4, '3']) { const r = fixture(); r.envelope.signerInspectionVersion = value; assert.throws(() => decode(canonicalJson(r.envelope))); }
});
check('signer-store-legacy-v1-v2-keep-their-own-schema-without-silent-upgrade', () => {
  for (const version of [1, 2]) {
    const r = fixture(); r.envelope.signerInspectionVersion = version;
    assert.throws(() => decode(canonicalJson(r.envelope))); delete r.envelope.spendingStoreProfile;
    if (version === 1) delete r.envelope.uncertaintyAgeLimits;
    const result = r.run(); assert.equal(result.signerInspectionVersion, version); assert.deepEqual(r.nativeCalls, ['SIGNER_CONTEXT_V1']);
  }
});
check('signer-store-v3-create-mode-and-missing-independent-owner-are-refused', () => {
  const r = fixture(), c = r.envelope.spendingFile.storageProfile;
  c.mode = 'CREATE_NEW'; delete c.ownerToken; c.storeId = 'new.store'; c.ownerId = 'new.owner'; assert.throws(() => decode(canonicalJson(r.envelope)));
  const s = fixture(); delete s.envelope.spendingFile.storageProfile.ownerToken; assert.throws(() => decode(canonicalJson(s.envelope))); assert.deepEqual(s.nativeCalls, []);
});
check('signer-store-v3-opens-only-the-current-owner-and-preserves-exact-signed-history', () => {
  const r = fixture(), before = r.raw, result = r.run(); assert.deepEqual(r.nativeCalls, ['GRANT_RECOVERY_V1']);
  assert.equal(result.status, 'SIGNED_DATA'); assert.equal(result.signerInspectionVersion, 2); assert.equal(output(result), result);
  const original = assemble(r.d.f.input, { originalUnsignedBlock: r.d.unsigned, accountBlock: r.d.signed }, r.d.f.resourceUrl);
  assert.equal(result.transactionHash, original.transactionHash); assert.equal(result.serializedCheckpoint, original.serializedCheckpoint);
  assert.deepEqual(result.expectedPins, original.expectedPins); assert.equal(result.spendingOriginalStatus, 'UNKNOWN');
  assert.equal(result.uncertaintyAge.operatorEscalationRequired, true); assert.equal(r.raw, before); assert.equal(r.calls.ownerCAS, 0);
});
check('signer-store-age-owner-passes-exactly-the-real-three-field-constructor-input', () => {
  const r = fixture(), p = decode(canonicalJson(r.envelope)), c = consume(p); release(p);
  const strict = F({ openFile: F(configuration => { assert.deepEqual(Object.keys(configuration).sort(), ['allowedRoot', 'filePolicy', 'storageProfile']);
    captureOriginalFundingSpendingFileProfile(configuration); return r.owner; }) });
  const result = ageOwner({ ...c, ports: strict, requireOpening: r.guard, readDay: r.day }); assert.equal(result.status, 'SIGNED_DATA');
});
check('signer-store-v3-coordinator-accepts-the-existing-v2-output-grammar-after-close', async () => {
  const r = fixture(), c = r.coordinate(), result = await c.run(); assert.equal(result.status, 'CLOSED'); assert.equal(result.exitCode, 0);
  assert.equal(r.phase, 'CLOSED'); assert.equal(c.writes.length, 1); const value = JSON.parse(c.writes[0]);
  assert.equal(value.signerInspectionVersion, 2); assert.equal(value.authority, 'NONE'); assert.equal(value.uncertaintyAge.policyId, r.policy.policyId);
  assert.deepEqual(r.nativeCalls, ['GRANT_RECOVERY_V1']);
});
check('signer-store-v3-legacy-output-cannot-bypass-mandatory-age-checks', async () => {
  const r = fixture(), c = r.coordinate({ result(value) { const v = { ...value, signerInspectionVersion: 1 };
    for (const key of ['spendingOriginalStatus', 'spendingOriginalReservedDay', 'spendingOriginalAgeDays', 'uncertaintyAge']) delete v[key]; return F(v); } });
  const result = await c.run(); assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(c.writes.length, 0);
});
check('signer-store-v3-known-current-history-never-authorizes-a-new-economic-action', () => {
  const r = fixture(), v = r.run();
  for (const key of ['mayStartPayment', 'maySignPayment', 'mayDispatchFunding', 'mayDispatchService', 'automaticRetry']) assert.equal(v[key], false);
  assert.equal(v.currentAuthority, 'NOT_ESTABLISHED'); assert.equal(v.signatureValidation, 'NOT_PERFORMED'); assert.equal(v.nativeDurability, 'NOT_ESTABLISHED');
  assert.equal(v.uncertaintyAge.mayReleaseReservation, false); assert.equal(v.uncertaintyAge.spendingReservation, 'UNCHANGED');
});
check('signer-store-opener-cannot-use-copied-captured-data-or-a-second-issued-port', () => {
  const r = fixture(), p = decode(canonicalJson(r.envelope)), c = consume(p);
  assert.throws(() => ports(F({ ...c }), r.guard, r.openers)); ports(c, r.guard, r.openers); assert.throws(() => ports(c, r.guard, r.openers)); release(p);
  assert.deepEqual(r.nativeCalls, []);
});
check('signer-store-release-revokes-unissued-and-already-issued-openers', () => {
  for (const issued of [false, true]) {
    const r = fixture(), p = decode(canonicalJson(r.envelope)), c = consume(p), selected = issued ? ports(c, r.guard, r.openers) : null; release(p);
    assert.throws(() => issued ? selected.openFile(c.fileConfiguration) : ports(c, r.guard, r.openers)); assert.deepEqual(r.nativeCalls, []);
  }
});
check('signer-store-expired-guard-cannot-later-be-retried-as-a-fresh-open', () => {
  const r = fixture(), p = decode(canonicalJson(r.envelope)), c = consume(p), selected = ports(c, r.guard, r.openers);
  r.expired = true; assert.throws(() => selected.openFile(c.fileConfiguration)); r.expired = false; assert.throws(() => selected.openFile(c.fileConfiguration)); release(p); assert.deepEqual(r.nativeCalls, []);
});
check('signer-store-release-during-the-opening-guard-prevents-acquisition', () => {
  const r = fixture(), p = decode(canonicalJson(r.envelope)), c = consume(p), selected = ports(c, F(() => release(p)), r.openers);
  assert.throws(() => selected.openFile(c.fileConfiguration)); assert.deepEqual(r.nativeCalls, []);
});
check('signer-store-opener-never-falls-back-after-the-selected-schema-refuses', () => {
  const r = fixture({ openThrow: true }); assert.throws(r.run); assert.deepEqual(r.nativeCalls, ['GRANT_RECOVERY_V1']);
  assert.equal(r.calls.signer, 0); assert.equal(r.calls.close, 0);
});
check('signer-store-opener-cannot-be-entered-twice-after-a-returned-owner', () => {
  const r = fixture(), p = decode(canonicalJson(r.envelope)), c = consume(p), selected = ports(c, r.guard, r.openers);
  assert.equal(selected.openFile(c.fileConfiguration), r.owner); assert.throws(() => selected.openFile(c.fileConfiguration)); release(p); assert.deepEqual(r.nativeCalls, ['GRANT_RECOVERY_V1']);
});
check('signer-store-reentrant-open-cannot-acquire-a-second-owner', () => {
  const r = fixture(), p = decode(canonicalJson(r.envelope)), c = consume(p); let selected, entered = 0;
  selected = ports(c, r.guard, F({ signerContext: r.openers.signerContext, grantRecovery: F(configuration => {
    entered++; assert.throws(() => selected.openFile(configuration)); return r.owner;
  }) }));
  assert.equal(selected.openFile(c.fileConfiguration), r.owner); assert.equal(entered, 1); release(p);
});
check('signer-store-same-profile-cannot-open-a-foreign-path-owner-or-policy', () => {
  for (const change of [c => { c.storageProfile.databasePath = c.allowedRoot + '/other.sqlite'; },
    c => { c.storageProfile.ownerToken.epoch++; }, c => { c.storageProfile.ownerToken.ownerId = 'foreign.owner'; },
    c => { c.filePolicy.reservedBytes = '1'; }, c => { c.storageProfile.policy.policyId = 'foreign.policy'; }]) {
    const r = fixture(), p = decode(canonicalJson(r.envelope)), c = consume(p), selected = ports(c, r.guard, r.openers), changed = copy(c.fileConfiguration); change(changed);
    assert.throws(() => selected.openFile(changed)); assert.deepEqual(r.nativeCalls, []); release(p);
  }
});
check('signer-store-opening-ports-reject-proxies-accessors-and-extra-callbacks-without-entry', () => {
  const r = fixture(), p = decode(canonicalJson(r.envelope)), c = consume(p); let entered = 0;
  assert.throws(() => ports(c, r.guard, new Proxy({}, { ownKeys() { entered++; return []; } })));
  const bad = { grantRecovery: r.openers.grantRecovery }; Object.defineProperty(bad, 'signerContext', { enumerable: true, get() { entered++; return r.openers.signerContext; } });
  assert.throws(() => ports(c, r.guard, F(bad))); assert.throws(() => ports(c, r.guard, F({ ...r.openers, discover() { entered++; } })));
  assert.equal(entered, 0); assert.deepEqual(r.nativeCalls, []); release(p);
});
check('signer-store-internal-capacity-view-is-not-a-public-constructor-argument', () => {
  const r = fixture(), p = decode(canonicalJson(r.envelope)), c = consume(p), selected = ports(c, r.guard, r.openers);
  const internal = captureOriginalFundingSpendingFileProfile(c.fileConfiguration);
  assert.throws(() => selected.openFile(internal)); assert.deepEqual(r.nativeCalls, []); release(p);
});
check('signer-store-expiry-after-open-keeps-the-returned-owner-cleanup-protocol', () => {
  const r = fixture({ expireAfterOpen: true }); assert.throws(r.run); assert.deepEqual(r.nativeCalls, ['GRANT_RECOVERY_V1']);
  assert.equal(r.calls.signer, 0); assert.equal(r.calls.revoke, 1); assert.equal(r.calls.close, 1);
});
check('signer-store-current-schema-selection-does-not-normalize-unknown-spending', () => {
  const r = fixture(), before = r.raw; r.run(); assert.equal(r.raw, before); assert.equal(JSON.parse(r.raw).reservations[0].status, 'UNKNOWN'); assert.equal(r.calls.ownerCAS, 0);
});

export const signerStoreProfileDataCases = F(checks);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const c of checks) { try { await c.run(); cases.push({ id: c.id, status: 'PASS' }); }
    catch (e) { cases.push({ id: c.id, status: 'FAIL', error: String(e?.message ?? e) }); break; } }
  await closeApiCreditOperatorDataFixtures(); const failed = cases.filter(c => c.status !== 'PASS').length;
  process.stdout.write(JSON.stringify({ qualification: 'G2_EXPLICIT_SIGNER_STORE_PROFILE_DATA', passed: cases.length - failed, failed, cases,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
    physicalRelease: 'NOT_ESTABLISHED', actualSignerLoss: 'NOT_ESTABLISHED', Linux: 'NOT_ESTABLISHED', G1: 'OPEN', G2: 'OPEN' }) + '\n');
  if (failed) process.exitCode = 1;
}
