import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
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

function validatedAttempt(overrides = {}) {
  const transactionHash = overrides.transactionHash ?? '1'.repeat(64);
  const intentDigest = overrides.intentDigest ?? '3'.repeat(64);
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
  const claim = await journal.markDeliveryPending(attempt.authorizationKey, attempt.transactionHash);
  assert.equal(claim.deliveryClaimed, true);
  const duplicateClaim = await journal.markDeliveryPending(attempt.authorizationKey, attempt.transactionHash);
  assert.equal(duplicateClaim.deliveryClaimed, false);
  await journal.markDelivered(attempt.authorizationKey, attempt.transactionHash, cachedResponse);

  const reloaded = new SettlementJournal({ directory, allowedRoot: root });
  const record = await reloaded.get(attempt.authorizationKey, attempt.transactionHash);
  assert.equal(record.evidenceState, EVIDENCE_STATES.MOMENTUM_INCLUDED);
  assert.equal(record.deliveryState, DELIVERY_STATES.DELIVERED);
  assert.deepEqual(record.momentumEvidence, momentumEvidence);
  assert.deepEqual(record.cachedResponse, cachedResponse);
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
  const pending = await journal.markDeliveryPending(attempt.authorizationKey, attempt.transactionHash);

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
