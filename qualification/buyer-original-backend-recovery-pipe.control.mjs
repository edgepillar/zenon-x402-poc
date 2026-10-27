// Actual bootstrap, owner, selected-grant core, command session and real FIFOs.
// Native payer, SQL backend reads and physical store close remain declared.
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fstatSync } from 'node:fs';
import { recoveryFixture } from './buyer-original-recovery.fixture.mjs';
import { createBuyerOwnedBackendRecoveryResource as OWN_BACKEND } from '../src/buyer-owned-backend-recovery-resource.js';
import { runBuyerOriginalRecoveryPipeHost as RUN } from '../src/buyer-original-recovery-pipe-host.js';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_ORIGINAL_RECOVERY_PIPE_CONTROL, 'explicit-backend-store-owner-declared-native-only');
assert.equal(process.argv.length, 5);
const [scenario, readFd, writeFd] = process.argv.slice(2);
const scenarios = ['BACKEND_INSPECT', 'BACKEND_RECONCILE_CACHED', 'BACKEND_RECONCILE_ABSENT', 'BACKEND_LOCAL_ABSENT', 'BACKEND_QUEUED_SERVICE_NO_REPLAY',
  'BACKEND_PRIOR_INTENT', 'BACKEND_FOREIGN_GRANT', 'BACKEND_CHANGED_CONTEXT', 'BACKEND_STORE_CLOSE_THROWS',
  'BACKEND_STORE_CLOSE_NONVOID', 'BACKEND_READER_CLOSE_THROWS', 'BACKEND_READER_CLOSE_NONCLOSED',
  'BACKEND_PAYER_CLOSE_REJECTS', 'BACKEND_PAYER_CLOSE_LATE', 'BACKEND_OPEN_REJECTS', 'BACKEND_OPEN_THENABLE',
  'BACKEND_PAYER_OPEN_REJECTS', 'BACKEND_CLIENT_SETUP_REFUSED', 'BACKEND_POST_STORE_VIEW_DRIFT',
  'BACKEND_OUTPUT_PEER_CLOSED', 'BACKEND_FORBIDDEN_FUNDING', 'BACKEND_BOOTSTRAP_OUTSIDE_ROOT',
  'BACKEND_BOOTSTRAP_ALIAS', 'BACKEND_BOOTSTRAP_SIDECAR', 'BACKEND_BOOTSTRAP_LIMIT', 'BACKEND_CAPABILITY_MISSING',
  'BACKEND_OWNER_SHAPE_REFUSED', 'BACKEND_STORE_EARLY_CLOSE', 'BACKEND_READER_REENTRANT_STOP',
  'BACKEND_STORE_CLOSE_PENDING_RECEIPT', 'BACKEND_READ_PROMISE', 'BACKEND_DOUBLE_CLOSE_GUARD', 'BACKEND_PROMISE_ACCESSOR_REFUSED'];
assert.ok(scenarios.includes(scenario));
assert.match(readFd, /^[1-9][0-9]{0,3}$/); assert.match(writeFd, /^[1-9][0-9]{0,3}$/);
const inputFd = Number(readFd), outputFd = Number(writeFd), F = Object.freeze;
const id = fd => { const s = fstatSync(fd, { bigint: true }); return [s.dev, s.ino, s.uid, s.gid, s.mode].map(String); };
const standard = [0, 1, 2].map(id), f = recoveryFixture(), order = [];
let payerOpens = 0, backendOpens = 0, storeCloses = 0, hooks = 0, resource = null, lateClose = null;
const beforeAcquisition = ['BACKEND_BOOTSTRAP_OUTSIDE_ROOT', 'BACKEND_BOOTSTRAP_ALIAS', 'BACKEND_BOOTSTRAP_SIDECAR',
  'BACKEND_BOOTSTRAP_LIMIT', 'BACKEND_CAPABILITY_MISSING'].includes(scenario);
if (scenario === 'BACKEND_RECONCILE_ABSENT') f.backendReply = f.backendOutcome('NOT_RECORDED', { originalRequest: null });
if (scenario === 'BACKEND_LOCAL_ABSENT') f.state = null;
if (scenario === 'BACKEND_PRIOR_INTENT') f.change({ dispatchIntent: f.intent() });
if (scenario === 'BACKEND_CHANGED_CONTEXT') f.onBackend = () => {
  f.change({ funding: { ...f.state.funding, revision: 2 } }); return f.backendReply;
};
if (scenario === 'BACKEND_READ_PROMISE') f.onBackend = () => Promise.reject(Error('PRIVATE_READ_PROMISE'));
if (scenario === 'BACKEND_READER_REENTRANT_STOP') f.onBackend = () => {
  assert.throws(() => resource.reader.close()); return f.backendReply;
};
f.onBackendClose = () => {
  order.push('READER_CLOSE');
  if (scenario === 'BACKEND_READER_CLOSE_THROWS') throw Error('PRIVATE_READER_CLOSE');
  return f.backendOutcome(scenario === 'BACKEND_READER_CLOSE_NONCLOSED' ? 'OUTCOME_UNKNOWN' : 'CLOSED');
};
f.onClose = () => {
  order.push('PAYER_CLOSE');
  if (scenario === 'BACKEND_PAYER_CLOSE_REJECTS') return Promise.reject(Error('PRIVATE_PAYER_CLOSE'));
  if (scenario === 'BACKEND_PAYER_CLOSE_LATE') return new Promise(resolve => { lateClose = () => { f.phase = 'CLOSED'; resolve(); }; });
  f.phase = 'CLOSED'; return Promise.resolve(undefined);
};
const CLOSE_STORE = F(function declaredStoreClose() {
  storeCloses++; order.push('STORE_CLOSE');
  assert.equal(storeCloses, 1); assert.equal(f.backendCloses, 1);
  assert.ok(order.indexOf('READER_CLOSE') < order.indexOf('STORE_CLOSE'));
  if (scenario === 'BACKEND_STORE_CLOSE_THROWS') throw Error('PRIVATE_STORE_CLOSE');
  if (scenario === 'BACKEND_STORE_CLOSE_NONVOID') return F({ status: 'CLOSED' });
  if (scenario === 'BACKEND_STORE_CLOSE_PENDING_RECEIPT') return Promise.resolve(undefined);
  if (scenario === 'BACKEND_PROMISE_ACCESSOR_REFUSED') {
    const receipt = Promise.resolve(undefined);
    Object.defineProperty(receipt, 'constructor', { get() { hooks++; throw Error('PRIVATE_PROMISE_CONSTRUCTOR'); } });
    return receipt;
  }
  if (scenario === 'BACKEND_POST_STORE_VIEW_DRIFT') f.unknown = true;
  return undefined;
});
const OPEN_BACKEND = F(function declaredBackendOpen(bootstrap) {
  backendOpens++; assert.equal(backendOpens, 1); assert.equal(payerOpens, 0);
  assert.equal(bootstrap.recoveryPipeBootstrapVersion, 2);
  assert.equal(bootstrap.backendOptions.databasePath, '/synthetic-recovery/backend.sqlite');
  assert.equal(Object.isFrozen(bootstrap.backendOptions.limits), true);
  if (scenario === 'BACKEND_OPEN_REJECTS') return Promise.reject(Error('PRIVATE_BACKEND_OPEN'));
  if (scenario === 'BACKEND_OPEN_THENABLE') return F({ get then() { hooks++; throw Error('PRIVATE_THEN_GETTER'); } });
  resource = OWN_BACKEND({ reader: f.backend, closeStore: CLOSE_STORE });
  if (scenario === 'BACKEND_STORE_EARLY_CLOSE') { assert.throws(() => resource.closeStore()); assert.equal(storeCloses, 0); }
  if (scenario === 'BACKEND_OWNER_SHAPE_REFUSED') return Promise.resolve(F({ reader: resource.reader,
    get closeStore() { hooks++; throw Error('PRIVATE_STORE_GETTER'); } }));
  return Promise.resolve(resource);
});
const OPEN_PAYER = F(function declaredPayerOpen(bootstrap) {
  payerOpens++; assert.equal(payerOpens, 1); assert.equal(backendOpens, 1);
  assert.deepEqual(bootstrap.selection, f.selection);
  if (scenario === 'BACKEND_PAYER_OPEN_REJECTS') return Promise.reject(Error('PRIVATE_PAYER_OPEN'));
  if (scenario === 'BACKEND_CLIENT_SETUP_REFUSED') {
    const { readOriginalRecoveryState: unused, ...incomplete } = f.native; return Promise.resolve(F(incomplete));
  }
  return Promise.resolve(f.native);
});
const c = { inputFd, outputFd, allowedRoot: '/synthetic-recovery', openNativeClient: OPEN_PAYER,
  ...(scenario === 'BACKEND_CAPABILITY_MISSING' ? {} : { openBackend: OPEN_BACKEND }) };
const result = await new AsyncLocalStorage().run(F({ declaredBackendTrace: true }), () => RUN(c));
assert.equal(Object.isFrozen(result), true); assert.equal(result.authority, 'NONE');
assert.equal(result.serviceDelivery, 'NOT_ESTABLISHED'); assert.equal(f.services + f.restores, 0); assert.equal(hooks, 0);
assert.equal(backendOpens, beforeAcquisition ? 0 : 1);
const noPayer = beforeAcquisition || ['BACKEND_OPEN_REJECTS', 'BACKEND_OPEN_THENABLE', 'BACKEND_OWNER_SHAPE_REFUSED'].includes(scenario);
assert.equal(payerOpens, noPayer ? 0 : 1);
const noNative = noPayer || scenario === 'BACKEND_PAYER_OPEN_REJECTS';
assert.equal(f.closes, noNative ? 0 : 1);
const hiddenBackend = noPayer || scenario === 'BACKEND_OWNER_SHAPE_REFUSED';
assert.equal(f.backendCloses, hiddenBackend ? 0 : 1);
const heldStore = hiddenBackend || ['BACKEND_CHANGED_CONTEXT', 'BACKEND_READER_CLOSE_THROWS', 'BACKEND_READER_CLOSE_NONCLOSED',
  'BACKEND_PAYER_CLOSE_REJECTS', 'BACKEND_PAYER_CLOSE_LATE', 'BACKEND_READER_REENTRANT_STOP', 'BACKEND_READ_PROMISE'].includes(scenario);
assert.equal(storeCloses, heldStore ? 0 : 1);
if (beforeAcquisition) {
  assert.equal(result.status, 'BOOTSTRAP_REFUSED'); assert.equal(result.exitCode, 1);
} else if (['BACKEND_RECONCILE_CACHED', 'BACKEND_RECONCILE_ABSENT', 'BACKEND_LOCAL_ABSENT', 'BACKEND_PRIOR_INTENT', 'BACKEND_QUEUED_SERVICE_NO_REPLAY'].includes(scenario)) {
  assert.equal(result.status, 'RECONCILIATION_REQUIRED'); assert.equal(result.exitCode, 2);
  assert.equal(result.ownedBackendStoreClose, 'RETURNED_UNDEFINED'); assert.equal(f.backendReads, scenario === 'BACKEND_LOCAL_ABSENT' ? 0 : 1);
  assert.equal(result.recoveryOutcomeUnknown, true);
} else if (['BACKEND_INSPECT', 'BACKEND_STORE_EARLY_CLOSE', 'BACKEND_DOUBLE_CLOSE_GUARD'].includes(scenario)) {
  assert.equal(result.status, 'CLOSED'); assert.equal(result.exitCode, 0); assert.equal(result.ownersClosedObserved, true);
} else if (scenario === 'BACKEND_FORBIDDEN_FUNDING') {
  assert.equal(result.status, 'INPUT_REFUSED'); assert.equal(result.exitCode, 1);
} else if (scenario === 'BACKEND_FOREIGN_GRANT') {
  assert.equal(f.backendReads + f.checkpointReads + f.stateReads, 0);
  assert.equal(result.status, 'OUTCOME_UNKNOWN'); assert.equal(result.exitCode, 3);
} else {
  assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(result.exitCode, 4);
}
if (scenario === 'BACKEND_PAYER_CLOSE_LATE') {
  assert.equal(typeof lateClose, 'function'); lateClose(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(storeCloses, 0); assert.equal(result.ownedBackendStoreClose, 'HELD'); assert.equal(result.status, 'CLOSE_UNKNOWN');
}
if (scenario === 'BACKEND_DOUBLE_CLOSE_GUARD') {
  assert.throws(() => resource.closeStore()); assert.equal(storeCloses, 1);
}
if (resource !== null && ['BACKEND_STORE_CLOSE_THROWS', 'BACKEND_STORE_CLOSE_NONVOID', 'BACKEND_STORE_CLOSE_PENDING_RECEIPT', 'BACKEND_PROMISE_ACCESSOR_REFUSED'].includes(scenario)) {
  assert.throws(() => resource.closeStore()); assert.equal(storeCloses, 1); assert.equal(result.ownedBackendStoreClose, 'UNKNOWN');
}
for (const fd of [inputFd, outputFd]) assert.throws(() => fstatSync(fd), { code: 'EBADF' });
assert.deepEqual([0, 1, 2].map(id), standard);
const text = JSON.stringify(result);
for (const secret of ['PRIVATE_', 'ServiceCredit ', 'serializedCheckpoint', 'authorizationHeader', 'declared-cached-result',
  f.checkpoint.originalBytes.paymentPayload, '/synthetic-recovery']) assert.equal(text.includes(secret), false);
process.stdout.write(JSON.stringify({ scenario, passed: true, result, payerOpens, backendOpens, readerCloses: f.backendCloses,
  storeCloses, backendReads: f.backendReads, checkpointReads: f.checkpointReads, custodyReads: f.stateReads,
  closeOrder: order, ownedDescriptorsClosed: true, standardDescriptorsPreserved: true,
  serviceCalls: f.services, ipConnections: 0, nativeCallbacks: 'DECLARED', physicalSQLiteCleanup: 'NOT_QUALIFIED' }) + '\n');
