import { writeSync as fsWriteSync } from 'node:fs';

import { runServiceCreditLocalBenchmark } from './service-credit-local-benchmark.js';

const FAILURE = 'SERVICE_CREDIT_LOCAL_BENCHMARK_FAILED\n';
const JSON_STRINGIFY = JSON.stringify;
const WRITE_SYNC = fsWriteSync;

function writeDescriptor(descriptor, text) {
  const bytes = Buffer.from(text, 'utf8');
  const written = WRITE_SYNC(descriptor, bytes, 0, bytes.length);
  if (written !== bytes.length) throw new Error('fixed output write failed');
}

async function main() {
  if (process.argv.length !== 2) throw new Error('invalid invocation');
  const result = await runServiceCreditLocalBenchmark();
  const serialized = JSON_STRINGIFY(result);
  if (typeof serialized !== 'string') throw new Error('serialization failed');
  writeDescriptor(1, `${serialized}\n`);
}

main().catch(() => {
  process.exitCode = 1;
  try {
    writeDescriptor(2, FAILURE);
  } catch {
    // Nonzero termination remains the only signal if stderr is unavailable.
  }
});
