import { fork } from 'node:child_process';
import { userInfo } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

const IPC_VERSION = 1;
const REQUEST_ID = 1;
const BOOTSTRAP_MAX_BYTES = 8192;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;
const REAP_FORCE_MS = 250;
const REAP_ABANDON_MS = 1250;
const WORKSPACE_NAME = 'zenon-x402-gate-b-wallet';
const CHILD_MODULE = fileURLToPath(new URL('./gate-b-buyer-wallet-child.js', import.meta.url));
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

class GateBBuyerWalletSupervisorError extends Error {
  constructor() {
    super('gate_b_buyer_wallet_supervisor_failed');
    this.name = 'GateBBuyerWalletSupervisorError';
    this.code = 'gate_b_buyer_wallet_supervisor_failed';
    this.stack = 'GateBBuyerWalletSupervisorError: gate_b_buyer_wallet_supervisor_failed';
  }
}

function fail() {
  throw new GateBBuyerWalletSupervisorError();
}

function exactAbsolutePath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4096 ||
      value.includes('\0') || !isAbsolute(value) || resolve(value) !== value) fail();
  return value;
}

function defaultApplicationSupportRoot() {
  try {
    const value = userInfo();
    if (!value || typeof value !== 'object') fail();
    return join(exactAbsolutePath(value.homedir), 'Library', 'Application Support');
  } catch {
    fail();
  }
}

function exactMessage(message, expectedType) {
  if (!message || typeof message !== 'object' || IS_PROXY(message) ||
      ARRAY_IS_ARRAY(message) || GET_PROTOTYPE_OF(message) !== OBJECT_PROTOTYPE) fail();
  const fields = ['ipcVersion', 'requestId', 'type'];
  const keys = REFLECT_OWN_KEYS(message);
  if (keys.length !== fields.length) fail();
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(message, fields[index]);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
  }
  if (message.ipcVersion !== IPC_VERSION || message.requestId !== REQUEST_ID ||
      message.type !== expectedType) fail();
}

function captureInjections(injected) {
  const output = {
    applicationSupportRoot: defaultApplicationSupportRoot,
    forkProcess: fork,
    childModule: CHILD_MODULE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  if (injected === undefined) return output;
  if (!injected || typeof injected !== 'object' || IS_PROXY(injected) ||
      ARRAY_IS_ARRAY(injected) || GET_PROTOTYPE_OF(injected) !== OBJECT_PROTOTYPE) fail();
  const allowed = Object.keys(output);
  const keys = REFLECT_OWN_KEYS(injected);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = typeof key === 'string'
      ? GET_OWN_PROPERTY_DESCRIPTOR(injected, key)
      : undefined;
    if (!allowed.includes(key) || !descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    output[key] = descriptor.value;
  }
  if (typeof output.applicationSupportRoot !== 'function' ||
      typeof output.forkProcess !== 'function' ||
      typeof output.childModule !== 'string' ||
      !isAbsolute(output.childModule) || resolve(output.childModule) !== output.childModule ||
      !Number.isSafeInteger(output.timeoutMs) || output.timeoutMs < 1 ||
      output.timeoutMs > MAX_TIMEOUT_MS) fail();
  return output;
}

function snapshotWorkspaceRoot(value, dependencies) {
  const workspaceRoot = exactAbsolutePath(value);
  const supportRoot = exactAbsolutePath(Reflect.apply(
    dependencies.applicationSupportRoot,
    undefined,
    [],
  ));
  if (workspaceRoot !== join(supportRoot, WORKSPACE_NAME)) fail();
  return workspaceRoot;
}

function processBootstrap(child) {
  if (!child || typeof child !== 'object' || IS_PROXY(child) ||
      typeof child.on !== 'function' || typeof child.once !== 'function' ||
      typeof child.send !== 'function' || typeof child.kill !== 'function' ||
      child.connected !== true || !ARRAY_IS_ARRAY(child.stdio) || child.stdio.length !== 5) fail();
  for (let index = 0; index < 4; index += 1) {
    if (child.stdio[index] !== null) fail();
  }
  const stream = child.stdio[4];
  if (!stream || typeof stream !== 'object' ||
      typeof stream.once !== 'function' || typeof stream.end !== 'function' ||
      typeof stream.destroy !== 'function') fail();
  return stream;
}

function destroyBootstrap(child) {
  try {
    const stream = child?.stdio?.[4];
    if (stream && typeof stream.destroy === 'function' && stream.destroyed !== true) {
      stream.destroy();
    }
  } catch {}
}

async function reap(child, alreadyClosed) {
  if (alreadyClosed || !child || typeof child.once !== 'function' ||
      typeof child.kill !== 'function') return;
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
    try { child.once('close', done); } catch { return done(); }
    forceTimer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
    }, REAP_FORCE_MS);
    abandonTimer = setTimeout(done, REAP_ABANDON_MS);
    try { child.kill('SIGTERM'); } catch {}
  });
}

export async function superviseGateBBuyerWalletChild(workspaceRoot, injected) {
  let child;
  let childClosed = false;
  let bootstrapBytes;
  try {
    const dependencies = captureInjections(injected);
    const snapshot = snapshotWorkspaceRoot(workspaceRoot, dependencies);
    bootstrapBytes = Buffer.from(JSON.stringify({ workspaceRoot: snapshot }), 'utf8');
    if (bootstrapBytes.length < 1 || bootstrapBytes.length > BOOTSTRAP_MAX_BYTES) fail();

    child = Reflect.apply(dependencies.forkProcess, undefined, [
      dependencies.childModule,
      [],
      {
        cwd: snapshot,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc', 'pipe'],
        env: {},
        execArgv: [],
        shell: false,
      },
    ]);
    const bootstrap = processBootstrap(child);

    const terminal = await new Promise((resolveTerminal, rejectTerminal) => {
      let phase = 'ready';
      let closeSeen = false;
      let settled = false;
      let terminalType;
      const finish = success => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (success) resolveTerminal(terminalType);
        else rejectTerminal(new GateBBuyerWalletSupervisorError());
      };
      const timer = setTimeout(() => finish(false), dependencies.timeoutMs);
      child.on('error', () => finish(false));
      child.on('disconnect', () => {
        if (phase !== 'close') finish(false);
      });
      child.on('message', message => {
        try {
          if (phase === 'ready') {
            exactMessage(message, 'READY');
            phase = 'terminal';
            const accepted = child.send({
              ipcVersion: IPC_VERSION,
              requestId: REQUEST_ID,
              type: 'CREATE',
            }, error => {
              if (error) finish(false);
            });
            if (accepted === false && child.connected === false) finish(false);
            return;
          }
          if (phase === 'terminal') {
            exactMessage(message, 'CREATED');
            terminalType = message.type;
            phase = 'close';
            return;
          }
          finish(false);
        } catch {
          finish(false);
        }
      });
      child.on('exit', (code, signal) => {
        if (code !== 0 || signal !== null || phase !== 'close') finish(false);
      });
      child.on('close', (code, signal) => {
        childClosed = true;
        if (closeSeen) return finish(false);
        closeSeen = true;
        if (phase !== 'close' || terminalType !== 'CREATED' ||
            code !== 0 || signal !== null) return finish(false);
        finish(true);
      });
      bootstrap.once('error', () => finish(false));
      bootstrap.end(bootstrapBytes, error => {
        bootstrapBytes.fill(0);
        bootstrapBytes = undefined;
        if (error) finish(false);
      });
    });
    if (terminal !== 'CREATED') fail();
    return { status: 'created' };
  } catch {
    if (Buffer.isBuffer(bootstrapBytes)) bootstrapBytes.fill(0);
    destroyBootstrap(child);
    await reap(child, childClosed);
    fail();
  }
}
