import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { types as utilTypes } from 'node:util';
import * as sdk from 'znn-typescript-sdk';

import { canonicalJson } from '../src/canonical.js';
import {
  OPERATOR_TRUST_ACKNOWLEDGEMENT,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
  isOperatorTrustedTestnetEvidence,
  isOperatorTrustedTestnetPolicy,
  selectOperatorTrustedTestnetPolicy,
} from '../src/zenon/operator-trusted-testnet-profile.js';
import {
  OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
  OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE,
  OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_NON_CLAIMS,
  OperatorTrustedLocalDevnetError,
  isOperatorTrustedLocalDevnetEvidence,
  isOperatorTrustedLocalDevnetProfileArtifact,
  parseOperatorTrustedLocalDevnetProfileArtifact,
  validateOperatorTrustedLocalDevnetObservation,
} from '../src/zenon/operator-trusted-local-devnet-profile.js';

const syntheticHash = character => character.repeat(64);
const syntheticRevision = character => character.repeat(40);

function artifactValue() {
  return {
    artifactVersion: 1,
    lane: OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE,
    acknowledgement: OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
    chainProfile: {
      version: 1,
      chainIdentifier: '69',
      genesisMomentumHash: syntheticHash('a'),
    },
    heightTwo: {
      version: 1,
      chainIdentifier: 69,
      height: 2,
      hash: syntheticHash('b'),
      previousHash: syntheticHash('a'),
    },
    provenance: {
      generator: {
        repository: '0x3639/testnet',
        revision: syntheticRevision('c'),
      },
      nodeRuntime: {
        sourceRepository: 'zenon-network/go-zenon',
        sourceRevision: syntheticRevision('d'),
        containerImageDigest: `sha256:${syntheticHash('e')}`,
      },
    },
    nonClaims: { ...OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_NON_CLAIMS },
  };
}

function artifactText(value = artifactValue()) {
  return `${canonicalJson(value)}\n`;
}

function matchingObservation() {
  return {
    reportedMomentumCount: 8,
    frontierMomentum: {
      chainIdentifier: 69,
      height: 8,
    },
    heightTwoMomentum: {
      version: 1,
      chainIdentifier: 69,
      height: 2,
      hash: syntheticHash('b'),
      previousHash: syntheticHash('a'),
    },
  };
}

function sdkMomentum({
  chainIdentifier = 69,
  hash = syntheticHash('f'),
  height = 8,
  previousHash = syntheticHash('a'),
  version = 1,
} = {}) {
  return new sdk.Momentum(
    version,
    chainIdentifier,
    sdk.Hash.parse(hash),
    sdk.Hash.parse(previousHash),
    height,
    0,
    Buffer.alloc(0),
    [],
    sdk.Hash.parse(syntheticHash('1')),
    '',
    '',
    undefined,
  );
}

function localSdkContext({ query } = {}) {
  const calls = [];
  const frontierMomentum = sdkMomentum();
  const heightTwoMomentum = sdkMomentum({
    hash: syntheticHash('b'),
    height: 2,
  });
  const zenon = {
    ledger: {
      async getMomentumsByHeight(...args) {
        calls.push(args);
        if (query) return query({ calls, frontierMomentum, heightTwoMomentum });
        return new sdk.MomentumList(8, [heightTwoMomentum]);
      },
    },
  };
  return {
    calls,
    context: {
      zenon,
      expectedChainProfile: { ...artifactValue().chainProfile },
      frontierMomentum,
    },
  };
}

function publicSdkContext() {
  const calls = [];
  const frontierMomentum = {
    chainIdentifier: Number(OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.chainIdentifier),
    hash: syntheticHash('f'),
    height: 8,
  };
  const zenon = {
    ledger: {
      getMomentumsByHeight(...args) {
        calls.push(args);
        return {
          count: 8,
          list: [{
            version: 1,
            chainIdentifier: frontierMomentum.chainIdentifier,
            hash: OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE.observationHash,
            previousHash: OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.genesisMomentumHash,
            height: OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE.observationHeight,
          }],
        };
      },
    },
  };
  return {
    calls,
    context: {
      zenon,
      expectedChainProfile: { ...OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE },
      frontierMomentum,
    },
  };
}

async function settledLocalSdkContext() {
  const candidate = localSdkContext();
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

async function addSettledReadinessReads(candidate) {
  const networkInfo = Promise.resolve({
    numPeers: 1,
    self: { publicKey: 'synthetic-node-key', ip: 'synthetic-node-address' },
    peers: [],
  });
  const syncInfo = Promise.resolve({
    state: sdk.SyncState.SyncDone,
    currentHeight: 8,
    targetHeight: 8,
  });
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

async function runReadinessWithInjectedEvidence({
  assertZenonNodeReady,
  candidate,
  evidence,
  expectedChainProfile,
  policy,
}) {
  await addSettledReadinessReads(candidate);
  return assertZenonNodeReady(
    candidate.context.zenon,
    sdk,
    undefined,
    expectedChainProfile,
    {
      callRead(operation, execute) {
        if (operation === 'operatorTrustedChainObservation') return evidence;
        return execute();
      },
      operatorTrustedChainPolicy: policy,
    },
  );
}

async function runReadinessNormally({
  assertZenonNodeReady,
  candidate,
  expectedChainProfile,
  policy,
}) {
  await addSettledReadinessReads(candidate);
  return assertZenonNodeReady(
    candidate.context.zenon,
    sdk,
    undefined,
    expectedChainProfile,
    {
      callRead(_operation, execute) {
        return execute();
      },
      operatorTrustedChainPolicy: policy,
    },
  );
}

function clone(value) {
  return structuredClone(value);
}

function assertFixedFailure(execute) {
  assert.throws(execute, error => {
    assertFixedError(error);
    return true;
  });
}

function assertFixedError(error) {
  assert.equal(error instanceof OperatorTrustedLocalDevnetError, true);
  assert.equal(error.code, 'operator_trusted_local_devnet_artifact_invalid');
  assert.equal(error.cause, undefined);
  assert.equal(
    error.stack,
    'OperatorTrustedLocalDevnetError: operator_trusted_local_devnet_artifact_invalid',
  );
}

function assertAsyncReturnShield(value) {
  const descriptor = Object.getOwnPropertyDescriptor(value, 'then');
  assert.equal(Object.hasOwn(descriptor, 'value'), true);
  assert.equal(descriptor.value, undefined);
  assert.equal(descriptor.enumerable, false);
  assert.equal(descriptor.configurable, false);
  assert.equal(descriptor.writable, false);
}

function withReplacedProperties(replacements, execute) {
  const originals = [];
  for (let index = 0; index < replacements.length; index += 1) {
    const [target, key, value] = replacements[index];
    originals.push([target, key, Object.getOwnPropertyDescriptor(target, key)]);
    Object.defineProperty(target, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  try {
    return execute();
  } finally {
    for (let index = originals.length - 1; index >= 0; index -= 1) {
      const [target, key, descriptor] = originals[index];
      Object.defineProperty(target, key, descriptor);
    }
  }
}

async function withReplacedPropertiesAsync(replacements, execute) {
  const originals = [];
  const getDescriptor = Object.getOwnPropertyDescriptor;
  const defineProperty = Object.defineProperty;
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

test('local four-node devnet artifact is canonical, branded, detached, and deeply frozen', () => {
  const parsed = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());

  assert.equal(isOperatorTrustedLocalDevnetProfileArtifact(parsed), true);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.chainProfile), true);
  assert.equal(Object.isFrozen(parsed.heightTwo), true);
  assert.equal(Object.isFrozen(parsed.provenance), true);
  assert.equal(Object.isFrozen(parsed.provenance.generator), true);
  assert.equal(Object.isFrozen(parsed.provenance.nodeRuntime), true);
  assert.equal(Object.isFrozen(parsed.nonClaims), true);
  assert.equal(parsed.lane, OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE);
  assert.equal(parsed.chainProfile.chainIdentifier, '69');
  assert.equal(parsed.heightTwo.previousHash, parsed.chainProfile.genesisMomentumHash);
  assert.deepEqual(parsed.nonClaims, OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_NON_CLAIMS);
});

test('local devnet acknowledgement and lane cannot substitute for the public-testnet selector', () => {
  assert.notEqual(
    OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
    OPERATOR_TRUST_ACKNOWLEDGEMENT,
  );
  assert.notEqual(
    OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
    TESTNET_LIVE_ACKNOWLEDGEMENT,
  );
  assert.notEqual(
    OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE,
    OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
  );

  assert.throws(() => selectOperatorTrustedTestnetPolicy(
    OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE,
    OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
    TESTNET_LIVE_ACKNOWLEDGEMENT,
  ));
  assert.throws(() => selectOperatorTrustedTestnetPolicy(
    OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
    OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
    TESTNET_LIVE_ACKNOWLEDGEMENT,
  ));

  const publicPolicy = selectOperatorTrustedTestnetPolicy(
    OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
    OPERATOR_TRUST_ACKNOWLEDGEMENT,
    TESTNET_LIVE_ACKNOWLEDGEMENT,
  );
  const devnetArtifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  assert.equal(isOperatorTrustedTestnetPolicy(publicPolicy), true);
  assert.equal(isOperatorTrustedTestnetPolicy(devnetArtifact), false);
});

test('artifact parser rejects noncanonical, duplicate, missing, extra, and oversized input', () => {
  const value = artifactValue();
  const canonical = artifactText(value);
  const reordered = JSON.stringify(value);

  for (const text of [
    canonical.slice(0, -1),
    `${canonical}\n`,
    `${canonical.slice(0, -1)}\r\n`,
    ` ${canonical}`,
    `${reordered}\n`,
    '{"artifactVersion":1,"artifactVersion":1}\n',
    '{"artifactVersion":1,"\\u0061rtifactVersion":1}\n',
    `${' '.repeat(16 * 1024)}${canonical}`,
  ]) {
    assertFixedFailure(() => parseOperatorTrustedLocalDevnetProfileArtifact(text));
  }

  for (const mutate of [
    candidate => { delete candidate.lane; },
    candidate => { candidate.unexpected = false; },
    candidate => { candidate.chainProfile.unexpected = false; },
    candidate => { candidate.provenance.generator.unexpected = false; },
    candidate => { candidate.provenance.nodeRuntime.unexpected = false; },
    candidate => { candidate.nonClaims.unexpected = false; },
  ]) {
    const candidate = artifactValue();
    mutate(candidate);
    assertFixedFailure(() => parseOperatorTrustedLocalDevnetProfileArtifact(artifactText(candidate)));
  }
});

test('artifact parser rejects public-testnet substitution and mutable or incomplete provenance', () => {
  const mutations = [
    candidate => { candidate.artifactVersion = 2; },
    candidate => { candidate.lane = OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME; },
    candidate => { candidate.acknowledgement = OPERATOR_TRUST_ACKNOWLEDGEMENT; },
    candidate => { candidate.acknowledgement = TESTNET_LIVE_ACKNOWLEDGEMENT; },
    candidate => { candidate.chainProfile.chainIdentifier = '3'; },
    candidate => { candidate.chainProfile.chainIdentifier = '069'; },
    candidate => { candidate.chainProfile.chainIdentifier = 69; },
    candidate => { candidate.chainProfile.genesisMomentumHash = syntheticHash('A'); },
    candidate => { candidate.heightTwo.chainIdentifier = 3; },
    candidate => { candidate.heightTwo.previousHash = syntheticHash('f'); },
    candidate => { candidate.heightTwo.hash = candidate.heightTwo.previousHash; },
    candidate => { candidate.provenance.generator.repository = 'another/tool'; },
    candidate => { candidate.provenance.generator.revision = 'latest'; },
    candidate => { delete candidate.provenance.generator.revision; },
    candidate => { candidate.provenance.nodeRuntime.sourceRevision = 'latest'; },
    candidate => { candidate.provenance.nodeRuntime.containerImageDigest = 'latest'; },
    candidate => { candidate.provenance.nodeRuntime.containerImageDigest = syntheticHash('e'); },
    candidate => { candidate.provenance.nodeRuntime.imageTag = 'latest'; },
    candidate => { delete candidate.nonClaims.issue45Complete; },
  ];

  for (const mutate of mutations) {
    const candidate = artifactValue();
    mutate(candidate);
    assertFixedFailure(() => parseOperatorTrustedLocalDevnetProfileArtifact(artifactText(candidate)));
  }

  for (const key of Object.keys(OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_NON_CLAIMS)) {
    const candidate = artifactValue();
    candidate.nonClaims[key] = true;
    assertFixedFailure(() => parseOperatorTrustedLocalDevnetProfileArtifact(artifactText(candidate)));
  }
});

test('dedicated observation check cross-binds chain identifier, genesis, and height two', () => {
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  const evidence = validateOperatorTrustedLocalDevnetObservation(
    artifact,
    matchingObservation(),
  );

  assert.equal(isOperatorTrustedLocalDevnetEvidence(evidence), true);
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(Object.isFrozen(evidence.chainProfile), true);
  assert.equal(Object.isFrozen(evidence.provenance), true);
  assert.equal(evidence.lane, OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE);
  assert.equal(evidence.trustMode, 'operator-trusted-self-created-local-devnet-observation');
  assert.equal(evidence.remoteChainAuthenticated, false);
  assert.equal(evidence.publicTestnetEvidence, false);
  assert.equal(evidence.reproducibility, 'equivalent-behavior-only');
  assert.equal(evidence.observationHeight, 2);
  assert.deepEqual(evidence.chainProfile, artifact.chainProfile);
  assert.deepEqual(evidence.heightTwo, artifact.heightTwo);
  assert.notEqual(evidence.heightTwo, artifact.heightTwo);
  assert.equal(Object.isFrozen(evidence.heightTwo), true);
  assert.deepEqual(evidence.provenance, artifact.provenance);
  assert.deepEqual(evidence.nonClaims, OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_NON_CLAIMS);
});

test('returned evidence preserves and distinguishes the exact height-two identity', () => {
  const firstArtifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  const secondValue = artifactValue();
  secondValue.heightTwo.hash = syntheticHash('f');
  const secondArtifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText(secondValue));
  const firstObservation = matchingObservation();
  const secondObservation = matchingObservation();
  secondObservation.heightTwoMomentum.hash = syntheticHash('f');

  const firstEvidence = validateOperatorTrustedLocalDevnetObservation(
    firstArtifact,
    firstObservation,
  );
  const secondEvidence = validateOperatorTrustedLocalDevnetObservation(
    secondArtifact,
    secondObservation,
  );

  assert.deepEqual(firstEvidence.heightTwo, firstArtifact.heightTwo);
  assert.deepEqual(secondEvidence.heightTwo, secondArtifact.heightTwo);
  assert.notDeepEqual(firstEvidence.heightTwo, secondEvidence.heightTwo);
});

test('dedicated observation check rejects every chain and height-two mismatch', () => {
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  const mutations = [
    candidate => { candidate.reportedMomentumCount = 1; },
    candidate => { candidate.reportedMomentumCount = 7; },
    candidate => { candidate.frontierMomentum.chainIdentifier = 3; },
    candidate => { candidate.frontierMomentum.height = 1; },
    candidate => { candidate.heightTwoMomentum.version = 2; },
    candidate => { candidate.heightTwoMomentum.chainIdentifier = 3; },
    candidate => { candidate.heightTwoMomentum.height = 3; },
    candidate => { candidate.heightTwoMomentum.hash = syntheticHash('f'); },
    candidate => { candidate.heightTwoMomentum.previousHash = syntheticHash('f'); },
    candidate => { candidate.heightTwoMomentum.hash = candidate.heightTwoMomentum.previousHash; },
  ];

  for (const mutate of mutations) {
    const candidate = matchingObservation();
    mutate(candidate);
    assertFixedFailure(() => validateOperatorTrustedLocalDevnetObservation(artifact, candidate));
  }

  assertFixedFailure(() => validateOperatorTrustedLocalDevnetObservation(
    artifactValue(),
    matchingObservation(),
  ));
});

test('observation checking is descriptor-safe and executes no hostile hooks', () => {
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  let getterReads = 0;
  const accessorObservation = matchingObservation();
  Object.defineProperty(accessorObservation.frontierMomentum, 'height', {
    enumerable: true,
    get() {
      getterReads += 1;
      return 8;
    },
  });
  assertFixedFailure(() => validateOperatorTrustedLocalDevnetObservation(
    artifact,
    accessorObservation,
  ));
  assert.equal(getterReads, 0);

  const symbolObservation = matchingObservation();
  symbolObservation[Symbol('hidden')] = true;
  assertFixedFailure(() => validateOperatorTrustedLocalDevnetObservation(
    artifact,
    symbolObservation,
  ));

  const customPrototype = Object.create({ inherited: true });
  Object.assign(customPrototype, matchingObservation());
  assertFixedFailure(() => validateOperatorTrustedLocalDevnetObservation(
    artifact,
    customPrototype,
  ));

  const transparentProxy = new Proxy(matchingObservation(), {});
  assertFixedFailure(() => validateOperatorTrustedLocalDevnetObservation(
    artifact,
    transparentProxy,
  ));

  const revocable = Proxy.revocable(matchingObservation(), {});
  revocable.revoke();
  assertFixedFailure(() => validateOperatorTrustedLocalDevnetObservation(
    artifact,
    revocable.proxy,
  ));

  const oversizedObservation = matchingObservation();
  oversizedObservation.extra = {};
  let cursor = oversizedObservation.extra;
  for (let index = 0; index < 8; index += 1) {
    cursor.next = {};
    cursor = cursor.next;
  }
  assertFixedFailure(() => validateOperatorTrustedLocalDevnetObservation(
    artifact,
    oversizedObservation,
  ));
});

test('artifact schema excludes private material and live-evidence public-testnet paths remain unchanged', () => {
  for (const forbiddenKey of [
    'rpcEndpoint',
    'wallet',
    'credentials',
    'operatorPassword',
    'nodePrivateKey',
    'filesystemPath',
    'transactionIdentifier',
    'signature',
  ]) {
    const candidate = artifactValue();
    candidate[forbiddenKey] = 'forbidden';
    assertFixedFailure(() => parseOperatorTrustedLocalDevnetProfileArtifact(artifactText(candidate)));
  }

  for (const relativePath of [
    '../src/live-evidence-runner.js',
    '../src/live-evidence-facilitator-worker.js',
    '../src/zenon/operator-trusted-testnet-profile.js',
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /operator-trusted-local-devnet-profile/);
  }
});

test('artifact parsing and observation validation do not consume caller-owned objects', () => {
  const source = artifactValue();
  const text = artifactText(source);
  source.chainProfile.chainIdentifier = '70';
  source.provenance.nodeRuntime.sourceRepository = 'changed/example';

  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(text);
  assert.equal(artifact.chainProfile.chainIdentifier, '69');
  assert.equal(artifact.provenance.nodeRuntime.sourceRepository, 'zenon-network/go-zenon');

  const observation = matchingObservation();
  const evidence = validateOperatorTrustedLocalDevnetObservation(artifact, observation);
  observation.frontierMomentum.height = 2;
  assert.equal(evidence.observationHeight, 2);
  assert.deepEqual(evidence.chainProfile, artifact.chainProfile);
});

test('post-import intrinsic replacement cannot bypass artifact or observation validation', () => {
  const canonical = artifactText();
  const noncanonical = canonical.slice(0, -1);
  const unbranded = artifactValue();
  const originalNumber = Number;
  let hostileCalls = 0;
  let parsed;
  let noncanonicalError;
  let unbrandedError;

  function hostileIntrinsic() {
    hostileCalls += 1;
    throw new Error('hostile intrinsic invoked');
  }

  withReplacedProperties([
    [Reflect, 'apply', hostileIntrinsic],
    [Array, 'isArray', hostileIntrinsic],
    [Array.prototype, 'sort', hostileIntrinsic],
    [RegExp.prototype, 'test', hostileIntrinsic],
    [RegExp.prototype, 'exec', hostileIntrinsic],
    [Set.prototype, 'add', hostileIntrinsic],
    [Set.prototype, 'has', hostileIntrinsic],
    [WeakSet.prototype, 'add', hostileIntrinsic],
    [WeakSet.prototype, 'delete', hostileIntrinsic],
    [WeakSet.prototype, 'has', hostileIntrinsic],
    [String.prototype, 'charCodeAt', hostileIntrinsic],
    [String.prototype, 'endsWith', hostileIntrinsic],
    [String.prototype, 'includes', hostileIntrinsic],
    [String.prototype, 'slice', hostileIntrinsic],
    [String.prototype, 'startsWith', hostileIntrinsic],
    [originalNumber, 'isFinite', hostileIntrinsic],
    [originalNumber, 'isSafeInteger', hostileIntrinsic],
    [globalThis, 'Number', hostileIntrinsic],
  ], () => {
    parsed = parseOperatorTrustedLocalDevnetProfileArtifact(canonical);
    try {
      parseOperatorTrustedLocalDevnetProfileArtifact(noncanonical);
    } catch (error) {
      noncanonicalError = error;
    }
    try {
      validateOperatorTrustedLocalDevnetObservation(unbranded, matchingObservation());
    } catch (error) {
      unbrandedError = error;
    }
  });

  assert.equal(hostileCalls, 0);
  assert.equal(isOperatorTrustedLocalDevnetProfileArtifact(parsed), true);
  assertFixedError(noncanonicalError);
  assertFixedError(unbrandedError);
});

test('four-node naming is an unverified external-workflow label in code and documentation', () => {
  assert.equal(
    OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_NON_CLAIMS.fourNodeTopologyVerified,
    false,
  );
  const requiredBoundary =
    '"Four-node" names the intended external operator workflow only; the artifact does not verify node count, roles, topology, or a topology digest.';
  for (const relativePath of [
    '../README.md',
    '../SECURITY.md',
    '../docs/IMPLEMENTATION_PLAN.md',
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.equal(source.includes(requiredBoundary), true);
    assert.equal(
      source.includes('offline-tested, runtime-unregistered readiness plumbing'),
      true,
    );
    assert.equal(source.includes('injected node reads'), true);
    assert.equal(source.includes('not claimed to be detached or frozen'), true);
    assert.equal(
      source.includes('direct `assertZenonNodeReady` is the only payment-readiness integration'),
      true,
    );
    assert.equal(
      source.includes(
        'cannot undo thenable assimilation or other behavior already performed inside an injected SDK method before that method returns a genuine native Promise',
      ),
      true,
    );
    assert.equal(
      source.includes('Ordinary valid public-testnet selection and payment semantics remain unchanged'),
      true,
    );
    assert.equal(source.includes('non-enumerable readiness-result assimilation shield'), true);
    assert.equal(source.includes('seed-plus-four-pillar/five-service'), true);
    assert.equal(source.includes('fourNodeTopologyVerified'), true);
    assert.equal(source.includes('Issue #45'), true);
  }
});

test('local artifact creates only a genuine immutable local policy and the dispatcher is closed', async () => {
  const localModule = await import('../src/zenon/operator-trusted-local-devnet-profile.js');
  const publicModule = await import('../src/zenon/operator-trusted-testnet-profile.js');
  const dispatcher = await import('../src/zenon/operator-trusted-chain-policy.js');
  assert.equal(typeof localModule.createOperatorTrustedLocalDevnetPolicy, 'function');
  assert.equal(typeof localModule.isOperatorTrustedLocalDevnetPolicy, 'function');
  assert.equal(typeof dispatcher.assertOperatorTrustedChainEvidence, 'function');
  assert.equal(typeof dispatcher.assertOperatorTrustedChainPolicy, 'function');
  assert.equal(typeof dispatcher.observeOperatorTrustedChainPolicy, 'function');
  assert.equal(Object.hasOwn(dispatcher, 'isOperatorTrustedChainEvidence'), false);

  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  const policy = localModule.createOperatorTrustedLocalDevnetPolicy(artifact);
  assert.equal(localModule.isOperatorTrustedLocalDevnetPolicy(policy), true);
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.chainProfile), true);
  assert.deepEqual(policy.chainProfile, artifact.chainProfile);
  assert.notEqual(policy.chainProfile, artifact.chainProfile);
  assert.equal(policy.remoteChainAuthenticated, false);
  assert.equal(policy.fourNodeTopologyVerified, false);
  assert.equal(
    dispatcher.assertOperatorTrustedChainPolicy(policy, artifact.chainProfile),
    policy,
  );

  const publicPolicy = selectOperatorTrustedTestnetPolicy(
    OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
    OPERATOR_TRUST_ACKNOWLEDGEMENT,
    TESTNET_LIVE_ACKNOWLEDGEMENT,
  );
  assert.equal(
    dispatcher.assertOperatorTrustedChainPolicy(publicPolicy, publicPolicy.chainProfile()),
    publicPolicy,
  );
  assert.throws(() => dispatcher.assertOperatorTrustedChainPolicy(
    publicPolicy,
    artifact.chainProfile,
  ));
  assert.throws(() => dispatcher.assertOperatorTrustedChainPolicy(
    policy,
    publicPolicy.chainProfile(),
  ));
  let policyGetterReads = 0;
  const accessorPolicy = {};
  Object.defineProperty(accessorPolicy, 'chainProfile', {
    enumerable: true,
    get() {
      policyGetterReads += 1;
      return artifact.chainProfile;
    },
  });
  assert.throws(() => dispatcher.assertOperatorTrustedChainPolicy(
    accessorPolicy,
    artifact.chainProfile,
  ));
  assert.equal(policyGetterReads, 0);
  for (const candidate of [
    { ...policy },
    Object.create(policy),
    new Proxy(policy, {}),
    artifact,
    publicPolicy,
  ]) {
    if (candidate === publicPolicy) {
      await assert.rejects(
        localModule.observeOperatorTrustedLocalDevnetPolicy(candidate, {}),
        OperatorTrustedLocalDevnetError,
      );
    } else {
      assert.equal(localModule.isOperatorTrustedLocalDevnetPolicy(candidate), false);
    }
  }
  assert.throws(
    () => localModule.createOperatorTrustedLocalDevnetPolicy(artifactValue()),
    OperatorTrustedLocalDevnetError,
  );
  await assert.rejects(
    publicModule.observeOperatorTrustedTestnetPolicy(policy, {}),
  );
  await assert.rejects(
    dispatcher.observeOperatorTrustedChainPolicy({ ...policy }, {}),
  );
});

test('local policy observes actual SDK shapes exactly once and returns independent branded evidence', async () => {
  const localModule = await import('../src/zenon/operator-trusted-local-devnet-profile.js');
  const dispatcher = await import('../src/zenon/operator-trusted-chain-policy.js');
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  const policy = localModule.createOperatorTrustedLocalDevnetPolicy(artifact);
  const first = localSdkContext();
  const second = localSdkContext();

  const [firstEvidence, secondEvidence] = await Promise.all([
    dispatcher.observeOperatorTrustedChainPolicy(policy, first.context),
    dispatcher.observeOperatorTrustedChainPolicy(policy, second.context),
  ]);

  assert.deepEqual(first.calls, [[2, 1]]);
  assert.deepEqual(second.calls, [[2, 1]]);
  assert.notEqual(firstEvidence, secondEvidence);
  assert.equal(isOperatorTrustedLocalDevnetEvidence(firstEvidence), true);
  assert.equal(isOperatorTrustedLocalDevnetEvidence(secondEvidence), true);
  assert.equal(Object.isFrozen(firstEvidence), true);
  assert.equal(Object.isFrozen(firstEvidence.chainProfile), true);
  assert.equal(Object.isFrozen(firstEvidence.heightTwo), true);
  assert.equal(firstEvidence.remoteChainAuthenticated, false);
  assert.equal(firstEvidence.nonClaims.fourNodeTopologyVerified, false);
  assert.equal(Object.hasOwn(firstEvidence, 'authenticatedProfile'), false);
  assert.equal(
    dispatcher.assertOperatorTrustedChainEvidence(policy, firstEvidence),
    firstEvidence,
  );
  const distinctPolicy = localModule.createOperatorTrustedLocalDevnetPolicy(artifact);
  assert.throws(() => dispatcher.assertOperatorTrustedChainEvidence(
    distinctPolicy,
    firstEvidence,
  ));
});

test('local SDK observation adapter contains hooks and detects mutation across the query', async () => {
  const localModule = await import('../src/zenon/operator-trusted-local-devnet-profile.js');
  const dispatcher = await import('../src/zenon/operator-trusted-chain-policy.js');
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  const policy = localModule.createOperatorTrustedLocalDevnetPolicy(artifact);
  let hookCalls = 0;
  const hooked = localSdkContext();
  Object.defineProperties(hooked.context.frontierMomentum.hash, {
    toString: {
      value() {
        hookCalls += 1;
        throw new Error('hook must not execute');
      },
      enumerable: true,
    },
    valueOf: {
      value() {
        hookCalls += 1;
        throw new Error('hook must not execute');
      },
      enumerable: true,
    },
  });
  await assert.rejects(dispatcher.observeOperatorTrustedChainPolicy(policy, hooked.context));
  assert.equal(hookCalls, 0);
  assert.deepEqual(hooked.calls, []);

  const mutation = localSdkContext({
    query({ frontierMomentum, heightTwoMomentum }) {
      frontierMomentum.height = 9;
      return new sdk.MomentumList(9, [heightTwoMomentum]);
    },
  });
  await assert.rejects(dispatcher.observeOperatorTrustedChainPolicy(policy, mutation.context));
  assert.deepEqual(mutation.calls, [[2, 1]]);

  let getterReads = 0;
  const accessor = localSdkContext();
  Object.defineProperty(accessor.context.frontierMomentum, 'height', {
    enumerable: true,
    get() {
      getterReads += 1;
      return 8;
    },
  });
  await assert.rejects(dispatcher.observeOperatorTrustedChainPolicy(policy, accessor.context));
  assert.equal(getterReads, 0);
  assert.deepEqual(accessor.calls, []);

  const proxied = localSdkContext();
  proxied.context.frontierMomentum = new Proxy(proxied.context.frontierMomentum, {});
  await assert.rejects(dispatcher.observeOperatorTrustedChainPolicy(policy, proxied.context));
  assert.deepEqual(proxied.calls, []);
});

test('local SDK query method proxy is rejected before invocation', async () => {
  const localModule = await import('../src/zenon/operator-trusted-local-devnet-profile.js');
  const dispatcher = await import('../src/zenon/operator-trusted-chain-policy.js');
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  const policy = localModule.createOperatorTrustedLocalDevnetPolicy(artifact);
  const candidate = localSdkContext();
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

  await assert.rejects(
    dispatcher.observeOperatorTrustedChainPolicy(policy, candidate.context),
  );
  assert.equal(applyTrapCalls, 0);
  assert.equal(queryCalls, 0);
  assert.equal(resultHookCalls, 0);
});

test('local raw observation rejects proxy and own then accessors without invoking hooks', async () => {
  const localModule = await import('../src/zenon/operator-trusted-local-devnet-profile.js');
  const dispatcher = await import('../src/zenon/operator-trusted-chain-policy.js');
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  const policy = localModule.createOperatorTrustedLocalDevnetPolicy(artifact);

  const proxied = localSdkContext();
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
  await assert.rejects(
    dispatcher.observeOperatorTrustedChainPolicy(policy, proxied.context),
  );

  const accessor = localSdkContext();
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
  await assert.rejects(
    dispatcher.observeOperatorTrustedChainPolicy(policy, accessor.context),
  );

  assert.equal(resultProxyTrapCalls, 0);
  assert.equal(thenGetterCalls, 0);
  assert.deepEqual(proxied.calls, [[2, 1]]);
  assert.deepEqual(accessor.calls, [[2, 1]]);
});

test('local observation supports genuine native Promise and synchronous SDK results', {
  concurrency: false,
}, async () => {
  const localModule = await import('../src/zenon/operator-trusted-local-devnet-profile.js');
  const dispatcher = await import('../src/zenon/operator-trusted-chain-policy.js');
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  const policy = localModule.createOperatorTrustedLocalDevnetPolicy(artifact);
  const promised = localSdkContext();
  const promisedObservation = await promised.context.zenon.ledger.getMomentumsByHeight(2, 1);
  const nativePromise = Promise.resolve(promisedObservation);
  await nativePromise;
  promised.calls.length = 0;
  promised.context.zenon.ledger.getMomentumsByHeight = function getMomentumsByHeight(...args) {
    promised.calls.push(args);
    return nativePromise;
  };
  const synchronous = localSdkContext();
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

  assert.equal(synchronousRejected, false, 'synchronous local observation must succeed');
  assert.equal(promisedRejected, false, 'native-Promise local observation must succeed');
  assert.equal(hostileThenCalls, 0);
  assert.equal(isOperatorTrustedLocalDevnetEvidence(promisedEvidence), true);
  assert.equal(isOperatorTrustedLocalDevnetEvidence(synchronousEvidence), true);
  assert.deepEqual(promised.calls, [[2, 1]]);
  assert.deepEqual(synchronous.calls, [[2, 1]]);
});

test('local evidence, dispatcher, and readiness returns resist inherited then assimilation', {
  concurrency: false,
}, async () => {
  const localModule = await import('../src/zenon/operator-trusted-local-devnet-profile.js');
  const dispatcher = await import('../src/zenon/operator-trusted-chain-policy.js');
  const { assertZenonNodeReady } = await import('../src/zenon-payment.js');
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  const policy = localModule.createOperatorTrustedLocalDevnetPolicy(artifact);
  const direct = await settledLocalSdkContext();
  const dispatched = await settledLocalSdkContext();
  const readiness = await addSettledReadinessReads(await settledLocalSdkContext());
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

    directEvidence = await localModule.observeOperatorTrustedLocalDevnetPolicy(
      policy,
      direct.context,
    );
    dispatchedEvidence = await dispatcher.observeOperatorTrustedChainPolicy(
      policy,
      dispatched.context,
    );
    readinessResult = await assertZenonNodeReady(
      readiness.context.zenon,
      sdk,
      undefined,
      artifact.chainProfile,
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
  assert.equal(isOperatorTrustedLocalDevnetEvidence(directEvidence), true);
  assert.equal(isOperatorTrustedLocalDevnetEvidence(dispatchedEvidence), true);
  assert.equal(isOperatorTrustedLocalDevnetEvidence(readinessResult.chainTrustEvidence), true);
  assertAsyncReturnShield(directEvidence);
  assertAsyncReturnShield(dispatchedEvidence);
  assertAsyncReturnShield(readinessResult);
  assert.deepEqual(direct.calls, [[2, 1]]);
  assert.deepEqual(dispatched.calls, [[2, 1]]);
  assert.deepEqual(readiness.calls, [[2, 1]]);
});

test('direct readiness requires the current dispatcher observation and exact evidence family', async () => {
  const localModule = await import('../src/zenon/operator-trusted-local-devnet-profile.js');
  const dispatcher = await import('../src/zenon/operator-trusted-chain-policy.js');
  const { assertZenonNodeReady } = await import('../src/zenon-payment.js');
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  const localPolicy = localModule.createOperatorTrustedLocalDevnetPolicy(artifact);
  const publicPolicy = selectOperatorTrustedTestnetPolicy(
    OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
    OPERATOR_TRUST_ACKNOWLEDGEMENT,
    TESTNET_LIVE_ACKNOWLEDGEMENT,
  );
  const localObservation = localSdkContext();
  const publicObservation = publicSdkContext();
  const localEvidence = await dispatcher.observeOperatorTrustedChainPolicy(
    localPolicy,
    localObservation.context,
  );
  const publicEvidence = await dispatcher.observeOperatorTrustedChainPolicy(
    publicPolicy,
    publicObservation.context,
  );
  const localLookalike = Object.freeze({
    chainProfile: Object.freeze({ ...artifact.chainProfile }),
    remoteChainAuthenticated: false,
  });
  const publicLookalike = Object.freeze({
    chainProfile: Object.freeze({ ...OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE }),
    remoteChainAuthenticated: false,
  });
  const cases = [
    {
      candidate: localSdkContext(),
      evidence: localLookalike,
      expectedChainProfile: artifact.chainProfile,
      policy: localPolicy,
    },
    {
      candidate: publicSdkContext(),
      evidence: publicLookalike,
      expectedChainProfile: OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
      policy: publicPolicy,
    },
    {
      candidate: localSdkContext(),
      evidence: publicEvidence,
      expectedChainProfile: artifact.chainProfile,
      policy: localPolicy,
    },
    {
      candidate: publicSdkContext(),
      evidence: localEvidence,
      expectedChainProfile: OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
      policy: publicPolicy,
    },
    {
      candidate: localSdkContext(),
      evidence: localEvidence,
      expectedChainProfile: artifact.chainProfile,
      policy: localPolicy,
    },
    {
      candidate: publicSdkContext(),
      evidence: publicEvidence,
      expectedChainProfile: OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
      policy: publicPolicy,
    },
  ];

  for (const candidate of cases) {
    await assert.rejects(runReadinessWithInjectedEvidence({
      assertZenonNodeReady,
      ...candidate,
    }));
    assert.deepEqual(candidate.candidate.calls, []);
  }
  assert.deepEqual(localObservation.calls, [[2, 1]]);
  assert.deepEqual(publicObservation.calls, [[2, 1]]);
});

test('direct readiness rejects injected proxy and accessor evidence without invoking hooks', async () => {
  const localModule = await import('../src/zenon/operator-trusted-local-devnet-profile.js');
  const { assertZenonNodeReady } = await import('../src/zenon-payment.js');
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  const policy = localModule.createOperatorTrustedLocalDevnetPolicy(artifact);
  const target = {
    chainProfile: { ...artifact.chainProfile },
    remoteChainAuthenticated: false,
  };
  let proxyHooks = 0;
  const proxied = new Proxy(target, {
    get(value, key, receiver) {
      proxyHooks += 1;
      return Reflect.get(value, key, receiver);
    },
    getOwnPropertyDescriptor(value, key) {
      proxyHooks += 1;
      return Reflect.getOwnPropertyDescriptor(value, key);
    },
    getPrototypeOf(value) {
      proxyHooks += 1;
      return Reflect.getPrototypeOf(value);
    },
    ownKeys(value) {
      proxyHooks += 1;
      return Reflect.ownKeys(value);
    },
  });
  const accessor = Object.create(null);
  let accessorHooks = 0;
  const countAccessor = value => ({
    configurable: true,
    get() {
      accessorHooks += 1;
      return value;
    },
  });
  Object.defineProperties(accessor, {
    chainProfile: countAccessor({ ...artifact.chainProfile }),
    remoteChainAuthenticated: countAccessor(false),
    then: countAccessor(undefined),
    toString: countAccessor(() => ''),
    valueOf: countAccessor(() => accessor),
    [Symbol.iterator]: countAccessor(() => ({ next: () => ({ done: true }) })),
  });

  for (const evidence of [proxied, accessor]) {
    const candidate = localSdkContext();
    await assert.rejects(runReadinessWithInjectedEvidence({
      assertZenonNodeReady,
      candidate,
      evidence,
      expectedChainProfile: artifact.chainProfile,
      policy,
    }));
    assert.deepEqual(candidate.calls, []);
  }
  assert.equal(proxyHooks, 0);
  assert.equal(accessorHooks, 0);
});

test('direct readiness keeps fresh genuine public and local evidence family-correct', async () => {
  const localModule = await import('../src/zenon/operator-trusted-local-devnet-profile.js');
  const { assertZenonNodeReady } = await import('../src/zenon-payment.js');
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  const localPolicy = localModule.createOperatorTrustedLocalDevnetPolicy(artifact);
  const publicPolicy = selectOperatorTrustedTestnetPolicy(
    OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
    OPERATOR_TRUST_ACKNOWLEDGEMENT,
    TESTNET_LIVE_ACKNOWLEDGEMENT,
  );
  const localCandidates = [localSdkContext(), localSdkContext()];
  const publicCandidates = [publicSdkContext(), publicSdkContext()];
  const [localFirst, localSecond, publicFirst, publicSecond] = await Promise.all([
    ...localCandidates.map(candidate => runReadinessNormally({
      assertZenonNodeReady,
      candidate,
      expectedChainProfile: artifact.chainProfile,
      policy: localPolicy,
    })),
    ...publicCandidates.map(candidate => runReadinessNormally({
      assertZenonNodeReady,
      candidate,
      expectedChainProfile: OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
      policy: publicPolicy,
    })),
  ]);

  assert.equal(isOperatorTrustedLocalDevnetEvidence(localFirst.chainTrustEvidence), true);
  assert.equal(isOperatorTrustedLocalDevnetEvidence(localSecond.chainTrustEvidence), true);
  assert.equal(isOperatorTrustedTestnetEvidence(publicFirst.chainTrustEvidence), true);
  assert.equal(isOperatorTrustedTestnetEvidence(publicSecond.chainTrustEvidence), true);
  assert.notEqual(localFirst.chainTrustEvidence, localSecond.chainTrustEvidence);
  assert.notEqual(publicFirst.chainTrustEvidence, publicSecond.chainTrustEvidence);
  for (const candidate of [...localCandidates, ...publicCandidates]) {
    assert.deepEqual(candidate.calls, [[2, 1]]);
  }
});

test('local SDK observation adapter rejects malformed and unavailable query results', async () => {
  const localModule = await import('../src/zenon/operator-trusted-local-devnet-profile.js');
  const dispatcher = await import('../src/zenon/operator-trusted-chain-policy.js');
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  const policy = localModule.createOperatorTrustedLocalDevnetPolicy(artifact);
  let iteratorCalls = 0;
  const cases = [
    () => null,
    ({ heightTwoMomentum }) => ({ count: 8, list: [heightTwoMomentum], extra: true }),
    ({ heightTwoMomentum }) => ({ count: 7, list: [heightTwoMomentum] }),
    ({ heightTwoMomentum }) => ({ count: 8.5, list: [heightTwoMomentum] }),
    ({ heightTwoMomentum }) => ({ count: 8, list: [heightTwoMomentum, heightTwoMomentum] }),
    ({ heightTwoMomentum }) => {
      heightTwoMomentum.hash = new sdk.Hash(Buffer.alloc(31));
      return new sdk.MomentumList(8, [heightTwoMomentum]);
    },
    ({ heightTwoMomentum }) => {
      const list = [heightTwoMomentum];
      Object.defineProperty(list, Symbol.iterator, {
        value() {
          iteratorCalls += 1;
          throw new Error('iterator must not execute');
        },
      });
      return { count: 8, list };
    },
  ];

  for (const query of cases) {
    const candidate = localSdkContext({ query });
    await assert.rejects(dispatcher.observeOperatorTrustedChainPolicy(
      policy,
      candidate.context,
    ));
    assert.deepEqual(candidate.calls, [[2, 1]]);
  }
  const unavailable = localSdkContext({
    query() {
      throw new Error('unavailable');
    },
  });
  await assert.rejects(dispatcher.observeOperatorTrustedChainPolicy(
    policy,
    unavailable.context,
  ));
  assert.deepEqual(unavailable.calls, [[2, 1]]);
  assert.equal(iteratorCalls, 0);
});

test('local policy and closed dispatcher resist post-import intrinsic replacement', async () => {
  const localModule = await import('../src/zenon/operator-trusted-local-devnet-profile.js');
  const dispatcher = await import('../src/zenon/operator-trusted-chain-policy.js');
  const artifact = parseOperatorTrustedLocalDevnetProfileArtifact(artifactText());
  const candidate = localSdkContext();
  let hostileCalls = 0;
  function hostileIntrinsic() {
    hostileCalls += 1;
    throw new Error('hostile intrinsic invoked');
  }

  const result = await withReplacedPropertiesAsync([
    [Reflect, 'apply', hostileIntrinsic],
    [Reflect, 'ownKeys', hostileIntrinsic],
    [Array, 'isArray', hostileIntrinsic],
    [Array.prototype, 'sort', hostileIntrinsic],
    [Buffer, 'isBuffer', hostileIntrinsic],
    [Buffer.prototype, 'toString', hostileIntrinsic],
    [Number, 'isSafeInteger', hostileIntrinsic],
    [Object, 'create', hostileIntrinsic],
    [Object, 'defineProperty', hostileIntrinsic],
    [Object, 'freeze', hostileIntrinsic],
    [Object, 'getOwnPropertyDescriptor', hostileIntrinsic],
    [Object, 'getPrototypeOf', hostileIntrinsic],
    [Object, 'hasOwn', hostileIntrinsic],
    [Object, 'keys', hostileIntrinsic],
    [WeakMap.prototype, 'get', hostileIntrinsic],
    [WeakMap.prototype, 'set', hostileIntrinsic],
    [WeakSet.prototype, 'add', hostileIntrinsic],
    [WeakSet.prototype, 'has', hostileIntrinsic],
    [utilTypes, 'isPromise', hostileIntrinsic],
    [utilTypes, 'isProxy', hostileIntrinsic],
  ], async () => {
    const policy = localModule.createOperatorTrustedLocalDevnetPolicy(artifact);
    dispatcher.assertOperatorTrustedChainPolicy(policy, artifact.chainProfile);
    const evidence = await dispatcher.observeOperatorTrustedChainPolicy(
      policy,
      candidate.context,
    );
    dispatcher.assertOperatorTrustedChainEvidence(policy, evidence);
    return { policy, evidence };
  });

  assert.equal(hostileCalls, 0);
  assert.equal(localModule.isOperatorTrustedLocalDevnetPolicy(result.policy), true);
  assert.equal(isOperatorTrustedLocalDevnetEvidence(result.evidence), true);
  assert.deepEqual(candidate.calls, [[2, 1]]);
});

test('bridge import and construction are offline, ordinary selection is closed, and owned evidence remains public-only', async () => {
  const dispatcherSource = readFileSync(
    new URL('../src/zenon/operator-trusted-chain-policy.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(dispatcherSource, /node:fs|process\.env|initialize\(|setNetworkID|setChainID/);
  for (const relativePath of [
    '../src/live-evidence-runner.js',
    '../src/live-evidence-facilitator-worker.js',
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /operator-trusted-local-devnet-profile/);
    assert.doesNotMatch(source, /operator-trusted-chain-policy/);
  }
  for (const relativePath of ['../src/buyer-cli.js', '../src/server-cli.js']) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.match(source, /operator-trusted-execution-policy-selector/);
    assert.doesNotMatch(source, /operator-trusted-local-devnet-profile/);
    assert.doesNotMatch(source, /operator-trusted-chain-policy/);
  }
  const paymentSource = readFileSync(
    new URL('../src/zenon-payment.js', import.meta.url),
    'utf8',
  );
  assert.match(paymentSource, /operator-trusted-chain-policy/);
  assert.match(paymentSource, /operator-trusted-local-devnet-profile/);
  assert.match(
    paymentSource,
    /async function withOwnedZenonSession\([\s\S]*?isOperatorTrustedTestnetPolicy\(operatorTrustedChainPolicy\)/,
  );
});
