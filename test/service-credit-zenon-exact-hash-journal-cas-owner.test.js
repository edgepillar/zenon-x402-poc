import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lstat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { paymentIntentDigest, sha256Hex } from '../src/canonical.js';
import {
  DELIVERY_STATES,
  EVIDENCE_STATES,
  SettlementJournal,
} from '../src/settlement-journal.js';

const OWNER_URL = new URL(
  '../src/service-credit-zenon-exact-hash-journal-cas-owner.js',
  import.meta.url,
);
const REJECTED_ERROR_CODE = 'zenon_exact_hash_journal_cas_owner_rejected';
const OUTCOME_UNKNOWN_ERROR_CODE =
  'zenon_exact_hash_journal_cas_owner_outcome_unknown';
const callsByJournal = new WeakMap();
const faultsByJournal = new WeakMap();

const getDescriptor = Object.getOwnPropertyDescriptor(
  SettlementJournal.prototype,
  'getEntrySnapshot',
);
const casDescriptor = Object.getOwnPropertyDescriptor(
  SettlementJournal.prototype,
  'compareAndUpdateEvidence',
);
const originalGetEntrySnapshot = getDescriptor.value;
const originalCompareAndUpdateEvidence = casDescriptor.value;
const originalUpdateEvidence = SettlementJournal.prototype.updateEvidence;

function counters(journal) {
  let value = callsByJournal.get(journal);
  if (!value) {
    value = { reads: 0, cas: 0 };
    callsByJournal.set(journal, value);
  }
  return value;
}

Object.defineProperty(SettlementJournal.prototype, 'getEntrySnapshot', {
  ...getDescriptor,
  value: async function instrumentedGetEntrySnapshot(...args) {
    counters(this).reads += 1;
    const snapshot = await Reflect.apply(originalGetEntrySnapshot, this, args);
    const fault = faultsByJournal.get(this);
    if (fault?.afterReadConflict) {
      fault.afterReadConflict = false;
      await Reflect.apply(originalUpdateEvidence, this, [
        args[0],
        args[1],
        EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      ]);
    }
    if (fault?.snapshot === 'proxy') return new Proxy(snapshot, {});
    if (fault?.snapshot === 'tombstone') return { ...snapshot, kind: 'tombstone' };
    if (fault?.snapshot === 'delivery') {
      return {
        ...snapshot,
        entry: { ...snapshot.entry, deliveryState: DELIVERY_STATES.DELIVERED },
      };
    }
    return snapshot;
  },
});

Object.defineProperty(SettlementJournal.prototype, 'compareAndUpdateEvidence', {
  ...casDescriptor,
  value: function instrumentedCompareAndUpdateEvidence(options) {
    counters(this).cas += 1;
    const fault = faultsByJournal.get(this);
    if (fault?.cas === 'sync-throw') throw new Error('synthetic_cas_fault');
    if (fault?.cas === 'async-reject') {
      return Promise.reject(new Error('synthetic_cas_fault'));
    }
    if (fault?.cas === 'invalid') {
      return { changed: false, record: options.expectedRecord };
    }
    if (fault?.cas === 'accessor') {
      const result = { changed: true };
      Object.defineProperty(result, 'record', {
        enumerable: true,
        get() {
          fault.accessorReads += 1;
          return options.expectedRecord;
        },
      });
      return result;
    }
    if (fault?.cas === 'persist-then-invalid') {
      return Reflect.apply(originalCompareAndUpdateEvidence, this, [options])
        .then(result => ({ changed: false, record: result.record }));
    }
    return Reflect.apply(originalCompareAndUpdateEvidence, this, [options]);
  },
});

let ownerModule;
try {
  ownerModule = await import(OWNER_URL.href);
} finally {
  Object.defineProperty(
    SettlementJournal.prototype,
    'getEntrySnapshot',
    getDescriptor,
  );
  Object.defineProperty(
    SettlementJournal.prototype,
    'compareAndUpdateEvidence',
    casDescriptor,
  );
}

const { applyZenonExactHashRecoveryJournalCas } = ownerModule;

function attempt(transactionMarker = '1') {
  const chainProfile = {
    version: 1,
    chainIdentifier: '7',
    genesisMomentumHash: '4'.repeat(64),
  };
  const resourceIdentity = {
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
  const intentDigest = paymentIntentDigest({
    x402Version: 2,
    resource: resourceIdentity,
    accepts: [acceptedRequirement],
  }, acceptedRequirement);
  const transactionHash = transactionMarker.repeat(64);
  const resourceDigest = sha256Hex(resourceIdentity);
  const authorizationKey = sha256Hex({
    domain: 'zenon-x402-authorization-v1',
    chainProfile,
    intentDigest,
    resourceDigest,
    transactionHash,
  });
  const payer = 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f';
  return {
    authorizationKey,
    transactionHash,
    chainProfile,
    intentDigest,
    resourceIdentity,
    resourceDigest,
    payer,
    signedAccountBlock: {
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
    },
  };
}

function identityFor(value) {
  return {
    authorizationKey: value.authorizationKey,
    transactionHash: value.transactionHash,
  };
}

function absentObservation() {
  return { observationVersion: 1, status: 'ABSENT' };
}

function unavailableObservation() {
  return { observationVersion: 1, status: 'UNAVAILABLE' };
}

function exactObservation(value, confirmationDetail = null) {
  return {
    observationVersion: 1,
    status: 'EXACT_MATCH',
    accountBlock: structuredClone(value.signedAccountBlock),
    confirmationDetail: structuredClone(confirmationDetail),
  };
}

function inclusion() {
  return {
    numConfirmations: 2,
    momentumHeight: 42,
    momentumHash: 'a'.repeat(64),
    momentumTimestamp: 1_700_000_000,
  };
}

async function journalFixture(t, {
  evidenceState = EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
  transactionMarker = '1',
  clock = () => '2026-01-01T00:00:00.000Z',
} = {}) {
  const root = await mkdtemp(join(
    tmpdir(),
    `zenon-exact-hash-journal-cas-${process.pid}-`,
  ));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'journal');
  const defaultJournal = new SettlementJournal({
    directory,
    allowedRoot: root,
    clock,
  });
  const value = attempt(transactionMarker);
  await defaultJournal.putValidated(value);
  if (evidenceState !== EVIDENCE_STATES.VALIDATED) {
    await defaultJournal.updateEvidence(
      value.authorizationKey,
      value.transactionHash,
      evidenceState,
    );
  }
  const journal = new SettlementJournal({
    directory,
    allowedRoot: root,
    clock,
    existingOnly: true,
  });
  callsByJournal.set(journal, { reads: 0, cas: 0 });
  return { defaultJournal, journal, value };
}

function assertOwnerRejected(error) {
  assert.equal(error?.name, 'ZenonExactHashJournalCasOwnerError');
  assert.equal(error?.code, REJECTED_ERROR_CODE);
  assert.equal(error?.message, REJECTED_ERROR_CODE);
  assert.deepEqual(Object.keys(error), ['name', 'code']);
  assert.equal(error?.stack, undefined);
  assert.equal(error?.cause, undefined);
  return true;
}

function assertOwnerOutcomeUnknown(error) {
  assert.equal(
    error?.name,
    'ZenonExactHashJournalCasOwnerOutcomeUnknownError',
  );
  assert.equal(error?.code, OUTCOME_UNKNOWN_ERROR_CODE);
  assert.equal(error?.message, OUTCOME_UNKNOWN_ERROR_CODE);
  assert.deepEqual(Object.keys(error), ['name', 'code']);
  assert.equal(error?.stack, undefined);
  assert.equal(error?.cause, undefined);
  return true;
}

function assertCounters(journal, reads, cas) {
  assert.deepEqual(counters(journal), { reads, cas });
}

function assertStatus(result, status, evidenceState) {
  assert.deepEqual(result, {
    status,
    evidenceState,
    nonpublication: 'NOT_ESTABLISHED',
  });
  assert.deepEqual(Object.keys(result), [
    'status',
    'evidenceState',
    'nonpublication',
  ]);
  assert.equal(Object.isFrozen(result), true);
}

test('the source-only owner is default-off and has no forbidden operation path', () => {
  assert.deepEqual(Object.keys(ownerModule), ['applyZenonExactHashRecoveryJournalCas']);
  assert.equal(applyZenonExactHashRecoveryJournalCas.constructor.name, 'AsyncFunction');

  const source = readFileSync(OWNER_URL, 'utf8');
  assert.doesNotMatch(
    source,
    /from ['"]node:(?:fs|http|https|net|child_process|worker_threads)['"]/,
  );
  assert.doesNotMatch(
    source,
    /\b(?:fetch|WebSocket|wallet|sign|publish|listener|RPC|CLI|putValidated|updateEvidence|replaceRecordWithTombstone|recordLateMomentumEvidence)\b/i,
  );
  assert.doesNotMatch(source, /process\.(?:env|argv)|import\.meta\.main/);
});

test('the owner rejects a default-mode journal before any read', async t => {
  const { defaultJournal, value } = await journalFixture(t);
  await assert.rejects(
    applyZenonExactHashRecoveryJournalCas(
      defaultJournal,
      identityFor(value),
      absentObservation(),
    ),
    assertOwnerRejected,
  );
  assertCounters(defaultJournal, 0, 0);
});

test('an existing-only owner rejects missing state without creating it', async t => {
  const root = await mkdtemp(join(
    tmpdir(),
    `zenon-exact-hash-journal-cas-missing-${process.pid}-`,
  ));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runDirectory = join(root, 'run');
  const journal = new SettlementJournal({
    directory: join(runDirectory, 'journal'),
    allowedRoot: root,
    existingOnly: true,
  });
  const value = attempt();
  callsByJournal.set(journal, { reads: 0, cas: 0 });

  await assert.rejects(
    applyZenonExactHashRecoveryJournalCas(
      journal,
      identityFor(value),
      absentObservation(),
    ),
    assertOwnerRejected,
  );
  assertCounters(journal, 1, 0);
  await assert.rejects(
    lstat(runDirectory),
    error => error?.code === 'ENOENT',
  );
});

test('ABSENT and UNAVAILABLE preserve ambiguity with one read and no CAS', async t => {
  let marker = 1;
  for (const evidenceState of [
    EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
    EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
  ]) {
    for (const observation of [absentObservation(), unavailableObservation()]) {
      const { journal, value } = await journalFixture(t, {
        evidenceState,
        transactionMarker: String(marker),
      });
      marker += 1;
      const before = await journal.load();
      const result = await applyZenonExactHashRecoveryJournalCas(
        journal,
        identityFor(value),
        observation,
      );

      assertStatus(result, 'NO_MUTATION', evidenceState);
      assertCounters(journal, 1, 0);
      assert.deepEqual(await journal.load(), before);
    }
  }
});

test('exact observations perform only the planned evidence CAS', async t => {
  const cases = [
    {
      initial: EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
      detail: null,
      expected: EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      marker: '5',
    },
    {
      initial: EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
      detail: inclusion(),
      expected: EVIDENCE_STATES.MOMENTUM_INCLUDED,
      marker: '6',
    },
    {
      initial: EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      detail: inclusion(),
      expected: EVIDENCE_STATES.MOMENTUM_INCLUDED,
      marker: '7',
    },
  ];

  for (const entry of cases) {
    const { journal, value } = await journalFixture(t, {
      evidenceState: entry.initial,
      transactionMarker: entry.marker,
    });
    const signedBlockBefore = structuredClone(value.signedAccountBlock);
    const result = await applyZenonExactHashRecoveryJournalCas(
      journal,
      identityFor(value),
      exactObservation(value, entry.detail),
    );

    assertStatus(result, 'EVIDENCE_UPDATED', entry.expected);
    assertCounters(journal, 1, 1);
    const snapshot = await Reflect.apply(originalGetEntrySnapshot, journal, [
      value.authorizationKey,
      value.transactionHash,
    ]);
    assert.equal(snapshot.entry.evidenceState, entry.expected);
    assert.equal(snapshot.entry.deliveryState, DELIVERY_STATES.NONE);
    assert.deepEqual(snapshot.entry.signedAccountBlock, signedBlockBefore);
    if (entry.detail === null) {
      assert.equal(snapshot.entry.momentumEvidence, null);
    } else {
      assert.deepEqual(snapshot.entry.momentumEvidence.confirmationDetail, entry.detail);
    }
  }

  const { journal, value } = await journalFixture(t, {
    evidenceState: EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    transactionMarker: '8',
  });
  const before = await journal.load();
  const result = await applyZenonExactHashRecoveryJournalCas(
    journal,
    identityFor(value),
    exactObservation(value),
  );
  assertStatus(result, 'NO_MUTATION', EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED);
  assertCounters(journal, 1, 0);
  assert.deepEqual(await journal.load(), before);
});

test('wrong, missing, tombstone, VALIDATED, and delivered snapshots fail closed', async t => {
  const cases = [];

  const wrong = await journalFixture(t, { transactionMarker: '9' });
  cases.push({
    ...wrong,
    identity: {
      authorizationKey: wrong.value.authorizationKey,
      transactionHash: 'a'.repeat(64),
    },
  });

  const missing = await journalFixture(t, { transactionMarker: 'b' });
  cases.push({
    ...missing,
    identity: identityFor(attempt('c')),
  });

  const tombstone = await journalFixture(t, { transactionMarker: 'c' });
  faultsByJournal.set(tombstone.journal, { snapshot: 'tombstone' });
  cases.push({ ...tombstone, identity: identityFor(tombstone.value) });

  const validated = await journalFixture(t, {
    evidenceState: EVIDENCE_STATES.VALIDATED,
    transactionMarker: 'd',
  });
  cases.push({ ...validated, identity: identityFor(validated.value) });

  const delivered = await journalFixture(t, { transactionMarker: 'e' });
  faultsByJournal.set(delivered.journal, { snapshot: 'delivery' });
  cases.push({ ...delivered, identity: identityFor(delivered.value) });

  for (const entry of cases) {
    const before = await entry.journal.load();
    await assert.rejects(
      applyZenonExactHashRecoveryJournalCas(
        entry.journal,
        entry.identity,
        unavailableObservation(),
      ),
      assertOwnerRejected,
    );
    assertCounters(entry.journal, 1, 0);
    assert.deepEqual(await entry.journal.load(), before);
  }
});

test('foreign, ambiguous, accessor, and proxy inputs fail closed without invocation', async t => {
  const foreign = await journalFixture(t, { transactionMarker: '1' });
  const foreignObservation = exactObservation(foreign.value);
  foreignObservation.accountBlock.amount = '101';
  const foreignBefore = await foreign.journal.load();
  await assert.rejects(
    applyZenonExactHashRecoveryJournalCas(
      foreign.journal,
      identityFor(foreign.value),
      foreignObservation,
    ),
    assertOwnerRejected,
  );
  assertCounters(foreign.journal, 1, 0);
  assert.deepEqual(await foreign.journal.load(), foreignBefore);

  const ambiguous = await journalFixture(t, { transactionMarker: '2' });
  const ambiguousBefore = await ambiguous.journal.load();
  await assert.rejects(
    applyZenonExactHashRecoveryJournalCas(
      ambiguous.journal,
      identityFor(ambiguous.value),
      { observationVersion: 1, status: 'AMBIGUOUS' },
    ),
    assertOwnerRejected,
  );
  assertCounters(ambiguous.journal, 1, 0);
  assert.deepEqual(await ambiguous.journal.load(), ambiguousBefore);

  const accessor = await journalFixture(t, { transactionMarker: '3' });
  const accessorBefore = await accessor.journal.load();
  let observationAccessorReads = 0;
  const accessorObservation = { observationVersion: 1 };
  Object.defineProperty(accessorObservation, 'status', {
    enumerable: true,
    get() {
      observationAccessorReads += 1;
      return 'ABSENT';
    },
  });
  await assert.rejects(
    applyZenonExactHashRecoveryJournalCas(
      accessor.journal,
      identityFor(accessor.value),
      accessorObservation,
    ),
    assertOwnerRejected,
  );
  assert.equal(observationAccessorReads, 0);
  assertCounters(accessor.journal, 1, 0);
  assert.deepEqual(await accessor.journal.load(), accessorBefore);

  const proxiedObservation = await journalFixture(t, { transactionMarker: '4' });
  const proxiedObservationBefore = await proxiedObservation.journal.load();
  await assert.rejects(
    applyZenonExactHashRecoveryJournalCas(
      proxiedObservation.journal,
      identityFor(proxiedObservation.value),
      new Proxy(absentObservation(), {}),
    ),
    assertOwnerRejected,
  );
  assertCounters(proxiedObservation.journal, 1, 0);
  assert.deepEqual(
    await proxiedObservation.journal.load(),
    proxiedObservationBefore,
  );

  const identityAccessor = await journalFixture(t, { transactionMarker: '5' });
  const identityAccessorBefore = await identityAccessor.journal.load();
  let identityAccessorReads = 0;
  const hostileIdentity = { transactionHash: identityAccessor.value.transactionHash };
  Object.defineProperty(hostileIdentity, 'authorizationKey', {
    enumerable: true,
    get() {
      identityAccessorReads += 1;
      return identityAccessor.value.authorizationKey;
    },
  });
  await assert.rejects(
    applyZenonExactHashRecoveryJournalCas(
      identityAccessor.journal,
      hostileIdentity,
      absentObservation(),
    ),
    assertOwnerRejected,
  );
  assert.equal(identityAccessorReads, 0);
  assertCounters(identityAccessor.journal, 0, 0);
  assert.deepEqual(
    await identityAccessor.journal.load(),
    identityAccessorBefore,
  );

  const proxiedIdentity = await journalFixture(t, { transactionMarker: '6' });
  const proxiedIdentityBefore = await proxiedIdentity.journal.load();
  await assert.rejects(
    applyZenonExactHashRecoveryJournalCas(
      proxiedIdentity.journal,
      new Proxy(identityFor(proxiedIdentity.value), {}),
      absentObservation(),
    ),
    assertOwnerRejected,
  );
  assertCounters(proxiedIdentity.journal, 0, 0);
  assert.deepEqual(
    await proxiedIdentity.journal.load(),
    proxiedIdentityBefore,
  );
});

test('journal proxy and own-method accessor injection are rejected before any call', async t => {
  const proxied = await journalFixture(t, { transactionMarker: '7' });
  const proxiedBefore = await proxied.journal.load();
  await assert.rejects(
    applyZenonExactHashRecoveryJournalCas(
      new Proxy(proxied.journal, {}),
      identityFor(proxied.value),
      absentObservation(),
    ),
    assertOwnerRejected,
  );
  assertCounters(proxied.journal, 0, 0);
  assert.deepEqual(await proxied.journal.load(), proxiedBefore);

  const accessor = await journalFixture(t, { transactionMarker: '8' });
  const accessorBefore = await accessor.journal.load();
  let methodAccessorReads = 0;
  Object.defineProperty(accessor.journal, 'getEntrySnapshot', {
    configurable: true,
    get() {
      methodAccessorReads += 1;
      return originalGetEntrySnapshot;
    },
  });
  await assert.rejects(
    applyZenonExactHashRecoveryJournalCas(
      accessor.journal,
      identityFor(accessor.value),
      absentObservation(),
    ),
    assertOwnerRejected,
  );
  assert.equal(methodAccessorReads, 0);
  assertCounters(accessor.journal, 0, 0);
  assert.deepEqual(await accessor.journal.load(), accessorBefore);
});

test('a revision conflict reports outcome unknown after one read and one CAS', async t => {
  const { journal, value } = await journalFixture(t, { transactionMarker: '9' });
  const before = await journal.load();
  faultsByJournal.set(journal, { afterReadConflict: true });

  await assert.rejects(
    applyZenonExactHashRecoveryJournalCas(
      journal,
      identityFor(value),
      exactObservation(value, inclusion()),
    ),
    assertOwnerOutcomeUnknown,
  );

  assertCounters(journal, 1, 1);
  const after = await journal.load();
  assert.equal(after.revision, before.revision + 1);
  const snapshot = await Reflect.apply(originalGetEntrySnapshot, journal, [
    value.authorizationKey,
    value.transactionHash,
  ]);
  assert.equal(snapshot.entry.evidenceState, EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED);
  assert.equal(snapshot.entry.momentumEvidence, null);
});

test('a pre-CAS snapshot fault rejects with an unchanged journal', async t => {
  const { journal, value } = await journalFixture(t, { transactionMarker: 'a' });
  const before = await journal.load();
  faultsByJournal.set(journal, { snapshot: 'proxy' });

  await assert.rejects(
    applyZenonExactHashRecoveryJournalCas(
      journal,
      identityFor(value),
      exactObservation(value),
    ),
    assertOwnerRejected,
  );

  assertCounters(journal, 1, 0);
  assert.deepEqual(await journal.load(), before);
});

test('post-CAS failures report outcome unknown once without retry', async t => {
  for (const [marker, fault] of [
    ['b', { cas: 'sync-throw' }],
    ['c', { cas: 'async-reject' }],
    ['d', { cas: 'invalid' }],
    ['e', { cas: 'accessor', accessorReads: 0 }],
  ]) {
    const { journal, value } = await journalFixture(t, { transactionMarker: marker });
    faultsByJournal.set(journal, fault);
    await assert.rejects(
      applyZenonExactHashRecoveryJournalCas(
        journal,
        identityFor(value),
        exactObservation(value),
      ),
      assertOwnerOutcomeUnknown,
    );

    assertCounters(journal, 1, 1);
    if (fault.cas === 'accessor') assert.equal(fault.accessorReads, 0);
  }
});

test('a persisted CAS followed by a bad result reports outcome unknown without retry', async t => {
  const { journal, value } = await journalFixture(t, { transactionMarker: 'f' });
  faultsByJournal.set(journal, { cas: 'persist-then-invalid' });

  await assert.rejects(
    applyZenonExactHashRecoveryJournalCas(
      journal,
      identityFor(value),
      exactObservation(value),
    ),
    assertOwnerOutcomeUnknown,
  );

  assertCounters(journal, 1, 1);
  const snapshot = await Reflect.apply(originalGetEntrySnapshot, journal, [
    value.authorizationKey,
    value.transactionHash,
  ]);
  assert.equal(
    snapshot.entry.evidenceState,
    EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
  );
  assert.equal(snapshot.entry.momentumEvidence, null);
});
