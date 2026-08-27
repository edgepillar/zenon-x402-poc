import test from 'node:test';
import assert from 'node:assert/strict';

import { ChainProfile } from '../src/zenon/chain-profile.js';
import { assertZenonNodeReady } from '../src/zenon-payment.js';
import { validateZenonChainProfile } from '../src/x402-wire.js';

const SOURCE_PROVENANCE = Object.freeze({
  repository: 'zenon-network/go-zenon',
  tag: 'v0.0.8-alphanet',
  configurationPath: 'chain/genesis/embedded_genesis_string.go',
  expectedIdentityPath: 'chain/genesis/embedded_genesis_test.go',
});

// This test-local vector records only the deterministic expectation asserted by
// the tagged source. It is not independently derived or a runtime trust anchor.
const SOURCE_VECTOR = Object.freeze({
  version: 1,
  chainIdentifier: '1',
  genesisMomentumHash: '9e204601d1b7b1427fe12bc82622e610d8a6ad43c40abf020eb66e538bb8eeb0',
});

const SOURCE_VECTOR_NON_CLAIMS = Object.freeze({
  signedRelease: false,
  signedTrustArtifact: false,
  canonicalNetworkDefault: false,
  authenticatedRpcChainIdentity: false,
  trustedNodeAuthentication: false,
  checkpointOrFrontierLinkage: false,
  momentumConsensusVerification: false,
  spvOrLightClientVerification: false,
  liveMode: false,
  productionReadiness: false,
});

test('official release genesis source vector round-trips as exact chain-profile data', () => {
  assert.doesNotThrow(() => validateZenonChainProfile(SOURCE_VECTOR));

  const profile = ChainProfile.fromWire(SOURCE_VECTOR);
  const wire = profile.toWire();

  assert.deepEqual(wire, SOURCE_VECTOR);
  assert.deepEqual(Object.keys(wire), [
    'version',
    'chainIdentifier',
    'genesisMomentumHash',
  ]);
  assert.equal(profile.version, SOURCE_VECTOR.version);
  assert.equal(profile.chainIdentifier, SOURCE_VECTOR.chainIdentifier);
  assert.equal(profile.genesisMomentumHash, SOURCE_VECTOR.genesisMomentumHash);
  assert.equal(Object.hasOwn(wire, 'network'), false);
  assert.equal(Object.hasOwn(wire, 'namespace'), false);
  assert.deepEqual(SOURCE_PROVENANCE, {
    repository: 'zenon-network/go-zenon',
    tag: 'v0.0.8-alphanet',
    configurationPath: 'chain/genesis/embedded_genesis_string.go',
    expectedIdentityPath: 'chain/genesis/embedded_genesis_test.go',
  });
  assert.equal(
    Object.values(SOURCE_VECTOR_NON_CLAIMS).every(value => value === false),
    true,
  );
});

test('official release genesis source vector remains detached and rejects identity substitution', () => {
  const profile = ChainProfile.fromWire(SOURCE_VECTOR);
  const firstWire = profile.toWire();
  const secondWire = profile.toWire();
  const substitutedChainIdentifier = String(BigInt(SOURCE_VECTOR.chainIdentifier) + 1n);
  const substitutedGenesisMomentumHash =
    `${SOURCE_VECTOR.genesisMomentumHash[0] === '0' ? '1' : '0'}${SOURCE_VECTOR.genesisMomentumHash.slice(1)}`;

  assert.notEqual(firstWire, secondWire);
  firstWire.chainIdentifier = substitutedChainIdentifier;
  firstWire.genesisMomentumHash = substitutedGenesisMomentumHash;
  assert.deepEqual(profile.toWire(), SOURCE_VECTOR);

  assert.equal(profile.equals({
    ...SOURCE_VECTOR,
    chainIdentifier: substitutedChainIdentifier,
  }), false);
  assert.equal(profile.equals({
    ...SOURCE_VECTOR,
    genesisMomentumHash: substitutedGenesisMomentumHash,
  }), false);
  assert.throws(() => ChainProfile.fromWire({ ...SOURCE_VECTOR, version: 2 }));

  const missingChainIdentifier = { ...SOURCE_VECTOR };
  delete missingChainIdentifier.chainIdentifier;
  assert.throws(() => ChainProfile.fromWire(missingChainIdentifier));

  const missingGenesisMomentumHash = { ...SOURCE_VECTOR };
  delete missingGenesisMomentumHash.genesisMomentumHash;
  assert.throws(() => ChainProfile.fromWire(missingGenesisMomentumHash));

  assert.throws(() => ChainProfile.fromWire({
    ...SOURCE_VECTOR,
    unexpected: true,
  }));
});

test('official release genesis source vector alone does not authenticate a node session', async () => {
  const reads = {
    networkInfo: 0,
    syncInfo: 0,
    frontierMomentum: 0,
  };
  const effects = {
    signing: 0,
    settlement: 0,
    journal: 0,
    publication: 0,
    delivery: 0,
  };
  const node = {
    stats: {
      networkInfo: async () => {
        reads.networkInfo += 1;
        return {
          numPeers: 1,
          self: { publicKey: 'synthetic-node-key', ip: 'synthetic-node-address' },
          peers: [],
        };
      },
      syncInfo: async () => {
        reads.syncInfo += 1;
        return { state: 2, currentHeight: 2, targetHeight: 2 };
      },
    },
    ledger: {
      getFrontierMomentum: async () => {
        reads.frontierMomentum += 1;
        return {
          chainIdentifier: Number(SOURCE_VECTOR.chainIdentifier),
          genesisMomentumHash: SOURCE_VECTOR.genesisMomentumHash,
          height: 2,
        };
      },
    },
  };
  const sdk = { SyncState: { SyncDone: 2 } };

  async function runGuardedEffects() {
    await assertZenonNodeReady(node, sdk, undefined, SOURCE_VECTOR);
    effects.signing += 1;
    effects.settlement += 1;
    effects.journal += 1;
    effects.publication += 1;
    effects.delivery += 1;
  }

  await assert.rejects(
    runGuardedEffects(),
    { code: 'node_network_identity_unavailable' },
  );
  assert.deepEqual(reads, {
    networkInfo: 1,
    syncInfo: 1,
    frontierMomentum: 1,
  });
  assert.deepEqual(effects, {
    signing: 0,
    settlement: 0,
    journal: 0,
    publication: 0,
    delivery: 0,
  });
  assert.equal(SOURCE_VECTOR_NON_CLAIMS.authenticatedRpcChainIdentity, false);
  assert.equal(SOURCE_VECTOR_NON_CLAIMS.trustedNodeAuthentication, false);
  assert.equal(SOURCE_VECTOR_NON_CLAIMS.checkpointOrFrontierLinkage, false);
});
