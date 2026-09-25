import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as sdk from 'znn-typescript-sdk';
import {
  ExactZenonClient,
  ExactZenonFacilitator,
  preflightZenonPayment,
  probeResetEpochPaymentReadiness,
} from '../src/zenon-payment.js';
import {
  DELIVERY_STATES,
  EVIDENCE_STATES,
  SettlementJournal,
} from '../src/settlement-journal.js';
import {
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_CHAIN_PROFILE,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROVENANCE,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROVENANCE,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
  selectPublicTestnetDynamicPlasmaEpochPolicy,
  selectPublicTestnetDynamicPlasmaResetEpochExecutionPolicy,
  selectPublicTestnetDynamicPlasmaResetEpochPolicy,
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

function accountInfo(address) {
  const token = new sdk.Token(
    'Synthetic',
    'SYN',
    '',
    1n,
    8,
    address,
    sdk.ZNN_ZTS,
    1n,
    false,
    false,
    false,
  );
  return new sdk.AccountInfo(address, 0, {
    [sdk.ZNN_ZTS.toString()]: new sdk.BalanceInfoListItem(token, 1n),
  });
}

function syntheticPayer(privateKeyByte) {
  const keyPair = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, privateKeyByte));
  try {
    return keyPair.getAddress().toString();
  } finally {
    keyPair.clear();
  }
}

function observedPaymentBlock(transaction, {
  included = false,
  numConfirmations = 1,
  momentumHeight = transaction.momentumAcknowledged.height + 1,
  momentumHash = sdk.Hash.digest(Buffer.from('synthetic-reset-recovery-inclusion')),
  momentumTimestamp = 1,
} = {}) {
  const block = sdk.AccountBlockTemplate.fromJson(transaction);
  block.publicKey = Buffer.from(transaction.publicKey, 'base64');
  block.signature = Buffer.from(transaction.signature, 'base64');
  if (included) {
    block.confirmationDetail = {
      numConfirmations,
      momentumHeight,
      momentumHash,
      momentumTimestamp,
    };
  }
  return block;
}

async function settlementJournal(t) {
  const root = await mkdtemp(join(tmpdir(), 'dynamic-plasma-reset-recovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return new SettlementJournal({
    directory: join(root, 'journal'),
    allowedRoot: root,
  });
}

async function persistPayment(journal, payload, accepted, required, evidenceState) {
  const preflight = await preflightZenonPayment(payload, accepted, required);
  await journal.putValidated({
    authorizationKey: preflight.authorizationKey,
    transactionHash: preflight.transactionHash,
    chainProfile: preflight.chainProfile,
    intentDigest: preflight.intentDigest,
    resourceIdentity: preflight.resourceIdentity,
    resourceDigest: preflight.resourceDigest,
    payer: preflight.payer,
    signedAccountBlock: preflight.signedAccountBlock,
  });
  if (evidenceState !== EVIDENCE_STATES.VALIDATED) {
    await journal.updateEvidence(
      preflight.authorizationKey,
      preflight.transactionHash,
      evidenceState,
    );
  }
  return preflight;
}

function installSyntheticRpc(t) {
  const zenon = sdk.Zenon.getInstance();
  const original = {
    initialize: zenon.initialize,
    prepareBlock: zenon.prepareBlock,
    getFrontierMomentum: zenon.ledger.getFrontierMomentum,
    getAccountBlockByHash: zenon.ledger.getAccountBlockByHash,
    getAccountInfoByAddress: zenon.ledger.getAccountInfoByAddress,
    getUnconfirmedBlocksByAddress: zenon.ledger.getUnconfirmedBlocksByAddress,
    subscribe: zenon.subscribe,
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
    rpcOperations: [],
    sdkFrontierCalls: 0,
  };

  const reset = scenario => {
    state.scenario = scenario;
    state.counters = {
      frontier: 0,
      heightTwo: 0,
      wallet: 0,
      plasma: 0,
      prepare: 0,
      sign: 0,
      pow: 0,
      publish: 0,
      lookup: 0,
      balance: 0,
      unconfirmed: 0,
      subscribe: 0,
    };
    state.prepared = null;
    state.rpcOperations = [];
    state.sdkFrontierCalls = 0;
  };

  const client = Object.freeze({
    async sendRequest(method) {
      state.rpcOperations.push(method);
      if (method === 'stats.networkInfo') {
        return {
          numPeers: 1,
          self: { publicKey: 'synthetic-node-key', ip: 'loopback' },
          peers: [],
        };
      }
      if (method === 'stats.syncInfo') {
        return state.scenario.syncInfo ?? {
          state: sdk.SyncState.SyncDone,
          currentHeight: 50,
          targetHeight: 50,
        };
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
        if (typeof state.scenario.publish === 'function') {
          return state.scenario.publish(state.counters.publish);
        }
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
  zenon.ledger.getAccountBlockByHash = async requestedHash => {
    state.counters.lookup += 1;
    state.rpcOperations.push('ledger.getAccountBlockByHash');
    const observed = typeof state.scenario.observed === 'function'
      ? state.scenario.observed(state.counters.lookup, requestedHash)
      : state.scenario.observed;
    return observed ?? null;
  };
  zenon.ledger.getAccountInfoByAddress = async address => {
    state.counters.balance += 1;
    state.rpcOperations.push('ledger.getAccountInfoByAddress');
    return state.scenario.accountInfo?.(address, state.counters.balance) ??
      accountInfo(address);
  };
  zenon.ledger.getUnconfirmedBlocksByAddress = async () => {
    state.counters.unconfirmed += 1;
    state.rpcOperations.push('ledger.getUnconfirmedBlocksByAddress');
    return { count: 0, list: [] };
  };
  zenon.subscribe = {
    toAccountBlocksByAddress: async () => {
      state.counters.subscribe += 1;
      state.rpcOperations.push('subscribe.toAccountBlocksByAddress');
      return { onNotification() {} };
    },
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
      state.counters.wallet += 1;
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
    zenon.ledger.getAccountBlockByHash = original.getAccountBlockByHash;
    zenon.ledger.getAccountInfoByAddress = original.getAccountInfoByAddress;
    zenon.ledger.getUnconfirmedBlocksByAddress = original.getUnconfirmedBlocksByAddress;
    zenon.subscribe = original.subscribe;
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
  minimumMomentumConfirmations,
  expectedPayer,
} = {}) {
  const accepted = requirement(profile);
  if (minimumMomentumConfirmations !== undefined) {
    accepted.extra.minimumMomentumConfirmations = minimumMomentumConfirmations;
  }
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
  if (expectedPayer !== undefined) options.expectedPayer = expectedPayer;
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

function dynamicPlasmaResetEpochExecutionPolicy() {
  return selectPublicTestnetDynamicPlasmaResetEpochExecutionPolicy({
    profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
    eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
    operatorTrustAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    liveAcknowledgement: ENVIRONMENT.ZENON_LIVE_ACK,
    wssAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
  });
}

function dynamicPlasmaResetEpochOfflinePolicy() {
  return selectPublicTestnetDynamicPlasmaResetEpochPolicy({
    profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
    eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
    evidenceWssEndpoint:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
    operatorTrustAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    liveAcknowledgement: ENVIRONMENT.ZENON_LIVE_ACK,
    wssAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
  });
}

test('active buyer fails closed around SDK 1.0.5 Dynamic Plasma pricing', async t => {
  const fixture = installSyntheticRpc(t);
  const epochProfile = PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_CHAIN_PROFILE;
  const epochPolicy = dynamicPlasmaEpochPolicy();
  const epochChainIdentifier = Number(epochProfile.chainIdentifier);
  const epochEnforcementHeight =
    PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROVENANCE.dynamicPlasmaEnforcementHeight;
  const epochHeightTwo = {
    ...momentum('guarded-v1-epoch-height-two', {
      height: 2,
      version: 1,
      chainIdentifier: epochChainIdentifier,
    }),
    hash: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROVENANCE.observationHash,
    previousHash: epochProfile.genesisMomentumHash,
  };
  const payAtEpoch = () => createPayment({
    profile: epochProfile,
    operatorTrustedChainPolicy: epochPolicy,
    rpcUrl: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT,
  });
  const resetEpochGuard = ({
    frontier,
    height = epochEnforcementHeight,
    syncCurrentHeight = height,
    plasma = { availablePlasma: 21000, basePlasma: 21000, requiredDifficulty: 0 },
  }) => fixture.reset({
    frontier,
    plasma,
    heightTwo: epochHeightTwo,
    momentumCount: height,
    syncInfo: {
      state: sdk.SyncState.SyncDone,
      currentHeight: syncCurrentHeight,
      targetHeight: syncCurrentHeight,
    },
  });

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

        assert.equal(fixture.state.counters.frontier, 1);
        assert.equal(fixture.state.counters.plasma, 0);
        assert.equal(fixture.state.counters.prepare, 0);
        assert.equal(fixture.state.counters.sign, 0);
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
          frontier: call => call === 1 ? stable : guardFrontier,
          plasma: call => call === 1 ? validQuote : (entry.quote ?? validQuote),
        });

        await guardRejection();

        assert.equal(fixture.state.counters.frontier, entry.raw ? 2 : 4);
        assert.equal(fixture.state.counters.plasma, entry.raw ? 0 : 2);
        assert.equal(fixture.state.counters.prepare, entry.raw ? 0 : 1);
        assert.equal(fixture.state.counters.sign, entry.raw ? 0 : 1);
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

    assert.equal(fixture.state.counters.frontier, 1);
    assert.equal(fixture.state.counters.plasma, 0);
    assert.equal(fixture.state.counters.prepare, 0);
    assert.equal(fixture.state.counters.sign, 0);
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

  await t.test('v1 raw prices must be absent together or present as paired zeroes', async t => {
    const cases = [
      {
        name: 'paired zero prices remain compatible',
        compatible: true,
      },
      {
        name: 'paired absent prices remain compatible',
        compatible: true,
        mutate(frontier) {
          delete frontier.nextFusionPrice;
          delete frontier.nextWorkPrice;
        },
      },
      {
        name: 'an unpaired absent price fails closed',
        mutate(frontier) {
          delete frontier.nextFusionPrice;
        },
      },
      {
        name: 'a nonzero v1 price fails closed',
        mutate(frontier) {
          frontier.nextFusionPrice = 1;
        },
      },
      {
        name: 'a malformed v1 price fails closed',
        mutate(frontier) {
          frontier.nextWorkPrice = '0';
        },
      },
    ];

    for (const entry of cases) {
      await t.test(entry.name, async () => {
        const legacy = momentum(`v1-prices-${entry.name}`, {
          height: epochEnforcementHeight,
          version: 1,
          chainIdentifier: epochChainIdentifier,
          nextFusionPrice: 0,
          nextWorkPrice: 0,
        });
        entry.mutate?.(legacy);
        resetEpochGuard({
          frontier: () => legacy,
        });

        if (entry.compatible) {
          const payload = await payAtEpoch();
          assert.equal(payload.payload.transaction.momentumAcknowledged.height, legacy.height);
          assert.equal(fixture.state.counters.frontier, 4);
          assert.equal(fixture.state.counters.heightTwo, 1);
          assert.equal(fixture.state.counters.plasma, 1);
          assert.equal(fixture.state.counters.prepare, 1);
          assert.equal(fixture.state.counters.sign, 1);
        } else {
          await guardRejection(payAtEpoch);
          assert.equal(fixture.state.counters.frontier, 2);
          assert.equal(fixture.state.counters.heightTwo, 1);
          assert.equal(fixture.state.counters.plasma, 0);
          assert.equal(fixture.state.counters.prepare, 0);
          assert.equal(fixture.state.counters.sign, 0);
        }
        assert.equal(fixture.state.counters.publish, 0);
      });
    }
  });

  await t.test('v1 readiness cannot transition to v2 during preparation', async () => {
    const legacy = momentum('v1-readiness', {
      height: epochEnforcementHeight,
      version: 1,
      chainIdentifier: epochChainIdentifier,
      nextFusionPrice: 0,
      nextWorkPrice: 0,
    });
    const active = momentum('v2-preparation', {
      version: 2,
      height: epochEnforcementHeight + 1,
      chainIdentifier: epochChainIdentifier,
    });
    resetEpochGuard({
      frontier: call => call <= 2 ? legacy : active,
    });

    await guardRejection(payAtEpoch);

    assert.equal(fixture.state.counters.frontier, 4);
    assert.equal(fixture.state.counters.heightTwo, 1);
    assert.equal(fixture.state.counters.plasma, 1);
    assert.equal(fixture.state.counters.prepare, 1);
    assert.equal(fixture.state.counters.sign, 1);
    assert.equal(fixture.state.counters.publish, 0);
  });

  await t.test('frontiers below captured sync progress fail closed for both versions', async t => {
    for (const version of [1, 2]) {
      await t.test(`v${version}`, async () => {
        const stale = momentum(`stale-v${version}`, {
          height: version === 1 ? epochEnforcementHeight : 50,
          version,
          chainIdentifier: version === 1
            ? epochChainIdentifier
            : Number(PROFILE.chainIdentifier),
          nextFusionPrice: version === 1 ? 0 : 1000,
          nextWorkPrice: version === 1 ? 0 : 1000,
        });
        if (version === 1) {
          resetEpochGuard({
            frontier: () => stale,
            height: stale.height,
            syncCurrentHeight: stale.height + 1,
          });
        } else {
          fixture.reset({
            frontier: () => stale,
            plasma: { availablePlasma: 21000, basePlasma: 21000, requiredDifficulty: 0 },
            syncInfo: {
              state: sdk.SyncState.SyncDone,
              currentHeight: stale.height + 1,
              targetHeight: stale.height + 1,
            },
          });
        }

        await guardRejection(version === 1 ? payAtEpoch : undefined);

        assert.equal(fixture.state.counters.frontier, 2);
        assert.equal(fixture.state.counters.heightTwo, version === 1 ? 1 : 0);
        assert.equal(fixture.state.counters.plasma, 0);
        assert.equal(fixture.state.counters.prepare, 0);
        assert.equal(fixture.state.counters.sign, 0);
        assert.equal(fixture.state.counters.publish, 0);
      });
    }
  });

  await t.test('the pinned public DP epoch preserves v1 through enforcement and requires v2 above it', async t => {
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
    const resetEpoch = (height, version) => {
      const frontier = momentum(`epoch-v${version}-${height}`, {
        height,
        version,
        chainIdentifier,
        nextFusionPrice: version === 1 ? 0 : 1000,
        nextWorkPrice: version === 1 ? 0 : 1000,
      });
      fixture.reset({
        frontier: () => frontier,
        plasma: { availablePlasma: 21000, basePlasma: 21000, requiredDifficulty: 0 },
        heightTwo,
        momentumCount: height,
        syncInfo: {
          state: sdk.SyncState.SyncDone,
          currentHeight: height,
          targetHeight: height,
        },
      });
    };
    const pay = () => createPayment({
      profile,
      operatorTrustedChainPolicy: policy,
      rpcUrl: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT,
    });

    await t.test('the immediately preceding v1 Momentum remains compatible', async () => {
      resetEpoch(enforcementHeight - 1, 1);
      const payload = await pay();

      assert.equal(
        payload.payload.transaction.momentumAcknowledged.height,
        enforcementHeight - 1,
      );
      assert.equal(fixture.state.counters.prepare, 1);
      assert.equal(fixture.state.counters.sign, 1);
      assert.equal(fixture.state.counters.publish, 0);
    });

    await t.test('v1 at the enforcement height remains compatible', async () => {
      resetEpoch(enforcementHeight, 1);
      const payload = await pay();

      assert.equal(
        payload.payload.transaction.momentumAcknowledged.height,
        enforcementHeight,
      );
      assert.equal(fixture.state.counters.frontier, 4);
      assert.equal(fixture.state.counters.heightTwo, 1);
      assert.equal(fixture.state.counters.plasma, 1);
      assert.equal(fixture.state.counters.prepare, 1);
      assert.equal(fixture.state.counters.sign, 1);
      assert.equal(fixture.state.counters.publish, 0);
    });

    await t.test('v1 above the enforcement height fails closed', async () => {
      resetEpoch(enforcementHeight + 1, 1);

      await guardRejection(pay);

      assert.equal(fixture.state.counters.frontier, 2);
      assert.equal(fixture.state.counters.heightTwo, 1);
      assert.equal(fixture.state.counters.plasma, 0);
      assert.equal(fixture.state.counters.prepare, 0);
      assert.equal(fixture.state.counters.sign, 0);
      assert.equal(fixture.state.counters.publish, 0);
    });

    await t.test('v2 at the enforcement height fails closed', async () => {
      resetEpoch(enforcementHeight, 2);

      await guardRejection(pay);

      assert.equal(fixture.state.counters.frontier, 2);
      assert.equal(fixture.state.counters.heightTwo, 1);
      assert.equal(fixture.state.counters.plasma, 0);
      assert.equal(fixture.state.counters.prepare, 0);
      assert.equal(fixture.state.counters.sign, 0);
      assert.equal(fixture.state.counters.publish, 0);
    });

    await t.test('v2 immediately above the enforcement height remains compatible', async () => {
      resetEpoch(enforcementHeight + 1, 2);
      const payload = await pay();

      assert.equal(
        payload.payload.transaction.momentumAcknowledged.height,
        enforcementHeight + 1,
      );
      assert.equal(fixture.state.counters.frontier, 4);
      assert.equal(fixture.state.counters.heightTwo, 1);
      assert.equal(fixture.state.counters.plasma, 2);
      assert.equal(fixture.state.counters.prepare, 1);
      assert.equal(fixture.state.counters.sign, 1);
      assert.equal(fixture.state.counters.publish, 0);
    });
  });

  await t.test('well-formed non-epoch v1 preserves the legacy RPC ordering', async () => {
    const height =
      PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROVENANCE.dynamicPlasmaEnforcementHeight + 1;
    const legacy = momentum('unrelated-policy-v1', {
      height,
      version: 1,
      nextFusionPrice: 0,
      nextWorkPrice: 0,
    });
    fixture.reset({
      frontier: () => legacy,
      plasma: { availablePlasma: 21000, basePlasma: 21000, requiredDifficulty: 0 },
      syncInfo: {
        state: sdk.SyncState.SyncDone,
        currentHeight: height,
        targetHeight: height,
      },
    });

    const payload = await createPayment();

    assert.equal(payload.payload.transaction.momentumAcknowledged.height, height);
    assert.deepEqual(fixture.state.rpcOperations, [
      'stats.networkInfo',
      'stats.syncInfo',
      'ledger.getFrontierMomentum',
      'ledger.getFrontierAccountBlock',
      'ledger.getFrontierMomentum',
      'embedded.plasma.getRequiredPoWForAccountBlock',
    ]);
    assert.equal(fixture.state.counters.frontier, 2);
    assert.equal(fixture.state.counters.plasma, 1);
    assert.equal(fixture.state.counters.prepare, 1);
    assert.equal(fixture.state.counters.sign, 1);
    assert.equal(fixture.state.counters.publish, 0);
  });
});

test('reset epoch execution policy guards new execution and permits exact recovery', async t => {
  const fixture = installSyntheticRpc(t);
  const profile = PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE;
  const policy = dynamicPlasmaResetEpochExecutionPolicy();
  const chainIdentifier = Number(profile.chainIdentifier);
  const enforcementHeight =
    PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROVENANCE
      .dynamicPlasmaEnforcementHeight;
  const validHeight = enforcementHeight + 1;
  const validHeightTwo = {
    ...momentum('reset-execution-height-two', {
      height: 2,
      version: 1,
      chainIdentifier,
      nextFusionPrice: 0,
      nextWorkPrice: 0,
    }),
    hash:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROVENANCE.observationHash,
    previousHash: profile.genesisMomentumHash,
  };
  const stable = momentum('reset-execution-stable', {
    height: validHeight,
    version: 2,
    chainIdentifier,
    nextFusionPrice: 1000,
    nextWorkPrice: 1000,
  });
  const reset = ({
    frontier = () => stable,
    heightTwo = validHeightTwo,
    plasma = {
      availablePlasma: 21000,
      basePlasma: 21000,
      requiredDifficulty: 0,
    },
    syncCurrentHeight = validHeight,
    observed = null,
    account = undefined,
    publish = undefined,
  } = {}) => fixture.reset({
    frontier,
    heightTwo,
    momentumCount: syncCurrentHeight,
    plasma,
    observed,
    accountInfo: account,
    publish,
    syncInfo: {
      state: sdk.SyncState.SyncDone,
      currentHeight: syncCurrentHeight,
      targetHeight: syncCurrentHeight,
    },
  });
  const pay = options => createPayment({
    profile,
    operatorTrustedChainPolicy: policy,
    rpcUrl: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
    ...options,
  });
  const rejectedWithoutPayload = async (run = pay) => {
    let payloadReturned = false;
    const outcome = await run().then(
      () => {
        payloadReturned = true;
        return { status: 'fulfilled' };
      },
      error => ({ status: 'rejected', code: error?.code }),
    );
    assert.equal(outcome.status, 'rejected');
    assert.equal(payloadReturned, false);
    return outcome.code;
  };

  await t.test('a matching tuple and stable post-enforcement v2 prices return one payload', async () => {
    reset();

    const payload = await pay();

    assert.equal(
      payload.payload.transaction.momentumAcknowledged.height,
      validHeight,
    );
    assert.equal(fixture.state.counters.heightTwo, 1);
    assert.equal(fixture.state.counters.wallet, 1);
    assert.equal(fixture.state.counters.sign, 1);
    assert.equal(fixture.state.counters.publish, 0);
  });

  await t.test('real constructors retain one positive-work signed block after ambiguous publication',
    async t => {
      reset({
        publish() {
          throw new Error('synthetic ambiguous publication');
        },
      });
      const payload = await pay({ minimumMomentumConfirmations: 2 });
      const accepted = payload.accepted;
      const required = challenge(accepted);
      const preflight = await preflightZenonPayment(payload, accepted, required);
      const signedAccountBlock = structuredClone(payload.payload.transaction);
      const journal = await settlementJournal(t);
      const facilitator = new ExactZenonFacilitator({
        journal,
        environment: ENVIRONMENT,
        operatorTrustedChainPolicy: policy,
        rpcUrl: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
        rpcTimeoutMs: 100,
      });

      assert.deepEqual(fixture.state.prepared, { fusedPlasma: 21000, difficulty: 0 });
      assert.equal(payload.payload.transaction.fusedPlasma > 0, true);
      const first = await facilitator.settle(payload, accepted, required);
      assert.equal(first.success, false);
      assert.equal(first.state, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
      assert.equal(first.retrySamePayment, true);
      assert.equal(first.transaction, preflight.transactionHash);
      assert.deepEqual({
        wallet: fixture.state.counters.wallet,
        prepare: fixture.state.counters.prepare,
        sign: fixture.state.counters.sign,
        publish: fixture.state.counters.publish,
      }, {
        wallet: 1,
        prepare: 1,
        sign: 1,
        publish: 1,
      });
      const durable = await journal.get(
        preflight.authorizationKey,
        preflight.transactionHash,
      );
      assert.equal(durable.evidenceState, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
      assert.deepEqual(durable.signedAccountBlock, signedAccountBlock);
      assert.deepEqual(await journal.load(), {
        schemaVersion: 1,
        revision: 2,
        records: [durable],
      });

      const second = await facilitator.settle(payload, accepted, required);
      assert.equal(second.success, false);
      assert.equal(second.state, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
      assert.equal(second.retrySamePayment, true);
      assert.equal(second.transaction, preflight.transactionHash);
      assert.deepEqual({
        wallet: fixture.state.counters.wallet,
        prepare: fixture.state.counters.prepare,
        sign: fixture.state.counters.sign,
        publish: fixture.state.counters.publish,
      }, {
        wallet: 1,
        prepare: 1,
        sign: 1,
        publish: 1,
      });
      const retained = await journal.get(
        preflight.authorizationKey,
        preflight.transactionHash,
      );
      assert.equal(retained.transactionHash, durable.transactionHash);
      assert.deepEqual(retained.signedAccountBlock, signedAccountBlock);
      assert.equal((await journal.load()).revision, 2);
    });

  await t.test('the pre-wallet readiness quote is exact and performs no wallet activity', async () => {
    const paymentRequired = challenge(requirement(profile));
    const payer = syntheticPayer(90);
    const environment = {
      ...ENVIRONMENT,
      ZENON_RPC_URL: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
    };
    reset();

    assert.deepEqual(await probeResetEpochPaymentReadiness({
      role: 'buyer',
      paymentRequired,
      payer,
      operatorTrustedChainPolicy: policy,
      environment,
      rpcTimeoutMs: 100,
    }), {
      ready: true,
      role: 'buyer',
      remoteChainAuthenticated: false,
    });
    assert.equal(fixture.state.counters.heightTwo, 1);
    assert.equal(fixture.state.counters.plasma, 1);
    assert.equal(fixture.state.counters.wallet, 0);
    assert.equal(fixture.state.counters.prepare, 0);
    assert.equal(fixture.state.counters.sign, 0);
    assert.equal(fixture.state.counters.publish, 0);

    reset({
      frontier: () => momentum('reset-pre-wallet-zero-price', {
        height: validHeight,
        version: 2,
        chainIdentifier,
        nextFusionPrice: 0,
        nextWorkPrice: 0,
      }),
    });
    await assert.rejects(probeResetEpochPaymentReadiness({
      role: 'buyer',
      paymentRequired,
      payer,
      operatorTrustedChainPolicy: policy,
      environment,
      rpcTimeoutMs: 100,
    }), { code: 'dynamic_plasma_compatibility_guard_failed' });
    assert.equal(fixture.state.counters.wallet, 0);
    assert.equal(fixture.state.counters.prepare, 0);
    assert.equal(fixture.state.counters.sign, 0);
    assert.equal(fixture.state.counters.publish, 0);
  });

  await t.test('the approved payer must match the derived wallet before preparation', async () => {
    reset();
    const expectedPayer = syntheticPayer(fixture.state.keyByte + 1);
    const payload = await pay({ expectedPayer });
    assert.equal(payload.payload.transaction.address, expectedPayer);
    assert.equal(fixture.state.counters.sign, 1);

    reset();
    const wrongPayer = syntheticPayer(fixture.state.keyByte + 2);
    const code = await rejectedWithoutPayload(() => pay({ expectedPayer: wrongPayer }));
    assert.equal(code, 'reset_epoch_wallet_payer_mismatch');
    assert.equal(fixture.state.counters.wallet, 1);
    assert.equal(fixture.state.counters.prepare, 0);
    assert.equal(fixture.state.counters.sign, 0);
    assert.equal(fixture.state.counters.publish, 0);
  });

  await t.test('facilitator verify enforces the reset execution policy without publication', async t => {
    reset();
    const payload = await pay();
    const accepted = payload.accepted;
    const required = challenge(accepted);
    const preflight = await preflightZenonPayment(
      payload,
      accepted,
      required,
    );
    const journal = await settlementJournal(t);
    const facilitator = new ExactZenonFacilitator({
      journal,
      environment: ENVIRONMENT,
      operatorTrustedChainPolicy: policy,
      rpcUrl: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
      rpcTimeoutMs: 100,
    });
    const verify = async options => {
      reset(options);
      const result = await facilitator.verify(payload, accepted, required);
      assert.equal(fixture.state.counters.wallet, 0);
      assert.equal(fixture.state.counters.sign, 0);
      assert.equal(fixture.state.counters.publish, 0);
      return result;
    };

    await t.test('the exact tuple, version, prices, and quote are valid', async () => {
      const result = await verify();

      assert.deepEqual({
        isValid: result.isValid,
        payer: result.payer,
      }, {
        isValid: true,
        payer: preflight.payer,
      });
    });

    const invalidCases = [
      {
        name: 'a wrong height-two tuple is invalid',
        options: {
          heightTwo: { ...validHeightTwo, hash: '0'.repeat(64) },
        },
        invalidReason: 'operator_trusted_chain_observation_unavailable',
      },
      {
        name: 'post-enforcement v1 is invalid',
        options: {
          frontier: () => momentum('reset-verify-v1', {
            height: validHeight,
            version: 1,
            chainIdentifier,
            nextFusionPrice: 0,
            nextWorkPrice: 0,
          }),
        },
        invalidReason: 'dynamic_plasma_compatibility_guard_failed',
      },
      {
        name: 'zero v2 prices are invalid',
        options: {
          frontier: () => momentum('reset-verify-zero-price', {
            height: validHeight,
            version: 2,
            chainIdentifier,
            nextFusionPrice: 0,
            nextWorkPrice: 0,
          }),
        },
        invalidReason: 'dynamic_plasma_compatibility_guard_failed',
      },
      {
        name: 'a changed coherent quote is invalid',
        options: {
          plasma: {
            availablePlasma: 20000,
            basePlasma: 21000,
            requiredDifficulty: 1500000,
          },
        },
        invalidReason: 'dynamic_plasma_compatibility_guard_failed',
      },
    ];
    for (const entry of invalidCases) {
      await t.test(entry.name, async () => {
        const result = await verify(entry.options);

        assert.deepEqual({
          isValid: result.isValid,
          invalidReason: result.invalidReason,
          payer: result.payer,
        }, {
          isValid: false,
          invalidReason: entry.invalidReason,
          payer: '',
        });
      });
    }

    assert.deepEqual((await journal.load()).records, []);
    assert.throws(
      () => new ExactZenonFacilitator({
        journal,
        environment: ENVIRONMENT,
        operatorTrustedChainPolicy: dynamicPlasmaResetEpochOfflinePolicy(),
        rpcUrl: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
        rpcTimeoutMs: 100,
      }),
      { code: 'operator_trusted_chain_policy_invalid' },
    );
    assert.equal(fixture.state.counters.publish, 0);
  });

  await t.test('facilitator rejects a valid signed block from any unapproved payer before RPC',
    async t => {
      reset();
      const payload = await pay();
      const accepted = payload.accepted;
      const required = challenge(accepted);
      const actual = await preflightZenonPayment(payload, accepted, required);
      const journal = await settlementJournal(t);
      const expectedPayer = syntheticPayer(fixture.state.keyByte + 1);
      assert.notEqual(expectedPayer, actual.payer);
      const facilitator = new ExactZenonFacilitator({
        journal,
        environment: ENVIRONMENT,
        operatorTrustedChainPolicy: policy,
        rpcUrl: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
        rpcTimeoutMs: 100,
        expectedPayer,
      });
      reset();

      const verified = await facilitator.verify(payload, accepted, required);
      const settled = await facilitator.settle(payload, accepted, required);

      assert.deepEqual({
        isValid: verified.isValid,
        invalidReason: verified.invalidReason,
      }, {
        isValid: false,
        invalidReason: 'reset_epoch_payment_payer_mismatch',
      });
      assert.equal(settled.success, false);
      assert.equal(settled.errorReason, 'reset_epoch_payment_payer_mismatch');
      assert.equal(fixture.state.counters.heightTwo, 0);
      assert.equal(fixture.state.counters.frontier, 0);
      assert.equal(fixture.state.counters.publish, 0);
      assert.deepEqual((await journal.load()).records, []);
    });

  await t.test('wrong and mixed-epoch height-two tuples fail before wallet or signing activity', async t => {
    const cases = [
      {
        name: 'wrong height-two hash',
        heightTwo: { ...validHeightTwo, hash: '0'.repeat(64) },
      },
      {
        name: 'wrong height-one predecessor',
        heightTwo: { ...validHeightTwo, previousHash: '0'.repeat(64) },
      },
      {
        name: 'previous epoch tuple',
        heightTwo: {
          ...validHeightTwo,
          hash: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROVENANCE.observationHash,
          previousHash:
            PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_CHAIN_PROFILE
              .genesisMomentumHash,
        },
      },
    ];
    for (const entry of cases) {
      await t.test(entry.name, async () => {
        reset({ heightTwo: entry.heightTwo });

        await rejectedWithoutPayload();

        assert.equal(fixture.state.counters.heightTwo, 1);
        assert.equal(fixture.state.counters.wallet, 0);
        assert.equal(fixture.state.counters.prepare, 0);
        assert.equal(fixture.state.counters.sign, 0);
        assert.equal(fixture.state.counters.publish, 0);
      });
    }
  });

  await t.test('v1 after enforcement fails before wallet or signing activity', async () => {
    const legacy = momentum('reset-execution-v1', {
      height: validHeight,
      version: 1,
      chainIdentifier,
      nextFusionPrice: 0,
      nextWorkPrice: 0,
    });
    reset({ frontier: () => legacy });

    const code = await rejectedWithoutPayload();

    assert.equal(code, 'dynamic_plasma_compatibility_guard_failed');
    assert.equal(fixture.state.counters.wallet, 0);
    assert.equal(fixture.state.counters.prepare, 0);
    assert.equal(fixture.state.counters.sign, 0);
    assert.equal(fixture.state.counters.publish, 0);
  });

  await t.test('zero v2 prices fail before wallet or signing activity', async () => {
    const zeroPriced = momentum('reset-execution-zero-price', {
      height: validHeight,
      version: 2,
      chainIdentifier,
      nextFusionPrice: 0,
      nextWorkPrice: 0,
    });
    reset({ frontier: () => zeroPriced });

    const code = await rejectedWithoutPayload();

    assert.equal(code, 'dynamic_plasma_compatibility_guard_failed');
    assert.equal(fixture.state.counters.wallet, 0);
    assert.equal(fixture.state.counters.prepare, 0);
    assert.equal(fixture.state.counters.sign, 0);
    assert.equal(fixture.state.counters.publish, 0);
  });

  await t.test('frontier drift after signing returns no payload', async () => {
    const drifted = momentum('reset-execution-drifted', {
      height: validHeight + 1,
      version: 2,
      chainIdentifier,
      nextFusionPrice: 1000,
      nextWorkPrice: 1000,
    });
    reset({ frontier: call => call < 4 ? stable : drifted });

    const code = await rejectedWithoutPayload();

    assert.equal(code, 'dynamic_plasma_compatibility_guard_failed');
    assert.equal(fixture.state.counters.wallet, 1);
    assert.equal(fixture.state.counters.sign, 1);
    assert.equal(fixture.state.counters.publish, 0);
  });

  await t.test('a changed coherent quote after signing returns no payload', async () => {
    reset({
      plasma: call => call === 1
        ? { availablePlasma: 21000, basePlasma: 21000, requiredDifficulty: 0 }
        : {
          availablePlasma: 20000,
          basePlasma: 21000,
          requiredDifficulty: 1500000,
        },
    });

    const code = await rejectedWithoutPayload();

    assert.equal(code, 'dynamic_plasma_compatibility_guard_failed');
    assert.equal(fixture.state.counters.wallet, 1);
    assert.equal(fixture.state.counters.sign, 1);
    assert.equal(fixture.state.counters.publish, 0);
  });

  await t.test('a first-attempt quote mismatch retains the payment for same-payment reconciliation', async t => {
    reset();
    const payload = await pay();
    const accepted = payload.accepted;
    const required = challenge(accepted);
    const preflight = await preflightZenonPayment(
      payload,
      accepted,
      required,
    );
    const changedQuote = {
      availablePlasma: 20000,
      basePlasma: 21000,
      requiredDifficulty: 1500000,
    };

    reset({ plasma: changedQuote });
    const journal = await settlementJournal(t);
    const facilitator = new ExactZenonFacilitator({
      journal,
      environment: ENVIRONMENT,
      operatorTrustedChainPolicy: policy,
      rpcUrl: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
      rpcTimeoutMs: 100,
    });

    const result = await facilitator.settle(payload, accepted, required);

    assert.equal(result.success, false);
    assert.equal(
      result.errorReason,
      'dynamic_plasma_compatibility_guard_failed',
    );
    assert.equal(result.state, EVIDENCE_STATES.VALIDATED);
    assert.equal(result.authorizationKey, preflight.authorizationKey);
    assert.equal(result.transaction, preflight.transactionHash);
    assert.equal(result.payer, preflight.payer);
    assert.equal(result.retrySamePayment, true);
    assert.equal(result.deliveryState, DELIVERY_STATES.NONE);
    assert.equal(fixture.state.counters.wallet, 0);
    assert.equal(fixture.state.counters.sign, 0);
    assert.equal(fixture.state.counters.publish, 0);

    const durable = await journal.get(
      preflight.authorizationKey,
      preflight.transactionHash,
    );
    assert.deepEqual(Object.keys(durable).sort(), [
      'authorizationKey',
      'cachedResponse',
      'chainProfile',
      'createdAt',
      'deliveryState',
      'evidenceState',
      'intentDigest',
      'momentumEvidence',
      'payer',
      'resourceDigest',
      'resourceIdentity',
      'signedAccountBlock',
      'transactionHash',
      'updatedAt',
    ].sort());
    assert.deepEqual({
      authorizationKey: durable.authorizationKey,
      transactionHash: durable.transactionHash,
      chainProfile: durable.chainProfile,
      intentDigest: durable.intentDigest,
      resourceIdentity: durable.resourceIdentity,
      resourceDigest: durable.resourceDigest,
      payer: durable.payer,
      signedAccountBlock: durable.signedAccountBlock,
      evidenceState: durable.evidenceState,
      momentumEvidence: durable.momentumEvidence,
      deliveryState: durable.deliveryState,
      cachedResponse: durable.cachedResponse,
    }, {
      authorizationKey: preflight.authorizationKey,
      transactionHash: preflight.transactionHash,
      chainProfile: preflight.chainProfile,
      intentDigest: preflight.intentDigest,
      resourceIdentity: preflight.resourceIdentity,
      resourceDigest: preflight.resourceDigest,
      payer: preflight.payer,
      signedAccountBlock: payload.payload.transaction,
      evidenceState: EVIDENCE_STATES.VALIDATED,
      momentumEvidence: null,
      deliveryState: DELIVERY_STATES.NONE,
      cachedResponse: null,
    });
    assert.equal(durable.createdAt, durable.updatedAt);
    const snapshot = await journal.load();
    assert.deepEqual(snapshot, {
      schemaVersion: 1,
      revision: 1,
      records: [durable],
    });
  });

  await t.test('acknowledged and unknown exact payments remain reconciliation-only after frontier advance', async t => {
    for (const evidenceState of [
      EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
    ]) {
      await t.test(evidenceState, async t => {
        reset();
        const payload = await pay({ minimumMomentumConfirmations: 2 });
        const accepted = payload.accepted;
        const required = challenge(accepted);
        const journal = await settlementJournal(t);
        const preflight = await persistPayment(
          journal,
          payload,
          accepted,
          required,
          evidenceState,
        );
        const advanced = momentum('reset-recovery-submitted-advanced', {
          height: validHeight + 1,
          version: 2,
          chainIdentifier,
          nextFusionPrice: 2000,
          nextWorkPrice: 2000,
        });
        reset({
          frontier: () => advanced,
          syncCurrentHeight: advanced.height,
          observed: (_call, requestedHash) => {
            assert.equal(requestedHash.toString(), preflight.transactionHash);
            return null;
          },
        });
        const facilitator = new ExactZenonFacilitator({
          journal,
          environment: ENVIRONMENT,
          operatorTrustedChainPolicy: policy,
          rpcUrl: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
          rpcTimeoutMs: 100,
        });

        const result = await facilitator.settle(payload, accepted, required);

        assert.equal(result.success, false);
        assert.equal(result.errorReason, 'momentum_inclusion_timeout');
        assert.equal(result.state, evidenceState);
        assert.equal(result.transaction, preflight.transactionHash);
        assert.equal(result.retrySamePayment, true);
        assert.equal(fixture.state.counters.lookup, 1);
        assert.equal(fixture.state.counters.plasma, 0);
        assert.equal(fixture.state.counters.publish, 0);
        assert.equal(fixture.state.counters.balance, 0);
        assert.equal(fixture.state.counters.unconfirmed, 0);
        assert.equal(fixture.state.counters.subscribe, 0);
        const retained = await journal.get(
          preflight.authorizationKey,
          preflight.transactionHash,
        );
        assert.equal(retained.evidenceState, evidenceState);
        assert.equal(retained.transactionHash, preflight.transactionHash);
        assert.equal(retained.resourceDigest, preflight.resourceDigest);
      });
    }
  });

  await t.test('submitted exact payments recover inclusion after frontier advance without publication', async t => {
    for (const evidenceState of [
      EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
    ]) {
      await t.test(evidenceState, async t => {
        reset();
        const payload = await pay();
        const accepted = payload.accepted;
        const required = challenge(accepted);
        const journal = await settlementJournal(t);
        const preflight = await persistPayment(
          journal,
          payload,
          accepted,
          required,
          evidenceState,
        );
        const advanced = momentum('reset-recovery-included-advanced', {
          height: validHeight + 1,
          version: 2,
          chainIdentifier,
          nextFusionPrice: 2000,
          nextWorkPrice: 2000,
        });
        const included = observedPaymentBlock(payload.payload.transaction, {
          included: true,
        });
        reset({
          frontier: () => advanced,
          syncCurrentHeight: advanced.height,
          observed: (_call, requestedHash) => {
            assert.equal(requestedHash.toString(), preflight.transactionHash);
            return included;
          },
        });
        const facilitator = new ExactZenonFacilitator({
          journal,
          environment: ENVIRONMENT,
          operatorTrustedChainPolicy: policy,
          rpcUrl: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
          rpcTimeoutMs: 100,
        });

        const result = await facilitator.settle(payload, accepted, required);

        assert.equal(result.success, true);
        assert.equal(result.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
        assert.equal(result.transaction, preflight.transactionHash);
        assert.equal(fixture.state.counters.lookup, 1);
        assert.equal(fixture.state.counters.plasma, 0);
        assert.equal(fixture.state.counters.publish, 0);
        const retained = await journal.get(
          preflight.authorizationKey,
          preflight.transactionHash,
        );
        assert.equal(retained.evidenceState, EVIDENCE_STATES.MOMENTUM_INCLUDED);
        assert.equal(retained.transactionHash, preflight.transactionHash);
        assert.equal(retained.resourceDigest, preflight.resourceDigest);
      });
    }
  });

  await t.test('a retained subthreshold inclusion reaches its threshold after frontier advance', async t => {
    reset();
    const payload = await pay({ minimumMomentumConfirmations: 2 });
    const accepted = payload.accepted;
    const required = challenge(accepted);
    const journal = await settlementJournal(t);
    const preflight = await persistPayment(
      journal,
      payload,
      accepted,
      required,
      EVIDENCE_STATES.VALIDATED,
    );
    const inclusionMomentumHash = sdk.Hash.digest(
      Buffer.from('synthetic-reset-recovery-retained-inclusion'),
    );
    const momentumHeight = validHeight + 1;
    await journal.updateEvidence(
      preflight.authorizationKey,
      preflight.transactionHash,
      EVIDENCE_STATES.MOMENTUM_INCLUDED,
      {
        observedAt: '2026-01-01T00:00:00.000Z',
        confirmationDetail: {
          numConfirmations: 1,
          momentumHeight,
          momentumHash: inclusionMomentumHash.toString(),
          momentumTimestamp: 1,
        },
      },
    );
    const advanced = momentum('reset-recovery-retained-advanced', {
      height: validHeight + 1,
      version: 2,
      chainIdentifier,
      nextFusionPrice: 2000,
      nextWorkPrice: 2000,
    });
    const included = observedPaymentBlock(payload.payload.transaction, {
      included: true,
      numConfirmations: 2,
      momentumHeight,
      momentumHash: inclusionMomentumHash,
    });
    reset({
      frontier: () => advanced,
      syncCurrentHeight: advanced.height,
      observed: (_call, requestedHash) => {
        assert.equal(requestedHash.toString(), preflight.transactionHash);
        return included;
      },
    });
    const facilitator = new ExactZenonFacilitator({
      journal,
      environment: ENVIRONMENT,
      operatorTrustedChainPolicy: policy,
      rpcUrl: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
      rpcTimeoutMs: 100,
    });

    const result = await facilitator.settle(payload, accepted, required);

    assert.equal(result.success, true);
    assert.equal(result.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(result.transaction, preflight.transactionHash);
    assert.equal(fixture.state.counters.lookup, 1);
    assert.equal(fixture.state.counters.plasma, 0);
    assert.equal(fixture.state.counters.publish, 0);
    assert.equal(fixture.state.counters.balance, 0);
    assert.equal(fixture.state.counters.unconfirmed, 0);
    assert.equal(fixture.state.counters.subscribe, 0);
    const retained = await journal.get(
      preflight.authorizationKey,
      preflight.transactionHash,
    );
    assert.equal(retained.evidenceState, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(retained.momentumEvidence.confirmationDetail.numConfirmations, 2);
    assert.equal(retained.transactionHash, preflight.transactionHash);
    assert.equal(retained.resourceDigest, preflight.resourceDigest);
  });

  await t.test('a chain-observed exact inclusion with no journal record recovers after frontier advance', async t => {
    reset();
    const payload = await pay();
    const accepted = payload.accepted;
    const required = challenge(accepted);
    const preflight = await preflightZenonPayment(payload, accepted, required);
    const journal = await settlementJournal(t);
    const advanced = momentum('reset-recovery-unrecorded-advanced', {
      height: validHeight + 1,
      version: 2,
      chainIdentifier,
      nextFusionPrice: 2000,
      nextWorkPrice: 2000,
    });
    const included = observedPaymentBlock(payload.payload.transaction, {
      included: true,
    });
    reset({
      frontier: () => advanced,
      syncCurrentHeight: advanced.height,
      observed: (_call, requestedHash) => {
        assert.equal(requestedHash.toString(), preflight.transactionHash);
        return included;
      },
    });
    const facilitator = new ExactZenonFacilitator({
      journal,
      environment: ENVIRONMENT,
      operatorTrustedChainPolicy: policy,
      rpcUrl: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
      rpcTimeoutMs: 100,
    });

    const result = await facilitator.settle(payload, accepted, required);

    assert.equal(result.success, true);
    assert.equal(result.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(result.transaction, preflight.transactionHash);
    assert.equal(fixture.state.counters.lookup, 1);
    assert.equal(fixture.state.counters.plasma, 0);
    assert.equal(fixture.state.counters.publish, 0);
    assert.equal(fixture.state.counters.balance, 0);
    assert.equal(fixture.state.counters.unconfirmed, 0);
    assert.equal(fixture.state.counters.subscribe, 0);
    const retained = await journal.get(
      preflight.authorizationKey,
      preflight.transactionHash,
    );
    assert.equal(retained.evidenceState, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(retained.transactionHash, preflight.transactionHash);
    assert.equal(retained.resourceDigest, preflight.resourceDigest);
  });
});
