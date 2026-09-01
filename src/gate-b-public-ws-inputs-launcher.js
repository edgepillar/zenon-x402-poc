import { spawn } from 'node:child_process';
import { dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  frameGateBPublicWsInputsBootstrap,
  GATE_B_PUBLIC_WS_INPUT_OPERATIONS,
  GATE_B_PUBLIC_WS_INPUT_STATUS_LINES,
} from './gate-b-public-ws-inputs-schema.js';

const ERROR_CODE = 'gate_b_public_ws_inputs_launch_failed';
const CLI_MODULE = fileURLToPath(new URL('./gate-b-public-ws-inputs-cli.js', import.meta.url));
const OUTPUT_MAX_BYTES = 128;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 60_000;
const REAP_FORCE_MS = 250;
const REAP_ABANDON_MS = 1250;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

export class GateBPublicWsInputsLaunchError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBPublicWsInputsLaunchError';
    this.code = ERROR_CODE;
    this.stack = `GateBPublicWsInputsLaunchError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBPublicWsInputsLaunchError();
}

function exactInjections(value) {
  const output = {
    spawnProcess: spawn,
    executable: process.execPath,
    cliModule: CLI_MODULE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  if (value === undefined) return output;
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const allowed = ['spawnProcess', 'executable', 'cliModule', 'timeoutMs'];
  const keys = REFLECT_OWN_KEYS(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = typeof key === 'string'
      ? GET_OWN_PROPERTY_DESCRIPTOR(value, key)
      : undefined;
    if (!allowed.includes(key) || !descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    output[key] = descriptor.value;
  }
  if (typeof output.spawnProcess !== 'function' ||
      typeof output.executable !== 'string' || !isAbsolute(output.executable) ||
      typeof output.cliModule !== 'string' || !isAbsolute(output.cliModule) ||
      !Number.isSafeInteger(output.timeoutMs) || output.timeoutMs < 1 ||
      output.timeoutMs > MAX_TIMEOUT_MS) fail();
  return output;
}

function appendBounded(chunks, chunk, state) {
  if (!Buffer.isBuffer(chunk)) fail();
  state.total += chunk.length;
  if (!Number.isSafeInteger(state.total) || state.total > OUTPUT_MAX_BYTES) {
    chunk.fill(0);
    fail();
  }
  chunks.push(chunk);
}

function exactOutput(chunks, total, expected) {
  const bytes = Buffer.concat(chunks, total);
  const comparison = Buffer.from(expected, 'utf8');
  try {
    return bytes.equals(comparison);
  } finally {
    bytes.fill(0);
    comparison.fill(0);
  }
}

async function reap(child, alreadyClosed) {
  if (alreadyClosed || !child || typeof child.once !== 'function') return;
  await new Promise(resolveReap => {
    let finished = false;
    let forceTimer;
    let abandonTimer;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(forceTimer);
      clearTimeout(abandonTimer);
      resolveReap();
    };
    child.once('close', done);
    forceTimer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
    }, REAP_FORCE_MS);
    abandonTimer = setTimeout(done, REAP_ABANDON_MS);
    try { child.kill('SIGTERM'); } catch {}
  });
}

function successStatus(operation) {
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT) {
    return 'endpoint-provisioned';
  }
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PREPARE) return 'prepared';
  if (operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.AUTHORIZE) return 'authorized';
  fail();
}

export async function launchGateBPublicWsInputs(bootstrap, injected) {
  const stdoutChunks = [];
  const stderrChunks = [];
  const stdoutState = { total: 0 };
  const stderrState = { total: 0 };
  let child;
  let childClosed = false;
  let frame;
  try {
    const dependencies = exactInjections(injected);
    frame = frameGateBPublicWsInputsBootstrap(bootstrap);
    const operation = bootstrap.operation;
    const expectedLine = GATE_B_PUBLIC_WS_INPUT_STATUS_LINES[operation];
    if (typeof expectedLine !== 'string') fail();

    child = Reflect.apply(dependencies.spawnProcess, undefined, [
      dependencies.executable,
      [dependencies.cliModule, operation],
      {
        cwd: dirname(dependencies.cliModule),
        env: {},
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    ]);
    if (!child || typeof child.on !== 'function' || typeof child.kill !== 'function' ||
        !child.stdout || typeof child.stdout.on !== 'function' ||
        !child.stderr || typeof child.stderr.on !== 'function' ||
        !ARRAY_IS_ARRAY(child.stdio) || !child.stdio[3] ||
        typeof child.stdio[3].end !== 'function') fail();

    const result = await new Promise((resolveResult, rejectResult) => {
      let settled = false;
      let exited = false;
      let exitCode;
      let exitSignal;
      let frameWritten = false;
      const timer = setTimeout(() => finish(false), dependencies.timeoutMs);
      const finish = success => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (success) resolveResult(true);
        else rejectResult(new GateBPublicWsInputsLaunchError());
      };
      child.on('error', () => finish(false));
      child.stdout.on('data', chunk => {
        try { appendBounded(stdoutChunks, chunk, stdoutState); } catch { finish(false); }
      });
      child.stderr.on('data', chunk => {
        try { appendBounded(stderrChunks, chunk, stderrState); } catch { finish(false); }
      });
      child.on('exit', (code, signal) => {
        if (exited) return finish(false);
        exited = true;
        exitCode = code;
        exitSignal = signal;
      });
      child.on('close', (code, signal) => {
        childClosed = true;
        if (!exited || code !== exitCode || signal !== exitSignal || !frameWritten ||
            code !== 0 || signal !== null || stderrState.total !== 0 ||
            !exactOutput(stdoutChunks, stdoutState.total, expectedLine)) return finish(false);
        finish(true);
      });
      child.stdio[3].once('error', () => finish(false));
      child.stdio[3].end(frame, error => {
        frameWritten = error === undefined || error === null;
        if (!frameWritten) finish(false);
      });
    });
    if (result !== true) fail();
    return Object.freeze({ status: successStatus(operation) });
  } catch {
    await reap(child, childClosed);
    fail();
  } finally {
    if (Buffer.isBuffer(frame)) frame.fill(0);
    for (let index = 0; index < stdoutChunks.length; index += 1) stdoutChunks[index].fill(0);
    for (let index = 0; index < stderrChunks.length; index += 1) stderrChunks[index].fill(0);
  }
}
