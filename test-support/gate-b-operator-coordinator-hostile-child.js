import { spawn } from 'node:child_process';
import { createReadStream, writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { launchGateBOperatorWatchdogSetup } from '../src/gate-b-operator-coordinator-launcher.js';

const MODULE = fileURLToPath(import.meta.url);
const role = process.argv[2] ?? 'coordinator';

function send(type) {
  try { process.send?.({ type }); } catch {}
}

function installHostileTermination(roleName) {
  process.on('SIGTERM', () => {
    send(`HOSTILE_TERM_${roleName}`);
    setTimeout(() => send(`HOSTILE_LATE_${roleName}`), 800);
  });
}

function spawnRole(childRole) {
  return spawn(process.execPath, [MODULE, childRole], {
    detached: false,
    env: {},
    shell: false,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
}

function probePrivateStart() {
  const input = createReadStream(null, { autoClose: true, fd: 3, highWaterMark: 4 });
  return new Promise((resolve, reject) => {
    const onData = chunk => {
      if (!Buffer.isBuffer(chunk) || chunk.length !== 4) return reject(new Error('invalid'));
      const isStart = chunk.readUInt32BE(0) === 0x47425354;
      chunk.fill(0);
      input.removeListener('data', onData);
      if (isStart) input.destroy();
      else input.on('data', later => { if (Buffer.isBuffer(later)) later.fill(0); });
      resolve(isStart);
    };
    input.on('data', onData);
    input.once('error', reject);
    input.once('end', () => reject(new Error('invalid')));
  });
}

async function runHungWatchdogFixture() {
  process.on('SIGINT', () => {});
  process.on('SIGTERM', () => {});
  process.send?.({ type: 'STARTED' });
  setInterval(() => {}, 1000);
}

async function runOuterSetupFixture() {
  const groups = [];
  const capability = await launchGateBOperatorWatchdogSetup({
    platform: 'darwin',
    spawnProcess(executable, args, options) {
      const child = spawn(executable, args, options);
      groups.push(child.pid);
      if (groups.length === 2) {
        const frame = Buffer.alloc(8);
        frame.writeUInt32BE(groups[0], 0);
        frame.writeUInt32BE(groups[1], 4);
        writeSync(3, frame);
        frame.fill(0);
      }
      return child;
    },
    watchdogModule: MODULE,
  });
  if (!capability || groups.length !== 2) process.exit(1);
  const ready = Buffer.from([1]);
  writeSync(3, ready);
  ready.fill(0);
  setInterval(() => {}, 1000);
}

if (process.argv.length === 2 && await probePrivateStart()) {
  await runHungWatchdogFixture();
} else if (role === 'outer-setup') {
  await runOuterSetupFixture();
} else if (role === 'runtime' || role === 'reviewer') {
  installHostileTermination(role);
  send(`HOSTILE_READY_${role}`);
  setInterval(() => {}, 1000);
} else if (role === 'supervisor') {
  installHostileTermination(role);
  const runtime = spawnRole('runtime');
  runtime.on('message', message => {
    if (message?.type === 'HOSTILE_READY_runtime') send('HOSTILE_READY_supervisor');
    else if (typeof message?.type === 'string') send(message.type);
  });
  setInterval(() => {}, 1000);
} else {
  installHostileTermination(role);
  const reviewer = spawnRole('reviewer');
  const supervisor = spawnRole('supervisor');
  const ready = new Set();
  const observe = message => {
    if (message?.type === 'HOSTILE_READY_reviewer') ready.add('reviewer');
    if (message?.type === 'HOSTILE_READY_supervisor') ready.add('supervisor');
    if (ready.size === 2) send('HOSTILE_READY');
    else if (typeof message?.type === 'string' && !message.type.startsWith('HOSTILE_READY_')) {
      send(message.type);
    }
  };
  reviewer.on('message', observe);
  supervisor.on('message', observe);
  setInterval(() => {}, 1000);
}
