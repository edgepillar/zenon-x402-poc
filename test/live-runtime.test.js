import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_RPC_OUTCOMES,
  LIVE_RUNTIME_ERROR_CODES,
  LiveSdkRuntime,
  liveSdkRuntime,
} from '../src/live-runtime.js';
import { ExactZenonClient, ExactZenonFacilitator } from '../src/zenon-payment.js';

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('live SDK ownership is FIFO across independent callers', async () => {
  const runtime = new LiveSdkRuntime();
  const firstEntered = deferred();
  const releaseFirst = deferred();
  const events = [];

  const first = runtime.withOwner('facilitator-a', async () => {
    events.push('first:start');
    firstEntered.resolve();
    await releaseFirst.promise;
    events.push('first:end');
  });
  await firstEntered.promise;

  const second = runtime.withOwner('facilitator-b', async () => {
    events.push('second');
  });
  const third = runtime.withOwner('facilitator-c', async () => {
    events.push('third');
  });
  await Promise.resolve();
  assert.deepEqual(events, ['first:start']);

  releaseFirst.resolve();
  await Promise.all([first, second, third]);
  assert.deepEqual(events, ['first:start', 'first:end', 'second', 'third']);
});

test('buyer and facilitator conceptual callers share one owner', async () => {
  const runtime = new LiveSdkRuntime();
  const buyerEntered = deferred();
  const releaseBuyer = deferred();
  let concurrentOwners = 0;
  let maximumConcurrentOwners = 0;

  const runCaller = (name, entered, release) => runtime.withOwner(name, async () => {
    concurrentOwners += 1;
    maximumConcurrentOwners = Math.max(maximumConcurrentOwners, concurrentOwners);
    entered?.resolve();
    await release?.promise;
    concurrentOwners -= 1;
  });

  const buyer = runCaller('buyer.prepare', buyerEntered, releaseBuyer);
  await buyerEntered.promise;
  const facilitator = runCaller('facilitator.verify');
  await Promise.resolve();
  assert.equal(maximumConcurrentOwners, 1);

  releaseBuyer.resolve();
  await Promise.all([buyer, facilitator]);
  assert.equal(maximumConcurrentOwners, 1);
});

test('all live client and facilitator instances are wired to the one module runtime', async () => {
  const buyer = new ExactZenonClient();
  const firstFacilitator = new ExactZenonFacilitator();
  const secondFacilitator = new ExactZenonFacilitator();
  assert.equal(buyer.runtime, liveSdkRuntime);
  assert.equal(firstFacilitator.runtime, liveSdkRuntime);
  assert.equal(secondFacilitator.runtime, liveSdkRuntime);

  let active = 0;
  let peak = 0;
  const operation = owner => liveSdkRuntime.withOwner(owner, async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active -= 1;
  });
  await Promise.all([
    operation('test.buyer'),
    operation('test.facilitator-a'),
    operation('test.facilitator-b'),
  ]);
  assert.equal(peak, 1);
});

test('ordinary owner error releases the runtime', async () => {
  const runtime = new LiveSdkRuntime();

  await assert.rejects(
    runtime.withOwner('first', async () => {
      throw new Error('ordinary failure');
    }),
    /ordinary failure/,
  );

  assert.equal(await runtime.withOwner('second', async () => 'usable'), 'usable');
  assert.equal(runtime.poisoned, false);
});

test('uncertain singleton cleanup poisons before ownership is released', async () => {
  const runtime = new LiveSdkRuntime();
  await runtime.withOwner('cleanup', async (scope) => {
    scope.poison(new Error('cleanup failed'));
  });
  assert.equal(runtime.poisoned, true);
  await assert.rejects(
    runtime.withOwner('later', async () => 'must not run'),
    { code: LIVE_RUNTIME_ERROR_CODES.POISONED },
  );
});

test('never-resolving read poisons before teardown and rejects queued callers', async () => {
  const runtime = new LiveSdkRuntime();
  const readStarted = deferred();
  let poisonObservedDuringTeardown = false;
  let queuedStarted = false;

  const timedOutRead = runtime.withOwner('reader', async (scope) => scope.runRpcWithDeadline({
    category: 'read',
    operation: 'ledger.getFrontierAccountBlock',
    timeoutMs: 15,
    execute: () => {
      readStarted.resolve();
      return new Promise(() => {});
    },
    teardown: () => {
      poisonObservedDuringTeardown = runtime.poisoned;
    },
  }));
  await readStarted.promise;

  const queued = runtime.withOwner('queued-reader', async () => {
    queuedStarted = true;
  });

  await assert.rejects(timedOutRead, (error) => {
    assert.equal(error.code, LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT);
    assert.equal(error.outcome, LIVE_RPC_OUTCOMES.READ_UNAVAILABLE);
    return true;
  });
  await assert.rejects(queued, (error) => error.code === LIVE_RUNTIME_ERROR_CODES.POISONED);
  assert.equal(poisonObservedDuringTeardown, true);
  assert.equal(queuedStarted, false);
});

test('publication deadline reports an unknown submission outcome', async () => {
  const runtime = new LiveSdkRuntime();

  await assert.rejects(
    runtime.withOwner('publisher', async (scope) => scope.runRpcWithDeadline({
      category: 'publication',
      operation: 'ledger.publishRawTransaction',
      timeoutMs: 10,
      execute: () => new Promise(() => {}),
      teardown: () => {},
    })),
    (error) => {
      assert.equal(error.code, LIVE_RUNTIME_ERROR_CODES.PUBLICATION_TIMEOUT);
      assert.equal(error.outcome, LIVE_RPC_OUTCOMES.SUBMISSION_OUTCOME_UNKNOWN);
      return true;
    },
  );
});

test('a late SDK continuation triggers a second best-effort teardown', async () => {
  const runtime = new LiveSdkRuntime();
  const operation = deferred();
  const teardownCalls = [];

  await assert.rejects(
    runtime.withOwner('late-reader', scope => scope.runRpcWithDeadline({
      category: 'read',
      operation: 'zenon.initialize',
      timeoutMs: 10,
      execute: () => operation.promise,
      teardown: async () => {
        teardownCalls.push(`teardown-${teardownCalls.length + 1}`);
      },
    })),
    error => error.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT,
  );
  assert.deepEqual(teardownCalls, ['teardown-1']);

  operation.resolve('late-result');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(teardownCalls, ['teardown-1', 'teardown-2']);
  assert.equal(runtime.poisoned, true);
});

test('no new live SDK session begins after poisoning', async () => {
  const runtime = new LiveSdkRuntime();

  await assert.rejects(runtime.withOwner('timed-out', (scope) => scope.runRpcWithDeadline({
    category: 'read',
    operation: 'stats.syncInfo',
    timeoutMs: 10,
    execute: () => new Promise(() => {}),
    teardown: () => {},
  })));

  let began = false;
  await assert.rejects(
    runtime.withOwner('must-not-start', async () => {
      began = true;
    }),
    (error) => {
      assert.equal(error.code, LIVE_RUNTIME_ERROR_CODES.POISONED);
      assert.equal(error.message, LIVE_RUNTIME_ERROR_CODES.POISONED);
      return true;
    },
  );
  assert.equal(began, false);
});
