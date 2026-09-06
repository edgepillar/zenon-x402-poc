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
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  sep,
} from 'node:path';

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
import { createServiceCreditCompositionOwner } from './service-credit-composition.js';
import {
  SERVICE_CREDIT_HTTP_PATH,
  SERVICE_CREDIT_HTTP_ROUTE_ID,
} from './service-credit-http.js';
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
const TOTAL_UNITS = 7;
const COST_UNITS = 2;
const RESOURCE_URL = 'https://service.example/credits/fund';
const CONTENT_TYPE = 'application/json';
const TEMP_PREFIX = 'zenon-x402-service-credit-demo-';
const DATABASE_BASENAME = 'ledger.sqlite';
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const EMPTY_BODY_DIGEST = `sha256:${createHash('sha256')
  .update(Buffer.alloc(0))
  .digest('hex')}`;
const AUTHORITY_RECORD_DIGEST = `sha256:${createHash('sha256')
  .update(Buffer.from('service-credit-mock-demo-authority-v1', 'ascii'))
  .digest('hex')}`;
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
  'networkActivity',
  'timingClaim',
  'benchmark',
]);
const SUMMARY = Object.freeze({
  demoVersion: 1,
  mode: 'OFFLINE_MOCK_ONLY',
  mockFundingSettlements: 1,
  serviceRequestAttempts: 4,
  uniqueServiceRequests: 3,
  exactReplays: 1,
  applicationExecutions: 3,
  additionalMockSettlements: 0,
  unitsConsumed: 6,
  unitsRemaining: 1,
  networkActivity: 'NONE',
  timingClaim: 'NONE',
  benchmark: false,
});

class ServiceCreditMockDemoError extends Error {
  constructor() {
    super('SERVICE_CREDIT_MOCK_DEMO_FAILED');
    this.name = 'ServiceCreditMockDemoError';
    this.code = 'SERVICE_CREDIT_MOCK_DEMO_FAILED';
    this.stack = 'ServiceCreditMockDemoError: SERVICE_CREDIT_MOCK_DEMO_FAILED';
  }
}

function failDemo() {
  throw new ServiceCreditMockDemoError();
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
  let passed = true;
  if (store !== null) {
    try {
      store.close();
    } catch {
      passed = false;
    }
  }
  if (ownership === null) return passed;
  if (!inspectOwnedDirectory(ownership)) return false;

  let entries;
  try {
    entries = readdirSync(ownership.directory, { withFileTypes: true });
  } catch {
    return false;
  }
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
    try {
      const database = lstatSync(ownership.databasePath, { bigint: true });
      if (
        !safePrivateFile(database, ownership.uid)
        || !sameIdentity(database, ownership.databaseIdentity)
        || realpathSync(ownership.databasePath) !== ownership.databasePath
      ) {
        return false;
      }
      const bytes = readFileSync(ownership.databasePath);
      for (const value of protectedStrings) {
        if (typeof value !== 'string' || value.length === 0 || bytes.includes(Buffer.from(value))) {
          passed = false;
        }
      }
    } catch {
      passed = false;
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
    if (!sameIdentity(parent, ownership.parentIdentity) || realpathSync(ownership.parent) !== ownership.parent) {
      return false;
    }
  } catch {
    return false;
  }
  return passed;
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
    providerId: 'provider.demo',
    serviceId: 'service.demo',
    resourceId: 'resource.demo.funding',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.demo.funding',
      resourceUrl: RESOURCE_URL,
    }),
    offerId: 'offer.demo',
    offerVersion: 1,
    costPolicyId: 'cost.fixed.demo',
    fundingPolicyId: 'funding.exact.mock.demo',
    fundingPolicyVersion: 1,
  };
}

function fundingIntent(holderId, capabilityCommitment) {
  return Object.freeze({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    providerId: 'provider.demo',
    serviceId: 'service.demo',
    resourceId: 'resource.demo.funding',
    offerId: 'offer.demo',
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
  return {
    privateKey: pair.privateKey,
    publicKey: encoded.subarray(-32).toString('base64url'),
  };
}

function signedServiceRequest(capability, grantId, requestId) {
  const request = Object.freeze({
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId,
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
    grantId,
    requestId,
    publicKey: capability.publicKey,
    maxCostUnits: COST_UNITS,
    signature,
  });
  const proofText = canonicalJson(proof);
  const authorization = `ServiceCredit ${Buffer.from(proofText, 'utf8').toString('base64url')}`;
  return Object.freeze({ authorization, proofText, signature });
}

async function exchange(handler, authorization) {
  const request = Object.freeze({
    url: SERVICE_CREDIT_HTTP_PATH,
    method: 'POST',
    rawHeaders: Object.freeze(['Authorization', authorization, 'Content-Length', '0']),
  });
  const headers = Object.create(null);
  let body = null;
  const response = {
    destroyed: false,
    writableEnded: false,
    statusCode: 0,
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = String(value);
    },
    end(value) {
      this.writableEnded = true;
      body = Buffer.from(value);
    },
    destroy() {
      this.destroyed = true;
    },
  };
  await handler(request, response);
  expect(response.destroyed === false && response.writableEnded === true && Buffer.isBuffer(body));
  return Object.freeze({
    statusCode: response.statusCode,
    headers: Object.freeze({ ...headers }),
    body,
  });
}

function assertSuccessfulResponse(response) {
  expect(response.statusCode === 200);
  expect(response.headers['cache-control'] === 'private, no-store, max-age=0');
  expect(response.headers['content-type'] === CONTENT_TYPE);
  expect(response.headers.vary === 'Authorization');
  expect(response.headers['x-content-type-options'] === 'nosniff');
  expect(Number(response.headers['content-length']) === response.body.length);
  expect(response.body.toString('utf8') === '{"ok":true,"resultCode":"service.demo.completed"}');
}

function validateFinalState(store, grantId, settlementCalls, facilitator, executionCount, revisions) {
  const snapshot = store.load();
  const grant = snapshot.state.grants.find(candidate => candidate.grantId === grantId);
  const requests = snapshot.state.requests.filter(candidate => candidate.grantId === grantId);
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
 * Runs one isolated, synthetic, mock-only service-credit scenario. It opens no
 * listener or network client and returns only a fixed aggregate result.
 */
export async function runServiceCreditMockDemo() {
  if (arguments.length !== 0) failDemo();

  let ownership = null;
  let store = null;
  const protectedStrings = [];
  let operationPassed = false;
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
          profileId: 'authority.mock.demo',
          profileVersion: 1,
          verifierVersion: 1,
          recordDigest: AUTHORITY_RECORD_DIGEST,
        },
        now: () => NOW,
      },
      execute: () => {
        executionCount += 1;
        return { resultCode: 'service.demo.completed' };
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

    const requestA = signedServiceRequest(capability, grantId, 'request.demo.a');
    const requestB = signedServiceRequest(capability, grantId, 'request.demo.b');
    const requestC = signedServiceRequest(capability, grantId, 'request.demo.c');
    for (const request of [requestA, requestB, requestC]) {
      protectedStrings.push(request.signature, request.proofText, request.authorization);
    }

    const first = await exchange(owner.handle, requestA.authorization);
    revisions.afterFirst = store.load().revision;
    const replay = await exchange(owner.handle, requestA.authorization);
    revisions.afterReplay = store.load().revision;
    const second = await exchange(owner.handle, requestB.authorization);
    revisions.afterSecond = store.load().revision;
    const third = await exchange(owner.handle, requestC.authorization);
    revisions.afterThird = store.load().revision;
    for (const response of [first, replay, second, third]) assertSuccessfulResponse(response);
    expect(first.statusCode === replay.statusCode);
    expect(canonicalJson(first.headers) === canonicalJson(replay.headers));
    expect(first.body.equals(replay.body));
    validateFinalState(store, grantId, settlementCalls, facilitator, executionCount, revisions);
    expect(Object.isFrozen(SUMMARY) && Reflect.ownKeys(SUMMARY).length === SUMMARY_KEYS.length);
    expect(SUMMARY_KEYS.every(key => Object.hasOwn(SUMMARY, key)));
    operationPassed = true;
  } catch {
    operationPassed = false;
  } finally {
    const cleanupPassed = cleanupOwnedDirectory(ownership, store, protectedStrings);
    protectedStrings.fill('');
    if (!cleanupPassed) operationPassed = false;
  }
  if (!operationPassed) failDemo();
  return SUMMARY;
}
