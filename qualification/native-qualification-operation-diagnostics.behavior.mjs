import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeQualificationOperationDiagnostics as create,
  captureNativeQualificationOperationDiagnostic as capture } from '../src/native-qualification-operation-diagnostics.js';

const code = 'NATIVE_QUALIFICATION_OPERATION_DIAGNOSTIC_REJECTED';
const reject = value => assert.throws(() => capture(value), { code });

test('source cursor starts inert and grants no authority', () => {
  const d = create(), s = d.snapshot(); assert.equal(s.stagesEntered, 0); assert.equal(s.lastStage, null);
  assert.equal(s.failed, false); assert.equal(s.safeErrorCode, null); assert.equal(s.authority, 'NONE');
  assert.equal(Object.isFrozen(d), true); assert.equal(Object.isFrozen(s), true); assert.deepEqual(capture(s), s);
});
test('real helper marks a bounded stage and retains a known returned phase', () => {
  const d = create(); assert.equal(d.mark('SUBMIT_ORIGINAL_FUNDING'), undefined);
  assert.equal(d.observeReturnedPhase({ phase: 'SUBMISSION_OUTCOME_UNKNOWN' }), undefined);
  const s = d.snapshot(); assert.equal(s.lastStage, 'SUBMIT_ORIGINAL_FUNDING');
  assert.equal(s.lastReturnedPhase, 'SUBMISSION_OUTCOME_UNKNOWN'); assert.equal(s.stagesEntered, 1);
  assert.deepEqual(capture(s), s); assert.equal(s.failed, false);
});
test('each next stage clears a previous return observation', () => {
  const d = create(); d.mark('START_APPLICATION'); d.observeReturnedPhase({ phase: 'LISTENING' });
  const previous = d.snapshot(); d.mark('READ_UNPAID_CHALLENGE');
  assert.equal(previous.lastReturnedPhase, 'LISTENING'); assert.equal(d.snapshot().lastReturnedPhase, null);
});
test('unknown phase never retains caller text or its source record', () => {
  const d = create(), value = { phase: 'PRIVATE_VALUE_NEVER_EXPORT' };
  d.mark('COMMIT_ORIGINAL_FUNDING'); d.observeReturnedPhase(value); value.phase = 'SETTLED';
  assert.equal(d.snapshot().lastReturnedPhase, 'UNAVAILABLE');
  assert.equal(JSON.stringify(d.snapshot()).includes('PRIVATE_VALUE'), false);
});
test('returned phase accessor and proxy are not invoked', () => {
  let calls = 0; const d = create(); d.mark('COMMIT_ORIGINAL_FUNDING');
  d.observeReturnedPhase({ get phase() { calls++; throw new Error('unreachable'); } });
  d.observeReturnedPhase(new Proxy({}, { getOwnPropertyDescriptor() { calls++; throw new Error('unreachable'); } }));
  assert.equal(calls, 0); assert.equal(d.snapshot().lastReturnedPhase, 'UNAVAILABLE');
});
test('safe assertion code is retained without error message or expected/actual', () => {
  const d = create(); d.mark('SUBMIT_ORIGINAL_FUNDING');
  const error = { code: 'ERR_ASSERTION', message: 'PRIVATE_MESSAGE', expected: 'PRIVATE_EXPECTED', actual: 'PRIVATE_ACTUAL' };
  assert.equal(d.fail(error), undefined); error.code = 'ABORT_ERR';
  const s = d.snapshot(); assert.equal(s.failed, true); assert.equal(s.safeErrorCode, 'ERR_ASSERTION');
  assert.equal(JSON.stringify(s).includes('PRIVATE'), false); assert.deepEqual(capture(s), s);
});
test('first failure is sticky and cannot be upgraded or replaced', () => {
  const d = create(); d.mark('SUBMIT_ORIGINAL_FUNDING'); d.fail({ code: 'ERR_ASSERTION' });
  d.fail({ code: 'ABORT_ERR' }); d.mark('READ_AFTER_RECOVERY'); d.observeReturnedPhase({ phase: 'SETTLED' });
  const s = d.snapshot(); assert.equal(s.safeErrorCode, 'ERR_ASSERTION'); assert.equal(s.lastStage, 'SUBMIT_ORIGINAL_FUNDING');
  assert.equal(s.measurementUnknown, true); assert.equal(s.lastReturnedPhase, null); assert.deepEqual(capture(s), s);
});
test('unknown error code, message and nested cause are not retained', () => {
  const d = create(); d.mark('OPEN_PAYER_CLIENT');
  d.fail({ code: 'PRIVATE_TOKEN', message: 'PRIVATE_PATH', cause: { payment: 'PRIVATE_PAYMENT' } });
  assert.equal(d.snapshot().safeErrorCode, 'OTHER'); assert.equal(JSON.stringify(d.snapshot()).includes('PRIVATE'), false);
});
test('error accessors and proxy traps are never invoked', () => {
  for (const error of [Object.defineProperty({}, 'code', { get() { throw new Error('unreachable'); } }),
    new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('unreachable'); } })]) {
    const d = create(); assert.equal(d.fail(error), undefined); assert.equal(d.snapshot().safeErrorCode, 'OTHER');
  }
});
test('diagnostic mutators do not throw into a real operation', () => {
  const d = create(); assert.equal(d.mark('UNDECLARED_STAGE'), undefined); assert.equal(d.mark(), undefined);
  assert.equal(d.observeReturnedPhase(), undefined); assert.equal(d.fail(), undefined);
  assert.equal(d.snapshot().measurementUnknown, true); assert.equal(d.snapshot().failed, true);
});
test('hard stage bound is sticky and does not store unbounded history', () => {
  const d = create(); for (let i = 0; i < 129; i++) assert.equal(d.mark('READ_UNPAID_CHALLENGE'), undefined);
  const s = d.snapshot(); assert.equal(s.stagesEntered, 128); assert.equal(s.measurementUnknown, true);
  assert.ok(Buffer.byteLength(JSON.stringify(s)) < 1024); assert.deepEqual(capture(s), s);
});
test('snapshot and capture are detached frozen exact DTOs', () => {
  const d = create(); d.mark('READ_RECOVERY_CHECKPOINT'); const input = { ...d.snapshot() }, got = capture(input);
  input.lastStage = 'PRIVATE_VALUE'; assert.equal(got.lastStage, 'READ_RECOVERY_CHECKPOINT'); assert.equal(Object.isFrozen(got), true);
});
test('capture rejects extra, missing, symbolic and inherited fields', () => {
  const s = create().snapshot(); reject({ ...s, extra: true }); const missing = { ...s }; delete missing.authority; reject(missing);
  reject({ ...s, [Symbol('extra')]: true }); reject(Object.assign(Object.create({ inherited: true }), s));
});
test('capture rejects accessors and proxies without invoking them', () => {
  const value = { ...create().snapshot() }; let calls = 0;
  Object.defineProperty(value, 'kind', { enumerable: true, get() { calls++; throw new Error('unreachable'); } }); reject(value);
  reject(new Proxy(value, { getPrototypeOf() { calls++; throw new Error('unreachable'); } })); assert.equal(calls, 0);
});
test('capture rejects inconsistent or material-bearing scalar fields', () => {
  const s = create().snapshot();
  for (const edit of [{ diagnosticVersion: 2 }, { authority: 'RETRY' }, { stagesEntered: -0 }, { stagesEntered: 129 },
    { lastStage: 'PRIVATE_PATH' }, { lastReturnedPhase: 'SETTLED' }, { failed: true, safeErrorCode: null },
    { safeErrorCode: 'ERR_ASSERTION' }, { measurementUnknown: 'false' }]) reject({ ...s, ...edit });
});
test('construction, snapshot and capture arity are exact', () => {
  assert.throws(() => create({})); assert.throws(() => create().snapshot('extra'));
  assert.throws(() => capture(create().snapshot(), 'extra')); assert.throws(() => capture());
});
