import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createServiceCreditCustodiedSequentialRunnerCore as CREATE_CORE,
} from '../src/service-credit-custodied-sequential-runner-core.js';

test('accepted run receipt survives caller array prototype mutation', async () => {
  const drains = [];
  const observe = promise => {
    drains.push(promise.then(() => undefined, () => undefined));
    return promise;
  };
  let release;
  const submitted = observe(new Promise(resolve => { release = resolve; }));
  const cachedClose = observe(Promise.resolve(undefined));
  let submits = 0, closes = 0, runner, run;
  // Structural metadata only; this does not assert semantic custody or auth.
  const entry = {
    grantId: 'grant.receipt', requestId: 'request.one',
    originalRequestJson: '{"unit":"receipt"}', originalBodyBase64: '',
    serviceResourceUrl: 'https://receipt.invalid/execute',
    authorizationHeader: 'synthetic authorization',
  };
  const batch = [entry];
  const neverAccepted = Object.setPrototypeOf([entry], null);
  try {
    runner = CREATE_CORE({
      selectedGrantId: 'grant.receipt', storeOwnership: 'BORROWED',
      submitOriginal() { submits += 1; return submitted; },
      snapshot: () => ({
        owner: { uncertainty: { custody: false, submission: false, undrained: false } },
        lastTransport: null,
      }),
      close() { closes += 1; return cachedClose; },
    });
    run = observe(runner.runOriginals(batch));
    assert.equal(submits, 1);
    Object.setPrototypeOf(batch, null);
    const pendingReplay = observe(runner.runOriginals(batch));
    assert.strictEqual(pendingReplay, run);
    assert.equal(submits, 1);

    release();
    await submitted;
    await run;
    const closing = observe(runner.close());
    const repeatedClose = observe(runner.close());
    assert.strictEqual(closing, cachedClose);
    assert.strictEqual(repeatedClose, cachedClose);
    await closing;
    const terminalReplay = observe(runner.runOriginals(batch));
    assert.strictEqual(terminalReplay, run);

    const other = observe(runner.runOriginals([entry]));
    const invalid = observe(runner.runOriginals(neverAccepted));
    await assert.rejects(other, {
      code: 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_ALREADY_RUN',
    });
    await assert.rejects(invalid, {
      code: 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_INVALID_INPUT',
    });
    const view = runner.snapshot();
    assert.deepEqual(
      [view.attempted, view.completed, view.queuedReferences, submits, closes, view.closeCalls],
      [1, 1, 0, 1, 1, 1],
    );
  } finally {
    release();
    await Promise.allSettled([submitted, run, cachedClose]);
    if (runner) await Promise.allSettled([observe(runner.close()), cachedClose]);
    await Promise.all(drains);
  }
});
