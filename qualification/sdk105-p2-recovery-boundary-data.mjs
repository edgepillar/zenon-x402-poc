// DATA validation only. Caller-supplied receipts are not native process proof.
import { types } from 'node:util';

const F = Object.freeze, D = Reflect.getOwnPropertyDescriptor;
const EXPECTED = F(['token', 'transactionHash', 'grantId', 'requestId', 'paymentPinsSha256', 'servicePinsSha256']);
const FRAME = F(['boundaryVersion', 'stage', ...EXPECTED, 'executions', 'commandStarts', 'commandResults',
  'responseResultWritten', 'committedRevision']);
const EXIT = F(['boundaryObserved', 'plannedKillCalls', 'failureStopCalls', 'exitObserved', 'closeObserved',
  'exitCode', 'exitSignal', 'closeCode', 'closeSignal']);
function fail() { throw new TypeError('SDK105_P2_BOUNDARY_DATA_REFUSED'); }
function data(value, fields) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== fields.length) fail();
  const out = {};
  for (const field of fields) {
    const d = D(value, field);
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail();
    out[field] = d.value;
  }
  return out;
}
export function captureP2CommitBoundaryData(message, expectations) {
  if (arguments.length !== 2) fail();
  const m = data(message, FRAME), e = data(expectations, EXPECTED);
  for (const field of EXPECTED) {
    const pattern = field === 'grantId' || field === 'requestId' ? /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/ : /^[0-9a-f]{64}$/;
    if (typeof e[field] !== 'string' || !pattern.test(e[field]) || m[field] !== e[field]) fail();
  }
  if (m.boundaryVersion !== 1 || m.stage !== 'COMMITTED_BEFORE_SERVICE_HTTP_CONTINUATION'
      || m.executions !== 1 || m.commandStarts !== 6 || m.commandResults !== 5 || m.responseResultWritten !== false
      || !Number.isSafeInteger(m.committedRevision) || m.committedRevision < 1) fail();
  return F(m);
}
export function captureP2TerminatedChildData(observation) {
  if (arguments.length !== 1) fail();
  const v = data(observation, EXIT);
  if (v.boundaryObserved !== true || v.plannedKillCalls !== 1 || v.failureStopCalls !== 0
      || v.exitObserved !== true || v.closeObserved !== true || v.exitCode !== null || v.closeCode !== null
      || v.exitSignal !== 'SIGKILL' || v.closeSignal !== 'SIGKILL') fail();
  return F({ ...v, matched: true, evidence: 'CALLER_SUPPLIED_RECEIPTS_ONLY', authority: 'NONE',
    physicalResourceRelease: 'NOT_QUALIFIED' });
}
