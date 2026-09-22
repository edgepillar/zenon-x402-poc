import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {
  createHash,
  generateKeyPairSync,
  sign,
  X509Certificate,
} from 'node:crypto';
import {
  accessSync,
  chmodSync,
  constants as fsConstants,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { EventEmitter } from 'node:events';
import { request as httpsRequest } from 'node:https';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodeTest from 'node:test';
import { connect as connectTls } from 'node:tls';
import * as sdk from 'znn-typescript-sdk';

import { canonicalJson, paymentIntentDigest } from '../src/canonical.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';
import {
  createServiceCreditCapabilitySigningBytes,
  deriveServiceCreditCapabilityCommitment,
} from '../src/service-credit-capability.js';
import {
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION,
  createServiceCreditExternalHolderGrantDescriptorSigningBytes,
} from '../src/service-credit-external-holder-grant-descriptor-handoff.js';
import {
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES,
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_PAIRS,
} from '../src/service-credit-external-holder-grant-descriptor-handoff-http.js';
import {
  SERVICE_CREDIT_HTTP_PATH,
  SERVICE_CREDIT_HTTP_ROUTE_ID,
} from '../src/service-credit-http.js';
import { SERVICE_CREDIT_MODEL_VERSION } from '../src/service-credit-model.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import {
  createServiceCreditZenonFundingIntakeHttpsOwnerV1,
} from '../src/service-credit-zenon-funding-intake-https-owner-v1.js';
import {
  createServiceCreditZenonFundingPostV1Client,
  ZENON_FUNDING_POST_V1_CLIENT_CODES,
} from '../src/service-credit-zenon-funding-post-v1-client.js';
import {
  createZenonFundingComposition,
} from '../src/service-credit-zenon-funding-composition.js';
import {
  createZenonFundingIntakeSqliteStore,
  deriveZenonFundingIntakeSelectionKey,
  openZenonFundingIntakeSqliteStore,
} from '../src/service-credit-zenon-funding-intake-sqlite-store.js';
import {
  createZenonFundingObservationProducer,
} from '../src/service-credit-zenon-funding-observation-producer.js';
import {
  openZenonFundingObserverSqliteStore,
} from '../src/service-credit-zenon-funding-observer-sqlite-store.js';
import {
  createZenonFundingProviderAttestationSigningBytes,
  parseZenonFundingProviderAttestationAuthorityRecord,
} from '../src/service-credit-zenon-funding-provider-attestation.js';
import {
  createZenonFundingPublicationBridge,
} from '../src/service-credit-zenon-funding-publication-bridge.js';
import {
  createServiceCreditZenonHttpsOperatorPilot,
} from '../src/service-credit-zenon-https-operator-pilot.js';
import {
  DELIVERY_STATES,
  EVIDENCE_STATES,
  SettlementJournal,
} from '../src/settlement-journal.js';
import {
  computeBlockHash,
  ExactZenonFacilitator,
  preflightZenonPayment,
} from '../src/zenon-payment.js';
import { decodeB64Json, HEADERS } from '../src/x402-wire.js';

// This file is a test-only offline acceptance slice. Payment and provider
// signatures are disposable synthetic fixtures. The synthetic node replaces
// every SDK capability before publication. Nothing here is a production signer,
// authenticated node, canonical-chain observation, finality proof, live payment,
// wallet operation, or permission to mount either HTTPS owner.
const NOW = 2_200_000_000_000;
const ATTESTATION_NOW = 2_200_000_000;
const ORIGIN = 'https://127.0.0.1';
const RESOURCE_URL = `${ORIGIN}${SERVICE_CREDIT_HTTP_PATH}`;
const HANDOFF_CHALLENGE_TARGET = '/acceptance/grant-descriptor/challenge';
const HANDOFF_REDEMPTION_TARGET = '/acceptance/grant-descriptor/redeem';
const LEDGER_DOMAIN = 'service-credit-zenon-https-funding-to-service-offline-v1';
const OPENSSL = '/usr/bin/openssl';
const EMPTY_BODY_DIGEST = `sha256:${createHash('sha256').update(Buffer.alloc(0)).digest('hex')}`;
const CLEANUP_DEADLINE_MS = 8_000;
const CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: createHash('sha256').update('acceptance-genesis').digest('hex'),
});

function fixedFailure(stage) {
  const code = `SERVICE_CREDIT_ZENON_HTTPS_FUNDING_TO_SERVICE_OFFLINE_TEST_FAILED_${stage}`;
  const error = new Error(code);
  error.stack = `Error: ${code}`;
  return error;
}

function test(name, run) {
  return nodeTest(name, { concurrency: false }, async t => {
    let stage = 'SETUP';
    try {
      await run(t, next => { stage = next; });
    } catch {
      throw fixedFailure(stage);
    }
  });
}

function createTestCleanup(t) {
  const owners = [];
  const nativeHandles = new Map();
  const timers = new Set();
  const stores = new Map();
  const directories = new Set();
  const fixturePaths = new Set();
  const buffers = new Set();
  const restorers = new Set();
  const deadlineGroups = new Set();
  const events = [];
  let cleanupOperation = null;

  function ownerRecord(owner) {
    return owners.find(record => record.owner === owner) ?? null;
  }

  function retainOwner(owner, {
    port = null,
    exactCloseResult = () => true,
    protectsDurableState = true,
  } = {}) {
    owners.push({
      owner,
      port,
      exactCloseResult,
      protectsDurableState,
      ownedStores: [],
      operation: null,
      settled: false,
      closeOutcome: 'PENDING',
      custodyReleased: false,
    });
    return owner;
  }

  function setOwnerStores(owner, ownedStores) {
    const record = ownerRecord(owner);
    if (record === null || record.settled) throw fixedFailure('CLEANUP_OWNER_CUSTODY');
    record.ownedStores = [...ownedStores];
  }

  function retainStore(store) {
    stores.set(store, { closed: false });
    return store;
  }

  function markStoreClosed(store) {
    const record = stores.get(store);
    if (record === undefined || record.closed) return;
    record.closed = true;
    events.push('STORE_CLOSED_BY_OWNER');
  }

  function closeStore(store) {
    const record = stores.get(store);
    if (record === undefined || record.closed) return;
    try {
      store.close();
    } finally {
      record.closed = true;
      events.push('STORE_CLOSE');
    }
  }

  function closeOwner(owner) {
    const record = ownerRecord(owner);
    if (record === null) throw fixedFailure('CLEANUP_OWNER_UNKNOWN');
    if (record.operation !== null) return record.operation;
    events.push('OWNER_CLOSE_START');
    let returned;
    try {
      returned = owner.close();
    } catch (error) {
      returned = Promise.reject(error);
    }
    record.operation = Promise.resolve(returned).then(
      value => {
        record.settled = true;
        events.push('OWNER_CLOSE_SETTLED');
        let exact = false;
        try { exact = record.exactCloseResult(value) === true; } catch {}
        record.closeOutcome = exact ? 'EXACT' : 'NON_EXACT';
        if (exact) {
          record.custodyReleased = true;
          for (const store of record.ownedStores) markStoreClosed(store);
        }
        return value;
      },
      error => {
        record.settled = true;
        record.closeOutcome = 'REJECTED';
        events.push('OWNER_CLOSE_SETTLED');
        throw error;
      },
    );
    record.operation.catch(() => undefined);
    return record.operation;
  }

  function confirmCustodyReleased(owner, verify) {
    const record = ownerRecord(owner);
    if (
      record === null
      || !record.settled
      || !['REJECTED', 'NON_EXACT'].includes(record.closeOutcome)
      || typeof verify !== 'function'
    ) throw fixedFailure('CLEANUP_CUSTODY_PROOF');
    let proof;
    try { proof = verify(); } catch { throw fixedFailure('CLEANUP_CUSTODY_PROOF'); }
    let statusDescriptor;
    try { statusDescriptor = Object.getOwnPropertyDescriptor(proof, 'status'); }
    catch { throw fixedFailure('CLEANUP_CUSTODY_PROOF'); }
    if (
      Object.getPrototypeOf(proof) !== null
      || !Object.isFrozen(proof)
      || Reflect.ownKeys(proof).length !== 1
      || statusDescriptor?.value !== 'DURABLE_CUSTODY_RELEASED'
      || statusDescriptor.writable !== false
      || statusDescriptor.enumerable !== true
      || statusDescriptor.configurable !== false
    ) throw fixedFailure('CLEANUP_CUSTODY_PROOF');
    record.custodyReleased = true;
    events.push('OWNER_CUSTODY_RELEASED');
  }

  function retainNativeHandle(handle, {
    kind = 'HANDLE',
    initiateClose = value => value.destroy(),
  } = {}) {
    if (nativeHandles.has(handle)) return handle;
    let resolveClosed;
    const closed = new Promise(resolve => { resolveClosed = resolve; });
    const record = {
      handle,
      kind,
      initiateClose,
      closeInitiated: false,
      closed: false,
      closedPromise: closed,
    };
    nativeHandles.set(handle, record);
    handle.once('close', () => {
      if (record.closed) return;
      record.closed = true;
      events.push('NATIVE_HANDLE_CLOSED');
      resolveClosed();
    });
    return handle;
  }

  function initiateNativeClose(record) {
    if (record.closed || record.closeInitiated) return;
    record.closeInitiated = true;
    events.push('NATIVE_CLOSE_START');
    try { record.initiateClose(record.handle); } catch {}
  }

  function observeBounded(operation) {
    return new Promise(resolve => {
      let settled = false;
      let timer = null;
      const finish = result => {
        if (settled) return;
        settled = true;
        if (timer !== null) {
          clearTimeout(timer);
          timers.delete(timer);
        }
        resolve(result);
      };
      timer = setTimeout(() => finish('TIMEOUT'), CLEANUP_DEADLINE_MS);
      timers.add(timer);
      Promise.resolve(operation).then(
        () => finish('FULFILLED'),
        () => finish('REJECTED'),
      );
    });
  }

  const resources = {
    retainOwner,
    setOwnerStores,
    closeOwner,
    confirmCustodyReleased,
    retainStore,
    closeStore,
    markStoreClosed,
    retainNativeHandle,
    retainClient(client) {
      return retainNativeHandle(client, { kind: 'CLIENT' });
    },
    retainResponse(response) {
      return retainNativeHandle(response, { kind: 'RESPONSE' });
    },
    retainServer(server) {
      return retainNativeHandle(server, {
        kind: 'SERVER',
        initiateClose: value => value.close(),
      });
    },
    retainTimer(timer) { timers.add(timer); return timer; },
    releaseTimer(timer) { timers.delete(timer); },
    retainDirectory(directory) { directories.add(directory); return directory; },
    retainFixturePath(path) { fixturePaths.add(path); return path; },
    retainBuffer(buffer) { buffers.add(buffer); return buffer; },
    retainRestorer(restorer) { restorers.add(restorer); return restorer; },
    retainDeadlineGroup(group) { deadlineGroups.add(group); return group; },
    snapshot() {
      return Object.freeze({
        unsettledOwners: owners.filter(record => !record.settled).length,
        clients: [...nativeHandles.values()].filter(
          record => record.kind === 'CLIENT' && !record.closed,
        ).length,
        servers: [...nativeHandles.values()].filter(
          record => record.kind === 'SERVER' && !record.closed,
        ).length,
        nativeHandles: [...nativeHandles.values()].filter(record => !record.closed).length,
        timers: timers.size,
        openStores: [...stores.values()].filter(record => !record.closed).length,
        directories: directories.size,
        ownerOutcomes: Object.freeze(owners.map(record => record.closeOutcome)),
        events: Object.freeze([...events]),
      });
    },
    cleanup() {
      if (cleanupOperation !== null) return cleanupOperation;
      cleanupOperation = (async () => {
        let failed = false;
        let unsafe = false;
        const closeOperations = [];

        for (const record of [...owners].reverse()) {
          closeOperations.push({ record, operation: closeOwner(record.owner) });
        }
        for (const record of nativeHandles.values()) initiateNativeClose(record);
        for (const record of nativeHandles.values()) {
          const outcome = await observeBounded(record.closedPromise);
          if (outcome !== 'FULFILLED') unsafe = true;
        }

        for (const { record, operation } of closeOperations) {
          const outcome = await observeBounded(operation);
          if (outcome === 'TIMEOUT') unsafe = true;
          if (record.port !== null && outcome !== 'TIMEOUT') {
            const released = await observeBounded(provePortReleased(record.port, resources));
            if (released !== 'FULFILLED') unsafe = true;
          }
          if (record.protectsDurableState && !record.custodyReleased) unsafe = true;
        }

        for (const restore of restorers) {
          try { restore(); } catch { failed = true; }
        }
        restorers.clear();

        if (!unsafe) {
          for (const store of stores.keys()) {
            try { closeStore(store); } catch { failed = true; }
          }
        }
        for (const group of deadlineGroups) {
          if (!group.empty()) failed = true;
        }
        for (const timer of timers) clearTimeout(timer);
        timers.clear();

        if (!unsafe) {
          for (const buffer of buffers) buffer.fill(0);
          buffers.clear();
          for (const directory of directories) {
            try { rmSync(directory, { recursive: true, force: true }); }
            catch { failed = true; }
            if (existsSync(directory)) failed = true;
            else events.push('FIXTURE_REMOVE');
          }
          directories.clear();
          fixturePaths.clear();
        }

        if (unsafe || failed) throw fixedFailure('CLEANUP');
      })().catch(error => {
        cleanupOperation = null;
        throw error;
      });
      cleanupOperation.catch(() => undefined);
      return cleanupOperation;
    },
  };

  t.after(async () => resources.cleanup());
  return resources;
}

function codeIs(expected) {
  return error => {
    try { return Object.getOwnPropertyDescriptor(error, 'code')?.value === expected; }
    catch { return false; }
  };
}

function assertFrozenStatus(value, status) {
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.deepEqual(Reflect.ownKeys(value), ['status']);
  assert.deepEqual(Object.getOwnPropertyDescriptor(value, 'status'), {
    value: status,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  assert.equal(Object.isFrozen(value), true);
}

function assertFrozenNullStatus(value, status) {
  assert.equal(Object.getPrototypeOf(value), null);
  assert.deepEqual(Reflect.ownKeys(value), ['status']);
  assert.deepEqual(Object.getOwnPropertyDescriptor(value, 'status'), {
    value: status,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  assert.equal(Object.isFrozen(value), true);
}

function durableCustodyReleaseProof() {
  const proof = Object.create(null);
  Object.defineProperty(proof, 'status', {
    value: 'DURABLE_CUSTODY_RELEASED',
    writable: false,
    enumerable: true,
    configurable: false,
  });
  return Object.freeze(proof);
}

function digest(label) {
  return `sha256:${createHash('sha256').update(`funding-to-service:${label}`).digest('hex')}`;
}

function keyMaterial() {
  const pair = generateKeyPairSync('ed25519');
  const encoded = pair.publicKey.export({ format: 'der', type: 'spki' });
  return Object.freeze({
    privateKey: pair.privateKey,
    publicKey: encoded.subarray(-32).toString('base64url'),
  });
}

const PROVIDER_KEYS = keyMaterial();
const WRONG_PROVIDER_KEYS = keyMaterial();
const CAPABILITY_KEYS = keyMaterial();
const AUTHORITY_RECORD = canonicalJson({
  authorityRecordVersion: 1,
  authorityProfileId: 'zenon.provider-attestation',
  authorityProfileVersion: 1,
  verifierVersion: 1,
  providerAuthorityId: 'provider.funding-to-service.offline',
  generationId: 'provider.funding-to-service.offline.generation',
  generationVersion: 1,
  keyId: 'provider.funding-to-service.offline.key',
  algorithm: 'Ed25519',
  publicKey: PROVIDER_KEYS.publicKey,
  network: 'zenon:testnet',
  chainProfile: CHAIN_PROFILE,
  observerPolicy: {
    policyId: 'zenon.injected-observer',
    policyVersion: 1,
    verifierVersion: 1,
  },
  confirmationPolicy: {
    policyId: 'zenon.authenticated-momentum-inclusion',
    policyVersion: 1,
    minimumConfirmations: 3,
  },
  bootstrapCheckpoint: {
    height: 10,
    hash: createHash('sha256').update('acceptance-momentum-10').digest('hex'),
  },
  sourcePolicyCommitment: digest('source-policy'),
  maximumAttestationBytes: 4096,
  maximumCanonicalBytes: 524288,
  maximumInitialAgeSeconds: 300,
  maximumFutureSkewSeconds: 5,
  maximumValiditySeconds: 300,
});
const AUTHORITY = parseZenonFundingProviderAttestationAuthorityRecord(AUTHORITY_RECORD);

function syntheticIdentity(byte) {
  const key = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, byte));
  try {
    return Object.freeze({
      address: key.getAddress().toString(),
      publicKey: key.getPublicKey().toString('base64url'),
    });
  } finally {
    key.clear();
  }
}

const PAYER = syntheticIdentity(17);
const PAYEE = syntheticIdentity(18);

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const SOURCE_BINDING = deepFreeze({
  sourcePolicyCommitment: AUTHORITY.sourcePolicyCommitment,
  authorityGeneration: structuredClone(AUTHORITY.authorityGeneration),
  chainProfile: structuredClone(AUTHORITY.chainProfile),
  bootstrapCheckpoint: structuredClone(AUTHORITY.bootstrapCheckpoint),
});

function selection() {
  return {
    offerId: 'offer.funding-to-service.offline',
    offerVersion: 1,
    holderId: PAYER.address,
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({
      publicKey: CAPABILITY_KEYS.publicKey,
    }),
  };
}

function offer() {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.funding-to-service.offline',
    serviceId: 'service.funding-to-service.offline',
    resourceId: 'resource.funding-to-service.offline',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.funding-to-service.offline',
      resourceUrl: RESOURCE_URL,
    }),
    offerId: selection().offerId,
    offerVersion: 1,
    costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.funding-to-service.offline',
    fundingPolicyVersion: 1,
  };
}

function fundingTerms(input) {
  return {
    fundingPolicyId: input.offer.fundingPolicyId,
    fundingPolicyVersion: input.offer.fundingPolicyVersion,
    totalUnits: 10,
    expiresAt: NOW + 60_000,
    requirement: {
      scheme: 'exact',
      network: 'zenon:testnet',
      asset: sdk.ZNN_ZTS.toString(),
      amount: '1',
      payTo: PAYEE.address,
      maxTimeoutSeconds: 30,
      extra: {
        paymentFlow: 'upfront',
        poc: true,
        settlement: 'account-block',
        zenonChain: structuredClone(CHAIN_PROFILE),
        minimumMomentumConfirmations: AUTHORITY.confirmationPolicy.minimumConfirmations,
      },
    },
  };
}

function createWorkspace(resources) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'funding-to-service-offline-')));
  chmodSync(directory, 0o700);
  return resources.retainDirectory(directory);
}

function tlsMaterial(directory, resources) {
  const binary = lstatSync(OPENSSL);
  assert.equal(binary.isFile() && binary.uid === 0 && (binary.mode & 0o022) === 0, true);
  accessSync(OPENSSL, fsConstants.X_OK);
  const configurationPath = join(directory, 'tls.cnf');
  const keyPath = join(directory, 'tls-key.pem');
  const certificatePath = join(directory, 'tls-cert.pem');
  resources.retainFixturePath(configurationPath);
  resources.retainFixturePath(keyPath);
  resources.retainFixturePath(certificatePath);
  writeFileSync(
    configurationPath,
    '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=v3_req\n'
      + '[dn]\nCN=127.0.0.1\n'
      + '[v3_req]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=CA:FALSE\n'
      + 'keyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n',
    { encoding: 'utf8', mode: 0o600, flag: 'wx' },
  );
  const generated = childProcess.spawnSync(OPENSSL, [
    'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
    '-sha256', '-nodes', '-days', '1', '-keyout', keyPath, '-out', certificatePath,
    '-config', configurationPath, '-extensions', 'v3_req',
  ], {
    env: {}, encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024,
  });
  assert.equal(generated.status, 0, 'SYNTHETIC_TLS_GENERATION_FAILED');
  assert.equal(generated.error, undefined, 'SYNTHETIC_TLS_GENERATION_FAILED');
  const key = readFileSync(keyPath);
  const cert = readFileSync(certificatePath);
  assert.equal(new X509Certificate(cert).checkIP('127.0.0.1'), '127.0.0.1');
  resources.retainBuffer(key);
  resources.retainBuffer(cert);
  return Object.freeze({ key, cert });
}

function reserveLoopbackPort(resources) {
  const server = createNetServer();
  resources?.retainServer(server);
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      try { server.close(); } catch {}
      reject(fixedFailure('LOOPBACK_RESERVATION'));
    };
    server.once('error', fail);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = server.address();
      if (address === null || typeof address !== 'object' || address.port < 1) {
        fail();
        return;
      }
      server.close(error => {
        if (settled) return;
        if (error !== undefined) { fail(); return; }
        settled = true;
        resolve(address.port);
      });
    });
  });
}

function provePortReleased(port, resources) {
  const server = createNetServer();
  resources?.retainServer(server);
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      try { server.close(); } catch {}
      reject(fixedFailure('LOOPBACK_RELEASE'));
    };
    server.once('error', fail);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close(error => {
        if (settled) return;
        if (error !== undefined) { fail(); return; }
        settled = true;
        resolve();
      });
    });
  });
}

function deadlineRuntime(resources) {
  const handles = new Set();
  return Object.freeze({
    runtime: Object.freeze({
      schedule: Object.freeze((callback, milliseconds) => {
        let handle = null;
        handle = setTimeout(() => {
          handles.delete(handle);
          resources?.releaseTimer(handle);
          callback();
        }, milliseconds);
        handles.add(handle);
        resources?.retainTimer(handle);
        return handle;
      }),
      cancel: Object.freeze(handle => {
        clearTimeout(handle);
        handles.delete(handle);
        resources?.releaseTimer(handle);
        return true;
      }),
    }),
    empty: () => handles.size === 0,
  });
}

function durableDeadlineRuntime() {
  return Object.freeze({
    monotonicNowNs: Object.freeze(() => 0n),
    schedule: Object.freeze(() => Object.freeze({})),
    cancel: Object.freeze(() => undefined),
  });
}

function httpsExchange({ port, cert, resources }, {
  path = SERVICE_CREDIT_HTTP_PATH,
  method = 'POST',
  body = Buffer.alloc(0),
  headers = {},
} = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    let client = null;
    const fail = () => {
      if (settled) return;
      settled = true;
      try { client?.destroy(); } catch {}
      reject(fixedFailure('HTTPS_EXCHANGE'));
    };
    client = httpsRequest({
      hostname: '127.0.0.1', port, path, method, agent: false,
      ca: cert, rejectUnauthorized: true, ALPNProtocols: ['http/1.1'],
      headers: {
        Host: '127.0.0.1',
        'Content-Length': String(body.length),
        Connection: 'close',
        ...headers,
      },
    }, response => {
      resources?.retainResponse(response);
      response.on('data', chunk => chunks.push(chunk));
      response.once('error', fail);
      response.once('aborted', fail);
      response.once('end', () => {
        if (settled) return;
        settled = true;
        resolve(Object.freeze({
          statusCode: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks),
        }));
      });
    });
    resources?.retainClient(client);
    client.setTimeout(5_000, fail);
    client.once('error', fail);
    client.end(body);
  });
}

function fundingClientTransport({ port, cert, resources, calls, captureSocket }) {
  return (url, options) => new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); }
    catch { reject(fixedFailure('FUNDING_CLIENT_TRANSPORT')); return; }
    if (
      url !== RESOURCE_URL
      || parsed.protocol !== 'https:'
      || parsed.hostname !== '127.0.0.1'
      || parsed.port !== ''
      || parsed.pathname !== SERVICE_CREDIT_HTTP_PATH
      || parsed.search !== ''
      || parsed.hash !== ''
      || options?.method !== 'POST'
      || options?.redirect !== 'manual'
      || options?.cache !== 'no-store'
      || options?.credentials !== 'omit'
    ) {
      reject(fixedFailure('FUNDING_CLIENT_TRANSPORT'));
      return;
    }

    let headers;
    try { headers = Object.fromEntries(Object.entries(options.headers)); }
    catch { reject(fixedFailure('FUNDING_CLIENT_TRANSPORT')); return; }
    const paymentSignature = headers['PAYMENT-SIGNATURE'];
    if (
      headers['Content-Length'] !== '0'
      || (
        paymentSignature !== undefined
        && (typeof paymentSignature !== 'string' || paymentSignature.length === 0)
      )
    ) {
      reject(fixedFailure('FUNDING_CLIENT_TRANSPORT'));
      return;
    }
    calls.push(Object.freeze({
      logicalOriginPinned: true,
      mappedToEphemeralLoopback: Number.isSafeInteger(port) && port > 0,
      zeroBodyPost: true,
      paymentAttached: paymentSignature !== undefined,
      redirectManual: true,
      cacheDisabled: true,
      credentialsOmitted: true,
    }));
    headers.Host = parsed.host;
    headers.Connection = 'close';

    let request;
    let requestClosed = false;
    let socketObserved = false;
    let socketClosed = false;
    let terminalError = null;
    let responseValue = null;
    let settled = false;
    const finish = () => {
      if (
        settled
        || !requestClosed
        || (socketObserved && !socketClosed)
        || (terminalError === null && responseValue === null)
      ) return;
      settled = true;
      if (terminalError !== null) reject(terminalError);
      else resolve(responseValue);
    };
    const fail = () => {
      if (terminalError === null) terminalError = fixedFailure('FUNDING_CLIENT_TRANSPORT');
      finish();
    };

    try {
      request = httpsRequest({
        hostname: '127.0.0.1',
        port,
        path: parsed.pathname,
        method: options.method,
        ca: cert,
        rejectUnauthorized: true,
        agent: false,
        ALPNProtocols: ['http/1.1'],
        headers,
        signal: options.signal,
      }, response => {
        resources.retainResponse(response);
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.once('error', fail);
        response.once('aborted', fail);
        response.once('end', () => {
          const bytes = Buffer.concat(chunks);
          responseValue = Object.freeze({
            status: response.statusCode,
            url,
            redirected: false,
            headers: new Headers(response.headers),
            body: new Response(bytes).body,
          });
          finish();
        });
      });
    } catch {
      reject(fixedFailure('FUNDING_CLIENT_TRANSPORT'));
      return;
    }
    resources.retainClient(request);
    request.once('socket', socket => {
      socketObserved = true;
      resources.retainClient(socket);
      captureSocket(socket);
      socket.once('close', () => {
        socketClosed = true;
        finish();
      });
    });
    request.once('error', fail);
    request.once('close', () => {
      requestClosed = true;
      if (!socketObserved) socketClosed = true;
      finish();
    });
    request.end();
  });
}

function rawTlsWriteUntilClose({ port, cert, resources }, requestText, capture) {
  return new Promise(resolve => {
    const socket = connectTls({
      host: '127.0.0.1', port, ca: cert, rejectUnauthorized: true,
      ALPNProtocols: ['http/1.1'], servername: '',
    });
    resources?.retainClient(socket);
    capture(socket);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    socket.once('error', finish);
    socket.once('close', finish);
    socket.once('secureConnect', () => socket.write(requestText));
    socket.setTimeout(5_000, () => socket.destroy());
  });
}

let paymentSignatureCount = 0;
function syntheticSignedPayment(paymentRequired, variation = 1) {
  const key = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 17));
  try {
    const accepted = paymentRequired.accepts[0];
    const block = sdk.AccountBlockTemplate.send(
      sdk.Address.parse(accepted.payTo),
      sdk.TokenStandard.parse(accepted.asset),
      BigInt(accepted.amount),
    );
    block.chainIdentifier = Number(CHAIN_PROFILE.chainIdentifier);
    block.address = key.getAddress();
    block.height = 1;
    block.momentumAcknowledged = new sdk.HashHeight(
      sdk.Hash.digest(Buffer.from(`acceptance-acknowledged-${variation}`)),
      1,
    );
    block.data = Buffer.from(paymentIntentDigest(paymentRequired, accepted), 'hex');
    block.nonce = '0000000000000000';
    block.publicKey = key.getPublicKey();
    block.hash = computeBlockHash(block, sdk);
    paymentSignatureCount += 1;
    block.signature = key.sign(block.hash.getBytes());
    return {
      x402Version: paymentRequired.x402Version,
      resource: structuredClone(paymentRequired.resource),
      accepted: structuredClone(accepted),
      payload: {
        transaction: block.toJson(),
        intentDigest: paymentIntentDigest(paymentRequired, accepted),
      },
    };
  } finally {
    key.clear();
  }
}

function paymentHeader(payment) {
  return Buffer.from(JSON.stringify(payment), 'utf8').toString('base64');
}

function fundingOwnerConfiguration(context, port, deadlines) {
  return Object.freeze({
    transport: Object.freeze({
      origin: ORIGIN,
      bind: Object.freeze({ host: '127.0.0.1', port, exclusive: true }),
      tlsMaterial: Object.freeze({ key: context.tls.key, cert: context.tls.cert }),
      generation: Object.freeze({
        generationId: 'funding-to-service.offline.funding',
        generationVersion: 1,
      }),
      limits: Object.freeze({
        maxHeaderBytes: 16 * 1024,
        maxHeaderCount: 128,
        maxConcurrentSockets: 8,
        maxConnectionStarts: 128,
        maxConcurrentRequests: 8,
        maxRequestStarts: 96,
        tlsHandshakeDeadlineMs: 2_000,
        headerDeadlineMs: 2_000,
        requestResponseDeadlineMs: 4_000,
        idleSocketDeadlineMs: 5_000,
        startDeadlineMs: 3_000,
        closeGraceMs: 6_000,
        metricsCounterLimit: 10_000,
      }),
      deadlineRuntime: deadlines.runtime,
    }),
    funding: Object.freeze({
      store: context.intakeStore,
      serviceCreditStore: context.serviceStore,
      authorityRecord: AUTHORITY_RECORD,
      deriveFundingTerms: context.policy,
      now: Object.freeze(() => NOW),
      observerRoot: context.directory,
      observerCatchUp: Object.freeze({
        maximumPageEntries: 2,
        maximumBackfillSpan: 8,
        maximumMembersPerMomentum: 4,
      }),
      selection: Object.freeze(selection()),
      resourceUrl: RESOURCE_URL,
    }),
  });
}

async function createBoundContext(t, {
  loseFirstResponse,
  usePublicFundingClient = false,
  stopAfterFirstStart = false,
  stage = () => undefined,
}) {
  const resources = createTestCleanup(t);
  stage('FUNDING_SETUP');
  const directory = createWorkspace(resources);
  stage('FUNDING_TLS');
  const tls = tlsMaterial(directory, resources);
  const serviceConfiguration = {
    databasePath: join(directory, 'service.sqlite'),
    allowedRoot: directory,
    deriveCost: () => 2,
    now: () => NOW,
  };
  const intakeConfiguration = {
    databasePath: join(directory, 'intake.sqlite'),
    allowedRoot: directory,
    ledgerDomain: LEDGER_DOMAIN,
    maxChallenges: 4,
  };
  resources.retainFixturePath(serviceConfiguration.databasePath);
  resources.retainFixturePath(intakeConfiguration.databasePath);
  const selectionKey = deriveZenonFundingIntakeSelectionKey({
    ledgerDomain: LEDGER_DOMAIN,
    selection: selection(),
  });
  let armed = false;
  let firstOwner = null;
  let firstClose = null;
  let clientSocket = null;
  let commitCallbacks = 0;
  let policyCalls = 0;
  stage('FUNDING_SERVICE_STORE');
  let serviceStore = resources.retainStore(
    ServiceCreditSqliteStore.create(serviceConfiguration),
  );
  serviceStore.registerOffer(offer());
  stage('FUNDING_INTAKE_STORE');
  let intakeStore = resources.retainStore(createZenonFundingIntakeSqliteStore({
    ...intakeConfiguration,
    testHooks: {
      afterCommit() {
        if (!armed) return;
        armed = false;
        commitCallbacks += 1;
        clientSocket.destroy();
        firstClose = resources.closeOwner(firstOwner);
      },
    },
  }));
  const context = {
    resources,
    directory,
    tls,
    serviceConfiguration,
    intakeConfiguration,
    selectionKey,
    serviceStore,
    intakeStore,
    observerStore: null,
    node: null,
    bridge: null,
    bridges: [],
    pilot: null,
    deadlines: [],
    policy: Object.freeze(input => {
      policyCalls += 1;
      return fundingTerms(input);
    }),
    get policyCalls() { return policyCalls; },
    row() { return context.intakeStore.loadBySelectionKey(selectionKey); },
    cleanup: resources.cleanup,
  };

  stage('FUNDING_PORT');
  const firstPort = await reserveLoopbackPort(resources);
  const firstDeadlines = resources.retainDeadlineGroup(deadlineRuntime(resources));
  context.deadlines.push(firstDeadlines);
  stage('FUNDING_CONSTRUCT');
  firstOwner = resources.retainOwner(
    createServiceCreditZenonFundingIntakeHttpsOwnerV1(
      fundingOwnerConfiguration(context, firstPort, firstDeadlines),
    ),
    {
      port: firstPort,
      exactCloseResult(value) {
        try { assertFrozenStatus(value, 'CLOSED'); return true; }
        catch { return false; }
      },
    },
  );
  stage('FUNDING_START');
  assertFrozenStatus(await firstOwner.start(), 'LISTENING');
  if (stopAfterFirstStart) return context;
  const initialRoute = Object.freeze({ port: firstPort, cert: tls.cert, resources });
  const fundingClientCalls = [];
  let fundingClient = null;
  let retainedChallenge = null;
  let retainedChallengeBytes = null;
  let retainedPaymentHeaderBytes = null;
  stage('FUNDING_CHALLENGE');
  let paymentRequired;
  if (usePublicFundingClient) {
    fundingClient = createServiceCreditZenonFundingPostV1Client(Object.freeze({
      resourceUrl: RESOURCE_URL,
      deadlineMs: 5_000,
      fetchImpl: fundingClientTransport({
        port: firstPort,
        cert: tls.cert,
        resources,
        calls: fundingClientCalls,
        captureSocket(socket) { clientSocket = socket; },
      }),
    }));
    retainedChallenge = await fundingClient.requestChallenge();
    assert.equal(Object.getPrototypeOf(retainedChallenge), null);
    assert.equal(Object.isFrozen(retainedChallenge), true);
    assert.equal(retainedChallenge.status, 'PAYMENT_REQUIRED');
    assert.equal(retainedChallenge.resourceUrl, RESOURCE_URL);
    assert.equal(Object.isFrozen(retainedChallenge.paymentRequired), true);
    paymentRequired = retainedChallenge.paymentRequired;
  } else {
    const challengeResponse = await httpsExchange(initialRoute);
    assert.equal(challengeResponse.statusCode, 402);
    assert.equal(challengeResponse.body.toString('utf8'), 'Payment Required');
    paymentRequired = decodeB64Json(
      challengeResponse.headers[HEADERS.PAYMENT_REQUIRED],
      { maxEncodedBytes: 8192 },
    );
  }
  assert.deepEqual(context.row().issue.challenge.paymentRequired, paymentRequired);
  const initialSignatureCount = paymentSignatureCount;
  const payment = syntheticSignedPayment(paymentRequired);
  const encodedPayment = paymentHeader(payment);
  if (usePublicFundingClient) {
    retainedChallengeBytes = resources.retainBuffer(
      Buffer.from(JSON.stringify(retainedChallenge), 'utf8'),
    );
    retainedPaymentHeaderBytes = resources.retainBuffer(Buffer.from(encodedPayment, 'ascii'));
    assert.equal(retainedChallengeBytes.toString('utf8'), JSON.stringify(retainedChallenge));
    assert.equal(retainedPaymentHeaderBytes.toString('ascii'), encodedPayment);
  }

  stage('FUNDING_BIND');
  if (loseFirstResponse) {
    armed = true;
    if (usePublicFundingClient) {
      await assert.rejects(
        fundingClient.submitAuthorizedPayment(Object.freeze({
          challenge: retainedChallenge,
          paymentSignatureHeader: retainedPaymentHeaderBytes.toString('ascii'),
        })),
        codeIs(ZENON_FUNDING_POST_V1_CLIENT_CODES.outcomeUnknown),
      );
      assert.equal(retainedChallengeBytes.toString('utf8'), JSON.stringify(retainedChallenge));
      assert.equal(retainedPaymentHeaderBytes.toString('ascii'), encodedPayment);
    } else {
      await rawTlsWriteUntilClose(
        initialRoute,
        `POST ${SERVICE_CREDIT_HTTP_PATH} HTTP/1.1\r\n`
          + 'Host: 127.0.0.1\r\n'
          + 'Content-Length: 0\r\n'
          + `PAYMENT-SIGNATURE: ${encodedPayment}\r\n`
          + 'Connection: close\r\n\r\n',
        socket => { clientSocket = socket; },
      );
    }
    assert.equal(commitCallbacks, 1);
    assert.notEqual(firstClose, null);
    await assert.rejects(
      firstClose,
      codeIs('SERVICE_CREDIT_ZENON_FUNDING_INTAKE_HTTPS_OWNER_V1_CLOSE_UNCERTAIN'),
    );
    resources.confirmCustodyReleased(firstOwner, () => {
      const retained = context.row();
      assert.equal(commitCallbacks, 1);
      assert.equal(retained.status, 'BOUND');
      assert.equal(retained.binding.transactionHash, payment.payload.transaction.hash);
      assert.equal(context.intakeStore.loadBound().length, 1);
      return durableCustodyReleaseProof();
    });
    assert.equal(resources.snapshot().ownerOutcomes[0], 'REJECTED');
  } else {
    if (usePublicFundingClient) {
      assertFrozenNullStatus(await fundingClient.submitAuthorizedPayment(Object.freeze({
        challenge: retainedChallenge,
        paymentSignatureHeader: retainedPaymentHeaderBytes.toString('ascii'),
      })), 'BOUND');
    } else {
      const response = await httpsExchange(initialRoute, {
        headers: { 'PAYMENT-SIGNATURE': encodedPayment },
      });
      assert.equal(response.statusCode, 202);
      assert.equal(response.body.toString('utf8'), 'BOUND');
    }
    assertFrozenStatus(await resources.closeOwner(firstOwner), 'CLOSED');
  }
  assert.equal(firstDeadlines.empty(), true);
  await provePortReleased(firstPort, resources);
  assert.equal(context.row().status, 'BOUND');
  assert.equal(context.intakeStore.loadBound().length, 1);
  const originalRow = structuredClone(context.row());

  resources.closeStore(context.intakeStore);
  resources.closeStore(context.serviceStore);
  stage('FUNDING_REOPEN');
  serviceStore = resources.retainStore(ServiceCreditSqliteStore.openExisting(
    serviceConfiguration,
  ));
  intakeStore = resources.retainStore(openZenonFundingIntakeSqliteStore(
    intakeConfiguration,
  ));
  context.serviceStore = serviceStore;
  context.intakeStore = intakeStore;

  const replayPort = await reserveLoopbackPort(resources);
  const replayDeadlines = resources.retainDeadlineGroup(deadlineRuntime(resources));
  context.deadlines.push(replayDeadlines);
  const replayOwner = resources.retainOwner(
    createServiceCreditZenonFundingIntakeHttpsOwnerV1(
      fundingOwnerConfiguration(context, replayPort, replayDeadlines),
    ),
    {
      port: replayPort,
      exactCloseResult(value) {
        try { assertFrozenStatus(value, 'CLOSED'); return true; }
        catch { return false; }
      },
    },
  );
  stage('FUNDING_REPLAY_START');
  assertFrozenStatus(await replayOwner.start(), 'LISTENING');
  stage('FUNDING_REPLAY');
  if (usePublicFundingClient) {
    const recoveredClient = createServiceCreditZenonFundingPostV1Client(Object.freeze({
      resourceUrl: RESOURCE_URL,
      deadlineMs: 5_000,
      fetchImpl: fundingClientTransport({
        port: replayPort,
        cert: tls.cert,
        resources,
        calls: fundingClientCalls,
        captureSocket() {},
      }),
    }));
    const reconstructedChallenge = JSON.parse(retainedChallengeBytes.toString('utf8'));
    const reconstructedPaymentHeader = retainedPaymentHeaderBytes.toString('ascii');
    assert.equal(JSON.stringify(reconstructedChallenge), retainedChallengeBytes.toString('utf8'));
    assert.equal(reconstructedPaymentHeader, encodedPayment);
    assertFrozenNullStatus(await recoveredClient.submitAuthorizedPayment(Object.freeze({
      challenge: reconstructedChallenge,
      paymentSignatureHeader: reconstructedPaymentHeader,
    })), 'BOUND');
  } else {
    const replayResponse = await httpsExchange({
      port: replayPort,
      cert: tls.cert,
      resources,
    }, {
      headers: { 'PAYMENT-SIGNATURE': encodedPayment },
    });
    assert.equal(replayResponse.statusCode, 202);
    assert.equal(replayResponse.body.toString('utf8'), 'BOUND');
  }
  assert.deepEqual(context.row(), originalRow);
  assert.equal(context.intakeStore.loadBound().length, 1);
  assert.equal(policyCalls, 1);
  assert.equal(paymentSignatureCount - initialSignatureCount, 1);
  if (usePublicFundingClient) {
    assert.deepEqual(
      fundingClientCalls.map(call => call.paymentAttached),
      [false, true, true],
    );
    assert.equal(fundingClientCalls.every(call => (
      call.logicalOriginPinned
      && call.mappedToEphemeralLoopback
      && call.zeroBodyPost
      && call.redirectManual
      && call.cacheDisabled
      && call.credentialsOmitted
    )), true);
  }
  assertFrozenStatus(await resources.closeOwner(replayOwner), 'CLOSED');
  assert.equal(replayDeadlines.empty(), true);
  await provePortReleased(replayPort, resources);

  context.paymentRequired = paymentRequired;
  context.payment = payment;
  context.paymentHeader = encodedPayment;
  context.binding = structuredClone(context.row().binding);
  context.activationInput = Object.freeze({
    intent: structuredClone(context.row().issue.challenge.activationIntent),
    paymentRequired: structuredClone(context.row().issue.challenge.paymentRequired),
  });
  stage('FUNDING_PREFLIGHT');
  context.preflight = await preflightZenonPayment(
    payment,
    paymentRequired.accepts[0],
    paymentRequired,
  );
  return context;
}

function accountInfo(address) {
  const token = new sdk.Token(
    'Synthetic', 'SYN', '', 1n, 8, address, sdk.ZNN_ZTS, 1n, false, false, false,
  );
  return new sdk.AccountInfo(address, 0, {
    [sdk.ZNN_ZTS.toString()]: new sdk.BalanceInfoListItem(token, 1n),
  });
}

function observedBlock(transaction) {
  const block = sdk.AccountBlockTemplate.fromJson(transaction);
  block.publicKey = Buffer.from(transaction.publicKey, 'base64');
  block.signature = Buffer.from(transaction.signature, 'base64');
  block.confirmationDetail = {
    numConfirmations: 3,
    momentumHeight: 11,
    momentumHash: sdk.Hash.parse(momentumHash(11)),
    momentumTimestamp: 11,
  };
  return block;
}

function installSyntheticNode(context, mode) {
  const zenon = sdk.Zenon.getInstance();
  const original = {
    initialize: zenon.initialize,
    clearConnection: zenon.clearConnection,
    ledger: zenon.ledger,
    stats: zenon.stats,
    subscribe: zenon.subscribe,
    embedded: zenon.embedded,
    hadClient: Object.hasOwn(zenon, 'client'),
    client: zenon.client,
    chainIdentifier: sdk.Zenon.getChainIdentifier(),
    networkId: sdk.Zenon.getNetworkID(),
  };
  const node = {
    lookups: [],
    unexpectedLookups: 0,
    publications: [],
    frontier: 0,
    unconfirmed: 0,
    published: false,
    include: false,
    mode,
  };
  zenon.initialize = async () => { zenon.client = { synthetic: true }; };
  zenon.clearConnection = () => { zenon.client = undefined; };
  zenon.stats = {
    networkInfo: async () => ({
      numPeers: 1,
      self: { publicKey: 'synthetic-node-key', ip: 'loopback' },
      peers: [],
    }),
    syncInfo: async () => ({
      state: sdk.SyncState.SyncDone,
      currentHeight: 10,
      targetHeight: 10,
    }),
  };
  zenon.embedded = {
    token: { getByZts: async tokenStandard => ({ tokenStandard }) },
  };
  zenon.ledger = {
    getFrontierMomentum: async () => ({
      chainIdentifier: 7,
      height: 10,
      hash: sdk.Hash.parse(momentumHash(10)),
    }),
    getAccountBlockByHash: async requestedHash => {
      const requested = requestedHash.toString();
      if (requested !== context.preflight.transactionHash) {
        node.unexpectedLookups += 1;
        throw fixedFailure('UNEXPECTED_LOOKUP_TARGET');
      }
      node.lookups.push(requested);
      if (node.include || (node.published && node.mode === 'included')) {
        return observedBlock(context.payment.payload.transaction);
      }
      if (node.published && node.mode === 'acknowledged') throw fixedFailure('SOURCE_UNAVAILABLE');
      return null;
    },
    getAccountInfoByAddress: async address => accountInfo(address),
    getFrontierAccountBlock: async () => { node.frontier += 1; return null; },
    getUnconfirmedBlocksByAddress: async () => {
      node.unconfirmed += 1;
      return { count: 0, list: [] };
    },
    publishRawTransaction: async block => {
      const retained = await context.journal.get(
        context.preflight.authorizationKey,
        context.preflight.transactionHash,
      );
      assert.equal(retained.evidenceState, EVIDENCE_STATES.VALIDATED);
      assert.equal(
        canonicalJson(retained.signedAccountBlock),
        canonicalJson(context.payment.payload.transaction),
      );
      node.publications.push(block.toJson());
      node.published = true;
      if (mode === 'unknown') throw fixedFailure('PUBLICATION_AMBIGUITY');
    },
  };
  zenon.subscribe = {
    toAccountBlocksByAddress: async () => ({ onNotification() {} }),
  };
  let restored = false;
  node.restore = () => {
    if (restored) return;
    restored = true;
    zenon.initialize = original.initialize;
    zenon.clearConnection = original.clearConnection;
    zenon.ledger = original.ledger;
    zenon.stats = original.stats;
    zenon.subscribe = original.subscribe;
    zenon.embedded = original.embedded;
    if (original.hadClient) zenon.client = original.client;
    else delete zenon.client;
    sdk.Zenon.setChainID(original.chainIdentifier);
    sdk.Zenon.setNetworkID(original.networkId);
  };
  context.resources.retainRestorer(node.restore);
  context.node = node;
  return node;
}

function createPublicationBridge(context, mode = 'included') {
  context.resources.retainFixturePath(join(context.directory, 'journal'));
  context.journal = new SettlementJournal({
    directory: join(context.directory, 'journal'),
    allowedRoot: context.directory,
    clock: () => new Date(NOW),
  });
  installSyntheticNode(context, mode);
  return nextPublicationBridge(context);
}

function nextPublicationBridge(context) {
  const facilitator = new ExactZenonFacilitator({
    journal: context.journal,
    environment: {
      ZENON_LIVE_ACK: 'I_UNDERSTAND_TESTNET_ONLY',
      ZENON_NETWORK_ID: '3',
      ZENON_RPC_URL: 'ws://rpc.invalid',
    },
    rpcTimeoutMs: 100,
    authenticateChainProfile: async () => structuredClone(CHAIN_PROFILE),
  });
  context.bridge = context.resources.retainOwner(
    createZenonFundingPublicationBridge({
      store: context.intakeStore,
      facilitator,
      selection: selection(),
    }),
    { exactCloseResult: value => value === undefined },
  );
  context.bridges.push(context.bridge);
  return context.bridge;
}

function momentumHash(height) {
  return createHash('sha256').update(`acceptance-momentum-${height}`).digest('hex');
}

function nativeMomentum(height, content = []) {
  return {
    version: 1,
    chainIdentifier: 7,
    hash: momentumHash(height),
    previousHash: momentumHash(height - 1),
    height,
    timestamp: height,
    data: '',
    content,
    changesHash: createHash('sha256').update('acceptance-changes').digest('hex'),
    publicKey: '',
    signature: '',
    producer: PAYEE.address,
  };
}

function observationBatch(context, frontier = 14) {
  const state = context.observerStore.load().state;
  const accountBlock = structuredClone(context.payment.payload.transaction);
  accountBlock.confirmationDetail = {
    numConfirmations: 9999,
    momentumHeight: 11,
    momentumHash: momentumHash(11),
    momentumTimestamp: 11,
  };
  const header = {
    address: accountBlock.address,
    hash: accountBlock.hash,
    height: accountBlock.height,
  };
  const list = [];
  const through = Math.min(frontier, state.checkpoint.height + state.catchUp.maximumPageEntries);
  for (let height = state.checkpoint.height + 1; height <= through; height += 1) {
    list.push(nativeMomentum(height, height === 11 ? [header] : []));
  }
  return {
    checkpoint: nativeMomentum(state.checkpoint.height),
    frontier: nativeMomentum(frontier),
    momentums: { count: list.length, list },
    accountBlock,
    inclusionMomentum: nativeMomentum(11, [header]),
  };
}

function observationInput(context) {
  return Object.freeze({
    expectedRevision: context.observerStore.load().state.revision,
    sourceBinding: SOURCE_BINDING,
    reply: JSON.stringify(observationBatch(context)),
  });
}

function openObservation(context) {
  const row = context.row();
  const databasePath = join(context.directory, row.binding.observerFileName);
  context.resources.retainFixturePath(databasePath);
  context.observerStore = context.resources.retainStore(openZenonFundingObserverSqliteStore({
    databasePath,
    allowedRoot: context.directory,
    expectedRecordKey: row.binding.observerRecordKey,
    authorityRecord: AUTHORITY_RECORD,
  }));
  context.producer = createZenonFundingObservationProducer(Object.freeze({
    fundingObserverStore: context.observerStore,
    authorityRecord: AUTHORITY_RECORD,
    sourceBinding: SOURCE_BINDING,
    limits: deepFreeze({ maximumReplyBytes: 65536, maximumContentHeaders: 4 }),
  }));
  return context.observerStore;
}

function assertExactLookupActivity(context, unexpectedLookups = 0) {
  assert.equal(context.node.lookups.length > 0, true);
  assert.equal(
    context.node.lookups.every(hash => hash === context.preflight.transactionHash),
    true,
  );
  assert.equal(context.node.unexpectedLookups, unexpectedLookups);
}

async function assertWrongHashRejected(context) {
  const exactCount = context.node.lookups.length;
  await assert.rejects(
    sdk.Zenon.getInstance().ledger.getAccountBlockByHash(
      sdk.Hash.digest(Buffer.from('unexpected-funding-target')),
    ),
    error => error?.message
      === 'SERVICE_CREDIT_ZENON_HTTPS_FUNDING_TO_SERVICE_OFFLINE_TEST_FAILED_UNEXPECTED_LOOKUP_TARGET',
  );
  assert.equal(context.node.lookups.length, exactCount);
  assertExactLookupActivity(context, 1);
}

async function publishIncluded(context, stage = () => undefined) {
  stage('PUBLICATION_CONSTRUCT');
  const bridge = createPublicationBridge(context, 'included');
  stage('PUBLICATION_RECOVER');
  assert.deepEqual(await bridge.recover(), { status: 'RECOVERED' });
  stage('PUBLICATION_SETTLE');
  const included = await bridge.settleBound();
  stage('PUBLICATION_RESULT_SHAPE');
  assert.deepEqual(included, {
    status: 'INCLUDED',
    evidenceState: EVIDENCE_STATES.MOMENTUM_INCLUDED,
  });
  stage('PUBLICATION_COUNT');
  assert.equal(context.node.publications.length, 1);
  stage('PUBLICATION_BLOCK');
  assert.deepEqual(context.node.publications[0], context.payment.payload.transaction);
  stage('PUBLICATION_JOURNAL_GET');
  const retained = await context.journal.get(
    context.preflight.authorizationKey,
    context.preflight.transactionHash,
  );
  stage('PUBLICATION_JOURNAL_STATE');
  assert.equal(retained.deliveryState, DELIVERY_STATES.NONE);
  stage('PUBLICATION_JOURNAL_COUNT');
  assert.equal((await context.journal.list()).length, 1);
  stage('PUBLICATION_LOOKUP_TARGET');
  assertExactLookupActivity(context);
  return included;
}

function prepareObservation(context, stage = () => undefined) {
  stage('OBSERVATION_FIRST_APPLY');
  const first = context.producer.apply(observationInput(context));
  const firstReason = context.observerStore.load().state.quarantine?.reason ?? 'NONE';
  stage(`OBSERVATION_FIRST_${first.status}_${first.observerStatus}_${first.outboxStatus}_${firstReason}`);
  assert.equal(first.observerStatus, 'INCLUDED_BELOW_THRESHOLD');
  assert.equal(first.outboxStatus, 'NONE');
  stage('OBSERVATION_SECOND_APPLY');
  const second = context.producer.apply(observationInput(context));
  stage(`OBSERVATION_SECOND_${second.status}_${second.observerStatus}_${second.outboxStatus}`);
  assert.equal(second.observerStatus, 'THRESHOLD_OBSERVED');
  assert.equal(second.outboxStatus, 'PREPARED');
  return context.observerStore.peekPreparedAttestation();
}

function providerEnvelope(request, {
  keys = PROVIDER_KEYS,
  issuedAt = ATTESTATION_NOW,
  validUntil = ATTESTATION_NOW + 120,
} = {}) {
  return {
    envelopeVersion: 1,
    attestationId: request.attestationId,
    keyId: AUTHORITY.keyId,
    issuedAt,
    validUntil,
    signature: sign(
      null,
      createZenonFundingProviderAttestationSigningBytes({ request, issuedAt, validUntil }),
      keys.privateKey,
    ).toString('base64url'),
  };
}

function fundingComposition(context) {
  return createZenonFundingComposition({
    serviceCreditStore: context.serviceStore,
    fundingObserverStore: context.observerStore,
    authorityRecord: AUTHORITY_RECORD,
    deriveFundingTerms: fundingTerms,
    now: () => NOW,
  });
}

function pilotConfiguration(context, port, deadlines, execute) {
  return Object.freeze({
    transport: Object.freeze({
      origin: ORIGIN,
      bind: Object.freeze({ host: '127.0.0.1', port, exclusive: true }),
      tlsMaterial: Object.freeze({ key: context.tls.key, cert: context.tls.cert }),
      generation: Object.freeze({
        generationId: 'funding-to-service.offline.service',
        generationVersion: 1,
      }),
      limits: Object.freeze({
        maxHeaderBytes:
          SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_BYTES,
        maxHeaderCount:
          SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_MAX_RAW_HEADER_PAIRS * 2,
        maxConcurrentSockets: 8,
        maxConnectionStarts: 128,
        maxConcurrentRequests: 8,
        maxRequestStarts: 96,
        tlsHandshakeDeadlineMs: 2_000,
        headerDeadlineMs: 2_000,
        requestResponseDeadlineMs: 4_000,
        idleSocketDeadlineMs: 5_000,
        startDeadlineMs: 3_000,
        closeGraceMs: 6_000,
        metricsCounterLimit: 10_000,
      }),
      deadlineRuntime: deadlines.transport.runtime,
    }),
    routes: Object.freeze({
      serviceCredit: SERVICE_CREDIT_HTTP_PATH,
      handoffChallenge: HANDOFF_CHALLENGE_TARGET,
      handoffRedemption: HANDOFF_REDEMPTION_TARGET,
    }),
    funding: Object.freeze({
      serviceCreditStore: context.serviceStore,
      fundingObserverStore: context.observerStore,
      authorityRecord: AUTHORITY_RECORD,
      deriveFundingTerms: Object.freeze(fundingTerms),
      now: Object.freeze(() => NOW),
      selection: Object.freeze(selection()),
      resourceUrl: RESOURCE_URL,
    }),
    durable: Object.freeze({
      execution: Object.freeze({
        ledgerId: 'ledger.funding-to-service.offline',
        policy: Object.freeze({
          policyId: 'execution.funding-to-service.offline',
          policyVersion: 1,
          maxDurationMs: 1_000,
        }),
        capacity: 8,
        selectedDurationMs: 1_000,
      }),
      execute: Object.freeze(execute),
      deadlineRuntime: durableDeadlineRuntime(),
    }),
    handoff: Object.freeze({
      challengeLifetimeMs: 1_000,
      now: Object.freeze(() => NOW),
      deadlineRuntime: deadlines.handoff.runtime,
      bodyDeadlineMs: 2_000,
      responseDeadlineMs: 2_000,
      closeGraceMs: 3_000,
      metricsCounterLimit: 10_000,
    }),
  });
}

async function startPilot(context, execute) {
  const port = await reserveLoopbackPort(context.resources);
  const deadlines = Object.freeze({
    transport: context.resources.retainDeadlineGroup(deadlineRuntime(context.resources)),
    handoff: context.resources.retainDeadlineGroup(deadlineRuntime(context.resources)),
  });
  context.deadlines.push(deadlines.transport, deadlines.handoff);
  const pilot = context.resources.retainOwner(
    createServiceCreditZenonHttpsOperatorPilot(
      pilotConfiguration(context, port, deadlines, execute),
    ),
    {
      port,
      exactCloseResult(value) {
        try { assertFrozenStatus(value, 'CLOSED'); return true; }
        catch { return false; }
      },
    },
  );
  context.pilot = pilot;
  assertFrozenStatus(await pilot.start(), 'CHALLENGE');
  return Object.freeze({
    pilot,
    port,
    cert: context.tls.cert,
    resources: context.resources,
    deadlines,
  });
}

function parsePublicChallenge(body) {
  const value = JSON.parse(body.toString('utf8'));
  assert.deepEqual(Reflect.ownKeys(value), ['challenge', 'expiresAtMs', 'handoffVersion']);
  assert.equal(
    value.handoffVersion,
    SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION,
  );
  return value;
}

function handoffRedemption(challenge) {
  return {
    challenge,
    publicKey: CAPABILITY_KEYS.publicKey,
    signature: sign(
      null,
      createServiceCreditExternalHolderGrantDescriptorSigningBytes({
        ...challenge,
        origin: ORIGIN,
        selection: selection(),
      }),
      CAPABILITY_KEYS.privateKey,
    ).toString('base64url'),
  };
}

async function obtainGrant(route) {
  const challengeResponse = await httpsExchange(route, {
    path: HANDOFF_CHALLENGE_TARGET,
  });
  assert.equal(challengeResponse.statusCode, 200);
  const challenge = parsePublicChallenge(challengeResponse.body);
  const body = Buffer.from(canonicalJson(handoffRedemption(challenge)), 'utf8');
  const response = await httpsExchange(route, {
    path: HANDOFF_REDEMPTION_TARGET,
    body,
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(response.statusCode, 200);
  const descriptor = JSON.parse(response.body.toString('utf8'));
  assert.deepEqual(Reflect.ownKeys(descriptor), ['capabilityCommitment', 'grantId']);
  assert.equal(descriptor.capabilityCommitment, selection().capabilityCommitment);
  return descriptor;
}

function requestDescription(grantId, requestId) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    grantId,
    requestId,
    method: 'POST',
    routeId: SERVICE_CREDIT_HTTP_ROUTE_ID,
    canonicalBodyDigest: EMPTY_BODY_DIGEST,
    selectedContentType: 'application/json',
    maxCostUnits: 2,
  };
}

function serviceAuthorization(description, grant) {
  const proof = {
    proofVersion: 1,
    grantId: description.grantId,
    requestId: description.requestId,
    publicKey: CAPABILITY_KEYS.publicKey,
    maxCostUnits: description.maxCostUnits,
    signature: sign(
      null,
      createServiceCreditCapabilitySigningBytes(description),
      CAPABILITY_KEYS.privateKey,
    ).toString('base64url'),
  };
  assert.equal(grant.grantId, description.grantId);
  return `ServiceCredit ${Buffer.from(canonicalJson(proof), 'utf8').toString('base64url')}`;
}

function assertNoEconomicAuthority(context) {
  const state = context.serviceStore.load().state;
  assert.equal(state.grants.length, 0);
  assert.equal(state.requests.length, 0);
}

function assertBoundIdentity(context) {
  const row = context.row();
  assert.equal(row.status, 'BOUND');
  assert.equal(row.binding.transactionHash, context.payment.payload.transaction.hash);
  assert.equal(row.binding.authorizationKey, context.preflight.authorizationKey);
  assert.equal(row.binding.payer, PAYER.address);
  assert.equal(row.issue.selection.offerId, selection().offerId);
  assert.equal(row.issue.selection.holderId, selection().holderId);
  assert.equal(
    row.issue.selection.capabilityCommitment,
    selection().capabilityCommitment,
  );
  assert.equal(row.issue.resourceUrl, RESOURCE_URL);
  assert.equal(
    row.binding.observerTarget.transactionId,
    `zenontx:${context.payment.payload.transaction.hash}`,
  );
  assert.equal(row.binding.observerTarget.resourceBinding, offer().resourceBinding);
  assert.equal(row.binding.observerTarget.paymentIntentDigest, `sha256:${context.payment.payload.intentDigest}`);
  assert.deepEqual(row.binding.publication.paymentPayload, context.payment);
  assert.deepEqual(row.binding.publication.paymentRequired, context.paymentRequired);
  assert.deepEqual(row.binding.publication.acceptedRequirement, context.paymentRequired.accepts[0]);
}

function assertPreparedIdentity(context, request) {
  const record = context.observerStore.load();
  assert.deepEqual(record.state.target, context.binding.observerTarget);
  assert.equal(record.recordKey, context.binding.observerRecordKey);
  assert.equal(request.recordKey, record.recordKey);
  assert.equal(request.targetBindingDigest, record.state.targetBindingDigest);
  for (const key of [
    'transactionId', 'payer', 'payee', 'asset', 'amount', 'network',
    'resourceBinding', 'paymentResourceDigest', 'paymentRequirementDigest',
    'paymentIntentDigest', 'offerId', 'offerVersion', 'fundingPolicyId',
    'fundingPolicyVersion', 'capabilityCommitment', 'totalUnits', 'expiresAt',
    'grantFundingCommitment',
  ]) assert.deepEqual(request.unsignedFundingEvidence[key], record.state.target[key]);
}

function reopenServiceAndObserver(context) {
  context.serviceStore = context.resources.retainStore(
    ServiceCreditSqliteStore.openExisting(context.serviceConfiguration),
  );
  const databasePath = join(context.directory, context.binding.observerFileName);
  context.resources.retainFixturePath(databasePath);
  context.observerStore = context.resources.retainStore(openZenonFundingObserverSqliteStore({
    databasePath,
    allowedRoot: context.directory,
    expectedRecordKey: context.binding.observerRecordKey,
    authorityRecord: AUTHORITY_RECORD,
  }));
}

test('partial funding construction cleanup closes the listener before borrowed stores and fixtures', async (t, stage) => {
  const context = await createBoundContext(t, {
    loseFirstResponse: false,
    stopAfterFirstStart: true,
    stage,
  });
  stage('PARTIAL_SETUP_ACTIVE');
  const before = context.resources.snapshot();
  assert.equal(before.unsettledOwners, 1);
  assert.equal(before.openStores, 2);
  assert.equal(before.directories, 1);

  stage('PARTIAL_SETUP_CLEANUP');
  await context.cleanup();
  const after = context.resources.snapshot();
  assert.equal(after.unsettledOwners, 0);
  assert.equal(after.clients, 0);
  assert.equal(after.servers, 0);
  assert.equal(after.timers, 0);
  assert.equal(after.openStores, 0);
  assert.equal(after.directories, 0);
  const ownerSettled = after.events.indexOf('OWNER_CLOSE_SETTLED');
  const firstStoreClose = after.events.indexOf('STORE_CLOSE');
  const fixtureRemove = after.events.indexOf('FIXTURE_REMOVE');
  assert.equal(ownerSettled >= 0, true);
  assert.equal(firstStoreClose > ownerSettled, true);
  assert.equal(fixtureRemove > firstStoreClose, true);
  assert.equal(after.events.filter(event => event === 'STORE_CLOSE').length, 2);
});

test('rejected close withholds durable teardown until custody release and native close are proven', async (t, stage) => {
  const resources = createTestCleanup(t);
  const directory = createWorkspace(resources);
  const markerPath = join(directory, 'recoverable-state');
  writeFileSync(markerPath, 'retained', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  resources.retainFixturePath(markerPath);
  let storeCloseCalls = 0;
  const store = resources.retainStore(Object.freeze({
    close() { storeCloseCalls += 1; },
  }));

  const listener = createNetServer();
  resources.retainServer(listener);
  await new Promise((resolve, reject) => {
    listener.once('error', () => reject(fixedFailure('CUSTODY_LISTENER')));
    listener.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve);
  });
  const address = listener.address();
  assert.equal(address !== null && typeof address === 'object', true);
  const port = address.port;
  let ownerClose = null;
  const owner = resources.retainOwner(Object.freeze({
    close() {
      if (ownerClose !== null) return ownerClose;
      ownerClose = new Promise((resolve, reject) => {
        listener.close(() => reject(fixedFailure('CUSTODY_OWNER_REJECTED')));
      });
      ownerClose.catch(() => undefined);
      return ownerClose;
    },
  }), {
    port,
    exactCloseResult(value) {
      try { assertFrozenStatus(value, 'CLOSED'); return true; }
      catch { return false; }
    },
  });

  stage('CUSTODY_FIRST_CLEANUP');
  let firstCleanupError = null;
  const firstCleanup = resources.cleanup().then(
    () => 'FULFILLED',
    error => { firstCleanupError = error; return 'REJECTED'; },
  );
  assert.equal(await firstCleanup, 'REJECTED');
  assert.equal(
    Object.getOwnPropertyDescriptor(firstCleanupError, 'message')?.value,
    'SERVICE_CREDIT_ZENON_HTTPS_FUNDING_TO_SERVICE_OFFLINE_TEST_FAILED_CLEANUP',
  );
  const withheld = resources.snapshot();
  assert.deepEqual(withheld.ownerOutcomes, ['REJECTED']);
  assert.equal(withheld.nativeHandles, 0);
  assert.equal(withheld.openStores, 1);
  assert.equal(withheld.directories, 1);
  assert.equal(storeCloseCalls, 0);
  assert.equal(existsSync(markerPath), true);
  assert.equal(withheld.events.includes('STORE_CLOSE'), false);
  assert.equal(withheld.events.includes('FIXTURE_REMOVE'), false);

  stage('CUSTODY_RELEASE_PROOF');
  let durableDrainReleased = false;
  durableDrainReleased = true;
  resources.confirmCustodyReleased(owner, () => {
    assert.equal(durableDrainReleased, true);
    return durableCustodyReleaseProof();
  });
  const released = resources.snapshot();
  assert.deepEqual(released.ownerOutcomes, ['REJECTED']);
  assert.equal(released.nativeHandles, 0);
  assert.equal(released.openStores, 1);
  assert.equal(released.directories, 1);
  assert.equal(storeCloseCalls, 0);
  assert.equal(existsSync(markerPath), true);

  stage('NATIVE_CLOSE_PROOF');
  const delayedHandle = new EventEmitter();
  let nativeCloseStarted;
  const nativeCloseStart = new Promise(resolve => { nativeCloseStarted = resolve; });
  delayedHandle.destroy = () => nativeCloseStarted();
  resources.retainNativeHandle(delayedHandle, { kind: 'CLIENT' });
  let secondCleanupSettled = false;
  const secondCleanup = resources.cleanup().then(
    () => { secondCleanupSettled = true; return 'FULFILLED'; },
    () => { secondCleanupSettled = true; return 'REJECTED'; },
  );
  await nativeCloseStart;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(secondCleanupSettled, false);
  const whileNativeOpen = resources.snapshot();
  assert.deepEqual(whileNativeOpen.ownerOutcomes, ['REJECTED']);
  assert.equal(whileNativeOpen.nativeHandles, 1);
  assert.equal(whileNativeOpen.openStores, 1);
  assert.equal(whileNativeOpen.directories, 1);
  assert.equal(storeCloseCalls, 0);
  assert.equal(existsSync(markerPath), true);
  assert.equal(whileNativeOpen.events.includes('STORE_CLOSE'), false);
  assert.equal(whileNativeOpen.events.includes('FIXTURE_REMOVE'), false);
  delayedHandle.emit('close');
  assert.equal(await secondCleanup, 'FULFILLED');
  const completed = resources.snapshot();
  assert.deepEqual(completed.ownerOutcomes, ['REJECTED']);
  assert.equal(completed.nativeHandles, 0);
  assert.equal(completed.openStores, 0);
  assert.equal(completed.directories, 0);
  assert.equal(storeCloseCalls, 1);
  assert.equal(existsSync(markerPath), false);
});

test('real loopback funding converges through retained publication, provider READY, and authenticated service replay', async (t, stage) => {
  const caseSigningBaseline = paymentSignatureCount;
  const context = await createBoundContext(t, {
    loseFirstResponse: true,
    usePublicFundingClient: true,
    stage,
  });
  const retainedSigningCount = caseSigningBaseline + 1;
  assert.equal(paymentSignatureCount, retainedSigningCount);
  try {
    stage('BOUND_IDENTITY');
    assertBoundIdentity(context);
    assertNoEconomicAuthority(context);
    openObservation(context);
    const beforePublicationComposition = fundingComposition(context);
    await assert.rejects(
      beforePublicationComposition.activateCommittedFunding(context.activationInput),
      codeIs('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_NOT_READY'),
    );

    stage('PUBLICATION');
    await publishIncluded(context, stage);
    assert.equal(paymentSignatureCount, retainedSigningCount);
    stage('PUBLICATION_WRONG_HASH_REJECTION');
    await assertWrongHashRejected(context);
    assertNoEconomicAuthority(context);
    const publicationRecord = await context.journal.get(
      context.preflight.authorizationKey,
      context.preflight.transactionHash,
    );
    assert.equal(publicationRecord.transactionHash, context.binding.transactionHash);
    assert.equal(publicationRecord.authorizationKey, context.binding.authorizationKey);
    assert.deepEqual(
      publicationRecord.signedAccountBlock,
      context.binding.publication.paymentPayload.payload.transaction,
    );

    stage('PREPARED');
    const request = prepareObservation(context, stage);
    assert.equal(paymentSignatureCount, retainedSigningCount);
    assertPreparedIdentity(context, request);
    assertNoEconomicAuthority(context);
    assert.equal(context.observerStore.projectCommittedFundingEvidence(), null);
    const preparedComposition = fundingComposition(context);
    await assert.rejects(
      preparedComposition.activateCommittedFunding(context.activationInput),
      codeIs('SERVICE_CREDIT_ZENON_FUNDING_COMPOSITION_NOT_READY'),
    );

    stage('ATTESTATION_REJECTION');
    const preparedSnapshot = canonicalJson(context.observerStore.load());
    await assert.rejects(
      Promise.resolve().then(() => context.observerStore.commitAuthenticatedEnvelope({
        expectedObserverRevision: context.observerStore.load().state.revision,
        expectedOutboxRevision: 1,
        attestationId: request.attestationId,
        envelope: providerEnvelope(request, { keys: WRONG_PROVIDER_KEYS }),
        nowEpochSeconds: ATTESTATION_NOW,
      })),
      codeIs('ZENON_FUNDING_OBSERVER_STORE_ATTESTATION_REJECTED'),
    );
    assert.equal(canonicalJson(context.observerStore.load()), preparedSnapshot);
    await assert.rejects(
      Promise.resolve().then(() => context.observerStore.commitAuthenticatedEnvelope({
        expectedObserverRevision: context.observerStore.load().state.revision,
        expectedOutboxRevision: 1,
        attestationId: request.attestationId,
        envelope: providerEnvelope(request, {
          issuedAt: ATTESTATION_NOW - 200,
          validUntil: ATTESTATION_NOW - 100,
        }),
        nowEpochSeconds: ATTESTATION_NOW,
      })),
      codeIs('ZENON_FUNDING_OBSERVER_STORE_ATTESTATION_REJECTED'),
    );
    assert.equal(canonicalJson(context.observerStore.load()), preparedSnapshot);
    assertNoEconomicAuthority(context);

    stage('READY');
    const committed = context.observerStore.commitAuthenticatedEnvelope({
      expectedObserverRevision: context.observerStore.load().state.revision,
      expectedOutboxRevision: 1,
      attestationId: request.attestationId,
      envelope: providerEnvelope(request),
      nowEpochSeconds: ATTESTATION_NOW,
    });
    assert.equal(committed.disposition, 'READY');
    const verified = context.observerStore.matchReadyFundingEvidence(
      committed.fundingEvidence,
    );
    assert.equal(verified.transactionId, context.binding.observerTarget.transactionId);
    assert.equal(verified.paymentIntentDigest, context.binding.observerTarget.paymentIntentDigest);
    assert.equal(verified.resourceBinding, context.binding.observerTarget.resourceBinding);
    assert.equal(verified.capabilityCommitment, selection().capabilityCommitment);
    assertNoEconomicAuthority(context);

    stage('SERVICE_CHALLENGE');
    assert.equal(context.deadlines.every(value => value.empty()), true);
    let executionCalls = 0;
    const firstPilot = await startPilot(context, () => {
      executionCalls += 1;
      return { resultCode: 'funding-to-service.offline.delivered' };
    });
    const firstRoute = Object.freeze({
      port: firstPilot.port,
      cert: firstPilot.cert,
      resources: context.resources,
    });
    const serviceChallenge = await httpsExchange(firstRoute);
    assert.equal(serviceChallenge.statusCode, 402);
    assert.deepEqual(
      decodeB64Json(serviceChallenge.headers[HEADERS.PAYMENT_REQUIRED]),
      context.activationInput.paymentRequired,
    );
    const handoffBeforeActivation = await httpsExchange(firstRoute, {
      path: HANDOFF_CHALLENGE_TARGET,
    });
    assert.equal(handoffBeforeActivation.statusCode, 503);

    stage('SERVICE_ACTIVATION');
    const firstActivation = await firstPilot.pilot.activateCommittedReady(
      context.activationInput,
    );
    context.resources.setOwnerStores(firstPilot.pilot, [
      context.serviceStore,
      context.observerStore,
    ]);
    assertFrozenStatus(firstActivation, 'ACTIVE');
    assert.equal(context.serviceStore.load().state.grants.length, 1);
    const grant = await obtainGrant(firstRoute);
    assert.equal(grant.capabilityCommitment, selection().capabilityCommitment);
    const requestA = requestDescription(grant.grantId, 'request.funding-to-service.a');
    const authorizationA = serviceAuthorization(requestA, grant);
    const first = await httpsExchange(firstRoute, {
      headers: { Authorization: authorizationA },
    });
    assert.equal(first.statusCode, 200);
    assert.equal(executionCalls, 1);
    const afterFirst = context.serviceStore.load();
    assert.equal(afterFirst.state.grants.length, 1);
    assert.equal(afterFirst.state.grants[0].consumedUnits, 2);
    assert.equal(afterFirst.state.requests.length, 1);
    const replay = await httpsExchange(firstRoute, {
      headers: { Authorization: authorizationA },
    });
    assert.equal(replay.statusCode, 200);
    assert.deepEqual(replay.body, first.body);
    assert.deepEqual(context.serviceStore.load(), afterFirst);
    assert.equal(executionCalls, 1);

    stage('SERVICE_REOPEN');
    assertFrozenStatus(await context.resources.closeOwner(firstPilot.pilot), 'CLOSED');
    assert.equal(firstPilot.deadlines.transport.empty(), true);
    assert.equal(firstPilot.deadlines.handoff.empty(), true);
    await provePortReleased(firstPilot.port, context.resources);
    context.pilot = null;
    reopenServiceAndObserver(context);
    let reopenedExecutions = 0;
    const reopenedPilot = await startPilot(context, () => {
      reopenedExecutions += 1;
      return { resultCode: 'funding-to-service.offline.delivered' };
    });
    const reopenedRoute = Object.freeze({
      port: reopenedPilot.port,
      cert: reopenedPilot.cert,
      resources: context.resources,
    });
    const reopenedActivation = await reopenedPilot.pilot.activateCommittedReady(
      context.activationInput,
    );
    context.resources.setOwnerStores(reopenedPilot.pilot, [
      context.serviceStore,
      context.observerStore,
    ]);
    assertFrozenStatus(reopenedActivation, 'ACTIVE');
    const reopenedReplay = await httpsExchange(reopenedRoute, {
      headers: { Authorization: authorizationA },
    });
    assert.equal(reopenedReplay.statusCode, 200);
    assert.deepEqual(reopenedReplay.body, first.body);
    assert.equal(reopenedExecutions, 0);
    assert.equal(paymentSignatureCount, retainedSigningCount);
    assert.equal(context.serviceStore.load().state.grants.length, 1);
    assert.equal(context.serviceStore.load().state.requests.length, 1);

    const requestB = requestDescription(grant.grantId, 'request.funding-to-service.b');
    const second = await httpsExchange(reopenedRoute, {
      headers: { Authorization: serviceAuthorization(requestB, grant) },
    });
    assert.equal(second.statusCode, 200);
    assert.equal(reopenedExecutions, 1);
    assert.equal(context.serviceStore.load().state.grants.length, 1);
    assert.equal(context.serviceStore.load().state.requests.length, 2);
    assert.equal(context.serviceStore.load().state.grants[0].consumedUnits, 4);
    assert.equal(paymentSignatureCount, retainedSigningCount);
    assertFrozenStatus(await context.resources.closeOwner(reopenedPilot.pilot), 'CLOSED');
    assert.equal(reopenedPilot.deadlines.transport.empty(), true);
    assert.equal(reopenedPilot.deadlines.handoff.empty(), true);
    await provePortReleased(reopenedPilot.port, context.resources);
    context.pilot = null;
  } finally {
    await context.cleanup();
  }
});

test('ACKNOWLEDGED and UNKNOWN publication reopen without republishing or authorizing service', async (t, stage) => {
  for (const mode of ['unknown', 'acknowledged']) {
    const caseSigningBaseline = paymentSignatureCount;
    const context = await createBoundContext(t, { loseFirstResponse: false, stage });
    const retainedSigningCount = caseSigningBaseline + 1;
    assert.equal(paymentSignatureCount, retainedSigningCount);
    try {
      stage(mode === 'unknown' ? 'UNKNOWN' : 'ACKNOWLEDGED');
      assertBoundIdentity(context);
      openObservation(context);
      stage(`${mode.toUpperCase()}_CONSTRUCT`);
      const bridge = createPublicationBridge(context, mode);
      stage(`${mode.toUpperCase()}_RECOVER`);
      assert.deepEqual(await bridge.recover(), { status: 'RECOVERED' });
      stage(`${mode.toUpperCase()}_SETTLE`);
      const first = await bridge.settleBound();
      stage(`${mode.toUpperCase()}_RESULT`);
      const expectedState = mode === 'unknown'
        ? EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN
        : EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED;
      assert.deepEqual(first, {
        status: 'RECONCILIATION_REQUIRED',
        evidenceState: expectedState,
      });
      assertExactLookupActivity(context);
      assert.equal(context.node.publications.length, 1);
      assert.equal(paymentSignatureCount, retainedSigningCount);
      const retained = await context.journal.get(
        context.preflight.authorizationKey,
        context.preflight.transactionHash,
      );
      assert.equal(retained.evidenceState, expectedState);
      assert.deepEqual(retained.signedAccountBlock, context.payment.payload.transaction);
      const frontierBefore = context.node.frontier;
      const unconfirmedBefore = context.node.unconfirmed;
      for (let replay = 0; replay < 2; replay += 1) {
        stage(`${mode.toUpperCase()}_REPLAY`);
        const reopened = nextPublicationBridge(context);
        assert.deepEqual(await reopened.recover(), { status: 'RECOVERED' });
        assert.deepEqual(await reopened.settleBound(), first);
      }
      assert.equal(context.node.publications.length, 1);
      assert.equal(context.node.frontier, frontierBefore);
      assert.equal(context.node.unconfirmed, unconfirmedBefore);
      assert.equal(paymentSignatureCount, retainedSigningCount);
      assertNoEconomicAuthority(context);
      assert.equal(context.observerStore.peekPreparedAttestation(), null);

      context.node.include = true;
      stage(`${mode.toUpperCase()}_RECONCILE`);
      const reconciliationBridge = nextPublicationBridge(context);
      stage(`${mode.toUpperCase()}_RECONCILE_RECOVER`);
      assert.deepEqual(await reconciliationBridge.recover(), { status: 'RECOVERED' });
      stage(`${mode.toUpperCase()}_RECONCILE_SETTLE`);
      const reconciled = await reconciliationBridge.settleBound();
      stage(`${mode.toUpperCase()}_RECONCILE_RESULT`);
      assert.equal(reconciled.status, 'INCLUDED');
      assertExactLookupActivity(context);
      stage(`${mode.toUpperCase()}_RECONCILE_PUBLICATION_COUNT`);
      assert.equal(context.node.publications.length, 1);
      stage(`${mode.toUpperCase()}_RECONCILE_BLOCK`);
      assert.deepEqual(context.node.publications[0], context.payment.payload.transaction);
      stage(`${mode.toUpperCase()}_RECONCILE_OBSERVATION`);
      prepareObservation(context, stage);
      assertNoEconomicAuthority(context);
      assert.equal(paymentSignatureCount, retainedSigningCount);
    } finally {
      await context.cleanup();
    }
  }
});
