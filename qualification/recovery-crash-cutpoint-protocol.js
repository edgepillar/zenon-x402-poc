import { types as utilTypes } from 'node:util';

const F = Object.freeze, K = Reflect.ownKeys, D = Object.getOwnPropertyDescriptor;
const P = Object.getPrototypeOf, O = Object.hasOwn, IS_PROXY = utilTypes.isProxy;
const HASH = /^[0-9a-f]{64}$/, ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CONTEXT = ['runId', 'sourceRowsSha256', 'paymentHash', 'checkpointSha256', 'checkpointPinsSha256'];
const COMMON = ['protocolVersion', 'event', 'runId', 'sourceRowsSha256', 'pid'];
const ORIGINAL = [...COMMON, 'grantId', 'requestId', 'originalRequestSha256',
  'paymentHash', 'checkpointSha256', 'checkpointPinsSha256'];
const READY = [...ORIGINAL, 'ownerEpoch', 'retainedOriginals', 'dispatchIntents',
  'responseObservations', 'backendExecutions', 'consumedUnits', 'availableUnits',
  'payerCloseRequested', 'backendCloseRequested'];
const RECOVERED = [...READY, 'samePhysicalFiles', 'backendStatus', 'clientStatus',
  'quarantine', 'recoveryDispatches', 'recoverySignatures', 'payerStoreCloseOutcome',
  'payerOwnerCloseOutcome', 'backendStoreCloseOutcome', 'cachedOwnerClosePromise',
  'authority', 'deliveryConfirmed'];
const TERMINATED = ['pid', 'code', 'signal', 'stdoutComplete', 'stderrComplete', 'ipcClosed'];

function error() {
  const code = 'RECOVERY_CRASH_CUTPOINT_PROTOCOL_REJECTED', e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code });
  return F(e);
}
function exact(value, names) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || P(value) !== Object.prototype || K(value).length !== names.length) throw error();
  const result = {};
  for (const name of names) {
    const d = D(value, name);
    if (!d || !O(d, 'value') || d.enumerable !== true) throw error();
    Object.defineProperty(result, name, { value: d.value, enumerable: true });
  }
  return F(result);
}
function integer(value) { return Number.isSafeInteger(value) && value > 0 && !Object.is(value, -0); }
function pid(value) { return integer(value) && value <= 2147483647; }
function identifier(value) { return typeof value === 'string' && ID.test(value); }
function hash(value) { return typeof value === 'string' && HASH.test(value); }

/**
 * Protocol DATA for the owned two-process P2 qualification supervisor.
 * No spawn, signal, SQLite, signer, timer, filesystem, transport or payment call.
 * A declared message is NOT authenticated native evidence or action authority.
 *
 * Freeze the independent original witness BEFORE dispatch. The clean-exit
 * historical recipe cannot qualify an abrupt-death cutpoint. Only a requested
 * SIGKILL followed by complete matching seed termination may open the recovery
 * phase. The supervisor must observe actual ChildProcess/native events, pin
 * source/tools/files and obtain separate native approval; this DTO machine
 * cannot supply any of those premises.
 *
 * One attempt, no retry/reset/replacement. Any invalid event latches FAILED.
 * The original checkpoint/request commitments never change across processes.
 * Payer CHILD_UNKNOWN is retained even if its one native store close returned.
 * Completion remains DECLARED_PROTOCOL_COMPLETE, never native crash/durability,
 * independent finalization, funding/grant authenticity, delivery or production.
 */
export function createRecoveryCrashCutpointProtocol(context, seedPid) {
  if (arguments.length !== 2) throw error();
  const expected = exact(context, CONTEXT);
  if (!pid(seedPid) || !CONTEXT.every(name => hash(expected[name]))) throw error();
  let phase = 'SEED_STARTED', witness = null, ready = null, recoveryPid = null;
  let killRequested = false, killAccepted = false, seedClosed = false;
  let recoveryAuthorized = false, recoveryClosed = false, finalView = null;
  function reject() { phase = 'FAILED'; throw error(); }
  function capture(value, names) { try { return exact(value, names); } catch { return reject(); } }
  function at(required) { if (phase !== required) reject(); }
  function common(message, event, processId) {
    if (message.protocolVersion !== 1 || message.event !== event || message.pid !== processId
        || message.runId !== expected.runId || message.sourceRowsSha256 !== expected.sourceRowsSha256) reject();
    return message;
  }
  function original(message) {
    if (!identifier(message.grantId) || !identifier(message.requestId) || !hash(message.originalRequestSha256)
        || message.paymentHash !== expected.paymentHash || message.checkpointSha256 !== expected.checkpointSha256
        || message.checkpointPinsSha256 !== expected.checkpointPinsSha256) reject();
    if (witness !== null && ORIGINAL.some(name => !COMMON.includes(name) && message[name] !== witness[name])) reject();
  }
  function committed(message) {
    original(message);
    if (!integer(message.ownerEpoch) || message.retainedOriginals !== 1 || message.dispatchIntents !== 1
        || message.responseObservations !== 0 || message.backendExecutions !== 1
        || message.consumedUnits !== 1 || message.availableUnits !== 9) reject();
  }
  const captureOriginalWitness = F(function captureOriginalWitness(message) {
    if (arguments.length !== 1) reject(); at('SEED_STARTED');
    const m = common(capture(message, ORIGINAL), 'ORIGINALS_FIXED_BEFORE_DISPATCH', seedPid);
    original(m); witness = m; phase = 'ORIGINALS_FIXED'; return m;
  });
  const captureCommittedCutpoint = F(function captureCommittedCutpoint(message) {
    if (arguments.length !== 1) reject(); at('ORIGINALS_FIXED');
    const m = common(capture(message, READY), 'BACKEND_COMMITTED_BEFORE_RESPONSE', seedPid);
    committed(m);
    if (m.ownerEpoch >= Number.MAX_SAFE_INTEGER || m.payerCloseRequested !== false
        || m.backendCloseRequested !== false) reject();
    ready = m; phase = 'COMMIT_CUTPOINT_FIXED'; return m;
  });
  const requestSeedKill = F(function requestSeedKill() {
    if (arguments.length !== 0) reject(); at('COMMIT_CUTPOINT_FIXED');
    killRequested = true; phase = 'KILL_REQUESTED';
    return F({ pid: seedPid, signal: 'SIGKILL' });
  });
  const recordSeedKillResult = F(function recordSeedKillResult(accepted) {
    if (arguments.length !== 1) reject(); at('KILL_REQUESTED');
    if (accepted !== true) reject();
    killAccepted = true; phase = 'KILL_ACCEPTED'; return undefined;
  });
  const recordSeedTermination = F(function recordSeedTermination(observation) {
    if (arguments.length !== 1) reject(); at('KILL_ACCEPTED');
    const m = capture(observation, TERMINATED);
    if (m.pid !== seedPid || m.code !== null || m.signal !== 'SIGKILL'
        || m.stdoutComplete !== true || m.stderrComplete !== true || m.ipcClosed !== true) reject();
    seedClosed = true; phase = 'SEED_TERMINATED'; return undefined;
  });
  const authorizeRecovery = F(function authorizeRecovery() {
    if (arguments.length !== 0) reject(); at('SEED_TERMINATED');
    recoveryAuthorized = true; phase = 'RECOVERY_AUTHORIZED';
    // This is protocol sequencing only, not permission to spawn/open anything.
    return F({ runId: expected.runId, sourceRowsSha256: expected.sourceRowsSha256,
      seedPid, originalRequestSha256: witness.originalRequestSha256,
      checkpointSha256: witness.checkpointSha256, checkpointPinsSha256: witness.checkpointPinsSha256,
      nativeAuthority: 'NONE' });
  });
  const registerRecoveryPid = F(function registerRecoveryPid(processId) {
    if (arguments.length !== 1) reject(); at('RECOVERY_AUTHORIZED');
    if (!pid(processId) || processId === seedPid) reject();
    recoveryPid = processId; phase = 'RECOVERY_STARTED'; return undefined;
  });
  const captureRecoveredOriginal = F(function captureRecoveredOriginal(message) {
    if (arguments.length !== 1) reject(); at('RECOVERY_STARTED');
    const m = common(capture(message, RECOVERED), 'RECOVERED_ORIGINAL_NO_DISPATCH', recoveryPid);
    committed(m);
    if (m.ownerEpoch !== ready.ownerEpoch + 1 || m.samePhysicalFiles !== true
        || m.backendStatus !== 'CACHED_SUCCESS' || m.clientStatus !== 'CLIENT_RECONCILIATION_REQUIRED'
        || m.quarantine !== 'PERSISTED_UNKNOWN' || m.recoveryDispatches !== 0 || m.recoverySignatures !== 0
        || m.payerCloseRequested !== true || m.backendCloseRequested !== true
        || m.payerStoreCloseOutcome !== 'RETURNED' || m.payerOwnerCloseOutcome !== 'CHILD_UNKNOWN'
        || m.backendStoreCloseOutcome !== 'RETURNED' || m.cachedOwnerClosePromise !== true
        || m.authority !== 'NONE' || m.deliveryConfirmed !== false) reject();
    phase = 'RECOVERY_OBSERVED'; return m;
  });
  const recordRecoveryTermination = F(function recordRecoveryTermination(observation) {
    if (arguments.length !== 1) reject(); at('RECOVERY_OBSERVED');
    const m = capture(observation, TERMINATED);
    if (m.pid !== recoveryPid || m.code !== 0 || m.signal !== null
        || m.stdoutComplete !== true || m.stderrComplete !== true || m.ipcClosed !== true) reject();
    recoveryClosed = true; phase = 'DECLARED_PROTOCOL_COMPLETE'; return undefined;
  });
  const snapshot = F(function snapshot() {
    if (arguments.length !== 0) throw error();
    if (phase === 'DECLARED_PROTOCOL_COMPLETE' && finalView !== null) return finalView;
    const result = F({ protocolVersion: 1, phase, killRequested, killAccepted, seedClosed,
      recoveryAuthorized, recoveryClosed, independentOriginalFixedBeforeDispatch: witness !== null,
      originalCheckpointRetained: witness !== null, nativeEventsAuthenticated: false,
      nativeCrashQualified: false, physicalDurabilityQualified: false,
      payerOwnerCloseOutcome: phase === 'DECLARED_PROTOCOL_COMPLETE' ? 'CHILD_UNKNOWN' : 'NOT_ESTABLISHED',
      authority: 'NONE', mayDispatchService: false, maySignPayment: false, deliveryConfirmed: false });
    if (phase === 'DECLARED_PROTOCOL_COMPLETE') finalView = result;
    return result;
  });
  return F({ captureOriginalWitness, captureCommittedCutpoint, requestSeedKill, recordSeedKillResult,
    recordSeedTermination, authorizeRecovery, registerRecoveryPid, captureRecoveredOriginal,
    recordRecoveryTermination, snapshot });
}
