import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../src/canonical.js';
import {
  GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4,
  GATE_B_RESET_EPOCH_WSS_ONCE_MODE_V4,
  GATE_B_RESET_EPOCH_WSS_ONCE_STATUS_V4,
  GATE_B_RESET_EPOCH_WSS_ONCE_WORKSPACE_FAMILY_V4,
  bindGateBResetEpochWssOnceArtifactsV4,
  createGateBResetEpochWssOnceAuthorizationV4,
  createGateBResetEpochWssOnceConfigurationV4,
  parseGateBResetEpochWssOnceConfigurationV4,
  reviewGateBResetEpochWssOnceConfigurationV4,
  serializeGateBResetEpochWssOnceConfigurationV4,
} from '../src/gate-b-reset-epoch-wss-once-artifacts-v4.js';
import {
  GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_FILE_V4,
  GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4,
  armGateBResetEpochWssOncePreparationV4,
  closeGateBResetEpochWssOnceJournalV4,
  createGateBResetEpochWssOnceJournalV4,
  openGateBResetEpochWssOnceJournalV4,
  reconcileGateBResetEpochWssOnceUnknownV4,
  snapshotGateBResetEpochWssOnceJournalV4,
} from '../src/gate-b-reset-epoch-wss-once-journal-v4.js';
import {
  GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4,
  GATE_B_RESET_EPOCH_WSS_ONCE_OBSERVATION_STAGE_V4,
  GATE_B_RESET_EPOCH_WSS_ONCE_RESULT_V4,
  createGateBResetEpochWssOnceRunnerV4,
} from '../src/gate-b-reset-epoch-wss-once-runner-v4.js';
import {
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROVENANCE,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
} from '../src/zenon/operator-trusted-testnet-profile.js';

const RUNNER_ERROR = 'gate_b_reset_epoch_wss_once_runner_v4_invalid';
const JOURNAL_CHILD = fileURLToPath(new URL(
  '../test-support/gate-b-reset-epoch-wss-once-v4-child.js',
  import.meta.url,
));
let workspaceSequence = 0;

function resetEpochSelection(overrides = {}) {
  return {
    eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
    liveAcknowledgement: TESTNET_LIVE_ACKNOWLEDGEMENT,
    operatorTrustAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
    wssAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
    ...overrides,
  };
}

function priorEpochSelection() {
  return {
    eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_EVENT_ID,
    liveAcknowledgement: TESTNET_LIVE_ACKNOWLEDGEMENT,
    operatorTrustAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME,
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT,
    wssAcknowledgement: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ACKNOWLEDGEMENT,
  };
}

function frontier(overrides = {}) {
  return {
    chainIdentifier:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE.chainIdentifier,
    hash: 'ab'.repeat(32),
    height:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROVENANCE
        .dynamicPlasmaEnforcementHeight + 1,
    nextFusionPrice: 1200,
    nextWorkPrice: 1100,
    version: 2,
    ...overrides,
  };
}

function pricingObservation(overrides = {}) {
  const beforeFrontier = overrides.beforeFrontier ?? frontier();
  return {
    afterFrontier: overrides.afterFrontier ?? { ...beforeFrontier },
    beforeFrontier,
    chainProfile: overrides.chainProfile ?? {
      ...PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
    },
    rpcObservation: overrides.rpcObservation ?? {
      availablePlasma: 0,
      basePlasma: 10,
      requiredDifficulty: 16500,
    },
  };
}

function configurationInput(overrides = {}) {
  workspaceSequence += 1;
  return {
    paymentRequest: {
      amount: '1',
      asset: 'synthetic-asset',
      payTo: 'synthetic-payee',
      requestId: `offline-request-${workspaceSequence}`,
      resource: 'https://offline.invalid/protected',
    },
    policySelection: resetEpochSelection(),
    pricingObservation: pricingObservation(),
    schemaVersion: 4,
    workspace: {
      generation: `offline-workspace-${workspaceSequence}`,
      workspaceFamily: GATE_B_RESET_EPOCH_WSS_ONCE_WORKSPACE_FAMILY_V4,
    },
    ...overrides,
  };
}

function createArtifactFixture(input = configurationInput()) {
  const configuration = createGateBResetEpochWssOnceConfigurationV4(input);
  const configurationBytes =
    serializeGateBResetEpochWssOnceConfigurationV4(configuration);
  const review = reviewGateBResetEpochWssOnceConfigurationV4(configurationBytes);
  const authorization = createGateBResetEpochWssOnceAuthorizationV4(
    configurationBytes,
    review,
  );
  const bound = bindGateBResetEpochWssOnceArtifactsV4(
    configurationBytes,
    review,
    authorization,
  );
  return { authorization, bound, configuration, configurationBytes, review };
}

function createEffects() {
  return {
    buyerPreparationCalls: 0,
    checkpoints: [],
    facilitatorValidationCalls: 0,
    observations: [],
  };
}

function preparedPayment(context, overrides = {}) {
  return {
    buyerPreparationVersion: 4,
    executionBinding: context.executionBinding,
    paymentId: 'offline-payment-v4-001',
    payer: 'synthetic-payer',
    requestId: context.paymentRequest.requestId,
    state: 'BUYER_PREPARED_OFFLINE_FAKE',
    submissionOutcome: 'NOT_ATTEMPTED',
    ...overrides,
  };
}

function facilitatorValidation(context, overrides = {}) {
  return {
    executionBinding: context.executionBinding,
    facilitatorValidationVersion: 4,
    paymentId: context.preparedPayment.paymentId,
    payer: context.preparedPayment.payer,
    state: 'VALIDATED_NO_SUBMISSION',
    submissionOutcome: 'NOT_ATTEMPTED',
    ...overrides,
  };
}

function samePaymentReconciliation(snapshot, overrides = {}) {
  return {
    executionBinding: snapshot.executionBinding,
    paymentId: snapshot.preparedPayment.paymentId,
    payer: snapshot.preparedPayment.payer,
    reconciliationVersion: 4,
    state: 'SAME_PAYMENT_RECONCILED_OFFLINE_FAKE',
    submissionOutcome: 'RESOLVED_WITHOUT_PUBLICATION_AUTHORITY',
    ...overrides,
  };
}

function offlineFakes(artifacts, effects, options = {}) {
  let interrupted = false;
  return {
    async checkpoint(name) {
      effects.checkpoints.push(name);
      if (!interrupted && name === options.interruptAt) {
        interrupted = true;
        throw new Error('injected interruption');
      }
    },
    async observeBinding(context) {
      assert.equal(Object.isFrozen(context), true);
      effects.observations.push(context.stage);
      const executionBinding = options.observationBinding?.(context) ??
        artifacts.executionBinding;
      return {
        executionBinding,
        observationVersion: 4,
        stage: context.stage,
      };
    },
    async prepareBuyerPayment(context) {
      assert.equal(Object.isFrozen(context), true);
      effects.buyerPreparationCalls += 1;
      const prepared = preparedPayment(context);
      return options.prepareMutation?.(prepared, context) ?? prepared;
    },
    async validateFacilitator(context) {
      assert.equal(Object.isFrozen(context), true);
      effects.facilitatorValidationCalls += 1;
      const validation = facilitatorValidation(context);
      return options.validationMutation?.(validation, context) ?? validation;
    },
  };
}

function createRunner(fixture, journal, fakes) {
  return createGateBResetEpochWssOnceRunnerV4({
    authorization: fixture.authorization,
    configurationBytes: fixture.configurationBytes,
    journal,
    offlineFakes: fakes,
    review: fixture.review,
  });
}

function journalOptions(fixture, workspaceRoot, testHooks) {
  const options = {
    authorization: fixture.authorization,
    configurationBytes: fixture.configurationBytes,
    review: fixture.review,
    workspaceRoot,
  };
  if (testHooks !== undefined) options.testHooks = testHooks;
  return options;
}

function privateJournalWorkspace(t) {
  const workspaceRoot = realpathSync(mkdtempSync(join(
    realpathSync(tmpdir()),
    'gate-b-reset-epoch-wss-once-v4-',
  )));
  chmodSync(workspaceRoot, 0o700);
  const journals = [];
  const track = journal => {
    journals.push(journal);
    return journal;
  };
  t.after(() => {
    for (let index = journals.length - 1; index >= 0; index -= 1) {
      try { closeGateBResetEpochWssOnceJournalV4(journals[index]); } catch {}
    }
    rmSync(workspaceRoot, { force: true, recursive: true });
  });
  return {
    close: closeGateBResetEpochWssOnceJournalV4,
    track,
    workspaceRoot,
  };
}

function durableJournal(t, fixture, testHooks) {
  const boundary = privateJournalWorkspace(t);
  const journal = boundary.track(createGateBResetEpochWssOnceJournalV4(
    journalOptions(fixture, boundary.workspaceRoot, testHooks),
  ));
  return {
    ...boundary,
    journal,
    open(hooks) {
      return boundary.track(openGateBResetEpochWssOnceJournalV4(
        journalOptions(fixture, boundary.workspaceRoot, hooks),
      ));
    },
  };
}

function journalChildInput(fixture, workspaceRoot) {
  return JSON.stringify({
    authorization: fixture.authorization,
    configurationBase64: fixture.configurationBytes.toString('base64'),
    review: fixture.review,
    workspaceRoot,
  });
}

function runJournalChild(mode, fixture, workspaceRoot) {
  const result = spawnSync(process.execPath, [JOURNAL_CHILD, mode], {
    encoding: 'utf8',
    env: {},
    input: journalChildInput(fixture, workspaceRoot),
    maxBuffer: 64 * 1024,
    timeout: 10_000,
  });
  return Object.freeze({
    signal: result.signal,
    status: result.status,
    stderrEmpty: result.stderr === '',
    stdout: result.stdout,
  });
}

function assertSanitizedRunnerFailure(promise) {
  return assert.rejects(promise, error => {
    assert.equal(error?.name, 'GateBResetEpochWssOnceRunnerV4Error');
    assert.equal(error?.code, RUNNER_ERROR);
    assert.equal(error?.message, RUNNER_ERROR);
    assert.equal(error?.stack, undefined);
    assert.equal(error?.cause, undefined);
    return true;
  });
}

function journalPath(workspaceRoot) {
  return join(workspaceRoot, GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_FILE_V4);
}

function regularFileSnapshot(path) {
  const stats = statSync(path, { bigint: true });
  assert.equal(stats.isFile(), true);
  return {
    bytes: Buffer.from(readFileSync(path)),
    identity: { device: stats.dev, inode: stats.ino },
    links: stats.nlink,
    mode: stats.mode,
  };
}

function symbolicLinkSnapshot(path) {
  const stats = lstatSync(path, { bigint: true });
  assert.equal(stats.isSymbolicLink(), true);
  return {
    identity: { device: stats.dev, inode: stats.ino },
    links: stats.nlink,
    mode: stats.mode,
    target: readlinkSync(path),
  };
}

function assertRegularFileUnchanged(path, before) {
  assert.deepEqual(regularFileSnapshot(path), before);
}

function productionJavaScriptPaths(directory) {
  const paths = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...productionJavaScriptPaths(path));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      paths.push(path);
    }
  }
  return paths.sort();
}

function mutateClosedJournalDatabase(workspaceRoot, mutation) {
  const database = new DatabaseSync(journalPath(workspaceRoot));
  try {
    mutation(database);
  } finally {
    database.close();
  }
}

function assertJournalOpenFailure(fixture, workspaceRoot, expectedCode) {
  let unexpectedlyOpened;
  try {
    assert.throws(() => {
      unexpectedlyOpened = openGateBResetEpochWssOnceJournalV4(
        journalOptions(fixture, workspaceRoot),
      );
    }, error => {
      assert.equal(error?.code, expectedCode);
      assert.equal(error?.stack, undefined);
      return true;
    });
  } finally {
    if (unexpectedlyOpened) {
      closeGateBResetEpochWssOnceJournalV4(unexpectedlyOpened);
    }
  }
}

test('v4 binds the exact reset epoch, WSS endpoint, chain, and DP quote across every layer', t => {
  const fixture = createArtifactFixture();
  const boundary = durableJournal(t, fixture);
  const { journal } = boundary;
  const journalState = snapshotGateBResetEpochWssOnceJournalV4(journal);

  assert.equal(fixture.configuration.artifactFamily,
    GATE_B_RESET_EPOCH_WSS_ONCE_ARTIFACT_FAMILY_V4);
  assert.equal(fixture.configuration.mode,
    GATE_B_RESET_EPOCH_WSS_ONCE_MODE_V4);
  assert.equal(fixture.configuration.status,
    GATE_B_RESET_EPOCH_WSS_ONCE_STATUS_V4.CONFIGURED);
  assert.equal(fixture.authorization.offlineFakeExecutionAuthorized, true);
  assert.equal(fixture.authorization.liveRunAuthorized, false);
  assert.equal(fixture.authorization.publicationAuthorized, false);
  assert.equal(journalState.phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.EMPTY);
  for (const value of [
    fixture.configuration.executionBinding,
    fixture.review.executionBinding,
    fixture.authorization.executionBinding,
    journalState.executionBinding,
  ]) {
    assert.deepEqual(value, fixture.bound.executionBinding);
  }
  assert.equal(fixture.review.configurationDigest,
    fixture.authorization.configurationDigest);
  assert.equal(fixture.review.configurationDigest,
    journalState.configurationDigest);
  assert.equal(fixture.bound.executionBinding.dynamicPlasma.frontier.version, 2);
  assert.equal(
    fixture.bound.executionBinding.dynamicPlasma.frontier.height >
      fixture.bound.executionBinding.dynamicPlasma.enforcementHeight,
    true,
  );
  assert.equal(
    fixture.bound.executionBinding.dynamicPlasma.quote.pricingMode,
    'FUSION_AND_POW',
  );
  assert.equal(Object.isFrozen(journalState.executionBinding), true);
  assert.throws(() => createGateBResetEpochWssOnceJournalV4(
    journalOptions(fixture, boundary.workspaceRoot),
  ));
});

test('v4 configuration rejects stale, mixed, drifting, underpriced, and legacy workspace input', () => {
  const reset = resetEpochSelection();
  const prior = priorEpochSelection();
  const mixed = Object.entries(prior)
    .filter(([field, value]) => reset[field] !== value)
    .map(([field, value]) => resetEpochSelection({ [field]: value }));
  for (const policySelection of [prior, ...mixed]) {
    assert.throws(() => createGateBResetEpochWssOnceConfigurationV4(
      configurationInput({ policySelection }),
    ));
  }

  const enforcementHeight =
    PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROVENANCE
      .dynamicPlasmaEnforcementHeight;
  const invalidPricing = [
    pricingObservation({
      chainProfile: {
        ...PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
        chainIdentifier: '1',
      },
    }),
    pricingObservation({
      beforeFrontier: frontier({ height: enforcementHeight }),
    }),
    pricingObservation({
      beforeFrontier: frontier({ version: 1 }),
    }),
    pricingObservation({
      beforeFrontier: frontier({ nextFusionPrice: 0 }),
    }),
    pricingObservation({
      afterFrontier: frontier({ hash: 'cd'.repeat(32) }),
    }),
    pricingObservation({
      rpcObservation: {
        availablePlasma: 0,
        basePlasma: 10,
        requiredDifficulty: 16501,
      },
    }),
  ];
  for (const candidate of invalidPricing) {
    assert.throws(() => createGateBResetEpochWssOnceConfigurationV4(
      configurationInput({ pricingObservation: candidate }),
    ));
  }
  assert.throws(() => createGateBResetEpochWssOnceConfigurationV4(
    configurationInput({
      workspace: {
        generation: 'offline-workspace-legacy',
        workspaceFamily: 'gate-b-reset-epoch-pre-wallet-offline-v3',
      },
    }),
  ));
});

test('v4 artifacts reject family, version, review, and authorization mixing', () => {
  const fixture = createArtifactFixture();
  const parsed = JSON.parse(fixture.configurationBytes.toString('utf8'));
  const mutations = [
    { ...parsed, artifactFamily: 'gate-b-current-testnet-wss-v2' },
    { ...parsed, configurationVersion: 3 },
    { ...parsed, liveRunAuthorized: true },
    { ...parsed, publicationAuthorized: true },
  ];
  for (const mutation of mutations) {
    assert.throws(() => parseGateBResetEpochWssOnceConfigurationV4(
      Buffer.from(`${canonicalJson(mutation)}\n`, 'utf8'),
    ));
  }

  const other = createArtifactFixture();
  assert.throws(() => bindGateBResetEpochWssOnceArtifactsV4(
    fixture.configurationBytes,
    other.review,
    fixture.authorization,
  ));
  assert.throws(() => bindGateBResetEpochWssOnceArtifactsV4(
    fixture.configurationBytes,
    fixture.review,
    other.authorization,
  ));
});

test('one v4 run calls injected buyer and facilitator fakes once and records publication blocked', async t => {
  const fixture = createArtifactFixture();
  const { journal } = durableJournal(t, fixture);
  const effects = createEffects();
  const fakes = offlineFakes(fixture.bound, effects);
  const runner = createRunner(fixture, journal, fakes);

  assert.deepEqual(await runner.execute(), GATE_B_RESET_EPOCH_WSS_ONCE_RESULT_V4);
  assert.deepEqual(effects.observations, [
    GATE_B_RESET_EPOCH_WSS_ONCE_OBSERVATION_STAGE_V4.BUYER_PREPARATION,
    GATE_B_RESET_EPOCH_WSS_ONCE_OBSERVATION_STAGE_V4.FACILITATOR_VALIDATION,
  ]);
  assert.equal(effects.buyerPreparationCalls, 1);
  assert.equal(effects.facilitatorValidationCalls, 1);
  assert.deepEqual(effects.checkpoints, [
    GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4.PREPARATION_ARMED,
    GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4.PAYMENT_PREPARED,
    GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4.FACILITATOR_VALIDATION_ARMED,
    GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4.FACILITATOR_VALIDATED,
    GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4.PUBLICATION_BLOCKED,
  ]);
  const terminal = snapshotGateBResetEpochWssOnceJournalV4(journal);
  assert.equal(terminal.phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PUBLICATION_BLOCKED);
  assert.equal(terminal.liveRunAuthorized, false);
  assert.equal(terminal.publicationAuthorized, false);

  const before = structuredClone(effects);
  await assertSanitizedRunnerFailure(runner.execute());
  await assertSanitizedRunnerFailure(
    createRunner(fixture, journal, fakes).execute(),
  );
  assert.deepEqual(effects, before);
});

test('runner rejects a publication-capable dependency surface before any fake effect', t => {
  const fixture = createArtifactFixture();
  const { journal } = durableJournal(t, fixture);
  const effects = createEffects();
  let injectedPublicationCallbackCalls = 0;
  const fakes = {
    ...offlineFakes(fixture.bound, effects),
    async publishPayment() {
      injectedPublicationCallbackCalls += 1;
    },
  };
  assert.throws(() => createRunner(fixture, journal, fakes));
  assert.deepEqual(effects, createEffects());
  assert.equal(injectedPublicationCallbackCalls, 0);
});

test('any runner invocation consumes its one-use capability before argument parsing', async t => {
  const fixture = createArtifactFixture();
  const { journal } = durableJournal(t, fixture);
  const effects = createEffects();
  const runner = createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects),
  );
  await assertSanitizedRunnerFailure(runner.execute('unexpected'));
  await assertSanitizedRunnerFailure(runner.execute());
  assert.deepEqual(effects, createEffects());
  assert.equal(snapshotGateBResetEpochWssOnceJournalV4(journal).phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.EMPTY);
});

test('an interruption after preparation arming prevents another injected buyer call', async t => {
  const fixture = createArtifactFixture();
  const { journal } = durableJournal(t, fixture);
  const effects = createEffects();
  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects, {
      interruptAt: GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4.PREPARATION_ARMED,
    }),
  ).execute());
  assert.equal(snapshotGateBResetEpochWssOnceJournalV4(journal).phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PREPARATION_ARMED);
  assert.equal(effects.buyerPreparationCalls, 0);

  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects),
  ).execute());
  assert.equal(effects.buyerPreparationCalls, 0);
  assert.equal(effects.facilitatorValidationCalls, 0);
});

test('an injected interruption after durable payment recording resumes the exact payment without preparing twice', async t => {
  const fixture = createArtifactFixture();
  const { journal } = durableJournal(t, fixture);
  const effects = createEffects();
  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects, {
      interruptAt: GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4.PAYMENT_PREPARED,
    }),
  ).execute());
  assert.equal(snapshotGateBResetEpochWssOnceJournalV4(journal).phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PAYMENT_PREPARED);
  assert.equal(effects.buyerPreparationCalls, 1);
  assert.equal(effects.facilitatorValidationCalls, 0);

  const resumed = createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects),
  );
  assert.deepEqual(await resumed.execute(),
    GATE_B_RESET_EPOCH_WSS_ONCE_RESULT_V4);
  assert.equal(effects.buyerPreparationCalls, 1);
  assert.equal(effects.facilitatorValidationCalls, 1);
});

test('an injected interruption in the validation ambiguity window blocks all retry effects', async t => {
  const fixture = createArtifactFixture();
  const { journal } = durableJournal(t, fixture);
  const effects = createEffects();
  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects, {
      interruptAt:
        GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4.FACILITATOR_VALIDATION_ARMED,
    }),
  ).execute());
  assert.equal(snapshotGateBResetEpochWssOnceJournalV4(journal).phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4
      .FACILITATOR_VALIDATION_ARMED);
  assert.equal(effects.buyerPreparationCalls, 1);
  assert.equal(effects.facilitatorValidationCalls, 0);

  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects),
  ).execute());
  assert.equal(effects.buyerPreparationCalls, 1);
  assert.equal(effects.facilitatorValidationCalls, 0);
});

test('an injected interruption after durable validation recording resumes only the publication-block decision', async t => {
  const fixture = createArtifactFixture();
  const { journal } = durableJournal(t, fixture);
  const effects = createEffects();
  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects, {
      interruptAt:
        GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4.FACILITATOR_VALIDATED,
    }),
  ).execute());
  assert.equal(snapshotGateBResetEpochWssOnceJournalV4(journal).phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.FACILITATOR_VALIDATED);
  assert.equal(effects.buyerPreparationCalls, 1);
  assert.equal(effects.facilitatorValidationCalls, 1);

  assert.deepEqual(await createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects),
  ).execute(), GATE_B_RESET_EPOCH_WSS_ONCE_RESULT_V4);
  assert.equal(effects.buyerPreparationCalls, 1);
  assert.equal(effects.facilitatorValidationCalls, 1);
});

test('UNKNOWN is terminal before any later injected observer, buyer, or facilitator call', async t => {
  const fixture = createArtifactFixture();
  const { journal } = durableJournal(t, fixture);
  const effects = createEffects();
  const unknownFakes = offlineFakes(fixture.bound, effects, {
    validationMutation(validation) {
      return {
        ...validation,
        state: 'SUBMISSION_OUTCOME_UNKNOWN',
        submissionOutcome: 'UNKNOWN',
      };
    },
  });
  await assertSanitizedRunnerFailure(
    createRunner(fixture, journal, unknownFakes).execute(),
  );
  assert.equal(snapshotGateBResetEpochWssOnceJournalV4(journal).phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.SUBMISSION_OUTCOME_UNKNOWN);
  const before = structuredClone(effects);
  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects),
  ).execute());
  assert.deepEqual(effects, before);
});

test('frontier drift after durable payment recording fails closed and a later continuation reuses the same payment', async t => {
  const fixture = createArtifactFixture();
  const { journal } = durableJournal(t, fixture);
  const effects = createEffects();
  const drifted = structuredClone(fixture.bound.executionBinding);
  drifted.dynamicPlasma.frontier.hash = 'cd'.repeat(32);
  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects, {
      observationBinding(context) {
        return context.stage ===
          GATE_B_RESET_EPOCH_WSS_ONCE_OBSERVATION_STAGE_V4.FACILITATOR_VALIDATION
          ? drifted
          : fixture.bound.executionBinding;
      },
    }),
  ).execute());
  assert.equal(snapshotGateBResetEpochWssOnceJournalV4(journal).phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PAYMENT_PREPARED);
  assert.equal(effects.buyerPreparationCalls, 1);
  assert.equal(effects.facilitatorValidationCalls, 0);

  assert.deepEqual(await createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects),
  ).execute(), GATE_B_RESET_EPOCH_WSS_ONCE_RESULT_V4);
  assert.equal(effects.buyerPreparationCalls, 1);
  assert.equal(effects.facilitatorValidationCalls, 1);
});

test('buyer quote mismatch consumes the armed workspace and cannot trigger a second preparation', async t => {
  const fixture = createArtifactFixture();
  const { journal } = durableJournal(t, fixture);
  const effects = createEffects();
  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects, {
      prepareMutation(prepared) {
        const executionBinding = structuredClone(prepared.executionBinding);
        executionBinding.dynamicPlasma.quote.requiredDifficulty += 1;
        return { ...prepared, executionBinding };
      },
    }),
  ).execute());
  assert.equal(snapshotGateBResetEpochWssOnceJournalV4(journal).phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PREPARATION_ARMED);
  assert.equal(effects.buyerPreparationCalls, 1);

  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects),
  ).execute());
  assert.equal(effects.buyerPreparationCalls, 1);
  assert.equal(effects.facilitatorValidationCalls, 0);
});

test('durable compare-and-transition rejects stale revision and preserves the monotonic revision on reopen', t => {
  const fixture = createArtifactFixture();
  const boundary = durableJournal(t, fixture);
  const initial = snapshotGateBResetEpochWssOnceJournalV4(boundary.journal);
  assert.equal(initial.revision, 0);
  const armed = armGateBResetEpochWssOncePreparationV4(
    boundary.journal,
    initial.revision,
  );
  assert.equal(armed.revision, 1);
  assert.equal(armed.phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PREPARATION_ARMED);
  assert.throws(() => armGateBResetEpochWssOncePreparationV4(
    boundary.journal,
    initial.revision,
  ));
  assert.equal(snapshotGateBResetEpochWssOnceJournalV4(
    boundary.journal,
  ).revision, 1);

  boundary.close(boundary.journal);
  const reopened = boundary.open();
  assert.equal(snapshotGateBResetEpochWssOnceJournalV4(reopened).revision, 1);
  assert.equal(snapshotGateBResetEpochWssOnceJournalV4(reopened).phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PREPARATION_ARMED);
});

test('a precommit failure rolls back without changing durable state', t => {
  const fixture = createArtifactFixture();
  let injected = false;
  const boundary = durableJournal(t, fixture, {
    beforeCommit(operation) {
      if (!injected && operation === 'armPreparation') {
        injected = true;
        throw new Error('injected precommit failure');
      }
    },
  });
  const initial = snapshotGateBResetEpochWssOnceJournalV4(boundary.journal);
  assert.throws(() => armGateBResetEpochWssOncePreparationV4(
    boundary.journal,
    initial.revision,
  ), error => {
    assert.equal(error?.code,
      'gate_b_reset_epoch_wss_once_journal_v4_transaction_failed');
    assert.equal(error?.stack, undefined);
    return true;
  });
  assert.deepEqual(
    snapshotGateBResetEpochWssOnceJournalV4(boundary.journal),
    initial,
  );
  boundary.close(boundary.journal);

  const reopened = boundary.open();
  assert.deepEqual(snapshotGateBResetEpochWssOnceJournalV4(reopened), initial);
  const armed = armGateBResetEpochWssOncePreparationV4(
    reopened,
    initial.revision,
  );
  assert.equal(armed.revision, 1);
  assert.equal(armed.phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PREPARATION_ARMED);
});

test('post-commit ambiguity quarantines the handle and fresh reopen reveals only the committed armed state', async t => {
  const fixture = createArtifactFixture();
  let injected = false;
  const boundary = durableJournal(t, fixture, {
    afterCommit(operation) {
      if (!injected && operation === 'armPreparation') {
        injected = true;
        throw new Error('injected post-commit ambiguity');
      }
    },
  });
  assert.throws(() => armGateBResetEpochWssOncePreparationV4(
    boundary.journal,
    0,
  ), error => {
    assert.equal(error?.code,
      'gate_b_reset_epoch_wss_once_journal_v4_commit_outcome_unknown');
    assert.equal(error?.stack, undefined);
    return true;
  });
  assert.throws(() => snapshotGateBResetEpochWssOnceJournalV4(
    boundary.journal,
  ));
  boundary.close(boundary.journal);

  const reopened = boundary.open();
  const persisted = snapshotGateBResetEpochWssOnceJournalV4(reopened);
  assert.equal(persisted.revision, 1);
  assert.equal(persisted.phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PREPARATION_ARMED);
  const effects = createEffects();
  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    reopened,
    offlineFakes(fixture.bound, effects),
  ).execute());
  assert.deepEqual(effects, createEffects());
});

test('PREPARATION_ARMED survives process death without a later injected buyer call', async t => {
  const fixture = createArtifactFixture();
  const boundary = privateJournalWorkspace(t);
  const crashed = runJournalChild(
    'crash-after-arm',
    fixture,
    boundary.workspaceRoot,
  );
  assert.equal(crashed.status, null);
  assert.equal(crashed.signal, 'SIGKILL');
  assert.equal(crashed.stderrEmpty, true);
  assert.equal(crashed.stdout, '');

  const reopened = boundary.track(openGateBResetEpochWssOnceJournalV4(
    journalOptions(fixture, boundary.workspaceRoot),
  ));
  const persisted = snapshotGateBResetEpochWssOnceJournalV4(reopened);
  assert.equal(persisted.revision, 1);
  assert.equal(persisted.phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PREPARATION_ARMED);
  const effects = createEffects();
  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    reopened,
    offlineFakes(fixture.bound, effects),
  ).execute());
  assert.deepEqual(effects, createEffects());
});

test('the exact prepared payment survives process death and a fresh process skips preparation', async t => {
  const fixture = createArtifactFixture();
  const boundary = privateJournalWorkspace(t);
  const crashed = runJournalChild(
    'crash-after-payment',
    fixture,
    boundary.workspaceRoot,
  );
  assert.equal(crashed.status, null);
  assert.equal(crashed.signal, 'SIGKILL');
  assert.equal(crashed.stderrEmpty, true);
  assert.equal(crashed.stdout, '');

  const reopened = boundary.track(openGateBResetEpochWssOnceJournalV4(
    journalOptions(fixture, boundary.workspaceRoot),
  ));
  const persisted = snapshotGateBResetEpochWssOnceJournalV4(reopened);
  assert.equal(persisted.revision, 2);
  assert.equal(persisted.phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PAYMENT_PREPARED);
  assert.deepEqual(persisted.preparedPayment, preparedPayment({
    executionBinding: fixture.bound.executionBinding,
    paymentRequest: fixture.bound.paymentRequest,
  }));

  const effects = createEffects();
  assert.deepEqual(await createRunner(
    fixture,
    reopened,
    offlineFakes(fixture.bound, effects, {
      validationMutation(validation, context) {
        assert.deepEqual(context.preparedPayment, persisted.preparedPayment);
        return validation;
      },
    }),
  ).execute(), GATE_B_RESET_EPOCH_WSS_ONCE_RESULT_V4);
  assert.equal(effects.buyerPreparationCalls, 0);
  assert.equal(effects.facilitatorValidationCalls, 1);
});

test('facilitator arming survives child death and blocks every injected fake on reopen', async t => {
  const fixture = createArtifactFixture();
  const boundary = privateJournalWorkspace(t);
  const crashed = runJournalChild(
    'crash-after-facilitator-arm',
    fixture,
    boundary.workspaceRoot,
  );
  assert.equal(crashed.status, null);
  assert.equal(crashed.signal, 'SIGKILL');
  assert.equal(crashed.stderrEmpty, true);
  assert.equal(crashed.stdout, '');

  const reopened = boundary.track(openGateBResetEpochWssOnceJournalV4(
    journalOptions(fixture, boundary.workspaceRoot),
  ));
  const persisted = snapshotGateBResetEpochWssOnceJournalV4(reopened);
  assert.equal(persisted.revision, 3);
  assert.equal(persisted.phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4
      .FACILITATOR_VALIDATION_ARMED);
  const effects = createEffects();
  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    reopened,
    offlineFakes(fixture.bound, effects),
  ).execute());
  assert.deepEqual(effects, createEffects());
});

test('durable facilitator validation survives real child death and resumes only publication blocking', async t => {
  const fixture = createArtifactFixture();
  const boundary = privateJournalWorkspace(t);
  const crashed = runJournalChild(
    'crash-after-facilitator-validation',
    fixture,
    boundary.workspaceRoot,
  );
  assert.equal(crashed.status, null);
  assert.equal(crashed.signal, 'SIGKILL');
  assert.equal(crashed.stderrEmpty, true);
  assert.equal(crashed.stdout, '');

  const reopened = boundary.track(openGateBResetEpochWssOnceJournalV4(
    journalOptions(fixture, boundary.workspaceRoot),
  ));
  const persisted = snapshotGateBResetEpochWssOnceJournalV4(reopened);
  assert.equal(persisted.revision, 4);
  assert.equal(persisted.phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.FACILITATOR_VALIDATED);

  const effects = createEffects();
  assert.deepEqual(await createRunner(
    fixture,
    reopened,
    offlineFakes(fixture.bound, effects),
  ).execute(), GATE_B_RESET_EPOCH_WSS_ONCE_RESULT_V4);
  assert.deepEqual(effects.observations, []);
  assert.equal(effects.buyerPreparationCalls, 0);
  assert.equal(effects.facilitatorValidationCalls, 0);
  assert.deepEqual(effects.checkpoints, [
    GATE_B_RESET_EPOCH_WSS_ONCE_CHECKPOINT_V4.PUBLICATION_BLOCKED,
  ]);
  assert.equal(snapshotGateBResetEpochWssOnceJournalV4(reopened).phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PUBLICATION_BLOCKED);
});

test('an open journal excludes a second process and releases ownership only after close', t => {
  const fixture = createArtifactFixture();
  const boundary = durableJournal(t, fixture);
  const blocked = runJournalChild(
    'probe-open',
    fixture,
    boundary.workspaceRoot,
  );
  assert.equal(blocked.status, 0);
  assert.equal(blocked.signal, null);
  assert.equal(blocked.stderrEmpty, true);
  assert.equal(blocked.stdout, 'OWNER_BUSY');

  boundary.close(boundary.journal);
  const opened = runJournalChild(
    'probe-open',
    fixture,
    boundary.workspaceRoot,
  );
  assert.equal(opened.status, 0);
  assert.equal(opened.signal, null);
  assert.equal(opened.stderrEmpty, true);
  assert.equal(opened.stdout, 'OPENED');
});

test('UNKNOWN survives reopen and only explicit exact-payment reconciliation can terminalize it', async t => {
  const fixture = createArtifactFixture();
  const boundary = durableJournal(t, fixture);
  const effects = createEffects();
  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    boundary.journal,
    offlineFakes(fixture.bound, effects, {
      validationMutation(validation) {
        return {
          ...validation,
          state: 'SUBMISSION_OUTCOME_UNKNOWN',
          submissionOutcome: 'UNKNOWN',
        };
      },
    }),
  ).execute());
  const unknown = snapshotGateBResetEpochWssOnceJournalV4(boundary.journal);
  assert.equal(unknown.phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.SUBMISSION_OUTCOME_UNKNOWN);
  assert.equal(unknown.revision, 4);
  boundary.close(boundary.journal);

  const reopened = boundary.open();
  const recovered = snapshotGateBResetEpochWssOnceJournalV4(reopened);
  assert.equal(recovered.phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.SUBMISSION_OUTCOME_UNKNOWN);
  assert.throws(() => reconcileGateBResetEpochWssOnceUnknownV4(
    reopened,
    recovered.revision,
    samePaymentReconciliation(recovered, { paymentId: 'different-payment' }),
  ));
  assert.equal(snapshotGateBResetEpochWssOnceJournalV4(reopened).revision, 4);

  const reconciled = reconcileGateBResetEpochWssOnceUnknownV4(
    reopened,
    recovered.revision,
    samePaymentReconciliation(recovered),
  );
  assert.equal(reconciled.revision, 5);
  assert.equal(reconciled.phase,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PUBLICATION_BLOCKED);
  assert.equal(reconciled.liveRunAuthorized, false);
  assert.equal(reconciled.publicationAuthorized, false);
  assert.equal(reconciled.validation.submissionOutcome, 'UNKNOWN');
  assert.equal(reconciled.reconciliation.paymentId,
    recovered.preparedPayment.paymentId);
  boundary.close(reopened);

  const finalReopen = boundary.open();
  assert.deepEqual(
    snapshotGateBResetEpochWssOnceJournalV4(finalReopen),
    reconciled,
  );
});

test('open binds the exact configuration and workspace without rewriting on mismatch', t => {
  const fixture = createArtifactFixture();
  const boundary = durableJournal(t, fixture);
  armGateBResetEpochWssOncePreparationV4(boundary.journal, 0);
  boundary.close(boundary.journal);
  const other = createArtifactFixture();
  assert.throws(() => openGateBResetEpochWssOnceJournalV4(
    journalOptions(other, boundary.workspaceRoot),
  ));
  const reopened = boundary.open();
  const persisted = snapshotGateBResetEpochWssOnceJournalV4(reopened);
  assert.equal(persisted.revision, 1);
  assert.equal(persisted.configurationDigest, fixture.bound.configurationDigest);
  assert.deepEqual(persisted.workspace, fixture.bound.workspace);
});

test('a symbolic-link journal is rejected before SQLite open', t => {
  const fixture = createArtifactFixture();
  const boundary = durableJournal(t, fixture);
  boundary.close(boundary.journal);
  const retained = privateJournalWorkspace(t);
  const databasePath = journalPath(boundary.workspaceRoot);
  const retainedPath = join(retained.workspaceRoot, 'retained.sqlite3');
  renameSync(databasePath, retainedPath);
  symlinkSync(retainedPath, databasePath);

  const beforeLink = symbolicLinkSnapshot(databasePath);
  const beforeTarget = regularFileSnapshot(retainedPath);
  assertJournalOpenFailure(
    fixture,
    boundary.workspaceRoot,
    'gate_b_reset_epoch_wss_once_journal_v4_unsafe_file',
  );
  assert.deepEqual(symbolicLinkSnapshot(databasePath), beforeLink);
  assertRegularFileUnchanged(retainedPath, beforeTarget);
});

test('a hard-linked journal is rejected without changing either link', t => {
  const fixture = createArtifactFixture();
  const boundary = durableJournal(t, fixture);
  boundary.close(boundary.journal);
  const retained = privateJournalWorkspace(t);
  const databasePath = journalPath(boundary.workspaceRoot);
  const linkedPath = join(retained.workspaceRoot, 'linked.sqlite3');
  linkSync(databasePath, linkedPath);
  const beforeDatabase = regularFileSnapshot(databasePath);
  const beforeLinked = regularFileSnapshot(linkedPath);
  assert.deepEqual(beforeDatabase.identity, beforeLinked.identity);

  assertJournalOpenFailure(
    fixture,
    boundary.workspaceRoot,
    'gate_b_reset_epoch_wss_once_journal_v4_unsafe_file',
  );
  assertRegularFileUnchanged(databasePath, beforeDatabase);
  assertRegularFileUnchanged(linkedPath, beforeLinked);
});

test('journal mode drift is rejected without repair', t => {
  const fixture = createArtifactFixture();
  const boundary = durableJournal(t, fixture);
  boundary.close(boundary.journal);
  const databasePath = journalPath(boundary.workspaceRoot);
  chmodSync(databasePath, 0o640);
  const drifted = regularFileSnapshot(databasePath);

  assertJournalOpenFailure(
    fixture,
    boundary.workspaceRoot,
    'gate_b_reset_epoch_wss_once_journal_v4_unsafe_file',
  );
  assertRegularFileUnchanged(databasePath, drifted);
});

test('an active journal rejects same-byte inode replacement and quarantines', t => {
  const fixture = createArtifactFixture();
  const boundary = durableJournal(t, fixture);
  const retained = privateJournalWorkspace(t);
  const databasePath = journalPath(boundary.workspaceRoot);
  const originalPath = join(retained.workspaceRoot, 'original.sqlite3');
  const bytes = Buffer.from(readFileSync(databasePath));
  renameSync(databasePath, originalPath);
  writeFileSync(databasePath, bytes, { flag: 'wx', mode: 0o600 });
  chmodSync(databasePath, 0o600);
  const beforeReplacement = regularFileSnapshot(databasePath);
  const beforeOriginal = regularFileSnapshot(originalPath);

  assert.throws(() => snapshotGateBResetEpochWssOnceJournalV4(
    boundary.journal,
  ), error => {
    assert.equal(error?.code,
      'gate_b_reset_epoch_wss_once_journal_v4_quarantined');
    assert.equal(error?.stack, undefined);
    return true;
  });
  assertRegularFileUnchanged(databasePath, beforeReplacement);
  assertRegularFileUnchanged(originalPath, beforeOriginal);
});

test('unexpected SQLite sidecars and unrelated leaves are rejected unchanged', t => {
  const unexpectedNames = [
    `${GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_FILE_V4}-wal`,
    'unexpected-artifact.json',
  ];
  for (const name of unexpectedNames) {
    const fixture = createArtifactFixture();
    const boundary = durableJournal(t, fixture);
    boundary.close(boundary.journal);
    const unexpectedPath = join(boundary.workspaceRoot, name);
    const sentinel = Buffer.from('unexpected-v4-residue', 'utf8');
    writeFileSync(unexpectedPath, sentinel, { flag: 'wx', mode: 0o600 });
    chmodSync(unexpectedPath, 0o600);

    assertJournalOpenFailure(
      fixture,
      boundary.workspaceRoot,
      'gate_b_reset_epoch_wss_once_journal_v4_unsafe_file',
    );
    assert.deepEqual(readFileSync(unexpectedPath), sentinel);
  }
});

test('corrupt application metadata and schema definitions are rejected', t => {
  const mutations = [
    database => database.exec('PRAGMA application_id = 0'),
    database => database.exec('PRAGMA user_version = 5'),
    database => database.exec(
      'CREATE TABLE unexpected_v4_schema(value TEXT) STRICT',
    ),
  ];
  for (const mutation of mutations) {
    const fixture = createArtifactFixture();
    const boundary = durableJournal(t, fixture);
    boundary.close(boundary.journal);
    mutateClosedJournalDatabase(boundary.workspaceRoot, mutation);
    const databasePath = journalPath(boundary.workspaceRoot);
    const corrupted = regularFileSnapshot(databasePath);
    assertJournalOpenFailure(
      fixture,
      boundary.workspaceRoot,
      'gate_b_reset_epoch_wss_once_journal_v4_schema_unsupported',
    );
    assertRegularFileUnchanged(databasePath, corrupted);
  }
});

test('a corrupt durable envelope is rejected instead of repaired', t => {
  const fixture = createArtifactFixture();
  const boundary = durableJournal(t, fixture);
  boundary.close(boundary.journal);
  mutateClosedJournalDatabase(boundary.workspaceRoot, database => {
    database.prepare(
      'UPDATE gate_b_reset_epoch_wss_once_state_v4 SET envelope=? WHERE singleton=1',
    ).run('{}');
  });
  const databasePath = journalPath(boundary.workspaceRoot);
  const corrupted = regularFileSnapshot(databasePath);
  assertJournalOpenFailure(
    fixture,
    boundary.workspaceRoot,
    'gate_b_reset_epoch_wss_once_journal_v4_corrupt',
  );
  assertRegularFileUnchanged(databasePath, corrupted);
});

test('a legacy-marked private workspace is rejected without rewrite or migration', t => {
  const fixture = createArtifactFixture();
  const boundary = privateJournalWorkspace(t);
  const legacyPath = join(
    boundary.workspaceRoot,
    'gate-b-reset-epoch-configuration-v3.json',
  );
  writeFileSync(legacyPath, 'legacy-v3-sentinel', {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  chmodSync(legacyPath, 0o600);
  assert.throws(() => createGateBResetEpochWssOnceJournalV4(
    journalOptions(fixture, boundary.workspaceRoot),
  ));
  assert.equal(readFileSync(legacyPath, 'utf8'), 'legacy-v3-sentinel');
  assert.equal(existsSync(join(
    boundary.workspaceRoot,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_FILE_V4,
  )), false);
});

test('secret-bearing prepared-payment extensions are rejected and never reach durable bytes', async t => {
  const fixture = createArtifactFixture();
  const boundary = durableJournal(t, fixture);
  const marker = 'synthetic-forbidden-private-material';
  const effects = createEffects();
  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    boundary.journal,
    offlineFakes(fixture.bound, effects, {
      prepareMutation(prepared) {
        return { ...prepared, privateKey: marker };
      },
    }),
  ).execute());
  assert.equal(effects.buyerPreparationCalls, 1);
  assert.equal(snapshotGateBResetEpochWssOnceJournalV4(
    boundary.journal,
  ).phase, GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_PHASE_V4.PREPARATION_ARMED);
  boundary.close(boundary.journal);
  const databaseBytes = readFileSync(join(
    boundary.workspaceRoot,
    GATE_B_RESET_EPOCH_WSS_ONCE_JOURNAL_FILE_V4,
  ));
  assert.equal(databaseBytes.includes(Buffer.from(marker, 'utf8')), false);
  assert.equal(databaseBytes.includes(Buffer.from(
    boundary.workspaceRoot,
    'utf8',
  )), false);
  databaseBytes.fill(0);
});

test('parser accepts the active epoch and directly rejects historical or mixed epoch bytes', () => {
  const fixture = createArtifactFixture();
  assert.deepEqual(
    parseGateBResetEpochWssOnceConfigurationV4(fixture.configurationBytes),
    fixture.configuration,
  );
  const reset = resetEpochSelection();
  const prior = priorEpochSelection();
  const selections = [
    prior,
    ...Object.entries(prior)
      .filter(([field, value]) => reset[field] !== value)
      .map(([field, value]) => resetEpochSelection({ [field]: value })),
  ];
  for (const policySelection of selections) {
    const parsed = JSON.parse(fixture.configurationBytes.toString('utf8'));
    parsed.policySelection = policySelection;
    parsed.executionBinding.policySelection = policySelection;
    const staleBytes = Buffer.from(`${canonicalJson(parsed)}\n`, 'utf8');
    assert.throws(() =>
      parseGateBResetEpochWssOnceConfigurationV4(staleBytes));
  }
});

test('v4 stays source-only across the complete production source and script graph', () => {
  const moduleNames = [
    'gate-b-reset-epoch-wss-once-artifacts-v4.js',
    'gate-b-reset-epoch-wss-once-journal-v4.js',
    'gate-b-reset-epoch-wss-once-runner-v4.js',
  ];
  const moduleRoots = moduleNames.map(name => name.slice(0, -3));
  const allowedImportRoots = new Map([
    [moduleNames[0], [
      './canonical.js',
      './zenon/dynamic-plasma-compatibility.js',
      './zenon/operator-trusted-testnet-profile.js',
      'node:crypto',
      'node:util',
    ]],
    [moduleNames[1], [
      './canonical.js',
      './gate-b-reset-epoch-wss-once-artifacts-v4.js',
      'node:crypto',
      'node:fs',
      'node:path',
      'node:sqlite',
      'node:util',
    ]],
    [moduleNames[2], [
      './canonical.js',
      './gate-b-reset-epoch-wss-once-artifacts-v4.js',
      './gate-b-reset-epoch-wss-once-journal-v4.js',
      'node:util',
    ]],
  ]);
  const staticImportPattern =
    /^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]\s*;/gm;
  const signerOrPublicationImportRoot =
    /(?:zenon-payment|live-evidence|settlement-journal|signer|signing|publication)/i;
  const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
  const productionPaths = productionJavaScriptPaths(sourceRoot);

  for (const name of moduleNames) {
    const source = readFileSync(join(sourceRoot, name), 'utf8');
    const importRoots = [...source.matchAll(staticImportPattern)]
      .map(match => match[1])
      .sort();
    assert.deepEqual(importRoots, allowedImportRoots.get(name));
    for (const importRoot of importRoots) {
      assert.doesNotMatch(importRoot, signerOrPublicationImportRoot);
    }
    assert.doesNotMatch(
      source,
      /node:(?:child_process|dns|https?|http2|net|tls|worker_threads)/,
    );
    assert.doesNotMatch(
      source,
      /znn-typescript-sdk|\.listen\s*\(|\.connect\s*\(|\bfetch\s*\(|\bWebSocket\b|publishRawTransaction|\b(?:spawn|execFile|fork)\s*\(/,
    );
    assert.doesNotMatch(
      source,
      /gate-b-(?:public-ws-inputs|quick-tunnel)|live-evidence|zenon-payment|settlement-journal/,
    );
    assert.doesNotMatch(source, /gate-b-reset-epoch-(?:artifacts|operator)-v3/);
  }

  for (const path of productionPaths) {
    if (moduleNames.includes(basename(path))) continue;
    const source = readFileSync(path, 'utf8');
    for (const root of moduleRoots) {
      assert.equal(source.includes(root), false);
    }
  }

  const packageJson = JSON.parse(readFileSync(
    new URL('../package.json', import.meta.url),
    'utf8',
  ));
  for (const script of Object.values(packageJson.scripts)) {
    assert.equal(script.includes('gate-b-reset-epoch-wss-once'), false);
    for (const root of moduleRoots) assert.equal(script.includes(root), false);
  }
});
