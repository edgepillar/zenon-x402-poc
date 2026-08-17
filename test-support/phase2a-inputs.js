export const PHASE2A_RPC_URL = 'ws://rpc.invalid';
export const PHASE2A_NETWORK_ID = 3;
export const PHASE2A_CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: '7'.repeat(64),
});
export const PHASE2A_RESOURCE = Object.freeze({
  url: 'https://resource.example/paid',
  description: 'Phase 2A deterministic paid resource',
  mimeType: 'application/json',
});
export const PHASE2A_POW_NONCE = '0102030405060708';
export const PHASE2A_MAX_AMOUNT = ((1n << 255n) - 1n).toString();

export const PHASE2A_SCENARIO_SPECS = Object.freeze({
  A: Object.freeze({
    id: 'A',
    accountIndex: 0,
    asset: 'ZNN',
    amount: '1',
    frontierHeight: null,
    readinessMomentumHeight: 100,
    momentumHeight: 101,
    plasma: Object.freeze({ requiredDifficulty: 0, basePlasma: 21000 }),
  }),
  B: Object.freeze({
    id: 'B',
    accountIndex: 1,
    asset: 'CUSTOM',
    amount: PHASE2A_MAX_AMOUNT,
    frontierHeight: 41,
    readinessMomentumHeight: 72,
    momentumHeight: 73,
    plasma: Object.freeze({ requiredDifficulty: 0, basePlasma: 43210 }),
  }),
  C: Object.freeze({
    id: 'C',
    accountIndex: 2,
    asset: 'QSR',
    amount: '424242',
    frontierHeight: 12,
    readinessMomentumHeight: 87,
    momentumHeight: 88,
    plasma: Object.freeze({ requiredDifficulty: 17, availablePlasma: 123456 }),
  }),
});

/**
 * Build deterministic public test inputs for the Phase 2A characterization
 * matrix. Secret setup material exists only for the duration of this call.
 */
export async function buildPhase2AInputs() {
  const sdk = await import('znn-typescript-sdk');
  // Public synthetic fixture material that is effectively private derivation
  // input. It must never be funded or printed by a test failure.
  const entropy = Buffer.alloc(32, 0x42);
  const setupPairs = new Set();
  let keyStore;
  let result;
  let cleanupError;

  try {
    keyStore = keyStoreFromEntropyWithPairCapture(sdk, entropy.toString('hex'), setupPairs);

    const recipientPair = trackPair(setupPairs, keyStore.getKeyPair(3));
    const recipientAddress = recipientPair.getAddress().toString();
    const customTokenStandard = sdk.TokenStandard.fromCore(Buffer.alloc(10, 0x42));

    const scenarios = {};
    for (const spec of Object.values(PHASE2A_SCENARIO_SPECS)) {
      const tokenStandard = tokenStandardFor(spec.asset, sdk, customTokenStandard);
      const frontierAccountBlock = spec.frontierHeight === null
        ? null
        : {
            height: spec.frontierHeight,
            hash: deterministicHash(sdk, `scenario-${spec.id}-account-frontier`),
          };
      const frontierMomentum = {
        chainIdentifier: Number(PHASE2A_CHAIN_PROFILE.chainIdentifier),
        height: spec.momentumHeight,
        hash: deterministicHash(sdk, `scenario-${spec.id}-momentum-frontier`),
      };
      const readinessMomentum = {
        chainIdentifier: Number(PHASE2A_CHAIN_PROFILE.chainIdentifier),
        height: spec.readinessMomentumHeight,
        hash: deterministicHash(sdk, `scenario-${spec.id}-readiness-momentum`),
      };
      const accepted = makeAccepted({
        asset: tokenStandard.toString(),
        amount: spec.amount,
        payTo: recipientAddress,
      });
      const paymentRequired = {
        x402Version: 2,
        resource: { ...PHASE2A_RESOURCE },
        accepts: [accepted],
      };
      const plasmaResponse = { ...spec.plasma };

      scenarios[spec.id] = {
        id: spec.id,
        accountIndex: spec.accountIndex,
        recipientAddress,
        tokenStandard,
        ...(spec.asset === 'CUSTOM'
          ? { assetRecord: { tokenStandard: customTokenStandard } }
          : {}),
        accepted,
        paymentRequired,
        frontierAccountBlock,
        frontierMomentum,
        readiness: makeReadiness(sdk, readinessMomentum),
        plasmaResponse,
        powNonce: spec.plasma.requiredDifficulty === 0
          ? '0000000000000000'
          : PHASE2A_POW_NONCE,
      };
    }

    result = {
      rpcUrl: PHASE2A_RPC_URL,
      networkId: PHASE2A_NETWORK_ID,
      chainProfile: { ...PHASE2A_CHAIN_PROFILE },
      resource: { ...PHASE2A_RESOURCE },
      scenarios,
    };
  } finally {
    for (const pair of [...setupPairs].reverse()) {
      try {
        pair.clear();
      } catch (error) {
        cleanupError ??= error;
      }
    }
    setupPairs.clear();
    if (keyStore) {
      // These SDK fields are strings and cannot be zeroized. Drop this fixture's
      // references before returning; no KeyStore or mnemonic crosses the API.
      keyStore.mnemonic = '';
      keyStore.entropy = '';
      keyStore.seed = '';
    }
    entropy.fill(0);
    if (cleanupError) {
      throw new Error('Phase 2A fixture key cleanup failed');
    }
  }

  return result;
}

/**
 * Supply the explicitly public synthetic fixture mnemonic without returning or
 * recording it. The entropy and setup KeyStore exist only around the callback.
 */
export async function withPhase2AFixtureMnemonic(run) {
  if (typeof run !== 'function') throw new TypeError('Phase 2A mnemonic consumer must be a function');
  const sdk = await import('znn-typescript-sdk');
  // The same public, never-funded derivation input used to characterize the
  // unchanged ExactZenonClient path.
  const entropy = Buffer.alloc(32, 0x42);
  const setupPairs = new Set();
  let keyStore;
  let result;
  let workError;
  let cleanupError;

  try {
    keyStore = keyStoreFromEntropyWithPairCapture(sdk, entropy.toString('hex'), setupPairs);
    result = await run(keyStore.mnemonic);
  } catch (error) {
    workError = error;
  } finally {
    for (const pair of [...setupPairs].reverse()) {
      try {
        pair.clear();
      } catch (error) {
        cleanupError ??= error;
      }
    }
    setupPairs.clear();
    if (keyStore) {
      keyStore.mnemonic = '';
      keyStore.entropy = '';
      keyStore.seed = '';
    }
    entropy.fill(0);
  }

  if (cleanupError) throw new Error('Phase 2A fixture key cleanup failed');
  if (workError) throw workError;
  return result;
}

function keyStoreFromEntropyWithPairCapture(sdk, entropyHex, setupPairs) {
  const prototype = sdk.KeyStore.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'getKeyPair');
  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new Error('Unsupported SDK KeyStore.getKeyPair descriptor');
  }

  Object.defineProperty(prototype, 'getKeyPair', {
    ...descriptor,
    value: function capturedGetKeyPair(index) {
      return trackPair(setupPairs, descriptor.value.call(this, index));
    },
  });
  try {
    return sdk.KeyStore.fromEntropy(entropyHex);
  } finally {
    Object.defineProperty(prototype, 'getKeyPair', descriptor);
  }
}

function trackPair(setupPairs, pair) {
  if (!pair || typeof pair.clear !== 'function') {
    throw new Error('SDK did not return a clearable setup key pair');
  }
  setupPairs.add(pair);
  return pair;
}

function tokenStandardFor(asset, sdk, customTokenStandard) {
  if (asset === 'ZNN') return sdk.ZNN_ZTS;
  if (asset === 'QSR') return sdk.QSR_ZTS;
  return customTokenStandard;
}

function deterministicHash(sdk, label) {
  return sdk.Hash.digest(Buffer.from(`phase2a:${label}`, 'utf8'));
}

function makeAccepted({ asset, amount, payTo }) {
  return {
    scheme: 'exact',
    network: 'zenon:testnet',
    asset,
    amount,
    payTo,
    maxTimeoutSeconds: 30,
    extra: {
      poc: true,
      settlement: 'account-block',
      zenonChain: { ...PHASE2A_CHAIN_PROFILE },
    },
  };
}

function makeReadiness(sdk, frontierMomentum) {
  return {
    networkInfo: {
      numPeers: 1,
      self: { publicKey: 'phase2a-node-public-key', ip: '192.0.2.7' },
      peers: [],
    },
    syncInfo: {
      state: sdk.SyncState.SyncDone,
      currentHeight: frontierMomentum.height,
      targetHeight: frontierMomentum.height,
    },
    frontierMomentum,
    authenticatedProfile: { ...PHASE2A_CHAIN_PROFILE },
  };
}
