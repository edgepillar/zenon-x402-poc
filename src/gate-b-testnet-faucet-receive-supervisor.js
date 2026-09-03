import { fork } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  GATE_B_BUYER_WALLET_LEGACY_WORKSPACE_NAME,
  selectGateBBuyerWalletWorkspace,
} from './gate-b-buyer-wallet-selector.js';
import {
  GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES,
  GATE_B_TESTNET_FAUCET_RECEIVE_LIMITS,
  parseGateBTestnetFaucetReceiveFrame,
} from './gate-b-testnet-faucet-receive-schema.js';

const ERROR_CODE = 'gate_b_testnet_faucet_receive_supervisor_failed';
const BOOTSTRAP_FD = 3;
const CHILD_BOOTSTRAP_FD = 4;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const MAX_TIMEOUT_MS = 15 * 60_000;
const TERM_MS = 1000;
const KILL_MS = 5000;
const CHILD_MODULE = fileURLToPath(new URL(
  './gate-b-testnet-faucet-receive-child.js',
  import.meta.url,
));
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

export class GateBTestnetFaucetReceiveSupervisorError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBTestnetFaucetReceiveSupervisorError';
    this.code = ERROR_CODE;
    this.stack = undefined;
  }
}

function fail() {
  throw new GateBTestnetFaucetReceiveSupervisorError();
}

function defaultApplicationSupportRoot() {
  try {
    const value = userInfo();
    if (!value || typeof value !== 'object' || typeof value.homedir !== 'string' ||
        !isAbsolute(value.homedir)) fail();
    return join(value.homedir, 'Library', 'Application Support');
  } catch {
    fail();
  }
}

function exactInjections(value) {
  const output = Object.create(null);
  Object.assign(output, {
    applicationSupportRoot: defaultApplicationSupportRoot,
    childModule: CHILD_MODULE,
    forkProcess: fork,
    getuid: process.getuid?.bind(process),
    lstatPath: lstat,
    platform: process.platform,
    readBootstrapFrame: () => readGateBTestnetFaucetReceiveFrameFromFd(),
    realpathPath: realpath,
    killMs: KILL_MS,
    termMs: TERM_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
  if (value === undefined) return output;
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const allowed = REFLECT_OWN_KEYS(output);
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
  if (typeof output.applicationSupportRoot !== 'function' ||
      typeof output.forkProcess !== 'function' || typeof output.readBootstrapFrame !== 'function' ||
      typeof output.realpathPath !== 'function' || typeof output.lstatPath !== 'function' ||
      typeof output.getuid !== 'function' || output.platform !== 'darwin' ||
      typeof output.childModule !== 'string' || !isAbsolute(output.childModule) ||
      resolve(output.childModule) !== output.childModule ||
      !Number.isSafeInteger(output.timeoutMs) || output.timeoutMs < 1000 ||
      output.timeoutMs > MAX_TIMEOUT_MS || !Number.isSafeInteger(output.termMs) ||
      output.termMs < 1 || output.termMs > TERM_MS || !Number.isSafeInteger(output.killMs) ||
      output.killMs <= output.termMs || output.killMs > KILL_MS) fail();
  return output;
}

async function canonicalWalletWorkspace(workspaceRoot, requireGenerated, dependencies) {
  const supportRoot = REFLECT_APPLY(dependencies.applicationSupportRoot, undefined, []);
  if (typeof supportRoot !== 'string' || !isAbsolute(supportRoot) ||
      resolve(supportRoot) !== supportRoot) fail();
  const requestedRoot = workspaceRoot === undefined
    ? join(supportRoot, GATE_B_BUYER_WALLET_LEGACY_WORKSPACE_NAME)
    : workspaceRoot;
  let selection;
  try {
    selection = selectGateBBuyerWalletWorkspace(
      requestedRoot,
      supportRoot,
    );
  } catch {
    fail();
  }
  if (requireGenerated && selection.generationToken === null) fail();
  const root = selection.walletWorkspaceRoot;
  const [canonicalSupport, canonicalRoot, stat] = await Promise.all([
    REFLECT_APPLY(dependencies.realpathPath, undefined, [supportRoot]),
    REFLECT_APPLY(dependencies.realpathPath, undefined, [root]),
    REFLECT_APPLY(dependencies.lstatPath, undefined, [root, { bigint: true }]),
  ]);
  const uid = REFLECT_APPLY(dependencies.getuid, undefined, []);
  if (canonicalSupport !== supportRoot || canonicalRoot !== root ||
      dirname(root) !== supportRoot || !Number.isSafeInteger(uid) || uid < 0 ||
      !stat || typeof stat.isDirectory !== 'function' || !stat.isDirectory() ||
      stat.isSymbolicLink() || stat.uid !== BigInt(uid) || (stat.mode & 0o777n) !== 0o700n) fail();
  return root;
}

export async function readGateBTestnetFaucetReceiveFrameFromFd(fd = BOOTSTRAP_FD) {
  const chunks = [];
  let total = 0;
  try {
    if (!Number.isSafeInteger(fd) || fd < 0) fail();
    const stream = createReadStream(null, { fd, autoClose: true, highWaterMark: 1024 });
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk)) fail();
      total += chunk.length;
      if (!Number.isSafeInteger(total) ||
          total > GATE_B_TESTNET_FAUCET_RECEIVE_LIMITS.frameBytes) fail();
      chunks.push(chunk);
    }
    if (total < 5) fail();
    return Buffer.concat(chunks, total);
  } catch {
    fail();
  } finally {
    for (let index = 0; index < chunks.length; index += 1) chunks[index].fill(0);
  }
}

function dataMethod(value, name) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function') ||
      IS_PROXY(value)) fail();
  let current = value;
  while (current !== null) {
    if (IS_PROXY(current)) fail();
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(current, name);
    if (descriptor) {
      if (!HAS_OWN(descriptor, 'value') || typeof descriptor.value !== 'function' ||
          IS_PROXY(descriptor.value)) fail();
      return descriptor.value;
    }
    current = GET_PROTOTYPE_OF(current);
  }
  fail();
}

function optionalDataMethod(value, name) {
  try {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function') ||
        IS_PROXY(value)) return undefined;
    let current = value;
    while (current !== null) {
      if (IS_PROXY(current)) return undefined;
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(current, name);
      if (descriptor) {
        return HAS_OWN(descriptor, 'value') && typeof descriptor.value === 'function' &&
          !IS_PROXY(descriptor.value) ? descriptor.value : undefined;
      }
      current = GET_PROTOTYPE_OF(current);
    }
  } catch {}
  return undefined;
}

function optionalOwnData(value, name) {
  try {
    if (value === null || typeof value !== 'object' || IS_PROXY(value)) return undefined;
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, name);
    return descriptor && HAS_OWN(descriptor, 'value') ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function captureFallback(child) {
  const fallback = {
    bootstrap: undefined,
    bootstrapDestroy: undefined,
    bootstrapUnref: undefined,
    channel: undefined,
    channelClose: undefined,
    channelUnref: undefined,
    child,
    childUnref: optionalDataMethod(child, 'unref'),
    disconnect: optionalDataMethod(child, 'disconnect'),
    kill: optionalDataMethod(child, 'kill'),
    on: optionalDataMethod(child, 'on'),
    removeListener: optionalDataMethod(child, 'removeListener'),
  };
  const channel = optionalOwnData(child, 'channel');
  if (channel !== null && typeof channel === 'object' && !IS_PROXY(channel)) {
    fallback.channel = channel;
    fallback.channelClose = optionalDataMethod(channel, 'close');
    fallback.channelUnref = optionalDataMethod(channel, 'unref');
  }
  const stdio = optionalOwnData(child, 'stdio');
  if (ARRAY_IS_ARRAY(stdio) && !IS_PROXY(stdio) && stdio.length > CHILD_BOOTSTRAP_FD) {
    const bootstrap = optionalOwnData(stdio, String(CHILD_BOOTSTRAP_FD));
    if (bootstrap !== null && typeof bootstrap === 'object' && !IS_PROXY(bootstrap)) {
      fallback.bootstrap = bootstrap;
      fallback.bootstrapDestroy = optionalDataMethod(bootstrap, 'destroy');
      fallback.bootstrapUnref = optionalDataMethod(bootstrap, 'unref');
    }
  }
  return Object.freeze(fallback);
}

function childSnapshot(child) {
  if (child === null || typeof child !== 'object' || IS_PROXY(child)) fail();
  const stdioDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(child, 'stdio');
  const channelDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(child, 'channel');
  if (!stdioDescriptor || !HAS_OWN(stdioDescriptor, 'value') ||
      !channelDescriptor || !HAS_OWN(channelDescriptor, 'value')) fail();
  const stdio = stdioDescriptor.value;
  if (!ARRAY_IS_ARRAY(stdio) || IS_PROXY(stdio) || stdio.length !== 5) fail();
  const bootstrapDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(stdio, String(CHILD_BOOTSTRAP_FD));
  if (!bootstrapDescriptor || !HAS_OWN(bootstrapDescriptor, 'value')) fail();
  const bootstrap = bootstrapDescriptor.value;
  if (!bootstrap || typeof bootstrap !== 'object' || IS_PROXY(bootstrap)) fail();
  return Object.freeze({
    bootstrap,
    bootstrapDestroy: dataMethod(bootstrap, 'destroy'),
    bootstrapEnd: dataMethod(bootstrap, 'end'),
    child,
    disconnect: dataMethod(child, 'disconnect'),
    kill: dataMethod(child, 'kill'),
    on: dataMethod(child, 'on'),
    removeListener: dataMethod(child, 'removeListener'),
    send: dataMethod(child, 'send'),
  });
}

function removeListener(snapshot, emitter, event, listener) {
  try { REFLECT_APPLY(snapshot.removeListener, emitter, [event, listener]); } catch {}
}

function destroyBootstrap(snapshot) {
  if (!snapshot) return;
  try {
    if (snapshot.bootstrapDestroy) {
      REFLECT_APPLY(snapshot.bootstrapDestroy, snapshot.bootstrap, []);
    }
  } catch {}
}

function releaseFallback(snapshot) {
  if (!snapshot) return;
  destroyBootstrap(snapshot);
  try {
    if (snapshot.disconnect) REFLECT_APPLY(snapshot.disconnect, snapshot.child, []);
  } catch {}
  try {
    if (snapshot.channelClose) REFLECT_APPLY(snapshot.channelClose, snapshot.channel, []);
  } catch {}
  try {
    if (snapshot.channelUnref) REFLECT_APPLY(snapshot.channelUnref, snapshot.channel, []);
  } catch {}
  try {
    if (snapshot.bootstrapUnref) {
      REFLECT_APPLY(snapshot.bootstrapUnref, snapshot.bootstrap, []);
    }
  } catch {}
  try {
    if (snapshot.childUnref) REFLECT_APPLY(snapshot.childUnref, snapshot.child, []);
  } catch {}
}

async function terminateAndAwait(snapshot, alreadyClosed, termMs, killMs) {
  if (alreadyClosed) return true;
  return new Promise(resolveClose => {
    let done = false;
    let killTimer;
    let abandonTimer;
    const finish = value => {
      if (done) return;
      done = true;
      clearTimeout(killTimer);
      clearTimeout(abandonTimer);
      removeListener(snapshot, snapshot.child, 'close', onClose);
      resolveClose(value);
    };
    const onClose = () => finish(true);
    if (snapshot.on && snapshot.removeListener) {
      try { REFLECT_APPLY(snapshot.on, snapshot.child, ['close', onClose]); } catch {}
    }
    killTimer = setTimeout(() => {
      try {
        if (snapshot.kill) REFLECT_APPLY(snapshot.kill, snapshot.child, ['SIGKILL']);
      } catch {}
    }, termMs);
    abandonTimer = setTimeout(() => finish(false), killMs);
    try {
      if (snapshot.kill) REFLECT_APPLY(snapshot.kill, snapshot.child, ['SIGTERM']);
    } catch {}
  });
}

function terminalStatus(message) {
  if (message === 'COMPLETE') return 'complete';
  if (message === 'PARTIAL_COMPLETE') return 'partial-complete';
  if (message === 'RECOVERED') return 'recovered';
  if (message === 'OUTCOME_UNKNOWN') return 'outcome-unknown';
  return undefined;
}

function expectedPublicationTrace(mode) {
  if (mode === GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.FRESH) return [0, 1];
  if (mode === GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.PARTIAL_RECOVERY) return [1];
  if (mode === GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.READ_ONLY_RECOVERY) return [];
  return undefined;
}

function terminalMatchesTrace(mode, terminal, trace) {
  const expected = expectedPublicationTrace(mode);
  if (terminal === 'outcome-unknown') {
    if (mode === undefined) return trace.length === 0;
    if (!expected || trace.length > expected.length) return false;
    for (let index = 0; index < trace.length; index += 1) {
      if (trace[index] !== expected[index]) return false;
    }
    return true;
  }
  if (!expected || trace.length !== expected.length) return false;
  for (let index = 0; index < trace.length; index += 1) {
    if (trace[index] !== expected[index]) return false;
  }
  return (terminal === 'complete' &&
      mode === GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.FRESH) ||
    (terminal === 'partial-complete' &&
      mode === GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.PARTIAL_RECOVERY) ||
    (terminal === 'recovered' &&
      mode === GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.READ_ONLY_RECOVERY);
}

async function superviseSelectedGateBTestnetFaucetReceive(
  workspaceRoot,
  requireGenerated,
  injected,
) {
  let frame;
  let snapshot;
  let fallback;
  let dependencies;
  let childClosed = false;
  let publicationSeen = false;
  const publicationTrace = [];
  const owned = [];
  const detach = () => {
    if (!snapshot) return;
    for (let index = 0; index < owned.length; index += 1) {
      const [emitter, event, listener] = owned[index];
      removeListener(snapshot, emitter, event, listener);
    }
    owned.length = 0;
  };
  try {
    dependencies = exactInjections(injected);
    frame = await REFLECT_APPLY(dependencies.readBootstrapFrame, undefined, []);
    const bootstrap = parseGateBTestnetFaucetReceiveFrame(frame);
    if (!bootstrap || bootstrap.schemaVersion !== 1) fail();
    workspaceRoot = await canonicalWalletWorkspace(
      workspaceRoot,
      requireGenerated,
      dependencies,
    );
    const child = REFLECT_APPLY(dependencies.forkProcess, undefined, [
      dependencies.childModule,
      [],
      {
        cwd: workspaceRoot,
        detached: false,
        env: {},
        execArgv: [],
        shell: false,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc', 'pipe'],
        windowsHide: true,
      },
    ]);
    fallback = captureFallback(child);
    snapshot = childSnapshot(child);

    const outcome = await new Promise((resolveOutcome, rejectOutcome) => {
      let settled = false;
      let ready = false;
      let frameWritten = false;
      let executeSent = false;
      let executionMode;
      let terminal;
      let exitSeen = false;
      const timer = setTimeout(() => finish(false), dependencies.timeoutMs);
      const finish = success => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (success) resolveOutcome(terminal);
        else rejectOutcome(new GateBTestnetFaucetReceiveSupervisorError());
      };
      const sendExecute = () => {
        if (settled || !ready || !frameWritten || executeSent) return;
        executeSent = true;
        try {
          REFLECT_APPLY(snapshot.send, snapshot.child, ['EXECUTE', error => {
            if (!settled && error) finish(false);
          }]);
        } catch {
          finish(false);
        }
      };
      const onMessage = message => {
        const publicationBoundary = typeof message === 'string' &&
          (message === 'PUBLISHING_0' || message === 'PUBLISHING_1');
        if (publicationBoundary) publicationSeen = true;
        if (settled || typeof message !== 'string') return finish(false);
        if (!ready) {
          if (message !== 'READY') return finish(false);
          ready = true;
          sendExecute();
          return;
        }
        if (!executeSent || terminal !== undefined) return finish(false);
        if (message === GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.FRESH ||
            message === GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.PARTIAL_RECOVERY ||
            message === GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.READ_ONLY_RECOVERY) {
          if (executionMode !== undefined || publicationTrace.length !== 0) return finish(false);
          executionMode = message;
          return;
        }
        if (publicationBoundary) {
          const expected = expectedPublicationTrace(executionMode);
          const index = message === 'PUBLISHING_0' ? 0 : 1;
          if (!expected || publicationTrace.length >= expected.length ||
              index !== expected[publicationTrace.length]) return finish(false);
          publicationTrace.push(index);
          return;
        }
        terminal = terminalStatus(message);
        if (terminal === undefined ||
            !terminalMatchesTrace(executionMode, terminal, publicationTrace)) finish(false);
      };
      const onError = () => finish(false);
      const onDisconnect = () => {
        if (!settled && terminal === undefined) finish(false);
      };
      const onExit = (code, signal) => {
        exitSeen = true;
        if (!settled && (terminal === undefined ||
            (terminal === 'outcome-unknown' ? code !== 2 : code !== 0) || signal !== null)) {
          finish(false);
        }
      };
      const onClose = (code, signal) => {
        childClosed = true;
        if (settled) return;
        if (!exitSeen || terminal === undefined ||
            (terminal === 'outcome-unknown' ? code !== 2 : code !== 0) || signal !== null) {
          return finish(false);
        }
        finish(true);
      };
      for (const [event, listener] of [
        ['message', onMessage], ['error', onError], ['disconnect', onDisconnect],
        ['exit', onExit], ['close', onClose],
      ]) {
        REFLECT_APPLY(snapshot.on, snapshot.child, [event, listener]);
        owned.push([snapshot.child, event, listener]);
      }
      try {
        REFLECT_APPLY(snapshot.bootstrapEnd, snapshot.bootstrap, [frame, error => {
          if (settled) return;
          frameWritten = error === undefined || error === null;
          if (!frameWritten) finish(false);
          else sendExecute();
        }]);
      } catch {
        finish(false);
      }
    });
    if (!childClosed || !terminalStatus(
      outcome === 'complete' ? 'COMPLETE' :
        outcome === 'partial-complete' ? 'PARTIAL_COMPLETE' :
          outcome === 'recovered' ? 'RECOVERED' : 'OUTCOME_UNKNOWN',
    )) fail();
    detach();
    return outcome;
  } catch {
    destroyBootstrap(fallback);
    const reaped = fallback
      ? await terminateAndAwait(
        fallback,
        childClosed,
        dependencies?.termMs ?? TERM_MS,
        dependencies?.killMs ?? KILL_MS,
      )
      : true;
    detach();
    releaseFallback(fallback);
    if (publicationSeen) return 'outcome-unknown';
    if (!reaped) fail();
    fail();
  } finally {
    detach();
    destroyBootstrap(fallback);
    if (Buffer.isBuffer(frame)) frame.fill(0);
    releaseFallback(fallback);
  }
}

export async function superviseGateBTestnetFaucetReceive(injected) {
  return superviseSelectedGateBTestnetFaucetReceive(undefined, false, injected);
}

export async function superviseGateBTestnetFaucetReceiveForWorkspace(
  workspaceRoot,
  injected,
) {
  if (typeof workspaceRoot !== 'string') fail();
  return superviseSelectedGateBTestnetFaucetReceive(workspaceRoot, true, injected);
}
