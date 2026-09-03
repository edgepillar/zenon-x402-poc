import { fork } from 'node:child_process';
import { userInfo } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

import { selectGateBBuyerWalletWorkspace } from './gate-b-buyer-wallet-selector.js';

const IPC_VERSION = 1;
const REQUEST_ID = 1;
const BOOTSTRAP_MAX_BYTES = 8192;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;
const REAP_FORCE_MS = 250;
const REAP_ABANDON_MS = 1250;
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
  try {
    return selectGateBBuyerWalletWorkspace(workspaceRoot, supportRoot).walletWorkspaceRoot;
  } catch {
    fail();
  }
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

function removeOwnedListener(emitter, event, listener) {
  try {
    if (emitter && typeof emitter.removeListener === 'function') {
      emitter.removeListener(event, listener);
    }
  } catch {}
}

function releaseAbandonedChildHandles(child) {
  let channel;
  let disconnected = false;
  try { channel = child?.channel; } catch {}
  try {
    if (child?.connected === true && typeof child.disconnect === 'function') {
      child.disconnect();
      disconnected = true;
    }
  } catch {}
  if (!disconnected) {
    try {
      if (channel && typeof channel.close === 'function') channel.close();
    } catch {}
  }
  try {
    if (channel && typeof channel.unref === 'function') channel.unref();
  } catch {}
  try {
    if (typeof child?.unref === 'function') child.unref();
  } catch {}
}

async function reap(child, alreadyClosed) {
  if (alreadyClosed || !child) return;
  if (typeof child.on !== 'function' || typeof child.once !== 'function' ||
      typeof child.kill !== 'function') {
    releaseAbandonedChildHandles(child);
    return;
  }
  await new Promise(resolveReap => {
    let finished = false;
    let closeListenerAttached = false;
    let errorListenerAttached = false;
    let forceTimer;
    let abandonTimer;
    const onClose = () => done(false);
    const onError = () => {};
    const done = abandoned => {
      if (finished) return;
      finished = true;
      clearTimeout(forceTimer);
      clearTimeout(abandonTimer);
      forceTimer = undefined;
      abandonTimer = undefined;
      if (abandoned) releaseAbandonedChildHandles(child);
      if (closeListenerAttached) removeOwnedListener(child, 'close', onClose);
      if (errorListenerAttached) removeOwnedListener(child, 'error', onError);
      resolveReap();
    };
    try {
      errorListenerAttached = true;
      child.on('error', onError);
      closeListenerAttached = true;
      child.once('close', onClose);
    } catch {
      done(true);
      return;
    }
    if (finished) return;
    forceTimer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
    }, REAP_FORCE_MS);
    abandonTimer = setTimeout(() => done(true), REAP_ABANDON_MS);
    try { child.kill('SIGTERM'); } catch {}
  });
}

export async function superviseGateBBuyerWalletChild(workspaceRoot, injected) {
  let child;
  let childClosed = false;
  let bootstrapBytes;
  let clearTerminalListeners = () => {};
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
      let acceptingEvents = true;
      let settled = false;
      let terminalType;
      let timer;
      const onError = () => {
        if (acceptingEvents) finish(false);
      };
      const onDisconnect = () => {
        if (acceptingEvents && phase !== 'close') finish(false);
      };
      const onMessage = message => {
        if (!acceptingEvents) return;
        try {
          if (phase === 'ready') {
            exactMessage(message, 'READY');
            if (!acceptingEvents) return;
            phase = 'terminal';
            const sendMessage = child.send;
            if (typeof sendMessage !== 'function') return finish(false);
            if (!acceptingEvents) return;
            const accepted = Reflect.apply(sendMessage, child, [
              {
                ipcVersion: IPC_VERSION,
                requestId: REQUEST_ID,
                type: 'CREATE',
              },
              error => {
                if (acceptingEvents && error) finish(false);
              },
            ]);
            if (!acceptingEvents) return;
            if (accepted === false && child.connected === false) finish(false);
            return;
          }
          if (phase === 'terminal') {
            exactMessage(message, 'CREATED');
            if (!acceptingEvents) return;
            terminalType = message.type;
            phase = 'close';
            return;
          }
          finish(false);
        } catch {
          finish(false);
        }
      };
      const onExit = (code, signal) => {
        if (!acceptingEvents) return;
        if (code !== 0 || signal !== null || phase !== 'close') finish(false);
      };
      const onClose = (code, signal) => {
        if (!acceptingEvents) return;
        childClosed = true;
        if (closeSeen) return finish(false);
        closeSeen = true;
        if (phase !== 'close' || terminalType !== 'CREATED' ||
            code !== 0 || signal !== null) return finish(false);
        finish(true);
      };
      const onBootstrapError = () => {
        if (acceptingEvents) finish(false);
      };
      clearTerminalListeners = () => {
        removeOwnedListener(child, 'error', onError);
        removeOwnedListener(child, 'disconnect', onDisconnect);
        removeOwnedListener(child, 'message', onMessage);
        removeOwnedListener(child, 'exit', onExit);
        removeOwnedListener(child, 'close', onClose);
        removeOwnedListener(bootstrap, 'error', onBootstrapError);
      };
      const finish = success => {
        if (settled || !acceptingEvents) return;
        acceptingEvents = false;
        settled = true;
        clearTimeout(timer);
        timer = undefined;
        clearTerminalListeners();
        if (success) resolveTerminal(terminalType);
        else rejectTerminal(new GateBBuyerWalletSupervisorError());
      };
      try {
        timer = setTimeout(() => finish(false), dependencies.timeoutMs);
        child.on('error', onError);
        child.on('disconnect', onDisconnect);
        child.on('message', onMessage);
        child.on('exit', onExit);
        child.on('close', onClose);
        bootstrap.once('error', onBootstrapError);
        bootstrap.end(bootstrapBytes, error => {
          if (Buffer.isBuffer(bootstrapBytes)) bootstrapBytes.fill(0);
          bootstrapBytes = undefined;
          if (acceptingEvents && error) finish(false);
        });
      } catch {
        finish(false);
      }
    });
    if (terminal !== 'CREATED') fail();
    clearTerminalListeners();
    destroyBootstrap(child);
    return { status: 'created' };
  } catch {
    if (Buffer.isBuffer(bootstrapBytes)) bootstrapBytes.fill(0);
    destroyBootstrap(child);
    await reap(child, childClosed);
    clearTerminalListeners();
    fail();
  }
}
