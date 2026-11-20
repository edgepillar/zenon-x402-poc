import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiCreditFundingGrantRecoveryApplication } from '../src/api-credit-funding-grant-recovery-application.js';

function fixture() {
  const closeReceipt = Promise.withResolvers();
  const state = { lifecycle: 'OPEN', active: false, closeCalls: 0, operationCalls: 0 };
  const unused = Object.freeze(() => { assert.fail('Unexpected operation'); });
  const child = Object.freeze({
    prepareOriginalFunding: unused,
    commitOriginalFunding: unused,
    submitOriginalFunding: unused,
    handoffToService: unused,
    submitOriginal: Object.freeze(() => {
      state.operationCalls += 1;
      return Promise.resolve();
    }),
    inspect: Object.freeze(() => Object.freeze({
      lifecycle: state.lifecycle,
      held: false,
      publicOperationActive: state.active,
    })),
    close: Object.freeze(() => {
      state.closeCalls += 1;
      state.lifecycle = 'CLOSED';
      return closeReceipt.promise;
    }),
  });
  const application = createApiCreditFundingGrantRecoveryApplication({
    application: child,
    custody: Object.freeze({ retain: unused, read: unused, assertCurrent: unused }),
    paymentId: 'payment.original',
    fundingResourceUrl: 'https://service.example.test/funding',
  });
  return { application, closeReceipt, state };
}

test('recovery stays CLOSING until its close receipt is confirmed', async () => {
  const { application, closeReceipt, state } = fixture();
  const closing = application.close();
  const pending = application.inspect();
  assert.equal(application.close(), closing);
  await assert.rejects(application.submitOriginal({}));
  closeReceipt.resolve();
  assert.equal(await closing, undefined);

  assert.equal(pending.lifecycle, 'CLOSING');
  assert.equal(pending.held, false);
  assert.equal(application.inspect().lifecycle, 'CLOSED');
  assert.equal(state.closeCalls, 1);
  assert.equal(state.operationCalls, 0);
});

test('a failed close remains HELD when the child reports CLOSED', async () => {
  const { application, closeReceipt, state } = fixture();
  const closing = application.close();
  const pending = application.inspect();
  closeReceipt.reject(new Error('Declared close failure'));
  await assert.rejects(closing, /API_CREDIT_FUNDING_GRANT_RECOVERY_UNAVAILABLE/);

  assert.equal(pending.lifecycle, 'CLOSING');
  assert.equal(application.inspect().lifecycle, 'HELD');
  assert.equal(application.close(), closing);
  assert.equal(state.closeCalls, 1);
});

test('CLOSED observations still require an idle child after confirmation', async () => {
  const { application, closeReceipt, state } = fixture();
  const closing = application.close();
  closeReceipt.resolve();
  await closing;
  assert.equal(application.inspect().lifecycle, 'CLOSED');

  state.active = true;
  assert.equal(application.inspect().lifecycle, 'CLOSING');
  assert.equal(application.close(), closing);
  assert.equal(state.closeCalls, 1);
});
