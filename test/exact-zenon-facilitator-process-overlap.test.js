import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  OfflinePayerWorkerAdmission,
  PAYER_WORKER_ADMISSION_ERROR_CODES as CODES,
  PAYER_WORKER_LANES as LANES,
  PAYER_WORKER_OPERATION_KINDS as KINDS,
  PayerWorkerAdmissionError,
} from '../src/zenon/payer-worker-admission.js';

const CHILD = fileURLToPath(new URL('../test-support/exact-zenon-facilitator-verify-child.js', import.meta.url));
const FIXTURE_URL = new URL('./fixtures/phase2a-exact-client-goldens.v1.json', import.meta.url);
const EXECUTABLE = process.execPath;
const COUNT_FIELDS = ['initialize', 'network', 'sync', 'momentum', 'authenticate',
  'asset', 'frontier', 'unconfirmed', 'clear'];
const EXPECTED = { A: [1, 1, 1, 1, 1, 0, 1, 2, 1], B: [1, 1, 1, 1, 1, 1, 1, 2, 1] };
const manifest = JSON.parse(readFileSync(FIXTURE_URL, 'utf8'));

function fixedFailure(code) {
  const error = new Error(code);
  error.name = 'ProcessProofError';
  error.stack = `ProcessProofError: ${code}`;
  return error;
}

function bounded(promise, milliseconds) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), milliseconds);
    promise.then(() => { clearTimeout(timer); resolve(true); });
  });
}

function launch(label) {
  const child = spawn(EXECUTABLE, [CHILD, label], {
    env: Object.create(null), shell: false, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let resolveFrontier, rejectFrontier, resolveDone, rejectDone, resolveClosed;
  const frontier = new Promise((resolve, reject) => { resolveFrontier = resolve; rejectFrontier = reject; });
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  const closedPromise = new Promise(resolve => { resolveClosed = resolve; });
  void frontier.catch(() => {});
  void done.catch(() => {});
  let output = '', outputBytes = 0, stderrBytes = 0;
  let reached = false, released = false, closed = false, terminating = false;
  let counts = null, failure = null;
  let killTimer;

  const terminate = () => {
    if (terminating || closed) return;
    terminating = true;
    child.stdin.destroy();
    try { child.kill('SIGTERM'); } catch {}
    killTimer = setTimeout(() => { if (!closed) try { child.kill('SIGKILL'); } catch {} }, 250);
    killTimer.unref();
  };
  const fail = code => {
    if (failure === null) failure = code;
    terminate();
  };
  const acceptLine = line => {
    if (line === 'AT_FRONTIER' && !reached && !released && counts === null) {
      reached = true;
      resolveFrontier();
      return;
    }
    const match = /^RESULT ((?:[0-9]+,){8}[0-9]+)$/u.exec(line);
    if (!match || !reached || !released || counts !== null) return fail('CHILD_PROTOCOL');
    const values = match[1].split(',').map(Number);
    counts = Object.fromEntries(COUNT_FIELDS.map((field, index) => [field, values[index]]));
  };
  child.stdout.on('data', chunk => {
    outputBytes += chunk.length;
    const text = chunk.toString('utf8');
    if (outputBytes > 1024 || /[^\x0a\x20-\x7e]/u.test(text)) return fail('CHILD_STDOUT_LIMIT');
    output += text;
    for (let newline; (newline = output.indexOf('\n')) !== -1;) {
      const line = output.slice(0, newline);
      output = output.slice(newline + 1);
      acceptLine(line);
    }
  });
  child.stderr.on('data', chunk => {
    stderrBytes += chunk.length;
    fail(stderrBytes > 1024 ? 'CHILD_STDERR_LIMIT' : 'CHILD_STDERR');
  });
  child.stdin.on('error', () => fail('CHILD_STDIN'));
  child.stdout.on('error', () => fail('CHILD_STDOUT'));
  child.stderr.on('error', () => fail('CHILD_STDERR'));
  child.once('error', () => fail('CHILD_SPAWN'));
  const watchdog = setTimeout(() => fail('CHILD_WATCHDOG'), 15_000);
  watchdog.unref();
  child.once('close', (code, signal) => {
    closed = true;
    clearTimeout(watchdog);
    clearTimeout(killTimer);
    if (output.length !== 0 && failure === null) failure = 'CHILD_PROTOCOL';
    if ((code !== 0 || signal !== null) && failure === null) failure = 'CHILD_EXIT';
    if ((!reached || counts === null) && failure === null) failure = 'CHILD_INCOMPLETE';
    resolveClosed();
    if (failure === null) resolveDone({ valid: true, counts });
    else {
      const error = fixedFailure(failure);
      rejectFrontier(error);
      rejectDone(error);
    }
  });
  return {
    identity: child.pid,
    frontier,
    done,
    release() {
      if (!reached || released || closed) throw fixedFailure('CHILD_RELEASE_STATE');
      released = true;
      child.stdin.end('RELEASE\n');
    },
    async stop() {
      if (!closed) terminate();
      if (!await bounded(closedPromise, 2_000)) {
        try { child.kill('SIGKILL'); } catch {}
        if (!await bounded(closedPromise, 1_000)) throw fixedFailure('CHILD_REAP_TIMEOUT');
      }
    },
  };
}

async function cleanup(children) {
  const outcomes = await Promise.allSettled(children.map(child => child.stop()));
  if (outcomes.some(outcome => outcome.status !== 'fulfilled')) throw fixedFailure('CHILD_CLEANUP_FAILED');
}

function assertResult(result, label) {
  assert.equal(result.valid, true);
  assert.deepEqual(COUNT_FIELDS.map(field => result.counts[field]), EXPECTED[label]);
}

function payer(label) {
  return manifest.scenarios[label].expected.paymentPayload.payload.transaction.address;
}

function request(selectedPayer, operationId) {
  return { payer: selectedPayer, operationId, kind: KINDS.FACILITATOR_VERIFY };
}

test('distinct admitted payers overlap inside real verify on distinct processes', async () => {
  const admission = new OfflinePayerWorkerAdmission({ lane: LANES.FACILITATOR, workerIds: ['worker-a', 'worker-b'] });
  const first = admission.admit(request(payer('A'), 'overlap-a'));
  const second = admission.admit(request(payer('B'), 'overlap-b'));
  admission.markDispatched(first);
  admission.markDispatched(second);
  const children = [launch('A'), launch('B')];
  try {
    await Promise.all(children.map(child => child.frontier));
    assert.equal(children[0].identity !== children[1].identity, true);
    assert.equal(first.workerId !== second.workerId, true);
    children.forEach(child => child.release());
    const results = await Promise.all(children.map(child => child.done));
    assertResult(results[0], 'A');
    assertResult(results[1], 'B');
    admission.complete(first);
    admission.complete(second);
  } finally {
    await cleanup(children);
  }
});

test('same-payer admission is refused during verify and reusable after exact completion', async () => {
  const admission = new OfflinePayerWorkerAdmission({ lane: LANES.FACILITATOR, workerIds: ['worker-a'] });
  const first = admission.admit(request(payer('A'), 'held-operation'));
  admission.markDispatched(first);
  const child = launch('A');
  const refused = request(payer('A'), 'refused-then-admitted');
  try {
    await child.frontier;
    assert.throws(() => admission.admit(refused), error =>
      error instanceof PayerWorkerAdmissionError && error.code === CODES.PAYER_BUSY);
    child.release();
    assertResult(await child.done, 'A');
    admission.complete(first);
    const admitted = admission.admit(refused);
    assert.equal(admitted.workerId === first.workerId, true);
    assert.equal(admitted.sequence, first.sequence + 1);
    admission.releaseUndispatched(admitted);
  } finally {
    await cleanup([child]);
  }
});
