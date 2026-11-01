// Unexecuted native-only acceptance stage. No application listener or signer.
import { readSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { TextDecoder } from 'node:util';
import { canonicalJson } from '../src/canonical.js';
import { captureApiCreditBudgetAcceptanceSelection, apiCreditBudgetProbeOptions,
  readApiCreditAcceptanceProviderLedger, readApiCreditAcceptanceSpending } from './api-credit-linux-budget-contract.mjs';

try {
  if (process.versions.node !== '24.19.0' || process.platform !== 'linux' || !['x64', 'arm64'].includes(process.arch)) throw new TypeError('RUNTIME');
  const chunks = []; let total = 0;
  for (;;) {
    const bytes = Buffer.alloc(Math.min(65536, 9437185 - total)), n = readSync(0, bytes);
    if (n === 0) break; total += n; if (total > 9437184) throw new TypeError('BOUND'); chunks.push(bytes.subarray(0, n));
  }
  const selection = captureApiCreditBudgetAcceptanceSelection(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, total))));
  // Fixed actual store import, after complete EOF and pure fixture admission.
  // openExisting uses real transactions; this is not a readOnly SQL handle.
  const { ServiceCreditSqliteStore } = await import('../src/service-credit-sqlite-store.js');
  const options = apiCreditBudgetProbeOptions(selection);
  const store = ServiceCreditSqliteStore.openExisting({ ...options.ledger, deriveCost() { throw new TypeError('NO_PRICING'); } });
  const ledger = readApiCreditAcceptanceProviderLedger(selection, Object.freeze({
    load: () => canonicalJson(store.load()), executions: () => canonicalJson(store.getDurableExecutionSnapshot()),
    close: () => store.close(),
  }));
  // The provider owner must close successfully before acquiring the spending
  // owner. Use the actual four-table grant-recovery profile used by the product;
  // do not downgrade to the three-table signer-only profile.
  const { openOriginalFundingSpendingGrantRecoveryFileOwner } = await import('../src/original-funding-spending-file-owner.js');
  const owner = openOriginalFundingSpendingGrantRecoveryFileOwner(options.spending);
  const spending = readApiCreditAcceptanceSpending(selection, Object.freeze({
    load: () => owner.backend.load(options.spending.storageProfile.policy.accountId),
    assertCurrent: () => owner.assertCurrent(), inspect: () => owner.inspect(),
    revoke: () => owner.revoke(), close: () => owner.close(),
  }));
  const observed = Object.freeze({ version: 3, status: 'LEDGER_AND_SPENDING_OBSERVATIONS_MATCHED',
    selectionDigest: selection.summary.selectionDigest, ledger, spending, snapshotAtomicAcrossStores: false,
    authority: 'NONE', G1Acceptance: 'NOT_ESTABLISHED', G2Acceptance: 'NOT_ESTABLISHED' });
  process.stdout.write(canonicalJson(observed) + '\n');
} catch {
  process.stderr.write('API_CREDIT_LINUX_LEDGER_UNKNOWN\n'); process.exitCode = 4;
}
