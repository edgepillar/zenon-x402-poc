import { isAbsolute, join, resolve } from 'node:path';
import { types as utilTypes } from 'node:util';

import {
  CURRENT_TESTNET_WSS_ONCE_POLICY,
  preflightCurrentTestnetWssOnceRun,
  preflightPublicWsOnceRun,
} from './live-evidence-runner.js';
import { supervisePublicWsOnceChild } from './live-evidence-public-ws-once-supervisor.js';
import {
  GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS,
} from './gate-b-operator-coordinator-schema.js';
import {
  launchGateBPublicWsInputs,
  launchGateBPublicWsInputsInInheritedProcessGroup,
} from './gate-b-public-ws-inputs-launcher.js';
import {
  GATE_B_CURRENT_TESTNET_WSS_ENDPOINT,
  GATE_B_CURRENT_TESTNET_WSS_INPUT_ACKNOWLEDGEMENTS,
  GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS,
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
  GATE_B_PUBLIC_WS_INPUT_OPERATIONS,
} from './gate-b-public-ws-inputs-schema.js';
import {
  assertGateBQuickTunnelReady,
  launchGateBQuickTunnel,
  launchGateBQuickTunnelInInheritedProcessGroup,
  stopGateBQuickTunnel,
  waitGateBQuickTunnelClosed,
} from './gate-b-quick-tunnel-launcher.js';
import {
  GATE_B_QUICK_TUNNEL_OPERATIONS,
  GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS,
  GATE_B_QUICK_TUNNEL_TELEMETRY_MODES,
} from './gate-b-quick-tunnel-schema.js';

const ERROR_CODE = 'gate_b_public_ws_inputs_controller_failed';
const REVIEW_REQUIRED = 'GATE_B_CONTROLLER_REVIEW_REQUIRED_RUN_NOT_AUTHORIZED';
const PREFLIGHT_VALID = 'GATE_B_CONTROLLER_PREFLIGHT_VALID_RUN_NOT_AUTHORIZED';
const PENDING = 'GATE_B_CONTROLLER_PENDING_INDEPENDENT_VERIFICATION';
const CLOSED = 'GATE_B_CONTROLLER_CLOSED_RUN_NOT_EXECUTED';
const CLOSED_PENDING = 'GATE_B_CONTROLLER_CLOSED_PENDING_INDEPENDENT_VERIFICATION';
const QUARANTINED = 'GATE_B_CONTROLLER_FAILED_WORKSPACE_QUARANTINED';
const RUN_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const LOWERCASE_HASH_64 = /^[0-9a-f]{64}$/;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const RECORDS = new WeakMap();

class GateBPublicWsInputsControllerError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBPublicWsInputsControllerError';
    this.code = ERROR_CODE;
    this.stack = `GateBPublicWsInputsControllerError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBPublicWsInputsControllerError();
}

function exactPlainObject(value, fields) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== fields.length) fail();
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, fields[index]);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string' || !fields.includes(keys[index])) fail();
  }
  return value;
}

function exactString(value, maximumBytes = 4096) {
  if (typeof value !== 'string' || value.length < 1 ||
      Buffer.byteLength(value, 'utf8') > maximumBytes ||
      /[\u0000-\u001f\u007f]/u.test(value)) fail();
  return value;
}

function exactAbsolutePath(value) {
  exactString(value);
  if (!isAbsolute(value) || resolve(value) !== value) fail();
  return value;
}

function exactInitialOptions(value) {
  exactPlainObject(value, [
    'acknowledgements', 'quickTunnel', 'rpcEndpoint', 'runName',
    'schemaVersion', 'workspaceRoot',
  ]);
  if ((value.schemaVersion !== 1 && value.schemaVersion !== 2) ||
      typeof value.runName !== 'string' ||
      !RUN_NAME.test(value.runName)) fail();
  exactAbsolutePath(value.workspaceRoot);
  exactString(value.rpcEndpoint);
  if (value.schemaVersion === 2 && value.rpcEndpoint !== GATE_B_CURRENT_TESTNET_WSS_ENDPOINT) {
    fail();
  }
  exactPlainObject(value.acknowledgements, ['live', 'operatorTrust']);
  if (value.acknowledgements.live !== GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.live ||
      value.acknowledgements.operatorTrust !==
        GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.operatorTrust) fail();
  exactPlainObject(value.quickTunnel, [
    'cloudflaredExecutable', 'sourcePin', 'telemetryAcknowledgement', 'telemetryMode',
  ]);
  exactAbsolutePath(value.quickTunnel.cloudflaredExecutable);
  if (typeof value.quickTunnel.sourcePin !== 'string' ||
      !LOWERCASE_HASH_64.test(value.quickTunnel.sourcePin) ||
      !Object.values(GATE_B_QUICK_TUNNEL_TELEMETRY_MODES)
        .includes(value.quickTunnel.telemetryMode) ||
      !Object.values(GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS)
        .includes(value.quickTunnel.telemetryAcknowledgement)) fail();
  const expectedTelemetryAcknowledgement = value.quickTunnel.telemetryMode ===
    GATE_B_QUICK_TUNNEL_TELEMETRY_MODES.EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED
    ? GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS
      .EXTERNAL_SENTRY_EGRESS_CONTROL_ATTESTED
    : GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS
      .ACCEPT_POSSIBLE_ERROR_TELEMETRY;
  if (value.quickTunnel.telemetryAcknowledgement !== expectedTelemetryAcknowledgement) fail();
  return Object.freeze({
    acknowledgements: Object.freeze({
      live: value.acknowledgements.live,
      operatorTrust: value.acknowledgements.operatorTrust,
    }),
    quickTunnel: Object.freeze({
      cloudflaredExecutable: value.quickTunnel.cloudflaredExecutable,
      sourcePin: value.quickTunnel.sourcePin,
      telemetryAcknowledgement: value.quickTunnel.telemetryAcknowledgement,
      telemetryMode: value.quickTunnel.telemetryMode,
    }),
    rpcEndpoint: value.rpcEndpoint,
    runName: value.runName,
    schemaVersion: value.schemaVersion,
    workspaceRoot: value.workspaceRoot,
  });
}

function exactReview(value) {
  exactPlainObject(value, ['acknowledgements', 'reviewedConfigDigest', 'schemaVersion']);
  if ((value.schemaVersion !== 1 && value.schemaVersion !== 2) ||
      typeof value.reviewedConfigDigest !== 'string' ||
      !LOWERCASE_HASH_64.test(value.reviewedConfigDigest)) fail();
  const fields = value.schemaVersion === 1
    ? ['payment', 'publication', 'transportException']
    : ['payment', 'publication'];
  const expected = value.schemaVersion === 1
    ? GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS
    : GATE_B_CURRENT_TESTNET_WSS_INPUT_ACKNOWLEDGEMENTS;
  exactPlainObject(value.acknowledgements, fields);
  for (const field of fields) if (value.acknowledgements[field] !== expected[field]) fail();
  const acknowledgements = {
    payment: value.acknowledgements.payment,
    publication: value.acknowledgements.publication,
  };
  if (value.schemaVersion === 1) {
    acknowledgements.transportException = value.acknowledgements.transportException;
  }
  return Object.freeze({
    acknowledgements: Object.freeze(acknowledgements),
    reviewedConfigDigest: value.reviewedConfigDigest,
    schemaVersion: value.schemaVersion,
  });
}

function exactRunAuthorization(value) {
  exactPlainObject(value, ['acknowledgement', 'schemaVersion']);
  if ((value.schemaVersion !== 1 && value.schemaVersion !== 2) ||
      value.acknowledgement !== GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.run) fail();
  return Object.freeze({
    acknowledgement: GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.run,
    schemaVersion: value.schemaVersion,
  });
}

async function runPublicWsOnce(options, beforeOriginBind) {
  return supervisePublicWsOnceChild('run-public-ws-once', options, { beforeOriginBind });
}

async function preflightCurrentTestnetOnce(options) {
  return options.executionMode === CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode
    ? preflightCurrentTestnetWssOnceRun(options)
    : preflightPublicWsOnceRun(options);
}

function exactDependencies(value, defaultQuickTunnelLauncher, defaultPublicWsLauncher) {
  const output = {
    assertQuickTunnelReady: assertGateBQuickTunnelReady,
    launchPublicWsInputs: defaultPublicWsLauncher,
    launchQuickTunnel: defaultQuickTunnelLauncher,
    preflightPublicWsOnce: preflightCurrentTestnetOnce,
    runPublicWsOnce,
    stopQuickTunnel: stopGateBQuickTunnel,
    waitQuickTunnelClosed: waitGateBQuickTunnelClosed,
  };
  if (value !== undefined) {
    const fields = Object.hasOwn(value, 'runPublicWsOnce')
      ? Object.keys(output)
      : Object.keys(output).filter(field => field !== 'runPublicWsOnce');
    exactPlainObject(value, fields);
    for (let index = 0; index < fields.length; index += 1) {
      output[fields[index]] = value[fields[index]];
    }
  }
  for (const dependency of Object.values(output)) {
    if (typeof dependency !== 'function') fail();
  }
  return Object.freeze(output);
}

function exactResult(value, field, expected) {
  exactPlainObject(value, [field]);
  if (value[field] !== expected) fail();
  return true;
}

function exactLease(value) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== null || REFLECT_OWN_KEYS(value).length !== 0 ||
      !Object.isFrozen(value)) fail();
  return value;
}

function exactNativePromise(value) {
  if (!IS_PROMISE(value) || IS_PROXY(value) ||
      GET_PROTOTYPE_OF(value) !== Promise.prototype ||
      GET_OWN_PROPERTY_DESCRIPTOR(value, 'then') !== undefined) fail();
  return value;
}

function callDependency(dependency, args) {
  return exactNativePromise(Reflect.apply(dependency, undefined, args));
}

function recordFor(capability) {
  const record = RECORDS.get(capability);
  if (!record) fail();
  return record;
}

function createCapability(record) {
  const capability = Object.freeze(Object.create(null));
  RECORDS.set(capability, record);
  record.capability = capability;
  return capability;
}

function isFinal(record) {
  return record.status === CLOSED || record.status === CLOSED_PENDING ||
    record.status === QUARANTINED;
}

function current(record, generation, phase) {
  return !record.cancelled && record.generation === generation && record.phase === phase;
}

async function invokeActiveStage(record, invocation, quarantineRisk = true) {
  if (record.activeStagePromise !== undefined) fail();
  let releaseBarrier;
  const barrier = new Promise(resolve => { releaseBarrier = resolve; });
  record.activeStagePromise = barrier;
  record.activeStageQuarantineRisk = quarantineRisk;
  let promise;
  try {
    promise = exactNativePromise(Reflect.apply(invocation, undefined, []));
    return await promise;
  } catch {
    if (quarantineRisk) record.workspaceQuarantined = true;
    throw new GateBPublicWsInputsControllerError();
  } finally {
    releaseBarrier(true);
    if (record.activeStagePromise === barrier) {
      record.activeStagePromise = undefined;
      record.activeStageQuarantineRisk = false;
    }
  }
}

async function settleNativePromise(promise) {
  if (promise === undefined) return Object.freeze({ fulfilled: false, value: undefined });
  try {
    return Object.freeze({ fulfilled: true, value: await promise });
  } catch {
    return Object.freeze({ fulfilled: false, value: undefined });
  }
}

async function closeOwnedTunnel(record) {
  if (!record.lease) return true;
  return invokeActiveStage(record, () => {
    let stopPromise;
    let waitPromise;
    try {
      stopPromise = callDependency(record.dependencies.stopQuickTunnel, [record.lease]);
      if (stopPromise === record.stopPromise) stopPromise = undefined;
    } catch {}
    try {
      waitPromise = callDependency(record.dependencies.waitQuickTunnelClosed, [record.lease]);
      if (waitPromise === record.stopPromise) waitPromise = undefined;
    } catch {}
    return (async () => {
      const [stopOutcome, waitOutcome] = await Promise.all([
        settleNativePromise(stopPromise),
        settleNativePromise(waitPromise),
      ]);
      return stopOutcome.fulfilled && stopOutcome.value === true &&
        waitOutcome.fulfilled && waitOutcome.value === true;
    })();
  });
}

async function finishCloseRecord(record, activeStage) {
  if (activeStage !== undefined) {
    try { await activeStage; } catch {}
  }
  let closureProved = false;
  try {
    closureProved = await closeOwnedTunnel(record);
  } catch {}
  record.status = closureProved && !record.workspaceQuarantined
    ? record.runSucceeded ? CLOSED_PENDING : CLOSED
    : QUARANTINED;
  record.phase = record.status === QUARANTINED ? 'QUARANTINED' : 'CLOSED';
  return record.status;
}

function finalStatusPromise(status) {
  return (async () => status)();
}

function closeRecord(record, forceQuarantine) {
  if (isFinal(record)) return finalStatusPromise(record.status);
  if (forceQuarantine || record.activeStageQuarantineRisk === true) {
    record.workspaceQuarantined = true;
  }
  record.cancelled = true;
  record.generation += 1;
  record.phase = 'STOPPING';
  record.status = undefined;
  if (record.stopPromise) return record.stopPromise;
  const activeStage = record.activeStagePromise;
  let resolveTerminal;
  record.stopPromise = new Promise(resolve => { resolveTerminal = resolve; });
  void finishCloseRecord(record, activeStage).then(
    resolveTerminal,
    () => {
      record.workspaceQuarantined = true;
      record.status = QUARANTINED;
      record.phase = 'QUARANTINED';
      resolveTerminal(QUARANTINED);
    },
  );
  return record.stopPromise;
}

async function prepareGateBPublicWsInputsForReviewInternal(
  options,
  injected,
  defaultQuickTunnelLauncher,
  defaultPublicWsLauncher,
) {
  const snapshot = exactInitialOptions(options);
  const dependencies = exactDependencies(
    injected,
    defaultQuickTunnelLauncher,
    defaultPublicWsLauncher,
  );
  const record = {
    cancelled: false,
    activeStagePromise: undefined,
    activeStageQuarantineRisk: false,
    capability: undefined,
    dependencies,
    generation: 1,
    initial: snapshot,
    lease: undefined,
    phase: 'PREPARING',
    status: undefined,
    stopPromise: undefined,
    runAttempted: false,
    runSucceeded: false,
    executionMode: undefined,
    transportException: undefined,
    tunnelBootstrap: Object.freeze({
      cloudflaredExecutable: snapshot.quickTunnel.cloudflaredExecutable,
      operation: GATE_B_QUICK_TUNNEL_OPERATIONS.START,
      schemaVersion: 1,
      sourcePin: snapshot.quickTunnel.sourcePin,
      telemetryAcknowledgement: snapshot.quickTunnel.telemetryAcknowledgement,
      telemetryMode: snapshot.quickTunnel.telemetryMode,
      workspaceRoot: snapshot.workspaceRoot,
    }),
    workspaceQuarantined: false,
  };
  const capability = createCapability(record);
  const generation = record.generation;
  try {
    const provisioned = await invokeActiveStage(record, () => callDependency(
      dependencies.launchPublicWsInputs,
      [{
      operation: GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT,
      rpcEndpoint: snapshot.rpcEndpoint,
      schemaVersion: snapshot.schemaVersion,
      workspaceRoot: snapshot.workspaceRoot,
      }],
    ));
    exactResult(provisioned, 'status', 'endpoint-provisioned');
    if (!current(record, generation, 'PREPARING')) return capability;
    const lease = exactLease(await invokeActiveStage(record, () => callDependency(
      dependencies.launchQuickTunnel,
      [record.tunnelBootstrap],
    )));
    if (record.lease !== undefined) fail();
    record.lease = lease;
    if (!current(record, generation, 'PREPARING')) {
      await closeRecord(record, false);
      return capability;
    }
    const readiness = await invokeActiveStage(record, () => callDependency(
      dependencies.assertQuickTunnelReady,
      [lease],
    ));
    if (readiness !== true) fail();
    if (!current(record, generation, 'PREPARING')) {
      await closeRecord(record, false);
      return capability;
    }
    const prepared = await invokeActiveStage(record, () => callDependency(
      dependencies.launchPublicWsInputs,
      [{
      acknowledgements: {
        live: snapshot.acknowledgements.live,
        operatorTrust: snapshot.acknowledgements.operatorTrust,
      },
      operation: GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PREPARE,
      runName: snapshot.runName,
      schemaVersion: snapshot.schemaVersion,
      workspaceRoot: snapshot.workspaceRoot,
      }],
    ));
    exactResult(prepared, 'status', 'prepared');
    if (!current(record, generation, 'PREPARING')) {
      await closeRecord(record, true);
      return capability;
    }
    record.phase = 'REVIEW_REQUIRED';
    record.status = REVIEW_REQUIRED;
    return capability;
  } catch {
    await closeRecord(record, true);
    return capability;
  }
}

export function prepareGateBPublicWsInputsForReview(options, injected) {
  return prepareGateBPublicWsInputsForReviewInternal(
    options,
    injected,
    launchGateBQuickTunnel,
    launchGateBPublicWsInputs,
  );
}

export function prepareGateBPublicWsInputsForReviewInInheritedProcessGroup(options, injected) {
  return prepareGateBPublicWsInputsForReviewInternal(
    options,
    injected,
    launchGateBQuickTunnelInInheritedProcessGroup,
    launchGateBPublicWsInputsInInheritedProcessGroup,
  );
}

export async function authorizeAndPreflightGateBPublicWsInputs(capability, review) {
  const record = recordFor(capability);
  if (isFinal(record)) return record.status;
  if (record.phase !== 'REVIEW_REQUIRED') return closeRecord(record, false);
  let snapshot;
  try {
    snapshot = exactReview(review);
    if (snapshot.schemaVersion !== record.initial.schemaVersion) fail();
  } catch {
    return closeRecord(record, false);
  }
  if (record.phase !== 'REVIEW_REQUIRED' || record.cancelled) {
    return closeRecord(record, false);
  }
  record.phase = 'AUTHORIZING';
  record.status = undefined;
  record.generation += 1;
  const generation = record.generation;
  try {
    const readiness = await invokeActiveStage(record, () => callDependency(
      record.dependencies.assertQuickTunnelReady,
      [record.lease],
    ));
    if (readiness !== true) fail();
    if (!current(record, generation, 'AUTHORIZING')) return closeRecord(record, false);
    const authorizationAcknowledgements = {
      payment: snapshot.acknowledgements.payment,
      publication: snapshot.acknowledgements.publication,
    };
    if (snapshot.schemaVersion === 1) {
      authorizationAcknowledgements.transportException =
        snapshot.acknowledgements.transportException;
    }
    const authorized = await invokeActiveStage(record, () => callDependency(
      record.dependencies.launchPublicWsInputs,
      [{
        acknowledgements: authorizationAcknowledgements,
        operation: GATE_B_PUBLIC_WS_INPUT_OPERATIONS.AUTHORIZE,
        reviewedConfigDigest: snapshot.reviewedConfigDigest,
        runName: record.initial.runName,
        schemaVersion: snapshot.schemaVersion,
        workspaceRoot: record.initial.workspaceRoot,
      }],
    ));
    exactResult(authorized, 'status', 'authorized');
    if (!current(record, generation, 'AUTHORIZING')) return closeRecord(record, true);
    const root = record.initial.workspaceRoot;
    const preflightOptions = {
      authorizationPath: join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization),
      buyerRpcPath: join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc),
      buyerWalletPath: join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet),
      configPath: join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig),
      facilitatorRpcPath: join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc),
      runName: record.initial.runName,
      workspaceRoot: root,
    };
    if (snapshot.schemaVersion === 1) {
      preflightOptions.transportException = snapshot.acknowledgements.transportException;
    } else {
      preflightOptions.executionMode = CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode;
    }
    const preflight = await invokeActiveStage(record, () => callDependency(
      record.dependencies.preflightPublicWsOnce,
      [preflightOptions],
    ));
    exactResult(preflight, 'valid', true);
    if (!current(record, generation, 'AUTHORIZING')) return closeRecord(record, true);
    record.phase = 'PREFLIGHT_VALID';
    record.status = PREFLIGHT_VALID;
    record.transportException = snapshot.acknowledgements.transportException;
    record.executionMode = snapshot.schemaVersion === 2
      ? CURRENT_TESTNET_WSS_ONCE_POLICY.executionMode
      : undefined;
    return record.status;
  } catch {
    return closeRecord(record, true);
  }
}

export async function executeGateBPublicWsInputsOnce(
  capability,
  authorization,
  beforeOriginBind,
) {
  const record = recordFor(capability);
  if (record.runAttempted) {
    return closeRecord(record, true);
  }
  // Every Phase-3 call consumes the process-local RUN capability, including an
  // early, late, malformed, cancelled, duplicate, or reentrant call.
  record.runAttempted = true;
  if (isFinal(record)) return record.status;
  if (record.phase !== 'PREFLIGHT_VALID' || record.cancelled) {
    return closeRecord(record, true);
  }
  try {
    const runAuthorization = exactRunAuthorization(authorization);
    if (runAuthorization.schemaVersion !== record.initial.schemaVersion) fail();
    if (typeof beforeOriginBind !== 'function' || IS_PROXY(beforeOriginBind)) fail();
  } catch {
    return closeRecord(record, true);
  }
  record.phase = 'RUNNING';
  record.status = undefined;
  record.generation += 1;
  const generation = record.generation;
  try {
    const readiness = await invokeActiveStage(record, () => callDependency(
      record.dependencies.assertQuickTunnelReady,
      [record.lease],
    ));
    if (readiness !== true || !current(record, generation, 'RUNNING')) fail();
    const root = record.initial.workspaceRoot;
    const runOptions = {
      authorizationPath: join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization),
      buyerRpcPath: join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc),
      buyerWalletPath: join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet),
      configPath: join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig),
      facilitatorRpcPath: join(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc),
      runName: record.initial.runName,
      workspaceRoot: root,
    };
    if (record.initial.schemaVersion === 1) {
      runOptions.transportException = record.transportException;
    } else {
      runOptions.executionMode = record.executionMode;
    }
    const result = await invokeActiveStage(record, () => callDependency(
      record.dependencies.runPublicWsOnce,
      [runOptions, beforeOriginBind],
    ));
    exactResult(result, 'status', 'pending-independent-verification');
    if (!current(record, generation, 'RUNNING')) fail();
    record.runSucceeded = true;
    record.phase = 'PENDING';
    record.status = PENDING;
    return record.status;
  } catch {
    return closeRecord(record, true);
  }
}

export function getGateBPublicWsInputsControllerStatus(capability) {
  const record = recordFor(capability);
  if (typeof record.status !== 'string') fail();
  return record.status;
}

export function stopGateBPublicWsInputsController(capability) {
  const record = recordFor(capability);
  if (isFinal(record)) return Promise.resolve(record.status);
  return closeRecord(record, false);
}

export async function waitGateBPublicWsInputsControllerClosed(capability) {
  const record = recordFor(capability);
  if (!record.stopPromise && !isFinal(record)) closeRecord(record, false);
  if (record.stopPromise) return record.stopPromise;
  return record.status;
}
