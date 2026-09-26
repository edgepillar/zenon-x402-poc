import {
  startDefaultLiveEvidenceFacilitatorRuntime,
} from '../../src/live-evidence-facilitator-worker.js';
import { ExactZenonFacilitator } from '../../src/zenon-payment.js';
import {
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
} from '../../src/zenon/operator-trusted-testnet-profile.js';

async function sendResult(type) {
  await new Promise(resolve => process.send({ type }, resolve));
  process.disconnect();
}

process.once('message', async message => {
  try {
    const runtime = await startDefaultLiveEvidenceFacilitatorRuntime(message, {
      async probeResetEpochPaymentReadiness() {},
      createFacilitator(options) {
        const facilitator = new ExactZenonFacilitator(options);
        if (facilitator.rpcUrl !==
            PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT) {
          throw new Error('reset endpoint was not bound');
        }
        return facilitator;
      },
      createServer() {
        return {
          async listen() {},
          async close() {},
        };
      },
      runtimePoisoned() {
        return false;
      },
    });
    await runtime.stop({ final: false });
    await sendResult('BOUND');
  } catch {
    await sendResult('FAILED');
  }
});
