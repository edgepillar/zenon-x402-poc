import assert from 'node:assert/strict';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { paymentIntentDigest, sha256Hex } from '../src/canonical.js';
import {
  inspectZenonExactHashRecoveryRetainedTransition,
  readZenonExactHashRecoveryRetainedSnapshot,
} from '../src/live-evidence-runner.js';
import {
  DELIVERY_STATES,
  EVIDENCE_STATES,
  SettlementJournal,
} from '../src/settlement-journal.js';

const RECOVERY_MODE = 'SOURCE_ONLY_EXACT_HASH';
const PRIOR_RECORD_DIGEST_DOMAIN =
  'zenon-x402-source-only-exact-hash-prior-record-v1';
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const LATER_TIME = '2026-01-01T02:00:00.000Z';

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function attempt(transactionMarker = '1') {
  const chainProfile = {
    version: 1,
    chainIdentifier: '7',
    genesisMomentumHash: '4'.repeat(64),
  };
  const resourceIdentity = {
    url: 'https://example.test/resource',
    description: 'deterministic retained transition fixture',
    mimeType: 'application/json',
  };
  const acceptedRequirement = {
    scheme: 'exact',
    network: 'zenon:testnet',
    asset: 'zts1qqqqqqqqqqqqtq587y',
    amount: '1',
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
      amount: '1',
      tokenStandard: 'zts1qqqqqqqqqqqqtq587y',
      fromBlockHash: '0'.repeat(64),
      data: Buffer.from(intentDigest, 'hex').toString('base64'),
      fusedPlasma: 0,
      difficulty: 1,
      nonce: '0'.repeat(16),
      publicKey: Buffer.alloc(32, 1).toString('base64'),
      signature: Buffer.alloc(64, 2).toString('base64'),
    },
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

function priorRecordDigest(record) {
  return sha256Hex({
    domain: PRIOR_RECORD_DIGEST_DOMAIN,
    record,
  });
}

function transitionExpectation(snapshot, successorEvidenceState, {
  confirmationDetail = null,
  prior = {},
  successor = {},
} = {}) {
  return deepFreeze({
    expectationVersion: 1,
    prior: {
      revision: snapshot.revision,
      evidenceState: snapshot.entry.evidenceState,
      deliveryState: DELIVERY_STATES.NONE,
      authorizationKey: snapshot.entry.authorizationKey,
      transactionHash: snapshot.entry.transactionHash,
      updatedAt: snapshot.entry.updatedAt,
      recordDigest: priorRecordDigest(snapshot.entry),
      ...prior,
    },
    successor: {
      evidenceState: successorEvidenceState,
      deliveryState: DELIVERY_STATES.NONE,
      confirmationDetail: structuredClone(confirmationDetail),
      ...successor,
    },
  });
}

function inspectionOptions(fixture) {
  return Object.freeze({
    workspaceRoot: fixture.workspaceRoot,
    runName: fixture.runName,
    recoveryMode: RECOVERY_MODE,
  });
}

function expectedInspection(classification) {
  return {
    inspectorVersion: 1,
    classification,
    scope: 'LOCAL_DURABLE_JOURNAL_ONLY',
    sideEffects: 'NONE',
  };
}

function generation(stat) {
  return {
    dev: stat.dev.toString(),
    ino: stat.ino.toString(),
    size: stat.size.toString(),
    mtimeNs: stat.mtimeNs.toString(),
    ctimeNs: stat.ctimeNs.toString(),
  };
}

function assertFixedFailure(error) {
  return error?.code === 'live_evidence_run_invalid' && error?.cause === undefined;
}

async function assertInspectionRejected(fixture, expectation) {
  await assert.rejects(
    inspectZenonExactHashRecoveryRetainedTransition(
      inspectionOptions(fixture),
      expectation,
    ),
    assertFixedFailure,
  );
}

async function fixture(t, {
  evidenceState = EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
  transactionMarker = '1',
} = {}) {
  const createdRoot = await mkdtemp(join(tmpdir(), 'exact-hash-transition-inspector-'));
  t.after(() => rm(createdRoot, { recursive: true, force: true }));
  const root = await realpath(createdRoot);
  await chmod(root, 0o700);
  const workspaceRoot = join(root, 'workspace');
  const runName = 'retained-source-only';
  const runDirectory = join(workspaceRoot, runName);
  const journalDirectory = join(runDirectory, 'journal');
  const consumedMarkerPath = join(workspaceRoot, 'PUBLIC_WS_ONCE_CONSUMED');
  const submissionMarkerPath = join(runDirectory, 'SUBMISSION_ARMED');
  const journalMarkerPath = join(journalDirectory, '.settlement-journal.initialized');
  const journalPath = join(journalDirectory, 'settlement-journal.json');
  await mkdir(workspaceRoot, { mode: 0o700 });
  await writeFile(consumedMarkerPath, 'PUBLIC_WS_ONCE_CONSUMED\n', { mode: 0o600 });
  await mkdir(runDirectory, { mode: 0o700 });
  await writeFile(submissionMarkerPath, 'SUBMISSION_ARMED\n', { mode: 0o600 });

  let now = FIXED_TIME;
  const journal = new SettlementJournal({
    directory: journalDirectory,
    allowedRoot: runDirectory,
    clock: () => now,
  });
  const input = attempt(transactionMarker);
  await journal.putValidated(input);
  if (evidenceState !== EVIDENCE_STATES.VALIDATED) {
    await journal.updateEvidence(
      input.authorizationKey,
      input.transactionHash,
      evidenceState,
    );
  }
  return {
    workspaceRoot,
    runName,
    runDirectory,
    journalDirectory,
    consumedMarkerPath,
    submissionMarkerPath,
    journalMarkerPath,
    journalPath,
    journal,
    input,
    setNow(value) {
      now = value;
    },
  };
}

async function currentSnapshot(value) {
  return value.journal.getEntrySnapshot(
    value.input.authorizationKey,
    value.input.transactionHash,
  );
}

async function applySuccessor(value, snapshot, evidenceState, confirmationDetail = null) {
  return value.journal.compareAndUpdateEvidence({
    expectedRevision: snapshot.revision,
    expectedRecord: snapshot.entry,
    evidenceState,
    confirmationDetail: structuredClone(confirmationDetail),
  });
}

async function rewriteJournal(value, mutate, repairChecksum = true) {
  const document = JSON.parse(await readFile(value.journalPath, 'utf8'));
  mutate(document);
  if (repairChecksum) {
    const content = {
      schemaVersion: document.schemaVersion,
      revision: document.revision,
      records: document.records,
    };
    if (document.schemaVersion === 2) content.tombstones = document.tombstones;
    document.checksum = sha256Hex(content);
  }
  await writeFile(value.journalPath, `${JSON.stringify(document, null, 2)}\n`, {
    mode: 0o600,
  });
}

test('inspector classifies the exact prior state and replay without mutation', async t => {
  const value = await fixture(t);
  const snapshot = await currentSnapshot(value);
  const expectation = transitionExpectation(
    snapshot,
    EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
  );
  const journalBefore = await readFile(value.journalPath);
  const generationBefore = generation(await lstat(value.journalPath, { bigint: true }));
  const runEntriesBefore = (await readdir(value.runDirectory)).sort();
  const journalEntriesBefore = (await readdir(value.journalDirectory)).sort();

  const first = await inspectZenonExactHashRecoveryRetainedTransition(
    inspectionOptions(value),
    expectation,
  );
  const replay = await inspectZenonExactHashRecoveryRetainedTransition(
    inspectionOptions(value),
    expectation,
  );

  assert.deepEqual(first, expectedInspection('PRIOR_STATE_PRESENT'));
  assert.strictEqual(replay, first);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Buffer.compare(journalBefore, await readFile(value.journalPath)), 0);
  assert.deepEqual(
    generation(await lstat(value.journalPath, { bigint: true })),
    generationBefore,
  );
  assert.deepEqual((await readdir(value.runDirectory)).sort(), runEntriesBefore);
  assert.deepEqual((await readdir(value.journalDirectory)).sort(), journalEntriesBefore);
});

test('inspector classifies the exact ACK successor of one ambiguous CAS', async t => {
  const value = await fixture(t);
  const snapshot = await currentSnapshot(value);
  const expectation = transitionExpectation(
    snapshot,
    EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
  );
  value.setNow(LATER_TIME);
  await applySuccessor(
    value,
    snapshot,
    EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
  );

  assert.deepEqual(
    await inspectZenonExactHashRecoveryRetainedTransition(
      inspectionOptions(value),
      expectation,
    ),
    expectedInspection('EXACT_EXPECTED_SUCCESSOR_PRESENT'),
  );
});

test('inspector alone accepts the exact INCLUDED successor', async t => {
  const value = await fixture(t, {
    evidenceState: EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
  });
  const snapshot = await currentSnapshot(value);
  const confirmationDetail = inclusion();
  const expectation = transitionExpectation(
    snapshot,
    EVIDENCE_STATES.MOMENTUM_INCLUDED,
    { confirmationDetail },
  );
  value.setNow(LATER_TIME);
  await applySuccessor(
    value,
    snapshot,
    EVIDENCE_STATES.MOMENTUM_INCLUDED,
    confirmationDetail,
  );

  assert.deepEqual(
    await inspectZenonExactHashRecoveryRetainedTransition(
      inspectionOptions(value),
      expectation,
    ),
    expectedInspection('EXACT_EXPECTED_SUCCESSOR_PRESENT'),
  );
  await assert.rejects(
    readZenonExactHashRecoveryRetainedSnapshot(inspectionOptions(value)),
    assertFixedFailure,
  );
});

test('stale revision, foreign identity, and a third state remain unknown', async t => {
  await t.test('stale revision', async t => {
    const value = await fixture(t);
    const snapshot = await currentSnapshot(value);
    const expectation = transitionExpectation(
      snapshot,
      EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    );
    await rewriteJournal(value, document => {
      document.revision += 2;
    });
    assert.deepEqual(
      await inspectZenonExactHashRecoveryRetainedTransition(
        inspectionOptions(value),
        expectation,
      ),
      expectedInspection('OUTCOME_UNKNOWN'),
    );
  });

  for (const field of ['authorizationKey', 'transactionHash']) {
    await t.test(`foreign ${field}`, async t => {
      const value = await fixture(t);
      const snapshot = await currentSnapshot(value);
      const expectation = transitionExpectation(
        snapshot,
        EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
        { prior: { [field]: 'f'.repeat(64) } },
      );
      assert.deepEqual(
        await inspectZenonExactHashRecoveryRetainedTransition(
          inspectionOptions(value),
          expectation,
        ),
        expectedInspection('OUTCOME_UNKNOWN'),
      );
    });
  }

  await t.test('third evidence state', async t => {
    const value = await fixture(t);
    const snapshot = await currentSnapshot(value);
    const expectation = transitionExpectation(
      snapshot,
      EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    );
    await rewriteJournal(value, document => {
      const [key] = Object.keys(document.records);
      document.records[key].evidenceState = EVIDENCE_STATES.VALIDATED;
    });
    assert.deepEqual(
      await inspectZenonExactHashRecoveryRetainedTransition(
        inspectionOptions(value),
        expectation,
      ),
      expectedInspection('OUTCOME_UNKNOWN'),
    );
  });
});

test('expectation grammar rejects missing, extra, mutable, and illegal transitions', async t => {
  const value = await fixture(t);
  const snapshot = await currentSnapshot(value);
  const valid = transitionExpectation(
    snapshot,
    EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
  );
  const missing = deepFreeze({
    expectationVersion: 1,
    prior: valid.prior,
  });
  const extra = deepFreeze({ ...structuredClone(valid), extra: true });
  const mutableOuter = structuredClone(valid);
  const mutablePrior = structuredClone(valid);
  deepFreeze(mutablePrior.successor);
  Object.freeze(mutablePrior);
  const accessor = structuredClone(valid);
  Object.defineProperty(accessor.prior, 'revision', {
    enumerable: true,
    get() {
      return snapshot.revision;
    },
  });
  deepFreeze(accessor.successor);
  Object.freeze(accessor.prior);
  Object.freeze(accessor);
  const proxy = new Proxy(structuredClone(valid), {});
  const illegalState = transitionExpectation(
    snapshot,
    EVIDENCE_STATES.MOMENTUM_INCLUDED,
  );
  const illegalDelivery = transitionExpectation(
    snapshot,
    EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    { successor: { deliveryState: DELIVERY_STATES.DELIVERED } },
  );
  for (const expectation of [
    undefined,
    missing,
    extra,
    mutableOuter,
    mutablePrior,
    accessor,
    proxy,
    illegalState,
    illegalDelivery,
  ]) {
    await assertInspectionRejected(value, expectation);
  }
});

test('malformed, multiple, tombstoned, and extra record layouts fail closed', async t => {
  await t.test('missing journal', async t => {
    const value = await fixture(t);
    const expectation = transitionExpectation(
      await currentSnapshot(value),
      EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    );
    await rm(value.journalPath);
    await assertInspectionRejected(value, expectation);
    await assert.rejects(lstat(value.journalPath), error => error?.code === 'ENOENT');
  });

  await t.test('malformed journal', async t => {
    const value = await fixture(t);
    const expectation = transitionExpectation(
      await currentSnapshot(value),
      EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    );
    await writeFile(value.journalPath, '{', { mode: 0o600 });
    await assertInspectionRejected(value, expectation);
  });

  await t.test('multiple active records', async t => {
    const value = await fixture(t);
    const expectation = transitionExpectation(
      await currentSnapshot(value),
      EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    );
    await value.journal.putValidated(attempt('2'));
    await assertInspectionRejected(value, expectation);
  });

  await t.test('tombstoned expected record', async t => {
    const value = await fixture(t);
    const snapshot = await currentSnapshot(value);
    const expectation = transitionExpectation(
      snapshot,
      EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    );
    value.setNow(LATER_TIME);
    await value.journal.replaceRecordWithTombstone({
      expectedRevision: snapshot.revision,
      expectedRecord: snapshot.entry,
      retentionMs: 3_600_000,
    });
    await assertInspectionRejected(value, expectation);
  });

  await t.test('extra record field', async t => {
    const value = await fixture(t);
    const expectation = transitionExpectation(
      await currentSnapshot(value),
      EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    );
    await rewriteJournal(value, document => {
      const [key] = Object.keys(document.records);
      document.records[key].extra = true;
    });
    await assertInspectionRejected(value, expectation);
  });
});

test('unsafe retained paths and unexpected leaves fail closed', async t => {
  const scenarios = [
    {
      name: 'wrong file mode',
      mutate: value => chmod(value.submissionMarkerPath, 0o640),
    },
    {
      name: 'wrong directory mode',
      mutate: value => chmod(value.journalDirectory, 0o750),
    },
    {
      name: 'symlinked journal',
      mutate: async value => {
        const target = join(value.workspaceRoot, 'journal-symlink-target');
        await rename(value.journalPath, target);
        await symlink(target, value.journalPath);
      },
    },
    {
      name: 'hard-linked journal',
      mutate: value => link(
        value.journalPath,
        join(value.workspaceRoot, 'journal-hardlink'),
      ),
    },
    {
      name: 'unexpected run leaf',
      mutate: value => writeFile(join(value.runDirectory, 'UNEXPECTED'), 'x', {
        mode: 0o600,
      }),
    },
    {
      name: 'unexpected journal leaf',
      mutate: value => writeFile(join(value.journalDirectory, 'UNEXPECTED'), 'x', {
        mode: 0o600,
      }),
    },
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, async t => {
      const value = await fixture(t);
      const expectation = transitionExpectation(
        await currentSnapshot(value),
        EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      );
      await scenario.mutate(value);
      await assertInspectionRejected(value, expectation);
    });
  }
});

test('retained journal replacement and byte drift are detected', async t => {
  await t.test('replacement', async t => {
    const value = await fixture(t);
    const expectation = transitionExpectation(
      await currentSnapshot(value),
      EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    );
    const descriptor = Object.getOwnPropertyDescriptor(
      SettlementJournal.prototype,
      'load',
    );
    const backup = join(value.workspaceRoot, 'journal-original');
    Object.defineProperty(SettlementJournal.prototype, 'load', {
      ...descriptor,
      value: async function (...args) {
        const bytes = await readFile(this.filePath);
        await rename(this.filePath, backup);
        await writeFile(this.filePath, bytes, { mode: 0o600 });
        bytes.fill(0);
        return Reflect.apply(descriptor.value, this, args);
      },
    });
    try {
      await assertInspectionRejected(value, expectation);
    } finally {
      Object.defineProperty(SettlementJournal.prototype, 'load', descriptor);
      await rm(value.journalPath, { force: true });
      await rename(backup, value.journalPath);
    }
  });

  await t.test('byte drift', async t => {
    const value = await fixture(t);
    const expectation = transitionExpectation(
      await currentSnapshot(value),
      EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    );
    const descriptor = Object.getOwnPropertyDescriptor(
      SettlementJournal.prototype,
      'load',
    );
    Object.defineProperty(SettlementJournal.prototype, 'load', {
      ...descriptor,
      value: async function (...args) {
        const result = await Reflect.apply(descriptor.value, this, args);
        const document = JSON.parse(await readFile(this.filePath, 'utf8'));
        await writeFile(this.filePath, `${JSON.stringify(document)}\n`, { mode: 0o600 });
        return result;
      },
    });
    try {
      await assertInspectionRejected(value, expectation);
    } finally {
      Object.defineProperty(SettlementJournal.prototype, 'load', descriptor);
    }
  });
});

test('inspector uses only existing-only load and invokes no journal mutator', async t => {
  const value = await fixture(t);
  const expectation = transitionExpectation(
    await currentSnapshot(value),
    EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
  );
  const prototype = SettlementJournal.prototype;
  const loadDescriptor = Object.getOwnPropertyDescriptor(prototype, 'load');
  const forbiddenNames = [
    'putValidated',
    'getEntrySnapshot',
    'compareAndUpdateEvidence',
    'replaceRecordWithTombstone',
    'recordLateMomentumEvidence',
    'updateEvidence',
    'markDeliveryPending',
    'markDelivered',
  ];
  const forbiddenDescriptors = forbiddenNames.map(name => [
    name,
    Object.getOwnPropertyDescriptor(prototype, name),
  ]);
  let loadCalls = 0;
  let existingOnlyAccepted = false;
  let mutationCalls = 0;
  Object.defineProperty(prototype, 'load', {
    ...loadDescriptor,
    value: async function (...args) {
      loadCalls += 1;
      existingOnlyAccepted = this.existingOnly === true &&
        this.directory === value.journalDirectory &&
        this.allowedRoot === value.runDirectory &&
        this.maxRecords === 1 && this.maxFileBytes === 256 * 1024;
      return Reflect.apply(loadDescriptor.value, this, args);
    },
  });
  for (const [name, descriptor] of forbiddenDescriptors) {
    Object.defineProperty(prototype, name, {
      ...descriptor,
      value() {
        mutationCalls += 1;
        throw new Error('forbidden mutation');
      },
    });
  }
  try {
    assert.deepEqual(
      await inspectZenonExactHashRecoveryRetainedTransition(
        inspectionOptions(value),
        expectation,
      ),
      expectedInspection('PRIOR_STATE_PRESENT'),
    );
  } finally {
    Object.defineProperty(prototype, 'load', loadDescriptor);
    for (const [name, descriptor] of forbiddenDescriptors) {
      Object.defineProperty(prototype, name, descriptor);
    }
  }
  assert.equal(loadCalls, 1);
  assert.equal(existingOnlyAccepted, true);
  assert.equal(mutationCalls, 0);
});
