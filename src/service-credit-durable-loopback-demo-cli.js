import { writeSync as fsWriteSync } from 'node:fs';

import {
  runDurableServiceCreditLoopbackDemo,
} from './service-credit-durable-loopback-demo.js';

const SUCCESS = 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_SUCCESS\n';
const FAILURE = 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED\n';
const WRITE_SYNC = fsWriteSync;
const BUFFER_FROM = Buffer.from;

function writeFixedDescriptor(descriptor, line) {
  const bytes = BUFFER_FROM(line, 'utf8');
  const written = WRITE_SYNC(descriptor, bytes, 0, bytes.length);
  if (written !== bytes.length) throw new Error('fixed output write failed');
}

async function main() {
  if (process.argv.length !== 2) throw new Error('invalid invocation');
  await runDurableServiceCreditLoopbackDemo();
  writeFixedDescriptor(1, SUCCESS);
}

main().catch(() => {
  process.exitCode = 1;
  try {
    writeFixedDescriptor(2, FAILURE);
  } catch {
    // Nonzero termination remains the only signal if stderr is unavailable.
  }
});
