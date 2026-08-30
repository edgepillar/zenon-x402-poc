import assert from 'node:assert/strict';
import test from 'node:test';
import { types as utilTypes } from 'node:util';
import * as sdk from 'znn-typescript-sdk';

import {
  ExactZenonClient,
  ExactZenonFacilitator,
  assertZenonNodeReady,
} from '../src/zenon-payment.js';
import {
  OPERATOR_TRUST_ACKNOWLEDGEMENT,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_NON_CLAIMS,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_WARNING,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
  isOperatorTrustedTestnetEvidence,
  isOperatorTrustedTestnetPolicy,
  selectOperatorTrustedTestnetPolicy,
} from '../src/zenon/operator-trusted-testnet-profile.js';

const EXPECTED_PROFILE_NAME = 'historical-testnet-wiki-height-2-2021-12-17-v1';
const EXPECTED_ACKNOWLEDGEMENT =
  'I_UNDERSTAND_THIS_ANCHOR_DOES_NOT_AUTHENTICATE_THE_CONNECTED_NODE';
const EXPECTED_LIVE_ACKNOWLEDGEMENT = 'I_UNDERSTAND_TESTNET_ONLY';
const EXPECTED_CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '3',
  genesisMomentumHash: '761f482683e6d0ed1f92af1140418b989b89c474d3491a2f4651bce99954bed6',
});
const EXPECTED_HEIGHT_TWO_HASH =
  '5efd0e49736f2a1ff7eeef3e3e73fbbb087471ff1097d2e41041942adccdec93';

function matchingContext(overrides = {}, observationCount = 10) {
  const calls = [];
  const zenon = {
    ledger: {
      async getMomentumsByHeight(...args) {
        calls.push(args);
        return {
          count: observationCount,
          list: [{
            version: 1,
            chainIdentifier: 3,
            hash: EXPECTED_HEIGHT_TWO_HASH,
            previousHash: EXPECTED_CHAIN_PROFILE.genesisMomentumHash,
            height: 2,
          }],
        };
      },
    },
  };
  return {
    calls,
    context: {
      zenon,
      expectedChainProfile: { ...EXPECTED_CHAIN_PROFILE },
      frontierMomentum: {
        chainIdentifier: 3,
        hash: 'f'.repeat(64),
        height: 10,
      },
      ...overrides,
    },
  };
}

async function settledMatchingContext() {
  const candidate = matchingContext();
  const observation = await candidate.context.zenon.ledger.getMomentumsByHeight(2, 1);
  const settledObservation = Promise.resolve(observation);
  await settledObservation;
  candidate.calls.length = 0;
  candidate.context.zenon.ledger.getMomentumsByHeight = function getMomentumsByHeight(...args) {
    candidate.calls.push(args);
    return settledObservation;
  };
  return candidate;
}

async function addSettledPublicReadinessReads(candidate) {
  const networkInfo = Promise.resolve({
    numPeers: 1,
    self: { publicKey: 'synthetic-node-key', ip: 'synthetic-node-address' },
    peers: [],
  });
  const syncInfo = Promise.resolve({ state: 2, currentHeight: 10, targetHeight: 10 });
  const frontier = Promise.resolve(candidate.context.frontierMomentum);
  await Promise.all([networkInfo, syncInfo, frontier]);
  candidate.context.zenon.stats = {
    networkInfo() { return networkInfo; },
    syncInfo() { return syncInfo; },
  };
  candidate.context.zenon.ledger.getFrontierMomentum = function getFrontierMomentum() {
    return frontier;
  };
  return candidate;
}

async function withReplacedProperties(replacements, execute) {
  const getDescriptor = Object.getOwnPropertyDescriptor;
  const defineProperty = Object.defineProperty;
  const originals = [];
  for (let index = 0; index < replacements.length; index += 1) {
    const [target, key, value] = replacements[index];
    originals.push([target, key, getDescriptor(target, key)]);
    defineProperty(target, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  try {
    return await execute();
  } finally {
    for (let index = originals.length - 1; index >= 0; index -= 1) {
      const [target, key, descriptor] = originals[index];
      defineProperty(target, key, descriptor);
    }
  }
}

function assertAsyncReturnShield(value) {
  const descriptor = Object.getOwnPropertyDescriptor(value, 'then');
  assert.equal(Object.hasOwn(descriptor, 'value'), true);
  assert.equal(descriptor.value, undefined);
  assert.equal(descriptor.enumerable, false);
  assert.equal(descriptor.configurable, false);
  assert.equal(descriptor.writable, false);
}

test('historical public-testnet policy is exact, immutable, provenance-pinned data with explicit non-claims', () => {
  assert.equal(OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME, EXPECTED_PROFILE_NAME);
  assert.equal(OPERATOR_TRUST_ACKNOWLEDGEMENT, EXPECTED_ACKNOWLEDGEMENT);
  assert.equal(TESTNET_LIVE_ACKNOWLEDGEMENT, EXPECTED_LIVE_ACKNOWLEDGEMENT);
  assert.equal(
    OPERATOR_TRUSTED_PUBLIC_TESTNET_WARNING,
    'Warning: this historical public-testnet anchor is operator trusted; remote chain identity is not authenticated.',
  );
  assert.deepEqual(OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE, EXPECTED_CHAIN_PROFILE);
  assert.deepEqual(OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE, {
    repository: 'zenon-network/znn-wiki',
    revision: 'cad4cde3aea2e962a1713958323699c3298790ae',
    path: 'api.md',
    sourceDate: '2021-12-17',
    observationHeight: 2,
    observationHash: EXPECTED_HEIGHT_TWO_HASH,
    derivation: 'height-2 previousHash',
  });
  assert.deepEqual(OPERATOR_TRUSTED_PUBLIC_TESTNET_NON_CLAIMS, {
    authoritativeCurrentNetworkRelease: false,
    signedTrustArtifact: false,
    authenticatedRpcEndpoint: false,
    canonicalRemoteChainIdentity: false,
    verifiedFrontierLineage: false,
    productionReadiness: false,
  });
  for (const value of [
    OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
    OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE,
    OPERATOR_TRUSTED_PUBLIC_TESTNET_NON_CLAIMS,
  ]) {
    assert.equal(Object.isFrozen(value), true);
  }
});

test('operator-trusted profile selection is exact and has no default, alias, coercion, or acknowledgement fallback', () => {
  const policy = selectOperatorTrustedTestnetPolicy(
    EXPECTED_PROFILE_NAME,
    EXPECTED_ACKNOWLEDGEMENT,
    EXPECTED_LIVE_ACKNOWLEDGEMENT,
  );
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(isOperatorTrustedTestnetPolicy(policy), true);
  assert.equal(policy.profileName, EXPECTED_PROFILE_NAME);
  assert.equal(policy.trustMode, 'operator-trusted-historical-observation');
  assert.equal(policy.remoteChainAuthenticated, false);
  assert.equal(policy.warning, OPERATOR_TRUSTED_PUBLIC_TESTNET_WARNING);

  const first = policy.chainProfile();
  const second = policy.chainProfile();
  assert.deepEqual(first, EXPECTED_CHAIN_PROFILE);
  assert.deepEqual(second, EXPECTED_CHAIN_PROFILE);
  assert.notEqual(first, second);
  first.chainIdentifier = '4';
  assert.deepEqual(policy.chainProfile(), EXPECTED_CHAIN_PROFILE);

  for (const profileName of [
    undefined,
    null,
    '',
    'testnet',
    'current',
    'latest',
    EXPECTED_PROFILE_NAME.toUpperCase(),
    ` ${EXPECTED_PROFILE_NAME}`,
    { toString: () => EXPECTED_PROFILE_NAME },
  ]) {
    assert.throws(() => selectOperatorTrustedTestnetPolicy(
      profileName,
      EXPECTED_ACKNOWLEDGEMENT,
      EXPECTED_LIVE_ACKNOWLEDGEMENT,
    ));
  }

  for (const acknowledgement of [
    undefined,
    null,
    '',
    'I_UNDERSTAND_TESTNET_ONLY',
    EXPECTED_ACKNOWLEDGEMENT.toLowerCase(),
    `${EXPECTED_ACKNOWLEDGEMENT} `,
    { toString: () => EXPECTED_ACKNOWLEDGEMENT },
  ]) {
    assert.throws(() => selectOperatorTrustedTestnetPolicy(
      EXPECTED_PROFILE_NAME,
      acknowledgement,
      EXPECTED_LIVE_ACKNOWLEDGEMENT,
    ));
  }

  for (const liveAcknowledgement of [
    undefined,
    null,
    '',
    EXPECTED_ACKNOWLEDGEMENT,
    EXPECTED_LIVE_ACKNOWLEDGEMENT.toLowerCase(),
    `${EXPECTED_LIVE_ACKNOWLEDGEMENT} `,
    { toString: () => EXPECTED_LIVE_ACKNOWLEDGEMENT },
  ]) {
    assert.throws(() => selectOperatorTrustedTestnetPolicy(
      EXPECTED_PROFILE_NAME,
      EXPECTED_ACKNOWLEDGEMENT,
      liveAcknowledgement,
    ));
  }
});

test('operator-trusted policy requires the exact historical height-2 self-report and remains non-authenticating', async () => {
  const policy = selectOperatorTrustedTestnetPolicy(
    EXPECTED_PROFILE_NAME,
    EXPECTED_ACKNOWLEDGEMENT,
    EXPECTED_LIVE_ACKNOWLEDGEMENT,
  );
  const { calls, context } = matchingContext();
  const result = await policy.observeChainTrust(context);

  assert.deepEqual(calls, [[2, 1]]);
  assert.equal(isOperatorTrustedTestnetEvidence(result), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.trustMode, 'operator-trusted-historical-observation');
  assert.equal(result.remoteChainAuthenticated, false);
  assert.equal(result.observationHeight, 2);
  assert.deepEqual(result.chainProfile, EXPECTED_CHAIN_PROFILE);
  assert.notEqual(result.chainProfile, OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE);
  assert.equal(Object.isFrozen(result.chainProfile), true);
  assert.deepEqual(policy.chainProfile(), EXPECTED_CHAIN_PROFILE);
  assert.equal(policy.remoteChainAuthenticated, false);

  const advancedAfterFrontierRead = matchingContext({}, 11);
  const advancedEvidence = await policy.observeChainTrust(advancedAfterFrontierRead.context);
  assert.equal(isOperatorTrustedTestnetEvidence(advancedEvidence), true);
  assert.notEqual(advancedEvidence, result);
  assert.deepEqual(advancedAfterFrontierRead.calls, [[2, 1]]);

  const concurrentFirst = matchingContext();
  const concurrentSecond = matchingContext();
  const [concurrentFirstEvidence, concurrentSecondEvidence] = await Promise.all([
    policy.observeChainTrust(concurrentFirst.context),
    policy.observeChainTrust(concurrentSecond.context),
  ]);
  assert.notEqual(concurrentFirstEvidence, concurrentSecondEvidence);
  assert.deepEqual(concurrentFirst.calls, [[2, 1]]);
  assert.deepEqual(concurrentSecond.calls, [[2, 1]]);

  const mismatchedExpected = matchingContext({
    expectedChainProfile: { ...EXPECTED_CHAIN_PROFILE, chainIdentifier: '4' },
  });
  await assert.rejects(policy.observeChainTrust(mismatchedExpected.context));
  assert.deepEqual(mismatchedExpected.calls, []);

  const malformedCases = [
    null,
    {},
    { count: 10, list: [] },
    { count: 9, list: [{
      version: 1,
      chainIdentifier: 3,
      hash: EXPECTED_HEIGHT_TWO_HASH,
      previousHash: EXPECTED_CHAIN_PROFILE.genesisMomentumHash,
      height: 2,
    }] },
    { count: 10.5, list: [{
      version: 1,
      chainIdentifier: 3,
      hash: EXPECTED_HEIGHT_TWO_HASH,
      previousHash: EXPECTED_CHAIN_PROFILE.genesisMomentumHash,
      height: 2,
    }] },
    { count: 10, list: [{ ...context.frontierMomentum, height: 3 }] },
    {
      count: 10,
      list: [{
        version: 2,
        chainIdentifier: 3,
        hash: EXPECTED_HEIGHT_TWO_HASH,
        previousHash: EXPECTED_CHAIN_PROFILE.genesisMomentumHash,
        height: 2,
      }],
    },
    {
      count: 10,
      list: [{
        version: 1,
        chainIdentifier: 4,
        hash: EXPECTED_HEIGHT_TWO_HASH,
        previousHash: EXPECTED_CHAIN_PROFILE.genesisMomentumHash,
        height: 2,
      }],
    },
    {
      count: 10,
      list: [{
        version: 1,
        chainIdentifier: 3,
        hash: '0'.repeat(64),
        previousHash: EXPECTED_CHAIN_PROFILE.genesisMomentumHash,
        height: 2,
      }],
    },
    {
      count: 10,
      list: [{
        version: 1,
        chainIdentifier: 3,
        hash: EXPECTED_HEIGHT_TWO_HASH,
        previousHash: '0'.repeat(64),
        height: 2,
      }],
    },
  ];

  for (const observation of malformedCases) {
    const candidate = matchingContext();
    candidate.context.zenon.ledger.getMomentumsByHeight = async (...args) => {
      candidate.calls.push(args);
      return observation;
    };
    await assert.rejects(policy.observeChainTrust(candidate.context));
    assert.deepEqual(candidate.calls, [[2, 1]]);
  }
});

test('readiness adapts the historical policy without upgrading it to authenticated chain identity', async () => {
  const policy = selectOperatorTrustedTestnetPolicy(
    EXPECTED_PROFILE_NAME,
    EXPECTED_ACKNOWLEDGEMENT,
    EXPECTED_LIVE_ACKNOWLEDGEMENT,
  );
  const { context } = matchingContext();
  context.zenon.stats = {
    async networkInfo() {
      return {
        numPeers: 1,
        self: { publicKey: 'synthetic-node-key', ip: 'synthetic-node-address' },
        peers: [],
      };
    },
    async syncInfo() {
      return { state: 2, currentHeight: 10, targetHeight: 10 };
    },
  };
  context.zenon.ledger.getFrontierMomentum = async () => context.frontierMomentum;
  context.frontierMomentum.hash = 'f'.repeat(64);
  const operations = [];
  const result = await assertZenonNodeReady(
    context.zenon,
    { SyncState: { SyncDone: 2 } },
    undefined,
    context.expectedChainProfile,
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
  assert.equal(Object.hasOwn(result, 'authenticatedProfile'), false);
  assert.equal(isOperatorTrustedTestnetEvidence(result.chainTrustEvidence), true);
  assert.deepEqual(result.chainTrustEvidence.chainProfile, EXPECTED_CHAIN_PROFILE);
  assert.equal(result.chainTrustEvidence.remoteChainAuthenticated, false);
  assert.equal(policy.remoteChainAuthenticated, false);
  assert.equal(OPERATOR_TRUSTED_PUBLIC_TESTNET_NON_CLAIMS.authenticatedRpcEndpoint, false);
  assert.equal(OPERATOR_TRUSTED_PUBLIC_TESTNET_NON_CLAIMS.verifiedFrontierLineage, false);
});

test('operator-trusted policy cannot be forged or combined with authenticated identity', async () => {
  const policy = selectOperatorTrustedTestnetPolicy(
    EXPECTED_PROFILE_NAME,
    EXPECTED_ACKNOWLEDGEMENT,
    EXPECTED_LIVE_ACKNOWLEDGEMENT,
  );
  const authenticator = async () => ({ ...EXPECTED_CHAIN_PROFILE });

  assert.throws(
    () => new ExactZenonClient({ operatorTrustedChainPolicy: { ...policy } }),
    { code: 'operator_trusted_chain_policy_invalid' },
  );
  assert.throws(
    () => new ExactZenonFacilitator({ operatorTrustedChainPolicy: { ...policy } }),
    { code: 'operator_trusted_chain_policy_invalid' },
  );
  assert.throws(
    () => new ExactZenonClient({
      authenticateChainProfile: authenticator,
      operatorTrustedChainPolicy: policy,
    }),
    { code: 'chain_trust_policy_conflict' },
  );
  assert.throws(
    () => new ExactZenonFacilitator({
      authenticateChainProfile: authenticator,
      operatorTrustedChainPolicy: policy,
    }),
    { code: 'chain_trust_policy_conflict' },
  );

  const { context } = matchingContext();
  context.zenon.stats = {
    networkInfo: async () => ({
      numPeers: 1,
      self: { publicKey: 'synthetic-node-key', ip: 'synthetic-node-address' },
      peers: [],
    }),
    syncInfo: async () => ({ state: 2, currentHeight: 10, targetHeight: 10 }),
  };
  context.zenon.ledger.getFrontierMomentum = async () => context.frontierMomentum;
  await assert.rejects(
    assertZenonNodeReady(
      context.zenon,
      { SyncState: { SyncDone: 2 } },
      authenticator,
      context.expectedChainProfile,
      { operatorTrustedChainPolicy: policy },
    ),
    { code: 'chain_trust_policy_conflict' },
  );
  await assert.rejects(
    assertZenonNodeReady(
      context.zenon,
      { SyncState: { SyncDone: 2 } },
      'not-an-authenticator',
      context.expectedChainProfile,
      { operatorTrustedChainPolicy: policy },
    ),
    { code: 'chain_trust_policy_conflict' },
  );
});

test('buyer rejects a challenge with a different profile before mnemonic or SDK work', async () => {
  const policy = selectOperatorTrustedTestnetPolicy(
    EXPECTED_PROFILE_NAME,
    EXPECTED_ACKNOWLEDGEMENT,
    EXPECTED_LIVE_ACKNOWLEDGEMENT,
  );
  const accepted = {
    scheme: 'exact',
    network: 'zenon:testnet',
    asset: 'zts1qqqqqqqqqqqqtq587y',
    amount: '1',
    payTo: 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f',
    maxTimeoutSeconds: 30,
    extra: {
      paymentFlow: 'upfront',
      poc: true,
      settlement: 'account-block',
      zenonChain: {
        ...EXPECTED_CHAIN_PROFILE,
        genesisMomentumHash: 'a'.repeat(64),
      },
    },
  };
  const required = {
    x402Version: 2,
    resource: { url: 'https://resource.example/paid' },
    accepts: [accepted],
  };
  const client = new ExactZenonClient({
    environment: {
      ZENON_LIVE_ACK: EXPECTED_LIVE_ACKNOWLEDGEMENT,
      ZENON_NETWORK_ID: '3',
    },
    operatorTrustedChainPolicy: policy,
  });
  await assert.rejects(
    client.createPaymentPayload(required, accepted),
    { code: 'operator_trusted_profile_mismatch' },
  );
});

test('public policy and evidence brands resist post-import intrinsic replacement', async () => {
  const policy = selectOperatorTrustedTestnetPolicy(
    EXPECTED_PROFILE_NAME,
    EXPECTED_ACKNOWLEDGEMENT,
    EXPECTED_LIVE_ACKNOWLEDGEMENT,
  );
  const { context } = matchingContext();
  let hostileCalls = 0;
  function hostileIntrinsic() {
    hostileCalls += 1;
    throw new Error('hostile intrinsic invoked');
  }

  const evidence = await withReplacedProperties([
    [Reflect, 'apply', hostileIntrinsic],
    [Reflect, 'ownKeys', hostileIntrinsic],
    [Array, 'isArray', hostileIntrinsic],
    [Array.prototype, 'sort', hostileIntrinsic],
    [Object, 'create', hostileIntrinsic],
    [Object, 'defineProperty', hostileIntrinsic],
    [Object, 'freeze', hostileIntrinsic],
    [Object, 'getOwnPropertyDescriptor', hostileIntrinsic],
    [Object, 'getOwnPropertyDescriptors', hostileIntrinsic],
    [Object, 'getPrototypeOf', hostileIntrinsic],
    [Object, 'hasOwn', hostileIntrinsic],
    [Object, 'keys', hostileIntrinsic],
    [WeakSet.prototype, 'add', hostileIntrinsic],
    [WeakSet.prototype, 'has', hostileIntrinsic],
    [Number, 'isSafeInteger', hostileIntrinsic],
    [RegExp.prototype, 'exec', hostileIntrinsic],
    [RegExp.prototype, 'test', hostileIntrinsic],
    [Buffer, 'isBuffer', hostileIntrinsic],
    [Buffer.prototype, 'toString', hostileIntrinsic],
    [utilTypes, 'isPromise', hostileIntrinsic],
    [utilTypes, 'isProxy', hostileIntrinsic],
  ], async () => {
    assert.equal(isOperatorTrustedTestnetPolicy(policy), true);
    const result = await policy.observeChainTrust(context);
    assert.equal(isOperatorTrustedTestnetEvidence(result), true);
    return result;
  });
  assert.equal(isOperatorTrustedTestnetEvidence(evidence), true);
  assert.equal(hostileCalls, 0);
});

test('public observation uses SDK data descriptors without conversion hooks', async () => {
  const policy = selectOperatorTrustedTestnetPolicy(
    EXPECTED_PROFILE_NAME,
    EXPECTED_ACKNOWLEDGEMENT,
    EXPECTED_LIVE_ACKNOWLEDGEMENT,
  );
  const actualSdk = matchingContext();
  actualSdk.context.frontierMomentum = new sdk.Momentum(
    1,
    3,
    sdk.Hash.parse('f'.repeat(64)),
    sdk.Hash.parse(EXPECTED_CHAIN_PROFILE.genesisMomentumHash),
    10,
    0,
    Buffer.alloc(0),
    [],
    sdk.Hash.parse('1'.repeat(64)),
    '',
    '',
    undefined,
  );
  actualSdk.context.zenon.ledger.getMomentumsByHeight = async (...args) => {
    actualSdk.calls.push(args);
    return new sdk.MomentumList(10, [new sdk.Momentum(
      1,
      3,
      sdk.Hash.parse(EXPECTED_HEIGHT_TWO_HASH),
      sdk.Hash.parse(EXPECTED_CHAIN_PROFILE.genesisMomentumHash),
      2,
      0,
      Buffer.alloc(0),
      [],
      sdk.Hash.parse('1'.repeat(64)),
      '',
      '',
      undefined,
    )]);
  };
  const actualEvidence = await policy.observeChainTrust(actualSdk.context);
  assert.equal(isOperatorTrustedTestnetEvidence(actualEvidence), true);
  assert.deepEqual(actualSdk.calls, [[2, 1]]);

  let hookCalls = 0;
  const hash = sdk.Hash.parse(EXPECTED_HEIGHT_TWO_HASH);
  Object.defineProperty(hash, 'toString', {
    enumerable: true,
    value() {
      hookCalls += 1;
      throw new Error('hook must not execute');
    },
  });
  const { calls, context } = matchingContext();
  context.zenon.ledger.getMomentumsByHeight = async (...args) => {
    calls.push(args);
    return new sdk.MomentumList(10, [new sdk.Momentum(
      1,
      3,
      hash,
      sdk.Hash.parse(EXPECTED_CHAIN_PROFILE.genesisMomentumHash),
      2,
      0,
      Buffer.alloc(0),
      [],
      sdk.Hash.parse('1'.repeat(64)),
      '',
      '',
      undefined,
    )]);
  };
  await assert.rejects(policy.observeChainTrust(context));
  assert.equal(hookCalls, 0);
  assert.deepEqual(calls, [[2, 1]]);
});

test('public observation captures frontier primitives before await and rejects mutation', async () => {
  const policy = selectOperatorTrustedTestnetPolicy(
    EXPECTED_PROFILE_NAME,
    EXPECTED_ACKNOWLEDGEMENT,
    EXPECTED_LIVE_ACKNOWLEDGEMENT,
  );
  const { calls, context } = matchingContext({}, 11);
  context.zenon.ledger.getMomentumsByHeight = async (...args) => {
    calls.push(args);
    context.frontierMomentum.height = 11;
    context.frontierMomentum.hash = 'e'.repeat(64);
    return {
      count: 11,
      list: [{
        version: 1,
        chainIdentifier: 3,
        hash: EXPECTED_HEIGHT_TWO_HASH,
        previousHash: EXPECTED_CHAIN_PROFILE.genesisMomentumHash,
        height: 2,
      }],
    };
  };
  await assert.rejects(policy.observeChainTrust(context));
  assert.deepEqual(calls, [[2, 1]]);
});

test('public SDK query method proxy is rejected before invocation', async () => {
  const policy = selectOperatorTrustedTestnetPolicy(
    EXPECTED_PROFILE_NAME,
    EXPECTED_ACKNOWLEDGEMENT,
    EXPECTED_LIVE_ACKNOWLEDGEMENT,
  );
  const candidate = matchingContext();
  let applyTrapCalls = 0;
  let queryCalls = 0;
  let resultHookCalls = 0;
  const target = function getMomentumsByHeight() {
    queryCalls += 1;
    return new Proxy({}, {
      get() {
        resultHookCalls += 1;
        throw new Error('result hook must not execute');
      },
    });
  };
  candidate.context.zenon.ledger.getMomentumsByHeight = new Proxy(target, {
    apply(callable, receiver, args) {
      applyTrapCalls += 1;
      return Reflect.apply(callable, receiver, args);
    },
  });

  await assert.rejects(policy.observeChainTrust(candidate.context));
  assert.equal(applyTrapCalls, 0);
  assert.equal(queryCalls, 0);
  assert.equal(resultHookCalls, 0);
});

test('public raw observation rejects proxy and own then accessors without invoking hooks', async () => {
  const policy = selectOperatorTrustedTestnetPolicy(
    EXPECTED_PROFILE_NAME,
    EXPECTED_ACKNOWLEDGEMENT,
    EXPECTED_LIVE_ACKNOWLEDGEMENT,
  );
  const proxied = matchingContext();
  const proxiedObservation = await proxied.context.zenon.ledger.getMomentumsByHeight(2, 1);
  proxied.calls.length = 0;
  let resultProxyTrapCalls = 0;
  const resultProxy = new Proxy(proxiedObservation, {
    get(_target, key) {
      resultProxyTrapCalls += 1;
      if (key === 'then') return undefined;
      throw new Error('result proxy trap must not execute');
    },
  });
  proxied.context.zenon.ledger.getMomentumsByHeight = function getMomentumsByHeight(...args) {
    proxied.calls.push(args);
    return resultProxy;
  };
  await assert.rejects(policy.observeChainTrust(proxied.context));

  const accessor = matchingContext();
  const accessorObservation = await accessor.context.zenon.ledger.getMomentumsByHeight(2, 1);
  accessor.calls.length = 0;
  let thenGetterCalls = 0;
  Object.defineProperty(accessorObservation, 'then', {
    configurable: true,
    get() {
      thenGetterCalls += 1;
      return undefined;
    },
  });
  accessor.context.zenon.ledger.getMomentumsByHeight = function getMomentumsByHeight(...args) {
    accessor.calls.push(args);
    return accessorObservation;
  };
  await assert.rejects(policy.observeChainTrust(accessor.context));

  assert.equal(resultProxyTrapCalls, 0);
  assert.equal(thenGetterCalls, 0);
  assert.deepEqual(proxied.calls, [[2, 1]]);
  assert.deepEqual(accessor.calls, [[2, 1]]);
});

test('public observation supports genuine native Promise and synchronous SDK results', {
  concurrency: false,
}, async () => {
  const dispatcher = await import('../src/zenon/operator-trusted-chain-policy.js');
  const policy = selectOperatorTrustedTestnetPolicy(
    EXPECTED_PROFILE_NAME,
    EXPECTED_ACKNOWLEDGEMENT,
    EXPECTED_LIVE_ACKNOWLEDGEMENT,
  );
  const promised = matchingContext();
  const promisedObservation = await promised.context.zenon.ledger.getMomentumsByHeight(2, 1);
  const nativePromise = Promise.resolve(promisedObservation);
  await nativePromise;
  promised.calls.length = 0;
  promised.context.zenon.ledger.getMomentumsByHeight = function getMomentumsByHeight(...args) {
    promised.calls.push(args);
    return nativePromise;
  };
  const synchronous = matchingContext();
  const synchronousObservation = await synchronous.context.zenon.ledger.getMomentumsByHeight(2, 1);
  synchronous.calls.length = 0;
  synchronous.context.zenon.ledger.getMomentumsByHeight =
    function getMomentumsByHeight(...args) {
      synchronous.calls.push(args);
      return synchronousObservation;
    };
  const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  const defineProperty = Object.defineProperty;
  const priorThen = getOwnPropertyDescriptor(Promise.prototype, 'then');
  let hostileThenCalls = 0;
  let promisedEvidence;
  let synchronousEvidence;
  let promisedRejected = false;
  let synchronousRejected = false;

  try {
    defineProperty(Promise.prototype, 'then', {
      configurable: true,
      writable: true,
      value() {
        hostileThenCalls += 1;
        throw new Error('live Promise.prototype.then must not execute');
      },
    });
    try {
      synchronousEvidence = await dispatcher.observeOperatorTrustedChainPolicy(
        policy,
        synchronous.context,
      );
    } catch {
      synchronousRejected = true;
    }
    try {
      promisedEvidence = await dispatcher.observeOperatorTrustedChainPolicy(
        policy,
        promised.context,
      );
    } catch {
      promisedRejected = true;
    }
  } finally {
    defineProperty(Promise.prototype, 'then', priorThen);
  }

  assert.equal(synchronousRejected, false, 'synchronous public observation must succeed');
  assert.equal(promisedRejected, false, 'native-Promise public observation must succeed');
  assert.equal(hostileThenCalls, 0);
  assert.equal(isOperatorTrustedTestnetEvidence(promisedEvidence), true);
  assert.equal(isOperatorTrustedTestnetEvidence(synchronousEvidence), true);
  assert.deepEqual(promised.calls, [[2, 1]]);
  assert.deepEqual(synchronous.calls, [[2, 1]]);
});

test('public evidence, dispatcher, and readiness returns resist inherited then assimilation', {
  concurrency: false,
}, async () => {
  const dispatcher = await import('../src/zenon/operator-trusted-chain-policy.js');
  const policy = selectOperatorTrustedTestnetPolicy(
    EXPECTED_PROFILE_NAME,
    EXPECTED_ACKNOWLEDGEMENT,
    EXPECTED_LIVE_ACKNOWLEDGEMENT,
  );
  const direct = await settledMatchingContext();
  const dispatched = await settledMatchingContext();
  const readiness = await addSettledPublicReadinessReads(await settledMatchingContext());
  const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  const defineProperty = Object.defineProperty;
  const deleteProperty = Reflect.deleteProperty;
  const priorThen = getOwnPropertyDescriptor(Object.prototype, 'then');
  const priorDefineProperty = getOwnPropertyDescriptor(Object, 'defineProperty');
  const substitution = Object.freeze(Object.create(null));
  let getterCalls = 0;
  let assimilationCalls = 0;
  let hostileDefineCalls = 0;
  let directEvidence;
  let dispatchedEvidence;
  let readinessResult;

  try {
    defineProperty(Object.prototype, 'then', {
      configurable: true,
      get() {
        getterCalls += 1;
        return resolve => {
          assimilationCalls += 1;
          resolve(substitution);
        };
      },
    });
    defineProperty(Object, 'defineProperty', {
      configurable: true,
      writable: true,
      value() {
        hostileDefineCalls += 1;
        throw new Error('live defineProperty must not execute');
      },
    });

    directEvidence = await policy.observeChainTrust(direct.context);
    dispatchedEvidence = await dispatcher.observeOperatorTrustedChainPolicy(
      policy,
      dispatched.context,
    );
    readinessResult = await assertZenonNodeReady(
      readiness.context.zenon,
      { SyncState: { SyncDone: 2 } },
      undefined,
      readiness.context.expectedChainProfile,
      { operatorTrustedChainPolicy: policy },
    );
  } finally {
    defineProperty(Object, 'defineProperty', priorDefineProperty);
    if (priorThen) defineProperty(Object.prototype, 'then', priorThen);
    else Reflect.apply(deleteProperty, Reflect, [Object.prototype, 'then']);
  }

  assert.equal(getterCalls, 0);
  assert.equal(assimilationCalls, 0);
  assert.equal(hostileDefineCalls, 0);
  assert.notEqual(directEvidence, substitution);
  assert.notEqual(dispatchedEvidence, substitution);
  assert.notEqual(readinessResult, substitution);
  assert.equal(isOperatorTrustedTestnetEvidence(directEvidence), true);
  assert.equal(isOperatorTrustedTestnetEvidence(dispatchedEvidence), true);
  assert.equal(isOperatorTrustedTestnetEvidence(readinessResult.chainTrustEvidence), true);
  assertAsyncReturnShield(directEvidence);
  assertAsyncReturnShield(dispatchedEvidence);
  assertAsyncReturnShield(readinessResult);
  assert.deepEqual(direct.calls, [[2, 1]]);
  assert.deepEqual(dispatched.calls, [[2, 1]]);
  assert.deepEqual(readiness.calls, [[2, 1]]);
});

test('public normalized snapshots ignore inherited prototype field accessors', {
  concurrency: false,
}, async () => {
  const policy = selectOperatorTrustedTestnetPolicy(
    EXPECTED_PROFILE_NAME,
    EXPECTED_ACKNOWLEDGEMENT,
    EXPECTED_LIVE_ACKNOWLEDGEMENT,
  );
  const candidate = matchingContext();
  const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  const defineProperty = Object.defineProperty;
  const deleteProperty = Reflect.deleteProperty;
  const priorCount = getOwnPropertyDescriptor(Object.prototype, 'count');
  let getterCalls = 0;
  let setterCalls = 0;
  let evidence;

  try {
    defineProperty(Object.prototype, 'count', {
      configurable: true,
      get() {
        getterCalls += 1;
        return -1;
      },
      set() {
        setterCalls += 1;
      },
    });
    evidence = await policy.observeChainTrust(candidate.context);
  } finally {
    if (priorCount) defineProperty(Object.prototype, 'count', priorCount);
    else Reflect.apply(deleteProperty, Reflect, [Object.prototype, 'count']);
  }

  assert.equal(getterCalls, 0);
  assert.equal(setterCalls, 0);
  assert.equal(isOperatorTrustedTestnetEvidence(evidence), true);
  assert.deepEqual(candidate.calls, [[2, 1]]);
});

test('closed dispatcher invokes and preserves the public policy family', async () => {
  const dispatcher = await import('../src/zenon/operator-trusted-chain-policy.js');
  const policy = selectOperatorTrustedTestnetPolicy(
    EXPECTED_PROFILE_NAME,
    EXPECTED_ACKNOWLEDGEMENT,
    EXPECTED_LIVE_ACKNOWLEDGEMENT,
  );
  const { calls, context } = matchingContext();
  const evidence = await dispatcher.observeOperatorTrustedChainPolicy(policy, context);
  assert.equal(isOperatorTrustedTestnetEvidence(evidence), true);
  assert.deepEqual(calls, [[2, 1]]);
  assert.equal(Object.hasOwn(dispatcher, 'isOperatorTrustedChainEvidence'), false);
});

test('public observation rejects proxies and accessors without executing their traps', async () => {
  const policy = selectOperatorTrustedTestnetPolicy(
    EXPECTED_PROFILE_NAME,
    EXPECTED_ACKNOWLEDGEMENT,
    EXPECTED_LIVE_ACKNOWLEDGEMENT,
  );
  let getterReads = 0;
  const accessor = matchingContext();
  Object.defineProperty(accessor.context.frontierMomentum, 'height', {
    enumerable: true,
    get() {
      getterReads += 1;
      return 10;
    },
  });
  await assert.rejects(policy.observeChainTrust(accessor.context));
  assert.equal(getterReads, 0);
  assert.deepEqual(accessor.calls, []);

  const proxiedFrontier = matchingContext();
  proxiedFrontier.context.frontierMomentum = new Proxy(
    proxiedFrontier.context.frontierMomentum,
    {},
  );
  await assert.rejects(policy.observeChainTrust(proxiedFrontier.context));
  assert.deepEqual(proxiedFrontier.calls, []);

  const proxiedObservation = matchingContext();
  const originalQuery = proxiedObservation.context.zenon.ledger.getMomentumsByHeight;
  proxiedObservation.context.zenon.ledger.getMomentumsByHeight = async (...args) => new Proxy(
    await originalQuery(...args),
    {},
  );
  await assert.rejects(policy.observeChainTrust(proxiedObservation.context));
  assert.deepEqual(proxiedObservation.calls, [[2, 1]]);
});
