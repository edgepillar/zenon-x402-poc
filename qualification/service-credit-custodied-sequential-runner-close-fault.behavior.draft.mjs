// Source-pinned synthetic component qualification, not native resource proof.
// The retained 1 + 8 + 5 registrations run unchanged except the two core guards.
// Seven new registrations inject only test-owned close callback faults.
// No SQL, SDK, signing, network, actual provider, restart or live pilot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sourceSpecs = [
  ['../src/service-credit-custodied-sequential-runner-core.js', 15749, 489, '42b5f7d7f1f8318ff50dd79d1729d93220c51ab95a7449610d44de91916c7914'],
  ['../src/service-credit-original-request-custody-contract.js', 14051, 356, 'fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915'],
  ['../src/service-credit-custodied-sequential-runner.js', 4184, 93, '793c2d383e6b96f75ed676fe98a274b8777e293b9bef56eed028f0825df31326'],
  ['../src/service-credit-custodied-http-client.js', 10755, 292, 'ddbc54faf4a14d95e6274bc9df27b7b49db251bab67c11b871cfb2f9e78b4f15'],
  ['../src/service-credit-custodied-request-owner.js', 35073, 938, '6e7493a4859d48530820e68a4a19a513aad014ffc1048b42965a3ad36ae7c5f7'],
  ['../src/service-credit-http-execute-dispatch.js', 27034, 770, '254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b'],
  ['../package.json', 1413, 40, '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5'],
  ['../test/service-credit-custodied-sequential-runner-accepted-receipt-prototype.test.js', 2817, 73, 'bbf99a61bac18b984c6d545200666388278646ef002ddac08ba3a3220e7eabad'],
  ['./service-credit-custodied-runner-receipt-core-v2-compatibility.mjs', 45005, 1193, '406bc0a15d7672cfc99b2294e6d5809d2dff35bdbb8b76adbe8cfd63b0334e20'],
  ['./service-credit-custodied-runner-receipt-core-v3-compatibility.mjs', 28663, 536, '53702b0abbaa291b0237efe5819ec528583d9e2e84063c351f33e92ddc7ec31e'],
];
for (const [relative, bytes, LF, sha256] of sourceSpecs) {
  const raw = readFileSync(new URL(relative, import.meta.url));
  assert.equal(raw.length, bytes, 'SOURCE_BYTES');
  assert.equal(raw.toString('ascii').split('\n').length - 1, LF, 'SOURCE_LINES');
  assert.equal(createHash('sha256').update(raw).digest('hex'), sha256, 'SOURCE_SHA256');
}
assert.equal(process.versions.node, '24.19.0', 'EXACT_NODE_VERSION_REQUIRED');
assert.equal(process.argv.length, 2, 'ONE_EXPLICIT_ENTRY_REQUIRED');
await import('../test/service-credit-custodied-sequential-runner-accepted-receipt-prototype.test.js');
await import('./service-credit-custodied-runner-receipt-core-v2-compatibility.mjs');
await import('./service-credit-custodied-runner-receipt-core-v3-compatibility.mjs');
const { createServiceCreditCustodiedSequentialRunnerCore: CREATE } =
  await import('../src/service-credit-custodied-sequential-runner-core.js');

const LABELS = ['BORROWED', 'OWNED_EXISTING_V2', 'OWNED_EXISTING_V3_DISPATCH_INTENT'];
const PREFIX = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const VIEW = Object.freeze({
  owner: Object.freeze({ uncertainty: Object.freeze({
    custody: false, submission: false, undrained: false,
  }) }),
  lastTransport: null,
});
const OPTIONS = { timeout: 5000, concurrency: false };

function original(id = 'request.one') {
  // Structural metadata only. No real original, proof, key or payment is read.
  return {
    grantId: 'grant.close', requestId: id, originalRequestJson: '{"synthetic":"close"}',
    originalBodyBase64: '', serviceResourceUrl: 'https://synthetic.invalid/execute',
    authorizationHeader: 'synthetic original authorization',
  };
}
function capability() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function observed(promise) {
  const view = { promise, settled: false, outcome: null };
  view.outcome = promise.then(
    value => { view.settled = true; return { value }; },
    error => { view.settled = true; return { error }; },
  );
  return view;
}
function fixture(label, onClose, submitted = Promise.resolve(undefined)) {
  const f = { submits: 0, closes: 0, runner: null };
  f.runner = CREATE({
    selectedGrantId: 'grant.close', storeOwnership: label,
    submitOriginal() { f.submits++; return submitted; },
    snapshot: () => VIEW,
    close() { f.closes++; return onClose(f); },
  });
  assert.deepEqual([f.submits, f.closes], [0, 0]);
  return f;
}
function failed(result, suffix = 'RUN_FAILED') {
  assert.deepEqual(Object.keys(result), ['error']);
  const error = result.error;
  assert.equal(Object.getPrototypeOf(error), TypeError.prototype);
  assert.equal(error.code, PREFIX + suffix);
  assert.equal(error.message, error.code);
  assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.equal(Object.isFrozen(error), true);
}
function held(f, completed = 0, active = false) {
  const view = f.runner.snapshot();
  assert.equal(Object.isFrozen(view), true);
  assert.equal(view.closed, true);
  assert.equal(view.active, active);
  assert.equal(view.closeCalls, 1);
  assert.equal(view.closeOutcome, 'UNOBSERVABLE');
  assert.equal(view.unknown, true);
  assert.equal(view.unknownUndrained, true);
  assert.equal(view.completed, completed);
  assert.equal(view.queuedReferences, 0);
  assert.equal(f.closes, 1);
  for (const key of ['serviceDelivery', 'currentAuthority', 'realReady', 'durability', 'restart', 'osCleanup'])
    assert.equal(view[key], 'NOT_ESTABLISHED');
  assert.equal(JSON.stringify(view).includes('synthetic original authorization'), false);
  return view;
}
async function turns() {
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
}

test('sequential close latches synchronous child faults without leaking or retrying', OPTIONS, async () => {
  for (const label of LABELS) {
    let hooks = 0;
    const thrown = new Proxy({}, {
      get() { hooks++; throw Error('UNUSED'); },
      ownKeys() { hooks++; throw Error('UNUSED'); },
      getPrototypeOf() { hooks++; throw Error('UNUSED'); },
    });
    const f = fixture(label, () => { throw thrown; });
    let returned;
    assert.doesNotThrow(() => { returned = f.runner.close(); });
    assert.equal(returned, undefined); // No native close Promise existed.
    assert.equal(f.runner.close(), undefined);
    const view = held(f);
    assert.equal(view.failure, 'CLOSE_UNOBSERVABLE');
    assert.equal(view.runClaimed, false);
    assert.equal(view.outcome, 'NOT_RUN');
    failed(await observed(f.runner.runOriginals([original()])).outcome, 'CLOSED');
    assert.deepEqual([f.submits, f.closes, hooks], [0, 1, 0]);
  }
});

test('sequential close latches invalid null and non-Promise returns without caller hooks', OPTIONS, async () => {
  for (const label of LABELS) {
    let hooks = 0;
    const accessor = Object.defineProperty({}, 'then', {
      get() { hooks++; throw Error('UNUSED'); },
    });
    const proxy = new Proxy({}, { get() { hooks++; throw Error('UNUSED'); } });
    for (const returned of [null, undefined, false, accessor, proxy]) {
      const f = fixture(label, () => returned);
      assert.strictEqual(f.runner.close(), returned);
      assert.strictEqual(f.runner.close(), returned);
      const view = held(f);
      assert.equal(view.failure, 'CLOSE_UNOBSERVABLE');
      failed(await observed(f.runner.runOriginals([original()])).outcome, 'CLOSED');
      assert.deepEqual([f.submits, f.closes, hooks], [0, 1, 0]);
    }
  }
});

test('sequential auto-close faults reject the original receipt after callback completion', OPTIONS, async () => {
  for (const label of LABELS) {
    const f = fixture(label, () => { throw Object.freeze({ synthetic: true }); });
    const batch = [original()], run = observed(f.runner.runOriginals(batch));
    failed(await run.outcome);
    const view = held(f, 1);
    assert.equal(view.failure, 'CLOSE_UNOBSERVABLE');
    assert.equal(view.phase, 'FAILED');
    assert.equal(view.runSettled, true);
    assert.deepEqual([view.planned, view.attempted, view.notAttempted, f.submits], [1, 1, 0, 1]);
    Object.setPrototypeOf(batch, null);
    batch[0] = null;
    assert.strictEqual(f.runner.runOriginals(batch), run.promise);
    failed(await observed(f.runner.runOriginals([original('replacement')])).outcome, 'ALREADY_RUN');
    assert.equal(f.runner.close(), undefined);
    assert.equal(f.closes, 1);
  }
});

test('sequential entry failure and invalid completion cannot strand a close-faulted receipt', OPTIONS, async () => {
  for (const label of LABELS) {
    for (const mode of ['rejected', 'invalid-completion']) {
      const submit = capability(), submitView = observed(submit.promise);
      const f = fixture(label, () => { throw 'synthetic-close-fault'; }, submit.promise);
      const batch = [original(), original('request.two')];
      const run = observed(f.runner.runOriginals(batch));
      try {
        if (mode === 'rejected') submit.reject('synthetic-entry-fault');
        else submit.resolve('not-void');
        await submitView.outcome;
        failed(await run.outcome);
        const view = held(f);
        assert.equal(view.failure, 'CLOSE_UNOBSERVABLE');
        assert.equal(view.runSettled, true);
        assert.deepEqual([view.planned, view.attempted, view.notAttempted, f.submits], [2, 1, 1, 1]);
        assert.strictEqual(f.runner.runOriginals(batch), run.promise);
        assert.equal(f.runner.close(), undefined);
      } finally {
        submit.resolve(undefined);
        await submitView.outcome;
        await run.outcome;
      }
    }
  }
});

test('sequential manual close faults fence queued work and await only the active callback', OPTIONS, async () => {
  for (const label of LABELS) {
    for (const mode of ['fulfilled', 'rejected']) {
      const submit = capability(), submitView = observed(submit.promise);
      const f = fixture(label, () => { throw 'synthetic-close-fault'; }, submit.promise);
      const batch = [original(), original('request.two'), original('request.three')];
      const run = observed(f.runner.runOriginals(batch));
      try {
        assert.equal(f.submits, 1);
        assert.equal(f.runner.close(), undefined);
        const before = held(f, 0, true);
        assert.equal(before.runSettled, false);
        assert.equal(before.failure, 'CLOSE_UNOBSERVABLE');
        await turns();
        assert.equal(run.settled, false);
        assert.strictEqual(f.runner.runOriginals(batch), run.promise);
        assert.equal(f.runner.close(), undefined);
        if (mode === 'fulfilled') submit.resolve(undefined);
        else submit.reject('synthetic-entry-fault');
        await submitView.outcome;
        failed(await run.outcome);
        const after = held(f, mode === 'fulfilled' ? 1 : 0);
        assert.equal(after.phase, 'FAILED');
        assert.equal(after.runSettled, true);
        // Later entry processing may refine failure to CHILD_UNCERTAINTY or
        // ENTRY_REJECTED. The failed/unobservable close is never cleared.
        assert.equal(after.failure, mode === 'fulfilled' ? 'CHILD_UNCERTAINTY' : 'ENTRY_REJECTED');
        assert.deepEqual([after.planned, after.attempted, after.notAttempted, f.submits], [3, 1, 2, 1]);
        assert.equal(f.runner.close(), undefined);
        assert.equal(f.closes, 1);
      } finally {
        submit.resolve(undefined);
        await submitView.outcome;
        await run.outcome;
      }
    }
  }
});

test('sequential close latches before a reentrant child call and preserves its native Promise', OPTIONS, async () => {
  for (const label of LABELS) {
    const closing = capability(), closingView = observed(closing.promise);
    let reentrant;
    const f = fixture(label, child => {
      reentrant = child.runner.close();
      return closing.promise;
    });
    try {
      const actual = f.runner.close();
      assert.strictEqual(actual, closing.promise);
      assert.strictEqual(reentrant, null); // Not yet returned; no substitute Promise.
      assert.strictEqual(f.runner.close(), closing.promise);
      assert.deepEqual([f.submits, f.closes], [0, 1]);
      assert.equal(f.runner.snapshot().closeOutcome, 'WAITING');
      closing.resolve(undefined);
      assert.deepEqual(await closingView.outcome, { value: undefined });
      await turns();
      const view = f.runner.snapshot();
      assert.equal(view.closeOutcome, 'FULFILLED');
      assert.equal(view.unknown, false);
      assert.equal(view.unknownUndrained, false);
      assert.equal(view.runClaimed, false);
      assert.strictEqual(f.runner.close(), closing.promise);
      assert.equal(f.closes, 1);
    } finally {
      closing.resolve(undefined);
      await closingView.outcome;
    }
  }
});

test('sequential close retains exact fulfilled and rejected native close Promises', OPTIONS, async () => {
  for (const label of LABELS) {
    for (const mode of ['fulfilled', 'rejected', 'nonvoid-fulfillment']) {
      const closing = capability(), closingView = observed(closing.promise);
      const f = fixture(label, () => closing.promise);
      const batch = [original()], run = observed(f.runner.runOriginals(batch));
      try {
        await turns();
        assert.equal(f.submits, 1);
        assert.equal(f.closes, 1);
        assert.equal(run.settled, false);
        assert.strictEqual(f.runner.close(), closing.promise);
        assert.strictEqual(f.runner.close(), closing.promise);
        if (mode === 'rejected') closing.reject('synthetic-close-rejection');
        else closing.resolve(mode === 'fulfilled' ? undefined : 'not-void');
        await closingView.outcome;
        const result = await run.outcome;
        if (mode === 'fulfilled') assert.deepEqual(result, { value: undefined });
        else failed(result);
        const view = f.runner.snapshot();
        assert.equal(view.closeOutcome, mode === 'fulfilled' ? 'FULFILLED' : 'REJECTED');
        assert.equal(view.unknown, mode !== 'fulfilled');
        assert.equal(view.unknownUndrained, false);
        assert.equal(view.completed, 1);
        assert.equal(view.runSettled, true);
        assert.strictEqual(f.runner.runOriginals(batch), run.promise);
        assert.strictEqual(f.runner.close(), closing.promise);
        assert.equal(f.closes, 1);
      } finally {
        closing.resolve(undefined);
        await closingView.outcome;
        await run.outcome;
      }
    }
  }
});
