import { createReadStream } from 'node:fs';

import {
  GATE_B_OPERATOR_COORDINATOR_IPC_TYPES,
  GATE_B_OPERATOR_COORDINATOR_STATUS_LINES,
  createGateBOperatorCoordinatorIpcMessage,
  parseGateBOperatorCoordinatorBootstrapFrame,
  parseGateBOperatorCoordinatorIpcMessage,
} from '../src/gate-b-operator-coordinator-schema.js';
import { openGateBPublicWsPrivateWorkspace } from
  '../src/gate-b-public-ws-private-workspace.js';

const input = createReadStream(null, { fd: 3, autoClose: true });
const chunks = [];
let total = 0;
let terminal = false;
let bootstrapFrameComplete = false;
let workspace;

function finish(code) {
  if (terminal) return;
  terminal = true;
  for (const chunk of chunks) chunk.fill(0);
  chunks.length = 0;
  try { input.destroy(); } catch {}
  process.exitCode = code;
  try { process.disconnect(); } catch {}
}

function send(type) {
  return new Promise((resolve, reject) => {
    try {
      process.send?.(createGateBOperatorCoordinatorIpcMessage(type), error => {
        if (error) reject(new Error('fixture_failed'));
        else resolve(true);
      });
    } catch {
      reject(new Error('fixture_failed'));
    }
  });
}

function writeLine(line) {
  return new Promise((resolve, reject) => {
    try {
      process.stdout.write(line, error => {
        if (error) reject(new Error('fixture_failed'));
        else resolve(true);
      });
    } catch {
      reject(new Error('fixture_failed'));
    }
  });
}

async function acceptBootstrap(frame) {
  const bootstrap = parseGateBOperatorCoordinatorBootstrapFrame(frame);
  if (bootstrap.schemaVersion !== 5 || process.cwd() !== bootstrap.workspaceRoot) {
    throw new Error('fixture_failed');
  }
  workspace = await openGateBPublicWsPrivateWorkspace(bootstrap.workspaceRoot, {
    aclInspector: async () => true,
    platform: 'darwin',
  });
  await writeLine(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED);
  await send(GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.REVIEW_REQUIRED);
}

input.on('data', chunk => {
  if (terminal || !Buffer.isBuffer(chunk)) return finish(1);
  chunks.push(chunk);
  total += chunk.length;
  if (total < 4) return;
  const header = Buffer.concat(chunks, total);
  const length = header.readUInt32BE(0);
  if (length < 1 || length > 8192 || total > length + 4) {
    header.fill(0);
    finish(1);
    return;
  }
  if (total !== length + 4) {
    header.fill(0);
    return;
  }
  bootstrapFrameComplete = true;
  input.removeAllListeners('data');
  input.on('data', later => { if (Buffer.isBuffer(later)) later.fill(0); });
  void acceptBootstrap(header).then(() => {
    header.fill(0);
  }, () => {
    header.fill(0);
    finish(1);
  });
});

input.once('error', () => finish(1));
input.once('end', () => { if (!bootstrapFrameComplete) finish(1); });

process.on('message', message => {
  if (terminal) return;
  let parsed;
  try { parsed = parseGateBOperatorCoordinatorIpcMessage(message); } catch {
    finish(1);
    return;
  }
  if (parsed.type !== GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.STOP || !workspace) {
    finish(1);
    return;
  }
  void workspace.close().then(async closed => {
    if (closed !== true) throw new Error('fixture_failed');
    await writeLine(GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED);
    await send(GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.STOPPED);
    await new Promise(resolve => setTimeout(resolve, 20));
    finish(0);
  }, () => finish(1));
});
