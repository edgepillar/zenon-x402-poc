import assert from 'node:assert/strict';
import { deferred, recordedResultFixture } from './api-credit-recorded-result.fixture.mjs';

function controlledFixture({ delayClose = false, delaySubmission = false } = {}) {
  const stop = deferred();
  const submission = deferred();
  let child, childClose, stops = 0, submissions = 0, reportBusy = false;
  const fixture = recordedResultFixture({
    wrapDeclaredApplication(_fixture, application) {
      child = application;
      return Object.freeze({
        ...application,
        inspect: Object.freeze(() => {
          const view = application.inspect();
          return reportBusy ? Object.freeze({ ...view, publicOperationActive: true }) : view;
        }),
        close: Object.freeze(() => {
          stops += 1;
          childClose = application.close();
          return delayClose ? childClose.then(() => stop.promise) : childClose;
        }),
        ...(delaySubmission ? {
          submitOriginal: Object.freeze(() => {
            submissions += 1;
            return submission.promise;
          }),
        } : {}),
      });
    },
  });
  return {
    fixture, stop, submission,
    childView: () => child.inspect(),
    childClose: () => childClose,
    stopCount: () => stops,
    submissionCount: () => submissions,
    setBusy() { reportBusy = true; },
    async cleanup() {
      stop.resolve(undefined);
      submission.resolve(undefined);
      await fixture.cleanup();
    },
  };
}

async function closeReceiptCase(rejectReceipt) {
  const probe = controlledFixture({ delayClose: true });
  const { fixture, stop } = probe;
  try {
    await fixture.start();
    const closing = fixture.root.close();
    closing.catch(() => {});
    await probe.childClose();
    assert.equal(probe.childView().lifecycle, 'CLOSED');
    const pending = fixture.root.inspect();
    assert.equal(fixture.root.close(), closing);
    if (rejectReceipt) {
      stop.reject(new Error('Declared close receipt failure'));
      await assert.rejects(closing, /API_CREDIT_SERVICE_RESULT_CLOSE_UNKNOWN/);
      assert.equal(fixture.root.inspect().lifecycle, 'HELD');
    } else {
      stop.resolve(undefined);
      assert.equal(await closing, undefined);
      assert.equal(fixture.root.inspect().lifecycle, 'CLOSED');
    }
    assert.equal(pending.lifecycle, 'CLOSING');
    assert.equal(pending.held, false);
    assert.equal(probe.stopCount(), 1);
  } finally {
    await probe.cleanup();
  }
}

async function closeDuringSubmission() {
  const probe = controlledFixture({ delaySubmission: true });
  const { fixture, submission } = probe;
  try {
    await fixture.start();
    const operation = fixture.root.submitOriginal(fixture.request('request.pending.close'));
    operation.catch(() => {});
    assert.equal(probe.submissionCount(), 1);
    const closing = fixture.root.close();
    closing.catch(() => {});
    await probe.childClose();
    assert.equal(probe.childView().lifecycle, 'CLOSED');
    const pending = fixture.root.inspect();
    assert.equal(pending.recordedServiceResults.active, true);
    submission.resolve(undefined);
    await assert.rejects(operation, /API_CREDIT_SERVICE_RESULT_UNKNOWN/);
    await assert.rejects(closing, /API_CREDIT_SERVICE_RESULT_CLOSE_UNKNOWN/);
    assert.equal(pending.lifecycle, 'CLOSING');
    assert.equal(fixture.root.inspect().lifecycle, 'HELD');
    assert.equal(probe.stopCount(), 1);
  } finally {
    await probe.cleanup();
  }
}

async function busyViewAfterClose() {
  const probe = controlledFixture();
  try {
    await probe.fixture.start();
    await probe.fixture.root.close();
    assert.equal(probe.fixture.root.inspect().lifecycle, 'CLOSED');
    probe.setBusy();
    assert.equal(probe.fixture.root.inspect().lifecycle, 'CLOSING');
    assert.equal(probe.stopCount(), 1);
  } finally {
    await probe.cleanup();
  }
}

const cases = [
  ['child-closed-awaiting-acknowledgement', () => closeReceiptCase(false)],
  ['child-closed-with-failed-acknowledgement', () => closeReceiptCase(true)],
  ['child-closed-with-active-submission', closeDuringSubmission],
  ['closed-view-with-contradictory-child-activity', busyViewAfterClose],
];
const results = [];
for (const [id, run] of cases) {
  try {
    await run();
    results.push({ id, status: 'PASS' });
  } catch (error) {
    results.push({ id, status: 'FAIL', error: error.message });
  }
}
const failed = results.filter(result => result.status === 'FAIL').length;
console.log(JSON.stringify({
  qualification: 'G2_RECORDED_RESULT_CLOSE_REPORTING_DATA',
  passed: results.length - failed, failed, cases: results, declaredMemoryPorts: true,
  nativeExecutions: 0, SDK: 0, SQLite: 0, sockets: 0, signatures: 0, actualPrepare: 0,
}));
if (failed !== 0) process.exitCode = 1;
