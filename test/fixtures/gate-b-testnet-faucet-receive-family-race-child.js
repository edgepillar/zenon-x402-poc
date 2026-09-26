import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { openGateBTestnetFaucetReceiveState } from
  '../../src/gate-b-testnet-faucet-receive-state.js';
import { PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME } from
  '../../src/zenon/operator-trusted-testnet-profile.js';

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

function waitForRelease() {
  return new Promise((resolve, reject) => {
    const onDisconnect = () => finish(reject);
    const onMessage = message => {
      if (!message || message.ipcVersion !== 1 ||
          message.type !== 'RELEASE_SELECTOR_CREATE') return;
      finish(resolve);
    };
    const finish = completion => {
      process.off('disconnect', onDisconnect);
      process.off('message', onMessage);
      completion();
    };
    process.once('disconnect', onDisconnect);
    process.on('message', onMessage);
  });
}

function resetAuthorization() {
  const address = `z1${'q'.repeat(38)}`;
  return Object.freeze([
    Object.freeze({
      address,
      amount: '1',
      asset: `zts1${'q'.repeat(22)}`,
      blockType: 2,
      confirmationMomentumHash: 'c'.repeat(64),
      confirmationMomentumHeight: 1,
      confirmationMomentumTimestamp: 1,
      hash: 'a'.repeat(64),
    }),
    Object.freeze({
      address,
      amount: '1',
      asset: `zts1${'p'.repeat(22)}`,
      blockType: 2,
      confirmationMomentumHash: 'c'.repeat(64),
      confirmationMomentumHeight: 1,
      confirmationMomentumTimestamp: 1,
      hash: 'b'.repeat(64),
    }),
  ]);
}

async function run(input) {
  if (!input || input.ipcVersion !== 1 || typeof input.walletRoot !== 'string' ||
      !FAMILIES.has(input.family)) fail();
  const family = input.family;
  try {
    const state = await openGateBTestnetFaucetReceiveState(
      input.walletRoot,
      {
        aclInspector: async () => true,
        async onSelectorBoundary(name) {
          if (name === 'before-exclusive-create') {
            await send({ family, ipcVersion: 1, type: 'BEFORE_SELECTOR_CREATE' });
            await waitForRelease();
          }
          return true;
        },
        platform: 'darwin',
      },
      family === 'reset'
        ? PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME
        : undefined,
    );
    try {
      await state.arm(family === 'reset' ? resetAuthorization() : undefined);
      await writeFile(
        join(input.walletRoot, `.synthetic-wallet-effect-${family}`),
        '',
        { flag: 'wx', mode: 0o600 },
      );
    } finally {
      await state.close();
    }
    await send({ family, ipcVersion: 1, status: 'winner', type: 'RESULT' });
  } catch {
    await send({ family, ipcVersion: 1, status: 'loser', type: 'RESULT' });
  }
}

process.once('message', input => {
  run(input).then(
    () => process.disconnect(),
    () => process.exitCode = 1,
  );
});
