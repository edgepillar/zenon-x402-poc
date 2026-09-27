import { openGateBPublicWsPrivateWorkspace } from
  '../src/gate-b-public-ws-private-workspace.js';
import {
  crossCheckGateBResetEpochOfflineConfiguration,
  runGateBResetEpochOfflineCrossCheckChild,
} from '../src/gate-b-reset-epoch-offline-review-child.js';

const crossCheck = () => crossCheckGateBResetEpochOfflineConfiguration({
  attestSourceTree: async () => true,
  beforeFinalVerification: async () => {},
  cwd: () => process.cwd(),
  openWorkspace: openGateBPublicWsPrivateWorkspace,
  workspaceInjections: {
    aclInspector: async () => true,
    platform: 'darwin',
  },
});

const success = await runGateBResetEpochOfflineCrossCheckChild({
  channel: process,
  crossCheck,
  writeResult: undefined,
});
process.exitCode = success ? 0 : 1;
try { process.disconnect(); } catch {}
