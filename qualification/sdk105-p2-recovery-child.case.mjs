/* SOURCE ONLY. Fresh process; existing files and original external pins only.
 * Existing no-dispatch V6 backend recovery root, no new service/funding client.
 * Acquisition may update owner_epoch/quarantine; this is not SQLite readOnly.
 */
const E = process.env;
if (process.version !== 'v24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || E.X402_P2_COMMIT_RECOVERY_ROLE !== 'recovery-child'
    || E.X402_SDK105_ISSUED_COMMAND_SELECTION !== 'sdk105-p2-commit-recovery-v4'
    || E.X402_SDK105_ISSUED_COMMAND_RUN_SCOPE !== 'one-sdk105-p2-commit-recovery-v4'
    || E.X402_SDK105_ISSUED_COMMAND_MODE !== 'commit-kill-recover'
    || !/^[0-9a-f]{64}$/.test(E.X402_P2_COMMIT_RECOVERY_TOKEN || '')
    || process.argv.length !== 3 || process.argv[2] !== E.SPV_TASK_SCRATCH
    || E.NODE_OPTIONS !== undefined || E.NODE_PATH !== undefined || E.NODE_TEST_CONTEXT !== undefined
    || typeof process.send !== 'function' || process.connected !== true)
  throw new TypeError('SDK105_P2_RECOVERY_CHILD_NOT_ADMITTED_BEFORE_EFFECT_IMPORTS');
const [{ default: assert }, path, io, { ServiceCreditSqliteStore }, recovery, checkpoint] = await Promise.all([
  import('node:assert/strict'), import('node:path'), import('./sdk105-p2-commit-recovery.io.mjs'),
  import('../src/service-credit-sqlite-store.js'), import('../src/service-credit-custodied-backend-recovery-client.js'),
  import('../src/service-credit-pilot-original-payment-checkpoint.js'),
]);
const F = Object.freeze, root = process.argv[2], rootId = io.rootP2(root);
const pins = io.originalP2(root, rootId), payment = pins.payment.value, service = pins.services.value.first;
let backend = null, reader = null, readerClosed = false, backendClosed = false, close = null;
try {
  backend = ServiceCreditSqliteStore.openExisting({ databasePath: path.join(root, 'native-issued-service.sqlite'),
    allowedRoot: root, deriveCost: F(function deriveCost() { return 2; }), now: F(function now() { return Date.now(); }) });
  const before = backend.getDurableExecutionSnapshot();
  assert.equal(before.executionState.executions.length, 1);
  assert.equal(before.executionState.executions[0].terminalClassification, 'SUCCEEDED');
  reader = await recovery.openServiceCreditCustodiedSqliteBackendRecoveryClientV6({
    databasePath: path.join(root, 'native-issued-payer-v6.sqlite'), allowedRoot: root,
    backendStore: backend, fundingResourceUrl: payment.resourceUrl,
    custodyPolicy: { policyVersion: 1, maxRequests: 4, serviceResourceUrl: service.serviceResourceUrl },
    selectedGrantId: service.grantId, deadlineMs: 5000,
  });
  assert.equal(Object.hasOwn(reader, 'submitOriginal'), false);
  const retained = reader.readOriginalPaymentCheckpoint(payment.expectedPins);
  assert.equal(checkpoint.encodeOriginalPaymentCheckpoint(retained), payment.serializedCheckpoint);
  const key = { grantId: service.grantId, requestId: service.requestId };
  const result = reader.readOriginalBackendRecoveryState(key, service.authorizationHeader, payment.expectedPins);
  assert.equal(result.status, 'CLIENT_RECONCILIATION_REQUIRED');
  assert.equal(result.backend.status, 'CACHED_SUCCESS');
  assert.equal(result.backend.cachedResult.resultCode, 'native.ok');
  assert.equal(result.local.original.originalRequestJson, service.originalRequestJson);
  assert.equal(result.local.original.originalBodyBase64, service.originalBodyBase64);
  assert.equal(result.local.original.paymentHash, payment.transactionHash);
  assert.notEqual(result.local.dispatchIntent, null); assert.equal(result.local.responseObservation, null);
  assert.equal(result.local.responseStatus, 'NOT_OBSERVED'); assert.equal(result.local.funding.status, 'BOUND');
  assert.equal(result.mayStartPayment, false); assert.equal(result.maySignPayment, false);
  assert.equal(result.mayDispatchService, false); assert.equal(result.deliveryConfirmed, false);
  assert.equal(result.authority, 'NONE'); assert.equal(result.serviceDelivery, 'NOT_ESTABLISHED');
  const primary = backend.getGrant(service.grantId);
  assert.equal(primary.availableUnits, 8); assert.equal(primary.heldUnits, 0); assert.equal(primary.consumedUnits, 2);
  const foreign = backend.getGrant(pins.services.value.foreign.grantId);
  assert.equal(foreign.availableUnits, 10); assert.equal(foreign.heldUnits, 0); assert.equal(foreign.consumedUnits, 0);
  assert.equal(backend.getRequest({ grantId: service.grantId, requestId: 'native.second' }), null);
  const after = backend.getDurableExecutionSnapshot();
  assert.equal(after.revision, before.revision); assert.deepEqual(after.executionState, before.executionState);
  const reread = io.originalP2(root, rootId);
  assert.equal(reread.payment.sha256, pins.payment.sha256); assert.equal(reread.services.sha256, pins.services.sha256);
  close = reader.close(); assert.equal(reader.close(), close); assert.equal(await close, undefined); readerClosed = true;
  assert.equal(reader.snapshot().closed, true);
  assert.equal(backend.close(), undefined); backendClosed = true;
  console.log('# actual-sdk105-p2-recovery-child-v4 ' + JSON.stringify({
    recoveryCompleted: true, freshProcessPid: process.pid, token: E.X402_P2_COMMIT_RECOVERY_TOKEN,
    transactionHash: payment.transactionHash, grantId: service.grantId, requestId: service.requestId,
    paymentPinsSha256: pins.payment.sha256, servicePinsSha256: pins.services.sha256,
    payerAndBackendSameExistingPaths: true, backendRevision: before.revision, existingBackendExecutions: 1, consumedUnits: 2,
    clientStatus: result.status, backendStatus: result.backend.status, dispatchIntentPresent: true,
    responseObservationPresent: false, originalCheckpointMatched: true, independentPinsUnchanged: true,
    recoveryDispatches: 0, recoveryFundingPosts: 0, recoverySignatures: 0, noDispatchSurface: true,
    readerClosed, backendClosed, ownershipEpochMayAdvance: true, nativePhysicalDrain: 'NOT_QUALIFIED',
    deliveryConfirmed: false, authority: 'NONE', productionQualified: false }));
} finally {
  // Original cached close only. A rejected/unreturned payer never licenses a
  // direct native close, second open, retry, cleanup or borrowed-store repair.
  if (reader !== null && close === null) { close = reader.close(); try { await close; readerClosed = true; } catch {} }
  if (backend !== null && readerClosed && !backendClosed) { backend.close(); backendClosed = true; }
}
