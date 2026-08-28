const LOWERCASE_HASH = /^[0-9a-f]{64}$/;

export const OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME =
  'historical-testnet-wiki-height-2-2021-12-17-v1';

export const OPERATOR_TRUST_ACKNOWLEDGEMENT =
  'I_UNDERSTAND_THIS_ANCHOR_DOES_NOT_AUTHENTICATE_THE_CONNECTED_NODE';

export const TESTNET_LIVE_ACKNOWLEDGEMENT = 'I_UNDERSTAND_TESTNET_ONLY';

export const OPERATOR_TRUSTED_PUBLIC_TESTNET_WARNING =
  'Warning: this historical public-testnet anchor is operator trusted; remote chain identity is not authenticated.';

export const OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '3',
  genesisMomentumHash: '761f482683e6d0ed1f92af1140418b989b89c474d3491a2f4651bce99954bed6',
});

export const OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE = Object.freeze({
  repository: 'zenon-network/znn-wiki',
  revision: 'cad4cde3aea2e962a1713958323699c3298790ae',
  path: 'api.md',
  sourceDate: '2021-12-17',
  observationHeight: 2,
  observationHash: '5efd0e49736f2a1ff7eeef3e3e73fbbb087471ff1097d2e41041942adccdec93',
  derivation: 'height-2 previousHash',
});

export const OPERATOR_TRUSTED_PUBLIC_TESTNET_NON_CLAIMS = Object.freeze({
  authoritativeCurrentNetworkRelease: false,
  signedTrustArtifact: false,
  authenticatedRpcEndpoint: false,
  canonicalRemoteChainIdentity: false,
  verifiedFrontierLineage: false,
  productionReadiness: false,
});

function fail(code) {
  throw new Error(code);
}

function cloneChainProfile() {
  return {
    version: OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.version,
    chainIdentifier: OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.chainIdentifier,
    genesisMomentumHash:
      OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.genesisMomentumHash,
  };
}

function readOwnDataProperty(value, key) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    fail('operator_trusted_profile_evidence_invalid');
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
    fail('operator_trusted_profile_evidence_invalid');
  }
  return descriptor.value;
}

function exactPinnedProfile(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return false;
  }
  const keys = Object.keys(descriptors).sort();
  if (keys.length !== 3 || keys[0] !== 'chainIdentifier' ||
      keys[1] !== 'genesisMomentumHash' || keys[2] !== 'version') return false;
  for (const key of keys) {
    if (!Object.hasOwn(descriptors[key], 'value')) return false;
  }
  return descriptors.version.value === OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.version &&
    descriptors.chainIdentifier.value ===
      OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.chainIdentifier &&
    descriptors.genesisMomentumHash.value ===
      OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.genesisMomentumHash;
}

function canonicalHash(value) {
  let encoded = value;
  if (typeof encoded !== 'string') {
    if (encoded === null || typeof encoded !== 'object' || typeof encoded.toString !== 'function') {
      fail('operator_trusted_profile_evidence_invalid');
    }
    encoded = encoded.toString();
  }
  if (typeof encoded !== 'string' || !LOWERCASE_HASH.test(encoded)) {
    fail('operator_trusted_profile_evidence_invalid');
  }
  return encoded;
}

async function checkHistoricalHeightTwo(context) {
  let expectedChainProfile;
  let zenon;
  let frontierMomentum;
  try {
    expectedChainProfile = readOwnDataProperty(context, 'expectedChainProfile');
    zenon = readOwnDataProperty(context, 'zenon');
    frontierMomentum = readOwnDataProperty(context, 'frontierMomentum');
  } catch {
    fail('operator_trusted_profile_evidence_invalid');
  }

  if (!exactPinnedProfile(expectedChainProfile)) {
    fail('operator_trusted_profile_mismatch');
  }

  let getMomentumsByHeight;
  try {
    getMomentumsByHeight = zenon?.ledger?.getMomentumsByHeight;
  } catch {
    fail('operator_trusted_profile_evidence_invalid');
  }
  if (typeof getMomentumsByHeight !== 'function') {
    fail('operator_trusted_profile_evidence_unavailable');
  }

  let observation;
  try {
    observation = await getMomentumsByHeight.call(zenon.ledger, 2, 1);
  } catch {
    fail('operator_trusted_profile_evidence_unavailable');
  }

  let count;
  let list;
  let frontierHeight;
  try {
    count = readOwnDataProperty(observation, 'count');
    list = readOwnDataProperty(observation, 'list');
    frontierHeight = readOwnDataProperty(frontierMomentum, 'height');
  } catch {
    fail('operator_trusted_profile_evidence_invalid');
  }
  if (!Number.isSafeInteger(count) || count < 2 || !Array.isArray(list) || list.length !== 1 ||
      !Number.isSafeInteger(frontierHeight) || frontierHeight < 2 || count < frontierHeight) {
    fail('operator_trusted_profile_evidence_invalid');
  }

  const momentum = list[0];
  let version;
  let chainIdentifier;
  let height;
  let hash;
  let previousHash;
  try {
    version = readOwnDataProperty(momentum, 'version');
    chainIdentifier = readOwnDataProperty(momentum, 'chainIdentifier');
    height = readOwnDataProperty(momentum, 'height');
    hash = canonicalHash(readOwnDataProperty(momentum, 'hash'));
    previousHash = canonicalHash(readOwnDataProperty(momentum, 'previousHash'));
  } catch {
    fail('operator_trusted_profile_evidence_invalid');
  }
  if (version !== 1 || height !== OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE.observationHeight ||
      chainIdentifier !== Number(OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.chainIdentifier) ||
      hash !== OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE.observationHash ||
      previousHash !== OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.genesisMomentumHash) {
    fail('operator_trusted_profile_evidence_mismatch');
  }

  const evidence = Object.freeze({
    trustMode: 'operator-trusted-historical-observation',
    remoteChainAuthenticated: false,
    chainProfile: Object.freeze(cloneChainProfile()),
    observationHeight: OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE.observationHeight,
  });
  OPERATOR_TRUST_EVIDENCE.add(evidence);
  return evidence;
}

const OPERATOR_TRUST_POLICIES = new WeakSet();
const OPERATOR_TRUST_EVIDENCE = new WeakSet();
const POLICY = Object.freeze({
  profileName: OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
  trustMode: 'operator-trusted-historical-observation',
  remoteChainAuthenticated: false,
  warning: OPERATOR_TRUSTED_PUBLIC_TESTNET_WARNING,
  chainProfile: cloneChainProfile,
  observeChainTrust: checkHistoricalHeightTwo,
});
OPERATOR_TRUST_POLICIES.add(POLICY);

export function isOperatorTrustedTestnetPolicy(value) {
  return (typeof value === 'object' || typeof value === 'function') && value !== null &&
    OPERATOR_TRUST_POLICIES.has(value);
}

export function isOperatorTrustedTestnetEvidence(value) {
  return (typeof value === 'object' || typeof value === 'function') && value !== null &&
    OPERATOR_TRUST_EVIDENCE.has(value);
}

export function selectOperatorTrustedTestnetPolicy(
  profileName,
  operatorTrustAcknowledgement,
  liveAcknowledgement,
) {
  if (typeof profileName !== 'string' ||
      profileName !== OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME) {
    fail('operator_trusted_testnet_profile_selection_invalid');
  }
  if (typeof operatorTrustAcknowledgement !== 'string' ||
      operatorTrustAcknowledgement !== OPERATOR_TRUST_ACKNOWLEDGEMENT) {
    fail('operator_trusted_testnet_acknowledgement_invalid');
  }
  if (typeof liveAcknowledgement !== 'string' ||
      liveAcknowledgement !== TESTNET_LIVE_ACKNOWLEDGEMENT) {
    fail('testnet_live_acknowledgement_invalid');
  }
  return POLICY;
}
