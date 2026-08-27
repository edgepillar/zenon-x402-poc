import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { runServerLifecycle } from '../src/server-cli.js';

const BUYER_CLI = fileURLToPath(new URL('../src/buyer-cli.js', import.meta.url));
const SERVER_CLI = fileURLToPath(new URL('../src/server-cli.js', import.meta.url));
const OUTPUT_LIMIT = 8 * 1024;
const CHILD_TIMEOUT_MS = 5_000;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function lifecycleOutcome(lifecycle) {
  return lifecycle.then(() => 'resolved', () => 'rejected');
}

function assertLifecycleListenersRemoved(signalTarget, server) {
  assert.equal(signalTarget.listenerCount('SIGINT'), 0,
    'SIGINT listener must be removed after lifecycle completion');
  assert.equal(signalTarget.listenerCount('SIGTERM'), 0,
    'SIGTERM listener must be removed after lifecycle completion');
  assert.equal(server.listenerCount('error'), 0,
    'server error listener must be removed after lifecycle completion');
  assert.equal(server.listenerCount('close'), 0,
    'server close listener must be removed after lifecycle completion');
}

async function withEmptyCwd(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'x402-cli-output-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runChild(script, args, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let helperFailure = null;

    const stopFor = reason => {
      if (helperFailure !== null) return;
      helperFailure = reason;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => stopFor('child process timed out'), CHILD_TIMEOUT_MS);

    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > OUTPUT_LIMIT) return stopFor('child stdout exceeded limit');
      stdout.push(chunk);
    });
    child.stderr.on('data', chunk => {
      stderrBytes += chunk.length;
      if (stderrBytes > OUTPUT_LIMIT) return stopFor('child stderr exceeded limit');
      stderr.push(chunk);
    });
    child.once('error', () => {
      clearTimeout(timer);
      reject(new Error('child process failed to start'));
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (helperFailure !== null) return reject(new Error(helperFailure));
      resolve({
        code,
        signal,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    });
  });
}

function assertFixedFailure(result, expectedStderr, role) {
  assert.equal(result.signal === null, true, `${role} failure must not be signal-derived`);
  assert.equal(Number.isInteger(result.code) && result.code !== 0, true,
    `${role} failure must use a nonzero exit`);
  assert.equal(result.stdout.length === 0, true, `${role} failure stdout must be empty`);
  assert.equal(result.stderr.equals(Buffer.from(expectedStderr, 'utf8')), true,
    `${role} failure stderr must be fixed`);
}

test('buyer CLI emits one fixed failure line without diagnostics',
  { timeout: 10_000 }, async () => {
    await withEmptyCwd(async cwd => {
      const result = await runChild(BUYER_CLI, ['not-a-valid-url'], {
        cwd,
        env: { PAYMENT_MODE: 'mock' },
      });
      assertFixedFailure(result, 'Buyer CLI failed.\n', 'buyer CLI');
    });
  });

test('server CLI emits one fixed failure line without diagnostics',
  { timeout: 10_000 }, async () => {
    await withEmptyCwd(async cwd => {
      const result = await runChild(SERVER_CLI, [], {
        cwd,
        env: { PAYMENT_MODE: 'mock', PORT: '-1' },
      });
      assertFixedFailure(result, 'Server CLI failed.\n', 'server CLI');
    });
  });

test('server lifecycle closes cleanly for SIGINT and SIGTERM',
  { timeout: 3_000 }, async () => {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const signalTarget = new EventEmitter();
    const server = new EventEmitter();
    const started = deferred();
    let closeCalls = 0;
    let startupOutputCalls = 0;
    const app = {
      server,
      async listen() {
        return { url: 'http://127.0.0.1:1' };
      },
      async close() {
        closeCalls += 1;
      },
    };
    const lifecycle = runServerLifecycle({
      app,
      signalTarget,
      onListening() {
        startupOutputCalls += 1;
        started.resolve();
      },
    });

    await started.promise;
    signalTarget.emit(signal);
    await lifecycle;

    assert.equal(closeCalls, 1, 'successful signal shutdown must close exactly once');
    assert.equal(startupOutputCalls, 1, 'successful startup output hook must run exactly once');
    assertLifecycleListenersRemoved(signalTarget, server);
  }
  });

test('server lifecycle defers startup signal shutdown and suppresses startup output',
  { timeout: 3_000 }, async () => {
  const signalTarget = new EventEmitter();
  const server = new EventEmitter();
  const listenResult = deferred();
  let closeCalls = 0;
  let startupOutputCalls = 0;
  const app = {
    server,
    listen() {
      return listenResult.promise;
    },
    async close() {
      closeCalls += 1;
    },
  };
  const lifecycle = runServerLifecycle({
    app,
    signalTarget,
    onListening() {
      startupOutputCalls += 1;
    },
  });

  signalTarget.emit('SIGTERM');
  signalTarget.emit('SIGINT');
  assert.equal(closeCalls, 0, 'startup signal must not close before listen succeeds');
  assert.equal(startupOutputCalls, 0, 'startup signal must suppress startup output');
  listenResult.resolve({ url: 'http://127.0.0.1:1' });
  await lifecycle;

  assert.equal(closeCalls, 1, 'startup signal must close exactly once after listen succeeds');
  assert.equal(startupOutputCalls, 0, 'startup signal must not release startup output');
  assertLifecycleListenersRemoved(signalTarget, server);
  });

test('server lifecycle ignores duplicate signals while one close is pending',
  { timeout: 3_000 }, async () => {
  const signalTarget = new EventEmitter();
  const server = new EventEmitter();
  const started = deferred();
  const closeResult = deferred();
  let closeCalls = 0;
  const app = {
    server,
    async listen() {
      return { url: 'http://127.0.0.1:1' };
    },
    close() {
      closeCalls += 1;
      return closeResult.promise;
    },
  };
  const lifecycle = runServerLifecycle({
    app,
    signalTarget,
    onListening() {
      started.resolve();
    },
  });

  await started.promise;
  signalTarget.emit('SIGINT');
  signalTarget.emit('SIGTERM');
  signalTarget.emit('SIGINT');
  await Promise.resolve();
  assert.equal(closeCalls, 1, 'duplicate signals must share one close operation');
  closeResult.resolve();
  await lifecycle;

  assert.equal(closeCalls, 1, 'completed duplicate-signal shutdown must close once');
  assertLifecycleListenersRemoved(signalTarget, server);
  });

test('server lifecycle observes close rejection through its guarded failure path',
  { timeout: 3_000 }, async () => {
  const signalTarget = new EventEmitter();
  const server = new EventEmitter();
  const started = deferred();
  let closeCalls = 0;
  const app = {
    server,
    async listen() {
      return { url: 'http://127.0.0.1:1' };
    },
    async close() {
      closeCalls += 1;
      throw new Error();
    },
  };
  const outcome = lifecycleOutcome(runServerLifecycle({
    app,
    signalTarget,
    onListening() {
      started.resolve();
    },
  }));

  await started.promise;
  signalTarget.emit('SIGTERM');
  assert.equal(await outcome, 'rejected', 'close rejection must reach guarded failure');
  assert.equal(closeCalls, 1, 'rejected close must still be invoked exactly once');
  assertLifecycleListenersRemoved(signalTarget, server);
  });

test('server lifecycle observes a runtime-error and signal race without a second close',
  { timeout: 3_000 }, async () => {
  const signalTarget = new EventEmitter();
  const server = new EventEmitter();
  const started = deferred();
  const closeResult = deferred();
  let closeCalls = 0;
  const app = {
    server,
    async listen() {
      return { url: 'http://127.0.0.1:1' };
    },
    close() {
      closeCalls += 1;
      return closeResult.promise;
    },
  };
  const outcome = lifecycleOutcome(runServerLifecycle({
    app,
    signalTarget,
    onListening() {
      started.resolve();
    },
  }));

  await started.promise;
  signalTarget.emit('SIGINT');
  server.emit('error', new Error());
  assert.equal(await outcome, 'rejected', 'runtime error must reach guarded failure');
  assert.equal(closeCalls, 1, 'runtime-error race must retain the first close operation');
  closeResult.resolve();
  await Promise.resolve();

    assert.equal(closeCalls, 1, 'runtime-error race must not start another close');
    assertLifecycleListenersRemoved(signalTarget, server);
  });

test('server lifecycle reports terminal failure before listener cleanup',
  { timeout: 3_000 }, async () => {
    const signalTarget = new EventEmitter();
    const server = new EventEmitter();
    const started = deferred();
    let closeCalls = 0;
    let terminalFailureCalls = 0;
    const app = {
      server,
      async listen() {
        return { url: 'http://127.0.0.1:1' };
      },
      async close() {
        closeCalls += 1;
      },
    };
    const outcome = lifecycleOutcome(runServerLifecycle({
      app,
      signalTarget,
      onListening() {
        started.resolve();
      },
      onTerminalFailure(...diagnostics) {
        terminalFailureCalls += 1;
        assert.equal(diagnostics.length, 0,
          'terminal failure callback must receive no diagnostics');
        assert.equal(server.listenerCount('error'), 1,
          'terminal failure callback must run before error listener cleanup');
        server.emit('error', new Error());
      },
    }));

    await started.promise;
    server.emit('error', new Error());
    assert.equal(terminalFailureCalls, 1,
      'terminal failure callback must run synchronously exactly once');
    assert.equal(await outcome, 'rejected', 'terminal server error must reject lifecycle');
    assert.equal(closeCalls, 0, 'terminal server error must not invoke app close');
    assertLifecycleListenersRemoved(signalTarget, server);
  });

test('server lifecycle rejects an unexpected post-listen close',
  { timeout: 3_000 }, async () => {
    const signalTarget = new EventEmitter();
    const server = new EventEmitter();
    const started = deferred();
    let closeCalls = 0;
    const app = {
      server,
      async listen() {
        return { url: 'http://127.0.0.1:1' };
      },
      async close() {
        closeCalls += 1;
      },
    };
    const outcome = lifecycleOutcome(runServerLifecycle({
      app,
      signalTarget,
      onListening() {
        started.resolve();
      },
    }));

    await started.promise;
    assert.equal(server.listenerCount('close'), 1,
      'server close listener must observe unexpected closure');
    server.emit('close');

    assert.equal(await outcome, 'rejected', 'unexpected server close must reject lifecycle');
    assert.equal(closeCalls, 0, 'unexpected server close must not invoke app close');
    assertLifecycleListenersRemoved(signalTarget, server);
  });

test('server lifecycle ignores close event owned by signal-driven close operation',
  { timeout: 3_000 }, async () => {
    const signalTarget = new EventEmitter();
    const server = new EventEmitter();
    const started = deferred();
    const closeResult = deferred();
    let closeCalls = 0;
    const app = {
      server,
      async listen() {
        return { url: 'http://127.0.0.1:1' };
      },
      close() {
        closeCalls += 1;
        server.emit('close');
        return closeResult.promise;
      },
    };
    const lifecycle = runServerLifecycle({
      app,
      signalTarget,
      onListening() {
        started.resolve();
      },
    });

    await started.promise;
    signalTarget.emit('SIGINT');
    await Promise.resolve();
    assert.equal(closeCalls, 1, 'signal shutdown must start exactly one close operation');
    closeResult.resolve();
    await lifecycle;

    assert.equal(closeCalls, 1, 'expected close event must not start another close operation');
    assertLifecycleListenersRemoved(signalTarget, server);
  });

test('server lifecycle cleans up after listen rejection',
  { timeout: 3_000 }, async () => {
    const signalTarget = new EventEmitter();
    const server = new EventEmitter();
    let closeCalls = 0;
    let startupOutputCalls = 0;
    const app = {
      server,
      async listen() {
        throw new Error();
      },
      async close() {
        closeCalls += 1;
      },
    };
    const outcome = lifecycleOutcome(runServerLifecycle({
      app,
      signalTarget,
      onListening() {
        startupOutputCalls += 1;
      },
    }));

    assert.equal(await outcome, 'rejected', 'listen rejection must reject lifecycle');
    assert.equal(startupOutputCalls, 0, 'listen rejection must not release startup output');
    assert.equal(closeCalls, 0, 'listen rejection must not invoke app close');
    assertLifecycleListenersRemoved(signalTarget, server);
  });
