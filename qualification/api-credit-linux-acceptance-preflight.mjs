// Fixed harness boundary. Not the application CLI; no credential is accepted.
import { readSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import process from 'node:process';
import { captureApiCreditBudgetAcceptanceSelection } from './api-credit-linux-budget-contract.mjs';

try {
  if (process.versions.node !== '24.19.0' || process.platform !== 'linux') throw new TypeError('RUNTIME');
  const chunks = []; let total = 0;
  for (;;) {
    const chunk = Buffer.alloc(Math.min(65536, 9437185 - total));
    const count = readSync(0, chunk);
    if (count === 0) break;
    total += count; if (total > 9437184) throw new TypeError('BOUND'); chunks.push(chunk.subarray(0, count));
  }
  const bytes = Buffer.concat(chunks, total);
  const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  process.stdout.write(JSON.stringify(captureApiCreditBudgetAcceptanceSelection(input).summary) + '\n');
} catch {
  process.stderr.write('API_CREDIT_LINUX_ACCEPTANCE_PREFLIGHT_REFUSED\n'); process.exitCode = 1;
}
