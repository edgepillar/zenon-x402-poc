import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canonicalJson } from '../src/canonical.js';
import {
  OPERATOR_TRUST_ACKNOWLEDGEMENT,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
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

test('artifact schema excludes private material and ordinary public-testnet paths remain unchanged', () => {
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
    '../src/buyer-cli.js',
    '../src/server-cli.js',
    '../src/live-evidence-runner.js',
    '../src/zenon-payment.js',
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
  }
});
