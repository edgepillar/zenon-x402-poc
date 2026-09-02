import { createReadStream } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CAPTURED_OUTER_PID = process.ppid;
const MAGIC = 0x47425250;
const FRAME_BYTES = 8;
const SEND_TIMEOUT_MS = 1_000;
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

async function readTarget() {
  const stream = createReadStream(null, {
    autoClose: true,
    fd: 3,
    highWaterMark: FRAME_BYTES,
  });
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk) || total + chunk.length > FRAME_BYTES) {
        if (Buffer.isBuffer(chunk)) chunk.fill(0);
        throw new Error('reaper_failed');
      }
      chunks.push(Buffer.from(chunk));
      total += chunk.length;
      chunk.fill(0);
    }
    if (total !== FRAME_BYTES) throw new Error('reaper_failed');
    const frame = Buffer.concat(chunks, total);
    try {
      if (frame.readUInt32BE(0) !== MAGIC) throw new Error('reaper_failed');
      const target = frame.readUInt32BE(4);
      if (!Number.isSafeInteger(target) || target < 2 || target === process.pid) {
        throw new Error('reaper_failed');
      }
      return target;
    } finally { frame.fill(0); }
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    stream.destroy();
  }
}

export async function runGateBOperatorReaper() {
  if (process.argv.length !== 2 || typeof process.send !== 'function' ||
      !Number.isSafeInteger(CAPTURED_OUTER_PID) || CAPTURED_OUTER_PID < 2) return false;
  let target;
  let lifetime;
  let activated = false;
  let validCleanupRequest = false;
  let poisoned = false;
  let releaseActivation;
  const activation = new Promise(resolve => { releaseActivation = resolve; });
  const activate = () => {
    if (activated) return;
    activated = true;
    releaseActivation(true);
  };
  const poison = () => { poisoned = true; activate(); };
  const onMessage = message => {
    if (!message || Object.getPrototypeOf(message) !== Object.prototype ||
        Reflect.ownKeys(message).length !== 1 || message.type !== 'CLEANUP') return poison();
    validCleanupRequest = true;
    activate();
  };
  const onLifetimeData = poison;
  const onLifetimeEnd = activate;
  const onDisconnect = activate;
  const onSignal = activate;
  let orphanTimer;
  try {
    target = await readTarget();
    if (!groupAlive(target)) throw new Error('reaper_failed');
    lifetime = createReadStream(null, { autoClose: true, fd: 4, highWaterMark: 1 });
    lifetime.on('data', onLifetimeData);
    lifetime.on('end', onLifetimeEnd);
    lifetime.on('close', onLifetimeEnd);
    lifetime.on('error', poison);
    process.on('message', onMessage);
    process.on('disconnect', onDisconnect);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    orphanTimer = setTimeout(activate, ORPHAN_MS);

    await send('READY');
    await activation;
    clearTimeout(orphanTimer);
    const absent = await reap(target);
    if (!absent || groupAlive(target)) return false;
    if (validCleanupRequest && !poisoned && process.connected) await send('ABSENT');
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(orphanTimer);
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
