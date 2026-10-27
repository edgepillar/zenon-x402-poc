import assert from 'node:assert/strict';
import { captureP2CommitBoundaryData as FRAME, captureP2TerminatedChildData as EXIT } from './sdk105-p2-recovery-boundary-data.mjs';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_P2_BOUNDARY_DATA, 'declared-receipts-no-native-process');
const expected = { token: '11'.repeat(32), transactionHash: '22'.repeat(32), grantId: 'native.grant',
  requestId: 'native.first', paymentPinsSha256: '33'.repeat(32), servicePinsSha256: '44'.repeat(32) };
const message = { boundaryVersion: 1, stage: 'COMMITTED_BEFORE_SERVICE_HTTP_CONTINUATION', ...expected,
  executions: 1, commandStarts: 6, commandResults: 5, responseResultWritten: false, committedRevision: 8 };
const exited = { boundaryObserved: true, plannedKillCalls: 1, failureStopCalls: 0,
  exitObserved: true, closeObserved: true, exitCode: null, exitSignal: 'SIGKILL', closeCode: null, closeSignal: 'SIGKILL' };
let cases = 0;
function check(run) { run(); cases++; }
check(() => { const value = FRAME(message, expected); assert.equal(Object.isFrozen(value), true); assert.deepEqual(value, message); });
check(() => { const value = EXIT(exited); assert.equal(Object.isFrozen(value), true); assert.equal(value.matched, true);
  assert.equal(value.authority, 'NONE'); assert.equal(value.physicalResourceRelease, 'NOT_QUALIFIED'); });
check(() => { for (const key of Object.keys(expected)) assert.throws(() => FRAME({ ...message, [key]: 'changed' }, expected)); });
check(() => { for (const key of ['token', 'transactionHash', 'paymentPinsSha256', 'servicePinsSha256'])
  assert.throws(() => FRAME({ ...message, [key]: 'abc' }, { ...expected, [key]: 'abc' })); });
check(() => { for (const key of ['grantId', 'requestId']) assert.throws(() => FRAME({ ...message, [key]: '../foreign' }, { ...expected, [key]: '../foreign' })); });
check(() => { for (const change of [{ executions: 2 }, { commandStarts: 7 }, { commandResults: 6 },
  { responseResultWritten: true }, { committedRevision: 0 }, { committedRevision: 1.2 }, { stage: 'PREPARED' }])
  assert.throws(() => FRAME({ ...message, ...change }, expected)); });
check(() => { for (const key of Object.keys(exited)) {
  const value = typeof exited[key] === 'boolean' ? false : key.endsWith('Calls') ? 2 : 'changed';
  assert.throws(() => EXIT({ ...exited, [key]: value }));
} });
check(() => { assert.throws(() => EXIT({ ...exited, exitObserved: false, closeObserved: false }));
  assert.throws(() => EXIT({ ...exited, exitCode: 0, closeCode: 0, exitSignal: null, closeSignal: null })); });
check(() => { assert.throws(() => FRAME({ ...message, foreign: true }, expected)); assert.throws(() => EXIT({ ...exited, pid: 123 })); });
check(() => { let calls = 0; const getter = { ...message }; Object.defineProperty(getter, 'token', { enumerable: true,
  get() { calls++; return expected.token; } }); assert.throws(() => FRAME(getter, expected)); assert.equal(calls, 0); });
check(() => { let calls = 0; const proxy = new Proxy({}, { get() { calls++; throw Error(); }, ownKeys() { calls++; throw Error(); } });
  assert.throws(() => FRAME(proxy, expected)); assert.throws(() => EXIT(proxy)); assert.equal(calls, 0); });
check(() => { const captured = FRAME(message, expected); const stopped = EXIT(exited);
  message.committedRevision = 9; message.token = '55'.repeat(32);
  assert.equal(captured.committedRevision, 8); assert.equal(captured.token, expected.token);
  assert.equal(stopped.evidence, 'CALLER_SUPPLIED_RECEIPTS_ONLY'); });
console.log(JSON.stringify({ passed: true, cases, nativeProcesses: 0, actualSignals: 0,
  nativeIPC: 0, SQLite: 0, sockets: 0, SDK: 0, signatures: 0, scratchFiles: 0,
  receipts: 'DECLARED', physicalResourceRelease: 'NOT_QUALIFIED' }));
