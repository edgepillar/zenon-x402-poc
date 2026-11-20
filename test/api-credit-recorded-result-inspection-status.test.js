import assert from 'node:assert/strict';
import test from 'node:test';
import { captureApiCreditRecordedResultInspectionOutput as capture } from '../src/api-credit-recorded-result-inspection.js';

const absentOriginal = Object.freeze({
  recordedResultInspectionVersion: 1,
  grantId: 'grant.original',
  requestId: 'request.original',
  status: 'CLIENT_ORIGINAL_NOT_RECORDED',
  backendStatus: null,
  resultAvailable: false,
  cachedResult: null,
  responseJson: null,
  source: 'NONE',
  originalCheckpointPinsMatched: true,
  localReconciliationRequired: false,
  authority: 'NONE',
  mayStartPayment: false,
  maySignPayment: false,
  mayDispatchService: false,
  deliveryConfirmed: false,
  serviceDelivery: 'NOT_ESTABLISHED',
  currentAuthority: 'NOT_ESTABLISHED',
  sameProcessObservationOnly: true,
  snapshotAtomicAcrossStores: false,
});
const noBackendResult = Object.freeze({
  ...absentOriginal, status: 'NOT_RECORDED', backendStatus: 'NOT_RECORDED',
});
const refusal = /API_CREDIT_RECORDED_RESULT_INSPECTION/;

test('recorded inspection accepts consistent absence, backend status and local uncertainty', () => {
  const reconciliation = Object.freeze({
    ...noBackendResult, status: 'CLIENT_RECONCILIATION_REQUIRED', localReconciliationRequired: true,
  });
  for (const observation of [absentOriginal, noBackendResult, reconciliation]) {
    assert.deepEqual(capture(observation), observation);
  }
});

test('recorded inspection cannot report cache success for a missing backend result', () => {
  assert.throws(() => capture(Object.freeze({ ...noBackendResult, status: 'CACHED_SUCCESS' })), refusal);
});

test('recorded inspection requires matching absence and backend observations', () => {
  assert.throws(() => capture(Object.freeze({ ...noBackendResult, status: absentOriginal.status })), refusal);
  assert.throws(() => capture(Object.freeze({ ...noBackendResult, backendStatus: null })), refusal);
});

test('recorded inspection requires a backend observation for local reconciliation', () => {
  assert.throws(() => capture(Object.freeze({
    ...absentOriginal, status: 'CLIENT_RECONCILIATION_REQUIRED', localReconciliationRequired: true,
  })), refusal);
});
