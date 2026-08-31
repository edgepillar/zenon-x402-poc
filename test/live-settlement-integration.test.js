import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import * as sdk from 'znn-typescript-sdk';
import { canonicalJson, paymentIntentDigest } from '../src/canonical.js';
import { LIVE_RUNTIME_ERROR_CODES, LiveRuntimeError } from '../src/live-runtime.js';
import {
  assertLiveEvidenceObserver,
  createLiveEvidenceObserver,
  recordLiveEvidencePhase,
} from '../src/live-observation.js';
import { createResourceServer } from '../src/resource-server.js';
import { decodeB64Json, encodeB64Json, HEADERS } from '../src/x402-wire.js';
import {
  computeBlockHash,
  ensurePublished,
  ExactZenonClient,
  ExactZenonFacilitator,
  assertZenonNodeReady,
  probeZenonRoleReadiness,
  preflightZenonPayment,
} from '../src/zenon-payment.js';
import {
  OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
  OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE,
  OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_NON_CLAIMS,
  isOperatorTrustedLocalDevnetEvidence,
  parseOperatorTrustedLocalDevnetProfileArtifact,
} from '../src/zenon/operator-trusted-local-devnet-profile.js';
import {
  OPERATOR_TRUST_ACKNOWLEDGEMENT,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
  selectOperatorTrustedTestnetPolicy,
} from '../src/zenon/operator-trusted-testnet-profile.js';
import {
  DELIVERY_STATES,
  EVIDENCE_STATES,
  SettlementJournal,
} from '../src/settlement-journal.js';

const PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  // Synthetic test-only identity; not a real network profile.
  genesisMomentumHash: '7'.repeat(64),
});

function synchronousObservationFailureFixture(thrownValue) {
  const policy = selectOperatorTrustedTestnetPolicy(
    OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
    OPERATOR_TRUST_ACKNOWLEDGEMENT,
    TESTNET_LIVE_ACKNOWLEDGEMENT,
  );
  const counters = {
    network: 0,
    sync: 0,
    frontier: 0,
    heightTwo: 0,
    asset: 0,
  };
  const zenon = {
    stats: {
      async networkInfo() {
        counters.network += 1;
        return {
          numPeers: 1,
          self: { publicKey: 'synthetic-node-key', ip: 'synthetic-node-address' },
          peers: [],
        };
      },
      async syncInfo() {
        counters.sync += 1;
        return { state: sdk.SyncState.SyncDone, currentHeight: 8, targetHeight: 8 };
      },
    },
    embedded: {
      token: {
        getByZts() {
          counters.asset += 1;
          throw new Error('asset lookup must not run');
        },
      },
    },
    ledger: {
      async getFrontierMomentum() {
        counters.frontier += 1;
        return {
          chainIdentifier: Number(
            OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.chainIdentifier,
          ),
          hash: 'f'.repeat(64),
          height: 8,
        };
      },
      getMomentumsByHeight() {
        counters.heightTwo += 1;
        throw new Error('height-two query must not run');
      },
    },
  };
  const promise = assertZenonNodeReady(
    zenon,
    sdk,
    undefined,
    OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
    {
      callRead(operation, execute) {
        if (operation === 'operatorTrustedChainObservation') throw thrownValue;
        return execute();
      },
      operatorTrustedChainPolicy: policy,
    },
  );
  return { counters, promise };
}

function assertObservationFailureReadBoundary(counters) {
  assert.deepEqual(counters, {
    network: 1,
    sync: 1,
    frontier: 1,
    heightTwo: 0,
    asset: 0,
  });
}

test('live payment capability routing is immutable and requires no SDK operation', () => {
  const client = new ExactZenonClient({ mnemonic: '', accountIndex: 0, rpcTimeoutMs: 1 });
  const descriptor = Object.getOwnPropertyDescriptor(client, 'paymentCapabilities');
  assert.ok(descriptor);
  assert.equal(descriptor.enumerable, false);
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.configurable, false);
  assert.deepEqual(descriptor.value, {
    version: 1,
    x402Version: 2,
    routes: [{
      scheme: 'exact',
      network: 'zenon:testnet',
      paymentFlows: ['upfront'],
    }],
  });
  assert.equal(Object.isFrozen(descriptor.value.routes[0].paymentFlows), true);
});

test('live lifecycle observers are explicit synchronous branded inputs', () => {
  const observer = createLiveEvidenceObserver({
    utcNow: () => '2026-01-01T00:00:00.000Z',
    monotonicNow: () => 1,
  });
  assert.equal(assertLiveEvidenceObserver(observer), observer);
  assert.throws(() => assertLiveEvidenceObserver({}), /live_observation_invalid/);
  const event = recordLiveEvidencePhase(observer, 'buyer', 'buyer_owner_wait_started');
  assert.deepEqual(event, {
    sequence: 0,
    phase: 'buyer_owner_wait_started',
    role: 'buyer',
    clockDomain: 'buyer-monotonic-v1',
    utc: '2026-01-01T00:00:00.000Z',
    monotonicMs: 1,
  });
  assert.equal(Object.isFrozen(event), true);
  assert.throws(
    () => recordLiveEvidencePhase(observer, 'buyer', 'publication_started'),
    error => error?.code === 'live_observation_invalid' && error?.cause === undefined,
  );
});

test('local policy bridge widens only direct node readiness and performs no production side effect', async () => {
  const localModule = await import('../src/zenon/operator-trusted-local-devnet-profile.js');
  const artifactValue = {
    acknowledgement: OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
    artifactVersion: 1,
    chainProfile: {
      chainIdentifier: '69',
      genesisMomentumHash: 'a'.repeat(64),
      version: 1,
    },
    heightTwo: {
      chainIdentifier: 69,
      hash: 'b'.repeat(64),
      height: 2,
      previousHash: 'a'.repeat(64),
      version: 1,
    },
    lane: OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE,
    nonClaims: { ...OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_NON_CLAIMS },
    provenance: {
      generator: {
        repository: '0x3639/testnet',
        revision: 'c'.repeat(40),
      },
      nodeRuntime: {
        containerImageDigest: `sha256:${'e'.repeat(64)}`,
        sourceRepository: 'zenon-network/go-zenon',
        sourceRevision: 'd'.repeat(40),
      },
    },
  };
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(
    `${canonicalJson(artifactValue)}\n`,
  );
  const policy = localModule.createOperatorTrustedLocalDevnetPolicy(artifact);
  const heightTwo = new sdk.Momentum(
    1,
    69,
    sdk.Hash.parse('b'.repeat(64)),
    sdk.Hash.parse('a'.repeat(64)),
    2,
    0,
    Buffer.alloc(0),
    [],
    sdk.Hash.parse('1'.repeat(64)),
    '',
    '',
    undefined,
  );
  const frontier = new sdk.Momentum(
    1,
    69,
    sdk.Hash.parse('f'.repeat(64)),
    sdk.Hash.parse('a'.repeat(64)),
    8,
    0,
    Buffer.alloc(0),
    [],
    sdk.Hash.parse('1'.repeat(64)),
    '',
    '',
    undefined,
  );
  const counters = {
    network: 0,
    sync: 0,
    frontier: 0,
    heightTwo: 0,
    asset: 0,
  };
  const zenon = {
    stats: {
      async networkInfo() {
        counters.network += 1;
        return {
          numPeers: 1,
          self: { publicKey: 'synthetic-node-key', ip: 'synthetic-node-address' },
          peers: [],
        };
      },
      async syncInfo() {
        counters.sync += 1;
        return { state: sdk.SyncState.SyncDone, currentHeight: 8, targetHeight: 8 };
      },
    },
    embedded: {
      token: {
        async getByZts() {
          counters.asset += 1;
          throw new Error('asset lookup must not run');
        },
      },
    },
    ledger: {
      async getFrontierMomentum() {
        counters.frontier += 1;
        return frontier;
      },
      async getMomentumsByHeight(...args) {
        counters.heightTwo += 1;
        assert.deepEqual(args, [2, 1]);
        return new sdk.MomentumList(8, [heightTwo]);
      },
    },
  };
  const operations = [];
  const networkIdBefore = sdk.Zenon.getNetworkID();
  const chainIdBefore = sdk.Zenon.getChainIdentifier();
  const result = await assertZenonNodeReady(
    zenon,
    sdk,
    undefined,
    artifact.chainProfile,
    {
      async callRead(operation, execute) {
        operations.push(operation);
        return execute();
      },
      operatorTrustedChainPolicy: policy,
    },
  );

  assert.deepEqual(operations, [
    'stats.networkInfo',
    'stats.syncInfo',
    'ledger.getFrontierMomentum',
    'operatorTrustedChainObservation',
  ]);
  assert.deepEqual(counters, {
    network: 1,
    sync: 1,
    frontier: 1,
    heightTwo: 1,
    asset: 0,
  });
  assert.equal(isOperatorTrustedLocalDevnetEvidence(result.chainTrustEvidence), true);
  assert.equal(result.chainTrustEvidence.remoteChainAuthenticated, false);
  assert.equal(Object.hasOwn(result.chainTrustEvidence, 'authenticatedProfile'), false);
  assert.equal(Object.hasOwn(result, 'authenticatedProfile'), false);
  assert.equal(sdk.Zenon.getNetworkID(), networkIdBefore);
  assert.equal(sdk.Zenon.getChainIdentifier(), chainIdBefore);

  heightTwo.hash = sdk.Hash.parse('c'.repeat(64));
  await assert.rejects(assertZenonNodeReady(
    zenon,
    sdk,
    undefined,
    artifact.chainProfile,
    { operatorTrustedChainPolicy: policy },
  ), { code: 'operator_trusted_chain_observation_unavailable' });
  assert.equal(counters.asset, 0);
  assert.equal(sdk.Zenon.getNetworkID(), networkIdBefore);
  assert.equal(sdk.Zenon.getChainIdentifier(), chainIdBefore);

  const noReadZenon = {
    stats: {
      networkInfo() { throw new Error('node read must not run'); },
    },
  };
  await assert.rejects(assertZenonNodeReady(
    noReadZenon,
    sdk,
    undefined,
    artifact.chainProfile,
    { operatorTrustedChainPolicy: { ...policy } },
  ), { code: 'operator_trusted_chain_policy_invalid' });
  const publicModule = await import('../src/zenon/operator-trusted-testnet-profile.js');
  const publicPolicy = publicModule.selectOperatorTrustedTestnetPolicy(
    publicModule.OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
    publicModule.OPERATOR_TRUST_ACKNOWLEDGEMENT,
    publicModule.TESTNET_LIVE_ACKNOWLEDGEMENT,
  );
  await assert.rejects(assertZenonNodeReady(
    noReadZenon,
    sdk,
    undefined,
    artifact.chainProfile,
    { operatorTrustedChainPolicy: publicPolicy },
  ), { code: 'operator_trusted_chain_policy_invalid' });
  assert.throws(
    () => new ExactZenonClient({ operatorTrustedChainPolicy: policy, environment: {} }),
    { code: 'operator_trusted_chain_policy_invalid' },
  );
  assert.throws(
    () => new ExactZenonFacilitator({ operatorTrustedChainPolicy: policy, environment: {} }),
    { code: 'operator_trusted_chain_policy_invalid' },
  );
  await assert.rejects(probeZenonRoleReadiness({
    role: 'buyer',
    asset: sdk.ZNN_ZTS.toString(),
    expectedChainProfile: artifact.chainProfile,
    operatorTrustedChainPolicy: policy,
    environment: {
      ZENON_LIVE_ACK: 'I_UNDERSTAND_TESTNET_ONLY',
      ZENON_NETWORK_ID: '3',
    },
  }), { code: 'operator_trusted_chain_policy_invalid' });
  assert.equal(sdk.Zenon.getNetworkID(), networkIdBefore);
  assert.equal(sdk.Zenon.getChainIdentifier(), chainIdBefore);
});

test('synchronous Proxy observation failures are sanitized without traps', async () => {
  const timeoutError = new LiveRuntimeError('synthetic read timeout', {
    code: LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT,
  });
  const timeout = synchronousObservationFailureFixture(timeoutError);
  await assert.rejects(timeout.promise, error => error === timeoutError);
  assertObservationFailureReadBoundary(timeout.counters);

  let proxyHooks = 0;
  const hostile = new Proxy(Object.create(null), {
    get(target, key, receiver) {
      proxyHooks += 1;
      return Reflect.get(target, key, receiver);
    },
    getOwnPropertyDescriptor(target, key) {
      proxyHooks += 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    getPrototypeOf(target) {
      proxyHooks += 1;
      return Reflect.getPrototypeOf(target);
    },
    ownKeys(target) {
      proxyHooks += 1;
      return Reflect.ownKeys(target);
    },
  });
  const rejected = synchronousObservationFailureFixture(hostile);
  await assert.rejects(rejected.promise, {
    code: 'operator_trusted_chain_observation_unavailable',
  });
  assert.equal(proxyHooks, 0);
  assertObservationFailureReadBoundary(rejected.counters);
});

test('synchronous accessor observation failures are sanitized without hooks', async () => {
  const poisonedError = new LiveRuntimeError('synthetic poisoned runtime', {
    code: LIVE_RUNTIME_ERROR_CODES.POISONED,
  });
  const poisoned = synchronousObservationFailureFixture(poisonedError);
  await assert.rejects(poisoned.promise, error => error === poisonedError);
  assertObservationFailureReadBoundary(poisoned.counters);

  let accessorHooks = 0;
  const countAccessor = value => ({
    configurable: true,
    get() {
      accessorHooks += 1;
      return value;
    },
    set() {
      accessorHooks += 1;
    },
  });
  const hostile = Object.create(null);
  Object.defineProperties(hostile, {
    code: countAccessor(undefined),
    then: countAccessor(undefined),
    toString: countAccessor(() => ''),
    valueOf: countAccessor(() => hostile),
    [Symbol.iterator]: countAccessor(() => ({ next: () => ({ done: true }) })),
  });
  const rejected = synchronousObservationFailureFixture(hostile);
  await assert.rejects(rejected.promise, {
    code: 'operator_trusted_chain_observation_unavailable',
  });
  assert.equal(accessorHooks, 0);
  assertObservationFailureReadBoundary(rejected.counters);
});

function requirement({ asset = sdk.ZNN_ZTS.toString() } = {}) {
  const seller = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 18));
  try {
    return {
      scheme: 'exact',
      network: 'zenon:testnet',
      asset,
      amount: '1',
      payTo: seller.getAddress().toString(),
      maxTimeoutSeconds: 1,
      extra: {
        paymentFlow: 'upfront',
        poc: true,
        settlement: 'account-block',
        zenonChain: { ...PROFILE },
      },
    };
  } finally {
    seller.clear();
  }
}

function challenge(accepted = requirement(), url = 'https://resource.example/paid') {
  return {
    x402Version: 2,
    resource: {
      url,
      description: 'Zenon x402 PoC protected resource',
      mimeType: 'application/json',
    },
    accepts: [accepted],
  };
}

function signedPayment(
  paymentRequired,
  accepted = paymentRequired.accepts[0],
  privateByte = 17,
  { height = 1, previousHash, nonce = '0000000000000000' } = {},
) {
  const buyer = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, privateByte));
  try {
    const block = sdk.AccountBlockTemplate.send(
      sdk.Address.parse(accepted.payTo),
      sdk.TokenStandard.parse(accepted.asset),
      BigInt(accepted.amount),
    );
    block.chainIdentifier = Number(accepted.extra.zenonChain.chainIdentifier);
    block.address = buyer.getAddress();
    block.height = height;
    if (previousHash) block.previousHash = previousHash;
    block.momentumAcknowledged = new sdk.HashHeight(
      sdk.Hash.digest(Buffer.from('synthetic acknowledged momentum')),
      1,
    );
    const intentDigest = paymentIntentDigest(paymentRequired, accepted);
    block.data = Buffer.from(intentDigest, 'hex');
    block.nonce = nonce;
    block.publicKey = buyer.getPublicKey();
    block.hash = computeBlockHash(block, sdk);
    block.signature = buyer.sign(block.hash.getBytes());
    return {
      x402Version: paymentRequired.x402Version,
      resource: structuredClone(paymentRequired.resource),
      accepted: structuredClone(accepted),
      payload: {
        transaction: block.toJson(),
        intentDigest,
      },
    };
  } finally {
    buyer.clear();
  }
}

function observedBlock(transaction, { included = false } = {}) {
  const block = sdk.AccountBlockTemplate.fromJson(transaction);
  block.publicKey = Buffer.from(transaction.publicKey, 'base64');
  block.signature = Buffer.from(transaction.signature, 'base64');
  if (included) {
    block.confirmationDetail = {
      numConfirmations: 1,
      momentumHeight: 11,
      momentumHash: sdk.Hash.digest(Buffer.from('synthetic inclusion momentum')),
      momentumTimestamp: 1,
    };
  }
  return block;
}

function accountInfo(address, {
  asset = sdk.ZNN_ZTS.toString(),
  balance = 1n,
  blockCount = 0,
  includeAsset = true,
  tokenStandard = asset,
  balanceInfoMap,
} = {}) {
  const selectedTokenStandard = sdk.TokenStandard.parse(tokenStandard);
  const token = new sdk.Token(
    'Synthetic',
    'SYN',
    '',
    balance < 0n ? 0n : balance,
    8,
    address,
    selectedTokenStandard,
    balance < 0n ? 0n : balance,
    false,
    false,
    false,
  );
  const balances = balanceInfoMap ?? (includeAsset ? {
    [asset]: new sdk.BalanceInfoListItem(token, balance),
  } : {});
  return new sdk.AccountInfo(address, blockCount, balances);
}

async function journalFixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'zenon-x402-live-integration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'state');
  return {
    root,
    directory,
    journal: new SettlementJournal({ directory, allowedRoot: root, ...options }),
  };
}

function installSyntheticNode(t, behavior = {}) {
  const zenon = sdk.Zenon.getInstance();
  const original = {
    initialize: zenon.initialize,
    prepareBlock: zenon.prepareBlock,
    clearConnection: zenon.clearConnection,
    ledger: zenon.ledger,
    stats: zenon.stats,
    subscribe: zenon.subscribe,
    embedded: zenon.embedded,
    hadClient: Object.hasOwn(zenon, 'client'),
    client: zenon.client,
    chainIdentifier: sdk.Zenon.getChainIdentifier(),
    networkId: sdk.Zenon.getNetworkID(),
  };
  const counters = {
    initialize: 0,
    clearConnection: 0,
    lookup: 0,
    frontier: 0,
    unconfirmed: 0,
    assetLookup: 0,
    balanceLookup: 0,
    publish: 0,
    subscribe: 0,
    prepareBlock: 0,
  };

  zenon.initialize = async () => {
    counters.initialize += 1;
    zenon.client = { synthetic: true };
    return behavior.initialize?.();
  };
  zenon.clearConnection = () => {
    counters.clearConnection += 1;
    zenon.client = undefined;
    return behavior.clearConnection?.();
  };
  zenon.prepareBlock = async (block, keyPair) => {
    counters.prepareBlock += 1;
    if (typeof behavior.prepareBlock === 'function') {
      return behavior.prepareBlock(block, keyPair, counters.prepareBlock);
    }
    return original.prepareBlock.call(zenon, block, keyPair);
  };
  zenon.stats = {
    networkInfo: async () => ({
      numPeers: 1,
      self: { publicKey: 'synthetic-node-public-key', ip: 'loopback' },
      peers: [],
    }),
    syncInfo: async () => ({
      state: sdk.SyncState.SyncDone,
      currentHeight: 10,
      targetHeight: 10,
    }),
  };
  zenon.embedded = {
    token: {
      getByZts: async tokenStandard => {
        counters.assetLookup += 1;
        return behavior.asset?.(tokenStandard, counters.assetLookup) ?? { tokenStandard };
      },
    },
  };
  zenon.ledger = {
    getFrontierMomentum: async () => ({
      chainIdentifier: Number(PROFILE.chainIdentifier),
      height: 10,
      hash: sdk.Hash.digest(Buffer.from('synthetic frontier momentum')),
    }),
    getAccountBlockByHash: async hash => {
      counters.lookup += 1;
      if (typeof behavior.lookup === 'function') return behavior.lookup(counters.lookup, hash);
      return null;
    },
    getAccountInfoByAddress: async address => {
      counters.balanceLookup += 1;
      if (typeof behavior.accountInfo === 'function') {
        return behavior.accountInfo(address, counters.balanceLookup);
      }
      return accountInfo(address);
    },
    getFrontierAccountBlock: async () => {
      counters.frontier += 1;
      return behavior.frontier?.(counters.frontier) ?? null;
    },
    getUnconfirmedBlocksByAddress: async (_address, page, pageSize) => {
      counters.unconfirmed += 1;
      return behavior.unconfirmed?.({ page, pageSize, call: counters.unconfirmed }) ?? { count: 0, list: [] };
    },
    publishRawTransaction: async block => {
      counters.publish += 1;
      return behavior.publish?.(block, counters.publish);
    },
  };
  zenon.subscribe = {
    toAccountBlocksByAddress: async () => {
      counters.subscribe += 1;
      return {
        onNotification(callback) {
          behavior.onSubscription?.(callback);
        },
      };
    },
  };

  t.after(() => {
    zenon.initialize = original.initialize;
    zenon.prepareBlock = original.prepareBlock;
    zenon.clearConnection = original.clearConnection;
    zenon.ledger = original.ledger;
    zenon.stats = original.stats;
    zenon.subscribe = original.subscribe;
    zenon.embedded = original.embedded;
    if (original.hadClient) zenon.client = original.client;
    else delete zenon.client;
    sdk.Zenon.setChainID(original.chainIdentifier);
    sdk.Zenon.setNetworkID(original.networkId);
  });

  return { zenon, counters, behavior };
}

function facilitator(journal, options = {}) {
  const configuration = {
    journal,
    rpcTimeoutMs: options.rpcTimeoutMs ?? 100,
    authenticateChainProfile: async () => ({ ...PROFILE }),
  };
  if (Object.hasOwn(options, 'reconciliationRetentionMs')) {
    configuration.reconciliationRetentionMs = options.reconciliationRetentionMs;
  }
  if (Object.hasOwn(options, 'lifecycleObserver')) {
    configuration.lifecycleObserver = options.lifecycleObserver;
  }
  return new ExactZenonFacilitator(configuration);
}

function submit(localUrl, payload) {
  return fetch(`${localUrl}/paid`, {
    headers: { [HEADERS.PAYMENT_SIGNATURE]: encodeB64Json(payload) },
  });
}

function reverseMemberOrder(value) {
  if (Array.isArray(value)) return value.map(reverseMemberOrder);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).reverse().map(key => [key, reverseMemberOrder(value[key])]));
}

function deferred() {
  let resolve;
  const promise = new Promise(complete => { resolve = complete; });
  return { promise, resolve };
}

const MAINTENANCE_RESULT_KEYS = Object.freeze([
  'examined', 'included', 'acknowledged', 'terminalized',
  'lateInclusionRecorded', 'unavailable', 'capacityBlocked', 'conflicted',
  'unchanged', 'remainingInCycle', 'cycleComplete',
]);

function assertMaintenanceResult(result, expected) {
  assert.equal(isDeepStrictEqual(Object.keys(result), MAINTENANCE_RESULT_KEYS), true);
  for (const [key, value] of Object.entries(expected)) assert.equal(result[key], value);
  const outcomeTotal = [
    'included', 'acknowledged', 'terminalized', 'lateInclusionRecorded',
    'unavailable', 'capacityBlocked', 'conflicted', 'unchanged',
  ].reduce((total, key) => total + result[key], 0);
  assert.equal(outcomeTotal, result.examined);
  assert.equal(Object.isFrozen(result), true);
  const thenDescriptor = Object.getOwnPropertyDescriptor(result, 'then');
  assert.ok(thenDescriptor);
  assert.equal(thenDescriptor.value, undefined);
  assert.equal(thenDescriptor.enumerable, false);
  assert.equal(thenDescriptor.writable, false);
  assert.equal(thenDescriptor.configurable, false);
}

async function persistRecord(journal, payload, accepted, required, evidenceState = EVIDENCE_STATES.VALIDATED) {
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
    await journal.updateEvidence(preflight.authorizationKey, preflight.transactionHash, evidenceState);
  }
  return preflight;
}

test('ExactZenonFacilitator deterministic settlement integration scenarios', async t => {
  const priorEnvironment = {
    ZENON_LIVE_ACK: process.env.ZENON_LIVE_ACK,
    ZENON_NETWORK_ID: process.env.ZENON_NETWORK_ID,
    ZENON_RPC_URL: process.env.ZENON_RPC_URL,
  };
  process.env.ZENON_LIVE_ACK = 'I_UNDERSTAND_TESTNET_ONLY';
  process.env.ZENON_NETWORK_ID = '3';
  process.env.ZENON_RPC_URL = 'ws://rpc.invalid';
  t.after(() => {
    for (const [key, value] of Object.entries(priorEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  await t.test('scenario 1: the exact signed block is durable before publication', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    required.resource.serviceName = 'Service';
    required.resource.tags = ['alpha', 'alpha', 'beta'];
    required.resource.iconUrl = 'HTTPS://icons.example:443/a%2Fb.png?size=2#mark';
    const payload = signedPayment(required, accepted);
    payload.extensions = {};
    const preflight = await preflightZenonPayment(payload, accepted, required);
    assert.deepEqual(preflight.resourceIdentity, required.resource);
    const { root, directory, journal } = await journalFixture(t);
    const included = observedBlock(payload.payload.transaction, { included: true });
    let published = false;
    const { counters } = installSyntheticNode(t, {
      lookup: () => published ? included : null,
      publish: async block => {
        const persisted = await journal.get(preflight.authorizationKey, preflight.transactionHash);
        assert.equal(persisted.evidenceState, EVIDENCE_STATES.VALIDATED);
        assert.deepEqual(persisted.signedAccountBlock, payload.payload.transaction);
        assert.equal(block.hash.toString(), preflight.transactionHash);
        published = true;
      },
    });

    const result = await facilitator(journal).settle(payload, accepted, required);
    assert.equal(result.success, true);
    assert.equal(result.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(counters.publish, 1);
    const persisted = await journal.get(preflight.authorizationKey, preflight.transactionHash);
    assert.equal(persisted.evidenceState, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.deepEqual(persisted.resourceIdentity, required.resource);
    const reloaded = new SettlementJournal({ directory, allowedRoot: root });
    assert.deepEqual(
      (await reloaded.get(preflight.authorizationKey, preflight.transactionHash)).resourceIdentity,
      required.resource,
    );
  });

  await t.test('scenario 2: included retry bypasses an advanced frontier and never republishes', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted);
    const { journal } = await journalFixture(t);
    const included = observedBlock(payload.payload.transaction, { included: true });
    let published = false;
    const node = installSyntheticNode(t, {
      lookup: () => published ? included : null,
      publish: async () => { published = true; },
      frontier: () => published ? {
        height: 99,
        hash: sdk.Hash.digest(Buffer.from('advanced external frontier')),
      } : null,
    });
    const exact = facilitator(journal);

    const first = await exact.settle(payload, accepted, required);
    assert.equal(first.success, true);
    const countsAfterFirst = { ...node.counters };
    const retry = await exact.settle(payload, accepted, required);
    assert.equal(retry.success, true);
    assert.equal(retry.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(node.counters.publish, 1);
    assert.equal(node.counters.initialize, countsAfterFirst.initialize);
    assert.equal(node.counters.frontier, countsAfterFirst.frontier);
  });

  await t.test('scenario 3: acknowledged retry reconciles inclusion without republishing', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted);
    const preflight = await preflightZenonPayment(payload, accepted, required);
    const { journal } = await journalFixture(t);
    const included = observedBlock(payload.payload.transaction, { included: true });
    let phase = 'initial';
    const node = installSyntheticNode(t, {
      lookup: () => {
        if (phase === 'initial') return null;
        if (phase === 'observation-error') throw new Error('synthetic observation failure');
        return included;
      },
      frontier: () => {
        if (phase === 'included') throw new Error('known transaction retry must not query the advanced frontier');
        return null;
      },
      publish: async () => { phase = 'observation-error'; },
    });
    const exact = facilitator(journal);

    const first = await exact.settle(payload, accepted, required);
    assert.equal(first.success, false);
    assert.equal(first.state, EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED);
    assert.equal(first.retrySamePayment, true);
    assert.equal((await journal.get(preflight.authorizationKey, preflight.transactionHash)).evidenceState,
      EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED);

    const frontierCallsBeforeRetry = node.counters.frontier;
    phase = 'included';
    const retry = await exact.settle(payload, accepted, required);
    assert.equal(retry.success, true);
    assert.equal(retry.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(node.counters.publish, 1);
    assert.equal(node.counters.frontier, frontierCallsBeforeRetry);
  });

  await t.test('scenario 4: publish response loss reconciles the same known transaction', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted);
    const { journal } = await journalFixture(t);
    const observed = observedBlock(payload.payload.transaction);
    const included = observedBlock(payload.payload.transaction, { included: true });
    let phase = 'unknown';
    const node = installSyntheticNode(t, {
      lookup: () => {
        if (phase === 'known') {
          phase = 'included';
          return observed;
        }
        return phase === 'included' ? included : null;
      },
      publish: async () => {
        phase = 'known';
        throw new Error('synthetic response loss');
      },
    });

    const result = await facilitator(journal).settle(payload, accepted, required);
    assert.equal(result.success, true);
    assert.equal(result.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(node.counters.publish, 1);
  });

  await t.test('scenario 5: ambiguous evidence survives reload and reconciles without republishing', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    required.resource.serviceName = 'Service';
    required.resource.tags = [];
    required.resource.iconUrl = 'http://localhost/icon.png?size=2#mark';
    const payload = signedPayment(required, accepted);
    const preflight = await preflightZenonPayment(payload, accepted, required);
    assert.deepEqual(preflight.resourceIdentity, required.resource);
    const { root, directory, journal } = await journalFixture(t);
    const included = observedBlock(payload.payload.transaction, { included: true });
    let phase = 'unknown';
    const node = installSyntheticNode(t, {
      lookup: () => phase === 'included' ? included : null,
      publish: async () => { throw new Error('synthetic uncertain publication'); },
    });

    const first = await facilitator(journal).settle(payload, accepted, required);
    assert.equal(first.success, false);
    assert.equal(first.state, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
    assert.equal(first.retrySamePayment, true);

    const reloaded = new SettlementJournal({ directory, allowedRoot: root });
    const persisted = await reloaded.get(preflight.authorizationKey, preflight.transactionHash);
    assert.equal(persisted.evidenceState, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
    assert.deepEqual(persisted.resourceIdentity, required.resource);
    phase = 'included';
    const retry = await facilitator(reloaded).settle(payload, accepted, required);
    assert.equal(retry.success, true);
    assert.equal(retry.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(node.counters.publish, 1);
  });

  await t.test('hostile gate: an unknown same-frontier payment contains its distinct loser and exact retry reconciles', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const previousHash = sdk.Hash.digest(Buffer.from('shared prepared payer frontier'));
    const original = signedPayment(required, accepted, 46, { height: 2, previousHash });
    const distinct = signedPayment(required, accepted, 46, {
      height: 2,
      previousHash,
      nonce: '0000000000000001',
    });
    const originalPreflight = await preflightZenonPayment(original, accepted, required);
    const distinctPreflight = await preflightZenonPayment(distinct, accepted, required);
    const exactEncodedOriginal = encodeB64Json(original);

    // This is the controlled one-outstanding-payment case: both valid blocks
    // were prepared for one payer and one frontier before either publication.
    // It does not claim general multi-wallet coordination or consensus expiry.
    assert.equal(originalPreflight.payer, distinctPreflight.payer);
    assert.equal(originalPreflight.intentDigest, distinctPreflight.intentDigest);
    assert.equal(originalPreflight.resourceDigest, distinctPreflight.resourceDigest);
    assert.equal(original.payload.transaction.height, distinct.payload.transaction.height);
    assert.equal(original.payload.transaction.previousHash, distinct.payload.transaction.previousHash);
    assert.notEqual(originalPreflight.transactionHash, distinctPreflight.transactionHash);
    assert.notEqual(exactEncodedOriginal, encodeB64Json(distinct));

    const { journal } = await journalFixture(t);
    const includedOriginal = observedBlock(original.payload.transaction, { included: true });
    let phase = 'before-publication';
    const exactLookups = { original: 0, distinct: 0 };
    const node = installSyntheticNode(t, {
      lookup: (_call, hash) => {
        const transactionHash = hash.toString();
        if (transactionHash === originalPreflight.transactionHash) {
          exactLookups.original += 1;
          return phase === 'included' ? includedOriginal : null;
        }
        if (transactionHash === distinctPreflight.transactionHash) {
          exactLookups.distinct += 1;
          return null;
        }
        throw new Error('unexpected synthetic exact-hash lookup');
      },
      // Keep the balance snapshot stale so the current frontier, not the
      // account-info cache, is the decisive same-frontier rejection.
      accountInfo: address => accountInfo(address, { blockCount: 1 }),
      frontier: () => phase === 'included'
        ? { height: 2, hash: sdk.Hash.parse(originalPreflight.transactionHash) }
        : { height: 1, hash: previousHash },
      publish: block => {
        assert.equal(block.hash.toString(), originalPreflight.transactionHash);
        phase = 'response-lost';
        return Promise.reject(new Error('synthetic publication response loss'));
      },
    });
    const exact = facilitator(journal);
    const first = await exact.settle(original, accepted, required);
    assert.equal(first.success, false);
    assert.equal(first.state, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
    assert.equal(first.errorReason, 'submission_outcome_unknown');
    assert.equal(first.retrySamePayment, true);
    assert.equal(first.deliveryState, DELIVERY_STATES.NONE);
    assert.equal(node.counters.publish, 1);
    const durableUnknown = await journal.get(
      originalPreflight.authorizationKey,
      originalPreflight.transactionHash,
    );
    assert.equal(durableUnknown.evidenceState, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
    assert.deepEqual(durableUnknown.signedAccountBlock, original.payload.transaction);

    // A later observation of the original bearer does not authorize a
    // different block. The loser is rejected before publication or delivery.
    phase = 'included';
    const frontierCallsBeforeDistinct = node.counters.frontier;
    const distinctResult = await exact.settle(distinct, accepted, required);
    assert.equal(distinctResult.success, false);
    assert.equal(distinctResult.state, EVIDENCE_STATES.VALIDATED);
    assert.equal(distinctResult.errorReason, 'stale_height');
    assert.equal(distinctResult.retrySamePayment, false);
    assert.equal(distinctResult.deliveryState, DELIVERY_STATES.NONE);
    assert.equal(exactLookups.distinct > 0, true);
    assert.equal(node.counters.frontier, frontierCallsBeforeDistinct + 1);
    assert.equal(node.counters.publish, 1);
    assert.equal(
      await journal.get(distinctPreflight.authorizationKey, distinctPreflight.transactionHash),
      null,
    );

    const beforeExactRetry = { ...node.counters };
    const originalLookupsBeforeRetry = exactLookups.original;
    assert.equal(encodeB64Json(original), exactEncodedOriginal);
    const recovered = await exact.settle(original, accepted, required);
    assert.equal(recovered.success, true);
    assert.equal(recovered.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(recovered.deliveryState, DELIVERY_STATES.NONE);
    assert.equal(node.counters.publish, beforeExactRetry.publish);
    assert.equal(node.counters.balanceLookup, beforeExactRetry.balanceLookup);
    assert.equal(node.counters.frontier, beforeExactRetry.frontier);
    assert.equal(node.counters.unconfirmed, beforeExactRetry.unconfirmed);
    assert.equal(exactLookups.original, originalLookupsBeforeRetry + 1);
    const durableIncluded = await journal.get(
      originalPreflight.authorizationKey,
      originalPreflight.transactionHash,
    );
    assert.equal(durableIncluded.evidenceState, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(durableIncluded.deliveryState, DELIVERY_STATES.NONE);
    assert.deepEqual(durableIncluded.signedAccountBlock, original.payload.transaction);

    const afterReconciliation = { ...node.counters };
    const reconciledRetry = await exact.settle(original, accepted, required);
    assert.equal(reconciledRetry.success, true);
    assert.equal(reconciledRetry.authorizationKey, recovered.authorizationKey);
    assert.equal(reconciledRetry.transaction, recovered.transaction);
    assert.deepEqual(node.counters, afterReconciliation);
  });

  await t.test('scenario 5 evidence: asset validation precedes observation and inclusion is durable', async t => {
    const syntheticZts = sdk.TokenStandard.fromCore(Buffer.alloc(10, 0x42)).toString();
    const accepted = requirement({ asset: syntheticZts });
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted);
    const preflight = await preflightZenonPayment(payload, accepted, required);
    const { journal } = await journalFixture(t);
    const included = observedBlock(payload.payload.transaction, { included: true });
    const events = [];
    const putValidated = journal.putValidated.bind(journal);
    const updateEvidence = journal.updateEvidence.bind(journal);
    journal.putValidated = async input => {
      events.push('journal:validated');
      return putValidated(input);
    };
    journal.updateEvidence = async (...args) => {
      events.push(`journal:${args[2]}`);
      return updateEvidence(...args);
    };
    const node = installSyntheticNode(t, {
      lookup: () => {
        events.push('lookup');
        return included;
      },
      asset: tokenStandard => {
        events.push('asset');
        assert.equal(tokenStandard.toString(), syntheticZts);
        return { tokenStandard };
      },
    });
    const exact = facilitator(journal);

    const first = await exact.settle(payload, accepted, required);
    assert.equal(first.success, true);
    assert.equal(first.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(node.counters.balanceLookup, 0);
    assert.equal(node.counters.publish, 0);
    assert.ok(events.indexOf('asset') < events.indexOf('lookup'));
    assert.ok(events.indexOf('lookup') < events.indexOf('journal:validated'));
    assert.ok(events.indexOf('journal:validated') < events.indexOf(`journal:${EVIDENCE_STATES.MOMENTUM_INCLUDED}`));
    assert.equal((await journal.get(preflight.authorizationKey, preflight.transactionHash)).evidenceState,
      EVIDENCE_STATES.MOMENTUM_INCLUDED);

    const initializeCalls = node.counters.initialize;
    node.behavior.asset = () => { throw new Error('durable retry must not repeat asset lookup'); };
    node.behavior.lookup = () => { throw new Error('durable retry must not repeat transaction lookup'); };
    const retry = await exact.settle(payload, accepted, required);
    assert.equal(retry.success, true);
    assert.equal(retry.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(node.counters.publish, 0);
    assert.equal(node.counters.initialize, initializeCalls);
  });

  await t.test('first-attempt payer balance preflight is bounded and reconciliation-safe', async t => {
    async function submitSettlement(exact, accepted, payload) {
      let internal;
      let deliveries = 0;
      const app = createResourceServer({
        facilitator: {
          settle: async (...args) => {
            internal = await exact.settle(...args);
            return internal;
          },
        },
        requirement: accepted,
        advertisedBaseUrl: 'https://resource.example',
        resourceHandler: async () => ({ ok: true, deliveries: ++deliveries }),
      });
      const listening = await app.listen();
      try {
        const response = await submit(listening.url, payload);
        const rawBody = await response.text();
        let body;
        try {
          body = JSON.parse(rawBody);
        } catch {
          assert.fail('response body must be valid JSON');
        }
        const responseHeader = response.headers.get(HEADERS.PAYMENT_RESPONSE);
        return {
          status: response.status,
          rawBody,
          body,
          settlement: responseHeader === null ? null : decodeB64Json(responseHeader),
          hasRequired: response.headers.get(HEADERS.PAYMENT_REQUIRED) !== null,
          hasResponse: responseHeader !== null,
          headerValuesArePrivate: [...response.headers.values()].every(value =>
            !value.includes('insufficient_payer_balance') &&
            !value.includes('payer_balance_')),
          internal,
          deliveries,
        };
      } finally {
        await app.close();
      }
    }

    await t.test('exact sufficient balance proceeds and verify performs no balance observation', async t => {
      const accepted = requirement();
      const required = challenge(accepted);
      const payload = signedPayment(required, accepted, 81);
      const { journal } = await journalFixture(t);
      const included = observedBlock(payload.payload.transaction, { included: true });
      let published = false;
      const node = installSyntheticNode(t, {
        accountInfo: address => accountInfo(address, { balance: BigInt(accepted.amount) }),
        lookup: () => published ? included : null,
        publish: async () => { published = true; },
      });
      const exact = facilitator(journal);

      const verification = await exact.verify(payload, accepted, required);
      assert.equal(verification.isValid, true);
      assert.equal(node.counters.balanceLookup, 0);

      const settlement = await exact.settle(payload, accepted, required);
      assert.equal(settlement.success, true);
      assert.equal(settlement.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
      assert.equal(node.counters.balanceLookup, 1);
      assert.equal(node.counters.publish, 1);
    });

    for (const variant of [
      {
        name: 'one-unit-short balance',
        observe: address => accountInfo(address, { balance: 0n }),
      },
      {
        name: 'missing requested asset entry',
        observe: address => accountInfo(address, { includeAsset: false }),
      },
    ]) {
      await t.test(`${variant.name} is a private definite rejection before durable effects`, async t => {
        const accepted = requirement();
        const required = challenge(accepted);
        const payload = signedPayment(required, accepted, 82);
        const { journal } = await journalFixture(t);
        const node = installSyntheticNode(t, {
          accountInfo: variant.observe,
          lookup: () => null,
        });
        const response = await submitSettlement(facilitator(journal), accepted, payload);

        assert.equal(response.status, 402);
        assert.equal(response.hasRequired, true);
        assert.equal(response.hasResponse, true);
        assert.equal(response.headerValuesArePrivate, true);
        assert.equal(response.rawBody.includes('insufficient_payer_balance'), false);
        assert.equal(response.rawBody.includes('payer_balance_'), false);
        assert.equal(isDeepStrictEqual(response.body, { error: 'payment_settlement_failed' }), true);
        assert.equal(response.settlement.errorReason, 'payment_settlement_failed');
        assert.equal(Object.hasOwn(response.settlement, 'retrySamePayment'), false);
        assert.equal(response.internal.errorReason, 'insufficient_payer_balance');
        assert.equal(response.internal.retrySamePayment, false);
        assert.equal(response.internal.state, EVIDENCE_STATES.VALIDATED);
        assert.equal(response.internal.deliveryState, DELIVERY_STATES.NONE);
        assert.equal(response.deliveries, 0);
        assert.equal(node.counters.balanceLookup, 1);
        assert.equal(node.counters.lookup, 2);
        assert.equal(node.counters.frontier, 0);
        assert.equal(node.counters.unconfirmed, 0);
        assert.equal(node.counters.subscribe, 0);
        assert.equal(node.counters.publish, 0);
        assert.equal((await journal.list()).length, 0);
      });
    }

    const uncertaintyVariants = [
      {
        name: 'balance RPC rejection',
        observe: () => { throw new Error(); },
        expectedBalanceCalls: 1,
        expectedLookups: 1,
      },
      {
        name: 'balance read timeout',
        observe: () => {
          const error = new Error();
          error.code = LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT;
          throw error;
        },
        expectedBalanceCalls: 1,
        expectedLookups: 1,
      },
      {
        name: 'null account observation',
        observe: () => null,
      },
      {
        name: 'account accessor',
        setup: address => {
          let reads = 0;
          const value = Object.create(sdk.AccountInfo.prototype);
          Object.defineProperties(value, {
            address: { enumerable: true, get: () => { reads += 1; return address; } },
            blockCount: { enumerable: true, value: 0 },
            balanceInfoMap: { enumerable: true, value: {} },
          });
          return { value, assertSafe: () => assert.equal(reads, 0) };
        },
      },
      {
        name: 'account proxy',
        setup: address => {
          let descriptorReads = 0;
          const value = new Proxy(accountInfo(address), {
            getOwnPropertyDescriptor(target, property) {
              descriptorReads += 1;
              return Reflect.getOwnPropertyDescriptor(target, property);
            },
          });
          return { value, assertSafe: () => assert.equal(descriptorReads, 0) };
        },
      },
      {
        name: 'payer mismatch',
        observe: () => accountInfo(sdk.Address.parse(requirement().payTo)),
      },
      {
        name: 'account-height mismatch',
        observe: address => accountInfo(address, { blockCount: 1 }),
      },
      {
        name: 'polluted balance map',
        observe: address => accountInfo(address, {
          balanceInfoMap: Object.create({ [sdk.ZNN_ZTS.toString()]: {} }),
        }),
      },
      {
        name: 'token-standard mismatch',
        observe: address => accountInfo(address, { tokenStandard: sdk.QSR_ZTS.toString() }),
      },
      {
        name: 'negative balance',
        observe: address => accountInfo(address, { balance: -1n }),
      },
      {
        name: 'non-bigint balance',
        setup: address => {
          const value = accountInfo(address);
          value.balanceInfoMap[sdk.ZNN_ZTS.toString()].balance = '1';
          return { value };
        },
      },
      {
        name: 'selected balance accessor',
        setup: address => {
          let reads = 0;
          const value = accountInfo(address);
          Object.defineProperty(value.balanceInfoMap[sdk.ZNN_ZTS.toString()], 'balance', {
            enumerable: true,
            configurable: true,
            get: () => { reads += 1; return 1n; },
          });
          return { value, assertSafe: () => assert.equal(reads, 0) };
        },
      },
      {
        name: 'non-object selected balance entry',
        setup: address => {
          const value = accountInfo(address);
          value.balanceInfoMap[sdk.ZNN_ZTS.toString()] = 1n;
          return { value };
        },
      },
      {
        name: 'non-first null account',
        observe: () => null,
        height: 2,
      },
      {
        name: 'second exact lookup rejection',
        observe: address => accountInfo(address),
        lookup: call => {
          if (call === 2) throw new Error();
          return null;
        },
      },
      {
        name: 'second exact lookup malformed evidence',
        observe: address => accountInfo(address),
        lookup: call => call === 2 ? {} : null,
      },
    ];
    for (const variant of uncertaintyVariants) {
      await t.test(`${variant.name} retains same-payment recovery and has no downstream effect`, async t => {
        const accepted = requirement();
        const required = challenge(accepted);
        const payload = signedPayment(required, accepted, 83, variant.height === 2 ? {
          height: 2,
          previousHash: sdk.Hash.digest(Buffer.from('synthetic prior account block')),
        } : {});
        const { journal } = await journalFixture(t);
        let assertSafe = () => {};
        const node = installSyntheticNode(t, {
          accountInfo: address => {
            if (variant.setup) {
              const prepared = variant.setup(address);
              assertSafe = prepared.assertSafe ?? assertSafe;
              return prepared.value;
            }
            return variant.observe(address);
          },
          lookup: variant.lookup ?? (() => null),
        });
        const response = await submitSettlement(facilitator(journal), accepted, payload);

        assertSafe();
        assert.equal(response.status, 409);
        assert.equal(response.hasResponse, true);
        assert.equal(response.headerValuesArePrivate, true);
        assert.equal(response.rawBody.includes('insufficient_payer_balance'), false);
        assert.equal(response.rawBody.includes('payer_balance_'), false);
        assert.equal(response.body.action, 'reuse_and_reconcile_same_payment');
        assert.equal(response.settlement.retrySamePayment, true);
        assert.equal(response.internal.retrySamePayment, true);
        assert.equal(response.internal.state, EVIDENCE_STATES.VALIDATED);
        assert.equal(response.internal.deliveryState, DELIVERY_STATES.NONE);
        assert.equal(response.deliveries, 0);
        assert.equal(node.counters.balanceLookup, variant.expectedBalanceCalls ?? 1);
        assert.equal(node.counters.lookup, variant.expectedLookups ?? 2);
        assert.equal(node.counters.frontier, 0);
        assert.equal(node.counters.unconfirmed, 0);
        assert.equal(node.counters.subscribe, 0);
        assert.equal(node.counters.publish, 0);
        assert.equal((await journal.list()).length, 0);
      });
    }

    await t.test('second exact lookup overrides an insufficient snapshot with included evidence', async t => {
      const accepted = requirement();
      const required = challenge(accepted);
      const payload = signedPayment(required, accepted, 84);
      const { journal } = await journalFixture(t);
      const included = observedBlock(payload.payload.transaction, { included: true });
      const node = installSyntheticNode(t, {
        accountInfo: address => accountInfo(address, { balance: 0n }),
        lookup: call => call === 2 ? included : null,
      });
      const settlement = await facilitator(journal).settle(payload, accepted, required);

      assert.equal(settlement.success, true);
      assert.equal(settlement.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
      assert.equal(node.counters.balanceLookup, 1);
      assert.equal(node.counters.lookup, 2);
      assert.equal(node.counters.frontier, 0);
      assert.equal(node.counters.unconfirmed, 0);
      assert.equal(node.counters.subscribe, 0);
      assert.equal(node.counters.publish, 0);
    });

    await t.test('a durable record appearing during the balance read prevents definite rejection', async t => {
      const accepted = requirement();
      const required = challenge(accepted);
      const payload = signedPayment(required, accepted, 85);
      const { journal } = await journalFixture(t);
      let persisted = false;
      const node = installSyntheticNode(t, {
        accountInfo: async address => {
          if (!persisted) {
            persisted = true;
            await persistRecord(
              journal,
              payload,
              accepted,
              required,
              EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
            );
          }
          return accountInfo(address, { balance: 0n });
        },
        lookup: () => null,
      });
      const settlement = await facilitator(journal).settle(payload, accepted, required);

      assert.equal(settlement.success, false, 'concurrent durable result remains non-success');
      assert.equal(settlement.retrySamePayment, true, 'concurrent durable result remains recoverable');
      assert.equal(
        settlement.state,
        EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
        'concurrent durable evidence is retained',
      );
      assert.equal(node.counters.balanceLookup, 1, 'one balance lookup completed');
      assert.equal(node.counters.lookup >= 2, true, 'the second exact lookup completed');
      assert.equal(node.counters.frontier, 0, 'frontier remained untouched');
      assert.equal(node.counters.unconfirmed, 0, 'unconfirmed pool remained untouched');
      assert.equal(node.counters.publish, 0, 'publication remained untouched');
    });

    await t.test('catch-time durable lookup overrides a definite balance rejection', async t => {
      const accepted = requirement();
      const required = challenge(accepted);
      const payload = signedPayment(required, accepted, 90);
      const { journal } = await journalFixture(t);
      const originalFind = journal.findByTransactionHash.bind(journal);
      const originalGet = journal.get.bind(journal);
      let findCalls = 0;
      let catchGetCalls = 0;
      journal.findByTransactionHash = async transactionHash => {
        findCalls += 1;
        if (findCalls === 3) {
          await persistRecord(
            journal,
            payload,
            accepted,
            required,
            EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
          );
          return null;
        }
        return originalFind(transactionHash);
      };
      journal.get = async (...args) => {
        catchGetCalls += 1;
        return originalGet(...args);
      };
      const node = installSyntheticNode(t, {
        accountInfo: address => accountInfo(address, { balance: 0n }),
        lookup: () => null,
      });
      const response = await submitSettlement(facilitator(journal), accepted, payload);

      assert.equal(response.status, 409);
      assert.equal(response.body.action, 'reuse_and_reconcile_same_payment');
      assert.equal(response.settlement.retrySamePayment, true);
      assert.equal(response.internal.retrySamePayment, true);
      assert.equal(response.internal.state, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
      assert.equal(response.rawBody.includes('insufficient_payer_balance'), false);
      assert.equal(response.headerValuesArePrivate, true);
      assert.equal(findCalls, 3);
      assert.equal(catchGetCalls, 1);
      assert.equal(node.counters.balanceLookup, 1);
      assert.equal(node.counters.lookup, 2);
      assert.equal(node.counters.frontier, 0);
      assert.equal(node.counters.unconfirmed, 0);
      assert.equal(node.counters.subscribe, 0);
      assert.equal(node.counters.publish, 0);
      assert.equal(response.deliveries, 0);
    });

    await t.test('a preseeded VALIDATED record alone bypasses the balance filter', async t => {
      const accepted = requirement();
      const required = challenge(accepted);
      const payload = signedPayment(required, accepted, 89);
      const { journal } = await journalFixture(t);
      await persistRecord(journal, payload, accepted, required);
      const included = observedBlock(payload.payload.transaction, { included: true });
      let published = false;
      const node = installSyntheticNode(t, {
        accountInfo: () => { throw new Error(); },
        lookup: () => published ? included : null,
        publish: async () => { published = true; },
      });
      const settlement = await facilitator(journal).settle(payload, accepted, required);

      assert.equal(settlement.success, true);
      assert.equal(settlement.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
      assert.equal(node.counters.balanceLookup, 0);
      assert.equal(node.counters.publish, 1);
    });

    await t.test('active durable retries and exact observations bypass the balance filter', async t => {
      const accepted = requirement();
      const required = challenge(accepted);

      const durablePayload = signedPayment(required, accepted, 86);
      const durableFixture = await journalFixture(t);
      await persistRecord(
        durableFixture.journal,
        durablePayload,
        accepted,
        required,
        EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
      );
      const durableIncluded = observedBlock(durablePayload.payload.transaction, { included: true });
      const durableNode = installSyntheticNode(t, { lookup: () => durableIncluded });
      const durableResult = await facilitator(durableFixture.journal).settle(durablePayload, accepted, required);
      assert.equal(durableResult.success, true);
      assert.equal(durableNode.counters.balanceLookup, 0);
      assert.equal(durableNode.counters.publish, 0);

      const observedPayload = signedPayment(required, accepted, 88);
      const observedFixture = await journalFixture(t);
      const observedIncluded = observedBlock(observedPayload.payload.transaction, { included: true });
      const observedNode = installSyntheticNode(t, { lookup: () => observedIncluded });
      const observedResult = await facilitator(observedFixture.journal)
        .settle(observedPayload, accepted, required);
      assert.equal(observedResult.success, true);
      assert.equal(observedNode.counters.balanceLookup, 0);
      assert.equal(observedNode.counters.publish, 0);
    });
  });

  await t.test('journal capacity rejects a new unrelated payment without same-payment retry', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const firstPayload = signedPayment(required, accepted, 17);
    const unrelatedPayload = signedPayment(required, accepted, 19);
    const firstPreflight = await preflightZenonPayment(firstPayload, accepted, required);
    const unrelatedPreflight = await preflightZenonPayment(unrelatedPayload, accepted, required);
    const { root, directory } = await journalFixture(t);
    const journal = new SettlementJournal({ directory, allowedRoot: root, maxRecords: 1 });
    const node = installSyntheticNode(t, {
      lookup: () => null,
      publish: async () => { throw new Error('synthetic publication rejection'); },
    });
    const exact = facilitator(journal);

    const first = await exact.settle(firstPayload, accepted, required);
    assert.equal(first.success, false);
    assert.equal(first.state, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
    assert.equal(first.retrySamePayment, true);
    assert.equal(node.counters.publish, 1);
    const firstRecord = await journal.get(firstPreflight.authorizationKey, firstPreflight.transactionHash);
    assert.equal(firstRecord !== null && typeof firstRecord === 'object', true);

    let internalSettlement;
    let deliveries = 0;
    const app = createResourceServer({
      facilitator: {
        settle: async (...args) => {
          internalSettlement = await exact.settle(...args);
          return internalSettlement;
        },
      },
      requirement: accepted,
      advertisedBaseUrl: 'https://resource.example',
      resourceHandler: async () => ({ ok: true, deliveries: ++deliveries }),
    });
    const listening = await app.listen();
    try {
      const response = await submit(listening.url, unrelatedPayload);
      const rawBody = await response.text();
      assert.equal(rawBody.includes('journal_capacity_exceeded'), false);
      assert.equal(
        [...response.headers.values()].every(value => !value.includes('journal_capacity_exceeded')),
        true,
      );
      let body;
      try {
        body = JSON.parse(rawBody);
      } catch {
        assert.fail('response body must be valid JSON');
      }
      const publicSettlement = decodeB64Json(response.headers.get(HEADERS.PAYMENT_RESPONSE));

      assert.equal(response.status, 402);
      assert.equal(
        isDeepStrictEqual(decodeB64Json(response.headers.get(HEADERS.PAYMENT_REQUIRED)), required),
        true,
      );
      assert.equal(isDeepStrictEqual(publicSettlement, {
        success: false,
        network: accepted.network,
        transaction: unrelatedPreflight.transactionHash,
        payer: unrelatedPreflight.payer,
        state: EVIDENCE_STATES.VALIDATED,
        errorReason: 'payment_settlement_failed',
      }), true);
      assert.equal(Object.hasOwn(publicSettlement, 'retrySamePayment'), false);
      assert.equal(isDeepStrictEqual(body, { error: 'payment_settlement_failed' }), true);
      assert.equal(response.headers.get('content-type') === 'application/json; charset=utf-8', true);
      assert.equal(response.headers.get('cache-control') === 'private, no-store, max-age=0', true);
      assert.equal(response.headers.get('vary') === 'PAYMENT-SIGNATURE', true);
      assert.equal(JSON.stringify(publicSettlement).includes('journal_capacity_exceeded'), false);
    } finally {
      await app.close();
    }

    assert.equal(internalSettlement.success, false);
    assert.equal(internalSettlement.state, EVIDENCE_STATES.VALIDATED);
    assert.equal(internalSettlement.errorReason, 'journal_capacity_exceeded');
    assert.equal(internalSettlement.retrySamePayment, false);
    assert.equal(internalSettlement.deliveryState, 'NONE');
    assert.equal(internalSettlement.network === accepted.network, true);
    assert.equal(internalSettlement.transaction === unrelatedPreflight.transactionHash, true);
    assert.equal(internalSettlement.payer === unrelatedPreflight.payer, true);
    assert.equal(node.counters.publish, 1);
    assert.equal(deliveries, 0);
    const retained = await journal.list();
    assert.equal(retained.length, 1);
    assert.equal(retained[0].evidenceState, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
    assert.equal(isDeepStrictEqual(retained[0], firstRecord), true);
    assert.equal(
      await journal.get(unrelatedPreflight.authorizationKey, unrelatedPreflight.transactionHash) === null,
      true,
    );
  });

  await t.test('initial journal file capacity fails before publication without same-payment retry', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted);
    const { root, directory } = await journalFixture(t);
    const journal = new SettlementJournal({
      directory,
      allowedRoot: root,
      maxFileBytes: 1024,
    });
    const node = installSyntheticNode(t, { lookup: () => null });

    const result = await facilitator(journal).settle(payload, accepted, required);
    assert.equal(result.success, false);
    assert.equal(result.state, EVIDENCE_STATES.VALIDATED);
    assert.equal(result.errorReason, 'journal_capacity_exceeded');
    assert.equal(result.retrySamePayment, false);
    assert.equal(result.deliveryState, 'NONE');
    assert.equal(node.counters.publish, 0);
    assert.equal((await journal.list()).length, 0);
  });

  await t.test('post-publication journal file capacity preserves same-payment recovery', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted);
    const preflight = await preflightZenonPayment(payload, accepted, required);
    const { root, directory } = await journalFixture(t);
    let journal;
    let clockCalls = 0;
    const clock = () => {
      clockCalls += 1;
      if (clockCalls === 2) journal.maxFileBytes = 1024;
      return new Date();
    };
    journal = new SettlementJournal({ directory, allowedRoot: root, clock });
    const updateEvidence = journal.updateEvidence.bind(journal);
    journal.updateEvidence = async (...args) => {
      try {
        return await updateEvidence(...args);
      } finally {
        journal.maxFileBytes = 16 * 1024 * 1024;
      }
    };
    const node = installSyntheticNode(t, {
      lookup: () => null,
      publish: async () => {},
    });

    const result = await facilitator(journal).settle(payload, accepted, required);
    assert.equal(result.success, false);
    assert.equal(result.state, EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED);
    assert.equal(result.errorReason, 'journal_capacity_exceeded');
    assert.equal(result.retrySamePayment, true);
    assert.equal(result.deliveryState, 'NONE');
    assert.equal(node.counters.publish, 1);
    const persisted = await journal.get(preflight.authorizationKey, preflight.transactionHash);
    assert.equal(persisted.evidenceState, EVIDENCE_STATES.VALIDATED);
  });

  for (const transition of ['pending', 'delivered']) {
    await t.test(`journal file capacity at ${transition} delivery preserves recovery`, async t => {
      const accepted = requirement();
      const required = challenge(accepted);
      const payload = signedPayment(required, accepted);
      const preflight = await preflightZenonPayment(payload, accepted, required);
      const { root, directory } = await journalFixture(t);
      let forceCapacity = false;
      let journal;
      const clock = () => {
        if (forceCapacity) journal.maxFileBytes = 1024;
        return new Date();
      };
      journal = new SettlementJournal({ directory, allowedRoot: root, clock });
      const transitionMethod = transition === 'pending' ? 'markDeliveryPending' : 'markDelivered';
      const originalTransition = journal[transitionMethod].bind(journal);
      let transitionErrorCode;
      journal[transitionMethod] = async (...args) => {
        forceCapacity = true;
        try {
          return await originalTransition(...args);
        } catch (error) {
          transitionErrorCode = error?.code;
          throw error;
        } finally {
          forceCapacity = false;
          journal.maxFileBytes = 16 * 1024 * 1024;
        }
      };
      const included = observedBlock(payload.payload.transaction, { included: true });
      const node = installSyntheticNode(t, { lookup: () => included });
      const exact = facilitator(journal);
      let deliveries = 0;
      const app = createResourceServer({
        facilitator: exact,
        requirement: accepted,
        advertisedBaseUrl: 'https://resource.example',
        resourceHandler: async () => ({ ok: true, deliveries: ++deliveries }),
      });
      const listening = await app.listen();
      try {
        const response = await submit(listening.url, payload);
        const recovery = decodeB64Json(response.headers.get(HEADERS.PAYMENT_RESPONSE));
        assert.equal(response.status, 409);
        assert.equal((await response.json()).action, 'reuse_and_reconcile_same_payment');
        assert.equal(recovery.state, 'DELIVERY_PENDING');
        assert.equal(recovery.retrySamePayment, true);
      } finally {
        await app.close();
      }
      assert.equal(deliveries, transition === 'pending' ? 0 : 1);
      assert.equal(node.counters.publish, 0);
      assert.equal(transitionErrorCode, 'journal_capacity_exceeded');
      const persisted = await journal.get(preflight.authorizationKey, preflight.transactionHash);
      assert.equal(persisted.evidenceState, EVIDENCE_STATES.MOMENTUM_INCLUDED);
      assert.equal(persisted.deliveryState, transition === 'pending' ? 'NONE' : 'DELIVERY_PENDING');
    });
  }

  await t.test('scenario 6: a definite pre-publication frontier failure emits bound HTTP rejection evidence', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted, 17, {
      height: 2,
      previousHash: sdk.Hash.digest(Buffer.from('submitted account frontier')),
    });
    const { journal } = await journalFixture(t);
    const node = installSyntheticNode(t, {
      lookup: () => null,
      accountInfo: address => accountInfo(address, { blockCount: 1 }),
      frontier: () => ({
        height: 1,
        hash: sdk.Hash.digest(Buffer.from('stale frontier')),
      }),
    });
    const exact = facilitator(journal);
    let internalSettlement;
    let deliveries = 0;
    const app = createResourceServer({
      facilitator: {
        settle: async (...args) => {
          internalSettlement = await exact.settle(...args);
          return internalSettlement;
        },
      },
      requirement: accepted,
      advertisedBaseUrl: 'https://resource.example',
      resourceHandler: async () => ({ ok: true, deliveries: ++deliveries }),
    });
    const listening = await app.listen();
    try {
      const response = await submit(listening.url, payload);
      const body = await response.json();
      assert.ok(response.headers.get(HEADERS.PAYMENT_REQUIRED));
      assert.ok(response.headers.get(HEADERS.PAYMENT_RESPONSE));
      const rejectionRequired = decodeB64Json(response.headers.get(HEADERS.PAYMENT_REQUIRED));
      const settlement = decodeB64Json(response.headers.get(HEADERS.PAYMENT_RESPONSE));

      assert.equal(response.status, 402);
      assert.deepEqual(rejectionRequired, required);
      assert.deepEqual(body, { error: 'payment_settlement_failed' });
      assert.deepEqual(settlement, {
        success: false,
        network: accepted.network,
        transaction: payload.payload.transaction.hash,
        payer: payload.payload.transaction.address,
        state: EVIDENCE_STATES.VALIDATED,
        errorReason: 'payment_settlement_failed',
      });
      assert.match(settlement.transaction, /^[0-9a-f]{64}$/);
      assert.equal(Object.hasOwn(settlement, 'retrySamePayment'), false);
      assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
      assert.equal(response.headers.get('vary'), 'PAYMENT-SIGNATURE');

      assert.equal(internalSettlement.success, false);
      assert.equal(internalSettlement.state, EVIDENCE_STATES.VALIDATED);
      assert.equal(internalSettlement.errorReason, 'stale_frontier');
      assert.equal(internalSettlement.retrySamePayment, false);
      assert.equal(internalSettlement.deliveryState, 'NONE');
      assert.equal(internalSettlement.network, accepted.network);
      assert.equal(internalSettlement.transaction, payload.payload.transaction.hash);
      assert.equal(internalSettlement.payer, payload.payload.transaction.address);
      assert.notEqual(internalSettlement.state, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
      assert.equal(node.counters.publish, 0);
      assert.equal(deliveries, 0);
      assert.equal((await journal.list()).length, 0);
    } finally {
      await app.close();
    }
  });

  await t.test('scenario 7: direct settle rejects offline tampering before initialize', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const original = signedPayment(required, accepted);
    const { journal } = await journalFixture(t);
    const node = installSyntheticNode(t);
    const exact = facilitator(journal);

    const wrongNetwork = structuredClone(accepted);
    wrongNetwork.network = 'zenon:mainnet';
    const wrongNetworkRequired = challenge(wrongNetwork);
    const wrongNetworkPayload = structuredClone(original);
    wrongNetworkPayload.accepted = wrongNetwork;
    wrongNetworkPayload.resource = structuredClone(wrongNetworkRequired.resource);

    const substitutedProfile = structuredClone(accepted);
    substitutedProfile.extra.zenonChain.genesisMomentumHash = '8'.repeat(64);
    const substitutedRequired = challenge(substitutedProfile);
    const substitutedPayload = structuredClone(original);
    substitutedPayload.accepted = substitutedProfile;
    substitutedPayload.resource = structuredClone(substitutedRequired.resource);

    const malformedProfile = structuredClone(accepted);
    malformedProfile.extra.zenonChain.unexpected = true;
    const malformedRequired = challenge(malformedProfile);
    const malformedPayload = structuredClone(original);
    malformedPayload.accepted = malformedProfile;
    malformedPayload.resource = structuredClone(malformedRequired.resource);

    const badSignature = structuredClone(original);
    badSignature.payload.transaction.signature = Buffer.alloc(64).toString('base64');

    const reboundRequired = challenge(accepted, 'https://resource.example/different');
    const reboundResource = structuredClone(original);
    reboundResource.resource = structuredClone(reboundRequired.resource);

    const changedSignedHash = structuredClone(original);
    changedSignedHash.payload.transaction.hash = '1'.repeat(64);

    for (const [payload, selected, paymentRequired, expectedReason] of [
      [wrongNetworkPayload, wrongNetwork, wrongNetworkRequired, 'malformed_payment'],
      [substitutedPayload, substitutedProfile, substitutedRequired, 'intent_mismatch'],
      [malformedPayload, malformedProfile, malformedRequired, 'malformed_payment'],
      [badSignature, accepted, required, 'invalid_signature'],
      [reboundResource, accepted, reboundRequired, 'intent_mismatch'],
      [changedSignedHash, accepted, required, 'block_hash_mismatch'],
    ]) {
      const result = await exact.settle(payload, selected, paymentRequired);
      assert.equal(result.success, false);
      assert.equal(result.state, 'VALIDATION_FAILED');
      assert.equal(result.errorReason, expectedReason);
    }

    let deliveries = 0;
    const app = createResourceServer({
      facilitator: exact,
      requirement: accepted,
      advertisedBaseUrl: 'https://resource.example',
      resourceHandler: async () => ({ ok: true, deliveries: ++deliveries }),
    });
    const listening = await app.listen();
    try {
      const response = await submit(listening.url, badSignature);
      assert.equal(response.status, 402);
      assert.ok(response.headers.get(HEADERS.PAYMENT_REQUIRED));
      assert.equal(response.headers.get(HEADERS.PAYMENT_RESPONSE), null);
      assert.deepEqual(await response.json(), { error: 'payment_settlement_failed' });
      assert.equal(deliveries, 0);
    } finally {
      await app.close();
    }
    assert.equal(node.counters.initialize, 0);
    assert.equal(node.counters.publish, 0);
    assert.equal((await journal.list()).length, 0);
  });

  await t.test('journal corruption fails closed before SDK initialization', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted);
    const { directory, journal } = await journalFixture(t);
    const node = installSyntheticNode(t);

    await journal.list();
    await writeFile(join(directory, 'settlement-journal.json'), '{malformed', 'utf8');
    const result = await facilitator(journal).settle(payload, accepted, required);
    assert.equal(result.success, false);
    assert.equal(result.errorReason, 'journal_corrupt');
    assert.equal(result.state, EVIDENCE_STATES.VALIDATED);
    assert.equal(result.retrySamePayment, true);
    assert.equal(node.counters.initialize, 0);
    assert.equal(node.counters.publish, 0);
  });

  await t.test('scenarios 8 and 9: exact concurrent HTTP delivery converges and delivered retry is cached', async t => {
    const accepted = requirement();
    const { journal } = await journalFixture(t);
    let published = false;
    let included;
    const node = installSyntheticNode(t, {
      lookup: () => published ? included : null,
      publish: async () => { published = true; },
    });
    const exact = facilitator(journal);
    let deliveries = 0;
    let signalDelivery;
    let releaseDelivery;
    const deliveryStarted = new Promise(resolve => { signalDelivery = resolve; });
    const deliveryGate = new Promise(resolve => { releaseDelivery = resolve; });
    const app = createResourceServer({
      facilitator: exact,
      requirement: accepted,
      advertisedBaseUrl: 'https://resource.example',
      resourceHandler: async () => {
        deliveries += 1;
        signalDelivery();
        await deliveryGate;
        return { ok: true, entitlement: 'exact-live-test' };
      },
    });
    let paidRequests = 0;
    let signalDuplicateObserved;
    const duplicateObserved = new Promise(resolve => { signalDuplicateObserved = resolve; });
    app.server.on('request', request => {
      if (request.method === 'GET' && request.url === '/paid' && ++paidRequests === 3) {
        signalDuplicateObserved();
      }
    });
    const listening = await app.listen();
    try {
      const first = await fetch(`${listening.url}/paid`);
      const required = decodeB64Json(first.headers.get(HEADERS.PAYMENT_REQUIRED));
      const payload = signedPayment(required, accepted);
      const reorderedPayload = reverseMemberOrder(payload);
      assert.deepEqual(reorderedPayload, payload);
      assert.notEqual(encodeB64Json(reorderedPayload), encodeB64Json(payload));
      included = observedBlock(payload.payload.transaction, { included: true });

      const firstPending = submit(listening.url, payload);
      await deliveryStarted;
      const secondPending = submit(listening.url, reorderedPayload);
      await duplicateObserved;
      assert.equal(deliveries, 1);
      releaseDelivery();
      const [firstPaid, secondPaid] = await Promise.all([firstPending, secondPending]);
      const [firstText, secondText] = await Promise.all([firstPaid.text(), secondPaid.text()]);
      assert.equal(firstPaid.status, 200);
      assert.equal(secondPaid.status, 200);
      assert.equal(firstText, secondText);
      assert.equal(deliveries, 1);
      assert.equal(node.counters.initialize, 1);
      assert.equal(node.counters.publish, 1);

      const countsAfterDelivery = { ...node.counters };
      const retry = await submit(listening.url, payload);
      assert.equal(retry.status, 200);
      assert.equal(await retry.text(), firstText);
      assert.equal(deliveries, 1);
      assert.equal(node.counters.publish, 1);
      assert.equal(node.counters.initialize, countsAfterDelivery.initialize);
    } finally {
      releaseDelivery?.();
      await app.close();
    }
  });

  await t.test('exact facilitator verification and settlement results ignore inherited then assimilation', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted);
    const invalidPayload = structuredClone(payload);
    invalidPayload.x402Version = 1;
    const { journal } = await journalFixture(t);
    const included = observedBlock(payload.payload.transaction, { included: true });
    let published = false;
    const node = installSyntheticNode(t, {
      lookup: () => published ? included : null,
      publish: async () => { published = true; },
    });
    const exact = facilitator(journal);
    const priorThenDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
    const getOwnDescriptor = Object.getOwnPropertyDescriptor;
    const defineProperty = Object.defineProperty;
    const hasOwn = Object.hasOwn;
    const controlledRejection = Symbol('controlled exact facilitator result rejection');
    let inheritedThenObservations = 0;
    let publicationCountAfterFirstSettlement;
    const outcomes = [];

    const isEnumerableDataField = (receiver, field) => {
      const descriptor = getOwnDescriptor(receiver, field);
      return descriptor?.enumerable === true && hasOwn(descriptor, 'value');
    };
    const capture = promise => promise.then(
      value => ({ status: 'fulfilled', value }),
      error => ({ status: 'rejected', controlled: error === controlledRejection }),
    );

    try {
      defineProperty(Object.prototype, 'then', {
        configurable: true,
        get() {
          const verificationResult = isEnumerableDataField(this, 'isValid') &&
            isEnumerableDataField(this, 'payer');
          const settlementResult = isEnumerableDataField(this, 'success') &&
            isEnumerableDataField(this, 'network') &&
            isEnumerableDataField(this, 'transaction') &&
            isEnumerableDataField(this, 'payer') &&
            isEnumerableDataField(this, 'state');
          if (!verificationResult && !settlementResult) return undefined;
          inheritedThenObservations += 1;
          return (_resolve, reject) => reject(controlledRejection);
        },
      });

      outcomes.push(await capture(exact.verify(invalidPayload, accepted, required)));
      outcomes.push(await capture(exact.verify(payload, accepted, required)));
      outcomes.push(await capture(exact.settle(invalidPayload, accepted, required)));
      outcomes.push(await capture(exact.settle(payload, accepted, required)));
      publicationCountAfterFirstSettlement = node.counters.publish;
      outcomes.push(await capture(exact.settle(payload, accepted, required)));
    } finally {
      if (priorThenDescriptor) defineProperty(Object.prototype, 'then', priorThenDescriptor);
      else delete Object.prototype.then;
    }

    const restoredThenDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
    const prototypeRestored = priorThenDescriptor === undefined
      ? restoredThenDescriptor === undefined
      : restoredThenDescriptor?.value === priorThenDescriptor.value &&
        restoredThenDescriptor?.get === priorThenDescriptor.get &&
        restoredThenDescriptor?.set === priorThenDescriptor.set &&
        restoredThenDescriptor?.enumerable === priorThenDescriptor.enumerable &&
        restoredThenDescriptor?.writable === priorThenDescriptor.writable &&
        restoredThenDescriptor?.configurable === priorThenDescriptor.configurable;
    assert.equal(prototypeRestored, true, 'Object.prototype.then must be restored exactly');

    const allFulfilled = outcomes.every(outcome => outcome.status === 'fulfilled');
    const allControlledRejections = outcomes.every(outcome =>
      outcome.status === 'rejected' && outcome.controlled === true);
    assert.equal(
      allFulfilled,
      true,
      allControlledRejections
        ? 'baseline exact-result assimilation detected'
        : 'Exact facilitator results must fulfill without inherited then assimilation',
    );
    assert.equal(inheritedThenObservations, 0);

    const [invalidVerification, validVerification, invalidSettlement, firstSettlement, retrySettlement] =
      outcomes.map(outcome => outcome.value);
    assert.deepEqual(Object.keys(invalidVerification), ['isValid', 'invalidReason', 'payer']);
    assert.equal(invalidVerification.isValid, false);
    assert.equal(invalidVerification.invalidReason, 'malformed_payment');
    assert.equal(invalidVerification.payer, '');
    assert.deepEqual(Object.keys(validVerification), ['isValid', 'payer']);
    assert.equal(validVerification.isValid, true);
    assert.equal(validVerification.payer === payload.payload.transaction.address, true);

    assert.deepEqual(Object.keys(invalidSettlement), [
      'success', 'network', 'transaction', 'payer', 'errorReason', 'state',
    ]);
    assert.equal(invalidSettlement.success, false);
    assert.equal(invalidSettlement.network, accepted.network);
    assert.equal(invalidSettlement.transaction, '');
    assert.equal(invalidSettlement.payer, '');
    assert.equal(invalidSettlement.errorReason, 'malformed_payment');
    assert.equal(invalidSettlement.state, 'VALIDATION_FAILED');

    for (const result of [firstSettlement, retrySettlement]) {
      assert.deepEqual(Object.keys(result), [
        'success', 'network', 'transaction', 'payer', 'state', 'authorizationKey', 'deliveryState',
      ]);
      assert.equal(result.success, true);
      assert.equal(result.network, accepted.network);
      assert.equal(result.transaction === payload.payload.transaction.hash, true);
      assert.equal(result.payer === payload.payload.transaction.address, true);
      assert.equal(result.state, EVIDENCE_STATES.MOMENTUM_INCLUDED);
      assert.equal(result.deliveryState, 'NONE');
    }

    for (const result of outcomes.map(outcome => outcome.value)) {
      const descriptor = Object.getOwnPropertyDescriptor(result, 'then');
      assert.ok(descriptor);
      assert.equal(descriptor.value, undefined);
      assert.equal(descriptor.enumerable, false);
      assert.equal(descriptor.writable, false);
      assert.equal(descriptor.configurable, false);
    }

    assert.equal(firstSettlement.transaction === retrySettlement.transaction, true);
    assert.equal(firstSettlement.payer === retrySettlement.payer, true);
    assert.equal(firstSettlement.authorizationKey === retrySettlement.authorizationKey, true);
    const persisted = await journal.get(firstSettlement.authorizationKey, firstSettlement.transaction);
    assert.equal(persisted.evidenceState, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(publicationCountAfterFirstSettlement, 1);
    assert.equal(node.counters.publish, publicationCountAfterFirstSettlement);
  });

  await t.test('reconciliation maintenance preserves active records and can observe inclusion after local terminalization', async t => {
    const emptyFixture = await journalFixture(t);
    const defaultFacilitator = facilitator(emptyFixture.journal);
    assert.equal(defaultFacilitator.reconciliationRetentionMs, null);
    assert.equal('reconciliationMaintenance' in defaultFacilitator, false);
    assert.equal(Object.hasOwn(defaultFacilitator, 'worklist'), false);
    assert.equal(facilitator(emptyFixture.journal, { reconciliationRetentionMs: null }).reconciliationRetentionMs, null);
    assert.equal(facilitator(emptyFixture.journal, { reconciliationRetentionMs: 3_600_000 }).reconciliationRetentionMs, 3_600_000);
    assert.equal(facilitator(emptyFixture.journal, { reconciliationRetentionMs: 2_592_000_000 }).reconciliationRetentionMs, 2_592_000_000);
    for (const value of [-1, 0, 3_599_999, 2_592_000_001, 3_600_000.5, '3600000']) {
      assert.throws(
        () => facilitator(emptyFixture.journal, { reconciliationRetentionMs: value }),
        error => error?.code === 'invalid_reconciliation_retention',
      );
    }
    assertMaintenanceResult(await defaultFacilitator.runReconciliationMaintenance(), {
      examined: 0,
      included: 0,
      acknowledged: 0,
      terminalized: 0,
      lateInclusionRecorded: 0,
      unavailable: 0,
      capacityBlocked: 0,
      conflicted: 0,
      unchanged: 0,
      remainingInCycle: 0,
      cycleComplete: true,
    });
    await assert.rejects(
      defaultFacilitator.runReconciliationMaintenance(undefined),
      error => error?.code === 'reconciliation_maintenance_arguments_invalid',
    );

    const current = { value: '2026-01-01T00:00:00.000Z' };
    const { journal } = await journalFixture(t, { clock: () => current.value });
    const accepted = requirement();
    const required = challenge(accepted);
    const terminalPayload = signedPayment(required, accepted, 31);
    const terminalPreflight = await persistRecord(journal, terminalPayload, accepted, required);
    const snapshot = await journal.load();
    current.value = '2026-01-01T01:00:00.000Z';
    await journal.replaceRecordWithTombstone({
      expectedRevision: snapshot.revision,
      expectedRecord: snapshot.records[0],
      retentionMs: 3_600_000,
    });
    const activePayload = signedPayment(required, accepted, 32);
    const activePreflight = await persistRecord(journal, activePayload, accepted, required);
    const included = observedBlock(terminalPayload.payload.transaction, { included: true });
    const node = installSyntheticNode(t, {
      lookup: (_call, hash) => hash.toString() === terminalPreflight.transactionHash ? included : null,
    });
    const exact = facilitator(journal, { reconciliationRetentionMs: null });
    const first = await exact.runReconciliationMaintenance();
    assert.equal(first.examined, 1);
    assert.equal(first.lateInclusionRecorded, 1);
    assert.equal(first.cycleComplete, true);
    assert.equal((await journal.get(activePreflight.authorizationKey, activePreflight.transactionHash)) !== null, true);
    const listed = await journal.list({ includeTombstones: true });
    assert.equal(listed.records.length, 1);
    assert.equal(listed.tombstones.length, 1);
    assert.equal(listed.tombstones[0].lateMomentumEvidence !== null, true);
    for (const field of ['revoked', 'revocation', 'onChainRevocation']) {
      assert.equal(Object.hasOwn(listed.tombstones[0], field), false);
    }
    const revisionAfterFirst = (await journal.load()).revision;
    const second = await exact.runReconciliationMaintenance();
    assert.equal(second.examined, 1);
    assert.equal(second.unchanged, 1);
    assert.equal((await journal.load()).revision, revisionAfterFirst);
    assert.equal(node.counters.lookup, 2);
    assert.equal(node.counters.frontier, 0);
    assert.equal(node.counters.unconfirmed, 0);
    assert.equal(node.counters.publish, 0);
    assert.equal(node.counters.subscribe, 0);
  });

  await t.test('createdAt and clock direction gate exact-absence terminalization and same-payment terminal lookup bypasses SDK initialization', async t => {
    const current = { value: '2026-01-01T00:00:00.000Z' };
    const { journal } = await journalFixture(t, { clock: () => current.value });
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted, 33);
    const preflight = await persistRecord(
      journal,
      payload,
      accepted,
      required,
      EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
    );
    current.value = '2026-01-01T00:59:00.000Z';
    await journal.updateEvidence(
      preflight.authorizationKey,
      preflight.transactionHash,
      EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    );
    const updatedAt = (await journal.get(preflight.authorizationKey, preflight.transactionHash)).updatedAt;

    const exact = facilitator(journal, { reconciliationRetentionMs: 3_600_000 });
    current.value = '2025-12-31T23:00:00.000Z';
    assert.equal((await exact.runReconciliationMaintenance()).examined, 0);
    current.value = '2026-01-01T01:00:00.000Z';
    const node = installSyntheticNode(t, { lookup: () => null });
    const result = await exact.runReconciliationMaintenance();
    assert.equal(result.terminalized, 1);
    const tombstone = await journal.getTombstone(preflight.authorizationKey, preflight.transactionHash);
    assert.equal(tombstone.createdAt < updatedAt, true);
    assert.equal(tombstone.priorEvidenceState, EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED);
    assert.equal(tombstone.lateMomentumEvidence, null);
    // Retention terminalization is bounded local bookkeeping only. With no
    // consensus expiry primitive, it must not be modeled as chain revocation.
    for (const field of ['revoked', 'revocation', 'onChainRevocation']) {
      assert.equal(Object.hasOwn(tombstone, field), false);
    }
    assert.equal(await journal.get(preflight.authorizationKey, preflight.transactionHash), null);

    const initializeCount = node.counters.initialize;
    const terminal = await exact.settle(payload, accepted, required);
    assert.equal(terminal.success, false);
    assert.equal(terminal.network, accepted.network);
    assert.equal(terminal.transaction === preflight.transactionHash, true);
    assert.equal(terminal.payer === preflight.payer, true);
    assert.equal(terminal.state, EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED);
    assert.equal(terminal.authorizationKey === preflight.authorizationKey, true);
    assert.equal(terminal.deliveryState, DELIVERY_STATES.NONE);
    assert.equal(terminal.retrySamePayment, false);
    assert.equal(terminal.errorReason, 'payment_reconciliation_terminal');
    for (const field of ['revoked', 'revocation', 'onChainRevocation']) {
      assert.equal(Object.hasOwn(terminal, field), false);
    }
    assert.equal(node.counters.initialize, initializeCount);
    assert.equal(node.counters.balanceLookup, 0);
    assert.equal(node.counters.publish, 0);
    assert.equal(node.counters.frontier, 0);
    assert.equal(node.counters.unconfirmed, 0);
    assert.equal(node.counters.subscribe, 0);
  });

  await t.test('maintenance exact-hash included, unconfirmed, and unavailable outcomes preserve all forbidden side effects', async t => {
    const current = { value: '2026-01-01T00:00:00.000Z' };
    const { journal } = await journalFixture(t, { clock: () => current.value });
    const accepted = requirement();
    const required = challenge(accepted);
    const includedPayload = signedPayment(required, accepted, 34);
    const acknowledgedPayload = signedPayment(required, accepted, 35);
    const unavailablePayload = signedPayment(required, accepted, 36);
    const includedPreflight = await persistRecord(journal, includedPayload, accepted, required);
    const acknowledgedPreflight = await persistRecord(journal, acknowledgedPayload, accepted, required);
    const unavailablePreflight = await persistRecord(journal, unavailablePayload, accepted, required);
    const included = observedBlock(includedPayload.payload.transaction, { included: true });
    const unconfirmed = observedBlock(acknowledgedPayload.payload.transaction);
    const unavailableError = new Error();
    const node = installSyntheticNode(t, {
      lookup: (_call, hash) => {
        const transactionHash = hash.toString();
        if (transactionHash === includedPreflight.transactionHash) return included;
        if (transactionHash === acknowledgedPreflight.transactionHash) return unconfirmed;
        if (transactionHash === unavailablePreflight.transactionHash) throw unavailableError;
        return null;
      },
    });
    current.value = '2026-01-01T01:00:00.000Z';
    const result = await facilitator(journal, { reconciliationRetentionMs: 3_600_000 })
      .runReconciliationMaintenance();
    assert.equal(result.examined, 3);
    assert.equal(result.included, 1);
    assert.equal(result.acknowledged, 1);
    assert.equal(result.unavailable, 1);
    assert.equal(result.terminalized, 0);
    const includedRecord = await journal.get(includedPreflight.authorizationKey, includedPreflight.transactionHash);
    const acknowledgedRecord = await journal.get(acknowledgedPreflight.authorizationKey, acknowledgedPreflight.transactionHash);
    const unavailableRecord = await journal.get(unavailablePreflight.authorizationKey, unavailablePreflight.transactionHash);
    assert.equal(includedRecord.evidenceState, EVIDENCE_STATES.MOMENTUM_INCLUDED);
    assert.equal(includedRecord.deliveryState, DELIVERY_STATES.NONE);
    assert.equal(acknowledgedRecord.evidenceState, EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED);
    assert.equal(unavailableRecord.evidenceState, EVIDENCE_STATES.VALIDATED);
    assert.equal(node.counters.lookup, 3);
    assert.equal(node.counters.frontier, 0);
    assert.equal(node.counters.unconfirmed, 0);
    assert.equal(node.counters.publish, 0);
    assert.equal(node.counters.subscribe, 0);
    assert.equal(node.counters.assetLookup, 0);
  });

  await t.test('clock rollback preserves stronger exact evidence while exact absence remains active', async t => {
    const current = { value: '2026-01-01T00:00:00.000Z' };
    const { journal } = await journalFixture(t, { clock: () => current.value });
    const accepted = requirement();
    const required = challenge(accepted);
    const includedPayload = signedPayment(required, accepted, 122);
    const acknowledgedPayload = signedPayment(required, accepted, 123);
    const absentPayload = signedPayment(required, accepted, 124);
    const includedPreflight = await persistRecord(journal, includedPayload, accepted, required);
    const acknowledgedPreflight = await persistRecord(journal, acknowledgedPayload, accepted, required);
    const absentPreflight = await persistRecord(journal, absentPayload, accepted, required);
    const included = observedBlock(includedPayload.payload.transaction, { included: true });
    const unconfirmed = observedBlock(acknowledgedPayload.payload.transaction);
    const node = installSyntheticNode(t, {
      lookup: (_call, hash) => {
        current.value = '2025-12-31T23:00:00.000Z';
        const transactionHash = hash.toString();
        if (transactionHash === includedPreflight.transactionHash) return included;
        if (transactionHash === acknowledgedPreflight.transactionHash) return unconfirmed;
        return null;
      },
    });
    current.value = '2026-01-01T01:00:00.000Z';
    const result = await facilitator(journal, { reconciliationRetentionMs: 3_600_000 })
      .runReconciliationMaintenance();
    assert.equal(result.included, 1);
    assert.equal(result.acknowledged, 1);
    assert.equal(result.conflicted, 1);
    assert.equal(
      (await journal.get(includedPreflight.authorizationKey, includedPreflight.transactionHash)).evidenceState,
      EVIDENCE_STATES.MOMENTUM_INCLUDED,
    );
    assert.equal(
      (await journal.get(acknowledgedPreflight.authorizationKey, acknowledgedPreflight.transactionHash)).evidenceState,
      EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    );
    assert.equal((await journal.get(absentPreflight.authorizationKey, absentPreflight.transactionHash)) !== null, true);
    assert.equal(await journal.getTombstone(absentPreflight.authorizationKey, absentPreflight.transactionHash), null);
    assert.equal(node.counters.lookup, 3);
    assert.equal(node.counters.publish, 0);
    assert.equal(node.counters.frontier, 0);
    assert.equal(node.counters.unconfirmed, 0);
  });

  await t.test('maintenance capacity blockage preserves the full record and same-payment recovery lane', async t => {
    const current = { value: '2026-01-01T00:00:00.000Z' };
    let maintenanceStarted = false;
    let maintenanceClockCalls = 0;
    let journal;
    const fixtureState = await journalFixture(t);
    journal = new SettlementJournal({
      directory: fixtureState.directory,
      allowedRoot: fixtureState.root,
      clock: () => {
        if (maintenanceStarted) {
          maintenanceClockCalls += 1;
          if (maintenanceClockCalls === 2) journal.maxFileBytes = 1024;
        }
        return current.value;
      },
    });
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted, 37);
    const preflight = await persistRecord(
      journal,
      payload,
      accepted,
      required,
      EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
    );
    current.value = '2026-01-01T01:00:00.000Z';
    const node = installSyntheticNode(t, { lookup: () => null });
    maintenanceStarted = true;
    const exact = facilitator(journal, { reconciliationRetentionMs: 3_600_000 });
    const result = await exact.runReconciliationMaintenance();
    assert.equal(result.capacityBlocked, 1);
    journal.maxFileBytes = 16 * 1024 * 1024;
    maintenanceStarted = false;
    const retained = await journal.get(preflight.authorizationKey, preflight.transactionHash);
    assert.equal(retained.evidenceState, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
    assert.equal(await journal.getTombstone(preflight.authorizationKey, preflight.transactionHash), null);

    node.behavior.lookup = () => { throw new Error(); };
    const recovery = await exact.settle(payload, accepted, required);
    assert.equal(recovery.success, false);
    assert.equal(recovery.retrySamePayment, true);
    assert.equal(recovery.state, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
    assert.equal(node.counters.publish, 0);
    assert.equal(node.counters.frontier, 0);
    assert.equal(node.counters.unconfirmed, 0);
    assert.equal(node.counters.subscribe, 0);
  });

  await t.test('maintenance is non-overlapping and same-payer settlement cannot pass its terminal CAS boundary', async t => {
    const current = { value: '2026-01-01T00:00:00.000Z' };
    const { journal } = await journalFixture(t, { clock: () => current.value });
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted, 38);
    const preflight = await persistRecord(journal, payload, accepted, required);
    current.value = '2026-01-01T01:00:00.000Z';
    const entered = deferred();
    const release = deferred();
    const node = installSyntheticNode(t, {
      lookup: async () => {
        entered.resolve();
        await release.promise;
        return null;
      },
    });
    const exact = facilitator(journal, { reconciliationRetentionMs: 3_600_000 });
    const maintenance = exact.runReconciliationMaintenance();
    await entered.promise;
    await assert.rejects(
      exact.runReconciliationMaintenance(),
      error => error?.code === 'reconciliation_maintenance_in_progress',
    );
    const settlement = exact.settle(payload, accepted, required);
    release.resolve();
    const maintenanceResult = await maintenance;
    assert.equal(maintenanceResult.terminalized, 1);
    const terminal = await settlement;
    assert.equal(terminal.errorReason, 'payment_reconciliation_terminal');
    assert.equal(terminal.retrySamePayment, false);
    assert.equal(terminal.transaction === preflight.transactionHash, true);
    assert.equal(node.counters.initialize, 1);
    assert.equal(node.counters.lookup, 1);
    assert.equal(node.counters.publish, 0);
    assert.equal(node.counters.frontier, 0);
    assert.equal(node.counters.unconfirmed, 0);
    assert.equal(node.counters.subscribe, 0);
  });

  await t.test('maintenance acquires payer before SDK ownership and holds both through terminal CAS', async t => {
    const current = { value: '2026-01-01T00:00:00.000Z' };
    const { journal } = await journalFixture(t, { clock: () => current.value });
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted, 43);
    const preflight = await persistRecord(journal, payload, accepted, required);
    current.value = '2026-01-01T01:00:00.000Z';

    const candidateListed = deferred();
    const originalListCandidates = journal.listReconciliationCandidates.bind(journal);
    journal.listReconciliationCandidates = async (...args) => {
      const candidates = await originalListCandidates(...args);
      candidateListed.resolve();
      return candidates;
    };
    const casEntered = deferred();
    const releaseCas = deferred();
    const originalReplace = journal.replaceRecordWithTombstone.bind(journal);
    journal.replaceRecordWithTombstone = async options => {
      casEntered.resolve();
      await releaseCas.promise;
      return originalReplace(options);
    };
    const node = installSyntheticNode(t, { lookup: () => null });
    const exact = facilitator(journal, { reconciliationRetentionMs: 3_600_000 });

    const payerHeld = deferred();
    const releasePayer = deferred();
    const payerOwner = exact.payerQueue.run(preflight.payer, async () => {
      payerHeld.resolve();
      await releasePayer.promise;
    });
    await payerHeld.promise;
    const maintenance = exact.runReconciliationMaintenance();
    await candidateListed.promise;
    await Promise.resolve();
    assert.equal(node.counters.initialize, 0);

    releasePayer.resolve();
    await payerOwner;
    await casEntered.promise;
    assert.equal(node.counters.initialize, 1);
    assert.equal(node.counters.lookup, 1);

    let payerProbeEntered = false;
    let runtimeProbeEntered = false;
    const payerProbe = exact.payerQueue.run(preflight.payer, async () => {
      payerProbeEntered = true;
    });
    const runtimeProbe = exact.runtime.withOwner('test.maintenance-lock-probe', async () => {
      runtimeProbeEntered = true;
    });
    await Promise.resolve();
    assert.equal(payerProbeEntered, false);
    assert.equal(runtimeProbeEntered, false);

    releaseCas.resolve();
    const result = await maintenance;
    await Promise.all([payerProbe, runtimeProbe]);
    assert.equal(result.terminalized, 1);
    assert.equal(payerProbeEntered, true);
    assert.equal(runtimeProbeEntered, true);
    assert.equal(await journal.get(preflight.authorizationKey, preflight.transactionHash), null);
  });

  await t.test('fresh in-owner snapshot rejects a changed candidate before exact-hash lookup', async t => {
    const current = { value: '2026-01-01T00:00:00.000Z' };
    const { root, directory, journal } = await journalFixture(t, { clock: () => current.value });
    const competingJournal = new SettlementJournal({ directory, allowedRoot: root, clock: () => current.value });
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted, 44);
    const preflight = await persistRecord(journal, payload, accepted, required);
    current.value = '2026-01-01T01:00:00.000Z';

    const secondSnapshotListed = deferred();
    const originalListCandidates = journal.listReconciliationCandidates.bind(journal);
    journal.listReconciliationCandidates = async (...args) => {
      const candidates = await originalListCandidates(...args);
      secondSnapshotListed.resolve();
      return candidates;
    };
    const ownerEntered = deferred();
    const releaseOwner = deferred();
    const owner = facilitator(journal).runtime.withOwner('test.maintenance-snapshot-holder', async () => {
      ownerEntered.resolve();
      await releaseOwner.promise;
    });
    await ownerEntered.promise;

    const node = installSyntheticNode(t, { lookup: () => null });
    const exact = facilitator(journal, { reconciliationRetentionMs: 3_600_000 });
    const maintenance = exact.runReconciliationMaintenance();
    await secondSnapshotListed.promise;
    await competingJournal.updateEvidence(
      preflight.authorizationKey,
      preflight.transactionHash,
      EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    );
    releaseOwner.resolve();
    await owner;

    const result = await maintenance;
    assert.equal(result.conflicted, 1);
    assert.equal(node.counters.lookup, 0);
    const retained = await journal.get(preflight.authorizationKey, preflight.transactionHash);
    assert.equal(retained.evidenceState, EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED);
    assert.equal(await journal.getTombstone(preflight.authorizationKey, preflight.transactionHash), null);
  });

  await t.test('two facilitator instances promote a stale active candidate to late tombstone reconciliation', async t => {
    const current = { value: '2026-01-01T00:00:00.000Z' };
    const { journal } = await journalFixture(t, { clock: () => current.value });
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted, 45);
    const preflight = await persistRecord(journal, payload, accepted, required);
    current.value = '2026-01-01T01:00:00.000Z';

    let enumerations = 0;
    const secondEnumerated = deferred();
    const originalListCandidates = journal.listReconciliationCandidates.bind(journal);
    journal.listReconciliationCandidates = async (...args) => {
      const candidates = await originalListCandidates(...args);
      enumerations += 1;
      if (enumerations === 2) secondEnumerated.resolve();
      return candidates;
    };
    const firstLookupEntered = deferred();
    const releaseFirstLookup = deferred();
    const included = observedBlock(payload.payload.transaction, { included: true });
    const node = installSyntheticNode(t, {
      lookup: async call => {
        if (call === 1) {
          firstLookupEntered.resolve();
          await releaseFirstLookup.promise;
          return null;
        }
        return included;
      },
    });
    const firstFacilitator = facilitator(journal, { reconciliationRetentionMs: 3_600_000 });
    const secondFacilitator = facilitator(journal, { reconciliationRetentionMs: 3_600_000 });

    const firstMaintenance = firstFacilitator.runReconciliationMaintenance();
    await firstLookupEntered.promise;
    const secondMaintenance = secondFacilitator.runReconciliationMaintenance();
    await secondEnumerated.promise;
    releaseFirstLookup.resolve();
    const firstResult = await firstMaintenance;
    const secondResult = await secondMaintenance;

    assert.equal(firstResult.terminalized, 1);
    assert.equal(secondResult.terminalized, 0);
    assert.equal(secondResult.lateInclusionRecorded, 1);
    assert.equal(node.counters.lookup, 2);
    assert.equal(await journal.get(preflight.authorizationKey, preflight.transactionHash), null);
    const tombstone = await journal.getTombstone(preflight.authorizationKey, preflight.transactionHash);
    assert.equal(tombstone.lateMomentumEvidence !== null, true);
  });

  await t.test('maintenance aborts on malformed or digest-mismatched exact observations without mutation', async t => {
    const current = { value: '2026-01-01T00:00:00.000Z' };
    const { journal } = await journalFixture(t, { clock: () => current.value });
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted, 39);
    const otherPayload = signedPayment(required, accepted, 40);
    const preflight = await persistRecord(journal, payload, accepted, required);
    const original = await journal.load();
    current.value = '2026-01-01T01:00:00.000Z';
    let observation = {};
    const node = installSyntheticNode(t, { lookup: () => observation });
    const exact = facilitator(journal, { reconciliationRetentionMs: 3_600_000 });
    const falsyMalformed = [undefined, false, 0, ''];
    for (let index = 0; index < falsyMalformed.length; index += 1) {
      observation = falsyMalformed[index];
      await assert.rejects(
        exact.runReconciliationMaintenance(),
        error => error?.code === 'malformed_observed_account_block',
      );
      assert.equal((await journal.load()).revision, original.revision);
      const retained = await journal.get(preflight.authorizationKey, preflight.transactionHash);
      assert.equal(retained !== null, true);
      assert.equal(retained.deliveryState, DELIVERY_STATES.NONE);
      assert.equal(await journal.getTombstone(
        preflight.authorizationKey,
        preflight.transactionHash,
      ), null);
      assert.equal(node.counters.publish, 0);
      assert.equal(node.counters.frontier, 0);
      assert.equal(node.counters.unconfirmed, 0);
      assert.equal(node.counters.subscribe, 0);
    }

    observation = {};
    await assert.rejects(
      exact.runReconciliationMaintenance(),
      error => error?.code === 'malformed_observed_account_block',
    );
    assert.equal((await journal.load()).revision, original.revision);
    assert.equal((await journal.get(preflight.authorizationKey, preflight.transactionHash)) !== null, true);

    observation = observedBlock(otherPayload.payload.transaction);
    await assert.rejects(
      exact.runReconciliationMaintenance(),
      error => error?.code === 'observed_transaction_mismatch',
    );
    assert.equal((await journal.load()).revision, original.revision);
    assert.equal((await journal.get(preflight.authorizationKey, preflight.transactionHash)) !== null, true);

    observation = null;
    assert.equal((await exact.runReconciliationMaintenance()).terminalized, 1);
    assert.equal(node.counters.frontier, 0);
    assert.equal(node.counters.unconfirmed, 0);
    assert.equal(node.counters.publish, 0);
    assert.equal(node.counters.subscribe, 0);
  });

  await t.test('maintenance revision races retain the full record', async t => {
    const current = { value: '2026-01-01T00:00:00.000Z' };
    const { root, directory, journal } = await journalFixture(t, { clock: () => current.value });
    const competingJournal = new SettlementJournal({ directory, allowedRoot: root, clock: () => current.value });
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted, 41);
    const preflight = await persistRecord(journal, payload, accepted, required);
    current.value = '2026-01-01T01:00:00.000Z';
    const entered = deferred();
    const release = deferred();
    installSyntheticNode(t, {
      lookup: async () => {
        entered.resolve();
        await release.promise;
        return null;
      },
    });
    const exact = facilitator(journal, { reconciliationRetentionMs: 3_600_000 });
    const maintenance = exact.runReconciliationMaintenance();
    await entered.promise;
    const competingPayload = signedPayment(required, accepted, 42);
    await persistRecord(competingJournal, competingPayload, accepted, required);
    release.resolve();
    const result = await maintenance;
    assert.equal(result.conflicted, 1);
    assert.equal((await journal.get(preflight.authorizationKey, preflight.transactionHash)) !== null, true);
    assert.equal(await journal.getTombstone(preflight.authorizationKey, preflight.transactionHash), null);
  });

  await t.test('maintenance cycles process at most 64 deterministic entries without in-process starvation and restart fresh', async t => {
    const current = { value: '2026-01-01T00:00:00.000Z' };
    const { journal } = await journalFixture(t, { clock: () => current.value });
    const accepted = requirement();
    const required = challenge(accepted);
    for (let index = 0; index < 65; index += 1) {
      const payload = signedPayment(required, accepted, 50 + index);
      await persistRecord(journal, payload, accepted, required);
    }
    const ordered = (await journal.list())
      .map(record => ({
        createdAt: record.createdAt,
        authorizationKey: record.authorizationKey,
        transactionHash: record.transactionHash,
        kind: 'record',
      }))
      .sort((left, right) => {
        for (const key of ['createdAt', 'authorizationKey', 'transactionHash', 'kind']) {
          if (left[key] < right[key]) return -1;
          if (left[key] > right[key]) return 1;
        }
        return 0;
      });
    const observedTransactions = [];
    const node = installSyntheticNode(t, {
      lookup: (_call, hash) => {
        observedTransactions.push(hash.toString());
        return null;
      },
    });
    current.value = '2026-01-01T01:00:00.000Z';
    const exact = facilitator(journal, { reconciliationRetentionMs: 3_600_000 });
    const first = await exact.runReconciliationMaintenance();
    assert.equal(first.examined, 64);
    assert.equal(first.terminalized, 64);
    assert.equal(first.remainingInCycle, 1);
    assert.equal(first.cycleComplete, false);
    assert.equal(
      isDeepStrictEqual(observedTransactions.slice(0, 64), ordered.slice(0, 64).map(entry => entry.transactionHash)),
      true,
    );

    const newPayload = signedPayment(required, accepted, 120);
    const newPreflight = await persistRecord(journal, newPayload, accepted, required);
    current.value = '2026-01-01T02:00:00.000Z';
    const second = await exact.runReconciliationMaintenance();
    assert.equal(second.examined, 1);
    assert.equal(second.terminalized, 1);
    assert.equal(second.cycleComplete, true);
    assert.equal((await journal.get(newPreflight.authorizationKey, newPreflight.transactionHash)) !== null, true);

    const third = await exact.runReconciliationMaintenance();
    assert.equal(third.examined, 64);
    assert.equal(third.unchanged, 64);
    assert.equal(third.remainingInCycle, 2);
    const fourth = await exact.runReconciliationMaintenance();
    assert.equal(fourth.examined, 2);
    assert.equal(fourth.unchanged, 1);
    assert.equal(fourth.terminalized, 1);
    assert.equal(fourth.cycleComplete, true);
    assert.equal(await journal.get(newPreflight.authorizationKey, newPreflight.transactionHash), null);

    const restarted = facilitator(journal, { reconciliationRetentionMs: 3_600_000 });
    const restartCycle = await restarted.runReconciliationMaintenance();
    assert.equal(restartCycle.examined, 64);
    assert.equal(restartCycle.unchanged, 64);
    assert.equal(restartCycle.remainingInCycle, 2);
    assert.equal(restartCycle.cycleComplete, false);
    assert.equal(node.counters.frontier, 0);
    assert.equal(node.counters.unconfirmed, 0);
    assert.equal(node.counters.publish, 0);
    assert.equal(node.counters.subscribe, 0);
    assert.equal(node.counters.assetLookup, 0);
  });

  await t.test('maintenance requires live acknowledgement before SDK ownership or durable transition', async t => {
    const current = { value: '2026-01-01T00:00:00.000Z' };
    const { journal } = await journalFixture(t, { clock: () => current.value });
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted, 121);
    const preflight = await persistRecord(journal, payload, accepted, required);
    current.value = '2026-01-01T01:00:00.000Z';
    const before = await journal.load();
    let casCalls = 0;
    const originalReplace = journal.replaceRecordWithTombstone.bind(journal);
    journal.replaceRecordWithTombstone = async options => {
      casCalls += 1;
      return originalReplace(options);
    };
    const node = installSyntheticNode(t, { lookup: () => null });
    const exact = facilitator(journal, { reconciliationRetentionMs: 3_600_000 });
    const acknowledgement = process.env.ZENON_LIVE_ACK;
    delete process.env.ZENON_LIVE_ACK;
    try {
      await assert.rejects(
        exact.runReconciliationMaintenance(),
        error => error?.code === 'live_mode_not_acknowledged',
      );
    } finally {
      process.env.ZENON_LIVE_ACK = acknowledgement;
    }
    assert.equal(node.counters.initialize, 0);
    assert.equal(node.counters.lookup, 0);
    assert.equal(casCalls, 0);
    assert.equal((await journal.load()).revision, before.revision);
    assert.equal((await journal.get(preflight.authorizationKey, preflight.transactionHash)) !== null, true);
    assert.equal(await journal.getTombstone(preflight.authorizationKey, preflight.transactionHash), null);
  });

  await t.test('lifecycle observation records true facilitator boundaries without RPC drift', async t => {
    let absentCounters;
    let absentResult;
    let absentResultText;
    await t.test('observer absent', async t => {
      const accepted = requirement();
      const required = challenge(accepted);
      const payload = signedPayment(required, accepted);
      const { journal } = await journalFixture(t);
      const included = observedBlock(payload.payload.transaction, { included: true });
      let published = false;
      const node = installSyntheticNode(t, {
        lookup: () => published ? included : null,
        publish: () => { published = true; },
      });
      const result = await facilitator(journal).settle(payload, accepted, required);
      assert.equal(result.success, true);
      absentResult = structuredClone(result);
      absentResultText = JSON.stringify(result);
      absentCounters = structuredClone(node.counters);
    });

    await t.test('observer present', async t => {
      const accepted = requirement();
      const required = challenge(accepted);
      const payload = signedPayment(required, accepted);
      const preflight = await preflightZenonPayment(payload, accepted, required);
      const { journal } = await journalFixture(t);
      const included = observedBlock(payload.payload.transaction, { included: true });
      let published = false;
      const node = installSyntheticNode(t, {
        lookup: () => published ? included : null,
        publish: () => { published = true; },
      });
      let monotonic = 0;
      const observer = createLiveEvidenceObserver({
        utcNow: () => '2026-01-01T00:00:00.000Z',
        monotonicNow: () => ++monotonic,
      });
      const exact = facilitator(journal, { lifecycleObserver: observer });
      const result = await exact.settle(payload, accepted, required);
      assert.equal(result.success, true);
      assert.deepEqual(structuredClone(result), absentResult);
      assert.equal(JSON.stringify(result), absentResultText);
      assert.deepEqual(structuredClone(node.counters), absentCounters);
      const observations = exact.snapshotLiveEvidenceObservations();
      assert.deepEqual(observations.map(event => event.phase), [
        'facilitator_owner_wait_started',
        'facilitator_owner_acquired',
        'facilitator_readiness_started',
        'facilitator_readiness_finished',
        'publication_started',
        'publication_acknowledged',
        'inclusion_wait_started',
        'momentum_inclusion_observed',
        'facilitator_owner_released',
      ]);
      const inclusion = observations.find(event => event.phase === 'momentum_inclusion_observed');
      const record = await journal.get(preflight.authorizationKey, preflight.transactionHash);
      assert.equal(inclusion.utc, record.momentumEvidence.observedAt);
    });
  });

  await t.test('inclusion observation precedes its gated durable write and occurs once', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted);
    const { journal } = await journalFixture(t);
    const included = observedBlock(payload.payload.transaction, { included: true });
    let published = false;
    installSyntheticNode(t, {
      lookup: () => published ? included : null,
      publish: () => { published = true; },
    });
    let monotonic = 0;
    const observer = createLiveEvidenceObserver({
      utcNow: () => '2026-01-01T00:00:00.000Z',
      monotonicNow: () => ++monotonic,
    });
    const exact = facilitator(journal, { lifecycleObserver: observer });
    const writeEntered = deferred();
    const releaseWrite = deferred();
    const originalUpdateEvidence = journal.updateEvidence.bind(journal);
    let inclusionWrites = 0;
    journal.updateEvidence = async (...args) => {
      if (args[2] === EVIDENCE_STATES.MOMENTUM_INCLUDED) {
        inclusionWrites += 1;
        const observedBeforeWrite = exact.snapshotLiveEvidenceObservations()
          .filter(event => event.phase === 'momentum_inclusion_observed');
        assert.equal(observedBeforeWrite.length, 1);
        writeEntered.resolve();
        await releaseWrite.promise;
      }
      return originalUpdateEvidence(...args);
    };
    const settlement = exact.settle(payload, accepted, required);
    await writeEntered.promise;
    try {
      assert.equal(
        exact.snapshotLiveEvidenceObservations()
          .filter(event => event.phase === 'momentum_inclusion_observed').length,
        1,
      );
    } finally {
      releaseWrite.resolve();
    }
    assert.equal((await settlement).success, true);
    assert.equal(inclusionWrites, 1);
    assert.equal(
      exact.snapshotLiveEvidenceObservations()
        .filter(event => event.phase === 'momentum_inclusion_observed').length,
      1,
    );
  });

  await t.test('observer clock faults and hostile thenables cannot change settlement or ACK durability', async t => {
    const accepted = requirement();
    const required = challenge(accepted);
    const payload = signedPayment(required, accepted);
    const preflight = await preflightZenonPayment(payload, accepted, required);
    const { journal } = await journalFixture(t);
    const included = observedBlock(payload.payload.transaction, { included: true });
    let published = false;
    installSyntheticNode(t, {
      lookup: () => published ? included : null,
      publish: () => { published = true; },
    });
    let thenReads = 0;
    const hostileThenable = {};
    Object.defineProperty(hostileThenable, 'then', {
      get() { thenReads += 1; return () => new Promise(() => {}); },
    });
    const observer = createLiveEvidenceObserver({
      utcNow: () => hostileThenable,
      monotonicNow: () => hostileThenable,
    });
    const exact = facilitator(journal, { lifecycleObserver: observer });
    const result = await exact.settle(payload, accepted, required);
    assert.equal(result.success, true);
    assert.equal(thenReads, 0);
    assert.deepEqual(exact.snapshotLiveEvidenceObservations(), []);
    assert.equal(
      (await journal.get(preflight.authorizationKey, preflight.transactionHash)).evidenceState,
      EVIDENCE_STATES.MOMENTUM_INCLUDED,
    );
  });

  await t.test('synchronous publication failure precedes publication-start observation', async () => {
    const observer = createLiveEvidenceObserver({
      utcNow: () => '2026-01-01T00:00:00.000Z',
      monotonicNow: () => 1,
    });
    const observations = [];
    await assert.rejects(ensurePublished({
      lookup: async () => null,
      publish: () => { throw new Error('synthetic-local-failure'); },
      lifecycleObserver: observer,
      lifecycleObservations: observations,
    }));
    assert.deepEqual(observations, []);

    const uncertainObservations = [];
    const uncertain = await ensurePublished({
      lookup: async () => null,
      publish: () => Promise.reject(new Error('synthetic-publication-rejection')),
      lifecycleObserver: observer,
      lifecycleObservations: uncertainObservations,
    });
    assert.equal(uncertain.state, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
    assert.deepEqual(
      uncertainObservations.map(event => event.phase),
      ['publication_started'],
    );
  });

  await t.test('owner release is observed once before the next queued acquisition on setup failure', async t => {
    const accepted = requirement();
    const firstRequired = challenge(accepted);
    const secondRequired = challenge(accepted, 'https://resource.example/other-paid');
    const firstPayload = signedPayment(firstRequired, accepted, 35);
    const secondPayload = signedPayment(secondRequired, accepted, 36);
    const firstJournal = (await journalFixture(t)).journal;
    const secondJournal = (await journalFixture(t)).journal;
    const firstEntered = deferred();
    const releaseFirst = deferred();
    let initializeCalls = 0;
    installSyntheticNode(t, {
      initialize: async () => {
        initializeCalls += 1;
        if (initializeCalls === 1) {
          firstEntered.resolve();
          await releaseFirst.promise;
        }
        throw new Error('synthetic-setup-failure');
      },
    });
    let monotonic = 0;
    const observer = createLiveEvidenceObserver({
      utcNow: () => '2026-01-01T00:00:00.000Z',
      monotonicNow: () => ++monotonic,
    });
    const first = facilitator(firstJournal, { lifecycleObserver: observer });
    const second = facilitator(secondJournal, { lifecycleObserver: observer });
    const firstRun = first.settle(firstPayload, accepted, firstRequired);
    await firstEntered.promise;
    const secondRun = second.settle(secondPayload, accepted, secondRequired);
    releaseFirst.resolve();
    await Promise.all([firstRun, secondRun]);
    const firstEvents = first.snapshotLiveEvidenceObservations();
    const secondEvents = second.snapshotLiveEvidenceObservations();
    const firstAcquired = firstEvents.find(event => event.phase === 'facilitator_owner_acquired');
    const firstReleased = firstEvents.filter(event => event.phase === 'facilitator_owner_released');
    const secondAcquired = secondEvents.find(event => event.phase === 'facilitator_owner_acquired');
    const secondReleased = secondEvents.filter(event => event.phase === 'facilitator_owner_released');
    assert.equal(firstReleased.length, 1);
    assert.equal(secondReleased.length, 1);
    assert.equal(firstAcquired.sequence < firstReleased[0].sequence, true);
    assert.equal(firstReleased[0].sequence < secondAcquired.sequence, true);
    assert.equal(secondAcquired.sequence < secondReleased[0].sequence, true);
  });

  await t.test('wallet-free readiness rejects offline errors before SDK effects and performs one asset read', async t => {
    const customAsset = sdk.TokenStandard.fromCore(
      Buffer.alloc(sdk.TokenStandard.coreSize, 5),
    ).toString();
    let keyStoreCalls = 0;
    let signingCalls = 0;
    const originalFromMnemonic = sdk.KeyStore.fromMnemonic;
    const originalSign = sdk.KeyPair.prototype.sign;
    sdk.KeyStore.fromMnemonic = () => {
      keyStoreCalls += 1;
      throw new Error('wallet access prohibited');
    };
    sdk.KeyPair.prototype.sign = () => {
      signingCalls += 1;
      throw new Error('signing prohibited');
    };
    t.after(() => {
      sdk.KeyStore.fromMnemonic = originalFromMnemonic;
      sdk.KeyPair.prototype.sign = originalSign;
    });
    const node = installSyntheticNode(t, {
      prepareBlock: () => { throw new Error('preparation prohibited'); },
    });
    const environment = {
      ZENON_LIVE_ACK: 'I_UNDERSTAND_TESTNET_ONLY',
      ZENON_NETWORK_ID: '3',
      ZENON_RPC_URL: 'ws://rpc.invalid',
    };
    await assert.rejects(probeZenonRoleReadiness({
      role: 'buyer',
      asset: 'not-a-token-standard',
      expectedChainProfile: PROFILE,
      authenticateChainProfile: async () => ({ ...PROFILE }),
      environment,
      rpcTimeoutMs: 100,
    }));
    await assert.rejects(probeZenonRoleReadiness({
      role: 'buyer',
      asset: customAsset,
      expectedChainProfile: { ...PROFILE, chainIdentifier: '0' },
      authenticateChainProfile: async () => ({ ...PROFILE }),
      environment,
      rpcTimeoutMs: 100,
    }));
    assert.equal(node.counters.initialize, 0);
    assert.equal(node.counters.assetLookup, 0);
    const ready = await probeZenonRoleReadiness({
      role: 'buyer',
      asset: customAsset,
      expectedChainProfile: PROFILE,
      authenticateChainProfile: async () => ({ ...PROFILE }),
      environment,
      rpcTimeoutMs: 100,
    });
    assert.deepEqual(ready, { ready: true, role: 'buyer' });
    assert.equal(node.counters.initialize, 1);
    assert.equal(node.counters.assetLookup, 1);
    assert.equal(node.counters.prepareBlock, 0);
    assert.equal(keyStoreCalls, 0);
    assert.equal(signingCalls, 0);
  });

  await t.test('buyer observation preserves complete payload and RPC behavior', async t => {
    const customAsset = sdk.TokenStandard.fromCore(
      Buffer.alloc(sdk.TokenStandard.coreSize, 5),
    ).toString();
    const accepted = requirement({ asset: customAsset });
    const required = challenge(accepted);
    let absentPayload;
    let absentCounters;
    const run = async (nested, lifecycleObserver) => {
      const keyPair = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 37));
      const originalFromMnemonic = sdk.KeyStore.fromMnemonic;
      sdk.KeyStore.fromMnemonic = () => ({ getKeyPair: () => keyPair });
      nested.after(() => { sdk.KeyStore.fromMnemonic = originalFromMnemonic; });
      const node = installSyntheticNode(nested, {
        prepareBlock: block => {
          block.chainIdentifier = Number(PROFILE.chainIdentifier);
          block.address = keyPair.getAddress();
          block.height = 1;
          block.momentumAcknowledged = new sdk.HashHeight(
            sdk.Hash.digest(Buffer.from('synthetic buyer acknowledged momentum')),
            1,
          );
          block.nonce = '0000000000000000';
          block.publicKey = keyPair.getPublicKey();
          block.hash = computeBlockHash(block, sdk);
          block.signature = keyPair.sign(block.hash.getBytes());
          return block;
        },
      });
      const configuration = {
        mnemonic: 'offline-placeholder-only',
        authenticateChainProfile: async () => ({ ...PROFILE }),
        rpcTimeoutMs: 100,
      };
      if (lifecycleObserver !== undefined) configuration.lifecycleObserver = lifecycleObserver;
      const client = new ExactZenonClient(configuration);
      const payload = await client.createPaymentPayload(required, accepted);
      return { client, node, payload };
    };
    await t.test('observer absent', async nested => {
      const result = await run(nested, undefined);
      absentPayload = JSON.stringify(result.payload);
      absentCounters = structuredClone(result.node.counters);
      assert.deepEqual(result.client.snapshotLiveEvidenceObservations(), []);
    });
    await t.test('observer present', async nested => {
      const observer = createLiveEvidenceObserver({
        utcNow: () => '2026-01-01T00:00:00.000Z',
        monotonicNow: (() => { let value = 0; return () => ++value; })(),
      });
      const result = await run(nested, observer);
      assert.equal(JSON.stringify(result.payload), absentPayload);
      assert.deepEqual(structuredClone(result.node.counters), absentCounters);
      assert.deepEqual(result.client.snapshotLiveEvidenceObservations().map(event => event.phase), [
        'buyer_owner_wait_started',
        'buyer_owner_acquired',
        'buyer_readiness_started',
        'buyer_readiness_finished',
        'prepare_block_started',
        'prepare_block_finished',
        'buyer_owner_released',
      ]);
    });
  });

  // This scenario permanently poisons the module-wide live runtime and must be
  // the final exact-facilitator scenario in this isolated test process.
  await t.test('scenario 10: publication timeout is ambiguous, delivers nothing, and blocks later sessions', async t => {
    const accepted = requirement();
    const current = { value: '2026-01-01T00:00:00.000Z' };
    const { journal } = await journalFixture(t, { clock: () => current.value });
    const node = installSyntheticNode(t, {
      lookup: () => null,
      publish: () => new Promise(() => {}),
    });
    const exact = facilitator(journal, {
      rpcTimeoutMs: 20,
      reconciliationRetentionMs: 3_600_000,
    });
    let deliveries = 0;
    const app = createResourceServer({
      facilitator: exact,
      requirement: accepted,
      advertisedBaseUrl: 'https://resource.example',
      resourceHandler: async () => ({ ok: true, deliveries: ++deliveries }),
    });
    const listening = await app.listen();
    try {
      const first = await fetch(`${listening.url}/paid`);
      const required = decodeB64Json(first.headers.get(HEADERS.PAYMENT_REQUIRED));
      const payload = signedPayment(required, accepted);
      const preflight = await preflightZenonPayment(payload, accepted, required);
      const response = await submit(listening.url, payload);
      const body = await response.json();
      const settlement = decodeB64Json(response.headers.get(HEADERS.PAYMENT_RESPONSE));

      assert.equal(response.status, 409);
      assert.equal(body.action, 'reuse_and_reconcile_same_payment');
      assert.equal(settlement.state, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
      assert.equal(settlement.retrySamePayment, true);
      assert.equal(deliveries, 0);
      assert.equal(node.counters.initialize, 1);
      assert.equal(node.counters.publish, 1);
      assert.equal((await journal.get(preflight.authorizationKey, preflight.transactionHash)).evidenceState,
        EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);

      const initializeCount = node.counters.initialize;
      const retry = await exact.settle(payload, accepted, required);
      assert.equal(retry.success, false);
      assert.equal(retry.errorReason, 'live_runtime_poisoned_restart_required');
      assert.equal(retry.retrySamePayment, true);
      assert.equal(node.counters.initialize, initializeCount);
      assert.equal(node.counters.publish, 1);

      current.value = '2026-01-01T01:00:00.000Z';
      const beforeMaintenance = await journal.load();
      const lookupCount = node.counters.lookup;
      let casCalls = 0;
      const originalReplace = journal.replaceRecordWithTombstone.bind(journal);
      journal.replaceRecordWithTombstone = async options => {
        casCalls += 1;
        return originalReplace(options);
      };
      await assert.rejects(
        exact.runReconciliationMaintenance(),
        error => error?.code === 'live_runtime_poisoned_restart_required',
      );
      assert.equal(node.counters.initialize, initializeCount);
      assert.equal(node.counters.lookup, lookupCount);
      assert.equal(casCalls, 0);
      assert.equal((await journal.load()).revision, beforeMaintenance.revision);
      assert.equal((await journal.get(preflight.authorizationKey, preflight.transactionHash)) !== null, true);
    } finally {
      await app.close();
    }
  });
});
