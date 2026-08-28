import assert from 'node:assert/strict';
import test from 'node:test';

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
      frontierMomentum: { chainIdentifier: 3, height: 10 },
      ...overrides,
    },
  };
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
  assert.deepEqual(advancedAfterFrontierRead.calls, [[2, 1]]);

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
