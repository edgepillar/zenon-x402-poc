import { createReadStream } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { createGateBOperatorCoordinatorFrameReader } from './gate-b-operator-coordinator-cli.js';
import {
  launchGateBOperatorCoordinatorInInheritedProcessGroup,
  stopGateBOperatorCoordinator,
  submitGateBOperatorCoordinatorReview,
  waitGateBOperatorCoordinatorClosed,
} from './gate-b-operator-coordinator-launcher.js';
import {
  GATE_B_OPERATOR_COORDINATOR_IPC_TYPES,
  GATE_B_OPERATOR_COORDINATOR_STATUS_LINES,
  createGateBOperatorCoordinatorIpcMessage,
  parseGateBOperatorCoordinatorBootstrapFrame,
  parseGateBOperatorCoordinatorIpcMessage,
  parseGateBOperatorCoordinatorReviewFrame,
} from './gate-b-operator-coordinator-schema.js';

const OUTPUT_TIMEOUT_MS = 1_000;
const START_TIMEOUT_MS = 1_000;
const START_MAGIC = 0x47425354;
const START_BYTES = 4;

function fixedWrite(stream, line) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ok ? resolve(true) : reject(new Error('watchdog_failed'));
    };
    const timer = setTimeout(() => finish(false), OUTPUT_TIMEOUT_MS);
    try { stream.write(line, error => finish(error == null)); } catch { finish(false); }
  });
}

function fixedSendMessage(message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ok ? resolve(true) : reject(new Error('watchdog_failed'));
    };
    const timer = setTimeout(() => finish(false), OUTPUT_TIMEOUT_MS);
    try { process.send(message, error => finish(error == null)); }
    catch { finish(false); }
  });
}

function fixedSend(type) {
  return fixedSendMessage(createGateBOperatorCoordinatorIpcMessage(type));
}

function exactFieldlessControl(value, type) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 1 || keys[0] !== 'type') return false;
  const descriptor = Object.getOwnPropertyDescriptor(value, 'type');
  return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.value === type;
}

function readPrivateStart(stopped) {
  const stream = createReadStream(null, {
    autoClose: true,
    fd: 3,
    highWaterMark: START_BYTES,
  });
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    const clear = () => {
      clearTimeout(timer);
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
      stream.removeListener('close', onClose);
      for (const chunk of chunks) chunk.fill(0);
      chunks.length = 0;
      stream.destroy();
    };
    const finish = ok => {
      if (settled) return;
      settled = true;
      let valid = false;
      if (ok && total === START_BYTES) {
        const frame = Buffer.concat(chunks, total);
        try { valid = frame.readUInt32BE(0) === START_MAGIC; }
        finally { frame.fill(0); }
      }
      clear();
      valid ? resolve(true) : reject(new Error('watchdog_failed'));
    };
    const onData = chunk => {
      if (!Buffer.isBuffer(chunk) || total + chunk.length > START_BYTES) {
        if (Buffer.isBuffer(chunk)) chunk.fill(0);
        finish(false);
        return;
      }
      chunks.push(Buffer.from(chunk));
      total += chunk.length;
      chunk.fill(0);
    };
    const onEnd = () => finish(true);
    const onError = () => finish(false);
    const onClose = () => finish(false);
    const timer = setTimeout(() => finish(false), START_TIMEOUT_MS);
    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onError);
    stream.on('close', onClose);
    void stopped.then(() => finish(false));
  });
}

export async function runGateBOperatorWatchdog() {
  if (process.argv.length !== 2 || typeof process.send !== 'function') return false;
  const parentLifetime = createReadStream(null, {
    autoClose: true,
    fd: 5,
    highWaterMark: 1,
  });
  let input;
  let reader;
  let capability;
  let stopping = false;
  let quarantine = false;
  let started = false;
  let stopWork;
  let controlPhase = 'WAIT_START';
  let resolveBootstrapOpened;
  let resolveReviewOpened;
  const bootstrapOpened = new Promise(resolve => { resolveBootstrapOpened = resolve; });
  const reviewOpened = new Promise(resolve => { resolveReviewOpened = resolve; });
  let releaseStop;
  const stopped = new Promise(resolve => { releaseStop = resolve; });
  const requestStop = () => {
    if (stopping) return;
    stopping = true;
    releaseStop(true);
  };
  const poison = () => { quarantine = true; requestStop(); };
  const onMessage = candidate => {
    if (exactFieldlessControl(candidate, 'BOOTSTRAP_OPEN')) {
      if (controlPhase !== 'WAIT_BOOTSTRAP_OPEN' || reader || input) return poison();
      try {
        input = createReadStream(null, {
          autoClose: true,
          fd: 4,
          highWaterMark: 1024,
        });
        reader = createGateBOperatorCoordinatorFrameReader(input);
        controlPhase = 'BOOTSTRAP_OPEN';
        void fixedSendMessage(Object.freeze({ type: 'BOOTSTRAP_OPENED' })).then(
          () => resolveBootstrapOpened(true),
          poison,
        );
      } catch { poison(); }
      return;
    }
    if (exactFieldlessControl(candidate, 'REVIEW_OPEN')) {
      if (controlPhase !== 'WAIT_REVIEW_OPEN' || !reader) return poison();
      try {
        reader.openReviewPhase();
        controlPhase = 'REVIEW_OPEN';
        void fixedSendMessage(Object.freeze({ type: 'REVIEW_OPENED' })).then(
          () => resolveReviewOpened(true),
          poison,
        );
      } catch { poison(); }
      return;
    }
    try {
      if (parseGateBOperatorCoordinatorIpcMessage(candidate).type !==
          GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.STOP) return poison();
    } catch { return poison(); }
    requestStop();
  };
  const onDisconnect = poison;
  const onLifetimeData = poison;
  const onLifetimeEnd = poison;
  const onSignal = requestStop;
  const cleanup = async () => {
    if (!capability) return true;
    if (!stopWork) stopWork = (async () => {
      let stoppedResult;
      let closedResult;
      try { stoppedResult = await stopGateBOperatorCoordinator(capability); } catch {}
      try { closedResult = await waitGateBOperatorCoordinatorClosed(capability); } catch {}
      return stoppedResult === 'CLOSED' && closedResult === 'CLOSED';
    })();
    return stopWork;
  };
  try {
    process.on('message', onMessage);
    process.on('disconnect', onDisconnect);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    parentLifetime.on('data', onLifetimeData);
    parentLifetime.on('end', onLifetimeEnd);
    parentLifetime.on('close', onLifetimeEnd);
    parentLifetime.on('error', onLifetimeEnd);

    await readPrivateStart(stopped);
    if (stopping) throw new Error('watchdog_failed');
    started = true;
    controlPhase = 'WAIT_BOOTSTRAP_OPEN';
    await fixedSendMessage(Object.freeze({ type: 'STARTED' }));
    await Promise.race([
      bootstrapOpened,
      stopped.then(() => { throw new Error('watchdog_failed'); }),
    ]);
    const first = await Promise.race([
      reader.readInitial(),
      stopped.then(() => { throw new Error('watchdog_failed'); }),
    ]);
    let bootstrap;
    try { bootstrap = parseGateBOperatorCoordinatorBootstrapFrame(first); }
    finally { first.fill(0); }
    if (stopping) throw new Error('watchdog_failed');
    capability = await launchGateBOperatorCoordinatorInInheritedProcessGroup(bootstrap);
    bootstrap = undefined;
    if (stopping) throw new Error('watchdog_failed');
    await fixedWrite(process.stdout, GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED);
    controlPhase = 'WAIT_REVIEW_OPEN';
    await fixedSend(GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.REVIEW_REQUIRED);
    await Promise.race([
      reviewOpened,
      stopped.then(() => { throw new Error('watchdog_failed'); }),
    ]);
    const second = await Promise.race([
      reader.readReview(),
      stopped.then(() => { throw new Error('watchdog_failed'); }),
    ]);
    let review;
    try { review = parseGateBOperatorCoordinatorReviewFrame(second); }
    finally { second.fill(0); }
    if (stopping) throw new Error('watchdog_failed');
    if (await submitGateBOperatorCoordinatorReview(capability, review) !== 'PREFLIGHT_VALID') {
      throw new Error('watchdog_failed');
    }
    review = undefined;
    await fixedWrite(process.stdout, GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.PREFLIGHT_VALID);
    await fixedSend(GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.PREFLIGHT_VALID);
    await stopped;
    if (await cleanup() !== true || quarantine) throw new Error('watchdog_failed');
    await fixedWrite(process.stdout, GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED);
    await fixedSend(GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.STOPPED);
    return true;
  } catch {
    quarantine = true;
    await cleanup();
    if (started) {
      try {
        await fixedWrite(process.stderr, GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.QUARANTINED);
      } catch {}
      try { await fixedSend(GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.QUARANTINED); } catch {}
    }
    return false;
  } finally {
    try { reader?.close(); } catch {}
    parentLifetime.destroy();
    process.removeListener('message', onMessage);
    process.removeListener('disconnect', onDisconnect);
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}

async function direct() {
  if (typeof process.argv[1] !== 'string' ||
      pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  process.exitCode = await runGateBOperatorWatchdog() ? 0 : 1;
  try { process.disconnect(); } catch {}
}

void direct().catch(() => { process.exitCode = 1; });

export const GATE_B_OPERATOR_WATCHDOG_START_MAGIC = START_MAGIC;
