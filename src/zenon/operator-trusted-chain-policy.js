import { types as utilTypes } from 'node:util';

import {
  isOperatorTrustedLocalDevnetEvidence,
  isOperatorTrustedLocalDevnetPolicy,
  observeOperatorTrustedLocalDevnetPolicy,
} from './operator-trusted-local-devnet-profile.js';
import {
  OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
  isOperatorTrustedTestnetEvidence,
  isOperatorTrustedTestnetPolicy,
  observeOperatorTrustedTestnetPolicy,
} from './operator-trusted-testnet-profile.js';

const APPLY = Reflect.apply;
const ARRAY_SORT = Array.prototype.sort;
const FREEZE = Object.freeze;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const WEAK_MAP_CONSTRUCTOR = WeakMap;
const WEAK_MAP_GET = WeakMap.prototype.get;
const WEAK_MAP_SET = WeakMap.prototype.set;
const ERROR_CODE = 'operator_trusted_chain_policy_invalid';
const PUBLIC_TESTNET_FAMILY = 1;
const LOCAL_DEVNET_FAMILY = 2;
const PROFILE_KEYS = FREEZE(['chainIdentifier', 'genesisMomentumHash', 'version']);
const EVIDENCE_POLICIES = new WEAK_MAP_CONSTRUCTOR();

class OperatorTrustedChainPolicyError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'OperatorTrustedChainPolicyError';
    this.code = ERROR_CODE;
    this.stack = `OperatorTrustedChainPolicyError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new OperatorTrustedChainPolicyError();
}

function classifyPolicy(policy) {
  if (policy === null || (typeof policy !== 'object' && typeof policy !== 'function') ||
      APPLY(IS_PROXY, undefined, [policy])) fail();
  if (isOperatorTrustedTestnetPolicy(policy)) return PUBLIC_TESTNET_FAMILY;
  if (isOperatorTrustedLocalDevnetPolicy(policy)) return LOCAL_DEVNET_FAMILY;
  fail();
}

function ownDataDescriptor(value, key) {
  let descriptor;
  try {
    descriptor = APPLY(GET_OWN_PROPERTY_DESCRIPTOR, undefined, [value, key]);
  } catch {
    fail();
  }
  if (!descriptor || !APPLY(HAS_OWN, undefined, [descriptor, 'value'])) fail();
  return descriptor;
}

function snapshotProfile(value) {
  if (value === null || typeof value !== 'object' || APPLY(IS_PROXY, undefined, [value])) fail();
  let prototype;
  let keys;
  try {
    prototype = APPLY(GET_PROTOTYPE_OF, undefined, [value]);
    keys = APPLY(REFLECT_OWN_KEYS, undefined, [value]);
  } catch {
    fail();
  }
  if (prototype !== OBJECT_PROTOTYPE || keys.length !== PROFILE_KEYS.length) fail();
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string') fail();
  }
  APPLY(ARRAY_SORT, keys, []);
  for (let index = 0; index < PROFILE_KEYS.length; index += 1) {
    if (keys[index] !== PROFILE_KEYS[index]) fail();
  }
  return {
    chainIdentifier: ownDataDescriptor(value, 'chainIdentifier').value,
    genesisMomentumHash: ownDataDescriptor(value, 'genesisMomentumHash').value,
    version: ownDataDescriptor(value, 'version').value,
  };
}

function sameProfile(left, right) {
  return left.version === right.version && left.chainIdentifier === right.chainIdentifier &&
    left.genesisMomentumHash === right.genesisMomentumHash;
}

export function assertOperatorTrustedChainPolicy(policy, expectedChainProfile) {
  const family = classifyPolicy(policy);
  const expected = snapshotProfile(expectedChainProfile);
  const policyProfile = family === PUBLIC_TESTNET_FAMILY
    ? snapshotProfile(OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE)
    : snapshotProfile(ownDataDescriptor(policy, 'chainProfile').value);
  if (!sameProfile(expected, policyProfile)) fail();
  return policy;
}

function normalizeFamilyEvidence(family, evidence) {
  if (evidence === null || (typeof evidence !== 'object' && typeof evidence !== 'function') ||
      APPLY(IS_PROXY, undefined, [evidence])) fail();
  if (family === PUBLIC_TESTNET_FAMILY) {
    if (!isOperatorTrustedTestnetEvidence(evidence) ||
        isOperatorTrustedLocalDevnetEvidence(evidence)) fail();
    return evidence;
  }
  if (!isOperatorTrustedLocalDevnetEvidence(evidence) ||
      isOperatorTrustedTestnetEvidence(evidence)) fail();
  return evidence;
}

export function assertOperatorTrustedChainEvidence(policy, evidence) {
  const family = classifyPolicy(policy);
  const normalized = normalizeFamilyEvidence(family, evidence);
  if (APPLY(WEAK_MAP_GET, EVIDENCE_POLICIES, [normalized]) !== policy) fail();
  return normalized;
}

function registerFamilyEvidence(policy, family, evidence) {
  const normalized = normalizeFamilyEvidence(family, evidence);
  APPLY(WEAK_MAP_SET, EVIDENCE_POLICIES, [normalized, policy]);
  return normalized;
}

export async function observeOperatorTrustedChainPolicy(policy, context) {
  try {
    const family = classifyPolicy(policy);
    if (family === PUBLIC_TESTNET_FAMILY) {
      const evidence = await APPLY(
        observeOperatorTrustedTestnetPolicy,
        undefined,
        [policy, context],
      );
      return registerFamilyEvidence(policy, family, evidence);
    }
    const evidence = await APPLY(
      observeOperatorTrustedLocalDevnetPolicy,
      undefined,
      [policy, context],
    );
    return registerFamilyEvidence(policy, family, evidence);
  } catch {
    fail();
  }
}
