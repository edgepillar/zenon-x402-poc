// Fixed external bootstrap/proof DATA. No SQL, signatures or native acquisition.
import { canonicalJson } from '../src/canonical.js';
import { decodeBuyerOriginalRecoveryPipeBootstrap } from '../src/buyer-original-recovery-pipe-bootstrap.js';
import { encodeBuyerOriginalBackendRecoveryCommand } from '../src/buyer-original-funding-command.js';
import { originalRecoveryPipeVector } from './buyer-original-recovery-pipe.fixture.mjs';
import { recoveryFixture } from './buyer-original-recovery.fixture.mjs';

export function originalBackendRecoveryPipeVector() {
  const previous = originalRecoveryPipeVector(), f = recoveryFixture();
  const bootstrap = { ...previous.bootstrap, recoveryPipeBootstrapVersion: 2,
    backendOptions: { databasePath: '/synthetic-recovery/backend.sqlite',
      limits: { busyTimeoutMs: 100, maxStateBytes: 65536, maxOffers: 8, maxGrants: 8, maxRequests: 8 } } };
  const bootstrapLine = canonicalJson(bootstrap);
  decodeBuyerOriginalRecoveryPipeBootstrap(bootstrapLine, '/synthetic-recovery');
  return { ...previous, bootstrap, bootstrapLine,
    reconcileLine: encodeBuyerOriginalBackendRecoveryCommand({ version: 1, id: 'backend',
      operation: 'reconcileOriginal', input: f.backendInput() }),
    queuedServiceLine: encodeBuyerOriginalBackendRecoveryCommand({ version: 1, id: 'queued-original',
      operation: 'submitService', input: f.service() }),
    declaredBackendStoreAndReader: true, backendOrPayerDatabaseCreated: false };
}
