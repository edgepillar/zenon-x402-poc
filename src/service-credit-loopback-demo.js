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

import { canonicalJson } from './canonical.js';
import {
  MockExactZenonClient,
  MockExactZenonFacilitator,
} from './mock-payment.js';
import { deriveServiceCreditResourceBinding } from './service-credit-activation.js';
import {
  SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
  createServiceCreditCapabilitySigningBytes,
  deriveServiceCreditCapabilityCommitment,
} from './service-credit-capability.js';
import { createServiceCreditAuthorization } from './service-credit-client.js';
import { createServiceCreditCompositionOwner } from './service-credit-composition.js';
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

const NOW = 2_000_000_000_000;
const EXPIRY_WINDOW_MS = 60_000;
const RESPONSE_DEADLINE_MS = 2_000;
const MAX_RESPONSE_HEADER_COUNT = 8;
const MAX_RESPONSE_BODY_BYTES = 256;
const TOTAL_UNITS = 7;
const COST_UNITS = 2;
const RESOURCE_URL = 'https://service.example/credits/loopback-fund';
const CONTENT_TYPE = 'application/json';
const TEMP_PREFIX = 'zenon-x402-service-credit-loopback-demo-';
const DATABASE_BASENAME = 'ledger.sqlite';
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const EMPTY_BODY_DIGEST = `sha256:${createHash('sha256')
  .update(Buffer.alloc(0))
  .digest('hex')}`;
const AUTHORITY_RECORD_DIGEST = `sha256:${createHash('sha256')
  .update(Buffer.from('service-credit-loopback-demo-authority-v1', 'ascii'))
  .digest('hex')}`;
const SUCCESS_BODY = Buffer.from(
  '{"ok":true,"resultCode":"service.loopback.demo.completed"}',
  'utf8',
);
const RESPONSE_HEADER_NAMES = Object.freeze([
  'cache-control',
  'connection',
  'content-length',
  'content-type',
  'vary',
  'x-content-type-options',
]);
const SUMMARY_KEYS = Object.freeze([
  'demoVersion',
  'mode',
  'mockFundingSettlements',
  'serviceRequestAttempts',
  'uniqueServiceRequests',
  'exactReplays',
  'applicationExecutions',
  'additionalMockSettlements',
  'unitsConsumed',
  'unitsRemaining',
  'transportScope',
  'timingClaim',
  'benchmark',
]);
const SUMMARY = Object.freeze({
  demoVersion: 1,
  mode: 'SYNTHETIC_LOOPBACK_ONLY',
  mockFundingSettlements: 1,
  serviceRequestAttempts: 4,
  uniqueServiceRequests: 3,
  exactReplays: 1,
  applicationExecutions: 3,
  additionalMockSettlements: 0,
  unitsConsumed: 6,
  unitsRemaining: 1,
  transportScope: 'IPV4_LOOPBACK_ONLY',
  timingClaim: 'NONE',
  benchmark: false,
});
const HTTP_REQUEST = httpRequest;

class ServiceCreditLoopbackDemoError extends Error {
  constructor() {
    super('SERVICE_CREDIT_LOOPBACK_DEMO_FAILED');
    this.name = 'ServiceCreditLoopbackDemoError';
    this.code = 'SERVICE_CREDIT_LOOPBACK_DEMO_FAILED';
    this.stack = 'ServiceCreditLoopbackDemoError: SERVICE_CREDIT_LOOPBACK_DEMO_FAILED';
  }
}

function failDemo() {
  throw new ServiceCreditLoopbackDemoError();
}

function expect(condition) {
  if (!condition) failDemo();
}

function sameIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}

function currentUid() {
  expect(typeof process.getuid === 'function');
  const value = process.getuid();
  expect(Number.isSafeInteger(value) && value >= 0);
  return BigInt(value);
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
    && !fromParent.startsWith(`..${sep}`)
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
      && basename(ownership.directory).startsWith(TEMP_PREFIX)
      && pathIsWithin(ownership.parent, ownership.directory)
      && safePrivateDirectory(directory, ownership.uid)
      && sameIdentity(directory, ownership.directoryIdentity)
      && realpathSync(ownership.directory) === ownership.directory;
  } catch {
    return false;
  }
}

function cleanupOwnedDirectory(ownership, store, protectedStrings) {
  if (store !== null) {
    try {
      store.close();
    } catch {
      return false;
    }
  }
  if (ownership === null) return true;
  if (!inspectOwnedDirectory(ownership)) return false;

  let entries;
  try {
    entries = readdirSync(ownership.directory, { withFileTypes: true });
  } catch {
    return false;
  }
  let privacyPassed = true;
  if (ownership.databaseIdentity === null) {
    if (entries.length !== 0) return false;
  } else {
    if (
      entries.length !== 1
      || entries[0].name !== DATABASE_BASENAME
      || !entries[0].isFile()
    ) {
      return false;
    }
    let bytes = null;
    try {
      const database = lstatSync(ownership.databasePath, { bigint: true });
      if (
        !safePrivateFile(database, ownership.uid)
        || !sameIdentity(database, ownership.databaseIdentity)
        || realpathSync(ownership.databasePath) !== ownership.databasePath
      ) {
        return false;
      }
      bytes = readFileSync(ownership.databasePath);
      for (const value of protectedStrings) {
        if (
          typeof value !== 'string'
          || value.length === 0
          || bytes.includes(Buffer.from(value, 'utf8'))
        ) {
          privacyPassed = false;
        }
      }
    } catch {
      privacyPassed = false;
    } finally {
      bytes?.fill(0);
    }
    try {
      unlinkSync(ownership.databasePath);
    } catch {
      return false;
    }
    if (!pathIsAbsent(ownership.databasePath)) return false;
  }

  if (!inspectOwnedDirectory(ownership)) return false;
  try {
    if (readdirSync(ownership.directory).length !== 0) return false;
    rmdirSync(ownership.directory);
  } catch {
    return false;
  }
  if (!pathIsAbsent(ownership.directory)) return false;
  try {
    const parent = lstatSync(ownership.parent, { bigint: true });
    if (
      !sameIdentity(parent, ownership.parentIdentity)
      || realpathSync(ownership.parent) !== ownership.parent
    ) {
      return false;
    }
  } catch {
    return false;
  }
  return privacyPassed;
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
    amount: String(TOTAL_UNITS),
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
    providerId: 'provider.loopback.demo',
    serviceId: 'service.loopback.demo',
    resourceId: 'resource.loopback.demo.funding',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.loopback.demo.funding',
      resourceUrl: RESOURCE_URL,
    }),
    offerId: 'offer.loopback.demo',
    offerVersion: 1,
    costPolicyId: 'cost.fixed.loopback.demo',
    fundingPolicyId: 'funding.exact.mock.loopback.demo',
    fundingPolicyVersion: 1,
  };
}

function fundingIntent(holderId, capabilityCommitment) {
  return Object.freeze({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    providerId: 'provider.loopback.demo',
    serviceId: 'service.loopback.demo',
    resourceId: 'resource.loopback.demo.funding',
    offerId: 'offer.loopback.demo',
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
  expect(Buffer.isBuffer(encoded) && encoded.length === SPKI_ED25519_PREFIX.length + 32);
  expect(encoded.subarray(0, SPKI_ED25519_PREFIX.length).equals(SPKI_ED25519_PREFIX));
  let publicKey;
  try {
    publicKey = encoded.subarray(-32).toString('base64url');
  } finally {
    encoded.fill(0);
  }
  return { privateKey: pair.privateKey, publicKey };
}

function signedServiceRequest(capability, grant, requestId) {
  const request = Object.freeze({
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
    signature = sign(null, signingBytes, capability.privateKey).toString('base64url');
  } finally {
    signingBytes.fill(0);
  }
  const proof = Object.freeze({
    proofVersion: SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
    grantId: request.grantId,
    requestId: request.requestId,
    publicKey: capability.publicKey,
    maxCostUnits: request.maxCostUnits,
    signature,
  });
  const authorization = createServiceCreditAuthorization({
    grant: {
      grantId: grant.grantId,
      capabilityCommitment: grant.capabilityCommitment,
    },
    request,
    proof,
  });
  return Object.freeze({
    authorization,
    proofText: canonicalJson(proof),
    signature,
  });
}

function captureRoute(descriptor) {
  expect(
    descriptor !== null
    && typeof descriptor === 'object'
    && !Array.isArray(descriptor)
    && Object.getPrototypeOf(descriptor) === Object.prototype
    && Object.isFrozen(descriptor),
  );
  const keys = Reflect.ownKeys(descriptor);
  expect(keys.length === 2 && keys.includes('origin') && keys.includes('path'));
  for (const key of keys) {
    const property = Reflect.getOwnPropertyDescriptor(descriptor, key);
    expect(property?.enumerable && Object.hasOwn(property, 'value'));
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
  const port = Number(parsed.port);
  expect(Number.isSafeInteger(port) && port > 0 && port <= 65_535);
  expect(descriptor.origin === `http://127.0.0.1:${port}`);
  return Object.freeze({ port, path: descriptor.path });
}

function exactResponseHeaders(response) {
  try {
    const raw = response.rawHeaders;
    if (!Array.isArray(raw) || raw.length % 2 !== 0 || raw.length / 2 > MAX_RESPONSE_HEADER_COUNT) {
      return false;
    }
    const names = [];
    for (let index = 0; index < raw.length; index += 2) {
      if (typeof raw[index] !== 'string' || typeof raw[index + 1] !== 'string') return false;
      const name = raw[index].toLowerCase();
      if (names.includes(name)) return false;
      names.push(name);
    }
    names.sort();
    if (canonicalJson(names) !== canonicalJson(RESPONSE_HEADER_NAMES)) return false;
    const headerNames = Object.keys(response.headers).sort();
    return canonicalJson(headerNames) === canonicalJson(RESPONSE_HEADER_NAMES)
      && response.headers['cache-control'] === 'private, no-store, max-age=0'
      && response.headers.connection === 'close'
      && response.headers['content-type'] === CONTENT_TYPE
      && response.headers.vary === 'Authorization'
      && response.headers['x-content-type-options'] === 'nosniff'
      && response.headers['content-length'] === String(SUCCESS_BODY.length);
  } catch {
    return false;
  }
}

function exchangeOnce(route, authorization) {
  return new Promise((resolveExchange, rejectExchange) => {
    let outgoing = null;
    let incoming = null;
    let deadline = null;
    let settled = false;
    const chunks = [];
    let bodyBytes = 0;

    const clearDeadline = () => {
      if (deadline !== null) clearTimeout(deadline);
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
      rejectExchange(new ServiceCreditLoopbackDemoError());
    };
    const completeExchange = () => {
      if (settled) return;
      try {
        const body = Buffer.concat(chunks, bodyBytes);
        expect(
          incoming?.statusCode === 200
          && incoming.complete === true
          && incoming.aborted === false
          && exactResponseHeaders(incoming)
          && body.equals(SUCCESS_BODY),
        );
        settled = true;
        clearDeadline();
        resolveExchange(Object.freeze({
          statusCode: 200,
          headers: Object.freeze({ ...incoming.headers }),
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
          if (!Buffer.isBuffer(chunk) || bodyBytes + chunk.length > MAX_RESPONSE_BODY_BYTES) {
            failExchange();
            return;
          }
          chunks.push(chunk);
          bodyBytes += chunk.length;
        });
        response.once('aborted', failExchange);
        response.once('error', failExchange);
        response.once('end', completeExchange);
      });
      outgoing.once('error', failExchange);
      deadline = setTimeout(failExchange, RESPONSE_DEADLINE_MS);
      outgoing.end();
    } catch {
      failExchange();
    }
  });
}

function responseBytes(response) {
  const headers = Object.keys(response.headers)
    .sort()
    .map(key => [key, response.headers[key]]);
  return Buffer.concat([Buffer.from(canonicalJson(headers), 'utf8'), response.body]);
}

function validateFinalState(store, grantId, settlementCalls, facilitator, executionCount, revisions) {
  const snapshot = store.load();
  const grant = snapshot.state.grants.find(candidate => candidate.grantId === grantId);
  const requests = snapshot.state.requests.filter(candidate => candidate.grantId === grantId);
  expect(snapshot.revision === 11);
  expect(snapshot.state.offers.length === 1);
  expect(snapshot.state.grants.length === 1 && grant !== undefined);
  expect(grant.lifecycle === GRANT_LIFECYCLE.ACTIVE);
  expect(grant.totalUnits === TOTAL_UNITS);
  expect(grant.availableUnits === 1 && grant.heldUnits === 0 && grant.consumedUnits === 6);
  expect(grant.totalUnits === grant.availableUnits + grant.heldUnits + grant.consumedUnits);
  expect(requests.length === 3);
  expect(new Set(requests.map(request => request.requestId)).size === 3);
  expect(requests.every(request => request.state === REQUEST_STATE.SUCCEEDED));
  expect(settlementCalls === 1 && facilitator.records.size === 1 && executionCount === 3);
  expect(revisions.afterActivation === 2);
  expect(revisions.afterFirst === 5);
  expect(revisions.afterReplay === revisions.afterFirst);
  expect(revisions.afterSecond === 8 && revisions.afterThird === 11);
}

/**
 * Runs one explicit synthetic service-credit scenario over a bounded numeric
 * IPv4 loopback listener. It returns only a fixed aggregate and never exposes
 * routing metadata, request credentials, response bytes, identifiers, or time.
 */
export async function runServiceCreditLoopbackDemo() {
  if (arguments.length !== 0) failDemo();

  let ownership = null;
  let store = null;
  let loopback = null;
  let operationPassed = false;
  let transportClosed = true;
  const protectedStrings = [];
  try {
    ownership = createOwnedDirectory();
    store = ServiceCreditSqliteStore.create({
      databasePath: ownership.databasePath,
      allowedRoot: ownership.directory,
      deriveCost: () => COST_UNITS,
      now: () => NOW,
    });
    ownership.databaseIdentity = lstatSync(ownership.databasePath, { bigint: true });
    expect(safePrivateFile(ownership.databaseIdentity, ownership.uid));
    store.registerOffer(trustedOffer());

    const capability = createCapabilityKey();
    protectedStrings.push(capability.publicKey);
    const fundingClient = new MockExactZenonClient();
    protectedStrings.push(fundingClient.publicKeyDerB64);
    let settlementCalls = 0;
    const facilitator = new MockExactZenonFacilitator();
    const verifySettlement = async (...input) => {
      settlementCalls += 1;
      return facilitator.settle(...input);
    };
    let executionCount = 0;
    const owner = createServiceCreditCompositionOwner({
      store,
      activationOptions: {
        verifySettlement,
        authorityProfile: {
          profileId: 'authority.mock.loopback.demo',
          profileVersion: 1,
          verifierVersion: 1,
          recordDigest: AUTHORITY_RECORD_DIGEST,
        },
        now: () => NOW,
      },
      execute: () => {
        executionCount += 1;
        return { resultCode: 'service.loopback.demo.completed' };
      },
    });
    const intent = fundingIntent(
      fundingClient.address,
      deriveServiceCreditCapabilityCommitment({ publicKey: capability.publicKey }),
    );
    const requirement = fundingRequirement();
    const prepared = owner.createFundingResource({ intent, requirement, resourceUrl: RESOURCE_URL });
    const paymentRequired = makePaymentRequired({
      resourceUrl: prepared.resource.url,
      tags: prepared.resource.tags,
      requirement,
    });
    const paymentPayload = await fundingClient.createPaymentPayload(paymentRequired, requirement);
    protectedStrings.push(
      paymentPayload.payload.transaction.publicKey,
      paymentPayload.payload.transaction.signature,
      canonicalJson(paymentPayload),
    );
    const activated = await owner.activateFunding({ intent, paymentRequired, paymentPayload });
    const grantId = activated.grant.grantId;
    const revisions = { afterActivation: store.load().revision };

    const requestA = signedServiceRequest(capability, activated.grant, 'request.loopback.demo.a');
    const requestB = signedServiceRequest(capability, activated.grant, 'request.loopback.demo.b');
    const requestC = signedServiceRequest(capability, activated.grant, 'request.loopback.demo.c');
    for (const request of [requestA, requestB, requestC]) {
      protectedStrings.push(request.signature, request.proofText, request.authorization);
    }

    loopback = createServiceCreditLoopbackServer({ handler: owner.handle });
    const route = captureRoute(await loopback.start());
    let attempts = 0;
    attempts += 1;
    const first = await exchangeOnce(route, requestA.authorization);
    revisions.afterFirst = store.load().revision;
    attempts += 1;
    const replay = await exchangeOnce(route, requestA.authorization);
    revisions.afterReplay = store.load().revision;
    attempts += 1;
    const second = await exchangeOnce(route, requestB.authorization);
    revisions.afterSecond = store.load().revision;
    attempts += 1;
    const third = await exchangeOnce(route, requestC.authorization);
    revisions.afterThird = store.load().revision;
    expect(attempts === 4);
    expect(responseBytes(first).equals(responseBytes(replay)));
    for (const response of [first, replay, second, third]) {
      expect(response.statusCode === 200 && response.body.equals(SUCCESS_BODY));
    }
    validateFinalState(store, grantId, settlementCalls, facilitator, executionCount, revisions);
    expect(Object.isFrozen(SUMMARY) && Reflect.ownKeys(SUMMARY).length === SUMMARY_KEYS.length);
    expect(SUMMARY_KEYS.every(key => Object.hasOwn(SUMMARY, key)));
    operationPassed = true;
  } catch {
    operationPassed = false;
  } finally {
    if (loopback !== null) {
      transportClosed = false;
      try {
        await loopback.close();
        transportClosed = true;
      } catch {
        transportClosed = false;
      }
    }
    if (transportClosed) {
      if (!cleanupOwnedDirectory(ownership, store, protectedStrings)) operationPassed = false;
    } else {
      operationPassed = false;
    }
    protectedStrings.fill('');
    ownership = null;
    store = null;
    loopback = null;
  }
  if (!operationPassed) failDemo();
  return SUMMARY;
}
