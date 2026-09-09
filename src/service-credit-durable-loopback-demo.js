import {
  createHash,
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  sep,
} from 'node:path';
import { URL } from 'node:url';
import { types as utilTypes } from 'node:util';

import { canonicalJson } from './canonical.js';
import {
  MockExactZenonClient,
  MockExactZenonFacilitator,
} from './mock-payment.js';
import {
  MockServiceCreditActivation,
  createMockServiceCreditActivation,
  deriveServiceCreditResourceBinding,
} from './service-credit-activation.js';
import {
  SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
  createServiceCreditCapabilitySigningBytes,
  deriveServiceCreditCapabilityCommitment,
} from './service-credit-capability.js';
import { createServiceCreditAuthorization } from './service-credit-client.js';
import {
  createDurableServiceCreditHttpSession,
} from './service-credit-durable-http-session.js';
import {
  SERVICE_CREDIT_HTTP_PATH,
  SERVICE_CREDIT_HTTP_ROUTE_ID,
} from './service-credit-http.js';
import { createServiceCreditLoopbackServer } from './service-credit-loopback-server.js';
import {
  GRANT_LIFECYCLE,
  REQUEST_STATE,
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
} from './service-credit-model.js';
import { ServiceCreditSqliteStore } from './service-credit-sqlite-store.js';
import {
  MOCK_NETWORK,
  MOCK_ZENON_CHAIN_PROFILE,
  makePaymentRequired,
} from './x402-wire.js';

const REFLECT_APPLY = Reflect.apply;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_CREATE = Object.create;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_IS_FROZEN = Object.isFrozen;
const OBJECT_KEYS = Object.keys;
const OBJECT_PROTOTYPE = Object.prototype;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PUSH = Array.prototype.push;
const ARRAY_SORT = Array.prototype.sort;
const ARRAY_FILL = Array.prototype.fill;
const BUFFER_CONCAT = Buffer.concat;
const BUFFER_FROM = Buffer.from;
const BUFFER_IS_BUFFER = Buffer.isBuffer;
const BUFFER_EQUALS = Buffer.prototype.equals;
const BUFFER_INCLUDES = Buffer.prototype.includes;
const BUFFER_FILL = Buffer.prototype.fill;
const BUFFER_SUBARRAY = Buffer.prototype.subarray;
const BUFFER_TO_STRING = Buffer.prototype.toString;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const NUMBER_FROM = Number;
const BIGINT_FROM = BigInt;
const STRING_FROM = String;
const STRING_STARTS_WITH = String.prototype.startsWith;
const STRING_TO_LOWER_CASE = String.prototype.toLowerCase;
const SET_TIMEOUT = setTimeout;
const CLEAR_TIMEOUT = clearTimeout;
const HTTP_REQUEST = httpRequest;
const PROCESS_GET_UID = process.getuid;
const PROCESS_HRTIME = process.hrtime;
const PROCESS_HRTIME_BIGINT = process.hrtime.bigint;
const NATIVE_PROMISE = Promise;
const NATIVE_ERROR = Error;
const IS_PROXY = utilTypes.isProxy;

function ownDataValue(owner, key) {
  try {
    const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(owner, key);
    return descriptor && OBJECT_HAS_OWN(descriptor, 'value') ? descriptor.value : null;
  } catch {
    return null;
  }
}

function ownMethod(owner, key) {
  const value = ownDataValue(owner, key);
  return typeof value === 'function' ? value : null;
}

function ownGetter(owner, key) {
  try {
    const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(owner, key);
    return descriptor && typeof descriptor.get === 'function' ? descriptor.get : null;
  } catch {
    return null;
  }
}

const STORE_PROTOTYPE = ownDataValue(ServiceCreditSqliteStore, 'prototype');
const STORE_CREATE = ownMethod(ServiceCreditSqliteStore, 'create');
const STORE_OPEN_EXISTING = ownMethod(ServiceCreditSqliteStore, 'openExisting');
const STORE_CLOSE = ownMethod(STORE_PROTOTYPE, 'close');
const STORE_LOAD = ownMethod(STORE_PROTOTYPE, 'load');
const STORE_GET_DURABLE_EXECUTION_SNAPSHOT = ownMethod(
  STORE_PROTOTYPE,
  'getDurableExecutionSnapshot',
);
const STORE_REGISTER_OFFER = ownMethod(STORE_PROTOTYPE, 'registerOffer');
const STORE_GET_OFFER = ownMethod(STORE_PROTOTYPE, 'getOffer');
const STORE_ACTIVATE_GRANT_FROM_TRUSTED_RECORD = ownMethod(
  STORE_PROTOTYPE,
  'activateGrantFromTrustedRecord',
);
const STORE_GET_METADATA = ownMethod(STORE_PROTOTYPE, 'getMetadata');
const STORE_INITIALIZE_DURABLE_EXECUTION = ownMethod(
  STORE_PROTOTYPE,
  'initializeDurableExecution',
);
const MOCK_CLIENT_PROTOTYPE = ownDataValue(MockExactZenonClient, 'prototype');
const MOCK_CLIENT_CREATE_PAYMENT_PAYLOAD = ownMethod(
  MOCK_CLIENT_PROTOTYPE,
  'createPaymentPayload',
);
const MOCK_FACILITATOR_PROTOTYPE = ownDataValue(MockExactZenonFacilitator, 'prototype');
const MOCK_FACILITATOR_VERIFY = ownMethod(MOCK_FACILITATOR_PROTOTYPE, 'verify');
const MOCK_FACILITATOR_SETTLE = ownMethod(MOCK_FACILITATOR_PROTOTYPE, 'settle');
const MOCK_ACTIVATION_PROTOTYPE = ownDataValue(MockServiceCreditActivation, 'prototype');
const MOCK_ACTIVATION_CREATE_FUNDING_RESOURCE = ownMethod(
  MOCK_ACTIVATION_PROTOTYPE,
  'createFundingResource',
);
const MOCK_ACTIVATION_ACTIVATE = ownMethod(MOCK_ACTIVATION_PROTOTYPE, 'activate');
const MAP_PROTOTYPE = ownDataValue(Map, 'prototype');
const MAP_SIZE = ownGetter(MAP_PROTOTYPE, 'size');

const NOW = 2_000_000_000_000;
const EXPIRY_WINDOW_MS = 60_000;
const EXECUTION_DURATION_MS = 10_000;
const RESPONSE_DEADLINE_MS = 2_000;
const MAX_RESPONSE_HEADER_COUNT = 8;
const MAX_RESPONSE_BODY_BYTES = 256;
const TOTAL_UNITS = 7;
const COST_UNITS = 2;
const RESOURCE_URL = 'https://service.example/credits/durable-loopback-fund';
const CONTENT_TYPE = 'application/json';
const TEMP_PREFIX = 'zenon-x402-service-credit-durable-loopback-demo-';
const DATABASE_BASENAME = 'ledger.sqlite';
const SPKI_ED25519_PREFIX = BUFFER_FROM('302a300506032b6570032100', 'hex');
const EMPTY_BODY_DIGEST = `sha256:${createHash('sha256')
  .update(BUFFER_FROM([]))
  .digest('hex')}`;
const AUTHORITY_RECORD_DIGEST = `sha256:${createHash('sha256')
  .update(BUFFER_FROM('service-credit-durable-loopback-demo-authority-v1', 'ascii'))
  .digest('hex')}`;
const SUCCESS_BODY = BUFFER_FROM(
  '{"ok":true,"resultCode":"service.durable.loopback.demo.completed"}',
  'utf8',
);
const RESPONSE_HEADER_NAMES = OBJECT_FREEZE([
  'cache-control',
  'connection',
  'content-length',
  'content-type',
  'vary',
  'x-content-type-options',
]);
const SUMMARY_KEYS = OBJECT_FREEZE([
  'demoVersion',
  'mode',
  'mockFundingSettlements',
  'mockActivations',
  'distinctSuccessfulExecutions',
  'applicationCallbacks',
  'unitsConsumed',
  'unitsHeld',
  'unitsAvailable',
  'exactReplayStable',
  'cleanReopenStable',
  'cleanupVerified',
]);
const SUMMARY = OBJECT_FREEZE({
  demoVersion: 1,
  mode: 'SYNTHETIC_DURABLE_LOOPBACK_ONLY',
  mockFundingSettlements: 1,
  mockActivations: 1,
  distinctSuccessfulExecutions: 3,
  applicationCallbacks: 3,
  unitsConsumed: 6,
  unitsHeld: 0,
  unitsAvailable: 1,
  exactReplayStable: true,
  cleanReopenStable: true,
  cleanupVerified: true,
});

class DurableServiceCreditLoopbackDemoError extends NATIVE_ERROR {
  constructor() {
    super('SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED');
    apply(OBJECT_DEFINE_PROPERTY, undefined, [this, 'name', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: 'DurableServiceCreditLoopbackDemoError',
    }]);
    apply(OBJECT_DEFINE_PROPERTY, undefined, [this, 'code', {
      configurable: false,
      enumerable: true,
      writable: false,
      value: 'SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED',
    }]);
    apply(OBJECT_DEFINE_PROPERTY, undefined, [this, 'stack', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: 'DurableServiceCreditLoopbackDemoError: SERVICE_CREDIT_DURABLE_LOOPBACK_DEMO_FAILED',
    }]);
    OBJECT_FREEZE(this);
  }
}

function failDemo() {
  throw new DurableServiceCreditLoopbackDemoError();
}

function expect(condition) {
  if (!condition) failDemo();
}

function apply(functionValue, thisValue, args) {
  return REFLECT_APPLY(functionValue, thisValue, args);
}

function exactInstance(value, prototype) {
  return value !== null
    && typeof value === 'object'
    && !IS_PROXY(value)
    && REFLECT_GET_PROTOTYPE_OF(value) === prototype;
}

function exactOwnDataField(value, key) {
  const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
  expect(descriptor && OBJECT_HAS_OWN(descriptor, 'value'));
  return descriptor.value;
}

function prototypeFieldIsAbsent(prototype, key) {
  return REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(prototype, key) === undefined
    && REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(OBJECT_PROTOTYPE, key) === undefined;
}

function validateCapturedAuthoritySurfaces() {
  expect(
    STORE_PROTOTYPE !== null
    && typeof STORE_PROTOTYPE === 'object'
    && !IS_PROXY(STORE_PROTOTYPE)
    && typeof STORE_CREATE === 'function'
    && typeof STORE_OPEN_EXISTING === 'function'
    && typeof STORE_CLOSE === 'function'
    && typeof STORE_LOAD === 'function'
    && typeof STORE_GET_DURABLE_EXECUTION_SNAPSHOT === 'function'
    && typeof STORE_REGISTER_OFFER === 'function'
    && typeof STORE_GET_OFFER === 'function'
    && typeof STORE_ACTIVATE_GRANT_FROM_TRUSTED_RECORD === 'function'
    && typeof STORE_GET_METADATA === 'function'
    && typeof STORE_INITIALIZE_DURABLE_EXECUTION === 'function'
    && MOCK_CLIENT_PROTOTYPE !== null
    && typeof MOCK_CLIENT_PROTOTYPE === 'object'
    && !IS_PROXY(MOCK_CLIENT_PROTOTYPE)
    && typeof MOCK_CLIENT_CREATE_PAYMENT_PAYLOAD === 'function'
    && MOCK_FACILITATOR_PROTOTYPE !== null
    && typeof MOCK_FACILITATOR_PROTOTYPE === 'object'
    && !IS_PROXY(MOCK_FACILITATOR_PROTOTYPE)
    && typeof MOCK_FACILITATOR_VERIFY === 'function'
    && typeof MOCK_FACILITATOR_SETTLE === 'function'
    && MOCK_ACTIVATION_PROTOTYPE !== null
    && typeof MOCK_ACTIVATION_PROTOTYPE === 'object'
    && !IS_PROXY(MOCK_ACTIVATION_PROTOTYPE)
    && typeof MOCK_ACTIVATION_CREATE_FUNDING_RESOURCE === 'function'
    && typeof MOCK_ACTIVATION_ACTIVATE === 'function'
    && MAP_PROTOTYPE !== null
    && typeof MAP_PROTOTYPE === 'object'
    && !IS_PROXY(MAP_PROTOTYPE)
    && typeof MAP_SIZE === 'function'
    && ownMethod(STORE_PROTOTYPE, 'load') === STORE_LOAD,
  );
}

function validateSessionAdmissionStoreSurface() {
  expect(ownMethod(STORE_PROTOTYPE, 'load') === STORE_LOAD);
}

function validateMockConstructorSurfaces() {
  expect(
    ownMethod(MOCK_FACILITATOR_PROTOTYPE, 'verify') === MOCK_FACILITATOR_VERIFY
    && REFLECT_GET_PROTOTYPE_OF(MOCK_CLIENT_PROTOTYPE) === OBJECT_PROTOTYPE
    && REFLECT_GET_PROTOTYPE_OF(MOCK_FACILITATOR_PROTOTYPE) === OBJECT_PROTOTYPE
    && prototypeFieldIsAbsent(MOCK_CLIENT_PROTOTYPE, 'publicKey')
    && prototypeFieldIsAbsent(MOCK_CLIENT_PROTOTYPE, 'privateKey')
    && prototypeFieldIsAbsent(MOCK_CLIENT_PROTOTYPE, 'publicKeyDerB64')
    && prototypeFieldIsAbsent(MOCK_CLIENT_PROTOTYPE, 'address')
    && prototypeFieldIsAbsent(MOCK_FACILITATOR_PROTOTYPE, 'records'),
  );
}

function createActivationStoreView(store) {
  const view = apply(OBJECT_CREATE, Object, [null]);
  apply(OBJECT_DEFINE_PROPERTY, undefined, [view, 'getOffer', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: (...args) => apply(STORE_GET_OFFER, store, args),
  }]);
  apply(OBJECT_DEFINE_PROPERTY, undefined, [view, 'activateGrantFromTrustedRecord', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: (...args) => apply(STORE_ACTIVATE_GRANT_FROM_TRUSTED_RECORD, store, args),
  }]);
  return OBJECT_FREEZE(view);
}

function mockSettlementRecordCount(facilitator) {
  const records = exactOwnDataField(facilitator, 'records');
  expect(exactInstance(records, MAP_PROTOTYPE));
  const size = apply(MAP_SIZE, records, []);
  expect(NUMBER_IS_SAFE_INTEGER(size) && size >= 0);
  return size;
}

function append(array, value) {
  apply(ARRAY_PUSH, array, [value]);
}

function sameIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}

function currentUid() {
  expect(typeof PROCESS_GET_UID === 'function');
  const value = apply(PROCESS_GET_UID, process, []);
  expect(NUMBER_IS_SAFE_INTEGER(value) && value >= 0);
  return BIGINT_FROM(value);
}

function safePrivateDirectory(stat, uid) {
  return stat?.isDirectory()
    && !stat.isSymbolicLink()
    && stat.uid === uid
    && (stat.mode & 0o777n) === 0o700n
    && (stat.mode & 0o7000n) === 0n;
}

function safePrivateFile(stat, uid) {
  return stat?.isFile()
    && !stat.isSymbolicLink()
    && stat.uid === uid
    && stat.nlink === 1n
    && (stat.mode & 0o777n) === 0o600n
    && (stat.mode & 0o7000n) === 0n;
}

function pathIsWithin(parent, candidate) {
  const fromParent = relative(parent, candidate);
  return fromParent !== ''
    && fromParent !== '..'
    && !apply(STRING_STARTS_WITH, fromParent, [`..${sep}`])
    && !isAbsolute(fromParent);
}

function pathIsAbsent(path) {
  try {
    lstatSync(path, { bigint: true });
    return false;
  } catch (error) {
    try {
      return error?.code === 'ENOENT';
    } catch {
      return false;
    }
  }
}

function inspectOwnedDirectory(ownership) {
  try {
    const parent = lstatSync(ownership.parent, { bigint: true });
    const directory = lstatSync(ownership.directory, { bigint: true });
    return parent.isDirectory()
      && !parent.isSymbolicLink()
      && sameIdentity(parent, ownership.parentIdentity)
      && realpathSync(ownership.parent) === ownership.parent
      && dirname(ownership.directory) === ownership.parent
      && apply(STRING_STARTS_WITH, basename(ownership.directory), [TEMP_PREFIX])
      && pathIsWithin(ownership.parent, ownership.directory)
      && safePrivateDirectory(directory, ownership.uid)
      && sameIdentity(directory, ownership.directoryIdentity)
      && realpathSync(ownership.directory) === ownership.directory;
  } catch {
    return false;
  }
}

function inspectOwnedDatabase(ownership) {
  try {
    const database = lstatSync(ownership.databasePath, { bigint: true });
    return safePrivateFile(database, ownership.uid)
      && sameIdentity(database, ownership.databaseIdentity)
      && realpathSync(ownership.databasePath) === ownership.databasePath;
  } catch {
    return false;
  }
}

function inspectOwnedState(ownership) {
  if (!inspectOwnedDirectory(ownership) || !inspectOwnedDatabase(ownership)) return false;
  try {
    const entries = readdirSync(ownership.directory, { withFileTypes: true });
    return entries.length === 1
      && entries[0].name === DATABASE_BASENAME
      && entries[0].isFile();
  } catch {
    return false;
  }
}

function deleteVerifiedState(ownership, protectedStrings) {
  if (!inspectOwnedState(ownership)) return false;
  let privacyPassed = true;
  let bytes = null;
  try {
    bytes = readFileSync(ownership.databasePath);
    for (let index = 0; index < protectedStrings.length; index += 1) {
      const value = protectedStrings[index];
      if (
        typeof value !== 'string'
        || value.length === 0
        || apply(BUFFER_INCLUDES, bytes, [BUFFER_FROM(value, 'utf8')])
      ) {
        privacyPassed = false;
      }
    }
  } catch {
    return false;
  } finally {
    if (bytes !== null) apply(BUFFER_FILL, bytes, [0]);
  }

  if (!inspectOwnedState(ownership)) return false;
  try {
    unlinkSync(ownership.databasePath);
  } catch {
    return false;
  }
  if (!pathIsAbsent(ownership.databasePath) || !inspectOwnedDirectory(ownership)) return false;
  try {
    if (readdirSync(ownership.directory).length !== 0) return false;
    rmdirSync(ownership.directory);
  } catch {
    return false;
  }
  if (!pathIsAbsent(ownership.directory)) return false;
  try {
    const parent = lstatSync(ownership.parent, { bigint: true });
    return privacyPassed
      && sameIdentity(parent, ownership.parentIdentity)
      && realpathSync(ownership.parent) === ownership.parent;
  } catch {
    return false;
  }
}

function createOwnedDirectory() {
  const uid = currentUid();
  const parent = realpathSync(tmpdir());
  const parentIdentity = lstatSync(parent, { bigint: true });
  expect(parentIdentity.isDirectory() && !parentIdentity.isSymbolicLink());
  const created = mkdtempSync(join(parent, TEMP_PREFIX));
  chmodSync(created, 0o700);
  const directory = realpathSync(created);
  expect(directory === created && dirname(directory) === parent && pathIsWithin(parent, directory));
  const directoryIdentity = lstatSync(directory, { bigint: true });
  expect(safePrivateDirectory(directoryIdentity, uid));
  return {
    uid,
    parent,
    parentIdentity,
    directory,
    directoryIdentity,
    databasePath: join(directory, DATABASE_BASENAME),
    databaseIdentity: null,
  };
}

function fundingRequirement() {
  return {
    scheme: 'exact',
    network: MOCK_NETWORK,
    asset: 'zts1mockasset',
    amount: '7',
    payTo: 'mock-payee',
    maxTimeoutSeconds: 30,
    extra: {
      paymentFlow: 'upfront',
      poc: true,
      settlement: 'account-block',
      zenonChain: { ...MOCK_ZENON_CHAIN_PROFILE },
    },
  };
}

function trustedOffer() {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.durable.loopback.demo',
    serviceId: 'service.durable.loopback.demo',
    resourceId: 'resource.durable.loopback.demo.funding',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.durable.loopback.demo.funding',
      resourceUrl: RESOURCE_URL,
    }),
    offerId: 'offer.durable.loopback.demo',
    offerVersion: 1,
    costPolicyId: 'cost.fixed.durable.loopback.demo',
    fundingPolicyId: 'funding.exact.mock.durable.loopback.demo',
    fundingPolicyVersion: 1,
  };
}

function fundingIntent(holderId, capabilityCommitment) {
  return OBJECT_FREEZE({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    providerId: 'provider.durable.loopback.demo',
    serviceId: 'service.durable.loopback.demo',
    resourceId: 'resource.durable.loopback.demo.funding',
    offerId: 'offer.durable.loopback.demo',
    offerVersion: 1,
    holderId,
    capabilityCommitment,
    totalUnits: TOTAL_UNITS,
    expiresAt: NOW + EXPIRY_WINDOW_MS,
  });
}

function createCapabilityKey() {
  const pair = generateKeyPairSync('ed25519');
  const encoded = pair.publicKey.export({ format: 'der', type: 'spki' });
  expect(
    BUFFER_IS_BUFFER(encoded)
    && encoded.length === SPKI_ED25519_PREFIX.length + 32
    && apply(BUFFER_EQUALS, apply(BUFFER_SUBARRAY, encoded, [0, SPKI_ED25519_PREFIX.length]), [
      SPKI_ED25519_PREFIX,
    ]),
  );
  let publicKey;
  try {
    publicKey = apply(BUFFER_TO_STRING, apply(BUFFER_SUBARRAY, encoded, [-32]), ['base64url']);
  } finally {
    apply(BUFFER_FILL, encoded, [0]);
  }
  return { privateKey: pair.privateKey, publicKey };
}

function signedServiceRequest(capability, grant, requestId) {
  const request = OBJECT_FREEZE({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId: grant.grantId,
    requestId,
    method: 'POST',
    routeId: SERVICE_CREDIT_HTTP_ROUTE_ID,
    canonicalBodyDigest: EMPTY_BODY_DIGEST,
    selectedContentType: CONTENT_TYPE,
    maxCostUnits: COST_UNITS,
  });
  const signingBytes = createServiceCreditCapabilitySigningBytes(request);
  let signature;
  try {
    signature = apply(BUFFER_TO_STRING, sign(null, signingBytes, capability.privateKey), [
      'base64url',
    ]);
  } finally {
    apply(BUFFER_FILL, signingBytes, [0]);
  }
  const proof = OBJECT_FREEZE({
    proofVersion: SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
    grantId: request.grantId,
    requestId: request.requestId,
    publicKey: capability.publicKey,
    maxCostUnits: request.maxCostUnits,
    signature,
  });
  const proofText = canonicalJson(proof);
  const authorization = createServiceCreditAuthorization({
    grant: {
      grantId: grant.grantId,
      capabilityCommitment: grant.capabilityCommitment,
    },
    request,
    proof,
  });
  return OBJECT_FREEZE({ authorization, proofText, signature });
}

function keyPresent(keys, wanted) {
  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index] === wanted) return true;
  }
  return false;
}

function captureRoute(descriptor) {
  expect(
    descriptor !== null
    && typeof descriptor === 'object'
    && !IS_PROXY(descriptor)
    && !ARRAY_IS_ARRAY(descriptor)
    && REFLECT_GET_PROTOTYPE_OF(descriptor) === OBJECT_PROTOTYPE
    && OBJECT_IS_FROZEN(descriptor),
  );
  const keys = REFLECT_OWN_KEYS(descriptor);
  expect(keys.length === 2 && keyPresent(keys, 'origin') && keyPresent(keys, 'path'));
  for (let index = 0; index < keys.length; index += 1) {
    const property = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(descriptor, keys[index]);
    expect(property?.enumerable && OBJECT_HAS_OWN(property, 'value'));
  }
  expect(descriptor.path === SERVICE_CREDIT_HTTP_PATH);
  const parsed = new URL(descriptor.origin);
  expect(
    parsed.protocol === 'http:'
    && parsed.hostname === '127.0.0.1'
    && parsed.username === ''
    && parsed.password === ''
    && parsed.pathname === '/'
    && parsed.search === ''
    && parsed.hash === '',
  );
  const port = NUMBER_FROM(parsed.port);
  expect(NUMBER_IS_SAFE_INTEGER(port) && port > 0 && port <= 65_535);
  expect(descriptor.origin === `http://127.0.0.1:${port}`);
  return OBJECT_FREEZE({ port, path: descriptor.path });
}

function sortedStrings(input) {
  const copy = [];
  for (let index = 0; index < input.length; index += 1) append(copy, input[index]);
  apply(ARRAY_SORT, copy, []);
  return copy;
}

function sameStrings(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function exactResponseHeaders(response) {
  try {
    const raw = response.rawHeaders;
    if (!ARRAY_IS_ARRAY(raw) || raw.length % 2 !== 0 || raw.length / 2 > MAX_RESPONSE_HEADER_COUNT) {
      return false;
    }
    const names = [];
    for (let index = 0; index < raw.length; index += 2) {
      if (typeof raw[index] !== 'string' || typeof raw[index + 1] !== 'string') return false;
      const name = apply(STRING_TO_LOWER_CASE, raw[index], []);
      if (keyPresent(names, name)) return false;
      append(names, name);
    }
    const expectedNames = sortedStrings(RESPONSE_HEADER_NAMES);
    if (!sameStrings(sortedStrings(names), expectedNames)) return false;
    const headerNames = sortedStrings(OBJECT_KEYS(response.headers));
    return sameStrings(headerNames, expectedNames)
      && response.headers['cache-control'] === 'private, no-store, max-age=0'
      && response.headers.connection === 'close'
      && response.headers['content-type'] === CONTENT_TYPE
      && response.headers.vary === 'Authorization'
      && response.headers['x-content-type-options'] === 'nosniff'
      && response.headers['content-length'] === STRING_FROM(SUCCESS_BODY.length);
  } catch {
    return false;
  }
}

function exchangeOnce(route, authorization) {
  return new NATIVE_PROMISE((resolveExchange, rejectExchange) => {
    let outgoing = null;
    let incoming = null;
    let deadline = null;
    let settled = false;
    const chunks = [];
    let bodyBytes = 0;

    const clearDeadline = () => {
      if (deadline !== null) apply(CLEAR_TIMEOUT, undefined, [deadline]);
      deadline = null;
    };
    const destroyTransport = () => {
      try { incoming?.destroy(); } catch {}
      try { outgoing?.destroy(); } catch {}
    };
    const failExchange = () => {
      if (settled) return;
      settled = true;
      clearDeadline();
      destroyTransport();
      rejectExchange(new DurableServiceCreditLoopbackDemoError());
    };
    const completeExchange = () => {
      if (settled) return;
      try {
        const body = BUFFER_CONCAT(chunks, bodyBytes);
        expect(
          incoming?.statusCode === 200
          && incoming.complete === true
          && incoming.aborted === false
          && exactResponseHeaders(incoming)
          && apply(BUFFER_EQUALS, body, [SUCCESS_BODY]),
        );
        settled = true;
        clearDeadline();
        resolveExchange(OBJECT_FREEZE({
          statusCode: 200,
          headers: OBJECT_FREEZE({ ...incoming.headers }),
          body,
        }));
      } catch {
        failExchange();
      }
    };

    try {
      outgoing = HTTP_REQUEST({
        host: '127.0.0.1',
        port: route.port,
        method: 'POST',
        path: route.path,
        headers: {
          Authorization: authorization,
          'Content-Length': '0',
          Connection: 'close',
        },
        agent: false,
      }, response => {
        if (settled) {
          try { response.destroy(); } catch {}
          return;
        }
        incoming = response;
        if (response.statusCode !== 200 || !exactResponseHeaders(response)) {
          failExchange();
          return;
        }
        response.on('data', chunk => {
          if (settled) return;
          if (!BUFFER_IS_BUFFER(chunk) || bodyBytes + chunk.length > MAX_RESPONSE_BODY_BYTES) {
            failExchange();
            return;
          }
          append(chunks, chunk);
          bodyBytes += chunk.length;
        });
        response.once('aborted', failExchange);
        response.once('error', failExchange);
        response.once('end', completeExchange);
      });
      outgoing.once('error', failExchange);
      deadline = apply(SET_TIMEOUT, undefined, [failExchange, RESPONSE_DEADLINE_MS]);
      outgoing.end();
    } catch {
      failExchange();
    }
  });
}

function responseBytes(response) {
  const headers = [];
  const names = sortedStrings(OBJECT_KEYS(response.headers));
  for (let index = 0; index < names.length; index += 1) {
    append(headers, [names[index], response.headers[names[index]]]);
  }
  return BUFFER_CONCAT([BUFFER_FROM(canonicalJson(headers), 'utf8'), response.body]);
}

function realDeadlineRuntime() {
  return OBJECT_FREEZE({
    monotonicNowNs: () => apply(PROCESS_HRTIME_BIGINT, PROCESS_HRTIME, []),
    schedule: (callback, delayMs) => apply(SET_TIMEOUT, undefined, [callback, delayMs]),
    cancel: handle => {
      apply(CLEAR_TIMEOUT, undefined, [handle]);
      return undefined;
    },
  });
}

function validateCallbackInput(value) {
  expect(
    value !== null
    && typeof value === 'object'
    && !ARRAY_IS_ARRAY(value)
    && REFLECT_GET_PROTOTYPE_OF(value) === OBJECT_PROTOTYPE
    && OBJECT_IS_FROZEN(value),
  );
  const keys = REFLECT_OWN_KEYS(value);
  expect(keys.length === 2 && keyPresent(keys, 'executionId') && keyPresent(keys, 'signal'));
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(value, keys[index]);
    expect(descriptor?.enumerable && OBJECT_HAS_OWN(descriptor, 'value'));
  }
  expect(typeof value.executionId === 'string' && value.executionId.length > 0);
  expect(value.signal !== null && typeof value.signal === 'object');
}

function createPhaseRecord(store) {
  return {
    store,
    session: null,
    loopback: null,
    loopbackCloseAttempted: false,
    sessionCloseAttempted: false,
    storeCloseAttempted: false,
    closed: false,
  };
}

function initializePhase(phase, execute) {
  validateSessionAdmissionStoreSurface();
  phase.session = createDurableServiceCreditHttpSession({
    store: phase.store,
    execute,
    deadlineRuntime: realDeadlineRuntime(),
    selectedDurationMs: EXECUTION_DURATION_MS,
  });
  return phase;
}

async function closePhase(phase) {
  if (phase.closed) return true;
  if (phase.loopback !== null) {
    if (phase.loopbackCloseAttempted) return false;
    phase.loopbackCloseAttempted = true;
    try {
      await phase.loopback.close();
    } catch {
      return false;
    }
  }
  if (phase.session !== null) {
    if (phase.sessionCloseAttempted) return false;
    phase.sessionCloseAttempted = true;
    try {
      await phase.session.close();
    } catch {
      return false;
    }
  }
  if (phase.store !== null) {
    if (phase.storeCloseAttempted) return false;
    phase.storeCloseAttempted = true;
    try {
      apply(STORE_CLOSE, phase.store, []);
    } catch {
      return false;
    }
  }
  phase.closed = true;
  phase.loopback = null;
  phase.session = null;
  phase.store = null;
  return true;
}

function findGrant(snapshot, grantId) {
  for (let index = 0; index < snapshot.state.grants.length; index += 1) {
    const grant = snapshot.state.grants[index];
    if (grant.grantId === grantId) return grant;
  }
  return null;
}

function requestCount(snapshot, grantId) {
  let count = 0;
  for (let index = 0; index < snapshot.state.requests.length; index += 1) {
    if (snapshot.state.requests[index].grantId === grantId) count += 1;
  }
  return count;
}

function validateState(store, grantId, expectedRequests, expectedRevision, executionCount) {
  const snapshot = apply(STORE_LOAD, store, []);
  const grant = findGrant(snapshot, grantId);
  expect(snapshot.revision === expectedRevision);
  expect(snapshot.state.offers.length === 1 && snapshot.state.grants.length === 1);
  expect(grant !== null && grant.lifecycle === GRANT_LIFECYCLE.ACTIVE);
  expect(grant.totalUnits === TOTAL_UNITS);
  expect(grant.consumedUnits === expectedRequests * COST_UNITS);
  expect(grant.heldUnits === 0);
  expect(grant.availableUnits === TOTAL_UNITS - (expectedRequests * COST_UNITS));
  expect(grant.totalUnits === grant.availableUnits + grant.heldUnits + grant.consumedUnits);
  expect(requestCount(snapshot, grantId) === expectedRequests);
  for (let index = 0; index < snapshot.state.requests.length; index += 1) {
    const request = snapshot.state.requests[index];
    if (request.grantId === grantId) expect(request.state === REQUEST_STATE.SUCCEEDED);
  }

  const durable = apply(STORE_GET_DURABLE_EXECUTION_SNAPSHOT, store, []);
  expect(durable.revision === expectedRevision && durable.executionState !== null);
  expect(durable.executionState.generation.state === 'OPEN');
  expect(durable.executionState.generation.seal === null);
  expect(durable.executionState.executions.length === expectedRequests);
  for (let index = 0; index < durable.executionState.executions.length; index += 1) {
    const execution = durable.executionState.executions[index];
    expect(
      execution.terminalClassification === 'SUCCEEDED'
      && execution.fencePhase === 'MAY_HAVE_STARTED'
      && typeof execution.resultCommitment === 'string'
      && execution.uncertaintyReason === null,
    );
  }
  expect(executionCount === expectedRequests);
  return snapshot;
}

function safeSummary() {
  expect(OBJECT_IS_FROZEN(SUMMARY));
  const keys = REFLECT_OWN_KEYS(SUMMARY);
  expect(keys.length === SUMMARY_KEYS.length);
  for (let index = 0; index < SUMMARY_KEYS.length; index += 1) {
    expect(keys[index] === SUMMARY_KEYS[index]);
    const descriptor = REFLECT_GET_OWN_PROPERTY_DESCRIPTOR(SUMMARY, keys[index]);
    expect(descriptor?.enumerable && OBJECT_HAS_OWN(descriptor, 'value'));
    expect(descriptor.value === null || typeof descriptor.value !== 'object');
  }
  return SUMMARY;
}

/**
 * Runs one explicit synthetic durable service-credit scenario over a bounded
 * numeric IPv4 loopback listener. It returns only a fixed non-sensitive
 * aggregate after two cleanly closed phases and verified state deletion.
 */
export async function runDurableServiceCreditLoopbackDemo() {
  if (arguments.length !== 0) failDemo();
  validateCapturedAuthoritySurfaces();
  validateMockConstructorSurfaces();

  let ownership = null;
  let currentPhase = null;
  let phaseOneClosed = false;
  let phaseTwoClosed = false;
  let finalStateValidated = false;
  let operationPassed = false;
  let cleanupPassed = false;
  const protectedStrings = [];

  try {
    ownership = createOwnedDirectory();
    const configuration = {
      databasePath: ownership.databasePath,
      allowedRoot: ownership.directory,
      deriveCost: () => COST_UNITS,
      now: () => NOW,
    };
    const initialStore = apply(STORE_CREATE, ServiceCreditSqliteStore, [configuration]);
    expect(exactInstance(initialStore, STORE_PROTOTYPE));
    currentPhase = createPhaseRecord(initialStore);
    ownership.databaseIdentity = lstatSync(ownership.databasePath, { bigint: true });
    expect(safePrivateFile(ownership.databaseIdentity, ownership.uid));
    const registeredOffer = apply(STORE_REGISTER_OFFER, initialStore, [trustedOffer()]);

    const capability = createCapabilityKey();
    append(protectedStrings, capability.publicKey);
    const fundingClient = new MockExactZenonClient();
    expect(exactInstance(fundingClient, MOCK_CLIENT_PROTOTYPE));
    const clientPublicKey = exactOwnDataField(fundingClient, 'publicKeyDerB64');
    const clientAddress = exactOwnDataField(fundingClient, 'address');
    expect(typeof clientPublicKey === 'string' && typeof clientAddress === 'string');
    append(protectedStrings, clientPublicKey);
    const facilitator = new MockExactZenonFacilitator();
    expect(exactInstance(facilitator, MOCK_FACILITATOR_PROTOTYPE));
    expect(mockSettlementRecordCount(facilitator) === 0);
    let settlementCalls = 0;
    let activationCalls = 0;
    const activation = createMockServiceCreditActivation({
      store: createActivationStoreView(initialStore),
      verifySettlement: async (...input) => {
        settlementCalls += 1;
        return apply(MOCK_FACILITATOR_SETTLE, facilitator, input);
      },
      authorityProfile: {
        profileId: 'authority.mock.durable.loopback.demo',
        profileVersion: 1,
        verifierVersion: 1,
        recordDigest: AUTHORITY_RECORD_DIGEST,
      },
      now: () => NOW,
    });
    expect(exactInstance(activation, MOCK_ACTIVATION_PROTOTYPE));
    const intent = fundingIntent(
      clientAddress,
      deriveServiceCreditCapabilityCommitment({ publicKey: capability.publicKey }),
    );
    const requirement = fundingRequirement();
    const prepared = apply(MOCK_ACTIVATION_CREATE_FUNDING_RESOURCE, activation, [{
      intent,
      requirement,
      resourceUrl: RESOURCE_URL,
    }]);
    const paymentRequired = makePaymentRequired({
      resourceUrl: prepared.resource.url,
      tags: prepared.resource.tags,
      requirement,
    });
    const paymentPayload = await apply(MOCK_CLIENT_CREATE_PAYMENT_PAYLOAD, fundingClient, [
      paymentRequired,
      requirement,
    ]);
    append(protectedStrings, paymentPayload.payload.transaction.publicKey);
    append(protectedStrings, paymentPayload.payload.transaction.signature);
    append(protectedStrings, canonicalJson(paymentPayload));
    activationCalls += 1;
    const activated = await apply(MOCK_ACTIVATION_ACTIVATE, activation, [{
      intent,
      paymentRequired,
      paymentPayload,
    }]);
    expect(
      settlementCalls === 1
      && activationCalls === 1
      && mockSettlementRecordCount(facilitator) === 1,
    );
    expect(apply(STORE_GET_METADATA, initialStore, []).revision === 2);

    const initialized = apply(STORE_INITIALIZE_DURABLE_EXECUTION, initialStore, [{
      expectedRevision: 2,
      ledgerId: 'ledger.durable.loopback.demo',
      policy: {
        policyId: 'execution.durable.loopback.demo',
        policyVersion: 1,
        maxDurationMs: EXECUTION_DURATION_MS,
      },
      capacity: 8,
    }]);
    expect(initialized.disposition === 'APPLIED' && initialized.revision === 3);

    const requestA = signedServiceRequest(capability, activated.grant, 'request.durable.loopback.demo.a');
    const requestB = signedServiceRequest(capability, activated.grant, 'request.durable.loopback.demo.b');
    const requestC = signedServiceRequest(capability, activated.grant, 'request.durable.loopback.demo.c');
    for (const request of [requestA, requestB, requestC]) {
      append(protectedStrings, request.authorization);
      append(protectedStrings, request.proofText);
      append(protectedStrings, request.signature);
    }

    let executionCount = 0;
    const execute = context => {
      validateCallbackInput(context);
      executionCount += 1;
      return OBJECT_FREEZE({ resultCode: 'service.durable.loopback.demo.completed' });
    };

    const phaseOne = initializePhase(currentPhase, execute);
    phaseOne.loopback = createServiceCreditLoopbackServer({ handler: phaseOne.session.handle });
    const firstRoute = captureRoute(await phaseOne.loopback.start());
    const firstA = await exchangeOnce(firstRoute, requestA.authorization);
    expect(apply(STORE_GET_METADATA, initialStore, []).revision === 6);
    const replayA = await exchangeOnce(firstRoute, requestA.authorization);
    expect(apply(STORE_GET_METADATA, initialStore, []).revision === 6);
    const firstB = await exchangeOnce(firstRoute, requestB.authorization);
    expect(apply(STORE_GET_METADATA, initialStore, []).revision === 9);
    expect(apply(BUFFER_EQUALS, responseBytes(firstA), [responseBytes(replayA)]));
    validateState(initialStore, activated.grant.grantId, 2, 9, executionCount);

    phaseOneClosed = await closePhase(phaseOne);
    expect(phaseOneClosed);
    currentPhase = null;

    expect(inspectOwnedState(ownership));
    const reopenedStore = apply(STORE_OPEN_EXISTING, ServiceCreditSqliteStore, [configuration]);
    expect(exactInstance(reopenedStore, STORE_PROTOTYPE));
    const phaseTwo = createPhaseRecord(reopenedStore);
    currentPhase = phaseTwo;
    initializePhase(phaseTwo, execute);
    phaseTwo.loopback = createServiceCreditLoopbackServer({ handler: phaseTwo.session.handle });
    const secondRoute = captureRoute(await phaseTwo.loopback.start());
    const reopenedA = await exchangeOnce(secondRoute, requestA.authorization);
    const reopenedB = await exchangeOnce(secondRoute, requestB.authorization);
    expect(apply(BUFFER_EQUALS, responseBytes(reopenedA), [responseBytes(firstA)]));
    expect(apply(BUFFER_EQUALS, responseBytes(reopenedB), [responseBytes(firstB)]));
    expect(apply(STORE_GET_METADATA, reopenedStore, []).revision === 9 && executionCount === 2);
    const firstC = await exchangeOnce(secondRoute, requestC.authorization);
    expect(apply(BUFFER_EQUALS, firstC.body, [SUCCESS_BODY]));
    expect(apply(STORE_GET_METADATA, reopenedStore, []).revision === 12);
    validateState(reopenedStore, activated.grant.grantId, 3, 12, executionCount);
    expect(
      settlementCalls === 1
      && activationCalls === 1
      && mockSettlementRecordCount(facilitator) === 1,
    );
    finalStateValidated = true;

    phaseTwoClosed = await closePhase(phaseTwo);
    expect(phaseTwoClosed);
    currentPhase = null;
    operationPassed = true;
  } catch {
    operationPassed = false;
  } finally {
    if (currentPhase !== null) {
      const closed = await closePhase(currentPhase);
      if (!closed) operationPassed = false;
    }
    if (
      operationPassed
      && phaseOneClosed
      && phaseTwoClosed
      && finalStateValidated
      && ownership !== null
    ) {
      cleanupPassed = deleteVerifiedState(ownership, protectedStrings);
    }
    apply(ARRAY_FILL, protectedStrings, ['']);
    currentPhase = null;
    ownership = null;
  }

  if (!operationPassed || !cleanupPassed) failDemo();
  return safeSummary();
}
