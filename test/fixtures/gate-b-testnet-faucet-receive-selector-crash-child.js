import { openGateBTestnetFaucetReceiveState } from
  '../../src/gate-b-testnet-faucet-receive-state.js';
import { PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME } from
  '../../src/zenon/operator-trusted-testnet-profile.js';

const BOUNDARIES = new Set([
  'exclusive-created',
  'record-written',
  'file-synced',
  'parent-synced',
]);
const FAMILIES = new Set(['legacy', 'reset']);

function fail() {
  throw new Error('fixture_failed');
}

async function send(message) {
  if (typeof process.send !== 'function') fail();
  await new Promise((resolve, reject) => {
    process.send(message, error => error ? reject(error) : resolve());
  });
}

async function run(input) {
  if (!input || input.ipcVersion !== 1 || !BOUNDARIES.has(input.boundary) ||
      !FAMILIES.has(input.family) || typeof input.walletRoot !== 'string') fail();
  const state = await openGateBTestnetFaucetReceiveState(
    input.walletRoot,
    {
      aclInspector: async () => true,
      async onSelectorBoundary(boundary) {
        if (boundary !== input.boundary) return true;
        await send({ boundary, ipcVersion: 1, type: 'BOUNDARY' });
        setInterval(() => {}, 1000);
        await new Promise(() => {});
        return true;
      },
      platform: 'darwin',
    },
    input.family === 'reset'
      ? PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME
      : undefined,
  );
  await state.close();
  fail();
}

process.once('message', input => {
  run(input).catch(() => process.exitCode = 1);
});
