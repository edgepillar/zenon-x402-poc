// Unexecuted native-only acceptance stage. No application listener or signer.
import { readSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { TextDecoder } from 'node:util';
import { canonicalJson } from '../src/canonical.js';
import { captureApiCreditLedgerAcceptanceSelection, apiCreditLedgerProbeOptions,
  readApiCreditAcceptanceLedger } from './api-credit-linux-ledger-contract.mjs';

try {
  if (process.versions.node !== '24.19.0' || process.platform !== 'linux' || !['x64', 'arm64'].includes(process.arch)) throw new TypeError('RUNTIME');
  const chunks = []; let total = 0;
  for (;;) {
    const bytes = Buffer.alloc(Math.min(65536, 9437185 - total)), n = readSync(0, bytes);
    if (n === 0) break; total += n; if (total > 9437184) throw new TypeError('BOUND'); chunks.push(bytes.subarray(0, n));
  }
  const selection = captureApiCreditLedgerAcceptanceSelection(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, total))));
  // Fixed actual store import, after complete EOF and pure fixture admission.
  // openExisting uses real transactions; this is not a readOnly SQL handle.
  const { ServiceCreditSqliteStore } = await import('../src/service-credit-sqlite-store.js');
  const options = apiCreditLedgerProbeOptions(selection);
  const store = ServiceCreditSqliteStore.openExisting({ ...options, deriveCost() { throw new TypeError('NO_PRICING'); } });
  const observed = readApiCreditAcceptanceLedger(selection, Object.freeze({
    load: () => canonicalJson(store.load()), executions: () => canonicalJson(store.getDurableExecutionSnapshot()),
    close: () => store.close(),
  }));
  process.stdout.write(canonicalJson(observed) + '\n');
} catch {
  process.stderr.write('API_CREDIT_LINUX_LEDGER_UNKNOWN\n'); process.exitCode = 4;
}
