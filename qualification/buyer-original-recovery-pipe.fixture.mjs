// Deterministic public DATA vector builder, not a signer or native application.
import { Buffer } from 'node:buffer';
import { canonicalJson } from '../src/canonical.js';
import { recoveryFixture } from './buyer-original-recovery.fixture.mjs';
import { decodeBuyerOriginalRecoveryPipeBootstrap } from '../src/buyer-original-recovery-pipe-bootstrap.js';
import { encodeBuyerOriginalRecoveryCommand } from '../src/buyer-original-funding-command.js';

export function originalRecoveryPipeVector() {
  const f = recoveryFixture(), originalPayment = f.selection.originalPayment;
  const payload = JSON.parse(Buffer.from(f.checkpoint.originalBytes.paymentPayload, 'base64').toString('utf8'));
  const bootstrap = { recoveryPipeBootstrapVersion: 1, selection: {
    originalPayment, selectedGrantId: f.selection.selectedGrantId, paymentRequiredHeader: f.selection.paymentRequiredHeader,
  }, payerOptions: { databasePath: '/synthetic-recovery/payer.sqlite', allowedRoot: '/synthetic-recovery',
    fundingResourceUrl: originalPayment.resourceUrl, custodyPolicy: { policyVersion: 1, maxRequests: 8,
      serviceResourceUrl: new URL(originalPayment.resourceUrl).origin + '/service-credit/v1/execute' },
    selectedGrantId: f.selection.selectedGrantId, deadlineMs: 1000 },
  official: { assetInfo: { asset: payload.accepted.asset, decimals: 8, symbol: 'DECLARED' }, contextLimit: 1 },
  transportOptions: { origin: new URL(originalPayment.resourceUrl).origin,
    caPem: '-----BEGIN CERTIFICATE-----\nDECLARED_INVALID_CERTIFICATE_DATA\n-----END CERTIFICATE-----\n',
    maxRequestStarts: 1, maxConcurrentRequests: 1, requestDeadlineMs: 1000, handshakeDeadlineMs: 500, closeGraceMs: 250 } };
  const bootstrapLine = canonicalJson(bootstrap);
  decodeBuyerOriginalRecoveryPipeBootstrap(bootstrapLine, '/synthetic-recovery');
  const command = (id, operation, input = {}) => encodeBuyerOriginalRecoveryCommand({ version: 1, id, operation, input });
  return { bootstrap, bootstrapLine, inspectLine: command('inspect', 'inspect'), closeLine: command('close', 'close'),
    restoreLine: command('restore', 'restoreOriginal', f.restoreInput()),
    expectedOriginalHeader: f.checkpoint.originalBytes.paymentPayload,
    authority: 'NONE', declaredNativeCallbacks: true, certificateAndSignatureDATAAreInvalid: true };
}
