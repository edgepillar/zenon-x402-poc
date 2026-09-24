import assert from 'node:assert/strict';
import test from 'node:test';
import * as sdk from 'znn-typescript-sdk';
import { ExactZenonClient } from '../src/zenon-payment.js';
import {
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_CHAIN_PROFILE,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROVENANCE,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT,
  selectPublicTestnetDynamicPlasmaEpochPolicy,
} from '../src/zenon/operator-trusted-testnet-profile.js';

const PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: '7'.repeat(64),
});
const ENVIRONMENT = Object.freeze({
  ZENON_LIVE_ACK: 'I_UNDERSTAND_TESTNET_ONLY',
  ZENON_NETWORK_ID: '3',
  ZENON_RPC_URL: 'ws://rpc.invalid',
});

function requirement(profile = PROFILE) {
  const recipient = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 18));
  try {
    return {
      scheme: 'exact',
      network: 'zenon:testnet',
      asset: sdk.ZNN_ZTS.toString(),
      amount: '1',
      payTo: recipient.getAddress().toString(),
      maxTimeoutSeconds: 1,
      extra: {
        paymentFlow: 'upfront',
        poc: true,
        settlement: 'account-block',
        zenonChain: { ...profile },
      },
    };
  } finally {
    recipient.clear();
  }
}

function challenge(accepted) {
  return {
    x402Version: 2,
    resource: {
      url: 'https://resource.example/paid',
      description: 'Synthetic Dynamic Plasma compatibility fixture',
      mimeType: 'application/json',
    },
    accepts: [accepted],
  };
}

function momentum(label, {
  height = 50,
  version = 2,
  chainIdentifier = Number(PROFILE.chainIdentifier),
  nextFusionPrice = 1000,
  nextWorkPrice = 1000,
} = {}) {
  const hash = sdk.Hash.digest(Buffer.from(`synthetic-${label}`)).toString();
  return {
    version,
    chainIdentifier,
    hash,
    previousHash: sdk.Hash.digest(Buffer.from(`synthetic-${label}-previous`)).toString(),
    height,
    timestamp: 1,
    data: '',
    content: [],
    changesHash: sdk.Hash.digest(Buffer.from(`synthetic-${label}-changes`)).toString(),
    publicKey: '',
    signature: '',
    nextFusionPrice,
    nextWorkPrice,
    producer: requirement().payTo,
  };
}

function installSyntheticRpc(t) {
  const zenon = sdk.Zenon.getInstance();
  const original = {
    initialize: zenon.initialize,
    prepareBlock: zenon.prepareBlock,
    getFrontierMomentum: zenon.ledger.getFrontierMomentum,
    clearConnection: zenon.clearConnection,
    fromMnemonic: sdk.KeyStore.fromMnemonic,
    sign: sdk.KeyPair.prototype.sign,
    client: zenon.client,
    hadClient: Object.hasOwn(zenon, 'client'),
    chainIdentifier: sdk.Zenon.getChainIdentifier(),
    networkId: sdk.Zenon.getNetworkID(),
    powProvider: sdk.Zenon.getPowProvider(),
  };
  const state = {
    scenario: null,
    keyByte: 40,
    counters: null,
    prepared: null,
    sdkFrontierCalls: 0,
  };

  const reset = scenario => {
    state.scenario = scenario;
    state.counters = {
      frontier: 0,
      heightTwo: 0,
      plasma: 0,
      prepare: 0,
      sign: 0,
      pow: 0,
      publish: 0,
    };
    state.prepared = null;
    state.sdkFrontierCalls = 0;
  };

  const client = Object.freeze({
    async sendRequest(method) {
      if (method === 'stats.networkInfo') {
        return {
          numPeers: 1,
          self: { publicKey: 'synthetic-node-key', ip: 'loopback' },
          peers: [],
        };
      }
      if (method === 'stats.syncInfo') {
        return { state: sdk.SyncState.SyncDone, currentHeight: 50, targetHeight: 50 };
      }
      if (method === 'ledger.getFrontierMomentum') {
        state.counters.frontier += 1;
        return state.scenario.frontier(state.counters.frontier);
      }
      if (method === 'ledger.getFrontierAccountBlock') return null;
      if (method === 'embedded.plasma.getRequiredPoWForAccountBlock') {
        state.counters.plasma += 1;
        const observation = typeof state.scenario.plasma === 'function'
          ? state.scenario.plasma(state.counters.plasma)
          : state.scenario.plasma;
        return { ...observation };
      }
      if (method === 'ledger.getMomentumsByHeight') {
        state.counters.heightTwo += 1;
        return {
          count: state.scenario.momentumCount,
          list: [{ ...state.scenario.heightTwo }],
        };
      }
      if (method === 'ledger.publishRawTransaction') {
        state.counters.publish += 1;
        return null;
      }
      throw new Error('Unexpected synthetic RPC method');
    },
  });

  zenon.initialize = async () => {
    zenon.client = client;
    zenon._setClient(client);
  };
  zenon.clearConnection = () => {
    zenon.client = undefined;
  };
  zenon.ledger.getFrontierMomentum = async function observedFrontierMomentum(...args) {
    const frontier = await original.getFrontierMomentum.apply(this, args);
    state.sdkFrontierCalls += 1;
    if (state.sdkFrontierCalls === 1 && state.scenario.readinessFrontierTransform) {
      return state.scenario.readinessFrontierTransform(frontier);
    }
    return frontier;
  };
  zenon.prepareBlock = async function observedPrepare(block, keyPair) {
    state.counters.prepare += 1;
    const prepared = await original.prepareBlock.call(this, block, keyPair);
    state.prepared = {
      fusedPlasma: prepared.fusedPlasma,
      difficulty: prepared.difficulty,
    };
    return prepared;
  };
  sdk.KeyStore.fromMnemonic = () => ({
    getKeyPair() {
      state.keyByte += 1;
      return sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, state.keyByte));
    },
  });
  sdk.KeyPair.prototype.sign = function observedSign(...args) {
    state.counters.sign += 1;
    return original.sign.apply(this, args);
  };
  sdk.Zenon.setPowProvider(async () => {
    state.counters.pow += 1;
    return '0000000000000001';
  });

  t.after(() => {
    zenon.initialize = original.initialize;
    zenon.prepareBlock = original.prepareBlock;
    zenon.ledger.getFrontierMomentum = original.getFrontierMomentum;
    zenon.clearConnection = original.clearConnection;
    sdk.KeyStore.fromMnemonic = original.fromMnemonic;
    sdk.KeyPair.prototype.sign = original.sign;
    sdk.Zenon.setChainID(original.chainIdentifier);
    sdk.Zenon.setNetworkID(original.networkId);
    if (original.powProvider === undefined) sdk.Zenon.clearPowProvider();
    else sdk.Zenon.setPowProvider(original.powProvider);
    if (original.hadClient) {
      zenon.client = original.client;
      zenon._setClient(original.client);
    } else {
      delete zenon.client;
    }
  });

  return { reset, state };
}

async function createPayment({
  profile = PROFILE,
  operatorTrustedChainPolicy,
  rpcUrl,
} = {}) {
  const accepted = requirement(profile);
  const required = challenge(accepted);
  const options = {
    mnemonic: 'synthetic-offline-placeholder',
    environment: ENVIRONMENT,
    rpcTimeoutMs: 100,
  };
  if (operatorTrustedChainPolicy === undefined) {
    options.authenticateChainProfile = async () => ({ ...profile });
  } else {
    options.operatorTrustedChainPolicy = operatorTrustedChainPolicy;
    options.rpcUrl = rpcUrl;
  }
  const client = new ExactZenonClient(options);
  return client.createPaymentPayload(required, accepted);
}

async function guardRejection(run = () => createPayment()) {
  let payloadReturned = false;
  const outcome = await run().then(
    () => {
      payloadReturned = true;
      return { status: 'fulfilled' };
    },
    error => ({ status: 'rejected', code: error?.code }),
  );
  assert.deepEqual(outcome, {
    status: 'rejected',
    code: 'dynamic_plasma_compatibility_guard_failed',
  });
  assert.equal(payloadReturned, false);
}

function dynamicPlasmaEpochPolicy() {
  return selectPublicTestnetDynamicPlasmaEpochPolicy({
    profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME,
    eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_EVENT_ID,
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT,
    operatorTrustAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    liveAcknowledgement: ENVIRONMENT.ZENON_LIVE_ACK,
    wssAcknowledgement: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ACKNOWLEDGEMENT,
  });
}

test('active buyer fails closed around SDK 1.0.5 Dynamic Plasma pricing', async t => {
  const fixture = installSyntheticRpc(t);

  await t.test('current base prices preserve the legacy signed-composite result', async () => {
    const stable = momentum('base-price');
    fixture.reset({
      frontier: () => stable,
      plasma: { availablePlasma: 21000, basePlasma: 21000, requiredDifficulty: 0 },
    });

    const outcome = await createPayment().then(
      payload => ({
        status: 'fulfilled',
        fusedPlasma: payload.payload.transaction.fusedPlasma,
        difficulty: payload.payload.transaction.difficulty,
      }),
      error => ({ status: 'rejected', code: error?.code }),
    );

    assert.deepEqual(outcome, {
      status: 'fulfilled',
      fusedPlasma: 21000,
      difficulty: 0,
    });
    assert.deepEqual(fixture.state.prepared, { fusedPlasma: 21000, difficulty: 0 });
    assert.equal(fixture.state.counters.frontier, 4);
    assert.equal(fixture.state.counters.plasma, 2);
    assert.equal(fixture.state.counters.prepare, 1);
    assert.equal(fixture.state.counters.sign, 1);
    assert.equal(fixture.state.counters.publish, 0);
  });

  await t.test('elevated fusion-only price rejects the SDK basePlasma signature', async () => {
    const priced = momentum('elevated-fusion', { nextFusionPrice: 1200 });
    fixture.reset({
      frontier: () => priced,
      plasma: { availablePlasma: 25200, basePlasma: 21000, requiredDifficulty: 0 },
    });

    let payloadReturned = false;
    const outcome = await createPayment().then(
      () => {
        payloadReturned = true;
        return { status: 'fulfilled' };
      },
      error => ({ status: 'rejected', code: error?.code }),
    );

    assert.deepEqual(fixture.state.prepared, { fusedPlasma: 21000, difficulty: 0 });
    assert.deepEqual(outcome, {
      status: 'rejected',
      code: 'dynamic_plasma_compatibility_guard_failed',
    });
    assert.equal(payloadReturned, false);
    assert.equal(fixture.state.counters.frontier, 4);
    assert.equal(fixture.state.counters.plasma, 2);
    assert.equal(fixture.state.counters.prepare, 1);
    assert.equal(fixture.state.counters.sign, 1);
    assert.equal(fixture.state.counters.publish, 0);
  });

  await t.test('partial fusion and node-priced PoW remain compatible', async () => {
    const priced = momentum('partial-fusion', {
      nextFusionPrice: 1200,
      nextWorkPrice: 1100,
    });
    fixture.reset({
      frontier: () => priced,
      plasma: {
        availablePlasma: 10000,
        basePlasma: 21000,
        requiredDifficulty: 20901000,
      },
    });

    const originalLog = console.log;
    console.log = () => {};
    let outcome;
    try {
      outcome = await createPayment().then(
        payload => ({
          status: 'fulfilled',
          fusedPlasma: payload.payload.transaction.fusedPlasma,
          difficulty: payload.payload.transaction.difficulty,
        }),
        error => ({ status: 'rejected', code: error?.code }),
      );
    } finally {
      console.log = originalLog;
    }

    assert.deepEqual(outcome, {
      status: 'fulfilled',
      fusedPlasma: 10000,
      difficulty: 20901000,
    });
    assert.deepEqual(fixture.state.prepared, {
      fusedPlasma: 10000,
      difficulty: 20901000,
    });
    assert.equal(fixture.state.counters.frontier, 4);
    assert.equal(fixture.state.counters.plasma, 2);
    assert.equal(fixture.state.counters.pow, 1);
    assert.equal(fixture.state.counters.prepare, 1);
    assert.equal(fixture.state.counters.sign, 1);
    assert.equal(fixture.state.counters.publish, 0);
  });

  await t.test('missing or malformed readiness versions fail closed', async t => {
    const cases = [
      {
        name: 'missing own version field',
        transform(frontier) {
          delete frontier.version;
          return frontier;
        },
      },
      {
        name: 'accessor version field',
        transform(frontier) {
          Object.defineProperty(frontier, 'version', {
            enumerable: true,
            configurable: true,
            get: () => 2,
          });
          return frontier;
        },
      },
    ];
    for (const entry of cases) {
      await t.test(entry.name, async () => {
        const stable = momentum(`readiness-${entry.name}`);
        fixture.reset({
          frontier: () => stable,
          plasma: { availablePlasma: 21000, basePlasma: 21000, requiredDifficulty: 0 },
          readinessFrontierTransform: entry.transform,
        });

        await guardRejection();

        assert.equal(fixture.state.counters.frontier, 2);
        assert.equal(fixture.state.counters.plasma, 1);
        assert.equal(fixture.state.counters.prepare, 1);
        assert.equal(fixture.state.counters.sign, 1);
        assert.equal(fixture.state.counters.publish, 0);
      });
    }
  });

  await t.test('missing or malformed raw prices and quotes fail closed', async t => {
    const validQuote = Object.freeze({
      availablePlasma: 21000,
      basePlasma: 21000,
      requiredDifficulty: 0,
    });
    const cases = [
      {
        name: 'missing raw fusion price',
        raw(frontier) {
          delete frontier.nextFusionPrice;
        },
      },
      {
        name: 'malformed raw work price',
        raw(frontier) {
          frontier.nextWorkPrice = '1000';
        },
      },
      {
        name: 'missing quote base plasma',
        quote: { availablePlasma: 21000, requiredDifficulty: 0 },
      },
      {
        name: 'malformed quote available plasma',
        quote: { availablePlasma: '21000', basePlasma: 21000, requiredDifficulty: 0 },
      },
    ];
    for (const entry of cases) {
      await t.test(entry.name, async () => {
        const stable = momentum(`malformed-${entry.name}`);
        const guardFrontier = { ...stable };
        entry.raw?.(guardFrontier);
        fixture.reset({
          frontier: call => call <= 2 ? stable : guardFrontier,
          plasma: call => call === 1 ? validQuote : (entry.quote ?? validQuote),
        });

        await guardRejection();

        assert.equal(fixture.state.counters.frontier, 4);
        assert.equal(fixture.state.counters.plasma, 2);
        assert.equal(fixture.state.counters.prepare, 1);
        assert.equal(fixture.state.counters.sign, 1);
        assert.equal(fixture.state.counters.publish, 0);
      });
    }
  });

  await t.test('unsupported readiness version returns no buyer payload', async () => {
    const stable = momentum('unsupported-readiness-version');
    fixture.reset({
      frontier: () => stable,
      plasma: { availablePlasma: 21000, basePlasma: 21000, requiredDifficulty: 0 },
      readinessFrontierTransform(frontier) {
        frontier.version = 3;
        return frontier;
      },
    });

    await guardRejection();

    assert.equal(fixture.state.counters.frontier, 2);
    assert.equal(fixture.state.counters.plasma, 1);
    assert.equal(fixture.state.counters.prepare, 1);
    assert.equal(fixture.state.counters.sign, 1);
    assert.equal(fixture.state.counters.publish, 0);
  });

  await t.test('frontier drift after signing returns no buyer payload', async () => {
    const before = momentum('stable-before');
    const after = momentum('drifted-after', { height: 51 });
    fixture.reset({
      frontier: call => call < 4 ? before : after,
      plasma: { availablePlasma: 21000, basePlasma: 21000, requiredDifficulty: 0 },
    });

    let payloadReturned = false;
    const outcome = await createPayment().then(
      () => {
        payloadReturned = true;
        return { status: 'fulfilled' };
      },
      error => ({ status: 'rejected', code: error?.code }),
    );

    assert.deepEqual(outcome, {
      status: 'rejected',
      code: 'dynamic_plasma_compatibility_guard_failed',
    });
    assert.equal(payloadReturned, false);
    assert.equal(fixture.state.counters.frontier, 4);
    assert.equal(fixture.state.counters.plasma, 2);
    assert.equal(fixture.state.counters.prepare, 1);
    assert.equal(fixture.state.counters.sign, 1);
    assert.equal(fixture.state.counters.publish, 0);
  });

  await t.test('the public DP epoch rejects v1 at and after its enforcement height', async t => {
    const policy = dynamicPlasmaEpochPolicy();
    const profile = PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_CHAIN_PROFILE;
    const chainIdentifier = Number(profile.chainIdentifier);
    const enforcementHeight =
      PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROVENANCE.dynamicPlasmaEnforcementHeight;
    const heightTwo = {
      ...momentum('epoch-height-two', { height: 2, version: 1, chainIdentifier }),
      hash: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROVENANCE.observationHash,
      previousHash: profile.genesisMomentumHash,
    };
    const resetEpoch = height => {
      const legacy = momentum(`epoch-v1-${height}`, {
        height,
        version: 1,
        chainIdentifier,
        nextFusionPrice: 0,
        nextWorkPrice: 0,
      });
      fixture.reset({
        frontier: () => legacy,
        plasma: { availablePlasma: 21000, basePlasma: 21000, requiredDifficulty: 0 },
        heightTwo,
        momentumCount: height,
      });
    };
    const pay = () => createPayment({
      profile,
      operatorTrustedChainPolicy: policy,
      rpcUrl: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT,
    });

    await t.test('the immediately preceding v1 Momentum remains compatible', async () => {
      resetEpoch(enforcementHeight - 1);
      const payload = await pay();

      assert.equal(
        payload.payload.transaction.momentumAcknowledged.height,
        enforcementHeight - 1,
      );
      assert.equal(fixture.state.counters.prepare, 1);
      assert.equal(fixture.state.counters.sign, 1);
      assert.equal(fixture.state.counters.publish, 0);
    });

    await t.test('v1 at the enforcement height fails closed', async () => {
      resetEpoch(enforcementHeight);

      await guardRejection(pay);

      assert.equal(fixture.state.counters.frontier, 2);
      assert.equal(fixture.state.counters.heightTwo, 1);
      assert.equal(fixture.state.counters.plasma, 1);
      assert.equal(fixture.state.counters.prepare, 1);
      assert.equal(fixture.state.counters.sign, 1);
      assert.equal(fixture.state.counters.publish, 0);
    });

    await t.test('v1 above the enforcement height fails closed', async () => {
      resetEpoch(enforcementHeight + 1);

      await guardRejection(pay);

      assert.equal(fixture.state.counters.frontier, 2);
      assert.equal(fixture.state.counters.heightTwo, 1);
      assert.equal(fixture.state.counters.plasma, 1);
      assert.equal(fixture.state.counters.prepare, 1);
      assert.equal(fixture.state.counters.sign, 1);
      assert.equal(fixture.state.counters.publish, 0);
    });
  });
});
