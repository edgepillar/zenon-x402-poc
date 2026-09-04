import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fsPromises from 'node:fs/promises';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { paymentIntentDigest } from '../src/canonical.js';
import {
  DELIVERY_STATES,
  EVIDENCE_STATES,
  SettlementJournal,
} from '../src/settlement-journal.js';
import { validateResource } from '../src/x402-wire.js';

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function digest(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex');
}

const TOMBSTONE_FIELDS = Object.freeze([
  'authorizationKey', 'transactionHash', 'chainProfile', 'intentDigest',
  'resourceDigest', 'payer', 'signedAccountBlockDigest', 'priorEvidenceState',
  'createdAt', 'terminalizedAt', 'lateMomentumEvidence',
]);
const MINIMUM_RETENTION_MS = 3_600_000;
const MAX_ISOLATED_OUTPUT_BYTES = 64 * 1024;
const ISOLATED_TEST_TIMEOUT_MS = 20_000;

function isolatedTestFailure(code) {
  const error = new Error(code);
  error.stack = `Error: ${code}`;
  throw error;
}

function supportsExperimentalModuleMocks() {
  try {
    const parts = process.versions.node.split('.');
    const major = Number(parts[0]);
    const minor = Number(parts[1]);
    if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor)) return false;
    if (major === 20) return minor >= 18;
    if (major === 21) return false;
    if (major === 22) return minor >= 3;
    return major >= 23;
  } catch {
    return false;
  }
}

async function isolatePrototypeSensitiveTest(name, flag, nodeArguments = []) {
  if (process.env[flag] === '1') return false;
  const isolatedEnvironment = { ...process.env, [flag]: '1' };
  delete isolatedEnvironment.NODE_TEST_CONTEXT;
  let isolated;
  try {
    isolated = spawn(process.execPath, [
      ...nodeArguments,
      '--test',
      '--test-reporter=tap',
      '--test-name-pattern',
      `^${name}$`,
      process.argv[1],
    ], {
      env: isolatedEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    isolatedTestFailure('isolated_child_spawn_failed');
  }
  let stdout = '';
  let stderr = '';
  let outputBytes = 0;
  let terminationReason = null;
  isolated.stdout.setEncoding('utf8');
  isolated.stderr.setEncoding('utf8');
  const append = (channel, chunk) => {
    if (terminationReason !== null) return;
    outputBytes += Buffer.byteLength(chunk);
    if (outputBytes > MAX_ISOLATED_OUTPUT_BYTES) {
      terminationReason = 'isolated_child_output_limit';
      try {
        isolated.kill('SIGKILL');
      } catch {
        // The fixed status below remains the only surfaced diagnostic.
      }
      return;
    }
    if (channel === 'stdout') stdout += chunk;
    else stderr += chunk;
  };
  isolated.stdout.on('data', chunk => { append('stdout', chunk); });
  isolated.stderr.on('data', chunk => { append('stderr', chunk); });
  const result = await new Promise(resolve => {
    let settled = false;
    let fallback;
    const finish = (status, exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(fallback);
      resolve({ status, exitCode });
    };
    const timeout = setTimeout(() => {
      terminationReason = 'isolated_child_timeout';
      try {
        isolated.kill('SIGKILL');
      } catch {
        // The fixed status below remains the only surfaced diagnostic.
      }
      fallback = setTimeout(() => finish(terminationReason, null), 1_000);
    }, ISOLATED_TEST_TIMEOUT_MS);
    isolated.once('error', () => finish('isolated_child_spawn_failed', null));
    isolated.once('close', exitCode => finish(terminationReason ?? 'closed', exitCode));
  });
  if (result.status !== 'closed') isolatedTestFailure(result.status);
  if (result.exitCode !== 0) isolatedTestFailure('isolated_child_failed');
  if (stderr.length !== 0) isolatedTestFailure('isolated_child_diagnostics');
  if (!/^# tests 1$/m.test(stdout) || !/^# pass 1$/m.test(stdout) || !/^# fail 0$/m.test(stdout)) {
    isolatedTestFailure('isolated_child_summary_invalid');
  }
  return true;
}

function safelyEqual(actual, expected) {
  assert.equal(isDeepStrictEqual(actual, expected), true);
}

function recordKey(authorizationKey, transactionHash) {
  return `${authorizationKey}:${transactionHash}`;
}

function checksumForState(state) {
  const content = {
    schemaVersion: state.schemaVersion,
    revision: state.revision,
    records: state.records,
  };
  if (state.schemaVersion === 2) content.tombstones = state.tombstones;
  return digest(content);
}

function withChecksum(state) {
  const copy = structuredClone(state);
  copy.checksum = checksumForState(copy);
  return copy;
}

async function readState(directory) {
  return JSON.parse(await readFile(join(directory, 'settlement-journal.json'), 'utf8'));
}

async function writeState(directory, state) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'settlement-journal.json'),
    `${JSON.stringify(withChecksum(state), null, 2)}\n`,
    'utf8',
  );
}

function fullRecord(attempt, {
  evidenceState = EVIDENCE_STATES.VALIDATED,
  momentumEvidence = null,
  deliveryState = DELIVERY_STATES.NONE,
  cachedResponse = null,
  createdAt = '2026-01-01T00:00:00.000Z',
  updatedAt = createdAt,
} = {}) {
  return {
    ...structuredClone(attempt),
    evidenceState,
    momentumEvidence,
    deliveryState,
    cachedResponse,
    createdAt,
    updatedAt,
  };
}

function tombstoneFor(attempt, {
  priorEvidenceState = EVIDENCE_STATES.VALIDATED,
  createdAt = '2026-01-01T00:00:00.000Z',
  terminalizedAt = '2026-01-01T01:00:00.000Z',
  lateMomentumEvidence = null,
} = {}) {
  return {
    authorizationKey: attempt.authorizationKey,
    transactionHash: attempt.transactionHash,
    chainProfile: structuredClone(attempt.chainProfile),
    intentDigest: attempt.intentDigest,
    resourceDigest: attempt.resourceDigest,
    payer: attempt.payer,
    signedAccountBlockDigest: digest({
      domain: 'zenon-x402-signed-account-block-v1',
      signedAccountBlock: attempt.signedAccountBlock,
    }),
    priorEvidenceState,
    createdAt,
    terminalizedAt,
    lateMomentumEvidence: structuredClone(lateMomentumEvidence),
  };
}

function includedEvidence(overrides = {}) {
  return {
    observedAt: overrides.observedAt ?? '2026-01-01T02:00:00.000Z',
    confirmationDetail: {
      numConfirmations: overrides.numConfirmations ?? 1,
      momentumHeight: overrides.momentumHeight ?? 42,
      momentumHash: overrides.momentumHash ?? 'a'.repeat(64),
      momentumTimestamp: overrides.momentumTimestamp ?? 1_700_000_000,
    },
  };
}

function validatedAttempt(overrides = {}) {
  const transactionHash = overrides.transactionHash ?? '1'.repeat(64);
  const chainProfile = overrides.chainProfile ?? {
    version: 1,
    chainIdentifier: '7',
    genesisMomentumHash: '4'.repeat(64),
  };
  const resourceIdentity = overrides.resourceIdentity ?? {
    url: 'http://example.test/paid',
    description: 'deterministic test resource',
    mimeType: 'application/json',
  };
  const acceptedRequirement = {
    scheme: 'exact',
    network: 'zenon:testnet',
    asset: 'zts1qqqqqqqqqqqqtq587y',
    amount: '100',
    payTo: 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f',
    maxTimeoutSeconds: 30,
    extra: {
      paymentFlow: 'upfront',
      poc: true,
      settlement: 'account-block',
      zenonChain: structuredClone(chainProfile),
    },
  };
  const intentDigest = overrides.intentDigest ?? paymentIntentDigest({
    x402Version: 2,
    resource: resourceIdentity,
    accepts: [acceptedRequirement],
  }, acceptedRequirement);
  const payer = overrides.payer ?? 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f';
  const signedAccountBlock = overrides.signedAccountBlock ?? {
    version: 1,
    chainIdentifier: Number(chainProfile.chainIdentifier),
    blockType: 2,
    hash: transactionHash,
    previousHash: '5'.repeat(64),
    height: 2,
    momentumAcknowledged: { hash: '6'.repeat(64), height: 10 },
    address: payer,
    toAddress: 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f',
    amount: '100',
    tokenStandard: 'zts1qqqqqqqqqqqqtq587y',
    fromBlockHash: '0'.repeat(64),
    data: Buffer.from(intentDigest, 'hex').toString('base64'),
    fusedPlasma: 0,
    difficulty: 0,
    nonce: '0'.repeat(16),
    publicKey: Buffer.alloc(32, 1).toString('base64'),
    signature: Buffer.alloc(64, 2).toString('base64'),
  };
  const resourceDigest = digest(resourceIdentity);
  const authorizationKey = overrides.authorizationKey ?? digest({
    domain: 'zenon-x402-authorization-v1',
    chainProfile,
    intentDigest,
    resourceDigest,
    transactionHash,
  });
  return {
    authorizationKey,
    transactionHash,
    chainProfile,
    intentDigest,
    resourceIdentity,
    resourceDigest,
    payer,
    signedAccountBlock,
  };
}

function acceptedRequirementForAttempt(attempt, minimumMomentumConfirmations = undefined) {
  const accepted = {
    scheme: 'exact',
    network: 'zenon:testnet',
    asset: attempt.signedAccountBlock.tokenStandard,
    amount: attempt.signedAccountBlock.amount,
    payTo: attempt.signedAccountBlock.toAddress,
    maxTimeoutSeconds: 30,
    extra: {
      paymentFlow: 'upfront',
      poc: true,
      settlement: 'account-block',
      zenonChain: structuredClone(attempt.chainProfile),
    },
  };
  if (minimumMomentumConfirmations !== undefined) {
    accepted.extra.minimumMomentumConfirmations = minimumMomentumConfirmations;
  }
  return accepted;
}

function thresholdClaimFixture(minimumMomentumConfirmations, overrides = {}) {
  const resourceIdentity = overrides.resourceIdentity ?? {
    url: 'http://example.test/paid',
    description: 'deterministic test resource',
    mimeType: 'application/json',
  };
  const seed = validatedAttempt({ ...overrides, resourceIdentity });
  const acceptedRequirement = acceptedRequirementForAttempt(
    seed,
    minimumMomentumConfirmations,
  );
  const intentDigest = paymentIntentDigest({
    x402Version: 2,
    resource: resourceIdentity,
    accepts: [acceptedRequirement],
  }, acceptedRequirement);
  const attempt = validatedAttempt({ ...overrides, resourceIdentity, intentDigest });
  return { attempt, acceptedRequirement };
}

async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'zenon-x402-journal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'state');
  return {
    root,
    directory,
    journal: new SettlementJournal({ directory, allowedRoot: root, ...options }),
  };
}

function restoreOwnProperty(object, key, descriptor) {
  if (descriptor) Object.defineProperty(object, key, descriptor);
  else delete object[key];
}

test('schema v1 never invokes an inherited tombstones getter',
  { concurrency: false, timeout: 30_000 }, async t => {
    const name = 'schema v1 never invokes an inherited tombstones getter';
    if (await isolatePrototypeSensitiveTest(name, 'X402_JOURNAL_V1_TOMBSTONE_GETTER_ISOLATED')) return;

    const { journal } = await fixture(t, { clock: () => '2026-01-01T00:00:00.000Z' });
    const first = validatedAttempt();
    await journal.putValidated(first);
    const prior = Object.getOwnPropertyDescriptor(Object.prototype, 'tombstones');
    let reads = 0;
    try {
      Object.defineProperty(Object.prototype, 'tombstones', {
        configurable: true,
        get() {
          reads += 1;
          throw new Error('inherited tombstones getter must not run');
        },
      });
      assert.equal((await journal.load()).records.length, 1);
      await journal.updateEvidence(
        first.authorizationKey,
        first.transactionHash,
        EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
      );
      await journal.putValidated(validatedAttempt({ transactionHash: '2'.repeat(64) }));
      const listed = await journal.list({ includeTombstones: true });
      assert.equal(listed.records.length, 2);
      assert.equal(listed.tombstones.length, 0);
      const candidates = await journal.listReconciliationCandidates(null);
      assert.equal(candidates.records.length, 0);
      assert.equal(candidates.tombstones.length, 0);
      assert.equal(await journal.getTombstone(first.authorizationKey, first.transactionHash), null);
      assert.equal(await journal.findTombstoneByTransactionHash(first.transactionHash), null);
    } finally {
      restoreOwnProperty(Object.prototype, 'tombstones', prior);
    }
    assert.equal(reads, 0);
  });

test('schema v1 ignores a fabricated inherited tombstone map',
  { concurrency: false, timeout: 30_000 }, async t => {
    const name = 'schema v1 ignores a fabricated inherited tombstone map';
    if (await isolatePrototypeSensitiveTest(name, 'X402_JOURNAL_V1_TOMBSTONE_MAP_ISOLATED')) return;

    const { journal } = await fixture(t, { clock: () => '2026-01-01T00:00:00.000Z' });
    await journal.putValidated(validatedAttempt());
    const fabricatedAttempt = validatedAttempt({ transactionHash: '2'.repeat(64) });
    const fabricated = tombstoneFor(fabricatedAttempt);
    const prior = Object.getOwnPropertyDescriptor(Object.prototype, 'tombstones');
    try {
      Object.defineProperty(Object.prototype, 'tombstones', {
        configurable: true,
        value: { [recordKey(fabricated.authorizationKey, fabricated.transactionHash)]: fabricated },
      });
      assert.equal(
        await journal.getTombstone(fabricated.authorizationKey, fabricated.transactionHash) === null,
        true,
      );
      assert.equal(await journal.findTombstoneByTransactionHash(fabricated.transactionHash) === null, true);
      const listed = await journal.list({ includeTombstones: true });
      assert.equal(listed.tombstones.length, 0);
      const candidates = await journal.listReconciliationCandidates(null);
      assert.equal(candidates.tombstones.length, 0);
      await journal.putValidated(fabricatedAttempt);
      assert.equal((await journal.list()).length, 2);
    } finally {
      restoreOwnProperty(Object.prototype, 'tombstones', prior);
    }
  });

test('journal lookups ignore inherited authorization entries',
  { concurrency: false, timeout: 30_000 }, async t => {
    const name = 'journal lookups ignore inherited authorization entries';
    if (await isolatePrototypeSensitiveTest(name, 'X402_JOURNAL_AUTH_ENTRY_ISOLATED')) return;

    const current = { value: '2026-01-01T00:00:00.000Z' };
    const { journal } = await fixture(t, { clock: () => current.value });
    const seed = validatedAttempt();
    await journal.putValidated(seed);
    const activeAttempt = validatedAttempt({ transactionHash: '2'.repeat(64) });
    const activeKey = recordKey(activeAttempt.authorizationKey, activeAttempt.transactionHash);
    const activePrior = Object.getOwnPropertyDescriptor(Object.prototype, activeKey);
    let tombstoneKey;
    let tombstonePrior;
    try {
      Object.defineProperty(Object.prototype, activeKey, {
        configurable: true,
        value: fullRecord(activeAttempt),
      });
      assert.equal(await journal.get(activeAttempt.authorizationKey, activeAttempt.transactionHash) === null, true);
      assert.equal(
        (await journal.getEntrySnapshot(activeAttempt.authorizationKey, activeAttempt.transactionHash)).kind,
        null,
      );
      await journal.putValidated(activeAttempt);
      assert.equal((await journal.list()).length, 2);

      const snapshot = await journal.getEntrySnapshot(activeAttempt.authorizationKey, activeAttempt.transactionHash);
      current.value = '2026-01-01T01:00:00.000Z';
      const legitimate = await journal.replaceRecordWithTombstone({
        expectedRevision: snapshot.revision,
        expectedRecord: snapshot.entry,
        retentionMs: MINIMUM_RETENTION_MS,
      });
      assert.equal(
        await journal.getTombstone(activeAttempt.authorizationKey, activeAttempt.transactionHash) !== null,
        true,
      );

      const fabricatedAttempt = validatedAttempt({ transactionHash: '3'.repeat(64) });
      const fabricated = tombstoneFor(fabricatedAttempt);
      tombstoneKey = recordKey(fabricated.authorizationKey, fabricated.transactionHash);
      tombstonePrior = Object.getOwnPropertyDescriptor(Object.prototype, tombstoneKey);
      Object.defineProperty(Object.prototype, tombstoneKey, {
        configurable: true,
        value: fabricated,
      });
      assert.equal(
        await journal.getTombstone(fabricated.authorizationKey, fabricated.transactionHash) === null,
        true,
      );
      assert.equal(await journal.get(fabricated.authorizationKey, fabricated.transactionHash) === null, true);
      assert.equal(
        (await journal.getEntrySnapshot(fabricated.authorizationKey, fabricated.transactionHash)).kind,
        null,
      );
      await assert.rejects(
        journal.recordLateMomentumEvidence({
          expectedRevision: (await journal.load()).revision,
          expectedTombstone: fabricated,
          confirmationDetail: includedEvidence().confirmationDetail,
        }),
        error => error?.code === 'journal_compare_and_replace_failed',
      );
      await journal.putValidated(fabricatedAttempt);
      assert.equal((await journal.list()).length, 2);
      assert.equal(legitimate.priorEvidenceState, EVIDENCE_STATES.VALIDATED);
    } finally {
      if (tombstoneKey) restoreOwnProperty(Object.prototype, tombstoneKey, tombstonePrior);
      restoreOwnProperty(Object.prototype, activeKey, activePrior);
    }
  });

test('journal CAS options use one immutable exact-own-data snapshot',
  { concurrency: false, timeout: 30_000 }, async t => {
    const name = 'journal CAS options use one immutable exact-own-data snapshot';
    if (await isolatePrototypeSensitiveTest(name, 'X402_JOURNAL_CAS_OPTIONS_ISOLATED')) return;

    const staleClock = { value: '2026-01-01T00:00:00.000Z' };
    const { journal: evidenceJournal } = await fixture(t, { clock: () => staleClock.value });
    const evidenceAttempt = validatedAttempt();
    await evidenceJournal.putValidated(evidenceAttempt);
    const evidenceSnapshot = await evidenceJournal.getEntrySnapshot(
      evidenceAttempt.authorizationKey,
      evidenceAttempt.transactionHash,
    );
    const staleEvidenceOptions = {
      expectedRevision: evidenceSnapshot.revision - 1,
      expectedRecord: evidenceSnapshot.entry,
      evidenceState: EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      confirmationDetail: null,
    };
    const staleEvidenceCall = evidenceJournal.compareAndUpdateEvidence(staleEvidenceOptions);
    staleEvidenceOptions.expectedRevision = evidenceSnapshot.revision;
    await assert.rejects(staleEvidenceCall, error => error?.code === 'journal_compare_and_replace_failed');
    assert.equal((await evidenceJournal.load()).revision, evidenceSnapshot.revision);

    const swappedEvidenceOptions = {
      expectedRevision: evidenceSnapshot.revision,
      expectedRecord: evidenceSnapshot.entry,
      evidenceState: EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      confirmationDetail: null,
    };
    const swappedEvidenceCall = evidenceJournal.compareAndUpdateEvidence(swappedEvidenceOptions);
    swappedEvidenceOptions.evidenceState = EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN;
    const acknowledged = await swappedEvidenceCall;
    assert.equal(acknowledged.record.evidenceState, EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED);

    const retentionClock = { value: '2026-01-01T00:00:00.000Z' };
    const { journal: retentionJournal } = await fixture(t, { clock: () => retentionClock.value });
    const retentionAttempt = validatedAttempt({ transactionHash: '2'.repeat(64) });
    await retentionJournal.putValidated(retentionAttempt);
    const retentionSnapshot = await retentionJournal.getEntrySnapshot(
      retentionAttempt.authorizationKey,
      retentionAttempt.transactionHash,
    );
    retentionClock.value = '2026-01-01T01:00:00.000Z';
    const staleRetentionOptions = {
      expectedRevision: retentionSnapshot.revision - 1,
      expectedRecord: retentionSnapshot.entry,
      retentionMs: MINIMUM_RETENTION_MS,
    };
    const staleRetentionCall = retentionJournal.replaceRecordWithTombstone(staleRetentionOptions);
    staleRetentionOptions.expectedRevision = retentionSnapshot.revision;
    await assert.rejects(staleRetentionCall, error => error?.code === 'journal_compare_and_replace_failed');
    assert.equal((await retentionJournal.load()).revision, retentionSnapshot.revision);

    const shortenedRetentionOptions = {
      expectedRevision: retentionSnapshot.revision,
      expectedRecord: retentionSnapshot.entry,
      retentionMs: 2_592_000_000,
    };
    const shortenedRetentionCall = retentionJournal.replaceRecordWithTombstone(shortenedRetentionOptions);
    shortenedRetentionOptions.retentionMs = MINIMUM_RETENTION_MS;
    await assert.rejects(shortenedRetentionCall, error => error?.code === 'journal_compare_and_replace_failed');
    assert.equal((await retentionJournal.load()).schemaVersion, 1);

    const lateClock = { value: '2026-01-01T00:00:00.000Z' };
    const { journal: lateJournal } = await fixture(t, { clock: () => lateClock.value });
    const lateAttempt = validatedAttempt({ transactionHash: '3'.repeat(64) });
    await lateJournal.putValidated(lateAttempt);
    const lateRecord = await lateJournal.getEntrySnapshot(lateAttempt.authorizationKey, lateAttempt.transactionHash);
    lateClock.value = '2026-01-01T01:00:00.000Z';
    const lateTombstone = await lateJournal.replaceRecordWithTombstone({
      expectedRevision: lateRecord.revision,
      expectedRecord: lateRecord.entry,
      retentionMs: MINIMUM_RETENTION_MS,
    });
    const lateSnapshot = await lateJournal.getEntrySnapshot(lateAttempt.authorizationKey, lateAttempt.transactionHash);
    const staleLateOptions = {
      expectedRevision: lateSnapshot.revision - 1,
      expectedTombstone: lateTombstone,
      confirmationDetail: includedEvidence().confirmationDetail,
    };
    const staleLateCall = lateJournal.recordLateMomentumEvidence(staleLateOptions);
    staleLateOptions.expectedRevision = lateSnapshot.revision;
    await assert.rejects(staleLateCall, error => error?.code === 'journal_compare_and_replace_failed');
    assert.equal((await lateJournal.load()).revision, lateSnapshot.revision);

    let evidenceAccessorReads = 0;
    const evidenceAccessor = {
      expectedRecord: evidenceSnapshot.entry,
      evidenceState: EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      confirmationDetail: null,
    };
    Object.defineProperty(evidenceAccessor, 'expectedRevision', {
      enumerable: true,
      get() {
        evidenceAccessorReads += 1;
        return evidenceSnapshot.revision;
      },
    });
    await assert.rejects(
      evidenceJournal.compareAndUpdateEvidence(evidenceAccessor),
      error => error?.code === 'journal_compare_and_replace_failed',
    );
    assert.equal(evidenceAccessorReads, 0);

    let retentionAccessorReads = 0;
    const retentionAccessor = {
      expectedRevision: retentionSnapshot.revision,
      expectedRecord: retentionSnapshot.entry,
    };
    Object.defineProperty(retentionAccessor, 'retentionMs', {
      enumerable: true,
      get() {
        retentionAccessorReads += 1;
        return MINIMUM_RETENTION_MS;
      },
    });
    await assert.rejects(
      retentionJournal.replaceRecordWithTombstone(retentionAccessor),
      error => error?.code === 'journal_compare_and_replace_failed',
    );
    assert.equal(retentionAccessorReads, 0);

    let lateAccessorReads = 0;
    const lateAccessor = {
      expectedTombstone: lateTombstone,
      confirmationDetail: includedEvidence().confirmationDetail,
    };
    Object.defineProperty(lateAccessor, 'expectedRevision', {
      enumerable: true,
      get() {
        lateAccessorReads += 1;
        return lateSnapshot.revision;
      },
    });
    await assert.rejects(
      lateJournal.recordLateMomentumEvidence(lateAccessor),
      error => error?.code === 'journal_compare_and_replace_failed',
    );
    assert.equal(lateAccessorReads, 0);

    const inheritedEvidence = Object.assign(Object.create({
      expectedRevision: evidenceSnapshot.revision,
    }), {
      expectedRecord: evidenceSnapshot.entry,
      evidenceState: EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      confirmationDetail: null,
    });
    const inheritedRetention = Object.assign(Object.create({
      retentionMs: MINIMUM_RETENTION_MS,
    }), {
      expectedRevision: retentionSnapshot.revision,
      expectedRecord: retentionSnapshot.entry,
    });
    const inheritedLate = Object.assign(Object.create({
      expectedRevision: lateSnapshot.revision,
    }), {
      expectedTombstone: lateTombstone,
      confirmationDetail: includedEvidence().confirmationDetail,
    });
    await assert.rejects(
      evidenceJournal.compareAndUpdateEvidence(inheritedEvidence),
      error => error?.code === 'journal_compare_and_replace_failed',
    );
    await assert.rejects(
      retentionJournal.replaceRecordWithTombstone(inheritedRetention),
      error => error?.code === 'journal_compare_and_replace_failed',
    );
    await assert.rejects(
      lateJournal.recordLateMomentumEvidence(inheritedLate),
      error => error?.code === 'journal_compare_and_replace_failed',
    );
  });

test('journal CAS recursively snapshots adversarial caller values',
  { concurrency: false, timeout: 30_000 }, async t => {
    const name = 'journal CAS recursively snapshots adversarial caller values';
    if (await isolatePrototypeSensitiveTest(name, 'X402_JOURNAL_CAS_RECURSIVE_ISOLATED')) return;

    async function activeContext(transactionHash) {
      const current = { value: '2026-01-01T00:00:00.000Z' };
      const { journal } = await fixture(t, { clock: () => current.value });
      const attempt = validatedAttempt({ transactionHash });
      await journal.putValidated(attempt);
      const snapshot = await journal.getEntrySnapshot(attempt.authorizationKey, attempt.transactionHash);
      return { current, journal, snapshot };
    }

    const evidence = await activeContext('4'.repeat(64));
    const retention = await activeContext('5'.repeat(64));
    retention.current.value = '2026-01-01T01:00:00.000Z';
    const late = await activeContext('6'.repeat(64));
    late.current.value = '2026-01-01T01:00:00.000Z';
    const lateTombstone = await late.journal.replaceRecordWithTombstone({
      expectedRevision: late.snapshot.revision,
      expectedRecord: late.snapshot.entry,
      retentionMs: MINIMUM_RETENTION_MS,
    });
    const lateSnapshot = await late.journal.getEntrySnapshot(
      lateTombstone.authorizationKey,
      lateTombstone.transactionHash,
    );

    const cases = [
      {
        journal: evidence.journal,
        options: () => ({
          expectedRevision: evidence.snapshot.revision,
          expectedRecord: structuredClone(evidence.snapshot.entry),
          evidenceState: EVIDENCE_STATES.MOMENTUM_INCLUDED,
          confirmationDetail: structuredClone(includedEvidence().confirmationDetail),
        }),
        invoke: options => evidence.journal.compareAndUpdateEvidence(options),
      },
      {
        journal: retention.journal,
        options: () => ({
          expectedRevision: retention.snapshot.revision,
          expectedRecord: structuredClone(retention.snapshot.entry),
          retentionMs: MINIMUM_RETENTION_MS,
        }),
        invoke: options => retention.journal.replaceRecordWithTombstone(options),
      },
      {
        journal: late.journal,
        options: () => ({
          expectedRevision: lateSnapshot.revision,
          expectedTombstone: structuredClone(lateSnapshot.entry),
          confirmationDetail: structuredClone(includedEvidence().confirmationDetail),
        }),
        invoke: options => late.journal.recordLateMomentumEvidence(options),
      },
    ];

    const throwingHandlers = [
      { getPrototypeOf() { throw new Error('reflection rejected'); } },
      { ownKeys() { throw new Error('reflection rejected'); } },
      { getOwnPropertyDescriptor() { throw new Error('reflection rejected'); } },
    ];
    for (const currentCase of cases) {
      for (const handler of throwingHandlers) {
        const revision = (await currentCase.journal.load()).revision;
        await assert.rejects(
          currentCase.invoke(new Proxy(currentCase.options(), handler)),
          error => error?.code === 'journal_compare_and_replace_failed',
        );
        assert.equal((await currentCase.journal.load()).revision, revision);
      }
    }

    const accessorCases = [
      {
        ...cases[0],
        prepare(options, countRead) {
          const value = options.expectedRecord.chainProfile.version;
          Object.defineProperty(options.expectedRecord.chainProfile, 'version', {
            configurable: true,
            enumerable: true,
            get() {
              countRead();
              return value;
            },
          });
        },
      },
      {
        ...cases[1],
        prepare(options, countRead) {
          const value = options.expectedRecord.signedAccountBlock.height;
          Object.defineProperty(options.expectedRecord.signedAccountBlock, 'height', {
            configurable: true,
            enumerable: true,
            get() {
              countRead();
              return value;
            },
          });
        },
      },
      {
        ...cases[2],
        prepare(options, countRead) {
          const value = options.expectedTombstone.chainProfile.version;
          Object.defineProperty(options.expectedTombstone.chainProfile, 'version', {
            configurable: true,
            enumerable: true,
            get() {
              countRead();
              return value;
            },
          });
        },
      },
      {
        ...cases[0],
        prepare(options, countRead) {
          const value = options.confirmationDetail.momentumHeight;
          Object.defineProperty(options.confirmationDetail, 'momentumHeight', {
            configurable: true,
            enumerable: true,
            get() {
              countRead();
              return value;
            },
          });
        },
      },
    ];
    for (const currentCase of accessorCases) {
      const options = currentCase.options();
      let reads = 0;
      currentCase.prepare(options, () => { reads += 1; });
      const revision = (await currentCase.journal.load()).revision;
      await assert.rejects(
        currentCase.invoke(options),
        error => error?.code === 'journal_compare_and_replace_failed',
      );
      assert.equal(reads, 0);
      assert.equal((await currentCase.journal.load()).revision, revision);
    }

    function unstableDescriptor(target, key, alternate) {
      let reads = 0;
      return {
        value: new Proxy(target, {
          getOwnPropertyDescriptor(currentTarget, currentKey) {
            const descriptor = Reflect.getOwnPropertyDescriptor(currentTarget, currentKey);
            if (currentKey !== key || !descriptor) return descriptor;
            reads += 1;
            return { ...descriptor, value: reads % 2 === 0 ? alternate : descriptor.value };
          },
        }),
        reads: () => reads,
      };
    }

    const unstableCases = [
      {
        ...cases[0],
        prepare(options) {
          const unstable = unstableDescriptor(options.expectedRecord.chainProfile, 'chainIdentifier', '8');
          options.expectedRecord.chainProfile = unstable.value;
          return unstable.reads;
        },
      },
      {
        ...cases[1],
        prepare(options) {
          const unstable = unstableDescriptor(options.expectedRecord.resourceIdentity, 'description', 'changed');
          options.expectedRecord.resourceIdentity = unstable.value;
          return unstable.reads;
        },
      },
      {
        ...cases[2],
        prepare(options) {
          const unstable = unstableDescriptor(options.confirmationDetail, 'momentumHeight', 43);
          options.confirmationDetail = unstable.value;
          return unstable.reads;
        },
      },
    ];
    for (const currentCase of unstableCases) {
      const options = currentCase.options();
      const reads = currentCase.prepare(options);
      const revision = (await currentCase.journal.load()).revision;
      await assert.rejects(
        currentCase.invoke(options),
        error => error?.code === 'journal_compare_and_replace_failed',
      );
      assert.equal(reads() >= 2, true);
      assert.equal((await currentCase.journal.load()).revision, revision);
    }

    const evidenceOptions = cases[0].options();
    const originalMomentumHeight = evidenceOptions.confirmationDetail.momentumHeight;
    const evidenceCall = cases[0].invoke(evidenceOptions);
    evidenceOptions.expectedRecord.chainProfile.chainIdentifier = '8';
    evidenceOptions.confirmationDetail.momentumHeight = 43;
    const included = await evidenceCall;
    assert.equal(included.record.evidenceState, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(included.record.momentumEvidence.confirmationDetail.momentumHeight, originalMomentumHeight);

    const retentionOptions = cases[1].options();
    const originalChainIdentifier = retentionOptions.expectedRecord.chainProfile.chainIdentifier;
    const retentionCall = cases[1].invoke(retentionOptions);
    retentionOptions.expectedRecord.chainProfile.chainIdentifier = '8';
    const terminalized = await retentionCall;
    assert.equal(terminalized.chainProfile.chainIdentifier, originalChainIdentifier);

    const lateOptions = cases[2].options();
    const originalLateMomentumHeight = lateOptions.confirmationDetail.momentumHeight;
    const lateCall = cases[2].invoke(lateOptions);
    lateOptions.expectedTombstone.chainProfile.chainIdentifier = '8';
    lateOptions.confirmationDetail.momentumHeight = 43;
    const lateRecorded = await lateCall;
    assert.equal(
      lateRecorded.tombstone.lateMomentumEvidence.confirmationDetail.momentumHeight,
      originalLateMomentumHeight,
    );
  });

test('journal CAS rejects array-brand mismatches across caller inputs',
  { concurrency: false, timeout: 30_000 }, async t => {
    const name = 'journal CAS rejects array-brand mismatches across caller inputs';
    if (await isolatePrototypeSensitiveTest(name, 'X402_JOURNAL_CAS_ARRAY_BRAND_ISOLATED')) return;

    function resourceIdentityWithTags() {
      return {
        url: 'http://example.test/paid',
        description: 'deterministic test resource',
        mimeType: 'application/json',
        tags: ['alpha'],
      };
    }

    function arrayPrototypeImpostor(values) {
      const impostor = Object.create(Array.prototype);
      for (let index = 0; index < values.length; index += 1) {
        Object.defineProperty(impostor, String(index), {
          configurable: true,
          enumerable: true,
          value: values[index],
          writable: true,
        });
      }
      Object.defineProperty(impostor, 'length', {
        configurable: true,
        enumerable: false,
        value: values.length,
        writable: true,
      });
      return impostor;
    }

    function modifiedPrototypeArray(values) {
      const array = [...values];
      Object.setPrototypeOf(array, Object.prototype);
      return array;
    }

    function revokedDuringArrayBrandCheck(values) {
      let revoke;
      const revocable = Proxy.revocable([...values], {
        getPrototypeOf() {
          revoke();
          return Array.prototype;
        },
      });
      revoke = revocable.revoke;
      return revocable.proxy;
    }

    const evidenceClock = { value: '2026-01-01T00:00:00.000Z' };
    const { journal: evidenceJournal } = await fixture(t, { clock: () => evidenceClock.value });
    const evidenceAttempt = validatedAttempt({
      transactionHash: '7'.repeat(64),
      resourceIdentity: resourceIdentityWithTags(),
    });
    await evidenceJournal.putValidated(evidenceAttempt);
    const evidenceSnapshot = await evidenceJournal.getEntrySnapshot(
      evidenceAttempt.authorizationKey,
      evidenceAttempt.transactionHash,
    );

    const retentionClock = { value: '2026-01-01T00:00:00.000Z' };
    const { journal: retentionJournal } = await fixture(t, { clock: () => retentionClock.value });
    const retentionAttempt = validatedAttempt({
      transactionHash: '8'.repeat(64),
      resourceIdentity: resourceIdentityWithTags(),
    });
    await retentionJournal.putValidated(retentionAttempt);
    const retentionSnapshot = await retentionJournal.getEntrySnapshot(
      retentionAttempt.authorizationKey,
      retentionAttempt.transactionHash,
    );
    retentionClock.value = '2026-01-01T01:00:00.000Z';

    const lateClock = { value: '2026-01-01T00:00:00.000Z' };
    const { journal: lateJournal } = await fixture(t, { clock: () => lateClock.value });
    const lateAttempt = validatedAttempt({
      transactionHash: '9'.repeat(64),
      resourceIdentity: resourceIdentityWithTags(),
    });
    await lateJournal.putValidated(lateAttempt);
    const lateRecord = await lateJournal.getEntrySnapshot(lateAttempt.authorizationKey, lateAttempt.transactionHash);
    lateClock.value = '2026-01-01T01:00:00.000Z';
    await lateJournal.replaceRecordWithTombstone({
      expectedRevision: lateRecord.revision,
      expectedRecord: lateRecord.entry,
      retentionMs: MINIMUM_RETENTION_MS,
    });
    const lateSnapshot = await lateJournal.getEntrySnapshot(lateAttempt.authorizationKey, lateAttempt.transactionHash);

    const variants = [arrayPrototypeImpostor, modifiedPrototypeArray, revokedDuringArrayBrandCheck];
    for (const variant of variants) {
      const evidenceOptions = {
        expectedRevision: evidenceSnapshot.revision,
        expectedRecord: structuredClone(evidenceSnapshot.entry),
        evidenceState: EVIDENCE_STATES.MOMENTUM_INCLUDED,
        confirmationDetail: structuredClone(includedEvidence().confirmationDetail),
      };
      evidenceOptions.expectedRecord.resourceIdentity.tags = variant(['alpha']);
      const evidenceRevision = (await evidenceJournal.load()).revision;
      await assert.rejects(
        evidenceJournal.compareAndUpdateEvidence(evidenceOptions),
        error => error?.code === 'journal_compare_and_replace_failed',
      );
      assert.equal((await evidenceJournal.load()).revision, evidenceRevision);

      const retentionOptions = {
        expectedRevision: retentionSnapshot.revision,
        expectedRecord: structuredClone(retentionSnapshot.entry),
        retentionMs: MINIMUM_RETENTION_MS,
      };
      retentionOptions.expectedRecord.resourceIdentity.tags = variant(['alpha']);
      const retentionRevision = (await retentionJournal.load()).revision;
      await assert.rejects(
        retentionJournal.replaceRecordWithTombstone(retentionOptions),
        error => error?.code === 'journal_compare_and_replace_failed',
      );
      assert.equal((await retentionJournal.load()).revision, retentionRevision);

      const lateOptions = {
        expectedRevision: lateSnapshot.revision,
        expectedTombstone: structuredClone(lateSnapshot.entry),
        confirmationDetail: variant(Object.values(includedEvidence().confirmationDetail)),
      };
      const lateRevision = (await lateJournal.load()).revision;
      await assert.rejects(
        lateJournal.recordLateMomentumEvidence(lateOptions),
        error => error?.code === 'journal_compare_and_replace_failed',
      );
      assert.equal((await lateJournal.load()).revision, lateRevision);
    }

    const included = await evidenceJournal.compareAndUpdateEvidence({
      expectedRevision: evidenceSnapshot.revision,
      expectedRecord: evidenceSnapshot.entry,
      evidenceState: EVIDENCE_STATES.MOMENTUM_INCLUDED,
      confirmationDetail: includedEvidence().confirmationDetail,
    });
    assert.equal(included.record.resourceIdentity.tags[0], 'alpha');

    const tombstone = await retentionJournal.replaceRecordWithTombstone({
      expectedRevision: retentionSnapshot.revision,
      expectedRecord: retentionSnapshot.entry,
      retentionMs: MINIMUM_RETENTION_MS,
    });
    assert.equal(tombstone.priorEvidenceState, EVIDENCE_STATES.VALIDATED);

    const lateRecorded = await lateJournal.recordLateMomentumEvidence({
      expectedRevision: lateSnapshot.revision,
      expectedTombstone: lateSnapshot.entry,
      confirmationDetail: includedEvidence().confirmationDetail,
    });
    assert.equal(lateRecorded.changed, true);
  });

test('journal CAS arrays never invoke inherited toJSON hooks',
  { concurrency: false, timeout: 30_000 }, async t => {
    const name = 'journal CAS arrays never invoke inherited toJSON hooks';
    if (await isolatePrototypeSensitiveTest(name, 'X402_JOURNAL_CAS_ARRAY_TOJSON_ISOLATED')) return;

    const resourceIdentity = {
      url: 'http://example.test/paid',
      description: 'deterministic test resource',
      mimeType: 'application/json',
      tags: ['alpha'],
    };
    const evidenceClock = { value: '2026-01-01T00:00:00.000Z' };
    const { journal: evidenceJournal } = await fixture(t, { clock: () => evidenceClock.value });
    const evidenceAttempt = validatedAttempt({ transactionHash: 'a'.repeat(64), resourceIdentity });
    await evidenceJournal.putValidated(evidenceAttempt);
    const evidenceSnapshot = await evidenceJournal.getEntrySnapshot(
      evidenceAttempt.authorizationKey,
      evidenceAttempt.transactionHash,
    );

    const retentionClock = { value: '2026-01-01T00:00:00.000Z' };
    const { journal: retentionJournal } = await fixture(t, { clock: () => retentionClock.value });
    const retentionAttempt = validatedAttempt({
      transactionHash: 'b'.repeat(64),
      resourceIdentity: structuredClone(resourceIdentity),
    });
    await retentionJournal.putValidated(retentionAttempt);
    const retentionSnapshot = await retentionJournal.getEntrySnapshot(
      retentionAttempt.authorizationKey,
      retentionAttempt.transactionHash,
    );
    retentionClock.value = '2026-01-01T01:00:00.000Z';

    const prior = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');
    let getterReads = 0;
    let hookCalls = 0;
    let included;
    let tombstone;
    let lateRecorded;
    try {
      Object.defineProperty(Array.prototype, 'toJSON', {
        configurable: true,
        get() {
          getterReads += 1;
          return function inheritedArrayToJSON() {
            hookCalls += 1;
            return ['forged'];
          };
        },
      });
      included = await evidenceJournal.compareAndUpdateEvidence({
        expectedRevision: evidenceSnapshot.revision,
        expectedRecord: evidenceSnapshot.entry,
        evidenceState: EVIDENCE_STATES.MOMENTUM_INCLUDED,
        confirmationDetail: includedEvidence().confirmationDetail,
      });
      tombstone = await retentionJournal.replaceRecordWithTombstone({
        expectedRevision: retentionSnapshot.revision,
        expectedRecord: retentionSnapshot.entry,
        retentionMs: MINIMUM_RETENTION_MS,
      });
      const lateSnapshot = await retentionJournal.getEntrySnapshot(
        tombstone.authorizationKey,
        tombstone.transactionHash,
      );
      lateRecorded = await retentionJournal.recordLateMomentumEvidence({
        expectedRevision: lateSnapshot.revision,
        expectedTombstone: lateSnapshot.entry,
        confirmationDetail: includedEvidence().confirmationDetail,
      });
    } finally {
      restoreOwnProperty(Array.prototype, 'toJSON', prior);
    }
    assert.equal(getterReads, 0);
    assert.equal(hookCalls, 0);
    assert.equal(included.record.resourceIdentity.tags[0], 'alpha');
    assert.equal(tombstone.priorEvidenceState, EVIDENCE_STATES.VALIDATED);
    assert.equal(lateRecorded.changed, true);
  });

test('public journal array validation rejects prototype and iterator hooks',
  { concurrency: false, timeout: 30_000 }, async t => {
    const name = 'public journal array validation rejects prototype and iterator hooks';
    if (await isolatePrototypeSensitiveTest(name, 'X402_JOURNAL_PUBLIC_ARRAY_ISOLATED')) return;

    const iterator = Array.prototype[Symbol.iterator];
    let iteratorGetterReads = 0;
    let iteratorHookCalls = 0;
    let accessorReads = 0;

    function attachIteratorPrototype(array) {
      const originalPrototype = Object.getPrototypeOf(array);
      const iteratorPrototype = Object.create(originalPrototype);
      Object.defineProperty(iteratorPrototype, Symbol.iterator, {
        configurable: true,
        get() {
          iteratorGetterReads += 1;
          return function inheritedIteratorHook() {
            iteratorHookCalls += 1;
            return iterator.call(this);
          };
        },
      });
      Object.setPrototypeOf(array, iteratorPrototype);
      return () => { Object.setPrototypeOf(array, originalPrototype); };
    }

    const { directory: putDirectory, journal: putJournal } = await fixture(t);
    await putJournal.load();
    const putBefore = await readFile(join(putDirectory, 'settlement-journal.json'));

    const modifiedAttempt = validatedAttempt({
      transactionHash: 'c'.repeat(64),
      resourceIdentity: {
        url: 'http://example.test/paid',
        description: 'deterministic test resource',
        mimeType: 'application/json',
        tags: ['alpha'],
      },
    });
    const modifiedTags = modifiedAttempt.resourceIdentity.tags;
    const modifiedOriginalPrototype = Object.getPrototypeOf(modifiedTags);
    Object.setPrototypeOf(modifiedTags, Object.prototype);
    try {
      await assert.rejects(
        putJournal.putValidated(modifiedAttempt),
        error => error?.code === 'journal_record_invalid',
      );
    } finally {
      Object.setPrototypeOf(modifiedTags, modifiedOriginalPrototype);
    }
    assert.equal((await putJournal.load()).revision, 0);
    assert.equal((await readFile(join(putDirectory, 'settlement-journal.json'))).equals(putBefore), true);

    const iteratorAttempt = validatedAttempt({
      transactionHash: 'd'.repeat(64),
      resourceIdentity: {
        url: 'http://example.test/paid',
        description: 'deterministic test resource',
        mimeType: 'application/json',
        tags: ['alpha'],
      },
    });
    const restorePutIterator = attachIteratorPrototype(iteratorAttempt.resourceIdentity.tags);
    try {
      await assert.rejects(
        putJournal.putValidated(iteratorAttempt),
        error => error?.code === 'journal_record_invalid',
      );
    } finally {
      restorePutIterator();
    }
    assert.equal((await putJournal.load()).revision, 0);
    assert.equal((await readFile(join(putDirectory, 'settlement-journal.json'))).equals(putBefore), true);

    const legitimateAttempt = validatedAttempt({
      transactionHash: 'e'.repeat(64),
      resourceIdentity: {
        url: 'http://example.test/paid',
        description: 'deterministic test resource',
        mimeType: 'application/json',
        tags: ['alpha'],
      },
    });
    const stored = await putJournal.putValidated(legitimateAttempt);
    assert.equal(stored.resourceIdentity.tags[0], 'alpha');

    const { directory: deliveryDirectory, journal: deliveryJournal } = await fixture(t);
    const deliveryAttempt = validatedAttempt({ transactionHash: 'f'.repeat(64) });
    await deliveryJournal.putValidated(deliveryAttempt);
    await deliveryJournal.updateEvidence(
      deliveryAttempt.authorizationKey,
      deliveryAttempt.transactionHash,
      EVIDENCE_STATES.MOMENTUM_INCLUDED,
      includedEvidence(),
    );
    await deliveryJournal.markDeliveryPending(
      deliveryAttempt.authorizationKey,
      deliveryAttempt.transactionHash,
      acceptedRequirementForAttempt(deliveryAttempt),
    );
    const deliveryRevision = (await deliveryJournal.load()).revision;
    const deliveryBefore = await readFile(join(deliveryDirectory, 'settlement-journal.json'));

    const invalidArrays = [];
    const modifiedDelivery = ['value'];
    const restoreModifiedDelivery = () => { Object.setPrototypeOf(modifiedDelivery, Array.prototype); };
    Object.setPrototypeOf(modifiedDelivery, Object.prototype);
    invalidArrays.push({ array: modifiedDelivery, restore: restoreModifiedDelivery });

    const iteratorDelivery = ['value'];
    invalidArrays.push({ array: iteratorDelivery, restore: attachIteratorPrototype(iteratorDelivery) });

    invalidArrays.push({ array: new Array(1), restore() {} });

    const extraDelivery = ['value'];
    extraDelivery.extra = true;
    invalidArrays.push({ array: extraDelivery, restore() {} });

    const symbolDelivery = ['value'];
    symbolDelivery[Symbol('extra')] = true;
    invalidArrays.push({ array: symbolDelivery, restore() {} });

    const nonEnumerableDelivery = ['value'];
    Object.defineProperty(nonEnumerableDelivery, '0', {
      configurable: true,
      enumerable: false,
      value: 'value',
      writable: true,
    });
    invalidArrays.push({ array: nonEnumerableDelivery, restore() {} });

    const accessorDelivery = ['value'];
    Object.defineProperty(accessorDelivery, '0', {
      configurable: true,
      enumerable: true,
      get() {
        accessorReads += 1;
        return 'value';
      },
    });
    invalidArrays.push({ array: accessorDelivery, restore() {} });

    for (const current of invalidArrays) {
      try {
        await assert.rejects(
          deliveryJournal.markDelivered(
            deliveryAttempt.authorizationKey,
            deliveryAttempt.transactionHash,
            { items: current.array },
          ),
          error => error?.code === 'journal_record_invalid',
        );
      } finally {
        current.restore();
      }
      assert.equal((await deliveryJournal.load()).revision, deliveryRevision);
      assert.equal(
        (await readFile(join(deliveryDirectory, 'settlement-journal.json'))).equals(deliveryBefore),
        true,
      );
    }

    const delivered = await deliveryJournal.markDelivered(
      deliveryAttempt.authorizationKey,
      deliveryAttempt.transactionHash,
      { items: ['value'] },
    );
    assert.equal(delivered.cachedResponse.items[0], 'value');
    assert.equal(iteratorGetterReads, 0);
    assert.equal(iteratorHookCalls, 0);
    assert.equal(accessorReads, 0);
  });

test('journal checksum and serialization ignore mutable Array prototype hooks',
  { concurrency: false, timeout: 30_000 }, async t => {
    const name = 'journal checksum and serialization ignore mutable Array prototype hooks';
    if (await isolatePrototypeSensitiveTest(name, 'X402_JOURNAL_ARRAY_SERIALIZER_ISOLATED')) return;

    async function deliveryContext(transactionHash) {
      const current = { value: '2026-01-01T00:00:00.000Z' };
      const context = await fixture(t, { clock: () => current.value });
      const attempt = validatedAttempt({
        transactionHash,
        resourceIdentity: {
          url: 'http://example.test/paid',
          description: 'deterministic test resource',
          mimeType: 'application/json',
          tags: ['alpha', 'beta'],
        },
      });
      await context.journal.putValidated(attempt);
      await context.journal.updateEvidence(
        attempt.authorizationKey,
        attempt.transactionHash,
        EVIDENCE_STATES.MOMENTUM_INCLUDED,
        includedEvidence(),
      );
      await context.journal.markDeliveryPending(
        attempt.authorizationKey,
        attempt.transactionHash,
        acceptedRequirementForAttempt(attempt),
      );
      return { ...context, attempt, current };
    }

    async function v2Context() {
      const context = await deliveryContext('2'.repeat(64));
      await context.journal.markDelivered(
        context.attempt.authorizationKey,
        context.attempt.transactionHash,
        { body: { items: ['fixed', 'ordered'] } },
      );
      const target = validatedAttempt({ transactionHash: '3'.repeat(64) });
      await context.journal.putValidated(target);
      const snapshot = await context.journal.getEntrySnapshot(target.authorizationKey, target.transactionHash);
      context.current.value = '2026-01-01T01:00:00.000Z';
      return { ...context, snapshot };
    }

    const ordinaryV1 = await deliveryContext('1'.repeat(64));
    const poisonedV1 = await deliveryContext('1'.repeat(64));
    const ordinaryV2 = await v2Context();
    const poisonedV2 = await v2Context();
    await ordinaryV1.journal.markDelivered(
      ordinaryV1.attempt.authorizationKey,
      ordinaryV1.attempt.transactionHash,
      { body: { items: ['fixed', 'ordered'] } },
    );
    await ordinaryV2.journal.replaceRecordWithTombstone({
      expectedRevision: ordinaryV2.snapshot.revision,
      expectedRecord: ordinaryV2.snapshot.entry,
      retentionMs: MINIMUM_RETENTION_MS,
    });
    const expectedV1 = await readFile(join(ordinaryV1.directory, 'settlement-journal.json'));
    const expectedV2 = await readFile(join(ordinaryV2.directory, 'settlement-journal.json'));
    const expectedV1State = JSON.parse(expectedV1.toString('utf8'));
    const expectedV2State = JSON.parse(expectedV2.toString('utf8'));
    assert.equal(expectedV1.equals(Buffer.from(`${JSON.stringify(expectedV1State, null, 2)}\n`)), true);
    assert.equal(expectedV2.equals(Buffer.from(`${JSON.stringify(expectedV2State, null, 2)}\n`)), true);

    const prototype = Array.prototype;
    const names = ['map', 'join', 'push', 'sort'];
    const prior = new Map();
    for (let index = 0; index < names.length; index += 1) {
      const key = names[index];
      prior.set(key, Object.getOwnPropertyDescriptor(prototype, key));
    }
    prior.set(Symbol.iterator, Object.getOwnPropertyDescriptor(prototype, Symbol.iterator));
    prior.set('toJSON', Object.getOwnPropertyDescriptor(prototype, 'toJSON'));
    prior.set('0', Object.getOwnPropertyDescriptor(prototype, '0'));
    const iterator = prior.get(Symbol.iterator).value;
    const poisonHits = { map: 0, join: 0, push: 0, sort: 0, iterator: 0 };
    let indexSetterHits = 0;
    let toJsonReads = 0;
    const ownValue = (value, key) => Object.getOwnPropertyDescriptor(value, key)?.value;
    try {
      for (let index = 0; index < names.length; index += 1) {
        const key = names[index];
        const original = prior.get(key).value;
        Object.defineProperty(prototype, key, {
          configurable: true,
          value() {
            const first = ownValue(this, '0');
            let targeted = false;
            if (key === 'map') targeted = first === 'alpha' || first === 'fixed';
            if (key === 'join') targeted = first === '"fixed"' || first === '"alpha"';
            if (key === 'push') targeted = first === '"fixed"' || ownValue(arguments, '0')?.key !== undefined;
            if (key === 'sort') {
              for (let item = 0; item < this.length; item += 1) {
                const current = ownValue(this, String(item));
                if (current === 'schemaVersion' || current === 'records' || current === 'expectedRevision') {
                  targeted = true;
                  break;
                }
              }
            }
            if (targeted) {
              poisonHits[key] += 1;
              throw new Error(`mutable Array ${key} used`);
            }
            return Reflect.apply(original, this, arguments);
          },
          writable: true,
        });
      }
      Object.defineProperty(prototype, Symbol.iterator, {
        configurable: true,
        value() {
          for (let index = 0; index < this.length; index += 1) {
            if (ownValue(this, String(index)) === 'expectedRevision') {
              poisonHits.iterator += 1;
              throw new Error('mutable Array iterator used');
            }
          }
          return iterator.call(this);
        },
        writable: true,
      });
      Object.defineProperty(prototype, 'toJSON', {
        configurable: true,
        get() {
          toJsonReads += 1;
          throw new Error('mutable Array toJSON used');
        },
      });
      Object.defineProperty(prototype, '0', {
        configurable: true,
        set(value) {
          if (value === 'schemaVersion' || value === 'expectedRevision' || value?.key !== undefined) {
            indexSetterHits += 1;
            throw new Error('mutable Array index setter used');
          }
          Object.defineProperty(this, '0', {
            configurable: true,
            enumerable: true,
            value,
            writable: true,
          });
        },
      });
      await poisonedV1.journal.markDelivered(
        poisonedV1.attempt.authorizationKey,
        poisonedV1.attempt.transactionHash,
        { body: { items: ['fixed', 'ordered'] } },
      );
      await poisonedV2.journal.replaceRecordWithTombstone({
        expectedRevision: poisonedV2.snapshot.revision,
        expectedRecord: poisonedV2.snapshot.entry,
        retentionMs: MINIMUM_RETENTION_MS,
      });
    } finally {
      for (let index = 0; index < names.length; index += 1) {
        restoreOwnProperty(prototype, names[index], prior.get(names[index]));
      }
      restoreOwnProperty(prototype, Symbol.iterator, prior.get(Symbol.iterator));
      restoreOwnProperty(prototype, 'toJSON', prior.get('toJSON'));
      restoreOwnProperty(prototype, '0', prior.get('0'));
    }

    assert.equal(toJsonReads, 0);
    assert.equal(indexSetterHits, 0);
    safelyEqual(poisonHits, { map: 0, join: 0, push: 0, sort: 0, iterator: 0 });
    assert.equal((await readFile(join(poisonedV1.directory, 'settlement-journal.json'))).equals(expectedV1), true);
    assert.equal((await readFile(join(poisonedV2.directory, 'settlement-journal.json'))).equals(expectedV2), true);
    assert.equal((await new SettlementJournal({
      directory: poisonedV1.directory,
      allowedRoot: poisonedV1.root,
    }).load()).schemaVersion, 1);
    assert.equal((await new SettlementJournal({
      directory: poisonedV2.directory,
      allowedRoot: poisonedV2.root,
    }).load()).schemaVersion, 2);
  });

test('public journal payloads use one contained descriptor snapshot',
  { concurrency: false, timeout: 30_000 }, async t => {
    const name = 'public journal payloads use one contained descriptor snapshot';
    if (await isolatePrototypeSensitiveTest(name, 'X402_JOURNAL_PUBLIC_SNAPSHOT_ISOLATED')) return;

    const { directory, journal } = await fixture(t);
    await journal.load();
    const emptyBytes = await readFile(join(directory, 'settlement-journal.json'));
    const accessorAttempt = validatedAttempt({ transactionHash: '4'.repeat(64) });
    let accessorReads = 0;
    Object.defineProperty(accessorAttempt.resourceIdentity, 'description', {
      configurable: true,
      enumerable: true,
      get() {
        accessorReads += 1;
        return 'changed';
      },
    });
    await assert.rejects(
      journal.putValidated(accessorAttempt),
      error => error?.code === 'journal_record_invalid',
    );
    assert.equal(accessorReads, 0);
    assert.equal((await readFile(join(directory, 'settlement-journal.json'))).equals(emptyBytes), true);

    const replacingAttempt = validatedAttempt({ transactionHash: '9'.repeat(64) });
    let replacingReads = 0;
    Object.defineProperty(replacingAttempt.resourceIdentity, 'description', {
      configurable: true,
      enumerable: true,
      get() {
        replacingReads += 1;
        Object.defineProperty(replacingAttempt.resourceIdentity, 'description', {
          configurable: true,
          enumerable: true,
          value: 'replacement',
          writable: true,
        });
        return 'replacement';
      },
    });
    await assert.rejects(
      journal.putValidated(replacingAttempt),
      error => error?.code === 'journal_record_invalid',
    );
    assert.equal(replacingReads, 0);
    assert.equal((await journal.load()).revision, 0);

    const throwingHandlers = [
      { getPrototypeOf() { throw new Error('reflection rejected'); } },
      { ownKeys() { throw new Error('reflection rejected'); } },
      { getOwnPropertyDescriptor() { throw new Error('reflection rejected'); } },
    ];
    for (let index = 0; index < throwingHandlers.length; index += 1) {
      const trapped = validatedAttempt({ transactionHash: String.fromCharCode(97 + index).repeat(64) });
      trapped.resourceIdentity = new Proxy(trapped.resourceIdentity, throwingHandlers[index]);
      await assert.rejects(
        journal.putValidated(trapped),
        error => error?.code === 'journal_record_invalid' && error?.cause === undefined,
      );
      assert.equal((await journal.load()).revision, 0);
    }

    const stableAttempt = validatedAttempt({ transactionHash: '5'.repeat(64) });
    stableAttempt.signedAccountBlock.fusedPlasma = -0;
    stableAttempt.resourceIdentity = new Proxy(stableAttempt.resourceIdentity, {});
    const stableStored = await journal.putValidated(stableAttempt);
    assert.equal(stableStored.resourceIdentity.description, 'deterministic test resource');
    assert.equal(Object.is(stableStored.signedAccountBlock.fusedPlasma, 0), true);

    const unstableAttempt = validatedAttempt({ transactionHash: '6'.repeat(64) });
    let descriptorReads = 0;
    unstableAttempt.resourceIdentity = new Proxy(unstableAttempt.resourceIdentity, {
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (key !== 'description' || !descriptor) return descriptor;
        descriptorReads += 1;
        return { ...descriptor, value: descriptorReads % 2 === 0 ? 'changed' : descriptor.value };
      },
    });
    const revisionBeforeUnstable = (await journal.load()).revision;
    await assert.rejects(
      journal.putValidated(unstableAttempt),
      error => error?.code === 'journal_record_invalid',
    );
    assert.equal(descriptorReads >= 2, true);
    assert.equal((await journal.load()).revision, revisionBeforeUnstable);

    const mutationAttempt = validatedAttempt({ transactionHash: '7'.repeat(64) });
    const mutationCall = journal.putValidated(mutationAttempt);
    mutationAttempt.resourceIdentity.description = 'late mutation';
    const mutationStored = await mutationCall;
    assert.equal(mutationStored.resourceIdentity.description, 'deterministic test resource');

    const evidence = includedEvidence();
    const originalHeight = evidence.confirmationDetail.momentumHeight;
    const evidenceCall = journal.updateEvidence(
      mutationAttempt.authorizationKey,
      mutationAttempt.transactionHash,
      EVIDENCE_STATES.MOMENTUM_INCLUDED,
      evidence,
    );
    evidence.confirmationDetail.momentumHeight = originalHeight + 1;
    const updated = await evidenceCall;
    assert.equal(updated.momentumEvidence.confirmationDetail.momentumHeight, originalHeight);
    await journal.markDeliveryPending(
      mutationAttempt.authorizationKey,
      mutationAttempt.transactionHash,
      acceptedRequirementForAttempt(mutationAttempt),
    );
    const cachedResponse = { body: { items: ['fixed', 'ordered'] } };
    const deliveredCall = journal.markDelivered(
      mutationAttempt.authorizationKey,
      mutationAttempt.transactionHash,
      cachedResponse,
    );
    cachedResponse.body.items[0] = 'late mutation';
    const delivered = await deliveredCall;
    assert.equal(delivered.cachedResponse.body.items[0], 'fixed');

    const other = validatedAttempt({ transactionHash: '8'.repeat(64) });
    await journal.putValidated(other);
    const accessorEvidence = includedEvidence();
    let evidenceReads = 0;
    Object.defineProperty(accessorEvidence.confirmationDetail, 'momentumHeight', {
      configurable: true,
      enumerable: true,
      get() {
        evidenceReads += 1;
        return 42;
      },
    });
    const revisionBeforeAccessor = (await journal.load()).revision;
    await assert.rejects(
      journal.updateEvidence(
        other.authorizationKey,
        other.transactionHash,
        EVIDENCE_STATES.MOMENTUM_INCLUDED,
        accessorEvidence,
      ),
      error => error?.code === 'journal_momentum_evidence_invalid',
    );
    assert.equal(evidenceReads, 0);
    assert.equal((await journal.load()).revision, revisionBeforeAccessor);
  });

test('deep malformed v1 and v2 files fail with the fixed corruption code', async t => {
  const { root, directory } = await fixture(t);
  let nested = { value: true };
  for (let depth = 0; depth < 64; depth += 1) nested = { nested };
  const attempt = validatedAttempt();
  const deepRecord = fullRecord(attempt, {
    evidenceState: EVIDENCE_STATES.MOMENTUM_INCLUDED,
    momentumEvidence: includedEvidence(),
    deliveryState: DELIVERY_STATES.DELIVERED,
    cachedResponse: nested,
  });
  const key = recordKey(deepRecord.authorizationKey, deepRecord.transactionHash);
  const states = [
    withChecksum({ schemaVersion: 1, revision: 1, records: { [key]: deepRecord } }),
    withChecksum({ schemaVersion: 2, revision: 1, records: { [key]: deepRecord }, tombstones: {} }),
  ];
  await mkdir(directory, { recursive: true });
  for (let index = 0; index < states.length; index += 1) {
    const serialized = JSON.stringify(states[index]);
    assert.equal(Buffer.byteLength(serialized) < 16 * 1024 * 1024, true);
    await writeFile(
      join(directory, 'settlement-journal.json'),
      serialized,
      'utf8',
    );
    await assert.rejects(
      new SettlementJournal({ directory, allowedRoot: root }).load(),
      error => error?.code === 'journal_corrupt' && error?.cause === undefined &&
        error?.stack === 'SettlementJournalError: journal_corrupt',
    );
  }
});

test('Momentum evidence strengthens only the count for one immutable inclusion tuple', async t => {
  const clock = { value: '2026-01-01T00:00:00.000Z' };
  const { directory, journal } = await fixture(t, { clock: () => clock.value });
  const { attempt, acceptedRequirement } = thresholdClaimFixture(3);
  await journal.putValidated(attempt);
  const firstEvidence = includedEvidence({ numConfirmations: 1 });
  const first = await journal.updateEvidence(
    attempt.authorizationKey,
    attempt.transactionHash,
    EVIDENCE_STATES.MOMENTUM_INCLUDED,
    firstEvidence,
  );
  const firstState = await journal.load();
  const firstBytes = await readFile(join(directory, 'settlement-journal.json'));

  clock.value = '2026-01-01T00:01:00.000Z';
  const equal = await journal.updateEvidence(
    attempt.authorizationKey,
    attempt.transactionHash,
    EVIDENCE_STATES.MOMENTUM_INCLUDED,
    {
      observedAt: '2026-01-01T00:01:00.000Z',
      confirmationDetail: structuredClone(firstEvidence.confirmationDetail),
    },
  );
  assert.deepEqual(equal, first);
  assert.equal((await journal.load()).revision, firstState.revision);
  assert.equal((await readFile(join(directory, 'settlement-journal.json'))).equals(firstBytes), true);

  const strongerDetail = {
    ...structuredClone(firstEvidence.confirmationDetail),
    numConfirmations: 2,
  };
  const stronger = await journal.updateEvidence(
    attempt.authorizationKey,
    attempt.transactionHash,
    EVIDENCE_STATES.MOMENTUM_INCLUDED,
    { observedAt: '2026-01-01T00:01:00.000Z', confirmationDetail: strongerDetail },
  );
  assert.equal(stronger.momentumEvidence.observedAt, firstEvidence.observedAt);
  assert.deepEqual(stronger.momentumEvidence.confirmationDetail, strongerDetail);
  assert.equal(stronger.updatedAt, clock.value);
  assert.equal((await journal.load()).revision, firstState.revision + 1);

  for (const changedDetail of [
    { ...strongerDetail, numConfirmations: 1 },
    { ...strongerDetail, numConfirmations: 3, momentumHeight: strongerDetail.momentumHeight + 1 },
    { ...strongerDetail, numConfirmations: 3, momentumHash: digest('different-inclusion') },
    { ...strongerDetail, numConfirmations: 3, momentumTimestamp: strongerDetail.momentumTimestamp + 1 },
  ]) {
    const before = await readFile(join(directory, 'settlement-journal.json'));
    const revision = (await journal.load()).revision;
    await assert.rejects(journal.updateEvidence(
      attempt.authorizationKey,
      attempt.transactionHash,
      EVIDENCE_STATES.MOMENTUM_INCLUDED,
      { observedAt: '2026-01-01T00:02:00.000Z', confirmationDetail: changedDetail },
    ));
    assert.equal((await journal.load()).revision, revision);
    assert.equal((await readFile(join(directory, 'settlement-journal.json'))).equals(before), true);
  }

  const belowThreshold = await readFile(join(directory, 'settlement-journal.json'));
  await assert.rejects(journal.markDeliveryPending(
    attempt.authorizationKey,
    attempt.transactionHash,
    acceptedRequirement,
  ));
  assert.equal((await readFile(join(directory, 'settlement-journal.json'))).equals(belowThreshold), true);

  clock.value = '2026-01-01T00:03:00.000Z';
  await journal.updateEvidence(
    attempt.authorizationKey,
    attempt.transactionHash,
    EVIDENCE_STATES.MOMENTUM_INCLUDED,
    {
      observedAt: '2026-01-01T00:03:00.000Z',
      confirmationDetail: { ...strongerDetail, numConfirmations: 3 },
    },
  );
  const claims = await Promise.all([
    journal.markDeliveryPending(
      attempt.authorizationKey,
      attempt.transactionHash,
      acceptedRequirement,
    ),
    journal.markDeliveryPending(
      attempt.authorizationKey,
      attempt.transactionHash,
      {
        amount: acceptedRequirement.amount,
        scheme: acceptedRequirement.scheme,
        maxTimeoutSeconds: acceptedRequirement.maxTimeoutSeconds,
        payTo: acceptedRequirement.payTo,
        asset: acceptedRequirement.asset,
        network: acceptedRequirement.network,
        extra: {
          zenonChain: {
            genesisMomentumHash: acceptedRequirement.extra.zenonChain.genesisMomentumHash,
            version: acceptedRequirement.extra.zenonChain.version,
            chainIdentifier: acceptedRequirement.extra.zenonChain.chainIdentifier,
          },
          minimumMomentumConfirmations:
            acceptedRequirement.extra.minimumMomentumConfirmations,
          settlement: acceptedRequirement.extra.settlement,
          poc: acceptedRequirement.extra.poc,
          paymentFlow: acceptedRequirement.extra.paymentFlow,
        },
      },
    ),
  ]);
  assert.deepEqual(claims.map(value => value.deliveryClaimed).sort(), [false, true]);
  assert.equal((await journal.get(
    attempt.authorizationKey,
    attempt.transactionHash,
  )).deliveryState, DELIVERY_STATES.DELIVERY_PENDING);
});

test('delivery claim reauthenticates the full accepted requirement in every delivery state', async t => {
  for (const state of [DELIVERY_STATES.NONE, DELIVERY_STATES.DELIVERY_PENDING, DELIVERY_STATES.DELIVERED]) {
    const { directory, journal } = await fixture(t);
    const { attempt, acceptedRequirement } = thresholdClaimFixture(2, {
      transactionHash: digest(`claim-state-${state}`),
    });
    await journal.putValidated(attempt);
    await journal.updateEvidence(
      attempt.authorizationKey,
      attempt.transactionHash,
      EVIDENCE_STATES.MOMENTUM_INCLUDED,
      includedEvidence({ numConfirmations: 2 }),
    );
    if (state !== DELIVERY_STATES.NONE) {
      await journal.markDeliveryPending(
        attempt.authorizationKey,
        attempt.transactionHash,
        acceptedRequirement,
      );
    }
    if (state === DELIVERY_STATES.DELIVERED) {
      await journal.markDelivered(
        attempt.authorizationKey,
        attempt.transactionHash,
        { status: 200, headers: {}, body: { ok: true } },
      );
    }

    const wrongRequirement = structuredClone(acceptedRequirement);
    delete wrongRequirement.extra.minimumMomentumConfirmations;
    const before = await readFile(join(directory, 'settlement-journal.json'));
    const revision = (await journal.load()).revision;
    await assert.rejects(journal.markDeliveryPending(
      attempt.authorizationKey,
      attempt.transactionHash,
      wrongRequirement,
    ));
    assert.equal((await journal.load()).revision, revision);
    assert.equal((await readFile(join(directory, 'settlement-journal.json'))).equals(before), true);
  }
});

test('delivery claim checks the durable count before pending and delivered early returns', async t => {
  for (const state of [DELIVERY_STATES.DELIVERY_PENDING, DELIVERY_STATES.DELIVERED]) {
    const { directory, journal } = await fixture(t);
    const { attempt, acceptedRequirement } = thresholdClaimFixture(2, {
      transactionHash: digest(`below-threshold-early-return-${state}`),
    });
    const record = fullRecord(attempt, {
      evidenceState: EVIDENCE_STATES.MOMENTUM_INCLUDED,
      momentumEvidence: includedEvidence({ numConfirmations: 1 }),
      deliveryState: state,
      cachedResponse: state === DELIVERY_STATES.DELIVERED
        ? { status: 200, headers: {}, body: { ok: true } }
        : null,
    });
    const key = recordKey(attempt.authorizationKey, attempt.transactionHash);
    await writeState(directory, {
      schemaVersion: 2,
      revision: 7,
      records: { [key]: record },
      tombstones: {},
    });
    assert.equal((await journal.load()).revision, 7);
    const before = await readFile(join(directory, 'settlement-journal.json'));

    await assert.rejects(journal.markDeliveryPending(
      attempt.authorizationKey,
      attempt.transactionHash,
      acceptedRequirement,
    ));

    assert.equal((await journal.load()).revision, 7);
    assert.equal((await readFile(join(directory, 'settlement-journal.json'))).equals(before), true);
  }
});

test('delivery claim rejects legacy, raw-count, malformed, accessor, proxy, and digest-mismatched inputs', async t => {
  {
    const { directory, journal } = await fixture(t);
    const { attempt } = thresholdClaimFixture(2, {
      transactionHash: digest('literal-two-argument-claim'),
    });
    await journal.putValidated(attempt);
    await journal.updateEvidence(
      attempt.authorizationKey,
      attempt.transactionHash,
      EVIDENCE_STATES.MOMENTUM_INCLUDED,
      includedEvidence({ numConfirmations: 2 }),
    );
    const before = await readFile(join(directory, 'settlement-journal.json'));
    const revision = (await journal.load()).revision;
    await assert.rejects(journal.markDeliveryPending(
      attempt.authorizationKey,
      attempt.transactionHash,
    ));
    assert.equal((await journal.load()).revision, revision);
    assert.equal((await readFile(join(directory, 'settlement-journal.json'))).equals(before), true);
  }

  const cases = [
    { name: 'missing', make: () => undefined },
    { name: 'raw-count', make: () => 2 },
    { name: 'count-container', make: () => ({ numConfirmations: 2 }) },
    {
      name: 'additional-field',
      make: accepted => ({ ...structuredClone(accepted), unexpected: true }),
    },
    {
      name: 'lower-threshold',
      make: accepted => {
        const value = structuredClone(accepted);
        delete value.extra.minimumMomentumConfirmations;
        return value;
      },
    },
    {
      name: 'different-threshold',
      make: accepted => ({
        ...structuredClone(accepted),
        extra: { ...structuredClone(accepted.extra), minimumMomentumConfirmations: 3 },
      }),
    },
    {
      name: 'accessor',
      make: (accepted, observation) => {
        const value = structuredClone(accepted);
        Object.defineProperty(value.extra, 'minimumMomentumConfirmations', {
          enumerable: true,
          get() {
            observation.reads += 1;
            return 2;
          },
        });
        return value;
      },
    },
    {
      name: 'stable-proxy',
      make: accepted => new Proxy(structuredClone(accepted), {}),
    },
    {
      name: 'stable-extra-proxy',
      make: accepted => {
        const value = structuredClone(accepted);
        value.extra = new Proxy(value.extra, {});
        return value;
      },
    },
    {
      name: 'stable-chain-profile-proxy',
      make: accepted => {
        const value = structuredClone(accepted);
        value.extra.zenonChain = new Proxy(value.extra.zenonChain, {});
        return value;
      },
    },
  ];

  for (const entry of cases) {
    const { directory, journal } = await fixture(t);
    const { attempt, acceptedRequirement } = thresholdClaimFixture(2, {
      transactionHash: digest(`invalid-claim-${entry.name}`),
    });
    await journal.putValidated(attempt);
    await journal.updateEvidence(
      attempt.authorizationKey,
      attempt.transactionHash,
      EVIDENCE_STATES.MOMENTUM_INCLUDED,
      includedEvidence({ numConfirmations: 2 }),
    );
    const observation = { reads: 0 };
    const candidate = entry.make(acceptedRequirement, observation);
    const before = await readFile(join(directory, 'settlement-journal.json'));
    const revision = (await journal.load()).revision;
    await assert.rejects(journal.markDeliveryPending(
      attempt.authorizationKey,
      attempt.transactionHash,
      candidate,
    ));
    assert.equal(observation.reads, 0);
    assert.equal((await journal.load()).revision, revision);
    assert.equal((await readFile(join(directory, 'settlement-journal.json'))).equals(before), true);
  }
});

test('delivery claim snapshots synchronously before its writer queue', async t => {
  const validContext = await fixture(t);
  const validFixture = thresholdClaimFixture(2, {
    transactionHash: digest('valid-before-queue'),
  });
  await validContext.journal.putValidated(validFixture.attempt);
  await validContext.journal.updateEvidence(
    validFixture.attempt.authorizationKey,
    validFixture.attempt.transactionHash,
    EVIDENCE_STATES.MOMENTUM_INCLUDED,
    includedEvidence({ numConfirmations: 2 }),
  );
  const validInput = structuredClone(validFixture.acceptedRequirement);
  const validCall = validContext.journal.markDeliveryPending(
    validFixture.attempt.authorizationKey,
    validFixture.attempt.transactionHash,
    validInput,
  );
  validInput.extra.minimumMomentumConfirmations = 30;
  const validClaim = await validCall;
  assert.equal(validClaim.deliveryClaimed, true);

  const invalidContext = await fixture(t);
  const invalidFixture = thresholdClaimFixture(2, {
    transactionHash: digest('invalid-before-queue'),
  });
  await invalidContext.journal.putValidated(invalidFixture.attempt);
  await invalidContext.journal.updateEvidence(
    invalidFixture.attempt.authorizationKey,
    invalidFixture.attempt.transactionHash,
    EVIDENCE_STATES.MOMENTUM_INCLUDED,
    includedEvidence({ numConfirmations: 2 }),
  );
  const invalidInput = structuredClone(invalidFixture.acceptedRequirement);
  invalidInput.amount = String(Number(invalidInput.amount) + 1);
  const before = await invalidContext.journal.load();
  const invalidCall = invalidContext.journal.markDeliveryPending(
    invalidFixture.attempt.authorizationKey,
    invalidFixture.attempt.transactionHash,
    invalidInput,
  );
  invalidInput.amount = invalidFixture.acceptedRequirement.amount;
  await assert.rejects(invalidCall);
  assert.equal((await invalidContext.journal.load()).revision, before.revision);
  assert.equal((await invalidContext.journal.get(
    invalidFixture.attempt.authorizationKey,
    invalidFixture.attempt.transactionHash,
  )).deliveryState, DELIVERY_STATES.NONE);
});

test('delivery claim intent reauthentication ignores mutable Array prototype methods',
  { concurrency: false, timeout: 30_000 }, async t => {
    const name = 'delivery claim intent reauthentication ignores mutable Array prototype methods';
    if (await isolatePrototypeSensitiveTest(
      name,
      'X402_JOURNAL_DELIVERY_INTENT_ARRAY_ISOLATED',
    )) return;

    const { directory, journal } = await fixture(t);
    const { attempt } = thresholdClaimFixture(30, {
      transactionHash: digest('array-prototype-delivery-intent'),
    });
    await journal.putValidated(attempt);
    await journal.updateEvidence(
      attempt.authorizationKey,
      attempt.transactionHash,
      EVIDENCE_STATES.MOMENTUM_INCLUDED,
      includedEvidence({ numConfirmations: 1 }),
    );
    const weakerRequirement = acceptedRequirementForAttempt(attempt);
    const beforeState = await journal.load();
    const beforeBytes = await readFile(join(directory, 'settlement-journal.json'));

    const prototype = Array.prototype;
    const names = ['map', 'sort', 'join'];
    const prior = new Map();
    for (let index = 0; index < names.length; index += 1) {
      prior.set(names[index], Object.getOwnPropertyDescriptor(prototype, names[index]));
    }
    let hookInvocations = 0;
    let rejectionCode = null;
    try {
      for (let index = 0; index < names.length; index += 1) {
        Object.defineProperty(prototype, names[index], {
          configurable: true,
          value() {
            hookInvocations += 1;
            throw new Error('mutable Array prototype method used');
          },
          writable: true,
        });
      }
      try {
        await journal.markDeliveryPending(
          attempt.authorizationKey,
          attempt.transactionHash,
          weakerRequirement,
        );
      } catch (error) {
        rejectionCode = error?.code ?? null;
      }
    } finally {
      for (let index = 0; index < names.length; index += 1) {
        restoreOwnProperty(prototype, names[index], prior.get(names[index]));
      }
    }

    assert.equal(hookInvocations, 0);
    assert.equal(rejectionCode, 'journal_delivery_claim_invalid');
    const afterState = await journal.load();
    assert.equal(afterState.revision, beforeState.revision);
    assert.equal(afterState.records[0].deliveryState, DELIVERY_STATES.NONE);
    assert.equal(afterState.records[0].momentumEvidence.confirmationDetail.numConfirmations, 1);
    assert.equal(
      (await readFile(join(directory, 'settlement-journal.json'))).equals(beforeBytes),
      true,
    );
  });

test('pending and delivered evidence permit only an exact confirmation duplicate', async t => {
  for (const state of [DELIVERY_STATES.DELIVERY_PENDING, DELIVERY_STATES.DELIVERED]) {
    const { directory, journal } = await fixture(t);
    const { attempt, acceptedRequirement } = thresholdClaimFixture(2, {
      transactionHash: digest(`immutable-evidence-${state}`),
    });
    const evidence = includedEvidence({ numConfirmations: 2 });
    await journal.putValidated(attempt);
    await journal.updateEvidence(
      attempt.authorizationKey,
      attempt.transactionHash,
      EVIDENCE_STATES.MOMENTUM_INCLUDED,
      evidence,
    );
    await journal.markDeliveryPending(
      attempt.authorizationKey,
      attempt.transactionHash,
      acceptedRequirement,
    );
    if (state === DELIVERY_STATES.DELIVERED) {
      await journal.markDelivered(
        attempt.authorizationKey,
        attempt.transactionHash,
        { status: 200, headers: {}, body: { ok: true } },
      );
    }
    const before = await readFile(join(directory, 'settlement-journal.json'));
    const revision = (await journal.load()).revision;
    await journal.updateEvidence(
      attempt.authorizationKey,
      attempt.transactionHash,
      EVIDENCE_STATES.MOMENTUM_INCLUDED,
      structuredClone(evidence),
    );
    assert.equal((await journal.load()).revision, revision);
    assert.equal((await readFile(join(directory, 'settlement-journal.json'))).equals(before), true);
    await assert.rejects(journal.updateEvidence(
      attempt.authorizationKey,
      attempt.transactionHash,
      EVIDENCE_STATES.MOMENTUM_INCLUDED,
      {
        observedAt: evidence.observedAt,
        confirmationDetail: {
          ...evidence.confirmationDetail,
          numConfirmations: evidence.confirmationDetail.numConfirmations + 1,
        },
      },
    ));
    assert.equal((await journal.load()).revision, revision);
    assert.equal((await readFile(join(directory, 'settlement-journal.json'))).equals(before), true);
  }
});

test('malformed journal JSON exposes only the fixed corruption error', async t => {
  const { directory, journal } = await fixture(t);
  await journal.load();
  await writeFile(join(directory, 'settlement-journal.json'), '{', 'utf8');
  await assert.rejects(
    journal.load(),
    error => error?.code === 'journal_corrupt' && error?.cause === undefined &&
      error?.stack === 'SettlementJournalError: journal_corrupt',
  );
});

test('late tombstone evidence stays monotonic across rollback and strict reload', async t => {
  const current = { value: '2026-01-01T00:00:00.000Z' };
  const { root, directory, journal } = await fixture(t, { clock: () => current.value });
  const attempt = validatedAttempt();
  await journal.putValidated(attempt);
  const record = await journal.getEntrySnapshot(attempt.authorizationKey, attempt.transactionHash);
  current.value = '2026-01-01T01:00:00.000Z';
  const tombstone = await journal.replaceRecordWithTombstone({
    expectedRevision: record.revision,
    expectedRecord: record.entry,
    retentionMs: MINIMUM_RETENTION_MS,
  });
  const tombstoneSnapshot = await journal.getEntrySnapshot(attempt.authorizationKey, attempt.transactionHash);
  current.value = '2026-01-01T00:30:00.000Z';
  const recorded = await journal.recordLateMomentumEvidence({
    expectedRevision: tombstoneSnapshot.revision,
    expectedTombstone: tombstone,
    confirmationDetail: includedEvidence().confirmationDetail,
  });
  assert.equal(recorded.tombstone.lateMomentumEvidence.observedAt, tombstone.terminalizedAt);

  const tampered = await readState(directory);
  const key = recordKey(tombstone.authorizationKey, tombstone.transactionHash);
  tampered.tombstones[key].lateMomentumEvidence.observedAt = '2026-01-01T00:59:59.999Z';
  await writeState(directory, tampered);
  await assert.rejects(
    new SettlementJournal({ directory, allowedRoot: root }).load(),
    error => error?.code === 'journal_corrupt',
  );
});

test('validated attempt fsync path persists the exact signed block before publication', async t => {
  const { directory, journal } = await fixture(t);
  const attempt = validatedAttempt();
  const stored = await journal.putValidated(attempt);
  assert.deepEqual(stored.signedAccountBlock, attempt.signedAccountBlock);
  assert.equal(stored.evidenceState, EVIDENCE_STATES.VALIDATED);

  const onDisk = JSON.parse(await readFile(join(directory, 'settlement-journal.json'), 'utf8'));
  const [persisted] = Object.values(onDisk.records);
  assert.deepEqual(persisted.signedAccountBlock, attempt.signedAccountBlock);
  assert.equal(persisted.transactionHash, attempt.transactionHash);
});

test('journal reload returns the exact immutable authorization identity', async t => {
  const { root, directory, journal } = await fixture(t);
  const attempt = validatedAttempt();
  await journal.putValidated(attempt);

  const reloaded = new SettlementJournal({ directory, allowedRoot: root });
  const record = await reloaded.get(attempt.authorizationKey, attempt.transactionHash);
  for (const [key, value] of Object.entries(attempt)) assert.deepEqual(record[key], value);
  assert.equal((await reloaded.load()).records.length, 1);
});

test('journal preserves legacy optionality and ResourceInfo service metadata exactly', async t => {
  const { root, directory, journal } = await fixture(t);
  const url = 'http://example.test/paid';
  const resources = [
    { url },
    { url, description: 'description only' },
    { url, mimeType: 'application/json' },
    { url, description: '', mimeType: '', serviceName: 'A', tags: [] },
    { url, serviceName: 'S'.repeat(32), tags: ['alpha'] },
    { url, serviceName: 'Service', tags: ['alpha', 'alpha', 'beta', 'alpha', 'beta'] },
    { url, iconUrl: 'HTTPS://icons.example:443/a%2Fb.png?size=2#mark' },
    {
      url,
      description: '',
      mimeType: '',
      serviceName: 'Service',
      tags: ['alpha', 'alpha', 'beta'],
      iconUrl: 'http://[2001:db8::1]/icon.png',
    },
  ];
  const attempts = resources.map((resourceIdentity, index) => validatedAttempt({
    transactionHash: String(index + 1).repeat(64),
    resourceIdentity,
  }));

  for (const attempt of attempts) await journal.putValidated(attempt);

  const reloaded = new SettlementJournal({ directory, allowedRoot: root });
  const records = await reloaded.list();
  assert.equal(records.length, attempts.length);
  for (const attempt of attempts) {
    const record = await reloaded.get(attempt.authorizationKey, attempt.transactionHash);
    assert.deepEqual(record.resourceIdentity, attempt.resourceIdentity);
    assert.equal(record.resourceDigest, attempt.resourceDigest);
  }

  const onDisk = JSON.parse(await readFile(join(directory, 'settlement-journal.json'), 'utf8'));
  assert.equal(onDisk.schemaVersion, 1);
});

test('journal integrity rejects ResourceInfo metadata tampering after reload', async t => {
  const url = 'http://example.test/paid';
  const complete = () => ({
    url,
    serviceName: 'Service',
    tags: ['alpha', 'alpha', 'beta'],
    iconUrl: 'HTTPS://icons.example:443/a%2Fb.png?size=2#mark',
  });
  const cases = [
    {
      resourceIdentity: complete(),
      mutate(resource) { delete resource.iconUrl; },
    },
    {
      resourceIdentity: complete(),
      mutate(resource) { resource.iconUrl = 'https://icons.example/other.png'; },
    },
    {
      resourceIdentity: complete(),
      mutate(resource) { delete resource.serviceName; },
    },
    {
      resourceIdentity: complete(),
      mutate(resource) { resource.serviceName = 'Other service'; },
    },
    {
      resourceIdentity: complete(),
      mutate(resource) { delete resource.tags; },
    },
    {
      resourceIdentity: { url, serviceName: 'Service', tags: [] },
      mutate(resource) { delete resource.tags; },
    },
    {
      resourceIdentity: { url, serviceName: 'Service' },
      mutate(resource) { resource.tags = []; },
    },
    {
      resourceIdentity: complete(),
      mutate(resource) { resource.tags = ['beta', 'alpha', 'alpha']; },
    },
    {
      resourceIdentity: complete(),
      mutate(resource) { resource.tags.push('gamma'); },
    },
    {
      resourceIdentity: complete(),
      mutate(resource) { resource.tags.pop(); },
    },
    {
      resourceIdentity: complete(),
      mutate(resource) { resource.tags = ['alpha', 'beta', 'beta']; },
    },
  ];

  for (const entry of cases) {
    const { root, directory, journal } = await fixture(t);
    const attempt = validatedAttempt({ resourceIdentity: entry.resourceIdentity });
    await journal.putValidated(attempt);

    const filePath = join(directory, 'settlement-journal.json');
    const onDisk = JSON.parse(await readFile(filePath, 'utf8'));
    const [record] = Object.values(onDisk.records);
    const boundResourceDigest = record.resourceDigest;
    entry.mutate(record.resourceIdentity);
    assert.doesNotThrow(() => validateResource(record.resourceIdentity));
    assert.equal(record.resourceDigest, boundResourceDigest);
    onDisk.checksum = digest({
      schemaVersion: onDisk.schemaVersion,
      revision: onDisk.revision,
      records: onDisk.records,
    });
    await writeFile(filePath, JSON.stringify(onDisk), 'utf8');

    const reloaded = new SettlementJournal({ directory, allowedRoot: root });
    await assert.rejects(reloaded.load(), error => error?.code === 'journal_corrupt');
  }
});

test('initialized journal fails closed when its state file disappears', async t => {
  const { root, directory, journal } = await fixture(t);
  await journal.putValidated(validatedAttempt());
  await unlink(join(directory, 'settlement-journal.json'));

  const reloaded = new SettlementJournal({ directory, allowedRoot: root });
  await assert.rejects(reloaded.load(), error => error?.code === 'journal_state_missing');
});

test('a valid pre-marker journal is adopted without discarding its state', async t => {
  const { root, directory, journal } = await fixture(t);
  const attempt = validatedAttempt();
  await journal.putValidated(attempt);
  await unlink(join(directory, '.settlement-journal.initialized'));

  const reloaded = new SettlementJournal({ directory, allowedRoot: root });
  const record = await reloaded.get(attempt.authorizationKey, attempt.transactionHash);
  assert.equal(record.transactionHash, attempt.transactionHash);
  await readFile(join(directory, '.settlement-journal.initialized'));
});

test('a malformed initialization marker fails closed', async t => {
  const { root, directory, journal } = await fixture(t);
  await journal.putValidated(validatedAttempt());
  await writeFile(join(directory, '.settlement-journal.initialized'), 'unexpected', 'utf8');

  const reloaded = new SettlementJournal({ directory, allowedRoot: root });
  await assert.rejects(reloaded.load(), error => error?.code === 'journal_marker_corrupt');
});

test('malformed or corrupt journal state fails closed', async t => {
  const { directory, journal } = await fixture(t);
  await journal.putValidated(validatedAttempt());
  await writeFile(join(directory, 'settlement-journal.json'), '{"schemaVersion":1,"records":', 'utf8');
  await assert.rejects(journal.load(), error => error?.code === 'journal_corrupt');
});

test('ambiguous publication evidence survives reload', async t => {
  const { root, directory, journal } = await fixture(t);
  const attempt = validatedAttempt();
  await journal.putValidated(attempt);
  await journal.updateEvidence(
    attempt.authorizationKey,
    attempt.transactionHash,
    EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
  );

  const reloaded = new SettlementJournal({ directory, allowedRoot: root });
  const record = await reloaded.get(attempt.authorizationKey, attempt.transactionHash);
  assert.equal(record.evidenceState, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
  assert.equal(record.deliveryState, DELIVERY_STATES.NONE);
});

test('Momentum inclusion and delivered cached response survive reload without downgrade', async t => {
  const { root, directory, journal } = await fixture(t);
  const attempt = validatedAttempt();
  const momentumEvidence = {
    observedAt: '2026-01-01T00:00:00.000Z',
    confirmationDetail: {
      numConfirmations: 1,
      momentumHeight: 42,
      momentumHash: 'a'.repeat(64),
      momentumTimestamp: 1_700_000_000,
    },
  };
  const cachedResponse = { status: 200, headers: { 'content-type': 'application/json' }, body: { data: 'paid' } };
  await journal.putValidated(attempt);
  await journal.updateEvidence(attempt.authorizationKey, attempt.transactionHash, EVIDENCE_STATES.MOMENTUM_INCLUDED, momentumEvidence);
  await journal.updateEvidence(attempt.authorizationKey, attempt.transactionHash, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
  const claim = await journal.markDeliveryPending(
    attempt.authorizationKey,
    attempt.transactionHash,
    acceptedRequirementForAttempt(attempt),
  );
  assert.equal(claim.deliveryClaimed, true);
  const duplicateClaim = await journal.markDeliveryPending(
    attempt.authorizationKey,
    attempt.transactionHash,
    acceptedRequirementForAttempt(attempt),
  );
  assert.equal(duplicateClaim.deliveryClaimed, false);
  await journal.markDelivered(attempt.authorizationKey, attempt.transactionHash, cachedResponse);

  const reloaded = new SettlementJournal({ directory, allowedRoot: root });
  const record = await reloaded.get(attempt.authorizationKey, attempt.transactionHash);
  assert.equal(record.evidenceState, EVIDENCE_STATES.MOMENTUM_INCLUDED);
  assert.equal(record.deliveryState, DELIVERY_STATES.DELIVERED);
  assert.deepEqual(record.momentumEvidence, momentumEvidence);
  assert.deepEqual(record.cachedResponse, cachedResponse);
});

test('cached response arrays use encoded bytes and a separate element-count bound', async t => {
  const { root, directory, journal } = await fixture(t);
  const cachedResponseLimit = 64 * 1024;

  async function pendingAttempt(transactionHash) {
    const attempt = validatedAttempt({ transactionHash });
    await journal.putValidated(attempt);
    await journal.updateEvidence(
      attempt.authorizationKey,
      attempt.transactionHash,
      EVIDENCE_STATES.MOMENTUM_INCLUDED,
      includedEvidence(),
    );
    await journal.markDeliveryPending(
      attempt.authorizationKey,
      attempt.transactionHash,
      acceptedRequirementForAttempt(attempt),
    );
    return attempt;
  }

  const acceptedAttempt = await pendingAttempt('4'.repeat(64));
  const accepted = Array.from({ length: 32_760 }, () => 0);
  const acceptedBytes = Buffer.from(JSON.stringify(accepted));
  assert.equal(acceptedBytes.length < cachedResponseLimit, true);
  assert.equal(acceptedBytes.length > cachedResponseLimit - 32, true);
  const delivered = await journal.markDelivered(
    acceptedAttempt.authorizationKey,
    acceptedAttempt.transactionHash,
    accepted,
  );
  assert.equal(Buffer.from(JSON.stringify(delivered.cachedResponse)).equals(acceptedBytes), true);
  const reloaded = await new SettlementJournal({ directory, allowedRoot: root }).get(
    acceptedAttempt.authorizationKey,
    acceptedAttempt.transactionHash,
  );
  assert.equal(Buffer.from(JSON.stringify(reloaded.cachedResponse)).equals(acceptedBytes), true);

  const encodedAttempt = await pendingAttempt('5'.repeat(64));
  const encodedOverflow = Array.from({ length: 32_768 }, () => 0);
  assert.equal(Buffer.byteLength(JSON.stringify(encodedOverflow)) > cachedResponseLimit, true);
  const encodedRevision = (await journal.load()).revision;
  await assert.rejects(
    journal.markDelivered(
      encodedAttempt.authorizationKey,
      encodedAttempt.transactionHash,
      encodedOverflow,
    ),
    error => error?.code === 'journal_record_too_large',
  );
  assert.equal((await journal.load()).revision, encodedRevision);
  assert.equal((await journal.get(
    encodedAttempt.authorizationKey,
    encodedAttempt.transactionHash,
  )).deliveryState, DELIVERY_STATES.DELIVERY_PENDING);

  const elementAttempt = await pendingAttempt('6'.repeat(64));
  const elementOverflow = Array.from({ length: cachedResponseLimit + 1 }, () => 0);
  const elementRevision = (await journal.load()).revision;
  await assert.rejects(
    journal.markDelivered(
      elementAttempt.authorizationKey,
      elementAttempt.transactionHash,
      elementOverflow,
    ),
    error => error?.code === 'journal_record_too_large',
  );
  assert.equal((await journal.load()).revision, elementRevision);
  assert.equal((await journal.get(
    elementAttempt.authorizationKey,
    elementAttempt.transactionHash,
  )).deliveryState, DELIVERY_STATES.DELIVERY_PENDING);
});

test('Momentum inclusion evidence rejects missing, extra, and malformed confirmation fields', async t => {
  const { journal } = await fixture(t);
  const attempt = validatedAttempt();
  await journal.putValidated(attempt);

  const validDetail = {
    numConfirmations: 1,
    momentumHeight: 42,
    momentumHash: 'a'.repeat(64),
    momentumTimestamp: 1_700_000_000,
  };
  const invalidDetails = [
    { numConfirmations: 1, momentumHeight: 42, momentumHash: 'a'.repeat(64) },
    { ...validDetail, unexpected: true },
    { ...validDetail, numConfirmations: 0 },
    { ...validDetail, numConfirmations: 1.5 },
    { ...validDetail, momentumHeight: 0 },
    { ...validDetail, momentumHeight: Number.MAX_SAFE_INTEGER + 1 },
    { ...validDetail, momentumHash: 'A'.repeat(64) },
    { ...validDetail, momentumHash: 'a'.repeat(63) },
    { ...validDetail, momentumTimestamp: -1 },
    { ...validDetail, momentumTimestamp: 1.5 },
  ];

  for (const confirmationDetail of invalidDetails) {
    await assert.rejects(
      journal.updateEvidence(
        attempt.authorizationKey,
        attempt.transactionHash,
        EVIDENCE_STATES.MOMENTUM_INCLUDED,
        { observedAt: '2026-01-01T00:00:00.000Z', confirmationDetail },
      ),
      error => error?.code === 'journal_momentum_evidence_invalid',
    );
  }

  const record = await journal.get(attempt.authorizationKey, attempt.transactionHash);
  assert.equal(record.evidenceState, EVIDENCE_STATES.VALIDATED);
  assert.equal(record.momentumEvidence, null);
});

test('journal update timestamps remain valid when the wall clock moves backwards', async t => {
  const times = [
    '2026-02-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z',
    '2025-12-01T00:00:00.000Z',
  ];
  const { journal } = await fixture(t, { clock: () => times.shift() });
  const attempt = validatedAttempt();
  const stored = await journal.putValidated(attempt);
  const included = await journal.updateEvidence(
    attempt.authorizationKey,
    attempt.transactionHash,
    EVIDENCE_STATES.MOMENTUM_INCLUDED,
    {
      observedAt: '2026-02-01T00:00:00.000Z',
      confirmationDetail: {
        numConfirmations: 1,
        momentumHeight: 42,
        momentumHash: 'a'.repeat(64),
        momentumTimestamp: 1_700_000_000,
      },
    },
  );
  const pending = await journal.markDeliveryPending(
    attempt.authorizationKey,
    attempt.transactionHash,
    acceptedRequirementForAttempt(attempt),
  );

  assert.equal(included.updatedAt, stored.updatedAt);
  assert.equal(pending.updatedAt, stored.updatedAt);
  assert.equal((await journal.load()).records[0].deliveryState, DELIVERY_STATES.DELIVERY_PENDING);
});

test('transaction hash cannot be rebound to another authorization or resource', async t => {
  const { journal } = await fixture(t);
  const attempt = validatedAttempt();
  await journal.putValidated(attempt);
  const otherResource = { ...attempt.resourceIdentity, url: 'http://example.test/other' };
  const conflicting = validatedAttempt({
    transactionHash: attempt.transactionHash,
    resourceIdentity: otherResource,
  });
  await assert.rejects(journal.putValidated(conflicting), error => error?.code === 'journal_identity_conflict');
});

test('bounded retention fails closed instead of dropping uncertain state', async t => {
  const { journal } = await fixture(t, { maxRecords: 1 });
  const first = validatedAttempt();
  await journal.putValidated(first);
  await journal.updateEvidence(first.authorizationKey, first.transactionHash, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
  const second = validatedAttempt({ transactionHash: '8'.repeat(64) });
  await assert.rejects(journal.putValidated(second), error => error?.code === 'journal_capacity_exceeded');
  assert.equal((await journal.load()).records[0].evidenceState, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
});

test('two journal instances serialize writes to the same file', async t => {
  const { root, directory, journal } = await fixture(t);
  const secondWriter = new SettlementJournal({ directory, allowedRoot: root });
  const first = validatedAttempt();
  const second = validatedAttempt({ transactionHash: '8'.repeat(64) });
  await Promise.all([journal.putValidated(first), secondWriter.putValidated(second)]);
  const records = await journal.list();
  assert.equal(records.length, 2);
  assert.deepEqual(new Set(records.map(record => record.transactionHash)), new Set([first.transactionHash, second.transactionHash]));
});

test('journal schema forbids secret-bearing extra fields', async t => {
  const { journal } = await fixture(t);
  const attempt = { ...validatedAttempt(), mnemonic: 'must never be persisted' };
  await assert.rejects(journal.putValidated(attempt), error =>
    error?.code === 'journal_secret_field_forbidden' || error?.code === 'journal_record_invalid');
});

test('v1 remains byte-compatible until one atomic tombstone conversion upgrades it to v2', async t => {
  const current = { value: '2026-01-01T00:00:00.000Z' };
  const { directory, journal } = await fixture(t, { clock: () => current.value });
  const attempt = validatedAttempt();
  const empty = await journal.load();
  assert.equal(empty.schemaVersion, 1);
  const emptyDisk = await readState(directory);
  safelyEqual(Object.keys(emptyDisk).sort(), ['checksum', 'records', 'revision', 'schemaVersion']);
  assert.equal(emptyDisk.checksum === checksumForState(emptyDisk), true);
  await journal.putValidated(attempt);

  const initialText = await readFile(join(directory, 'settlement-journal.json'), 'utf8');
  const initial = JSON.parse(initialText);
  safelyEqual(Object.keys(initial).sort(), ['checksum', 'records', 'revision', 'schemaVersion']);
  assert.equal(initial.schemaVersion, 1);
  assert.equal(initial.checksum === checksumForState(initial), true);
  await journal.load();
  assert.equal((await readFile(join(directory, 'settlement-journal.json'), 'utf8')) === initialText, true);

  await journal.updateEvidence(
    attempt.authorizationKey,
    attempt.transactionHash,
    EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
  );
  const ordinaryUpdate = await readState(directory);
  assert.equal(ordinaryUpdate.schemaVersion, 1);
  assert.equal(Object.hasOwn(ordinaryUpdate, 'tombstones'), false);
  assert.equal(ordinaryUpdate.checksum === checksumForState(ordinaryUpdate), true);

  const snapshot = await journal.load();
  current.value = '2026-01-01T01:00:00.000Z';
  const tombstone = await journal.replaceRecordWithTombstone({
    expectedRevision: snapshot.revision,
    expectedRecord: snapshot.records[0],
    retentionMs: MINIMUM_RETENTION_MS,
  });

  const upgraded = await readState(directory);
  safelyEqual(Object.keys(upgraded).sort(), ['checksum', 'records', 'revision', 'schemaVersion', 'tombstones']);
  assert.equal(upgraded.schemaVersion, 2);
  assert.equal(upgraded.revision, snapshot.revision + 1);
  assert.equal(upgraded.checksum === checksumForState(upgraded), true);
  assert.equal(Object.keys(upgraded.records).length, 0);
  assert.equal(Object.keys(upgraded.tombstones).length, 1);
  safelyEqual(Object.keys(tombstone).sort(), [...TOMBSTONE_FIELDS].sort());
  assert.equal(tombstone.signedAccountBlockDigest === digest({
    domain: 'zenon-x402-signed-account-block-v1',
    signedAccountBlock: attempt.signedAccountBlock,
  }), true);
  for (const omitted of ['signedAccountBlock', 'resourceIdentity', 'cachedResponse', 'momentumEvidence', 'privateCause']) {
    assert.equal(Object.hasOwn(tombstone, omitted), false);
  }

  const projected = await journal.load();
  safelyEqual(Object.keys(projected).sort(), ['records', 'revision', 'schemaVersion']);
  assert.equal(projected.schemaVersion, 2);
  assert.equal(projected.records.length, 0);
  assert.equal(await journal.get(attempt.authorizationKey, attempt.transactionHash), null);
  assert.equal(await journal.findByTransactionHash(attempt.transactionHash), null);
  safelyEqual(await journal.getTombstone(attempt.authorizationKey, attempt.transactionHash), tombstone);
  safelyEqual(await journal.findTombstoneByTransactionHash(attempt.transactionHash), tombstone);

  safelyEqual(await journal.list(), []);
  const listed = await journal.list({ includeTombstones: true });
  safelyEqual(listed, { records: [], tombstones: [tombstone] });
  listed.tombstones[0].payer = 'detached mutation';
  listed.tombstones.length = 0;
  safelyEqual(await journal.list({ includeTombstones: true }), { records: [], tombstones: [tombstone] });
  for (const options of [null, {}, { includeTombstones: false }, { includeTombstones: true, extra: true }]) {
    await assert.rejects(journal.list(options), error => error?.code === 'journal_options_invalid');
  }
});

test('all eligible prior evidence states convert while ineligible states remain active', async t => {
  for (const [index, priorEvidenceState] of [
    EVIDENCE_STATES.VALIDATED,
    EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
  ].entries()) {
    const current = { value: '2026-01-01T01:00:00.000Z' };
    const { root, directory } = await fixture(t);
    const attempt = validatedAttempt({ transactionHash: String(index + 1).repeat(64) });
    const record = fullRecord(attempt, { evidenceState: priorEvidenceState });
    await writeState(directory, { schemaVersion: 1, revision: 1, records: {
      [recordKey(attempt.authorizationKey, attempt.transactionHash)]: record,
    } });
    const journal = new SettlementJournal({ directory, allowedRoot: root, clock: () => current.value });
    const snapshot = await journal.load();
    const tombstone = await journal.replaceRecordWithTombstone({
      expectedRevision: snapshot.revision,
      expectedRecord: snapshot.records[0],
      retentionMs: MINIMUM_RETENTION_MS,
    });
    assert.equal(tombstone.priorEvidenceState, priorEvidenceState);
  }

  const current = { value: '2026-01-01T01:00:00.000Z' };
  const { journal } = await fixture(t, { clock: () => current.value });
  const attempt = validatedAttempt({ transactionHash: 'b'.repeat(64) });
  await journal.putValidated(attempt);
  const tooYoung = await journal.load();
  current.value = '2026-01-01T00:30:00.000Z';
  await assert.rejects(
    journal.replaceRecordWithTombstone({
      expectedRevision: tooYoung.revision,
      expectedRecord: tooYoung.records[0],
      retentionMs: MINIMUM_RETENTION_MS,
    }),
    error => error?.code === 'journal_compare_and_replace_failed',
  );
  current.value = '2026-01-01T01:30:00.000Z';
  await assert.rejects(
    journal.replaceRecordWithTombstone({
      expectedRevision: tooYoung.revision,
      expectedRecord: tooYoung.records[0],
      retentionMs: MINIMUM_RETENTION_MS,
    }),
    error => error?.code === 'journal_compare_and_replace_failed',
  );
  for (const retentionMs of [MINIMUM_RETENTION_MS - 1, 2_592_000_001, 1.5]) {
    await assert.rejects(
      journal.replaceRecordWithTombstone({
        expectedRevision: tooYoung.revision,
        expectedRecord: tooYoung.records[0],
        retentionMs,
      }),
      error => error?.code === 'journal_compare_and_replace_failed',
    );
  }
  assert.equal((await journal.list()).length, 1);
});

test('v2 reload rejects structural, binding, checksum, and cross-map tampering', async t => {
  const current = { value: '2026-01-01T00:00:00.000Z' };
  const { root, directory, journal } = await fixture(t, { clock: () => current.value });
  const attempt = validatedAttempt();
  await journal.putValidated(attempt);
  const snapshot = await journal.load();
  current.value = '2026-01-01T01:00:00.000Z';
  await journal.replaceRecordWithTombstone({
    expectedRevision: snapshot.revision,
    expectedRecord: snapshot.records[0],
    retentionMs: MINIMUM_RETENTION_MS,
  });
  const baseline = await readState(directory);
  const key = Object.keys(baseline.tombstones)[0];

  const mutations = [
    state => { state.checksum = '0'.repeat(64); return state; },
    state => { state.extra = true; return withChecksum(state); },
    state => { delete state.tombstones; return state; },
    state => { state.tombstones[key].secret = 'forbidden'; return withChecksum(state); },
    state => { delete state.tombstones[key].payer; return withChecksum(state); },
    state => {
      state.tombstones[`0:${state.tombstones[key].transactionHash}`] = state.tombstones[key];
      delete state.tombstones[key];
      return withChecksum(state);
    },
    state => { state.tombstones[key].resourceDigest = 'e'.repeat(64); return withChecksum(state); },
    state => { state.tombstones[key].signedAccountBlockDigest = 'e'.repeat(64); return state; },
    state => { state.tombstones[key].signedAccountBlockDigest = 'invalid'; return withChecksum(state); },
    state => { state.tombstones[key].terminalizedAt = '2025-12-31T23:59:59.999Z'; return withChecksum(state); },
    state => { state.tombstones[key].priorEvidenceState = EVIDENCE_STATES.MOMENTUM_INCLUDED; return withChecksum(state); },
    state => { state.tombstones[key].lateMomentumEvidence = { malformed: true }; return withChecksum(state); },
    state => {
      state.records[key] = fullRecord(attempt);
      return withChecksum(state);
    },
    state => {
      const conflictingAttempt = validatedAttempt({
        transactionHash: attempt.transactionHash,
        resourceIdentity: { ...attempt.resourceIdentity, description: 'conflicting resource' },
      });
      const conflictingRecord = fullRecord(conflictingAttempt);
      state.records[recordKey(conflictingRecord.authorizationKey, conflictingRecord.transactionHash)] = conflictingRecord;
      return withChecksum(state);
    },
  ];

  for (const mutate of mutations) {
    const changed = mutate(structuredClone(baseline));
    await writeFile(join(directory, 'settlement-journal.json'), `${JSON.stringify(changed, null, 2)}\n`, 'utf8');
    const reloaded = new SettlementJournal({ directory, allowedRoot: root });
    await assert.rejects(reloaded.load(), error => error?.code === 'journal_corrupt');
  }
  await writeFile(join(directory, 'settlement-journal.json'), `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  assert.equal((await new SettlementJournal({ directory, allowedRoot: root }).list({ includeTombstones: true })).tombstones.length, 1);
});

test('fixed tombstone capacity is independent from active capacity and preserves full records on overflow', async t => {
  const { root, directory } = await fixture(t);
  const tombstones = {};
  let firstAttempt;
  for (let index = 1; index <= 4096; index += 1) {
    const transactionHash = index.toString(16).padStart(64, '0');
    const attempt = validatedAttempt({ transactionHash });
    if (index === 1) firstAttempt = attempt;
    const tombstone = tombstoneFor(attempt);
    tombstones[recordKey(tombstone.authorizationKey, tombstone.transactionHash)] = tombstone;
  }
  await writeState(directory, { schemaVersion: 2, revision: 1, records: {}, tombstones });

  const current = { value: '2026-01-02T00:00:00.000Z' };
  const journal = new SettlementJournal({
    directory,
    allowedRoot: root,
    maxRecords: 1,
    clock: () => current.value,
  });
  assert.equal((await journal.list({ includeTombstones: true })).tombstones.length, 4096);
  const activeAttempt = validatedAttempt({ transactionHash: 'f'.repeat(64) });
  await journal.putValidated(activeAttempt);
  assert.equal((await journal.list()).length, 1);
  await assert.rejects(
    journal.putValidated(validatedAttempt({ transactionHash: 'e'.repeat(64) })),
    error => error?.code === 'journal_capacity_exceeded',
  );
  await assert.rejects(journal.putValidated(firstAttempt), error => error?.code === 'journal_identity_conflict');

  const snapshot = await journal.load();
  const before = await readFile(join(directory, 'settlement-journal.json'), 'utf8');
  current.value = '2026-01-02T01:00:00.000Z';
  await assert.rejects(
    journal.replaceRecordWithTombstone({
      expectedRevision: snapshot.revision,
      expectedRecord: snapshot.records[0],
      retentionMs: MINIMUM_RETENTION_MS,
    }),
    error => error?.code === 'journal_capacity_exceeded',
  );
  assert.equal((await readFile(join(directory, 'settlement-journal.json'), 'utf8')) === before, true);
  assert.equal((await journal.list()).length, 1);

  const overLimit = await readState(directory);
  const extraAttempt = validatedAttempt({ transactionHash: 'd'.repeat(64) });
  const extra = tombstoneFor(extraAttempt);
  overLimit.tombstones[recordKey(extra.authorizationKey, extra.transactionHash)] = extra;
  await writeState(directory, overLimit);
  await assert.rejects(
    new SettlementJournal({ directory, allowedRoot: root }).load(),
    error => error?.code === 'journal_corrupt',
  );
});

test('file-size failures leave the original v1 journal byte-for-byte reloadable', async t => {
  const current = { value: '2026-01-01T00:00:00.000Z' };
  let restrictWrite = false;
  let journal;
  const { root, directory } = await fixture(t);
  journal = new SettlementJournal({
    directory,
    allowedRoot: root,
    clock: () => {
      if (restrictWrite) journal.maxFileBytes = 1024;
      return current.value;
    },
  });
  const attempt = validatedAttempt();
  await journal.putValidated(attempt);
  const snapshot = await journal.load();
  const before = await readFile(join(directory, 'settlement-journal.json'), 'utf8');
  current.value = '2026-01-01T01:00:00.000Z';
  restrictWrite = true;
  await assert.rejects(
    journal.replaceRecordWithTombstone({
      expectedRevision: snapshot.revision,
      expectedRecord: snapshot.records[0],
      retentionMs: MINIMUM_RETENTION_MS,
    }),
    error => error?.code === 'journal_capacity_exceeded' && error?.cause === undefined &&
      error?.stack === 'SettlementJournalError: journal_capacity_exceeded',
  );
  assert.equal((await readFile(join(directory, 'settlement-journal.json'), 'utf8')) === before, true);
  const reloaded = new SettlementJournal({ directory, allowedRoot: root });
  const state = await reloaded.load();
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.revision, snapshot.revision);
  assert.equal(state.records.length, 1);
});

test('write cleanup preserves collision ownership and primary failure precedence',
  { concurrency: false, timeout: 30_000 }, async t => {
    const name = 'write cleanup preserves collision ownership and primary failure precedence';
    if (!supportsExperimentalModuleMocks()) {
      t.skip('test module mocking is unavailable');
      return;
    }
    if (await isolatePrototypeSensitiveTest(
      name,
      'X402_JOURNAL_WRITE_FAULTS_ISOLATED',
      ['--no-warnings', '--experimental-test-module-mocks'],
    )) return;

    let mode = 'none';
    let temporaryPath;
    const occupiedBytes = Buffer.from('occupied');
    const mockedOpen = async (path, flags, ...options) => {
      const temporary = flags === 'wx' && String(path).endsWith('.tmp');
      if (!temporary) return fsPromises.open(path, flags, ...options);
      temporaryPath = path;
      if (mode === 'collision') {
        await fsPromises.writeFile(path, occupiedBytes, { flag: 'wx' });
        const error = new Error('exclusive create collision');
        error.code = 'EEXIST';
        throw error;
      }
      const handle = await fsPromises.open(path, flags, ...options);
      if (mode !== 'write' && mode !== 'write-and-cleanup') return handle;
      return {
        async close() { return handle.close(); },
        async sync() { return handle.sync(); },
        async writeFile() { throw new Error('injected write failure'); },
      };
    };
    const mockedUnlink = async path => {
      if (mode === 'write-and-cleanup' && path === temporaryPath) {
        const error = new Error('injected cleanup failure');
        error.code = 'EACCES';
        throw error;
      }
      return fsPromises.unlink(path);
    };
    const moduleMock = mock.module('node:fs/promises', {
      exports: { ...fsPromises, open: mockedOpen, unlink: mockedUnlink },
    });
    try {
      const { SettlementJournal: FaultJournal } = await import(
        '../src/settlement-journal.js?journal-write-faults=1'
      );
      const root = await mkdtemp(join(tmpdir(), 'journal-write-faults-'));
      t.after(() => rm(root, { recursive: true, force: true }));

      async function initializedJournal(label) {
        mode = 'none';
        const directory = join(root, label);
        const journal = new FaultJournal({ directory, allowedRoot: root });
        await journal.load();
        return {
          before: await fsPromises.readFile(join(directory, 'settlement-journal.json')),
          directory,
          journal,
        };
      }

      async function assertOriginalState(context) {
        assert.equal(
          (await fsPromises.readFile(join(context.directory, 'settlement-journal.json')))
            .equals(context.before),
          true,
        );
        const reloaded = await new FaultJournal({
          directory: context.directory,
          allowedRoot: root,
        }).load();
        assert.equal(reloaded.revision, 0);
        assert.equal(reloaded.records.length, 0);
      }

      async function removeResidue(path) {
        try {
          await fsPromises.unlink(path);
        } catch (error) {
          if (error?.code !== 'ENOENT') isolatedTestFailure('isolated_residue_cleanup_failed');
        }
      }

      const collision = await initializedJournal('collision');
      temporaryPath = undefined;
      try {
        mode = 'collision';
        await assert.rejects(
          collision.journal.putValidated(validatedAttempt()),
          error => error?.code === 'journal_write_failed' && error?.cause === undefined &&
            error?.stack === 'SettlementJournalError: journal_write_failed',
        );
        assert.equal((await fsPromises.readFile(temporaryPath)).equals(occupiedBytes), true);
        await assertOriginalState(collision);
      } finally {
        await removeResidue(temporaryPath);
      }

      const cleanup = await initializedJournal('cleanup');
      temporaryPath = undefined;
      mode = 'write';
      await assert.rejects(
        cleanup.journal.putValidated(validatedAttempt()),
        error => error?.code === 'journal_write_failed' && error?.cause === undefined &&
          error?.stack === 'SettlementJournalError: journal_write_failed',
      );
      await assert.rejects(fsPromises.lstat(temporaryPath), error => error?.code === 'ENOENT');
      await assertOriginalState(cleanup);

      const precedence = await initializedJournal('precedence');
      temporaryPath = undefined;
      try {
        mode = 'write-and-cleanup';
        await assert.rejects(
          precedence.journal.putValidated(validatedAttempt()),
          error => error?.code === 'journal_write_failed' && error?.cause === undefined &&
            error?.stack === 'SettlementJournalError: journal_write_failed',
        );
        assert.equal((await fsPromises.lstat(temporaryPath)).isFile(), true);
        await assertOriginalState(precedence);
      } finally {
        await removeResidue(temporaryPath);
      }
    } finally {
      moduleMock.restore();
    }
  });

test('tombstone compare-and-replace rejects stale, changed, ineligible, and wrong-kind snapshots', async t => {
  const current = { value: '2026-01-01T00:00:00.000Z' };
  const { journal } = await fixture(t, { clock: () => current.value });
  const target = validatedAttempt();
  await journal.putValidated(target);
  const initial = await journal.load();
  await journal.putValidated(validatedAttempt({ transactionHash: '8'.repeat(64) }));
  current.value = '2026-01-01T01:00:00.000Z';
  await assert.rejects(
    journal.replaceRecordWithTombstone({
      expectedRevision: initial.revision,
      expectedRecord: initial.records[0],
      retentionMs: MINIMUM_RETENTION_MS,
    }),
    error => error?.code === 'journal_compare_and_replace_failed',
  );

  await journal.updateEvidence(target.authorizationKey, target.transactionHash, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
  const changed = await journal.load();
  await assert.rejects(
    journal.replaceRecordWithTombstone({
      expectedRevision: changed.revision,
      expectedRecord: initial.records[0],
      retentionMs: MINIMUM_RETENTION_MS,
    }),
    error => error?.code === 'journal_compare_and_replace_failed',
  );

  const changedIdentity = structuredClone(changed.records.find(record => record.transactionHash === target.transactionHash));
  changedIdentity.payer = `${changedIdentity.payer}x`;
  changedIdentity.signedAccountBlock.address = changedIdentity.payer;
  await assert.rejects(
    journal.replaceRecordWithTombstone({
      expectedRevision: changed.revision,
      expectedRecord: changedIdentity,
      retentionMs: MINIMUM_RETENTION_MS,
    }),
    error => error?.code === 'journal_compare_and_replace_failed',
  );

  const included = includedEvidence();
  await journal.updateEvidence(target.authorizationKey, target.transactionHash, EVIDENCE_STATES.MOMENTUM_INCLUDED, included);
  await journal.markDeliveryPending(
    target.authorizationKey,
    target.transactionHash,
    acceptedRequirementForAttempt(target),
  );
  const ineligible = await journal.load();
  const ineligibleRecord = ineligible.records.find(record => record.transactionHash === target.transactionHash);
  await assert.rejects(
    journal.replaceRecordWithTombstone({
      expectedRevision: ineligible.revision,
      expectedRecord: ineligibleRecord,
      retentionMs: MINIMUM_RETENTION_MS,
    }),
    error => error?.code === 'journal_compare_and_replace_failed',
  );
  assert.equal((await journal.get(target.authorizationKey, target.transactionHash)) !== null, true);

  const kindCurrent = { value: '2026-01-01T00:00:00.000Z' };
  const { journal: kindJournal } = await fixture(t, { clock: () => kindCurrent.value });
  const kindAttempt = validatedAttempt({ transactionHash: 'c'.repeat(64) });
  await kindJournal.putValidated(kindAttempt);
  const kindSnapshot = await kindJournal.load();
  kindCurrent.value = '2026-01-01T01:00:00.000Z';
  await kindJournal.replaceRecordWithTombstone({
    expectedRevision: kindSnapshot.revision,
    expectedRecord: kindSnapshot.records[0],
    retentionMs: MINIMUM_RETENTION_MS,
  });
  await assert.rejects(
    kindJournal.replaceRecordWithTombstone({
      expectedRevision: kindSnapshot.revision,
      expectedRecord: kindSnapshot.records[0],
      retentionMs: MINIMUM_RETENTION_MS,
    }),
    error => error?.code === 'journal_compare_and_replace_failed',
  );
  assert.equal((await kindJournal.getTombstone(kindAttempt.authorizationKey, kindAttempt.transactionHash)) !== null, true);
});

test('a concurrent journal revision change preserves the full retention candidate', async t => {
  const current = { value: '2026-01-01T00:00:00.000Z' };
  const { root, directory, journal } = await fixture(t, { clock: () => current.value });
  const other = new SettlementJournal({ directory, allowedRoot: root, clock: () => current.value });
  const target = validatedAttempt();
  await journal.putValidated(target);
  const snapshot = await journal.load();
  await other.putValidated(validatedAttempt({ transactionHash: '8'.repeat(64) }));
  current.value = '2026-01-01T01:00:00.000Z';
  await assert.rejects(
    journal.replaceRecordWithTombstone({
      expectedRevision: snapshot.revision,
      expectedRecord: snapshot.records[0],
      retentionMs: MINIMUM_RETENTION_MS,
    }),
    error => error?.code === 'journal_compare_and_replace_failed',
  );
  assert.equal((await journal.get(target.authorizationKey, target.transactionHash)) !== null, true);
  assert.equal((await journal.list({ includeTombstones: true })).tombstones.length, 0);
});

test('the first late Momentum observation is durable and later observations are idempotent', async t => {
  const current = { value: '2026-01-01T00:00:00.000Z' };
  const { root, directory, journal } = await fixture(t, { clock: () => current.value });
  const attempt = validatedAttempt();
  await journal.putValidated(attempt);
  const snapshot = await journal.load();
  current.value = '2026-01-01T01:00:00.000Z';
  const tombstone = await journal.replaceRecordWithTombstone({
    expectedRevision: snapshot.revision,
    expectedRecord: snapshot.records[0],
    retentionMs: MINIMUM_RETENTION_MS,
  });
  const converted = await readState(directory);
  const evidence = includedEvidence();
  const first = await journal.recordLateMomentumEvidence({
    expectedRevision: converted.revision,
    expectedTombstone: tombstone,
    confirmationDetail: evidence.confirmationDetail,
  });
  assert.equal(first.changed, true);
  safelyEqual(first.tombstone.lateMomentumEvidence, {
    observedAt: current.value,
    confirmationDetail: evidence.confirmationDetail,
  });
  const afterFirst = await readState(directory);
  assert.equal(afterFirst.revision, converted.revision + 1);

  const later = await journal.recordLateMomentumEvidence({
    expectedRevision: converted.revision,
    expectedTombstone: tombstone,
    confirmationDetail: includedEvidence({ momentumHeight: 43, momentumHash: 'b'.repeat(64) }).confirmationDetail,
  });
  assert.equal(later.changed, false);
  safelyEqual(later.tombstone, first.tombstone);
  assert.equal((await readState(directory)).revision, afterFirst.revision);

  const reloaded = new SettlementJournal({ directory, allowedRoot: root });
  safelyEqual(
    (await reloaded.getTombstone(attempt.authorizationKey, attempt.transactionHash)).lateMomentumEvidence,
    first.tombstone.lateMomentumEvidence,
  );
});

test('maintenance candidate and entry snapshots are detached and evidence CAS is revision-bound', async t => {
  const current = { value: '2026-01-01T00:00:00.000Z' };
  const { journal } = await fixture(t, { clock: () => current.value });
  const attempt = validatedAttempt();
  await journal.putValidated(attempt);
  current.value = '2026-01-01T01:00:00.000Z';

  safelyEqual(await journal.listReconciliationCandidates(null), { records: [], tombstones: [] });
  const candidates = await journal.listReconciliationCandidates(MINIMUM_RETENTION_MS);
  assert.equal(candidates.records.length, 1);
  assert.equal(candidates.tombstones.length, 0);
  const snapshot = await journal.getEntrySnapshot(attempt.authorizationKey, attempt.transactionHash);
  assert.equal(snapshot.kind, 'record');
  assert.equal(snapshot.revision, 1);
  safelyEqual(snapshot.entry, candidates.records[0]);
  snapshot.entry.payer = `${snapshot.entry.payer}x`;
  assert.equal(
    (await journal.getEntrySnapshot(attempt.authorizationKey, attempt.transactionHash)).entry.payer === snapshot.entry.payer,
    false,
  );

  const fresh = await journal.getEntrySnapshot(attempt.authorizationKey, attempt.transactionHash);
  const acknowledged = await journal.compareAndUpdateEvidence({
    expectedRevision: fresh.revision,
    expectedRecord: fresh.entry,
    evidenceState: EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    confirmationDetail: null,
  });
  assert.equal(acknowledged.changed, true);
  assert.equal(acknowledged.record.evidenceState, EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED);

  const acknowledgedSnapshot = await journal.getEntrySnapshot(attempt.authorizationKey, attempt.transactionHash);
  const unchanged = await journal.compareAndUpdateEvidence({
    expectedRevision: acknowledgedSnapshot.revision,
    expectedRecord: acknowledgedSnapshot.entry,
    evidenceState: EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    confirmationDetail: null,
  });
  assert.equal(unchanged.changed, false);

  const included = await journal.compareAndUpdateEvidence({
    expectedRevision: acknowledgedSnapshot.revision,
    expectedRecord: acknowledgedSnapshot.entry,
    evidenceState: EVIDENCE_STATES.MOMENTUM_INCLUDED,
    confirmationDetail: includedEvidence().confirmationDetail,
  });
  assert.equal(included.changed, true);
  assert.equal(included.record.evidenceState, EVIDENCE_STATES.MOMENTUM_INCLUDED);
  assert.equal(included.record.deliveryState, DELIVERY_STATES.NONE);

  await assert.rejects(
    journal.compareAndUpdateEvidence({
      expectedRevision: acknowledgedSnapshot.revision,
      expectedRecord: acknowledgedSnapshot.entry,
      evidenceState: EVIDENCE_STATES.MOMENTUM_INCLUDED,
      confirmationDetail: includedEvidence().confirmationDetail,
    }),
    error => error?.code === 'journal_compare_and_replace_failed',
  );
  for (const invalid of [undefined, 0, MINIMUM_RETENTION_MS - 1, 2_592_000_001]) {
    await assert.rejects(
      journal.listReconciliationCandidates(invalid),
      error => error?.code === 'journal_retention_invalid',
    );
  }
});
