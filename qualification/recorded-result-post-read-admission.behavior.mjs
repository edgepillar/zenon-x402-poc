import assert from 'node:assert/strict';
import { recordedResultFixture } from './api-credit-recorded-result.fixture.mjs';

async function checkAdmissionAfterRead(childChange) {
  let observedRead = false;
  let submissionEntries = 0;
  const fixture = recordedResultFixture({
    onRead(view) {
      assert.equal(view, null);
      observedRead = true;
      return view;
    },
    wrapDeclaredApplication(_fixture, child) {
      return Object.freeze({
        ...child,
        inspect: Object.freeze(() => {
          const view = child.inspect();
          return observedRead ? Object.freeze({ ...view, ...childChange }) : view;
        }),
        submitOriginal: Object.freeze(() => {
          submissionEntries += 1;
          return Promise.reject(new Error('Unexpected submission to the unavailable service owner'));
        }),
      });
    },
  });

  try {
    await fixture.start();
    const before = JSON.stringify(fixture.h.model.exportState());
    const request = fixture.request('request.after.read');
    await assert.rejects(fixture.root.submitOriginal(request), /API_CREDIT_SERVICE_RESULT_UNKNOWN/);
    assert.equal(fixture.reads, 1);
    assert.equal(submissionEntries, 0);
    assert.equal(fixture.root.inspect().held, true);
    await assert.rejects(fixture.root.submitOriginal(request), /API_CREDIT_SERVICE_RESULT_INPUT_OR_UNAVAILABLE/);
    assert.equal(fixture.reads, 1);
    assert.equal(submissionEntries, 0);
    assert.equal(JSON.stringify(fixture.h.model.exportState()), before);
  } finally {
    await fixture.cleanup();
  }
}

const cases = [
  ['closing-after-record-lookup', { lifecycle: 'CLOSING', closeRequested: true }],
  ['busy-after-record-lookup', { publicOperationActive: true }],
];
const results = [];
for (const [id, state] of cases) {
  try {
    await checkAdmissionAfterRead(state);
    results.push({ id, status: 'PASS' });
  } catch (error) {
    results.push({ id, status: 'FAIL', error: error.message });
  }
}
const failed = results.filter(result => result.status === 'FAIL').length;
console.log(JSON.stringify({
  qualification: 'G1_RECORDED_RESULT_POST_READ_ADMISSION_DATA',
  passed: results.length - failed, failed, cases: results, declaredMemoryPorts: true,
  nativeExecutions: 0, SDK: 0, SQLite: 0, sockets: 0, signatures: 0, actualPrepare: 0,
}));
if (failed !== 0) process.exitCode = 1;
