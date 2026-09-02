import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

import {
  adoptGateBOperatorOriginGuard,
  closeGateBOperatorOriginGuard,
  observeGateBOperatorOriginGuardFault,
} from './gate-b-operator-origin-guard.js';

const CAPTURED_OUTER_PID = process.ppid;
const MAGIC = 0x47425250;
const FRAME_BYTES = 8;
const SEND_TIMEOUT_MS = 1_000;
const SETUP_TIMEOUT_MS = 2_000;
const FORCE_MS = 500;
const ABSENCE_MS = 2_000;
const ORPHAN_MS = 10 * 60_000;

function send(type) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ok ? resolve(true) : reject(new Error('reaper_failed'));
    };
    const timer = setTimeout(() => finish(false), SEND_TIMEOUT_MS);
    try { process.send(Object.freeze({ type }), error => finish(error == null)); }
    catch { finish(false); }
  });
}

function groupAlive(target) {
  try { process.kill(-target, 0); return true; }
  catch (error) {
    if (error?.code === 'ESRCH') return false;
    if (error?.code === 'EPERM') return true;
    throw error;
  }
}

async function waitAbsent(target, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (!groupAlive(target)) return true;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return !groupAlive(target);
}

async function reap(target) {
  if (!groupAlive(target)) return true;
  try { process.kill(-target, 'SIGTERM'); } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
  if (await waitAbsent(target, FORCE_MS)) return true;
  try { process.kill(-target, 'SIGKILL'); } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
  return waitAbsent(target, ABSENCE_MS);
}

function readTarget(signal) {
  return new Promise((resolve, reject) => {
    const stream = new Socket({
      fd: 3,
      readable: true,
      writable: false,
    });
    const chunks = [];
    let settled = false;
    let total = 0;
    const finish = (ok, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onFailure);
      stream.removeListener('close', onFailure);
      for (const chunk of chunks) chunk.fill(0);
      stream.destroy();
      ok ? resolve(value) : reject(new Error('reaper_failed'));
    };
    const onAbort = () => finish(false);
    const onFailure = () => finish(false);
    const onData = chunk => {
      if (!Buffer.isBuffer(chunk) || total + chunk.length > FRAME_BYTES) {
        if (Buffer.isBuffer(chunk)) chunk.fill(0);
        finish(false);
        return;
      }
      chunks.push(Buffer.from(chunk));
      total += chunk.length;
      chunk.fill(0);
    };
    const onEnd = () => {
      if (total !== FRAME_BYTES) return finish(false);
      const frame = Buffer.concat(chunks, total);
      try {
        if (frame.readUInt32BE(0) !== MAGIC) return finish(false);
        const target = frame.readUInt32BE(4);
        if (!Number.isSafeInteger(target) || target < 2 || target === process.pid) {
          return finish(false);
        }
        finish(true, target);
      } finally { frame.fill(0); }
    };
    signal.addEventListener('abort', onAbort, { once: true });
    stream.on('data', onData);
    stream.once('end', onEnd);
    stream.once('error', onFailure);
    stream.once('close', onFailure);
    if (signal.aborted) onAbort();
  });
}

function exactFieldless(message, type) {
  if (!message || typeof message !== 'object' ||
      Object.getPrototypeOf(message) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(message);
  if (keys.length !== 1 || keys[0] !== 'type') return false;
  const descriptor = Object.getOwnPropertyDescriptor(message, 'type');
  return Boolean(descriptor && Object.hasOwn(descriptor, 'value') &&
    descriptor.value === type);
}

async function protectiveResidue() {
  await new Promise(() => {});
}

export async function runGateBOperatorReaper() {
  if (process.argv.length !== 2 || typeof process.send !== 'function' ||
      !Number.isSafeInteger(CAPTURED_OUTER_PID) || CAPTURED_OUTER_PID < 2) return false;
  let target;
  let lifetime;
  let originGuard;
  let stopObservingOriginGuard;
  let activated = false;
  let ready = false;
  let validCleanupRequest = false;
  let poisoned = false;
  let setupAborted = false;
  let resolveArmed;
  let releaseActivation;
  const armed = new Promise(resolve => { resolveArmed = resolve; });
  const activation = new Promise(resolve => { releaseActivation = resolve; });
  const activate = () => {
    if (activated) return;
    activated = true;
    releaseActivation(true);
  };
  const targetReadController = new AbortController();
  const abortSetup = () => {
    if (ready) return activate();
    if (!setupAborted) {
      setupAborted = true;
      resolveArmed(false);
      activate();
      try { targetReadController.abort(); } catch {}
    }
    activate();
  };
  const poison = () => { poisoned = true; abortSetup(); };
  const onMessage = (message, handle) => {
    if (exactFieldless(message, 'ARM_ORIGIN_GUARD') && handle !== undefined) {
      if (originGuard || ready || setupAborted) return poison();
      try {
        originGuard = adoptGateBOperatorOriginGuard(handle);
        stopObservingOriginGuard = observeGateBOperatorOriginGuardFault(
          originGuard,
          poison,
        );
        resolveArmed(true);
      } catch {
        poisoned = true;
        resolveArmed(false);
        activate();
      }
      return;
    }
    if (!exactFieldless(message, 'CLEANUP') || handle !== undefined || !ready ||
        validCleanupRequest) return poison();
    validCleanupRequest = true;
    activate();
  };
  const onLifetimeData = poison;
  const onLifetimeEnd = abortSetup;
  const onDisconnect = abortSetup;
  const onSignal = abortSetup;
  let orphanTimer;
  let setupTimer;
  try {
    lifetime = new Socket({ fd: 4, readable: true, writable: false });
    lifetime.on('data', onLifetimeData);
    lifetime.on('end', onLifetimeEnd);
    lifetime.on('close', onLifetimeEnd);
    lifetime.on('error', poison);
    process.on('message', onMessage);
    process.on('disconnect', onDisconnect);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    orphanTimer = setTimeout(activate, ORPHAN_MS);
    setupTimer = setTimeout(abortSetup, SETUP_TIMEOUT_MS);

    target = await readTarget(targetReadController.signal);
    if (setupAborted) throw new Error('reaper_failed');
    if (!groupAlive(target)) throw new Error('reaper_failed');
    const armedOk = await Promise.race([armed, activation.then(() => false)]);
    if (armedOk !== true || !originGuard || poisoned) throw new Error('reaper_failed');
    if (setupAborted) throw new Error('reaper_failed');
    ready = true;
    clearTimeout(setupTimer);
    await send('READY');
    await activation;
    clearTimeout(orphanTimer);
    const absent = await reap(target);
    if (!absent || groupAlive(target)) {
      await protectiveResidue();
      return false;
    }
    if (await closeGateBOperatorOriginGuard(originGuard) !== true) {
      await protectiveResidue();
      return false;
    }
    if (validCleanupRequest && !poisoned && process.connected) await send('ABSENT');
    return true;
  } catch {
    let targetAbsent = false;
    if (target) {
      try {
        targetAbsent = !groupAlive(target) || await reap(target);
        targetAbsent = targetAbsent && !groupAlive(target);
      } catch { targetAbsent = false; }
    }
    if (originGuard) {
      if (!targetAbsent) await protectiveResidue();
      try {
        if (await closeGateBOperatorOriginGuard(originGuard) !== true) {
          await protectiveResidue();
        }
      } catch { await protectiveResidue(); }
    }
    return false;
  } finally {
    clearTimeout(orphanTimer);
    clearTimeout(setupTimer);
    try { stopObservingOriginGuard?.(); } catch {}
    lifetime?.destroy();
    process.removeListener('message', onMessage);
    process.removeListener('disconnect', onDisconnect);
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}

async function direct() {
  if (typeof process.argv[1] !== 'string' ||
      pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  process.exitCode = await runGateBOperatorReaper() ? 0 : 1;
  try { process.disconnect(); } catch {}
}

void direct().catch(() => { process.exitCode = 1; });

export const GATE_B_OPERATOR_REAPER_FRAME_MAGIC = MAGIC;
