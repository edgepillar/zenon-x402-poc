import { writeSync as fsWriteSync } from 'node:fs';

import { runServiceCreditMockDemo } from './service-credit-demo.js';

const SUCCESS = [
  'SERVICE_CREDIT_MOCK_DEMO_SUCCESS',
  'DEMO_VERSION=1',
  'MODE=OFFLINE_MOCK_ONLY',
  'MOCK_FUNDING_SETTLEMENTS=1',
  'SERVICE_REQUEST_ATTEMPTS=4',
  'UNIQUE_SERVICE_REQUESTS=3',
  'EXACT_REPLAYS=1',
  'APPLICATION_EXECUTIONS=3',
  'ADDITIONAL_MOCK_SETTLEMENTS=0',
  'UNITS_CONSUMED=6',
  'UNITS_REMAINING=1',
  'NETWORK_ACTIVITY=NONE',
  'TIMING_CLAIM=NONE',
  'BENCHMARK=NO',
  '',
].join('\n');
const FAILURE = 'SERVICE_CREDIT_MOCK_DEMO_FAILED\n';
const WRITE_SYNC = fsWriteSync;

function writeFixedDescriptor(descriptor, line) {
  const bytes = Buffer.from(line, 'utf8');
  const written = WRITE_SYNC(descriptor, bytes, 0, bytes.length);
  if (written !== bytes.length) throw new Error('fixed output write failed');
}

async function main() {
  if (process.argv.length !== 2) throw new Error('invalid invocation');
  await runServiceCreditMockDemo();
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
