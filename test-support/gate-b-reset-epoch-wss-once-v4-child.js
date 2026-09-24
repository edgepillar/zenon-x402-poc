import { readFileSync } from 'node:fs';

import {
  bindGateBResetEpochWssOnceArtifactsV4,
} from '../src/gate-b-reset-epoch-wss-once-artifacts-v4.js';
import {
  closeGateBResetEpochWssOnceJournalV4,
  createGateBResetEpochWssOnceJournalV4,
  openGateBResetEpochWssOnceJournalV4,
} from '../src/gate-b-reset-epoch-wss-once-journal-v4.js';
import {
  createGateBResetEpochWssOnceRunnerV4,
} from '../src/gate-b-reset-epoch-wss-once-runner-v4.js';

const OWNER_BUSY = 'gate_b_reset_epoch_wss_once_journal_v4_owner_busy';

function input() {
  const value = JSON.parse(readFileSync(0, 'utf8'));
  return {
    authorization: value.authorization,
    configurationBytes: Buffer.from(value.configurationBase64, 'base64'),
    review: value.review,
    workspaceRoot: value.workspaceRoot,
  };
}

function fakes(artifacts) {
  return {
    async checkpoint() {},
    async observeBinding(context) {
      return {
        executionBinding: artifacts.executionBinding,
        observationVersion: 4,
        stage: context.stage,
      };
    },
    async prepareBuyerPayment(context) {
      return {
        buyerPreparationVersion: 4,
        executionBinding: context.executionBinding,
        paymentId: 'offline-payment-v4-001',
        payer: 'synthetic-payer',
        requestId: context.paymentRequest.requestId,
        state: 'BUYER_PREPARED_OFFLINE_FAKE',
        submissionOutcome: 'NOT_ATTEMPTED',
      };
    },
    async validateFacilitator(context) {
      return {
        executionBinding: context.executionBinding,
        facilitatorValidationVersion: 4,
        paymentId: context.preparedPayment.paymentId,
        payer: context.preparedPayment.payer,
        state: 'VALIDATED_NO_SUBMISSION',
        submissionOutcome: 'NOT_ATTEMPTED',
      };
    },
  };
}

async function crashAfter(operation) {
  const options = input();
  const artifacts = bindGateBResetEpochWssOnceArtifactsV4(
    options.configurationBytes,
    options.review,
    options.authorization,
  );
  const journal = createGateBResetEpochWssOnceJournalV4({
    ...options,
    testHooks: {
      afterCommit(name) {
        if (name === operation) process.kill(process.pid, 'SIGKILL');
      },
    },
  });
  const runner = createGateBResetEpochWssOnceRunnerV4({
    authorization: options.authorization,
    configurationBytes: options.configurationBytes,
    journal,
    offlineFakes: fakes(artifacts),
    review: options.review,
  });
  await runner.execute();
  closeGateBResetEpochWssOnceJournalV4(journal);
  process.exitCode = 96;
}

function probeOpen() {
  const options = input();
  try {
    const journal = openGateBResetEpochWssOnceJournalV4(options);
    closeGateBResetEpochWssOnceJournalV4(journal);
    process.stdout.write('OPENED');
  } catch (error) {
    process.stdout.write(error?.code === OWNER_BUSY ? 'OWNER_BUSY' : 'FAILED');
  }
}

const mode = process.argv[2];
try {
  if (mode === 'crash-after-arm') {
    await crashAfter('armPreparation');
  } else if (mode === 'crash-after-payment') {
    await crashAfter('recordPreparedPayment');
  } else if (mode === 'probe-open') {
    probeOpen();
  } else {
    process.exitCode = 95;
  }
} catch {
  process.exitCode = 94;
}
