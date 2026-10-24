import { types as utilTypes } from 'node:util';

const F = Object.freeze, K = Reflect.ownKeys, D = Object.getOwnPropertyDescriptor;
const P = Object.getPrototypeOf, O = Object.hasOwn, IS_PROXY = utilTypes.isProxy;
const HASH = /^[0-9a-f]{64}$/, ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CONTEXT = ['runId', 'sourceRowsSha256'];
const FUNDING = ['paymentHash', 'checkpointSha256', 'checkpointPinsSha256'];
const COMMON = ['protocolVersion', 'event', 'runId', 'sourceRowsSha256', 'pid'];
const FUNDING_MESSAGE = [...COMMON, ...FUNDING];
const ORIGINAL = [...COMMON, 'grantId', 'requestId', 'originalRequestSha256', ...FUNDING];
const READY = [...ORIGINAL, 'ownerEpoch', 'retainedOriginals', 'dispatchIntents',
  'responseObservations', 'backendExecutions', 'consumedUnits', 'heldUnits', 'availableUnits',
  'backendRequestState', 'backendFencePhase', 'backendTerminalClassification', 'executorCalls',
  'payerCloseRequested', 'backendCloseRequested'];
const RECOVERED = [...READY, 'samePhysicalFiles', 'backendStatus', 'clientStatus',
  'quarantine', 'recoveryDispatches', 'recoverySignatures', 'payerStoreCloseOutcome',
  'payerOwnerCloseOutcome', 'backendStoreCloseOutcome', 'cachedOwnerClosePromise',
  'backendReconciliationPerformed', 'authority', 'deliveryConfirmed'];
const TERMINATED = ['pid', 'code', 'signal', 'stdoutComplete', 'stderrComplete', 'ipcClosed'];

function error() {
  const code = 'RECOVERY_PREPARED_CRASH_PROTOCOL_REJECTED', e = new TypeError(code);
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
 * Dedicated PREPARED-before-executor crash protocol DATA, not V2 compatibility.
 * No spawn, signal, SQLite, signer, timer, filesystem, transport or payment call.
 * Declared process messages do NOT authenticate native events or grant action.
 *
 * The actual store's prepareDurableExecution COMMIT leaves the ledger request
 * EXECUTING, the execution fence PREPARED/terminal NONE, zero executor calls,
 * two units HELD and zero consumed. Do not normalize that into committed
 * success, an unused grant, a refund or automatic NOT_INVOKED recovery.
 *
 * The passive existing-backend recovery reader must keep the original
 * PREPARED state and return RECONCILIATION_REQUIRED. It must NOT call the
 * separate mutating recoverDurableExecutions operation. Persistent payer
 * UNKNOWN and CHILD_UNKNOWN remain even after its one native store close.
 *
 * Funding witness precedes submission; service witness precedes dispatch.
 * One exact owned SIGKILL followed by complete exit/EOF/IPC may precede a
 * distinct recovery PID. The native child/parent/profile still require their
 * own complete source review and separate finite native approval. No old
 * committed-case, V3 clean or hosted-CI allowance authorizes this new cutpoint.
 * Any invalid event latches FAILED; no retry, replacement, held-credit release,
 * authority, delivery, physical durability, live pilot or production claim.
 */
export function createPreparedRecoveryCrashCutpointProtocol(context, seedPid) {
  if (arguments.length !== 2) throw error();
  const expected = exact(context, CONTEXT);
  if (!pid(seedPid) || !CONTEXT.every(name => hash(expected[name]))) throw error();
  let phase = 'SEED_STARTED', funding = null, witness = null, ready = null, recoveryPid = null;
  let killRequested = false, killAccepted = false, seedClosed = false;
  let recoveryAuthorized = false, recoveryClosed = false, finalView = null;
  function reject() { phase = 'FAILED'; throw error(); }
  function capture(value, names) { try { return exact(value, names); } catch { return reject(); } }
  function at(required) { if (phase !== required) reject(); }
  function common(message, event, processId) {
    if (message.protocolVersion !== 3 || message.event !== event || message.pid !== processId
        || message.runId !== expected.runId || message.sourceRowsSha256 !== expected.sourceRowsSha256) reject();
    return message;
  }
  function original(message) {
    if (!identifier(message.grantId) || !identifier(message.requestId) || !hash(message.originalRequestSha256)
        || funding === null || message.paymentHash !== funding.paymentHash || message.checkpointSha256 !== funding.checkpointSha256
        || message.checkpointPinsSha256 !== funding.checkpointPinsSha256) reject();
    if (witness !== null && ORIGINAL.some(name => !COMMON.includes(name) && message[name] !== witness[name])) reject();
  }
  function prepared(message) {
    original(message);
    if (!integer(message.ownerEpoch) || message.retainedOriginals !== 1 || message.dispatchIntents !== 1
        || message.responseObservations !== 0 || message.backendExecutions !== 1
        || message.consumedUnits !== 0 || Object.is(message.consumedUnits, -0)
        || message.heldUnits !== 2 || message.availableUnits !== 8
        || message.backendRequestState !== 'EXECUTING' || message.backendFencePhase !== 'PREPARED'
        || message.backendTerminalClassification !== 'NONE' || message.executorCalls !== 0
        || Object.is(message.executorCalls, -0)) reject();
  }
  const captureFundingOriginalWitness = F(function captureFundingOriginalWitness(message) {
    if (arguments.length !== 1) reject(); at('SEED_STARTED');
    const m = common(capture(message, FUNDING_MESSAGE), 'FUNDING_ORIGINAL_FIXED_BEFORE_SUBMISSION', seedPid);
    if (!FUNDING.every(name => hash(m[name]))) reject();
    funding = m; phase = 'FUNDING_ORIGINAL_FIXED'; return m;
  });
  const captureOriginalWitness = F(function captureOriginalWitness(message) {
    if (arguments.length !== 1) reject(); at('FUNDING_ORIGINAL_FIXED');
    const m = common(capture(message, ORIGINAL), 'ORIGINALS_FIXED_BEFORE_DISPATCH', seedPid);
    original(m); witness = m; phase = 'ORIGINALS_FIXED'; return m;
  });
  const capturePreparedCutpoint = F(function capturePreparedCutpoint(message) {
    if (arguments.length !== 1) reject(); at('ORIGINALS_FIXED');
    const m = common(capture(message, READY), 'BACKEND_PREPARED_BEFORE_EXECUTOR', seedPid);
    prepared(m);
    if (m.ownerEpoch >= Number.MAX_SAFE_INTEGER || m.payerCloseRequested !== false
        || m.backendCloseRequested !== false) reject();
    ready = m; phase = 'PREPARED_CUTPOINT_FIXED'; return m;
  });
  const requestSeedKill = F(function requestSeedKill() {
    if (arguments.length !== 0) reject(); at('PREPARED_CUTPOINT_FIXED');
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
    const m = common(capture(message, RECOVERED), 'RECOVERED_PREPARED_NO_DISPATCH', recoveryPid);
    prepared(m);
    if (m.ownerEpoch !== ready.ownerEpoch + 1 || m.samePhysicalFiles !== true
        || m.backendStatus !== 'RECONCILIATION_REQUIRED' || m.clientStatus !== 'CLIENT_RECONCILIATION_REQUIRED'
        || m.quarantine !== 'PERSISTED_UNKNOWN' || m.recoveryDispatches !== 0 || m.recoverySignatures !== 0
        || m.payerCloseRequested !== true || m.backendCloseRequested !== true
        || m.payerStoreCloseOutcome !== 'RETURNED' || m.payerOwnerCloseOutcome !== 'CHILD_UNKNOWN'
        || m.backendStoreCloseOutcome !== 'RETURNED' || m.cachedOwnerClosePromise !== true
        || m.backendReconciliationPerformed !== false || m.authority !== 'NONE' || m.deliveryConfirmed !== false) reject();
    phase = 'RECOVERY_OBSERVED'; return m;
  });
  const recordRecoveryTermination = F(function recordRecoveryTermination(observation) {
    if (arguments.length !== 1) reject(); at('RECOVERY_OBSERVED');
    const m = capture(observation, TERMINATED);
    if (m.pid !== recoveryPid || m.code !== 0 || m.signal !== null
        || m.stdoutComplete !== true || m.stderrComplete !== true || m.ipcClosed !== true) reject();
    recoveryClosed = true; phase = 'DECLARED_PREPARED_PROTOCOL_COMPLETE'; return undefined;
  });
  const snapshot = F(function snapshot() {
    if (arguments.length !== 0) throw error();
    if (phase === 'DECLARED_PREPARED_PROTOCOL_COMPLETE' && finalView !== null) return finalView;
    const result = F({ protocolVersion: 3, cutpointKind: 'PREPARED_BEFORE_EXECUTOR', phase, killRequested, killAccepted, seedClosed,
      fundingOriginalFixedBeforeSubmission: funding !== null,
      recoveryAuthorized, recoveryClosed, independentOriginalFixedBeforeDispatch: witness !== null,
      originalCheckpointRetained: funding !== null, nativeEventsAuthenticated: false,
      nativeCrashQualified: false, physicalDurabilityQualified: false,
      payerOwnerCloseOutcome: phase === 'DECLARED_PREPARED_PROTOCOL_COMPLETE' ? 'CHILD_UNKNOWN' : 'NOT_ESTABLISHED',
      authority: 'NONE', mayDispatchService: false, maySignPayment: false, mayReleaseHeldCredit: false, deliveryConfirmed: false });
    if (phase === 'DECLARED_PREPARED_PROTOCOL_COMPLETE') finalView = result;
    return result;
  });
  return F({ captureFundingOriginalWitness, captureOriginalWitness, capturePreparedCutpoint, requestSeedKill, recordSeedKillResult,
    recordSeedTermination, authorizeRecovery, registerRecoveryPid, captureRecoveredOriginal,
    recordRecoveryTermination, snapshot });
}

