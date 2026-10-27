// Actual process pipes/bootstrap/connector/session/host; native OPEN is declared.
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fstatSync } from 'node:fs';
import { recoveryFixture } from './buyer-original-recovery.fixture.mjs';
import { runBuyerOriginalRecoveryPipeHost as RUN } from '../src/buyer-original-recovery-pipe-host.js';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_ORIGINAL_RECOVERY_PIPE_CONTROL, 'explicit-bootstrap-declared-native-only');
assert.equal(process.argv.length, 5);
const [scenario, readFd, writeFd] = process.argv.slice(2);
const scenarios = ['CLEAN_INSPECT', 'RESTORE_ORIGINAL', 'NONCANONICAL_BOOTSTRAP', 'MISMATCHED_GRANT', 'OUTSIDE_ROOT', 'BOOTSTRAP_ROOT_CHANGED',
  'NATIVE_OPEN_REJECTS', 'CLIENT_SETUP_REFUSED', 'CLIENT_CLOSE_REJECTS', 'FINAL_CLOSE_VIEW_DRIFT', 'OUTPUT_PEER_CLOSED',
  'FUNDING_COMMAND_REFUSED', 'NATIVE_THENABLE_REFUSED'];
assert.ok(scenarios.includes(scenario));
assert.match(readFd, /^[1-9][0-9]{0,3}$/); assert.match(writeFd, /^[1-9][0-9]{0,3}$/);
const inputFd = Number(readFd), outputFd = Number(writeFd);
const id = fd => { const s = fstatSync(fd, { bigint: true }); return [s.dev, s.ino, s.uid, s.gid, s.mode].map(String); };
const standard = [0, 1, 2].map(id), f = recoveryFixture();
let opens = 0, hooks = 0;
const OPEN = Object.freeze(function declaredNativeOpen(bootstrap) {
  opens++;
  assert.equal(opens, 1);
  assert.equal(Object.isFrozen(bootstrap), true);
  assert.equal(Object.isFrozen(bootstrap.payerOptions), true);
  assert.equal(Object.isFrozen(bootstrap.transportOptions), true);
  assert.equal(bootstrap.selection.originalPayment.serializedCheckpoint, f.selection.originalPayment.serializedCheckpoint);
  assert.deepEqual(bootstrap.selection.originalPayment.expectedPins, f.selection.originalPayment.expectedPins);
  assert.equal(bootstrap.selection.selectedGrantId, f.selection.selectedGrantId);
  assert.equal(bootstrap.selection.paymentRequiredHeader, f.selection.paymentRequiredHeader);
  assert.equal(bootstrap.payerOptions.databasePath, '/synthetic-recovery/payer.sqlite');
  assert.equal(bootstrap.payerOptions.allowedRoot, '/synthetic-recovery');
  if (scenario === 'NATIVE_OPEN_REJECTS') return Promise.reject(Error('PRIVATE_OPEN_FAILURE'));
  if (scenario === 'NATIVE_THENABLE_REFUSED') return Object.freeze({ get then() { hooks++; throw Error('PRIVATE_THEN_GETTER'); } });
  if (['CLIENT_SETUP_REFUSED', 'CLIENT_CLOSE_REJECTS', 'FINAL_CLOSE_VIEW_DRIFT'].includes(scenario)) {
    if (scenario === 'CLIENT_CLOSE_REJECTS') f.onClose = () => Promise.reject(Error('PRIVATE_STOP_FAILURE'));
    if (scenario === 'FINAL_CLOSE_VIEW_DRIFT') {
      let views = 0;
      f.onSnapshot = () => { if (++views >= 2) f.unknown = true; };
    }
    const { readOriginalRecoveryState: unused, ...incomplete } = f.native;
    return Promise.resolve(Object.freeze(incomplete));
  }
  return Promise.resolve(f.native);
});

const storage = new AsyncLocalStorage();
const result = await storage.run(Object.freeze({ fixtureTrace: true }), () => RUN({ inputFd, outputFd, allowedRoot: '/synthetic-recovery', openNativeClient: OPEN }));
assert.equal(Object.isFrozen(result), true);
assert.equal(result.authority, 'NONE'); assert.equal(result.serviceDelivery, 'NOT_ESTABLISHED');
assert.equal(hooks, 0); assert.equal(f.services + f.stateReads, 0);
const refusedBeforeOpen = ['NONCANONICAL_BOOTSTRAP', 'MISMATCHED_GRANT', 'OUTSIDE_ROOT', 'BOOTSTRAP_ROOT_CHANGED'].includes(scenario);
assert.equal(opens, refusedBeforeOpen ? 0 : 1);
assert.equal(f.restores, ['RESTORE_ORIGINAL', 'OUTPUT_PEER_CLOSED'].includes(scenario) ? 1 : 0);
const noReturnedNative = refusedBeforeOpen || ['NATIVE_OPEN_REJECTS', 'NATIVE_THENABLE_REFUSED'].includes(scenario);
assert.equal(f.closes, noReturnedNative ? 0 : 1);
if (refusedBeforeOpen) {
  assert.equal(result.status, 'BOOTSTRAP_REFUSED'); assert.equal(result.exitCode, 1);
  assert.equal(result.knownOwnersClosedObserved, true); assert.equal(result.nativeOpenEntered, false);
} else if (['CLEAN_INSPECT', 'RESTORE_ORIGINAL'].includes(scenario)) {
  assert.equal(result.status, 'CLOSED'); assert.equal(result.exitCode, 0);
  assert.equal(result.ownersClosedObserved, true); assert.equal(result.localWriteCallbackCompleted, true);
} else if (scenario === 'FUNDING_COMMAND_REFUSED') {
  assert.equal(result.status, 'INPUT_REFUSED'); assert.equal(result.exitCode, 1);
  assert.equal(result.outputOutcomeUnknown, false);
} else {
  assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(result.exitCode, 4);
  if (scenario === 'OUTPUT_PEER_CLOSED') {
    assert.equal(result.outputOutcomeUnknown, true); assert.equal(result.retainedResult, true);
    assert.equal(result.localWriteCallbackCompleted, false);
  } else {
    assert.equal(result.nativeResourceRelease, 'NOT_ESTABLISHED');
    assert.equal(result.knownOwnersClosedObserved, !['CLIENT_CLOSE_REJECTS', 'FINAL_CLOSE_VIEW_DRIFT'].includes(scenario));
  }
}
if (scenario === 'CLIENT_CLOSE_REJECTS') {
  f.phase = 'CLOSED'; await new Promise(resolve => setImmediate(resolve));
  assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(result.knownOwnersClosedObserved, false);
  assert.equal(f.closes, 1);
}
for (const fd of [inputFd, outputFd]) assert.throws(() => fstatSync(fd), { code: 'EBADF' });
assert.deepEqual([0, 1, 2].map(id), standard);
const diagnostic = { scenario, passed: true, hostStatus: result.status, hostExitCode: result.exitCode,
  nativeOpenCalls: opens, nativeCloseCalls: f.closes, restores: f.restores, serviceCalls: f.services,
  stateReads: f.stateReads, callerThenHooks: hooks, ownedDescriptorsClosed: true,
  standardDescriptorsPreserved: true, actualAsyncLocalStorage: true, declaredNativeCallbacks: true,
  rawHeaderOrCheckpointInHostStatus: false, nodeChildren: 0, ipConnections: 0, SQL: false, SDK: false,
  keyGeneration: false, cryptographicSignatures: false, authority: 'NONE', serviceDelivery: 'NOT_ESTABLISHED' };
assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);
assert.equal(JSON.stringify(result).includes(f.checkpoint.originalBytes.paymentPayload), false);
const line = JSON.stringify(diagnostic) + '\n'; assert.ok(Buffer.byteLength(line) < 4096);
await new Promise((resolve, reject) => process.stdout.write(line, error => error ? reject(error) : resolve()));
process.exitCode = 0;
