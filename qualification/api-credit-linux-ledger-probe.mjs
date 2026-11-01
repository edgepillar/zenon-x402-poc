// Unexecuted native-only acceptance stage. No application listener or signer.
import { readSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { TextDecoder } from 'node:util';
import { canonicalJson } from '../src/canonical.js';
import { captureApiCreditSignerProbeEnvelope, apiCreditSignerAcceptanceLedgerOptions,
  readApiCreditSignerAcceptanceProviderLedger, readApiCreditAcceptanceSignerSpending } from './api-credit-linux-signer-contract.mjs';
import { captureApiCreditOperatorUtcDay } from '../src/api-credit-operator-clock.js';

try {
  const started = process.hrtime.bigint();
  if (process.versions.node !== '24.19.0' || process.platform !== 'linux' || !['x64', 'arm64'].includes(process.arch)) throw new TypeError('RUNTIME');
  const chunks = []; let total = 0;
  for (;;) {
    const bytes = Buffer.alloc(Math.min(65536, 9437185 - total)), n = readSync(0, bytes);
    if (n === 0) break; total += n; if (total > 9437184) throw new TypeError('BOUND'); chunks.push(bytes.subarray(0, n));
  }
  const envelope = captureApiCreditSignerProbeEnvelope(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, total))));
  const selection = envelope.selection, deadline = started + BigInt(envelope.maximumOpenMs) * 1000000n;
  const requireOpening = Object.freeze(() => { if (process.hrtime.bigint() > deadline) throw new TypeError('OPENING_EXPIRED'); });
  requireOpening();
  // Fixed actual store import, after complete EOF and pure fixture admission.
  // openExisting uses real transactions; this is not a readOnly SQL handle.
  const { ServiceCreditSqliteStore } = await import('../src/service-credit-sqlite-store.js');
  const options = apiCreditSignerAcceptanceLedgerOptions(selection);
  requireOpening();
  const store = ServiceCreditSqliteStore.openExisting({ ...options, deriveCost() { throw new TypeError('NO_PRICING'); } });
  const ledger = readApiCreditSignerAcceptanceProviderLedger(selection, Object.freeze({
    load: () => { requireOpening(); return canonicalJson(store.load()); },
    executions: () => { requireOpening(); return canonicalJson(store.getDurableExecutionSnapshot()); },
    close: () => store.close(),
  }));
  // The provider owner must close successfully before acquiring the spending
  // owner. Use the actual four-table grant-recovery profile used by the product;
  // do not downgrade to the three-table signer-only profile.
  const { openOriginalFundingSpendingGrantRecoveryFileOwner } = await import('../src/original-funding-spending-file-owner.js');
  requireOpening();
  const retained = readApiCreditAcceptanceSignerSpending(selection, Object.freeze({
    openers: Object.freeze({ signerContext: Object.freeze(() => { throw new TypeError('UNSELECTED_SCHEMA'); }),
      grantRecovery: Object.freeze(configuration => openOriginalFundingSpendingGrantRecoveryFileOwner(configuration)) }),
    requireOpening, readDay: Object.freeze(() => captureApiCreditOperatorUtcDay(Date.now())),
  }));
  requireOpening();
  const observed = Object.freeze({ version: 4, status: 'LEDGER_SPENDING_AND_SIGNER_OBSERVATIONS_MATCHED',
    selectionDigest: selection.summary.selectionDigest, ledger, spending: retained.spending, signer: retained.signer,
    snapshotAtomicAcrossStores: false, authority: 'NONE', G1Acceptance: 'NOT_ESTABLISHED', G2Acceptance: 'NOT_ESTABLISHED' });
  process.stdout.write(canonicalJson(observed) + '\n');
} catch {
  process.stderr.write('API_CREDIT_LINUX_LEDGER_UNKNOWN\n'); process.exitCode = 4;
}
