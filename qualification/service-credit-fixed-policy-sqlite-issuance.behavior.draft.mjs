/*
 * Six selected integration cases over the ACTUAL fixed funding policy,
 * native service-credit SQLite store, native intake store and intake owner.
 * Only two new synthetic database files under the managed private fixture
 * root. The SDK/network import tripwire is preloaded before this entry.
 * No bind/preflight, key generation, signing, payment, observer activation,
 * publication, real PREPARE or live pilot. This is normal same-process
 * close/reopen plus one deliberate after-COMMIT fault, not a process crash.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { snapshotQualificationImportGuard as GUARD } from './service-credit-fixed-policy-sqlite-import-guard.mjs';
import { canonicalJson } from '../src/canonical.js';
import { createFixedZenonFundingPolicy as FIXED } from '../src/service-credit-zenon-fixed-funding-policy.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import {
  createZenonFundingIntakeSqliteStore, openZenonFundingIntakeSqliteStore,
  deriveZenonFundingIntakeSelectionKey,
} from '../src/service-credit-zenon-funding-intake-sqlite-store.js';
import { createZenonFundingIntake } from '../src/service-credit-zenon-funding-intake.js';

assert.equal(process.argv.length, 2);
const OPTIONS = { timeout: 5000, concurrency: false }, NOW = 2000000000000;
const RESOURCE = 'https://service.example/credits/zenon-fund';
const ROOT = join(process.env.SPV_TASK_SCRATCH, 'fixtures');
const MARKER = { schemaVersion: 1, kind: 'fixed-policy-native-sqlite',
  files: ['service.sqlite', 'intake.sqlite'], disposableOnSuccess: true };
const clone = value => JSON.parse(JSON.stringify(value)); // Owned fixture DATA only.
const hash = value => createHash('sha256').update(value).digest('hex');
const commitment = fill => 'sha256:' + fill.repeat(64);
const rootIdentity = () => {
  const s = lstatSync(ROOT, { bigint: true });
  assert.equal(realpathSync(ROOT), ROOT); assert.equal(s.isDirectory(), true);
  assert.equal(s.uid, BigInt(process.getuid())); assert.equal(s.mode & 0o7777n, 0o700n);
  return [s.dev, s.ino, s.uid, s.mode].map(String);
};
const databaseIdentity = path => {
  const s = lstatSync(path, { bigint: true });
  assert.equal(s.isFile(), true); assert.equal(s.isSymbolicLink(), false); assert.equal(s.nlink, 1n);
  assert.equal(s.uid, BigInt(process.getuid())); assert.equal(s.mode & 0o7777n, 0o600n);
  assert.ok(s.size > 0n && s.size <= 1048576n);
  return [s.dev, s.ino, s.uid, s.mode, s.nlink].map(String);
};
let savedRoot = null, service = null, intake = null, owners = [], oldOwner = null;
let failed = false, now = NOW, firstFrame = null, firstProjection = null, firstServiceState = null;
let sqliteVersion = null;
const files = ['service.sqlite', 'intake.sqlite'].map(name => join(ROOT, name)), identities = [];
const totals = { createdDatabases: 0, reopenedStoreHandles: 0, readOnlyConnections: 0,
  policies: 0, owners: 0, policyCalls: 0, forbiddenRederivations: 0, afterCommitFaults: 0,
  issueAttempts: 0, framesReturned: 0, costCalls: 0, disposedFixtureFiles: 0 };
const chain = { version: 1, chainIdentifier: '7', genesisMomentumHash: '1'.repeat(64) };
const authorityRecord = canonicalJson({
  authorityRecordVersion: 1, authorityProfileId: 'zenon.provider-attestation',
  authorityProfileVersion: 1, verifierVersion: 1, providerAuthorityId: 'provider.reference',
  generationId: 'provider.reference.generation', generationVersion: 1, keyId: 'provider.reference.key',
  algorithm: 'Ed25519', publicKey: Buffer.alloc(32, 7).toString('base64url'), // Fixed public DATA, no key generation.
  network: 'zenon:testnet', chainProfile: chain,
  observerPolicy: { policyId: 'zenon.injected-observer', policyVersion: 1, verifierVersion: 1 },
  confirmationPolicy: { policyId: 'zenon.authenticated-momentum-inclusion', policyVersion: 1, minimumConfirmations: 3 },
  bootstrapCheckpoint: { height: 10, hash: '2'.repeat(64) },
  sourcePolicyCommitment: commitment('d'), maximumAttestationBytes: 4096,
  maximumCanonicalBytes: 524288, maximumInitialAgeSeconds: 300, maximumFutureSkewSeconds: 5,
  maximumValiditySeconds: 300,
});
const offer = { modelVersion: 1, providerId: 'provider.reference', serviceId: 'service.reference',
  resourceId: 'resource.zenon.funding', resourceBinding: 'sha256:' + hash(
    'zenon-x402-service-credit-resource-binding-v1\0' + canonicalJson({
      resourceId: 'resource.zenon.funding', resourceUrl: RESOURCE })),
  offerId: 'offer.zenon.reference', offerVersion: 1, costPolicyId: 'cost.fixed',
  fundingPolicyId: 'funding.exact.zenon.fixed', fundingPolicyVersion: 1 };
const selection = { offerId: offer.offerId, offerVersion: 1, holderId: 'z1syntheticpayer',
  capabilityCommitment: commitment('a') };
const configuration = { offer: clone(offer), selection: clone(selection),
  terms: { fundingPolicyId: offer.fundingPolicyId, fundingPolicyVersion: 1, totalUnits: 10,
    expiresAt: NOW + 60000, requirement: { scheme: 'exact', network: 'zenon:testnet',
      asset: 'zts1znnxxxxxxxxxxxxx9z4ulx', amount: '7', payTo: 'z1syntheticpayee', maxTimeoutSeconds: 30,
      extra: { paymentFlow: 'upfront', poc: true, settlement: 'account-block',
        zenonChain: chain, minimumMomentumConfirmations: 3 } } } };
let fixed = null;
const serviceConfig = { databasePath: files[0], allowedRoot: ROOT,
  deriveCost() { totals.costCalls++; throw Error('UNEXPECTED_COST'); }, now: () => NOW };
const intakeConfig = { databasePath: files[1], allowedRoot: ROOT,
  ledgerDomain: 'fixed-policy-synthetic-intake-v1', maxChallenges: 4 };
const selectionKey = deriveZenonFundingIntakeSelectionKey({ ledgerDomain: intakeConfig.ledgerDomain, selection });
function sameRoot() { assert.deepEqual(rootIdentity(), savedRoot); }
function policy(input) { totals.policyCalls++; return fixed(input); }
function noRederivation() { totals.forbiddenRederivations++; throw Error('UNEXPECTED_REDERIVATION'); }
function makeOwner(deriveFundingTerms) {
  sameRoot();
  const owner = createZenonFundingIntake({ store: intake, serviceCreditStore: service,
    authorityRecord, deriveFundingTerms, now: () => now, observerRoot: ROOT,
    observerCatchUp: { maximumPageEntries: 4, maximumBackfillSpan: 8, maximumMembersPerMomentum: 4 } });
  totals.owners++; owners.push(owner); return owner;
}
function issue(owner, args = { selection, resourceUrl: RESOURCE }) {
  totals.issueAttempts++; const frame = owner.issue(args); totals.framesReturned++; return frame;
}
function code(expected) { return error => { assert.equal(error.code, expected); return true; }; }
function closeHandles() {
  for (const owner of owners) owner.close();
  owners = [];
  if (intake !== null) { intake.close(); intake = null; }
  if (service !== null) { service.close(); service = null; }
}
function openExisting() {
  sameRoot();
  for (let i = 0; i < files.length; i++) assert.deepEqual(databaseIdentity(files[i]), identities[i]);
  service = ServiceCreditSqliteStore.openExisting(serviceConfig); totals.reopenedStoreHandles++;
  intake = openZenonFundingIntakeSqliteStore(intakeConfig); totals.reopenedStoreHandles++;
}
function snapshotClosedDatabases() {
  sameRoot(); assert.equal(service, null); assert.equal(intake, null);
  const output = [];
  for (let i = 0; i < files.length; i++) {
    assert.deepEqual(databaseIdentity(files[i]), identities[i]);
    const db = new DatabaseSync(files[i], { readOnly: true }); totals.readOnlyConnections++;
    try {
      const version = db.prepare('SELECT sqlite_version() AS version').get().version;
      assert.equal(typeof version, 'string'); sqliteVersion ??= version; assert.equal(version, sqliteVersion);
      if (i === 1) {
        const rows = db.prepare('SELECT selection_key,funding_commitment,intent_digest,status,envelope FROM intake_challenges ORDER BY selection_key').all();
        assert.equal(rows.length, 1); assert.equal(rows[0].selection_key, selectionKey);
        assert.equal(rows[0].status, 'ISSUED');
        const envelope = JSON.parse(rows[0].envelope);
        assert.equal(envelope.binding, null);
        assert.equal(envelope.issue.challenge.activationIntent.totalUnits, 10);
        assert.equal(envelope.issue.challenge.activationIntent.expiresAt, NOW + 60000);
        assert.equal(envelope.issue.challenge.paymentRequired.accepts[0].amount, '7');
        const projection = canonicalJson(rows);
        if (firstProjection === null) { firstProjection = projection; firstFrame = envelope.issue.frame; }
        else assert.equal(projection, firstProjection);
      }
    } finally { db.close(); }
    const data = readFileSync(files[i]);
    assert.ok(data.length > 16 && data.length <= 1048576);
    assert.equal(data.subarray(0, 16).toString('ascii'), 'SQLite format 3\0');
    assert.deepEqual(databaseIdentity(files[i]), identities[i]);
    output.push({ role: i === 0 ? 'service' : 'intake', bytes: data.length, sha256: hash(data) });
  }
  return output;
}
function selected(name, run) {
  return test(name, OPTIONS, async t => {
    try { await run(t); }
    catch (error) { failed = true; throw error; } // Preserve owned failed fixtures; no deletion-as-recovery.
  });
}
selected('fixed policy SQLite setup uses exactly two new private files and refuses a bare import control before resolution', async () => {
  await assert.rejects(import('qualification-forbidden-package-control'), code('FIXED_POLICY_SQLITE_IMPORT_REFUSED'));
  savedRoot = rootIdentity(); assert.deepEqual(JSON.parse(readFileSync(join(ROOT, 'owner.json'), 'utf8')), MARKER);
  assert.deepEqual(readdirSync(ROOT).sort(), ['owner.json']);
  fixed = FIXED(configuration); totals.policies++;
  configuration.terms.totalUnits = 999; configuration.terms.requirement.amount = '999';
  service = ServiceCreditSqliteStore.create(serviceConfig); totals.createdDatabases++;
  service.registerOffer(offer); firstServiceState = canonicalJson(service.load());
  intake = createZenonFundingIntakeSqliteStore({ ...intakeConfig,
    testHooks: { afterCommit() { totals.afterCommitFaults++; throw Error('SYNTHETIC_AFTER_COMMIT'); } } });
  totals.createdDatabases++;
  identities.push(...files.map(databaseIdentity));
  oldOwner = makeOwner(policy);
});
selected('actual fixed policy issuance commits one orphan but returns no frame after the selected after-COMMIT fault', () => {
  assert.throws(() => issue(oldOwner), code('ZENON_FUNDING_INTAKE_OUTCOME_UNKNOWN'));
  assert.throws(() => issue(oldOwner), code('ZENON_FUNDING_INTAKE_QUARANTINED'));
  assert.equal(totals.policyCalls, 1); assert.equal(totals.framesReturned, 0);
  assert.equal(totals.afterCommitFaults, 1); assert.equal(canonicalJson(service.load()), firstServiceState);
});
selected('real same-file close and reopen replays the exact orphaned frame without rerunning provider economics', () => {
  closeHandles(); snapshotClosedDatabases(); openExisting();
  const owner = makeOwner(noRederivation); now = NOW + 1000;
  assert.deepEqual(issue(owner), firstFrame); assert.deepEqual(issue(owner), firstFrame);
  const row = intake.loadBySelectionKey(selectionKey);
  assert.equal(row.status, 'ISSUED'); assert.equal(row.binding, null); assert.deepEqual(row.issue.frame, firstFrame);
  const decoded = JSON.parse(Buffer.from(firstFrame.paymentRequiredHeader, 'base64').toString('utf8'));
  assert.equal(decoded.accepts[0].amount, '7'); assert.equal(decoded.accepts[0].payTo, 'z1syntheticpayee');
  assert.equal(decoded.resource.url, RESOURCE); assert.equal(firstFrame.status, 402);
  assert.equal(firstFrame.body, 'Payment Required'); assert.equal(totals.forbiddenRederivations, 0);
});
selected('persisted fixed selection rejects a changed resource foreign holder and expired challenge without a new row or repricing', () => {
  const owner = makeOwner(policy), before = canonicalJson(intake.loadBySelectionKey(selectionKey));
  assert.throws(() => issue(owner, { selection, resourceUrl: RESOURCE + '-other' }), code('ZENON_FUNDING_INTAKE_CONFLICT'));
  assert.throws(() => issue(owner, { selection: { ...selection, holderId: 'z1otherholder' }, resourceUrl: RESOURCE }),
    code('ZENON_FUNDING_INTAKE_REJECTED'));
  now = NOW + 60000;
  assert.throws(() => issue(owner), code('ZENON_FUNDING_INTAKE_EXPIRED'));
  assert.equal(canonicalJson(intake.loadBySelectionKey(selectionKey)), before);
  assert.equal(totals.policyCalls, 2); assert.equal(totals.afterCommitFaults, 1);
});
selected('second real reopen retains expiry and the exact ISSUED row with no bound observer grant or service execution', () => {
  closeHandles(); snapshotClosedDatabases(); openExisting();
  const owner = makeOwner(noRederivation);
  assert.throws(() => issue(owner), code('ZENON_FUNDING_INTAKE_EXPIRED'));
  assert.throws(() => issue(oldOwner), code('ZENON_FUNDING_INTAKE_CLOSED'));
  assert.deepEqual(owner.recoverBound(), []); assert.deepEqual(intake.loadBound(), []);
  const ledger = service.load(); assert.equal(ledger.state.grants.length, 0); assert.equal(ledger.state.requests.length, 0);
  assert.equal(canonicalJson(ledger), firstServiceState); assert.equal(totals.forbiddenRederivations, 0);
});
selected('selected SQLite integration closes every handle and disposes only its two identity-checked reproducible fixtures', t => {
  closeHandles(); assert.equal(failed, false); const fixtureDigests = snapshotClosedDatabases();
  assert.deepEqual(readdirSync(ROOT).sort(), ['intake.sqlite', 'owner.json', 'service.sqlite']);
  const guard = GUARD(); assert.equal(guard.sdkImportAttempts, 0);
  assert.equal(guard.controlRefusals, 1); assert.equal(guard.otherRefusals, 0);
  for (let i = 0; i < files.length; i++) {
    sameRoot(); assert.deepEqual(databaseIdentity(files[i]), identities[i]);
    unlinkSync(files[i]); totals.disposedFixtureFiles++;
  }
  sameRoot(); assert.deepEqual(readdirSync(ROOT).sort(), ['owner.json']);
  assert.deepEqual(totals, { createdDatabases: 2, reopenedStoreHandles: 4, readOnlyConnections: 6,
    policies: 1, owners: 4, policyCalls: 2, forbiddenRederivations: 0, afterCommitFaults: 1,
    issueAttempts: 9, framesReturned: 2, costCalls: 0, disposedFixtureFiles: 2 });
  t.diagnostic(JSON.stringify({ kind: 'P4_FIXED_POLICY_SQLITE_ISSUANCE', counters: totals,
    fixtureDigests, sqliteVersion, sourceModules: guard.sourceModules,
    issuedRowProjectionSha256: hash(firstProjection), originalFrameSha256: hash(canonicalJson(firstFrame)),
    sdkImportAttempts: 0, importControlRefusals: 1, otherImportRefusals: 0,
    signedBindings: 0, observerFiles: 0, grantActivations: 0, keyGeneration: 0, signatures: 0,
    networkCalls: 0, realPrepareCalls: 0, nativeChainOrProviderRuns: 0,
    qualification: 'SYNTHETIC_NATIVE_SQLITE_ISSUANCE_REOPEN_NOT_PAYMENT_OR_LIVE_PILOT' }));
});
