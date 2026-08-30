import { types as utilTypes } from 'node:util';

const ERROR_CODE = 'operator_trusted_local_devnet_artifact_invalid';
const ARTIFACT_MAX_BYTES = 16 * 1024;
const MAX_DEPTH = 8;
const MAX_NODES = 128;
const MAX_MEMBERS = 64;
const LOCAL_DEVNET_CHAIN_IDENTIFIER = '69';
const GENERATOR_REPOSITORY = '0x3639/testnet';
const LOWERCASE_HASH = /^[0-9a-f]{64}$/;
const IMMUTABLE_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/;
const REPOSITORY_SLUG = /^[a-z0-9](?:[a-z0-9._-]{0,62})\/[a-z0-9](?:[a-z0-9._-]{0,62})$/;

const APPLY = Reflect.apply;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const ARRAY_SORT = Array.prototype.sort;
const BUFFER_IS_BUFFER = Buffer.isBuffer;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const BUFFER_TO_STRING = Buffer.prototype.toString;
const CREATE_OBJECT = Object.create;
const DEFINE_PROPERTY = Object.defineProperty;
const FREEZE = Object.freeze;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const JSON_PARSE = JSON.parse;
const JSON_STRINGIFY = JSON.stringify;
const NUMBER_CONSTRUCTOR = Number;
const NUMBER_IS_FINITE = Number.isFinite;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT_IS = Object.is;
const OBJECT_KEYS = Object.keys;
const OBJECT_PROTOTYPE = Object.prototype;
const REGEXP_EXEC = RegExp.prototype.exec;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const SET_CONSTRUCTOR = Set;
const SET_ADD = Set.prototype.add;
const SET_HAS = Set.prototype.has;
const STRING_CHAR_CODE_AT = String.prototype.charCodeAt;
const STRING_ENDS_WITH = String.prototype.endsWith;
const STRING_INCLUDES = String.prototype.includes;
const STRING_SLICE = String.prototype.slice;
const STRING_STARTS_WITH = String.prototype.startsWith;
const WEAK_SET_CONSTRUCTOR = WeakSet;
const WEAK_SET_ADD = WeakSet.prototype.add;
const WEAK_SET_DELETE = WeakSet.prototype.delete;
const WEAK_SET_HAS = WeakSet.prototype.has;
const WEAK_MAP_CONSTRUCTOR = WeakMap;
const WEAK_MAP_GET = WeakMap.prototype.get;
const WEAK_MAP_SET = WeakMap.prototype.set;
const PROMISE_CONSTRUCTOR = Promise;
const PROMISE_PROTOTYPE = Promise.prototype;
const PROMISE_THEN = Promise.prototype.then;
const PROMISE_SPECIES = Symbol.species;
const PROMISE_SPECIES_GETTER =
  GET_OWN_PROPERTY_DESCRIPTOR(PROMISE_CONSTRUCTOR, PROMISE_SPECIES)?.get;

export const OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE =
  'operator-trusted-self-created-local-four-node-devnet-v1';

export const OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT =
  'I_UNDERSTAND_THIS_IS_A_SELF_CREATED_LOCAL_FOUR_NODE_DEVNET_NOT_PUBLIC_TESTNET_OR_AUTHENTICATED_CHAIN_IDENTITY';

export const OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_NON_CLAIMS = FREEZE({
  authenticatedChainIdentity: false,
  byteForBytePrivateNetworkReproduction: false,
  fourNodeTopologyVerified: false,
  issue45Complete: false,
  productionReadiness: false,
  publicTestnetEvidence: false,
  releaseOrActivation: false,
  runtimeProvenanceAuthenticated: false,
});

export class OperatorTrustedLocalDevnetError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'OperatorTrustedLocalDevnetError';
    this.code = ERROR_CODE;
    this.stack = `OperatorTrustedLocalDevnetError: ${ERROR_CODE}`;
  }
}

const ARTIFACTS = new WEAK_SET_CONSTRUCTOR();
const EVIDENCE = new WEAK_SET_CONSTRUCTOR();
const POLICIES = new WEAK_SET_CONSTRUCTOR();
const POLICY_ARTIFACTS = new WEAK_MAP_CONSTRUCTOR();

function fail() {
  throw new OperatorTrustedLocalDevnetError();
}

function shieldAsyncReturn(value) {
  const descriptor = APPLY(CREATE_OBJECT, undefined, [null]);
  descriptor.value = undefined;
  descriptor.enumerable = false;
  descriptor.configurable = false;
  descriptor.writable = false;
  DEFINE_PROPERTY(value, 'then', descriptor);
  return value;
}

function shieldInternalPromise(value) {
  const descriptor = APPLY(CREATE_OBJECT, undefined, [null]);
  descriptor.value = PROMISE_THEN;
  descriptor.enumerable = false;
  descriptor.configurable = false;
  descriptor.writable = false;
  DEFINE_PROPERTY(value, 'then', descriptor);
  return value;
}

function promiseSettlement(fulfilled, value) {
  const settlement = APPLY(CREATE_OBJECT, undefined, [null]);
  ownData(settlement, 'fulfilled', fulfilled);
  ownData(settlement, 'value', value);
  return FREEZE(settlement);
}

function fulfilledPromiseSettlement(value) {
  return promiseSettlement(true, value);
}

function rejectedPromiseSettlement(value) {
  return promiseSettlement(false, value);
}

function assertNativePromise(value) {
  if (value === null || typeof value !== 'object' || isProxy(value) ||
      !APPLY(IS_PROMISE, undefined, [value])) fail();
  let prototype;
  let keys;
  let constructorDescriptor;
  let speciesDescriptor;
  try {
    prototype = APPLY(GET_PROTOTYPE_OF, undefined, [value]);
    keys = APPLY(REFLECT_OWN_KEYS, undefined, [value]);
    constructorDescriptor = APPLY(
      GET_OWN_PROPERTY_DESCRIPTOR,
      undefined,
      [PROMISE_PROTOTYPE, 'constructor'],
    );
    speciesDescriptor = APPLY(
      GET_OWN_PROPERTY_DESCRIPTOR,
      undefined,
      [PROMISE_CONSTRUCTOR, PROMISE_SPECIES],
    );
  } catch {
    fail();
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] === 'string') fail();
  }
  if (prototype !== PROMISE_PROTOTYPE ||
      !constructorDescriptor ||
      !APPLY(HAS_OWN, undefined, [constructorDescriptor, 'value']) ||
      constructorDescriptor.value !== PROMISE_CONSTRUCTOR ||
      !speciesDescriptor ||
      APPLY(HAS_OWN, undefined, [speciesDescriptor, 'value']) ||
      speciesDescriptor.get !== PROMISE_SPECIES_GETTER ||
      speciesDescriptor.set !== undefined) fail();
}

function rawObservationIsNativePromise(value) {
  if (value !== null && (typeof value === 'object' || typeof value === 'function') &&
      isProxy(value)) fail();
  if (!APPLY(IS_PROMISE, undefined, [value])) return false;
  assertNativePromise(value);
  return true;
}

function settleNativePromise(value) {
  assertNativePromise(value);
  let bridge;
  try {
    bridge = APPLY(PROMISE_THEN, value, [
      fulfilledPromiseSettlement,
      rejectedPromiseSettlement,
    ]);
  } catch {
    fail();
  }
  assertNativePromise(bridge);
  return shieldInternalPromise(bridge);
}

function ownData(target, key, value) {
  DEFINE_PROPERTY(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function arrayIsArray(value) {
  return APPLY(ARRAY_IS_ARRAY, undefined, [value]);
}

function sortStrings(values) {
  APPLY(ARRAY_SORT, values, []);
  return values;
}

function regexExec(expression, value) {
  return APPLY(REGEXP_EXEC, expression, [value]);
}

function regexTest(expression, value) {
  return regexExec(expression, value) !== null;
}

function setAdd(set, value) {
  APPLY(SET_ADD, set, [value]);
}

function setHas(set, value) {
  return APPLY(SET_HAS, set, [value]);
}

function stringCharCodeAt(value, index) {
  return APPLY(STRING_CHAR_CODE_AT, value, [index]);
}

function stringEndsWith(value, suffix) {
  return APPLY(STRING_ENDS_WITH, value, [suffix]);
}

function stringIncludes(value, search) {
  return APPLY(STRING_INCLUDES, value, [search]);
}

function stringSlice(value, start, end) {
  return end === undefined
    ? APPLY(STRING_SLICE, value, [start])
    : APPLY(STRING_SLICE, value, [start, end]);
}

function stringStartsWith(value, prefix, position) {
  return position === undefined
    ? APPLY(STRING_STARTS_WITH, value, [prefix])
    : APPLY(STRING_STARTS_WITH, value, [prefix, position]);
}

function toNumber(value) {
  return APPLY(NUMBER_CONSTRUCTOR, undefined, [value]);
}

function numberIsFinite(value) {
  return APPLY(NUMBER_IS_FINITE, undefined, [value]);
}

function numberIsSafeInteger(value) {
  return APPLY(NUMBER_IS_SAFE_INTEGER, undefined, [value]);
}

function weakSetAdd(set, value) {
  APPLY(WEAK_SET_ADD, set, [value]);
}

function weakSetDelete(set, value) {
  APPLY(WEAK_SET_DELETE, set, [value]);
}

function weakSetHas(set, value) {
  return APPLY(WEAK_SET_HAS, set, [value]);
}

function weakMapGet(map, key) {
  return APPLY(WEAK_MAP_GET, map, [key]);
}

function weakMapSet(map, key, value) {
  APPLY(WEAK_MAP_SET, map, [key, value]);
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = stringCharCodeAt(value, index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = stringCharCodeAt(value, index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function safeInteger(value, minimum = 0) {
  return numberIsSafeInteger(value) && !OBJECT_IS(value, -0) && value >= minimum;
}

function parseStrictJson(text) {
  try {
    if (typeof text !== 'string' || BUFFER_BYTE_LENGTH(text, 'utf8') > ARTIFACT_MAX_BYTES ||
        hasUnpairedSurrogate(text)) fail();

    let index = 0;
    let nodes = 0;
    let members = 0;

    function skipWhitespace() {
      while (index < text.length && (text[index] === ' ' || text[index] === '\n' ||
          text[index] === '\r' || text[index] === '\t')) index += 1;
    }

    function parseString() {
      const start = index;
      if (text[index] !== '"') fail();
      index += 1;
      while (index < text.length) {
        const code = stringCharCodeAt(text, index);
        if (code === 0x22) {
          index += 1;
          const decoded = JSON_PARSE(stringSlice(text, start, index));
          if (typeof decoded !== 'string' || hasUnpairedSurrogate(decoded)) fail();
          return decoded;
        }
        if (code < 0x20) fail();
        if (code === 0x5c) {
          index += 1;
          if (index >= text.length) fail();
          if (text[index] === 'u') {
            if (!regexTest(/^[0-9a-fA-F]{4}$/, stringSlice(text, index + 1, index + 5))) fail();
            index += 5;
            continue;
          }
          if (!stringIncludes('"\\/bfnrt', text[index])) fail();
        }
        index += 1;
      }
      fail();
    }

    function parseNumber() {
      const match = regexExec(
        /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/,
        stringSlice(text, index),
      );
      if (!match) fail();
      index += match[0].length;
      const value = toNumber(match[0]);
      if (!numberIsFinite(value) || !numberIsSafeInteger(value) || OBJECT_IS(value, -0)) fail();
      return value;
    }

    function parseValue(depth) {
      if (depth > MAX_DEPTH || nodes >= MAX_NODES) fail();
      nodes += 1;
      skipWhitespace();
      const token = text[index];
      if (token === '"') return parseString();
      if (token === '{') {
        index += 1;
        const output = {};
        const seen = new SET_CONSTRUCTOR();
        skipWhitespace();
        if (text[index] === '}') {
          index += 1;
          return output;
        }
        while (index < text.length) {
          skipWhitespace();
          const key = parseString();
          if (setHas(seen, key) || members >= MAX_MEMBERS) fail();
          setAdd(seen, key);
          members += 1;
          skipWhitespace();
          if (text[index] !== ':') fail();
          index += 1;
          ownData(output, key, parseValue(depth + 1));
          skipWhitespace();
          if (text[index] === '}') {
            index += 1;
            return output;
          }
          if (text[index] !== ',') fail();
          index += 1;
        }
        fail();
      }
      if (stringStartsWith(text, 'true', index)) {
        index += 4;
        return true;
      }
      if (stringStartsWith(text, 'false', index)) {
        index += 5;
        return false;
      }
      if (stringStartsWith(text, 'null', index)) {
        index += 4;
        return null;
      }
      return parseNumber();
    }

    const parsed = parseValue(0);
    skipWhitespace();
    if (index !== text.length) fail();
    return parsed;
  } catch {
    fail();
  }
}

function encodedPrimitive(value) {
  const encoded = JSON_STRINGIFY(value);
  if (typeof encoded !== 'string') fail();
  return encoded;
}

function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' ||
      typeof value === 'number') return encodedPrimitive(value);
  if (arrayIsArray(value)) fail();
  const keys = sortStrings(OBJECT_KEYS(value));
  let output = '{';
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (index > 0) output += ',';
    output += `${encodedPrimitive(key)}:${canonicalJson(value[key])}`;
  }
  return `${output}}`;
}

function exactObject(value, expectedKeys) {
  if (!value || typeof value !== 'object' || arrayIsArray(value) ||
      GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = OBJECT_KEYS(value);
  if (keys.length !== expectedKeys.length) fail();
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    let allowed = false;
    for (let expectedIndex = 0; expectedIndex < expectedKeys.length; expectedIndex += 1) {
      if (keys[keyIndex] === expectedKeys[expectedIndex]) {
        allowed = true;
        break;
      }
    }
    if (!allowed) fail();
  }
  for (let index = 0; index < expectedKeys.length; index += 1) {
    if (!HAS_OWN(value, expectedKeys[index])) fail();
  }
  return value;
}

function validRepositorySlug(value) {
  return typeof value === 'string' && BUFFER_BYTE_LENGTH(value, 'utf8') <= 127 &&
    regexTest(REPOSITORY_SLUG, value);
}

function validateArtifactShape(value) {
  exactObject(value, [
    'acknowledgement',
    'artifactVersion',
    'chainProfile',
    'heightTwo',
    'lane',
    'nonClaims',
    'provenance',
  ]);
  if (value.artifactVersion !== 1 || value.lane !== OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE ||
      value.acknowledgement !== OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT) fail();

  exactObject(value.chainProfile, ['chainIdentifier', 'genesisMomentumHash', 'version']);
  if (value.chainProfile.version !== 1 ||
      value.chainProfile.chainIdentifier !== LOCAL_DEVNET_CHAIN_IDENTIFIER ||
      typeof value.chainProfile.genesisMomentumHash !== 'string' ||
      !regexTest(LOWERCASE_HASH, value.chainProfile.genesisMomentumHash)) fail();

  exactObject(value.heightTwo, ['chainIdentifier', 'hash', 'height', 'previousHash', 'version']);
  if (value.heightTwo.version !== 1 || value.heightTwo.height !== 2 ||
      value.heightTwo.chainIdentifier !== toNumber(LOCAL_DEVNET_CHAIN_IDENTIFIER) ||
      typeof value.heightTwo.hash !== 'string' ||
      !regexTest(LOWERCASE_HASH, value.heightTwo.hash) ||
      typeof value.heightTwo.previousHash !== 'string' ||
      !regexTest(LOWERCASE_HASH, value.heightTwo.previousHash) ||
      value.heightTwo.previousHash !== value.chainProfile.genesisMomentumHash ||
      value.heightTwo.hash === value.heightTwo.previousHash) fail();

  exactObject(value.provenance, ['generator', 'nodeRuntime']);
  exactObject(value.provenance.generator, ['repository', 'revision']);
  if (value.provenance.generator.repository !== GENERATOR_REPOSITORY ||
      typeof value.provenance.generator.revision !== 'string' ||
      !regexTest(IMMUTABLE_REVISION, value.provenance.generator.revision)) fail();

  exactObject(value.provenance.nodeRuntime, [
    'containerImageDigest',
    'sourceRepository',
    'sourceRevision',
  ]);
  if (!validRepositorySlug(value.provenance.nodeRuntime.sourceRepository) ||
      typeof value.provenance.nodeRuntime.sourceRevision !== 'string' ||
      !regexTest(IMMUTABLE_REVISION, value.provenance.nodeRuntime.sourceRevision) ||
      typeof value.provenance.nodeRuntime.containerImageDigest !== 'string' ||
      !regexTest(IMAGE_DIGEST, value.provenance.nodeRuntime.containerImageDigest)) fail();

  const nonClaimKeys = OBJECT_KEYS(OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_NON_CLAIMS);
  exactObject(value.nonClaims, nonClaimKeys);
  for (let index = 0; index < nonClaimKeys.length; index += 1) {
    if (value.nonClaims[nonClaimKeys[index]] !== false) fail();
  }
}

function capturePlainObject(value, depth, seen, budget) {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object' || IS_PROXY(value) ||
      weakSetHas(seen, value)) fail();
  if (budget.nodes >= MAX_NODES) fail();
  budget.nodes += 1;
  weakSetAdd(seen, value);

  let prototype;
  let keys;
  try {
    prototype = GET_PROTOTYPE_OF(value);
    keys = REFLECT_OWN_KEYS(value);
  } catch {
    fail();
  }
  if (prototype !== OBJECT_PROTOTYPE || keys.length > MAX_MEMBERS ||
      budget.members > MAX_MEMBERS - keys.length) fail();
  budget.members += keys.length;

  const output = {};
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== 'string' || hasUnpairedSurrogate(key)) fail();
    let descriptor;
    try {
      descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    } catch {
      fail();
    }
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) fail();
    const member = descriptor.value;
    if (member !== null && typeof member === 'object') {
      ownData(output, key, capturePlainObject(member, depth + 1, seen, budget));
    } else if (typeof member === 'string' || typeof member === 'boolean' ||
        (typeof member === 'number' && numberIsFinite(member) &&
          numberIsSafeInteger(member) && !OBJECT_IS(member, -0))) {
      if (typeof member === 'string' && (BUFFER_BYTE_LENGTH(member, 'utf8') > 256 ||
          hasUnpairedSurrogate(member))) fail();
      ownData(output, key, member);
    } else {
      fail();
    }
  }
  weakSetDelete(seen, value);
  return output;
}

function snapshotPlainObject(value) {
  return capturePlainObject(
    value,
    0,
    new WEAK_SET_CONSTRUCTOR(),
    { nodes: 0, members: 0 },
  );
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    const keys = OBJECT_KEYS(value);
    for (let index = 0; index < keys.length; index += 1) deepFreeze(value[keys[index]]);
    FREEZE(value);
  }
  return value;
}

function cloneChainProfile(profile) {
  return {
    version: profile.version,
    chainIdentifier: profile.chainIdentifier,
    genesisMomentumHash: profile.genesisMomentumHash,
  };
}

function cloneHeightTwo(heightTwo) {
  return {
    version: heightTwo.version,
    chainIdentifier: heightTwo.chainIdentifier,
    height: heightTwo.height,
    hash: heightTwo.hash,
    previousHash: heightTwo.previousHash,
  };
}

function cloneProvenance(provenance) {
  return {
    generator: {
      repository: provenance.generator.repository,
      revision: provenance.generator.revision,
    },
    nodeRuntime: {
      sourceRepository: provenance.nodeRuntime.sourceRepository,
      sourceRevision: provenance.nodeRuntime.sourceRevision,
      containerImageDigest: provenance.nodeRuntime.containerImageDigest,
    },
  };
}

const POLICY_PROFILE_KEYS = FREEZE(['chainIdentifier', 'genesisMomentumHash', 'version']);
const SDK_FRONTIER_PLAIN_KEYS = FREEZE(['chainIdentifier', 'hash', 'height']);
const SDK_MOMENTUM_PLAIN_KEYS = FREEZE([
  'chainIdentifier', 'hash', 'height', 'previousHash', 'version',
]);
const SDK_MOMENTUM_KEYS = FREEZE([
  'chainIdentifier', 'changesHash', 'content', 'data', 'hash', 'height',
  'previousHash', 'producer', 'publicKey', 'signature', 'timestamp', 'version',
]);
const SDK_MOMENTUM_LIST_KEYS = FREEZE(['count', 'list']);
const SDK_HASH_KEYS = FREEZE(['core']);
const SDK_SINGLE_ITEM_ARRAY_KEYS = FREEZE(['0', 'length']);

function isProxy(value) {
  return APPLY(IS_PROXY, undefined, [value]);
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

function readOwnDataProperty(value, key) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function') ||
      isProxy(value)) fail();
  return ownDataDescriptor(value, key).value;
}

function reflectedStringKeys(value) {
  let keys;
  try {
    keys = APPLY(REFLECT_OWN_KEYS, undefined, [value]);
  } catch {
    fail();
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string') fail();
  }
  sortStrings(keys);
  return keys;
}

function sameKeys(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function snapshotKnownSdkObject(value, alternatives) {
  if (value === null || typeof value !== 'object' || isProxy(value)) fail();
  const valueIsArray = arrayIsArray(value);
  let prototype;
  try {
    prototype = APPLY(GET_PROTOTYPE_OF, undefined, [value]);
  } catch {
    fail();
  }
  const keys = reflectedStringKeys(value);
  let selected = null;
  for (let index = 0; index < alternatives.length; index += 1) {
    const candidate = alternatives[index];
    const prototypeMatches =
      (candidate.prototype === 'plain' && prototype === OBJECT_PROTOTYPE) ||
      (candidate.prototype === 'sdk' && prototype !== null &&
        prototype !== OBJECT_PROTOTYPE && !valueIsArray) ||
      (candidate.prototype === 'array' && prototype === ARRAY_PROTOTYPE && valueIsArray);
    if (prototypeMatches && sameKeys(keys, candidate.keys)) {
      selected = candidate;
      break;
    }
  }
  if (!selected) fail();
  const snapshot = {};
  for (let index = 0; index < keys.length; index += 1) {
    ownData(snapshot, keys[index], ownDataDescriptor(value, keys[index]).value);
  }
  return snapshot;
}

function canonicalSdkHash(value) {
  if (typeof value === 'string') {
    if (!regexTest(LOWERCASE_HASH, value)) fail();
    return value;
  }
  const snapshot = snapshotKnownSdkObject(value, [
    { keys: SDK_HASH_KEYS, prototype: 'sdk' },
  ]);
  if (!APPLY(BUFFER_IS_BUFFER, undefined, [snapshot.core])) fail();
  const encoded = APPLY(BUFFER_TO_STRING, snapshot.core, ['hex']);
  if (typeof encoded !== 'string' || !regexTest(LOWERCASE_HASH, encoded)) fail();
  return encoded;
}

function snapshotPolicyChainProfile(value) {
  const snapshot = snapshotKnownSdkObject(value, [
    { keys: POLICY_PROFILE_KEYS, prototype: 'plain' },
  ]);
  if (snapshot.version !== 1 || snapshot.chainIdentifier !== LOCAL_DEVNET_CHAIN_IDENTIFIER ||
      typeof snapshot.genesisMomentumHash !== 'string' ||
      !regexTest(LOWERCASE_HASH, snapshot.genesisMomentumHash)) fail();
  return snapshot;
}

function snapshotSdkFrontier(value) {
  const snapshot = snapshotKnownSdkObject(value, [
    { keys: SDK_FRONTIER_PLAIN_KEYS, prototype: 'plain' },
    { keys: SDK_MOMENTUM_KEYS, prototype: 'sdk' },
  ]);
  if (!safeInteger(snapshot.chainIdentifier, 1) || !safeInteger(snapshot.height, 2)) fail();
  return {
    chainIdentifier: snapshot.chainIdentifier,
    hash: canonicalSdkHash(snapshot.hash),
    height: snapshot.height,
  };
}

function snapshotSdkHeightTwo(value) {
  const snapshot = snapshotKnownSdkObject(value, [
    { keys: SDK_MOMENTUM_PLAIN_KEYS, prototype: 'plain' },
    { keys: SDK_MOMENTUM_KEYS, prototype: 'sdk' },
  ]);
  if (!safeInteger(snapshot.version) || !safeInteger(snapshot.chainIdentifier, 1) ||
      !safeInteger(snapshot.height)) fail();
  return {
    version: snapshot.version,
    chainIdentifier: snapshot.chainIdentifier,
    hash: canonicalSdkHash(snapshot.hash),
    previousHash: canonicalSdkHash(snapshot.previousHash),
    height: snapshot.height,
  };
}

function snapshotSdkMomentumList(value) {
  const snapshot = snapshotKnownSdkObject(value, [
    { keys: SDK_MOMENTUM_LIST_KEYS, prototype: 'plain' },
    { keys: SDK_MOMENTUM_LIST_KEYS, prototype: 'sdk' },
  ]);
  if (!safeInteger(snapshot.count) || snapshot.list === null ||
      typeof snapshot.list !== 'object' || isProxy(snapshot.list) ||
      !arrayIsArray(snapshot.list)) fail();
  const list = snapshotKnownSdkObject(snapshot.list, [
    { keys: SDK_SINGLE_ITEM_ARRAY_KEYS, prototype: 'array' },
  ]);
  if (list.length !== 1) fail();
  return { count: snapshot.count, heightTwo: snapshotSdkHeightTwo(list[0]) };
}

function readSdkDataMethod(value, key) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function') ||
      isProxy(value)) fail();
  let descriptor;
  try {
    descriptor = APPLY(GET_OWN_PROPERTY_DESCRIPTOR, undefined, [value, key]);
  } catch {
    fail();
  }
  if (descriptor === undefined) {
    let prototype;
    try {
      prototype = APPLY(GET_PROTOTYPE_OF, undefined, [value]);
    } catch {
      fail();
    }
    if (prototype === null || isProxy(prototype)) fail();
    descriptor = ownDataDescriptor(prototype, key);
  } else if (!APPLY(HAS_OWN, undefined, [descriptor, 'value'])) {
    fail();
  }
  if (typeof descriptor.value !== 'function' || isProxy(descriptor.value)) fail();
  return descriptor.value;
}

function samePolicyChainProfile(left, right) {
  return left.version === right.version &&
    left.chainIdentifier === right.chainIdentifier &&
    left.genesisMomentumHash === right.genesisMomentumHash;
}

function sameSdkFrontier(left, right) {
  return left.chainIdentifier === right.chainIdentifier && left.height === right.height &&
    left.hash === right.hash;
}

export function createOperatorTrustedLocalDevnetPolicy(artifact) {
  try {
    if (!isOperatorTrustedLocalDevnetProfileArtifact(artifact)) fail();
    const policy = deepFreeze({
      artifactVersion: artifact.artifactVersion,
      lane: artifact.lane,
      trustMode: 'operator-trusted-self-created-local-devnet-observation',
      remoteChainAuthenticated: false,
      fourNodeTopologyVerified: false,
      chainProfile: cloneChainProfile(artifact.chainProfile),
      heightTwo: cloneHeightTwo(artifact.heightTwo),
      provenance: cloneProvenance(artifact.provenance),
      nonClaims: { ...OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_NON_CLAIMS },
    });
    weakSetAdd(POLICIES, policy);
    weakMapSet(POLICY_ARTIFACTS, policy, artifact);
    return policy;
  } catch {
    fail();
  }
}

export function isOperatorTrustedLocalDevnetPolicy(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function') &&
    !isProxy(value) && weakSetHas(POLICIES, value);
}

export async function observeOperatorTrustedLocalDevnetPolicy(policy, context) {
  try {
    if (!isOperatorTrustedLocalDevnetPolicy(policy)) fail();
    const artifact = weakMapGet(POLICY_ARTIFACTS, policy);
    if (!isOperatorTrustedLocalDevnetProfileArtifact(artifact)) fail();
    const expectedReference = readOwnDataProperty(context, 'expectedChainProfile');
    const frontierReference = readOwnDataProperty(context, 'frontierMomentum');
    const zenon = readOwnDataProperty(context, 'zenon');
    const expectedBefore = snapshotPolicyChainProfile(expectedReference);
    if (!samePolicyChainProfile(expectedBefore, artifact.chainProfile)) fail();
    const frontierBefore = snapshotSdkFrontier(frontierReference);
    if (frontierBefore.chainIdentifier !== toNumber(artifact.chainProfile.chainIdentifier)) fail();
    const ledger = readOwnDataProperty(zenon, 'ledger');
    const getMomentumsByHeight = readSdkDataMethod(ledger, 'getMomentumsByHeight');

    let rawObservation;
    try {
      rawObservation = APPLY(getMomentumsByHeight, ledger, [2, 1]);
    } catch {
      fail();
    }
    let observation = rawObservation;
    if (rawObservationIsNativePromise(rawObservation)) {
      const settlement = await settleNativePromise(rawObservation);
      if (settlement.fulfilled !== true) fail();
      observation = settlement.value;
    }

    if (readOwnDataProperty(context, 'expectedChainProfile') !== expectedReference ||
        readOwnDataProperty(context, 'frontierMomentum') !== frontierReference) fail();
    const expectedAfter = snapshotPolicyChainProfile(expectedReference);
    const frontierAfter = snapshotSdkFrontier(frontierReference);
    if (!samePolicyChainProfile(expectedBefore, expectedAfter) ||
        !sameSdkFrontier(frontierBefore, frontierAfter)) fail();
    const normalized = snapshotSdkMomentumList(observation);
    return validateOperatorTrustedLocalDevnetObservation(artifact, {
      reportedMomentumCount: normalized.count,
      frontierMomentum: {
        chainIdentifier: frontierBefore.chainIdentifier,
        height: frontierBefore.height,
      },
      heightTwoMomentum: normalized.heightTwo,
    });
  } catch {
    fail();
  }
}

export function isOperatorTrustedLocalDevnetProfileArtifact(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function') &&
    !isProxy(value) && weakSetHas(ARTIFACTS, value);
}

export function isOperatorTrustedLocalDevnetEvidence(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function') &&
    !isProxy(value) && weakSetHas(EVIDENCE, value);
}

export function parseOperatorTrustedLocalDevnetProfileArtifact(jsonText) {
  try {
    if (typeof jsonText !== 'string' || BUFFER_BYTE_LENGTH(jsonText, 'utf8') > ARTIFACT_MAX_BYTES ||
        !stringEndsWith(jsonText, '\n')) fail();
    const parsed = parseStrictJson(stringSlice(jsonText, 0, -1));
    validateArtifactShape(parsed);
    if (`${canonicalJson(parsed)}\n` !== jsonText) fail();
    const artifact = deepFreeze(parsed);
    weakSetAdd(ARTIFACTS, artifact);
    return artifact;
  } catch {
    fail();
  }
}

export function validateOperatorTrustedLocalDevnetObservation(artifact, observation) {
  try {
    if (!isOperatorTrustedLocalDevnetProfileArtifact(artifact)) fail();
    const snapshot = snapshotPlainObject(observation);
    exactObject(snapshot, ['frontierMomentum', 'heightTwoMomentum', 'reportedMomentumCount']);
    exactObject(snapshot.frontierMomentum, ['chainIdentifier', 'height']);
    exactObject(snapshot.heightTwoMomentum, [
      'chainIdentifier',
      'hash',
      'height',
      'previousHash',
      'version',
    ]);

    if (!safeInteger(snapshot.reportedMomentumCount, 2) ||
        !safeInteger(snapshot.frontierMomentum.height, 2) ||
        snapshot.reportedMomentumCount < snapshot.frontierMomentum.height ||
        snapshot.frontierMomentum.chainIdentifier !== toNumber(artifact.chainProfile.chainIdentifier) ||
        snapshot.heightTwoMomentum.version !== artifact.heightTwo.version ||
        snapshot.heightTwoMomentum.height !== artifact.heightTwo.height ||
        snapshot.heightTwoMomentum.chainIdentifier !== artifact.heightTwo.chainIdentifier ||
        snapshot.heightTwoMomentum.hash !== artifact.heightTwo.hash ||
        snapshot.heightTwoMomentum.previousHash !== artifact.heightTwo.previousHash ||
        snapshot.heightTwoMomentum.previousHash !== artifact.chainProfile.genesisMomentumHash ||
        snapshot.heightTwoMomentum.hash === snapshot.heightTwoMomentum.previousHash) fail();

    const evidence = deepFreeze(shieldAsyncReturn({
      lane: OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE,
      trustMode: 'operator-trusted-self-created-local-devnet-observation',
      remoteChainAuthenticated: false,
      publicTestnetEvidence: false,
      reproducibility: 'equivalent-behavior-only',
      chainProfile: cloneChainProfile(artifact.chainProfile),
      heightTwo: cloneHeightTwo(artifact.heightTwo),
      provenance: cloneProvenance(artifact.provenance),
      observationHeight: 2,
      nonClaims: { ...OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_NON_CLAIMS },
    }));
    weakSetAdd(EVIDENCE, evidence);
    return evidence;
  } catch {
    fail();
  }
}
