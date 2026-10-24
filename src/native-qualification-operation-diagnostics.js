import { types as utilTypes } from 'node:util';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const STAGES = F([
  'BOOT', 'WAIT_PARENT_INPUT', 'LOAD_SEED_MODULES', 'READ_TEST_TLS', 'RESERVE_APPLICATION_PORT',
  'CREATE_SYNTHETIC_IDENTITIES', 'CREATE_GRANT_OPERATOR', 'START_RPC_PEER', 'CONSTRUCT_APPLICATION',
  'START_APPLICATION', 'READ_UNPAID_CHALLENGE', 'BIND_CHALLENGE_AND_REFERENCE', 'CREATE_EMPTY_V6',
  'CLOSE_EMPTY_V6', 'OPEN_PAYER_CLIENT', 'PREPARE_ORIGINAL_FUNDING', 'RETAIN_FUNDING_PINS',
  'FIX_FUNDING_WITNESS_WITH_PARENT', 'COMMIT_ORIGINAL_FUNDING', 'SUBMIT_ORIGINAL_FUNDING',
  'OBSERVE_FIRST_PENDING', 'OBSERVE_SECOND_PENDING', 'ACTIVATE_PRIMARY_GRANT', 'ACTIVATE_FOREIGN_GRANT',
  'INITIALIZE_DURABLE_EXECUTION', 'ADMIT_PRIMARY_GRANT', 'HANDOFF_TO_SERVICE', 'CREATE_SERVICE_ORIGINALS',
  'CHECK_FOREIGN_GRANT_REFUSAL', 'RETAIN_SERVICE_PINS', 'READ_BEFORE_DISPATCH',
  'FIX_SERVICE_WITNESS_WITH_PARENT', 'SUBMIT_SERVICE_ORIGINAL', 'READ_COMMITTED_CUTPOINT',
  'SEND_COMMITTED_CUTPOINT', 'WAIT_SELECTED_SIGKILL', 'CAPTURE_RECOVERY_ORIGINALS',
  'READ_BEFORE_RECOVERY', 'LOAD_RECOVERY_MODULES', 'OPEN_EXISTING_BACKEND', 'OPEN_RECOVERY_READER',
  'READ_RECOVERY_CHECKPOINT', 'READ_RECOVERY_BACKEND_STATE', 'CLOSE_RECOVERY_READER',
  'CLOSE_RECOVERY_BACKEND', 'READ_AFTER_RECOVERY', 'SEND_RECOVERED_ORIGINAL', 'DISCONNECT_RECOVERY_IPC',
]);
const PHASES = new Set([
  'LISTENING', 'AWAITING_INDEPENDENT_PINS', 'LOCAL_STORE_READBACK_MATCHED', 'FUNDING_INTAKE_BOUND',
  'SUBMISSION_OUTCOME_UNKNOWN', 'FUNDING_INTAKE_REJECTED', 'FUNDING_INTAKE_CONFLICT',
  'PENDING', 'SETTLED', 'EXHAUSTED', 'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED',
]);
const ERROR_CODES = new Set([
  'ERR_ASSERTION', 'ERR_ACCESS_DENIED', 'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE',
  'ABORT_ERR', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EADDRINUSE',
  'zenon_native_funding_service_client_operation_unavailable',
  'zenon_native_funding_service_client_funding_unavailable',
  'zenon_native_funding_service_client_close_unknown',
  'issued_funding_post_application_binding_rejected',
]);
const KIND = 'PINNED_SOURCE_OPERATION_CURSOR_NOT_NATIVE_AUTHENTICATION';
const FIELDS = ['diagnosticVersion', 'kind', 'stagesEntered', 'lastStage', 'lastReturnedPhase',
  'failed', 'safeErrorCode', 'measurementUnknown', 'authority'];

/** A source cursor, not evidence that SQL/transport/settlement succeeded.
 * No callbacks, clocks, I/O, SDK, keys, signing, payment or retry capability.
 * Mutators ALWAYS return undefined: diagnostic failure must not throw into a
 * real operation or make an uncertain operation look successful. No raw error,
 * cause, message, expected/actual value, stack or returned record is retained.
 */
export function createNativeQualificationOperationDiagnostics() {
  if (arguments.length !== 0) throw invalid();
  let stagesEntered = 0, lastStage = null, lastReturnedPhase = null;
  let failed = false, safeErrorCode = null, measurementUnknown = false;
  const mark = F(function mark(stage) {
    try {
      if (arguments.length !== 1 || failed || !STAGES.includes(stage) || stagesEntered >= 128) {
        measurementUnknown = true; return undefined;
      }
      stagesEntered++; lastStage = stage; lastReturnedPhase = null;
    } catch { measurementUnknown = true; }
    return undefined;
  });
  const observeReturnedPhase = F(function observeReturnedPhase(record) {
    try {
      if (arguments.length !== 1 || failed || lastStage === null) { measurementUnknown = true; return undefined; }
      if (record === null || typeof record !== 'object' || utilTypes.isProxy(record)) {
        lastReturnedPhase = 'UNAVAILABLE'; return undefined;
      }
      const field = D(record, 'phase');
      lastReturnedPhase = field && OWN(field, 'value') && PHASES.has(field.value) ? field.value : 'UNAVAILABLE';
    } catch { measurementUnknown = true; }
    return undefined;
  });
  const fail = F(function fail(caught) {
    if (failed) return undefined;
    failed = true; safeErrorCode = 'OTHER';
    try {
      if (arguments.length !== 1) { measurementUnknown = true; return undefined; }
      if (caught === null || typeof caught !== 'object' || utilTypes.isProxy(caught)) return undefined;
      const code = D(caught, 'code');
      if (code && OWN(code, 'value') && ERROR_CODES.has(code.value)) safeErrorCode = code.value;
    } catch { measurementUnknown = true; }
    return undefined;
  });
  const snapshot = F(function snapshot() {
    if (arguments.length !== 0) throw invalid();
    return F(Object.assign(Object.create(null), { diagnosticVersion: 1, kind: KIND, stagesEntered, lastStage, lastReturnedPhase,
      failed, safeErrorCode, measurementUnknown, authority: 'NONE' }));
  });
  return F({ mark, observeReturnedPhase, fail, snapshot });
}

/** Strict bounded DATA admission, never authentication of the stated event. */
export function captureNativeQualificationOperationDiagnostic(value) {
  if (arguments.length !== 1 || value === null || typeof value !== 'object' || utilTypes.isProxy(value)
      || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      || Reflect.ownKeys(value).length !== FIELDS.length) throw invalid();
  const out = Object.create(null);
  for (const name of FIELDS) {
    const field = D(value, name);
    if (!field || !OWN(field, 'value') || !field.enumerable) throw invalid();
    Object.defineProperty(out, name, { value: field.value, enumerable: true });
  }
  if (out.diagnosticVersion !== 1 || out.kind !== KIND || out.authority !== 'NONE'
      || !Number.isSafeInteger(out.stagesEntered) || out.stagesEntered < 0 || out.stagesEntered > 128
      || Object.is(out.stagesEntered, -0) || (out.lastStage !== null && !STAGES.includes(out.lastStage))
      || (out.stagesEntered === 0) !== (out.lastStage === null)
      || (out.lastStage === null && out.lastReturnedPhase !== null)
      || (out.lastReturnedPhase !== null && out.lastReturnedPhase !== 'UNAVAILABLE' && !PHASES.has(out.lastReturnedPhase))
      || typeof out.failed !== 'boolean' || typeof out.measurementUnknown !== 'boolean'
      || (out.failed ? out.safeErrorCode !== 'OTHER' && !ERROR_CODES.has(out.safeErrorCode) : out.safeErrorCode !== null)) throw invalid();
  return F(out);
}

function invalid() {
  const code = 'NATIVE_QUALIFICATION_OPERATION_DIAGNOSTIC_REJECTED', e = new TypeError(code);
  Object.defineProperty(e, 'code', { value: code, enumerable: true });
  Object.defineProperty(e, 'stack', { value: 'TypeError: ' + code });
  return F(e);
}
