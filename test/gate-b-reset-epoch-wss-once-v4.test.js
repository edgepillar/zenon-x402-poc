import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    checkpoints: [],
    observations: [],
    paymentAttempts: 0,
    publications: 0,
    signingAttempts: 0,
    validations: 0,
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
      effects.signingAttempts += 1;
      effects.paymentAttempts += 1;
      const prepared = preparedPayment(context);
      return options.prepareMutation?.(prepared, context) ?? prepared;
    },
    async validateFacilitator(context) {
      assert.equal(Object.isFrozen(context), true);
      effects.validations += 1;
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

test('one injected-fake v4 run prepares once, validates once, and blocks publication', async t => {
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
  assert.equal(effects.signingAttempts, 1);
  assert.equal(effects.paymentAttempts, 1);
  assert.equal(effects.validations, 1);
  assert.equal(effects.publications, 0);
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
  const fakes = {
    ...offlineFakes(fixture.bound, effects),
    async publishPayment() {
      effects.publications += 1;
    },
  };
  assert.throws(() => createRunner(fixture, journal, fakes));
  assert.deepEqual(effects, createEffects());
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

test('an injected interruption after preparation arming permanently blocks signing retry', async t => {
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
  assert.equal(effects.signingAttempts, 0);
  assert.equal(effects.paymentAttempts, 0);
  assert.equal(effects.publications, 0);

  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects),
  ).execute());
  assert.equal(effects.signingAttempts, 0);
  assert.equal(effects.paymentAttempts, 0);
  assert.equal(effects.validations, 0);
  assert.equal(effects.publications, 0);
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
  assert.equal(effects.signingAttempts, 1);
  assert.equal(effects.paymentAttempts, 1);
  assert.equal(effects.validations, 0);

  const resumed = createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects),
  );
  assert.deepEqual(await resumed.execute(),
    GATE_B_RESET_EPOCH_WSS_ONCE_RESULT_V4);
  assert.equal(effects.signingAttempts, 1);
  assert.equal(effects.paymentAttempts, 1);
  assert.equal(effects.validations, 1);
  assert.equal(effects.publications, 0);
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
  assert.equal(effects.signingAttempts, 1);
  assert.equal(effects.validations, 0);

  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects),
  ).execute());
  assert.equal(effects.signingAttempts, 1);
  assert.equal(effects.paymentAttempts, 1);
  assert.equal(effects.validations, 0);
  assert.equal(effects.publications, 0);
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
  assert.equal(effects.signingAttempts, 1);
  assert.equal(effects.validations, 1);

  assert.deepEqual(await createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects),
  ).execute(), GATE_B_RESET_EPOCH_WSS_ONCE_RESULT_V4);
  assert.equal(effects.signingAttempts, 1);
  assert.equal(effects.paymentAttempts, 1);
  assert.equal(effects.validations, 1);
  assert.equal(effects.publications, 0);
});

test('UNKNOWN submission is terminal and never prepares, validates, or publishes again', async t => {
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
  assert.equal(effects.publications, 0);
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
  assert.equal(effects.signingAttempts, 1);
  assert.equal(effects.validations, 0);

  assert.deepEqual(await createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects),
  ).execute(), GATE_B_RESET_EPOCH_WSS_ONCE_RESULT_V4);
  assert.equal(effects.signingAttempts, 1);
  assert.equal(effects.paymentAttempts, 1);
  assert.equal(effects.validations, 1);
  assert.equal(effects.publications, 0);
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
  assert.equal(effects.signingAttempts, 1);
  assert.equal(effects.paymentAttempts, 1);

  await assertSanitizedRunnerFailure(createRunner(
    fixture,
    journal,
    offlineFakes(fixture.bound, effects),
  ).execute());
  assert.equal(effects.signingAttempts, 1);
  assert.equal(effects.paymentAttempts, 1);
  assert.equal(effects.validations, 0);
  assert.equal(effects.publications, 0);
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

test('PREPARATION_ARMED survives process death and a fresh process cannot prepare or sign again', async t => {
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
  assert.equal(effects.signingAttempts, 0);
  assert.equal(effects.paymentAttempts, 0);
  assert.equal(effects.validations, 1);
  assert.equal(effects.publications, 0);
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
  assert.equal(effects.signingAttempts, 1);
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

test('mixed epoch artifacts reject before hostile fake dependencies are inspected', t => {
  const fixture = createArtifactFixture();
  const { journal } = durableJournal(t, fixture);
  const parsed = JSON.parse(fixture.configurationBytes.toString('utf8'));
  parsed.policySelection = priorEpochSelection();
  parsed.executionBinding.policySelection = priorEpochSelection();
  const staleBytes = Buffer.from(`${canonicalJson(parsed)}\n`, 'utf8');
  const traps = [];
  const hostile = new Proxy({}, {
    get() { traps.push('get'); },
    getOwnPropertyDescriptor() { traps.push('descriptor'); },
    getPrototypeOf() { traps.push('prototype'); },
    ownKeys() { traps.push('keys'); },
  });
  assert.throws(() => createGateBResetEpochWssOnceRunnerV4({
    authorization: fixture.authorization,
    configurationBytes: staleBytes,
    journal,
    offlineFakes: hostile,
    review: fixture.review,
  }));
  assert.deepEqual(traps, []);
});

test('v4 remains source-only, default-off, and disconnected from every legacy entry root', () => {
  const moduleNames = [
    'gate-b-reset-epoch-wss-once-artifacts-v4.js',
    'gate-b-reset-epoch-wss-once-journal-v4.js',
    'gate-b-reset-epoch-wss-once-runner-v4.js',
  ];
  const sources = moduleNames.map(name => readFileSync(
    new URL(`../src/${name}`, import.meta.url),
    'utf8',
  ));
  for (const source of sources) {
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

  const legacyRoots = [
    '../src/gate-b-operator-front-end.js',
    '../src/buyer-cli.js',
    '../src/server-cli.js',
    '../src/demo.js',
    '../src/live-evidence-runner.js',
  ];
  for (const path of legacyRoots) {
    assert.equal(
      readFileSync(new URL(path, import.meta.url), 'utf8')
        .includes('gate-b-reset-epoch-wss-once'),
      false,
    );
  }
  const packageJson = JSON.parse(readFileSync(
    new URL('../package.json', import.meta.url),
    'utf8',
  ));
  assert.equal(
    Object.values(packageJson.scripts).some(value =>
      value.includes('gate-b-reset-epoch-wss-once')),
    false,
  );
});
