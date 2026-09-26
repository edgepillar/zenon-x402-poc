import { dirname } from 'node:path';

import * as sdk from 'znn-typescript-sdk';

import { GATE_B_PUBLIC_WS_INPUT_LEAVES } from
  '../../src/gate-b-public-ws-inputs-schema.js';
import { executeGateBTestnetFaucetReceive } from
  '../../src/gate-b-testnet-faucet-receive-child.js';
import {
  GATE_B_TESTNET_FAUCET_RECEIVE_ACKNOWLEDGEMENT,
  GATE_B_TESTNET_FAUCET_RECEIVE_SCHEMA_VERSIONS,
} from '../../src/gate-b-testnet-faucet-receive-schema.js';
import {
  GATE_B_TESTNET_FAUCET_RECEIVE_STATES,
  openGateBTestnetFaucetReceiveState,
} from '../../src/gate-b-testnet-faucet-receive-state.js';
import { computeBlockHash } from '../../src/zenon-payment.js';
import {
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_SDK_NETWORK_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
  selectPublicTestnetDynamicPlasmaResetEpochExecutionPolicy,
} from '../../src/zenon/operator-trusted-testnet-profile.js';

const CHAIN_ID = Number(
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE.chainIdentifier,
);
const PUBLIC_KEY = Buffer.alloc(32, 1);
const SIGNATURE = Buffer.alloc(64, 2);
const ADDRESS = sdk.Address.fromPublicKey(PUBLIC_KEY);
const BOUNDARIES = new Set([
  'PREPARED', 'PUBLISHING', 'UNKNOWN', 'INCLUDED', 'SECOND_ATTEMPT',
]);

function fail() {
  throw new Error('fixture_failed');
}

function stateInjections() {
  return Object.freeze({
    aclInspector: async () => true,
    platform: 'darwin',
  });
}

function sourceBlock(index) {
  const block = new sdk.AccountBlock({
    address: sdk.Address.fromPublicKey(Buffer.alloc(32, 3)),
    amount: 1n,
    blockType: sdk.BlockTypeEnum.ContractSend,
    chainIdentifier: CHAIN_ID,
    data: Buffer.alloc(0),
    difficulty: 0,
    fromBlockHash: sdk.EMPTY_HASH,
    fusedPlasma: 0,
    height: index + 1,
    momentumAcknowledged: new sdk.HashHeight(
      sdk.Hash.digest(Buffer.from(`fixture-source-acknowledged-${index}`)),
      1,
    ),
    nonce: '0000000000000000',
    previousHash: sdk.Hash.digest(Buffer.from(`fixture-source-previous-${index}`)),
    publicKey: Buffer.alloc(32, 3),
    signature: Buffer.alloc(64, 4),
    toAddress: ADDRESS,
    tokenStandard: index === 0 ? sdk.ZNN_ZTS : sdk.QSR_ZTS,
    version: 1,
  });
  block.hash = computeBlockHash(block, sdk);
  block.confirmationDetail = new sdk.AccountBlockConfirmationDetail(
    1,
    1,
    sdk.Hash.digest(Buffer.from('fixture-source-confirmation-shared')),
    1,
  );
  return block;
}

function sourceAuthorization(block) {
  return Object.freeze({
    address: block.toAddress.toString(),
    amount: block.amount.toString(),
    asset: block.tokenStandard.toString(),
    blockType: block.blockType,
    confirmationMomentumHash: block.confirmationDetail.momentumHash.toString(),
    confirmationMomentumHeight: block.confirmationDetail.momentumHeight,
    confirmationMomentumTimestamp: block.confirmationDetail.momentumTimestamp,
    hash: block.hash.toString(),
  });
}

function fixtureSources() {
  return Object.freeze([sourceBlock(0), sourceBlock(1)]);
}

function fixtureBootstrap(sources) {
  return Object.freeze({
    acknowledgement: GATE_B_TESTNET_FAUCET_RECEIVE_ACKNOWLEDGEMENT,
    authorizedSources: Object.freeze(sources.map(sourceAuthorization)),
    eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
    liveAcknowledgement: TESTNET_LIVE_ACKNOWLEDGEMENT,
    operatorTrustAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
    schemaVersion:
      GATE_B_TESTNET_FAUCET_RECEIVE_SCHEMA_VERSIONS.RESET_EPOCH_PINNED_WSS,
    wssAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
  });
}

function signedReceive(source, index, previous) {
  const block = new sdk.AccountBlockTemplate({
    address: ADDRESS,
    amount: 0n,
    blockType: sdk.BlockTypeEnum.UserReceive,
    chainIdentifier: CHAIN_ID,
    data: Buffer.alloc(0),
    difficulty: 1,
    fromBlockHash: source.hash,
    fusedPlasma: 0,
    height: index + 1,
    momentumAcknowledged: new sdk.HashHeight(
      sdk.Hash.digest(Buffer.from(`fixture-receive-acknowledged-${index}`)),
      index + 2,
    ),
    nonce: '0100000000000000',
    previousHash: previous,
    publicKey: PUBLIC_KEY,
    signature: SIGNATURE,
    toAddress: sdk.EMPTY_ADDRESS,
    tokenStandard: sdk.EMPTY_ZTS,
    version: 1,
  });
  block.hash = computeBlockHash(block, sdk);
  return Object.freeze({
    ...block.toJson(),
    publicKey: PUBLIC_KEY.toString('base64'),
    signature: SIGNATURE.toString('base64'),
  });
}

function nextRecord(record, state) {
  const next = structuredClone(record);
  next.revision += 1;
  next.state = state;
  next.blocks[next.blocks.length - 1].state = state;
  return next;
}

function preparedRecord(record, signed, source) {
  const next = structuredClone(record);
  next.revision += 1;
  next.activeIndex = 0;
  next.state = GATE_B_TESTNET_FAUCET_RECEIVE_STATES.PREPARED;
  next.blocks.push({
    index: 0,
    signedAccountBlock: signed,
    sourceHash: source.hash.toString(),
    state: GATE_B_TESTNET_FAUCET_RECEIVE_STATES.PREPARED,
  });
  return next;
}

function secondAttempt(record, source) {
  return Object.freeze({
    firstReceive: Object.freeze({
      hash: record.blocks[0].signedAccountBlock.hash,
      height: record.blocks[0].signedAccountBlock.height,
      momentumAcknowledgedHeight:
        record.blocks[0].signedAccountBlock.momentumAcknowledged.height,
      sourceHash: record.blocks[0].sourceHash,
    }),
    profileCommitment: Object.freeze({ ...record.profileCommitment }),
    schemaVersion:
      GATE_B_TESTNET_FAUCET_RECEIVE_SCHEMA_VERSIONS.RESET_EPOCH_PINNED_WSS,
    secondSource: Object.freeze({
      address: source.toAddress.toString(),
      amount: source.amount.toString(),
      asset: source.tokenStandard.toString(),
      blockType: source.blockType,
      hash: source.hash.toString(),
    }),
  });
}

function observedReceive(value, index) {
  const prepared = sdk.AccountBlockTemplate.fromJson(value);
  prepared.publicKey = Buffer.from(value.publicKey, 'base64');
  prepared.signature = Buffer.from(value.signature, 'base64');
  return new sdk.AccountBlock({
    ...prepared,
    confirmationDetail: new sdk.AccountBlockConfirmationDetail(
      1,
      index + 4,
      sdk.Hash.digest(Buffer.from(`fixture-receive-confirmation-${index}`)),
      index + 4,
    ),
  });
}

async function send(message) {
  if (typeof process.send !== 'function') fail();
  await new Promise((resolve, reject) => {
    process.send(message, error => error ? reject(error) : resolve());
  });
}

async function seed(input) {
  if (!input || typeof input.walletRoot !== 'string' ||
      !BOUNDARIES.has(input.boundary)) fail();
  const sources = fixtureSources();
  const bootstrap = fixtureBootstrap(sources);
  const state = await openGateBTestnetFaucetReceiveState(
    input.walletRoot,
    stateInjections(),
    bootstrap.profileName,
  );
  let record = await state.arm(bootstrap.authorizedSources);
  record = await state.update(preparedRecord(
    record,
    signedReceive(sources[0], 0, sdk.EMPTY_HASH),
    sources[0],
  ));
  if (input.boundary !== 'PREPARED') {
    record = await state.update(nextRecord(
      record,
      GATE_B_TESTNET_FAUCET_RECEIVE_STATES.PUBLISHING,
    ));
  }
  if (input.boundary === 'UNKNOWN') {
    record = await state.update(nextRecord(
      record,
      GATE_B_TESTNET_FAUCET_RECEIVE_STATES.UNKNOWN,
    ));
  } else if (input.boundary === 'INCLUDED' || input.boundary === 'SECOND_ATTEMPT') {
    record = await state.update(nextRecord(
      record,
      GATE_B_TESTNET_FAUCET_RECEIVE_STATES.INCLUDED,
    ));
  }
  if (input.boundary === 'SECOND_ATTEMPT') {
    await state.commitSecondReceiveAttempt(secondAttempt(record, sources[1]));
  }
  await send({ boundary: input.boundary, ipcVersion: 1, type: 'DURABLE' });
  setInterval(() => {}, 1000);
}

async function recover(input) {
  if (!input || typeof input.walletRoot !== 'string' ||
      !BOUNDARIES.has(input.boundary)) fail();
  const sources = fixtureSources();
  const bootstrap = fixtureBootstrap(sources);
  const inspection = await openGateBTestnetFaucetReceiveState(
    input.walletRoot,
    stateInjections(),
    bootstrap.profileName,
  );
  const initial = await inspection.load();
  const initialAttempt = await inspection.loadSecondReceiveAttempt();
  await inspection.close();
  if (!initial || initial.blocks.length !== 1 ||
      (input.boundary === 'SECOND_ATTEMPT') !== (initialAttempt !== null)) fail();

  const counters = {
    prepares: 0,
    publishes: 0,
    signs: 0,
    walletReads: 0,
  };
  const observedByHash = new Map();
  if (input.boundary === 'INCLUDED' || input.boundary === 'SECOND_ATTEMPT') {
    observedByHash.set(
      initial.blocks[0].signedAccountBlock.hash,
      observedReceive(initial.blocks[0].signedAccountBlock, 0),
    );
  }
  const zenon = {
    client: undefined,
    async initialize() {},
    clearConnection() {},
    ledger: {
      async getAccountBlockByHash(hash) {
        const value = hash.toString();
        for (let index = 0; index < sources.length; index += 1) {
          if (sources[index].hash.toString() === value) return sources[index];
        }
        return observedByHash.get(value) ?? null;
      },
      async getFrontierAccountBlock() {
        return observedByHash.get(initial.blocks[0].signedAccountBlock.hash) ?? null;
      },
      async getUnconfirmedBlocksByAddress() {
        return new sdk.AccountBlockList(0, [], false);
      },
      async getUnreceivedBlocksByAddress() {
        return new sdk.AccountBlockList(1, [sources[1]], false);
      },
      async publishRawTransaction(prepared) {
        counters.publishes += 1;
        observedByHash.set(prepared.hash.toString(), observedReceive({
          ...prepared.toJson(),
          publicKey: prepared.publicKey.toString('base64'),
          signature: prepared.signature.toString('base64'),
        }, 1));
        return prepared;
      },
    },
  };
  const fakeSdk = {
    ...sdk,
    KeyStore: {
      fromMnemonic() {
        return {
          getKeyPair() {
            return {
              clear() {},
              getAddress: () => ADDRESS,
              getPublicKey: () => PUBLIC_KEY,
              sign() {
                counters.signs += 1;
                return SIGNATURE;
              },
            };
          },
        };
      },
    },
    Zenon: {
      getInstance: () => zenon,
      getPowProvider: () => undefined,
      setChainID(value) { if (value !== CHAIN_ID) fail(); },
      setNetworkID(value) {
        if (value !== Number(PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_SDK_NETWORK_ID)) fail();
      },
    },
  };
  const addressInput = Buffer.from(`${JSON.stringify({
    accountIndex: 0,
    address: ADDRESS.toString(),
    addressVersion: 1,
  })}\n`);
  const walletInput = Buffer.from(`${JSON.stringify({
    accountIndex: 0,
    mnemonic: String.fromCharCode(120),
    secretVersion: 1,
  })}\n`);
  const workspace = {
    assertDistinct: () => true,
    async close() {},
    async openInputs(names) { return [{ name: names[0] }]; },
    async read(record) {
      if (record.name === GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet) {
        counters.walletReads += 1;
        return Buffer.from(walletInput);
      }
      return Buffer.from(addressInput);
    },
    async verify() {},
  };
  const policy = selectPublicTestnetDynamicPlasmaResetEpochExecutionPolicy({
    eventId: bootstrap.eventId,
    liveAcknowledgement: bootstrap.liveAcknowledgement,
    operatorTrustAcknowledgement: bootstrap.operatorTrustAcknowledgement,
    profileName: bootstrap.profileName,
    rpcEndpoint: bootstrap.rpcEndpoint,
    wssAcknowledgement: bootstrap.wssAcknowledgement,
  });
  const outcome = await executeGateBTestnetFaucetReceive(bootstrap, {
    actualCwdPath: () => input.walletRoot,
    applicationSupportRoot: () => dirname(input.walletRoot),
    assertNodeReady: async () => ({ chainId: CHAIN_ID }),
    createPolicy: () => policy,
    invokeComposite: async (_zenon, template, keyPair) => {
      counters.prepares += 1;
      template.version = 1;
      template.chainIdentifier = CHAIN_ID;
      template.previousHash = sdk.Hash.parse(initial.blocks[0].signedAccountBlock.hash);
      template.height = 2;
      template.momentumAcknowledged = new sdk.HashHeight(
        sdk.Hash.digest(Buffer.from('fixture-recovery-acknowledged')),
        3,
      );
      template.address = ADDRESS;
      template.toAddress = sdk.EMPTY_ADDRESS;
      template.amount = 0n;
      template.tokenStandard = sdk.EMPTY_ZTS;
      template.data = Buffer.alloc(0);
      template.blockType = sdk.BlockTypeEnum.UserReceive;
      template.fusedPlasma = 0;
      template.difficulty = 1;
      template.nonce = '0100000000000000';
      template.publicKey = PUBLIC_KEY;
      template.hash = computeBlockHash(template, sdk);
      template.signature = keyPair.sign(template.hash.getBytes());
      return template;
    },
    loadDependencies: async () => ({ ed: { verify: () => true }, sdk: fakeSdk }),
    now: (() => { let value = 0; return () => { value += 120_001; return value; }; })(),
    onExecutionMode: async () => true,
    onPublicationStart: async () => true,
    openReceiveState: (_root, injections, profileName) =>
      openGateBTestnetFaucetReceiveState(
        input.walletRoot,
        injections,
        profileName,
      ),
    openWalletWorkspace: async () => workspace,
    receiveStateInjections: stateInjections(),
    runtime: {
      async withOwner(_owner, run) {
        return run({
          poison() {},
          async runRpcWithDeadline({ execute }) { return execute(); },
        });
      },
    },
    wait: async () => {},
  });
  addressInput.fill(0);
  walletInput.fill(0);

  const reopened = await openGateBTestnetFaucetReceiveState(
    input.walletRoot,
    stateInjections(),
    bootstrap.profileName,
  );
  const final = await reopened.load();
  const finalAttempt = await reopened.loadSecondReceiveAttempt();
  await reopened.close();
  await send({
    blocks: final.blocks.length,
    boundary: input.boundary,
    finalState: final.state,
    ipcVersion: 1,
    outcome,
    prepares: counters.prepares,
    publishes: counters.publishes,
    secondAttempt: finalAttempt !== null,
    signs: counters.signs,
    type: 'RECOVERED',
    walletReads: counters.walletReads,
  });
  process.disconnect();
}

process.once('message', input => {
  const mode = process.argv[2];
  const operation = mode === 'seed' ? seed(input) : mode === 'recover' ? recover(input) : fail();
  Promise.resolve(operation).catch(async () => {
    try { await send({ ipcVersion: 1, type: 'FAILED' }); } catch {}
    process.exitCode = 1;
    if (process.connected) process.disconnect();
  });
});
