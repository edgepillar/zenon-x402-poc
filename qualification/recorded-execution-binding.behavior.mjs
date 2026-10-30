// Pure execution-contract metadata, reference model and declared recovery ports.
// No execution owner, SQL, proof authentication, SDK, signing or transport.
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { resultInspectionFixture as fixture } from './api-credit-recorded-result-inspection.fixture.mjs';
import { captureApiCreditRecordedResultInspection as project } from '../src/api-credit-recorded-result-inspection.js';

const F = Object.freeze, checks = [];
function check(id, run) { checks.push({ id, run }); }
function editExecution(backend, edit) { return F({ ...backend, execution: F({ ...backend.execution, request: F({ ...backend.execution.request, ...edit }) }) }); }
async function refuses(edit) {
  const r = await fixture(), before = JSON.stringify(r.model.exportState()), observed = r.observation();
  assert.throws(() => project(F({ ...observed, backend: edit(observed.backend) }), r.manifest()));
  assert.equal(JSON.stringify(r.model.exportState()), before); assert.equal(r.originalCounts.funding, 1);
  assert.equal(r.originalCounts.grants, 1); assert.equal(r.originalCounts.executions, 1);
  assert.equal(r.backendReads + r.payerCloseCalls + r.backendCloseCalls, 0);
}
check('execution-binding-real-pure-contract-request-preserves-normal-cached-result', async () => {
  const r = await fixture(), before = JSON.stringify(r.model.exportState()), backend = r.outcome();
  assert.equal(backend.execution.terminalClassification, 'SUCCEEDED'); assert.equal(backend.execution.fencePhase, 'MAY_HAVE_STARTED');
  for (const key of ['modelVersion', 'grantId', 'requestId', 'requestDigest', 'method', 'routeId', 'canonicalBodyDigest', 'selectedContentType', 'maxCostUnits', 'costUnits']) {
    assert.equal(backend.execution.request[key], backend.originalRequest[key]);
  }
  const result = await r.run(); assert.equal(result.resultAvailable, true); assert.equal(result.source, 'LOCAL_RESPONSE_AND_BACKEND_CACHE');
  assert.equal(result.responseJson, r.local.responseObservation.responseJson); assert.equal(result.authority, 'NONE');
  assert.equal(result.mayDispatchService, false); assert.equal(result.localReconciliationRequired, true);
  assert.equal(r.backendReads, 1); assert.equal(r.originalCounts.executions, 1); assert.equal(JSON.stringify(r.model.exportState()), before);
});
check('execution-binding-foreign-grant-cannot-borrow-a-successful-request-cache', async () => {
  await refuses(backend => editExecution(backend, { grantId: 'foreign.grant' }));
});
check('execution-binding-foreign-request-id-cannot-borrow-another-original-cache', async () => {
  await refuses(backend => editExecution(backend, { requestId: 'foreign.request' }));
});
check('execution-binding-model-version-must-match-the-retained-original', async () => {
  await refuses(backend => editExecution(backend, { modelVersion: backend.execution.request.modelVersion + 1 }));
});
check('execution-binding-method-must-match-the-retained-original', async () => {
  await refuses(backend => editExecution(backend, { method: backend.execution.request.method === 'POST' ? 'GET' : 'POST' }));
});
check('execution-binding-route-must-match-the-retained-original', async () => {
  await refuses(backend => editExecution(backend, { routeId: 'foreign.route' }));
});
check('execution-binding-body-digest-must-match-the-retained-original', async () => {
  await refuses(backend => editExecution(backend, { canonicalBodyDigest: 'sha256:' + 'f'.repeat(64) }));
});
check('execution-binding-content-type-must-match-the-retained-original', async () => {
  await refuses(backend => editExecution(backend, { selectedContentType: 'application/cbor' }));
});
check('execution-binding-cost-ceiling-must-match-the-retained-original', async () => {
  await refuses(backend => editExecution(backend, { maxCostUnits: backend.execution.request.maxCostUnits + 1 }));
});
check('execution-binding-request-commitment-must-match-the-ledger-row', async () => {
  await refuses(backend => editExecution(backend, { requestDigest: 'sha256:' + 'e'.repeat(64) }));
});
check('execution-binding-charged-cost-must-match-the-ledger-row', async () => {
  await refuses(backend => editExecution(backend, { costUnits: backend.execution.request.costUnits + 1 }));
});
check('execution-binding-missing-or-null-request-withholds-cached-success', async () => {
  await refuses(backend => { const { request, ...execution } = backend.execution; return F({ ...backend, execution: F(execution) }); });
  await refuses(backend => F({ ...backend, execution: F({ ...backend.execution, request: null }) }));
});
check('execution-binding-ledger-commitment-must-be-present-on-both-records', async () => {
  await refuses(backend => { const { requestDigest, ...request } = backend.originalRequest; return F({ ...backend, originalRequest: F(request) }); });
});
check('execution-binding-request-accessor-is-refused-without-getter-entry', async () => {
  let getters = 0;
  await refuses(backend => {
    const request = { ...backend.execution.request };
    Object.defineProperty(request, 'requestId', { enumerable: true, get() { getters++; return backend.originalRequest.requestId; } });
    return F({ ...backend, execution: F({ ...backend.execution, request: F(request) }) });
  });
  assert.equal(getters, 0);
});
check('execution-binding-request-proxy-is-refused-without-proxy-hooks', async () => {
  let hooks = 0;
  await refuses(backend => F({ ...backend, execution: F({ ...backend.execution,
    request: new Proxy(backend.execution.request, { getPrototypeOf() { hooks++; throw Error('unexpected hook'); } }) }) }));
  assert.equal(hooks, 0);
});
check('execution-binding-actual-read-owner-rejects-foreign-execution-and-closes-once', async () => {
  const r = await fixture({ outcome: backend => editExecution(backend, { requestId: 'foreign.request' }) });
  const before = JSON.stringify(r.model.exportState()); await assert.rejects(r.run());
  assert.equal(r.backendReads, 1); assert.equal(r.payerCloseCalls, 1); assert.equal(r.backendCloseCalls, 1);
  assert.deepEqual(r.trace, ['backend-open', 'payer-open', 'backend-read', 'payer-close', 'backend-close']);
  assert.equal(JSON.stringify(r.model.exportState()), before); assert.equal(r.originalCounts.funding, 1); assert.equal(r.originalCounts.executions, 1);
});
check('execution-binding-coordinator-withholds-output-without-requery-or-new-debit', async () => {
  const r = await fixture({ outcome: backend => editExecution(backend, { grantId: 'foreign.grant' }) });
  const before = JSON.stringify(r.model.exportState()), result = await r.coordinate();
  assert.equal(result.status, 'CLOSE_UNKNOWN'); assert.equal(result.exitCode, 4); assert.equal(r.writes.length, 0); assert.equal(r.backendReads, 1);
  assert.equal(r.ownerReads, 1); assert.equal(r.payerCloseCalls, 1); assert.equal(r.backendCloseCalls, 1); assert.equal(r.channelCloses, 1);
  assert.equal(JSON.stringify(r.model.exportState()), before); assert.equal(r.originalCounts.funding, 1); assert.equal(r.originalCounts.grants, 1);
});
check('execution-binding-unknown-backend-withholds-cache-without-reading-execution-request', async () => {
  const r = await fixture({ backendStatus: 'OUTCOME_UNKNOWN' }), observed = r.observation(); let getters = 0;
  const execution = { ...observed.backend.execution };
  Object.defineProperty(execution, 'request', { enumerable: true, get() { getters++; throw Error('unexpected request read'); } });
  const result = project(F({ ...observed, backend: F({ ...observed.backend, execution: F(execution) }) }), r.manifest());
  assert.equal(result.resultAvailable, false); assert.equal(result.cachedResult, null); assert.equal(result.responseJson, null);
  assert.equal(result.mayDispatchService, false); assert.equal(result.localReconciliationRequired, true); assert.equal(getters, 0);
});

export const recordedExecutionBindingDataCases = F(checks.map(row => F(row)));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const { id, run } of checks) {
    try { await run(); cases.push({ id, status: 'PASS' }); }
    catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); }
  }
  const failed = cases.filter(row => row.status !== 'PASS').length;
  console.log(JSON.stringify({ qualification: 'G1_G2_RECORDED_EXECUTION_BINDING_DATA', passed: cases.length - failed, failed, cases,
    pureExecutionContractMetadata: true, declaredSqlProofFileEpochAndChannelPortsOnly: true,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
    nativeReopen: 'NOT_ESTABLISHED', nativeProofAuthentication: 'NOT_ESTABLISHED', physicalRelease: 'NOT_ESTABLISHED', LinuxAcceptance: 'NOT_ESTABLISHED' }));
  if (failed) process.exitCode = 1;
}
