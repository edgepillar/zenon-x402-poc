import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as sdk from 'znn-typescript-sdk';
import { paidFetch } from '../src/buyer.js';
import { withLiveSdkOwner } from '../src/live-runtime.js';
import { ExactZenonClient } from '../src/zenon-payment.js';
import { HEADERS } from '../src/x402-wire.js';
import {
  accountBlockHashHex,
  accountBlockHashPreimage,
  sha3Hex,
} from './phase2a-account-block-preimage.js';
import {
  buildPhase2AInputs,
  PHASE2A_CHAIN_PROFILE,
  PHASE2A_NETWORK_ID,
  PHASE2A_POW_NONCE,
  PHASE2A_RPC_URL,
  withPhase2AFixtureMnemonic,
} from './phase2a-inputs.js';

// Capture provenance at project HEAD 138da9c6c0d57ffa59b56016d42365116d1682f0:
// - ExactZenonClient.createPaymentPayload(): src/zenon-payment.js:706-803.
//   Its first loadZenonDeps() call is at :732; withOwnedZenonSession() loads
//   again at :414 (normally from the cache). configuredTestnetNetworkId() is
//   evaluated at both :714 and :415. Asset lookup is at :466-478.
// - Local independent hash reconstruction: src/zenon-payment.js:209.
// - Owned runtime deadline/poison semantics: src/live-runtime.js:120-233.
// - SDK 1.0.5 singleton/public wrapper: dist/zenon.js:13-18, 58-60.
// - SDK 1.0.5 PoW-data hash, difficulty/provider, and preparation:
//   dist/utilities/block.js:44, :88, and :127.
// - SDK amount/byte encoding: dist/utilities/bytes.js:287 and :295; primitive
//   HashHeight/Address/TokenStandard encoders are pinned by their public bytes.
// These tests observe public/mutable boundaries only. They do not fabricate
// standalone hash, lexical preflight, or private owner-release trace events.

export const PHASE2A_ORACLE = Object.freeze({
  projectHead: '138da9c6c0d57ffa59b56016d42365116d1682f0',
  sdkPackage: 'znn-typescript-sdk',
  sdkVersion: '1.0.5',
  sdkIntegrity: 'sha512-+6R07O7tBNTvGw+zA7oyS+Cr+MaKHQcITO9Vz3F6zaie8tMQ7WsrbuFLmtkCJwhYQ8G+V86wIesftyAtAcxfRw==',
});

const ENVIRONMENT_KEYS = Object.freeze([
  'ZENON_LIVE_ACK',
  'ZENON_NETWORK_ID',
  'ZENON_RPC_URL',
]);
const ACCOUNT_BLOCK_FIELDS = Object.freeze([
  'version',
  'chainIdentifier',
  'blockType',
  'hash',
  'previousHash',
  'height',
  'momentumAcknowledged',
  'address',
  'toAddress',
  'amount',
  'tokenStandard',
  'fromBlockHash',
  'data',
  'fusedPlasma',
  'difficulty',
  'nonce',
  'publicKey',
  'signature',
]);
const HARNESS_BOUNDARY_TIMEOUT_MS = 5_000;
const HARNESS_CHILD_TIMEOUT_MS = 15_000;

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

/**
 * Execute every global-SDK characterization in a disposable, bounded process.
 * A hung regression is terminated without restoring patched globals underneath
 * an unresolved operation in the parent test process.
 */
export function runPhase2AIsolated(action, value) {
  const supported = new Set(['capture', 'lifecycle', 'cleanup-poison', 'timeout-cleanup']);
  if (!supported.has(action) || typeof value !== 'string' || !value) {
    throw new TypeError('invalid Phase 2A isolated action');
  }
  const childSource = [
    'const originalLog = console.log;',
    'console.log = () => {};',
    'try {',
    '  const harness = await import(process.env.PHASE2A_HARNESS_URL);',
    '  const action = process.env.PHASE2A_CHILD_ACTION;',
    '  const value = process.env.PHASE2A_CHILD_VALUE;',
    '  let result;',
    '  if (action === "capture") result = await harness.capturePhase2AScenario(value);',
    '  else if (action === "lifecycle") result = await harness.runPhase2ALifecycleCase(value);',
    '  else if (action === "cleanup-poison") result = await harness.runPhase2AConnectionCleanupPoisonCase(value);',
    '  else if (action === "timeout-cleanup") result = await harness.runPhase2ATimeoutCleanupCase(value);',
    '  else throw new Error("unsupported child action");',
    '  console.log = originalLog;',
    '  process.stdout.write(JSON.stringify(result));',
    '} catch {',
    '  process.stderr.write("Phase 2A isolated child failed\\n");',
    '  process.exitCode = 1;',
    '}',
  ].join('\n');
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', childSource], {
    encoding: 'utf8',
    killSignal: 'SIGKILL',
    maxBuffer: 16 * 1024 * 1024,
    timeout: HARNESS_CHILD_TIMEOUT_MS,
    env: {
      PHASE2A_HARNESS_URL: import.meta.url,
      PHASE2A_CHILD_ACTION: action,
      PHASE2A_CHILD_VALUE: value,
    },
  });
  if (child.status !== 0 || child.signal !== null || child.stderr !== '') {
    throw new Error('Phase 2A isolated child did not complete safely');
  }
  return JSON.parse(child.stdout);
}

async function raceWithHarnessDeadline(promises, label, state) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (state) state.unsettledWork = true;
      reject(new Error(`Phase 2A harness boundary timed out: ${label}`));
    }, HARNESS_BOUNDARY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([...promises, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Capture one successful, unchanged ExactZenonClient preparation. */
export async function capturePhase2AScenario(scenarioId) {
  return executePublicFixture(scenarioId, {});
}

/** Exercise one ordinary lifecycle path without exposing secret-bearing objects. */
export async function runPhase2ALifecycleCase(kind) {
  const cases = {
    offline_failure: { mutatePaymentRequired: offlineFailureMutation, queueOwnerProbe: false },
    asset_failure: { assetFailure: 'missing' },
    prepare_failure: { plasmaFailure: true },
    projection_redaction: { plasmaFailure: true, projectAdversarialError: true },
    post_sign_failure: { corruptSignature: true },
    key_clear_throw_before: { keyClearMode: 'throw-before' },
    key_clear_then_throw: { keyClearMode: 'clear-then-throw' },
    key_clear_throw_before_after_work: { plasmaFailure: true, keyClearMode: 'throw-before' },
    key_clear_then_throw_after_work: { plasmaFailure: true, keyClearMode: 'clear-then-throw' },
    deferred_prepare: { deferPrepare: true },
    deferred_prepare_preinit_failure: {
      deferPrepare: true,
      mutatePaymentRequired: offlineFailureMutation,
      queueOwnerProbe: false,
    },
  };
  if (!Object.hasOwn(cases, kind)) throw new TypeError('unknown Phase 2A lifecycle case');
  const scenarioId = kind === 'asset_failure' ? 'B' : 'A';
  const result = await executePublicFixture(scenarioId, cases[kind]);
  return lifecycleProjection(result);
}

/**
 * Run only in a fresh one-shot child process. This permanently poisons the
 * imported module-global runtime and deliberately offers no reset operation.
 */
export async function runPhase2AConnectionCleanupPoisonCase(mode) {
  const modes = {
    after_success_throw_before: { connectionClearMode: 'throw-before' },
    after_work_error_throw_after: { plasmaFailure: true, connectionClearMode: 'throw-after' },
    after_key_cleanup_error_throw_after: { keyClearMode: 'throw-before', connectionClearMode: 'throw-after' },
  };
  if (!Object.hasOwn(modes, mode)) throw new TypeError('unknown Phase 2A poison case');
  const result = await executePublicFixture('A', {
    ...modes[mode],
  });
  const futurePromise = withLiveSdkOwner('phase2a.future-owner', async () => 'entered').then(
    value => ({ status: value }),
    error => errorProjection(error),
  );
  const future = await raceWithHarnessDeadline([futurePromise], 'future-poison-owner');
  return {
    mode,
    outcome: result.outcome,
    releaseEvidence: result.releaseEvidence,
    future,
    lifecycle: result.lifecycle,
    harnessCleanupFacts: result.harnessCleanupFacts,
    failureFacts: result.failureFacts,
    nonRuntimeRestoration: result.restoration,
    observedExecutionTrace: result.observedExecutionTrace,
    prepareBlockApiBoundaryTrace: result.prepareBlockApiBoundaryTrace,
    blockStageSnapshots: result.blockStageSnapshots,
  };
}

/** Run only through runPhase2AIsolated(); the SDK read is allowed to settle late. */
export async function runPhase2ATimeoutCleanupCase(mode) {
  if (mode !== 'read_timeout_clear_before') throw new TypeError('unknown Phase 2A timeout case');
  const result = await executePublicFixture('A', {
    readTimeoutOperation: 'stats.networkInfo',
    connectionClearMode: 'throw-before',
    rpcTimeoutMs: 10,
  });
  const futurePromise = withLiveSdkOwner('phase2a.timeout-future-owner', async () => 'entered').then(
    value => ({ status: value }),
    error => errorProjection(error),
  );
  const future = await raceWithHarnessDeadline([futurePromise], 'future-timeout-owner');
  return {
    mode,
    outcome: result.outcome,
    releaseEvidence: result.releaseEvidence,
    future,
    lifecycle: result.lifecycle,
    harnessCleanupFacts: result.harnessCleanupFacts,
    failureFacts: result.failureFacts,
    clientRetained: result.lifecycle.clientOwnAfterProduction && !result.lifecycle.clientUndefinedAfterProduction,
    nonRuntimeRestoration: result.restoration,
    observedExecutionTrace: result.observedExecutionTrace,
    sdkApiRpcMethodBoundaryTrace: result.sdkApiRpcMethodBoundaryTrace,
  };
}

async function executePublicFixture(scenarioId, behavior) {
  const inputs = await buildPhase2AInputs();
  const scenario = inputs.scenarios[scenarioId];
  if (!scenario) throw new TypeError('unknown Phase 2A scenario');
  return withPhase2AFixtureMnemonic(mnemonic => runSdkHarness({ scenario, mnemonic, behavior }));
}

async function runSdkHarness({ scenario, mnemonic, behavior }) {
  const singletonSnapshot = snapshotProperty(sdk.Zenon, '_singleton');
  if (singletonSnapshot.hadOwn) {
    throw new Error('Phase 2A requires a fresh process with no SDK singleton');
  }
  const staticSnapshots = new Map();
  for (const property of [
    'getInstance',
    'setNetworkID',
    'setChainID',
    'getChainIdentifier',
    'getPowProvider',
    'chainID',
    'networkID',
    'powProvider',
    'powWorker',
  ]) {
    staticSnapshots.set(property, snapshotProperty(sdk.Zenon, property));
  }

  let zenon;
  let instanceSnapshots;
  let environment;
  let keyStoreFromMnemonicSnapshot;
  let keyStoreGetKeyPairSnapshot;
  let keyPairMethodSnapshots;
  let templateSendSnapshot;
  let templateToJsonSnapshot;
  let globalFetchSnapshot;
  let originalPrepare;
  try {
    const originalGetInstance = requireFunctionDescriptor(staticSnapshots.get('getInstance'), 'Zenon.getInstance');
    zenon = originalGetInstance.call(sdk.Zenon);
    if (Object.hasOwn(zenon, 'client') && zenon.client !== undefined) {
      throw new Error('Phase 2A requires no live SDK client');
    }

    instanceSnapshots = new Map();
    for (const property of ['initialize', 'clearConnection', 'prepareBlock', 'client', 'ledger', 'stats', 'embedded', 'subscribe']) {
      instanceSnapshots.set(property, snapshotProperty(zenon, property));
    }
    environment = snapshotEnvironment(ENVIRONMENT_KEYS);
    keyStoreFromMnemonicSnapshot = snapshotProperty(sdk.KeyStore, 'fromMnemonic');
    keyStoreGetKeyPairSnapshot = snapshotProperty(sdk.KeyStore.prototype, 'getKeyPair');
    keyPairMethodSnapshots = new Map();
    for (const property of ['getAddress', 'getPublicKey', 'sign', 'clear']) {
      keyPairMethodSnapshots.set(property, snapshotProperty(sdk.KeyPair.prototype, property));
    }
    templateSendSnapshot = snapshotProperty(sdk.AccountBlockTemplate, 'send');
    templateToJsonSnapshot = snapshotProperty(sdk.AccountBlockTemplate.prototype, 'toJson');
    globalFetchSnapshot = snapshotProperty(globalThis, 'fetch');
    originalPrepare = zenon.prepareBlock;
  } catch {
    restoreProperty(singletonSnapshot);
    throw new Error('Phase 2A harness setup failed');
  }

  const initializeEntered = deferred();
  const allowInitialize = deferred();
  const prepareEntered = deferred();
  const allowPrepare = deferred();
  const state = makeState({ scenario, zenon });
  let result;
  let cleanupFailure = false;
  let restoration;

  try {
    configureEnvironment();
    installStaticMilestones(state, staticSnapshots);
    installKeyInstrumentation(
      state,
      behavior,
      keyStoreFromMnemonicSnapshot,
      keyStoreGetKeyPairSnapshot,
      keyPairMethodSnapshots,
    );
    installTemplateInstrumentation(state, templateSendSnapshot, templateToJsonSnapshot);
    installNetworkTripwire(state, globalFetchSnapshot);
    installSessionStubs({
      state,
      behavior,
      scenario,
      zenon,
      originalPrepare,
      initializeEntered,
      allowInitialize,
      prepareEntered,
      allowPrepare,
    });
    installPowProvider(state, scenario);
    state.instrumentationEnabled = true;

    const paymentRequired = structuredClone(scenario.paymentRequired);
    behavior.mutatePaymentRequired?.(paymentRequired);
    const client = new ExactZenonClient({
      mnemonic,
      accountIndex: scenario.accountIndex,
      authenticateChainProfile: authenticateProfile(state, scenario),
      rpcTimeoutMs: behavior.rpcTimeoutMs ?? 500,
    });
    const fetchImpl = makeFakeFetch(state, paymentRequired);
    const operation = paidFetch(paymentRequired.resource.url, client, fetchImpl);
    const reflectedOperation = operation.then(
      value => ({ status: 'fulfilled', value }),
      error => ({ status: 'rejected', error }),
    );
    let ownerProbe;

    if (behavior.queueOwnerProbe !== false) {
      const firstBoundary = await raceWithHarnessDeadline([
        initializeEntered.promise.then(() => 'initialize'),
        reflectedOperation.then(() => 'operation'),
      ], 'initialize-or-operation', state);
      if (firstBoundary === 'initialize') {
        ownerProbe = withLiveSdkOwner('phase2a.release-probe', async () => {
          boundary(state, 'ownerProbe.enter', {}, 'owner');
          state.releaseEvidence.probeEntered = true;
          state.releaseEvidence.connectionCleanupSeenBeforeProbe = state.connectionClearCalls > 0;
          return 'entered';
        }).then(
          value => ({ status: value }),
          error => errorProjection(error),
        );
        state.releaseEvidence.queuedAfterInitialize = true;
        allowInitialize.resolve();
      }
    }

    if (behavior.deferPrepare) {
      try {
        const firstPrepareBoundary = await raceWithHarnessDeadline([
          prepareEntered.promise.then(() => 'prepare'),
          reflectedOperation.then(() => 'operation'),
        ], 'prepare-or-operation', state);
        if (firstPrepareBoundary === 'prepare') {
          const operationPair = state.pairs.find(pair => pair.role === 'operation');
          const keyState = operationPair?.inspectSensitiveState();
          const observed = boundary(state, 'harness.deferredEvidence', {}, 'harness-observation');
          state.deferredEvidence = {
            sequence: observed?.sequence ?? null,
            operationKeyDerived: state.pairs.some(pair => pair.role === 'operation'),
            operationPrivateKeyNonzero: keyState ? !keyState.privateZero : false,
            operationPublicKeyNonzero: keyState ? !keyState.publicZero : false,
            operationProductionClearAttempts: operationPair?.productionClearAttempts ?? 0,
            harnessTeardownWipeAttempts: operationPair?.harnessTeardownWipeAttempts ?? 0,
            connectionClearCalls: state.connectionClearCalls,
            clientHeld: Boolean(zenon.client),
            ownerProbeQueued: state.releaseEvidence.queuedAfterInitialize,
            ownerProbeEntered: state.releaseEvidence.probeEntered,
          };
        }
      } finally {
        allowPrepare.resolve();
      }
    }

    let settledOperation;
    try {
      settledOperation = await raceWithHarnessDeadline(
        [reflectedOperation],
        'payment-operation-settlement',
        state,
      );
    } finally {
      allowInitialize.resolve();
      allowPrepare.resolve();
    }

    const operationValue = settledOperation.status === 'fulfilled' ? settledOperation.value : undefined;
    const operationError = settledOperation.status === 'rejected' ? settledOperation.error : undefined;

    const probeResult = ownerProbe
      ? await raceWithHarnessDeadline([ownerProbe], 'owner-probe-settlement', state)
      : { status: 'not-queued' };
    state.releaseEvidence.probeResult = probeResult;
    state.releaseEvidence.operationSettled = true;

    if (behavior.readTimeoutOperation) {
      state.lateReadGate.resolve(scenario.readiness.networkInfo);
      await raceWithHarnessDeadline(
        [state.lateTeardownAttempt.promise],
        'late-timeout-teardown',
        state,
      );
      await new Promise(resolve => setImmediate(resolve));
    }

    captureAfterProduction(state, zenon);
    const outcome = operationError
      ? errorProjection(operationError)
      : { status: 'fulfilled' };
    result = {
      outcome,
      releaseEvidence: structuredClone(state.releaseEvidence),
      lifecycle: lifecycleFacts(state),
      failureFacts: failureFacts(state),
      networkTripwireCalls: state.networkTripwireCalls,
      observedExecutionTrace: structuredClone(state.observedExecutionTrace),
      sdkGlobalMilestones: structuredClone(state.sdkGlobalMilestones),
      sdkApiRpcMethodBoundaryTrace: structuredClone(state.sdkApiRpcMethodBoundaryTrace),
      prepareBlockApiBoundaryTrace: structuredClone(state.prepareBlockApiBoundaryTrace),
      blockStageSnapshots: structuredClone(state.blockStageSnapshots),
      payloadTransactionSnapshots: structuredClone(state.payloadTransactionSnapshots),
      mutationFacts: mutationFacts(state, operationValue),
      argumentFacts: argumentFacts(state, scenario),
      deferredEvidence: state.deferredEvidence ? { ...state.deferredEvidence } : null,
      golden: operationValue ? goldenRecord(state, scenario, operationValue) : null,
    };
  } finally {
    allowInitialize.resolve();
    allowPrepare.resolve();
    if (!state.unsettledWork) {
      state.instrumentationEnabled = false;
      cleanupFailure = !cleanupCapturedPairs(state);
      const restoreSnapshots = [
        globalFetchSnapshot,
        templateToJsonSnapshot,
        templateSendSnapshot,
        ...[...keyPairMethodSnapshots.values()].reverse(),
        keyStoreGetKeyPairSnapshot,
        keyStoreFromMnemonicSnapshot,
        ...[...instanceSnapshots.values()].reverse(),
        ...[...staticSnapshots.values()].reverse(),
        singletonSnapshot,
      ];
      for (const snapshot of restoreSnapshots) {
        try {
          restoreProperty(snapshot);
        } catch {
          cleanupFailure = true;
        }
      }
      try {
        restoreEnvironment(environment);
      } catch {
        cleanupFailure = true;
      }
      restoration = {
        singletonDescriptorExact: propertySnapshotMatches(singletonSnapshot),
        staticDescriptorsExact: [...staticSnapshots.values()].every(propertySnapshotMatches),
        instanceDescriptorsExact: [...instanceSnapshots.values()].every(propertySnapshotMatches),
        keyStoreDescriptorsExact:
          propertySnapshotMatches(keyStoreFromMnemonicSnapshot) &&
          propertySnapshotMatches(keyStoreGetKeyPairSnapshot),
        keyPairDescriptorsExact: [...keyPairMethodSnapshots.values()].every(propertySnapshotMatches),
        templateDescriptorsExact:
          propertySnapshotMatches(templateSendSnapshot) &&
          propertySnapshotMatches(templateToJsonSnapshot),
        globalFetchDescriptorExact: propertySnapshotMatches(globalFetchSnapshot),
        environmentExact: environment.every(environmentSnapshotMatches),
      };
    }
  }

  if (state.unsettledWork) throw new Error('Phase 2A child retained unsettled SDK work');
  if (cleanupFailure) throw new Error('Phase 2A harness cleanup failed');
  if (!result) throw new Error('Phase 2A harness did not produce a result');
  result.harnessCleanupFacts = harnessCleanupFacts(state);
  result.restoration = restoration;
  if (result.golden) {
    result.golden.expected.harnessCleanupFacts = structuredClone(result.harnessCleanupFacts);
    result.golden.expected.restoration = structuredClone(restoration);
  }
  return result;
}

function makeState({ scenario, zenon }) {
  return {
    scenario,
    zenon,
    instrumentationEnabled: false,
    executionSequence: 0,
    observedExecutionTrace: [],
    sdkGlobalMilestones: [],
    sdkApiRpcMethodBoundaryTrace: [],
    prepareBlockApiBoundaryTrace: [],
    blockStageSnapshots: Object.fromEntries([
      'sendReturn',
      'prepareEntry',
      'frontierAccountEntry',
      'preparationMomentumEntry',
      'plasmaEntry',
      'powProviderEntry',
      'signEntry',
      'prepareReturn',
      'beforeProductionClear',
      'afterProductionClear',
    ].map(stage => [stage, null])),
    payloadTransactionSnapshots: {
      productionToJson: null,
      beforeProductionClear: null,
      afterProductionClear: null,
    },
    releaseEvidence: {
      queuedAfterInitialize: false,
      probeEntered: false,
      connectionCleanupSeenBeforeProbe: false,
      probeResult: null,
      operationSettled: false,
    },
    pairs: [],
    pairRoles: new WeakMap(),
    sensitiveCleanupCallbacks: [],
    harnessCleanupRecords: [],
    pairPhase: null,
    template: null,
    prepareArgument: null,
    prepared: null,
    productionTransactionJson: null,
    signHashAtEntry: null,
    signArgument: null,
    signResult: null,
    sendDataSnapshot: null,
    prepareDataSnapshot: null,
    frontierAddressArguments: [],
    tokenArguments: [],
    powArguments: [],
    getInstanceResults: [],
    detached: {},
    readinessMomentumResult: null,
    preparationMomentumResult: null,
    frontierResult: null,
    fetchCalls: 0,
    paymentSignatureHeader: null,
    publicationCalls: 0,
    networkTripwireCalls: 0,
    connectionClearCalls: 0,
    clientOwnAfterProduction: false,
    clientUndefinedAfterProduction: false,
    deferredEvidence: null,
    keyCleanupFailureObserved: false,
    connectionCleanupFailureObserved: false,
    plasmaFailureObserved: false,
    unsettledWork: false,
    lateReadGate: deferred(),
    lateTeardownAttempt: deferred(),
  };
}

function installStaticMilestones(state, snapshots) {
  for (const [property, operation] of [
    ['getInstance', 'Zenon.getInstance'],
    ['setNetworkID', 'Zenon.setNetworkID'],
    ['setChainID', 'Zenon.setChainID'],
    ['getChainIdentifier', 'Zenon.getChainIdentifier'],
    ['getPowProvider', 'Zenon.getPowProvider'],
  ]) {
    const original = requireFunctionDescriptor(snapshots.get(property), operation);
    defineLike(sdk.Zenon, property, snapshots.get(property).descriptor, function phase2aStaticBoundary(...args) {
      if (state.instrumentationEnabled) {
        const observed = boundary(
          state,
          operation,
          args.length ? { value: args[0] } : {},
          'sdk-global',
        );
        state.sdkGlobalMilestones.push({ ...observed });
      }
      const value = original.apply(this, args);
      if (state.instrumentationEnabled && property === 'getInstance') {
        state.getInstanceResults.push(value);
      }
      return value;
    });
  }
}

function installKeyInstrumentation(
  state,
  behavior,
  fromMnemonicSnapshot,
  getKeyPairSnapshot,
  keyPairMethodSnapshots,
) {
  const originalFromMnemonic = requireFunctionDescriptor(fromMnemonicSnapshot, 'KeyStore.fromMnemonic');
  const originalGetKeyPair = requireFunctionDescriptor(getKeyPairSnapshot, 'KeyStore.getKeyPair');
  const originals = Object.fromEntries(
    [...keyPairMethodSnapshots].map(([method, snapshot]) => [
      method,
      requireFunctionDescriptor(snapshot, `KeyPair.${method}`),
    ]),
  );

  for (const method of ['getAddress', 'getPublicKey', 'sign', 'clear']) {
    const snapshot = keyPairMethodSnapshots.get(method);
    defineLike(sdk.KeyPair.prototype, method, snapshot.descriptor, function phase2aPairBoundary(...args) {
      const record = state.pairRoles.get(this);
      if (!record) return originals[method].apply(this, args);

      if (method === 'getAddress') {
        boundary(state, 'KeyPair.getAddress', { role: record.role });
        const value = originals.getAddress.apply(this, args);
        record.addressResult = value;
        if (record.role === 'operation') {
          state.detached.addressAtGetAddressHex = Buffer.from(value.getBytes()).toString('hex');
        }
        return value;
      }
      if (method === 'getPublicKey') {
        boundary(state, 'KeyPair.getPublicKey', { role: record.role });
        const value = originals.getPublicKey.apply(this, args);
        record.publicKeyResult = value;
        state.detached.publicKeyAtGetPublicKeyHex = Buffer.from(value).toString('hex');
        return value;
      }
      if (method === 'sign') {
        boundary(state, 'KeyPair.sign', { role: record.role, messageBytes: args[0]?.length });
        state.signHashAtEntry = state.prepareArgument?.hash;
        state.signArgument = Buffer.from(args[0]);
        captureBlockStage(state, 'signEntry', state.prepareArgument);
        const value = originals.sign.apply(this, args);
        state.signResult = value;
        state.detached.signatureReturnedHex = Buffer.from(value).toString('hex');
        return value;
      }

      record.productionClearAttempts += 1;
      boundary(state, 'KeyPair.clear.enter', { role: record.role }, 'sdk-key');
      const before = record.inspectSensitiveState();
      record.privateNonzeroBeforeProductionClear = !before.privateZero;
      record.publicNonzeroBeforeProductionClear = !before.publicZero;
      if (record.role === 'operation') {
        captureBlockStage(state, 'beforeProductionClear', state.prepareArgument);
        capturePayloadTransactionStage(state, 'beforeProductionClear');
      }
      if (record.role === 'operation' && behavior.keyClearMode === 'throw-before') {
        state.keyCleanupFailureObserved = true;
        record.productionClearOutcome = 'threw-before';
        const after = record.inspectSensitiveState();
        record.privateNonzeroAfterProductionClear = !after.privateZero;
        record.publicNonzeroAfterProductionClear = !after.publicZero;
        if (record.role === 'operation') {
          captureBlockStage(state, 'afterProductionClear', state.prepareArgument, {
            clearOutcome: record.productionClearOutcome,
          });
          capturePayloadTransactionStage(state, 'afterProductionClear');
        }
        throw sentinelError('phase2a_key_clear_before');
      }
      const value = originals.clear.apply(this, args);
      record.productionClearOutcome = behavior.keyClearMode === 'clear-then-throw'
        ? 'threw-after'
        : 'returned';
      const after = record.inspectSensitiveState();
      record.privateNonzeroAfterProductionClear = !after.privateZero;
      record.publicNonzeroAfterProductionClear = !after.publicZero;
      if (record.role === 'operation') {
        captureBlockStage(state, 'afterProductionClear', state.prepareArgument, {
          clearOutcome: record.productionClearOutcome,
        });
        capturePayloadTransactionStage(state, 'afterProductionClear');
      }
      if (record.role === 'operation' && behavior.keyClearMode === 'clear-then-throw') {
        state.keyCleanupFailureObserved = true;
        throw sentinelError('phase2a_key_clear_after');
      }
      return value;
    });
  }

  defineLike(sdk.KeyStore.prototype, 'getKeyPair', getKeyPairSnapshot.descriptor, function phase2aGetKeyPair(index = 0) {
    const pair = originalGetKeyPair.call(this, index);
    const role = state.pairPhase === 'constructor' ? 'constructor-temporary' : 'operation';
    const record = {
      role,
      index,
      addressResult: null,
      publicKeyResult: null,
      productionClearAttempts: 0,
      productionClearOutcome: 'not-called',
      privateNonzeroBeforeProductionClear: null,
      publicNonzeroBeforeProductionClear: null,
      privateNonzeroAfterProductionClear: null,
      publicNonzeroAfterProductionClear: null,
      privateNonzeroBeforeHarnessTeardown: null,
      publicNonzeroBeforeHarnessTeardown: null,
      harnessTeardownWipeAttempts: 0,
      privateZeroAfterHarnessTeardown: null,
      publicZeroAfterHarnessTeardown: null,
    };
    state.pairRoles.set(pair, record);
    state.pairs.push(record);
    // These private references stay inside closures and are never returned,
    // traced, serialized, logged, or used in assertion messages.
    const retainedPrivateBufferForCleanupOnly = pair.privateKey;
    const retainedPublicBufferForCleanupOnly = pair.publicKey;
    record.inspectSensitiveState = () => ({
      privateZero: allZero(retainedPrivateBufferForCleanupOnly),
      publicZero: allZero(retainedPublicBufferForCleanupOnly),
    });
    state.sensitiveCleanupCallbacks.push(() => {
      record.harnessTeardownWipeAttempts += 1;
      retainedPrivateBufferForCleanupOnly.fill(0);
      retainedPublicBufferForCleanupOnly.fill(0);
      record.privateZeroAfterHarnessTeardown = allZero(retainedPrivateBufferForCleanupOnly);
      record.publicZeroAfterHarnessTeardown = allZero(retainedPublicBufferForCleanupOnly);
    });
    boundary(state, 'KeyStore.getKeyPair', { role, index });
    return pair;
  });

  defineLike(sdk.KeyStore, 'fromMnemonic', fromMnemonicSnapshot.descriptor, function phase2aFromMnemonic(...args) {
    boundary(state, 'KeyStore.fromMnemonic', { arguments: 'redacted' });
    state.pairPhase = 'constructor';
    try {
      return originalFromMnemonic.apply(this, args);
    } finally {
      state.pairPhase = null;
    }
  });
}

function installTemplateInstrumentation(state, sendSnapshot, toJsonSnapshot) {
  const originalSend = requireFunctionDescriptor(sendSnapshot, 'AccountBlockTemplate.send');
  const originalToJson = requireFunctionDescriptor(toJsonSnapshot, 'AccountBlockTemplate.toJson');
  defineLike(sdk.AccountBlockTemplate, 'send', sendSnapshot.descriptor, function phase2aSend(...args) {
    boundary(state, 'AccountBlockTemplate.send.enter', {}, 'sdk-block');
    const block = originalSend.apply(this, args);
    state.template = block;
    state.sendDataSnapshot = Buffer.from(block.data);
    state.sendArguments = args;
    captureBlockStage(state, 'sendReturn', block);
    return block;
  });
  defineLike(sdk.AccountBlockTemplate.prototype, 'toJson', toJsonSnapshot.descriptor, function phase2aToJson(...args) {
    const value = originalToJson.apply(this, args);
    if (this === state.prepared) {
      const observed = boundary(state, 'AccountBlockTemplate.toJson', {}, 'sdk-block');
      state.productionTransactionJson = value;
      state.payloadTransactionSnapshots.productionToJson = {
        sequence: observed?.sequence ?? null,
        transaction: structuredClone(value),
      };
    }
    return value;
  });
}

function installNetworkTripwire(state, fetchSnapshot) {
  const descriptor = fetchSnapshot.descriptor ?? {
    configurable: true,
    enumerable: true,
    writable: true,
  };
  defineLike(globalThis, 'fetch', descriptor, async function phase2aNetworkTripwire() {
    state.networkTripwireCalls += 1;
    throw sentinelError('phase2a_network_tripwire');
  });
}

function installSessionStubs({
  state,
  behavior,
  scenario,
  zenon,
  originalPrepare,
  initializeEntered,
  allowInitialize,
  prepareEntered,
  allowPrepare,
}) {
  zenon.initialize = async function phase2aInitialize(rpcUrl) {
    const call = beginSdkApiCall(state, 'zenon.initialize', [rpcUrl], { phase: 'readiness' });
    try {
      zenon.client = Object.freeze({ phase2aSyntheticClient: true });
      initializeEntered.resolve();
      await allowInitialize.promise;
      if (behavior.initializeFailure) throw sentinelError('phase2a_initialize_failure');
      call.outcome = 'fulfilled';
    } catch (error) {
      call.outcome = 'rejected';
      throw error;
    }
  };

  zenon.clearConnection = function phase2aClearConnection() {
    state.connectionClearCalls += 1;
    const observed = boundary(state, 'Zenon.clearConnection', {
      attempt: state.connectionClearCalls,
      mode: behavior.connectionClearMode ?? 'return',
    }, 'sdk-lifecycle');
    if (behavior.connectionClearMode === 'throw-before') {
      state.connectionCleanupFailureObserved = true;
      if (behavior.readTimeoutOperation && state.connectionClearCalls >= 3) {
        state.lateTeardownAttempt.resolve();
      }
      if (observed) observed.outcome = 'rejected';
      const code = behavior.readTimeoutOperation
        ? `phase2a_connection_cleanup_failure_attempt_${state.connectionClearCalls}`
        : 'phase2a_connection_cleanup_failure';
      throw sentinelError(code);
    }
    zenon.client = undefined;
    if (behavior.connectionClearMode === 'throw-after') {
      state.connectionCleanupFailureObserved = true;
      if (observed) observed.outcome = 'rejected';
      throw sentinelError('phase2a_connection_cleanup_failure');
    }
    if (observed) observed.outcome = 'fulfilled';
  };

  let momentumCalls = 0;
  zenon.stats = {
    networkInfo: async () => {
      const call = beginSdkApiCall(state, 'stats.networkInfo', [], { phase: 'readiness' });
      try {
        const value = behavior.readTimeoutOperation === 'stats.networkInfo'
          ? await state.lateReadGate.promise
          : scenario.readiness.networkInfo;
        call.outcome = 'fulfilled';
        return value;
      } catch (error) {
        call.outcome = 'rejected';
        throw error;
      }
    },
    syncInfo: async () => {
      const call = beginSdkApiCall(state, 'stats.syncInfo', [], { phase: 'readiness' });
      call.outcome = 'fulfilled';
      return scenario.readiness.syncInfo;
    },
  };
  zenon.ledger = {
    getFrontierMomentum: async () => {
      momentumCalls += 1;
      const phase = momentumCalls === 1 ? 'readiness' : 'prepare';
      const call = beginSdkApiCall(state, 'ledger.getFrontierMomentum', [], {
        phase,
        preparation: phase === 'prepare',
      });
      if (phase === 'prepare') {
        captureBlockStage(state, 'preparationMomentumEntry', state.prepareArgument);
      }
      const value = phase === 'readiness' ? scenario.readiness.frontierMomentum : scenario.frontierMomentum;
      if (phase === 'readiness') state.readinessMomentumResult = value;
      else state.preparationMomentumResult = value;
      call.outcome = 'fulfilled';
      return value;
    },
    getFrontierAccountBlock: async address => {
      const call = beginSdkApiCall(state, 'ledger.getFrontierAccountBlock', [address.toString()], {
        phase: 'prepare',
        preparation: true,
      });
      state.frontierAddressArguments.push(address);
      captureBlockStage(state, 'frontierAccountEntry', state.prepareArgument);
      if (behavior.frontierFailure) {
        call.outcome = 'rejected';
        throw sentinelError('phase2a_frontier_failure');
      }
      state.frontierResult = scenario.frontierAccountBlock;
      state.detached.frontierHashHex = scenario.frontierAccountBlock?.hash
        ? Buffer.from(scenario.frontierAccountBlock.hash.getBytes()).toString('hex')
        : sdk.EMPTY_HASH.toString();
      call.outcome = 'fulfilled';
      return scenario.frontierAccountBlock;
    },
    publishRawTransaction: async () => {
      state.publicationCalls += 1;
      throw sentinelError('phase2a_publication_tripwire');
    },
  };
  zenon.embedded = {
    token: {
      getByZts: async tokenStandard => {
        const call = beginSdkApiCall(state, 'embedded.token.getByZts', [tokenStandard.toString()], {
          phase: 'asset',
        });
        state.tokenArguments.push(tokenStandard);
        if (behavior.assetFailure === 'missing') {
          call.outcome = 'fulfilled';
          return null;
        }
        if (behavior.assetFailure === 'error') {
          call.outcome = 'rejected';
          throw sentinelError('phase2a_asset_lookup_failure');
        }
        call.outcome = 'fulfilled';
        return scenario.assetRecord;
      },
    },
    plasma: {
      getRequiredPoWForAccountBlock: async powParam => {
        const call = beginSdkApiCall(
          state,
          'embedded.plasma.getRequiredPoWForAccountBlock',
          [normalizePowParam(powParam)],
          { phase: 'prepare', preparation: true },
        );
        state.powArguments.push(powParam);
        captureBlockStage(state, 'plasmaEntry', state.prepareArgument);
        if (behavior.plasmaFailure) {
          state.plasmaFailureObserved = true;
          call.outcome = 'rejected';
          const error = sentinelError(
            behavior.projectAdversarialError
              ? 'phase2a_unapproved_code'
              : 'phase2a_plasma_failure',
          );
          if (behavior.projectAdversarialError) {
            error.outcome = 'f'.repeat(64);
            error.operation = 'phase2a.unapproved.operation';
            error.secretToken = 'f'.repeat(64);
          }
          throw error;
        }
        call.outcome = 'fulfilled';
        return scenario.plasmaResponse;
      },
    },
  };
  zenon.subscribe = new Proxy({}, {
    get() {
      throw sentinelError('phase2a_subscription_tripwire');
    },
  });

  zenon.prepareBlock = async function phase2aPrepareBlock(block, keyPair) {
    boundary(state, 'Zenon.prepareBlock.enter', {}, 'sdk-block');
    state.prepareArgument = block;
    state.prepareKeyPairIsOperationPair = state.pairRoles.get(keyPair)?.role === 'operation';
    state.prepareDataSnapshot = Buffer.from(block.data);
    captureBlockStage(state, 'prepareEntry', block);
    prepareEntered.resolve();
    if (behavior.deferPrepare) await allowPrepare.promise;
    const prepared = await originalPrepare.call(this, block, keyPair);
    state.prepared = prepared;
    state.detached.preparedAddressHex = Buffer.from(prepared.address.getBytes()).toString('hex');
    state.detached.preparedPublicKeyHex = Buffer.from(prepared.publicKey).toString('hex');
    state.detached.preparedPreviousHashHex = Buffer.from(prepared.previousHash.getBytes()).toString('hex');
    state.detached.preparedAcknowledgedHashHex = Buffer.from(
      prepared.momentumAcknowledged.hash.getBytes(),
    ).toString('hex');
    state.detached.preparedSignatureHex = Buffer.from(prepared.signature).toString('hex');
    captureBlockStage(state, 'prepareReturn', prepared);
    boundary(state, 'Zenon.prepareBlock.return', {}, 'sdk-block');
    if (behavior.corruptSignature) {
      const corrupted = Buffer.from(prepared.signature);
      corrupted[0] ^= 0x01;
      prepared.signature = corrupted;
    }
    return prepared;
  };
}

function installPowProvider(state, scenario) {
  const provider = async (hashHex, difficulty) => {
    boundary(state, 'Zenon.powProvider', { hashHex, difficulty }, 'sdk-pow');
    state.powProviderCall = { hashHex, difficulty };
    captureBlockStage(state, 'powProviderEntry', state.prepareArgument);
    if (scenario.plasmaResponse.requiredDifficulty === 0) {
      throw sentinelError('phase2a_unexpected_pow_provider');
    }
    return PHASE2A_POW_NONCE;
  };
  Object.defineProperty(sdk.Zenon, 'powProvider', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: provider,
  });
}

function authenticateProfile(state, scenario) {
  return async details => {
    boundary(state, 'authenticateChainProfile', {}, 'chain-authentication');
    state.authDetails = details;
    return structuredClone(scenario.readiness.authenticatedProfile);
  };
}

function makeFakeFetch(state, paymentRequired) {
  const requiredHeader = encodeHarnessJson(paymentRequired);
  return async (url, options) => {
    state.fetchCalls += 1;
    if (state.fetchCalls === 1) {
      boundary(state, 'fetch.initial', {}, 'http');
      if (options !== undefined) throw sentinelError('phase2a_initial_fetch_options_tripwire');
      return fakeResponse(402, paymentRequired.resource.url, {
        [HEADERS.PAYMENT_REQUIRED]: requiredHeader,
      });
    }
    if (state.fetchCalls !== 2) throw sentinelError('phase2a_fetch_count_tripwire');
    boundary(state, 'fetch.paid', {}, 'http');
    if (url !== paymentRequired.resource.url || options?.redirect !== 'manual') {
      throw sentinelError('phase2a_paid_fetch_shape_tripwire');
    }
    const header = options.headers?.[HEADERS.PAYMENT_SIGNATURE];
    if (typeof header !== 'string') throw sentinelError('phase2a_missing_payment_header');
    state.paymentSignatureHeader = header;
    const payload = decodeHarnessJson(header);
    const settlement = {
      success: true,
      network: payload.accepted.network,
      transaction: payload.payload.transaction.hash,
      payer: payload.payload.transaction.address,
      state: 'MOMENTUM_INCLUDED',
    };
    return fakeResponse(200, paymentRequired.resource.url, {
      [HEADERS.PAYMENT_RESPONSE]: encodeHarnessJson(settlement),
    });
  };
}

function goldenRecord(state, scenario, operationValue) {
  const paymentPayload = operationValue.paymentPayload;
  const transaction = paymentPayload.payload.transaction;
  const preimage = accountBlockHashPreimage(transaction);
  const preparedJsonString = JSON.stringify(transaction);
  const paymentPayloadWireJson = JSON.stringify(paymentPayload);
  return {
    schemaVersion: 2,
    id: scenario.id,
    provenance: { ...PHASE2A_ORACLE },
    inputs: publicInputs(scenario),
    expected: {
      observedExecutionTrace: structuredClone(state.observedExecutionTrace),
      sdkGlobalMilestones: structuredClone(state.sdkGlobalMilestones),
      sdkApiRpcMethodBoundaryTrace: structuredClone(state.sdkApiRpcMethodBoundaryTrace),
      prepareBlockApiBoundaryTrace: structuredClone(state.prepareBlockApiBoundaryTrace),
      blockStageSnapshots: structuredClone(state.blockStageSnapshots),
      payloadTransactionSnapshots: structuredClone(state.payloadTransactionSnapshots),
      transaction: structuredClone(transaction),
      preparedJsonString,
      preparedJsonUtf8Hex: Buffer.from(preparedJsonString, 'utf8').toString('hex'),
      hashPreimageHex: preimage.toString('hex'),
      hashPreimageBytes: preimage.length,
      transactionHash: transaction.hash,
      publicKeyHex: Buffer.from(transaction.publicKey, 'base64').toString('hex'),
      signatureHex: Buffer.from(transaction.signature, 'base64').toString('hex'),
      paymentPayload: structuredClone(paymentPayload),
      paymentPayloadWireJson,
      paymentPayloadUtf8Hex: Buffer.from(paymentPayloadWireJson, 'utf8').toString('hex'),
      paymentSignatureHeader: state.paymentSignatureHeader,
      paymentSignatureHeaderSha256: sha256Hex(state.paymentSignatureHeader),
      mutationFacts: mutationFacts(state, operationValue),
      argumentFacts: argumentFacts(state, scenario),
      lifecycle: lifecycleFacts(state),
    },
  };
}

function publicInputs(scenario) {
  return {
    accountIndex: scenario.accountIndex,
    chainProfile: structuredClone(PHASE2A_CHAIN_PROFILE),
    resource: structuredClone(scenario.paymentRequired.resource),
    accepted: structuredClone(scenario.accepted),
    readinessMomentum: momentumLiteral(scenario.readiness.frontierMomentum),
    frontierAccountBlock: scenario.frontierAccountBlock
      ? { height: scenario.frontierAccountBlock.height, hash: scenario.frontierAccountBlock.hash.toString() }
      : null,
    preparationMomentum: momentumLiteral(scenario.frontierMomentum),
    plasmaResponse: { ...scenario.plasmaResponse },
    powNonce: scenario.plasmaResponse.requiredDifficulty === 0 ? null : scenario.powNonce,
  };
}

function momentumLiteral(momentum) {
  return {
    chainIdentifier: momentum.chainIdentifier,
    height: momentum.height,
    hash: momentum.hash.toString(),
  };
}

function mutationFacts(state, operationValue) {
  if (!state.template) return null;
  const operationPair = state.pairs.find(pair => pair.role === 'operation');
  return {
    exactEighteenFieldOrder: state.productionTransactionJson
      ? Object.keys(state.productionTransactionJson).join(',') === ACCOUNT_BLOCK_FIELDS.join(',')
      : false,
    sendReturnedPrepareArgument: state.template === state.prepareArgument,
    sendDataBytes: state.sendDataSnapshot?.length ?? null,
    prepareDataHex: state.prepareDataSnapshot?.toString('hex') ?? null,
    dataAssignedBetweenStages:
      state.sendDataSnapshot?.length === 0 && (state.prepareDataSnapshot?.length ?? 0) === 32,
    prepareUsedOperationKeyPair: state.prepareKeyPairIsOperationPair === true,
    addressAliasesGetAddress: state.prepareArgument?.address === operationPair?.addressResult,
    publicKeyAliasesGetPublicKey: state.prepareArgument?.publicKey === operationPair?.publicKeyResult,
    previousHashAliasesFrontier: state.frontierResult
      ? state.prepareArgument?.previousHash === state.frontierResult.hash
      : state.prepareArgument?.previousHash === sdk.EMPTY_HASH,
    acknowledgedHashAliasesPreparationMomentum:
      state.prepareArgument?.momentumAcknowledged?.hash === state.preparationMomentumResult?.hash,
    signatureAliasesSignResult: state.prepared?.signature === state.signResult,
    prepareReturnedSameBlock: state.prepared === state.prepareArgument,
    transactionObjectIsProductionToJson:
      operationValue?.paymentPayload?.payload?.transaction === state.productionTransactionJson,
    blockHashAtSign: state.signHashAtEntry?.toString() ?? null,
    signArgumentHex: state.signArgument?.toString('hex') ?? null,
    signEntryHashMatchesArgument:
      state.signHashAtEntry?.toString() === state.signArgument?.toString('hex'),
    signEntrySignatureEmpty:
      state.blockStageSnapshots.signEntry?.block.signature === '',
    prepareReturnSignaturePresent:
      Boolean(state.blockStageSnapshots.prepareReturn?.block.signature),
    publicKeyAliasZeroAfterProductionClear:
      state.blockStageSnapshots.afterProductionClear?.block.publicKey ===
        Buffer.alloc(32).toString('base64'),
    payloadTransactionUnchangedByProductionClear:
      JSON.stringify(state.payloadTransactionSnapshots.beforeProductionClear?.transaction) ===
        JSON.stringify(state.payloadTransactionSnapshots.afterProductionClear?.transaction),
    detachedAddressPreserved:
      state.detached.addressAtGetAddressHex === state.detached.preparedAddressHex,
    detachedPublicKeyPreserved:
      state.detached.publicKeyAtGetPublicKeyHex === state.detached.preparedPublicKeyHex,
    detachedPreviousHashPreserved:
      state.detached.frontierHashHex === state.detached.preparedPreviousHashHex,
    detachedAcknowledgedHashPreserved:
      state.detached.preparedAcknowledgedHashHex ===
        (state.preparationMomentumResult
          ? Buffer.from(state.preparationMomentumResult.hash.getBytes()).toString('hex')
          : null),
    detachedSignaturePreserved:
      state.detached.signatureReturnedHex === state.detached.preparedSignatureHex,
    independentHashMatches: state.productionTransactionJson
      ? accountBlockHashHex(state.productionTransactionJson) === state.productionTransactionJson.hash
      : false,
    powDataHash: state.powProviderCall?.hashHex ?? null,
    independentPowDataHash: state.prepared
      ? sha3Hex(Buffer.concat([
          Buffer.from(state.prepared.address.getBytes()),
          Buffer.from(state.prepared.previousHash.getBytes()),
        ]))
      : null,
  };
}

function argumentFacts(state, scenario) {
  const address = state.frontierAddressArguments[0];
  const token = state.tokenArguments[0] ?? state.template?.tokenStandard ?? scenario.tokenStandard;
  const powParam = state.powArguments[0];
  return {
    frontierAddressType: address === undefined ? null : typeof address,
    frontierAddressConstructor: address?.constructor?.name ?? null,
    frontierAddressIsSdkAddress: address ? Object.getPrototypeOf(address) === sdk.Address.prototype : false,
    frontierAddressIsPayerIdentity: address === state.pairs.find(pair => pair.role === 'operation')?.addressResult,
    frontierAddressBytesHex: address ? Buffer.from(address.getBytes()).toString('hex') : null,
    frontierAddressArguments: state.frontierAddressArguments.length,
    tokenType: typeof token,
    tokenConstructor: token?.constructor?.name ?? null,
    tokenIsSdkTokenStandard: Object.getPrototypeOf(token) === sdk.TokenStandard.prototype,
    tokenBytesHex: Buffer.from(token.getBytes()).toString('hex'),
    tokenLookupOccurred: state.tokenArguments.length === 1,
    tokenLookupUsedExactTemplateToken:
      state.tokenArguments.length === 0 ? null : token === state.template?.tokenStandard,
    powParamIsSdkGetRequiredPowParam: powParam
      ? Object.getPrototypeOf(powParam) === sdk.GetRequiredPowParam.prototype
      : false,
    powParamType: powParam === undefined ? null : typeof powParam,
    powParamConstructor: powParam?.constructor?.name ?? null,
    powParamAddressIdentity: powParam?.address === state.template?.address,
    powParamRecipientIdentity: powParam?.toAddress === state.template?.toAddress,
    powParamDataIdentity: powParam?.data === state.template?.data,
    powParamBlockType: powParam?.blockType ?? null,
    powParamDataHex: powParam ? Buffer.from(powParam.data).toString('hex') : null,
    powParamAddressBytesHex: powParam
      ? Buffer.from(powParam.address.getBytes()).toString('hex')
      : null,
    powParamRecipientBytesHex: powParam
      ? Buffer.from(powParam.toAddress.getBytes()).toString('hex')
      : null,
    readinessAndPreparationMomentumDiffer:
      state.readinessMomentumResult?.hash?.toString() !== state.preparationMomentumResult?.hash?.toString(),
    authenticatedSessionSingleton: state.authDetails?.zenon === state.zenon,
    sdkGetInstanceCalls: state.getInstanceResults.length,
    sdkGetInstanceResultsSameSession:
      state.getInstanceResults.length === 2 && state.getInstanceResults.every(value => value === state.zenon),
    templateTokenMatchesFixtureBytes:
      state.template?.tokenStandard?.toString() === scenario.tokenStandard.toString() &&
      Buffer.from(state.template.tokenStandard.getBytes()).equals(Buffer.from(scenario.tokenStandard.getBytes())),
    templateRecipientIsSdkAddress:
      state.template ? Object.getPrototypeOf(state.template.toAddress) === sdk.Address.prototype : false,
    templateRecipientBytesHex: state.template
      ? Buffer.from(state.template.toAddress.getBytes()).toString('hex')
      : null,
    sendRecipientIdentity: state.sendArguments?.[0] === state.template?.toAddress,
    sendTokenIdentity: state.sendArguments?.[1] === state.template?.tokenStandard,
    sendAmountType: typeof state.sendArguments?.[2],
    sendAmountDecimal: state.sendArguments?.[2]?.toString() ?? null,
  };
}

function lifecycleFacts(state) {
  const temporary = state.pairs.find(pair => pair.role === 'constructor-temporary');
  const operation = state.pairs.find(pair => pair.role === 'operation');
  return {
    constructorTemporaryPairs: state.pairs.filter(pair => pair.role === 'constructor-temporary').length,
    operationPairs: state.pairs.filter(pair => pair.role === 'operation').length,
    temporary: pairLifecycleFacts(temporary),
    operation: pairLifecycleFacts(operation),
    connectionClearCalls: state.connectionClearCalls,
    clientOwnAfterProduction: state.clientOwnAfterProduction,
    clientUndefinedAfterProduction: state.clientUndefinedAfterProduction,
    publicationCalls: state.publicationCalls,
    networkTripwireCalls: state.networkTripwireCalls,
    fetchCalls: state.fetchCalls,
  };
}

function lifecycleProjection(result) {
  return {
    outcome: result.outcome,
    releaseEvidence: result.releaseEvidence,
    lifecycle: result.lifecycle,
    harnessCleanupFacts: result.harnessCleanupFacts,
    failureFacts: result.failureFacts,
    observedExecutionTrace: result.observedExecutionTrace,
    sdkApiRpcMethodBoundaryTrace: result.sdkApiRpcMethodBoundaryTrace,
    prepareBlockApiBoundaryTrace: result.prepareBlockApiBoundaryTrace,
    blockStageSnapshots: result.blockStageSnapshots,
    payloadTransactionSnapshots: result.payloadTransactionSnapshots,
    deferredEvidence: result.deferredEvidence,
    restoration: result.restoration,
  };
}

function failureFacts(state) {
  return {
    plasmaFailureObserved: state.plasmaFailureObserved,
    keyCleanupFailureObserved: state.keyCleanupFailureObserved,
    connectionCleanupFailureObserved: state.connectionCleanupFailureObserved,
  };
}

function pairLifecycleFacts(record) {
  if (!record) return null;
  return {
    index: record.index,
    productionClearAttempts: record.productionClearAttempts,
    productionClearOutcome: record.productionClearOutcome,
    privateNonzeroBeforeProductionClear: record.privateNonzeroBeforeProductionClear,
    publicNonzeroBeforeProductionClear: record.publicNonzeroBeforeProductionClear,
    privateNonzeroAfterProductionClear: record.privateNonzeroAfterProductionClear,
    publicNonzeroAfterProductionClear: record.publicNonzeroAfterProductionClear,
    privateNonzeroBeforeHarnessTeardown: record.privateNonzeroBeforeHarnessTeardown,
    publicNonzeroBeforeHarnessTeardown: record.publicNonzeroBeforeHarnessTeardown,
    harnessTeardownWipeAttempts: record.harnessTeardownWipeAttempts,
  };
}

function captureAfterProduction(state, zenon) {
  state.clientOwnAfterProduction = Object.hasOwn(zenon, 'client');
  state.clientUndefinedAfterProduction = state.clientOwnAfterProduction && zenon.client === undefined;
  for (const record of state.pairs) {
    const sensitiveState = record.inspectSensitiveState();
    record.privateNonzeroBeforeHarnessTeardown = !sensitiveState.privateZero;
    record.publicNonzeroBeforeHarnessTeardown = !sensitiveState.publicZero;
  }
}

function cleanupCapturedPairs(state) {
  let ok = true;
  for (const cleanup of [...state.sensitiveCleanupCallbacks].reverse()) {
    try {
      cleanup();
    } catch {
      ok = false;
    }
  }
  state.sensitiveCleanupCallbacks.length = 0;
  for (const record of state.pairs) {
    state.harnessCleanupRecords.push({
      role: record.role,
      index: record.index,
      harnessTeardownWipeAttempts: record.harnessTeardownWipeAttempts,
      privateZeroAfterHarnessTeardown: record.privateZeroAfterHarnessTeardown,
      publicZeroAfterHarnessTeardown: record.publicZeroAfterHarnessTeardown,
    });
    record.addressResult = null;
    record.publicKeyResult = null;
    record.inspectSensitiveState = null;
  }
  return ok;
}

function harnessCleanupFacts(state) {
  return {
    pairWipes: structuredClone(state.harnessCleanupRecords),
    allSensitiveBuffersZeroAfterHarnessTeardown:
      state.harnessCleanupRecords.every(record =>
        record.privateZeroAfterHarnessTeardown && record.publicZeroAfterHarnessTeardown),
  };
}

function beginSdkApiCall(state, operation, args, { phase, preparation = false } = {}) {
  const observed = boundary(state, operation, phase ? { phase } : {}, 'sdk-api');
  const entry = {
    sequence: observed?.sequence ?? null,
    layer: 'sdk-api-method-boundary',
    wireEncodingObserved: false,
    operation,
    ...(phase ? { phase } : {}),
    arguments: structuredClone(args),
    outcome: 'pending',
  };
  state.sdkApiRpcMethodBoundaryTrace.push(entry);
  if (preparation) state.prepareBlockApiBoundaryTrace.push(entry);
  return entry;
}

function boundary(state, operation, details = {}, category = 'boundary') {
  if (!state.instrumentationEnabled) return null;
  const entry = {
    sequence: ++state.executionSequence,
    category,
    operation,
    ...details,
  };
  state.observedExecutionTrace.push(entry);
  return entry;
}

function normalizePowParam(powParam) {
  return {
    address: powParam.address.toString(),
    blockType: powParam.blockType,
    toAddress: powParam.toAddress.toString(),
    data: Buffer.from(powParam.data).toString('base64'),
  };
}

function snapshotBlockLiteral(block) {
  if (!block) return null;
  return {
    version: block.version,
    chainIdentifier: block.chainIdentifier,
    blockType: block.blockType,
    hash: block.hash.toString(),
    previousHash: block.previousHash.toString(),
    height: block.height,
    momentumAcknowledged: {
      hash: block.momentumAcknowledged.hash.toString(),
      height: block.momentumAcknowledged.height,
    },
    address: block.address.toString(),
    toAddress: block.toAddress.toString(),
    amount: block.amount.toString(),
    tokenStandard: block.tokenStandard.toString(),
    fromBlockHash: block.fromBlockHash.toString(),
    data: Buffer.from(block.data).toString('base64'),
    fusedPlasma: block.fusedPlasma,
    difficulty: block.difficulty,
    nonce: block.nonce,
    publicKey: Buffer.from(block.publicKey).toString('base64'),
    signature: Buffer.from(block.signature).toString('base64'),
  };
}

function captureBlockStage(state, stage, block, details = {}) {
  if (!block) return null;
  const observed = boundary(state, `block-stage.${stage}`, {}, 'block-stage');
  const snapshot = {
    sequence: observed?.sequence ?? null,
    block: snapshotBlockLiteral(block),
    ...details,
  };
  state.blockStageSnapshots[stage] = snapshot;
  return snapshot;
}

function capturePayloadTransactionStage(state, stage) {
  if (!state.productionTransactionJson) return null;
  const snapshot = {
    sequence: state.executionSequence,
    transaction: structuredClone(state.productionTransactionJson),
  };
  state.payloadTransactionSnapshots[stage] = snapshot;
  return snapshot;
}

function fakeResponse(status, url, values) {
  const headers = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    status,
    url,
    headers: { get: key => headers.get(String(key).toLowerCase()) ?? null },
  };
}

function encodeHarnessJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function decodeHarnessJson(value) {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
}

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function configureEnvironment() {
  process.env.ZENON_LIVE_ACK = 'I_UNDERSTAND_TESTNET_ONLY';
  process.env.ZENON_NETWORK_ID = String(PHASE2A_NETWORK_ID);
  process.env.ZENON_RPC_URL = PHASE2A_RPC_URL;
}

function offlineFailureMutation(paymentRequired) {
  paymentRequired.accepts[0].network = 'zenon:unsupported';
}

const SAFE_ERROR_MESSAGES = new Set([
  'Phase 2A synthetic failure',
  'PoC supports only its exact experimental live or mock network label',
  'asset_not_found',
  'invalid_signature',
  'key_cleanup_failed',
  'sdk_connection_cleanup_failed',
  'Zenon RPC observation is unavailable',
  'live_runtime_poisoned_restart_required',
]);
const SAFE_ERROR_NAMES = new Set(['Error', 'ZenonSafetyError', 'LiveRuntimeError']);
const SAFE_ERROR_CODES = new Set([
  'asset_not_found',
  'invalid_signature',
  'key_cleanup_failed',
  'live_rpc_read_timeout',
  'live_runtime_poisoned_restart_required',
  'phase2a_connection_cleanup_failure',
  'phase2a_connection_cleanup_failure_attempt_1',
  'phase2a_connection_cleanup_failure_attempt_2',
  'phase2a_connection_cleanup_failure_attempt_3',
  'phase2a_plasma_failure',
  'sdk_connection_cleanup_failed',
]);
const SAFE_ERROR_OUTCOMES = new Set(['OPERATION_UNAVAILABLE']);
const SAFE_ERROR_OPERATIONS = new Set(['stats.networkInfo']);
const SAFE_ENUMERABLE_FIELDS = new Set([
  'code',
  'lateTeardownError',
  'name',
  'operation',
  'outcome',
  'teardownError',
]);

function errorProjection(error) {
  const ownEnumerableFieldNames = Object.keys(error ?? {}).map(safeFieldName).sort();
  const ownEnumerablePrimitiveValues = {};
  for (const [key, value] of Object.entries(error ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      ownEnumerablePrimitiveValues[safeFieldName(key)] = safePrimitive(key, value);
    }
  }
  return {
    status: 'rejected',
    constructorName: safeErrorName(error?.constructor?.name),
    name: safeErrorName(error?.name),
    message: safeErrorMessage(error?.message),
    code: safeErrorCode(error?.code),
    outcome: safeErrorOutcome(error?.outcome),
    operation: safeErrorOperation(error?.operation),
    hasCause: error?.cause !== undefined,
    cause: error?.cause === undefined ? null : errorCoreProjection(error.cause),
    teardownDiagnostic:
      error?.teardownError === undefined ? null : errorCoreProjection(error.teardownError),
    lateTeardownDiagnostic:
      error?.lateTeardownError === undefined ? null : errorCoreProjection(error.lateTeardownError),
    ownEnumerableFieldNames,
    ownEnumerablePrimitiveValues,
  };
}

function errorCoreProjection(error) {
  return {
    constructorName: safeErrorName(error?.constructor?.name),
    name: safeErrorName(error?.name),
    message: safeErrorMessage(error?.message),
    code: safeErrorCode(error?.code),
    outcome: safeErrorOutcome(error?.outcome),
    operation: safeErrorOperation(error?.operation),
  };
}

function safeErrorName(value) {
  return SAFE_ERROR_NAMES.has(value) ? value : '[redacted]';
}

function safeErrorMessage(value) {
  return SAFE_ERROR_MESSAGES.has(value) ? value : '[redacted]';
}

function safeErrorCode(value) {
  return SAFE_ERROR_CODES.has(value) ? value : null;
}

function safeErrorOutcome(value) {
  return SAFE_ERROR_OUTCOMES.has(value) ? value : null;
}

function safeErrorOperation(value) {
  return SAFE_ERROR_OPERATIONS.has(value) ? value : null;
}

function safeFieldName(value) {
  return SAFE_ENUMERABLE_FIELDS.has(value) ? value : '[redacted-field]';
}

function safePrimitive(field, value) {
  if (field === 'code') return safeErrorCode(value) ?? '[redacted]';
  if (field === 'name') return safeErrorName(value);
  if (field === 'outcome') return safeErrorOutcome(value) ?? '[redacted]';
  if (field === 'operation') return safeErrorOperation(value) ?? '[redacted]';
  return '[redacted]';
}

function sentinelError(code) {
  const error = new Error('Phase 2A synthetic failure');
  error.code = code;
  return error;
}

function allZero(value) {
  return Buffer.isBuffer(value) && value.every(byte => byte === 0);
}

function requireFunctionDescriptor(snapshot, label) {
  if (!snapshot?.descriptor || typeof snapshot.descriptor.value !== 'function') {
    throw new Error(`Phase 2A unsupported descriptor: ${label}`);
  }
  return snapshot.descriptor.value;
}

function defineLike(target, property, descriptor, value) {
  Object.defineProperty(target, property, { ...descriptor, value });
}

function snapshotProperty(target, property) {
  return {
    target,
    property,
    hadOwn: Object.hasOwn(target, property),
    descriptor: Object.getOwnPropertyDescriptor(target, property),
  };
}

function restoreProperty(snapshot) {
  if (snapshot.hadOwn) Object.defineProperty(snapshot.target, snapshot.property, snapshot.descriptor);
  else delete snapshot.target[snapshot.property];
}

function propertySnapshotMatches(snapshot) {
  if (Object.hasOwn(snapshot.target, snapshot.property) !== snapshot.hadOwn) return false;
  return descriptorsEqual(
    Object.getOwnPropertyDescriptor(snapshot.target, snapshot.property),
    snapshot.descriptor,
  );
}

function descriptorsEqual(left, right) {
  if (left === undefined || right === undefined) return left === right;
  for (const property of ['configurable', 'enumerable']) {
    if (left[property] !== right[property]) return false;
  }
  const data = Object.hasOwn(left, 'value') || Object.hasOwn(right, 'value');
  if (data) {
    return Object.hasOwn(left, 'value') === Object.hasOwn(right, 'value') &&
      left.value === right.value && left.writable === right.writable;
  }
  return left.get === right.get && left.set === right.set;
}

function snapshotEnvironment(keys) {
  return keys.map(key => ({ key, hadOwn: Object.hasOwn(process.env, key), value: process.env[key] }));
}

function restoreEnvironment(snapshots) {
  for (const snapshot of snapshots) {
    if (snapshot.hadOwn) process.env[snapshot.key] = snapshot.value;
    else delete process.env[snapshot.key];
  }
}

function environmentSnapshotMatches(snapshot) {
  return Object.hasOwn(process.env, snapshot.key) === snapshot.hadOwn &&
    (!snapshot.hadOwn || process.env[snapshot.key] === snapshot.value);
}
